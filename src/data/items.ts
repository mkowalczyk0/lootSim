/**
 * Items: what drops, what it can roll, and what it's called.
 *
 * The name tables are the original game's, verbatim — every string that was in the
 * Python version is still here. What changed is underneath them: an item is no longer
 * "a stat block plus maybe one affix", it is a weapon family plus a list of rolled
 * modifiers, and at the top rarities it can carry a granted skill or a trigger that
 * goes off on its own. That's the difference between finding a bigger sword and
 * finding a sword that changes how you play.
 *
 * Pure data.
 */

import {
  ELEMENT_SUFFIX, ELEMENT_WARD_SUFFIX, LOOT_ELEMENTS, RESERVED_ELEMENTS, type Element,
} from "./elements";
import {
  ELEMENT_DAMAGE_KEY, ELEMENT_RESIST_KEY, type ModKey, type StatKey,
} from "./mods";
import { RARITY_MULTIPLIERS, rarityIndex, type Rarity } from "./rarity";
import { WEAPONS, WEAPON_FAMILIES, type WeaponFamily } from "./weapons";

export { STAT_KEYS, STAT_LABELS, type StatKey } from "./mods";

/**
 * Every item type. The six weapon families all live in the weapon slot — which one you
 * carry decides what your attack button does, not where it hangs on the character.
 */
