/**
 * Relics and Artifacts — UAT §19.
 *
 * A relic is **a tree node you wear**, literally: its `effects` are the class tree's own
 * `NodeEffect` vocabulary — `mods`, a skill mutation, an effect hung off a combat event,
 * a resource patch, a rule flip — and `Player.build` folds a worn relic's effects into the
 * same `ResolvedBuild` the tree, the hybrids, the archetypes and a worn named item all
 * fold into. `applyBuild`, `runBuildGrants` and the rule hooks see one build; the
 * simulation never asks "is this a relic". If you find yourself writing a `switch` on a
 * relic id, extend the vocabulary in `src/combat/` instead — once, for the tree and both
 * item tables.
 *
 * Why `NodeEffect` and not `NamedEffect`: a named item is an `Item`, so its stats ride
 * the affix list and its effect vocabulary deliberately drops `mods`. A relic is not an
 * item — no slot, no base block, no affixes — so a stat has to be able to ride the effect
 * list, or Hermes Boots' "+10% move speed and an additional dodge" could not be written.
 * Rule 3 of the spec ("avoid generic stat sticks") is then a *test*, not a type: a
 * relic-tier definition must carry at least one effect that is not `mods`, and the
 * definitions honest enough to flag themselves `statStick` may be at most a fifth of the
 * roster (`tools/relics.ts`).
 *
 * ### Two tiers, kept distinct
 *
 * | | Artifact | Relic |
 * |---|---|---|
 * | source | the Abyssal Rift, and only the Abyssal Rift | the Proving, the deepest Delve, the Abyss's top tiers |
 * | power | "this makes my build better at what it does" | "this changes how my build works" |
 * | odds | at least 1.5× a relic's (asserted as a comparison) | the aspirational chase |
 *
 * ### Slots
 *
 * Three (`RELIC_SLOTS`), per character (`Player.relics`), out of an account-wide
 * collection (`GameState.relics`). **At most one relic-tier item is worn at a time**
 * (`MAX_RELICS_WORN`); artifacts fill the rest. The relic is the build's keystone — the
 * parallel is one Mythic Archetype — and two guaranteed artifact slots are what keep
 * artifacts from going dead the day you own three relics. A single constant, and the
 * owner may loosen it.
 *
 * ### Acquisition is the table
 *
 * `sources` is the shared drop table's vocabulary (`data/drops.ts`), read by the same
 * roll sites that pay out named items. A relic may not carry a `craft` source — a relic
 * is found, never made — and every shipped definition must have at least one source some
 * site emits today, so nothing can hide behind the reserved `raid` / `tower` kinds.
 *
 * Pure data + pure functions. Imports only types and other `data/` registries.
 */

import type { NodeEffect } from "../progression/nodes";
import {
  forSource, foundSourceLines, foundSourceProblems, isLiveSource, riftBossSources, rollTable,
  provingSourcesOf, type DropQuery, type FoundSource, type TableMatch,
} from "./drops";
import { DELVE_BOTTOM } from "./legends";
import { MOD_KEYS } from "./mods";
import { RARITY_COLORS, type Rarity } from "./rarity";

// --- the schema ------------------------------------------------------------

export type RelicTier = "artifact" | "relic";

/** How many a character wears at once. */
export const RELIC_SLOTS = 3;
/** How many of those may be relic-tier. Owner-overturnable; see the file header. */
export const MAX_RELICS_WORN = 1;

/**
 * Presentation per tier. `rarity` is what the loot banner, the preview screen and the
 * pickup glow read — a relic has no `2^n` stat multiplier to earn a rarity, so this is the
 * rung it *presents* as: both above the crafting wall, both loud.
 */
export const RELIC_TIER_INFO: Record<RelicTier, { readonly label: string; readonly plural: string; readonly rarity: Rarity; readonly color: string }> = {
  artifact: { label: "Artifact", plural: "Artifacts", rarity: "divine", color: RARITY_COLORS.divine },
  relic: { label: "Relic", plural: "Relics", rarity: "unspoken", color: RARITY_COLORS.unspoken },
};

export interface RelicDef {
  /** Stable kebab-case id. Persisted in every save that owns one — never rename one that shipped. */
  readonly id: string;
  readonly name: string;
  readonly tier: RelicTier;
  /** Presents as this rarity everywhere a colour or a banner is chosen. Always `RELIC_TIER_INFO[tier].rarity`. */
  readonly rarity: Rarity;
  /** The deadpan line under the name. One sentence, dry. */
  readonly flavor: string;
  /** What it does, in plain words. Shown above the auto-described effect lines. */
  readonly description: string;
  /** The tree's own vocabulary. Mutation and rule ids are namespaced `relic.<id>.<name>`. */
  readonly effects: readonly NodeEffect[];
  readonly sources: readonly FoundSource[];
  /**
   * Atlas sprite id (`relic.<id>` by convention). Unauthored or failed to load → a tier
   * glyph tinted by the presenting rarity, never a broken screen.
   */
  readonly art?: string;
  /**
   * Rule 3's honest exception: this one really is just numbers. Counted by the gate —
   * flagged definitions may be at most a fifth of the roster, and never relic-tier.
   */
  readonly statStick?: true;
}

