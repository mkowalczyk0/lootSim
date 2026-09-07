/**
 * Stormcaller — a living storm.
 *
 * The pilot for: a **stance resource** — the Weather Phase (Rain / Wind / Thunder), a
 * `StanceSpec` that cycles, each state carrying its own mods and gating skill behaviour;
 * boomerang chakram projectiles; teleport-and-strike-both-ends (`temporalAnchor`); and
 * following damage zones (Raincaller, Eye of the Tempest).
 *
 * Question: how can I weaponize weather and movement?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec, StanceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ----------------------------------------------------------

/** Storm Charge — built by landing lightning, spent to chain and to hold the Eye open. */
export const STORMCALLER_STORM_CHARGE: ResourceSpec = {
  id: "storm_charge",
  label: "Storm Charge",
  max: 100,
  start: "empty",
  ui: "bar",
  decayPerSec: 5,
  decayDelay: 3,
  generation: [
    { on: "hitDealt", amount: 3, requireTags: ["lightning"] },
    { on: "ailmentInflicted", amount: 4, requireTags: ["lightning"] },
    { on: "move", amount: 0.3, perUnit: "distance" },
  ],
  thresholds: [{ at: 60, whileAbove: { lightningDamage: 0.15, ultimateBounces: 1 } }],
};

export const STORMCALLER_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Tempest",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "hitDealt", amount: 1.2, requireTags: ["lightning"] },
    { on: "ailmentInflicted", amount: 2, requireTags: ["lightning"] },
  ],
};

export const STORMCALLER_RESOURCES: readonly ResourceSpec[] = [
  STORMCALLER_STORM_CHARGE,
  STORMCALLER_ULTIMATE_METER,
];

// --- the Weather Phase stance --------------------------------------

/**
 * Rain / Wind / Thunder. Weather Shift walks this ring; each state is a different
 * Stormcaller. Nodes and hybrids gate behaviour on the current state.
 */
export const STORMCALLER_WEATHER: StanceSpec = {
  id: "weather",
  label: "Weather Phase",
  states: ["rain", "wind", "thunder"],
  start: 0,
  ui: "phase",
  stateMods: {
    rain: { manaRegen: 3, healthPercent: 0.06, poisonResist: 0.1 },
    wind: { moveSpeed: 0.18, projectileDamage: 0.12 },
    thunder: { lightningDamage: 0.22, critChance: 0.08 },
  },
};

export const STORMCALLER_STANCES: readonly StanceSpec[] = [STORMCALLER_WEATHER];

// --- statuses -----------------------------------------------------

/** Soaked — Rain's rider: wet enemies take more lightning and can't shrug off shock as fast. */
export const STATUS_SOAKED = {
  id: "soaked",
  label: "Soaked",
  glyph: "~",
  category: "debuff",
  tags: ["frost", "lightning", "vulnerable"],
  baseDuration: 5,
  maxStacks: 1,
  refreshRule: "refresh",
  amplify: 1.12,
  slow: 0.9,
} as const satisfies StatusSpec;

/** Static — the Stormcaller's stacking lightning charge on a target; Tempest Chain jumps between them. */
export const STATUS_STATIC = {
  id: "static",
  label: "Static",
  glyph: "z",
  category: "debuff",
  tags: ["lightning"],
  baseDuration: 4,
  maxStacks: 4,
  refreshRule: "stack",
  amplify: 1.05,
} as const satisfies StatusSpec;

export const STORMCALLER_STATUSES: readonly StatusSpec[] = [STATUS_SOAKED, STATUS_STATIC];

// --- abilities (9 + 1) ------------------------------------------

