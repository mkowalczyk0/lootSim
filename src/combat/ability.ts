/**
 * The ability schema — one data shape that describes every skill and every ultimate.
 *
 * The old `Skill` was a flat bag of numbers and the dungeon ran a `switch` over eight
 * hard-coded shapes; a skill could only ever do one of those eight things. An
 * `Ability` instead carries an ordered list of **effect steps** — move, then damage,
 * then drop a zone, then schedule a follow-up — and the executor runs them through one
 * generic dispatcher. Adding a class's odd skill is new data plus, once in a while,
 * one new step kind that every later class can also use.
 *
 * Pure data. `runtime.ts` is what actually executes one of these.
 */

import type { DamageChannel, DamageType } from "./damage";
import type { ResourceId } from "./resources";
import type { StatusCategory, StatusId } from "./status";
import type { SkillTag } from "./tags";
import type { TargetingMode } from "./targeting";
import type { CombatEventType } from "./triggers";

export type AbilityCategory =
  | "attack"
  | "spell"
  | "movement"
  | "support"
  | "summon"
  | "terrain"
  | "utility"
  | "ultimate";

// --- sub-schemas ---------------------------------------------------------

/** How an effect's damage number is derived and what it counts as. */
export interface DamageTemplate {
  /** Base multiplier. `scale` says what it multiplies. */
  base: number;
  scale?: "attack" | "spell" | "flat";
  type: DamageType;
  channel?: DamageChannel;
  canCrit?: boolean;
  /**
   * An execute rider: extra damage that grows as the target approaches death.
   *
   * **There is no threshold field here on purpose.** The threshold is a property of the
   * mechanic, not of an ability, and it lives at the one site that evaluates this —
   * `executeBonus` / `EXECUTE_THRESHOLD` in `combat/damage.ts`. Read THE EXECUTE RULE
   * there before tuning a coefficient: the rider pays its full authored value at 0 HP
   * and exactly nothing at or above the threshold, so this number is "how hard does
   * this finish something", not "how much free damage does this do to a healthy boss".
   * Docket §20 exists because the second reading was the implemented one.
   */
  executeMissingHealth?: number;
  /**
   * Multiplier on the whole hit that grows with the *caster's* missing health:
   * final = base × (1 + casterMissingHealth × casterMissingFraction). This is the
   * "the closer to death, the harder you hit" rider — Berserker's Last Breath and
   * Worldbreaker, Reaper's executes. Distinct from `executeMissingHealth`, which
   * reads the victim.
   */
  casterMissingHealth?: number;
  inflict?: { status: StatusId; chance: number; potency?: number };
  knockback?: number;
}

export interface ProjectileTemplate {
  damage: DamageTemplate;
  speed: number;
  radius: number;
  life: number;
  pierce?: number;
  count?: number;
  spread?: number;
  behavior?: "line" | "homing" | "lob" | "boomerang" | "orbit";
  /** Effects that run where the projectile dies or expires. */
  onExpire?: EffectStep[];
}

export interface ZoneTemplate {
  damage?: DamageTemplate;
  radius: number;
  duration: number;
  tickInterval: number;
  shape?: "circle" | "line" | "cone";
  /** Follows the caster instead of staying put. */
  follows?: boolean;
  /** Two of these zones overlapping merge into one bigger one (the spec's ignition-zone example). */
  mergeable?: boolean;
  status?: { id: StatusId; chance: number };
  /** A friendly zone: heal or buff instead of damage. */
  benefit?: "heal" | "shield" | "haste";
  /**
   * A `line` zone that multiplies the damage of its owner's projectiles while they
   * travel through it — Ranger's Predator's Trail. The projectile keeps the charge
   * (and a bright tell) after it leaves.
   */
  empowerProjectiles?: number;
}

export interface MinionCommand {
  behavior: "follow" | "guardPoint" | "aggroNearest" | "commandTarget";
  /** Fraction of the owner's offensive mods the minion inherits. */
  inheritPower?: number;
}

