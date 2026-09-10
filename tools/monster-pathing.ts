/**
 * `npm run pathing` — regression coverage for the stuck-monster bug found investigating
 * docket item 6 ("one last monster that got lost because it got stuck behind a wall or
 * something"). Part of `npm test`.
 *
 * ## The bug
 *
 * `FlowField.direction(level, x, y)` looked up the caller's own position's grid cell and
 * returned null immediately if that cell had never been explored by the BFS — which is
 * exactly what happens for a BLOCKED cell, since blocked cells are never queued. A
 * monster's collision circle can rest flush against a wall (that's what `resolveCircle`
 * is for), and when it does, its floating-point centre can land a few units inside the
 * wall's own 16-unit grid cell while the monster's actual body is still mostly standing
 * in the open room next to it. `direction()` read that one cell, found nothing, and gave
 * up — never even looking at the wide-open neighbour one cell over.
 *
 * `update()` already had the fix for the identical problem on the GOAL side
 * (`nearestOpen`, snapping a goal that lands on a blocked cell to the nearest open one).
 * `direction()` never applied the same rescue to the SOURCE side. Fixed by doing exactly
 * that.
 *
 * ## How this was found
 *
 * Not by symptom-chasing ("make the effect louder") — by instrumenting `tools/bot.ts`'s
 * `playFloor` with an optional per-tick hook (`onTick`, additive, every existing call site
 * unaffected) and watching real monster positions across many generated floors. Before the
 * fix: 105 floors across depths 5-19, 15 seeds each, produced 14 "monster motionless for
 * 3+ seconds while it should be closing distance" episodes, 11 of which had
 * `FlowField.direction()` returning null from the monster's own exact position at that
 * moment. After the fix, run over the identical seeds: 0 of the (now 23, since some of
 * those episodes resolve into ordinary navigation friction rather than the null-route bug
 * and take a little longer, which is expected and not this bug) stall episodes have a null
 * route. The bug is gone; ordinary pathing friction — a monster briefly slowed rounding a
 * corner, still correctly routed — is not the same thing and isn't chased here.
 *
 * ## Section 1: the mechanism, deterministically
 *
 * A synthetic level — one open room, one wall — with a query point placed exactly where
 * the bug reproduced: a few units past the room's edge, inside the wall's own cell.
 * `direction()` must not return null from there once a route to the room clearly exists.
 *
 * ## Section 2: does it still happen on real generated floors
 *
 * A modest, FIXED (not randomly varying) sweep of seeds across the depths the original
 * scan found it on. Not exhaustive — `tools/smoke.ts` already owns full floor generation
 * coverage — just enough real floors, replayed by the shared bot, to keep this a live
 * regression guard rather than only a unit test of the isolated mechanism.
 */
import { FlowField, type Level } from "../src/game/level";
import { playFloor, geared } from "./bot";
import { delveConfig } from "../src/data/modes";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string): void {
  console.log(`\n=== ${name} ===`);
}

// --- section 1: the mechanism -------------------------------------------------------

section("FlowField.direction() from a cell flush against a wall");

