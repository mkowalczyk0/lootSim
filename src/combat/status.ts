/**
 * Status effects — one framework for every timed thing that sits on an actor.
 *
 * A burn, a bleed, a stun, a curse, an armour shred, a Bard's damage buff on an ally:
 * mechanically these are the same object. Each has a duration, a stack count, a
 * source, and a set of things it does while it is there. Making them one system is
 * what lets a tree node say "your bleeds last longer" without a bespoke bleed timer,
 * and what lets a buff land on a party member through the exact same code that lands a
 * debuff on a monster.
 *
 * DoTs are not special. A DoT is a status with `category: "dot"`, a `dps` and a
 * `tickInterval`; the container ticks it. There is deliberately no separate
 * "damage over time" subsystem.
 *
 * Simulation-adjacent but DOM-free and dungeon-free: the container calls back to the
 * host for anything that touches the world (dealing the tick's damage, firing an
 * on-expire effect), so both the real dungeon and the headless test drive it.
 */

import { addMods, zeroMods, type Mods } from "../data/mods";
import type { DamageChannel, DamagePacket, DamageType } from "./damage";
import { makeDamagePacket } from "./damage";
import type { SkillTag } from "./tags";

export type StatusId = string;

export type StatusCategory = "dot" | "debuff" | "cc" | "buff" | "curse";

/**
 * How a re-application interacts with an instance that is already running:
 * - `refresh`  — reset the duration to full, add a stack (burn, poison)
 * - `extend`   — add the new duration on top of what is left, capped
 * - `strongest`— keep whichever instance is bigger, don't stack (chill)
 * - `stack`    — add a stack, keep the longer remaining time
 * - `ignore`   — the first application wins until it expires
 */
export type RefreshRule = "refresh" | "extend" | "strongest" | "stack" | "ignore";

/**
 * Whether a damaging status locks its per-tick damage in at application time
 * (`snapshot`, the default and usually correct) or recomputes it from the source's
 * current stats every tick (`dynamic`).
 */
export type SnapshotRule = "snapshot" | "dynamic";

export interface StatusSpec {
  id: StatusId;
  label: string;
  /** Single-letter HUD badge — there are no art assets. */
  glyph: string;
  category: StatusCategory;
  tags?: readonly SkillTag[];

  baseDuration: number;
  maxStacks: number;
  refreshRule: RefreshRule;

  // --- damaging statuses (dot / some curses) ---
  /** Damage per second, per stack, as a fraction of the hit that applied it. */
  dps?: number;
  tickInterval?: number;
  damageType?: DamageType;
  damageChannel?: DamageChannel;
  snapshotRule?: SnapshotRule;

  // --- control / debuff riders ---
  /** Movement multiplier while active. Product across instances. 1 = no slow. */
  slow?: number;
  /** Hard disables. A stun sets all three; a silence just `cast`. */
  disables?: { move?: boolean; attack?: boolean; cast?: boolean };
  /** Multiplies damage the victim *takes*. Vulnerable, shock, exposed. */
  amplify?: number;
  /** Multiplies damage the victim *deals*. Weakened. (<1 to weaken.) */
  weaken?: number;
  /** Forces the victim to target the source. */
  taunt?: boolean;
  /** Mana torn per second, per stack. */
  manaBurn?: number;

  // --- buff payload ---
  /** Mods folded into the bearer's aggregate while active (scaled by stacks). */
  mods?: Partial<Mods>;

  // --- application & removal ---
  /** Base chance to land before the target's resistance, 0..1. Abilities override. */
  applyChance?: number;
  /** Effect id fired when the status runs out on its own (Doom's culminating blast). */
  onExpire?: string;
  /** Effect id fired when the status is consumed / detonated by an ability. */
  onDetonate?: string;
  /** May this status jump to nearby actors when its bearer dies? */
  spreadOnDeath?: boolean;
  /** Cannot be cleansed / dispelled. */
  unremovable?: boolean;
  /**
   * While active, a hit that would drop the bearer below 1 HP instead leaves them
   * at 1 and (optionally) fires `onExpire` — the "cannot fall below 1 HP briefly"
   * rule. Berserker's Last Stand puts it on the self; Paladin's Last Light puts it
   * on every nearby ally. The host reads `guardsDeath` in its damage resolver; the
   * container just reports it.
   */
  guardsDeath?: boolean;
}

// --- the baseline registry --------------------------------------------------

