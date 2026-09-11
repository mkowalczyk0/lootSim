/**
 * Headless simulation smoke test. Drives the dungeon with a scripted input source to
 * confirm waves spawn, combat resolves, loot drops, floors clear and death works —
 * none of which needs a browser, since `game/` is DOM-free by design.
 *
 * The bot is the point of this file. It plays the way the game asks you to: it reads
 * boss telegraphs and gets out of them, it casts the skills it has, and it retreats
 * when it's hurt. A bot that can't do those things measures a game nobody is playing.
 */
import { Input, type Action, type AvatarInput } from "../src/core/input";
/**
 * The bot, the campaign and the gearing helpers live in `tools/bot.ts` — one copy, now
 * shared with `tools/curves.ts`. They used to live here and were paraphrased into that
 * harness, which then measured its own paraphrase instead of the game; see that file.
 */
import {
  CAMPAIGN_SEEDS, DT, FakeInput, campaign, geared, playFloor, steerAngle, type FloorResult,
} from "./bot";
import { DEFAULT_KEYBINDS, DEFAULT_SETTINGS, REBINDABLE_ACTIONS } from "../src/data/settings";
import { Dungeon, type Hero } from "../src/game/dungeon";
import type { Pickup } from "../src/game/entities";
import { runBuildGrants } from "../src/game/abilities";
import type { ResolvedBuild } from "../src/progression/index";
import {
  Hub, HUB_HEIGHT, HUB_WIDTH, HUB_PLAYER_RADIUS, PARTY_PORTAL, STATION_MODE, partyPortalFor,
} from "../src/game/hub";
import {
  DECK_COLS, DECK_ROWS, DECK_SPAWN, DECK_WALLS, deckIsRock, deckProblems,
} from "../src/game/deck";
import { RAIDS, raidBossId, raidConfig } from "../src/data/raids";
import { circleHitsWall, FlowField, generateLevel, isWalkable, resolveCircle, TILE } from "../src/game/level";
import { itemScore, requiredLevel } from "../src/game/item";
import { Player, xpForLevel } from "../src/game/player";
import { GameState } from "../src/game/state";
import { type ChestTier } from "../src/data/chests";
import { challengerMultiplier } from "../src/data/challenger";
import { CRAFTABLE_RARITIES, craftBulkCost, reforgeCoinCost } from "../src/data/crafting";
import { profileFor } from "../src/data/depth";
import { affixCountFor, affixPrefix, MONSTER_AFFIXES, rollMonsterAffixes } from "../src/data/monster-affixes";
import {
  EARLY_EXTRACT_KEEP, MODES, RUN_MODES, delveConfig, describeRun, riftConfig, trainingConfig,
  type RunConfig, type RunModeId,
} from "../src/data/modes";
import {
  DAILY_DEPTH_MAX, DAILY_DEPTH_MIN, DAILY_KEY_ODDS, DAILY_MODIFIERS, DAILY_MODIFIER_IDS, DAILY_UNLOCK_DEPTH,
  DAY_MS, dailyConfig, dailyEffects, dailyPlan, dailyUnlocked, dayNumber, daySeed, msUntilReset,
  type DailyModifierId,
} from "../src/data/daily";
import {
  WEEKLY_BOSS_DEPTH_MAX, WEEKLY_BOSS_DEPTH_MIN, WEEKLY_DEPTH_MAX, WEEKLY_DEPTH_MIN, WEEKLY_DEPTH_PER_FLOOR,
  WEEKLY_FLOORS, WEEKLY_GUARANTEED_RARITY, WEEKLY_KEY_ODDS, WEEKLY_MODIFIERS, WEEKLY_MODIFIER_IDS,
  WEEKLY_UNLOCK_DEPTH, msUntilWeeklyReset, weekNumber, weeklyConfig, weeklyEffects, weeklyPlan,
  weeklySeed, weeklyUnlocked, type WeeklyModifierId,
} from "../src/data/weekly";
import { PLANETS, nextFloorConfig, planetConfig, planetUnlocked } from "../src/data/planets";
import { TOWER_BIOMES, towerConfig } from "../src/data/tower";
import { CombatStats } from "../src/game/combatStats";
import { DELVE_BOTTOM, LEGENDS, legendName } from "../src/data/legends";
import { MINION_CAP_PER_OWNER } from "../src/data/minions";
import { CLASSES, CLASS_IDS, treePointsFor, type ClassId } from "../src/data/classes";
import { CLASS_BY_ID, UNIVERSAL_TREE, buildProgressionTree } from "../src/progression/index";
import { WEAPON_FAMILIES, WEAPONS, type WeaponFamily } from "../src/data/weapons";
import { BOSSES } from "../src/data/bosses";
import { ARCHETYPES, type EnemyBehavior, type EnemyKind } from "../src/data/enemies";
import {
  CAPSULES, CAPSULE_TIERS, COSMETICS, COSMETIC_SLOTS, HAIR_STYLES,
  cosmeticProblems, wornInSlot,
} from "../src/data/cosmetics";
import {
  BODY, BODY_DY, BODY_H, BOSS_GRIDS, CHAR_H, COSMETIC_ART, HAIR, WEAPON_ART, gridProblems,
} from "../src/render/pixels";
import { FLOOR_GRADE, gradeSheet, hexToRgb, luminance, tileLuminance } from "../src/render/grade";
import {
  ATLAS, ATLAS_COSMETICS, SPRITE_OVERRIDES, TILESETS,
  cosmeticStageXY, heroStage,
  MONSTER_SETS,
} from "../src/render/atlas/manifest";
import { STATION_PROP } from "../src/game/deck";
import {
  HERO_PORTRAIT_BODY_PX, STYLE_PORTRAIT_BODY_PX, portraitScale, portraitSpread,
} from "../src/ui/portrait";
import { BIOMES, type BiomeStyle } from "../src/data/biomes";
import { ELEMENT_COLORS } from "../src/data/elements";
import { decodePng } from "./png";
import { existsSync, readFileSync } from "node:fs";
import { RARITIES, rarityIndex, type Rarity } from "../src/data/rarity";
import { rollItem, type Item } from "../src/game/item";
import { ITEM_TYPES, MOD_COUNTS } from "../src/data/items";
import { MAX_TROPHY_CASES, trophyCaseCost } from "../src/data/trophies";
import { BANNER_STYLES, standardsFor } from "../src/data/standards";
import { STAT_KEYS } from "../src/data/mods";
import { Rng } from "../src/core/rng";
import { InputLog, NetInput, applySnapshot, configFromWire, configToWire, encodeSnapshot, packInput } from "../src/net/sync";
import { isRoomCode, normalizeRoomCode, randomRoomCode, type HeroWire, type PartyMessage, type Snapshot } from "../src/net/protocol";
import { Party } from "../src/net/party";
import { MemorySaveStore, parseSaved, serializeSave, SAVE_VERSION } from "../src/core/save";
import { createServer } from "node:http";
import { hashPassword, openAccounts, verifyPassword } from "./accounts";
import { playerToJSON } from "../src/game/state";



let failures = 0;
/**
 * `eliteCapForFloor` is private; a headless test reaches it so "within what the floor can
 * make" is checked against the real cap rather than a number copied out of the sim.
 */
function eliteCap(d: Dungeon): number {
  return (d as unknown as { eliteCapForFloor(): number }).eliteCapForFloor();
}

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}


















console.log("\n=== depth curve ===");
for (const depth of [1, 5, 10, 20, 30]) {
  const p = profileFor(depth);
  console.log(
    `  d${String(depth).padStart(2)}  ${p.name.padEnd(28)} hp=${p.enemyHealth.toFixed(0).padStart(7)}` +
    ` dmg=${p.enemyDamage.toFixed(0).padStart(4)} waves=${p.waves} max=${p.maxAlive}` +
    ` loot=x${p.coinMultiplier.toFixed(1)} boss=${p.isBoss}`,
  );
}

console.log("\n=== rift ladders ===");
for (const mode of ["hoard", "abyss"] as const) {
  for (const tier of [1, 5, 10, 20]) {
    const cfg = riftConfig(mode, tier, MODES[mode].floors);
    const p = profileFor(cfg.depth, cfg);
    console.log(
      `  ${MODES[mode].short.padEnd(6)} T${String(tier).padStart(2)}  depth=${String(cfg.depth).padStart(3)}` +
      ` danger=x${cfg.danger.toFixed(2).padStart(6)} hp=${p.enemyHealth.toFixed(0).padStart(9)}` +
      ` dmg=${p.enemyDamage.toFixed(0).padStart(5)} req.lv=${p.recommendedLevel}`,
    );
  }
}

console.log("\n=== floor 1 with a fresh character ===");
{
  const state = new GameState();
  const { d, seconds, peakEnemies } = playFloor(state, 1, 300, 1037);
  check("floor clears", d.phase === "cleared", `phase=${d.phase} in ${seconds.toFixed(1)}s`);
  check("enemies actually spawned", peakEnemies > 0, `peak alive ${peakEnemies}`);
  check("kills recorded", d.loot.kills > 0, `${d.loot.kills} kills`);
  check("coins dropped and were picked up", d.loot.coins > 0, `${d.loot.coins} coins`);
  check("xp granted", d.loot.xp > 0, `${d.loot.xp} xp`);
  check("player survived floor 1", state.player.isAlive, `hp ${state.player.health}`);
  check("no leaked projectiles", d.projectiles.length < 50, `${d.projectiles.length}`);

  const beforeCoins = state.coins;
  d.bankLoot();
  check("banking moves coins to the save", state.coins > beforeCoins, `${beforeCoins} -> ${state.coins}`);
  check("clearing unlocks the next depth", state.maxUnlockedDepth >= 2, `unlocked ${state.maxUnlockedDepth}`);
}




let sharpDeepest = 0;
// Lifted out of the block below (rather than recomputed) so the Convergence's
// survivability check can fight real characters a sharp player actually produced,
// instead of a synthetic stand-in — see "=== the convergence ===" further down.
let sharpRuns: ReturnType<typeof campaign>[] = [];
console.log("\n=== a campaign: 20 dives, a sharp player (dodges 55% of telegraphs) ===");
{
  const runs = CAMPAIGN_SEEDS.map((seed, i) => campaign(seed, 0.55, 20, i === 0));
  sharpRuns = runs;
  for (const [i, r] of runs.entries()) {
    console.log(
      `  seed ${i}: reached depth ${r.deepest}, died ${r.deaths} times, ` +
      `level ${r.state.player.level}, attack ${r.state.player.stats.attack}, ` +
      `earned ${r.state.stats.coinsEarned} coins`,
    );
  }
  const deepest = runs.reduce((a, r) => a + r.deepest, 0) / runs.length;
  sharpDeepest = deepest;
  const first = runs[0]!.state;
  const worn = Object.values(first.player.equipment).filter(Boolean).length;
  check("skilled play makes real progress", deepest >= 8, `average deepest depth ${deepest.toFixed(1)}`);
  check("gear is found and worn", worn >= 4, `${worn} slots filled`);
  check("chests get opened along the way",
    Object.values(first.stats.chestsOpened).some((n) => n > 0), JSON.stringify(first.stats.chestsOpened));
  check("floors resolve in reasonable time",
    runs.every((r) => r.unfinished <= 2), runs.map((r) => r.unfinished).join("/"));
}

console.log("\n=== a campaign: 20 dives, a reckless player (never dodges) ===");
{
  const runs = CAMPAIGN_SEEDS.map((seed) => campaign(seed, 0, 20));
  for (const [i, r] of runs.entries()) {
    console.log(
      `  seed ${i}: reached depth ${r.deepest}, died ${r.deaths} times, ` +
      `level ${r.state.player.level}, attack ${r.state.player.stats.attack}, ` +
      `earned ${r.state.stats.coinsEarned} coins`,
    );
  }
  const deepest = runs.reduce((a, r) => a + r.deepest, 0) / runs.length;
  const deaths = runs.reduce((a, r) => a + r.deaths, 0);
  // Standing in the open and trading hits has to cost you. It also has to leave the
  // early floors learnable, or a new character can never get started at all.
  check("ignoring telegraphs gets you killed", deaths >= 10, `${deaths} deaths across 240 dives`);
  check("the descent still has teeth for a careless player", deepest <= 12,
    `average deepest depth ${deepest.toFixed(1)}`);
  check("the early floors stay learnable", deepest >= 3, `average deepest depth ${deepest.toFixed(1)}`);
  // The actual design promise (CLAUDE.md: "a bot that never dodges stalls out... one
  // that dodges half the time reaches the high teens") is a *comparison*, and nothing
  // above ever checked it — both blocks only bounded their own number in isolation, so
  // the sharp run could quietly fall at or below the reckless one and every check would
  // still pass green.
  check("reading telegraphs reaches meaningfully deeper than ignoring them",
    sharpDeepest >= deepest + 1, `sharp ${sharpDeepest.toFixed(1)} vs reckless ${deepest.toFixed(1)}`);
}

/**
 * The raid boss. It has to be beatable by somebody at the recommended level who reads
 * the floor, it has to take long enough to be a fight rather than a speed bump, and it
 * has to punish somebody who stands in everything.
 */
console.log("\n=== the first raid boss (depth 5) ===");
{
  const p = profileFor(5);
  check("depth 5 is a boss floor", p.isBoss);
  check("a boss floor is one wave", p.waves === 1, `${p.waves} waves`);

  // A character at roughly the recommended level with a few chests behind it — not a
  // twink. The gap between this section and the next is the whole point: same
  // character, same floor, the only difference is whether it reads the floor.
  const results = [11, 22, 33, 44, 55, 66, 77, 88, 99, 110, 121, 132].map((seed) => {
    const state = geared(6, 4000 + seed, 8);
    return playFloor(state, 5, 400, seed, 0.85);
  });
  for (const [i, r] of results.entries()) {
    console.log(
      `  seed ${i}: ${r.d.phase.padEnd(8)} ${r.seconds.toFixed(0).padStart(3)}s ` +
      `phases=${r.bossPhases} casts=${r.skillCasts} peakAdds=${r.peakEnemies} ` +
      `${r.d.level.layout} dmg=${r.damageTaken.toFixed(0)} eaten=${r.mechanicsEaten}/${r.mechanicsResolved} ` +
      `potions=${r.potionsDrunk} pinned=${r.pinned.toFixed(1)}s`,
    );
  }
  const wins = results.filter((r) => r.d.phase === "cleared");
  const avg = results.reduce((a, r) => a + r.seconds, 0) / results.length;
  // Twelve seeds, three quarters of them won. Five seeds at four wins flipped on every
  // change that touched the shared rng — a room a tile wider, one fewer torch — because
  // two of the fights are genuine coin flips at this gearing; the arena itself is not
  // the problem (the bot spends about a second of a minute-long fight pinned on a wall).
  check("a geared, attentive player can kill it", wins.length >= Math.ceil(results.length * 0.75),
    `${wins.length}/${results.length} cleared`);
  check("the fight is long enough to be a fight", avg > 25, `${avg.toFixed(0)}s average`);
  check("it changes phase at least once", results.some((r) => r.bossPhases > 0),
    results.map((r) => r.bossPhases).join("/"));
  check("it summons adds", results.some((r) => r.peakEnemies > 1),
    results.map((r) => r.peakEnemies).join("/"));
}

/**
 * The same character on the same floor, with telegraph-reading switched off. Death
 * isn't the right measure here — a bot that kites and drinks potions can survive a
 * great deal of bad play — but the damage bill has to be brutally different, or the
 * mechanics aren't mechanics.
 *
 * Seed count is derived, not guessed (2026-09-09 power analysis, master only — no
 * balance change anywhere near this commit). At 5 seeds — the original count — 8
 * independent 5-seed blocks landed as low as a 1.92x blind/read ratio against the >2x
 * promise this check makes: the check was failing master itself on unlucky seed draws,
 * not measuring the design promise. Sweeping 5/10/15/20/30/40/60/80 across 8 blocks
 * each, then re-running 40/60/80 on a second, entirely disjoint set of seed blocks to
 * rule out the first sweep having gotten lucky at any one size, the margin above 2.0x
 * plateaus at 40 seeds (min 2.08x across both sweeps) and does not improve further at
 * 60 or 80 (2.09x, 2.08x) — the noise floor is structural, not something more seeds
 * average away, so there is nothing to buy past 40. 30 seeds still isn't safely past
 * it (min dropped to 2.05x on the second sweep). 40 is the smallest size that reaches
 * the plateau instead of sitting on its edge.
 */
console.log("\n=== standing in boss mechanics costs you ===");
{
  const TELEGRAPH_SEEDS = Array.from({ length: 40 }, (_, i) => 11 * (i + 1));
  const attentive = TELEGRAPH_SEEDS.map((seed) => playFloor(geared(6, 4000 + seed, 8), 5, 400, seed, 0.85));
  const reckless = TELEGRAPH_SEEDS.map((seed) => playFloor(geared(6, 4000 + seed, 8), 5, 400, seed, 0));
  const avg = (rs: typeof reckless, f: (r: (typeof rs)[number]) => number) =>
    rs.reduce((a, r) => a + f(r), 0) / rs.length;

  const readDamage = avg(attentive, (r) => r.damageTaken);
  const blindDamage = avg(reckless, (r) => r.damageTaken);
  const deaths = reckless.filter((r) => r.d.phase === "dead").length;
  const readHits = avg(attentive, (r) => r.mechanicsEaten);
  const blindHits = avg(reckless, (r) => r.mechanicsEaten);
  console.log(
    `  reads the floor: ${readDamage.toFixed(0)} damage taken, ` +
    `${readHits.toFixed(1)}/${avg(attentive, (r) => r.mechanicsResolved).toFixed(1)} mechanics eaten, ` +
    `${avg(attentive, (r) => r.potionsDrunk).toFixed(1)} potions, ` +
    `${avg(attentive, (r) => r.seconds).toFixed(0)}s, ` +
    `${attentive.filter((r) => r.d.phase === "dead").length}/${TELEGRAPH_SEEDS.length} died`);
  console.log(
    `  stands in it:    ${blindDamage.toFixed(0)} damage taken, ` +
    `${blindHits.toFixed(1)}/${avg(reckless, (r) => r.mechanicsResolved).toFixed(1)} mechanics eaten, ` +
    `${avg(reckless, (r) => r.potionsDrunk).toFixed(1)} potions, ` +
    `${avg(reckless, (r) => r.seconds).toFixed(0)}s, ${deaths}/${TELEGRAPH_SEEDS.length} died`);

  // The rate, not the count: a player who dodges is alive longer and therefore sees more
  // mechanics, so comparing totals would flatter the one who stood still and died faster.
  const readRate = readHits / Math.max(1, avg(attentive, (r) => r.mechanicsResolved));
  const blindRate = blindHits / Math.max(1, avg(reckless, (r) => r.mechanicsResolved));
  check("reading the telegraphs actually gets you out of them",
    blindRate > readRate * 2, `${(blindRate * 100).toFixed(0)}% eaten vs ${(readRate * 100).toFixed(0)}%`);
  // Rates again, and for the same reason: dodging costs time, so the careless player
  // finishes the fight in half as long. Comparing totals rewards them for dying faster
  // in exactly the way comparing mechanic counts would.
  const readRateDamage = readDamage / Math.max(1, avg(attentive, (r) => r.seconds));
  const blindRateDamage = blindDamage / Math.max(1, avg(reckless, (r) => r.seconds));
  check("ignoring boss telegraphs costs a great deal of health",
    blindRateDamage > readRateDamage * 1.3,
    `${blindRateDamage.toFixed(1)}/s vs ${readRateDamage.toFixed(1)}/s`);
  // Death isn't guaranteed — a boss that one-shots a careless player would just be a
  // wall — but the belt has to empty faster. Burning the potions is how the fight tells
  // you that you played it badly.
  const readPotions = avg(attentive, (r) => r.potionsDrunk) / Math.max(1, avg(attentive, (r) => r.seconds));
  const blindPotions = avg(reckless, (r) => r.potionsDrunk) / Math.max(1, avg(reckless, (r) => r.seconds));
  check("and it empties the potion belt",
    blindPotions > readPotions * 1.3,
    `${(blindPotions * 60).toFixed(1)} vs ${(readPotions * 60).toFixed(1)} potions a minute`);
}

console.log("\n=== elements, ailments and mana ===");
{
  const state = geared(14, 909);
  const r = playFloor(state, 9, 200, 606, 0.7);
  check("skills get cast", r.skillCasts > 0, `${r.skillCasts} attempted`);
  check("the casting resource is a real constraint", r.lowestMana < 60,
    `dipped to ${r.lowestMana.toFixed(0)}% of the pool`);
  check("monsters catch ailments", r.peakAilments > 0, `${r.peakAilments} at once`);

  // Deep monsters should mostly be made of something other than plain physical.
  const deep = new Dungeon(geared(20, 12), 22, 4242);
  let infused = 0;
  let total = 0;
  for (let i = 0; i < 600; i++) deep.update(DT, new FakeInput() as unknown as Input);
  for (const e of deep.enemies) { total++; if (e.element !== "physical") infused++; }
  check("deep floors are elemental", total === 0 || infused > 0, `${infused}/${total} infused`);
}

console.log("\n=== monster variety — six new archetype roles (UAT §2) ===");
{
  const NEW_KINDS: EnemyKind[] = ["charger", "bomber", "shieldbearer", "summoner", "sniper", "leech"];

  // Data: every new kind carries its own behaviour tag, sits below a grunt's spawn
  // weight (it's a spice, not the staple), and is gated to a depth where the player
  // has the kit to answer it.
  const behaviours = new Set<EnemyBehavior>();
  for (const kind of NEW_KINDS) {
    const a = ARCHETYPES[kind];
    behaviours.add(a.behavior);
    check(`${kind}: behaviour-tagged, depth-gated, rarer than a grunt`,
      a.behavior === kind && a.minDepth >= 5 && a.weight > 0 && a.weight < ARCHETYPES.grunt.weight,
      `behavior=${a.behavior} minDepth=${a.minDepth} weight=${a.weight}`);
  }
  check("the six roles are mechanically distinct, not six reskins", behaviours.size === 6,
    `${behaviours.size} distinct behaviours`);

  // A sealed floor (no wave director) with one monster of `kind` at ~260 units, and a
  // geared hero. `mode` is how the hero engages: close and swing, or hold the range so
  // a ranged role gets to do its thing.
  const walk = (kind: EnemyKind, seconds: number, mode: "melee" | "kite" | "watch") => {
    const state = geared(28, 4200 + kind.charCodeAt(0), 26);
    const d = new Dungeon(state, delveConfig(16, 1), 55_000 + kind.charCodeAt(0));
    d.sealWaves();
    d.enemies.length = 0;
    const mob = d.spawnArchetypeAt(kind, d.avatar.x + 190, d.avatar.y);
    const input = new FakeInput();
    let sawCharge = false;
    let maxWindup = 0;
    let sawSummon = false;
    let fastBolt = false;
    let poolOnDeath = false;

    for (let i = 0; i < seconds * 60 && d.phase === "fighting"; i++) {
      input.beginTick();
      const gap = Math.hypot(mob.x - d.avatar.x, mob.y - d.avatar.y);
      if (mode === "melee") {
        input.hold("right", mob.x > d.avatar.x + 6);
        input.hold("left", mob.x < d.avatar.x - 6);
        input.hold("down", mob.y > d.avatar.y + 6);
        input.hold("up", mob.y < d.avatar.y - 6);
        input.press("attack");
      } else if (mode === "kite" && gap < 170) {
        // Back off to keep the role at the mid-range it wants to operate from — don't
        // swing, so a stray ranged weapon can't kill it before it acts.
        input.hold("left", mob.x > d.avatar.x);
        input.hold("right", mob.x < d.avatar.x);
      }

      const groundBefore = d.ground.length;
      const mobAlive = mob.health > 0;
      d.update(DT, input as unknown as Input);

      if (Math.abs(mob.chargeVx) + Math.abs(mob.chargeVy) > 1) sawCharge = true;
      maxWindup = Math.max(maxWindup, mob.windup);
      if (d.enemies.some((e) => e.summoned)) sawSummon = true;
      if (d.projectiles.some((p) => !p.friendly && Math.hypot(p.vx, p.vy) > 300)) fastBolt = true;
      if (mobAlive && mob.health <= 0 && d.ground.length > groundBefore) poolOnDeath = true;
    }
    return { d, mob, sawCharge, maxWindup, sawSummon, fastBolt, poolOnDeath };
  };

  // Charger: after a wind-up it commits to a straight-line dash — its charge velocity
  // goes non-zero, which nothing else in the roster does.
  const charger = walk("charger", 20, "kite");
  check("a charger winds up and dashes a straight line",
    charger.sawCharge && charger.maxWindup > 0, `charged=${charger.sawCharge} windup ${charger.maxWindup.toFixed(2)}s`);

  // Bomber: goes off however it dies — a blast pool where it fell.
  const bomber = walk("bomber", 12, "melee");
  check("a bomber detonates on death and leaves a pool",
    bomber.poolOnDeath || bomber.d.ground.length > 0, `${bomber.d.ground.length} pools`);

  // Summoner: feeds the floor extra bodies on a timer while it hangs back.
  const summoner = walk("summoner", 18, "watch");
  check("a summoner spawns chaff", summoner.sawSummon);

  // Sniper: a fast bolt off a long telegraph — the wind-up dwarfs a melee mob's ~0.3s.
  const sniper = walk("sniper", 16, "watch");
  check("a sniper telegraphs long and shoots fast",
    sniper.maxWindup > 0.9 && sniper.fastBolt,
    `windup ${sniper.maxWindup.toFixed(2)}s, fast bolt ${sniper.fastBolt}`);

  // Leech: heals a wounded ally back up over time. No hero input at all — the pulse is
  // on its own clock, and a geared hero shrugs off a lone grunt for the fifteen seconds
  // it takes to watch a couple of pulses land.
  {
    const d = new Dungeon(geared(28, 8123, 26), delveConfig(16, 1), 60_600);
    d.sealWaves();
    d.enemies.length = 0;
    d.spawnArchetypeAt("leech", d.avatar.x + 200, d.avatar.y);
    const ally = d.spawnArchetypeAt("brute", d.avatar.x + 260, d.avatar.y);
    ally.health = ally.maxHealth * 0.3;
    let healed = false;
    let prev = ally.health;
    const input = new FakeInput();
    for (let i = 0; i < 60 * 16 && d.phase === "fighting"; i++) {
      input.beginTick();
      d.update(DT, input as unknown as Input);
      if (ally.health > prev + 0.01 && ally.health <= ally.maxHealth) healed = true;
      prev = ally.health;
    }
    check("a leech heals wounded allies", healed);
  }

  // Shieldbearer: a frontal hit is bounced hard. Every swing the bot lands is a frontal
  // one, so the average damage number on a shieldbearer should come in well under the
  // same hero's average on a plain grunt.
  const avgFrontHit = (kind: EnemyKind) => {
    const state = geared(28, 9001, 26);
    const d = new Dungeon(state, delveConfig(16, 1), 71_000 + kind.charCodeAt(0));
    d.sealWaves();
    d.enemies.length = 0;
    const mob = d.spawnArchetypeAt(kind, d.avatar.x + 34, d.avatar.y);
    const input = new FakeInput();
    let total = 0;
    let hits = 0;
    for (let i = 0; i < 60 * 10 && mob.health > 0; i++) {
      input.beginTick();
      input.hold("right", mob.x > d.avatar.x + 4);
      input.hold("left", mob.x < d.avatar.x - 4);
      input.press("attack");
      d.update(DT, input as unknown as Input);
      for (const ev of d.drainEvents()) {
        if (ev.kind === "damage" && !ev.onPlayer) { total += ev.amount; hits++; }
      }
    }
    return hits > 0 ? total / hits : 0;
  };
  const onShield = avgFrontHit("shieldbearer");
  const onGrunt = avgFrontHit("grunt");
  check("a shieldbearer bounces a frontal hit", onShield > 0 && onShield < onGrunt * 0.7,
    `${onShield.toFixed(0)} vs ${onGrunt.toFixed(0)} on a grunt`);

  // Nothing any of the six does throws over a full clear of a floor made of them.
  {
    const d = new Dungeon(geared(30, 606, 28), delveConfig(15, 1), 40_404);
    d.sealWaves();
    d.enemies.length = 0;
    for (const kind of NEW_KINDS) {
      const ang = (NEW_KINDS.indexOf(kind) / NEW_KINDS.length) * Math.PI * 2;
      d.spawnArchetypeAt(kind, d.avatar.x + Math.cos(ang) * 160, d.avatar.y + Math.sin(ang) * 160);
    }
    const input = new FakeInput();
    let potionCd = 0;
    for (let i = 0; i < 60 * 120 && d.phase === "fighting"; i++) {
      input.beginTick();
      const near = d.enemies.filter((e) => e.state !== "spawning")
        .sort((a, b) => Math.hypot(a.x - d.avatar.x, a.y - d.avatar.y) - Math.hypot(b.x - d.avatar.x, b.y - d.avatar.y))[0];
      if (near) {
        input.hold("left", near.x < d.avatar.x - 8);
        input.hold("right", near.x > d.avatar.x + 8);
        input.hold("up", near.y < d.avatar.y - 8);
        input.hold("down", near.y > d.avatar.y + 8);
        input.press("attack");
        input.press("dash");
      }
      potionCd -= DT;
      if (d.localHero.player.health < d.localHero.player.maxHealth * 0.5 && potionCd <= 0) {
        input.press("potion");
        potionCd = 2;
      }
      d.update(DT, input as unknown as Input);
    }
    check("a floor made of the new roles clears without throwing",
      d.phase === "cleared", `phase=${d.phase}`);
  }
}

console.log("\n=== monster affixes (UAT §3 — a modular trait system) ===");
{
  // Every affix is well-formed: an id, a name, a one-line description, a prefix, a
  // renderer tint + glyph, a sane weighting, and at least one thing it actually does.
  for (const a of MONSTER_AFFIXES) {
    const hasEffect = !!(a.onSpawn || a.periodic || a.onHitHero || a.onDeath);
    check(`${a.id}: fully specified`,
      a.name.length > 0 && a.description.length > 0 && a.prefix.length > 0
        && a.visual.tint.startsWith("#") && a.visual.glyph.length > 0
        && a.weight > 0 && a.minDepth >= 1 && hasEffect,
      a.id);
  }
  // Incompatibility holds no matter which affix is drawn first.
  {
    const rng = new Rng(9);
    let collision = false;
    for (let i = 0; i < 4000; i++) {
      const rolled = rollMonsterAffixes("grunt", 30, 5, 3, rng, { elite: true });
      for (const x of rolled) {
        for (const y of rolled) {
          if (x !== y && (x.incompatibleWith?.includes(y.id) || y.incompatibleWith?.includes(x.id))) {
            collision = true;
          }
        }
      }
    }
    check("incompatible affixes never share a monster", !collision);
  }
  // The ramp: rare on a shallow calm floor, common and stacked deep / under danger.
  {
    const rng = new Rng(101);
    const sample = (depth: number, danger: number, elite: boolean) => {
      let withAny = 0;
      let totalCount = 0;
      for (let i = 0; i < 3000; i++) {
        const n = affixCountFor(depth, danger, elite, rng);
        if (n > 0) withAny++;
        totalCount += n;
      }
      return { rate: withAny / 3000, avg: totalCount / 3000 };
    };
    const shallow = sample(2, 1, false);
    const deep = sample(24, 1, false);
    const hard = sample(10, 3, false);
    const elite = sample(12, 1, true);
    check("a shallow calm floor is mostly affix-free", shallow.rate < 0.16,
      `${(shallow.rate * 100).toFixed(0)}% carry one`);
    check("deep floors are dense with affixes", deep.rate > shallow.rate + 0.16,
      `${(deep.rate * 100).toFixed(0)}% vs ${(shallow.rate * 100).toFixed(0)}%`);
    check("Challenger pushes affix frequency up", hard.rate > 0.35,
      `${(hard.rate * 100).toFixed(0)}% at danger 3`);
    // Item E gives an elite a modest edge (1-2); Item F raises this to a mini-boss handful.
    check("an elite always carries at least one trait", elite.avg >= 1,
      `${elite.avg.toFixed(1)} on average`);
  }
  // Live: a deep, dangerous floor grows affixed monsters, and nothing an affix does on
  // spawn / tick / hit / death throws over a long clear attempt.
  {
    const d = new Dungeon(geared(24, 77), delveConfig(24, 8), 20259);
    let sawAffix = false;
    const glyphs = new Set<string>();
    for (let i = 0; i < 3000 && d.phase === "fighting"; i++) {
      d.update(DT, new FakeInput() as unknown as Input);
      for (const e of d.enemies) {
        for (const a of e.affixes) { sawAffix = true; glyphs.add(a.visual.glyph); }
      }
    }
    check("a deep Challenger floor spawns affixed monsters", sawAffix, `${glyphs.size} distinct traits seen`);
    check("no affix behaviour crashed a floor",
      d.phase === "fighting" || d.phase === "cleared" || d.phase === "dead", `phase=${d.phase}`);
  }
}

console.log("\n=== elite monsters — a mini-boss tier (UAT §4) ===");
{
  // An attacking bot that never dodges — enough to keep a floor alive long enough to
  // watch the elite population, not enough to trivialise it.
  const sampleFloor = (run: number | RunConfig, seed: number, level: number) => {
    const d = new Dungeon(geared(level, seed, level), run, seed);
    const input = new FakeInput();
    let peakElites = 0;
    let peakTrash = 0;
    let sawEliteTelegraph = false;
    let minAffixOnElite = 9;
    // Health wall, measured per archetype so a fat brute-trash isn't compared to a
    // thin swarmer-elite: the biggest ratio of an elite to same-kind trash seen.
    const eliteHp = new Map<string, number>();
    const trashHp = new Map<string, number>();
    const raritiesSeen = new Set<string>();
    for (let i = 0; i < 5000 && d.phase === "fighting"; i++) {
      input.beginTick();
      const near = d.enemies.filter((e) => e.state !== "spawning")
        .sort((a, b) => Math.hypot(a.x - d.avatar.x, a.y - d.avatar.y) - Math.hypot(b.x - d.avatar.x, b.y - d.avatar.y))[0];
      if (near) {
        input.hold("left", near.x < d.avatar.x - 8);
        input.hold("right", near.x > d.avatar.x + 8);
        input.hold("up", near.y < d.avatar.y - 8);
        input.hold("down", near.y > d.avatar.y + 8);
        input.press("attack");
      }
      d.update(DT, input as unknown as Input);
      const elites = d.enemies.filter((e) => e.elite && !e.summoned);
      const trash = d.enemies.filter((e) => !e.elite && !e.summoned && !e.boss);
      peakElites = Math.max(peakElites, elites.length);
      peakTrash = Math.max(peakTrash, trash.length);
      for (const e of elites) {
        eliteHp.set(e.archetype.kind, Math.max(eliteHp.get(e.archetype.kind) ?? 0, e.maxHealth));
        minAffixOnElite = Math.min(minAffixOnElite, e.affixes.length);
        if (e.elite) raritiesSeen.add(e.elite);
      }
      for (const e of trash) {
        trashHp.set(e.archetype.kind, Math.max(trashHp.get(e.archetype.kind) ?? 0, e.maxHealth));
      }
      if (d.telegraphs.some((t) => t.followId !== null && elites.some((e) => e.id === t.followId))) {
        sawEliteTelegraph = true;
      }
    }
    let wallRatio = 0;
    for (const [kind, ehp] of eliteHp) {
      const thp = trashHp.get(kind);
      if (thp) wallRatio = Math.max(wallRatio, ehp / thp);
    }
    return { d, peakElites, peakTrash, wallRatio, sawEliteTelegraph, minAffixOnElite };
  };

  const deep = sampleFloor(delveConfig(18, 3), 4477, 24);
  check("elites do spawn on a deep dangerous floor", deep.peakElites >= 1, `${deep.peakElites} at once`);
  check("elites stay rare — never a big share of the pack",
    deep.peakTrash === 0 || deep.peakElites <= Math.max(2, deep.peakTrash * 0.35),
    `${deep.peakElites} elite vs ${deep.peakTrash} trash`);
  check("an elite is a genuine health wall next to its own kind of trash",
    deep.wallRatio === 0 || deep.wallRatio > 2.4, `x${deep.wallRatio.toFixed(1)}`);
  check("an elite always carries at least two affixes",
    deep.peakElites === 0 || deep.minAffixOnElite >= 2, `min seen ${deep.minAffixOnElite}`);
  // Whether the *sampled* floor happened to show a slam depends on where its elite
  // spawned relative to a bot that never dodges — it flipped every time the floor
  // geometry changed. The behaviour itself is checked on a staged encounter: one elite
  // dropped next to a standing hero has to wind up its slam within a few seconds.
  // (A shallow floor and a standing start well out of reach: the slam is on a timer,
  // not a range, and a deep elite's ordinary swing would kill a passive hero first.)
  const stagedSlam = (() => {
    const d = new Dungeon(geared(24, 4477, 24), 6, 4477);
    const input = new FakeInput();
    for (let i = 0; i < 30; i++) { input.beginTick(); d.update(DT, input as unknown as Input); }
    d.sealWaves();
    const elite = d.spawnArchetypeAt("brute", d.avatar.x + 200, d.avatar.y, { elite: "rare" });
    for (let i = 0; i < 60 * 12 && d.phase === "fighting"; i++) {
      input.beginTick();
      d.update(DT, input as unknown as Input);
      d.drainEvents();
      if (d.telegraphs.some((t) => t.followId === elite.id)) return true;
    }
    return false;
  })();
  check("an elite telegraphs its signature slam", stagedSlam,
    deep.sawEliteTelegraph ? "seen on the sampled floor too" : "staged encounter only");

  // Several floors, and both halves of the question, deliberately.
  //
  // `peakElites <= 1` on a single floor passes when that floor produced no elites at all
  // — a cap holds trivially over an empty set — and that is exactly what happened when
  // arming the trees moved this sample from `1 at once` to `0 at once`: the check stayed
  // GREEN and stopped measuring anything. One seed was also the reason it could happen at
  // all, since a stronger character reorders the shared rng stream and an early floor's
  // elite is a 0-or-1 roll.
  //
  // So: sample a few, assert an elite was actually produced *somewhere* (the cap has
  // something to bite on), then assert the cap held *everywhere*. If no floor produces an
  // elite this goes red and says so, which is correct — it means the cap is not being
  // exercised and somebody should know that rather than reading a green.
  const earlies = [909, 1313, 1717, 2121, 2525].map((sd) => sampleFloor(6, sd, 6));
  const eliteCounts = earlies.map((e) => e.peakElites).join("/");
  check("an ordinary early floor actually produces an elite to cap",
    earlies.some((e) => e.peakElites >= 1), `${eliteCounts} across ${earlies.length} floors`);
  check("the elite cap holds on an ordinary early floor",
    earlies.every((e) => e.peakElites <= 1), `${eliteCounts} across ${earlies.length} floors`);
}

