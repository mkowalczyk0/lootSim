# CLAUDE.md edits awaiting the owner's word

Four drafts were named in `docs/handoff.md` §4 as written and unlanded. `CLAUDE.md` is the
owner's own document — no peer session lands an edit to it on another session's say-so, so
none of these has been applied. This page exists so the owner can read one place and say
yes or no once, instead of four separate round trips. Nothing here has been merged, edited
into `CLAUDE.md`, or combined across entries.

For each draft below: the current `CLAUDE.md` text, the proposed replacement, why, and
which branch it came from — or, where a draft could not actually be located as written
text anywhere in the repository, a clear statement of that instead of an invented one.

---

## 1. The raids bullet — "raids are no longer solo"

**Branch:** `investigate/raid-party-scaling` (tip `c6baa86`, not merged to master).

**Current text** (`CLAUDE.md`, "Raids: the war's set pieces" section):

> **Solo in v1**, the same call the Vigil and the Proving made, but the seam is *open*: the
> wire carries `raidId`/`raidTier` and `configFromWire` rebuilds through `raidConfig`, so one
> branch in `handleHubInteraction` is all that stops a party raid. A co-op attempt was built
> and measured, then **not shipped**: `partyScale` (tuned for a crowd) doesn't transfer to
> one enormous body, and neither of the two obvious fixes tried (health, damage) closed the
> gap without a new regression elsewhere. See `docs/raid-party-scaling.md` — the finding, not
> the fix, is what landed.

**Proposed text** (as drafted on the branch):

> **Co-op**, after shipping solo the same way the Vigil and the Proving did. The wire
> always carried `raidId`/`raidTier` (`configFromWire` rebuilds through `raidConfig`), so
> turning it on was the War Table's callback and the Raid Portal joining the party's
> ready-spot flow the same way every other portal-picking station already does. What made
> it safe to flip was measuring first: a real co-op fight (`tools/bot.ts`'s
> `playFloorParty`, a party sibling of the solo bot) showed the crowd-tuned `partyScale`
> doesn't transfer to a single enormous body — it trivialised a raid the party could
> already win and did nothing for one at the edge, because that term's whole shape assumes
> "more, fatter, barely-harder-hitting monsters" and a boss has no "more" to give.
> `singleBodyPartyScale` (`data/modes.ts`) is the fix: health scales **linearly** with
> party size (keeps time-to-kill per player roughly constant, unlike `partyScale`'s
> sub-linear ×1.65/2.30/2.95), and damage **does not scale with party size at all** — a
> bigger party's extra danger is already supplied by more bodies that can be caught in a
> telegraph and by the revive economy, so charging damage on top double-counts it. Wired
> into `profileFor`, scoped to `run.raid` alone — the reasoning is about the *shape* of a
> single-body encounter and applies to every boss floor in the game, but retuning an
> existing boss floor's co-op difficulty is a live balance change to content people have
> already played, which stays an owner call this pass didn't make.

A second passage changes with it, in the "Planned direction" section:

**Current:**

> - **Party balance is a guess, not a measurement.** `partyScale` was reasoned about and
>   checked by the smoke test, never by four people actually playing.

**Proposed:**

> - **Party balance is still mostly a guess, not a measurement.** `partyScale` (the crowd
>   term used by the Delve, every rift and planet expeditions) was reasoned about and
>   checked by the smoke test, never by four people actually playing. Raids are the one
>   exception: `tools/bot.ts`'s `playFloorParty` measured a real co-op fight against a raid
>   boss and found `partyScale` didn't transfer to a single body at all (see the raids
>   section above), which is exactly the kind of thing this bullet warns nobody has checked
>   for the rest of the game either — a raid boss floor and the Delve's every-fifth-depth
>   boss floor are the same *shape* of encounter, and only one of them has been measured.

**Why:** the text on master describes raids as solo with co-op "not shipped." The branch
contains real, working code (`singleBodyPartyScale`, the War Table callback, the Raid
Portal joining the party ready-spot flow) that turns co-op raids on — this is not a prose
correction alone, it is a code branch the prose describes. **Landing this text without also
landing `investigate/raid-party-scaling` itself would make `CLAUDE.md` describe a feature
that doesn't exist on master yet.** That is worth flagging explicitly: this is a bundled
decision (ship the code, then update the doc to match), not a pure documentation fix like
the other two drafts below.

---

## 2 & 3. The two co-op loot passages — NOT FOUND as drafted text

`docs/handoff.md` §4 names "26's two co-op loot passages" as written and awaiting approval.
I could not find either as a diff, a staged change, or prose anywhere in the repository —
checked every unmerged branch's diff against master for `CLAUDE.md`, every worktree's
working tree and index for an uncommitted `CLAUDE.md` change, and every doc file that
mentions `CLAUDE.md` by name. Only one uncommitted `CLAUDE.md` change exists anywhere in
the shared checkout right now, and it's unrelated (the map-wipe rule, `fix/no-mapwipe`,
docket §30 — not one of these four).

What I can confirm is real: the two passages ARE stale, and this is not a guess —

**Passage A, current text** (`CLAUDE.md`, "Multiplayer: one simulation, four people"):

> - **Loot is per-hero and physical; XP is shared in full.** Each player banks into their
>   own save on their own machine.

**Passage B, current text** (`CLAUDE.md`, "Every class has its own save"):

