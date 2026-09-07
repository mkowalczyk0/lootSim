/**
 * Magician — bending the rules of spellcasting.
 *
 * The pilot for: a **dual resource** (Mana that regenerates + Overcharge that builds
 * from spending it); a random-outcome effect step (Arcane Roulette); casting copies
 * that inherit a fraction of your power (Mirror Image); teleport-and-originate-from-
 * where-you-were (`temporalAnchor` targeting, Paradox); and low-resource keystones that
 * spend health for power.
 *
 * Question: how much can I bend the rules of spellcasting?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ----------------------------------------------------------

export const MAGICIAN_MANA: ResourceSpec = {
  id: "mana",
  label: "Mana",
  max: 100,
  start: "full",
  ui: "bar",
  regenPerSec: 9,
  healthConversion: { ratio: 2.5 },
};

/** Overcharge builds as you burn Mana and bleeds away when you stop; spent on empowered casts. */
export const MAGICIAN_OVERCHARGE: ResourceSpec = {
  id: "overcharge",
  label: "Overcharge",
  max: 100,
  start: "empty",
  ui: "pips",
  decayPerSec: 8,
  decayDelay: 2,
  generation: [{ on: "manaSpent", amount: 60, perUnit: "manaFraction" }],
  thresholds: [{ at: 60, whileAbove: { skillDamage: 0.15, elementalDamage: 0.1 } }],
  overflow: "cap",
};

export const MAGICIAN_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Astral",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [{ on: "manaSpent", amount: 40, perUnit: "manaFraction" }],
};

export const MAGICIAN_RESOURCES: readonly ResourceSpec[] = [
  MAGICIAN_MANA,
  MAGICIAN_OVERCHARGE,
  MAGICIAN_ULTIMATE_METER,
];

// --- statuses -------------------------------------------------------

/** Weave — Spellweave's marker: the next spell inherits a property of the last one. Consumed on cast. */
export const STATUS_WEAVE: StatusSpec = {
  id: "weave",
  label: "Weave",
  glyph: "~",
  category: "buff",
  tags: ["arcane"],
  baseDuration: 4,
  maxStacks: 3,
  refreshRule: "stack",
  mods: { skillDamage: 0.05 },
};

/** Unstable — Aether Step's sigil ground: enemies standing on it take amplified magic damage. */
export const STATUS_UNSTABLE = {
  id: "unstable",
  label: "Unstable",
  glyph: "u",
  category: "debuff",
  tags: ["arcane", "vulnerable"],
  baseDuration: 4,
  maxStacks: 1,
  refreshRule: "refresh",
  amplify: 1.18,
} as const satisfies StatusSpec;

export const MAGICIAN_STATUSES: readonly StatusSpec[] = [STATUS_WEAVE, STATUS_UNSTABLE];

// --- abilities (9 + 1) --------------------------------------------

export const MAGICIAN_ARC_SPARK: Ability = {
  id: "magician.arc_spark",
  classId: "magician",
  name: "Arc Spark",
  description: "A fast bolt of lightning. When it kills, it jumps to the next enemy on its own.",
  flavor: "Cheap, quick, and it doesn't like to stop.",
  category: "spell",
  tags: ["projectile", "lightning", "resourceSpender"],
  costs: [{ resource: "mana", amount: 8 }],
  cooldown: 0.6,
  targeting: "direction",
  range: 360,
  effects: [
    {
      kind: "projectile",
      projectile: {
        damage: { base: 1.1, scale: "spell", type: "lightning", inflict: { status: "shock", chance: 0.3 } },
        speed: 620,
        radius: 6,
        life: 0.8,
        pierce: 1,
      },
    },
  ],
  mutationHooks: [{ id: "arc_spark.chain", kind: "projectile", note: "Thunder God nodes add bounces and chains." }],
};