export const STORMCALLER_STATIC_DISC: Ability = {
  id: "stormcaller.static_disc",
  classId: "stormcaller",
  name: "Static Disc",
  description: "Hurl a chakram that arcs out and back, dragging a crackling field along its path.",
  flavor: "It always comes back. That is the etiquette of a chakram.",
  category: "attack",
  tags: ["projectile", "lightning"],
  cooldown: 2,
  targeting: "direction",
  range: 300,
  effects: [
    {
      kind: "projectile",
      projectile: {
        damage: { base: 1.4, scale: "attack", type: "lightning", canCrit: true, inflict: { status: "static", chance: 0.6 } },
        speed: 380,
        radius: 10,
        life: 1.6,
        pierce: 3,
        behavior: "boomerang",
        onExpire: [{ kind: "zone", zone: { radius: 70, duration: 3, tickInterval: 0.4, follows: false, mergeable: true, damage: { base: 0.3, scale: "attack", type: "lightning", channel: "periodic" }, status: { id: "static", chance: 0.5 } } }],
      },
    },
  ],
  mutationHooks: [{ id: "static_disc.chakram", kind: "projectile", note: "Stormblade path adds discs and turns the return into a tornado." }],
};

export const STORMCALLER_THUNDERSTEP: Ability = {
  id: "stormcaller.thunderstep",
  classId: "stormcaller",
  name: "Thunderstep",
  description: "Teleport a short way and detonate lightning at both the point you left and the point you arrive.",
  flavor: "Two places at once, briefly, loudly.",
  category: "movement",
  tags: ["teleport", "movement", "lightning"],
  costs: [{ resource: "storm_charge", amount: 15 }],
  cooldown: 6,
  targeting: "point",
  range: 220,
  effects: [
    { kind: "damage", damage: { base: 1.6, scale: "attack", type: "lightning", canCrit: true }, to: "enemies" },
    { kind: "move", style: "teleport", leaveAnchor: true, iframes: 0.3 },
    { kind: "damage", damage: { base: 1.6, scale: "attack", type: "lightning", canCrit: true, inflict: { status: "shock", chance: 0.6 } }, to: "enemies" },
  ],
  mutationHooks: [{ id: "thunderstep.origin", kind: "movement", note: "Windrunner leaves both nodes hot for a follow-up strike." }],
};

export const STORMCALLER_GALE_RING: Ability = {
  id: "stormcaller.gale_ring",
  classId: "stormcaller",
  name: "Gale Ring",
  description: "A ring of wind spins around you, batting away projectiles and shoving melee attackers back.",
  flavor: "The weather has a personal space now.",
  category: "support",
  tags: ["aura", "barrier", "crowdControl"],
  cooldown: 14,
  targeting: "self",
  shape: { radius: 110 },
  effects: [
    { kind: "zone", zone: { radius: 110, duration: 5, tickInterval: 0.5, follows: true, mergeable: false, damage: { base: 0.2, scale: "attack", type: "lightning", channel: "periodic" } } },
    { kind: "knockback", force: 80, to: "enemies" },
    { kind: "shield", amount: 0.6, scale: "attack", to: "self", duration: 5 },
  ],
};

export const STORMCALLER_RAINCALLER: Ability = {
  id: "stormcaller.raincaller",
  classId: "stormcaller",
  name: "Raincaller",
  description: "Summon a low storm cloud that drifts after your enemies, soaking everything it passes over.",
  flavor: "Bring an umbrella. It won't help.",
  category: "spell",
  tags: ["zone", "weather", "frost"],
  costs: [{ resource: "storm_charge", amount: 20 }],
  cooldown: 12,
  targeting: "point",
  range: 280,
  effects: [
    { kind: "zone", zone: { radius: 100, duration: 8, tickInterval: 0.6, follows: true, mergeable: true, damage: { base: 0.35, scale: "spell", type: "cold", channel: "periodic" }, status: { id: "soaked", chance: 1 } } },
  ],
};

export const STORMCALLER_TEMPEST_CHAIN: Ability = {
  id: "stormcaller.tempest_chain",
  classId: "stormcaller",
  name: "Tempest Chain",
  description: "A bolt that leaps from enemy to enemy, jumping further and hitting harder the more Static is in the air.",
  flavor: "It is looking for the shortest path to the ground. You are all in the way.",
  category: "spell",
  tags: ["lightning", "projectile", "beam"],
  costs: [{ resource: "storm_charge", amount: 12 }],
  cooldown: 5,
  targeting: "enemy",
  range: 320,
  effects: [
    {
      kind: "projectile",
      projectile: {
        damage: { base: 1.8, scale: "spell", type: "lightning", canCrit: true, inflict: { status: "static", chance: 0.8 } },
        speed: 900,
        radius: 8,
        life: 0.8,
        pierce: 6,
        behavior: "homing",
      },
    },
  ],
  mutationHooks: [{ id: "tempest_chain.bounces", kind: "projectile", note: "Thunder God adds bounces per Static stack." }],
};