type Authored = Omit<RelicDef, "tier" | "rarity">;
const relic = (d: Authored): RelicDef => ({ ...d, tier: "relic", rarity: RELIC_TIER_INFO.relic.rarity });
const artifact = (d: Authored): RelicDef => ({ ...d, tier: "artifact", rarity: RELIC_TIER_INFO.artifact.rarity });

// --- odds --------------------------------------------------------------------

/** Per-source odds, so the two tiers stay in the ratio the spec asks for and one edit retunes a tier. */
export const RELIC_ODDS = {
  /** A relic from a class's Proving — repeatable, at the bottom of the Delve. */
  proving: 0.08,
  /** A relic from the Nameless at depth 25+ in the Delve. */
  nameless: 0.06,
  /** A relic from the cache that closes a depth-30+ Delve floor. */
  deepCache: 0.04,
  /** A relic from the boss that closes an Abyssal Rift of tier 8 or higher. */
  abyssDeep: 0.05,
  /** An artifact from any Abyssal Rift boss. */
  abyssBoss: 0.14,
  /** An artifact from any Abyssal Rift boss, once the tier is real. */
  abyssBossHigh: 0.16,
  /** An artifact from any Abyssal Rift clear cache — every floor, not just the last. */
  abyssCache: 0.03,
} as const;

// --- the registry -----------------------------------------------------------

/**
 * Every relic and artifact in the game. Add one here and it is live everywhere: the
 * table, the Hero screen's three slots, the Records list, the preview read, the banner.
 *
 * Lore: the Nine Circles, the Abyss, the Celestial Hierarchy and the Legends themselves
 * (`docs/game_story_worldbuilding.md`). A relic recovered from a Proving is a piece of
 * the Legend the Abyss kept — the one thing the Unfinished had that you didn't.
 */
