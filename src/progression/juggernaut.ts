/**
 * Juggernaut — the living fortress. Fortify builds while you hold ground and take
 * hits, bleeds the instant you break stance, and at its peak makes you nearly
 * immovable. The ultimate meter is fed purely by damage you soak. The paths are five
 * ways to be a wall: mitigation, siege offense, ally cover, threat control, and a
 * fortress that walks.
 *
 * Question: how do I become the place the party can safely stand?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const JUGGERNAUT_FORTIFY: ResourceSpec = {
  id: "fortify",
  label: "Fortify",
  max: 100,
  start: "empty",
  ui: "bar",
  decayPerSec: 25,
  decayDelay: 0.5,
  generation: [
    { on: "hitTaken", amount: 6 },
    { on: "block", amount: 10 },
  ],
  thresholds: [
    { at: 50, whileAbove: { defensePercent: 0.15 } },
    { at: 90, whileAbove: { defensePercent: 0.3, thorns: 8 } },
  ],
};

/** The Juggernaut earns Citadel by absorbing punishment — never by dealing it. */
export const JUGGERNAUT_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Citadel",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "damageTaken", amount: 20, perUnit: "maxHealthFraction" },
    { on: "damagePrevented", amount: 25, perUnit: "maxHealthFraction" },
  ],
};

