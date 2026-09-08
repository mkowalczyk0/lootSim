/**
 * Resources — the generic version of "the bar under your health".
 *
 * Mana is one instance of this, not the model itself. A Berserker's Rage fills from
 * damage taken and bleeds away out of combat; a Monk's Chi is spent in small change on
 * every strike; a Necromancer's Corpses are a countable pile; a Lancer's Momentum
 * overflows into movement speed. All of that is the same `ResourceSpec` with different
 * numbers, and the ultimate meter is just a resource with `isUltimateMeter: true`.
 *
 * THE ULTIMATE RULE lives here: a generation event carrying a packet that came from an
 * ultimate is refused unless the rule opts in with `allowFromUltimate`.
 *
 * Pure logic. The pool calls back to a context for anything world-facing (firing a
 * threshold's effect, spilling overflow into another pool).
 */

import { addMods, zeroMods, type Mods } from "../data/mods";
import { isUltimateSourced, type DamagePacket } from "./damage";
import type { SkillTag } from "./tags";
import { hasAnyTag } from "./tags";

export type ResourceId = string;

export type ResourceUi = "bar" | "pips" | "charges" | "meter" | "hidden";

/**
 * The events a resource can react to. These line up with the combat event bus
 * (`triggers.ts`) so a class's whole generation model is a list of rules, not code.
 */
export type ResourceEventType =
  | "kill"
  | "enemyDeath"
  | "summonDeath"
  | "corpseCreated"
  | "crit"
  | "hitDealt"
  | "hitTaken"
  | "damageDealt"
  | "damageTaken"
  | "damagePrevented"
  | "manaSpent"
  | "resourceSpent"
  | "ailmentInflicted"
  | "statusApplied"
  | "dashStart"
  | "skillUse"
  | "ultimateUse"
  | "dodge"
  | "block"
  | "move"
  | "enterCombat"
  | "leaveCombat";

export interface ResourceGenRule {
  on: ResourceEventType;
  amount: number;
  /**
   * Scales `amount` by a quantity carried on the event:
   * - `damage`            — × raw damage of the event's packet
   * - `maxHealthFraction` — × (damage / maxHealth), for "per health lost"
   * - `manaFraction`      — × (mana spent / maxMana)
   * - `distance`          — × units moved this tick
   */
  perUnit?: "damage" | "maxHealthFraction" | "manaFraction" | "distance";
  /** Only fire when the event's ability carries one of these tags. */
  requireTags?: readonly SkillTag[];
  /**
   * THE ULTIMATE RULE opt-out. Default is `false` — an ultimate-sourced event never
   * generates. A class that genuinely wants an exception sets this to `true`, on
   * purpose, in data.
   */
  allowFromUltimate?: boolean;
}

export interface ResourceThreshold {
  /** Trigger level. Absolute by default; a 0..1 fraction of max when `fraction`. */
  at: number;
  fraction?: boolean;
  /** Effect id fired the moment the value crosses this upward. */
  onCross?: string;
  /** Effect id fired when the value drops back below. */
  onFall?: string;
  /** Mods folded into the bearer's aggregate for as long as the value stays at/above. */
  whileAbove?: Partial<Mods>;
  /** Fire `onCross` only once per run, not every time it is re-crossed. */
  once?: boolean;
}

export type OverflowRule =
  | "cap"
  | "spill"
  | { toResource: ResourceId; ratio: number }
  | { effect: string };

export interface ResourceSpec {
  id: ResourceId;
  label: string;
  max: number;
  start: "empty" | "full" | number;
  regenPerSec?: number;
  decayPerSec?: number;
  /** Seconds without a generation event before `decayPerSec` kicks in (out-of-combat bleed). */
  decayDelay?: number;
  /**
   * Decay stops here instead of at zero, so a decaying pool can never leave its class
   * unable to act. A pool already *below* its floor is left alone — the floor clamps the
   * bleed, it never tops anything up, so `start: "empty"` still means empty.
   */
  decayFloor?: number;
  generation?: readonly ResourceGenRule[];
  thresholds?: readonly ResourceThreshold[];
  overflow?: OverflowRule;
  ui: ResourceUi;
  /**
   * A temporary resource evaporates the instant it hits zero and cannot be filled
   * again for the rest of the encounter (a one-shot Overcharge, a Riposte window).
   */
  temporary?: boolean;
  /**
   * Spending may dip into the bearer's health when the pool is short, at this
   * health-per-missing-point ratio (Blood Price, Arcane Overload).
   */
  healthConversion?: { ratio: number };
  /** This pool is an ultimate charge meter — hard-blocks ultimate-sourced generation. */
  isUltimateMeter?: boolean;
}

