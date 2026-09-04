import { clamp } from "../core/math";
import { EQUIP_SLOTS, type EquipSlot } from "../data/items";
import { addStats, zeroStats, type Item, type Stats } from "./item";

/** Base stats at level 1, before gear. */
const BASE: Stats = { attack: 10, defense: 8, maxHealth: 140, power: 0, haste: 0 };
/** Per-level growth, applied additively so gear stays the dominant source of power. */
const GROWTH: Stats = { attack: 2.2, defense: 1.35, maxHealth: 18, power: 0, haste: 0 };
/** Fraction of max health a level-up restores. Not a full heal — that made deaths rare. */
const LEVEL_UP_HEAL = 0.6;

export type Equipment = Record<EquipSlot, Item | null>;

export function emptyEquipment(): Equipment {
  return { weapon: null, armor: null, shield: null, ring: null, gloves: null, necklace: null };
}

export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.35, level - 1));
}

/**
 * The player's persistent character sheet. The in-run avatar (position, velocity,
 * i-frames) lives in `dungeon.ts` — this is only progression and derived stats.
 */
export class Player {
  level = 1;
  xp = 0;
  equipment: Equipment = emptyEquipment();
  /** Current HP persists across floors within a dive; a full heal happens in town. */
  health = BASE.maxHealth;

  get xpNeeded(): number {
    return xpForLevel(this.level);
  }

  /** Base + level growth + everything equipped. Recomputed on demand; it's cheap. */
  get stats(): Stats {
    const s = zeroStats();
    const lv = this.level - 1;
    addStats(s, {
      attack: BASE.attack + GROWTH.attack * lv,
      defense: BASE.defense + GROWTH.defense * lv,
      maxHealth: BASE.maxHealth + GROWTH.maxHealth * lv,
      power: BASE.power,
      haste: BASE.haste,
    });
    for (const slot of EQUIP_SLOTS) {
      const item = this.equipment[slot];
      if (item) addStats(s, item.stats);
    }
    for (const k of Object.keys(s) as (keyof Stats)[]) s[k] = Math.round(s[k]);
    return s;
  }

  get maxHealth(): number {
    return this.stats.maxHealth;
  }

  /** Seconds between attacks. Haste shortens it, with a hard floor so it stays readable. */
  get attackCooldown(): number {
    return clamp(0.42 / (1 + this.stats.haste * 0.004), 0.12, 0.42);
  }

  /** Damage per swing. Power adds a flat scaling bonus on top of attack. */
  get damage(): number {
    const s = this.stats;
    return s.attack * (1 + s.power * 0.006);
  }

  /** Fraction of incoming damage removed by defense — asymptotic, never reaches 100%. */
  get damageReduction(): number {
    const def = this.stats.defense;
    return def / (def + 120);
  }

  /** True if the equipped weapon is a staff, which turns attacks into projectiles. */
  get usesStaff(): boolean {
    return this.equipment.weapon?.type === "staff";
  }

  takeDamage(amount: number): number {
    const dealt = Math.max(1, Math.round(amount * (1 - this.damageReduction)));
    this.health = Math.max(0, this.health - dealt);
    return dealt;
  }

  heal(amount: number): number {
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - before;
  }

  fullHeal(): void {
    this.health = this.maxHealth;
  }

  get isAlive(): boolean {
    return this.health > 0;
  }

  /** Grants XP and returns how many levels were gained, for the "LEVEL UP" banner. */
  gainXp(amount: number): number {
    this.xp += amount;
    let levels = 0;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      levels++;
      // A level-up patches you up mid-fight, but it won't rescue a bad dive.
      this.health = Math.min(this.maxHealth, this.health + this.maxHealth * LEVEL_UP_HEAL);
    }
    return levels;
  }

  /** Equips `item`, returning whatever was displaced so the caller can re-stash it. */
  equip(item: Item): Item | null {
    const prev = this.equipment[item.slot];
    this.equipment[item.slot] = item;
    // Gear can raise max HP; keep current HP in range without free healing.
    this.health = Math.min(this.health, this.maxHealth);
    return prev;
  }

  unequip(slot: EquipSlot): Item | null {
    const item = this.equipment[slot];
    this.equipment[slot] = null;
    this.health = Math.min(this.health, this.maxHealth);
    return item;
  }
}
