/**
 * How much do the bosses actually differ? — the instrument, not the fix.
 *
 * The owner's complaint was that every boss "seems to fight the same and use the same
 * abilities". That is a measurable claim, so it gets measured before anything is built,
 * and the measurement stays in the repo afterwards so the *next* person can tell whether
 * a change helped rather than reasoning about it.
 *
 * What it enumerates is every encounter the game can actually spawn — not just the five
 * authored ones:
 *
 *  - the 5 hand-authored `BOSSES`, picked by depth,
 *  - the 21 Provings (`legendBossSpec`), one per class,
 *  - the 4 raids (`raidBossSpec`),
 *  - the 9 Reliquary sector bosses (`planetBossSpec`),
 *  - the 5 Tower bosses (`towerBossSpec`).
 *
 * and reports three numbers per encounter and three about the roster:
 *
 *  - **kit size** — distinct `BossAbilityId`s the encounter can ever cast,
 *  - **opener** — what phase one alone can cast, which is what a player reads first,
 *  - **exclusive** — abilities *only* this encounter has, out of the whole roster,
 *  - **pairwise Jaccard overlap** — |A∩B| / |A∪B| over the full kits, and the same over
 *    the openers, because two fights that end up in the same place can still open
 *    differently and that is most of what "reads as its own fight" means,
 *  - **clones** — pairs whose kits are byte-identical, phase for phase.
 *
 * Jaccard because it is the honest measure here: it does not reward a boss for having a
 * big kit, only for having a *different* one.
 *
 * There is a threshold section at the end, deliberately loose and deliberately one-sided
 * in the direction that cannot be gamed: it asserts things that are true of a varied
 * roster and false of a uniform one. Per `CLAUDE.md`'s lesson about one-sided bounds,
 * the clone check is written as a direct comparison (this kit equals that kit) rather
 * than as a bound on some aggregate.
 *
 * Headless, no browser. Run with `npm run bossvariety`.
 */

import { BOSSES, BOSS_ABILITIES, type BossAbilityId, type BossSpec } from "../src/data/bosses";
import { CLASS_IDS } from "../src/data/classes";
import { legendBossSpec } from "../src/data/legends";
import { PLANETS, planetBossSpec } from "../src/data/planets";
import { RAIDS, raidBossSpec } from "../src/data/raids";
import { towerBossSpec } from "../src/data/tower";

let failures = 0;
function fail(msg: string): void { failures++; console.error(`  FAIL ${msg}`); }
function ok(msg: string): void { console.log(`  ok   ${msg}`); }
function check(cond: boolean, msg: string): void { cond ? ok(msg) : fail(msg); }

// --- the roster -------------------------------------------------------------

interface Entry {
  readonly group: string;
  readonly label: string;
  readonly spec: BossSpec;
}

/**
 * Every encounter the game can spawn, in the groups a player would recognise.
 *
 * Memories are deliberately not a group of their own: `memoryBossSpec` reskins an entry
 * that is already in this list without touching its phases, so counting them again would
 * inflate the roster with exact duplicates of rows already here and make the overlap
 * numbers look worse than the content is.
 */
function roster(): Entry[] {
  const out: Entry[] = [];
  for (const b of BOSSES) out.push({ group: "authored", label: b.id, spec: b });
  for (const id of CLASS_IDS) out.push({ group: "proving", label: id, spec: legendBossSpec(id) });
  for (const r of RAIDS) out.push({ group: "raid", label: r.id, spec: raidBossSpec(r) });
  for (const p of PLANETS) out.push({ group: "sector", label: p.id, spec: planetBossSpec(p) });
  for (const h of [5, 10, 15, 20, 25]) {
    const spec = towerBossSpec(h);
    out.push({ group: "tower", label: `h${h} ${spec.id}`, spec });
  }
  return out;
}

/** Everything this encounter can ever cast. */
function kit(spec: BossSpec): Set<BossAbilityId> {
  const out = new Set<BossAbilityId>();
  for (const phase of spec.phases) for (const id of phase.abilities) out.add(id);
  return out;
}

/** What phase one alone can cast — the first thing a player reads about the fight. */
function opener(spec: BossSpec): Set<BossAbilityId> {
  return new Set(spec.phases[0]?.abilities ?? []);
}

function jaccard(a: ReadonlySet<BossAbilityId>, b: ReadonlySet<BossAbilityId>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const id of a) if (b.has(id)) inter++;
  return inter / (a.size + b.size - inter);
}

function sameSet(a: ReadonlySet<BossAbilityId>, b: ReadonlySet<BossAbilityId>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

function stats(xs: readonly number[]): { mean: number; median: number; max: number; min: number } {
  const sorted = [...xs].sort((p, q) => p - q);
  const mid = Math.floor(sorted.length / 2);
  return {
    mean: xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length),
    median: sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2,
    max: sorted[sorted.length - 1] ?? 0,
    min: sorted[0] ?? 0,
  };
}

function pct(x: number): string { return `${(x * 100).toFixed(1)}%`; }

// --- the report -------------------------------------------------------------

const entries = roster();
const vocabulary = Object.keys(BOSS_ABILITIES) as BossAbilityId[];

console.log("=== boss variety ===");
console.log(`vocabulary: ${vocabulary.length} abilities across ${entries.length} encounters`);
console.log("");

// How much of the deck each ability is in. An ability in every kit is wallpaper; one in
// no kit is dead weight. Both are worth seeing.
const usage = new Map<BossAbilityId, number>(vocabulary.map((id) => [id, 0]));
for (const e of entries) for (const id of kit(e.spec)) usage.set(id, (usage.get(id) ?? 0) + 1);

