#!/usr/bin/env node
/**
 * Bundle one acceptance tool and run it, from a private directory nobody else can write.
 *
 * ## Why this exists
 *
 * Every script in the gate used to be, literally:
 *
 * ```
 * esbuild tools/X.ts --outfile=node_modules/.cache/X.mjs && node node_modules/.cache/X.mjs
 * ```
 *
 * That output path is fixed and relative to `node_modules`. Any two runs that share a
 * `node_modules` — two worktrees whose `node_modules` is a symlink to the same checkout,
 * or one worktree running the gate twice at once — therefore write and execute **the same
 * bundle file**. The bad interleaving needs no bad luck at all: A's esbuild writes
 * `smoke.mjs`, B's esbuild overwrites it, A's `node` starts and runs **B's code**. A green
 * gate then certifies a tree that was never tested. Four concurrent runs were caught in
 * this state on 2026-09-10, and one of them was a session verifying an unrelated fix.
 *
 * It is the harness-level member of a family this repo hit five times in one day: a check
 * that runs, stays green, and is structurally incapable of measuring the thing it names.
 * Worse than its siblings, because it can invalidate all of them at once.
 *
 * ## Why a runner rather than a longer command line
 *
 * The obvious patch is to make each of the 43 script lines write somewhere unique — a
 * `$$` in the filename, say. That fixes the 43 lines that exist and does nothing about the
 * 44th, and this repo's standing preference is explicit: **a rule that cannot be violated
 * beats a check that notices when it was.** With the path policy in one place, a tool
 * added tomorrow gets an unshared bundle for free, and there is no per-script field for
 * anyone to omit.
 *
 * The directory is created with `mkdtemp` (unique by construction, not by convention),
 * lives outside the repo entirely, and is removed on every exit path — including a crash
 * or a Ctrl-C, so a killed gate leaves nothing behind. The tool's own exit code and
 * signal are passed straight through: this wrapper must never turn a red gate green.
 *
 * Usage: `node tools/run-tool.mjs <name>` — bundles `tools/<name>.ts`. Extra arguments
 * are forwarded to the tool.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [name, ...forward] = process.argv.slice(2);

if (!name) {
  console.error("run-tool: expected a tool name, e.g. `node tools/run-tool.mjs smoke`");
  process.exit(2);
}
// Refuse a name that could climb out of `tools/`. These names come from our own
// package.json today, but a runner that will happily bundle `../../etc/anything` is a
// footgun sitting in the repo waiting for the first person to wire it to an argument.
if (!/^[A-Za-z0-9_-]+$/.test(name)) {
  console.error(`run-tool: refusing suspicious tool name ${JSON.stringify(name)}`);
  process.exit(2);
}

const entry = join(root, "tools", `${name}.ts`);
if (!existsSync(entry)) {
  console.error(`run-tool: no such tool — ${entry}`);
  process.exit(2);
}

// Resolve esbuild from this checkout's own node_modules rather than the PATH, so the
// runner uses the same binary the old inline command did.
const esbuild = join(root, "node_modules", ".bin", "esbuild");
if (!existsSync(esbuild)) {
  console.error(
    `run-tool: esbuild not found at ${esbuild}.\n` +
    "A worktree needs its own `npm install` — a symlinked `node_modules` is the very " +
    "thing this runner exists to make safe, and it is still not supported.",
  );
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), "lootsim-tool-"));
const out = join(dir, `${name}.mjs`);
const cleanup = () => rmSync(dir, { recursive: true, force: true });
// A killed gate must not leave a temp directory behind either.
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => { cleanup(); process.exit(130); });
}

const bundle = spawnSync(
  esbuild,
  [entry, "--bundle", "--platform=node", "--format=esm", `--outfile=${out}`, "--log-level=error"],
  { stdio: "inherit", cwd: root },
);
if (bundle.status !== 0) process.exit(bundle.status ?? 1);

const run = spawnSync(process.execPath, [out, ...forward], { stdio: "inherit", cwd: root });
// Preserve "died by signal" as a non-zero exit rather than reporting success.
if (run.signal) process.exit(128);
process.exit(run.status ?? 1);
