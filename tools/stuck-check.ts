/**
 * Investigation, not a test: docket §22 — "enemies spawning in walls" and "knocked back
 * into walls" (PM lootsim-21, 2026-09-10). Three named causes, measured rather than
 * assumed, on unmodified master, before any fix exists.
 *
 * The instrument: real floors, played by the scripted bot, with an `onTick` hook
 * (`tools/bot.ts`'s existing seam) that checks, every tick, whether any enemy or pickup's
 * actual body genuinely *penetrates* the rock volume.
 *
 * That last word matters and cost a false start: `circleHitsWall`'s `d <= r` includes a
 * body merely *resting against* a wall — which `resolveCircle` produces on purpose every
 * time it pushes something out (the result sits exactly tangent, `d == r`), and that is
 * completely normal, not the bug. The first run of this script used `circleHitsWall`
 * directly and returned ~4900 "pickup" hits in one pass — almost all of it items sitting
 * against a wall the way any dropped item near a wall legitimately does. `penetrates`
 * below requires a real few units of overlap (`d < r - MARGIN`) so contact isn't
 * mistaken for embedding.
 *
 * Nothing here is asserted; it's read with `npx tsx tools/stuck-check.ts`.
 */

import type { Input } from "../src/core/input";
import { Dungeon } from "../src/game/dungeon";
import { circleEmbeddedInWall } from "../src/game/level";
import { DT, FakeInput, geared, playFloor } from "./bot";

// `circleEmbeddedInWall` (src/game/level.ts) is the shipped fix's own verification
// check, reused here rather than a second copy — this script measures the exact
// condition the fix now guards against, not an approximation of it.
const penetrates = circleEmbeddedInWall;

interface Episode {
  kind: "enemy" | "boss" | "pickup"; state: string; depth: number; tickAge: number;
  archetype?: string; radius?: number; atSpawn?: boolean; penetration?: number;
}

function census(depths: number[], seeds: number[], dodge: number): {
  episodes: Episode[]; ticks: number; bossSpawns: number; bossSpawnEmbeds: number;
} {
  const episodes: Episode[] = [];
  let ticks = 0;
  let bossSpawns = 0;
  let bossSpawnEmbeds = 0;

  for (const depth of depths) {
    for (const seed of seeds) {
      const state = geared(Math.max(1, Math.round(depth * 0.9)), seed);
      const overNow = new Set<string>(); // ids currently penetrating — episodes, not ticks
      const seenBossIds = new Set<number>();
      const seenEnemyIds = new Set<number>();
      const onTick = (d: Dungeon, t: number) => {
        ticks++;
        for (const e of d.enemies) {
          if (e.health <= 0) continue;
          const id = `e${e.id}`;
          const atSpawn = !seenEnemyIds.has(e.id);
          seenEnemyIds.add(e.id);
          const hit = penetrates(d.level, e.x, e.y, e.radius);
          if (e.boss && !seenBossIds.has(e.id)) {
            // The first tick this boss id exists at all — as close as an outside
            // observer can get to "what `spawnBoss` actually handed the simulation",
            // before this tick's own `updateEnemies` correction pass has run on it.
            seenBossIds.add(e.id);
            bossSpawns++;
            if (hit) bossSpawnEmbeds++;
          }
          if (hit && !overNow.has(id)) {
            overNow.add(id);
            episodes.push({
              kind: e.boss ? "boss" : "enemy", state: e.state, depth, tickAge: t,
              archetype: e.archetype.kind, radius: e.radius, atSpawn,
            });
          } else if (!hit) {
            overNow.delete(id);
          }
        }
        for (let i = 0; i < d.pickups.length; i++) {
          const p = d.pickups[i]!;
          const id = `p${i}`;
          const hit = penetrates(d.level, p.x, p.y, p.radius);
          if (hit && !overNow.has(id)) {
            overNow.add(id);
            episodes.push({ kind: "pickup", state: "-", depth, tickAge: t });
          } else if (!hit) {
            overNow.delete(id);
          }
        }
      };
      playFloor(state, depth, 90, seed, dodge, onTick);
    }
  }
  return { episodes, ticks, bossSpawns, bossSpawnEmbeds };
}

