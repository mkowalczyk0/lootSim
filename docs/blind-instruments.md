# Blind instruments

Six checks, all in one day (2026-09-10), all wrong in the same way: none of them was
*broken*. Every one ran, produced a plausible number, and was structurally incapable of
seeing the thing it was being asked about. CLAUDE.md already names this failure mode —
twice, from two different incidents, months apart — and neither statement of the rule
stopped any of today's six. This document is about why, and about the one question that
would have.

## The six

**1. Localhost cannot see multiplayer jitter.** `tools/mp-stutter.ts` cleared host
compute and client render load with real numbers from a real two-browser rig — but the
rig ran over `localhost`: 0 ms RTT, zero jitter, zero packet loss. The owner's actual
report (stuttering on a real internet path) was, by construction, a condition this
harness could not produce. Falsified by testing over a real link; now red, and the
finding is annotated in place in `docs/mp-stuttering.md` rather than treated as closed.

**2. An omniscient bot cannot measure "find the last monster."** `tools/bot.ts`'s target
selection (`for (const e of d.enemies)`, no line-of-sight filter) picks the nearest live
enemy by straight-line distance through walls. Its reported 1.1s to find the last monster
on a floor is how fast an agent who already knows exactly where everything is can walk
there. The player's actual problem — a floor with one monster left and no idea which
room it's in — is a *search* problem, and the bot has never once had to search. A docket
item about this was nearly closed on that 1.1s figure.

**3. "Never tugged back" was measured at zero jitter.** The co-op reconciliation check in
`tools/smoke.ts` (`a walking client is never tugged back by the host`) runs at a fixed
`LAG` constant — a single, unvarying round-trip time, no jitter, no loss, no reordering.
The number it reports (median 0.02px, worst 0.04px) is real and the fix it validates is
real, but the check has never been asked what happens when a packet arrives late,
early, or not at all — which is the actual shape of a real connection, and the same gap
item 1 has.

**4. `recommendedLevel`'s equip-floor term outlived the rule that justified it.**
`profileFor`'s level advice carried a term (`d + reward.itemPower - 1`) whose comment
said, correctly, that it existed because a drop's required level could exceed a plain
depth-based estimate. §23 changed how item level is rolled and repealed that premise
entirely — no floor can pay out gear its earner cannot equip anymore — and the comment
was fixed, but the *term* was not, because nothing tied the term's continued existence
to the premise's continued truth. It stayed green because at ordinary difficulty
(`danger` 1) the term reduces to the same value it always had; it only diverges where
danger is up, which most runs of the game's own acceptance suite never exercise. Nothing
in `game/` even reads `recommendedLevel` — it is UI advice text — so no check could ever
have gone red here, in either direction, which is the actual finding.

**5. `geared()` arms no tree points.** `tools/bot.ts`'s character builder levels a
character, opens chests, and equips the best gear found — and never allocates a single
class-tree or universal-tree node. Every character `tools/smoke.ts` has ever measured a
class's build with has fought as a bare stat-and-gear shell, in a game whose own
architecture doc calls the class tree "most of what a class is." The sibling builder in
`tools/curves.ts`, written for a different purpose, has allocated both trees since it was
written. The two functions existed side by side for the whole project and nobody had
ever diffed what they actually built.

**6. The shared `node_modules/.cache` bundle path.** Every acceptance script is
`esbuild tools/X.ts --outfile=node_modules/.cache/X.mjs && node node_modules/.cache/X.mjs`
— a fixed, relative output path. Two worktrees sharing a `node_modules` (by symlink, or
by running commands in the same checkout) write and execute the *same* bundle file, so
one session's `esbuild` can overwrite the file mid-read by another session's already-running
`node`. The gate that comes back is green or red for a tree that was never actually the
one under test. This one sits underneath all five of the others: any of them could have
been measured on a raced bundle and nobody would have been able to tell from the output
alone. Independently reproduced twice the same day, by two sessions who hadn't compared
notes — and then a third time, by the session who wrote up the rule against it. Having
just authored the broadcast explaining the exact mechanism, they symlinked `node_modules`
into the worktree they were about to certify a merge in, inside the same hour. That is
this document's own thesis proving itself rather than being argued for: the rule was
correctly stated, understood, and broadcast, and it still didn't survive contact with the
next worktree, because "I know this rule" and "I am actively holding it while I run this
specific command" are different states and only the second one protects anything.

