/**
 * Memories — the custom-rift endgame. Design record: `docs/memories.md`.
 *
 * `docs/game_story_worldbuilding.md` is the tiebreaker and it wrote this system's fiction
 * three separate times before anybody asked for the mechanic: *Purgatory is shaped by
 * memory* (the Citadel), *memories began appearing as physical locations* (the First
 * Rift), and — the sentence this whole file hangs from — **"The Reliquary does not
 * remember itself the same way twice."**
 *
 * Every floor in this game is already Purgatory remembering a place, badly, once. A
 * **Memory** is what happens when you stop letting it improvise:
 *
 * > A Memory is a recollection the Keepers pinned down: one place, held still, forced to
 * > come back the same way twice. Purgatory does not enjoy being held still. What it gives
 * > back is exactly what you asked for, and exactly as much of a fight as that cost.
 *
 * That one sentence is why the rest falls out for free — the monsters come from every
 * corner of the game because *memories bleed together*, it is an altar rather than a
 * machine because you are making Purgatory remember on purpose, and the Memory is
 * consumed because once it has been remembered out loud it is not a Memory any more.
 *
 * ### One curve, again
 *
 * `memoryConfig` hands `profileFor` an effective depth plus a `danger` and the one
 * difficulty curve does the rest. There is no memory curve and there must never be one:
 * `MODES.memory` is **neutral on every mode axis**, so an unmodified Memory at depth N is
 * a Delve floor at depth N — `tools/memories.ts` pins that as an equality, the same way
 * `tools/world.ts` pins the Tower's.
 *
 * ### No free positives
 *
 * A Memory carries two lists, as the brief describes them, under one invariant that makes
 * the system self-balancing: **`boons.length <= burdens.length`, always.** Rarity buys
 * *pairs* — one burden and one boon — so a mythic Memory can be extravagant without ever
 * being a strictly better Delve floor. Every op that adds a modifier adds a pair.
 *
 * ### What moves difficulty, and what moves payout
 *
 * Only `merciless` moves `danger`. Every other burden changes the floor's *shape* through
 * a `DepthProfile` field it already has — precisely the split `data/daily.ts` already
 * shipped (Ferocious is danger; Swarming and Hasty are shape), and the reason a burden
 * never applies itself twice.
 *
 * Boons move `quantity`, `rarityBias`, `coinMultiplier` and `xpMultiplier`, and
 * deliberately **not** the `rewardCurve` axes: those are §16's, they are capped by
 * `REWARD_CAPS`, and a boon that added to one would be an uncapped second route to a
 * capped number. A Memory climbs that curve honestly, by being more dangerous.
 *
 * Unlike the Vigil's, a Memory's own danger is **not** divided back out before
 * `rewardCurve` is asked (`data/depth.ts`). The Vigil's difficulty is the day's weather;
 * a Memory's is the most deliberately chosen difficulty in the game, and §16 is about
 * paying for difficulty you chose.
 *
 * ### Every modifier is a percentage
 *
 * Not a multiplier. The brief's "5x monster spawns, 3x rarity, 2x enemy speed" was
 * shorthand for *a meaningful increase of this kind*, and the owner's ruling on seeing it
 * built literally was explicit: **"Every modifier should be a percent increase, not a
 * three times, two times, etcetera."** So a `MemoryMod`'s stored value is the percentage
 * itself and `1 + pct / 100` is derived at the point of use — the number the player reads
 * and the number a tuner edits are the same number.
 *
 * ### The rarity ceiling, and the one place in the game it moves
 *
 * `luminous` adds into the same composed `rarityBias` sum every other source adds into —
 * not a multiplier, not a new `rewardCurve` axis, and not keyed on `danger`, so it is
 * structurally incapable of scaling the Challenger dial's own capped term.
 *
 * **A Memory is nonetheless the single exception to "difficulty never lifts the rarity
 * ceiling", and that is a deliberate, bounded, owner-level carve-out** — not a repeal.
 * `data/rewards.ts` and `data/crafting.ts` still govern everything else: the Delve, the
 * Tower, every rift, the Challenger dial and the whole forge stop where they always did.
 * The owner's reasoning, in their words: *"You do at some point want the unspokens and
 * stuff to be farmable. It's just a tradeoff. This is endgame endgame content. It's not by
 * much, but that little percent that it does raise the ceiling does make it worth it."*
 *
 * Three things keep it bounded, and `tools/memories.ts` asserts all three:
 *
 * 1. **Ordinary Memories cannot reach it.** Every Memory below `MEMORY_MAX_RARITY` is
 *    clamped to `MEMORY_RARITY_CAP`, which is deliberately *below* the Abyssal Rift's own
 *    `rarityBias` — the mode that exists to pay in rarity is still the best ordinary place
 *    to farm it.
 * 2. **The lift has to be paid for in difficulty.** Only a mythic Memory may overshoot,
 *    and only in proportion to the *square* of its burden load (`burdenLoad`), so the
 *    ceiling cannot be bought cheaply: a mythic carrying half its burdens gets a quarter
 *    of the allowance. A ludicrously rich Memory is a ludicrously hard one, which is the
 *    whole trade.
 * 3. **The overshoot is small and stated.** `MEMORY_CEILING_OVERSHOOT` puts the very best
 *    Memory a hair past the Abyss rather than into a new tier of access — see
 *    `MEMORY_CEILING_MARGIN`, which is asserted as a comparison against
 *    `MODES.abyss.rarityBias` rather than as a bare number. Unspoken stays an event.
 *
 * See `docs/memories.md` §5.2 for the full record of the decision.
 *
 * Pure data. Nothing here imports from the simulation.
 */

