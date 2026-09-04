import type { Rarity } from "./rarity";

/** `staff` shares the weapon slot but converts your attack into a projectile. */
export const ITEM_TYPES = ["weapon", "staff", "armor", "shield", "ring", "gloves", "necklace"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const EQUIP_SLOTS = ["weapon", "armor", "shield", "ring", "gloves", "necklace"] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export function slotForType(type: ItemType): EquipSlot {
  return type === "staff" ? "weapon" : type;
}

/** Item name tables from the original game, unchanged. */
export const ITEM_NAMES: Record<Rarity, Record<ItemType, readonly string[]>> = {
  common: {
    weapon: ["Wooden Sword", "Wooden Axe", "Wooden Mace"],
    armor: ["Wooden Armor", "Leather Armor", "Cotton Robes"],
    shield: ["Wooden Shield", "Leather Shield"],
    staff: ["Apprentice Staff", "Wooden Wand"],
    ring: ["Copper Ring", "Wooden Ring"],
    gloves: ["Leather Gloves", "Cotton Gloves"],
    necklace: ["Hemp Necklace", "Wooden Pendant"],
  },
  uncommon: {
    weapon: ["Iron Sword", "Bronze Axe", "Steel Mace"],
    armor: ["Iron Chestplate", "Padded Leather Armor", "Hardened Robes"],
    shield: ["Iron Shield", "Reinforced Leather Shield"],
    staff: ["Initiate Staff", "Oak Wand"],
    ring: ["Bronze Ring", "Iron Band"],
    gloves: ["Iron Gauntlets", "Stitched Leather Gloves"],
    necklace: ["Copper Chain", "Iron Pendant"],
  },
  rare: {
    weapon: ["Steel Longsword", "Runed Battleaxe", "Spiked Morningstar"],
    armor: ["Steel Armor", "Enchanted Leather Vest", "Silken Robes"],
    shield: ["Steel Shield", "Runed Buckler"],
    staff: ["Mage's Staff", "Crystal Wand"],
    ring: ["Silver Ring", "Runed Band"],
    gloves: ["Steel Gauntlets", "Silken Gloves"],
    necklace: ["Silver Amulet", "Crystal Pendant"],
  },
  epic: {
    weapon: ["Fiery Blade", "Shadow Cleaver", "Thunder Hammer"],
    armor: ["Dragonhide Vest", "Shadowforged Plate", "Mystic Robes"],
    shield: ["Dragon Scale Shield", "Aegis of Shadows"],
    staff: ["Arcane Staff", "Eldritch Wand"],
    ring: ["Ring of Flames", "Moonstone Band"],
    gloves: ["Gauntlets of Power", "Spellwoven Gloves"],
    necklace: ["Amulet of the Phoenix", "Runed Locket"],
  },
  legendary: {
    weapon: ["Sword of Heroes", "Axe of the Forgotten King", "Hammer of the Titans"],
    armor: ["Celestial Plate", "Eternal Vestments", "Dragonweave Robes"],
    shield: ["Aegis of Eternity", "Shield of the Colossus"],
    staff: ["Staff of the Archmage", "Wand of Infinite Wisdom"],
    ring: ["Ring of the Ancients", "Band of Eternity"],
    gloves: ["Gloves of the Flamekeeper", "Voidforged Gauntlets"],
    necklace: ["Necklace of Everlasting Light", "Amulet of the Eternal"],
  },
  mythic: {
    weapon: ["Blade of Infinite Stars", "Axe of the Cosmos", "Hammer of Eternal Fury"],
    armor: ["Armor of the Void", "Cosmic Vestments", "Robes of the Archon"],
    shield: ["Barrier of Infinity", "Bulwark of the Eternal"],
    staff: ["Staff of the Voidseer", "Wand of the Cosmos"],
    ring: ["Mythril Ring", "Band of Infinity"],
    gloves: ["Gauntlets of the Cosmos", "Gloves of the Unseen"],
    necklace: ["Pendant of Infinity", "Amulet of the Beyond"],
  },
  divine: {
    weapon: ["Heavenly Blade", "Axe of Divine Wrath", "Hammer of the Holy"],
    armor: ["Raiment of the Heavens", "Divine Plate", "Robes of the Seraphim"],
    shield: ["Shield of the Archangel", "Aegis of Divinity"],
    staff: ["Staff of Celestial Power", "Wand of the Seraph"],
    ring: ["Halo Ring", "Celestial Band"],
    gloves: ["Gloves of Divinity", "Gauntlets of the Heavens"],
    necklace: ["Amulet of the Angels", "Necklace of Celestial Grace"],
  },
  unspoken: {
    weapon: ["Nameless Blade", "Axe of the Unseen", "Hammer of Forgotten Oaths"],
    armor: ["Shroud of the Unspoken", "Armor of the Veil", "Ethereal Robes"],
    shield: ["Shield of Silent Promises", "Aegis of Whispers"],
    staff: ["Staff of the Nameless", "Wand of Eternal Mystery"],
    ring: ["Ring of the Unknown", "Band of Silent Eternity"],
    gloves: ["Veiled Gauntlets", "Gloves of Hidden Truths"],
    necklace: ["Necklace of the Forgotten", "Amulet of the Unspoken"],
  },
};

/** Per-type stat budget, multiplied by the rarity multiplier. From the original. */
export const TYPE_STATS: Record<ItemType, Partial<Record<StatKey, number>>> = {
  weapon: { attack: 8 },
  staff: { attack: 7, power: 2 },
  armor: { maxHealth: 10, defense: 2 },
  shield: { defense: 10 },
  ring: { attack: 2, defense: 4, power: 1 },
  gloves: { attack: 4, defense: 2, haste: 2 },
  necklace: { maxHealth: 15, power: 1 },
};

export const STAT_KEYS = ["attack", "defense", "maxHealth", "power", "haste"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  attack: "ATK",
  defense: "DEF",
  maxHealth: "HP",
  power: "PWR",
  haste: "HST",
};

/**
 * Affixes give two items of the same name and rarity different personalities, so
 * upgrading stays interesting once you have a full set of the right rarity.
 */
export interface Affix {
  readonly id: string;
  readonly label: string;
  readonly stat: StatKey;
  /** Fraction of the item's base budget added to `stat`. */
  readonly bonus: number;
}

export const AFFIXES: readonly Affix[] = [
  { id: "keen", label: "Keen", stat: "attack", bonus: 0.35 },
  { id: "brutal", label: "Brutal", stat: "attack", bonus: 0.55 },
  { id: "guarded", label: "Guarded", stat: "defense", bonus: 0.4 },
  { id: "bulwark", label: "Bulwark", stat: "defense", bonus: 0.6 },
  { id: "vital", label: "Vital", stat: "maxHealth", bonus: 0.45 },
  { id: "titanic", label: "Titanic", stat: "maxHealth", bonus: 0.7 },
  { id: "arcane", label: "Arcane", stat: "power", bonus: 0.5 },
  { id: "swift", label: "Swift", stat: "haste", bonus: 0.5 },
  { id: "frenzied", label: "Frenzied", stat: "haste", bonus: 0.8 },
];
