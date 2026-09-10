# Re-baselining the acceptance gate: the harness never spent a tree point

Status: **the measurement half of `fix/arm-the-trees`.** The code half arms both trees in
`geared()` and `campaign()`; this is what moved, and why each moved number is what it is.
Authorised by the owner as a deliberate one-off re-baseline: *"painful once, honest
afterward."*

## The defect

`geared()` in `tools/bot.ts` spent **no class-tree point**, spent **no universal point**,
and **never set a frontier** — so `GameState.universalPoints` was `0` and the universal
half could not have spent anything even if it had tried. `campaign()` finished a 20-dive
run holding 4–6 unspent class points and 2–5 unspent universal points.

`docs/progression-architecture.md` says the class tree is most of what a class *is*. So
**every campaign depth, balance threshold and difficulty figure this repo has ever quoted
described a character with an empty build.**

It did not present as a broken harness. It presented as a disagreement about a *game*
number: `tools/powercurve.ts` read depth 28 as needing level 90 in Legendary gear where
`docs/difficulty-curves.md` §3 measured a 4/4 clear at level 45. `tools/curves.ts`'s own
`character()` has always armed both trees; nothing built on `geared()` ever had, and the
two had never been compared. Armed, the sweep reads 35 and they agree — **a 55-level
disagreement that was entirely whether the character had a build.**

## Conditions

After tonight, every number in this repo should be able to answer "was this measured on a
quiet machine". This one's answer:

- **Both arms captured on `5c0ebaf`**, deliberately, and the branch was later rebased onto
  `37a97a2`. A controlled comparison needs both sides to share a base, not for that base to
  be newest; re-capturing on every new master is a treadmill.
- **Baseline** captured alongside one other session's gate. **No live player.** One of my
  own orphaned `tsx` probes — running 2h13m from a previous session — was pinning a core
  for part of it and was killed **mid-run**.
- **Armed capture** alongside the same other gate. No live player.
- **Determinism verified rather than assumed**, precisely because the orphan died mid-run:
  two floor-playing stages (`rules`, `monstersets`) re-run under a deliberate 2× load swing
  (load 7.10 → 13.83) came back **byte-identical**. The simulation is a fixed timestep on a
  seeded `Rng`; contention costs wall-clock, not results. **Stated limit:** two stages
  verified; the full smoke campaign is *inferred* from shared machinery, not measured.

## What moved

**3641 checks before, 3641 after. 3 status changes. 59 numbers moved. 0 checks
disappeared. 0 new checks.** The two zeros were looked for and are reported as zeros; a
vanished check under a re-baseline is the second-best place for a regression to hide.

Representative moved numbers, all explained by a stronger character:

```
  sharp campaign depth        12.1 -> 13.7      reckless   9.6 -> 10.5
  deaths across 240 dives      448 -> 406       boss fight  51s -> 45s
  tree changes how it plays   2 muts, 1 rule -> 9 muts, 8 rules
  respec hands points back       5 -> 15 refunded
  Convergence unlocks        32/60 -> 36/60
```

The +1.6 sharp / +0.9 reckless shift sits close to an earlier pass's independently measured
**+3.29 depths over 24 seeds** for the same change — a different seed set, same direction
and rough magnitude.

## The three reds, classified in words

Per the standing rule: every red is either "explained by a stronger character" or "not
explained", and **nothing is widened silently**. All three landed in the second bucket.

### 1. `Engineer: THE ULTIMATE RULE` (meter 0.0 → 2.0) — a real game bug

Not a fixture artifact. An armed Engineer's ultimate refills its own meter, because the
ultimate *summons constructs* and a construct's damage packets carry no `fromUltimate`
stamp, so the runtime guard never sees them. **Pinned by name, not fixed**, in
`tools/legends.ts`'s idiom: a second class self-refilling goes red, and silently fixing the
Engineer without removing the pin goes red too. Full diagnosis, the sweep of all 21
classes, and three fix options with **no number proposed**:
`docs/engineer-ultimate-loop.md`.

### 2. `a whole path can be walked` (5/5 → 0/5 nodes) — fixture contamination

The check builds a character and then allocates five tree nodes itself. Armed, the points
were already spent, so every `allocate` returned false. The tree is fine; the check had
nothing left to allocate.

**Fixed by respeccing the fixture. The 5/5 bound is unchanged.** Lowering it would have
turned the red green and left the check permanently unable to notice a path that genuinely
cannot be walked.

### 3. `a climb never touched the account's depth record` — fixture contamination

The Tower section asserts `deepestDepth === 0` after a climb — the "a height is not a
depth" invariant. `geared()` now sets a frontier so it has universal points to spend, which
writes that record before the climb begins.

**The game invariant is intact; the harness poisoned the record.** Fixed by zeroing both
records in the fixture. **The `=== 0` assertion is unchanged.** Widening it to `<= 21`
would have masked exactly the regression the check exists for.

## The one that stayed green and stopped meaning anything

`the elite cap holds on an ordinary early floor` moved `1 at once` → `0 at once`. **A cap
holds trivially over an empty set.** It was green, and it was measuring nothing.

The seed matters, so it is recorded: the check sampled **one** floor, seed **909**. Widened
to five seeds, the readings are **`0/1/1/1/1`** — four floors produce an elite and **909,
the one it was standing on, does not.** So this was not a check merely *capable* of going
vacuous. On its own sample it already had, and it would have gone on passing indefinitely.

Fixed with two clauses: assert an elite was actually produced *somewhere*, then assert the
cap held *everywhere*. **A check must not be satisfiable by an empty set.**

Watching a check convert from real to vacuous inside a single commit, in front of us, is
the most concrete evidence this project has that a green can be worth nothing.

## The instrument that reported it, and its own blind spot

The before/after came from a differ that normalises volatile fields (session cookies,
generated ids, epoch timestamps, per-run timings) and reports only checks whose **status or
numbers** changed, plus any that **appeared or disappeared**.

**It was blind when first written.** It reported "no status changes" while the run's own
summary said `3 CHECK(S) FAILED`: the line regex required two leading spaces, and while
`ok` has two, **`FAIL` has one** — so the section the tool exists for was structurally
unreachable. It produced a confident all-clear.

It was caught by a cross-check worth reusing: **does the tool's conclusion agree with the
raw output's own count?** The run said three failures; the tool said none; one of them was
wrong. That question costs nothing and is the cheapest guard available against an
instrument that runs and cannot see.

## What this commit does not claim

- **Absolute numbers here are `5c0ebaf`'s.** A fresh gate on a later master will differ;
  the *delta* attributable to arming is what was measured.
- **`townVisit()` is untouched.** It is shared with `tools/universal-reachability.ts`, and
  changing it would have moved a second instrument in the same commit with no way to
  attribute a red to either.
- **The greedy allocation is not an optimal build.** It will take a keystone whose downside
  a real player might refuse. It is a floor on what a built character has, not a ceiling.
- **The Engineer bug is recorded, not fixed**, and its fix is an owner decision.
