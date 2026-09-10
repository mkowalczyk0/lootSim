/**
 * The execute-threshold A/B (docket §20) — a measurement harness, not an acceptance check.
 *
 * §8 measured the same mechanic on a **Delve** boss at a contested depth. That was a good
 * instrument aimed at the wrong floor: a missing-health rider is strongest against the
 * single largest health pool in the game, and the owner was pushing **raids** when they
 * reported it the second time. So the floor here is `raidConfig(...)`, and the only thing
 * borrowed from §8 is the method.
 *
 * Two things this prints that a bare win-rate cannot, both there because CLAUDE.md's
 * standing lesson is that an instrument which runs but cannot see the change returns a
 * plausible number rather than an error:
 *
 *   - **`ult>T`** — ultimate casts that landed while the boss was still at or above the
 *     execute threshold. That is *literally* the reported bug ("I'm seeing it at, like,
 *     eighty percent health"): on master every one of those casts was paid an execute
 *     rider on a healthy boss, and under the patch every one of them is paid nothing. A
 *     run with `ult>T = 0` never exercised the code under test and proves nothing, however
 *     confident its timing delta looks.
 *   - **`to50` vs `50→0`** — the fight split at the threshold. The patch is defined to
 *     change *nothing* at 0 HP and *everything* above the threshold, so these two halves
 *     must move differently. If `to50` lengthens and `50→0` barely moves, the change did
 *     what it says. If both move together, something else is going on and the number is
 *     not measuring the threshold.
 *
 * A row is only worth reading if it is **contested** — neither 0/N nor N/N. A row pinned
 * at certain-win or certain-loss cannot move in either direction, so it reports a
 * confident delta about a fight whose outcome was never in question. `calibrate` exists
 * to find the gear level that contests each class before the real run.
 *
 *   npx esbuild tools/execute-ab.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/execute-ab.mjs && node node_modules/.cache/execute-ab.mjs
 *
 * Args: `--seeds=N --level=N --tier=N --raid=<id> --classes=a,b --calibrate`
 */

import { EXECUTE_THRESHOLD, executeBonus } from "../src/combat/damage";
import type { ClassId } from "../src/data/classes";
import { RAIDS, raidConfig } from "../src/data/raids";
import type { Dungeon } from "../src/game/dungeon";
import { geared, playFloor } from "./bot";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name: string): boolean => argv.includes(`--${name}`);

const SEEDS = Number(arg("seeds", "24"));
const TIER = Number(arg("tier", "1"));
const RAID_ID = arg("raid", "the-ferryman");
const DODGE = Number(arg("dodge", "0.7"));

/**
 * The three abilities the owner reported, plus a control.
 *
 * The control is load-bearing rather than decorative: this patch reaches the whole
 * vocabulary, so "the numbers moved" is only evidence about the execute rider if a class
 * that carries **no** execute rider anywhere — not on an ability, not on a tree node, not
 * on a relic it might roll — stays flat across the same seeds. `necromancer` is one of the
 * classes with no `executeMissingHealth` and no `addExecuteMissingHealth` in
 * `src/progression/`; if it moves, the harness is measuring noise or something unrelated.
 */
const SUBJECTS: readonly { id: ClassId; note: string }[] = [
  { id: "ranger", note: "The Last Hunt — the reported ability" },
  { id: "reaper", note: "Death Comes Due — 0.8, the worst offender" },
  { id: "assassin", note: "Contract Fulfilled — 0.4" },
  { id: "necromancer", note: "control: carries no execute rider at all" },
];

