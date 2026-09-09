/**
 * Corsair — the swashbuckling battlefield manipulator. Crew is a small roster of
 * ghostly deckhands you call up and spend; Bounty accrues from tagging elites and is
 * cashed on the kill. The ultimate meter fills by displacing enemies — dragging,
 * hooking, and boarding. The paths are five ways to run a fight like a raid on a ship.
 *
 * Question: how much can I control enemy positioning?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const CORSAIR_CREW: ResourceSpec = {
  id: "crew",
  label: "Crew",
  max: 5,
  start: 1,
  ui: "pips",
  regenPerSec: 0.1,
  generation: [
    { on: "skillUse", amount: 1, requireTags: ["mark"] },
    { on: "kill", amount: 1 },
  ],
};

/** Broadside is earned by moving the enemy around — hooks, drags, boarding actions. */
export const CORSAIR_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Broadside",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "skillUse", amount: 6, requireTags: ["crowdControl"] },
    { on: "dashStart", amount: 5 },
  ],
};

export const CORSAIR_RESOURCES: readonly ResourceSpec[] = [CORSAIR_CREW, CORSAIR_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Hooked — the Corsair has a line on this one. It can be reeled, and it can't stray far. */
export const STATUS_HOOKED: StatusSpec = {
  id: "hooked",
  label: "Hooked",
  glyph: "j",
  category: "debuff",
  tags: ["crowdControl"],
  baseDuration: 4,
  maxStacks: 1,
  refreshRule: "refresh",
  slow: 0.8,
};

/** Bounty — a price on an elite's head. Killing a Bounty target pays out coins and a combat buff. */
export const STATUS_BOUNTY: StatusSpec = {
  id: "bounty",
  label: "Bounty",
  glyph: "$",
  category: "debuff",
  tags: ["mark"],
  baseDuration: 20,
  maxStacks: 1,
  refreshRule: "refresh",
  amplify: 1.12,
};

export const CORSAIR_STATUSES: readonly StatusSpec[] = [STATUS_HOOKED, STATUS_BOUNTY];

// --- abilities --------------------------------------------------------

export const CORSAIR_HOOKSHOT: Ability = {
  id: "corsair.hookshot",
  classId: "corsair",
  name: "Hookshot",
  description: "Fire a grappling hook and haul yourself to whatever it catches — an enemy or a wall.",
  flavor: "The shortest distance between the Corsair and a problem is a taut rope.",
  category: "movement",
  tags: ["movement", "dash"],
  cooldown: 6,
  targeting: "currentTarget",
  range: 300,
  effects: [
    { kind: "move", style: "dash", toTarget: true, iframes: 0.2 },
    { kind: "status", status: "hooked", chance: 1, to: "target" },
  ],
  mutationHooks: [{ id: "hookshot.movement", kind: "movement", note: "Boarding Hook chains straight into Boarding Cut." }],
};

export const CORSAIR_BOARDING_CUT: Ability = {
  id: "corsair.boarding_cut",
  classId: "corsair",
  name: "Boarding Cut",
  description: "A cutlass slash that hits far harder when it lands right after a Hookshot.",
  flavor: "Arrive, and immediately be a problem.",
  category: "attack",
  tags: ["melee", "slash"],
  cooldown: 3,
  targeting: "currentTarget",
  range: 65,
  effects: [
    { kind: "damage", damage: { base: 1.9, scale: "attack", type: "physical", canCrit: true }, to: "target" },
    { kind: "consumeStatus", status: "hooked", to: "target", then: [
      { kind: "damage", damage: { base: 2.4, scale: "attack", type: "physical", canCrit: true }, to: "target" },
    ] },
  ],
};

export const CORSAIR_CHAIN_DRAG: Ability = {
  id: "corsair.chain_drag",
  classId: "corsair",
  name: "Chain Drag",
  description: "Sink a chain into a smaller enemy and haul it along behind you wherever you go.",
  flavor: "A hostage is just a movement ability with feelings.",
  category: "utility",
  tags: ["crowdControl"],
  cooldown: 9,
  targeting: "currentTarget",
  range: 140,
  fx: { travel: "lance" },
  effects: [
    { kind: "status", status: "hooked", chance: 1, to: "target", durationMult: 2 },
    { kind: "pull", force: 60, to: "target" },
  ],
  mutationHooks: [{ id: "chain_drag.status", kind: "status", note: "Chainmaster path lets you drag several at once." }],
};

export const CORSAIR_POWDER_KEG: Ability = {
  id: "corsair.powder_keg",
  classId: "corsair",
  name: "Powder Keg",
  description: "Roll a lit barrel in a direction. It picks up speed, then goes off.",
  flavor: "The fuse is generous. The barrel is not.",
  category: "attack",
  tags: ["area", "projectile"],
  cooldown: 11,
  targeting: "direction",
  range: 260,
  effects: [
    { kind: "projectile", projectile: { damage: { base: 2.4, scale: "attack", type: "fire", canCrit: true, knockback: 130 }, speed: 220, radius: 90, life: 1.6, behavior: "line", onExpire: [{ kind: "status", status: "burn", chance: 0.7, to: "enemies" }] } },
  ],
};

export const CORSAIR_GRAPPLE_SWING: Ability = {
  id: "corsair.grapple_swing",
  classId: "corsair",
  name: "Grapple Swing",
  description: "Hook a point of terrain and swing around it in a wide arc, blade out.",
  flavor: "Physics, briefly, on the Corsair's side.",
  category: "movement",
  tags: ["movement", "dash", "slash", "area"],
  cooldown: 8,
  targeting: "point",
  range: 220,
  effects: [
    { kind: "move", style: "dash", distance: 220, iframes: 0.35 },
    { kind: "damage", damage: { base: 1.8, scale: "attack", type: "physical", canCrit: true }, to: "enemies" },
  ],
};

export const CORSAIR_DIRTY_TRICK: Ability = {
  id: "corsair.dirty_trick",
  classId: "corsair",
  name: "Dirty Trick",
  description: "Sand, a flask, a handful of something — whatever's nearby, thrown in a few faces at once.",
  flavor: "There are no rules in a fight. The Corsair checked.",
  category: "utility",
  tags: ["crowdControl", "area"],
  cooldown: 12,
  targeting: "cone",
  range: 90,
  shape: { length: 90, arc: Math.PI * 0.8 },
  effects: [
    { kind: "status", status: "blinded", chance: 1, to: "allTargets" },
  ],
};

export const CORSAIR_DECKHANDS_CALL: Ability = {
  id: "corsair.deckhands_call",
  classId: "corsair",
  name: "Deckhand's Call",
  description: "Whistle up a ghostly crewmate to fight alongside you until it fades or falls.",
  flavor: "They signed on for a voyage. Death was not considered a resignation.",
  category: "summon",
  tags: ["summon", "spirit"],
  costs: [{ resource: "crew", amount: 1 }],
  cooldown: 8,
  targeting: "self",
  effects: [
    { kind: "summon", unit: "ghost_deckhand", count: 1, duration: 16, command: { behavior: "aggroNearest", inheritPower: 0.5 } },
  ],
  mutationHooks: [{ id: "deckhands_call.summon", kind: "summon", note: "Ghost Crew keeps a permanent standing complement." }],
};

export const CORSAIR_RICOCHET_SHOT: Ability = {
  id: "corsair.ricochet_shot",
  classId: "corsair",
  name: "Ricochet Shot",
  description: "A pistol round that bounces between enemies and off walls, losing little on each bounce.",
  flavor: "Aimed, generously speaking.",
  category: "attack",
  tags: ["ranged", "projectile"],
  cooldown: 4,
  targeting: "direction",
  range: 300,
  effects: [
    { kind: "projectile", projectile: { damage: { base: 1.5, scale: "attack", type: "physical", canCrit: true }, speed: 620, radius: 8, life: 1.4, pierce: 0, count: 1, behavior: "boomerang" } },
  ],
  mutationHooks: [{ id: "ricochet_shot.projectile", kind: "projectile", note: "Six Shooter adds bounces and a reload burst." }],
};

export const CORSAIR_PLUNDER: Ability = {
  id: "corsair.plunder",
  classId: "corsair",
  name: "Plunder",
  description: "Put a price on an elite. It takes more damage, and killing it pays out coins and a combat buff.",
  flavor: "Everything on this battlefield is technically salvage.",
  category: "utility",
  tags: ["mark"],
  cooldown: 15,
  targeting: "currentTarget",
  range: 240,
  fx: { travel: "bolt" },
  effects: [
    { kind: "status", status: "bounty", chance: 1, to: "target" },
    { kind: "resource", resource: "crew", delta: 1, to: "self" },
  ],
  mutationHooks: [{ id: "plunder.status", kind: "status", note: "Black Market path compounds the payout." }],
};

export const CORSAIR_BROADSIDE: Ability = {
  id: "corsair.broadside",
  classId: "corsair",
  name: "Broadside",
  description: "Spectral cannons run out along your flank and fire a synchronized barrage across the battlefield.",
  flavor: "The Corsair does not have a ship. The Corsair has the memory of one, and that turns out to be enough.",
  category: "ultimate",
  tags: ["ultimate", "area", "projectile"],
  cooldown: 0,
  isUltimate: true,
  targeting: "line",
  range: 400,
  fx: { travel: "lance" },
  shape: { width: 260, length: 400 },
  telegraph: { shape: "line", windup: 0.6, width: 260 },
  effects: [
    { kind: "fx", fx: "corsair.cannons" },
    { kind: "damage", damage: { base: 3.0, scale: "attack", type: "fire", canCrit: true, channel: "ultimate", knockback: 90 }, to: "allTargets" },
    { kind: "delay", seconds: 0.4, effects: [
      { kind: "damage", damage: { base: 2.0, scale: "attack", type: "fire", canCrit: true, channel: "ultimate" }, to: "allTargets" },
      { kind: "status", status: "burn", chance: 0.8, to: "allTargets" },
    ] },
  ],
  mutationHooks: [{ id: "broadside.followup", kind: "followUp", note: "Dread Admiral has the ghost crew fire a second volley." }],
};

export const CORSAIR_ABILITIES: readonly Ability[] = [
  CORSAIR_HOOKSHOT,
  CORSAIR_BOARDING_CUT,
  CORSAIR_CHAIN_DRAG,
  CORSAIR_POWDER_KEG,
  CORSAIR_GRAPPLE_SWING,
  CORSAIR_DIRTY_TRICK,
  CORSAIR_DECKHANDS_CALL,
  CORSAIR_RICOCHET_SHOT,
  CORSAIR_PLUNDER,
  CORSAIR_BROADSIDE,
];

// --- the tree --------------------------------------------------------

export const CORSAIR_PROGRESSION: ClassProgression = {
  classId: "corsair",
  paths: [
    // 0 — Boarding Captain: aggressive melee off the hook.
    {
      name: "Boarding Captain",
      blurb: "Close the distance, then make them regret the distance closing.",
      nodes: [
        { name: "First Aboard", category: "foundation", effects: [{ kind: "mods", mods: { meleeDamage: 0.08, moveSpeed: 0.05 } }] },
        { name: "Cutlass Work", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "bc.cutlass_work", label: "Boarding Cut off a hook chains a second slash", target: { abilityId: "corsair.boarding_cut" }, ops: [{ kind: "cooldown", scale: 0.7 }] } }] },
        { name: "Press-Gang", category: "resource", effects: [{ kind: "resourceRule", resource: "crew", patch: { addGeneration: [{ on: "hitDealt", amount: 0.2, requireTags: ["melee"] }] } }] },
        { name: "No Quarter", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "bc.no_quarter", label: "hooked targets take execute damage from your melee", target: { withTag: "melee" }, ops: [{ kind: "damagePacket", addExecuteMissingHealth: 0.15 }] } }] },
        { name: "Deck Master", category: "keystone", effects: [{ kind: "rule", rule: "corsair.bc.deck_master", note: "Every hook you land reduces your melee cooldowns and refreshes Boarding Cut." }] },
      ],
    },
    // 1 — Gunslinger: ranged pistol work.
    {
      name: "Gunslinger",
      blurb: "Six shots, and a plan for what happens after six shots.",
      nodes: [
        { name: "Quick Draw", category: "foundation", effects: [{ kind: "mods", mods: { attackSpeed: 0.08, projectileDamage: 0.06 } }] },
        { name: "Fan the Hammer", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "gs.fan_the_hammer", label: "Ricochet Shot fires a burst", target: { abilityId: "corsair.ricochet_shot" }, ops: [{ kind: "projectile", addCount: 2, addPierce: 1 }] } }] },
        { name: "Loaded", category: "resource", effects: [{ kind: "resourceRule", resource: "ultimate", patch: { addGeneration: [{ on: "hitDealt", amount: 2, requireTags: ["projectile"] }] } }] },
        { name: "Trick Shot", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "gs.trick_shot", label: "Ricochet Shot seeks the lowest-health enemy on each bounce", target: { abilityId: "corsair.ricochet_shot" }, ops: [{ kind: "projectile", setBehavior: "homing", scaleLife: 1.4 }] } }] },
        { name: "Six Shooter", category: "keystone", effects: [{ kind: "rule", rule: "corsair.gs.six_shooter", note: "Every sixth pistol shot is a free empowered round that always crits and reloads instantly." }] },
      ],
    },
    // 2 — Chainmaster: nobody stands where they want to.
    {
      name: "Chainmaster",
      blurb: "The whole encounter, on strings.",
      nodes: [
        { name: "Long Chains", category: "foundation", effects: [{ kind: "mods", mods: { areaSize: 0.1 } }, { kind: "mutate", mutation: { id: "cm.long_chains", label: "hooks and drags reach further", target: { withTag: "crowdControl" }, ops: [{ kind: "targeting", addRange: 60 }] } }] },
        { name: "Reel", category: "behavior", effects: [{ kind: "grantEffect", on: { tag: "crowdControl" }, effects: [{ kind: "pull", force: 40, to: "allTargets" }] }] },
        { name: "Rigging", category: "resource", effects: [{ kind: "resourceRule", resource: "ultimate", patch: { addGeneration: [{ on: "skillUse", amount: 4, requireTags: ["crowdControl"] }] } }] },
        { name: "Multi-Drag", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "cm.multi_drag", label: "Chain Drag hooks a small pack", target: { abilityId: "corsair.chain_drag" }, ops: [{ kind: "targeting", setMode: "radius", addRange: 40 }, { kind: "addTags", tags: ["area"] }] } }] },
        { name: "Harpooner", category: "keystone", effects: [{ kind: "rule", rule: "corsair.cm.harpooner", note: "Hooked enemies are tethered to each other — pulling one pulls all of them." }] },
      ],
    },
    // 3 — Pirate King: the crew wins the fight.
    {
      name: "Pirate King",
      blurb: "You are only as good as the ghosts standing behind you.",
      nodes: [
        { name: "Loyalty", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.05 } }, { kind: "grantEffect", on: { tag: "summon" }, effects: [{ kind: "resource", resource: "crew", delta: 1, to: "self" }] }] },
        { name: "Boarding Party", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "pk.boarding_party", label: "crew inherit more of your power", target: { withTag: "summon" }, ops: [{ kind: "summon", addInheritPower: 0.25 }] } }] },
        { name: "Shore Leave", category: "resource", effects: [{ kind: "resourceRule", resource: "crew", patch: { max: 8, regenPerSec: 0.2 } }] },
        { name: "All Hands", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "pk.all_hands", label: "Deckhand's Call raises two at once", target: { abilityId: "corsair.deckhands_call" }, ops: [{ kind: "summon", addCount: 1, scaleDuration: 1.3 }] } }] },
        { name: "Ghost Crew", category: "keystone", effects: [{ kind: "rule", rule: "corsair.pk.ghost_crew", note: "Your first two deckhands are permanent and revive on any of your kills." }] },
      ],
    },
    // 4 — Treasure Hunter: power off the payout.
    {
      name: "Treasure Hunter",
      blurb: "Every fight is a job, and every job pays.",
      nodes: [
        { name: "Appraise", category: "foundation", effects: [{ kind: "mods", mods: { critDamage: 0.15 } }] },
        { name: "Mark the Manifest", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "th.mark_the_manifest", label: "Plunder can tag several elites at once", target: { abilityId: "corsair.plunder" }, ops: [{ kind: "targeting", setMode: "radius", addRange: 80 }] } }] },
        { name: "Prize Money", category: "resource", effects: [{ kind: "resourceRule", resource: "crew", patch: { addGeneration: [{ on: "kill", amount: 1 }] } }] },
        { name: "Cut of the Take", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "th.cut_of_the_take", label: "killing a Bounty target buffs the whole crew", target: { withTag: "mark" }, ops: [{ kind: "status", scaleDuration: 1.5 }] } }] },
        { name: "Black Market", category: "keystone", effects: [{ kind: "rule", rule: "corsair.th.black_market", note: "Bounty payouts stack a permanent damage and coin bonus for the run." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `corsair.${id}`,
  classId: "corsair",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `corsair.hybrid.${id}` }],
  ...extra,
});

