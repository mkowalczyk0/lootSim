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
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const scripts = Object.entries(pkg.scripts ?? {});

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
console.log("");
console.log("ALL HARNESS CHECKS PASSED");
