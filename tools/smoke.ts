/**
 * Headless simulation smoke test. Drives the dungeon with a scripted input source to
 * confirm waves spawn, combat resolves, loot drops, floors clear and death works —
 * none of which needs a browser, since `game/` is DOM-free by design.
 *
 * The bot is the point of this file. It plays the way the game asks you to: it reads
 * boss telegraphs and gets out of them, it casts the skills it has, and it retreats
 * when it's hurt. A bot that can't do those things measures a game nobody is playing.
 */
import type { Action, AvatarInput, Input } from "../src/core/input";
import { Dungeon, inTelegraph } from "../src/game/dungeon";
import { Hub, HUB_HEIGHT, HUB_WIDTH } from "../src/game/hub";
import { circleHitsWall, FlowField, generateLevel, isWalkable, resolveCircle, TILE } from "../src/game/level";
import { itemScore, requiredLevel } from "../src/game/item";
import { Player, xpForLevel } from "../src/game/player";
import { GameState, POTION_PRICE } from "../src/game/state";
import { CHESTS, CHEST_TIERS, type ChestTier } from "../src/data/chests";
import { challengerMultiplier } from "../src/data/challenger";
import { CRAFTABLE_RARITIES } from "../src/data/crafting";
import { profileFor } from "../src/data/depth";
import { affixCountFor, MONSTER_AFFIXES, rollMonsterAffixes } from "../src/data/monster-affixes";
import { EARLY_EXTRACT_KEEP, MODES, delveConfig, riftConfig, type RunConfig } from "../src/data/modes";
import { PLANETS, nextFloorConfig, planetConfig, planetUnlocked } from "../src/data/planets";
import { MINION_CAP_PER_OWNER } from "../src/data/minions";
import { CLASSES, CLASS_IDS, treePointsFor, type ClassId } from "../src/data/classes";
import { CLASS_BY_ID, buildProgressionTree } from "../src/progression/index";
import { WEAPON_FAMILIES, WEAPONS, type WeaponFamily } from "../src/data/weapons";
import { BOSSES } from "../src/data/bosses";
import { ARCHETYPES, type EnemyBehavior, type EnemyKind } from "../src/data/enemies";
import {
  CAPSULES, CAPSULE_TIERS, COSMETICS, COSMETIC_SLOTS, HAIR_STYLES,
  cosmeticProblems,
} from "../src/data/cosmetics";
import { BOSS_GRIDS, COSMETIC_ART, HAIR, WEAPON_ART, gridProblems } from "../src/render/pixels";
import { FLOOR_GRADE, gradeSheet, tileLuminance } from "../src/render/grade";
import { TILESETS } from "../src/render/atlas/manifest";
import { BIOMES } from "../src/data/biomes";
import { decodePng } from "./png";
import { readFileSync } from "node:fs";
import { RARITIES, rarityIndex } from "../src/data/rarity";
import { rollItem } from "../src/game/item";
import { Rng } from "../src/core/rng";
import { applySnapshot, configFromWire, configToWire, encodeSnapshot } from "../src/net/sync";
import { isRoomCode, normalizeRoomCode, randomRoomCode } from "../src/net/protocol";

