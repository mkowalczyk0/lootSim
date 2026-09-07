/**
 * Paladin — damage that never reaches the party.
 *
 * The pilot for: **ally-targeted** heal / shield / damage-redirect (the `redirect` and
 * `shield.absorbOneHit` steps); buffs landing on other heroes in a party sim;
 * heal-over-zone (Consecrated Ground); threat / off-tank play; **Conviction** generated
 * by *preventing* damage (the `damagePrevented` event); and the `guardsDeath` status
 * shared with the Berserker, here fanned out across the whole group (Last Light).
 *
 * Question: how much damage can I prevent from ever reaching my party?
 */

import type { Ability } from "../combat/ability";
import type { ResourceSpec } from "../combat/resources";
import type { StatusSpec } from "../combat/status";
import type { ClassProgression } from "./nodes";
import type { PathUnlockDef } from "./unlocks";
import type { PilotClass } from "./class";

// --- resources ----------------------------------------------------------

/** Conviction — earned by stopping harm, spent on the biggest protective plays. */
export const PALADIN_CONVICTION: ResourceSpec = {
  id: "conviction",
  label: "Conviction",
  max: 100,
  start: "empty",
  ui: "bar",
  decayPerSec: 3,
  decayDelay: 6,
  generation: [
    { on: "damagePrevented", amount: 50, perUnit: "maxHealthFraction" },
    { on: "block", amount: 6 },
    { on: "hitDealt", amount: 2, requireTags: ["holy"] },
  ],
  thresholds: [{ at: 60, whileAbove: { wardPower: 0.15, healthPercent: 0.05 } }],
};

/** Grace — a gentler pool built by healing allies, spent on cleanses and revives. */
export const PALADIN_GRACE: ResourceSpec = {
  id: "grace",
  label: "Grace",
  max: 100,
  start: "empty",
  ui: "pips",
  regenPerSec: 2,
  generation: [{ on: "skillUse", amount: 5, requireTags: ["heal"] }],
};

export const PALADIN_ULTIMATE_METER: ResourceSpec = {
  id: "ultimate",
  label: "Last Light",
  max: 100,
  start: "empty",
  ui: "meter",
  isUltimateMeter: true,
  generation: [
    { on: "damagePrevented", amount: 40, perUnit: "maxHealthFraction" },
    { on: "skillUse", amount: 2, requireTags: ["barrier"] },
  ],
};

export const PALADIN_RESOURCES: readonly ResourceSpec[] = [
  PALADIN_CONVICTION,
  PALADIN_GRACE,
  PALADIN_ULTIMATE_METER,
];

// --- statuses ---------------------------------------------------------

/** Blessed — Radiant Strike's mark: allied heals that touch this target are amplified. */
export const STATUS_BLESSED = {
  id: "blessed",
  label: "Blessed",
  glyph: "+",
  category: "buff",
  tags: ["holy", "support"],
  baseDuration: 8,
  maxStacks: 1,
  refreshRule: "refresh",
  mods: { lifeOnHit: 2 },
} as const satisfies StatusSpec;

/** Judged — Judgement's debuff: the enemy takes more damage from everyone, and the party knows it. */
export const STATUS_JUDGED = {
  id: "judged",
  label: "Judged",
  glyph: "J",
  category: "debuff",
  tags: ["holy", "vulnerable", "mark"],
  baseDuration: 6,
  maxStacks: 1,
  refreshRule: "refresh",
  amplify: 1.2,
} as const satisfies StatusSpec;

/** Under Oath — the Paladin's Last Light: this ally cannot be brought below 1 HP for the duration. */
export const STATUS_UNDER_OATH = {
  id: "under_oath",
  label: "Under Oath",
  glyph: "O",
  category: "buff",
  tags: ["holy", "barrier", "support"],
  baseDuration: 6,
  maxStacks: 1,
  refreshRule: "refresh",
  guardsDeath: true,
} as const satisfies StatusSpec;

