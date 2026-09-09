/**
 * Named items — UAT §28 / §29.
 *
 * A named item is a **definition that forges an ordinary `Item`**. It is not a second
 * item type: `game/item.ts#forgeNamedItem` bakes the definition's base stats and fixed
 * affixes into the exact `stats` / `mods` every dropped item carries, so the compare
 * table, the upgrade arrows, the sell price, the save and the co-op wire all work on it
 * without knowing it is special. The only thing an `Item` remembers is `named: <id>`.
 *
 * Its *behaviour* is "a tree node you wear". `effects` are authored in the same
 * vocabulary a class tree node uses (`NodeEffect` minus the `mods` kind — stats go
 * through the affix list instead, so they show up on the sheet): a skill mutation, an
 * effect hung off a combat event, a resource-spec patch. `Player.build` folds the
 * effects of every worn named item into the same `ResolvedBuild` the tree produces, and
 * the dungeon's existing consumers — `applyBuild`, `runBuildGrants`, the rule hooks —
 * pick them up with no new code path. The simulation never asks "is this named".
 *
 * **Two different lifetimes, on purpose.** Baked `stats`/`mods` are frozen into each
 * copy the moment it drops; retuning a definition's numbers changes copies forged from
 * then on, never the ones already sitting in a stash. `effects`, `grant` and `trigger`
 * are looked up by id every time the build resolves, so those *are* live — a retune
 * lands on every copy ever dropped. See docs/named-items.md before tuning either half.
 *
 * Acquisition is declarative: a definition names its sources and the existing roll
 * sites (`Dungeon` kill drops and the clear cache, `GameState.openChests`,
 * `GameState.craftNamed`) read the table. No boss, chest or forge code ever names an
 * item. `namedForSource` is the pure read the §20 drop previews will build on.
 *
 * Pure data + pure functions. No DOM, no `GameState`. The only imports from outside
 * `data/` are types.
 */

import type { EffectStep } from "../combat/ability";
import type { ResourceId } from "../combat/resources";
import type { SkillTag } from "../combat/tags";
import type { CombatEventType } from "../combat/triggers";
import type { SkillMutation } from "../progression/mutations";
import type { ResourceRulePatch } from "../progression/nodes";
import { CLASS_IDS } from "./classes";
import {
  bossDisplayName, dropChance, forSource, foundSourceLines, foundSourceProblems, rollTable,
  type CraftSource, type DropQuery, type DropSource,
} from "./drops";
import { DELVE_BOTTOM } from "./legends";
import { ELEMENTS, type Element } from "./elements";
import type { ItemType, TriggerSpec } from "./items";
import { requirementLabel } from "./crafting";
import { MATERIAL_NAMES } from "./materials";
import { MOD_KEYS, type ModKey } from "./mods";
import { RARITIES, type Rarity } from "./rarity";

export { bossDisplayName };

// --- the schema ------------------------------------------------------------

/**
 * One fixed affix on a named item. `value` is either exact or an inclusive range rolled
 * per copy, so two drops of the same item are close but not identical.
 *
 * `scale: "rarity"` multiplies the value by the item's `2^n` rarity multiplier and its
 * item-level scale, exactly like a `"rarity"`-scaled pool affix — use it for flat stats
 * (attack, defense, health, thorns, life on hit) that have to keep pace with the base
 * item. `"flat"` (the default) writes the value as-is — use it for every percentage.
 */
export interface NamedModSpec {
  readonly key: ModKey;
  readonly value: number | readonly [number, number];
  readonly scale?: "rarity" | "flat";
}

/**
 * The behaviour vocabulary. Deliberately the tree's own (`progression/nodes.ts`
 * `NodeEffect`) minus `mods`, which a named item expresses as affixes instead:
 *
 * - `mutate`        — §29 "Skill Effects": rewrite existing abilities by id or tag
 *                     (extra projectile, cooldown, cost, damage type, an added step).
 * - `grantEffect`   — §29 "Passive Effects": effect steps fired on a combat event
 *                     (`hit`, `kill`, `dodge`, `damageTaken`, `skillUse`,
 *                     `ultimateUse`, `enemyDeath`) or on every cast carrying a tag.
 * - `resourceRule`  — §29 "Basic — resource modifications": patch a class resource.
 * - `rule`          — a named keystone flip the rule engine may react to. **v1 rule:
 *                     ids must be namespaced `named.<defId>.<name>`.** A named item may
 *                     not flip a *class's* rule — `progression/audit.ts` guarantees every
 *                     class rule id belongs to exactly one class and only walks class
 *                     defs, so a named item borrowing `berserker.foo` would bypass that
 *                     guarantee invisibly. Cross-class keystone theft as a chase mechanic
 *                     is a deliberate v2 idea, not a v1 feature; `tools/named.ts` asserts
 *                     the namespace.
 */
