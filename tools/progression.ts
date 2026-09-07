/**
 * Progression-architecture acceptance test.
 *
 * Phase 2 of the class refactor builds the *grammar* on top of the combat vocabulary:
 * skill mutations, the v2 tree, cross-path hybrids and three-path Mythic Archetypes.
 * This file is the proof the spec's four required pieces actually work end to end:
 *
 *   - one five-node path            (Lancer / Impaler, in the canonical category order)
 *   - one skill mutation            (Impaling Thrust → Through Flesh, and the spec's
 *                                    own Corpse Bomb → Bone Structure effect-replacement)
 *   - one cross-path hybrid         (Momentum 3 + Vanguard 2 → Breakthrough)
 *   - one three-path Mythic Archetype (Momentum + Impaler + Vanguard → Comet Vanguard)
 *
 * Headless, no browser, no dungeon. Run with `npm run prog`.
 */

import type { Ability, EffectStep } from "../src/combat/index";
import {
  applyBuild,
  applyMutations,
  buildProgressionTree,
  canAllocateV2,
  evaluateArchetypes,
  evaluateHybrids,
  LANCER_IMPALING_THRUST,
  LANCER_METEOR_LANCE,
  LANCER_PROGRESSION,
  LANCER_TREE,
  LANCER_UNLOCKS,
  NODE_CATEGORIES,
  patchResourceSpec,
  pruneAllocationV2,
  resolveBuild,
  spentPointsV2,
  validateUnlockDef,
  type ResourceSpec,
  type SkillMutation,
} from "../src/progression/index";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

/** ids of a path's rows 0..n. */
function rows(path: number, upTo: number): string[] {
  const out: string[] = [];
  for (let r = 0; r <= upTo; r++) out.push(`lancer.${path}.${r}`);
  return out;
}
const IMPALER = 1;
const MOMENTUM = 3;
const VANGUARD = 4;

// =========================================================================
console.log("\n=== tree shape ===");
{
  check("five paths, preserving the shipped structure", LANCER_PROGRESSION.paths.length === 5);
  check("every path is five rows deep", LANCER_PROGRESSION.paths.every((p) => p.nodes.length === 5));
  check("row 4 of every path is the two-point keystone",
    LANCER_TREE.filter((n) => n.row === 4).every((n) => n.cost === 2 && n.category === "keystone"));
  check("rebuilding from the authoring data is stable",
    buildProgressionTree(LANCER_PROGRESSION).length === LANCER_TREE.length);
}

// =========================================================================
console.log("\n=== 1. one five-node path (Impaler, canonical category order) ===");
{
  const impaler = LANCER_TREE.filter((n) => n.path === IMPALER).sort((a, b) => a.row - b.row);
  check("categories run foundation → behavior → resource → mutation → keystone",
    impaler.map((n) => n.category).join(",") === NODE_CATEGORIES.join(","));

  // linear prerequisites, same rule the shipped tree uses
  check("row 0 is allocatable from nothing", canAllocateV2([], impaler[0]!, 10));
  check("row 2 is locked until row 1 is paid for", !canAllocateV2([impaler[0]!.id], impaler[2]!, 10));
  check("row 2 unlocks once row 1 is in", canAllocateV2([impaler[0]!.id, impaler[1]!.id], impaler[2]!, 10));

  const allocated = rows(IMPALER, 4);
  check("the whole path costs 6 points (4 + a 2-point keystone)", spentPointsV2(LANCER_TREE, allocated) === 6);

  const build = resolveBuild(LANCER_TREE, allocated, LANCER_UNLOCKS);
  check("foundation contributes a (secondary) stat: +1 pierce", build.mods.pierce === 1);
  check("behavior grants an effect hung off the 'thrust' tag",
    build.grants.some((g) => g.on.tag === "thrust" && g.from === "node"));
  check("resource node patches the Momentum spec",
    build.resourcePatches.some((p) => p.resource === "momentum"));
  check("mutation node + keystone + foundation contribute 3 skill mutations",
    build.mutations.length === 3);
  check("one of them rewrites Impaling Thrust by id",
    build.mutations.some((m) => m.target.abilityId === "lancer.impaling_thrust"));
  check("keystone flips a named build rule", build.rules.has("lancer.impaler.transfixion"));
  check("no hybrid or archetype from a single path", build.hybrids.length === 0 && build.archetypes.length === 0);
}

