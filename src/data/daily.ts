/**
 * The Vigil — the daily dungeon (UAT §17, v1).
 *
 * One floor a day, the same floor for everyone. Everything about it derives from one
 * integer, the **UTC day number**: the level seed, the depth, the two modifiers and the
 * tier of the key it pays. Two players anywhere in the world on the same day get the
 * identical layout and the identical challenge; only the Challenger dial is personal.
 *
 * UTC rather than local midnight on purpose. Two friends on a call in different time
 * zones should be talking about the same floor, and the save gets a single unambiguous
 * "cleared on day N" integer with no daylight-saving edge. The screen shows the countdown
 * to the reset so the choice reads as deliberate rather than odd.
 *
 * In the lore's terms this is a Standard Rift the Keepers keep watch over and close each
 * day (`docs/game_story_worldbuilding.md`, The Rifts / Standard Rifts). The name avoids
 * "Breach" because *Infernal Breach* is already a named Reliquary scenario there.
 *
 * Every modifier is a multiplier on a knob that already exists — a `DepthProfile` field
 * or the elite quota — riding through `profileFor` exactly the way `partyScale` and a
 * planet already do. Nothing here adds behaviour to the simulation.
 */

import { Rng } from "../core/rng";
import { CHALLENGER_GUARANTEE_TIER, challengerMultiplier } from "./challenger";
import type { ChestTier } from "./chests";
import { MODES, type RunConfig } from "./modes";

// --- the tunables ----------------------------------------------------------

/** Player-facing name of the mode and of its portal on the deck. */
export const DAILY_NAME = "The Vigil";
/** The depth band a day's floor is drawn from. Shared by everybody, so it's the real
 *  design knob: wider means more days a mid-level character can't clear. */
export const DAILY_DEPTH_MIN = 6;
export const DAILY_DEPTH_MAX = 14;
/** Deepest delve floor you must have cleared before the portal opens — the bottom of the band. */
export const DAILY_UNLOCK_DEPTH = DAILY_DEPTH_MIN;
/** Odds of the day's guaranteed key being each tier; the rest of the mass is Advanced. */
export const DAILY_KEY_ODDS: { readonly Legendary: number; readonly Elite: number } = {
  Legendary: 1 / 12,
  Elite: 1 / 4,
};
/**
 * At Challenger 0 the Vigil's whole reward is the key above, exactly as it always was.
 * From `CHALLENGER_GUARANTEE_TIER` the clear cache also carries one item forced to this
 * rarity (`challengerGuaranteedRarity` steps it to mythic there and holds it) — the same
 * mechanism the Convergence already has, extended down to its daily sibling rather than
 * invented twice. Off below the threshold on purpose: this must not move what a Vigil
 * clear pays at ordinary difficulty.
 */
export const DAILY_GUARANTEED_RARITY = "legendary" as const;

export const DAY_MS = 86_400_000;

// --- the calendar ------------------------------------------------------------

/** Whole UTC days since the epoch. The one number everything below hangs off. */
export function dayNumber(now: number = Date.now()): number {
  return Math.floor(now / DAY_MS);
}

/** Milliseconds until the next UTC midnight, for the countdown. */
export function msUntilReset(now: number = Date.now()): number {
  return (dayNumber(now) + 1) * DAY_MS - now;
}

