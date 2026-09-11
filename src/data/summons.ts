/**
 * Every distinct summon `unit` id in the game, walked from the data rather than
 * hand-maintained — the docket §36 renderer seam (a sprite per summoned unit) and the
 * co-op wire both need this list, and CLAUDE.md's own rule is that **a check's scope
 * must come from somewhere other than the thing under test**: a typed literal here would
 * be exactly the kind of scope that can silently stop covering a new unit the day
 * someone adds one to a class file, a relic or a named item and forgets this list exists.
 *
 * A `{ kind: "summon" }` step can originate from four places, and all four are walked:
 *
 *   1. an ability's own `effects` / `followUp.effects`
 *   2. a class tree node's `grantEffect.effects`, or the ops of a `mutate` node's
 *      `SkillMutation` (`addEffect` / `replaceEffects` / `trigger` / `followUp` ops all
 *      carry their own `effects`; a `summon` op only ever *adjusts* an existing step's
 *      count/duration and never introduces a new `unit`)
 *   3. a hybrid/archetype `PathUnlockDef`'s own `effects` and its separate top-level
 *      `mutations`, same shape as #2
 *   4. a `RelicDef`'s `effects` (the tree's full `NodeEffect` vocabulary) and a
 *      `NamedItemDef`'s `effects` (the same vocabulary minus `mods`) — CLAUDE.md's
 *      Named/Relics sections are explicit that both fold through the same effect path a
 *      tree node uses, so a summon-granting relic or named item is exactly as real a
 *      source as a class node.
 *
 * `SUMMON_UNITS` is also the co-op wire's registry for a minion's unit id, the same
 * pattern `RELICS`/`AUGMENTS` already use for a dropped relic (`net/sync.ts`: "a relic on
 * the floor is its registry index — both ends run the same build"). Deriving it from this
 * same walk, rather than a second hand-typed array, is what keeps the wire table and the
 * `tools/summonart.ts` gate from being able to disagree about what exists.
 */

import type { EffectStep } from "../combat/ability";
import { ALL_CLASSES } from "../progression";
import type { MutationOp, SkillMutation } from "../progression/mutations";
import type { NodeEffect } from "../progression/nodes";
import { NAMED_ITEMS } from "./named";
import { RELICS } from "./relics";

/** Every `EffectStep` shape that carries a nested `effects` list of its own. */
function walkSteps(steps: readonly EffectStep[], into: Set<string>): void {
  for (const s of steps) {
    if (s.kind === "summon") into.add(s.unit);
    if (s.kind === "delay" || s.kind === "reactive" || s.kind === "followUp") walkSteps(s.effects, into);
    if (s.kind === "random") for (const c of s.choices) walkSteps(c.effects, into);
    if (s.kind === "projectile" && s.projectile.onExpire) walkSteps(s.projectile.onExpire, into);
    if ((s.kind === "consumeStatus" || s.kind === "consumeSummons") && s.then) walkSteps(s.then, into);
  }
}

/** The op kinds that carry their own `effects: EffectStep[]` to recurse into. */
function walkMutationOps(ops: readonly MutationOp[], into: Set<string>): void {
  for (const op of ops) {
    if (op.kind === "addEffect" || op.kind === "replaceEffects" || op.kind === "trigger" || op.kind === "followUp") {
      walkSteps(op.effects, into);
    }
    // Every other op kind rewrites a field on an existing step (damage, targeting,
    // projectile count, a summon's own count/duration, ...) and cannot introduce a unit
    // id that isn't already reachable from wherever the step it targets lives.
  }
}

function walkMutations(mutations: readonly SkillMutation[], into: Set<string>): void {
  for (const m of mutations) walkMutationOps(m.ops, into);
}

function walkNodeEffects(effects: readonly NodeEffect[], into: Set<string>): void {
  for (const e of effects) {
    if (e.kind === "grantEffect") walkSteps(e.effects, into);
    if (e.kind === "mutate") walkMutations([e.mutation], into);
  }
}

/**
 * Which source(s) granted each unit, so "where does `kept_name` come from" is a question
 * the walk answers rather than something to re-derive by eye a third time — the exact gap
 * that made a real report ("named items") land on the wrong file (relics) for two of the
 * 27, harmlessly here but not in general.
 */
function collectSummonSources(): Map<string, Set<string>> {
  const bySource = new Map<string, Set<string>>();
  const record = (label: string, found: ReadonlySet<string>): void => {
    for (const unit of found) {
      if (!bySource.has(unit)) bySource.set(unit, new Set());
      bySource.get(unit)!.add(label);
    }
  };

  for (const def of ALL_CLASSES) {
    for (const ability of def.abilities) {
      const found = new Set<string>();
      walkSteps(ability.effects, found);
      if (ability.followUp) walkSteps(ability.followUp.effects, found);
      record(`${def.classId}:${ability.id}`, found);
    }
    for (const path of def.progression.paths) {
      for (const node of path.nodes) {
        const found = new Set<string>();
        walkNodeEffects(node.effects, found);
        record(`${def.classId}:node:${node.name}`, found);
      }
    }
    for (const unlock of def.unlocks) {
      const found = new Set<string>();
      walkNodeEffects(unlock.effects, found);
      if (unlock.mutations) walkMutations(unlock.mutations, found);
      record(`${def.classId}:unlock:${unlock.id}`, found);
    }
  }

  for (const relic of RELICS) {
    const found = new Set<string>();
    walkNodeEffects(relic.effects, found);
    record(`relic:${relic.id}`, found);
  }
  for (const named of NAMED_ITEMS) {
    if (!named.effects) continue;
    const found = new Set<string>();
    walkNodeEffects(named.effects, found);
    record(`named:${named.id}`, found);
  }

  return bySource;
}

const SUMMON_UNIT_SOURCES: ReadonlyMap<string, ReadonlySet<string>> = collectSummonSources();

/**
 * Every summon unit id that exists anywhere in the game today, alphabetised for a
 * deterministic wire index (both ends of a co-op session run the identical bundle, so
 * this array is identical on both — the same guarantee `RELICS`'s declaration order
 * already gives the relic-drop wire encoding).
 */
export const SUMMON_UNITS: readonly string[] = [...SUMMON_UNIT_SOURCES.keys()].sort();

/** Where a unit id was found — `classId:abilityId`, `classId:unlock:id`, `relic:id`, `named:id`. */
export function summonUnitSources(unit: string): readonly string[] {
  return [...(SUMMON_UNIT_SOURCES.get(unit) ?? [])].sort();
}
