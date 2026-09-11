/**
 * Progression — the layer that turns the combat vocabulary into a *build*.
 *
 * The class defines the verbs (`combat/`). This is the grammar: tree nodes that alter
 * behaviour, a mutation framework that rewrites an ability in place instead of cloning
 * it, cross-path hybrids that add a rule, and three-path Mythic Archetypes that add an
 * identity. All pure data over an `allocated` string list — `Player.build` in
 * `game/player.ts` calls `resolveClassBuild` directly, so this is the live tree, not a
 * preview of one. See docs/progression-architecture.md.
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
import { ALCHEMIST_ABILITIES } from "./alchemist";
import { ASSASSIN_ABILITIES } from "./assassin";
import { BARD_ABILITIES } from "./bard";
import { BERSERKER_ABILITIES } from "./berserker";
import { CORSAIR_ABILITIES } from "./corsair";
import { DUELIST_ABILITIES } from "./duelist";
import { ENGINEER_ABILITIES } from "./engineer";
import { JUGGERNAUT_ABILITIES } from "./juggernaut";
import { LANCER_ABILITIES } from "./lancer";
import { MAGICIAN_ABILITIES } from "./magician";
import { MONK_ABILITIES } from "./monk";
import { NECROMANCER_ABILITIES } from "./necromancer";
import { PALADIN_ABILITIES } from "./paladin";
import { RANGER_ABILITIES } from "./ranger";
import { REAPER_ABILITIES } from "./reaper";
import { SHAMAN_ABILITIES } from "./shaman";
import { STORMCALLER_ABILITIES } from "./stormcaller";
import { SWORDSMAN_ABILITIES } from "./swordsman";
import { TRICKSTER_ABILITIES } from "./trickster";
import { WARDEN_ABILITIES } from "./warden";
import { WARLOCK_ABILITIES } from "./warlock";

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

/**
 * Every authored ability table, as a tuple, so the ids in them survive as literal types.
 *
 * These are re-exported by the `export * from "./<class>"` lines above; they are imported
 * again here because `export *` re-exports without creating a local binding, and this
 * needs the values in scope to take their type.
 */
const ABILITY_TABLES = [
  ALCHEMIST_ABILITIES,
  ASSASSIN_ABILITIES,
  BARD_ABILITIES,
  BERSERKER_ABILITIES,
  CORSAIR_ABILITIES,
  DUELIST_ABILITIES,
  ENGINEER_ABILITIES,
  JUGGERNAUT_ABILITIES,
  LANCER_ABILITIES,
  MAGICIAN_ABILITIES,
  MONK_ABILITIES,
  NECROMANCER_ABILITIES,
  PALADIN_ABILITIES,
  RANGER_ABILITIES,
  REAPER_ABILITIES,
  SHAMAN_ABILITIES,
  STORMCALLER_ABILITIES,
  SWORDSMAN_ABILITIES,
  TRICKSTER_ABILITIES,
  WARDEN_ABILITIES,
  WARLOCK_ABILITIES,
] as const;

/**
 * Every ability id in the game, as a union of string literals.
 *
 * This exists because of a **silent** failure, the quiet sibling of the crash that
 * produced `ModPoolId` (see the comment on `AUTHORED_MODS` in `data/items.ts`).
 * `GRANTABLE_ABILITY_IDS` was a `readonly string[]` — a list of ids into a finite set with
 * the compiler switched off for exactly the question that matters — ending in a
 * `.filter((id) => id in ABILITY_BY_ID)` that dropped anything stale on the floor without
 * a word. Five of its twelve curated entries had been renamed out from under it, so the
 * pool players actually rolled from was seven. Nothing failed. Nothing was red. Five
 * classes had simply stopped appearing on granted-skill gear, and the only way to find out
 * was to print the list and compare it against itself.
 *
 * Getting the ids this far costs something, and it is worth knowing what: every one of the
 * 210 ability declarations and all 21 tables had to change from a `: Ability` annotation to
 * a `satisfies Ability` assertion, because an annotation widens `id` to `string` at the
 * declaration and no amount of care further downstream can recover it. The assertion checks
 * the same shape and keeps the literal. That is the whole diff, and it is mechanical.
 */
export type AbilityId = (typeof ABILITY_TABLES)[number][number]["id"];

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
// Typed against `AbilityId`, NOT `string`. A `readonly string[]` here is what let five of
// these twelve go stale and vanish from the pool without a sound — see the AbilityId
// comment above. With this annotation a renamed ability is a compile error on the line
// that names it, which is where the mistake actually is.
//
// The trailing `.filter((id) => id in ABILITY_BY_ID)` that used to close this list is gone
// on purpose and must not come back. It was the blind instrument: it took the exact
// failure this type now catches and converted it into a shorter list, which is invisible
// because a curated pool has no length anyone remembers. A filter that can only ever
// discard authored content is not a safety net, it is the thing that hides the fall.
export const GRANTABLE_ABILITY_IDS: readonly AbilityId[] = [
  "magician.arc_spark",
  "ranger.splitshot",
  "necromancer.corpse_bomb",
  "shaman.rootcaller",
  "warlock.black_bolt",
  "berserker.axequake",
  "stormcaller.ball_lightning",
  "paladin.consecrated_ground",
  "engineer.auto_turret",
  "alchemist.volatile_flask",
  "assassin.poison_needle",
  "warden.vine_snare",
];
