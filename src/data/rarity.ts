/** The eight rarities, ascending. Carried over verbatim from the Python original. */
export const RARITIES = [
  "common", "uncommon", "rare", "epic",
  "legendary", "mythic", "divine", "unspoken",
] as const;

export type Rarity = (typeof RARITIES)[number];

export const RARITY_COLORS: Record<Rarity, string> = {
  common: "#9aa0a6",
  uncommon: "#3ddc4a",
  rare: "#3b82f6",
  epic: "#a855f7",
  legendary: "#ffa500",
  mythic: "#ff2d2d",
  divine: "#ffb6c1",
  unspoken: "#ff1493",
};

/** Stat scaling per rarity: 2^n. An unspoken item is 128x a common one. */
export const RARITY_MULTIPLIERS: Record<Rarity, number> = {
  common: 1, uncommon: 2, rare: 4, epic: 8,
  legendary: 16, mythic: 32, divine: 64, unspoken: 128,
};

/** Sell value per rarity, in coins, before item-level scaling. */
export const RARITY_VALUE: Record<Rarity, number> = {
  common: 10, uncommon: 25, rare: 75, epic: 200,
  legendary: 500, mythic: 1500, divine: 5000, unspoken: 15000,
};

/**
 * Base drop odds. These are the original numbers and they are deliberately brutal:
 * unspoken is roughly 1 in 20,000. The long tail is the whole point of the game.
 */
export const BASE_RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 0.515,
  uncommon: 0.215,
  rare: 0.065,
  epic: 0.015,
  legendary: 0.005,
  mythic: 0.0005,
  divine: 0.00005,
  unspoken: 0.00005,
};

export function rarityIndex(r: Rarity): number {
  return RARITIES.indexOf(r);
}

export function rarityLabel(r: Rarity): string {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/**
 * Depth pushes the odds upward: every depth multiplies the weight of each rarity by
 * `(1 + depth * bias)^tier`, so deep floors shift mass toward the top end without ever
 * making the rare stuff guaranteed.
 */
export function depthWeights(depth: number, bias = 0.06): Record<Rarity, number> {
  const out = {} as Record<Rarity, number>;
  for (const r of RARITIES) {
    const tier = rarityIndex(r);
    out[r] = BASE_RARITY_WEIGHTS[r] * Math.pow(1 + depth * bias, tier * 0.5);
  }
  return out;
}
