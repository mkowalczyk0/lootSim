/**
 * Human-readable descriptions of what a tree node / hybrid / archetype actually does.
 *
 * The class files already carry plain-language text for most of the work — every
 * `SkillMutation.label` ("Ricochet Shot fires a burst"), every keystone `rule.note`
 * ("Every hook you land reduces your melee cooldowns"), most `grantEffect.note`s. What
 * was missing was a place that reads a node's `effects[]` and turns them into a line the
 * Tree tab can print, instead of the generic category label the UI fell back to.
 *
 * Pure. No DOM, no `Player`. The caller passes small lookup callbacks (`abilityName`,
 * `resourceLabel`) so this file never has to import the class registry and risk a cycle.
 */

import type { EffectStep } from "../combat/ability";
import type { ResourceGenRule, ResourceEventType } from "../combat/resources";
import { modLine, type ModKey } from "../data/mods";
import type { NodeCategory, NodeEffect, ResourceRulePatch, TreeNodeV2 } from "./nodes";
import type { PathUnlockDef } from "./unlocks";

export interface DescribeCtx {
  /** Display name for an ability id, e.g. `corsair.boarding_cut` → "Boarding Cut". */
  abilityName?: (id: string) => string | undefined;
  /** Display label for a resource id, e.g. `crew` → "Crew". */
  resourceLabel?: (id: string) => string | undefined;
}

const CATEGORY_GLOSS: Record<NodeCategory, string> = {
  foundation: "Foundation — strengthens the path's core",
  behavior: "Behaviour — changes how a skill plays",
  resource: "Resource — changes generation, spend or thresholds",
  mutation: "Mutation — rewrites one of your abilities",
  keystone: "Keystone — flips a rule of the build",
};

export function categoryGloss(category: NodeCategory): string {
  return CATEGORY_GLOSS[category];
}

/** How a resource-generation event reads in a sentence. */
const EVENT_PHRASING: Partial<Record<ResourceEventType, string>> = {
  kill: "on a kill",
  enemyDeath: "when an enemy dies",
  summonDeath: "when one of your summons dies",
  corpseCreated: "when a corpse is left",
  crit: "on a critical hit",
  hitDealt: "when you land a hit",
  hitTaken: "when you are hit",
  damageDealt: "for damage you deal",
  damageTaken: "for damage you take",
  damagePrevented: "for damage you prevent",
  manaSpent: "when you spend mana",
  resourceSpent: "when you spend your resource",
  ailmentInflicted: "when you inflict an ailment",
  statusApplied: "when you apply a status",
  dashStart: "when you dash",
  skillUse: "when you cast a skill",
  move: "as you move",
  enterCombat: "entering combat",
  leaveCombat: "leaving combat",
};

function genRuleLine(rule: ResourceGenRule, resLabel: string): string {
  const when = EVENT_PHRASING[rule.on] ?? `on ${rule.on}`;
  const tagPart = rule.requireTags && rule.requireTags.length > 0
    ? ` (${rule.requireTags.join("/")} skills)`
    : "";
  const per = rule.perUnit ? ` scaled by ${rule.perUnit === "damage" ? "the damage" : rule.perUnit}` : "";
  return `+${round(rule.amount)} ${resLabel} ${when}${tagPart}${per}`;
}

function patchLines(resLabel: string, patch: ResourceRulePatch): string[] {
  const out: string[] = [];
  if (patch.max !== undefined) out.push(`${resLabel} capacity → ${round(patch.max)}`);
  if (patch.regenPerSec !== undefined) out.push(`${resLabel} regenerates ${round(patch.regenPerSec)}/s`);
  if (patch.decayPerSec !== undefined) out.push(`${resLabel} decays ${round(patch.decayPerSec)}/s`);
  if (patch.decayDelay !== undefined) out.push(`${resLabel} holds ${round(patch.decayDelay)}s before decaying`);
  for (const g of patch.addGeneration ?? []) out.push(genRuleLine(g, resLabel));
  if (patch.addThresholds && patch.addThresholds.length > 0) {
    out.push(`${resLabel} gains ${patch.addThresholds.length} threshold effect${patch.addThresholds.length > 1 ? "s" : ""}`);
  }
  return out;
}

