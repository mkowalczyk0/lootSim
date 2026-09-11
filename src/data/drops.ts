/**
 * The drop table — the one declarative answer to "where does this come from?".
 *
 * Named items (UAT §28) were the first thing to say their sources as data and let the
 * roll sites read the table; relics and artifacts (UAT §19) are the second. This file is
 * the machinery both share so that neither owns a matcher the other has to keep in
 * agreement with: a `DropSource` is what a definition declares, a `DropQuery` is what a
 * roll site or a preview screen asks, `sourceMatches` is the ONE function that decides
 * whether they meet, and `rollTable` / `forSource` are the dice and the no-dice read over
 * any registry whose entries carry `sources`.
 *
 * Every roll site in the game builds a `DropQuery` from what just happened — a boss died,
 * a chest opened, a floor cleared, a monster fell — and hands it to each table. A source
 * that qualifies its event further (this boss, but only in the Abyssal Rift; this clear
 * cache, but only from tier 4) does so with optional fields on the source, never with a
 * second kind: a Proving kill is a `boss` query whose id happens to be `legend-<class>`,
 * an Abyss boss is a `boss` query whose `mode` happens to be `abyss`. One event, one
 * description, one matcher — the §20 preview screen depends on that being true, because
 * two ways to describe the same kill are two matchers that can disagree.
 *
 * `raid` was RESERVED and **went live with UAT §15**. It is its own addressing rather than
 * a `boss` query with `mode: "raid"`, because §15's whole rule is that "a specific boss
 * should be the exclusive source of a specific named item": a raid's table is addressed by
 * the raid, so nothing that merely happens to be standing in a raid can pay it out, and a
 * raid's items can never leak onto a Delve encounter that shares a template. `minTier` on
 * the source is §16 — the hardest tiers of a raid can drop things the first tier cannot.
 *
 * `LIVE_SOURCE_KINDS` still exists and now names every kind, which is the point: the next
 * reserved kind has to be *left out* of it deliberately, and the acceptance tools refuse a
 * definition that hides behind one.
 *
 * `tower` was reserved on the same terms and **went live in Sept 2026**, when the ascent
 * got a clear cache to emit it (UAT §21). It is deliberately its own kind rather than a
 * `clearCache` with `mode: "tower"`, because a height is not a depth: the whole §21 rule
 * is that the two ladders are never written into each other's numbers, and a source that
 * said `minDepth` while meaning a height would be the first place that rule leaked.
 *
 * Pure data + pure functions. Imports only types and registries from `data/`.
 */

import { BOSSES, bossFor } from "./bosses";
import { levelAdvice } from "./depth";
import { rewardCurve } from "./rewards";
import { CHEST_TIERS, chestName, type ChestTier } from "./chests";
import { CLASS_IDS, CLASSES, type ClassId } from "./classes";
import type { ItemRequirement } from "./crafting";
import type { Element } from "./elements";
import { DELVE_BOTTOM, legendName } from "./legends";
import type { MaterialBag } from "./materials";
import { MODES, RUN_MODES, riftConfig, type RunModeId } from "./modes";
import { PLANETS, planetConfig } from "./planets";
import { RAID_BY_ID, raidConfig, raidOfBossId } from "./raids";
import { TOWER_BOSSES, towerConfig } from "./tower";

// --- sources ----------------------------------------------------------------

/**
/**
 * Which half of a raid clear paid out. A raid's one floor is its boss floor, so the floor
 * pays twice: the encounter drops when it dies, and the cache drops when the floor closes.
 */
export type RaidDropEvent = "encounter" | "cache";

/**
 * Sources sharing a `pool` id have every member's chance multiplied by **one shared factor**,
 * chosen so that the odds the event pays *anything* equal the **maximum** chance any single
 * member declares. Every member still rolls its own dice.
 *
 * `rollTable`'s default is independence, which is right for a table of distinct chases: two
 * different named items can land in the same cache. But independence makes the odds that an
 * event pays *anything* grow with the number of definitions that match it, and that quantity
 * is what a player experiences. The Abyssal Rift is where this ran away: fifteen artifacts
 * match one boss, each rolled separately at ~14%, so the rift paid a relic-tier item on
 * **92% of tier-1 clears and 99% of tier-8 clears** — and it climbed every time anyone
 * authored another artifact, with no number changed and nobody deciding it should.
 *
 * A pool fixes the *mechanism* rather than the arithmetic. `abyssBoss: 0.14` now means what
 * a reader already believes it means — "an Abyss boss pays an artifact 14% of the time" —
 * and a twenty-fourth artifact becomes one more candidate in the draw rather than another
 * independent chance to inflate it. Lowering the constant instead would have fixed tonight's
 * number and left the next authored artifact to undo it, which is the same argument that
 * rejected nudging `raidArtifact`; it applies here with more force, because this one
 * re-inflates by itself.
 *
 * **A pool narrows the odds; it does not elect a winner.** An earlier version did elect one —
 * a single roll, then a weighted pick — and produced identical per-clear numbers while
 * silently removing the Abyss's ability to pay more than one artifact from a single kill.
 * `npm run relics` refused it. Keeping independent dice is what preserves the "two can land
 * in the same cache" property that makes this a table of distinct chases at all. See
 * `docs/abyss-odds.md` and `docs/blind-instruments.md`'s nineteenth entry.
 *
 * **Deliberately opt-in, not the default.** Applying it generally would also change the
 * Nameless (2 definitions on one kill) and the Tower cache (2), neither of which anyone has
 * complained about and both of which are out of scope. A source has to ask.
 *
 * Max rather than sum: a sum is the thing that grows with the roster, and a max cannot. §16's
 * tier gating still works, because a `minTier` member that qualifies raises the pool's rate
 * above what the low tiers reach.
 */