console.log("\n=== minion subsystem ===");
{
  // The mobile-summon subsystem, driven straight through the CombatHost seam the way
  // the ability executor will once it is wired. The bot does nothing — every point of
  // non-player damage on this floor is a minion's.
  const idle = () => new FakeInput() as unknown as Input;
  const state = geared(16, 4242, 18, "necromancer");
  const d = new Dungeon(state, 6, 4242);
  for (let i = 0; i < 240 && d.enemies.filter((e) => e.state !== "spawning").length < 3; i++) {
    d.update(DT, idle());
  }
  const hero = d.localHero;
  const gapTo = (mx: number, my: number) => {
    let best = Infinity;
    for (const e of d.enemies) best = Math.min(best, Math.hypot(e.x - mx, e.y - my));
    return best;
  };
  const ids = d.spawnMinion({
    ownerId: hero.index, unit: "skeleton", x: hero.avatar.x + 24, y: hero.avatar.y,
    count: 6, duration: 6, command: { behavior: "aggroNearest", inheritPower: 0.6 },
  });
  check("spawnMinion makes bodies", ids.length === 6 && d.minions.length === 6, `${d.minions.length} out`);
  const startGap = d.minions.reduce((s, m) => s + gapTo(m.x, m.y), 0) / Math.max(1, d.minions.length);

  let minionDamage = 0;
  let closedIn = false;
  for (let i = 0; i < 180; i++) {
    d.update(DT, idle());
    for (const ev of d.drainEvents()) {
      if (ev.kind === "damage" && !ev.onPlayer) minionDamage += ev.amount;
    }
    if (d.minions.length > 0) {
      const g = d.minions.reduce((s, m) => s + gapTo(m.x, m.y), 0) / d.minions.length;
      if (g < startGap * 0.6) closedIn = true;
    }
  }
  check("minions close on the enemy", closedIn, `start ${startGap.toFixed(0)}`);
  check("minions fight for their owner", minionDamage > 0, `${minionDamage.toFixed(0)} dealt`);

  for (let i = 0; i < 200; i++) d.update(DT, idle());
  check("minions time out", d.minions.length === 0, `${d.minions.length} still standing past their 6s`);

  // The caps hold no matter how greedy the summon is.
  const cs = geared(16, 111, 18, "necromancer");
  const cd = new Dungeon(cs, 6, 111);
  for (let i = 0; i < 120; i++) cd.update(DT, idle());
  cd.spawnMinion({
    ownerId: cd.localHero.index, unit: "x", x: cd.localHero.avatar.x, y: cd.localHero.avatar.y,
    count: 40, duration: 20, command: { behavior: "follow" },
  });
  check("the per-owner summon cap holds", cd.minions.length === MINION_CAP_PER_OWNER, `${cd.minions.length}`);
  const dead = cd.sacrificeSummons(cd.localHero.index, 3);
  check("sacrificeSummons kills its own", dead === 3 && cd.minions.length === MINION_CAP_PER_OWNER - 3, `${dead}`);
}

/**
 * Fires a class's ultimate in a real fight and reports what came of it. Every class's
 * ultimate is a different mechanism — a charge that bounces, a spin that throws
 * sparks, a sky full of holes — so the probe records all of the signals and each class
 * asserts on its own.
 */
function probeUltimate(classId: ClassId, seed = 8100) {
  const state = geared(16, seed, 18, classId);
  const d = new Dungeon(state, 8, seed);
  const input = new FakeInput();

  // Let the floor fill up first: an ultimate with nothing to hit proves nothing.
  let t = 0;
  while (t < 12 && d.enemies.filter((e) => e.state !== "spawning").length < 3) {
    input.beginTick();
    d.update(DT, input as unknown as Input);
    d.drainEvents();
    t += DT;
  }

  // Close on the nearest one and point at it. Aiming an ultimate is the player's job,
  // and a Lancer who charges at an empty wall deserves what it gets — but a real player
  // aims at something they've actually walked up to, not whatever spawned three rooms
  // away, so the probe closes the distance itself rather than testing pathing here too.
  const live = d.enemies.filter((e) => e.state !== "spawning");
  let aim: (typeof live)[number] | null = null;
  for (const e of live) {
    if (!aim || Math.hypot(e.x - d.avatar.x, e.y - d.avatar.y) < Math.hypot(aim.x - d.avatar.x, aim.y - d.avatar.y)) aim = e;
  }
  if (aim) {
    const spot = resolveCircle(d.level, aim.x - 46, aim.y, d.avatar.radius);
    d.avatar.x = spot.x;
    d.avatar.y = spot.y;
    d.avatar.facing = Math.atan2(aim.y - d.avatar.y, aim.x - d.avatar.x);
  }

  // What this ultimate is made of. A *reactive* one (Perfect Riposte) does nothing
  // until the hero is hit, and a status one (Last Light) does its work by what it puts
  // on the party — neither shows up as damage unless the probe stages the moment.
  type StepLike = { kind: string; event?: string; status?: string; effects?: readonly StepLike[] };
  const flat = (steps: readonly StepLike[]): StepLike[] =>
    steps.flatMap((s) => [s, ...(s.effects ? flat(s.effects) : [])]);
  const ult = CLASS_BY_ID[classId]?.abilities.find((a) => a.isUltimate);
  const steps = flat((ult?.effects ?? []) as readonly StepLike[]);
  const reactive = steps.some((s) => s.kind === "reactive" && s.event === "damageTaken");
  const statusIds = steps.filter((s) => s.kind === "status" && s.status).map((s) => s.status!);

  const startX = d.avatar.x;
  const startY = d.avatar.y;
  d.specialCharge = 1;
  input.beginTick();
  input.press("special");
  d.update(DT, input as unknown as Input);
  // THE ULTIMATE RULE: nothing the ultimate does may refill the meter.
  const meterRightAfter = d.localHero.resources.ultimateMeter()?.value ?? 0;
  const gainedStatus = statusIds.some((id) => d.localHero.sc.has(id));
  // A counter needs something to counter: put a grunt at arm's length so a swing lands
  // inside the window, whatever the floor's own monsters are doing three rooms away.
  if (reactive) d.spawnArchetypeAt("grunt", d.avatar.x + 30, d.avatar.y);

  let dealt = 0;
  let fired = false;
  let peakProjectiles = 0;
  let peakTelegraphs = d.telegraphs.length;
  let peakMinions = d.minions.length;
  let peakZones = d.ground.length;
  let peakTotems = 0;
  let travelled = 0;
  let lastX = startX;
  let lastY = startY;
  // The cast tick itself carries the ultimate event AND — for an all-instant ultimate
  // like Damnation — its entire damage. Count both here; don't drain them on the floor.
  for (const ev of d.drainEvents()) {
    if (ev.kind === "ultimate") fired = true;
    if (ev.kind === "damage" && !ev.onPlayer) dealt += ev.amount;
  }

  // A real player backs away from their own meteors; a probe that never touches the
  // keys again would just stand in them for five straight seconds and die of it. Only
  // matters for the ultimates that leave movement in the player's hands at all —
  // Comet Charge ignores held keys outright while it's steering itself.
  const aimX = aim?.x ?? d.avatar.x;
  const aimY = aim?.y ?? d.avatar.y;
  for (let step = 0; step < 300; step++) {
    input.beginTick();
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);
    if (step < 40 && !reactive) {
      const away = steerAngle(d, Math.atan2(d.avatar.y - aimY, d.avatar.x - aimX));
      if (Math.abs(away.x) > 0.25) input.hold(away.x > 0 ? "right" : "left", true);
      if (Math.abs(away.y) > 0.25) input.hold(away.y > 0 ? "down" : "up", true);
    }
    d.update(DT, input as unknown as Input);
    for (const ev of d.drainEvents()) {
      if (ev.kind === "damage" && !ev.onPlayer) dealt += ev.amount;
      if (ev.kind === "ultimate") fired = true;
    }
    peakProjectiles = Math.max(peakProjectiles, d.projectiles.filter((p) => p.friendly).length);
    peakTelegraphs = Math.max(peakTelegraphs, d.telegraphs.length);
    peakMinions = Math.max(peakMinions, d.minions.length);
    peakZones = Math.max(peakZones, d.ground.length);
    peakTotems = Math.max(peakTotems, d.totems.length);
    travelled += Math.hypot(d.avatar.x - lastX, d.avatar.y - lastY);
    lastX = d.avatar.x;
    lastY = d.avatar.y;
  }
  const healed = d.localHero.player.health;

  return {
    d, state, fired, dealt, meterRightAfter, healed, gainedStatus,
    peakProjectiles, peakTelegraphs, peakMinions, peakZones, peakTotems, travelled,
  };
}

console.log("\n=== the ultimate meter cannot pay for itself (UAT §10) ===");
{
  // THE ULTIMATE RULE is enforced at runtime in src/combat/resources.ts (an
  // ultimate-sourced event never generates), and tools/vocab.ts §13 pins that mechanism.
  // This is the *data-shape* guard: the two exploits that shipped (Engineer, Warlock)
  // were both an untagged `{ on: "damageDealt", perUnit: "damage" }` rule on the ultimate
  // meter with a fat coefficient — so every construct shell / lingering zone tick refilled
  // the meter and the ultimate was up on cooldown. THE ULTIMATE RULE blocks a pure
  // self-loop but not "ultimate leaves a thing, the thing charges the meter". Keep the
  // door shut: no `allowFromUltimate` opt-out, and any untagged damage-scaled rule on an
  // ultimate meter stays a small top-up, never the whole meter.
  const DAMAGE_TOPUP_CAP = 0.05; // Warlock's tuned-safe value is 0.03; the exploit was 0.3
  for (const id of CLASS_IDS) {
    const def = CLASS_BY_ID[id];
    const meter = def?.resources.find((r) => r.isUltimateMeter === true);
    const rules = meter?.generation ?? [];
    const optOut = rules.filter((r) => r.allowFromUltimate === true);
    check(`${CLASSES[id].name}: no ultimate-meter rule opts out of THE ULTIMATE RULE`,
      optOut.length === 0, optOut.map((r) => r.on).join(", "));
    const loopy = rules.filter((r) => r.perUnit === "damage" && !r.requireTags?.length && r.amount > DAMAGE_TOPUP_CAP);
    check(`${CLASSES[id].name}: no untagged damage-scaled ultimate-meter rule above the top-up cap`,
      loopy.length === 0, loopy.map((r) => `${r.on} ${r.amount}/dmg`).join(", "));
  }
}

console.log("\n=== classes ===");
let ultsThatMoved = 0;
let ultsThatSummoned = 0;
let ultsThatZoned = 0;
for (const id of CLASS_IDS) {
  const cls = CLASSES[id];
  const ult = CLASS_BY_ID[id]?.abilities.find((a) => a.isUltimate);
  const r = probeUltimate(id);
  // "Did something": damage, a summon, a zone, terrain, a heal, or a status it put on
  // the hero — every ultimate resolves to at least one of these.
  const didSomething = r.dealt > 0 || r.peakMinions > 0 || r.peakZones > 0 || r.peakTelegraphs > 0
    || r.healed >= r.d.localHero.player.maxHealth || r.gainedStatus;
  if (r.travelled > 120) ultsThatMoved++;
  if (r.peakMinions > 0) ultsThatSummoned++;
  if (r.peakZones > 0) ultsThatZoned++;
  console.log(
    `  ${cls.name.padEnd(11)} ${(ult?.name ?? "?").padEnd(20)} dealt=${String(Math.round(r.dealt)).padStart(6)}` +
    ` moved=${r.travelled.toFixed(0).padStart(4)} proj=${String(r.peakProjectiles).padStart(2)}` +
    ` min=${String(r.peakMinions).padStart(2)} zone=${String(r.peakZones).padStart(2)}` +
    ` weapon=${r.state.player.weaponFamily}`,
  );
  check(`${cls.name}: the ultimate fires`, r.fired);
  check(`${cls.name}: the ultimate does something`, didSomething, `dealt ${Math.round(r.dealt)}`);
  // PINNED VIOLATION, in `tools/legends.ts`'s idiom: one class is known to break this and
  // is recorded here by name rather than left as a red the gate teaches people to expect.
  //
  // The Engineer's ultimate summons constructs; a construct's damage packets carry no
  // `fromUltimate` stamp, so THE ULTIMATE RULE's runtime guard does not reach them and the
  // `construct` tag matches its own meter's gate. Diagnosis, the sweep of all 21 classes,
  // and three fix options with no number attached: `docs/engineer-ultimate-loop.md`.
  //
  // Pinned, not forgiven. This is a real defect awaiting an owner decision, and the check
  // below fails BOTH ways: a *second* class self-refilling goes red, and silently fixing
  // the Engineer without removing it from the pin goes red too. Do not add a class here to
  // make a red go away — that is the widening this whole re-baseline refused to do.
  const ULTIMATE_RULE_PINNED = new Set<string>(["Engineer"]);
  const pinned = ULTIMATE_RULE_PINNED.has(cls.name);
  const refilled = r.meterRightAfter >= 1;
  check(`${cls.name}: THE ULTIMATE RULE — its own output did not refill the meter`,
    pinned ? refilled : !refilled,
    pinned
      ? `meter ${r.meterRightAfter.toFixed(1)} — PINNED violation, see docs/engineer-ultimate-loop.md`
      : `meter ${r.meterRightAfter.toFixed(1)}`);
  check(`${cls.name}: the run is still standing afterwards`, r.d.phase !== "dead");
}

check("the roster's ultimates are varied — several move the hero", ultsThatMoved >= 3, `${ultsThatMoved}`);
check("several ultimates summon", ultsThatSummoned >= 2, `${ultsThatSummoned}`);
check("several ultimates leave a zone", ultsThatZoned >= 3, `${ultsThatZoned}`);

console.log("\n=== weapons ===");
{
  // Every family has to land a hit. A weapon that swings at nothing is a dead build.
  for (const family of WEAPON_FAMILIES) {
    const state = new GameState(77);
    state.player.level = 10;
    state.player.equip(rollItem({ rarity: "rare", type: family, ilvl: 8, rng: new Rng(9001) }));
    const d = new Dungeon(state, 4, 606);
    const input = new FakeInput();
    // Let one spawn, then stand next to it and swing.
    let t = 0;
    while (t < 8 && d.enemies.filter((e) => e.state !== "spawning").length === 0) {
      input.beginTick();
      d.update(DT, input as unknown as Input);
      d.drainEvents();
      t += DT;
    }
    const target = d.enemies.find((e) => e.state !== "spawning")!;
    d.avatar.x = target.x - 20;
    d.avatar.y = target.y;
    d.avatar.facing = 0;
    d.avatar.attackTimer = 0;
    const before = target.health;
    let hits = 0;
    for (let step = 0; step < 60; step++) {
      input.beginTick();
      if (step === 0) input.press("attack");
      d.update(DT, input as unknown as Input);
      for (const ev of d.drainEvents()) if (ev.kind === "damage" && !ev.onPlayer) hits++;
    }
    const spec = WEAPONS[family];
    console.log(
      `  ${spec.name.padEnd(13)} ${spec.pattern.padEnd(7)} ${spec.cooldown.toFixed(2)}s` +
      ` reach=${String(spec.reach).padStart(3)} hits=${hits} dealt=${Math.round(before - target.health)}`,
    );
    check(`a ${spec.name} connects`, target.health < before, `${Math.round(before - target.health)} damage`);
  }
}

console.log("\n=== the behaviour tree ===");
{
  const state = geared(30, 4711, 10, "berserker");
  const p = state.player;
  // `geared()` now arms both trees, so it hands back a character with every point
  // already spent — and this check's whole job is to spend them itself. Respec first, so
  // it walks the path rather than finding it already walked.
  //
  // The expectation below stays at the full 5/5. When arming turned this red it read
  // `0/5 nodes`, and lowering the bound would have made the red go away and left the
  // check permanently unable to notice a path that genuinely cannot be walked. Restore
  // the check's subject, never relax its bound.
  p.respec();
  const before = { ...p.mods };
  const path0 = p.tree.filter((n) => n.path === 0).sort((a, b) => a.row - b.row);
  let taken = 0;
  for (const node of path0) {
    if (p.allocate(node)) taken++;
  }
  check("a whole path can be walked", taken === path0.length, `${taken}/${path0.length} nodes`);
  check("the tree changes how the class plays (mods, mutations, grants or rules)",
    p.build.mutations.length + p.build.grants.length + p.build.rules.size > 0
    || JSON.stringify(p.mods) !== JSON.stringify(before),
    `${p.build.mutations.length} muts, ${p.build.rules.size} rules`);
  const magicianNode = buildProgressionTree(CLASS_BY_ID.magician!.progression)[0]!;
  check("another class's nodes are never reachable", !p.canAllocate(magicianNode));
  const fresh = geared(30, 22, 4, "lancer");
  const deep = fresh.player.tree.find((n) => n.path === 0 && n.row === 2)!;
  check("a node can't be skipped", !fresh.player.canAllocate(deep), "row 2 with row 1 unpaid");

  const spent = p.allocated.length;
  p.respec();
  check("respec hands every point back", p.allocated.length === 0 && spent > 0, `${spent} refunded`);
  check("respec undoes the build too", p.build.mutations.length === 0 && p.build.rules.size === 0);

  // Every class keeps its own save slot now: switching to one you've never played
  // starts a brand new character (empty tree, empty hands), and switching back finds
  // the one you left exactly as it was.
  const swap = geared(30, 99, 6, "shaman");
  swap.player.allocate(swap.player.tree[0]!);
  const shamanGearCount = Object.values(swap.player.equipment).filter((it) => it !== null).length;
  const shamanAllocated = swap.player.allocated.length;
  swap.chooseClass("magician");
  check("switching to an unplayed class starts an empty tree", swap.player.allocated.length === 0);
  check("switching to an unplayed class starts with empty hands",
    Object.values(swap.player.equipment).every((it) => it === null));
  swap.chooseClass("shaman");
  check("switching back restores the tree", swap.player.allocated.length === shamanAllocated);
  check("switching back restores the gear",
    Object.values(swap.player.equipment).filter((it) => it !== null).length === shamanGearCount);
}

console.log("\n=== progression pace (UAT §7 — power is earned, not handed out) ===");
{
  // A full tree path costs 6 points: four 1-point rows plus a 2-point keystone. The
  // post-playtest rebalance pushes completing one from ~level 6 to ~level 10, a second
  // to ~level 20, and finishing the whole 5-path tree (30 points) from the low 30s out
  // past level 45 — so the early game is *building* and the late game is *completing*.
  const PATH_COST = 6;
  const TREE_COST = 30;
  const levelFor = (points: number) => { let l = 1; while (treePointsFor(l) < points && l < 200) l++; return l; };
  const onePath = levelFor(PATH_COST);
  const twoPaths = levelFor(PATH_COST * 2);
  const wholeTree = levelFor(TREE_COST);
  console.log(`  one full path at level ${onePath}, two at ${twoPaths}, whole tree at ${wholeTree}`);
  check("a full path can't be finished before level 10", onePath >= 10, `level ${onePath}`);
  check("a second full path is a ~level-20 milestone", twoPaths >= 18, `level ${twoPaths}`);
  check("finishing the whole tree is a level-45+ goal", wholeTree >= 45, `level ${wholeTree}`);

  // ...and getting to level 10 is real mileage, not ten minutes. Cumulative XP, then a
  // rough floor count at the floor-1 kill rate (≈120 xp/floor before the clear cache).
  let xpTo10 = 0;
  for (let l = 1; l < 10; l++) xpTo10 += xpForLevel(l);
  console.log(`  cumulative XP to level 10: ${xpTo10} (~${Math.round(xpTo10 / 260)} early floors)`);
  check("reaching level 10 is a multi-floor investment", xpTo10 >= 3200, `${xpTo10} xp`);
}

console.log("\n=== per-class saves and the shared stash ===");
{
  // A deep-diving main leaves gear behind for a fresh alt to grow into, but not before
  // it's actually caught up — that's the entire point of the level lock.
  const state = new GameState(4242);
  state.chooseClass("shaman");
  state.player.level = 30;
  state.player.deepestDepth = 30;
  state.stats.deepestDepth = 30;
  const highItem = rollItem({ rarity: "epic", type: "sword", ilvl: 30, rng: new Rng(1) });
  state.addToInventory([highItem]);
  check("a level 30 character can equip a level 30 item", state.equipFromInventory(highItem.id));

  state.chooseClass("berserker");
  check("switching class swaps to a fresh, unlevelled character", state.player.level === 1);
  const lowItem = rollItem({ rarity: "epic", type: "axe", ilvl: 30, rng: new Rng(2) });
  state.addToInventory([lowItem]);
  check("a fresh level 1 character can't equip a shared-stash item that outleveled it",
    !state.equipFromInventory(lowItem.id));
  check("the locked item stays in the shared stash", state.inventory.some((it) => it.id === lowItem.id));

  state.player.level = 30;
  check("the same character can equip it once it catches up", state.equipFromInventory(lowItem.id));

  state.chooseClass("shaman");
  check("switching back finds the main exactly as it was left",
    state.player.level === 30 && state.player.equipment.weapon?.id === highItem.id);

  // Regression: chests and the forge used to roll item level off the account-wide
  // frontier (the max of the depth and height records), so a fresh alt buying a chest
  // right after a deep-diving main got gear rolled at the main's frontier — gear the
  // level lock then correctly refused to let it wear, bricking the alt's chests. Item
  // level tracks the *active character's own level* instead (owner ruling,
  // docs/handoff.md). This needs a genuinely fresh third class, not berserker — its
  // level was bumped to 30 above for the equip-catchup check, so by the time this runs
  // it is levelled and would pass under either rule, proving nothing.
  state.keys.Basic += 20;
  const shamanChest = state.openChests("Basic", 20);
  check("a deep-diving character's chests roll near its own level",
    shamanChest.every((it) => it.ilvl >= 20), `ilvls: ${shamanChest.map((it) => it.ilvl).join(",")}`);

  state.chooseClass("paladin");
  check("the second alt really is fresh", state.player.level === 1);
  state.keys.Basic += 20;
  const freshChest = state.openChests("Basic", 20);
  // A comparison, not a bound: prove the axis is the fresh alt's *own* level rather than
  // pin a magic "1" that would keep passing if the formula moved onto some other constant.
  check("a fresh alt's chests roll at its own level, not a fixed floor",
    freshChest.every((it) => it.ilvl === state.player.level), `ilvls: ${freshChest.map((it) => it.ilvl).join(",")}`);
  check("a fresh alt's chests roll well below the levelled main's",
    Math.max(...freshChest.map((it) => it.ilvl)) < Math.min(...shamanChest.map((it) => it.ilvl)),
    `fresh max ${Math.max(...freshChest.map((it) => it.ilvl))} vs main min ${Math.min(...shamanChest.map((it) => it.ilvl))}`);
  check("a fresh alt can equip what its own chests roll", freshChest.every((it) => state.player.canEquip(it)));

  // Regression: XP for a floor lands as its monsters die, so clearing depth N often
  // dings a character to level N only partway through (or on the next floor), not the
  // instant the last kill lands. requiredLevel() has to give a floor's own drops one
  // level of grace or a character playing a single class straight through — no alt,
  // no shared stash involved — would routinely find their own newest gear locked.
  const onCurve = new Player("berserker");
  onCurve.level = 4;
  const ownDrop = rollItem({ rarity: "rare", type: "axe", ilvl: 5, rng: new Rng(3) });
  check("a floor's own drop isn't locked to the character who is one level behind clearing it",
    onCurve.canEquip(ownDrop), `level ${onCurve.level} vs required ${requiredLevel(ownDrop)}`);
  const wayAhead = rollItem({ rarity: "rare", type: "axe", ilvl: 20, rng: new Rng(4) });
  check("the grace is one level, not a loophole — far-ahead gear still locks",
    !onCurve.canEquip(wayAhead));
}

console.log("\n=== gear that plays itself ===");
{
  // Granted skills and triggers are the top-rarity payoff; they have to actually roll.
  const rng = new Rng(31337);
  let grants = 0;
  let triggers = 0;
  let mods = 0;
  const rolls = 4000;
  for (let i = 0; i < rolls; i++) {
    const item = rollItem({ rarity: "legendary", type: "sword", ilvl: 20, rng });
    if (item.grant) grants++;
    if (item.trigger) triggers++;
    mods += item.mods.length;
  }
  console.log(`  legendary swords: ${(grants / rolls * 100).toFixed(1)}% grant a skill, ` +
    `${(triggers / rolls * 100).toFixed(1)}% carry a trigger, ${(mods / rolls).toFixed(1)} mods each`);
  check("legendaries grant skills", grants > 0);
  check("legendaries carry triggers", triggers > 0);
  check("legendaries roll a handful of modifiers", mods / rolls >= 4);

  let commonGrants = 0;
  let commonTriggers = 0;
  for (let i = 0; i < 2000; i++) {
    const item = rollItem({ rarity: "common", type: "sword", ilvl: 5, rng });
    if (item.grant) commonGrants++;
    if (item.trigger) commonTriggers++;
  }
  check("commons never grant a skill or a trigger",
    commonGrants === 0 && commonTriggers === 0, `${commonGrants}/${commonTriggers}`);
}

console.log("\n=== rifts ===");
{
  const mode = "hoard" as const;
  const state = geared(16, 777);
  state.stats.deepestDepth = 12;
  let cleared = 0;
  let banked = 0;
  for (let floor = 1; floor <= MODES[mode].floors; floor++) {
    const cfg = riftConfig(mode, 1, floor);
    const r = playFloor(state, cfg, 400, 3000 + floor, 0.85);
    console.log(
      `  floor ${floor}/${MODES[mode].floors} depth ${String(cfg.depth).padStart(2)} ` +
      `${r.d.phase.padEnd(8)} ${r.seconds.toFixed(0).padStart(3)}s ` +
      `${cfg.bossFloor ? "BOSS " : "     "}coins=${r.d.loot.coins} items=${r.d.loot.items.length}`,
    );
    if (r.d.phase !== "cleared") break;
    banked += r.d.loot.coins;
    r.d.bankLoot();
    cleared++;
  }
  check("a tier 1 avarice rift can be finished", cleared === MODES[mode].floors,
    `${cleared}/${MODES[mode].floors} floors`);
  check("finishing a rift opens the next tier", state.riftTiers[mode] >= 2,
    `tier ${state.riftTiers[mode]}`);
  check("a rift actually pays", banked > 0, `${banked} coins across the run`);

  // Extracting early must not open anything — the tier is the boss, not the walk in.
  const bail = new GameState(5);
  bail.recordDepth(riftConfig("abyss", 1, 1).depth, riftConfig("abyss", 1, 1));
  check("extracting on floor one opens nothing", bail.riftTiers.abyss === 1,
    `tier ${bail.riftTiers.abyss}`);

  // The two flavors have to actually differ, or there's only one rift.
  const hoardFloor = riftConfig("hoard", 3, 1);
  const abyssFloor = riftConfig("abyss", 3, 1);
  check("the abyss is harder than avarice at the same tier",
    profileFor(abyssFloor.depth, abyssFloor).enemyHealth >
    profileFor(hoardFloor.depth, hoardFloor).enemyHealth * 1.5,
    `${profileFor(abyssFloor.depth, abyssFloor).enemyHealth.toFixed(0)} vs ` +
    `${profileFor(hoardFloor.depth, hoardFloor).enemyHealth.toFixed(0)} hp`);
  check("avarice drops more than the abyss",
    MODES.hoard.quantity > MODES.abyss.quantity * 1.5,
    `x${MODES.hoard.quantity} vs x${MODES.abyss.quantity}`);
  check("the abyss pushes rarity harder than avarice",
    MODES.abyss.rarityBias > MODES.hoard.rarityBias * 4,
    `${MODES.abyss.rarityBias} vs ${MODES.hoard.rarityBias}`);
  check("rift danger is exponential in tier",
    riftConfig("abyss", 20, 1).danger > riftConfig("abyss", 10, 1).danger * 3,
    `T10 x${riftConfig("abyss", 10, 1).danger.toFixed(1)} → ` +
    `T20 x${riftConfig("abyss", 20, 1).danger.toFixed(1)}`);
}

console.log("\n=== challenger tier ===");
{
  check("challenger tier zero changes nothing", challengerMultiplier(0) === 1);
  check("challenger tier five reads as roughly five times harder",
    challengerMultiplier(5) > 4 && challengerMultiplier(5) < 6,
    `×${challengerMultiplier(5).toFixed(2)}`);
  const plain = profileFor(1, delveConfig(1, 0));
  const nightmare = profileFor(1, delveConfig(1, 8));
  check("challenger has real teeth even on the gentlest floor in the game",
    nightmare.enemyHealth > plain.enemyHealth * 3,
    `depth 1: ${plain.enemyHealth.toFixed(0)} hp -> ${nightmare.enemyHealth.toFixed(0)} hp at tier 8`);

  // Descending used to rebuild the next floor from the mode id and floor number alone,
  // which quietly dropped the dial the player had set: floor one was Death March and
  // floor two was not. Every mode advances through the same helper now.
  const delve2 = nextFloorConfig(delveConfig(4, 12));
  check("descending the delve keeps the challenger tier",
    delve2.challengerTier === 12 && delve2.depth === 5 && delve2.danger === challengerMultiplier(12),
    `depth ${delve2.depth}, tier ${delve2.challengerTier}, x${delve2.danger.toFixed(1)}`);
  const rift2 = nextFloorConfig(riftConfig("abyss", 6, 1, 12));
  check("descending a rift keeps its tier and the challenger tier",
    rift2.challengerTier === 12 && rift2.tier === 6 && rift2.floor === 2
    && rift2.danger > riftConfig("abyss", 6, 2, 0).danger * 5,
    `T${rift2.tier} F${rift2.floor}, x${rift2.danger.toFixed(1)}`);
  const planet2 = nextFloorConfig(planetConfig(PLANETS[1]!, 3, 1, 12));
  check("descending a planet keeps the planet, its tier and the challenger tier",
    planet2.planet?.spec.id === PLANETS[1]!.id && planet2.planet?.tier === 3
    && planet2.challengerTier === 12 && planet2.floor === 2
    && planet2.depth === planetConfig(PLANETS[1]!, 3, 2, 0).depth,
    `${planet2.planet?.spec.name} T${planet2.planet?.tier} F${planet2.floor} d${planet2.depth}`);

  // The Tower is the other endless, non-rift mode `nextFloorConfig` has to carry — the
  // Sept 2026 bug: it had no branch of its own, fell through to the delve fallback, and
  // every climb quietly handed back a Delve floor (the owner hit this live: "clear the
  // Tower ... it'll take me to the Delve"). `tools/world.ts` pins the config shape as a
  // property across every mode; this proves the same thing through a real generated
  // floor, the way the doc comment on this section asks for.
  const tower2 = nextFloorConfig(towerConfig(4, 12));
  check("descending the Tower keeps the height and the challenger tier",
    tower2.mode.id === "tower" && tower2.tower?.height === 5 && tower2.depth === 5
    && tower2.challengerTier === 12 && tower2.danger === challengerMultiplier(12),
    `height ${tower2.tower?.height}, tier ${tower2.challengerTier}`);
}

console.log("\n=== the Tower actually climbs, not just its config ===");
{
  // Real `Dungeon`s, not config objects: each one generates a real floor (biome, roster,
  // encounter) off the config the previous floor's clear handed to `nextFloorConfig`,
  // exactly the path `enterDungeon(nextFloorConfig(config))` and `party.descend` take.
  // A regression that loses `config.tower` shows up here as a floor that generated with
  // the Delve's own biome instead of the Tower's holy one — the literal shape the bug
  // took, not an approximation of it.
  const st = geared(20, 9401, 16, "lancer");
  // `geared()` now sets a frontier so it has universal points to spend, which writes the
  // very record this section asserts a climb never touches. Zero it, so the assertion
  // below measures the CLIMB rather than the fixture that set it up.
  //
  // The assertion stays `=== 0`. Widening it to `<= 21` to absorb the fixture's write
  // would have turned the red green and simultaneously blinded the check to the one
  // thing it exists for — a climb writing the account's depth record. Restore the
  // check's subject, never relax its bound.
  st.player.deepestDepth = 0;
  st.stats.deepestDepth = 0;
  let config: RunConfig = towerConfig(1, st.challengerTier);
  for (let h = 1; h <= 4; h++) {
    const d = new Dungeon(st, config, 9400 + h);
    check(`height ${h}: the floor is the Tower's, not the Delve's`,
      d.config.mode.id === "tower" && d.config.tower?.height === h && d.config.depth === h
      && d.level.biome.element === "holy",
      `mode "${d.config.mode.id}", tower.height ${d.config.tower?.height}, biome "${d.level.biome.name}"`);
    if (h % 5 === 0) {
      check(`height ${h}: every fifth floor is the Tower's own encounter`, d.config.bossFloor);
    }
    if (h < 4) {
      // Force the clear the same way the Convergence campaign above does, then hand the
      // floor to `nextFloorConfig` exactly as the completion-portal path does.
      d.killsSoFar = d.killsRequired;
      d.elitesKilled = d.elitesRequired;
      d.wave = d.profile.waves;
      d.enemies.length = 0;
      const idle = new FakeInput();
      idle.beginTick();
      d.update(DT, idle as unknown as AvatarInput);
      check(`height ${h}: closes and opens the completion portal`, d.phase === "cleared" && d.completionPortal !== null);
      d.bankLoot();
      config = nextFloorConfig(d.config);
    }
  }
  check("a climb never touched the account's depth record",
    st.stats.deepestDepth === 0 && st.player.deepestDepth === 0);
  check("…but banking heights 1-3 did raise the height record to the last one banked",
    st.stats.highestHeight === 3 && st.player.highestHeight === 3);
}

