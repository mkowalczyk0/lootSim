/**
 * Reaper — the mass executioner. Souls are harvested from kills and branded deaths and
 * spent on sustain, shielding, and mobility. The ultimate meter fills only when you
 * finish something already dying. The paths are five ways to turn a low health bar
 * into the next kill: harvest volume, execution thresholds, wraith mobility, scythe
 * AoE, and a defensive soul reserve.
 *
 * Question: how efficiently can I convert low health bars into more kills?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const REAPER_SOULS: ResourceSpec = {
  id: "reaped_souls",
  label: "Souls",
  max: 20,
  start: "empty",
  ui: "pips",
  generation: [
    { on: "kill", amount: 1 },
    { on: "enemyDeath", amount: 1, requireTags: ["mark"] },
  ],
  thresholds: [{ at: 15, whileAbove: { moveSpeed: 0.08, lifeOnHit: 3 } }],
};

/** Death Comes Due is earned by finishing the dying — execute hits, never a fresh kill. */
export const REAPER_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "The Reaping",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "kill", amount: 8, requireTags: ["execute"] },
    { on: "hitDealt", amount: 2, requireTags: ["execute"] },
  ],
};

export const REAPER_RESOURCES: readonly ResourceSpec[] = [REAPER_SOULS, REAPER_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Reaped — Soul Brand's mark. A branded death is worth a Soul and pulls the Reaper's tools toward it. */
export const STATUS_REAPED: StatusSpec = {
  id: "reaped",
  label: "Reaped",
  glyph: "R",
  category: "debuff",
  tags: ["mark", "curse"],
  baseDuration: 10,
  maxStacks: 1,
  refreshRule: "refresh",
  amplify: 1.12,
};

export const REAPER_STATUSES: readonly StatusSpec[] = [STATUS_REAPED];

// --- abilities --------------------------------------------------------

export const REAPER_REAPING_ARC = {
  id: "reaper.reaping_arc",
  classId: "reaper",
  name: "Reaping Arc",
  description: "A single enormous semicircular sweep of the scythe — the whole front half of the room.",
  flavor: "One motion. It contains a lot of other motions.",
  category: "attack",
  tags: ["melee", "slash", "area"],
  cooldown: 4,
  targeting: "cone",
  range: 150,
  fx: { travel: "lance" },
  shape: { length: 150, arc: Math.PI },
  effects: [
    { kind: "damage", damage: { base: 1.4, scale: "attack", type: "physical", canCrit: true, executeMissingHealth: 0.2 }, to: "allTargets" },
  ],
  mutationHooks: [{ id: "reaping_arc.targeting", kind: "targeting", note: "Scythe Lord widens this to a full circle." }],
} as const satisfies Ability;

export const REAPER_SOUL_BRAND = {
  id: "reaper.soul_brand",
  classId: "reaper",
  name: "Soul Brand",
  description: "Brand a target. When it dies — by any hand — it leaves a Soul the Reaper can collect.",
  flavor: "A receipt, issued in advance.",
  category: "utility",
  tags: ["mark"],
  cooldown: 4,
  targeting: "currentTarget",
  range: 240,
  fx: { travel: "beam" },
  effects: [
    { kind: "status", status: "reaped", chance: 1, to: "target" },
  ],
  mutationHooks: [{ id: "soul_brand.status", kind: "status", note: "Endless Harvest spreads the brand on death." }],
} as const satisfies Ability;

export const REAPER_GRAVE_SWEEP = {
  id: "reaper.grave_sweep",
  classId: "reaper",
  name: "Grave Sweep",
  description: "Advance while sweeping the scythe low and level — a moving wall of blade.",
  flavor: "Walk forward. The scythe handles the rest.",
  category: "attack",
  tags: ["melee", "slash", "area", "movement"],
  cooldown: 8,
  targeting: "line",
  range: 160,
  shape: { width: 120, length: 160 },
  effects: [
    { kind: "move", style: "dash", distance: 120, iframes: 0.15 },
    { kind: "damage", damage: { base: 1.2, scale: "attack", type: "physical", canCrit: true }, to: "allTargets" },
  ],
} as const satisfies Ability;

export const REAPER_WRAITH_DASH = {
  id: "reaper.wraith_dash",
  classId: "reaper",
  name: "Wraith Dash",
  description: "Go briefly incorporeal and drift through everything — bodies, walls, attacks.",
  flavor: "The Reaper was never entirely here to begin with.",
  category: "movement",
  tags: ["dash", "movement"],
  cooldown: 7,
  targeting: "direction",
  range: 200,
  effects: [
    { kind: "move", style: "blink", distance: 200, iframes: 0.5 },
  ],
  mutationHooks: [{ id: "wraith_dash.movement", kind: "movement", note: "Wraith path lengthens the incorporeal window." }],
} as const satisfies Ability;

export const REAPER_HARVEST_LIFE = {
  id: "reaper.harvest_life",
  classId: "reaper",
  name: "Harvest Life",
  description: "Crush a fistful of Souls and pull the life out of them to close your own wounds.",
  flavor: "They weren't using it.",
  category: "support",
  tags: ["heal", "resourceSpender"],
  costs: [{ resource: "reaped_souls", amount: 4 }],
  cooldown: 6,
  targeting: "self",
  effects: [
    { kind: "heal", amount: 1.2, scale: "attack", to: "self" },
  ],
} as const satisfies Ability;

export const REAPER_PALE_HOOK = {
  id: "reaper.pale_hook",
  classId: "reaper",
  name: "Pale Hook",
  description: "A spectral hook that only catches on the wounded — it drags low-health enemies to your feet.",
  flavor: "It does not bother with the healthy. There is no point.",
  category: "utility",
  tags: ["crowdControl"],
  cooldown: 9,
  targeting: "direction",
  range: 260,
  fx: { travel: "lance" },
  effects: [
    { kind: "pull", force: 180, to: "enemies" },
    { kind: "status", status: "reaped", chance: 1, to: "enemies" },
  ],
} as const satisfies Ability;

export const REAPER_EXECUTIONERS_STEP = {
  id: "reaper.executioners_step",
  classId: "reaper",
  name: "Executioner's Step",
  description: "Blink to the lowest-health enemy in range and bring the scythe down on it.",
  flavor: "The Reaper does not chase. The Reaper arrives.",
  category: "attack",
  tags: ["teleport", "movement", "execute", "melee"],
  cooldown: 8,
  targeting: "currentTarget",
  range: 300,
  effects: [
    { kind: "move", style: "teleport", toTarget: true, iframes: 0.2 },
    { kind: "damage", damage: { base: 2.0, scale: "attack", type: "physical", canCrit: true, executeMissingHealth: 0.5 }, to: "target" },
  ],
  mutationHooks: [{ id: "executioners_step.packet", kind: "damagePacket", note: "Final Sentence raises the execute threshold." }],
} as const satisfies Ability;

export const REAPER_SOUL_SHIELD = {
  id: "reaper.soul_shield",
  classId: "reaper",
  name: "Soul Shield",
  description: "Bind your Souls into a barrier — every one you spend soaks a chunk of the next hits.",
  flavor: "A wall of the recently deceased. It holds surprisingly well.",
  category: "support",
  tags: ["barrier", "shield", "resourceSpender"],
  costs: [{ resource: "reaped_souls", amount: 5 }],
  cooldown: 14,
  targeting: "self",
  effects: [
    { kind: "shield", amount: 2.0, scale: "attack", to: "self", duration: 6 },
  ],
  mutationHooks: [{ id: "soul_shield.shield", kind: "zone", note: "Soul Fortress projects the shield to allies." }],
} as const satisfies Ability;

export const REAPER_MARCH_OF_THE_REAPED = {
  id: "reaper.march_of_the_reaped",
  classId: "reaper",
  name: "March of the Reaped",
  description: "Raise a column of spectral copies that mirror your basic attacks for a while.",
  flavor: "Everyone the Reaper has collected today, briefly back on their feet, and working.",
  category: "summon",
  tags: ["summon", "spirit"],
  costs: [{ resource: "reaped_souls", amount: 6 }],
  cooldown: 20,
  targeting: "self",
  effects: [
    { kind: "summon", unit: "reaped_wraith", count: 3, duration: 12, command: { behavior: "follow", inheritPower: 0.5 } },
  ],
} as const satisfies Ability;

export const REAPER_DEATH_COMES_DUE = {
  id: "reaper.death_comes_due",
  classId: "reaper",
  name: "Death Comes Due",
  description: "Time freezes for everything below a health threshold. The Reaper walks the field and takes each one with a single spectral cut.",
  flavor: "The bill was always coming. This is just the collection.",
  category: "ultimate",
  tags: ["ultimate", "execute", "crowdControl"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  effects: [
    { kind: "fx", fx: "reaper.time_freeze" },
    { kind: "status", status: "freeze", chance: 1, to: "enemiesEverywhere" },
    { kind: "delay", seconds: 0.4, effects: [
      // 0.8 → 1.0 is the §20 payback, and it is a consequence of the rule rather than a
      // top-up. Under the un-thresholded term this number meant "fraction of missing
      // health at *any* health", so it had to stay small — it was being paid out against
      // healthy targets. Under THE EXECUTE RULE it means "fraction of max health at the
      // moment of death", and 1.0 is that scale's natural ceiling: at 0 HP the rider is
      // exactly the target's whole bar. For an ability named "Death Comes Due", collecting
      // the entire bill is the definition, not an escalation. Measured against master this
      // is still far weaker in the band that matters (at 35% health on a Ferryman: 54,830
      // → 31,633) and exactly zero above the threshold, where the complaint came from.
      { kind: "damage", damage: { base: 2.4, scale: "attack", type: "physical", canCrit: true, channel: "ultimate", executeMissingHealth: 1.0 }, to: "enemiesEverywhere" },
    ] },
  ],
  mutationHooks: [{ id: "death_comes_due.packet", kind: "damagePacket", note: "The Final Harvest raises the threshold and pays out Souls per kill." }],
} as const satisfies Ability;

export const REAPER_ABILITIES = [
  REAPER_REAPING_ARC,
  REAPER_SOUL_BRAND,
  REAPER_GRAVE_SWEEP,
  REAPER_WRAITH_DASH,
  REAPER_HARVEST_LIFE,
  REAPER_PALE_HOOK,
  REAPER_EXECUTIONERS_STEP,
  REAPER_SOUL_SHIELD,
  REAPER_MARCH_OF_THE_REAPED,
  REAPER_DEATH_COMES_DUE,
] as const satisfies readonly Ability[];

// --- the tree --------------------------------------------------------

export const REAPER_PROGRESSION: ClassProgression = {
  classId: "reaper",
  paths: [
    // 0 — Soul Harvest: volume.
    {
      name: "Soul Harvest",
      blurb: "Every death on the field should leave something in your hand.",
      nodes: [
        { name: "Gleaner", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.05 } }, { kind: "grantEffect", on: { event: "enemyDeath" }, effects: [{ kind: "resource", resource: "reaped_souls", delta: 1, to: "self" }] }] },
        { name: "Wide Net", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "sh.wide_net", label: "Soul Brand tags a small cluster", target: { abilityId: "reaper.soul_brand" }, ops: [{ kind: "targeting", setMode: "radius", addRange: 60 }] } }] },
        { name: "Deep Reserves", category: "resource", effects: [{ kind: "resourceRule", resource: "reaped_souls", patch: { max: 30 } }] },
        { name: "Threshing", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "sh.threshing", label: "Reaping Arc brands everything it hits", target: { abilityId: "reaper.reaping_arc" }, ops: [{ kind: "damagePacket", setInflict: { status: "reaped", chance: 1 } }] } }] },
        { name: "Endless Harvest", category: "keystone", effects: [{ kind: "rule", rule: "reaper.sh.endless_harvest", note: "A branded death brands the two nearest enemies, chaining the harvest through a pack." }] },
      ],
    },
    // 1 — Executioner: the threshold.
    {
      name: "Executioner",
      blurb: "Anything under the line is already dead. You just formalise it.",
      nodes: [
        { name: "The Line", category: "foundation", effects: [{ kind: "mods", mods: { critDamage: 0.2 } }] },
        { name: "Read the Wound", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "ex.read_the_wound", label: "every hit gains an execute rider", target: { withTag: "melee" }, ops: [{ kind: "damagePacket", addExecuteMissingHealth: 0.1 }] } }] },
        { name: "Collector", category: "resource", effects: [{ kind: "resourceRule", resource: "ultimate", patch: { addGeneration: [{ on: "kill", amount: 5, requireTags: ["execute"] }] } }] },
        { name: "No Reprieve", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ex.no_reprieve", label: "Executioner's Step chains to the next low target on a kill", target: { abilityId: "reaper.executioners_step" }, ops: [{ kind: "cooldown", scale: 0.6 }] } }] },
        { name: "Final Sentence", category: "keystone", effects: [{ kind: "rule", rule: "reaper.ex.final_sentence", note: "Execute effects fire at 40% health instead of 20%, and an executed elite still drops a Soul." }] },
      ],
    },
    // 2 — Wraith: incorporeal mobility.
    {
      name: "Wraith",
      blurb: "You do not walk around the fight. You walk through it.",
      nodes: [
        { name: "Untethered", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.1 } }] },
        { name: "Phase", category: "behavior", effects: [{ kind: "grantEffect", on: { tag: "dash" }, effects: [{ kind: "resource", resource: "reaped_souls", delta: 1, to: "self" }] }] },
        { name: "Ectoplasm", category: "resource", effects: [{ kind: "resourceRule", resource: "reaped_souls", patch: { addGeneration: [{ on: "dashStart", amount: 1 }] } }] },
        { name: "Long Drift", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "wr.long_drift", label: "Wraith Dash goes further and hits on the way through", target: { abilityId: "reaper.wraith_dash" }, ops: [{ kind: "movement", addDistance: 100, addIframes: 0.2 }, { kind: "addEffect", at: "end", effects: [{ kind: "damage", damage: { base: 0.8, scale: "attack", type: "physical" }, to: "enemies" }] }] } }] },
        { name: "Deathless Form", category: "keystone", effects: [{ kind: "rule", rule: "reaper.wr.deathless_form", note: "A hit that would down you instead spends 8 Souls and phases you out for a second." }] },
      ],
    },
    // 3 — Scythe Lord: maximum blade.
    {
      name: "Scythe Lord",
      blurb: "The scythe should never not be moving.",
      nodes: [
        { name: "Long Haft", category: "foundation", effects: [{ kind: "mods", mods: { areaSize: 0.15, meleeDamage: 0.06 } }] },
        { name: "Full Circle", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "sl.full_circle", label: "Reaping Arc is a full 360", target: { abilityId: "reaper.reaping_arc" }, ops: [{ kind: "targeting", setMode: "radius", scaleRadius: 1.2 }, { kind: "addTags", tags: ["nova"] }] } }] },
        { name: "Momentum Blade", category: "resource", effects: [{ kind: "resourceRule", resource: "reaped_souls", patch: { addGeneration: [{ on: "hitDealt", amount: 0.2, requireTags: ["slash"] }] } }] },
        { name: "Wide Grave", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "sl.wide_grave", label: "Grave Sweep is twice as wide and pulls as it passes", target: { abilityId: "reaper.grave_sweep" }, ops: [{ kind: "targeting", scaleWidth: 1.8 }, { kind: "addEffect", at: "end", effects: [{ kind: "pull", force: 40, to: "allTargets" }] }] } }] },
        { name: "World Reaper", category: "keystone", effects: [{ kind: "rule", rule: "reaper.sl.world_reaper", note: "Your scythe attacks leave a lingering blade-plane that keeps cutting for a second." }] },
      ],
    },
    // 4 — Soul Warden: Souls as armour.
    {
      name: "Soul Warden",
      blurb: "The souls you keep are the ones between you and the floor.",
      nodes: [
        { name: "Bulwark of the Dead", category: "foundation", effects: [{ kind: "mods", mods: { defensePercent: 0.08 } }] },
        { name: "Soul Skin", category: "behavior", effects: [{ kind: "rule", rule: "reaper.sw.soul_skin", note: "Above 10 Souls, incoming damage is reduced by a flat fraction." }] },
        { name: "Reliquary", category: "resource", effects: [{ kind: "resourceRule", resource: "reaped_souls", patch: { max: 25, addGeneration: [{ on: "block", amount: 1 }] } }] },
        { name: "Share the Ward", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "sw.share_the_ward", label: "Soul Shield covers nearby allies", target: { abilityId: "reaper.soul_shield" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "shield", amount: 1.0, scale: "attack", to: "allies", duration: 6 }] }] } }] },
        { name: "Soul Fortress", category: "keystone", effects: [{ kind: "rule", rule: "reaper.sw.soul_fortress", note: "Souls are spent automatically to prevent a fatal hit, once per few seconds." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `reaper.${id}`,
  classId: "reaper",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `reaper.hybrid.${id}` }],
  ...extra,
});

