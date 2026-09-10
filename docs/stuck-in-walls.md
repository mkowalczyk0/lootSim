# Bodies and items ending up inside rock — three causes, one real, two ruled out

Status: **measured, fixed, and closed.** Docket §22, owner-reported from play: "enemies
spawning in walls," knockback pushing something into one, and dead bodies leaving loot
stuck where they fell. Do not confuse this with `docs/campaign-pathing-bias.md` — that
one is a monster losing its route while resting legally against a wall; this one is a
body or item actually inside the rock volume.

## The finding, stated once

**Of the three named causes, one was real and it wasn't the one the brief predicted.**
The reported "spawning in walls" symptom traced almost entirely to `separateEnemies()`
and `separateMinions()` — the pairwise crowd-push that spreads a cluster apart — shoving
a body back into a wall *after* that same tick's own wall-collision correction had
already cleared it, with nothing left in the tick to catch the shove. Fixed at the
source: **43 genuine penetration episodes across ~325k ticks of real play, down to 0
across ~323k ticks with the fix, and a direct, isolated reproduction of the mechanism
now reads clean.** Knockback and the pickup-drop path were both tested hard and neither
reproduced — see below. The owner's requested 2-3 second unstick net is built and wired
in as a backstop, and a direct test confirms it fires correctly and moves rather than
despawns — but real play now activates it zero times, which is the point: it's insurance
for whatever these fixes didn't anticipate, not the thing actually doing the work.

## Part 1: measuring before touching anything

`tools/stuck-check.ts` (new, standalone, not wired into `npm test` — same convention as
`tools/reachability.ts`) plays real floors with the scripted bot (`tools/bot.ts`'s
`playFloor`, its existing `onTick` seam) and checks, every tick, whether any enemy or
pickup's actual body — not its centre, its centre plus radius — genuinely *penetrates*
the rock volume.

That distinction cost a false start worth recording: the first pass used
`circleHitsWall`'s `d <= r`, which is also true the instant `resolveCircle` finishes
pushing something out (the resolved position sits exactly tangent, `d == r`) — completely
normal, not a bug. That version returned ~4,900 "pickup" hits in one run, which was
resting-against-a-wall noise, not embedding. `circleEmbeddedInWall(level, x, y, r,
margin=2)` (now shipped in `src/game/level.ts`, not just the tool) requires a couple of
real units of overlap before it counts, which is the check both the diagnosis and the
shipped fix now share.

**Real play, before any fix**, 6 depths x 20 seeds (plain Delve) plus 8 boss depths x 16
seeds, ~325k ticks total:

| | enemy episodes | boss episodes | pickup episodes | boss spawns sampled | embedded at spawn |
| --- | --- | --- | --- | --- | --- |
| Plain floors | 39 | 0 | 0 | 60 | 0 (0%) |
| Boss floors | 4 | 0 | 0 | 128 | 0 (0%) |

Two things fell out of this that the brief's own hypotheses didn't survive:

- **Every episode's `atSpawn` flag was false.** None of these were a monster arriving
  already embedded — every one developed *after* the enemy had already existed for at
  least one clean tick. That rules out "spawn placement doesn't know the body's radius"
  as the dominant mechanism, which is what sent the investigation looking at what else
  moves a body mid-tick.
- **Boss spawns were never embedded, 0 of 188 sampled**, despite `spawnBoss` being the
  one enemy-creation path that skipped `resolveCircle` entirely (every other one —
  `placeMonsterAt`, `spawnAdds`, the summoner/summon/split affixes, a blinking monster,
  hero and minion spawn rings — already resolved the circle it was about to use). Boss
  arenas are generated large and open by design, and that turned out to be enough in
  practice. Closed anyway (see Part 3) because the inconsistency itself was real even
  though the failure never was.

## Part 2: finding the real mechanism

The episode log's detail (archetype, radius, enemy state) pointed at crowded melee
archetypes (`brute`, `caster`, `swarmer`) in the `active` state — consistent with a
burst of monsters bunched up while chasing the player, which is exactly when
`separateEnemies()` (called once per tick, after every enemy has already been
individually wall-resolved) pushes bodies apart. That function has never once consulted
a wall:

```
private separateEnemies(): void {
  ...pairwise push-apart...
}
```

**Reproduced directly, isolated from real play**: one monster placed tangent to a wall
(clean, `resolveCircle`-resolved), a second overlapping it by 40% from the open side,
one `d.update()` tick. Before the fix: the pinned monster ends the tick genuinely
embedded. After: it doesn't. `separateMinions()` — the identical pattern for summoned
pets, called the same way after its own per-minion wall-resolve — carries the same bug
and got the same fix.

**The fix**: both functions now re-run `resolveCircle` on every body they touched,
immediately after the pairwise push, using the same collision test the rest of the tick
already trusts. Cheap — O(n) more `resolveCircle` calls against an O(n²) pass that was
already there.

**A second, much rarer contributor, found only after the first fix dropped the count
from 43 to 9**: several of the seven other spawn-scatter call sites in `dungeon.ts` (a
summoner's own spawn, the `summon` affix, the `split` affix, a blinking monster's
destination, the hero and minion spawn rings) throw an offset point from a known-good
anchor — the summoner's own position, the burst's validated centre — through
`resolveCircle`, but never verified the result actually cleared. `resolveCircle` only
pushes a circle out of whatever it *directly* overlaps; a scatter point that overshot
into a multi-tile wall mass could come back still embedded. `resolveOrFallback` (new,
module-level in `dungeon.ts`) wraps this: verify with `circleEmbeddedInWall`, and if it's
still bad, retry once from the anchor that was already proven open. Applied at every
scatter site, plus a defensive `resolveCircle` added to `spawnBoss`/`spawnDummy` for
consistency (Part 3) even though neither ever measured a real failure.