export const MAGICIAN_EMBER_ORB: Ability = {
  id: "magician.ember_orb",
  classId: "magician",
  name: "Ember Orb",
  description: "A slow, heavy orb of fire that bursts on contact and leaves the ground burning.",
  flavor: "It is in no hurry. It knows you can't outrun it forever.",
  category: "spell",
  tags: ["projectile", "fire", "area", "burn"],
  costs: [{ resource: "mana", amount: 16 }],
  cooldown: 4,
  targeting: "direction",
  range: 280,
  effects: [
    {
      kind: "projectile",
      projectile: {
        damage: { base: 2.2, scale: "spell", type: "fire" },
        speed: 160,
        radius: 12,
        life: 2,
        behavior: "lob",
        onExpire: [
          { kind: "damage", damage: { base: 1.6, scale: "spell", type: "fire", channel: "direct" }, to: "enemies" },
          { kind: "zone", zone: { radius: 80, duration: 4, tickInterval: 0.5, follows: false, mergeable: true, damage: { base: 0.4, scale: "spell", type: "fire", channel: "periodic" }, status: { id: "burn", chance: 1 } } },
        ],
      },
    },
  ],
};

export const MAGICIAN_PRISM_LANCE: Ability = {
  id: "magician.prism_lance",
  classId: "magician",
  name: "Prism Lance",
  description: "A piercing beam that shifts element every time it passes through a body.",
  flavor: "Fire, then frost, then something the target has no name for.",
  category: "spell",
  tags: ["beam", "line", "arcane", "resourceSpender"],
  costs: [{ resource: "mana", amount: 22 }],
  cooldown: 6,
  castTime: 0.3,
  targeting: "line",
  range: 320,
  shape: { width: 24, length: 320 },
  effects: [
    { kind: "damage", damage: { base: 2.6, scale: "spell", type: "arcane", canCrit: true, inflict: { status: "shock", chance: 0.4 } }, to: "allTargets" },
  ],
  mutationHooks: [
    { id: "prism_lance.element", kind: "damagePacket", note: "Elementalist rotates the beam through its element cycle." },
    { id: "prism_lance.reach", kind: "targeting", note: "Reality Bender can split its origin (Paradox)." },
  ],
};

export const MAGICIAN_GRAVITY_WELL: Ability = {
  id: "magician.gravity_well",
  classId: "magician",
  name: "Gravity Well",
  description: "A pit of collapsing space that hauls everything toward its centre and holds it there.",
  flavor: "Down is wherever the Magician decides it is.",
  category: "spell",
  tags: ["zone", "arcane", "crowdControl"],
  costs: [{ resource: "mana", amount: 20 }],
  cooldown: 12,
  targeting: "point",
  range: 260,
  effects: [
    { kind: "pull", force: 160, to: "allTargets" },
    { kind: "zone", zone: { radius: 100, duration: 4, tickInterval: 0.5, follows: false, mergeable: false, damage: { base: 0.35, scale: "spell", type: "void", channel: "periodic" }, status: { id: "rooted", chance: 0.5 } } },
  ],
  mutationHooks: [{ id: "gravity_well.element", kind: "zone", note: "Elemental Rift makes the well inherit the last spell's element." }],
};

export const MAGICIAN_MIRROR_IMAGE: Ability = {
  id: "magician.mirror_image",
  classId: "magician",
  name: "Mirror Image",
  description: "Two dim copies of yourself that cast weakened versions of your spells for a while.",
  flavor: "Which one is real is not a useful question.",
  category: "summon",
  tags: ["summon", "illusion", "arcane"],
  costs: [{ resource: "mana", amount: 25 }],
  cooldown: 20,
  targeting: "self",
  effects: [
    { kind: "summon", unit: "mirror_image", count: 2, duration: 10, command: { behavior: "aggroNearest", inheritPower: 0.45 } },
  ],
  mutationHooks: [{ id: "mirror_image.count", kind: "summon", note: "Reality Bender adds a third image and lets them teleport." }],
};

