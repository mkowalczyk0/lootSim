/**
 * The keystone / hybrid / Mythic-Archetype rule engine.
 *
 * `ResolvedBuild.rules` is a `Set<string>` of ids like `swordsman.ex.final_cut` or
 * `corsair.hybrid.boarding_hook` or `monk.mythic.infinite_motion`. A tree node, hybrid
 * or archetype adds one when it flips "a rule of the build" (spec §4.1) — something that
 * is not just a stat and not just an ability rewrite. Ability rewrites ride the
 * `mutations` list; tag/event effects ride `grants`; this file is the rest: the rules
 * that need the simulation to *do* something at a specific moment.
 *
 * The dungeon calls the hooks below at a handful of sites (a cast, a landed hit, a kill,
 * a hit taken, an avoided hit, once per tick). Each hook walks the caster's active rule
 * set and applies whatever that rule does through a small `RuleHost` the dungeon
 * implements. No hook branches on a class id — only on the rule id, which is data.
 *
 * Per-hero mutable state (counters, primed strikes, aura timers, recent-skill history)
 * lives on `HeroRuleState`, one per `Hero`, ticked with the rest of the sim.
 */

import type { Ability } from "../combat/index";
import type { Element } from "../data/elements";
import type { Enemy } from "./entities";
import type { Hero } from "./dungeon";
import type { RunEvent } from "./dungeon";

/** What a rule handler can ask the dungeon to do. Kept deliberately small. */
export interface RuleHost {
  now(): number;
  emit(ev: RunEvent): void;
  shake(amount: number): void;
  /** Enemies within `radius` of a point, nearest first. */
  enemiesAround(x: number, y: number, radius: number): Enemy[];
  /** Deal a hit to one enemy, credited to `hero` (kill/among/meter all flow to them). */
  hitEnemy(
    hero: Hero, e: Enemy, amount: number, element: Element,
    opts?: { crit?: boolean; ailment?: number; knockAngle?: number; fromUltimate?: boolean },
  ): number;
  /** Apply a hostile status to an enemy, attributed to `hero`. */
  afflict(hero: Hero, e: Enemy, statusId: string, opts?: { stacks?: number; duration?: number }): void;
  healHero(hero: Hero, amount: number): void;
  /** Top the ward up to at least `amount` and refresh its timer. */
  shieldHero(hero: Hero, amount: number): void;
  /** Every other hero on the floor (co-op); empty in a solo dive. */
  alliesOf(hero: Hero): Hero[];
  /** The lowest-health ally (or the hero themselves solo). */
  lowestAlly(hero: Hero): Hero;
}

const AURA_TICK = 0.5;

/** One hero's mutable rule bookkeeping. Reset per floor with the Hero. */
export class HeroRuleState {
  /** Ability ids used since the last repeat, newest last — for "distinct skill" rules. */
  readonly recentSkills: string[] = [];
  /** ids of skills cast this "beat", for alternation / three-distinct rules. */
  distinctStreak = 0;
  /** A pending empowered strike: the next qualifying hit consumes it. */
  primed: { crit: boolean; damageMult: number; interrupt: boolean; reason: string } | null = null;
  /** Rolling counters keyed by rule (every-Nth-attack, etc). */
  readonly counters = new Map<string, number>();
  /** Timers for periodic aura rules, keyed by rule id. */
  readonly auraTimers = new Map<string, number>();
  /** Generic cooldown gate for "once per few seconds" rules, keyed by rule id. */
  readonly gates = new Map<string, number>();
  /** Last skill element seen, for Spellblade "sword copies last spell". */
  lastSkillElement: Element | null = null;

  /** True and clears the gate if `seconds` have passed since it last fired. */
  gateReady(host: RuleHost, rule: string, seconds: number): boolean {
    const until = this.gates.get(rule) ?? 0;
    if (host.now() < until) return false;
    this.gates.set(rule, host.now() + seconds);
    return true;
  }

  bump(rule: string): number {
    const n = (this.counters.get(rule) ?? 0) + 1;
    this.counters.set(rule, n);
    return n;
  }
}

function has(rules: ReadonlySet<string>, id: string): boolean {
  return rules.has(id);
}