/** Where an effect step lands, relative to the ability's resolved targets. */
export type EffectTargetSel =
  | "target"
  | "allTargets"
  | "self"
  | "caster"
  | "allies"
  /**
   * Every hostile **within the ability's reach** — see `enemyReach` in `runtime.ts`.
   * Bounded by construction: an ability that paints no circle still does not reach the
   * whole floor. THE MAP-WIPE RULE (docket §30).
   */
  | "enemies"
  /**
   * Every hostile on the floor, no matter how far away. The deliberate opt-in, and the
   * only selector that can do this — a room-wide ultimate (Damnation, Death Comes Due)
   * says so here rather than getting it by forgetting to author a shape. Adding a site
   * is a real design decision: `npm run mapwipe` pins the roster and fails on a new one.
   */
  | "enemiesEverywhere"
  | "point"
  | "marked"
  | "lowestHealthAlly"
  | "corpse"
  | "summons";

export type EffectStep =
  | { kind: "damage"; damage: DamageTemplate; to?: EffectTargetSel }
  | {
      kind: "status";
      status: StatusId;
      to?: EffectTargetSel;
      chance?: number;
      potency?: number;
      stacks?: number;
      durationMult?: number;
      /** Damage this application snapshots its DoT off. Defaults to the caster's attack damage. */
      hitDamage?: number;
      /** Scale `hitDamage` (or the default) by attack/spell damage. */
      scale?: "flat" | "attack" | "spell";
    }
  | { kind: "cleanse"; category?: StatusCategory; statuses?: StatusId[]; to?: EffectTargetSel; thenHealPerStatus?: number }
  | { kind: "consumeStatus"; status: StatusId; to?: EffectTargetSel; then?: EffectStep[] }
  | { kind: "spreadStatus"; status: StatusId; radius: number; to?: EffectTargetSel }
  | { kind: "heal"; amount: number; scale?: "flat" | "attack" | "spell"; to?: EffectTargetSel; overTime?: { duration: number } }
  | {
      kind: "shield";
      amount: number;
      scale?: "flat" | "attack" | "spell";
      to?: EffectTargetSel;
      duration: number;
      /** The barrier soaks one hit of any size, then breaks (Paladin's Shield of Faith). */
      absorbOneHit?: boolean;
    }
  | { kind: "projectile"; projectile: ProjectileTemplate }
  | {
      kind: "move";
      style: "dash" | "blink" | "vault" | "charge" | "teleport";
      distance?: number;
      toTarget?: boolean;
      leaveAnchor?: boolean;
      iframes?: number;
    }
  | {
      kind: "summon";
      unit: string;
      count: number;
      duration?: number;
      command?: MinionCommand;
      /** Consume up to this many corpses to pay for the summon (Necromancer). "all" raises the field. */
      fromCorpses?: number | "all";
    }
  /** Re-order existing summons the caster owns — the Necromancer's "Command: Ravage". */
  | { kind: "commandSummons"; command: MinionCommand["behavior"]; to?: EffectTargetSel }
  /** Sacrifice the caster's own summons, then run `then` (Death Pact, Trickster decoys). */
  | { kind: "consumeSummons"; count: number | "all"; then?: EffectStep[] }
  /**
   * Bind an ally so a fraction of the damage they would take is redirected to the
   * caster for `duration` (Paladin's Guardian's Oath, Juggernaut's Fortress Call).
   */
  | { kind: "redirect"; fraction: number; duration: number; to?: EffectTargetSel }
  /** Roll one branch by weight — Arcane Roulette, Chaos Step, an unstable serum. */
  | { kind: "random"; choices: readonly { weight: number; effects: readonly EffectStep[] }[] }
  | { kind: "zone"; zone: ZoneTemplate }
  | { kind: "terrain"; piece: "wall" | "anchor" | "cover" | "barricade"; length?: number; duration: number; hp?: number }
  | { kind: "threat"; op: "taunt" | "drop" | "generate"; radius?: number; amount?: number; to?: EffectTargetSel }
  | { kind: "resource"; resource: ResourceId; delta: number; to?: EffectTargetSel }
  /** Advance or set a stance / weather phase on the caster (Stormcaller's Weather Shift). */
  | { kind: "stance"; stance: ResourceId; op: "cycle" | "set"; state?: string; steps?: number }
  | { kind: "knockback"; force: number; to?: EffectTargetSel }
  | { kind: "pull"; force: number; to?: EffectTargetSel }
  | { kind: "interrupt"; radius: number }
  | { kind: "delay"; seconds: number; effects: EffectStep[] }
  | { kind: "reactive"; event: CombatEventType; window: number; effects: EffectStep[] }
  | { kind: "followUp"; effects: EffectStep[] }
  | { kind: "fx"; fx: string };

