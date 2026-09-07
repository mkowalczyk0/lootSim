import { Rng } from "../core/rng";
import { LOOT_ELEMENTS, type Element } from "../data/elements";
import type { HeroClass } from "../data/classes";
import {
  EQUIP_SLOTS, ITEM_NAMES, MOD_COUNTS, MOD_POOL, TRIGGER_SHAPES, TYPE_STATS,
  grantChance, isWeaponType, modAllowed, modValue, slotForType, triggerChance,
  type EquipSlot, type ItemType, type ModRoll, type TriggerSpec,
} from "../data/items";
import {
  MOD_LABELS, PERCENT_MODS, STAT_KEYS, STAT_LABELS, type ModKey, type Mods, type StatKey,
} from "../data/mods";
import type { Rarity } from "../data/rarity";
import { RARITY_MULTIPLIERS, RARITY_VALUE, rarityIndex } from "../data/rarity";
import { GRANTABLE_ABILITY_IDS } from "../progression/index";
import { WEAPON_FAMILIES, type WeaponFamily } from "../data/weapons";

export type Stats = Record<StatKey, number>;

export function zeroStats(): Stats {
  return { attack: 0, defense: 0, maxHealth: 0, power: 0, haste: 0, maxMana: 0 };
}

export function addStats(into: Stats, from: Partial<Stats>): Stats {
  for (const k of STAT_KEYS) into[k] += from[k] ?? 0;
  return into;
}

/** One rolled affix. `id` points back at the pool entry it came from. */
export interface ItemMod {
  readonly id: string;
  readonly key: ModKey;
  readonly value: number;
}

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly type: ItemType;
  readonly slot: EquipSlot;
  /** Which weapon family this is, or null for anything that isn't a weapon. */
  readonly family: WeaponFamily | null;
  /** Item level, from the depth it dropped at. Adds a slow linear scale on top of rarity. */
  readonly ilvl: number;
  /** The base stat block for the type, before affixes. */
  readonly stats: Stats;
  /** Rolled affixes. Rarity decides how many, and which are even possible. */
  readonly mods: readonly ItemMod[];
  /** An extra castable ability (its id), granted while this is equipped. Epic and up. */
  readonly grant: string | null;
  /** Something that goes off on its own. Legendary and up. */
  readonly trigger: TriggerSpec | null;
  readonly value: number;
}

let nextId = 1;
function makeId(): string {
  return `i${nextId++}`;
}

/** Restores the id counter after a load so freshly rolled items can't collide. */
export function primeItemIds(items: readonly Item[]): void {
  for (const it of items) {
    const n = Number(it.id.slice(1));
    if (Number.isFinite(n) && n >= nextId) nextId = n + 1;
  }
}

/**
 * Picks what kind of item drops. Slots are drawn evenly first and only then does a
 * weapon decide which family it is, so adding a seventh weapon family never quietly
 * halves everybody's chance of finding a necklace.
 *
 * `favor` biases the weapon roll toward a class's own families — most of the weapons
 * you find should be ones you can actually use. `forceFavor` makes that a certainty
 * instead of a bias, for the one chest that promises never to hand you a weapon your
 * class wasn't built for.
 */
export function randomItemType(
  rng: Rng, favor?: readonly WeaponFamily[], forceFavor = false,
): ItemType {
  const slot = rng.pick(EQUIP_SLOTS);
  if (slot !== "weapon") return slot;
  if (favor && favor.length > 0 && (forceFavor || rng.chance(0.45))) return rng.pick(favor);
  return rng.pick(WEAPON_FAMILIES);
}

export interface RollOptions {
  readonly rarity: Rarity;
  readonly type: ItemType;
  readonly ilvl: number;
  readonly rng: Rng;
  /** Crafting only: weights the roll pool toward this element's damage/resist mod. */
  readonly favorElement?: Element;
}

