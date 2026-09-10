# Raid party scaling — a measurement, and why the obvious fix doesn't work

**2026-09-10 update: co-op raids are live.** The owner turned them on by explicit decision
that day, to iterate on the scaling live in actual play rather than from this document —
"fuck the scaling discussion we had beforehand... I want to iterate in co-op, and we'll do
it from there, and I'll let you know how the scaling is." That decision did not answer the
question below; it set it aside on purpose. **The measurement stands unrefuted**:
`partyScale` still doesn't transfer to a single raid-boss body, nothing in `data/raids.ts`
or `data/modes.ts` changed to enable this, and the fix this document describes and measured
is still unshipped, still on `investigate/raid-party-scaling`. Expect raids to play too easy
or too hard in a party — that is expected, not a regression, until the owner reports back.

Status: **measured, not shipped**. `tools/bot.ts`'s `playFloorParty` — the instrument that
produced every number below — is on `master`. The code that attempted a fix is not; it
lives, unmerged, on `investigate/raid-party-scaling`, kept there for whoever picks this up
next. This document is the deliverable in its place: CLAUDE.md used to say party balance
is "a guess, not a measurement" (see its own Planned Direction section) — for a raid boss
specifically, it no longer has to be a guess, even though it's still an open problem.

## The question

Raids shipped solo in v1 (`docs/raids.md`), deliberately, the same call the Vigil and the
Proving made. The wire seam was left open — `RunConfigWire` already carries
`raidId`/`raidTier`, `configFromWire` already rebuilds through `raidConfig` — so turning on
co-op was expected to be a small wiring change. It nearly was; what it actually needed
first was an answer to a question nobody had checked: **does `partyScale` mean anything
against a raid boss?**

`partyScale` (`data/modes.ts`) is tuned for a crowd — more, fatter, barely-harder-hitting
monsters, because "a party can't dodge for each other" and volume is what makes a party
fight read as a party fight. A raid boss is the opposite shape: one enormous body, not a
crowd. Nobody had measured whether the same term still behaves sanely there, and CLAUDE.md
already flagged this exact gap in its Planned Direction section before this investigation
started.

## The instrument

`tools/bot.ts` gained `playFloorParty`, a party sibling of the existing solo `playFloor`.
Per that file's own rule ("don't paraphrase this into a new harness"), the steering/escape
helpers (`escapeAngle`, `steerAngle`, `steer`, `approachDir`) were generalized into
`*For(d, avatar, …)` variants that take an explicit avatar instead of assuming `d.avatar`;
the original single-hero exports are thin wrappers over them, so no existing call site
changed behavior.

`playFloorParty` drives N independent attentive bots in one real `"host"`-role `Dungeon`:
each dodges telegraphs at the same reaction rate `playFloor` uses, drinks its own potion
belt (potions are per-hero in a party), and — before anything else — walks to revive a
downed ally, the same priority order a real player would use. No wire is involved: the
host is where a fight resolves regardless of how many screens are watching, so this is a
faithful measurement of a real co-op fight without needing an actual client. It is
deliberately **not** wired into `npm run test` — see the file's own header for why: there
is no agreed-correct answer yet to assert against, only a documented finding that several
obvious answers are wrong.

`tools/raid-party-measure.ts` (also on `master`, not gated in `npm test` or
`package.json`) is the measurement script itself, reproducible on demand. Run it from
`master` to reproduce the baseline numbers below (the shipped `partyScale`, unaffected by
anything in this document), or from `investigate/raid-party-scaling` to reproduce the
single-body attempt's numbers.

## Methodology

