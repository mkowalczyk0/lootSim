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
 * This does **not** check that an authored PNG actually loads — that's `npm run smoke`'s
 * job already, via the same atlas-row-implies-a-real-PNG rule the Tower tilesets follow.
 * This only checks that a unit is *known* to the ladder at all.
 *
 * Headless, no browser. Run with `npm run summonart`.
 */

import { SUMMON_UNITS, summonUnitSources } from "../src/data/summons";
import { PLAYER_COPY_UNITS } from "../src/render/minionart";
import { SUMMON_UNIT_ART } from "../src/render/atlas/manifest";

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

if (failures === 0) {
  console.log("\nsummon art ladder: all checks passed");
} else {
  console.log(`\nsummon art ladder: ${failures} failure(s)`);
  process.exit(1);
}
