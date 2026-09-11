# Prose that outlived its decision — a sweep, not a fix

Docket §28. Scope was `CLAUDE.md`, `docs/docket.md`, and the design records under `docs/`,
checked against master (`8ef83ab` at the start of this sweep) and the branches each claim
cites. **Report, don't rewrite** — per instruction, nothing below has been edited into the
files it's found in. `CLAUDE.md` specifically was not touched at all; every `CLAUDE.md`
finding here either already has, or now has, an entry in `docs/claude-md-pending.md`.

## Method finding, first, because it explains why §6 slipped through

**"Verify the citations" and "verify the claim" are different sweeps, and only the second
catches a §6-shaped mistake.** Every explicit commit hash cited in `docs/docket.md` (12 of
them) resolves and is an ancestor of master — checked with `git merge-base --is-ancestor`
on each. That's citation-accuracy, and it was already clean; f1 had checked it earlier
tonight and this sweep reproduces the same clean result. **§6 wasn't a bad hash — it was a
whole document (`docs/last-monster-search.md`) that closed a claim the docket's own status
line never got told about.** A hash check cannot see that, because the docket's citation
of `bb2fab2` (the minimap half) was, and remains, entirely correct; the false half of the
line has no citation to check at all, just a status word ("STILL OPEN") that nothing
automatically reconciles against a design record's own status line. The actionable version
of this method: **when a docket item's status is a word rather than a hash, grep `docs/`
for a design record on the same topic and read its own status line before trusting the
docket's.**

---

## 1. `CLAUDE.md` — highest blast radius, every session reads it first

Nothing here is a fresh find — both were already caught and drafted before this sweep
started, in `docs/claude-md-pending.md`. Confirmed both are still accurate against master
as of this sweep (the "current text" each quotes still matches `CLAUDE.md` verbatim) and
flagging them here because a stale-prose sweep that doesn't check whether `CLAUDE.md` is
still exactly as stale as the pending doc says it is would be trusting its own citation the
same way §6 trusted a hash.

### 1a. The raids bullet ("Solo in v1")

**Where:** `CLAUDE.md`, "Raids: the war's set pieces" section, the `Solo in v1` bullet.
**Claims:** raids are solo, and "one branch in `handleHubInteraction` is all that stops a
party raid."
**True:** raids have been co-op since `feat/coop-raids` (merged `548f218`), on an explicit
owner decision (2026-09-10) to enable it *without* answering the scaling question — no
tuning number moved. The named gate is gone; `main.ts` around line 142 is the current
raid-picker path.
**Already tracked:** `docs/claude-md-pending.md` §1 — and its own "Update, checked while
writing this page" note already gets the current reality right: it correctly says the
draft it's proposing (built around `investigate/raid-party-scaling`'s `singleBodyPartyScale`
fix, tip `c6baa86`) describes code that **never landed**, and that the actual fix that
shipped changed nothing about `partyScale`. **Worth restating plainly because the file
buries it below a "Proposed text" block that reads, if skimmed, like the thing to paste
in:** that proposed text is not what's true today. Anyone pasting `claude-md-pending.md`
§1's "Proposed text" verbatim into `CLAUDE.md` without reading its own self-correction
underneath would introduce a *new* false claim (that `singleBodyPartyScale` is wired into
`profileFor`) in the act of fixing an old one. The self-correction is accurate; the
proposed text above it is not; the file would read better with the proposal struck rather
than left for someone to read past.

### 1b. The two co-op loot passages

**Where:** `CLAUDE.md`, "Multiplayer: one simulation, four people" (the `Loot is per-hero
and physical` bullet) and "Every class has its own save" (the `round-robin` paragraph).
**Claims:** loot is per-hero and physically owned by whoever's credited; the clear cache
hands drops to party members round-robin.
**True:** `85bdee6` made loot shared and instanced — a drop is one pickup, collecting it
credits every present hero with their own copy, and the round-robin cursor and `shareOut`
are gone. `docs/shared-loot.md` is the design record.
**Already tracked:** `docs/claude-md-pending.md` §2&3, with proposed replacement text for
both passages, checked directly against `src/game/dungeon.ts` rather than taken from the
commit message. Confirmed both "current text" quotes still match `CLAUDE.md` verbatim.

### 1c. `docs/handoff.md`'s attribution of these drafts is itself wrong, and it's live

