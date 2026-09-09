/**
 * Challenger completion badges — acceptance test.
 *
 * The owner's ask, and the rework that followed a design review that missed it: a trophy
 * per activity, per class, showing the highest Challenger tier that class has actually
 * banked a clear at. The first shipment (SAVE_VERSION 26) keyed every activity by
 * `RunModeId` alone — one number, "highest tier ever cleared." The owner rejected that on
 * sight for the Delve and the Tower:
 *
 *   "Those Challenger completion badges should be on EACH depth, not the parent activity.
 *    Because I could clear Death March X Training Grounds and get the badge."
 *
 * The Delve and the Tower have no upper bound, so a single number can only ever record the
 * *cheapest* depth a tier was cleared at — Death March X on depth 1 lit the same badge as
 * Death March X on depth 30. SAVE_VERSION 28 replaces that pair with a per-tier depth (or
 * height) shelf (`Player.delveChallengerBadges` / `.towerChallengerBadges`): twenty slots,
 * index `tier - 1`, each holding the deepest depth/height ever banked at exactly that tier.
 * Every *fixed-length* activity — a rift, a sector, a raid, the Vigil, the Convergence, a
 * Memory — keeps the original single-number shape, because the tier itself sets the
 * difficulty there and there's no cheap end of a depth range to hide behind.
 *
 * The checks here are the shape both asks imply:
 *
 *   1. **Fresh and per-class.** A new character starts with every badge unearned — every
 *      fixed-activity number at 0 and every Delve/Tower tier slot at 0 — and two classes'
 *      badges never share storage.
 *   2. **Only a banked clear counts, and only at the tier and depth it was actually
 *      cleared at.** `GameState.recordDepth` is the one hook every activity's completion
 *      already goes through (see CLAUDE.md's Proving section for why that hook is
 *      trustworthy: it is only ever reached from a credited `bank(true)`), so a badge
 *      banks exactly where the record it sits beside already banks — never on a mid-rift
 *      floor, never on an early extraction, never on a death.
 *   3. **A badge never goes backward** — a fixed activity's number never drops, and
 *      neither does any one Delve/Tower tier slot, considered independently of every
 *      other slot.
 *   4. **Every activity is covered, keyed the way its own progress record already is** —
 *      fixed modes by `FixedChallengerModeId` (`riftTiers`'s shape minus delve/tower),
 *      the Delve/Tower by per-tier arrays, planets and raids by their own id
 *      (`planetProgress`/`raidProgress`'s shape).
 *   5. **Powerless.** Nothing about a character's `mods` moves when a badge is banked —
 *      the same property `npm run relics` already asserts for a worn relic against a
 *      worn cosmetic.
 *   6. **Save and wire.** A badge survives `GameState.toJSON` → save → load, crosses the
 *      co-op wire (`playerToJSON`/`playerFromJSON`, the same blob), and a pre-v26 save
 *      (missing every field entirely) loads with every badge unearned rather than
 *      crashing — as does a v26/v27 save, whose `delve`/`tower` entries inside the old
 *      `challengerBadges` map are honestly dropped (never guessed into a depth) rather
 *      than migrated.
 *
 * Headless, no browser. Run with `npm run badges`.
 */

import { parseSaved, serializeSave } from "../src/core/save";
import {
  dailyConfig, dayNumber,
} from "../src/data/daily";
import { delveConfig, MODES, riftConfig, type RunModeId } from "../src/data/modes";
import { PLANETS, planetConfig } from "../src/data/planets";
import { RAIDS, raidConfig } from "../src/data/raids";
import { towerConfig } from "../src/data/tower";
import { rollMemory, memoryConfig, MEMORY_FLOORS } from "../src/data/memories";
import { weeklyConfig, weekNumber } from "../src/data/weekly";
import { MAX_CHALLENGER_TIER } from "../src/data/challenger";
import { Rng } from "../src/core/rng";
import { Dungeon } from "../src/game/dungeon";
import { GameState, playerFromJSON, playerToJSON } from "../src/game/state";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

function fresh(seed: number): GameState {
  const state = new GameState(seed);
  state.chooseClass("magician");
  return state;
}

const FIXED_MODES: readonly RunModeId[] =
  (Object.keys(MODES) as RunModeId[]).filter((m) => m !== "delve" && m !== "tower");

