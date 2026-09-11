# CLAUDE.md edits awaiting the owner's word

Four drafts were named in `docs/handoff.md` §4 as written and unlanded; a fifth (§5) was
added afterwards from `fix/no-mapwipe`, and a seventh (§7) from `feat/relic-level-gate`.
`CLAUDE.md` is the
owner's own document — no peer session lands an edit to it on another session's say-so, so
none of these has been applied. This page exists so the owner can read one place and say
yes or no once, instead of four separate round trips. Nothing here has been merged, edited
into `CLAUDE.md`, or combined across entries.

For each draft below: the current `CLAUDE.md` text, the proposed replacement, why, and
which branch it came from — or, where a draft could not actually be located as written
text anywhere in the repository, a clear statement of that instead of an invented one.

---

## 1. The raids bullet — "raids are no longer solo"

**This entry was restructured 2026-09-10, later the same night, by docket §28's sweep
(`docs/stale-prose-sweep.md`).** The original draft below (kept as history under "Superseded
draft") proposed shipping co-op raids bundled with a balance fix from a branch that never
landed. That's not what happened: raids went co-op through a different, unbundled change,
and the balance question it describes is explicitly **not** something to propose fixing —
see the current proposal immediately below.

**What's actually true on master right now:** raids are co-op. `feat/coop-raids` (merged
`548f218`) removed the `handleHubInteraction` gate the current `CLAUDE.md` text still names,
on an explicit owner decision to enable co-op *ahead of* answering the scaling question, not
because it had been answered. **No tuning number moved to do it** — not `partyScale`, not
`raidThreatRate`, not the raid tier curve. `singleBodyPartyScale` (the fix the superseded
draft below is built around) is not on master; `investigate/raid-party-scaling` (tip
`c6baa86`) is still unmerged. So the shipped co-op raid runs on the ordinary crowd-tuned
`partyScale`, and `docs/raid-party-scaling.md`'s finding — that this term doesn't transfer to
a single large body — stands, unrefuted, exactly as its own header note says. **The owner
has a standing instruction that this scaling discussion stays closed** — they're iterating
on it live in co-op and will report back — so the proposal below corrects only "solo" to
"co-op" and says nothing about tuning. Don't propose a scaling fix here even though the
material for one exists on the superseded branch.

**Current text** (`CLAUDE.md`, "Raids: the war's set pieces" section):

> **Solo in v1**, the same call the Vigil and the Proving made, but the seam is *open*: the
> wire carries `raidId`/`raidTier` and `configFromWire` rebuilds through `raidConfig`, so one
> branch in `handleHubInteraction` is all that stops a party raid. A co-op attempt was built
> and measured, then **not shipped**: `partyScale` (tuned for a crowd) doesn't transfer to
> one enormous body, and neither of the two obvious fixes tried (health, damage) closed the
> gap without a new regression elsewhere. See `docs/raid-party-scaling.md` — the finding, not
> the fix, is what landed.

**Proposed text:**

> **Co-op since 2026-09-10**, by owner decision, ahead of the scaling answer rather than
> because of one. The seam this doc used to describe as open — `RunConfigWire` carries
> `raidId`/`raidTier`, `configFromWire` rebuilds through `raidConfig` — is now used: a raid
> picked at the War Table sets the party's plan and the Raid Portal becomes the ready spot,
> the same shape every other portal-picking station already had (`feat/coop-raids`, merged
> `548f218`). `partyScale` (tuned for a crowd) still doesn't transfer to one enormous body —
> that finding is unrefuted, not fixed, and no tuning number moved to turn co-op on. See
> `docs/raid-party-scaling.md`. Expect a party raid to play too easy or too hard; the owner
> is iterating on the number live and will report back — this isn't an open question for a
> session to pick up.

**Why:** the text on master still says raids are solo and names a gate (`handleHubInteraction`)
that's gone. This is now a pure documentation correction with no bundled code decision —
the code already shipped, weeks before this proposal, via a route this page didn't
originally know about.

