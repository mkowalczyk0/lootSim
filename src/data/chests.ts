import type { Element } from "./elements";
import type { ItemType } from "./items";
import type { Rarity } from "./rarity";
import { WEAPON_FAMILIES } from "./weapons";

/**
 * The four original tiers, exactly as the Python game had them, plus the handful of
 * chests that promise a *category* rather than a rarity.
 *
 * **This list used to be twenty-eight.** Fourteen single-weapon caches and five elemental
 * caches were removed by the augment overhaul (`docs/augments.md` §3) and replaced, one for
 * one, by nineteen form and element augments. The argument for the trade is the whole
 * design in a sentence: a Bow Cache could promise a family and a Storm Cache could promise
 * an element, and **neither could promise both.** An augment stacks; a chest tier cannot.
 *
 * The three slot caches stayed deliberately. They are the coin-only path, and a player who
 * owns no augments still has to have a shop. `RETIRED_CHEST_TIERS` below is what keeps
 * every save that holds a retired key from losing anything.
 */
export const CHEST_TIERS = [
  "Basic", "Advanced", "Elite", "Legendary",
  "WeaponCache", "ArmorCase", "TrinketBox",
  "LegendsCache", "AdeptsTrove", "CollectorsHoard",
] as const;
export type ChestTier = (typeof CHEST_TIERS)[number];

/**
 * Chests that no longer exist, and what they cost — the only thing a save needs to know
 * about them (`GameState.fromSaved`). Keys for a retired tier are refunded as coins at
 * **full purchase price**, not converted at a ratio into a surviving tier: a ratio is
 * arithmetic nobody can check and it loses value at the edges, and a migration players
 * cannot verify is how trust in a save format dies.
 *
 * `openedInto` is where the lifetime `chestsOpened` count folds, so a record does not
 * silently shrink. Every retired chest used the Advanced-grade odds table.
 */
export const RETIRED_CHEST_TIERS: Record<string, { price: number; openedInto: ChestTier }> = Object.fromEntries([
  ...["Sword", "Axe", "Spear", "Dagger", "Staff", "Talisman"].map((w) => [`${w}Cache`, { price: 1600, openedInto: "Advanced" as ChestTier }]),
  ...["Hammer", "Bow", "Whip", "Claw", "Chakram", "Scythe", "Rapier", "Fist"].map((w) => [`${w}Cache`, { price: 1800, openedInto: "Advanced" as ChestTier }]),
  ...["Ember", "Frost", "Storm", "Venom", "Void"].map((e) => [`${e}Cache`, { price: 1200, openedInto: "Advanced" as ChestTier }]),
]);

export interface ChestTierInfo {
  /** The 24 niche chests need a display name; the four originals keep using the id. */
  readonly name?: string;
  readonly price: number;
  /** Multiplied into the base rarity weights. Zero removes a rarity entirely. */
  readonly weights: Record<Rarity, number>;
  readonly color: string;
  readonly blurb: string;
  /** Restricts what slot/type can drop. Undefined means anything, same as the originals. */
  readonly types?: readonly ItemType[];
  /** Weights the affix roll toward this element's damage or resist mod, like an essence. */
  readonly favorElement?: Element;
  /** Never hands out a weapon the current class wasn't built for. */
  readonly classAdaptive?: boolean;
  /**
   * Weights the affix roll toward the *active class's* own element. Declarative rather
   * than a `favorElement` on the row, because the element isn't known until a class is
   * playing — and declarative rather than a special case in `openChests`, because a
   * `switch` on a chest id is the shape this codebase keeps learning not to write.
   */
  readonly classElement?: boolean;
}

/** Shape of the odds an "Advanced"-grade pull uses: uncommon and up. */
const SPECIALIST_WEIGHTS: Record<Rarity, number> = {
  common: 0.0, uncommon: 1.8, rare: 1.7, epic: 1.5,
  legendary: 1.3, mythic: 1.2, divine: 1.1, unspoken: 1.0,
};

/** Shape of the odds a "Basic"-grade pull uses: everything on the table. */
const CACHE_WEIGHTS: Record<Rarity, number> = {
  common: 1.0, uncommon: 1.0, rare: 1.0, epic: 1.0,
  legendary: 1.0, mythic: 1.0, divine: 1.0, unspoken: 1.0,
};

/** Shape of the odds an "Elite"-grade pull uses: rare and up. */
const ADEPT_WEIGHTS: Record<Rarity, number> = {
  common: 0.0, uncommon: 0.0, rare: 2.4, epic: 2.2,
  legendary: 1.5, mythic: 1.5, divine: 1.3, unspoken: 1.1,
};