import { Rng } from "../core/rng";
import { BIOMES, type BiomeStyle } from "./biomes";
import { BOSSES, type BossSpec } from "./bosses";
import { challengerMultiplier } from "./challenger";
import { craftBulkCost, reforgeCoinCost } from "./crafting";
import { AFFIX_BY_ID } from "./monster-affixes";
import { MODES, type RunConfig } from "./modes";
import { PLANETS, planetBossSpec } from "./planets";
import { BASE_RARITY_BIAS, RARITIES, rarityIndex, type Rarity } from "./rarity";
import { TOWER_BIOMES, towerBossSpec } from "./tower";

// --- the tunables -----------------------------------------------------------

/** What the station and the mode are called. One place, so the screens agree. */
export const ALTAR_NAME = "The Altar";

/** Floors in one Memory, the last of which is the boss. The Avarice Rift's shape. */
export const MEMORY_FLOORS = 3;

/**
 * The active character must have banked **both** — the bottom of the descent and the top
 * of the authored ascent. The brief's own words: "after completing all the heaven and hell
 * floors for a class (or at least at a fixed point, say floor 30 for each)".
 *
 * Read off `Player.deepestDepth` and `Player.highestHeight` separately and never off
 * `Player.frontier`: the frontier is a *max*, so a height-40 character who has never seen
 * Hell would clear a frontier gate. Reading both records is what makes "the Heaven and the
 * Hell floors" mean what it says. Nothing new is recorded for this — see
 * `memoryUnlocked`.
 */
export const MEMORY_UNLOCK_DEPTH = 30;
export const MEMORY_UNLOCK_HEIGHT = 30;

/** How many Memories the Vault holds, so a save can't grow without bound. */
export const MEMORY_VAULT_CAP = 60;

/**
 * The most an *ordinary* Memory can push the rarity roll.
 *
 * Deliberately **below `MODES.abyss.rarityBias`** — `tools/memories.ts` asserts that as a
 * comparison rather than checking this constant against a number, so retuning the Abyss
 * retunes this ceiling with it. Below mythic, this is the whole story: a Memory is broad,
 * the Abyss is the specialist, and the mode that exists to pay in rarity stays the best
 * ordinary place to farm it.
 */
export const MEMORY_RARITY_CAP = 0.12;

/**
 * How far past that ceiling a **mythic** Memory may reach — the carve-out, and the only
 * place in the game where difficulty lifts the rarity ceiling at all.
 *
 * Granted in proportion to `burdenLoad` *squared*, so the allowance is bought with
 * difficulty rather than with rarity alone: a mythic carrying half its burden load gets a
 * quarter of this. At the very top it puts a Memory `MEMORY_CEILING_MARGIN` past the
 * Abyssal Rift — measurably better, nowhere near a different tier of access. In practice
 * that moves unspoken from roughly one in four hundred on a deep Abyss floor to roughly
 * one in three hundred on the best Memory ever rolled. Still an event.
 */
export const MEMORY_CEILING_OVERSHOOT = 0.06;

/**
 * How far past the Abyssal Rift the very best Memory is allowed to land. Not a knob —
 * it is `MEMORY_RARITY_CAP + MEMORY_CEILING_OVERSHOOT - MODES.abyss.rarityBias`, written
 * down so "not by much" is a number the acceptance tool can hold us to rather than an
 * aspiration in a comment.
 */
export const MEMORY_CEILING_MARGIN = 0.02;

/**
 * The rarities a Memory comes in. Six of the eight: divine and unspoken are the *item*
 * ladder's long tail and nothing else, and `data/rarity.ts`'s "keep it absurd" rule plus
 * `data/crafting.ts`'s mythic wall would both read as decorative if a second system
 * started minting the top two on demand.
 */
export const MEMORY_MAX_RARITY: Rarity = "mythic";
export const MEMORY_RARITIES: readonly Rarity[] = RARITIES.slice(0, rarityIndex(MEMORY_MAX_RARITY) + 1);

/** How many burden/boon pairs a Memory of each rarity carries, and the best grade it rolls. */
const PAIRS: Record<Rarity, number> = {
  common: 1, uncommon: 2, rare: 2, epic: 3, legendary: 3, mythic: 4,
  divine: 4, unspoken: 4,
};
const MAX_GRADE: Record<Rarity, number> = {
  common: 1, uncommon: 1, rare: 2, epic: 2, legendary: 3, mythic: 3,
  divine: 3, unspoken: 3,
};

export function memoryPairs(rarity: Rarity): number {
  return PAIRS[rarity];
}
export function memoryMaxGrade(rarity: Rarity): number {
  return MAX_GRADE[rarity];
}

