# Blind instruments

Six checks, all in one day (2026-09-10), all wrong in the same way: none of them was
*broken*. Every one ran, produced a plausible number, and was structurally incapable of
seeing the thing it was being asked about. CLAUDE.md already names this failure mode —
twice, from two different incidents, months apart — and neither statement of the rule
stopped any of today's six. This document is about why, and about the one question that
would have.

## Index

One row per entry, naming the **failure shape** rather than the incident. Two uses, and the
second is the one that has actually cost time: find the relevant entry without reading all of
them, and — before writing "and this one is a new species" — check in ten seconds whether the
species is already here. Two entries have already been written past each other, opening with
nearly the same sentence and each claiming to be first of its kind, because there was no list
to look at.

Entries 1–6 are the numbered paragraphs under *The six*; 7 onward are their own sections, in
order. Sections that are not entries — the two near-misses, why the existing rule didn't stop
any of this, the question that catches the seventh, the seen-and-skipped failure, and the
proposal for the owner — are deliberately absent from this table.

| # | The shape | Where it showed up |
| --- | --- | --- |
| 1 | The harness cannot produce the condition that was reported | `tools/mp-stutter.ts` measuring jitter over localhost |
| 2 | The stand-in has an ability the real subject lacks | `tools/bot.ts` targeting through walls, timing a "search" |
| 3 | One fixed constant stands in for a varying condition | the co-op reconciliation check at a single `LAG` |
| 4 | A term outlived the premise that justified it, and nothing reads it | `recommendedLevel`'s equip-floor term |
| 5 | The fixture builds less than what it claims to measure | `geared()` allocating no tree points, for every class ever measured |
| 6 | Two runs share one output path, so the tree measured isn't the tree under test | `node_modules/.cache/X.mjs` across worktrees |
| 7 | A lifecycle report about a process tree nobody inspected | a "job done" shell, and `kill` returning on surviving children |
| 8 | Instrument and fix share an author, a commit, and a model of the world | `tools/mp-jitter.ts` clearing the de-jitter buffer it shipped with |
| 9 | The wrapper's exit code says the shell reached its next statement | `npm test > log; echo EXIT=$?` over a SIGKILL'd run |
| 10 | A fixture that never built the state, behind a bound with room for the gap | `raid-the-ferryman` vs `the-ferryman`, under `>= 5` |
| 11 | A filter over a set that may not contain what you are looking for | `ps \| grep smoke` missing a 2h13m `tsx` probe |
| 12 | A sentinel checked for its presence rather than its content | `GATE_EXIT=` printing empty, `PIPESTATUS` under zsh |
| 13 | The environment the check ran in was never enumerated | worktrees symlinked, installed, or empty — "green here" meaning three things |
| 14 | A buffering filter turns progress and failure alike into silence | `npx tsx … \| tail -25` on a job that had already died |
| 15 | A cast is where the typechecker stops being an instrument | `as unknown as {…}` over a private signature that changed |
| 16 | A sighted instrument aimed at the wrong object | asserting on `raidMateState` rather than `raidClientState` |
| 17 | "No conflict markers" is not "no conflict" | two independent fixes merging into a duplicate `const raid` |
| 18 | The scope was copied from the bug that already shipped | the ultimate-meter guard examining 1 of the 41 rules it walks |
| 19 | A one-directional assertion satisfied by an empty result | `duelist.riposte`, a reactive staged so it never triggered |
| 20 | The injection moved something the comparison does not read | `tools/bosstarget.ts` moving distance while comparing angle |
| 21 | An aggregate is invariant across the mechanism that changed | "at least one" reading identically under winner-takes-all |
| 22 | A design record as the blind instrument — a confident wrong diagnosis, load-bearing for weeks | `docs/engineer-ultimate-loop.md` naming the wrong mechanism |
| 23 | The instrument was right and was read in the wrong units | the ultimate meter reported as a fraction, read as a percentage |
| 24 | A real comparison, correctly phrased, green for a reason unrelated to its claim | the relic level gate's own check |
| 25 | A subject that never survives long enough to be measured | `tools/rewards.ts`'s harvest fixture, dying in 8s on every seed |
| 26 | The blind instrument was inside the process rule itself | `grep -c '^FAIL'`, never correct for any tool in `tools/` |
| 27 | Making a fixed thing variable narrows every existing reader of it | `MINION_CAP_PER_OWNER` becoming modifiable, and `tools/smoke.ts` still asserting the bare constant |
| 28 | The guard was correct, stayed correct, and could never have seen what it guarded | `chroma` measuring the accent while the body was what moved |
| 29 | Two honest detectors that agree on the rule and disagree on the pixel | §1.4's saturation gate vs `chroma`'s scale, on the auto-turret's cream-gold |
| 30 | An annotation that discards the fact the compiler needed | `AFFIX_MOD_IDS` typed `string[]`, holding a deleted `MOD_POOL` id |
| 31 | A stat with no instrument pointed at it at all | `wardPower`, granted by 24 sites and read by none |
| 32 | Noise inventing a plateau, read as a mechanism | a false plateau at 1.95s with the stall beat as its ready-made cause |
| 33 | A bound so cautious it discards a real signal | the execute split's "one packet or several" guard, pooling a per-seed base |
| 34 | *reserved* | held for the co-op cast-prediction work; §33's triage found nothing to fix and wrote no entry |
| 35 | A derivation frozen into a copy, which then stops deriving | `npm run gate` as a literal step list, silently skipping the branch's own new check |
| 36 | A silent narrowing, which converts authored content into evidence of its own absence | `GRANTABLE_ABILITY_IDS`' trailing `.filter`, handing every reader the survivors |
| 37 | A clean merge read as evidence about meaning, when it is only evidence about text | a docket ruling appended 300 lines below the status word it falsified |

The *in flight* rows are numbers already assigned to entries that exist on unmerged
branches. They are left blank on purpose: naming a shape from a text this file does not yet
contain would be a scope taken from somewhere other than the file, which is item 18's defect
committed while documenting it. **Whichever branch lands one of those entries fills in its own
row in the same commit.**

**Adding an entry means adding its row, and the number comes from whoever is integrating —
don't derive it from the highest one you can see.** Both halves are load-bearing. An index that
quietly stops tracking the file is a scope that has silently emptied, reporting a completeness
it no longer has; and a locally-derived ordinal is item 17 reproduced by this document's own
numbering, which is how two of these entries ended up sharing a number.

`npm run blindindex` enforces the first half and half of the second: it parses the entries from
the prose and the rows from the table — **independently, so the table cannot satisfy the check
by agreeing with itself** — and fails on an entry with no row, a filled row with no entry, a
landed entry whose row still reads *in flight*, a gap in the numbering, and two entries claiming
one number. That last one is the collision git merges cleanly and `markers` cannot see. What no
check can enforce is that the number was *assigned* rather than derived: a locally-derived
ordinal that happens not to collide is indistinguishable from an assigned one. Ask anyway.

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

## An eleventh instance, and it priced the others: `ps | grep <name>` is a filter over a set that may not contain the thing you're looking for

Every session running a gate tonight checked `ps` for contention before starting one —
this document's own seventh and ninth entries are about exactly that discipline. All of
them grepped for the shape of work they expected: `smoke`, `npm test`, the branch they
knew was running. One of d8's own `tsx` probes had been pinning a core for **2h13m**,
started before their session was even `/clear`ed, running straight through the owner's
live co-op session — and nobody's `ps | grep` ever surfaced it, because nobody was
grepping for a stray probe. It wasn't hidden; `ps aux` had the line the entire time. It
just never matched anyone's pattern.