export const ITEM_TYPES = [
  ...WEAPON_FAMILIES, "armor", "shield", "ring", "gloves", "necklace",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const EQUIP_SLOTS = ["weapon", "armor", "shield", "ring", "gloves", "necklace"] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export function slotForType(type: ItemType): EquipSlot {
  return isWeaponType(type) ? "weapon" : type;
}

export function isWeaponType(type: ItemType): type is WeaponFamily {
  return (WEAPON_FAMILIES as readonly string[]).includes(type);
}

/**
 * Item name tables from the original game. The original `weapon` list held a sword, an
 * axe and a mace at every rarity; those are split across the sword and axe families so
 * not one word of it is lost. Spears, daggers and talismans are new, written to match.
 */
export const ITEM_NAMES: Record<Rarity, Record<ItemType, readonly string[]>> = {
  common: {
    sword: ["Wooden Sword"],
    axe: ["Wooden Axe", "Wooden Mace"],
    spear: ["Sharpened Pole", "Hunting Spear"],
    daggers: ["Rusted Knives", "Whittling Blades"],
    staff: ["Apprentice Staff", "Wooden Wand"],
    talisman: ["Bone Charm", "Clay Fetish"],
    hammer: ["Stone Hammer"],
    bow: ["Hunting Bow"],
    whip: ["Leather Whip"],
    claws: ["Bone Claws"],
    chakram: ["Wooden Ring Blade"],
    scythe: ["Rusted Scythe"],
    rapier: ["Practice Rapier"],
    fists: ["Wrapped Fists"],
    armor: ["Wooden Armor", "Leather Armor", "Cotton Robes"],
    shield: ["Wooden Shield", "Leather Shield"],
    ring: ["Copper Ring", "Wooden Ring"],
    gloves: ["Leather Gloves", "Cotton Gloves"],
    necklace: ["Hemp Necklace", "Wooden Pendant"],
  },
  uncommon: {
    sword: ["Iron Sword"],
    axe: ["Bronze Axe", "Steel Mace"],
    spear: ["Iron Lance", "Bronze Pike"],
    daggers: ["Iron Fangs", "Bronze Shivs"],
    staff: ["Initiate Staff", "Oak Wand"],
    talisman: ["Bronze Idol", "Feathered Charm"],
    hammer: ["Iron Maul"],
    bow: ["Bronze Longbow"],
    whip: ["Barbed Whip"],
    claws: ["Iron Talons"],
    chakram: ["Bronze Chakram"],
    scythe: ["Iron Reaper"],
    rapier: ["Iron Rapier"],
    fists: ["Iron Knuckles"],
    armor: ["Iron Chestplate", "Padded Leather Armor", "Hardened Robes"],
    shield: ["Iron Shield", "Reinforced Leather Shield"],
    ring: ["Bronze Ring", "Iron Band"],
    gloves: ["Iron Gauntlets", "Stitched Leather Gloves"],
    necklace: ["Copper Chain", "Iron Pendant"],
  },
  rare: {
    sword: ["Steel Longsword"],
    axe: ["Runed Battleaxe", "Spiked Morningstar"],
    spear: ["Steel Halberd", "Runed Lance"],
    daggers: ["Steel Twinblades", "Runed Fangs"],
    staff: ["Mage's Staff", "Crystal Wand"],
    talisman: ["Runed Idol", "Crystal Fetish"],
    hammer: ["Steel War Hammer"],
    bow: ["Recurve of the Hunt"],
    whip: ["Serpent's Coil"],
    claws: ["Steel Talons"],
    chakram: ["Steel Chakram"],
    scythe: ["Runed Scythe"],
    rapier: ["Silver Rapier"],
    fists: ["Steel Knuckles"],
    armor: ["Steel Armor", "Enchanted Leather Vest", "Silken Robes"],
    shield: ["Steel Shield", "Runed Buckler"],
    ring: ["Silver Ring", "Runed Band"],
    gloves: ["Steel Gauntlets", "Silken Gloves"],
    necklace: ["Silver Amulet", "Crystal Pendant"],
  },
  epic: {
    sword: ["Fiery Blade"],
    axe: ["Shadow Cleaver", "Thunder Hammer"],
    spear: ["Dragonbone Pike", "Stormpoint Lance"],
    daggers: ["Shadow Fangs", "Fiery Twinblades"],
    staff: ["Arcane Staff", "Eldritch Wand"],
    talisman: ["Eldritch Idol", "Stormbound Charm"],
    hammer: ["Thunderhead Maul"],
    bow: ["Stormflight Bow"],
    whip: ["Shadowlash"],
    claws: ["Shadow Talons"],
    chakram: ["Stormedge Chakram"],
    scythe: ["Soulreaper"],
    rapier: ["Duelist's Blade"],
    fists: ["Stormfist Gauntlets"],
    armor: ["Dragonhide Vest", "Shadowforged Plate", "Mystic Robes"],
    shield: ["Dragon Scale Shield", "Aegis of Shadows"],
    ring: ["Ring of Flames", "Moonstone Band"],
    gloves: ["Gauntlets of Power", "Spellwoven Gloves"],
    necklace: ["Amulet of the Phoenix", "Runed Locket"],
  },
  legendary: {
    sword: ["Sword of Heroes"],
    axe: ["Axe of the Forgotten King", "Hammer of the Titans"],
    spear: ["Lance of the Dawnrider", "Pike of the Titan Guard"],
    daggers: ["Fangs of the Forgotten King", "Twinblades of Heroes"],
    staff: ["Staff of the Archmage", "Wand of Infinite Wisdom"],
    talisman: ["Idol of the Ancestors", "Charm of Everlasting Light"],
    hammer: ["Hammer of the Iron Throne"],
    bow: ["Bow of the Far Sight"],
    whip: ["Whip of the Forgotten King"],
    claws: ["Talons of the Forgotten King"],
    chakram: ["Chakram of the Titan Guard"],
    scythe: ["Reaper of Heroes"],
    rapier: ["Rapier of the Everdawn"],
    fists: ["Fists of the Titan Guard"],
    armor: ["Celestial Plate", "Eternal Vestments", "Dragonweave Robes"],
    shield: ["Aegis of Eternity", "Shield of the Colossus"],
    ring: ["Ring of the Ancients", "Band of Eternity"],
    gloves: ["Gloves of the Flamekeeper", "Voidforged Gauntlets"],
    necklace: ["Necklace of Everlasting Light", "Amulet of the Eternal"],
  },
  mythic: {
    sword: ["Blade of Infinite Stars"],
    axe: ["Axe of the Cosmos", "Hammer of Eternal Fury"],
    spear: ["Skewer of Infinite Stars", "Cosmic Impaler"],
    daggers: ["Fangs of the Cosmos", "Twinblades of Infinite Stars"],
    staff: ["Staff of the Voidseer", "Wand of the Cosmos"],
    talisman: ["Idol of the Cosmos", "Fetish of Infinity"],
    hammer: ["Hammer of Collapsing Stars"],
    bow: ["Bow of Infinite Arrows"],
    whip: ["Coil of the Cosmos"],
    claws: ["Claws of the Cosmos"],
    chakram: ["Chakram of Infinite Stars"],
    scythe: ["Scythe of the Cosmos"],
    rapier: ["Rapier of Infinite Stars"],
    fists: ["Fists of the Cosmos"],
    armor: ["Armor of the Void", "Cosmic Vestments", "Robes of the Archon"],
    shield: ["Barrier of Infinity", "Bulwark of the Eternal"],
    ring: ["Mythril Ring", "Band of Infinity"],
    gloves: ["Gauntlets of the Cosmos", "Gloves of the Unseen"],
    necklace: ["Pendant of Infinity", "Amulet of the Beyond"],
  },
  divine: {
    sword: ["Heavenly Blade"],
    axe: ["Axe of Divine Wrath", "Hammer of the Holy"],
    spear: ["Lance of Divine Judgement", "Seraph's Pike"],
    daggers: ["Divine Twinfangs", "Seraph's Knives"],
    staff: ["Staff of Celestial Power", "Wand of the Seraph"],
    talisman: ["Idol of the Seraphim", "Charm of Divine Grace"],
    hammer: ["Maul of the Heavens"],
    bow: ["Seraph's Longbow"],
    whip: ["Lash of Divine Judgement"],
    claws: ["Talons of the Seraphim"],
    chakram: ["Chakram of the Heavens"],
    scythe: ["Reaper of the Seraphim"],
    rapier: ["Seraph's Rapier"],
    fists: ["Fists of the Heavens"],
    armor: ["Raiment of the Heavens", "Divine Plate", "Robes of the Seraphim"],
    shield: ["Shield of the Archangel", "Aegis of Divinity"],
    ring: ["Halo Ring", "Celestial Band"],
    gloves: ["Gloves of Divinity", "Gauntlets of the Heavens"],
    necklace: ["Amulet of the Angels", "Necklace of Celestial Grace"],
  },
  unspoken: {
    sword: ["Nameless Blade"],
    axe: ["Axe of the Unseen", "Hammer of Forgotten Oaths"],
    spear: ["Lance of the Unspoken", "Nameless Skewer"],
    daggers: ["Fangs of the Unspoken", "Nameless Knives"],
    staff: ["Staff of the Nameless", "Wand of Eternal Mystery"],
    talisman: ["Idol of the Unspoken", "Charm of Forgotten Truths"],
    hammer: ["Hammer of Silence"],
    bow: ["Bow of the Unseen Shot"],
    whip: ["Whip of the Unspoken"],
    claws: ["Claws of the Unspoken"],
    chakram: ["Chakram of Forgotten Oaths"],
    scythe: ["Scythe of Forgotten Truths"],
    rapier: ["Nameless Rapier"],
    fists: ["Fists of the Unspoken"],
    armor: ["Shroud of the Unspoken", "Armor of the Veil", "Ethereal Robes"],
    shield: ["Shield of Silent Promises", "Aegis of Whispers"],
    ring: ["Ring of the Unknown", "Band of Silent Eternity"],
    gloves: ["Veiled Gauntlets", "Gloves of Hidden Truths"],
    necklace: ["Necklace of the Forgotten", "Amulet of the Unspoken"],
  },
};

/**
 * Per-type stat budget, multiplied by the rarity multiplier. Weapons take theirs from
 * the weapon family, so a great axe is a heavier item than a pair of daggers in the
 * numbers as well as in the swing.
 */
export const TYPE_STATS: Record<ItemType, Partial<Record<StatKey, number>>> = {
  sword: WEAPONS.sword.stats,
  axe: WEAPONS.axe.stats,
  spear: WEAPONS.spear.stats,
  daggers: WEAPONS.daggers.stats,
  staff: WEAPONS.staff.stats,
  talisman: WEAPONS.talisman.stats,
  hammer: WEAPONS.hammer.stats,
  bow: WEAPONS.bow.stats,
  whip: WEAPONS.whip.stats,
  claws: WEAPONS.claws.stats,
  chakram: WEAPONS.chakram.stats,
  scythe: WEAPONS.scythe.stats,
  rapier: WEAPONS.rapier.stats,
  fists: WEAPONS.fists.stats,
  armor: { maxHealth: 10, defense: 2 },
  shield: { defense: 10 },
  ring: { attack: 2, defense: 4, power: 1, maxMana: 0.7 },
  gloves: { attack: 4, defense: 2, haste: 2, maxMana: 0.4 },
  necklace: { maxHealth: 15, power: 1, maxMana: 1.0 },
};

// --- modifiers ------------------------------------------------------------

/** Which family of slots a modifier is allowed to appear on. */
export type ModWhere = "any" | "weapon" | "offense" | "defense";

/**
 * How a rolled value grows with rarity.
 * - `rarity` follows the 2^n item multiplier, for flat stats that have to keep pace
 *   with the base item or they stop mattering by epic.
 * - `linear` grows gently, for percentages — a 128x crit chance is not a build.
 * - `flat` never grows, for the mods that add a whole extra thing (a projectile, a
 *   bounce). Those are gated by rarity instead.
 */
export type ModScale = "rarity" | "linear" | "flat";

export interface ModRoll {
  readonly id: string;
  readonly key: ModKey;
  readonly kind: "prefix" | "suffix";
  /** Word hung on the item's name. Only one prefix and one suffix ever show. */
  readonly label: string;
  readonly base: number;
  /** For `linear`: the value is base * (1 + tier * perTier). */
  readonly perTier: number;
  readonly scale: ModScale;
  readonly where: ModWhere;
  /** Lowest rarity tier this can roll at. This is the "unlocked at a rarity" dial. */
  readonly minTier: number;
}

/**
 * The two affixes every magic element gets: a slice of your hit converted, or flat
 * resistance to it. One authoring function so the two halves of the element list below
 * cannot drift apart in their numbers — a reserved element's rolls have to be *the same
 * rolls*, or "kept out of the random pool" would quietly also mean "worse".
 */
function elementalMods(e: Exclude<Element, "physical">): ModRoll[] {
  return [
    {
      id: `dmg-${e}`, key: ELEMENT_DAMAGE_KEY[e]!, kind: "suffix", label: ELEMENT_SUFFIX[e],
      base: 0.1, perTier: 0.55, scale: "linear", where: "offense", minTier: 0,
    },
    {
      id: `res-${e}`, key: ELEMENT_RESIST_KEY[e]!, kind: "suffix", label: ELEMENT_WARD_SUFFIX[e],
      base: 12, perTier: 0.85, scale: "linear", where: "defense", minTier: 0,
    },
  ];
}

const ELEMENTAL_MODS: readonly ModRoll[] = LOOT_ELEMENTS.flatMap(elementalMods);

/**
 * Holy, arcane and nature's affixes — authored identically to the five above, and
 * deliberately **not** in `MOD_POOL`.
 *
 * `data/elements.ts` keeps these three out of the random pool on purpose: they are the
 * holy / caster / wild identities, and they should come from a class's kit or from a
 * choice the player paid for, not turn up diluted across every dropped ring. That call
 * stands. What was wrong until Sept 2026 is that they were not authored *at all* —
 * `ELEMENTAL_MODS` was built from `LOOT_ELEMENTS` and nothing else, so `dmg-holy` and
 * `res-holy` did not exist as rolls anywhere in the game. Every path that names an
 * element deliberately went through `rollItem`'s `favorElement`, which weights a roll by
 * *filtering the pool for those two ids* — and filtering a pool that never contained them
 * returns nothing. So the three of them were silently inert:
 *
 *  - A **Forge holy essence** (a Gilt Reliquary, and the same for Rune Fragment and
 *    Heartwood Sap) charged its material and changed the roll in no way whatsoever. The
 *    Craft screen offers all eight magic essences, so three of the eight took payment for
 *    nothing. That is the pre-existing bug, and it predates the Tower by a long way.
 *  - A **floor whose own element is one of the three** could not pay out a variant drop,
 *    which is what made the Tower's holy loot axis inert the day it shipped (UAT §21).
 *
 * The fix is to author them here and splice them in at the one site that already asks for
 * an element by name (`rollMods` in `game/item.ts`), rather than to add them to
 * `MOD_POOL` — which would put holy on every dropped ring and reverse a design call
 * nobody asked to reverse. The bench's Recast and Augment pools read `MOD_POOL` and so
 * still cannot reach these: a bench op is not an element you chose and paid for.
 */
export const RESERVED_ELEMENTAL_MODS: readonly ModRoll[] = RESERVED_ELEMENTS.flatMap(elementalMods);

/**
 * The affix pool. Everything a build wants lives in here somewhere, and the rarity
 * gates are the reason to keep opening chests after you already have a full set: an
 * extra projectile simply does not exist below epic, and an extra ultimate bounce
 * doesn't exist below mythic.
 */
export const MOD_POOL: readonly ModRoll[] = [
  { id: "keen", key: "attack", kind: "prefix", label: "Keen", base: 2.5, perTier: 0, scale: "rarity", where: "offense", minTier: 0 },
  { id: "brutal", key: "attack", kind: "prefix", label: "Brutal", base: 4, perTier: 0, scale: "rarity", where: "weapon", minTier: 1 },
  { id: "guarded", key: "defense", kind: "prefix", label: "Guarded", base: 3, perTier: 0, scale: "rarity", where: "defense", minTier: 0 },
  { id: "bulwark", key: "defense", kind: "prefix", label: "Bulwark", base: 5, perTier: 0, scale: "rarity", where: "defense", minTier: 1 },
  { id: "vital", key: "maxHealth", kind: "prefix", label: "Vital", base: 6, perTier: 0, scale: "rarity", where: "any", minTier: 0 },
  { id: "titanic", key: "maxHealth", kind: "prefix", label: "Titanic", base: 11, perTier: 0, scale: "rarity", where: "defense", minTier: 2 },
  { id: "arcane", key: "power", kind: "prefix", label: "Arcane", base: 1.5, perTier: 0, scale: "rarity", where: "any", minTier: 0 },
  { id: "swift", key: "haste", kind: "prefix", label: "Swift", base: 1.6, perTier: 0, scale: "rarity", where: "offense", minTier: 0 },
  { id: "deep", key: "maxMana", kind: "prefix", label: "Deep", base: 1.2, perTier: 0, scale: "rarity", where: "any", minTier: 0 },

  { id: "frenzied", key: "attackSpeed", kind: "prefix", label: "Frenzied", base: 0.06, perTier: 0.3, scale: "linear", where: "weapon", minTier: 1 },
  { id: "deadly", key: "critChance", kind: "prefix", label: "Deadly", base: 0.035, perTier: 0.28, scale: "linear", where: "offense", minTier: 1 },
  { id: "savage", key: "critDamage", kind: "prefix", label: "Savage", base: 0.15, perTier: 0.35, scale: "linear", where: "weapon", minTier: 1 },
  { id: "fleet", key: "moveSpeed", kind: "prefix", label: "Fleet", base: 0.04, perTier: 0.22, scale: "linear", where: "any", minTier: 1 },
  { id: "vast", key: "areaSize", kind: "prefix", label: "Vast", base: 0.06, perTier: 0.3, scale: "linear", where: "any", minTier: 2 },
  { id: "heavy", key: "meleeDamage", kind: "prefix", label: "Heavy", base: 0.08, perTier: 0.3, scale: "linear", where: "weapon", minTier: 1 },
  { id: "hunters", key: "projectileDamage", kind: "prefix", label: "Hunter's", base: 0.08, perTier: 0.3, scale: "linear", where: "weapon", minTier: 1 },
  { id: "adept", key: "skillDamage", kind: "prefix", label: "Adept", base: 0.08, perTier: 0.32, scale: "linear", where: "any", minTier: 1 },
  { id: "quickened", key: "cooldownRate", kind: "suffix", label: "of Haste", base: 0.06, perTier: 0.3, scale: "linear", where: "any", minTier: 1 },
  { id: "ascendant", key: "ultimateRate", kind: "suffix", label: "of Ascent", base: 0.08, perTier: 0.3, scale: "linear", where: "any", minTier: 2 },
  { id: "cataclysmic", key: "ultimatePower", kind: "prefix", label: "Cataclysmic", base: 0.09, perTier: 0.35, scale: "linear", where: "weapon", minTier: 2 },
  { id: "bloodthirsty", key: "lifeOnHit", kind: "suffix", label: "of Leeching", base: 2, perTier: 1.1, scale: "linear", where: "offense", minTier: 1 },
  { id: "rousing", key: "manaOnHit", kind: "suffix", label: "of Draining", base: 1, perTier: 0.9, scale: "linear", where: "offense", minTier: 1 },
  { id: "virulent", key: "ailmentChance", kind: "prefix", label: "Virulent", base: 0.07, perTier: 0.3, scale: "linear", where: "offense", minTier: 1 },
  { id: "caustic", key: "ailmentPotency", kind: "prefix", label: "Caustic", base: 0.1, perTier: 0.35, scale: "linear", where: "any", minTier: 2 },
  { id: "attuned", key: "elementalDamage", kind: "suffix", label: "of Attunement", base: 0.07, perTier: 0.3, scale: "linear", where: "offense", minTier: 2 },
  { id: "warded", key: "wardPower", kind: "suffix", label: "of Warding", base: 0.1, perTier: 0.3, scale: "linear", where: "defense", minTier: 1 },
  { id: "barbed", key: "thorns", kind: "prefix", label: "Barbed", base: 1.5, perTier: 0, scale: "rarity", where: "defense", minTier: 1 },

  // The whole-extra-thing mods. These are the drops people actually shout about.
  { id: "piercing", key: "pierce", kind: "suffix", label: "of Skewering", base: 1, perTier: 0, scale: "flat", where: "weapon", minTier: 3 },
  { id: "splitting", key: "projectiles", kind: "suffix", label: "of Splitting", base: 1, perTier: 0, scale: "flat", where: "weapon", minTier: 4 },
  // `of the Manifold` (ultimateProjectiles, tier 4) and `of Rebounding` (ultimateBounces,
  // tier 5) stood here and were retired — see RETIRED_MOD_KEYS below and
  // docs/ultimate-mods-removal.md. This block is deliberately two entries thinner at the
  // top end as a result; that is the cost of the removal, not an oversight.

  ...ELEMENTAL_MODS,
];

/**
 * Affix keys that no longer exist, and what a *already-rolled* copy becomes on load.
 *
 * `ItemMod` persists the rolled `key`, and `normalizeItem` drops any mod whose key is not
 * in `MOD_KEYS`. So retiring a key naively **silently deletes the affix off every item
 * already in a stash** — no crash, just quietly smaller gear. This table is the rewrite
 * that runs *ahead* of that filter, the same shape `normalizeAppearance` uses for retired
 * cosmetics and the legacy-essence rewrite uses for a different retirement. It is
 * version-agnostic by construction — an old save and a new one take the same path — which
 * is why retiring a key needs no `SAVE_VERSION` bump.
 *
 * **The replacement value is recomputed, never inherited.** Both retired keys stored flat
 * counts (`of the Manifold` 2 ultimate projectiles, `of Rebounding` 1 ultimate bounce) and
 * the live key they land on is a percentage, so carrying the stored number across would
 * read a flat 2 as +200% ultimate damage. `value` therefore ignores the old magnitude
 * entirely and derives a new one.
 *
 * **What it derives from is the point.** Not a number chosen here — the magnitude is read
 * off `cataclysmic`, the game's own surviving `ultimatePower` affix, evaluated at the
 * item's own tier through the same `base * (1 + tier * perTier)` every linear roll uses.
 * That row is untouched by this change and is looked up by id rather than copied, so if it
 * is ever retuned the rewrite follows it instead of drifting away from it. A retired affix
 * is worth exactly what the live affix for the same stat is worth on the same item.
 *
 * `ultimatePower` was chosen over the nearer-looking `projectiles`/`pierce` deliberately.
 * Those are the game's named whole-extra-thing pillars ("+1 projectile doesn't exist below
 * epic"), and granting one to every existing holder of a retired affix would be a real,
 * uncommanded power injection across every stash in the game — landing on exactly the
 * pillar this change is retiring. `ultimatePower` keeps the two suffixes' own ultimate
 * theme, preserves the item's affix count so nothing visibly shrinks, and is a percentage,
 * so its magnitude can be sized to a peer rather than to a headline.
 */
export const RETIRED_MOD_KEYS: Readonly<Record<string, { to: ModKey; value: (tier: number) => number }>> = {
  ultimateProjectiles: { to: "ultimatePower", value: (tier) => ultimatePowerAt(tier) },
  ultimateBounces: { to: "ultimatePower", value: (tier) => ultimatePowerAt(tier) },
};

/**
 * What the surviving `ultimatePower` affix rolls on a tier-`tier` item. Looked up from
 * `MOD_POOL` rather than restated, so this cannot drift from the row it claims to match.
 */
function ultimatePowerAt(tier: number): number {
  const row = MOD_POOL.find((m) => m.id === "cataclysmic");
  // MOD_POOL is a module constant and `cataclysmic` is in it; the fallback exists so a
  // future edit that removes the row degrades to a sane number instead of throwing on load.
  if (!row) return 0.09;
  return Math.round(row.base * (1 + tier * row.perTier) * 1000) / 1000;
}

/** Slot group a type belongs to, for deciding which affixes may land on it. */
export function whereFor(type: ItemType): Exclude<ModWhere, "any"> {
  if (isWeaponType(type)) return "weapon";
  return type === "ring" || type === "gloves" ? "offense" : "defense";
}

export function modAllowed(mod: ModRoll, type: ItemType, tier: number): boolean {
  if (tier < mod.minTier) return false;
  if (mod.where === "any") return true;
  const group = whereFor(type);
  // A weapon is the most offensive slot there is, so it takes offensive rolls too.
  if (mod.where === "offense") return group === "offense" || group === "weapon";
  return mod.where === group;
}

/**
 * Every affix that could roll on this slot at this rarity tier — one filter, shared by
 * every site that draws an affix and by the workbench's possibilities panel (docket §10).
 *
 * Extracted rather than reimplemented: the §20 rule is that a preview holds no table of
 * its own, and the only way to make that structural instead of promised is for the panel
 * and the roll to call the *same* function. `rollMods`, `augmentPool` and `recastPool`
 * all start here; if this filter is ever wrong, the panel is wrong in exactly the same
 * way the game is, which is the condition `docs/drop-previews.md` asks for.
 */
export function modPoolFor(type: ItemType, tier: number): ModRoll[] {
  return MOD_POOL.filter((m) => modAllowed(m, type, tier));
}

/** Resolved value of a mod on an item of this rarity and item level. */
export function modValue(mod: ModRoll, rarity: Rarity, levelScale: number, variance: number): number {
  const tier = rarityIndex(rarity);
  switch (mod.scale) {
    case "rarity":
      return mod.base * RARITY_MULTIPLIERS[rarity] * levelScale * variance;
    case "linear":
      return mod.base * (1 + tier * mod.perTier) * variance;
    case "flat":
      return mod.base;
  }
}

/**
 * How many modifiers an item of each rarity rolls, as a range. This is the shape of
 * the whole loot chase: a common is a stat stick, an unspoken is a build.
 */
export const MOD_COUNTS: Record<Rarity, readonly [number, number]> = {
  common: [0, 1],
  uncommon: [1, 2],
  rare: [2, 3],
  epic: [3, 4],
  legendary: [4, 5],
  mythic: [4, 6],
  divine: [5, 6],
  unspoken: [6, 7],
};

// --- granted skills and triggers ------------------------------------------

/** Lowest rarity that can carry a granted skill, and the chance it does. */
export const GRANT_MIN_TIER = 3;
export function grantChance(tier: number): number {
  return tier < GRANT_MIN_TIER ? 0 : Math.min(0.6, 0.14 + (tier - GRANT_MIN_TIER) * 0.11);
}

/** Lowest rarity that can carry a trigger, and the chance it does. */
export const TRIGGER_MIN_TIER = 4;
export function triggerChance(tier: number): number {
  return tier < TRIGGER_MIN_TIER ? 0 : Math.min(0.55, 0.12 + (tier - TRIGGER_MIN_TIER) * 0.1);
}

export type TriggerKind = "onHit" | "onKill" | "onDash" | "onUltimate";
export type TriggerEffect = "nova" | "bolt" | "chain";

export interface TriggerSpec {
  readonly id: string;
  readonly kind: TriggerKind;
  readonly effect: TriggerEffect;
  readonly element: Element;
  /** Chance per qualifying event. Always 1 for the rarer events. */
  readonly chance: number;
  /** Multiple of your spell damage. */
  readonly power: number;
  readonly radius: number;
  readonly count: number;
}

export interface TriggerShape {
  readonly kind: TriggerKind;
  readonly effect: TriggerEffect;
  readonly chance: number;
  readonly power: number;
  readonly radius: number;
  readonly count: number;
  readonly verb: string;
}

/** The trigger templates. An element is rolled onto one of these when an item takes it. */
export const TRIGGER_SHAPES: readonly TriggerShape[] = [
  { kind: "onHit", effect: "nova", chance: 0.08, power: 0.7, radius: 78, count: 0, verb: "on hit" },
  { kind: "onHit", effect: "bolt", chance: 0.14, power: 0.55, radius: 6, count: 2, verb: "on hit" },
  { kind: "onKill", effect: "nova", chance: 0.35, power: 1.3, radius: 104, count: 0, verb: "on kill" },
  { kind: "onKill", effect: "chain", chance: 0.3, power: 0.9, radius: 230, count: 3, verb: "on kill" },
  { kind: "onDash", effect: "nova", chance: 1, power: 1.1, radius: 92, count: 0, verb: "when you dash" },
  { kind: "onDash", effect: "bolt", chance: 1, power: 0.8, radius: 6, count: 4, verb: "when you dash" },
  { kind: "onUltimate", effect: "chain", chance: 1, power: 2.4, radius: 320, count: 7, verb: "when your ultimate fires" },
  { kind: "onUltimate", effect: "nova", chance: 1, power: 3.2, radius: 190, count: 0, verb: "when your ultimate fires" },
];

export function triggerLine(t: TriggerSpec): string {
  const shape = TRIGGER_SHAPES.find((s) => s.kind === t.kind && s.effect === t.effect);
  const verb = shape?.verb ?? "on hit";
  const what = t.effect === "nova"
    ? "a burst around you"
    : t.effect === "chain"
      ? `${t.count} arcs of ${t.element}`
      : `${t.count} ${t.element} bolts`;
  const odds = t.chance >= 1 ? "" : `${Math.round(t.chance * 100)}% chance ${verb === "on hit" ? "" : ""}`;
  return `${verb}: ${odds}${odds ? " for " : ""}${what}`;
}
