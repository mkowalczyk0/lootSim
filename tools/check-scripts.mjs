#!/usr/bin/env node
/**
 * The gate's own harness, checked: no npm script may bundle to a shared, fixed path.
 *
 * `tools/run-tool.mjs` makes an unshared bundle the default for anything routed through
 * it, but nothing stops someone pasting the old
 * `esbuild ... --outfile=node_modules/.cache/X.mjs && node ...` line back into
 * `package.json` — that shape is still all over this project's git history, which is
 * exactly where a future contributor will copy it from. This is the check that notices,
 * standing behind the rule that prevents.
 *
 * It also **prints what it walked**. A check whose scope can quietly empty is the second
 * of the four failure modes in CLAUDE.md's own rule, and this repo has shipped one: two
 * tools proved a fallback ladder by pointing at a monster set that later got its art, and
 * a filter over an empty table passes forever. If the covered count here ever drops to
 * something implausible, the number in the output is what makes that visible instead of
 * inferred.
 */
import { readFileSync, realpathSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const scripts = Object.entries(pkg.scripts ?? {});

/**
 * Is this checkout's `node_modules` its own?
 *
 * The runner makes a shared `node_modules` safe for bundle collisions specifically. It
 * does nothing about everything else two checkouts would then share, and the rule is that
 * a worktree gets its own `npm install`. That rule needs enforcing rather than
 * remembering: the session that *found* the original fault reproduced it within the hour,
 * in the worktree they were about to certify a merge in, while holding the write-up in
 * working memory. A rule its own author breaks the same day does not survive a fresh
 * session next week.
 *
 * Resolved with `realpath` rather than `lstat`, so this catches a symlinked
 * `node_modules`, a symlinked parent directory, and a bind-mount alike — the property
 * that matters is where the bytes actually live, not how the link was spelled.
 */
function nodeModulesHome() {
  const nm = join(root, "node_modules");
  if (!existsSync(nm)) return { ok: false, reason: "absent", real: nm };
  const real = realpathSync(nm);
  const expected = join(realpathSync(root), "node_modules");
  return { ok: real === expected, reason: real === expected ? "own" : "elsewhere", real, expected };
}

/**
 * The `test` chain itself, parsed into steps.
 *
 * Four branches are adding a script to `package.json` tonight and the chain is being
 * hand-unioned. A union that emits the same `&& npm run X &&` twice is *invisible*: the
 * step simply runs twice, nothing fails, and the only symptom is a gate that takes longer
 * than it should. The bundle-path check above cannot see it — it reads script bodies, not
 * the chain — so the hole was named in a handover before it was a defect, and this is the
 * cheap check standing behind it.
 */
function testChainSteps() {
  const chain = pkg.scripts?.test ?? "";
  return chain
    .split("&&")
    .map((part) => /^\s*npm run ([\w:-]+)\s*$/.exec(part))
    .filter((m) => m !== null)
    .map((m) => m[1]);
}

const offenders = scripts.filter(([, v]) => v.includes("node_modules/.cache"));
const viaRunner = scripts.filter(([, v]) => v.includes("run-tool.mjs"));

console.log(`=== harness: bundle output paths ===`);
console.log(`  walked ${scripts.length} npm scripts; ${viaRunner.length} bundle via tools/run-tool.mjs`);

if (offenders.length > 0) {
  console.error("");
  console.error("  FAIL  these scripts bundle to a fixed path under node_modules/.cache:");
  for (const [k, v] of offenders) console.error(`        ${k}: ${v}`);
  console.error("");
  console.error("  Two runs that share a node_modules — two worktrees symlinked to one");
  console.error("  checkout, or one worktree running the gate twice at once — write and");
  console.error("  execute the SAME bundle file. A's esbuild writes it, B's overwrites it,");
  console.error("  A's node runs B's code, and the gate then certifies a tree it never");
  console.error("  tested. Route it through the runner instead:");
  console.error("");
  console.error(`        "${offenders[0][0]}": "node tools/run-tool.mjs <tools/NAME.ts basename>"`);
  console.error("");
  process.exit(1);
}

// A scope that has emptied is the failure this print exists to make visible. If nothing
// bundles at all any more, something is wrong with this check rather than with the repo.
if (viaRunner.length === 0) {
  console.error("  FAIL  no script bundles through the runner — this check is measuring nothing.");
  process.exit(1);
}

console.log(`  ok   no script bundles to a shared fixed path`);

const home = nodeModulesHome();
if (!home.ok) {
  console.error("");
  console.error(`  FAIL  this checkout's node_modules is not its own (${home.reason}).`);
  console.error(`        node_modules resolves to: ${home.real}`);
  if (home.expected) console.error(`        expected:                 ${home.expected}`);
  console.error("");
  console.error("  A worktree needs its own `npm install`. Sharing one checkout's");
  console.error("  node_modules with another is how four sessions ran each other's test");
  console.error("  bundles on 2026-09-10 — see docs/gate-isolation.md. The bundle paths");
  console.error("  are safe now; everything else two checkouts would share is not.");
  console.error("");
  console.error("        rm node_modules && npm install");
  console.error("");
  process.exit(1);
}
console.log(`  ok   node_modules is this checkout's own — ${home.real}`);

const steps = testChainSteps();
const seen = new Map();
const dupes = [];
for (const step of steps) {
  const n = (seen.get(step) ?? 0) + 1;
  seen.set(step, n);
  if (n === 2) dupes.push(step);
}
const undefined_ = [...new Set(steps)].filter((step) => !(step in (pkg.scripts ?? {})));

console.log(`  walked ${steps.length} steps in the test chain; ${seen.size} distinct`);

// The same scope guard as above: a chain that parses to nothing means this check stopped
// measuring rather than that the gate got simpler.
if (steps.length === 0) {
  console.error("  FAIL  the test chain parsed to no steps — this check is measuring nothing.");
  process.exit(1);
}

if (dupes.length > 0) {
  console.error("");
  console.error("  FAIL  these steps appear more than once in the test chain:");
  for (const d of dupes) console.error(`        ${d} (${seen.get(d)}x)`);
  console.error("");
  console.error("  A duplicated step is what a hand-unioned package.json produces when two");
  console.error("  branches each add `&& npm run X` at a different point in the chain. It");
  console.error("  costs a whole extra run of that check and reports nothing — the gate is");
  console.error("  simply slower, which is the kind of defect nobody goes looking for.");
  console.error("");
  process.exit(1);
}

if (undefined_.length > 0) {
  console.error("");
  console.error("  FAIL  the test chain runs steps that are not defined scripts:");
  for (const u of undefined_) console.error(`        ${u}`);
  console.error("");
  console.error("  This already fails at run time — but it fails partway through the gate,");
  console.error("  minutes in, after everything before it has run. Here it costs a second.");
  console.error("");
  process.exit(1);
}

console.log(`  ok   no step runs twice, and every step is a defined script`);
console.log("");
console.log("ALL HARNESS CHECKS PASSED");
