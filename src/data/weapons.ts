/**
 * Weapon families — what your attack button actually does.
 *
 * The old game had exactly two weapons: "a sword" and "a staff". Everything else was
 * the same swing with a bigger number on it, which is why the whole item system read
 * flat no matter how good the drop was. A weapon now decides the *shape* of your basic
 * attack — how far it reaches, how wide it cuts, how many bodies it goes through, how
 * often you get to do it — and the classes are built around those shapes.
 *
 * Pure data. `damage` and `speed` are multipliers on the character's own numbers, so a
 * weapon never stops scaling with gear; it changes what that scaling looks like.
 */

import type { StatKey } from "./mods";

export const WEAPON_FAMILIES = [
  "sword", "axe", "spear", "daggers", "staff", "talisman",
  "hammer", "bow", "whip", "claws", "chakram", "scythe", "rapier", "fists",
] as const;
export type WeaponFamily = (typeof WEAPON_FAMILIES)[number];

/**
 * How the swing resolves. The dungeon switches on this and nothing else, so adding a
 * family is a data entry plus one case.
 */
export type AttackPattern = "arc" | "cleave" | "thrust" | "dual" | "bolt" | "orb";

export interface WeaponSpec {
  readonly id: WeaponFamily;
  readonly name: string;
  readonly blurb: string;
  readonly pattern: AttackPattern;
  /** Multiplier on your damage, per hit landed. */
  readonly damage: number;
  /** Seconds between swings before haste. This is the real weapon balance dial. */
  readonly cooldown: number;
  /** How far the hitbox extends past your own radius. */
  readonly reach: number;
  /** Total width of the swing, in radians. */
  readonly arc: number;
  readonly knock: number;
  /** Bodies a thrust runs through. Melee only; projectiles use the mod of the same name. */
  readonly pierce: number;
  /** Added flat critical chance. */
  readonly crit: number;
  /** Hits per press. Daggers land two. */
  readonly hits: number;
  /** Per-rarity stat budget, multiplied by the rarity multiplier when it rolls. */
  readonly stats: Partial<Record<StatKey, number>>;
}