/** Every status id, across classes, that means "this one is my target". */
const MARK_STATUSES = ["mark", "reaped", "bounty", "contract", "exposed", "vindicated", "kings_challenge"];
function isMarked(e: Enemy): boolean {
  return MARK_STATUSES.some((s) => e.sc.has(s));
}
/** Any curse-family debuff — the id varies by class (curse / doom / corruption / hex / withering). */
const CURSE_STATUSES = ["curse", "doom", "corruption", "hex", "withering", "maledict", "blight", "decay"];
function isCursed(e: Enemy): boolean {
  return CURSE_STATUSES.some((s) => e.sc.has(s));
}
function isChilled(e: Enemy): boolean {
  return e.sc.has("chill") || e.sc.has("freeze");
}

/** The class's own Souls-like pool (Reaper's is `reaped_souls`, not `souls`). */
function soulPool(hero: Hero) {
  return hero.resources.get("souls") ?? hero.resources.get("reaped_souls") ?? hero.resources.get("harvested_souls");
}
/** Monk / Warden "Flow" is a stacking buff status, not a pool — 0..8. */
function flowStacks(hero: Hero): number {
  return hero.sc.stacksOf("flow");
}

/** Prime the next hit if nothing stronger is already queued. */
function prime(
  st: HeroRuleState,
  spec: { crit?: boolean; damageMult?: number; interrupt?: boolean; reason: string },
): void {
  const next = {
    crit: spec.crit ?? false,
    damageMult: spec.damageMult ?? 1,
    interrupt: spec.interrupt ?? false,
    reason: spec.reason,
  };
  if (!st.primed || next.damageMult >= st.primed.damageMult) st.primed = next;
}

// --- hooks -------------------------------------------------------------

/**
 * A skill (not the basic attack) was just cast. Track skill history for
 * "three distinct skills" / alternation rules and prime the follow-ups.
 */
export function rulesOnCast(host: RuleHost, hero: Hero, ability: Ability): void {
  const st = hero.ruleState;
  const rules = hero.player.build.rules;

  const last = st.recentSkills[st.recentSkills.length - 1];
  if (last === ability.id) {
    st.distinctStreak = 1;
  } else {
    st.distinctStreak++;
    st.recentSkills.push(ability.id);
    if (st.recentSkills.length > 6) st.recentSkills.shift();
  }

  // element carried by the skill's first damage step, for Spellblade
  const dmg = ability.effects.find((e) => e.kind === "damage");
  if (dmg && dmg.kind === "damage") st.lastSkillElement = dmg.damage.type ?? null;

  // "Cast three distinct skills in a row → free empowered strike"
  if (
    st.distinctStreak >= 3 &&
    (has(rules, "swordsman.moa.discipline") ||
      has(rules, "swordsman.hybrid.blade_dance") ||
      has(rules, "magician.archmage.grand_arcanist") ||
      has(rules, "duelist.tp.perfect_rhythm"))
  ) {
    prime(st, { crit: true, damageMult: 1.8, reason: "technique" });
    st.distinctStreak = 0;
    host.emit({ kind: "pickup", x: hero.avatar.x, y: hero.avatar.y - 30, label: "primed", color: hero.player.heroClass.color });
  }

  // Bard "Improvise" — a song not used recently grants a personal burst (approximated
  // as a primed strike so it reads without a full buff-status).
  if (has(rules, "bard.vt.improvise") && !st.recentSkills.slice(0, -1).includes(ability.id)) {
    prime(st, { damageMult: 1.3, reason: "improvise" });
  }
}

/**
 * `hero` just landed a hit on `e` (basic attack or skill). Return a multiplier and a
 * crit override the caller folds into the hit it is about to resolve, and run any
 * on-hit rule side effects.
 */
export function rulesOnHit(
  host: RuleHost,
  hero: Hero,
  e: Enemy,
  ctx: { isBasic: boolean; isCrit: boolean; movedRecently: boolean; outOfReach: boolean },
): { damageMult: number; forceCrit: boolean } {
  const st = hero.ruleState;
  const rules = hero.player.build.rules;
  let damageMult = 1;
  let forceCrit = false;

  // Consume a primed strike on the first qualifying hit.
  if (st.primed) {
    damageMult *= st.primed.damageMult;
    if (st.primed.crit) forceCrit = true;
    host.emit({ kind: "boom", x: e.x, y: e.y, radius: 26, color: hero.player.heroClass.color });
    st.primed = null;
  }

  // Swordsman "Sword Dance" / Duelist tempo — a hit right after moving always crits.
  if (ctx.movedRecently && (has(rules, "swordsman.db.sword_dance") || has(rules, "duelist.tp.on_the_beat"))) {
    forceCrit = true;
  }
  // Duelist "Elegant Violence" — a hit from outside reach always crits.
  if (ctx.outOfReach && has(rules, "duelist.fn.elegant_violence")) {
    forceCrit = true;
  }
  // Monk "Empty Mind" — a hit into an enemy's wind-up always crits and interrupts it.
  if (has(rules, "monk.ma.empty_mind") && e.windup > 0) {
    forceCrit = true;
    e.windup = 0;
    if (e.state === "windup") e.state = "active";
  }
  // Corsair "Six Shooter" — every sixth pistol shot crits and reloads.
  if (!ctx.isBasic && has(rules, "corsair.gs.six_shooter") && ctx.isCrit === false) {
    if (st.bump("corsair.gs.six_shooter") % 6 === 0) forceCrit = true;
  }

  return { damageMult, forceCrit };
}

