/**
 * Alchemist — the improviser. Reagents are a small rack of prepared compounds, drawn
 * in combat and thrown; the ultimate meter fills as your zones react with each other.
 * The whole class is about overlapping the wrong things on purpose. The paths are five
 * specialisms: fire, toxin, medicine, unstable science, and transmutation.
 *
 * Question: how many useful reactions can I create from the same battlefield?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const ALCHEMIST_REAGENTS: ResourceSpec = {
  id: "reagents",
  label: "Reagents",
  max: 6,
  start: 3,
  ui: "charges",
  regenPerSec: 0.25,
  generation: [
    { on: "kill", amount: 1 },
    { on: "skillUse", amount: 1, requireTags: ["zone"] },
  ],
};

export const ALCHEMIST_MANA: ResourceSpec = {
  id: "mana",
  label: "Mana",
  max: 100,
  start: "full",
  ui: "bar",
  regenPerSec: 4,
};

/** The Grand Experiment is earned by making reactions — zones overlapping — not by kills. */
export const ALCHEMIST_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Experiment",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "skillUse", amount: 6, requireTags: ["zone"] },
    { on: "ailmentInflicted", amount: 3 },
  ],
};

export const ALCHEMIST_RESOURCES: readonly ResourceSpec[] = [ALCHEMIST_REAGENTS, ALCHEMIST_MANA, ALCHEMIST_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Corroded — Corrosive Mixture's armor strip. Deep stacks and it eats resistance too. */
export const STATUS_CORRODED: StatusSpec = {
  id: "corroded",
  label: "Corroded",
  glyph: "-",
  category: "debuff",
  tags: ["poison", "vulnerable"],
  baseDuration: 7,
  maxStacks: 5,
  refreshRule: "stack",
  amplify: 1.07,
};

/** Catalyzed — Experimental Serum's ally buff. Random each cast, but always a real one. */
export const STATUS_CATALYZED: StatusSpec = {
  id: "catalyzed",
  label: "Catalyzed",
  glyph: "+",
  category: "buff",
  tags: ["support"],
  baseDuration: 8,
  maxStacks: 1,
  refreshRule: "refresh",
  mods: { attackSpeed: 0.1, moveSpeed: 0.1, critChance: 0.05 },
};

export const ALCHEMIST_STATUSES: readonly StatusSpec[] = [STATUS_CORRODED, STATUS_CATALYZED];

// --- abilities --------------------------------------------------------

export const ALCHEMIST_VOLATILE_FLASK: Ability = {
  id: "alchemist.volatile_flask",
  classId: "alchemist",
  name: "Volatile Flask",
  description: "Throw a flask that bursts into a pool of clinging fire.",
  flavor: "Corked, until it very much isn't.",
  category: "spell",
  tags: ["zone", "area", "fire"],
  costs: [{ resource: "reagents", amount: 1 }],
  cooldown: 5,
  targeting: "point",
  range: 200,
  effects: [
    { kind: "zone", zone: { radius: 80, duration: 6, tickInterval: 0.5, follows: false, mergeable: true, damage: { base: 0.5, scale: "spell", type: "fire", channel: "periodic" }, status: { id: "burn", chance: 0.6 } } },
  ],
  mutationHooks: [{ id: "volatile_flask.zone", kind: "zone", note: "Pyromancer path chains detonations between fire pools." }],
};

export const ALCHEMIST_FROST_SOLUTION: Ability = {
  id: "alchemist.frost_solution",
  classId: "alchemist",
  name: "Frost Solution",
  description: "A flask of supercooled liquid that flashes into a freezing cloud on impact.",
  flavor: "Do not shake. Do not warm. Do throw.",
  category: "spell",
  tags: ["zone", "area", "frost", "crowdControl"],
  costs: [{ resource: "reagents", amount: 1 }],
  cooldown: 7,
  targeting: "point",
  range: 200,
  effects: [
    { kind: "zone", zone: { radius: 90, duration: 5, tickInterval: 0.5, follows: false, mergeable: true, damage: { base: 0.3, scale: "spell", type: "cold", channel: "periodic" }, status: { id: "chill", chance: 1 } } },
  ],
};

export const ALCHEMIST_ADRENAL_COMPOUND: Ability = {
  id: "alchemist.adrenal_compound",
  classId: "alchemist",
  name: "Adrenal Compound",
  description: "A stimulant shot for an ally — a hard, brief burst of speed and reaction.",
  flavor: "Side effects were not extensively studied. Time was short.",
  category: "support",
  tags: ["support", "heal"],
  cooldown: 12,
  targeting: "lowestHealthAlly",
  range: 200,
  fx: { travel: "bolt" },
  effects: [
    { kind: "status", status: "catalyzed", chance: 1, to: "allies" },
    { kind: "cleanse", category: "cc", to: "allies" },
  ],
};

export const ALCHEMIST_CORROSIVE_MIXTURE: Ability = {
  id: "alchemist.corrosive_mixture",
  classId: "alchemist",
  name: "Corrosive Mixture",
  description: "An acid that eats through plate. Stacks strip armor, then resistance.",
  flavor: "It is still eating through the last thing you threw it at.",
  category: "spell",
  tags: ["poison", "ranged", "projectile"],
  costs: [{ resource: "reagents", amount: 1 }],
  cooldown: 5,
  targeting: "direction",
  range: 260,
  effects: [
    { kind: "projectile", projectile: { damage: { base: 0.8, scale: "spell", type: "poison", canCrit: true, inflict: { status: "corroded", chance: 1 } }, speed: 380, radius: 18, life: 0.9 } },
  ],
  mutationHooks: [{ id: "corrosive_mixture.status", kind: "status", note: "Toxicologist deepens the corrosion." }],
};

export const ALCHEMIST_TRANSFUSION_TONIC: Ability = {
  id: "alchemist.transfusion_tonic",
  classId: "alchemist",
  name: "Transfusion Tonic",
  description: "Spend your own Mana to pour health into an ally — a direct conversion, at a favorable rate.",
  flavor: "The Alchemist has more Mana than sense, and is happy to trade some.",
  category: "support",
  tags: ["support", "heal", "resourceSpender"],
  costs: [{ resource: "mana", amount: 30 }],
  cooldown: 8,
  targeting: "lowestHealthAlly",
  range: 220,
  effects: [
    { kind: "heal", amount: 1.6, scale: "spell", to: "lowestHealthAlly" },
  ],
};

export const ALCHEMIST_REAGENT_TOSS: Ability = {
  id: "alchemist.reagent_toss",
  classId: "alchemist",
  name: "Reagent Toss",
  description: "Throw whatever's in your off hand right now — the effect depends on the reagent drawn.",
  flavor: "The Alchemist is fairly sure which one that was.",
  category: "attack",
  tags: ["ranged", "projectile", "resourceSpender"],
  costs: [{ resource: "reagents", amount: 1 }],
  cooldown: 2,
  targeting: "direction",
  range: 240,
  effects: [
    { kind: "random", choices: [
      { weight: 1, effects: [{ kind: "projectile", projectile: { damage: { base: 1.2, scale: "spell", type: "fire", canCrit: true, inflict: { status: "burn", chance: 0.6 } }, speed: 420, radius: 12, life: 0.8 } }] },
      { weight: 1, effects: [{ kind: "projectile", projectile: { damage: { base: 1.0, scale: "spell", type: "cold", canCrit: true, inflict: { status: "chill", chance: 1 } }, speed: 420, radius: 12, life: 0.8 } }] },
      { weight: 1, effects: [{ kind: "projectile", projectile: { damage: { base: 1.0, scale: "spell", type: "poison", canCrit: true, inflict: { status: "corroded", chance: 1 } }, speed: 420, radius: 12, life: 0.8 } }] },
    ] },
  ],
};

export const ALCHEMIST_UNSTABLE_REACTION: Ability = {
  id: "alchemist.unstable_reaction",
  classId: "alchemist",
  name: "Unstable Reaction",
  description: "Force every chemical zone on the field to react at once — fire and frost and acid, all combining badly.",
  flavor: "Do not do this indoors. You are indoors. Do it anyway.",
  category: "spell",
  tags: ["area", "resourceSpender", "zone"],
  costs: [{ resource: "reagents", amount: 3 }],
  cooldown: 16,
  targeting: "self",
  effects: [
    { kind: "damage", damage: { base: 2.6, scale: "spell", type: "fire", canCrit: true, knockback: 90 }, to: "enemies" },
    { kind: "status", status: "burn", chance: 0.7, to: "enemies" },
    { kind: "status", status: "corroded", chance: 0.7, to: "enemies" },
  ],
  mutationHooks: [{ id: "unstable_reaction.packet", kind: "damagePacket", note: "Mad Scientist path randomises and amplifies the yield." }],
};

export const ALCHEMIST_SMOKE_BOMB: Ability = {
  id: "alchemist.smoke_bomb",
  classId: "alchemist",
  name: "Smoke Bomb",
  description: "A dense cloud that ruins everyone's aim inside it — theirs more than yours.",
  flavor: "The recipe is mostly about the smell, honestly.",
  category: "utility",
  tags: ["zone", "crowdControl", "area"],
  cooldown: 14,
  targeting: "point",
  range: 160,
  effects: [
    { kind: "zone", zone: { radius: 130, duration: 6, tickInterval: 1, follows: false, status: { id: "blinded", chance: 1 } } },
  ],
};

export const ALCHEMIST_EXPERIMENTAL_SERUM: Ability = {
  id: "alchemist.experimental_serum",
  classId: "alchemist",
  name: "Experimental Serum",
  description: "An untested enhancement for an ally. Always something good. Rarely the same something.",
  flavor: "Sign here. And here. The Alchemist will explain the third form later.",
  category: "support",
  tags: ["support"],
  cooldown: 18,
  targeting: "lowestHealthAlly",
  range: 200,
  effects: [
    { kind: "random", choices: [
      { weight: 1, effects: [{ kind: "status", status: "catalyzed", chance: 1, stacks: 1, to: "allies" }] },
      { weight: 1, effects: [{ kind: "shield", amount: 1.4, scale: "spell", to: "allies", duration: 8 }] },
      { weight: 1, effects: [{ kind: "heal", amount: 0.5, scale: "spell", to: "allies", overTime: { duration: 5 } }] },
    ] },
  ],
  mutationHooks: [{ id: "experimental_serum.rule", kind: "trigger", note: "Medic path lets you pick the outcome." }],
};

export const ALCHEMIST_GRAND_EXPERIMENT: Ability = {
  id: "alchemist.grand_experiment",
  classId: "alchemist",
  name: "Grand Experiment",
  description: "Flood the whole arena with a mutating compound. Every few seconds it changes what it does — burning, freezing, corroding, healing your side — and it keeps reacting with itself.",
  flavor: "The Alchemist has a hypothesis. The battlefield is the control group.",
  category: "ultimate",
  tags: ["ultimate", "zone", "area"],
  cooldown: 0,
  isUltimate: true,
  targeting: "self",
  effects: [
    { kind: "fx", fx: "alchemist.grand_experiment" },
    { kind: "zone", zone: { radius: 280, duration: 14, tickInterval: 0.5, follows: false, mergeable: true, damage: { base: 0.5, scale: "spell", type: "fire", channel: "ultimate" }, status: { id: "corroded", chance: 0.4 } } },
    { kind: "delay", seconds: 4, effects: [{ kind: "zone", zone: { radius: 280, duration: 6, tickInterval: 0.5, follows: false, damage: { base: 0.5, scale: "spell", type: "cold", channel: "ultimate" }, status: { id: "chill", chance: 0.6 } } }] },
  ],
  mutationHooks: [{ id: "grand_experiment.zone", kind: "zone", note: "The Reaction makes every phase overlap instead of cycling." }],
};

export const ALCHEMIST_ABILITIES: readonly Ability[] = [
  ALCHEMIST_VOLATILE_FLASK,
  ALCHEMIST_FROST_SOLUTION,
  ALCHEMIST_ADRENAL_COMPOUND,
  ALCHEMIST_CORROSIVE_MIXTURE,
  ALCHEMIST_TRANSFUSION_TONIC,
  ALCHEMIST_REAGENT_TOSS,
  ALCHEMIST_UNSTABLE_REACTION,
  ALCHEMIST_SMOKE_BOMB,
  ALCHEMIST_EXPERIMENTAL_SERUM,
  ALCHEMIST_GRAND_EXPERIMENT,
];

// --- the tree --------------------------------------------------------

export const ALCHEMIST_PROGRESSION: ClassProgression = {
  classId: "alchemist",
  paths: [
    // 0 — Pyromancer: fire that chains.
    {
      name: "Pyromancer",
      blurb: "One fire is a mistake. A network of fires is a method.",
      nodes: [
        { name: "Accelerant", category: "foundation", effects: [{ kind: "mods", mods: { fireDamage: 0.15 } }] },
        { name: "Flashpoint", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "py.flashpoint", label: "fire zones ignite anything that walks between them", target: { withTag: "fire" }, ops: [{ kind: "zone", forceMergeable: true, scaleDamage: 1.2 }] } }] },
        { name: "Fuel Reserve", category: "resource", effects: [{ kind: "resourceRule", resource: "reagents", patch: { addGeneration: [{ on: "ailmentInflicted", amount: 1, requireTags: ["burn"] }] } }] },
        { name: "Backdraft", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "py.backdraft", label: "Volatile Flask detonates on a second cast", target: { abilityId: "alchemist.volatile_flask" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "damage", damage: { base: 1.2, scale: "spell", type: "fire", canCrit: true }, to: "enemies" }] }] } }] },
        { name: "Conflagration", category: "keystone", effects: [{ kind: "rule", rule: "alchemist.py.conflagration", note: "Any fire zone touching another instantly merges and detonates the overlap." }] },
      ],
    },
    // 1 — Toxicologist: poison that compounds.
    {
      name: "Toxicologist",
      blurb: "Given enough stacks, everything is soluble.",
      nodes: [
        { name: "Distillation", category: "foundation", effects: [{ kind: "mods", mods: { poisonDamage: 0.15, ailmentPotency: 0.1 } }] },
        { name: "Bioaccumulate", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "tx.bioaccumulate", label: "Corroded and Poison stack deeper", target: { withTag: "poison" }, ops: [{ kind: "status", addStacks: 1, scaleDuration: 1.3 }] } }] },
        { name: "Harvest Glands", category: "resource", effects: [{ kind: "resourceRule", resource: "reagents", patch: { max: 9, addGeneration: [{ on: "enemyDeath", amount: 1 }] } }] },
        { name: "Necrotic Blend", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "tx.necrotic_blend", label: "Corrosive Mixture leaves a lingering acid pool", target: { abilityId: "alchemist.corrosive_mixture" }, ops: [{ kind: "projectile", addOnExpire: [{ kind: "zone", zone: { radius: 70, duration: 5, tickInterval: 0.5, follows: false, damage: { base: 0.3, scale: "spell", type: "poison", channel: "periodic" }, status: { id: "corroded", chance: 0.5 } } }] }] } }] },
        { name: "Biological Collapse", category: "keystone", effects: [{ kind: "rule", rule: "alchemist.tx.biological_collapse", note: "An enemy at max Corroded that dies bursts, applying full Corroded to everything nearby." }] },
      ],
    },
    // 2 — Medic: keep the party up.
    {
      name: "Medic",
      blurb: "The best experiment is the one where everyone lives.",
      nodes: [
        { name: "Field Kit", category: "foundation", effects: [{ kind: "mods", mods: { wardPower: 0.15 } }] },
        { name: "Triage", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "md.triage", label: "your heals scale up on lower-health allies", target: { withTag: "heal" }, ops: [{ kind: "damagePacket", scaleBase: 1.2 }] } }] },
        { name: "Reserve Stock", category: "resource", effects: [{ kind: "resourceRule", resource: "mana", patch: { max: 140, regenPerSec: 6 } }] },
        { name: "Prescribe", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "md.prescribe", label: "Experimental Serum's outcome is yours to choose", target: { abilityId: "alchemist.experimental_serum" }, ops: [{ kind: "cooldown", scale: 0.8 }] } }] },
        { name: "Miracle Cure", category: "keystone", effects: [{ kind: "rule", rule: "alchemist.md.miracle_cure", note: "A Transfusion Tonic on a downed ally revives them at half health." }] },
      ],
    },
    // 3 — Mad Scientist: embrace the variance.
    {
      name: "Mad Scientist",
      blurb: "Reproducibility is for cowards.",
      nodes: [
        { name: "No Control Group", category: "foundation", effects: [{ kind: "mods", mods: { skillDamage: 0.1, critDamage: 0.15 } }] },
        { name: "Wild Yield", category: "behavior", effects: [{ kind: "rule", rule: "alchemist.ms.wild_yield", note: "Every thrown reagent rolls a second random rider on top of its own." }] },
        { name: "Improvised Lab", category: "resource", effects: [{ kind: "resourceRule", resource: "reagents", patch: { regenPerSec: 0.5 } }] },
        { name: "Overpressure", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ms.overpressure", label: "Unstable Reaction hits far harder and randomises its element", target: { abilityId: "alchemist.unstable_reaction" }, ops: [{ kind: "damagePacket", scaleBase: 1.5 }, { kind: "targeting", scaleRadius: 1.3 }] } }] },
        { name: "Unstable Genius", category: "keystone", effects: [{ kind: "rule", rule: "alchemist.ms.unstable_genius", note: "Every skill has a chance to cast a second random Alchemist skill for free." }] },
      ],
    },
    // 4 — Transmuter: change one thing into another.
    {
      name: "Transmuter",
      blurb: "Everything on the field is raw material.",
      nodes: [
        { name: "Base Metals", category: "foundation", effects: [{ kind: "mods", mods: { elementalDamage: 0.1 } }] },
        { name: "Equivalent Exchange", category: "behavior", effects: [{ kind: "rule", rule: "alchemist.tr.equivalent_exchange", note: "Spending a reagent refunds a fraction of Mana, and vice versa." }] },
        { name: "Reagent Synthesis", category: "resource", effects: [{ kind: "resourceRule", resource: "reagents", patch: { addGeneration: [{ on: "manaSpent", amount: 0.05, perUnit: "manaFraction" }] } }] },
        { name: "Reclass", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "tr.reclass", label: "Reagent Toss becomes any element you choose", target: { abilityId: "alchemist.reagent_toss" }, ops: [{ kind: "damagePacket", scaleBase: 1.2 }] } }] },
        { name: "Philosopher's Stone", category: "keystone", effects: [{ kind: "rule", rule: "alchemist.tr.philosophers_stone", note: "Reagents and Mana share one pool; either skill can pay with either." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `alchemist.${id}`,
  classId: "alchemist",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `alchemist.hybrid.${id}` }],
  ...extra,
});