export function rollItem({ rarity, type, ilvl, rng, favorElement }: RollOptions): Item {
  const names = ITEM_NAMES[rarity][type];
  const baseName = rng.pick(names);
  const tier = rarityIndex(rarity);
  const mult = RARITY_MULTIPLIERS[rarity];
  // Item level adds up to +100% at ilvl 30, so a deep-run common still feels like a find.
  const levelScale = 1 + (ilvl - 1) * 0.033;
  // +/-15% variance so two copies of the same item are never identical.
  const variance = rng.range(0.85, 1.15);

  const base = TYPE_STATS[type];
  const stats = zeroStats();
  for (const k of STAT_KEYS) {
    const budget = base[k];
    if (budget) stats[k] = Math.max(1, Math.round(budget * mult * levelScale * variance));
  }

  const rolls = rollMods(type, rarity, tier, levelScale, rng, favorElement);
  const grant = rollGrant(type, tier, rng);
  const trigger = rollTrigger(tier, rng);

  const value = Math.round(
    RARITY_VALUE[rarity] * levelScale
    * (1 + rolls.length * 0.09)
    * (grant ? 1.35 : 1)
    * (trigger ? 1.5 : 1),
  );

  return {
    id: makeId(),
    name: decorate(baseName, rolls.map((r) => r.roll)),
    rarity,
    type,
    slot: slotForType(type),
    family: isWeaponType(type) ? type : null,
    ilvl,
    stats,
    mods: rolls.map((r) => r.mod),
    grant,
    trigger,
    value,
  };
}

/**
 * Picks the affixes. Rarity decides how many and gates which are reachable at all,
 * which is the whole reason to keep opening chests once your slots are full: an extra
 * projectile does not exist below epic, and an extra ultimate bounce does not exist
 * below mythic.
 */
function rollMods(
  type: ItemType, rarity: Rarity, tier: number, levelScale: number, rng: Rng, favorElement?: Element,
): { mod: ItemMod; roll: ModRoll }[] {
  const [lo, hi] = MOD_COUNTS[rarity];
  const want = rng.int(lo, hi);
  if (want <= 0) return [];

  let pool = MOD_POOL.filter((m) => modAllowed(m, type, tier));
  if (pool.length === 0) return [];
  if (favorElement) {
    // A craft's entire promise is that the essence you paid for actually shows up, so
    // its damage and resist rolls are weighted rather than forced — that keeps crafted
    // items rolling through the exact same code every dropped item does.
    const favored = pool.filter((m) => m.id === `dmg-${favorElement}` || m.id === `res-${favorElement}`);
    pool = [...pool, ...favored, ...favored, ...favored];
  }
  const out: { mod: ItemMod; roll: ModRoll }[] = [];
  const used = new Set<string>();
  // Only so many attempts: a small pool with a high mod count shouldn't spin forever.
  for (let attempt = 0; attempt < want * 8 && out.length < want; attempt++) {
    const roll = rng.pick(pool);
    if (!roll || used.has(roll.key)) continue;
    used.add(roll.key);
    const raw = modValue(roll, rarity, levelScale, rng.range(0.85, 1.15));
    const value = roll.scale === "flat" ? raw : Math.round(raw * 1000) / 1000;
    out.push({ mod: { id: roll.id, key: roll.key, value }, roll });
  }
  return out;
}

/** Weapons, rings and necklaces can carry a whole extra skill from epic upward. */
function rollGrant(type: ItemType, tier: number, rng: Rng): string | null {
  const eligible = isWeaponType(type) || type === "ring" || type === "necklace";
  if (!eligible) return null;
  if (!rng.chance(grantChance(tier))) return null;
  return rng.pick(GRANTABLE_ABILITY_IDS as readonly string[]);
}

/** From legendary upward an item can do something on its own, without a key press. */
function rollTrigger(tier: number, rng: Rng): TriggerSpec | null {
  if (!rng.chance(triggerChance(tier))) return null;
  const shape = rng.pick(TRIGGER_SHAPES);
  const element: Element = rng.pick(LOOT_ELEMENTS);
  return {
    id: `${shape.kind}-${shape.effect}`,
    kind: shape.kind,
    effect: shape.effect,
    element,
    chance: shape.chance,
    power: Math.round(shape.power * (1 + (tier - 4) * 0.22) * 100) / 100,
    radius: shape.radius,
    count: shape.count,
  };
}

/** At most one prefix word and one suffix phrase, or names become unreadable. */
function decorate(name: string, rolls: readonly ModRoll[]): string {
  const prefix = rolls.find((r) => r.kind === "prefix");
  const suffix = rolls.find((r) => r.kind === "suffix");
  return [prefix?.label, name, suffix?.label].filter(Boolean).join(" ");
}

// --- reading an item ------------------------------------------------------

/**
 * Character level needed to equip. Reuses `ilvl` rather than a separate field: the
 * depth an item dropped at already tracks roughly 1:1 with the level a floor of that
 * depth expects (`recommendedLevel` in `data/depth.ts`), which is what makes a shared
 * stash meaningful once more than one class can pull from it — a level-1 alt can't
 * wear gear a much deeper main brought home until it catches up.
 *
 * The one-level grace below `ilvl` is deliberate, not slack in the lock: a floor's own
 * drops shouldn't be locked to the character who just cleared it. XP for a floor lands
 * as its monsters die, so clearing depth *N* often dings you to level *N* only partway
 * through (or on the very next floor) rather than the instant the last kill lands —
 * without the grace, a character playing one class start-to-finish, never touching an
 * alt or a shared stash, would still routinely find their own newest drops locked for
 * a floor or two. A much-deeper main's gear is still nowhere near a level-1 alt's
 * reach either way.
 */
