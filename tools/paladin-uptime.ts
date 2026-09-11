/**
 * Paladin's ultimate uptime, measured rather than reasoned about (docket §31 lead).
 *
 * The owner's report is "Paladin needs a cooldown on his ultimate — you can infinitely
 * live if you get it up enough times." Two things about that had to be established before
 * a number meant anything, and both came out of reading rather than measuring:
 *
 *   - **`cooldown: 0` is not the defect.** All 21 ultimates in the game are `cooldown: 0`;
 *     they are gated by a charge meter, not a cooldown. Sizing a cooldown for Paladin alone
 *     would be a roster inconsistency.
 *   - **The proposed loop through `under_oath` does not exist.** `dungeon.ts` computes
 *     `prevented` *before* the death-guard clamp, and the clamp only ever reduces `dealt`,
 *     so damage the guard absorbs is never counted as `damagePrevented` and never reaches
 *     the meter.
 *
 * What is left is a loop that does not involve the ultimate at all: ward absorption *is*
 * counted in `prevented`; `damagePrevented` feeds both the ultimate meter (40/maxHealth
 * fraction) and Conviction (50); and Conviction above 60 grants `wardPower +0.15`, which
 * makes the ward bigger, which prevents more. This tool measures what that is worth in a
 * real fight.
 *
 * Reported as **comparisons**, never as one class's bound — the project's standing lesson.
 * The bot fires the ultimate the tick it charges (`bot.ts`: `if (d.specialCharge >= 1)`),
 * which is exactly the play the owner described.
 *
 * Reports; never fails the build. Run with `npm run paladin-uptime`.
 */

import { playFloor, geared } from "./bot";
import { delveConfig } from "../src/data/modes";
import { CLASS_IDS, type ClassId } from "../src/data/classes";
import type { Dungeon } from "../src/game/dungeon";

/**
 * **Depth 22, not 14, and the calibration is the finding.** At depth 14 a Paladin never
 * charges at all — peak meter 23-58% over a 240s floor, zero casts, at levels 40 and 60
 * and at dodge 0.00 / 0.25 / 0.55 alike. A row pinned at zero casts cannot move in either
 * direction and measures nothing (CLAUDE.md: calibrate until the row is genuinely
 * contested). At depth 22 the meter reaches 100% and the ultimate fires repeatedly, so
 * that is where the question can actually be asked.
 *
 * Why the depth matters so much is itself the mechanism. Paladin's meter is fed *only* by
 * `damagePrevented`, at `perUnit: "maxHealthFraction"` — so the gain per hit is
 * proportional to (damage your armour and ward ate) / (your max health). Bigger incoming
 * hits charge it; a bigger health pool *slows* it. That is why level 60 fires less often
 * than level 40 on the same floor, and it is the owner's sentence stated as a formula:
 * the harder you are being hit, the sooner you can cast it again.
 */
const DEPTH = 22;
const LEVEL = 40;
const SEEDS = [101, 202, 303, 404];
/** The whole roster: 26's finding that all 21 ultimates are `cooldown: 0` means the
 *  comparison set is every class, not just the tanks. An outlier against the roster is a
 *  far stronger artefact than an outlier against Juggernaut alone. */
const CLASSES: readonly ClassId[] = [...CLASS_IDS];

interface Row {
  classId: ClassId;
  seconds: number;
  casts: number;
  chargedTicks: number;
  guardedTicks: number;
  ticks: number;
}

function run(classId: ClassId, seed: number): Row {
  const state = geared(LEVEL, seed, 14, classId);
  let casts = 0;
  let chargedTicks = 0;
  let guardedTicks = 0;
  let ticks = 0;
  let wasCharged = false;
  const onTick = (d: Dungeon): void => {
    ticks += 1;
    const charged = d.specialCharge >= 1;
    if (charged) chargedTicks += 1;
    // A fall from charged to not-charged is a cast. Reading the meter rather than the
    // event keeps this identical across classes with different ultimate effects.
    if (wasCharged && !charged) casts += 1;
    wasCharged = charged;
    if (d.localHero.sc.has("under_oath")) guardedTicks += 1;
  };
  const r = playFloor(state, delveConfig(DEPTH), 300, seed, 0.55, onTick);
  return { classId, seconds: r.seconds, casts, chargedTicks, guardedTicks, ticks };
}

const rows = new Map<ClassId, Row[]>();
for (const classId of CLASSES) {
  const list: Row[] = [];
  for (const seed of SEEDS) list.push(run(classId, seed));
  rows.set(classId, list);
}

console.log(`Paladin ultimate uptime — depth ${DEPTH}, level ${LEVEL}, ${SEEDS.length} seeds, dodge 0.55\n`);
console.log("class          fight(s)   ult casts   casts/min   charged%   under_oath%");
const summary = new Map<ClassId, { perMin: number; guardPct: number }>();
for (const classId of CLASSES) {
  const list = rows.get(classId)!;
  const secs = list.reduce((a, r) => a + r.seconds, 0);
  const casts = list.reduce((a, r) => a + r.casts, 0);
  const ticks = list.reduce((a, r) => a + r.ticks, 0);
  const charged = list.reduce((a, r) => a + r.chargedTicks, 0);
  const guarded = list.reduce((a, r) => a + r.guardedTicks, 0);
  const perMin = secs > 0 ? (casts / secs) * 60 : 0;
  const guardPct = ticks > 0 ? (guarded / ticks) * 100 : 0;
  summary.set(classId, { perMin, guardPct });
  console.log(
    `${classId.padEnd(13)} ${(secs / list.length).toFixed(1).padStart(7)}` +
    ` ${String(casts).padStart(11)} ${perMin.toFixed(2).padStart(11)}` +
    ` ${(ticks > 0 ? (charged / ticks) * 100 : 0).toFixed(1).padStart(9)}%` +
    ` ${guardPct.toFixed(1).padStart(11)}%`,
  );
}

console.log("\n--- the comparisons ---");
const pal = summary.get("paladin")!;
const others = CLASSES.filter((c) => c !== "paladin").map((c) => summary.get(c)!.perMin).sort((a, b) => a - b);
const median = others.length ? others[Math.floor(others.length / 2)]! : 0;
const rank = [...CLASSES].sort((a, b) => summary.get(b)!.perMin - summary.get(a)!.perMin).indexOf("paladin") + 1;
console.log(`  paladin fires ${pal.perMin.toFixed(2)} ultimates/min — rank ${rank} of ${CLASSES.length} on the roster`);
console.log(`  roster median is ${median.toFixed(2)}/min, so paladin is ${median > 0 ? (pal.perMin / median).toFixed(2) : "n/a"}x the median`);
console.log(`  fastest: ${[...CLASSES].sort((a, b) => summary.get(b)!.perMin - summary.get(a)!.perMin).slice(0, 3).map((c) => `${c} ${summary.get(c)!.perMin.toFixed(2)}`).join(", ")}`);
console.log(`\n  paladin spends ${pal.guardPct.toFixed(1)}% of the floor under a death guard that cannot be brought below 1 HP`);
console.log(`  (under_oath is 6s per cast, refreshRule "refresh" — overlapping casts do not stack, they extend)`);