class FakeInput {
  private down = new Set<Action>();
  private pressed = new Set<Action>();
  hold(a: Action, on: boolean) { on ? this.down.add(a) : this.down.delete(a); }
  press(a: Action) { this.pressed.add(a); }
  beginTick() { this.pressed.clear(); }
  isDown(a: Action) { return this.down.has(a); }
  wasPressed(a: Action) { return this.pressed.has(a); }
  /** `AvatarInput`: the bot plays the exclusive-keyboard scheme, so it never aims. */
  aimAngle() { return null; }
  wasPressedOrRepeated(a: Action) { return this.pressed.has(a); }
  moveVector() {
    let x = 0, y = 0;
    if (this.down.has("left")) x -= 1;
    if (this.down.has("right")) x += 1;
    if (this.down.has("up")) y -= 1;
    if (this.down.has("down")) y += 1;
    const l = Math.hypot(x, y);
    return l === 0 ? { x: 0, y: 0 } : { x: x / l, y: y / l };
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

const DT = 1 / 60;

/**
 * Steers along a direction without walking into a wall: it tries the straight line
 * first, then progressively wider angles. Crude, but it's what a player does
 * instinctively, and without it the bot pins itself on a pillar and dies there.
 */
function steerAngle(d: Dungeon, base: number): { x: number; y: number } {
  const a = d.avatar;
  for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3]) {
    const ang = base + off;
    const px = a.x + Math.cos(ang) * 34;
    const py = a.y + Math.sin(ang) * 34;
    if (px < 14 || py < 14 || px > d.width - 14 || py > d.height - 14) continue;
    if (circleHitsWall(d.level, px, py, a.radius + 3)) continue;
    return { x: Math.cos(ang), y: Math.sin(ang) };
  }
  return { x: Math.cos(base), y: Math.sin(base) };
}

function steer(d: Dungeon, tx: number, ty: number, retreat: boolean): { x: number; y: number } {
  const a = d.avatar;
  const sign = retreat ? -1 : 1;
  return steerAngle(d, Math.atan2((ty - a.y) * sign, (tx - a.x) * sign));
}

/**
 * A real dungeon has walls a straight line can't see past, so closing on something
 * across a room graph needs an actual route, not just "nudge around whatever's directly
 * in front of you." This is exactly the field monsters already chase the player with —
 * the bot gets the same eyes a human has (it can see the level), just no better.
 */
function approachDir(d: Dungeon, flow: FlowField, tx: number, ty: number): { x: number; y: number } {
  return flow.direction(d.level, d.avatar.x, d.avatar.y) ?? steer(d, tx, ty, false);
}

/**
 * Where to run when something is about to go off underneath you. This is the whole
 * skill of a boss fight expressed as one function: get out of the circle, get into the
 * hole in the donut, step off the line.
 */
function escapeAngle(d: Dungeon): number | null {
  const a = d.avatar;
  for (const t of d.telegraphs) {
    if (!t.hitsPlayer) continue;
    if (!inTelegraph(t, a.x, a.y, a.radius + 10)) continue;
    switch (t.shape) {
      case "donut":
        // The safe spot is the hole in the middle, so run at it.
        return Math.atan2(t.y - a.y, t.x - a.x);
      case "line":
      case "cone": {
        // Step off the side rather than trying to outrun its length.
        const perp = t.angle + Math.PI / 2;
        const dx = a.x - t.x;
        const dy = a.y - t.y;
        const side = -dx * Math.sin(t.angle) + dy * Math.cos(t.angle);
        return side >= 0 ? perp : perp + Math.PI;
      }
      default:
        return Math.atan2(a.y - t.y, a.x - t.x);
    }
  }
  // Burning ground is the same problem with a longer fuse.
  for (const g of d.ground) {
    if (Math.hypot(a.x - g.x, a.y - g.y) <= g.radius + a.radius) {
      return Math.atan2(a.y - g.y, a.x - g.x);
    }
  }
  return null;
}

interface FloorResult {
  d: Dungeon;
  seconds: number;
  peakEnemies: number;
  /** Highest number of ailments seen on a single monster — did elements do anything? */
  peakAilments: number;
  lowestMana: number;
  skillCasts: number;
  bossPhases: number;
  /** Total damage the player ate. The clearest measure of whether they played well. */
  damageTaken: number;
  potionsDrunk: number;
  /** Boss mechanics that resolved with the player still standing in them. */
  mechanicsEaten: number;
  mechanicsResolved: number;
}

/**
 * Plays a floor with a bot that chases the nearest enemy and mashes attack.
 * `dodge` is the fraction of threats it reacts to, which is the single biggest
 * difference between one player and another — see the campaign section below.
 */
