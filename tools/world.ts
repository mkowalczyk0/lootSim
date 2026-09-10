/**
 * World structure acceptance test — UAT §23 (and the seam §21 will hang from).
 *
 * §23 asks for the world to read as **layers** rather than disconnected content tiers, and
 * for descending and ascending to be two halves of one war. That is a claim about
 * structure, so the checks here are structural rather than "the screen said something
 * plausible":
 *
 *   1. **The bands tile the ladder.** Every depth on both axes lands in exactly one layer,
 *      with no gap and no overlap, and each ladder runs from 1 to infinity. A ladder with
 *      a hole in it is a floor with no answer to "where am I".
 *   2. **Every run has a layer.** `layerFor` is walked across all of `RUN_MODES`, so a mode
 *      added later cannot quietly inherit a default — it has to say where in the world it
 *      happens.
 *   3. **The bands sit on the boundaries the game already had.** A layer edge must be a
 *      depth where `biomeFor` changes too. That is what makes this a *reading* of the
 *      existing ladder rather than a second, competing one.
 *   4. **A layer line says something a mode line doesn't.** The §22 bar, applied to the new
 *      prose: name the war, not the payout; never restate the mode's own sentence; no key
 *      names.
 *   5. **The reserved §15 seam stays empty.** `raidId` must be null everywhere until a raid
 *      table exists for it to resolve against — the same rule `relicProblems` applies to
 *      the reserved `raid`/`tower` drop kinds.
 *   6. **The Reliquary widening only ever widens.** The frontier route may add access and
 *      may never remove it, so no existing save can lose a sector it already had.
 *   7. **Every element has a sector.** A material with no sector paying it out is a live
 *      dead end (the Sept 2026 holy/arcane/nature bug this file now pins against).
 *
 * Headless, no browser. Run with `npm run world`.
 */

import { BIOMES as DELVE_BIOMES, biomeFor } from "../src/data/biomes";
import {
  DOWN_LAYERS, LAYERS, RIFT_LAYERS, UP_LAYERS, layerAt, layerFor, type WorldLayer,
} from "../src/data/layers";
import { MODES, RUN_MODES, delveConfig, modeUnlocked, riftConfig, type RunConfig, type RunModeId } from "../src/data/modes";
import { PLANETS, planetConfig, planetUnlocked, nextFloorConfig } from "../src/data/planets";
import { DELVE_BOTTOM } from "../src/data/legends";
import { dailyConfig, dayNumber } from "../src/data/daily";
import { weekNumber, weeklyConfig } from "../src/data/weekly";
import { biomeForRun, profileFor } from "../src/data/depth";
import { GameState } from "../src/game/state";
import { universalPointsFor } from "../src/progression/universal";
import { provingFloor } from "../src/data/legends";
import { TOWER_BIOMES, towerBiomeFor, towerBossSpec, towerConfig } from "../src/data/tower";
import { bossSpecForRun } from "../src/data/encounters";
import { BOSSES } from "../src/data/bosses";
import { RAID_BY_ID } from "../src/data/raids";
import { rollMemory, memoryConfig } from "../src/data/memories";
import { Rng } from "../src/core/rng";
import { BIOMES } from "../src/data/biomes";
import { TRAPS, REGARD_HOLD, REGARD_WATCH, type TrapKind } from "../src/data/traps";
import { ELEMENTS, RESERVED_ELEMENTS } from "../src/data/elements";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

/** How deep the walks below go. Well past the authored world on either ladder. */
const FAR = 60;

// --- 1. the bands tile the ladder -----------------------------------------

console.log("\n=== every floor on both ladders is in exactly one layer ===");

for (const [axis, ladder] of [["down", DOWN_LAYERS], ["up", UP_LAYERS]] as const) {
  check(`${axis}: the ladder starts at depth 1`, ladder[0]!.from === 1,
    `first band starts at ${ladder[0]!.from}`);
  check(`${axis}: the ladder has no end`, ladder[ladder.length - 1]!.to === Infinity);

  let contiguous = true;
  for (let i = 1; i < ladder.length; i++) {
    if (ladder[i]!.from !== ladder[i - 1]!.to + 1) contiguous = false;
  }
  check(`${axis}: the bands are contiguous, no gap and no overlap`, contiguous,
    ladder.map((l) => `${l.from}-${l.to === Infinity ? "∞" : l.to}`).join(" "));

  let everyDepthOnce = true;
  for (let d = 1; d <= FAR; d++) {
    const hits = ladder.filter((l) => d >= l.from && d <= l.to);
    if (hits.length !== 1 || hits[0] !== layerAt(axis, d)) everyDepthOnce = false;
  }
  check(`${axis}: depths 1-${FAR} each land in exactly one band`, everyDepthOnce);

  check(`${axis}: every band is on the ${axis} axis`, ladder.every((l) => l.axis === axis));
}