/** A well-mixed 32-bit seed for a day, so consecutive days share nothing. */
export function daySeed(day: number): number {
  let z = (day + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

// --- modifiers -----------------------------------------------------------------

export type DailyModifierId = "ferocity" | "swarm" | "hunt" | "hasty" | "bounty" | "frugal";

/** What a modifier multiplies. Every field is a plain multiplier except `elites`, which
 *  is added to the floor's elite quota. Missing means 1 (or 0 for `elites`). */
export interface DailyEffects {
  readonly danger?: number;
  readonly count?: number;
  readonly health?: number;
  readonly telegraph?: number;
  readonly aggression?: number;
  readonly quantity?: number;
  readonly coins?: number;
  readonly rarityBias?: number;
  readonly elites?: number;
}

export interface DailyModifier {
  readonly id: DailyModifierId;
  readonly name: string;
  readonly blurb: string;
  /** A modifier that changes what the floor pays rather than how it fights. At most one
   *  of these a day, so the payout stays predictable. */
  readonly reward: boolean;
  readonly effects: DailyEffects;
}

export const DAILY_MODIFIERS: Record<DailyModifierId, DailyModifier> = {
  ferocity: {
    id: "ferocity", name: "Ferocious", reward: false,
    blurb: "Everything hits harder and has more health — a rift tier's worth of danger.",
    effects: { danger: 1.3 },
  },
  swarm: {
    id: "swarm", name: "Swarming", reward: false,
    blurb: "A third more bodies in every wave, each a little softer.",
    effects: { count: 1.35, health: 0.8 },
  },
  hunt: {
    id: "hunt", name: "Elite Hunt", reward: false,
    blurb: "The floor asks for two more elite kills before it opens.",
    effects: { elites: 2 },
  },
  hasty: {
    id: "hasty", name: "Hasty", reward: false,
    blurb: "Shorter wind-ups and quicker swings. Read fast.",
    effects: { telegraph: 0.85, aggression: 0.9 },
  },
  bounty: {
    id: "bounty", name: "Bountiful", reward: true,
    blurb: "Half again as many drops, and richer coin.",
    effects: { quantity: 1.5, coins: 1.3 },
  },
  frugal: {
    id: "frugal", name: "Sparse Ground", reward: true,
    blurb: "Fewer drops, but the table leans toward the top.",
    effects: { quantity: 0.6, rarityBias: 0.08 },
  },
};

export const DAILY_MODIFIER_IDS = Object.keys(DAILY_MODIFIERS) as readonly DailyModifierId[];

/** The combined multipliers of a day's modifiers. */
export function dailyEffects(ids: readonly DailyModifierId[]): Required<DailyEffects> {
  const out = { danger: 1, count: 1, health: 1, telegraph: 1, aggression: 1, quantity: 1, coins: 1, rarityBias: 0, elites: 0 };
  for (const id of ids) {
    const e = DAILY_MODIFIERS[id]?.effects;
    if (!e) continue;
    out.danger *= e.danger ?? 1;
    out.count *= e.count ?? 1;
    out.health *= e.health ?? 1;
    out.telegraph *= e.telegraph ?? 1;
    out.aggression *= e.aggression ?? 1;
    out.quantity *= e.quantity ?? 1;
    out.coins *= e.coins ?? 1;
    out.rarityBias += e.rarityBias ?? 0;
    out.elites += e.elites ?? 0;
  }
  return out;
}

// --- the day's plan --------------------------------------------------------

/** Everything a day decides. Carried on `RunConfig.daily` so the sim and the screen
 *  read the same answer. */
export interface DailyRun {
  readonly day: number;
  /** The level seed. `Dungeon` uses it when nobody hands it another. */
  readonly seed: number;
  readonly modifiers: readonly DailyModifierId[];
  /** The tier of the one guaranteed key in the clear cache. */
  readonly keyTier: ChestTier;
}

export function dailyPlan(day: number): DailyRun & { readonly depth: number } {
  // Drawn from a side stream, not the level seed itself, so a tuning change here never
  // moves the layout everybody already knows for that day (and vice versa).
  const rng = new Rng((daySeed(day) ^ 0x5eed_da11) >>> 0);
  const depth = rng.int(DAILY_DEPTH_MIN, DAILY_DEPTH_MAX);
  // Two distinct modifiers, at most one of them reward-flavoured.
  const pool = [...DAILY_MODIFIER_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const first = pool[0]!;
  let second = pool[1]!;
  if (DAILY_MODIFIERS[first].reward && DAILY_MODIFIERS[second].reward) {
    second = pool.slice(2).find((id) => !DAILY_MODIFIERS[id].reward) ?? second;
  }
  const roll = rng.next();
  const keyTier: ChestTier = roll < DAILY_KEY_ODDS.Legendary
    ? "Legendary"
    : roll < DAILY_KEY_ODDS.Legendary + DAILY_KEY_ODDS.Elite ? "Elite" : "Advanced";
  return { day, seed: daySeed(day), depth, modifiers: [first, second], keyTier };
}

/** The day's floor, shaped like every other `RunConfig`. One floor, and it's the last. */
export function dailyConfig(day: number, challengerTier = 0): RunConfig {
  const plan = dailyPlan(day);
  const fx = dailyEffects(plan.modifiers);
  return {
    mode: MODES.vigil,
    tier: 0,
    floor: 1,
    depth: plan.depth,
    // Ferocity lives in `danger` so everything that reads danger — enemy stats, the
    // elite quota, the recommended level — sees it without knowing about the Vigil.
    danger: challengerMultiplier(challengerTier) * fx.danger,
    bossFloor: false,
    lastFloor: true,
    challengerTier,
    daily: { day: plan.day, seed: plan.seed, modifiers: plan.modifiers, keyTier: plan.keyTier },
  };
}

export function dailyUnlocked(deepestDepth: number): boolean {
  return deepestDepth >= DAILY_UNLOCK_DEPTH;
}

/** Whether today's Challenger tier is high enough to add the forced-rarity item on top
 *  of the day's guaranteed key. See `DAILY_GUARANTEED_RARITY`. */
export function dailyGuaranteesItem(challengerTier: number): boolean {
  return challengerTier >= CHALLENGER_GUARANTEE_TIER;
}