export const RELICS: readonly RelicDef[] = [
  // ===== RELICS — build-defining ==============================================

  // ---- recovered from the Proving, by the Legend's own element ----------------
  relic({
    id: "spark-of-the-unfinished-storm",
    name: "Spark of the Unfinished Storm",
    flavor: "It was never yours to hold. It is now.",
    description: "Everything you do is lightning: half of every basic hit converts, every skill deals lightning and shocks. Your ultimate follows.",
    art: "relic.spark-of-the-unfinished-storm",
    effects: [
      { kind: "mods", mods: { lightningDamage: 0.5 } },
      {
        kind: "mutate",
        mutation: {
          id: "relic.spark-of-the-unfinished-storm.all-lightning",
          label: "Every skill deals lightning and shocks",
          target: { all: true },
          ops: [{ kind: "damagePacket", setType: "lightning", setInflict: { status: "shock", chance: 0.25 } }],
        },
      },
    ],
    sources: provingSourcesOf("lightning", RELIC_ODDS.proving),
  }),
  relic({
    id: "cinder-of-the-unfinished-pyre",
    name: "Cinder of the Unfinished Pyre",
    flavor: "Still warm. It has been waiting to finish.",
    description: "Your fire skills burn half again as hard, and any hit on a burning enemy detonates the burn as a burst of fire.",
    art: "relic.cinder-of-the-unfinished-pyre",
    effects: [
      {
        kind: "mutate",
        mutation: {
          id: "relic.cinder-of-the-unfinished-pyre.stoked",
          label: "Fire skills' burns are 50% stronger",
          target: { withTag: "fire" },
          ops: [{ kind: "status", scalePotency: 1.5 }],
        },
      },
      {
        kind: "grantEffect", on: { event: "hit" },
        note: "Hitting a burning enemy detonates the burn: a burst of fire damage to it.",
        effects: [{
          kind: "consumeStatus", status: "burn", to: "target",
          then: [{ kind: "damage", damage: { base: 1.1, scale: "spell", type: "fire" }, to: "target" }],
        }],
      },
    ],
    sources: provingSourcesOf("fire", RELIC_ODDS.proving),
  }),
  relic({
    id: "rime-of-the-unfinished-vigil",
    name: "Rime of the Unfinished Vigil",
    flavor: "The Ninth Circle is silent. This is a piece of the silence.",
    description: "Every skill chills. A chilled or frozen enemy under a quarter health is executed by your next hit.",
    art: "relic.rime-of-the-unfinished-vigil",
    effects: [
      {
        kind: "mutate",
        mutation: {
          id: "relic.rime-of-the-unfinished-vigil.hoarfrost",
          label: "Every skill chills on hit",
          target: { all: true },
          ops: [{ kind: "damagePacket", setInflict: { status: "chill", chance: 0.5 } }],
        },
      },
      { kind: "rule", rule: "relic.rime-of-the-unfinished-vigil.shatter", note: "A chilled or frozen enemy under 25% health is executed by your hit." },
    ],
    sources: provingSourcesOf("cold", RELIC_ODDS.proving),
  }),
  relic({
    id: "hymn-of-the-unfinished-choir",
    name: "Hymn of the Unfinished Choir",
    flavor: "It finished the song. You get the last verse.",
    description: "Every heal and ward you cast also strikes: holy damage to everything near you, and it leaves them Vulnerable.",
    art: "relic.hymn-of-the-unfinished-choir",
    effects: [
      {
        kind: "grantEffect", on: { tag: "heal" },
        note: "Casting a heal deals holy damage to every enemy near you and makes them Vulnerable.",
        effects: [
          { kind: "damage", damage: { base: 0.9, scale: "spell", type: "holy" }, to: "allTargets" },
          { kind: "status", status: "vulnerable", to: "allTargets", chance: 0.6 },
        ],
      },
      {
        kind: "grantEffect", on: { tag: "shield" },
        note: "Casting a ward does the same.",
        effects: [
          { kind: "damage", damage: { base: 0.9, scale: "spell", type: "holy" }, to: "allTargets" },
          { kind: "status", status: "vulnerable", to: "allTargets", chance: 0.6 },
        ],
      },
    ],
    sources: provingSourcesOf("holy", RELIC_ODDS.proving),
  }),
  relic({
    id: "venom-of-the-unfinished-garden",
    name: "Venom of the Unfinished Garden",
    flavor: "Nothing in it was planted. All of it grew.",
    description: "Every skill poisons. Your critical hits spread every poison and bleed on the target to everything around it.",
    art: "relic.venom-of-the-unfinished-garden",
    effects: [
      {
        kind: "mutate",
        mutation: {
          id: "relic.venom-of-the-unfinished-garden.everything-bites",
          label: "Every skill poisons on hit",
          target: { all: true },
          ops: [{ kind: "damagePacket", setInflict: { status: "poison", chance: 0.4 } }],
        },
      },
      {
        kind: "grantEffect", on: { event: "criticalHit" },
        note: "A critical hit spreads the target's poison and bleed to every enemy near it.",
        effects: [
          { kind: "spreadStatus", status: "poison", radius: 120, to: "target" },
          { kind: "spreadStatus", status: "bleed", radius: 120, to: "target" },
        ],
      },
    ],
    sources: [...provingSourcesOf("poison", RELIC_ODDS.proving), ...provingSourcesOf("nature", RELIC_ODDS.proving)],
  }),
  relic({
    id: "hollow-of-the-unfinished-word",
    name: "Hollow of the Unfinished Word",
    flavor: "The sentence it belongs to has not been said yet.",
    description: "Your ultimate charges far faster and hits harder. Every other skill costs half again as much.",
    art: "relic.hollow-of-the-unfinished-word",
    effects: [
      { kind: "mods", mods: { ultimateRate: 0.8, ultimatePower: 0.3 } },
      {
        kind: "mutate",
        mutation: {
          id: "relic.hollow-of-the-unfinished-word.tithe",
          label: "Every skill costs 50% more",
          target: { all: true },
          ops: [{ kind: "resource", scaleCost: 1.5 }],
        },
      },
    ],
    sources: provingSourcesOf("void", RELIC_ODDS.proving),
  }),
  relic({
    id: "sigil-of-the-unfinished-art",
    name: "Sigil of the Unfinished Art",
    flavor: "Every spell you decided not to learn, in one glyph.",
    description: "Your skills have almost no cooldown, cost double, and every cast leaves you Weakened for a moment. You are bound by your resource, not the clock.",
    art: "relic.sigil-of-the-unfinished-art",
    effects: [
      {
        kind: "mutate",
        mutation: {
          id: "relic.sigil-of-the-unfinished-art.unbound",
          label: "Cooldowns cut to 15%, costs doubled, each cast Weakens you briefly",
          target: { all: true },
          ops: [
            { kind: "cooldown", scale: 0.15 },
            { kind: "resource", scaleCost: 2 },
            { kind: "addEffect", at: "end", effects: [{ kind: "status", status: "weakened", to: "self", durationMult: 0.4 }] },
          ],
        },
      },
    ],
    sources: provingSourcesOf("arcane", RELIC_ODDS.proving),
  }),
  relic({
    id: "measure-of-the-unfinished-duel",
    name: "Measure of the Unfinished Duel",
    flavor: "It picked the range. Now you do.",
    description: "Your melee skills reach half again as far and sweep half again as wide, and everything they hit is thrown back.",
    art: "relic.measure-of-the-unfinished-duel",
    effects: [
      {
        kind: "mutate",
        mutation: {
          id: "relic.measure-of-the-unfinished-duel.long-arm",
          label: "Melee skills: +50% reach, +50% arc, knock back",
          target: { withTag: "melee" },
          ops: [
            { kind: "targeting", scaleRange: 1.5, scaleArc: 1.5 },
            { kind: "damagePacket", setKnockback: 140 },
          ],
        },
      },
    ],
    sources: provingSourcesOf("physical", RELIC_ODDS.proving),
  }),

  // ---- the Nameless, at the bottom of the authored Delve -------------------------------
  relic({
    id: "the-name-it-kept",
    name: "The Name It Kept",
    flavor: "It has no name. It kept everyone else's.",
    description: "Everything you kill rises for a few seconds and fights for you.",
    art: "relic.the-name-it-kept",
    effects: [
      {
        kind: "grantEffect", on: { event: "kill" },
        note: "Each kill raises the fallen as a spirit for 6 seconds.",
        effects: [{ kind: "summon", unit: "kept_name", count: 1, duration: 6, command: { behavior: "aggroNearest", inheritPower: 0.6 } }],
      },
    ],
    sources: [{ kind: "boss", bossId: "nameless", chance: RELIC_ODDS.nameless, mode: "delve", minDepth: 25 }],
  }),
  relic({
    id: "silence-between-sentences",
    name: "Silence Between Sentences",
    flavor: "You should not have come this far. Nothing saw you.",
    description: "You are hard to hit, and every hit you avoid blinds everything near you and drops you out of sight.",
    art: "relic.silence-between-sentences",
    effects: [
      { kind: "mods", mods: { evasion: 0.1 } },
      {
        kind: "grantEffect", on: { event: "dodge" },
        note: "Dodging blinds every enemy near you and hides you for a moment.",
        effects: [
          { kind: "status", status: "blinded", to: "allTargets", chance: 1 },
          { kind: "status", status: "stealth", to: "self", durationMult: 0.3 },
        ],
      },
    ],
    sources: [{ kind: "boss", bossId: "nameless", chance: RELIC_ODDS.nameless, mode: "delve", minDepth: 25 }],
  }),

  // ---- the deepest Delve -----------------------------------------------------------------
  relic({
    id: "sandals-of-the-swift-messenger",
    name: "Sandals of the Swift Messenger",
    flavor: "Delivered. Eventually.",
    description: "You move faster, and you carry a second dodge.",
    art: "relic.sandals-of-the-swift-messenger",
    effects: [
      { kind: "mods", mods: { moveSpeed: 0.1, dashCharges: 1 } },
      {
        kind: "grantEffect", on: { tag: "dash" },
        note: "Your dash skills also haste you for a moment.",
        effects: [{ kind: "status", status: "hasted", to: "self" }],
      },
    ],
    sources: [{ kind: "clearCache", minDepth: DELVE_BOTTOM, chance: RELIC_ODDS.deepCache, mode: "delve" }],
  }),

  // ---- the Abyss, at the top of its ladder ---------------------------------------------
  relic({
    id: "remnant-of-what-was-not",
    name: "Remnant of What Was Not",
    flavor: "It erases distinctions. Yours included.",
    description: "Everything you do is three smaller things: two more projectiles, wider arcs, each hit at six-tenths.",
    art: "relic.remnant-of-what-was-not",
    effects: [
      {
        kind: "mutate",
        mutation: {
          id: "relic.remnant-of-what-was-not.unmade",
          label: "+2 projectiles, +50% arc, every hit at 60%",
          target: { all: true },
          ops: [
            { kind: "projectile", addCount: 2 },
            { kind: "targeting", scaleArc: 1.5 },
            { kind: "damagePacket", scaleBase: 0.6 },
          ],
        },
      },
    ],
    sources: riftBossSources("abyss", RELIC_ODDS.abyssDeep, 8),
  }),

  // ===== ARTIFACTS — meaningful, limited, Abyssal ======================================

  // ---- the Nine Circles, one each ---------------------------------------------------
  artifact({
    id: "coin-of-the-first-circle",
    name: "Coin of the First Circle",
    flavor: "Limbo keeps no ledger. It kept this.",
    description: "Sometimes what you kill gets up again, on your side.",
    art: "relic.coin-of-the-first-circle",
    effects: [{
      kind: "grantEffect", on: { event: "kill" },
      note: "One kill in four raises a spirit for 4 seconds.",
      effects: [{
        kind: "random",
        choices: [
          { weight: 1, effects: [{ kind: "summon", unit: "limbo_shade", count: 1, duration: 4, command: { behavior: "aggroNearest", inheritPower: 0.4 } }] },
          { weight: 3, effects: [] },
        ],
      }],
    }],
    sources: [...riftBossSources("abyss", RELIC_ODDS.abyssBoss), { kind: "clearCache", minDepth: 1, chance: RELIC_ODDS.abyssCache, mode: "abyss" }],
  }),
  artifact({
    id: "hook-of-the-second-circle",
    name: "Hook of the Second Circle",
    flavor: "Everything wants to be closer to you. Everything.",
    description: "Your critical hits drag everything near the target toward you.",
    art: "relic.hook-of-the-second-circle",
    effects: [{
      kind: "grantEffect", on: { event: "criticalHit" },
      note: "A critical hit pulls every enemy near the target toward you.",
      effects: [{ kind: "pull", force: 160, to: "allTargets" }],
    }],
    sources: [...riftBossSources("abyss", RELIC_ODDS.abyssBoss), { kind: "clearCache", minDepth: 1, chance: RELIC_ODDS.abyssCache, mode: "abyss" }],
  }),
  artifact({
    id: "tooth-of-the-third-circle",
    name: "Tooth of the Third Circle",
    flavor: "It is never full.",
    description: "Your melee skills bite harder the more hurt the enemy already is.",
    art: "relic.tooth-of-the-third-circle",
    effects: [{
      kind: "mutate",
      mutation: {
        id: "relic.tooth-of-the-third-circle.devour",
        label: "Melee skills deal +12% of the target's missing health",
        target: { withTag: "melee" },
        ops: [{ kind: "damagePacket", addExecuteMissingHealth: 0.12 }],
      },
    }],
    sources: riftBossSources("abyss", RELIC_ODDS.abyssBoss),
  }),
  artifact({
    id: "weight-of-the-fourth-circle",
    name: "Weight of the Fourth Circle",
    flavor: "Heavy. Worth it. Probably.",
    description: "More coins, more gems, a longer reach for both — and it slows you a step.",
    art: "relic.weight-of-the-fourth-circle",
    effects: [{ kind: "mods", mods: { coinFind: 0.3, gemFind: 0.2, pickupRadius: 0.25, moveSpeed: -0.04 } }],
    statStick: true,
    sources: riftBossSources("abyss", RELIC_ODDS.abyssBoss),
  }),
  artifact({
    id: "tempo-of-the-fifth-circle",
    name: "Tempo of the Fifth Circle",
    flavor: "Wrath is a rhythm. It is being kept for you.",
    description: "Being hit hastes you.",
    art: "relic.tempo-of-the-fifth-circle",
    effects: [{
      kind: "grantEffect", on: { event: "damageTaken" },
      note: "Taking a hit hastes you for two seconds.",
      effects: [{ kind: "status", status: "hasted", to: "self" }],
    }],
    sources: [...riftBossSources("abyss", RELIC_ODDS.abyssBoss), { kind: "clearCache", minDepth: 1, chance: RELIC_ODDS.abyssCache, mode: "abyss" }],
  }),
  artifact({
    id: "candle-of-the-sixth-circle",
    name: "Candle of the Sixth Circle",
    flavor: "A false light. It still heals.",
    description: "Every heal you cast also raises a small ward on you.",
    art: "relic.candle-of-the-sixth-circle",
    effects: [{
      kind: "grantEffect", on: { tag: "heal" },
      note: "Casting a heal wards you for a slice of your attack damage.",
      effects: [{ kind: "shield", amount: 0.4, scale: "attack", duration: 3, to: "self" }],
    }],
    sources: riftBossSources("abyss", RELIC_ODDS.abyssBoss),
  }),
  artifact({
    id: "drum-of-the-seventh-circle",
    name: "Drum of the Seventh Circle",
    flavor: "The battlefield is eternal. The drum has not stopped.",
    description: "What hits you, hits back: taking damage lashes everything near you.",
    art: "relic.drum-of-the-seventh-circle",
    effects: [{
      kind: "grantEffect", on: { event: "damageTaken" },
      note: "Taking a hit deals physical damage to every enemy near you.",
      effects: [{ kind: "damage", damage: { base: 0.5, scale: "attack", type: "physical" }, to: "allTargets" }],
    }],
    sources: riftBossSources("abyss", RELIC_ODDS.abyssBoss),
  }),
  artifact({
    id: "mirror-of-the-eighth-circle",
    name: "Mirror of the Eighth Circle",
    flavor: "It shows you where you were.",
    description: "When you dodge, you slip out of sight for a moment and everything loses interest in you.",
    art: "relic.mirror-of-the-eighth-circle",
    effects: [{
      kind: "grantEffect", on: { event: "dodge" },
      note: "Dodging hides you briefly and drops every enemy's attention.",
      effects: [
        { kind: "status", status: "stealth", to: "self", durationMult: 0.2 },
        { kind: "threat", op: "drop", to: "allTargets" },
      ],
    }],
    sources: riftBossSources("abyss", RELIC_ODDS.abyssBoss),
  }),
  artifact({
    id: "frost-of-the-ninth-circle",
    name: "Frost of the Ninth Circle",
    flavor: "Loyalty, frozen where it stood.",
    description: "Your critical hits chill.",
    art: "relic.frost-of-the-ninth-circle",
    effects: [{
      kind: "grantEffect", on: { event: "criticalHit" },
      note: "A critical hit chills its target.",
      effects: [{ kind: "status", status: "chill", to: "target", chance: 1 }],
    }],
    sources: [...riftBossSources("abyss", RELIC_ODDS.abyssBoss), { kind: "clearCache", minDepth: 1, chance: RELIC_ODDS.abyssCache, mode: "abyss" }],
  }),

  // ---- the Abyss itself ---------------------------------------------------------------
  artifact({
    id: "shard-of-the-nothing",
    name: "Shard of the Nothing",
    flavor: "It went through. So will you.",
    description: "Your projectile skills pierce one more enemy.",
    art: "relic.shard-of-the-nothing",
    effects: [{
      kind: "mutate",
      mutation: {
        id: "relic.shard-of-the-nothing.through",
        label: "Projectile skills pierce +1",
        target: { withTag: "projectile" },
        ops: [{ kind: "projectile", addPierce: 1 }],
      },
    }],
    sources: riftBossSources("abyss", RELIC_ODDS.abyssBoss),
  }),
  artifact({
    id: "echo-of-the-unmade",
    name: "Echo of the Unmade",
    flavor: "One of it was never enough. Now there are two of it.",
    description: "Your projectile skills fire one more, each a little weaker.",
    art: "relic.echo-of-the-unmade",
    effects: [{
      kind: "mutate",
      mutation: {
        id: "relic.echo-of-the-unmade.twice",
        label: "Projectile skills: +1 projectile, hits at 85%",
        target: { withTag: "projectile" },
        ops: [{ kind: "projectile", addCount: 1 }, { kind: "damagePacket", scaleBase: 0.85 }],
      },
    }],
    sources: riftBossSources("abyss", RELIC_ODDS.abyssBossHigh, 3),
  }),
  artifact({
    id: "chain-of-the-unmade",
    name: "Chain of the Unmade",
    flavor: "It holds one more link than it should.",
    description: "Everything you summon comes with one more, and none of them stay as long.",
    art: "relic.chain-of-the-unmade",
    effects: [{
      kind: "mutate",
      mutation: {
        id: "relic.chain-of-the-unmade.one-more",
        label: "Summons: +1 count, 70% duration",
        target: { withTag: "summon" },
        ops: [{ kind: "summon", addCount: 1, scaleDuration: 0.7 }],
      },
    }],
    sources: riftBossSources("abyss", RELIC_ODDS.abyssBossHigh, 3),
  }),
  artifact({
    id: "whisper-of-the-nameless",
    name: "Whisper of the Nameless",
    flavor: "It said something. You felt it land.",
    description: "Your critical hits Expose the target.",
    art: "relic.whisper-of-the-nameless",
    effects: [{
      kind: "grantEffect", on: { event: "criticalHit" },
      note: "A critical hit Exposes its target: it takes more from everything after.",
      effects: [{ kind: "status", status: "exposed", to: "target", chance: 1 }],
    }],
    sources: riftBossSources("abyss", RELIC_ODDS.abyssBossHigh, 5),
  }),

  // ---- the encounters the Abyss borrows -----------------------------------------------
  artifact({
    id: "splinter-of-the-first-seal",
    name: "Splinter of the First Seal",
    flavor: "A wall, in miniature.",
    description: "Being hit sometimes shoves everything near you back.",
    art: "relic.splinter-of-the-first-seal",
    effects: [{
      kind: "grantEffect", on: { event: "damageTaken" },
      note: "One hit in three you take knocks every enemy near you back.",
      effects: [{
        kind: "random",
        choices: [
          { weight: 1, effects: [{ kind: "knockback", force: 150, to: "allTargets" }] },
          { weight: 2, effects: [] },
        ],
      }],
    }],
    sources: [{ kind: "boss", bossId: "warden", chance: RELIC_ODDS.abyssBoss, mode: "abyss" }, { kind: "boss", bossId: "choir", chance: RELIC_ODDS.abyssBoss, mode: "abyss" }],
  }),
  artifact({
    id: "fragment-of-the-choir",
    name: "Fragment of the Choir",
    flavor: "One voice. It is not yours either.",
    description: "Sometimes a skill you cast is answered by a bolt of void.",
    art: "relic.fragment-of-the-choir",
    effects: [{
      kind: "grantEffect", on: { event: "skillUse" },
      note: "One cast in four fires a void bolt where you're facing.",
      effects: [{
        kind: "random",
        choices: [
          { weight: 1, effects: [{ kind: "projectile", projectile: { damage: { base: 0.7, scale: "spell", type: "void" }, speed: 380, radius: 6, life: 1.1 } }] },
          { weight: 3, effects: [] },
        ],
      }],
    }],
    sources: [{ kind: "boss", bossId: "choir", chance: RELIC_ODDS.abyssBoss, mode: "abyss" }, { kind: "boss", bossId: "colossus", chance: RELIC_ODDS.abyssBoss, mode: "abyss" }],
  }),
  artifact({
    id: "breath-of-the-herald",
    name: "Breath of the Herald",
    flavor: "Arrived early. Left a mark.",
    description: "Your dash skills leave burning ground behind you.",
    art: "relic.breath-of-the-herald",
    effects: [{
      kind: "grantEffect", on: { tag: "dash" },
      note: "A dash skill leaves burning ground where you started.",
      effects: [{ kind: "zone", zone: { damage: { base: 0.25, scale: "spell", type: "fire" }, radius: 42, duration: 2.5, tickInterval: 0.5, status: { id: "burn", chance: 0.5 } } }],
    }],
    sources: [{ kind: "boss", bossId: "herald", chance: RELIC_ODDS.abyssBoss, mode: "abyss" }, { kind: "boss", bossId: "nameless", chance: RELIC_ODDS.abyssBoss, mode: "abyss" }],
  }),
  artifact({
    id: "stitch-of-the-colossus",
    name: "Stitch of the Colossus",
    flavor: "Load-bearing.",
    description: "Your ultimate heals you when it fires.",
    art: "relic.stitch-of-the-colossus",
    effects: [{
      kind: "grantEffect", on: { event: "ultimateUse" },
      note: "Firing your ultimate heals you for a good slice of your attack damage.",
      effects: [{ kind: "heal", amount: 1.6, scale: "attack", to: "self" }],
    }],
    sources: [{ kind: "boss", bossId: "colossus", chance: RELIC_ODDS.abyssBoss, mode: "abyss" }, { kind: "boss", bossId: "herald", chance: RELIC_ODDS.abyssBoss, mode: "abyss" }],
  }),
  artifact({
    id: "interval-of-the-keepers",
    name: "Interval of the Keepers",
    flavor: "Between one watch and the next, a breath.",
    description: "Casting a skill sometimes shakes off whatever is on you.",
    art: "relic.interval-of-the-keepers",
    effects: [{
      kind: "grantEffect", on: { event: "skillUse" },
      note: "One cast in three cleanses your debuffs.",
      effects: [{
        kind: "random",
        choices: [
          { weight: 1, effects: [{ kind: "cleanse", category: "debuff", to: "self" }, { kind: "cleanse", category: "dot", to: "self" }] },
          { weight: 2, effects: [] },
        ],
      }],
    }],
    sources: [{ kind: "clearCache", minDepth: 1, chance: RELIC_ODDS.abyssCache * 2, mode: "abyss", lastFloor: true }],
  }),
  artifact({
    id: "step-of-the-pilgrim",
    name: "Step of the Pilgrim",
    flavor: "Purgatory is walked. This helps.",
    description: "You move a little faster and your dodge comes back sooner.",
    art: "relic.step-of-the-pilgrim",
    effects: [{ kind: "mods", mods: { moveSpeed: 0.05, dashRate: 0.25 } }],
    statStick: true,
    sources: [{ kind: "clearCache", minDepth: 1, chance: RELIC_ODDS.abyssCache * 2, mode: "abyss", lastFloor: true }],
  }),
];

