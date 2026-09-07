/**
 * Duelist — the precision counter-fighter. Precision is banked by reading an attack
 * and answering it: a dodge, a parry, a clean hit on an over-committed enemy. The
 * ultimate meter fills only when you turn an incoming attack into a mistake. The paths
 * are five ways to win a fight one exchange at a time.
 *
 * Question: can I make the enemy's attack into a mistake?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const DUELIST_PRECISION: ResourceSpec = {
  id: "precision",
  label: "Precision",
  max: 100,
  start: "empty",
  ui: "bar",
  decayPerSec: 8,
  decayDelay: 3,
  generation: [
    { on: "dodge", amount: 18 },
    { on: "block", amount: 14 },
    { on: "crit", amount: 6 },
  ],
  thresholds: [{ at: 75, whileAbove: { critChance: 0.15, critDamage: 0.4 } }],
};

/** Perfect Riposte is earned by countering — an attack read and punished, never a kill. */
export const DUELIST_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Riposte",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "dodge", amount: 8 },
    { on: "block", amount: 10 },
  ],
};

export const DUELIST_RESOURCES: readonly ResourceSpec[] = [DUELIST_PRECISION, DUELIST_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Opening — a weak point the Duelist has found; briefly, everything lands clean. */
export const STATUS_OPENING: StatusSpec = {
  id: "opening",
  label: "Open",
  glyph: "O",
  category: "debuff",
  tags: ["vulnerable"],
  baseDuration: 3,
  maxStacks: 1,
  refreshRule: "refresh",
  amplify: 1.35,
};

export const DUELIST_STATUSES: readonly StatusSpec[] = [STATUS_OPENING];

// --- abilities --------------------------------------------------------

export const DUELIST_FEINT: Ability = {
  id: "duelist.feint",
  classId: "duelist",
  name: "Feint",
  description: "Throw a false attack. The enemy commits to a block or a dodge, and for a beat you can't be targeted.",
  flavor: "The attack that matters is the one you don't telegraph.",
  category: "utility",
  tags: ["melee", "stealth"],
  cooldown: 7,
  targeting: "currentTarget",
  range: 80,
  effects: [
    { kind: "status", status: "stealth", chance: 1, to: "self", durationMult: 0.3 },
    { kind: "status", status: "opening", chance: 0.5, to: "target" },
  ],
  mutationHooks: [{ id: "feint.window", kind: "trigger", note: "Fencer path punishes the committed attack." }],
};

export const DUELIST_RIPOSTE: Ability = {
  id: "duelist.riposte",
  classId: "duelist",
  name: "Riposte",
  description: "A counter stance. Take a hit in the window and you answer it instantly for heavy damage and an Opening.",
  flavor: "Yes. Do that again.",
  category: "support",
  tags: ["counter", "melee"],
  cooldown: 9,
  targeting: "self",
  effects: [
    { kind: "reactive", event: "damageTaken", window: 1.4, effects: [
      { kind: "damage", damage: { base: 2.2, scale: "attack", type: "physical", canCrit: true, channel: "retaliation" }, to: "enemies" },
      { kind: "status", status: "opening", chance: 1, to: "enemies" },
    ] },
    { kind: "resource", resource: "precision", delta: 15, to: "self" },
  ],
  mutationHooks: [{ id: "riposte.window", kind: "trigger", note: "Perfect Counter widens the window and refunds the cooldown." }],
};

export const DUELIST_FOOTWORK: Ability = {
  id: "duelist.footwork",
  classId: "duelist",
  name: "Footwork",
  description: "A short sidestep. The next attack against an enemy you slipped past hits an Opening.",
  flavor: "Half a step. It is always exactly half a step.",
  category: "movement",
  tags: ["dash", "movement"],
  cooldown: 5,
  targeting: "direction",
  range: 120,
  effects: [
    { kind: "move", style: "dash", distance: 120, iframes: 0.35 },
    { kind: "status", status: "opening", chance: 1, to: "enemies" },
  ],
};

export const DUELIST_DISARM: Ability = {
  id: "duelist.disarm",
  classId: "duelist",
  name: "Disarm",
  description: "A precise strike to the hand. The target's special ability is locked out for a few seconds.",
  flavor: "It is difficult to cast a spell you cannot find your hands for.",
  category: "attack",
  tags: ["melee", "interrupt", "crowdControl"],
  cooldown: 12,
  targeting: "currentTarget",
  range: 80,
  effects: [
    { kind: "damage", damage: { base: 1.0, scale: "attack", type: "physical", canCrit: true }, to: "target" },
    { kind: "status", status: "silenced", chance: 1, to: "target" },
    { kind: "interrupt", radius: 30 },
  ],
};

export const DUELIST_OPENING_CUT: Ability = {
  id: "duelist.opening_cut",
  classId: "duelist",
  name: "Opening Cut",
  description: "A measured thrust to a joint or a seam. Against an Opening it deals catastrophic damage.",
  flavor: "The whole fight was about finding this. The cut is the easy part.",
  category: "attack",
  tags: ["melee", "thrust", "execute", "resourceSpender"],
  costs: [{ resource: "precision", amount: 30 }],
  cooldown: 6,
  targeting: "currentTarget",
  range: 90,
  effects: [
    { kind: "damage", damage: { base: 2.0, scale: "attack", type: "physical", canCrit: true, executeMissingHealth: 0.2 }, to: "target" },
    { kind: "consumeStatus", status: "opening", to: "target", then: [
      { kind: "damage", damage: { base: 2.4, scale: "attack", type: "physical", canCrit: true, channel: "execute" }, to: "target" },
    ] },
  ],
  mutationHooks: [{ id: "opening_cut.packet", kind: "damagePacket", note: "Bleedmaster leaves stacking wounds." }],
};

export const DUELIST_LUNGING_JAB: Ability = {
  id: "duelist.lunging_jab",
  classId: "duelist",
  name: "Lunging Jab",
  description: "A long committed thrust at the very edge of your reach — high damage, and it closes the gap.",
  flavor: "Reach is a stat. It is your favourite stat.",
  category: "attack",
  tags: ["melee", "thrust", "line"],
  cooldown: 5,
  targeting: "line",
  range: 180,
  shape: { width: 18, length: 180 },
  effects: [
    { kind: "move", style: "dash", distance: 100, iframes: 0.15 },
    { kind: "damage", damage: { base: 1.8, scale: "attack", type: "physical", canCrit: true }, to: "allTargets" },
  ],
};

export const DUELIST_BLOODLESS_VICTORY: Ability = {
  id: "duelist.bloodless_victory",
  classId: "duelist",
  name: "Bloodless Victory",
  description: "Settle your stance. For a while, every hit against a wounded enemy banks Precision and crits harder.",
  flavor: "The elegant win is the one where your shirt is still clean.",
  category: "support",
  tags: ["support"],
  cooldown: 20,
  targeting: "self",
  effects: [
    { kind: "resource", resource: "precision", delta: 25, to: "self" },
  ],
  mutationHooks: [{ id: "bloodless_victory.rule", kind: "trigger", note: "Blood Duel path fixates this on a single target." }],
};

export const DUELIST_COUNTERMARK: Ability = {
  id: "duelist.countermark",
  classId: "duelist",
  name: "Countermark",
  description: "Read a target and mark its next attack. Countering a marked attack refreshes every Duelist cooldown.",
  flavor: "You already know what they're going to do. This just writes it down.",
  category: "utility",
  tags: ["mark", "counter"],
  cooldown: 14,
  targeting: "currentTarget",
  range: 200,
  effects: [
    { kind: "status", status: "mark", chance: 1, to: "target" },
    { kind: "reactive", event: "damageTaken", window: 4, effects: [
      { kind: "damage", damage: { base: 1.6, scale: "attack", type: "physical", channel: "retaliation" }, to: "marked" },
      { kind: "resource", resource: "ultimate", delta: 10, to: "self" },
    ] },
  ],
};

export const DUELIST_FINAL_LESSON: Ability = {
  id: "duelist.final_lesson",
  classId: "duelist",
  name: "Final Lesson",
  description: "Call one enemy out. Neither of you can be interfered with — but you deal and take far more from each other.",
  flavor: "Everyone else, please wait outside.",
  category: "utility",
  tags: ["mark", "melee"],
  cooldown: 30,
  targeting: "currentTarget",
  range: 160,
  effects: [
    { kind: "status", status: "opening", chance: 1, to: "target", durationMult: 3 },
    { kind: "status", status: "vulnerable", chance: 1, to: "target" },
    { kind: "threat", op: "taunt", radius: 40, to: "target" },
  ],
};

export const DUELIST_PERFECT_RIPOSTE: Ability = {
  id: "duelist.perfect_riposte",
  classId: "duelist",
  name: "Perfect Riposte",
  description: "Time slows to a crawl. For its duration you counter every incoming attack automatically, each one landing an Opening and a heavy strike.",
  flavor: "They all attacked at once. That was their mistake.",
  category: "ultimate",
  tags: ["ultimate", "counter", "melee"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  effects: [
    { kind: "fx", fx: "duelist.time_slow" },
    { kind: "reactive", event: "damageTaken", window: 5, effects: [
      { kind: "damage", damage: { base: 2.0, scale: "attack", type: "physical", canCrit: true, channel: "ultimate" }, to: "enemies" },
      { kind: "status", status: "opening", chance: 1, to: "enemies" },
    ] },
  ],
  mutationHooks: [{ id: "perfect_riposte.window", kind: "trigger", note: "The Last Word turns each counter into a full execute." }],
};

export const DUELIST_ABILITIES: readonly Ability[] = [
  DUELIST_FEINT,
  DUELIST_RIPOSTE,
  DUELIST_FOOTWORK,
  DUELIST_DISARM,
  DUELIST_OPENING_CUT,
  DUELIST_LUNGING_JAB,
  DUELIST_BLOODLESS_VICTORY,
  DUELIST_COUNTERMARK,
  DUELIST_FINAL_LESSON,
  DUELIST_PERFECT_RIPOSTE,
];

// --- the tree --------------------------------------------------------

export const DUELIST_PROGRESSION: ClassProgression = {
  classId: "duelist",
  paths: [
    // 0 — Riposte: the counter is the whole build.
    {
      name: "Riposte",
      blurb: "Their swing is your turn.",
      nodes: [
        { name: "Read the Blade", category: "foundation", effects: [{ kind: "mods", mods: { defensePercent: 0.06, critChance: 0.05 } }] },
        { name: "Wider Window", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "rp.wider_window", label: "counter windows last longer", target: { withTag: "counter" }, ops: [{ kind: "cooldown", scale: 0.85 }] } }] },
        { name: "Tempo Steal", category: "resource", effects: [{ kind: "resourceRule", resource: "ultimate", patch: { addGeneration: [{ on: "block", amount: 6 }] } }] },
        { name: "Answer in Kind", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "rp.answer_in_kind", label: "Riposte hits everything in front, not just the attacker", target: { abilityId: "duelist.riposte" }, ops: [{ kind: "damagePacket", scaleBase: 1.2 }] } }] },
        { name: "Perfect Counter", category: "keystone", effects: [{ kind: "rule", rule: "duelist.rp.perfect_counter", note: "A counter fired in the first half-second of the window costs nothing and refunds Riposte." }] },
      ],
    },
    // 1 — Fencer: distance and footwork.
    {
      name: "Fencer",
      blurb: "The right distance is a weapon nobody can parry.",
      nodes: [
        { name: "Measure", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.08 } }, { kind: "mutate", mutation: { id: "fn.measure", label: "thrusts reach further", target: { withTag: "thrust" }, ops: [{ kind: "targeting", addRange: 30 }] } }] },
        { name: "Disengage", category: "behavior", effects: [{ kind: "grantEffect", on: { tag: "dash" }, effects: [{ kind: "status", status: "opening", chance: 0.5, to: "enemies" }] }] },
        { name: "Light on the Feet", category: "resource", effects: [{ kind: "resourceRule", resource: "precision", patch: { addGeneration: [{ on: "dashStart", amount: 8 }] } }] },
        { name: "Extended Lunge", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "fn.extended_lunge", label: "Lunging Jab is a full-room thrust", target: { abilityId: "duelist.lunging_jab" }, ops: [{ kind: "targeting", scaleLength: 1.5 }, { kind: "damagePacket", scaleBase: 1.15 }] } }] },
        { name: "Elegant Violence", category: "keystone", effects: [{ kind: "rule", rule: "duelist.fn.elegant_violence", note: "Attacking from outside an enemy's reach always crits and never generates threat." }] },
      ],
    },
    // 2 — Blood Duel: pick one and finish it.
    {
      name: "Blood Duel",
      blurb: "Everything you have, aimed at one throat.",
      nodes: [
        { name: "Focus", category: "foundation", effects: [{ kind: "mods", mods: { meleeDamage: 0.08 } }] },
        { name: "Grudge", category: "behavior", effects: [{ kind: "rule", rule: "duelist.bd.grudge", note: "Damage to your current target ramps the longer you stay on it." }] },
        { name: "Blood Price", category: "resource", effects: [{ kind: "resourceRule", resource: "precision", patch: { addGeneration: [{ on: "hitDealt", amount: 2, requireTags: ["thrust"] }] } }] },
        { name: "Isolation", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "bd.isolation", label: "Final Lesson is on a much shorter leash", target: { abilityId: "duelist.final_lesson" }, ops: [{ kind: "cooldown", scale: 0.6 }] } }] },
        { name: "One Opponent", category: "keystone", effects: [{ kind: "rule", rule: "duelist.bd.one_opponent", note: "While a Final Lesson target lives you take almost nothing from anyone else." }] },
      ],
    },
    // 3 — Bleedmaster: precise wounds that add up.
    {
      name: "Bleedmaster",
      blurb: "A hundred small cuts is still a hundred cuts.",
      nodes: [
        { name: "Fine Edge", category: "foundation", effects: [{ kind: "mods", mods: { ailmentChance: 0.12 } }, { kind: "grantEffect", on: { tag: "thrust" }, effects: [{ kind: "status", status: "bleed", chance: 0.4, to: "allTargets" }] }] },
        { name: "Precise Incision", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "bm.precise_incision", label: "your bleeds crit", target: { withTag: "bleed" }, ops: [{ kind: "status", scalePotency: 1.4 }] } }] },
        { name: "Exsanguinate", category: "resource", effects: [{ kind: "resourceRule", resource: "precision", patch: { addGeneration: [{ on: "ailmentInflicted", amount: 3, requireTags: ["bleed"] }] } }] },
        { name: "Reopen", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "bm.reopen", label: "Opening Cut refreshes and deepens every bleed on the target", target: { abilityId: "duelist.opening_cut" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "bleed", chance: 1, stacks: 3, to: "target" }] }] } }] },
        { name: "Thousand Cuts", category: "keystone", effects: [{ kind: "rule", rule: "duelist.bm.thousand_cuts", note: "Bleeds on an enemy at 5+ stacks tick for the whole stack at once." }] },
      ],
    },
    // 4 — Tempo: combo timing.
    {
      name: "Tempo",
      blurb: "On the beat, everything works. Off it, nothing does.",
      nodes: [
        { name: "Metronome", category: "foundation", effects: [{ kind: "mods", mods: { attackSpeed: 0.06, cooldownRate: 0.06 } }] },
        { name: "On the Beat", category: "behavior", effects: [{ kind: "rule", rule: "duelist.tp.on_the_beat", note: "Alternating between two different skills empowers both." }] },
        { name: "Keep Time", category: "resource", effects: [{ kind: "resourceRule", resource: "precision", patch: { addGeneration: [{ on: "skillUse", amount: 5 }], decayPerSec: 4 } }] },
        { name: "Syncopation", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "tp.syncopation", label: "Footwork resets on a well-timed follow-up", target: { abilityId: "duelist.footwork" }, ops: [{ kind: "cooldown", scale: 0.7 }] } }] },
        { name: "Perfect Rhythm", category: "keystone", effects: [{ kind: "rule", rule: "duelist.tp.perfect_rhythm", note: "Never repeat a skill and Precision cannot decay; every third distinct skill is free." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `duelist.${id}`,
  classId: "duelist",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `duelist.hybrid.${id}` }],
  ...extra,
});