export const WEAPONS: Record<WeaponFamily, WeaponSpec> = {
  sword: {
    id: "sword", name: "Sword", pattern: "arc",
    blurb: "A clean arc in front of you. Nothing clever, nothing wasted.",
    damage: 1, cooldown: 0.4, reach: 48, arc: Math.PI * 0.75,
    knock: 120, pierce: 0, crit: 0.04, hits: 1,
    stats: { attack: 8 },
  },
  axe: {
    id: "axe", name: "Great Axe", pattern: "cleave",
    blurb: "Slow, enormous, and it moves whatever it hits. Built for a wall of bodies.",
    damage: 1.62, cooldown: 0.66, reach: 56, arc: Math.PI * 1.15,
    knock: 300, pierce: 0, crit: 0, hits: 1,
    stats: { attack: 10, maxHealth: 3 },
  },
  spear: {
    id: "spear", name: "Spear", pattern: "thrust",
    blurb: "A long, narrow stab that runs through a whole rank. Reach is its own defence.",
    damage: 1.18, cooldown: 0.44, reach: 92, arc: Math.PI * 0.22,
    knock: 90, pierce: 2, crit: 0.06, hits: 1,
    stats: { attack: 8, haste: 0.8 },
  },
  daggers: {
    id: "daggers", name: "Twin Daggers", pattern: "dual",
    blurb: "Two blades, two hits a press, and a crit chance that makes the tree worth climbing.",
    damage: 0.62, cooldown: 0.27, reach: 38, arc: Math.PI * 0.6,
    knock: 55, pierce: 0, crit: 0.13, hits: 2,
    stats: { attack: 5, haste: 2.4 },
  },
  staff: {
    id: "staff", name: "Staff", pattern: "bolt",
    blurb: "Your attack becomes a bolt. Range, and the only weapon that scales on power.",
    damage: 1.16, cooldown: 0.46, reach: 0, arc: 0,
    knock: 40, pierce: 0, crit: 0.02, hits: 1,
    stats: { attack: 7, power: 2, maxMana: 1.4 },
  },
  talisman: {
    id: "talisman", name: "Talisman", pattern: "orb",
    blurb: "Swings a circle around you and spits a spark at something else. Made for ailments.",
    damage: 0.86, cooldown: 0.44, reach: 42, arc: Math.PI * 2,
    knock: 70, pierce: 0, crit: 0.03, hits: 1,
    stats: { attack: 6, power: 1.6, maxMana: 1.1 },
  },
  hammer: {
    id: "hammer", name: "Warhammer", pattern: "cleave",
    blurb: "Heavier than the axe and slower for it. What it hits does not get back up.",
    damage: 2.1, cooldown: 0.82, reach: 60, arc: Math.PI * 1.25,
    knock: 420, pierce: 0, crit: 0, hits: 1,
    stats: { attack: 12, maxHealth: 5, defense: 2 },
  },
  bow: {
    id: "bow", name: "Longbow", pattern: "bolt",
    blurb: "Your attack becomes an arrow. Cheaper reach than a staff, no power scaling.",
    damage: 1.05, cooldown: 0.5, reach: 0, arc: 0,
    knock: 20, pierce: 1, crit: 0.09, hits: 1,
    stats: { attack: 6, haste: 1.5 },
  },
  whip: {
    id: "whip", name: "Whip", pattern: "thrust",
    blurb: "A long, narrow line that runs through everything standing in it. Reach without the weight.",
    damage: 0.72, cooldown: 0.34, reach: 130, arc: Math.PI * 0.08,
    knock: 40, pierce: 4, crit: 0.03, hits: 1,
    stats: { attack: 5, haste: 1.6 },
  },
  claws: {
    id: "claws", name: "Claws", pattern: "dual",
    blurb: "Two fast hits a press. Shorter than daggers, and it doesn't need to be longer.",
    damage: 0.58, cooldown: 0.24, reach: 34, arc: Math.PI * 0.56,
    knock: 50, pierce: 0, crit: 0.11, hits: 2,
    stats: { attack: 5, maxHealth: 4 },
  },
  chakram: {
    id: "chakram", name: "Chakram", pattern: "orb",
    blurb: "A bigger, sharper circle than a talisman swings, and it runs through more than one body.",
    damage: 0.95, cooldown: 0.5, reach: 50, arc: Math.PI * 2,
    knock: 90, pierce: 1, crit: 0.05, hits: 1,
    stats: { attack: 6, power: 1.4, haste: 0.6 },
  },
  scythe: {
    id: "scythe", name: "Scythe", pattern: "cleave",
    blurb: "The widest arc in the game. Slow to swing and it doesn't care how many were standing there.",
    damage: 1.85, cooldown: 0.74, reach: 58, arc: Math.PI * 1.28,
    knock: 200, pierce: 0, crit: 0.02, hits: 1,
    stats: { attack: 9, maxHealth: 6 },
  },
  rapier: {
    id: "rapier", name: "Rapier", pattern: "thrust",
    blurb: "Short, fast, and it finds the gap. The highest crit chance on a weapon, full stop.",
    damage: 0.7, cooldown: 0.26, reach: 60, arc: Math.PI * 0.07,
    knock: 40, pierce: 1, crit: 0.16, hits: 1,
    stats: { attack: 6, haste: 2 },
  },
  fists: {
    id: "fists", name: "War Fists", pattern: "dual",
    blurb: "The fastest hands in town. Little per hit, and there is always another hit coming.",
    damage: 0.42, cooldown: 0.2, reach: 30, arc: Math.PI * 0.5,
    knock: 35, pierce: 0, crit: 0.09, hits: 2,
    stats: { attack: 4, haste: 2.8, maxMana: 1 },
  },
};

/** Range a talisman's spark will hunt for a second target. */
export const TALISMAN_ARC_RANGE = 190;
/** Fraction of the hit that spark carries. */
export const TALISMAN_ARC_DAMAGE = 0.55;

/** Bolt speed for staves, and how long one lives. */
export const BOLT_SPEED = 360;
export const BOLT_LIFE = 1.5;

export function isWeaponFamily(id: string): id is WeaponFamily {
  return (WEAPON_FAMILIES as readonly string[]).includes(id);
}
