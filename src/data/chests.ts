import type { Element } from "./elements";
import type { ItemType } from "./items";
import type { Rarity } from "./rarity";
import { WEAPON_FAMILIES, type WeaponFamily } from "./weapons";

/**
 * The four original tiers, exactly as the Python game had them, plus everything opened
 * beneath them: chests that don't compete on rarity so much as on *what* they promise.
 * A Sword Cache never once rolls you a necklace; an Ember Cache never rolls you cold
 * damage; the Adept's Trove never hands you a weapon you can't use. That certainty is
 * what the higher price buys — the four originals stay untouched on purpose, so a
 * player who remembers the old game still recognizes exactly what they cost and what
 * they pay.
 */
export const CHEST_TIERS = [
  "Basic", "Advanced", "Elite", "Legendary",
  "WeaponCache", "ArmorCase", "TrinketBox",
  "SwordCache", "AxeCache", "SpearCache", "DaggerCache", "StaffCache", "TalismanCache",
  "HammerCache", "BowCache", "WhipCache", "ClawCache", "ChakramCache", "ScytheCache",
  "RapierCache", "FistCache",
  "EmberCache", "FrostCache", "StormCache", "VenomCache", "VoidCache",
  "AdeptsTrove", "CollectorsHoard",
] as const;
export type ChestTier = (typeof CHEST_TIERS)[number];

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

/** One entry per single-weapon-family cache, so the table below reads as data. */
const WEAPON_CACHE_INFO: Record<WeaponFamily, { blurb: string }> = {
  sword: { blurb: "Nothing but swords. No gimmick, same as the family itself." },
  axe: { blurb: "Nothing but great axes. Heavy, and priced like it." },
  spear: { blurb: "Nothing but spears. Reach, guaranteed." },
  daggers: { blurb: "Nothing but twin daggers. Every pull already knows what it wants to be." },
  staff: { blurb: "Nothing but staves. The bolt was always going to be in here somewhere." },
  talisman: { blurb: "Nothing but talismans. Every pull already circles you." },
  hammer: { blurb: "Nothing but warhammers. Slow, guaranteed, expensive for it." },
  bow: { blurb: "Nothing but bows. Distance, every time." },
  whip: { blurb: "Nothing but whips. Reach without the weight, every pull." },
  claws: { blurb: "Nothing but claws. Fast, every time." },
  chakram: { blurb: "Nothing but chakrams. The circle, guaranteed." },
  scythe: { blurb: "Nothing but scythes. The widest arc, every pull." },
  rapier: { blurb: "Nothing but rapiers. Precision, guaranteed." },
  fists: { blurb: "Nothing but fists. The fastest hands in town, every time." },
};

const ELEMENT_CACHE_INFO: Partial<Record<Element, { blurb: string }>> = {
  fire: { blurb: "Weighted toward fire. Everything in here burns a little." },
  cold: { blurb: "Weighted toward cold. Everything in here slows a little." },
  lightning: { blurb: "Weighted toward lightning. Everything in here conducts." },
  poison: { blurb: "Weighted toward poison. Everything in here festers." },
  void: { blurb: "Weighted toward void. Everything in here eats a little." },
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

  // --- single-weapon specialist chests: guaranteed family, Advanced odds -----

  SwordCache: { name: "Sword Cache", price: 1600, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["sword"], blurb: WEAPON_CACHE_INFO.sword.blurb },
  AxeCache: { name: "Axe Cache", price: 1600, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["axe"], blurb: WEAPON_CACHE_INFO.axe.blurb },
  SpearCache: { name: "Spear Cache", price: 1600, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["spear"], blurb: WEAPON_CACHE_INFO.spear.blurb },
  DaggerCache: { name: "Dagger Cache", price: 1600, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["daggers"], blurb: WEAPON_CACHE_INFO.daggers.blurb },
  StaffCache: { name: "Staff Cache", price: 1600, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["staff"], blurb: WEAPON_CACHE_INFO.staff.blurb },
  TalismanCache: { name: "Talisman Cache", price: 1600, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["talisman"], blurb: WEAPON_CACHE_INFO.talisman.blurb },
  HammerCache: { name: "Hammer Cache", price: 1800, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["hammer"], blurb: WEAPON_CACHE_INFO.hammer.blurb },
  BowCache: { name: "Bow Cache", price: 1800, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["bow"], blurb: WEAPON_CACHE_INFO.bow.blurb },
  WhipCache: { name: "Whip Cache", price: 1800, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["whip"], blurb: WEAPON_CACHE_INFO.whip.blurb },
  ClawCache: { name: "Claw Cache", price: 1800, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["claws"], blurb: WEAPON_CACHE_INFO.claws.blurb },
  ChakramCache: { name: "Chakram Cache", price: 1800, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["chakram"], blurb: WEAPON_CACHE_INFO.chakram.blurb },
  ScytheCache: { name: "Scythe Cache", price: 1800, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["scythe"], blurb: WEAPON_CACHE_INFO.scythe.blurb },
  RapierCache: { name: "Rapier Cache", price: 1800, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["rapier"], blurb: WEAPON_CACHE_INFO.rapier.blurb },
  FistCache: { name: "Fist Cache", price: 1800, color: "#dbe3ef", weights: SPECIALIST_WEIGHTS, types: ["fists"], blurb: WEAPON_CACHE_INFO.fists.blurb },

  // --- elemental caches: any slot, biased affix roll, Advanced odds ----------

  EmberCache: {
    name: "Ember Cache", price: 1200, color: "#ff7a2f", weights: SPECIALIST_WEIGHTS,
    favorElement: "fire", blurb: ELEMENT_CACHE_INFO.fire!.blurb,
  },
  FrostCache: {
    name: "Frost Cache", price: 1200, color: "#7dd3fc", weights: SPECIALIST_WEIGHTS,
    favorElement: "cold", blurb: ELEMENT_CACHE_INFO.cold!.blurb,
  },
  StormCache: {
    name: "Storm Cache", price: 1200, color: "#fde047", weights: SPECIALIST_WEIGHTS,
    favorElement: "lightning", blurb: ELEMENT_CACHE_INFO.lightning!.blurb,
  },
  VenomCache: {
    name: "Venom Cache", price: 1200, color: "#84cc16", weights: SPECIALIST_WEIGHTS,
    favorElement: "poison", blurb: ELEMENT_CACHE_INFO.poison!.blurb,
  },
  VoidCache: {
    name: "Void Cache", price: 1200, color: "#c084fc", weights: SPECIALIST_WEIGHTS,
    favorElement: "void", blurb: ELEMENT_CACHE_INFO.void!.blurb,
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
    label: "Weapon Specific",
    blurb: "One weapon family, guaranteed, at Advanced-grade odds. Pay for certainty, not for luck.",
    tiers: [
      "SwordCache", "AxeCache", "SpearCache", "DaggerCache", "StaffCache", "TalismanCache",
      "HammerCache", "BowCache", "WhipCache", "ClawCache", "ChakramCache", "ScytheCache",
      "RapierCache", "FistCache",
    ],
  },
  {
    label: "Elemental",
    blurb: "Any slot, but the affix roll leans hard toward one element — an essence in chest form.",
    tiers: ["EmberCache", "FrostCache", "StormCache", "VenomCache", "VoidCache"],
  },
  {
    label: "Capstone",
    blurb: "The top of the coin sink. Never hands you junk, and it's priced like it.",
    tiers: ["AdeptsTrove", "CollectorsHoard"],
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