export const RELIC_BY_ID: Readonly<Record<string, RelicDef>> = Object.fromEntries(RELICS.map((d) => [d.id, d]));

export function isRelicId(id: unknown): id is string {
  return typeof id === "string" && id in RELIC_BY_ID;
}

export function relicsOfTier(tier: RelicTier): RelicDef[] {
  return RELICS.filter((d) => d.tier === tier);
}

// --- acquisition ---------------------------------------------------------------

/** Every relic this event could pay out, with the source it matched through — the preview read. */
export function relicMatchesFor(q: DropQuery): TableMatch<RelicDef>[] {
  return forSource(RELICS, q);
}

/** Definitions only — `relicMatchesFor` without the odds. */
export function relicsForSource(q: DropQuery): RelicDef[] {
  const seen = new Set<RelicDef>();
  for (const m of forSource(RELICS, q)) seen.add(m.def);
  return [...seen];
}

/**
 * Rolls the table for one event. `owned` is skipped — a relic the account already holds,
 * or already carries unbanked, does not drop again for the hero whose account this is.
 * (A host rolling for a remote hero passes an empty set: it cannot see their collection,
 * and a duplicate that reaches their save is a counter, not power.)
 */
export function rollRelicDrops(
  q: DropQuery, rng: { chance(p: number): boolean }, danger = 1, owned: ReadonlySet<string> = new Set(),
): RelicDef[] {
  return rollTable(RELICS, q, rng, danger, owned);
}