export type DropPool = string;

/**
 * Where a thing is *found*. `chance` is per qualifying event, before `dropChance`
 * scales it by danger. Optional `mode` / `minTier` narrow an event to one run mode and
 * a rift tier floor — omitted means "anywhere this event happens".
 */
export type FoundSource =
  /**
   * Drops when this boss dies — `BossSpec.id`, `planet-<planetId>` for a sector boss,
   * `legend-<classId>` for a class's Proving. `minDepth` is the floor's effective depth.
   */
  | {
      readonly kind: "boss"; readonly bossId: string; readonly chance: number;
      readonly mode?: RunModeId; readonly minTier?: number; readonly minDepth?: number;
      readonly pool?: DropPool;
    }
  /** Rolls out of a chest of this tier, alongside the ordinary pull. */
  | { readonly kind: "chest"; readonly tier: ChestTier; readonly chance: number }
  /**
   * Lands in the clear cache of a floor at least this deep. `lastFloor` restricts it to
   * the cache that closes a rift — the one you only get by killing the boss.
   */
  | {
      readonly kind: "clearCache"; readonly minDepth: number; readonly chance: number;
      readonly mode?: RunModeId; readonly minTier?: number; readonly lastFloor?: boolean;
      readonly pool?: DropPool;
    }
  /** Any wave monster at least this deep. Elites triple the odds. */
  | { readonly kind: "worldDrop"; readonly minDepth: number; readonly chance: number; readonly mode?: RunModeId }
  /**
   * Paid out by a raid (UAT §15), addressed by `RaidSpec.id`. `minTier` is §16: the rarest
   * half of a raid's table only opens at a tier, so a harder raid drops things an easier
   * one cannot rather than better rolls of the same thing.
   *
   * A raid floor **is** its boss floor, so it emits this query twice — once when the
   * encounter dies and once when the cache that closes the floor lands. `event` says which
   * of those halves a source is paid from; omitted means both, which is what every named
   * item declares and what this source meant before the field existed.
   *
   * That field exists because "both" is a *composition* decision that nobody authored and
   * that no per-source `chance` can express. A source paid from both halves pays at
   * `1-(1-p)²` per clear, not at `p` — so the number in the table stops meaning the thing
   * its own comment says it means, and the gap widens with every event a floor gains.
   * Naming the event is how a source states its per-clear odds and keeps them stated.
   */
  | {
      readonly kind: "raid"; readonly raidId: string; readonly chance: number;
      readonly minTier?: number; readonly event?: RaidDropEvent;
    }
  /**
   * In the cache that closes a Tower floor at least this high (UAT §21). A *height*, not
   * a depth — the ascent's own address, so nothing here can be confused for the descent.
   */
  | { readonly kind: "tower"; readonly minFloor: number; readonly chance: number };

/**
 * Forged on demand at the Forge (UAT §25 named crafting, §24 multi-item recipes). Not a
 * drop: an activity preview never lists it, and a relic may not carry one.
 */
export interface CraftSource {
  readonly kind: "craft";
  readonly materials: Partial<MaterialBag>;
  readonly coins: number;
  readonly items?: readonly ItemRequirement[];
}

export type DropSource = FoundSource | CraftSource;

/** The source kinds some roll site actually emits a query for today. */
export const LIVE_SOURCE_KINDS: readonly FoundSource["kind"][] = ["boss", "chest", "clearCache", "worldDrop", "tower", "raid"];

export function isLiveSource(src: DropSource): src is FoundSource {
  return (LIVE_SOURCE_KINDS as readonly string[]).includes(src.kind);
}

// --- queries ----------------------------------------------------------------