/** How far a Memory's depth is drawn around the account's frontier when it is recalled. */
export const MEMORY_DEPTH_BELOW = 5;
export const MEMORY_DEPTH_ABOVE = 3;
/** Depth a `deepen` adds. The Memory gets older and less forgiving. */
export const MEMORY_DEEPEN_STEP = 2;

// --- the vocabulary ---------------------------------------------------------

/** Grades a modifier rolls at. Roman numerals in the UI; 1-3 here. */
export type MemoryGrade = 1 | 2 | 3;

export type MemoryBoonId = "abundant" | "luminous" | "gilded" | "storied";
export type MemoryBurdenId =
  | "merciless" | "obdurate" | "teeming" | "quickened"
  | "unreadable" | "hunted" | "armored" | "spiteful";

/**
 * How a family expresses its magnitude.
 *
 * `percent` is the rule and the default — see the file header. The two exceptions are
 * honest ones rather than backsliding: `count` is a flat addition to a *count* (the elite
 * quota, where "+250%" of one elite is not a thing a floor can spawn — `data/daily.ts`'s
 * Elite Hunt is a flat +2 for the identical reason), and `affix` names monster affix ids,
 * which have no magnitude at all.
 */
export type MemoryMagnitude = "percent" | "count" | "affix";

/** One rolled modifier: which family, and how badly. */
export interface MemoryMod<Id extends string> {
  readonly id: Id;
  readonly grade: MemoryGrade;
}

export interface MemoryBoon {
  readonly id: MemoryBoonId;
  readonly name: string;
  /** One dry line for the Altar. Says what it does, not what it is worth. */
  readonly blurb: string;
  readonly magnitude: MemoryMagnitude;
  /**
   * The percentage increase at each grade, 1-indexed at [0]. A percentage, never a
   * multiplier — `1 + pct / 100` is derived where it is used. `luminous` is a percentage
   * *of the game's base rarity bias* (`BASE_RARITY_BIAS`), which is what makes a rarity
   * lean expressible in the same unit as everything else.
   */
  readonly pct: readonly [number, number, number];
}

export interface MemoryBurden {
  readonly id: MemoryBurdenId;
  readonly name: string;
  readonly blurb: string;
  readonly magnitude: MemoryMagnitude;
  /** The percentage at each grade — an increase, or for `unreadable` a tightening. */
  readonly pct: readonly [number, number, number];
  /**
   * Monster affix ids (`data/monster-affixes.ts`) forced onto every wave monster, growing
   * with the grade. The brief asked for "all enemies Armored" by name; this is the whole
   * mechanism, and it is the one place a Memory reaches into the simulation.
   */
  readonly affixes?: readonly [readonly string[], readonly string[], readonly string[]];
}

/** A percentage increase as the multiplier it stands for. The one conversion site. */
export function pctMult(pct: number): number {
  return 1 + pct / 100;
}

/**
 * What the Memory kept.
 *
 * Four families and four maximum pairs is not a coincidence: a mythic Memory carries one
 * of each and there are no duplicates to stack. Every field named here is one
 * `DepthProfile` already composes, which is why none of this needed a new reward axis.
 */
export const MEMORY_BOONS: Record<MemoryBoonId, MemoryBoon> = {
  abundant: {
    id: "abundant", name: "Abundant", magnitude: "percent",
    blurb: "It remembers more than was there. Everything drops more of everything.",
    pct: [25, 45, 70],
  },
  luminous: {
    id: "luminous", name: "Luminous", magnitude: "percent",
    blurb: "It remembers the good day. The table leans hard toward the top end.",
    // A percentage of `BASE_RARITY_BIAS`. Grade III deliberately *asks* for more than
    // `MEMORY_RARITY_CAP` allows: only a fully-burdened mythic Memory is ever permitted to
    // receive the difference (see `memoryRarityAllowance`), which is what makes the
    // ceiling something you pay for in difficulty rather than something you roll.
    pct: [80, 180, 320],
  },
  gilded: {
    id: "gilded", name: "Gilded", magnitude: "percent",
    blurb: "Somebody was paid here, and it has not stopped paying.",
    pct: [30, 55, 85],
  },
  storied: {
    id: "storied", name: "Storied", magnitude: "percent",
    blurb: "This one mattered. Surviving it teaches more than it should.",
    pct: [20, 35, 55],
  },
};

/**
 * What it got wrong.
 *
 * Every one of these is a multiplier on a knob that already exists — the rule
 * `data/daily.ts` states about itself: nothing here adds behaviour to the simulation. The
 * two affix-forcing burdens are the exception and they add no vocabulary either: they
 * force existing ids from `data/monster-affixes.ts`.
 */
