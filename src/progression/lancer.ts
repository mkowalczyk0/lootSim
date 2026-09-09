/**
 * Lancer — the reference build data for the progression layer.
 *
 * This is *not* the class migration. It is the one class the spec works its examples
 * through (Momentum + Impaler + Vanguard → Comet Vanguard; Momentum + Vanguard →
 * Breakthrough), reproduced here as the smallest real thing the framework has to be
 * able to represent:
 *
 *   - two base abilities (Impaling Thrust, and the Meteor Lance ultimate)
 *   - a five-path tree in the v2 node vocabulary, with the Impaler path fully fleshed
 *     out in the canonical category order (foundation → behavior → resource →
 *     mutation → keystone)
 *   - the Breakthrough cross-path hybrid
 *   - the Comet Vanguard three-path Mythic Archetype
 *
 * The other four paths are sketched — enough nodes to be a real five-row path and to
 * carry the point totals the hybrid and archetype gate on, not the final content.
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import { buildProgressionTree, type TreeNodeV2 } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources -----------------------------------------------------------

/**
 * Momentum. Movement builds it, standing still and leaving combat bleed it off, and
 * it overflows into raw movement speed. Skills spend it; the Momentum path bends every
 * one of those rules.
 */
export const LANCER_MOMENTUM: ResourceSpec = {
  id: "momentum",
  label: "Momentum",
  max: 100,
  start: "empty",
  ui: "bar",
  decayPerSec: 12,
  decayDelay: 1.5,
  // A stationary Lancer used to bleed to zero in 9.7 s and then have *nothing* castable
  // until they moved again, which is what the owner saw as "the skill does nothing on the
  // first press" — the press was refused for cost, and the only feedback is a small
  // floater. 10 is exactly the two cheapest skills (Vaulting Spear 8, Impaling Thrust 10),
  // so standing still still costs you the 90-threshold speed bonus and both big spenders
  // (Crescent Sweep 20, Redline Charge 35) — the class's whole "keep moving" bargain is
  // intact. It just can no longer end with the Lancer unable to act at all.
  decayFloor: 10,
  generation: [
    { on: "move", amount: 1.5, perUnit: "distance" },
    { on: "dashStart", amount: 10 },
    { on: "hitDealt", amount: 3, requireTags: ["charge"] },
  ],
  thresholds: [{ at: 90, whileAbove: { moveSpeed: 0.1 } }],
};

/** The Lancer earns the ultimate by covering ground and connecting charges — never by standing and swinging. */
export const LANCER_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Meteor",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "move", amount: 0.6, perUnit: "distance" },
    { on: "hitDealt", amount: 6, requireTags: ["charge"] },
  ],
};

export const LANCER_RESOURCES: readonly ResourceSpec[] = [LANCER_MOMENTUM, LANCER_ULTIMATE_METER];

// --- statuses the Lancer introduces ------------------------------------

/** Skewered — the Impaler's stacking wound: the target takes more from everything, worse each stack. */
export const STATUS_SKEWERED: StatusSpec = {
  id: "skewered",
  label: "Skewered",
  glyph: "k",
  category: "debuff",
  tags: ["thrust", "physical", "vulnerable"],
  baseDuration: 5,
  maxStacks: 5,
  refreshRule: "stack",
  amplify: 1.06,
};

export const LANCER_STATUSES: readonly StatusSpec[] = [STATUS_SKEWERED];

// --- base abilities the tree rewrites -------------------------------

export const LANCER_IMPALING_THRUST: Ability = {
  id: "lancer.impaling_thrust",
  classId: "lancer",
  name: "Impaling Thrust",
  description: "A lightning-fast long-range forward stab that passes through normal enemies.",
  flavor: "One target. One opening. One very long mistake.",
  category: "attack",
  tags: ["melee", "thrust", "line"],
  costs: [{ resource: "momentum", amount: 10 }],
  cooldown: 4,
  castTime: 0.15,
  targeting: "line",
  range: 220,
  fx: { travel: "lance" },
  shape: { width: 22, length: 220 },
  effects: [{ kind: "damage", damage: { base: 1.4, scale: "attack", type: "physical", canCrit: true } }],
  mutationHooks: [
    { id: "impaling_thrust.packet", kind: "damagePacket", note: "Impaler path scales and adds a wound rider." },
    { id: "impaling_thrust.reach", kind: "targeting", note: "Long Point / Through Flesh extend the line." },
  ],
};

