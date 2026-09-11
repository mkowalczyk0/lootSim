/**
 * What does a tighter boss rotation actually buy? (docket §39)
 *
 * The owner asked to "decrease the time in between boss attacks", and ruled that the
 * parked bullet-hell bolt dial moves in the same pass because the two compound. This is
 * the instrument for both. It reports and never fails the build; run it with
 * `npm run bosscadence`.
 *
 * ## The two dials, and why the gap is two numbers rather than one
 *
 * `src/game/boss.ts` spends a boss's time in exactly three states: winding up a cast
 * (rooted), recovering (`actionTimer`, walking), or charging. So the time between one
 * attack landing and the next one landing is
 *
 *     actionTimer  +  cast
 *
 * and only the first half is this change's business — `cast` is the telegraph, and
 * shortening it makes hits unreadable rather than making the boss aggressive
 * (CLAUDE.md's first boss rule). The recovery is `BOSS_ACTION_GAP * phase.haste *
 * aggression * buffHaste * crescendo`.
 *
 * **But cutting the recovery alone does not reliably cut the gap**, and this is the part
 * worth knowing before believing any number here. `beginAbility` can only pick a card
 * that is off its own `ability.cooldown`; when nothing is ready it takes a 0.35s beat and
 * tries again. A phase-one kit is two or three cards with cooldowns of 3.6-8s against a
 * cycle of roughly 3s, so it is already close to cooldown-bound. Halve the recovery and a
 * boss does not cast twice as often — it stalls in 0.35s beats until a card comes back.
 * So this sweep scales **both** numbers by one factor, which is what "the rotation is
 * 20% tighter" has to mean if it is to mean anything.
 *
 * ## How the sweep avoids editing the constants
 *
 * Per `tools/raid-health-ab.ts`'s precedent: the patch is applied through `playFloor`'s
 * `onTick` hook rather than by editing `src/data/bosses.ts` between runs, so one process
 * sweeps several values and the `1.00` row is a true same-binary baseline. Every reset of
 * `actionTimer` and of a per-ability cooldown is scaled as it happens, which is exactly
 * equivalent to scaling the two constants, and a new pattern's per-bolt damage is scaled
 * the moment the pattern begins (`PatternState.damage` is fixed once, at that instant).
 *
 * ## The metrics, and the one that is banned
 *
 * **Nothing here divides by fight length.** Fight length is part of what is being changed
 * — casting locks the boss in place, so a tighter rotation hands the player *more* free
 * damage at the same time as more danger, and whether the fight gets harder or merely
 * longer is empirical. `docs/raid-party-scaling.md` is the write-up of that exact confound
 * biting someone already. So every number below is a per-run total or a count: wins,
 * potions drunk, damage taken, mechanics eaten. Seconds are reported split by outcome and
 * are not used to normalise anything.
 *
 * ## Instrument health
 *
 * Three readouts exist to prove the run reached the code under test, because a harness
 * that runs but is blind returns a plausible number rather than an error:
 *
 *   - **`casts`** — abilities that actually resolved, per run. This is the dial's direct
 *     readout: if it does not rise as the factor falls, the patch never reached the boss
 *     and every other column is noise.
 *   - **`ph`** — the deepest phase entered, averaged. A row that dies in phase one never
 *     saw the haste the later phases carry.
 *   - **`bolts`** — pattern bolts fired, per run. Zero means the bolt dial was never
 *     exercised whatever it was set to.
 *
 * Args: `--seeds=N --cadence=a,b,c --bolt=a,b,c --level=N --keys=N --dodge=N
 *        --class=id --floor=delve:15 --floor=raid:the-ferryman:1 --calibrate`
 */

import { BOSS_CADENCE } from "../src/data/bosses";
import type { ClassId } from "../src/data/classes";
import { delveConfig } from "../src/data/modes";
import { RAIDS, raidConfig } from "../src/data/raids";
import type { RunConfig } from "../src/data/modes";
import type { BossState, Enemy, PatternState } from "../src/game/entities";
import type { Dungeon } from "../src/game/dungeon";
import { geared, playFloor } from "./bot";

/**
 * The fight as it stood before docket §39, expressed in this tool's own dials: the
 * recovery and cooldowns ran at 1.0 of their authored values (`BOSS_CADENCE` did not
 * exist), and per-bolt damage was 1/1.5 of what ships today.
 */
const PRE_39_CADENCE = 1.0;
const PRE_39_BOLT = 1 / 1.5;

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const all = (name: string): string[] =>
  argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const flag = (name: string): boolean => argv.includes(`--${name}`);
const nums = (s: string): number[] => s.split(",").map(Number).filter((n) => Number.isFinite(n));

