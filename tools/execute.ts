/**
 * THE EXECUTE RULE acceptance test (docket §20). Design record `docs/execute-threshold.md`.
 *
 * The rule reaches **thirty-one** authoring sites — `executeMissingHealth` on 14 damage
 * packets across 8 classes, plus 17 tree nodes, mutations and one relic that add the rider
 * via `addExecuteMissingHealth`. Only three of those were reported. Everything asserted
 * here exists to make "the other twenty-eight were not buffed, and they still finish
 * exactly as hard as they used to" a **fact** rather than a reading of the formula.
 *
 * The headline property is a comparison, per CLAUDE.md's standing lesson: a one-sided
 * bound on the new term would pass while proving nothing about its relationship to the
 * old one. So every check here is stated against master's own expression, which is quoted
 * verbatim from `src/combat/runtime.ts` at bc9dace and is one line you can `git show`.
 */

import { EXECUTE_THRESHOLD, executeBonus } from "../src/combat/damage";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  — ${detail}` : ""}`);
}

/**
 * Master's execute expression, quoted verbatim from `src/combat/runtime.ts` at bc9dace:
 *
 *     amount += (victim.maxHealth - victim.health) * dt.executeMissingHealth;
 *
 * Held here so every comparison below is arithmetic on the real two formulas rather than
 * on a recollection of one of them.
 */
function masterBonus(coeff: number, health: number, maxHealth: number): number {
  return (maxHealth - health) * coeff;
}

// Deliberately spread past what the game authors today (0.05 … 1.0), so the properties
// are about the rule rather than about the roster that happens to exist. The largest
// authored coefficient is the Reaper's 1.0; riders stack, so the sweep goes above it.
const COEFFS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.5, 2.0];
const MAXES = [100, 1_000, 105_443, 5_000_000];
const STEPS = 2000;

console.log(`\n=== THE EXECUTE RULE (threshold ${EXECUTE_THRESHOLD}) ===\n`);

{
  // The safety property, and the reason touching 31 sites is defensible. If this ever
  // goes red, some ability somewhere got *stronger* from a change nobody asked to buff it
  // with — which is the uncommanded balance pass the docket rules out, in the direction
  // nobody would think to look for it.
  let worst = 0;
  let worstAt = "";
  let ok = true;
  for (const coeff of COEFFS) {
    for (const max of MAXES) {
      for (let i = 0; i <= STEPS; i++) {
        const health = (max * i) / STEPS;
        const before = masterBonus(coeff, health, max);
        const after = executeBonus(coeff, health, max);
        // A hair of float tolerance, scaled to the magnitude being compared — these are
        // products of large numbers, so an absolute epsilon would be meaningless at
        // maxHealth 5,000,000 and far too loose at 100.
        if (after > before + Math.abs(before) * 1e-12 + 1e-9) {
          ok = false;
          const gap = after - before;
          if (gap > worst) { worst = gap; worstAt = `coeff ${coeff}, max ${max}, health ${health}`; }
        }
      }
    }
  }
  check("no execute rider is ever stronger than it was before the rule", ok,
    ok ? `${COEFFS.length * MAXES.length * (STEPS + 1)} points swept` : `worst +${worst} at ${worstAt}`);
}

{
  // The other half of the same claim, and the one that says this is not a gutting: the
  // rider is *untouched* at the moment it actually finishes something. Equality here is
  // what lets the design record say the 28 unreported riders keep their payoff.
  let ok = true;
  let detail = "";
  for (const coeff of COEFFS) {
    for (const max of MAXES) {
      const before = masterBonus(coeff, 0, max);
      const after = executeBonus(coeff, 0, max);
      if (Math.abs(after - before) > Math.abs(before) * 1e-12 + 1e-9) {
        ok = false;
        detail = `coeff ${coeff}, max ${max}: ${before} vs ${after}`;
      }
    }
  }
  check("…and at 0 HP it is exactly what it always was", ok, ok ? "equality, not a bound" : detail);
}