export const MAGICIAN_ARCANE_ROULETTE: Ability = {
  id: "magician.arcane_roulette",
  classId: "magician",
  name: "Arcane Roulette",
  description: "Spin the wheel: one of several powerful spells fires, and you don't get to pick which.",
  flavor: "Statistically, most of the outcomes are good for you.",
  category: "spell",
  tags: ["arcane", "area"],
  costs: [{ resource: "mana", amount: 18 }],
  cooldown: 8,
  targeting: "radius",
  range: 300,
  shape: { radius: 90 },
  effects: [
    {
      kind: "random",
      choices: [
        { weight: 3, effects: [{ kind: "damage", damage: { base: 3.5, scale: "spell", type: "fire", canCrit: true }, to: "enemies" }, { kind: "status", status: "burn", chance: 1, stacks: 2, to: "enemies" }] },
        { weight: 3, effects: [{ kind: "damage", damage: { base: 3, scale: "spell", type: "cold", canCrit: true }, to: "enemies" }, { kind: "status", status: "freeze", chance: 0.8, to: "enemies" }] },
        { weight: 3, effects: [{ kind: "damage", damage: { base: 2.6, scale: "spell", type: "lightning", canCrit: true }, to: "enemies" }, { kind: "status", status: "shock", chance: 1, to: "enemies" }] },
        { weight: 2, effects: [{ kind: "damage", damage: { base: 5, scale: "spell", type: "void", canCrit: true, executeMissingHealth: 0.2 }, to: "enemies" }] },
        { weight: 1, effects: [{ kind: "heal", amount: 0.4, scale: "spell", to: "self" }, { kind: "resource", resource: "overcharge", delta: 40, to: "self" }] },
      ],
    },
  ],
  mutationHooks: [{ id: "arcane_roulette.table", kind: "replaceEffect", note: "Mad-science nodes weight the wheel toward the bigger outcomes." }],
};

export const MAGICIAN_MANA_BURN: Ability = {
  id: "magician.mana_burn",
  classId: "magician",
  name: "Mana Burn",
  description: "Dump everything you have into a cone of raw magic — the fuller the bar, the wider the blast.",
  flavor: "Efficiency is a virtue for people with time.",
  category: "spell",
  tags: ["cone", "arcane", "resourceSpender"],
  costs: [{ resource: "mana", amount: 45 }],
  cooldown: 10,
  targeting: "cone",
  range: 200,
  shape: { length: 200, arc: Math.PI * 0.7 },
  effects: [
    { kind: "damage", damage: { base: 4.5, scale: "spell", type: "arcane", canCrit: true }, to: "allTargets" },
    { kind: "status", status: "exposed", chance: 1, to: "allTargets" },
  ],
  mutationHooks: [{ id: "mana_burn.cost", kind: "resource", note: "Arcane Overload lets it fire off health when the bar is empty." }],
};

export const MAGICIAN_SPELLWEAVE: Ability = {
  id: "magician.spellweave",
  classId: "magician",
  name: "Spellweave",
  description: "Enter a weaving state: for a few seconds each spell you cast lends a property to the next.",
  flavor: "A sentence, not a list.",
  category: "utility",
  tags: ["arcane", "resourceGenerator"],
  cooldown: 14,
  targeting: "self",
  effects: [
    { kind: "status", status: "weave", to: "self", stacks: 2, chance: 1 },
    { kind: "resource", resource: "overcharge", delta: 20, to: "self" },
  ],
  mutationHooks: [{ id: "spellweave.rule", kind: "trigger", note: "Grand Arcanist grants a free fourth spell while weaving." }],
};

export const MAGICIAN_AETHER_STEP: Ability = {
  id: "magician.aether_step",
  classId: "magician",
  name: "Aether Step",
  description: "Blink a short distance and leave an unstable sigil where you were standing.",
  flavor: "You were never really there.",
  category: "movement",
  tags: ["teleport", "movement", "arcane", "zone"],
  costs: [{ resource: "mana", amount: 12 }],
  cooldown: 6,
  targeting: "point",
  range: 200,
  effects: [
    { kind: "move", style: "blink", leaveAnchor: true, iframes: 0.3 },
    { kind: "zone", zone: { radius: 70, duration: 5, tickInterval: 0.5, follows: false, mergeable: true, damage: { base: 0.5, scale: "spell", type: "arcane", channel: "periodic" }, status: { id: "unstable", chance: 1 } } },
  ],
  mutationHooks: [{ id: "aether_step.anchor", kind: "movement", note: "Paradox: the anchor becomes a second cast origin for later spells." }],
};

