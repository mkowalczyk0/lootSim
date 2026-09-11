# Gate completion signals: five ways "it finished" was false in one evening

Five sessions gated in parallel on one shared machine the night of 2026-09-10, and every
mechanism anyone reached for to answer "has it finished, and did it pass" lied at least
once. This is the record, so the next multi-session night doesn't rediscover it live.

## The thesis: never match a process by name — attribute it, then act on the PID

Three of tonight's five incidents are one mistake wearing different clothes. Whenever
several sessions run the same tool (`smoke.mjs`, spawned fresh per invocation by
`tools/run-tool.mjs`), a shell pattern that matches the *name* rather than a specific,
attributed PID cannot tell "my process" from "somebody else's process that happens to
share a name" — and depending on which verb you apply to that ambiguous match, you get a
different-looking failure that is actually the same error:

- **Match by name to kill →** you kill other sessions' work. One session ran
  `pkill -f "lootsim-tool-.*smoke.mjs"`, meant to stop its own gate; it matched every
  session's smoke process on the machine and killed all of them. A second session later
  the same evening armed a `nohup … smoke.mjs &` from a shell that then exited, which
  reparents the child to PID 1 — invisible to that session's own bookkeeping — and a third
  session correctly identified it as an orphan and killed it.
- **Match by name to wait →** you wait on other sessions' work, forever. A background
  wait-loop from an earlier turn polled `pgrep -f "node_modules/.cache/smoke.mjs"` (or a
  PID check `&&`-ed with the same name match, which makes the correct half of the
  condition useless) and could only exit once *no session anywhere on the machine* was
  running a smoke test. With five sessions gating all day, that moment never arrived.
  Four such loops were found still polling seven and ten hours later, at 0.0% CPU,
  burning nothing but showing up in every process listing as if they were live gates —
  invisible to every other signal in this document, and found only because someone
  finally read what each PID's command line actually was.
- **Match by name to count →** the room looks permanently full. A load-check phrased as
  `ps aux | grep "[s]moke.mjs" | wc -l` returned nine when only five processes were
  actually consuming CPU; the other four were the stranded wait-loops above, still
  matching the name, contributing nothing. A session avoided starting a gate for a real
  window of time because a name-count said the machine was busier than it was.

The fix in all three cases is the same: **identify the specific process you mean —
by the PID you launched, or by asking the resource itself who holds it — and act on
that, never on "anything matching this name."** 56's corrected wait loop is
`while kill -0 $pid; do sleep 5; done`: it exits the instant *that* process exits,
independent of what anyone else on the machine is doing.

## A related but separate family: a status report, not a name, lying

Two more incidents share a different shape — not an ambiguous name, but a **status that
claimed knowledge it didn't have**:

- **A killed process's exit code said success.** A gate was killed partway through its
  campaign section (log stopped at "dive 20"); the harness reported `exit code 0`
  regardless. The log had already stopped meaning anything; the exit code never caught up
  to that fact.
- **The same failure, inverted.** A different session's wrapper process was killed
  (`exit 144`, no closing line in its own log) while the `smoke.mjs` child it had spawned
  detached and kept running to a real, successful completion. The wrapper's exit code said
  failure about a run that actually passed.
- **A tool-level background flag and a shell `&` don't compose.** One session ran
  `npm test > log 2>&1 &` while *also* passing a "run in background" flag to the tool
  driving the shell. The tool tracked the launcher shell, which returns the instant it
  hands the real command to the background — so a "completed, exit code 0" notification
  fired almost immediately, while `npm test` kept running fully detached for several more
  minutes, still writing to the same log file. This is the same trap as the orphaned
  `nohup … &` above, from the other direction: there, backgrounding-inside-a-shell-that-exits
  detached a process from its own session's tracking; here, backgrounding at both the
  shell level and the tool level did the same thing to a single command. Two sessions hit
  this exact shape in one evening.
- **A quiet log window looked like a finished one.** A stability check that declared a
  gate "done" once its log stopped growing for 60 seconds was fooled by ordinary
  contention: nine processes (five real, per the count problem above) sharing eight cores
  produces long, genuine lulls between output bursts. The file was still open the whole
  time.