export const JUGGERNAUT_RESOURCES: readonly ResourceSpec[] = [JUGGERNAUT_FORTIFY, JUGGERNAUT_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Sundered — Tremor Blow's armor crack: the Demolitionist path's opening. */
export const STATUS_SUNDERED: StatusSpec = {
  id: "sundered",
  label: "Sundered",
  glyph: "u",
  category: "debuff",
  tags: ["vulnerable", "physical"],
  baseDuration: 6,
  maxStacks: 4,
  refreshRule: "stack",
  amplify: 1.08,
};

export const JUGGERNAUT_STATUSES: readonly StatusSpec[] = [STATUS_SUNDERED];

// --- abilities --------------------------------------------------------

export const JUGGERNAUT_HAMMERFALL: Ability = {
  id: "juggernaut.hammerfall",
  classId: "juggernaut",
  name: "Hammerfall",
  description: "Bring the weapon down with both hands. A short, wide stun that ignores armor.",
  flavor: "Not a fast attack. It does not need to be.",
  category: "attack",
  tags: ["melee", "heavy", "crowdControl", "physical"],
  cooldown: 8,
  castTime: 0.4,
  targeting: "cone",
  range: 90,
  shape: { length: 90, arc: Math.PI * 0.6 },
  telegraph: { shape: "cone", windup: 0.4, arc: Math.PI * 0.6 },
  effects: [
    { kind: "damage", damage: { base: 2.2, scale: "attack", type: "physical", canCrit: true }, to: "allTargets" },
    { kind: "status", status: "stunned", chance: 1, to: "allTargets" },
  ],
};

export const JUGGERNAUT_BASTION_STANCE: Ability = {
  id: "juggernaut.bastion_stance",
  classId: "juggernaut",
  name: "Bastion Stance",
  description: "Set your feet toward a direction. Damage from that arc is heavily blunted while you don't move.",
  flavor: "A door, but with opinions about which way it opens.",
  category: "support",
  tags: ["barrier", "shield"],
  cooldown: 12,
  targeting: "self",
  effects: [
    { kind: "shield", amount: 2.0, scale: "attack", to: "self", duration: 6 },
    { kind: "resource", resource: "fortify", delta: 25, to: "self" },
  ],
  mutationHooks: [{ id: "bastion_stance.shield", kind: "zone", note: "Guardian Wall extends the arc to allies behind you." }],
};

export const JUGGERNAUT_IRON_MARCH: Ability = {
  id: "juggernaut.iron_march",
  classId: "juggernaut",
  name: "Iron March",
  description: "Advance in a straight line at a walk that nothing stops. Enemies are shoved aside, not through.",
  flavor: "It is not a charge. A charge can be dodged. This is a schedule.",
  category: "movement",
  tags: ["charge", "movement", "physical"],
  cooldown: 14,
  targeting: "line",
  range: 240,
  shape: { width: 50, length: 240 },
  effects: [
    { kind: "move", style: "charge", distance: 240, iframes: 0.2 },
    { kind: "damage", damage: { base: 1.4, scale: "attack", type: "physical", canCrit: true, knockback: 70 }, to: "allTargets" },
    { kind: "threat", op: "generate", amount: 30, to: "allTargets" },
  ],
  mutationHooks: [{ id: "iron_march.movement", kind: "movement", note: "Rolling Mountain builds speed the longer it runs." }],
};

export const JUGGERNAUT_SHIELDLESS_GUARD: Ability = {
  id: "juggernaut.shieldless_guard",
  classId: "juggernaut",
  name: "Shieldless Guard",
  description: "Drop your weapon arm and cover up. Massive damage reduction, but you cannot attack while it holds.",
  flavor: "The trade is honest: everything for nothing.",
  category: "support",
  tags: ["barrier"],
  cooldown: 20,
  channel: { duration: 3, ticks: 1 },
  targeting: "self",
  effects: [
    { kind: "shield", amount: 4.0, scale: "attack", to: "self", duration: 3 },
    { kind: "resource", resource: "fortify", delta: 40, to: "self" },
  ],
};

export const JUGGERNAUT_TREMOR_BLOW: Ability = {
  id: "juggernaut.tremor_blow",
  classId: "juggernaut",
  name: "Tremor Blow",
  description: "Strike the ground toward a direction; the shock travels out in a widening wedge, cracking armor.",
  flavor: "The floor is also an enemy now, apparently.",
  category: "attack",
  tags: ["melee", "area", "line", "physical", "heavy"],
  cooldown: 9,
  targeting: "line",
  range: 200,
  shape: { width: 60, length: 200 },
  effects: [
    { kind: "damage", damage: { base: 1.7, scale: "attack", type: "physical", canCrit: true }, to: "allTargets" },
    { kind: "status", status: "sundered", chance: 1, stacks: 2, to: "allTargets" },
  ],
  mutationHooks: [{ id: "tremor_blow.status", kind: "status", note: "Demolitionist path deepens the sunder." }],
};

export const JUGGERNAUT_ANCHOR_RUNE: Ability = {
  id: "juggernaut.anchor_rune",
  classId: "juggernaut",
  name: "Anchor Rune",
  description: "Carve a rune into the floor. Nothing inside its circle — friend or foe — can be pulled, knocked, or teleported.",
  flavor: "A small area of the world that has decided to stop negotiating.",
  category: "terrain",
  tags: ["zone", "terrain", "support", "crowdControl"],
  cooldown: 16,
  targeting: "point",
  range: 140,
  effects: [
    { kind: "zone", zone: { radius: 120, duration: 10, tickInterval: 1, follows: false, benefit: "shield" } },
    { kind: "terrain", piece: "anchor", duration: 10, hp: 0 },
  ],
};

export const JUGGERNAUT_RETALIATION_PLATE: Ability = {
  id: "juggernaut.retaliation_plate",
  classId: "juggernaut",
  name: "Retaliation Plate",
  description: "For a few seconds, damage you take is banked instead of felt — then released as a shockwave.",
  flavor: "Interest is charged.",
  category: "support",
  tags: ["counter", "barrier"],
  cooldown: 18,
  targeting: "self",
  effects: [
    { kind: "shield", amount: 1.5, scale: "attack", to: "self", duration: 3 },
    { kind: "reactive", event: "damageTaken", window: 3, effects: [{ kind: "damage", damage: { base: 0.8, scale: "attack", type: "physical", channel: "retaliation" }, to: "enemies" }] },
    { kind: "delay", seconds: 3, effects: [{ kind: "damage", damage: { base: 2.4, scale: "attack", type: "physical", canCrit: true, knockback: 100 }, to: "enemies" }] },
  ],
};

export const JUGGERNAUT_FORTRESS_CALL: Ability = {
  id: "juggernaut.fortress_call",
  classId: "juggernaut",
  name: "Fortress Call",
  description: "Bellow a challenge: nearby enemies must come at you, and allies behind you take a share of their hits off your plate.",
  flavor: "Get behind me is not a suggestion when the Juggernaut says it.",
  category: "support",
  tags: ["taunt", "threat", "support"],
  cooldown: 22,
  targeting: "self",
  effects: [
    { kind: "threat", op: "taunt", radius: 200, to: "enemies" },
    { kind: "redirect", fraction: 0.4, duration: 6, to: "allies" },
  ],
  mutationHooks: [{ id: "fortress_call.redirect", kind: "trigger", note: "Champion's Challenge focuses this on one elite." }],
};

export const JUGGERNAUT_MOUNTAINS_WEIGHT: Ability = {
  id: "juggernaut.mountains_weight",
  classId: "juggernaut",
  name: "Mountain's Weight",
  description: "Root yourself. Total crowd-control immunity and extreme mitigation — at the cost of moving at a crawl.",
  flavor: "You can leave whenever you like. It will just take a while.",
  category: "support",
  tags: ["barrier"],
  cooldown: 40,
  channel: { duration: 6, ticks: 1 },
  targeting: "self",
  effects: [
    { kind: "shield", amount: 6.0, scale: "attack", to: "self", duration: 6 },
    { kind: "cleanse", category: "cc", to: "self" },
    { kind: "resource", resource: "fortify", delta: 100, to: "self" },
  ],
};

export const JUGGERNAUT_CITADEL: Ability = {
  id: "juggernaut.citadel",
  classId: "juggernaut",
  name: "Citadel",
  description: "Plant yourself and become a fortress: a ring of stone rises, allies inside it are shielded and cannot be reached by anything that isn't already in with them.",
  flavor: "Four walls, a roof, and a very annoyed foundation.",
  category: "ultimate",
  tags: ["ultimate", "barrier", "terrain", "support"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  effects: [
    { kind: "terrain", piece: "wall", length: 260, duration: 12, hp: 400 },
    { kind: "zone", zone: { radius: 130, duration: 12, tickInterval: 0.5, follows: false, benefit: "shield" } },
    { kind: "threat", op: "taunt", radius: 260, to: "enemies" },
  ],
  mutationHooks: [{ id: "citadel.zone", kind: "zone", note: "The Keep makes the fortress mobile and reflects what it stops." }],
};

export const JUGGERNAUT_ABILITIES: readonly Ability[] = [
  JUGGERNAUT_HAMMERFALL,
  JUGGERNAUT_BASTION_STANCE,
  JUGGERNAUT_IRON_MARCH,
  JUGGERNAUT_SHIELDLESS_GUARD,
  JUGGERNAUT_TREMOR_BLOW,
  JUGGERNAUT_ANCHOR_RUNE,
  JUGGERNAUT_RETALIATION_PLATE,
  JUGGERNAUT_FORTRESS_CALL,
  JUGGERNAUT_MOUNTAINS_WEIGHT,
  JUGGERNAUT_CITADEL,
];

// --- the tree --------------------------------------------------------

export const JUGGERNAUT_PROGRESSION: ClassProgression = {
  classId: "juggernaut",
  paths: [
    // 0 — Fortress: raw mitigation and the Fortify loop.
    {
      name: "Fortress",
      blurb: "The number that matters is how much you didn't feel.",
      nodes: [
        { name: "Thick Plate", category: "foundation", effects: [{ kind: "mods", mods: { defensePercent: 0.1, maxHealth: 20 } }] },
        { name: "Set Stance", category: "behavior", effects: [{ kind: "rule", rule: "juggernaut.ft.set_stance", note: "Standing still one second grants a stacking damage floor." }] },
        { name: "Slow to Yield", category: "resource", effects: [{ kind: "resourceRule", resource: "fortify", patch: { decayPerSec: 12, max: 130 } }] },
        { name: "Turtle Up", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ft.turtle_up", label: "Bastion Stance covers all angles", target: { abilityId: "juggernaut.bastion_stance" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "shield", amount: 1.0, scale: "attack", to: "self", duration: 6 }] }] } }] },
        { name: "Immovable", category: "keystone", effects: [{ kind: "rule", rule: "juggernaut.ft.immovable", note: "At full Fortify you cannot be moved, stunned, or dropped below 1 HP by a single hit." }] },
      ],
    },
    // 1 — Demolitionist: the tank that hits like a siege engine.
    {
      name: "Demolitionist",
      blurb: "A wall is more useful when it can also fall on people.",
      nodes: [
        { name: "Overhand", category: "foundation", effects: [{ kind: "mods", mods: { meleeDamage: 0.1, areaSize: 0.1 } }] },
        { name: "Crack the Shell", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "dm.crack_the_shell", label: "sunders stack deeper", target: { withTag: "heavy" }, ops: [{ kind: "damagePacket", setInflict: { status: "sundered", chance: 1 } }] } }] },
        { name: "Momentum of Mass", category: "resource", effects: [{ kind: "resourceRule", resource: "ultimate", patch: { addGeneration: [{ on: "hitDealt", amount: 3, requireTags: ["heavy"] }] } }] },
        { name: "Seismic Line", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "dm.seismic_line", label: "Tremor Blow reaches the far wall", target: { abilityId: "juggernaut.tremor_blow" }, ops: [{ kind: "targeting", scaleLength: 1.5, scaleWidth: 1.2 }, { kind: "damagePacket", scaleBase: 1.2 }] } }] },
        { name: "Living Catapult", category: "keystone", effects: [{ kind: "rule", rule: "juggernaut.dm.living_catapult", note: "Fortify spent on an attack converts one-for-one into bonus heavy damage." }] },
      ],
    },
    // 2 — Sentinel: the fight happens to you so it doesn't happen to them.
    {
      name: "Sentinel",
      blurb: "Every hit you eat is one an ally didn't.",
      nodes: [
        { name: "Cover Fire", category: "foundation", effects: [{ kind: "mods", mods: { wardPower: 0.15 } }] },
        { name: "Bodyblock", category: "behavior", effects: [{ kind: "rule", rule: "juggernaut.se.bodyblock", note: "Projectiles that would pass through you to hit an ally stop on you instead." }] },
        { name: "Rampart Share", category: "resource", effects: [{ kind: "resourceRule", resource: "fortify", patch: { addGeneration: [{ on: "damagePrevented", amount: 4 }] } }] },
        { name: "Hold the Door", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "se.hold_the_door", label: "Fortress Call redirects more, for longer", target: { abilityId: "juggernaut.fortress_call" }, ops: [{ kind: "cooldown", scale: 0.8 }] } }] },
        { name: "Guardian Wall", category: "keystone", effects: [{ kind: "rule", rule: "juggernaut.se.guardian_wall", note: "Bastion Stance projects a wall of cover behind you that allies shelter in." }] },
      ],
    },
    // 3 — Iron Tyrant: nothing in the room is allowed to ignore you.
    {
      name: "Iron Tyrant",
      blurb: "Threat is a resource, and you print it.",
      nodes: [
        { name: "Loud Presence", category: "foundation", effects: [{ kind: "mods", mods: { areaSize: 0.1 } }, { kind: "grantEffect", on: { tag: "melee" }, effects: [{ kind: "threat", op: "generate", amount: 15, to: "allTargets" }] }] },
        { name: "Fixation", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "it.fixation", label: "your taunts last much longer", target: { withTag: "taunt" }, ops: [{ kind: "status", scaleDuration: 1.6 }] } }] },
        { name: "Spite", category: "resource", effects: [{ kind: "resourceRule", resource: "fortify", patch: { addGeneration: [{ on: "hitTaken", amount: 3 }] } }] },
        { name: "Break Their Nerve", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "it.break_their_nerve", label: "Hammerfall taunts everything it stuns", target: { abilityId: "juggernaut.hammerfall" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "taunted", chance: 1, to: "allTargets" }] }] } }] },
        { name: "Absolute Threat", category: "keystone", effects: [{ kind: "rule", rule: "juggernaut.it.absolute_threat", note: "Enemies that attack anyone but you while you are alive take heavy retaliation." }] },
      ],
    },
    // 4 — Rolling Mountain: the fortress with wheels.
    {
      name: "Rolling Mountain",
      blurb: "Slow is a choice. It is not a limitation.",
      nodes: [
        { name: "Momentum Keeps", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.05, defensePercent: 0.06 } }] },
        { name: "Gather Speed", category: "behavior", effects: [{ kind: "rule", rule: "juggernaut.rm.gather_speed", note: "Moving in one direction ramps move speed and mitigation together." }] },
        { name: "Downhill", category: "resource", effects: [{ kind: "resourceRule", resource: "fortify", patch: { addGeneration: [{ on: "move", amount: 0.5, perUnit: "distance" }] } }] },
        { name: "Rolling Stop", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "rm.rolling_stop", label: "Iron March keeps going and hits harder the further it went", target: { abilityId: "juggernaut.iron_march" }, ops: [{ kind: "movement", addDistance: 120 }, { kind: "damagePacket", scaleBase: 1.3 }] } }] },
        { name: "Avalanche", category: "keystone", effects: [{ kind: "rule", rule: "juggernaut.rm.avalanche", note: "Iron March gains no top speed cap and knocks down everything it touches." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `juggernaut.${id}`,
  classId: "juggernaut",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `juggernaut.hybrid.${id}` }],
  ...extra,
});