export const MAGICIAN_ASTRAL_COLLAPSE: Ability = {
  id: "magician.astral_collapse",
  classId: "magician",
  name: "Astral Collapse",
  description: "Open a rift overhead and walk a bombardment of arcane meteors across the whole floor.",
  flavor: "The sky is a resource like any other.",
  category: "ultimate",
  tags: ["ultimate", "arcane", "area"],
  cooldown: 0,
  isUltimate: true,
  targeting: "radius",
  range: 500,
  shape: { radius: 400 },
  effects: [
    { kind: "fx", fx: "astral_marker" },
    { kind: "delay", seconds: 0.4, effects: [{ kind: "damage", damage: { base: 3, scale: "spell", type: "arcane", canCrit: true }, to: "enemies" }] },
    { kind: "delay", seconds: 0.9, effects: [{ kind: "damage", damage: { base: 3, scale: "spell", type: "arcane", canCrit: true }, to: "enemies" }] },
    { kind: "delay", seconds: 1.5, effects: [{ kind: "damage", damage: { base: 3.5, scale: "spell", type: "arcane", canCrit: true }, to: "enemies" }, { kind: "status", status: "exposed", chance: 1, to: "enemies" }] },
    { kind: "delay", seconds: 2.2, effects: [{ kind: "zone", zone: { radius: 120, duration: 4, tickInterval: 0.5, follows: false, mergeable: true, damage: { base: 0.5, scale: "spell", type: "fire", channel: "periodic" }, status: { id: "burn", chance: 1 } } }] },
  ],
  mutationHooks: [{ id: "astral_collapse.rift", kind: "followUp", note: "Singularity leaves a persistent gravity well where the bombardment lands." }],
};

export const MAGICIAN_ABILITIES: readonly Ability[] = [
  MAGICIAN_ARC_SPARK,
  MAGICIAN_EMBER_ORB,
  MAGICIAN_PRISM_LANCE,
  MAGICIAN_GRAVITY_WELL,
  MAGICIAN_MIRROR_IMAGE,
  MAGICIAN_ARCANE_ROULETTE,
  MAGICIAN_MANA_BURN,
  MAGICIAN_SPELLWEAVE,
  MAGICIAN_AETHER_STEP,
  MAGICIAN_ASTRAL_COLLAPSE,
];

// --- the tree -----------------------------------------------------

