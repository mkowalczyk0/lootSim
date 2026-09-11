/**
 * The retired-affix gate: a mod key may be removed from the game, but an item already in
 * somebody's stash may not quietly get smaller because of it.
 *
 * `ItemMod` persists the rolled `key`, and `normalizeItem` drops any mod whose key is not
 * in `MOD_KEYS`. So retiring a key naively deletes the affix off every saved copy — no
 * crash, no warning, just gear that is worth less than it was yesterday. `wardPower`'s
 * removal (`docs/wardpower-removal.md`) established the fix: a version-agnostic
 * `RETIRED_MOD_KEYS` rewrite that runs *ahead* of that filter. This gate holds the next
 * retirement to the same standard, by round-tripping a real save through the real loader
 * rather than reasoning about it.
 *
 * **Why it round-trips instead of reading the code.** The claim under test was originally
 * asserted from inspection — `decorate` bakes an item's name at roll time, therefore
 * deleting an affix row cannot orphan a saved item's name. That is a plausible reading of
 * two functions, and plausible readings are exactly what `docs/wardpower-removal.md`
 * records going wrong: the obvious answer about the save was wrong there, which is the
 * whole reason that branch's save work mattered. So this constructs a save carrying each
 * retired key, pushes it through `GameState.fromSaved`, and looks at what comes out.
 *
 * `npm run modkeys` — the broader "no mod key without a live simulation read" rule — came
 * in from `fix/wardpower-riptout` and now sits beside this one. They are complementary and
 * neither reimplements the other: `modkeys` asks whether a key that exists is read,
 * this asks what happens to a key that has stopped existing.
 */
import { readFileSync, readdirSync } from "node:fs";
import { GameState } from "../src/game/state";
import { RETIRED_MOD_KEYS } from "../src/data/items";
import { MOD_KEYS } from "../src/data/mods";
import { rarityIndex } from "../src/data/rarity";
import type { Item } from "../src/game/item";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string): void {
  console.log(`\n=== ${name} ===`);
}

const RETIRED = Object.keys(RETIRED_MOD_KEYS);

// --- 1. the keys are actually gone --------------------------------------------------------
//
// The subject is the live `MOD_KEYS` export, not a list restated here, so a key that comes
// back tomorrow is caught without anyone remembering to update this file.

section("the retired keys are gone from the game");

check("this gate has something to walk (the retirement table is not empty)",
  RETIRED.length > 0, `${RETIRED.length} retired key(s): ${RETIRED.join(", ")}`);

for (const key of RETIRED) {
  check(`${key} is no longer a live ModKey`,
    !(MOD_KEYS as readonly string[]).includes(key));
}

// A retirement that points at a key which is itself dead would rewrite one corpse onto
// another and still lose the affix at the filter.
for (const [key, r] of Object.entries(RETIRED_MOD_KEYS)) {
  check(`${key} rewrites onto a live key (${r.to})`,
    (MOD_KEYS as readonly string[]).includes(r.to));
}

// Source-level sweep: the only mentions left in src/ should be the retirement table and
// the tombstone comment that explains it. A stray grant anywhere else would typecheck
// (the key is a plain string in some authoring positions) and do nothing.
section("no authoring site still grants a retired key");

{
  const files = execFileList();
  const offenders: string[] = [];
  for (const f of files) {
    if (f === "src/data/items.ts") continue; // the retirement table itself
    // Comments are stripped first: the tombstone notes explaining a retirement name the
    // retired key on purpose, and a sweep that cannot tell prose from code would force
    // them to be deleted — punishing exactly the documentation this change depends on.
    const body = readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    for (const key of RETIRED) if (body.includes(key)) offenders.push(`${f}:${key}`);
  }
  check("no file outside the retirement table mentions a retired key",
    offenders.length === 0,
    offenders.length ? offenders.join(", ") : `swept ${files.length} source files`);
}

// --- 2. the round trip, through the real loader -------------------------------------------

section("a saved item carrying a retired key survives the load");

