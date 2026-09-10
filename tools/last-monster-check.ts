/**
 * Investigation, not a test: docket §6, "a map, and finding the last monster" (PM
 * lootsim-21, 2026-09-10). Before designing anything, measure whether the docket's
 * premise ("players spend time looking for one last monster") still holds today —
 * `docs/campaign-pathing-bias.md` and `tools/monster-pathing.ts` already fixed and
 * pinned the specific "a monster loses its route while resting flush against a wall"
 * bug, and today's own `fix/stuck-in-walls` closed genuine wall-embedding on top of
 * that, so the two most obvious "stuck monster" mechanisms may already be gone. This
 * measures the actual symptom directly — how long a real bot takes to close out the
 * last kill relative to the rest of the floor — rather than re-deriving either fix.
 *
 * Uses `campaign()` rather than dropping a hand-geared character straight onto a deep
 * floor: a first pass tried `geared(depth * 0.9)` dives at depths up to 40 and every
 * single one ended in `dead` within 15 seconds at 0/1 kills — depth 30 is "far beyond
 * the measured frontier" per CLAUDE.md for exactly this reason, and a character that
 * never gets there through real play is not the population this docket item is about.
 * `campaign()` is the same instrument the sharp-vs-reckless promise is measured with:
 * it levels and gears itself up one floor at a time, so whatever depths it actually
 * reaches are depths a real character could actually be standing on.
 *
 * `npx tsx tools/last-monster-check.ts`
 */

import { Dungeon } from "../src/game/dungeon";
import { CAMPAIGN_SEEDS, campaign } from "./bot";

interface FloorSample {
  depth: number; rooms: number; totalTime: number; lastGap: number;
  lastGapPct: number; longestNullStreak: number;
}

const samples: FloorSample[] = [];
/** Sustained null-route streaks (seconds) seen anywhere in a last-kill window, across
 *  every floor measured — not tick counts, which conflate one long stall with many short
 *  ones. `FlowField` rebuilds 4x/second (CLAUDE.md), so anything under ~0.25s is a gap
 *  between rebuilds self-correcting, not a stuck monster a player could ever notice. */
const allStreaks: number[] = [];

function measure(seed: number, dodge: number) {
  let killTimes: number[] = [];
  let longestNullStreak = 0;
  let curDepth = -1;
  const nullSince = new Map<number, number>(); // enemy id -> tick-time its null streak started
  const onTick = (d: Dungeon, t: number) => {
    if (d.profile.depth !== curDepth) {
      // A new floor — flush whatever the previous one recorded, reset for this one.
      curDepth = d.profile.depth;
      killTimes = [];
      longestNullStreak = 0;
      nullSince.clear();
    }
    while (killTimes.length < d.killsSoFar) killTimes.push(t);
    if (d.killsRequired - d.killsSoFar <= 1 && d.phase === "fighting") {
      const seenIds = new Set<number>();
      for (const hero of d.heroes) {
        for (const e of d.enemies) {
          if (e.health <= 0 || !e.fromWave || e.state === "spawning") continue;
          seenIds.add(e.id);
          const routed = hero.flow?.direction(d.level, e.x, e.y);
          if (routed === null || routed === undefined) {
            if (!nullSince.has(e.id)) nullSince.set(e.id, t);
          } else if (nullSince.has(e.id)) {
            const streak = t - nullSince.get(e.id)!;
            longestNullStreak = Math.max(longestNullStreak, streak);
            allStreaks.push(streak);
            nullSince.delete(e.id);
          }
        }
      }
      // A dead or despawned enemy's streak ends too — otherwise a stall that's still
      // "open" when the enemy is killed never gets recorded.
      for (const id of [...nullSince.keys()]) {
        if (!seenIds.has(id)) {
          const streak = t - nullSince.get(id)!;
          longestNullStreak = Math.max(longestNullStreak, streak);
          allStreaks.push(streak);
          nullSince.delete(id);
        }
      }
    }
    if (d.phase === "cleared" && killTimes.length >= 2) {
      const lastGap = killTimes[killTimes.length - 1]! - killTimes[killTimes.length - 2]!;
      samples.push({
        depth: curDepth, rooms: d.level.rooms, totalTime: t, lastGap,
        lastGapPct: (lastGap / t) * 100, longestNullStreak,
      });
    }
  };
  campaign(seed, dodge, 20, false, onTick);
}

console.log("=== the gap between the second-to-last and the last kill, real campaign play ===");
for (const seed of CAMPAIGN_SEEDS.slice(0, 24)) measure(seed, 0.55);
console.log(`${samples.length} cleared floors measured, depths ${Math.min(...samples.map((s) => s.depth))}-${Math.max(...samples.map((s) => s.depth))}`);

function stats(xs: number[]) {
  const sorted = [...xs].sort((a, b) => a - b);
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return { avg, median, min: sorted[0]!, max: sorted[sorted.length - 1]! };
}

const gapStats = stats(samples.map((s) => s.lastGap));
const pctStats = stats(samples.map((s) => s.lastGapPct));
console.log(
  `last-kill gap (seconds) — avg ${gapStats.avg.toFixed(1)}, median ${gapStats.median.toFixed(1)}, ` +
  `min ${gapStats.min.toFixed(1)}, max ${gapStats.max.toFixed(1)}`,
);
console.log(
  `as % of the whole floor's clear time — avg ${pctStats.avg.toFixed(1)}%, median ${pctStats.median.toFixed(1)}%, ` +
  `max ${pctStats.max.toFixed(1)}%`,
);
if (allStreaks.length > 0) {
  const streakStats = stats(allStreaks);
  const overRebuild = allStreaks.filter((s) => s > 0.25).length;
  console.log(
    `null-route streaks in the last-kill window: ${allStreaks.length} total, ` +
    `avg ${streakStats.avg.toFixed(2)}s, max ${streakStats.max.toFixed(2)}s; ` +
    `${overRebuild} lasted longer than one flow-field rebuild (0.25s)`,
  );
} else {
  console.log("null-route streaks in the last-kill window: none");
}

const byDepth = new Map<number, FloorSample[]>();
for (const s of samples) byDepth.set(s.depth, [...(byDepth.get(s.depth) ?? []), s]);
console.log("\nby depth (avg gap seconds, avg rooms, worst gap this depth, n):");
for (const [depth, atDepth] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
  const g = stats(atDepth.map((s) => s.lastGap));
  const avgRooms = atDepth.reduce((a, s) => a + s.rooms, 0) / atDepth.length;
  console.log(
    `  depth ${String(depth).padStart(2)}: avg gap ${g.avg.toFixed(1)}s, worst ${g.max.toFixed(1)}s, ` +
    `avg rooms ${avgRooms.toFixed(1)}, n=${atDepth.length}`,
  );
}

console.log("\nworst 10 individual floors (gap seconds, depth, rooms, total floor time, longest null streak that floor):");
const worst = [...samples].sort((a, b) => b.lastGap - a.lastGap).slice(0, 10);
for (const s of worst) {
  console.log(
    `  ${s.lastGap.toFixed(1)}s gap · depth ${s.depth} · ${s.rooms} rooms · ` +
    `floor took ${s.totalTime.toFixed(1)}s total (${s.lastGapPct.toFixed(1)}% of it) · ` +
    `longest null streak ${s.longestNullStreak.toFixed(2)}s`,
  );
}
