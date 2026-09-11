# The reachable band — one curve, four sightings, and an inventory nobody had made

Status: **measured and, per `docs/reachable-band-decision.md`, ruled on — see that
document, which is recorded but still pending the owner's re-confirmation.** This page's
own analysis stays below unedited: it was true when written and is the reasoning the
owner was shown before choosing. Don't read "Options, priced — not recommended" below as
still open — option 3 ("accept the band as correct") is what was chosen, and
`reachable-band-decision.md` is the record of that plus the follow-on mechanism work that
priced *why* the band exists in the first place.

This is not a fourth appendix to `docs/reliquary-reachability.md`. That document is about
the Reliquary. This one is about the shared difficulty curve every mode in the game stands
on (`src/data/depth.ts`'s `profileFor`), and what currently sits past the point where it
stops being winnable by ordinary same-level play. The Reliquary sectors were the fourth
time this project tripped over that fact. This document is the first time anyone wrote
down that it was the same fact each time.

## The finding, stated once

**An attentive, same-level character can clear content up to roughly depth 13-19. Past
that, the shared curve does not get harder — it stops being clearable at all, gradually
rather than suddenly, over about six depths.** Two independent instruments land on this
number without having been built to agree with each other:

| Instrument | Method | Result |
| --- | --- | --- |
| Fine depth sweep (`tools/reachability-pass3.ts`, Q1) | Plain Delve floors, `danger` pinned to 1 (isolated from tier compounding), own level, dodge 0.85, 5 seeds/depth | 5/5 at depth 13, decaying to 0/5 by depth 19 |
| `tools/bot.ts`'s `campaign()` — the same instrument `tools/smoke.ts`'s sharp-vs-reckless comparison runs | 12 seeds, 20 dives each, attentive play (dodge 0.55, a real reaction rate) | Deepest depth reached 8-19 across 12 seeds, **average 11.6, best case 19** |

Neither instrument was built to answer the other's question — one is a synthetic sweep at
a fixed level, the other is a full campaign that levels and gears itself up as it goes —
and they agree to within their own noise on where the ceiling sits. That agreement is the
cross-check none of the three earlier sightings below had on their own.

**This is a slope, not a cliff** (Q1's own table: 5/5 → 4/5 → 4/5 → 2/5 → 2/5 → 1/5 →
0/5, depths 13-19). That distinction matters for what it implies: a cliff would suggest a
discontinuity somewhere in the formulas — a term that kicks in sharply at one depth. A
slope means the curve is doing exactly what it was built to do, continuously, and simply
keeps doing it past the point where a same-level character can keep up. Nothing is broken.
The curve is not malfunctioning. It just does not stop.

## Four sightings, one wall

Every one of these was filed as its own, separate finding. Read together, they are the
same number measured four different ways.

1. **The campaign bots** (`docs/reliquary-reachability.md`, and the instrument this
   project already uses for the sharp-vs-reckless balance comparison): depth 8-19 across
   12 seeds, average 11.6. Recorded, and left alone — nobody asked whether the ceiling was
   about the bot's skill or about the curve underneath it.
2. **The Proving, CLAUDE.md ("Depth 30 is far beyond the measured frontier")**: "the
   campaign bots reach roughly a third of it, and at level 60 most sampled classes can't
   beat depth 30 in *either* flavour. That's a progression-curve and class-balance
   finding, not something to tune this encounter around." Filed as a class-completion
   concern. It affects the Legend Mastery ending — the gold border — for **all 21
   classes**, because depth 30 is the one gate every class's Proving shares.
3. **The Convergence's boss floor** (CLAUDE.md, `data/weekly.ts`): its own boss floor
   deliberately draws from a *shallower* band (9-11) than the trash floors that lead into
   it (12-16), because a `tools/smoke.ts` survivability pass found "a raid boss at the
   same depth as an escalated trash floor is dramatically harder, not incrementally
   harder, and that this isn't specific to the Convergence — the delve's own depth-15
   boss is close to unbeatable for the same characters that clear a depth-15 trash floor
   without much trouble." CLAUDE.md already names this "the same 'far beyond the measured
   frontier' finding the Proving section... hit independently" — filed as a design
   workaround, shipped, never named as the general case.
4. **The Reliquary sectors** (`docs/reliquary-reachability.md`, this investigation):
   sector 4 (baseDepth 19) is where a plain sweep also starts failing; sector 6 (baseDepth
   29) is already total. Filed as a Reliquary-specific balance question until pass 3 ran
   the same sweep on plain Delve floors and got the same number with the Reliquary
   removed from the test entirely.

Sighting 3 is worth sitting with for a moment: it is a *fix*, already shipped, for a
symptom of this exact wall — built and merged without anyone writing down what it was a
fix for. That is what "filed as somebody else's problem each time" means concretely: the
Convergence's design got quietly reshaped around a wall that was never named, and the
Reliquary's design didn't, because nobody had connected the two.

## What kills the run, at the wall

From pass 3's Q2 (`docs/reliquary-reachability.md`): at every depth tested past the wall
(19 through 44), death is **attrition** — several potions drunk, 2-5x the character's own
max health absorbed before dying — not a single unavoidable hit. Kill counts confirm it
from the other side: a dying character is still landing kills, just not fast enough to
reach the floor's quota before running out of health and potions. This is the honest
answer to the standing objection (below): it is not a mechanic deleting the character in
one hit that no amount of skill dodges. It is being slowly out-damaged over a real fight.

## Why this isn't the same mistake CLAUDE.md already warns against

CLAUDE.md's own precedent is explicit that "a bot cannot do it" is not "it cannot be
done" — the Proving section states this outright, refusing to treat the campaign bots'
depth ceiling as grounds to retune the encounter. This document leans on that same class
of instrument, so it has to answer the objection rather than repeat the mistake it warns
about. Two things carry the weight, not the bot's reported depth by itself:

- **Pass 1 already tested "a better player might"** at the Reliquary's own sectors:
  perfect telegraph-reading (dodge 1.0, more generous than any real player) and +116
  character levels over a sector's own baseDepth, cross-checked across four classes. It
  stayed at 0/5. Whatever margin skill and levels can buy, it was already spent in that
  test and the wall did not move.
- **The attrition signature above rules out the other easy dismissal** — "the bot doesn't
  dodge a specific mechanic." An attrition death across dozens of seeds, several potions,
  partial kill progress, is not the shape of a bot walking into a telegraph. It is the
  shape of a fight that cannot be won at the numbers on both sides of it.

Neither of those closes the question completely — see "what's still not known," below —
but together they are why this is being written up as a property of the curve rather than
of the instrument measuring it.

## What the first attempt at a fix taught

Before this was understood as a curve-wide question, the obvious-looking fix was tried
against the Reliquary alone: compress sectors 4-9's `baseDepth` from `19, 24, 29, 34, 39,
44` to `19, 22, 25, 28, 31, 34` — same starting sector, roughly 40% shallower ladder from
there. It barely changed anything: every sector but the unchanged first one stayed at
0/8. The reason, obvious only in hindsight, is now the header of this document — depth 19
was already past the wall, so a "shallower" ladder that still starts there re-inherits
the same wall it was meant to fix.

**That is the direct proof this is a band problem, not a placement problem.** You cannot
fix it by moving content around inside the band's own neighborhood; the only things that
move the outcome are moving the band itself, or moving content to somewhere the band
already reaches (see options, below).

## The inventory

The PM's ask, and — as far as this investigation can tell — nobody has assembled it
before. Split by how firmly each line is established, because this document should not
launder a derived number into the same confidence as a measured one.

**Measured directly** (a scripted bot actually ran the content and the result is a win/loss count):

- **Reliquary sectors 4-9** (`docs/reliquary-reachability.md`). Sector 4 already partial,
  6-9 total.
- **The plain Delve past depth ~19**, and by construction (`profileFor` is depth+danger
  only, mode-agnostic — already confirmed live in pass 2) **every mode that hands it a
  bare depth past ~19 at danger 1**: an ordinary Delve floor is the control case for the
  whole rest of this list.

**Documented elsewhere in this project, now tied to the same number:**

- **The Proving, depth 30, all 21 classes.** CLAUDE.md's own words: "far beyond the
  measured frontier." Every class's Legend Mastery ending and gold border sits behind
  this gate. Depth 30 is 11 depths past where this investigation's sweep already reads
  0/5.
- **A Delve boss floor, from roughly depth 15.** CLAUDE.md: "close to unbeatable... while
  the same characters clear a depth-15 trash floor without much trouble." A boss crosses
  the wall several depths *before* the trash floor at the same nominal depth does — the
  Convergence's own boss-floor-drawn-from-a-shallower-band design already routes around
  exactly this, without naming it.

**Derived from data already in the repo, not independently simulated at nonzero
`danger` in this pass — read as likely, not confirmed:**

- **The Delve's own advertised "no upper bound."** Mechanically true, practically empty:
  everything past roughly depth 19-20 of an endless ladder is a depth number the game
  will generate, not content an ordinary same-level run will ever bank.
- **The Tower, past height ~19-20.** `tools/world.ts` already asserts height *N* and
  depth *N* produce identical `enemyHealth`/`enemyDamage`/`enemySpeed`/`aggression`/
  `telegraph` — the whole point of "no second difficulty curve." That equality means the
  ascent inherits this wall exactly, at the same number, and nobody has said so before:
  the back half of "Heaven Layers" (`UP_LAYERS`, depth 6-25) and the entirety of
  "Celestial Endgame" (26-∞) sit past it, mirroring the Delve's Hell Layers/Hell Endgame.
- **The Memories (the Altar) — the whole system, not a hard corner of it.**
  `MEMORY_UNLOCK_DEPTH`/`MEMORY_UNLOCK_HEIGHT` are both 30 — both independently past the
  wall by the Proving's own finding above, and a Memory needs **both at once**. This is
  not "a hard endgame system." As things stand, it is a shipped system with no confirmed
  path in.
- **Two of the four raids** (`data/raids.ts`): the Minotaur and the Tyrant unlock at
  frontier 26, already past the wall; the Ferryman (12) and the Queen (16) sit right at
  its edge, where the boss-vs-trash gap above already shows a boss is harder than the
  wall's own trash-floor number implies. Raids are explicitly designed to be "the hardest
  thing in the game" (their own `RAID_HEALTH`/`RAID_DAMAGE` multipliers stack on top of
  the deepest authored encounter's stat line on purpose) — this may be the one entry on
  this list that is past the band **by design** rather than by accident, and it is called
  out separately for exactly that reason.
- **The Universal Skill Tree's own point budget.** `universalPointsFor(frontier) =
  min(20, floor(frontier/2))` — the cap of 20 is only fully funded at frontier 40, more
  than double the ~19 ceiling this investigation measured. The tree's own design
  intentionally keeps the cap "well under the tree's total cost" so nobody finishes it —
  but the frontier that funds the cap itself falling this far short of it does not read
  as the same deliberate choice, because nothing in `docs/universal-tree.md` frames it
  that way. Worth the owner's eye independent of everything else here.
- **The Abyssal Rift, past roughly tier 4-5** (baseDepth 8, `depthPerTier` 2.2,
  `dangerPerTier` 1.17 — tier 5's boss floor already computes to depth ~21 at 1.87x
  danger). Not simulated at nonzero `danger` in this pass; flagged as the least certain
  line on this list and the most in need of its own measurement before anyone prices
  anything against it.

## What's still not known

- **A hand-optimized real build was never tested at the wall.** Pass 2 flagged this and
  it is still true: named items, a legendary elemental Augment, a deliberately optimized
  tree allocation. The gap this document measures looks too large for that alone to close
  it, but "too large" is a judgment, not a number — nobody has spent the time to build
  the best case and run it.
- **"Own level" undercounts a player who actually played the ladder in.** Pass 2's own
  "+10 levels" rows cleared meaningfully better than "own level" rows (sector 4: 0/5 →
  2/5). A player who ground through several prior sectors, or several prior Delve floors,
  arrives over-levelled relative to a synthetic same-level test — how much wider that
  makes the real reachable band, as opposed to the synthetic one measured here, is not
  measured.
- **The Abyssal/Avarice Rift and raid lines above are derived, not run.** Everything in
  the "derived" tier of the inventory should be read as "worth checking before it's
  priced," not as a second confirmed sighting.

## Options, priced — not recommended

**Kept as written for the record; option 3 is what was chosen.** See the status line at
the top and `docs/reachable-band-decision.md` for the ruling and why it holds — pending
the owner re-confirming it, per that document.

Three shapes an answer could take. This section prices what each one touches; it does not
pick one. That is the owner's call, stated as one because it changes what the game
*is*, not because it is this investigation's to make.

**1. Move the band — soften the shared curve (`profileFor`).**
Blast radius: everything. The Delve, the Tower, every rift, every planet, raids, the
Vigil, the Convergence, the Challenger dial all read the same function, so this is the
single highest-leverage change available and the single most dangerous one to make
blind — CLAUDE.md already carries a live, unresolved finding against this exact curve
(the depth-15 boss gap) and a documented history of measurement instruments that looked
fine and were wrong (the campaign-comparison inversion, the boss-telegraph check). Whatever
moves here needs a wider A/B than anything in this document, on purpose, before it ships.

**2. Move the content — relocate what currently sits past the band.**
Cheaper per line item, and the Reliquary attempt above is the direct evidence for its
limit: relocating content *to* somewhere the band already reaches works (map sectors 4-9
onto depths 13-18, as `docs/reliquary-reachability.md` pass 3 did, and clear rates follow
the band's own numbers) but it compresses everything currently spread across the
unreachable range into the same narrow six-depth window, which stops reading as a ladder
with real pacing. Applied to the whole inventory above rather than one system, this is a
much larger renumbering project than it looks from the Reliquary alone — every entry in
the "documented" and "derived" tiers would need its own version of the same compression,
and some of them (the Proving's depth-30 identity, the Tower's mirrored curve, a raid's
"hardest thing in the game" premise) may not have anywhere shallower to move to without
losing what makes them that thing.

**3. Accept the band as correct — the content past it is deliberately a long tail.**
The cheapest option to ship and the hardest to be sure of: reclassify everything past the
band as intentional aspirational content, the same "keep it absurd, the long tail is the
hook" ethos `data/rarity.ts` already applies to unspoken and divine. Costs nothing to
build. What it costs is confidence that every line in the inventory above was actually
meant to read this way — the Proving's own class-completion framing and the Convergence's
guaranteed-reward boss floor both read, on their face, like content meant to be reachable
with effort rather than content meant to gate almost nobody, and nothing in this
investigation can tell those two intents apart from the outside.

## Reproducing this

`npx tsx tools/reachability-pass3.ts` for the band measurement (Q1) and the attrition
finding (Q2); `docs/reliquary-reachability.md` for the Reliquary-specific numbers this
document generalizes from. The campaign figures are `tools/bot.ts`'s `campaign()`, the
same instrument `tools/smoke.ts` already runs for the sharp-vs-reckless comparison — no
new harness needed for that half. The inventory's "derived" tier is arithmetic against
`src/data/modes.ts`, `src/data/raids.ts`, `src/data/layers.ts` and
`src/progression/universal.ts` directly; none of it required a new simulation to state,
and none of it should be treated as more certain than that until one is run.
