/**
 * The bridge between a resolved build's *rules* / *grants* and the live dungeon.
 *
 * `ResolvedBuild` hands the dungeon three things beyond a stat block: `mutations`
 * (already folded into each ability by `applyBuild`), `rules` (named keystone /
 * hybrid / archetype flips), and `grants` (effect steps hung off a tag or an event).
 * The mutations need no help — the executor casts the mutated ability. This file wires
 * the other two:
 *
 *   - `applyRuleFx` — a small, data-keyed reaction to a rule being present on a cast.
 *     Most rules do their work through the mutation the same node carries; only a few
 *     want a bespoke on-cast flourish, and for now those are deliberately conservative
 *     (a screen shake so the keystone reads) pending the validation pass.
 *   - `runBuildGrants` — subscribes every `GrantedEffect` to the combat `EventBus` so
 *     "every thrust also applies Exposed" or "a crit exposes the target" fire their
 *     effect steps through the same `runEffect` the executor uses.
 */

import {
  runEffect,
  type AbilityRuntime,
  type Ability,
  type CastInput,
  type CombatEventType,
  type CombatHost,
  type EffectContext,
  type EffectStep,
  type EventBus,
  type SkillTag,
  type TargetResult,
} from "../combat/index";
import type { GrantedEffect, ResolvedBuild } from "../progression/index";
import type { RunEvent } from "./dungeon";

export interface BuildRuleContext {
  rules: ReadonlySet<string>;
  hero: { index: number; avatar: { x: number; y: number; facing: number } };
  emit(ev: RunEvent): void;
  shake(amount: number): void;
}

/** True when any active rule id ends with `suffix` (rules are `<class>.<path>.<name>`). */
function ruleEndsWith(rules: ReadonlySet<string>, suffix: string): boolean {
  for (const r of rules) if (r.endsWith(suffix)) return true;
  return false;
}

/**
 * A cast just happened and the caster carries `ctx.rules`. Produce whatever bespoke
 * on-cast reaction a present rule calls for. Kept intentionally small — a rule that
 * only changes numbers does that through its mutation, not here.
 */
export function applyRuleFx(ctx: BuildRuleContext, ability: Ability): void {
  if (ctx.rules.size === 0) return;
  const a = ctx.hero.avatar;
  if (ability.tags.includes("charge") && ruleEndsWith(ctx.rules, "living_projectile")) {
    ctx.shake(6);
  }
  if (ability.isUltimate && ruleEndsWith(ctx.rules, "blood_god")) {
    ctx.emit({ kind: "nova", x: a.x, y: a.y, radius: 90 });
  }
}

// --- grants ------------------------------------------------------------

/** A throwaway ability shell so `runEffect` has something to read `ctx.ability` off. */
const GRANT_ABILITY: Ability = {
  id: "build.grant",
  name: "Granted Effect",
  description: "",
  category: "utility",
  tags: [],
  cooldown: 0,
  targeting: "self",
  effects: [],
};

/**
 * Everything a granted effect might want to land on: the enemies near the caster (for
 * `to: "allTargets" | "enemies"`), plus the point and facing so a zone lands sensibly.
 */
function grantTargets(host: CombatHost, casterId: number, radius: number): TargetResult {
  const caster = host.actor(casterId);
  const origin = caster ? { x: caster.x, y: caster.y } : { x: 0, y: 0 };
  const actorIds: number[] = [];
  for (const actor of host.actors()) {
    if (!actor.alive || actor.faction !== "enemy") continue;
    if (Math.hypot(actor.x - origin.x, actor.y - origin.y) <= radius) actorIds.push(actor.id);
  }
  return { actorIds, point: origin };
}

/**
 * Subscribes each grant in `build` to `bus`. A grant keyed on `on.event` listens for
 * that combat event directly; one keyed on `on.tag` fires on any `skillUse` /
 * `ultimateUse` carrying the tag. Returns an unsubscribe for the whole set.
 */
export function runBuildGrants(
  bus: EventBus,
  build: ResolvedBuild,
  host: CombatHost,
  rt: AbilityRuntime,
  casterId: number,
  castInput: () => CastInput,
  facing: () => number,
): () => void {
  const unsubs: (() => void)[] = [];

  const fireGrant = (grant: GrantedEffect) => {
    const caster = host.actor(casterId);
    if (!caster) return;
    const ctx: EffectContext = {
      ability: GRANT_ABILITY,
      casterId,
      targets: grantTargets(host, casterId, 220),
      origin: { x: caster.x, y: caster.y },
      facing: facing(),
      input: castInput(),
      source: { actorId: casterId, actorKind: "hero", abilityId: "build.grant", tags: [] },
    };
    for (const step of grant.effects) runEffect(host, ctx, step as EffectStep, rt);
  };

  for (const grant of build.grants) {
    if (grant.on.event) {
      unsubs.push(bus.on(grant.on.event as CombatEventType, () => fireGrant(grant)));
    } else if (grant.on.tag) {
      const opts = { requireTags: [grant.on.tag as SkillTag] };
      unsubs.push(bus.on("skillUse", () => fireGrant(grant), opts));
      unsubs.push(bus.on("ultimateUse", () => fireGrant(grant), opts));
    }
  }

  return () => {
    for (const u of unsubs) u();
  };
}
