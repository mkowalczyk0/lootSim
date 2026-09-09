/**
 * Challenger completion badges — acceptance test.
 *
 * The owner's ask: a trophy per activity, per class, showing the highest Challenger tier
 * that class has actually banked a clear at. The checks here are the shape that ask
 * implies:
 *
 *   1. **Fresh and per-class.** A new character starts with every badge unearned, and two
 *      classes' badges never share storage.
 *   2. **Only a banked clear counts, and only at the tier it was actually cleared at.**
 *      `GameState.recordDepth` is the one hook every activity's completion already goes
 *      through (see CLAUDE.md's Proving section for why that hook is trustworthy: it is
 *      only ever reached from a credited `bank(true)`), so a badge banks exactly where
 *      the record it sits beside already banks — never on a mid-rift floor, never on an
 *      early extraction, never on a death.
 *   3. **A badge never goes backward.** Clearing at a lower tier after a higher one
 *      already banked leaves the higher tier standing.
 *   4. **Every activity is covered, keyed the way its own progress record already is** —
 *      fixed modes by `RunModeId` (`riftTiers`'s shape), planets and raids by their own
 *      id (`planetProgress`/`raidProgress`'s shape).
 *   5. **Powerless.** Nothing about a character's `mods` moves when a badge is banked —
 *      the same property `npm run relics` already asserts for a worn relic against a
 *      worn cosmetic.
 *   6. **Save and wire.** A badge survives `GameState.toJSON` → save → load, crosses the
 *      co-op wire (`playerToJSON`/`playerFromJSON`, the same blob), and a pre-v26 save
 *      (missing the three fields entirely) loads with every badge unearned rather than
 *      crashing.
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

// =========================================================================
section("1. fresh, and per-class");
{
  const state = fresh(1);
  const p = state.player;
  check("every fixed activity starts unearned",
    (Object.keys(MODES) as RunModeId[]).every((m) => p.challengerBadges[m] === 0));
  check("planet and raid badge maps start empty",
    Object.keys(p.planetChallengerBadges).length === 0 && Object.keys(p.raidChallengerBadges).length === 0);

  state.player.bankChallengerBadge("delve", 7);
  const other = state.players.berserker;
  check("a badge on one class never touches another's", other.challengerBadges.delve === 0);
}

// =========================================================================
section("2. the delve — every floor is a chance, and it never goes backward");
{
  const state = fresh(2);
  state.recordDepth(5, delveConfig(5, 4));
  check("banking at tier 4 sets the delve badge to 4", state.player.challengerBadges.delve === 4);
  state.recordDepth(6, delveConfig(6, 2));
  check("a later clear at a lower tier doesn't erase the higher one", state.player.challengerBadges.delve === 4);
  state.recordDepth(7, delveConfig(7, 9));
  check("a higher tier raises it", state.player.challengerBadges.delve === 9);
  check("plain (tier 0) never touched any other badge", state.player.challengerBadges.tower === 0);
}

// =========================================================================
section("3. the tower — its own badge, never the delve's");
{
  const state = fresh(3);
  state.recordDepth(10, towerConfig(10, 6));
  check("climbing banks the tower badge", state.player.challengerBadges.tower === 6);
  check("...and never the delve's", state.player.challengerBadges.delve === 0);
}

// =========================================================================
section("4. rifts — only the boss floor counts, keyed by mode");
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
section("5. the Reliquary — by planet id, only the boss floor");
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
section("6. raids — one floor, and that floor is the boss");
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
section("7. a Memory — only the encounter floor");
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
section("8. the Vigil and the Convergence — single vs. multi-floor closing");
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
}

// =========================================================================
section("10. powerless — banking a badge never moves the character sheet");
{
  const state = fresh(11);
  state.player.level = 20;
  state.player.refresh();
  const before = JSON.stringify(state.player.mods);
  state.player.bankChallengerBadge("delve", 20);
  state.player.bankPlanetChallengerBadge(PLANETS[0]!.id, 20);
  state.player.bankRaidChallengerBadge(RAIDS[0]!.id, 20);
  state.player.refresh();
  check("no badge touches a single number on the sheet", JSON.stringify(state.player.mods) === before);
}

// =========================================================================
section("11. save, wire, and a pre-v26 save");
{
  const state = fresh(12);
  state.player.bankChallengerBadge("delve", 6);
  state.player.bankChallengerBadge("tower", 3);
  state.player.bankPlanetChallengerBadge(PLANETS[0]!.id, 4);
  state.player.bankRaidChallengerBadge(RAIDS[0]!.id, 9);

  const back = GameState.fromSaved(parseSaved(serializeSave(state.toJSON())));
  check("the fixed badges survive a save round-trip",
    JSON.stringify(back.players.magician.challengerBadges) === JSON.stringify(state.players.magician.challengerBadges));
  check("the planet badges survive it too",
    JSON.stringify(back.players.magician.planetChallengerBadges) === JSON.stringify(state.players.magician.planetChallengerBadges));
  check("the raid badges survive it too",
    JSON.stringify(back.players.magician.raidChallengerBadges) === JSON.stringify(state.players.magician.raidChallengerBadges));

  const remote = playerFromJSON("magician", JSON.parse(JSON.stringify(playerToJSON(state.player))));
  check("badges cross the co-op wire", remote.challengerBadges.delve === 6 && remote.challengerBadges.tower === 3);
  check("...planet and raid badges too",
    remote.planetChallengerBadges[PLANETS[0]!.id] === 4 && remote.raidChallengerBadges[RAIDS[0]!.id] === 9);

  // Pre-v26 saves have none of this.
  const old = state.toJSON() as { players: Record<string, Record<string, unknown>> };
  delete old.players.magician.challengerBadges;
  delete old.players.magician.planetChallengerBadges;
  delete old.players.magician.raidChallengerBadges;
  const migrated = GameState.fromSaved(parseSaved(serializeSave(old)));
  check("a save from before badges loads with every one unearned",
    Object.values(migrated.players.magician.challengerBadges).every((t) => t === 0)
    && Object.keys(migrated.players.magician.planetChallengerBadges).length === 0
    && Object.keys(migrated.players.magician.raidChallengerBadges).length === 0);
}

console.log(`\n${failures === 0 ? "ALL BADGE CHECKS PASSED" : `${failures} BADGE CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
