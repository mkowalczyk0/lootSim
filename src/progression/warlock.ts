/**
 * Warlock — the corruption caster. Soul Debt is what the battlefield owes you: it
 * accrues every time you curse something or spend your own health on a pact, and it is
 * spent detonating all of it at once. The ultimate meter reads how much the room owes.
 * The paths are five ways to collect a debt.
 *
 * Question: how much can I turn enemy weakness into my resource?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const WARLOCK_MANA: ResourceSpec = {
  id: "mana",
  label: "Mana",
  max: 100,
  start: "full",
  ui: "bar",
  regenPerSec: 4,
};

export const WARLOCK_SOUL_DEBT: ResourceSpec = {
  id: "soul_debt",
  label: "Soul Debt",
  max: 100,
  start: "empty",
  ui: "pips",
  generation: [
    { on: "ailmentInflicted", amount: 4, requireTags: ["curse"] },
    { on: "statusApplied", amount: 2, requireTags: ["corruption"] },
    { on: "damageTaken", amount: 10, perUnit: "maxHealthFraction" },
  ],
  healthConversion: { ratio: 0.5 },
  thresholds: [{ at: 80, whileAbove: { voidDamage: 0.25, skillDamage: 0.1 } }],
};

export const WARLOCK_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Damnation",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    // Damnation is earned by spreading affliction, not by raw damage. The
    // `damageDealt` term is a small top-up only: at 0.3/damage (an early draft) a
    // Warlock's spell damage filled the 100-point meter in a few casts and the
    // ultimate was up on cooldown — well under the 20s floor. 0.03 keeps it a
    // contribution without making it the whole meter.
    { on: "ailmentInflicted", amount: 3 },
    { on: "damageDealt", amount: 0.03, perUnit: "damage" },
  ],
};

export const WARLOCK_RESOURCES: readonly ResourceSpec[] = [WARLOCK_MANA, WARLOCK_SOUL_DEBT, WARLOCK_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Hex — the Warlock's stacking curse. Left long enough it settles into a permanent wound. */
export const STATUS_HEX: StatusSpec = {
  id: "hex",
  label: "Hexed",
  glyph: "x",
  category: "curse",
  tags: ["curse", "void"],
  baseDuration: 9,
  maxStacks: 5,
  refreshRule: "stack",
  amplify: 1.06,
  dps: 0.06,
  tickInterval: 1,
  damageType: "void",
  damageChannel: "dot",
  onDetonate: "warlock.rupture",
};

/** Damned — the Damnation brand. Damage to one damned enemy echoes onto every other. */
export const STATUS_DAMNED: StatusSpec = {
  id: "damned",
  label: "Damned",
  glyph: "d",
  category: "curse",
  tags: ["curse", "void", "mark"],
  baseDuration: 12,
  maxStacks: 1,
  refreshRule: "refresh",
  amplify: 1.1,
  unremovable: true,
};

export const WARLOCK_STATUSES: readonly StatusSpec[] = [STATUS_HEX, STATUS_DAMNED];

// --- abilities --------------------------------------------------------

export const WARLOCK_BLACK_BOLT: Ability = {
  id: "warlock.black_bolt",
  classId: "warlock",
  name: "Black Bolt",
  description: "A bolt of nothing. It hits ordinary enemies hard and cursed ones much harder.",
  flavor: "It is the shape of a hole, moving quickly.",
  category: "spell",
  tags: ["ranged", "projectile", "void"],
  costs: [{ resource: "mana", amount: 6 }],
  cooldown: 1.5,
  targeting: "direction",
  range: 320,
  effects: [
    { kind: "projectile", projectile: { damage: { base: 1.2, scale: "spell", type: "void", canCrit: true }, speed: 460, radius: 10, life: 0.9 } },
  ],
  mutationHooks: [{ id: "black_bolt.packet", kind: "damagePacket", note: "Corruptor path adds a hex rider." }],
};

export const WARLOCK_SOUL_TAX: Ability = {
  id: "warlock.soul_tax",
  classId: "warlock",
  name: "Soul Tax",
  description: "Levy a tax on a target: any healing it receives is redirected to you as Mana instead.",
  flavor: "Every transaction on this battlefield is now subject to a small fee.",
  category: "spell",
  tags: ["curse", "ranged"],
  cooldown: 10,
  targeting: "currentTarget",
  range: 240,
  fx: { travel: "bolt" },
  effects: [
    { kind: "status", status: "hex", chance: 1, to: "target" },
    { kind: "status", status: "weakened", chance: 1, to: "target" },
  ],
  mutationHooks: [{ id: "soul_tax.status", kind: "status", note: "Soul Eater turns the tax into a straight resource drain." }],
};

