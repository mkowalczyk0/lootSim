/**
 * Bard — the battlefield conductor. Rhythm builds as you keep a performance going —
 * distinct songs, one after another — and is spent on a Crescendo that amplifies the
 * next. The ultimate meter fills when allies act on your buffs. Almost nothing here is
 * damage; the Bard's output is everyone else's. The paths are five kinds of ensemble:
 * war drums, healing verse, layered songs, enemy dissonance, and the solo.
 *
 * Question: how much stronger can I make everyone else?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const BARD_RHYTHM: ResourceSpec = {
  id: "rhythm",
  label: "Rhythm",
  max: 100,
  start: "empty",
  ui: "bar",
  decayPerSec: 5,
  decayDelay: 4,
  generation: [
    { on: "skillUse", amount: 14 },
    { on: "block", amount: 4 },
  ],
  thresholds: [{ at: 80, whileAbove: { cooldownRate: 0.15, wardPower: 0.2 } }],
};

/** Grand Performance is earned when the party *uses* what the Bard gave them, not by the Bard fighting. */
export const BARD_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Performance",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "skillUse", amount: 5 },
    // Playing a song, not landing a debuff. This was `on: "statusApplied"`, which asked
    // for the intersection of two disjoint sets and so never fired once in 90 events:
    // `statusApplied` is broadcast only for a *hostile* status placed on an enemy, and
    // every `support`-tagged thing the Bard does buffs an ally. On `skillUse` it does
    // what it always read as — a song charges the Performance faster than a hex does.
    { on: "skillUse", amount: 2, requireTags: ["support"] },
  ],
};