export const LANCER_METEOR_LANCE: Ability = {
  id: "lancer.meteor_lance",
  classId: "lancer",
  name: "Meteor Lance",
  description: "Rocket across the battlefield as a spear, piercing everything in the lane.",
  flavor: "The difference between a charge and a meteor is mostly academic.",
  category: "ultimate",
  tags: ["ultimate", "charge", "movement", "line"],
  cooldown: 0,
  targeting: "line",
  range: 600,
  shape: { width: 40, length: 600 },
  isUltimate: true,
  effects: [
    { kind: "move", style: "charge", distance: 600, iframes: 0.6 },
    { kind: "damage", damage: { base: 4.0, scale: "attack", type: "physical", canCrit: true } },
  ],
  mutationHooks: [
    { id: "meteor_lance.trail", kind: "followUp", note: "Comet Vanguard leaves an ally trail behind the charge." },
  ],
};

export const LANCER_VAULTING_SPEAR: Ability = {
  id: "lancer.vaulting_spear",
  classId: "lancer",
  name: "Vaulting Spear",
  description: "Plant the spear and vault over the enemies ahead, landing behind them with a downward strike.",
  flavor: "The safest road through a battlefield is sometimes over it.",
  category: "movement",
  tags: ["movement", "dash", "thrust"],
  costs: [{ resource: "momentum", amount: 8 }],
  cooldown: 7,
  targeting: "point",
  range: 180,
  shape: { radius: 90 },
  effects: [
    { kind: "move", style: "vault", distance: 180, iframes: 0.35 },
    { kind: "damage", damage: { base: 1.6, scale: "attack", type: "physical", canCrit: true, knockback: 40 }, to: "enemies" },
  ],
  mutationHooks: [{ id: "vaulting_spear.landing", kind: "movement", note: "Vaultmaster clears larger bodies and pays Momentum." }],
};

export const LANCER_DRAGOON_LINE: Ability = {
  id: "lancer.dragoon_line",
  classId: "lancer",
  name: "Dragoon Line",
  description: "Sweep the spear forward, hooking smaller enemies and dragging them onto the tip.",
  flavor: "Come closer. I insist.",
  category: "attack",
  tags: ["melee", "thrust", "line", "crowdControl"],
  cooldown: 6,
  targeting: "line",
  range: 150,
  fx: { travel: "lance" },
  shape: { width: 60, length: 150 },
  effects: [
    { kind: "pull", force: 120, to: "allTargets" },
    { kind: "damage", damage: { base: 1.1, scale: "attack", type: "physical", canCrit: true }, to: "allTargets" },
  ],
};

export const LANCER_PHALANX_BRACE: Ability = {
  id: "lancer.phalanx_brace",
  classId: "lancer",
  name: "Phalanx Brace",
  description: "Plant the spear and brace: deflect projectiles and stagger anything that walks into the point.",
  flavor: "The spear becomes a wall when held correctly.",
  category: "support",
  tags: ["barrier", "shield", "thrust", "counter"],
  cooldown: 12,
  targeting: "self",
  effects: [
    { kind: "shield", amount: 1.4, scale: "attack", to: "self", duration: 4 },
    { kind: "interrupt", radius: 70 },
  ],
  mutationHooks: [{ id: "phalanx_brace.wall", kind: "replaceEffect", note: "Impalement Wall turns the brace into a standing spear barrier." }],
};

export const LANCER_SKEWER_STEP: Ability = {
  id: "lancer.skewer_step",
  classId: "lancer",
  name: "Skewer Step",
  description: "Dash through a target, leaving a spectral spear at the start point. Recast to snap back to it.",
  flavor: "Forward is easy. Knowing when to come back is the trick.",
  category: "movement",
  tags: ["dash", "movement", "thrust", "teleport"],
  cooldown: 9,
  targeting: "currentTarget",
  range: 260,
  effects: [
    { kind: "move", style: "dash", toTarget: true, leaveAnchor: true, iframes: 0.3 },
    { kind: "damage", damage: { base: 1.8, scale: "attack", type: "physical", canCrit: true }, to: "target" },
  ],
  followUp: {
    window: 4,
    effects: [
      { kind: "move", style: "teleport", leaveAnchor: false },
      { kind: "damage", damage: { base: 1.2, scale: "attack", type: "physical" }, to: "allTargets" },
    ],
  },
};