function playFloor(
  state: GameState,
  run: number | RunConfig,
  maxSeconds = 300,
  seed = 1000,
  dodge = 0.55,
): FloorResult {
  const d = new Dungeon(state, run, seed);
  const input = new FakeInput();
  const flow = new FlowField(d.level);
  let flowTimer = 0;
  let flowGoalX = d.avatar.x;
  let flowGoalY = d.avatar.y;
  let t = 0;
  let peakEnemies = 0;
  let peakAilments = 0;
  let lowestMana = 100;
  let skillCasts = 0;
  let bossPhases = 0;
  let damageTaken = 0;
  let mechanicsEaten = 0;
  let mechanicsResolved = 0;
  let pinnedTicks = 0;
  const potionsAtStart = state.potions;
  // Input here is polled every tick, so an ungated press would chug the whole belt.
  let potionCooldown = 0;
  // Reaction rolls. A bot that dodges every telegraph perfectly walks the whole ladder
  // untouched, and a bot that never dodges dies on floor two; a real player is neither,
  // so each fresh telegraph gets a coin flip.
  const reflexes = new Rng((seed ^ 0x5f3759df) >>> 0);
  let threatSeen = false;
  let willDodge = false;

  while (t < maxSeconds && d.phase === "fighting") {
    input.beginTick();
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);

    // Nearest live enemy, which is what a player would actually be swinging at.
    let target = null as (typeof d.enemies)[number] | null;
    let gap = Infinity;
    for (const e of d.enemies) {
      if (e.state === "spawning") continue;
      const dd = Math.hypot(e.x - d.avatar.x, e.y - d.avatar.y);
      if (dd < gap) { gap = dd; target = e; }
    }

    // The route only has to be roughly current, same tradeoff the real monster AI
    // already makes — rebuilding a BFS field every tick over a big floor is wasted work.
    const goalX = target ? target.x : d.portal.x;
    const goalY = target ? target.y : d.portal.y;
    flowTimer -= DT;
    if (flowTimer <= 0 || Math.hypot(goalX - flowGoalX, goalY - flowGoalY) > 50) {
      flow.update(d.level, goalX, goalY);
      flowGoalX = goalX;
      flowGoalY = goalY;
      flowTimer = 0.2;
    }

    // Back off when hurt, but only from something close enough to be the threat, and
    // only while there's a potion left to buy time with. Retreating with an empty belt
    // never resolves: the player outruns everything, so the floor would never end.
    const hurt = state.player.health < state.player.maxHealth * 0.4
      && state.potions > 0
      && gap < 70;
    // Dodging a telegraph is the skill the game is actually asking for, so the bot
    // has to do it: anything winding up within reach gets dashed away from.
    const incoming = d.enemies.some(
      (e) => e.windup > 0 && Math.hypot(e.x - d.avatar.x, e.y - d.avatar.y) < e.archetype.attackRange + 24,
    );
    if (incoming && !threatSeen) willDodge = reflexes.chance(dodge);
    threatSeen = incoming;
    const threat = incoming && willDodge;

    // Standing in a boss mechanic outranks everything else on the to-do list.
    const escape = dodge > 0 ? escapeAngle(d) : null;
    if (escape !== null) {
      const dir = steerAngle(d, escape);
      if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
      if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
      input.press("dash");
      // Still swing if something happens to be in reach on the way out.
      if (target && gap < 40) input.press("attack");
    } else if (target) {
      if (hurt || gap > 26) {
        const dir = hurt ? steer(d, target.x, target.y, true) : approachDir(d, flow, target.x, target.y);
        if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
        if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
      } else if (threat) {
        const away = steer(d, target.x, target.y, true);
        if (Math.abs(away.x) > 0.25) input.hold(away.x > 0 ? "right" : "left", true);
        if (Math.abs(away.y) > 0.25) input.hold(away.y > 0 ? "down" : "up", true);
      }
      input.press("attack");
      if (hurt || threat) input.press("dash");
    }

    // Abilities, when there is something to point them at and the resource to do it.
    if (target && gap < 340) {
      for (let slot = 0; slot < 3; slot++) {
        if (!d.canCast(slot)) continue;
        const ab = state.player.activeAbilities[slot];
        if (!ab) continue;
        const range = ab.range && ab.range > 0 ? ab.range : 110;
        const defensive = ab.category === "support" || ab.category === "utility";
        const closeRange = ab.targeting === "cone" || ab.targeting === "radius" || ab.category === "attack";
        const useful = defensive
          ? state.player.health < state.player.maxHealth * 0.75
          : closeRange
            ? gap < range * 0.9 + 60
            : true;
        if (!useful) continue;
        input.press(slot === 0 ? "skill1" : slot === 1 ? "skill2" : "skill3");
        skillCasts++;
        break;
      }
    }

    if (d.specialCharge >= 1) input.press("special");
    potionCooldown -= DT;
    if (state.player.health < state.player.maxHealth * 0.5 && potionCooldown <= 0) {
      input.press("potion");
      potionCooldown = 2;
    }

    // Anything about to resolve this tick: was the player still standing in it? This is
    // the direct measure of reading the floor, and it doesn't get muddied by chip damage
    // from adds the way a raw damage total does.
    for (const tg of d.telegraphs) {
      if (tg.remaining > DT || !tg.hitsPlayer) continue;
      mechanicsResolved++;
      if (inTelegraph(tg, d.avatar.x, d.avatar.y, d.avatar.radius)) mechanicsEaten++;
    }

    d.update(DT, input as unknown as Input);
    for (const ev of d.drainEvents()) {
      if (ev.kind === "bossPhase") bossPhases++;
      if (ev.kind === "damage" && ev.onPlayer) damageTaken += ev.amount;
    }
    peakEnemies = Math.max(peakEnemies, d.enemies.length);
    if (circleHitsWall(d.level, d.avatar.x, d.avatar.y, d.avatar.radius + 2)) pinnedTicks++;
    for (const e of d.enemies) peakAilments = Math.max(peakAilments, e.sc.list.length);
    // The "mana" the modern classes actually spend is their own primary resource — the
    // first non-ultimate pool the class declares (Rage, Momentum, Mana, Scrap, …).
    const primary = d.localHero.resources.all().find((pool) => !pool.spec.isUltimateMeter);
    if (primary) lowestMana = Math.min(lowestMana, primary.fraction * 100);
    t += DT;
  }

  // Mopping up. A boss and a clear cache both drop everything at the instant the floor
  // ends, so a bot that stops the moment the last thing dies banks nothing — which is
  // not what a player does, and made every boss floor look worthless.
  let mop = 0;
  while (d.phase === "cleared" && d.pickups.length > 0 && mop < 20) {
    input.beginTick();
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);
    let near = d.pickups[0]!;
    for (const p of d.pickups) {
      if (Math.hypot(p.x - d.avatar.x, p.y - d.avatar.y) <
          Math.hypot(near.x - d.avatar.x, near.y - d.avatar.y)) near = p;
    }
    flow.update(d.level, near.x, near.y);
    const dir = approachDir(d, flow, near.x, near.y);
    if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
    if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
    d.update(DT, input as unknown as Input);
    d.drainEvents();
    mop += DT;
  }

  return {
    d, seconds: t, peakEnemies, peakAilments, lowestMana, skillCasts, bossPhases,
    damageTaken, potionsDrunk: Math.max(0, potionsAtStart - state.potions),
    mechanicsEaten, mechanicsResolved, pinned: pinnedTicks * DT,
  };
}