**The "Planned direction" passage this entry used to also propose changing needs no
change.** Checked while restructuring: `CLAUDE.md`'s "Party balance is still mostly a guess,
not a measurement" bullet already states the `docs/raid-party-scaling.md` finding correctly,
already calls it "unresolved... not fixed," and doesn't claim raids are solo. It reads as
already updated by an earlier, unrelated pass — the two CLAUDE.md passages about this topic
had simply drifted out of sync with each other, one fixed and one not, which is its own
small instance of the thing docket §28 sweeps for. Nothing to propose there.

---

### Superseded draft (2026-09-10, earlier the same night) — kept for the trap it shows, not as something to paste anywhere

Written against `investigate/raid-party-scaling` (tip `c6baa86`) on the assumption that
co-op raids would ship bundled with that branch's balance fix. Neither assumption held:
raids shipped through a different branch with no tuning change, and that branch is still
unmerged. **If you are reading this looking for text to copy into `CLAUDE.md`, don't use
what's below — use the current proposal above instead.** Left in place because a draft
written against a branch that never landed, and the exact reasoning that made it feel safe
to write, is worth the next person seeing before they write one the same way.

**Branch:** `investigate/raid-party-scaling` (tip `c6baa86`, not merged to master).

**Then-current text** (unchanged from what's quoted above — this draft never landed):

> **Solo in v1**, the same call the Vigil and the Proving made, but the seam is *open*: the
> wire carries `raidId`/`raidTier` and `configFromWire` rebuilds through `raidConfig`, so one
> branch in `handleHubInteraction` is all that stops a party raid. A co-op attempt was built
> and measured, then **not shipped**: `partyScale` (tuned for a crowd) doesn't transfer to
> one enormous body, and neither of the two obvious fixes tried (health, damage) closed the
> gap without a new regression elsewhere. See `docs/raid-party-scaling.md` — the finding, not
> the fix, is what landed.

**Then-proposed text (do not use):**

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

A second passage was proposed to change with it, in the "Planned direction" section — its
"Current" quote below is itself now stale (that bullet has since changed on master by an
unrelated route; see the note above the fold):

> - **Party balance is a guess, not a measurement.** `partyScale` was reasoned about and
>   checked by the smoke test, never by four people actually playing.

**Then-proposed:**

> - **Party balance is still mostly a guess, not a measurement.** `partyScale` (the crowd
>   term used by the Delve, every rift and planet expeditions) was reasoned about and
>   checked by the smoke test, never by four people actually playing. Raids are the one
>   exception: `tools/bot.ts`'s `playFloorParty` measured a real co-op fight against a raid
>   boss and found `partyScale` didn't transfer to a single body at all (see the raids
>   section above), which is exactly the kind of thing this bullet warns nobody has checked
>   for the rest of the game either — a raid boss floor and the Delve's every-fifth-depth
>   boss floor are the same *shape* of encounter, and only one of them has been measured.

**Why this was written the way it was:** the text on master described raids as solo with
co-op "not shipped." The branch contained real, working code (`singleBodyPartyScale`, the
War Table callback, the Raid Portal joining the party ready-spot flow) that turns co-op
raids on — this read as a bundled decision (ship the code, then update the doc to match),
not a pure documentation fix. **The trap:** by the time this was written, master's text was
*already* false for an unrelated reason — `feat/coop-raids` (merge `548f218`) had already
landed and removed the named gate, days before `investigate/raid-party-scaling` could. The
draft below was written checking the branch's own diff against master, which correctly
showed the branch would change the passage — but never re-checked whether master had
already changed out from under the branch by a different route. **The lesson: when a draft
proposes replacing text because a branch changes it, check what master's text says right
now, not what it said when the branch was cut.** A branch's diff against its own base
proves the branch changes something; it doesn't prove master hasn't already changed it a
different way.

---

## 2 & 3. The two co-op loot passages

