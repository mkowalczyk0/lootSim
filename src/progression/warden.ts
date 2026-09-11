/**
 * Warden — guardian of the wild. Roots are spent turning the arena into living
 * terrain: walls of vine, snares, healing groves. The ultimate meter fills by how much
 * of the field you have claimed. Where the Juggernaut is the safe place to stand, the
 * Warden makes the whole floor unsafe for the enemy. The paths are five aspects of the
 * wild: the beast, the verdant, the thorn, the hunt, and the ancient.
 *
 * Question: how much of the arena can I turn into friendly terrain?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const WARDEN_ROOTS: ResourceSpec = {
  id: "roots",
  label: "Roots",
  max: 100,
  start: 20,
  ui: "bar",
  regenPerSec: 2,
  generation: [
    { on: "skillUse", amount: 10, requireTags: ["terrain"] },
    { on: "skillUse", amount: 8, requireTags: ["nature"] },
    { on: "hitTaken", amount: 3 },
  ],
  thresholds: [{ at: 80, whileAbove: { defensePercent: 0.12 } }],
};

/** Ancient Grove is earned by claiming ground — nature skills and terrain, never a kill count. */
export const WARDEN_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "The Grove",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "skillUse", amount: 6, requireTags: ["terrain"] },
    { on: "skillUse", amount: 4, requireTags: ["nature"] },
  ],
};