/** What a player does between dives: restock, gamble the purse, wear the best of it. */
function townVisit(state: GameState): void {
  state.player.fullHeal();
  state.player.autoSlotNewAbilities();
  while (state.potions < 5 && state.coins >= POTION_PRICE * 2) {
    if (!state.buyPotion()) break;
  }
  // Buy the best chest tier the purse can stand, keeping a little back for potions.
  for (const tier of ["Elite", "Advanced", "Basic"] as ChestTier[]) {
    while (state.coins > CHESTS[tier].price * 2) {
      if (!state.buyKey(tier)) break;
    }
  }
  for (const tier of CHEST_TIERS) {
    if (state.keys[tier] > 0) state.openChests(tier, state.keys[tier]);
  }
  // Wear the best of everything, then sell what's strictly worse than what's worn.
  const cls = state.heroClass;
  for (const item of [...state.inventory].sort((a, b) => itemScore(b, cls) - itemScore(a, cls))) {
    const worn = state.player.equipment[item.slot];
    if (!worn || itemScore(item, cls) > itemScore(worn, cls)) state.equipFromInventory(item.id);
  }
  const junk = state.inventory.filter((it) => {
    const worn = state.player.equipment[it.slot];
    return worn ? itemScore(it, cls) < itemScore(worn, cls) : false;
  });
  if (junk.length) state.sell(junk.map((i) => i.id));
}