function report(label: string, depths: number[], seeds: number[]) {
  const r = census(depths, seeds, 0.55);
  console.log(`\n=== ${label} ===`);
  console.log(`${depths.length} depths x ${seeds.length} seeds, ${r.ticks} ticks total`);
  console.log(`boss spawns seen: ${r.bossSpawns}, embedded in a wall at spawn: ${r.bossSpawnEmbeds}` +
    (r.bossSpawns > 0 ? ` (${((r.bossSpawnEmbeds / r.bossSpawns) * 100).toFixed(0)}%)` : ""));
  const byKind = { enemy: 0, boss: 0, pickup: 0 };
  for (const ep of r.episodes) byKind[ep.kind]++;
  console.log(`penetration episodes — enemy: ${byKind.enemy}, boss: ${byKind.boss}, pickup: ${byKind.pickup}`);
  const byState: Record<string, number> = {};
  for (const ep of r.episodes) if (ep.kind !== "pickup") byState[ep.state] = (byState[ep.state] ?? 0) + 1;
  if (Object.keys(byState).length) console.log("non-pickup episodes by enemy state:", byState);
  if (r.episodes.length > 0) console.log("first 10 episodes:", r.episodes.slice(0, 10));
  return r;
}

const SEEDS_A = Array.from({ length: 20 }, (_, i) => 1001 + i);
const SEEDS_B = Array.from({ length: 16 }, (_, i) => 2001 + i);
report("A. real play, plain Delve floors", [3, 8, 14, 20, 25, 30], SEEDS_A);
report("B. boss floors specifically, wider sample", [5, 10, 15, 20, 25, 30, 35, 40], SEEDS_B);

// =========================================================================
console.log("\n=== C0. separateEnemies() reproduction — a crowd shoved into a wall ===");
{
  // Every real-play episode above landed on an enemy that was already active, not freshly
  // spawned (`atSpawn: false`) — pointing at something that moves a body *after*
  // `updateEnemies`'s own per-enemy `resolveCircle` pass, not at spawn placement. The one
  // thing that does: `separateEnemies()`, called once for the whole list after every
  // enemy has already been individually wall-resolved for the tick, with no wall
  // awareness of its own. Reproduced directly: one monster pinned against a wall, a
  // second overlapping it from the open side, tick once.
  const state = geared(20, 7001);
  const d = new Dungeon(state, 12, 7001);
  d.sealWaves();
  const level = d.level;
  let wall = null as { x: number; y: number; w: number; h: number } | null;
  for (const w of level.walls) {
    if (w.h > 60 && w.w < 40) { wall = w; break; }
  }
  if (!wall) {
    console.log("no suitable wall face found on this seed/depth — skipping reproduction");
  } else {
    const pinned = d.spawnArchetypeAt("brute", wall.x + wall.w + 15, wall.y + wall.h / 2);
    const pusher = d.spawnArchetypeAt("brute", wall.x + wall.w + 15 + pinned.radius, wall.y + wall.h / 2);
    pinned.x = wall.x + wall.w + pinned.radius; // tangent to the wall, resolveCircle-clean
    pusher.x = pinned.x + pinned.radius * 1.4; // overlapping `pinned` by 40%
    pusher.y = pinned.y;
    const input = new FakeInput();
    d.update(DT, input as unknown as Input);
    const stuck = penetrates(level, pinned.x, pinned.y, pinned.radius);
    console.log(`pinned monster after one tick: (${pinned.x.toFixed(1)}, ${pinned.y.toFixed(1)}), ` +
      `penetrating the wall: ${stuck}`);
    pinned.health = 0; pusher.health = 0;
  }
}

