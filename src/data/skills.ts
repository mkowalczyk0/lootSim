/**
 * Castable skills — the three things on your keys that aren't the attack button.
 *
 * Swinging is free and always available; a skill costs mana, sits on a cooldown, and
 * does something a swing can't: hit a whole room, throw a javelin through a rank,
 * freeze a pack in place, plant a totem, or put a shield up before a boss slams.
 *
 * Which skills you can learn at all is decided by your class — a Berserker will never
 * cast Void Lance, and a Magician will never leap into a crowd. See `classes.ts` for
 * who gets what; a skill itself doesn't know about classes, which keeps this file pure
 * data with no cycles.
 *
 * `damage` is a multiple of the player's spell damage, so skills scale with gear the
 * same way an attack does.
 */

import type { Element } from "./elements";

export const SKILL_IDS = [
  "emberlance", "frostnova", "stormcall", "venomburst", "voidlance", "wardveil",
  "piercethrow", "leapslam", "bloodrage", "bladewave", "stormtotem",
  "arrowvolley", "huntersmark", "glacialspike", "chainbolt", "voidrift",
  "soulharvest", "whirlingblades", "ironskin", "rallycry", "venomfang",
  "quickdraw", "stormlash",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** How the skill resolves. The dungeon switches on this. */
export type SkillShape = "bolt" | "nova" | "cone" | "chain" | "ward" | "slam" | "buff" | "totem";

export interface Skill {
  readonly id: SkillId;
  readonly name: string;
  readonly element: Element;
  readonly shape: SkillShape;
  readonly blurb: string;
  readonly manaCost: number;
  readonly cooldown: number;
  readonly unlockLevel: number;
  /** Multiple of the player's spell damage, per projectile or per target. */
  readonly damage: number;
  /** Chance the hit inflicts the element's ailment. Skills are much better at it. */
  readonly ailment: number;
  /** Nova/cone radius, or projectile reach for chains. */
  readonly radius: number;
  /** Projectiles fired, targets chained to, or totems planted. */
  readonly count: number;
  readonly speed: number;
  /** Bodies a projectile passes through before it dies. */
  readonly pierce: number;
  /** Ward, buff or totem duration, in seconds. */
  readonly duration: number;
  /** Slam only: how far in front of you it lands. */
  readonly offset: number;
  /** Buff only: added attack speed and life per hit while it holds. */
  readonly buffAttackSpeed: number;
  readonly buffLifeOnHit: number;
}

/** Defaults, so a skill entry only states what it actually uses. */
const S = {
  offset: 0, buffAttackSpeed: 0, buffLifeOnHit: 0, pierce: 0, speed: 0,
  count: 0, radius: 0, duration: 0, ailment: 0,
};

export const SKILLS: Record<SkillId, Skill> = {
  emberlance: {
    ...S, id: "emberlance", name: "Ember Lance", element: "fire", shape: "bolt",
    blurb: "A spear of fire that punches through the first thing it meets and sets it alight.",
    manaCost: 11, cooldown: 0.85, unlockLevel: 1,
    damage: 1.7, ailment: 0.75, radius: 6, count: 1, speed: 460, pierce: 1,
  },
  frostnova: {
    ...S, id: "frostnova", name: "Frost Nova", element: "cold", shape: "nova",
    blurb: "Shatters outward from your feet. Everything caught crawls for a few seconds.",
    manaCost: 22, cooldown: 5, unlockLevel: 3,
    damage: 1.5, ailment: 1, radius: 128,
  },
  stormcall: {
    ...S, id: "stormcall", name: "Storm Call", element: "lightning", shape: "chain",
    blurb: "Arcs to the nearest few bodies and leaves them shocked — everything hurts them more.",
    manaCost: 25, cooldown: 4, unlockLevel: 6,
    damage: 1.35, ailment: 1, radius: 330, count: 5,
  },
  venomburst: {
    ...S, id: "venomburst", name: "Venom Burst", element: "poison", shape: "cone",
    blurb: "A spray of bile. Weak per glob, and poison stacks five deep.",
    manaCost: 19, cooldown: 3, unlockLevel: 9,
    damage: 0.62, ailment: 0.9, radius: 5, count: 7, speed: 330,
  },
  voidlance: {
    ...S, id: "voidlance", name: "Void Lance", element: "void", shape: "bolt",
    blurb: "A slow, heavy tear in the air. Passes through a whole rank and drains what it touches.",
    manaCost: 34, cooldown: 6, unlockLevel: 13,
    damage: 3.4, ailment: 1, radius: 11, count: 1, speed: 240, pierce: 6,
  },
  wardveil: {
    ...S, id: "wardveil", name: "Ward Veil", element: "void", shape: "ward",
    blurb: "A shell that eats damage before your health does. The answer to a boss wind-up.",
    manaCost: 30, cooldown: 13, unlockLevel: 17,
    damage: 0, duration: 9,
  },

  // --- martial skills, added with the classes -----------------------------

  piercethrow: {
    ...S, id: "piercethrow", name: "Javelin", element: "physical", shape: "bolt",
    blurb: "A thrown lance that runs through everything in the lane. Cheap, and it never stops being good.",
    manaCost: 9, cooldown: 1.1, unlockLevel: 1,
    damage: 1.55, ailment: 0.2, radius: 7, count: 1, speed: 520, pierce: 5,
  },
  leapslam: {
    ...S, id: "leapslam", name: "Leap Slam", element: "physical", shape: "slam",
    blurb: "Comes down where you were pointing. Knocks the room over and hurts to be near.",
    manaCost: 20, cooldown: 4.5, unlockLevel: 3,
    damage: 2.1, ailment: 0.3, radius: 116, offset: 150,
  },
  bloodrage: {
    ...S, id: "bloodrage", name: "Blood Rage", element: "physical", shape: "buff",
    blurb: "Swing faster and take a bite out of everything you hit. Ends when it ends.",
    manaCost: 24, cooldown: 16, unlockLevel: 8,
    damage: 0, duration: 10, buffAttackSpeed: 0.45, buffLifeOnHit: 6,
  },
  bladewave: {
    ...S, id: "bladewave", name: "Blade Wave", element: "physical", shape: "cone",
    blurb: "A fan of blades. It is not subtle and it does not need to be.",
    manaCost: 17, cooldown: 2.6, unlockLevel: 4,
    damage: 0.95, ailment: 0.25, radius: 6, count: 5, speed: 420, pierce: 1,
  },
  stormtotem: {
    ...S, id: "stormtotem", name: "Storm Totem", element: "lightning", shape: "totem",
    blurb: "Plant it and leave. It shocks whatever wanders past until it burns out.",
    manaCost: 26, cooldown: 9, unlockLevel: 5,
    damage: 0.85, ailment: 0.8, radius: 210, count: 1, duration: 12,
  },

  // --- added with the second wave of classes -------------------------------

  arrowvolley: {
    ...S, id: "arrowvolley", name: "Arrow Volley", element: "physical", shape: "cone",
    blurb: "A cheap spread of shafts. Doesn't need to be aimed well to be worth casting.",
    manaCost: 13, cooldown: 2.2, unlockLevel: 1,
    damage: 0.8, ailment: 0.15, radius: 6, count: 5, speed: 440, pierce: 1,
  },
  huntersmark: {
    ...S, id: "huntersmark", name: "Hunter's Mark", element: "physical", shape: "buff",
    blurb: "Marks the moment and swings faster for it. No target required.",
    manaCost: 20, cooldown: 14, unlockLevel: 8,
    damage: 0, duration: 9, buffAttackSpeed: 0.35, buffLifeOnHit: 2,
  },
  glacialspike: {
    ...S, id: "glacialspike", name: "Glacial Spike", element: "cold", shape: "nova",
    blurb: "A bigger, meaner Frost Nova. Costs more, hits harder, still crawls everything caught.",
    manaCost: 27, cooldown: 6.5, unlockLevel: 6,
    damage: 1.9, ailment: 1, radius: 150,
  },
  chainbolt: {
    ...S, id: "chainbolt", name: "Chain Bolt", element: "lightning", shape: "chain",
    blurb: "Arcs to one more body than Storm Call and hits every one of them harder.",
    manaCost: 28, cooldown: 4.5, unlockLevel: 9,
    damage: 1.5, ailment: 1, radius: 300, count: 6,
  },
  voidrift: {
    ...S, id: "voidrift", name: "Void Rift", element: "void", shape: "totem",
    blurb: "A tear in the air that doesn't move. Everything that wanders near it gets thinner.",
    manaCost: 24, cooldown: 8, unlockLevel: 5,
    damage: 0.75, ailment: 0.85, radius: 190, count: 1, duration: 10,
  },
  soulharvest: {
    ...S, id: "soulharvest", name: "Soul Harvest", element: "void", shape: "nova",
    blurb: "A burst that eats what it touches. Expensive, and it is meant to end the fight.",
    manaCost: 36, cooldown: 7, unlockLevel: 13,
    damage: 2.6, ailment: 1, radius: 140,
  },
  whirlingblades: {
    ...S, id: "whirlingblades", name: "Whirling Blades", element: "physical", shape: "cone",
    blurb: "A spinning fan of steel, wide enough to catch whatever surrounded you.",
    manaCost: 16, cooldown: 2.4, unlockLevel: 4,
    damage: 1, ailment: 0.2, radius: 6, count: 6, speed: 400, pierce: 1,
  },
  ironskin: {
    ...S, id: "ironskin", name: "Iron Skin", element: "physical", shape: "ward",
    blurb: "Cheaper and shorter than a real ward, and it's up again sooner for it.",
    manaCost: 26, cooldown: 11, unlockLevel: 7,
    damage: 0, duration: 7,
  },
  rallycry: {
    ...S, id: "rallycry", name: "Rally Cry", element: "physical", shape: "buff",
    blurb: "Nobody else is listening. It works on you anyway.",
    manaCost: 22, cooldown: 15, unlockLevel: 7,
    damage: 0, duration: 11, buffAttackSpeed: 0.25, buffLifeOnHit: 4,
  },
  venomfang: {
    ...S, id: "venomfang", name: "Venom Fang", element: "poison", shape: "bolt",
    blurb: "One heavy dose, thrown hard. Everything Venom Burst wishes it was per hit.",
    manaCost: 14, cooldown: 1.4, unlockLevel: 3,
    damage: 1.4, ailment: 1, radius: 6, count: 1, speed: 400, pierce: 2,
  },
  quickdraw: {
    ...S, id: "quickdraw", name: "Quickdraw", element: "physical", shape: "bolt",
    blurb: "Out and back before anything registers what happened. Cheap, and always ready.",
    manaCost: 10, cooldown: 0.9, unlockLevel: 1,
    damage: 1.4, ailment: 0.15, radius: 6, count: 1, speed: 560, pierce: 2,
  },
  stormlash: {
    ...S, id: "stormlash", name: "Storm Lash", element: "lightning", shape: "cone",
    blurb: "A crack of current in a fan in front of you. Everything it touches conducts.",
    manaCost: 18, cooldown: 2.8, unlockLevel: 4,
    damage: 1.05, ailment: 0.85, radius: 6, count: 5, speed: 410, pierce: 1,
  },
};

/** How many skills can be equipped at once, before anything your gear grants you. */
export const SKILL_SLOTS = 3;

/** Fraction of a ward's pool that also becomes resistance while it holds. */
export const WARD_RESIST = 60;

/** Seconds between a totem's pulses. */
export const TOTEM_PULSE = 1.1;
/** How many bodies one totem pulse arcs to. */
export const TOTEM_TARGETS = 3;

/** Everything from `pool` that `level` has earned, in the pool's own order. */
export function unlockedSkills(pool: readonly SkillId[], level: number): SkillId[] {
  return pool.filter((id) => SKILLS[id].unlockLevel <= level);
}