export type NamedEffect =
  | { readonly kind: "mutate"; readonly mutation: SkillMutation }
  | {
      readonly kind: "grantEffect";
      readonly on: { readonly tag?: SkillTag; readonly event?: CombatEventType };
      readonly effects: readonly EffectStep[];
      /** The tooltip line. Write one — the auto-description is a fallback, not prose. */
      readonly note?: string;
    }
  | { readonly kind: "resourceRule"; readonly resource: ResourceId; readonly patch: ResourceRulePatch }
  | { readonly kind: "rule"; readonly rule: string; readonly note?: string };

/**
 * Where a named item comes from — the shared drop table's vocabulary (`data/drops.ts`),
 * which relics read too. Every roll site reads this table; nothing else in the game
 * names an item. `chance` is per qualifying event (a boss kill, a chest pull, a floor
 * clear, a monster kill) before `dropChance` scales it by danger. `craft` is the one
 * source a relic may not have: forged on demand for materials, coins and stash items
 * (UAT §25, §24).
 */
export type NamedSource = DropSource;

export interface NamedItemDef {
  /** Stable kebab-case id. It is persisted on every copy — never rename one that shipped. */
  readonly id: string;
  readonly name: string;
  /** The deadpan line under the name. One sentence, dry. */
  readonly flavor: string;
  /** What it does, in plain words. Shown above the auto-described effect lines. */
  readonly description: string;
  readonly rarity: Rarity;
  readonly type: ItemType;
  /** Multiplier on the type's ordinary base stat block at this rarity. Default 1. */
  readonly statScale?: number;
  readonly mods: readonly NamedModSpec[];
  /**
   * Extra affixes rolled from the ordinary pool, on top of the fixed ones. Boss-exclusives
   * carry one or two so a second kill can roll a better copy (§15's "reason to farm");
   * chest, craft and world-drop items may stay at zero when a fixed roll reads better.
   */
  readonly randomMods?: number;
  /** A granted ability id — the epic+ granted-skill slot, made deterministic. */
  readonly grant?: string;
  /** A triggered effect — the legendary+ trigger slot, made deterministic. */
  readonly trigger?: TriggerSpec;
  readonly effects?: readonly NamedEffect[];
  readonly sources: readonly NamedSource[];
  /**
   * Atlas sprite id (`named.<id>` by convention, a row in `render/atlas/manifest.ts` and a
   * PNG under `src/render/atlas/named/`). Unauthored or failed to load → the ordinary
   * type icon tinted by rarity, never a broken screen.
   */
  readonly art?: string;
  /**
   * Floor of the item level a copy forges at. A boss-exclusive first met at depth 5
   * shouldn't roll depth-5 stats forever; the drop site passes the floor's depth and
   * this lifts it.
   */
  readonly minIlvl?: number;
}

// --- the registry ----------------------------------------------------------