export const MEMORY_BURDENS: Record<MemoryBurdenId, MemoryBurden> = {
  merciless: {
    id: "merciless", name: "Merciless", magnitude: "percent",
    blurb: "It remembers losing. Everything here hits harder and lasts longer.",
    // The one burden that moves `danger`, so it is the one that compounds through every
    // formula at once. Deliberately the gentlest percentages in the table for that reason.
    pct: [12, 25, 40],
  },
  obdurate: {
    id: "obdurate", name: "Obdurate", magnitude: "percent",
    blurb: "Nothing in it wants to be finished. Health, and a great deal of it.",
    pct: [45, 90, 150],
  },
  teeming: {
    id: "teeming", name: "Teeming", magnitude: "percent",
    blurb: "It remembers the crowd. Every wave arrives with the crowd.",
    pct: [25, 50, 80],
  },
  quickened: {
    id: "quickened", name: "Quickened", magnitude: "percent",
    blurb: "It is running at the wrong speed. So is everything standing in it.",
    pct: [10, 20, 32],
  },
  unreadable: {
    id: "unreadable", name: "Unreadable", magnitude: "percent",
    blurb: "The wind-ups are half-remembered. Read faster.",
    // A tightening rather than an increase: the wind-up and the gap between swings both
    // shrink by this percentage. Reaction time is the thing skill actually spends, so the
    // numbers here stay small — see `data/depth.ts` on why the deep floors squeeze it.
    pct: [12, 20, 28],
  },
  hunted: {
    id: "hunted", name: "Hunted", magnitude: "count",
    blurb: "Something was in charge here. Several somethings, and the floor wants them dead.",
    pct: [1, 2, 3],
  },
  armored: {
    id: "armored", name: "Armored", magnitude: "affix",
    blurb: "It remembers them wearing the plate. All of them, all of the time.",
    pct: [0, 0, 0],
    affixes: [["stony"], ["stony", "vicious"], ["stony", "vicious", "warded"]],
  },
  spiteful: {
    id: "spiteful", name: "Spiteful", magnitude: "affix",
    blurb: "Nothing here died quietly the first time either.",
    pct: [0, 0, 0],
    affixes: [["volatile"], ["volatile", "miasmic"], ["volatile", "miasmic", "vengeful"]],
  },
};

export const MEMORY_BOON_IDS = Object.keys(MEMORY_BOONS) as readonly MemoryBoonId[];
export const MEMORY_BURDEN_IDS = Object.keys(MEMORY_BURDENS) as readonly MemoryBurdenId[];

/** "Abundant II". The one place a grade becomes a numeral. */
const GRADE_NUMERALS = ["I", "II", "III"] as const;
export function memoryModLabel(name: string, grade: MemoryGrade): string {
  return `${name} ${GRADE_NUMERALS[grade - 1] ?? String(grade)}`;
}

/**
 * What one rolled modifier is worth, in words: "+45%", "+2 elites", "Armored". The one
 * place a magnitude becomes a string, so the Altar cannot invent a unit the data doesn't
 * have — and so a percentage is never rendered as a multiplier.
 */
export function memoryModMagnitude(mod: MemoryMod<MemoryBoonId | MemoryBurdenId>): string {
  const def = (MEMORY_BOONS as Record<string, MemoryBoon | MemoryBurden>)[mod.id]
    ?? (MEMORY_BURDENS as Record<string, MemoryBoon | MemoryBurden>)[mod.id];
  if (!def) return "";
  const v = def.pct[mod.grade - 1] ?? 0;
  if (def.magnitude === "count") return `+${v} elite${v === 1 ? "" : "s"} owed`;
  if (def.magnitude === "affix") {
    const forced = (def as MemoryBurden).affixes?.[mod.grade - 1] ?? [];
    return forced.map((id) => AFFIX_BY_ID[id]?.name ?? id).join(", ");
  }
  return mod.id === "unreadable" ? `−${v}% wind-up` : `+${v}%`;
}

// --- the instance -----------------------------------------------------------

/**
 * One Memory in the Vault.
 *
 * Deliberately carries no stored profile, no stored difficulty and no stored reward
 * table: every number it produces is computed by `memoryEffects` at the moment
 * `profileFor` asks, so retuning the vocabulary above retunes every Memory already sitting
 * in the Vault. (`docs/named-items.md`'s two-lifetimes question, resolved the other way
 * and on purpose — a Memory is spent within minutes of being made.)
 */
export interface MemoryInstance {
  /** Local id, so the Altar can address one. Unique within the Vault. */
  readonly id: string;
  readonly rarity: Rarity;
  /** Effective depth of floor 1. Floors 2 and 3 add one each. */
  readonly depth: number;
  /** Which place this is a memory *of* — `memoryPlaces()` by name. */
  readonly placeId: string;
  /** What is waiting on the last floor — `memoryEncounters()` by id. */
  readonly bossId: string;
  readonly burdens: readonly MemoryMod<MemoryBurdenId>[];
  readonly boons: readonly MemoryMod<MemoryBoonId>[];
}

// --- where the monsters and bosses come from --------------------------------

/**
 * Every place the game owns, as one list: the Delve's biomes, the Tower's three bands and
 * every Reliquary sector's.
 *
 * This is the brief's "randomly from every piece of content available in the game", and
 * it is also the fiction — memories bleed together, so a Hell cathedral with the
 * Reliquary's wildlife in it is the system working rather than a seam showing. A place
 * brings its palette, props, layouts, traps, elemental affinity and roster names, so a
 * Memory of the Seamless Halls has Thrones and Dominions in it and one of a Delve circle
 * does not — the same trick `PlanetSpec.enemyNames` and the Tower bands already play.
 *
 * Nothing new is authored, which is the deliberate call the Reliquary sectors made to
 * avoid a second content pipeline.
 */
