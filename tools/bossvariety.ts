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

import {
  BOSSES, BOSS_ABILITIES, HUNT_SPEED, PATTERNS, PATTERN_IDS, isPattern, type BossAbilityId, type BossSpec,
} from "../src/data/bosses";
import { CLASSES, CLASS_IDS } from "../src/data/classes";
import { DASH_SPEED, PLAYER_SPEED } from "../src/game/dungeon";
import { SANCTUARY_FAR_MIN, SANCTUARY_NEAR_REACH } from "../src/game/boss";
import { LEGENDS, legendBossSpec } from "../src/data/legends";
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

// 1. The property the owner's complaint was actually about. A direct identity
//    comparison, not a bound: two encounters may not BE the same fight.
check(clones.length === 0, `no two encounters have an identical kit and opener (${clones.length} pairs do)`);

// 2. The deck may not contain wallpaper. An ability every encounter can cast says
//    nothing about any of them; one nothing casts is authored and dead.
const dead = vocabulary.filter((id) => (usage.get(id) ?? 0) === 0);
check(dead.length === 0, `no ability is authored and never used (${dead.join(", ") || "none"})`);
const wallpaper = vocabulary.filter((id) => (usage.get(id) ?? 0) === entries.length);
check(wallpaper.length === 0, `no ability is in every single kit (${wallpaper.join(", ") || "none"})`);

// 3. The raids are the half that matters most, so they are held to the strongest
//    property that is true: each one's kit is unique to it, and no *non*-raid encounter
//    holds a raid's whole signature. A raid's hand is its own even though, today, no
//    single ability is reserved to raids — see the note in `docs/boss-abilities.md`.
const raidEntries = entries.filter((e) => e.group === "raid");
const others = entries.filter((e) => e.group !== "raid");
let raidSignatureShared: string[] = [];
for (const r of raidEntries) {
  const spec = RAIDS.find((x) => raidBossSpec(x).id === r.spec.id);
  if (!spec) continue;
  const sig = new Set(spec.signature);
  for (const o of others) {
    const k = kit(o.spec);
    if ([...sig].every((id) => k.has(id))) raidSignatureShared.push(`${r.label} <= ${o.group}/${o.label}`);
  }
}
check(
  raidSignatureShared.length === 0,
  `no non-raid encounter holds a raid's whole signature (${raidSignatureShared.join("; ") || "none"})`,
);

const raidPairs: number[] = [];
for (let i = 0; i < raidEntries.length; i++) {
  for (let j = i + 1; j < raidEntries.length; j++) {
    raidPairs.push(jaccard(kit(raidEntries[i]!.spec), kit(raidEntries[j]!.spec)));
  }
}
const rs = stats(raidPairs);
check(rs.max < 1, `no two raids are the same fight (worst pair ${pct(rs.max)})`);
// A comparison against the roster, not a tuned threshold: the four set pieces have to be
// more distinct from each other than an average pair of encounters is.
check(
  rs.mean <= ks.mean,
  `the raids differ from each other more than the roster average (raids ${pct(rs.mean)} vs roster ${pct(ks.mean)})`,
);

// 4. The Provings must stay de-converged. 21 classes resolving to 5 fights was the worst
//    number in the original report: the encounter's whole premise is that it is *your*
//    Legend's missing half. Asserted as a comparison against the roster average rather
//    than as a bound, because a bound would let the shared core creep back one card at a
//    time and stay green until it was all the way back.
const provings = entries.filter((e) => e.group === "proving");
const provingPairs: number[] = [];
for (let i = 0; i < provings.length; i++) {
  for (let j = i + 1; j < provings.length; j++) {
    provingPairs.push(jaccard(kit(provings[i]!.spec), kit(provings[j]!.spec)));
  }
}
const ps = stats(provingPairs);
check(ps.max < 1, `no two classes get the same Proving (worst pair ${pct(ps.max)})`);
// Every class's pair of signature cards is its own, which is what stops the shared core
// from being the whole fight again.
const sigs = new Map<string, string>();
let dupeSignature: string[] = [];
for (const id of CLASS_IDS) {
  const key = [...LEGENDS[id].signature].sort().join("+");
  const held = sigs.get(key);
  if (held) dupeSignature.push(`${held} == ${id} (${key})`);
  else sigs.set(key, id);
}
check(dupeSignature.length === 0, `no two classes carry the same Proving signature (${dupeSignature.join("; ") || "none"})`);