export const WARLOCK_RUPTURE_VEIN: Ability = {
  id: "warlock.rupture_vein",
  classId: "warlock",
  name: "Rupture Vein",
  description: "Burst every curse on a target at once. The blast scales with how many stacks were sitting on it.",
  flavor: "Compound interest, collected all in one afternoon.",
  category: "spell",
  tags: ["void", "area", "curse", "resourceSpender"],
  costs: [{ resource: "soul_debt", amount: 20 }],
  cooldown: 6,
  targeting: "currentTarget",
  range: 200,
  fx: { travel: "bolt" },
  effects: [
    { kind: "consumeStatus", status: "hex", to: "target", then: [
      { kind: "damage", damage: { base: 2.6, scale: "spell", type: "void", canCrit: true }, to: "target" },
      { kind: "spreadStatus", status: "hex", radius: 120, to: "target" },
    ] },
  ],
};

export const WARLOCK_DREAD_SIGIL: Ability = {
  id: "warlock.dread_sigil",
  classId: "warlock",
  name: "Dread Sigil",
  description: "Burn a sigil into the floor. Enemies over it take more from all corruption and spread it as they move.",
  flavor: "Chalk would have worked. The Warlock prefers the other thing.",
  category: "terrain",
  tags: ["zone", "void", "corruption"],
  costs: [{ resource: "mana", amount: 18 }],
  cooldown: 14,
  targeting: "point",
  range: 180,
  effects: [
    { kind: "zone", zone: { radius: 110, duration: 10, tickInterval: 0.5, follows: false, mergeable: true, damage: { base: 0.3, scale: "spell", type: "void", channel: "periodic" }, status: { id: "corruption", chance: 0.5 } } },
  ],
  mutationHooks: [{ id: "dread_sigil.zone", kind: "zone", note: "Riftwalker lets you step between sigils." }],
};

export const WARLOCK_LIFE_LEECH: Ability = {
  id: "warlock.life_leech",
  classId: "warlock",
  name: "Life Leech",
  description: "Open a tether to a target and drain it — damage to them, health to you, for as long as the line holds.",
  flavor: "A straw, essentially.",
  category: "spell",
  tags: ["void", "channel", "heal"],
  cooldown: 12,
  channel: { duration: 3, ticks: 6 },
  targeting: "currentTarget",
  range: 180,
  fx: { travel: "bolt" },
  effects: [
    { kind: "damage", damage: { base: 0.5, scale: "spell", type: "void", channel: "periodic" }, to: "target" },
    { kind: "heal", amount: 0.2, scale: "spell", to: "self" },
  ],
};

export const WARLOCK_MALEDICT: Ability = {
  id: "warlock.maledict",
  classId: "warlock",
  name: "Maledict",
  description: "Speak a curse that stacks with itself. At full stacks it becomes a wound that no longer expires.",
  flavor: "Said quietly, and only once per stack.",
  category: "spell",
  tags: ["curse", "ranged"],
  costs: [{ resource: "mana", amount: 10 }],
  cooldown: 4,
  targeting: "currentTarget",
  range: 240,
  fx: { travel: "bolt" },
  effects: [
    { kind: "status", status: "hex", chance: 1, stacks: 2, to: "target" },
    { kind: "damage", damage: { base: 0.7, scale: "spell", type: "void", canCrit: true }, to: "target" },
  ],
  mutationHooks: [{ id: "maledict.status", kind: "status", note: "Total Corruption makes the wound permanent at 3 stacks, not 5." }],
};

export const WARLOCK_GRASP_BEYOND: Ability = {
  id: "warlock.grasp_beyond",
  classId: "warlock",
  name: "Grasp Beyond",
  description: "Spectral hands come up through the floor in an area and hold everything in place.",
  flavor: "They are not attached to anything. That is the unsettling part.",
  category: "spell",
  tags: ["void", "crowdControl", "area"],
  cooldown: 13,
  targeting: "radius",
  range: 200,
  fx: { travel: "bolt" },
  shape: { radius: 110 },
  effects: [
    { kind: "damage", damage: { base: 0.9, scale: "spell", type: "void", canCrit: true }, to: "allTargets" },
    { kind: "status", status: "rooted", chance: 1, to: "allTargets", durationMult: 1.5 },
  ],
};