// A depth below the ladder is not a crash and not a gap: it reads as the first band.
check("a depth below 1 reads as the top band",
  layerAt("down", 0) === DOWN_LAYERS[0] && layerAt("down", -5) === DOWN_LAYERS[0]);
check("a fractional depth reads as its floor",
  layerAt("down", 6.9) === layerAt("down", 6));

check("every layer id is unique",
  new Set(LAYERS.map((l) => l.id)).size === LAYERS.length);
check("every layer name is unique",
  new Set(LAYERS.map((l) => l.name)).size === LAYERS.length);

// --- 2. every run has a layer ---------------------------------------------

console.log("\n=== every run mode says where in the war it happens ===");

const today = dayNumber();
const thisWeek = weekNumber();
for (const id of RUN_MODES) {
  const config = id === "delve"
    ? delveConfig(7)
    : id === "tower"
      ? towerConfig(7)
      : id === "vigil"
      ? dailyConfig(today)
      : id === "convergence"
        ? weeklyConfig(thisWeek, 1)
        : id === "planet"
          ? planetConfig(PLANETS[0]!, 1, 1)
          : riftConfig(id, 1, 1);
  const layer = layerFor(config);
  check(`${MODES[id].name} has a layer`, !!layer && LAYERS.includes(layer),
    layer ? `${layer.name} (${layer.realm})` : "none");
}

check("the Abyssal Rift is in the Abyss, not in Hell",
  layerFor(riftConfig("abyss", 1, 1)) === RIFT_LAYERS.abyss
  && RIFT_LAYERS.abyss.realm === "abyss");
check("the Avarice Rift is a piece of Hell's fourth circle",
  layerFor(riftConfig("hoard", 1, 1)) === RIFT_LAYERS.avarice
  && RIFT_LAYERS.avarice.realm === "hell");
check("the Reliquary, the Vigil and the Convergence are all in the Threshold",
  [planetConfig(PLANETS[0]!, 1, 1), dailyConfig(today), weeklyConfig(thisWeek, 1)]
    .every((c) => layerFor(c) === RIFT_LAYERS.threshold));

// The Delve is the one mode whose layer moves with the floor. That is the §23 point.
check("the Tower is on the ascent, and climbs out of its first band",
  layerFor(towerConfig(1)).axis === "up" && layerFor(towerConfig(1)) !== layerFor(towerConfig(9)),
  `height 1 → ${layerFor(towerConfig(1)).name}, height 9 → ${layerFor(towerConfig(9)).name}`);
check("the Tower is Heaven's ground the whole way up",
  [1, 5, 6, 25, 26, 60].every((h) => layerFor(towerConfig(h)).realm === "heaven"));

check("the Delve changes layer as it descends",
  new Set([1, 8, 20, 30].map((d) => layerFor(delveConfig(d)).id)).size === 4);
check("the bottom of the Delve is the Abyss's ground, not Hell's",
  layerFor(delveConfig(DELVE_BOTTOM)).realm === "abyss",
  `depth ${DELVE_BOTTOM} → ${layerFor(delveConfig(DELVE_BOTTOM)).name}`);

// The profile is where every screen reads the layer from, so it must agree with the
// function. A second answer here is exactly the drift §20 warns about.
let profileAgrees = true;
for (let d = 1; d <= FAR; d++) {
  for (const config of [delveConfig(d), towerConfig(d)]) {
    if (profileFor(d, config).layer !== layerFor(config)) profileAgrees = false;
  }
}
check(`the profile's layer is the function's answer, both ladders, 1-${FAR}`, profileAgrees);

