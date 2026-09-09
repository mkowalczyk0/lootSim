/**
 * Assassin — the priority-target killer. Shadow is spent to disappear and reposition;
 * a Contract is a single named target the whole kit sharpens against, and the ultimate
 * meter fills only from damage dealt to one. Where the Trickster confuses a fight, the
 * Assassin ignores it — there is one enemy that matters. The paths are five ways to
 * reach it: executions, venom, stealth, weak-point sabotage, and a blood trail.
 *
 * Question: how cleanly can I identify and eliminate the true priority target?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ---------------------------------------------------------

export const ASSASSIN_SHADOW: ResourceSpec = {
  id: "shadow",
  label: "Shadow",
  max: 100,
  start: 40,
  ui: "bar",
  regenPerSec: 3,
  generation: [
    { on: "dashStart", amount: 10 },
    { on: "kill", amount: 20 },
    { on: "crit", amount: 5 },
  ],
  thresholds: [{ at: 90, whileAbove: { critChance: 0.12, moveSpeed: 0.1 } }],
};

/** Contract Fulfilled is earned by damage to the Contract target — never a general kill. */
export const ASSASSIN_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Contract",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    // Taking the contract out, not collecting on it. This was `on: "hitDealt"`, which
    // never fired once in 1320 events: `requireTags` matches the *ability's* tags, and
    // the only `mark`-tagged ability the Assassin has that deals damage at all is the
    // ultimate itself — which THE ULTIMATE RULE refuses, so the rule could only ever
    // have been fed by the thing it was meant to pay for. Mark for Death and Expose
    // Weakness apply hostile statuses to an enemy, which is exactly what
    // `statusApplied` is broadcast for.
    { on: "statusApplied", amount: 3, requireTags: ["mark"] },
    { on: "ailmentInflicted", amount: 2, requireTags: ["poison"] },
  ],
};

export const ASSASSIN_RESOURCES: readonly ResourceSpec[] = [ASSASSIN_SHADOW, ASSASSIN_ULTIMATE_METER];

// --- statuses ---------------------------------------------------------

/** Contract — the one target that matters. Everything the Assassin does hits it harder. */
export const STATUS_CONTRACT: StatusSpec = {
  id: "contract",
  label: "Contract",
  glyph: "C",
  category: "debuff",
  tags: ["mark"],
  baseDuration: 20,
  maxStacks: 1,
  refreshRule: "refresh",
  amplify: 1.25,
};

/** Bloodscent — Blood Trail's self-buff: speed and appetite, sharper the more the target bleeds. */
export const STATUS_BLOODSCENT: StatusSpec = {
  id: "bloodscent",
  label: "Bloodscent",
  glyph: "n",
  category: "buff",
  baseDuration: 8,
  maxStacks: 1,
  refreshRule: "refresh",
  mods: { moveSpeed: 0.12, attackSpeed: 0.1 },
};

export const ASSASSIN_STATUSES: readonly StatusSpec[] = [STATUS_CONTRACT, STATUS_BLOODSCENT];

// --- abilities --------------------------------------------------------

export const ASSASSIN_GARROTE: Ability = {
  id: "assassin.garrote",
  classId: "assassin",
  name: "Garrote",
  description: "A wire around the throat from behind. It bleeds heavily and silences a caster while it holds.",
  flavor: "Quiet on both ends.",
  category: "attack",
  tags: ["melee", "bleed", "stealth"],
  cooldown: 8,
  targeting: "currentTarget",
  range: 60,
  effects: [
    { kind: "damage", damage: { base: 1.0, scale: "attack", type: "physical", canCrit: true }, to: "target" },
    { kind: "status", status: "bleed", chance: 1, stacks: 3, to: "target" },
    { kind: "status", status: "silenced", chance: 1, to: "target" },
  ],
};

export const ASSASSIN_AMBUSH: Ability = {
  id: "assassin.ambush",
  classId: "assassin",
  name: "Ambush",
  description: "An opening strike from stealth or the shadows. Against an unalerted target it is devastating.",
  flavor: "The fight had one round. This was it.",
  category: "attack",
  tags: ["melee", "stealth", "execute", "resourceSpender"],
  costs: [{ resource: "shadow", amount: 30 }],
  cooldown: 6,
  targeting: "currentTarget",
  range: 90,
  effects: [
    { kind: "move", style: "teleport", toTarget: true, iframes: 0.2 },
    { kind: "damage", damage: { base: 2.8, scale: "attack", type: "physical", canCrit: true, executeMissingHealth: 0.15 }, to: "target" },
  ],
  mutationHooks: [{ id: "ambush.packet", kind: "damagePacket", note: "Never Seen makes Ambush from stealth a guaranteed crit." }],
};

