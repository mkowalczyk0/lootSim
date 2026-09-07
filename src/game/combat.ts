/**
 * Ailments: the bookkeeping behind burning, chilled, shocked, poisoned and drained.
 *
 * Both sides of the fight use this. The player's ailments live on the dungeon, a
 * monster's live on the monster, and they tick with the same code — so anything the
 * player can do to a boss, a boss can do back.
 *
 * Simulation only.
 */

import { STATUSES, type Element, type Resists, type StatusKind } from "../data/elements";
import { resistFraction } from "../data/elements";

export interface StatusInstance {
  readonly kind: StatusKind;
  remaining: number;
  stacks: number;
  /** Damage per second at the moment it was applied, already mitigated. */
  dps: number;
  /** Ailments tick on their own clock rather than every frame. */
  tickTimer: number;
}

/** How often an ailment deals its damage. Slow enough to read as a tick, not a drain. */
export const STATUS_TICK = 0.5;

/**
 * Adds an ailment, or refreshes and stacks one that's already there. `hitDamage` is the
 * damage of the hit that applied it, so a big hit leaves a big burn.
 */
export function applyStatus(
  list: StatusInstance[],
  kind: StatusKind,
  hitDamage: number,
  potency = 1,
): void {
  const spec = STATUSES[kind];
  const dps = hitDamage * spec.dps * potency;
  const existing = list.find((s) => s.kind === kind);
  if (existing) {
    existing.remaining = Math.max(existing.remaining, spec.duration);
    existing.stacks = Math.min(spec.maxStacks, existing.stacks + 1);
    // The strongest application wins, so a weak tick can't dilute a big one.
    existing.dps = Math.max(existing.dps, dps);
    return;
  }
  list.push({ kind, remaining: spec.duration, stacks: 1, dps, tickTimer: STATUS_TICK });
}

/**
 * Advances every ailment, calling `onTick` with the damage each one deals. Expired
 * entries are dropped. The caller decides what "taking damage" means, which is what
 * lets the player and a monster share this.
 */
export function tickStatuses(
  list: StatusInstance[],
  dt: number,
  onTick: (damage: number, element: Element, kind: StatusKind) => void,
): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    s.remaining -= dt;
    s.tickTimer -= dt;
    if (s.tickTimer <= 0) {
      s.tickTimer += STATUS_TICK;
      const damage = s.dps * s.stacks * STATUS_TICK;
      if (damage > 0) onTick(damage, STATUSES[s.kind].element, s.kind);
    }
    if (s.remaining <= 0) list.splice(i, 1);
  }
}

/** Movement multiplier from everything currently on the victim. Chills multiply. */
export function slowFrom(list: readonly StatusInstance[]): number {
  let m = 1;
  for (const s of list) m *= STATUSES[s.kind].slow;
  return m;
}

/** Damage-taken multiplier. Shock is the reason to bother with lightning at all. */
export function amplifyFrom(list: readonly StatusInstance[]): number {
  let m = 1;
  for (const s of list) m *= STATUSES[s.kind].amplify;
  return m;
}

/** Mana torn out per second by void ailments. */
export function manaBurnFrom(list: readonly StatusInstance[]): number {
  let total = 0;
  for (const s of list) total += STATUSES[s.kind].manaBurn * s.stacks;
  return total;
}

export function hasStatus(list: readonly StatusInstance[], kind: StatusKind): boolean {
  return list.some((s) => s.kind === kind);
}

/** Mitigation for anything that isn't the player: flat resistance, no armor. */
export function mitigateWithResists(amount: number, element: Element, resists: Resists): number {
  return Math.max(1, amount * (1 - resistFraction(resists[element])));
}
