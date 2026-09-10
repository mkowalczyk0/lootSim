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

## A seventh instance, found the same day: `kill` reporting success it can't see

A background gate got piped through `grep | head`; `head` closed the pipe early, the
shell reported the job done, and the actual `esbuild`/`node` children kept running
detached rather than exiting. Re-launching the same gate twice more without checking
`ps` first left three copies of `smoke.mjs` pinning cores — during the one window this
project has ever had the owner and a co-op partner both live on the same dev server,
which made the contention itself a false positive for the exact symptom (input lag)
their session was trying to characterise.

The instrument here is not the gate — it's the **kill/exit signal itself**. A shell
reporting a background job as finished, or a `kill` call returning without error, is a
claim about a process tree it did not actually inspect: it knows a signal was sent (or a
pipe closed), not that every descendant actually exited. The same question this document
has been asking of every other instrument applies to process-lifecycle tools too — *if
the child had survived the signal, would this call have told me?* Here the honest
answer was no, and the only thing that closed the gap was checking `ps`/`lsof` for the
actual process and its cwd after the fact, the same way every other entry in this
document was only settled by measuring the real thing rather than trusting the report
about it.

**How to apply:** after backgrounding, piping through `head`, or killing a long-running
process, verify with `ps` (and `lsof -p <pid>` for cwd, when multiple worktrees could be
confused for each other) that nothing of yours survived — don't trust an exit code or a
"done" message on a job you didn't watch die. This bit twice in one project today: once
as a resource-contention incident during a live measurement, and once earlier in the
same family as the shared-`node_modules/.cache` hazard (item 6) — a killed job's orphaned
child can go on writing to that same shared bundle path exactly as a live one would.

## An eighth instance, three days later: the de-jitter buffer that reached a player

The de-jitter buffer landed with `tools/mp-jitter.ts` — a modelled network link — written
in the same commit as the fix it was built to validate, and every number it produced
agreed with the fix. Days later, the first human to actually play behind it disagreed
within minutes: the client was measurably worse, stuttering *and* delayed at the same
time. It was reverted (`fix/revert-buffer`).

The root cause matches the symptom exactly. Playout was clocked off the simulation tick
rather than wall clock, and the fixed-timestep loop's own spiral guard discards leftover
time when a frame runs long — so a client running below 60Hz permanently loses netClock
time on every tick it drops. Arrivals then outpace playout, the buffer's queue overflows,
and several snapshots get applied in one tick to catch up: the exact stutter-and-delay
pairing the player reported. The buffer coupled network smoothness to frame rate, and it
did so worst on precisely the busy floors where a player is most likely to be dropping
frames in the first place.

That's a real bug with a real fix, and it isn't the entry. The entry is that
`tools/mp-jitter.ts` — the only instrument that ever cleared this buffer — was written in
the same commit as the buffer itself, modelling the link the buffer was designed against.
Bound, scope and subject all came from the thing under test: CLAUDE.md's fourth lesson, a
few days old at the time, in the one place in the project nobody had checked it against.
The instrument and the defect shared an author, a commit, and a model of the world, so
every measurement it ever produced agreed with itself by construction — there was no way
for this check to fail, which is a different thing from the buffer having no bugs.

Run this document's own catching question against it: *if the defect were true right now,
would this instrument's number be any different?* No — because the instrument's model of a
real link **was** the fix's model of a real link. Nothing external to the pair could ever
have disagreed with it, which is exactly what item 1 in the six above already found for
`mp-stutter.ts` (localhost, zero jitter) — the same shape, but this time the flawed
instrument wasn't caught by a session asking the question before it shipped. It was caught
by a person playing the game, which is the expensive way to catch it and the reason this
instance belongs in the file even though it arrived after the file was written: it's the
same failure the other seven describe, priced in stutter a real player felt rather than in
a docket item nearly closed.

## A ninth instance, in the same family as the seventh: a wrapper's exit code answers the wrong question

A background `npm test` gate was wrapped as `npm test > log 2>&1; echo GATE_EXIT=$?`, and the
harness's own background-task notification reported it "completed, exit code 0." That was
true and meant nothing: the run had been SIGKILL'd mid-`smoke` by an unrelated CPU-contention
freeze, and the wrapper shell exiting cleanly afterward is a claim about the *shell*, not
about the `npm test` process it launched. The `echo` that would have printed a `GATE_EXIT=`
line into the log never ran, because the shell's own next statement never executed on a
process that was already dead — the log's missing line was the tell, not the exit code the
harness surfaced.

This is item 7's question again, one layer up. Item 7 found that a `kill` call or a
"job finished" report is a claim about a process tree the shell never actually inspected;
this is the same gap at the other end of a run's lifecycle — a wrapper's own exit code
answers "did my process reach its next statement," not "did the command inside it succeed,"
and the two only agree when nothing kills the child out from under the wrapper. A gate that
reports 0 because the shell reached its own `echo`, and a gate that reports 0 because the
command actually passed, are indistinguishable from the caller's side unless the caller checks
for the command's own terminal signal — here, the printed `GATE_EXIT=` line — rather than
trusting the wrapper's.

**How to apply:** a wrapper around a long-running command needs its own printed or written
result (an exit-code line, a status file, a sentinel written only on the wrapped command's
own exit) that the wrapper's *own* success cannot fake by simply reaching the next statement.
The absence of that marker is the finding, not a shell-level exit code that only ever proves
the shell kept running.

## A tenth instance, a different species: a fixture that never built the state, hidden by a bound with room for it

`tools/smoke.ts`'s Standards check banked `raidChallengerBadges["raid-the-ferryman"]` to prove a
character flying a raid-earned mark keeps a byte-identical sheet. The real raid id is
`the-ferryman`; `standardsFor`'s `RAIDS.find` never matched, so the fixture built a character
who had earned five marks while believing it had built one who'd earned six. The raid-mark
render path — the whole reason that line existed — had zero evidence behind it, in a commit
already marked approved.

Nothing here is an instrument that couldn't see a failure — every entry above this one is. This
is a fixture that never constructed the state it claimed to construct. Read alone, this would
have been fatal: `marks.length` came back 5, and the check next to it read `marks.length >= 5`.
Five passing a five-mark floor and five passing a six-mark reality print identically. The bound
had slack for exactly the amount the typo cost, which is not a coincidence worth admiring — a
threshold with any slack in it will always have *some* amount of missing coverage it cannot
distinguish from the real thing, and here the missing amount happened to fit.

**Two failures, and either alone was harmless.** A fixture bug behind an exact-count check goes
red immediately — the whole reason a fixture-construction defect is usually cheap to catch. A
loose bound on a correctly-built fixture never encounters the gap in the first place. It took
both at once — the wrong id and the room for it — to reach a green run that had exercised four
of the five families it named, with a floor generous enough not to notice the fifth was ever
missing. Every prior entry in this document is one blind instrument; this one is two
sighted-looking pieces that were only blind together.

The fix is the same shape this document already argues for twice over: the wrong id corrected,
the `>=` tightened to `=== 6` — a bound the fixture cannot silently undershoot without the check
itself saying so — and the mark ids printed alongside the count, so a future gap in this same
family is visible in the output rather than requiring someone to re-derive which five marks a
six-mark fixture actually produced.

## Proposed for the owner, not adopted here

`CLAUDE.md` already carries the two rules quoted above, in the difficulty-philosophy
section. If a line belongs there, it's short and sits next to them:

> Before quoting a check's number, ask whether you have ever watched it change in
> response to the thing you're worried about — on this instrument, recently, on purpose.
> If not, you don't know that it can. This applies as much to a check you wrote an hour
> ago as to one you inherited.