/**
 * The statuses every class can assume exist. Classes add their own (Skewered,
 * Soul Debt, Rhythm) through `registerStatus`; nothing here is class-specific.
 */
const BASELINE: StatusSpec[] = [
  {
    id: "bleed", label: "Bleeding", glyph: "b", category: "dot", tags: ["bleed", "physical"],
    baseDuration: 4, maxStacks: 8, refreshRule: "refresh",
    dps: 0.14, tickInterval: 0.5, damageType: "physical", damageChannel: "dot",
  },
  {
    id: "burn", label: "Burning", glyph: "B", category: "dot", tags: ["burn", "fire"],
    baseDuration: 3.2, maxStacks: 3, refreshRule: "refresh",
    dps: 0.3, tickInterval: 0.5, damageType: "fire", damageChannel: "dot",
  },
  {
    id: "poison", label: "Poisoned", glyph: "P", category: "dot", tags: ["poison", "nature"],
    baseDuration: 5.5, maxStacks: 5, refreshRule: "stack",
    dps: 0.14, tickInterval: 0.5, damageType: "poison", damageChannel: "dot", slow: 0.92,
  },
  {
    id: "corruption", label: "Corrupted", glyph: "x", category: "dot", tags: ["corruption", "void"],
    baseDuration: 6, maxStacks: 6, refreshRule: "stack",
    dps: 0.1, tickInterval: 0.5, damageType: "void", damageChannel: "dot", amplify: 1.05,
  },
  {
    id: "chill", label: "Chilled", glyph: "c", category: "cc", tags: ["frost", "crowdControl"],
    baseDuration: 2.8, maxStacks: 1, refreshRule: "strongest", slow: 0.55,
  },
  {
    id: "freeze", label: "Frozen", glyph: "F", category: "cc", tags: ["frost", "crowdControl"],
    baseDuration: 1.4, maxStacks: 1, refreshRule: "refresh",
    disables: { move: true, attack: true, cast: true },
  },
  {
    id: "shock", label: "Shocked", glyph: "S", category: "debuff", tags: ["lightning"],
    baseDuration: 3, maxStacks: 1, refreshRule: "strongest", amplify: 1.28,
  },
  {
    id: "curse", label: "Cursed", glyph: "C", category: "curse", tags: ["curse", "void"],
    baseDuration: 8, maxStacks: 1, refreshRule: "refresh", amplify: 1.15,
  },
  {
    id: "doom", label: "Doomed", glyph: "D", category: "curse", tags: ["curse", "void"],
    baseDuration: 6, maxStacks: 1, refreshRule: "ignore", onExpire: "doomBlast",
  },
  {
    id: "mark", label: "Marked", glyph: "M", category: "debuff", tags: ["mark"],
    baseDuration: 12, maxStacks: 1, refreshRule: "refresh",
  },
  {
    id: "vulnerable", label: "Vulnerable", glyph: "V", category: "debuff", tags: ["vulnerable"],
    baseDuration: 6, maxStacks: 1, refreshRule: "refresh", amplify: 1.2,
  },
  {
    id: "weakened", label: "Weakened", glyph: "w", category: "debuff",
    baseDuration: 6, maxStacks: 1, refreshRule: "refresh", weaken: 0.7,
  },
  {
    id: "exposed", label: "Exposed", glyph: "e", category: "debuff", tags: ["vulnerable"],
    baseDuration: 8, maxStacks: 1, refreshRule: "refresh", amplify: 1.15,
  },
  {
    id: "rooted", label: "Rooted", glyph: "r", category: "cc", tags: ["crowdControl"],
    baseDuration: 2, maxStacks: 1, refreshRule: "refresh", disables: { move: true },
  },
  {
    id: "stunned", label: "Stunned", glyph: "!", category: "cc", tags: ["crowdControl", "interrupt"],
    baseDuration: 1.2, maxStacks: 1, refreshRule: "refresh",
    disables: { move: true, attack: true, cast: true },
  },
  {
    id: "silenced", label: "Silenced", glyph: "s", category: "cc", tags: ["crowdControl", "interrupt"],
    baseDuration: 3, maxStacks: 1, refreshRule: "refresh", disables: { cast: true },
  },
  {
    id: "blinded", label: "Blinded", glyph: "o", category: "debuff", tags: ["crowdControl"],
    baseDuration: 3, maxStacks: 1, refreshRule: "refresh", weaken: 0.55,
  },
  {
    id: "taunted", label: "Taunted", glyph: "t", category: "cc", tags: ["taunt", "crowdControl"],
    baseDuration: 3, maxStacks: 1, refreshRule: "refresh", taunt: true,
  },
  {
    id: "stealth", label: "Hidden", glyph: "h", category: "buff", tags: ["stealth"],
    baseDuration: 6, maxStacks: 1, refreshRule: "refresh",
  },
  {
    // Granted by a `benefit: "haste"` zone (Bard's march, Shaman's Windfavor, Lancer's
    // Warcry) — a short attack/move-speed buff re-applied while you stand in it.
    id: "hasted", label: "Hasted", glyph: "»", category: "buff",
    baseDuration: 2, maxStacks: 1, refreshRule: "refresh",
    mods: { attackSpeed: 0.25, moveSpeed: 0.18 },
  },
];