/**
 * What a roll site is asking about — mirrors the sources minus the numbers. A site
 * passes everything it knows; a source ignores what it doesn't care about. A query
 * without `mode` or `tier` never satisfies a source that demands one.
 */
export type DropQuery =
  | { readonly kind: "boss"; readonly bossId: string; readonly mode?: RunModeId; readonly tier?: number; readonly depth?: number }
  | { readonly kind: "chest"; readonly tier: ChestTier }
  | {
      readonly kind: "clearCache"; readonly depth: number; readonly mode: RunModeId;
      readonly tier?: number; readonly lastFloor?: boolean;
    }
  | { readonly kind: "worldDrop"; readonly depth: number; readonly elite: boolean; readonly mode?: RunModeId }
  | { readonly kind: "raid"; readonly raidId: string; readonly tier?: number; readonly event?: RaidDropEvent }
  | { readonly kind: "tower"; readonly floor: number };

/** The UAT §16 hook: harder content pays better odds. Gentle, capped, one place. */
export function dropChance(base: number, danger = 1): number {
  // Delegates to the one reward curve (UAT §16) rather than restating its formula.
  // "Harder pays better" is a single statement covering odds, count, item power and
  // variants; a second copy here is exactly the fork that keeps biting this codebase.
  return Math.min(1, base * rewardCurve(danger).dropChance);
}

/** True when `src` is a thing `q` could pay out. The one matcher. */
export function sourceMatches(src: DropSource, q: DropQuery): boolean {
  switch (src.kind) {
    case "boss":
      return q.kind === "boss" && src.bossId === q.bossId
        && (src.mode === undefined || src.mode === q.mode)
        && (src.minTier === undefined || (q.tier ?? 0) >= src.minTier)
        && (src.minDepth === undefined || (q.depth ?? 0) >= src.minDepth);
    case "chest":
      return q.kind === "chest" && src.tier === q.tier;
    case "clearCache":
      return q.kind === "clearCache" && q.depth >= src.minDepth
        && (src.mode === undefined || src.mode === q.mode)
        && (src.minTier === undefined || (q.tier ?? 0) >= src.minTier)
        && (!src.lastFloor || q.lastFloor === true);
    case "worldDrop":
      return q.kind === "worldDrop" && q.depth >= src.minDepth
        && (src.mode === undefined || src.mode === q.mode);
    case "raid":
      // `event` on either side may be absent, and absent means "all of them" on both: a
      // source without one is paid from the whole clear, and a *query* without one is a
      // preview asking what this raid can pay at all rather than a roll site reporting
      // which half just happened. The §20 preview depends on that second reading — a
      // preview that had to name an event would answer a narrower question than the
      // screen asks, and would silently stop listing anything the cache pays.
      return q.kind === "raid" && src.raidId === q.raidId
        && (src.minTier === undefined || (q.tier ?? 0) >= src.minTier)
        && (src.event === undefined || q.event === undefined || src.event === q.event);
    case "tower":
      return q.kind === "tower" && q.floor >= src.minFloor;
    case "craft":
      return false;
  }
}

// --- reading and rolling a table --------------------------------------------------

/** Anything with a drop table: a named item, a relic, whatever comes third. */
export interface TableEntry {
  readonly id: string;
  readonly sources: readonly DropSource[];
}

/** One way `q` can pay out `def`. A definition matched through two sources appears twice. */
export interface TableMatch<T extends TableEntry> {
  readonly def: T;
  readonly src: FoundSource;
}

/**
 * Everything in `defs` this event could pay out, with the source it matched through —
 * the pure read a drop preview wants ("this boss can drop these, at these odds"), no dice.
 */
export function forSource<T extends TableEntry>(defs: readonly T[], q: DropQuery): TableMatch<T>[] {
  const out: TableMatch<T>[] = [];
  for (const def of defs) {
    for (const src of def.sources) {
      if (src.kind !== "craft" && sourceMatches(src, q)) out.push({ def, src });
    }
  }
  return out;
}

/**
 * Rolls a table for one event, **rolling every match independently**.
 *
 * There are two shapes a drop table can have and this file deliberately provides both,
 * because getting them the wrong way round is the kind of thing that gets re-derived
 * incorrectly by whoever adds the next table:
 *
 *  - **`rollTable` — a table whose entries are distinct chases.** Named items and relics.
 *    Each definition is its own thing you are hunting, two can land in the same cache, and
 *    a definition listed under two sources gets two shots but drops at most once. Every
 *    entry rolls.
 *  - **`rollOne` — a table whose entries are interchangeable.** Augments. You are hunting
 *    "an augment", and which one it turns out to be is a second, weighted question. Rolling
 *    each of forty-three definitions independently would drop four augments a cache; one
 *    roll and then a pick is the honest shape.
 *
 * An elite triples a world-drop source's odds; `danger` (rift tier × Challenger) lifts
 * every chance through `dropChance`. `skip` is ids that must not drop — a relic the account
 * already owns. Returns the definitions that hit, in registry order; the caller forges.
 */