// --- 2b. nextFloorConfig: a run's identity survives the step ---------------
//
// The Sept 2026 Tower bug: `nextFloorConfig` branches on `config.planet`, `config.memory`
// and `config.weekly`, then falls through to a generic delve/rift rebuild. The Tower
// (`isRift: false`, no branch of its own) fell all the way through and every climb handed
// back a Delve floor — the owner saw it live as "clear the Tower, land in the Delve".
// This is the third time a mode that hangs data on `RunConfig` got left out of this
// function (planet, then the Convergence, then a Memory), always found after the fact.
// A per-mode case test doesn't stop a fourth: this walks every entry in `RUN_MODES`
// instead, so a future mode with nothing here fails loudly rather than quietly landing
// on whatever `nextFloorConfig`'s fallback happens to build.
//
// Per lootsim-76's related finding on the Memory case: floor 1 can come out right while
// floors 2+ quietly go generic, so a mode with more than one floor is walked across all
// of them — not just the first step — reaching exactly the floors the game itself visits
// (`enterDungeon`/`party.descend` only call this while `!config.lastFloor`, i.e. from
// floor 1 up through the floor before the last one). The Vigil and a raid are single-floor
// by design — there is no floor 2 to build, `dailyConfig`/`raidConfig` don't even take a
// floor argument — so the game never calls this on them and they're skipped rather than
// given a manufactured step; `MODES[id].floors <= 1` is what makes that skip a fact about
// the mode instead of a loophole a future multi-floor mode could hide in.
console.log("\n=== nextFloorConfig: a run's identity survives the step ===");

/** What must survive a step, beyond the depth/floor numbers that are supposed to move. */
function modeFingerprint(id: RunModeId, config: RunConfig): unknown {
  switch (id) {
    case "tower": return config.tower ? "present" : null;
    case "planet": return config.planet ? `${config.planet.spec.id}#${config.planet.tier}` : null;
    case "memory": return config.memory ? config.memory.id : null;
    case "convergence": return config.weekly ? config.weekly.week : null;
    // abyss/hoard have no extra identity object — the rift tier is the whole claim.
    default: return MODES[id].isRift ? `tier:${config.tier}` : "n/a";
  }
}

const memoryRng = new Rng(20260909);
const nextFloorSeeds: Partial<Record<RunModeId, RunConfig>> = {
  delve: delveConfig(10),
  tower: towerConfig(10),
  abyss: riftConfig("abyss", 3, 1),
  hoard: riftConfig("hoard", 3, 1),
  planet: planetConfig(PLANETS[Math.min(1, PLANETS.length - 1)]!, 2, 1),
  convergence: weeklyConfig(weekNumber(), 1),
  memory: memoryConfig(rollMemory("rare", 30, memoryRng, "world-nextfloor"), 1),
};

for (const id of RUN_MODES) {
  const floors = MODES[id].floors;
  // The endless modes (`floors === 0`, delve/tower) have no floor count to walk to — they
  // get their own unbounded walk below instead of being skipped here.
  if (floors === 0) continue;
  if (floors === 1) {
    // Not a check — there's nothing to assert. `dailyConfig`/`raidConfig` don't even take
    // a floor argument, `enterDungeon`/`party.descend` are both guarded on
    // `!config.lastFloor`, and floor 1 of a one-floor mode always has `lastFloor: true`
    // (`riftConfig`'s `f === mode.floors`), so this call site is provably unreached for
    // these two. Logged so the coverage gap is visible rather than silent.
    console.log(`  ..   ${MODES[id].name}: single-floor by design, not walked`);
    continue;
  }
  const seed = nextFloorSeeds[id];
  if (!seed) {
    check(`${MODES[id].name}: has a walk-in config for this test`, false,
      `add a branch to nextFloorSeeds — this is exactly the coverage gap the bug hid in`);
    continue;
  }
  const steps = floors - 1; // floor 1 -> floor `floors`, the exact range the game visits
  let cfg = seed;
  let ok = true;
  let detail = "";
  const startFingerprint = modeFingerprint(id, cfg);
  for (let step = 1; step <= steps; step++) {
    const next = nextFloorConfig(cfg);
    if (next.mode.id !== id) { ok = false; detail = `step ${step}: mode became "${next.mode.id}"`; break; }
    if (next.floor !== cfg.floor + 1) {
      ok = false; detail = `step ${step}: floor ${cfg.floor} -> ${next.floor}, expected ${cfg.floor + 1}`; break;
    }
    const fp = modeFingerprint(id, next);
    if (fp !== startFingerprint) {
      ok = false; detail = `step ${step}: identity drifted — ${JSON.stringify(startFingerprint)} -> ${JSON.stringify(fp)}`;
      break;
    }
    cfg = next;
  }
  check(`${MODES[id].name}: identity survives ${steps} step(s) of nextFloorConfig (floor 1 → ${floors})`, ok, detail);
}

