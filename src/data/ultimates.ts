/**
 * Ultimates — the one button that is entirely yours.
 *
 * Every class has exactly one, it is nothing like anyone else's, and it is the reason
 * to pick that class. A Lancer's ultimate is a charge across the whole room that runs
 * through everything and comes off the walls; a Berserker's is a spinning wall of
 * weapon that throws sparks; a Magician's is a sky full of holes. They all read from
 * the same charge meter and they all take the element off your gear, which is how a
 * lightning Lancer and a fire Lancer end up looking like different characters.
 *
 * Pure data. `damage` is a multiple of your ordinary hit, so an ultimate never stops
 * scaling; `charge` is measured in kill-equivalents, and how you earn those is a
 * property of the class, not of the ultimate.
 */

export const ULTIMATE_IDS = [
  "cometcharge", "whirlwind", "bladestorm", "cataclysm", "ancestors",
  "arrowstorm", "groundbreaker", "ripostestorm", "abyssalrift", "thousandstrikes",
  "legionofthedead", "whipcrackfury", "blinkrush", "harvestofsouls", "thunderstep",
] as const;
export type UltimateId = (typeof ULTIMATE_IDS)[number];

/**
 * The five mechanisms every ultimate actually runs on, shared the same way a planet
 * boss shares an existing encounter's kit: `dungeon.ts` switches on this, not on the
 * individual id, so a fifteenth ultimate is new numbers and a new name, not a new
 * simulation system.
 *
 * - `charge`  — you become the projectile: cross the room, bounce off walls, hit
 *   everything in the lane (Comet Charge).
 * - `spin`    — grinds everything in reach the whole time and throws bursts outward
 *   on a slower clock (Whirlwind).
 * - `storm`   — a blur of melee sweeps that ends by launching every hit outward at
 *   once (Bladestorm).
 * - `impact`  — a series of telegraphed impacts landing across the arena over time
 *   (Cataclysm).
 * - `totem`   — plants stationary totems that keep hitting on their own after you've
 *   moved on (Call the Ancestors).
 */
export const ULTIMATE_KINDS = ["charge", "spin", "storm", "impact", "totem"] as const;
export type UltimateKind = (typeof ULTIMATE_KINDS)[number];

export interface UltimateSpec {
  readonly id: UltimateId;
  readonly kind: UltimateKind;
  readonly name: string;
  readonly blurb: string;
  readonly color: string;
  /** Kill-equivalents needed to fill the meter. */
  readonly charge: number;
  /** Multiple of your ordinary hit, per hit the ultimate lands. */
  readonly damage: number;
  readonly duration: number;
  /** Area, or hit radius for a charge. Scaled by the area-of-effect mod. */
  readonly radius: number;
  /** Travel speed, for the ones that move you. */
  readonly speed: number;
  /** Walls it comes off before it ends. */
  readonly bounces: number;
  /** Projectiles, meteors or totems, depending on the ultimate. */
  readonly count: number;
  /** Seconds between damage ticks or sub-events. */
  readonly tick: number;
}

