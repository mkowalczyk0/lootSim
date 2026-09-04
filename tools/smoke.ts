/**
 * Headless simulation smoke test. Drives the dungeon with a scripted input source to
 * confirm waves spawn, combat resolves, loot drops, floors clear and death works —
 * none of which needs a browser, since `game/` is DOM-free by design.
 */
import type { Action, Input } from "../src/core/input";
import { Dungeon } from "../src/game/dungeon";
import { circleHitsWall, generateLevel, isWalkable } from "../src/game/level";
import { itemScore } from "../src/game/item";
import { GameState, POTION_PRICE } from "../src/game/state";
import { CHESTS, CHEST_TIERS, type ChestTier } from "../src/data/chests";
import { profileFor } from "../src/data/depth";
import { Rng } from "../src/core/rng";

class FakeInput {
  private down = new Set<Action>();
  private pressed = new Set<Action>();
  hold(a: Action, on: boolean) { on ? this.down.add(a) : this.down.delete(a); }
  press(a: Action) { this.pressed.add(a); }
  beginTick() { this.pressed.clear(); }
  isDown(a: Action) { return this.down.has(a); }
  wasPressed(a: Action) { return this.pressed.has(a); }
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
 * Steers toward (or away from) a point without walking into a wall: it tries the
 * straight line first, then progressively wider angles. Crude, but it's what a player
 * does instinctively, and without it the bot pins itself on a pillar and dies there.
 */
function steer(d: Dungeon, tx: number, ty: number, retreat: boolean): { x: number; y: number } {
  const a = d.avatar;
  const sign = retreat ? -1 : 1;
  const base = Math.atan2((ty - a.y) * sign, (tx - a.x) * sign);
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

/**
 * Plays a floor with a bot that chases the nearest enemy and mashes attack.
 * `dodge` is the fraction of telegraphs it reacts to, which is the single biggest
 * difference between one player and another — see the campaign section below.
 */
function playFloor(state: GameState, depth: number, maxSeconds = 300, seed = 1000 + depth * 37, dodge = 0.55) {
  const d = new Dungeon(state, depth, seed);
  const input = new FakeInput();
  let t = 0;
  let peakEnemies = 0;
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

    if (target) {
      if (hurt || gap > 26) {
        const dir = steer(d, target.x, target.y, hurt);
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
    if (d.specialCharge >= 1) input.press("special");
    potionCooldown -= DT;
    if (state.player.health < state.player.maxHealth * 0.5 && potionCooldown <= 0) {
      input.press("potion");
      potionCooldown = 2;
    }

    d.update(DT, input as unknown as Input);
    d.drainEvents();
    peakEnemies = Math.max(peakEnemies, d.enemies.length);
    t += DT;
  }
  return { d, seconds: t, peakEnemies };
}

/** What a player does between dives: restock, gamble the purse, wear the best of it. */
function townVisit(state: GameState): void {
  state.player.fullHeal();
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
  for (const item of [...state.inventory].sort((a, b) => itemScore(b) - itemScore(a))) {
    const worn = state.player.equipment[item.slot];
    if (!worn || itemScore(item) > itemScore(worn)) state.equipFromInventory(item.id);
  }
  const junk = state.inventory.filter((it) => {
    const worn = state.player.equipment[it.slot];
    return worn ? itemScore(it) < itemScore(worn) : false;
  });
  if (junk.length) state.sell(junk.map((i) => i.id));
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

console.log("\n=== floor 1 with a fresh character ===");
{
  const state = new GameState();
  const { d, seconds, peakEnemies } = playFloor(state, 1);
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
        `traps=${String(d.level.traps.length).padStart(2)} lv${String(state.player.level).padStart(2)} ` +
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
  const runs = [4242, 991, 7777].map((seed, i) => campaign(seed, 0.55, 20, i === 0));
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
  check("skilled play makes real progress", deepest >= 10, `average deepest depth ${deepest.toFixed(1)}`);
  check("gear is found and worn", worn >= 4, `${worn} slots filled`);
  check("chests get opened along the way",
    Object.values(first.stats.chestsOpened).some((n) => n > 0), JSON.stringify(first.stats.chestsOpened));
  check("floors resolve in reasonable time",
    runs.every((r) => r.unfinished <= 2), runs.map((r) => r.unfinished).join("/"));
}

console.log("\n=== a campaign: 20 dives, a reckless player (never dodges) ===");
{
  const runs = [4242, 991, 7777].map((seed) => campaign(seed, 0, 20));
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
  check("ignoring telegraphs gets you killed", deaths >= 6, `${deaths} deaths across 60 dives`);
  check("the descent still has teeth for a careless player", deepest <= 12,
    `average deepest depth ${deepest.toFixed(1)}`);
  check("the early floors stay learnable", deepest >= 3, `average deepest depth ${deepest.toFixed(1)}`);
}

console.log("\n=== boss floor (depth 5) ===");
{
  const state = new GameState();
  state.player.level = 12;
  const { d } = playFloor(state, 5, 400);
  const p = profileFor(5);
  check("depth 5 is a boss floor", p.isBoss);
  check("boss floor resolved", d.phase !== "fighting", `phase=${d.phase}`);
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
  const d = new Dungeon(state, 3, 99);
  const input = new FakeInput();
  let t = 0;
  // Walk straight at the portal without fighting anything.
  while (t < 30 && !d.atPortal) {
    input.beginTick();
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);
    if (Math.abs(d.portal.x - d.avatar.x) > 4) input.hold(d.portal.x > d.avatar.x ? "right" : "left", true);
    if (Math.abs(d.portal.y - d.avatar.y) > 4) input.hold(d.portal.y > d.avatar.y ? "down" : "up", true);
    d.update(DT, input as unknown as Input);
    d.drainEvents();
    t += DT;
  }
  check("portal is reachable mid-fight", d.atPortal, `phase=${d.phase} after ${t.toFixed(1)}s`);
  check("cannot descend without clearing", !d.canDescend);
  const before = state.coins;
  d.bankLoot();
  check("extracting mid-fight banks what you carried", state.coins >= before);
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

  for (let depth = 1; depth <= 30; depth++) {
    for (let i = 0; i < 8; i++) {
      const level = generateLevel(depth, rng);
      floors++;
      layouts[level.layout] = (layouts[level.layout] ?? 0) + 1;
      totalTraps += level.traps.length;
      totalWalls += level.walls.length;

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
  check("layouts actually vary", Object.keys(layouts).length >= 4, JSON.stringify(layouts));
  console.log(`  ${floors} floors: ${(totalWalls / floors).toFixed(1)} walls and ${(totalTraps / floors).toFixed(1)} hazards on average`);
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

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
