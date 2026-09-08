/**
 * The build resolver — one function that turns "a class tree + which nodes are lit +
 * the hybrid/archetype tables" into everything combat needs to read.
 *
 * This is the seam the eventual dungeon migration calls: `resolveBuild` once whenever
 * the allocation changes, then `applyBuild(build, baseAbility)` per ability to get the
 * version the runtime should actually cast. Nodes, hybrids and archetypes all feed the
 * same four buckets, so the executor never has to know which layer a rewrite came from.
 *
 * Pure. No `Player`, no `Dungeon`, no persistence.
 */

import type { Ability, EffectStep } from "../combat/ability";
import type { ResourceGenRule, ResourceSpec, ResourceThreshold } from "../combat/resources";
import { addMods, zeroMods, type Mods } from "../data/mods";
import { applyMutations, type SkillMutation } from "./mutations";
import {
  collectNodeEffects,
  pathPointsV2,
  type NodeEffect,
  type ResourceRulePatch,
  type TreeNodeV2,
} from "./nodes";
import { evaluateUnlocks, type PathUnlockDef } from "./unlocks";

export interface GrantedEffect {
  on: { tag?: string; event?: string };
  effects: readonly EffectStep[];
  /** Which layer granted it, for tooltips. `gear` is a worn named item (`data/named.ts`);
   *  `relic` a worn relic or artifact (`data/relics.ts`). */
  from: "node" | "hybrid" | "mythic" | "gear" | "relic";
}

export interface ResolvedBuild {
  classId: string;
  allocated: readonly string[];
  /** Stat contribution — folds straight into `Player.mods`. Secondary by design. */
  mods: Mods;
  /** Every ability rewrite, node + hybrid + archetype, in application order. */
  mutations: SkillMutation[];
  /** Effects the tree hangs off a tag or an event. */
  grants: GrantedEffect[];
  /** Patches to fold onto class-owned resource specs, keyed by resource id. */
  resourcePatches: { resource: string; patch: ResourceRulePatch }[];
  /** Named keystone / archetype rule flips the executor and resource runtime check. */
  rules: Set<string>;
  /** Unlocked two-path hybrids. */
  hybrids: PathUnlockDef[];
  /** Unlocked three-path Mythic Archetypes. */
  archetypes: PathUnlockDef[];
  /** Points per path, index-aligned with the tree's paths. */
  pathPoints: number[];
}

/**
 * Folds a list of node-shaped effects into a build. Exported for the one layer outside
 * the tree that speaks the same vocabulary — a worn named item (`data/named.ts`), which
 * `Player.build` folds in after the class tree, hybrids and archetypes have resolved, so
 * the item never influences which hybrid unlocks and the dungeon reads one build.
 */
export function foldEffects(
  effects: readonly NodeEffect[],
  from: GrantedEffect["from"],
  out: ResolvedBuild,
): void {
  for (const eff of effects) {
    switch (eff.kind) {
      case "mods":
        addMods(out.mods, eff.mods);
        break;
      case "mutate":
        out.mutations.push(eff.mutation);
        break;
      case "grantEffect":
        out.grants.push({ on: eff.on, effects: eff.effects, from });
        break;
      case "resourceRule":
        out.resourcePatches.push({ resource: eff.resource, patch: eff.patch });
        break;
      case "rule":
        out.rules.add(eff.rule);
        break;
    }
  }
}

export function resolveBuild(
  tree: readonly TreeNodeV2[],
  allocated: readonly string[],
  unlockDefs: readonly PathUnlockDef[] = [],
): ResolvedBuild {
  const classId = tree[0]?.classId ?? "";
  const build: ResolvedBuild = {
    classId,
    allocated: [...allocated],
    mods: zeroMods(),
    mutations: [],
    grants: [],
    resourcePatches: [],
    rules: new Set<string>(),
    hybrids: [],
    archetypes: [],
    pathPoints: pathPointsV2(tree, allocated),
  };

  foldEffects(collectNodeEffects(tree, allocated), "node", build);

  const unlocked = evaluateUnlocks(unlockDefs, tree, allocated);
  for (const u of unlocked) {
    const layer = u.tier === "mythic" ? "mythic" : "hybrid";
    foldEffects(u.effects, layer, build);
    if (u.mutations) build.mutations.push(...u.mutations);
    if (u.tier === "mythic") build.archetypes.push(u);
    else build.hybrids.push(u);
  }

  return build;
}

/** The resolved build applied to one base ability — what the runtime should cast. */
export function applyBuild(build: ResolvedBuild, ability: Ability): Ability {
  return applyMutations(ability, build.mutations);
}

/** Folds every patch for one resource onto its base spec. Additive, order-preserving. */
export function patchResourceSpec(base: ResourceSpec, build: ResolvedBuild): ResourceSpec {
  const patches = build.resourcePatches.filter((p) => p.resource === base.id).map((p) => p.patch);
  if (patches.length === 0) return base;

  const generation: ResourceGenRule[] = [...(base.generation ?? [])];
  const thresholds: ResourceThreshold[] = [...(base.thresholds ?? [])];
  const next: ResourceSpec = { ...base };

  for (const patch of patches) {
    if (patch.max !== undefined) next.max = patch.max;
    if (patch.regenPerSec !== undefined) next.regenPerSec = patch.regenPerSec;
    if (patch.decayPerSec !== undefined) next.decayPerSec = patch.decayPerSec;
    if (patch.decayDelay !== undefined) next.decayDelay = patch.decayDelay;
    if (patch.addGeneration) generation.push(...patch.addGeneration);
    if (patch.addThresholds) thresholds.push(...patch.addThresholds);
  }

  next.generation = generation;
  next.thresholds = thresholds;
  return next;
}