export function requiredLevel(item: Pick<Item, "ilvl">): number {
  return Math.max(1, item.ilvl - 1);
}

/** Everything the item contributes, base stats and affixes together. */
export function itemMods(item: Item): Partial<Mods> {
  const out: Partial<Mods> = {};
  for (const k of STAT_KEYS) {
    if (item.stats[k]) out[k] = (out[k] ?? 0) + item.stats[k];
  }
  for (const m of item.mods) out[m.key] = (out[m.key] ?? 0) + m.value;
  return out;
}

/**
 * What a point of each modifier is worth, for "is this an upgrade" arrows and for the
 * bulk-sell. It's a heuristic and it is allowed to be: it only ever has to be roughly
 * right, and the player has the full comparison in front of them anyway.
 */
const MOD_SCORE: Record<ModKey, number> = {
  attack: 2.2, defense: 1.8, maxHealth: 0.5, power: 3, haste: 3, maxMana: 1.2,
  critChance: 260, critDamage: 90, attackSpeed: 240, moveSpeed: 120, areaSize: 90,
  projectiles: 300, pierce: 150, ailmentChance: 80, ailmentPotency: 70,
  lifeOnHit: 12, manaOnHit: 8, cooldownRate: 90, ultimateRate: 70, ultimatePower: 80,
  skillDamage: 140, meleeDamage: 150, projectileDamage: 120, elementalDamage: 130,
  wardPower: 50, thorns: 2, ultimateBounces: 200, ultimateProjectiles: 60,
  healthPercent: 200, defensePercent: 150, manaRegen: 20,
  fireDamage: 130, coldDamage: 130, lightningDamage: 130, poisonDamage: 130, voidDamage: 130,
  holyDamage: 130, arcaneDamage: 130, natureDamage: 130,
  fireResist: 1.1, coldResist: 1.1, lightningResist: 1.1, poisonResist: 1.1, voidResist: 1.1,
  holyResist: 1.1, arcaneResist: 1.1, natureResist: 1.1,
};

/**
 * A single number for "is this better than that". Pass the hero's class and a weapon
 * it wasn't built for is marked down, which is what stops the auto-sort handing a
 * Berserker a staff because the staff had more raw attack on it.
 */
export function itemScore(item: Item, heroClass?: HeroClass): number {
  let total = 0;
  const mods = itemMods(item);
  for (const [key, value] of Object.entries(mods) as [ModKey, number][]) {
    total += value * (MOD_SCORE[key] ?? 1);
  }
  if (item.grant) total += 140;
  if (item.trigger) total += item.trigger.power * 160;
  if (heroClass && item.family) {
    total *= heroClass.affinity.includes(item.family) ? 1 + heroClass.affinityBonus : 0.72;
  }
  return total;
}

/**
 * One line of "what does this do", for a list row. An unspoken item can carry seven
 * modifiers and a granted skill; the row shows the shape of it and the comparison panel
 * shows the rest, because a row that lists everything is a row nobody reads.
 */
const LINE_MODS = 3;

export function statLine(item: Item): string {
  const parts = STAT_KEYS.filter((k) => item.stats[k] > 0)
    .map((k) => `+${item.stats[k]} ${STAT_LABELS[k]}`);
  for (const m of item.mods.slice(0, LINE_MODS)) parts.push(modShort(m));
  const hidden = item.mods.length - LINE_MODS;
  if (hidden > 0) parts.push(`+${hidden} more`);
  if (item.grant) parts.push("grants a skill");
  if (item.trigger) parts.push("triggered");
  return parts.join(", ");
}

/**
 * A rolled mod, formatted the way it reads on the item. Whether it's a percentage is a
 * property of the modifier itself, never of how it happens to scale with rarity —
 * resistance rolls grow linearly and are still flat numbers.
 */
export function modShort(m: ItemMod): string {
  return PERCENT_MODS.has(m.key)
    ? `+${Math.round(m.value * 100)}% ${labelFor(m.key)}`
    : `+${Math.round(m.value * 10) / 10} ${labelFor(m.key)}`;
}

function labelFor(key: ModKey): string {
  return MOD_LABELS[key];
}