// The two endless modes never hit a last floor, so they're walked separately, further,
// with no floor count to stop at — this is the shape the Tower bug actually was.
for (const [id, seed] of [["delve", delveConfig(5)], ["tower", towerConfig(5)]] as const) {
  let cfg: RunConfig = seed;
  let ok = true;
  let detail = "";
  for (let step = 1; step <= 6; step++) {
    const next = nextFloorConfig(cfg);
    if (next.mode.id !== id) { ok = false; detail = `step ${step}: mode became "${next.mode.id}"`; break; }
    if (id === "tower" && !next.tower) { ok = false; detail = `step ${step}: lost its tower field`; break; }
    if (next.floor !== cfg.floor + 1) {
      ok = false; detail = `step ${step}: floor ${cfg.floor} -> ${next.floor}`; break;
    }
    cfg = next;
  }
  check(`${MODES[id].name}: identity survives 6 steps with no top to the ladder`, ok, detail);
}

// --- 3. the bands sit on boundaries the game already had -------------------

console.log("\n=== a layer edge is a boundary the Delve already had ===");

let edgesAlign = true;
const edgeDetail: string[] = [];
for (const layer of DOWN_LAYERS) {
  if (layer.from === 1) continue;
  const same = biomeFor(layer.from) === biomeFor(layer.from - 1);
  if (same) {
    edgesAlign = false;
    edgeDetail.push(`${layer.name} starts at ${layer.from} mid-biome`);
  }
}
check("every descent band starts where the biome changes", edgesAlign, edgeDetail.join("; "));

// The Proving stands at the bottom of the Delve and must not be split off into a band of
// its own by a later edit — it is inside the last one.
check("the Proving's floor is inside the last descent band",
  layerAt("down", DELVE_BOTTOM) === DOWN_LAYERS[DOWN_LAYERS.length - 1]);

// The ascent has to hold the same property, or the Tower's bands are decoration: the
// band a height sits in and the place that height is made of must change on the same
// step. `towerBiomeFor` is the ascent's `biomeFor`, so the check is the same check.
let upEdgesAlign = true;
const upEdgeDetail: string[] = [];
for (const layer of UP_LAYERS) {
  if (layer.from === 1) continue;
  if (towerBiomeFor(layer.from) === towerBiomeFor(layer.from - 1)) {
    upEdgesAlign = false;
    upEdgeDetail.push(`${layer.name} starts at ${layer.from} mid-biome`);
  }
}
check("every ascent band starts where the Tower's own biome changes", upEdgesAlign,
  upEdgeDetail.join("; "));
check("the ascent has one biome per band, and no more",
  TOWER_BIOMES.length === UP_LAYERS.length,
  `${TOWER_BIOMES.length} biomes, ${UP_LAYERS.length} bands`);
check("a tower floor is made of the band it is standing in",
  [1, 3, 5, 6, 14, 25, 26, 40].every((h) => biomeForRun(towerConfig(h)) === towerBiomeFor(h)));

// Heaven is Order, and holy is deliberately outside `LOOT_ELEMENTS` — the Tower is the
// place that gets it on purpose, which is exactly what `data/elements.ts` reserves it for.
check("every Tower band is made of holy", TOWER_BIOMES.every((b) => b.element === "holy"));
check("every Tower band renames the roster to the celestial orders",
  TOWER_BIOMES.every((b) => Object.keys(b.enemyNames ?? {}).length >= 5));
check("no two Tower bands share a name or a monster name",
  new Set(TOWER_BIOMES.map((b) => b.name)).size === TOWER_BIOMES.length
  && new Set(TOWER_BIOMES.flatMap((b) => Object.values(b.enemyNames ?? {}))).size
     === TOWER_BIOMES.reduce((n, b) => n + Object.keys(b.enemyNames ?? {}).length, 0));

// The Delve's own floors must not have picked up a roster rename on the way past.
check("the Delve's biomes still call a monster what it is",
  DELVE_BIOMES.every((b) => b.enemyNames === undefined));

// --- the two ladders stay two ladders -------------------------------------

console.log("\n=== the climb is the Delve's mirror, not the Delve ===");