export function memoryPlaces(): readonly BiomeStyle[] {
  return [...BIOMES, ...TOWER_BIOMES, ...PLANETS.map((p) => p.biome)];
}

export function memoryPlace(placeId: string): BiomeStyle | null {
  return memoryPlaces().find((b) => b.name === placeId) ?? null;
}

/**
 * Every encounter a Memory can put on its last floor: the five authored ones, the six
 * sector bosses, and the Tower's five.
 *
 * Two exclusions, both deliberate. The **Proving** (`legend-<class>`) is one character's
 * final exam and its identity is the entire point (`docs/class-completion.md`). **Raids**
 * are an event you travel to, and their tables are addressed by the raid rather than by a
 * boss id — a raid encounter standing in a Memory would be the fight without the table,
 * which is the worst of both. Putting raid encounters in high-rarity Memories later is a
 * drop-table decision, not a spawn decision.
 */
export function memoryEncounters(): readonly BossSpec[] {
  return [
    ...BOSSES,
    ...PLANETS.map((p) => planetBossSpec(p)),
    // One per authored tier of the climb; `towerBossSpec` buckets by height in fives.
    ...[5, 10, 15, 20, 25].map((h) => towerBossSpec(h)),
  ];
}

/**
 * The encounter a Memory spawns, with **its id rewritten to `memory-<templateId>`**.
 *
 * Load-bearing, and the same move `raidBossSpec` and `legendBossSpec` make. Without it a
 * Memory that rolled a sector's boss would satisfy that sector's `boss`-addressed drop
 * sources and pay out its exclusive named items outside the sector — every exclusivity
 * promise in `data/drops.ts` would quietly leak through this one feature. With it a Memory
 * pays what a deep floor pays (the generic `worldDrop` and `clearCache` sources at its
 * depth) and nothing that belongs to somewhere else.
 */
export function memoryBossSpec(bossId: string): BossSpec {
  const template = memoryEncounters().find((b) => b.id === bossId) ?? BOSSES[0]!;
  return { ...template, id: `memory-${template.id}` };
}

// --- what a Memory does to a floor ------------------------------------------

/**
 * The combined effect of a Memory's two lists.
 *
 * Mirrors `DailyEffects`/`WeeklyEffects` field for field on purpose: `profileFor` folds
 * this in the same expression it folds those, so a Memory needed no new plumbing and
 * cannot reach anything they can't.
 */
export interface MemoryEffects {
  /** Multiplies `danger`. `merciless` only — see the file header. */
  readonly danger: number;
  readonly health: number;
  readonly count: number;
  readonly speed: number;
  readonly telegraph: number;
  readonly aggression: number;
  /** Added to the floor's elite quota. */
  readonly elites: number;
  readonly quantity: number;
  readonly coins: number;
  readonly xp: number;
  /** Added to the composed rarity bias, capped at `MEMORY_RARITY_CAP`. */
  readonly rarityBias: number;
  /** Monster affix ids forced onto every wave monster. */
  readonly affixes: readonly string[];
}

/** Neutral: exactly what a floor with no Memory on it sees. */
export const NO_MEMORY_EFFECTS: MemoryEffects = {
  danger: 1, health: 1, count: 1, speed: 1, telegraph: 1, aggression: 1,
  elites: 0, quantity: 1, coins: 1, xp: 1, rarityBias: 0, affixes: [],
};

/**
 * How heavily burdened a Memory is, from 0 (nothing) to 1 (every slot its rarity allows,
 * every one of them at the worst grade).
 *
 * Measured against the *rarity's* own capacity rather than against the roster, so it means
 * "as bad as a Memory of this rarity can be" — which is the thing the ceiling allowance
 * is buying. `armored` and `spiteful` count exactly as much as the numeric burdens do:
 * a floor where everything is Warded is not a lesser tax than one where everything has
 * more health.
 */
export function burdenLoad(memory: MemoryInstance): number {
  const capacity = memoryPairs(memory.rarity) * memoryMaxGrade(memory.rarity);
  if (capacity <= 0) return 0;
  const carried = memory.burdens.reduce((sum, b) => sum + b.grade, 0);
  return Math.min(1, carried / capacity);
}

/**
 * The most rarity bias this particular Memory is permitted to contribute.
 *
 * `MEMORY_RARITY_CAP` for everything below mythic — below the Abyssal Rift's own bias, so
 * an ordinary Memory never out-farms the mode that exists to pay in rarity. A **mythic**
 * Memory may overshoot it, and only in proportion to the square of its burden load: at
 * half load it receives a quarter of `MEMORY_CEILING_OVERSHOOT`, and only a Memory
 * carrying every burden its rarity allows at the worst grade reaches the whole thing.
 *
 * That squaring is the carve-out's safety catch. The owner's ask was that the ceiling
 * move *and* that the map become ludicrously hard in exchange; a linear grant would have
 * sold the interesting half of that trade at a discount.
 */
export function memoryRarityAllowance(memory: MemoryInstance): number {
  if (memory.rarity !== MEMORY_MAX_RARITY) return MEMORY_RARITY_CAP;
  const load = burdenLoad(memory);
  return MEMORY_RARITY_CAP + MEMORY_CEILING_OVERSHOOT * load * load;
}

