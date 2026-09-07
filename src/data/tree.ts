/**
 * Skill trees — four branches per class, five nodes deep, spent one point at a time.
 *
 * This is where a class stops being a starting stat block and becomes a build. The
 * branches are deliberately narrow and opinionated: one of a Berserker's four is
 * nothing but fire, so a fire Berserker is a thing you choose rather than a thing you
 * find. Nothing in here is a flat stat that gear will out-scale by epic — the tree
 * deals almost entirely in percentages and whole extra behaviours, so a point spent at
 * level 6 is still doing work at level 60.
 *
 * A branch is walked in order: node four is unreachable until node three is paid for,
 * and the keystone at the end costs two points. Respeccing is free, because a game
 * about gambling on chests should not also charge you for changing your mind.
 *
 * Pure data plus the pure functions that read it.
 */

import { CLASS_IDS, type ClassId } from "./classes";
import { addMods, zeroMods, type Mods } from "./mods";

export interface TreeNode {
  readonly id: string;
  readonly classId: ClassId;
  readonly name: string;
  readonly blurb: string;
  /** Column index — which of the four branches this belongs to. */
  readonly branch: number;
  readonly branchName: string;
  /** Row index within the branch, 0 at the top. */
  readonly row: number;
  readonly cost: number;
  readonly keystone: boolean;
  readonly mods: Partial<Mods>;
  /** The node directly above this one, or null for the first in a branch. */
  readonly requires: string | null;
}

interface NodeDef {
  readonly name: string;
  readonly mods: Partial<Mods>;
}

interface BranchDef {
  readonly name: string;
  readonly blurb: string;
  /** Four ordinary nodes, then the keystone. */
  readonly nodes: readonly [NodeDef, NodeDef, NodeDef, NodeDef];
  readonly keystone: NodeDef & { readonly blurb: string };
}