**Where:** `docs/handoff.md`, "§4. CLAUDE.md edits awaiting one-line owner approval."
**Claims:** "Four drafts are written and none has landed," listing "97's raids bullet"
and "26's two co-op loot passages" as already-written drafts.
**True, per `claude-md-pending.md`'s own investigation (which this sweep re-confirms):**
no draft of the co-op loot passages existed anywhere in the repository until the session
that wrote `claude-md-pending.md` wrote them — not on any branch, not uncommitted in any
worktree. The attribution to "26" is unsourced; the passages were written by whoever
authored `claude-md-pending.md`. Separately, "97's raids bullet" (mine, handed to the PM
in conversation, not committed anywhere) describes the same pre-decision assumption §1a's
proposed text does, and is superseded by `claude-md-pending.md` §1 — which is itself, per
1a above, not quite right either. **Net effect: a session reading `docs/handoff.md` §4 and
trusting it to summarize "what's drafted and where" would go looking for drafts that don't
exist where it says, and would miss that the one draft that does exist needs a caveat
applied before use.** Not filed in `claude-md-pending.md` because it's not a `CLAUDE.md`
claim — it's a claim about `claude-md-pending.md`'s own provenance, so it's recorded here
instead. Whoever next reconciles the pending `CLAUDE.md` edits should treat
`claude-md-pending.md` as the authoritative current state of the drafts, not
`docs/handoff.md`'s summary of it.

---

## 2. `docs/docket.md` — cheapest to check, sends people to redo finished work

### 2a. §6 — "the last monster" (the instance that motivated this sweep)

**Where:** `docs/docket.md` §6 header: `MINIMAP LANDED, "the last monster" STILL OPEN`, and
the body's "The last monster — STILL OPEN... Measure whether stuck monsters actually happen
before building an indicator."
**True:** `docs/last-monster-search.md` (landed `ec5cda1`) is exactly that measurement, and
its own status line is `measured, closed, nothing to build`. Finding: 13 null-route
episodes across 300 cleared floors, average 0.19s, max 0.53s, and none of the ten worst
individual last-kill gaps had a null-route streak at all — the reported "stuck behind a
wall" mechanism doesn't reproduce as a real pathing failure at the scale that would justify
an indicator.
**Fix location:** the docket's own header word ("STILL OPEN") and its body's imperative
("Measure...") both need to change to reflect that the measurement has been made and came
back negative — this is not a status flip to "LANDED" (nothing was built, on purpose) but
to something like "MEASURED, CLOSED — nothing to build" mirroring the design record's own
words.

### 2b. §35 — Leaderboards UI cleanup

**Where:** `docs/docket.md` §35, closing line: `**Held by this session, on branch
`ui/leaderboards-cleanup`. In flight.**`
**True:** that branch merged to master as `fb51a2e` ("the board stopped showing the
previous board's numbers"). It is landed, not in flight.
**New finding** — not one of the five instances that motivated this task.

### 2c. §34 — the Collection screen (this session's own item)

**Where:** `docs/docket.md` §34, closing line: `**Held by session 97, building a new
Collection tab in `src/ui/town.ts`. In flight.**`
**True:** built, gated (full `npm test` green), reported to the PM, queued for landing —
commit `66856f8` on `feat/collection-screen`, not yet merged as of this sweep.
**Noting for completeness rather than as a discovery**: this is the ordinary, expected lag
between a session finishing something and the docket catching up, not a case of prose
sitting stale for hours. Flagged because the task was "sweep for every contradiction," and
this is one, however briefly it will remain true.

### 2d. Everything else checked and found accurate

- All 12 commit hashes cited anywhere in `docs/docket.md` exist and are ancestors of
  master (method note above).
- §29's "Held by session 26. In flight" line is *not* stale — the body text already
  contains the addendum from `4f1aca1`, it wasn't left behind by that commit.
- §§27, 30, 31, 32, 33 ("NEEDS AN OWNER CALL" / "Held by..." / open sweeps) show no
  corresponding landed commit under any plausible keyword search of master's log; treated
  as genuinely still open.
- §1's "still not fixed" status for multiplayer stuttering is accurate and current —
  correctly reflects the buffer's build-and-revert (`882ac04` → `bd20dd1`/`5c0ebaf`).
- `CLAUDE.md` contains no mention of the de-jitter buffer at any point in its lifecycle
  (built, shipped, or reverted), so there was nothing there to go stale on that topic.

---

## 3. Design records under `docs/` — narrower audience, checked lighter

No fresh contradictions found beyond what's already noted above (`docs/handoff.md` §4, and
`docs/claude-md-pending.md` §1's own buried proposal). Two things worth naming as **not**
findings, on purpose, per the "report, don't rewrite" instruction:

- `docs/raid-party-scaling.md`'s finding (`partyScale` doesn't transfer to a single raid
  body) is **not** stale even though raids are now co-op — its own header note (added
  2026-09-10) says exactly that: the finding stands unrefuted, the owner enabled co-op
  ahead of it on purpose, and the fix it describes is still unshipped. This is a design
  record correctly labelled as history plus a live caveat, not a claim asserting something
  false in the present tense — the shape this sweep was told to leave alone.