export const STORMCALLER_CYCLONE_BLADE: Ability = {
  id: "stormcaller.cyclone_blade",
  classId: "stormcaller",
  name: "Cyclone Blade",
  description: "Throw a chakram that plants itself and kicks up a wandering tornado.",
  flavor: "You meant to catch it. It had other plans.",
  category: "attack",
  tags: ["projectile", "zone", "weather"],
  costs: [{ resource: "storm_charge", amount: 22 }],
  cooldown: 13,
  targeting: "direction",
  range: 260,
  effects: [
    {
      kind: "projectile",
      projectile: {
        damage: { base: 1.5, scale: "attack", type: "lightning", canCrit: true },
        speed: 300,
        radius: 10,
        life: 1,
        onExpire: [
          { kind: "zone", zone: { radius: 80, duration: 6, tickInterval: 0.3, follows: true, mergeable: false, damage: { base: 0.4, scale: "attack", type: "lightning", channel: "periodic" } } },
          { kind: "pull", force: 60, to: "enemies" },
        ],
      },
    },
  ],
};

export const STORMCALLER_BALL_LIGHTNING: Ability = {
  id: "stormcaller.ball_lightning",
  classId: "stormcaller",
  name: "Ball Lightning",
  description: "A slow sphere of contained lightning that drifts toward the nearest enemy and shocks everything it grazes.",
  flavor: "Do not touch. Do not let it touch you. Do not look away.",
  category: "spell",
  tags: ["projectile", "lightning"],
  costs: [{ resource: "storm_charge", amount: 18 }],
  cooldown: 9,
  targeting: "direction",
  range: 240,
  effects: [
    {
      kind: "projectile",
      projectile: {
        damage: { base: 0.6, scale: "spell", type: "lightning", inflict: { status: "shock", chance: 0.5 } },
        speed: 90,
        radius: 22,
        life: 5,
        pierce: 99,
        behavior: "homing",
      },
    },
  ],
};

export const STORMCALLER_EYE_OF_THE_STORM: Ability = {
  id: "stormcaller.eye_of_the_storm",
  classId: "stormcaller",
  name: "Eye of the Storm",
  description: "Drop a calm eye at your feet. Inside it you are safe and slow; outside it your attacks hit far harder.",
  flavor: "Peace in the middle. Everywhere else, consequences.",
  category: "support",
  tags: ["zone", "weather", "aura"],
  cooldown: 20,
  targeting: "point",
  range: 160,
  effects: [
    { kind: "zone", zone: { radius: 90, duration: 12, tickInterval: 1, follows: false, mergeable: false, benefit: "shield" } },
    { kind: "zone", zone: { radius: 260, duration: 12, tickInterval: 1, follows: false, mergeable: false, damage: { base: 0.15, scale: "spell", type: "lightning", channel: "periodic" }, status: { id: "static", chance: 0.3 } } },
  ],
  mutationHooks: [{ id: "eye_of_the_storm.eye", kind: "zone", note: "Eye path lets the eye follow you and buffs attacks made outside it." }],
};

export const STORMCALLER_WEATHER_SHIFT: Ability = {
  id: "stormcaller.weather_shift",
  classId: "stormcaller",
  name: "Weather Shift",
  description: "Turn the sky over: cycle the Weather Phase from Rain to Wind to Thunder and back.",
  flavor: "A forecast is just a decision you haven't announced yet.",
  category: "utility",
  tags: ["weather", "resourceGenerator"],
  cooldown: 4,
  targeting: "self",
  effects: [
    { kind: "stance", stance: "weather", op: "cycle", steps: 1 },
    { kind: "resource", resource: "storm_charge", delta: 10, to: "self" },
  ],
  mutationHooks: [{ id: "weather_shift.phase", kind: "trigger", note: "Tempest path fires a phase-appropriate burst on every shift." }],
};

