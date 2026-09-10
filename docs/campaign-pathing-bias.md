# The sharp-vs-reckless margin was partly propped up by a pathing bug

Status: **measured on both arms, the mechanism confirmed directly, the margin's overall
size not fully resolved.** Fixing `FlowField.direction()`'s blocked-cell bug (see the
commit "a monster flush against a wall could lose its route entirely") moved
`tools/smoke.ts`'s sharp-vs-reckless campaign check's reading on `CAMPAIGN_SEEDS` from a
comfortable pass (sharp 11.5 vs reckless 9.0, margin 2.5) to a fail (sharp 10.8 vs
reckless 10.9, margin −0.1). This document is the two measurements that were run to find
out what that shift actually means, rather than reading one moved number as proof of
anything in either direction — the exact mistake CLAUDE.md's own campaign-comparison
notes have three sections about, now from the other side: a check going red is not
automatically proof the promise it names is broken, any more than green was ever proof it
held.

## The finding, stated once

**A dodging player's pursuers got stuck on geometry roughly 2.6x more often than a
standing-and-trading player's did, before the pathing fix — and that gap, not skill, was
part of what the sharp-vs-reckless margin was measuring.** Dodging and repositioning near
walls and corners is exactly where a chasing monster's collision circle rests flush
against a wall most often — following a moving target around a corner is a far tighter
turn than walking a straight line into melee — and that is exactly the shape the pathing
bug needed to trigger. The sharp bot was not only reading telegraphs better; some of its
survival margin was monsters failing to chase it at all.

## Measurement 1: null-route stalls, sharp bot vs reckless bot, unmodified master

Instrumented `campaign()` (`tools/bot.ts`, the same optional `onTick` hook the pathing fix's
own test uses) to count, across the actual `CAMPAIGN_SEEDS` and 20 dives each, how often a
non-boss enemy sat motionless for 3+ seconds while it should have been closing distance,
and whether `FlowField.direction()` returned null from its exact position at that moment —
run against **unmodified master's** `level.ts`, before the fix existed.

| Bot | Dodge rate | Stall episodes | …with a null route |
| --- | --- | --- | --- |
| Sharp | 0.55 | 36 | **34** |
| Reckless | 0 | 38 | **13** |

Both bots stall a similar number of times overall (dodging and standing still both produce
roughly the same count of "not currently closing distance" moments, for different reasons
— a sharp bot is often mid-dodge, a reckless bot is often just trading hits at range 0).
But of those stalls, **94% of the sharp bot's were the pathing bug; only 34% of the
reckless bot's were.** This is direct, mechanism-level evidence, not an inference from a
moved average: the sharp bot's pursuers were losing their route to it far more often, for
the reason above.

## Measurement 2: paired disjoint-block A/B, master arm vs fixed arm

Five disjoint 12-seed blocks (seed bases 733 apart, 100,000 apart per block — chosen only
to be reproducible and non-overlapping with `CAMPAIGN_SEEDS` or each other), the same
blocks run against both master's `level.ts` and the fixed one, margin computed the exact
way `tools/smoke.ts` computes it (average `deepest` across a block's 12 seeds, sharp minus
reckless):

| Block | Master margin | Fixed margin | Δ (fixed − master) |
| --- | --- | --- | --- |
| 0 | 3.17 | 1.17 | −2.00 |
| 1 | 3.00 | 0.58 | −2.42 |
| 2 | 2.42 | 2.33 | −0.09 |
| 3 | 2.08 | 3.17 | **+1.09** |
| 4 | 2.17 | 3.00 | **+0.83** |

Mean Δ = **−0.52**. Direction agrees with measurement 1 — the fix pulls the margin down on
average — but it is not uniform: three of five blocks move down, two move up, and the
spread of the shift itself (−2.42 to +1.09) is comparable in size to the effect being
measured. This is **not** the clean "systematically below on every block" signal that
would make the shift's reality unambiguous on its own. Two things are worth noting about
the pattern rather than just the mean:

- **The two blocks with the largest master-arm margins (0: 3.17, 1: 3.00) show the
  largest drops.** The two with the smallest master-arm margins (3: 2.08, 4: 2.17) move
  up instead. That is consistent with a bug that inflates the margin by a variable amount
  depending on how much a given seed's floor geometry happened to produce the
  flush-against-a-wall shape — removing a variable-sized prop should hit hardest exactly
  where the prop happened to be biggest, which is what this looks like, though five
  blocks is not enough to call that pattern itself confirmed.
- **`CAMPAIGN_SEEDS` itself moved by −2.6** (2.5 to −0.1), which sits inside the same range
  as this measurement's two largest drops, not off on its own as an outlier — the shift
  master's own seeds happened to show is a real, if large, member of the distribution this
  A/B produced, not a fluke unrelated to it.

## What this does and doesn't settle

**Settled:** the mechanism is real. Measurement 1 is not ambiguous — pursuers chasing a
dodging player lost their route dramatically more often than pursuers chasing a standing
one, before the fix, on the actual seeds the check uses. Some real fraction of the sharp
bot's historical advantage was a defect, not a skill reward, and the fix removes exactly
that fraction. `CAMPAIGN_SEEDS`' own large drop is not a fluke — it is a real instance of
the same effect the paired blocks show, on the high end of what they produced.

**Not settled:** whether the *design promise itself* — "reading telegraphs reaches
meaningfully deeper than ignoring them" — still holds by the margin the check currently
asserts (≥1 depth), now that the pathing-bug assist is gone. The paired blocks are
directionally consistent but noisy enough (two of five move the other way) that five
blocks cannot distinguish "the promise is now thinner but still real" from "the promise
was never as wide as `CAMPAIGN_SEEDS` alone suggested, bug or no bug." CLAUDE.md's own
note on this check's natural block-to-block spread (2.42, 2.92, 4.83, 6.08, −0.33 with
*no* code change at all) already established that nobody can fully separate "the promise
is fragile" from "a specific inversion is one bad block" from a handful of readings —
and this document does not resolve that question either, honestly. What it adds is that
at least part of the historical margin was never a fair measurement of skilled play to
begin with.

**What must not happen:** reading either the pre-fix numbers or this document's own
paired-block numbers as proof the promise "still holds" or "is broken." Both are partial
evidence. A full power sweep (CLAUDE.md: ~85s per 12-seed block, hours for something with
real statistical power) is the only thing that would fully settle the second question, and
that remains the cost decision CLAUDE.md already assigns to the owner, not something this
investigation spent unasked.

## What was deliberately not done

`CAMPAIGN_SEEDS` was not changed, and the check's `sharpDeepest >= deepest + 1` bar was
not touched. The check reads red on current `CAMPAIGN_SEEDS` and stays that way pending an
owner decision on either of two paths: accept a narrower promise and lower the bar to
match what the paired blocks above actually show a fixed pathing engine producing, or
treat the current reading as one unlucky block among many (consistent with block 2's
near-zero shift) and leave the bar where it is, accepting that `CAMPAIGN_SEEDS` specifically
is presently a below-average draw for the fixed arm. Either is defensible from this data;
neither is this document's call to make.
