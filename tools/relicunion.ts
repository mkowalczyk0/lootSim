/**
 * The relic/artifact **union** measurement — what a player actually experiences.
 *
 * A per-source `chance` is not the quantity a player feels. A run fires several drop
 * events, each event rolls **every** matching definition independently (`rollTable`), and
 * what the player notices is whether *anything* relic-tier fell out of the whole run. That
 * union is the number the owner's complaint is about ("damn near guaranteed when doing
 * raids"), and no individual `chance` in `RELIC_ODDS` has to look wrong for it to be true.
 *
 * So this tool composes, rather than reads:
 *
 *   - it asks `forSource` which definitions each event on a run can actually pay out, so a
 *     source nobody expected to match is *found* rather than assumed away;
 *   - it prices each match through the real `dropChance(base, danger)`, the same call the
 *     roll site makes, so the reward curve and its clamp are included by construction;
 *   - it composes the per-event probabilities across every event on the run;
 *   - and it checks the analytic answer against a Monte Carlo run through the real
 *     `rollRelicDrops`, so a mistake in the composition shows up as a disagreement rather
 *     than as a confident wrong number.
 *
 * The Monte Carlo is the part that keeps this instrument honest. This repo's scar tissue
 * (`docs/blind-instruments.md`) is full of measurements that ran and reported a plausible
 * number without ever touching the code under test; a closed-form model of a roll site is
 * exactly that failure waiting to happen, so the model is never trusted on its own.
 *
 * Read-only: it tunes nothing and asserts nothing. `npm run relicunion`.
 */

import { Rng } from "../src/core/rng";
import { dropChance, forSource, type DropQuery } from "../src/data/drops";
import { RELICS, rollRelicDrops, type RelicDef } from "../src/data/relics";
import { RAIDS, raidBossId, raidConfig, type RaidSpec } from "../src/data/raids";
import { bossSpecForRun } from "../src/data/encounters";
import { riftConfig } from "../src/data/modes";
import type { RunConfig } from "../src/data/modes";

// --- what a run is, for the purposes of this measurement ---------------------

/** One drop event on a run: a query, and what it is for the reader. */
interface Event {
  readonly label: string;
  readonly q: DropQuery;
}

/** A run, reduced to the drop events that can pay a relic or an artifact. */
interface Run {
  readonly label: string;
  readonly config: RunConfig;
  readonly events: readonly Event[];
}

/**
 * The events a raid clear fires, mirroring `Dungeon` exactly.
 *
 * `killEnemy` emits a `raid` query when the encounter dies, and `dropClearCache` emits
 * **the same query again** when the cache lands — "one address for one raid, asked twice
 * because the floor pays twice" (`dungeon.ts`). Both are listed here because both roll.
 * The `boss` and `clearCache` queries the floor also emits are listed so that any relic
 * source reaching a raid floor through them is *found*, not assumed absent.
 */
function raidRun(spec: RaidSpec, tier: number): Run {
  const config = raidConfig(spec, tier);
  return {
    label: `${spec.name} t${tier}`,
    config,
    events: [
      { label: "encounter (raid)", q: { kind: "raid", raidId: spec.id, tier, event: "encounter" } },
      { label: "encounter (boss)", q: { kind: "boss", bossId: raidBossId(spec.id), mode: "raid", tier, depth: config.depth } },
      { label: "clear cache (raid)", q: { kind: "raid", raidId: spec.id, tier, event: "cache" } },
      {
        label: "clear cache (mode)",
        q: { kind: "clearCache", depth: config.depth, mode: "raid", tier, lastFloor: true },
      },
    ],
  };
}

/**
 * An Abyssal Rift clear, for the comparison the owner has *not* complained about.
 *
 * Four floors and a boss. Every floor drops a cache, and `abyssCache` has no `lastFloor`,
 * so the cache event fires five times against it; the boss event fires once, on the last.
 */
function abyssRun(tier: number): Run {
  const events: Event[] = [];
  const floors = 5;
  for (let f = 1; f <= floors; f++) {
    const config = riftConfig("abyss", tier, f);
    const last = f === floors;
    if (last) {
      events.push({
        label: `floor ${f} boss`,
        q: { kind: "boss", bossId: bossIdForAbyss(config), mode: "abyss", tier, depth: config.depth },
      });
    }
    events.push({
      label: `floor ${f} cache`,
      q: { kind: "clearCache", depth: config.depth, mode: "abyss", tier, lastFloor: last },
    });
  }
  return { label: `Abyssal Rift t${tier}`, config: riftConfig("abyss", tier, floors), events };
}