export const BARD_RESOURCES: readonly ResourceSpec[] = [BARD_RHYTHM, BARD_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Inspired — the Bard's core ally buff. Stacks with the number of distinct songs running. */
export const STATUS_INSPIRED: StatusSpec = {
  id: "inspired",
  label: "Inspired",
  glyph: "I",
  category: "buff",
  tags: ["support"],
  baseDuration: 6,
  maxStacks: 5,
  refreshRule: "stack",
  mods: { meleeDamage: 0.05, projectileDamage: 0.05, attackSpeed: 0.04 },
};

/** Discord — the Bard's enemy debuff: a wrong note that slows a cast and softens a swing. */
export const STATUS_DISCORD: StatusSpec = {
  id: "discord",
  label: "Discordant",
  glyph: "z",
  category: "debuff",
  tags: ["crowdControl"],
  baseDuration: 5,
  maxStacks: 3,
  refreshRule: "stack",
  slow: 0.9,
  weaken: 0.9,
};

export const BARD_STATUSES: readonly StatusSpec[] = [STATUS_INSPIRED, STATUS_DISCORD];

// --- abilities --------------------------------------------------------

export const BARD_WAR_MARCH: Ability = {
  id: "bard.war_march",
  classId: "bard",
  name: "War March",
  description: "Set a marching beat. Allies in earshot move and attack faster while it plays.",
  flavor: "Left, right, left. Everyone is very motivated now.",
  category: "support",
  tags: ["support", "aura"],
  cooldown: 12,
  targeting: "self",
  effects: [
    { kind: "zone", zone: { radius: 200, duration: 10, tickInterval: 1, follows: true, benefit: "haste" } },
    { kind: "status", status: "inspired", chance: 1, to: "allies" },
  ],
  mutationHooks: [{ id: "war_march.zone", kind: "zone", note: "War Drummer path widens and hardens the march." }],
};

export const BARD_BATTLE_HYMN: Ability = {
  id: "bard.battle_hymn",
  classId: "bard",
  name: "Battle Hymn",
  description: "A driving hymn that lifts every nearby ally's damage for its duration.",
  flavor: "The words don't matter. Nobody knows the words. The effect is real.",
  category: "support",
  tags: ["support", "aura"],
  cooldown: 14,
  targeting: "self",
  effects: [
    { kind: "status", status: "inspired", chance: 1, stacks: 2, to: "allies" },
  ],
};

export const BARD_RESTORATIVE_VERSE: Ability = {
  id: "bard.restorative_verse",
  classId: "bard",
  name: "Restorative Verse",
  description: "A soft verse laid over the fight — for its duration, attacks by buffed allies also heal them.",
  flavor: "Leech, but musical.",
  category: "support",
  tags: ["support", "heal", "aura"],
  cooldown: 18,
  targeting: "self",
  effects: [
    { kind: "heal", amount: 0.2, scale: "spell", to: "allies", overTime: { duration: 6 } },
  ],
  mutationHooks: [{ id: "restorative_verse.heal", kind: "zone", note: "Minstrel path makes the verse a moving heal zone." }],
};

export const BARD_DISSONANCE: Ability = {
  id: "bard.dissonance",
  classId: "bard",
  name: "Dissonance",
  description: "Play deliberately, precisely wrong. Enemies in the field attack and cast slower.",
  flavor: "It is physically uncomfortable to be near. That is the composition.",
  category: "spell",
  tags: ["crowdControl", "aura", "arcane"],
  cooldown: 12,
  targeting: "radius",
  range: 200,
  shape: { radius: 160 },
  effects: [
    { kind: "damage", damage: { base: 0.4, scale: "spell", type: "arcane", canCrit: false }, to: "allTargets" },
    { kind: "status", status: "discord", chance: 1, stacks: 2, to: "allTargets" },
  ],
};

export const BARD_RALLYING_CHORUS: Ability = {
  id: "bard.rallying_chorus",
  classId: "bard",
  name: "Rallying Chorus",
  description: "A sudden swell that dumps a burst of resource — mana, charge, cooldown — into every ally at once.",
  flavor: "Everybody in. Loudly.",
  category: "support",
  tags: ["support"],
  cooldown: 30,
  targeting: "self",
  effects: [
    { kind: "resource", resource: "rhythm", delta: 20, to: "self" },
    { kind: "status", status: "inspired", chance: 1, stacks: 3, to: "allies" },
    { kind: "cleanse", category: "debuff", to: "allies" },
  ],
};

export const BARD_CRESCENDO: Ability = {
  id: "bard.crescendo",
  classId: "bard",
  name: "Crescendo",
  description: "Hold and build. Spend the wind-up banking Rhythm; the next song you play lands at double strength.",
  flavor: "The loud part is coming. Everyone can feel it.",
  category: "support",
  tags: ["support", "resourceGenerator"],
  cooldown: 16,
  channel: { duration: 1.5, ticks: 3 },
  targeting: "self",
  effects: [
    { kind: "resource", resource: "rhythm", delta: 40, to: "self" },
  ],
  mutationHooks: [{ id: "crescendo.rule", kind: "resource", note: "Maestro path lets the Crescendo double two songs, not one." }],
};

export const BARD_ENCORE: Ability = {
  id: "bard.encore",
  classId: "bard",
  name: "Encore",
  description: "Play the last thing again, immediately, for no cooldown.",
  flavor: "They asked for it. Technically.",
  category: "utility",
  tags: ["support"],
  cooldown: 10,
  targeting: "self",
  effects: [
    { kind: "resource", resource: "rhythm", delta: 10, to: "self" },
  ],
  mutationHooks: [{ id: "encore.rule", kind: "followUp", note: "Virtuoso path makes Encore a full second cast of any song." }],
};

export const BARD_DIRGE_OF_SILENCE: Ability = {
  id: "bard.dirge_of_silence",
  classId: "bard",
  name: "Dirge of Silence",
  description: "A low, flat dirge that fills an area. Nothing hostile inside it can finish a cast.",
  flavor: "Some songs are about the absence of other songs.",
  category: "spell",
  tags: ["interrupt", "zone", "crowdControl", "arcane"],
  cooldown: 22,
  targeting: "point",
  range: 200,
  effects: [
    { kind: "zone", zone: { radius: 130, duration: 6, tickInterval: 0.5, follows: false, status: { id: "silenced", chance: 1 } } },
    { kind: "interrupt", radius: 130 },
  ],
};

export const BARD_STANDING_OVATION: Ability = {
  id: "bard.standing_ovation",
  classId: "bard",
  name: "Standing Ovation",
  description: "Watch for a great play — a dodge, a crit, a save — and reward the ally who made it with a burst buff.",
  flavor: "The Bard has been keeping score this whole time.",
  category: "support",
  tags: ["support"],
  cooldown: 20,
  targeting: "self",
  effects: [
    { kind: "reactive", event: "criticalHit", window: 8, effects: [{ kind: "status", status: "inspired", chance: 1, stacks: 2, to: "allies" }] },
    { kind: "reactive", event: "dodge", window: 8, effects: [{ kind: "status", status: "inspired", chance: 1, to: "allies" }] },
  ],
};

export const BARD_GRAND_PERFORMANCE: Ability = {
  id: "bard.grand_performance",
  classId: "bard",
  name: "Grand Performance",
  description: "A multi-phase set: a movement movement, a damage movement, a heal movement, ending on a burst window where every ally buff is doubled for a few seconds.",
  flavor: "Three acts. The audience is fighting for their lives. It goes over very well.",
  category: "ultimate",
  tags: ["ultimate", "support", "aura"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  effects: [
    { kind: "fx", fx: "bard.grand_performance" },
    { kind: "zone", zone: { radius: 240, duration: 12, tickInterval: 1, follows: true, benefit: "haste" } },
    { kind: "status", status: "inspired", chance: 1, stacks: 5, to: "allies" },
    { kind: "delay", seconds: 6, effects: [
      { kind: "heal", amount: 0.6, scale: "spell", to: "allies" },
      { kind: "status", status: "inspired", chance: 1, stacks: 5, to: "allies" },
    ] },
  ],
  mutationHooks: [{ id: "grand_performance.followup", kind: "followUp", note: "The Symphony adds a fourth movement that lets the party act twice." }],
};

export const BARD_ABILITIES: readonly Ability[] = [
  BARD_WAR_MARCH,
  BARD_BATTLE_HYMN,
  BARD_RESTORATIVE_VERSE,
  BARD_DISSONANCE,
  BARD_RALLYING_CHORUS,
  BARD_CRESCENDO,
  BARD_ENCORE,
  BARD_DIRGE_OF_SILENCE,
  BARD_STANDING_OVATION,
  BARD_GRAND_PERFORMANCE,
];

// --- the tree --------------------------------------------------------

export const BARD_PROGRESSION: ClassProgression = {
  classId: "bard",
  paths: [
    // 0 — War Drummer: offensive buffs.
    {
      name: "War Drummer",
      blurb: "The beat is a damage stat for everyone who can hear it.",
      nodes: [
        { name: "Hard Beat", category: "foundation", effects: [{ kind: "mods", mods: { areaSize: 0.15 } }] },
        { name: "Cadence", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "wd.cadence", label: "Inspired stacks higher from you", target: { withTag: "support" }, ops: [{ kind: "status", addStacks: 1 }] } }] },
        { name: "Marching Orders", category: "resource", effects: [{ kind: "resourceRule", resource: "rhythm", patch: { addGeneration: [{ on: "skillUse", amount: 6, requireTags: ["support"] }] } }] },
        { name: "Double Time", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "wd.double_time", label: "War March also grants a burst of attack speed on cast", target: { abilityId: "bard.war_march" }, ops: [{ kind: "zone", scaleRadius: 1.3, scaleDuration: 1.3 }] } }] },
        { name: "Battle Tempo", category: "keystone", effects: [{ kind: "rule", rule: "bard.wd.battle_tempo", note: "Every buffed ally's attacks feed your Rhythm; at max Rhythm the whole party's damage is amplified." }] },
      ],
    },
    // 1 — Minstrel: healing support.
    {
      name: "Minstrel",
      blurb: "The song mends faster than the fight breaks.",
      nodes: [
        { name: "Gentle Refrain", category: "foundation", effects: [{ kind: "mods", mods: { wardPower: 0.15 } }] },
        { name: "Sustained Note", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "mn.sustained_note", label: "your heal-over-time effects last longer", target: { withTag: "heal" }, ops: [{ kind: "zone", scaleDuration: 1.4 }] } }] },
        { name: "Open Hymnal", category: "resource", effects: [{ kind: "resourceRule", resource: "rhythm", patch: { addGeneration: [{ on: "block", amount: 3 }] } }] },
        { name: "Traveling Verse", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "mn.traveling_verse", label: "Restorative Verse becomes a moving heal zone", target: { abilityId: "bard.restorative_verse" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "zone", zone: { radius: 160, duration: 6, tickInterval: 1, follows: true, benefit: "heal" } }] }] } }] },
        { name: "Healing Chorus", category: "keystone", effects: [{ kind: "rule", rule: "bard.mn.healing_chorus", note: "Inspired allies are healed for a fraction of all damage they deal." }] },
      ],
    },
    // 2 — Maestro: layered songs.
    {
      name: "Maestro",
      blurb: "One song is a buff. Four songs at once is a build.",
      nodes: [
        { name: "Arrangement", category: "foundation", effects: [{ kind: "mods", mods: { cooldownRate: 0.08 } }] },
        { name: "Counterpoint", category: "behavior", effects: [{ kind: "rule", rule: "bard.ma.counterpoint", note: "Each distinct song running adds a stack of its own effect to the others." }] },
        { name: "Full Score", category: "resource", effects: [{ kind: "resourceRule", resource: "rhythm", patch: { max: 130, decayPerSec: 3 } }] },
        { name: "Extended Crescendo", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ma.extended_crescendo", label: "Crescendo doubles your next two songs", target: { abilityId: "bard.crescendo" }, ops: [{ kind: "cooldown", scale: 0.8 }] } }] },
        { name: "Grand Crescendo", category: "keystone", effects: [{ kind: "rule", rule: "bard.ma.grand_crescendo", note: "At max Rhythm every song is permanently at Crescendo strength." }] },
      ],
    },
    // 3 — Dissonant: enemy disruption.
    {
      name: "Dissonant",
      blurb: "You can conduct the enemy too. Badly, on purpose.",
      nodes: [
        { name: "Wrong Note", category: "foundation", effects: [{ kind: "mods", mods: { ailmentChance: 0.1 } }, { kind: "grantEffect", on: { tag: "arcane" }, effects: [{ kind: "status", status: "discord", chance: 0.5, to: "allTargets" }] }] },
        { name: "Feedback", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "ds.feedback", label: "Discord stacks deeper and slows harder", target: { withTag: "crowdControl" }, ops: [{ kind: "status", addStacks: 1, scaleDuration: 1.3 }] } }] },
        { name: "Amplifier", category: "resource", effects: [{ kind: "resourceRule", resource: "rhythm", patch: { addGeneration: [{ on: "ailmentInflicted", amount: 3 }] } }] },
        { name: "Screech", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ds.screech", label: "Dissonance also interrupts on cast", target: { abilityId: "bard.dissonance" }, ops: [{ kind: "addEffect", at: "start", effects: [{ kind: "interrupt", radius: 160 }] }] } }] },
        { name: "Silence the World", category: "keystone", effects: [{ kind: "rule", rule: "bard.ds.silence_the_world", note: "Enemies at max Discord are permanently silenced and take amplified damage from your party." }] },
      ],
    },
    // 4 — Virtuoso: the solo.
    {
      name: "Virtuoso",
      blurb: "Sometimes the ensemble is one person, showing off.",
      nodes: [
        { name: "Perfect Pitch", category: "foundation", effects: [{ kind: "mods", mods: { critChance: 0.05, skillDamage: 0.06 } }] },
        { name: "Improvise", category: "behavior", effects: [{ kind: "rule", rule: "bard.vt.improvise", note: "Casting a song you have not used recently grants you a personal burst buff." }] },
        { name: "Showpiece", category: "resource", effects: [{ kind: "resourceRule", resource: "ultimate", patch: { addGeneration: [{ on: "skillUse", amount: 4 }] } }] },
        { name: "Second Cast", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "vt.second_cast", label: "Encore replays the full song, not a shadow of it", target: { abilityId: "bard.encore" }, ops: [{ kind: "cooldown", scale: 0.7 }] } }] },
        { name: "Bravura", category: "keystone", effects: [{ kind: "rule", rule: "bard.vt.bravura", note: "Your own attacks scale with your total Inspired stacks handed out this fight." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `bard.${id}`,
  classId: "bard",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `bard.hybrid.${id}` }],
  ...extra,
});