export const PALADIN_STATUSES: readonly StatusSpec[] = [STATUS_BLESSED, STATUS_JUDGED, STATUS_UNDER_OATH];

// --- abilities (9 + 1) --------------------------------------------

export const PALADIN_RADIANT_STRIKE: Ability = {
  id: "paladin.radiant_strike",
  classId: "paladin",
  name: "Radiant Strike",
  description: "A holy blow that leaves the target blessed — allied healing near it lands harder.",
  flavor: "The point of the sword is to make a point.",
  category: "attack",
  tags: ["melee", "holy", "support", "resourceGenerator"],
  cooldown: 3,
  targeting: "enemy",
  range: 65,
  effects: [
    { kind: "damage", damage: { base: 1.6, scale: "attack", type: "holy", canCrit: true }, to: "target" },
    { kind: "status", status: "blessed", chance: 1, to: "allies" },
    { kind: "resource", resource: "conviction", delta: 4, to: "self" },
  ],
};

export const PALADIN_GUARDIANS_OATH: Ability = {
  id: "paladin.guardians_oath",
  classId: "paladin",
  name: "Guardian's Oath",
  description: "Swear to an ally: for a while, a large slice of the damage they would take is dealt to you instead.",
  flavor: "Stand behind me. That is the whole plan.",
  category: "support",
  tags: ["support", "barrier", "holy"],
  costs: [{ resource: "conviction", amount: 20 }],
  cooldown: 16,
  targeting: "lowestHealthAlly",
  range: 240,
  effects: [
    { kind: "redirect", fraction: 0.5, duration: 8, to: "lowestHealthAlly" },
    { kind: "shield", amount: 1, scale: "attack", to: "self", duration: 8 },
  ],
  mutationHooks: [{ id: "guardians_oath.share", kind: "replaceEffect", note: "Bodyguard raises the redirected fraction and shields the ward too." }],
};

export const PALADIN_CONSECRATED_GROUND: Ability = {
  id: "paladin.consecrated_ground",
  classId: "paladin",
  name: "Consecrated Ground",
  description: "Hallow a patch of floor. Allies standing on it are healed steadily; undead and demons are not welcome.",
  flavor: "A good place to make a stand.",
  category: "terrain",
  tags: ["zone", "heal", "support", "holy"],
  costs: [{ resource: "grace", amount: 25 }],
  cooldown: 18,
  targeting: "point",
  range: 200,
  effects: [
    { kind: "zone", zone: { radius: 120, duration: 10, tickInterval: 1, follows: false, mergeable: true, benefit: "heal" } },
    { kind: "zone", zone: { radius: 120, duration: 10, tickInterval: 1, follows: false, mergeable: false, damage: { base: 0.3, scale: "spell", type: "holy", channel: "periodic" } } },
  ],
  mutationHooks: [{ id: "consecrated_ground.follow", kind: "zone", note: "Moving Sanctuary makes the ground follow the Paladin." }],
};

export const PALADIN_JUDGEMENT: Ability = {
  id: "paladin.judgement",
  classId: "paladin",
  name: "Judgement",
  description: "Call down a verdict on one enemy: it takes more damage from every source until the sentence lifts.",
  flavor: "Guilty. Next.",
  category: "spell",
  tags: ["ranged", "holy", "mark", "vulnerable"],
  cooldown: 8,
  targeting: "enemy",
  range: 320,
  effects: [
    { kind: "damage", damage: { base: 1.4, scale: "spell", type: "holy", canCrit: true }, to: "target" },
    { kind: "status", status: "judged", chance: 1, to: "target" },
    { kind: "resource", resource: "conviction", delta: 6, to: "self" },
  ],
};

