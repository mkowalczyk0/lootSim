/**
 * Necromancer — value out of every death.
 *
 * The pilot for: **Corpses** as a countable resource spawned by the event bus and spent
 * to pay for summons (`summon.fromCorpses`); **Souls** as a second economy; the
 * `commandSummons` step (Command: Ravage) and the `consumeSummons` step (Death Pact);
 * player-built terrain (Ossuary Wall); and the spec's canonical mutation —
 * `Corpse Bomb → Bone Structure`, one ability id, a `replaceEffects` op.
 *
 * Question: how much value can I extract from every death?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ----------------------------------------------------------

export const NECROMANCER_MANA: ResourceSpec = {
  id: "mana",
  label: "Mana",
  max: 100,
  start: "full",
  ui: "bar",
  regenPerSec: 7,
};

/** Corpses — spawned when an enemy dies, spent by raising and detonating them. */
export const NECROMANCER_CORPSES: ResourceSpec = {
  id: "corpses",
  label: "Corpses",
  max: 8,
  start: "empty",
  ui: "pips",
  generation: [
    { on: "enemyDeath", amount: 1 },
    { on: "corpseCreated", amount: 1 },
  ],
  overflow: "cap",
};

/** Souls — a slower economy: kills and dying minions feed it, the Soul Tyrant path spends it on personal power. */
export const NECROMANCER_SOULS: ResourceSpec = {
  id: "souls",
  label: "Souls",
  max: 100,
  start: "empty",
  ui: "bar",
  decayPerSec: 2,
  decayDelay: 8,
  generation: [
    { on: "kill", amount: 6 },
    { on: "summonDeath", amount: 4 },
  ],
  thresholds: [{ at: 60, whileAbove: { skillDamage: 0.12 } }],
};

export const NECROMANCER_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Kingdom",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "enemyDeath", amount: 4 },
    { on: "summonDeath", amount: 3 },
  ],
};

export const NECROMANCER_RESOURCES: readonly ResourceSpec[] = [
  NECROMANCER_MANA,
  NECROMANCER_CORPSES,
  NECROMANCER_SOULS,
  NECROMANCER_ULTIMATE_METER,
];

// --- statuses -------------------------------------------------------

/** Marked for Harvest — Soul Brand's mark: this enemy drops an extra Soul when it dies. */
export const STATUS_SOUL_BRAND = {
  id: "soul_brand",
  label: "Soul-Branded",
  glyph: "†",
  category: "curse",
  tags: ["curse", "mark", "void"],
  baseDuration: 15,
  maxStacks: 1,
  refreshRule: "refresh",
  amplify: 1.08,
} as const satisfies StatusSpec;

/** Decay — the Necromancer's corruption DoT, distinct from the caster-neutral baseline corruption. */
export const STATUS_DECAY = {
  id: "decay",
  label: "Decaying",
  glyph: "d",
  category: "dot",
  tags: ["corruption", "void", "poison"],
  baseDuration: 6,
  maxStacks: 5,
  refreshRule: "stack",
  dps: 0.12,
  tickInterval: 0.5,
  damageType: "void",
  damageChannel: "dot",
  amplify: 1.04,
} as const satisfies StatusSpec;

export const NECROMANCER_STATUSES: readonly StatusSpec[] = [STATUS_SOUL_BRAND, STATUS_DECAY];

// --- abilities (9 + 1) --------------------------------------------

export const NECROMANCER_RAISE_SKELETON = {
  id: "necromancer.raise_skeleton",
  classId: "necromancer",
  name: "Raise Skeleton",
  description: "Pull a melee skeleton up out of a nearby corpse.",
  flavor: "Waste not.",
  category: "summon",
  tags: ["summon", "minion", "corpse"],
  costs: [
    { resource: "corpses", amount: 1 },
    { resource: "mana", amount: 6 },
  ],
  cooldown: 1,
  targeting: "corpse",
  range: 200,
  effects: [
    { kind: "summon", unit: "skeleton_warrior", count: 1, duration: 45, fromCorpses: 1, command: { behavior: "aggroNearest", inheritPower: 0.5 } },
  ],
  mutationHooks: [{ id: "raise_skeleton.count", kind: "summon", note: "Legion Commander raises two at a time, weaker each." }],
} as const satisfies Ability;