export const REAPER_UNLOCKS: PathUnlockDef[] = [
  H("harvest_of_the_guilty", "Harvest of the Guilty", "An execute on a branded target pays out three Souls instead of one.", "Soul Harvest", "Executioner", {
    effects: [
      { kind: "rule", rule: "reaper.hybrid.harvest_of_the_guilty" },
      { kind: "grantEffect", on: { event: "kill" }, effects: [{ kind: "resource", resource: "reaped_souls", delta: 2, to: "self" }] },
    ],
    ui: { badge: "HOG" },
  }),
  H("soul_step", "Soul Step", "Wraith Dash can be aimed at a Soul on the ground — you blink to it and collect it.", "Soul Harvest", "Wraith", {
    effects: [{ kind: "rule", rule: "reaper.hybrid.soul_step" }],
    ui: { badge: "SST" },
  }),
  H("grand_reaping", "Grand Reaping", "Executioner's Step becomes an area execute — it hits every low-health enemy near the target.", "Executioner", "Scythe Lord", {
    mutations: [{ id: "reaper.grand_reaping", label: "the step is an area execute", target: { abilityId: "reaper.executioners_step" }, ops: [{ kind: "targeting", setMode: "radius", addRange: 90 }, { kind: "addTags", tags: ["area"] }] }],
    ui: { badge: "GRP" },
  }),
  H("soulform", "Soulform", "Deathless Form's phase-out leaves a scythe-wraith that keeps fighting while you are gone.", "Wraith", "Soul Warden", {
    effects: [{ kind: "rule", rule: "reaper.hybrid.soulform" }],
    ui: { badge: "SFM" },
  }),
  H("reaping_storm", "Reaping Storm", "Full Circle's blade-plane follows you, so moving through a pack keeps cutting all of them.", "Scythe Lord", "Soul Harvest", {
    mutations: [{ id: "reaper.reaping_storm", label: "the scythe plane follows", target: { withTag: "slash" }, ops: [{ kind: "damagePacket", scaleBase: 1.1 }] }],
    ui: { badge: "RST" },
  }),
  H("deaths_protection", "Death's Protection", "Each execute you land shields the lowest-health ally for a slice of the damage dealt.", "Executioner", "Soul Warden", {
    effects: [
      { kind: "rule", rule: "reaper.hybrid.deaths_protection" },
      { kind: "grantEffect", on: { tag: "execute" }, effects: [{ kind: "shield", amount: 0.6, scale: "attack", to: "lowestHealthAlly", duration: 4 }] },
    ],
    ui: { badge: "DPR" },
  }),
  {
    id: "reaper.the_final_harvest",
    classId: "reaper",
    tier: "mythic",
    name: "The Final Harvest",
    description: "Death Comes Due stops being a moment and becomes a state. Its freeze threshold rises with every enemy it takes, each kill pays a Soul, and while it runs the Reaper's basic scythe swing executes anything under half health outright.",
    flavor: "The collection was never going to end. This is just the Reaper stopping the pretence that it might.",
    requires: [
      { path: "Soul Harvest", points: 6 },
      { path: "Executioner", points: 4 },
      { path: "Scythe Lord", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "reaper.mythic.the_final_harvest" }],
    mutations: [{
      id: "reaper.the_final_harvest.dcd",
      label: "Death Comes Due → The Final Harvest",
      target: { abilityId: "reaper.death_comes_due" },
      ops: [
        { kind: "damagePacket", scaleBase: 1.3, addExecuteMissingHealth: 0.2 },
        { kind: "addEffect", at: "end", effects: [{ kind: "resource", resource: "reaped_souls", delta: 12, to: "self" }] },
      ],
    }],
    ui: { badge: "FHRV" },
  },
];

export const REAPER: PilotClass = {
  classId: "reaper",
  name: "Reaper",
  fantasy: "Mass executioner who turns kills into Souls, sustain, mobility, and further executions.",
  role: "Wave clear / execution / sustain.",
  question: "How efficiently can I convert low health bars into more kills?",
  resources: REAPER_RESOURCES,
  statuses: REAPER_STATUSES,
  abilities: REAPER_ABILITIES,
  progression: REAPER_PROGRESSION,
  unlocks: REAPER_UNLOCKS,
};
