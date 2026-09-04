import type { Rarity } from "./rarity";

export const CHEST_TIERS = ["Basic", "Advanced", "Elite", "Legendary"] as const;
export type ChestTier = (typeof CHEST_TIERS)[number];

export interface ChestTierInfo {
  readonly price: number;
  /** Multiplied into the base rarity weights. Zero removes a rarity entirely. */
  readonly weights: Record<Rarity, number>;
  readonly color: string;
  readonly blurb: string;
}

/** Prices and per-rarity multipliers are unchanged from the Python original. */
export const CHESTS: Record<ChestTier, ChestTierInfo> = {
  Basic: {
    price: 100,
    color: "#9aa0a6",
    blurb: "Everything's on the table, mostly junk.",
    weights: {
      common: 1.0, uncommon: 1.0, rare: 1.0, epic: 1.0,
      legendary: 1.0, mythic: 1.0, divine: 1.0, unspoken: 1.0,
    },
  },
  Advanced: {
    price: 500,
    color: "#3ddc4a",
    blurb: "No commons.",
    weights: {
      common: 0.0, uncommon: 1.8, rare: 1.7, epic: 1.5,
      legendary: 1.3, mythic: 1.2, divine: 1.1, unspoken: 1.0,
    },
  },
  Elite: {
    price: 2500,
    color: "#a855f7",
    blurb: "Rare and up only.",
    weights: {
      common: 0.0, uncommon: 0.0, rare: 2.4, epic: 2.2,
      legendary: 1.5, mythic: 1.5, divine: 1.3, unspoken: 1.1,
    },
  },
  Legendary: {
    price: 10000,
    color: "#ffa500",
    blurb: "Epic and up only. The real gamble.",
    weights: {
      common: 0.0, uncommon: 0.0, rare: 0.0, epic: 2.6,
      legendary: 2.5, mythic: 1.8, divine: 1.7, unspoken: 1.2,
    },
  },
};

/** Which key a monster drops, by depth — deeper floors cough up better keys. */
export function keyDropTier(depth: number, roll: number): ChestTier {
  if (depth >= 20 && roll < 0.08) return "Legendary";
  if (depth >= 12 && roll < 0.18) return "Elite";
  if (depth >= 5 && roll < 0.4) return "Advanced";
  return "Basic";
}