{
  // A 30x30 grid: an open room in the top-left 6x6, a wall filling the rest. The goal
  // (player) sits in the room's far corner; the query point sits one cell into the wall,
  // immediately outside the room — exactly the shape the real bug reproduced in. 30x30
  // (not 10x10) so the "genuinely deep in solid wall" negative control below is actually
  // outside `nearestOpen`'s 12-cell search radius, rather than the whole grid trivially
  // being within rescue range of a tiny test level.
  const cols = 30, rows = 30;
  const blocked = new Uint8Array(cols * rows).fill(1);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) blocked[y * cols + x] = 0;
  const GRID = 16;
  const level = { cols, rows, blocked } as unknown as Level;

  const field = new FlowField(level);
  field.update(level, 1 * GRID + 8, 1 * GRID + 8); // goal: cell (1,1), well inside the room

  // Query point: cell (6,3) — one cell outside the room, but only just: 2 units past the
  // boundary, same shallow-penetration shape the real monster showed (5.9 of 16 units).
  const queryX = 6 * GRID + 2, queryY = 3 * GRID + 8;
  check("cell (6,3) is genuinely blocked, not a test-setup mistake",
    blocked[3 * cols + 6] === 1);
  check("cell (5,3), one step into the room, was reached by the BFS",
    blocked[3 * cols + 5] === 0);

  const routed = field.direction(level, queryX, queryY);
  check("direction() returns a real route from a point just inside the wall, not null",
    routed !== null, routed ? `(${routed.x.toFixed(2)}, ${routed.y.toFixed(2)})` : "got null");
  if (routed) {
    check("...and it points back toward the room (negative x)", routed.x < 0, `x=${routed.x.toFixed(2)}`);
  }

  // A point that's actually deep in a real wall (not a shallow graze) still correctly
  // returns null once nothing open is within nearestOpen's search radius — this isn't a
  // blanket "always find something", it's specifically the flush-against-a-wall rescue.
  const deepX = 29 * GRID + 8, deepY = 29 * GRID + 8;
  const deepRoute = field.direction(level, deepX, deepY);
  check("a point genuinely deep in solid wall still has no route (this isn't a blanket rescue)",
    deepRoute === null, deepRoute ? `got (${deepRoute.x.toFixed(2)}, ${deepRoute.y.toFixed(2)})` : "null, correctly");
}

// --- section 2: real generated floors ------------------------------------------------

section("a live floor sweep never sees the null-route stall");

{
  const DEPTHS = [5, 11, 13, 16, 18, 19];
  const SEEDS = [0, 1, 2, 3];
  const MAX_SECONDS = 200;

  interface Track { lastX: number; lastY: number; stillSince: number; flagged: boolean }
  let nullRouteStalls = 0;
  let totalStalls = 0;
  let floorsPlayed = 0;

  for (const depth of DEPTHS) {
    for (const i of SEEDS) {
      const seed = 30_000 + depth * 100 + i;
      const state = geared(depth, seed, 8);
      const tracks = new Map<number, Track>();
      let sampleTimer = 0;
      playFloor(state, delveConfig(depth), MAX_SECONDS, seed, 0.7, (d, t) => {
        sampleTimer += 1 / 60;
        if (sampleTimer < 0.5) return;
        sampleTimer = 0;
        const hero = d.localHero;
        for (const e of d.enemies) {
          if (e.boss || e.state === "spawning") continue;
          const dist = Math.hypot(e.x - hero.avatar.x, e.y - hero.avatar.y);
          const shouldBeClosing = dist > e.archetype.attackRange + 20 && e.windup <= 0
            && e.chargeVx === 0 && e.chargeVy === 0;
          let tr = tracks.get(e.id);
          if (!tr) { tr = { lastX: e.x, lastY: e.y, stillSince: t, flagged: false }; tracks.set(e.id, tr); }
          const moved = Math.hypot(e.x - tr.lastX, e.y - tr.lastY);
          if (shouldBeClosing && moved < 10) {
            if (t - tr.stillSince > 3 && !tr.flagged) {
              tr.flagged = true;
              totalStalls++;
              const routed = hero.flow?.direction(d.level, e.x, e.y);
              if (routed === null || routed === undefined) nullRouteStalls++;
            }
          } else {
            tr.stillSince = t;
            tr.flagged = false;
          }
          tr.lastX = e.x; tr.lastY = e.y;
        }
      });
      floorsPlayed++;
    }
  }

  console.log(`  ${floorsPlayed} floors, ${totalStalls} stall episode(s) (ordinary navigation friction — not asserted against), `
    + `${nullRouteStalls} with a null route (this is the bug, and it's what's asserted)`);
  check("no monster reads a null route from a >3s stall on a real generated floor",
    nullRouteStalls === 0, `${nullRouteStalls} of ${totalStalls}`);
}

console.log(`\n${failures === 0 ? "monster pathing: all checks passed" : `monster pathing: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