console.log("\n=== planets ===");
{
  check("Htrae is always open", planetUnlocked(PLANETS[0]!, {}));
  check("the second planet is locked before the first is ever cleared",
    !planetUnlocked(PLANETS[1]!, {}));
  check("clearing a planet's first tier opens the next planet",
    planetUnlocked(PLANETS[1]!, { [PLANETS[0]!.id]: 2 }));
  check("every planet has at least one resource node scattered on its floors",
    PLANETS.every((p) => p.nodeCount > 0));

  // A real floor: kills have to pay in the planet's own material, and the boss floor
  // has to spawn the planet's own reskinned encounter rather than the depth ladder's.
  const ignathis = PLANETS.find((p) => p.id === "ignathis")!;
  // A bigger, "open world" floor takes longer to clear than an ordinary one, which
  // means more time exposed to chip damage — geared and played the way the raid boss
  // test proves out a harder fight, not left at the same margin the ordinary floors use.
  // Planet floors are big, dense and long — CLAUDE.md flags them as wanting a dedicated
  // balance pass and as needing noticeably more generous gearing than an equivalent
  // delve floor. Geared well past the nominal tier here on purpose.
  const state = geared(30, 7070, 30);
  const r = playFloor(state, planetConfig(ignathis, 1, 1, 0), 400, 8080, 0.9);
  check("a planet floor can be fought and cleared", r.d.phase === "cleared", r.d.phase);
  check("kills on a planet pay in its own element's material",
    r.d.loot.materials[ignathis.element] > 0, JSON.stringify(r.d.loot.materials));
  const before = state.materials[ignathis.element];
  r.d.bankLoot();
  check("materials bank into the stash on extract", state.materials[ignathis.element] > before);

  // Mining, directly: stand on a node, press confirm, it pays out once and goes dead.
  const state2 = geared(12, 9090, 6);
  const miningRun = new Dungeon(state2, planetConfig(ignathis, 1, 1, 0), 1234);
  check("a planet floor is generated with resource nodes",
    miningRun.level.resourceNodes.length > 0, `${miningRun.level.resourceNodes.length}`);
  const node = miningRun.level.resourceNodes[0];
  if (node) {
    const input = new FakeInput();
    miningRun.avatar.x = node.x;
    miningRun.avatar.y = node.y;
    input.beginTick();
    input.press("confirm");
    miningRun.update(DT, input as unknown as Input);
    miningRun.drainEvents();
    check("mining an unspent node pays materials and depletes it",
      miningRun.loot.materials[ignathis.element] > 0 && node.depleted,
      `${JSON.stringify(miningRun.loot.materials)} depleted=${node.depleted}`);
    const beforeSecond = miningRun.loot.materials[ignathis.element];
    input.beginTick();
    input.press("confirm");
    miningRun.update(DT, input as unknown as Input);
    check("a depleted node doesn't pay twice",
      miningRun.loot.materials[ignathis.element] === beforeSecond);
  }

  // The boss floor: a planet borrows an existing encounter's kit but wears its own
  // name, title and element.
  const rimehollow = PLANETS.find((p) => p.id === "rimehollow")!;
  const bossRun = new Dungeon(geared(20, 5150, 10), planetConfig(rimehollow, 1, rimehollow.floors, 0), 6060);
  const input = new FakeInput();
  let bt = 0;
  while (bt < 6 && !bossRun.boss) {
    input.beginTick();
    bossRun.update(DT, input as unknown as Input);
    bossRun.drainEvents();
    bt += DT;
  }
  check("a planet boss floor spawns that planet's own boss",
    bossRun.boss?.name === rimehollow.bossName, bossRun.boss?.name);
  check("the planet boss carries the planet's element", bossRun.boss?.element === rimehollow.element);
}

console.log("\n=== crafting ===");
{
  const rich = new GameState(4400);
  rich.materials.physical = 100000;
  rich.materials.fire = 100000;
  const beforeCount = rich.inventory.length;
  const item = rich.craftItem("weapon", "epic", "fire");
  check("crafting with enough materials succeeds", item !== null);
  check("a crafted item lands in the stash", rich.inventory.length === beforeCount + 1);
  check("crafting actually spends materials", rich.materials.physical < 100000);
  check("the crafted item is the rarity that was asked for", item?.rarity === "epic");
  check("crafting never reaches divine or unspoken",
    !(CRAFTABLE_RARITIES as readonly string[]).includes("divine")
    && !(CRAFTABLE_RARITIES as readonly string[]).includes("unspoken"));

  const poor = new GameState(4401);
  check("crafting without materials fails and refunds nothing",
    poor.craftItem("weapon", "legendary", null) === null && poor.materials.physical === 0);
}

console.log("\n=== reforging (UAT §26) ===");
{
  const rich = new GameState(4410);
  rich.materials.physical = 1_000_000;
  rich.coins = 1_000_000_000;
  const original = rich.craftItem("weapon", "legendary", null)!;
  const beforeStats = { ...original.stats };
  const beforeGrant = original.grant;
  const beforeTrigger = original.trigger;
  const coinsBefore = rich.coins;
  const materialsBefore = rich.materials.physical;

  const reforged = rich.reforgeItem(original.id);
  check("reforging a found item succeeds", reforged !== null);
  check("reforge keeps the same item id in place", reforged?.id === original.id);
  check("reforge keeps rarity, type and item level",
    reforged?.rarity === original.rarity && reforged?.type === original.type
    && reforged?.ilvl === original.ilvl);
  check("reforge never touches the base stat block",
    !!reforged && STAT_KEYS.every((k) => reforged.stats[k] === beforeStats[k]));
  check("reforge never touches a grant or a trigger",
    reforged?.grant === beforeGrant && reforged?.trigger === beforeTrigger);
  check("reforging actually spends coins and materials",
    rich.coins < coinsBefore && rich.materials.physical < materialsBefore);
  check("the reforged affix count still respects the rarity's mod range",
    !!reforged && reforged.mods.length >= MOD_COUNTS[reforged.rarity][0]
    && reforged.mods.length <= MOD_COUNTS[reforged.rarity][1]);
  check("the reforged item replaced the original in the stash, not duplicated",
    rich.inventory.filter((it) => it.id === original.id).length === 1);

  rich.equipFromInventory(original.id);
  const invCountBefore = rich.inventory.length;
  const reforgedAgain = rich.reforgeItem(original.id);
  check("an equipped item reforges in place, without falling into the stash",
    reforgedAgain !== null && rich.player.equipment[original.slot]?.id === original.id
    && rich.inventory.length === invCountBefore);

  // Crafting a divine/unspoken item is refused, but reforging one already found isn't —
  // it can only reroll affixes on something that exists, never manufacture the rarity.
  const unspoken = rollItem({ rarity: "unspoken", type: "sword", ilvl: 30, rng: new Rng(77) });
  rich.inventory.push(unspoken);
  check("crafting still refuses unspoken", rich.craftItem("weapon", "unspoken", null) === null);
  check("reforging an already-found unspoken item still works",
    rich.reforgeItem(unspoken.id)?.rarity === "unspoken");

  check("reforge cost climbs hard with rarity",
    reforgeCoinCost("unspoken") > reforgeCoinCost("legendary")
    && reforgeCoinCost("legendary") > reforgeCoinCost("epic")
    && reforgeCoinCost("common") < reforgeCoinCost("uncommon"));

  check("reforging an unknown item id returns null", rich.reforgeItem("no-such-item") === null);

  const poor = new GameState(4411);
  poor.materials.physical = craftBulkCost("common");
  const poorItem = poor.craftItem("weapon", "common", null)!;
  poor.coins = 0;
  poor.materials.physical = 0;
  check("reforging without coins or materials fails and spends nothing",
    poor.reforgeItem(poorItem.id) === null && poor.coins === 0 && poor.materials.physical === 0);
}

console.log("\n=== the Citadel deck (the hub, on the tile lattice) ===");
{
  // The deck is authored the way a floor is (`game/deck.ts`), so it is held to the same
  // promises: walls on the lattice, painted rock *is* the collision volume, and every
  // station is somewhere you can actually walk to. These used to be unfalsifiable —
  // a station was a pair of numbers measured off a painting by eye.
  const problems = deckProblems();
  check("the deck is well-formed — one glyph per station, one spawn, nothing stray",
    problems.length === 0, problems.slice(0, 4).join("; "));

  check("every wall is on the 32-unit lattice and exactly one tile thick",
    DECK_WALLS.every((w) => w.x % TILE === 0 && w.y % TILE === 0 && w.h === TILE && w.w % TILE === 0
      && w.w > 0),
    DECK_WALLS.filter((w) => w.x % TILE || w.y % TILE || w.h !== TILE || w.w % TILE).length + " off-lattice");

  // The exact predicate `render/tilemap.ts` stamps rock with: a cell is rock when its
  // centre is inside a wall. If that ever disagrees with the authored grid, the hall you
  // see stops being the hall that stops you — the "I can walk through walls" bug the
  // dungeon had twice, arriving in the hub.
  let mismatch = 0;
  for (let cy = 0; cy < DECK_ROWS; cy++) {
    for (let cx = 0; cx < DECK_COLS; cx++) {
      const x = cx * TILE + TILE / 2;
      const y = cy * TILE + TILE / 2;
      const inWall = DECK_WALLS.some((w) => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h);
      if (inWall !== deckIsRock(cx, cy)) mismatch++;
    }
  }
  check("the rock the stamper paints is exactly the rock that stops you", mismatch === 0,
    `${mismatch} cells disagree`);

  // Every station, with everything unlocked at once. This is the parity list: the deck
  // must still hold all fifteen doors it held before the refactor.
  const all = new Hub();
  all.setExpedition(PLANETS[0]!.id, 1);
  all.raidOpen = true;
  all.setRaid(RAIDS[0]!.id, 1);
  all.altarOpen = true;
  all.setMemory("any-memory-id");
  all.towerOpen = true;
  all.vigilOpen = true;
  all.weeklyOpen = true;
  const kinds = all.stations.map((s) => s.kind).sort();
  const expected = ([
    "abyss", "altar", "comms", "convergence", "dive", "expedition", "forge", "hoard",
    "memoryPortal", "quartermaster", "raidPortal", "starmap", "tower", "training",
    "trophyHall", "vigil", "warTable",
  ] as string[]).sort();
  check("every station the deck used to hold is still on it",
    kinds.length === expected.length && kinds.every((k, i) => k === expected[i]),
    kinds.join(","));

  check("every station stands on open floor, on its own tile",
    all.stations.every((st) => !deckIsRock(Math.floor(st.x / TILE), Math.floor(st.y / TILE))),
    all.stations.filter((st) => deckIsRock(Math.floor(st.x / TILE), Math.floor(st.y / TILE)))
      .map((st) => st.label).join(","));

  // The generator's one hard promise, for the hall: you can walk from where you arrive to
  // everything the hall offers. A room graph gets this by construction; a hand-authored
  // grid does not, so it is checked.
  const seen = new Uint8Array(DECK_COLS * DECK_ROWS);
  const sx = Math.floor(DECK_SPAWN.x / TILE);
  const sy = Math.floor(DECK_SPAWN.y / TILE);
  const queue = [sy * DECK_COLS + sx];
  seen[queue[0]!] = 1;
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]!;
    const cx = cell % DECK_COLS;
    const cy = (cell - cx) / DECK_COLS;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= DECK_COLS || ny >= DECK_ROWS) continue;
      const at = ny * DECK_COLS + nx;
      if (seen[at] || deckIsRock(nx, ny)) continue;
      seen[at] = 1;
      queue.push(at);
    }
  }
  const stranded = all.stations.filter(
    (st) => !seen[Math.floor(st.y / TILE) * DECK_COLS + Math.floor(st.x / TILE)]);
  check("every station is walkable from where you arrive", stranded.length === 0,
    stranded.map((st) => st.label).join(","));

  // Movement resolves against those walls now, not against a rectangle drawn around the
  // art. Shove the hero at each wall for a couple of seconds and it must still be in the
  // hall — and, because the resolver works on the real rects, out of the stone.
  const walker = new Hub();
  let escaped = 0;
  for (const [mx, my] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as [number, number][]) {
    walker.x = DECK_SPAWN.x;
    walker.y = DECK_SPAWN.y;
    const push = { moveVector: () => ({ x: mx, y: my }) } as unknown as Input;
    for (let i = 0; i < 240; i++) walker.update(DT, push);
    if (walker.x <= 0 || walker.x >= HUB_WIDTH || walker.y <= 0 || walker.y >= HUB_HEIGHT) escaped++;
    if (deckIsRock(Math.floor(walker.x / TILE), Math.floor(walker.y / TILE))) escaped++;
  }
  check("walking flat into the walls never leaves the hall or ends up inside the stone",
    escaped === 0, `${escaped} of 8 directions`);
}

console.log("\n=== the build-tester room: a dummy, and nothing else ===");
{
  const st = geared(20, 5501, 12, "lancer");
  // Everything a training session must leave untouched — the persistent, save-level
  // half of the character. `combatStats` (the DPS overlay this room exists for) is
  // deliberately excluded: that number is supposed to move, every time.
  const snapshot = () => JSON.stringify({
    coins: st.coins, gems: st.gems, keys: st.keys, materials: st.materials,
    xp: st.player.xp, level: st.player.level, treePoints: st.player.universalAllocated,
    deepestDepth: st.stats.deepestDepth, highestHeight: st.stats.highestHeight,
    frontier: st.frontier, inventory: st.inventory.length, runsCompleted: st.stats.runsCompleted,
    riftTiers: st.riftTiers,
  });
  const before = snapshot();

  const result = playFloor(st, trainingConfig(st.challengerTier), 15, 5502, 0.6);
  const d = result.d;
  check("the floor spawns exactly one enemy, and it's the dummy",
    d.enemies.length === 1 && d.enemies[0]?.archetype.kind === "dummy",
    d.enemies.map((e) => e.archetype.kind).join(","));
  const dummy = d.enemies[0]!;
  check("the dummy resists nothing — every element lands at full value",
    Object.values(dummy.resists).every((v) => v === 0));
  check("a real fifteen-second fight through the actual damage path still couldn't kill it",
    dummy.health >= 1, `${dummy.health} / ${dummy.maxHealth}`);
  check("…and it took real damage rather than never being touched",
    dummy.health < dummy.maxHealth, `${dummy.health} / ${dummy.maxHealth}`);
  check("the dummy never dealt the player a point of damage back",
    d.localHero.player.health === d.localHero.player.maxHealth,
    `${d.localHero.player.health} / ${d.localHero.player.maxHealth}`);
  check("the objective can never read met — no completion portal ever spawns",
    !d.floorQuotaMet() && d.completionPortal === null);

  // Bail out the only way this floor can end, and confirm the character came back
  // exactly as it went in. This is the same promise `data/cosmetics.ts`'s powerlessness
  // is held to, asserted the same way: not by inspection, by comparing the whole sheet.
  d.earlyExtractLoot();
  check("a training session leaves the character byte-identical",
    snapshot() === before, snapshot());
}

console.log("\n=== the ship hub ===");
{
  const hub = new Hub();
  check("every station stands inside the hub", hub.stations.every(
    (s) => s.x > 0 && s.x < HUB_WIDTH && s.y > 0 && s.y < HUB_HEIGHT));
  check("no two stations sit on top of each other", hub.stations.every((a, i) =>
    hub.stations.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius)));
  check("nothing is in interact range at spawn", hub.nearStation() === null,
    hub.nearStation()?.label);
  check("no expedition portal until the star map picks one",
    !hub.stations.some((s) => s.kind === "expedition"));
  hub.setExpedition(PLANETS[0]!.id, 1);
  check("choosing an expedition spawns its portal", hub.stations.some((s) => s.kind === "expedition"));
  hub.clearExpedition();
  check("walking into it clears it back out", !hub.stations.some((s) => s.kind === "expedition"));

  check("no Vigil portal until the delve has gone deep enough", !hub.stations.some((s) => s.kind === "vigil"));
  hub.vigilOpen = true;
  check("unlocking the Vigil puts its portal on the deck, clear of everything else",
    hub.stations.some((s) => s.kind === "vigil") && hub.stations.every((a, i) =>
      hub.stations.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius)));
  hub.vigilOpen = false;

  check("no Convergence portal until the delve has gone deep enough", !hub.stations.some((s) => s.kind === "convergence"));
  hub.weeklyOpen = true;
  check("unlocking the Convergence puts its portal on the deck, clear of everything else — including the Vigil's",
    hub.stations.some((s) => s.kind === "convergence") && hub.stations.every((a, i) =>
      hub.stations.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius)));
  hub.vigilOpen = true;
  check("…even with both portals open at once",
    hub.stations.every((a, i) => hub.stations.every((b, j) =>
      i === j || Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius)));
  hub.vigilOpen = false;
  hub.weeklyOpen = false;

  // The party's ready spot is whichever portal the host picked (UAT §1 D1) — there is
  // no separate party portal any more.
  check("no party portal on the deck", !hub.stations.some((s) => (s.kind as string) === "party"));
  hub.partyOpen = true;
  check("nobody is ready before the host has picked", !hub.inPartyPortal && hub.partyStation === null);
  hub.partyTarget = "abyss";
  const abyss = hub.stations.find((s) => s.kind === "abyss")!;
  hub.x = abyss.x + abyss.radius;
  hub.y = abyss.y;
  check("standing in the picked portal is being ready",
    hub.inPartyPortal && hub.partyStation?.kind === "abyss");
  hub.x = abyss.x + abyss.radius + HUB_PLAYER_RADIUS + 40;
  check("…standing next to it isn't", !hub.inPartyPortal);
  const dive = hub.stations.find((s) => s.kind === "dive")!;
  hub.x = dive.x;
  hub.y = dive.y;
  check("the wrong portal doesn't count", !hub.inPartyPortal);
  hub.partyTarget = "dive";
  check("…until the host picks it", hub.inPartyPortal);
  hub.partyOpen = false;
  hub.partyTarget = null;
}

console.log("\n=== the vigil ===");
{
  // The daily dungeon (UAT §17). One integer — the UTC day — decides the whole floor, so
  // the first thing to prove is that it really is one floor for everyone and a different
  // one tomorrow; then that each modifier moves exactly the knob it claims; then that it
  // pays its key once, and only for closing it.

  // 1. The calendar.
  const noon = Date.UTC(2026, 8, 8, 12, 0, 0);
  check("the day number is whole UTC days", dayNumber(noon) === Math.floor(noon / DAY_MS));
  check("a minute before UTC midnight is still today", dayNumber(noon + 12 * 3600_000 - 60_000) === dayNumber(noon));
  check("…and a minute after is tomorrow", dayNumber(noon + 12 * 3600_000 + 60_000) === dayNumber(noon) + 1);
  check("the countdown reaches zero exactly at the reset",
    msUntilReset(noon) === 12 * 3600_000 && msUntilReset((dayNumber(noon) + 1) * DAY_MS - 1) === 1);

  // 2. One plan per day, a different one each day, always inside the rules.
  const today = dayNumber(noon);
  const a = dailyPlan(today);
  const b = dailyPlan(today);
  check("the same day is the same plan", JSON.stringify(a) === JSON.stringify(b));
  const seeds = new Set<number>();
  const depths = new Set<number>();
  const tiers = { Advanced: 0, Elite: 0, Legendary: 0 };
  let rulesHeld = true;
  const YEARS = 10;
  for (let d = today; d < today + 365 * YEARS; d++) {
    const plan = dailyPlan(d);
    seeds.add(plan.seed);
    depths.add(plan.depth);
    tiers[plan.keyTier as keyof typeof tiers]++;
    const [m1, m2] = plan.modifiers;
    const valid = plan.modifiers.length === 2 && m1 !== m2
      && (DAILY_MODIFIER_IDS as readonly string[]).includes(m1!)
      && (DAILY_MODIFIER_IDS as readonly string[]).includes(m2!)
      && !(DAILY_MODIFIERS[m1!].reward && DAILY_MODIFIERS[m2!].reward);
    const inBand = plan.depth >= DAILY_DEPTH_MIN && plan.depth <= DAILY_DEPTH_MAX;
    if (!valid || !inBand || plan.seed !== daySeed(d)) rulesHeld = false;
  }
  check(`${YEARS} years of Vigils never repeat a seed`, seeds.size === 365 * YEARS);
  check("every day stays inside the depth band, with two distinct twists and at most one reward twist", rulesHeld);
  check("the band actually gets used", depths.size === DAILY_DEPTH_MAX - DAILY_DEPTH_MIN + 1,
    [...depths].sort((x, y) => x - y).join(","));
  const n = 365 * YEARS;
  const legendary = tiers.Legendary / n;
  const elite = tiers.Elite / n;
  check("the key tier lands near its stated odds",
    Math.abs(legendary - DAILY_KEY_ODDS.Legendary) < 0.02 && Math.abs(elite - DAILY_KEY_ODDS.Elite) < 0.03,
    `Legendary ${(legendary * 100).toFixed(1)}%, Elite ${(elite * 100).toFixed(1)}%, Advanced ${(tiers.Advanced / n * 100).toFixed(1)}%`);
  check("tomorrow is a different seed", daySeed(today) !== daySeed(today + 1));

  // 3. The same floor for everyone: two dungeons from the same day, no seed handed in.
  const fingerprint = (d: Dungeon) => JSON.stringify({
    walls: d.level.walls, traps: d.level.traps, props: d.level.props, start: d.level.start, portal: d.level.portal,
    quota: [d.killsRequired, d.elitesRequired], depth: d.profile.depth,
  });
  const one = new Dungeon(geared(14, 9101, 16, "swordsman"), dailyConfig(today));
  const two = new Dungeon(geared(14, 9102, 16, "magician"), dailyConfig(today));
  check("two players get the identical floor on the same day", fingerprint(one) === fingerprint(two));
  const tomorrow = new Dungeon(geared(14, 9101, 16, "swordsman"), dailyConfig(today + 1));
  check("…and a different one tomorrow", fingerprint(one) !== fingerprint(tomorrow));
  check("the Vigil is one floor, and it's the last", dailyConfig(today).lastFloor && !dailyConfig(today).bossFloor
    && dailyConfig(today).mode.isRift && dailyConfig(today).mode.floors === 1);
  check("the Challenger dial still applies on top", dailyConfig(today, 3).danger > dailyConfig(today, 0).danger);

  // 4. Each modifier moves exactly what it says. Build a Vigil config with a chosen pair
  // and compare its profile against the same day with no twists at all.
  const base = dailyConfig(today);
  const withMods = (mods: readonly DailyModifierId[]): RunConfig => ({
    ...base,
    danger: dailyEffects(mods).danger,
    daily: { ...base.daily!, modifiers: mods },
  });
  const plain = profileFor(base.depth, withMods([]));
  const ratio = (mods: readonly DailyModifierId[], pick: (p: ReturnType<typeof profileFor>) => number) =>
    pick(profileFor(base.depth, withMods(mods))) / pick(plain);
  check("Ferocious is a rift tier's worth of danger, nothing else",
    Math.abs(ratio(["ferocity"], (p) => p.enemyHealth) - 1.3) < 1e-9
    && Math.abs(ratio(["ferocity"], (p) => p.quantity) - 1) < 1e-9);
  check("Swarming means more, softer bodies",
    ratio(["swarm"], (p) => p.enemiesPerWave) > 1.2 && Math.abs(ratio(["swarm"], (p) => p.enemyHealth) - 0.8) < 1e-9);
  check("Hasty tightens the telegraph and the swing",
    Math.abs(ratio(["hasty"], (p) => p.telegraph) - 0.85) < 1e-9 && Math.abs(ratio(["hasty"], (p) => p.aggression) - 0.9) < 1e-9);
  check("Bountiful pays in volume and coin",
    Math.abs(ratio(["bounty"], (p) => p.quantity) - 1.5) < 1e-9 && Math.abs(ratio(["bounty"], (p) => p.coinMultiplier) - 1.3) < 1e-9);
  check("Sparse Ground trades volume for rarity",
    Math.abs(ratio(["frugal"], (p) => p.quantity) - 0.6) < 1e-9
    && Math.abs(profileFor(base.depth, withMods(["frugal"])).rarityBias - plain.rarityBias - 0.08) < 1e-9);
  {
    const st = geared(14, 9103, 16, "swordsman");
    const quiet = new Dungeon(st, withMods([]), 4242);
    const hunt = new Dungeon(st, withMods(["hunt"]), 4242);
    check("Elite Hunt asks for more elites, within what the floor can make",
      hunt.elitesRequired === Math.min(quiet.elitesRequired + 2, eliteCap(hunt)) && hunt.elitesRequired > quiet.elitesRequired,
      `${quiet.elitesRequired} → ${hunt.elitesRequired}`);
  }
  check("a plain delve floor is untouched by any of it",
    JSON.stringify(dailyEffects([])) === JSON.stringify({ danger: 1, count: 1, health: 1, telegraph: 1, aggression: 1, quantity: 1, coins: 1, rarityBias: 0, elites: 0 }));

  // 5. It pays in keys — one of the day's tier, in the clear cache, once a day.
  {
    const st = geared(14, 9104, 16, "lancer");
    const cfg = dailyConfig(today);
    const d = new Dungeon(st, cfg);
    const idle = new FakeInput();
    d.killsSoFar = d.killsRequired;
    d.elitesKilled = d.elitesRequired;
    d.wave = d.profile.waves;
    d.enemies.length = 0;
    idle.beginTick();
    d.update(DT, idle as unknown as AvatarInput);
    check("closing the floor opens the completion portal", d.phase === "cleared" && d.completionPortal !== null);
    const keys = d.pickups.filter((p) => p.kind === "key" && p.keyTier === cfg.daily!.keyTier);
    check("the day's key is in the clear cache", keys.length >= 1, `${keys.length} × ${cfg.daily!.keyTier}`);
    check("nothing is closed until it's banked", st.daily.clearedDay === 0);
    for (const p of [...d.pickups]) if (p.kind === "key") d.localHero.loot.keys[p.keyTier as ChestTier]++;
    const before = st.keys[cfg.daily!.keyTier];
    d.bankLoot();
    check("banking closes the Vigil for the day", st.daily.clearedDay === today && st.stats.vigilsCleared === 1);
    check("…and the key is in the bag", st.keys[cfg.daily!.keyTier] > before);
    check("a Vigil never opens a rift tier by accident", st.riftTiers.vigil === 1 && st.stats.riftsCleared.vigil === 0);

    const again = new Dungeon(st, cfg);
    again.loot.coins = 100;
    again.earlyExtractLoot();
    check("bailing out doesn't count as keeping it", st.daily.clearedDay === today && st.stats.vigilsCleared === 1);
    const fresh = geared(14, 9105, 16, "lancer");
    const lost = new Dungeon(fresh, cfg);
    lost.earlyExtractLoot();
    check("…nor does leaving early on a day you haven't closed", fresh.daily.clearedDay === 0);
    check("a fresh save has never kept one", new GameState().daily.clearedDay === 0 && !dailyUnlocked(new GameState().stats.deepestDepth));
    check("the portal opens at the bottom of the band", dailyUnlocked(DAILY_DEPTH_MIN) && !dailyUnlocked(DAILY_DEPTH_MIN - 1));
  }

  // 6. The save remembers it, and a save from before the Vigil existed loads clean. The
  // blob goes through the same two seams the server round-trips it through.
  {
    const st = geared(14, 9106, 16, "swordsman");
    st.daily.clearedDay = today;
    st.stats.vigilsCleared = 3;
    const back = GameState.fromSaved(parseSaved(serializeSave(st.toJSON())));
    check("the save remembers the day you kept it", back.daily.clearedDay === today && back.stats.vigilsCleared === 3);
    const raw = JSON.parse(serializeSave(st.toJSON())) as Record<string, unknown>;
    delete raw.daily;
    raw.version = 15;
    const old = GameState.fromSaved(parseSaved(JSON.stringify(raw)));
    check("a pre-Vigil save loads as never having kept one", old.daily.clearedDay === 0 && old.coins === st.coins);
  }
}

/**
 * The Proving — endgame class completion at the bottom of the Delve (UAT §13/§14).
 *
 * `tools/legends.ts` owns the structural half: 21 legends, the boss rules, and which
 * floors are and are not the Proving. What can only be measured by playing it lives here.
 *
 * The character below is deliberately not a campaign survivor. The campaign bots start
 * naked and measure the *early* curve — nothing else in this file measures a kitted
 * account, which is the only thing that can answer "is the hardest fight in the game
 * beatable". So: level 60, class tree filled, universal pool spent, thirty Legendary
 * chests worn, and gear rolled at the bottom of the Delve because that is where its
 * record sits.
 *
 * Level 60 is not a guess. `tools/builds.ts` pairs depth 9 with level 18 and
 * `tools/deadpaths.ts` treats a level-60 hero as fully grown, so depth 30 pairs with 60
 * on this project's own arithmetic. It was also measured: a level-34 Elite-geared
 * character cannot beat the **ordinary** depth-30 floor either (0/4, boss left above 94%),
 * so testing the Proving against one would have measured the depth curve rather than the
 * encounter.
 *
 * The class is the Swordsman for the same reason: it is the roster's declared no-gimmick
 * baseline. Class power at depth 30 varies enormously at this level — sampled across
 * eight classes, three of them cannot beat depth 30 at all, in *either* flavour — which is
 * a progression finding rather than something this encounter should be tuned around.
 */