const REGISTRY = new Map<StatusId, StatusSpec>();
for (const spec of BASELINE) REGISTRY.set(spec.id, spec);

/** Adds or replaces a status definition. Class content calls this at module load. */
export function registerStatus(spec: StatusSpec): void {
  REGISTRY.set(spec.id, spec);
}

export function getStatusSpec(id: StatusId): StatusSpec | undefined {
  return REGISTRY.get(id);
}

export function allStatusIds(): StatusId[] {
  return [...REGISTRY.keys()];
}

// --- live instances --------------------------------------------------------

export interface StatusInstance {
  id: StatusId;
  remaining: number;
  stacks: number;
  /** Per-stack, per-second damage, resolved at apply time for a snapshot status. */
  tickDamage: number;
  tickTimer: number;
  sourceActorId: number;
  sourceAbilityId?: string;
  /** Ailment-potency multiplier that was in effect when this landed. */
  potency: number;
}

export interface ApplyOptions {
  hitDamage?: number;
  potency?: number;
  sourceActorId: number;
  sourceAbilityId?: string;
  durationMult?: number;
  /** Override the spec's application chance (an ability that "always" applies). */
  chance?: number;
  /** The target's resistance to this status, 0..1. Multiplies against the chance. */
  resistance?: number;
  /** 0..1 roll, injected for determinism. Defaults to Math.random. */
  roll?: () => number;
  /** Extra stacks to add on top of the usual one. */
  stacks?: number;
}

/** What the container needs from the world to resolve a tick or an expiry. */
export interface StatusTickContext {
  onDamage(packet: DamagePacket): void;
  fireEffect?(effectId: string, instance: StatusInstance, spec: StatusSpec): void;
  /** Recompute a dynamic status's per-stack dps from the source's current stats. */
  currentDps?(instance: StatusInstance, spec: StatusSpec): number;
}

/**
 * Every status on one actor. `actorId` is the bearer; it is stamped on tick packets
 * as the *victim*, not the source.
 */
export class StatusContainer {
  readonly list: StatusInstance[] = [];
  private immunities = new Set<StatusId>();

  constructor(readonly actorId: number) {}

  // --- queries ---
  has(id: StatusId): boolean {
    return this.list.some((s) => s.id === id);
  }
  get(id: StatusId): StatusInstance | undefined {
    return this.list.find((s) => s.id === id);
  }
  stacksOf(id: StatusId): number {
    return this.get(id)?.stacks ?? 0;
  }
  /** True when any damaging DoT is currently running — the "afflicted" test. */
  get afflicted(): boolean {
    return this.list.some((s) => {
      const spec = REGISTRY.get(s.id);
      return spec?.category === "dot";
    });
  }

  // --- immunity ---
  grantImmunity(id: StatusId): void {
    this.immunities.add(id);
    this.remove(id);
  }
  clearImmunity(id: StatusId): void {
    this.immunities.delete(id);
  }
  isImmune(id: StatusId): boolean {
    return this.immunities.has(id);
  }

