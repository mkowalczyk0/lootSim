/**
 * Endgame drop previews acceptance test — UAT §20.
 *
 * §20 is a promise about *information*, so the only failure that matters is the preview
 * being wrong. Everything else here is secondary to one property, checked by
 * construction rather than by inspection:
 *
 *   **What the preview lists is exactly what the real roll can produce.**
 *
 * The way that is proved: take the activity, ask `previewForRun` what it can drop, then
 * run the *actual* `rollNamedDrops` over the same events with a rigged rng that always
 * hits, and compare the two sets. Not a reimplementation of the drop rules — the
 * simulation's own roll function, forced to succeed. If a preview ever lists something
 * unobtainable, or misses something obtainable, these sets stop matching.
 *
 * That is worth more than any number of "the screen said something plausible" checks,
 * because the §20 constraint is that a preview which can drift is worse than no preview.
 *
 * Headless, no browser. Run with `npm run previews`.
 */

import { CHEST_TIERS } from "../src/data/chests";
import { CLASS_IDS, type ClassId } from "../src/data/classes";
import { bossSpecForRun } from "../src/data/encounters";
import { dailyConfig, dayNumber } from "../src/data/daily";
import { DELVE_BOTTOM, legendBossSpec, legendName } from "../src/data/legends";
import { MODES, RIFT_LORE, RUN_MODES, delveConfig, riftConfig, type RunConfig } from "../src/data/modes";
import {
  NAMED_ITEMS, bossDisplayName, namedDropChance, rollNamedDrops,
} from "../src/data/named";
import { PLANETS, planetConfig } from "../src/data/planets";
import { towerConfig } from "../src/data/tower";
import { previewForChest, previewForRun } from "../src/data/previews";
import { Dungeon } from "../src/game/dungeon";
import { Hub, stationLore, type HubStationKind } from "../src/game/hub";
import { GameState } from "../src/game/state";
import type { AvatarInput } from "../src/core/input";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

/** An rng that always says yes, so `rollNamedDrops` yields everything it *could* yield. */
const ALWAYS = { chance: () => true };

/**
 * The events a run really contains — restated here on purpose rather than imported from
 * `previews.ts`. A test that borrowed the preview's own floor walk could only ever agree
 * with it; stating the expectation independently is what lets the comparison below fail.
 * The *roll* is not restated: that is the simulation's own `rollNamedDrops`.
 */
function eventsOfRun(config: RunConfig, proving: ClassId | null) {
  const floors: RunConfig[] = [];
  const mode = config.mode;
  if (!mode.isRift || mode.floors <= 1) floors.push(config);
  else if (config.planet) {
    for (let f = 1; f <= config.planet.spec.floors; f++) {
      floors.push(planetConfig(config.planet.spec, config.planet.tier, f, config.challengerTier));
    }
  } else {
    for (let f = 1; f <= mode.floors; f++) {
      floors.push(riftConfig(mode.id, config.tier, f, config.challengerTier));
    }
  }
  const events: Parameters<typeof rollNamedDrops>[0][] = [];
  for (const floor of floors) {
    if (floor.bossFloor) events.push({ kind: "boss", bossId: bossSpecForRun(floor, proving).id });
    events.push({ kind: "clearCache", depth: floor.depth, mode: floor.mode.id });
    events.push({ kind: "worldDrop", depth: floor.depth, elite: true });
  }
  return events;
}

/** Everything the real roll can produce for a run, with the dice removed. */
function reallyDroppable(config: RunConfig, proving: ClassId | null): Set<string> {
  const out = new Set<string>();
  for (const event of eventsOfRun(config, proving)) {
    for (const def of rollNamedDrops(event, ALWAYS, config.danger)) out.add(def.id);
  }
  return out;
}

// --- 1. the property that matters -----------------------------------------