export const ASSASSIN_MARK_FOR_DEATH: Ability = {
  id: "assassin.mark_for_death",
  classId: "assassin",
  name: "Mark for Death",
  description: "Take a Contract on one target. Everything you do lands harder against it until it's dead.",
  flavor: "A decision, formally recorded.",
  category: "utility",
  tags: ["mark"],
  cooldown: 12,
  targeting: "currentTarget",
  range: 300,
  fx: { travel: "bolt" },
  effects: [
    { kind: "status", status: "contract", chance: 1, to: "target" },
  ],
  mutationHooks: [{ id: "mark_for_death.status", kind: "status", note: "Death Sentence extends the Contract to the killer's next target on a kill." }],
};

export const ASSASSIN_POISON_NEEDLE: Ability = {
  id: "assassin.poison_needle",
  classId: "assassin",
  name: "Poison Needle",
  description: "A thrown needle that stacks a fast, thin poison — meant to be applied several times.",
  flavor: "One is a nuisance. Six is a schedule.",
  category: "attack",
  tags: ["ranged", "projectile", "poison"],
  cooldown: 2,
  targeting: "direction",
  range: 260,
  effects: [
    { kind: "projectile", projectile: { damage: { base: 0.7, scale: "attack", type: "poison", canCrit: true, inflict: { status: "poison", chance: 1 } }, speed: 560, radius: 6, life: 0.7 } },
  ],
  mutationHooks: [{ id: "poison_needle.status", kind: "status", note: "Venom path deepens and speeds the stacks." }],
};

export const ASSASSIN_VANISHING_CUT: Ability = {
  id: "assassin.vanishing_cut",
  classId: "assassin",
  name: "Vanishing Cut",
  description: "Dash through a target with a cut, and come out the far side already gone.",
  flavor: "The cut and the exit are the same motion.",
  category: "movement",
  tags: ["dash", "movement", "stealth", "melee"],
  cooldown: 10,
  targeting: "currentTarget",
  range: 220,
  effects: [
    { kind: "move", style: "dash", toTarget: true, leaveAnchor: false, iframes: 0.3 },
    { kind: "damage", damage: { base: 1.6, scale: "attack", type: "physical", canCrit: true }, to: "target" },
    { kind: "status", status: "stealth", chance: 1, to: "self", durationMult: 0.5 },
  ],
};

export const ASSASSIN_EXPOSE_WEAKNESS: Ability = {
  id: "assassin.expose_weakness",
  classId: "assassin",
  name: "Expose Weakness",
  description: "Read a target for a beat and call out the gap. The whole party's hits land harder on it.",
  flavor: "There. Hit there.",
  category: "support",
  tags: ["mark", "support"],
  cooldown: 16,
  targeting: "currentTarget",
  range: 260,
  fx: { travel: "bolt" },
  effects: [
    { kind: "status", status: "exposed", chance: 1, to: "target", durationMult: 1.6 },
    { kind: "status", status: "vulnerable", chance: 1, to: "target" },
  ],
};

export const ASSASSIN_BLOOD_TRAIL: Ability = {
  id: "assassin.blood_trail",
  classId: "assassin",
  name: "Blood Trail",
  description: "Lock onto a wound. Against bleeding or poisoned targets you move and strike faster.",
  flavor: "The Assassin does not lose a target. The target leaves a very clear line.",
  category: "support",
  tags: ["support"],
  cooldown: 14,
  targeting: "self",
  effects: [
    { kind: "status", status: "bloodscent", chance: 1, to: "self" },
    { kind: "resource", resource: "shadow", delta: 15, to: "self" },
  ],
};

export const ASSASSIN_SILENT_STEP: Ability = {
  id: "assassin.silent_step",
  classId: "assassin",
  name: "Silent Step",
  description: "Shed all the threat you've built and slip into the shadows — enemies lose track of you entirely.",
  flavor: "As far as the room is concerned, the Assassin has left.",
  category: "utility",
  tags: ["stealth"],
  cooldown: 20,
  targeting: "self",
  effects: [
    { kind: "threat", op: "drop", radius: 300, to: "self" },
    { kind: "status", status: "stealth", chance: 1, to: "self" },
    { kind: "resource", resource: "shadow", delta: 25, to: "self" },
  ],
};