// =========================================================================
section("1. fresh, and per-class");
{
  const state = fresh(1);
  const p = state.player;
  check("every fixed activity starts unearned",
    FIXED_MODES.every((m) => p.challengerBadges[m as Exclude<RunModeId, "delve" | "tower">] === 0));
  check("the Delve's per-tier shelf starts empty",
    p.delveChallengerBadges.length === MAX_CHALLENGER_TIER && p.delveChallengerBadges.every((d) => d === 0));
  check("the Tower's per-tier shelf starts empty",
    p.towerChallengerBadges.length === MAX_CHALLENGER_TIER && p.towerChallengerBadges.every((d) => d === 0));
  check("planet and raid badge maps start empty",
    Object.keys(p.planetChallengerBadges).length === 0 && Object.keys(p.raidChallengerBadges).length === 0);

  state.player.bankChallengerBadge("abyss", 7);
  state.player.bankDelveChallengerBadge(4, 12);
  const other = state.players.berserker;
  check("a fixed badge on one class never touches another's", other.challengerBadges.abyss === 0);
  check("a Delve tier slot on one class never touches another's", other.delveChallengerBadges[3] === 0);
}

// =========================================================================
section("2. the delve — per-tier depth, keyed on the tier that was actually run");
{
  const state = fresh(2);
  state.recordDepth(5, delveConfig(5, 4));
  check("banking depth 5 at tier 4 sets that tier's slot to 5", state.player.delveChallengerBadges[3] === 5);
  state.recordDepth(20, delveConfig(20, 4));
  check("a deeper clear at the same tier raises that slot", state.player.delveChallengerBadges[3] === 20);
  state.recordDepth(6, delveConfig(6, 4));
  check("a shallower later clear at the same tier doesn't erase the deeper one",
    state.player.delveChallengerBadges[3] === 20);
  state.recordDepth(30, delveConfig(30, 2));
  check("clearing depth 30 at a *lower* tier plants that lower tier's own slot",
    state.player.delveChallengerBadges[1] === 30);
  check("...and never touches the higher tier's slot", state.player.delveChallengerBadges[3] === 20);
  check("the owner's exact failure case is gone: Death March X (tier 20) at a shallow depth "
    + "does not read the same as Death March X at depth 30",
    state.player.delveChallengerBadges[19] === 0);
  state.recordDepth(1, delveConfig(1, 20));
  check("Death March X on depth 1 now only lights the depth-1 slot",
    state.player.delveChallengerBadges[19] === 1 && state.player.delveChallengerBadges[19] < 30);

  const beforePlain = state.player.delveChallengerBadges.slice();
  state.recordDepth(99, delveConfig(99, 0));
  check("plain (tier 0) plants no slot at all",
    JSON.stringify(beforePlain) === JSON.stringify(state.player.delveChallengerBadges));
  check("plain (tier 0) never touched the tower's shelf either",
    state.player.towerChallengerBadges.every((h) => h === 0));
}

// =========================================================================
section("3. the tower — its own per-tier shelf, by height, never the delve's");
{
  const state = fresh(3);
  state.recordDepth(10, towerConfig(10, 6));
  check("climbing to height 10 at tier 6 banks that tier's height slot",
    state.player.towerChallengerBadges[5] === 10);
  check("...and never plants anything on the delve's shelf",
    state.player.delveChallengerBadges.every((d) => d === 0));
  state.recordDepth(4, towerConfig(4, 6));
  check("a lower climb at the same tier doesn't erase the higher one", state.player.towerChallengerBadges[5] === 10);
}

// =========================================================================
section("4. rifts — only the boss floor counts, keyed by mode, single number (fixed-length)");
{
  const state = fresh(4);
  const mode = MODES.abyss;
  for (let f = 1; f < mode.floors; f++) {
    state.recordDepth(riftConfig("abyss", 3, f, 8).depth, riftConfig("abyss", 3, f, 8));
  }
  check("a non-boss floor bank never plants the badge", state.player.challengerBadges.abyss === 0);
  state.recordDepth(riftConfig("abyss", 3, mode.floors, 8).depth, riftConfig("abyss", 3, mode.floors, 8));
  check("clearing the boss floor does", state.player.challengerBadges.abyss === 8);
  check("the other rift's badge is untouched", state.player.challengerBadges.hoard === 0);
}

// =========================================================================
section("5. the Reliquary — by planet id, only the boss floor, single number");
{
  const state = fresh(5);
  const planet = PLANETS[0]!;
  const other = PLANETS[1]!;
  for (let f = 1; f < planet.floors; f++) {
    const c = planetConfig(planet, 2, f, 5);
    state.recordDepth(c.depth, c);
  }
  check("a non-boss sector floor plants nothing",
    (state.player.planetChallengerBadges[planet.id] ?? 0) === 0);
  const last = planetConfig(planet, 2, planet.floors, 5);
  state.recordDepth(last.depth, last);
  check("clearing the sector's boss banks that sector's badge",
    state.player.planetChallengerBadges[planet.id] === 5);
  check("a different sector's badge is untouched", (state.player.planetChallengerBadges[other.id] ?? 0) === 0);
}