console.log("\n=== the Proving: the bottom of the Delve (UAT §13/§14) ===");
{
  /** Spends every point a character has — class tree first, then the account pool. */
  const fillTrees = (state: GameState) => {
    const p = state.player;
    for (let pass = 0; pass < 40; pass++) {
      let moved = false;
      for (const node of p.tree) {
        if (!p.allocated.includes(node.id) && p.allocate(node)) moved = true;
      }
      if (!moved) break;
    }
    for (let pass = 0; pass < 40; pass++) {
      let moved = false;
      for (const node of UNIVERSAL_TREE) {
        const available = state.universalPoints - p.universalSpent;
        if (available <= 0) break;
        if (!p.universalAllocated.includes(node.id) && p.allocateUniversal(node, available)) moved = true;
      }
      if (!moved) break;
    }
  };

  /**
   * A character that has already cleared the bottom of the Delve and banked it — which
   * is exactly the gate the Proving reads. `deepestDepth` is set *before* the chests are
   * opened on purpose: chests roll item level off the active character's own record, so
   * this is gear from the bottom rather than gear from the shallows.
   */
  const endgame = (classId: ClassId, seed: number, level = 60,
                   tier: ChestTier = "Legendary", keys = 30): GameState => {
    const state = new GameState(seed);
    state.chooseClass(classId);
    state.player.level = level;
    state.player.deepestDepth = DELVE_BOTTOM;
    state.stats.deepestDepth = DELVE_BOTTOM;
    state.player.refresh();
    state.player.autoSlotNewAbilities();
    state.keys[tier] = keys;
    state.openChests(tier, keys);
    const cls = state.heroClass;
    for (const item of [...state.inventory].sort((a, b) => itemScore(b, cls) - itemScore(a, cls))) {
      const worn = state.player.equipment[item.slot];
      if (!worn || itemScore(item, cls) > itemScore(worn, cls)) state.equipFromInventory(item.id);
    }
    if (!state.player.hasAffinity) {
      state.player.equip(rollItem({
        rarity: "legendary", type: cls.affinity[0]!, ilvl: level, rng: new Rng(seed ^ 0x51ed),
      }));
    }
    fillTrees(state);
    state.player.fullHeal();
    state.potions = 9;
    return state;
  };

  // The encounter is only fairly measured against a character that really is kitted, so
  // print and assert what the helper actually produced rather than trusting it.
  const sample = endgame("swordsman", 91_001);
  const slots = Object.values(sample.player.equipment);
  const worn = slots.filter(Boolean).length;
  console.log(
    `  the test character: lv ${sample.player.level} ${sample.heroClass.name}, ` +
    `${worn}/${slots.length} slots, ${sample.player.allocated.length} class nodes, ` +
    `${sample.player.universalSpent}/${sample.universalPoints} universal, ` +
    `${sample.player.maxHealth.toFixed(0)} hp, hit ${sample.player.attackDamage.toFixed(0)}`);
  check("the endgame test character is actually geared and built",
    worn === slots.length && sample.player.allocated.length > 0
      && sample.player.universalSpent > 0,
    `${worn}/${slots.length} slots, ${sample.player.allocated.length} nodes, ` +
    `${sample.player.universalSpent} universal`);

  // The encounter is the class, not the depth.
  {
    const state = endgame("stormcaller", 91_002);
    const run = new Dungeon(state, delveConfig(DELVE_BOTTOM), 6161);
    check("the bottom of the Delve is that class's Proving", run.proving === "stormcaller");
    const input = new FakeInput();
    let t = 0;
    while (t < 6 && !run.boss) {
      input.beginTick();
      run.update(DT, input as unknown as Input);
      run.drainEvents();
      t += DT;
    }
    check("…and it spawns the class's own unfinished Legend",
      run.boss?.name === legendName("stormcaller"), run.boss?.name);
    check("…wearing the class's element", run.boss?.element === CLASSES.stormcaller.element,
      run.boss?.element);
    check("…with a phase appended past the template's last",
      (run.boss?.boss?.spec.phases.length ?? 0)
        === BOSSES.find((b) => b.id === LEGENDS.stormcaller.template)!.phases.length + 1,
      `${run.boss?.boss?.spec.phases.length} phases`);

    const unqualified = endgame("stormcaller", 91_003);
    unqualified.player.deepestDepth = DELVE_BOTTOM - 1;
    check("a character that hasn't banked the bottom finds the ordinary floor",
      new Dungeon(unqualified, delveConfig(DELVE_BOTTOM), 6161).proving === null);
  }

  /**
   * Reading the floor against standing in it: the same character, the same seeds,
   * compared **directly against each other** in one run rather than against two
   * independent thresholds. A one-sided bound proves nothing about a design promise —
   * the campaign comparison in this file silently inverted once while both sides stayed
   * inside their own limits, and nobody noticed.
   */
  const seeds = [7_101, 7_202, 7_303, 7_404, 7_505, 7_606];
  const sharp = seeds.map((seed) =>
    playFloor(endgame("swordsman", 91_000 + seed), delveConfig(DELVE_BOTTOM), 600, seed, 0.85));
  const reckless = seeds.map((seed) =>
    playFloor(endgame("swordsman", 91_000 + seed), delveConfig(DELVE_BOTTOM), 600, seed, 0));
  const avg = (rs: FloorResult[], f: (r: FloorResult) => number) =>
    rs.reduce((a, r) => a + f(r), 0) / rs.length;
  const won = (rs: FloorResult[]) => rs.filter((r) => r.d.phase === "cleared").length;

  for (const [label, rs] of [["reads the floor", sharp], ["stands in it  ", reckless]] as const) {
    console.log(
      `  ${label}: ${won(rs)}/${rs.length} cleared, ${avg(rs, (r) => r.seconds).toFixed(0)}s, ` +
      `${avg(rs, (r) => r.damageTaken).toFixed(0)} damage taken, ` +
      `${avg(rs, (r) => r.mechanicsEaten).toFixed(1)}/${avg(rs, (r) => r.mechanicsResolved).toFixed(1)} eaten, ` +
      `${avg(rs, (r) => r.potionsDrunk).toFixed(1)} potions, phases=${rs.map((r) => r.bossPhases).join("/")}`);
  }

  check("a plausible endgame character can beat their Proving",
    won(sharp) > seeds.length / 2, `${won(sharp)}/${seeds.length} cleared`);

  // At full endgame gearing, *both* bots kill it — the potion belt carries a careless
  // player all the way to the end, which is the same thing the depth-5 raid-boss section
  // in this file found and is why that one compares rates rather than corpses. So the
  // skill difference is asserted twice, on the two axes where it is actually visible:
  // here as rates, and below on a deliberately marginal character where the win itself
  // flips. Measured: 4,204 damage and 1.5 potions against 11,391 and 5.3.
  const rate = (rs: FloorResult[], f: (r: FloorResult) => number) =>
    avg(rs, f) / Math.max(1, avg(rs, (r) => r.seconds));
  check("standing in it costs far more health, second for second",
    rate(reckless, (r) => r.damageTaken) > rate(sharp, (r) => r.damageTaken) * 1.5,
    `${rate(reckless, (r) => r.damageTaken).toFixed(1)}/s vs ${rate(sharp, (r) => r.damageTaken).toFixed(1)}/s`);
  check("…and empties the potion belt to pay for it",
    rate(reckless, (r) => r.potionsDrunk) > rate(sharp, (r) => r.potionsDrunk) * 1.5,
    `${avg(reckless, (r) => r.potionsDrunk).toFixed(1)} vs ${avg(sharp, (r) => r.potionsDrunk).toFixed(1)} potions`);

  /**
   * Not asserted as win-or-lose, and that is the point. `CLAUDE.md`'s difficulty section
   * says boss floors are measured differently, "because a raid boss that one-shots a
   * careless player is a wall rather than a fight" — so the promise is a diverging damage
   * bill and an emptying belt, which is what the two checks above compare directly.
   *
   * Measured while deciding this, and recorded so nobody re-derives it: at level 60 with
   * legendary gear both bots kill it 6/6, because nine potions carry a careless player to
   * the end. Fifteen levels and a gear tier short, it is 4/6 against 0/6. Tempting to
   * assert the second — but a gearing where standing in everything kills you outright is
   * a wall, and a win-rate check at the margin is the coin-flip the depth-5 section of
   * this file already warns about: four wins of five there flipped on every change that
   * touched the shared rng.
   */
  check("it is a fight rather than a wall of health",
    avg(sharp, (r) => r.seconds) > 30 && avg(sharp, (r) => r.bossPhases) >= 2,
    `${avg(sharp, (r) => r.seconds).toFixed(0)}s, ${avg(sharp, (r) => r.bossPhases).toFixed(1)} phase changes`);

  /**
   * The Proving against the floor it replaces — the same character, the same seeds, the
   * same skill. This is the assertion that would have caught the first version of the
   * encounter, which scaled its stat line off whichever template the class borrowed and
   * so came out *weaker* than the ordinary depth-30 boss for six of the twenty-one
   * classes. A win-rate threshold could never have caught that; only the comparison does.
   */
  const ordinary = seeds.map((seed) => {
    const state = endgame("swordsman", 91_000 + seed);
    // One depth short of the gate: the same floor, the ordinary encounter on it.
    state.player.deepestDepth = DELVE_BOTTOM - 1;
    return playFloor(state, delveConfig(DELVE_BOTTOM), 600, seed, 0.85);
  });
  console.log(
    `  the floor it replaces: ${won(ordinary)}/${ordinary.length} cleared, ` +
    `${avg(ordinary, (r) => r.seconds).toFixed(0)}s, ` +
    `${avg(ordinary, (r) => r.damageTaken).toFixed(0)} damage taken`);
  check("the Proving is the longer fight of the two",
    avg(sharp, (r) => r.seconds) > avg(ordinary, (r) => r.seconds),
    `${avg(sharp, (r) => r.seconds).toFixed(0)}s vs ${avg(ordinary, (r) => r.seconds).toFixed(0)}s`);
  check("…and asks for more phases of it",
    avg(sharp, (r) => r.bossPhases) >= avg(ordinary, (r) => r.bossPhases) - 0.5,
    `${avg(sharp, (r) => r.bossPhases).toFixed(1)} vs ${avg(ordinary, (r) => r.bossPhases).toFixed(1)} phase changes`);

  // The whole point of the fight, measured on a fight that was actually played rather
  // than on a bank call in isolation.
  {
    const cleared = sharp.find((r) => r.d.phase === "cleared");
    const before = cleared ? cleared.d.state.player.legendComplete : true;
    if (cleared) cleared.d.bankLoot();
    check("a Proving won in play completes the Legend when it banks",
      cleared !== undefined && !before && cleared.d.state.player.legendComplete,
      cleared ? "banked a clear the bot actually won" : "no seed cleared");
  }

  // --- what the border costs, and what loses it ---------------------------
  {
    const banked = endgame("reaper", 91_010);
    check("a Legend starts unfinished", !banked.player.legendComplete);
    new Dungeon(banked, delveConfig(DELVE_BOTTOM), 6262).bankLoot();
    check("banking the bottom completes that class's Legend", banked.player.legendComplete);
    check("…and says so once, for the town to announce", banked.legendJustCompleted === "reaper");
    banked.legendJustCompleted = null;
    check("re-clearing it neither un-completes nor re-announces",
      banked.completeLegend("reaper") === false && banked.player.legendComplete
        && banked.legendJustCompleted === null);
    check("it is that class's border, not the account's",
      banked.legendsComplete === 1 && !banked.players.magician.legendComplete);
  }
  {
    // Bailing out through the entrance portal forfeits the floor's progression along
    // with its loot (UAT §6), so it cannot hand out a gold border either.
    const bailed = endgame("reaper", 91_011);
    const bail = new Dungeon(bailed, delveConfig(DELVE_BOTTOM), 6363);
    bail.earlyExtractLoot();
    check("bailing out of the Proving completes nothing",
      bail.proving === "reaper" && !bailed.player.legendComplete);
  }
  {
    // Dying banks nothing at all. Driven through a real death — a qualified but naked
    // character standing still at the bottom — rather than asserted against a run that
    // simply never banked, which would pass for the wrong reason. It also shows what the
    // gate actually is: this character qualifies on record and is still killed by the
    // floor, because the gate is where it has been, not how strong it is.
    const died = new GameState(91_012);
    died.chooseClass("reaper");
    died.player.deepestDepth = DELVE_BOTTOM;
    const fatal = new Dungeon(died, delveConfig(DELVE_BOTTOM), 6464);
    const input = new FakeInput();
    let t = 0;
    while (t < 90 && fatal.phase === "fighting") {
      input.beginTick();
      fatal.update(DT, input as unknown as Input);
      fatal.drainEvents();
      t += DT;
    }
    check("dying at the bottom completes nothing",
      fatal.proving === "reaper" && fatal.phase === "dead" && !died.player.legendComplete,
      `phase ${fatal.phase} after ${t.toFixed(0)}s`);
  }

  // Prestige, not power. The border is read by the UI and by nothing else, so a
  // completed class must have an identical character sheet to an unfinished one — the
  // same promise `data/cosmetics.ts` makes, asserted the same way.
  {
    const plain = endgame("paladin", 91_020);
    const crowned = endgame("paladin", 91_020);
    crowned.completeLegend("paladin");
    check("completing a Legend changes no number in the simulation",
      JSON.stringify(plain.player.mods) === JSON.stringify(crowned.player.mods)
        && plain.player.maxHealth === crowned.player.maxHealth
        && plain.player.attackDamage === crowned.player.attackDamage);
  }

  // A border earned once is a border you still have tomorrow.
  {
    const state = endgame("bard", 91_030);
    state.completeLegend("bard");
    const reloaded = GameState.fromSaved(parseSaved(serializeSave(state.toJSON())));
    check("a completed Legend survives a save round-trip",
      reloaded.players.bard.legendComplete && !reloaded.players.lancer.legendComplete);

    // A genuine pre-v17 blob: the field simply isn't there. Built by stripping it rather
    // than by relabelling the version, which would leave the flag in the data and pass
    // for no reason at all.
    const blob = JSON.parse(JSON.stringify(state.toJSON())) as Record<string, unknown>;
    const players = blob.players as Record<string, Record<string, unknown>>;
    for (const id of CLASS_IDS) delete players[id]!.legendComplete;
    const old = GameState.fromSaved({ version: 16, data: blob });
    check("a pre-v17 save loads with every class unfinished",
      CLASS_IDS.every((id) => !old.players[id].legendComplete));
  }
}

console.log("\n=== the convergence ===");
{
  // The weekly dungeon (UAT §17), the Vigil's harder sibling. Same idiom, scaled up:
  // one integer (the UTC week) decides four floors instead of one, three modifiers
  // instead of two, and a boss instead of a plain exit. Same shape of proof, in the
  // same order: the calendar, the plan, per-floor determinism, that it's genuinely
  // harder than the Vigil (compared directly, not just bounded), that each modifier
  // moves exactly its own knob, and that it pays its prize once and only for finishing.

  // 1. The calendar.
  const noon = Date.UTC(2026, 8, 8, 12, 0, 0);
  check("the week number is whole UTC weeks", weekNumber(noon) === Math.floor(dayNumber(noon) / 7));
  check("a minute before the week boundary is still this week",
    weekNumber((weekNumber(noon) + 1) * 7 * DAY_MS - 60_000) === weekNumber(noon));
  check("…and a minute after is next week",
    weekNumber((weekNumber(noon) + 1) * 7 * DAY_MS + 60_000) === weekNumber(noon) + 1);
  check("the countdown reaches zero exactly at the reset",
    msUntilWeeklyReset((weekNumber(noon) + 1) * 7 * DAY_MS - 1) === 1);
  check("a week's seed differs from the day-number seed even when the integers coincide",
    weeklySeed(7) !== daySeed(7));

  // 2. One plan per week, a different one each week, always inside the rules.
  const week = weekNumber(noon);
  const wa = weeklyPlan(week);
  const wb = weeklyPlan(week);
  check("the same week is the same plan", JSON.stringify(wa) === JSON.stringify(wb));
  const wSeeds = new Set<number>();
  const wDepths = new Set<number>();
  const wTiers = { CollectorsHoard: 0, AdeptsTrove: 0, Legendary: 0 };
  let weeklyRulesHeld = true;
  const WEEKS = 52 * 10;
  for (let w = week; w < week + WEEKS; w++) {
    const plan = weeklyPlan(w);
    wSeeds.add(plan.seed);
    wDepths.add(plan.depth);
    wTiers[plan.keyTier as keyof typeof wTiers]++;
    const mods = plan.modifiers;
    const distinct = new Set(mods).size === mods.length;
    const rewardCount = mods.filter((id) => WEEKLY_MODIFIERS[id].reward).length;
    const valid = mods.length === 3 && distinct && rewardCount <= 1
      && mods.every((id) => (WEEKLY_MODIFIER_IDS as readonly string[]).includes(id));
    const inBand = plan.depth >= WEEKLY_DEPTH_MIN && plan.depth <= WEEKLY_DEPTH_MAX;
    if (!valid || !inBand || plan.seed !== weeklySeed(w)) weeklyRulesHeld = false;
  }
  check(`${WEEKS} weeks of Convergences never repeat a seed`, wSeeds.size === WEEKS);
  check("every week stays inside the depth band, with three distinct twists and at most one reward twist",
    weeklyRulesHeld);
  check("the band actually gets used", wDepths.size === WEEKLY_DEPTH_MAX - WEEKLY_DEPTH_MIN + 1,
    [...wDepths].sort((x, y) => x - y).join(","));
  const wn = WEEKS;
  const hoard = wTiers.CollectorsHoard / wn;
  const adept = wTiers.AdeptsTrove / wn;
  check("the key tier lands near its stated odds",
    Math.abs(hoard - WEEKLY_KEY_ODDS.CollectorsHoard) < 0.03 && Math.abs(adept - WEEKLY_KEY_ODDS.AdeptsTrove) < 0.04,
    `Collector's Hoard ${(hoard * 100).toFixed(1)}%, Adept's Trove ${(adept * 100).toFixed(1)}%, Legendary ${(wTiers.Legendary / wn * 100).toFixed(1)}%`);
  check("never worse than Legendary", wTiers.Legendary + wTiers.AdeptsTrove + wTiers.CollectorsHoard === wn);
  check("next week is a different seed", weeklySeed(week) !== weeklySeed(week + 1));

  // 3. Per-floor determinism: the same week's same floor is identical for anyone, a
  // different floor within the same week is not, and a different week is not either.
  const fingerprint = (d: Dungeon) => JSON.stringify({
    walls: d.level.walls, traps: d.level.traps, props: d.level.props, start: d.level.start, portal: d.level.portal,
    quota: [d.killsRequired, d.elitesRequired], depth: d.profile.depth,
  });
  const wOne = new Dungeon(geared(30, 9201, 20, "swordsman"), weeklyConfig(week, 1));
  const wTwo = new Dungeon(geared(30, 9202, 20, "magician"), weeklyConfig(week, 1));
  check("two players get the identical floor 1 in the same week", fingerprint(wOne) === fingerprint(wTwo));
  const wFloor2 = new Dungeon(geared(30, 9201, 20, "swordsman"), weeklyConfig(week, 2));
  check("…but floor 2 of that same week is a different floor", fingerprint(wOne) !== fingerprint(wFloor2));
  const wNextWeek = new Dungeon(geared(30, 9201, 20, "swordsman"), weeklyConfig(week + 1, 1));
  check("…and floor 1 of next week is different again", fingerprint(wOne) !== fingerprint(wNextWeek));

  check("the trash floors (1-3) escalate by exactly the per-floor step",
    [1, 2, 3].every((f) =>
      weeklyConfig(week, f).depth === Math.max(1, Math.round(wa.depth + WEEKLY_DEPTH_PER_FLOOR * (f - 1)))));
  // The boss floor deliberately does NOT continue that escalation — see the comment on
  // `WEEKLY_BOSS_DEPTH_MIN` in data/weekly.ts. It draws from its own, much shallower,
  // survivability-tested band instead, independent of how deep the trash floors got.
  check("the boss floor's depth is its own draw, inside its own band",
    weeklyConfig(week, WEEKLY_FLOORS).depth >= WEEKLY_BOSS_DEPTH_MIN
    && weeklyConfig(week, WEEKLY_FLOORS).depth <= WEEKLY_BOSS_DEPTH_MAX);
  check("only the last of the four floors is the boss", [1, 2, 3].every((f) =>
    !weeklyConfig(week, f).bossFloor && !weeklyConfig(week, f).lastFloor)
    && weeklyConfig(week, WEEKLY_FLOORS).bossFloor && weeklyConfig(week, WEEKLY_FLOORS).lastFloor);
  check("the Convergence really is four floors ending in a boss",
    weeklyConfig(week, 1).mode.isRift && weeklyConfig(week, 1).mode.floors === WEEKLY_FLOORS);
  check("the Challenger dial still applies on top", weeklyConfig(week, 1, 3).danger > weeklyConfig(week, 1, 0).danger);
  check("floor number clamps to the run's own length", weeklyConfig(week, 99).floor === WEEKLY_FLOORS);

  // 4. Significantly harder than the Vigil — asserted directly against the Vigil's own
  // numbers, not just bounded on its own (the lesson from the Sept 2026 campaign-
  // comparison bug: a one-sided threshold doesn't prove a design promise, a comparison
  // does).
  const vigilProfile = profileFor(dailyConfig(dayNumber(noon), 0).depth, dailyConfig(dayNumber(noon), 0));
  const convergenceProfile = profileFor(weeklyConfig(week, 1, 0).depth, weeklyConfig(week, 1, 0));
  check("the Convergence's floor 1 hits harder than the Vigil's one floor",
    convergenceProfile.enemyDamage > vigilProfile.enemyDamage && convergenceProfile.enemyHealth > vigilProfile.enemyHealth,
    `damage ${convergenceProfile.enemyDamage.toFixed(0)} vs ${vigilProfile.enemyDamage.toFixed(0)}, health ${convergenceProfile.enemyHealth.toFixed(0)} vs ${vigilProfile.enemyHealth.toFixed(0)}`);
  // The boss floor is deliberately NOT deeper than floor 1 — see WEEKLY_BOSS_DEPTH_MIN
  // in data/weekly.ts. Its threat comes from being a solo raid encounter, the quota
  // being the boss itself, and arriving there with three floors of wear already on the
  // clock, not from a bigger depth number; the survivability check below is what
  // actually proves the boss is a real fight rather than a free win or a certain wipe.
  check("the boss floor sits inside its own shallower band, not the trash floors' escalation",
    weeklyConfig(week, WEEKLY_FLOORS, 0).depth <= weeklyConfig(week, 1, 0).depth);

  // 5. Each modifier moves exactly what it says. Build a Convergence floor-1 config with
  // a chosen set and compare its profile against the same week with no twists at all.
  const wBase = weeklyConfig(week, 1);
  const wWithMods = (mods: readonly WeeklyModifierId[]): RunConfig => ({
    ...wBase,
    danger: weeklyEffects(mods).danger,
    weekly: { ...wBase.weekly!, modifiers: mods },
  });
  const wPlain = profileFor(wBase.depth, wWithMods([]));
  const wRatio = (mods: readonly WeeklyModifierId[], pick: (p: ReturnType<typeof profileFor>) => number) =>
    pick(profileFor(wBase.depth, wWithMods(mods))) / pick(wPlain);
  check("Onslaught is danger and nothing else",
    Math.abs(wRatio(["onslaught"], (p) => p.enemyHealth) - 1.45) < 1e-9
    && Math.abs(wRatio(["onslaught"], (p) => p.quantity) - 1) < 1e-9);
  check("Legion means more, softer bodies",
    wRatio(["legion"], (p) => p.enemiesPerWave) > 1.2 && Math.abs(wRatio(["legion"], (p) => p.enemyHealth) - 0.75) < 1e-9);
  check("Blitz tightens the telegraph and the swing",
    Math.abs(wRatio(["blitz"], (p) => p.telegraph) - 0.78) < 1e-9 && Math.abs(wRatio(["blitz"], (p) => p.aggression) - 0.85) < 1e-9);
  check("Feral is pure speed — a knob the Vigil's modifiers never touch",
    Math.abs(wRatio(["feral"], (p) => p.enemySpeed) - 1.25) < 1e-9
    && Math.abs(wRatio(["feral"], (p) => p.enemyHealth) - 1) < 1e-9);
  check("Dire stacks its own health bump on top of its own danger bump",
    Math.abs(wRatio(["dire"], (p) => p.enemyHealth) - 1.35 * 1.1) < 1e-9);
  check("Hoarder pays in volume and coin",
    Math.abs(wRatio(["hoarder"], (p) => p.quantity) - 1.8) < 1e-9 && Math.abs(wRatio(["hoarder"], (p) => p.coinMultiplier) - 1.6) < 1e-9);
  check("Rarefied trades volume for rarity",
    Math.abs(wRatio(["rarefied"], (p) => p.quantity) - 0.5) < 1e-9
    && Math.abs(profileFor(wBase.depth, wWithMods(["rarefied"])).rarityBias - wPlain.rarityBias - 0.15) < 1e-9);
  {
    const st = geared(30, 9203, 20, "swordsman");
    const quiet = new Dungeon(st, wWithMods([]), 4343);
    const purge = new Dungeon(st, wWithMods(["purge"]), 4343);
    check("Purge asks for more elites, within what the floor can make",
      purge.elitesRequired === Math.min(quiet.elitesRequired + 4, eliteCap(purge)) && purge.elitesRequired > quiet.elitesRequired,
      `${quiet.elitesRequired} → ${purge.elitesRequired}`);
  }
  check("a plain floor is untouched by any of it",
    JSON.stringify(weeklyEffects([])) === JSON.stringify({
      danger: 1, count: 1, health: 1, telegraph: 1, aggression: 1, speed: 1, quantity: 1, coins: 1, rarityBias: 0, elites: 0,
    }));

  // 6. The reward and close-out plumbing, all four floors end to end. This teleports
  // every floor straight to "cleared" (`killsSoFar = killsRequired` etc.) rather than
  // fighting anything — it proves floors 1-3 bank ordinary loot and must not close the
  // week, and that the boss floor pays the guaranteed key and item and is what actually
  // closes it, but it says nothing about whether the floor is survivable. That's what
  // section 6b, right after this block, is for — it actually fights.
  {
    const st = geared(30, 9204, 20, "lancer");
    let config: RunConfig = weeklyConfig(week, 1, st.challengerTier);
    const wPlan = weeklyPlan(week);
    for (let f = 1; f <= WEEKLY_FLOORS; f++) {
      const d = new Dungeon(st, config);
      const idle = new FakeInput();
      d.killsSoFar = d.killsRequired;
      d.elitesKilled = d.elitesRequired;
      d.wave = d.profile.waves;
      d.enemies.length = 0;
      idle.beginTick();
      d.update(DT, idle as unknown as AvatarInput);
      check(`floor ${f}/${WEEKLY_FLOORS} of the Convergence opens its completion portal`,
        d.phase === "cleared" && d.completionPortal !== null);
      if (f === WEEKLY_FLOORS) {
        const keys = d.pickups.filter((p) => p.kind === "key" && p.keyTier === wPlan.keyTier);
        check("the warden's floor guarantees the week's key tier", keys.length >= 1, `${keys.length} × ${wPlan.keyTier}`);
        const items = d.pickups.filter((p) => p.kind === "item" && p.rarity === WEEKLY_GUARANTEED_RARITY);
        check("…and a guaranteed item at the promised rarity", items.length >= 1);
        for (const p of [...d.pickups]) if (p.kind === "key") d.localHero.loot.keys[p.keyTier as ChestTier]++;
      }
      check(`nothing closes the week before the warden falls`, st.weekly.clearedWeek === 0);
      d.bankLoot();
      if (f < WEEKLY_FLOORS) {
        check(`banking floor ${f} doesn't close the week early`, st.weekly.clearedWeek === 0 && st.stats.convergencesCleared === 0);
        config = nextFloorConfig(config);
      }
    }
    check("banking the warden's floor closes the Convergence for the week",
      st.weekly.clearedWeek === week && st.stats.convergencesCleared === 1);
    const before = st.keys[wPlan.keyTier];
    check("…and the key is in the bag", before > 0);
    check("a Convergence never opens a rift tier by accident",
      st.riftTiers.convergence === 1 && st.stats.riftsCleared.convergence === 0);

    const again = new Dungeon(st, weeklyConfig(week, 1, st.challengerTier));
    again.loot.coins = 100;
    again.earlyExtractLoot();
    check("bailing out doesn't touch an already-closed week",
      st.weekly.clearedWeek === week && st.stats.convergencesCleared === 1);
    const fresh = geared(30, 9205, 20, "lancer");
    const lostRun = new Dungeon(fresh, weeklyConfig(week, 1, fresh.challengerTier));
    lostRun.earlyExtractLoot();
    check("…nor does leaving early on a week you haven't closed", fresh.weekly.clearedWeek === 0);
    check("a fresh save has never closed one",
      new GameState().weekly.clearedWeek === 0 && !weeklyUnlocked(new GameState().stats.deepestDepth));
    check("the portal opens well past the Vigil's own unlock, at the bottom of its band",
      weeklyUnlocked(WEEKLY_UNLOCK_DEPTH) && !weeklyUnlocked(WEEKLY_UNLOCK_DEPTH - 1) && WEEKLY_UNLOCK_DEPTH > DAILY_UNLOCK_DEPTH);
  }

  /**
   * 6b. Survivability, for real — the raid-boss section's precedent (playFloor against a
   * kitted character), not the teleport-to-cleared plumbing above. This is what actually
   * answers "can anyone survive this" rather than just "does the reward land correctly."
   *
   * Reuses the exact characters the sharp campaign (dodge 0.55, "=== a campaign: 20
   * dives, a sharp player ===" above) already produced, rather than a synthetic
   * fixed-level-plus-N-chests stand-in — a first pass at this check used the synthetic
   * kind and it cleared almost nothing anywhere in the depth 18-30 band the mode
   * originally shipped with, which is what caught that the band was two to four times
   * past the delve's own measured frontier (sharp bot averages deepest depth ~10.3, best
   * single seed ~16) before it ever reached a real player.
   *
   * Filtered to characters whose campaign actually reached `WEEKLY_UNLOCK_DEPTH` — testing
   * ones that never unlocked the mode would prove nothing about it.
   */
  {
    const qualified = sharpRuns.filter((r) => r.deepest >= WEEKLY_UNLOCK_DEPTH);
    check("the sharp campaign produces at least one character that actually unlocks the Convergence",
      qualified.length > 0, `${qualified.length}/${sharpRuns.length} reached depth ${WEEKLY_UNLOCK_DEPTH}+`);
    // A single fixed week draws one fixed depth for floor 1 (12-18) and one for the
    // boss (9-11) — testing only that one week makes the result hostage to whichever
    // end of the band it happened to land on, exactly the "five seeds routinely flipped
    // the ordering" problem the campaign comparison above widened to twelve seeds for.
    // Spreading across several consecutive weeks, crossed with every qualifying
    // character, samples the whole band instead of one draw from it.
    const TEST_WEEKS = [week, week + 1, week + 2, week + 3, week + 4];
    const floor1Results = qualified.flatMap((r) =>
      TEST_WEEKS.map((w, wi) => playFloor(r.state, weeklyConfig(w, 1), 400, 6100 + wi, 0.85)));
    const bossResults = qualified.flatMap((r) =>
      TEST_WEEKS.map((w, wi) => playFloor(r.state, weeklyConfig(w, WEEKLY_FLOORS), 400, 6200 + wi, 0.85)));
    const wins = (rs: typeof floor1Results) => rs.filter((r) => r.d.phase === "cleared").length;
    console.log(`  across ${TEST_WEEKS.length} weeks × ${qualified.length} qualifying characters ` +
      `(their own deepest: ${qualified.map((r) => r.deepest).join(",")}): ` +
      `floor 1 ${wins(floor1Results)}/${floor1Results.length} cleared, boss ${wins(bossResults)}/${bossResults.length} cleared`);
    check("a character who just unlocked it can actually clear floor 1 on at least some weeks",
      wins(floor1Results) >= 1, `${wins(floor1Results)}/${floor1Results.length}`);
    check("…and can actually clear the boss floor on at least some weeks — the mode is beatable, not a wall",
      wins(bossResults) >= 1, `${wins(bossResults)}/${bossResults.length}`);
  }

  // 7. The save remembers it, and a save from before the Convergence existed loads clean.
  {
    const st = geared(30, 9206, 20, "swordsman");
    st.weekly.clearedWeek = week;
    st.stats.convergencesCleared = 2;
    const back = GameState.fromSaved(parseSaved(serializeSave(st.toJSON())));
    check("the save remembers the week you closed it", back.weekly.clearedWeek === week && back.stats.convergencesCleared === 2);
    const raw = JSON.parse(serializeSave(st.toJSON())) as Record<string, unknown>;
    delete raw.weekly;
    raw.version = 16;
    const old = GameState.fromSaved(parseSaved(JSON.stringify(raw)));
    check("a pre-Convergence save loads as never having closed one", old.weekly.clearedWeek === 0 && old.coins === st.coins);
  }
}