export const LANCER_CRESCENT_SWEEP: Ability = {
  id: "lancer.crescent_sweep",
  classId: "lancer",
  name: "Crescent Sweep",
  description: "A wide arcing sweep of the spear that hits harder the more Momentum you are carrying.",
  flavor: "A spear is only a line until the hands become creative.",
  category: "attack",
  tags: ["melee", "slash", "area", "resourceSpender"],
  costs: [{ resource: "momentum", amount: 20 }],
  cooldown: 4,
  targeting: "cone",
  range: 90,
  shape: { length: 90, arc: Math.PI * 0.9 },
  effects: [{ kind: "damage", damage: { base: 1.5, scale: "attack", type: "physical", canCrit: true }, to: "allTargets" }],
};

export const LANCER_HEAVENFALL: Ability = {
  id: "lancer.heavenfall",
  classId: "lancer",
  name: "Heavenfall",
  description: "Leap and plunge the spear down, a shock ring launching everything light nearby.",
  flavor: "For a moment, every enemy looks upward.",
  category: "attack",
  tags: ["movement", "heavy", "area", "nova", "crowdControl"],
  cooldown: 10,
  targeting: "radius",
  range: 160,
  shape: { radius: 110 },
  effects: [
    { kind: "move", style: "vault", iframes: 0.25 },
    { kind: "damage", damage: { base: 2.2, scale: "attack", type: "physical", canCrit: true, knockback: 90 }, to: "allTargets" },
    { kind: "status", status: "stunned", chance: 0.4, to: "allTargets" },
  ],
};

export const LANCER_REDLINE_CHARGE: Ability = {
  id: "lancer.redline_charge",
  classId: "lancer",
  name: "Redline Charge",
  description: "Sprint in a dead-straight line. Every enemy struck extends the route; a wall ends it in a finishing thrust.",
  flavor: "Do not ask where the Lancer is going. Ask what survives the route.",
  category: "movement",
  tags: ["charge", "movement", "line", "resourceSpender"],
  costs: [{ resource: "momentum", amount: 35 }],
  cooldown: 14,
  targeting: "line",
  range: 420,
  shape: { width: 40, length: 420 },
  telegraph: { shape: "line", windup: 0.4, width: 40 },
  effects: [
    { kind: "move", style: "charge", distance: 420, iframes: 0.5 },
    { kind: "damage", damage: { base: 2.6, scale: "attack", type: "physical", canCrit: true }, to: "allTargets" },
    { kind: "status", status: "skewered", chance: 1, to: "allTargets" },
  ],
  mutationHooks: [
    { id: "redline_charge.route", kind: "movement", note: "Living Projectile makes the route invulnerable and piercing." },
    { id: "redline_charge.packet", kind: "damagePacket", note: "Momentum spend empowers the finishing thrust." },
  ],
};

export const LANCER_BANNER_FIRST_STEP: Ability = {
  id: "lancer.banner_first_step",
  classId: "lancer",
  name: "Banner of the First Step",
  description: "Throw down a war banner. Allies near it move faster and hit harder against enemies the Lancer recently pierced.",
  flavor: "Follow me, and the path becomes yours.",
  category: "support",
  tags: ["support", "zone", "terrain"],
  cooldown: 24,
  targeting: "point",
  range: 140,
  effects: [
    { kind: "zone", zone: { radius: 130, duration: 10, tickInterval: 1, follows: false, benefit: "haste" } },
    { kind: "terrain", piece: "anchor", duration: 10, hp: 0 },
  ],
  mutationHooks: [{ id: "banner.follow", kind: "zone", note: "Banner of Advance makes the banner follow the Lancer." }],
};

export const LANCER_ABILITIES: readonly Ability[] = [
  LANCER_IMPALING_THRUST,
  LANCER_VAULTING_SPEAR,
  LANCER_DRAGOON_LINE,
  LANCER_PHALANX_BRACE,
  LANCER_SKEWER_STEP,
  LANCER_CRESCENT_SWEEP,
  LANCER_HEAVENFALL,
  LANCER_REDLINE_CHARGE,
  LANCER_BANNER_FIRST_STEP,
  LANCER_METEOR_LANCE,
];

