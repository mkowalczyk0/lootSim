/**
 * The ability executor.
 *
 * `castAbility` is the whole point of the vocabulary: pay the costs, resolve the
 * targets, then run the effect steps in order through one `runEffect` dispatcher.
 * There is no `switch (class)` and no `switch (skill id)` — a step knows how to do
 * itself, and a class's kit is a list of steps.
 *
 * Cooldowns are keyed by ability id here, not by equip slot, so re-slotting a skill
 * keeps its timer and a tag-targeted "reduce cooldown of bleed skills" is expressible.
 *
 * THE ULTIMATE RULE is enforced in one place: every packet this executor builds for an
 * ultimate is stamped `fromUltimate`, and the resource layer refuses those.
 */

import {
  abilityBlocksUltimateCharge,
  type Ability,
  type EffectStep,
  type EffectTargetSel,
} from "./ability";
import { makeDamagePacket, type DamagePacket, type DamageSource, type DamageType } from "./damage";
import type { CombatHost, HostActor } from "./host";
import type { ResourceEvent } from "./resources";
import { resolveTargets, type TargetContext, type TargetResult } from "./targeting";

export interface CastInput {
  aim?: { x: number; y: number };
  currentTargetId?: number;
  /** Multiplier on the cooldown that gets set (1 / (1 + cooldownRate)). */
  cooldownMult?: number;
  /** The caster's attack-damage number, for `scale: "attack"`. */
  attackDamage?: number;
  /** The caster's spell-damage number, for `scale: "spell"`. */
  spellDamage?: number;
  /** Ailment potency multiplier the caster carries. */
  ailmentPotency?: number;
  /** Crit chance 0..1, used when a damage template allows crits. */
  critChance?: number;
  /** Positions the caster recently occupied, newest first — for `temporalAnchor` targeting. */
  positionHistory?: readonly { x: number; y: number }[];
}

export type CastFailure =
  | "unknown-caster"
  | "on-cooldown"
  | "cannot-afford"
  | "silenced";

export interface CastResult {
  ok: boolean;
  failure?: CastFailure;
  targets?: TargetResult;
  /** Deferred effects the caller should tick down and fire (delay / reactive / follow-up). */
  pending: PendingEffect[];
  /**
   * True when this press spent an open follow-up window rather than casting afresh. It
   * paid no cost and set no cooldown, so a caller that fires per-cast rule hooks should
   * not fire them again — the combo is the tail of the first press, not a second one.
   */
  fromFollowUp?: boolean;
}

export interface PendingEffect {
  kind: "delay" | "reactive" | "followUp";
  fireAt?: number;
  event?: string;
  expiresAt?: number;
  effects: EffectStep[];
  ctx: EffectContext;
}

export interface EffectContext {
  ability: Ability;
  casterId: number;
  targets: TargetResult;
  origin: { x: number; y: number };
  facing: number;
  input: CastInput;
  /** Stamped onto every packet this cast produces. */
  source: DamageSource;
}

/** Per-actor ability state: cooldowns and charge stacks, keyed by ability id. */
export class AbilityRuntime {
  private cooldowns = new Map<string, number>();
  private charges = new Map<string, number>();
  readonly pending: PendingEffect[] = [];

  /** Queue a deferred effect (delay / reactive / follow-up). */
  schedule(p: PendingEffect): void {
    this.pending.push(p);
  }

  cooldownRemaining(abilityId: string): number {
    return this.cooldowns.get(abilityId) ?? 0;
  }

  /** Ability ids currently on cooldown. For rule handlers that refund by predicate. */
  cooldownIds(): string[] {
    return [...this.cooldowns.keys()];
  }

  /** Clear one ability's cooldown outright — a keystone "refreshes X". */
  clearCooldown(abilityId: string): void {
    this.cooldowns.delete(abilityId);
  }

  /** Shave `seconds` off one ability's cooldown; clears it if that takes it to zero. */
  reduceCooldown(abilityId: string, seconds: number): void {
    const cur = this.cooldowns.get(abilityId);
    if (cur === undefined) return;
    const next = cur - seconds;
    if (next <= 0) this.cooldowns.delete(abilityId);
    else this.cooldowns.set(abilityId, next);
  }

