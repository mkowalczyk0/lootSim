/**
 * Ranger — the prepared hunter. Prep is spent laying the fight out before it arrives:
 * traps, marks, cached ammunition, a marked trail. A prepared target is a dead one.
 * The paths are five ways to prepare: marksmanship, trap fields, a companion, moving
 * fire, and a cold quarry hunt.
 *
 * Question: how well can I prepare the battlefield before the fight arrives?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const RANGER_PREP: ResourceSpec = {
  id: "prep",
  label: "Prep",
  max: 6,
  start: 2,
  ui: "charges",
  generation: [
    { on: "skillUse", amount: 1, requireTags: ["trap"] },
    { on: "enterCombat", amount: 2 },
    { on: "kill", amount: 1 },
  ],
  regenPerSec: 0.15,
};

/** The Last Hunt is earned by connecting shots on quarry — targets you took the time to mark. */
export const RANGER_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "The Hunt",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "hitDealt", amount: 4, requireTags: ["projectile"] },
    { on: "ailmentInflicted", amount: 3 },
  ],
};

export const RANGER_RESOURCES: readonly ResourceSpec[] = [RANGER_PREP, RANGER_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Quarry — the Ranger's mark: it amplifies, it reveals, and it is what the ultimate meter reads. */
export const STATUS_QUARRY: StatusSpec = {
  id: "quarry",
  label: "Quarry",
  glyph: "q",
  category: "debuff",
  tags: ["mark"],
  baseDuration: 14,
  maxStacks: 1,
  refreshRule: "refresh",
  amplify: 1.18,
};

/** Pinned — a root that also stops the target being displaced (it's nailed to something). */
export const STATUS_PINNED: StatusSpec = {
  id: "pinned",
  label: "Pinned",
  glyph: "i",
  category: "cc",
  tags: ["crowdControl"],
  baseDuration: 2.5,
  maxStacks: 1,
  refreshRule: "refresh",
  disables: { move: true },
};

export const RANGER_STATUSES: readonly StatusSpec[] = [STATUS_QUARRY, STATUS_PINNED];

// --- abilities --------------------------------------------------------

export const RANGER_SPLITSHOT = {
  id: "ranger.splitshot",
  classId: "ranger",
  name: "Splitshot",
  description: "A heavy arrow that splits into a fan of smaller ones on its first impact.",
  flavor: "One arrow's worth of effort. Several arrows' worth of problem.",
  category: "attack",
  tags: ["ranged", "projectile"],
  cooldown: 2,
  targeting: "direction",
  range: 320,
  effects: [
    {
      kind: "projectile",
      projectile: {
        damage: { base: 1.1, scale: "attack", type: "physical", canCrit: true },
        speed: 520, radius: 8, life: 0.8,
        onExpire: [{ kind: "projectile", projectile: { damage: { base: 0.4, scale: "attack", type: "physical", canCrit: true }, speed: 420, radius: 6, life: 0.5, count: 4, spread: 0.6, behavior: "line" } }],
      },
    },
  ],
  mutationHooks: [{ id: "splitshot.projectile", kind: "projectile", note: "Broadheads / Full Draw scale the shot." }],
} as const satisfies Ability;

export const RANGER_BARBED_ARROW = {
  id: "ranger.barbed_arrow",
  classId: "ranger",
  name: "Barbed Arrow",
  description: "A barbed shot that stays lodged — the target bleeds every time it moves.",
  flavor: "It only hurts when you run. So they run less.",
  category: "attack",
  tags: ["ranged", "projectile", "bleed"],
  cooldown: 6,
  targeting: "direction",
  range: 300,
  effects: [
    { kind: "projectile", projectile: { damage: { base: 0.9, scale: "attack", type: "physical", canCrit: true, inflict: { status: "bleed", chance: 1 } }, speed: 480, radius: 8, life: 0.9, pierce: 1 } },
  ],
} as const satisfies Ability;

export const RANGER_SNARE_TRAP = {
  id: "ranger.snare_trap",
  classId: "ranger",
  name: "Snare Trap",
  description: "A concealed trap. The first enemy across it is rooted and pinned in place.",
  flavor: "The ground looks fine. That is the whole idea.",
  category: "terrain",
  tags: ["trap", "crowdControl", "terrain"],
  costs: [{ resource: "prep", amount: 1 }],
  cooldown: 4,
  targeting: "point",
  range: 140,
  effects: [
    { kind: "terrain", piece: "anchor", duration: 20, hp: 1 },
    { kind: "delay", seconds: 0, effects: [{ kind: "status", status: "pinned", chance: 1, to: "enemies" }] },
  ],
  mutationHooks: [{ id: "snare_trap.status", kind: "status", note: "Trapper path chains and re-arms." }],
} as const satisfies Ability;

export const RANGER_EXPLOSIVE_TRAP = {
  id: "ranger.explosive_trap",
  classId: "ranger",
  name: "Explosive Trap",
  description: "A pressure charge. Once triggered it counts down, then throws everything nearby outward.",
  flavor: "The delay is a courtesy. Use it.",
  category: "terrain",
  tags: ["trap", "area", "terrain"],
  costs: [{ resource: "prep", amount: 1 }],
  cooldown: 8,
  targeting: "point",
  range: 160,
  effects: [
    { kind: "terrain", piece: "anchor", duration: 20, hp: 1 },
    { kind: "delay", seconds: 0.8, effects: [
      { kind: "damage", damage: { base: 2.0, scale: "attack", type: "fire", canCrit: true, knockback: 140 }, to: "enemies" },
      { kind: "status", status: "burn", chance: 0.6, to: "enemies" },
    ] },
  ],
} as const satisfies Ability;

export const RANGER_FALCON_DIVE = {
  id: "ranger.falcon_dive",
  classId: "ranger",
  name: "Falcon Dive",
  description: "Send the falcon down on a target — a raking strike that leaves it blinded.",
  flavor: "The falcon does not miss. It has never once needed an excuse.",
  category: "summon",
  tags: ["pet", "summon"],
  cooldown: 10,
  targeting: "currentTarget",
  range: 260,
  effects: [
    { kind: "damage", damage: { base: 1.4, scale: "attack", type: "physical", canCrit: true }, to: "target" },
    { kind: "status", status: "blinded", chance: 1, to: "target" },
    { kind: "summon", unit: "falcon", count: 1, duration: 12, command: { behavior: "follow", inheritPower: 0.5 } },
  ],
  mutationHooks: [{ id: "falcon_dive.summon", kind: "summon", note: "Beastmaster evolves the companion." }],
} as const satisfies Ability;

export const RANGER_PINNING_SHOT = {
  id: "ranger.pinning_shot",
  classId: "ranger",
  name: "Pinning Shot",
  description: "A shot that drives the target back into the nearest wall and staples it there.",
  flavor: "Terrain is a tool. So is an enemy, briefly.",
  category: "attack",
  tags: ["ranged", "projectile", "crowdControl"],
  cooldown: 9,
  targeting: "direction",
  range: 280,
  effects: [
    { kind: "projectile", projectile: { damage: { base: 1.2, scale: "attack", type: "physical", canCrit: true, knockback: 90, inflict: { status: "pinned", chance: 1 } }, speed: 500, radius: 8, life: 0.9 } },
  ],
} as const satisfies Ability;

export const RANGER_HUNTERS_CACHE = {
  id: "ranger.hunters_cache",
  classId: "ranger",
  name: "Hunter's Cache",
  description: "Drop a supply cache. Walking over it refills Prep and loads a special arrow into the next shot.",
  flavor: "You packed for this. Past you was very thoughtful.",
  category: "utility",
  tags: ["resourceGenerator", "terrain"],
  cooldown: 20,
  targeting: "point",
  range: 120,
  effects: [
    { kind: "resource", resource: "prep", delta: 3, to: "self" },
    { kind: "terrain", piece: "cover", duration: 15, hp: 0 },
  ],
} as const satisfies Ability;

export const RANGER_DEADEYE = {
  id: "ranger.deadeye",
  classId: "ranger",
  name: "Deadeye",
  description: "Plant your feet. While you hold still your shots gain range, pierce, and a heavy crit bonus.",
  flavor: "Movement is for people who missed.",
  category: "utility",
  tags: ["channel", "ranged"],
  cooldown: 16,
  channel: { duration: 4, ticks: 1 },
  targeting: "self",
  effects: [
    { kind: "status", status: "quarry", chance: 0, to: "self" },
    { kind: "resource", resource: "ultimate", delta: 6, to: "self" },
  ],
  mutationHooks: [{ id: "deadeye.packet", kind: "damagePacket", note: "Perfect Shot makes the held shot an execute." }],
} as const satisfies Ability;

export const RANGER_PREDATORS_TRAIL = {
  id: "ranger.predators_trail",
  classId: "ranger",
  name: "Predator's Trail",
  description: "Mark a line across the ground. Projectiles that travel along it deal far more.",
  flavor: "The arrow knows the way. You just have to point it.",
  category: "terrain",
  tags: ["zone", "terrain"],
  costs: [{ resource: "prep", amount: 1 }],
  cooldown: 14,
  targeting: "line",
  range: 300,
  shape: { width: 40, length: 300 },
  effects: [
    {
      kind: "zone",
      zone: {
        radius: 40, duration: 10, tickInterval: 1, shape: "line", follows: false,
        benefit: "haste", empowerProjectiles: 1.75,
      },
    },
  ],
  mutationHooks: [{ id: "predators_trail.zone", kind: "zone", note: "Run and Gun lets the trail follow you." }],
} as const satisfies Ability;

export const RANGER_THE_LAST_HUNT = {
  id: "ranger.the_last_hunt",
  classId: "ranger",
  name: "The Last Hunt",
  description: "Mark every elite in sight as quarry, vanish, and loose one precision shot at each in sequence — a guaranteed crit that executes the wounded.",
  flavor: "The last thing a lot of very large monsters ever hear is a bowstring.",
  category: "ultimate",
  tags: ["ultimate", "stealth", "execute", "projectile", "ranged"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  // "In sight" is a real bound, not the whole floor — this is what the "enemies" selector
  // reads to stop at (see `selectActorIds` in combat/runtime.ts). Without it the volley
  // reached every hostile on the floor, which is what the owner reported as "wipes the
  // entire map." 350 covers a full room and its doorways at the largest authored room
  // size without reaching into the next one over.
  shape: { radius: 350 },
  effects: [
    { kind: "status", status: "quarry", chance: 1, to: "enemies" },
    { kind: "move", style: "blink", distance: 60, iframes: 0.3 },
    { kind: "status", status: "stealth", chance: 1, to: "self" },
    // The §20 payback, and it is the owner's own suggestion — "just quadruple the archer's
    // attack speed haste or whatever instead". Four times the baseline `hasted` window
    // (2s → 8s at +25% attack speed, +18% move speed), not four times the attack speed
    // itself, which would be a bigger number than the thing being removed. The trade is
    // the point: the ultimate stops being a burst that deletes a healthy boss and becomes
    // the opening of a hunt you then have to actually shoot your way through.
    { kind: "status", status: "hasted", chance: 1, to: "self", durationMult: 4 },
    { kind: "delay", seconds: 0.3, effects: [
      // Left at §8's halved 0.4 → 0.2 on purpose. §8's reason for halving it (it was a
      // huge number against a boss) is now handled by THE EXECUTE RULE instead, so the
      // coefficient could be argued back up — but the owner asked for an honest sustained
      // payback rather than "a resized version of the thing that was wrong", and that is
      // the haste above. Restoring 0.4 is the option we did not take; see docs/execute-threshold.md.
      { kind: "damage", damage: { base: 3.4, scale: "attack", type: "physical", canCrit: true, channel: "ultimate", executeMissingHealth: 0.2 }, to: "enemies" },
    ] },
  ],
  mutationHooks: [{ id: "the_last_hunt.packet", kind: "damagePacket", note: "Winter's Quarry freezes the quarry before the volley." }],
} as const satisfies Ability;

export const RANGER_ABILITIES = [
  RANGER_SPLITSHOT,
  RANGER_BARBED_ARROW,
  RANGER_SNARE_TRAP,
  RANGER_EXPLOSIVE_TRAP,
  RANGER_FALCON_DIVE,
  RANGER_PINNING_SHOT,
  RANGER_HUNTERS_CACHE,
  RANGER_DEADEYE,
  RANGER_PREDATORS_TRAIL,
  RANGER_THE_LAST_HUNT,
] as const satisfies readonly Ability[];

// --- the tree --------------------------------------------------------

export const RANGER_PROGRESSION: ClassProgression = {
  classId: "ranger",
  paths: [
    // 0 — Deadeye: one shot, correctly placed.
    {
      name: "Deadeye",
      blurb: "Fewer arrows. Each one decides something.",
      nodes: [
        { name: "Steady Aim", category: "foundation", effects: [{ kind: "mods", mods: { critChance: 0.06, projectileDamage: 0.06 } }] },
        { name: "Broadheads", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "de.broadheads", label: "shots pierce a body", target: { withTag: "projectile" }, ops: [{ kind: "projectile", addPierce: 1 }] } }] },
        { name: "Called Shot", category: "resource", effects: [{ kind: "resourceRule", resource: "ultimate", patch: { addGeneration: [{ on: "crit", amount: 4 }] } }] },
        { name: "Full Draw", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "de.full_draw", label: "Splitshot hits like a siege bolt", target: { abilityId: "ranger.splitshot" }, ops: [{ kind: "damagePacket", scaleBase: 1.4 }, { kind: "projectile", scaleSpeed: 1.3 }] } }] },
        { name: "Perfect Shot", category: "keystone", effects: [{ kind: "rule", rule: "ranger.de.perfect_shot", note: "A shot fired from full Deadeye stacks always crits and executes below 30%." }] },
      ],
    },
    // 1 — Trapper: the ground is the weapon.
    {
      name: "Trapper",
      blurb: "By the time they see the first trap they are standing on the third.",
      nodes: [
        { name: "Quick Hands", category: "foundation", effects: [{ kind: "mods", mods: { cooldownRate: 0.08 } }] },
        { name: "Tripwire", category: "behavior", effects: [{ kind: "rule", rule: "ranger.tr.tripwire", note: "Traps arm instantly and can overlap." }] },
        { name: "Ammo Dump", category: "resource", effects: [{ kind: "resourceRule", resource: "prep", patch: { max: 9, regenPerSec: 0.3 } }] },
        { name: "Cluster Charge", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "tr.cluster_charge", label: "Explosive Trap seeds two more", target: { abilityId: "ranger.explosive_trap" }, ops: [{ kind: "targeting", scaleRadius: 1.3 }, { kind: "addEffect", at: "end", effects: [{ kind: "status", status: "pinned", chance: 0.5, to: "enemies" }] }] } }] },
        { name: "Killing Ground", category: "keystone", effects: [{ kind: "rule", rule: "ranger.tr.killing_ground", note: "An enemy that triggers a trap while standing on another triggers both, and re-arms the first." }] },
      ],
    },
    // 2 — Beastmaster: the companion carries half the fight.
    {
      name: "Beastmaster",
      blurb: "You brought help that eats.",
      nodes: [
        { name: "Bonded", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.05 } }, { kind: "grantEffect", on: { tag: "pet" }, effects: [{ kind: "resource", resource: "prep", delta: 1, to: "self" }] }] },
        { name: "Pack Tactics", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "bm.pack_tactics", label: "the falcon marks what it hits", target: { withTag: "pet" }, ops: [{ kind: "summon", addInheritPower: 0.2 }] } }] },
        { name: "Feed the Beast", category: "resource", effects: [{ kind: "resourceRule", resource: "prep", patch: { addGeneration: [{ on: "enemyDeath", amount: 1 }] } }] },
        { name: "Molt", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "bm.molt", label: "Falcon Dive keeps the bird out longer and angrier", target: { abilityId: "ranger.falcon_dive" }, ops: [{ kind: "summon", scaleDuration: 1.6, addInheritPower: 0.3 }] } }] },
        { name: "Alpha Companion", category: "keystone", effects: [{ kind: "rule", rule: "ranger.bm.alpha_companion", note: "The companion becomes permanent and gains a leap-strike of its own." }] },
      ],
    },
    // 3 — Skirmisher: shoot while running.
    {
      name: "Skirmisher",
      blurb: "Standing still is a Deadeye problem.",
      nodes: [
        { name: "Light Feet", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.1, attackSpeed: 0.05 } }] },
        { name: "Rolling Fire", category: "behavior", effects: [{ kind: "rule", rule: "ranger.sk.rolling_fire", note: "No accuracy penalty while moving; a dash reloads instantly." }] },
        { name: "Kite", category: "resource", effects: [{ kind: "resourceRule", resource: "ultimate", patch: { addGeneration: [{ on: "dashStart", amount: 5 }] } }] },
        { name: "Snapshot", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "sk.snapshot", label: "Pinning Shot fires on the move without a wind-up", target: { abilityId: "ranger.pinning_shot" }, ops: [{ kind: "cooldown", scale: 0.7 }, { kind: "projectile", scaleSpeed: 1.2 }] } }] },
        { name: "Run and Gun", category: "keystone", effects: [{ kind: "rule", rule: "ranger.sk.run_and_gun", note: "Predator's Trail follows you, and moving along your own trail refunds Prep." }] },
      ],
    },
    // 4 — Cold Hunt: freeze the quarry, then take it apart.
    {
      name: "Cold Hunt",
      blurb: "A cold trail is easier to follow when you laid the frost yourself.",
      nodes: [
        { name: "Frost Fletching", category: "foundation", effects: [{ kind: "mods", mods: { coldDamage: 0.15 } }, { kind: "grantEffect", on: { tag: "projectile" }, effects: [{ kind: "status", status: "chill", chance: 0.3, to: "allTargets" }] }] },
        { name: "Cull the Weak", category: "behavior", effects: [{ kind: "rule", rule: "ranger.ch.cull_the_weak", note: "Chilled and quarried enemies take execute damage from every shot." }] },
        { name: "Winter Stores", category: "resource", effects: [{ kind: "resourceRule", resource: "prep", patch: { addGeneration: [{ on: "ailmentInflicted", amount: 1, requireTags: ["frost"] }] } }] },
        { name: "Hoarfrost Arrow", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ch.hoarfrost", label: "Barbed Arrow freezes a moving target solid", target: { abilityId: "ranger.barbed_arrow" }, ops: [{ kind: "damagePacket", setType: "cold", setInflict: { status: "freeze", chance: 0.4 } }] } }] },
        { name: "Winter's Predator", category: "keystone", effects: [{ kind: "rule", rule: "ranger.ch.winters_predator", note: "Killing a frozen quarry drops a frost nova that quarries everything it chills." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `ranger.${id}`,
  classId: "ranger",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `ranger.hybrid.${id}` }],
  ...extra,
});

export const RANGER_UNLOCKS: PathUnlockDef[] = [
  H("perfect_ambush", "Perfect Ambush", "A shot fired from stealth or Deadeye that hits a trapped enemy always executes.", "Deadeye", "Trapper", {
    mutations: [{ id: "ranger.perfect_ambush", label: "trapped targets are marked for the kill", target: { withTag: "projectile" }, ops: [{ kind: "damagePacket", addExecuteMissingHealth: 0.25 }] }],
    ui: { badge: "AMB" },
  }),
  H("hunting_party", "Hunting Party", "Your traps also arm your companion — it drags trapped enemies back onto the field.", "Trapper", "Beastmaster", {
    effects: [{ kind: "rule", rule: "ranger.hybrid.hunting_party" }],
    ui: { badge: "PTY" },
  }),
  H("run_and_aim", "Run & Aim", "Deadeye no longer roots you — you keep its bonuses at a walk.", "Skirmisher", "Deadeye", {
    effects: [{ kind: "rule", rule: "ranger.hybrid.run_and_aim" }],
    mutations: [{ id: "ranger.run_and_aim", label: "Deadeye stays up while moving", target: { abilityId: "ranger.deadeye" }, ops: [{ kind: "cooldown", scale: 0.8 }] }],
    ui: { badge: "R&A" },
  }),
  H("frozen_ground", "Frozen Ground", "Trap zones freeze over — enemies inside are chilled, and a trigger shatters them.", "Cold Hunt", "Trapper", {
    mutations: [{ id: "ranger.frozen_ground", label: "traps chill their area", target: { withTag: "trap" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "chill", chance: 1, to: "enemies" }] }] }],
    ui: { badge: "ICE" },
  }),
  H("pack_hunter", "Pack Hunter", "Dashing past an enemy sics the companion on it and refunds a Prep charge.", "Beastmaster", "Skirmisher", {
    effects: [
      { kind: "rule", rule: "ranger.hybrid.pack_hunter" },
      { kind: "grantEffect", on: { tag: "dash" }, effects: [{ kind: "resource", resource: "prep", delta: 1, to: "self" }] },
    ],
    ui: { badge: "PACK" },
  }),
  H("winter_execution", "Winter Execution", "A held Deadeye shot on a frozen target is a guaranteed one-shot on anything but an elite.", "Deadeye", "Cold Hunt", {
    mutations: [{ id: "ranger.winter_execution", label: "frozen quarry dies to the held shot", target: { withTag: "projectile" }, ops: [{ kind: "damagePacket", addExecuteMissingHealth: 0.5 }] }],
    ui: { badge: "WEX" },
  }),
  {
    id: "ranger.winters_quarry",
    classId: "ranger",
    tier: "mythic",
    name: "Winter's Quarry",
    description: "The Last Hunt opens with a freezing pulse: every quarry is frozen solid before the volley, and each shot that lands on a frozen target chains a shattering nova to the next quarry over.",
    flavor: "By the time the Ranger is visible again, the fight is a field of ice sculptures.",
    requires: [
      { path: "Deadeye", points: 6 },
      { path: "Trapper", points: 4 },
      { path: "Cold Hunt", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "ranger.mythic.winters_quarry" }],
    mutations: [{
      id: "ranger.winters_quarry.last_hunt",
      label: "The Last Hunt → Winter's Quarry",
      target: { abilityId: "ranger.the_last_hunt" },
      ops: [
        { kind: "addEffect", at: "start", effects: [{ kind: "status", status: "freeze", chance: 1, to: "enemies" }] },
        { kind: "damagePacket", setType: "cold", scaleBase: 1.2 },
      ],
    }],
    ui: { badge: "WQRY" },
  },
];

export const RANGER: PilotClass = {
  classId: "ranger",
  name: "Ranger",
  fantasy: "Prepared hunter who uses terrain, traps, marksmanship, companions, and movement.",
  role: "Ranged DPS / traps / priority-target hunter.",
  question: "How well can I prepare the battlefield before the fight arrives?",
  resources: RANGER_RESOURCES,
  statuses: RANGER_STATUSES,
  abilities: RANGER_ABILITIES,
  progression: RANGER_PROGRESSION,
  unlocks: RANGER_UNLOCKS,
};