/**
 * The boss an Abyss floor spawns, read from the encounter table rather than named here —
 * a hardcoded id would silently stop matching the moment the table changed, which is the
 * "scope came from the thing under test" failure in `docs/blind-instruments.md`.
 * `encounters.ts` owns this question for both the sim and the §20 preview.
 */
function bossIdForAbyss(config: RunConfig): string {
  return bossSpecForRun(config).id;
}

// --- the composition ---------------------------------------------------------

/** Every relic-table match on one event, priced through the real `dropChance`. */
function pricedMatches(q: DropQuery, danger: number): { def: RelicDef; p: number }[] {
  const out: { def: RelicDef; p: number }[] = [];
  for (const m of forSource(RELICS, q)) {
    out.push({ def: m.def, p: dropChance(m.src.chance, danger) });
  }
  return out;
}

/**
 * P(at least one relic-tier item) over a whole run, analytically.
 *
 * A definition matched by several events gets several independent shots at dropping, and
 * `rollTable` breaks after a definition's first hit *within* one event — so the per-event
 * miss probability for a definition is the product over its matching sources, and the
 * run's miss probability is the product over every event. `owned` is not modelled: this is
 * the fresh-account case, which is the one the player meets first and the one the
 * complaint is about.
 */
function unionAnalytic(run: Run): { all: number; byTier: Map<string, number> } {
  const missBy = new Map<string, number>();
  for (const ev of run.events) {
    for (const { def, p } of pricedMatches(ev.q, run.config.danger)) {
      missBy.set(def.id, (missBy.get(def.id) ?? 1) * (1 - p));
    }
  }
  let missAll = 1;
  const missTier = new Map<string, number>();
  for (const [id, miss] of missBy) {
    const def = RELICS.find((d) => d.id === id)!;
    missAll *= miss;
    missTier.set(def.tier, (missTier.get(def.tier) ?? 1) * miss);
  }
  const byTier = new Map<string, number>();
  for (const [tier, miss] of missTier) byTier.set(tier, 1 - miss);
  return { all: 1 - missAll, byTier };
}

/** The same number, rolled through the real `rollRelicDrops`. Keeps the model honest. */
function unionSampled(run: Run, trials: number, seed: number): number {
  const rng = new Rng(seed);
  let hits = 0;
  for (let i = 0; i < trials; i++) {
    let got = false;
    for (const ev of run.events) {
      if (rollRelicDrops(ev.q, rng, run.config.danger).length > 0) got = true;
    }
    if (got) hits++;
  }
  return hits / trials;
}

// --- report ------------------------------------------------------------------

function pct(x: number): string {
  return (x * 100).toFixed(1).padStart(5) + "%";
}

function oneInN(x: number): string {
  if (x <= 0) return "never";
  if (x >= 1) return "always";
  return `1 in ${(1 / x).toFixed(1)}`;
}

function report(run: Run, trials: number, seed: number): void {
  const a = unionAnalytic(run);
  const s = unionSampled(run, trials, seed);
  const delta = Math.abs(a.all - s);
  const agree = delta < 0.02;
  console.log(
    `  ${run.label.padEnd(34)} danger ${run.config.danger.toFixed(2).padStart(5)}` +
    `   any ${pct(a.all)} (${oneInN(a.all)})` +
    `   artifact ${pct(a.byTier.get("artifact") ?? 0)}` +
    `   relic ${pct(a.byTier.get("relic") ?? 0)}` +
    `   [sampled ${pct(s)}${agree ? "" : "  <-- MODEL DISAGREES"}]`,
  );
}

function listEvents(run: Run): void {
  console.log(`\n  ${run.label} — what each event can pay:`);
  for (const ev of run.events) {
    const m = pricedMatches(ev.q, run.config.danger);
    if (m.length === 0) {
      console.log(`    ${ev.label.padEnd(22)} — nothing`);
      continue;
    }
    for (const { def, p } of m) {
      console.log(`    ${ev.label.padEnd(22)} ${def.tier.padEnd(9)} ${def.id.padEnd(34)} ${pct(p)}`);
    }
  }
}

const TRIALS = 40000;

console.log("\nRELIC / ARTIFACT UNION PROBABILITY PER CLEAR");
console.log("(P that at least one relic-tier item drops somewhere on the run, fresh account)\n");

console.log("RAIDS");
for (const spec of RAIDS) {
  for (const tier of [1, 3, 4, 6, 8, 12]) {
    report(raidRun(spec, tier), TRIALS, 0x5eed + tier);
  }
  console.log("");
}

console.log("ABYSSAL RIFT (not complained about — the comparison)");
for (const tier of [1, 4, 8, 12]) {
  report(abyssRun(tier), TRIALS, 0xabbb + tier);
}

listEvents(raidRun(RAIDS[0], 8));
listEvents(abyssRun(8));
console.log("");