  // --- application ---
  /**
   * Tries to apply a status. Returns true if it landed. Handles the application
   * chance, the target's resistance, immunity, and the spec's refresh rule.
   */
  apply(id: StatusId, opts: ApplyOptions): boolean {
    const spec = REGISTRY.get(id);
    if (!spec) return false;
    if (this.isImmune(id)) return false;

    const roll = opts.roll ?? Math.random;
    const baseChance = opts.chance ?? spec.applyChance ?? 1;
    const chance = baseChance * (1 - clamp01(opts.resistance ?? 0));
    if (chance < 1 && roll() > chance) return false;

    const potency = opts.potency ?? 1;
    const duration = spec.baseDuration * (opts.durationMult ?? 1);
    const perStackDps = (spec.dps ?? 0) * (opts.hitDamage ?? 0) * potency;
    const addStacks = 1 + Math.max(0, opts.stacks ?? 0);

    const existing = this.get(id);
    if (existing) {
      this.reapply(existing, spec, duration, perStackDps, addStacks, potency, opts);
      return true;
    }

    const instance: StatusInstance = {
      id,
      remaining: duration,
      stacks: Math.min(spec.maxStacks, addStacks),
      tickDamage: perStackDps,
      tickTimer: spec.tickInterval ?? 0,
      sourceActorId: opts.sourceActorId,
      potency,
    };
    if (opts.sourceAbilityId) instance.sourceAbilityId = opts.sourceAbilityId;
    this.list.push(instance);
    return true;
  }

  private reapply(
    inst: StatusInstance,
    spec: StatusSpec,
    duration: number,
    perStackDps: number,
    addStacks: number,
    potency: number,
    opts: ApplyOptions,
  ): void {
    switch (spec.refreshRule) {
      case "ignore":
        return;
      case "strongest":
        if (perStackDps > inst.tickDamage) {
          inst.tickDamage = perStackDps;
          inst.remaining = duration;
          inst.potency = potency;
          inst.sourceActorId = opts.sourceActorId;
        } else {
          inst.remaining = Math.max(inst.remaining, duration);
        }
        return;
      case "extend":
        inst.remaining = Math.min(spec.baseDuration * 2, inst.remaining + duration);
        inst.stacks = Math.min(spec.maxStacks, inst.stacks + addStacks);
        inst.tickDamage = Math.max(inst.tickDamage, perStackDps);
        return;
      case "stack":
        inst.remaining = Math.max(inst.remaining, duration);
        inst.stacks = Math.min(spec.maxStacks, inst.stacks + addStacks);
        inst.tickDamage = Math.max(inst.tickDamage, perStackDps);
        return;
      case "refresh":
      default:
        inst.remaining = Math.max(inst.remaining, duration);
        inst.stacks = Math.min(spec.maxStacks, inst.stacks + addStacks);
        inst.tickDamage = Math.max(inst.tickDamage, perStackDps);
        inst.sourceActorId = opts.sourceActorId;
        return;
    }
  }

  // --- removal ---
  private remove(id: StatusId): StatusInstance | undefined {
    const i = this.list.findIndex((s) => s.id === id);
    if (i < 0) return undefined;
    return this.list.splice(i, 1)[0];
  }

