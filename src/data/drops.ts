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
 * `raid` and `tower` are RESERVED. They are new addressing (a raid is not a boss floor,
 * a tower floor is not a depth), typed here so UAT §15 and §21 can hang their own drops
 * off the table without a schema change — but no site emits their queries yet, so
 * `LIVE_SOURCE_KINDS` says which kinds can actually pay out today and the acceptance
 * tools refuse a definition that hides behind a reserved one.
 *
 * Pure data + pure functions. Imports only types and registries from `data/`.
 */

import { BOSSES } from "./bosses";
import { rewardCurve } from "./rewards";
import { CHEST_TIERS, chestName, type ChestTier } from "./chests";
import { CLASS_IDS, CLASSES, type ClassId } from "./classes";
import type { ItemRequirement } from "./crafting";
import type { Element } from "./elements";
import { legendName } from "./legends";
import type { MaterialBag } from "./materials";
import { MODES, RUN_MODES, type RunModeId } from "./modes";
import { PLANETS } from "./planets";

// --- sources ----------------------------------------------------------------

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
    }
  /** Any wave monster at least this deep. Elites triple the odds. */
  | { readonly kind: "worldDrop"; readonly minDepth: number; readonly chance: number; readonly mode?: RunModeId }
  /** RESERVED for UAT §15 — a raid encounter by id. No site emits this query yet. */
  | { readonly kind: "raid"; readonly raidId: string; readonly chance: number }
  /** RESERVED for UAT §21 — a tower floor at least this high. No site emits this query yet. */
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
export const LIVE_SOURCE_KINDS: readonly FoundSource["kind"][] = ["boss", "chest", "clearCache", "worldDrop"];

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
  | { readonly kind: "raid"; readonly raidId: string }
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
      return q.kind === "raid" && src.raidId === q.raidId;
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
 * Rolls a table for one event. Each matching source is an independent roll, so a
 * definition listed under two sources gets two shots but drops at most once; an elite
 * triples a world-drop source's odds; `danger` (rift tier × Challenger) lifts every
 * chance through `dropChance`. `skip` is ids that must not drop — a relic the account
 * already owns. Returns the definitions that hit, in registry order; the caller forges.
 */
export function rollTable<T extends TableEntry>(
  defs: readonly T[],
  q: DropQuery,
  rng: { chance(p: number): boolean },
  danger = 1,
  skip?: ReadonlySet<string>,
): T[] {
  const out: T[] = [];
  for (const def of defs) {
    if (skip?.has(def.id)) continue;
    for (const src of def.sources) {
      if (src.kind === "craft" || !sourceMatches(src, q)) continue;
      let base = src.chance;
      if (q.kind === "worldDrop" && q.elite) base *= 3;
      if (rng.chance(dropChance(base, danger))) {
        out.push(def);
        break;
      }
    }
  }
  return out;
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
export function riftBossSources(mode: RunModeId, chance: number, minTier?: number): FoundSource[] {
  return BOSSES.map((b) => ({
    kind: "boss", bossId: b.id, chance, mode,
    ...(minTier !== undefined ? { minTier } : {}),
  }));
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
    case "raid": return `Raid reward — ${s.raidId} (${pct(s.chance)}; raids are not in the game yet)`;
    case "tower": return `Tower reward from floor ${s.minFloor} (${pct(s.chance)}; the tower is not in the game yet)`;
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
      break;
    case "tower":
      if (!(s.minFloor >= 1)) out.push("tower minFloor must be >= 1");
      break;
  }
  return out;
}