This is the seventh/ninth entries' question turned on the *checking method itself*: `ps |
grep <name>` doesn't answer "is the machine busy," it answers "is the machine busy with
something I already thought to name." A grep is a filter, and a filter over a set that
doesn't contain the thing you're looking for returns clean — the same shape as the
seventh entry's `kill` reporting success it can't see, except here the blind spot is in
the *auditor*, not the thing being audited. Every prior "ps first" in this document and
in tonight's coordination was true and incomplete in the same way: it answered for the
named suspects and never asked about the machine as a whole.

**How to apply:** sweep by resource, not by name — `ps aux | awk '$3 > 15'` (CPU%) surfaces
anything hot regardless of whether you expected it to exist. Attribute a surprising PID to
a worktree with `lsof -a -p <pid> -d cwd`, not `ps` — `ps`'s own command-line field had
already caused two sessions to attribute the same PIDs to two different worktrees earlier
tonight, because a relative path or a shared alias reads the same from either checkout.
This is arguably the most expensive instance in the file to date, because it didn't just
cost a wrong number: it cost a wrong premise. "The machine is idle" was stated to two
sessions as an observed fact for over two hours while a core sat pinned the whole time.

## A twelfth instance: a sentinel that satisfies its own remedy while saying nothing

Item 9's fix for a wrapper's exit code was a printed sentinel the wrapper's own success
cannot fake — look for `GATE_EXIT=` rather than trusting a reported code. Tonight a gate
wrapped as `npm test 2>&1 | tail -60; echo "GATE_EXIT=${PIPESTATUS[0]}"` defeated that
remedy while technically complying with it: the line printed. It read `GATE_EXIT=` — the
marker, present, carrying no value.

Two compounding faults, both in one line. `PIPESTATUS` is bash; the shell running it was
zsh, which spells the same thing `pipestatus`, lowercase. `${PIPESTATUS[0]}` under zsh is
not an error and not an unbound-variable failure (an array subscript on an unset array
doesn't trip `set -u`) — it silently expands to the empty string. And even spelled
correctly, a pipeline's exit status is its *last* command's: `npm test | tail` reports
`tail`'s exit code, not `npm test`'s, which always succeeds. Either fault alone would have
been survivable; together they produced a marker that means nothing while looking exactly
like the marker item 9 tells a reader to check for.

**This is a different species from item 9, not a restatement of it, and the difference is
what it defeats.** Item 9 is a supervisor reporting a state it never observed — the
wrapper's own exit code answering the wrong question. This is one layer lower: a shell
builtin silently returning a different process's status than the one named, wrapped in a
portability failure that fails open rather than erroring. It matters specifically because
it defeats the *fix*, not just the original problem: a reader who correctly applies "check
for the sentinel line" and finds `GATE_EXIT=` present would call this gate proven, and be
wrong.

**The generalisation: a sentinel has to be checked for its content, not its presence.**
`grep -q GATE_EXIT` is satisfied by `GATE_EXIT=`; only `GATE_EXIT=0` means anything. An
empty interpolation is close to the worst failure mode available to a marker-based remedy,
because the failure *produces* the marker.

**How to apply:** don't take a gate result through a pipe — `cmd > log 2>&1; echo "EXIT=$?"`
has no pipeline and no array subscript, and the number is the command's own. If a pipe is
unavoidable, `set -o pipefail` first, in the shell that will actually run the command
(bash and zsh do not share `PIPESTATUS`/`pipestatus` syntax). And treat a bare `EXIT=`
with nothing after the `=` as a failed measurement, not a passed run.

**Found by re-reading a command, not by anything going red.** Nothing in the repo caught
this, and the harness's own "exit code 0" was telling the truth about the pipeline it was
actually handed. This document's own catching question — *would this instrument's number
be different if the defect were true?* — doesn't apply here, because nothing measured this
at all; a person looking is the only reason this entry exists, which is evidence for
needing that habit, not evidence that any instrument already in place would have caught it.

**A recurrence, 2026-09-11, by someone who had just read this item.** Verifying the docs
change that added this file's index, the first command run was `npm run markers --silent
2>&1 | tail -5; echo "exit=$?"`. That `$?` is `tail`'s. It printed `exit=0` about a command
whose result it had never seen — this item, verbatim, typed forty minutes after reading it
and while editing the paragraphs above it. Caught the same way the original was, by
re-reading the command rather than by anything going red; the re-run with no pipeline is
where the real zero came from.

It is recorded here rather than as a new entry because it is **not a new species** — it is
this one. An index whose stated purpose is to let an author check that before claiming
otherwise would be badly served by its own author doing the opposite. What the recurrence
adds is evidence about the *remedy* rather than the fault: item 6 already describes its own
author symlinking a `node_modules` within the hour of writing the rule against it, and this
is the second such recurrence in the file, in a different domain, by the person then
holding the write-up in working memory. **Knowing a rule and holding it while typing one
specific command are different states, and only the second one protects anything** — which
is the argument, stated twice now from first-hand evidence, for preferring a rule that
cannot be violated to a rule everyone has read.

## A thirteenth instance, the far end of item 6's family: nobody had enumerated which worktrees could even run a gate

Gating `docs/blind-instruments` itself tonight turned up a worktree with no `node_modules`
at all — never `npm install`ed, because it had only ever been used for editing this file
until tonight asked it to run one. `npm test` died immediately on `sh: tsc: command not
found`.

Zoomed out, this is item 6's collision hazard from the other side. Eleven worktrees
tonight were symlinked into a shared install (item 6's actual hazard — one `esbuild` racing
another's bundle); at least four others, this one included, had no install whatsoever. So
"the gate is green here" was never one claim tonight — depending on which directory a
session happened to be standing in, it meant a real isolated run, a raced shared-cache run,
or nothing ran at all. Nobody had enumerated which worktrees were in which state before
hitting each one in practice, the same shape as item 11's unaudited machine: the variable
existed the whole time and simply hadn't been asked about.

**The saving grace, worth stating precisely because it's the asymmetry that matters:** of
the three states, only the symlinked one is a genuine blind instrument — it produces a
plausible, contaminated green. The empty one failed *loudly*, on the very first step that
needed a binary, with a message that named exactly what was missing. A check that dies
noisily on missing infrastructure is not this document's subject; a check that runs to a
convincing green on missing or wrong infrastructure is. 56's harness fix already closes the
dangerous case (refuses the symlinked path outright); the empty case needed nothing beyond
noticing it, once assumed, was cheap: `npm ci` and a re-run.

## A different failure, and this document has no slot for it: seen and skipped, not unseen

Every entry above is an instrument — human-built or otherwise — that could not see the thing it
was asked about. Tonight also produced a failure of a different shape, and this document's own
organizing question ("what couldn't be seen?") has no slot for it, which is itself the finding.

The de-jitter buffer's own docket entry, `docs/docket.md` §1, already carried this as its third
bullet, written and read before the buffer was built:

> "The host's frame budget. The host runs the whole simulation AND renders. A host who is
> themself dropping frames delivers late snapshots to everyone. Worth separating 'the client
> stutters' from 'the host stutters and the client faithfully reproduces it' — those have
> completely different fixes and only one of them is a networking bug."

(`docs/docket.md` §1, "Multiplayer stuttering," third bullet — check it against the source
rather than this quotation, the same standard this section is about.)

That is the current leading hypothesis for the underlying bug. It was correctly identified, in
the exact document the work was scoped from, and a networking fix got built and shipped anyway
— the buffer, and the harness that validated it (item 8 above), neither of which could ever have
addressed a host that is itself dropping frames, because neither one asks the question that
sentence already asked.

**Nobody was blind here.** Every entry in this document up to this point describes an instrument
that returned a plausible number because it structurally could not see the failure. This is the
opposite: the failure was written down in plain language, in the right place, and the work
proceeded as though it hadn't been. Better instruments do not reach this. `tools/mp-jitter.ts`
could have been built with perfect rigor — an unmodelled real link, an independent author, an
exact bound — and it still would not touch a bug whose actual location is the host's own frame
budget, because the harness was built to answer a question about the network, and the docket had
already named a more likely culprit that was never the network at all.

**The structural point, and it is the reason this is its own section rather than a twelfth
numbered instance:** a post-mortem organized around "what couldn't we see" has no slot for "what
did we see and ignore." The eleven instances above are all findable by asking the catching
question this document already teaches — *would this instrument's number be different if the
defect were true?* That question does not find this one, because nothing about it was a
measurement failure. A write-up of tonight that asked only "what were we blind to" would have
told the flattering half of the story: eleven instances of not-seeing, and nothing about the one
thing that was seen and built past anyway.

**The rule to carry forward, as a check to run on any post-mortem, including this one:**

> When a post-mortem is entirely about what couldn't be seen, check whether something *was* seen
> and skipped. That half doesn't surface on its own.

## A fourteenth instance, a new species: an instrument that returns nothing rather than a wrong number

Attributing a crash between two branches, a session wrote a probe that runs 60 campaign
seeds and prints one line per seed — `seed N: ok` or `seed N: CRASH <message>` — and
launched it as `npx tsx tools/reckless-probe.ts 2>&1 | tail -25`, then watched the output
file. It stayed empty. Eight minutes were spent waiting, on the reasoning that 60 seeds
of dives is genuinely slow — true, and irrelevant, because the process had already died.
`ps aux | awk '$3 > 15'` (item 11's own remedy) found no node process at all, not even
one above 1.5%.

`tail -25` cannot emit a line until its stdin closes, because it has to know which lines
are the last 25. The pipeline swallowed every per-seed line the probe was writing **and**
the error that killed it — the progress output and the failure went into the same hole.
The probe was built to report on completion and then used to monitor liveness, two
different jobs that only the first one was designed for.

Every entry above this one is a check that ran and returned a plausible-but-wrong number.
This one returns no number at all, and the silence read as patience rather than as
absence — arguably worse, because a wrong number at least invites a sanity check, while
silence invites waiting. An empty output file is indistinguishable between "still
running" and "died instantly," and that ambiguity was resolved by assumption rather than
by measurement — the same gap item 7's `kill`/exit-signal entry names for process
lifecycles, one layer up: a *buffering shell construct* silently changing what you're
able to observe, the same family as item 12's `PIPESTATUS`-under-zsh (there it was *what*
exit code got read; here it's *when* output becomes visible at all).

**How to apply:** never put a buffering filter (`tail`, `head`, `sort`, anything that
must see EOF or a full sort key before it can emit) between a long-running job and the
file you intend to watch live. Redirect raw (`cmd > log 2>&1 &`) and filter at *read*
time (`tail -25 log`, rerun as needed) — that costs nothing and keeps progress and
failure on the same visible path. And per item 11: audit liveness by process table
(`ps aux | awk '$3 > 15'`), not by expecting output — the process table answers in one
command what watching a file cannot answer at all.

## A fifteenth instance, a different species again: a cast is a place the typechecker stops being an instrument

Under the owner's shared-loot ruling, a private method's signature changed —
`collect(hero: Hero, p: Pickup)` in `src/game/dungeon.ts` became `collect(p: Pickup)`,
because the method now pays every hero and must not be told who collected the drop.
`npm run check` passed clean. `npm run relics` then failed four checks, all named as
symptoms nowhere near the actual mistake — "picking one up puts it in the run's unbanked
loot," "banking the floor puts it in the collection." The cause was two call sites away:
`tools/relics.ts` reaches private methods through a `rig` helper — a Proxy behind an
`as unknown as { ... }` with a hand-written declaration of the members it wants — and
that declaration still said `collect(hero: Hero, p: Pickup): void`. **The cast is an
assertion, so TypeScript type-checked the call against the stale declaration and never
looked at the real method.** A `Hero` was passed where a `Pickup` belonged, the switch
saw an undefined `kind`, nothing was credited, and four checks went red several steps
downstream of the one-line arity mismatch that caused it.

Every strongest guarantee this project leans on is compile-time — a required field that
won't compile if omitted, `buildSprites()` returning `Record<SpriteName, …>`, a derived
`worldScale` that cannot lie about a weapon's reach. "A rule that cannot be violated
beats a check that notices when it was" is the house position, stated in CLAUDE.md itself.
**This is the documented hole in that entire class of guarantee:** every
`as unknown as {…}` in `tools/` is a place where a compile-time rule silently stops
applying, and the hole is invisible at the call site because the code around it reads
like ordinary typed code — nothing marks the boundary where the compiler quietly stopped
checking. It is this document's own catching question turned on the type system rather
than on a runtime check: *if the signature I changed were wrong, would the typechecker's
green have told me?* Here the honest answer was no, for the same reason item 14's `tail`
couldn't surface a dead process — the instrument (`tsc`) never saw the thing that
changed, because the cast fed it a stale declaration instead.

**What saved it, and what that implies about ordering.** Four *behavioural* checks in
`npm run relics` caught the defect the typechecker couldn't — real evidence that the
acceptance suite is doing exactly the job this document keeps asking whether an
instrument can do. But every failure named a symptom nowhere near a stale type
declaration, so a run-time arity mismatch hidden behind a cast is cheap to diagnose once
suspected and expensive to find starting from the symptom alone — the same "several steps
downstream" cost the earlier fixture and sentinel entries (items 9, 10, 12) all describe.

**A remedy exists but wasn't built here, and it's worth recording as unfinished rather
than closed:** the `rig` pattern could *derive* its declared members from the class
(a mapped/`Pick`-style type off `Dungeon`) instead of hand-restating their signatures,
which would turn a signature change into a compile error at every rig site — this
project's preferred shape, per the house position quoted above. The pattern recurs in at
least `tools/relics.ts`, `tools/named.ts` and `tools/raids.ts`; only the first was
touched to fix this specific defect, so whether the other two carry the same latent gap
is unverified.

**How to apply:** treat every `as unknown as {…}` (or any hand-written interface standing
in for a real class's private surface) as a place where `npm run check` has gone blind to
that one relationship — a signature changed on either side of the cast can drift from the
other without a compile error, and only a behavioural check downstream would ever notice,
several steps removed from the actual line that broke. Comment the cast site saying so,
the way the fix here does, until (or unless) the declaration is derived rather than
hand-written.

## A sixteenth instance, a different species from every one above: an instrument that could see fine, aimed at the wrong object

Every entry so far is an instrument that couldn't *see* the failure it was built to
catch — an omniscient bot, a wrapper's exit code, `ps`'s blindness to a cwd, a
self-consistent modeled link. Enabling co-op raids (`feat/coop-raids`, commit `36ba7da`),
`tools/smoke.ts` added a check that each party member's own `raidProgress` advances
exactly once, independently, on their own machine after a co-op raid clear — the precise
fear ("credit duplicated or desynced across saves") that had kept raids solo up to then.
That check's instrument had nothing wrong with it. It read a real, populated `GameState`
and reported a real number. It was just reading the wrong one.

A host+client smoke harness necessarily builds two `GameState` objects for the party's
second hero: `raidMateState`, the host's own local copy of the party member's character,
passed into the host's `Dungeon` only to seed the shared hero's initial
`Player`/appearance and never written to again, and `raidClientState`, the object the
*client*-side `Dungeon.bankLoot()` actually calls `recordDepth` on — the one standing in
for the party member's own machine. Both are real. Both look exactly like "the party
member's save." Only one is the save under test. The check asserted against
`raidMateState` and read `1 -> 1`, a number that reads exactly like a genuine desync on
the exact property being tested, rather than like a wiring mistake.

**This is not "the check is blind" — the check could see perfectly. It was pointed at the
wrong object, and the wrong object doesn't error.** Every prior entry's catching question
— *if the defect were true right now, would this instrument's number be different?* —
still applies, but it doesn't distinguish this failure from a real one: a stale
`raidMateState` genuinely never advances, so injecting an actual duplication bug and
re-running would *also* leave the number unchanged, for the wrong reason. The two
failure modes ("no bug, wrong object" and "real bug, right object") are indistinguishable
from the assertion's own output; only reading which object the code under test actually
writes to (here, grepping `bankLoot`'s own `recordDepth` call) resolves it.

**Why this one is worth its own species rather than filed under an existing entry:** it
is a *credible false positive*, not an implausible one. Item 10's mistyped raid id
(`raid-the-ferryman` vs `the-ferryman`) was also a wiring mistake dressed as passing
evidence, but in the opposite direction — a bound with slack let a broken fixture read as
correct. Here the check was strict (`1 -> 1`, no slack) and *failed* on a wiring mistake,
in the one direction that costs the most: a maintainer seeing this red would have every
reason to believe the exact bug the design had been afraid of for months had finally
shown up, and either sunk real investigation into a bug that didn't exist or reverted a
shipped, correct feature over it. Caught here only because the mistake was noticed and
fixed in the same session, with the wrong-then-right diff kept in the commit message
rather than squashed away.

**How to apply:** in any host/client (or otherwise two-sided) test, before trusting an
assertion that reads a "your side's state" object, name explicitly which concrete object
the code path under test actually writes to, and confirm the assertion reads *that* one
— not a same-shaped object built for a different purpose (seeding, mirroring, display).
When a multi-sided harness necessarily holds more than one object that could plausibly be
"the" state, the harness should say in a comment which one is live and which is inert, so
the next person extending it doesn't have to re-derive it from the write path.

## A seventeenth instance, a sibling to the sixth and the fifteenth: git's own merge is blind to a collision that leaves no markers

Enabling co-op raids (`feat/coop-raids`), two sessions independently wrote the same fix to
`Party.syncHub` in `src/net/party.ts` — a missing raid-propagation branch, same shape,
different wording — and one landed to master first (`ccf24ef`). When the second merged
master into their branch (`ec9dd64`), `git status` came back clean and there was nothing
between `<<<<<<<` and `>>>>>>>` anywhere in the file. `npm run markers` — which greps for
literal conflict markers, and runs first in `npm test` specifically because two merges
once shipped live markers — passed for the same reason: there were none to find. What the
merge had actually produced was two declarations of `const raid =
this.plan?.config.raid;` back to back in the same scope, a duplicate-identifier error.
Only `npm run check`, the typecheck, caught it, immediately.

Git's line-based merge algorithm did exactly what it is built to do: two insertions at
the same location in non-overlapping hunks aren't a *textual* conflict, so it concatenated
them in sequence rather than flagging anything. **"No conflict markers" and "no conflict"
are different claims, and this is the case where they come apart** — the collision is
semantic (two declarations of the same name in one scope), and nothing about a line-level
diff algorithm is positioned to see a semantic relationship between two blocks of text it
never has to compare to each other.

**Worth naming as a sibling to two existing entries, because it's the same shape as both
and identical to neither.** It's item 6's shape (two sessions independently doing the same
work and colliding) but the blind instrument here isn't a shared filesystem path — it's
git's own merge algorithm, plus `npm run markers`'s literal-marker grep, both confidently
reporting a clean result over a file that no longer compiled. It's also item 15's shape (a
place a compile-time guarantee quietly stops applying) but inverted: item 15 found a cast
that fed `tsc` a stale declaration so the typechecker went blind; here `tsc` is exactly
what worked, immediately, and the blind instruments were the two checks that ran *before*
it and both said nothing was wrong.

**How to apply:** after merging in a fix from master that touches a function another
session was also working on, don't read a clean `git status` and a passing `npm run
markers` as proof the merge is *semantically* sound — both only prove the textual merge
had no overlapping hunks. Run the typecheck immediately, before trusting either signal,
whenever a merge combines two branches' independent fixes to the same narrow gap; a
duplicate declaration, a doubled side effect, or two conflicting one-line edits to
adjacent-but-not-identical lines are all invisible to a marker grep and only sometimes
caught by `tsc`, depending on whether the collision happens to be a type error rather than,
say, a silently-doubled runtime effect.
## An eighteenth instance, and the purest scope defect in the file: a guard that examines one of the forty-one rules it is written over

`tools/smoke.ts`'s "the ultimate meter cannot pay for itself (UAT §10)" is the data-shape
guard on THE ULTIMATE RULE. It walks all 21 classes and applies two filters to every
ultimate-meter generation rule:

```ts
const optOut = rules.filter((r) => r.allowFromUltimate === true);
const loopy  = rules.filter((r) => r.perUnit === "damage" && !r.requireTags?.length && r.amount > DAMAGE_TOPUP_CAP);
```

Counted against the live roster, the second filter — the one that is supposed to catch a
meter refilling itself — **examines 1 of the 41 rules in the game.**

```
ultimate-meter generation rules in the roster: 41
  the "loopy" filter actually examines: 1  -> warlock:damageDealt=0.03 (cap 0.05)
  skipped, perUnit !== "damage": 39
  skipped, has requireTags:      1  -> engineer:damageDealt[construct]
