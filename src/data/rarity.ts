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
 * Base drop odds. Tightened well past the original numbers: the top of the ladder was
 * landing too often, so common/uncommon/rare stayed close to where they were and
 * everything from epic up got cut hard, divine and unspoken hardest of all — unspoken
 * is now roughly 1 in 250,000 from a Basic chest, rarer than divine rather than tied
 * with it. The long tail is still the whole point of the game; it just needed to be
 * longer.
 */
export const BASE_RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 0.68,
  uncommon: 0.24,
  rare: 0.065,
  epic: 0.012,
  legendary: 0.0028,
  mythic: 0.00018,
  divine: 0.000012,
  unspoken: 0.000004,
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
export const BASE_RARITY_BIAS = 0.06;

export function depthWeights(depth: number, bias = BASE_RARITY_BIAS): Record<Rarity, number> {
  const out = {} as Record<Rarity, number>;
  for (const r of RARITIES) {
    const tier = rarityIndex(r);
    out[r] = BASE_RARITY_WEIGHTS[r] * Math.pow(1 + depth * bias, tier * 0.5);
  }
  return out;
}