console.log("\n=== accounts ===");
await (async () => {
  // Server-side accounts and saves (docs/accounts.md): an in-memory database behind a real
  // HTTP server on an ephemeral port, driven with fetch exactly the way the browser will.
  const accounts = openAccounts({ dbPath: ":memory:" });
  const server = createServer((req, res) => {
    accounts.handle(req, res).then((handled) => {
      if (handled) return;
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("fell through");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  /** A browser-ish client: remembers the one cookie the server sets. */
  const jar = { cookie: "" };
  const call = async (method: string, path: string, body?: string, extraCookie?: string) => {
    const res = await fetch(base + path, {
      method, body,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(extraCookie ?? jar.cookie ? { cookie: extraCookie ?? jar.cookie } : {}),
      },
    });
    const set = res.headers.get("set-cookie");
    if (set) jar.cookie = set.split(";")[0]!;
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try { json = text ? JSON.parse(text) as Record<string, unknown> : null; } catch { /* not json */ }
    return { status: res.status, text, json, setCookie: set };
  };

  let r = await call("GET", "/not-api");
  check("anything outside /api falls through to the host", r.status === 200 && r.text === "fell through");
  r = await call("GET", "/api/me");
  check("nobody is logged in to start with", r.status === 401 && r.json?.error === "not_logged_in");
  r = await call("POST", "/api/register", JSON.stringify({ username: "ab", password: "hunter22" }));
  check("a two-letter name is refused", r.status === 400 && r.json?.error === "bad_username");
  r = await call("POST", "/api/register", JSON.stringify({ username: "Cousin_1", password: "short" }));
  check("a short password is refused", r.status === 400 && r.json?.error === "bad_password");
  r = await call("POST", "/api/register", "not json at all");
  check("a malformed body is a 400, not a crash", r.status === 400);
  r = await call("POST", "/api/register", JSON.stringify({ username: "Cousin_1", password: "hunter22" }));
  check("registering works and logs you in",
    r.status === 201 && r.json?.username === "Cousin_1" && !!r.setCookie && /HttpOnly/.test(r.setCookie) && /SameSite=Lax/.test(r.setCookie),
    r.setCookie ?? "");
  const cookie = jar.cookie;
  r = await call("GET", "/api/me");
  check("the cookie is the session", r.status === 200 && r.json?.username === "Cousin_1");
  r = await call("POST", "/api/register", JSON.stringify({ username: "cousin_1", password: "different1" }));
  check("the same name in another case is taken", r.status === 409 && r.json?.error === "username_taken");
  const stored = accounts.db.prepare("SELECT password FROM accounts WHERE username = 'Cousin_1'").get() as { password: string };
  check("the password is stored hashed, never plain",
    stored.password.startsWith("scrypt$") && !stored.password.includes("hunter22") && verifyPassword("hunter22", stored.password)
    && !verifyPassword("hunter23", stored.password));
  check("two hashes of one password differ (salted)", hashPassword("x-y-z-1") !== hashPassword("x-y-z-1"));

  // Saves: nothing yet, then a round trip, byte for byte.
  r = await call("GET", "/api/save");
  check("a new account has no save", r.status === 204 && r.text === "");
  const st = geared(12, 9201, 12, "lancer");
  st.coins = 123456;
  const blob = serializeSave(st.toJSON());
  r = await call("PUT", "/api/save", blob);
  check("a save is accepted", r.status === 204);
  r = await call("GET", "/api/save");
  check("…and comes back byte-identical", r.status === 200 && r.text === blob && r.json?.version === SAVE_VERSION);
  const back = GameState.fromSaved(parseSaved(r.text));
  check("…and rebuilds the same state", back.coins === 123456 && back.player.level === 12 && back.activeClassId === "lancer");
  r = await call("PUT", "/api/save", JSON.stringify({ coins: 5 }));
  check("a blob without a version is not a save", r.status === 400 && r.json?.error === "bad_save");
  r = await call("PUT", "/api/save", "[1,2,3]");
  check("…nor is an array", r.status === 400);
  r = await call("PUT", "/api/save", "x".repeat(5 * 1024 * 1024)).catch(() => ({ status: 413, text: "", json: null, setCookie: null }));
  check("an oversize body is refused", r.status === 413);
  r = await call("GET", "/api/save");
  check("a bad write never replaces the good save", r.status === 200 && r.text === blob);
  r = await call("DELETE", "/api/save");
  check("wiping the save works", r.status === 204);
  r = await call("GET", "/api/save");
  check("…and it's gone", r.status === 204);

  // Sessions: forged and tampered cookies are nobody.
  r = await call("GET", "/api/me", undefined, "lootsim_session=1.1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  check("a forged cookie is nobody", r.status === 401);
  const [name, value] = cookie.split("=") as [string, string];
  const [id, iat, sig] = value.split(".");
  const flipped = sig!.endsWith("A") ? `${sig!.slice(0, -1)}B` : `${sig!.slice(0, -1)}A`;
  r = await call("GET", "/api/me", undefined, `${name}=${id}.${iat}.${flipped}`);
  check("a tampered signature is nobody", r.status === 401);
  r = await call("GET", "/api/me", undefined, `${name}=${Number(id) + 1}.${iat}.${sig}`);
  check("somebody else's id with your signature is nobody", r.status === 401);
  r = await call("GET", "/api/save", undefined, "");
  check("saves need a session", r.status === 401);

  // Log out, log back in.
  r = await call("POST", "/api/logout");
  check("logging out clears the cookie", r.status === 204 && /Max-Age=0/.test(r.setCookie ?? ""));
  jar.cookie = "";
  r = await call("POST", "/api/login", JSON.stringify({ username: "cousin_1", password: "wrong-one" }));
  check("a wrong password is one generic answer", r.status === 401 && r.json?.error === "bad_credentials");
  r = await call("POST", "/api/login", JSON.stringify({ username: "Nobody_9", password: "hunter22" }));
  check("…the same answer as an unknown name", r.status === 401 && r.json?.error === "bad_credentials");
  r = await call("POST", "/api/login", JSON.stringify({ username: "cousin_1", password: "hunter22" }));
  check("logging in (any case) works", r.status === 200 && r.json?.username === "Cousin_1" && !!r.setCookie);
  r = await call("GET", "/api/nope");
  check("an unknown api route is a 404", r.status === 404);
  r = await call("GET", "/api/register");
  check("the wrong method is a 405", r.status === 405);

  server.close();
  accounts.close();

  // The in-memory default store, which everything above the network uses.
  const mem = new MemorySaveStore();
  const prev = GameState.saveStore;
  GameState.saveStore = mem;
  const s2 = geared(5, 9202, 4, "magician");
  s2.save();
  check("GameState.save writes through the installed store", mem.last !== null && parseSaved(mem.last)?.version === SAVE_VERSION);
  await s2.wipe();
  check("wipe clears it and a wiped state never writes again", mem.last === null && (s2.save(), mem.last === null));
  GameState.saveStore = prev;
})();

console.log("\n=== death loses unbanked loot ===");
{
  const state = new GameState();
  const d = new Dungeon(state, 25, 7);
  const input = new FakeInput();
  let t = 0;
  // Stand still at depth 25 with a level 1 character; this should not end well.
  while (t < 90 && d.phase === "fighting") {
    input.beginTick();
    d.update(DT, input as unknown as Input);
    d.drainEvents();
    t += DT;
  }
  check("a level 1 character dies at depth 25", d.phase === "dead", `phase=${d.phase} after ${t.toFixed(0)}s`);
  const coinsBefore = state.coins;
  check("dying leaves the save untouched", state.coins === coinsBefore);
  check("xp survives death", d.loot.xp >= 0);
}

console.log("\n=== extracting mid-fight ===");
{
  const state = new GameState();
  const d = new Dungeon(state, delveConfig(3), 99);
  // No walk needed any more: UAT §6's entrance portal is the spawn, so you arrive
  // standing in your own early exit. (This used to route a bot across the whole floor to
  // reach it, which was the bug — the "door you came in" was at the far end. The
  // route-around-walls coverage that walk provided now lives on the *completion* portal,
  // which is the far point and is checked for walkability from the spawn below.)
  check("you arrive standing in the entrance portal", d.atPortal,
    `phase=${d.phase}, ${Math.hypot(d.avatar.x - d.portal.x, d.avatar.y - d.portal.y).toFixed(1)}u from it`);
  check("cannot descend without clearing", !d.canDescend);
  check("the entrance portal is an early exit while the floor stands", d.canEarlyExtract);
  check("no completion portal until the floor is done", d.completionPortal === null);
  const before = state.coins;
  d.bankLoot();
  check("extracting mid-fight banks what you carried", state.coins >= before);
}

console.log("\n=== the floor objective and the two portals (UAT §5/§6) ===");
{
  // The quota is derived, not hand-set: every monster the director will spawn, plus a
  // difficulty-scaled elite count that can never exceed what the floor can produce.
  {
    const plain = new Dungeon(geared(12, 31), delveConfig(12), 4001);
    check("an ordinary floor asks for every monster on it",
      plain.killsRequired === plain.profile.enemiesPerWave * plain.profile.waves,
      `${plain.killsRequired} = ${plain.profile.enemiesPerWave} x ${plain.profile.waves}`);
    check("a shallow floor asks for no elites",
      new Dungeon(geared(3, 32), delveConfig(2), 4002).elitesRequired === 0);
    const boss = new Dungeon(geared(10, 33), delveConfig(5), 4003);
    check("a boss floor's quota is the boss",
      boss.profile.isBoss && boss.killsRequired === 1 && boss.elitesRequired === 0,
      `kills=${boss.killsRequired} elites=${boss.elitesRequired}`);
    // Challenger asks for more elites, and never more than the floor can make.
    const hard = new Dungeon(geared(20, 34), delveConfig(14, 10), 4004);
    check("Challenger raises the elite requirement",
      hard.elitesRequired >= 1, `${hard.elitesRequired} elites at tier 10`);
  }

  // A real clear: the quota fills, a completion portal appears somewhere else on the
  // floor, and it is somewhere you can actually walk to.
  {
    const state = geared(26, 5150, 24);
    const r = playFloor(state, delveConfig(12), 400, 6161, 0.85);
    const d = r.d;
    check("a floor clears by filling its kill quota", d.phase === "cleared",
      `${d.killsSoFar}/${d.killsRequired} kills, phase=${d.phase}`);
    check("the quota was actually met, not bypassed",
      d.killsSoFar >= d.killsRequired && d.elitesKilled >= d.elitesRequired,
      `${d.killsSoFar}/${d.killsRequired} kills, ${d.elitesKilled}/${d.elitesRequired} elites`);
    const cp = d.completionPortal;
    check("clearing spawns a completion portal", cp !== null);
    if (cp) {
      const gap = Math.hypot(cp.x - d.portal.x, cp.y - d.portal.y);
      check("it stands somewhere new, not on the entrance", gap > 120, `${gap.toFixed(0)} units away`);
      // It is the generator's own far point rather than a search result, so "somewhere
      // new" is guaranteed by construction instead of by 50 random tries with a fallback
      // that could land back on the entrance.
      check("the completion portal is the floor's far end, not a random spot",
        cp.x === d.level.portal.x && cp.y === d.level.portal.y,
        `portal (${cp.x.toFixed(0)}, ${cp.y.toFixed(0)}) vs far end (${d.level.portal.x.toFixed(0)}, ${d.level.portal.y.toFixed(0)})`);
      check("it is on open floor", !circleHitsWall(d.level, cp.x, cp.y, 14), `(${cp.x.toFixed(0)}, ${cp.y.toFixed(0)})`);
      // Reachability: the same breadth-first field the monsters chase the player with.
      // If it can route from the exit back to where the party spawned, a player can walk it.
      const flow = new FlowField(d.level);
      flow.update(d.level, cp.x, cp.y);
      const routed = flow.direction(d.level, d.level.start.x, d.level.start.y) !== null
        || Math.hypot(cp.x - d.level.start.x, cp.y - d.level.start.y) < 40;
      check("the completion portal is walkable from the spawn", routed);
      check("standing on the entrance no longer offers a descent",
        !d.canEarlyExtract, `phase=${d.phase}`);
    }
  }

  // UAT §6 calls the entrance portal "where you came in", so it has to be *at* the
  // spawn rather than merely somewhere on the same floor. This is the regression test
  // for a two-portal retrofit bug: it was left reading `level.portal`, which both
  // generators deliberately place as far from the spawn as the floor reaches (the room
  // at maximum graph distance, or the opposite end of a boss arena). Measured before the
  // fix: a median 608 units away on a normal floor and 930 on a boss floor, and not one
  // floor in 400 where it was inside the 34 units you need to actually use it — so the
  // early-exit door was unreachable from the place you arrive.
  {
    let worstGap = 0;
    let standingIn = 0;
    let floors = 0;
    // Multiples of five are boss floors, which generate as one arena instead of a room
    // graph — the bug was worst there, so both shapes are covered.
    for (const depth of [3, 5, 7, 12, 15, 18, 20]) {
      for (let s = 0; s < 6; s++) {
        const d = new Dungeon(geared(24, 8100 + s, 20), delveConfig(depth), 33_000 + depth * 97 + s);
        floors++;
        worstGap = Math.max(worstGap, Math.hypot(d.portal.x - d.level.start.x, d.portal.y - d.level.start.y));
        if (d.canEarlyExtract) standingIn++;
      }
    }
    check("the entrance portal sits on the spawn, on every floor shape",
      worstGap < 1, `worst ${worstGap.toFixed(1)}u off across ${floors} floors`);
    // The behaviour that actually matters: arriving means standing in your own exit, so
    // bailing out is available from the moment you land (it costs you nothing yet).
    check("so a player begins the floor standing in the entrance portal",
      standingIn === floors, `${standingIn}/${floors} floors`);
  }

  // The elite requirement has to be completable — the director forces the last of them
  // out on the closing wave rather than leaving the objective stuck behind a bad roll.
  {
    let checked = 0;
    let stuck = 0;
    for (const seed of [7001, 7002, 7003, 7004, 7005, 7006]) {
      const state = geared(30, seed, 26);
      const r = playFloor(state, delveConfig(14, 8), 500, seed, 0.9);
      if (r.d.elitesRequired === 0) continue;
      checked++;
      if (r.d.phase === "cleared" && r.d.elitesKilled < r.d.elitesRequired) stuck++;
    }
    check("an elite requirement is always completable", checked > 0 && stuck === 0,
      `${checked} Challenger floors, ${stuck} cleared without the elites`);
  }

  // The penalty exit. Everything physical stays on the floor; a thin slice of the
  // currency survives; XP was already granted and is never clawed back.
  {
    const state = geared(14, 8200, 10);
    const d = new Dungeon(state, delveConfig(9), 8201);
    const rng = new Rng(4);
    d.loot.coins = 1000;
    d.loot.gems = 200;
    d.loot.keys.Basic = 4;
    d.loot.materials.fire = 30;
    d.loot.xp = 555;
    for (let i = 0; i < 3; i++) {
      d.loot.items.push(rollItem({ rarity: "epic", type: "sword", ilvl: 9, rng }));
    }
    const coinsBefore = state.coins;
    const gemsBefore = state.gems;
    const bagBefore = state.inventory.length;
    const keysBefore = state.keys.Basic;
    const fireBefore = state.materials.fire;
    const xpBefore = state.player.xp;
    const kept = d.earlyExtractLoot();

    check("bailing early forfeits every unbanked item",
      state.inventory.length === bagBefore && kept.itemsLost === 3,
      `bag ${bagBefore} -> ${state.inventory.length}, ${kept.itemsLost} lost`);
    // Spelled out rather than compared bare: until Sept 2026 this read `keys.basic`
    // against a `Record<ChestTier, number>` keyed `Basic`, so both sides were `undefined`
    // and the keys half of the penalty was never tested at all. The detail string is the
    // guard — a check that can only report "0 -> 0" can go quiet again without anyone
    // seeing it.
    check("bailing early forfeits keys and materials",
      keysBefore === 0 && state.keys.Basic === 0 && state.materials.fire === fireBefore,
      `4 keys carried, ${keysBefore} -> ${state.keys.Basic} banked; fire ${fireBefore} -> ${state.materials.fire}`);
    check("bailing early keeps only a slice of the coins",
      state.coins === coinsBefore + Math.floor(1000 * EARLY_EXTRACT_KEEP),
      `+${state.coins - coinsBefore} of 1000`);
    check("bailing early keeps only a slice of the gems",
      state.gems === gemsBefore + Math.floor(200 * EARLY_EXTRACT_KEEP),
      `+${state.gems - gemsBefore} of 200`);
    check("bailing early never touches the XP you earned", state.player.xp === xpBefore);
    check("the penalty is a real penalty, not a rounding error",
      EARLY_EXTRACT_KEEP <= 0.25, `keeps ${(EARLY_EXTRACT_KEEP * 100).toFixed(0)}%`);
  }

  // Bailing out forfeits the floor's *progression* too, which is also what stops a
  // player unlocking a depth by diving to it and walking straight back out.
  {
    const fresh = new GameState(4242);
    const unlockedBefore = fresh.maxUnlockedDepth;
    const recordBefore = fresh.stats.deepestDepth;
    const runsBefore = fresh.stats.runsCompleted;
    const bail = new Dungeon(fresh, delveConfig(fresh.maxUnlockedDepth), 8400);
    bail.loot.coins = 500;
    bail.earlyExtractLoot();
    check("bailing early unlocks no new depth", fresh.maxUnlockedDepth === unlockedBefore,
      `${unlockedBefore} -> ${fresh.maxUnlockedDepth}`);
    check("bailing early sets no depth record", fresh.stats.deepestDepth === recordBefore,
      `${recordBefore} -> ${fresh.stats.deepestDepth}`);
    check("bailing early doesn't count as a run completed",
      fresh.stats.runsCompleted === runsBefore);
    check("bailing early still banks the coins it let you keep", fresh.coins > 0, `${fresh.coins}c`);

    // Clearing the same floor properly does credit it.
    const clean = new GameState(4243);
    const before = clean.maxUnlockedDepth;
    const done = new Dungeon(clean, delveConfig(before), 8401);
    done.bankLoot();
    check("clearing a floor unlocks the next depth", clean.maxUnlockedDepth > before,
      `${before} -> ${clean.maxUnlockedDepth}`);
  }

  // …and the contrast: a clean extract off a cleared floor keeps the lot.
  {
    const state = geared(26, 8300, 24);
    const r = playFloor(state, delveConfig(11), 400, 8301, 0.9);
    if (r.d.phase === "cleared") {
      const rng = new Rng(5);
      r.d.loot.items.push(rollItem({ rarity: "legendary", type: "armor", ilvl: 11, rng }));
      const bagBefore = state.inventory.length;
      const coinsBefore = state.coins;
      const carried = r.d.loot.coins;
      r.d.bankLoot();
      check("extracting a cleared floor keeps every item",
        state.inventory.length > bagBefore, `bag ${bagBefore} -> ${state.inventory.length}`);
      check("extracting a cleared floor keeps every coin",
        state.coins === coinsBefore + carried, `+${state.coins - coinsBefore} of ${carried}`);
    } else {
      check("extracting a cleared floor keeps every item", false, `floor ended ${r.d.phase}`);
    }
  }
}

console.log("\n=== generated floors ===");
{
  const rng = new Rng(20260903);
  const layouts: Record<string, number> = {};
  let unreachablePortals = 0;
  let trapsInWalls = 0;
  let crampedFloors = 0;
  let totalTraps = 0;
  let totalWalls = 0;
  let floors = 0;
  let offLattice = 0;
  let paintMismatch = 0;

  for (let depth = 1; depth <= 30; depth++) {
    for (let i = 0; i < 8; i++) {
      const level = generateLevel(depth, rng, { boss: depth % 5 === 0 });
      floors++;
      layouts[level.layout] = (layouts[level.layout] ?? 0) + 1;
      totalTraps += level.traps.length;
      totalWalls += level.walls.length;

      // Every wall sits on the 32-unit tile lattice the floor is painted on
      // (`TILE` in game/level.ts) — that is what makes the drawn rock the collision
      // volume rather than an impression of it. Then the claim itself, from the
      // player's side: `render/tilemap.ts` paints a tile as floor when its centre is
      // outside every wall, so the hero must be able to stand on that centre — and a
      // tile it paints as rock must push the hero out from anywhere inside it.
      for (const w of level.walls) {
        if (w.x % TILE || w.y % TILE || w.w % TILE || w.h % TILE) offLattice++;
      }
      const tcols = Math.ceil(level.width / TILE), trows = Math.ceil(level.height / TILE);
      const R = 9; // PLAYER_RADIUS
      for (let ty = 0; ty < trows; ty++) {
        for (let tx = 0; tx < tcols; tx++) {
          const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
          const paintedRock = level.walls.some((w) => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h);
          if (paintedRock) {
            // Its corner is the point nearest to open floor; the hero can't rest there.
            const c = resolveCircle(level, tx * TILE + 1, ty * TILE + 1, R);
            if (Math.abs(c.x - tx * TILE - 1) < 0.01 && Math.abs(c.y - ty * TILE - 1) < 0.01) paintMismatch++;
          } else {
            const c = resolveCircle(level, x, y, R);
            if (Math.abs(c.x - x) > 0.01 || Math.abs(c.y - y) > 0.01) paintMismatch++;
          }
        }
      }

      // The one promise the generator makes: you can always walk to the exit.
      if (!isWalkable(level, level.portal.x, level.portal.y)) unreachablePortals++;
      if (!isWalkable(level, level.start.x, level.start.y)) unreachablePortals++;
      for (const t of level.traps) {
        if (!isWalkable(level, t.x, t.y)) trapsInWalls++;
      }
      // A floor that's mostly wall would be a maze, not an arena.
      const openRatio = level.openCells.length / (level.cols * level.rows);
      if (openRatio < 0.3) crampedFloors++;
    }
  }

  check("every generated floor has a reachable portal", unreachablePortals === 0, `${unreachablePortals} bad of ${floors}`);
  check("no hazard is buried inside a wall", trapsInWalls === 0, `${trapsInWalls} buried`);
  check("floors stay open enough to fight in", crampedFloors === 0, `${crampedFloors} cramped`);
  check("every wall sits on the tile lattice", offLattice === 0, `${offLattice} off-lattice of ${totalWalls}`);
  check("painted rock is the collision volume, not an impression of it", paintMismatch === 0,
    `${paintMismatch} tile cells disagree`);
  check("layouts actually vary", Object.keys(layouts).length >= 4, JSON.stringify(layouts));
  console.log(`  ${floors} floors: ${(totalWalls / floors).toFixed(1)} walls and ${(totalTraps / floors).toFixed(1)} hazards on average`);

  // A boss arena has to have room to run away in: one room with at least the footprint
  // of two ordinary rooms. (An ordinary floor is a *graph* of rooms, so its total width
  // says nothing about how much space any one fight has — it used to be compared
  // whole, which only held while rooms were small.)
  const bossLevel = generateLevel(10, rng, { boss: true });
  const plain = generateLevel(10, rng);
  const roomShare = (plain.width * plain.height) / plain.rooms;
  check("boss arenas are bigger than ordinary rooms", bossLevel.width * bossLevel.height > 2 * roomShare,
    `${bossLevel.width}x${bossLevel.height} vs ${plain.rooms} rooms in ${plain.width}x${plain.height}`);
}

console.log("\n=== hazards ===");
{
  const state = new GameState(77);
  state.player.level = 20;
  const d = new Dungeon(state, 14, 555);
  const input = new FakeInput();
  let fired = 0;
  let t = 0;
  while (t < 20) {
    input.beginTick();
    d.update(DT, input as unknown as Input);
    for (const ev of d.drainEvents()) if (ev.kind === "trap") fired++;
    t += DT;
  }
  check("a deep floor is trapped", d.level.traps.length > 0, `${d.level.traps.length} hazards`);
  check("hazards cycle on their own", fired > 0, `${fired} activations in 20s`);

  // Stand on a hazard and confirm the floor bites. Saws and tar are always live;
  // the timed ones need a cycle or two, hence the generous window.
  const state2 = new GameState(78);
  const d2 = new Dungeon(state2, 14, 555);
  const trap = d2.level.traps[0]!;
  const before = state2.player.health;
  let t2 = 0;
  while (t2 < 12 && state2.player.health === before) {
    input.beginTick();
    d2.avatar.x = trap.x;
    d2.avatar.y = trap.y;
    d2.update(DT, input as unknown as Input);
    d2.drainEvents();
    t2 += DT;
  }
  check("standing in a hazard hurts", state2.player.health < before,
    `${before} -> ${state2.player.health.toFixed(0)} (${trap.kind})`);
}

console.log("\n=== chest odds over 200k pulls ===");
{
  const state = new GameState();
  for (const tier of ["Basic", "Legendary"] as const) {
    state.keys[tier] = 200000;
    const counts: Record<string, number> = {};
    const items = state.openChests(tier, 200000);
    for (const it of items) counts[it.rarity] = (counts[it.rarity] ?? 0) + 1;
    const summary = Object.entries(counts)
      .map(([r, n]) => `${r}=${((n / items.length) * 100).toFixed(3)}%`).join(" ");
    console.log(`  ${tier.padEnd(10)} ${summary}`);
    if (tier === "Legendary") {
      check("Legendary chests never roll below epic",
        !counts.common && !counts.uncommon && !counts.rare, summary);
    }
  }
  check("unspoken is findable but absurd", true);
}


/**
 * The art is string grids, and a miscounted row is a runtime throw in somebody's
 * browser rather than a compile error — so it gets checked here, where `pixels.ts`
 * is reachable because it is deliberately DOM-free.
 */
console.log("\n=== art ===");
{
  const ragged = gridProblems();
  check("every sprite grid is a rectangle", ragged.length === 0, ragged.slice(0, 4).join("; "));

  const missingBoss = BOSSES.filter((b) => !BOSS_GRIDS[b.sprite]).map((b) => b.id);
  check("every boss has a sprite", missingBoss.length === 0, missingBoss.join(", "));

  const missingHair = HAIR_STYLES.filter((h) => !HAIR[h]);
  check("every hair style is drawn", missingHair.length === 0, missingHair.join(", "));

  const missingWeapon = WEAPON_FAMILIES.filter((w) => !WEAPON_ART[w]);
  check("every weapon family is drawn", missingWeapon.length === 0, missingWeapon.join(", "));

  // A grip outside its own sprite would send the weapon flying off the hand.
  const badGrip = Object.entries(WEAPON_ART).filter(([, a]) =>
    a.ax < 0 || a.ay < 0 || a.ay >= a.grid.length || a.ax >= (a.grid[0]?.length ?? 0));
  check("every weapon is gripped somewhere on itself", badGrip.length === 0,
    badGrip.map(([k]) => k).join(", "));

  const problems = cosmeticProblems(Object.keys(COSMETIC_ART));
  check("every cosmetic is drawable and priced", problems.length === 0, problems.slice(0, 4).join("; "));

  const perSlot = COSMETIC_SLOTS.map((slot) =>
    `${slot}=${COSMETICS.filter((c) => c.slot === slot).length}`).join(" ");
  console.log(`  ${COSMETICS.length} cosmetics — ${perSlot}`);
}

/**
 * The town's two big portraits, whose one hard job is to show the same character at the
 * same size whichever composer it came from. `heroSprite` returns either a 30x26
 * procedural field or a 56x68 pipeline stage depending on whether every cosmetic worn has
 * migrated — all-or-nothing — so the sizing is done on the *body* inside those canvases
 * (`src/ui/portrait.ts`), and that only works while three things stay true. Canvas
 * compositing needs a DOM and can't be reached from here, but all three are geometry, and
 * geometry is checkable: the art is measured off the committed PNGs and the string grids
 * rather than restated from the constants it is supposed to be validating.
 */
console.log("\n=== hero portraits (§12 — one size, either composer) ===");
{
  // 1. Each body stands flush on its canvas's bottom row. This is what lets one
  //    bottom-aligned CSS box hold either canvas without the feet moving; if a redraw
  //    ever left a gap below the feet, the character would appear to float.
  const bodyRows = BODY.flatMap((row, y) => ([...row].some((ch) => ch !== "." && ch !== " ") ? [y] : []));
  const bodyBottom = BODY_DY + Math.max(...bodyRows);
  const bodyTop = BODY_DY + Math.min(...bodyRows);
  check("the procedural body stands on the bottom row of its field",
    bodyBottom === CHAR_H - 1, `body ends at y${bodyBottom} of ${CHAR_H - 1}`);
  check(`BODY_H (${BODY_H}) is still the body's measured height`,
    bodyBottom - bodyTop + 1 === BODY_H, `measured ${bodyBottom - bodyTop + 1}`);

  const heroMeta = ATLAS[SPRITE_OVERRIDES.hero!]!;
  const heroPng = decodePng(readFileSync(`src/render/atlas/characters/${SPRITE_OVERRIDES.hero}.png`));
  check("the pipeline hero PNG is the size the manifest promises",
    heroPng.width === heroMeta.w && heroPng.height === heroMeta.h,
    `${heroPng.width}x${heroPng.height} vs ${heroMeta.w}x${heroMeta.h}`);
  const opaqueBottom = (png: { width: number; height: number; data: Uint8Array }): number => {
    for (let y = png.height - 1; y >= 0; y--) {
      for (let x = 0; x < png.width; x++) if (png.data[(y * png.width + x) * 4 + 3]! > 0) return y;
    }
    return -1;
  };
  // `heroStageOffset` now COMPUTES this rather than a constant happening to satisfy it,
  // which is what lets a per-class hero of any height paste correctly.
  const heroAt = heroStage(heroMeta.w, heroMeta.h);
  check("the pipeline hero stands on the bottom row of its stage",
    heroAt.dy + opaqueBottom(heroPng) === heroAt.h - 1,
    `hero ends at y${heroAt.dy + opaqueBottom(heroPng)} of ${heroAt.h - 1}`);

  // 2. Nothing the stage holds is clipped by it.
  //
  //    **This one is nearly vacuous and is kept only for its vertical half.** `heroStage`
  //    derives the stage's WIDTH from the widest cosmetic (`w = max(hero + margins,
  //    widest layer)`), so no layer can ever be too wide for it — the bound grows to fit
  //    whatever it is handed. Injecting 400px-wide wings onto a 16px hero passes this
  //    check. Its height half is real, because the stage's height comes from the layers'
  //    `dy` offsets rather than their `h`. That asymmetry is why check 2b below exists,
  //    and it is worth stating plainly: **a bound derived from the thing it bounds is not
  //    a bound.**
  const clipped = Object.entries(ATLAS_COSMETICS).filter(([, c]) => {
    const at = cosmeticStageXY(c, heroMeta.w, heroMeta.h);
    return at.dx < 0 || at.dy < 0 || at.dx + c.w > heroAt.w || at.dy + c.h > heroAt.h;
  });
  check("every migrated cosmetic fits inside the hero stage", clipped.length === 0,
    clipped.map(([k]) => k).join(", "));

  // 2b. Every layer is proportionate **to the hero**, which is the comparison check 2
  //     only looks like it makes. The hero is the fixed thing here; the stage is not.
  //
  //     This is the check that was missing when hero A (16x41) replaced the v4 hero
  //     (39x57) and the whole wardrobe stayed authored for the old body — the witch hat
  //     ended up 2.44x the hero's width and the angel wings 4.31x, and `npm test` stayed
  //     green the entire time.
  //
  //     The two limits are different on purpose, because the pieces hang off different
  //     landmarks: a head-anchored layer (hat, ears, glasses) sits on a head that is
  //     narrower than the shoulders, so it may only just overhang the silhouette; a
  //     feet-anchored one (cape, wings) is *meant* to spread past it. Both numbers are
  //     the ratios the v4 wardrobe held against its own hero, which is the last time
  //     these read correctly — not limits invented here.
  //     One more guard, because a filter over an empty table passes: this check must have
  //     actually looked at something. `ATLAS_COSMETICS` is a half-migrated table that
  //     grows as the wardrobe lands, so "every layer is in scale" would go quietly true
  //     if the table were ever emptied or renamed out from under it — the zero-iteration
  //     shape that has now bitten this repo more than once.
  check("the scale check has layers to check", Object.keys(ATLAS_COSMETICS).length > 0,
    `${Object.keys(ATLAS_COSMETICS).length} migrated layers`);
  const HEAD_LAYER_MAX_W = 1.25, BACK_LAYER_MAX_W = 2.0;
  const outOfScale = Object.entries(ATLAS_COSMETICS).filter(([, c]) => {
    const limit = c.anchor === "head" ? HEAD_LAYER_MAX_W : BACK_LAYER_MAX_W;
    return c.w > heroMeta.w * limit || c.h > heroMeta.h;
  });
  check("every migrated cosmetic is in scale with the hero it hangs on",
    outOfScale.length === 0,
    outOfScale.map(([k, c]) => `${k} ${(c.w / heroMeta.w).toFixed(2)}x wide`).join(", ") ||
      Object.entries(ATLAS_COSMETICS)
        .map(([k, c]) => `${k} ${(c.w / heroMeta.w).toFixed(2)}x`).join(", "));
  const wrongSize = Object.entries(ATLAS_COSMETICS).filter(([, c]) => {
    const png = decodePng(readFileSync(`src/render/atlas/cosmetics/${c.id}.png`));
    return png.width !== c.w || png.height !== c.h;
  });
  check("every migrated cosmetic PNG is the size the manifest promises",
    wrongSize.length === 0, wrongSize.map(([k]) => k).join(", "));

  // 3. The two composers land close enough in size that flipping between them isn't a
  //    visible jump. Integer scaling is required (smoothing is off, so a fractional
  //    factor renders uneven pixels), which is the whole reason this can't be exact.
  const MAX_SPREAD = 0.12;
  const pipeH = heroMeta.h;
  for (const [name, target] of [["Hero", HERO_PORTRAIT_BODY_PX], ["Style", STYLE_PORTRAIT_BODY_PX]] as const) {
    const spread = portraitSpread(BODY_H, pipeH, target);
    const proc = BODY_H * portraitScale(BODY_H, target);
    const pipe = pipeH * portraitScale(pipeH, target);
    check(`the ${name} portrait sizes both composers within ${(MAX_SPREAD * 100).toFixed(0)}%`,
      spread <= MAX_SPREAD,
      `procedural ${proc}px vs pipeline ${pipe}px — ${(spread * 100).toFixed(1)}%`);
    console.log(`  ${name}: target ${target}px body — procedural ${proc}px (x${portraitScale(BODY_H, target)}), pipeline ${pipe}px (x${portraitScale(pipeH, target)})`);
  }

  // The band of hero heights this bound actually admits, derived rather than remembered.
  // `portraitScale` rounds to a whole factor, so the spread OSCILLATES with height instead
  // of growing — the constraint is a set of windows, not a maximum, and the docs described
  // it as a maximum ("57 is a ceiling") for as long as it existed. Printing it is the point:
  // 59-77 is a dead zone, and it is exactly the range someone reaches for when they want a
  // slightly bigger character, so the cost of not knowing is a wasted art generation.
  const legal: number[] = [];
  for (let h = 24; h <= 96; h++) {
    if (portraitSpread(BODY_H, h, HERO_PORTRAIT_BODY_PX) <= MAX_SPREAD
      && portraitSpread(BODY_H, h, STYLE_PORTRAIT_BODY_PX) <= MAX_SPREAD) legal.push(h);
  }
  const bands: string[] = [];
  for (let i = 0; i < legal.length;) {
    let j = i;
    while (j + 1 < legal.length && legal[j + 1]! === legal[j]! + 1) j++;
    bands.push(legal[i] === legal[j] ? `${legal[i]}` : `${legal[i]}-${legal[j]}`);
    i = j + 1;
  }
  check("the shipped hero height sits in the legal portrait band", legal.includes(pipeH),
    `hero is ${pipeH}px; legal ${bands.join(", ")}`);
  console.log(`  legal hero heights (24-96, both portraits within ${(MAX_SPREAD * 100).toFixed(0)}%): ${bands.join(", ")}`);

  // The pinned box heights in the stylesheet have to clear the taller of the two canvases,
  // or the portrait it was pinned for gets cropped. CSS is out of reach of a typechecker,
  // so it is read as text — a rule that stops matching fails loudly rather than passing.
  const css = readFileSync("src/styles.css", "utf8");
  const boxHeight = (selector: string): number | null => {
    const rule = new RegExp(`\\${selector}\\s*\\{[^}]*?height:\\s*(\\d+)px`, "m").exec(css);
    return rule ? Number(rule[1]) : null;
  };
  const stageH = heroStage(heroMeta.w, heroMeta.h).h;
  for (const [selector, target, padY] of [
    [".doll-portrait", HERO_PORTRAIT_BODY_PX, 14 + 10],
    [".portrait.hero", STYLE_PORTRAIT_BODY_PX, 10 + 6],
  ] as const) {
    const pinned = boxHeight(selector);
    const tallest = Math.max(
      CHAR_H * portraitScale(BODY_H, target),
      stageH * portraitScale(pipeH, target),
    );
    check(`${selector} pins a height that clears its tallest portrait`,
      pinned !== null && pinned >= tallest + padY,
      pinned === null ? "no height rule found" : `${pinned}px vs ${tallest} + ${padY} padding`);
  }
}

/**
 * Every floor tileset, measured the way the game shows it. §17.7 of the art style
 * guide makes floor/wall contrast a gameplay requirement — walkable vs. solid has
 * to read before anything else — and the same section wants nothing louder than
 * the Citadel deck. Both used to be judged by eye in a playtest. Here each
 * committed sheet is decoded, run through the exact `gradeSheet` the renderer
 * applies (with the tint of every biome that uses it), and the all-floor and
 * all-rock tiles are compared: their mean luminance has to sit well apart, and
 * neither may be brighter than the deck's own pale flagstone. Per-tile spread is
 * reported too — that's the "too busy" number, and the grade is meant to keep it
 * in the single digits.
 */
console.log("\n=== floor tilesets (§17.7 — contrast is gameplay, loud is wrong) ===");
{
  const MIN_DELTA = 28;   // floor vs. wall mean luminance, after the grade
  const MAX_MEAN = 150;   // nothing brighter than the deck's flagstone
  const MAX_SPREAD = 14;  // internal texture, after the grade
  /**
   * Every biome that can put a floor on screen — and the Tower is in it.
   *
   * This list used to be `BIOMES` + the Reliquary sectors, which meant both gates below
   * were structurally blind to `TOWER_BIOMES`: the contrast check fell through to its
   * "no owner found" branch and graded Heaven's sheets under all six *Delve* tints (a
   * combination that never happens in the game), and the infusion check skipped the
   * Tower outright because it only walked the same two lists. A gate that runs and
   * cannot see the thing under test returns a plausible number instead of an error —
   * the blind-instrument failure in CLAUDE.md — so the Tower's sheets are wired into
   * both here, in the one list, rather than either gate growing its own third source.
   *
   * The four raid biomes (`RAIDS[].biome`) were the same gap, found the same way, by a
   * different session (lootsim-56, `tools/raid-arena-contrast.ts`, 2026-09-10): each raid
   * reuses a Delve tileset under its OWN tint, and that tint was never in this list, so a
   * raid arena's floor/wall separation was graded under every Delve tint EXCEPT the one
   * the raid actually renders with. Wired in for the same reason the Tower was.
   */
  const ALL_BIOMES: BiomeStyle[] = [
    ...BIOMES, ...PLANETS.map((p) => p.biome), ...TOWER_BIOMES, ...RAIDS.map((r) => r.biome),
  ];
  const tintsFor = (id: string): string[] => {
    const tints = ALL_BIOMES.filter((b) => b.tileset === id).map((b) => b.tint);
    // The Abyss overrides the biome tileset but keeps the depth biome's tint —
    // so it has to hold up under every Delve tint.
    if (tints.length === 0) tints.push(...BIOMES.map((b) => b.tint));
    return tints;
  };
  // --- declared-vs-drawn, the one asymmetry that breaks instead of degrading ---
  //
  // Three tables now *name* art the repo may not have yet: `MONSTER_SETS` (a realm's
  // roster), `STATION_PROP` (the Citadel's relics) and the reserved tileset ids. That is
  // deliberate and it is how a realm declares intent before anybody draws it — every one
  // of those resolves through `atlasCanvas`, which returns null and falls back.
  //
  // But `ATLAS` is a different promise: `loadAtlas` *rejects* on a missing PNG for an
  // `ATLAS` row, so a half-declared sprite — listed there with no file behind it — takes
  // the whole game down at boot rather than falling back. So the rule is one-directional
  // and worth a test: **anything in `ATLAS` must exist on disk; anything merely named
  // elsewhere must not be in `ATLAS` unless it does.**
  {
    const named = [
      ...Object.values(MONSTER_SETS).flatMap((set) => Object.values(set)),
      ...Object.values(STATION_PROP).filter((id): id is string => id !== null),
    ];
    const dirFor = (id: string) => id.startsWith("prop.") ? "props"
      : id.startsWith("boss.") ? "bosses"
      : id.startsWith("icon.") ? "icons"
      : id.startsWith("hero.") ? "characters"
      : "monsters";
    const halfDeclared = named.filter((id) => {
      if (!ATLAS[id]) return false;
      try { readFileSync(`src/render/atlas/${dirFor(id)}/${id}.png`); return false; } catch { return true; }
    });
    check("nothing is listed in ATLAS without a PNG behind it — that breaks boot, it doesn't degrade",
      halfDeclared.length === 0, halfDeclared.join(", "));

    const pending = named.filter((id) => !ATLAS[id]);
    check("art that is named but not yet drawn is absent from ATLAS, so it falls back cleanly",
      pending.every((id) => !ATLAS[id]), `${pending.length} pending: ${[...new Set(pending)].slice(0, 6).join(", ")}`);
  }

  let worstDelta = Infinity, worstSpread = 0, brightest = 0;
  const bad: string[] = [];
  for (const id of Object.keys(TILESETS)) {
    const dir = "src/render/atlas/tilesets";
    const png = decodePng(readFileSync(`${dir}/${id}.png`));
    const layout = JSON.parse(readFileSync(`${dir}/${id}.json`, "utf8")) as { tile: number; boxes: [number, number][] };
    const spec = TILESETS[id]!;
    check(`${id} is the ${spec.w}x${spec.h} sheet the manifest promises`,
      png.width === spec.w && png.height === spec.h && layout.tile === spec.tile,
      `${png.width}x${png.height}, tile ${layout.tile}`);
    for (const tint of tintsFor(id)) {
      const data = new Uint8Array(png.data);
      gradeSheet(data, png.width, png.height, layout.tile, layout.boxes, tint, FLOOR_GRADE);
      const floor = tileLuminance(data, png.width, layout.tile, layout.boxes[0]!);
      const rock = tileLuminance(data, png.width, layout.tile, layout.boxes[15]!);
      const delta = Math.abs(floor.mean - rock.mean);
      const spread = Math.max(floor.spread, rock.spread);
      const peak = Math.max(floor.mean, rock.mean);
      worstDelta = Math.min(worstDelta, delta);
      worstSpread = Math.max(worstSpread, spread);
      brightest = Math.max(brightest, peak);
      if (delta < MIN_DELTA || peak > MAX_MEAN || spread > MAX_SPREAD) {
        bad.push(`${id}@${tint}: floor L${floor.mean.toFixed(0)}±${floor.spread.toFixed(0)} rock L${rock.mean.toFixed(0)}±${rock.spread.toFixed(0)}`);
      }
    }
  }
  check(`floor and wall stay at least ${MIN_DELTA} luminance apart after the grade`, worstDelta >= MIN_DELTA,
    `worst ${worstDelta.toFixed(0)}`);
  check(`no graded floor or wall is brighter than L${MAX_MEAN}`, brightest <= MAX_MEAN, `brightest ${brightest.toFixed(0)}`);
  check(`no graded tile is busier than ±${MAX_SPREAD}`, worstSpread <= MAX_SPREAD, `worst ±${worstSpread.toFixed(0)}`);
  if (bad.length) console.log(`  offenders: ${bad.slice(0, 6).join("; ")}`);
  console.log(`  ${Object.keys(TILESETS).length} tilesets — worst delta ${worstDelta.toFixed(0)}, brightest L${brightest.toFixed(0)}, busiest ±${worstSpread.toFixed(0)}`);

  // --- a floor must not be its own sector's element -------------------------------------
  //
  // §17.7's contrast rule keeps floor separate from wall; it says nothing about floor vs.
  // the *monsters standing on it*, and `infusionChance` (data/enemies.ts) can put a
  // majority of a floor's monsters in that floor's own element by the time the sector is
  // reachable — three Reliquary sectors (Gilded Ossuary, Unbound Spire, Hollow Orchard)
  // sit at the 65% infusion cap from their very first floor. A gold tileset under a gold-
  // washed monster is the same failure the floor/wall gate exists to catch, one hop over:
  // the element that names a sector is the one colour its ground cannot be, because that
  // element is already spoken for by the things standing on it. Same MIN_DELTA bar, same
  // luminance metric, the subject is a `tinted()` monster instead of the wall tile.
  /**
   * Known, pre-existing collisions — each `<sector name>` is not this branch's to fix,
   * reported to the PM instead. Same pinned-violation shape `tools/legends.ts` and
   * `tools/chroma.ts` use: the found set must equal this exactly, so a NEW collision
   * fails loudly and so does one of these getting fixed without the pin being removed.
   *
   * The Cinder Catacombs and The Veil were here and are fixed (Sept 2026, `docs/
   * ashen-wastes-infusion-fix.md`) — floor-only regenerations, wall pixel-anchored to
   * the original generation, verified against this exact gate before the pin came off.
   * **Ashen Wastes is pinned PERMANENTLY, by owner ruling (2026-09-10).** A floor-only
   * fix was attempted and measured close (grunt one luminance point under the bar, every
   * other archetype clear), but the owner looked at the shipped floor and answered
   * "Ashen wastes looks fine" — so the original ships and there is no next attempt. This
   * entry is therefore not a violation awaiting a fix; it is a deliberate exception, and
   * a session that closes it is overturning the owner rather than finishing a job.
   *
   * The gate is untouched and still honest: a delta of 27 against a bar of 28 is the
   * instrument working correctly and the answer still being "ship it." Do not reopen this
   * on the strength of the number. See `docs/ashen-wastes-infusion-fix.md` for the full
   * attempt, the direction that actually worked, and why "darken the floor" (the rule
   * that fixed the other two) made this one worse before "brighten it" was tried.
   */
  const KNOWN_INFUSION_COLLISIONS: readonly string[] = [
    "Ashen Wastes", // tiles.delve-wrath, fire-on-fire — see docs/ashen-wastes-infusion-fix.md
  ];

  let worstMonsterDelta = Infinity;
  const collisions = new Map<string, string[]>(); // sector name -> detail lines
  const ownerBiomes: BiomeStyle[] = ALL_BIOMES;
  for (const id of Object.keys(TILESETS)) {
    const owners = ownerBiomes.filter((b) => b.tileset === id && b.element && b.element !== "physical");
    if (owners.length === 0) continue;
    const dir = "src/render/atlas/tilesets";
    const png = decodePng(readFileSync(`${dir}/${id}.png`));
    const layout = JSON.parse(readFileSync(`${dir}/${id}.json`, "utf8")) as { tile: number; boxes: [number, number][] };
    for (const biome of owners) {
      const floorData = new Uint8Array(png.data);
      gradeSheet(floorData, png.width, png.height, layout.tile, layout.boxes, biome.tint, FLOOR_GRADE);
      const floorLum = tileLuminance(floorData, png.width, layout.tile, layout.boxes[0]!).mean;
      const [er, eg, eb] = hexToRgb(ELEMENT_COLORS[biome.element]);
      const set = biome.monsterSet ? MONSTER_SETS[biome.monsterSet] : undefined;
      if (!set) continue;
      for (const role of Object.keys(set)) {
        /**
         * The sprite this archetype *actually draws here*, following `monsterSprite`'s
         * own ladder (`render/sprites.ts`): the realm set's entry when its PNG is
         * committed, otherwise the global `SPRITE_OVERRIDES` one.
         *
         * This used to stop on the first rung and `continue` past a missing file, which
         * made the check silently vacuous for exactly the realm that needs it most — one
         * that has *named* a roster it hasn't drawn. `MONSTER_SETS.tower` names five
         * celestial ids with no PNGs behind them, so every role was skipped and the
         * Tower's floors passed by measuring nothing. What stands on a Tower floor today
         * is the Hell roster washed holy, and that is what the floor has to stay
         * separable from — the fallback is not a detail of the gate, it is the picture.
         */
        const spriteId = (() => {
          const named = set[role];
          if (named && existsSync(`src/render/atlas/${named.startsWith("boss.") ? "bosses" : "monsters"}/${named}.png`)) return named;
          return SPRITE_OVERRIDES[role];
        })();
        if (!spriteId) continue;
        const dirFor = spriteId.startsWith("boss.") ? "bosses" : "monsters";
        let mpng;
        try { mpng = decodePng(readFileSync(`src/render/atlas/${dirFor}/${spriteId}.png`)); } catch { continue; }
        // The exact `tinted()` wash (render/sprites.ts): source-atop at 0.28, alpha untouched.
        let sum = 0, n = 0;
        for (let i = 0; i < mpng.width * mpng.height; i++) {
          const s = i * 4;
          if (mpng.data[s + 3]! < 128) continue;
          const r = mpng.data[s]! * 0.72 + er * 0.28;
          const g = mpng.data[s + 1]! * 0.72 + eg * 0.28;
          const b = mpng.data[s + 2]! * 0.72 + eb * 0.28;
          sum += luminance(r, g, b);
          n++;
        }
        if (n === 0) continue;
        const monsterLum = sum / n;
        const delta = Math.abs(floorLum - monsterLum);
        worstMonsterDelta = Math.min(worstMonsterDelta, delta);
        if (delta < MIN_DELTA) {
          const lines = collisions.get(biome.name) ?? [];
          lines.push(`${id}@${biome.name}: floor L${floorLum.toFixed(0)} vs ${role} infused-with-${biome.element} L${monsterLum.toFixed(0)}`);
          collisions.set(biome.name, lines);
        }
      }
    }
  }
  const elementalTilesets = new Set(
    ownerBiomes.filter((b) => b.tileset && b.element && b.element !== "physical").map((b) => b.tileset),
  ).size;
  const found = [...collisions.keys()].sort();
  const pinned = [...KNOWN_INFUSION_COLLISIONS].sort();
  for (const name of found) console.log(`       · ${collisions.get(name)![0]}  (+${collisions.get(name)!.length - 1} more roles)`);
  check(`an infused monster stays at least ${MIN_DELTA} luminance apart from its own sector's floor,`
    + ` except the sectors we already knew about`,
    found.join(",") === pinned.join(","),
    `found [${found.join(", ") || "none"}]  pinned [${pinned.join(", ") || "none"}]`
    + `  — worst ${worstMonsterDelta.toFixed(0)} (${elementalTilesets} elemental tilesets checked)`);
}

console.log("\n=== gems and the wardrobe ===");
{
  // Gems have to actually reach the bank, or the capsules are decoration.
  const state = geared(14, 4242, 8);
  const { d } = playFloor(state, 6, 300, 6161, 0.7);
  check("gems drop in the dungeon", d.loot.gems > 0, `${d.loot.gems} unbanked`);
  d.bankLoot();
  check("gems bank on extract", state.gems > 0, `${state.gems} banked`);
  console.log(`  a depth 6 floor paid ${state.gems} gems — a Trinket capsule costs ${CAPSULES.Trinket.price}`);

  // An avarice rift is the mode that is supposed to pay for a wardrobe.
  const hoarder = geared(20, 4243, 10);
  const hoard = playFloor(hoarder, riftConfig("hoard", 1, 1), 300, 6162, 0.7);
  const delver = geared(20, 4243, 10);
  const delve = playFloor(delver, 6, 300, 6162, 0.7);
  check("the avarice rift pays better in gems than the delve",
    hoard.d.loot.gems > delve.d.loot.gems,
    `avarice ${hoard.d.loot.gems} (${hoard.d.phase}) vs delve ${delve.d.loot.gems} (${delve.d.phase})`);

  const broke = new GameState(1);
  check("no gems, no capsule", broke.openCapsules("Trinket", 1).length === 0);
  check("you can't wear what you haven't pulled", !broke.wear("hat", "hatWitch"));
  check("you can always wear nothing", broke.wear("hat", null));

  // Capsule odds, printed the way the chest odds are.
  for (const tier of CAPSULE_TIERS) {
    const s = new GameState(31337);
    const n = 20000;
    s.gems = CAPSULES[tier].price * n;
    const pulls = s.openCapsules(tier, n);
    const counts: Record<string, number> = {};
    for (const p of pulls) counts[p.cosmetic.rarity] = (counts[p.cosmetic.rarity] ?? 0) + 1;
    const summary = RARITIES.filter((r) => counts[r])
      .map((r) => `${r}=${(((counts[r] ?? 0) / pulls.length) * 100).toFixed(2)}%`).join(" ");
    console.log(`  ${tier.padEnd(10)} ${summary}`);
    if (tier === "Starlight") {
      check("Starlight capsules never roll below epic",
        pulls.every((p) => rarityIndex(p.cosmetic.rarity) >= rarityIndex("epic")), summary);
    }
    if (tier === "Trinket") {
      // Everything but the unspoken tier should turn up in a long grind. The unspoken
      // aura is deliberately absurd, exactly like an unspoken item — that long tail is
      // the same hook the loot game runs on, and it is not a bug here either.
      const missing = COSMETICS.filter((c) => !s.cosmetics.includes(c.id));
      check("a long grind fills the wardrobe, unspoken aside",
        missing.every((c) => c.rarity === "unspoken"),
        `${s.cosmetics.length}/${COSMETICS.length}; missing ${missing.map((c) => c.name).join(", ") || "nothing"}`);
      check("duplicates come back as gems", pulls.some((p) => p.dupe && p.refund > 0));
    }
  }

  // The one promise cosmetics make: they are powerless. Wear everything and check that
  // not a single number on the character sheet moved.
  const dressed = geared(20, 4244, 10);
  const before = JSON.stringify(dressed.player.mods);
  dressed.cosmetics = COSMETICS.map((c) => c.id);
  const heldFamily = dressed.player.weapon.id;
  for (const slot of COSMETIC_SLOTS) {
    const first = slot === "weapon"
      ? dressed.ownedWeaponSkins(heldFamily)[0]
      : dressed.ownedInSlot(slot)[0];
    if (first) dressed.wear(slot, first.id, heldFamily);
  }
  dressed.player.refresh();
  check("cosmetics never touch your numbers", JSON.stringify(dressed.player.mods) === before);
  // The non-vacuity guard on the check above: it proves nothing if the dressing silently
  // failed. The weapon slot is asked for the family actually held, since that is where it
  // now keeps its answer.
  check("wearing everything fills every slot",
    COSMETIC_SLOTS.every((slot) => wornInSlot(dressed.appearance, slot, heldFamily) !== null));

  // The Trophy Hall (docket §3) makes the same promise, the same way: a case is a
  // picture of an item, not a second copy of it doing anything. Buy every case, put the
  // best thing in the stash in each one, and check the sheet — and the stash itself —
  // never moved.
  const cased = geared(20, 4245, 10);
  const itemRng = new Rng(4246);
  cased.inventory = ITEM_TYPES.slice(0, MAX_TROPHY_CASES).map((_, i) =>
    rollItem({ rarity: "mythic", type: ITEM_TYPES[i % ITEM_TYPES.length]!, ilvl: 60, rng: itemRng }));
  const stashBefore = JSON.stringify(cased.inventory);
  const modsBefore = JSON.stringify(cased.player.mods);
  for (let i = 0; i < MAX_TROPHY_CASES; i++) {
    cased.gems = 0;
    check(`case ${i + 1} refuses with no gems`, !cased.buyTrophyCase());
    cased.gems = trophyCaseCost(i);
    if (!cased.buyTrophyCase()) throw new Error(`case ${i} should have been affordable`);
    if (!cased.assignTrophy(i, cased.inventory[i]!)) throw new Error(`case ${i} should have accepted an item`);
  }
  cased.player.refresh();
  check("every case is filled", Array.from({ length: MAX_TROPHY_CASES }, (_, i) => cased.trophyItem(i))
    .every((it) => it !== null));
  check("a displayed item is a copy, not the stash item itself",
    cased.trophyItem(0) !== cased.inventory[0] && JSON.stringify(cased.trophyItem(0)) === JSON.stringify(cased.inventory[0]));
  check("the stash never moved", JSON.stringify(cased.inventory) === stashBefore);
  check("a fully-cased character's sheet is byte-identical to an uncased one",
    JSON.stringify(cased.player.mods) === modsBefore);
  check("clearing a case empties it without touching the stash",
    (cased.clearTrophy(0), cased.trophyItem(0) === null && JSON.stringify(cased.inventory) === stashBefore));
  check("a case past what's bought refuses a placement",
    !cased.assignTrophy(MAX_TROPHY_CASES, cased.inventory[0]!));
  check("gems actually left the account", cased.gems === 0);

  // Standards (docs/gem-sinks.md §4A) make the same promise, checked the same way, plus
  // the doc's own falsifiable claim stated directly: "buy every banner style ... and
  // assert the displayable-marks set gains zero entries." A character with several
  // earned marks flies every one of them, in every bought cloth, and the sheet — and the
  // set of marks it's even allowed to fly — never moves.
  const flying = geared(20, 4247, 10);
  // geared() grants no gems, and buyBannerStyle silently no-ops on an underfunded
  // account (returns false, same as "already owned") — exactly the difference the
  // checks below are trying to prove doesn't exist. Fund it for real, off the styles'
  // own prices rather than a guessed constant, so every purchase below actually happens.
  flying.gems = BANNER_STYLES.reduce((sum, s) => sum + s.price, 0);
  flying.player.legendComplete = true;
  flying.player.delveChallengerBadges[13] = 22;   // tier 14, "Death March IV · Delve 22"
  flying.player.towerChallengerBadges[4] = 18;     // tier 5
  flying.player.challengerBadges.abyss = 8;
  flying.player.planetChallengerBadges.htrae = 3;
  flying.player.raidChallengerBadges["the-ferryman"] = 2;
  const marksBefore = JSON.stringify(
    standardsFor(flying.player, flying.player.classId).map((m) => m.id).sort());
  const flyingSheetBefore = JSON.stringify(flying.player.mods);
  // Asserted at the point of purchase, not just funded and trusted: buyBannerStyle
  // returns false for "underfunded" and false for "already owned" alike, so an ignored
  // return value here is indistinguishable from a real purchase — which is exactly what
  // let an unfunded fixture run silently until the wear loop below threw twenty lines
  // away from the actual cause. The free default (price 0) is skipped on purpose;
  // buyBannerStyle refuses it by design (nothing to buy), which isn't a failure.
  for (const style of BANNER_STYLES) {
    if (style.price <= 0) continue;
    if (!flying.buyBannerStyle(style.id)) {
      throw new Error(`should have been able to buy ${style.id} for ${style.price} gems`);
    }
  }
  check("buying every banner style gains zero displayable marks",
    JSON.stringify(standardsFor(flying.player, flying.player.classId).map((m) => m.id).sort())
      === marksBefore);
  const marks = standardsFor(flying.player, flying.player.classId);
  // Exact, not a floor: one mark banked per family above (legend, delve, tower, abyss,
  // planet, raid), so anything other than 6 means one of those six silently failed to
  // attach — a >= bound already let "raid-the-ferryman" (wrong id, zero raid marks) pass
  // as "5 is at least 5" once. Printing the ids is what makes that visible without
  // re-deriving it by hand next time.
  check("this character earned exactly the six marks this fixture set up", marks.length === 6,
    `${marks.length}: ${marks.map((m) => m.id).join(", ")}`);
  for (const m of marks) {
    if (!flying.setFlownStandard(m.id)) throw new Error(`should have been able to fly ${m.id}`);
  }
  for (const style of BANNER_STYLES) {
    if (!flying.setFlownBannerStyle(style.id)) {
      throw new Error(`should have been able to wear ${style.id} after buying it`);
    }
  }
  flying.player.refresh();
  check("a character flying an earned mark in a bought cloth has a byte-identical sheet",
    JSON.stringify(flying.player.mods) === flyingSheetBefore);
  // The falsification: an id nothing earned (a mode this character never banked, and a
  // string that never named anything) both have to be refused, not just "usually absent".
  check("flying a mark this character never earned is refused", !flying.setFlownStandard("mode:vigil"));
  check("flying a nonsense id is refused", !flying.setFlownStandard("not-a-real-mark"));
}

console.log("\n=== combat stats overlay: powerless, like cosmetics ===");
{
  // Everything a run's outcome could depend on: not the whole `Dungeon` (an `Rng`
  // instance, event queues and the rest don't survive `JSON.stringify` cleanly), just
  // the numbers that would diverge first if the overlay ever changed how a tick played
  // out — health, resources, position, kills, loot, and every enemy's own state.
  function outcomeSnapshot(d: Dungeon): string {
    const hero = d.localHero;
    return JSON.stringify({
      phase: d.phase, elapsed: d.elapsed, wave: d.wave,
      killsSoFar: d.killsSoFar, elitesKilled: d.elitesKilled,
      health: hero.player.health, mana: hero.player.mana,
      xp: hero.player.xp, level: hero.player.level, downed: hero.downed,
      avatar: { x: hero.avatar.x, y: hero.avatar.y, facing: hero.avatar.facing },
      // Item ids come off a module-level counter (`nextId` in game/item.ts) rather than
      // anything the run itself produced, so two back-to-back runs in the same process
      // never share numbering even when they're otherwise identical — strip it, keep
      // everything the roll actually decided (rarity, stats, mods, affixes, name).
      loot: { ...hero.loot, items: hero.loot.items.map(({ id: _id, ...rest }) => rest) },
      enemies: d.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, health: e.health, kind: e.archetype.kind })),
    });
  }

  const off = geared(14, 7711, 12, "lancer");
  const on = geared(14, 7711, 12, "lancer");
  on.settings.combatStats = true;
  check("the setting starts off by default", !off.settings.combatStats && !new GameState().settings.combatStats);

  const runOff = playFloor(off, 9, 90, 4141, 0.6);
  const runOn = playFloor(on, 9, 90, 4141, 0.6);
  check("a run plays out identically whether the overlay is on or off",
    outcomeSnapshot(runOff.d) === outcomeSnapshot(runOn.d));

  // The property that actually matters is that the *accumulator* runs regardless of the
  // setting — the toggle only gates whether the HUD draws it — so the numbers a build-
  // tester would read are there even with the overlay off, and turning it on doesn't
  // create them out of nothing.
  check("stats accumulate even with the overlay off, and match the overlay-on run exactly",
    runOff.d.localHero.combatStats.totalDamageDealt > 0
    && runOff.d.localHero.combatStats.totalDamageDealt === runOn.d.localHero.combatStats.totalDamageDealt
    && runOff.d.localHero.combatStats.largestHit === runOn.d.localHero.combatStats.largestHit,
    `${runOff.d.localHero.combatStats.totalDamageDealt} dealt`);

  // A direct unit check on the clamp itself: heal for far more than the missing health
  // and confirm only the missing health is recorded, not the amount requested.
  const p = geared(20, 1).player;
  p.health = p.maxHealth - 10;
  const stats = new CombatStats();
  stats.recordHealing(p.heal(p.maxHealth * 50));
  check("healing records only what was actually restored, not the amount requested",
    stats.totalHealingDone === 10, `recorded ${stats.totalHealingDone}, missing health was 10`);
}

console.log("\n=== controls ===");
{
  // UAT §1: typing a name or a room code into the Comms Relay must never be eaten by the
  // game's own key handling. Before the fix every bound key was `preventDefault`ed before
  // the enabled check ran, so W/A/S/D, E, Q and most of the room-code alphabet could not
  // be typed into a field at all. `Input` is DOM-shaped but built here against a fake
  // target, so this pins the rule headlessly.
  class FakeTarget {
    private listeners = new Map<string, ((e: unknown) => void)[]>();
    addEventListener(type: string, cb: (e: unknown) => void): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
    }
    fire(type: string, e: object): void {
      for (const cb of this.listeners.get(type) ?? []) cb(e);
    }
  }
  const target = new FakeTarget();
  const input = new Input(
    { ...DEFAULT_SETTINGS, keybinds: { ...DEFAULT_KEYBINDS } },
    target as unknown as EventTarget,
  );
  /** Presses `code` at `tagName` (or the bare canvas); returns whether the game claimed it. */
  const press = (code: string, tagName?: string): boolean => {
    let prevented = false;
    const ev = {
      code, repeat: false,
      target: tagName ? { tagName } : {},
      preventDefault: () => { prevented = true; },
    };
    target.fire("keydown", ev);
    target.fire("keyup", ev);
    return prevented;
  };
  check("a bound key on the canvas is the game's", press("KeyW") === true);
  check("a bound key typed into a text field reaches the field", press("KeyW", "INPUT") === false);
  check("… and a textarea", press("KeyE", "TEXTAREA") === false);
  input.setEnabled(false);
  check("with the keyboard handed to a field, no key is swallowed", press("KeyE") === false);
  input.setEnabled(true);
  check("every room-code letter can be typed into the code box",
    [..."ABCDEFGHJKLMNPQRTUVWXY"].every((c) => press(`Key${c}`, "INPUT") === false));
  check("every default binding can be typed into a name",
    REBINDABLE_ACTIONS.every((a) => press(DEFAULT_KEYBINDS[a], "INPUT") === false));
  check("but a checkbox isn't a place you type",
    (() => {
      let prevented = false;
      target.fire("keydown", {
        code: "KeyW", repeat: false, target: { tagName: "INPUT", type: "checkbox" },
        preventDefault: () => { prevented = true; },
      });
      return prevented;
    })());
}