// UAT §21 asked for a second direction, not a second difficulty model (CLAUDE.md: one
// curve). A tower floor and a delve floor at the same number must be the same fight.
let sameCurve = true;
for (let n = 1; n <= FAR; n++) {
  const a = profileFor(n, delveConfig(n));
  const b = profileFor(n, towerConfig(n));
  if (a.enemyHealth !== b.enemyHealth || a.enemyDamage !== b.enemyDamage
    || a.enemySpeed !== b.enemySpeed || a.aggression !== b.aggression
    || a.telegraph !== b.telegraph || a.recommendedLevel !== b.recommendedLevel) sameCurve = false;
}
check(`height N fights exactly like depth N, 1-${FAR} — one curve, two directions`, sameCurve);
check("a plain climb is ordinary danger, so §16 pays it nothing extra",
  towerConfig(20).danger === 1 && profileFor(20, towerConfig(20)).itemPower === 0);

// Every fifth floor, the same promise the Delve makes.
check("every fifth height is an encounter and nothing else is",
  [5, 10, 25, 30, 60].every((h) => towerConfig(h).bossFloor)
  && [1, 4, 6, 24, 31].every((h) => !towerConfig(h).bossFloor));
check("the climb has no top", [1, 30, 200].every((h) => !towerConfig(h).lastFloor));

// The encounters are borrowed and reskinned, exactly as a sector's are — so they are
// audited by the same boss rules `tools/legends.ts` already walks, by being those specs.
const towerSpecs = [5, 10, 15, 20, 25, 30, 60].map((h) => towerBossSpec(h));
// This asserted `b.phases === spec.phases` — reference identity — until the Tower's
// bosses were given their own kits. That was the right check for the code as it stood
// (`towerBossSpec` spread the template and never touched `phases`, so the object really
// was shared) and the wrong check for the promise: §21's promise is *no second content
// pipeline and no second difficulty curve*, not "the ability list is the same array".
// Reference identity happened to enforce both, and enforcing the second one is what made
// all five Tower bosses byte-identical fights to the five Delve encounters.
//
// So it is split into the two things it was actually standing for. The stat line is
// still borrowed whole — nothing here is authored from scratch — and the phase
// *structure* is still the template's, meaning the climb has no difficulty curve of its
// own. What a Tower boss is now allowed to differ in is which cards it holds, and (as of
// `art/bosses/finish-tower.ts`) which sprite it draws — `sprite` dropped out of this
// comparison deliberately, the whole point of that batch. Before it, `towerBossSpec`
// never touched `sprite` at all, so it was silently part of "the borrowed body" here;
// that was always the defect, not a promise worth re-enforcing on the numbers.
check("every Tower encounter borrows a real encounter's stat line",
  towerSpecs.every((spec) => BOSSES.some((b) =>
    b.health === spec.health && b.damage === spec.damage && b.speed === spec.speed
    && b.radius === spec.radius && b.spriteScale === spec.spriteScale)));
// The art is the Tower's own now, never the template's — the direct converse of the
// stat-line check above, so a future accidental revert (spreading `sprite` back off the
// template) fails loudly here rather than silently reopening the defect this batch fixed.
check("every Tower encounter draws its own sprite, never the borrowed template's",
  towerSpecs.every((spec) => {
    const template = BOSSES.find((b) =>
      b.health === spec.health && b.damage === spec.damage && b.speed === spec.speed
      && b.radius === spec.radius && b.spriteScale === spec.spriteScale);
    return template !== undefined && template.sprite !== spec.sprite;
  }));
check("no Tower encounter has a difficulty curve of its own — the phase shape is the template's",
  towerSpecs.every((spec) => BOSSES.some((b) =>
    b.phases.length === spec.phases.length
    && b.phases.every((phase, i) => {
      const mine = spec.phases[i]!;
      return phase.at === mine.at && phase.haste === mine.haste
        && phase.speed === mine.speed && phase.addsOnEnter === mine.addsOnEnter;
    }))));
// ...and the thing the split makes room for, asserted directly so it cannot quietly
// regress to a reskin: a Tower encounter must not be ability-for-ability its template.
check("every Tower encounter fights differently from the Delve encounter it borrows",
  towerSpecs.every((spec) => !BOSSES.some((b) =>
    b.phases.length === spec.phases.length
    && b.phases.every((phase, i) => {
      const mine = spec.phases[i]!;
      return phase.abilities.length === mine.abilities.length
        && phase.abilities.every((id) => mine.abilities.includes(id));
    }))));