export function memoryEffects(memory: MemoryInstance | null | undefined): MemoryEffects {
  if (!memory) return NO_MEMORY_EFFECTS;
  let danger = 1, health = 1, count = 1, speed = 1, telegraph = 1, aggression = 1;
  let elites = 0, quantity = 1, coins = 1, xp = 1, rarityBias = 0;
  const affixes = new Set<string>();

  for (const { id, grade } of memory.burdens) {
    const def = MEMORY_BURDENS[id];
    if (!def) continue;
    const pct = def.pct[grade - 1] ?? 0;
    switch (id) {
      case "merciless": danger *= pctMult(pct); break;
      case "obdurate": health *= pctMult(pct); break;
      case "teeming": count *= pctMult(pct); break;
      case "quickened": speed *= pctMult(pct); break;
      case "unreadable":
        // A tightening, so the percentage comes *off*: a 20% shorter wind-up, and the gap
        // between swings closing by half as much again — reaction time is the expensive
        // thing to take away, so the aggression half is deliberately the gentler one.
        telegraph *= pctMult(-pct);
        aggression *= pctMult(-pct * 0.6);
        break;
      case "hunted": elites += pct; break;
      case "armored":
      case "spiteful":
        for (const a of def.affixes?.[grade - 1] ?? []) affixes.add(a);
        break;
    }
  }

  for (const { id, grade } of memory.boons) {
    const def = MEMORY_BOONS[id];
    if (!def) continue;
    const pct = def.pct[grade - 1] ?? 0;
    switch (id) {
      case "abundant": quantity *= pctMult(pct); break;
      case "gilded": coins *= pctMult(pct); break;
      case "storied": xp *= pctMult(pct); break;
      // A percentage of the game's own base rarity bias, so a rarity lean is expressed in
      // the same unit as everything else rather than as a raw number nobody can read.
      case "luminous": rarityBias += BASE_RARITY_BIAS * (pct / 100); break;
    }
  }

  return {
    danger, health, count, speed, telegraph, aggression, elites, quantity, coins, xp,
    // The ceiling, applied once and here rather than trusted to the roll. Below mythic
    // this is `MEMORY_RARITY_CAP` and nothing gets past it; at mythic it is what this
    // Memory's burden load has bought (`memoryRarityAllowance`) — the game's one place
    // where difficulty lifts the rarity ceiling, and it is bounded, squared and stated.
    rarityBias: Math.min(memoryRarityAllowance(memory), rarityBias),
    affixes: [...affixes],
  };
}

// --- the run ----------------------------------------------------------------

/**
 * One floor of a Memory — `riftConfig`'s shape, with the Memory carried alongside the way
 * a sector rides on `planet` and a climb on `tower`.
 *
 * `danger` is the Challenger dial times the Memory's own `merciless`, and that is the
 * entire difficulty statement. There is no tier ladder: a rift tier is the game handing
 * you a difficulty dial with a fixed shape, and a Memory is the player building one.
 */
export function memoryConfig(
  memory: MemoryInstance, floor: number, challengerTier = 0, players = 1,
): RunConfig {
  const f = Math.min(Math.max(1, Math.floor(floor)), MEMORY_FLOORS);
  const fx = memoryEffects(memory);
  return {
    mode: MODES.memory,
    tier: 0,
    floor: f,
    depth: Math.max(1, Math.round(memory.depth + (f - 1))),
    danger: challengerMultiplier(challengerTier) * fx.danger,
    // Every Memory ends on its encounter. That is the contract every rift makes.
    bossFloor: f === MEMORY_FLOORS,
    lastFloor: f === MEMORY_FLOORS,
    challengerTier,
    players,
    memory,
  };
}

/**
 * Whether this character has earned the Altar.
 *
 * Both records, read separately — see `MEMORY_UNLOCK_DEPTH`. Takes the two numbers rather
 * than a `Player` so `data/` stays free of the simulation, and so the gate is trivially
 * testable from both sides.
 */
export function memoryUnlocked(deepestDepth: number, highestHeight: number): boolean {
  return deepestDepth >= MEMORY_UNLOCK_DEPTH && highestHeight >= MEMORY_UNLOCK_HEIGHT;
}

// --- rolling one ------------------------------------------------------------

/**
 * Rolls a Memory of a chosen rarity.
 *
 * The brief's "completely customize these (partially random)", read the way the Forge's
 * Craft screen already reads it: **you buy the tier, the dice buy the character.** The
 * rarity is chosen and paid for; the place, the encounter, the depth within the band and
 * every modifier are rolled, and the workbench (`docs/memories.md` §7.3) is how you push
 * one toward what you want without ever picking a modifier outright.
 *
 * `frontier` is the account's own — the further of the two ladders — so a Memory is always
 * made at roughly the depth this account has actually reached.
 */