// --- the event a rule sees -------------------------------------------------

export interface ResourceEvent {
  type: ResourceEventType;
  /** The damage packet behind the event, if any — carries source, tags, ultimate flag. */
  packet?: DamagePacket;
  /** Tags of the ability behind the event, when there is no packet (a movement skill). */
  tags?: readonly SkillTag[];
  /** Whether the ability behind this event was an ultimate (for tagless events). */
  fromUltimate?: boolean;
  /** Raw damage amount, for `perUnit: "damage"`. */
  damage?: number;
  /** For `perUnit: "maxHealthFraction"`. */
  maxHealth?: number;
  /** Mana spent / max mana, for `perUnit: "manaFraction"`. */
  manaSpent?: number;
  maxMana?: number;
  /** Units moved, for `perUnit: "distance"`. */
  distance?: number;
  /** Generic magnitude for events that carry one (resource spent, threshold amount). */
  amount?: number;
}

export interface ResourceContext {
  fireEffect?(effectId: string, resource: ResourcePool): void;
  /** Resolve a sibling pool, for `overflow: { toResource }`. */
  pool?(id: ResourceId): ResourcePool | undefined;
  /** Drain the bearer's health for `healthConversion`. Returns health actually spent. */
  spendHealth?(amount: number): number;
}

// --- runtime -------------------------------------------------------------

export interface SpendResult {
  paid: boolean;
  fromResource: number;
  fromHealth: number;
}

/** One live resource on one actor. */
export class ResourcePool {
  value: number;
  max: number;
  /** Set once when a temporary resource has been used up. */
  spent = false;
  private sinceGen = 0;
  private crossed = new Set<number>();
  private firedOnce = new Set<number>();

  constructor(readonly spec: ResourceSpec) {
    this.max = spec.max;
    this.value =
      spec.start === "empty" ? 0 : spec.start === "full" ? spec.max : clamp(spec.start, 0, spec.max);
  }

  get fraction(): number {
    return this.max <= 0 ? 0 : this.value / this.max;
  }

  // --- direct changes ---
  add(amount: number, ctx: ResourceContext = {}): void {
    if (amount <= 0) return;
    if (this.spec.temporary && this.spent) return;
    this.sinceGen = 0;
    const room = this.max - this.value;
    if (amount <= room) {
      this.value += amount;
      return;
    }
    this.value = this.max;
    this.handleOverflow(amount - room, ctx);
  }

  /**
   * Spends from the pool. Falls back to health if the spec allows and the pool is
   * short. Returns whether the cost was met and where it came from.
   */
  spend(amount: number, ctx: ResourceContext = {}): SpendResult {
    if (amount <= 0) return { paid: true, fromResource: 0, fromHealth: 0 };
    if (this.value >= amount) {
      this.value -= amount;
      this.afterSpend(ctx);
      return { paid: true, fromResource: amount, fromHealth: 0 };
    }
    const conv = this.spec.healthConversion;
    if (conv && ctx.spendHealth) {
      const fromResource = this.value;
      const shortfall = amount - fromResource;
      const health = ctx.spendHealth(shortfall * conv.ratio);
      this.value = 0;
      this.afterSpend(ctx);
      return { paid: health > 0, fromResource, fromHealth: health };
    }
    return { paid: false, fromResource: 0, fromHealth: 0 };
  }

  canAfford(amount: number): boolean {
    return this.value >= amount || (!!this.spec.healthConversion);
  }

  private afterSpend(ctx: ResourceContext): void {
    if (this.spec.temporary && this.value <= 0) this.spent = true;
    this.checkThresholds(ctx);
  }