interface Row {
  cleared: number;
  runs: number;
  /** Seconds to kill, over the runs that actually killed it. */
  killSecs: number[];
  /** Seconds from the start until the boss first reached the threshold. */
  toThreshold: number[];
  /** Seconds from the threshold to death, on runs that got both. */
  belowThreshold: number[];
  damageTaken: number[];
  ultCasts: number;
  /** Ultimate casts while the boss was still at or above the threshold. */
  ultAboveThreshold: number;
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function fmt(x: number): string {
  return Number.isFinite(x) ? x.toFixed(1) : "—";
}

function play(classId: ClassId, level: number, seed: number): Row {
  const spec = RAIDS.find((r) => r.id === RAID_ID);
  if (!spec) throw new Error(`no raid ${RAID_ID}`);
  const state = geared(level, seed, 14, classId);
  const config = raidConfig(spec, TIER);

  let toThreshold = NaN;
  let bossSeen = false;
  let prevCharge = 0;
  let ultCasts = 0;
  let ultAbove = 0;

  const onTick = (d: Dungeon, t: number): void => {
    const boss = d.boss;
    if (!boss) return;
    bossSeen = true;
    const frac = boss.health / Math.max(1, boss.maxHealth);
    if (Number.isNaN(toThreshold) && frac <= EXECUTE_THRESHOLD) toThreshold = t;
    // An ultimate is the meter emptying, which is the one thing that empties it — see
    // THE ULTIMATE RULE in combat/damage.ts (an ultimate cannot recharge itself).
    const charge = d.specialCharge;
    if (prevCharge >= 0.9 && charge < 0.3) {
      ultCasts++;
      if (frac >= EXECUTE_THRESHOLD) ultAbove++;
    }
    prevCharge = charge;
  };

  const r = playFloor(state, config, 300, seed, DODGE, onTick);
  // A raid floor's quota is its boss, so a cleared floor is a dead boss.
  const killed = r.d.phase !== "fighting" && r.d.boss === null && bossSeen;
  return {
    cleared: killed ? 1 : 0,
    runs: 1,
    killSecs: killed ? [r.seconds] : [],
    toThreshold: Number.isNaN(toThreshold) ? [] : [toThreshold],
    belowThreshold: killed && !Number.isNaN(toThreshold) ? [r.seconds - toThreshold] : [],
    damageTaken: [r.damageTaken],
    ultCasts,
    ultAboveThreshold: ultAbove,
  };
}

function sweep(classId: ClassId, level: number): Row {
  const acc: Row = {
    cleared: 0, runs: 0, killSecs: [], toThreshold: [], belowThreshold: [],
    damageTaken: [], ultCasts: 0, ultAboveThreshold: 0,
  };
  for (let i = 0; i < SEEDS; i++) {
    const r = play(classId, level, 4000 + i * 131);
    acc.cleared += r.cleared;
    acc.runs += r.runs;
    acc.killSecs.push(...r.killSecs);
    acc.toThreshold.push(...r.toThreshold);
    acc.belowThreshold.push(...r.belowThreshold);
    acc.damageTaken.push(...r.damageTaken);
    acc.ultCasts += r.ultCasts;
    acc.ultAboveThreshold += r.ultAboveThreshold;
  }
  return acc;
}

function report(label: string, row: Row): void {
  const contested = row.cleared > 0 && row.cleared < row.runs;
  console.log(
    `  ${label.padEnd(30)} ${String(row.cleared).padStart(2)}/${row.runs}`
    + `  kill ${fmt(mean(row.killSecs)).padStart(5)}s`
    + `  to${Math.round(EXECUTE_THRESHOLD * 100)}% ${fmt(mean(row.toThreshold)).padStart(5)}s`
    + `  ${Math.round(EXECUTE_THRESHOLD * 100)}%→0 ${fmt(mean(row.belowThreshold)).padStart(5)}s`
    + `  dmg ${fmt(mean(row.damageTaken)).padStart(6)}`
    + `  ult ${String(row.ultCasts).padStart(3)} (${row.ultAboveThreshold} above)`
    + `  ${contested ? "" : "  << NOT CONTESTED"}`,
  );
}

/**
 * Master's execute expression, quoted verbatim from `src/combat/runtime.ts` at bc9dace:
 *
 *     amount += (victim.maxHealth - victim.health) * dt.executeMissingHealth;
 *
 * Held here so the before/after table is arithmetic on the real two formulas rather than
 * a recollection of one of them. It is one line and it is checkable with `git show`.
 */
function masterExecuteBonus(coeff: number, health: number, maxHealth: number): number {
  return (maxHealth - health) * coeff;
}

/**
 * The direct instrument, and the primary evidence for §20.
 *
 * The fight-level A/B below can only speak for a class whose ultimate the bot actually
 * casts, and two of the three cannot be exercised that way at all: the Reaper's meter
 * charges only from `execute`-tagged hits and the Assassin's only from its own kit, so on
 * a raid floor — one enormous body, almost no other kills — the meter never fills under
 * bot play. `maxCharge` reads 0.000 for the Reaper across a whole fight. That is real game
 * behaviour rather than a broken detector, but either way an A/B there would be reporting
 * a confident delta about an ability that never fired.
 *
 * So the claim the owner actually made — "it's insta killing bosses, and I'm seeing it at,
 * like, eighty percent health" — is answered here instead, exactly and without seeds: what
 * does the rider add, in raw damage, against a real raid boss's health pool, at the health
 * fractions a player sees? No dice, no bot, no calibration to get wrong.
 */
function riderTable(): void {
  const raid = RAIDS.find((r) => r.id === RAID_ID);
  if (!raid) return;
  // A real boss's health pool, taken from a live floor rather than assumed.
  const probe = playFloor(geared(40, 99, 14, "ranger"), raidConfig(raid, TIER), 6, 99, 0);
  const bossMax = probe.d.boss?.maxHealth ?? NaN;
  if (!Number.isFinite(bossMax)) {
    console.log("  (no boss on the probe floor — table skipped)\n");
    return;
  }
  console.log(`Execute rider against ${raid.name} tier ${TIER} (boss maxHealth ${Math.round(bossMax)})`);
  console.log("  damage the rider ADDS to one hit, master -> patched\n");
  const subjects: readonly { label: string; coeff: number }[] = [
    { label: "reaper   Death Comes Due  0.8", coeff: 0.8 },
    { label: "reaper   Pale Hook        0.5", coeff: 0.5 },
    { label: "assassin Contract Fulfld  0.4", coeff: 0.4 },
    { label: "ranger   The Last Hunt    0.2", coeff: 0.2 },
  ];
  const fracs = [0.9, 0.8, 0.6, 0.5, 0.35, 0.2, 0.0];
  console.log(`  ${"boss health".padEnd(29)}${fracs.map((f) => `${Math.round(f * 100)}%`.padStart(16)).join("")}`);
  for (const s of subjects) {
    const cells = fracs.map((f) => {
      const before = masterExecuteBonus(s.coeff, bossMax * f, bossMax);
      const after = executeBonus(s.coeff, bossMax * f, bossMax);
      return `${Math.round(before)}->${Math.round(after)}`.padStart(16);
    });
    console.log(`  ${s.label.padEnd(29)}${cells.join("")}`);
  }
  console.log(
    "\n  Read the 80% column against the owner's sentence, and the 0% column against"
    + "\n  \"don't gut it\": the rider is unchanged at the moment of the kill.\n",
  );
}

const spec = RAIDS.find((r) => r.id === RAID_ID);
console.log(
  `\n${spec?.name ?? RAID_ID} tier ${TIER} · ${SEEDS} seeds · dodge ${DODGE}`
  + ` · threshold ${EXECUTE_THRESHOLD}\n`,
);

riderTable();

if (flag("calibrate")) {
  // Find the gearing that contests each class before believing any delta from it. A row
  // pinned at 0/N or N/N cannot move and measures nothing, whichever side of the A/B it
  // is on — and the calibration has to be re-read on the patched side too, because a
  // change that alters lethality can push a contested row off the plateau.
  for (const s of SUBJECTS) {
    console.log(`${s.id} — ${s.note}`);
    for (const level of [20, 30, 40, 50, 60]) report(`level ${level}`, sweep(s.id, level));
    console.log("");
  }
} else {
  const level = Number(arg("level", "40"));
  const only = arg("classes", "");
  const list = only ? SUBJECTS.filter((s) => only.split(",").includes(s.id)) : SUBJECTS;
  for (const s of list) report(`${s.id} @ ${level} — ${s.note}`, sweep(s.id, level));
  console.log("");
}