```

Two things make this worse than a narrow filter. The single rule it does examine is
**Warlock's, already tuned safe** at 0.03 under a 0.05 cap — so the check's entire live
scope is one value that was fixed before the check was written. And the one rule excluded
by `!r.requireTags?.length` is **the Engineer's** — the class pinned twenty lines further
down in the same file as a *known, unfixed* self-refilling ultimate (docket §27,
`docs/engineer-ultimate-loop.md`). The filter meant to catch the exploit skips the one
confirmed instance of it in the repo, on the strength of a tag the exploit happens to carry.

**The scope came from the two exploits that had already shipped, not from the space of
loops the resource model permits.** Engineer and Warlock were both untagged
`{ on: "damageDealt", perUnit: "damage" }` with a fat coefficient, and the filter is a
transcription of that signature. So it can only ever find the two bugs already found — and
in fact no longer finds either, because one was fixed and the other acquired a tag.

The prompt was a third class: Paladin's ultimate meter generates
`{ on: "damagePrevented", amount: 40, perUnit: "maxHealthFraction" }`. Outside the filter
on `perUnit`, and `on` is not tested at all. The guard passes it without looking.

**This is a scope defect rather than a missed bug, and the distinction is the whole entry.**
Whether Paladin actually has an exploitable loop is still unmeasured — the first proposed
mechanism for one turned out not to exist (`prevented` is computed *before* the death-guard
clamp in `dungeon.ts`, so damage a death-guard absorbs is never counted as prevented at
all). The guard's blindness does not depend on that answer either way. It would examine one
rule out of forty-one whether or not a loop was sitting in the other forty, which is exactly
the property that makes it an instrument problem instead of a bug report.

Note also that it is *green*, and loudly: it prints two `ok` lines per class, 42 of them,
and 41 of those 42 are a filter matching nothing. This is the same shape as the fourth
lesson's "every migrated cosmetic fits inside the hero stage" — a check that can only
conclude what it already assumed, reporting success in volume.

**How to apply:** when a guard is written from the post-mortem of a shipped bug, the
signature of that bug is a *starting point for the scope, not the scope*. Before trusting
it, count what it examines against what it walks — `rules.length` versus `filtered.length`,
printed — and if a filter's live scope is one row, or zero, the check is documentation of
a fixed bug rather than a defence against the next one. The generalisation to reach for is
the one the *data model* permits: here, "any rule whose event can be caused by the thing the
meter casts", which covers `damagePrevented`, `damageTaken`, `statusApplied` and
`enemyDeath` as readily as `damageDealt`. And a filter clause that excuses a rule for being
tagged deserves particular suspicion, because a tag is the cheapest thing in the world for a
new exploit to acquire — as the Engineer's already has.

## A nineteenth instance, caught inside a brand-new check before it shipped: a reactive that passed green having cast nothing

While building `tools/mapwipe.ts`'s live pass (docket §30), the probe list included
`duelist.riposte`. The assertion was "a bounded ability must leave the far ring untouched",
the far ring at 700/1000/1400 units was untouched, and the check went green.

Riposte is a `reactive`. It resolves its victims only when the caster takes damage, and the
staged hero in the arena never takes any. **It cast nothing, hit nothing, and satisfied
"hit nothing far away" perfectly.** It is the zero-iteration loop from the fourth lesson's
*scope* clause wearing a green tick — a filter over an empty set passes, and so does an
assertion about the contents of an empty result.

What makes it worth recording rather than just fixing is that **the check was correct, new,
and written by someone who had the blind-instruments rule explicitly in mind** — the same
run's static pass already printed `walked 21/21 classes` specifically so an emptied scope
would be visible. The hole was not in the scope of the *sweep*; it was in the scope of a
single probe, where one ability's trigger condition was never met and no count anywhere
went to zero to say so. Nothing in the output looked empty.

The fix is the shape every A/B in this repo has had to learn separately: **assert both
directions.** A bounded ability must miss the far ring *and* hit the near one. With the
near-ring assertion in place, riposte failed immediately and honestly — `hit nothing at 60
units — the probe never landed, so its far-ring result proves nothing` — and was removed
from the list as unsuited to a staged cast rather than quietly carried as evidence.

**How to apply:** a one-directional assertion over a live probe is a bound, not a
comparison, and inherits every weakness `CLAUDE.md` already ascribes to one. Any check of
the form "X must not appear in the result" needs a companion "and the result is not empty" —
not as belt-and-braces, but because the two failure modes are indistinguishable from the
outside. This is the same defect as a one-sided threshold and it is *cheaper to introduce*,
because a probe that silently stops doing anything looks exactly like a probe reporting
success.

**And the sharper half, added 2026-09-10 after a rebase that exercised it: `npm run check`
catches a *compile* break but not a silent *semantic loss*.** The two are different failures
and only the first has an instrument. When a rebase brought two drop-table branches together,
`src/data/drops.ts` and `tools/relics.ts` conflicted loudly and were resolved by hand — but
`src/data/relics.ts` **auto-merged with no conflict at all**, carrying one branch's eight
`event: "encounter"` tags and the other's twenty-six pool references on different lines of
the same file. Had a hunk dropped one of those tags, the file would still have compiled
perfectly: `tsc` has nothing to say about an optional field that is simply absent, and the
resulting build would have quietly paid a raid's artifact at twice its authored odds again.

So the step that actually closes this gap is not another tool, it is **counting the things
that should be there**: eight event tags, twenty-six pool references, both raid call sites
still routed through `raidDropQueries`. Thirty seconds of `grep -c` against numbers you knew
before the merge. Run the typecheck first because it is instant and it catches the duplicate
declaration this entry is about — then count, because the typecheck cannot see the other
half. **A clean merge of two branches that both edited the same file is a claim about text,
and the only cheap way to turn it into a claim about meaning is to enumerate what each side
was supposed to contribute and check that it is still there.**

## A twentieth instance, and it is the check on the check: a falsification that could not falsify

Building `tools/bosstarget.ts` (the boss aim-lock rule, `fix/boss-target-lock`), the
falsification step itself — checking out the pre-fix `boss.ts`/`dungeon.ts` and confirming
the new check goes red — came back green on five of its six cases, against code known,
by construction, to be broken.

The probe worked like this: position hero A near the boss, capture the boss's facing the
instant it begins a wind-up, move hero B to become the new nearest hero, and compare
facing at commit against facing at resolve. Hero B's new position was closer to the boss
than hero A's — but at the *same angle*, due east, just nearer. A boss correctly locked
onto hero A and a boss silently reassigned onto hero B both read as "facing due east" from
that geometry, because the only thing that changed was distance, and distance never
entered the comparison. The check couldn't distinguish its two hypotheses, so of course it
agreed with whichever one it was pointed at — it would have agreed with the fix being
broken just as readily, and briefly did, before the fix was even reverted, since the
initial version of the geometry produced this every time.

**Every other entry in this file is a check that couldn't see its own subject. This one is
the instrument whose entire job is to prove another check has teeth, being blind in
exactly that job.** It is worse than an ordinary blind instrument for the reason CLAUDE.md
already states about a design-promise comparison: a check that always passes gets trusted
indefinitely, while a check that always fails announces itself in minutes. The wave
director's spawn timing — an earlier version of this same probe looked for the boss
synchronously at construction and missed one hundred percent of the time — is the benign
version of this exact mistake: loud, obvious, fixed before anyone believed the number.
This one was quiet. It reported the fix *working* against code the very next command was
about to prove was broken, which is the green that would have retired the whole question
if the falsification step hadn't been run at all, or had been trusted on its first result.

**It was only caught because red was expected and green arrived instead** — a prediction
recorded before the run, the same discipline `docs/shared-loot.md`'s two injections and
this file's own falsification entries already use. Had the fix itself been subtly wrong
rather than deliberately reverted wholesale, this same blind probe would have blessed it,
and nothing about the resulting green would have looked any different from a correct one.

**The rule is already written down, in a different domain, and this is the same rule
restated rather than a new one.** CLAUDE.md's determinism section: *"the violation has to
actually consume or reorder the shared `Rng` stream ... a real behavior change that only
reaches something the run doesn't compare ... passes the check while proving nothing."*
Swap the domain and the sentence is unchanged: the injection has to move the quantity the
check reads. There, the shared quantity is the rng stream and the injection has to touch
it. Here, the read quantity is *angle* and the injection moved *distance* — a real,
deliberate change to the test's own state that the comparison was nonetheless structurally
incapable of seeing. Two people, two domains, the same shape, arrived at independently —
which is the evidence that the rule is general rather than a fact about random numbers.

**How to apply:** when a falsification returns the *expected* red, that is evidence about
the subject. When it returns an *unexpected* green — pass against code you deliberately
broke — that is not yet evidence about the subject at all. It is a result about the
injection, and the injection has to be shown to move the specific value the check reads
before the green means anything. Here that meant re-examining the geometry (a fixed
angular offset between "still locked" and "reassigned") rather than the lock code a second
time. Fixed by moving the second hero to a *different* angle from the boss, not just a
different distance, so the two hypotheses read roughly ninety degrees apart and the
comparison finally had something to distinguish.

## A twenty-first instance, and a new species: a measurement that was correct, complete, and still blind

Every entry above is an instrument that could not see its subject: a bound taken from the
thing under test, a scope that had silently emptied, a cast that blinded the typechecker, a
correct instrument aimed at the wrong object. This one is different, and it is worth the
file's space because **the defence against it is not "fix the instrument."**

Bringing the Abyssal Rift's artifact odds down (`docs/abyss-odds.md`), the first
implementation made a drop pool **elect a single winner**: one roll for the whole pool, then
a weighted pick of which artifact it was. The measurement instrument — `npm run relicunion`,
which composes P(at least one relic-tier item per clear) and cross-checks its analytic model
against a 40,000-trial Monte Carlo through the real `rollRelicDrops` — reported:

```
Abyssal Rift t1    any 34.7%   [sampled 34.7%]
```

Those numbers are **correct**. They are also the numbers the shipped implementation produces,
to every decimal place on every row. The instrument was not broken, not mis-scoped, not
wrongly bounded, and not aimed at the wrong object. It answered its question perfectly.

The question simply did not cover the property that changed. **"At least one" is identical
under winner-takes-all and under independent rolls** — the aggregate is invariant across two
mechanisms that differ underneath it. What differed was the *shape* of the payout: an Abyss
boss has always been able to drop **more than one** artifact from a single kill, and
winner-takes-all silently made that impossible. That is a player-visible change to live
content, well beyond the drop rate that had been approved, and no amount of staring at
34.7% would ever have revealed it.

What caught it was a completely different check, in `npm run relics`, watching the shape
rather than the number:

```
FAIL  with the dice rigged, the Abyss Choir pays out every artifact it lists  — 1
FAIL  killing the Abyss choir drops every artifact it lists (12)  — tempo-of-the-fifth-circle
```

**The rule.** An aggregate can be preserved across mechanisms that differ beneath it, so a
measurement that tracks an aggregate cannot certify a mechanism change even when the
measurement is perfect. When you change *how* something is rolled rather than *how often*,
the number is not evidence. Keep a check that watches the shape — here, `rollTable`'s own
documented property that relics are a table of distinct chases and "two can land in the same
cache" — alongside the one that watches the magnitude. The suite happened to have both, and
that is the only reason this did not ship.

**The corollary, and the harder half.** The natural response to those two reds was to rewrite
them: the new mechanism pays one artifact, so assert one artifact, and the suite goes green.
That would have shipped an unapproved design change *behind a measurement everyone had
already signed off on* — the "talking a red check down" failure named in `CLAUDE.md`, where a
written argument stands in for the property it claims. The argument would even have sounded
good, and it would have been the exact opposite of the position the same branch had already
taken correctly twice that evening (that a mechanism, not a constant, was the thing to fix).
**A check you are about to rewrite to match your new behaviour is a check you should first
assume is right.**

The fix kept both properties: every pool member still rolls its own dice, and one shared
factor scales all of them so the union equals the authored number. Same aggregate, correct
shape.

**How to apply.** Before believing a measurement certifies a change, ask what the measurement
would return if the mechanism were wrong in the way you have not thought of yet. If the
answer is "the same thing", the measurement is not evidence for this change however good it
is — go and find the check that watches the shape, and if there isn't one, write it.

## A twenty-second instance, and the first where the blind instrument was a design record: a confident wrong diagnosis, load-bearing for weeks

`docs/engineer-ultimate-loop.md` diagnosed docket §27 — the Engineer's self-refilling
ultimate — as the `fromUltimate` stamp failing to propagate to the constructs the ultimate
summons, and recommended carrying the stamp onto minions and zones. It is a careful page. It
sweeps all 21 classes, it corrects an earlier draft of itself in the text, it explains why
only the Engineer is exposed, and it explicitly declines to propose a number so the owner
can decide. **Every structural claim in it is wrong**, and the fix it recommends would have
changed nothing.

It was believed for weeks, it was quoted into a PM's task brief, and an hour of
implementation work was nearly spent on it — by me — before a measurement contradicted it.

**Three separate errors, and they compound:**

1. **A units error at the top** — a 50x misreading of the one number the page is built on.
   It gets its own entry below (§21), because it is a different species from the rest of
   this one.
2. **A mechanism inferred rather than traced.** "The ultimate summons constructs; construct
   packets carry no stamp; the tag matches; the meter fills" is a coherent chain in which
   every individual link is true. It is not what happens. Removing the zone step changes
   nothing; removing the summon step changes nothing. The credit lands in `fireGrant`
   *before the `ultimateUse` event is emitted* — a `grantEffect` on the `construct` tag,
   fired by the ultimate's own cast, on a path `resources.ts` never guarded.
3. **A scope claim that was never counted.** "Of the seven, only the Engineer's ultimate
   summons anything" — ten ultimates create a persistent thing. The number was asserted from
   a reading, not from a walk.

**The rule this adds, because the existing entries are all about tools:** a design record is
an instrument. It is read the way a green check is read — as a measurement someone already
took — and it has none of a check's properties. It does not re-run. It is not falsified when
the code moves. Nothing counts what it walked. **Its confidence is authored, not earned**,
and prose is the one artefact in this repository where a wrong answer and a right answer
look identical.

The nearest existing sibling is the fourth lesson's *"a correct check can be overruled by
prose"* (`art/anim/windup-check.py`, talked down by its own docstring). This is the harder
version: there was no correct check to overrule, and **the prose was the only instrument
anybody had.**

**How to apply:** before building the fix a design record recommends, **reproduce the
number the record is built on.** Not the bug — the number. Here that was thirty seconds:
print the meter's `max` next to the value the record quotes, and the whole entry falls over
before a line of code is written. If a record states a magnitude, a mechanism and a scope,
those are three separate claims and the cheap one to check first is always the magnitude,
because a units error invalidates the other two for free. And when a record turns out to be
wrong, **correct it in place with the wrongness visible** rather than deleting it — the next
session needs to know the page was confidently wrong, not merely that it is now right.

## A twenty-third instance, a sibling to the twenty-first: the instrument was right and was read in the wrong units

§21 above found a measurement that was correct and complete and still told the wrong story,
because it measured the right quantity about the wrong behaviour. This is the cheaper,
dumber cousin of that, and it cost more: the instrument measured the right quantity about
the right behaviour, printed it correctly, and **it was read on the wrong scale.**
`probeUltimate` got the Engineer's ultimate meter exactly right.

```
  Engineer: THE ULTIMATE RULE — its own output did not refill the meter  — meter 2.0