{
  // The reported bug, stated as the property it is. "I'm seeing it at, like, eighty
  // percent health" — above the threshold the rider contributes nothing at all, and the
  // check walks the whole range rather than sampling 80%, so a threshold that moved would
  // still be caught here.
  let ok = true;
  let detail = "";
  for (const coeff of COEFFS) {
    for (const max of MAXES) {
      for (let i = 0; i <= STEPS; i++) {
        const frac = EXECUTE_THRESHOLD + ((1 - EXECUTE_THRESHOLD) * i) / STEPS;
        const after = executeBonus(coeff, max * frac, max);
        if (after !== 0) { ok = false; detail = `coeff ${coeff}, max ${max}, frac ${frac}: ${after}`; }
      }
    }
  }
  check("a target at or above the threshold is paid no execute damage whatsoever", ok, detail);
  // …and the same sweep on master, so the check is known to be measuring something. A
  // property that holds on both sides is not evidence about the change.
  //
  // The endpoints are excluded on purpose and the reason is worth writing down, because
  // the first version of this check went red on itself: at *exactly* full health master
  // paid zero too, since nothing was missing yet. That is not a point of difference and
  // counting it made the check fail while the code was right. The band that matters is
  // strictly between the threshold and full health — which is where "eighty percent" is.
  let masterPaid = 0;
  const points = STEPS - 1;
  for (let i = 1; i < STEPS; i++) {
    const frac = EXECUTE_THRESHOLD + ((1 - EXECUTE_THRESHOLD) * i) / STEPS;
    if (masterBonus(0.8, 105_443 * frac, 105_443) > 0) masterPaid++;
  }
  check("…and master paid it across that whole range, so this is a real difference",
    masterPaid === points, `${masterPaid}/${points} points above the threshold paid out before`);
}

{
  // Continuity. The rejected alternative — keep `(max − health) · coeff` and simply skip
  // it above the threshold — is identical to master below the threshold and therefore
  // disturbs the unreported riders *less* than the ramp does. It was rejected for one
  // reason and it is worth pinning that reason rather than remembering it: it steps from
  // 0 to `(1 − T) · max · coeff` at the boundary. At the Reaper's coefficient on a
  // Ferryman that is ~43,000 damage appearing the instant the boss crosses half health,
  // which is the owner's "it just insta kills bosses" complaint relocated rather than
  // fixed. The ramp has no such step.
  const max = 105_443;
  const coeff = 0.8;
  const eps = max * 1e-4;
  const justAbove = executeBonus(coeff, max * EXECUTE_THRESHOLD + eps, max);
  const justBelow = executeBonus(coeff, max * EXECUTE_THRESHOLD - eps, max);
  const step = Math.abs(justBelow - justAbove);
  const naiveStep = (1 - EXECUTE_THRESHOLD) * max * coeff;
  check("the rider is continuous across the threshold, not a cliff",
    step < naiveStep * 0.01, `step ${step.toFixed(1)} vs the naive gate's ${naiveStep.toFixed(0)}`);
}

{
  // Monotone in health: the closer to death, the more the rider pays. An execute that
  // ever paid *less* against a more wounded target would be nonsense, and this is the
  // cheapest place to notice it if the ramp is ever re-shaped.
  const max = 105_443;
  let ok = true;
  for (const coeff of COEFFS) {
    let prev = -1;
    for (let i = STEPS; i >= 0; i--) {
      const v = executeBonus(coeff, (max * i) / STEPS, max);
      if (v < prev - 1e-9) ok = false;
      prev = v;
    }
  }
  check("the rider never pays less against a more wounded target", ok);
}

{
  check("a zero or negative coefficient contributes nothing",
    executeBonus(0, 10, 100) === 0 && executeBonus(-1, 10, 100) === 0);
  check("a dead or over-killed target does not produce a negative rider",
    executeBonus(0.8, -50, 100) >= 0, `${executeBonus(0.8, -50, 100)}`);
  check("a zero maxHealth does not divide by zero",
    Number.isFinite(executeBonus(0.8, 0, 0)), `${executeBonus(0.8, 0, 0)}`);
}

console.log(failures === 0
  ? "\nThe wounded, and only the wounded.\n"
  : `\n${failures} problem(s).\n`);
process.exit(failures === 0 ? 0 : 1);