  // --- event-driven generation ---
  /**
   * Walks the spec's generation rules against one event and adds whatever they grant.
   * This is the single choke point THE ULTIMATE RULE is enforced at.
   */
  handleEvent(evt: ResourceEvent, ctx: ResourceContext = {}): number {
    const rules = this.spec.generation;
    if (!rules) return 0;
    const ult = evt.packet ? isUltimateSourced(evt.packet) : evt.fromUltimate === true;
    let gained = 0;
    for (const rule of rules) {
      if (rule.on !== evt.type) continue;
      if (ult && !rule.allowFromUltimate) continue; // THE ULTIMATE RULE
      if (rule.requireTags) {
        const tags = evt.packet?.source.tags ?? evt.tags;
        if (!hasAnyTag(tags, rule.requireTags)) continue;
      }
      gained += this.ruleAmount(rule, evt);
    }
    if (gained > 0) this.add(gained, ctx);
    this.checkThresholds(ctx);
    return gained;
  }

  private ruleAmount(rule: ResourceGenRule, evt: ResourceEvent): number {
    switch (rule.perUnit) {
      case "damage":
        return rule.amount * (evt.damage ?? evt.packet?.amount ?? 0);
      case "maxHealthFraction":
        return rule.amount * ((evt.damage ?? 0) / Math.max(1, evt.maxHealth ?? 1));
      case "manaFraction":
        return rule.amount * ((evt.manaSpent ?? 0) / Math.max(1, evt.maxMana ?? 1));
      case "distance":
        return rule.amount * (evt.distance ?? 0);
      default:
        return rule.amount;
    }
  }

  // --- per-tick upkeep ---
  tick(dt: number, ctx: ResourceContext = {}): void {
    if (this.spec.temporary && this.spent) return;
    this.sinceGen += dt;

    if (this.spec.regenPerSec) this.add(this.spec.regenPerSec * dt, ctx);

    if (this.spec.decayPerSec) {
      const delay = this.spec.decayDelay ?? 0;
      if (this.sinceGen >= delay) {
        const floor = this.spec.decayFloor ?? 0;
        if (this.value > floor) {
          this.value = Math.max(floor, this.value - this.spec.decayPerSec * dt);
        }
        if (this.spec.temporary && this.value <= 0) this.spent = true;
      }
    }
    this.checkThresholds(ctx);
  }

  // --- thresholds ---
  private thresholdLevel(t: ResourceThreshold): number {
    return t.fraction ? t.at * this.max : t.at;
  }

  private checkThresholds(ctx: ResourceContext): void {
    const list = this.spec.thresholds;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!;
      const level = this.thresholdLevel(t);
      const above = this.value >= level;
      const was = this.crossed.has(i);
      if (above && !was) {
        this.crossed.add(i);
        if (t.onCross && ctx.fireEffect) {
          if (!t.once || !this.firedOnce.has(i)) {
            ctx.fireEffect(t.onCross, this);
            if (t.once) this.firedOnce.add(i);
          }
        }
      } else if (!above && was) {
        this.crossed.delete(i);
        if (t.onFall && ctx.fireEffect) ctx.fireEffect(t.onFall, this);
      }
    }
  }

  /** Mods contributed by every threshold the pool is currently at or above. */
  modsContribution(): Mods {
    const out = zeroMods();
    const list = this.spec.thresholds;
    if (!list) return out;
    for (const t of list) {
      if (t.whileAbove && this.value >= this.thresholdLevel(t)) addMods(out, t.whileAbove);
    }
    return out;
  }

  // --- overflow ---
  private handleOverflow(excess: number, ctx: ResourceContext): void {
    const rule = this.spec.overflow ?? "cap";
    if (rule === "cap" || rule === "spill") return; // "spill" = silently lost, but named
    if ("toResource" in rule) {
      const other = ctx.pool?.(rule.toResource);
      if (other) other.add(excess * rule.ratio, ctx);
      return;
    }
    if ("effect" in rule && ctx.fireEffect) ctx.fireEffect(rule.effect, this);
  }
}

// --- stances (a phase / weather / stance state) ---------------------------

/**
 * A stance is a resource that holds a *state* instead of a quantity: the Stormcaller's
 * Weather Phase (Rain / Wind / Thunder), a Swordsman stance, a Berserker's posture.
 * It advances by event or by an explicit `cycle`, each state can carry its own mods,
 * and other systems gate behaviour on `is(state)`. Kept next to `ResourcePool` because
 * it is the same idea — "the thing under the health bar" — with a discrete domain.
 */