export const ALCHEMIST_UNLOCKS: PathUnlockDef[] = [
  H("napalm", "Napalm", "Fire and acid zones that overlap become one sticky pool that burns and corrodes at once.", "Pyromancer", "Toxicologist", {
    mutations: [{ id: "alchemist.napalm", label: "fire + acid merge", target: { withTag: "zone" }, ops: [{ kind: "zone", forceMergeable: true, scaleDuration: 1.3 }] }],
    ui: { badge: "NPM" },
  }),
  H("panacea", "Panacea", "Transfusion Tonic also cleanses every debuff and grants a Catalyzed buff.", "Medic", "Transmuter", {
    mutations: [{ id: "alchemist.panacea", label: "the tonic does everything", target: { abilityId: "alchemist.transfusion_tonic" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "cleanse", category: "debuff", to: "lowestHealthAlly" }, { kind: "status", status: "catalyzed", chance: 1, to: "lowestHealthAlly" }] }] }],
    ui: { badge: "PAN" },
  }),
  H("unstable_combustion", "Unstable Combustion", "Unstable Reaction's yield always includes a fire detonation, scaled by reagents spent.", "Mad Scientist", "Pyromancer", {
    effects: [{ kind: "rule", rule: "alchemist.hybrid.unstable_combustion" }],
    ui: { badge: "UCB" },
  }),
  H("mutagen", "Mutagen", "Corroded enemies spread the stack to anything that touches them.", "Toxicologist", "Transmuter", {
    mutations: [{ id: "alchemist.mutagen", label: "corrosion is contagious", target: { withTag: "poison" }, ops: [{ kind: "status", scaleDuration: 1.4 }] }],
    ui: { badge: "MTG" },
  }),
  H("experimental_medicine", "Experimental Medicine", "Experimental Serum can roll offensive outcomes too — and you keep whichever one lands.", "Mad Scientist", "Medic", {
    effects: [{ kind: "rule", rule: "alchemist.hybrid.experimental_medicine" }],
    ui: { badge: "EXM" },
  }),
  H("lab_accident", "Lab Accident", "Every thrown reagent has a chance to over-yield: a much bigger blast, centred on you.", "Pyromancer", "Mad Scientist", {
    effects: [{ kind: "rule", rule: "alchemist.hybrid.lab_accident" }],
    ui: { badge: "LAB" },
  }),
  {
    id: "alchemist.the_reaction",
    classId: "alchemist",
    tier: "mythic",
    name: "The Reaction",
    description: "Grand Experiment stops cycling and starts compounding: every phase's zone stays, they all react with each other continuously, and each reaction throws a random reagent for free at the nearest enemy.",
    flavor: "The Alchemist finally got the experiment to run itself. This is generally regarded as a bad sign.",
    requires: [
      { path: "Pyromancer", points: 6 },
      { path: "Toxicologist", points: 4 },
      { path: "Mad Scientist", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "alchemist.mythic.the_reaction" }],
    mutations: [{
      id: "alchemist.the_reaction.grand_experiment",
      label: "Grand Experiment → The Reaction",
      target: { abilityId: "alchemist.grand_experiment" },
      ops: [
        { kind: "zone", forceMergeable: true, scaleDuration: 1.5 },
        { kind: "addEffect", at: "end", effects: [{ kind: "zone", zone: { radius: 280, duration: 8, tickInterval: 0.5, follows: false, damage: { base: 0.5, scale: "spell", type: "poison", channel: "ultimate" }, status: { id: "corroded", chance: 0.6 } } }] },
      ],
    }],
    ui: { badge: "REACT" },
  },
];

export const ALCHEMIST: PilotClass = {
  classId: "alchemist",
  name: "Alchemist",
  fantasy: "Improviser who creates battlefield reactions by combining reagents.",
  role: "Utility DPS / buffs / debuffs / area control.",
  question: "How many useful reactions can I create from the same battlefield?",
  resources: ALCHEMIST_RESOURCES,
  statuses: ALCHEMIST_STATUSES,
  abilities: ALCHEMIST_ABILITIES,
  progression: ALCHEMIST_PROGRESSION,
  unlocks: ALCHEMIST_UNLOCKS,
};