  /** Shave `seconds` off every cooldown whose id passes `pred` (default: all). */
  reduceCooldowns(seconds: number, pred: (abilityId: string) => boolean = () => true): void {
    for (const id of [...this.cooldowns.keys()]) {
      if (pred(id)) this.reduceCooldown(id, seconds);
    }
  }

  ready(ability: Ability): boolean {
    if ((this.cooldowns.get(ability.id) ?? 0) > 0) {
      if (ability.charges) return (this.charges.get(ability.id) ?? ability.charges.max) > 0;
      return false;
    }
    return true;
  }

  /**
   * Removes every pending entry `match` accepts and hands them back, newest first —
   * *before* any of them has run.
   *
   * This exists because a pending entry's effects re-enter this runtime. `runEffect` can
   * deal damage, damage makes the host emit, and an emit calls `notify`, which spends
   * pending entries of its own. So an index walked across a `runEffect` call is an index
   * into an array that call may have rebuilt underneath it: the index goes stale,
   * `this.pending[i]` is `undefined`, and reading a field off it throws — in a browser,
   * that ends the run. Claiming first also means the re-entrant call sees these entries
   * as already spent, so nothing fires twice.
   *
   * The loop below splices, but it calls nothing while it does, which is the whole point.
   */
  private claim(match: (p: PendingEffect) => boolean): PendingEffect[] {
    const taken: PendingEffect[] = [];
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p && match(p)) {
        this.pending.splice(i, 1);
        taken.push(p);
      }
    }
    return taken;
  }

  /** Advances cooldowns, charge recharge, and fires due delayed effects. */
  tick(dt: number, host: CombatHost): void {
    for (const [id, t] of this.cooldowns) {
      const next = t - dt;
      if (next <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, next);
    }
    const now = host.now();
    const due = (p: PendingEffect): boolean =>
      p.kind === "delay" && p.fireAt !== undefined && now >= p.fireAt;
    // A window that ran out is claimed alongside the due ones and then simply dropped: a
    // `reactive` whose event never came, or a follow-up combo the player did not press in
    // time. Both are misses, not effects owed. What must never happen is a window closing
    // *unnoticed* — `notify` and `takeFollowUp` are the two things that can spend one.
    for (const p of this.claim((p) => due(p) || (p.expiresAt !== undefined && now >= p.expiresAt))) {
      if (due(p)) for (const step of p.effects) runEffect(host, p.ctx, step, this);
    }
  }

  /**
   * Is a follow-up window open for `abilityId`? A second press would spend it, which is
   * why this has to be asked *before* a caller's own cooldown gate: the ability is
   * supposed to be cooling down while its combo window is live.
   */
  followUpOpen(abilityId: string, host: CombatHost): boolean {
    const now = host.now();
    return this.pending.some(
      (p) => p.kind === "followUp" && p.ctx.ability.id === abilityId && (p.expiresAt ?? 0) >= now,
    );
  }

  /** Takes the open follow-up window for `abilityId`, removing it. */
  private takeFollowUp(abilityId: string, host: CombatHost): PendingEffect | null {
    const now = host.now();
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i]!;
      if (p.kind === "followUp" && p.ctx.ability.id === abilityId && (p.expiresAt ?? 0) >= now) {
        this.pending.splice(i, 1);
        return p;
      }
    }
    return null;
  }

  /**
   * Runs a follow-up's effects as what `Ability.followUp` says it is — "effects available
   * for a short window after the cast, on a second press".
   *
   * Targeting is re-resolved against where the caster is standing and aiming *now*: a
   * second press is a press, and a three-to-six second window is long enough that the
   * first cast's target list has gone stale. The original cast's `DamageSource` is kept
   * verbatim, though, so attribution — and specifically THE ULTIMATE RULE's
   * `fromUltimate` stamp — cannot be laundered off an ultimate by comboing out of it.
   *
   * It deliberately broadcasts no `skillUse`/`ultimateUse`. Those events feed the
   * ultimate meters, and crediting a combo as a second cast would quietly change the
   * fill rate of every class that has one — a balance change, which is not what fixing
   * an executor bug is allowed to smuggle in.
   */
  private runFollowUp(
    host: CombatHost,
    caster: HostActor,
    casterId: number,
    ability: Ability,
    input: CastInput,
    pending: PendingEffect,
  ): CastResult {
    const tctx: TargetContext = {
      casterId,
      casterFaction: caster.faction,
      origin: { x: caster.x, y: caster.y },
      facing: Math.atan2((input.aim?.y ?? caster.y) - caster.y, (input.aim?.x ?? caster.x + 1) - caster.x),
      ...(input.aim ? { aim: input.aim } : {}),
      ...(input.currentTargetId !== undefined ? { currentTargetId: input.currentTargetId } : {}),
      range: ability.range ?? 0,
      ...(ability.shape ? { shape: ability.shape } : {}),
      ...(input.positionHistory ? { positionHistory: input.positionHistory } : {}),
    };
    const targets = resolveTargets(ability.targeting, tctx, host);
    const ctx: EffectContext = {
      ability,
      casterId,
      targets,
      origin: tctx.origin,
      facing: tctx.facing,
      input,
      source: pending.ctx.source,
    };
    for (const step of pending.effects) runEffect(host, ctx, step, this);
    return { ok: true, targets, pending: [...this.pending], fromFollowUp: true };
  }

  /**
   * A reactive step's event fired — run its effects if the window is still open.
   *
   * Claimed before anything runs, via `claim`. A counter that answers a hit deals damage,
   * and damage makes the host emit `damageTaken` again, which lands back here: the
   * Duelist opens three of these windows and is built entirely around countering, so it
   * is the class that found this. Reproduced on the depth-20 trash floor at seed 72231.
   */
  notify(event: string, host: CombatHost): void {
    const now = host.now();
    const due = this.claim(
      (p) => p.kind === "reactive" && p.event === event && (p.expiresAt ?? Infinity) >= now,
    );
    for (const p of due) for (const step of p.effects) runEffect(host, p.ctx, step, this);
  }

  castAbility(host: CombatHost, casterId: number, ability: Ability, input: CastInput = {}): CastResult {
    const caster = host.actor(casterId);
    if (!caster) return { ok: false, failure: "unknown-caster", pending: [] };

    // An open follow-up window beats the cooldown gate — the ability is *meant* to be
    // cooling down while its combo is live — but not the silence gate, since a combo is
    // still a cast and a silenced caster cannot make one.
    const comboOpen = this.followUpOpen(ability.id, host);
    if (!comboOpen && !this.ready(ability)) {
      return { ok: false, failure: "on-cooldown", pending: [] };
    }

    if (ability.tags.includes("ultimate") === false && caster.statuses.disables().cast) {
      return { ok: false, failure: "silenced", pending: [] };
    }

    if (comboOpen) {
      const combo = this.takeFollowUp(ability.id, host);
      if (combo) return this.runFollowUp(host, caster, casterId, ability, input, combo);
    }

    // --- costs ---
    if (ability.costs && ability.costs.length) {
      const res = caster.resources;
      for (const c of ability.costs) {
        const pool = res?.get(c.resource);
        if (!pool || !pool.canAfford(c.amount)) {
          return { ok: false, failure: "cannot-afford", pending: [] };
        }
      }
      for (const c of ability.costs) {
        const pool = res!.get(c.resource)!;
        const spent = pool.spend(c.amount, {
          spendHealth: (h) => {
            const dealt = host.dealDamage(
              casterId,
              makeDamagePacket({
                amount: h,
                type: "physical",
                channel: "environmental",
                raw: true,
                source: { actorId: casterId, actorKind: "hero", abilityId: ability.id },
              }),
            );
            return dealt;
          },
        });
        // resourceSpent is itself an event some resources feed on (Technique on spend).
        caster.resources?.broadcast({ type: "resourceSpent", amount: spent.fromResource });
        // Mana specifically also emits `manaSpent` (with the fraction fields), which is
        // what a `perUnit: "manaFraction"` rule reads — Magician builds Overcharge and
        // the Astral meter entirely off how much of the bar a cast burned.
        if (pool.spec.id === "mana") {
          caster.resources?.broadcast({
            type: "manaSpent",
            manaSpent: spent.fromResource,
            maxMana: pool.max,
            tags: ability.tags,
            ...(abilityBlocksUltimateCharge(ability) ? { fromUltimate: true } : {}),
          });
        }
      }
    }

    // --- generation the ability itself grants ---
    if (ability.generates) {
      for (const g of ability.generates) caster.resources?.get(g.resource)?.add(g.amount);
    }

    // --- cooldown / charges ---
    const cd = ability.cooldown * (input.cooldownMult ?? 1);
    if (ability.charges) {
      const have = this.charges.get(ability.id) ?? ability.charges.max;
      this.charges.set(ability.id, Math.max(0, have - 1));
      if (have - 1 <= 0) this.cooldowns.set(ability.id, ability.charges.rechargeTime);
    } else if (cd > 0) {
      this.cooldowns.set(ability.id, cd);
    }

    // --- targeting ---
    const tctx: TargetContext = {
      casterId,
      casterFaction: caster.faction,
      origin: { x: caster.x, y: caster.y },
      facing: Math.atan2((input.aim?.y ?? caster.y) - caster.y, (input.aim?.x ?? caster.x + 1) - caster.x),
      ...(input.aim ? { aim: input.aim } : {}),
      ...(input.currentTargetId !== undefined ? { currentTargetId: input.currentTargetId } : {}),
      range: ability.range ?? 0,
      ...(ability.shape ? { shape: ability.shape } : {}),
      ...(input.positionHistory ? { positionHistory: input.positionHistory } : {}),
    };
    const targets = resolveTargets(ability.targeting, tctx, host);

    const source: DamageSource = {
      actorId: casterId,
      actorKind: caster.kind === "enemy" ? "enemy" : "hero",
      abilityId: ability.id,
      tags: ability.tags,
      ...(abilityBlocksUltimateCharge(ability) ? { fromUltimate: true } : {}),
    };

    const ctx: EffectContext = {
      ability,
      casterId,
      targets,
      origin: tctx.origin,
      facing: tctx.facing,
      input,
      source,
    };

    // --- run effects ---
    for (const step of ability.effects) runEffect(host, ctx, step, this);

    // --- events ---
    const evtType = ability.isUltimate ? "ultimateUse" : "skillUse";
    host.bus.emit({
      type: evtType,
      actorId: casterId,
      abilityId: ability.id,
      tags: ability.tags,
      x: caster.x,
      y: caster.y,
      ...(abilityBlocksUltimateCharge(ability) ? { fromUltimate: true } : {}),
    });
    const resEvt: ResourceEvent = ability.isUltimate
      ? { type: "ultimateUse", tags: ability.tags, fromUltimate: abilityBlocksUltimateCharge(ability) }
      : { type: "skillUse", tags: ability.tags };
    caster.resources?.broadcast(resEvt);

    // --- follow-up window ---
    if (ability.followUp) {
      this.schedule({
        kind: "followUp",
        expiresAt: host.now() + ability.followUp.window,
        effects: [...ability.followUp.effects],
        ctx,
      });
    }

    return { ok: true, targets, pending: [...this.pending] };
  }
}