## Two near-misses, because they show the catching mechanism itself needs scrutiny

**A falsification that didn't take still returns a confident zero.** Verifying the
elite-bar fix, one control run filtered `d.enemies` to remove the boss and expected the
boss frame to disappear. It didn't — `Dungeon.boss` is a separate field the HUD branches
on, so the filtered enemy list changed nothing the draw path reads, and the control
returned a **zero-pixel diff**. Read at face value, that zero says "confirmed: no boss
frame drawn." What it actually says is "my attempted violation never reached the code
under test." Nulling `d.boss` directly produced an 11,787px difference — the real
control. A falsification is not evidence until you've confirmed the thing you injected
was capable of changing the output at all, which is the same rule CLAUDE.md already
states for a determinism check (the injected violation has to actually consume or
reorder the shared `Rng` stream, or touch a field the comparison reads) — this is that
rule again, one layer up, applied to the counterfactual test rather than to the check it
was testing.

**A real, honest number can still be the wrong number to have asked for.** Measuring
whether a build change increased damage output, clear-time-per-floor read a 2.67×
damage gain back as a 1.23× "throughput" gain. Nothing was wrong with the measurement —
past roughly level 25, a floor's clear time is paced by spawn-wave cadence and travel
between rooms, not by how fast anything dies, so a large damage swing mostly disappears
into a number dominated by something else entirely. This is the same shape as the
`docs/raid-party-scaling.md` finding CLAUDE.md already carries ("damage-per-player
silently lies when the fight's length is itself part of what you changed") — a metric
that is honestly computed and confounded by a variable nobody controlled for.

## Why the existing rule didn't stop any of this

CLAUDE.md already says, twice, in language written for exactly this problem:

> A check's bound, its scope, and its subject must all come from somewhere other than the
> thing under test.

> A measurement harness that runs but is blind returns a plausible number rather than an
> error, which is worse than a red check.

Both are true and neither prevented a single one of today's six. Here is the working
hypothesis, put to the PM as an argument rather than a conclusion: **the existing rule
is advice for someone *writing* a check. Every one of today's six was a check someone
*inherited* and trusted.** Nobody sat down today and designed a bot that can see through
walls, or a level formula with a dangling premise, or a shared bundle path — those
choices were made once, reasonably, for a narrower purpose than the one they were later
asked to serve, and every session between then and now cited the number without
re-deriving what the instrument could and couldn't see.

That mostly holds up, and it explains 4, 5, and 6 cleanly — a term whose premise died
under it, a builder nobody had diffed against its sibling, an infrastructure choice
nobody had reason to question. It explains 1 and 3 less cleanly: the mp-stutter harness
and the reconciliation check were both built recently, by sessions working in good
faith on exactly this problem, and the gap is not that they inherited someone else's
blind spot — it's that they never asked what their own rig's environment excluded before
quoting its number. So the sharper version: **"inherited" has to include your own
instrument from an hour ago, the moment you stop actively holding its assumptions in
mind and start just reading its output.** A check written this morning is exactly as
inheritable as one written eight months ago; the only thing that matters is whether you
re-derived its coverage before trusting this particular number, or reused the trust from
last time.

This is not a hypothetical refinement. The session who broadcast item 6's rule —
having just written the mechanism up, in detail, for everyone else on the project —
symlinked `node_modules` into the next worktree they touched, within the hour, while
about to certify the merge that same worktree was for. Knowing the rule and holding it
while running a specific command are different states, and only the second one
protects anything. If a session can lose its own hour-old rule by the next `git
worktree add`, "read the docs first" was never going to be the fix; the fix has to be a
question asked at the moment of use, not knowledge held in general.

**The positive case, so this document isn't pure warning.** The same merge's gate-check
answered its own catching question affirmatively instead of assuming it: the branch
tip's acceptance chain ran 31 `npm run` steps and had neither `chests` nor `execute` in
it; the merge-result gate ran 33 and had both. That is "if the defect were true right
now, would this number be different" checked rather than trusted — a `package.json`
conflict resolution that merely parses is not the same claim as one whose additions were
demonstrably exercised by the gate that certified it, and here the two sides' new steps
were shown present and running rather than assumed present because the JSON was valid.

## The question that catches the seventh

Every fix that worked today, across at least three independent sessions, was some form
of the same move: **inject the thing you're worried about, and watch whether the number
moves.** Not "does this check look right" — that's what all six already looked like.
The question is narrower and answerable:

> **If the defect I'm worried about were true right now, would this instrument's number
> be any different — and have I actually watched that happen, or am I assuming it?**

Run it against all six and it lands every time:

- Localhost jitter check: inject real jitter (a real link) → the number changed. It had
  never been run.
- The bot's last-monster time: inject a wall between the bot and the target → the number
  would change enormously (search vs. a straight line), and asking this question is what
  would have stopped the 1.1s figure from nearly closing a docket item.
- The reconciliation check: inject jitter/loss into the fixed `LAG` → untested, flagged.
- `recommendedLevel`: inject the premise's death (which already happened) → the term's
  *value* doesn't change, because nothing in the formula depends on whether the premise
  is true. That is the finding — not "the check is wrong" but "no instrument in this
  codebase can tell right from wrong here," which correctly redirects the item to a
  decision rather than a measurement.
- `geared()`: inject tree allocation (build with `curves.ts`'s `character()` instead) →
  the numbers move, a lot. Nobody had run that diff before this week.
- The shared cache path: inject a second concurrent run → the bundle a `node` process
  executes is no longer guaranteed to be the one its own `esbuild` just wrote. Watched
  directly (`lsof` on the running process, cwd exclusive to one worktree) rather than
  assumed from "I ran `npm install`."

Three practical forms this took today, worth keeping as a checklist rather than
re-deriving each time:

1. **Falsify it.** Shave a pixel, force the old constant back, null the field a filter
   was supposed to make irrelevant, run the same check on a seed set five separate times.
   If you cannot make the check fail on purpose, you do not know that it can fail at all.
2. **Say what the rig cannot see, out loud, before quoting its number.** "My rig never
   asks a character to fight" is a stronger claim than "I don't think this is affected,"
   because it was established rather than assumed — the difference between a defect that
   *cannot* reach your numbers and one that merely *didn't*, this time, on this input.
3. **Check that your falsification actually landed.** A zero-diff control is not evidence
   the violation is harmless until you've confirmed the violation reached the code path
   being measured at all — otherwise "zero diff" and "the injection never fired" are
   indistinguishable from the outside, which is exactly how the boss-frame control read
   confident and wrong for one run.

None of this is a claim that inherited checks are untrustworthy — most of the acceptance
suite runs every day and catches real regressions. It's a claim about what "green"
licenses you to say. A check that has been falsified recently, on this codebase, against
this defect, licenses "this cannot be happening." A check that has only ever been
observed to pass licenses nothing beyond "nothing has gone wrong on the inputs I've
happened to run" — which is also true of a check that is structurally blind, right up
until someone asks it the one question that would have told the difference.

## Proposed for the owner, not adopted here

`CLAUDE.md` already carries the two rules quoted above, in the difficulty-philosophy
section. If a line belongs there, it's short and sits next to them:

> Before quoting a check's number, ask whether you have ever watched it change in
> response to the thing you're worried about — on this instrument, recently, on purpose.
> If not, you don't know that it can. This applies as much to a check you wrote an hour
> ago as to one you inherited.
