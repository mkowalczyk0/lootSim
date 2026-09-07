/**
 * Modifiers — the one currency of power in the game.
 *
 * Every source of strength in the hero half of the game reduces to a `Mods` record:
 * the class you picked, the levels you spent on its tree, and every rolled affix on
 * every piece of gear. The simulation never asks "what item is this from"; it asks
 * "what is my crit chance", and gets one number back.
 *
 * That is deliberate. It's what lets a lightning lancer exist: the class hands you a
 * charge that pierces, the tree hands you extra bounces, the spear hands you `+2
 * projectiles` and `+35% lightning damage`, and none of those three things had to know
 * about the others.
 *
 * Pure data. Every percentage lives here as a fraction — 0.35 is +35%.
 */

import { ELEMENTS, type Element } from "./elements";

/** The six numbers on the character sheet. Unchanged from the original game. */
export const STAT_KEYS = ["attack", "defense", "maxHealth", "power", "haste", "maxMana"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  attack: "ATK",
  defense: "DEF",
  maxHealth: "HP",
  power: "PWR",
  haste: "HST",
  maxMana: "MANA",
};

/**
 * Everything else a modifier can touch. These are the verbs of a build — the reason
 * two characters at the same level with the same item budget play nothing alike.
 */
export const COMBAT_MOD_KEYS = [
  "critChance", "critDamage", "attackSpeed", "moveSpeed", "areaSize",
  "projectiles", "pierce", "ailmentChance", "ailmentPotency",
  "lifeOnHit", "manaOnHit", "cooldownRate", "ultimateRate", "ultimatePower",
  "skillDamage", "meleeDamage", "projectileDamage", "elementalDamage",
  "wardPower", "thorns", "ultimateBounces", "ultimateProjectiles",
  "healthPercent", "defensePercent", "manaRegen",
] as const;
export type CombatModKey = (typeof COMBAT_MOD_KEYS)[number];

export const DAMAGE_MOD_KEYS = [
  "fireDamage", "coldDamage", "lightningDamage", "poisonDamage", "voidDamage",
] as const;
export const RESIST_MOD_KEYS = [
  "fireResist", "coldResist", "lightningResist", "poisonResist", "voidResist",
] as const;
export type DamageModKey = (typeof DAMAGE_MOD_KEYS)[number];
export type ResistModKey = (typeof RESIST_MOD_KEYS)[number];

export const MOD_KEYS = [
  ...STAT_KEYS, ...COMBAT_MOD_KEYS, ...DAMAGE_MOD_KEYS, ...RESIST_MOD_KEYS,
] as const;
export type ModKey = (typeof MOD_KEYS)[number];

export type Mods = Record<ModKey, number>;

/** Element -> the two mod keys that speak for it, so loops stay data-driven. */
export const ELEMENT_DAMAGE_KEY: Record<Element, DamageModKey | null> = {
  physical: null,
  fire: "fireDamage", cold: "coldDamage", lightning: "lightningDamage",
  poison: "poisonDamage", void: "voidDamage",
};
export const ELEMENT_RESIST_KEY: Record<Element, ResistModKey | null> = {
  physical: null,
  fire: "fireResist", cold: "coldResist", lightning: "lightningResist",
  poison: "poisonResist", void: "voidResist",
};

export function zeroMods(): Mods {
  const m = {} as Mods;
  for (const k of MOD_KEYS) m[k] = 0;
  return m;
}

export function addMods(into: Mods, from: Partial<Mods> | undefined): Mods {
  if (!from) return into;
  for (const k of MOD_KEYS) {
    const v = from[k];
    if (v) into[k] += v;
  }
  return into;
}

/** True when a key is displayed as a percentage rather than a flat number. */
export const PERCENT_MODS = new Set<ModKey>([
  "critChance", "critDamage", "attackSpeed", "moveSpeed", "areaSize",
  "ailmentChance", "ailmentPotency", "cooldownRate", "ultimateRate", "ultimatePower",
  "skillDamage", "meleeDamage", "projectileDamage", "elementalDamage", "wardPower",
  "healthPercent", "defensePercent",
  ...DAMAGE_MOD_KEYS,
]);

export const MOD_LABELS: Record<ModKey, string> = {
  attack: "attack", defense: "defense", maxHealth: "max health",
  power: "power", haste: "haste", maxMana: "max mana",
  critChance: "critical chance",
  critDamage: "critical damage",
  attackSpeed: "attack speed",
  moveSpeed: "movement speed",
  areaSize: "area of effect",
  projectiles: "projectiles",
  pierce: "pierce",
  ailmentChance: "ailment chance",
  ailmentPotency: "ailment potency",
  lifeOnHit: "life on hit",
  manaOnHit: "mana on hit",
  cooldownRate: "cooldown recovery",
  ultimateRate: "ultimate charge rate",
  ultimatePower: "ultimate damage",
  skillDamage: "skill damage",
  meleeDamage: "melee damage",
  projectileDamage: "projectile damage",
  elementalDamage: "elemental damage",
  wardPower: "ward strength",
  thorns: "thorns",
  ultimateBounces: "ultimate bounces",
  ultimateProjectiles: "ultimate projectiles",
  healthPercent: "maximum health",
  defensePercent: "defense",
  manaRegen: "mana regeneration",
  fireDamage: "fire damage", coldDamage: "cold damage",
  lightningDamage: "lightning damage", poisonDamage: "poison damage",
  voidDamage: "void damage",
  fireResist: "fire resist", coldResist: "cold resist",
  lightningResist: "lightning resist", poisonResist: "poison resist",
  voidResist: "void resist",
};

/** "+35% fire damage", "+12 attack". One formatter, used by every screen. */
export function modLine(key: ModKey, value: number): string {
  const sign = value >= 0 ? "+" : "";
  if (PERCENT_MODS.has(key)) return `${sign}${Math.round(value * 100)}% ${MOD_LABELS[key]}`;
  return `${sign}${Math.round(value * 10) / 10} ${MOD_LABELS[key]}`;
}

/** Every non-zero entry, in a stable order, ready to print. */
export function modLines(mods: Partial<Mods>): string[] {
  const out: string[] = [];
  for (const k of MOD_KEYS) {
    const v = mods[k];
    if (v) out.push(modLine(k, v));
  }
  return out;
}

/** Elemental damage carried by a mod set, as a fraction of the hit, per element. */
export function elementalFractions(mods: Mods): Partial<Record<Element, number>> {
  const out: Partial<Record<Element, number>> = {};
  for (const e of ELEMENTS) {
    const key = ELEMENT_DAMAGE_KEY[e];
    if (!key) continue;
    // A generic "+x% elemental damage" roll boosts every element you already have,
    // which is what makes a second fire mod worth more than the first.
    const base = mods[key];
    if (base > 0) out[e] = base * (1 + mods.elementalDamage);
  }
  return out;
}