console.log("\n=== a preview lists exactly what the run can really drop ===");
{
  const activities: [string, RunConfig, ClassId | null][] = [
    ["the Delve, depth 5", delveConfig(5), null],
    ["the Delve, depth 12", delveConfig(12), null],
    ["the Delve, depth 25", delveConfig(25), null],
    ["the Delve's bottom, unqualified", delveConfig(DELVE_BOTTOM), null],
    ["the Proving (swordsman)", delveConfig(DELVE_BOTTOM), "swordsman"],
    ["the Proving (warlock)", delveConfig(DELVE_BOTTOM), "warlock"],
    ["the Abyssal Rift, tier 1", riftConfig("abyss", 1, MODES.abyss.floors), null],
    ["the Abyssal Rift, tier 9", riftConfig("abyss", 9, MODES.abyss.floors), null],
    ["the Avarice Rift, tier 4", riftConfig("hoard", 4, MODES.hoard.floors), null],
    ["a Reliquary sector, tier 1", planetConfig(PLANETS[0]!, 1, 1, 0), null],
    ["a deep Reliquary sector", planetConfig(PLANETS[PLANETS.length - 1]!, 3, 1, 0), null],
    ["the Vigil", dailyConfig(dayNumber()), null],
    ["the Delve under Challenger 12", delveConfig(20, 12), null],
  ];

  for (const [label, config, proving] of activities) {
    const preview = previewForRun(config, proving);
    const listed = new Set(preview.named.map((d) => d.def.id));
    const real = reallyDroppable(config, proving);
    const missing = [...real].filter((id) => !listed.has(id));
    const invented = [...listed].filter((id) => !real.has(id));
    check(`${label}: lists ${listed.size}, drops ${real.size}`,
      missing.length === 0 && invented.length === 0,
      missing.length || invented.length
        ? `missing [${missing.join(", ")}] invented [${invented.join(", ")}]`
        : preview.named.map((d) => d.def.name).join(", ") || "nothing named");
  }
}

console.log("\n=== every mode answers the question ===");
for (const id of RUN_MODES) {
  // Built the way each mode really builds one, so a mode that grows its own config shape
  // shows up here rather than being quietly skipped.
  //
  // The `riftConfig` fallback is the trap here, and the next non-rift mode is when it
  // bites again: `riftConfig(id, 1, MODES[id].floors)` on a mode with `isRift: false` and
  // `floors: 0` falls all the way back to `delveConfig(0)` and returns a perfectly valid
  // config for the wrong activity. The Tower spent a commit in that state — this walk was
  // green while previewing a Delve floor and calling it the Tower. Give a new non-rift
  // mode its own branch above; do not let it reach the fallback.
  const config = id === "delve" ? delveConfig(10)
    : id === "tower" ? towerConfig(10)
      : id === "vigil" ? dailyConfig(dayNumber())
        : id === "planet" ? planetConfig(PLANETS[0]!, 1, 1, 0)
          : riftConfig(id, 1, MODES[id].floors);
  const preview = previewForRun(config);
  check(`${MODES[id].name} has a title and says what else it pays`,
    preview.title.length > 0 && preview.other.length > 0,
    `${preview.title} · ${preview.other.length} line(s)`);
}

// --- 2. the numbers are the sim's numbers ---------------------------------

console.log("\n=== the odds quoted are the odds rolled ===");
{
  // A boss-exclusive at tier 1 and at a high tier: the preview must show danger lifting
  // the chance, because `rollNamedDrops` lifts it through the same `namedDropChance`.
  const low = previewForRun(riftConfig("abyss", 1, MODES.abyss.floors));
  const high = previewForRun(riftConfig("abyss", 14, MODES.abyss.floors));
  const pick = (p: typeof low) => p.named.find((d) => d.def.sources.some((s) => s.kind === "boss"));
  const a = pick(low);
  const b = pick(high);
  check("a harder tier quotes better named odds", !!a && !!b && b!.chance > a!.chance,
    a && b ? `${(a.chance * 100).toFixed(1)}% → ${(b.chance * 100).toFixed(1)}%` : "no boss drop found");

  // And the quoted number is literally what the roll site computes, not a lookalike.
  const cfg = riftConfig("abyss", 6, MODES.abyss.floors);
  const preview = previewForRun(cfg);
  const bossSpec = bossSpecForRun(cfg, null);
  const drift = preview.named.filter((d) => {
    const src = d.def.sources.find((s) => s.kind === "boss" && s.bossId === bossSpec.id);
    if (!src || src.kind !== "boss") return false;
    return Math.abs(d.chance - namedDropChance(src.chance, cfg.danger)) > 1e-9;
  });
  check("…to the exact number `namedDropChance` returns", drift.length === 0,
    drift.map((d) => d.def.name).join(", "));

  // An elite tripling a world drop is quoted, since the floor can produce one.
  const shallow = previewForRun(delveConfig(12));
  const world = shallow.named.find((d) => d.def.sources.some((s) => s.kind === "worldDrop"));
  const base = world?.def.sources.find((s) => s.kind === "worldDrop");
  check("a world drop quotes the elite-tripled chance the floor can pay",
    !!world && !!base && base.kind === "worldDrop"
      && Math.abs(world.chance - namedDropChance(base.chance * 3, 1)) < 1e-9,
    world ? `${world.def.name} at ${(world.chance * 100).toFixed(2)}%` : "none found");
}