/** @deprecated use `LANCER_ABILITIES` — kept for the progression reference test. */
export const LANCER_BASE_ABILITIES: readonly Ability[] = [LANCER_IMPALING_THRUST, LANCER_METEOR_LANCE];

// --- the tree -------------------------------------------------------

export const LANCER_PROGRESSION: ClassProgression = {
  classId: "lancer",
  paths: [
    // 0 — Dragoon: movement into the strike (sketched).
    {
      name: "Dragoon",
      blurb: "Distance travelled is stored, then spent on the way in.",
      nodes: [
        {
          name: "Long Stride",
          category: "foundation",
          effects: [{ kind: "mods", mods: { meleeDamage: 0.08, moveSpeed: 0.05 } }],
        },
        {
          name: "Vaultmaster",
          category: "behavior",
          effects: [
            {
              kind: "grantEffect",
              on: { tag: "movement" },
              effects: [{ kind: "resource", resource: "momentum", delta: 8, to: "self" }],
              note: "Landing from a movement skill returns Momentum.",
            },
          ],
        },
        {
          name: "Pursuit",
          category: "resource",
          effects: [
            {
              kind: "resourceRule",
              resource: "momentum",
              patch: { addGeneration: [{ on: "hitDealt", amount: 4, requireTags: ["melee"] }] },
            },
          ],
        },
        {
          name: "Relentless Charge",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "dragoon.relentless_charge",
                label: "charges recover faster",
                target: { withTag: "charge" },
                ops: [{ kind: "cooldown", scale: 0.85 }],
              },
            },
          ],
        },
        {
          name: "Sky Lancer",
          category: "keystone",
          effects: [{ kind: "rule", rule: "lancer.dragoon.sky_lancer", note: "Movement chains into an empowered follow-up." }],
        },
      ],
    },

    // 1 — Impaler: the canonical fully-specified path.
    {
      name: "Impaler",
      blurb: "Everything you do goes through the first body and out the back.",
      nodes: [
        {
          name: "Long Point",
          blurb: "Max-range thrusts gain penetration and reach.",
          category: "foundation",
          effects: [
            { kind: "mods", mods: { pierce: 1, projectileDamage: 0.08 } },
            {
              kind: "mutate",
              mutation: {
                id: "impaler.long_point",
                label: "thrusts reach further",
                target: { withTag: "thrust" },
                ops: [{ kind: "targeting", addRange: 40 }],
              },
            },
          ],
        },
        {
          name: "Deep Wound",
          blurb: "Pierced enemies are left exposed.",
          category: "behavior",
          effects: [
            {
              kind: "grantEffect",
              on: { tag: "thrust" },
              effects: [{ kind: "status", status: "exposed", chance: 1, to: "allTargets" }],
              note: "Skewered wound — every thrust now applies Exposed.",
            },
          ],
        },
        {
          name: "Transfixing Blood",
          blurb: "A skewered enemy bleeds Momentum back to you.",
          category: "resource",
          effects: [
            {
              kind: "resourceRule",
              resource: "momentum",
              patch: {
                addGeneration: [{ on: "hitDealt", amount: 3, requireTags: ["thrust"] }],
                addThresholds: [{ at: 60, whileAbove: { pierce: 1 } }],
              },
            },
          ],
        },
        {
          name: "Through Flesh",
          blurb: "Impaling Thrust carries its full damage onward through skewered targets.",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "impaler.through_flesh",
                label: "Impaling Thrust → Through Flesh",
                target: { abilityId: "lancer.impaling_thrust" },
                ops: [
                  { kind: "targeting", addRange: 40, scaleLength: 1.3 },
                  { kind: "damagePacket", scaleBase: 1.15, setInflict: { status: "exposed", chance: 1 } },
                ],
              },
            },
          ],
        },
        {
          name: "Transfixion",
          blurb: "Fully committed thrusts pin the target and leave a spectral spear.",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "lancer.impaler.transfixion" },
            {
              kind: "mutate",
              mutation: {
                id: "impaler.transfixion",
                label: "thrusts pin",
                target: { withTag: "thrust" },
                ops: [
                  {
                    kind: "trigger",
                    event: "hit",
                    window: 0.1,
                    effects: [
                      {
                        kind: "zone",
                        zone: {
                          radius: 40,
                          duration: 3,
                          tickInterval: 0.5,
                          damage: { base: 0.3, scale: "attack", type: "physical", channel: "periodic" },
                          status: { id: "rooted", chance: 1 },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    },

    // 2 — Sentinel: planted defence (sketched).
    {
      name: "Sentinel",
      blurb: "The spear becomes a wall when held correctly.",
      nodes: [
        { name: "Braced Stance", category: "foundation", effects: [{ kind: "mods", mods: { defensePercent: 0.1 } }] },
        {
          name: "Counterpoint",
          category: "behavior",
          effects: [{ kind: "rule", rule: "lancer.sentinel.counterpoint", note: "A blocked attack empowers the next thrust." }],
        },
        {
          name: "Grounded",
          category: "resource",
          effects: [
            { kind: "mods", mods: { thorns: 4 } },
            {
              kind: "resourceRule",
              resource: "momentum",
              patch: { decayDelay: 4, addGeneration: [{ on: "block", amount: 8 }] },
            },
          ],
        },
        {
          name: "Punishing Reach",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "sentinel.punishing_reach",
                label: "melee sweeps widen",
                target: { withTag: "melee" },
                ops: [{ kind: "targeting", scaleArc: 1.15 }],
              },
            },
          ],
        },
        {
          name: "Impalement Wall",
          category: "keystone",
          effects: [{ kind: "rule", rule: "lancer.sentinel.impalement_wall" }],
        },
      ],
    },

    // 3 — Momentum: the resource loop.
    {
      name: "Momentum",
      blurb: "Movement, and the charge at the end of it.",
      nodes: [
        {
          name: "Motionless No More",
          blurb: "Movement itself generates Momentum.",
          category: "foundation",
          effects: [
            {
              kind: "resourceRule",
              resource: "momentum",
              patch: { addGeneration: [{ on: "move", amount: 2, perUnit: "distance" }] },
            },
            { kind: "mods", mods: { moveSpeed: 0.04 } },
          ],
        },
        {
          name: "Overflow",
          blurb: "Excess Momentum spills into movement speed.",
          category: "behavior",
          effects: [
            {
              kind: "resourceRule",
              resource: "momentum",
              patch: { addThresholds: [{ at: 80, fraction: false, whileAbove: { moveSpeed: 0.2 } }] },
            },
          ],
        },
        {
          name: "Stored Violence",
          blurb: "Spend Momentum to empower the next skill.",
          category: "resource",
          effects: [
            { kind: "rule", rule: "lancer.momentum.stored_violence" },
            {
              kind: "resourceRule",
              resource: "momentum",
              patch: { addGeneration: [{ on: "skillUse", amount: 4 }] },
            },
          ],
        },
        {
          name: "Breakneck",
          blurb: "At high Momentum, mobility skills go further.",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "momentum.breakneck",
                label: "movement skills travel further",
                target: { withTag: "movement" },
                ops: [{ kind: "movement", addDistance: 60, addIframes: 0.15 }],
              },
            },
          ],
        },
        {
          name: "Living Projectile",
          blurb: "At max Momentum the next charge is an invulnerable piercing projectile.",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "lancer.momentum.living_projectile" },
            {
              kind: "mutate",
              mutation: {
                id: "momentum.living_projectile",
                label: "charges become projectiles",
                target: { withTag: "charge" },
                ops: [
                  { kind: "movement", addIframes: 0.3 },
                  { kind: "damagePacket", scaleBase: 1.2 },
                ],
              },
            },
          ],
        },
      ],
    },

    // 4 — Vanguard: the raid-facing path.
    {
      name: "Vanguard",
      blurb: "Follow me, and the path becomes yours.",
      nodes: [
        {
          name: "First In",
          blurb: "Recently pierced enemies are more vulnerable to allies.",
          category: "foundation",
          effects: [
            {
              kind: "grantEffect",
              on: { tag: "charge" },
              effects: [{ kind: "status", status: "vulnerable", chance: 1, to: "allTargets" }],
            },
          ],
        },
        {
          name: "Mark the Breach",
          blurb: "Charges open a party damage window.",
          category: "behavior",
          effects: [
            { kind: "rule", rule: "lancer.vanguard.mark_the_breach" },
            {
              kind: "grantEffect",
              on: { event: "criticalHit" },
              effects: [{ kind: "status", status: "exposed", chance: 1, to: "allTargets" }],
            },
          ],
        },
        { name: "Follow Me", category: "resource", effects: [{ kind: "mods", mods: { moveSpeed: 0.06 } }] },
        {
          name: "Open Formation",
          blurb: "Struck enemies are goaded into targeting the Lancer.",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "vanguard.open_formation",
                label: "thrusts pull threat",
                target: { withTag: "thrust" },
                ops: [
                  {
                    kind: "addEffect",
                    at: "end",
                    effects: [{ kind: "threat", op: "generate", amount: 20, to: "allTargets" }],
                  },
                ],
              },
            },
          ],
        },
        {
          name: "Banner of Advance",
          category: "keystone",
          effects: [{ kind: "rule", rule: "lancer.vanguard.banner_of_advance" }],
        },
      ],
    },
  ],
};

