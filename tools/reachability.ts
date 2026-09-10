// Reliquary reachability — a measurement, not part of the acceptance gate (same
// deliberate exclusion as tools/arena.ts and tools/builds.ts: this asks a balance
// question with an expensive, still-open answer, not a pass/fail regression check).
// See docs/reliquary-reachability.md for the write-up this tool produced.
import { PLANETS, planetUnlocked, planetConfig } from "../src/data/planets";
import { geared, playFloor } from "./bot";
import type { ClassId } from "../src/data/classes";

function ladderClearsToOpen(index: number): number {
  const progress: Record<string, number> = {};
  for (let i = 0; i < index; i++) progress[PLANETS[i]!.id] = 2; // tier-1 banked -> progress 2
  return planetUnlocked(PLANETS[index]!, progress, 0) ? index : -1;
}

console.log("=== Q1: sequential ladder clears required to OPEN each sector (frontier=0) ===");
for (let i = 0; i < PLANETS.length; i++) {
  const p = PLANETS[i]!;
  console.log(`  sector ${i + 1} (${p.id}, baseDepth ${p.baseDepth}): ${ladderClearsToOpen(i)} prior tier-1 clears`);
}

function attemptFloor1(planetIdx: number, level: number, classId: ClassId, seed: number, dodge = 1.0) {
  const planet = PLANETS[planetIdx]!;
  const state = geared(level, seed, 20, classId);
  const config = planetConfig(planet, 1, 1, 0);
  const { d, seconds } = playFloor(state, config, 400, seed * 37, dodge);
  return { cleared: d.phase === "cleared", phase: d.phase, seconds, kills: d.killsSoFar, required: d.killsRequired };
}

console.log("\n=== control: instrument sees a win (sector 1 @ level 30, should be trivial) ===");
{
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    if (attemptFloor1(0, 30, "lancer", 9000 + seed, 0.85).cleared) wins++;
  }
  console.log(`  sector 1 @ level 30: ${wins}/5 (this must be ~5/5 or the harness itself is broken)`);
}

console.log("\n=== Q2/Q3: can ANY tested gearing clear floor 1 of the three reserved sectors? ===");
for (const idx of [6, 7, 8]) {
  const planet = PLANETS[idx]!;
  for (const level of [planet.baseDepth, planet.baseDepth + 20, planet.baseDepth + 66, planet.baseDepth + 116]) {
    const results = [1, 2, 3, 4, 5].map((seed) => attemptFloor1(idx, level, "lancer", 9100 + idx * 100 + seed));
    const wins = results.filter((r) => r.cleared).length;
    const detail = results.map((r) => `${r.phase}(${r.kills}/${r.required})`).join(" ");
    console.log(`  sector ${idx + 1} (${planet.id}) @ level ${level}: ${wins}/5 — ${detail}`);
  }
}

console.log("\n=== cross-class check on the first reserved sector (sector 7 @ level 100) ===");
for (const cls of ["lancer", "berserker", "magician", "paladin"] as ClassId[]) {
  const results = [1, 2, 3].map((seed) => attemptFloor1(6, 100, cls, 9800 + seed));
  const wins = results.filter((r) => r.cleared).length;
  console.log(`  ${cls}: ${wins}/3 — ${results.map((r) => `${r.phase}(${r.kills}/${r.required})`).join(" ")}`);
}