export const BARD_UNLOCKS: PathUnlockDef[] = [
  H("battle_crescendo", "Battle Crescendo", "A Crescendo'd War March or Battle Hymn grants its buff at maximum stacks instantly.", "War Drummer", "Maestro", {
    mutations: [{ id: "bard.battle_crescendo", label: "offensive songs peak on cast", target: { withTag: "aura" }, ops: [{ kind: "status", addStacks: 2 }] }],
    ui: { badge: "BCR" },
  }),
  H("healing_symphony", "Healing Symphony", "Every song running also ticks a small heal to the party.", "Minstrel", "Maestro", {
    effects: [{ kind: "rule", rule: "bard.hybrid.healing_symphony" }],
    ui: { badge: "HSY" },
  }),
  H("war_noise", "War Noise", "Dissonance also grants your allies inside it a damage buff — the same wrong note helps and hurts.", "Dissonant", "War Drummer", {
    mutations: [{ id: "bard.war_noise", label: "Dissonance buffs allies too", target: { abilityId: "bard.dissonance" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "inspired", chance: 1, stacks: 2, to: "allies" }] }] }],
    ui: { badge: "WNS" },
  }),
  H("soloist", "Soloist", "While no ally is in range, all of your buff power is redirected to yourself at double value.", "Minstrel", "Virtuoso", {
    effects: [{ kind: "rule", rule: "bard.hybrid.soloist" }],
    ui: { badge: "SOL" },
  }),
  H("reprise", "Reprise", "Encore can replay the Grand Performance's last completed movement.", "Maestro", "Virtuoso", {
    effects: [{ kind: "rule", rule: "bard.hybrid.reprise" }],
    ui: { badge: "RPS" },
  }),
  H("dirge", "Dirge", "Dirge of Silence also heals allies standing in it, as much as it suppresses enemies.", "Dissonant", "Minstrel", {
    mutations: [{ id: "bard.dirge", label: "the dirge mends", target: { abilityId: "bard.dirge_of_silence" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "zone", zone: { radius: 130, duration: 6, tickInterval: 1, follows: false, benefit: "heal" } }] }] }],
    ui: { badge: "DRG" },
  }),
  {
    id: "bard.the_symphony",
    classId: "bard",
    tier: "mythic",
    name: "The Symphony",
    description: "Grand Performance gains a fourth movement. On the burst window, every ally's cooldowns reset and their next skill costs nothing — for a few seconds the whole party plays twice.",
    flavor: "The Bard did not save the raid. The Bard let the raid save itself, at twice the volume.",
    requires: [
      { path: "War Drummer", points: 6 },
      { path: "Maestro", points: 4 },
      { path: "Minstrel", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "bard.mythic.the_symphony" }],
    mutations: [{
      id: "bard.the_symphony.grand_performance",
      label: "Grand Performance → The Symphony",
      target: { abilityId: "bard.grand_performance" },
      ops: [
        { kind: "followUp", window: 6, effects: [{ kind: "status", status: "inspired", chance: 1, stacks: 5, to: "allies" }] },
        { kind: "addEffect", at: "end", effects: [{ kind: "cleanse", category: "cc", to: "allies" }] },
      ],
    }],
    ui: { badge: "SYMPH" },
  },
];

export const BARD: PilotClass = {
  classId: "bard",
  name: "Bard",
  fantasy: "Battlefield conductor whose primary power is making the rest of the party better.",
  role: "Pure support / raid buffs / enemy disruption.",
  question: "How much stronger can I make everyone else?",
  resources: BARD_RESOURCES,
  statuses: BARD_STATUSES,
  abilities: BARD_ABILITIES,
  progression: BARD_PROGRESSION,
  unlocks: BARD_UNLOCKS,
};