```

`meterRightAfter` is `resources.ultimateMeter()?.value`. Every ultimate meter in the game is
`max: 100`. So `meter 2.0` is **2% of a meter**. It was written up as:

> `meter 2.0` is a full meter — the ultimate paid for itself, immediately, and could be cast
> again.

**A 50x error, and it set the severity of everything downstream.** It made a 2% per-cast
trickle read as a self-sustaining loop; it justified a docket entry, a pinned smoke
violation, a PM task brief, and an approved fix axis. None of those would have survived the
question *"two out of what?"*

What makes it worth its own entry next to §21 is that **no measurement was wrong and no
scope was empty**. The usual remedies in this file — print what you walked, compare against
a fixed reference, run a control, falsify by injection — would all have passed. A control
would have confirmed the 2.0 was real, because it *is* real. §21's remedy does not reach it
either: that entry's answer is to check the behaviour behind the number, and here the
behaviour was exactly what the number described. The defect is entirely in the reading, and
the only thing that catches it is asking what the number is a number *of*.

The adjacent trap, worth naming because the same codebase has both: `Dungeon.specialCharge`
returns `meter.fraction` (0–1) while `meterRightAfter` reads `meter.value` (0–100). Two
accessors onto the same pool, differing by 100x, both called "the meter" in prose. A sweep
turned up no other live instance, but `docs/arm-the-trees-rebaseline.md` had inherited the
same sentence and was corrected alongside.

**How to apply:** **a measurement without its units is not a measurement.** When a tool
prints a bare number, print the scale with it — `meter 2.0/100` costs nothing and cannot be
misread. When a design record quotes a number, it must say what scale it is on, and a reader
who cannot tell from the page should treat the claim as unverified rather than assume. And
when a number is the load-bearing fact of a diagnosis, **reproduce that number before
building on it** — not the bug, the number: here it was thirty seconds of printing `pool.max`
next to it, and the whole entry falls over before a line of code is written.

## A twenty-fifth instance, a new species: a subject that never survives long enough to be measured, passing on the luck of five elites

*(Numbered 25 by the PM session; 22–24 are assigned elsewhere and may land after this.)*

`npm run rewards` has a section that plays a real floor to prove §16's drop axes reach live
loot: a level-60 swordsman, geared from twelve Elite chests, stands still and presses attack
for 45 seconds on twelve seeds at depth 12, once with the Challenger dial off and once at
tier 8, and the check is that **both sides collected at least three drops**. The fixture's
own comment says why the bar exists: *"a bot that dies in the first ten seconds harvests
nothing and proves nothing."* On master the hard side read **3**. Exactly the bar. Green.

The Nine Circles re-cut (`docs/nine-circles.md`) changed which biome depth 12 is, which
moves the shared rng, and the same check read **1**. Measured on both trees over 48 seeds,
in disjoint 12-seed blocks, with the fixture's dial as the variable:

| dial | tree | kills | elite kills | drops per block | mean survival |
|---|---|---|---|---|---|
| 8 | master | 147 | 5 | 3 / 8 / 7 / 4 | 8.3 s, 0 of 48 alive |
| 8 | the re-cut | 134 | 0 | 1 / 1 / 0 / 1 | 8.4 s, 0 of 48 alive |
| 5 | master | 343 | — | 16 / 15 / 7 / 9 | 10.8 s |
| 5 | the re-cut | 362 | — | 9 / 12 / 9 / 14 | 11.5 s |
| 3 | master | 604 | — | 26 / 17 / 18 / 18 | 18.3 s |
| 3 | the re-cut | 634 | — | 19 / 18 / 14 / 21 | 18.8 s |

At tier 8 the subject is **dead in eight seconds on every seed of both trees**, with the
same handful of trash kills — trash drops at a few percent per kill, so a dead-in-eight
bot harvests roughly nothing from them. Master's 22 drops were the **five elites in 48
seeds** that happened to walk into its swing before it died; an elite carries a guaranteed
drop. On the re-cut's depth-12 floor, none happened to. At tiers 5 and 3, where the subject
lives long enough to kill things, the two trees agree to within noise. So the drop rate did
not change. The fixture was **never measuring it**: its hard side was the "row pinned at
0/16" `CLAUDE.md` describes under difficulty philosophy, and a pinned row can only move by
luck — which it did, in both directions, from 3 to 8 to 1 across blocks with no code change
between them.

**The species.** Every earlier entry is an instrument that could not see its subject. This
one *could* see it; the subject simply did not exist for long enough to be seen. The bound
(three drops) was fine, the scope (twelve seeds, both sides) was fine, the subject (the
loot a standing character collects) was the right thing — and the character was a corpse
for 37 of the 45 seconds. A fixture has to be **contested** before it is a measurement: not
a certain win, not a certain loss. This one was a certain loss whose bar was set where a
lucky loss could still clear it.

**The distinction that matters for the next reader.** The rng-moving branch did not cause
this. It **revealed** a defect that had already shipped — master was green on the same
fixture the same day, by the same luck. A check that goes red on a branch that perturbs
the shared stream is not evidence against the branch until the check has been shown to be
contested on master; here it took one 48-seed sweep on each tree to show it was not. Treat
"this branch moves the rng and a check went red" as a prompt to measure the *check*, not
as a verdict on the branch.

**The fix**, and why it is not a re-baseline: the dial is 5, chosen because it is where
the same target lasts long enough to harvest on both trees and every 12-seed block of both
clears the bar by more than double — not because it makes the branch pass. Nothing the
section asserts needed tier 8: the "+3 item level" the old dial was picked for stopped
being a live property when docket §23 made item level track the character, and the
quantity and variant axes are read off the profile, which climbs at any tier above 0.
The seeds and the bar are untouched; the measurement is in the fixture's comment.

**How to apply.** Any check that plays the game to harvest a number needs one line of
output that says whether the subject survived to produce it — seconds alive, kills, alive
at the end — and a reader should refuse a green from a fixture whose subject was dead
before the property could occur. If the number sits exactly on its bar, that is not a
pass; it is the instrument telling you it has no margin, and the next unrelated change
will flip it.
**Corroborated independently, from a second branch.** `fix/ultimate-uptime` added two rows
to `MOD_POOL` — an affix change that touches no reward code at all — and the same check went
red at 9 plain / 2 hard. Isolating it showed why: on master the hard side sits at **exactly
3, the threshold itself.** A guard resting on its own floor flips on any perturbation of the
item-roll rng whatsoever, so it has been reporting the seed stream rather than the property
for as long as it has existed. Three branches hit it in one day (`feat/nine-circles`,
`fix/ultimate-uptime`, and this one), which is what a fixture at its floor looks like from
the outside: it appears to indict whatever changed most recently.

## A twenty-seventh instance, and it is a law rather than an incident: making a fixed thing variable narrows every existing reader of it

Entries 24-26 are other sessions' and land from their own branches; 27 was assigned to this
one to avoid the ordinal collision entry 17 is about.

Docket §37 made `MINION_CAP_PER_OWNER` modifiable — `spawnMinion` now clamps to
`MINION_CAP_PER_OWNER + floor(mods.maxSummons)` so the new `of the Throng` affix can raise
it. One line, in one function.

`tools/smoke.ts` had asserted, correctly and for the life of the project:

```ts
check("the per-owner summon cap holds", cd.minions.length === MINION_CAP_PER_OWNER, ...);
```

That assertion did not change, was not touched, and **stopped being the claim it used to
be.** It now holds only for a character carrying no `of the Throng`. The full gate passes on
it — measured, 0 of 120 geared necromancers roll the suffix, because it is `minTier: 4` and
`geared()` opens Advanced chests — and it would have kept passing until some future gearing
change rolled one, failing then in a file where nobody would think to connect a summon-count
failure to an affix roll.

**The law:**

> When you make a fixed thing variable, **every existing reader of it is now asserting
> something narrower than it used to** — and some of those readers are checks. A check that
> passes for a reason nobody recorded is indistinguishable from a check that passes because
> the code is right.

This is the file's first entry that is not about an instrument being wrong. Every check here
was right when written, is still right today, and is *becoming* wrong at a rate nobody is
watching — the defect is in the gap between when a constant becomes a variable and when its
readers find out.

**How to apply, and the whole method is two seconds:**

```
grep -rn MINION_CAP_PER_OWNER src/ tools/
```

After making any constant modifiable, grep for it across `src/` and `tools/` and read every
hit as a sentence. The ones in `src/` you will usually notice, because they are the feature.
The ones in `tools/` are the dangerous half: a check written against the old invariant keeps
passing, so nothing tells you, and the gate's greenness actively conceals it.

Where a reader's assumption survives, **say so in the check** rather than leaving it
implicit — the fix here computes the expectation the way `spawnMinion` computes it and
asserts `mods.maxSummons === 0` on the fixture directly, so the day it does roll one the
check reports *why* it broke instead of merely breaking.

**Note what did not find this.** Not the gate, which passes. Not a falsification, because the
check is not false. Not a control. The question that found it was asked of the *change*
rather than of the code: having made a constant variable, who else was relying on it being
constant. It was the third finding in one day from that question and none of the three came
from a check.

## A thirty-first instance: a stat with no instrument pointed at it at all

Every entry above is a check that ran and returned a wrong or misleading answer about its
subject. This one inverts the shape completely: **there was no check, because nothing in
the acceptance gate connects "a mod is authored" to "a mod is read by the simulation," so
there was nothing to be blind in the first place.**

Building the affix codex (docket: a Codex screen explaining every stat and affix, read live
off `mods.ts`/`items.ts`) meant tracing what every `ModKey` actually does in combat, to
write an honest sentence about it rather than a guessed one. `wardPower` traced to nothing.
`runtime.ts`'s `"shield"` effect step computes its amount via `scaledAmount(base, scale,
input)`, whose `switch` recognises exactly two scale kinds (`"attack"`, `"spell"`) and
returns the flat authored number for anything else — including no scale at all, which is
what every shield-granting site in the game uses. `wardPower` is never read anywhere on that
path, nor by `WARD_RESIST` (a flat constant), nor anywhere else in `combat/`, `game/` or
`progression/`. It has never had a mechanical effect.

It was not, however, unauthored or unused in the sense the rest of this file's entries mean
"unused." It is real, deliberate content: a dropped affix ("of Warding", uncommon and up), a
raid relic, and foundation-tier tree nodes on eleven separate classes, plus two classes'
resource-threshold bonuses. `npm run roster` walks all 21 classes' full node trees and never
flagged any of it, because the roster audit checks structural properties of the tree (no
duplicate ids, hybrid/archetype thresholds, anti-overlap) — it has no concept of "does this
class's granted mod resolve to a combat effect anywhere," so a mod being real vocabulary with
zero consumers is invisible to it by construction, the same way a scope that was never asked
to look is invisible to itself.

**The rule this suggests, stated the way the file's other entries are:** a check that
verifies a value is *authored* correctly (present, well-typed, structurally consistent) is
not a check that it is *consumed* anywhere. Those are different properties, and a roster
audit that is thorough about the first can still be totally blind to the second — not
because it looked and missed, but because "is this mod ever read" was never a question in
its vocabulary at all.

**How to apply, priced rather than built here.** Every key in the `Mods` vocabulary
(`MOD_KEYS`) should be read at least once somewhere in `src/combat/`, `src/game/` or
`src/progression/` outside `mods.ts` itself and the display-only formatters (`modLine`,
`shortLabel`, the Hero sheet). That is a single pass over ~50 keys against a grep for each
one's identifier — cheap to write, and it would have caught this the day `wardPower` was
first authored rather than however many months later a documentation screen happened to
trace it by hand. Not built in this branch, which is a Codex screen, not a new gate; priced
here so it doesn't have to be rediscovered. The owner's ruling on the finding itself was to
remove `wardPower` rather than wire it up or document it as inert — see docket, `26`'s
branch — which makes this entry a record of how the gap was found, not a description of a
stat that still exists.

## A twenty-fourth instance, and a new species: a real comparison, correctly phrased, green for a reason unrelated to its claim

> **On the number.** This entry was first written as "a twentieth instance", derived from the
> highest ordinal visible on its own branch — and that was wrong, in precisely the way entry 17
> above describes. Sessions working in parallel each derived the correct next number from what
> they could see, more than one arrived at the same one, and git merged the prose cleanly in
> between, because a duplicate heading is a collision that leaves no markers. The numbering is
> now assigned by whoever is integrating rather than derived per branch: the entries that landed
> first hold 20 through 23, and this one is 24. Don't derive the next one either — ask.

Found 2026-09-10 on `feat/relic-level-gate`, by falsifying seven ways a brand-new set of
checks could be wrong. **Five went red. Two went green, and neither was a code defect — both
were the checks themselves measuring something other than what they said.**

Every earlier entry in this file is about an instrument that could not see: a bound derived
from its own subject, a scope that had emptied, a filter over a set that never contained the
thing. These two are different, and worse to spot, because **they are comparisons** — the
remedy `CLAUDE.md` prescribes for the one-sided-bound family. Both compared two real numbers
produced by the code under test. Both were phrased exactly as the design promise they were
asserting. Both were green because something *other than the asserted variable* was carrying
the difference.

### The dangerous one: nothing tested the search at all

`sourceFloor` takes a drop source to the shallowest floor that can pay it out, and for a rift
boss that means **searching the tier ladder for the tier whose floor actually spawns that
encounter** — `riftBossSources` writes all five Delve bosses out per rift, so "the Nameless,
in the Abyss" is a far deeper ask (31) than "the Choir, in the Abyss" (11).

Injection: delete the search, return the lowest allowed tier's floor for every boss.

```
ALL RELIC CHECKS PASSED
```

Every check in the file agreed, while five artifacts' level requirements had silently
collapsed toward their rift's cheapest tier. The section had checks about depth, about danger,
about the grace, about both directions at the boundary, about the migration — and not one of
them varied *which encounter a source named*, so the entire search was untested code.

The control that catches it holds everything else still: two sources naming **different
encounters** in the **same rift** at the **same `minTier`**, so the mode and the tier cannot
carry the result and the encounter is the only thing left.

```
FAIL  in one rift at one tier floor, naming a deeper encounter asks for more — nameless → 11, choir → 11
```

### The instructive one: the check named danger and measured depth

The gate reads a source's `danger` as well as its depth, because a rift tier is part of *where*
a thing drops. The check written for it:

> a tier-8 Abyss source asks for more than a tier-1 one — tier 8 → 37, tier 1 → 11

A real comparison, between two real configurations, on the exact axis in question. Injection:
divide danger back out of `sourceLevel` entirely.

```
ALL RELIC CHECKS PASSED
```

Because `MODES.abyss.depthPerTier` is 2.2. **Climbing the tier ladder raises the depth as well
as the danger**, so tier 8 out-ranks tier 1 whether danger is read or not — by 37 to 11 with
it, and by 25 to 11 without. The comparison could never have failed, and the number it printed
looked like evidence.

The control is to hold the depth still and vary only danger — ask the same formula about the
**same depth at danger 1**:

```
FAIL  ...and danger carries part of that on its own: the same depth at danger 1 asks less
      — depth 28 at danger 3.00 → 25, the same depth at danger 1 → 25