export const NECROMANCER_BONE_SPEAR = {
  id: "necromancer.bone_spear",
  classId: "necromancer",
  name: "Bone Spear",
  description: "Rip a shard of bone from a corpse and hurl it through a whole rank of enemies.",
  flavor: "It was load-bearing for someone.",
  category: "spell",
  tags: ["projectile", "physical", "corpse", "line"],
  costs: [
    { resource: "corpses", amount: 1 },
    { resource: "mana", amount: 10 },
  ],
  cooldown: 2,
  targeting: "direction",
  range: 340,
  effects: [
    {
      kind: "projectile",
      projectile: {
        damage: { base: 2.2, scale: "spell", type: "physical", canCrit: true, inflict: { status: "decay", chance: 0.4 } },
        speed: 480,
        radius: 8,
        life: 1,
        pierce: 4,
      },
    },
  ],
} as const satisfies Ability;

export const NECROMANCER_CORPSE_BOMB = {
  id: "necromancer.corpse_bomb",
  classId: "necromancer",
  name: "Corpse Bomb",
  description: "Overcharge a corpse until it bursts, showering everything nearby in void-touched bone.",
  flavor: "The dead make excellent ordnance.",
  category: "spell",
  tags: ["corpse", "area", "void"],
  costs: [
    { resource: "corpses", amount: 1 },
    { resource: "mana", amount: 8 },
  ],
  cooldown: 3,
  targeting: "corpse",
  range: 180,
  fx: { travel: "bolt" },
  effects: [
    { kind: "consumeStatus", status: "mark", to: "corpse" },
    { kind: "damage", damage: { base: 3, scale: "spell", type: "void", canCrit: true }, to: "enemies" },
    { kind: "status", status: "decay", chance: 1, stacks: 2, to: "enemies" },
  ],
  mutationHooks: [
    { id: "corpse_bomb.detonation", kind: "damagePacket", note: "Grave Industry scales the blast." },
    { id: "corpse_bomb.bone_structure", kind: "replaceEffect", note: "Bone Structure: the corpse raises a turret instead of exploding." },
  ],
} as const satisfies Ability;

export const NECROMANCER_GRAVE_GUARD = {
  id: "necromancer.grave_guard",
  classId: "necromancer",
  name: "Grave Guard",
  description: "Raise an armoured skeleton that plants itself and drags enemy attention onto it.",
  flavor: "It has one job and no fear of losing it.",
  category: "summon",
  tags: ["summon", "minion", "taunt", "corpse"],
  costs: [
    { resource: "corpses", amount: 1 },
    { resource: "mana", amount: 14 },
  ],
  cooldown: 12,
  targeting: "radius",
  range: 200,
  shape: { radius: 150 },
  effects: [
    { kind: "summon", unit: "grave_guard", count: 1, duration: 30, fromCorpses: 1, command: { behavior: "guardPoint", inheritPower: 0.7 } },
    { kind: "threat", op: "taunt", radius: 140, to: "enemies" },
  ],
} as const satisfies Ability;

export const NECROMANCER_BLOOD_SERVANT = {
  id: "necromancer.blood_servant",
  classId: "necromancer",
  name: "Blood Servant",
  description: "A short-lived undead that follows you and knits your wounds while it lasts.",
  flavor: "Loyal, briefly.",
  category: "summon",
  tags: ["summon", "minion", "heal", "support"],
  costs: [{ resource: "mana", amount: 18 }],
  cooldown: 16,
  targeting: "self",
  effects: [
    { kind: "summon", unit: "blood_servant", count: 1, duration: 12, command: { behavior: "follow", inheritPower: 0.2 } },
    { kind: "heal", amount: 0.3, scale: "spell", to: "self", overTime: { duration: 12 } },
  ],
} as const satisfies Ability;

export const NECROMANCER_CORPSE_WALK = {
  id: "necromancer.corpse_walk",
  classId: "necromancer",
  name: "Corpse Walk",
  description: "Step into a corpse and out of another, leaving a decaying duplicate of yourself behind.",
  flavor: "The shortest path between two points is through the recently deceased.",
  category: "movement",
  tags: ["teleport", "movement", "corpse"],
  costs: [{ resource: "mana", amount: 10 }],
  cooldown: 7,
  targeting: "corpse",
  range: 320,
  effects: [
    { kind: "move", style: "teleport", leaveAnchor: true, iframes: 0.3 },
    { kind: "summon", unit: "decoy_husk", count: 1, duration: 4, command: { behavior: "guardPoint", inheritPower: 0 } },
  ],
} as const satisfies Ability;

