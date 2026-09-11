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
 *   - `runReactiveWindows` — subscribes the hero's `AbilityRuntime` to the same bus so a
 *     `reactive` effect step's window can be *closed* by the event it names. This is the
 *     other half of the executor: `AbilityRuntime.notify` exists to fire those, and
 *     before this it had no callers, so every reactive window in the roster expired
 *     unused.
 */

import {
  runEffect,
  type AbilityRuntime,
  type Ability,
  type CastInput,
  type CombatEvent,
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

/** How far around the caster a granted effect reaches when the event names no target. */
const GRANT_REACH = 220;

/**
 * Everything a granted effect might want to land on. The event that fired it comes
 * first: a `hit` names the thing that was hit and where, a `kill` names where the body
 * fell, so `to: "target"` resolves to *that* enemy and a zone lands *there*. Anything the
 * event doesn't say falls back to the caster — every hostile within reach, at the
 * caster's own feet — which is all the pre-fix version ever did, and which left an
 * on-hit grant unable to reach the enemy it was meant to punish if that enemy was more
 * than `GRANT_REACH` away (a bow shot, a staff bolt, a thrown chakram).
 */
function grantTargets(host: CombatHost, casterId: number, evt: CombatEvent | null): TargetResult {
  const caster = host.actor(casterId);
  const origin = caster ? { x: caster.x, y: caster.y } : { x: 0, y: 0 };
  const point = evt && evt.x !== undefined && evt.y !== undefined ? { x: evt.x, y: evt.y } : origin;
  const actorIds: number[] = [];
  const struck = evt?.targetId !== undefined ? host.actor(evt.targetId) : undefined;
  if (struck && struck.alive && struck.faction === "enemy") actorIds.push(struck.id);
  for (const actor of host.actors()) {
    if (!actor.alive || actor.faction !== "enemy" || actor.id === struck?.id) continue;
    if (Math.hypot(actor.x - origin.x, actor.y - origin.y) <= GRANT_REACH) actorIds.push(actor.id);
  }
  return { actorIds, point };
}

/**
 * Subscribes each grant in `build` to `bus`. A grant keyed on `on.event` listens for
 * that combat event directly; one keyed on `on.tag` fires on any `skillUse` /
 * `ultimateUse` carrying the tag. Returns an unsubscribe for the whole set.
 */
/**
 * The events a `reactive` effect step may key on that the simulation actually broadcasts.
 *
 * `summonDeath` is authored twice across the roster and is emitted nowhere, so a reactive
 * keyed on it still cannot fire; that is a separate gap in the event vocabulary, tracked
 * in `docs/class-validation.md`, not something this wiring can paper over.
 */
export const REACTIVE_EVENTS: readonly CombatEventType[] = [
  "damageTaken", "hit", "criticalHit", "dodge", "kill", "enemyDeath", "skillUse", "ultimateUse",
];

/**
 * Subscribes one hero's `AbilityRuntime` to the combat bus so a `reactive` step — "if you
 * are hit in the next four seconds, retaliate" — can actually fire.
 *
 * Without this, `AbilityRuntime.notify` had no callers anywhere in the project and every
 * reactive window authored across the roster opened and expired unused. The Duelist owns
 * three of them and is built entirely around countering, which is a large part of why it
 * measured last on damage.
 *
 * `enemyDeath` is about the *dier*, so it goes to every hero; every other event names the
 * hero it is about in `actorId` and is filtered to them, so one player's dodge cannot fire
 * another player's counter.
 */
export function runReactiveWindows(
  bus: EventBus,
  host: CombatHost,
  rt: AbilityRuntime,
  casterId: number,
): () => void {
  const unsubs: (() => void)[] = [];
  for (const type of REACTIVE_EVENTS) {
    unsubs.push(bus.on(type, (evt) => {
      if (type !== "enemyDeath" && evt.actorId !== casterId) return;
      rt.notify(type, host);
    }));
  }
  return () => {
    for (const u of unsubs) u();
  };
}

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

  const fireGrant = (grant: GrantedEffect, evt: CombatEvent | null) => {
    const caster = host.actor(casterId);
    if (!caster) return;
    const targets = grantTargets(host, casterId, evt);
    const ctx: EffectContext = {
      ability: GRANT_ABILITY,
      casterId,
      targets,
      origin: { x: caster.x, y: caster.y },
      facing: facing(),
      input: castInput(),
      // THE ULTIMATE RULE reaches the grant path (docket §33). A tag-gated grant is
      // subscribed to `skillUse` *and* `ultimateUse` below, so an ultimate that happens to
      // carry the gating tag fires the grant on its own cast. Stamping the source here is
      // what lets `runEffect`'s `resource` step refuse to pay the ultimate meter for it —
      // one site, rather than a flag every grant author has to remember.
      source: {
        actorId: casterId, actorKind: "hero", abilityId: "build.grant", tags: [],
        ...(evt?.type === "ultimateUse" ? { fromUltimate: true } : {}),
      },
    };
    for (const step of grant.effects) runEffect(host, ctx, step as EffectStep, rt);
  };

  // Every event but `enemyDeath` is *about* the hero in `actorId` — the one who landed
  // the hit, took the damage, dodged, cast, killed. A grant belongs to one hero, so it
  // only fires for that hero's events: before this filter, every party member's on-kill
  // grant went off on anyone's kill, and one player's dodge fired another's counter.
  // `enemyDeath` is about the dier and stays broadcast, exactly like `runReactiveWindows`.
  const mine = (evt: CombatEvent): boolean => evt.type === "enemyDeath" || evt.actorId === casterId;

  for (const grant of build.grants) {
    if (grant.on.event) {
      unsubs.push(bus.on(grant.on.event as CombatEventType, (evt) => {
        if (mine(evt)) fireGrant(grant, evt);
      }));
    } else if (grant.on.tag) {
      const opts = { requireTags: [grant.on.tag as SkillTag] };
      const onCast = (evt: CombatEvent) => {
        if (mine(evt)) fireGrant(grant, evt);
      };
      unsubs.push(bus.on("skillUse", onCast, opts));
      unsubs.push(bus.on("ultimateUse", onCast, opts));
    }
  }

  return () => {
    for (const u of unsubs) u();
  };
}