/** Legendary and up only — one rung brutal past the Legendary chest itself. */
const CAPSTONE_WEIGHTS: Record<Rarity, number> = {
  common: 0.0, uncommon: 0.0, rare: 0.0, epic: 0.0,
  legendary: 2.8, mythic: 2.2, divine: 1.9, unspoken: 1.4,
};

/**
 * Prices and per-rarity multipliers on the first four are unchanged from the Python
 * original — do not casually touch them. Everything after `Legendary` is new: niche
 * chests that trade a broad roll for a guaranteed slot, family or element, priced for
 * the certainty rather than for the rarity curve underneath it.
 */
export const CHESTS: Record<ChestTier, ChestTierInfo> = {
  Basic: {
    price: 100,
    color: "#9aa0a6",
    blurb: "Everything's on the table, mostly junk.",
    weights: CACHE_WEIGHTS,
  },
  Advanced: {
    price: 500,
    color: "#3ddc4a",
    blurb: "No commons.",
    weights: SPECIALIST_WEIGHTS,
  },
  Elite: {
    price: 2500,
    color: "#a855f7",
    blurb: "Rare and up only.",
    weights: ADEPT_WEIGHTS,
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

  // --- category caches: guaranteed slot group, ordinary odds -----------------

  WeaponCache: {
    name: "Weapon Cache", price: 350, color: "#dbe3ef",
    blurb: "Always a weapon, of some family or other. Six times better odds of one than a Basic chest.",
    weights: CACHE_WEIGHTS, types: WEAPON_FAMILIES,
  },
  ArmorCase: {
    name: "Armor Case", price: 300, color: "#9aa4b2",
    blurb: "Always armor or a shield. Nothing wearable on the hands or the throat.",
    weights: CACHE_WEIGHTS, types: ["armor", "shield"],
  },
  TrinketBox: {
    name: "Trinket Box", price: 300, color: "#ffb6c1",
    blurb: "Always a ring, gloves or a necklace. The small stuff, guaranteed.",
    weights: CACHE_WEIGHTS, types: ["ring", "gloves", "necklace"],
  },

  // --- the class chest -----------------------------------------------------

  LegendsCache: {
    name: "Legend's Cache", price: 3000, color: "#f8d477", weights: ADEPT_WEIGHTS,
    classAdaptive: true, classElement: true,
    blurb: "Requisitioned against the Legend you are wearing. Its weapon, its element, rare and up.",
  },

  // --- the two capstones -------------------------------------------------

  AdeptsTrove: {
    name: "Adept's Trove", price: 3200, color: "#38bdf8", weights: ADEPT_WEIGHTS,
    classAdaptive: true,
    blurb: "Never hands you a weapon your class wasn't built for. Rare and up, same as an Elite chest.",
  },
  CollectorsHoard: {
    name: "Collector's Hoard", price: 25000, color: "#ffb6c1", weights: CAPSTONE_WEIGHTS,
    blurb: "Legendary and up, full stop. One rung past the real gamble.",
  },
};

/** Display name for any chest — the four originals just use their id. */
export function chestName(tier: ChestTier): string {
  return CHESTS[tier].name ?? tier;
}

export interface ChestCategory {
  readonly label: string;
  readonly blurb: string;
  readonly tiers: readonly ChestTier[];
}

/**
 * Groups the 28 chests by what they promise rather than by when they were added, so the
 * shop can be browsed as a handful of categories instead of one long list. Order here is
 * display order in the shop.
 */
export const CHEST_CATEGORIES: readonly ChestCategory[] = [
  {
    label: "General",
    blurb: "The original four. Everything's on the table, priced by rarity floor alone.",
    tiers: ["Basic", "Advanced", "Elite", "Legendary"],
  },
  {
    label: "Slot Caches",
    blurb: "Guaranteed to land in one group of slots — weapon, armor or the small stuff. Ordinary odds, no gambling on category.",
    tiers: ["WeaponCache", "ArmorCase", "TrinketBox"],
  },
  {
    label: "Capstone",
    blurb: "The top of the coin sink. Never hands you junk, and it's priced like it.",
    tiers: ["LegendsCache", "AdeptsTrove", "CollectorsHoard"],
  },
];

/** Which key a monster drops, by depth — deeper floors cough up better keys. Monster
 * drops only ever hand out the four original tiers; the niche chests are bought
 * outright with coins, same as everything else in the Quartermaster's shop. */
export function keyDropTier(depth: number, roll: number): ChestTier {
  if (depth >= 20 && roll < 0.08) return "Legendary";
  if (depth >= 12 && roll < 0.18) return "Elite";
  if (depth >= 5 && roll < 0.4) return "Advanced";
  return "Basic";
}
