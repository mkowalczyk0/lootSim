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

import type { EquipSlot, ItemType } from "./items";
import { RARITIES, RARITY_VALUE, rarityIndex, type Rarity } from "./rarity";
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

/**
 * Coins a reforge burns, on top of the Iron Scrap it shares with a craft
 * (`craftBulkCost`). Reuses the sell-value scale rather than a new curve — it already
 * climbs ~2.5-3x a tier, which is "aggressive" without a knob of its own to tune, and it
 * lands an unspoken reforge above the priciest chest in the game. Unlike crafting,
 * reforging isn't capped at `CRAFT_MAX_RARITY`: it can only reroll the affixes on an item
 * you already found, never manufacture a divine or unspoken from nothing, so the "keep it
 * absurd" acquisition odds in `rarity.ts` are untouched.
 */
export function reforgeCoinCost(rarity: Rarity): number {
  return Math.round(RARITY_VALUE[rarity] * 3);
}

// --- the workbench (UAT §24 / §26 / §27) -----------------------------------------------

/**
 * Ash — the one crafting currency, and the only new one (§27 says in its own heading not
 * to overcomplicate this). It comes from exactly one place: **salvaging** an item at the
 * Forge, which is §24's promise that an unwanted legendary is a component rather than
 * vendor trash. Ash pays for shaping an item you already have (every op below); coins
 * stay the bulk cost they always were; the nine materials stay the currency of *making*
 * (recipes, essences). Three roles, three currencies, none of them an orb.
 */
export const ASH_NAME = "Ash";

/** Ash returned for salvaging one item of each rarity. Roughly ×2.5 a tier. */
export const SALVAGE_ASH: Record<Rarity, number> = {
  common: 1, uncommon: 2, rare: 5, epic: 12, legendary: 30, mythic: 75, divine: 200, unspoken: 600,
};
/** A named item salvages for double — it was harder to get, and it is a component in §24's sense. */
export const SALVAGE_NAMED_MULT = 2;
/**
 * Each elemental affix on a salvaged item also returns a pinch of that element's material:
 * the ashes of what the thing was made of. Scaled by rarity tier so a mythic fire ring
 * returns a real handful.
 */
export function salvageEssence(rarity: Rarity): number {
  return 1 + rarityIndex(rarity) * 2;
}

/**
 * Everything the bench can do to an item you already own. `reforge` predates this file's
 * overhaul and is unchanged; the rest are §26's list made concrete.
 */
export const FORGE_OPS = [
  "reforge", "temper", "recast", "augment",
  "inscribe", "rescribe", "eraseGrant",
  "awaken", "eraseTrigger",
  "ascend", "salvage",
] as const;
export type ForgeOp = (typeof FORGE_OPS)[number];

export interface ForgeOpInfo {
  readonly label: string;
  readonly blurb: string;
  /** True when the op acts on one chosen affix, so the UI needs a target. */
  readonly needsAffix: boolean;
}

export const FORGE_OP_INFO: Record<ForgeOp, ForgeOpInfo> = {
  reforge: { label: "Reforge", blurb: "Reroll every affix. Keeps the base stats, the grant and the trigger.", needsAffix: false },
  temper: { label: "Temper", blurb: "Reroll one affix's value within its own range. The affix stays what it is.", needsAffix: true },
  recast: { label: "Recast", blurb: "Swap one affix for a different one. Everything else is locked.", needsAffix: true },
  augment: { label: "Augment", blurb: "Add an affix, up to what the rarity allows. Never past it.", needsAffix: false },
  inscribe: { label: "Inscribe", blurb: "Grant the item a skill. Epic and up; weapons, rings and necklaces.", needsAffix: false },
  rescribe: { label: "Rescribe", blurb: "Reroll which skill the item grants.", needsAffix: false },
  eraseGrant: { label: "Erase skill", blurb: "Remove the granted skill.", needsAffix: false },
  awaken: { label: "Awaken", blurb: "Give the item a trigger, or reroll the one it has. Legendary and up.", needsAffix: false },
  eraseTrigger: { label: "Erase trigger", blurb: "Remove the trigger.", needsAffix: false },
  ascend: { label: "Ascend", blurb: "Raise the item one rarity, keeping its affixes. Consumes two stash items of its current rarity. Stops at mythic.", needsAffix: false },
  salvage: { label: "Salvage", blurb: "Break the item down for Ash and a pinch of the materials it was made of. Gone for good.", needsAffix: false },
};

