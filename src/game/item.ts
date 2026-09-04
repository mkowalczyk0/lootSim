import { Rng } from "../core/rng";
import type { Rarity } from "../data/rarity";
import { RARITY_MULTIPLIERS, RARITY_VALUE, rarityIndex } from "../data/rarity";
import {
  AFFIXES, ITEM_NAMES, STAT_KEYS, TYPE_STATS,
  type Affix, type ItemType, type StatKey, type EquipSlot, slotForType,
} from "../data/items";

export type Stats = Record<StatKey, number>;

export function zeroStats(): Stats {
  return { attack: 0, defense: 0, maxHealth: 0, power: 0, haste: 0 };
}

export function addStats(into: Stats, from: Partial<Stats>): Stats {
  for (const k of STAT_KEYS) into[k] += from[k] ?? 0;
  return into;
}

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly type: ItemType;
  readonly slot: EquipSlot;
  /** Item level, from the depth it dropped at. Adds a slow linear scale on top of rarity. */
  readonly ilvl: number;
  readonly affix: Affix | null;
  readonly stats: Stats;
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

export interface RollOptions {
  readonly rarity: Rarity;
  readonly type: ItemType;
  readonly ilvl: number;
  readonly rng: Rng;
}

export function rollItem({ rarity, type, ilvl, rng }: RollOptions): Item {
  const names = ITEM_NAMES[rarity][type];
  const name = rng.pick(names);
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

  // Better rarities are more likely to carry an affix; unspoken always does.
  const affixChance = 0.15 + rarityIndex(rarity) * 0.11;
  let affix: Affix | null = null;
  if (rng.chance(affixChance)) {
    affix = rng.pick(AFFIXES);
    const budget = base[affix.stat] ?? Math.max(...Object.values(base).map((v) => v ?? 0)) * 0.4;
    stats[affix.stat] += Math.max(1, Math.round(budget * mult * levelScale * affix.bonus));
  }

  const value = Math.round(RARITY_VALUE[rarity] * levelScale * (affix ? 1.25 : 1));

  return {
    id: makeId(),
    name: affix ? `${affix.label} ${name}` : name,
    rarity, type, slot: slotForType(type), ilvl, affix, stats, value,
  };
}

/** A single number for "is this better than that", used to sort and to flag upgrades. */
export function itemScore(item: Item): number {
  const s = item.stats;
  return s.attack * 2.2 + s.defense * 1.8 + s.maxHealth * 0.5 + s.power * 3 + s.haste * 3;
}

export function statLine(item: Item): string {
  return STAT_KEYS.filter((k) => item.stats[k] > 0)
    .map((k) => `+${item.stats[k]} ${k}`)
    .join(", ");
}