export const PALADIN_SHIELD_OF_FAITH: Ability = {
  id: "paladin.shield_of_faith",
  classId: "paladin",
  name: "Shield of Faith",
  description: "A barrier over an ally that soaks one hit of any size, then shatters.",
  flavor: "Timing is the entire skill.",
  category: "support",
  tags: ["support", "barrier", "shield", "holy"],
  costs: [{ resource: "grace", amount: 20 }],
  cooldown: 10,
  targeting: "lowestHealthAlly",
  range: 260,
  effects: [
    { kind: "shield", amount: 999, scale: "flat", to: "lowestHealthAlly", duration: 6, absorbOneHit: true },
  ],
  mutationHooks: [{ id: "shield_of_faith.break", kind: "trigger", note: "Sanctuary detonates the shield's break into a heal pulse." }],
};

export const PALADIN_AEGIS_RUSH: Ability = {
  id: "paladin.aegis_rush",
  classId: "paladin",
  name: "Aegis Rush",
  description: "Charge to an ally or an enemy shield-first, releasing a protective pulse where you land.",
  flavor: "Arriving is half the help.",
  category: "movement",
  tags: ["charge", "movement", "support", "holy"],
  cooldown: 12,
  targeting: "point",
  range: 320,
  effects: [
    { kind: "move", style: "charge", distance: 320, iframes: 0.4 },
    { kind: "damage", damage: { base: 1.8, scale: "attack", type: "holy", canCrit: true, knockback: 80 }, to: "enemies" },
    { kind: "shield", amount: 0.8, scale: "attack", to: "allies", duration: 5 },
  ],
};

export const PALADIN_CLEANSING_FLAME: Ability = {
  id: "paladin.cleansing_flame",
  classId: "paladin",
  name: "Cleansing Flame",
  description: "Wash holy fire over your allies: every debuff it strips is turned into healing.",
  flavor: "The curse has to go somewhere. It goes into them, gently.",
  category: "support",
  tags: ["support", "heal", "cleanse", "holy"],
  costs: [{ resource: "grace", amount: 30 }],
  cooldown: 14,
  targeting: "ally",
  range: 220,
  effects: [
    { kind: "cleanse", category: "debuff", to: "allies", thenHealPerStatus: 0.12 },
    { kind: "cleanse", category: "curse", to: "allies", thenHealPerStatus: 0.2 },
    { kind: "heal", amount: 0.15, scale: "spell", to: "allies" },
  ],
};

export const PALADIN_VINDICATORS_CALL: Ability = {
  id: "paladin.vindicators_call",
  classId: "paladin",
  name: "Vindicator's Call",
  description: "Brand a group of enemies. Every hit the party lands on the branded feeds your Conviction.",
  flavor: "Point them out. The rest takes care of itself.",
  category: "spell",
  tags: ["ranged", "holy", "mark", "area", "resourceGenerator"],
  cooldown: 12,
  targeting: "radius",
  range: 260,
  shape: { radius: 140 },
  effects: [
    { kind: "status", status: "judged", chance: 1, to: "allTargets" },
    {
      kind: "reactive",
      event: "hit",
      window: 6,
      effects: [{ kind: "resource", resource: "conviction", delta: 3, to: "self" }],
    },
  ],
};

export const PALADIN_MARTYRS_GRACE: Ability = {
  id: "paladin.martyrs_grace",
  classId: "paladin",
  name: "Martyr's Grace",
  description: "Pour out your own health as healing for the whole group — more of it the harder you have been hit.",
  flavor: "Take mine. I have some to spare, apparently.",
  category: "support",
  tags: ["support", "heal", "holy"],
  costs: [{ resource: "conviction", amount: 15 }],
  cooldown: 20,
  targeting: "ally",
  range: 260,
  effects: [
    { kind: "damage", damage: { base: 0.25, scale: "flat", type: "holy", channel: "environmental" }, to: "self" },
    { kind: "heal", amount: 0.4, scale: "spell", to: "allies", overTime: { duration: 4 } },
  ],
  mutationHooks: [{ id: "martyrs_grace.return", kind: "followUp", note: "Saint's Burden reflects a share of the sacrifice back as damage." }],
};