console.log("-- deck usage (how many encounters can cast it) --");
for (const [id, n] of [...usage].sort((a, b) => b[1] - a[1])) {
  const bar = "#".repeat(Math.round((n / entries.length) * 40));
  console.log(`  ${id.padEnd(14)} ${String(n).padStart(3)}/${entries.length} ${pct(n / entries.length).padStart(6)} ${bar}`);
}
console.log("");

// Which abilities only one encounter in the game has. This is the number that says
// whether a fight has a signature at all.
const exclusiveOf = new Map<string, BossAbilityId[]>();
for (const e of entries) {
  const mine = [...kit(e.spec)].filter((id) => (usage.get(id) ?? 0) === 1);
  if (mine.length > 0) exclusiveOf.set(`${e.group}/${e.label}`, mine);
}

console.log("-- per encounter --");
console.log(`  ${"encounter".padEnd(34)} ${"kit".padStart(4)} ${"open".padStart(5)} exclusive`);
for (const e of entries) {
  const k = kit(e.spec);
  const o = opener(e.spec);
  const mine = exclusiveOf.get(`${e.group}/${e.label}`) ?? [];
  console.log(
    `  ${`${e.group}/${e.label}`.padEnd(34)} ${String(k.size).padStart(4)} ${String(o.size).padStart(5)}` +
    `  ${mine.length > 0 ? mine.join(",") : "-"}`,
  );
}
console.log("");

// --- overlap ----------------------------------------------------------------

const kitOverlaps: number[] = [];
const openOverlaps: number[] = [];
const clones: string[] = [];
for (let i = 0; i < entries.length; i++) {
  for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i]!, b = entries[j]!;
    const ka = kit(a.spec), kb = kit(b.spec);
    kitOverlaps.push(jaccard(ka, kb));
    openOverlaps.push(jaccard(opener(a.spec), opener(b.spec)));
    if (sameSet(ka, kb) && sameSet(opener(a.spec), opener(b.spec))) {
      clones.push(`${a.group}/${a.label} == ${b.group}/${b.label}`);
    }
  }
}

const ks = stats(kitOverlaps);
const os = stats(openOverlaps);
console.log("-- pairwise overlap (Jaccard; 1.0 means the same fight) --");
console.log(`  full kit  mean ${pct(ks.mean)}  median ${pct(ks.median)}  min ${pct(ks.min)}  max ${pct(ks.max)}`);
console.log(`  opener    mean ${pct(os.mean)}  median ${pct(os.median)}  min ${pct(os.min)}  max ${pct(os.max)}`);
console.log(`  identical kits: ${clones.length} of ${kitOverlaps.length} pairs`);
for (const c of clones) console.log(`    ${c}`);
console.log("");

// Per-group means, because the groups fail differently: the sectors and the Tower borrow
// a template wholesale, so their rows are exact copies of an authored one, while the
// Provings all share `PROVING_CORE` and converge from phase two onward.
console.log("-- overlap within each group --");
const groups = [...new Set(entries.map((e) => e.group))];
for (const g of groups) {
  const within = entries.filter((e) => e.group === g);
  const xs: number[] = [];
  for (let i = 0; i < within.length; i++) {
    for (let j = i + 1; j < within.length; j++) {
      xs.push(jaccard(kit(within[i]!.spec), kit(within[j]!.spec)));
    }
  }
  if (xs.length === 0) continue;
  const s = stats(xs);
  console.log(`  ${g.padEnd(10)} n=${String(within.length).padStart(2)}  mean ${pct(s.mean)}  max ${pct(s.max)}`);
}
console.log("");

// --- thresholds -------------------------------------------------------------
//
// One-sided bounds prove very little (`CLAUDE.md`'s campaign-comparison lesson), so what
// is asserted here is mostly *comparisons and identities*: no two encounters may be the
// same fight, and every encounter must own something.

console.log("-- assertions --");

check(clones.length === 0, `no two encounters have an identical kit and opener (${clones.length} pairs do)`);

const noSignature = entries.filter((e) => (exclusiveOf.get(`${e.group}/${e.label}`) ?? []).length === 0);
check(
  noSignature.length === 0,
  `every encounter owns at least one ability nothing else has (${noSignature.length} own none)`,
);

const dead = vocabulary.filter((id) => (usage.get(id) ?? 0) === 0);
check(dead.length === 0, `no ability is authored and never used (${dead.join(", ") || "none"})`);

// Wallpaper: an ability in *every* kit says nothing about any fight. This is a comparison
// against the roster size rather than a tuned constant.
const wallpaper = vocabulary.filter((id) => (usage.get(id) ?? 0) === entries.length);
check(wallpaper.length === 0, `no ability is in every single kit (${wallpaper.join(", ") || "none"})`);

// The four raids are the half the owner cares most about: each must be more distinct from
// the others than the roster's own average pair is.
const raidEntries = entries.filter((e) => e.group === "raid");
const raidPairs: number[] = [];
for (let i = 0; i < raidEntries.length; i++) {
  for (let j = i + 1; j < raidEntries.length; j++) {
    raidPairs.push(jaccard(kit(raidEntries[i]!.spec), kit(raidEntries[j]!.spec)));
  }
}
const rs = stats(raidPairs);
check(
  rs.max < 1,
  `no two raids are the same fight (worst pair ${pct(rs.max)})`,
);
check(
  rs.mean <= ks.mean,
  `the raids differ from each other at least as much as the roster average (raids ${pct(rs.mean)} vs roster ${pct(ks.mean)})`,
);

console.log("");
if (failures > 0) {
  console.error(`boss variety: ${failures} failure(s)`);
  process.exit(1);
}
console.log("boss variety: all checks passed");