/** Every named item in the game. Add one here and it is live everywhere. */
export const NAMED_ITEMS: readonly NamedItemDef[] = [
  // ---- boss-exclusives: one per encounter --------------------------------
  {
    id: "the-first-seal",
    name: "The First Seal",
    flavor: "It has been standing here a while. Now it stands on your arm.",
    description: "A wall that answers every blow with a little more wall.",
    rarity: "legendary", type: "shield", statScale: 1.2,
    mods: [
      { key: "defense", value: [4, 6], scale: "rarity" },
      { key: "blockChance", value: [0.08, 0.12] },
      { key: "thorns", value: 2, scale: "rarity" },
      { key: "healthPercent", value: 0.06 },
    ],
    randomMods: 1,
    effects: [
      {
        kind: "grantEffect", on: { event: "damageTaken" },
        note: "Taking a hit raises a brief ward.",
        effects: [{ kind: "shield", amount: 0.45, scale: "attack", duration: 2.5, to: "self" }],
      },
    ],
    sources: [{ kind: "boss", bossId: "warden", chance: 0.12 }],
    art: "named.the-first-seal", minIlvl: 5,
  },
  {
    id: "choristers-idol",
    name: "Chorister's Idol",
    flavor: "Several voices. None of them yours.",
    description: "Every skill you cast is answered by two bolts of void from the choir.",
    rarity: "mythic", type: "talisman",
    mods: [
      { key: "power", value: [1.5, 2.2], scale: "rarity" },
      { key: "voidDamage", value: [0.25, 0.4] },
      { key: "skillDamage", value: 0.15 },
    ],
    randomMods: 2,
    effects: [
      {
        kind: "grantEffect", on: { event: "skillUse" },
        note: "Casting a skill fires two void bolts where you're facing.",
        effects: [{
          kind: "projectile",
          projectile: {
            damage: { base: 0.6, scale: "spell", type: "void", inflict: { status: "corruption", chance: 0.35 } },
            speed: 380, radius: 6, life: 1.1, count: 2, spread: 0.55,
          },
        }],
      },
    ],
    sources: [{ kind: "boss", bossId: "choir", chance: 0.1 }],
    art: "named.choristers-idol", minIlvl: 10,
  },
  {
    id: "gravebound-mantle",
    name: "Gravebound Mantle",
    flavor: "Held together, mostly. The stitching is load-bearing.",
    description: "Heavy, poisonous, slow. Everything you kill rots where it fell.",
    rarity: "legendary", type: "armor", statScale: 1.3,
    mods: [
      { key: "maxHealth", value: [12, 16], scale: "rarity" },
      { key: "healthPercent", value: 0.1 },
      { key: "poisonResist", value: 30 },
      // The tradeoff. A named item is allowed to cost you something.
      { key: "moveSpeed", value: -0.06 },
    ],
    randomMods: 1,
    effects: [
      {
        kind: "grantEffect", on: { event: "kill" },
        note: "Kills leave a pool of rot that poisons whatever walks through it.",
        effects: [{
          kind: "zone",
          zone: {
            damage: { base: 0.3, scale: "attack", type: "poison" },
            radius: 46, duration: 3, tickInterval: 0.5,
            status: { id: "poison", chance: 0.6 },
          },
        }],
      },
    ],
    sources: [{ kind: "boss", bossId: "colossus", chance: 0.12 }],
    art: "named.gravebound-mantle", minIlvl: 15,
  },
  {
    id: "the-early-word",
    name: "The Early Word",
    flavor: "Arrived before the rest of the sentence.",
    description: "Hands you the Volatile Flask, and everything you own that burns, burns harder.",
    rarity: "mythic", type: "staff",
    mods: [
      { key: "power", value: [1.8, 2.4], scale: "rarity" },
      { key: "fireDamage", value: [0.3, 0.45] },
      { key: "cooldownRate", value: 0.1 },
    ],
    randomMods: 1,
    grant: "alchemist.volatile_flask",
    effects: [
      {
        kind: "mutate",
        mutation: {
          id: "named.the-early-word.kindling",
          label: "Fire skills deal 25% more damage",
          target: { withTag: "fire" },
          ops: [{ kind: "damagePacket", scaleBase: 1.25 }],
        },
      },
    ],
    sources: [{ kind: "boss", bossId: "herald", chance: 0.1 }],
    art: "named.the-early-word", minIlvl: 20,
  },
  {
    id: "a-name-withheld",
    name: "A Name Withheld",
    flavor: "It knows yours.",
    description: "Crits like it has a grudge. Your ultimate leaves everything near you open.",
    rarity: "unspoken", type: "ring",
    mods: [
      { key: "critChance", value: [0.1, 0.14] },
      { key: "critDamage", value: [0.4, 0.6] },
      { key: "voidDamage", value: 0.35 },
      { key: "ultimateRate", value: 0.2 },
    ],
    randomMods: 2,
    effects: [
      {
        kind: "grantEffect", on: { event: "ultimateUse" },
        note: "Firing your ultimate marks every enemy near you Vulnerable.",
        effects: [{ kind: "status", status: "vulnerable", to: "allTargets", chance: 1 }],
      },
    ],
    sources: [{ kind: "boss", bossId: "nameless", chance: 0.08 }],
    art: "named.a-name-withheld", minIlvl: 25,
  },

  // ---- chest-only ----------------------------------------------------------
  {
    id: "keepers-ledger",
    name: "Keeper's Ledger",
    flavor: "Every coin accounted for. Most of them yours.",
    description: "Pure bookkeeping: more coins, more gems, a longer reach for both.",
    rarity: "epic", type: "ring",
    mods: [
      { key: "coinFind", value: 0.25 },
      { key: "gemFind", value: 0.15 },
      { key: "pickupRadius", value: 0.3 },
    ],
    sources: [{ kind: "chest", tier: "Legendary", chance: 0.02 }],
    art: "named.keepers-ledger",
  },

  // ---- clear cache ---------------------------------------------------------
  {
    id: "limbos-lantern",
    name: "Limbo's Lantern",
    flavor: "Lights nothing. Everything can see it.",
    description: "A quick, slippery thing for people who finish floors.",
    rarity: "epic", type: "necklace",
    mods: [
      { key: "moveSpeed", value: [0.05, 0.08] },
      { key: "evasion", value: 0.05 },
      { key: "pickupRadius", value: 0.2 },
    ],
    randomMods: 1,
    sources: [{ kind: "clearCache", minDepth: 6, chance: 0.05 }],
    art: "named.limbos-lantern",
  },

  // ---- world drop ----------------------------------------------------------
  {
    id: "gluttons-grasp",
    name: "Glutton's Grasp",
    flavor: "It is never full. Neither are you.",
    description: "Feeds on every hit and gorges on every kill.",
    rarity: "legendary", type: "gloves",
    mods: [
      { key: "lifeOnHit", value: [3, 4], scale: "rarity" },
      { key: "attackSpeed", value: 0.1 },
      { key: "ailmentChance", value: 0.1 },
    ],
    randomMods: 1,
    effects: [
      {
        kind: "grantEffect", on: { event: "kill" },
        note: "Kills heal you for a slice of your attack damage.",
        effects: [{ kind: "heal", amount: 0.8, scale: "attack", to: "self" }],
      },
    ],
    sources: [{ kind: "worldDrop", minDepth: 12, chance: 0.004 }],
    art: "named.gluttons-grasp", minIlvl: 12,
  },

  // ---- craft-only (UAT §25) --------------------------------------------------
  {
    id: "threshold-brand",
    name: "Threshold Brand",
    flavor: "Forged at the Citadel from what came through the wound.",
    description: "Heaven must not descend. Hell must not ascend. Your melee skills strike as holy.",
    rarity: "mythic", type: "sword", statScale: 1.15,
    mods: [
      { key: "attack", value: 4, scale: "rarity" },
      { key: "holyDamage", value: 0.3 },
      { key: "meleeDamage", value: 0.15 },
    ],
    trigger: {
      id: "onDash-bolt", kind: "onDash", effect: "bolt", element: "holy",
      chance: 1, power: 0.9, radius: 6, count: 3,
    },
    effects: [
      {
        kind: "mutate",
        mutation: {
          id: "named.threshold-brand.consecrated-edge",
          label: "Melee skills deal holy damage",
          target: { withTag: "melee" },
          ops: [{ kind: "damagePacket", setType: "holy" }],
        },
      },
    ],
    sources: [{
      kind: "craft",
      // Both sides of the wound: something of Heaven, something of the Abyss, a lot of
      // iron — and two blades that already proved themselves, melted down for the steel.
      materials: { physical: 600, holy: 80, void: 80 },
      coins: 40_000,
      items: [{ count: 2, minRarity: "legendary", slot: "weapon" }],
    }],
    art: "named.threshold-brand",
  },

  // ---- multi-step (UAT §24/§25): a boss drop is the component ----------------------
  {
    id: "the-seal-unbroken",
    name: "The Seal Unbroken",
    flavor: "It was standing here a while. It intends to keep standing.",
    description: "The First Seal, re-forged around three more walls. What hits you hits back, and what you block is not forgotten.",
    rarity: "mythic", type: "shield", statScale: 1.3,
    mods: [
      { key: "defense", value: [6, 8], scale: "rarity" },
      { key: "blockChance", value: [0.12, 0.16] },
      { key: "thorns", value: 3, scale: "rarity" },
      { key: "healthPercent", value: 0.1 },
      { key: "holyResist", value: 25 },
    ],
    effects: [
      {
        kind: "grantEffect", on: { event: "damageTaken" },
        note: "Taking a hit raises a ward and knocks everything near you back.",
        effects: [
          { kind: "shield", amount: 0.7, scale: "attack", duration: 3, to: "self" },
          { kind: "knockback", force: 140, to: "allTargets" },
        ],
      },
    ],
    sources: [{
      kind: "craft",
      // The Warden's own shield goes in whole, with three legendary pieces of armour or
      // shield for the extra walls. Two steps: kill the Warden, then bring it here.
      materials: { physical: 400, holy: 120 },
      coins: 60_000,
      items: [
        { count: 1, named: "the-first-seal" },
        { count: 3, minRarity: "legendary", slot: "shield" },
      ],
    }],
    art: "named.the-seal-unbroken", minIlvl: 15,
  },

  // ---- the Proving: the one thing at the bottom of the Delve ----------------
  {
    id: "proof-of-the-whole",
    name: "Proof of the Whole",
    flavor: "The part of you that was down there. It fits.",
    description: "Amplifies whatever elements you already carry, and your ultimate lands "
      + "as though the rest of you were finally in the room.",
    rarity: "mythic", type: "necklace",
    mods: [
      // Deliberately an amplifier and not a source. `elementalDamage` multiplies the
      // elements you already have (`data/mods.ts`), so this makes a themed build more
      // itself rather than telling a Legend what it should have been — which is the
      // whole fiction: what you recovered at the bottom is *your own* missing half.
      { key: "elementalDamage", value: [0.22, 0.3] },
      { key: "ultimatePower", value: [0.18, 0.26] },
      { key: "ultimateRate", value: 0.12 },
      { key: "healthPercent", value: 0.08 },
    ],
    // Two, so a second Proving can roll a better copy — the same "reason to farm" the
    // other boss-exclusives carry, and the reason the encounter stays repeatable.
    randomMods: 2,
    effects: [
      {
        kind: "grantEffect", on: { event: "ultimateUse" },
        note: "Your ultimate shields you for a moment, the way it would have if you had "
          + "always been whole.",
        effects: [{ kind: "shield", amount: 0.8, scale: "attack", duration: 4, to: "self" }],
      },
    ],
    // One source per class, generated from the roster rather than typed out: the Proving
    // boss's id is `legend-<classId>` (see `data/legends.ts`), so a class added to
    // `CLASS_IDS` gets its own drop of this for free and none can be forgotten. The odds
    // are the highest of any boss-exclusive on purpose — this is the hardest encounter in
    // the game and the only one gated behind finishing a class, so it should not also ask
    // you to be lucky. It is still not certain, because a certainty is a purchase.
    sources: CLASS_IDS.map((classId) => ({
      kind: "boss" as const, bossId: `legend-${classId}`, chance: 0.5,
    })),
    art: "named.proof-of-the-whole", minIlvl: DELVE_BOTTOM,
  },

  // ---- raid-exclusives (UAT §15) -------------------------------------------
  //
  // §15's rule, verbatim: "a specific boss should be the exclusive source of a specific
  // named item... those items cannot be obtained through normal gameplay." Two per raid,
  // and every one of them carries exactly one `raid` source and nothing else — no chest,
  // no world drop, no recipe. The second of each pair is gated behind a tier (`minTier`),
  // which is §16's "drop rarity" said as a table rather than as a second rarity curve:
  // the hardest tier of a raid drops something the first tier cannot.
  {
    id: "heavens-severance",
    name: "Heaven's Severance",
    flavor: "It was issued to enforce an order. It is enforcing a different one now.",
    description: "A holy sword that cuts what it hits and then everything standing behind it.",
    rarity: "mythic", type: "sword",
    mods: [
      { key: "attack", value: [3, 4.4], scale: "rarity" },
      { key: "holyDamage", value: [0.3, 0.45] },
      { key: "critDamage", value: [0.25, 0.4] },
      { key: "pierce", value: 1 },
    ],
    randomMods: 2,
    effects: [
      {
        kind: "grantEffect", on: { event: "hit" },
        note: "Every hit throws a line of holy light on through whatever you struck.",
        effects: [{
          kind: "projectile",
          projectile: {
            damage: { base: 0.45, scale: "attack", type: "holy" },
            speed: 520, radius: 7, life: 0.5, count: 1, spread: 0, pierce: 3,
          },
        }],
      },
    ],
    sources: [{ kind: "raid", raidId: "tyrant-of-the-first-heavens", chance: 0.16 }],
    art: "named.heavens-severance", minIlvl: 26,
  },
  {
    id: "crown-of-the-exiled",
    name: "Crown of the Exiled",
    flavor: "Still a crown. Nothing left to be a crown of.",
    description: "Rules nothing, empowers everything: your ultimate arrives harder, sooner, and with a host behind it.",
    rarity: "divine", type: "necklace",
    mods: [
      { key: "ultimatePower", value: [0.2, 0.3] },
      { key: "ultimateRate", value: [0.18, 0.26] },
      { key: "holyDamage", value: 0.3 },
      { key: "power", value: [1.6, 2.4], scale: "rarity" },
    ],
    randomMods: 2,
    effects: [
      {
        kind: "grantEffect", on: { event: "ultimateUse" },
        note: "Your ultimate calls down a judgment on everything around you and leaves it Vulnerable.",
        effects: [
          { kind: "damage", damage: { base: 1.6, scale: "spell", type: "holy" }, to: "allTargets" },
          { kind: "status", status: "vulnerable", to: "allTargets", chance: 1 },
        ],
      },
    ],
    // §16: the Tyrant's crown is the top of its table and does not exist below tier 6.
    sources: [{ kind: "raid", raidId: "tyrant-of-the-first-heavens", chance: 0.07, minTier: 6 }],
    art: "named.crown-of-the-exiled", minIlvl: 34,
  },
  {
    id: "the-ninefold-horn",
    name: "The Ninefold Horn",
    flavor: "Nine of them, grown into one another. It still knows which is which.",
    description: "Void bleeds off everything you cast, and what you kill takes the room with it.",
    rarity: "mythic", type: "talisman",
    mods: [
      { key: "power", value: [1.7, 2.5], scale: "rarity" },
      { key: "voidDamage", value: [0.28, 0.42] },
      { key: "areaSize", value: [0.12, 0.2] },
    ],
    randomMods: 2,
    effects: [
      {
        kind: "grantEffect", on: { event: "kill" },
        note: "Everything you kill collapses into a void burst.",
        effects: [{
          kind: "zone",
          zone: {
            damage: { base: 0.7, scale: "spell", type: "void" },
            radius: 78, duration: 0.6, tickInterval: 0.3,
            status: { id: "corruption", chance: 0.4 },
          },
        }],
      },
    ],
    sources: [{ kind: "raid", raidId: "minotaur-of-the-ninth-labyrinth", chance: 0.16 }],
    art: "named.the-ninefold-horn", minIlvl: 26,
  },
  {
    id: "hide-of-the-ninth-labyrinth",
    name: "Hide of the Ninth Labyrinth",
    flavor: "There are corridors in it. Do not follow them.",
    description: "Enormously heavy, and every hit you take opens a way out you did not have.",
    rarity: "divine", type: "armor", statScale: 1.35,
    mods: [
      { key: "defense", value: [5, 7], scale: "rarity" },
      { key: "maxHealth", value: [14, 20], scale: "rarity" },
      { key: "voidResist", value: 35 },
      { key: "dashCharges", value: 1 },
      // The tax. A labyrinth is not in a hurry.
      { key: "moveSpeed", value: -0.05 },
    ],
    randomMods: 2,
    effects: [
      {
        kind: "grantEffect", on: { event: "damageTaken" },
        note: "Taking a hit wraps you in a ward and pushes the room back a step.",
        effects: [
          { kind: "shield", amount: 0.7, scale: "attack", duration: 3, to: "self" },
          { kind: "damage", damage: { base: 0.5, scale: "attack", type: "void" }, to: "allTargets" },
        ],
      },
    ],
    sources: [{ kind: "raid", raidId: "minotaur-of-the-ninth-labyrinth", chance: 0.07, minTier: 6 }],
    art: "named.hide-of-the-ninth-labyrinth", minIlvl: 34,
  },
  {
    id: "the-last-fare",
    name: "The Last Fare",
    flavor: "Somebody paid it. Somebody always does.",
    description: "Cold, cheap and patient: every hit takes a little back, and every kill pays out.",
    rarity: "legendary", type: "necklace",
    mods: [
      { key: "coldDamage", value: [0.22, 0.34] },
      { key: "lifeOnHit", value: [3, 5], scale: "rarity" },
      { key: "coinFind", value: [0.15, 0.25] },
    ],
    randomMods: 1,
    effects: [
      {
        kind: "grantEffect", on: { event: "kill" },
        note: "Every kill chills whatever else is near it.",
        effects: [{ kind: "status", status: "chill", to: "allTargets", chance: 0.5 }],
      },
    ],
    sources: [{ kind: "raid", raidId: "the-ferryman", chance: 0.18 }],
    art: "named.the-last-fare", minIlvl: 12,
  },
  {
    id: "pole-of-the-three-rivers",
    name: "Pole of the Three Rivers",
    flavor: "It has touched the bottom of all three. It says nothing about what is down there.",
    description: "A long, cold reach that freezes the water under everything you strike.",
    rarity: "mythic", type: "spear",
    mods: [
      { key: "attack", value: [2.8, 4], scale: "rarity" },
      { key: "coldDamage", value: [0.3, 0.45] },
      { key: "ailmentPotency", value: [0.2, 0.3] },
      { key: "areaSize", value: 0.15 },
    ],
    randomMods: 2,
    effects: [
      {
        kind: "mutate",
        mutation: {
          id: "named.pole-of-the-three-rivers.slow-water",
          label: "Every skill chills on hit",
          target: { all: true },
          ops: [{ kind: "damagePacket", setInflict: { status: "chill", chance: 0.45 } }],
        },
      },
    ],
    // The shallowest raid, so its keystone sits at a lower tier than the deep pair's.
    sources: [{ kind: "raid", raidId: "the-ferryman", chance: 0.08, minTier: 4 }],
    art: "named.pole-of-the-three-rivers", minIlvl: 18,
  },
  {
    id: "the-war-queens-reach",
    name: "The War-Queen's Reach",
    flavor: "Every prayer for victory, answered at the same length.",
    description: "Burns what it touches and keeps touching things after it has stopped.",
    rarity: "mythic", type: "whip",
    mods: [
      { key: "attack", value: [2.6, 3.8], scale: "rarity" },
      { key: "fireDamage", value: [0.3, 0.45] },
      { key: "attackSpeed", value: [0.1, 0.16] },
      { key: "ailmentChance", value: 0.2 },
    ],
    randomMods: 2,
    effects: [
      {
        kind: "grantEffect", on: { event: "hit" },
        note: "Every hit leaves a patch of burning ground where it landed.",
        effects: [{
          kind: "zone",
          zone: {
            damage: { base: 0.3, scale: "attack", type: "fire" },
            radius: 48, duration: 2, tickInterval: 0.5,
            status: { id: "burn", chance: 0.5 },
          },
        }],
      },
    ],
    sources: [{ kind: "raid", raidId: "queen-of-the-seventh-circle", chance: 0.16 }],
    art: "named.the-war-queens-reach", minIlvl: 16,
  },
  {
    id: "edict-of-the-seventh-circle",
    name: "Edict of the Seventh Circle",
    flavor: "Signed by nobody. Enforced by everybody.",
    description: "The violent do better here: your criticals land harder and set the room alight.",
    rarity: "divine", type: "gloves",
    mods: [
      { key: "critChance", value: [0.09, 0.13] },
      { key: "critDamage", value: [0.45, 0.65] },
      { key: "fireDamage", value: 0.3 },
      { key: "meleeDamage", value: [0.15, 0.22] },
    ],
    randomMods: 2,
    effects: [
      {
        kind: "grantEffect", on: { event: "skillUse" },
        note: "Every skill you cast throws a ring of cinders out around you.",
        effects: [{
          kind: "projectile",
          projectile: {
            damage: { base: 0.55, scale: "spell", type: "fire", inflict: { status: "burn", chance: 0.4 } },
            speed: 340, radius: 7, life: 0.9, count: 6, spread: 6.28,
          },
        }],
      },
    ],
    sources: [{ kind: "raid", raidId: "queen-of-the-seventh-circle", chance: 0.07, minTier: 5 }],
    art: "named.edict-of-the-seventh-circle", minIlvl: 24,
  },
];

