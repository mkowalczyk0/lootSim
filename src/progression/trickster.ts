/**
 * Trickster — the illusion assassin. Deception builds while there is doubt on the
 * battlefield about where you are: a fresh decoy, a swap, a vanish. It is spent on
 * backstabs and position tricks. The ultimate meter fills as enemies commit to the
 * wrong target. The paths are five ways to make the fight unsure of itself.
 *
 * Question: how badly can I confuse the battlefield?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const TRICKSTER_DECEPTION: ResourceSpec = {
  id: "deception",
  label: "Deception",
  max: 100,
  start: "empty",
  ui: "bar",
  decayPerSec: 6,
  decayDelay: 3,
  generation: [
    { on: "dashStart", amount: 12 },
    { on: "skillUse", amount: 10, requireTags: ["illusion"] },
    { on: "dodge", amount: 8 },
  ],
  thresholds: [{ at: 70, whileAbove: { critDamage: 0.35, moveSpeed: 0.1 } }],
};

/** Hall of Mirrors is earned by misdirection — enemies swinging at a decoy, never by kills. */
export const TRICKSTER_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Mirrors",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "skillUse", amount: 6, requireTags: ["illusion"] },
    { on: "dodge", amount: 6 },
  ],
};

export const TRICKSTER_RESOURCES: readonly ResourceSpec[] = [TRICKSTER_DECEPTION, TRICKSTER_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Misdirected — the enemy is certain it knows where the Trickster is. It does not. */
export const STATUS_MISDIRECTED: StatusSpec = {
  id: "misdirected",
  label: "Misdirected",
  glyph: "?",
  category: "cc",
  tags: ["illusion", "crowdControl"],
  baseDuration: 4,
  maxStacks: 1,
  refreshRule: "refresh",
  weaken: 0.75,
};

export const TRICKSTER_STATUSES: readonly StatusSpec[] = [STATUS_MISDIRECTED];

// --- abilities --------------------------------------------------------

export const TRICKSTER_FALSE_STEP: Ability = {
  id: "trickster.false_step",
  classId: "trickster",
  name: "False Step",
  description: "Dash a short way and leave a still, silent copy of yourself where you were.",
  flavor: "The Trickster left. Something that looks exactly like the Trickster stayed.",
  category: "movement",
  tags: ["dash", "movement", "illusion", "summon"],
  cooldown: 5,
  targeting: "direction",
  range: 140,
  effects: [
    { kind: "move", style: "dash", distance: 140, leaveAnchor: true, iframes: 0.3 },
    { kind: "summon", unit: "trickster_decoy", count: 1, duration: 6, command: { behavior: "guardPoint" } },
  ],
  mutationHooks: [{ id: "false_step.summon", kind: "summon", note: "Many Faces leaves a decoy on every dash." }],
};

export const TRICKSTER_MIRROR_TRAP: Ability = {
  id: "trickster.mirror_trap",
  classId: "trickster",
  name: "Mirror Trap",
  description: "Plant a mirror-image of yourself. The moment anything strikes it, it shatters outward.",
  flavor: "It even flinches convincingly.",
  category: "terrain",
  tags: ["illusion", "trap", "area"],
  cooldown: 9,
  targeting: "point",
  range: 160,
  effects: [
    { kind: "summon", unit: "trickster_mirror", count: 1, duration: 12, command: { behavior: "guardPoint" } },
    { kind: "reactive", event: "damageTaken", window: 12, effects: [
      { kind: "damage", damage: { base: 2.2, scale: "attack", type: "physical", canCrit: true, knockback: 100 }, to: "enemies" },
      { kind: "status", status: "blinded", chance: 0.6, to: "enemies" },
    ] },
  ],
};

export const TRICKSTER_BACKSTAB: Ability = {
  id: "trickster.backstab",
  classId: "trickster",
  name: "Backstab",
  description: "Blink behind a target and bury a blade in the gap between its shoulders.",
  flavor: "The front of a monster is well thought out. The Trickster does not visit the front.",
  category: "attack",
  tags: ["teleport", "melee", "execute", "resourceSpender"],
  costs: [{ resource: "deception", amount: 25 }],
  cooldown: 7,
  targeting: "currentTarget",
  range: 220,
  effects: [
    { kind: "move", style: "teleport", toTarget: true, iframes: 0.2 },
    { kind: "damage", damage: { base: 2.6, scale: "attack", type: "physical", canCrit: true, executeMissingHealth: 0.25 }, to: "target" },
  ],
  mutationHooks: [{ id: "backstab.packet", kind: "damagePacket", note: "Death From Nowhere makes the strike from stealth a guaranteed crit." }],
};

export const TRICKSTER_SLEIGHT_OF_HAND: Ability = {
  id: "trickster.sleight_of_hand",
  classId: "trickster",
  name: "Sleight of Hand",
  description: "Swap places with a target enemy or one of your decoys — instantly, wherever they are.",
  flavor: "You are over there now. The Trickster apologises for nothing.",
  category: "movement",
  tags: ["teleport", "movement", "illusion"],
  cooldown: 8,
  targeting: "currentTarget",
  range: 300,
  effects: [
    { kind: "move", style: "teleport", toTarget: true },
    { kind: "status", status: "misdirected", chance: 1, to: "target" },
  ],
};

export const TRICKSTER_VANISH: Ability = {
  id: "trickster.vanish",
  classId: "trickster",
  name: "Vanish",
  description: "Drop out of sight entirely and move faster while unseen. Attacking ends it.",
  flavor: "Not invisible. Just consistently somewhere you aren't checking.",
  category: "support",
  tags: ["stealth"],
  cooldown: 16,
  targeting: "self",
  effects: [
    { kind: "status", status: "stealth", chance: 1, to: "self" },
    { kind: "resource", resource: "deception", delta: 20, to: "self" },
  ],
};

export const TRICKSTER_PAINTED_TARGET: Ability = {
  id: "trickster.painted_target",
  classId: "trickster",
  name: "Painted Target",
  description: "Paint an illusory priority target over an ally or a decoy. Enemies fixate on it instead.",
  flavor: "Look — a much more interesting person to attack.",
  category: "utility",
  tags: ["illusion", "taunt"],
  cooldown: 14,
  targeting: "point",
  range: 200,
  effects: [
    { kind: "summon", unit: "trickster_lure", count: 1, duration: 8, command: { behavior: "guardPoint" } },
    { kind: "status", status: "misdirected", chance: 1, to: "enemies" },
  ],
};

export const TRICKSTER_KNIFE_RAIN: Ability = {
  id: "trickster.knife_rain",
  classId: "trickster",
  name: "Knife Rain",
  description: "Throw a wide spread of knives while backpedalling — a wall of steel between you and them.",
  flavor: "Every one of them is aimed. Loosely.",
  category: "attack",
  tags: ["ranged", "projectile", "area", "movement"],
  cooldown: 6,
  targeting: "cone",
  range: 200,
  shape: { length: 200, arc: Math.PI * 0.7 },
  effects: [
    { kind: "move", style: "dash", distance: 60, iframes: 0.1 },
    { kind: "projectile", projectile: { damage: { base: 0.5, scale: "attack", type: "physical", canCrit: true }, speed: 480, radius: 6, life: 0.6, count: 7, spread: 0.7, behavior: "line" } },
  ],
};

export const TRICKSTER_DOUBLE_DOWN: Ability = {
  id: "trickster.double_down",
  classId: "trickster",
  name: "Double Down",
  description: "Load everything into your next attack. If it lands, it's devastating. If it misses, it hurts you.",
  flavor: "The Trickster does not gamble. The Trickster arranges the odds and then gambles.",
  category: "support",
  tags: ["support"],
  cooldown: 12,
  targeting: "self",
  effects: [
    { kind: "status", status: "misdirected", chance: 0, to: "self" },
    { kind: "resource", resource: "deception", delta: 15, to: "self" },
  ],
  mutationHooks: [{ id: "double_down.rule", kind: "damagePacket", note: "Gambler path swings the payout and the penalty." }],
};

export const TRICKSTER_CHAOS_STEP: Ability = {
  id: "trickster.chaos_step",
  classId: "trickster",
  name: "Chaos Step",
  description: "Three short teleports in random directions, each leaving a knife where you landed.",
  flavor: "Even the Trickster is only about seventy percent sure where this one ends.",
  category: "movement",
  tags: ["teleport", "movement"],
  cooldown: 10,
  targeting: "self",
  effects: [
    { kind: "random", choices: [
      { weight: 1, effects: [{ kind: "move", style: "teleport", distance: 120 }, { kind: "damage", damage: { base: 0.8, scale: "attack", type: "physical", canCrit: true }, to: "enemies" }] },
      { weight: 1, effects: [{ kind: "move", style: "teleport", distance: 160 }, { kind: "status", status: "misdirected", chance: 1, to: "enemies" }] },
      { weight: 1, effects: [{ kind: "move", style: "teleport", distance: 90 }, { kind: "summon", unit: "trickster_decoy", count: 1, duration: 5, command: { behavior: "guardPoint" } }] },
    ] },
  ],
};

export const TRICKSTER_HALL_OF_MIRRORS: Ability = {
  id: "trickster.hall_of_mirrors",
  classId: "trickster",
  name: "Hall of Mirrors",
  description: "Six copies of you split off and fight independently. Enemies cannot tell which is real, and neither, briefly, can you.",
  flavor: "One of them is the Trickster. Statistically, most of them are not.",
  category: "ultimate",
  tags: ["ultimate", "illusion", "summon"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  effects: [
    { kind: "fx", fx: "trickster.split" },
    { kind: "summon", unit: "trickster_mirror_self", count: 6, duration: 10, command: { behavior: "aggroNearest", inheritPower: 0.7 } },
    { kind: "status", status: "stealth", chance: 1, to: "self" },
    { kind: "status", status: "misdirected", chance: 1, to: "enemies" },
  ],
  mutationHooks: [{ id: "hall_of_mirrors.summon", kind: "summon", note: "Reality Killer lets Backstab fire from any of the copies." }],
};

export const TRICKSTER_ABILITIES: readonly Ability[] = [
  TRICKSTER_FALSE_STEP,
  TRICKSTER_MIRROR_TRAP,
  TRICKSTER_BACKSTAB,
  TRICKSTER_SLEIGHT_OF_HAND,
  TRICKSTER_VANISH,
  TRICKSTER_PAINTED_TARGET,
  TRICKSTER_KNIFE_RAIN,
  TRICKSTER_DOUBLE_DOWN,
  TRICKSTER_CHAOS_STEP,
  TRICKSTER_HALL_OF_MIRRORS,
];

// --- the tree --------------------------------------------------------

export const TRICKSTER_PROGRESSION: ClassProgression = {
  classId: "trickster",
  paths: [
    // 0 — Illusionist: decoys everywhere.
    {
      name: "Illusionist",
      blurb: "The battlefield should contain several of you at all times.",
      nodes: [
        { name: "Stage Presence", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.05 } }, { kind: "grantEffect", on: { tag: "illusion" }, effects: [{ kind: "resource", resource: "deception", delta: 6, to: "self" }] }] },
        { name: "Convincing", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "il.convincing", label: "decoys last longer and taunt", target: { withTag: "illusion" }, ops: [{ kind: "summon", scaleDuration: 1.5 }] } }] },
        { name: "Understudy", category: "resource", effects: [{ kind: "resourceRule", resource: "deception", patch: { max: 130, decayPerSec: 4 } }] },
        { name: "Shrapnel Image", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "il.shrapnel_image", label: "Mirror Trap shatters into knives", target: { abilityId: "trickster.mirror_trap" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "projectile", projectile: { damage: { base: 0.4, scale: "attack", type: "physical" }, speed: 400, radius: 5, life: 0.5, count: 6, spread: 1, behavior: "line" } }] }] } }] },
        { name: "Many Faces", category: "keystone", effects: [{ kind: "rule", rule: "trickster.il.many_faces", note: "Every dash leaves a decoy; up to three stand at once." }] },
      ],
    },
    // 1 — Assassin: the knife in the back.
    {
      name: "Assassin",
      blurb: "The whole act is a setup for one strike.",
      nodes: [
        { name: "Edge", category: "foundation", effects: [{ kind: "mods", mods: { critChance: 0.06, meleeDamage: 0.06 } }] },
        { name: "From Behind", category: "behavior", effects: [{ kind: "rule", rule: "trickster.as.from_behind", note: "Attacking a Misdirected enemy always hits its back." }] },
        { name: "Blood Money", category: "resource", effects: [{ kind: "resourceRule", resource: "deception", patch: { addGeneration: [{ on: "crit", amount: 5 }] } }] },
        { name: "Twist the Knife", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "as.twist_the_knife", label: "Backstab from stealth executes", target: { abilityId: "trickster.backstab" }, ops: [{ kind: "damagePacket", addExecuteMissingHealth: 0.3 }, { kind: "cooldown", scale: 0.8 }] } }] },
        { name: "Death From Nowhere", category: "keystone", effects: [{ kind: "rule", rule: "trickster.as.death_from_nowhere", note: "A strike from stealth or straight after a teleport is a guaranteed crit and refunds Backstab." }] },
      ],
    },
    // 2 — Gambler: risk is a stat.
    {
      name: "Gambler",
      blurb: "Every skill has a bad outcome. Lean into it.",
      nodes: [
        { name: "House Edge", category: "foundation", effects: [{ kind: "mods", mods: { critDamage: 0.25 } }] },
        { name: "Press Your Luck", category: "behavior", effects: [{ kind: "rule", rule: "trickster.ga.press_your_luck", note: "Chaos Step and Double Down roll a stronger outcome the higher your Deception." }] },
        { name: "Winnings", category: "resource", effects: [{ kind: "resourceRule", resource: "deception", patch: { addGeneration: [{ on: "kill", amount: 12 }] } }] },
        { name: "All In", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ga.all_in", label: "Double Down doubles again", target: { abilityId: "trickster.double_down" }, ops: [{ kind: "cooldown", scale: 0.7 }] } }] },
        { name: "Double or Nothing", category: "keystone", effects: [{ kind: "rule", rule: "trickster.ga.double_or_nothing", note: "Landing a Double Down hit refunds every cooldown; missing locks skills for two seconds." }] },
      ],
    },
    // 3 — Phantom: never actually get hit.
    {
      name: "Phantom",
      blurb: "Evasion is not a defensive stat. It is the whole character.",
      nodes: [
        { name: "Slippery", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.1, defensePercent: 0.05 } }] },
        { name: "Afterglow", category: "behavior", effects: [{ kind: "grantEffect", on: { event: "dodge" }, effects: [{ kind: "resource", resource: "deception", delta: 8, to: "self" }] }] },
        { name: "Smoke", category: "resource", effects: [{ kind: "resourceRule", resource: "ultimate", patch: { addGeneration: [{ on: "dodge", amount: 6 }] } }] },
        { name: "Ghostwalk", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ph.ghostwalk", label: "Vanish also cleanses and refunds a dash", target: { abilityId: "trickster.vanish" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "cleanse", category: "cc", to: "self" }] }] } }] },
        { name: "Untouchable", category: "keystone", effects: [{ kind: "rule", rule: "trickster.ph.untouchable", note: "The first hit to reach you every few seconds is dodged automatically and swapped onto a decoy." }] },
      ],
    },
    // 4 — Chaos: nobody stands where they think.
    {
      name: "Chaos",
      blurb: "Position is a suggestion.",
      nodes: [
        { name: "Disorder", category: "foundation", effects: [{ kind: "mods", mods: { areaSize: 0.1 } }] },
        { name: "Swap Everything", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "ch.swap_everything", label: "Sleight of Hand swaps two enemies with each other", target: { abilityId: "trickster.sleight_of_hand" }, ops: [{ kind: "targeting", setMode: "radius", addRange: 60 }, { kind: "addTags", tags: ["area"] }] } }] },
        { name: "Entropy", category: "resource", effects: [{ kind: "resourceRule", resource: "deception", patch: { addGeneration: [{ on: "skillUse", amount: 4, requireTags: ["teleport"] }] } }] },
        { name: "Random Access", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ch.random_access", label: "Chaos Step is four hops and each can be a Backstab", target: { abilityId: "trickster.chaos_step" }, ops: [{ kind: "cooldown", scale: 0.75 }] } }] },
        { name: "Reality Thief", category: "keystone", effects: [{ kind: "rule", rule: "trickster.ch.reality_thief", note: "Every teleport briefly swaps the last enemy that hit you into the spot you left." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `trickster.${id}`,
  classId: "trickster",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `trickster.hybrid.${id}` }],
  ...extra,
});