/** One line per source, for tooltips and the Records list. */
export function relicSourceLines(def: RelicDef): string[] {
  return foundSourceLines(def.sources);
}

// --- wearing --------------------------------------------------------------------

/**
 * Whether `id` may go into slot `slot` of `worn`. Pure: the one rule, read by the town
 * (to grey a candidate out) and by `Player.socketRelic` (to refuse it). Three reasons to
 * say no — the id isn't a relic, it's already in another slot, or it's relic-tier and
 * `MAX_RELICS_WORN` are already worn elsewhere.
 */
export function relicSocketBlocker(worn: readonly (string | null)[], slot: number, id: string): string | null {
  const def = RELIC_BY_ID[id];
  if (!def) return "That isn't a relic.";
  if (slot < 0 || slot >= RELIC_SLOTS) return "No such slot.";
  if (worn.some((w, i) => i !== slot && w === id)) return `${def.name} is already in another slot.`;
  if (def.tier === "relic") {
    const others = worn.filter((w, i) => i !== slot && w !== null && RELIC_BY_ID[w]?.tier === "relic").length;
    if (others >= MAX_RELICS_WORN) {
      return MAX_RELICS_WORN === 1
        ? "One Relic at a time. Artifacts fill the other slots."
        : `At most ${MAX_RELICS_WORN} Relics at a time.`;
    }
  }
  return null;
}