check("every Tower encounter is holy", towerSpecs.every((s) => s.element === "holy"));
check("the Tower has five encounters, and the top one holds the Celestial Endgame",
  new Set([5, 10, 15, 20, 25].map((h) => towerBossSpec(h).id)).size === 5
  && towerBossSpec(25).id === towerBossSpec(60).id);
check("no Tower encounter borrows a name from the thing it reskins",
  towerSpecs.every((s) => !BOSSES.some((b) => b.name === s.name || b.title === s.title)));
// The preview and the simulation must agree about what is up there — the §20 rule.
check("the shared answer knows about the climb",
  [5, 25, 40].every((h) => bossSpecForRun(towerConfig(h)).id === towerBossSpec(h).id));

// The ruling that must not be simplified away later: a height is not a depth. A
// height-30 climb is not anybody's final exam and never opens the bottom of the Delve.
check("height 30 is not the Proving — the two records are not one record",
  !provingFloor(towerConfig(DELVE_BOTTOM), 999)
  && !provingFloor({ ...towerConfig(DELVE_BOTTOM), depth: DELVE_BOTTOM }, 999));

// The Tower appears once the first Warden is behind you, and not before (ruling 4).
check("the Tower opens at deepest depth 5, not sooner",
  !modeUnlocked(MODES.tower, 4) && modeUnlocked(MODES.tower, 5));

// --- the two records stay two records --------------------------------------

console.log("\n=== a height is not a depth ===");

// The check that stops the split being "simplified" later. Everything the depth record
// gates — the Proving, the rift ladders, the Vigil and Convergence thresholds, the
// Tower's own unlock — must be untouched by a climb, however high.
{
  const state = new GameState(1);
  state.recordDepth(3, delveConfig(3));
  const beforeDepth = state.stats.deepestDepth;
  const beforeUnlocked = state.maxUnlockedDepth;

  state.recordDepth(40, towerConfig(40));
  check("banking a tower floor moves the height record",
    state.stats.highestHeight === 40 && state.player.highestHeight === 40,
    `account ${state.stats.highestHeight}, character ${state.player.highestHeight}`);
  check("…and unlocks the next floor of the climb", state.maxUnlockedHeight === 41);
  check("…and moves neither depth record, however high the climb",
    state.stats.deepestDepth === beforeDepth && state.player.deepestDepth === beforeDepth
    && state.maxUnlockedDepth === beforeUnlocked,
    `depth ${state.stats.deepestDepth}, unlocked ${state.maxUnlockedDepth}`);
  check("…so a climber has still not opened a single rift tier",
    RUN_MODES.filter((id) => MODES[id].isRift).every((id) => state.riftTiers[id] === 1));
  check("…and has not opened the Tower's own gate either — the climb can't unlock itself",
    !modeUnlocked(MODES.tower, state.stats.deepestDepth));

  // The frontier is the widening half: both ladders feed it, and it only ever grows.
  check("the account frontier is the further of the two ladders",
    state.frontier === 40, String(state.frontier));
  check("the universal pool reads the frontier, so a climb pays for the basics",
    state.universalPool === universalPointsFor(40));
  state.recordDepth(55, delveConfig(55));
  check("…and a deeper dig widens it again", state.frontier === 55);

  // Per-character, which is the rule the ilvl split protects.
  check("a character's own frontier is the further of its own two records",
    state.player.frontier === Math.max(state.player.deepestDepth, state.player.highestHeight));
}

// --- 3b. the ward is Heaven's, and it is readable ------------------------

/**
 * The regard ward (UAT §21). Two conditions came with it, and both are properties rather
 * than opinions, so both are pinned here.
 *
 * **Telegraph-grade readability.** The ward is the one hazard you are asked to read while
 * you are busy doing something else, so its warning is the longest in the game. Asserted
 * as a comparison against every other hazard rather than as a threshold, for the reason
 * this repo learned the hard way: a bound only says a number is in a range, a comparison
 * says the design promise still holds. If a future pass tunes another hazard's telegraph
 * up past this one, or trims this one down, that is a decision someone should have to make
 * on purpose.
 *
 * **Tower-only.** A hazard that punishes standing still is a real tax on ranged builds
 * (measured at `npm run regard` — see that file's header for the table and for why a
 * longer hold makes it worse rather than better). That tax is a fair price for the Tower's
 * own floors and would be a silent, roster-wide nerf if it ever leaked onto the Delve's,
 * so the ward's confinement to the ascent is a checked property, not a convention.
 */