const SEEDS = Number(arg("seeds", "12"));
const KEYS = Number(arg("keys", "120"));
const DODGE = Number(arg("dodge", "0.9"));
const CLASS = arg("class", "swordsman") as ClassId;
const MAX_SECONDS = Number(arg("secs", "300"));
/**
 * `--cadence` is an **absolute** `BOSS_CADENCE`, not a multiplier on whatever is shipped,
 * and `--bolt` is a multiple of the shipped per-bolt damage. That distinction is the whole
 * reason this tool is still readable now that §39 has landed: before it, "cadence 1.00"
 * and "master" were the same row, and after it they are not. `PRE_39` below is the
 * pre-§39 fight, printed on every run so a baseline is never inferred from a 1.00.
 */
const CADENCES = nums(arg("cadence", `${PRE_39_CADENCE},${BOSS_CADENCE}`));
const BOLTS = nums(arg("bolt", `${PRE_39_BOLT},1.0`));

/** `delve:<depth>` or `raid:<id>:<tier>`. */
function parseFloor(s: string): { label: string; run: RunConfig } {
  const parts = s.split(":");
  if (parts[0] === "raid") {
    const spec = RAIDS.find((r) => r.id === parts[1]);
    if (!spec) throw new Error(`no such raid: ${parts[1]}`);
    const tier = Number(parts[2] ?? 1);
    return { label: `raid ${spec.id} t${tier}`, run: raidConfig(spec, tier) };
  }
  const depth = Number(parts[1] ?? 15);
  return { label: `delve d${depth}`, run: delveConfig(depth) };
}

const FLOOR_ARGS = all("floor");
const FLOORS = (FLOOR_ARGS.length ? FLOOR_ARGS : ["delve:15"]).map(parseFloor);

/**
 * A measured row: a floor, the gearing that contests it, and how well the bot reads.
 *
 * Rows are declared rather than cross-produced, because the level that contests a floor
 * is different for a reader and for a careless player — a cross-product of floors x
 * levels x dodge would spend most of its runs on rows pinned at 0/N or N/N, which cannot
 * move in either direction and measure nothing. Every row below was found by
 * `--calibrate` and is between 2/8 and 6/8 on master.
 *
 * `--row=<floor>,<level>,<dodge>`, e.g. `--row=delve:25,60,0.9` or
 * `--row=raid:the-ferryman:4,50,0.55`.
 */
interface RowSpec { label: string; run: RunConfig; level: number; dodge: number }

function parseRow(s: string): RowSpec {
  const parts = s.split(",");
  const dodge = Number(parts.pop());
  const level = Number(parts.pop());
  const f = parseFloor(parts.join(","));
  return { label: `${f.label} lv${level} d${dodge}`, run: f.run, level, dodge };
}

/** Contested on master at 8 seeds; see the table in docs/boss-cadence.md. */
const DEFAULT_ROWS = [
  "delve:25,60,0.9",
  "delve:25,70,0.9",
  "raid:the-ferryman:4,40,0.9",
  "delve:25,50,0.55",
  "delve:25,70,0.55",
  "raid:the-ferryman:4,60,0.55",
];
const ROW_ARGS = all("row");
const ROWS = (ROW_ARGS.length ? ROW_ARGS : DEFAULT_ROWS).map(parseRow);

/**
 * Seed block. Blocks are **disjoint**, not a longer single run: this repo's own campaign
 * comparison reads anywhere from -0.33 to +6.08 across disjoint 12-seed blocks with no
 * code change at all (CLAUDE.md's third lesson), so a delta is only worth reporting if it
 * holds sign across blocks. `--block=1` is the second block, and so on.
 */
const BLOCK = Number(arg("block", "0"));
const seedFor = (i: number): number => 1000 + BLOCK * 100_000 + i * 137;

/**
 * The live patch. Returns an `onTick` hook plus the counters it gathered.
 *
 * `cadence` multiplies every reset of the recovery timer and of a per-ability cooldown;
 * `bolt` multiplies a pattern's per-bolt damage at the instant the pattern starts. A
 * 0.35s "nothing was ready, take a beat" reset is left alone — it is a stall, not a
 * recovery, and scaling it would quietly change the thing this is trying to measure.
 */
const STALL_BEAT = 0.35;

interface Probe {
  onTick: (d: Dungeon) => void;
  /** Abilities that resolved this run — the cadence dial's direct readout. */
  casts: number;
  /** Bullet-hell patterns that began — the bolt dial's direct readout. */
  patterns: number;
  /** Most hostile bolts in the air at once — proves a field was actually emitted. */
  peakBolts: number;
  maxPhase: number;
  /** Ticks the boss spent rooted in a wind-up, and ticks it was alive at all. */
  rootedTicks: number;
  aliveTicks: number;
  /**
   * Times the rotation found nothing off cooldown and took `boss.ts`'s 0.35s beat
   * instead of casting (`:206`). This is the dial's floor made visible: past some
   * tightness a boss does not press harder, it stutters, and the stall count is what
   * says where that is rather than leaving it to be argued about.
   */
  stalls: number;
}

