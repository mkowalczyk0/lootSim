# The Abyssal Rift's artifact draw: a number that inflated by itself

**Approved by the owner, 2026-09-10**, off the back of the measurement in
`docs/relic-economy.md`: the Abyssal Rift paid a relic-tier item on **92.1% of tier-1 clears
and 99.2% of tier-8 clears**. Nobody authored that. It rose on its own every time an artifact
was added to the game.

| Abyssal Rift, P(any relic-tier per clear) | t1 | t4 | t8 | t12 |
|---|---|---|---|---|
| **before** | 92.1% | 97.4% | 99.2% | 99.7% |
| **after** | 34.7% | 43.1% | 55.1% | 62.5% |

Measured through the real `rollRelicDrops`; the analytic model and a 40,000-trial Monte Carlo
agree to within half a point on every row.

---

## The mechanism, not the number

`rollTable` rolls **every matching definition independently**. That is right for a table of
distinct chases — two different named items can land in the same cache — but it means the
odds an event pays *anything* grow with how many definitions match it. Fifteen artifacts
match one Abyss boss, each at ~14%, so the boss alone paid an artifact
`1 - 0.86¹⁵ ≈ 89%` of the time.

The defect is not that 14% is too high. It is that **14% was never the number the player
experienced**, and the gap between the constant and the experience widened on its own
whenever content landed. That is the same defect the raid fix addressed
(`docs/relic-economy.md` §2), and it applies here with more force, because this one
re-inflates without anyone touching a file.

So the fix had to be the mechanism. **A constant lowered tonight would pass a threshold and
be wrong again on the twenty-fourth artifact.**

## What was built: an opt-in drop pool

`DropPool` in `data/drops.ts`. Sources sharing a `pool` id have every member's chance
multiplied by **one shared factor**, chosen so that the odds the event pays *anything* equal
the **maximum** chance any single member declares. Every member still rolls its own dice.

- **A pool narrows the odds; it does not elect a winner.** See "The mechanism this replaced"
  below — the first attempt did elect one, and the acceptance suite refused it.
- The factor is found by bisection (`poolScale`): the equation has no closed form for
  heterogeneous chances. For a single member it is exactly 1, which is why a pool of one is a
  safe no-op.
- **Max, not sum.** A sum is precisely the quantity that grows with the roster; a max cannot.
  `abyssBoss: 0.14` now means what a reader already believed it meant — "an Abyss boss pays
  an artifact 14% of the time".
- **§16 still works.** A `minTier` member with better odds (`abyssBossHigh: 0.16`) raises the
  pool's rate when it qualifies, so a higher tier genuinely draws better — asserted.
- **Opt-in, deliberately.** Making pooling the default would also have changed the Nameless
  (2 definitions on one kill) and the Tower cache (2). Neither is in scope and neither has
  been complained about. A source has to ask.

Two pools exist: `abyss-artifact` (26 sources) and `abyss-relic` (2 sources). The second is a
**no-op today** — `abyssDeep` has one definition, and a pool of one pays exactly what it
always paid — declared so a second deep-Abyss relic cannot silently reintroduce the defect.

## The checks (`npm run relics` §6c)

Equalities and comparisons, never thresholds:

1. **`an Abyss boss pays an artifact at exactly the odds RELIC_ODDS states (14.0%)`** — the
   headline equality between the constant and the composed union, across 11 matching
   definitions.
2. **`a twenty-fourth artifact joining the pool does not raise the odds at all`** — the
   structural property, asserted by injecting a fake source rather than by reasoning.
3. **`the pooled draw is strictly stingier than rolling every definition separately`** —
   14.0% against 81.0%, stating the improvement rather than bounding the result.
4. **`a tier that opens a better member still raises the draw`** — 14.0% → 16.0% at equal
   danger, so §16 survives.
5. **`no pool reaches the Nameless, the deep Delve cache or the Tower`** — scope asserted
   positively, printing what it walked.

**Falsified by injection**: removing one artifact source from the pool reds check 1 at
**26.0%** against the authored 14.0%.

## The mechanism this replaced, and the check that refused it

The first implementation made a pool **elect a single winner**: one roll at the pool's rate,
then a weighted pick. It produced exactly the same per-clear numbers as what shipped — 34.7%
at tier 1, identical on every row — and it was wrong.

`npm run relics` went red on four checks, two of them root causes:

```
FAIL  with the dice rigged, the Abyss Choir pays out every artifact it lists  — 1
FAIL  killing the Abyss choir drops every artifact it lists (12)  — tempo-of-the-fifth-circle
```

An Abyss boss has always been able to pay **more than one artifact** from a single kill, and
`rollTable`'s own documentation says why that is correct: relics are a table of *distinct
chases*, and "two can land in the same cache" is the defining property of that shape.
Winner-takes-all removed it silently — a player-visible change to the Abyss well beyond the
drop rate the owner approved, arriving as a side effect of a mechanism chosen for an
unrelated reason.

**The checks were right and the code was wrong.** Rewriting those two assertions to expect
one artifact would have turned the suite green and shipped an unapproved design change behind
a measurement everyone had already agreed to — the "talking a red check down" failure named
in `CLAUDE.md`, where a written argument stands in for the property it claims.

The scaled pool keeps both properties at once: the union is the authored number *and* two
artifacts can still land together, just far more rarely. Same approved outcome, nothing else
moved.

## A coincidence in the resulting number, before anyone meets it in play

**The Abyss now pays 34.7% per clear at tier 1. The complaint that started all of this was
raids at 32.8% per clear**, which the owner called *"damn near guaranteed"*.

Those are nearly the same number and whoever reads this next will notice. The comparison is
not like-for-like: **a raid clear is one floor and an Abyss clear is five.** Per floor the
Abyss is now ~8.2% against a raid's 18% — roughly five times stingier per unit of effort than
the thing that was complained about, and effort is what a player actually spends.

**This was deliberately not re-tuned on that observation.** The owner approved "bring it
down" having seen these numbers, and adjusting again on a coincidence would turn a measured
change into a guess. It should be judged in play.

One possibility worth holding while judging it: **the original "damn near guaranteed" may
never have been about 33% at all.** Every figure here is a *first-clear* number, the roll
skips what the account already owns, and nobody has established how much of the roster the
owner holds. A player early in a collection experiences a very different rate from the steady
state, so the complaint may describe a phase rather than a constant.

## One instrument correction worth recording

`tools/relicunion.ts` caught its own analytic model going stale the moment the pools landed:
it reported `92.1% … [sampled 34.5% <-- MODEL DISAGREES]`. The Monte Carlo runs through the
real `rollRelicDrops`, the closed-form model did not know about pools, and the tool's
disagreement flag fired rather than the number quietly drifting.

That is the entire reason the sampled column exists, and it paid for itself the first time
the code under it changed. The model is now pool-aware and the two agree again. **A
closed-form model of a roll site is an instrument that can go blind without erroring** — the
cross-check is what makes it safe to read.

## Scope

Untouched, and asserted untouched: the Proving, the Nameless, the depth-30 Delve cache, the
Tower cache, every named item, and every augment. Raids are not in this branch — that fix
lives on `fix/relic-economy`.

**Is a raid now the best artifact source?** Per *floor*, yes and decisively: a raid clear is
one floor at 18% (after `fix/relic-economy`) against the Abyss's ~8.2% per floor. Per *clear*
the Abyss is still higher (34.7% against 18%), which is defensible — it is five floors of
work. Both branches have to land before that comparison is live, so it is stated here rather
than asserted as a check on either branch alone.