export const WARLOCK_PACT_OF_POWER: Ability = {
  id: "warlock.pact_of_power",
  classId: "warlock",
  name: "Pact of Power",
  description: "Sign away a slice of your maximum health. In return your spells hit far harder until the fight ends.",
  flavor: "The terms are generous. The Warlock read them.",
  category: "utility",
  tags: ["curse"],
  cooldown: 45,
  targeting: "self",
  effects: [
    { kind: "damage", damage: { base: 0.15, scale: "flat", type: "void", channel: "environmental" }, to: "self" },
    { kind: "resource", resource: "soul_debt", delta: 30, to: "self" },
  ],
  mutationHooks: [{ id: "pact_of_power.rule", kind: "resource", note: "Forbidden Pact scales the trade further." }],
};

export const WARLOCK_SOUL_DETONATION: Ability = {
  id: "warlock.soul_detonation",
  classId: "warlock",
  name: "Soul Detonation",
  description: "Spend everything the room owes you in one blast, centred on the most-cursed enemy.",
  flavor: "Paid in full.",
  category: "spell",
  tags: ["void", "area", "resourceSpender", "curse"],
  costs: [{ resource: "soul_debt", amount: 60 }],
  cooldown: 18,
  targeting: "markedTarget",
  range: 260,
  fx: { travel: "bolt" },
  effects: [
    { kind: "damage", damage: { base: 3.4, scale: "spell", type: "void", canCrit: true }, to: "allTargets" },
    { kind: "spreadStatus", status: "hex", radius: 180, to: "marked" },
  ],
};