export const NECROMANCER_COMMAND_RAVAGE = {
  id: "necromancer.command_ravage",
  classId: "necromancer",
  name: "Command: Ravage",
  description: "Every undead you control drops what it is doing and tears into one target.",
  flavor: "The order is not a request.",
  category: "utility",
  tags: ["minion", "resourceSpender"],
  costs: [{ resource: "souls", amount: 20 }],
  cooldown: 10,
  targeting: "enemy",
  range: 400,
  fx: { travel: "bolt" },
  effects: [
    { kind: "commandSummons", command: "commandTarget", to: "target" },
    { kind: "status", status: "exposed", chance: 1, to: "target" },
  ],
  mutationHooks: [{ id: "command_ravage.behavior", kind: "summon", note: "Death Knight makes the order a frenzy buff, not just a target swap." }],
} as const satisfies Ability;

export const NECROMANCER_OSSUARY_WALL = {
  id: "necromancer.ossuary_wall",
  classId: "necromancer",
  name: "Ossuary Wall",
  description: "Throw up a wall of interlocked bone that stops movement and projectiles both.",
  flavor: "A fence with opinions.",
  category: "terrain",
  tags: ["terrain", "barrier", "construct", "corpse"],
  costs: [
    { resource: "corpses", amount: 2 },
    { resource: "mana", amount: 12 },
  ],
  cooldown: 14,
  targeting: "point",
  range: 220,
  effects: [
    { kind: "terrain", piece: "wall", length: 160, duration: 8, hp: 260 },
  ],
  mutationHooks: [{ id: "ossuary_wall.pieces", kind: "replaceEffect", note: "Ossuary keystone makes the wall bristle with bone spikes." }],
} as const satisfies Ability;

export const NECROMANCER_DEATH_PACT = {
  id: "necromancer.death_pact",
  classId: "necromancer",
  name: "Death Pact",
  description: "Consume one of your own undead in a burst of stolen vitality — health and Mana back to you.",
  flavor: "It understands. It always does.",
  category: "utility",
  tags: ["minion", "heal", "resourceGenerator"],
  cooldown: 6,
  targeting: "self",
  effects: [
    {
      kind: "consumeSummons",
      count: 1,
      then: [
        { kind: "heal", amount: 0.35, scale: "spell", to: "self" },
        { kind: "resource", resource: "mana", delta: 30, to: "self" },
        { kind: "resource", resource: "souls", delta: 10, to: "self" },
      ],
    },
  ],
} as const satisfies Ability;

