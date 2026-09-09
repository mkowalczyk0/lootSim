/**
 * Challenger tiers: a player-chosen difficulty multiplier layered on top of whatever a
 * mode and depth already imply. It is the one dial that applies uniformly to the Delve,
 * every Rift, and every planet expedition — Challenger 5 means the same thing everywhere,
 * including the gentlest floor in the game. It compounds into the same `danger` number a
 * rift tier already multiplies into `profileFor`, so nothing downstream has to know it
 * exists as a separate concept.
 *
 * Pure data.
 */

import type { Rarity } from "./rarity";

export const MAX_CHALLENGER_TIER = 20;

/** Compounds per tier. Tier 5 lands close to the owner's own "five times harder." */
const CHALLENGER_STEP = 1.38;

export function challengerMultiplier(tier: number): number {
  const t = clampTier(tier);
  return t === 0 ? 1 : Math.pow(CHALLENGER_STEP, t);
}

/** A rarity push for the extra risk — still nowhere near what a rift tier gives, but
 *  enough that Challenger is a genuine reward escalation and not just a danger tax
 *  (UAT §9). Caps out around tier 11. */
export function challengerRarityBias(tier: number): number {
  return Math.min(0.17, clampTier(tier) * 0.017);
}

/** Coins and planet materials — both are general-purpose currency a harder floor should
 *  pay out more of. XP is left alone so levelling pace doesn't quietly warp with the dial.
 *  Raised in the post-playtest pass so the higher tiers are worth turning on for the loot,
 *  not only survivable for bragging rights. */
export function challengerRewardMult(tier: number): number {
  return 1 + Math.min(1.6, clampTier(tier) * 0.11);
}

/**
 * The Challenger tier at which the Vigil's and the Convergence's one *guaranteed*
 * clear-cache item steps up a rarity — Nightmare X, the top of the first band. Below
 * this every guarantee reads exactly as it did before Challenger touched either mode.
 */
export const CHALLENGER_GUARANTEE_TIER = 10;

/**
 * Steps a *guaranteed* completion reward's rarity up by one at `CHALLENGER_GUARANTEE_
 * TIER` and holds it there through every Death March tier after — for the Vigil's and
 * the Convergence's one forced-rarity clear-cache item (`rollItem({ rarity, ... })`
 * with no roll involved), never for anything the random drop table can produce. That
 * ceiling belongs to `rewards.ts` and `rarity.ts`, not this dial, and this function
 * doesn't touch it.
 *
 * Capped at mythic on purpose, the same ceiling `docs/forge.md` already puts on every
 * *deterministic* path to an item — crafting, Ascend, a named recipe. Divine and
 * unspoken are chest-only and explicitly meant to stay "absurd" (`rarity.ts`): a
 * *guaranteed* one every week (or every day, once Vigil earns the same guarantee) would
 * make Challenger a quieter, more reliable route to the top of the ladder than
 * crafting is allowed to be anywhere else in the game. Moving this past mythic is an
 * owner call, not a tuning pass — see docs/daily-dungeon.md / docs/weekly-dungeon.md.
 */
export function challengerGuaranteedRarity(base: Rarity, tier: number): Rarity {
  if (clampTier(tier) < CHALLENGER_GUARANTEE_TIER) return base;
  const idx = Math.min(RARITY_LADDER.indexOf("mythic"), RARITY_LADDER.indexOf(base) + 1);
  return RARITY_LADDER[idx]!;
}

const RARITY_LADDER: readonly Rarity[] = [
  "common", "uncommon", "rare", "epic", "legendary", "mythic", "divine", "unspoken",
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const;

/**
 * Empty at tier 0 — plain, ordinary difficulty doesn't need a name. Nightmare I-X covers
 * the original ten tiers; Death March I-X picks up past Nightmare X for the ten added on
 * top, so the name still tells you roughly how deep into the dial a tier sits.
 */
export function challengerName(tier: number): string {
  const t = clampTier(tier);
  if (t === 0) return "";
  if (t <= 10) return `Nightmare ${ROMAN[t - 1] ?? String(t)}`;
  return `Death March ${ROMAN[t - 11] ?? String(t - 10)}`;
}

function clampTier(tier: number): number {
  return Math.max(0, Math.min(MAX_CHALLENGER_TIER, Math.floor(tier || 0)));
}