/** The effects of every worn relic, in slot order — what `Player.build` folds. */
export function wornRelicEffects(worn: readonly (string | null)[]): NodeEffect[] {
  const out: NodeEffect[] = [];
  for (const id of worn) {
    const def = id ? RELIC_BY_ID[id] : undefined;
    if (def) out.push(...def.effects);
  }
  return out;
}

/**
 * A loadout brought back to legality — unknown ids dropped, duplicates dropped, relics
 * past the cap dropped, padded or cut to `RELIC_SLOTS`. Used on load and on the wire;
 * a save from a build that allowed three relics loads wearing one.
 */
export function normalizeRelicLoadout(raw: unknown): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: RELIC_SLOTS }, () => null);
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < RELIC_SLOTS; i++) {
    const id = raw[i];
    if (!isRelicId(id)) continue;
    if (relicSocketBlocker(out, i, id) === null) out[i] = id;
  }
  return out;
}

// --- validation (the `npm run relics` gate reads this) ----------------------------------

export const RELIC_RULE_PREFIX = "relic.";

/**
 * Everything wrong with one definition, as sentences. Empty means it is well-formed as
 * data; `tools/relics.ts` adds the checks that need the live roster (tags, statuses,
 * summon units, the rule engine) and the live sim (it drops, it fires, it saves).
 */