const TREE_DEFS: Record<ClassId, readonly BranchDef[]> = {
  lancer: [
    {
      name: "Impaler", blurb: "Everything you do goes through the first body and out the back.",
      nodes: [
        { name: "Long Guard", mods: { meleeDamage: 0.08 } },
        { name: "Quick Hands", mods: { attackSpeed: 0.06 } },
        { name: "Skewer", mods: { pierce: 1 } },
        { name: "Set Point", mods: { meleeDamage: 0.1 } },
      ],
      keystone: {
        name: "Through the Rank", blurb: "Your thrusts run through two more bodies and hit harder for it.",
        mods: { pierce: 2, meleeDamage: 0.15 },
      },
    },
    {
      name: "Stormrider", blurb: "The elemental branch. Whatever your gear is made of, this doubles down on it.",
      nodes: [
        { name: "Charged Tip", mods: { elementalDamage: 0.1 } },
        { name: "Static Cling", mods: { ailmentChance: 0.08 } },
        { name: "Arcing Reach", mods: { elementalDamage: 0.12 } },
        { name: "Focused Bolt", mods: { skillDamage: 0.1 } },
      ],
      keystone: {
        name: "Conduit", blurb: "You stop being a person with a spear and start being a wire.",
        mods: { elementalDamage: 0.25, ailmentPotency: 0.15 },
      },
    },
    {
      name: "Momentum", blurb: "Movement, and the charge at the end of it.",
      nodes: [
        { name: "Light Step", mods: { moveSpeed: 0.06 } },
        { name: "Building Speed", mods: { ultimateRate: 0.1 } },
        { name: "Sure Footing", mods: { moveSpeed: 0.08 } },
        { name: "Terminal Velocity", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "Comet", blurb: "One more wall for the charge to come off, and a great deal more damage when it does.",
        mods: { ultimateBounces: 1, ultimatePower: 0.25 },
      },
    },
    {
      name: "Discipline", blurb: "The part that keeps you alive at the end of a very long stick.",
      nodes: [
        { name: "Braced", mods: { healthPercent: 0.08 } },
        { name: "Drilled", mods: { defensePercent: 0.1 } },
        { name: "Second Wind", mods: { lifeOnHit: 2 } },
        { name: "Hardened", mods: { healthPercent: 0.1 } },
      ],
      keystone: {
        name: "Set Spear", blurb: "Planted. Things that run at you regret it.",
        mods: { defensePercent: 0.18, healthPercent: 0.12, thorns: 6 },
      },
    },
    {
      name: "Vanguard", blurb: "The point of the spear is still a point. Precision the other three branches never touch.",
      nodes: [
        { name: "Keen Point", mods: { critChance: 0.04 } },
        { name: "Following Steel", mods: { projectileDamage: 0.1 } },
        { name: "Killing Blow", mods: { critDamage: 0.12 } },
        { name: "Overextend", mods: { cooldownRate: 0.1 } },
      ],
      keystone: {
        name: "Perfect Thrust", blurb: "Every stab finds exactly what it was aimed at.",
        mods: { critChance: 0.06, critDamage: 0.25 },
      },
    },
  ],

  berserker: [
    {
      name: "Carnage", blurb: "Bigger swings, and something back from every one that lands.",
      nodes: [
        { name: "Heavy Hands", mods: { meleeDamage: 0.1 } },
        { name: "Cruelty", mods: { critDamage: 0.12 } },
        { name: "Cleave", mods: { meleeDamage: 0.1 } },
        { name: "Feed", mods: { lifeOnHit: 3 } },
      ],
      keystone: {
        name: "Bloodbath", blurb: "Every hit is a meal. This is the branch that lets you stand in it.",
        mods: { meleeDamage: 0.2, lifeOnHit: 8 },
      },
    },
    {
      name: "Unbreakable", blurb: "Health, armour, and making contact expensive.",
      nodes: [
        { name: "Thick Hide", mods: { healthPercent: 0.1 } },
        { name: "Scar Tissue", mods: { defensePercent: 0.1 } },
        { name: "Spiked Plate", mods: { thorns: 8 } },
        { name: "Bulk", mods: { healthPercent: 0.08 } },
      ],
      keystone: {
        name: "Iron Hide", blurb: "You are, at this point, mostly a wall.",
        mods: { healthPercent: 0.2, defensePercent: 0.15 },
      },
    },
    {
      name: "Fury", blurb: "Speed, and the whirlwind at the end of it.",
      nodes: [
        { name: "Frenzy", mods: { attackSpeed: 0.08 } },
        { name: "Building Rage", mods: { ultimateRate: 0.12 } },
        { name: "Berserk", mods: { attackSpeed: 0.08 } },
        { name: "Wide Spin", mods: { areaSize: 0.1 } },
      ],
      keystone: {
        name: "Endless Spin", blurb: "The whirlwind throws two more of everything.",
        mods: { ultimateProjectiles: 2, ultimatePower: 0.2 },
      },
    },
    {
      name: "Cinders", blurb: "The fire branch. Take it and every weapon you pick up burns.",
      nodes: [
        { name: "Smoulder", mods: { fireDamage: 0.1 } },
        { name: "Searing", mods: { ailmentPotency: 0.1 } },
        { name: "Kindle", mods: { fireDamage: 0.12 } },
        { name: "Blast Radius", mods: { areaSize: 0.1 } },
      ],
      keystone: {
        name: "Immolate", blurb: "You are on fire. So is everything within reach of the axe.",
        mods: { fireDamage: 0.2, ailmentChance: 0.15 },
      },
    },
    {
      name: "Ravager", blurb: "Doesn't just hit things. Leaves them worse than hit.",
      nodes: [
        { name: "Rending Wounds", mods: { ailmentChance: 0.07 } },
        { name: "Poisoned Steel", mods: { poisonDamage: 0.1 } },
        { name: "Festering Cuts", mods: { ailmentPotency: 0.1 } },
        { name: "Torn Flesh", mods: { poisonDamage: 0.12 } },
      ],
      keystone: {
        name: "Butcher's Mark", blurb: "Nothing you cut open gets to heal from it.",
        mods: { ailmentChance: 0.15, poisonDamage: 0.2 },
      },
    },
  ],

  swordsman: [
    {
      name: "Edge", blurb: "Crit. All of it, in one column.",
      nodes: [
        { name: "Whetstone", mods: { critChance: 0.05 } },
        { name: "Precision", mods: { critDamage: 0.12 } },
        { name: "Weak Point", mods: { critChance: 0.05 } },
        { name: "Follow Through", mods: { critDamage: 0.15 } },
      ],
      keystone: {
        name: "Executioner", blurb: "The number that comes off a crit stops being funny.",
        mods: { critChance: 0.08, critDamage: 0.4 },
      },
    },
    {
      name: "Tempo", blurb: "Swing faster, move faster, wait less.",
      nodes: [
        { name: "Footwork", mods: { attackSpeed: 0.07 } },
        { name: "Sidestep", mods: { moveSpeed: 0.06 } },
        { name: "Riposte Drill", mods: { attackSpeed: 0.07 } },
        { name: "Muscle Memory", mods: { cooldownRate: 0.1 } },
      ],
      keystone: {
        name: "Flow", blurb: "Two blades, no gaps. This is what daggers were waiting for.",
        mods: { attackSpeed: 0.12, moveSpeed: 0.1 },
      },
    },
    {
      name: "Storm of Blades", blurb: "Everything about the ultimate.",
      nodes: [
        { name: "Wide Sweep", mods: { areaSize: 0.1 } },
        { name: "Scattered Steel", mods: { ultimateProjectiles: 2 } },
        { name: "Rising Storm", mods: { ultimateRate: 0.12 } },
        { name: "Heavy Storm", mods: { ultimatePower: 0.1 } },
      ],
      keystone: {
        name: "Thousand Cuts", blurb: "Four more blades leave at the end, and all of them hurt more.",
        mods: { ultimateProjectiles: 4, ultimatePower: 0.2 },
      },
    },
    {
      name: "Guard", blurb: "The unglamorous column that gets you to depth thirty.",
      nodes: [
        { name: "Parry", mods: { defensePercent: 0.1 } },
        { name: "Conditioning", mods: { healthPercent: 0.08 } },
        { name: "Bloodied Blade", mods: { lifeOnHit: 2 } },
        { name: "Steady", mods: { wardPower: 0.1 } },
      ],
      keystone: {
        name: "Riposte", blurb: "Nothing gets a free hit on you any more.",
        mods: { defensePercent: 0.15, healthPercent: 0.08, thorns: 6 },
      },
    },
    {
      name: "Spellsword", blurb: "The blade doesn't have to be the only thing doing the talking.",
      nodes: [
        { name: "Battle Focus", mods: { skillDamage: 0.1 } },
        { name: "Quicker Casting", mods: { cooldownRate: 0.08 } },
        { name: "Charged Edge", mods: { elementalDamage: 0.1 } },
        { name: "Wider Cast", mods: { areaSize: 0.08 } },
      ],
      keystone: {
        name: "Battle Caster", blurb: "A sword and a spell, in the same hand, on the same swing.",
        mods: { skillDamage: 0.2, elementalDamage: 0.15 },
      },
    },
  ],

  magician: [
    {
      name: "Pyre", blurb: "Fire, and the ground it leaves behind.",
      nodes: [
        { name: "Spark", mods: { fireDamage: 0.12 } },
        { name: "Kindling", mods: { skillDamage: 0.1 } },
        { name: "Bonfire", mods: { fireDamage: 0.12 } },
        { name: "Wide Burn", mods: { areaSize: 0.08 } },
      ],
      keystone: {
        name: "Conflagration", blurb: "Burns land more often and take considerably longer to go out.",
        mods: { fireDamage: 0.25, ailmentPotency: 0.15 },
      },
    },
    {
      name: "Rime and Storm", blurb: "The cold and lightning column. Slow them, shock them, delete them.",
      nodes: [
        { name: "Hoarfrost", mods: { coldDamage: 0.12 } },
        { name: "Static", mods: { lightningDamage: 0.12 } },
        { name: "Deep Chill", mods: { ailmentChance: 0.1 } },
        { name: "Arc", mods: { skillDamage: 0.1 } },
      ],
      keystone: {
        name: "Overload", blurb: "Shock and chill on the same target, permanently.",
        mods: { lightningDamage: 0.2, coldDamage: 0.2 },
      },
    },
    {
      name: "Deep Well", blurb: "Mana. The Magician's real health bar.",
      nodes: [
        { name: "Meditation", mods: { manaRegen: 2 } },
        { name: "Economy", mods: { cooldownRate: 0.1 } },
        { name: "Siphon", mods: { manaOnHit: 3 } },
        { name: "Reservoir", mods: { manaRegen: 3 } },
      ],
      keystone: {
        name: "Font", blurb: "You stop counting casts and start counting cooldowns.",
        mods: { manaRegen: 6, skillDamage: 0.15 },
      },
    },
    {
      name: "Ruin", blurb: "Everything about the sky falling in.",
      nodes: [
        { name: "Gravity", mods: { ultimatePower: 0.12 } },
        { name: "Gathering Dark", mods: { ultimateRate: 0.1 } },
        { name: "Wider Sky", mods: { areaSize: 0.1 } },
        { name: "Impact", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "Meteoric", blurb: "The impacts get bigger, and there is nowhere on the floor to stand.",
        mods: { ultimatePower: 0.25, areaSize: 0.15 },
      },
    },
    {
      name: "Warding", blurb: "The branch that keeps a very thin character alive to cast a second spell.",
      nodes: [
        { name: "Warding Sigil", mods: { wardPower: 0.1 } },
        { name: "Thicker Robes", mods: { healthPercent: 0.08 } },
        { name: "Ward Weaving", mods: { wardPower: 0.1 } },
        { name: "Sure Footing", mods: { moveSpeed: 0.06 } },
      ],
      keystone: {
        name: "Arcane Shield", blurb: "The ward that was always meant to be there before the fireball was.",
        mods: { wardPower: 0.2, healthPercent: 0.12 },
      },
    },
  ],

  shaman: [
    {
      name: "Rot", blurb: "Poison, and the patience to let it work.",
      nodes: [
        { name: "Blight", mods: { poisonDamage: 0.12 } },
        { name: "Festering", mods: { ailmentPotency: 0.1 } },
        { name: "Corruption", mods: { poisonDamage: 0.12 } },
        { name: "Spread", mods: { ailmentChance: 0.08 } },
      ],
      keystone: {
        name: "Plague", blurb: "Five stacks on everything in the room, and they don't fall off.",
        mods: { poisonDamage: 0.25, ailmentPotency: 0.2 },
      },
    },
    {
      name: "Ancestral", blurb: "The totems, and the ones your ultimate calls.",
      nodes: [
        { name: "Old Words", mods: { ultimatePower: 0.1 } },
        { name: "Listening", mods: { ultimateRate: 0.12 } },
        { name: "Long Reach", mods: { areaSize: 0.1 } },
        { name: "Louder", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "The Elders", blurb: "One more totem answers, and all of them hit harder.",
        mods: { ultimateProjectiles: 1, ultimatePower: 0.2 },
      },
    },
    {
      name: "Warding", blurb: "Shields, sustain, and not dying to the thing you poisoned.",
      nodes: [
        { name: "Spirit Skin", mods: { healthPercent: 0.1 } },
        { name: "Ward Weaving", mods: { wardPower: 0.1 } },
        { name: "Leeching Sap", mods: { lifeOnHit: 3 } },
        { name: "Old Bones", mods: { defensePercent: 0.1 } },
      ],
      keystone: {
        name: "Spirit Shell", blurb: "The ward gets much bigger and you get much harder to finish.",
        mods: { wardPower: 0.2, healthPercent: 0.12, lifeOnHit: 4 },
      },
    },
    {
      name: "Conduit", blurb: "Every element at once, which is the Shaman's whole trick.",
      nodes: [
        { name: "Channeling", mods: { elementalDamage: 0.1 } },
        { name: "Quiet Mind", mods: { manaRegen: 2 } },
        { name: "Chorus", mods: { skillDamage: 0.1 } },
        { name: "Resonance", mods: { elementalDamage: 0.1 } },
      ],
      keystone: {
        name: "Totemic Fury", blurb: "Whatever your gear is made of, there is now much more of it.",
        mods: { elementalDamage: 0.2, skillDamage: 0.12 },
      },
    },
    {
      name: "Wild Hunt", blurb: "The talisman swings, and there's a body in it too, not just a totem and a spark.",
      nodes: [
        { name: "Quick Steps", mods: { attackSpeed: 0.06 } },
        { name: "Sure Footing", mods: { moveSpeed: 0.06 } },
        { name: "Sharpened Bone", mods: { critChance: 0.05 } },
        { name: "Blood Rite", mods: { lifeOnHit: 2 } },
      ],
      keystone: {
        name: "Feral Spirit", blurb: "The staff and the talisman were always going to end up in melee eventually.",
        mods: { attackSpeed: 0.12, critChance: 0.08 },
      },
    },
  ],

  ranger: [
    {
      name: "Sharpshooter", blurb: "Everything about hitting exactly where it counts.",
      nodes: [
        { name: "Steady Aim", mods: { critChance: 0.05 } },
        { name: "Broadheads", mods: { projectileDamage: 0.1 } },
        { name: "Called Shot", mods: { critChance: 0.05 } },
        { name: "Full Draw", mods: { projectileDamage: 0.12 } },
      ],
      keystone: {
        name: "Kill Shot", blurb: "One arrow, exactly one job.",
        mods: { critChance: 0.08, critDamage: 0.3 },
      },
    },
    {
      name: "Winter's Edge", blurb: "The elemental branch. Cold, and the patience to let it slow everything down.",
      nodes: [
        { name: "Frost Fletching", mods: { coldDamage: 0.12 } },
        { name: "Numbing Shot", mods: { ailmentChance: 0.08 } },
        { name: "Hard Frost", mods: { coldDamage: 0.12 } },
        { name: "Wide Chill", mods: { areaSize: 0.08 } },
      ],
      keystone: {
        name: "Absolute Zero", blurb: "Nothing that gets hit moves at its own speed again.",
        mods: { coldDamage: 0.25, ailmentPotency: 0.15 },
      },
    },
    {
      name: "Storm of Arrows", blurb: "Everything about the ultimate.",
      nodes: [
        { name: "Longer Volley", mods: { ultimatePower: 0.1 } },
        { name: "Quick Nocks", mods: { ultimateRate: 0.12 } },
        { name: "Wider Spread", mods: { areaSize: 0.1 } },
        { name: "Heavier Heads", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "Endless Quiver", blurb: "The sky never actually runs out of arrows.",
        mods: { ultimateProjectiles: 2, ultimatePower: 0.2 },
      },
    },
    {
      name: "Woodcraft", blurb: "The part of the plan that keeps distance distance.",
      nodes: [
        { name: "Light Foot", mods: { moveSpeed: 0.06 } },
        { name: "Steady Nerve", mods: { defensePercent: 0.08 } },
        { name: "Quick Retreat", mods: { moveSpeed: 0.08 } },
        { name: "Camouflage", mods: { healthPercent: 0.08 } },
      ],
      keystone: {
        name: "Vanishing Step", blurb: "Gone before whatever you shot finishes noticing.",
        mods: { moveSpeed: 0.12, defensePercent: 0.12 },
      },
    },
    {
      name: "Marksmanship", blurb: "Speed and penetration, for when distance stops being an option.",
      nodes: [
        { name: "Fast Hands", mods: { attackSpeed: 0.06 } },
        { name: "Armor Piercing", mods: { pierce: 1 } },
        { name: "Quickdraw", mods: { attackSpeed: 0.07 } },
        { name: "Deadly Aim", mods: { critDamage: 0.15 } },
      ],
      keystone: {
        name: "One Shot", blurb: "It goes through the first one and everything behind it too.",
        mods: { pierce: 2, critDamage: 0.3 },
      },
    },
  ],

  juggernaut: [
    {
      name: "Wrecking Ball", blurb: "The hammer, and everything it clears in one swing.",
      nodes: [
        { name: "Heavy Swing", mods: { meleeDamage: 0.1 } },
        { name: "Full Force", mods: { meleeDamage: 0.1 } },
        { name: "Sweeping Blow", mods: { areaSize: 0.08 } },
        { name: "Crushing Blow", mods: { meleeDamage: 0.12 } },
      ],
      keystone: {
        name: "Total Wreckage", blurb: "There is no partial credit for standing near this.",
        mods: { meleeDamage: 0.22, areaSize: 0.12 },
      },
    },
    {
      name: "Bulwark", blurb: "Health, armour, and making contact expensive.",
      nodes: [
        { name: "Thick Plate", mods: { healthPercent: 0.1 } },
        { name: "Iron Will", mods: { defensePercent: 0.1 } },
        { name: "Spiked Armor", mods: { thorns: 8 } },
        { name: "Reinforced", mods: { healthPercent: 0.1 } },
      ],
      keystone: {
        name: "Immovable Object", blurb: "The floor moves before this does.",
        mods: { healthPercent: 0.2, defensePercent: 0.15 },
      },
    },
    {
      name: "Aftershock", blurb: "Everything about the ultimate.",
      nodes: [
        { name: "Deep Cracks", mods: { ultimatePower: 0.12 } },
        { name: "Building Tremor", mods: { ultimateRate: 0.1 } },
        { name: "Wider Fault", mods: { areaSize: 0.1 } },
        { name: "Heavier Fall", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "Cataclysmic Ground", blurb: "One more shockwave, and none of them are gentle.",
        mods: { ultimateProjectiles: 1, ultimatePower: 0.25 },
      },
    },
    {
      name: "Grit", blurb: "What's left over after everything else has already hit you.",
      nodes: [
        { name: "Second Wind", mods: { lifeOnHit: 3 } },
        { name: "Hardy", mods: { healthPercent: 0.08 } },
        { name: "Stubborn", mods: { defensePercent: 0.08 } },
        { name: "Callous", mods: { lifeOnHit: 3 } },
      ],
      keystone: {
        name: "Won't Fall", blurb: "It stopped being a fair fight for the floor a while ago.",
        mods: { lifeOnHit: 8, healthPercent: 0.12 },
      },
    },
    {
      name: "Momentum", blurb: "Slow is relative. This is the branch that argues with it.",
      nodes: [
        { name: "Charging Start", mods: { moveSpeed: 0.05 } },
        { name: "Building Speed", mods: { ultimateRate: 0.08 } },
        { name: "Steady March", mods: { moveSpeed: 0.06 } },
        { name: "Unstoppable", mods: { defensePercent: 0.08 } },
      ],
      keystone: {
        name: "Rolling Thunder", blurb: "Getting out of the way stops being an option somewhere around here.",
        mods: { moveSpeed: 0.1, thorns: 6 },
      },
    },
  ],

  duelist: [
    {
      name: "Fencing", blurb: "Crit. All of it, in one column, same as the Swordsman's — the rapier just gets there faster.",
      nodes: [
        { name: "Precision Footwork", mods: { critChance: 0.05 } },
        { name: "First Blood", mods: { critDamage: 0.12 } },
        { name: "Riposte", mods: { critChance: 0.05 } },
        { name: "Killing Stroke", mods: { critDamage: 0.15 } },
      ],
      keystone: {
        name: "Perfect Form", blurb: "Every stab lands exactly where the last one opened.",
        mods: { critChance: 0.08, critDamage: 0.4 },
      },
    },
    {
      name: "Quicksilver", blurb: "The elemental branch. The blade moves fast enough to carry a charge.",
      nodes: [
        { name: "Charged Blade", mods: { lightningDamage: 0.12 } },
        { name: "Static Reflex", mods: { ailmentChance: 0.08 } },
        { name: "Arc Steel", mods: { lightningDamage: 0.12 } },
        { name: "Live Wire", mods: { skillDamage: 0.1 } },
      ],
      keystone: {
        name: "Overcharged", blurb: "The reflexes were never entirely human to begin with.",
        mods: { lightningDamage: 0.25, ailmentPotency: 0.15 },
      },
    },
    {
      name: "Storm of Steel", blurb: "Everything about the ultimate.",
      nodes: [
        { name: "Faster Footwork", mods: { ultimateRate: 0.12 } },
        { name: "Wider Riposte", mods: { areaSize: 0.1 } },
        { name: "Harder Parry", mods: { ultimatePower: 0.1 } },
        { name: "Rising Tempo", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "Flawless Bout", blurb: "Four more stabs land at the end, and none of them miss.",
        mods: { ultimateProjectiles: 4, ultimatePower: 0.2 },
      },
    },
    {
      name: "Reflexes", blurb: "The unglamorous column that gets a Duelist to depth thirty.",
      nodes: [
        { name: "Light Feet", mods: { moveSpeed: 0.06 } },
        { name: "Parry Timing", mods: { defensePercent: 0.1 } },
        { name: "Sidestep", mods: { moveSpeed: 0.08 } },
        { name: "Counter", mods: { lifeOnHit: 2 } },
      ],
      keystone: {
        name: "Untouchable", blurb: "Nothing gets a free hit on you any more.",
        mods: { defensePercent: 0.15, moveSpeed: 0.1 },
      },
    },
    {
      name: "Bloodletting", blurb: "A crit is a wound, and a wound is worth something.",
      nodes: [
        { name: "Opening Cut", mods: { lifeOnHit: 2 } },
        { name: "Deep Wound", mods: { ailmentPotency: 0.1 } },
        { name: "Twist the Blade", mods: { lifeOnHit: 3 } },
        { name: "Exsanguinate", mods: { ailmentChance: 0.08 } },
      ],
      keystone: {
        name: "First to Last Blood", blurb: "The duel was decided the moment it drew first blood.",
        mods: { lifeOnHit: 6, critDamage: 0.2 },
      },
    },
  ],

  warlock: [
    {
      name: "Ruin", blurb: "Everything the staff casts, made crueler.",
      nodes: [
        { name: "Dark Study", mods: { skillDamage: 0.1 } },
        { name: "Malice", mods: { skillDamage: 0.1 } },
        { name: "Cruel Words", mods: { ailmentPotency: 0.1 } },
        { name: "Withering", mods: { skillDamage: 0.12 } },
      ],
      keystone: {
        name: "Utter Ruin", blurb: "There is nothing measured left about the spell.",
        mods: { skillDamage: 0.25, ailmentPotency: 0.2 },
      },
    },
    {
      name: "Void Pact", blurb: "The elemental branch, and the debt that comes with it.",
      nodes: [
        { name: "Hungry Dark", mods: { voidDamage: 0.12 } },
        { name: "Thin Veil", mods: { ailmentChance: 0.08 } },
        { name: "Deeper Dark", mods: { voidDamage: 0.12 } },
        { name: "Wide Tear", mods: { areaSize: 0.08 } },
      ],
      keystone: {
        name: "Consumption", blurb: "It was never going to stop taking once it started.",
        mods: { voidDamage: 0.25, ailmentPotency: 0.15 },
      },
    },
    {
      name: "Rift Magic", blurb: "Everything about the ultimate.",
      nodes: [
        { name: "Longer Tear", mods: { ultimatePower: 0.12 } },
        { name: "Faster Casting", mods: { ultimateRate: 0.1 } },
        { name: "Bigger Rift", mods: { areaSize: 0.1 } },
        { name: "Heavier Pull", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "The Abyss Answers", blurb: "One more rift opens, and none of them close politely.",
        mods: { ultimateProjectiles: 1, ultimatePower: 0.25 },
      },
    },
    {
      name: "Deep Well", blurb: "Mana. The Warlock's real health bar, same as the Magician's.",
      nodes: [
        { name: "Careful Study", mods: { manaRegen: 2 } },
        { name: "Cheap Words", mods: { cooldownRate: 0.1 } },
        { name: "Siphoned Power", mods: { manaOnHit: 3 } },
        { name: "Bottomless", mods: { manaRegen: 3 } },
      ],
      keystone: {
        name: "Font of Ruin", blurb: "The debt stops mattering when the well never runs dry.",
        mods: { manaRegen: 6, skillDamage: 0.15 },
      },
    },
    {
      name: "Self-Preservation", blurb: "Whatever's left over for the caster who forgot to plan for return fire.",
      nodes: [
        { name: "Warding Sigil", mods: { wardPower: 0.1 } },
        { name: "Thin Skin", mods: { healthPercent: 0.08 } },
        { name: "Ward Weaving", mods: { wardPower: 0.1 } },
        { name: "Distance", mods: { defensePercent: 0.08 } },
      ],
      keystone: {
        name: "Last Word", blurb: "The Warlock generally gets to have it.",
        mods: { wardPower: 0.2, healthPercent: 0.12 },
      },
    },
  ],

  monk: [
    {
      name: "Iron Body", blurb: "The hands, and what they've been conditioned to survive.",
      nodes: [
        { name: "Callused Knuckles", mods: { meleeDamage: 0.1 } },
        { name: "Focused Strike", mods: { critChance: 0.05 } },
        { name: "Heavy Hands", mods: { meleeDamage: 0.1 } },
        { name: "Piercing Blow", mods: { critChance: 0.05 } },
      ],
      keystone: {
        name: "Fists of Fury", blurb: "Every hit lands like it's the only one that matters.",
        mods: { meleeDamage: 0.2, critChance: 0.08 },
      },
    },
    {
      name: "Inner Fire", blurb: "The elemental branch. The chi was always going to be fire.",
      nodes: [
        { name: "Kindled Chi", mods: { fireDamage: 0.12 } },
        { name: "Burning Palm", mods: { ailmentChance: 0.08 } },
        { name: "Stoked Flame", mods: { fireDamage: 0.12 } },
        { name: "Wide Burn", mods: { areaSize: 0.08 } },
      ],
      keystone: {
        name: "Burning Spirit", blurb: "The fire stops being a metaphor at some point.",
        mods: { fireDamage: 0.25, ailmentPotency: 0.15 },
      },
    },
    {
      name: "Flow State", blurb: "Everything about the ultimate.",
      nodes: [
        { name: "Faster Hands", mods: { ultimateRate: 0.12 } },
        { name: "Wider Reach", mods: { areaSize: 0.1 } },
        { name: "Heavier Strikes", mods: { ultimatePower: 0.1 } },
        { name: "Rising Tempo", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "A Thousand and One", blurb: "One more strike lands than the name promised.",
        mods: { ultimateProjectiles: 2, ultimatePower: 0.2 },
      },
    },
    {
      name: "Discipline", blurb: "The breathing, and what it buys you.",
      nodes: [
        { name: "Steady Breath", mods: { healthPercent: 0.08 } },
        { name: "Guard Stance", mods: { defensePercent: 0.1 } },
        { name: "Second Breath", mods: { lifeOnHit: 2 } },
        { name: "Iron Focus", mods: { healthPercent: 0.1 } },
      ],
      keystone: {
        name: "Unbroken", blurb: "The stance never actually breaks.",
        mods: { defensePercent: 0.15, healthPercent: 0.1 },
      },
    },
    {
      name: "Momentum", blurb: "Speed, and the blur at the end of it.",
      nodes: [
        { name: "Light Step", mods: { moveSpeed: 0.06 } },
        { name: "Quick Hands", mods: { attackSpeed: 0.07 } },
        { name: "Sure Footing", mods: { moveSpeed: 0.06 } },
        { name: "Rapid Fists", mods: { attackSpeed: 0.08 } },
      ],
      keystone: {
        name: "Blur", blurb: "At this point the hands are simply faster than the eye.",
        mods: { attackSpeed: 0.15, moveSpeed: 0.1 },
      },
    },
  ],

  necromancer: [
    {
      name: "Decay", blurb: "Doesn't kill things so much as arrange for them to die, same trick as the Shaman's.",
      nodes: [
        { name: "Withering Touch", mods: { ailmentChance: 0.08 } },
        { name: "Rot", mods: { poisonDamage: 0.1 } },
        { name: "Spreading Blight", mods: { ailmentPotency: 0.1 } },
        { name: "Deeper Rot", mods: { poisonDamage: 0.12 } },
      ],
      keystone: {
        name: "Plague Lord", blurb: "Everything in the room is dying at once, just on different clocks.",
        mods: { ailmentChance: 0.15, poisonDamage: 0.2 },
      },
    },
    {
      name: "Grave Magic", blurb: "The elemental branch. Void, and what it takes on the way out.",
      nodes: [
        { name: "Cold Grasp", mods: { voidDamage: 0.12 } },
        { name: "Hungry Dead", mods: { ailmentChance: 0.08 } },
        { name: "Deeper Grave", mods: { voidDamage: 0.12 } },
        { name: "Wide Reach", mods: { areaSize: 0.08 } },
      ],
      keystone: {
        name: "Beyond the Veil", blurb: "The grave stopped being a metaphor a while ago.",
        mods: { voidDamage: 0.25, ailmentPotency: 0.15 },
      },
    },
    {
      name: "Undying Legion", blurb: "Everything about the ultimate.",
      nodes: [
        { name: "More Bones", mods: { ultimateRate: 0.1 } },
        { name: "Louder Command", mods: { ultimatePower: 0.1 } },
        { name: "Wider Grave", mods: { areaSize: 0.1 } },
        { name: "Deeper Grave", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "March of the Dead", blurb: "One more of them answers than the name promised.",
        mods: { ultimateProjectiles: 2, ultimatePower: 0.2 },
      },
    },
    {
      name: "Harvest", blurb: "Every kill pays something back, the way the ultimate meter already does.",
      nodes: [
        { name: "Reap", mods: { lifeOnHit: 2 } },
        { name: "Soul Debt", mods: { manaOnHit: 2 } },
        { name: "Grim Trophies", mods: { lifeOnHit: 3 } },
        { name: "Deathless", mods: { healthPercent: 0.08 } },
      ],
      keystone: {
        name: "Feed the Legion", blurb: "Every kill is a meal for something that isn't you.",
        mods: { lifeOnHit: 6, manaOnHit: 4 },
      },
    },
    {
      name: "Bone Ward", blurb: "The defensive column that keeps a caster in a robe alive.",
      nodes: [
        { name: "Bone Armor", mods: { defensePercent: 0.1 } },
        { name: "Grave Dust", mods: { healthPercent: 0.08 } },
        { name: "Shielding Dead", mods: { wardPower: 0.1 } },
        { name: "Cold Resolve", mods: { defensePercent: 0.08 } },
      ],
      keystone: {
        name: "Undying", blurb: "Something has to die first, and it generally isn't the Necromancer.",
        mods: { wardPower: 0.15, healthPercent: 0.15 },
      },
    },
  ],

  corsair: [
    {
      name: "Swashbuckling", blurb: "Tempo, footwork, and the whip doing the work of a much heavier weapon.",
      nodes: [
        { name: "Quick Wrist", mods: { attackSpeed: 0.07 } },
        { name: "Sea Legs", mods: { moveSpeed: 0.06 } },
        { name: "Cracking Lash", mods: { meleeDamage: 0.1 } },
        { name: "Bold", mods: { attackSpeed: 0.07 } },
      ],
      keystone: {
        name: "Full Sail", blurb: "Never quite where the last swing left it looking.",
        mods: { attackSpeed: 0.12, moveSpeed: 0.1 },
      },
    },
    {
      name: "Thunderlash", blurb: "The elemental branch. The crack of the whip was always half the point.",
      nodes: [
        { name: "Charged Coil", mods: { lightningDamage: 0.12 } },
        { name: "Static Crack", mods: { ailmentChance: 0.08 } },
        { name: "Live Wire", mods: { lightningDamage: 0.12 } },
        { name: "Chain Reaction", mods: { skillDamage: 0.1 } },
      ],
      keystone: {
        name: "Storm's Edge", blurb: "The crack of the whip stops being a sound effect.",
        mods: { lightningDamage: 0.25, ailmentPotency: 0.15 },
      },
    },
    {
      name: "Broadside", blurb: "Everything about the ultimate.",
      nodes: [
        { name: "Longer Reach", mods: { areaSize: 0.1 } },
        { name: "Faster Recovery", mods: { ultimateRate: 0.12 } },
        { name: "Harder Crack", mods: { ultimatePower: 0.1 } },
        { name: "Wider Arc", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "No Quarter", blurb: "Three more cracks land at the end, and nobody was given one.",
        mods: { ultimateProjectiles: 3, ultimatePower: 0.2 },
      },
    },
    {
      name: "Plunder", blurb: "What a working corsair actually walks away with.",
      nodes: [
        { name: "Boarding Party", mods: { lifeOnHit: 2 } },
        { name: "Thick Coat", mods: { defensePercent: 0.08 } },
        { name: "Privateer's Luck", mods: { critChance: 0.04 } },
        { name: "Hardened", mods: { thorns: 4 } },
      ],
      keystone: {
        name: "Captain's Due", blurb: "Everyone else's cut, taken as health.",
        mods: { lifeOnHit: 6, defensePercent: 0.1 },
      },
    },
    {
      name: "Rigging", blurb: "The reach, pushed further than it already goes.",
      nodes: [
        { name: "Longer Coil", mods: { pierce: 1 } },
        { name: "Wide Swing", mods: { areaSize: 0.06 } },
        { name: "Double Crack", mods: { pierce: 1 } },
        { name: "Reaching Lash", mods: { areaSize: 0.08 } },
      ],
      keystone: {
        name: "Whip and Chain", blurb: "The line runs through the whole rank now, not just the front of it.",
        mods: { pierce: 2, meleeDamage: 0.15 },
      },
    },
  ],

  trickster: [
    {
      name: "Backstab", blurb: "Crit. All of it, in one column, and the claws were built for exactly this.",
      nodes: [
        { name: "Weak Points", mods: { critChance: 0.05 } },
        { name: "Twist the Knife", mods: { critDamage: 0.12 } },
        { name: "Opportunist", mods: { critChance: 0.05 } },
        { name: "Vicious Cut", mods: { critDamage: 0.15 } },
      ],
      keystone: {
        name: "Assassinate", blurb: "The number that comes off a crit stops being funny.",
        mods: { critChance: 0.08, critDamage: 0.4 },
      },
    },
    {
      name: "Poisoned Claws", blurb: "The elemental branch. Weak per hit, and there is always another hit.",
      nodes: [
        { name: "Envenomed", mods: { poisonDamage: 0.12 } },
        { name: "Toxic Coating", mods: { ailmentChance: 0.08 } },
        { name: "Deeper Poison", mods: { poisonDamage: 0.12 } },
        { name: "Wide Spread", mods: { areaSize: 0.08 } },
      ],
      keystone: {
        name: "Lethal Dose", blurb: "It doesn't need to land twice any more.",
        mods: { poisonDamage: 0.25, ailmentPotency: 0.15 },
      },
    },
    {
      name: "Vanishing Act", blurb: "Everything about the ultimate.",
      nodes: [
        { name: "Faster Blinks", mods: { ultimateRate: 0.12 } },
        { name: "Longer Rush", mods: { ultimatePower: 0.1 } },
        { name: "More Bounces", mods: { ultimateBounces: 1 } },
        { name: "Sharper Claws", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "Ghost Step", blurb: "One more wall, and it still doesn't slow down for it.",
        mods: { ultimateBounces: 2, ultimatePower: 0.2 },
      },
    },
    {
      name: "Evasion", blurb: "The thinnest health bar in town gets a whole branch about not being hit.",
      nodes: [
        { name: "Light Feet", mods: { moveSpeed: 0.08 } },
        { name: "Quick Reflexes", mods: { defensePercent: 0.08 } },
        { name: "Slippery", mods: { moveSpeed: 0.08 } },
        { name: "Nine Lives", mods: { healthPercent: 0.08 } },
      ],
      keystone: {
        name: "Untouchable", blurb: "Being somewhere else is the whole defensive plan, and it's a good one.",
        mods: { moveSpeed: 0.12, defensePercent: 0.12 },
      },
    },
    {
      name: "Bloodhunt", blurb: "Speed feeding speed, the way a Trickster is meant to work.",
      nodes: [
        { name: "Fast Hands", mods: { attackSpeed: 0.07 } },
        { name: "Blood Scent", mods: { lifeOnHit: 2 } },
        { name: "Frenzy", mods: { attackSpeed: 0.08 } },
        { name: "Feeding Frenzy", mods: { lifeOnHit: 3 } },
      ],
      keystone: {
        name: "Feeding Time", blurb: "Every kill makes the next one faster.",
        mods: { attackSpeed: 0.12, lifeOnHit: 6 },
      },
    },
  ],

  reaper: [
    {
      name: "Harvest", blurb: "The widest arc in the game, made wider still.",
      nodes: [
        { name: "Wide Arc", mods: { areaSize: 0.08 } },
        { name: "Heavy Reap", mods: { meleeDamage: 0.1 } },
        { name: "Sweeping Cut", mods: { meleeDamage: 0.1 } },
        { name: "Reaper's Reach", mods: { areaSize: 0.08 } },
      ],
      keystone: {
        name: "No Survivors", blurb: "Standing anywhere near the swing was the mistake.",
        mods: { meleeDamage: 0.22, areaSize: 0.15 },
      },
    },
    {
      name: "Withering", blurb: "The elemental branch. Whatever the scythe doesn't finish, the poison does.",
      nodes: [
        { name: "Rotten Edge", mods: { poisonDamage: 0.12 } },
        { name: "Creeping Blight", mods: { ailmentChance: 0.08 } },
        { name: "Deep Rot", mods: { poisonDamage: 0.12 } },
        { name: "Wide Decay", mods: { areaSize: 0.08 } },
      ],
      keystone: {
        name: "Pestilence", blurb: "The floor keeps dying after the swing is already over.",
        mods: { poisonDamage: 0.25, ailmentPotency: 0.15 },
      },
    },
    {
      name: "Soul Reap", blurb: "Everything about the ultimate.",
      nodes: [
        { name: "Deeper Cuts", mods: { ultimatePower: 0.12 } },
        { name: "Faster Harvest", mods: { ultimateRate: 0.1 } },
        { name: "Wider Swing", mods: { areaSize: 0.1 } },
        { name: "Heavier Reap", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "Grim Tally", blurb: "One more reap lands than the last one accounted for.",
        mods: { ultimateProjectiles: 1, ultimatePower: 0.25 },
      },
    },
    {
      name: "Undertaker", blurb: "Every kill pays back into the one still swinging.",
      nodes: [
        { name: "Last Rites", mods: { lifeOnHit: 3 } },
        { name: "Grave Skin", mods: { healthPercent: 0.08 } },
        { name: "Feed on Death", mods: { lifeOnHit: 3 } },
        { name: "Cold Comfort", mods: { healthPercent: 0.08 } },
      ],
      keystone: {
        name: "Death Feeds Death", blurb: "The Reaper is the only one who leaves the room heavier.",
        mods: { lifeOnHit: 8, healthPercent: 0.12 },
      },
    },
    {
      name: "Grim Pace", blurb: "A scythe this wide is still slow unless something makes it not.",
      nodes: [
        { name: "Light Step", mods: { moveSpeed: 0.06 } },
        { name: "Quicker Swing", mods: { attackSpeed: 0.06 } },
        { name: "Sure Footing", mods: { moveSpeed: 0.06 } },
        { name: "Faster Reap", mods: { attackSpeed: 0.07 } },
      ],
      keystone: {
        name: "Never Late", blurb: "The reaping was always going to happen on schedule.",
        mods: { attackSpeed: 0.1, moveSpeed: 0.1 },
      },
    },
  ],

  stormcaller: [
    {
      name: "Storm's Call", blurb: "The chakrams and the spellcasting, feeding the same current.",
      nodes: [
        { name: "Charged Rings", mods: { elementalDamage: 0.1 } },
        { name: "Quick Cast", mods: { skillDamage: 0.1 } },
        { name: "Live Current", mods: { elementalDamage: 0.12 } },
        { name: "Static Field", mods: { skillDamage: 0.1 } },
      ],
      keystone: {
        name: "Overcharge", blurb: "The rings and the spells stop being two separate things.",
        mods: { elementalDamage: 0.2, skillDamage: 0.15 },
      },
    },
    {
      name: "Thunderhead", blurb: "The elemental branch, and it isn't subtle about which element.",
      nodes: [
        { name: "Charged Air", mods: { lightningDamage: 0.12 } },
        { name: "Rolling Thunder", mods: { ailmentChance: 0.08 } },
        { name: "Deeper Storm", mods: { lightningDamage: 0.12 } },
        { name: "Wide Front", mods: { areaSize: 0.08 } },
      ],
      keystone: {
        name: "Eye of the Storm", blurb: "Everything around you is weather now.",
        mods: { lightningDamage: 0.25, ailmentPotency: 0.15 },
      },
    },
    {
      name: "Blink and Strike", blurb: "Everything about the ultimate.",
      nodes: [
        { name: "Faster Step", mods: { ultimateRate: 0.12 } },
        { name: "Longer Arc", mods: { ultimatePower: 0.1 } },
        { name: "More Bounces", mods: { ultimateBounces: 1 } },
        { name: "Sharper Rings", mods: { ultimatePower: 0.12 } },
      ],
      keystone: {
        name: "Lightning Never Strikes Once", blurb: "It absolutely does, here, on purpose.",
        mods: { ultimateBounces: 2, ultimatePower: 0.2 },
      },
    },
    {
      name: "Deep Well", blurb: "Mana, same as every other caster's real health bar.",
      nodes: [
        { name: "Steady Current", mods: { manaRegen: 2 } },
        { name: "Cheap Casting", mods: { cooldownRate: 0.1 } },
        { name: "Static Charge", mods: { manaOnHit: 3 } },
        { name: "Reservoir", mods: { manaRegen: 3 } },
      ],
      keystone: {
        name: "Endless Storm", blurb: "The weather doesn't run out of itself.",
        mods: { manaRegen: 6, skillDamage: 0.12 },
      },
    },
    {
      name: "Windward", blurb: "Never where you left it, on purpose.",
      nodes: [
        { name: "Light on the Air", mods: { moveSpeed: 0.07 } },
        { name: "Grounded", mods: { defensePercent: 0.08 } },
        { name: "Quickstep", mods: { moveSpeed: 0.07 } },
        { name: "Storm Shield", mods: { wardPower: 0.1 } },
      ],
      keystone: {
        name: "One With the Storm", blurb: "By the time it's identified where you are, you're already somewhere else.",
        mods: { moveSpeed: 0.1, wardPower: 0.15 },
      },
    },
  ],
};

/** Points a keystone costs. Ordinary nodes cost one. */
export const KEYSTONE_COST = 2;

function buildTree(classId: ClassId): TreeNode[] {
  const out: TreeNode[] = [];
  TREE_DEFS[classId].forEach((branch, b) => {
    const defs: (NodeDef & { blurb?: string; keystone?: boolean })[] = [
      ...branch.nodes,
      { ...branch.keystone, keystone: true },
    ];
    defs.forEach((def, row) => {
      const id = `${classId}.${b}.${row}`;
      out.push({
        id,
        classId,
        name: def.name,
        blurb: def.blurb ?? branch.blurb,
        branch: b,
        branchName: branch.name,
        row,
        cost: def.keystone ? KEYSTONE_COST : 1,
        keystone: def.keystone ?? false,
        mods: def.mods,
        requires: row === 0 ? null : `${classId}.${b}.${row - 1}`,
      });
    });
  });
  return out;
}

const BUILT = {} as Record<ClassId, readonly TreeNode[]>;
for (const id of CLASS_IDS) BUILT[id] = buildTree(id);
export const TREES: Record<ClassId, readonly TreeNode[]> = BUILT;

export const TREE_BRANCH_COUNT = 5;
export const TREE_BRANCH_DEPTH = 5;

export function branchName(classId: ClassId, branch: number): string {
  return TREE_DEFS[classId][branch]?.name ?? "";
}

export function branchBlurb(classId: ClassId, branch: number): string {
  return TREE_DEFS[classId][branch]?.blurb ?? "";
}

export function treeNode(classId: ClassId, branch: number, row: number): TreeNode | null {
  return TREES[classId].find((n) => n.branch === branch && n.row === row) ?? null;
}

export function nodeById(classId: ClassId, id: string): TreeNode | null {
  return TREES[classId].find((n) => n.id === id) ?? null;
}

/** Points already committed to this class's tree. */
export function spentPoints(classId: ClassId, allocated: readonly string[]): number {
  let total = 0;
  for (const id of allocated) total += nodeById(classId, id)?.cost ?? 0;
  return total;
}

/** A node is reachable when the one above it is paid for. */
export function canAllocate(
  allocated: readonly string[],
  node: TreeNode,
  available: number,
): boolean {
  if (allocated.includes(node.id)) return false;
  if (node.cost > available) return false;
  return node.requires === null || allocated.includes(node.requires);
}

/** Everything the allocated nodes add up to. This is what the player actually reads. */
export function treeMods(classId: ClassId, allocated: readonly string[]): Mods {
  const mods = zeroMods();
  for (const id of allocated) {
    const node = nodeById(classId, id);
    if (node) addMods(mods, node.mods);
  }
  return mods;
}

/** Drops anything that isn't a real node of this class, for a save that changed class. */
export function pruneAllocation(classId: ClassId, allocated: readonly string[]): string[] {
  const valid = allocated.filter((id) => nodeById(classId, id) !== null);
  // A node whose prerequisite is missing can't stand on its own.
  return valid.filter((id) => {
    const node = nodeById(classId, id)!;
    return node.requires === null || valid.includes(node.requires);
  });
}
