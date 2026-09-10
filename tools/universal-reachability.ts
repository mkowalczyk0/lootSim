/**
 * Investigation, not a test: does the Universal Skill Tree's point cap describe a player
 * who exists? (PM lootsim-21, 2026-09-10.)
 *
 * `universalPointsFor(frontier) = min(20, floor(frontier/2))` only reaches its cap of 20
 * at frontier 40. `docs/reachable-band.md` already flagged, in its "derived" tier, that an
 * attentive same-level character's real frontier sits far short of that — but did not
 * simulate it, and did not check the Tower half of `GameState.frontier` at all. This
 * script does both: a fresh campaign (today's 60-seed `CAMPAIGN_SEEDS`, since master has
 * moved a lot since the reachable-band doc's own 12-seed reading) for the Delve, the same
 * shape of campaign for the Tower (nothing upstream of this script has ever run one), and
 * the actual tree-affordability math — what a realistic point count buys, not just its
 * percentage of the tree's total cost — using the same `chainTo`-style walk
 * `tools/universal.ts` already uses for its own checks.
 *
 * Nothing here changes `universalPointsFor`, `UNIVERSAL_POINT_CAP` or any tree cost — this
 * is a measurement instrument. Run with `npx tsx tools/universal-reachability.ts`.
 */

import { GameState } from "../src/game/state";
import { towerConfig } from "../src/data/tower";
import { CAMPAIGN_SEEDS, campaign, playFloor, townVisit } from "./bot";
import type { TreeNodeV2 } from "../src/progression/nodes";
import {
  UNIVERSAL_TREE, UNIVERSAL_POINT_CAP, UNIVERSAL_UNLOCKS, UNIVERSAL_PATH_NAMES, universalPointsFor,
} from "../src/progression/universal";

const byId = new Map(UNIVERSAL_TREE.map((n) => [n.id, n]));
function chainTo(id: string): string[] {
  const out: string[] = [];
  let cur = byId.get(id);
  while (cur) {
    out.unshift(cur.id);
    cur = cur.requires ? byId.get(cur.requires) : undefined;
  }
  return out;
}
function costOf(ids: readonly string[]): number {
  const uniq = new Set(ids);
  let sum = 0;
  for (const id of uniq) sum += byId.get(id)?.cost ?? 0;
  return sum;
}

// =========================================================================
// Part A — a Tower campaign, the same shape `campaign()` already runs for the Delve, just
// climbing instead of descending. `campaign()` itself hard-codes a bare-number `target`
// (which `Dungeon` turns into `delveConfig(depth)`), so it can't be reused unmodified —
// this is the smallest change that keeps everything else (the bot, the gearing loop, the
// retry-on-failure shape) identical, per the "don't paraphrase the bot, extend it" rule at
// the top of tools/bot.ts. This isn't a paraphrase of the bot itself, only of the outer
// dive-selection loop, and it stays close enough to diff against `campaign()` directly.
function towerCampaign(seed: number, dodge: number, dives = 20) {
  const state = new GameState(seed);
  let target = 1;
  let deepest = 0;
  for (let dive = 0; dive < dives; dive++) {
    townVisit(state);
    const { d } = playFloor(state, towerConfig(target), 300, seed + dive * 37 + target, dodge);
    if (d.phase === "cleared") {
      d.bankLoot();
      deepest = Math.max(deepest, target);
      target++;
    } else {
      target = Math.max(1, target - (target > 1 ? 1 : 0));
    }
  }
  return deepest;
}

console.log("=== A. Delve vs Tower — a fresh same-day campaign, both ladders ===");
const N = Number(process.argv[2] ?? 20);
const seeds = CAMPAIGN_SEEDS.slice(0, N);
console.log(`${seeds.length} seeds (CAMPAIGN_SEEDS[0..${seeds.length}]), dodge 0.55, 20 dives each\n`);

const delveDepths: number[] = [];
for (const seed of seeds) delveDepths.push(campaign(seed, 0.55, 20).deepest);
const towerHeights: number[] = [];
for (const seed of seeds) towerHeights.push(towerCampaign(seed, 0.55, 20));

function stats(xs: number[]) {
  const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { avg, min: Math.min(...xs), max: Math.max(...xs) };
}
const dStats = stats(delveDepths);
const tStats = stats(towerHeights);
console.log(`Delve  — avg ${dStats.avg.toFixed(1)}, min ${dStats.min}, max ${dStats.max}  [${delveDepths.join(",")}]`);
console.log(`Tower  — avg ${tStats.avg.toFixed(1)}, min ${tStats.min}, max ${tStats.max}  [${towerHeights.join(",")}]`);
console.log(
  Math.abs(dStats.avg - tStats.avg) < 1
    ? "→ the two ladders read the same, as tools/world.ts's height-for-depth equality predicts."
    : `→ the two ladders do NOT read the same at this sample size (Δavg ${(dStats.avg - tStats.avg).toFixed(1)}) — see the write-up before trusting either number alone.`,
);