function probe(cadence: number, bolt: number): Probe {
  // `cadence` arrives as an absolute `BOSS_CADENCE`; the live timers already carry the
  // shipped one, so the patch is the ratio between them. Passing today's value is a
  // no-op, which is what makes the shipped row a true same-binary control.
  const scale = cadence / BOSS_CADENCE;
  const lastAction = new WeakMap<BossState, number>();
  const lastCd = new WeakMap<BossState, Map<string, number>>();
  const seenPatterns = new WeakSet<PatternState>();
  const out: Probe = {
    onTick: () => {}, casts: 0, patterns: 0, peakBolts: 0, maxPhase: 0,
    rootedTicks: 0, aliveTicks: 0, stalls: 0,
  };

  out.onTick = (d: Dungeon): void => {
    for (const e of d.enemies as Enemy[]) {
      const b = e.boss;
      if (!b) continue;
      out.maxPhase = Math.max(out.maxPhase, b.phase);
      // The coupling the docket says to measure rather than assume: casting locks the
      // body, so the share of the fight the boss spends rooted is the player's free
      // damage window. A tighter rotation buys the boss more casts and the player more
      // of this at the same time.
      out.aliveTicks++;
      if (b.castTimer > 0) out.rootedTicks++;

      // --- the recovery between casts -------------------------------------------
      const prev = lastAction.get(b);
      const cur = b.actionTimer;
      if (prev !== undefined && cur > prev + 1e-9) {
        // It was just reset, so an ability resolved this tick (or the rotation stalled).
        if (Math.abs(cur - STALL_BEAT) > 1e-6) {
          out.casts++;
          b.actionTimer = cur * scale;
        } else {
          out.stalls++;
        }
      }
      lastAction.set(b, b.actionTimer);

      // --- the per-card cooldown that decides what is ready at all ---------------
      let seen = lastCd.get(b);
      if (!seen) { seen = new Map(); lastCd.set(b, seen); }
      for (const key of Object.keys(b.cooldowns)) {
        const k = key as keyof typeof b.cooldowns;
        const v = b.cooldowns[k] ?? 0;
        const was = seen.get(key);
        if (was !== undefined && v > was + 1e-9) b.cooldowns[k] = v * scale;
        seen.set(key, b.cooldowns[k] ?? 0);
      }

      // --- the parked bolt dial --------------------------------------------------
      const p = b.pattern;
      if (p && !seenPatterns.has(p)) {
        seenPatterns.add(p);
        out.patterns++;
        p.damage *= bolt;
      }
    }
    let air = 0;
    for (const pr of d.projectiles) if (!pr.friendly) air++;
    out.peakBolts = Math.max(out.peakBolts, air);
  };
  return out;
}

interface Row {
  runs: number; wins: number; timeouts: number;
  casts: number; phaseSum: number; patterns: number; peakBolts: number;
  /** Summed per run, so the average below is a mean of per-run fractions. */
  rootedFrac: number; gapSum: number; gapRuns: number; stalls: number;
  damage: number; potions: number; eaten: number; resolved: number;
  winSecs: number; winRuns: number; lossSecs: number; lossRuns: number;
}

function blank(): Row {
  return {
    runs: 0, wins: 0, timeouts: 0, casts: 0, phaseSum: 0, patterns: 0, peakBolts: 0,
    rootedFrac: 0, gapSum: 0, gapRuns: 0, stalls: 0,
    damage: 0, potions: 0, eaten: 0, resolved: 0,
    winSecs: 0, winRuns: 0, lossSecs: 0, lossRuns: 0,
  };
}

function measure(spec: RowSpec, cadence: number, bolt: number, seeds: number): Row {
  const row = blank();
  for (let i = 0; i < seeds; i++) {
    const seed = seedFor(i);
    const state = geared(spec.level, seed, KEYS, CLASS);
    const pr = probe(cadence, bolt);
    const r = playFloor(state, spec.run, MAX_SECONDS, seed, spec.dodge, pr.onTick);
    row.runs++;
    row.casts += pr.casts;
    row.phaseSum += pr.maxPhase + 1;
    row.patterns += pr.patterns;
    row.peakBolts += pr.peakBolts;
    row.rootedFrac += pr.aliveTicks ? pr.rootedTicks / pr.aliveTicks : 0;
    row.stalls += pr.stalls;
    if (pr.casts > 0) { row.gapSum += r.seconds / pr.casts; row.gapRuns++; }
    row.damage += r.damageTaken;
    row.potions += r.potionsDrunk;
    row.eaten += r.mechanicsEaten;
    row.resolved += r.mechanicsResolved;
    if (r.d.phase === "cleared") { row.wins++; row.winSecs += r.seconds; row.winRuns++; }
    else if (r.d.phase === "dead") { row.lossSecs += r.seconds; row.lossRuns++; }
    else if (r.seconds >= MAX_SECONDS - 1) row.timeouts++;
  }
  return row;
}