export const NAMED_BY_ID: Readonly<Record<string, NamedItemDef>> = Object.fromEntries(
  NAMED_ITEMS.map((d) => [d.id, d]),
);

export function isNamedId(id: unknown): id is string {
  return typeof id === "string" && id in NAMED_BY_ID;
}

// --- acquisition ---------------------------------------------------------------

/** What a roll site is asking about — the shared query (`data/drops.ts`). */
export type NamedDropQuery = DropQuery;

/** The UAT §16 hook: harder content pays better odds. One function, shared with relics. */
export const namedDropChance = dropChance;

/**
 * Every named item this event could pay out — the pure read a drop preview wants
 * ("this boss can drop these"), with no dice involved. Definitions only; see
 * `namedMatchesFor` for the source each one matched through.
 */
export function namedForSource(q: NamedDropQuery): NamedItemDef[] {
  const seen = new Set<NamedItemDef>();
  for (const m of forSource(NAMED_ITEMS, q)) seen.add(m.def);
  return [...seen];
}

/**
 * Every (definition, source) pair this event could pay out — `namedForSource` plus the
 * source that answered it.
 *
 * The drop preview (UAT §20) needs more than the list: it needs the `chance` to quote and
 * the source to describe. Exported here rather than reimplemented there so that
 * `sourceMatches` (`data/drops.ts`, shared with relics) stays the only thing in the game
 * that decides whether a source answers an event. A preview with its own matcher is a
 * second drop table waiting to disagree with this one.
 */