console.log("\n=== the ward is readable, and it is the Tower's alone ===");
{
  const regard = TRAPS.regard;
  const others = (Object.keys(TRAPS) as TrapKind[]).filter((k) => k !== "regard").map((k) => TRAPS[k]);

  check("the ward telegraphs for longer than any other hazard in the game",
    others.every((t) => regard.warn > t.warn),
    `regard ${regard.warn}s vs ${others.map((t) => `${t.kind} ${t.warn}s`).join(", ")}`);
  check("…and it telegraphs for longer than it sears, so the warning is the bigger half",
    regard.warn > regard.active, `${regard.warn}s warn vs ${regard.active}s sear`);
  check("…and you get longer to read it than you had to stand still to earn it",
    regard.warn >= REGARD_HOLD * 0.8, `${regard.warn}s telegraph on a ${REGARD_HOLD}s hold`);
  check("the mark is escapable at a walk, not only by dashing",
    regard.radius < REGARD_WATCH / 4, `${regard.radius}u mark, ${REGARD_WATCH}u reach`);

  // Every biome in the game, both ladders and every planet, asked the same question.
  const towerNames = new Set(TOWER_BIOMES.map((b) => b.name));
  const elsewhere = [...BIOMES, ...PLANETS.map((p) => p.biome)].filter((b) => !towerNames.has(b.name));
  check("every band of the Tower posts wards", TOWER_BIOMES.every((b) => b.traps.includes("regard")),
    `${TOWER_BIOMES.length} bands`);
  check("…and nothing outside the Tower does — the Delve, the rifts and every planet are clean",
    elsewhere.every((b) => !b.traps.includes("regard")),
    `${elsewhere.length} other biomes checked`);
  check("…so a Delve floor can never place one, at any depth",
    [1, 10, 25, 30, 60].every((d) => !trapKindsAt(d).includes("regard")));
}

/** Which hazards the Delve is allowed to place at a depth — biome list, then minDepth. */
function trapKindsAt(depth: number): TrapKind[] {
  const biome = biomeForRun(delveConfig(depth));
  return biome.traps.filter((k) => TRAPS[k].minDepth <= depth);
}

// --- 4. the prose says something the mode's own line doesn't ---------------

console.log("\n=== a layer line says where, not what the mode already said ===");

/** The §22 vocabulary: a line has to name the war it belongs to. */
const WAR = /Heaven|Hell|Abyss|Purgatory|Keepers|Rift|Citadel|Reliquary|Limbo|circle|celestial|Threshold/i;
/** Payout words. A layer says where you are, never what it pays. */
const PAYOUT = /coins|keys|rarity|farm|loot|drops/i;
/** No on-screen legend may hardcode a key name or a "press"/"click" (CLAUDE.md). */
const KEYS = /\[[A-Z]\]|\bpress\b|\bclick\b/i;

const MODE_LORE = RUN_MODES.map((id) => MODES[id].lore);

for (const layer of LAYERS) {
  const l = layer.lore;
  check(`${layer.name}: has a line`, l.trim().length > 0);
  check(`${layer.name}: names the war`, WAR.test(l));
  check(`${layer.name}: doesn't quote the payout`, !PAYOUT.test(l));
  check(`${layer.name}: hardcodes no key`, !KEYS.test(l) && !KEYS.test(layer.name));
  check(`${layer.name}: fits the panel`, l.length <= 320, `${l.length} chars`);
  // The pair on screen is "what this place is" (the mode) plus "where it sits" (the
  // layer). If a layer line ever becomes a copy of a mode line, one of them is dead text.
  check(`${layer.name}: isn't a restatement of a mode's line`, !MODE_LORE.includes(l));
}

check("no two layers share a line",
  new Set(LAYERS.map((l) => l.lore)).size === LAYERS.length);

// Both halves of the war are actually described. A table with only the descent in it
// would be the disconnected-tiers problem wearing a new name.
check("the descent and the ascent are both authored",
  DOWN_LAYERS.length >= 3 && UP_LAYERS.length >= 3,
  `${DOWN_LAYERS.length} down, ${UP_LAYERS.length} up`);
check("the ascent is Heaven's ground throughout",
  UP_LAYERS.every((l) => l.realm === "heaven"));
check("the descent ends on ground that is no longer Hell's",
  DOWN_LAYERS[DOWN_LAYERS.length - 1]!.realm === "abyss");

// --- 5. the §15 seam, now filled ------------------------------------------