export const JUGGERNAUT_UNLOCKS: PathUnlockDef[] = [
  H("bastion", "Bastion", "Bastion Stance and Anchor Rune share one footprint — a zone that mitigates and can't be displaced.", "Fortress", "Sentinel", {
    mutations: [{ id: "juggernaut.bastion", label: "defensive zones merge", target: { withTag: "barrier" }, ops: [{ kind: "cooldown", scale: 0.85 }] }],
    ui: { badge: "BAS" },
  }),
  H("siege_mode", "Siege Mode", "While Fortify is high, heavy attacks spend it for a second hit that ignores armor entirely.", "Fortress", "Demolitionist", {
    effects: [{ kind: "rule", rule: "juggernaut.hybrid.siege_mode" }],
    ui: { badge: "SGE" },
  }),
  H("champions_challenge", "Champion's Challenge", "Fortress Call can name a single elite: you eat 80% of its damage and deal double back.", "Iron Tyrant", "Sentinel", {
    mutations: [{ id: "juggernaut.champions_challenge", label: "Fortress Call becomes a duel", target: { abilityId: "juggernaut.fortress_call" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "mark", chance: 1, to: "enemies" }] }] }],
    ui: { badge: "CHM" },
  }),
  H("rockslide", "Rockslide", "Iron March leaves a trail of rubble that keeps damaging and slowing enemies who follow.", "Demolitionist", "Rolling Mountain", {
    mutations: [{ id: "juggernaut.rockslide", label: "Iron March lays rubble", target: { abilityId: "juggernaut.iron_march" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "zone", zone: { radius: 50, duration: 6, tickInterval: 1, follows: false, damage: { base: 0.3, scale: "attack", type: "physical", channel: "periodic" }, status: { id: "sundered", chance: 0.5 } } }] }] }],
    ui: { badge: "RCK" },
  }),
  H("unbreakable_line", "Unbreakable Line", "Enemies you have taunted deal a fraction less to everyone, not just to you.", "Fortress", "Iron Tyrant", {
    effects: [{ kind: "rule", rule: "juggernaut.hybrid.unbreakable_line" }],
    ui: { badge: "ULN" },
  }),
  H("mobile_bulwark", "Mobile Bulwark", "The Sentinel's wall of cover follows you as you move.", "Sentinel", "Rolling Mountain", {
    mutations: [{ id: "juggernaut.mobile_bulwark", label: "cover zones follow the Juggernaut", target: { withTag: "barrier" }, ops: [{ kind: "zone", forceFollows: true }] }],
    ui: { badge: "MBW" },
  }),
  {
    id: "juggernaut.the_keep",
    classId: "juggernaut",
    tier: "mythic",
    name: "The Keep",
    description: "Citadel walks. The fortress follows you at a slow drift, its walls reflect a share of everything they stop back at the attacker, and allies inside it cannot fall below 1 HP while you hold Fortify.",
    flavor: "A castle is a building. The Keep is a decision that moved in.",
    requires: [
      { path: "Fortress", points: 6 },
      { path: "Sentinel", points: 4 },
      { path: "Iron Tyrant", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "juggernaut.mythic.the_keep" }],
    mutations: [{
      id: "juggernaut.the_keep.citadel",
      label: "Citadel → The Keep",
      target: { abilityId: "juggernaut.citadel" },
      ops: [
        { kind: "zone", forceFollows: true, scaleDuration: 1.5 },
        { kind: "addEffect", at: "end", effects: [{ kind: "reactive", event: "damageTaken", window: 12, effects: [{ kind: "damage", damage: { base: 0.6, scale: "attack", type: "physical", channel: "reflected" }, to: "enemies" }] }] },
      ],
    }],
    ui: { badge: "KEEP" },
  },
];

export const JUGGERNAUT: PilotClass = {
  classId: "juggernaut",
  name: "Juggernaut",
  fantasy: "Living fortress whose strength comes from refusing to move, protecting space, and absorbing punishment.",
  role: "Main tank / protector / chokepoint control.",
  question: "How do I become the place the party can safely stand?",
  resources: JUGGERNAUT_RESOURCES,
  statuses: JUGGERNAUT_STATUSES,
  abilities: JUGGERNAUT_ABILITIES,
  progression: JUGGERNAUT_PROGRESSION,
  unlocks: JUGGERNAUT_UNLOCKS,
};
