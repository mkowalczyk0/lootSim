/**
 * A pilot class, as data.
 *
 * `classes_refactor.md` §2.1: "a class is an interaction system", not a stat block. A
 * `PilotClass` is exactly that bundle — the resource model that says how you generate
 * power, the ten verbs you spend it on, the five paths that rewrite those verbs, and
 * the hybrid/archetype unlocks that turn a path pair into a build. Nothing here is a
 * code path; a class is `ResourceSpec`s + `Ability`s + a `ClassProgression` +
 * `PathUnlockDef`s, resolved through the exact same `src/progression` functions the
 * Lancer reference uses.
 *
 * Pure. `installClass` registers the class's statuses and flattens its tree; it does
 * not touch `game/`, the DOM, or persistence — wiring the resolved build into the
 * dungeon's ability execution is a later phase (docs/progression-architecture.md).
 */

import type { Ability } from "../combat/ability";
import { registerStatus, type StatusSpec } from "../combat/status";
import { ResourceSet, type ResourceSpec, type StanceSpec } from "../combat/resources";
import { buildProgressionTree, type ClassProgression, type TreeNodeV2 } from "./nodes";
import { validateUnlockDef, type PathUnlockDef } from "./unlocks";
import { resolveBuild, type ResolvedBuild } from "./build";

export interface PilotClass {
  classId: string;
  name: string;
  /** One-line combat fantasy (spec §5). */
  fantasy: string;
  /** Dungeon / raid role. */
  role: string;
  /** The single question the class answers (spec §2.2). */
  question: string;
  /**
   * The class's resource model — Mana included only when the class actually uses it.
   * One entry carries `isUltimateMeter` and the class's own charge rules; that is
   * "how this class earns its ultimate" (spec: a real charge rule, never perKill:1).
   */
  resources: readonly ResourceSpec[];
  /** Stance / phase states — the Stormcaller's Weather Phase is the pilot for this. */
  stances?: readonly StanceSpec[];
  /** Statuses the class introduces (Skewered, Rupture, Conviction marks, …). */
  statuses?: readonly StatusSpec[];
  /** Exactly ten: nine normal skills then the one ultimate, in that order. */
  abilities: readonly Ability[];
  progression: ClassProgression;
  /** Six two-path hybrids and at least one three-path Mythic Archetype. */
  unlocks: readonly PathUnlockDef[];
}

export interface ClassRuntime {
  def: PilotClass;
  tree: TreeNodeV2[];
  abilitiesById: Map<string, Ability>;
  ultimate: Ability;
  normalAbilities: Ability[];
}

/** Registers the class's statuses and builds its flattened tree. Idempotent. */
export function installClass(def: PilotClass): ClassRuntime {
  for (const s of def.statuses ?? []) registerStatus(s);
  const tree = buildProgressionTree(def.progression);
  const abilitiesById = new Map(def.abilities.map((a) => [a.id, a]));
  const ultimate = def.abilities.find((a) => a.isUltimate === true)!;
  const normalAbilities = def.abilities.filter((a) => a.isUltimate !== true);
  return { def, tree, abilitiesById, ultimate, normalAbilities };
}

/** A fresh `ResourceSet` for one hero of this class — pools plus stances. */
export function makeClassResources(def: PilotClass): ResourceSet {
  return new ResourceSet(def.resources, def.stances ?? []);
}

/** Resolve a build for this class from an allocation string list. */
export function resolveClassBuild(rt: ClassRuntime, allocated: readonly string[]): ResolvedBuild {
  return resolveBuild(rt.tree, allocated, rt.def.unlocks);
}

// --- validation ---------------------------------------------------------

/**
 * Data sanity for one class in isolation. Cross-class skill-id uniqueness is checked
 * across the whole roster by `validateRoster`.
 */