// --- FX / audio / animation --------------------------------------------

/**
 * FX are references, not code. A string per slot; `render/fx.ts` maps it to crescents
 * and impact stars. Numbers where the renderer needs a magnitude. The point is that a
 * dangerous mechanic can be made *readable* from data.
 */
/**
 * The presentation half of an ability. **`travel` is live; the rest is still declared and
 * unread** — this whole interface sat dead for the project's life (zero of 210 abilities
 * authored one, nothing anywhere read one), which is what made wiring it cheap.
 *
 * `travel` is a `TracerStyle` (`render/fx.ts`): the hitscan line drawn from the caster to
 * each target of an ability that resolves damage at range. It is drawn **instantly along
 * its whole length**, because the damage has already landed — anything that appears to
 * travel would be a lie the player can catch across a room. Genuinely travelling,
 * dodgeable objects are `Projectile`s, which the simulation gives real travel time.
 *
 * Everything here is read by `render/` only. An entry may never change a number the
 * simulation consumes.
 */
export interface FxProfile {
  cast?: string;
  /** A `TracerStyle`: "beam" | "lance" | "bolt". Drawn instantly, never in flight. */
  travel?: string;
  impact?: string;
  ground?: string;
  status?: string;
  trail?: string;
  screenShake?: number;
  hitStop?: number;
  cameraEmphasis?: number;
  palette?: string;
}

export interface AudioProfile {
  cast?: string;
  impact?: string;
  loop?: string;
}

export interface TelegraphProfile {
  shape: "circle" | "donut" | "cone" | "line" | "ring" | "expandingRing" | "none";
  windup: number;
  radius?: number;
  inner?: number;
  width?: number;
  arc?: number;
  /** Marks the shape as the safe spot rather than the danger. */
  safe?: boolean;
  followsCaster?: boolean;
}

// --- mutation hooks ----------------------------------------------------

/**
 * Named seams a tree node or an item may rewrite without cloning the ability. The
 * hook *engine* is a later phase; declaring the hooks now is what lets abilities be
 * authored with the seams already in place (spec §3.11).
 */
export type MutationKind =
  | "damagePacket"
  | "targeting"
  | "projectile"
  | "movement"
  | "resource"
  | "status"
  | "zone"
  | "summon"
  | "trigger"
  | "followUp"
  | "replaceEffect";

export interface MutationHook {
  id: string;
  kind: MutationKind;
  /** Human note on what rewriting here is meant to achieve. */
  note?: string;
}

// --- the ability -----------------------------------------------------

export interface Ability {
  id: string;
  classId?: string;
  name: string;
  description: string;
  flavor?: string;
  category: AbilityCategory;
  tags: readonly SkillTag[];

  costs?: readonly { resource: ResourceId; amount: number }[];
  generates?: readonly { resource: ResourceId; amount: number }[];

  cooldown: number;
  castTime?: number;
  recovery?: number;
  channel?: { duration: number; ticks: number };
  charges?: { max: number; rechargeTime: number };

  targeting: TargetingMode;
  range?: number;
  shape?: { radius?: number; width?: number; length?: number; arc?: number };
  telegraph?: TelegraphProfile;

  effects: readonly EffectStep[];
  /** Effects available for a short window after the cast, on a second press. */
  followUp?: { window: number; effects: readonly EffectStep[] };

  fx?: FxProfile;
  audio?: AudioProfile;
  animation?: string;
  tooltip?: string;

  mutationHooks?: readonly MutationHook[];

  isUltimate?: boolean;
  /**
   * THE ULTIMATE RULE, at the ability level: an ultimate's damage is flagged
   * `fromUltimate` so no resource can be charged by it. Set this `true` — deliberately,
   * per ability — for a documented exception.
   */
  generatesUltimateCharge?: boolean;
}

/** True when an ability's output must be blocked from feeding ultimate charge. */
export function abilityBlocksUltimateCharge(ability: Ability): boolean {
  return ability.isUltimate === true && ability.generatesUltimateCharge !== true;
}