export const WARDEN_RESOURCES: readonly ResourceSpec[] = [WARDEN_ROOTS, WARDEN_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Entangled — Vine Snare's hard root: it cannot be broken by movement, only waited out or dashed. */
export const STATUS_ENTANGLED: StatusSpec = {
  id: "entangled",
  label: "Entangled",
  glyph: "E",
  category: "cc",
  tags: ["crowdControl", "nature"],
  baseDuration: 3,
  maxStacks: 1,
  refreshRule: "refresh",
  disables: { move: true },
  dps: 0.05,
  tickInterval: 0.5,
  damageType: "nature",
  damageChannel: "dot",
};

/** Bear Form — the Warden's tank aspect: a slab of health and armor, at the cost of finesse. */
export const STATUS_BEAR_FORM: StatusSpec = {
  id: "bear_form",
  label: "Bear Aspect",
  glyph: "&",
  category: "buff",
  baseDuration: 12,
  maxStacks: 1,
  refreshRule: "refresh",
  mods: { maxHealth: 60, defensePercent: 0.25, meleeDamage: 0.15, moveSpeed: -0.1 },
};

export const WARDEN_STATUSES: readonly StatusSpec[] = [STATUS_ENTANGLED, STATUS_BEAR_FORM];

// --- abilities --------------------------------------------------------

export const WARDEN_THORNSTRIKE: Ability = {
  id: "warden.thornstrike",
  classId: "warden",
  name: "Thornstrike",
  description: "Loose a hardened thorn that pins its target with a knot of roots on impact.",
  flavor: "The plant does the holding. The Warden just aims.",
  category: "attack",
  tags: ["ranged", "projectile", "nature", "crowdControl"],
  cooldown: 3,
  targeting: "direction",
  range: 280,
  effects: [
    { kind: "projectile", projectile: { damage: { base: 1.2, scale: "attack", type: "nature", canCrit: true, inflict: { status: "rooted", chance: 1 } }, speed: 480, radius: 8, life: 0.9 } },
  ],
};

export const WARDEN_LIVING_WALL: Ability = {
  id: "warden.living_wall",
  classId: "warden",
  name: "Living Wall",
  description: "Raise a wall of thick vine. It blocks and it bites anything that pushes against it.",
  flavor: "It is a wall the way a hedge is a wall, if the hedge had opinions.",
  category: "terrain",
  tags: ["terrain", "nature", "barrier"],
  costs: [{ resource: "roots", amount: 20 }],
  cooldown: 12,
  targeting: "point",
  range: 150,
  effects: [
    { kind: "terrain", piece: "wall", length: 150, duration: 12, hp: 220 },
    { kind: "zone", zone: { radius: 60, duration: 12, tickInterval: 1, follows: false, damage: { base: 0.3, scale: "attack", type: "nature", channel: "periodic" }, status: { id: "rooted", chance: 0.3 } } },
  ],
  mutationHooks: [{ id: "living_wall.terrain", kind: "zone", note: "Thornkeeper path makes the wall lash out." }],
};

export const WARDEN_BEAR_ASPECT: Ability = {
  id: "warden.bear_aspect",
  classId: "warden",
  name: "Bear Aspect",
  description: "Take on the shape of the bear — a wall of health and muscle, slower but very hard to move.",
  flavor: "The Warden is still in there. Mostly.",
  category: "support",
  tags: ["support"],
  cooldown: 20,
  targeting: "self",
  effects: [
    { kind: "status", status: "bear_form", chance: 1, to: "self" },
    { kind: "threat", op: "generate", radius: 150, amount: 40, to: "enemies" },
  ],
  mutationHooks: [{ id: "bear_aspect.status", kind: "status", note: "Beast path sharpens the form and adds a swipe." }],
};

export const WARDEN_VINE_SNARE: Ability = {
  id: "warden.vine_snare",
  classId: "warden",
  name: "Vine Snare",
  description: "Vines erupt across an area and lock everything in it down hard.",
  flavor: "It is very difficult to argue with topiary.",
  category: "spell",
  tags: ["nature", "area", "crowdControl"],
  cooldown: 11,
  targeting: "radius",
  range: 200,
  fx: { travel: "lance" },
  shape: { radius: 120 },
  effects: [
    { kind: "damage", damage: { base: 0.8, scale: "attack", type: "nature", canCrit: true }, to: "allTargets" },
    { kind: "status", status: "entangled", chance: 1, to: "allTargets" },
  ],
};

export const WARDEN_VERDANT_SHELTER: Ability = {
  id: "warden.verdant_shelter",
  classId: "warden",
  name: "Verdant Shelter",
  description: "Grow a canopy over a patch of ground. Allies beneath it are healed and shielded from ranged fire.",
  flavor: "Somewhere to stand that isn't trying to kill you. A rare amenity.",
  category: "terrain",
  tags: ["zone", "nature", "heal", "support"],
  costs: [{ resource: "roots", amount: 20 }],
  cooldown: 16,
  targeting: "point",
  range: 160,
  effects: [
    { kind: "zone", zone: { radius: 120, duration: 10, tickInterval: 1, follows: false, benefit: "heal" } },
  ],
  mutationHooks: [{ id: "verdant_shelter.zone", kind: "zone", note: "Verdant path makes the shelter follow the party." }],
};

export const WARDEN_NATURES_REPRISAL: Ability = {
  id: "warden.natures_reprisal",
  classId: "warden",
  name: "Nature's Reprisal",
  description: "For a few seconds, anything that strikes you is grabbed by roots and struck back.",
  flavor: "The wild does not turn the other cheek.",
  category: "support",
  tags: ["counter", "nature"],
  cooldown: 14,
  targeting: "self",
  effects: [
    { kind: "reactive", event: "damageTaken", window: 4, effects: [
      { kind: "damage", damage: { base: 1.2, scale: "attack", type: "nature", channel: "retaliation" }, to: "enemies" },
      { kind: "status", status: "rooted", chance: 1, to: "enemies" },
    ] },
  ],
};

export const WARDEN_WILD_CHARGE: Ability = {
  id: "warden.wild_charge",
  classId: "warden",
  name: "Wild Charge",
  description: "A shoulder-first animal charge that scatters everything in its path.",
  flavor: "Not elegant. Deeply effective.",
  category: "movement",
  tags: ["movement", "charge", "melee"],
  cooldown: 9,
  targeting: "line",
  range: 240,
  shape: { width: 50, length: 240 },
  effects: [
    { kind: "move", style: "charge", distance: 240, iframes: 0.3 },
    { kind: "damage", damage: { base: 1.6, scale: "attack", type: "physical", canCrit: true, knockback: 120 }, to: "allTargets" },
  ],
};

export const WARDEN_REGROWTH: Ability = {
  id: "warden.regrowth",
  classId: "warden",
  name: "Regrowth",
  description: "Plant a seed. Over a few seconds it grows into a healing bloom that tends the nearest wounded ally.",
  flavor: "Patience. It's coming.",
  category: "summon",
  tags: ["summon", "nature", "heal"],
  costs: [{ resource: "roots", amount: 15 }],
  cooldown: 18,
  targeting: "point",
  range: 160,
  effects: [
    { kind: "summon", unit: "healing_bloom", count: 1, duration: 14, command: { behavior: "guardPoint" } },
    { kind: "heal", amount: 0.3, scale: "attack", to: "lowestHealthAlly", overTime: { duration: 6 } },
  ],
};

export const WARDEN_OVERGROWTH: Ability = {
  id: "warden.overgrowth",
  classId: "warden",
  name: "Overgrowth",
  description: "Feed Roots into everything you've grown — walls, snares, shelters, blooms all surge outward.",
  flavor: "It was going to grow anyway. This is just encouragement.",
  category: "spell",
  tags: ["area", "resourceSpender", "nature"],
  costs: [{ resource: "roots", amount: 40 }],
  cooldown: 20,
  targeting: "self",
  effects: [
    { kind: "damage", damage: { base: 1.4, scale: "attack", type: "nature", canCrit: true }, to: "enemies" },
    { kind: "status", status: "entangled", chance: 0.6, to: "enemies" },
  ],
  mutationHooks: [{ id: "overgrowth.rule", kind: "zone", note: "Ancient path makes Overgrowth permanent within the arena." }],
};

export const WARDEN_ANCIENT_GROVE: Ability = {
  id: "warden.ancient_grove",
  classId: "warden",
  name: "Ancient Grove",
  description: "The floor becomes old forest. Trees rise as cover, roots hold the enemy, and the whole area heals your side and hurts theirs for the duration.",
  flavor: "The forest was always here. The Warden just reminded it.",
  category: "ultimate",
  tags: ["ultimate", "terrain", "zone", "nature"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  effects: [
    { kind: "fx", fx: "warden.grove" },
    { kind: "terrain", piece: "cover", length: 300, duration: 14, hp: 300 },
    { kind: "zone", zone: { radius: 280, duration: 14, tickInterval: 1, follows: false, damage: { base: 0.5, scale: "attack", type: "nature", channel: "ultimate" }, status: { id: "entangled", chance: 0.3 } } },
    { kind: "zone", zone: { radius: 280, duration: 14, tickInterval: 1, follows: false, benefit: "heal" } },
  ],
  mutationHooks: [{ id: "ancient_grove.zone", kind: "zone", note: "The Wildwood makes the grove permanent and mobile." }],
};

export const WARDEN_ABILITIES: readonly Ability[] = [
  WARDEN_THORNSTRIKE,
  WARDEN_LIVING_WALL,
  WARDEN_BEAR_ASPECT,
  WARDEN_VINE_SNARE,
  WARDEN_VERDANT_SHELTER,
  WARDEN_NATURES_REPRISAL,
  WARDEN_WILD_CHARGE,
  WARDEN_REGROWTH,
  WARDEN_OVERGROWTH,
  WARDEN_ANCIENT_GROVE,
];

// --- the tree --------------------------------------------------------

export const WARDEN_PROGRESSION: ClassProgression = {
  classId: "warden",
  paths: [
    // 0 — Beast: fight with tooth and claw.
    {
      name: "Beast",
      blurb: "The wild has a melee option.",
      nodes: [
        { name: "Thick Hide", category: "foundation", effects: [{ kind: "mods", mods: { maxHealth: 25, meleeDamage: 0.06 } }] },
        { name: "Maul", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "be.maul", label: "Bear Aspect adds a cleaving swipe on a timer", target: { abilityId: "warden.bear_aspect" }, ops: [{ kind: "trigger", event: "hit", window: 12, effects: [{ kind: "damage", damage: { base: 0.6, scale: "attack", type: "physical", channel: "retaliation" }, to: "enemies" }] }] } }] },
        { name: "Feed", category: "resource", effects: [{ kind: "resourceRule", resource: "roots", patch: { addGeneration: [{ on: "hitDealt", amount: 2, requireTags: ["melee"] }] } }] },
        { name: "Rend", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "be.rend", label: "Wild Charge leaves bleeding, entangled enemies behind it", target: { abilityId: "warden.wild_charge" }, ops: [{ kind: "damagePacket", setInflict: { status: "bleed", chance: 1 } }] } }] },
        { name: "Primal Guardian", category: "keystone", effects: [{ kind: "rule", rule: "warden.be.primal_guardian", note: "Bear Aspect no longer expires and its swipe roots — you are the wall and the counterattack." }] },
      ],
    },
    // 1 — Verdant: the healing forest.
    {
      name: "Verdant",
      blurb: "Green things, growing fast, between your party and the fight.",
      nodes: [
        { name: "Green Thumb", category: "foundation", effects: [{ kind: "mods", mods: { healthPercent: 0.06 } }] },
        { name: "Deep Roots", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "vd.deep_roots", label: "your heal and shelter zones last much longer", target: { withTag: "heal" }, ops: [{ kind: "zone", scaleDuration: 1.5 }] } }] },
        { name: "Photosynthesis", category: "resource", effects: [{ kind: "resourceRule", resource: "roots", patch: { regenPerSec: 4 } }] },
        { name: "Canopy", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "vd.canopy", label: "Verdant Shelter follows the party", target: { abilityId: "warden.verdant_shelter" }, ops: [{ kind: "zone", forceFollows: true, scaleRadius: 1.2 }] } }] },
        { name: "Worldroot", category: "keystone", effects: [{ kind: "rule", rule: "warden.vd.worldroot", note: "All your healing zones are linked — standing in one is standing in all of them." }] },
      ],
    },
    // 2 — Thornkeeper: the terrain fights back.
    {
      name: "Thornkeeper",
      blurb: "Your walls should not just stand there.",
      nodes: [
        { name: "Barbed Growth", category: "foundation", effects: [{ kind: "mods", mods: { thorns: 6 } }, { kind: "grantEffect", on: { tag: "nature" }, effects: [{ kind: "status", status: "bleed", chance: 0.25, to: "allTargets" }] }] },
        { name: "Lashing Vines", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "tk.lashing_vines", label: "Living Wall whips nearby enemies", target: { abilityId: "warden.living_wall" }, ops: [{ kind: "zone", scaleRadius: 1.4, scaleDamage: 1.4 }] } }] },
        { name: "Deadfall", category: "resource", effects: [{ kind: "resourceRule", resource: "roots", patch: { addGeneration: [{ on: "hitTaken", amount: 2 }] } }] },
        { name: "Thorn Field", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "tk.thorn_field", label: "Vine Snare leaves a damaging thicket", target: { abilityId: "warden.vine_snare" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "zone", zone: { radius: 120, duration: 6, tickInterval: 0.5, follows: false, damage: { base: 0.3, scale: "attack", type: "nature", channel: "periodic" }, status: { id: "entangled", chance: 0.2 } } }] }] } }] },
        { name: "Briarheart", category: "keystone", effects: [{ kind: "rule", rule: "warden.tk.briarheart", note: "Every terrain piece you own pulses a thorn nova on a timer, scaled by how many are up." }] },
      ],
    },
    // 3 — Huntmaster: run the fight down with the pack.
    {
      name: "Huntmaster",
      blurb: "The Warden does not hunt alone.",
      nodes: [
        { name: "Pack Bond", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.06, skillDamage: 0.05 } }] },
        { name: "Call the Pack", category: "behavior", effects: [{ kind: "grantEffect", on: { tag: "charge" }, effects: [{ kind: "summon", unit: "spirit_wolf", count: 1, duration: 10, command: { behavior: "aggroNearest", inheritPower: 0.5 } }] }] },
        { name: "Cull", category: "resource", effects: [{ kind: "resourceRule", resource: "roots", patch: { addGeneration: [{ on: "enemyDeath", amount: 6 }] } }] },
        { name: "Run Them Ragged", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "hm.run_them_ragged", label: "Wild Charge can be steered and hits twice", target: { abilityId: "warden.wild_charge" }, ops: [{ kind: "movement", addDistance: 100 }, { kind: "cooldown", scale: 0.8 }] } }] },
        { name: "Apex Predator", category: "keystone", effects: [{ kind: "rule", rule: "warden.hm.apex_predator", note: "Wolves are permanent, and the Warden and pack all deal execute damage to entangled enemies." }] },
      ],
    },
    // 4 — Ancient: old, slow, immovable growth.
    {
      name: "Ancient",
      blurb: "Some forests were here before the dungeon.",
      nodes: [
        { name: "Old Growth", category: "foundation", effects: [{ kind: "mods", mods: { areaSize: 0.15, defensePercent: 0.06 } }] },
        { name: "Slow and Certain", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "an.slow_and_certain", label: "your terrain has far more health and blocks longer", target: { withTag: "terrain" }, ops: [{ kind: "cooldown", scale: 0.9 }] } }] },
        { name: "Heartwood", category: "resource", effects: [{ kind: "resourceRule", resource: "roots", patch: { max: 140, decayPerSec: 0 } }] },
        { name: "Grove Sense", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "an.grove_sense", label: "Overgrowth also heals allies and shields your terrain", target: { abilityId: "warden.overgrowth" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "heal", amount: 0.3, scale: "attack", to: "allies" }] }] } }] },
        { name: "Elder Grove", category: "keystone", effects: [{ kind: "rule", rule: "warden.an.elder_grove", note: "One terrain piece per fight is made permanent and immune to destruction." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `warden.${id}`,
  classId: "warden",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `warden.hybrid.${id}` }],
  ...extra,
});