// =========================================================================
section("6. raids — one floor, and that floor is the boss, single number");
{
  const state = fresh(6);
  const spec = RAIDS[0]!;
  const other = RAIDS[1]!;
  const config = raidConfig(spec, 3, 11);
  state.recordDepth(config.depth, config);
  check("banking a raid's one floor banks its badge", state.player.raidChallengerBadges[spec.id] === 11);
  check("a different raid's badge is untouched", (state.player.raidChallengerBadges[other.id] ?? 0) === 0);
}

// =========================================================================
section("7. a Memory — only the encounter floor, single number");
{
  const state = fresh(7);
  const memory = rollMemory("rare", 30, new Rng(70), "test-memory");
  for (let f = 1; f < MEMORY_FLOORS; f++) {
    const c = memoryConfig(memory, f, 6);
    state.recordDepth(c.depth, c);
  }
  check("an early Memory floor plants nothing", state.player.challengerBadges.memory === 0);
  const last = memoryConfig(memory, MEMORY_FLOORS, 6);
  state.recordDepth(last.depth, last);
  check("clearing the encounter banks the Memory badge", state.player.challengerBadges.memory === 6);
}

// =========================================================================
section("8. the Vigil and the Convergence — single vs. multi-floor closing, single number");
{
  const state = fresh(8);
  const day = dayNumber();
  const dc = dailyConfig(day, 3);
  state.recordDepth(dc.depth, dc);
  check("keeping the Vigil (one floor) banks its badge immediately", state.player.challengerBadges.vigil === 3);

  const week = weekNumber();
  for (let f = 1; f < MODES.convergence.floors; f++) {
    const c = weeklyConfig(week, f, 5);
    state.recordDepth(c.depth, c);
  }
  check("an early Convergence floor plants nothing", state.player.challengerBadges.convergence === 0);
  const boss = weeklyConfig(week, MODES.convergence.floors, 5);
  state.recordDepth(boss.depth, boss);
  check("the boss floor (and only it) banks the Convergence badge", state.player.challengerBadges.convergence === 5);
}

// =========================================================================
section("9. credited only — a real dive, a bail-out, and the badge either lands or doesn't");
{
  const state = fresh(9);
  state.player.level = 30;
  state.player.refresh();
  const config = riftConfig("abyss", 1, MODES.abyss.floors, 4);
  const d = new Dungeon(state, config, 909);
  d.bankLoot();
  check("a credited bank (the completion portal) plants the badge", state.player.challengerBadges.abyss === 4);

  const bailState = fresh(10);
  bailState.player.level = 30;
  bailState.player.refresh();
  const bailConfig = riftConfig("abyss", 1, MODES.abyss.floors, 7);
  const bail = new Dungeon(bailState, bailConfig, 910);
  bail.earlyExtractLoot();
  check("bailing out through the entrance plants nothing", bailState.player.challengerBadges.abyss === 0);

  const delveState = fresh(13);
  delveState.player.level = 30;
  delveState.player.refresh();
  const delveConfigCredited = delveConfig(9, 5);
  const dd = new Dungeon(delveState, delveConfigCredited, 911);
  dd.bankLoot();
  check("a credited Delve bank plants that tier's depth slot", delveState.player.delveChallengerBadges[4] === 9);

  const delveBailState = fresh(14);
  delveBailState.player.level = 30;
  delveBailState.player.refresh();
  const delveBail = new Dungeon(delveBailState, delveConfig(9, 5), 912);
  delveBail.earlyExtractLoot();
  check("bailing out of the Delve plants nothing on the per-tier shelf",
    delveBailState.player.delveChallengerBadges.every((depth) => depth === 0));
}

// =========================================================================
section("10. powerless — banking a badge never moves the character sheet");
{
  const state = fresh(11);
  state.player.level = 20;
  state.player.refresh();
  const before = JSON.stringify(state.player.mods);
  state.player.bankChallengerBadge("abyss", 20);
  state.player.bankDelveChallengerBadge(20, 30);
  state.player.bankTowerChallengerBadge(20, 30);
  state.player.bankPlanetChallengerBadge(PLANETS[0]!.id, 20);
  state.player.bankRaidChallengerBadge(RAIDS[0]!.id, 20);
  state.player.refresh();
  check("no badge touches a single number on the sheet", JSON.stringify(state.player.mods) === before);
}