/** `hero` killed `e`. Run kill-triggered rules. */
export function rulesOnKill(host: RuleHost, hero: Hero, e: Enemy): void {
  const st = hero.ruleState;
  const rules = hero.player.build.rules;
  const a = hero.avatar;

  // Swordsman "Final Cut" — killing a marked/exposed target refunds the burst skills.
  if (has(rules, "swordsman.ex.final_cut") && isMarked(e)) {
    hero.rt.reduceCooldowns(999, (id) => id.includes("masterstroke") || id.includes("swordflash"));
  }
  // Reaper "Endless Harvest" — a branded death brands the two nearest enemies.
  if (has(rules, "reaper.sh.endless_harvest") && isMarked(e)) {
    for (const near of host.enemiesAround(e.x, e.y, 160).slice(0, 2)) {
      host.afflict(hero, near, "reaped", { duration: 8 });
    }
  }
  // Warlock "Devour Soul" — a cursed kill refunds a chunk of mana and heals overkill.
  if (has(rules, "warlock.se.devour_soul") && isCursed(e)) {
    hero.player.restoreMana(hero.player.maxMana * 0.25);
    host.healHero(hero, hero.player.maxHealth * 0.06);
  }
  // Ranger "Winter's Predator" — killing a frozen quarry drops a chilling nova.
  if (has(rules, "ranger.ch.winters_predator") && isChilled(e)) {
    host.emit({ kind: "nova", x: e.x, y: e.y, radius: 90 });
    for (const near of host.enemiesAround(e.x, e.y, 90)) host.afflict(hero, near, "chill", { duration: 3 });
  }
  // Alchemist "Biological Collapse" — a max-Corroded death spreads full stacks.
  if (has(rules, "alchemist.tx.biological_collapse") && e.sc.has("sunder")) {
    for (const near of host.enemiesAround(e.x, e.y, 110)) host.afflict(hero, near, "sunder", { stacks: 5, duration: 6 });
    host.emit({ kind: "boom", x: e.x, y: e.y, radius: 90, color: "#8fbf5f" });
  }
  // Corsair "Black Market" — a Bounty kill stacks a permanent run bonus.
  if (has(rules, "corsair.th.black_market") && e.sc.has("bounty")) {
    st.bump("corsair.th.black_market");
  }
  // Berserker "Predator / Carnage Engine" — a kill refunds offensive cooldowns.
  if (has(rules, "berserker.predator.carnage_engine") || has(rules, "berserker.hybrid.butchers_rhythm")) {
    hero.rt.reduceCooldowns(1.5);
  }
  host.emit({ kind: "trail", x: a.x, y: a.y, color: hero.player.heroClass.color });
}

/**
 * `hero` is about to take `amount` of a dodgeable hit. Return the (possibly reduced)
 * amount; return 0 to negate. Only ordinary hits — never a boss mechanic or a DoT.
 */