export const NECROMANCER_KINGDOM_OF_BONES = {
  id: "necromancer.kingdom_of_bones",
  classId: "necromancer",
  name: "Kingdom of Bones",
  description: "Every corpse on the floor rises at once; existing undead are empowered and your command reaches the whole field.",
  flavor: "A brief, understaffed nation.",
  category: "ultimate",
  tags: ["ultimate", "summon", "minion", "corpse"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  effects: [
    { kind: "summon", unit: "skeleton_warrior", count: 12, duration: 25, fromCorpses: "all", command: { behavior: "aggroNearest", inheritPower: 0.6 } },
    { kind: "commandSummons", command: "aggroNearest", to: "self" },
    { kind: "heal", amount: 0.5, scale: "spell", to: "summons" },
  ],
  mutationHooks: [{ id: "kingdom.scaling", kind: "summon", note: "Soul Legion converts the raise into Soul ammunition on demand." }],
} as const satisfies Ability;

export const NECROMANCER_ABILITIES = [
  NECROMANCER_RAISE_SKELETON,
  NECROMANCER_BONE_SPEAR,
  NECROMANCER_CORPSE_BOMB,
  NECROMANCER_GRAVE_GUARD,
  NECROMANCER_BLOOD_SERVANT,
  NECROMANCER_CORPSE_WALK,
  NECROMANCER_COMMAND_RAVAGE,
  NECROMANCER_OSSUARY_WALL,
  NECROMANCER_DEATH_PACT,
  NECROMANCER_KINGDOM_OF_BONES,
] as const satisfies readonly Ability[];

// --- the tree ---------------------------------------------------

export const NECROMANCER_PROGRESSION: ClassProgression = {
  classId: "necromancer",
  paths: [
    // 0 — Legion Commander: many weak minions.
    {
      name: "Legion Commander",
      blurb: "Quantity has a quality all its own.",
      nodes: [
        { name: "Mass Grave", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.05 } }, { kind: "resourceRule", resource: "corpses", patch: { max: 12 } }] },
        {
          name: "Press-Ganged",
          category: "behavior",
          effects: [
            {
              kind: "grantEffect",
              on: { event: "enemyDeath" },
              effects: [{ kind: "resource", resource: "corpses", delta: 1, to: "self" }],
              note: "Deaths near you always leave a usable corpse.",
            },
          ],
        },
        {
          name: "Conscription",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "corpses", patch: { addGeneration: [{ on: "kill", amount: 1 }] } },
          ],
        },
        {
          name: "Two From One",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "legion.two_from_one",
                label: "Raise Skeleton → a pair",
                target: { abilityId: "necromancer.raise_skeleton" },
                ops: [
                  { kind: "summon", addCount: 1, addInheritPower: -0.15 },
                  { kind: "cooldown", scale: 0.7 },
                ],
              },
            },
          ],
        },
        {
          name: "Endless Legion",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "necromancer.legion.endless_legion" },
            {
              kind: "grantEffect",
              on: { event: "summonDeath" },
              effects: [{ kind: "resource", resource: "corpses", delta: 1, to: "self" }],
            },
          ],
        },
      ],
    },

    // 1 — Death Knight: fewer, powerful undead.
    {
      name: "Death Knight",
      blurb: "One good soldier is worth ten scarecrows.",
      nodes: [
        { name: "Iron Bound", category: "foundation", effects: [{ kind: "mods", mods: { defensePercent: 0.08 } }] },
        {
          name: "Champion's Share",
          category: "behavior",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "deathknight.champions_share",
                label: "fewer, stronger raises",
                target: { withTag: "summon" },
                ops: [{ kind: "summon", addCount: -1, addInheritPower: 0.35, scaleDuration: 1.5 }],
              },
            },
          ],
        },
        {
          name: "Blood Tithe",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "souls", patch: { addGeneration: [{ on: "hitDealt", amount: 1, requireTags: ["minion"] }] } },
          ],
        },
        {
          name: "War Cry",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "deathknight.war_cry",
                label: "Command: Ravage → War Cry",
                target: { abilityId: "necromancer.command_ravage" },
                ops: [
                  { kind: "addEffect", at: "end", effects: [{ kind: "resource", resource: "souls", delta: 8, to: "self" }] },
                  { kind: "cooldown", scale: 0.8 },
                ],
              },
            },
          ],
        },
        {
          name: "Champion of Death",
          category: "keystone",
          effects: [{ kind: "rule", rule: "necromancer.deathknight.champion_of_death" }],
        },
      ],
    },

    // 2 — Corpse Architect: corpses into structures and explosions.
    {
      name: "Corpse Architect",
      blurb: "A corpse is raw material. What you build with it is the interesting part.",
      nodes: [
        { name: "Foundations", category: "foundation", effects: [{ kind: "mods", mods: { areaSize: 0.1 } }] },
        {
          name: "Load Distribution",
          category: "behavior",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "architect.load_distribution",
                label: "walls last and merge",
                target: { withTag: "terrain" },
                ops: [{ kind: "cooldown", scale: 0.85 }],
              },
            },
          ],
        },
        {
          name: "Salvage",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "corpses", patch: { addThresholds: [{ at: 6, whileAbove: { areaSize: 0.15 } }] } },
          ],
        },
        {
          name: "Bone Structure",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "architect.bone_structure",
                label: "Corpse Bomb → Bone Structure",
                target: { abilityId: "necromancer.corpse_bomb" },
                ops: [
                  {
                    kind: "replaceEffects",
                    effects: [
                      { kind: "summon", unit: "bone_turret", count: 1, duration: 14, command: { behavior: "guardPoint", inheritPower: 0.5 } },
                    ],
                  },
                  { kind: "addTags", tags: ["summon", "construct"] },
                ],
              },
            },
          ],
        },
        {
          name: "Grave Industry",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "necromancer.architect.grave_industry" },
            {
              kind: "grantEffect",
              on: { tag: "corpse" },
              effects: [{ kind: "resource", resource: "souls", delta: 3, to: "self" }],
            },
          ],
        },
      ],
    },

    // 3 — Bone Lord: bone constructs.
    {
      name: "Bone Lord",
      blurb: "Skip the flesh. Bone does everything flesh does and lasts longer.",
      nodes: [
        { name: "Calcify", category: "foundation", effects: [{ kind: "mods", mods: { healthPercent: 0.06 } }] },
        {
          name: "Spinework",
          category: "behavior",
          effects: [
            {
              kind: "grantEffect",
              on: { tag: "construct" },
              effects: [{ kind: "status", status: "bleed", chance: 0.6, to: "enemies" }],
            },
          ],
        },
        {
          name: "Marrow Reserve",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "mana", patch: { addGeneration: [{ on: "summonDeath", amount: 8 }] } },
          ],
        },
        {
          name: "Bristle",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "bonelord.bristle",
                label: "Ossuary Wall → spiked",
                target: { abilityId: "necromancer.ossuary_wall" },
                ops: [
                  { kind: "trigger", event: "hit", window: 8, effects: [{ kind: "damage", damage: { base: 0.5, scale: "spell", type: "physical", channel: "retaliation" }, to: "enemies" }] },
                ],
              },
            },
          ],
        },
        {
          name: "Ossuary",
          category: "keystone",
          effects: [{ kind: "rule", rule: "necromancer.bonelord.ossuary" }],
        },
      ],
    },

    // 4 — Soul Tyrant: spend Souls on personal spell power.
    {
      name: "Soul Tyrant",
      blurb: "Why command an army when you can simply be one?",
      nodes: [
        { name: "Soul Sight", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.1 } }] },
        {
          name: "Soul Brand",
          category: "behavior",
          effects: [
            {
              kind: "grantEffect",
              on: { tag: "void" },
              effects: [{ kind: "status", status: "soul_brand", chance: 1, to: "allTargets" }],
            },
          ],
        },
        {
          name: "Reap",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "souls", patch: { addGeneration: [{ on: "enemyDeath", amount: 4 }], max: 150 } },
          ],
        },
        {
          name: "Soul Fire",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "tyrant.soul_fire",
                label: "Bone Spear feeds on Souls",
                target: { abilityId: "necromancer.bone_spear" },
                ops: [
                  { kind: "damagePacket", scaleBase: 1.3, setType: "void" },
                  { kind: "resource", addCostEntry: { resource: "souls", amount: 8 } },
                ],
              },
            },
          ],
        },
        {
          name: "Soulstorm",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "necromancer.tyrant.soulstorm" },
            {
              kind: "resourceRule",
              resource: "souls",
              patch: { addThresholds: [{ at: 100, whileAbove: { skillDamage: 0.3, elementalDamage: 0.2 } }] },
            },
          ],
        },
      ],
    },
  ],
};

