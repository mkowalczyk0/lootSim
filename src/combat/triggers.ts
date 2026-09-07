/**
 * The combat event bus.
 *
 * The old game had a four-name `fireTriggers` and a boolean re-entrancy guard, which
 * was the right idea at a tenth of the size. This is the same idea grown up: one typed
 * emitter that gear triggers, tree "grant effect" nodes, resource generation rules and
 * status spread/detonate hooks all subscribe to, instead of each inventing a parallel
 * notification path.
 *
 * The re-entrancy guard is a depth counter now, not a boolean — an on-kill effect that
 * kills something is allowed to chain a couple of levels deep, but not forever.
 *
 * Pure. Listeners get the event and the bus; what they *do* is the host's problem.
 */

import type { DamagePacket } from "./damage";
import type { ResourceId } from "./resources";
import type { StatusId } from "./status";
import type { SkillTag } from "./tags";
import { hasAnyTag } from "./tags";

export type CombatEventType =
  | "skillUse"
  | "hit"
  | "criticalHit"
  | "damageTaken"
  | "dodge"
  | "kill"
  | "enemyDeath"
  | "statusApplied"
  | "statusExpired"
  | "resourceChange"
  | "resourceThreshold"
  | "ultimateUse"
  | "enterCombat"
  | "leaveCombat"
  | "corpseCreated"
  | "summonDeath";

export interface CombatEvent {
  type: CombatEventType;
  /** The actor the event is *about* (the attacker on `hit`, the dier on `enemyDeath`). */
  actorId: number;
  targetId?: number;
  x?: number;
  y?: number;
  packet?: DamagePacket;
  statusId?: StatusId;
  resourceId?: ResourceId;
  amount?: number;
  abilityId?: string;
  tags?: readonly SkillTag[];
  /** True when the ability behind the event was an ultimate. */
  fromUltimate?: boolean;
}

export interface ListenerOptions {
  /** Remove the listener after it fires once. */
  once?: boolean;
  /** Only fire when the event carries one of these tags. */
  requireTags?: readonly SkillTag[];
  /** Only fire on a crit (`criticalHit` events, or `hit`/`kill` with `packet.crit`). */
  requireCrit?: boolean;
  /** Proc chance, 0..1. */
  chance?: number;
  /** 0..1 roll for `chance`, injected for determinism. */
  roll?: () => number;
  /** Lower runs first. Default 0. */
  priority?: number;
}

export type TriggerListener = (evt: CombatEvent, bus: EventBus) => void;

interface Subscription {
  fn: TriggerListener;
  opts: ListenerOptions;
  id: number;
}

export class EventBus {
  private listeners = new Map<CombatEventType, Subscription[]>();
  private nextId = 1;
  private depth = 0;
  /** How deep a trigger cascade may recurse before further emits are dropped. */
  readonly maxDepth: number;

  constructor(maxDepth = 4) {
    this.maxDepth = maxDepth;
  }

  /** Subscribe. Returns an unsubscribe function. */
  on(type: CombatEventType, fn: TriggerListener, opts: ListenerOptions = {}): () => void {
    const sub: Subscription = { fn, opts, id: this.nextId++ };
    const list = this.listeners.get(type) ?? [];
    list.push(sub);
    list.sort((a, b) => (a.opts.priority ?? 0) - (b.opts.priority ?? 0));
    this.listeners.set(type, list);
    return () => {
      const arr = this.listeners.get(type);
      if (!arr) return;
      const i = arr.findIndex((s) => s.id === sub.id);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  /**
   * Emit. Re-entrancy is bounded by `maxDepth`: a listener may cause further emits,
   * but a runaway cascade is cut off rather than blowing the stack.
   */
  emit(evt: CombatEvent): void {
    if (this.depth >= this.maxDepth) return;
    const subs = this.listeners.get(evt.type);
    if (!subs || subs.length === 0) return;

    this.depth++;
    try {
      // Copy: a listener may unsubscribe itself or others mid-dispatch.
      for (const sub of [...subs]) {
        if (!this.passes(sub.opts, evt)) continue;
        sub.fn(evt, this);
        if (sub.opts.once) {
          const i = subs.findIndex((s) => s.id === sub.id);
          if (i >= 0) subs.splice(i, 1);
        }
      }
    } finally {
      this.depth--;
    }
  }

  /** True while a trigger cascade is in flight — matches the old `inTrigger` check. */
  get dispatching(): boolean {
    return this.depth > 0;
  }

  private passes(opts: ListenerOptions, evt: CombatEvent): boolean {
    if (opts.requireCrit) {
      const crit = evt.type === "criticalHit" || evt.packet?.crit === true;
      if (!crit) return false;
    }
    if (opts.requireTags) {
      const tags = evt.tags ?? evt.packet?.source.tags;
      if (!hasAnyTag(tags, opts.requireTags)) return false;
    }
    if (opts.chance !== undefined && opts.chance < 1) {
      const roll = opts.roll ?? Math.random;
      if (roll() > opts.chance) return false;
    }
    return true;
  }
}
