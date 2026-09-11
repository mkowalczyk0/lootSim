# Ultimate uptime across the roster — the outlier is not the reported class

The owner reported: *"Paladin needs a cooldown on his ultimate — you can infinitely live if
you get it up enough times."* This is the measurement that was supposed to size that, and it
found something else.

`npm run ultimate-uptime`. Depth 22, level 40, 4 seeds, dodge 0.55, all 21 classes.

## Three things established before any number meant anything

- **`cooldown: 0` is not the defect.** All 21 ultimates in the game are `cooldown: 0` — they
  are gated by a charge meter, not a cooldown. Sizing a cooldown for Paladin alone would be
  a roster inconsistency, not a fix.
- **The proposed `under_oath` loop does not exist.** The suggested mechanism was that Last
  Light's death-guard feeds `damagePrevented`, which feeds the meter that recasts it. It
  doesn't: `dungeon.ts` computes `prevented` **before** the death-guard clamp, and the clamp
  only ever reduces `dealt`. Damage the guard absorbs is never counted as prevented.
- **Depth 14 measures nothing.** A Paladin there never charges at all — peak meter 23–58%
  over a 240s floor, **zero casts**, at levels 40 and 60 and at dodge 0.00 / 0.25 / 0.55
  alike. A row pinned at zero cannot move in either direction. The instrument was checked
  first (Juggernaut saturates on the same floors in half the time), so this is the game, not
  the harness. Depth 22 is where the question can actually be asked.

## What Paladin actually reads

| | |
|---|---|
| ultimates per minute | **0.75** |
| rank on the roster | **16 of 21** |
| versus the roster median (2.47/min) | **0.30×** |
| share of floor time under `under_oath` | **12.0%** |

**Paladin's ultimate is in the bottom third of the roster for frequency.** The complaint is
not about frequency. What 12% means is that on a floor that is beating you, roughly one
second in eight is spent unable to fall below 1 HP — and that share *rises* the harder you
are hit, because of the mechanism below.

`under_oath%` reads 0.0 for all twenty other classes, which is the sanity check that the
column is measuring what it claims.

### The mechanism, which is strange and looks deliberate

Paladin's meter is fed only by `damagePrevented`, at `perUnit: "maxHealthFraction"`. The gain
per hit is therefore *(what your armour and ward ate) / (your max health)*, so:

- **bigger incoming hits charge it faster** — nothing at depth 14, saturated at depth 22;
- **a bigger health pool charges it slower** — a level 60 Paladin fires *less* often than a
  level 40 on the same floor.

That is the owner's sentence as a formula: the harder you are being hit, the sooner you can
cast it again. The ultimate is most available exactly when you are being overwhelmed, which
is when six seconds of "cannot fall below 1 HP" is worth most.

There is a real positive feedback here, but **the ultimate is not in it**: ward absorption
counts as `damagePrevented`; `damagePrevented` feeds both the ultimate meter (40) and
Conviction (50); Conviction above 60 grants `wardPower +0.15`; a bigger ward prevents more.
That loop runs whether or not Last Light is ever cast.

## The finding: the Lancer fires one ultimate every 1.2 seconds

| class | ultimates/min |
|---|---|
| **lancer** | **51.7 measured directly (106 casts in 123.1s)** |
| warlock | 18.1 |
| ranger | 14.7 |
| engineer | 12.2 |
| *roster median* | *2.47* |
| paladin | 0.75 |

`LANCER_ULTIMATE_METER` generates `{ on: "move", amount: 0.6, perUnit: "distance" }` against
a `max` of 100 — so **167 units of movement fills the ultimate**, and a Lancer that is simply
walking charges it continuously. Sampling the meter every ten seconds shows it cycling
(0.37 → 0.92 → 0.27 → 0.15 → 0.44 → 0.02 → …) rather than sitting anywhere.

This is **roughly 21× the roster median, and four to eight times the Engineer's** — the
Engineer being docket §27's known, pinned, still-unfixed self-refilling ultimate. It is not
even a loop: the ultimate does not feed itself, the generation rate is simply out of scale
with everything else.

### Verified, because a number this extreme is usually an instrument

1. **Two independent counters agree exactly.** The first counted meter edges
   (charged → not-charged); it was rewritten to count the combat bus's own `ultimateUse`
   *because* 58/min looked wrong. The re-run returned byte-identical numbers for all 21
   classes, 532 Lancer casts included. They agree because a cast empties the meter, so one
   edge is one cast — two subjects, one answer.
2. **It is not this branch.** The same probe run against `master` in a detached worktree
   returns **106 casts in 123.1s**, identical. `fix/no-mapwipe` touches `to: "enemies"`
   reach and nothing about resources, and Meteor Lance carries no `to: "enemies"` step.
3. **The meter samples show continuous refill**, not a single stuck-at-full reading.

### The §10 guard cannot see it, which is the third confirmation of blind-instruments §18

`tools/smoke.ts`'s "the ultimate meter cannot pay for itself" filters on
`perUnit === "damage"`. Lancer's rule is `perUnit: "distance"`. It is outside the filter,
like Paladin's `maxHealthFraction` and like the Engineer's tagged rule — **the guard examines
1 of the 41 ultimate-meter generation rules in the game**, and the worst offender in the
roster sits outside it.

## Proposals — not implemented, and the recommendation is to reorder the work

**On Paladin.** Do not touch the meter rate. It is already bottom-third, and a flat 40 → 25
would make the ultimate *unreachable* at ordinary depths where it is already unreachable
while only slightly rarer where it is a problem. If 12% guard uptime is too much, the direct
lever is `STATUS_UNDER_OATH.baseDuration` (currently 6s), which moves exactly the thing
reported and nothing else. Damping the Conviction → `wardPower` → prevented feedback is the
other candidate and is a bigger change to the class's identity; a tank charging by tanking is
the design, and the loop is the generator feeding the thing that amplifies the generator.

**On the Lancer.** This is the one worth the owner's attention first. Options, cheapest
first: drop `amount` from 0.6 to something that makes a full meter a real distance
(0.06 would make it ~1,700 units, roughly a floor's traverse); or move the generation off
`move` and onto `hitDealt[charge]`, which the class's own comment says is the intent —
*"earns the ultimate by covering ground and connecting charges — never by standing and
swinging."* Covering ground is currently sufficient on its own.

**On the guard.** The §10 data-shape check should filter on *any* generation rule whose
event the meter's own ultimate can cause, not on `perUnit === "damage"`. That is the
structural fix and it would have caught all three of these.

## Caveats on the table

Most classes failed to clear the floor at this depth and level (Paladin and Juggernaut both
hit the 300s cap at 0/4; several others 0/4 in short fights), so cross-class `casts/min` is
measured over very different fight lengths and outcomes. It is indicative for the mid-table.
**The Lancer and Paladin figures are the two that were verified separately** and do not rest
on that comparison.