const n = (v: number, d = 0): string => v.toFixed(d);

function print(label: string, cadence: number, bolt: number, row: Row): void {
  const per = (v: number) => v / Math.max(1, row.runs);
  console.log(
    `  ${label.padEnd(22)} cad ${cadence.toFixed(2)} bolt ${bolt.toFixed(2)}  ` +
    `${row.wins}/${row.runs} win` + (row.timeouts ? ` (${row.timeouts} t/o)` : "") +
    `  casts ${n(per(row.casts), 1)}  ph ${n(per(row.phaseSum), 2)}` +
    `  gap ${row.gapRuns ? n(row.gapSum / row.gapRuns, 2) : "-"}s  rooted ${n(100 * per(row.rootedFrac))}%` +
    `  stall ${n(per(row.stalls), 1)}` +
    `  pat ${n(per(row.patterns), 1)}  air ${n(per(row.peakBolts), 1)}` +
    `  dmg ${n(per(row.damage))}  pot ${n(per(row.potions), 1)}` +
    `  eaten ${n(per(row.eaten), 1)}/${n(per(row.resolved), 1)}` +
    `  win ${row.winRuns ? n(row.winSecs / row.winRuns, 1) : "-"}s` +
    `  loss ${row.lossRuns ? n(row.lossSecs / row.lossRuns, 1) : "-"}s`,
  );
}

console.log(
  `boss cadence sweep — class ${CLASS}, ${KEYS} chests, ${SEEDS} seeds/row, seed block ${BLOCK}\n` +
  `  cadence = absolute BOSS_CADENCE, on BOTH the recovery gap and every per-card cooldown\n` +
  `            shipped ${BOSS_CADENCE}; pre-§39 ${PRE_39_CADENCE} (the constant did not exist)\n` +
  `  bolt    = multiple of the SHIPPED per-bolt damage (0.6-0.9x a boss hit)\n` +
  `            shipped 1.00; pre-§39 ${PRE_39_BOLT.toFixed(3)} (it was 0.4-0.6x)\n` +
  `  no column divides by fight length; seconds are split by outcome and normalise nothing.\n`,
);

if (flag("calibrate")) {
  // Find gearing that contests each floor before believing any delta. A row pinned at
  // 0/N or N/N cannot move in either direction.
  console.log("calibration — master cadence only, sweeping level:\n");
  for (const f of FLOORS) {
    for (const lv of nums(arg("levels", "40,50,60,70,80"))) {
      print(`${f.label} lv${lv}`, 1, 1, measureAtLevel(f.run, lv, SEEDS));
    }
  }
} else {
  for (const spec of ROWS) {
    console.log(`${spec.label}:`);
    for (const bolt of BOLTS) {
      for (const cadence of CADENCES) {
        print(spec.label, cadence, bolt, measure(spec, cadence, bolt, SEEDS));
      }
    }
    console.log("");
  }
}

function measureAtLevel(run: RunConfig, level: number, seeds: number): Row {
  const row = blank();
  for (let i = 0; i < seeds; i++) {
    const seed = seedFor(i);
    const state = geared(level, seed, KEYS, CLASS);
    const pr = probe(1, 1);
    const r = playFloor(state, run, MAX_SECONDS, seed, DODGE, pr.onTick);
    row.runs++;
    row.casts += pr.casts;
    row.phaseSum += pr.maxPhase + 1;
    row.patterns += pr.patterns;
    row.peakBolts += pr.peakBolts;
    row.rootedFrac += pr.aliveTicks ? pr.rootedTicks / pr.aliveTicks : 0;
    row.stalls += pr.stalls;
    if (pr.casts > 0) { row.gapSum += r.seconds / pr.casts; row.gapRuns++; }
    row.damage += r.damageTaken;
    row.potions += r.potionsDrunk;
    row.eaten += r.mechanicsEaten;
    row.resolved += r.mechanicsResolved;
    if (r.d.phase === "cleared") { row.wins++; row.winSecs += r.seconds; row.winRuns++; }
    else if (r.d.phase === "dead") { row.lossSecs += r.seconds; row.lossRuns++; }
    else if (r.seconds >= MAX_SECONDS - 1) row.timeouts++;
  }
  return row;
}