export function validateClass(def: PilotClass): string[] {
  const problems: string[] = [];
  const p = (m: string) => problems.push(`${def.classId}: ${m}`);

  // --- abilities: 9 + 1 ---
  if (def.abilities.length !== 10) p(`must own exactly 10 abilities, found ${def.abilities.length}`);
  const ults = def.abilities.filter((a) => a.isUltimate === true);
  if (ults.length !== 1) p(`must own exactly one ultimate, found ${ults.length}`);
  if (ults[0] && !ults[0].tags.includes("ultimate")) p(`the ultimate must carry the "ultimate" tag`);
  const ids = new Set<string>();
  for (const a of def.abilities) {
    if (ids.has(a.id)) p(`duplicate ability id ${a.id}`);
    ids.add(a.id);
    if (!a.id.startsWith(`${def.classId}.`)) p(`ability ${a.id} is not namespaced to the class`);
    if (a.classId && a.classId !== def.classId) p(`ability ${a.id} claims classId ${a.classId}`);
  }

  // --- resources: exactly one ultimate meter ---
  const meters = def.resources.filter((r) => r.isUltimateMeter === true);
  if (meters.length !== 1) p(`must declare exactly one ultimate meter, found ${meters.length}`);
  for (const r of def.resources) {
    if (r.isUltimateMeter) continue;
    if (!r.generation && !r.regenPerSec) p(`resource "${r.id}" has no way to fill`);
  }

  // --- tree: 5 paths, 5 rows, canonical categories ---
  const paths = def.progression.paths;
  if (paths.length !== 5) p(`must have 5 paths, found ${paths.length}`);
  for (const path of paths) {
    if (path.nodes.length !== 5) p(`path "${path.name}" must be 5 rows deep`);
    const cats = path.nodes.map((n) => n.category).join(",");
    if (cats !== "foundation,behavior,resource,mutation,keystone") {
      p(`path "${path.name}" categories are "${cats}", expected the canonical order`);
    }
  }
  const pathNames = new Set(paths.map((x) => x.name));

  // --- unlocks: 6 hybrids + >=1 mythic, well-formed, referencing real paths ---
  const hybrids = def.unlocks.filter((u) => u.tier === "hybrid");
  const mythics = def.unlocks.filter((u) => u.tier === "mythic");
  if (hybrids.length !== 6) p(`must define 6 cross-path hybrids, found ${hybrids.length}`);
  if (mythics.length < 1) p(`must define at least one Mythic Archetype, found ${mythics.length}`);
  for (const u of def.unlocks) {
    for (const problem of validateUnlockDef(u)) p(problem);
    for (const req of u.requires) {
      if (!pathNames.has(req.path)) p(`unlock ${u.id} requires unknown path "${req.path}"`);
    }
    if (u.classId !== def.classId) p(`unlock ${u.id} claims classId ${u.classId}`);
  }

  // --- every path is reachable by a hybrid, so no path is a dead end ---
  for (const name of pathNames) {
    if (!hybrids.some((h) => h.requires.some((r) => r.path === name))) {
      p(`path "${name}" is named by no hybrid`);
    }
  }

  return problems;
}

/** Roster-wide checks: the "no skill shared between classes" rule, above all. */
export function validateRoster(classes: readonly PilotClass[]): string[] {
  const problems: string[] = [];
  const owner = new Map<string, string>();
  for (const c of classes) {
    for (const a of c.abilities) {
      const prev = owner.get(a.id);
      if (prev) problems.push(`ability id "${a.id}" is claimed by both ${prev} and ${c.classId}`);
      owner.set(a.id, c.classId);
      const prevName = owner.get(`name:${a.name}`);
      if (prevName && prevName !== c.classId) {
        problems.push(`skill name "${a.name}" is used by both ${prevName} and ${c.classId}`);
      }
      owner.set(`name:${a.name}`, c.classId);
    }
    const dupClassId = classes.filter((x) => x.classId === c.classId);
    if (dupClassId.length > 1) problems.push(`classId "${c.classId}" is defined more than once`);
  }
  return problems;
}