export function relicProblems(def: RelicDef): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(def.id)) out.push(`id "${def.id}" is not kebab-case`);
  if (!def.name.trim()) out.push("no name");
  if (!def.flavor.trim()) out.push("no flavor line");
  if (!def.description.trim()) out.push("no description");
  if (def.rarity !== RELIC_TIER_INFO[def.tier].rarity) out.push(`a ${def.tier} presents as ${RELIC_TIER_INFO[def.tier].rarity}, not ${def.rarity}`);
  if (def.effects.length === 0) out.push("no effects — it would do nothing");
  if (def.sources.length === 0) out.push("no acquisition source — nothing could ever drop it");
  if (!def.sources.some(isLiveSource)) out.push("every source is reserved (raid/tower) — nothing in the game today can drop it");

  for (const s of def.sources) {
    if ((s as { kind: string }).kind === "craft") { out.push("a relic is found, never forged — no craft source"); continue; }
    out.push(...foundSourceProblems(s));
  }

  const nonMods = def.effects.filter((e) => e.kind !== "mods");
  if (def.tier === "relic" && nonMods.length === 0) out.push("a relic-tier item must do something beyond numbers (UAT §19 rule 3)");
  if (def.statStick && nonMods.length > 0) out.push("flagged statStick but carries a non-mods effect — drop the flag");
  if (!def.statStick && nonMods.length === 0) out.push("only mods and not flagged statStick — flag it or give it a behaviour");
  if (def.statStick && def.tier === "relic") out.push("a relic may not be a stat stick");

  for (const eff of def.effects) {
    switch (eff.kind) {
      case "mods":
        for (const [k, v] of Object.entries(eff.mods)) {
          if (!(MOD_KEYS as readonly string[]).includes(k)) out.push(`unknown mod key "${k}"`);
          if (typeof v !== "number" || !Number.isFinite(v)) out.push(`mod "${k}" is not a finite number`);
        }
        break;
      case "rule":
        if (!eff.rule.startsWith(`${RELIC_RULE_PREFIX}${def.id}.`)) out.push(`rule "${eff.rule}" must be namespaced "${RELIC_RULE_PREFIX}${def.id}.<name>" — a relic may not flip a class's rule`);
        break;
      case "mutate":
        if (!eff.mutation.id.startsWith(`${RELIC_RULE_PREFIX}${def.id}.`)) out.push(`mutation "${eff.mutation.id}" should be namespaced "${RELIC_RULE_PREFIX}${def.id}.<name>"`);
        if (eff.mutation.ops.length === 0) out.push(`mutation "${eff.mutation.id}" has no ops`);
        break;
      case "grantEffect":
        if (!eff.on.event && !eff.on.tag) out.push("a grantEffect must key on an event or a tag");
        if (eff.effects.length === 0) out.push("a grantEffect with no effect steps does nothing");
        if (!eff.note) out.push("a grantEffect wants a note — the tooltip line is prose, not a fallback");
        break;
      case "resourceRule":
        // A class resource is a class's own; a relic patching one only ever reaches that
        // class. Allowed, but it is the wrong tool for something every class can wear.
        out.push(`resourceRule on "${eff.resource}" only reaches one class's resource — relics are worn by all 21`);
        break;
    }
  }
  return out;
}

/** The element a relic reads as, for tinting the fallback glyph — the first element it names, else null. */
export function relicElementHint(def: RelicDef): string | null {
  for (const eff of def.effects) {
    if (eff.kind === "mutate") {
      for (const op of eff.mutation.ops) {
        if (op.kind === "damagePacket" && op.setType) return op.setType;
      }
    }
    if (eff.kind === "grantEffect") {
      for (const s of eff.effects) {
        if (s.kind === "damage") return s.damage.type;
        if (s.kind === "projectile") return s.projectile.damage.type;
        if (s.kind === "zone" && s.zone.damage) return s.zone.damage.type;
      }
    }
  }
  return null;
}