- `docs/animation.md` / docket §17's boss-animation diagnosis reads internally consistent
  against `docs/docket.md` §7 and §19's cross-references; no contradiction found.

The out-of-scope instance worth naming for the record, since it's one of the five that
motivated this task and someone will otherwise go looking for it here: `RELIC_ODDS
.raidArtifact`'s comment in `src/data/relics.ts` (claimed raids were the most generous
artifact source; measurement said the Abyss beats it) is a **source-code comment**, not
`CLAUDE.md`, the docket, or a `docs/` design record, so it's outside this sweep's stated
scope — and it's already fixed (d8, tonight). Not re-verified here; noted only so its
absence above doesn't read as a miss.

---

## Scope note added 2026-09-10, after the sweep landed: `src/**` comments are the known gap

This sweep's scope was `CLAUDE.md`, `docs/docket.md` and the design records under `docs/`.
**Source-code comments were never in it**, and §3 above already names one instance that fell
outside for that reason (`RELIC_ODDS.raidArtifact`'s claim that a raid was the most generous
artifact source). A second instance turned up the same evening, and it is worth recording
because it is much stronger evidence than the first that the gap is real rather than
theoretical.

**What happened.** The `DropPool` type in `src/data/drops.ts` was authored with a doc comment
describing a "compete for one roll, then a weighted pick" mechanism. That mechanism was
refused by `npm run relics` about an hour later — it silently removed the Abyssal Rift's
ability to pay more than one artifact per kill — and replaced. The design record
(`docs/abyss-odds.md`) was corrected at the time. **The comment sitting directly above the
type was not**, and it survived until a merge conflict happened to put a human eye on that
exact region.

Three things make this sharper than the §3 instance:

- **It went stale within hours, not across months.** The usual mental model of stale prose is
  slow drift as the code moves away from it. This was a comment that was wrong almost
  immediately, by the same author, in the same session.
- **The author had already corrected the same claim elsewhere.** The design record was
  updated and the code comment was missed — so the failure is not "nobody noticed the
  decision changed", it is "the decision was recorded in one of its two homes".
- **A comment describing a rejected design is worse than an out-of-date one**, because the
  next reader implements from it. This one described a mechanism that had failed its own
  acceptance gate, presented as the design.

**The scope note, then**: this document's findings are a statement about three files and one
directory. They are **not** evidence that `src/**` is clean, and the two instances now on
record — one found during the sweep and ruled out of scope, one found hours after it landed —
are the only two anyone has looked for. A reader treating this sweep as a clean bill of health
for the codebase's prose would be over-reading it in exactly the direction its own method
finding warns about.

**Deliberately not commissioned here.** `src/**` is a far larger surface, two instances is not
a demonstrated pattern, and a sweep nobody has scoped is how a cheap task becomes an
open-ended one. Recording where the boundary is, and that something was found just past it
twice, is the useful move. If it is ever taken on, the cheapest first cut is comments sitting
on **types and constants that a recent branch changed** — both known instances are exactly
that, and neither would have needed a full read of `src/`.

---

## Summary for whoever lands fixes off this

| # | File | What's wrong | Fix is |
|---|---|---|---|
| 1a | `CLAUDE.md` | raids bullet says solo | apply `claude-md-pending.md` §1's self-correction, not its "Proposed text" block as written |
| 1b | `CLAUDE.md` | loot is per-hero/round-robin | apply `claude-md-pending.md` §2&3 as drafted |
| 1c | `docs/handoff.md` §4 | drafts it names don't exist as described | point future readers at `claude-md-pending.md` instead, or correct the attribution |
| 2a | `docs/docket.md` §6 | "last monster" marked STILL OPEN | flip to measured/closed, citing `docs/last-monster-search.md` |
| 2b | `docs/docket.md` §35 | marked "In flight" | mark landed (`fb51a2e`) |
| 2c | `docs/docket.md` §34 | marked "In flight" | mark built/queued (`66856f8`, pending land) |

---

## Addendum: `investigate/power-curve2` — an orphaned branch, not a stale document

Assessed on request (docket §28's method extends to a claim sitting in git rather than in a
file: an unlanded branch making a claim nobody has re-checked against current master). Two
commits (`630dfb8`, `2bf2fe1`), four files (`docs/power-growth.md`, `tools/powercurve.ts`,
`tools/bot.ts`, `package.json`), branched from `7ce8bef` — well before tonight's batch.
**Judgment only, nothing built, rebased, or landed.**

