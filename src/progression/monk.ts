/**
 * Monk — the combo martial artist. Chi is small change: earned a sliver at a time by
 * connecting strikes, spent a sliver at a time to keep a sequence alive. Break the
 * rhythm and it drains. The ultimate meter reads how long you have held a combo. The
 * paths are five disciplines: the endless chain, the iron body, water-flow movement,
 * the inner flame, and the counter-timing of a master.
 *
 * Question: can I maintain a perfect combat rhythm?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const MONK_CHI: ResourceSpec = {
  id: "chi",
  label: "Chi",
  max: 10,
  start: 3,
  ui: "pips",
  decayPerSec: 1,
  decayDelay: 2,
  generation: [
    { on: "hitDealt", amount: 0.5, requireTags: ["melee"] },
    { on: "dodge", amount: 1 },
  ],
  thresholds: [{ at: 8, whileAbove: { attackSpeed: 0.12, moveSpeed: 0.08 } }],
};

/** Heavenly Fist is earned by *not breaking rhythm* — an unbroken chain of connects, never a kill. */
export const MONK_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Heavenly Fist",
  max: 100,
  start: "empty",
  ui: "meter",
  generation: [
    { on: "hitDealt", amount: 0.5, requireTags: ["melee"] },
    { on: "skillUse", amount: 3 },
  ],
  isUltimateMeter: true,
};

