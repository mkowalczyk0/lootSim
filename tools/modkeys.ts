/**
 * Every mod key must have a live read — the rule `wardPower` cost us.
 *
 * `wardPower` was a `ModKey` granted by ten class foundation nodes, two universal-tree
 * nodes, five resource thresholds, the "of Warding" suffix and a raid artifact, and no
 * file in `src/combat/` or `src/game/` ever read it. Eleven classes shipped a node that
 * did nothing, for most of this project's life, with the whole acceptance chain green —
 * because nothing in the chain ever asked the question. The owner's ruling was to remove
 * the stat rather than implement it (see docs/wardpower-removal.md), and the rule that
 * came out of it binds every branch:
 *
 *   **No mod key may be authored without a live read in `src/combat/` or `src/game/`.**
 *
 * A rule that cannot be violated beats a check that notices, and that option was looked
 * for first. It is not available here: `Mods` is consumed ad hoc at ~40 call sites rather
 * than through one exhaustive `Record`, so there is no `buildSprites()`-shaped seam where
 * the compiler could refuse a key with no consumer. Making one would mean rewriting every
 * read site — a far larger change than the defect. So this is the weaker kind, a check,
 * and it is built to fail loudly rather than quietly:
 *
 *  - **It prints what it walked.** A scope that silently empties is the failure family
 *    this repo is scarred by (CLAUDE.md's four-lesson rule, second bullet). If the key
 *    count here ever drops to something implausible, the number in the output says so.
 *  - **Its subject comes from the source, not from a list kept here.** The keys are
 *    imported from `src/data/mods.ts` itself, so a key added tomorrow is walked for free
 *    and cannot be omitted by forgetting to add it in two places.
 *  - **Its bound is a fixed reference the code under test cannot move.** "Is it read?" is
 *    answered against the simulation directories, not against the authoring data that
 *    declares the key — a grant can never satisfy this check by being a grant.
 *  - **Known-dead keys are PINNED, not filtered.** On the `tools/legends.ts` precedent: a
 *    NEW dead key fails, and so does silently fixing a pinned one. `ultimateBounces` and
 *    `ultimateProjectiles` were pinned here when this landed — in exactly `wardPower`'s
 *    position, authored on Stormcaller and on the "of Rebounding" / "of the Manifold"
 *    suffixes, never read — because whether they got the same treatment was an owner call
 *    and a separate branch. That call was made the same way (`fix/ultimate-mod-retirement`,
 *    docs/ultimate-mods-removal.md) and both keys are gone from the vocabulary, so the pin
 *    list is now empty. That is the pin doing its job at the end of its life rather than a
 *    filter quietly emptying: the branch that removed the keys had to come here and say so,
 *    because a pin naming a key that no longer exists reads as "now live" and fails.
 *
 * The instrument's honest limit: a "read" is the key's identifier appearing in a
 * simulation file. A key consumed only through a computed property name would read as
 * dead. No such site exists today, and a dead-key false positive is a cheap, visible
 * failure — the expensive direction, a dead key passing, is the one this is built to
 * catch. The check was falsified before it was trusted: injecting a grant-only key makes
 * it go red, and the injection is reproduced in the header of `docs/wardpower-removal.md`.
 *
 * Headless, no browser. Run with `npm run modkeys`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ELEMENT_DAMAGE_KEY, ELEMENT_RESIST_KEY, MOD_KEYS } from "../src/data/mods";

// The repo root. `tools/run-tool.mjs` bundles to a temp dir, so `import.meta.url` points
// somewhere under /tmp — every tool in here resolves source paths off the cwd instead
// (`tools/relics.ts` reads "src/game/rules.ts" the same way).
const root = process.cwd();

/** The simulation. A mod key earns its place by being read in one of these. */
const SIM_DIRS = ["src/combat", "src/game", "src/net"];

/**
 * Not a read: `MOD_WEIGHTS` in `src/game/item.ts` is the vendor-valuation table, which
 * lists every key by construction and would therefore call every key live. Excluded by
 * file so the exclusion is visible rather than woven into a regex.
 */
const NOT_A_READ = new Set(["src/game/item.ts"]);

/**
 * Keys known to have no live read, pinned rather than filtered. A new entry here needs
 * an owner decision, not a commit — see the header.
 */
