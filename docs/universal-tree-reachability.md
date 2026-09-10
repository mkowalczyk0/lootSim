# The Universal Skill Tree's point cap — measured against a player who exists

Status: **measured, not fixed, and deliberately not recommended** — for the point-cap
question itself. `docs/reachable-band.md` flagged this in its "derived" tier and stopped
there: "the frontier that funds the cap itself falling this far short of it does not read
as the same deliberate choice... worth the owner's eye independent of everything else
here." This document is that independent look — a real campaign against both ladders, not
arithmetic against the curve alone.

**Update (Sept 2026, PM ruling): the keystone-cost asymmetry below (Part B, "the six
keystones are not equally priced") is fixed.** All six now cost 7 points minimum — see
the note inline in that section for what changed and why, and the note at the end of Part
B for the consequence this has for "what a realistic frontier buys," which moved. The
point cap, `universalPointsFor`'s rate, and the Delve-vs-Tower reachable-band question in
Part A are untouched and remain exactly as measured below — fixing the asymmetry was
ruled independent of those and was applied without waiting on them.

## The finding, stated once

**`UNIVERSAL_POINT_CAP` (20) is fully funded only at account frontier 40. A real,
attentive campaign — fresh 60-seed runs against both the Delve and the Tower, today —
averages frontier 11.7 and 10.8 respectively, buying 5-6 universal points: one keystone,
and nothing left over for a second one or a hybrid.** `tools/universal.ts`'s own "54% of
the tree is affordable" is arithmetically correct and describes a player who, on today's
measurement, essentially does not exist — the best of 120 campaign-dives across both
ladders reached frontier 20, which still only buys 27% of the tree.

This is the same shape of finding CLAUDE.md already names for the difficulty curve
itself ("Depth 30 is far beyond the measured frontier") and for the Convergence's boss
floor: an instrument that is answering a real, correct question about a player nobody is.

## Part A: the campaign, run fresh, both ladders

`docs/reachable-band.md`'s own campaign figure (11.6) is 12 seeds, from before today's
CAMPAIGN_SEEDS widening to 60 and before whatever else moved in master today. Rather than
spend that number a second time without checking it, `tools/universal-reachability.ts`
re-runs the *exact same instrument* (`tools/bot.ts`'s `campaign()`, dodge 0.55, 20 dives)
across all 60 current seeds, and adds a same-shape climb for the Tower — nothing upstream
of this investigation had ever run one.

| Ladder | avg | min | max |
| --- | --- | --- | --- |
| Delve (fresh, 60 seeds) | **11.7** | 4 | 20 |
| Tower (fresh, 60 seeds, same seeds/dodge) | **10.8** | 4 | 18 |

**The Delve figure replicates**: 11.7 today vs 11.6 on 12 seeds in `reachable-band.md`,
despite "master has moved a lot" between the two readings. That is the cross-check this
document's headline number needed before leaning on it, and it holds.

**Delve and Tower read as the same ladder at this sample width — but only barely, and the
gap is not stable underneath.** Split into the same natural 12-seed blocks `CAMPAIGN_SEEDS`
is already built from, the Delve−Tower gap is -0.50, -0.25, +1.25, +1.25, +2.33 — it
crosses zero. A single 12-seed reading of this comparison could show the Tower harder,
the same, or easier than the Delve depending only on which block it drew, which is
exactly the "sign flips on the seeds alone" signature CLAUDE.md already warns about for
the sharp-vs-reckless campaign. **Read the averages (11.7 vs 10.8) as "statistically
indistinguishable at this width, consistent with `tools/world.ts`'s height-for-depth
equality" — not as evidence the Tower is a harder or easier climb.** A second, disjoint
60-seed sweep is what it would take to say more than that, and this document doesn't
spend it, per the instruction this was scoped under.

## Part B: what the realistic budget actually buys

The tree costs 37 points total (root 1, six paths of four 1-point nodes plus a 2-point
keystone each). `tools/universal-reachability.ts` computes, exactly rather than by
estimate, the minimum-cost legal chain to every keystone and to every hybrid/Mythic
unlock, then brute-forces (2^6 subsets — small enough to be exact) how many keystones a
given point budget can hold at once.

**FIXED, Sept 2026 (PM ruling).** The six keystones used to price out unequally, and not
by design choice — it fell out of where the three cross-links pointed:

| Keystone | Path | Minimum cost (before the fix) | Why |
| --- | --- | --- | --- |
| Hoarder | Avarice | **5** | cross-linked to Might's row-0 node (`force`), which needs no predecessor of its own |
| Unbound | Attunement | **6** | cross-linked to Swiftness's row-1 node (`reflexes`) |
| Adamant | Warding | **6** | cross-linked to Vitality's row-1 node (`toughness`) |
| Immovable | Vitality | 7 | straight chain, not cross-linked |
| Windborne | Swiftness | 7 | straight chain, not cross-linked |
| Overwhelming Force | Might | 7 | straight chain, not cross-linked |

The cross-link was not an optional shortcut a player could choose to skip — it *replaced*
the in-path prerequisite entirely (`bulwark`'s only legal prerequisite was
`vitality/toughness`; `warding/barrier` was no longer required for anything). So Hoarder,
Unbound and Adamant were unconditionally the cheap third of the roster, and reaching them
never required spending in their own path's middle nodes at all — a real player always
reached one of the same cheap three, never a genuine choice across six.

**The fix** (`src/progression/universal.ts`, `CROSS_LINKS`): each of the three links now
targets its neighbouring path's **row-2** node instead of row-1 — the same row the in-path
node it replaces sits at, so the substitute route costs exactly what the replaced one did.
All six keystones now cost **7** points minimum, uniformly. The cross-link/DAG structure
itself (§1 of the file header) is untouched — a build still can't reach any of the six
keystones "purely," every one still carries a down-payment in a neighbouring path — only
the size of that down-payment changed, from "smaller than the straight chain" to "the
same as it."

**Full sweep, points to keystones simultaneously affordable (post-fix):**

| Points | % of tree | Keystones reachable |
| --- | --- | --- |
| 0-6 | 0-16% | **none** |
| 7-9 | 19-24% | 1 (Immovable) |
| 10-15 | 27-41% | 2 (Windborne, Unbound — then Immovable, Windborne) |
| 16-18 | 43-49% | 3 (Immovable, Windborne, Unbound) |
| 19-20 (the cap) | 51-54% | 4 (+ Adamant) |

**A consequence worth naming plainly, not burying: fixing the asymmetry moved the
"realistic frontier" answer, and moved it the wrong way for anyone hoping the fix would
also help the point-cap finding below.** Before the fix, a realistic 5-6 point budget
bought exactly one (cheap) keystone. After the fix, the cheapest keystone costs 7 — one
more point than that budget has — so a realistic player today reaches **zero** keystones,
not one. This is the correct, intended result of the fix (the old "one keystone" answer
was itself an artifact of the same asymmetry being fixed here, not a real tradeoff), but it
sharpens rather than softens the Part B finding below: the point cap and the curve that
funds it are unchanged, and they were already the more consequential open question. Fixing
the asymmetry was ruled independent of that question and correct either way — but whoever
picks up the cap/rate options at the end of this document should know the "one keystone at
a realistic budget" framing they were written against no longer holds.

**Hybrids and Paragon, the tree's other payoff, cost about the same as the keystones
now**: Channeller and Treasure Hunter are reachable at 6 points, Duelist's Step and
Stonewall at 7, Paragon at 10. At the campaign's realistic budgets (5-6 points) a player
affords the cheapest hybrid but no keystone at all; at 7 points, a keystone *or*
Duelist's Step/Stonewall, never both.

**Answering the question directly (pre-fix numbers, kept for the record — see the
consequence note above for what changed):** at the Delve's fresh average (frontier 12, 6
points), exactly one keystone (Unbound) was reachable, with nothing left over. At the
Tower's fresh average (frontier 11, 5 points), exactly one keystone (Hoarder). At the
best single campaign result across 120 dives (frontier 20, 10 points), two keystones —
Windborne and Unbound, which happen to share almost their entire prerequisite chain
(Swiftness's own first two nodes), so this was a cheap coincidence of the DAG's shape, not
evidence a typical build reaches two keystones by two different routes. Post-fix, the
frontier-20/10-point case still reaches the same two (Windborne, Unbound — see the full
sweep table above), but the Delve/Tower fresh-average cases now reach **zero**, not one.
**A keystone was reachable at a realistic frontier before the fix and no longer is after
it — the asymmetry was the only thing making one affordable at all.** Whether the tree
should therefore fund more of itself at a realistic frontier is exactly the point-cap
question this document already raises below; this fix didn't answer it, it removed the
one thing that was quietly softening it.

## What this does and doesn't mean

- **The gate's headline number was describing a hypothetical**, not a lie: `wholeTree`,
  `UNIVERSAL_POINT_CAP` and the 54% figure are all exactly correct arithmetic. They're
  just arithmetic about frontier 40, and nothing plays there today. Fixed cheaply:
  `tools/universal.ts` now prints the realistic-frontier figure (6 points, 16%) directly
  under the cap figure, sourced from this document, so the next person reading the
  test's output sees both numbers rather than only the flattering one.
- **This is not evidence the tree is broken.** Zero-to-one keystone at a realistic
  frontier, chosen from six real options each with a real downside, is a narrower
  tradeoff than the tree's own design language describes, not a nonexistent one. Whether
  the point cap should fund more of it is the owner's call, not this document's.
- **FIXED (Sept 2026): the DAG's own cost asymmetry (formerly 5/6/6/7/7/7, now 7/7/7/7/7/7
  uniformly)** — see the "FIXED" callout in Part B above for what changed
  (`src/progression/universal.ts`'s `CROSS_LINKS` now targets each neighbouring path's
  row-2 node instead of row-1) and the consequence note there for how it moved the
  realistic-frontier answer. This was the PM's ruling, not the owner's — it was judged a
  defect (an accidental side effect of which row a cross-link happened to point at) rather
  than a balance choice, so it didn't wait on the point-cap questions below.
- **`universalPointsFor`, `UNIVERSAL_POINT_CAP` and every other node's cost are still
  untouched.** Only the three `CROSS_LINKS` target nodes moved. Changing the curve or the
  cap remains a live balance change to shipped progression
  every existing save reads — the owner's call, the same as the reachable band itself.

## Options, priced — not recommended

**1. Lower the cap to describe the player who exists.** Cheapest, most honest fix to the
*description* — a cap that actually sits near what a realistic frontier funds would stop
the tool's own "affordable" language from describing a hypothetical. Costs nothing but a
number; changes nothing about what an existing save can already reach today (the cap
only ever binds *above* what anyone currently has).

**2. Raise `universalPointsFor`'s rate so a realistic frontier funds more of the tree.**
Doubling the rate (one point per depth instead of two) would put the Delve average at 11-12
points — two to three keystones, roughly where the campaign's *best* result sits today.
This is a real power increase to every existing character retroactively, the same
category of change `docs/reachable-band.md`'s option 1 flags for the shared depth curve:
cheap to write, needs a wide A/B before it ships because it touches every save.

**3. Leave the cap and the rate exactly as they are, and treat "one keystone, chosen from
six" as the intended shape of a realistic build.** Costs nothing to build. What it costs
is the same thing option 3 costs in `reachable-band.md`: confidence that the tree's own
"paths and tradeoffs" language was written to describe this narrower experience rather
than the wider one the cap's own headline number implies. Nothing in `docs/
universal-tree.md` says which was meant.

None of these three touches the Delve-vs-Tower finding in Part A, which reads as "no
difference worth acting on at this sample width" regardless of what happens to the cap.

## Reproducing this

`npx tsx tools/universal-reachability.ts [seedCount]` (default 20; this document's numbers
are the full 60). Runtime is real — roughly 7.5 seeds/minute across both ladders on this
machine, so all 60 takes about 7-8 minutes. The tree-affordability half (Part B) is
instant; only Part A's campaigns cost time.