export const MONK_RESOURCES: readonly ResourceSpec[] = [MONK_CHI, MONK_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Flow — the combo buff. Every distinct strike in a chain stacks it; a missed beat drops it. */
export const STATUS_FLOW: StatusSpec = {
  id: "flow",
  label: "Flow",
  glyph: "f",
  category: "buff",
  baseDuration: 3,
  maxStacks: 8,
  refreshRule: "stack",
  mods: { attackSpeed: 0.04, meleeDamage: 0.05, cooldownRate: 0.03 },
};

export const MONK_STATUSES: readonly StatusSpec[] = [STATUS_FLOW];

// --- abilities --------------------------------------------------------

export const MONK_PALM_STRIKE: Ability = {
  id: "monk.palm_strike",
  classId: "monk",
  name: "Palm Strike",
  description: "A fast open-hand strike. Cheap, quick, and the reason you have any Chi at all.",
  flavor: "It is not the strongest thing you know. It is the thing you always have.",
  category: "attack",
  tags: ["melee", "resourceGenerator"],
  cooldown: 1,
  targeting: "currentTarget",
  range: 55,
  effects: [
    { kind: "damage", damage: { base: 0.6, scale: "attack", type: "physical", canCrit: true }, to: "target" },
    { kind: "status", status: "flow", chance: 1, to: "self" },
  ],
};

export const MONK_RISING_PALM: Ability = {
  id: "monk.rising_palm",
  classId: "monk",
  name: "Rising Palm",
  description: "An uppercut that lifts a light enemy off its feet and holds it there for a beat.",
  flavor: "Up is a direction most monsters have not planned for.",
  category: "attack",
  tags: ["melee", "crowdControl"],
  cooldown: 5,
  targeting: "currentTarget",
  range: 55,
  effects: [
    { kind: "damage", damage: { base: 1.2, scale: "attack", type: "physical", canCrit: true, knockback: 30 }, to: "target" },
    { kind: "status", status: "stunned", chance: 0.7, to: "target" },
    { kind: "status", status: "flow", chance: 1, to: "self" },
  ],
};

export const MONK_CRANE_SWEEP: Ability = {
  id: "monk.crane_sweep",
  classId: "monk",
  name: "Crane Sweep",
  description: "A low spinning kick that knocks the legs out from under everything in a circle.",
  flavor: "It is rude. It is also very effective.",
  category: "attack",
  tags: ["melee", "area", "crowdControl"],
  cooldown: 6,
  targeting: "radius",
  range: 80,
  shape: { radius: 80 },
  effects: [
    { kind: "damage", damage: { base: 1.0, scale: "attack", type: "physical", canCrit: true, knockback: 20 }, to: "allTargets" },
    { kind: "status", status: "rooted", chance: 0.6, to: "allTargets" },
    { kind: "status", status: "flow", chance: 1, to: "self" },
  ],
};

export const MONK_BREATH_CONTROL: Ability = {
  id: "monk.breath_control",
  classId: "monk",
  name: "Breath Control",
  description: "A single controlled breath. Spend Chi to heal and shed every debuff at once.",
  flavor: "In through the nose. Out through the problem.",
  category: "support",
  tags: ["heal", "cleanse", "resourceSpender"],
  costs: [{ resource: "chi", amount: 4 }],
  cooldown: 10,
  targeting: "self",
  effects: [
    { kind: "heal", amount: 0.6, scale: "attack", to: "self" },
    { kind: "cleanse", category: "debuff", to: "self" },
    { kind: "cleanse", category: "cc", to: "self" },
  ],
};

export const MONK_FLYING_KNEE: Ability = {
  id: "monk.flying_knee",
  classId: "monk",
  name: "Flying Knee",
  description: "Close the distance with a leap and drive a knee in — a hard stagger on arrival.",
  flavor: "The distance was never the point. The knee was the point.",
  category: "movement",
  tags: ["movement", "dash", "melee", "crowdControl"],
  cooldown: 7,
  targeting: "currentTarget",
  range: 220,
  effects: [
    { kind: "move", style: "dash", toTarget: true, iframes: 0.2 },
    { kind: "damage", damage: { base: 1.5, scale: "attack", type: "physical", canCrit: true }, to: "target" },
    { kind: "status", status: "stunned", chance: 0.5, to: "target" },
    { kind: "status", status: "flow", chance: 1, to: "self" },
  ],
};

export const MONK_SEVEN_POINT_COMBO: Ability = {
  id: "monk.seven_point_combo",
  classId: "monk",
  name: "Seven-Point Combo",
  description: "Seven strikes to seven points, each one harder than the last, ending on a full-body blow.",
  flavor: "The seventh one is the only one they'll remember.",
  category: "attack",
  tags: ["melee", "channel", "resourceSpender"],
  costs: [{ resource: "chi", amount: 5 }],
  cooldown: 12,
  channel: { duration: 1.6, ticks: 7 },
  targeting: "currentTarget",
  range: 60,
  effects: [
    { kind: "damage", damage: { base: 0.4, scale: "attack", type: "physical", canCrit: true, channel: "periodic" }, to: "target" },
    { kind: "delay", seconds: 1.6, effects: [
      { kind: "damage", damage: { base: 2.4, scale: "attack", type: "physical", canCrit: true, knockback: 60 }, to: "target" },
    ] },
  ],
  mutationHooks: [{ id: "seven_point_combo.channel", kind: "targeting", note: "Infinite Sequence lets the combo loop while Flow holds." }],
};

export const MONK_EMPTY_HAND: Ability = {
  id: "monk.empty_hand",
  classId: "monk",
  name: "Empty Hand",
  description: "For a few seconds your strikes pass straight through armor and wards.",
  flavor: "There is nothing in the hand. That is why nothing stops it.",
  category: "support",
  tags: ["support"],
  cooldown: 18,
  targeting: "self",
  effects: [
    { kind: "resource", resource: "chi", delta: 3, to: "self" },
    { kind: "status", status: "flow", chance: 1, stacks: 3, to: "self" },
  ],
  mutationHooks: [{ id: "empty_hand.rule", kind: "damagePacket", note: "Master path turns this into a counter window." }],
};

export const MONK_AFTERIMAGE_STEP: Ability = {
  id: "monk.afterimage_step",
  classId: "monk",
  name: "Afterimage Step",
  description: "Dash through a target so fast you leave a copy of yourself behind, repeating your last strike.",
  flavor: "Both of you are correct about where the Monk is.",
  category: "movement",
  tags: ["dash", "movement", "summon", "illusion"],
  cooldown: 14,
  targeting: "currentTarget",
  range: 200,
  effects: [
    { kind: "move", style: "dash", toTarget: true, leaveAnchor: true, iframes: 0.3 },
    { kind: "summon", unit: "monk_afterimage", count: 1, duration: 5, command: { behavior: "guardPoint", inheritPower: 0.5 } },
    { kind: "damage", damage: { base: 1.2, scale: "attack", type: "physical", canCrit: true }, to: "target" },
  ],
  mutationHooks: [{ id: "afterimage_step.summon", kind: "summon", note: "Water Step spawns an afterimage on every dash." }],
};

export const MONK_INNER_CALM: Ability = {
  id: "monk.inner_calm",
  classId: "monk",
  name: "Inner Calm",
  description: "Stop and centre. A short meditation that pours Chi back and mends what a fight took.",
  flavor: "The fight will still be there. It is very patient.",
  category: "support",
  tags: ["heal", "channel", "resourceGenerator"],
  cooldown: 22,
  channel: { duration: 2, ticks: 4 },
  targeting: "self",
  effects: [
    { kind: "heal", amount: 0.25, scale: "attack", to: "self", overTime: { duration: 2 } },
    { kind: "resource", resource: "chi", delta: 8, to: "self" },
  ],
};

export const MONK_HEAVENLY_FIST: Ability = {
  id: "monk.heavenly_fist",
  classId: "monk",
  name: "Heavenly Fist",
  description: "Leap out of sight and come down as one enormous strike. The impact lands, then a beat later the shockwave does.",
  flavor: "It is a punch. It is a very large punch, thrown from a considerable height.",
  category: "ultimate",
  tags: ["ultimate", "heavy", "area", "movement", "melee"],
  cooldown: 0,
  isUltimate: true,
  targeting: "point",
  range: 300,
  shape: { radius: 150 },
  telegraph: { shape: "circle", windup: 0.8, radius: 150 },
  effects: [
    { kind: "move", style: "vault", iframes: 0.6 },
    { kind: "damage", damage: { base: 3.6, scale: "attack", type: "physical", canCrit: true, channel: "ultimate", knockback: 120 }, to: "enemies" },
    { kind: "delay", seconds: 0.7, effects: [
      { kind: "damage", damage: { base: 2.4, scale: "attack", type: "physical", canCrit: true, channel: "ultimate" }, to: "enemies" },
      { kind: "status", status: "stunned", chance: 1, to: "enemies" },
    ] },
  ],
  mutationHooks: [{ id: "heavenly_fist.followup", kind: "followUp", note: "Infinite Motion lets the Monk keep comboing on landing." }],
};

export const MONK_ABILITIES: readonly Ability[] = [
  MONK_PALM_STRIKE,
  MONK_RISING_PALM,
  MONK_CRANE_SWEEP,
  MONK_BREATH_CONTROL,
  MONK_FLYING_KNEE,
  MONK_SEVEN_POINT_COMBO,
  MONK_EMPTY_HAND,
  MONK_AFTERIMAGE_STEP,
  MONK_INNER_CALM,
  MONK_HEAVENLY_FIST,
];

// --- the tree --------------------------------------------------------

export const MONK_PROGRESSION: ClassProgression = {
  classId: "monk",
  paths: [
    // 0 — Combo Master: the chain never has to end.
    {
      name: "Combo Master",
      blurb: "A combo is only broken if you let it break.",
      nodes: [
        { name: "Count the Beats", category: "foundation", effects: [{ kind: "mods", mods: { attackSpeed: 0.06 } }, { kind: "grantEffect", on: { tag: "melee" }, effects: [{ kind: "status", status: "flow", chance: 1, to: "self" }] }] },
        { name: "Extend", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "cm.extend", label: "Flow lasts longer between strikes", target: { withTag: "melee" }, ops: [{ kind: "status", scaleDuration: 1.5 }] } }] },
        { name: "Momentum", category: "resource", effects: [{ kind: "resourceRule", resource: "chi", patch: { decayPerSec: 0.4, max: 14 } }] },
        { name: "Seamless", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "cm.seamless", label: "Seven-Point Combo loops while Flow is high", target: { abilityId: "monk.seven_point_combo" }, ops: [{ kind: "cooldown", scale: 0.6 }] } }] },
        { name: "Infinite Sequence", category: "keystone", effects: [{ kind: "rule", rule: "monk.cm.infinite_sequence", note: "At 8 Flow, melee skills cost no cooldown as long as you never repeat one." }] },
      ],
    },
    // 1 — Iron Body: the fist that doesn't need a guard.
    {
      name: "Iron Body",
      blurb: "Conditioning is a defensive cooldown that never runs out.",
      nodes: [
        { name: "Conditioning", category: "foundation", effects: [{ kind: "mods", mods: { defensePercent: 0.1, maxHealth: 15 } }] },
        { name: "Roll With It", category: "behavior", effects: [{ kind: "rule", rule: "monk.ib.roll_with_it", note: "Spending Chi converts a fraction of the next hit into Flow instead of damage." }] },
        { name: "Steady Breath", category: "resource", effects: [{ kind: "resourceRule", resource: "chi", patch: { addGeneration: [{ on: "hitTaken", amount: 0.5 }] } }] },
        { name: "Diamond Skin", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ib.diamond_skin", label: "Breath Control also shields", target: { abilityId: "monk.breath_control" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "shield", amount: 1.2, scale: "attack", to: "self", duration: 5 }] }] } }] },
        { name: "Adamant Form", category: "keystone", effects: [{ kind: "rule", rule: "monk.ib.adamant_form", note: "While Flow is above half, crowd control cannot land on you." }] },
      ],
    },
    // 2 — Flow: water-step mobility.
    {
      name: "Flow",
      blurb: "The fastest route between two strikes is a curve.",
      nodes: [
        { name: "Light Step", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.1 } }] },
        { name: "Redirect", category: "behavior", effects: [{ kind: "grantEffect", on: { tag: "dash" }, effects: [{ kind: "status", status: "flow", chance: 1, to: "self" }] }] },
        { name: "Current", category: "resource", effects: [{ kind: "resourceRule", resource: "chi", patch: { addGeneration: [{ on: "dashStart", amount: 1.5 }] } }] },
        { name: "Slipstream", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "fl.slipstream", label: "Flying Knee passes through and can chain to a second target", target: { abilityId: "monk.flying_knee" }, ops: [{ kind: "cooldown", scale: 0.7 }, { kind: "movement", addDistance: 60 }] } }] },
        { name: "Water Step", category: "keystone", effects: [{ kind: "rule", rule: "monk.fl.water_step", note: "Every dash leaves an afterimage that repeats your last strike." }] },
      ],
    },
    // 3 — Inner Flame: the elemental martial art.
    {
      name: "Inner Flame",
      blurb: "The breath carries heat when you ask it to.",
      nodes: [
        { name: "Kindle", category: "foundation", effects: [{ kind: "mods", mods: { fireDamage: 0.15 } }, { kind: "grantEffect", on: { tag: "melee" }, effects: [{ kind: "status", status: "burn", chance: 0.25, to: "allTargets" }] }] },
        { name: "Stoke", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "if.stoke", label: "your burns spread on a killing blow", target: { withTag: "burn" }, ops: [{ kind: "status", scaleDuration: 1.3 }] } }] },
        { name: "Bellows", category: "resource", effects: [{ kind: "resourceRule", resource: "chi", patch: { addGeneration: [{ on: "ailmentInflicted", amount: 0.5, requireTags: ["burn"] }] } }] },
        { name: "Fire Palm", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "if.fire_palm", label: "Palm Strike becomes fire and pierces", target: { abilityId: "monk.palm_strike" }, ops: [{ kind: "damagePacket", setType: "fire", setInflict: { status: "burn", chance: 1 } }] } }] },
        { name: "Dragon Breath", category: "keystone", effects: [{ kind: "rule", rule: "monk.if.dragon_breath", note: "Seven-Point Combo's finisher exhales a cone of fire scaled by Flow." }] },
      ],
    },
    // 4 — Master: it is all about the timing.
    {
      name: "Master",
      blurb: "Do nothing until the exact moment. Then do everything.",
      nodes: [
        { name: "Read", category: "foundation", effects: [{ kind: "mods", mods: { critChance: 0.05, cooldownRate: 0.05 } }] },
        { name: "Catch", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "ma.catch", label: "Empty Hand becomes a parry window", target: { abilityId: "monk.empty_hand" }, ops: [{ kind: "trigger", event: "damageTaken", window: 1.5, effects: [{ kind: "damage", damage: { base: 1.8, scale: "attack", type: "physical", channel: "retaliation" }, to: "enemies" }] }] } }] },
        { name: "Stillness", category: "resource", effects: [{ kind: "resourceRule", resource: "chi", patch: { addGeneration: [{ on: "block", amount: 2 }] } }] },
        { name: "One Inch", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ma.one_inch", label: "Palm Strike from a standstill hits like a heavy blow", target: { abilityId: "monk.palm_strike" }, ops: [{ kind: "damagePacket", scaleBase: 1.6 }] } }] },
        { name: "Empty Mind", category: "keystone", effects: [{ kind: "rule", rule: "monk.ma.empty_mind", note: "A strike landed in the first 0.2s of an enemy's wind-up always crits and interrupts." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `monk.${id}`,
  classId: "monk",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `monk.hybrid.${id}` }],
  ...extra,
});