// =========================================================================
section("11. save, wire, a pre-v26 save, and a v26/v27 save's dropped delve/tower entries");
{
  const state = fresh(12);
  state.player.bankChallengerBadge("abyss", 6);
  state.player.bankDelveChallengerBadge(9, 24);
  state.player.bankTowerChallengerBadge(3, 11);
  state.player.bankPlanetChallengerBadge(PLANETS[0]!.id, 4);
  state.player.bankRaidChallengerBadge(RAIDS[0]!.id, 9);

  const back = GameState.fromSaved(parseSaved(serializeSave(state.toJSON())));
  check("the fixed badges survive a save round-trip",
    JSON.stringify(back.players.magician.challengerBadges) === JSON.stringify(state.players.magician.challengerBadges));
  check("the delve per-tier shelf survives it too",
    JSON.stringify(back.players.magician.delveChallengerBadges)
      === JSON.stringify(state.players.magician.delveChallengerBadges));
  check("the tower per-tier shelf survives it too",
    JSON.stringify(back.players.magician.towerChallengerBadges)
      === JSON.stringify(state.players.magician.towerChallengerBadges));
  check("the planet badges survive it too",
    JSON.stringify(back.players.magician.planetChallengerBadges) === JSON.stringify(state.players.magician.planetChallengerBadges));
  check("the raid badges survive it too",
    JSON.stringify(back.players.magician.raidChallengerBadges) === JSON.stringify(state.players.magician.raidChallengerBadges));

  const remote = playerFromJSON("magician", JSON.parse(JSON.stringify(playerToJSON(state.player))));
  check("fixed badges cross the co-op wire", remote.challengerBadges.abyss === 6);
  check("...the delve/tower per-tier shelves too",
    remote.delveChallengerBadges[8] === 24 && remote.towerChallengerBadges[2] === 11);
  check("...planet and raid badges too",
    remote.planetChallengerBadges[PLANETS[0]!.id] === 4 && remote.raidChallengerBadges[RAIDS[0]!.id] === 9);

  // Pre-v26 saves have none of this.
  const old = state.toJSON() as { players: Record<string, Record<string, unknown>> };
  delete old.players.magician.challengerBadges;
  delete old.players.magician.delveChallengerBadges;
  delete old.players.magician.towerChallengerBadges;
  delete old.players.magician.planetChallengerBadges;
  delete old.players.magician.raidChallengerBadges;
  const migrated = GameState.fromSaved(parseSaved(serializeSave(old)));
  check("a save from before badges loads with every one unearned",
    Object.values(migrated.players.magician.challengerBadges).every((t) => t === 0)
    && migrated.players.magician.delveChallengerBadges.every((d) => d === 0)
    && migrated.players.magician.towerChallengerBadges.every((d) => d === 0)
    && Object.keys(migrated.players.magician.planetChallengerBadges).length === 0
    && Object.keys(migrated.players.magician.raidChallengerBadges).length === 0);

  // A v26/v27 save still carries the old single-number `delve`/`tower` entries inside
  // `challengerBadges` — the shape this rework replaced. They must be dropped, not
  // guessed into a depth: there is no honest depth to attribute a bare "tier 6" to.
  const preRework = state.toJSON() as { players: Record<string, Record<string, unknown>> };
  delete preRework.players.magician.delveChallengerBadges;
  delete preRework.players.magician.towerChallengerBadges;
  (preRework.players.magician.challengerBadges as Record<string, number>).delve = 6;
  (preRework.players.magician.challengerBadges as Record<string, number>).tower = 3;
  const preReworkMigrated = GameState.fromSaved(parseSaved(serializeSave(preRework)));
  check("a v26/v27 save's old delve/tower single-number credit is dropped, not migrated into a depth",
    preReworkMigrated.players.magician.delveChallengerBadges.every((d) => d === 0)
    && preReworkMigrated.players.magician.towerChallengerBadges.every((d) => d === 0));
  check("...and it doesn't leak a stray delve/tower key onto the new fixed-activity map",
    !("delve" in preReworkMigrated.players.magician.challengerBadges)
    && !("tower" in preReworkMigrated.players.magician.challengerBadges));
  check("...while a real fixed-activity badge earned earlier this section (abyss, tier 6) migrates untouched",
    preReworkMigrated.players.magician.challengerBadges.abyss === 6);
}

console.log(`\n${failures === 0 ? "ALL BADGE CHECKS PASSED" : `${failures} BADGE CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