// =========================================================================
console.log("\n=== 2. one skill mutation ===");
{
  // (a) the Lancer path rewrites its own base skill, in place, by id + by tag
  const build = resolveBuild(LANCER_TREE, rows(IMPALER, 4), LANCER_UNLOCKS);
  const thrust = applyBuild(build, LANCER_IMPALING_THRUST);
  check("base ability is untouched (pure)", LANCER_IMPALING_THRUST.range === 220
    && LANCER_IMPALING_THRUST.effects.length === 1);
  check("Long Point (+40) and Through Flesh (+40) both extended the reach", thrust.range === 300);
  check("Through Flesh scaled the hit", firstDamageBase(thrust) > 1.4);
  check("Through Flesh added an Exposed rider the base didn't have",
    firstDamage(thrust)?.inflict?.status === "exposed");
  check("Transfixion bolted on a reactive 'pin' step",
    thrust.effects.length === 2 && thrust.effects[1]!.kind === "reactive");

  // (b) the spec's canonical example: Corpse Bomb → Bone Structure is ONE ability id,
  //     changed by an effect-replacement mutation, not a second skill.
  const corpseBomb: Ability = {
    id: "necro.corpse_bomb",
    name: "Corpse Bomb",
    description: "Detonate a corpse.",
    category: "spell",
    tags: ["corpse", "area"],
    cooldown: 6,
    targeting: "corpse",
    range: 160,
    effects: [
      { kind: "consumeStatus", status: "mark", to: "corpse" },
      { kind: "damage", damage: { base: 2, scale: "spell", type: "void" }, to: "enemies" },
    ],
  };
  const boneStructure: SkillMutation = {
    id: "necro.bone_structure",
    label: "Corpse Bomb → Bone Structure",
    target: { abilityId: "necro.corpse_bomb" },
    ops: [
      {
        kind: "replaceEffects",
        effects: [
          { kind: "summon", unit: "bone_turret", count: 1, duration: 12, command: { behavior: "guardPoint", inheritPower: 0.5 } },
        ],
      },
      { kind: "addTags", tags: ["summon", "construct"] },
    ],
  };
  const mutated = applyMutations(corpseBomb, [boneStructure]);
  check("same id — it is not a new skill", mutated.id === corpseBomb.id);
  check("the corpse now raises a structure instead of exploding",
    mutated.effects.length === 1 && mutated.effects[0]!.kind === "summon");
  check("and it picked up the tags downstream summon nodes key off",
    mutated.tags.includes("summon") && mutated.tags.includes("construct"));
  check("a non-matching ability is returned untouched (same reference)",
    applyMutations(LANCER_IMPALING_THRUST, [boneStructure]) === LANCER_IMPALING_THRUST);
}

// =========================================================================
console.log("\n=== 3. one cross-path hybrid (Momentum 3 + Vanguard 2 → Breakthrough) ===");
{
  const short = [...rows(MOMENTUM, 1), ...rows(VANGUARD, 1)]; // 2 + 2
  check("2 + 2 points is not enough", evaluateHybrids(LANCER_UNLOCKS, LANCER_TREE, short).length === 0);

  const allocated = [...rows(MOMENTUM, 2), ...rows(VANGUARD, 1)]; // 3 + 2
  const hybrids = evaluateHybrids(LANCER_UNLOCKS, LANCER_TREE, allocated);
  check("3 Momentum + 2 Vanguard unlocks exactly one hybrid", hybrids.length === 1);
  check("it is Breakthrough", hybrids[0]!.id === "lancer.breakthrough");
  check("Breakthrough is a well-formed two-path hybrid", validateUnlockDef(hybrids[0]!).length === 0);

  const build = resolveBuild(LANCER_TREE, allocated, LANCER_UNLOCKS);
  check("the hybrid folds into the build as a rule, not a stat bundle",
    build.rules.has("lancer.hybrid.breakthrough"));
  check("its granted effect is attributed to the hybrid layer",
    build.grants.some((g) => g.from === "hybrid" && g.on.tag === "charge"));
  check("its charge-window mutation is in the build's mutation list",
    build.mutations.some((m) => m.id === "breakthrough.charge_window"));
  check("no archetype yet", build.archetypes.length === 0);
}

