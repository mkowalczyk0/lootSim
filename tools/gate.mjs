#!/usr/bin/env node
/**
 * The cheap half of the acceptance gate, **derived** from the `test` chain.
 *
 * ## Why this exists
 *
 * `npm test` is ~42 steps, of which `npm run smoke` alone is 15–19 minutes — around 95%
 * of the wall clock. The owner approved splitting it: an individual branch runs the cheap
 * steps (about a minute), and the full chain including smoke is reserved for the single
 * integration gate on the merged result. Every session was doing that split by pasting a
 * `node -e "...split(' && ')..."` one-liner into a shell, which is precisely the kind of
 * thing that rots — it lives in a handover message, not in the repo.
 *
 * ## The one property that matters: derived, never a copy
 *
 * This file must never contain a list of steps. It reads `scripts.test` at run time and
 * subtracts smoke from it. A frozen copy would silently skip any step a branch adds —
 * and a branch's own new check is the step most worth running, because it is the one
 * nothing else in the repo has ever executed.
 *
 * That is not a hypothetical. This project has already shipped exactly that defect, in
 * the very tool built to save time: on one branch the derived chain was 37 steps and the
 * hand-frozen literal was 36, and the missing one was that branch's own new gate. It was
 * caught by comparing the two counts, not by reading either of them.
 *
 * `tools/check-scripts.mjs` stands behind this with the rule rather than the notice: it
 * fails if `scripts.gate` ever stops routing through this file. So the copy cannot be
 * reintroduced by editing `package.json`, which is where it would be reintroduced.
 *
 * ## What it prints
 *
 * The step count, and every step it dropped, before it runs anything. A filter whose
 * scope has quietly emptied — or quietly swallowed half the chain — is the failure mode
 * CLAUDE.md's own rule names, and the cure is the same one `check-scripts.mjs` uses:
 * print what you walked, so a wrong number is visible rather than inferred.
 *
 * The terminator is `ALL GATE CHECKS PASSED`, deliberately NOT the `ALL CHECKS PASSED`
 * that `npm test` ends with. Someone grepping a log for the full gate's terminator must
 * not find it here: smoke did not run, and a line that reads identically would let a
 * cheap run be reported as a complete one.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const chain = pkg.scripts?.test ?? "";
const all = chain.split(" && ").map((s) => s.trim()).filter((s) => s.length > 0);

// The subtraction, and the only place a step is ever excluded. `smoke` is the expensive
// one by an order of magnitude; nothing else is excluded and nothing else should be
// without the owner's call, because every exclusion here is a check a branch stops running.
const SKIP = /\bsmoke\b/;
const skipped = all.filter((s) => SKIP.test(s));
const steps = all.filter((s) => !SKIP.test(s));

console.log("=== gate: the cheap chain, derived from scripts.test ===");
console.log(`  scripts.test has ${all.length} steps; running ${steps.length}, deferring ${skipped.length}`);
for (const s of skipped) console.log(`  deferred to the integration gate: ${s}`);
console.log("");

// A derivation that produced nothing, or that swallowed the whole chain, is this file
// having stopped working rather than the gate having got cheaper.
if (all.length === 0) {
  console.error("  gate: scripts.test parsed to no steps — this runner is deriving nothing.");
  process.exit(2);
}
if (steps.length === 0) {
  console.error("  gate: every step was deferred — the skip pattern is wrong.");
  process.exit(2);
}

for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  console.log(`--- gate step ${i + 1}/${steps.length}: ${step}`);
  const run = spawnSync(step, { stdio: "inherit", cwd: root, shell: true });
  if (run.signal) {
    console.error(`  gate: step died by signal ${run.signal} — ${step}`);
    process.exit(128);
  }
  if (run.status !== 0) {
    console.error("");
    console.error(`  gate: step exited ${run.status} — ${step}`);
    console.error(`  ${steps.length - i - 1} later steps were not reached.`);
    process.exit(run.status ?? 1);
  }
}

console.log("");
console.log(`ALL GATE CHECKS PASSED — ${steps.length} steps; smoke deferred, run \`npm test\` for the full chain`);