export const MAGICIAN_PROGRESSION: ClassProgression = {
  classId: "magician",
  paths: [
    // 0 — Archmage: spell variety and sequencing.
    {
      name: "Archmage",
      blurb: "Casting many different spells in a row is itself the payoff.",
      nodes: [
        { name: "Broad Study", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.08, cooldownRate: 0.08 } }] },
        {
          name: "Second Nature",
          category: "behavior",
          effects: [
            {
              kind: "grantEffect",
              on: { event: "skillUse" },
              effects: [{ kind: "status", status: "weave", to: "self", chance: 1 }],
              note: "Casting anything nudges the weave along.",
            },
          ],
        },
        {
          name: "Mana Discipline",
          category: "resource",
          effects: [
            {
              kind: "resourceRule",
              resource: "mana",
              patch: { regenPerSec: 12, addGeneration: [{ on: "skillUse", amount: 4 }] },
            },
          ],
        },
        {
          name: "Chain Cast",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "archmage.chain_cast",
                label: "spells recover as a set",
                target: { withTag: "arcane" },
                ops: [{ kind: "cooldown", scale: 0.85 }],
              },
            },
          ],
        },
        {
          name: "Grand Arcanist",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "magician.archmage.grand_arcanist", note: "Three different spells in a row unlock a free enhanced fourth." },
            {
              kind: "grantEffect",
              on: { event: "skillUse" },
              effects: [{ kind: "resource", resource: "overcharge", delta: 6, to: "self" }],
            },
          ],
        },
      ],
    },

    // 1 — Elementalist: element combinations and reactions.
    {
      name: "Elementalist",
      blurb: "Fire, frost and lightning are not three spells — they are one reaction waiting to happen.",
      nodes: [
        { name: "Attunement", category: "foundation", effects: [{ kind: "mods", mods: { elementalDamage: 0.12, fireDamage: 0.05, coldDamage: 0.05, lightningDamage: 0.05 } }] },
        {
          name: "Conduction",
          category: "behavior",
          effects: [
            {
              kind: "grantEffect",
              on: { tag: "lightning" },
              effects: [{ kind: "status", status: "shock", chance: 0.5, to: "allTargets" }],
            },
          ],
        },
        {
          name: "Resonance",
          category: "resource",
          effects: [
            {
              kind: "resourceRule",
              resource: "overcharge",
              patch: { addGeneration: [{ on: "ailmentInflicted", amount: 5 }] },
            },
          ],
        },
        {
          name: "Element Shift",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "elementalist.element_shift",
                label: "Prism Lance rotates its element",
                target: { abilityId: "magician.prism_lance" },
                ops: [
                  { kind: "damagePacket", scaleBase: 1.1, setInflict: { status: "chill", chance: 0.6 } },
                  { kind: "addTags", tags: ["fire", "frost"] },
                ],
              },
            },
          ],
        },
        {
          name: "Prismatic Mastery",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "magician.elementalist.prismatic_mastery" },
            {
              kind: "grantEffect",
              on: { tag: "arcane" },
              effects: [{ kind: "status", status: "exposed", chance: 1, to: "allTargets" }],
            },
          ],
        },
      ],
    },

    // 2 — Mana Tyrant: aggressive Mana expenditure.
    {
      name: "Mana Tyrant",
      blurb: "The bar is meant to be empty. A full mana bar is wasted potential.",
      nodes: [
        { name: "Big Spender", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.1 } }] },
        {
          name: "Overdraw",
          category: "behavior",
          effects: [
            {
              kind: "resourceRule",
              resource: "overcharge",
              patch: { addThresholds: [{ at: 40, whileAbove: { skillDamage: 0.12 } }] },
            },
          ],
        },
        {
          name: "Fuel Line",
          category: "resource",
          effects: [
            {
              kind: "resourceRule",
              resource: "overcharge",
              patch: { decayPerSec: 4, addGeneration: [{ on: "manaSpent", amount: 40, perUnit: "manaFraction" }] },
            },
          ],
        },
        {
          name: "Empty Hands",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "tyrant.empty_hands",
                label: "big spells hit harder the emptier the bar",
                target: { withTag: "resourceSpender" },
                ops: [{ kind: "damagePacket", scaleBase: 1.15 }],
              },
            },
          ],
        },
        {
          name: "Arcane Overload",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "magician.tyrant.arcane_overload" },
            {
              kind: "mutate",
              mutation: {
                id: "tyrant.arcane_overload",
                label: "empty-bar casts spend health",
                target: { withTag: "resourceSpender" },
                ops: [
                  { kind: "damagePacket", scaleBase: 1.25 },
                  { kind: "resource", addGenerates: { resource: "overcharge", amount: 8 } },
                ],
              },
            },
          ],
        },
      ],
    },

    // 3 — Reality Bender: gravity, clones, teleportation, battlefield manipulation.
    {
      name: "Reality Bender",
      blurb: "Position is a suggestion. So is causality, if you invest enough.",
      nodes: [
        { name: "Displacement", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.06, cooldownRate: 0.06 } }] },
        {
          name: "Recorded Position",
          category: "behavior",
          effects: [{ kind: "rule", rule: "magician.bender.recorded_position", note: "Teleports leave a temporal anchor for a few seconds." }],
        },
        {
          name: "Spatial Reserve",
          category: "resource",
          effects: [
            {
              kind: "resourceRule",
              resource: "mana",
              patch: { addGeneration: [{ on: "dashStart", amount: 8 }] },
            },
          ],
        },
        {
          name: "Split Origin",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "bender.split_origin",
                label: "line spells fire from the anchor too",
                target: { withTag: "line" },
                ops: [
                  { kind: "targeting", scaleLength: 1.2 },
                  { kind: "addEffect", at: "end", effects: [{ kind: "fx", fx: "echo_origin" }] },
                ],
              },
            },
          ],
        },
        {
          name: "Paradox",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "magician.bender.paradox" },
            {
              kind: "mutate",
              mutation: {
                id: "bender.paradox",
                label: "Aether Step → Paradox",
                target: { abilityId: "magician.aether_step" },
                ops: [
                  {
                    kind: "followUp",
                    window: 5,
                    effects: [{ kind: "damage", damage: { base: 1.5, scale: "spell", type: "arcane" }, to: "enemies" }],
                  },
                  { kind: "addTags", tags: ["time"] },
                ],
              },
            },
          ],
        },
      ],
    },

    // 4 — Glass Cannon: extreme risk / reward.
    {
      name: "Glass Cannon",
      blurb: "Every point of health you are willing to risk is damage you get to keep.",
      nodes: [
        { name: "Thin Skin", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.16, healthPercent: -0.1 } }] },
        {
          name: "Adrenaline",
          category: "behavior",
          effects: [{ kind: "rule", rule: "magician.glass.adrenaline", note: "Low health flips a cast-speed / regen rule." }],
        },
        {
          name: "Life as Fuel",
          category: "resource",
          effects: [
            {
              kind: "resourceRule",
              resource: "mana",
              patch: { addGeneration: [{ on: "damageTaken", amount: 25, perUnit: "maxHealthFraction" }] },
            },
          ],
        },
        {
          name: "Overclocked",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "glass.overclocked",
                label: "spells crit harder",
                target: { withTag: "arcane" },
                ops: [{ kind: "damagePacket", scaleBase: 1.1 }],
              },
            },
          ],
        },
        {
          name: "Mortal Genius",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "magician.glass.mortal_genius", note: "High Mana + low health massively amplifies spell damage." },
            {
              kind: "resourceRule",
              resource: "overcharge",
              patch: { addThresholds: [{ at: 90, whileAbove: { skillDamage: 0.4, elementalDamage: 0.25 } }] },
            },
          ],
        },
      ],
    },
  ],
};