/** Ash an op costs at common, before the per-tier doubling. Zero means the op takes none. */
const ASH_BASE: Record<ForgeOp, number> = {
  reforge: 0, temper: 3, recast: 6, augment: 8,
  inscribe: 15, rescribe: 10, eraseGrant: 2,
  awaken: 18, eraseTrigger: 2,
  ascend: 40, salvage: 0,
};
/** Coin cost as a multiple of `reforgeCoinCost` for the item's rarity. */
const COIN_MULT: Record<ForgeOp, number> = {
  reforge: 1, temper: 0.5, recast: 0.75, augment: 1,
  inscribe: 1.5, rescribe: 1, eraseGrant: 0.25,
  awaken: 1.5, eraseTrigger: 0.25,
  ascend: 2, salvage: 0,
};

/**
 * What an op costs on an item of `rarity`. Ash doubles per tier — §26's "scales
 * aggressively": a legendary temper is sixteen times a common one, and an ascension to
 * mythic costs more Ash than salvaging a dozen legendaries returns. For `ascend` the
 * coin and scrap parts are priced at the rarity being *reached*.
 */
export function forgeOpCost(op: ForgeOp, rarity: Rarity): { ash: number; coins: number; scrap: number } {
  const tier = rarityIndex(rarity);
  const ash = Math.round(ASH_BASE[op] * Math.pow(2, tier));
  if (op === "ascend") {
    const target = ascendTarget(rarity) ?? rarity;
    return { ash, coins: Math.round(reforgeCoinCost(target) * COIN_MULT.ascend), scrap: craftBulkCost(target) * 3 };
  }
  const coins = Math.round(reforgeCoinCost(rarity) * COIN_MULT[op]);
  const scrap = op === "reforge" || op === "augment" ? craftBulkCost(rarity) : 0;
  return { ash, coins, scrap };
}

/** Same-rarity stash items an ascension consumes, on top of Ash, coins and scrap. */
export const ASCEND_COMPONENTS = 2;

/** The rarity one step up, or null at the crafting cap. Mythic is the wall; divine and unspoken stay chest-only. */
export function ascendTarget(rarity: Rarity): Rarity | null {
  const i = rarityIndex(rarity);
  if (i >= rarityIndex(CRAFT_MAX_RARITY)) return null;
  return RARITIES[i + 1] ?? null;
}

// --- multi-item recipes (§24 / §25) ------------------------------------------------------

/**
 * One line of a recipe's item bill: "three legendary shields", "one The First Seal". A
 * requirement with no `named` never consumes a named item — a boss-exclusive is never
 * eaten as generic fodder — and an item satisfies at most one line.
 */
export interface ItemRequirement {
  readonly count: number;
  readonly minRarity?: Rarity;
  readonly slot?: EquipSlot;
  readonly type?: ItemType;
  /** A specific named item, by definition id. */
  readonly named?: string;
}

/** True when `item` could stand in for one unit of `req`. */
export function itemMeetsRequirement(
  req: ItemRequirement,
  item: { rarity: Rarity; slot: EquipSlot; type: ItemType; named: string | null },
): boolean {
  if (req.named !== undefined) {
    if (item.named !== req.named) return false;
  } else if (item.named) {
    return false;
  }
  if (req.slot !== undefined && item.slot !== req.slot) return false;
  if (req.type !== undefined && item.type !== req.type) return false;
  if (req.minRarity !== undefined && rarityIndex(item.rarity) < rarityIndex(req.minRarity)) return false;
  return true;
}

/** "3 legendary shields", "1 The First Seal" — with `nameOf` resolving a named id. */
export function requirementLabel(req: ItemRequirement, nameOf: (id: string) => string): string {
  if (req.named !== undefined) return `${req.count} × ${nameOf(req.named)}`;
  const parts = [req.minRarity ? `${req.minRarity}+` : "", req.type ?? req.slot ?? "item"];
  const noun = parts.filter(Boolean).join(" ");
  return `${req.count} × ${noun}${req.count === 1 ? "" : "s"}`;
}