export const PALADIN_LAST_LIGHT: Ability = {
  id: "paladin.last_light",
  classId: "paladin",
  name: "Last Light",
  description: "For a few seconds no nearby ally can fall below 1 HP. Every death you prevent this way becomes a burst of final healing.",
  flavor: "Not today. None of you.",
  category: "ultimate",
  tags: ["ultimate", "support", "barrier", "heal", "holy"],
  cooldown: 0,
  isUltimate: true,
  targeting: "ally",
  range: 300,
  effects: [
    { kind: "status", status: "under_oath", chance: 1, to: "allies" },
    { kind: "heal", amount: 0.2, scale: "spell", to: "allies" },
    {
      kind: "delay",
      seconds: 6,
      effects: [{ kind: "heal", amount: 0.35, scale: "spell", to: "allies" }],
    },
  ],
  mutationHooks: [{ id: "last_light.finale", kind: "followUp", note: "Saint of the Last Stand keeps the guard up while Conviction holds." }],
};

export const PALADIN_ABILITIES: readonly Ability[] = [
  PALADIN_RADIANT_STRIKE,
  PALADIN_GUARDIANS_OATH,
  PALADIN_CONSECRATED_GROUND,
  PALADIN_JUDGEMENT,
  PALADIN_SHIELD_OF_FAITH,
  PALADIN_AEGIS_RUSH,
  PALADIN_CLEANSING_FLAME,
  PALADIN_VINDICATORS_CALL,
  PALADIN_MARTYRS_GRACE,
  PALADIN_LAST_LIGHT,
];

// --- the tree ---------------------------------------------------

