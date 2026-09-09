# Boss abilities: what the deck asks, and what it did not

Design record for the boss-variety pass. The owner's complaint was that bosses "all seem
to fight the same and use the same abilities". This is what that turned out to mean, what
was built, and the three things that were deliberately *not* built.

## What the measurement said

`npm run bossvariety` (`tools/bossvariety.ts`) enumerates every encounter the game can
spawn — 5 authored, 21 Provings, 4 raids, 9 Reliquary sectors, 5 Tower — and reports kit
size, opener, exclusive abilities and pairwise Jaccard overlap.

At the branch point, 44 encounters drew on 15 abilities, and:

| | before | after |
|---|---|---|
| encounter pairs that are the *same fight* | **74** of 946 | **0** |
| abilities in 100% of kits | `quake`, `summon` | none |
| full-kit overlap, mean | 58.3% | 44.5% |
| Proving-vs-Proving overlap, mean / worst | 71.8% / 100% | 50.5% / 88.2% |
| raid-vs-raid overlap, mean | 50.3% | 37.1% |

The headline was not the deck size. It was that **no encounter in the game owned a single
ability nothing else had**, and that `planetBossSpec` and `towerBossSpec` never touched
`phases` at all — so 14 of the 44 were byte-identical fights with a new name plate.

## The six questions the old deck asked

Get out of the circle · get into the donut · step off the line · get out of the cone ·
kill the adds · stop attacking and move.

That was the whole game. Everything else was a different radius.

## The eight added, and the question each one asks

| id | name | the question |
|---|---|---|
| `hunt` | The Slow Certainty | keep moving — direction is yours |
| `drift` | The Current | the safe ground moves after it lands |
| `sunder` | Cut the Room | part of the arena is gone for ten seconds |
| `blink` | No Further Turns | it is not where you left it |
| `sanctuary` | Divine Judgment | get to specific ground, not just away from it |
| `judgment` | Twice-Spoken | walk the first beat, dash the second |
| `mark` | Told Apart | be somewhere nobody else is |
| `crescendo` | It Is Getting Louder | the fight gets worse the longer you take, permanently |

The animation tag for a boss ability **is** its `BossAbilityId`, by convention agreed with
the animation stream. Adding a row to the union is the whole of declaring a tag; an
ability with no art falls down the render fallback ladder to its static frame.

## Three things deliberately not built

**1. A line-of-sight mechanic.** The brief asked for one that "demands you break line of
sight behind the geometry the level generator already gives you". Boss arenas draw from
`BOSS_LAYOUTS = ["open", "ring"]`; `layoutOpen` scatters 1–3 blocks of 54–104 units into a
room 1360+ units wide. So on an open roll the cover is sometimes a single small block
across the arena, and whether the mechanic had an answer would depend on a level seed the
player never sees. An ability whose answer is conditional on rng is not readable, whatever
its telegraph says. Building real cover at runtime is also out: walls are the collision
volume *and* the tile lattice *and* what the flow field is rebuilt against.

`sanctuary` is the replacement and it asks the same shape of question — get to specific
ground — with an answer the ability brings with it. At least one disc always lands near
the body (`SANCTUARY_NEAR_REACH < SANCTUARY_FAR_MIN`, asserted), or it would be a flat
melee-uptime tax in a mechanic's costume.

**2. A stillness-punisher.** Already in the game as the Tower's `regard` ward, and
`REGARD_HOLD` in `data/traps.ts` records the measurement: it taxes bows, staves and every
channelled build harder than it taxes a sword, and lengthening the hold *concentrates* the
tax rather than relieving it. Re-importing that at raid scale would have been an own goal.
`hunt` asks "keep moving" without keying on stillness, so it costs a parked ranged build
and a melee build the same few steps. Its speed is asserted against the slowest class's
base move speed rather than bounded, so a class rebalance cannot quietly turn it into an
unavoidable hit.

**3. A dash-reader.** Proposed, and **declined by the PM** — do not reopen without the
owner. "A dash always beats them" is what makes the dash the one skill the game asks you
to learn; a mechanic that inverts it makes the right answer conditional on first
identifying which mechanic you are looking at. `judgment` is as close as the rules allow:
a dash beats each beat outright, and what it punishes is the *reflex* dash.

## The finding that came out of the A/B: threat is per cast, not per card

Every kit here was authored to **swap** cards rather than gain them — as many drops as
signature entries — on the theory that a same-size hand is a same-difficulty fight. A
widened A/B (16 seeds, branch point vs tip, `playFloor` with gearing calibrated so each
row is contested) says that theory is wrong in one direction:

- The three Delve control rows are **byte-identical**, so nothing leaked out of the
  surfaces that were meant to change.
- Most changed rows moved within ±10%.
- But **adding low-threat abilities to a fixed-cadence rotation makes a fight easier**,
  because a boss casts on a timer: every cast spent on a territory-denial ability is a
  cast not spent on a big hit. The Ferryman gained `drift` and `hunt` and went from 9/16
  wins to 15/16 with the fight *lengthening* from 63s to 77s — less damage per second,
  more variety, easier.

So a kit's difficulty is `cadence × mean threat per card`, not card count. Two Tower rows
were re-authored once the A/B showed it (`meteor`'s five lingering pools took h10 up 40.8%;
dropping `meteor` from h15 took it from 9/16 to 15/16 wins). The Ferryman's residual
easiness is **not** silently absorbed — see `docs/raid-threat-rate.md`.