> ...the clear cache — one physical pile the whole party can pick from — assigns each item
> it rolls to a different party member round-robin, so a level 20 and a level 50 in the
> same party each find something they can wear.

Both are contradicted by shipped code already on master: commit `85bdee6` ("a drop is
shared — anyone may take it, and taking it pays everybody") replaced per-hero physical
loot with **instanced loot** — one drop, everyone still in the run gets their own copy,
independently rolled at their own level from the same seed — and explicitly deleted "the
clear cache's round-robin recipient cursor" as one of three now-dead mechanisms. `docs/
docket.md` §28 already names this exact staleness as an example of its own category
("prose that outlived the decision it describes") but records it as a finding, not a
proposed replacement paragraph.

**So there is a real, confirmed doc bug here, but no drafted fix to show the owner** — only
a diagnosis. If the owner wants this fixed, it needs fresh prose written against `85bdee6`'s
commit message (which already states the new rule precisely), not a yes/no on existing
text. Flagging rather than writing that prose myself, since inventing it would make this
page a fifth thing rather than a compiled list of three.

---

## 4. The campaign-check thinness paragraph replacement

**Branch:** none. No commit anywhere ever diffs `CLAUDE.md`'s existing "third lesson"
paragraph (searched history with `git log -S` against its exact text and against the
proposed numbers — both come back empty for `CLAUDE.md`). The content exists only as prose
in `docs/handoff.md` §4 and, in full, as the header of `tools/campaignblock.ts` (commit
`83f94dc`, already on master) — the actual sweep this section describes running.

**This one is explicitly deprioritized by the PM's own handoff note**, quoted here rather
than paraphrased: *"That CLAUDE.md draft is now the least important home for those numbers,
because they also landed in `tools/campaignblock.ts`'s own header — which is what somebody
actually reads at the moment the check goes red, rather than a snapshot doc or a draft that
may never land."* Included below for completeness, since the owner may still want `CLAUDE.md`
itself corrected, but it is not the operative copy of this information anymore.

**Current text** (`CLAUDE.md`, "A third lesson..." paragraph, in full):

> **A third lesson, and it reaches back and reframes the first (2026-09-09)**: measuring
> whether the sharp-vs-reckless campaign check had the same thinness, its margin was
> sampled across five disjoint 12-seed blocks. It read **2.42** on the hardcoded
> `CAMPAIGN_SEEDS`, then **2.92**, **4.83**, **6.08** — and **−0.33**. That last block is a
> live inversion... So the check that this whole section is a story about can still invert
> today, and master's own seeds read comfortably not because the promise holds reliably but
> because those twelve seeds happen not to be a bad block.
>
> ...
>
> Deliberately **not fixed**. Widening this one is expensive in a way the telegraph check
> was not: ~85s per 12-seed block, ~7s per seed-side, so a full 8×8 power sweep here costs
> hours rather than minutes. That is a cost decision for the owner, not a follow-on to an
> unrelated change. **What must not happen is someone reading a green campaign check as
> proof the promise holds** — read this paragraph instead, and if you need the answer, pay
> for the sweep on purpose.

**Proposed text**, reconstructed faithfully from `tools/campaignblock.ts`'s landed header
(the sweep this passage said was unpaid has since been run):

> The sweep has been run. Two disjoint 60-seed blocks read margins of **2.55**
> (`CAMPAIGN_SEEDS` itself) and **2.50** (offset 1000000), agreeing to 0.05, so **the
> current width sits on the noise floor's plateau** rather than its edge.
>
> Sharp and reckless run the *same* `GameState` seeds at different dodge rates, so per-seed
> differences pair and yield a real standard error: margin **sd ~6.1** — single seeds swing
> from depth 4 to 20 — giving **SE ~0.78 at n=60**, which puts the gate's bar of 1 just
> **1.9 SE** below the observed margin.
>
> **So the operational consequence, which matters more than the history: a red on that
> check is ~3% likely to be noise — about 1 run in 30. The first move is one disjoint
> block, not a regression hunt.** Nudging balance numbers to make it green would be
> chasing a coin flip.
>
> The same arithmetic explains the **-0.33** inversion this section used to record only as
> an unexplained fact: at the old n=12 that sd gives SE ~1.75, putting the bar **0.9 SE**
> away. The check inverted because it was thin, not because the design promise failed — and
> the widening to 60 is what moved the bar from 0.9 SE to 1.9 SE and made a green here mean
> something. A 3-sigma bar would need ~150 seeds at roughly 2.5x the cost already paid — a
> real decision for the owner, not a follow-on to an unrelated change, and the only part of
> this still unpaid.

**Why:** the paragraph on master describes the second sweep as unpaid and expensive
("hours"); it has since been run and paid for (`83f94dc`), and master's own copy is now
factually behind the tool that superseded it.

---

## Summary for a fast read

| # | Draft | Found? | Branch | Bundled with code? |
|---|-------|--------|--------|---------------------|
| 1 | Raids bullet (co-op) | Yes, full text | `investigate/raid-party-scaling` | **Yes** — text describes code not yet on master |
| 2 | Loot passage A (per-hero) | Current text only, no proposed replacement found | — | No code to bundle; needs fresh prose |
| 3 | Loot passage B (round-robin) | Current text only, no proposed replacement found | — | No code to bundle; needs fresh prose |
| 4 | Campaign-check thinness paragraph | Yes, reconstructed from `tools/campaignblock.ts` | none (no CLAUDE.md diff ever committed) | No — already superseded operationally by the tool header |