  /**
   * Strips statuses. With no filter, everything removable goes. `category` or
   * explicit `ids` narrow it. Returns what was removed, so a "cleanse turns curses
   * into healing" effect can see them.
   */
  cleanse(filter?: { category?: StatusCategory; ids?: StatusId[] }): StatusInstance[] {
    const removed: StatusInstance[] = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const inst = this.list[i]!;
      const spec = REGISTRY.get(inst.id);
      if (!spec || spec.unremovable) continue;
      if (filter?.ids && !filter.ids.includes(inst.id)) continue;
      if (filter?.category && spec.category !== filter.category) continue;
      removed.push(...this.list.splice(i, 1));
    }
    return removed;
  }

  /**
   * Removes a status and fires its `onDetonate` effect. This is how "Rupture Vein
   * detonates your curses" or "kills spread and explode Bleed" work — consume the
   * instance, hand the effect id and the instance to the host.
   */
  consume(id: StatusId, ctx?: StatusTickContext): StatusInstance | undefined {
    const inst = this.remove(id);
    if (!inst) return undefined;
    const spec = REGISTRY.get(id);
    if (spec?.onDetonate && ctx?.fireEffect) ctx.fireEffect(spec.onDetonate, inst, spec);
    return inst;
  }

  // --- spread ---
  /**
   * Copies matching statuses onto other containers (nearby actors). Used by
   * spread-on-death and by abilities that explicitly propagate a plague. The caller
   * decides who is "nearby"; this just does the copy at a fraction of the remaining
   * time.
   */
  spreadTo(targets: StatusContainer[], filter: { ids?: StatusId[] }, keepFraction = 0.6): void {
    for (const inst of this.list) {
      if (filter.ids && !filter.ids.includes(inst.id)) continue;
      const spec = REGISTRY.get(inst.id);
      if (!spec) continue;
      for (const t of targets) {
        if (t === this) continue;
        t.apply(inst.id, {
          hitDamage: 0,
          potency: inst.potency,
          sourceActorId: inst.sourceActorId,
          ...(inst.sourceAbilityId ? { sourceAbilityId: inst.sourceAbilityId } : {}),
          chance: 1,
        });
        const copy = t.get(inst.id);
        if (copy) {
          copy.tickDamage = Math.max(copy.tickDamage, inst.tickDamage);
          copy.remaining = Math.max(copy.remaining, inst.remaining * keepFraction);
        }
      }
    }
  }

  // --- tick ---
  /**
   * Advances every status. DoT ticks call `ctx.onDamage` on the `dot` channel;
   * naturally-expiring statuses with an `onExpire` fire it through `ctx.fireEffect`.
   * No status owns its own timer outside this method.
   */
  tick(dt: number, ctx: StatusTickContext): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const inst = this.list[i]!;
      const spec = REGISTRY.get(inst.id);
      if (!spec) {
        this.list.splice(i, 1);
        continue;
      }
      inst.remaining -= dt;

      if (spec.dps && spec.tickInterval) {
        inst.tickTimer -= dt;
        if (inst.tickTimer <= 0) {
          inst.tickTimer += spec.tickInterval;
          const perStack =
            spec.snapshotRule === "dynamic" && ctx.currentDps
              ? ctx.currentDps(inst, spec)
              : inst.tickDamage;
          const amount = perStack * inst.stacks * spec.tickInterval;
          if (amount > 0) {
            ctx.onDamage(
              makeDamagePacket({
                amount,
                type: spec.damageType ?? "physical",
                channel: spec.damageChannel ?? "dot",
                source: {
                  actorId: inst.sourceActorId,
                  actorKind: "hero",
                  ...(inst.sourceAbilityId ? { abilityId: inst.sourceAbilityId } : {}),
                  ...(spec.tags ? { tags: spec.tags } : {}),
                },
              }),
            );
          }
        }
      }

      if (inst.remaining <= 0) {
        this.list.splice(i, 1);
        if (spec.onExpire && ctx.fireEffect) ctx.fireEffect(spec.onExpire, inst, spec);
      }
    }
  }

  // --- aggregates the simulation reads every frame ---
  slowMultiplier(): number {
    let m = 1;
    for (const s of this.list) m *= REGISTRY.get(s.id)?.slow ?? 1;
    return m;
  }
  /** Damage-taken multiplier — vulnerable, shock, exposed, curse. */
  incomingDamageMultiplier(): number {
    let m = 1;
    for (const s of this.list) m *= REGISTRY.get(s.id)?.amplify ?? 1;
    return m;
  }
  /** Damage-dealt multiplier — weakened, blinded. */
  outgoingDamageMultiplier(): number {
    let m = 1;
    for (const s of this.list) m *= REGISTRY.get(s.id)?.weaken ?? 1;
    return m;
  }
  disables(): { move: boolean; attack: boolean; cast: boolean } {
    const out = { move: false, attack: false, cast: false };
    for (const s of this.list) {
      const d = REGISTRY.get(s.id)?.disables;
      if (!d) continue;
      if (d.move) out.move = true;
      if (d.attack) out.attack = true;
      if (d.cast) out.cast = true;
    }
    return out;
  }
  manaBurnPerSecond(): number {
    let total = 0;
    for (const s of this.list) total += (REGISTRY.get(s.id)?.manaBurn ?? 0) * s.stacks;
    return total;
  }
  /** True while any active status guards the bearer against a killing blow. */
  get deathGuarded(): boolean {
    return this.list.some((s) => REGISTRY.get(s.id)?.guardsDeath === true);
  }
  /** Who this actor is forced to attack, if anyone (last taunt wins). */
  tauntSource(): number | undefined {
    let src: number | undefined;
    for (const s of this.list) {
      if (REGISTRY.get(s.id)?.taunt) src = s.sourceActorId;
    }
    return src;
  }
  /** Sum of every active buff/threshold status's mod payload, scaled by stacks. */
  modsContribution(): Mods {
    const out = zeroMods();
    for (const s of this.list) {
      const spec = REGISTRY.get(s.id);
      if (!spec?.mods) continue;
      for (let n = 0; n < s.stacks; n++) addMods(out, spec.mods);
    }
    return out;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