**Combined result, same wider seed set, real play**: 0 enemy, 0 boss, 0 pickup episodes
across both plain and boss floors (~323k ticks). The one earlier residual (5 spawn-state
`swarmer` embeds concentrated on a single depth, likely the exact multi-tile-overshoot
shape `resolveOrFallback` now guards against) is gone in the same run that added it.

## Part 3: what wasn't the bug

**Knockback into walls (the second named cause) did not reproduce, even far past real
force.** `resolveCircle` already runs every tick, after knockback is applied, on every
enemy's *final* position for the tick — this was true before any of the above fixes.
Stress-tested directly: a monster pinned against a real wall face, hit with `knock`
values from 200 up to 9,600 (the largest real values in the data files, a relic
trigger's `force: 140`, are nowhere near this range) — **worst penetration measured
across all six trials: 0.00 units, no tunnelling through to the far side, ever.** The
brief was right to ask this be checked before building a net over it; it just isn't
where the bug was.

**Items stuck in walls (the third named cause) also did not reproduce.** `updatePickups`
already ran `resolveCircle` on every dropped item every tick before any of this started
— zero pickup episodes in every real-play run, before or after the enemy-side fixes. A
corpse dying at a genuinely embedded position (the scenario the brief specifically
flagged as surviving any monster-side fix) still can't leave a stuck item, because the
very first tick the resulting pickup exists, it gets wall-resolved exactly like
everything else already does.

## Part 4: the net, and what it's actually catching now

Built as asked — the owner wants it regardless of the diagnosis, and it's a reasonable
backstop for whatever these fixes didn't anticipate. `Enemy.embedTimer` /
`Minion.embedTimer` / `Pickup.embedTimer` (new fields, deliberately separate from the
existing `stuckTimer`, which rises on *any* wall-slide — chasing you around a corner
presses against a wall constantly and is not a bug; `embedTimer` only rises while
`circleEmbeddedInWall` is true). `UNSTICK_SECONDS = 2.5` (the middle of the owner's
"two to three"). At threshold, `Dungeon.tickEmbedTimer` clips the body to
`nearestOpenPoint` (new in `level.ts` — an outward ring search over the same walkable
grid `randomOpenPoint` reads, sized to the body's own radius, deterministic rather than
a random teleport) and increments `Dungeon.unstickCount`.

**Both hard constraints hold by construction**: the net only ever writes `x`/`y` — it
never touches health or removes anything from `this.enemies`, so a wave-director monster
(`Enemy.fromWave`) can never be despawned by it, only relocated. It lives entirely inside
`updateEnemies`/`updateMinions`/`updatePickups`, which already run host-side only in
co-op and already sync position through the snapshot — no new wire field, no client-side
decision.

**Tested directly, not just trusted**: driving a monster through real `d.update()` calls
was tried first and couldn't keep anything embedded long enough to test the timer at
all — `resolveCircle`'s "dead centre" branch turns out to eject a body past the nearest
face in a single step regardless of how deep it started, which is itself more evidence
of how robust the underlying fix already is. `tickEmbedTimer` was called directly against
a synthetic body pinned inside a real wall instead: `unstickCount` went 0 → 1, the fire
landed at tick 150 (exactly 2.50s, the configured threshold), and the final position was
confirmed clear.

**What it's catching in real play, after the fixes above: nothing.** Both full census
runs (~323k ticks combined) read `unstickCount`-equivalent zero. That is the intended
outcome, not a disappointing one — a net that fires constantly would mean something is
still broken and the net is hiding it, which is exactly the failure mode the brief asked
to stay visible against. **If `Dungeon.unstickCount` reads consistently nonzero on a
real run in the future, that is a regression signal, not the net working as designed —
read this document again before assuming the net is "doing its job."**

## What changed, in one place

- `src/game/level.ts`: `circleEmbeddedInWall` (real penetration, not tangent contact),
  `nearestOpenPoint` (the unstick net's destination).
- `src/game/dungeon.ts`: `separateEnemies`/`separateMinions` re-resolve every body they
  touch; `resolveOrFallback` wraps every spawn-scatter site with a verify-and-retry;
  `spawnBoss`/`spawnDummy` gained the `resolveCircle` call every other spawn path already
  had; `tickEmbedTimer` + `UNSTICK_SECONDS` + `Dungeon.unstickCount` are the net.
- `src/game/entities.ts`: `embedTimer` on `Enemy`, `Minion`, `Pickup`.
- `src/net/sync.ts`, `tools/smoke.ts`: the client-side decode and the one existing
  co-op test both construct these types by hand and needed the new field defaulted —
  inert on the client, since the net only ever runs host-side.

## Reproducing this

`npx tsx tools/stuck-check.ts` — real-play census (parts A/B), the `separateEnemies`
reproduction (part C0), the knockback stress test (part C), and a direct test of the
unstick net itself (part D). Full `npm run smoke` was run rather than a targeted check,
per the standing rule that any `level.ts`/spawn-sequencing change perturbs the shared rng
for every floor: **the sharp-vs-reckless campaign margin moved to 12.1 vs 9.9 (a clean
pass, comfortably inside the range this check has read before) and every wall-mask
assertion (`painted rock is the collision volume`) still reads 0 disagreeing cells** —
noted rather than chased, exactly because a handful of monsters landing in slightly
different spots than before is the expected, intended effect of the fix, not a defect in
it.
