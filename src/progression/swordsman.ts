/**
 * Swordsman — the adaptable weapon master. Technique is earned by *not repeating
 * yourself*: every skill you cast that differs from the last one banks Technique and
 * charges the ultimate. The paths are five ways to chain: raw versatility, footwork,
 * counters, executions, and a spell-edge.
 *
 * Question: how well can I chain different techniques?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

/** Technique — banked by casting a skill different from the last, spent to empower finishers. */
export const SWORDSMAN_TECHNIQUE: ResourceSpec = {
  id: "technique",
  label: "Technique",
  max: 100,
  start: "empty",
  ui: "pips",
  decayPerSec: 6,
  decayDelay: 4,
  generation: [
    { on: "skillUse", amount: 12 },
    { on: "crit", amount: 4 },
  ],
  thresholds: [{ at: 80, whileAbove: { critDamage: 0.25, attackSpeed: 0.08 } }],
};

/** The blur is earned by variety — distinct techniques in a row, never by standing and swinging. */
export const SWORDSMAN_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Eclipse",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "skillUse", amount: 7 },
    { on: "crit", amount: 3 },
  ],
};

export const SWORDSMAN_RESOURCES: readonly ResourceSpec[] = [SWORDSMAN_TECHNIQUE, SWORDSMAN_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Sword Parry — the Counterblade buff: a sliver of time where nothing lands clean. */
export const STATUS_SWORD_PARRY: StatusSpec = {
  id: "sword_parry",
  label: "Parrying",
  glyph: "y",
  category: "buff",
  baseDuration: 2,
  maxStacks: 1,
  refreshRule: "refresh",
  mods: { defensePercent: 0.4, moveSpeed: 0.1 },
};

export const SWORDSMAN_STATUSES: readonly StatusSpec[] = [STATUS_SWORD_PARRY];

// --- abilities --------------------------------------------------------

export const SWORDSMAN_THREEFOLD_CUT = {
  id: "swordsman.threefold_cut",
  classId: "swordsman",
  name: "Threefold Cut",
  description: "Three rapid strikes; the third lands behind the target after a short step-through.",
  flavor: "One, two — and the third one is somewhere you weren't looking.",
  category: "attack",
  tags: ["melee", "slash", "resourceGenerator"],
  cooldown: 3,
  castTime: 0.1,
  targeting: "currentTarget",
  range: 70,
  effects: [
    { kind: "damage", damage: { base: 0.7, scale: "attack", type: "physical", canCrit: true }, to: "target" },
    { kind: "damage", damage: { base: 0.7, scale: "attack", type: "physical", canCrit: true }, to: "target" },
    { kind: "move", style: "blink", toTarget: true, distance: 40, iframes: 0.15 },
    { kind: "damage", damage: { base: 1.1, scale: "attack", type: "physical", canCrit: true }, to: "target" },
  ],
  mutationHooks: [{ id: "threefold_cut.packet", kind: "damagePacket", note: "Weapon Rhythm scales each hit." }],
} as const satisfies Ability;

export const SWORDSMAN_CROSSGUARD = {
  id: "swordsman.crossguard",
  classId: "swordsman",
  name: "Crossguard",
  description: "A brief guard. A blocked attack while it holds empowers the next offensive skill.",
  flavor: "The block is not the point. The block is the setup.",
  category: "support",
  tags: ["counter", "barrier", "shield"],
  cooldown: 8,
  targeting: "self",
  effects: [
    { kind: "shield", amount: 1.0, scale: "attack", to: "self", duration: 1.6 },
    { kind: "status", status: "sword_parry", to: "self", chance: 1 },
  ],
  mutationHooks: [{ id: "crossguard.window", kind: "trigger", note: "Riposte bolts a counter onto a successful block." }],
} as const satisfies Ability;

export const SWORDSMAN_RISING_EDGE = {
  id: "swordsman.rising_edge",
  classId: "swordsman",
  name: "Rising Edge",
  description: "An upward slash that launches light enemies and interrupts an armored wind-up.",
  flavor: "Everything comes up. Some of it comes back down.",
  category: "attack",
  tags: ["melee", "slash", "interrupt", "crowdControl"],
  cooldown: 6,
  targeting: "cone",
  range: 80,
  shape: { length: 80, arc: Math.PI * 0.5 },
  effects: [
    { kind: "damage", damage: { base: 1.3, scale: "attack", type: "physical", canCrit: true, knockback: 60 }, to: "allTargets" },
    { kind: "status", status: "stunned", chance: 0.5, to: "allTargets" },
    { kind: "interrupt", radius: 80 },
  ],
} as const satisfies Ability;

export const SWORDSMAN_SEVERING_ARC = {
  id: "swordsman.severing_arc",
  classId: "swordsman",
  name: "Severing Arc",
  description: "A wide crescent slash. It bites far deeper into an enemy that is already wounded.",
  flavor: "A whole cut is for a whole enemy. A wounded one needs less.",
  category: "attack",
  tags: ["melee", "slash", "area", "execute"],
  cooldown: 7,
  targeting: "cone",
  range: 110,
  fx: { travel: "lance" },
  shape: { length: 110, arc: Math.PI * 0.9 },
  effects: [
    {
      kind: "damage",
      damage: { base: 1.6, scale: "attack", type: "physical", canCrit: true, executeMissingHealth: 0.25 },
      to: "allTargets",
    },
    { kind: "status", status: "bleed", chance: 0.6, to: "allTargets" },
  ],
  mutationHooks: [{ id: "severing_arc.execute", kind: "damagePacket", note: "Finish deepens the execute rider." }],
} as const satisfies Ability;

export const SWORDSMAN_TWIN_TEMPO = {
  id: "swordsman.twin_tempo",
  classId: "swordsman",
  name: "Twin Tempo",
  description: "A fast strike into a heavy one — the light hit builds Technique, the heavy one spends it.",
  flavor: "Quick, then slow. The enemy plans for one of them.",
  category: "attack",
  tags: ["melee", "slash", "resourceGenerator", "resourceSpender"],
  costs: [{ resource: "technique", amount: 20 }],
  cooldown: 4,
  targeting: "currentTarget",
  range: 70,
  effects: [
    { kind: "damage", damage: { base: 0.6, scale: "attack", type: "physical", canCrit: true }, to: "target" },
    { kind: "resource", resource: "technique", delta: 10, to: "self" },
    { kind: "damage", damage: { base: 1.8, scale: "attack", type: "physical", canCrit: true, knockback: 30 }, to: "target" },
  ],
} as const satisfies Ability;

export const SWORDSMAN_SWORDFLASH = {
  id: "swordsman.swordflash",
  classId: "swordsman",
  name: "Swordflash",
  description: "An instant dash to a target, arriving on the far side with a strike.",
  flavor: "You were in front of them. Now you are behind them. The sword did the rest.",
  category: "movement",
  tags: ["dash", "movement", "slash", "teleport"],
  cooldown: 8,
  targeting: "currentTarget",
  range: 240,
  effects: [
    { kind: "move", style: "dash", toTarget: true, iframes: 0.25 },
    { kind: "damage", damage: { base: 1.5, scale: "attack", type: "physical", canCrit: true }, to: "target" },
  ],
  mutationHooks: [{ id: "swordflash.reset", kind: "trigger", note: "Passing Judgment resets this on an execution." }],
} as const satisfies Ability;

export const SWORDSMAN_IRON_WALTZ = {
  id: "swordsman.iron_waltz",
  classId: "swordsman",
  name: "Iron Waltz",
  description: "A spinning slash that extends its duration every time it connects.",
  flavor: "It stops when it stops finding things to hit.",
  category: "attack",
  tags: ["melee", "slash", "area", "channel"],
  cooldown: 12,
  channel: { duration: 2, ticks: 6 },
  targeting: "radius",
  range: 90,
  shape: { radius: 90 },
  effects: [
    { kind: "damage", damage: { base: 0.5, scale: "attack", type: "physical", canCrit: true, channel: "periodic" }, to: "allTargets" },
  ],
} as const satisfies Ability;

export const SWORDSMAN_KINGS_CHALLENGE = {
  id: "swordsman.kings_challenge",
  classId: "swordsman",
  name: "King's Challenge",
  description: "Name one elite. You deal more to it, and every kill near it patches your wounds.",
  flavor: "A duel is just a fight with better manners.",
  category: "support",
  tags: ["mark", "support"],
  cooldown: 16,
  targeting: "currentTarget",
  range: 200,
  fx: { travel: "beam" },
  effects: [
    { kind: "status", status: "mark", chance: 1, to: "target" },
    { kind: "status", status: "vulnerable", chance: 1, to: "target" },
  ],
  mutationHooks: [{ id: "kings_challenge.mark", kind: "status", note: "King's Challenge duration and riders." }],
} as const satisfies Ability;

export const SWORDSMAN_MASTERSTROKE = {
  id: "swordsman.masterstroke",
  classId: "swordsman",
  name: "Masterstroke",
  description: "A single measured heavy strike. Against a marked or bleeding target it always crits.",
  flavor: "The whole fight was practice for this.",
  category: "attack",
  tags: ["melee", "slash", "heavy", "execute", "resourceSpender"],
  costs: [{ resource: "technique", amount: 40 }],
  cooldown: 10,
  targeting: "currentTarget",
  range: 80,
  effects: [
    { kind: "damage", damage: { base: 2.8, scale: "attack", type: "physical", canCrit: true, executeMissingHealth: 0.15 }, to: "target" },
  ],
  mutationHooks: [
    { id: "masterstroke.packet", kind: "damagePacket", note: "Spellblade Execution detonates elemental effects here." },
    { id: "masterstroke.crit", kind: "trigger", note: "Ruthless makes the auto-crit unconditional." },
  ],
} as const satisfies Ability;

export const SWORDSMAN_SWORD_ECLIPSE = {
  id: "swordsman.sword_eclipse",
  classId: "swordsman",
  name: "Sword Eclipse",
  description: "A blur of strikes across everything in reach, then every blade leaves at once in a ring of cuts.",
  flavor: "For a second there are more swords than there is Swordsman.",
  category: "ultimate",
  tags: ["ultimate", "slash", "area", "melee"],
  cooldown: 0,
  isUltimate: true,
  targeting: "radius",
  range: 160,
  fx: { travel: "lance" },
  shape: { radius: 160 },
  effects: [
    { kind: "damage", damage: { base: 0.6, scale: "attack", type: "physical", canCrit: true }, to: "allTargets" },
    { kind: "damage", damage: { base: 0.6, scale: "attack", type: "physical", canCrit: true }, to: "allTargets" },
    { kind: "damage", damage: { base: 0.6, scale: "attack", type: "physical", canCrit: true }, to: "allTargets" },
    { kind: "delay", seconds: 0.6, effects: [
      { kind: "damage", damage: { base: 3.2, scale: "attack", type: "physical", canCrit: true, knockback: 120 }, to: "allTargets" },
    ] },
  ],
  mutationHooks: [{ id: "sword_eclipse.finish", kind: "followUp", note: "Sword Saint adds the omnidirectional finisher." }],
} as const satisfies Ability;

export const SWORDSMAN_ABILITIES = [
  SWORDSMAN_THREEFOLD_CUT,
  SWORDSMAN_CROSSGUARD,
  SWORDSMAN_RISING_EDGE,
  SWORDSMAN_SEVERING_ARC,
  SWORDSMAN_TWIN_TEMPO,
  SWORDSMAN_SWORDFLASH,
  SWORDSMAN_IRON_WALTZ,
  SWORDSMAN_KINGS_CHALLENGE,
  SWORDSMAN_MASTERSTROKE,
  SWORDSMAN_SWORD_ECLIPSE,
] as const satisfies readonly Ability[];

// --- the tree --------------------------------------------------------

export const SWORDSMAN_PROGRESSION: ClassProgression = {
  classId: "swordsman",
  paths: [
    // 0 — Master of Arms: raw versatility; different techniques feed each other.
    {
      name: "Master of Arms",
      blurb: "The more of your kit you use, the harder all of it hits.",
      nodes: [
        { name: "Versatility", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.06, attackSpeed: 0.05 } }] },
        {
          name: "Sword Discipline",
          category: "behavior",
          effects: [{ kind: "rule", rule: "swordsman.moa.discipline", note: "Casting three distinct skills in a row opens a free empowered strike." }],
        },
        {
          name: "Blade Knowledge",
          category: "resource",
          effects: [{ kind: "resourceRule", resource: "technique", patch: { addGeneration: [{ on: "skillUse", amount: 6 }], max: 130 } }],
        },
        {
          name: "Weapon Rhythm",
          category: "mutation",
          effects: [{ kind: "mutate", mutation: { id: "moa.weapon_rhythm", label: "every slash gains bite", target: { withTag: "slash" }, ops: [{ kind: "damagePacket", scaleBase: 1.1 }] } }],
        },
        {
          name: "Grandmaster",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "swordsman.moa.grandmaster" },
            { kind: "grantEffect", on: { event: "skillUse" }, effects: [{ kind: "resource", resource: "ultimate", delta: 3, to: "self" }], note: "Every varied technique feeds Eclipse harder." },
          ],
        },
      ],
    },
    // 1 — Dancing Blade: never stand still; movement is offense.
    {
      name: "Dancing Blade",
      blurb: "Footwork is the weapon; the sword is only where it lands.",
      nodes: [
        { name: "Footwork", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.08, critChance: 0.04 } }] },
        {
          name: "Passing Cut",
          category: "behavior",
          effects: [{ kind: "grantEffect", on: { tag: "dash" }, effects: [{ kind: "damage", damage: { base: 0.8, scale: "attack", type: "physical", canCrit: true }, to: "enemies" }] }],
        },
        {
          name: "Through and Around",
          category: "resource",
          effects: [{ kind: "resourceRule", resource: "technique", patch: { addGeneration: [{ on: "dashStart", amount: 10 }] } }],
        },
        {
          name: "No Stationary Fight",
          category: "mutation",
          effects: [{ kind: "mutate", mutation: { id: "db.no_stationary", label: "movement skills chain a slash", target: { withTag: "movement" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "damage", damage: { base: 0.6, scale: "attack", type: "physical", canCrit: true }, to: "enemies" }] }] } }],
        },
        {
          name: "Sword Dance",
          category: "keystone",
          effects: [{ kind: "rule", rule: "swordsman.db.sword_dance", note: "Attacking within a beat of moving is always a critical." }],
        },
      ],
    },
    // 2 — Counterblade: win by being hit and answering.
    {
      name: "Counterblade",
      blurb: "The enemy's swing is the opening; you just have to be ready for it.",
      nodes: [
        { name: "Guard Training", category: "foundation", effects: [{ kind: "mods", mods: { defensePercent: 0.08, thorns: 3 } }] },
        {
          name: "Riposte",
          category: "behavior",
          effects: [{ kind: "mutate", mutation: { id: "cb.riposte", label: "Crossguard answers a block", target: { abilityId: "swordsman.crossguard" }, ops: [{ kind: "trigger", event: "damageTaken", window: 1.6, effects: [{ kind: "damage", damage: { base: 1.4, scale: "attack", type: "physical", channel: "retaliation" }, to: "enemies" }] }] } }],
        },
        {
          name: "Deflection",
          category: "resource",
          effects: [{ kind: "resourceRule", resource: "technique", patch: { addGeneration: [{ on: "block", amount: 14 }] } }],
        },
        {
          name: "Punishment",
          category: "mutation",
          effects: [{ kind: "mutate", mutation: { id: "cb.punishment", label: "counters carry a wound", target: { withTag: "counter" }, ops: [{ kind: "damagePacket", setInflict: { status: "bleed", chance: 1 } }] } }],
        },
        {
          name: "Untouchable Form",
          category: "keystone",
          effects: [{ kind: "rule", rule: "swordsman.cb.untouchable_form", note: "A perfectly-timed block grants a second of full immunity and a free Masterstroke." }],
        },
      ],
    },
    // 3 — Executioner: finish wounded things.
    {
      name: "Executioner",
      blurb: "Expose the weak point, open it, and close the fight.",
      nodes: [
        {
          name: "Expose",
          category: "foundation",
          effects: [{ kind: "grantEffect", on: { tag: "slash" }, effects: [{ kind: "status", status: "exposed", chance: 0.3, to: "allTargets" }] }],
        },
        {
          name: "Sever",
          category: "behavior",
          effects: [{ kind: "mutate", mutation: { id: "ex.sever", label: "slashes bleed harder", target: { withTag: "bleed" }, ops: [{ kind: "status", scaleDuration: 1.3, addStacks: 1 }] } }],
        },
        {
          name: "Finish",
          category: "resource",
          effects: [{ kind: "resourceRule", resource: "technique", patch: { addGeneration: [{ on: "enemyDeath", amount: 8 }] } }],
        },
        {
          name: "Ruthless",
          category: "mutation",
          effects: [{ kind: "mutate", mutation: { id: "ex.ruthless", label: "Masterstroke always crits", target: { abilityId: "swordsman.masterstroke" }, ops: [{ kind: "damagePacket", addExecuteMissingHealth: 0.2 }, { kind: "cooldown", scale: 0.8 }] } }],
        },
        {
          name: "Final Cut",
          category: "keystone",
          effects: [{ kind: "rule", rule: "swordsman.ex.final_cut", note: "Killing a marked or exposed target refunds Masterstroke and Swordflash." }],
        },
      ],
    },
    // 4 — Spellblade: the sword carries the last spell it touched.
    {
      name: "Spellblade",
      blurb: "Steel is a fine conductor.",
      nodes: [
        {
          name: "Arcane Edge",
          category: "foundation",
          effects: [
            { kind: "mods", mods: { elementalDamage: 0.1 } },
            { kind: "grantEffect", on: { tag: "slash" }, effects: [{ kind: "damage", damage: { base: 0.3, scale: "attack", type: "arcane", canCrit: true }, to: "allTargets" }] },
          ],
        },
        {
          name: "Elemental Contact",
          category: "behavior",
          effects: [{ kind: "grantEffect", on: { tag: "slash" }, effects: [{ kind: "status", status: "shock", chance: 0.2, to: "allTargets" }] }],
        },
        {
          name: "Spellstrike",
          category: "resource",
          effects: [{ kind: "resourceRule", resource: "technique", patch: { addGeneration: [{ on: "ailmentInflicted", amount: 5 }] } }],
        },
        {
          name: "Arcane Momentum",
          category: "mutation",
          effects: [{ kind: "mutate", mutation: { id: "sb.arcane_momentum", label: "Threefold Cut inherits an element", target: { abilityId: "swordsman.threefold_cut" }, ops: [{ kind: "damagePacket", setType: "arcane" }, { kind: "addTags", tags: ["arcane"] }] } }],
        },
        {
          name: "Battle Caster",
          category: "keystone",
          effects: [{ kind: "rule", rule: "swordsman.sb.battle_caster", note: "Your sword attacks copy the element and rider of the last skill you cast." }],
        },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `swordsman.${id}`,
  classId: "swordsman",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `swordsman.hybrid.${id}` }],
  ...extra,
});

