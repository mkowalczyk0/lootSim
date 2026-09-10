# Reliquary sector 7-9 reachability — a measurement

Status: **measured, not fixed**. This is a design finding for the owner, per this
project's standing rule that a measurement lands even when a fix doesn't
(`docs/raid-party-scaling.md` set the precedent). Assigned because
`docs/materials-coverage.md` flagged sectors 7-9's reachability as unmeasured, and
because two recipes were built today against materials that live behind them (the
Unbound Spire, sector 8/Rune Fragment, baseDepth 39; the Hollow Orchard, sector
9/Heartwood Sap, baseDepth 44).

**Bottom line: difficulty is the wall, not the ladder, and it is not a close call.**
Sector 7 — the *first* of the three reserved sectors, sitting at baseDepth 34 — could
not be cleared by a scripted bot at its own baseDepth, nor at up to **+116 character
levels over it (level 150)**, nor by any of four classes tested at level 100. The
sequential-clear requirement that gates sector 9 is real (8 prior clears) but
practically irrelevant, because nobody reaches sector 7 in the first place.

## Q1 — how many clears does the ladder route actually require?

Derived directly from `planetUnlocked`/`PLANETS`, not hand-counted (this project has
gotten a hand-computed figure wrong three times before; a derived one has not):

| Sector | id | baseDepth | Ladder clears to OPEN |
| --- | --- | --- | --- |
| 1 | htrae | 4 | 0 (always open) |
| 2 | corvel | 9 | 1 |
| 3 | ignathis | 14 | 2 |
| 4 | rimehollow | 19 | 3 |
| 5 | stormreach | 24 | 4 |
| 6 | nullspire | 29 | 5 |
| **7** | **giltvault** | **34** | **6** |
| **8** | **runespire** | **39** | **7** |
| **9** | **heartgrove** | **44** | **8** |

Opening sector 9 needs sectors 1-8's tier-1 banked in order (8 clears); actually
harvesting Heartwood Sap from it needs a 9th clear — the "nine sequential clears"
framing this task started from. The frontier route (`GameState.frontier >= baseDepth`)
is the other door, but CLAUDE.md already records that depth 30 is "far beyond the
measured frontier" for the campaign bots and unbeatable by most classes at level 60,
so at baseDepth 34-44 the frontier route is not meaningfully easier than the ladder —
see Q2.

## Q2 — can a competently-played character actually clear those floors?

**No, not at any gearing tested.** Method: `tools/reachability.ts` (new, not gated —
same deliberate exclusion as `tools/arena.ts`/`tools/builds.ts`), built on `tools/
bot.ts`'s existing `playFloor` + `geared` + `planetConfig`/`nextFloorConfig`, the same
primitives `tools/smoke.ts` already uses for rift/tower multi-floor chains. Tested
floor 1 of tier 1 only (the very first room of the very first attempt) since that's
already enough to answer the question — see results.

**Instrument check first, because the last attempt at this produced zero numbers and a
harness that runs but can't see a win is worse than no harness**: sector 1 (baseDepth
4) at character level 30 cleared 5/5 seeds cleanly (~20-30s per floor, full 3-floor
tier). The harness demonstrably can report a win; the zeros below are not that.

Five seeds per row, floor 1 only, `dodge=1.0` (perfect telegraph reading — the
generous end of a real player, not the average):

| Sector | baseDepth | Level tested | Cleared | Typical death |
| --- | --- | --- | --- | --- |
| 7 giltvault | 34 | 34 (own depth) | 0/5 | dead in ~15-45s, 0-7 kills of 200 required |
| 7 giltvault | 34 | 54 | 0/5 | dead, 3-20/200 |
| 7 giltvault | 34 | 100 (+66) | 0/5 | dead, 7-45/200 |
| 7 giltvault | 34 | 150 (+116) | 0/5 | 4 dead, 1 still fighting at 400s cap, 20-99/200 |
| 8 runespire | 39 | 39, 59, 105, 155 | 0/5 each | same shape, 0-52 kills of 220 required |
| 9 heartgrove | 44 | 44, 64, 110, 160 | 0/5 each | same shape, 0-14 kills of 240 required, **no improvement from level 44 to 160** |