export const PALADIN_PROGRESSION: ClassProgression = {
  classId: "paladin",
  paths: [
    // 0 — Guardian: damage redirection and personal bulk.
    {
      name: "Guardian",
      blurb: "Be the place the hit lands instead of the person it was aimed at.",
      nodes: [
        { name: "Broad Shoulders", category: "foundation", effects: [{ kind: "mods", mods: { healthPercent: 0.1, defensePercent: 0.08 } }] },
        {
          name: "Interpose",
          category: "behavior",
          effects: [{ kind: "rule", rule: "paladin.guardian.interpose", note: "A redirected hit that would have downed the ward is halved again." }],
        },
        {
          name: "Steadfast",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "conviction", patch: { addGeneration: [{ on: "damageTaken", amount: 20, perUnit: "maxHealthFraction" }] } },
          ],
        },
        {
          name: "Wider Oath",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "guardian.wider_oath",
                label: "Guardian's Oath covers more",
                target: { abilityId: "paladin.guardians_oath" },
                ops: [
                  { kind: "targeting", setMode: "ally" },
                  { kind: "cooldown", scale: 0.85 },
                ],
              },
            },
          ],
        },
        {
          name: "Bodyguard",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "paladin.guardian.bodyguard" },
            {
              kind: "mutate",
              mutation: {
                id: "guardian.bodyguard",
                label: "Guardian's Oath → Bodyguard",
                target: { abilityId: "paladin.guardians_oath" },
                ops: [
                  {
                    kind: "replaceEffects",
                    effects: [
                      { kind: "redirect", fraction: 0.7, duration: 10, to: "allies" },
                      { kind: "shield", amount: 1.2, scale: "attack", to: "allies", duration: 10 },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    },

    // 1 — Crusader: turn protection into offense.
    {
      name: "Crusader",
      blurb: "The best shield is a very active sword.",
      nodes: [
        { name: "Righteous Fury", category: "foundation", effects: [{ kind: "mods", mods: { meleeDamage: 0.1, elementalDamage: 0.05 } }] },
        {
          name: "Smite",
          category: "behavior",
          effects: [
            {
              kind: "grantEffect",
              on: { tag: "holy" },
              effects: [{ kind: "status", status: "judged", chance: 0.4, to: "allTargets" }],
            },
          ],
        },
        {
          name: "Fervour",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "conviction", patch: { addGeneration: [{ on: "hitDealt", amount: 3, requireTags: ["holy"] }] } },
          ],
        },
        {
          name: "Consecrated Blade",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "crusader.consecrated_blade",
                label: "Radiant Strike burns the guilty",
                target: { abilityId: "paladin.radiant_strike" },
                ops: [
                  { kind: "damagePacket", scaleBase: 1.25, addExecuteMissingHealth: 0.1 },
                ],
              },
            },
          ],
        },
        {
          name: "Zeal",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "paladin.crusader.zeal" },
            {
              kind: "resourceRule",
              resource: "conviction",
              patch: { addThresholds: [{ at: 70, whileAbove: { attackSpeed: 0.15, meleeDamage: 0.2 } }] },
            },
          ],
        },
      ],
    },

    // 2 — Sanctifier: zones, ground, and preventative healing.
    {
      name: "Sanctifier",
      blurb: "Draw the safe ground before it is needed and stand your party on it.",
      nodes: [
        { name: "Hallowed", category: "foundation", effects: [{ kind: "mods", mods: { wardPower: 0.12 } }] },
        {
          name: "Wide Sanctum",
          category: "behavior",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "sanctifier.wide_sanctum",
                label: "zones grow",
                target: { withTag: "zone" },
                ops: [{ kind: "zone", scaleRadius: 1.25, scaleDuration: 1.2 }],
              },
            },
          ],
        },
        {
          name: "Offering",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "grace", patch: { regenPerSec: 4, addGeneration: [{ on: "skillUse", amount: 4, requireTags: ["support"] }] } },
          ],
        },
        {
          name: "Radiant Font",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "sanctifier.radiant_font",
                label: "Consecrated Ground pulses harder",
                target: { abilityId: "paladin.consecrated_ground" },
                ops: [
                  { kind: "zone", scaleDuration: 1.3, scaleTickInterval: 0.7 },
                ],
              },
            },
          ],
        },
        {
          name: "Sanctuary",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "paladin.sanctifier.sanctuary" },
            {
              kind: "grantEffect",
              on: { tag: "barrier" },
              effects: [{ kind: "zone", zone: { radius: 90, duration: 3, tickInterval: 1, follows: false, mergeable: true, benefit: "heal" } }],
            },
          ],
        },
      ],
    },

    // 3 — Martyr: spend yourself for the group.
    {
      name: "Martyr",
      blurb: "Your health is a shared resource. Act like it.",
      nodes: [
        { name: "Selfless", category: "foundation", effects: [{ kind: "mods", mods: { healthPercent: 0.12, lifeOnHit: 3 } }] },
        {
          name: "Take the Blow",
          category: "behavior",
          effects: [{ kind: "rule", rule: "paladin.martyr.take_the_blow", note: "Redirected damage below a threshold is fully negated." }],
        },
        {
          name: "Suffering",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "conviction", patch: { addGeneration: [{ on: "damageTaken", amount: 35, perUnit: "maxHealthFraction" }] } },
          ],
        },
        {
          name: "Painshare",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "martyr.painshare",
                label: "Martyr's Grace reflects the wound",
                target: { abilityId: "paladin.martyrs_grace" },
                ops: [
                  {
                    kind: "followUp",
                    window: 4,
                    effects: [{ kind: "damage", damage: { base: 1.5, scale: "spell", type: "holy", channel: "retaliation" }, to: "enemies" }],
                  },
                ],
              },
            },
          ],
        },
        {
          name: "Saint's Burden",
          category: "keystone",
          effects: [{ kind: "rule", rule: "paladin.martyr.saints_burden" }],
        },
      ],
    },

    // 4 — Vindicator: mark enemies, farm Conviction, punish.
    {
      name: "Vindicator",
      blurb: "Name the guilty and the whole raid's damage counts double toward your purpose.",
      nodes: [
        { name: "Accusation", category: "foundation", effects: [{ kind: "mods", mods: { ailmentChance: 0.1, skillDamage: 0.06 } }] },
        {
          name: "Prosecutor",
          category: "behavior",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "vindicator.prosecutor",
                label: "Judged enemies take even more",
                target: { withTag: "vulnerable" },
                ops: [{ kind: "status", scaleDuration: 1.4 }],
              },
            },
          ],
        },
        {
          name: "Tithe of the Guilty",
          category: "resource",
          effects: [
            { kind: "resourceRule", resource: "conviction", patch: { addGeneration: [{ on: "ailmentInflicted", amount: 3 }] } },
          ],
        },
        {
          name: "Sentence",
          category: "mutation",
          effects: [
            {
              kind: "mutate",
              mutation: {
                id: "vindicator.sentence",
                label: "Judgement executes the condemned",
                target: { abilityId: "paladin.judgement" },
                ops: [
                  { kind: "damagePacket", addExecuteMissingHealth: 0.25 },
                  { kind: "cooldown", scale: 0.8 },
                ],
              },
            },
          ],
        },
        {
          name: "Holy War",
          category: "keystone",
          effects: [
            { kind: "rule", rule: "paladin.vindicator.holy_war" },
            {
              kind: "grantEffect",
              on: { event: "kill" },
              effects: [{ kind: "resource", resource: "conviction", delta: 12, to: "self" }],
            },
          ],
        },
      ],
    },
  ],
};