export const ASSASSIN_EXECUTION: Ability = {
  id: "assassin.execution",
  classId: "assassin",
  name: "Execution",
  description: "A killing technique. Ordinary enemies below a health threshold simply die; a boss takes a flat slice of its maximum.",
  flavor: "Not an attack. A conclusion.",
  category: "attack",
  tags: ["melee", "execute", "resourceSpender"],
  costs: [{ resource: "shadow", amount: 40 }],
  cooldown: 10,
  targeting: "currentTarget",
  range: 70,
  effects: [
    { kind: "damage", damage: { base: 1.8, scale: "attack", type: "physical", canCrit: true, executeMissingHealth: 0.6 }, to: "target" },
  ],
  mutationHooks: [{ id: "execution.packet", kind: "damagePacket", note: "Critical Weakness raises the boss slice; Death Spiral chains it." }],
};

export const ASSASSIN_CONTRACT_FULFILLED: Ability = {
  id: "assassin.contract_fulfilled",
  classId: "assassin",
  name: "Contract Fulfilled",
  description: "Lock onto one target and commit. A time-slowed sequence of strikes that escalates with each hit and cannot be interrupted until the target is down or you are.",
  flavor: "Everything before this was preparation. The Assassin does not miss this part.",
  category: "ultimate",
  tags: ["ultimate", "execute", "mark", "melee"],
  cooldown: 0,
  isUltimate: true,
  targeting: "currentTarget",
  range: 260,
  effects: [
    { kind: "fx", fx: "assassin.lock_on" },
    { kind: "move", style: "teleport", toTarget: true, iframes: 0.4 },
    { kind: "status", status: "contract", chance: 1, to: "target" },
    { kind: "damage", damage: { base: 1.4, scale: "attack", type: "physical", canCrit: true, channel: "ultimate" }, to: "target" },
    { kind: "damage", damage: { base: 1.8, scale: "attack", type: "physical", canCrit: true, channel: "ultimate" }, to: "target" },
    { kind: "damage", damage: { base: 2.6, scale: "attack", type: "physical", canCrit: true, channel: "ultimate", executeMissingHealth: 0.4 }, to: "target" },
  ],
  mutationHooks: [{ id: "contract_fulfilled.followup", kind: "followUp", note: "The Perfect Contract chains to the next priority target on a kill." }],
};

export const ASSASSIN_ABILITIES: readonly Ability[] = [
  ASSASSIN_GARROTE,
  ASSASSIN_AMBUSH,
  ASSASSIN_MARK_FOR_DEATH,
  ASSASSIN_POISON_NEEDLE,
  ASSASSIN_VANISHING_CUT,
  ASSASSIN_EXPOSE_WEAKNESS,
  ASSASSIN_BLOOD_TRAIL,
  ASSASSIN_SILENT_STEP,
  ASSASSIN_EXECUTION,
  ASSASSIN_CONTRACT_FULFILLED,
];

// --- the tree --------------------------------------------------------

