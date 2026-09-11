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

## Proposed for the owner, not adopted here

`CLAUDE.md` already carries the two rules quoted above, in the difficulty-philosophy
section. If a line belongs there, it's short and sits next to them:

> Before quoting a check's number, ask whether you have ever watched it change in
> response to the thing you're worried about — on this instrument, recently, on purpose.
> If not, you don't know that it can. This applies as much to a check you wrote an hour
> ago as to one you inherited.