const PINNED_DEAD: Record<string, string> = {
  // `ultimateBounces` and `ultimateProjectiles` were pinned here. The owner call they were
  // waiting on was made — remove and re-author, the same ruling `wardPower` got — and both
  // keys are now gone from `MOD_KEYS` entirely (docs/ultimate-mods-removal.md). Unpinned
  // deliberately and as part of that retirement, not silently: a pin naming a key that no
  // longer exists is a scope pointing at nothing, and the "still dead" check below reads a
  // vanished key as "now live" and fails, which is exactly what it did here.
  //
  // Empty is the honest state — every key in the vocabulary has a live read. The check
  // below prints the count, so if it is ever empty for the *wrong* reason the output says
  // `0 pinned` rather than passing quietly.
};

function tsFilesUnder(dir: string): string[] {
  const abs = join(root, dir);
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith(".ts")) out.push(p);
    }
  };
  walk(abs);
  return out;
}

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("\nmod keys — every one must have a live read in the simulation\n");

const files = SIM_DIRS.flatMap(tsFilesUnder)
  .filter((f) => !NOT_A_READ.has(f.slice(root.length + 1).replaceAll("\\", "/")));
const source = files.map((f) => readFileSync(f, "utf8")).join("\n");

// Scope, printed. Both numbers are read off the thing under test, so an emptied sweep is
// visible in the output rather than inferred from a green line.
console.log(`  walked ${MOD_KEYS.length} mod keys against ${files.length} simulation files`
  + ` in ${SIM_DIRS.join(", ")}`);



/**
 * Indirect reads, and the one honest way to allow them.
 *
 * The sixteen elemental damage/resist keys are never named in the simulation — it reaches
 * them through `ELEMENT_DAMAGE_KEY[element]` / `ELEMENT_RESIST_KEY[element]`. Naming them
 * as exceptions would be a filter, and a filter is what lets a scope empty. Instead the
 * table is *followed*: its values count as read only while the table itself is indexed by
 * a simulation file. Delete every `ELEMENT_RESIST_KEY[...]` read tomorrow and all sixteen
 * go dead here, which is the behaviour a grant-only key must produce.
 */
// `ELEMENT_RESIST_KEY.physical` is null — physical has no resist stat — so nulls are
// dropped rather than counted as keys.
const INDIRECT: readonly (readonly [string, Record<string, string | null>])[] = [
  ["ELEMENT_DAMAGE_KEY", ELEMENT_DAMAGE_KEY],
  ["ELEMENT_RESIST_KEY", ELEMENT_RESIST_KEY],
];
const viaTable = new Set<string>();
for (const [name, table] of INDIRECT) {
  if (!new RegExp(`\\b${name}\\s*\\[`).test(source)) continue;
  for (const key of Object.values(table)) if (key) viaTable.add(key);
}

const dead: string[] = [];
for (const key of MOD_KEYS) {
  // Word-boundary match, so `defense` never matches inside `defensePercent`.
  if (new RegExp(`\\b${key}\\b`).test(source)) continue;
  if (viaTable.has(key)) continue;
  dead.push(key);
}

console.log(`  ${viaTable.size} of them are reached indirectly, through a followed element table\n`);

check("the sweep actually has a scope", MOD_KEYS.length > 30 && files.length > 5,
  `${MOD_KEYS.length} keys, ${files.length} files`);

// Not tautological: `viaTable` only gains a table's values while that table is actually
// indexed by a simulation file, so if one of the two stops being read, half the elemental
// keys drop out here and this goes red before the dead-key check even runs.
const everyIndirectKey = new Set(INDIRECT.flatMap(([, t]) => Object.values(t)).filter(Boolean));
check("both element tables are genuinely followed, not assumed",
  viaTable.size === everyIndirectKey.size,
  `${viaTable.size} of ${everyIndirectKey.size} table keys reachable`);

const unpinned = dead.filter((k) => !(k in PINNED_DEAD));
const pinnedButLive = Object.keys(PINNED_DEAD).filter((k) => !dead.includes(k));

check("no mod key is granted without a live read in src/combat or src/game",
  unpinned.length === 0,
  unpinned.length ? `dead: ${unpinned.join(", ")}` : `${MOD_KEYS.length - dead.length} of ${MOD_KEYS.length} keys read`);

check("every pinned dead key is still dead — a silent fix fails too",
  pinnedButLive.length === 0,
  pinnedButLive.length ? `now live, unpin it: ${pinnedButLive.join(", ")}` : `${Object.keys(PINNED_DEAD).length} pinned`);

check("wardPower is gone from the vocabulary entirely",
  !(MOD_KEYS as readonly string[]).includes("wardPower"));

for (const [key, why] of Object.entries(PINNED_DEAD)) {
  console.log(`        pinned dead: ${key} — ${why}`);
}

console.log(`\n${failures === 0 ? "ALL MOD KEY CHECKS PASSED" : `${failures} MOD KEY CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