export const ASSASSIN_PROGRESSION: ClassProgression = {
  classId: "assassin",
  paths: [
    // 0 — Executioner: the threshold, refined.
    {
      name: "Executioner",
      blurb: "Below the line is a formality. Raise the line.",
      nodes: [
        { name: "Killing Blow", category: "foundation", effects: [{ kind: "mods", mods: { critDamage: 0.2, meleeDamage: 0.05 } }] },
        { name: "Weak Point", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "ex.weak_point", label: "every strike on a Contract carries an execute rider", target: { withTag: "mark" }, ops: [{ kind: "damagePacket", addExecuteMissingHealth: 0.15 }] } }] },
        { name: "Blood Debt", category: "resource", effects: [{ kind: "resourceRule", resource: "shadow", patch: { addGeneration: [{ on: "kill", amount: 15, requireTags: ["execute"] }] } }] },
        { name: "Clean Kill", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "ex.clean_kill", label: "Execution refunds itself and Ambush on a kill", target: { abilityId: "assassin.execution" }, ops: [{ kind: "cooldown", scale: 0.6 }] } }] },
        { name: "Death Sentence", category: "keystone", effects: [{ kind: "rule", rule: "assassin.ex.death_sentence", note: "Killing a Contract target moves the Contract to the nearest enemy for free." }] },
      ],
    },
    // 1 — Venom: stacks that finish the job.
    {
      name: "Venom",
      blurb: "You do not need to be there when it works.",
      nodes: [
        { name: "Coated Blades", category: "foundation", effects: [{ kind: "mods", mods: { poisonDamage: 0.15, ailmentChance: 0.12 } }, { kind: "grantEffect", on: { tag: "melee" }, effects: [{ kind: "status", status: "poison", chance: 0.4, to: "allTargets" }] }] },
        { name: "Potent Toxin", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "vn.potent_toxin", label: "your poisons stack higher and tick faster", target: { withTag: "poison" }, ops: [{ kind: "status", addStacks: 2, scalePotency: 1.3 }] } }] },
        { name: "Distillery", category: "resource", effects: [{ kind: "resourceRule", resource: "ultimate", patch: { addGeneration: [{ on: "ailmentInflicted", amount: 2, requireTags: ["poison"] }] } }] },
        { name: "Overdose", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "vn.overdose", label: "Poison Needle throws a fan of three", target: { abilityId: "assassin.poison_needle" }, ops: [{ kind: "projectile", addCount: 2 }] } }] },
        { name: "Fatal Dose", category: "keystone", effects: [{ kind: "rule", rule: "assassin.vn.fatal_dose", note: "Poison at max stacks becomes lethal — it will kill the target on its own, and spreads on that death." }] },
      ],
    },
    // 2 — Shadow: never be where the fight is.
    {
      name: "Shadow",
      blurb: "The Assassin is only ever visible on purpose.",
      nodes: [
        { name: "Second Skin", category: "foundation", effects: [{ kind: "mods", mods: { moveSpeed: 0.08 } }] },
        { name: "Long Shadow", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "sh.long_shadow", label: "your stealth lasts longer and survives one attack", target: { withTag: "stealth" }, ops: [{ kind: "status", scaleDuration: 1.5 }] } }] },
        { name: "Umbral Reserve", category: "resource", effects: [{ kind: "resourceRule", resource: "shadow", patch: { max: 140, regenPerSec: 5 } }] },
        { name: "From the Dark", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "sh.from_the_dark", label: "Vanishing Cut leaves you stealthed for its whole cooldown", target: { abilityId: "assassin.vanishing_cut" }, ops: [{ kind: "status", scaleDuration: 2 }] } }] },
        { name: "Never Seen", category: "keystone", effects: [{ kind: "rule", rule: "assassin.sh.never_seen", note: "The first strike out of stealth always crits, and a kill from stealth doesn't break it." }] },
      ],
    },
    // 3 — Saboteur: the fight was decided before it started.
    {
      name: "Saboteur",
      blurb: "Make the target weaker before you ever touch it.",
      nodes: [
        { name: "Case the Room", category: "foundation", effects: [{ kind: "mods", mods: { critChance: 0.06 } }] },
        { name: "Sabotage", category: "behavior", effects: [{ kind: "mutate", mutation: { id: "sb.sabotage", label: "Expose Weakness also disarms the target's special", target: { abilityId: "assassin.expose_weakness" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "silenced", chance: 1, to: "target" }] }] } }] },
        { name: "Inside Job", category: "resource", effects: [{ kind: "resourceRule", resource: "shadow", patch: { addGeneration: [{ on: "statusApplied", amount: 3, requireTags: ["mark"] }] } }] },
        { name: "Structural Flaw", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "sb.structural_flaw", label: "an exposed target takes more from everyone, not just you", target: { withTag: "mark" }, ops: [{ kind: "status", scalePotency: 1.3 }] } }] },
        { name: "Critical Weakness", category: "keystone", effects: [{ kind: "rule", rule: "assassin.sb.critical_weakness", note: "Execution's boss slice doubles against an exposed Contract, once per encounter." }] },
      ],
    },
    // 4 — Blood Hunter: run it down.
    {
      name: "Blood Hunter",
      blurb: "A wounded target has already told you where it's going.",
      nodes: [
        { name: "Scent", category: "foundation", effects: [{ kind: "mods", mods: { attackSpeed: 0.06 } }] },
        { name: "Run It Down", category: "behavior", effects: [{ kind: "grantEffect", on: { tag: "bleed" }, effects: [{ kind: "status", status: "bloodscent", chance: 0.5, to: "self" }] }] },
        { name: "Predator's Patience", category: "resource", effects: [{ kind: "resourceRule", resource: "shadow", patch: { addGeneration: [{ on: "hitDealt", amount: 1, requireTags: ["bleed"] }] } }] },
        { name: "Hamstring", category: "mutation", effects: [{ kind: "mutate", mutation: { id: "bh.hamstring", label: "Garrote also cripples the target's movement", target: { abilityId: "assassin.garrote" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "status", status: "chill", chance: 1, to: "target" }] }] } }] },
        { name: "Death Spiral", category: "keystone", effects: [{ kind: "rule", rule: "assassin.bh.death_spiral", note: "Against a bleeding, poisoned, and marked target, every hit is an Execution." }] },
      ],
    },
  ],
};

// --- hybrids & archetype --------------------------------------------