console.log("\n=== the preview names the encounter that actually spawns ===");
{
  /** Ticks a real floor until its boss exists, and reports the name on it. */
  const spawnedBossName = (state: GameState, config: RunConfig, seed: number): string | undefined => {
    const d = new Dungeon(state, config, seed);
    // Stands still and presses nothing: the boss spawns on its own, and standing still
    // is all this check needs from a player.
    const input: AvatarInput = {
      moveVector: () => ({ x: 0, y: 0 }),
      wasPressed: () => false,
      aimAngle: () => null,
    };
    let t = 0;
    while (t < 6 && !d.boss) {
      d.update(1 / 60, input as never);
      d.drainEvents();
      t += 1 / 60;
    }
    return d.boss?.name;
  };

  const geared = (classId: ClassId, record: number) => {
    const state = new GameState(4242);
    state.chooseClass(classId);
    state.player.level = 40;
    state.player.deepestDepth = record;
    state.stats.deepestDepth = record;
    state.player.refresh();
    return state;
  };

  // A depth-bucketed delve boss.
  const delveCfg = delveConfig(10);
  check("a Delve boss floor: preview matches the spawn",
    previewForRun(delveCfg).bosses[0] === spawnedBossName(geared("swordsman", 9), delveCfg, 9001),
    `${previewForRun(delveCfg).bosses[0]}`);

  // A sector's reskin.
  const planetCfg = planetConfig(PLANETS[1]!, 1, PLANETS[1]!.floors, 0);
  check("a Reliquary boss floor: preview matches the spawn",
    previewForRun(planetCfg).bosses[0] === spawnedBossName(geared("swordsman", 9), planetCfg, 9002),
    `${previewForRun(planetCfg).bosses[0]}`);

  // The Proving — the one where the encounter is the class rather than the depth, and so
  // the one a preview could most easily get wrong.
  const provingCfg = delveConfig(DELVE_BOTTOM);
  const provingState = geared("reaper", DELVE_BOTTOM);
  const spawned = spawnedBossName(provingState, provingCfg, 9003);
  check("the Proving: preview matches the spawn",
    previewForRun(provingCfg, "reaper").bosses[0] === spawned && spawned === legendName("reaper"),
    `${spawned}`);
  // And an unqualified character at the same depth is previewed the ordinary encounter.
  check("…and an unqualified character is shown the ordinary floor's boss",
    previewForRun(provingCfg, null).bosses[0]
      === spawnedBossName(geared("reaper", DELVE_BOTTOM - 1), provingCfg, 9003),
    `${previewForRun(provingCfg, null).bosses[0]}`);
}

// --- 3. exclusivity, the "I still need THAT one" flag ---------------------

console.log("\n=== exclusivity is the truth, not a label ===");
{
  const cfg = delveConfig(5);
  const preview = previewForRun(cfg);
  const wrong = preview.named.filter((d) => {
    const drops = d.def.sources.filter((s) => s.kind !== "craft").length;
    return d.exclusive !== (drops === 1);
  });
  check("only single-source items are flagged as only-here", wrong.length === 0,
    wrong.map((d) => d.def.name).join(", "));

  // Exclusives sort first, so the thing you can only get here is the thing you read first.
  const mixed = previewForRun(riftConfig("abyss", 5, MODES.abyss.floors));
  const firstShared = mixed.named.findIndex((d) => !d.exclusive);
  const lastExclusive = mixed.named.reduce((acc, d, i) => (d.exclusive ? i : acc), -1);
  check("exclusives are listed first", firstShared === -1 || lastExclusive < firstShared,
    `${mixed.named.filter((d) => d.exclusive).length} exclusive of ${mixed.named.length}`);
}

