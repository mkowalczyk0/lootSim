/**
 * Skill tree v2 — same 5-path, 5-row shape the game already ships, with the node
 * *payload* changed from "a bag of `Mods`" to "a small list of behaviour effects".
 *
 * The spec's node meanings (§4.1), top to bottom:
 *   1. foundation — introduces or strengthens the path's core behaviour
 *   2. behavior   — changes how a skill or the class plays
 *   3. resource   — changes generation / spend / thresholds
 *   4. mutation   — rewrites one or more existing abilities (via `SkillMutation`)
 *   5. keystone   — flips a build rule (costs two points)
 *
 * `NodeEffect` still allows a plain `mods` entry, because the spec keeps stats
 * "possible, but secondary". Everything else is behaviour: a resource-rule patch, a
 * skill mutation, an effect granted onto a tag or an event, or a named keystone rule.
 *
 * Pure data plus the pure readers over an `allocated` string list. Respec stays free
 * because an allocation is just that list — clearing it is the whole operation.
 */

import type { EffectStep } from "../combat/ability";
import type { ResourceGenRule, ResourceId, ResourceThreshold } from "../combat/resources";
import type { SkillTag } from "../combat/tags";
import type { CombatEventType } from "../combat/triggers";
import type { Mods } from "../data/mods";
import type { SkillMutation } from "./mutations";

export const NODE_CATEGORIES = ["foundation", "behavior", "resource", "mutation", "keystone"] as const;
export type NodeCategory = (typeof NODE_CATEGORIES)[number];

/** A partial rewrite of a class-owned `ResourceSpec` — additive where it can be. */
export interface ResourceRulePatch {
  max?: number;
  regenPerSec?: number;
  decayPerSec?: number;
  decayDelay?: number;
  /** Generation rules appended to the spec's list. */
  addGeneration?: readonly ResourceGenRule[];
  /** Thresholds appended to the spec's list. */
  addThresholds?: readonly ResourceThreshold[];
}

export type NodeEffect =
  | { kind: "mods"; mods: Partial<Mods> }
  | { kind: "resourceRule"; resource: ResourceId; patch: ResourceRulePatch }
  | { kind: "mutate"; mutation: SkillMutation }
  | {
      kind: "grantEffect";
      /** Fires the effects on every use of an ability with this tag, or on this event. */
      on: { tag?: SkillTag; event?: CombatEventType };
      effects: readonly EffectStep[];
      note?: string;
    }
  | { kind: "rule"; rule: string; note?: string };

// --- authoring shape --------------------------------------------------

export interface PathNodeDef {
  name: string;
  blurb?: string;
  category: NodeCategory;
  effects: readonly NodeEffect[];
}

export interface PathDef {
  name: string;
  blurb: string;
  /** foundation, behavior, resource, mutation, then the 2-point keystone. */
  nodes: readonly [PathNodeDef, PathNodeDef, PathNodeDef, PathNodeDef, PathNodeDef];
}

export interface ClassProgression {
  classId: string;
  /** Five, to preserve the shipped tree shape. */
  paths: readonly PathDef[];
}

// --- flattened node --------------------------------------------------

export interface TreeNodeV2 {
  id: string;
  classId: string;
  path: number;
  pathName: string;
  row: number;
  name: string;
  blurb: string;
  category: NodeCategory;
  cost: number;
  effects: readonly NodeEffect[];
  /** The node directly above, or null for a path's first. */
  requires: string | null;
}

export const KEYSTONE_COST_V2 = 2;

export function buildProgressionTree(prog: ClassProgression): TreeNodeV2[] {
  const out: TreeNodeV2[] = [];
  prog.paths.forEach((path, p) => {
    path.nodes.forEach((def, row) => {
      const keystone = row === path.nodes.length - 1;
      out.push({
        id: `${prog.classId}.${p}.${row}`,
        classId: prog.classId,
        path: p,
        pathName: path.name,
        row,
        name: def.name,
        blurb: def.blurb ?? path.blurb,
        category: def.category,
        cost: keystone ? KEYSTONE_COST_V2 : 1,
        effects: def.effects,
        requires: row === 0 ? null : `${prog.classId}.${p}.${row - 1}`,
      });
    });
  });
  return out;
}

// --- readers over an allocation ------------------------------------

export function progNodeById(tree: readonly TreeNodeV2[], id: string): TreeNodeV2 | null {
  return tree.find((n) => n.id === id) ?? null;
}

/** Points committed to the whole tree. */
export function spentPointsV2(tree: readonly TreeNodeV2[], allocated: readonly string[]): number {
  let total = 0;
  for (const id of allocated) total += progNodeById(tree, id)?.cost ?? 0;
  return total;
}

/** Points committed per path, indexed the same way `prog.paths` is. */
export function pathPointsV2(tree: readonly TreeNodeV2[], allocated: readonly string[]): number[] {
  const pathCount = tree.reduce((max, n) => Math.max(max, n.path + 1), 0);
  const out = new Array<number>(pathCount).fill(0);
  for (const id of allocated) {
    const node = progNodeById(tree, id);
    if (node) out[node.path] = (out[node.path] ?? 0) + node.cost;
  }
  return out;
}

/** Points per path keyed by the path's name — what hybrids and archetypes read. */
export function pathPointsByName(
  tree: readonly TreeNodeV2[],
  allocated: readonly string[],
): Record<string, number> {
  const byIndex = pathPointsV2(tree, allocated);
  const out: Record<string, number> = {};
  for (const node of tree) {
    if (!(node.pathName in out)) out[node.pathName] = byIndex[node.path] ?? 0;
  }
  return out;
}

/** A node is reachable when the one above it is paid for and there are points spare. */
export function canAllocateV2(
  allocated: readonly string[],
  node: TreeNodeV2,
  available: number,
): boolean {
  if (allocated.includes(node.id)) return false;
  if (node.cost > available) return false;
  return node.requires === null || allocated.includes(node.requires);
}

/** Drops ids that aren't this tree's, then any node left standing without its prereq. */
export function pruneAllocationV2(tree: readonly TreeNodeV2[], allocated: readonly string[]): string[] {
  const valid = allocated.filter((id) => progNodeById(tree, id) !== null);
  return valid.filter((id) => {
    const node = progNodeById(tree, id)!;
    return node.requires === null || valid.includes(node.requires);
  });
}

/** Every `NodeEffect` from every allocated node, in allocation order. */
export function collectNodeEffects(
  tree: readonly TreeNodeV2[],
  allocated: readonly string[],
): NodeEffect[] {
  const out: NodeEffect[] = [];
  for (const id of allocated) {
    const node = progNodeById(tree, id);
    if (node) out.push(...node.effects);
  }
  return out;
}
