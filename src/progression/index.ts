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
