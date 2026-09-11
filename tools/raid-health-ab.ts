/**
 * What does more raid-boss health actually buy? (owner item B)
 *
 * The owner asked for "a much much higher health pool" on every raid boss. `RAID_HEALTH`
 * (`src/data/raids.ts`, currently 1.7) is the one number that sets it, multiplying the
 * deepest authored encounter's health.
 *
 * **This measures rather than assumes, because CLAUDE.md's position is that health alone
 * makes a fight longer rather than harder** ("Pressure, not sponginess"), and
 * `docs/raid-party-scaling.md` already found exactly that on the co-op axis: *"For a fight
 * the party can win, more health just costs more time."* Whether that carries to a solo
 * fight is a different question, because a solo player's potion belt is finite and every
 * extra second is another boss cast to read — so a longer fight may genuinely be a harder
 * one here. That is the hypothesis; this is the instrument.
 *
 * The multiplier is applied to the spawned boss's `health`/`maxHealth`, which is exactly
 * equivalent to raising `RAID_HEALTH` — that constant does nothing else (`raidBossSpec`
 * uses it once, as `health: REFERENCE.health * RAID_HEALTH`). Doing it this way means one
 * process can sweep several values without editing the constant between runs.
 *
 * Reports; never fails the build. Run with `npm run raidhealth`.
 */

import { playFloor, geared } from "./bot";
import { RAIDS, RAID_HEALTH, raidConfig } from "../src/data/raids";
import type { Dungeon } from "../src/game/dungeon";
import type { ClassId } from "../src/data/classes";

/** Multipliers on top of today's `RAID_HEALTH`, so 1.0 is master. */
const FACTORS = [1.0, 1.5, 2.0, 3.0];
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88];
const TIER = 1;
/**
 * **Calibrated until the row is contested, which took some finding.** A level 55 bot with
 * ordinary gearing loses 0/4 against a tier-1 raid boss and dies in 6-27 seconds — it is
 * not timing out, it is being killed, and a row pinned at zero wins cannot move in either
 * direction (CLAUDE.md: a row at 0/16 or 16/16 measures nothing). That is itself consistent
 * with what CLAUDE.md already records — "at level 60 most sampled classes can't beat depth
 * 30 in either flavour", and the delve's own depth-15 boss being "close to unbeatable".
 *
 * Level 70 with 120 Advanced chests and near-perfect telegraph reading gets to 2/4, which
 * can move both ways. That is an unusually strong character, deliberately: the question is
 * what *more health* changes, and it can only be asked where the fight is winnable at all.
 */
const LEVEL = 70;
const KEYS = 120;
const DODGE = 0.95;
const CLASS: ClassId = "swordsman";
const MAX_SECONDS = 420;

interface Res { win: number; runs: number; secs: number; potions: number; taken: number; timeouts: number }

function measure(raidIdx: number, factor: number): Res {
  const spec = RAIDS[raidIdx]!;
  const out: Res = { win: 0, runs: 0, secs: 0, potions: 0, taken: 0, timeouts: 0 };
  for (const seed of SEEDS) {
    const state = geared(LEVEL, seed, KEYS, CLASS);
    let scaled = false;
    const onTick = (d: Dungeon): void => {
      if (scaled) return;
      const boss = d.enemies.find((e) => e.boss);
      if (!boss) return;
      // Exactly what raising RAID_HEALTH does, applied once at spawn.
      boss.maxHealth *= factor;
      boss.health *= factor;
      scaled = true;
    };
    const r = playFloor(state, raidConfig(spec, TIER), MAX_SECONDS, seed, DODGE, onTick);
    out.runs += 1;
    out.secs += r.seconds;
    out.potions += r.potionsDrunk;
    out.taken += r.damageTaken;
    if (r.d.phase === "cleared") out.win += 1;
    else if (r.seconds >= MAX_SECONDS - 1) out.timeouts += 1;
  }
  return out;
}

console.log(`raid boss health A/B — tier ${TIER}, ${CLASS} @ level ${LEVEL}, ${KEYS} chests, ${SEEDS.length} seeds, dodge ${DODGE}`);
console.log(`today's RAID_HEALTH is ${RAID_HEALTH}; factor 1.0 below IS master\n`);

for (let i = 0; i < RAIDS.length; i++) {
  const spec = RAIDS[i]!;
  console.log(`--- ${spec.name} (effective RAID_HEALTH in brackets) ---`);
  console.log("  factor   wins     avg fight(s)   potions/run   dmg taken/run   timeouts");
  const rows: { f: number; r: Res }[] = [];
  for (const f of FACTORS) {
    const r = measure(i, f);
    rows.push({ f, r });
    console.log(
      `  ${f.toFixed(1)} [${(RAID_HEALTH * f).toFixed(2)}]` +
      ` ${`${r.win}/${r.runs}`.padStart(8)}` +
      ` ${(r.secs / r.runs).toFixed(1).padStart(14)}` +
      ` ${(r.potions / r.runs).toFixed(1).padStart(13)}` +
      ` ${(r.taken / r.runs).toFixed(0).padStart(15)}` +
      ` ${String(r.timeouts).padStart(10)}`,
    );
  }
  // The two readings that decide it, stated as comparisons rather than left to the eye.
  const base = rows[0]!.r;
  const top = rows[rows.length - 1]!.r;
  const dLen = base.secs > 0 ? (top.secs / top.runs) / (base.secs / base.runs) : 0;
  const wBase = base.win / base.runs;
  const wTop = top.win / top.runs;
  console.log(`   => at ${FACTORS[FACTORS.length - 1]!.toFixed(1)}x: fight is ${dLen.toFixed(2)}x as long, win rate ${(wBase * 100).toFixed(0)}% -> ${(wTop * 100).toFixed(0)}%`);
  console.log("");
}