export const STORMCALLER_EYE_OF_THE_TEMPEST: Ability = {
  id: "stormcaller.eye_of_the_tempest",
  classId: "stormcaller",
  name: "Eye of the Tempest",
  description: "Become the storm: a mobile eye of calm at your feet, wrapped in a vast wall of lightning and wind that moves with you.",
  flavor: "For a while, the weather report is just your position.",
  category: "ultimate",
  tags: ["ultimate", "weather", "zone", "lightning"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  effects: [
    { kind: "zone", zone: { radius: 240, duration: 8, tickInterval: 0.3, follows: true, mergeable: false, damage: { base: 0.8, scale: "spell", type: "lightning", channel: "periodic" }, status: { id: "shock", chance: 0.4 } } },
    { kind: "zone", zone: { radius: 70, duration: 8, tickInterval: 1, follows: true, mergeable: false, benefit: "shield" } },
    { kind: "status", status: "static", chance: 1, stacks: 3, to: "enemies" },
    { kind: "knockback", force: 60, to: "enemies" },
  ],
  mutationHooks: [{ id: "eye_of_the_tempest.storm", kind: "zone", note: "Stormlord runs all three weathers through the storm wall at once." }],
};

export const STORMCALLER_ABILITIES: readonly Ability[] = [
  STORMCALLER_STATIC_DISC,
  STORMCALLER_THUNDERSTEP,
  STORMCALLER_GALE_RING,
  STORMCALLER_RAINCALLER,
  STORMCALLER_TEMPEST_CHAIN,
  STORMCALLER_CYCLONE_BLADE,
  STORMCALLER_BALL_LIGHTNING,
  STORMCALLER_EYE_OF_THE_STORM,
  STORMCALLER_WEATHER_SHIFT,
  STORMCALLER_EYE_OF_THE_TEMPEST,
];

// --- the tree ---------------------------------------------------

export const STORMCALLER_PROGRESSION: ClassProgression = {
  classId: "stormcaller",
  paths: [
    // 0 — Thunder God: lightning amplification.
    {
      name: "Thunder God",
      blurb: "Every bolt should touch as many bodies as physically possible.",
      nodes: [
        { name: "Charged Air", category: "foundation", effects: [{ kind: "mods", mods: { lightningDamage: 0.14, ultimateBounces: 1 } }] },
        {
          name: "Arc Everything",
          category: "behavior",
          effects: [
            {
              kind: "grantEffect",
              on: { tag: "lightning" },
              effects: [{ kind: "status", status: "static", chance: 0.5, to: "allTargets" }],
            },
          ],
        },
        {
          name: "Capacitor",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "storm_charge", patch: { addGeneration: [{ on: "crit", amount: 5 }] } },
          ],
        },
        {
          name: "Forked",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "thundergod.forked",
                label: "chains jump further, per Static",
                target: { withTag: "lightning" },
                ops: [{ kind: "projectile", addPierce: 3, addCount: 1 }],
              },
            },
          ],
        },
        {
          name: "Chain Reaction",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "stormcaller.thundergod.chain_reaction" },
            {
              kind: "grantEffect",
              on: { event: "enemyDeath" },
              effects: [{ kind: "damage", damage: { base: 1.2, scale: "spell", type: "lightning", channel: "execute" }, to: "enemies" }],
            },
          ],
        },
      ],
    },

    // 1 — Tempest: weather states.
    {
      name: "Tempest",
      blurb: "Rain, Wind and Thunder are three characters. Learn to switch cleanly.",
      nodes: [
        { name: "Meteorologist", category: "foundation", effects: [{ kind: "mods", mods: { elementalDamage: 0.1, cooldownRate: 0.06 } }] },
        {
          name: "Front Line",
          category: "behavior",
          effects: [{ kind: "rule", rule: "stormcaller.tempest.front_line", note: "Shifting weather leaves a burst of the phase you left." }],
        },
        {
          name: "Pressure System",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "storm_charge", patch: { addGeneration: [{ on: "skillUse", amount: 5, requireTags: ["weather"] }] } },
          ],
        },
        {
          name: "Squall",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "tempest.squall",
                label: "Weather Shift → Squall",
                target: { abilityId: "stormcaller.weather_shift" },
                ops: [
                  {
                    kind: "trigger",
                    event: "skillUse",
                    window: 0.2,
                    effects: [{ kind: "damage", damage: { base: 1.2, scale: "spell", type: "lightning", channel: "direct" }, to: "enemies" }],
                  },
                  { kind: "cooldown", scale: 0.75 },
                ],
              },
            },
          ],
        },
        {
          name: "Endless Storm",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "stormcaller.tempest.endless_storm" },
            {
              kind: "grantEffect",
              on: { event: "skillUse" },
              effects: [{ kind: "resource", resource: "storm_charge", delta: 3, to: "self" }],
            },
          ],
        },
      ],
    },

    // 2 — Stormblade: chakram combat.
    {
      name: "Stormblade",
      blurb: "The chakram is not a spell delivery system. It is the weapon.",
      nodes: [
        { name: "Bladehand", category: "foundation", effects: [{ kind: "mods", mods: { projectileDamage: 0.12, critChance: 0.05 } }] },
        {
          name: "Twin Discs",
          category: "behavior",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "stormblade.twin_discs",
                label: "chakrams throw in pairs",
                target: { abilityId: "stormcaller.static_disc" },
                ops: [{ kind: "projectile", addCount: 1, scaleSpeed: 1.1 }],
              },
            },
          ],
        },
        {
          name: "Whetstone",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "storm_charge", patch: { addGeneration: [{ on: "hitDealt", amount: 2, requireTags: ["projectile"] }] } },
          ],
        },
        {
          name: "Return Cut",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "stormblade.return_cut",
                label: "the disc's return leaves a tornado",
                target: { abilityId: "stormcaller.static_disc" },
                ops: [
                  { kind: "projectile", addOnExpire: [{ kind: "zone", zone: { radius: 60, duration: 4, tickInterval: 0.3, follows: true, mergeable: false, damage: { base: 0.3, scale: "attack", type: "lightning", channel: "periodic" } } }] },
                ],
              },
            },
          ],
        },
        {
          name: "Cyclone Warrior",
          category: "keystone",
          effects: [{ kind: "rule", rule: "stormcaller.stormblade.cyclone_warrior" }],
        },
      ],
    },

    // 3 — Windrunner: mobility.
    {
      name: "Windrunner",
      blurb: "Standing still is the one attack you never learn.",
      nodes: [
        { name: "Tailwind", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.12 } }] },
        {
          name: "Kiting",
          category: "behavior",
          effects: [
            {
              kind: "grantEffect",
              on: { tag: "movement" },
              effects: [{ kind: "status", status: "static", chance: 1, to: "enemies" }],
            },
          ],
        },
        {
          name: "Momentum Draft",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "storm_charge", patch: { addGeneration: [{ on: "move", amount: 0.5, perUnit: "distance" }] } },
          ],
        },
        {
          name: "Both Ends Hot",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "windrunner.both_ends_hot",
                label: "Thunderstep strikes twice more",
                target: { abilityId: "stormcaller.thunderstep" },
                ops: [
                  {
                    kind: "followUp",
                    window: 3,
                    effects: [{ kind: "damage", damage: { base: 1.4, scale: "attack", type: "lightning" }, to: "enemies" }],
                  },
                  { kind: "movement", addIframes: 0.1 },
                ],
              },
            },
          ],
        },
        {
          name: "Living Wind",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "stormcaller.windrunner.living_wind" },
            {
              kind: "resourceRule",
              resource: "storm_charge",
              patch: { addThresholds: [{ at: 80, whileAbove: { moveSpeed: 0.25, projectileDamage: 0.2 } }] },
            },
          ],
        },
      ],
    },

    // 4 — Eye: centered storm gameplay.
    {
      name: "Eye",
      blurb: "The safest place in a storm is the one you carry with you.",
      nodes: [
        { name: "Still Point", category: "foundation", effects: [{ kind: "mods", mods: { defensePercent: 0.1, wardPower: 0.1 } }] },
        {
          name: "Outer Bands",
          category: "behavior",
          effects: [{ kind: "rule", rule: "stormcaller.eye.outer_bands", note: "Attacks made outside your own eye zone are empowered." }],
        },
        {
          name: "Low Pressure",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "storm_charge", patch: { decayPerSec: 2, addGeneration: [{ on: "skillUse", amount: 3 }] } },
          ],
        },
        {
          name: "Travelling Eye",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "eye.travelling_eye",
                label: "Eye of the Storm follows you",
                target: { abilityId: "stormcaller.eye_of_the_storm" },
                ops: [
                  { kind: "zone", forceFollows: true, scaleDuration: 1.3 },
                ],
              },
            },
          ],
        },
        {
          name: "Eye of Eternity",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "stormcaller.eye.eye_of_eternity" },
            {
              kind: "grantEffect",
              on: { tag: "weather" },
              effects: [{ kind: "shield", amount: 0.5, scale: "spell", to: "self", duration: 4 }],
            },
          ],
        },
      ],
    },
  ],
};

