/**
 * Engineer — the combat builder. Scrap is salvaged from kills and debris and spent
 * deploying turrets, mortars, mines and walls; the ultimate meter fills while your
 * constructs are up and working. Almost nothing the Engineer does is a direct attack —
 * it is infrastructure. The paths are five kinds of workshop: guns, artillery, a
 * self-repairing base, demolition, and a mobile armory.
 *
 * Question: how much infrastructure can I build during combat?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const ENGINEER_SCRAP: ResourceSpec = {
  id: "scrap",
  label: "Scrap",
  max: 12,
  start: 4,
  ui: "charges",
  regenPerSec: 0.2,
  generation: [
    { on: "kill", amount: 2 },
    { on: "hitTaken", amount: 0.3 },
  ],
};

/** Siege Engine is earned by keeping infrastructure running — construct hits, never a personal kill. */
export const ENGINEER_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Siege Engine",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "skillUse", amount: 5, requireTags: ["construct"] },
    { on: "damageDealt", amount: 0.2, perUnit: "damage" },
  ],
};

export const ENGINEER_RESOURCES: readonly ResourceSpec[] = [ENGINEER_SCRAP, ENGINEER_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Tagged — an enemy that has strayed near a device. Remote Detonation hits Tagged targets much harder. */
export const STATUS_TAGGED: StatusSpec = {
  id: "tagged",
  label: "Tagged",
  glyph: "T",
  category: "debuff",
  tags: ["mark"],
  baseDuration: 8,
  maxStacks: 3,
  refreshRule: "stack",
  amplify: 1.06,
};

export const ENGINEER_STATUSES: readonly StatusSpec[] = [STATUS_TAGGED];

// --- abilities --------------------------------------------------------

export const ENGINEER_AUTO_TURRET: Ability = {
  id: "engineer.auto_turret",
  classId: "engineer",
  name: "Auto-Turret",
  description: "Bolt down a turret. It picks targets and fires on its own until it's destroyed or reclaimed.",
  flavor: "It does not need supervision. It resents supervision.",
  category: "summon",
  tags: ["summon", "construct"],
  costs: [{ resource: "scrap", amount: 3 }],
  cooldown: 6,
  targeting: "point",
  range: 160,
  effects: [
    { kind: "summon", unit: "auto_turret", count: 1, duration: 20, command: { behavior: "guardPoint", inheritPower: 0.6 } },
  ],
  mutationHooks: [{ id: "auto_turret.summon", kind: "summon", note: "Gunner path adds turrets and fire rate." }],
};

export const ENGINEER_MORTAR_POD: Ability = {
  id: "engineer.mortar_pod",
  classId: "engineer",
  name: "Mortar Pod",
  description: "Deploy an indirect-fire pod. It lobs shells at a marked area on a slow, heavy cadence.",
  flavor: "Line of sight is a limitation for lesser weapons.",
  category: "summon",
  tags: ["summon", "construct", "area"],
  costs: [{ resource: "scrap", amount: 4 }],
  cooldown: 12,
  targeting: "point",
  range: 300,
  effects: [
    { kind: "summon", unit: "mortar_pod", count: 1, duration: 18, command: { behavior: "guardPoint", inheritPower: 0.7 } },
    { kind: "zone", zone: { radius: 100, duration: 18, tickInterval: 2, follows: false, damage: { base: 1.4, scale: "attack", type: "fire", channel: "periodic" } } },
  ],
};

export const ENGINEER_REPAIR_DRONE: Ability = {
  id: "engineer.repair_drone",
  classId: "engineer",
  name: "Repair Drone",
  description: "A small drone that patches up your constructs and shields nearby allies.",
  flavor: "It hums. Reassuringly, on a good day.",
  category: "summon",
  tags: ["summon", "construct", "heal", "support"],
  costs: [{ resource: "scrap", amount: 2 }],
  cooldown: 14,
  targeting: "self",
  effects: [
    { kind: "summon", unit: "repair_drone", count: 1, duration: 20, command: { behavior: "follow" } },
    { kind: "shield", amount: 1.0, scale: "attack", to: "allies", duration: 6 },
  ],
};

export const ENGINEER_SHOCK_MINE: Ability = {
  id: "engineer.shock_mine",
  classId: "engineer",
  name: "Shock Mine",
  description: "A proximity mine that stuns and tags everything in its radius when triggered.",
  flavor: "Bright, loud, and educational.",
  category: "terrain",
  tags: ["trap", "crowdControl", "construct", "lightning"],
  costs: [{ resource: "scrap", amount: 2 }],
  cooldown: 6,
  targeting: "point",
  range: 140,
  effects: [
    { kind: "terrain", piece: "anchor", duration: 25, hp: 1 },
    { kind: "delay", seconds: 0, effects: [
      { kind: "damage", damage: { base: 1.0, scale: "attack", type: "lightning", canCrit: true }, to: "enemies" },
      { kind: "status", status: "stunned", chance: 1, to: "enemies" },
      { kind: "status", status: "tagged", chance: 1, to: "enemies" },
    ] },
  ],
};

export const ENGINEER_REINFORCED_BARRICADE: Ability = {
  id: "engineer.reinforced_barricade",
  classId: "engineer",
  name: "Reinforced Barricade",
  description: "Throw up a plated wall. It blocks movement, projectiles, and line of sight until it's broken down.",
  flavor: "Assembled on site. The instructions were, frankly, optional.",
  category: "terrain",
  tags: ["terrain", "construct", "barrier"],
  costs: [{ resource: "scrap", amount: 3 }],
  cooldown: 12,
  targeting: "point",
  range: 140,
  effects: [
    { kind: "terrain", piece: "barricade", length: 140, duration: 15, hp: 250 },
  ],
  mutationHooks: [{ id: "reinforced_barricade.terrain", kind: "zone", note: "Quartermaster path lets the wall carry an ammo cache." }],
};

export const ENGINEER_SCRAP_MAGNET: Ability = {
  id: "engineer.scrap_magnet",
  classId: "engineer",
  name: "Scrap Magnet",
  description: "Pull loose debris and dead constructs to you and weld it on — a plate of temporary armor.",
  flavor: "Recycling, weaponised.",
  category: "utility",
  tags: ["barrier", "resourceGenerator"],
  cooldown: 10,
  targeting: "self",
  effects: [
    { kind: "resource", resource: "scrap", delta: 3, to: "self" },
    { kind: "shield", amount: 1.8, scale: "attack", to: "self", duration: 8 },
  ],
};

export const ENGINEER_OVERCLOCK: Ability = {
  id: "engineer.overclock",
  classId: "engineer",
  name: "Overclock",
  description: "Push every construct you own past its rated limits — much higher fire rate, for a while.",
  flavor: "The warranty was void the moment it left the workshop.",
  category: "support",
  tags: ["support", "construct"],
  cooldown: 24,
  targeting: "summon",
  effects: [
    { kind: "commandSummons", command: "aggroNearest", to: "summons" },
    { kind: "resource", resource: "ultimate", delta: 8, to: "self" },
  ],
  mutationHooks: [{ id: "overclock.rule", kind: "summon", note: "Mechanic path makes Overclock free and near-permanent." }],
};

export const ENGINEER_REMOTE_DETONATION: Ability = {
  id: "engineer.remote_detonation",
  classId: "engineer",
  name: "Remote Detonation",
  description: "Trigger every mine and expendable device on the field at once. Tagged enemies take the worst of it.",
  flavor: "The button was the fun part to build.",
  category: "attack",
  tags: ["area"],
  cooldown: 16,
  targeting: "self",
  effects: [
    { kind: "damage", damage: { base: 2.4, scale: "attack", type: "fire", canCrit: true, knockback: 100 }, to: "enemies" },
    { kind: "consumeStatus", status: "tagged", to: "enemies", then: [
      { kind: "damage", damage: { base: 2.0, scale: "attack", type: "fire", canCrit: true, channel: "execute" }, to: "enemies" },
    ] },
  ],
  mutationHooks: [{ id: "remote_detonation.packet", kind: "damagePacket", note: "Saboteur path chains the detonation and re-lays the mines." }],
};

export const ENGINEER_EMERGENCY_ASSEMBLY: Ability = {
  id: "engineer.emergency_assembly",
  classId: "engineer",
  name: "Emergency Assembly",
  description: "Slam a crate down and unfold a defensive machine on the spot — a shield generator, right now.",
  flavor: "Some assembly required. All of it, actually, in about a second.",
  category: "summon",
  tags: ["summon", "construct", "barrier"],
  costs: [{ resource: "scrap", amount: 5 }],
  cooldown: 20,
  targeting: "point",
  range: 120,
  effects: [
    { kind: "summon", unit: "shield_generator", count: 1, duration: 12, command: { behavior: "guardPoint" } },
    { kind: "zone", zone: { radius: 120, duration: 12, tickInterval: 1, follows: false, benefit: "shield" } },
  ],
};

export const ENGINEER_SIEGE_ENGINE: Ability = {
  id: "engineer.siege_engine",
  classId: "engineer",
  name: "Siege Engine",
  description: "Assemble a walking war machine. It bombards from range, blocks a lane with its bulk, and fights on its own until the timer runs out.",
  flavor: "The Engineer built a friend. The friend has a cannon.",
  category: "ultimate",
  tags: ["ultimate", "construct", "summon"],
  cooldown: 0,
  isUltimate: true,
  targeting: "point",
  range: 160,
  effects: [
    { kind: "fx", fx: "engineer.assemble" },
    { kind: "summon", unit: "siege_engine", count: 1, duration: 16, command: { behavior: "aggroNearest", inheritPower: 1 } },
    { kind: "zone", zone: { radius: 160, duration: 16, tickInterval: 1.5, follows: true, damage: { base: 1.6, scale: "attack", type: "fire", channel: "ultimate" } } },
  ],
  mutationHooks: [{ id: "siege_engine.summon", kind: "summon", note: "The Foundry keeps the machine and lets it build more." }],
};

export const ENGINEER_ABILITIES: readonly Ability[] = [
  ENGINEER_AUTO_TURRET,
  ENGINEER_MORTAR_POD,
  ENGINEER_REPAIR_DRONE,
  ENGINEER_SHOCK_MINE,
  ENGINEER_REINFORCED_BARRICADE,
  ENGINEER_SCRAP_MAGNET,
  ENGINEER_OVERCLOCK,
  ENGINEER_REMOTE_DETONATION,
  ENGINEER_EMERGENCY_ASSEMBLY,
  ENGINEER_SIEGE_ENGINE,
];

// --- the tree --------------------------------------------------------

export const ENGINEER_PROGRESSION: ClassProgression = {
  classId: "engineer",
  paths: [
    // 0 — Gunner: a wall of automatic fire.
    {
      name: "Gunner",
      blurb: "More barrels. Always more barrels.",
      nodes: [
        { name: "Machine Shop", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.05 } }, { kind: "grantEffect", on: { tag: "construct" }, effects: [{ kind: "resource", resource: "ultimate", delta: 2, to: "self" }] }] },
        { name: "Belt Feed", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "gn.belt_feed", label: "turrets inherit more of your power and fire faster", target: { withTag: "construct" }, ops: [{ kind: "summon", addInheritPower: 0.2 }] } }] },
        { name: "Ammo Line", category: "resource", effects: [{ kind: "resourceRule", resource: "scrap", patch: { max: 16, addGeneration: [{ on: "enemyDeath", amount: 1 }] } }] },
        { name: "Twin Mount", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "gn.twin_mount", label: "Auto-Turret deploys two", target: { abilityId: "engineer.auto_turret" }, ops: [{ kind: "summon", addCount: 1 }, { kind: "cooldown", scale: 0.85 }] } }] },
        { name: "Automated Army", category: "keystone", effects: [{ kind: "rule", rule: "engineer.gn.automated_army", note: "Your turret cap doubles and killing an enemy near a turret drops a free one." }] },
      ],
    },
    // 1 — Siege Engineer: heavy indirect fire.
    {
      name: "Siege Engineer",
      blurb: "If you can see it, it's already too close.",
      nodes: [
        { name: "Ballistics", category: "foundation", effects: [{ kind: "mods", mods: { areaSize: 0.15, fireDamage: 0.1 } }] },
        { name: "Registered Fire", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "se.registered_fire", label: "Mortar Pod shells land in a tighter, harder pattern", target: { abilityId: "engineer.mortar_pod" }, ops: [{ kind: "damagePacket", scaleBase: 1.3 }] } }] },
        { name: "Shell Store", category: "resource", effects: [{ kind: "resourceRule", resource: "scrap", patch: { addGeneration: [{ on: "hitTaken", amount: 0.5 }] } }] },
        { name: "Danger Close", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "se.danger_close", label: "Mortar Pod also drops a suppressing zone", target: { abilityId: "engineer.mortar_pod" }, ops: [{ kind: "zone", scaleRadius: 1.3, scaleDamage: 1.2 }] } }] },
        { name: "Artillery Platform", category: "keystone", effects: [{ kind: "rule", rule: "engineer.se.artillery_platform", note: "A stationary Engineer directs every construct's fire onto one target for massive focused damage." }] },
      ],
    },
    // 2 — Mechanic: the base repairs itself.
    {
      name: "Mechanic",
      blurb: "Nothing you build should ever have to be built twice.",
      nodes: [
        { name: "Spare Parts", category: "foundation", effects: [{ kind: "mods", mods: { wardPower: 0.1, cooldownRate: 0.05 } }] },
        { name: "Auto-Repair", category: "behavior", effects: [{ kind: "rule", rule: "engineer.mc.auto_repair", note: "Constructs slowly repair themselves and don't expire while you're near them." }] },
        { name: "Salvage Loop", category: "resource", effects: [{ kind: "resourceRule", resource: "scrap", patch: { regenPerSec: 0.5 } }] },
        { name: "Governor Removed", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "mc.governor_removed", label: "Overclock is cheaper and lasts far longer", target: { abilityId: "engineer.overclock" }, ops: [{ kind: "cooldown", scale: 0.5 }] } }] },
        { name: "Self-Repairing Workshop", category: "keystone", effects: [{ kind: "rule", rule: "engineer.mc.self_repairing_workshop", note: "Repair Drone becomes permanent and rebuilds the last destroyed construct on a timer." }] },
      ],
    },
    // 3 — Saboteur: everything is a bomb.
    {
      name: "Saboteur",
      blurb: "The best construct is the one that goes off.",
      nodes: [
        { name: "Det Cord", category: "foundation", effects: [{ kind: "mods", mods: { areaSize: 0.1 } }, { kind: "grantEffect", on: { tag: "trap" }, effects: [{ kind: "status", status: "tagged", chance: 1, to: "enemies" }] }] },
        { name: "Cluster Mine", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "sa.cluster_mine", label: "Shock Mine scatters two bomblets", target: { abilityId: "engineer.shock_mine" }, ops: [{ kind: "targeting", scaleRadius: 1.3 }] } }] },
        { name: "Ordnance Depot", category: "resource", effects: [{ kind: "resourceRule", resource: "scrap", patch: { addGeneration: [{ on: "ailmentInflicted", amount: 0.5 }] } }] },
        { name: "Daisy Chain", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "sa.daisy_chain", label: "Remote Detonation re-arms every mine after it fires", target: { abilityId: "engineer.remote_detonation" }, ops: [{ kind: "cooldown", scale: 0.7 }, { kind: "damagePacket", scaleBase: 1.2 }] } }] },
        { name: "Chain Detonation", category: "keystone", effects: [{ kind: "rule", rule: "engineer.sa.chain_detonation", note: "A construct destroyed by anything detonates like a Shock Mine, and the blast can trigger others." }] },
      ],
    },
    // 4 — Quartermaster: supply the whole party.
    {
      name: "Quartermaster",
      blurb: "An army moves on the stuff you left lying around for it.",
      nodes: [
        { name: "Requisition", category: "foundation", effects: [{ kind: "mods", mods: { manaOnHit: 2 } }] },
        { name: "Standard Issue", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "qm.standard_issue", label: "your shields also grant a small damage buff", target: { withTag: "barrier" }, ops: [{ kind: "damagePacket", scaleBase: 1.1 }] } }] },
        { name: "Depot Network", category: "resource", effects: [{ kind: "resourceRule", resource: "scrap", patch: { max: 20 } }] },
        { name: "Ammo Cache", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "qm.ammo_cache", label: "Reinforced Barricade carries a cache that refills ally resources", target: { abilityId: "engineer.reinforced_barricade" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "zone", zone: { radius: 120, duration: 15, tickInterval: 2, follows: false, benefit: "shield" } }] }] } }] },
        { name: "Mobile Armory", category: "keystone", effects: [{ kind: "rule", rule: "engineer.qm.mobile_armory", note: "You carry the cache — allies near you regenerate resources and reload faster." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `engineer.${id}`,
  classId: "engineer",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `engineer.hybrid.${id}` }],
  ...extra,
});