export const CORSAIR_UNLOCKS: PathUnlockDef[] = [
  H("boarding_hook", "Boarding Hook", "Hookshot chains straight into a free Boarding Cut on arrival.", "Boarding Captain", "Chainmaster", {
    mutations: [{ id: "corsair.boarding_hook", label: "Hookshot ends in a strike", target: { abilityId: "corsair.hookshot" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "damage", damage: { base: 1.4, scale: "attack", type: "physical", canCrit: true }, to: "target" }] }] }],
    ui: { badge: "BHK" },
  }),
  H("harpoon_gun", "Harpoon Gun", "Ricochet Shot hooks the first enemy it hits and reels it toward you.", "Gunslinger", "Chainmaster", {
    mutations: [{ id: "corsair.harpoon_gun", label: "the pistol pulls", target: { abilityId: "corsair.ricochet_shot" }, ops: [{ kind: "projectile", addOnExpire: [{ kind: "status", status: "hooked", chance: 1, to: "enemies" }, { kind: "pull", force: 80, to: "enemies" }] }] }],
    ui: { badge: "HPG" },
  }),
  H("mutiny", "Mutiny", "A Plundered elite that dies fights for you as a ghost until the wave ends.", "Boarding Captain", "Pirate King", {
    effects: [
      { kind: "rule", rule: "corsair.hybrid.mutiny" },
      { kind: "grantEffect", on: { event: "enemyDeath" }, effects: [{ kind: "summon", unit: "ghost_deckhand", count: 1, duration: 12, command: { behavior: "aggroNearest", inheritPower: 0.6 } }] },
    ],
    ui: { badge: "MTN" },
  }),
  H("plunder_crew", "Plunder Crew", "Each active crew member adds a percentage to your Bounty payouts.", "Treasure Hunter", "Pirate King", {
    effects: [{ kind: "rule", rule: "corsair.hybrid.plunder_crew" }],
    ui: { badge: "PCW" },
  }),
  H("golden_bullet", "Golden Bullet", "Your Six Shooter round is a Plunder tag — free, and it always pays out.", "Gunslinger", "Treasure Hunter", {
    effects: [{ kind: "rule", rule: "corsair.hybrid.golden_bullet" }],
    ui: { badge: "GLD" },
  }),
  H("bounty_hunter", "Bounty Hunter", "Hooked enemies count as Bounty targets — you deal execute damage to anything on a line.", "Chainmaster", "Treasure Hunter", {
    mutations: [{ id: "corsair.bounty_hunter", label: "hooks mark for the kill", target: { withTag: "crowdControl" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "bounty", chance: 1, to: "allTargets" }] }] }],
    ui: { badge: "BTY" },
  }),
  {
    id: "corsair.dread_admiral",
    classId: "corsair",
    tier: "mythic",
    name: "Dread Admiral",
    description: "Broadside becomes a fleet action: the ghost crew mans the cannons, firing a second and third volley on their own, and every enemy the barrage kills is pressed into the crew for the rest of the run.",
    flavor: "The Corsair finally has a ship again. It is made of everyone who lost to the Corsair.",
    requires: [
      { path: "Chainmaster", points: 6 },
      { path: "Pirate King", points: 4 },
      { path: "Treasure Hunter", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "corsair.mythic.dread_admiral" }],
    mutations: [{
      id: "corsair.dread_admiral.broadside",
      label: "Broadside → Dread Admiral",
      target: { abilityId: "corsair.broadside" },
      ops: [
        { kind: "followUp", window: 3, effects: [{ kind: "damage", damage: { base: 2.4, scale: "attack", type: "fire", channel: "ultimate" }, to: "enemies" }] },
        { kind: "targeting", scaleLength: 1.2, scaleWidth: 1.2 },
      ],
    }],
    ui: { badge: "ADM" },
  },
];

export const CORSAIR: PilotClass = {
  classId: "corsair",
  name: "Corsair",
  fantasy: "Swashbuckling battlefield manipulator using hooks, crew, pistols, mobility, and enemy displacement.",
  role: "Mobility DPS / displacement / utility.",
  question: "How much can I control enemy positioning?",
  resources: CORSAIR_RESOURCES,
  statuses: CORSAIR_STATUSES,
  abilities: CORSAIR_ABILITIES,
  progression: CORSAIR_PROGRESSION,
  unlocks: CORSAIR_UNLOCKS,
};