Sector 9 is the starkest: kill count barely moves between level 44 and level 160 (a
character nearly **4x** the sector's own intended depth), which reads as the fight
being lethal fast enough that extra stats never get spent — not a gradient that levelling
closes.

Cross-class check on sector 7 (level 100, three seeds each) ruled out "wrong class":
**lancer, berserker, magician and paladin all died the same way** (0/3 each, 1-79
kills of 200). This is `profileFor`'s documented quadratic damage growth
(CLAUDE.md, "Difficulty philosophy") continuing past the point CLAUDE.md already
flags as the edge of what's been measured (depth 30, level 60) — sectors 7-9 sit
4-14 depths past that edge with no floor-level or gear-level offset for a planet
(planets use the same curve `profileFor` gives the Delve/Tower at the same depth).

One data point suggests the wall *softens*, slowly: sector 7 alone, given absurd
overlevelling (150-300, i.e. up to **~9x** its own baseDepth), started producing
occasional clears (3/8 seeds at level 300, several others timing out at 600s just
short of quota) in an earlier exploratory pass not kept in the committed tool. That is
not a defense of reachability — a level-300 character does not exist in any realistic
campaign — but it says the curve is steep rather than a hard cap, which matters for
whichever fix the owner picks.

## Q3 — is the ladder the binding constraint, or is difficulty?

**Difficulty, decisively.** The ladder's own requirement (6-8 sequential tier-1
clears through sectors that sit at baseDepth 4-29, well inside territory this bot
clears cleanly per the control test and per the existing Delve balance data) is
achievable in the time it takes to run eight short expeditions. It is never
*exercised* in practice, because the very first reserved sector a ladder-climbing
player reaches — giltvault at depth 34 — is already beyond survivable at every
gearing level tested. A player does not fail to reach sector 9 because sector 8 took
too long to unlock; they fail because sector 7 kills them in under a minute regardless
of level.

## What this doesn't answer

- The full 9-sector sequential campaign (open each sector by actually clearing the
  previous one, levelling naturally along the way, per the PM's original ask) was
  **not run end-to-end** — once sector 7 alone proved uncleared at 4x its own
  baseDepth, running the seven-sector prelude to reach it added cost without changing
  the answer to Q3. This is a scope call, not an oversight: flag it if the owner wants
  the full chain measured anyway (e.g. to characterize sectors 1-6's actual difficulty
  gradient, which this doc didn't examine).
- Only `dodge=1.0` (near-perfect play) and one gearing heuristic (`tools/bot.ts`'s
  `geared()`, best-in-slot from Advanced chests) were tested. A hand-optimized real
  player with crafted/named gear might do better; the gap between "0/5 at 4x depth"
  and "reachable" looks too large for that to close it, but it wasn't measured.
- The frontier route via the Tower (climbing rather than digging) was not separately
  tested; CLAUDE.md's height-for-depth parity rule (`npm run world`) means it should
  fail identically to the Delve frontier route, but that's an inference, not a run.

## Reproducing this

`npx tsx tools/reachability.ts` (or the esbuild-bundle-and-run pattern every other
`tools/*.ts` in `package.json` uses). Not wired to an npm script and not part of
`npm test` — this asks an open balance question, not a pass/fail regression, the same
reason `builds` is excluded.

## Not fixed, on purpose

Per the assignment: no threshold was lowered, no curve was softened, nothing merged
to master. Candidate fixes (lower the three sectors' `baseDepth`, ease `dangerPerTier`
for planets specifically, add a gear-independent unlock, or accept these three
materials as endgame-only for now) are the owner's call, not this investigation's.