// =========================================================================
console.log("\n=== B. what a realistic frontier actually buys in the tree ===");
const wholeTree = UNIVERSAL_TREE.reduce((sum, n) => sum + n.cost, 0);
const keystones = UNIVERSAL_TREE.filter((n) => n.category === "keystone");
const keystoneCost = new Map(keystones.map((k) => [k.name, costOf(chainTo(k.id))]));
console.log(`Tree total: ${wholeTree} points. Cap: ${UNIVERSAL_POINT_CAP} (frontier 40).`);
console.log("Cheapest legal chain to each keystone (root + every ancestor, cross-links included):");
for (const [name, cost] of [...keystoneCost.entries()].sort((a, b) => a[1] - b[1])) {
  console.log(`  ${String(cost).padStart(2)} pts — ${name}`);
}

function combosAffordable(budget: number): { count: number; names: string[] } {
  // 6 keystones, 2^6 = 64 subsets — small enough to brute force exactly rather than
  // approximate. Cost of a subset is the union of chains (shared ancestors, e.g. a
  // cross-linked keystone's neighbour-path prerequisite, are not double-counted).
  let best = { count: 0, names: [] as string[] };
  const entries = [...keystoneCost.keys()];
  for (let mask = 0; mask < 1 << entries.length; mask++) {
    const names = entries.filter((_, i) => mask & (1 << i));
    if (names.length <= best.count) continue;
    const ids = names.flatMap((n) => chainTo(keystones.find((k) => k.name === n)!.id));
    if (costOf(ids) <= budget) best = { count: names.length, names };
  }
  return best;
}

console.log("\nAffordability at reference frontiers:");
const refFrontiers = [
  ["cap-funding (40)", 40],
  ["today's fresh Delve avg", Math.round(dStats.avg)],
  ["today's fresh Tower avg", Math.round(tStats.avg)],
  ["today's fresh Delve max", dStats.max],
  ["today's fresh Delve min", dStats.min],
] as const;
for (const [label, frontier] of refFrontiers) {
  const pts = universalPointsFor(frontier);
  const combo = combosAffordable(pts);
  const pct = Math.round((pts / wholeTree) * 100);
  console.log(
    `  frontier ${String(frontier).padStart(3)} (${label.padEnd(24)}) → ${String(pts).padStart(2)} pts, ` +
    `${String(pct).padStart(3)}% of tree, ${combo.count} keystone(s) reachable` +
    (combo.count ? `: ${combo.names.join(", ")}` : ""),
  );
}

console.log("\nFull sweep, by points spent (not frontier) — 0 through the cap:");
for (let pts = 0; pts <= UNIVERSAL_POINT_CAP; pts++) {
  const combo = combosAffordable(pts);
  const pct = Math.round((pts / wholeTree) * 100);
  console.log(
    `  ${String(pts).padStart(2)} pts (${String(pct).padStart(3)}% of tree) → ${combo.count} keystone(s)` +
    (combo.count ? `: ${combo.names.join(", ")}` : ""),
  );
}

// =========================================================================
console.log("\n=== C. hybrids/mythic (breadth payoffs) at the same realistic budgets ===");
{
  const pathRows = new Map<string, TreeNodeV2[]>();
  for (let p = 0; p < UNIVERSAL_PATH_NAMES.length; p++) {
    pathRows.set(
      UNIVERSAL_PATH_NAMES[p]!,
      UNIVERSAL_TREE.filter((n) => n.path === p).sort((a, b) => a.row - b.row),
    );
  }
  // Cheapest way to hold >=`points` in `pathName`: take its own nodes front-to-back
  // (the only legal order — each node's sole prerequisite is the one before it in the
  // same path) until the running total meets the requirement.
  function cheapestForPathPoints(pathName: string, points: number): { ids: string[]; cost: number } {
    const rows = pathRows.get(pathName)!;
    const ids: string[] = [];
    let cost = 0;
    for (const n of rows) {
      if (cost >= points) break;
      ids.push(n.id);
      cost += n.cost;
    }
    return { ids, cost };
  }
  for (const u of UNIVERSAL_UNLOCKS) {
    const parts = u.requires.map((r) => cheapestForPathPoints(r.path, r.points));
    const ids = new Set(["universal.root.core", ...parts.flatMap((p) => p.ids)]);
    let cost = 0;
    for (const id of ids) cost += byId.get(id)?.cost ?? 0;
    console.log(
      `  ${u.name.padEnd(18)} (${u.requires.map((r) => `${r.path} ${r.points}`).join(" + ")}) → ${cost} pts minimum`,
    );
  }
}