// --- the dispatcher --------------------------------------------------

function selectActorIds(host: CombatHost, ctx: EffectContext, to: EffectTargetSel | undefined): number[] {
  const t = ctx.targets;
  switch (to ?? "allTargets") {
    case "self":
    case "caster":
      return [ctx.casterId];
    case "target":
      return t.actorIds.length ? [t.actorIds[0]!] : [];
    case "allTargets":
      return t.actorIds;
    case "enemies": {
      // "enemies" means every hostile around the caster — NOT the pre-resolved aim list.
      // A self-targeted shout, a delayed ultimate, a reactive retaliation all resolve
      // their victims here, at fire time, from where the caster actually is. Bounded by
      // the ability's `shape.radius` when it has one, field-wide otherwise (a room-wide
      // ultimate like Death Comes Due or Damnation).
      const caster = host.actor(ctx.casterId);
      if (!caster) return [];
      const r = ctx.ability.shape?.radius;
      const hostiles = [...host.actors()].filter((a) => a.alive && a.faction !== caster.faction);
      const bounded = r === undefined
        ? hostiles
        : hostiles.filter((a) => Math.hypot(a.x - caster.x, a.y - caster.y) <= r);
      return bounded.map((a) => a.id);
    }
    case "allies": {
      const caster = host.actor(ctx.casterId);
      if (!caster) return [];
      return [...host.actors()].filter((a) => a.alive && a.faction === caster.faction).map((a) => a.id);
    }
    case "marked": {
      const m = host.markOf(ctx.casterId);
      return m !== undefined ? [m] : [];
    }
    case "lowestHealthAlly": {
      const caster = host.actor(ctx.casterId);
      if (!caster) return [];
      const allies = [...host.actors()].filter((a) => a.alive && a.faction === caster.faction);
      allies.sort((a, b) => a.health / a.maxHealth - b.health / b.maxHealth);
      return allies.length ? [allies[0]!.id] : [];
    }
    case "summons":
      return [...host.summonsOf(ctx.casterId)].map((a) => a.id);
    case "corpse":
      return [];
    case "point":
      return [];
    default:
      return t.actorIds;
  }
}