export const WARDEN_UNLOCKS: PathUnlockDef[] = [
  H("apex", "Apex", "In Bear Aspect, killing an entangled enemy heals you and refreshes the form.", "Beast", "Huntmaster", {
    effects: [
      { kind: "rule", rule: "warden.hybrid.apex" },
      { kind: "grantEffect", on: { event: "kill" }, effects: [{ kind: "heal", amount: 0.3, scale: "attack", to: "self" }] },
    ],
    ui: { badge: "APX" },
  }),
  H("briar_sanctuary", "Briar Sanctuary", "Verdant Shelter's canopy also lashes enemies who step under it.", "Verdant", "Thornkeeper", {
    mutations: [{ id: "warden.briar_sanctuary", label: "the shelter has thorns", target: { abilityId: "warden.verdant_shelter" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "zone", zone: { radius: 120, duration: 10, tickInterval: 1, follows: false, damage: { base: 0.3, scale: "attack", type: "nature", channel: "periodic" }, status: { id: "rooted", chance: 0.3 } } }] }] }],
    ui: { badge: "BSC" },
  }),
  H("world_tree", "World Tree", "Ancient Grove can be seeded early — a small permanent grove that grows every time you cast a nature skill near it.", "Ancient", "Verdant", {
    effects: [{ kind: "rule", rule: "warden.hybrid.world_tree" }],
    ui: { badge: "WTR" },
  }),
  H("predators_retaliation", "Predator's Retaliation", "Nature's Reprisal also triggers from your terrain — hitting a Living Wall gets the attacker struck back.", "Beast", "Thornkeeper", {
    effects: [{ kind: "rule", rule: "warden.hybrid.predators_retaliation" }],
    ui: { badge: "PRT" },
  }),
  H("pack_growth", "Pack Growth", "Regrowth blooms also buff the pack's damage while they stand near one.", "Huntmaster", "Verdant", {
    effects: [{ kind: "rule", rule: "warden.hybrid.pack_growth" }],
    ui: { badge: "PGR" },
  }),
  H("elder_form", "Elder Form", "Bear Aspect becomes the treant — slower still, but its swipes are area attacks and it cannot be displaced at all.", "Ancient", "Beast", {
    mutations: [{ id: "warden.elder_form", label: "the bear becomes a treant", target: { abilityId: "warden.bear_aspect" }, ops: [{ kind: "status", scaleDuration: 1.5 }] }],
    ui: { badge: "ELD" },
  }),
  {
    id: "warden.the_wildwood",
    classId: "warden",
    tier: "mythic",
    name: "The Wildwood",
    description: "Ancient Grove stops being a cooldown. Once cast, the forest stays for the rest of the floor, it drifts slowly to follow the party, and every nature skill cast inside it is doubled and free of Roots.",
    flavor: "The Warden did not summon a forest. The Warden let one in, and it liked it here.",
    requires: [
      { path: "Verdant", points: 6 },
      { path: "Thornkeeper", points: 4 },
      { path: "Ancient", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "warden.mythic.the_wildwood" }],
    mutations: [{
      id: "warden.the_wildwood.grove",
      label: "Ancient Grove → The Wildwood",
      target: { abilityId: "warden.ancient_grove" },
      ops: [
        { kind: "zone", forceFollows: true, scaleDuration: 3, scaleRadius: 1.2 },
        { kind: "addEffect", at: "end", effects: [{ kind: "resource", resource: "roots", delta: 50, to: "self" }] },
      ],
    }],
    ui: { badge: "WILD" },
  },
];

export const WARDEN: PilotClass = {
  classId: "warden",
  name: "Warden",
  fantasy: "Guardian of the wild who turns terrain into living defensive and offensive infrastructure.",
  role: "Off-tank / crowd control / zone defense.",
  question: "How much of the arena can I turn into friendly terrain?",
  resources: WARDEN_RESOURCES,
  statuses: WARDEN_STATUSES,
  abilities: WARDEN_ABILITIES,
  progression: WARDEN_PROGRESSION,
  unlocks: WARDEN_UNLOCKS,
};