export function namedMatchesFor(q: NamedDropQuery): { def: NamedItemDef; src: NamedSource }[] {
  return forSource(NAMED_ITEMS, q);
}

/** Every named item with a forge recipe, in registry order. */
export function craftableNamed(): NamedItemDef[] {
  return NAMED_ITEMS.filter((d) => d.sources.some((s) => s.kind === "craft"));
}

export function craftRecipeFor(def: NamedItemDef): CraftSource | null {
  return def.sources.find((s): s is CraftSource => s.kind === "craft") ?? null;
}

/**
 * Rolls the table for one event — `rollTable` over the registry (`data/drops.ts`): each
 * matching source is an independent roll, an elite triples a world-drop source's odds,
 * `danger` lifts every chance. Returns the definitions that hit — the caller forges them.
 */
export function rollNamedDrops(
  q: NamedDropQuery, rng: { chance(p: number): boolean }, danger = 1,
): NamedItemDef[] {
  return rollTable(NAMED_ITEMS, q, rng, danger);
}

// --- reading a definition ---------------------------------------------------------

/** "Drops from the Warden of the First Seal (12%)" — one line per source, for tooltips and previews. */
export function namedSourceLines(def: NamedItemDef): string[] {
  const crafts = def.sources.filter((s): s is CraftSource => s.kind === "craft").map((s) => {
    const mats = (Object.entries(s.materials) as [Element, number][])
      .filter(([, n]) => n > 0)
      .map(([e, n]) => `${n} ${MATERIAL_NAMES[e]}`);
    const parts = (s.items ?? []).map((r) => requirementLabel(r, (id) => NAMED_BY_ID[id]?.name ?? id));
    return `Forged for ${[...parts, ...mats, `${s.coins.toLocaleString()} coins`].join(", ")}`;
  });
  return [...foundSourceLines(def.sources), ...crafts];
}