// --- hybrids + archetype ------------------------------------------

export const STORMCALLER_UNLOCKS: readonly PathUnlockDef[] = [
  {
    id: "stormcaller.supercell",
    classId: "stormcaller",
    tier: "hybrid",
    name: "Supercell",
    description: "Thunder phase doesn't just buff lightning — while it holds, every lightning hit builds toward a free Tempest Chain.",
    flavor: "The cell is rotating. That is never a good sign for anyone under it.",
    requires: [
      { path: "Thunder God", points: 3 },
      { path: "Tempest", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "stormcaller.hybrid.supercell" },
      {
        kind: "resourceRule",
        resource: "storm_charge",
        patch: { addThresholds: [{ at: 90, whileAbove: { lightningDamage: 0.25, ultimateBounces: 2 } }] },
      },
    ],
    ui: { badge: "SPC" },
  },
  {
    id: "stormcaller.stormfront",
    classId: "stormcaller",
    tier: "hybrid",
    name: "Stormfront",
    description: "Moving during a weather shift carries the old phase's effect along your path as a lingering trail.",
    flavor: "You leave weather behind you like footprints.",
    requires: [
      { path: "Tempest", points: 3 },
      { path: "Windrunner", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "stormcaller.hybrid.stormfront" },
      {
        kind: "grantEffect",
        on: { tag: "weather" },
        effects: [{ kind: "zone", zone: { radius: 70, duration: 4, tickInterval: 0.5, follows: false, mergeable: true, damage: { base: 0.3, scale: "spell", type: "lightning", channel: "periodic" } } }],
      },
    ],
    ui: { badge: "SFR" },
  },
  {
    id: "stormcaller.cyclonic_step",
    classId: "stormcaller",
    tier: "hybrid",
    name: "Cyclonic Step",
    description: "Chakrams orbit you as you move and fling off toward enemies you dash past.",
    flavor: "Everything you throw comes back, and it brought friends.",
    requires: [
      { path: "Stormblade", points: 3 },
      { path: "Windrunner", points: 3 },
    ],
    effects: [{ kind: "rule", rule: "stormcaller.hybrid.cyclonic_step" }],
    mutations: [
      {
        id: "cyclonic_step.disc",
        label: "chakrams follow your movement",
        target: { withTag: "projectile" },
        ops: [
          { kind: "projectile", setBehavior: "orbit", scaleLife: 1.4 },
        ],
      },
    ],
    ui: { badge: "CYS" },
  },
  {
    id: "stormcaller.thunder_disc",
    classId: "stormcaller",
    tier: "hybrid",
    name: "Thunder Disc",
    description: "Chakrams carry Static and chain lightning between every body they pass through.",
    flavor: "A blade and a bolt, on one budget.",
    requires: [
      { path: "Thunder God", points: 3 },
      { path: "Stormblade", points: 3 },
    ],
    effects: [{ kind: "rule", rule: "stormcaller.hybrid.thunder_disc" }],
    mutations: [
      {
        id: "thunder_disc.disc",
        label: "chakrams chain",
        target: { abilityId: "stormcaller.static_disc" },
        ops: [
          { kind: "damagePacket", setInflict: { status: "static", chance: 1 } },
          { kind: "projectile", addPierce: 4 },
        ],
      },
    ],
    ui: { badge: "THD" },
  },
  {
    id: "stormcaller.perfect_storm",
    classId: "stormcaller",
    tier: "hybrid",
    name: "Perfect Storm",
    description: "Your eye zone counts as its own weather: everything inside it benefits from all three phases at reduced strength.",
    flavor: "Why choose?",
    requires: [
      { path: "Eye", points: 3 },
      { path: "Tempest", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "stormcaller.hybrid.perfect_storm" },
      {
        kind: "grantEffect",
        on: { tag: "weather" },
        effects: [{ kind: "shield", amount: 0.4, scale: "spell", to: "allies", duration: 3 }],
      },
    ],
    ui: { badge: "PST" },
  },
  {
    id: "stormcaller.calm_before",
    classId: "stormcaller",
    tier: "hybrid",
    name: "Calm Before",
    description: "Leaving your eye zone releases the calm you stored as a burst of speed and a shockwave.",
    flavor: "The quiet was loaded the whole time.",
    requires: [
      { path: "Eye", points: 3 },
      { path: "Windrunner", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "stormcaller.hybrid.calm_before" },
      {
        kind: "grantEffect",
        on: { tag: "movement" },
        effects: [{ kind: "damage", damage: { base: 0.8, scale: "spell", type: "lightning", channel: "direct" }, to: "enemies" }],
      },
    ],
    ui: { badge: "CLB" },
  },
  {
    id: "stormcaller.stormlord",
    classId: "stormcaller",
    tier: "mythic",
    name: "Stormlord",
    description:
      "Eye of the Tempest stops being a cooldown: it becomes a standing state while you keep moving, running Rain, Wind and Thunder through the storm wall at once and never dropping the eye.",
    flavor: "You are not calling the storm any more. You are its weather system.",
    requires: [
      { path: "Thunder God", points: 6 },
      { path: "Tempest", points: 4 },
      { path: "Eye", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "stormcaller.mythic.stormlord" }],
    mutations: [
      {
        id: "stormlord.eye_of_the_tempest",
        label: "Eye of the Tempest → Stormlord",
        target: { abilityId: "stormcaller.eye_of_the_tempest" },
        ops: [
          { kind: "zone", scaleDuration: 1.6, scaleRadius: 1.2, scaleDamage: 1.25 },
          {
            kind: "followUp",
            window: 8,
            effects: [
              { kind: "stance", stance: "weather", op: "cycle", steps: 1 },
              { kind: "damage", damage: { base: 1.5, scale: "spell", type: "lightning", channel: "direct" }, to: "enemies" },
            ],
          },
          { kind: "addTags", tags: ["aura"] },
        ],
      },
    ],
    ui: { badge: "SLD" },
  },
];

// --- the assembled class --------------------------------------

export const STORMCALLER: PilotClass = {
  classId: "stormcaller",
  name: "Stormcaller",
  fantasy: "Living storm using chakrams, weather states, teleportation, wind and lightning.",
  role: "Mobile AoE DPS / elemental control / disruption.",
  question: "How can I weaponize weather and movement?",
  resources: STORMCALLER_RESOURCES,
  stances: STORMCALLER_STANCES,
  statuses: STORMCALLER_STATUSES,
  abilities: STORMCALLER_ABILITIES,
  progression: STORMCALLER_PROGRESSION,
  unlocks: STORMCALLER_UNLOCKS,
};