function stepPhrase(step: EffectStep): string {
  switch (step.kind) {
    case "damage": return "deal extra damage";
    case "status": return `apply ${labelize(String(step.status))}`;
    case "pull": return "pull enemies in";
    case "knockback": return "knock enemies back";
    case "heal": return "heal";
    case "shield": return "grant a shield";
    case "summon": return "summon an ally";
    case "zone": return "leave a zone on the ground";
    case "resource": return "restore your resource";
    case "move": return "reposition";
    case "cleanse": return "cleanse a debuff";
    case "interrupt": return "interrupt nearby casts";
    case "spreadStatus": return "spread its effects";
    case "terrain": return "raise terrain";
    case "threat": return "shift enemy threat";
    default: return step.kind;
  }
}

function grantLine(on: { tag?: string; event?: string }, effects: readonly EffectStep[]): string {
  const trigger = on.tag
    ? `every ${labelize(on.tag)} skill`
    : on.event
      ? (EVENT_PHRASING[on.event as ResourceEventType] ?? `on ${on.event}`)
      : "each cast";
  const what = effects.length > 0 ? effects.map(stepPhrase).join(", ") : "an added effect";
  return `On ${trigger}: ${what}.`;
}

/** One `NodeEffect` as a sentence, or null when it carries nothing worth printing. */
export function describeEffect(eff: NodeEffect, ctx: DescribeCtx = {}): string | null {
  switch (eff.kind) {
    case "mods": {
      const parts = Object.entries(eff.mods)
        .filter(([, v]) => v !== undefined && v !== 0)
        .map(([k, v]) => modLine(k as ModKey, v as number));
      return parts.length > 0 ? parts.join(", ") : null;
    }
    case "mutate": {
      const t = eff.mutation.target;
      const name = t.abilityId ? ctx.abilityName?.(t.abilityId) : undefined;
      const label = eff.mutation.label ?? "rewrites an ability";
      if (!name) return upperFirst(label);
      // Labels are written inconsistently — some already lead with the ability name
      // ("Ricochet Shot fires a burst"), some describe the effect ("hooked targets…").
      return label.toLowerCase().startsWith(name.toLowerCase())
        ? upperFirst(label)
        : `${name}: ${lowerFirst(label)}`;
    }
    case "rule":
      return eff.note ?? null;
    case "grantEffect":
      return eff.note ?? grantLine(eff.on, eff.effects);
    case "resourceRule": {
      const resLabel = ctx.resourceLabel?.(eff.resource) ?? labelize(eff.resource);
      return patchLines(resLabel, eff.patch).join("; ") || null;
    }
  }
}

/** Every describable line from a list of effects, one per effect that carries something. */
export function describeEffects(effects: readonly NodeEffect[], ctx: DescribeCtx = {}): string[] {
  const lines: string[] = [];
  for (const eff of effects) {
    const line = describeEffect(eff, ctx);
    if (line) lines.push(line);
  }
  return lines;
}

/** Every describable line for a node, one per effect. */
export function describeNodeLong(node: TreeNodeV2, ctx: DescribeCtx = {}): string[] {
  return describeEffects(node.effects, ctx);
}

/**
 * A single, short line for a node — the tree-column view. Falls back to the category
 * gloss. Kept brief on purpose: the full per-effect breakdown is shown in the aside.
 */
export function describeNode(node: TreeNodeV2, ctx: DescribeCtx = {}): string {
  const lines = describeNodeLong(node, ctx);
  if (lines.length === 0) return categoryGloss(node.category);
  return clamp(lines.join(" · "), 96);
}

function clamp(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).replace(/[\s,;:.·]+\S*$/, "") + "…";
}

// --- hybrids & archetypes ------------------------------------------------

export interface UnlockProgress {
  met: boolean;
  parts: { path: string; have: number; need: number; ok: boolean }[];
}

/** How close an allocation is to unlocking a hybrid / archetype. */
export function unlockProgress(
  def: PathUnlockDef,
  pointsByPath: Record<string, number>,
): UnlockProgress {
  const parts = def.requires.map((req) => {
    const have = pointsByPath[req.path] ?? 0;
    return { path: req.path, have, need: req.points, ok: have >= req.points };
  });
  return { met: parts.every((p) => p.ok), parts };
}

/** "Boarding Captain 3 + Chainmaster 2" — the requirement, plainly. */
export function unlockRequirement(def: PathUnlockDef): string {
  return def.requires.map((r) => `${r.path} ${r.points}`).join(" + ");
}

// --- helpers -----------------------------------------------------------

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function labelize(id: string): string {
  return id.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0]!.toLowerCase() + s.slice(1) : s;
}

function upperFirst(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}
