/**
 * The measurement behind `docs/enemy-friendly-fire.md` — read that doc first; this is
 * the instrument, not a description of the finding. Not an acceptance test (no `check()`,
 * just numbers) and deliberately not wired into `npm run test` or `package.json`, the
 * same call `tools/raid-party-measure.ts` made: there is no agreed-correct post-fix
 * number to assert against, only a documented finding.
 *
 * Boss floors only, on purpose — nothing outside a boss floor can move from the fix this
 * measures (`hitsEnemies` on boss telegraphs), since the only non-boss enemies a boss
 * floor ever has are the boss's own summons.
 *
 * Two fights, both calibrated to a genuinely contested gearing first (an 8-seed sweep,
 * not reproduced here — win rate landing in a 25-65% band before trusting the result,
 * per CLAUDE.md's "a row pinned at 0/16 or 16/16 measures nothing"):
 *   - depth 5, warden — reuses the exact gearing `tools/smoke.ts`'s own "first raid
 *     boss" section already established as contested. Light summon use (addsOnEnter
 *     0/3/4 across its three phases).
 *   - depth 10, choir — heavier summon use (addsOnEnter 0/4/5), calibrated separately.
 *
 * Depth 20 (herald, the heaviest summon kit of the five authored bosses) was tried and
 * dropped: even at level 60 with 30 Advanced-tier chests (the top of what `geared()` can
 * produce), the solo bot could not clear it or reliably reach a second phase — consistent
 * with CLAUDE.md's existing finding that "the delve's own depth-15 boss is close to
 * unbeatable for the same characters that clear a depth-15 trash floor without much
 * trouble." A row that never reaches a summon-casting phase measures nothing, so herald
 * is out of reach for this instrument at the gearing a solo bot can produce.
 *
 * Run identically against two branches (same file, same seeds) and diff the printed
 * numbers by hand — this script doesn't compare two branches itself:
 *   npx esbuild tools/friendlyfire-measure.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/friendlyfire-measure.mjs && \
 *     node node_modules/.cache/friendlyfire-measure.mjs
 */
import { geared, playFloor } from "./bot";

function run(label: string, depth: number, level: number, keys: number, dodge: number, seedBase: number, n: number) {
  const seeds = Array.from({ length: n }, (_, i) => seedBase + i);
  const results = seeds.map((seed) => playFloor(geared(level, 4000 + seed, keys), depth, 400, seed, dodge));
  const wins = results.filter((r) => r.d.phase === "cleared").length;
  const deaths = results.filter((r) => r.d.phase === "dead").length;
  const avg = (f: (r: (typeof results)[number]) => number) => results.reduce((a, r) => a + f(r), 0) / results.length;
  const reachedAPhaseChange = results.filter((r) => r.bossPhases >= 1).length;
  const totalSummons = results.reduce((a, r) => a + r.summonCasts, 0);
  console.log(`\n-- ${label} (depth ${depth}, level ${level}, keys ${keys}, dodge ${dodge}, n=${n}) --`);
  console.log(`  wins ${wins}/${n}  deaths ${deaths}/${n}  reached-a-phase-change ${reachedAPhaseChange}/${n}  summonCasts-total ${totalSummons}`);
  console.log(`  avg seconds ${avg((r) => r.seconds).toFixed(1)}  avg damageTaken ${avg((r) => r.damageTaken).toFixed(0)}`);
  console.log(`  avg peakEnemies ${avg((r) => r.peakEnemies).toFixed(2)}  avg avgEnemies(alive/tick) ${avg((r) => r.avgEnemies).toFixed(2)}`);
  console.log(`  avg enemyDeaths(non-boss) ${avg((r) => r.enemyDeaths).toFixed(2)}  avg potionsDrunk ${avg((r) => r.potionsDrunk).toFixed(2)}`);
}

// Two disjoint 40-seed blocks per fight (seed bases chosen arbitrarily far apart), per
// CLAUDE.md's own two-pass discipline for trusting a comparison's spread rather than one
// block's number.
run("warden / depth 5, block 1", 5, 6, 8, 0.85, 4000, 40);
run("warden / depth 5, block 2", 5, 6, 8, 0.85, 90000, 40);
run("choir / depth 10, block 1", 10, 19, 18, 0.85, 7000, 40);
run("choir / depth 10, block 2", 10, 19, 18, 0.85, 190000, 40);