// --- 4. chests, the other commit point ------------------------------------

console.log("\n=== a chest previews its own table ===");
for (const tier of CHEST_TIERS) {
  const preview = previewForChest(tier);
  const listed = new Set(preview.named.map((d) => d.def.id));
  const real = new Set(rollNamedDrops({ kind: "chest", tier }, ALWAYS).map((d) => d.id));
  check(`${tier}: lists exactly what a pull can name`,
    listed.size === real.size && [...listed].every((id) => real.has(id)),
    preview.named.map((d) => d.def.name).join(", ") || "nothing named");
}

// --- 5. the Proving's own reward ------------------------------------------

console.log("\n=== the Proving pays a relic, and only the Proving pays it ===");
{
  const relic = NAMED_ITEMS.find((d) => d.id === "proof-of-the-whole");
  check("Proof of the Whole is in the registry", !!relic);
  if (relic) {
    const bossIds = relic.sources
      .filter((s): s is Extract<typeof s, { kind: "boss" }> => s.kind === "boss")
      .map((s) => s.bossId);
    check("…dropped by every class's Proving, with none missed",
      bossIds.length === CLASS_IDS.length
        && CLASS_IDS.every((id) => bossIds.includes(legendBossSpec(id).id)),
      `${bossIds.length} sources for ${CLASS_IDS.length} classes`);
    check("…and by nothing that isn't a Proving",
      relic.sources.every((s) => s.kind === "boss" && s.bossId.startsWith("legend-")));
    // Mythic, not divine: crafting caps at mythic and the top two rarities stay
    // chest-only by the rule carried over from the original game.
    check("…at mythic, leaving divine and unspoken chest-only", relic.rarity === "mythic",
      relic.rarity);

    // The read every source line goes through has to resolve a generated encounter, or
    // the Records screen prints a raw id at the player.
    const raw = CLASS_IDS.filter((id) => bossDisplayName(`legend-${id}`) === `legend-${id}`);
    check("every Proving's name resolves for the source line", raw.length === 0, raw.join(", "));
    check("…to the encounter's own name",
      CLASS_IDS.every((id) => bossDisplayName(`legend-${id}`) === legendName(id)));

    // It shows up in the preview of the activity that pays it, for every class.
    const missing = CLASS_IDS.filter((id) =>
      !previewForRun(delveConfig(DELVE_BOTTOM), id).named.some((d) => d.def.id === relic.id));
    check("and every class's Proving previews it", missing.length === 0, missing.join(", "));

    // It really forges and really drops, through the ordinary path.
    const state = new GameState(77);
    state.chooseClass("bard");
    state.player.deepestDepth = DELVE_BOTTOM;
    const dropped = rollNamedDrops({ kind: "boss", bossId: legendBossSpec("bard").id }, ALWAYS);
    check("a Proving kill really rolls it", dropped.some((d) => d.id === relic.id),
      dropped.map((d) => d.name).join(", "));
  }
}

