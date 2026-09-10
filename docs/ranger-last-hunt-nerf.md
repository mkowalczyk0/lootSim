# Ranger's "The Last Hunt" — nerf (docket item 8)

> "nerf the rangers ultimate ability 'the last hunt' - its a tad overpowerd and wipes the
> entire map and bosses way too quickly."

Two symptoms, two separate causes, both in `RANGER_THE_LAST_HUNT` (`src/progression/ranger.ts`).

## Cause 1: "wipes the entire map"

The ability's `to: "enemies"` steps (the quarry mark and the delayed volley) had no
`shape.radius`. `selectActorIds`'s `"enemies"` case (`src/combat/runtime.ts`) is field-wide
whenever an ability declares no radius — that's a deliberate, existing behaviour other
abilities rely on (Magician's Astral Collapse is explicitly "a bombardment across the whole
floor" at `shape.radius: 400`), but it isn't what this ability's own tooltip promises
("every elite in sight").

**Fix:** added `shape: { radius: 350 }` to the ability. 350 covers a full room and its
doorways at the largest authored room size (`ROOM_BASE + ROOM_GROWTH_CAP` in
`game/level.ts`, ≈640 wide) without reaching into the room next door — a real bound, not
the floor.

**Considered and rejected:** actually restricting the mark/volley to elites only (matching
the tooltip literally, and the peer brief's own lead). Elites are capped to 0 on most
ordinary floors below depth 4 and to exactly the boss on every boss floor
(`eliteCapForFloor`), so a strict elites-only filter would make the ultimate deal zero
damage on the majority of early- and mid-game trash floors — a much larger behavior change
than "a tad OP," and arguably a gutting rather than a nerf. The radius bound fixes the
reported symptom (a floor-wide wipe) without touching how the ability behaves in an
ordinary fight near the caster.

## Cause 2: "bosses way too quickly"

`executeMissingHealth: 0.4` on the volley's damage packet. This term adds
`(maxHealth - health) * 0.4` on top of the direct hit — a boss is the only actor in the game
with enough health for that to be a huge flat number, and it recharges fast (the ultimate
meter gains on crit and on inflicting ailments), so repeated casts could delete a raid boss
in a couple of hits.

**Fix:** halved to `executeMissingHealth: 0.2`. The execute is still there — a heavily
wounded target still dies hard to this — it just no longer swings on 40% of a boss's whole
remaining health bar per hit.

**Not touched:** Winter's Quarry (the mythic keystone) only adds `scaleBase: 1.2` and a
freeze/cold conversion via its own mutation — it doesn't touch `executeMissingHealth`, so
this fix applies whether or not the mythic is specced. Its flavour text describes a
"shattering nova chain" that has no implementation anywhere in the codebase (confirmed
against `docs/rule-coverage.md`, which lists `ranger.mythic.winters_quarry`'s `rule` string
as label-only, mutation-only) — a pre-existing gap, not something this change introduced or
was asked to fix.

**Noted, not fixed (per the brief's explicit scope: don't sweep other classes):** the same
`executeMissingHealth` + unbounded `to: "enemies"` shape appears on other classes' ultimates
— Reaper's Death Comes Due (`executeMissingHealth: 0.8`, `to: "enemies"`, no `shape`) and
Assassin's ultimate mutation (`executeMissingHealth: 0.4`, `to: "enemies"`, no `shape`) both
match this exact pattern and are candidates for the same class of complaint. Left alone,
flagged here for a future docket item.

## Measurement

A/B'd in a throwaway worktree (`fix/ranger-last-hunt-nerf` off master `b8b01a1`) against an
unmodified `ranger.ts` checked out from master, same seeds both sides.

**Reach** (bare `CombatHost`, no walls — exact controlled distances, `src/combat/index.ts`
harness style from `tools/classes.ts`): a ring of enemies from 80u to 1200u from the caster.

| distance | master | patched |
|---|---|---|
| 80–350u | hit | hit |
| 400–1200u | **hit** | **untouched** |

Master hits everything out to 1200u (the largest distance tested); the patch stops
exactly at the declared radius.

**Boss time-to-kill** (`tools/bot.ts`'s `playFloor`, 24 seeds each side, dodge 0.7):

| floor | master avg clear | patched avg clear | master cleared | patched cleared |
|---|---|---|---|---|
| depth 5, level 6 (smoke.ts's own boss calibration) | 22.0s | 25.3s (+15%) | 24/24 | 24/24 |
| depth 15, level 30 (contested — not a certain win either side) | 27.6s | 41.0s (+49%) | 8/24 | 10/24 |

The deeper floor shows a much larger effect, consistent with the diagnosis:
`executeMissingHealth` is a bigger fraction of a bigger health bar. The depth-15 row is
genuinely contested on both sides (neither 0/24 nor 24/24), so the timing delta isn't an
artifact of a saturated win/loss instrument, and more runs survive to clear under the patch
rather than fewer — the fix reduces lethality, it doesn't just slow down a fight that would
have gone the same way regardless.

`npm run test` (the full acceptance gate) is green on the patched branch; nothing in it
pins the old numbers.

## What changed

`src/progression/ranger.ts`, `RANGER_THE_LAST_HUNT`:
- `shape: { radius: 350 }` added.
- `executeMissingHealth: 0.4` → `0.2` on the delayed volley.

Two lines, both on the same ability, no other class touched.
