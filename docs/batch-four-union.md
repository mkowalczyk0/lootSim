# Batch four: the union order, and the question that is still open

Written 2026-09-11 by the session that owns `docs/blind-instruments-index`, at the point
where all sessions were stopped. It exists because the reasoning below lived only in
messages between sessions, and those are gone. **Nothing here is a decision you have to
honour — it is a record of what was known, so a fresh integrator does not have to
re-derive it or, worse, not know it was ever derived.**

## What batch four was going to be

Roughly eight branches, four of which add an npm script and therefore a step to the `test`
chain in `package.json`: this one, plus work on ultimates/Engineer/summons, a summon seam,
a rewards-fixture split, an affix codex, six Hell monsters, and possibly the Nine Circles.
The integrator was hand-unioning those four `package.json` deltas.

## Why this branch should merge first

This branch adds **duplicate-step detection to `npm run harness`** (`tools/check-scripts.mjs`):
no step may appear twice in the `test` chain, every step must be a defined script, and it
prints the step count it walked.

A hand-union of four deltas is exactly what produces a duplicated step — two branches each
adding `&& npm run X` at a different point in the chain merges cleanly, runs X twice,
fails nothing, and shows up only as a gate that takes longer than it should. `markers`
cannot see it (there are no conflict markers) and the bundle-path half of `harness` cannot
see it (it reads script *bodies*, not the chain).

**So the check is only useful while the union is being built, not after it.** Merged last,
it reports the duplicate on the gate run after the union is already assembled. Merged
first, the integrator can run `node tools/check-scripts.mjs` after each subsequent delta —
it takes about a second, imports only `node:` builtins, and needs no `npm install`.

That was the agreed order: **this branch, then everything else.**

## The open question, and it is the important half

`harness` compares steps to each other and to the list of defined scripts. **It knows
nothing about what any step needs.** A union that places a step before something it depends
on still passes every check in the repo.

So each script-adding branch owes an answer to one question: **does your step have a real
ordering constraint, or is it free?**

This branch's answer, as the worked example: **free.** `npm run blindindex`
(`tools/blind-index.mjs`) imports only `node:` builtins and reads one markdown file. It has
no dependency, needs no build, and would run correctly anywhere in the chain — including in
a checkout that was never `npm install`ed. The position it currently holds (second, right
after `markers`, before `harness`) is a *preference*, not a constraint: it and `markers`
are the only two steps that need no install and finish in under a second, so a text-level
defect fails the gate immediately instead of after `check`. `markers` must stay first —
that is a standing project rule and predates all of this. **Move `blindindex` freely if a
constrained step needs its slot.**

The answers from the other three script-adders were being collected when work stopped, and
**were never received.** Ask before unioning rather than inferring from the diff.

The integrator's stated plan, worth keeping: union in **declared-constraint order first,
free steps after**, and say in the merge message which steps were placed by constraint and
which by preference — so that if a later batch reorders a free step and something breaks,
the merge message is the record of what was actually known at the time.

## What this branch's checks do not see

Stated here as well as in `tools/blind-index.mjs`'s header, because it is the part most
likely to be mistaken for coverage:

- `blindindex` compares the index table in `docs/blind-instruments.md` against the entries
  *structurally* — a row per entry, each number used once, no gaps. It has no opinion on
  whether a row's wording is accurate, whether two differently-worded rows name the same
  failure shape, or whether a number was assigned by an integrator rather than derived
  locally. The near-duplicate pair of entries that made the index worth writing would still
  pass it, had both entries held distinct numbers.
- `harness`'s new half catches a duplicated or undefined step. It cannot catch a
  *mis-ordered* one, which is the failure this document is actually about.

Both defects found in this branch on the night it was written were found by a person
re-reading their own work, not by any check in it.