console.log("\n=== every raid a layer claims is a real raid, and it gates nothing ===");

// This was "the seam is reserved, and empty" until raids landed (UAT §15). The check it
// was holding the door for is the one below: an id that resolves. The half that matters
// as much — that a raid standing at a layer does not gate the ladder through it — is in
// `tools/raids.ts`, next to the raid table it would have to read to break that.
check("every layer has the field, so a raid has somewhere to hang",
  LAYERS.every((l) => "raidId" in (l as WorldLayer)));
check("every raid a layer claims resolves to a real one",
  LAYERS.every((l) => l.raidId === null || RAID_BY_ID[l.raidId] !== undefined),
  LAYERS.filter((l) => l.raidId !== null && !RAID_BY_ID[l.raidId]).map((l) => l.name).join(", "));
check("…and names that layer back",
  LAYERS.every((l) => l.raidId === null || RAID_BY_ID[l.raidId]!.layerId === l.id));
// That a layer still changes nothing about how a floor *fights* is asserted where it can
// be measured rather than grepped: `tools/raids.ts` §2 profiles a Delve floor either side
// of every band edge, and §4 compares a raid floor against a Delve floor at the same depth
// and danger. A source-text grep for the word "layer" was tried here first and matched
// four unrelated sentences about the presentation layer.

// --- 6. the Reliquary widening only widens --------------------------------

console.log("\n=== a sector unlocks by the ladder or by the frontier, never less ===");

check("the first sector is always open", planetUnlocked(PLANETS[0]!, {}, 0));
check("the ladder route still works on its own at frontier 0",
  planetUnlocked(PLANETS[1]!, { [PLANETS[0]!.id]: 2 }, 0));
check("a fresh account still can't skip ahead",
  !planetUnlocked(PLANETS[1]!, {}, 0));

// The new route: the frontier against the sector's own tuned depth.
let frontierOpens = true;
for (const planet of PLANETS.slice(1)) {
  if (!planetUnlocked(planet, {}, planet.baseDepth)) frontierOpens = false;
  if (planetUnlocked(planet, {}, planet.baseDepth - 1)) frontierOpens = false;
}
check("the frontier opens a sector exactly at its own base depth", frontierOpens);

// The property that makes this safe to ship: more progress never removes access.
let monotonic = true;
for (const planet of PLANETS) {
  for (const progress of [{}, { [PLANETS[0]!.id]: 2 }]) {
    let wasOpen = false;
    for (let f = 0; f <= FAR; f++) {
      const open = planetUnlocked(planet, progress, f);
      if (wasOpen && !open) monotonic = false;
      wasOpen = open;
    }
  }
}
check("a higher frontier never closes a sector that was open", monotonic);

let ladderPreserved = true;
for (let i = 1; i < PLANETS.length; i++) {
  const progress = { [PLANETS[i - 1]!.id]: 1 };
  if (!planetUnlocked(PLANETS[i]!, progress, 0)) ladderPreserved = false;
}
check("every sector the old ladder opened is still open at frontier 0", ladderPreserved);

// --- 7. every element has a Reliquary sector that pays in it ---------------

console.log("\n=== the Reliquary covers every damage element, not just the loot pool ===");

// This is the direct fix for a live dead-end: the Forge sells a crafting essence in every
// magic element (`CRAFT_ESSENCES` in `data/crafting.ts`), but an essence just weights a
// roll toward its element and still costs that element's material — so a reserved element
// with no sector paying it out was a menu entry that could never be afforded. Structural
// on purpose: a ninth sector that forgot to set `element` right, or a reserved element that
// quietly regains a tenth home, both fail here rather than waiting on a bug report.
const sectorElements = new Set(PLANETS.map((p) => p.element));
check("every element has at least one sector",
  ELEMENTS.every((e) => sectorElements.has(e)),
  ELEMENTS.filter((e) => !sectorElements.has(e)).join(", "));
check("no element is doubled up while another goes uncovered",
  sectorElements.size === ELEMENTS.length,
  `${sectorElements.size} distinct elements across ${PLANETS.length} sectors`);
check("the three reserved elements — the ones this fix was for — are all in",
  RESERVED_ELEMENTS.every((e) => sectorElements.has(e)));

console.log(failures === 0
  ? "\nThe world reads as one structure.\n"
  : `\n${failures} problem(s).\n`);
process.exit(failures === 0 ? 0 : 1);