export const WARLOCK_DAMNATION: Ability = {
  id: "warlock.damnation",
  classId: "warlock",
  name: "Damnation",
  description: "Brand every enemy on the field. For the duration, damage dealt to any branded enemy is echoed onto all the others.",
  flavor: "A shared fate. It was always going to be shared. Now it's official.",
  category: "ultimate",
  tags: ["ultimate", "curse", "void"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  effects: [
    { kind: "fx", fx: "warlock.brand" },
    { kind: "status", status: "damned", chance: 1, to: "enemiesEverywhere" },
    { kind: "damage", damage: { base: 1.4, scale: "spell", type: "void", canCrit: true, channel: "ultimate" }, to: "enemiesEverywhere" },
  ],
  mutationHooks: [{ id: "damnation.status", kind: "status", note: "The Reckoning makes the brand a Doom that culminates in a wipe pulse." }],
};

export const WARLOCK_ABILITIES: readonly Ability[] = [
  WARLOCK_BLACK_BOLT,
  WARLOCK_SOUL_TAX,
  WARLOCK_RUPTURE_VEIN,
  WARLOCK_DREAD_SIGIL,
  WARLOCK_LIFE_LEECH,
  WARLOCK_MALEDICT,
  WARLOCK_GRASP_BEYOND,
  WARLOCK_PACT_OF_POWER,
  WARLOCK_SOUL_DETONATION,
  WARLOCK_DAMNATION,
];

// --- the tree --------------------------------------------------------

export const WARLOCK_PROGRESSION: ClassProgression = {
  classId: "warlock",
  paths: [
    // 0 — Corruptor: stack it everywhere.
    {
      name: "Corruptor",
      blurb: "One curse is an insult. A room of curses is a position.",
      nodes: [
        { name: "Spread the Word", category: "foundation", effects: [{ kind: "mods", mods: { ailmentChance: 0.15, voidDamage: 0.1 } }] },
        { name: "Fester", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "co.fester", label: "your curses stack faster and deeper", target: { withTag: "curse" }, ops: [{ kind: "status", addStacks: 1, scaleDuration: 1.25 }] } }] },
        { name: "Interest Accrues", category: "resource", effects: [{ kind: "resourceRule", resource: "soul_debt", patch: { addGeneration: [{ on: "statusApplied", amount: 2 }] } }] },
        { name: "Contagious Word", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "co.contagious_word", label: "Black Bolt carries a hex", target: { abilityId: "warlock.black_bolt" }, ops: [{ kind: "damagePacket", setInflict: { status: "hex", chance: 1 } }] } }] },
        { name: "Total Corruption", category: "keystone", effects: [{ kind: "rule", rule: "warlock.co.total_corruption", note: "A hex at 3 stacks becomes permanent, and permanent hexes count double for detonations." }] },
      ],
    },
    // 1 — Soul Eater: steal their resources.
    {
      name: "Soul Eater",
      blurb: "Their bar is your bar. They just don't know yet.",
      nodes: [
        { name: "Skim", category: "foundation", effects: [{ kind: "mods", mods: { manaOnHit: 2, lifeOnHit: 1 } }] },
        { name: "Parasite", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "se.parasite", label: "Soul Tax drains resources outright", target: { abilityId: "warlock.soul_tax" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "damage", damage: { base: 0.4, scale: "spell", type: "void", channel: "dot" }, to: "target" }] }] } }] },
        { name: "Glut", category: "resource", effects: [{ kind: "resourceRule", resource: "mana", patch: { max: 140, regenPerSec: 6 } }] },
        { name: "Drain Line", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "se.drain_line", label: "Life Leech tethers two targets at once", target: { abilityId: "warlock.life_leech" }, ops: [{ kind: "targeting", setMode: "radius", addRange: 40 }, { kind: "addTags", tags: ["area"] }] } }] },
        { name: "Devour Soul", category: "keystone", effects: [{ kind: "rule", rule: "warlock.se.devour_soul", note: "Killing a cursed enemy refunds a full skill's worth of Mana and heals for the overkill." }] },
      ],
    },
    // 2 — Pactmaker: pay in your own health.
    {
      name: "Pactmaker",
      blurb: "The best price is the one you can afford to bleed.",
      nodes: [
        { name: "Blood Ink", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.08, maxHealth: -10 } }] },
        { name: "Willing", category: "behavior", effects: [{ kind: "rule", rule: "warlock.pm.willing", note: "Health spent on a pact is added to your spell damage for the fight." }] },
        { name: "Blood Bank", category: "resource", effects: [{ kind: "resourceRule", resource: "soul_debt", patch: { max: 140, addGeneration: [{ on: "damageTaken", amount: 6, perUnit: "maxHealthFraction" }] } }] },
        { name: "Hard Bargain", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "pm.hard_bargain", label: "Pact of Power can be re-signed for a bigger cut", target: { abilityId: "warlock.pact_of_power" }, ops: [{ kind: "cooldown", scale: 0.5 }] } }] },
        { name: "Forbidden Pact", category: "keystone", effects: [{ kind: "rule", rule: "warlock.pm.forbidden_pact", note: "At low health every spell can pay its cost in health for triple effect." }] },
      ],
    },
    // 3 — Riftwalker: move through the void.
    {
      name: "Riftwalker",
      blurb: "The short way is through somewhere that isn't here.",
      nodes: [
        { name: "Thin Places", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.06, cooldownRate: 0.06 } }] },
        { name: "Sigil Step", category: "behavior", effects: [{ kind: "grantEffect", on: { tag: "zone" }, effects: [{ kind: "move", style: "teleport", distance: 0 }] }] },
        { name: "Void Reserve", category: "resource", effects: [{ kind: "resourceRule", resource: "soul_debt", patch: { addGeneration: [{ on: "dashStart", amount: 6 }] } }] },
        { name: "Rift Bolt", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "rw.rift_bolt", label: "Black Bolt can be cast from your last Dread Sigil", target: { abilityId: "warlock.black_bolt" }, ops: [{ kind: "targeting", setMode: "temporalAnchor" }, { kind: "projectile", addCount: 1 }] } }] },
        { name: "Between Worlds", category: "keystone", effects: [{ kind: "rule", rule: "warlock.rw.between_worlds", note: "Teleporting leaves a void rift where you were that pulls and hexes enemies into it." }] },
      ],
    },
    // 4 — Doomsayer: the curse that keeps an appointment.
    {
      name: "Doomsayer",
      blurb: "It is not about the damage now. It is about the damage on a timer.",
      nodes: [
        { name: "Foretold", category: "foundation", effects: [{ kind: "grantEffect", on: { tag: "curse" }, effects: [{ kind: "status", status: "doom", chance: 0.25, to: "allTargets" }] }] },
        { name: "The Hour Approaches", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "ds.the_hour_approaches", label: "doomed enemies take escalating damage as the timer runs out", target: { withTag: "curse" }, ops: [{ kind: "status", scalePotency: 1.3 }] } }] },
        { name: "Toll", category: "resource", effects: [{ kind: "resourceRule", resource: "ultimate", patch: { addGeneration: [{ on: "ailmentInflicted", amount: 3, requireTags: ["curse"] }] } }] },
        { name: "Compound Doom", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ds.compound_doom", label: "Rupture Vein reapplies Doom to everything it hits", target: { abilityId: "warlock.rupture_vein" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "doom", chance: 1, to: "allTargets" }] }] } }] },
        { name: "Inevitable End", category: "keystone", effects: [{ kind: "rule", rule: "warlock.ds.inevitable_end", note: "A Doom that expires on its own detonates for its whole accumulated damage and spreads." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `warlock.${id}`,
  classId: "warlock",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `warlock.hybrid.${id}` }],
  ...extra,
});