/** A stash item exactly as a save would hold it: a baked name, and one retired affix. */
function savedItemWith(key: string, storedValue: number): Item {
  return {
    id: `test-${key}`,
    name: "Gilded Blade of the Manifold",
    type: "sword",
    slot: "weapon",
    family: "sword",
    rarity: "legendary",
    ilvl: 40,
    stats: { attack: 10, defense: 0, maxHealth: 0, power: 0, haste: 0, maxMana: 0 },
    mods: [{ id: "retired-under-test", key, value: storedValue }],
    grant: null,
    trigger: null,
    named: null,
  } as unknown as Item;
}

for (const [key, r] of Object.entries(RETIRED_MOD_KEYS)) {
  // A flat count, the shape both retired keys actually stored. If this survived as a
  // magnitude it would read as +200% on a percentage key, which is the bug the value map
  // exists to prevent.
  const stored = 2;
  const before = savedItemWith(key, stored);
  const state = GameState.fromSaved({ version: 35, data: { inventory: [before] } } as never);
  const after = state.inventory[0];

  check(`${key}: the item still exists after load`, !!after, after ? "" : "item dropped entirely");
  if (!after) continue;

  check(`${key}: the item keeps its baked name (deleting the affix row orphans nothing)`,
    after.name === before.name, `"${after.name}"`);

  check(`${key}: the affix count is unchanged — nothing silently vanished`,
    after.mods.length === before.mods.length,
    `${before.mods.length} -> ${after.mods.length}`);

  const mod = after.mods[0];
  check(`${key}: the affix now carries the live replacement key`,
    !!mod && mod.key === r.to, mod ? `${mod.key}` : "no mod");

  // The two retirement kinds want *opposite* things from the magnitude, so each is
  // asserted against the one the table declares rather than against a single house rule.
  // Asserting only one of them is how this gate would let the other kind's defect through.
  if (r.kind === "rename") {
    // A rename exists precisely because the live key means the same thing in the same
    // units. Deriving a new number here would throw away what the player rolled — the
    // defect `docs/wardpower-removal.md` was written to prevent, wearing a fix's clothes.
    check(`${key}: the rolled magnitude is carried across untouched (it is a rename)`,
      !!mod && mod.value === stored, `stored ${stored} -> ${mod?.value}`);
  } else {
    // The magnitude must come from the peer row, not from the stored flat count. This is
    // the assertion that would have caught carrying `2` across as +200%.
    const expected = r.value(rarityIndex("legendary"));
    check(`${key}: the magnitude is recomputed from the peer row, not inherited`,
      !!mod && Math.abs(mod.value - expected) < 1e-9,
      `stored ${stored} -> ${mod?.value} (peer-derived ${expected})`);
    check(`${key}: and the stored flat count did not survive as a percentage`,
      !!mod && mod.value !== stored, `${mod?.value} vs stored ${stored}`);
  }
}

// --- 3. falsification --------------------------------------------------------------------
//
// The round trip above only proves anything if the filter it is defending against is real.
// Push a key that is genuinely unknown through the same path: it must be dropped, which is
// precisely the fate a retired key would meet without the rewrite.

section("the filter this gate defends against is real");

{
  const before = savedItemWith("notAModKeyAtAll", 3);
  const state = GameState.fromSaved({ version: 35, data: { inventory: [before] } } as never);
  const after = state.inventory[0];
  check("an unknown mod key is still dropped on load (so the rewrite is load-bearing)",
    !!after && after.mods.length === 0,
    after ? `${after.mods.length} mod(s) survived` : "item missing");
}

function execFileList(): string[] {
  // Walk src/ without shelling out, so this works the same in any checkout.
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts")) out.push(p);
    }
  };
  walk("src");
  return out;
}

// Printed per kind, not just as a total. Each kind has its own assertion above, so a
// table that has silently collapsed to one of them would still run green while proving
// nothing about the other — the scope-that-empties family this repo keeps being bitten by.
// The number in the output is what makes that visible.
const byKind = Object.values(RETIRED_MOD_KEYS).reduce<Record<string, number>>(
  (acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {});
console.log(`\n  walked ${RETIRED.length} retired key(s) through the real loader`
  + ` — ${Object.entries(byKind).map(([k, n]) => `${n} ${k}`).join(", ")}`);

if (failures) {
  console.log(`\nretired-mods gate: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nretired-mods gate: all checks passed");
