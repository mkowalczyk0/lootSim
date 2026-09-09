/**
 * Shaman — the battlefield ritualist. Power is Spirit: a pile that fills when a totem
 * is planted, a ritual completes, or an affliction spreads, and is spent to raise
 * spirits and shift structures. The paths turn that loop into companions, plague,
 * stacked ritual ground, curses, or a feral spirit-form.
 *
 * Question: how can I reshape the battlefield with rituals and spirits?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const SHAMAN_SPIRIT: ResourceSpec = {
  id: "spirit",
  label: "Spirit",
  max: 100,
  start: 20,
  ui: "pips",
  regenPerSec: 1.5,
  generation: [
    { on: "skillUse", amount: 6, requireTags: ["ritual"] },
    { on: "skillUse", amount: 8, requireTags: ["summon"] },
    { on: "ailmentInflicted", amount: 3 },
  ],
  thresholds: [{ at: 90, whileAbove: { skillDamage: 0.1, cooldownRate: 0.1 } }],
};

/** The spirit realm is earned by spreading affliction across the room, not by kills. */
export const SHAMAN_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Spirit World",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "ailmentInflicted", amount: 10 },
    { on: "statusApplied", amount: 5 },
  ],
};

export const SHAMAN_RESOURCES: readonly ResourceSpec[] = [SHAMAN_SPIRIT, SHAMAN_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Withering — the Shaman's signature curse: stacking defense shred that never times out fast. */
export const STATUS_WITHERING: StatusSpec = {
  id: "withering",
  label: "Withering",
  glyph: "W",
  category: "curse",
  tags: ["curse"],
  baseDuration: 10,
  maxStacks: 6,
  refreshRule: "stack",
  amplify: 1.05,
  weaken: 0.96,
};

/** Blight — the plague DoT the Plague Doctor path builds a build around; nature, spreads on death. */
export const STATUS_BLIGHT: StatusSpec = {
  id: "blight",
  label: "Blighted",
  glyph: "g",
  category: "dot",
  tags: ["poison", "nature", "corruption"],
  baseDuration: 7,
  maxStacks: 5,
  refreshRule: "stack",
  dps: 0.12,
  tickInterval: 0.5,
  damageType: "nature",
  damageChannel: "dot",
  spreadOnDeath: true,
};

export const SHAMAN_STATUSES: readonly StatusSpec[] = [STATUS_WITHERING, STATUS_BLIGHT];

// --- abilities --------------------------------------------------------

export const SHAMAN_BONE_TALISMAN: Ability = {
  id: "shaman.bone_talisman",
  classId: "shaman",
  name: "Bone Talisman",
  description: "Hang a talisman on a target. Your spirits fixate on whatever wears one.",
  flavor: "The spirits are not good with names. They are excellent with charms.",
  category: "utility",
  tags: ["mark", "spirit", "ritual"],
  cooldown: 5,
  targeting: "currentTarget",
  range: 220,
  fx: { travel: "bolt" },
  effects: [
    { kind: "status", status: "mark", chance: 1, to: "target" },
    { kind: "status", status: "withering", chance: 1, to: "target" },
  ],
};

export const SHAMAN_BRIAR_CIRCLE: Ability = {
  id: "shaman.briar_circle",
  classId: "shaman",
  name: "Briar Circle",
  description: "Draw a ring of thorns on the ground. It slows and rakes anything standing in it.",
  flavor: "A garden, planted quickly, with intent.",
  category: "terrain",
  tags: ["zone", "ritual", "nature", "area", "crowdControl"],
  cooldown: 10,
  targeting: "point",
  range: 160,
  effects: [
    { kind: "zone", zone: { radius: 90, duration: 8, tickInterval: 0.5, follows: false, mergeable: true, damage: { base: 0.35, scale: "spell", type: "nature", channel: "periodic" }, status: { id: "rooted", chance: 0.15 } } },
  ],
  mutationHooks: [{ id: "briar_circle.zone", kind: "zone", note: "Great Ritual lets every skill interact with this." }],
};

export const SHAMAN_SPIRIT_HAWK: Ability = {
  id: "shaman.spirit_hawk",
  classId: "shaman",
  name: "Spirit Hawk",
  description: "Call a spectral hawk that circles you and dives on talisman-marked enemies.",
  flavor: "It was a bird once. Mostly it still acts like one.",
  category: "summon",
  tags: ["summon", "spirit", "pet"],
  costs: [{ resource: "spirit", amount: 15 }],
  cooldown: 14,
  targeting: "self",
  effects: [
    { kind: "summon", unit: "spirit_hawk", count: 1, duration: 18, command: { behavior: "aggroNearest", inheritPower: 0.6 } },
  ],
  mutationHooks: [{ id: "spirit_hawk.summon", kind: "summon", note: "Spirit Council merges hawks into an elder spirit." }],
};

export const SHAMAN_HEX_OF_WITHERING: Ability = {
  id: "shaman.hex_of_withering",
  classId: "shaman",
  name: "Hex of Withering",
  description: "Speak the withering hex over a target — a stacking curse that rots armor and resolve.",
  flavor: "It is not fast. It is not kind. It is thorough.",
  category: "spell",
  tags: ["curse", "ranged"],
  cooldown: 4,
  targeting: "currentTarget",
  range: 200,
  fx: { travel: "bolt" },
  effects: [
    { kind: "status", status: "withering", chance: 1, stacks: 2, to: "target" },
    { kind: "damage", damage: { base: 0.6, scale: "spell", type: "void", canCrit: true }, to: "target" },
  ],
  mutationHooks: [{ id: "hex_of_withering.status", kind: "status", note: "Hexmaster links heavily-cursed enemies." }],
};

export const SHAMAN_ANCESTRAL_DRUM: Ability = {
  id: "shaman.ancestral_drum",
  classId: "shaman",
  name: "Ancestral Drum",
  description: "A drumbeat only allies hear. Their attacks quicken and briefly echo for a fraction more.",
  flavor: "The dead keep excellent time.",
  category: "support",
  tags: ["support", "ritual", "aura"],
  cooldown: 18,
  targeting: "self",
  effects: [
    { kind: "zone", zone: { radius: 150, duration: 8, tickInterval: 1, follows: true, benefit: "haste" } },
  ],
};

export const SHAMAN_ROOTCALLER: Ability = {
  id: "shaman.rootcaller",
  classId: "shaman",
  name: "Rootcaller",
  description: "Call roots up through the floor in a line, holding enemies and tearing at them.",
  flavor: "Ask the ground for a favour. It rarely says no.",
  category: "spell",
  tags: ["nature", "area", "crowdControl", "line"],
  cooldown: 9,
  targeting: "line",
  range: 180,
  fx: { travel: "bolt" },
  shape: { width: 50, length: 180 },
  effects: [
    { kind: "damage", damage: { base: 1.2, scale: "spell", type: "nature", canCrit: true }, to: "allTargets" },
    { kind: "status", status: "rooted", chance: 1, to: "allTargets" },
  ],
};

export const SHAMAN_SPIRIT_EXCHANGE: Ability = {
  id: "shaman.spirit_exchange",
  classId: "shaman",
  name: "Spirit Exchange",
  description: "Give an ally a share of your own health; the transfer leaves behind small healing spirits.",
  flavor: "A loan, secured against the both of you.",
  category: "support",
  tags: ["heal", "support", "summon", "spirit"],
  cooldown: 16,
  targeting: "lowestHealthAlly",
  range: 200,
  effects: [
    { kind: "heal", amount: 1.4, scale: "spell", to: "lowestHealthAlly" },
    { kind: "summon", unit: "healing_spirit", count: 2, duration: 10, command: { behavior: "follow" } },
  ],
};

export const SHAMAN_TOTEMIC_MIGRATION: Ability = {
  id: "shaman.totemic_migration",
  classId: "shaman",
  name: "Totemic Migration",
  description: "Uproot every zone and structure you have placed and re-plant it around a new point.",
  flavor: "The ritual is portable. This surprises people.",
  category: "utility",
  tags: ["ritual", "zone", "terrain", "movement"],
  cooldown: 12,
  targeting: "point",
  range: 260,
  effects: [
    { kind: "resource", resource: "spirit", delta: 10, to: "self" },
    { kind: "zone", zone: { radius: 60, duration: 4, tickInterval: 1, follows: false, benefit: "shield" } },
  ],
  mutationHooks: [{ id: "totemic_migration.zone", kind: "zone", note: "Battle Rite lets the moved ritual travel with the caster." }],
};

export const SHAMAN_RITUAL_HOLLOW_MOON: Ability = {
  id: "shaman.ritual_hollow_moon",
  classId: "shaman",
  name: "Ritual of the Hollow Moon",
  description: "Complete the moon ritual. From then on, anything that dies while diseased leaves a guardian spirit.",
  flavor: "A poor moon for farming. An excellent one for what the Shaman is doing.",
  category: "spell",
  tags: ["ritual", "summon", "spirit", "corruption"],
  costs: [{ resource: "spirit", amount: 30 }],
  cooldown: 30,
  castTime: 1.2,
  targeting: "self",
  effects: [
    { kind: "status", status: "blight", chance: 1, to: "enemies" },
    { kind: "summon", unit: "moon_guardian", count: 2, duration: 20, command: { behavior: "guardPoint" } },
  ],
  mutationHooks: [{ id: "hollow_moon.summon", kind: "summon", note: "Walking Plague turns diseased kills into infection zones instead." }],
};

export const SHAMAN_SPIRIT_WORLD: Ability = {
  id: "shaman.spirit_world",
  classId: "shaman",
  name: "Spirit World",
  description: "Pull the spirit realm over the battlefield. Every zone and structure you own is doubled and every spirit fights harder for the duration.",
  flavor: "For a while, both worlds agree on where the Shaman is standing.",
  category: "ultimate",
  tags: ["ultimate", "ritual", "spirit", "zone"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  effects: [
    { kind: "fx", fx: "shaman.spirit_world" },
    { kind: "zone", zone: { radius: 260, duration: 12, tickInterval: 0.5, follows: true, damage: { base: 0.5, scale: "spell", type: "void", channel: "ultimate" }, status: { id: "withering", chance: 0.4 } } },
    { kind: "summon", unit: "elder_spirit", count: 2, duration: 12, command: { behavior: "aggroNearest", inheritPower: 1 } },
  ],
  mutationHooks: [{ id: "spirit_world.zone", kind: "zone", note: "Hollow King makes the overlay permanent within the arena." }],
};

export const SHAMAN_ABILITIES: readonly Ability[] = [
  SHAMAN_BONE_TALISMAN,
  SHAMAN_BRIAR_CIRCLE,
  SHAMAN_SPIRIT_HAWK,
  SHAMAN_HEX_OF_WITHERING,
  SHAMAN_ANCESTRAL_DRUM,
  SHAMAN_ROOTCALLER,
  SHAMAN_SPIRIT_EXCHANGE,
  SHAMAN_TOTEMIC_MIGRATION,
  SHAMAN_RITUAL_HOLLOW_MOON,
  SHAMAN_SPIRIT_WORLD,
];

// --- the tree --------------------------------------------------------

export const SHAMAN_PROGRESSION: ClassProgression = {
  classId: "shaman",
  paths: [
    // 0 — Spirit Caller: companions that grow up.
    {
      name: "Spirit Caller",
      blurb: "Every spirit you keep alive becomes a bigger spirit.",
      nodes: [
        { name: "Kinship", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.05 } }, { kind: "grantEffect", on: { tag: "summon" }, effects: [{ kind: "resource", resource: "spirit", delta: 4, to: "self" }] }] },
        { name: "Hunting Flock", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "sc.hunting_flock", label: "spirits share a target", target: { withTag: "spirit" }, ops: [{ kind: "summon", addInheritPower: 0.15 }] } }] },
        { name: "Spirit Tithe", category: "resource", effects: [{ kind: "resourceRule", resource: "spirit", patch: { regenPerSec: 3, max: 120 } }] },
        { name: "Elder Blood", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "sc.elder_blood", label: "Spirit Hawk comes in a pair", target: { abilityId: "shaman.spirit_hawk" }, ops: [{ kind: "summon", addCount: 1, scaleDuration: 1.3 }] } }] },
        { name: "Spirit Council", category: "keystone", effects: [{ kind: "rule", rule: "shaman.sc.spirit_council", note: "Three or more spirits merge into one elder spirit twice their combined strength." }] },
      ],
    },
    // 1 — Plague Doctor: disease that goes everywhere.
    {
      name: "Plague Doctor",
      blurb: "One sick body is a waste. A room of them is a plan.",
      nodes: [
        { name: "First Symptom", category: "foundation", effects: [{ kind: "grantEffect", on: { tag: "curse" }, effects: [{ kind: "status", status: "blight", chance: 0.4, to: "allTargets" }] }] },
        { name: "Contagion", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "pd.contagion", label: "blight leaps further on death", target: { withTag: "corruption" }, ops: [{ kind: "status", scaleDuration: 1.4, addStacks: 1 }] } }] },
        { name: "Fevered Offering", category: "resource", effects: [{ kind: "resourceRule", resource: "spirit", patch: { addGeneration: [{ on: "ailmentInflicted", amount: 3, requireTags: ["poison"] }] } }] },
        { name: "Wracking Cough", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "pd.wracking_cough", label: "Rootcaller sows blight", target: { abilityId: "shaman.rootcaller" }, ops: [{ kind: "damagePacket", setInflict: { status: "blight", chance: 1 } }] } }] },
        { name: "Walking Plague", category: "keystone", effects: [{ kind: "rule", rule: "shaman.pd.walking_plague", note: "A diseased death leaves a lasting infection zone instead of a corpse." }] },
      ],
    },
    // 2 — Ritualist: stack the ground.
    {
      name: "Ritualist",
      blurb: "Do the work before the fight, and the fight is mostly cleanup.",
      nodes: [
        { name: "Patient Hands", category: "foundation", effects: [{ kind: "mods", mods: { areaSize: 0.12, cooldownRate: 0.06 } }] },
        { name: "Layered Ground", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "rt.layered_ground", label: "your zones overlap and merge", target: { withTag: "zone" }, ops: [{ kind: "zone", forceMergeable: true, scaleDuration: 1.25 }] } }] },
        { name: "Ley Line", category: "resource", effects: [{ kind: "resourceRule", resource: "spirit", patch: { addGeneration: [{ on: "skillUse", amount: 5, requireTags: ["ritual"] }] } }] },
        { name: "Consecration", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "rt.consecration", label: "Briar Circle also buffs allies inside it", target: { abilityId: "shaman.briar_circle" }, ops: [{ kind: "zone", scaleRadius: 1.3, scaleDamage: 1.2 }] } }] },
        { name: "Great Ritual", category: "keystone", effects: [{ kind: "rule", rule: "shaman.rt.great_ritual", note: "Once a ritual zone is down, every Shaman skill triggers a burst from it on use." }] },
      ],
    },
    // 3 — Witch Doctor: curses that talk to each other.
    {
      name: "Witch Doctor",
      blurb: "A curse is a thread. Enough threads and they are a net.",
      nodes: [
        { name: "Ill Word", category: "foundation", effects: [{ kind: "mods", mods: { ailmentPotency: 0.15 } }] },
        { name: "Shared Suffering", category: "behavior", effects: [{ kind: "rule", rule: "shaman.wd.shared_suffering", note: "Curse damage on one cursed enemy bleeds a fraction onto every other cursed enemy nearby." }] },
        { name: "Reap the Rot", category: "resource", effects: [{ kind: "resourceRule", resource: "spirit", patch: { addGeneration: [{ on: "enemyDeath", amount: 6 }] } }] },
        { name: "Deep Hex", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "wd.deep_hex", label: "Hex of Withering hits everything near the target", target: { abilityId: "shaman.hex_of_withering" }, ops: [{ kind: "targeting", setMode: "radius", addRange: 60 }, { kind: "addTags", tags: ["area"] }] } }] },
        { name: "Hexmaster", category: "keystone", effects: [{ kind: "rule", rule: "shaman.wd.hexmaster", note: "Enemies at max Withering are linked: any of them taking a hit spreads it to all." }] },
      ],
    },
    // 4 — Wild Shaman: step into the spirit and fight with your hands.
    {
      name: "Wild Shaman",
      blurb: "Sometimes the ritual is you.",
      nodes: [
        { name: "Feral Streak", category: "foundation", effects: [{ kind: "mods", mods: { meleeDamage: 0.1, moveSpeed: 0.06 } }] },
        { name: "Beast Tongue", category: "behavior", effects: [{ kind: "grantEffect", on: { tag: "melee" }, effects: [{ kind: "status", status: "blight", chance: 0.3, to: "allTargets" }] }] },
        { name: "Blood Rite", category: "resource", effects: [{ kind: "resourceRule", resource: "spirit", patch: { addGeneration: [{ on: "hitDealt", amount: 2, requireTags: ["melee"] }] } }] },
        { name: "Claw and Ward", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ws.claw_and_ward", label: "Rootcaller becomes a melee sweep", target: { abilityId: "shaman.rootcaller" }, ops: [{ kind: "targeting", setMode: "cone", scaleLength: 0.6 }, { kind: "addTags", tags: ["melee"] }] } }] },
        { name: "Avatar of the Hunt", category: "keystone", effects: [{ kind: "rule", rule: "shaman.ws.avatar_of_the_hunt", note: "Standing in a Spirit Site enables a temporary spirit-beast combat form." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `shaman.${id}`,
  classId: "shaman",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `shaman.hybrid.${id}` }],
  ...extra,
});

export const SHAMAN_UNLOCKS: PathUnlockDef[] = [
  H("rot_spirits", "Rot Spirits", "A diseased kill releases a hostile spirit that spreads blight as it moves.", "Spirit Caller", "Plague Doctor", {
    effects: [
      { kind: "rule", rule: "shaman.hybrid.rot_spirits" },
      { kind: "grantEffect", on: { event: "enemyDeath" }, effects: [{ kind: "spreadStatus", status: "blight", radius: 120, to: "target" }] },
    ],
    ui: { badge: "ROT" },
  }),
  H("spirit_convergence", "Spirit Convergence", "Spirit sites and zones placed near each other merge into one stronger zone.", "Spirit Caller", "Ritualist", {
    mutations: [{ id: "shaman.spirit_convergence", label: "zones merge and grow", target: { withTag: "zone" }, ops: [{ kind: "zone", forceMergeable: true, scaleRadius: 1.15, scaleDamage: 1.15 }] }],
    ui: { badge: "CONV" },
  }),
  H("master_hex", "Master Hex", "Three separate debuffs on one enemy link every debuffed enemy in the room.", "Plague Doctor", "Witch Doctor", {
    effects: [{ kind: "rule", rule: "shaman.hybrid.master_hex" }],
    ui: { badge: "MHX" },
  }),
  H("battle_rite", "Battle Rite", "A completed ritual empowers your melee attacks and the ritual zone follows you.", "Ritualist", "Wild Shaman", {
    mutations: [
      { id: "shaman.battle_rite.zone", label: "ritual ground follows you", target: { withTag: "ritual" }, ops: [{ kind: "zone", forceFollows: true }] },
      { id: "shaman.battle_rite.melee", label: "melee inherits the ritual's rider", target: { withTag: "melee" }, ops: [{ kind: "damagePacket", scaleBase: 1.15, setInflict: { status: "withering", chance: 0.5 } }] },
    ],
    ui: { badge: "RITE" },
  }),
  H("hexbeast", "Hexbeast", "Cursed enemies count as prey — killing one in spirit-form heals and extends the form.", "Witch Doctor", "Wild Shaman", {
    effects: [
      { kind: "rule", rule: "shaman.hybrid.hexbeast" },
      { kind: "grantEffect", on: { event: "kill" }, effects: [{ kind: "heal", amount: 0.4, scale: "spell", to: "self" }] },
    ],
    ui: { badge: "HXB" },
  }),
  H("spirit_avatar", "Spirit Avatar", "Every active spirit adds power and duration to the Wild Shaman's beast form.", "Spirit Caller", "Wild Shaman", {
    effects: [{ kind: "rule", rule: "shaman.hybrid.spirit_avatar" }],
    ui: { badge: "AVTR" },
  }),
  {
    id: "shaman.hollow_king",
    classId: "shaman",
    tier: "mythic",
    name: "Hollow King",
    description: "Spirit World stops being a cooldown. Within the arena the spirit realm stays open: every zone you own is permanently doubled, and blighted deaths raise spirits that answer only to you.",
    flavor: "The living pay rent. The Shaman is a landlord in both directions.",
    requires: [
      { path: "Spirit Caller", points: 6 },
      { path: "Plague Doctor", points: 4 },
      { path: "Ritualist", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "shaman.mythic.hollow_king" }],
    mutations: [{
      id: "shaman.hollow_king.spirit_world",
      label: "Spirit World → Hollow King",
      target: { abilityId: "shaman.spirit_world" },
      ops: [
        { kind: "zone", scaleDuration: 2, scaleRadius: 1.2 },
        { kind: "summon", addCount: 2, scaleDuration: 2 },
      ],
    }],
    ui: { badge: "HOLLOW" },
  },
];

export const SHAMAN: PilotClass = {
  classId: "shaman",
  name: "Shaman",
  fantasy: "Battlefield ritualist using spirits, curses, plants, persistent zones, and support.",
  role: "Support / DoT / area control.",
  question: "How can I reshape the battlefield with rituals and spirits?",
  resources: SHAMAN_RESOURCES,
  statuses: SHAMAN_STATUSES,
  abilities: SHAMAN_ABILITIES,
  progression: SHAMAN_PROGRESSION,
  unlocks: SHAMAN_UNLOCKS,
};
