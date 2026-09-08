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
import { BOSSES } from "./bosses";
import { CHEST_TIERS, chestName, type ChestTier } from "./chests";
import { CLASS_IDS } from "./classes";
import { DELVE_BOTTOM, legendName } from "./legends";
import { ELEMENTS, type Element } from "./elements";
import type { ItemType, TriggerSpec } from "./items";
import { requirementLabel, type ItemRequirement } from "./crafting";
import { MATERIAL_NAMES, type MaterialBag } from "./materials";
import { MODES, RUN_MODES, type RunModeId } from "./modes";
import { MOD_KEYS, type ModKey } from "./mods";
import { PLANETS } from "./planets";
import { RARITIES, type Rarity } from "./rarity";

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
 * Where a named item comes from. Every roll site reads this table; nothing else in the
 * game names an item. `chance` is per qualifying event (a boss kill, a chest pull, a
 * floor clear, a monster kill) before `namedDropChance` scales it by danger.
 */
export type NamedSource =
  /** Drops when this boss dies — `BossSpec.id`, or `planet-<planetId>` for a sector boss. */
  | { readonly kind: "boss"; readonly bossId: string; readonly chance: number }
  /** Rolls out of a chest of this tier, alongside the ordinary pull. */
  | { readonly kind: "chest"; readonly tier: ChestTier; readonly chance: number }
  /** Lands in the clear cache of a floor at least this deep, optionally in one mode only. */
  | { readonly kind: "clearCache"; readonly minDepth: number; readonly chance: number; readonly mode?: RunModeId }
  /** Any wave monster at least this deep. Elites triple the odds. */
  | { readonly kind: "worldDrop"; readonly minDepth: number; readonly chance: number }
  /**
   * Forged on demand for these materials and coins (UAT §25 named crafting), plus any
   * `items` consumed from the stash (UAT §24 — "boss drop + materials + N items = named").
   */
  | {
      readonly kind: "craft";
      readonly materials: Partial<MaterialBag>;
      readonly coins: number;
      readonly items?: readonly ItemRequirement[];
    };

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
];

export const NAMED_BY_ID: Readonly<Record<string, NamedItemDef>> = Object.fromEntries(
  NAMED_ITEMS.map((d) => [d.id, d]),
);

export function isNamedId(id: unknown): id is string {
  return typeof id === "string" && id in NAMED_BY_ID;
}

// --- acquisition ---------------------------------------------------------------

/**
 * What a roll site is asking about. Mirrors `NamedSource` minus the numbers: a boss
 * died, a chest opened, a floor cleared, a monster fell.
 */
export type NamedDropQuery =
  | { readonly kind: "boss"; readonly bossId: string }
  | { readonly kind: "chest"; readonly tier: ChestTier }
  | { readonly kind: "clearCache"; readonly depth: number; readonly mode: RunModeId }
  | { readonly kind: "worldDrop"; readonly depth: number; readonly elite: boolean };

/** The UAT §16 hook: harder content pays better odds. Gentle, capped, one place. */
export function namedDropChance(base: number, danger = 1): number {
  const mult = Math.min(2.5, 1 + Math.log2(Math.max(1, danger)) * 0.35);
  return Math.min(1, base * mult);
}

/** True when `src` is a thing `q` could pay out. */
function sourceMatches(src: NamedSource, q: NamedDropQuery): boolean {
  switch (q.kind) {
    case "boss": return src.kind === "boss" && src.bossId === q.bossId;
    case "chest": return src.kind === "chest" && src.tier === q.tier;
    case "clearCache":
      return src.kind === "clearCache" && q.depth >= src.minDepth && (src.mode === undefined || src.mode === q.mode);
    case "worldDrop": return src.kind === "worldDrop" && q.depth >= src.minDepth;
  }
}

/**
 * Every named item this event could pay out — the pure read a drop preview wants
 * ("this boss can drop these"), with no dice involved.
 */
export function namedForSource(q: NamedDropQuery): NamedItemDef[] {
  return NAMED_ITEMS.filter((d) => d.sources.some((s) => sourceMatches(s, q)));
}

/**
 * Every (definition, source) pair this event could pay out — `namedForSource` plus the
 * source that answered it.
 *
 * The drop preview (UAT §20) needs more than the list: it needs the `chance` to quote and
 * the source to describe. Exported here rather than reimplemented there so that
 * `sourceMatches` stays the only thing in the game that decides whether a source answers
 * an event. A preview with its own matcher is a second drop table waiting to disagree
 * with this one.
 */
export function namedMatchesFor(q: NamedDropQuery): { def: NamedItemDef; src: NamedSource }[] {
  const out: { def: NamedItemDef; src: NamedSource }[] = [];
  for (const def of NAMED_ITEMS) {
    for (const src of def.sources) {
      if (src.kind !== "craft" && sourceMatches(src, q)) out.push({ def, src });
    }
  }
  return out;
}