console.log("\n=== the preview says something worth reading ===");
{
  // The Avarice Rift is the volume mode and the Abyss is the rarity mode; each should say
  // so out of its own numbers rather than from a hand-written blurb.
  const avarice = previewForRun(riftConfig("hoard", 1, MODES.hoard.floors)).other.join(" · ");
  const abyss = previewForRun(riftConfig("abyss", 1, MODES.abyss.floors)).other.join(" · ");
  check("the Avarice Rift advertises volume", /coins/.test(avarice) && /drops/.test(avarice), avarice);
  check("the Abyssal Rift advertises rarity", /top end/.test(abyss), abyss);
  const vigil = previewForRun(dailyConfig(dayNumber())).other.join(" · ");
  check("the Vigil advertises its guaranteed key", /key/.test(vigil), vigil);
  const sector = previewForRun(planetConfig(PLANETS[0]!, 1, 1, 0));
  check("a sector advertises its material",
    sector.materials.length === 1 && sector.materials[0] === PLANETS[0]!.element,
    sector.other.join(" · "));
  // And what the difficulty itself is worth (UAT §16). A tier-1 rift is danger 1 and has
  // nothing to add; a deep tier has all four axes to report, and reports them off
  // `rewardCurve` rather than from a second copy of the numbers.
  const deep = previewForRun(riftConfig("abyss", 14, MODES.abyss.floors)).other.join(" · ");
  check("a deep tier advertises what its danger is worth",
    /drops for the danger/.test(deep) && /item levels/.test(deep)
      && /infused/.test(deep) && /named-item odds/.test(deep), deep);
  const shallowTier = previewForRun(riftConfig("abyss", 1, MODES.abyss.floors)).other.join(" · ");
  check("…and a first tier, being ordinary danger, claims none of it",
    !/drops for the danger/.test(shallowTier) && !/item levels/.test(shallowTier),
    shallowTier);

  // A plain delve floor at tier zero has nothing special to say, and says that.
  check("a plain Delve floor admits it is the baseline",
    previewForRun(delveConfig(3)).other.some((o) => /baseline/.test(o)),
    previewForRun(delveConfig(3)).other.join(" · "));
}

// --- 6. the mode says what it is a consequence of (UAT §22) ----------------
//
// §22 asks that a Rift read as a consequence of the war rather than a disconnected
// mechanic. The lore itself is prose and a test can't judge prose, but it can hold the
// line that matters: every mode's `lore` names the war — its sides, its ground or the
// order that fights it — instead of restating the payout; it is a different sentence
// from the mechanical `blurb`; and, like every other on-screen string, it hardcodes no
// key. The hub side: every portal on the deck carries a lore line and the three
// stations that aren't doors to anywhere carry none.

console.log("\n=== a mode says what it is a consequence of, not only what it pays ===");
{
  const WAR = /Heaven|Hell|Abyss|Purgatory|Keepers|Rift|Citadel|Reliquary/;
  const KEYS = /\[[A-Z]\]|\bpress\b|\bclick\b/i;
  const PAYOUT = /coins|keys|rarity|farm|loot|drops/i;
  for (const id of RUN_MODES) {
    const m = MODES[id];
    check(`${m.name} has a lore line that names the war`, m.lore.length > 0 && WAR.test(m.lore), m.lore);
    check(`…that isn't the payout line in a costume`, m.lore !== m.blurb && !PAYOUT.test(m.lore));
    check(`…that fits the aside it is read in`, m.lore.length <= 280, `${m.lore.length} chars`);
    check(`…and hardcodes no key or "press"/"click"`, !KEYS.test(m.lore) && !KEYS.test(m.blurb));
  }
  check("what a Rift is names both sides of the war", /Heaven/.test(RIFT_LORE) && /Hell/.test(RIFT_LORE) && /Keepers/.test(RIFT_LORE));

  const hub = new Hub();
  hub.vigilOpen = true;
  hub.weeklyOpen = true;
  hub.towerOpen = true;
  hub.setExpedition(PLANETS[0]!.id, 1);
  const kinds = new Set<HubStationKind>(hub.stations.map((s) => s.kind));
  const doors: HubStationKind[] = ["dive", "abyss", "hoard", "starmap", "expedition", "vigil", "convergence", "tower"];
  const notDoors: HubStationKind[] = ["forge", "quartermaster", "comms"];
  check("every station kind is on the deck under test", [...doors, ...notDoors].every((k) => kinds.has(k)),
    [...kinds].join(", "));
  check("every portal on the deck carries its mode's lore",
    doors.every((k) => { const l = stationLore(k); return l !== null && Object.values(MODES).some((m) => m.lore === l); }));
  check("the stations that aren't doors to the war say nothing", notDoors.every((k) => stationLore(k) === null));
  check("the Reliquary Gate and the portal it opens speak for the same place",
    stationLore("starmap") === MODES.planet.lore && stationLore("expedition") === MODES.planet.lore);
}

console.log(`\n${failures === 0 ? "ALL PREVIEW CHECKS PASSED" : `${failures} PREVIEW CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
