// Multiplayer stuttering — docs/docket.md item 1, a real player report from a real
// session. Not gated, not in npm test — an open measurement, same exclusion as
// reachability.ts and raid-arena-contrast.ts.
//
// Suspect 1: snapshot size and cadence. "A bit over 40 kB/s per player" (CLAUDE.md) was
// measured once, in tools/smoke.ts's co-op section, at delveConfig(8, 0, 2) — depth 8,
// two players, whatever monster count a 120-second fight happens to produce. Deep floors
// spawn far more bodies (`enemiesPerWave`/`crowd` climb with depth). This walks a real
// depth range with the exact same harness shape smoke.ts already uses, so the number is
// re-measured rather than assumed.
import { Dungeon } from "../src/game/dungeon";
import { delveConfig } from "../src/data/modes";
import { encodeSnapshot } from "../src/net/sync";
import { geared, FakeInput } from "./bot";
import { FlowField } from "../src/game/level";
import type { AvatarInput } from "../src/core/input";

const DT = 1 / 60;

function measure(depth: number, players: number, seconds: number) {
  const heroStates = Array.from({ length: players }, (_, i) =>
    geared(Math.max(1, depth + 4), 9100 + i, 16, i % 2 === 0 ? "swordsman" : "magician"));
  const setups = heroStates.map((s, i) => ({
    netId: i === 0 ? "" : `p${i + 1}`, name: `P${i + 1}`, player: s.player,
    appearance: s.appearance, potions: 5, local: i === 0,
  }));
  const config = delveConfig(depth, 0, players);
  const host = new Dungeon(heroStates[0]!, config, { seed: 5150 + depth, role: "host", heroes: setups });
  const inputs = heroStates.map(() => new FakeInput());
  host.heroes.forEach((hero, i) => { if (i > 0) hero.input = inputs[i] as unknown as AvatarInput; });
  const routes = host.heroes.map(() => new FlowField(host.level));
  let routeTimer = 0;

  let t = 0;
  let busiest = { monsters: 0, bytes: 0, t: 0 };
  let sumBytes = 0, sampleCount = 0;
  const everyNTicks = 3; // matches smoke's own co-op relay cadence (tick % 3 === 0)
  let tick = 0;
  // Wall-clock cost of the host's own per-tick work — suspect 3. Split into simulate
  // (host.update, paid every tick regardless of party size) and encode (paid only on
  // relay ticks, one JSON.stringify per connected client) so a stutter that scales with
  // monster count either way still shows which half it's in.
  let simMs = 0, simSamples = 0, encodeMs = 0, encodeSamples = 0;
  let worstSimMs = 0, worstEncodeMs = 0;

  while (t < seconds && host.phase === "fighting") {
    routeTimer -= DT;
    const repath = routeTimer <= 0;
    if (repath) routeTimer = 0.25;
    host.heroes.forEach((hero, i) => {
      const input = inputs[i]!;
      input.beginTick();
      const target = host.enemies.filter((e) => e.state !== "spawning")
        .sort((a, b) => Math.hypot(a.x - hero.avatar.x, a.y - hero.avatar.y)
          - Math.hypot(b.x - hero.avatar.x, b.y - hero.avatar.y))[0];
      const goal = target ?? host.completionPortal ?? host.level.portal;
      if (repath) routes[i]!.update(host.level, goal.x, goal.y);
      const step = routes[i]!.direction(host.level, hero.avatar.x, hero.avatar.y);
      const angle = step ? Math.atan2(step.y, step.x) : Math.atan2(goal.y - hero.avatar.y, goal.x - hero.avatar.x);
      input.hold("right", Math.cos(angle) > 0.3);
      input.hold("left", Math.cos(angle) < -0.3);
      input.hold("down", Math.sin(angle) > 0.3);
      input.hold("up", Math.sin(angle) < -0.3);
      input.press("attack");
      if (hero.player.health < hero.player.maxHealth * 0.4) input.press("potion");
    });
    const t0 = performance.now();
    host.update(DT, inputs[0]! as unknown as AvatarInput);
    const t1 = performance.now();
    simMs += t1 - t0; simSamples++;
    worstSimMs = Math.max(worstSimMs, t1 - t0);
    host.drainEvents();
    if (tick % everyNTicks === 0) {
      const e0 = performance.now();
      const bytes = JSON.stringify(encodeSnapshot(host)).length;
      const e1 = performance.now();
      encodeMs += e1 - e0; encodeSamples++;
      worstEncodeMs = Math.max(worstEncodeMs, e1 - e0);
      sumBytes += bytes; sampleCount++;
      if (host.enemies.length > busiest.monsters || bytes > busiest.bytes) {
        busiest = { monsters: host.enemies.length, bytes, t };
      }
    }
    tick++;
    t += DT;
  }

  const avgBytes = sampleCount ? sumBytes / sampleCount : 0;
  const snapshotsPerSec = 60 / everyNTicks;
  return {
    depth, players, seconds: t, phase: host.phase,
    busiestKB: busiest.bytes / 1024, busiestMonsters: busiest.monsters, busiestAt: busiest.t,
    avgKB: avgBytes / 1024,
    avgKBps: (avgBytes * snapshotsPerSec) / 1024,
    peakKBps: (busiest.bytes * snapshotsPerSec) / 1024,
    avgSimMs: simSamples ? simMs / simSamples : 0,
    worstSimMs,
    avgEncodeMs: encodeSamples ? encodeMs / encodeSamples : 0,
    worstEncodeMs,
  };
}

console.log("=== MP stuttering, suspect 1 (bandwidth) and suspect 3 (host CPU), by depth ===\n");
console.log("depth | players | phase     | busiest KB (mobs@t)  | avg kB/s/player | peak kB/s/player | avg sim ms | worst sim ms | avg encode ms | worst encode ms");
for (const players of [2, 4]) {
  for (const depth of [5, 8, 12, 15, 18, 22, 26]) {
    const r = measure(depth, players, 90);
    console.log(
      `${String(depth).padStart(5)} | ${String(players).padStart(7)} | ${r.phase.padEnd(9)} | `
      + `${r.busiestKB.toFixed(2).padStart(5)} (${r.busiestMonsters}@${r.busiestAt.toFixed(0)}s)`.padEnd(20) + " | "
      + `${r.avgKBps.toFixed(0).padStart(6)} | ${r.peakKBps.toFixed(0).padStart(7)} | `
      + `${r.avgSimMs.toFixed(3).padStart(9)} | ${r.worstSimMs.toFixed(3).padStart(11)} | `
      + `${r.avgEncodeMs.toFixed(3).padStart(12)} | ${r.worstEncodeMs.toFixed(3).padStart(14)}`);
  }
}