// --- hybrids + archetype ------------------------------------------

export const NECROMANCER_UNLOCKS: readonly PathUnlockDef[] = [
  {
    id: "necromancer.meat_grinder",
    classId: "necromancer",
    tier: "hybrid",
    name: "Meat Grinder",
    description: "Skeletons that die feed the corpse pile directly, so the legion is self-sustaining as long as it is fighting.",
    flavor: "In one end, out the other, back around.",
    requires: [
      { path: "Legion Commander", points: 3 },
      { path: "Corpse Architect", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "necromancer.hybrid.meat_grinder" },
      {
        kind: "grantEffect",
        on: { event: "summonDeath" },
        effects: [{ kind: "resource", resource: "corpses", delta: 2, to: "self" }],
      },
    ],
    ui: { badge: "MGR" },
  },
  {
    id: "necromancer.lich_bond",
    classId: "necromancer",
    tier: "hybrid",
    name: "Lich Bond",
    description: "Bind one champion undead to your Souls: while it lives, your spell power and its power rise together.",
    flavor: "Two bodies, one ledger.",
    requires: [
      { path: "Death Knight", points: 3 },
      { path: "Soul Tyrant", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "necromancer.hybrid.lich_bond" },
      {
        kind: "resourceRule",
        resource: "souls",
        patch: { addThresholds: [{ at: 40, whileAbove: { skillDamage: 0.1 } }] },
      },
    ],
    ui: { badge: "LCH" },
  },
  {
    id: "necromancer.bone_forge",
    classId: "necromancer",
    tier: "hybrid",
    name: "Bone Forge",
    description: "Ossuary Wall segments emit bone turrets; Bone Structure turrets can be walked into a wall.",
    flavor: "Fortification and firepower are the same requisition form.",
    requires: [
      { path: "Corpse Architect", points: 3 },
      { path: "Bone Lord", points: 3 },
    ],
    effects: [{ kind: "rule", rule: "necromancer.hybrid.bone_forge" }],
    mutations: [
      {
        id: "bone_forge.wall",
        label: "walls grow turrets",
        target: { withTag: "terrain" },
        ops: [
          { kind: "addEffect", at: "end", effects: [{ kind: "summon", unit: "bone_turret", count: 2, duration: 8, command: { behavior: "guardPoint", inheritPower: 0.4 } }] },
        ],
      },
    ],
    ui: { badge: "BFG" },
  },
  {
    id: "necromancer.soul_general",
    classId: "necromancer",
    tier: "hybrid",
    name: "Soul General",
    description: "Command: Ravage spends Souls to make the whole legion critically strike for its duration.",
    flavor: "A raise in morale, paid in souls.",
    requires: [
      { path: "Legion Commander", points: 3 },
      { path: "Soul Tyrant", points: 3 },
    ],
    effects: [{ kind: "rule", rule: "necromancer.hybrid.soul_general" }],
    mutations: [
      {
        id: "soul_general.ravage",
        label: "Command: Ravage empowers the legion",
        target: { abilityId: "necromancer.command_ravage" },
        ops: [
          { kind: "addEffect", at: "end", effects: [{ kind: "commandSummons", command: "commandTarget", to: "target" }] },
          { kind: "resource", addCost: 10 },
        ],
      },
    ],
    ui: { badge: "SGN" },
  },
  {
    id: "necromancer.death_knights_harvest",
    classId: "necromancer",
    tier: "hybrid",
    name: "Death Knight's Harvest",
    description: "Your champion undead reap corpses as they kill, handing them straight back to you.",
    flavor: "It tidies as it works.",
    requires: [
      { path: "Death Knight", points: 3 },
      { path: "Corpse Architect", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "necromancer.hybrid.death_knights_harvest" },
      {
        kind: "grantEffect",
        on: { event: "enemyDeath" },
        effects: [{ kind: "resource", resource: "corpses", delta: 1, to: "self" }],
      },
    ],
    ui: { badge: "DKH" },
  },
  {
    id: "necromancer.ossuary_storm",
    classId: "necromancer",
    tier: "hybrid",
    name: "Ossuary Storm",
    description: "At full Souls your bone constructs orbit you in a shredding cyclone instead of standing still.",
    flavor: "The fence learned to fly.",
    requires: [
      { path: "Bone Lord", points: 3 },
      { path: "Soul Tyrant", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "necromancer.hybrid.ossuary_storm" },
      {
        kind: "grantEffect",
        on: { tag: "construct" },
        effects: [{ kind: "zone", zone: { radius: 90, duration: 6, tickInterval: 0.4, follows: true, mergeable: false, damage: { base: 0.4, scale: "spell", type: "physical", channel: "periodic" }, status: { id: "bleed", chance: 0.5 } } }],
      },
    ],
    ui: { badge: "OST" },
  },
  {
    id: "necromancer.soul_legion",
    classId: "necromancer",
    tier: "mythic",
    name: "Soul Legion",
    description:
      "Kingdom of Bones stops being one choice: every death now becomes either army strength or direct Soul ammunition, and you decide in the moment which — the raise can be fired outward as a barrage of soul-shot.",
    flavor: "An army, or a cannon. Yes.",
    requires: [
      { path: "Legion Commander", points: 6 },
      { path: "Corpse Architect", points: 4 },
      { path: "Soul Tyrant", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "necromancer.mythic.soul_legion" }],
    mutations: [
      {
        id: "soul_legion.kingdom",
        label: "Kingdom of Bones → Soul Legion",
        target: { abilityId: "necromancer.kingdom_of_bones" },
        ops: [
          { kind: "summon", addCount: 6, addInheritPower: 0.2 },
          {
            kind: "followUp",
            window: 6,
            effects: [
              { kind: "consumeSummons", count: "all", then: [{ kind: "damage", damage: { base: 0.9, scale: "spell", type: "void", channel: "minion" }, to: "enemies" }, { kind: "resource", resource: "souls", delta: 40, to: "self" }] },
            ],
          },
          { kind: "addTags", tags: ["void"] },
        ],
      },
    ],
    ui: { badge: "SLG" },
  },
];

// --- the assembled class --------------------------------------

export const NECROMANCER: PilotClass = {
  classId: "necromancer",
  name: "Necromancer",
  fantasy: "Commander of the dead — every corpse is a possible soldier, projectile, wall, bomb or resource.",
  role: "Summoner / attrition / battlefield commander.",
  question: "How much value can I extract from every death?",
  resources: NECROMANCER_RESOURCES,
  statuses: NECROMANCER_STATUSES,
  abilities: NECROMANCER_ABILITIES,
  progression: NECROMANCER_PROGRESSION,
  unlocks: NECROMANCER_UNLOCKS,
};
