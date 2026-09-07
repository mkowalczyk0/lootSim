/**
 * Cross-path hybrids (§4.4) and three-path Mythic Archetypes (§4.5).
 *
 * Both are the same shape — a named unlock gated on point totals in two or more paths —
 * so they share one definition type and one evaluator, split only by `tier`:
 *
 *   hybrid  — two paths, "a new rule" (spec: *not* another passive percentage)
 *   mythic  — three or more paths, "a new character archetype, not another modifier"
 *
 * An unlock carries the same `NodeEffect[]` a tree node does, plus its own
 * `SkillMutation[]`, so "Comet Vanguard rewrites Meteor Lance" is expressed exactly the
 * way "Through Flesh rewrites Impaling Thrust" is. Evaluation is a pure function over
 * the allocation — orthogonal to node allocation, cheap to test, easy to add to.
 */

import type { FxProfile } from "../combat/ability";
import type { SkillMutation } from "./mutations";
import type { NodeEffect, TreeNodeV2 } from "./nodes";
import { pathPointsByName } from "./nodes";

export type UnlockTier = "hybrid" | "mythic";

export interface PathRequirement {
  /** Path name, matched against `PathDef.name`. */
  path: string;
  /** Minimum points committed to that path. */
  points: number;
}

export interface PathUnlockDef {
  id: string;
  classId: string;
  tier: UnlockTier;
  name: string;
  description: string;
  flavor?: string;
  /** Two entries for a hybrid; three or more for a Mythic Archetype. */
  requires: readonly PathRequirement[];
  /** The build rules the unlock adds — same vocabulary as a tree node. */
  effects: readonly NodeEffect[];
  /** Ability rewrites the unlock brings. */
  mutations?: readonly SkillMutation[];
  fx?: FxProfile;
  ui?: { icon?: string; badge?: string };
}

/** True when every path requirement is met by the current allocation. */
export function unlockMet(def: PathUnlockDef, pointsByPath: Record<string, number>): boolean {
  return def.requires.every((req) => (pointsByPath[req.path] ?? 0) >= req.points);
}

/** Every unlock (either tier) the allocation currently satisfies. */
export function evaluateUnlocks(
  defs: readonly PathUnlockDef[],
  tree: readonly TreeNodeV2[],
  allocated: readonly string[],
): PathUnlockDef[] {
  const points = pathPointsByName(tree, allocated);
  return defs.filter((d) => unlockMet(d, points));
}

/** §4.4 — the two-path layer. */
export function evaluateHybrids(
  defs: readonly PathUnlockDef[],
  tree: readonly TreeNodeV2[],
  allocated: readonly string[],
): PathUnlockDef[] {
  return evaluateUnlocks(defs, tree, allocated).filter((d) => d.tier === "hybrid");
}

/** §4.5 — the three-path layer. */
export function evaluateArchetypes(
  defs: readonly PathUnlockDef[],
  tree: readonly TreeNodeV2[],
  allocated: readonly string[],
): PathUnlockDef[] {
  return evaluateUnlocks(defs, tree, allocated).filter((d) => d.tier === "mythic");
}

/**
 * Data sanity, for tests and tools: a hybrid names exactly two paths, a Mythic
 * Archetype names at least three, requirements are positive, and no path is named
 * twice. Returns the problems found, empty when the def is well-formed.
 */
export function validateUnlockDef(def: PathUnlockDef): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const req of def.requires) {
    if (req.points <= 0) problems.push(`${def.id}: requirement on "${req.path}" must be positive`);
    if (seen.has(req.path)) problems.push(`${def.id}: path "${req.path}" required twice`);
    seen.add(req.path);
  }
  if (def.tier === "hybrid" && def.requires.length !== 2) {
    problems.push(`${def.id}: a hybrid must name exactly two paths, found ${def.requires.length}`);
  }
  if (def.tier === "mythic" && def.requires.length < 3) {
    problems.push(`${def.id}: a Mythic Archetype must name at least three paths, found ${def.requires.length}`);
  }
  return problems;
}