// --- hybrids + archetype ----------------------------------------

export const MAGICIAN_UNLOCKS: readonly PathUnlockDef[] = [
  {
    id: "magician.prismatic_cascade",
    classId: "magician",
    tier: "hybrid",
    name: "Prismatic Cascade",
    description: "Casting three different elements in quick succession triggers a fourth, hybrid detonation for free.",
    flavor: "The reaction was always going to happen. You just chose when.",
    requires: [
      { path: "Archmage", points: 3 },
      { path: "Elementalist", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "magician.hybrid.prismatic_cascade" },
      {
        kind: "grantEffect",
        on: { event: "skillUse" },
        effects: [{ kind: "damage", damage: { base: 1.4, scale: "spell", type: "arcane", channel: "direct" }, to: "enemies" }],
      },
    ],
    ui: { badge: "PRC" },
  },
  {
    id: "magician.overcast",
    classId: "magician",
    tier: "hybrid",
    name: "Overcast",
    description: "Overcharge thresholds also govern how much health a spell will spend and how hard it hits.",
    flavor: "The meter goes to eleven. So does the bill.",
    requires: [
      { path: "Archmage", points: 3 },
      { path: "Mana Tyrant", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "magician.hybrid.overcast" },
      {
        kind: "resourceRule",
        resource: "overcharge",
        patch: { max: 130, addThresholds: [{ at: 110, whileAbove: { skillDamage: 0.25 } }] },
      },
    ],
    ui: { badge: "OVC" },
  },
  {
    id: "magician.elemental_rift",
    classId: "magician",
    tier: "hybrid",
    name: "Elemental Rift",
    description: "Gravity Well inherits the element of the last spell you cast, dragging enemies into a themed pit.",
    flavor: "Down, and also on fire.",
    requires: [
      { path: "Elementalist", points: 3 },
      { path: "Reality Bender", points: 3 },
    ],
    effects: [{ kind: "rule", rule: "magician.hybrid.elemental_rift" }],
    mutations: [
      {
        id: "elemental_rift.well",
        label: "Gravity Well takes on an element",
        target: { abilityId: "magician.gravity_well" },
        ops: [
          { kind: "zone", scaleDamage: 1.4, setStatus: { id: "burn", chance: 0.8 } },
          { kind: "addTags", tags: ["fire"] },
        ],
      },
    ],
    ui: { badge: "ERF" },
  },
  {
    id: "magician.forbidden_spell",
    classId: "magician",
    tier: "hybrid",
    name: "Forbidden Spell",
    description: "With the bar empty, your biggest spells cast off health for a huge power spike instead of failing.",
    flavor: "There is always more mana. It is just kept somewhere less convenient.",
    requires: [
      { path: "Mana Tyrant", points: 3 },
      { path: "Glass Cannon", points: 3 },
    ],
    effects: [{ kind: "rule", rule: "magician.hybrid.forbidden_spell" }],
    mutations: [
      {
        id: "forbidden_spell.cast",
        label: "spenders spend health at the bottom",
        target: { withTag: "resourceSpender" },
        ops: [{ kind: "damagePacket", scaleBase: 1.35 }],
      },
    ],
    ui: { badge: "FBD" },
  },
  {
    id: "magician.schrodinger",
    classId: "magician",
    tier: "hybrid",
    name: "Schrodinger",
    description: "Teleporting through an enemy leaves you briefly intangible — untouchable, but unable to be healed.",
    flavor: "Alive and not, until someone checks.",
    requires: [
      { path: "Reality Bender", points: 3 },
      { path: "Glass Cannon", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "magician.hybrid.schrodinger" },
      {
        kind: "grantEffect",
        on: { tag: "teleport" },
        effects: [{ kind: "status", status: "stealth", to: "self", chance: 1 }],
      },
    ],
    ui: { badge: "SCH" },
  },
  {
    id: "magician.spell_echo",
    classId: "magician",
    tier: "hybrid",
    name: "Spell Echo",
    description: "Spells can originate from a position you occupied moments ago, hitting from two angles at once.",
    flavor: "You cast it there. It also happened here.",
    requires: [
      { path: "Archmage", points: 3 },
      { path: "Reality Bender", points: 3 },
    ],
    effects: [{ kind: "rule", rule: "magician.hybrid.spell_echo" }],
    mutations: [
      {
        id: "spell_echo.origin",
        label: "spells echo from the anchor",
        target: { withTag: "arcane" },
        ops: [
          {
            kind: "addEffect",
            at: "end",
            effects: [{ kind: "damage", damage: { base: 0.5, scale: "spell", type: "arcane", channel: "direct" }, to: "enemies" }],
          },
        ],
      },
    ],
    ui: { badge: "ECH" },
  },
  {
    id: "magician.singularity",
    classId: "magician",
    tier: "mythic",
    name: "Singularity",
    description:
      "Astral Collapse ends by folding its impact site into a lasting singularity: a gravity well that drags, crushes, and cycles through every element while it stands.",
    flavor: "You didn't bombard the floor. You rewrote its centre of mass.",
    requires: [
      { path: "Elementalist", points: 4 },
      { path: "Reality Bender", points: 6 },
      { path: "Glass Cannon", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "magician.mythic.singularity" }],
    mutations: [
      {
        id: "singularity.astral_collapse",
        label: "Astral Collapse → Singularity",
        target: { abilityId: "magician.astral_collapse" },
        ops: [
          { kind: "damagePacket", scaleBase: 1.2 },
          {
            kind: "addEffect",
            at: "end",
            effects: [
              { kind: "pull", force: 200, to: "enemies" },
              {
                kind: "zone",
                zone: {
                  radius: 140,
                  duration: 10,
                  tickInterval: 0.4,
                  follows: false,
                  mergeable: false,
                  damage: { base: 0.7, scale: "spell", type: "void", channel: "periodic" },
                  status: { id: "exposed", chance: 1 },
                },
              },
            ],
          },
          { kind: "addTags", tags: ["zone", "time"] },
        ],
      },
    ],
    ui: { badge: "SNG" },
  },
];

// --- the assembled class ---------------------------------------

export const MAGICIAN: PilotClass = {
  classId: "magician",
  name: "Magician",
  fantasy: "High-risk ranged arcane artillery using Mana, Overcharge, spell combinations and reality manipulation.",
  role: "Long-range burst / AoE / boss DPS.",
  question: "How much can I bend the rules of spellcasting?",
  resources: MAGICIAN_RESOURCES,
  statuses: MAGICIAN_STATUSES,
  abilities: MAGICIAN_ABILITIES,
  progression: MAGICIAN_PROGRESSION,
  unlocks: MAGICIAN_UNLOCKS,
};