export const SWORDSMAN_UNLOCKS: PathUnlockDef[] = [
  H("blade_dance", "Blade Dance", "Three different moving attacks in a beat open a free, guaranteed-crit finisher.", "Master of Arms", "Dancing Blade", {
    mutations: [{ id: "swordsman.blade_dance", label: "moving techniques build a finisher", target: { withTag: "movement" }, ops: [{ kind: "followUp", window: 2, effects: [{ kind: "damage", damage: { base: 1.4, scale: "attack", type: "physical", canCrit: true }, to: "enemies" }] }] }],
    ui: { badge: "BLD" },
  }),
  H("duel_to_the_death", "Duel to the Death", "A perfect counter permanently exposes an elite's weak point for the rest of the fight.", "Counterblade", "Executioner", {
    effects: [
      { kind: "rule", rule: "swordsman.hybrid.duel_to_the_death" },
      { kind: "grantEffect", on: { tag: "counter" }, effects: [{ kind: "status", status: "exposed", chance: 1, to: "enemies" }] },
    ],
    ui: { badge: "DTD" },
  }),
  H("arcane_mastery", "Arcane Mastery", "Sword attacks inherit the properties of the last spell-tagged skill you cast, not just its element.", "Master of Arms", "Spellblade", {
    mutations: [{ id: "swordsman.arcane_mastery", label: "slashes carry the last cast", target: { withTag: "slash" }, ops: [{ kind: "damagePacket", scaleBase: 1.1 }, { kind: "addTags", tags: ["arcane"] }] }],
    ui: { badge: "ARC" },
  }),
  H("passing_judgment", "Passing Judgment", "Executing a target with any skill resets Swordflash and refunds its Technique.", "Dancing Blade", "Executioner", {
    effects: [
      { kind: "rule", rule: "swordsman.hybrid.passing_judgment" },
      { kind: "grantEffect", on: { event: "kill" }, effects: [{ kind: "resource", resource: "technique", delta: 15, to: "self" }] },
    ],
    ui: { badge: "PJ" },
  }),
  H("parry_dance", "Parry Dance", "A successful guard grants a movement charge — a dash you didn't have to earn.", "Counterblade", "Dancing Blade", {
    effects: [
      { kind: "rule", rule: "swordsman.hybrid.parry_dance" },
      { kind: "grantEffect", on: { event: "damageTaken" }, effects: [{ kind: "resource", resource: "technique", delta: 8, to: "self" }] },
    ],
    ui: { badge: "PD" },
  }),
  H("spellblade_execution", "Spellblade Execution", "Masterstroke detonates every active elemental status on the target for a burst.", "Executioner", "Spellblade", {
    mutations: [{ id: "swordsman.spellblade_execution", label: "Masterstroke detonates", target: { abilityId: "swordsman.masterstroke" }, ops: [{ kind: "addEffect", at: "end", effects: [
      { kind: "consumeStatus", status: "shock", to: "target", then: [{ kind: "damage", damage: { base: 1.5, scale: "attack", type: "lightning", channel: "execute" }, to: "target" }] },
      { kind: "consumeStatus", status: "burn", to: "target", then: [{ kind: "damage", damage: { base: 1.5, scale: "attack", type: "fire", channel: "execute" }, to: "target" }] },
    ] }] }],
    ui: { badge: "SBX" },
  }),
  {
    id: "swordsman.sword_saint",
    classId: "swordsman",
    tier: "mythic",
    name: "Sword Saint",
    description: "Sword Eclipse gains a true finisher: after the ring of cuts, one perfect strike lands on every enemy still standing, always a critical, refunding a third of the Technique it cost.",
    flavor: "The fight was decided the moment they agreed to it.",
    requires: [
      { path: "Master of Arms", points: 6 },
      { path: "Counterblade", points: 4 },
      { path: "Executioner", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "swordsman.mythic.sword_saint" }],
    mutations: [{
      id: "swordsman.sword_saint.eclipse",
      label: "Sword Eclipse → Sword Saint",
      target: { abilityId: "swordsman.sword_eclipse" },
      ops: [
        { kind: "targeting", scaleRadius: 1.25 },
        { kind: "addEffect", at: "end", effects: [
          { kind: "delay", seconds: 1.1, effects: [
            { kind: "damage", damage: { base: 4.0, scale: "attack", type: "physical", canCrit: true, executeMissingHealth: 0.3 }, to: "allTargets" },
          ] },
        ] },
      ],
    }],
    ui: { badge: "SAINT" },
  },
];

export const SWORDSMAN: PilotClass = {
  classId: "swordsman",
  name: "Swordsman",
  fantasy: "The adaptable weapon master built around technique, chaining, stances, and intelligent switching.",
  role: "Flexible DPS / wave clear / single-target specialist.",
  question: "How well can I chain different techniques?",
  resources: SWORDSMAN_RESOURCES,
  statuses: SWORDSMAN_STATUSES,
  abilities: SWORDSMAN_ABILITIES,
  progression: SWORDSMAN_PROGRESSION,
  unlocks: SWORDSMAN_UNLOCKS,
};