/** Every named item with a forge recipe, in registry order. */
export function craftableNamed(): NamedItemDef[] {
  return NAMED_ITEMS.filter((d) => d.sources.some((s) => s.kind === "craft"));
}

export function craftRecipeFor(def: NamedItemDef): Extract<NamedSource, { kind: "craft" }> | null {
  return def.sources.find((s): s is Extract<NamedSource, { kind: "craft" }> => s.kind === "craft") ?? null;
}

/**
 * Rolls the table for one event. Each matching source is an independent roll, so a
 * definition listed under two sources gets two shots; an elite triples a world-drop
 * source's odds, and `danger` (rift tier × Challenger) lifts every chance through
 * `namedDropChance`. Returns the definitions that hit — the caller forges them.
 */
export function rollNamedDrops(
  q: NamedDropQuery, rng: { chance(p: number): boolean }, danger = 1,
): NamedItemDef[] {
  const out: NamedItemDef[] = [];
  for (const def of NAMED_ITEMS) {
    for (const src of def.sources) {
      if (!sourceMatches(src, q) || src.kind === "craft") continue;
      let base = src.chance;
      if (q.kind === "worldDrop" && q.elite) base *= 3;
      if (rng.chance(namedDropChance(base, danger))) {
        out.push(def);
        break;
      }
    }
  }
  return out;
}

// --- reading a definition ---------------------------------------------------------

/** Display name for a boss id, delve or planet. Falls back to the id so a typo is visible. */
export function bossDisplayName(bossId: string): string {
  const delve = BOSSES.find((b) => b.id === bossId);
  if (delve) return delve.name;
  const planet = PLANETS.find((p) => `planet-${p.id}` === bossId);
  if (planet) return planet.bossName;
  // A Proving (UAT §13): `legend-<classId>`, generated rather than authored, so it is
  // resolved rather than listed. Without this the source line would print the raw id.
  const legend = CLASS_IDS.find((id) => `legend-${id}` === bossId);
  return legend ? legendName(legend) : bossId;
}

/** "Drops from the Warden of the First Seal (12%)" — one line per source, for tooltips and previews. */
export function namedSourceLines(def: NamedItemDef): string[] {
  return def.sources.map((s) => {
    const pct = (c: number) => `${Math.round(c * 1000) / 10}%`;
    switch (s.kind) {
      case "boss": return `Drops from ${bossDisplayName(s.bossId)} (${pct(s.chance)})`;
      case "chest": return `Found in ${chestName(s.tier)} chests (${pct(s.chance)} per pull)`;
      case "clearCache":
        return `In the clear cache from depth ${s.minDepth}${s.mode ? ` in the ${MODES[s.mode].name}` : ""} (${pct(s.chance)})`;
      case "worldDrop": return `Dropped by monsters from depth ${s.minDepth} (${pct(s.chance)} per kill, elites triple)`;
      case "craft": {
        const mats = (Object.entries(s.materials) as [Element, number][])
          .filter(([, n]) => n > 0)
          .map(([e, n]) => `${n} ${MATERIAL_NAMES[e]}`);
        const parts = (s.items ?? []).map((r) => requirementLabel(r, (id) => NAMED_BY_ID[id]?.name ?? id));
        return `Forged for ${[...parts, ...mats, `${s.coins.toLocaleString()} coins`].join(", ")}`;
      }
    }
  });
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
    switch (s.kind) {
      case "boss":
        if (bossDisplayName(s.bossId) === s.bossId) out.push(`boss source "${s.bossId}" names no boss`);
        if (!(s.chance > 0 && s.chance <= 1)) out.push(`boss chance ${s.chance} is not in (0, 1]`);
        break;
      case "chest":
        if (!(CHEST_TIERS as readonly string[]).includes(s.tier)) out.push(`chest source "${s.tier}" names no chest tier`);
        if (!(s.chance > 0 && s.chance <= 1)) out.push(`chest chance ${s.chance} is not in (0, 1]`);
        break;
      case "clearCache":
        if (s.mode !== undefined && !(RUN_MODES as readonly string[]).includes(s.mode)) out.push(`clear-cache mode "${s.mode}" is not a run mode`);
        if (!(s.minDepth >= 1)) out.push("clear-cache minDepth must be >= 1");
        if (!(s.chance > 0 && s.chance <= 1)) out.push(`clear-cache chance ${s.chance} is not in (0, 1]`);
        break;
      case "worldDrop":
        if (!(s.minDepth >= 1)) out.push("world-drop minDepth must be >= 1");
        if (!(s.chance > 0 && s.chance <= 1)) out.push(`world-drop chance ${s.chance} is not in (0, 1]`);
        break;
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