```

Note that the *original* check is still worth keeping and was kept. "Climbing the ladder asks
for more" is a true and useful promise about the thing a player actually walks up. It simply
is not the promise about danger, and it was being read as one.

### The rule

`CLAUDE.md`'s campaign lesson says: assert a design promise as a **comparison**, not a
one-sided bound. That is necessary and it is still right. The refinement this instance adds:

> **A comparison needs a control.** Two numbers that differ are not evidence that the thing
> you named is what makes them differ. The comparison must vary *only* the variable being
> asserted — everything else held still — or it will report whichever confound is largest and
> you will read the confound as your result.

This is the same disease as the one-sided bound wearing better clothes. A bound is satisfied
by a constant; an uncontrolled comparison is satisfied by *any* correlated quantity, and there
is usually one, because the systems we compare across are tuned to move together. `depthPerTier`
and `dangerPerTier` both climb with tier **on purpose** — that is the design — which is exactly
what makes a tier comparison unable to tell them apart.

**How to apply.** Before believing a comparison, name the variable it claims to be about, then
ask what *else* differs between the two sides. If anything does, and it plausibly moves the
result in the same direction, the comparison is not yet evidence — hold that thing still and
compare again. And when a function has a branch nobody's check varies over (a search, a
lookup, a fallback), stub the branch out and watch: if everything stays green, that branch has
no watcher at all.

## A thirtieth instance: the annotation that switches the compiler off, found only by running the code

Ordinal assigned by the PM to avoid collisions across sessions; 29 is another branch's and
entries 22–27 are not on master yet.

Retiring `ultimateBounces` and `ultimateProjectiles` meant deleting two rows from `MOD_POOL`.
The inventory had been swept by `git grep` over both key names, came back as nine sites across
four files, and the sweep was correct — every one of those nine was real and every one was
handled. The branch typechecked clean, `tsc --noEmit` over `src` and `tools` both.

The game would not boot.

`src/data/augments.ts` holds `AFFIX_MOD_IDS`, the curated shortlist of affixes that get their
own Augment, and it is a list of **ids into `MOD_POOL`**:

```ts
const AFFIX_MOD_IDS: readonly string[] = [
  "deadly", "savage", "frenzied", "quickened", "fleet",
  "bloodthirsty", "titanic", "vast", "splitting", "rebounding",
];