function scaledAmount(base: number, scale: string | undefined, input: CastInput): number {
  switch (scale) {
    case "attack":
      return base * (input.attackDamage ?? 1);
    case "spell":
      return base * (input.spellDamage ?? 1);
    default:
      return base;
  }
}

function point(ctx: EffectContext): { x: number; y: number } {
  return ctx.targets.point ?? ctx.origin;
}

export function runEffect(
  host: CombatHost,
  ctx: EffectContext,
  step: EffectStep,
  rt: AbilityRuntime,
): void {
  switch (step.kind) {
    case "damage": {
      const dt = step.damage;
      for (const id of selectActorIds(host, ctx, step.to)) {
        const victim = host.actor(id);
        if (!victim) continue;
        let amount = scaledAmount(dt.base, dt.scale, ctx.input);
        if (dt.executeMissingHealth) {
          amount += (victim.maxHealth - victim.health) * dt.executeMissingHealth;
        }
        if (dt.casterMissingHealth) {
          const c = host.actor(ctx.casterId);
          const missing = c ? 1 - c.health / Math.max(1, c.maxHealth) : 0;
          amount *= 1 + dt.casterMissingHealth * missing;
        }
        const crit = dt.canCrit === true && host.random() < (ctx.input.critChance ?? 0);
        const packet: DamagePacket = makeDamagePacket({
          amount,
          type: dt.type as DamageType,
          ...(dt.channel ? { channel: dt.channel } : {}),
          crit,
          source: { ...ctx.source },
          ...(dt.inflict
            ? {
                inflict: {
                  status: dt.inflict.status,
                  chance: dt.inflict.chance,
                  potency: (dt.inflict.potency ?? 1) * (ctx.input.ailmentPotency ?? 1),
                },
              }
            : {}),
          ...(dt.knockback !== undefined ? { knockback: dt.knockback } : {}),
        });
        if (step.damage.channel === undefined && ctx.ability.isUltimate) packet.channel = "ultimate";
        host.dealDamage(id, packet);
      }
      return;
    }

    case "status": {
      const caster = host.actor(ctx.casterId);
      const heroCaster = !!caster && caster.kind !== "enemy" && !!caster.resources;
      for (const id of selectActorIds(host, ctx, step.to)) {
        const victim = host.actor(id);
        if (!victim) continue;
        const landed = victim.statuses.apply(step.status, {
          hitDamage: scaledAmount(step.hitDamage ?? 1, step.scale ?? "attack", ctx.input),
          potency: (step.potency ?? 1) * (ctx.input.ailmentPotency ?? 1),
          sourceActorId: ctx.casterId,
          sourceAbilityId: ctx.ability.id,
          ...(step.chance !== undefined ? { chance: step.chance } : {}),
          ...(step.durationMult !== undefined ? { durationMult: step.durationMult } : {}),
          ...(step.stacks !== undefined ? { stacks: step.stacks } : {}),
          roll: () => host.random(),
        });
        // A hostile status the hero *placed* (a hex, a mark, a slow) feeds
        // `{ on: "statusApplied" }` rules — Shaman's Spirit World, Assassin's Inside
        // Job. Elemental ailments have their own `ailmentInflicted` event and do not
        // come through here, so the two never double-count.
        if (landed && heroCaster && caster && victim.faction !== caster.faction) {
          caster.resources!.broadcast({
            type: "statusApplied",
            tags: ctx.source.tags,
            ...(ctx.source.fromUltimate ? { fromUltimate: true } : {}),
          });
        }
      }
      return;
    }

    case "cleanse": {
      for (const id of selectActorIds(host, ctx, step.to ?? "allies")) {
        const a = host.actor(id);
        if (!a) continue;
        const removed = a.statuses.cleanse({
          ...(step.category ? { category: step.category } : {}),
          ...(step.statuses ? { ids: step.statuses } : {}),
        });
        if (step.thenHealPerStatus && removed.length) {
          host.healActor(id, removed.length * step.thenHealPerStatus, ctx.casterId);
        }
      }
      return;
    }

    case "consumeStatus": {
      for (const id of selectActorIds(host, ctx, step.to)) {
        const a = host.actor(id);
        if (!a) continue;
        const inst = a.statuses.consume(step.status, {
          onDamage: (p) => host.dealDamage(id, p),
          fireEffect: (effectId) => host.emitFx(effectId, a.x, a.y),
        });
        if (inst && step.then) for (const s of step.then) runEffect(host, ctx, s, rt);
      }
      return;
    }

    case "spreadStatus": {
      const src = selectActorIds(host, ctx, step.to)[0];
      if (src === undefined) return;
      const from = host.actor(src);
      if (!from) return;
      const near = [...host.actors()]
        .filter((a) => a.alive && a.id !== src && Math.hypot(a.x - from.x, a.y - from.y) <= step.radius)
        .map((a) => host.actor(a.id))
        .filter((a): a is HostActor => a !== undefined);
      from.statuses.spreadTo(near.map((a) => a.statuses), { ids: [step.status] });
      return;
    }

    case "heal": {
      const amt = scaledAmount(step.amount, step.scale, ctx.input);
      for (const id of selectActorIds(host, ctx, step.to ?? "self")) {
        host.healActor(id, amt, ctx.casterId, step.overTime?.duration);
      }
      return;
    }

    case "shield": {
      const amt = scaledAmount(step.amount, step.scale, ctx.input);
      for (const id of selectActorIds(host, ctx, step.to ?? "self")) {
        host.shieldActor(id, amt, step.duration, ctx.casterId, step.absorbOneHit === true);
      }
      return;
    }

    case "projectile": {
      const pt = step.projectile;
      const count = pt.count ?? 1;
      const spread = pt.spread ?? 0;
      for (let i = 0; i < count; i++) {
        const offset = count === 1 ? 0 : (i - (count - 1) / 2) * (spread / Math.max(1, count - 1));
        const packet = makeDamagePacket({
          amount: scaledAmount(pt.damage.base, pt.damage.scale, ctx.input),
          type: pt.damage.type as DamageType,
          ...(pt.damage.channel ? { channel: pt.damage.channel } : {}),
          source: { ...ctx.source },
          ...(pt.damage.inflict
            ? { inflict: { status: pt.damage.inflict.status, chance: pt.damage.inflict.chance } }
            : {}),
        });
        host.spawnProjectile({
          ownerId: ctx.casterId,
          x: ctx.origin.x,
          y: ctx.origin.y,
          angle: (ctx.targets.direction ?? ctx.facing) + offset,
          speed: pt.speed,
          radius: pt.radius,
          life: pt.life,
          pierce: pt.pierce ?? 0,
          damage: packet,
          behavior: pt.behavior ?? "line",
        });
      }
      return;
    }

    case "move": {
      const req: Parameters<CombatHost["moveActor"]>[1] = { style: step.style };
      if (step.toTarget && ctx.targets.actorIds[0] !== undefined) req.toActorId = ctx.targets.actorIds[0];
      else if (ctx.targets.point) req.toPoint = ctx.targets.point;
      if (step.distance !== undefined) req.distance = step.distance;
      if (step.leaveAnchor) req.leaveAnchor = true;
      if (step.iframes !== undefined) req.iframes = step.iframes;
      host.moveActor(ctx.casterId, req);
      return;
    }

    case "summon": {
      const pt = point(ctx);
      let count = step.count;
      if (step.fromCorpses !== undefined) {
        const taken = host.consumeCorpses(step.fromCorpses);
        // A fixed corpse cost is a hard requirement (Raise Skeleton needs a body).
        // "all" consumes the whole field as fuel but still raises at least `count` —
        // an ultimate ("every corpse rises, and then some") must never whiff to zero
        // just because the floor was freshly entered.
        count = step.fromCorpses === "all" ? Math.max(count, taken) : Math.min(count, taken);
        if (count <= 0) return;
      }
      host.spawnMinion({
        ownerId: ctx.casterId,
        unit: step.unit,
        x: pt.x,
        y: pt.y,
        count,
        duration: step.duration ?? 0,
        command: step.command ?? { behavior: "aggroNearest", inheritPower: 1 },
      });
      return;
    }

    case "commandSummons": {
      const targetId = selectActorIds(host, ctx, step.to)[0];
      host.commandSummons(ctx.casterId, step.command, targetId);
      return;
    }

    case "consumeSummons": {
      const owned = [...host.summonsOf(ctx.casterId)].length;
      const want = step.count === "all" ? owned : Math.min(step.count, owned);
      const died = host.sacrificeSummons(ctx.casterId, want);
      if (died > 0 && step.then) for (const s of step.then) runEffect(host, ctx, s, rt);
      return;
    }

    case "redirect": {
      for (const id of selectActorIds(host, ctx, step.to ?? "lowestHealthAlly")) {
        if (id === ctx.casterId) continue;
        host.redirectDamage(ctx.casterId, id, step.fraction, step.duration);
      }
      return;
    }

    case "random": {
      const total = step.choices.reduce((s, c) => s + Math.max(0, c.weight), 0);
      if (total <= 0) return;
      let roll = host.random() * total;
      for (const choice of step.choices) {
        roll -= Math.max(0, choice.weight);
        if (roll <= 0) {
          for (const s of choice.effects) runEffect(host, ctx, s, rt);
          return;
        }
      }
      return;
    }

    case "zone": {
      const z = step.zone;
      const pt = point(ctx);
      // A `line` zone is a lane on the ground: it runs from where the caster stands out
      // along the cast direction for the ability's own reach. `line` targeting resolves
      // hits, not a ground point (it never fills `ctx.targets.point`), so the far end has
      // to be rebuilt from the same direction the hit-scan used. Anything else is a
      // puddle at `pt`.
      const isLine = z.shape === "line";
      let far = pt;
      if (isLine) {
        const dir = ctx.targets.direction ?? ctx.facing;
        const length = ctx.ability.shape?.length ?? ctx.ability.range ?? z.radius * 4;
        far = { x: ctx.origin.x + Math.cos(dir) * length, y: ctx.origin.y + Math.sin(dir) * length };
      }
      const req: Parameters<CombatHost["spawnZone"]>[0] = {
        ownerId: ctx.casterId,
        x: isLine ? ctx.origin.x : pt.x,
        y: isLine ? ctx.origin.y : pt.y,
        radius: z.radius,
        duration: z.duration,
        tickInterval: z.tickInterval,
        follows: z.follows ?? false,
        mergeable: z.mergeable ?? false,
        ...(isLine ? { x2: far.x, y2: far.y } : {}),
        ...(z.empowerProjectiles !== undefined ? { empowerProjectiles: z.empowerProjectiles } : {}),
      };
      if (z.damage) {
        req.damage = makeDamagePacket({
          amount: scaledAmount(z.damage.base, z.damage.scale, ctx.input),
          type: z.damage.type as DamageType,
          channel: z.damage.channel ?? "periodic",
          source: { ...ctx.source },
        });
      }
      if (z.benefit) req.benefit = z.benefit;
      if (z.status) req.status = z.status;
      host.spawnZone(req);
      return;
    }

    case "terrain": {
      const pt = point(ctx);
      host.spawnTerrain({
        ownerId: ctx.casterId,
        x: pt.x,
        y: pt.y,
        angle: ctx.facing,
        piece: step.piece,
        length: step.length ?? 60,
        duration: step.duration,
        hp: step.hp ?? 0,
      });
      return;
    }

    case "threat": {
      for (const id of selectActorIds(host, ctx, step.to)) {
        host.setThreat(id, step.op, ctx.casterId, step.amount ?? 0);
      }
      return;
    }

    case "resource": {
      for (const id of selectActorIds(host, ctx, step.to ?? "self")) {
        const a = host.actor(id);
        const pool = a?.resources?.get(step.resource);
        if (!pool) continue;
        if (step.delta >= 0) pool.add(step.delta);
        else pool.spend(-step.delta);
      }
      return;
    }

    case "stance": {
      const stance = host.actor(ctx.casterId)?.resources?.stance(step.stance);
      if (!stance) return;
      if (step.op === "set" && step.state) stance.set(step.state);
      else stance.cycle(step.steps ?? 1);
      return;
    }

    case "knockback": {
      const from = point(ctx);
      for (const id of selectActorIds(host, ctx, step.to)) {
        host.applyImpulse(id, from.x, from.y, step.force);
      }
      return;
    }

    case "pull": {
      const to = point(ctx);
      for (const id of selectActorIds(host, ctx, step.to)) {
        host.applyImpulse(id, to.x, to.y, -step.force);
      }
      return;
    }

    case "interrupt": {
      const pt = point(ctx);
      host.interruptCasts(pt.x, pt.y, step.radius);
      return;
    }

    case "delay": {
      rt.schedule({ kind: "delay", fireAt: host.now() + step.seconds, effects: step.effects, ctx });
      return;
    }

    case "reactive": {
      rt.schedule({
        kind: "reactive",
        event: step.event,
        expiresAt: host.now() + step.window,
        effects: step.effects,
        ctx,
      });
      return;
    }

    case "followUp": {
      for (const s of step.effects) runEffect(host, ctx, s, rt);
      return;
    }

    case "fx": {
      const pt = point(ctx);
      host.emitFx(step.fx, pt.x, pt.y);
      return;
    }
  }
}

/**
 * Convenience for the host: after mitigation, feed the outcome of a landed packet back
 * into the resource layer. Every event carries `packet`, so a pool whose spec omits
 * `allowFromUltimate` silently drops the credit when the packet was ultimate-sourced —
 * THE ULTIMATE RULE, for free, at every call site that uses this.
 */
export function creditResourcesForHit(
  attacker: HostActor,
  packet: DamagePacket,
  dealt: number,
  opts: { killed?: boolean; ailmentInflicted?: boolean } = {},
): void {
  if (!attacker.resources) return;
  const base: Partial<ResourceEvent> = { packet, damage: dealt };
  attacker.resources.broadcast({ type: "hitDealt", ...base });
  attacker.resources.broadcast({ type: "damageDealt", ...base });
  if (packet.crit) attacker.resources.broadcast({ type: "crit", ...base });
  if (opts.ailmentInflicted) attacker.resources.broadcast({ type: "ailmentInflicted", ...base });
  if (opts.killed) {
    attacker.resources.broadcast({ type: "kill", ...base });
    attacker.resources.broadcast({ type: "enemyDeath", ...base });
  }
}