// --- validation (the `npm run named` gate reads this) -------------------------------------

export const NAMED_RULE_PREFIX = "named.";

/**
 * Everything wrong with one definition, as sentences. Empty means it is well-formed as
 * data; `tools/named.ts` adds the checks that need the live roster (ability ids, tags,
 * art) and the live sim (it actually drops and actually fires).
 */
export function namedProblems(def: NamedItemDef): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(def.id)) out.push(`id "${def.id}" is not kebab-case`);
  if (!def.name.trim()) out.push("no name");
  if (!def.flavor.trim()) out.push("no flavor line");
  if (!def.description.trim()) out.push("no description");
  if (!(RARITIES as readonly string[]).includes(def.rarity)) out.push(`unknown rarity "${def.rarity}"`);
  if (def.statScale !== undefined && !(def.statScale > 0)) out.push("statScale must be positive");
  if ((def.randomMods ?? 0) < 0) out.push("randomMods must be >= 0");
  if (def.minIlvl !== undefined && def.minIlvl < 1) out.push("minIlvl must be >= 1");
  if (def.sources.length === 0) out.push("no acquisition source — nothing could ever drop it");

  const seenKeys = new Set<string>();
  for (const m of def.mods) {
    if (!(MOD_KEYS as readonly string[]).includes(m.key)) out.push(`unknown mod key "${m.key}"`);
    if (seenKeys.has(m.key)) out.push(`mod key "${m.key}" listed twice`);
    seenKeys.add(m.key);
    if (Array.isArray(m.value)) {
      const [lo, hi] = m.value as readonly [number, number];
      if (!(lo <= hi)) out.push(`mod "${m.key}" range is inverted (${lo} > ${hi})`);
    }
  }

  for (const s of def.sources) {
    if (s.kind !== "craft") {
      out.push(...foundSourceProblems(s));
      continue;
    }
    switch (s.kind) {
      case "craft": {
        const entries = Object.entries(s.materials) as [string, number][];
        if (entries.every(([, n]) => !(n > 0)) && !(s.coins > 0) && !(s.items?.length)) out.push("craft recipe costs nothing");
        for (const [e, n] of entries) {
          if (!(ELEMENTS as readonly string[]).includes(e)) out.push(`craft recipe names unknown material "${e}"`);
          if (n < 0) out.push(`craft recipe has a negative ${e} cost`);
        }
        for (const r of s.items ?? []) {
          if (!(r.count >= 1)) out.push("a recipe item line needs count >= 1");
          if (r.minRarity !== undefined && !(RARITIES as readonly string[]).includes(r.minRarity)) out.push(`recipe item line names unknown rarity "${r.minRarity}"`);
          if (r.named !== undefined && !(r.named in NAMED_BY_ID)) out.push(`recipe item line names unknown named item "${r.named}"`);
          if (r.named === def.id) out.push("a recipe cannot require the item it makes");
        }
        // Mythic is the crafting wall (data/crafting.ts): a recipe may not make a divine or
        // unspoken any more than the ordinary forge may.
        if (RARITIES.indexOf(def.rarity) > RARITIES.indexOf("mythic")) out.push(`a craftable named item may not be ${def.rarity} — mythic is the cap`);
        break;
      }
    }
  }

  for (const eff of def.effects ?? []) {
    if (eff.kind === "rule" && !eff.rule.startsWith(`${NAMED_RULE_PREFIX}${def.id}.`)) {
      out.push(`rule "${eff.rule}" must be namespaced "${NAMED_RULE_PREFIX}${def.id}.<name>" — a named item may not flip a class's rule`);
    }
    if (eff.kind === "mutate" && !eff.mutation.id.startsWith(`${NAMED_RULE_PREFIX}${def.id}.`)) {
      out.push(`mutation "${eff.mutation.id}" should be namespaced "${NAMED_RULE_PREFIX}${def.id}.<name>"`);
    }
    if (eff.kind === "grantEffect" && !eff.on.event && !eff.on.tag) {
      out.push("a grantEffect must key on an event or a tag");
    }
    if (eff.kind === "grantEffect" && eff.effects.length === 0) {
      out.push("a grantEffect with no effect steps does nothing");
    }
  }
  return out;
}