/**
 * The shared factor that makes a pool's members compose to the pool's own odds.
 *
 * Returns `k` such that rolling each member independently at `k * p` gives
 * `1 - Π(1 - k*pᵢ) = max(pᵢ)` — the event pays *something* at the best odds any one member
 * declares, however many members there are. With a single member `k` is 1 and the pool is
 * exactly what it was without one, which is why declaring a pool of one is a safe no-op.
 *
 * Solved by bisection rather than in closed form: the equation has none for heterogeneous
 * chances, and 40 halvings is deterministic, cheap, and accurate past any precision a
 * probability here is authored to. Monotone in `k`, so bisection is exact in the limit —
 * at `k = 0` nothing drops and at `k = 1` the union is the old independent product, which
 * is by definition at least the max.
 */
function poolScale(ps: readonly number[]): number {
  if (ps.length <= 1) return 1;
  const target = Math.max(...ps);
  if (target <= 0) return 1;
  const unionAt = (k: number) => 1 - ps.reduce((acc, p) => acc * (1 - p * k), 1);
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (unionAt(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function rollTable<T extends TableEntry>(
  defs: readonly T[],
  q: DropQuery,
  rng: { chance(p: number): boolean },
  danger = 1,
  skip?: ReadonlySet<string>,
): T[] {
  const out: T[] = [];
  // Pooled members are collected rather than rolled: a pool competes for one roll (see
  // `DropPool`). Everything without a `pool` keeps rolling independently, which is still
  // the default and still right for a table of distinct chases.
  const pools = new Map<string, { def: T; p: number }[]>();
  for (const def of defs) {
    if (skip?.has(def.id)) continue;
    let hit = false;
    for (const src of def.sources) {
      if (src.kind === "craft" || !sourceMatches(src, q)) continue;
      let base = src.chance;
      if (q.kind === "worldDrop" && q.elite) base *= 3;
      const p = dropChance(base, danger);
      const pool = "pool" in src ? src.pool : undefined;
      if (pool !== undefined) {
        const members = pools.get(pool) ?? [];
        members.push({ def, p });
        pools.set(pool, members);
        continue;
      }
      if (rng.chance(p)) { hit = true; break; }
    }
    if (hit) out.push(def);
  }
  for (const members of pools.values()) {
    if (members.length === 0) continue;
    // Every member still rolls its own dice — a pool narrows the odds, it does not elect a
    // single winner. That distinction is load-bearing: relics are a table of *distinct
    // chases*, two of which are allowed to land together, and an Abyss boss has always been
    // able to pay more than one artifact. A winner-takes-all pool would have quietly
    // removed that, and `npm run relics` caught it — "with the dice rigged, the Abyss Choir
    // pays out every artifact it lists" is the property, and it survives here.
    //
    // What the pool changes is only the *scale*: every member's chance is multiplied by one
    // shared factor chosen so that the odds the event pays anything equal the best odds any
    // single member declares. Roster-independent by construction, because the factor is
    // recomputed from whoever is actually in the draw.
    const k = poolScale(members.map((m) => m.p));
    for (const m of members) {
      if (rng.chance(m.p * k) && !out.includes(m.def)) out.push(m.def);
    }
  }
  // Registry order, so a pooled drop doesn't announce itself by landing last.
  return defs.filter((d) => out.includes(d));
}

/**
 * Rolls a table for one event, **once**, and then picks which entry it was.
 *
 * The counterpart to `rollTable` above — see the note there for which shape a new table
 * wants. `rate` is the chance the event pays out anything at all (lifted by `danger`
 * through the same `dropChance` every other table uses); `weightOf` then decides which of
 * the matching definitions it was. A definition matching through two sources is still one
 * candidate, not two, because the question "did something drop" was already answered.
 *
 * Returns null when nothing dropped or nothing matched — a caller that gets null must not
 * fall back to a default, or the rarest entry stops being rare.
 */
export function rollOne<T extends TableEntry>(
  defs: readonly T[],
  q: DropQuery,
  rng: { chance(p: number): boolean; next(): number },
  danger = 1,
): T | null {
  // Fully table-driven: the odds that *anything* drops are the sum of what the matching
  // definitions declare, and the pick that follows is weighted by the same numbers. No
  // parallel rate and no weight function, so a definition's `chance` means exactly what it
  // says and a caller cannot state odds that disagree with the table.
  const chances = new Map<string, number>();
  const pool: T[] = [];
  for (const m of forSource(defs, q)) {
    const prev = chances.get(m.def.id);
    if (prev === undefined) pool.push(m.def);
    // A definition reachable two ways is one candidate at its best odds, not two.
    chances.set(m.def.id, Math.max(prev ?? 0, m.src.chance));
  }
  let rate = 0;
  for (const d of pool) rate += chances.get(d.id) ?? 0;
  if (rate <= 0 || !rng.chance(dropChance(Math.min(1, rate), danger))) return null;

  let roll = rng.next() * rate;
  for (const d of pool) {
    roll -= chances.get(d.id) ?? 0;
    if (roll < 0) return d;
  }
  return pool[pool.length - 1] ?? null;
}

// --- authoring sugar -------------------------------------------------------------

/** The boss id a class's Proving emits (`legendBossSpec`). */
export function provingBossId(classId: ClassId): string {
  return `legend-${classId}`;
}

/** The class whose Proving a boss id is, or null for an ordinary boss. */
export function provingClassOf(bossId: string): ClassId | null {
  if (!bossId.startsWith("legend-")) return null;
  const id = bossId.slice("legend-".length);
  return (CLASS_IDS as readonly string[]).includes(id) ? (id as ClassId) : null;
}

/**
 * One ordinary `boss` source per class whose Proving qualifies — sugar, not a new kind.
 * "A lightning Legend's Proving drops the lightning relic" is
 * `provingSources(0.2, (c) => CLASSES[c].element === "lightning")`, and the preview
 * screen sees twenty-one plain boss ids it already knows how to read.
 */
export function provingSources(chance: number, qualifies: (classId: ClassId) => boolean = () => true): FoundSource[] {
  return CLASS_IDS.filter(qualifies).map((classId) => ({ kind: "boss", bossId: provingBossId(classId), chance }));
}

/** `provingSources` for every class whose own element is `element`. */
export function provingSourcesOf(element: Element, chance: number): FoundSource[] {
  return provingSources(chance, (c) => CLASSES[c].element === element);
}

/**
 * One `boss` source per Delve encounter, restricted to one run mode — how "any Abyssal
 * Rift boss" is said without a wildcard. A rift's boss is `bossFor(effective depth)`,
 * so which of the five you meet depends on the tier; listing all five is the honest
 * shape of "the boss at the bottom of the rift".
 */
export function riftBossSources(
  mode: RunModeId, chance: number, minTier?: number, pool?: DropPool,
): FoundSource[] {
  return BOSSES.map((b) => ({
    kind: "boss", bossId: b.id, chance, mode,
    ...(minTier !== undefined ? { minTier } : {}),
    ...(pool !== undefined ? { pool } : {}),
  }));
}

/**
 * The **easiest** run a source can pay out on: the effective depth of the shallowest
 * qualifying floor, and the `danger` that floor is fought at.
 *
 * This is the basis of the relic level gate (`relicRequiredLevel` in `data/relics.ts`). A
 * relic has no `ilvl`, so unlike an item it cannot derive a requirement from its own power;
 * what it has instead is a drop site, and a drop site already carries an authored
 * difficulty. Reading that rather than authoring a level per definition is the same call
 * `requiredLevel()` makes for gear: derived cannot drift, and a relic added tomorrow is
 * gated for free with no number to forget.
 *
 * Three things make this a *reading* rather than a second model of the world:
 *
 *  - **The configuration is asked, never restated.** `riftConfig`, `raidConfig` and
 *    `towerConfig` are called for the depth and danger they actually produce, so a retuned
 *    `baseDepth` or `dangerPerTier` moves the gate with it and no rift maths is copied here.
 *  - **`bossFor` answers which boss a floor spawns**, rather than this file assuming a
 *    rift's boss is whatever its lowest tier meets. `riftBossSources` lists all five Delve
 *    encounters per rift, so "the Colossus, in the Abyss" is a real and much deeper ask than
 *    "the Abyss"; searching for the tier that actually spawns it is what tells them apart.
 *  - **Every constraint on the source composes as a maximum**, because `sourceMatches`
 *    composes them as a conjunction. A source that demands both `minDepth` 25 and a boss
 *    first reachable at depth 25 is satisfied at 25; one that demands `minDepth` 25 of a
 *    boss first reachable at 10 is not satisfied until 25.
 *
 * A `craft` source returns the shallowest possible run — a relic may never carry one, and a
 * named item's recipe is a purchase rather than a floor. So does a `chest`, for the same
 * reason: a chest is bought, and its tier says nothing about where you were standing.
 */
export interface SourceFloor {
  /** Effective depth of the shallowest floor that satisfies the source. */
  readonly depth: number;
  /** The `danger` that floor is fought at, with the Challenger dial off. */
  readonly danger: number;
}

/** The shallowest run in the game: depth 1 at danger 1. What an unreachable source falls back to. */
const SHALLOWEST: SourceFloor = { depth: 1, danger: 1 };

/**
 * How far to walk a rift's or a raid's tier ladder looking for the floor that spawns a
 * named boss. Both ladders are unbounded, so the search needs a stop; past this, a source
 * naming a boss its mode never spawns falls back to that mode's own first tier rather than
 * looping. Far beyond any authored `minTier` (the deepest is 8) and past the point every
 * `BOSSES` entry has been reached, so raising it can only ever change an answer that is
 * already a fallback.
 */
const TIER_SEARCH_LIMIT = 40;

/** The rift floor a source's constraints first admit, or null when the mode isn't a rift. */
function riftFloor(mode: RunModeId | undefined, minTier: number | undefined, floor: "first" | "last"): SourceFloor | null {
  if (mode === undefined) return null;
  const spec = MODES[mode];
  if (!spec?.isRift) return null;
  const cfg = riftConfig(mode, Math.max(1, minTier ?? 1), floor === "last" ? spec.floors : 1);
  return { depth: cfg.depth, danger: cfg.danger };
}

export function sourceFloor(src: DropSource): SourceFloor {
  switch (src.kind) {
    case "boss": {
      // A Proving is the bottom of the Delve, whatever else its id says.
      if (provingClassOf(src.bossId) !== null) return { depth: DELVE_BOTTOM, danger: 1 };
      const rift = riftBossFloor(src);
      // `sourceMatches` conjoins the boss id with `minDepth`, so the two compose as a max.
      const floor = rift ?? anyModeBossFloor(src.bossId);
      return src.minDepth !== undefined && src.minDepth > floor.depth
        ? { depth: src.minDepth, danger: floor.danger }
        : floor;
    }
    case "clearCache": {
      // `lastFloor` is the cache that closes a rift — the deepest floor of the run, and the
      // one you only reach by killing the boss. Without it, floor 1 already qualifies.
      const rift = riftFloor(src.mode, src.minTier, src.lastFloor ? "last" : "first");
      if (!rift) return { depth: Math.max(1, src.minDepth), danger: 1 };
      return { depth: Math.max(src.minDepth, rift.depth), danger: rift.danger };
    }
    case "worldDrop": {
      const rift = riftFloor(src.mode, undefined, "first");
      if (!rift) return { depth: Math.max(1, src.minDepth), danger: 1 };
      return { depth: Math.max(src.minDepth, rift.depth), danger: rift.danger };
    }
    case "tower": {
      // A height, not a depth — but the Tower walks the Delve's own curve height-for-depth
      // (UAT §21), so the level a climb wants is the level that depth wants. `towerConfig`
      // is asked for it rather than assumed, because that identity is a property `npm run
      // world` asserts and not something this file should restate.
      const cfg = towerConfig(Math.max(1, src.minFloor));
      return { depth: cfg.depth, danger: cfg.danger };
    }
    case "raid": {
      const spec = RAID_BY_ID[src.raidId];
      if (!spec) return SHALLOWEST;
      const cfg = raidConfig(spec, Math.max(1, src.minTier ?? 1));
      return { depth: cfg.depth, danger: cfg.danger };
    }
    case "chest":
    case "craft":
      return SHALLOWEST;
  }
}

/**
 * The shallowest floor anywhere that spawns this boss id, for a source that named no rift.
 *
 * Every id the game can generate is resolved here, in the same order and by the same reads
 * `bossDisplayName` uses — a Delve encounter, a Tower order, a sector boss, a raid
 * encounter. That matters more than it looks: a source naming a boss this function does not
 * recognise falls back to the shallowest run in the game, which is the weakest possible gate,
 * so an unhandled id fails *open*. Only ids nothing can emit are meant to land there.
 *
 * The two ladders are each read off their own table rather than off the other's:
 * `bossFor` puts the i-th `BOSSES` entry at depth `5*(i+1)`, and `towerBossSpec` puts the
 * i-th `TOWER_BOSSES` entry at *height* `5*(i+1)` — the same arithmetic on a different
 * ladder, which is exactly why the height is taken to `towerConfig` rather than used as a
 * depth directly. A height is not a depth (UAT §21), even where the numbers agree.
 */
function anyModeBossFloor(bossId: string): SourceFloor {
  const delve = BOSSES.findIndex((b) => b.id === bossId);
  if (delve >= 0) return { depth: (delve + 1) * 5, danger: 1 };

  // A Tower order (`tower-<templateId>`). Its first height is its index on `TOWER_BOSSES`.
  const tower = TOWER_BOSSES.findIndex((b) => `tower-${b.templateId}` === bossId);
  if (tower >= 0) {
    const cfg = towerConfig((tower + 1) * 5);
    return { depth: cfg.depth, danger: cfg.danger };
  }

  // A Reliquary sector boss (`planet-<planetId>`). A sector run is rift-shaped, so its boss
  // stands on its last floor, and the cheapest way to meet it is the sector's first tier.
  const planet = PLANETS.find((pl) => `planet-${pl.id}` === bossId);
  if (planet) {
    const cfg = planetConfig(planet, 1, planet.floors);
    return { depth: cfg.depth, danger: cfg.danger };
  }

  // A raid encounter (`raid-<raidId>`) named as a boss rather than through a `raid` source.
  const raid = raidOfBossId(bossId);
  if (raid) {
    const cfg = raidConfig(raid, 1);
    return { depth: cfg.depth, danger: cfg.danger };
  }

  return SHALLOWEST;
}

/**
 * The shallowest rift tier whose boss floor actually spawns `src.bossId`, or null when the
 * source names no rift.
 *
 * The search is what makes this honest. A rift's boss is `bossFor(effective depth)`, so
 * which of the five you meet is a function of the tier — and `riftBossSources` writes all
 * five out per rift precisely because of that. Taking the lowest allowed tier's depth for
 * every one of them would say the Colossus is as cheap as the Herald, and quietly hand the
 * deepest artifact in the Abyss the gate of its shallowest.
 */
function riftBossFloor(src: Extract<FoundSource, { kind: "boss" }>): SourceFloor | null {
  const mode = src.mode;
  if (mode === undefined) return null;
  const spec = MODES[mode];
  if (!spec?.isRift) return null;
  const lowest = Math.max(1, src.minTier ?? 1);
  for (let tier = lowest; tier <= TIER_SEARCH_LIMIT; tier++) {
    const cfg = riftConfig(mode, tier, spec.floors);
    if (bossFor(cfg.depth).id === src.bossId) return { depth: cfg.depth, danger: cfg.danger };
  }
  // Nothing in this rift's reachable ladder spawns it. Fall back to its own first
  // qualifying tier rather than to depth 1 — the mode is still a real constraint.
  return riftFloor(mode, src.minTier, "last");
}

/**
 * The character level the shallowest run that can pay out `src` asks for — `levelAdvice`,
 * the same formula behind `DepthProfile.recommendedLevel`, asked about that floor.
 *
 * Danger is included rather than divided out, and that is deliberate: a rift tier, a raid
 * tier and a sector tier are part of *where the thing drops*, not weather laid over it. The
 * Challenger dial is the opposite and is absent here by construction — `riftConfig`,
 * `raidConfig` and `towerConfig` are all called with the dial at zero, so a player cannot
 * raise a relic's requirement by turning their own difficulty up.
 */
export function sourceLevel(src: DropSource): number {
  const floor = sourceFloor(src);
  return levelAdvice(floor.depth, floor.danger);
}

// --- reading a source -----------------------------------------------------------------

/**
 * Display name for a boss id — delve, sector, or a class's Proving. Falls back to the id
 * so a typo is visible. Moved here from `named.ts` unchanged when relics arrived, so both
 * tables (and the §20 preview) read one resolution; `named.ts` re-exports it.
 */
export function bossDisplayName(bossId: string): string {
  const delve = BOSSES.find((b) => b.id === bossId);
  if (delve) return delve.name;
  const planet = PLANETS.find((p) => `planet-${p.id}` === bossId);
  if (planet) return planet.bossName;
  // A Proving (UAT §13): `legend-<classId>`, generated rather than authored, so it is
  // resolved rather than listed. Without this the source line would print the raw id.
  // A raid encounter (UAT §15): `raid-<raidId>`, generated from the raid table the same
  // way a Proving's is generated from the class roster, so it is resolved rather than listed.
  const raid = raidOfBossId(bossId);
  if (raid) return raid.name;
  const legend = CLASS_IDS.find((id) => `legend-${id}` === bossId);
  return legend ? legendName(legend) : bossId;
}

function pct(c: number): string {
  return `${Math.round(c * 1000) / 10}%`;
}

function modeSuffix(src: { mode?: RunModeId; minTier?: number }): string {
  const parts: string[] = [];
  if (src.mode) parts.push(`in the ${MODES[src.mode].name}`);
  if (src.minTier !== undefined) parts.push(`from tier ${src.minTier}`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

/** "Drops from the Warden of the First Seal in the Abyssal Rift (12%)" — one source, one line. */
export function foundSourceLine(s: FoundSource): string {
  switch (s.kind) {
    case "boss": {
      const depth = s.minDepth !== undefined ? ` at depth ${s.minDepth}+` : "";
      return `Drops from ${bossDisplayName(s.bossId)}${modeSuffix(s)}${depth} (${pct(s.chance)})`;
    }
    case "chest": return `Found in ${chestName(s.tier)} chests (${pct(s.chance)} per pull)`;
    case "clearCache": {
      const where = s.lastFloor ? "In the cache that closes a rift" : `In the clear cache from depth ${s.minDepth}`;
      return `${where}${modeSuffix(s)} (${pct(s.chance)})`;
    }
    case "worldDrop":
      return `Dropped by monsters from depth ${s.minDepth}${modeSuffix(s)} (${pct(s.chance)} per kill, elites triple)`;
    case "raid": {
      const raid = RAID_BY_ID[s.raidId];
      const tier = s.minTier !== undefined ? ` from tier ${s.minTier}` : "";
      return `Drops in the ${raid?.name ?? s.raidId} raid${tier} (${pct(s.chance)})`;
    }
    case "tower": return `In the clear cache of a Tower floor from height ${s.minFloor} (${pct(s.chance)})`;
  }
}

/**
 * Collapses a run of Proving sources into one line — twenty-one "Drops from The Unfinished
 * X" rows say less than "Recovered from the Proving of any lightning Legend" does. Other
 * sources come back one line each, in order.
 */
export function foundSourceLines(sources: readonly DropSource[]): string[] {
  const out: string[] = [];
  const provings = sources.filter((s): s is Extract<FoundSource, { kind: "boss" }> => s.kind === "boss" && provingClassOf(s.bossId) !== null);
  let provingDone = false;
  for (const s of sources) {
    if (s.kind === "craft") continue;
    if (s.kind === "boss" && provingClassOf(s.bossId) !== null) {
      if (provingDone) continue;
      provingDone = true;
      const classes = provings.map((p) => provingClassOf(p.bossId)!);
      const elements = new Set(classes.map((c) => CLASSES[c].element));
      const who = classes.length === CLASS_IDS.length
        ? "any Legend"
        : elements.size === 1 && classes.length === CLASS_IDS.filter((c) => CLASSES[c].element === [...elements][0]).length
          ? `any ${[...elements][0]} Legend (${classes.map((c) => CLASSES[c].name).join(", ")})`
          : classes.map((c) => CLASSES[c].name).join(", ");
      out.push(`Recovered from the Proving of ${who} (${pct(provings[0]!.chance)})`);
      continue;
    }
    out.push(foundSourceLine(s));
  }
  return out;
}

// --- validation --------------------------------------------------------------------

/** Everything structurally wrong with one found source, as sentences. */
export function foundSourceProblems(s: FoundSource): string[] {
  const out: string[] = [];
  const chanceOk = s.chance > 0 && s.chance <= 1;
  if (!chanceOk) out.push(`${s.kind} chance ${s.chance} is not in (0, 1]`);
  if ("mode" in s && s.mode !== undefined && !(RUN_MODES as readonly string[]).includes(s.mode)) {
    out.push(`${s.kind} source names mode "${s.mode}", which is not a run mode`);
  }
  if ("minTier" in s && s.minTier !== undefined && !(s.minTier >= 1)) out.push(`${s.kind} minTier must be >= 1`);
  switch (s.kind) {
    case "boss":
      if (bossDisplayName(s.bossId) === s.bossId) out.push(`boss source "${s.bossId}" names no boss`);
      if (s.minDepth !== undefined && !(s.minDepth >= 1)) out.push("boss minDepth must be >= 1");
      break;
    case "chest":
      if (!(CHEST_TIERS as readonly string[]).includes(s.tier)) out.push(`chest source "${s.tier}" names no chest tier`);
      break;
    case "clearCache":
      if (!(s.minDepth >= 1)) out.push("clear-cache minDepth must be >= 1");
      if (s.lastFloor && s.mode !== undefined && !MODES[s.mode].isRift) out.push(`clear-cache lastFloor means nothing in the ${MODES[s.mode].name}`);
      break;
    case "worldDrop":
      if (!(s.minDepth >= 1)) out.push("world-drop minDepth must be >= 1");
      break;
    case "raid":
      if (!s.raidId.trim()) out.push("raid source needs a raid id");
      else if (!RAID_BY_ID[s.raidId]) out.push(`raid source "${s.raidId}" names no raid`);
      break;
    case "tower":
      if (!(s.minFloor >= 1)) out.push("tower minFloor must be >= 1");
      // A height, deliberately: writing this as a depth is the §21 leak the whole
      // recordHeight/recordDepth split exists to prevent.
      break;
  }
  return out;
}
