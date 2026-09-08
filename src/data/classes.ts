/**
 * Classes — who you are, before any of the loot.
 *
 * Since the class refactor a class is an *interaction system*, authored as a
 * `PilotClass` in `src/progression/<class>.ts`: a resource model, ten abilities, a
 * five-path behaviour tree, six hybrids and a Mythic Archetype. That is where a class's
 * verbs and its build space live.
 *
 * This file is the small half that stayed here: the *numbers* a class starts and grows
 * with, the weapon families it was built for, and the element its ultimate falls back to
 * when your gear carries none. Tuning data, in `src/data/` where tuning data belongs —
 * `Player` folds `CLASS_STATS[classId]` into its `Mods` exactly as before, and the old
 * `skills` / `ultimate` / `charge` fields moved onto the `PilotClass`.
 *
 * `CLASS_IDS` is the canonical 21-class roster, in the order
 * `docs/classes_refactor.md` lists it, and must match `ALL_CLASSES` in
 * `src/progression/index.ts` (asserted by `npm run roster`). `LEGACY_CLASS_IDS` is the
 * original fifteen — every one survives the refactor by name; Oracle and Chronomancer
 * are deliberately gone.
 *
 * Pure data.
 */

import type { Element } from "./elements";
import type { Mods } from "./mods";
import type { WeaponFamily } from "./weapons";

export const CLASS_IDS = [
  "lancer", "berserker", "swordsman", "magician", "shaman",
  "ranger", "juggernaut", "duelist", "warlock", "monk",
  "necromancer", "corsair", "trickster", "reaper", "stormcaller",
  "paladin", "bard", "alchemist", "engineer", "assassin", "warden",
] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** The fifteen classes that predate the refactor. Used only by the dead-code v1 tree. */
export const LEGACY_CLASS_IDS = [
  "lancer", "berserker", "swordsman", "magician", "shaman",
  "ranger", "juggernaut", "duelist", "warlock", "monk",
  "necromancer", "corsair", "trickster", "reaper", "stormcaller",
] as const;
export type LegacyClassId = (typeof LEGACY_CLASS_IDS)[number];

export interface HeroClass {
  readonly id: ClassId;
  readonly name: string;
  readonly title: string;
  readonly blurb: string;
  readonly color: string;
  /** Flat mods at level 1, including the six base stats. */
  readonly base: Partial<Mods>;
  /** Added per level past the first. Stats only — percentages don't grow with level. */
  readonly growth: Partial<Mods>;
  /** Weapons the class was built around. Anything else works; these work better. */
  readonly affinity: readonly WeaponFamily[];
  /** Damage bonus while holding a weapon of an affine family. */
  readonly affinityBonus: number;
  /** Fallback tint when your gear carries no element at all. */
  readonly element: Element;
  /** One line on how it wants to be played, for the class-select screen. */
  readonly playstyle: string;
}