export const DUELIST_UNLOCKS: PathUnlockDef[] = [
  H("perfect_distance", "Perfect Distance", "A counter fired from outside the attacker's reach costs no cooldown.", "Riposte", "Fencer", {
    effects: [{ kind: "rule", rule: "duelist.hybrid.perfect_distance" }],
    ui: { badge: "PDS" },
  }),
  H("duelists_law", "Duelist's Law", "Countering your Final Lesson target permanently exposes its weak point for the fight.", "Riposte", "Blood Duel", {
    mutations: [{ id: "duelist.duelists_law", label: "counters brand the duel target", target: { withTag: "counter" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "opening", chance: 1, to: "marked", durationMult: 4 }] }] }],
    ui: { badge: "LAW" },
  }),
  H("flowing_steel", "Flowing Steel", "Dashing resets the cooldown of the last non-movement skill you used.", "Fencer", "Tempo", {
    effects: [{ kind: "rule", rule: "duelist.hybrid.flowing_steel" }],
    ui: { badge: "FLW" },
  }),
  H("red_contract", "Red Contract", "Your duel target's bleeds cannot expire while it stays your current target.", "Blood Duel", "Bleedmaster", {
    effects: [{ kind: "rule", rule: "duelist.hybrid.red_contract" }],
    ui: { badge: "RED" },
  }),
  H("thousand_cuts", "Thousand Cuts", "Every counter also applies two bleed stacks to the attacker.", "Tempo", "Bleedmaster", {
    mutations: [{ id: "duelist.thousand_cuts_hybrid", label: "counters bleed", target: { withTag: "counter" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "bleed", chance: 1, stacks: 2, to: "enemies" }] }] }],
    ui: { badge: "1KC" },
  }),
  H("counter_rhythm", "Counter Rhythm", "Landing a counter counts as a distinct skill for Tempo — a counter every beat keeps the rhythm alive.", "Riposte", "Tempo", {
    effects: [
      { kind: "rule", rule: "duelist.hybrid.counter_rhythm" },
      { kind: "grantEffect", on: { event: "damageTaken" }, effects: [{ kind: "resource", resource: "precision", delta: 6, to: "self" }] },
    ],
    ui: { badge: "CR" },
  }),
  {
    id: "duelist.the_last_word",
    classId: "duelist",
    tier: "mythic",
    name: "The Last Word",
    description: "Perfect Riposte's slowed time no longer just counters — every attack read during it is answered with a full execute, and each counter shaves a real slice off the ultimate's own cooldown.",
    flavor: "They brought a whole encounter. The Duelist brought a schedule.",
    requires: [
      { path: "Riposte", points: 6 },
      { path: "Fencer", points: 4 },
      { path: "Tempo", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "duelist.mythic.the_last_word" }],
    mutations: [{
      id: "duelist.the_last_word.riposte",
      label: "Perfect Riposte → The Last Word",
      target: { abilityId: "duelist.perfect_riposte" },
      ops: [
        { kind: "damagePacket", scaleBase: 1.4, addExecuteMissingHealth: 0.4 },
        { kind: "trigger", event: "damageTaken", window: 5, effects: [{ kind: "damage", damage: { base: 1.5, scale: "attack", type: "physical", channel: "execute" }, to: "enemies" }] },
      ],
    }],
    ui: { badge: "LWORD" },
  },
];

export const DUELIST: PilotClass = {
  classId: "duelist",
  name: "Duelist",
  fantasy: "Precision counter-fighter who wins by baiting attacks and exploiting openings.",
  role: "Single-target DPS / elite killer / counter specialist.",
  question: "Can I make the enemy's attack into a mistake?",
  resources: DUELIST_RESOURCES,
  statuses: DUELIST_STATUSES,
  abilities: DUELIST_ABILITIES,
  progression: DUELIST_PROGRESSION,
  unlocks: DUELIST_UNLOCKS,
};