`docs/handoff.md` §4 names "26's two co-op loot passages" as written and awaiting approval.
**No such draft exists anywhere in the repository** — checked every unmerged branch's diff
against master for `CLAUDE.md`, every worktree's working tree and index for an uncommitted
`CLAUDE.md` change, and every doc file that mentions `CLAUDE.md` by name. Only one
uncommitted `CLAUDE.md` change exists anywhere in the shared checkout right now, and it's
unrelated (the map-wipe rule, `fix/no-mapwipe`, docket §30 — not one of these four). The
"drafts" the handoff pointed to were never written down; only the diagnosis was
(`docs/docket.md` §28 names the staleness as an instance of its own category, but records a
finding, not a fix).

**The two proposed passages below are new — drafted by this session (2026-09-10), against
`85bdee6`'s commit message and `docs/shared-loot.md`'s design record, and never reviewed by
the owner.** Everything stated as fact was checked directly against `src/game/dungeon.ts`
(`dropPickup`, `collect`, `credit`, `rollDrop`, `dropFromTables`, `dropClearCache`) rather
than taken from the commit message alone; anywhere I could not verify against the running
code, I've said so rather than smoothing it over.

### Passage A

**Current text** (`CLAUDE.md`, "Multiplayer: one simulation, four people"):

> - **Loot is per-hero and physical; XP is shared in full.** Each player banks into their
>   own save on their own machine.

**Proposed text:**

> - **Loot is shared and instanced; XP is shared in full.** A drop is one physical pickup —
>   anybody in the run may collect it, and collecting it credits *every hero still in the
>   run* with their own copy, not just the collector. This is the settled shape of a rule
>   that went through two owner reversals in one afternoon: first-come (anyone could walk
>   off with a teammate's loot) was rejected as a bug, the ownership fix that followed it
>   was then rejected too because it only ever paid the credited killer — "we can both
>   collectively farm the same stuff." `docs/shared-loot.md` is the design record and the
>   falsification behind it. For an item, "the same copy" is exact rather than approximate:
>   every random draw inside `rollItem`/`forgeNamedItem` (name, affix ids, grant, trigger,
>   variance) is independent of level, so replaying one seed per hero produces an item with
>   identical everything except the magnitudes and `requiredLevel`, which come from each
>   hero's own level. Currency, keys, gems, materials, potions, relics and augments are
>   credited to every present hero the same way, each through their own find multipliers.
>   Each player still banks into their own save on their own machine — that part never
>   changed.

**Why:** the current text describes the *first* rejected design (per-hero ownership,
shipped and reversed the same afternoon `85bdee6` landed) as if it were still the rule.

### Passage B

**Current text** (`CLAUDE.md`, "Every class has its own save", the full paragraph):

> Dropped loot follows the same rule (docket §23): a monster kill's drop, the clear cache,
> and every named/relic table `Dungeon.dropFromTables` reads item level off the receiving
> hero's own `Math.max(1, level)`, never `profile.depth` — a level-30 character clearing a
> depth-45 Memory gets gear at their own level, not the Memory's. Co-op makes "receiving
> hero" a real question rather than a synonym for `localHero`: a kill's drop rolls off
> whichever hero's hit is credited (`killEnemy`'s `source`), and the clear cache — one
> physical pile the whole party can pick from — assigns each item it rolls to a different
> party member round-robin, so a level 20 and a level 50 in the same party each find
> something they can wear.

**Proposed text:**