export const TRICKSTER_UNLOCKS: PathUnlockDef[] = [
  H("false_assassin", "False Assassin", "Your decoys can perform Backstab — striking whatever they were watching when you cast it.", "Illusionist", "Assassin", {
    effects: [{ kind: "rule", rule: "trickster.hybrid.false_assassin" }],
    ui: { badge: "FAS" },
  }),
  H("hall_of_doors", "Hall of Doors", "Each decoy is a teleport anchor — Sleight of Hand and Chaos Step can jump to any of them.", "Illusionist", "Chaos", {
    effects: [{ kind: "rule", rule: "trickster.hybrid.hall_of_doors" }],
    ui: { badge: "DRS" },
  }),
  H("loaded_contract", "Loaded Contract", "A Double Down that lands as a Backstab cannot miss and cannot fail — the gamble is rigged.", "Gambler", "Assassin", {
    mutations: [{ id: "trickster.loaded_contract", label: "Backstab carries the Double Down payout", target: { abilityId: "trickster.backstab" }, ops: [{ kind: "damagePacket", scaleBase: 1.4 }] }],
    ui: { badge: "LCN" },
  }),
  H("impossible_movement", "Impossible Movement", "Dodging triggers a free short teleport in the direction you were already moving.", "Phantom", "Chaos", {
    effects: [
      { kind: "rule", rule: "trickster.hybrid.impossible_movement" },
      { kind: "grantEffect", on: { event: "dodge" }, effects: [{ kind: "move", style: "teleport", distance: 90 }] },
    ],
    ui: { badge: "IMV" },
  }),
  H("ghost_killer", "Ghost Killer", "Backstab from stealth doesn't break stealth — you can chain it until Deception runs out.", "Assassin", "Phantom", {
    effects: [{ kind: "rule", rule: "trickster.hybrid.ghost_killer" }],
    ui: { badge: "GKL" },
  }),
  H("everything_is_a_gamble", "Everything is a Gamble", "Every skill gets a small chance to fire twice for free — and a small chance to swap you with a random enemy.", "Gambler", "Chaos", {
    effects: [{ kind: "rule", rule: "trickster.hybrid.everything_is_a_gamble" }],
    ui: { badge: "GMB" },
  }),
  {
    id: "trickster.reality_killer",
    classId: "trickster",
    tier: "mythic",
    name: "Reality Killer",
    description: "Assassination stops needing the Trickster. While Hall of Mirrors runs, every copy can perform Backstab and Chaos Step, and a kill by any of them resets all six — for a few seconds the fight is being attacked from six directions by things that might all be real.",
    flavor: "Reality Killer: assassination effects can originate from any active illusion.",
    requires: [
      { path: "Illusionist", points: 6 },
      { path: "Assassin", points: 4 },
      { path: "Chaos", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "trickster.mythic.reality_killer" }],
    mutations: [{
      id: "trickster.reality_killer.hall",
      label: "Hall of Mirrors → Reality Killer",
      target: { abilityId: "trickster.hall_of_mirrors" },
      ops: [
        { kind: "summon", addCount: 2, addInheritPower: 0.3, scaleDuration: 1.4 },
        { kind: "addEffect", at: "end", effects: [{ kind: "resource", resource: "deception", delta: 40, to: "self" }] },
      ],
    }],
    ui: { badge: "RKIL" },
  },
];

export const TRICKSTER: PilotClass = {
  classId: "trickster",
  name: "Trickster",
  fantasy: "Illusion assassin using decoys, stealth, position swapping, randomness, and deception.",
  role: "Assassin / evasion / chaos.",
  question: "How badly can I confuse the battlefield?",
  resources: TRICKSTER_RESOURCES,
  statuses: TRICKSTER_STATUSES,
  abilities: TRICKSTER_ABILITIES,
  progression: TRICKSTER_PROGRESSION,
  unlocks: TRICKSTER_UNLOCKS,
};