export interface StanceSpec {
  id: ResourceId;
  label: string;
  /** The cycle of states, in order. `cycle()` walks this ring. */
  states: readonly string[];
  /** Starting index into `states`. Default 0. */
  start?: number;
  ui: "phase";
  /** Mods folded into the bearer's aggregate while in the named state. */
  stateMods?: Readonly<Record<string, Partial<Mods>>>;
  /** Events that advance the stance one step automatically. */
  cycleOn?: readonly ResourceEventType[];
}

export class StancePool {
  index: number;

  constructor(readonly spec: StanceSpec) {
    const n = spec.states.length;
    this.index = n > 0 ? ((spec.start ?? 0) % n + n) % n : 0;
  }

  get state(): string {
    return this.spec.states[this.index] ?? "";
  }
  is(state: string): boolean {
    return this.state === state;
  }
  /** Advance `steps` around the ring (negative goes back). */
  cycle(steps = 1): void {
    const n = this.spec.states.length;
    if (n === 0) return;
    this.index = ((this.index + steps) % n + n) % n;
  }
  set(state: string): boolean {
    const i = this.spec.states.indexOf(state);
    if (i < 0) return false;
    this.index = i;
    return true;
  }
  handleEvent(evt: ResourceEvent): void {
    if (this.spec.cycleOn?.includes(evt.type)) this.cycle(1);
  }
  modsContribution(): Mods {
    const out = zeroMods();
    const m = this.spec.stateMods?.[this.state];
    if (m) addMods(out, m);
    return out;
  }
}

/** A bag of pools on one actor, with helpers to broadcast an event to all of them. */
export class ResourceSet {
  private pools = new Map<ResourceId, ResourcePool>();
  private stances = new Map<ResourceId, StancePool>();

  constructor(specs: readonly ResourceSpec[] = [], stances: readonly StanceSpec[] = []) {
    for (const spec of specs) this.pools.set(spec.id, new ResourcePool(spec));
    for (const spec of stances) this.stances.set(spec.id, new StancePool(spec));
  }

  add(spec: ResourceSpec): ResourcePool {
    const pool = new ResourcePool(spec);
    this.pools.set(spec.id, pool);
    return pool;
  }
  get(id: ResourceId): ResourcePool | undefined {
    return this.pools.get(id);
  }
  has(id: ResourceId): boolean {
    return this.pools.has(id);
  }
  all(): ResourcePool[] {
    return [...this.pools.values()];
  }
  /** The pool flagged `isUltimateMeter`, if this class declares one. */
  ultimateMeter(): ResourcePool | undefined {
    for (const pool of this.pools.values()) {
      if (pool.spec.isUltimateMeter) return pool;
    }
    return undefined;
  }

  addStance(spec: StanceSpec): StancePool {
    const pool = new StancePool(spec);
    this.stances.set(spec.id, pool);
    return pool;
  }
  stance(id: ResourceId): StancePool | undefined {
    return this.stances.get(id);
  }
  allStances(): StancePool[] {
    return [...this.stances.values()];
  }

  private context(base: ResourceContext): ResourceContext {
    return { ...base, pool: (id) => this.pools.get(id) };
  }

  /** Feeds one event to every pool. Each pool applies THE ULTIMATE RULE for itself. */
  broadcast(evt: ResourceEvent, ctx: ResourceContext = {}): void {
    const c = this.context(ctx);
    for (const pool of this.pools.values()) pool.handleEvent(evt, c);
    for (const stance of this.stances.values()) stance.handleEvent(evt);
  }

  tick(dt: number, ctx: ResourceContext = {}): void {
    const c = this.context(ctx);
    for (const pool of this.pools.values()) pool.tick(dt, c);
  }

  /** Every pool's threshold mods plus every stance's state mods — folds into `Player.mods`. */
  modsContribution(): Mods {
    const out = zeroMods();
    for (const pool of this.pools.values()) addMods(out, pool.modsContribution());
    for (const stance of this.stances.values()) addMods(out, stance.modsContribution());
    return out;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