export function rulesOnDamageTaken(host: RuleHost, hero: Hero, amount: number, fromEnemy: Enemy | null = null): number {
  const rules = hero.player.build.rules;
  const st = hero.ruleState;
  const p = hero.player;
  let out = amount;

  const fortify = hero.resources.get("fortify");
  const souls = soulPool(hero);

  // Juggernaut "Immovable" — at full Fortify, a single hit can't drop you below 1.
  if (has(rules, "juggernaut.ft.immovable") && fortify && fortify.fraction >= 0.99) {
    out = Math.min(out, Math.max(0, p.health - 1));
  }
  // Reaper "Soul Skin" — above 10 Souls, flat incoming reduction.
  if (has(rules, "reaper.sw.soul_skin") && souls && souls.value >= 10) {
    out *= 0.8;
  }
  // Reaper "Soul Fortress" — spend Souls to survive a fatal hit, throttled.
  if (has(rules, "reaper.sw.soul_fortress") && souls && out >= p.health && souls.value >= 8) {
    if (st.gateReady(host, "reaper.sw.soul_fortress", 4)) {
      souls.value -= 8;
      out = Math.max(0, p.health - 1);
      host.emit({ kind: "nova", x: hero.avatar.x, y: hero.avatar.y, radius: 60 });
    }
  }
  // Duelist "One Opponent" — while a Final Lesson (marked) target lives, almost immune
  // to everyone else. The blow from the marked target itself is unaffected.
  if (has(rules, "duelist.bd.one_opponent") && !(fromEnemy && isMarked(fromEnemy))) {
    if (host.enemiesAround(hero.avatar.x, hero.avatar.y, 1200).some(isMarked)) out *= 0.15;
  }
  return out;
}

/** An ordinary hit was avoided (evade) or blocked. */
export function rulesOnAvoid(host: RuleHost, hero: Hero, kind: "dodge" | "block"): void {
  const rules = hero.player.build.rules;
  const st = hero.ruleState;
  if (kind === "block" && has(rules, "lancer.sentinel.counterpoint")) {
    prime(st, { damageMult: 1.6, reason: "counterpoint" });
    host.emit({ kind: "pickup", x: hero.avatar.x, y: hero.avatar.y - 28, label: "primed", color: hero.player.heroClass.color });
  }
  if (kind === "block" && has(rules, "swordsman.cb.untouchable_form")) {
    hero.avatar.invulnTimer = Math.max(hero.avatar.invulnTimer, 1);
    hero.rt.reduceCooldowns(999, (id) => id.includes("masterstroke"));
  }
  if (kind === "block" && has(rules, "swordsman.hybrid.parry_dance")) {
    hero.rt.reduceCooldowns(999, (id) => id.includes("swordflash") || id.includes("footwork"));
  }
}

/** Once per tick, per hero. Aura rules and time-based state. */
export function rulesTick(host: RuleHost, hero: Hero, dt: number): void {
  const rules = hero.player.build.rules;
  if (rules.size === 0) return;
  const st = hero.ruleState;
  const a = hero.avatar;
  const p = hero.player;

  const auraTick = (rule: string, run: () => void): void => {
    if (!has(rules, rule)) return;
    const t = (st.auraTimers.get(rule) ?? 0) - dt;
    if (t <= 0) {
      st.auraTimers.set(rule, AURA_TICK);
      run();
    } else {
      st.auraTimers.set(rule, t);
    }
  };

  // Berserker "Blood God" — below half health, a standing bleed/burn aura.
  auraTick("berserker.mythic.blood_god", () => {
    if (p.health > p.maxHealth * 0.5) return;
    for (const e of host.enemiesAround(a.x, a.y, 120)) {
      host.hitEnemy(hero, e, p.attackDamage * 0.4, "fire", { fromUltimate: false });
      host.afflict(hero, e, "bleed", { duration: 3 });
      host.afflict(hero, e, "burn", { duration: 3 });
    }
  });
  // Monk "Furnace" — while Iron Body's Flow floor holds, a ring of fire scaled by Flow.
  auraTick("monk.hybrid.furnace", () => {
    const flow = flowStacks(hero);
    if (flow < 4) return;
    for (const e of host.enemiesAround(a.x, a.y, 90)) {
      host.hitEnemy(hero, e, p.attackDamage * 0.25 * (flow / 8), "fire");
    }
  });
  // Juggernaut "Absolute Threat" — enemies attacking allies take retaliation. Approximate
  // as a slow retaliating pulse on any enemy near an ally but not near the Juggernaut.
  auraTick("juggernaut.it.absolute_threat", () => {
    for (const ally of host.alliesOf(hero)) {
      for (const e of host.enemiesAround(ally.avatar.x, ally.avatar.y, 80)) {
        host.hitEnemy(hero, e, p.attackDamage * 0.5, "physical");
      }
    }
  });
  // Berserker "World-Eater" companion aura — overkill shockwaves (approx small pulse).
  auraTick("berserker.marauder.world_eater", () => {
    for (const e of host.enemiesAround(a.x, a.y, 70)) host.hitEnemy(hero, e, p.attackDamage * 0.2, "physical");
  });
}
