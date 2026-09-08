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
