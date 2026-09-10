# Enemy friendly fire — the fix, and how much it costs a summon-heavy boss

Status: **fixed and shipped**. `src/game/boss.ts`'s telegraphs no longer damage other
enemies; `tools/friendlyfire-measure.ts` (on `master`, not gated in `npm test` or
`package.json`, the same call `tools/raid-party-measure.ts` made) is the instrument that
produced every number below, reproducible on demand. This document is the finding a
straight correctness fix doesn't carry on its own: removing the friendly fire is a real,
if modest, difficulty increase for a summon-heavy encounter, and the size of it tracks
how summon-heavy the kit is, exactly as expected going in.

## The bug

A boss's own telegraphs — the sole source of enemy-vs-enemy damage anywhere in the game
outside deliberately-bidirectional level traps (`src/data/traps.ts`, unrelated, see
below) — were flagged `hitsEnemies: true` at most of their ~10 call sites in
`src/game/boss.ts`, and `resolveTelegraph`/`updateGround` in `src/game/dungeon.ts`
applied that damage to every non-boss enemy in the shape, both on the instant hit and on
the lingering ground zone it leaves behind. Since a boss floor's only non-boss enemies
are the encounter's own summons ("everything else on it was summoned by the encounter",
CLAUDE.md), this meant a boss's own AoE was killing its own adds — reported by the owner
as a bug after playtest.

Two of the `true` sites carried explicit design comments arguing this was deliberate
("a boss's own adds are not immune to the floor it sets on fire"; "a summoned body
becomes something to stand away from"). The owner's bug report overturned that reasoning
— on the ruling, a playtest observation of unwanted behavior beats an unreviewed design
comment that was never itself validated against play. One of the two comments (the `mark`
ability, marking nearby adds so the player has to stand away from them) turned out not to
depend on the add taking damage at all — the mechanic is about the shape riding the add,
not about hurting it — so `mark` is functionally unchanged by the fix, only genuinely
overturned it. `hitsEnemies` is now `false` at every boss telegraph site.

Traps (`src/data/traps.ts`) are a separate system and were left alone: they're
level features that hit both the player and monsters on purpose, documented in the
file's own header ("most of them hurt monsters too, they double as a weapon if you can
bait something across one"). Not the bug, not touched.

## Method

`tools/friendlyfire-measure.ts` plays a boss floor with `tools/bot.ts`'s `playFloor` bot
(the same attentive, telegraph-reading bot `tools/smoke.ts` uses), across two disjoint
40-seed blocks per fight — one comparison, checked for spread rather than trusted from a
single block, per this repo's own standing discipline (see CLAUDE.md's campaign-
comparison note). Two fights, both calibrated first to land in a genuinely contested win
rate (an 8-seed sweep, not reproduced in the committed script) so a pinned 0/16 or 16/16
row isn't reported as a measurement:

- **depth 5, warden** — light summon use (`addsOnEnter` 0 → 3 → 4 across its three
  phases). Reuses the exact gearing `tools/smoke.ts`'s own "first raid boss" section
  already established as contested.
- **depth 10, choir** — heavier summon use (`addsOnEnter` 0 → 4 → 5).

**Depth 20 (herald, the heaviest of the five authored kits) was tried and dropped.** Even
at level 60 with 30 Advanced-tier chests — the top of what `geared()` can produce — the
solo bot could not clear it or reliably reach a second phase across an 8-seed calibration
sweep at every gearing tried from level 20 up to 60. That's consistent with CLAUDE.md's
existing finding that "the delve's own depth-15 boss is close to unbeatable for the same
characters that clear a depth-15 trash floor without much trouble" — a row that never
reaches a summon-casting phase measures nothing, so herald is out of reach for this
instrument at any gearing a solo bot can produce, and the finding below is bounded to
the two fights it could actually reach.

Every one of the 320 floor-plays behind the numbers below reached at least one phase
change (`reached-a-phase-change`: 40/40 on every block, both fights, both branches), and
the boss's `summon` ability ("Call the Chorus") was actually cast dozens of times per
block — the instrument is confirmed to reach the code the fix changed, not just run past
it.

## Result

Pooled across both 40-seed blocks (n=80 per fight per branch):

| fight | branch | wins | avg peak adds | avg adds alive/tick | avg damage taken |
|---|---|---|---|---|---|
| warden (depth 5, light summon use) | master | 72/80 (90.0%) | 6.33 | 0.87 | 652 |
| warden (depth 5, light summon use) | fixed | 71/80 (88.75%) | 6.73 | 1.03 | 678 |
| choir (depth 10, heavier summon use) | master | 39/80 (48.75%) | 7.47 | 1.14 | 1995 |
| choir (depth 10, heavier summon use) | fixed | 32/80 (40.0%) | 7.51 | 1.41 | 2047 |

**The average number of adds alive at any moment rose in both fights** (+18% warden,
+24% choir) — the fix is doing exactly what it says: adds live longer once the boss's
own AoE can no longer cull them. **But that only cost a measurable amount of win rate on
the heavier-summon fight.** Warden's win rate barely moved (90.0% → 88.75%, a 1.25-point
gap that is noise at this sample size — well under one standard deviation). Choir's
dropped a real 8.75 points (48.75% → 40.0%, roughly a fifth of its win rate,
relatively) — and the direction was consistent across both disjoint blocks
(block 1: 17/40 → 16/40; block 2: 22/40 → 16/40), never once favoring the fixed branch.
The two blocks disagree on the *size* of choir's gap (2.5 points vs 15 points) enough
that the 8.75-point pooled figure should be read as "a real, modest difficulty increase
on this kit," not as a precise number — a fuller power sweep (the CLAUDE.md two-pass
discipline run all the way to a stable plateau, the way the boss-telegraph check's 40-
seed count was derived) would sharpen it, and would cost a comparable multiple of the
~10 minutes this comparison took across four 40-seed blocks.

## Disposition

**Shipped as-is, not rebalanced.** The size of the swing tracks how summon-heavy a kit
is, exactly as expected before measuring — small on a light-summon boss, real but not
drastic on a heavier one, and unmeasurable (bot can't reach it) on the heaviest. Per this
repo's standing pattern for a fix that turns out to double as a balance decision: the
correctness fix and any retune are two separate commits, and a modest, kit-dependent
swing on already-shipped encounters is the kind of thing to bring to the owner as a
number rather than to quietly compensate for inside the same change. If a rebalance is
wanted later (tightening a summon-heavy phase's `addsOnEnter` or `cooldown`, for
instance, now that adds are no longer self-culling), this document and
`tools/friendlyfire-measure.ts` are the starting point — rerun it after any such change
and compare against the `fixed` row above, not against `master`, since `master` is the
pre-fix number.