const AFFIX_AUGMENTS = AFFIX_MOD_IDS.map((modId) => {
  const mod = modRollById(modId)!;
```

`"rebounding"` was one of the deleted rows. `modRollById` is a `.find()`, so it returned
`undefined`, and the non-null assertion turned that into a module-load
`TypeError: Cannot read properties of undefined (reading 'minTier')` — thrown at import, from
a file whose name has nothing to do with the change, with a message that names neither the
affix nor the list.

**It was not in the grep because it does not contain either key name.** `AFFIX_MOD_IDS` names
the affix *row* (`rebounding`), not the mod *key* (`ultimateBounces`). A sweep for the thing
being retired cannot find a reference that spells it differently, and there is no general fix
for that by grepping harder.

**It was not caught by the typechecker because the annotation told the typechecker not to
look.** `readonly string[]` is a perfectly ordinary thing to write and it is exactly wrong
here: these are not strings, they are ids drawn from a known finite set, and declaring them as
`string` discards the only fact that would have made the mistake visible. The compiler had
every piece of information needed — `MOD_POOL` is a module constant in the same package — and
was explicitly instructed to ignore it.

**What found it was running the code.** A round-trip check had just been written for a
different reason (to prove that deleting an affix row does not orphan a saved item's name,
after the PM refused to accept that claim from inspection). It imports `GameState`, which
transitively imports `augments.ts`, so it died on import before executing a single assertion.
Reading the diff, reading the file, and typechecking the whole repo had all just said fine.

### The fix is a rule, not a check

The repair is not "grep for id lists" and it is not a new gate. `MOD_POOL` was annotated
`readonly ModRoll[]`, which widens every `id` to `string`; the authored rows are now a `const`
tuple with the type recovered off it:

```ts
const AUTHORED_MODS = [ /* ...rows... */ ] as const satisfies readonly ModRoll[];
export type ModPoolId = (typeof AUTHORED_MODS)[number]["id"];
export const MOD_POOL: readonly ModRoll[] = [...AUTHORED_MODS, ...ELEMENTAL_MODS];
```

`AFFIX_MOD_IDS: readonly ModPoolId[]` then makes a retired affix a **compile error at the id
list**, which is where the mistake actually is. Falsified by putting `"rebounding"` back:

```
src/data/augments.ts(343,51): error TS2322: Type '"rebounding"' is not assignable to type
'"arcane" | "keen" | "brutal" | ... | "splitting"'.
```

Two details of that fix are load-bearing and easy to get wrong. `MOD_POOL` keeps its
`readonly ModRoll[]` type for every consumer, so nothing downstream changed. And `ModPoolId`
covers the **authored rows only** — `MOD_POOL` also spreads generated `ELEMENTAL_MODS`, whose
ids are `string` by construction, and folding those in would widen the union straight back to
`string` and silently undo the whole thing. A guard that quietly becomes vacuous is worse than
no guard; this one is narrow and its comment says so.

### The honest size of it

The instinct was to call this a whole class of defect and sweep the repo. Measured instead:
`: readonly string[] = [` appears **twice** in `src/`, and only one of the two was this bug.
The other is `GRANTABLE_ABILITY_IDS` in `progression/index.ts`, a list of ability ids consumed
by `rng.pick` and the Inscribe op. It has the same shape and is unvalidated at compile time,
but **its failure mode is different** — a stale id there yields an item with a dead grant, not
a crash — so it is named here rather than fixed on an unrelated branch.

So: not a class, two instances, one loud and one quiet. Writing "a whole class" would have
been the same error this file keeps recording, committed in the sentence describing the fix.

**The rule.** A `string` annotation on a list of ids is a decision to turn off the only
mechanism that could check them. Type an id list against the set it draws from, and a deleted
member becomes a compile error rather than something that depends on whether anyone happens to
execute that module. `CLAUDE.md` already states the general form — *a rule that cannot be
violated beats a check that notices* — and names `SpriteName` and derived `worldScale` as the
two places it was spent well. This is a third.

**How to apply.** When you delete a member of any authored table, ask what *else* addresses it
by name, and remember that the other name may not be the one you are deleting. Then ask why
the compiler is not already stopping you; the answer is usually an annotation somebody wrote
without noticing it was a waiver.

## A twenty-sixth instance, and it was inside the process rule: an anchored grep that was never correct for any tool in the directory

*(Numbered 26 by the PM session; 22–25 are assigned to other branches and may land after this.)*

The rule for reading a gate log, as written into `docs/pm-handoff-2026-09-11-morning.md`
on master and repeated in four assignment briefs that day, was: report the terminator line
and an **anchored** `grep -c '^FAIL'` count — never the exit code, never `grep -i fail`.
Both prohibitions were earned: an exit code had certified a killed chain, and a
case-insensitive grep matches prose in ok lines. The anchor was meant to be the precise
instrument between them.

**It matched nothing any tool prints, and never had.** The failure line in this repo's
acceptance tools is a house style, not a per-tool choice: every `check()` helper in
`tools/` prints `"  ok  "` and `" FAIL "` from the same indented template —
`` `  ${ok ? "ok  " : "FAIL"} ${label}` `` or its equivalent — and the three tools written
the same morning by a different session (`mapwipe`, `ultfloor`, `summon-scaling`) copied
it from their neighbours without a thought, which is exactly how a house style propagates.
A sweep of the directory finds thirty-three per-check failure prints, all indented, and
**zero** at column zero; the only `FAIL` that starts a line anywhere is one tool's
`FAILED (n)` summary. So `^FAIL` was not blind to twenty tools out of thirty; it was blind
to the check line itself, everywhere, from the day it was written, and it cannot be made
correct by fixing any list of tools — a tool written tomorrow will indent too.

It showed on the Nine Circles branch's post-rebase gate:

```
anchored grep -c '^FAIL'   0
grep -c 'FAIL'             1     ← " FAIL  the harvest collected drops on both sides"
```

with `1 REWARD CURVE CHECK(S) FAILED` and `EXIT=1` further down. A reader following the
rule to the letter, with the terminator overlooked, calls that run clean. Two of the three
tools lootsim-26 named — `mapwipe` and `ultfloor` — exist specifically to catch instruments
that cannot see their target; **the anchored grep was blind to the checks written to catch
blindness**, and their author would have reported both green under the old rule. Master's
batch-three integration log was rescanned at every indentation and is genuinely green — the
hole was in the reading, not the code.

**The species.** Not a bound taken from the thing under test, and not a subject that never
existed: an instrument in the *process* — the rule that exists to stop blind instruments —
scoped to a format the code base does not use. It is entry 13's omission one level up:
nobody enumerated what the tools print before anchoring on it, and `grep -rlE ' FAIL '
tools/*.ts` was a one-line question that would have answered it the day the rule was
written. A rule repeated into briefs inherits whatever blindness it had; this one reached
four sessions before its first run under it exposed the gap.

**The correct reading, so the next brief copies this and not the old line:**

1. **The terminator.** The chain's last step prints `ALL CHECKS PASSED`, and the launcher's
   own `EXIT=0` (or whatever it appends) must be present. An absent terminator means the
   chain **stopped** — `npm test` halts at the first failing step — so every step after the
   red one *never ran*, and a green tail cannot be inferred from a green head. Compare the
   `> lootsim@2.0.0 <step>` banners against the chain in `package.json`; a missing banner
   is an unrun step.
2. **A case-sensitive, unanchored `grep -c 'FAIL'`.** Not `^FAIL`, not `-i`. It must be
   zero. If it is not, the matching lines are the finding; read them. (`FAILED` is a
   summary line; it is caught by the same grep.)
3. **Both, never one.** A terminator with a non-zero count is a tool that printed a red and
   did not exit non-zero (entry 7's shape). A zero count with no terminator is a killed or
   halted chain (entries 6 and 13). Only the pair says green.

## A twenty-eighth instance: the guard was correct, stayed correct, and could never have seen the thing it was guarding

Ordinal assigned by the PM so several sessions writing into this file at once do not collide;
entries 22–27 belong to other branches and are not on master yet.

`art/wave-2` added six monsters and then lifted three of their bodies out of the floor's
luminance band so they would read against the sector tilesets (`a247a07`). That is a change to
the pixels of art the owner had already approved on sight, so the question on the table was
the obvious one: **did the lift cost any of them its menace?** The gate that was run, reported
and treated as the answer was `npm run chroma`.

`chroma` is a good check. It is the subject of no complaint in this file. It measures a
sprite's *accent* — the maximum chroma over any colour covering two or more pixels — and
asserts as a comparison, not a bound, that the hero's stays below every committed monster's,
because §1.4 says the one hot colour is the monsters' "this is looking at you" signal. It was
built after five hero passes were rejected and a colour-count screen missed a saturated gold
buckle. It even carries its own falsification section. It was green across the lift, on every
one of the thirty committed sprites, with the three lifted bodies present by name in its
output.

And it is **structurally incapable of answering the question it was being asked.** A brighten
pass moves the *body*. `chroma` reads the *accent*. The two quantities are disjoint: a monster
whose body is brightened until it stops reading as menacing passes `npm run chroma` green,
every time, because the accent never moved. Nobody mis-aimed it — that is entry sixteen's
species and this is not that. It was aimed exactly where it belongs, at its own property, and
it was then read as evidence about a different property that happened to be nearby.

The other instrument in the room had the same shape from the other side.
`art/monsters/infusion-matrix.ts` measures each sprite's contrast **against the floor it
stands on**, and it is what justified the lift. It supplies a *lower* bound: it can tell you a
body is too dark to see. It cannot tell you a body has been brightened past the cast it
belongs to. So the change had a floor, and a green accent check, and **no ceiling at all** —
the entire upper half of the risk was uncovered by anything.

What actually stood in that gap was a person looking at a contact sheet. Which brings the
second half, and it is the part worth the file's space:

**A description is not a measurement, and this file is the wrong place to be precious about
it.** The eye report that came back said the gore hound had gone "from a near-black blob to a
readable purple-grey bull" and the rot priest "from a black-robed lurker to a mid-grey-green
figure." The PM rendered both commits at 6× side by side and the pixels disagreed: the gore
hound was *already* a readable purple-grey bull before the lift, the rot priest was *already*
mid-grey-green, and the whole pass was a modest step. The reviewer had compared a native-trim
thumbnail against a 6×-rendered strip and attributed the difference to the commit. That
report was one relay away from reaching the owner as a regression that the pixels do not
contain.

So the sequence was: a correct check, green, guarding nothing relevant; a second correct
check, bounding only the safe direction; and prose standing in for the missing third. Each
link individually defensible.

**The fix is the missing ceiling, written as `npm run bodylum`.** A sprite's body luminance is
the **median** Rec. 709 luminance over its opaque pixels — median specifically, because a hot
accent is by design a tiny minority of pixels and a median is structurally insensitive to it,
where a mean would be dragged by exactly the pixels the check must ignore. The bound is not
"all committed monsters", which would include the six sprites under test and let brightening
all six carry the band up with them — the `heroStage` defect, entry one's species. It is a
frozen list of the five Reliquary monsters that predate art-wave 2 and that this branch never
touches. The Tower roster is excluded because Heaven is bright by design and folding it in
would widen the ceiling until nothing could fail.

Two things fell out of it on the first honest run, and the second is the better lesson.

The first: the three lifted bodies land at 44.4, 44.9 and 32.9 against a 68.3 ceiling, with
16–35 points of headroom. That is real evidence for what had previously been an adjective —
the lift did not take them out of their own cast.

The second: `reliquary.monster.bloat-fiend` came in at **86.0, over the ceiling**, and it is
not one of the lifted three. The obvious explanation was ready to hand — its owner-approved
belly glow is large, so surely the accent is dragging the median. **That explanation was
written, then measured, and it is false.** Only 3.5% of the Bloat-Fiend's opaque pixels (50 of
1415) carry chroma ≥ 45, and excluding them outright still leaves the body at 62.0. The belly
is not a small hot spot; it is a large *pale* one — low-chroma enough to count as body on this
instrument and bright enough to carry the median over the cast's ceiling. It is pinned, with
that reason rather than the plausible one, because the belly is an owner ruling (style guide
§10.2: the Exploder is the roster's one approved exception to the accent being the gaze) and a
gate that reads approved art as a defect and corrects it is a failure this file already has
several names for.

Nearly shipping a pin justified by a mechanism that does not hold is the same error as the
thumbnail comparison, twice in one hour, from the same hands. Both were caught by measuring
the thing the sentence claimed.

**The rule.** Ask what your check reads, then ask what your change moves, and say the two out
loud next to each other. If they are different quantities, the check is not evidence about the
change however green it is and however well built it is — its correctness is not the issue and
arguing about its quality is a distraction from the fact that it is pointed somewhere else.
The dangerous version of this is not a bad check; it is a *good* check, adjacent to your
change, that everyone including you is glad to see go green.

**How to apply.** When a change is guarded by a check you did not write for it, that is the
signal, not a reassurance. Name the quantity the change moves, grep for the check that reads
*that*, and if there is not one, you have found the work. And when your only instrument is
your own eye, say so plainly and render the comparison at matched scale before putting an
adjective in front of anyone who will act on it.

## A twenty-ninth instance: two gates that agree on the rule and disagree on the pixel

The art style guide's §1.4 gives a hand rule for a hot pixel — HSV saturation above 0.55
and a channel above 90 — and every `art/*/finish.ts` script measures its own output with
it. `npm run chroma` enforces the same design rule (the hero carries no hot accent; the
monsters do) with a different number: `render/grade.ts#chroma`, saturation × value, ranked
against every committed monster's loudest 2+px colour. Both are correct readings of §1.4.
They are not the same detector.

Wiring the 21 summon bodies (`art/summon-wire`), the finish script quieted every §1.4-hot
pixel, reported `0/635 opaque px hot` on the auto-turret, and wrote the PNG. The first run
of `chroma` over `summon.*` failed it:

```
 FAIL  summon.auto-turret: accent chroma stays below every monster's  — >= reliquary.monster.bone-archer (49.8), boss.nameless (47.8), boss.ferryman (49.8), boss.labyrinth-minotaur (45.5)
```

The pixel was the turret's cream-gold `#f7cb76`: saturation 0.52, so not "hot" by the hand
rule, and value 0.97, so 50.6 on the scale the gate ranks by — louder than four shipped
monsters' own accents. A bright, moderately saturated pixel splits the two definitions,
and nothing in either file said they could disagree.

**The rule.** When two instruments enforce one design rule with two formulas, the gate's
formula is the authority and the producer must use it. The finish script now quiets a
pixel that trips *either* detector, importing `chroma` from the same module the gate does
rather than re-deriving a third. The cheap tell that this family was present: a producer
reporting a clean zero on its own metric while the gate on the same file goes red — that is
not a flaky gate, it is a second definition.

**Why it belongs in this file.** Every entry above is one instrument that could not see.
This one is two instruments that could both see, each honestly, and would have disagreed
forever if the second had not been pointed at the first's output. The scope extension to
`summon.*` was a PM ruling on the grounds that a rule living in prose is a rule nobody
measures; it paid for itself on its first run, and what it found was not a bad sprite but
a gap between two good detectors.

## A thirty-fifth instance: a derivation frozen into a copy, which then stops deriving

Every entry above is an instrument that reads the wrong thing. This one is an instrument that
read the **right** thing once, was then written down, and kept reporting that one reading
forever. It is the shape a shortcut takes when it succeeds.

The setup is the acceptance gate. `npm test` is 43 steps, of which `npm run smoke` alone is
15–19 minutes — roughly 95% of the wall clock. The owner approved splitting it: a branch runs
the cheap steps, and the full chain is reserved for the single integration gate on the merged
result. The natural way to express "the test chain minus smoke" is to derive it:

```
scripts.test.split(" && ").filter((s) => !/\bsmoke\b/.test(s)).join(" && ")
```

The natural way to express it a *second* time, an hour later, when the one-liner is tiresome to
retype, is to paste the 42 steps it printed. The two are indistinguishable on the day they are
written — same steps, same order, same green — and they diverge the moment anybody adds a step
to the chain. Which is to say: they diverge on exactly the branches where the gate matters
most, because **a branch's own new check is the one step nothing else in the repo has ever
run.** A frozen copy skips it and reports 42 green steps, and the number 42 is not wrong in any
way a reader can see.

This is reported to have already happened here, in the tool built to save the time: on one
branch the derived chain came to 37 steps and the hand-frozen literal to 36, and the missing
one was that branch's own new gate. It was caught by *comparing the two counts*, not by reading
either of them — a single count is a plausible number, which is this document's entire subject.

**The cure was a rule, not a check, and then a check behind the rule.** `tools/gate.mjs` reads
`scripts.test` at run time and has no list in it; `tools/check-scripts.mjs` fails if
`scripts.gate` ever stops routing through that file or grows an `&&`, because chaining is the
defect itself rather than a symptom of it. The copy cannot come back by editing `package.json`,
which is the only place it would come back.

**Falsified before being believed**, per the rule at the foot of this file. A throwaway step was
prepended to `scripts.test`:

```
  scripts.test has 44 steps; running 43, deferring 1
--- gate step 1/43: npm run __canary
CANARY RAN
  gate: step exited 3 — npm run __canary
```

43 rather than the 42 it runs without the canary, the step's own output on stdout, and exit 3
arriving intact at the shell — the addition was picked up, executed, and its failure propagated.
Then the rule was falsified from the other side by freezing `scripts.gate` into the literal
42-step chain, which went red at `npm run harness` with the whole frozen line printed back.

**The rule.** When you write something down because deriving it is tedious, you have converted a
question into an answer, and the answer has no way to notice that the question changed. Ask what
would have to happen for the copy to become wrong, and then ask whether anything at all would
say so. If the honest answer is "nothing, it would just quietly do less" — that is this entry,
and the fix is to make the copy impossible rather than to promise to refresh it.

## A thirty-sixth instance: a silent narrowing, which makes the evidence agree with itself

`GRANTABLE_ABILITY_IDS` in `src/progression/index.ts` is the pool an epic-or-better weapon,
ring or necklace rolls its **granted skill** from — one of the few things in the game that
legitimately crosses class lines. Twelve classes were named in it. It ended like this:

```ts
  "warden.vine_snare",
].filter((id) => id in ABILITY_BY_ID);
```

Five of the twelve ids had been renamed out from under the list at some earlier point. The
filter discarded them without a word, and the pool players actually rolled from was seven.
Ranger, Shaman, Warlock, Berserker and Stormcaller abilities had stopped appearing on
granted-skill gear entirely — five of twenty-one classes contributing nothing — and nothing in
the repo was red.

## Why this is not simply "a list went stale"

The stale list is the defect. The entry is about how the defect **defended itself**.

This work was assigned with a brief that said, in good faith: *all 7 currently resolve, so
there is NO live defect; this is a latent shape, not a bug hunt.* That sentence is correct and
it is blind, and the two facts are the same fact. **Anyone who reads
`GRANTABLE_ABILITY_IDS` — a person, a probe, a future gate — is handed the output of the
filter.** The survivors are all that exists by the time the name resolves. So every possible
reading of the live value concludes that the entries in it resolve, which is true, complete,
reproducible, and says nothing whatsoever about the question being asked.

That is this file's founding rule wearing an unfamiliar coat: **the check's scope came from
the thing under test.** Not a hardcoded seed list, not a fixture, not a threshold — a
`.filter` in the value's own definition, quietly making the population match the assertion.

And the population was *knowable*. The declaration sits five lines above the filter; the count
going in is twelve and the count coming out is seven. **No line anywhere compared the two.**
The defect was one subtraction away from visible for its entire life, which is the part worth
sitting with — it was not hidden behind a simulation or a statistical margin. It was hidden
behind nobody having a reason to look, and that reason was removed by the filter.

## Why nothing downstream noticed

A curated list has no length anyone remembers. Nothing in the game says "granted skills should
draw from twelve classes" — the only statement of intent is the prose comment above the list
("one flashy, self-contained ability per class"), and prose is not an instrument. A player
finding a granted skill got a real, working ability every time; the five that never appeared
left no gap to notice, because an absence in a random pool looks exactly like luck.

This is the failure mode of every defensive filter over authored content. It cannot distinguish
*retired on purpose* from *misspelled* from *renamed and nobody followed*, and it resolves all
three identically: delete the content, continue, say nothing. It reads as a safety net and it
is the thing that hides the fall.

**The rule.** A filter that can only ever discard authored input is not a guard, it is a
silencer — and if the filtered value is what everyone reads, it also destroys the evidence that
anything was discarded. Where you must filter, count both sides and say so out loud. Better,
make the discard impossible: the list is now `readonly AbilityId[]` against a union derived from
the 210 authored abilities, so a renamed ability is a TS2322 on the line that names it, and the
filter is gone with a comment saying it must not return.

## The falsification, which is the half this project skips

Getting to a real compile error took three attempts, and **the first two compiled**:

1. `function abilityTable<const T extends readonly Ability[]>(list: T): T` — a `const` type
   parameter preserves literals for values written inline. These abilities are already-annotated
   consts, so it preserved nothing.
2. `} satisfies Ability;` without `as const` — `satisfies` supplies the contextual type during
   inference, so `id: "ranger.splitshot"` widens against the interface's `id: string` exactly as
   the annotation it replaced did.

Both produced a green `tsc` and a plausible-looking derived type. Both were caught by the same
one-line move: assign `"definitely.not.real"` to the derived type and **demand a red**. Only the
third attempt (`} as const satisfies Ability;`) gave one, naming the full union — and then gave
the same error for all five real stale ids.

Neither blind attempt would have been caught by reading it, by review, or by the gate. A type
that has silently widened to `string` looks identical at every call site to one that has not.
**A derived type is an instrument, and an instrument you have never watched go red is one you
have not tested** — which is precisely the line this file proposes for `CLAUDE.md` below.

## A thirty-seventh instance: git's conflict detector is a proximity heuristic, not a semantic one

Every entry above is a check someone built. This one is a check nobody built, that everybody
relies on many times a day, and that most people do not think of as a check at all: **a merge
or a rebase completing without conflicts.**

The reading it invites is "nothing I did contradicts anything anyone else did." What it
actually reports is narrower by a wide margin: *no two people edited the same lines.* Those
are different claims, and the distance between them is measured in lines of text — which is to
say, in a quantity that has nothing to do with whether two statements can both be true.

## The instance

`docs/docket.md` item §29 was reconciled on the morning of 2026-09-11 and given the status
**STILL OPEN — needs an owner call before anyone builds it**, cited to its design record and
to the code.

That evening, the owner ruled on §29. The ruling was appended at the foot of the same file,
roughly 300 lines below the status word it falsified. Rebasing onto it produced
`Successfully rebased and updated refs/heads/...` with no conflicts and nothing to resolve,
because the two edits were nowhere near each other. Git was not wrong; git was answering a
different question. The branch would have landed carrying "needs an owner call" for an item
the owner had already called.

It was caught by reading the incoming commit rather than by any signal in the rebase — and it
was read only because its subject line happened to name the item. That is luck standing in for
a process.

## The same species, twice, in one batch — with the distance made larger

Recorded as one-offs at the time, and they are the same failure:

- **A pin that outlived its subject.** `tools/modkeys.ts` pinned `ultimateBounces` and
  `ultimateProjectiles` as known-dead keys "awaiting an owner call". A different branch
  *deleted those keys from the vocabulary entirely*. Different files, zero conflict markers.
  The pin then named keys that no longer existed — and the check's own "still dead" logic
  reads a vanished key as **now live**, so a stale pin does not fail quietly, it fails
  backwards.
- **Codex copy for stats that were being removed.** `src/data/affix-glossary.ts` arrived as a
  *new file* describing two stats another branch was deleting. **A new file cannot textually
  conflict with a deletion**, so there was nothing for git to flag at any distance.

Both were caught by `npm run check` and by luck. Neither was caught by `markers`, which is
correct to have missed them: there were no markers. That tool's own name for this is already
in this file at entry 17 — *"no conflict markers" is not "no conflict"* — and entry 37 is that
observation generalised. The variable is **distance**: same lines conflict, 300 lines apart do
not, different files never do, and a new file against a deletion cannot. Semantic contradiction
is flat across all four; git's detection falls off a cliff after the first.

## Why it belongs in this file, and why this instance is the sharp one

**It happened to a reconciliation sweep.** The one artefact in the repository whose entire
purpose is to make status words true — written specifically because §6 had sat wrong for hours
— went stale inside its own file within two hours of being written, by a mechanism that
reports success.

So the lesson is not "sweeps don't work." It is:

> A sweep does not inoculate a status word, it only resets the clock.

Which is the same shape as this document's founding rule, arriving from an unexpected side:
**the check's subject came from somewhere other than the thing under test.** The subject of a
clean merge is the diff. The thing under test is whether the file now says true things. Those
coincide only when the contradicting edits happen to be adjacent, and nothing arranges for them
to be.

## What would have caught it — and this half is not a tool

Plainly: **nothing automatic would have.** It is worth resisting the reflex to end this entry
with a check, because the honest answer here is a habit.

A linter over status words is the obvious proposal and it is a bad one. It would have to know
that a `## Owner rulings` section at the foot of a file speaks to a `## 29.` heading 300 lines
above it, that "ruled" supersedes "needs an owner call", and that a *record's* status line
outranks a *docket's* — all of which is the semantic judgement the merge could not make,
relocated into a regex. This project has shipped that mistake: entry 26 is a process rule with
a blind grep inside it.

The process fix, offered by the PM about their own work:

> Whoever appends a RULING to a file owns re-reading what that file already says about the
> same item.

It is cheap, it is specific to the moment where the contradiction is *created* rather than
where it is later discovered, and it puts the obligation on the person who has the semantic
knowledge — the one who knows the ruling settles §29 — instead of on a resolver who has only
two hunks of text. The general form, for anyone landing work into a long-lived document:
**a clean merge tells you your edit applied; it never tells you your edit is still true. Go
read what the file already says about your subject.**
## A thirty-third instance: a bound so cautious it discarded a real signal

Every entry above this one is an instrument that **reported**: it ran, produced a plausible
number, and could not see the thing it was asked about. This one is the mirror image, and it
is worth its own row because the reflex the other thirty-two train — *tighten the bound, be
more careful* — is exactly what causes it.

**Where it showed up.** `tools/execute-attrib.ts` (docket §38) splits an ultimate's damage
into its direct packet and its execute rider. It does this without knowing the coefficient:
THE EXECUTE RULE returns zero at or above the threshold, so a hit on a healthy target is a
clean reading of `base * attack`, and every hit below the threshold is then that base plus a
residual. The split only holds if the ability fires **one** damage packet per cast, so it
carried a guard — if the above-threshold amounts are not all the same, assume several
packets and refuse to report.

The guard pooled hits across seeds. `geared()` rolls different gear per seed, so the caster's
attack damage — and therefore the ability's base amount — differs from run to run. A
perfectly clean single-packet ability looked like a mixture of several.

The tell was a one-seed pilot printing

```
    DEBUG amounts above: 1780,1780,1780,1780,1780,1780,1780,1780,1780,1780
    (not separable: 13 hits, several distinct base amounts per cast ...)
```

— a base that is *literally constant to the unit*, declared unreadable. On a single seed the
guard's own premise held perfectly; pooling twelve seeds is what broke it. The fix is to
compute the split **per run** and pool the results afterward, and to print how many runs were
separable so a thin sample is visible instead of silent.

**Why it is a distinct shape.** Item 18's defect is a bound that grows to fit whatever it is
handed, so it can only ever conclude that the widest thing is the widest thing. This is the
same error with the sign flipped: a bound drawn from a **mixture of populations the
instrument itself created**, so it concludes that a clean signal is noise. Both come from
taking the bound from the data instead of from a fixed reference the code under test cannot
move — but they fail in opposite directions, and only one of them is loud. A bound that is
too loose manufactures a green check somebody eventually trips over. A bound that is too
tight prints `—` and looks like diligence.

**The reusable half, and it is bigger than the guard.** The tool this guard sits in exists
because of a related blindness worth stating as its own rule: **when a value is composed
from many sources, an instrument that prints the authored value is printing a number no code
path uses.** `executeMissingHealth` is authored on 14 packets and *added* by 17 tree nodes,
mutations and a relic. Every surface in the repo — the packet, the design records, the
acceptance tool that pins the rider's properties — reported the authored `0.2`, correctly.
The game cast with `0.95`. Three fixes in a row reasoned soundly about the wrong quantity,
and nothing contradicted them because **nothing anywhere printed the effective value**. So:
*print the composed value, not the authored one*, and where a value can be added to from N
places, treat "what does it resolve to?" as a question the instrument owes an answer to.

**The cheap tell.** A refusal is a result, and it deserves the same suspicion as a number.
When an instrument declines to report, check whether its *premise* holds on the smallest
possible sample before widening — here, one seed. If the guard passes on one and fails on
twelve, the guard is reading across a population boundary, not detecting the condition it
names.

**A companion, from the same tool and the same afternoon, already covered by an existing
rule.** The ablation table averaged time-to-clear over *all* runs, including failures. A
failed run ends when the bot dies, which is early, so a configuration that lost more often
looked *faster*: the tool reported the Ranger clearing raid bosses **2.8% quicker with its
ultimate deleted**. That is `docs/raid-party-scaling.md`'s confound — a duration metric lies
when the thing you changed also changes whether the run finishes — arriving from the other
direction, and it is filed here as a sighting rather than a new species. What caught it was
a **sign that made no sense**, not a magnitude that was merely off; a delta pointing the
wrong way is the cheapest evidence a metric is confounded, and it is worth spending a moment
on the direction of every number before the size of it.
## A thirty-second instance: noise that did not widen an error bar but invented a mechanism

Every entry above is an instrument that could not see something. This one saw fine. The
**sample** was too small, and what a too-small sample produced was not a fuzzy number — it
was a confident, plausible, *structural* claim about how the game works.

Measuring docket §39's cadence dial, an early 8-seed sweep read the gap between boss casts
like this:

```
cad 1.00   gap 2.36s
cad 0.75   gap 1.94s
cad 0.60   gap 1.95s     <- stopped falling
```

The obvious reading, and the one nearly written into the design record: **the dial bottoms
out.** There was even a ready mechanism for it — `boss.ts:206`'s 0.35s stall beat, taken
whenever no card is off cooldown. A rotation tightened past the point where cards come back
would stall rather than cast, so a floor at ~1.95s was not just consistent with the data, it
was *explained* by the code. Two independent things agreeing is normally the moment you stop
checking.

At 144 runs per point the floor is not there at all:

| `BOSS_CADENCE` | 1.00 | 0.90 | 0.80 | 0.70 | 0.60 | 0.50 | 0.40 |
|---|---|---|---|---|---|---|---|
| gap | 2.40s | 2.25s | 2.12s | 1.99s | 1.85s | 1.71s | 1.57s |
| stalls/fight | 15.5 | 13.9 | 14.4 | 12.6 | 11.7 | 11.3 | 10.8 |

The curve is smooth and monotone, and the proposed mechanism runs *backwards*: stall beats
go **down** as the rotation tightens, because the dial scales the cooldowns too, so more
cards are ready, not fewer. The 1.95s reading was two adjacent cells of noise, and the
explanation was a story told about them after the fact.

**The reusable half, and it is one sentence: noise that arrives with a plausible causal
story is worse than bare noise, because the story is what stops you widening.**

Bare noise announces itself — a number that looks wrong gets re-run. This did not look
wrong. It looked *explained*. The stall beat is real, it is in the file, and it genuinely
would produce a floor if the dial worked the way it appeared to; two independent things
agreeing is normally the moment you stop checking, and here one of the two was a coincidence
in two adjacent cells. Everyone already knows a thin sample gives a noisy number — this
repo's own campaign comparison is a whole CLAUDE.md section about that. The step past it is
that a noisy *curve* has a shape, a shape invites a mechanism, and a mechanism found in the
source to match it reads as confirmation rather than as the coincidence it is.

What would have shipped is the part that makes this worth an entry: not a wrong number but a
wrong *sentence about the game* — "the cadence dial cannot be pushed past 0.75" — in a design
record, with a code reference attached, that no future reader would have had any reason to
re-derive. The owner's eventual ruling was `BOSS_CADENCE = 0.6`, a rung that false finding
had already declared unreachable.

**The tell is cheap and it is not statistical.** When an explanation arrives quickly and fits
well, that is the moment to ask how many data points define the feature it explains. Here,
two.

**A second, smaller one on the same branch, worth a paragraph because it looks like a bug
and is not.** After the change landed, re-running the same nominal baseline through the
shipped code gave 35.9% where the runtime-patched baseline had given 39.6% — 3.7 points
apart for what was meant to be an identical configuration. Nothing was wrong. The patched
path multiplied by `1.0`; the shipped path multiplies by `0.7` and the tool divides it back
out, and `1.85 * 0.7 * h * (1/0.7)` is not bit-identical to `1.85 * h`. One float away, a
cast resolves a tick earlier, the shared `Rng` stream reorders, and the rest of the fight is
a different fight. **A same-binary control is only a control if it is the same arithmetic,
not merely the same intended value** — so the two runs are independent samples that happen
to agree on direction (−22% and −26% relative), and it would have been wrong to report
either as a re-measurement of the other.

## Proposed for the owner, not adopted here

`CLAUDE.md` already carries the two rules quoted above, in the difficulty-philosophy
section. If a line belongs there, it's short and sits next to them:

> Before quoting a check's number, ask whether you have ever watched it change in
> response to the thing you're worried about — on this instrument, recently, on purpose.
> If not, you don't know that it can. This applies as much to a check you wrote an hour
> ago as to one you inherited.