None of these are the name-matching mistake — an exit code, a background-completion
notification, and a fixed quiet-window are all *reports about* the process rather than an
ambiguous reference to one. They failed for a different reason: on a machine under
contention, a report generated by watching the wrapper, the launcher, or a timing window
can be wrong in either direction, independent of whether the underlying work succeeded.

## A sixth, more insidious one: grepping the log for "fail" matches the word, not the verdict

`npm test`'s own suites assert negative behaviour extensively and by design — "crafting
without materials fails and refunds nothing," "reforging without coins or materials fails
and spends nothing," and dozens like them, all green, all containing the literal
substring `fail`. A quick `grep -i fail` over a finished log to sanity-check it for
disasters therefore has two failure modes pointed in opposite directions: on a fully green
run it flags a fistful of matches that are test *names* asserting expected failures, not
failed tests, crying wolf about a run that passed cleanly; and precisely because that
noise is expected and voluminous, it trains whoever's reading to skim past matches on
sight — which is exactly the habit that would bury one real `FAIL` in the middle of forty
harmless ones. Unlike every other entry here, this one does not lie: `grep` returns
exactly the lines containing the string asked for. The mismatch is that the string was
never the question — a green run and a run with one real failure can produce the *same*
grep output shape, differing only in a single word two dozen lines apart. It is the same
species as `docs/blind-instruments.md`'s entry on a perfect measurement of the wrong
quantity, arrived at here by a search over a log rather than a check over the game.

The reliable read is the suite's own terminator line (`ALL CHECKS PASSED`, or the
per-tool equivalent) together with the log's line count holding steady once the writer
process has actually closed the file (see below) — not a grep verdict on its own. `grep`
is still useful as a place to go *look*, narrowing forty pages down to the handful worth
reading with your own eyes, exactly as it was used to catch this: but it is a pointer to
candidates, never itself the answer to "did this pass."

## The one signal that didn't lie: ask the file who's writing to it

`lsof <path>` lists every process that currently holds a file open. A process that has
truly finished has closed its handles; one that is still running, however slowly, has
not — and unlike a bare process list, `lsof` is naming the *resource* and asking it who is
touching it, rather than naming a *process* and hoping the name is unambiguous. That is
the same principle as the thesis above, one level down: **assert against the thing
itself, the way this project's own `docs/blind-instruments.md` already argues for every
check in the game** — not against a report, a status, a timer, or a name that merely
resembles the thing.

```sh
while lsof "$LOGFILE" >/dev/null 2>&1; do sleep 20; done
```

This is the correct instrument for "has this specific gate run finished": it doesn't care
how many other sessions are doing the same thing, doesn't trust an exit code from a
process that may have been killed or detached, and doesn't guess from a quiet window
that could just as easily be contention.

## A nastier corollary: a detached run is indistinguishable from an abandoned one

The tool-level-background-plus-shell-`&` incident above has a sequel worth stating on its
own, because it isn't about completion signals — it's about what a *correctly running*
gate looks like from the outside once it's been detached. A run affected by that trap
reparents to init (`ppid 1`) the moment its launcher shell exits, which is the exact same
process shape as an abandoned `nohup … &` that nobody is waiting on anymore. **The same
detachment that makes a run invisible to its own launcher makes it indistinguishable from
one nobody is tracking at all.** Both halves of that were live on this machine
simultaneously the same evening: one session was killing orphaned processes by name while
another session's gate — correct, running, near the expensive end of its chain — had just
been reparented to init by the identical mechanism, and would have read as exactly the
kind of stray process worth sweeping. It survived only because the sweep had already
stopped matching by name (see the thesis above) before the detachment happened to occur.
Nothing about the run itself was wrong; only its shape in a process listing was
ambiguous, and a process listing is a name, not an attribution.

## Footnote: audit load by CPU, never by expected command name

A related, smaller version of the same lesson. `docs/docket.md` §1's standing rule is to
audit load by CPU (`ps aux | awk '$3 > N'`), not by counting how many processes share a
name a gate is expected to spawn — the count-to-check-load incident above is exactly why:
a name match doesn't distinguish a process actually consuming a core from one sitting at
0.0% CPU because it's a stranded loop waiting for a condition that was never going to
become true. The rule was already written down correctly; the incident was in
transcribing it as a bare count during a live handoff rather than in the rule itself.