export const LANCER_TREE: TreeNodeV2[] = buildProgressionTree(LANCER_PROGRESSION);

// --- hybrids and archetypes ---------------------------------------

export const LANCER_UNLOCKS: PathUnlockDef[] = [
  {
    id: "lancer.breakthrough",
    classId: "lancer",
    tier: "hybrid",
    name: "Breakthrough",
    description: "A completed charge tears a breach: enemies in the lane are exposed and allies who follow through are hasted.",
    flavor: "The line the Lancer draws is the one the raid walks.",
    requires: [
      { path: "Momentum", points: 3 },
      { path: "Vanguard", points: 2 },
    ],
    effects: [
      { kind: "rule", rule: "lancer.hybrid.breakthrough" },
      {
        kind: "grantEffect",
        on: { tag: "charge" },
        effects: [
          { kind: "status", status: "exposed", chance: 1, to: "allTargets" },
          { kind: "zone", zone: { radius: 120, duration: 4, tickInterval: 1, follows: false, benefit: "haste" } },
        ],
      },
    ],
    mutations: [
      {
        id: "breakthrough.charge_window",
        label: "charges leave a follow-up window",
        target: { withTag: "charge" },
        ops: [
          {
            kind: "followUp",
            window: 2,
            effects: [{ kind: "status", status: "vulnerable", chance: 1, to: "allTargets" }],
          },
        ],
      },
    ],
    ui: { badge: "BRK" },
  },
  {
    id: "lancer.thunder_lance",
    classId: "lancer",
    tier: "hybrid",
    name: "Thunder Lance",
    description: "A committed charge stops for nothing — it pierces an entire rank and keeps its full damage the whole way.",
    flavor: "The line is drawn before the charge begins.",
    requires: [
      { path: "Dragoon", points: 3 },
      { path: "Impaler", points: 2 },
    ],
    effects: [{ kind: "rule", rule: "lancer.hybrid.thunder_lance" }],
    mutations: [
      {
        id: "thunder_lance.pierce",
        label: "charges pierce a whole rank",
        target: { withTag: "charge" },
        ops: [
          { kind: "targeting", scaleLength: 1.2 },
          { kind: "projectile", addPierce: 3 },
          { kind: "damagePacket", scaleBase: 1.15 },
        ],
      },
    ],
    ui: { badge: "THL" },
  },
  {
    id: "lancer.phalanx_spear",
    classId: "lancer",
    tier: "hybrid",
    name: "Phalanx Spear",
    description: "While braced, the spear reaches out on its own and impales anything that closes the distance.",
    flavor: "Hold the line and the line does the work.",
    requires: [
      { path: "Impaler", points: 3 },
      { path: "Sentinel", points: 2 },
    ],
    effects: [
      { kind: "rule", rule: "lancer.hybrid.phalanx_spear" },
      {
        kind: "grantEffect",
        on: { tag: "counter" },
        effects: [
          { kind: "damage", damage: { base: 0.8, scale: "attack", type: "physical", channel: "retaliation" }, to: "enemies" },
          { kind: "status", status: "skewered", chance: 1, to: "enemies" },
        ],
      },
    ],
    ui: { badge: "PHX" },
  },
  {
    id: "lancer.countercharge",
    classId: "lancer",
    tier: "hybrid",
    name: "Countercharge",
    description: "Stored Momentum doesn't just empower the next skill — being struck releases it as an instant counter-charge.",
    flavor: "Every hit you land on a Lancer is a push in the direction they wanted to go.",
    requires: [
      { path: "Momentum", points: 3 },
      { path: "Sentinel", points: 2 },
    ],
    effects: [
      { kind: "rule", rule: "lancer.hybrid.countercharge" },
      {
        kind: "grantEffect",
        on: { event: "damageTaken" },
        effects: [{ kind: "resource", resource: "momentum", delta: 12, to: "self" }],
      },
    ],
    mutations: [
      {
        id: "countercharge.window",
        label: "being hit opens a charge window",
        target: { withTag: "charge" },
        ops: [{ kind: "cooldown", scale: 0.9 }],
      },
    ],
    ui: { badge: "CTR" },
  },
  {
    id: "lancer.breach_master",
    classId: "lancer",
    tier: "hybrid",
    name: "Breach Master",
    description: "Pierced enemies leave a Breach Line: a lane of amplified damage the whole raid can shoot down.",
    flavor: "One Lancer, one hole in the wall, five people through it.",
    requires: [
      { path: "Impaler", points: 3 },
      { path: "Vanguard", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "lancer.hybrid.breach_master" },
      {
        kind: "grantEffect",
        on: { tag: "thrust" },
        effects: [
          {
            kind: "zone",
            zone: {
              radius: 60,
              duration: 5,
              tickInterval: 1,
              follows: false,
              mergeable: true,
              damage: { base: 0.2, scale: "attack", type: "physical", channel: "periodic" },
              status: { id: "exposed", chance: 1 },
            },
          },
        ],
      },
    ],
    ui: { badge: "BRC" },
  },
  {
    id: "lancer.comet",
    classId: "lancer",
    tier: "hybrid",
    name: "Comet",
    description: "At high Momentum the next thrust is carried across the room as a projectile instead of a swing.",
    flavor: "The difference between a thrust and a comet is mostly velocity.",
    requires: [
      { path: "Momentum", points: 3 },
      { path: "Impaler", points: 3 },
    ],
    effects: [{ kind: "rule", rule: "lancer.hybrid.comet" }],
    mutations: [
      {
        id: "comet.carry",
        label: "thrusts can be launched",
        target: { withTag: "thrust" },
        ops: [
          { kind: "targeting", scaleLength: 1.5 },
          { kind: "damagePacket", scaleBase: 1.1 },
        ],
      },
    ],
    ui: { badge: "CMT" },
  },
  {
    id: "lancer.comet_vanguard",
    classId: "lancer",
    tier: "mythic",
    name: "Comet Vanguard",
    description:
      "Meteor Lance pierces an entire formation and leaves a burning, damage-amplifying trail the raid can push into.",
    flavor: "Holy shit, my build became a thing.",
    requires: [
      { path: "Momentum", points: 6 },
      { path: "Impaler", points: 4 },
      { path: "Vanguard", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "lancer.mythic.comet_vanguard" }],
    mutations: [
      {
        id: "comet_vanguard.meteor_lance",
        label: "Meteor Lance → Comet Vanguard",
        target: { abilityId: "lancer.meteor_lance" },
        ops: [
          { kind: "targeting", scaleLength: 1.4, scaleWidth: 1.3 },
          { kind: "damagePacket", scaleBase: 1.25, setInflict: { status: "exposed", chance: 1 } },
          {
            kind: "addEffect",
            at: "end",
            effects: [
              {
                kind: "zone",
                zone: {
                  radius: 70,
                  duration: 6,
                  tickInterval: 0.5,
                  follows: false,
                  mergeable: true,
                  damage: { base: 0.4, scale: "attack", type: "physical", channel: "periodic" },
                  status: { id: "exposed", chance: 1 },
                },
              },
            ],
          },
        ],
      },
    ],
    ui: { badge: "COMET" },
  },
];

// --- the assembled class ---------------------------------------------

export const LANCER: PilotClass = {
  classId: "lancer",
  name: "Lancer",
  fantasy: "Master of distance, momentum, line control, and high-commitment charges.",
  role: "Initiator / mobile frontliner / line damage / raid vanguard.",
  question: "How do I control distance and momentum?",
  resources: LANCER_RESOURCES,
  statuses: LANCER_STATUSES,
  abilities: LANCER_ABILITIES,
  progression: LANCER_PROGRESSION,
  unlocks: LANCER_UNLOCKS,
};