// 5. `hunt` has to be outrunnable by the slowest character the roster can produce.
//    A chasing shape that outruns the slowest unbuffed class is a damage tick, not a
//    mechanic — and this is written as a comparison against the roster for the reason
//    CLAUDE.md's campaign-comparison lesson gives: a bounded constant would stay green
//    through a class rebalance that made somebody slower.
const slowestMoveSpeed = Math.min(...CLASS_IDS.map((id) => CLASSES[id].base.moveSpeed ?? 0));
const slowestClassSpeed = PLAYER_SPEED * (1 + slowestMoveSpeed);
check(
  HUNT_SPEED < slowestClassSpeed,
  `a hunt shape can be outrun by the slowest class (hunt ${HUNT_SPEED} < ${slowestClassSpeed.toFixed(1)} u/s)`,
);

// 6. `sanctuary` must always offer safe ground near the body, or it is a flat
//    melee-uptime tax in the costume of a mechanic. Again a comparison: the guaranteed
//    near disc's furthest possible placement has to be inside the nearest possible
//    scattered one, so the two constants cannot cross without going red.
check(
  SANCTUARY_NEAR_REACH < SANCTUARY_FAR_MIN,
  `a sanctuary always offers a disc nearer than any scattered one (${SANCTUARY_NEAR_REACH} < ${SANCTUARY_FAR_MIN})`,
);

// 7. The bullet-hell patterns (docs/boss-bullet-hell.md). Three comparisons, none a bound:
//    a dash always beats them, so no pattern's bolt may be as fast as a dash; a ring's
//    gap has to be wide enough to walk a hero through at the distance it is fired; and
//    "every boss got new cards" is a claim about every encounter, so it is walked.
const HERO_RADIUS = 10; // `Avatar.radius` in `game/dungeon.ts`
const tooFast = PATTERN_IDS.filter((id) => PATTERNS[id].bulletSpeed >= DASH_SPEED);
check(
  tooFast.length === 0,
  `every pattern's bolts are slower than a dash (${PATTERN_IDS.map((id) => `${id} ${PATTERNS[id].bulletSpeed}`).join(", ")} < ${DASH_SPEED})`,
);
// A ring's gap, measured at the radius the ring is at when it matters: a `noose` at the
// distance it is spawned, a `rings` ring by the time it has crossed a hero's own reach.
const gapAt = (id: "rings" | "noose", radius: number) => {
  const n = BOSS_ABILITIES[id].count;
  const bolts = Math.max(1, Math.round(n * PATTERNS[id].gap));
  // The angular hole is the gap's bolt slots plus the half-slot either side of them.
  return ((bolts + 1) / n) * 2 * Math.PI * radius - 2 * PATTERNS[id].bulletRadius;
};
const need = 2 * HERO_RADIUS + 8;
check(
  gapAt("noose", PATTERNS.noose.reach) > need && gapAt("rings", 60) > need,
  `a ring's door is wider than a hero (noose ${gapAt("noose", PATTERNS.noose.reach).toFixed(0)}u at ${PATTERNS.noose.reach}, rings ${gapAt("rings", 60).toFixed(0)}u at 60; hero needs ${need})`,
);
const noPattern = entries.filter((e) => !e.spec.phases[e.spec.phases.length - 1]!.abilities.some(isPattern));
check(
  noPattern.length === 0,
  `every encounter deals at least one pattern by its last phase (${noPattern.map((e) => e.label).join(", ") || "all " + entries.length})`,
);
const inEveryTemplate = PATTERN_IDS.filter((id) => BOSSES.every((b) => b.phases.some((p) => p.abilities.includes(id))));
check(
  inEveryTemplate.length === 0,
  `no pattern is dealt into every template (${inEveryTemplate.join(", ") || "none"})`,
);

console.log("");
if (failures > 0) {
  console.error(`boss variety: ${failures} failure(s)`);
  process.exit(1);
}
console.log("boss variety: all checks passed");