export const WARLOCK_UNLOCKS: PathUnlockDef[] = [
  H("devouring_curse", "Devouring Curse", "A curse ticking on a low-health enemy consumes it, converting the kill straight into Mana and Soul Debt.", "Corruptor", "Soul Eater", {
    effects: [
      { kind: "rule", rule: "warlock.hybrid.devouring_curse" },
      { kind: "grantEffect", on: { event: "enemyDeath" }, effects: [{ kind: "resource", resource: "mana", delta: 20, to: "self" }] },
    ],
    ui: { badge: "DVC" },
  }),
  H("blood_corruption", "Blood Corruption", "Health spent on a pact is distributed as hex stacks across every visible enemy.", "Corruptor", "Pactmaker", {
    mutations: [{ id: "warlock.blood_corruption", label: "pacts curse the room", target: { abilityId: "warlock.pact_of_power" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "hex", chance: 1, stacks: 2, to: "enemies" }] }] }],
    ui: { badge: "BLC" },
  }),
  H("soul_gate", "Soul Gate", "Draining a tethered target opens a gate you can step through to its position.", "Soul Eater", "Riftwalker", {
    effects: [{ kind: "rule", rule: "warlock.hybrid.soul_gate" }],
    ui: { badge: "GATE" },
  }),
  H("inevitable_ruin", "Inevitable Ruin", "Detonating a curse also advances every Doom in the area toward its expiry.", "Doomsayer", "Corruptor", {
    mutations: [{ id: "warlock.inevitable_ruin", label: "detonations hasten doom", target: { withTag: "void" }, ops: [{ kind: "damagePacket", scaleBase: 1.15 }] }],
    ui: { badge: "RUIN" },
  }),
  H("final_payment", "Final Payment", "When a Doom expires you may pay its remaining timer in health to double its detonation.", "Pactmaker", "Doomsayer", {
    effects: [{ kind: "rule", rule: "warlock.hybrid.final_payment" }],
    ui: { badge: "PAY" },
  }),
  H("void_bargain", "Void Bargain", "Teleporting costs health instead of a cooldown, and each blink banks Soul Debt.", "Riftwalker", "Pactmaker", {
    effects: [
      { kind: "rule", rule: "warlock.hybrid.void_bargain" },
      { kind: "grantEffect", on: { tag: "teleport" }, effects: [{ kind: "resource", resource: "soul_debt", delta: 10, to: "self" }] },
    ],
    ui: { badge: "VBG" },
  }),
  {
    id: "warlock.the_reckoning",
    classId: "warlock",
    tier: "mythic",
    name: "The Reckoning",
    description: "Damnation's brand becomes a shared Doom: while it runs, every hex and curse in the room advances toward a single expiry, and when the timer ends every branded enemy detonates for the total debt they had accrued.",
    flavor: "The Warlock does not forgive debts. The Warlock consolidates them.",
    requires: [
      { path: "Corruptor", points: 6 },
      { path: "Soul Eater", points: 4 },
      { path: "Doomsayer", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "warlock.mythic.the_reckoning" }],
    mutations: [{
      id: "warlock.the_reckoning.damnation",
      label: "Damnation → The Reckoning",
      target: { abilityId: "warlock.damnation" },
      ops: [
        { kind: "status", swap: { from: "damned", to: "doom" } },
        { kind: "addEffect", at: "end", effects: [{ kind: "delay", seconds: 6, effects: [{ kind: "damage", damage: { base: 4.0, scale: "spell", type: "void", channel: "ultimate" }, to: "enemies" }] }] },
      ],
    }],
    ui: { badge: "RECK" },
  },
];

export const WARLOCK: PilotClass = {
  classId: "warlock",
  name: "Warlock",
  fantasy: "Corruption caster who turns enemy debuffs, health, and resource debt into power.",
  role: "Debuff DPS / attrition / boss specialist.",
  question: "How much can I turn enemy weakness into my resource?",
  resources: WARLOCK_RESOURCES,
  statuses: WARLOCK_STATUSES,
  abilities: WARLOCK_ABILITIES,
  progression: WARLOCK_PROGRESSION,
  unlocks: WARLOCK_UNLOCKS,
};