export const MONK_UNLOCKS: PathUnlockDef[] = [
  H("endless_chain", "Endless Chain", "A dash counts as a distinct strike for the combo, so movement never drops your Flow.", "Combo Master", "Flow", {
    effects: [
      { kind: "rule", rule: "monk.hybrid.endless_chain" },
      { kind: "grantEffect", on: { tag: "dash" }, effects: [{ kind: "status", status: "flow", chance: 1, to: "self" }] },
    ],
    ui: { badge: "CHN" },
  }),
  H("dragon_combo", "Dragon Combo", "Each strike in a chain adds a stack of burn; the seventh detonates all of them.", "Combo Master", "Inner Flame", {
    mutations: [{ id: "monk.dragon_combo", label: "combo strikes ignite", target: { withTag: "melee" }, ops: [{ kind: "damagePacket", setInflict: { status: "burn", chance: 0.5 } }] }],
    ui: { badge: "DRG" },
  }),
  H("counter_body", "Counter Body", "Any hit that gets through your Iron Body mitigation triggers an automatic Palm Strike back.", "Iron Body", "Master", {
    effects: [
      { kind: "rule", rule: "monk.hybrid.counter_body" },
      { kind: "grantEffect", on: { event: "damageTaken" }, effects: [{ kind: "damage", damage: { base: 0.8, scale: "attack", type: "physical", channel: "retaliation" }, to: "enemies" }] },
    ],
    ui: { badge: "CB" },
  }),
  H("ghost_fist", "Ghost Fist", "Afterimages left by Water Step also mimic your counters.", "Flow", "Master", {
    mutations: [{ id: "monk.ghost_fist", label: "afterimages last longer and hit harder", target: { withTag: "illusion" }, ops: [{ kind: "summon", scaleDuration: 1.5, addInheritPower: 0.3 }] }],
    ui: { badge: "GST" },
  }),
  H("furnace", "Furnace", "While Iron Body's Flow floor holds, you radiate a ring of fire that scales with Chi.", "Iron Body", "Inner Flame", {
    effects: [{ kind: "rule", rule: "monk.hybrid.furnace" }],
    ui: { badge: "FRN" },
  }),
  H("unbreakable_rhythm", "Unbreakable Rhythm", "Taking a hit no longer drops your combo — only missing a beat does.", "Combo Master", "Iron Body", {
    effects: [{ kind: "rule", rule: "monk.hybrid.unbreakable_rhythm" }],
    ui: { badge: "URH" },
  }),
  {
    id: "monk.infinite_motion",
    classId: "monk",
    tier: "mythic",
    name: "Infinite Motion",
    description: "Heavenly Fist stops ending your combo. On landing, Flow is capped and locked for a few seconds, every melee skill is free, and dashing through an enemy refreshes the lock — a window where the Monk simply does not stop.",
    flavor: "Level 30: holy shit, I unlocked Infinite Motion.",
    requires: [
      { path: "Combo Master", points: 6 },
      { path: "Flow", points: 4 },
      { path: "Master", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "monk.mythic.infinite_motion" }],
    mutations: [{
      id: "monk.infinite_motion.heavenly_fist",
      label: "Heavenly Fist → Infinite Motion",
      target: { abilityId: "monk.heavenly_fist" },
      ops: [
        { kind: "followUp", window: 5, effects: [{ kind: "status", status: "flow", chance: 1, stacks: 8, to: "self" }] },
        { kind: "addEffect", at: "end", effects: [{ kind: "resource", resource: "chi", delta: 10, to: "self" }] },
      ],
    }],
    ui: { badge: "IMOT" },
  },
];

export const MONK: PilotClass = {
  classId: "monk",
  name: "Monk",
  fantasy: "High-skill martial artist centered on combo maintenance, Chi, movement, and disciplined timing.",
  role: "Mobile melee DPS / sustain / disruption.",
  question: "Can I maintain a perfect combat rhythm?",
  resources: MONK_RESOURCES,
  statuses: MONK_STATUSES,
  abilities: MONK_ABILITIES,
  progression: MONK_PROGRESSION,
  unlocks: MONK_UNLOCKS,
};
