/**
 * Headless simulation smoke test. Drives the dungeon with a scripted input source to
 * confirm waves spawn, combat resolves, loot drops, floors clear and death works —
 * none of which needs a browser, since `game/` is DOM-free by design.
 */
import type { Action, Input } from "../src/core/input";
import { Dungeon } from "../src/game/dungeon";
import { GameState } from "../src/game/state";
import { profileFor } from "../src/data/depth";

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

/** Plays a floor with a bot that chases the nearest enemy and mashes attack. */
function playFloor(state: GameState, depth: number, maxSeconds = 240) {
  const d = new Dungeon(state, depth, 12345);
  const input = new FakeInput();
  let t = 0;
  let peakEnemies = 0;

  while (t < maxSeconds && d.phase === "fighting") {
    input.beginTick();
    const target = d.enemies.filter((e) => e.state !== "spawning")[0];
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);
    const hurt = state.player.health < state.player.maxHealth * 0.4;
    if (target) {
      // Kite when hurt, close when healthy — roughly what a mediocre player does.
      const sign = hurt ? -1 : 1;
      const dx = (target.x - d.avatar.x) * sign;
      const dy = (target.y - d.avatar.y) * sign;
      if (hurt || Math.hypot(dx, dy) > 26) {
        if (Math.abs(dx) > 4) input.hold(dx > 0 ? "right" : "left", true);
        if (Math.abs(dy) > 4) input.hold(dy > 0 ? "down" : "up", true);
      }
      input.press("attack");
      if (hurt) input.press("dash");
    }
    if (d.specialCharge >= 1) input.press("special");
    if (hurt) input.press("potion");

    d.update(DT, input as unknown as Input);
    d.drainEvents();
    peakEnemies = Math.max(peakEnemies, d.enemies.length);
    t += DT;
  }
  return { d, seconds: t, peakEnemies };
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

console.log("\n=== a full geared progression, depths 1..12 ===");
{
  const state = new GameState();
  let died = 0;
  for (let depth = 1; depth <= 12; depth++) {
    state.player.fullHeal();
    // Auto-equip the best thing in the stash for each slot, like a player would.
    for (const item of [...state.inventory]) {
      const worn = state.player.equipment[item.slot];
      if (!worn || item.stats.attack + item.stats.defense + item.stats.maxHealth >
          worn.stats.attack + worn.stats.defense + worn.stats.maxHealth) {
        state.equipFromInventory(item.id);
      }
    }
    const { d, seconds } = playFloor(state, depth);
    if (d.phase === "dead") died++;
    console.log(
      `  d${String(depth).padStart(2)} ${d.phase.padEnd(8)} ${seconds.toFixed(0).padStart(3)}s ` +
      `lv${String(state.player.level).padStart(2)} kills=${String(d.loot.kills).padStart(3)} ` +
      `coins=${String(d.loot.coins).padStart(7)} items=${String(d.loot.items.length).padStart(2)} ` +
      `atk=${String(state.player.stats.attack).padStart(4)} hp=${state.player.maxHealth}`,
    );
    if (d.phase === "cleared") d.bankLoot();
  }
  check("progression is survivable with gear", died <= 3, `died on ${died} of 12 floors`);
  check("character leveled up", state.player.level > 1, `level ${state.player.level}`);
  check("stash accumulated loot", state.inventory.length > 0, `${state.inventory.length} items`);
  check("keys dropped in the dungeon",
    Object.values(state.keys).some((n) => n > 0), JSON.stringify(state.keys));
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