export const ENGINEER_UNLOCKS: PathUnlockDef[] = [
  H("killbox", "Killbox", "Turrets prioritise Tagged enemies and their hits refresh the Tag — a marked target never leaves the crossfire.", "Gunner", "Saboteur", {
    effects: [{ kind: "rule", rule: "engineer.hybrid.killbox" }],
    ui: { badge: "KBX" },
  }),
  H("forward_base", "Forward Base", "Reinforced Barricade also deploys a small turret on top of itself.", "Siege Engineer", "Quartermaster", {
    mutations: [{ id: "engineer.forward_base", label: "the wall shoots back", target: { abilityId: "engineer.reinforced_barricade" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "summon", unit: "auto_turret", count: 1, duration: 15, command: { behavior: "guardPoint", inheritPower: 0.5 } }] }] }],
    ui: { badge: "FWD" },
  }),
  H("autonomous_army", "Autonomous Army", "Overclocked turrets pick their own repositions and don't need line of sight.", "Mechanic", "Gunner", {
    effects: [{ kind: "rule", rule: "engineer.hybrid.autonomous_army" }],
    ui: { badge: "AUT" },
  }),
  H("recursive_explosives", "Recursive Explosives", "A construct that detonates rebuilds itself once from the Scrap the blast scattered.", "Saboteur", "Mechanic", {
    effects: [{ kind: "rule", rule: "engineer.hybrid.recursive_explosives" }],
    ui: { badge: "REC" },
  }),
  H("demolition_zone", "Demolition Zone", "Mortar Pod shells also lay a Shock Mine wherever they land.", "Siege Engineer", "Saboteur", {
    mutations: [{ id: "engineer.demolition_zone", label: "shells seed mines", target: { abilityId: "engineer.mortar_pod" }, ops: [{ kind: "zone", scaleDamage: 1.2 }] }],
    ui: { badge: "DMZ" },
  }),
  H("field_workshop", "Field Workshop", "Repair Drone also repairs allies' gear-granted constructs and refunds their cooldowns.", "Quartermaster", "Mechanic", {
    effects: [{ kind: "rule", rule: "engineer.hybrid.field_workshop" }],
    ui: { badge: "FWK" },
  }),
  {
    id: "engineer.the_foundry",
    classId: "engineer",
    tier: "mythic",
    name: "The Foundry",
    description: "Siege Engine stops being a summon and becomes a factory. It is permanent, it repairs itself, and every few seconds it builds a turret or a mine of its own — the Engineer's whole workshop, walking around the arena assembling more of itself.",
    flavor: "The Engineer stopped building things and built a thing that builds things.",
    requires: [
      { path: "Gunner", points: 6 },
      { path: "Siege Engineer", points: 4 },
      { path: "Mechanic", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "engineer.mythic.the_foundry" }],
    mutations: [{
      id: "engineer.the_foundry.siege_engine",
      label: "Siege Engine → The Foundry",
      target: { abilityId: "engineer.siege_engine" },
      ops: [
        { kind: "summon", scaleDuration: 3, addInheritPower: 0.4 },
        { kind: "addEffect", at: "end", effects: [{ kind: "summon", unit: "auto_turret", count: 2, duration: 16, command: { behavior: "guardPoint", inheritPower: 0.6 } }] },
      ],
    }],
    ui: { badge: "FNDRY" },
  },
];

export const ENGINEER: PilotClass = {
  classId: "engineer",
  name: "Engineer",
  fantasy: "Combat builder using turrets, mines, drones, walls, and battlefield infrastructure.",
  role: "Ranged DPS / defensive utility / infrastructure.",
  question: "How much infrastructure can I build during combat?",
  resources: ENGINEER_RESOURCES,
  statuses: ENGINEER_STATUSES,
  abilities: ENGINEER_ABILITIES,
  progression: ENGINEER_PROGRESSION,
  unlocks: ENGINEER_UNLOCKS,
};