export function rollMemory(rarity: Rarity, frontier: number, rng: Rng, id: string): MemoryInstance {
  const places = memoryPlaces();
  const bosses = memoryEncounters();
  const base = Math.max(1, Math.floor(frontier));
  return {
    id,
    rarity,
    depth: Math.max(1, rng.int(Math.max(1, base - MEMORY_DEPTH_BELOW), base + MEMORY_DEPTH_ABOVE)),
    placeId: rng.pick(places).name,
    bossId: rng.pick(bosses).id,
    ...rollMemoryMods(rarity, rng),
  };
}

/**
 * The two lists, rolled together so the pairing invariant holds by construction: `n`
 * distinct burdens and `n` distinct boons, each at a grade up to the rarity's cap. There
 * is no code path that produces a boon without a burden.
 */
export function rollMemoryMods(
  rarity: Rarity, rng: Rng,
): { burdens: MemoryMod<MemoryBurdenId>[]; boons: MemoryMod<MemoryBoonId>[] } {
  const n = Math.min(memoryPairs(rarity), MEMORY_BOON_IDS.length, MEMORY_BURDEN_IDS.length);
  const maxGrade = memoryMaxGrade(rarity);
  const grade = (): MemoryGrade => rng.int(1, maxGrade) as MemoryGrade;
  return {
    burdens: drawDistinct(MEMORY_BURDEN_IDS, n, rng).map((id) => ({ id, grade: grade() })),
    boons: drawDistinct(MEMORY_BOON_IDS, n, rng).map((id) => ({ id, grade: grade() })),
  };
}

/** `n` distinct entries drawn from a pool, without replacement. */
function drawDistinct<T>(pool: readonly T[], n: number, rng: Rng): T[] {
  const rest = [...pool];
  const out: T[] = [];
  for (let i = 0; i < n && rest.length > 0; i++) {
    out.push(rest.splice(rng.int(0, rest.length - 1), 1)[0]!);
  }
  return out;
}

/**
 * Adds one pair to a Memory, up to what its rarity allows — the `etch` op. Returns the
 * Memory unchanged when it is already full, so the caller never has to special-case it.
 */
export function etchMemory(memory: MemoryInstance, rng: Rng): MemoryInstance {
  const cap = Math.min(memoryPairs(memory.rarity), MEMORY_BOON_IDS.length, MEMORY_BURDEN_IDS.length);
  if (memory.burdens.length >= cap && memory.boons.length >= cap) return memory;
  const maxGrade = memoryMaxGrade(memory.rarity);
  const grade = (): MemoryGrade => rng.int(1, maxGrade) as MemoryGrade;
  const burdenPool = MEMORY_BURDEN_IDS.filter((id) => !memory.burdens.some((b) => b.id === id));
  const boonPool = MEMORY_BOON_IDS.filter((id) => !memory.boons.some((b) => b.id === id));
  if (burdenPool.length === 0 || boonPool.length === 0) return memory;
  return {
    ...memory,
    burdens: [...memory.burdens, { id: rng.pick(burdenPool), grade: grade() }],
    boons: [...memory.boons, { id: rng.pick(boonPool), grade: grade() }],
  };
}

/** Rerolls both lists at the same rarity — the `distort` op. */
export function distortMemory(memory: MemoryInstance, rng: Rng): MemoryInstance {
  return { ...memory, ...rollMemoryMods(memory.rarity, rng) };
}

/** +`MEMORY_DEEPEN_STEP` depth — the `deepen` op. No cap; the ladder has none either. */
export function deepenMemory(memory: MemoryInstance): MemoryInstance {
  return { ...memory, depth: memory.depth + MEMORY_DEEPEN_STEP };
}

/**
 * One rarity up, keeping the modifiers — the `crystallise` op. Stops at mythic, the same
 * wall `ascendTarget` holds for items and for the same reason.
 *
 * The existing modifiers are kept as they are: crystallising is how you keep a roll you
 * like, and what you pay for is the keeping. Whatever pairs the new rarity allows beyond
 * what it already carries are left for `etch` to fill.
 */
export function crystalliseMemory(memory: MemoryInstance, rng: Rng): MemoryInstance | null {
  const target = memoryAscendTarget(memory.rarity);
  if (!target) return null;
  // Grades stay where they were; the new rarity only raises the *ceiling*, and pushing an
  // existing roll up for free would make the ladder strictly better than a fresh recall.
  void rng;
  return { ...memory, rarity: target };
}

/** The rarity one step up, or null at the Memory cap. */
export function memoryAscendTarget(rarity: Rarity): Rarity | null {
  const i = rarityIndex(rarity);
  if (i >= rarityIndex(MEMORY_MAX_RARITY)) return null;
  return RARITIES[i + 1] ?? null;
}

// --- the Altar's economy ----------------------------------------------------

/**
 * Everything the Altar can do to a Memory you already hold.
 *
 * All of them **roll**; none of them let you pick a modifier. That is the workbench rule
 * §26 already established (`docs/forge.md`), and it is the thing that keeps a Memory from
 * becoming a spreadsheet.
 */
export const MEMORY_OPS = ["distort", "etch", "deepen", "crystallise", "forget"] as const;
export type MemoryOp = (typeof MEMORY_OPS)[number];

export interface MemoryOpInfo {
  readonly label: string;
  readonly blurb: string;
}

