/**
 * Crafting: the second way to get an item, alongside chests, monsters and boss drops.
 * A chest gambles on everything at once. Crafting is the opposite promise — spend
 * materials and walk away with a chosen category at a chosen rarity, optionally biased
 * toward a chosen essence, rather than only ever rolling for one.
 *
 * Divine and unspoken are deliberately not craftable. `data/rarity.ts` keeps their odds
 * absurd on purpose — "the long tail is the hook" — and a material grind that could
 * simply buy one would flatten that. Everything from common through mythic is fair
 * game, and a guaranteed mythic is already a very large promise.
 *
 * Pure data. `game/state.ts` spends the materials and calls `game/item.ts#rollItem`.
 */

import type { ItemType } from "./items";
import { RARITIES, rarityIndex, type Rarity } from "./rarity";
import { WEAPON_FAMILIES } from "./weapons";

export const CRAFT_CATEGORIES = ["weapon", "armor", "accessory"] as const;
export type CraftCategory = (typeof CRAFT_CATEGORIES)[number];

export const CRAFT_CATEGORY_LABELS: Record<CraftCategory, string> = {
  weapon: "Weapon", armor: "Armor", accessory: "Accessory",
};

/** Which item types a category can roll. A weapon craft rolls any of the six families. */
export const CRAFT_TYPES: Record<CraftCategory, readonly ItemType[]> = {
  weapon: WEAPON_FAMILIES,
  armor: ["armor", "shield"],
  accessory: ["ring", "gloves", "necklace"],
};

/** The top of what a material grind can buy outright. Divine and unspoken stay chest-only. */
export const CRAFT_MAX_RARITY: Rarity = "mythic";
export const CRAFTABLE_RARITIES: readonly Rarity[] = RARITIES.slice(0, rarityIndex(CRAFT_MAX_RARITY) + 1);

/** Iron Scrap needed regardless of essence — the bulk cost of the rarity itself. */
export function craftBulkCost(rarity: Rarity): number {
  return Math.round(8 * Math.pow(2, rarityIndex(rarity)));
}

/** Cost of the chosen essence's material, to bias the roll toward that element. */
export function craftEssenceCost(rarity: Rarity): number {
  return Math.round(5 * Math.pow(1.7, rarityIndex(rarity)));
}