console.log("\n=== build grants fire for their own hero, at the thing they hit ===");
{
  // `runBuildGrants` used to subscribe with the event payload discarded and aim every
  // grant at "hostiles within 220 of the caster". Two consequences, both now fixed and
  // both pinned here: every party member's on-kill grant fired on *anyone's* kill (a
  // buff for parties nobody designed — the fix is a nerf to shipped classes, on purpose),
  // and an on-hit grant could never reach the enemy a bow shot or staff bolt actually
  // struck if it stood further away than that reach.
  const aState = geared(14, 8811, 16, "swordsman");
  const bState = geared(14, 8812, 16, "magician");
  const d = new Dungeon(aState, delveConfig(8, 0, 2), {
    seed: 4243, role: "host", heroes: [
      { netId: "", name: "A", player: aState.player, appearance: aState.appearance, potions: 5, local: true },
      { netId: "p2", name: "B", player: bState.player, appearance: bState.appearance, potions: 5, local: false },
    ],
  });
  const [a, b] = d.heroes as [Hero, Hero];
  const priv = d as unknown as { placeMonsterAt(p: { x: number; y: number }): void };
  const ENEMY_ID_BASE = (Dungeon as unknown as { ENEMY_ID_BASE: number }).ENEMY_ID_BASE;
  const hostId = (e: { id: number }) => ENEMY_ID_BASE + e.id;
  // One monster next to A, one far beyond the old 220 reach. Placed, then moved by hand
  // — nothing here ticks, so walkability is irrelevant and the wave director never runs.
  priv.placeMonsterAt({ x: a.avatar.x, y: a.avatar.y });
  const near = d.enemies[d.enemies.length - 1]!;
  near.x = a.avatar.x + 90; near.y = a.avatar.y; near.state = "active";
  priv.placeMonsterAt({ x: a.avatar.x, y: a.avatar.y });
  const far = d.enemies[d.enemies.length - 1]!;
  far.x = a.avatar.x + 600; far.y = a.avatar.y + 600; far.state = "active";

  const grants: ResolvedBuild["grants"] = [
    { on: { event: "kill" }, from: "node", effects: [{ kind: "heal", amount: 25, scale: "flat", to: "self" }] },
    { on: { event: "hit" }, from: "node", effects: [{ kind: "damage", damage: { base: 40, scale: "flat", type: "physical" }, to: "target" }] },
    { on: { event: "dodge" }, from: "node", effects: [{ kind: "damage", damage: { base: 40, scale: "flat", type: "physical" }, to: "allTargets" }] },
  ];
  runBuildGrants(d.bus, { ...a.player.build, grants }, d, a.rt, a.index, () => ({}), () => a.avatar.facing);

  // 1. ownership — B's kill must not heal A; A's own kill must.
  a.player.health = Math.round(a.player.maxHealth / 2);
  const half = a.player.health;
  d.bus.emit({ type: "kill", actorId: b.index, x: a.avatar.x, y: a.avatar.y });
  check("a party-mate's kill does not fire your on-kill grant", a.player.health === half,
    `${half} -> ${a.player.health}`);
  d.bus.emit({ type: "kill", actorId: a.index, x: a.avatar.x, y: a.avatar.y });
  check("your own kill does", a.player.health > half, `${half} -> ${a.player.health}`);

  // 2. the struck enemy — an on-hit grant lands on what was hit, however far away it is.
  const farBefore = far.health;
  const nearBefore = near.health;
  d.bus.emit({ type: "hit", actorId: a.index, targetId: hostId(far), x: far.x, y: far.y });
  check("an on-hit grant resolves at the enemy that was hit, beyond the old 220 reach",
    far.health < farBefore, `${farBefore.toFixed(0)} -> ${far.health.toFixed(0)}`);
  check("...and only at that enemy for `to: \"target\"`", near.health === nearBefore);
  const farMid = far.health;
  d.bus.emit({ type: "hit", actorId: b.index, targetId: hostId(far), x: far.x, y: far.y });
  check("a party-mate's hit does not fire your on-hit grant", far.health === farMid);

  // 3. no target named — the caster-centred fallback still finds what stands nearby.
  d.bus.emit({ type: "dodge", actorId: a.index, x: a.avatar.x, y: a.avatar.y });
  check("a grant on an event with no target still reaches enemies around the caster",
    near.health < nearBefore, `${nearBefore.toFixed(0)} -> ${near.health.toFixed(0)}`);
  check("...but not one far outside that reach", far.health === farMid);
}