export const MEMORY_OP_INFO: Record<MemoryOp, MemoryOpInfo> = {
  distort: { label: "Distort", blurb: "Reroll every burden and boon. Same rarity, different memory." },
  etch: { label: "Etch", blurb: "Cut in one more pair, up to what the rarity allows. Never past it." },
  deepen: { label: "Deepen", blurb: "Push it further down. Older, richer, considerably less forgiving." },
  crystallise: { label: "Crystallise", blurb: "One rarity up, keeping what it remembers. Consumes two Memories of its rarity. Stops at mythic." },
  forget: { label: "Forget", blurb: "Let it go. Returns Ash. It does not come back." },
};

/** Same-rarity Memories a crystallisation consumes, on top of everything else. */
export const CRYSTALLISE_COMPONENTS = 2;

/** Ash an op costs at common, before the per-tier doubling. Zero means the op takes none. */
const OP_ASH: Record<MemoryOp, number> = {
  distort: 6, etch: 10, deepen: 8, crystallise: 40, forget: 0,
};
/** Coins as a multiple of `reforgeCoinCost` for the Memory's rarity. */
const OP_COINS: Record<MemoryOp, number> = {
  distort: 1, etch: 1, deepen: 0.75, crystallise: 2, forget: 0,
};

export interface MemoryCost {
  readonly ash: number;
  readonly coins: number;
  readonly scrap: number;
}

/**
 * What it costs to recall a fresh Memory of `rarity`: materials and coins, exactly the
 * Forge's "the nine materials are the currency of making" rule (§27). No Ash — making
 * something costs materials, shaping it costs Ash, and the Altar introduces no fourth
 * currency.
 */
export function memoryRecallCost(rarity: Rarity): MemoryCost {
  return { ash: 0, coins: reforgeCoinCost(rarity), scrap: craftBulkCost(rarity) * 2 };
}

/**
 * What an op costs on a Memory of `rarity`. Ash doubles per tier off the Forge's own
 * curve rather than a new one; `crystallise` is priced at the rarity being *reached*, the
 * same way `ascend` is.
 */
export function memoryOpCost(op: MemoryOp, rarity: Rarity): MemoryCost {
  const tier = rarityIndex(rarity);
  const ash = Math.round(OP_ASH[op] * Math.pow(2, tier));
  if (op === "crystallise") {
    const target = memoryAscendTarget(rarity) ?? rarity;
    return {
      ash,
      coins: Math.round(reforgeCoinCost(target) * OP_COINS.crystallise),
      scrap: craftBulkCost(target) * 3,
    };
  }
  return {
    ash,
    coins: Math.round(reforgeCoinCost(rarity) * OP_COINS[op]),
    scrap: op === "etch" ? craftBulkCost(rarity) : 0,
  };
}

/** Ash returned for forgetting a Memory. Below what shaping one costs, deliberately. */
export function memoryForgetAsh(rarity: Rarity): number {
  return Math.round(3 * Math.pow(2, rarityIndex(rarity)));
}

// --- validation (the `npm run memories` gate reads this) --------------------

/**
 * Everything structurally wrong with one Memory, as sentences. Empty means it is
 * well-formed; `tools/memories.ts` adds the checks that need the difficulty curve, the
 * reward curve and a live `GameState`.
 */
export function memoryProblems(memory: MemoryInstance): string[] {
  const out: string[] = [];
  if (!memory.id) out.push("no id");
  if (!MEMORY_RARITIES.includes(memory.rarity)) {
    out.push(`rarity "${memory.rarity}" is not a Memory rarity — divine and unspoken are the item ladder's`);
  }
  if (!(memory.depth >= 1)) out.push("depth must be >= 1");
  if (!memoryPlace(memory.placeId)) out.push(`place "${memory.placeId}" names nowhere in the game`);
  if (!memoryEncounters().some((b) => b.id === memory.bossId)) {
    out.push(`boss "${memory.bossId}" names no encounter`);
  }
  // The invariant the whole system rests on: no free positives.
  if (memory.boons.length > memory.burdens.length) {
    out.push(`${memory.boons.length} boons against ${memory.burdens.length} burdens — a boon was not paid for`);
  }
  const cap = memoryPairs(memory.rarity);
  if (memory.burdens.length > cap) out.push(`${memory.burdens.length} burdens past the ${memory.rarity} cap of ${cap}`);
  if (memory.boons.length > cap) out.push(`${memory.boons.length} boons past the ${memory.rarity} cap of ${cap}`);
  const maxGrade = memoryMaxGrade(memory.rarity);
  for (const m of [...memory.burdens, ...memory.boons]) {
    if (m.grade < 1 || m.grade > maxGrade) out.push(`"${m.id}" at grade ${m.grade}, past ${memory.rarity}'s cap of ${maxGrade}`);
  }
  if (new Set(memory.burdens.map((b) => b.id)).size !== memory.burdens.length) out.push("a burden is rolled twice");
  if (new Set(memory.boons.map((b) => b.id)).size !== memory.boons.length) out.push("a boon is rolled twice");
  for (const id of memoryEffects(memory).affixes) {
    if (!AFFIX_BY_ID[id]) out.push(`forced affix "${id}" names no monster affix`);
  }
  return out;
}