// =========================================================================
console.log("\n=== 4. one three-path Mythic Archetype (Momentum + Impaler + Vanguard → Comet Vanguard) ===");
{
  const allocated = [...rows(MOMENTUM, 4), ...rows(IMPALER, 3), ...rows(VANGUARD, 3)]; // 6 + 4 + 4
  const archetypes = evaluateArchetypes(LANCER_UNLOCKS, LANCER_TREE, allocated);
  check("deep three-path investment unlocks exactly one archetype", archetypes.length === 1);
  check("it is Comet Vanguard", archetypes[0]!.id === "lancer.comet_vanguard");
  check("Comet Vanguard is a well-formed three-path archetype", validateUnlockDef(archetypes[0]!).length === 0);

  const build = resolveBuild(LANCER_TREE, allocated, LANCER_UNLOCKS);
  check("the build reports the archetype and (still) the hybrids it builds on",
    build.archetypes.length === 1 && build.hybrids.some((h) => h.id === "lancer.breakthrough"));

  const base = LANCER_METEOR_LANCE;
  const comet = applyBuild(build, base);
  check("it MODIFIES GAMEPLAY: the ultimate gains an effect step it never had",
    comet.effects.length === base.effects.length + 1);
  check("the new step is the ally trail (a persistent zone)",
    comet.effects[comet.effects.length - 1]!.kind === "zone");
  check("the charge pierces a whole formation now (wider + longer lane)",
    (comet.shape?.length ?? 0) > (base.shape?.length ?? 0)
    && (comet.shape?.width ?? 0) > (base.shape?.width ?? 0));
  check("its impact scales and applies Exposed for the raid to capitalise on",
    firstDamageBase(comet) > firstDamageBase(base)
    && firstDamage(comet)?.inflict?.status === "exposed");
  check("THE ULTIMATE RULE is untouched — the ability is still flagged isUltimate",
    comet.isUltimate === true && comet.generatesUltimateCharge !== true);
}

// =========================================================================
console.log("\n=== 5. resource-spec patching + respec ===");
{
  const momentumBase: ResourceSpec = {
    id: "momentum", label: "Momentum", max: 100, start: "empty", ui: "bar",
    generation: [{ on: "dashStart", amount: 10 }],
  };
  const build = resolveBuild(LANCER_TREE, [...rows(MOMENTUM, 2), ...rows(IMPALER, 2)], LANCER_UNLOCKS);
  const patched = patchResourceSpec(momentumBase, build);
  check("base spec is untouched", momentumBase.generation!.length === 1);
  check("the tree's generation rules were folded onto the class spec",
    (patched.generation?.length ?? 0) > 1
    && patched.generation!.some((g) => g.on === "move")
    && patched.generation!.some((g) => g.requireTags?.includes("thrust")));
  check("a threshold from Overflow landed too",
    patched.thresholds!.some((t) => t.whileAbove?.moveSpeed === 0.2));

  // respec = drop the list. nothing persists, nothing to refund-calculate.
  const empty = resolveBuild(LANCER_TREE, [], LANCER_UNLOCKS);
  check("an empty allocation resolves to an empty build",
    empty.mutations.length === 0 && empty.grants.length === 0 && empty.rules.size === 0
    && empty.hybrids.length === 0 && empty.archetypes.length === 0);

  // orphan pruning, same discipline as the shipped normalizeTree
  const orphaned = ["lancer.1.3", "lancer.99.0", `${"lancer.0.0"}`];
  const pruned = pruneAllocationV2(LANCER_TREE, orphaned);
  check("prune drops unknown ids and nodes standing without their prerequisite",
    pruned.length === 1 && pruned[0] === "lancer.0.0");
}

// =========================================================================
console.log("\n=== 6. no giant switch — a new class is data, not engine edits ===");
{
  // A throwaway "class" defined entirely as data proves the framework doesn't hard-code
  // Lancer. Nothing in src/progression/ mentions a class id in a conditional.
  const toyTree = buildProgressionTree({ classId: "toy", paths: LANCER_PROGRESSION.paths });
  const toyBuild = resolveBuild(toyTree, ["toy.1.0", "toy.1.1"], []);
  check("an unrelated data-only class resolves through the exact same functions",
    toyBuild.classId === "toy" && toyBuild.grants.some((g) => g.on.tag === "thrust"));
}

function firstDamage(a: Ability): Extract<EffectStep, { kind: "damage" }>["damage"] | undefined {
  const step = a.effects.find((s) => s.kind === "damage");
  return step && step.kind === "damage" ? step.damage : undefined;
}
function firstDamageBase(a: Ability): number {
  return firstDamage(a)?.base ?? 0;
}

console.log(`\n${failures === 0 ? "ALL PROGRESSION CHECKS PASSED" : `${failures} PROGRESSION CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
