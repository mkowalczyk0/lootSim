/**
 * Progression — the layer that turns the combat vocabulary into a *build*.
 *
 * The class defines the verbs (`combat/`). This is the grammar: tree nodes that alter
 * behaviour, a mutation framework that rewrites an ability in place instead of cloning
 * it, cross-path hybrids that add a rule, and three-path Mythic Archetypes that add an
 * identity. All pure data over an `allocated` string list; nothing here is wired into
 * `game/` yet — see docs/progression-architecture.md.
 *
 * The layers:
 *   mutations — SkillMutation + applyMutations: the in-place ability rewrite
 *   nodes     — TreeNodeV2 + NodeEffect: the 5×5 tree with behaviour payloads
 *   unlocks   — PathUnlockDef + evaluateHybrids / evaluateArchetypes
 *   build     — resolveBuild + applyBuild: everything folded into one readable result
 */

export * from "./mutations";
export * from "./nodes";
export * from "./unlocks";
export * from "./build";
export * from "./class";
export * from "./describe";
export * from "./universal";

/**
 * All 21 canonical classes, built on the framework above. The six that came first
 * (Lancer, Berserker, Magician, Necromancer, Paladin, Stormcaller) were the
 * architecture pilots — spec §33 Phase 7 — and are still called out as `PILOT_CLASSES`
 * because `tools/classes.ts` asserts on that set. The other fifteen are Phase 8, each
 * on this same data-only framework, audited by `tools/roster.ts` (`npm run roster`).
 * Oracle and Chronomancer are deliberately not in the new design.
 */
export * from "./lancer";
export * from "./berserker";
export * from "./magician";
export * from "./necromancer";
export * from "./paladin";
export * from "./stormcaller";
export * from "./swordsman";
export * from "./shaman";
export * from "./ranger";
export * from "./juggernaut";
export * from "./duelist";
export * from "./warlock";
export * from "./monk";
export * from "./corsair";
export * from "./trickster";
export * from "./reaper";
export * from "./bard";
export * from "./alchemist";
export * from "./engineer";
export * from "./assassin";
export * from "./warden";
export * from "./audit";
export * from "./matrix";

import type { Ability } from "../combat/ability";
import type { PilotClass } from "./class";
import { LANCER } from "./lancer";
import { BERSERKER } from "./berserker";
import { MAGICIAN } from "./magician";
import { NECROMANCER } from "./necromancer";
import { PALADIN } from "./paladin";
import { STORMCALLER } from "./stormcaller";
import { SWORDSMAN } from "./swordsman";
import { SHAMAN } from "./shaman";
import { RANGER } from "./ranger";
import { JUGGERNAUT } from "./juggernaut";
import { DUELIST } from "./duelist";
import { WARLOCK } from "./warlock";
import { MONK } from "./monk";
import { CORSAIR } from "./corsair";
import { TRICKSTER } from "./trickster";
import { REAPER } from "./reaper";
import { BARD } from "./bard";
import { ALCHEMIST } from "./alchemist";
import { ENGINEER } from "./engineer";
import { ASSASSIN } from "./assassin";
import { WARDEN } from "./warden";

/**
 * The six architecture-pilot classes, built first to stress-test the framework
 * (spec §33 Phase 7). Kept as its own list because `tools/classes.ts` asserts on it.
 */
export const PILOT_CLASSES: readonly PilotClass[] = [
  LANCER,
  BERSERKER,
  MAGICIAN,
  NECROMANCER,
  PALADIN,
  STORMCALLER,
];

/**
 * The full canonical roster — all 21 classes on the progression framework, in the
 * order `docs/classes_refactor.md` §1 lists them. Oracle and Chronomancer are
 * deliberately absent from the new design.
 */
export const ALL_CLASSES: readonly PilotClass[] = [
  LANCER,
  BERSERKER,
  SWORDSMAN,
  MAGICIAN,
  SHAMAN,
  RANGER,
  JUGGERNAUT,
  DUELIST,
  WARLOCK,
  MONK,
  NECROMANCER,
  CORSAIR,
  TRICKSTER,
  REAPER,
  STORMCALLER,
  PALADIN,
  BARD,
  ALCHEMIST,
  ENGINEER,
  ASSASSIN,
  WARDEN,
];

export const CLASS_BY_ID: Readonly<Record<string, PilotClass>> = Object.fromEntries(
  ALL_CLASSES.map((c) => [c.classId, c]),
);

/** @deprecated use {@link CLASS_BY_ID}. */
export const PILOT_CLASS_BY_ID = CLASS_BY_ID;

/** Every ability across the whole roster, by id — so a gear-granted skill from another
 *  class still resolves for whoever is wearing the item. */
export const ABILITY_BY_ID: Readonly<Record<string, Ability>> = Object.fromEntries(
  ALL_CLASSES.flatMap((c) => c.abilities.map((a) => [a.id, a] as const)),
);

/**
 * The pool a gear grant rolls from — one flashy, self-contained ability per class,
 * biased toward the ones that read well on someone who isn't that class. Deliberately a
 * curated shortlist, not "any of 210 abilities".
 */
export const GRANTABLE_ABILITY_IDS: readonly string[] = [
  "magician.arc_spark",
  "ranger.arrow_volley",
  "necromancer.corpse_bomb",
  "shaman.flame_totem",
  "warlock.void_bolt",
  "berserker.leap_slam",
  "stormcaller.chain_lightning",
  "paladin.consecrated_ground",
  "engineer.auto_turret",
  "alchemist.volatile_flask",
  "assassin.poison_needle",
  "warden.vine_snare",
].filter((id) => id in ABILITY_BY_ID);