export const ULTIMATES: Record<UltimateId, UltimateSpec> = {
  cometcharge: {
    id: "cometcharge", kind: "charge", name: "Comet Charge", color: "#7dd3fc",
    blurb: "You become the spear. Cross the room, run through everything in the lane, "
      + "come off the wall and do it again. Nothing touches you while it lasts.",
    charge: 14, damage: 3.4, duration: 1.25, radius: 34, speed: 760, bounces: 3, count: 0, tick: 0,
  },
  whirlwind: {
    id: "whirlwind", kind: "spin", name: "Whirlwind", color: "#ff7a2f",
    blurb: "Three seconds of spinning weapon. It grinds everything in reach and throws "
      + "off whatever your gear is made of, in every direction, the entire time.",
    charge: 12, damage: 0.62, duration: 3.2, radius: 96, speed: 300, bounces: 0, count: 3, tick: 0.16,
  },
  bladestorm: {
    id: "bladestorm", kind: "storm", name: "Bladestorm", color: "#e8f4ff",
    blurb: "A blur of sweeps in every direction, and then every blade you were holding "
      + "leaves at once. Short, and it deletes a wave.",
    charge: 15, damage: 1.05, duration: 1.7, radius: 78, speed: 540, bounces: 0, count: 12, tick: 0.12,
  },
  cataclysm: {
    id: "cataclysm", kind: "impact", name: "Cataclysm", color: "#ff2d2d",
    blurb: "The ceiling gives out across the whole floor. Fourteen impacts, telegraphed "
      + "just long enough to be sporting, and they leave the ground burning.",
    charge: 18, damage: 2.9, duration: 3, radius: 78, speed: 0, bounces: 0, count: 14, tick: 0.21,
  },
  ancestors: {
    id: "ancestors", kind: "totem", name: "Call the Ancestors", color: "#84cc16",
    blurb: "Three totems, planted where you stand, that hammer everything in the room "
      + "with your element while you keep fighting. Walk away and they keep working.",
    charge: 16, damage: 1.15, duration: 11, radius: 250, speed: 0, bounces: 0, count: 3, tick: 0.9,
  },

  // --- the second wave of classes -------------------------------------------

  arrowstorm: {
    id: "arrowstorm", kind: "impact", name: "Arrow Storm", color: "#a5d8ff",
    blurb: "Eighteen shafts fall across the whole floor, one after another, faster and "
      + "lighter than the sky ever comes down for a Magician.",
    charge: 13, damage: 1.6, duration: 2.6, radius: 50, speed: 0, bounces: 0, count: 18, tick: 0.13,
  },
  groundbreaker: {
    id: "groundbreaker", kind: "spin", name: "Groundbreaker", color: "#c2703d",
    blurb: "The hammer never leaves the ground. Every rotation is a small earthquake, "
      + "and the shockwaves thrown off it are heavier for being fewer.",
    charge: 14, damage: 0.9, duration: 3, radius: 110, speed: 280, bounces: 0, count: 2, tick: 0.22,
  },
  ripostestorm: {
    id: "ripostestorm", kind: "storm", name: "Riposte Storm", color: "#f8fafc",
    blurb: "Tighter and faster than a Bladestorm — every stab lands exactly where the "
      + "last one opened, and the rapier leaves all at once at the end.",
    charge: 14, damage: 1.15, duration: 1.5, radius: 70, speed: 560, bounces: 0, count: 10, tick: 0.1,
  },
  abyssalrift: {
    id: "abyssalrift", kind: "totem", name: "Abyssal Rift", color: "#7c3aed",
    blurb: "Three tears in the air, planted and left. Whatever wanders near one comes "
      + "out lighter, and the rift doesn't care that you've walked away.",
    charge: 17, damage: 1.3, duration: 10, radius: 230, speed: 0, bounces: 0, count: 3, tick: 0.85,
  },
  thousandstrikes: {
    id: "thousandstrikes", kind: "spin", name: "Thousand Strikes", color: "#ff9d4d",
    blurb: "Faster hands than a whirlwind and less weight behind each one — the bursts "
      + "come out on a shorter clock because there are simply more of them.",
    charge: 11, damage: 0.5, duration: 3.6, radius: 84, speed: 340, bounces: 0, count: 4, tick: 0.11,
  },
  legionofthedead: {
    id: "legionofthedead", kind: "totem", name: "Legion of the Dead", color: "#9333ea",
    blurb: "One more totem than an Abyssal Rift answers, and it holds the ground a "
      + "little longer for it. Weaker per hit; there's more of them hitting.",
    charge: 15, damage: 0.9, duration: 12, radius: 240, speed: 0, bounces: 0, count: 4, tick: 0.75,
  },
  whipcrackfury: {
    id: "whipcrackfury", kind: "storm", name: "Whipcrack Fury", color: "#fde047",
    blurb: "The longest reach of any storm in the game, and the longest one running. "
      + "More hits, wider circle, and it still ends by throwing everything outward.",
    charge: 16, damage: 0.95, duration: 2, radius: 90, speed: 520, bounces: 0, count: 14, tick: 0.13,
  },
  blinkrush: {
    id: "blinkrush", kind: "charge", name: "Blink Rush", color: "#a3e635",
    blurb: "Not a charge so much as a series of very fast decisions. Shorter than a "
      + "Comet Charge and it bounces less, but it gets out of the way faster too.",
    charge: 13, damage: 2.6, duration: 1, radius: 30, speed: 820, bounces: 2, count: 0, tick: 0,
  },
  harvestofsouls: {
    id: "harvestofsouls", kind: "impact", name: "Harvest of Souls", color: "#6b8e23",
    blurb: "Fewer, heavier reaps than a Cataclysm — the scythe comes down where "
      + "something was standing and takes rather more than the floor underneath it.",
    charge: 17, damage: 2.5, duration: 2.8, radius: 70, speed: 0, bounces: 0, count: 12, tick: 0.2,
  },
  thunderstep: {
    id: "thunderstep", kind: "charge", name: "Thunder Step", color: "#38bdf8",
    blurb: "The room lights up in front of you before you're in it. Faster and further "
      + "than a Blink Rush, and it comes off one more wall for it.",
    charge: 15, damage: 3, duration: 1.4, radius: 36, speed: 700, bounces: 4, count: 0, tick: 0,
  },
};