export const CLASSES: Record<ClassId, HeroClass> = {
  lancer: {
    id: "lancer", name: "Lancer", title: "Reach and Momentum", color: "#7dd3fc",
    blurb: "Fights at the end of a very long stick. Everything the Lancer does goes "
      + "through the first thing it hits and keeps going.",
    playstyle: "Poke from outside their range, then charge the whole room.",
    base: {
      attack: 10, defense: 7, maxHealth: 132, maxMana: 60,
      moveSpeed: 0.08, pierce: 1, critChance: 0.02, projectileDamage: 0.08,
    },
    growth: { attack: 2.3, defense: 1.25, maxHealth: 17, maxMana: 4 },
    affinity: ["spear"], affinityBonus: 0.2,
    element: "lightning",
  },
  berserker: {
    id: "berserker", name: "Berserker", title: "Rage as a Resource", color: "#ff2d2d",
    blurb: "The biggest weapon in the game and the health to stand still while it "
      + "swings. Getting hurt is not a mistake; it is the meter filling.",
    playstyle: "Wade in, take the hits, spend the rage on a whirlwind.",
    base: {
      attack: 11, defense: 9, maxHealth: 168, maxMana: 45,
      meleeDamage: 0.1, lifeOnHit: 1, critDamage: 0.15,
    },
    growth: { attack: 2.5, defense: 1.5, maxHealth: 22, maxMana: 3 },
    affinity: ["axe"], affinityBonus: 0.2,
    element: "fire",
  },
  swordsman: {
    id: "swordsman", name: "Swordsman", title: "Edge and Tempo", color: "#fbbf24",
    blurb: "No gimmick, no drawback, the best crit chance in town and a hand for "
      + "anything with a blade on it. Dual daggers count.",
    playstyle: "Stay on top of things, crit constantly, delete a wave with the storm.",
    base: {
      attack: 10, defense: 8, maxHealth: 146, maxMana: 55,
      critChance: 0.05, attackSpeed: 0.05, critDamage: 0.1,
    },
    growth: { attack: 2.2, defense: 1.4, maxHealth: 18, maxMana: 4 },
    affinity: ["sword", "daggers"], affinityBonus: 0.18,
    element: "physical",
  },
  magician: {
    id: "magician", name: "Magician", title: "Mana and Consequence", color: "#c084fc",
    blurb: "Thin, expensive, and capable of ending a floor from the other side of it. "
      + "The staff turns your attack into a bolt; everything else is spent mana.",
    playstyle: "Never be in the melee. Spend mana, and the sky pays you back.",
    base: {
      attack: 7, defense: 6, maxHealth: 116, power: 6, maxMana: 100,
      skillDamage: 0.15, cooldownRate: 0.05, areaSize: 0.05,
    },
    growth: { attack: 1.5, defense: 1.1, maxHealth: 13, power: 1.6, maxMana: 8 },
    affinity: ["staff"], affinityBonus: 0.22,
    element: "fire",
  },
  shaman: {
    id: "shaman", name: "Shaman", title: "Rot, Frost and Patience", color: "#84cc16",
    blurb: "Doesn't kill things so much as arrange for them to die. Ailments land more "
      + "often, hurt more, and the totems keep working after you've walked away.",
    playstyle: "Poison everything, plant totems, let the floor finish the job.",
    base: {
      attack: 8, defense: 7, maxHealth: 134, power: 3, maxMana: 85,
      ailmentChance: 0.12, ailmentPotency: 0.18, lifeOnHit: 1, elementalDamage: 0.08,
    },
    growth: { attack: 1.9, defense: 1.25, maxHealth: 16, power: 0.9, maxMana: 6 },
    affinity: ["talisman", "staff"], affinityBonus: 0.18,
    element: "poison",
  },

  ranger: {
    id: "ranger", name: "Ranger", title: "Distance and Patience", color: "#a5d8ff",
    blurb: "Never lets anything close enough to matter. The bow is the whole plan: put "
      + "something in the way early, and keep it that way.",
    playstyle: "Kite, loose arrows, and let Arrow Storm finish what the retreat started.",
    base: {
      attack: 9, defense: 6, maxHealth: 120, maxMana: 60,
      moveSpeed: 0.1, critChance: 0.06, projectileDamage: 0.12, attackSpeed: 0.04,
    },
    growth: { attack: 2.0, defense: 1.15, maxHealth: 15, maxMana: 4 },
    affinity: ["bow"], affinityBonus: 0.2,
    element: "cold",
  },
  juggernaut: {
    id: "juggernaut", name: "Juggernaut", title: "Immovable", color: "#c2703d",
    blurb: "The Warhammer is heavier than the axe and the Juggernaut is heavier still. "
      + "Nothing about this class is fast; nothing about it needs to be.",
    playstyle: "Stand where the floor is worst, absorb everything, break the ground open.",
    base: {
      attack: 11, defense: 12, maxHealth: 190, maxMana: 40,
      meleeDamage: 0.12, defensePercent: 0.05, thorns: 2, blockChance: 0.14,
    },
    growth: { attack: 2.3, defense: 1.8, maxHealth: 26, maxMana: 3 },
    affinity: ["hammer"], affinityBonus: 0.2,
    element: "physical",
  },
  duelist: {
    id: "duelist", name: "Duelist", title: "Precision and Tempo", color: "#f8fafc",
    blurb: "Fights at conversational distance with a blade that rewards being exactly "
      + "right rather than exactly strong. Every crit is the point being made.",
    playstyle: "Bait the swing, punish the gap, let Riposte Storm answer everything at once.",
    base: {
      attack: 9, defense: 6, maxHealth: 124, maxMana: 55,
      critChance: 0.07, attackSpeed: 0.08, critDamage: 0.12,
      evasion: 0.10, blockChance: 0.06,
    },
    growth: { attack: 2.1, defense: 1.15, maxHealth: 16, maxMana: 4 },
    affinity: ["rapier"], affinityBonus: 0.2,
    element: "lightning",
  },
  warlock: {
    id: "warlock", name: "Warlock", title: "Debt and the Void", color: "#7c3aed",
    blurb: "Spends mana like it's owed somewhere else and gets something worse than fire "
      + "back for it. The rifts keep working long after the cast is over.",
    playstyle: "Drain the pool, plant the rifts, let the room come apart around them.",
    base: {
      attack: 6, defense: 6, maxHealth: 112, power: 7, maxMana: 110,
      skillDamage: 0.18, ailmentPotency: 0.12, cooldownRate: 0.04,
    },
    growth: { attack: 1.4, defense: 1.1, maxHealth: 12, power: 1.7, maxMana: 9 },
    affinity: ["staff"], affinityBonus: 0.22,
    element: "void",
  },
  monk: {
    id: "monk", name: "Monk", title: "Flow and Discipline", color: "#ff9d4d",
    blurb: "Empty hands, and the hands are never actually empty. Every hit taken and "
      + "every hit landed is the same breath, and the breath never stops.",
    playstyle: "Stay in the pocket, trade constantly, let Thousand Strikes empty it out.",
    base: {
      attack: 9, defense: 8, maxHealth: 142, maxMana: 65,
      attackSpeed: 0.1, lifeOnHit: 2, critChance: 0.04,
      evasion: 0.05, blockChance: 0.04,
    },
    growth: { attack: 2.0, defense: 1.35, maxHealth: 17, maxMana: 4 },
    affinity: ["fists"], affinityBonus: 0.2,
    element: "fire",
  },
  necromancer: {
    id: "necromancer", name: "Necromancer", title: "The Kill Is the Point", color: "#9333ea",
    blurb: "Isn't interested in the fight so much as what it leaves behind. Every kill "
      + "is fuel; the legion doesn't care that you're the one still swinging.",
    playstyle: "Weaken everything with ailments, kill constantly, let the legion answer for you.",
    base: {
      attack: 6, defense: 6, maxHealth: 118, power: 5, maxMana: 95,
      ailmentChance: 0.14, elementalDamage: 0.1, manaRegen: 1,
    },
    growth: { attack: 1.5, defense: 1.15, maxHealth: 13, power: 1.4, maxMana: 7 },
    affinity: ["talisman"], affinityBonus: 0.2,
    element: "void",
  },
  corsair: {
    id: "corsair", name: "Corsair", title: "Reach Without the Weight", color: "#fde047",
    blurb: "The whip does what a spear does without any of the commitment — a long, "
      + "narrow line thrown out and yanked back before anything can close the gap.",
    playstyle: "Crack the line from range, keep circling, let Whipcrack Fury clear the deck.",
    base: {
      attack: 10, defense: 7, maxHealth: 138, maxMana: 58,
      attackSpeed: 0.09, moveSpeed: 0.07, lifeOnHit: 1, critChance: 0.06, critDamage: 0.12,
    },
    growth: { attack: 2.2, defense: 1.3, maxHealth: 17, maxMana: 4 },
    affinity: ["whip"], affinityBonus: 0.2,
    element: "lightning",
  },
  trickster: {
    id: "trickster", name: "Trickster", title: "Gone Before It Lands", color: "#a3e635",
    blurb: "The thinnest health bar in town and the fastest claws to make up for it. "
      + "Everything about this class is a bet that it gets there first.",
    playstyle: "Dart in on the crit, dart out before the answer, blink through the rest.",
    base: {
      attack: 9, defense: 5, maxHealth: 108, maxMana: 50,
      critChance: 0.09, critDamage: 0.18, moveSpeed: 0.09, evasion: 0.12,
    },
    growth: { attack: 2.0, defense: 1.0, maxHealth: 13, maxMana: 3 },
    affinity: ["claws"], affinityBonus: 0.2,
    element: "poison",
  },
  reaper: {
    id: "reaper", name: "Reaper", title: "The Widest Swing in the Game", color: "#6b8e23",
    blurb: "The scythe doesn't care how many were standing in the arc, and neither does "
      + "the class built around it. Every kill pays the meter back immediately.",
    playstyle: "Walk into the crowd, cut the widest arc there is, harvest what's left.",
    base: {
      attack: 11, defense: 7, maxHealth: 140, maxMana: 55,
      meleeDamage: 0.14, lifeOnHit: 3, areaSize: 0.06,
    },
    growth: { attack: 2.4, defense: 1.3, maxHealth: 18, maxMana: 4 },
    affinity: ["scythe"], affinityBonus: 0.2,
    element: "poison",
  },
  stormcaller: {
    id: "stormcaller", name: "Stormcaller", title: "Never Where You Left It", color: "#38bdf8",
    blurb: "Twin chakrams and a mouth full of weather. Closes the distance in a flash of "
      + "current, spends the room's air on ailments, and is somewhere else by the time "
      + "anything answers.",
    playstyle: "Blink in on Thunder Step, spread ailments, blink out before the room notices.",
    base: {
      attack: 8, defense: 6, maxHealth: 126, power: 4, maxMana: 90,
      ailmentChance: 0.1, elementalDamage: 0.1, attackSpeed: 0.05,
    },
    growth: { attack: 1.8, defense: 1.2, maxHealth: 15, power: 1.2, maxMana: 6 },
    affinity: ["chakram"], affinityBonus: 0.18,
    element: "lightning",
  },

  // --- new with the class refactor ----------------------------------------

  paladin: {
    id: "paladin", name: "Paladin", title: "Saint of the Last Stand", color: "#fcd34d",
    blurb: "Stands between the party and the hit. Every point of damage kept off someone "
      + "else is Conviction, and Conviction is what makes the shield hold.",
    playstyle: "Bind to whoever's about to die, eat their damage, spend the meter keeping them up.",
    base: {
      attack: 10, defense: 11, maxHealth: 182, maxMana: 55,
      defensePercent: 0.05, lifeOnHit: 1, healthPercent: 0.02, blockChance: 0.08,
    },
    growth: { attack: 2.2, defense: 1.7, maxHealth: 24, maxMana: 4 },
    affinity: ["sword", "hammer"], affinityBonus: 0.2,
    element: "holy",
  },
  bard: {
    id: "bard", name: "Bard", title: "Battlefield Conductor", color: "#f0abfc",
    blurb: "Barely fights. Everyone standing near the Bard fights considerably harder "
      + "than they should, and everything the Bard is pointed at fights worse.",
    playstyle: "Keep the songs up, stack the party's buffs, break the enemy's tempo.",
    base: {
      attack: 7, defense: 6, maxHealth: 122, power: 3, maxMana: 90,
      cooldownRate: 0.05, manaRegen: 1, areaSize: 0.06,
    },
    growth: { attack: 1.5, defense: 1.1, maxHealth: 13, power: 1.0, maxMana: 7 },
    affinity: ["talisman", "chakram"], affinityBonus: 0.18,
    element: "arcane",
  },
  alchemist: {
    id: "alchemist", name: "Alchemist", title: "Improviser", color: "#4ade80",
    blurb: "Turns the floor into a chemistry set. Fire here, frost there, and the "
      + "interesting part is what happens where two of them overlap.",
    playstyle: "Layer the zones, set off the reactions, keep a serum in reserve.",
    base: {
      attack: 7, defense: 6, maxHealth: 118, power: 6, maxMana: 100,
      skillDamage: 0.12, areaSize: 0.08, cooldownRate: 0.03,
    },
    growth: { attack: 1.5, defense: 1.1, maxHealth: 13, power: 1.6, maxMana: 8 },
    affinity: ["staff", "talisman"], affinityBonus: 0.2,
    element: "fire",
  },
  engineer: {
    id: "engineer", name: "Engineer", title: "Combat Builder", color: "#fb923c",
    blurb: "Does very little personally. By the time the fight is a minute old there is "
      + "a turret, a wall and a mine doing it instead, and none of them get tired.",
    playstyle: "Spend the first seconds building, then keep the machines fed and aimed.",
    base: {
      attack: 9, defense: 8, maxHealth: 128, maxMana: 55,
      projectileDamage: 0.1, skillDamage: 0.08, thorns: 1,
    },
    growth: { attack: 2.05, defense: 1.4, maxHealth: 16, maxMana: 4 },
    affinity: ["bow", "hammer"], affinityBonus: 0.2,
    element: "physical",
  },
  assassin: {
    id: "assassin", name: "Assassin", title: "Priority Target Killer", color: "#94a3b8",
    blurb: "Doesn't clear a room. Picks the one thing in it that matters and removes "
      + "that, cleanly, before the room has finished noticing.",
    playstyle: "Mark the contract, open from the shadow, execute, disappear.",
    base: {
      attack: 10, defense: 5, maxHealth: 110, maxMana: 50,
      critChance: 0.1, critDamage: 0.24, moveSpeed: 0.08, evasion: 0.06,
    },
    growth: { attack: 2.3, defense: 1.05, maxHealth: 12, maxMana: 3 },
    affinity: ["daggers", "claws"], affinityBonus: 0.2,
    element: "poison",
  },
  warden: {
    id: "warden", name: "Warden", title: "Guardian of the Wild", color: "#65a30d",
    blurb: "Turns the arena into terrain that fights on your side — walls of thorn, "
      + "roots that hold, a grove that heals — and puts on a bear when the wall isn't enough.",
    playstyle: "Wall off the room, root the crowd, hold the line in bear form.",
    base: {
      attack: 9, defense: 10, maxHealth: 178, power: 2, maxMana: 58,
      defensePercent: 0.04, thorns: 3, elementalDamage: 0.06,
    },
    growth: { attack: 2.0, defense: 1.6, maxHealth: 23, power: 0.6, maxMana: 4 },
    affinity: ["hammer", "staff"], affinityBonus: 0.2,
    element: "nature",
  },
};

/** The class a brand new character starts as, until they pick for themselves. */
export const DEFAULT_CLASS: ClassId = "swordsman";

export function isClassId(id: unknown): id is ClassId {
  return typeof id === "string" && (CLASS_IDS as readonly string[]).includes(id);
}

/** Tree points earned by reaching `level`: one a level, two on every fifth. */
export function treePointsFor(level: number): number {
  return Math.max(0, level - 1) + Math.floor(level / 5);
}