**It's a hybrid the three offered categories don't quite fit, and forcing it into one would
lose the half that matters.**

**The decision recorded in it exists nowhere else and would be lost if the branch is
discarded.** `docs/reachable-band.md` on master — the document this branch's own commits
say they're the follow-on to — still reads `Status: measured, not fixed, and deliberately
not recommended`, exactly as before. The branch's second commit records that **the owner
was shown four priced routes and chose "accept the slope, write it down"** — the Delve's
depth 13-19 soft ceiling is intended design, not a defect, gear (not level) decides where a
player's ceiling sits, and the Proving stays reachable at level 40 in Legendary gear. None
of that is anywhere on master. This is category 1's shape (a decision, not a fresh
question) but the opposite of its usual direction: normally a branch is stale because the
world moved past it; here the branch is the *only* place the world's own decision is
written down.

**The tooling is superseded, and not a documentation-only rewrite would fix it.**
`tools/bot.ts`'s `armTrees()` — the branch's own fix for "`geared()` builds an empty
character" — is byte-for-byte already on master (`b70e603`, "fix(bot): arm both trees in
geared() and campaign()"), landed through a different, later investigation that found the
identical defect independently. **Master's version goes further than the branch's own
architecture**: the branch deliberately kept `armTrees` opt-in specifically so it wouldn't
"move every campaign and balance number in the acceptance gate at once," and master folded
it directly into `geared()`/`campaign()` unconditionally instead — a bigger change than
this branch chose to make, and one an owner call authorised elsewhere (`b70e603`'s own
message: "scoped exactly as authorised"). Rebasing this branch today would not be a clean
merge — it would be two `export function armTrees` in one file, a compile error, not a
silent duplicate. `tools/powercurve.ts` also reads a `damageDealt` field on `FloorResult`
that only exists on this branch, not on master's `tools/bot.ts`, so the tool would not even
type-check against current master without that field being reasoned about fresh (does it
still mean what the branch's own write-up says once `geared()` arms trees by default,
rather than opt-in?). And the `package.json` line it adds still uses the pre-`run-tool.mjs`
direct-esbuild pattern every other script migrated off of — the exact concurrent-run hazard
that migration exists to prevent. None of this is a rebase; it's rework, and probably a
half-day of it before the instrument could be trusted again.

**What survives the tooling's staleness is the finding, not the instrument.** The branch's
own account of its methodology (§7 of `docs/power-growth.md`) already treats the
empty-build defect as something it corrected for locally before drawing any conclusion —
its numbers were never computed on the broken instrument, they were computed *despite* it,
using the branch's own now-redundant `armTrees`. So the substance — enemy health geometric
and unbounded against a player power curve that is polynomial or capped-geometric, one
rarity step priced at 4.87 depths against a level's ~0.1, the falsification in §8b, and the
owner's choice of D — does not depend on the instrument that's now duplicated. It was
measured correctly; it just wasn't measured with the tool that happens to already exist.

**Recommendation, stated as a judgment rather than a task list**: this is closer to
category 1 than to 2 or 3, but "close the branch with a note saying where the answer
lives" doesn't apply either, because there *is* nowhere else the answer lives yet. The
decision in `docs/power-growth.md` §0 is worth landing as its own document, written fresh
against current master rather than by rebasing this branch's diff — the design record and
the "owner chose D" fact are the valuable cargo, and neither needs `armTrees` or
`powercurve.ts` to travel with them. The tooling half (`tools/bot.ts`, `tools/powercurve.ts`,
the `package.json` line) should be closed as superseded by `b70e603`, with a note pointing
here so nobody revives it off the branch name in three months believing it's still the
current fix. Also worth someone's attention, separately and not part of this judgment: the
commit's own §11 proposed CLAUDE.md wording for the difficulty-philosophy section, marked
"not applied — that file goes to the owner directly," which nobody appears to have carried
forward into `docs/claude-md-pending.md` — a fifth entry that page doesn't have yet, if the
decision is confirmed still standing.

**Done, same session, per PM instruction:** `docs/reachable-band-decision.md` now carries
the ruling and the falsification, marked recorded-pending-re-confirmation since neither
session in this chain witnessed the owner make the call. `docs/reachable-band.md`'s status
line and its "Options, priced" section now point at that ruling rather than reading as
still open. `docs/claude-md-pending.md` picked up the §11 wording as entry 5 (not entry 6
— no map-wipe CLAUDE.md draft was found in this pass to occupy that slot; renumber if one
turns up), gated explicitly on the same pending re-confirmation. The tooling is closed by
the paragraph above and by `docs/reachable-band-decision.md`'s own closing section — both
point at `b70e603` rather than at this branch.