const H = (id: string, name: string, description: string, a: string, b: string, extra: Partial<PathUnlockDef> = {}): PathUnlockDef => ({
  id: `assassin.${id}`,
  classId: "assassin",
  tier: "hybrid",
  name,
  description,
  requires: [
    { path: a, points: 3 },
    { path: b, points: 2 },
  ],
  effects: [{ kind: "rule", rule: `assassin.hybrid.${id}` }],
  ...extra,
});

export const ASSASSIN_UNLOCKS: PathUnlockDef[] = [
  H("toxic_execution", "Toxic Execution", "Execution consumes every poison stack on the target for a burst scaled by the stacks spent.", "Executioner", "Venom", {
    mutations: [{ id: "assassin.toxic_execution", label: "Execution detonates poison", target: { abilityId: "assassin.execution" }, ops: [{ kind: "addEffect", at: "end", effects: [{ kind: "consumeStatus", status: "poison", to: "target", then: [{ kind: "damage", damage: { base: 2.0, scale: "attack", type: "poison", channel: "execute" }, to: "target" }] }] }] }],
    ui: { badge: "TXE" },
  }),
  H("predator", "Predator", "While stealthed, you can see wounded and marked enemies through walls, and Blood Trail never expires.", "Shadow", "Blood Hunter", {
    effects: [{ kind: "rule", rule: "assassin.hybrid.predator" }],
    ui: { badge: "PRD" },
  }),
  H("weak_point", "Weak Point", "Ambush from stealth on an exposed target always executes.", "Saboteur", "Executioner", {
    mutations: [{ id: "assassin.weak_point", label: "Ambush on the exposed executes", target: { abilityId: "assassin.ambush" }, ops: [{ kind: "damagePacket", addExecuteMissingHealth: 0.4 }] }],
    ui: { badge: "WPT" },
  }),
  H("silent_poison", "Silent Poison", "Poison you apply while stealthed does not alert the target — it stacks freely until it's lethal.", "Venom", "Shadow", {
    effects: [{ kind: "rule", rule: "assassin.hybrid.silent_poison" }],
    ui: { badge: "SLP" },
  }),
  H("death_chain", "Death Chain", "An Execution kill grants a free Ambush that resets Execution — a chain of kills across a pack.", "Blood Hunter", "Executioner", {
    effects: [
      { kind: "rule", rule: "assassin.hybrid.death_chain" },
      { kind: "grantEffect", on: { event: "kill" }, effects: [{ kind: "resource", resource: "shadow", delta: 25, to: "self" }] },
    ],
    ui: { badge: "DCH" },
  }),
  H("perfect_crime", "Perfect Crime", "A kill while stealthed generates no threat and does not break stealth — the room never learns it happened.", "Shadow", "Saboteur", {
    effects: [{ kind: "rule", rule: "assassin.hybrid.perfect_crime" }],
    ui: { badge: "PCR" },
  }),
  {
    id: "assassin.the_perfect_contract",
    classId: "assassin",
    tier: "mythic",
    name: "The Perfect Contract",
    description: "Contract Fulfilled stops being a single execution and becomes a rolling one. Each kill during it re-locks onto the next-highest-threat enemy and restarts the escalating sequence, and every poison and bleed on a Contract target ticks for its whole stack at once.",
    flavor: "The contract did not name one target. The Assassin re-read it.",
    requires: [
      { path: "Executioner", points: 6 },
      { path: "Venom", points: 4 },
      { path: "Shadow", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "assassin.mythic.the_perfect_contract" }],
    mutations: [{
      id: "assassin.the_perfect_contract.ult",
      label: "Contract Fulfilled → The Perfect Contract",
      target: { abilityId: "assassin.contract_fulfilled" },
      ops: [
        { kind: "followUp", window: 3, effects: [
          { kind: "status", status: "contract", chance: 1, to: "enemies" },
          { kind: "damage", damage: { base: 2.4, scale: "attack", type: "physical", channel: "ultimate", executeMissingHealth: 0.4 }, to: "enemies" },
        ] },
      ],
    }],
    ui: { badge: "PCON" },
  },
];

export const ASSASSIN: PilotClass = {
  classId: "assassin",
  name: "Assassin",
  fantasy: "Pure priority-target killer focused on contracts, stealth, weak points, and clean executions.",
  role: "Boss DPS / priority target elimination / execution.",
  question: "How cleanly can I identify and eliminate the true priority target?",
  resources: ASSASSIN_RESOURCES,
  statuses: ASSASSIN_STATUSES,
  abilities: ASSASSIN_ABILITIES,
  progression: ASSASSIN_PROGRESSION,
  unlocks: ASSASSIN_UNLOCKS,
};