// --- hybrids + archetype ------------------------------------------

export const PALADIN_UNLOCKS: readonly PathUnlockDef[] = [
  {
    id: "paladin.martyrdom",
    classId: "paladin",
    tier: "hybrid",
    name: "Martyrdom",
    description: "Damage redirected onto you by Guardian's Oath heals the ward for the same amount instead of just sparing them.",
    flavor: "Every blow you take is one they get back.",
    requires: [
      { path: "Guardian", points: 3 },
      { path: "Martyr", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "paladin.hybrid.martyrdom" },
      {
        kind: "grantEffect",
        on: { event: "damageTaken" },
        effects: [{ kind: "heal", amount: 0.05, scale: "attack", to: "lowestHealthAlly" }],
      },
    ],
    ui: { badge: "MTY" },
  },
  {
    id: "paladin.moving_sanctuary",
    classId: "paladin",
    tier: "hybrid",
    name: "Moving Sanctuary",
    description: "Consecrated Ground follows you, so the safe circle is wherever you choose to stand.",
    flavor: "The chapel travels.",
    requires: [
      { path: "Guardian", points: 3 },
      { path: "Sanctifier", points: 3 },
    ],
    effects: [{ kind: "rule", rule: "paladin.hybrid.moving_sanctuary" }],
    mutations: [
      {
        id: "moving_sanctuary.ground",
        label: "Consecrated Ground follows",
        target: { abilityId: "paladin.consecrated_ground" },
        ops: [{ kind: "zone", forceFollows: true, scaleRadius: 0.85 }],
      },
    ],
    ui: { badge: "MSN" },
  },
  {
    id: "paladin.holy_execution",
    classId: "paladin",
    tier: "hybrid",
    name: "Holy Execution",
    description: "A Judged enemy that drops low enough is struck down instantly by Radiant Strike.",
    flavor: "The sentence carries itself out.",
    requires: [
      { path: "Crusader", points: 3 },
      { path: "Vindicator", points: 3 },
    ],
    effects: [{ kind: "rule", rule: "paladin.hybrid.holy_execution" }],
    mutations: [
      {
        id: "holy_execution.strike",
        label: "Radiant Strike executes the Judged",
        target: { abilityId: "paladin.radiant_strike" },
        ops: [{ kind: "damagePacket", addExecuteMissingHealth: 0.4 }],
      },
    ],
    ui: { badge: "HEX" },
  },
  {
    id: "paladin.last_mercy",
    classId: "paladin",
    tier: "hybrid",
    name: "Last Mercy",
    description: "When Martyr's Grace drops you low, Consecrated Ground erupts under you as an emergency heal.",
    flavor: "Even the sacrifice has a safety net.",
    requires: [
      { path: "Sanctifier", points: 3 },
      { path: "Martyr", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "paladin.hybrid.last_mercy" },
      {
        kind: "grantEffect",
        on: { event: "damageTaken" },
        effects: [{ kind: "zone", zone: { radius: 100, duration: 3, tickInterval: 0.5, follows: true, mergeable: true, benefit: "heal" } }],
      },
    ],
    ui: { badge: "LMC" },
  },
  {
    id: "paladin.retributive_oath",
    classId: "paladin",
    tier: "hybrid",
    name: "Retributive Oath",
    description: "While Guardian's Oath is active, damage redirected to you is thrown straight back at whoever dealt it.",
    flavor: "A contract with a return clause.",
    requires: [
      { path: "Crusader", points: 3 },
      { path: "Guardian", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "paladin.hybrid.retributive_oath" },
      {
        kind: "grantEffect",
        on: { event: "damageTaken" },
        effects: [{ kind: "damage", damage: { base: 0.6, scale: "attack", type: "holy", channel: "retaliation" }, to: "enemies" }],
      },
    ],
    ui: { badge: "RTO" },
  },
  {
    id: "paladin.zealous_martyr",
    classId: "paladin",
    tier: "hybrid",
    name: "Zealous Martyr",
    description: "Spending Conviction on a sacrifice refunds a burst of it if the heal saves an ally from a killing blow.",
    flavor: "Faith rewarded is faith renewed.",
    requires: [
      { path: "Vindicator", points: 3 },
      { path: "Martyr", points: 3 },
    ],
    effects: [
      { kind: "rule", rule: "paladin.hybrid.zealous_martyr" },
      {
        kind: "resourceRule",
        resource: "conviction",
        patch: { addGeneration: [{ on: "damagePrevented", amount: 30, perUnit: "maxHealthFraction" }] },
      },
    ],
    ui: { badge: "ZMT" },
  },
  {
    id: "paladin.saint_of_the_last_stand",
    classId: "paladin",
    tier: "mythic",
    name: "Saint of the Last Stand",
    description:
      "Healing zones grow stronger from every point of damage you absorb, and while your Conviction holds, allies under Last Light simply cannot die — the ultimate stops being a window and becomes a state.",
    flavor: "The line does not break while you are standing on it.",
    requires: [
      { path: "Guardian", points: 6 },
      { path: "Martyr", points: 4 },
      { path: "Sanctifier", points: 4 },
    ],
    effects: [{ kind: "rule", rule: "paladin.mythic.saint_of_the_last_stand" }],
    mutations: [
      {
        id: "saint.last_light",
        label: "Last Light → Saint of the Last Stand",
        target: { abilityId: "paladin.last_light" },
        ops: [
          { kind: "status", scaleDuration: 1.6 },
          {
            kind: "followUp",
            window: 8,
            effects: [
              { kind: "status", status: "under_oath", chance: 1, to: "allies" },
              { kind: "zone", zone: { radius: 160, duration: 8, tickInterval: 0.5, follows: true, mergeable: false, benefit: "heal" } },
            ],
          },
        ],
      },
    ],
    ui: { badge: "SNT" },
  },
];

// --- the assembled class --------------------------------------

export const PALADIN: PilotClass = {
  classId: "paladin",
  name: "Paladin",
  fantasy: "Holy protector who prevents damage, redirects attacks, heals allies and turns protection into Conviction.",
  role: "Off-tank / protector / emergency healer.",
  question: "How much damage can I prevent from ever reaching my party?",
  resources: PALADIN_RESOURCES,
  statuses: PALADIN_STATUSES,
  abilities: PALADIN_ABILITIES,
  progression: PALADIN_PROGRESSION,
  unlocks: PALADIN_UNLOCKS,
};