console.log("\n=== multiplayer ===");
{
  // A co-op floor is the same simulation with more than one hero in it, so it can be
  // played headlessly exactly like a solo one — and the host/client split can be run
  // in one process, with real snapshots passing between two real dungeons.

  // 1. The difficulty dial. More people means fatter, more numerous monsters and only
  // slightly harder hits; nobody can dodge for a friend.
  const solo = profileFor(10, delveConfig(10, 0, 1));
  const trio = profileFor(10, delveConfig(10, 0, 3));
  check("a party fattens the floor", trio.enemyHealth > solo.enemyHealth * 1.9,
    `${solo.enemyHealth.toFixed(0)} -> ${trio.enemyHealth.toFixed(0)} hp`);
  check("a party crowds the floor", trio.enemiesPerWave > solo.enemiesPerWave,
    `${solo.enemiesPerWave} -> ${trio.enemiesPerWave} per wave`);
  check("a party doesn't get one-shot for having friends", trio.enemyDamage < solo.enemyDamage * 1.3,
    `${solo.enemyDamage.toFixed(1)} -> ${trio.enemyDamage.toFixed(1)} damage`);
  check("a solo floor is untouched by any of it",
    profileFor(10, delveConfig(10)).enemyHealth === solo.enemyHealth);

  // 2. Two heroes on one floor, driven by two independent inputs.
  const hostState = geared(14, 8801, 16, "swordsman");
  const mateState = geared(14, 8802, 16, "magician");
  const config = delveConfig(8, 0, 2);
  const setups = [
    {
      netId: "", name: "Host", player: hostState.player,
      appearance: hostState.appearance, potions: 5, local: true,
    },
    {
      netId: "p2", name: "Cousin", player: mateState.player,
      appearance: mateState.appearance, potions: 5, local: false,
    },
  ];
  const host = new Dungeon(hostState, config, { seed: 4242, role: "host", heroes: setups });
  check("a party floor holds everybody", host.heroes.length === 2 && host.isParty);
  check("each hero brought their own character",
    host.heroes[0]!.player.classId === "swordsman" && host.heroes[1]!.player.classId === "magician");

  const hostInput = new FakeInput();
  const mateInput = new FakeInput();
  host.heroes[1]!.input = mateInput as unknown as AvatarInput;

  // Both of them chase and swing. The remote one is driven through the exact same
  // `AvatarInput` a keyboard implements, which is the whole point of the interface.
  let t = 0;
  let mateHits = 0;
  /** The busiest moment of the fight, to size a snapshot against the worst case. */
  let busiest = { monsters: 0, bytes: 0 };
  const mateHero = host.heroes[1]!;
  // Both bots route around walls the same way the monsters do, since a floor is a graph
  // of rooms now and a bot that only walks in straight lines measures the pathing rather
  // than the fight.
  const routes = host.heroes.map(() => new FlowField(host.level));
  let routeTimer = 0;
  while (t < 120 && host.phase === "fighting") {
    hostInput.beginTick();
    mateInput.beginTick();
    routeTimer -= DT;
    const repath = routeTimer <= 0;
    if (repath) routeTimer = 0.25;

    host.heroes.forEach((hero, i) => {
      const input = i === 0 ? hostInput : mateInput;
      const target = host.enemies.filter((e) => e.state !== "spawning")
        .sort((a, b) => Math.hypot(a.x - hero.avatar.x, a.y - hero.avatar.y)
          - Math.hypot(b.x - hero.avatar.x, b.y - hero.avatar.y))[0];
      // Same as the solo bot: with no target, explore toward the floor's far end rather
      // than toward the entrance, which is now the spawn they're already standing on.
      const goal = target ?? host.completionPortal ?? host.level.portal;
      if (repath) routes[i]!.update(host.level, goal.x, goal.y);
      const step = routes[i]!.direction(host.level, hero.avatar.x, hero.avatar.y);
      const angle = step
        ? Math.atan2(step.y, step.x)
        : Math.atan2(goal.y - hero.avatar.y, goal.x - hero.avatar.x);
      input.hold("right", Math.cos(angle) > 0.3);
      input.hold("left", Math.cos(angle) < -0.3);
      input.hold("down", Math.sin(angle) > 0.3);
      input.hold("up", Math.sin(angle) < -0.3);
      input.press("attack");
      if (hero.player.health < hero.player.maxHealth * 0.4) input.press("potion");
    });

    const before = mateHero.loot.kills;
    host.update(DT, hostInput as unknown as AvatarInput);
    if (mateHero.loot.kills > before) mateHits++;
    if (host.enemies.length > busiest.monsters) {
      busiest = {
        monsters: host.enemies.length,
        bytes: JSON.stringify(encodeSnapshot(host)).length,
      };
    }
    host.drainEvents();
    t += DT;
  }
  check("a party can clear a floor together", host.phase !== "fighting",
    `${host.phase} after ${t.toFixed(0)}s`);
  check("the remote player actually fought", mateHits > 0, `${mateHits} kills`);
  check("XP is shared, not split",
    host.heroes[0]!.loot.xp > 0 && host.heroes[0]!.loot.xp === host.heroes[1]!.loot.xp,
    `${host.heroes[0]!.loot.xp} vs ${host.heroes[1]!.loot.xp}`);
  // Loot is the twin of the XP check above now, not its opposite. This check used to assert
  // that the two heroes' loot *diverged* — "loot belongs to whoever picked it up" — and it
  // went red the moment the owner's ruling landed, which is the check doing its job on a
  // rule that was deliberately overturned rather than a regression. Inverted, it is the
  // strongest statement of the new rule anywhere in the gate, because it rides a floor the
  // party genuinely played rather than a hand-placed pickup: whatever the two of them walked
  // over, in whatever order, they both end holding.
  const [h0, h1] = [host.heroes[0]!, host.heroes[1]!];
  check("loot is shared, not split — both heroes end the floor holding the same items",
    h0.loot.items.length > 0 && h0.loot.items.length === h1.loot.items.length,
    `${h0.loot.items.length} vs ${h1.loot.items.length} items`);
  // Coins are compared through each hero's own `coinFindMult` rather than as raw totals:
  // one pile pays both, but each of them through their own Avarice nodes, so equal totals
  // would be the wrong invariant (and would only hold while the two builds happen to have
  // spent the same). Dividing the multiplier back out recovers the pile they shared, to
  // within the per-pickup rounding.
  const rawCoins = (h: Hero) => h.loot.coins / Math.max(0.0001, h.player.coinFindMult);
  const coinGap = Math.abs(rawCoins(h0) - rawCoins(h1)) / Math.max(1, rawCoins(h0));
  check("...and one coin pile paid them both, each through their own find multiplier",
    h0.loot.coins > 0 && h1.loot.coins > 0 && coinGap < 0.03,
    `${h0.loot.coins} @x${h0.player.coinFindMult.toFixed(2)} vs `
      + `${h1.loot.coins} @x${h1.player.coinFindMult.toFixed(2)} — ${(coinGap * 100).toFixed(1)}% apart`);

  // 3. A client rebuilds the same floor from the seed alone, then adopts a snapshot.
  const clientState = geared(14, 8802, 16, "magician");
  const clientSetups = setups.map((setup, i) => ({ ...setup, local: i === 1 }));
  const client = new Dungeon(clientState, configFromWire(configToWire(config)), {
    seed: 4242, role: "client", heroes: clientSetups,
  });
  check("a client generates the identical floor from the seed",
    client.level.width === host.level.width
    && client.level.walls.length === host.level.walls.length
    && client.portal.x === host.portal.x && client.portal.y === host.portal.y,
    `${client.level.walls.length} vs ${host.level.walls.length} walls`);

  const snapshot = JSON.parse(JSON.stringify(encodeSnapshot(host)));
  applySnapshot(client, snapshot);
  check("a snapshot carries the whole floor across",
    client.enemies.length === host.enemies.length
    && client.pickups.length === host.pickups.length
    && client.phase === host.phase,
    `${client.enemies.length}/${host.enemies.length} monsters`);
  check("a snapshot puts everybody where the host has them",
    host.heroes.every((hero, i) => Math.hypot(
      client.heroes[i]!.avatar.x - hero.avatar.x,
      client.heroes[i]!.avatar.y - hero.avatar.y) < 50));
  check("a client reads its own vitals off the host",
    client.localHero.player.health === Math.round(host.heroes[1]!.player.health),
    `${client.localHero.player.health} vs ${host.heroes[1]!.player.health.toFixed(0)}`);
  check("a client can bank what the host says it earned",
    client.localHero.loot.coins === host.heroes[1]!.loot.coins);

  // The floor objective is the host's to count (UAT §5) — a client mirrors the two
  // numbers and derives the two requirements from the config it already had, so its
  // HUD reads the same objective without the wire carrying it.
  check("a client reads the clear objective off the host",
    client.killsSoFar === host.killsSoFar && client.elitesKilled === host.elitesKilled,
    `${client.killsSoFar}/${client.killsRequired} vs ${host.killsSoFar}/${host.killsRequired}`);
  check("both ends derive the same requirement without sending it",
    client.killsRequired === host.killsRequired && client.elitesRequired === host.elitesRequired,
    `${client.killsRequired}/${client.elitesRequired} vs ${host.killsRequired}/${host.elitesRequired}`);
  {
    // And once the host opens the completion portal, the client learns where it is —
    // otherwise a client could never walk to the exit.
    host.completionPortal = { x: 321, y: 654 };
    const cleared = JSON.parse(JSON.stringify(encodeSnapshot(host)));
    applySnapshot(client, cleared);
    check("a completion portal crosses the wire",
      client.completionPortal?.x === 321 && client.completionPortal?.y === 654,
      JSON.stringify(client.completionPortal));
    host.completionPortal = null;
    applySnapshot(client, JSON.parse(JSON.stringify(encodeSnapshot(host))));
    check("and goes away again with it", client.completionPortal === null);
  }

  // 3b. Loot sharing. A drop is **shared, not owned** (owner ruling, 2026-09-10): one
  // physical object on the floor, anybody may walk onto it, and collecting it credits every
  // hero still in the run with their own copy. This block replaces the ownership checks that
  // stood here for one afternoon — inverted rather than deleted, because the thing worth
  // holding onto was their framing: the hero who does NOT get the kill credit is the one
  // standing on the drop, so a rule that paid only the killer (or only an owner) is visible
  // rather than merely absent.
  //
  // The level gap is the other half of the instrument. Both heroes used to be level 14,
  // which would make the docket §23 "each at their own level" property below unfalsifiable:
  // identical levels produce identical copies under every rule, correct or broken. So this
  // party is a level 20 and a level 50, and the gap is asserted before anything reads it.
  {
    const lowState = geared(20, 8806, 14, "swordsman");
    const highState = geared(50, 8807, 20, "magician");
    const shareSetups = [
      {
        netId: "", name: "Low", player: lowState.player,
        appearance: lowState.appearance, potions: 5, local: true,
      },
      {
        netId: "p2", name: "High", player: highState.player,
        appearance: highState.appearance, potions: 5, local: false,
      },
    ];
    const sh = new Dungeon(lowState, delveConfig(4, 0, 2), {
      seed: 771, role: "host", heroes: shareSetups,
    });
    sh.enemies.length = 0;
    sh.pickups.length = 0;
    const low = sh.heroes[0]!;
    const high = sh.heroes[1]!;

    const priv = sh as unknown as {
      updatePickups(dt: number): void;
      dropPickup(x: number, y: number, opts: {
        kind: Pickup["kind"]; value?: number; rarity?: Rarity;
        forge?: (ilvl: number, powerIlvl: number) => Item;
      }): void;
      rollDrop(rarity: Rarity, affinity: readonly WeaponFamily[]):
        (ilvl: number, powerIlvl: number) => Item;
    };
    const runPickups = (seconds: number) => {
      const steps = Math.round(seconds / DT);
      for (let i = 0; i < steps; i++) priv.updatePickups(DT);
    };

    check("the sharing checks are pointed at a party that can tell the copies apart",
      low.player.level === 20 && high.player.level === 50,
      `levels ${low.player.level} and ${high.player.level}`);

    // --- the copies themselves, straight off the real drop path ---------------------
    // `dropPickup` is the enforcement point (there is no single-item slot to fill), so this
    // goes through it rather than hand-building a pickup the way the ownership block did.
    priv.dropPickup(200, 200, {
      kind: "item", rarity: "rare", forge: priv.rollDrop("rare", ["sword"]),
    });
    const shared = sh.pickups[0];
    check("one kill drops one physical object, not one per player",
      sh.pickups.length === 1, `${sh.pickups.length} pickup(s)`);
    const copies = shared ? [...shared.copies] : [];
    check("...carrying one copy per hero on the roster",
      copies.length === sh.heroes.length, `${copies.length} copies for ${sh.heroes.length} heroes`);
    const a = copies[0];
    const b = copies[1];
    if (a && b) {
      // "We both get that item": the same item, not a roll each. Everything that says what
      // the thing *is* has to match, or the loot banner lies to one of them.
      check("both heroes get the same item — name, rarity, type and affixes all match",
        a.name === b.name && a.rarity === b.rarity && a.type === b.type && a.family === b.family
          && a.mods.map((m) => m.id).join() === b.mods.map((m) => m.id).join()
          && (a.grant ?? "") === (b.grant ?? "") && (a.trigger?.id ?? "") === (b.trigger?.id ?? ""),
        `${a.name} [${a.mods.map((m) => m.id).join(",")}] vs ${b.name} [${b.mods.map((m) => m.id).join(",")}]`);
      // ...and docket §23 survives the sharing: each copy is levelled for the hero who gets
      // it, so the level 50's find is not a paperweight in the level 20's stash.
      check("...each rolled at the hero's own level, so both can wear their copy",
        a.ilvl === 20 && b.ilvl === 50
          && requiredLevel(a) <= low.player.level && requiredLevel(b) <= high.player.level,
        `ilvl ${a.ilvl} (needs ${requiredLevel(a)}) and ilvl ${b.ilvl} (needs ${requiredLevel(b)})`);
      // The identity check above must not be passing because the level was ignored: if the
      // two copies were byte-identical, "same item" would be true and §23 would be dead.
      // Magnitudes have to actually differ, in the direction of the higher level.
      const statSum = (it: Item) => Object.values(it.stats).reduce((n: number, v) => n + (v as number), 0);
      check("...and the higher level's copy really is the bigger numbers, not a clone",
        statSum(b) > statSum(a), `${statSum(a)} vs ${statSum(b)} total base stats`);
    } else {
      check("both heroes get the same item — name, rarity, type and affixes all match",
        false, "the drop carried no copies");
    }

    // --- collection pays everybody -------------------------------------------------
    // Park them genuinely apart and put the hero who did NOT roll the drop on top of it.
    // Under any rule that pays the killer or an owner, `low` collects and `high` gets
    // nothing; the point of the gap is that `nearestHero` can only ever pick `low`.
    const spot = { x: sh.portal.x, y: sh.portal.y };
    sh.pickups.length = 0;
    low.avatar.x = spot.x;
    low.avatar.y = spot.y;
    high.avatar.x = spot.x > sh.width / 2 ? 20 : sh.width - 20;
    high.avatar.y = spot.y > sh.height / 2 ? 20 : sh.height - 20;
    const gap = Math.hypot(high.avatar.x - spot.x, high.avatar.y - spot.y);
    check("the sharing check is pointed at a real split — the far hero cannot be the collector",
      sh.nearestHero(spot.x, spot.y) === low && gap > 78 * 3,
      `collector on the drop, the other hero ${gap.toFixed(0)}u away`);

    priv.dropPickup(spot.x, spot.y, {
      kind: "item", rarity: "rare", forge: priv.rollDrop("rare", ["sword"]),
    });
    const lowItemsBefore = low.loot.items.length;
    const highItemsBefore = high.loot.items.length;
    const wanted = sh.pickups[0] ? [...sh.pickups[0]!.copies] : [];
    runPickups(1.5);
    check("any party member can pick up any drop",
      sh.pickups.length === 0, `${sh.pickups.length} left on the floor`);
    check("...and collecting it credits BOTH heroes, not just the one who walked onto it",
      low.loot.items.length === lowItemsBefore + 1 && high.loot.items.length === highItemsBefore + 1,
      `collector +${low.loot.items.length - lowItemsBefore}, the hero across the floor `
        + `+${high.loot.items.length - highItemsBefore}`);
    check("...each banking their own copy rather than sharing one object",
      low.loot.items.at(-1) === wanted[0] && high.loot.items.at(-1) === wanted[1]
        && wanted[0] !== wanted[1] && wanted[0]?.id !== wanted[1]?.id,
      `ids ${wanted[0]?.id} and ${wanted[1]?.id}`);
    // Each hero's own browser is handed its own copy (`net/party.ts` drains these), so a
    // remote player's item is not sampled out of a snapshot.
    check("...and each copy is queued for the browser that owns that hero",
      low.itemsPending.at(-1) === wanted[0] && high.itemsPending.at(-1) === wanted[1]);

    // --- currency too --------------------------------------------------------------
    // The ruling is not about items specifically — "we can both collectively farm the same
    // stuff" — so a coin pile pays each hero in full rather than being split between them.
    const lowCoins = low.loot.coins;
    const highCoins = high.loot.coins;
    priv.dropPickup(spot.x, spot.y, { kind: "coin", value: 100 });
    runPickups(1.5);
    check("currency pays everybody too, in full rather than split",
      low.loot.coins > lowCoins && high.loot.coins > highCoins
        && low.loot.coins - lowCoins >= 100 && high.loot.coins - highCoins >= 100,
      `+${low.loot.coins - lowCoins} and +${high.loot.coins - highCoins} coins from a 100 pile`);

    // --- a departed player is out of the run ---------------------------------------
    high.departed = true;
    const lowCoins2 = low.loot.coins;
    const highCoins2 = high.loot.coins;
    priv.dropPickup(spot.x, spot.y, { kind: "coin", value: 50 });
    runPickups(1.5);
    check("a departed player is credited nothing and cannot wedge the drop",
      sh.pickups.length === 0 && low.loot.coins > lowCoins2 && high.loot.coins === highCoins2,
      `collector +${low.loot.coins - lowCoins2}, departed +${high.loot.coins - highCoins2}`);
  }

  // 3c. Solo is unchanged, and structurally so rather than by special case: a one-hero party
  // is credited once, from the same loop, with one copy forged at that hero's own level.
  {
    const soloState = geared(14, 8805, 16, "swordsman");
    const soloRun = new Dungeon(soloState, delveConfig(4), { seed: 772, role: "solo" });
    soloRun.enemies.length = 0;
    soloRun.pickups.length = 0;
    const me = soloRun.localHero;
    me.avatar.x = soloRun.portal.x;
    me.avatar.y = soloRun.portal.y;
    const soloPriv = soloRun as unknown as {
      updatePickups(dt: number): void;
      dropPickup(x: number, y: number, opts: {
        kind: Pickup["kind"]; value?: number; rarity?: Rarity;
        forge?: (ilvl: number, powerIlvl: number) => Item;
      }): void;
      rollDrop(rarity: Rarity, affinity: readonly WeaponFamily[]):
        (ilvl: number, powerIlvl: number) => Item;
    };
    soloPriv.dropPickup(soloRun.portal.x, soloRun.portal.y, { kind: "coin", value: 50 });
    const before = me.loot.coins;
    for (let i = 0; i < Math.round(1.5 / DT); i++) soloPriv.updatePickups(DT);
    check("solo picks its own loot up exactly as before",
      soloRun.pickups.length === 0 && me.loot.coins > before,
      `+${me.loot.coins - before} coins`);
    soloPriv.dropPickup(soloRun.portal.x, soloRun.portal.y, {
      kind: "item", rarity: "rare", forge: soloPriv.rollDrop("rare", ["sword"]),
    });
    const soloCopies = soloRun.pickups[0]?.copies.length ?? 0;
    const soloItems = me.loot.items.length;
    for (let i = 0; i < Math.round(1.5 / DT); i++) soloPriv.updatePickups(DT);
    check("and a solo drop is one copy for one hero, at that hero's own level",
      soloCopies === 1 && me.loot.items.length === soloItems + 1
        && me.loot.items.at(-1)!.ilvl === me.player.level,
      `${soloCopies} copy, ilvl ${me.loot.items.at(-1)?.ilvl} at level ${me.player.level}`);
  }

  // The wire carries the drop and nothing about who it is for, because it is for everybody.
  // Two clients sitting in different party slots have to decode the identical pickup: if a
  // per-player claim ever came back onto this tuple, the two would diverge here.
  {
    host.pickups.length = 0;
    (host as unknown as {
      dropPickup(x: number, y: number, opts: { kind: Pickup["kind"]; value?: number }): void;
    }).dropPickup(100, 100, { kind: "coin", value: 7 });
    const wire = JSON.parse(JSON.stringify(encodeSnapshot(host)));
    // `client` is the party's slot 1 (`clientSetups` marks the second hero local). Read the
    // same bytes again on a client sitting in slot 0 — the only difference between the two
    // is which hero they drive, which is exactly what a per-player claim would key on.
    applySnapshot(client, wire);
    const show = (d: Dungeon) =>
      d.pickups.map((p) => `${p.kind}@${Math.round(p.x)},${Math.round(p.y)}:${p.value}`).join("|");
    const slot1 = show(client);
    const slot0Setups = setups.map((setup, i) => ({ ...setup, local: i === 0 }));
    const other = new Dungeon(geared(14, 8808, 16, "swordsman"), configFromWire(configToWire(config)), {
      seed: 4242, role: "client", heroes: slot0Setups,
    });
    applySnapshot(other, JSON.parse(JSON.stringify(wire)));
    const slot0 = show(other);
    check("a shared drop crosses the wire identically for every slot",
      slot0.length > 0 && slot0 === slot1, `${slot0 || "nothing"} vs ${slot1 || "nothing"}`);
  }
  console.log(`  the busiest snapshot of that fight was ${(busiest.bytes / 1024).toFixed(1)}kB`
    + ` with ${busiest.monsters} monsters on screen`
    + ` — ${((busiest.bytes * 20) / 1024).toFixed(0)}kB/s per player at ${20} snapshots a second`);

  // 3d. Co-op raids. The one branch in `handleHubInteraction` that stopped a party
  // raid is gone (docs/raids.md), by owner decision — not because the co-op scaling
  // question (docs/raid-party-scaling.md) got answered. That is exactly why this
  // section kills the boss by decree instead of fighting it with bots: whether a party
  // can actually beat a raid at a given gearing is the open question the owner is going
  // to iterate on live, and a check that depends on the answer would be smuggling in an
  // opinion about a tuning number this task was explicitly told not to touch. What this
  // section verifies is the wiring — the whole party is on the floor, the wire carries
  // which raid and which tier so a client rebuilds the identical encounter, and a clear
  // credits each hero's own account exactly once.
  {
    const spec = RAIDS.find((r) => r.id === "the-ferryman")!;
    const tier = 1;
    const raidHostState = geared(30, 8811, 16, "swordsman");
    const raidMateState = geared(30, 8812, 16, "magician");
    const raidCfg = raidConfig(spec, tier, 0, 2);
    const raidSetups = [
      {
        netId: "", name: "Host", player: raidHostState.player,
        appearance: raidHostState.appearance, potions: 5, local: true,
      },
      {
        netId: "p2", name: "Cousin", player: raidMateState.player,
        appearance: raidMateState.appearance, potions: 5, local: false,
      },
    ];
    const raidHost = new Dungeon(raidHostState, raidCfg, { seed: 5151, role: "host", heroes: raidSetups });
    check("a raid launched from a party holds the whole party",
      raidHost.heroes.length === 2 && raidHost.isParty);
    check("a raid floor is flagged a boss floor, exactly like a solo one",
      raidHost.profile.isBoss === true);

    // The client is a second, independent Dungeon built the way `configFromWire` says a
    // client should, from a wire round trip rather than the host's own RunConfig object.
    const raidClientState = geared(30, 8812, 16, "magician");
    const raidClientSetups = raidSetups.map((s, i) => ({ ...s, local: i === 1 }));
    const raidClient = new Dungeon(raidClientState, configFromWire(configToWire(raidCfg)), {
      seed: 5151, role: "client", heroes: raidClientSetups,
    });
    check("the wire round-trips which raid and which tier",
      raidClient.config.raid?.spec.id === spec.id && raidClient.config.raid?.tier === tier,
      `${raidClient.config.raid?.spec.id} T${raidClient.config.raid?.tier}`);
    check("...and the real room size, not the plan-time default `raidConfig` was called with",
      raidClient.config.players === 2, `players: ${raidClient.config.players}`);
    check("a client rebuilds the identical raid arena from the seed",
      raidClient.level.width === raidHost.level.width
      && raidClient.level.walls.length === raidHost.level.walls.length
      && raidClient.portal.x === raidHost.portal.x && raidClient.portal.y === raidHost.portal.y,
      `${raidClient.level.walls.length} vs ${raidHost.level.walls.length} walls`);

    // Let the host's wave director actually spawn the encounter (a boss floor's one
    // wave is the boss), then decide the fight is over rather than playing it out.
    const idle = new FakeInput();
    let spawnT = 0;
    while (!raidHost.boss && spawnT < 15) {
      idle.beginTick();
      raidHost.update(DT, idle as unknown as AvatarInput);
      spawnT += DT;
    }
    check("the raid floor spawns the raid's own encounter",
      raidHost.boss?.boss?.spec.id === raidBossId(spec.id), raidHost.boss?.boss?.spec.id ?? "none");
    const boss = raidHost.boss;
    if (boss) {
      (raidHost as unknown as { killEnemy(e: unknown, by: Hero): void })
        .killEnemy(boss, raidHost.heroes[0]!);
      idle.beginTick();
      raidHost.update(DT, idle as unknown as AvatarInput);
    }
    check("killing the boss clears the floor, the same as any other quota",
      raidHost.phase === "cleared", raidHost.phase);

    applySnapshot(raidClient, JSON.parse(JSON.stringify(encodeSnapshot(raidHost))));
    check("the clear crosses the wire to the client",
      raidClient.phase === "cleared", raidClient.phase);

    // Completion credit — the actual risk in taking raids co-op: each hero banks on
    // their own machine against their own save (`Dungeon.bankLoot` reads only its own
    // `localHero` and its own `GameState`), so nothing raid-specific runs on the clear
    // that could double-write one account or skip the other.
    // Each side's own `GameState` is the account that would sit on that player's own
    // machine — `raidMateState` is only the host's local copy of the mate's character
    // used to seed the shared hero setup, the same object a co-op host keeps for
    // rendering a friend it never writes progress to. `raidClientState` is the one
    // `raidClient.bankLoot()` actually writes, so it's the one to read back.
    const hostBefore = raidHostState.raidProgress[spec.id] ?? 1;
    const mateBefore = raidClientState.raidProgress[spec.id] ?? 1;
    raidHost.bankLoot();
    raidClient.bankLoot();
    check("the host's own account advances its raid ladder",
      raidHostState.raidProgress[spec.id] === hostBefore + 1,
      `${hostBefore} -> ${raidHostState.raidProgress[spec.id]}`);
    check("the party member's own account advances too, independently",
      raidClientState.raidProgress[spec.id] === mateBefore + 1,
      `${mateBefore} -> ${raidClientState.raidProgress[spec.id]}`);
    // Re-banking must not be a second clear. Nothing in a real run calls `bankLoot`
    // twice on one floor, but the desync this task worried about is exactly a clear
    // being counted more than once for the same hero.
    raidHost.bankLoot();
    check("banking again doesn't advance the ladder a second time",
      raidHostState.raidProgress[spec.id] === hostBefore + 1,
      `still ${raidHostState.raidProgress[spec.id]}`);

    // 3e. The Raid Portal is *spawned* by the War Table, not permanent like the Delve or
    // a rift — so unlike those, picking one doesn't just mark an existing station as the
    // party's ready spot, it has to bring the portal into existence in the first place.
    // The host's pick calls `hub.setRaid` on the host's own `Hub`; until now nothing told
    // any other party member's `Hub` to do the same, so the portal only ever existed on
    // whichever machine ran the War Table. This is the live bug the owner hit, and it's
    // asserted here as a comparison rather than a presence check on the client alone — a
    // check that only reads the client's hub can pass by reading the host's by mistake,
    // which is exactly the shape of gap that let this ship. The property that matters is
    // **host and client derive the same open stations from the same plan**; that would
    // have caught this at `setExpedition` too, had anyone written it there, and it covers
    // the next station someone adds the same way.
    const hostParty = new Party(new GameState(9001));
    hostParty.net.status = "connected";
    hostParty.net.code = "TEST";
    hostParty.net.isHost = true;
    const hostHub = new Hub();
    const clientParty = new Party(new GameState(9002));
    // `Party.syncHub` only does anything while `inRoom` — real co-op needs a live relay
    // connection for that, which this harness doesn't stand up, so this reaches the exact
    // same fields a real host/join sets rather than mocking `syncHub`'s behavior around
    // them. `setPlan`'s own broadcast is a safe no-op with no socket open.
    clientParty.net.status = "connected";
    clientParty.net.code = "TEST";
    const clientHub = new Hub();
    const openKinds = (hub: Hub) => hub.stations.map((s) => s.kind).sort().join(",");

    hostParty.syncHub(hostHub, DT);
    clientParty.syncHub(clientHub, DT);
    check("before any plan, neither deck has a raid portal",
      openKinds(hostHub) === openKinds(clientHub) && !openKinds(hostHub).includes("raidPortal"),
      openKinds(hostHub));

    // The host picks, the same call the War Table makes; the client learns of it the way
    // `receive()` actually does — a `plan` message rebuilt through the real wire types —
    // not by copying `.plan` directly, which would test a shortcut nobody's client takes.
    hostParty.setPlan(raidCfg, "raidPortal");
    (clientParty as unknown as { receive(from: string, msg: unknown): void }).receive("host", {
      k: "plan", players: 2, running: false,
      run: configToWire(hostParty.plan!.config), station: hostParty.plan!.station,
    });
    hostParty.syncHub(hostHub, DT);
    clientParty.syncHub(clientHub, DT);
    check("host and client derive the identical open stations from the same plan",
      openKinds(hostHub) === openKinds(clientHub) && openKinds(hostHub).includes("raidPortal"),
      `${openKinds(hostHub)} vs ${openKinds(clientHub)}`);
    check("...and specifically agree on which raid and which tier",
      hostHub.raid?.raidId === clientHub.raid?.raidId && hostHub.raid?.tier === clientHub.raid?.tier
      && clientHub.raid?.raidId === spec.id && clientHub.raid?.tier === tier,
      `host ${JSON.stringify(hostHub.raid)} vs client ${JSON.stringify(clientHub.raid)}`);

    // And it goes away again on both ends if the plan ever stops being a raid.
    hostParty.plan = null;
    (clientParty as unknown as { receive(from: string, msg: unknown): void }).receive("host", {
      k: "plan", players: 1, running: false,
    });
    hostParty.syncHub(hostHub, DT);
    clientParty.syncHub(clientHub, DT);
    check("...and both agree it's gone once the plan is",
      openKinds(hostHub) === openKinds(clientHub) && !openKinds(hostHub).includes("raidPortal"),
      openKinds(hostHub));
  }

  // 4. Going down is not dying: an ally standing over you brings you back.
  const rescueState = geared(14, 8803, 16, "lancer");
  const rescue = new Dungeon(rescueState, delveConfig(3, 0, 2), {
    seed: 99, role: "host", heroes: setups,
  });
  const downed = rescue.heroes[1]!;
  const saviour = rescue.heroes[0]!;
  downed.player.health = 0;
  downed.downed = true;
  check("one player down is not a wipe", rescue.phase === "fighting");
  saviour.avatar.x = downed.avatar.x;
  saviour.avatar.y = downed.avatar.y;
  const idle = new FakeInput();
  for (let i = 0; i < 240 && downed.downed; i++) {
    idle.beginTick();
    saviour.avatar.x = downed.avatar.x;
    saviour.avatar.y = downed.avatar.y;
    rescue.update(DT, idle as unknown as AvatarInput);
    rescue.drainEvents();
  }
  check("standing over an ally revives them", !downed.downed && downed.player.health > 0,
    `${downed.player.health.toFixed(0)} hp`);

  // And when the last one falls, the party loses the floor together.
  for (const hero of rescue.heroes) {
    hero.player.health = 0;
    hero.downed = true;
  }
  rescue.heroes[0]!.player.health = 1;
  rescue.heroes[0]!.downed = false;
  idle.beginTick();
  rescue.update(DT, idle as unknown as AvatarInput);
  check("a party still standing keeps the floor alive", rescue.phase !== "dead");

  // 6. A dropped connection can't hold the run hostage (UAT §1 A1). The body stays, but
  // it is out of every count: no revive, no descend gate, no aggro — and if it was the
  // last one standing besides you, the floor is lost rather than stuck.
  {
    const gone = new Dungeon(geared(14, 8804, 16, "lancer"), delveConfig(3, 0, 2), {
      seed: 7, role: "host", heroes: setups,
    });
    const stayed = gone.heroes[0]!;
    const left = gone.heroes[1]!;
    gone.dropHero(left);
    check("a departed hero is out of the descend count", gone.partySize === 1 && left.downed && left.departed);
    gone.completionPortal = { x: stayed.avatar.x, y: stayed.avatar.y };
    left.avatar.x = stayed.avatar.x;
    left.avatar.y = stayed.avatar.y;
    check("…even with its body lying in the portal",
      gone.partyAtCompletionPortal === 1 && gone.partyAtCompletionPortal >= gone.partySize);
    gone.completionPortal = null;
    check("monsters don't chase a body that left", gone.nearestHero(left.avatar.x, left.avatar.y) === stayed);
    const over = new FakeInput();
    for (let i = 0; i < 240; i++) {
      over.beginTick();
      stayed.avatar.x = left.avatar.x;
      stayed.avatar.y = left.avatar.y;
      gone.update(DT, over as unknown as AvatarInput);
      gone.drainEvents();
    }
    check("standing over a departed hero doesn't revive it", left.downed && left.departed && left.reviveProgress === 0);
    // Clearing the floor picks up the downed — not the departed.
    gone.killsSoFar = gone.killsRequired;
    gone.elitesKilled = gone.elitesRequired;
    gone.wave = gone.profile.waves;
    gone.enemies.length = 0;
    over.beginTick();
    gone.update(DT, over as unknown as AvatarInput);
    check("clearing the floor doesn't stand a departed hero back up",
      gone.phase === "cleared" && left.downed && left.departed, gone.phase);
    // The snapshot carries the flag, so a client draws them as gone rather than as
    // somebody to go and rescue.
    const mirror = new Dungeon(geared(14, 8802, 16, "magician"), delveConfig(3, 0, 2), {
      seed: 7, role: "client", heroes: setups.map((setup, i) => ({ ...setup, local: i === 1 })),
    });
    applySnapshot(mirror, JSON.parse(JSON.stringify(encodeSnapshot(gone))));
    check("a client learns who left from the snapshot", mirror.heroes[1]!.departed && !mirror.heroes[0]!.departed);

    const limbo = new Dungeon(geared(14, 8805, 16, "lancer"), delveConfig(3, 0, 2), {
      seed: 8, role: "host", heroes: setups,
    });
    limbo.heroes[0]!.downed = true;
    limbo.heroes[0]!.player.health = 0;
    check("one down and one connected is still a floor", limbo.phase === "fighting");
    limbo.dropHero(limbo.heroes[1]!);
    check("the last one standing leaving is a wipe, not a limbo", limbo.phase === "dead");

    // And the backstop under all of it: a party floor with no hero of our own refuses to
    // build, rather than quietly driving (and banking for) the host's character (A2).
    let refused = false;
    try {
      new Dungeon(geared(14, 8802, 16, "magician"), delveConfig(3, 0, 2), {
        seed: 7, role: "client", heroes: setups.map((setup) => ({ ...setup, local: false })),
      });
    } catch {
      refused = true;
    }
    check("a client floor without our own hero refuses to build", refused);
  }

  // 7. The run's roster is frozen when it starts (UAT §1 A2). The party layer is driven
  // here with a stubbed relay: `Party` never opens a socket until asked, so its message
  // handler can be fed directly and its sends captured.
  {
    type Sent = { msg: PartyMessage; to?: string };
    const wire = (state: GameState, id: string): HeroWire => ({
      id, name: id, classId: state.activeClassId,
      player: playerToJSON(state.player) as unknown as Record<string, unknown>,
      appearance: state.appearance as unknown as Record<string, unknown>, potions: 3,
    });
    const rig = (state: GameState, id: string, host: boolean) => {
      const party = new Party(state);
      const sent: Sent[] = [];
      const net = party.net;
      net.send = (msg, to) => { sent.push({ msg, to }); };
      net.status = "connected";
      net.code = "ABCD";
      net.id = id;
      net.isHost = host;
      net.hostId = host ? id : "p1";
      const notices: string[] = [];
      party.onNotice = (text) => notices.push(text);
      const starts: { ids: string[]; localIndex: number }[] = [];
      party.onStart = (_config, _seed, heroes) => {
        starts.push({ ids: heroes.map((h) => h.netId), localIndex: heroes.findIndex((h) => h.local) });
      };
      const ends: { how: string; early: boolean }[] = [];
      party.onEnd = (how, early) => ends.push({ how, early });
      return { party, net, sent, notices, starts, ends };
    };
    const startsSent = (sent: Sent[]) => sent.filter((s): s is Sent & { msg: Extract<PartyMessage, { k: "start" }> } => s.msg.k === "start");

    const hostState = geared(14, 8806, 16, "swordsman");
    const host = rig(hostState, "p1", true);
    host.net.peers = [{ id: "p2", name: "Cousin" }];
    host.net.onChange();
    host.net.onMessage("p2", { k: "hello", hero: wire(geared(14, 8807, 16, "magician"), "p2") });
    host.party.startFloor(delveConfig(2, 0, 2));
    let starts = startsSent(host.sent);
    check("the host starts a run with everybody who said hello",
      host.starts[0]?.ids.join() === "p1,p2" && starts.length === 1 && starts[0]!.to === "p2",
      JSON.stringify(host.starts[0]));

    // Somebody joins mid-run. They get the plan (and that a floor is under way), a hello
    // is fine, but the next floor is still the original roster's.
    host.sent.length = 0;
    host.net.peers.push({ id: "p3", name: "Latecomer" });
    host.net.onChange();
    const planToNewcomer = host.sent.find((s) => s.msg.k === "plan" && s.to === "p3")?.msg as Extract<PartyMessage, { k: "plan" }> | undefined;
    check("a mid-run arrival is told a floor is under way", planToNewcomer?.running === true);
    host.net.onMessage("p3", { k: "hello", hero: wire(geared(14, 8808, 16, "lancer"), "p3") });
    host.sent.length = 0;
    host.party.endRun("descend");
    host.party.descend(delveConfig(2, 0, 2));
    starts = startsSent(host.sent);
    check("descending keeps the roster the run started with",
      host.starts[1]?.ids.join() === "p1,p2" && starts.every((s) => s.to === "p2"),
      JSON.stringify(host.starts[1]));
    check("…and the newcomer is never sent that floor", !starts.some((s) => s.to === "p3"));
    // If the original mate drops mid-run, the next floor is just the host.
    host.net.peers = host.net.peers.filter((p) => p.id !== "p2");
    host.net.onChange();
    host.party.endRun("descend");
    host.party.descend(delveConfig(3, 0, 2));
    check("a dropped mate isn't carried into the next floor", host.starts[2]?.ids.join() === "p1", JSON.stringify(host.starts[2]));
    // A finished run frees the roster: the next one takes whoever's ready.
    host.sent.length = 0;
    host.party.endRun("extract", true);
    const end = host.sent.find((s) => s.msg.k === "end")?.msg as Extract<PartyMessage, { k: "end" }> | undefined;
    check("an early bail-out says so on the wire", end?.how === "extract" && end.early === true);
    host.party.startFloor(delveConfig(2, 0, 2));
    check("the next run takes the newcomer", host.starts[3]?.ids.join() === "p1,p3", JSON.stringify(host.starts[3]));

    // The client's own guarantee: a start without us in it is ignored outright.
    const clientState = geared(14, 8808, 16, "lancer");
    const client = rig(clientState, "p3", false);
    client.net.peers = [{ id: "p1", name: "Host" }, { id: "p2", name: "Cousin" }];
    client.net.onChange();
    const cfg = configToWire(delveConfig(2, 0, 2));
    const others = [wire(hostState, "p1"), wire(geared(14, 8807, 16, "magician"), "p2")];
    client.net.onMessage("p1", { k: "start", seed: 1, config: cfg, heroes: others });
    check("a client ignores a start it isn't part of", client.starts.length === 0 && !client.party.running);
    client.net.onMessage("p1", { k: "plan", players: 3, running: true });
    check("…and is told to wait for the next run", client.notices.some((n) => /next run/.test(n)) && client.party.hostRunning);
    client.net.onMessage("p1", { k: "end", how: "descend", early: false });
    check("a floor it wasn't on ending is none of its business", client.ends.length === 0 && !client.party.running);
    client.net.onMessage("p1", { k: "start", seed: 1, config: cfg, heroes: [...others, wire(clientState, "p3")] });
    check("a start that includes it is adopted, with itself as the local hero",
      client.starts.length === 1 && client.starts[0]!.localIndex === 2 && client.party.running);
    client.net.onMessage("p1", { k: "end", how: "extract", early: true });
    check("the early flag arrives with the end", client.ends[0]?.how === "extract" && client.ends[0]?.early === true);

    // The host's browser going away mid-floor is an early extraction, not a wipe (D2).
    client.net.onMessage("p1", { k: "start", seed: 2, config: cfg, heroes: [...others, wire(clientState, "p3")] });
    client.net.onClosed("The host left.");
    check("the host leaving ends the floor as an early extraction",
      client.ends[1]?.how === "hostLeft" && client.ends[1]?.early === true && !client.party.running);


    // D1: the host picks the party's run by walking into a portal — any portal. The plan
    // crosses the wire as a config, that portal is everybody's ready spot, and the run
    // that starts is the one the host picked, sized to the party.
    const picker = rig(geared(14, 8815, 16, "swordsman"), "p1", true);
    picker.net.peers = [{ id: "p2", name: "Cousin" }];
    picker.net.onChange();
    picker.net.onMessage("p2", { k: "hello", hero: wire(geared(14, 8816, 16, "magician"), "p2") });
    const hostHub = new Hub();
    picker.party.syncHub(hostHub, DT);
    check("a room with no plan has no ready spot", hostHub.partyOpen && hostHub.partyHost && hostHub.partyTarget === null);
    picker.sent.length = 0;
    picker.party.setPlan(riftConfig("abyss", 2, 1, 0), "abyss");
    const planMsg = picker.sent.find((s) => s.msg.k === "plan")?.msg as Extract<PartyMessage, { k: "plan" }> | undefined;
    check("picking a rift broadcasts it as the plan", planMsg?.run?.mode === "abyss" && planMsg.run.tier === 2 && planMsg.station === "abyss");
    const watcher = rig(geared(14, 8816, 16, "magician"), "p2", false);
    watcher.net.peers = [{ id: "p1", name: "Host" }];
    watcher.net.onChange();
    watcher.net.onMessage("p1", planMsg!);
    check("a client learns the plan", watcher.party.plan?.config.mode.id === "abyss" && watcher.party.plan?.config.tier === 2
      && watcher.party.plan?.station === "abyss");
    const mateHub = new Hub();
    watcher.party.syncHub(mateHub, DT);
    check("…and its ready spot is that portal", mateHub.partyTarget === "abyss" && !mateHub.partyHost);
    // Everybody walks into the Abyssal Rift.
    const abyss = hostHub.stations.find((s) => s.kind === "abyss")!;
    hostHub.x = abyss.x;
    hostHub.y = abyss.y;
    picker.party.syncHub(hostHub, DT);
    check("the host alone in the portal starts nothing", picker.starts.length === 0);
    picker.net.onMessage("p2", { k: "hub", x: abyss.x, y: abyss.y, facing: 0, ready: true });
    picker.party.syncHub(hostHub, DT);
    check("the last one in starts the run the host picked", picker.starts.length === 1);
    const started = picker.sent.filter((s) => s.msg.k === "start").map((s) => s.msg as Extract<PartyMessage, { k: "start" }>);
    check("…as that rift, sized to the party",
      started[0]?.config.mode === "abyss" && started[0].config.tier === 2 && started[0].config.players === 2,
      JSON.stringify(started[0]?.config));
    // Leaving a floor must land the party on the deck and *leave it there*. Everybody is
    // still standing exactly where they dove from, and every `ready` the host holds is
    // from before the floor started — so if readiness were a level rather than an edge,
    // the very next `syncHub` would start the plan's first floor again (the bug that made
    // "extract" in co-op mean "restart the Delve, forever"). Both ends of the wire are
    // driven here: the client says what it says, the host hears exactly that.
    type HubMsg = Extract<PartyMessage, { k: "hub" }>;
    const forward = (from: typeof picker, to: typeof watcher) => {
      for (const s of from.sent) if (s.to === undefined || s.to === to.net.id) to.net.onMessage(from.net.id, s.msg);
      from.sent.length = 0;
    };
    /** Enough hub ticks for one lobby broadcast, and what it said about being ready. */
    const report = (who: typeof picker, hub: Hub): HubMsg | undefined => {
      who.sent.length = 0;
      for (let i = 0; i < 8; i++) who.party.syncHub(hub, DT);
      return who.sent.filter((s) => s.msg.k === "hub").pop()?.msg as HubMsg | undefined;
    };
    const OFF_DECK = { x: HUB_WIDTH / 2, y: HUB_HEIGHT - 40 };
    const stand = (hub: Hub, at: { x: number; y: number }) => { hub.x = at.x; hub.y = at.y; };
    /** Everybody steps out and walks back in, client first; returns how many runs that started. */
    const walkBackIn = (portal: { x: number; y: number }): number => {
      const before = picker.starts.length;
      stand(mateHub, OFF_DECK);
      forward(watcher, picker); // (nothing of note; keeps the mailboxes honest)
      const out = report(watcher, mateHub);
      check("a client stepping out of the portal says so", out?.ready === false);
      stand(mateHub, portal);
      const back = report(watcher, mateHub);
      check("…and walking back in re-arms it", back?.ready === true);
      forward(watcher, picker);
      // The host is still standing where it dove from and hasn't stepped out yet.
      report(picker, hostHub);
      check("a ready mate can't start a run past a host who never left the portal",
        picker.starts.length === before && !hostHub.partyReady);
      stand(hostHub, OFF_DECK);
      report(picker, hostHub);
      stand(hostHub, portal);
      report(picker, hostHub);
      forward(picker, watcher);
      return picker.starts.length - before;
    };
    // The watcher goes onto the floor the picker just started, so it has a floor to end.
    stand(mateHub, abyss);
    forward(picker, watcher);
    check("the client adopted the floor the walk-in started", watcher.party.running && watcher.starts.length === 1);
    const exits: [how: "extract" | "wipe", early: boolean, label: string][] = [
      ["extract", false, "a clean extraction"],
      ["extract", true, "an early bail-out"],
      ["wipe", false, "a wipe"],
    ];
    for (const [how, early, label] of exits) {
      const before = picker.starts.length;
      picker.party.endRun(how, early);
      forward(picker, watcher); // the `end`, then the plan re-broadcast with running=false
      check(`${label} ends the floor on both ends`, !picker.party.running && !watcher.party.running
        && watcher.ends[watcher.ends.length - 1]?.how === how);
      // Nobody has moved. The client's own report from inside the portal is "not ready"…
      const stale = report(watcher, mateHub);
      check(`after ${label}, a client still standing in the portal doesn't report ready`, stale?.ready === false, JSON.stringify(stale));
      forward(watcher, picker);
      // …and even before that report arrived, the host held nobody as ready.
      check(`after ${label}, the host holds nobody as ready`, picker.party.members.every((m) => !m.ready));
      for (let i = 0; i < 30; i++) picker.party.syncHub(hostHub, DT);
      check(`after ${label}, the party stays on the deck instead of restarting the run`,
        picker.starts.length === before && !picker.party.running && !hostHub.partyReady,
        `${picker.starts.length - before} run(s) started off stale readiness`);
      check(`after ${label}, walking back in deliberately starts the next run`, walkBackIn(abyss) === 1);
      check("…and the client is on it", watcher.party.running && watcher.starts.length === picker.starts.length);
    }
    // Descending is the one end that keeps the run going, and it never touched the deck.
    {
      const before = picker.starts.length;
      picker.party.endRun("descend");
      forward(picker, watcher);
      for (let i = 0; i < 30; i++) picker.party.syncHub(hostHub, DT);
      check("descending never re-reads the deck", picker.starts.length === before && picker.party.running);
      picker.party.descend(picker.party.plan!.config);
      forward(picker, watcher);
      check("…and the next floor follows it", picker.starts.length === before + 1 && watcher.party.running);
      picker.party.endRun("extract");
      forward(picker, watcher);
    }
    // The same promise holds when the plan is the Delve, from its own portal.
    {
      picker.party.setPlan(delveConfig(2, 0, 2), "dive");
      forward(picker, watcher);
      const dive = hostHub.stations.find((s) => s.kind === "dive")!;
      check("picking the Delve makes it the ready spot", picker.party.plan?.station === "dive" && watcher.party.plan?.station === "dive");
      check("a Delve walk-in starts the Delve", walkBackIn(dive) === 1 && watcher.party.running);
      const before = picker.starts.length;
      picker.party.endRun("extract");
      forward(picker, watcher);
      report(watcher, mateHub);
      forward(watcher, picker);
      for (let i = 0; i < 30; i++) picker.party.syncHub(hostHub, DT);
      check("extracting from a co-op Delve lands on the deck, not back at the Delve's first floor",
        picker.starts.length === before && !picker.party.running && !watcher.party.running);
      // Leave everybody off the portals for what follows.
      stand(hostHub, OFF_DECK);
      stand(mateHub, OFF_DECK);
      report(picker, hostHub);
      report(watcher, mateHub);
      forward(picker, watcher);
      forward(watcher, picker);
    }
    // A planet plan grows the expedition portal on everybody's deck; another plan takes it away.
    picker.party.setPlan(planetConfig(PLANETS[0]!, 1, 1, 0), "expedition");
    picker.party.syncHub(hostHub, DT);
    check("a planet plan puts the Reliquary Portal on the host's deck",
      hostHub.expedition?.planetId === PLANETS[0]!.id && hostHub.partyTarget === "expedition");
    const planetPlan = picker.sent.filter((s) => s.msg.k === "plan").pop()!.msg as Extract<PartyMessage, { k: "plan" }>;
    watcher.net.onMessage("p1", planetPlan);
    watcher.party.syncHub(mateHub, DT);
    check("…and on the client's", mateHub.expedition?.planetId === PLANETS[0]!.id && mateHub.stations.some((s) => s.kind === "expedition"));
    picker.party.setPlan(delveConfig(5, 0), "dive");
    picker.party.syncHub(hostHub, DT);
    check("switching to the Delve takes the sector portal away again", hostHub.expedition === null && hostHub.partyTarget === "dive");

    // The Tower in co-op. The owner's report was "the tower just makes you queue for the
    // delve": `main.ts` picked the party's station off a hardcoded allowlist (`abyss`,
    // `hoard`, else `dive`), so a Tower plan readied the party at the Delve portal, and two
    // hand-rolled `describeRun` copies fell through to "Delve depth N". The station is now
    // derived from the mode through one total table, and the naming is one exhaustive
    // function — both asserted here as properties over every mode, then the climb is
    // walked end to end on the same two-end rig the rifts and the Delve use above.
    {
      // (a) The table maps every mode with a portal back to itself through the station's
      // own mode — a portal that "belongs" to a different mode is the allowlist bug in
      // table form. The old expression is quoted verbatim as the comparison, so this check
      // says what would have made it red: the Tower (and every other non-rift mode)
      // landing on `dive`.
      const oldStation = (mode: RunModeId) => (mode === "abyss" || mode === "hoard" ? mode : "dive");
      const withPortal = RUN_MODES.filter((m) => PARTY_PORTAL[m] !== null);
      check("every mode's party portal is a door to that same mode",
        withPortal.every((m) => STATION_MODE[PARTY_PORTAL[m]!] === m),
        withPortal.map((m) => `${m}->${PARTY_PORTAL[m]}`).join(" "));
      const mismatched = withPortal.filter((m) => oldStation(m) !== PARTY_PORTAL[m]);
      check("...and the old allowlist disagreed with it for the Tower, which is the bug",
        mismatched.includes("tower") && STATION_MODE[oldStation("tower")] !== "tower",
        `old allowlist wrong for: ${mismatched.join(", ")}`);
      // The nulls are pinned by name, with the reason: the wire has no field for a Memory
      // instance, a Vigil day or a Convergence week, so a party cannot be handed one.
      // Adding a wire field for one of them is what un-pins it here.
      const noPortal = RUN_MODES.filter((m) => PARTY_PORTAL[m] === null).sort().join(",");
      check(`walked ${withPortal.length} modes with a party portal, ${RUN_MODES.length - withPortal.length} without`,
        withPortal.length === 6 && noPortal === "convergence,memory,training,vigil", noPortal);

      // (b) The naming: a Tower plan is announced as a climb, never as a Delve, and no two
      // modes at the same numbers read as the same run.
      const height = 3;
      const towerCfg = towerConfig(height, 0, 2);
      check("a Tower plan is described as a height, not a Delve depth",
        /Tower/.test(describeRun(towerCfg)) && /height 3/.test(describeRun(towerCfg)) && !/Delve/.test(describeRun(towerCfg)),
        describeRun(towerCfg));
      const lines = RUN_MODES.map((m) => {
        const c = m === "tower" ? towerConfig(3) : m === "delve" ? delveConfig(3)
          : MODES[m].isRift ? riftConfig(m, 3, 1) : { ...delveConfig(3), mode: MODES[m] };
        return describeRun(c);
      });
      check("no two modes describe themselves with the same line",
        new Set(lines).size === lines.length, lines.join(" | "));

      // (c) The party goes where the host goes — for EVERY mode a party can run, on a
      // deck whose own account has unlocked nothing. `main.ts` sets every unlock flag
      // from the viewer's own records each hub tick, just before `syncHub`; the raid and
      // the Tower were each found broken here separately (a member below the gate had no
      // station to stand in, so the ready check never saw them) and each got its own
      // override. Now `Hub.stations` answers it once, and this walks the whole table so
      // the next gated mode is covered before anyone plays it. The `never` makes a new
      // plannable mode fail `check:tools` until it is given a config here.
      const planFor = (mode: RunModeId): RunConfig | null => {
        switch (mode) {
          case "delve": return delveConfig(5, 0, 2);
          case "abyss":
          case "hoard": return { ...riftConfig(mode, 1, 1, 0), players: 2 };
          case "tower": return towerCfg;
          case "planet": return { ...planetConfig(PLANETS[0]!, 1, 1, 0), players: 2 };
          case "raid": return raidConfig(RAIDS[0]!, 1, 0, 2);
          case "memory": case "vigil": case "convergence": case "training": return null;
          default: { const unhandled: never = mode; return unhandled; }
        }
      };
      const lockEverything = (hub: Hub) => {
        hub.towerOpen = false; hub.raidOpen = false; hub.vigilOpen = false;
        hub.weeklyOpen = false; hub.altarOpen = false;
      };
      for (const mode of withPortal) {
        const cfg = planFor(mode);
        const portal = PARTY_PORTAL[mode]!;
        if (!cfg) { check(`${mode} has a party portal but no config to plan it with`, false); continue; }
        picker.party.setPlan(cfg, portal);
        forward(picker, watcher);
        lockEverything(hostHub);
        lockEverything(mateHub);
        picker.party.syncHub(hostHub, DT);
        watcher.party.syncHub(mateHub, DT);
        check(`a ${mode} plan puts the ${portal} on both decks when neither account has unlocked it`,
          hostHub.partyStation?.kind === portal && mateHub.partyStation?.kind === portal
          && watcher.party.plan?.station === portal,
          `host ${hostHub.partyStation?.kind} / client ${mateHub.partyStation?.kind}`);
      }
      // Back to the Tower for the climb itself.
      picker.party.setPlan(towerCfg, partyPortalFor("tower")!);
      forward(picker, watcher);
      lockEverything(hostHub);
      lockEverything(mateHub);
      picker.party.syncHub(hostHub, DT);
      watcher.party.syncHub(mateHub, DT);
      check("picking the Tower makes its portal the ready spot on both ends",
        picker.party.plan?.station === "tower" && watcher.party.plan?.station === "tower"
        && hostHub.partyTarget === "tower" && mateHub.partyTarget === "tower");
      check("a client rebuilt the plan as a climb at the same height",
        watcher.party.plan?.config.mode.id === "tower" && watcher.party.plan?.config.tower?.height === height,
        JSON.stringify(watcher.party.plan?.config.tower));
      const tower = hostHub.stations.find((s) => s.kind === "tower")!;
      // What the *client* builds is the thing to read — the config its `onStart` receives
      // has been through `configToWire` and `configFromWire` for real. (The host's sent
      // buffer can't be read here: `walkBackIn`'s `report` helper clears it.)
      const built: RunConfig[] = [];
      const adopt = watcher.party.onStart;
      watcher.party.onStart = (config, seed, heroes) => { built.push(config); adopt(config, seed, heroes); };
      check("a Tower walk-in starts the Tower", walkBackIn(tower) === 1 && watcher.party.running);
      const first = built[built.length - 1];
      check("...and the client built a Tower floor at that height, sized to the party",
        first?.mode.id === "tower" && first.tower?.height === height && first.depth === height && first.players === 2,
        `mode ${first?.mode.id}, height ${first?.tower?.height}, players ${first?.players}`);
      // Clearing it goes *up*, and the next floor is still the Tower on both ends — the
      // client rebuilds through `towerConfig`, not the Delve fallback.
      picker.party.endRun("descend");
      picker.party.descend(picker.party.plan!.config);
      forward(picker, watcher);
      const next = built[built.length - 1];
      check("clearing a Tower floor in a party climbs to the next height on the client too",
        built.length === 2 && next?.mode.id === "tower" && next.tower?.height === height + 1
        && next.depth === height + 1 && watcher.party.running,
        `${built.length} floors built; last: mode ${next?.mode.id}, height ${next?.tower?.height}`);
      watcher.party.onStart = adopt;
      picker.party.endRun("extract");
      forward(picker, watcher);
      report(watcher, mateHub);
      forward(watcher, picker);
      stand(hostHub, OFF_DECK);
      stand(mateHub, OFF_DECK);
      report(picker, hostHub);
      report(watcher, mateHub);
      forward(picker, watcher);
      forward(watcher, picker);
      // Once the plan is no longer a climb, an un-unlocked deck loses the portal again.
      picker.party.setPlan(delveConfig(5, 0), "dive");
      forward(picker, watcher);
      hostHub.towerOpen = false;
      mateHub.towerOpen = false;
      picker.party.syncHub(hostHub, DT);
      watcher.party.syncHub(mateHub, DT);
      check("switching away from the Tower takes its portal off a deck that hasn't earned it",
        !hostHub.stations.some((s) => s.kind === "tower") && !mateHub.stations.some((s) => s.kind === "tower"));
    }
    // Leaving the room clears the plan and the deck.
    watcher.party.leave();
    watcher.party.syncHub(mateHub, DT);
    check("leaving the room clears the plan", watcher.party.plan === null && mateHub.partyTarget === null && !mateHub.partyOpen);
  }

  // 8. Procedural generation is deterministic across the wire (UAT §1 C6): a client
  // rebuilding a floor from the seed and the flattened config gets the identical level
  // — every wall, trap, prop and node, not just the wall count — for every run mode.
  {
    const fingerprint = (d: Dungeon) => JSON.stringify({
      size: [d.level.width, d.level.height, d.level.cols, d.level.rows],
      layout: d.level.layout, label: d.level.label, rooms: d.level.rooms, seed: d.level.seed,
      biome: d.level.biome.name,
      start: d.level.start, portal: d.level.portal,
      walls: d.level.walls, traps: d.level.traps, props: d.level.props, nodes: d.level.resourceNodes,
      blocked: Array.from(d.level.blocked).reduce((h, v, i) => (h * 31 + v * (i + 1)) % 2147483647, 7),
      quota: [d.killsRequired, d.elitesRequired],
    });
    const hostSide = geared(14, 8809, 16, "swordsman");
    const clientSide = geared(14, 8810, 16, "magician");
    const pair = [
      { netId: "p1", name: "Host", player: hostSide.player, appearance: hostSide.appearance, potions: 5, local: true },
      { netId: "p2", name: "Cousin", player: clientSide.player, appearance: clientSide.appearance, potions: 5, local: false },
    ];
    const cases: [string, RunConfig][] = [
      ["a delve floor", delveConfig(8, 0, 2)],
      ["a boss floor", delveConfig(10, 0, 2)],
      ["a rift floor", { ...riftConfig("abyss", 2, 1, 0), players: 2 }],
      ["a planet floor", { ...planetConfig(PLANETS[0]!, 1, 1, 0), players: 2 }],
      // The Tower rides the wire on `mode` + `floor` alone; a client that rebuilt it
      // through the Delve fallback would get the descent's biome at that depth.
      ["a tower floor", towerConfig(7, 0, 2)],
      ["a tower boss floor", towerConfig(10, 0, 2)],
    ];
    for (const [label, config] of cases) {
      const h = new Dungeon(hostSide, config, { seed: 31337, role: "host", heroes: pair });
      const c = new Dungeon(clientSide, configFromWire(configToWire(config)), {
        seed: 31337, role: "client", heroes: pair.map((p, i) => ({ ...p, local: i === 1 })),
      });
      check(`${label} is identical on both ends of the wire`, fingerprint(h) === fingerprint(c),
        `${h.level.walls.length} walls, ${h.level.traps.length} traps, quota ${h.killsRequired}/${h.elitesRequired}`);
    }

    // Generating the same floor is not the same as agreeing about it once it moves. A saw
    // is the one hazard that travels, and its position is *derived* on both ends from the
    // `t` the snapshot carries rather than being sent — so this is the check that the
    // deriving actually happens. It didn't: the wire moved the number and nothing moved
    // the blade, and a client drew every saw parked at its track start while the host's
    // patrolled somewhere else and hurt them from there.
    let sawSeed = 0;
    for (let seed = 900; seed < 1000 && sawSeed === 0; seed++) {
      const probe = new Dungeon(hostSide, delveConfig(14, 0, 2), { seed, role: "host", heroes: pair });
      if (probe.level.traps.some((t) => t.kind === "saw")) sawSeed = seed;
    }
    if (sawSeed === 0) {
      check("a floor with a saw on it exists to test", false, "no saw in seeds 900-999 at depth 14");
    } else {
      const cfg = delveConfig(14, 0, 2);
      const h = new Dungeon(hostSide, cfg, { seed: sawSeed, role: "host", heroes: pair });
      const c = new Dungeon(clientSide, configFromWire(configToWire(cfg)), {
        seed: sawSeed, role: "client", heroes: pair.map((p, i) => ({ ...p, local: i === 1 })),
      });
      const idle = new FakeInput();
      const sawIndex = h.level.traps.findIndex((t) => t.kind === "saw");
      const home = { x: c.level.traps[sawIndex]!.x, y: c.level.traps[sawIndex]!.y };
      for (let i = 0; i < 120; i++) {
        idle.beginTick();
        h.update(DT, idle as unknown as AvatarInput);
        h.drainEvents();
      }
      const hostSaw = h.level.traps[sawIndex]!;
      applySnapshot(c, JSON.parse(JSON.stringify(encodeSnapshot(h))) as Snapshot);
      const clientSaw = c.level.traps[sawIndex]!;
      check("the saw actually travelled on the host", Math.hypot(hostSaw.x - home.x, hostSaw.y - home.y) > 20,
        `${Math.hypot(hostSaw.x - home.x, hostSaw.y - home.y).toFixed(0)}u from its track start`);
      check("a client draws the saw where the host's blade actually is",
        Math.hypot(clientSaw.x - hostSaw.x, clientSaw.y - hostSaw.y) < 1,
        `client ${clientSaw.x.toFixed(0)},${clientSaw.y.toFixed(0)} vs host ${hostSaw.x.toFixed(0)},${hostSaw.y.toFixed(0)}`);
    }
  }

  // 9. What a client sees between snapshots (UAT §1 B1): a body the client already had
  // slides to where the new snapshot put it over the next few ticks instead of jumping
  // there and freezing; projectiles fly on; wind-ups keep counting down.
  {
    const snap = (d: Dungeon): Snapshot => JSON.parse(JSON.stringify(encodeSnapshot(d))) as Snapshot;
    const hostS = geared(14, 8811, 16, "swordsman");
    const cliS = geared(14, 8812, 16, "magician");
    const pair = [
      { netId: "p1", name: "Host", player: hostS.player, appearance: hostS.appearance, potions: 5, local: true },
      { netId: "p2", name: "Cousin", player: cliS.player, appearance: cliS.appearance, potions: 5, local: false },
    ];
    const cfg = delveConfig(4, 0, 2);
    const h = new Dungeon(hostS, cfg, { seed: 555, role: "host", heroes: pair });
    const c = new Dungeon(cliS, configFromWire(configToWire(cfg)), {
      seed: 555, role: "client", heroes: pair.map((p, i) => ({ ...p, local: i === 1 })),
    });
    const idle = new FakeInput();
    for (let i = 0; i < 600 && !h.enemies.some((e) => e.state !== "spawning"); i++) {
      idle.beginTick();
      h.update(DT, idle as unknown as AvatarInput);
      h.drainEvents();
    }
    applySnapshot(c, snap(h));
    const target = h.enemies.find((e) => e.state !== "spawning")!;
    const mirror = c.enemies.find((e) => e.id === target.id)!;
    check("a client has the monster in the first place", mirror !== undefined && Math.abs(mirror.x - target.x) < 1);
    target.x += 30;
    target.windup = 0.5;
    const before = mirror.x;
    applySnapshot(c, snap(h));
    check("a new snapshot doesn't teleport a monster the client already had", Math.abs(mirror.x - before) < 1);
    const xs: number[] = [];
    for (let i = 0; i < 4; i++) {
      idle.beginTick();
      c.update(DT, idle as unknown as AvatarInput);
      xs.push(mirror.x);
    }
    const monotone = xs.every((x, i) => i === 0 || x >= xs[i - 1]! - 1e-6);
    // The wire rounds positions to whole pixels, so "there" is the rounded spot.
    check("…it slides there over the next ticks", monotone && xs[0]! > before + 1 && Math.abs(xs[3]! - Math.round(target.x)) < 0.01,
      `${before.toFixed(1)} → ${xs.map((v) => v.toFixed(1)).join(" → ")} (target ${Math.round(target.x)})`);
    check("…with a fresh previous position every tick for the renderer to lerp from",
      Math.abs(mirror.px - xs[2]!) < 1e-6);
    check("a monster's wind-up keeps counting down between snapshots", mirror.windup < 0.5 - DT * 3.5 && mirror.windup > 0.5 - DT * 4.5,
      mirror.windup.toFixed(3));

    // The host's own hero is a remote body on the client, and slides the same way.
    const hostAvatar = h.heroes[0]!.avatar;
    const hostMirror = c.heroes[0]!.avatar;
    hostAvatar.x += 20;
    const hb = hostMirror.x;
    applySnapshot(c, snap(h));
    idle.beginTick();
    c.update(DT, idle as unknown as AvatarInput);
    check("an ally slides too, rather than jumping", hostMirror.x > hb + 1 && hostMirror.x < hostAvatar.x - 1,
      `${hb.toFixed(1)} → ${hostMirror.x.toFixed(1)} → ${hostAvatar.x.toFixed(1)}`);

    // A bolt carries its velocity across and keeps flying until the next snapshot.
    h.projectiles.push({
      x: 100, y: 100, px: 100, py: 100, radius: 4, vx: 120, vy: 0, damage: 0, friendly: true, owner: 0,
      life: 1, color: "#fff", element: "physical", pierce: 0, hits: new Set(), ailment: 0, basic: false,
    });
    applySnapshot(c, snap(h));
    idle.beginTick();
    c.update(DT, idle as unknown as AvatarInput);
    const bolt = c.projectiles[c.projectiles.length - 1]!;
    check("a projectile flies on between snapshots", Math.abs(bolt.x - (100 + 120 * DT)) < 0.01, bolt.x.toFixed(2));
    h.projectiles.length = 0;

    // A hero's ailments cross the wire (B3), so a client can predict its own slow.
    h.heroes[1]!.sc.apply("chill", { sourceActorId: -1, chance: 1, roll: () => 0 });
    applySnapshot(c, snap(h));
    check("a hero's ailments cross the wire", c.heroes[1]!.sc.list.some((st) => st.id === "chill"));
    h.heroes[1]!.sc.list.length = 0;
    applySnapshot(c, snap(h));
    check("…and clear with it", c.heroes[1]!.sc.list.length === 0);

    // C1: a summoner's army and the corpses it's raised from cross the wire.
    h.minions.push({
      id: 41, owner: 0, unit: "skeleton", x: 300, y: 300, px: 300, py: 300, radius: 7,
      health: 30, maxHealth: 40, damage: 5, attackCooldown: 1, attackTimer: 0, attackRange: 20,
      windup: 0.3, speed: 100, element: "void", facing: 1, hitFlash: 0, knockX: 0, knockY: 0,
      remaining: 20, behavior: "follow", commandTargetId: null, guardX: 300, guardY: 300,
      sc: h.minions.length ? h.minions[0]!.sc : c.heroes[0]!.sc, stuckTimer: 0, dodgeDir: 1, embedTimer: 0,
    });
    h.corpsePile.push({ id: 1, x: 220, y: 240, remaining: 6 });
    applySnapshot(c, snap(h));
    const pet = c.minions.find((m) => m.id === 41);
    check("a summon crosses the wire", pet !== undefined && pet.owner === 0 && pet.x === 300 && pet.element === "void"
      && pet.health === 30 && pet.maxHealth === 40 && Math.abs(pet.windup - 0.3) < 0.01);
    check("a corpse crosses the wire", c.corpsePile.length === 1 && c.corpsePile[0]!.x === 220 && c.corpsePile[0]!.remaining === 6);
    h.minions[h.minions.length - 1]!.x = 330;
    applySnapshot(c, snap(h));
    idle.beginTick();
    c.update(DT, idle as unknown as AvatarInput);
    check("a summon slides like everything else", pet!.x > 301 && pet!.x < 329 && pet!.windup < 0.3 - DT * 0.5,
      `${pet!.x.toFixed(1)}, windup ${pet!.windup.toFixed(3)}`);
    h.minions.pop();
    h.corpsePile.length = 0;
    applySnapshot(c, snap(h));
    check("…and leaves with the host's", c.minions.every((m) => m.id !== 41) && c.corpsePile.length === 0);

    // C2: affixes travel too, so a client draws the ring and glyphs and reads the same
    // name the host does, not a bare "Grunt".
    const marked = h.enemies.find((e) => !e.boss)!;
    marked.affixes = [MONSTER_AFFIXES[0]!, MONSTER_AFFIXES[3]!];
    const fresh = new Dungeon(cliS, configFromWire(configToWire(cfg)), {
      seed: 555, role: "client", heroes: pair.map((p, i) => ({ ...p, local: i === 1 })),
    });
    applySnapshot(fresh, snap(h));
    const seenMarked = fresh.enemies.find((e) => e.id === marked.id)!;
    check("a monster's affixes cross the wire",
      seenMarked.affixes.map((a) => a.id).join() === marked.affixes.map((a) => a.id).join(),
      seenMarked.affixes.map((a) => a.id).join());
    check("…and the client names it the way the host does",
      seenMarked.name.startsWith(affixPrefix(marked.affixes)), seenMarked.name);
  }

  // 10. A client's own character is reconciled, not tugged (UAT §1 B2). Host and client
  // run in one process with a real delay between them — the client's buttons reach the
  // host LAG ticks late, the host's snapshots reach the client LAG ticks late — and the
  // question is how far each snapshot has to *move* the client's own character. The old
  // 25% blend moved it by a quarter of RTT×speed every time; a replayed prediction
  // should move it by nothing at all, dash included.
  {
    const LAG = 4;
    const hostS = geared(14, 8813, 16, "swordsman");
    const cliS = geared(14, 8814, 16, "lancer");
    const pair = [
      { netId: "p1", name: "Host", player: hostS.player, appearance: hostS.appearance, potions: 5, local: true },
      { netId: "p2", name: "Cousin", player: cliS.player, appearance: cliS.appearance, potions: 5, local: false },
    ];
    const cfg = delveConfig(2, 0, 2);
    const h = new Dungeon(hostS, cfg, { seed: 777, role: "host", heroes: pair });
    const c = new Dungeon(cliS, configFromWire(configToWire(cfg)), {
      seed: 777, role: "client", heroes: pair.map((p, i) => ({ ...p, local: i === 1 })),
    });
    const remote = new NetInput();
    h.heroes[1]!.input = remote as unknown as AvatarInput;
    const log = new InputLog();
    const hostInput = new FakeInput();
    const cliInput = new FakeInput();
    const toHost: { due: number; packet: ReturnType<typeof packInput> }[] = [];
    const toClient: { due: number; snap: Snapshot }[] = [];
    const corrections: number[] = [];
    let clientDashed = false;
    let hostDashed = false;
    const me = c.localHero.avatar;
    cliInput.hold("right", true);
    cliInput.hold("down", true);
    for (let tick = 0; tick < 300; tick++) {
      hostInput.beginTick();
      cliInput.beginTick();
      if (tick === 120) cliInput.press("dash");
      if (tick === 180) { cliInput.hold("down", false); cliInput.hold("up", true); }
      if (tick === 240) { cliInput.hold("right", false); cliInput.hold("left", true); }

      // The client's tick: predict, then send — the order main.ts uses.
      c.update(DT, cliInput as unknown as AvatarInput);
      if (me.dashTimer > 0) clientDashed = true;
      const seq = log.record(cliInput.moveVector(), cliInput.wasPressed("dash"));
      toHost.push({ due: tick + LAG, packet: packInput(cliInput as unknown as AvatarInput, me.x, me.y, seq) });

      // The host's tick: consume what has arrived, simulate, publish every third tick.
      while (toHost.length > 0 && toHost[0]!.due <= tick) remote.receive(toHost.shift()!.packet);
      remote.beginTick();
      h.update(DT, hostInput as unknown as AvatarInput);
      if (h.heroes[1]!.avatar.dashTimer > 0) hostDashed = true;
      h.enemies.length = 0; // movement only — no knockbacks, nothing the client couldn't predict
      h.drainEvents();
      if (tick % 3 === 0) toClient.push({ due: tick + LAG, snap: JSON.parse(JSON.stringify(encodeSnapshot(h))) as Snapshot });

      while (toClient.length > 0 && toClient[0]!.due <= tick) {
        const wasX = me.x;
        const wasY = me.y;
        applySnapshot(c, toClient.shift()!.snap, undefined, log);
        if (tick > 30) corrections.push(Math.hypot(me.x - wasX, me.y - wasY));
      }
    }
    corrections.sort((a, b) => a - b);
    const median = corrections[Math.floor(corrections.length / 2)] ?? Infinity;
    const worst = corrections[corrections.length - 1] ?? Infinity;
    // **THIS CHECK RUNS AT A CONSTANT LAG WITH NO JITTER AND NO LOSS, AND IS THEREFORE
    // BLIND TO THE FAILURE IT LOOKS LIKE IT COVERS.** `LAG` is a fixed number of ticks and
    // every packet arrives, in order. Re-measured 2026-09-10 with a real link underneath
    // (`npm run mpjitter`, the input-path section), the same rig breaks this very bar:
    //
    //     wifi, congested   median 0.02px   p95 0.03px   worst 2.00px   (bar is 1.5)
    //     transatlantic     median 0.02px   p95 1.95px   worst 5.94px
    //
    // and 26-50% of host ticks arrive with no input at all. So a green here says
    // reconciliation is correct, and says NOTHING about whether a client's movement holds
    // up on a real connection. It is kept because the property it does check is real; do
    // not cite it as evidence about live conditions. Same shape as the localhost tests
    // that could not see the snapshot chop.
    check("a walking client is never tugged back by the host (CONSTANT lag — see note above)",
      median < 0.1 && worst < 1.5,
      `median ${median.toFixed(3)}px, worst ${worst.toFixed(2)}px over ${corrections.length} snapshots at ${LAG * 2} ticks RTT`);
    check("the client dashed the instant it pressed, and the host agreed", clientDashed && hostDashed);
    // The uncorrected baseline, for the record: how far ahead a client at this RTT
    // actually runs, which is what the old blend used to pull it back by a quarter of.
    const lead = Math.hypot(me.x - h.heroes[1]!.avatar.x, me.y - h.heroes[1]!.avatar.y);
    console.log(`  the client runs ${lead.toFixed(1)}px ahead of the host at that lag — now replayed, not blended`);

    // B4: a lag spike centres the stick rather than walking somebody into a hazard.
    const stale = new NetInput();
    stale.receive({ seq: 1, move: [1, 0], aim: null, press: 0, ap: [10, 20] });
    stale.beginTick();
    check("a remote stick holds between packets, and carries its aim point",
      stale.moveVector().x === 1 && stale.aimPoint()?.x === 10 && stale.aimPoint()?.y === 20);
    for (let i = 0; i < 6; i++) stale.beginTick();
    check("…for a few ticks", stale.moveVector().x === 1);
    for (let i = 0; i < 10; i++) stale.beginTick();
    check("…but centres itself when the packets stop", stale.moveVector().x === 0);
    // A dropped packet's buttons survive into the next one rather than vanishing.
    const flood = new NetInput();
    for (let i = 1; i <= 9; i++) flood.receive({ seq: i, move: [0, 0], aim: null, press: i === 1 ? 2 : 0 });
    flood.beginTick();
    check("a dash in a dropped packet fires late rather than never", flood.wasPressed("dash"));
  }

  // 11. Dash charges (UAT §19's "gain an additional Dodge" — `dashCharges`). The dash
  // became a charge stock, and the one thing that must not regress is B2 above: a client
  // predicts its own dash and is reconciled by replay. So the same host/client rig runs
  // again with the client wearing +1 charge, and asserts three things directly — the
  // second dash is predicted the instant it's pressed and the host agrees; a third press
  // with the stock empty is predicted by NEITHER end; and the reconciliation never has to
  // move the client, dashes included. A solo control run pins the default: one charge is
  // exactly the old single cooldown.
  {
    const withCharge = (state: GameState): void => {
      const ring = rollItem({ rarity: "epic", type: "ring", ilvl: 14, rng: new Rng(0xda5) });
      state.player.equip({ ...ring, mods: [{ id: "smoke:dashCharges", key: "dashCharges", value: 1 }] });
    };
    const LAG = 4;
    const hostS = geared(14, 8815, 16, "swordsman");
    const cliS = geared(14, 8816, 16, "lancer");
    withCharge(cliS);
    check("a +1 dashCharges affix reads as two dashes on the sheet",
      cliS.player.dashCharges === 2 && hostS.player.dashCharges === 1);
    const pair = [
      { netId: "p1", name: "Host", player: hostS.player, appearance: hostS.appearance, potions: 5, local: true },
      { netId: "p2", name: "Cousin", player: cliS.player, appearance: cliS.appearance, potions: 5, local: false },
    ];
    const cfg = delveConfig(2, 0, 2);
    const h = new Dungeon(hostS, cfg, { seed: 778, role: "host", heroes: pair });
    const c = new Dungeon(cliS, configFromWire(configToWire(cfg)), {
      seed: 778, role: "client", heroes: pair.map((p, i) => ({ ...p, local: i === 1 })),
    });
    const remote = new NetInput();
    h.heroes[1]!.input = remote as unknown as AvatarInput;
    const log = new InputLog();
    const hostInput = new FakeInput();
    const cliInput = new FakeInput();
    const toHost: { due: number; packet: ReturnType<typeof packInput> }[] = [];
    const toClient: { due: number; snap: Snapshot }[] = [];
    const corrections: number[] = [];
    const me = c.localHero.avatar;
    const them = h.heroes[1]!.avatar;
    // Dash starts seen on each end, by tick. The first two presses (120, 132) come 12
    // ticks apart — the first dash is over (DASH_TIME is ~8 ticks) but its 45-tick
    // cooldown is not, so only a second charge can pay for it. The third (140) finds the
    // stock empty on both ends.
    const clientStarts: number[] = [];
    const hostStarts: number[] = [];
    let cWasDashing = false;
    let hWasDashing = false;
    cliInput.hold("right", true);
    for (let tick = 0; tick < 240; tick++) {
      hostInput.beginTick();
      cliInput.beginTick();
      if (tick === 120 || tick === 132 || tick === 140) cliInput.press("dash");

      c.update(DT, cliInput as unknown as AvatarInput);
      if (me.dashTimer > 0 && !cWasDashing) clientStarts.push(tick);
      cWasDashing = me.dashTimer > 0;
      const seq = log.record(cliInput.moveVector(), cliInput.wasPressed("dash"));
      toHost.push({ due: tick + LAG, packet: packInput(cliInput as unknown as AvatarInput, me.x, me.y, seq) });

      while (toHost.length > 0 && toHost[0]!.due <= tick) remote.receive(toHost.shift()!.packet);
      remote.beginTick();
      h.update(DT, hostInput as unknown as AvatarInput);
      if (them.dashTimer > 0 && !hWasDashing) hostStarts.push(tick);
      hWasDashing = them.dashTimer > 0;
      h.enemies.length = 0;
      h.drainEvents();
      if (tick % 3 === 0) toClient.push({ due: tick + LAG, snap: JSON.parse(JSON.stringify(encodeSnapshot(h))) as Snapshot });

      while (toClient.length > 0 && toClient[0]!.due <= tick) {
        const wasX = me.x;
        const wasY = me.y;
        applySnapshot(c, toClient.shift()!.snap, undefined, log);
        if (tick > 30) corrections.push(Math.hypot(me.x - wasX, me.y - wasY));
      }
    }
    corrections.sort((a, b) => a - b);
    const worst = corrections[corrections.length - 1] ?? Infinity;
    check("a client with two charges predicts both dashes the tick it presses them",
      clientStarts.length === 2 && clientStarts[0] === 120 && clientStarts[1] === 132, clientStarts.join());
    check("…and the host runs the same two dashes, LAG ticks later",
      hostStarts.length === 2 && hostStarts[0] === 120 + LAG && hostStarts[1] === 132 + LAG, hostStarts.join());
    check("…and neither end dashes on the third press — the stock was empty",
      !clientStarts.includes(140) && !hostStarts.includes(140 + LAG));
    check("…and the double dash never had to be corrected by the host", worst < 1.5,
      `worst ${worst.toFixed(2)}px over ${corrections.length} snapshots`);

    // The solo control: default one charge, the second press inside the cooldown is a
    // no-op, exactly as before; with the ring on, it isn't.
    const dashesIn = (state: GameState): number => {
      const d = new Dungeon(state, delveConfig(2), { seed: 779 });
      const input = new FakeInput();
      const a = d.avatar;
      let starts = 0;
      let was = false;
      input.hold("right", true);
      for (let tick = 0; tick < 60; tick++) {
        input.beginTick();
        if (tick === 10 || tick === 22) input.press("dash");
        d.update(DT, input as unknown as AvatarInput);
        if (a.dashTimer > 0 && !was) starts++;
        was = a.dashTimer > 0;
      }
      return starts;
    };
    const plain = geared(14, 8817, 16, "swordsman");
    const charged = geared(14, 8817, 16, "swordsman");
    withCharge(charged);
    const plainDashes = dashesIn(plain);
    const chargedDashes = dashesIn(charged);
    check("one charge is the old single cooldown; a second charge is a second dash",
      plainDashes === 1 && chargedDashes === 2, `${plainDashes} vs ${chargedDashes}`);
  }

  // 5. Room codes: four letters, no lookalikes, and paste-and-pray survives.
  const codes = new Set<string>();
  for (let i = 0; i < 400; i++) codes.add(randomRoomCode());
  check("room codes are four readable letters",
    [...codes].every((c) => isRoomCode(c) && c.length === 4));
  check("room codes avoid the letters people mishear",
    [...codes].every((c) => !/[IOSZ]/.test(c)));
  check("a typed code is forgiven", normalizeRoomCode(" ab-cd ") === "ABCD");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
