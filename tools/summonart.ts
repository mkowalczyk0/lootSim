/**
 * Docket §36's renderer seam: every summon unit that exists in the game has a place in
 * the art ladder — either it's a player-copy unit (draws the summoning hero's own
 * composed sprite, never authored art) or it has a row in `SUMMON_UNIT_ART`, even if that
 * row is still `null` pending a PNG.
 *
 * Scoped from `src/data/summons.ts`'s `SUMMON_UNITS`, which is itself walked from every
 * source a `{ kind: "summon" }` step can come from (class abilities, tree-node mutations,
 * hybrid/archetype unlocks, relics, named items) rather than typed by hand here — the
 * same CLAUDE.md rule every scope-derivation entry in `docs/blind-instruments.md` names:
 * a check's scope has to come from somewhere other than the thing under test. Printing the
 * walked count is what makes a scope that quietly shrinks (or grows) visible in the
 * output instead of passing as a filter over a smaller table.
 *
 * It also checks the art half, because `npm run smoke`'s "nothing in ATLAS without a PNG"
 * walk is scoped to `MONSTER_SETS` and `STATION_PROP` and never sees a `summon.*` row:
 * every unit that points at an id must point at a manifest row (already a compile error
 * otherwise — `SummonArtId`) whose PNG is on disk at the size the row declares, and every
 * `summon.*` row must be claimed by exactly one unit. Counts are printed so a table that
 * silently drifts back to all-`null` is visible in the output.
 *
 * Headless, no browser. Run with `npm run summonart`.
 */

import { existsSync, readFileSync } from "node:fs";
import { decodePng } from "./png";
import { SUMMON_UNITS, summonUnitSources } from "../src/data/summons";
import { PLAYER_COPY_UNITS } from "../src/render/minionart";
import { ATLAS, SUMMON_UNIT_ART } from "../src/render/atlas/manifest";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

console.log(`=== docket §36 — every summon unit has a place in the art ladder ===`);
console.log(`\n  walked ${SUMMON_UNITS.length} summon units`);

// The co-op wire sends a minion's unit as an index into this exact array (`net/sync.ts`),
// on the argument that both ends run the same build and so derive the identical table.
// That argument is stronger if the table is sorted rather than merely "whatever order the
// walk happened to visit units in" — a stable, order-independent sort means the wire index
// agrees even if a future refactor changes which file gets walked first.
check("SUMMON_UNITS is sorted — the wire index doesn't depend on walk order",
  JSON.stringify(SUMMON_UNITS) === JSON.stringify([...SUMMON_UNITS].sort()));

for (const unit of SUMMON_UNITS) {
  const sources = summonUnitSources(unit).join(", ");
  if (PLAYER_COPY_UNITS.has(unit)) {
    check(`${unit}: player-copy — draws the summoning hero, no art row needed`, true, sources);
    continue;
  }
  check(`${unit}: has a SUMMON_UNIT_ART row`, unit in SUMMON_UNIT_ART, sources);
}

// The two tables can drift in either direction: a unit removed from every ability/relic/
// named-item table but left behind as a stale manifest row, or (checked above) a unit
// added somewhere that never got a row at all.
for (const unit of Object.keys(SUMMON_UNIT_ART)) {
  check(`SUMMON_UNIT_ART["${unit}"]: still a real summon unit`, SUMMON_UNITS.includes(unit));
}

// A player-copy unit is a declared exemption from the art ladder, not a unit that no
// longer exists — if the ability granting it were ever removed, the exemption list
// should be trimmed in the same change, not left describing a unit nothing spawns.
for (const unit of PLAYER_COPY_UNITS) {
  check(`PLAYER_COPY_UNITS has "${unit}": still a real summon unit`, SUMMON_UNITS.includes(unit));
}

// --- the art half -------------------------------------------------------------------------

console.log("");
const drawn: [string, string][] = [];
for (const [unit, id] of Object.entries(SUMMON_UNIT_ART)) if (id !== null) drawn.push([unit, id]);
const onTriangle = Object.entries(SUMMON_UNIT_ART).filter((e) => e[1] === null).map((e) => e[0]);
console.log(`  ${drawn.length} unit(s) point at authored art, ${onTriangle.length} still on the triangle`
  + (onTriangle.length ? ` (${onTriangle.join(", ")})` : ""));

for (const [unit, id] of drawn) {
  const meta = ATLAS[id];
  check(`${unit} -> ${id}: has an ATLAS row`, !!meta);
  if (!meta) continue;
  const path = `src/render/atlas/summons/${id}.png`;
  if (!existsSync(path)) { check(`${unit} -> ${id}: PNG committed at ${path}`, false); continue; }
  const png = decodePng(readFileSync(path));
  check(`${unit} -> ${id}: PNG is ${meta.w}x${meta.h}, as the manifest says`,
    png.width === meta.w && png.height === meta.h, `${png.width}x${png.height} on disk`);
}

// The reverse direction: a summon.* row nobody points at is art the game can never draw.
const claims = new Map<string, string[]>();
for (const [unit, id] of drawn) claims.set(id, [...(claims.get(id) ?? []), unit]);
const summonRows = Object.keys(ATLAS).filter((id) => id.startsWith("summon."));
console.log(`  ${summonRows.length} summon.* row(s) in ATLAS`);
for (const id of summonRows) {
  const by = claims.get(id) ?? [];
  check(`ATLAS "${id}": claimed by exactly one unit`, by.length === 1, by.length ? by.join(", ") : "unclaimed");
}

if (failures === 0) {
  console.log("\nsummon art ladder: all checks passed");
} else {
  console.log(`\nsummon art ladder: ${failures} failure(s)`);
  process.exit(1);
}