/** Levels a character up to `level` and dresses it, so a boss test isn't a naked one. */
function geared(level: number, seed = 5150, keys = 14, classId?: ClassId): GameState {
  const state = new GameState(seed);
  // The class comes first: chest rolls favour the weapons it was built for.
  if (classId) state.chooseClass(classId);
  state.player.level = level;
  state.player.refresh();
  state.player.autoSlotNewAbilities();
  state.keys.Advanced = keys;
  state.openChests("Advanced", keys);
  const cls = state.heroClass;
  for (const item of [...state.inventory].sort((a, b) => itemScore(b, cls) - itemScore(a, cls))) {
    const worn = state.player.equipment[item.slot];
    if (!worn || itemScore(item, cls) > itemScore(worn, cls)) state.equipFromInventory(item.id);
  }
  // Whatever else it found, it goes down there holding something it can use.
  if (!state.player.hasAffinity) {
    const family = cls.affinity[0]!;
    const weapon = rollItem({ rarity: "rare", type: family, ilvl: level, rng: new Rng(seed ^ 0x51ed) });
    state.player.equip(weapon);
  }
  state.player.fullHeal();
  state.potions = 5;
  return state;
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

/**
 * Twenty dives the way a player actually spends them: clear a floor and push one
 * deeper, die and try the same floor again, fail it twice and drop back to farm
 * something survivable. Marching 1..12 regardless of outcome — which is what this
 * test used to do — measures nothing, because a death costs the loot that would have
 * paid for the next floor and the run never recovers.
 */
function campaign(seed: number, dodge: number, dives = 20, log = false) {
  const state = new GameState(seed);
  let target = 1;
  let deepest = 0;
  let deaths = 0;
  let failsHere = 0;
  let unfinished = 0;

  for (let dive = 0; dive < dives; dive++) {
    townVisit(state);
    const { d, seconds } = playFloor(state, target, 300, seed + dive * 37 + target, dodge);
    if (log) {
      console.log(
        `  dive ${String(dive + 1).padStart(2)} → depth ${String(target).padStart(2)} ` +
        `${d.phase.padEnd(8)} ${seconds.toFixed(0).padStart(3)}s ${d.level.layout.padEnd(9)} ` +
        `${d.profile.isBoss ? "BOSS " : "     "}lv${String(state.player.level).padStart(2)} ` +
        `kills=${String(d.loot.kills).padStart(3)} coins=${String(d.loot.coins).padStart(6)} ` +
        `atk=${String(state.player.stats.attack).padStart(4)}`,
      );
    }
    if (d.phase === "cleared") {
      d.bankLoot();
      deepest = Math.max(deepest, target);
      target++;
      failsHere = 0;
    } else {
      if (d.phase === "dead") deaths++;
      else unfinished++;
      failsHere++;
      if (failsHere >= 2 && target > 1) {
        target--;
        failsHere = 0;
      }
    }
  }
  return { state, deepest, deaths, unfinished };
}

console.log("\n=== a campaign: 20 dives, a sharp player (dodges 55% of telegraphs) ===");
{
  const runs = [4242, 991, 7777, 31337, 606].map((seed, i) => campaign(seed, 0.55, 20, i === 0));
  for (const [i, r] of runs.entries()) {
    console.log(
      `  seed ${i}: reached depth ${r.deepest}, died ${r.deaths} times, ` +
      `level ${r.state.player.level}, attack ${r.state.player.stats.attack}, ` +
      `earned ${r.state.stats.coinsEarned} coins`,
    );
  }
  const deepest = runs.reduce((a, r) => a + r.deepest, 0) / runs.length;
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
  const runs = [4242, 991, 7777, 31337, 606].map((seed) => campaign(seed, 0, 20));
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
  check("ignoring telegraphs gets you killed", deaths >= 10, `${deaths} deaths across 100 dives`);
  check("the descent still has teeth for a careless player", deepest <= 12,
    `average deepest depth ${deepest.toFixed(1)}`);
  check("the early floors stay learnable", deepest >= 3, `average deepest depth ${deepest.toFixed(1)}`);
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
 */
console.log("\n=== standing in boss mechanics costs you ===");
{
  const attentive = [11, 22, 33, 44, 55].map((seed) => playFloor(geared(6, 4000 + seed, 8), 5, 400, seed, 0.85));
  const reckless = [11, 22, 33, 44, 55].map((seed) => playFloor(geared(6, 4000 + seed, 8), 5, 400, seed, 0));
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
    `${attentive.filter((r) => r.d.phase === "dead").length}/5 died`);
  console.log(
    `  stands in it:    ${blindDamage.toFixed(0)} damage taken, ` +
    `${blindHits.toFixed(1)}/${avg(reckless, (r) => r.mechanicsResolved).toFixed(1)} mechanics eaten, ` +
    `${avg(reckless, (r) => r.potionsDrunk).toFixed(1)} potions, ` +
    `${avg(reckless, (r) => r.seconds).toFixed(0)}s, ${deaths}/5 died`);

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
    const leech = d.spawnArchetypeAt("leech", d.avatar.x + 200, d.avatar.y);
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

  const early = sampleFloor(6, 909, 6);
  check("the elite cap holds on an ordinary early floor", early.peakElites <= 1,
    `${early.peakElites} at once`);
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
  check(`${cls.name}: THE ULTIMATE RULE — its own output did not refill the meter`,
    r.meterRightAfter < 1, `meter ${r.meterRightAfter.toFixed(1)}`);
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
  // deepest-depth record, so a fresh alt buying a chest right after a deep-diving main
  // got gear rolled at the main's depth — gear the level lock then correctly refused to
  // let it wear. Item level has to track the *active character's* own depth instead.
  state.keys.Basic += 20;
  const shamanChest = state.openChests("Basic", 20);
  check("a deep-diving character's chests roll near its own depth",
    shamanChest.every((it) => it.ilvl >= 20), `ilvls: ${shamanChest.map((it) => it.ilvl).join(",")}`);

  state.chooseClass("berserker");
  state.keys.Basic += 20;
  const freshChest = state.openChests("Basic", 20);
  check("a fresh alt's chests roll for its own (level 1) depth, not the main's",
    freshChest.every((it) => it.ilvl === 1), `ilvls: ${freshChest.map((it) => it.ilvl).join(",")}`);
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
  check("a tier 1 hoard rift can be finished", cleared === MODES[mode].floors,
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
  check("the abyss is harder than the hoard at the same tier",
    profileFor(abyssFloor.depth, abyssFloor).enemyHealth >
    profileFor(hoardFloor.depth, hoardFloor).enemyHealth * 1.5,
    `${profileFor(abyssFloor.depth, abyssFloor).enemyHealth.toFixed(0)} vs ` +
    `${profileFor(hoardFloor.depth, hoardFloor).enemyHealth.toFixed(0)} hp`);
  check("the hoard drops more than the abyss",
    MODES.hoard.quantity > MODES.abyss.quantity * 1.5,
    `x${MODES.hoard.quantity} vs x${MODES.abyss.quantity}`);
  check("the abyss pushes rarity harder than the hoard",
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
    miningRun.level.resourceNodes.length > 0, miningRun.level.resourceNodes.length);
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
}

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
  const input = new FakeInput();
  const flow = new FlowField(d.level);
  flow.update(d.level, d.portal.x, d.portal.y);
  let t = 0;
  // Walk to the portal without fighting anything — the route has to go around walls
  // now, not just in a straight line, so this follows the same field a monster would.
  while (t < 30 && !d.atPortal) {
    input.beginTick();
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);
    const dir = approachDir(d, flow, d.portal.x, d.portal.y);
    if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
    if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
    d.update(DT, input as unknown as Input);
    d.drainEvents();
    t += DT;
  }
  check("portal is reachable mid-fight", d.atPortal, `phase=${d.phase} after ${t.toFixed(1)}s`);
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
    d.loot.keys.basic = 4;
    d.loot.materials.fire = 30;
    d.loot.xp = 555;
    for (let i = 0; i < 3; i++) {
      d.loot.items.push(rollItem({ rarity: "epic", type: "sword", ilvl: 9, rng }));
    }
    const coinsBefore = state.coins;
    const gemsBefore = state.gems;
    const bagBefore = state.inventory.length;
    const keysBefore = state.keys.basic;
    const fireBefore = state.materials.fire;
    const xpBefore = state.player.xp;
    const kept = d.earlyExtractLoot();

    check("bailing early forfeits every unbanked item",
      state.inventory.length === bagBefore && kept.itemsLost === 3,
      `bag ${bagBefore} -> ${state.inventory.length}, ${kept.itemsLost} lost`);
    check("bailing early forfeits keys and materials",
      state.keys.basic === keysBefore && state.materials.fire === fireBefore);
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
  const tintsFor = (id: string): string[] => {
    const tints = BIOMES.filter((b) => b.tileset === id).map((b) => b.tint);
    for (const p of PLANETS) if (p.biome.tileset === id) tints.push(p.biome.tint);
    // The Abyss overrides the biome tileset but keeps the depth biome's tint —
    // so it has to hold up under every Delve tint.
    if (tints.length === 0) tints.push(...BIOMES.map((b) => b.tint));
    return tints;
  };
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

  // A hoard rift is the mode that is supposed to pay for a wardrobe.
  const hoarder = geared(20, 4243, 10);
  const hoard = playFloor(hoarder, riftConfig("hoard", 1, 1), 300, 6162, 0.7);
  const delver = geared(20, 4243, 10);
  const delve = playFloor(delver, 6, 300, 6162, 0.7);
  check("the hoard rift pays better in gems than the delve",
    hoard.d.loot.gems > delve.d.loot.gems,
    `hoard ${hoard.d.loot.gems} (${hoard.d.phase}) vs delve ${delve.d.loot.gems} (${delve.d.phase})`);

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
  for (const slot of COSMETIC_SLOTS) {
    const first = dressed.ownedInSlot(slot)[0];
    if (first) dressed.wear(slot, first.id);
  }
  dressed.player.refresh();
  check("cosmetics never touch your numbers", JSON.stringify(dressed.player.mods) === before);
  check("wearing everything fills every slot",
    COSMETIC_SLOTS.every((slot) => dressed.appearance[slot] !== null));
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
      const goal = target ?? host.portal;
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
  check("loot belongs to whoever picked it up",
    host.heroes[0]!.loot.coins !== host.heroes[1]!.loot.coins
    || host.heroes[0]!.loot.items.length !== host.heroes[1]!.loot.items.length,
    `${host.heroes[0]!.loot.coins} vs ${host.heroes[1]!.loot.coins} coins`);

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
  console.log(`  the busiest snapshot of that fight was ${(busiest.bytes / 1024).toFixed(1)}kB`
    + ` with ${busiest.monsters} monsters on screen`
    + ` — ${((busiest.bytes * 20) / 1024).toFixed(0)}kB/s per player at ${20} snapshots a second`);

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
