import { clamp } from "../core/math";
import type { Element } from "./elements";

export type EnemyKind = "grunt" | "archer" | "brute" | "swarmer" | "caster" | "boss";

export interface EnemyArchetype {
  readonly kind: EnemyKind;
  readonly name: string;
  /** Multipliers against the depth-scaled baseline. */
  readonly health: number;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  readonly xp: number;
  readonly lootWeight: number;
  /** Preferred distance to the player; ranged types hold this line. */
  readonly standoff: number;
  readonly attackRange: number;
  readonly attackCooldown: number;
  readonly ranged: boolean;
  /** Spawn weight; boss is spawned explicitly and never rolled. */
  readonly weight: number;
  /** Depth at which this archetype starts appearing. */
  readonly minDepth: number;
  /** What its hits are made of, before the biome infuses it with something else. */
  readonly element: Element;
  /** Flat resistance to everything. Casters and bosses are harder to burn down. */
  readonly resist: number;
}

export const ARCHETYPES: Record<EnemyKind, EnemyArchetype> = {
  swarmer: {
    kind: "swarmer", name: "Crawler",
    health: 0.45, damage: 0.6, speed: 1.45, radius: 7, xp: 0.6, lootWeight: 0.5,
    standoff: 0, attackRange: 18, attackCooldown: 0.7, ranged: false,
    weight: 1.0, minDepth: 1, element: "poison", resist: 0,
  },
  grunt: {
    kind: "grunt", name: "Marauder",
    health: 1.0, damage: 1.0, speed: 1.0, radius: 9, xp: 1.0, lootWeight: 1.0,
    standoff: 0, attackRange: 22, attackCooldown: 1.0, ranged: false,
    weight: 1.2, minDepth: 1, element: "physical", resist: 0,
  },
  archer: {
    kind: "archer", name: "Skirmisher",
    health: 0.7, damage: 0.85, speed: 0.9, radius: 8, xp: 1.2, lootWeight: 1.2,
    standoff: 150, attackRange: 260, attackCooldown: 1.6, ranged: true,
    weight: 0.7, minDepth: 3, element: "physical", resist: 0,
  },
  brute: {
    kind: "brute", name: "Juggernaut",
    health: 3.2, damage: 1.9, speed: 0.62, radius: 14, xp: 2.4, lootWeight: 2.2,
    standoff: 0, attackRange: 30, attackCooldown: 1.5, ranged: false,
    weight: 0.5, minDepth: 4, element: "fire", resist: 30,
  },
  caster: {
    kind: "caster", name: "Void Adept",
    health: 0.9, damage: 1.3, speed: 0.8, radius: 9, xp: 1.8, lootWeight: 1.8,
    standoff: 190, attackRange: 320, attackCooldown: 2.1, ranged: true,
    weight: 0.45, minDepth: 7, element: "void", resist: 45,
  },
  boss: {
    kind: "boss", name: "Warden",
    health: 14, damage: 2.4, speed: 0.75, radius: 22, xp: 12, lootWeight: 14,
    standoff: 0, attackRange: 46, attackCooldown: 1.2, ranged: false,
    weight: 0, minDepth: 5, element: "physical", resist: 45,
  },
};

/** Boss names cycle by depth so deeper bosses feel like different fights. */
export const BOSS_NAMES = [
  "Warden of the First Seal",
  "The Hollow Choir",
  "Gravebound Colossus",
  "Herald of the Unspoken",
  "That Which Has No Name",
] as const;

export function bossName(depth: number): string {
  return BOSS_NAMES[Math.min(BOSS_NAMES.length - 1, Math.floor(depth / 5) - 1)] ?? BOSS_NAMES[0];
}

/**
 * Odds that a monster is infused with its biome's element instead of its own. Deep
 * floors are almost entirely elemental, which is what makes a chestplate with the right
 * resistance on it worth swapping to before a dive.
 */
export function infusionChance(depth: number): number {
  return clamp(0.1 + depth * 0.025, 0, 0.65);
}
