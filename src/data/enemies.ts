import { clamp } from "../core/math";
import type { Element } from "./elements";

export type EnemyKind =
  | "grunt" | "archer" | "brute" | "swarmer" | "caster" | "boss"
  | "charger" | "bomber" | "shieldbearer" | "summoner" | "sniper" | "leech";

/**
 * What a monster does beyond "walk at the player and swing" (UAT §2). The five original
 * kinds are `melee` or `ranged`; the rest each ask a different question of the player —
 * a punish window, a zone to leave, a priority target, a flank.
 */
export type EnemyBehavior =
  | "melee"        // close the distance and swing
  | "ranged"       // hold a standoff and shoot
  | "charger"      // winds up, dashes a straight line, long recovery you punish
  | "bomber"       // rushes into melee and detonates; a pool where it fell
  | "shieldbearer" // shrugs off frontal hits — must be flanked or drawn out
  | "summoner"     // hangs back and feeds the floor more bodies; kill it first
  | "sniper"       // a very long telegraph and a very long reach; forces cover
  | "leech";       // heals wounded allies on a timer; changes what you kill first

export interface EnemyArchetype {
  readonly kind: EnemyKind;
  readonly name: string;
  readonly behavior: EnemyBehavior;
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
    kind: "swarmer", name: "Crawler", behavior: "melee",
    health: 0.45, damage: 0.6, speed: 1.45, radius: 7, xp: 0.6, lootWeight: 0.5,
    standoff: 0, attackRange: 18, attackCooldown: 0.7, ranged: false,
    weight: 1.0, minDepth: 1, element: "poison", resist: 0,
  },
  grunt: {
    kind: "grunt", name: "Marauder", behavior: "melee",
    health: 1.0, damage: 1.0, speed: 1.0, radius: 9, xp: 1.0, lootWeight: 1.0,
    standoff: 0, attackRange: 22, attackCooldown: 1.0, ranged: false,
    weight: 1.2, minDepth: 1, element: "physical", resist: 0,
  },
  archer: {
    kind: "archer", name: "Skirmisher", behavior: "ranged",
    health: 0.7, damage: 0.85, speed: 0.9, radius: 8, xp: 1.2, lootWeight: 1.2,
    standoff: 150, attackRange: 260, attackCooldown: 1.6, ranged: true,
    weight: 0.7, minDepth: 3, element: "physical", resist: 0,
  },
  brute: {
    kind: "brute", name: "Juggernaut", behavior: "melee",
    health: 3.2, damage: 1.9, speed: 0.62, radius: 14, xp: 2.4, lootWeight: 2.2,
    standoff: 0, attackRange: 30, attackCooldown: 1.5, ranged: false,
    weight: 0.5, minDepth: 4, element: "fire", resist: 30,
  },
  caster: {
    kind: "caster", name: "Void Adept", behavior: "ranged",
    health: 0.9, damage: 1.3, speed: 0.8, radius: 9, xp: 1.8, lootWeight: 1.8,
    standoff: 190, attackRange: 320, attackCooldown: 2.1, ranged: true,
    weight: 0.45, minDepth: 7, element: "void", resist: 45,
  },
  charger: {
    kind: "charger", name: "Gorehound", behavior: "charger",
    health: 1.05, damage: 0.9, speed: 1.0, radius: 10, xp: 1.6, lootWeight: 1.3,
    standoff: 0, attackRange: 26, attackCooldown: 1.2, ranged: false,
    weight: 0.4, minDepth: 9, element: "physical", resist: 0,
  },
  bomber: {
    kind: "bomber", name: "Bloatfiend", behavior: "bomber",
    health: 0.65, damage: 1.05, speed: 1.22, radius: 10, xp: 1.7, lootWeight: 1.3,
    standoff: 0, attackRange: 30, attackCooldown: 1.0, ranged: false,
    weight: 0.32, minDepth: 10, element: "poison", resist: 0,
  },
  shieldbearer: {
    kind: "shieldbearer", name: "Aegis Thrall", behavior: "shieldbearer",
    health: 2.0, damage: 1.0, speed: 0.68, radius: 12, xp: 2.2, lootWeight: 2.0,
    standoff: 0, attackRange: 28, attackCooldown: 1.4, ranged: false,
    weight: 0.3, minDepth: 8, element: "physical", resist: 20,
  },
  summoner: {
    kind: "summoner", name: "Grave Piper", behavior: "summoner",
    health: 1.1, damage: 0.8, speed: 0.82, radius: 10, xp: 2.6, lootWeight: 2.4,
    standoff: 230, attackRange: 300, attackCooldown: 2.4, ranged: true,
    weight: 0.24, minDepth: 10, element: "void", resist: 30,
  },
  sniper: {
    kind: "sniper", name: "Deadeye", behavior: "sniper",
    health: 0.6, damage: 1.45, speed: 0.78, radius: 9, xp: 2.2, lootWeight: 2.0,
    standoff: 360, attackRange: 560, attackCooldown: 3.6, ranged: true,
    weight: 0.22, minDepth: 13, element: "lightning", resist: 15,
  },
  leech: {
    kind: "leech", name: "Rot Priest", behavior: "leech",
    health: 1.2, damage: 0.6, speed: 0.8, radius: 10, xp: 2.4, lootWeight: 2.2,
    standoff: 150, attackRange: 240, attackCooldown: 2.2, ranged: true,
    weight: 0.24, minDepth: 10, element: "poison", resist: 25,
  },
  boss: {
    kind: "boss", name: "Warden", behavior: "melee",
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