> Dropped loot follows the same rule (docket §23): every copy of a drop — a monster kill's,
> the clear cache's, a named or relic table's — reads its item level off the *hero that
> particular copy is being forged for*, never `profile.depth` — a level-30 character
> clearing a depth-45 Memory gets gear at their own level, not the Memory's. Co-op no longer
> means picking one "receiving hero" for the whole drop: because a drop is shared (see
> above), `dropPickup` forges one copy per hero on the run's roster, each at that hero's own
> level, so a level 20 and a level 50 in the same party each find something they can wear
> from the *same* drop rather than from different ones handed out in turn. **The round-robin
> recipient cursor has no successor — it's simply gone**, along with the integer currency
> split (`shareOut`) it sat beside; there is nothing left in the cache for one person, so
> there is nothing left to take turns over.
>
> What survives from the single-recipient model is narrower than it looks, and both
> survivors are named as open questions in `docs/shared-loot.md` rather than as settled
> design: the credited hero (`killEnemy`'s `source` for a kill, `localHero` for the clear
> cache) still decides which weapon family a shared drop's affinity leans toward, because
> the party finds *one item* and one item can only carry one affinity roll — a Magician
> partied with a Berserker sees the Berserker's families more often, and the alternative
> (each hero's own affinity biasing their own copy) was rejected because it stops the copies
> being the same item at all. The same credited hero also still decides relic dedup:
> `rollRelicDrops` skips what *that hero's own account* already owns, even though the relic
> pays every present hero if it drops — so whether a relic drops at all is judged against
> one collection, not the party's.

**Why:** the current text describes the clear cache handing out items "round-robin," which
`85bdee6` explicitly deleted as one of three now-dead mechanisms (along with `shareOut` and
the faded-teammate's-drop rendering). It also frames "receiving hero" as a single question
per drop; under the shipped design there's one receiving hero *per copy*, not one per drop.

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

---

## 5. Difficulty philosophy — the reachable band's ruling

**Branch:** `investigate/power-curve2` (`630dfb8`, `2bf2fe1`, not merged to master).
**Depends on a decision this page can't confirm on its own** — see the caveat below before
using this.

**Current text** (`CLAUDE.md`, "Difficulty philosophy" section, opening paragraph):

> Pressure, not sponginess. Enemy health grows roughly with the gear curve, but the things
> that actually make a deep floor frightening are damage (quadratic in depth), speed,
> count, hazards, and `aggression`/`telegraph` in `DepthProfile`.

**Proposed addition** (as drafted on the branch, §11, verbatim):

> **The Delve has a soft ceiling, and it is deliberate.** Enemy health compounds
> geometrically with depth while every axis of player power is polynomial or has only
> eight rarity steps in it, so the two cross — for a character built by the ladder itself,
> around depth 13–19. That is the intended shape: **depth is a dial you push until it
> pushes back**, not a track with a finish line, and where your ceiling sits is decided by
> your gear rather than your level (one rarity step is worth about five depths; a
> character level is worth about a tenth of one). A player at their ceiling has not run
> out of game — the rifts, the Tower and the raids are the same curve walked a different
> way. The bottom of the Delve stays reachable: depth 30, the Proving gate, clears at
> level 40 in a Legendary set, which makes it a gear goal rather than a wall. **Do not
> soften `profileFor` to move this line, and do not relocate content into the band to
> dodge it** — every mode reads that one curve, and `docs/reachable-band.md` already
> established that a shallower ladder starting past the band re-inherits it. See
> `docs/power-growth.md`.

**Why:** the current text's "grows roughly with the gear curve" undersells what's actually
true — past roughly depth 19, enemy health doesn't track the gear curve, it permanently
outruns it, by the design comment's own admission ("stay ahead of the 2^n rarity ladder").
That's the whole mechanism behind the reachable band, and CLAUDE.md's difficulty section is
the natural place to say so once it's a settled design position rather than an open
question.

**The dependency, stated plainly:** this proposal only makes sense if the ruling it
describes actually stands. `docs/reachable-band-decision.md` (docket §28's sweep) records
that the owner chose to accept this shape, but that record itself is marked "recorded,
pending re-confirmation" — neither the session that wrote this entry nor the one that
wrote the decision document witnessed the owner make the call; both are working from a
commit message on a branch that sat unlanded across two PM handovers. **Do not apply this
proposal, or the decision document it cites, as settled until that confirmation lands.**
If the owner does not confirm it, this entry and `docs/power-growth.md`'s reasoning still
have value as a measured mechanism (§8b's falsification is real regardless of what's
decided about it), but the design-position language above — "it is deliberate," "do not
soften" — would need to come back out.

**One numbering note for whoever assembles this page next:** this was filed as entry 5
because that's the next number the page actually has right now (1 through 4 exist above).
If a map-wipe entry lands separately and is meant to sit at 5, renumber rather than assume
this one moves — I have no branch or diff for a map-wipe CLAUDE.md draft to check against,
so I can't tell whether one exists elsewhere and should come first.
## 6. THE MAP-WIPE RULE — a new passage, not a replacement

**Branch:** `fix/no-mapwipe` (`a87bb42` + `2c9489f`), not merged to master. `npm test` green.

**Current text:** none. This is an **addition**, to sit immediately after THE EXECUTE RULE
in the "Classes: an interaction system, not a stat block" section — its sibling in both
shape and reasoning.

**Why it is proposed at all:** the owner reported the same mechanism twice, in two
different classes ("no skill in the game should have the ability to wipe the entire map out
— similar to archers ultimate we looked at, paladin has something similar on his aegis
rush"). THE EXECUTE RULE is in `CLAUDE.md` because a rule at a single runtime site is
invisible at the call sites it governs, and someone needs to be told it exists. This one has
exactly that property: `to: "enemies"` looks unremarkable everywhere it is written, and
nothing at those ~127 sites says the reach is decided elsewhere.

**Proposed text:**

> **THE MAP-WIPE RULE: `to: "enemies"` is bounded, and unbounded is something you say.**
> `selectActorIds` bounded an enemy selection by the *ability's* `shape.radius` and, when the
> ability authored no shape, fell through to **every hostile on the floor**. So unbounded was
> what you got for not thinking about reach — the owner reported it twice, in two classes
> (the Ranger's ultimate, then Paladin's Aegis Rush), and a skill written tomorrow would have
> inherited it.
>
> The fix is the execute rule's shape and for the execute rule's reason: **the majority of
> `to: "enemies"` sites in the repo are not on an ability's effect list at all** (63 there,
> **64** more added by tree nodes, hybrids, archetypes, relics and named items), so a required
> per-packet radius would be ~95 authored numbers on classes nobody reported *and* satisfiable
> with `99999` — the original bug spelled explicitly. So the rule lives at the one site that
> resolves the selection. `to: "enemies"` is now **always** bounded, by `enemyReach`, a ladder
> of numbers the ability already supplies (`step.radius` → `shape.radius` → `shape.length` →
> its own largest zone → `range` → `DEFAULT_ENEMY_REACH`). **There is no field to omit**, so a
> new ability is bounded for free.
>
> A genuinely room-wide ability declares `to: "enemiesEverywhere"` — **two ultimates do**, and
> `npm run mapwipe` pins that roster so a third is a design decision rather than a merge. Two
> non-ultimates were nearly a third and a fourth on the strength of their own text saying "on
> the field", and were bounded instead: **an ability's authored prose is not an exemption** —
> it is the cheapest thing in the repo to change, and there it was describing the bug. See
> `docs/map-wipe-rule.md`, which also records what a player will notice, the one invented
> number (320, calibrated against the repo's own authored radii — above every non-ultimate
> that declares one, below both ultimates that do, so omitting a shape can never buy more
> reach than declaring one), and the routes that were checked and are *not* open
> (`to: "allies"`, pierce, projectile count).
>
> Two dead fields turned up underneath it: **`threat.radius` was authored on three taunts and
> read by nothing** (Fortress Call said "nearby enemies" and taunted the floor) — it is rung 1
> of the ladder now; and **`projectile.onExpire` never reaches the host**, so three sites are
> inert. The second is deliberately *not* fixed, because landing that seam before the bound
> existed would have created three new map-wipes.

**One thing the owner should know before approving.** An earlier version of this passage was
committed to `CLAUDE.md` on the branch and has been reverted. It said *"four do"* and *"two of
the four are not ultimates and are an open owner question"* — true when written, false about
six hours later, because the question was decided and those two were bounded. It would have
landed stale into the one file every session reads. That is the argument for this page
working the way it does, made by the draft it is now carrying.

**What is not in this passage, deliberately:** the two open tuning questions
(`paladin.aegis_rush` sitting at its charge distance of 320 rather than a ~140 pulse; the
Duelist's ripostes countering a circle rather than the attacker) are in
`docs/map-wipe-rule.md` only. They are live balance questions, and `CLAUDE.md` should not
carry a number that is expected to move.

---

## 7. The relic slots bullet — "No level gate" is now false

**Branch:** `feat/relic-level-gate`. The code is green and does not depend on this text; the
line is simply no longer true of the game, so leaving it is a landmine for whoever reads it
next. This is a factual correction to a sentence the owner's own ruling overturned, not a
proposal to change anything.

### Current `CLAUDE.md` text (the "Relics and artifacts" section, third bullet)

> - **Three slots, one relic.** `RELIC_SLOTS = 3` on `Player.relics` (per class, on the
>   co-op wire via `playerToJSON`), out of the account-wide `GameState.relics`. At most
>   `MAX_RELICS_WORN = 1` is relic-tier; artifacts fill the rest, so they never go dead. One
>   constant, owner-overturnable. **No level gate, like the universal tree.**

### Proposed replacement

> - **Three slots, one relic, and a level gate.** `RELIC_SLOTS = 3` on `Player.relics` (per
>   class, on the co-op wire via `playerToJSON`), out of the account-wide `GameState.relics`.
>   At most `MAX_RELICS_WORN = 1` is relic-tier; artifacts fill the rest, so they never go
>   dead. One constant, owner-overturnable. **A relic may only be socketed by a character at
>   the level of the shallowest floor that can pay it out** — all three slots, both tiers, no
>   carve-outs. `relicRequiredLevel` **derives** that from the drop table rather than an
>   authored field: `sourceFloor` walks a source to its shallowest qualifying run by *asking*
>   `riftConfig`/`raidConfig`/`towerConfig`/`bossFor`, and `levelAdvice` — the same function
>   behind `DepthProfile.recommendedLevel` — turns that floor into a level, less
>   `requiredLevel`'s one level of grace. A relic authored tomorrow is gated for free with no
>   number to forget, and there is no per-definition field to omit. Danger counts (a tier is
>   *where* a thing drops); the Challenger dial does not, by construction. It gates the
>   **socket, not the drop** — an above-level relic still drops and waits in the collection.
>   See `docs/relics.md`.

### Why the old line was written, and why it no longer holds

The exemption was reasoned by analogy to the universal tree, and the analogy does not
survive inspection: the universal *pool* is account-wide but its **allocation is per-class**,
and a universal node grants no abilities and flips no rules by design. A relic does both — it
is a tree node you wear. So relics were not "like the universal tree"; they were the one
account-wide power system a level-1 alt could wear the endgame out of.

The owner overturned it directly, and declined a softer variant that would have let an alt
wear low-tier artifacts immediately.

### Also affected, and handled on the branch

`docs/relics-per-class.md` §A-i cites this exact CLAUDE.md sentence as evidence ("CLAUDE.md
says so outright"). That doc is a proposal page rather than a live design record, so the
branch adds a one-line resolution note at its head rather than rewriting a proposal after the
fact. `docs/relics.md` — the live design record — has been rewritten properly.
## 8. The Nine Circles — three passages that now say "five-depth" or name a legacy biome

**Branch:** `feat/nine-circles` (design record `docs/nine-circles.md`). Not landed. The
Delve's six biomes are re-cut into the doc's nine circles plus the Veil; `data/layers.ts`
did not move. Three `CLAUDE.md` passages describe the old shape.

**(a) Under "Run modes", the layers paragraph.** Current text:

> the band edges sit exactly on the five-depth boundaries `biomeFor` already changes at,
> which is what makes this a reading of the ladder rather than a second one.

Proposed:

> every band edge is a depth `biomeFor` already changes at — since the Nine Circles
> (`docs/nine-circles.md`) a layer holds several circles, but a layer edge is always a
> circle edge, and the layer table is the fixed reference the circles were cut to fit —
> which is what makes this a reading of the ladder rather than a second one.

**(b) Under "Every floor is a generated dungeon" — no change needed**, but under "Run
modes: the delve", after the Delve bullet, one added sentence:

> The Delve's floors are the Nine Circles of Hell in the worldbuilding doc's order — Limbo
> 1–5, then Lust, Gluttony, Avarice through 15, then Wrath, Heresy, Violence, Fraud and
> Treachery two floors each to 25, then the Veil (`DELVE_LADDER` in `src/data/biomes.ts`).
> Four circles borrow a painted circle's sheet until their own lands, declared in
> `BORROWED_LOOKS` and gated so landing the art forces the borrow out. `npm run world`
> reads the circle order out of the worldbuilding doc itself.

**(c) Under "The Proving":** "`biomeFor` caps at its last biome from depth 26" is still
true and stays.

**Why:** (a) is now false as written — biomes change at 6, 9, 12, 16, 18, 20, 22, 24, 26,
not every five — and a reader trusting it would "fix" a circle edge to a multiple of five.
(b) is the one-paragraph orientation the rest of the file gives every other structure.

---

## 9. The gate-reading rule taught on master is blind — a correction, not a CLAUDE.md edit

**Branch:** `feat/nine-circles` (blind-instruments entry 26). `docs/pm-handoff-2026-09-11-morning.md`
on master tells a reader to certify a gate with an anchored `grep -c '^FAIL'`. Every
per-check failure line in `tools/` is indented by house style (`" FAIL  ..."`), so that grep
reads every real red as zero; it was never correct for any tool. The corrected rule, now in
force from the PM: the terminator (`ALL CHECKS PASSED` plus the launcher's `EXIT=0`) **and** a
case-sensitive, unanchored `grep -c 'FAIL'` of zero — and a missing terminator means the
chain halted and the later steps never ran. Nothing in `CLAUDE.md` states the old rule, so
no edit is proposed there; this note exists so the owner sees the correction once, and so
the handoff doc gets fixed on master rather than re-read as written.

## 7. Two small factual corrections, found while building the affix codex

**Branch:** `feat/affix-codex`. Both found by cross-checking `CLAUDE.md`'s prose against
`src/data/mods.ts`/`items.ts`/`player.ts` directly while writing a screen whose entire job
is to read those files live — the same shape as §6's "the code changed under the
sentence," except here the sentence was never true to begin with.

### 7a. The rarity gate example is off by one rarity

**Current text** (`CLAUDE.md`, "Items are modifier lists, not stat blocks"):

> - `+1 projectile` doesn't exist below **epic**; `+1 ultimate bounce` doesn't below
>   **mythic**.

**What's actually true:** `+1 projectile` (`MOD_POOL`'s `"splitting"`, key `projectiles`)
gates at `minTier: 4` — **legendary**, not epic. The epic-gated one (`minTier: 3`) is
`+1 pierce` (`"piercing"`, "of Skewering"). The `+1 ultimate bounce` half of the sentence
is correct as written (`"rebounding"`, `minTier: 5`, mythic).

**Proposed text:**

> - `+1 pierce` doesn't exist below **epic**; `+1 projectile` doesn't below **legendary**;
>   `+1 ultimate bounce` doesn't below **mythic**.

**Why this shape of mistake is worth naming, not just fixing:** the argument the sentence
makes ("a whole extra thing doesn't exist below some rarity, which is why the chase keeps
going") is still correct — only the specific example drifted from the data it illustrates.
Nobody re-checks an illustration once the point it's making still sounds right.

### 7b. Defense doesn't actually cap at 75% — only elemental resistance does

**Current text** (`CLAUDE.md`, "Elemental damage, ailments and resistance"):

> Resistance is asymptotic and capped at 75%, exactly like armor.

**What's actually true:** elemental resistance genuinely hard-caps at 75%
(`RESIST_CAP` in `elements.ts`, enforced by `Math.min` in `resistFraction`). Defense's own
mitigation (`damageReduction = def / (def + 120)` in `player.ts`) is asymptotic **toward
100%**, with no clamp anywhere in the formula — "exactly like armor" has the comparison
backwards; armor is the one of the two that isn't capped. In practice nobody has likely
stacked defense anywhere near the point this would read differently (roughly 1080 defense
for 90% mitigation), which is probably why it's gone unnoticed.

**Proposed text:**

> Elemental resistance is asymptotic and hard-capped at 75%. Defense's own mitigation
> (`def / (def + 120)`) is asymptotic the same way but **not** capped — it keeps
> approaching 100% the more of it you stack, just with steadily smaller returns.

**Why this one is lower-stakes but still worth fixing:** nobody has hit the difference in
practice, but the affix codex now states defense's real behaviour to players directly (it
reads the formula live, the same as it reads everything else) — a `CLAUDE.md` that says the
opposite would be visibly wrong the moment someone compared the two.

---

## Summary for a fast read

| # | Draft | Source of proposed text | Branch | Reviewed by owner? |
|---|-------|--------------------------|--------|---------------------|
| 1 | Raids bullet (solo → co-op, no balance change) | Restructured 2026-09-10 late — the original branch-sourced draft is superseded, kept in a collapsed section as a method finding rather than something to use | superseded draft: `investigate/raid-party-scaling` (never landed); current proposal: pure prose against `548f218`, which did | No — the current, short proposal is the one to review |
| 2 | Loot passage A ("per-hero and physical") | **No draft existed** — written fresh this session against `85bdee6` + `docs/shared-loot.md`, verified against `src/game/dungeon.ts` | none | No — flagged as freshly authored, not a found draft |
| 3 | Loot passage B ("round-robin") | Same as #2 | none | No — same caveat |
| 4 | Campaign-check thinness paragraph | Reconstructed from `tools/campaignblock.ts`'s landed header | none (no CLAUDE.md diff ever committed) | No — already superseded operationally by the tool header |
| 5 | Difficulty philosophy — the reachable band's ruling | Found in full, on the branch (§11) | `investigate/power-curve2` (never merged) | No — and gated on `docs/reachable-band-decision.md`'s own pending re-confirmation; don't apply either until that clears |
| 6 | THE MAP-WIPE RULE (new passage, not a replacement) | Written on the branch; **reverted from `CLAUDE.md` and rewritten against the final state** | `fix/no-mapwipe` | No. Sibling to THE EXECUTE RULE; the code is green and independent of this text |
| 7 | Relic slots bullet — "No level gate" is now false | Written fresh against the shipped code on the branch; a factual correction, not a proposal | `feat/relic-level-gate` | No. The code is green and independent of this text |

| 7 | Two one-line factual corrections (rarity gate example; defense vs. resistance cap) | Found cross-checking `CLAUDE.md` against `mods.ts`/`items.ts`/`player.ts` while building the affix codex | `feat/affix-codex` | No — both are narrow, mechanical corrections rather than design drafts |

**On drafts 2 and 3 specifically:** these were reported not-found in the first pass of this
page, and the PM asked me to write them once it was confirmed nobody had. They are not
"the missing draft, recovered" — they are new prose with no prior owner-facing version, and
should be read with that in mind: less scrutiny has touched them than draft 1's, which at
least passed through whoever wrote it on `investigate/raid-party-scaling`.

---

## Pending edit: the "+1 ultimate bounce" line is now dead

**Branch:** `fix/ultimate-mod-retirement`. **Design record:** `docs/ultimate-mods-removal.md`.

`CLAUDE.md`'s "Items are modifier lists, not stat blocks" section currently reads:

> - `+1 projectile` doesn't exist below **epic**; `+1 ultimate bounce` doesn't below **mythic**.

On the owner's ruling to retire `ultimateBounces` and `ultimateProjectiles` the same way
`wardPower` was retired, the affix that line describes (`of Rebounding`) no longer exists.
**The second clause is fully dead rather than merely imprecise** — there is no ultimate-bounce
affix at any rarity now. The first clause is untouched and still true.

Suggested replacement, which keeps the point the sentence was making (rarity gates the
whole-extra-thing affixes) without naming a retired one:

> - `+1 projectile` doesn't exist below **epic**; `+1 pierce` doesn't below **rare**.

Worth knowing when reading it: the same change leaves the tier-4/5 weapon affix pool two of
six whole-extra-thing entries thinner at the top end. That is a real consequence of the
removal, priced and accepted, not an accident — if the owner wants that pool refilled, it is
its own piece of work.

Not edited on the branch, per the standing rule that `CLAUDE.md` changes come here for one
owner read instead.