- **Gearing**: `raidGeared()` (in the measurement script) sets a character's `deepestDepth`
  to the raid floor's own depth *before* opening chests — chests roll item level off that
  record, and `tools/bot.ts`'s ordinary `geared()` never sets it, which badly under-gears
  anything deeper than the shallow floor it was built for. Twenty Legendary-tier chests,
  both trees filled, `recommendedLevel` for the floor. This is a **consistent** baseline
  across party sizes, not a claim about what a "realistic" player looks like — consistency
  is what a size-vs-size comparison needs; a realistic player at a raid's actual
  `unlockFrontier` may well be higher level than this in practice, which would move the
  solo numbers (especially Queen's) up without changing the shape of the comparison.
- **Raids measured**: The Ferryman (tier 1, an easy/winnable fight at this gearing;
  tier 4, a fight beyond this gearing's power at any party size) and Queen of the Seventh
  Circle (tier 1, a fight at the edge — unwinnable solo, sometimes winnable in a party).
- **Seeds**: 24 (`11, 22, … 266`), widened from an initial pass of 12 once that pass showed
  a regression on Ferryman tier 4 — a raid boss's clear rate at this gearing is close to a
  coin flip, and this codebase's own convention (`CAMPAIGN_SEEDS` in `tools/bot.ts`) is not
  to trust twelve seeds on a comparison like that without checking it holds at more.
- **Reported per party size**: total party damage taken (`dmgBill`) and that divided by
  headcount (`dmgBill/player`) — the fairness measure, since a party of four naturally
  racks up more total damage just from having more bodies present — clear rate, downs
  (times any hero went from standing to downed), and potions drunk.
- **`dmgBill/player` is confounded whenever the fight's LENGTH moves, and this document
  leans on it heavily.** Added after the threat-rate work (`docs/raid-threat-rate.md`)
  found the two metrics disagreeing on the same run: a change that makes a fight *harder*
  can book *less* total damage, because the party dies sooner and the damage never accrues.
  On Queen tier 1 the clear rate flattened across party size — the fix working — while
  `dmgBill/player` said the dilution had got worse, and the average phases reached dropped
  from 2.1 to 1.4, which is the tell that the party was simply dying earlier. Every number
  in this document is sound as a *baseline* reading, because the arms being compared there
  ran to comparable lengths. But when you compare a treatment against it, **read clear rate
  first and check `avgSec` and `phases` before believing a `dmgBill/player` delta.** Damage
  taken is a rate, and this column silently divides it by a duration that is itself part of
  what you changed.
- **Baseline and treatment are compared at the same seed count.** The first report on this
  finding compared a 12-seed baseline against a 24-seed treatment — reasonable in the
  moment (only the treatment had shown a surprise worth widening), but it risked crediting
  the treatment for a difference that was partly sample size rather than the change itself.
  Every table below is the baseline and the fix re-run at the same 24 seeds, which is what
  found that Ferryman T1's "improvement" mostly wasn't one — the baseline was already close
  to as trivial at that sample size. **Compare like sample sizes, not just like seeds.**

## Baseline: `partyScale`, unmodified (this is what's shipped on `master` today)

**The Ferryman, tier 1** (an easy fight — solo already clears more than half the time):

| players | cleared | dmgBill/player | downs |
| --- | --- | --- | --- |
| 1 | 14/24 (58%) | 3369 | 0.42 |
| 2 | 21/24 (88%) | 2351 | 0.58 |
| 3 | 23/24 (96%) | 2086 | 0.63 |
| 4 | 23/24 (96%) | 2086 | 1.13 |

**Queen of the Seventh Circle, tier 1** (a fight at the edge — unwinnable solo at this
gearing):

| players | cleared | dmgBill/player | downs |
| --- | --- | --- | --- |
| 1 | 0/24 (0%) | 5405 | 1.00 |
| 2 | 4/24 (17%) | 5272 | 2.33 |
| 3 | 10/24 (42%) | 4940 | 3.29 |
| 4 | 6/24 (25%) | 4955 | 5.13 |

**The Ferryman, tier 4** (danger compounds `1.15^(tier-1)`; too hard for this gearing at
every party size, so clear rate can't discriminate — the trajectory can):

| players | cleared | dmgBill/player | downs |
| --- | --- | --- | --- |
| 1 | 0/24 | 4117 | 1.00 |
| 2 | 0/24 | 4648 | 2.46 |
| 4 | 0/24 | 6310 | 7.50 |

Two failure modes are visible even in the shipped state: an easy fight gets substantially
easier *per player* as the party grows (dmgBill/player nearly halves from solo to a full
party), and a fight already beyond the party's power gets bloodier without getting more
winnable (downs climb from 1 to 7.5, dmgBill/player climbs too).

## Attempt 1: `singleBodyPartyScale` — linear health, flat damage

The reasoning going in: a single body has no crowd-sized "more of them" axis (`count` does
nothing against one target), so the two crowd terms that matter are health and per-hit
damage. Two changes were proposed and built (`data/modes.ts`, unmerged):

- **Health scales linearly with party size** (`health = players`, vs. `partyScale`'s
  sub-linear ×1.65/2.30/2.95 at 2/3/4 players) — the reasoning being that each added player
  brings roughly their own damage output, so linear health should hold time-to-kill per
  player roughly constant.
- **Damage does not scale with party size at all** (flat 1×, vs. `partyScale`'s
  ×1.10/1.20/1.30) — the reasoning being that a bigger party's extra danger is already
  supplied by more bodies that can be caught in a telegraph, and that the revive economy
  (see the reckless-vs-attentive numbers below) already demonstrably punishes standing in
  things at scale; charging damage on top would double-count it.

Wired into `profileFor`, scoped to `run.raid` only — no second difficulty curve, and
identical to `partyScale` at `players: 1`, so it doesn't move `tools/raids.ts`'s
same-depth-same-danger comparison (which always runs at the default `players: 1`).

**Re-measured, same seeds, same methodology:**

**The Ferryman, tier 1:**

| players | cleared | dmgBill/player | downs |
| --- | --- | --- | --- |
| 1 | 14/24 (58%) | 3369 | 0.42 |
| 2 | 19/24 (79%) | 2775 | 0.67 |
| 3 | 24/24 (100%) | 1957 | 0.17 |
| 4 | 22/24 (92%) | 1952 | 0.79 |

**Queen of the Seventh Circle, tier 1:**

| players | cleared | dmgBill/player | downs |
| --- | --- | --- | --- |
| 1 | 0/24 (0%) | 5405 | 1.00 |
| 2 | 3/24 (13%) | 5261 | 2.29 |
| 3 | 6/24 (25%) | 5623 | 3.92 |
| 4 | 9/24 (38%) | 5234 | 5.17 |

**The Ferryman, tier 4:**

| players | cleared | dmgBill/player | downs |
| --- | --- | --- | --- |
| 1 | 0/24 | 4117 | 1.00 |
| 2 | 0/24 | 5105 | 2.33 |
| 4 | 0/24 | 7020 | 7.88 |

**Reading it against the baseline, apples to apples:**

- **Ferryman T1 (easy fight): not actually a failure of the fix — there was nothing there
  for it to win.** The *baseline* already trivializes this fight nearly as hard as the fix
  does: dmgBill/player nearly halves from solo to a full party either way (baseline
  3369 → 2086, fix 3369 → 1952), and clear rate climbs sharply in both versions. Health
  scaling was never going to touch this, because the mechanism behind it isn't on the
  health axis at all — see "fixed-output dilution" below. Reading this case as "the fix
  didn't fix it" would be the wrong lesson; the right one is that this specific failure
  mode was never reachable through health or damage, by either version.
- **Queen T1 (edge fight): roughly a wash.** dmgBill/player was already close to flat in
  the baseline (~5000-5400) and stays there. Downs climb similarly in both versions. Clear
  rate is noisy in both (baseline peaks at 3 players then drops; the fix climbs
  monotonically to a similar peak at 4) — not a clean win either way.
- **Ferryman T4 (already-too-hard fight): measurably, unambiguously worse, and this is the
  one real regression.** dmgBill/player at 4 players went from 6310 (baseline) to 7020
  (fix); downs from 7.50 to 7.88; the average fight before an inevitable wipe took
  noticeably longer (49s → 74s at 4 players, from the raw measurement runs). Giving the
  boss more health did not help a fight the party was going to lose regardless — it just
  made losing it slower and bloodier.

**Conclusion: the fix's one real failure is T4, not T1 — and that distinction matters
for the diagnosis.** The health-scaling change did what it could do (T4 got worse from
having more health to burn through on a fight already lost) but couldn't do what it was
meant to do (T1's trivialization survived unchanged, because the leak it needed to close
was never a health-axis problem). The fix's premise — "the extra bodies supply their own
difficulty" — was wrong for T1's failure mode specifically, not merely under-tuned; no
choice of health/damage constants closes a gap that health and damage don't cause.

## Why: two mechanisms, not one

**1. The crossover (a tuning error in the specific constants tried).** `singleBodyPartyScale`'s
linear health is *higher* than `partyScale`'s at every party size from 2 up, and by a
growing margin:

| players | `partyScale` health | `singleBodyPartyScale` health | delta |
| --- | --- | --- | --- |
| 1 | 1.00 | 1.00 | — |
| 2 | 1.65 | 2.00 | +21% |
| 3 | 2.30 | 3.00 | +30% |
| 4 | 2.95 | 4.00 | +36% |

For a fight the party can win, more health just costs more time — not obviously a problem
on its own. For a fight the party was always going to lose (Ferryman T4 at this gearing),
more health makes the loss slower and more expensive: a longer fight means more cumulative
chip damage and more chances for any one hero to be caught in a mechanic, which is exactly
the T4 regression above. This half is a genuine tuning miss in the specific numbers tried,
not a flaw in scaling health as such.

**2. Fixed-output dilution (the reason the easy fight barely moved, and health scaling
alone can never fix it).** A single body has a roughly fixed rate of threat output — one
cast rotation, one set of telegraphs, resolving at a fixed cadence regardless of how many
people are in the room. When that fixed output is divided among more targets, **per-player
damage taken falls with party size even if time-to-kill is held perfectly constant** — the
mechanism is on the *division* side, not the health side at all. This is exactly the
Ferryman T1 signature: clear rate climbs and dmgBill/player nearly halves in *both*
versions, because neither version touched the boss's rate of threat generation, only how
long it takes to kill and how hard its existing output hits.

Framed together: `partyScale`'s crowd model assumes a party is punished by *numbers* (more
monsters, more simultaneous threats) — true for a crowd, and CLAUDE.md is explicit that a
one-shot must never be the answer for a lone attack (per-hit damage staying flat is
correct, for a crowd and for a single body alike). Against one body, a party isn't punished
by numbers because there's only ever one attacker; whatever "more people, more danger" is
supposed to mean here has to come from somewhere other than the health or per-hit-damage
axes, because dilution eats whatever those two axes try to supply.

## A direction, not a decision

The shape that follows from mechanism 2, put here for the owner's eye rather than built:
for a single-body encounter, party scaling should raise the boss's **rate of threat
generation** — how often it acts, how many simultaneous mechanics are live on the floor,
whether a mechanic can catch more than one person — rather than its health or per-hit
damage. `aggression` and `telegraph` are already `DepthProfile` fields (currently driven
only by depth/danger); they're the existing lever this would pull, not a new mechanism.
Per-hit damage should specifically **not** be part of this, for the reason CLAUDE.md
already states: multiplying a boss's hit by party size makes every mechanic lethal on
contact, and "a one-shot is a wipe waiting to happen" is exactly the crowd-fight problem a
raid boss must not also become.

This is a real design change to how a boss encounter behaves in a party — not a constant to
retune — and it deserves the owner's sign-off before anyone builds it, the same standard
this rework was already held to for staying scoped to raids alone rather than every boss
floor in the game.

## Status

- `singleBodyPartyScale`, the co-op wiring (`main.ts`'s `handleHubInteraction` and the War
  Table/Raid Portal party plan) and the `docs/raids.md` "Co-op" section describing it are
  **unmerged**, on `investigate/raid-party-scaling`. Raids remain solo-only, matching the
  currently shipped state; nothing about them changed.
- `playFloorParty` (`tools/bot.ts`) and `tools/raid-party-measure.ts` are on `master` —
  the instrument survives the branch that produced this one finding, for whoever measures
  the next attempt.
