/**
 * The Convergence — the weekly dungeon (UAT §17), the Vigil's harder sibling.
 *
 * Where a Standard Rift is "the aftermath of lesser supernatural conflicts"
 * (`docs/game_story_worldbuilding.md`, Standard Rifts) and the Vigil is the Keepers
 * watching one lesser breach a day, a Convergence is what happens when several of those
 * breaches tear open close enough together that they collapse into one — four floors of
 * wreckage from four different fights, fused, ending in whatever crawled out of the
 * point they met. It resets weekly rather than daily because that's a rarer, bigger
 * event in the lore, not just a longer timer.
 *
 * Everything about the week's run derives from one integer, the **UTC week number**
 * (`weekNumber`, itself `dayNumber` / 7): the base seed, the depth band it draws from,
 * three modifiers instead of the Vigil's two, and the tier of the guaranteed key it
 * pays. Every floor mixes that base seed with its own floor index (`weeklyFloorSeed`),
 * so all four floors are each individually deterministic and distinct rather than one
 * layout repeated four times. Only the Challenger dial is personal, exactly as with the
 * Vigil.
 *
 * Reuses the Vigil's whole idiom rather than inventing a second one: a modifier is
 * still nothing but a multiplier on a `DepthProfile` field (or the elite quota) riding
 * through `profileFor`, `weeklyConfig` is shaped exactly like `planetConfig` in
 * `data/planets.ts` (a fixed run of floors, tier fixed at zero since there is no ladder
 * to climb — clearing it marks the week, it doesn't open anything), and the boss on the
 * last floor is picked the same depth-bucketed way any rift's boss is, wholesale reuse
 * `planetBossSpec` didn't need a counterpart here.
 *
 * Solo only for v1, matching the Vigil's own call: the once-a-week bookkeeping is per
 * account and `RunConfigWire` doesn't carry a weekly plan.
 */

import { Rng } from "../core/rng";
import { challengerMultiplier } from "./challenger";
import { DAY_MS, dayNumber } from "./daily";
import type { ChestTier } from "./chests";
import { MODES, type RunConfig } from "./modes";

// --- the tunables ----------------------------------------------------------

export const WEEKLY_NAME = "The Convergence";
/** The depth band a week's floor 1 is drawn from. Meaningfully above the Vigil's 6-14
 *  band — the weekly is supposed to be the thing a Vigil-capable character grows into,
 *  not another version of the same wall. */
export const WEEKLY_DEPTH_MIN = 18;
export const WEEKLY_DEPTH_MAX = 30;
/** Deepest delve floor required before the portal opens — well past the Vigil's 6, and
 *  past the Abyssal Rift's own 8, since this is meant to be the harder of the two. */
export const WEEKLY_UNLOCK_DEPTH = 16;
/** Floors before the boss, plus the boss floor itself — shaped like the Abyssal Rift's
 *  four, since a Convergence is meant to hit at least as hard. */
export const WEEKLY_FLOORS = 4;
/** How much deeper each successive floor reads, on top of the week's own base depth. */
export const WEEKLY_DEPTH_PER_FLOOR = 3;
/** Odds of the week's guaranteed key being each tier; the rest of the mass is
 *  Legendary. Never worse than Legendary — this is the mode that pays in the two
 *  chests the Quartermaster otherwise only sells outright. */
export const WEEKLY_KEY_ODDS: { readonly CollectorsHoard: number; readonly AdeptsTrove: number } = {
  CollectorsHoard: 1 / 6,
  AdeptsTrove: 1 / 2,
};
/** The clear cache also carries one item forced to at least this rarity — the
 *  "specific loot table" UAT §17 asks for, on top of the ordinary depth-weighted roll. */
export const WEEKLY_GUARANTEED_RARITY = "legendary" as const;

export const WEEK_MS = DAY_MS * 7;

// --- the calendar ------------------------------------------------------------

/** Whole UTC weeks since the epoch. The one number everything below hangs off. */
export function weekNumber(now: number = Date.now()): number {
  return Math.floor(dayNumber(now) / 7);
}

/** Milliseconds until the next UTC week boundary, for the countdown. */
export function msUntilWeeklyReset(now: number = Date.now()): number {
  return (weekNumber(now) + 1) * WEEK_MS - now;
}