// =========================================================================
console.log("\n=== C. knockback stress test — a controlled hit into a wall ===");
{
  // Find a real wall face on a real floor, place a monster hard against it from the open
  // side (using the `spawnArchetypeAt` test seam — headless-only, bypasses the wave
  // director), then knock it directly into the wall with an escalating series of `knock`
  // values and see whether `resolveCircle`'s per-tick correction (dungeon.ts's
  // `updateEnemies`, after `e.x += e.knockX * dt`) actually holds under real force
  // values the game uses, not just ordinary ones.
  const state = geared(30, 9001);
  const d = new Dungeon(state, 10, 9001);
  d.sealWaves();
  const level = d.level;
  let wall = null as { x: number; y: number; w: number; h: number } | null;
  for (const w of level.walls) {
    if (w.h > 40 && w.w < 40) { wall = w; break; } // a vertical wall face, not a big block
  }
  if (!wall) {
    console.log("no suitable wall face found on this seed/depth — skipping stress test");
  } else {
    const px = wall.x + wall.w + 20;
    const py = wall.y + wall.h / 2;
    for (const knock of [200, 600, 1200, 2400, 4800, 9600]) {
      const e = d.spawnArchetypeAt("brute", px, py);
      e.x = px; e.y = py; e.knockX = 0; e.knockY = 0;
      e.knockX = -knock; // due west, straight into the wall
      e.knockY = 0;
      let worstPenetration = 0;
      let tunneled = false;
      const startSide = e.x > wall.x + wall.w;
      const input = new FakeInput();
      for (let i = 0; i < 30; i++) {
        d.update(DT, input as unknown as Input);
        for (const w of level.walls) {
          const nx = Math.max(w.x, Math.min(e.x, w.x + w.w));
          const ny = Math.max(w.y, Math.min(e.y, w.y + w.h));
          const dd = Math.hypot(e.x - nx, e.y - ny);
          worstPenetration = Math.max(worstPenetration, e.radius - dd);
        }
        const nowSide = e.x > wall.x + wall.w;
        if (nowSide !== startSide) tunneled = true;
      }
      console.log(
        `knock=${knock}: final pos (${e.x.toFixed(1)}, ${e.y.toFixed(1)}), ` +
        `worst penetration this trial: ${worstPenetration.toFixed(2)}u, crossed to the far side: ${tunneled}`,
      );
      e.health = 0; // clean up before the next trial
    }
  }
}

// =========================================================================
console.log("\n=== D. the unstick net itself, tested directly ===");
{
  // Every attempt to plant a monster somewhere `resolveCircle` couldn't escape in a
  // single tick failed — its "dead centre" branch turns out to eject a body past the
  // *nearest* face in one step regardless of how deep it started, which is itself a
  // reassuring finding about how robust the underlying fix already is: driving a real
  // monster through `d.update()` never keeps it embedded long enough for the net's own
  // multi-second timer to accumulate at all. So this calls `tickEmbedTimer` — the exact
  // unstick logic, unexported because it's private — directly against a synthetic body
  // pinned inside a real wall, the only way left to exercise accumulation, the
  // threshold, and the teleport in one place without a scenario that fights it.
  const state = geared(20, 5501);
  const d = new Dungeon(state, 12, 5501);
  const level = d.level;
  const wall = level.walls.find((w) => w.h > 60 && w.w < 40);
  const tick = (d as unknown as {
    tickEmbedTimer: (b: { x: number; y: number; radius: number; embedTimer: number }, dt: number) => void;
  }).tickEmbedTimer.bind(d);
  if (!wall) {
    console.log("no suitable wall face found on this seed/depth — skipping net test");
  } else {
    const body = { x: wall.x + wall.w / 2, y: wall.y + wall.h / 2, radius: 14, embedTimer: 0 };
    const before = d.unstickCount;
    let firedAtTick = -1;
    for (let i = 0; i < Math.ceil(4 * 60); i++) {
      tick(body, 1 / 60);
      if (d.unstickCount > before && firedAtTick < 0) firedAtTick = i;
    }
    console.log(
      `pinned dead-centre in a wall → unstickCount ${before} -> ${d.unstickCount}, ` +
      `fired at tick ${firedAtTick} (~${(firedAtTick / 60).toFixed(2)}s), ` +
      `final pos not embedded: ${!circleEmbeddedInWall(level, body.x, body.y, body.radius)}`,
    );
  }
}