/** A well-mixed 32-bit seed for a week. A different mixing constant than `daySeed`'s so
 *  a week number and a day number that happen to coincide never produce the same seed. */
export function weeklySeed(week: number): number {
  let z = (week + 0x2545f491) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

/** One floor's own seed, mixed from the week's base seed and the floor index — so all
 *  four floors of a Convergence are each deterministic and none of them repeat. */
export function weeklyFloorSeed(baseSeed: number, floor: number): number {
  let z = (baseSeed ^ Math.imul(floor + 1, 0x9e3779b1)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

// --- modifiers -----------------------------------------------------------------

export type WeeklyModifierId =
  | "onslaught" | "legion" | "purge" | "blitz" | "feral" | "dire" | "hoarder" | "rarefied";

/** What a modifier multiplies. Every field is a plain multiplier except `elites`, which
 *  is added to the floor's elite quota. Missing means 1 (or 0 for `elites`). Adds
 *  `speed` on top of what the Vigil's `DailyEffects` supports — a genuinely different
 *  knob, not a relabeled one, which is the "more specialized" part of UAT §17's ask. */
export interface WeeklyEffects {
  readonly danger?: number;
  readonly count?: number;
  readonly health?: number;
  readonly telegraph?: number;
  readonly aggression?: number;
  readonly speed?: number;
  readonly quantity?: number;
  readonly coins?: number;
  readonly rarityBias?: number;
  readonly elites?: number;
}

export interface WeeklyModifier {
  readonly id: WeeklyModifierId;
  readonly name: string;
  readonly blurb: string;
  /** A modifier that changes what the floor pays rather than how it fights. At most one
   *  of these a week, same rule as the Vigil, so the payout stays predictable. */
  readonly reward: boolean;
  readonly effects: WeeklyEffects;
}

export const WEEKLY_MODIFIERS: Record<WeeklyModifierId, WeeklyModifier> = {
  onslaught: {
    id: "onslaught", name: "Onslaught", reward: false,
    blurb: "Every floor leans in — close to half again the danger, on top of the depth.",
    effects: { danger: 1.45 },
  },
  legion: {
    id: "legion", name: "Legion", reward: false,
    blurb: "Half again as many bodies in every wave, each a little softer for it.",
    effects: { count: 1.5, health: 0.75 },
  },
  purge: {
    id: "purge", name: "Purge", reward: false,
    blurb: "Four more elite kills owed before a floor opens.",
    effects: { elites: 4 },
  },
  blitz: {
    id: "blitz", name: "Blitz", reward: false,
    blurb: "Wind-ups cut hard and swings come quicker. Read fast or eat it.",
    effects: { telegraph: 0.78, aggression: 0.85 },
  },
  feral: {
    id: "feral", name: "Feral", reward: false,
    blurb: "Everything closes the distance a quarter faster.",
    effects: { speed: 1.25 },
  },
  dire: {
    id: "dire", name: "Dire", reward: false,
    blurb: "Thicker hide, harder hit — the floor itself is simply tougher.",
    effects: { health: 1.35, danger: 1.1 },
  },
  hoarder: {
    id: "hoarder", name: "Hoarder", reward: true,
    blurb: "Nearly twice the drops, and coin to match.",
    effects: { quantity: 1.8, coins: 1.6 },
  },
  rarefied: {
    id: "rarefied", name: "Rarefied", reward: true,
    blurb: "Half the drops, but the table leans hard toward the top.",
    effects: { quantity: 0.5, rarityBias: 0.15 },
  },
};

export const WEEKLY_MODIFIER_IDS = Object.keys(WEEKLY_MODIFIERS) as readonly WeeklyModifierId[];

/** The combined multipliers of a week's modifiers. */
export function weeklyEffects(ids: readonly WeeklyModifierId[]): Required<WeeklyEffects> {
  const out = {
    danger: 1, count: 1, health: 1, telegraph: 1, aggression: 1, speed: 1,
    quantity: 1, coins: 1, rarityBias: 0, elites: 0,
  };
  for (const id of ids) {
    const e = WEEKLY_MODIFIERS[id]?.effects;
    if (!e) continue;
    out.danger *= e.danger ?? 1;
    out.count *= e.count ?? 1;
    out.health *= e.health ?? 1;
    out.telegraph *= e.telegraph ?? 1;
    out.aggression *= e.aggression ?? 1;
    out.speed *= e.speed ?? 1;
    out.quantity *= e.quantity ?? 1;
    out.coins *= e.coins ?? 1;
    out.rarityBias += e.rarityBias ?? 0;
    out.elites += e.elites ?? 0;
  }
  return out;
}

// --- the week's plan --------------------------------------------------------

/** Everything a week decides. Carried on `RunConfig.weekly` so the sim and the screen
 *  read the same answer. */
export interface WeeklyRun {
  readonly week: number;
  /** The week's base seed. Each floor mixes this with its own index — see
   *  `weeklyFloorSeed` — so `Dungeon` never reads it directly. */
  readonly seed: number;
  readonly modifiers: readonly WeeklyModifierId[];
  /** The tier of the one guaranteed key in floor 4's clear cache. */
  readonly keyTier: ChestTier;
}

export function weeklyPlan(week: number): WeeklyRun & { readonly depth: number } {
  // Drawn from a side stream, not the level seed itself, so a tuning change here never
  // moves a layout everybody already knows for that week (and vice versa) — same trick
  // the Vigil's `dailyPlan` uses.
  const rng = new Rng((weeklySeed(week) ^ 0x0b17_da11) >>> 0);
  const depth = rng.int(WEEKLY_DEPTH_MIN, WEEKLY_DEPTH_MAX);
  // Three distinct modifiers, at most one of them reward-flavoured.
  const pool = [...WEEKLY_MODIFIER_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const modifiers: WeeklyModifierId[] = [];
  let rewardUsed = false;
  for (const id of pool) {
    if (modifiers.length >= 3) break;
    const isReward = WEEKLY_MODIFIERS[id].reward;
    if (isReward && rewardUsed) continue;
    modifiers.push(id);
    if (isReward) rewardUsed = true;
  }
  const roll = rng.next();
  const keyTier: ChestTier = roll < WEEKLY_KEY_ODDS.CollectorsHoard
    ? "CollectorsHoard"
    : roll < WEEKLY_KEY_ODDS.CollectorsHoard + WEEKLY_KEY_ODDS.AdeptsTrove ? "AdeptsTrove" : "Legendary";
  return { week, seed: weeklySeed(week), depth, modifiers, keyTier };
}

/**
 * One floor of the week's Convergence, shaped exactly like `planetConfig` in
 * `data/planets.ts` — a fixed run of floors ending in a boss — except there is no tier
 * to compound: the week itself is the only difficulty knob, so `tier` stays 0 the same
 * way the Vigil's does, which is also what keeps clearing it from opening a rift tier
 * by accident (`GameState.recordDepth` never sees `tier + 1` exceed the default).
 */
export function weeklyConfig(week: number, floor: number, challengerTier = 0): RunConfig {
  const plan = weeklyPlan(week);
  const fx = weeklyEffects(plan.modifiers);
  const f = Math.min(Math.max(1, Math.floor(floor)), WEEKLY_FLOORS);
  const depth = Math.max(1, Math.round(plan.depth + WEEKLY_DEPTH_PER_FLOOR * (f - 1)));
  return {
    mode: MODES.convergence,
    tier: 0,
    floor: f,
    depth,
    // Onslaught and Dire live in `danger` so everything that reads it — enemy stats,
    // the elite quota, the recommended level — sees it without knowing about the
    // Convergence, exactly the way the Vigil's Ferocious does.
    danger: challengerMultiplier(challengerTier) * fx.danger,
    bossFloor: f === WEEKLY_FLOORS,
    lastFloor: f === WEEKLY_FLOORS,
    challengerTier,
    weekly: { week: plan.week, seed: plan.seed, modifiers: plan.modifiers, keyTier: plan.keyTier },
  };
}

export function weeklyUnlocked(deepestDepth: number): boolean {
  return deepestDepth >= WEEKLY_UNLOCK_DEPTH;
}
