# The Nine Circles — re-cutting the Delve's biome bands

**Status (2026-09-11): built on `feat/nine-circles`, gate-green, queued for the owner's
batched yes/no. Nothing on master.** The art side (four new sheets) is session 56's and is
behind the summon sprites in their queue; this branch does not wait for it — see §4.

The worldbuilding doc's Delve is nine circles. The game's was six biomes with names from
before the doc existed — Training Grounds, Whispering Forest, Dark Cave, Ashen Wastes,
Dragon's Lair, The Veil — in flat five-depth bands. `docs/art-wave-2.md` §5b priced the
honest version of the fix (re-cut the bands, not just rename six of nine) and the owner
approved it as part of art wave 2. This is the world-structure half.

## 1. The cut

| Circle | Name | Depths | Boss floor | Element | Sheet | Layer |
|---|---|---|---|---|---|---|
| I | Limbo | 1–5 | 5 · Warden | physical | `tiles.delve-limbo` | The Surface |
| II | Lust | 6–8 | — | void | *borrows The Veil's* | The Deep Delve |
| III | Gluttony | 9–11 | 10 · Choir | poison | `tiles.delve-gluttony` | The Deep Delve |
| IV | Avarice | 12–15 | 15 · Colossus | lightning | *borrows Heresy's* | The Deep Delve |
| V | Wrath | 16–17 | — | fire | `tiles.delve-wrath` | The Hell Layers |
| VI | Heresy | 18–19 | — | lightning | `tiles.delve-heresy` | The Hell Layers |
| VII | Violence | 20–21 | 20 · Herald | fire | *borrows The Veil's* | The Hell Layers |
| VIII | Fraud | 22–23 | — | poison | *borrows Treachery's* | The Hell Layers |
| IX | Treachery | 24–25 | 25 · Nameless | cold | `tiles.delve-cave` | The Hell Layers |
| — | The Veil | 26–∞ | 30 · Nameless / the Proving | void | `tiles.delve-veil` | The Hell Endgame |

`DELVE_LADDER` in `src/data/biomes.ts` is the table; `biomeFor` reads it; `BIOMES` is still
the ordered style list everything else consumes. Names are the doc's headings, one word
each, in the game's register: "Wrath — Warden's Hall", "Treachery II".

**The edges are not arithmetic, and that is the whole point.** `data/layers.ts` did not
move. Its bands — 1–5, 6–15, 16–25, 26+ — are the fixed reference, and its lore already
says what each holds: Limbo alone on the Surface, "the circles of appetite" in the Deep
Delve, "rage, false faith, a war that never finished" in the Hell Layers, and "past the
last circle the ground stops being Hell's" from 26. Three circles in ten floors and five in
ten is what those bands hold. The extra floor in the appetite band goes to Avarice, the
widest appetite and the one with a rift named after it. Boss floors stay every fifth depth
(`bossFor` untouched): 15 closes Avarice, 20 opens Violence, 25 closes Treachery.

**The alternative, and who decided against it.** Nine circles over 1–30 with the Veil from
31 would give the five idea circles three floors each instead of two. It was priced and
rejected by the PM session (lootsim-9f), as its call and explicitly not the owner's: moving
the Hell Endgame edge from 26 to 31 re-baselines the very reference `npm run world`
measures the new ladder against — the "converted a check into a mirror" failure
`docs/blind-instruments.md` catalogues — and it moves the Proving at depth 30 off the
Abyss's ground, where `data/legends.ts` and the layer table both say the unrecovered Legend
is kept. Two-floor circles at 16–25 are the honest price of not doing that. If the owner
ever wants the wider cut, that is the trade being made.

The six existing sheet-and-element pairs are kept exactly, because the smoke test's
contrast gates measure a sheet under a tint against a monster infused with the floor's
element, and moving any of those reopens a measured floor. The Dark Cave's frozen rock
became Treachery — the doc says the ninth circle "should be frozen" — at the depth it should
have had all along.

## 2. What else moved

- **Floor numerals** count from the circle's first floor (`floorName` in `data/depth.ts`):
  depth 9 is "Gluttony I", not "Gluttony IV" off a five-floor cycle the circles no longer sit
  on. The Veil has no bottom, so past its fifth floor the numeral cycles as it always did.
- **Heavy dressing** (`DRESSING` in `game/level.ts`) is keyed by biome name, and a missing key
  is "no heavy props" rather than an error — so the rename would have silently stripped the
  Delve. Re-keyed, four new mixes from the existing Delve prop set, and `npm run world` now
  asserts every Delve biome has a mix. Limbo's mix and props still include a torch and a
  brazier; the art guide says the first circle has *no fire at all*. Left as shipped — it is
  the first floor of the game and the owner has looked at it — and flagged here for the art
  pass rather than changed under a world-structure branch.
- **The owner's pinned Ashen Wastes exception** in `tools/smoke.ts` (fire-on-fire on
  `tiles.delve-wrath`, ruled "looks fine" 2026-09-10) is keyed by biome name. The key is now
  "Wrath". Same sheet, same tint, same element, same ruling; only the string moved.
- `tools/inworld.ts`'s sample floors, the `TILESETS` comments, `docs/art-manifest.md`'s raid
  arena table and `docs/memories.md`'s place count read the new names.

## 3. The headline risk: a rename deletes owned Memories

A Memory's `placeId` **is** the biome's name (`memoryPlace` finds by `name`), and
`GameState.load` drops any Memory whose place "names nowhere in the game" — a deliberate
rule, the `normalizeAppearance` shape, so a retired place can't crash the Altar. Rename five
biomes and every Memory of one of them is silently deleted on the first load after the
update, for a player who did nothing wrong, and the Vault is endgame content bought with
Ash and coins.

`LEGACY_PLACE_NAMES` in `data/memories.ts` maps the five shipped names forward, and
`GameState.fromSaved` applies it *before* the validation that would drop them.
Version-agnostic, like every migration in this file's lineage. The keys are the strings the
shipped build wrote — copied from the biome table as it stood on master at save version 34,
not derived from the current table, because a map derived from the thing being renamed would
mirror it.

`npm run world` builds a version-34 save holding one Memory in every shipped place and every
current place (27 in all), loads it, and asserts all 27 come back with each shipped-era place
reading as the circle it became. It also loads a Memory of a place that really names nowhere
and asserts *that* one is dropped — the instrument has to be able to see a loss. With the
migration removed the check reads "27 written, 22 read". Save version **36**, claimed in
`save.ts`'s in-flight list; 35 belongs to the relic level gate, ahead of this in the queue.

## 4. Borrowing a sheet out loud

Four circles have no sheet yet. The choice as first posed — block this branch on four
generations, or ship four flat-baked floors — was rejected by the PM in favour of the move
the Tower already made with `SHARED_MONSTER_SETS`: **borrow a painted circle's look,
declare it, and gate the declaration so landing the real art forces the line out.**

`BORROWED_LOOKS` in `data/biomes.ts` is the declaration. `npm run world` fails a sheet
shared by two circles without a declared borrow, fails a declared borrow whose two sides
no longer match (sheet *and* every palette value — the tint is part of what the contrast
gates measured the sheet under, so a borrower on its own tint would be an ungraded pair), and
prints every borrow on every run as a `TEMPORARY` line, so four temporary lines are visible
rather than nothing.

Lenders were chosen by measurement, not adjacency. Every (sheet, element) pair a borrow
could create was run through the smoke gate's own functions first (bar: 28 luminance
between the graded floor and the worst infused monster):

| Borrower | Element | Lender | Pair already measured? | Margin | Why not the neighbour |
|---|---|---|---|---|---|
| Lust | void | The Veil | yes (the Veil is void) | 54 | Limbo × void = 18, fails; Gluttony × void = 31, passes by 3 |
| Avarice | lightning | Heresy | yes (Heresy is lightning) | 46 | Wrath fails every element; Gluttony × lightning = 50 but is a new pair |
| Violence | fire | The Veil | no — 56, well clear | 56 | Heresy × fire = 25, fails; Wrath × fire is the owner-pinned collision |
| Fraud | poison | Treachery | no — 38, clear | 38 | Heresy × poison = 34 also passes; the ice reads as the approach to the frozen ninth |

No circle borrows an *element*: the element is a gameplay fact (a resistance decision on the
way down) and stays stable across the art landing; the sheet is not. The full gate re-measures
every pair on every run, so the two new pairs are now measured pairs.

When a sheet lands: commit the PNG and the `TILESETS` row, give the circle its own palette
from `docs/art-style-guide.md` §5 (the target values are in the biome's comment), and delete
its `BORROWED_LOOKS` line — the stale-borrow check goes red until you do.

## 5. What would make the checks go red

- **The existing edge check** (`every descent band starts where the biome changes`) still
  reads DOWN_LAYERS, which did not move: any circle edge that leaves depth 6, 16 or 26
  mid-circle goes red against a reference the ladder did not derive.
- **The doc-grep check** reads `## Circle N — Name` out of `docs/game_story_worldbuilding.md`
  at test time and compares the first nine biome names against it in order. The tiebreaker
  document is the bound. Renaming Fraud to "Deceit" in the code: red.
- **The band-membership checks** count circles per layer against the layer table's ids:
  exactly one on the Surface, exactly the three appetites in the Deep Delve, exactly the five
  ideas in the Hell Layers.
- **The stale-borrow check**: Violence given its own tint while still on the Veil's sheet: red.
- **The survival check**: the migration line removed from `fromSaved`: red, 22 of 27.

All five injections were run and restored before the gate.

## 6. The rng, and what this does not claim

Every Delve, rift, Vigil and Convergence floor's spawn sequence moves — a circle's layouts,
props and traps are drawn from the shared stream — so **no balance number measured before
this landed survives it, and none is quoted here.** The campaign comparison in `npm run
smoke` was read as a comparison only; a red there would have been run on a disjoint seed
block before being called a regression (`feedback-campaign-check-flakes-one-in-thirty`).

Not touched, on purpose: `bossFor`, DOWN_LAYERS, the layer lore, the Proving, the rarity
ceiling, any element on a painted sheet, Limbo's fire.

## 7. A blind instrument the re-cut exposed: the reward harvest at Challenger 8

The first full gate on this branch went red in one place, `npm run rewards`: "the harvest
collected drops on both sides — 12 plain, 1 hard". Master reads 3 hard on the same seeds —
which is the check's own bar of "at least 3". Measured properly, on both trees, 48 seeds:

| dial | tree | kills | elite kills | drops (per 12-seed block) | survival |
|---|---|---|---|---|---|
| 8 | master | 147 | 5 | 22 (3 / 8 / 7 / 4) | 8.3 s, 0/48 alive |
| 8 | this branch | 134 | 0 | 3 (1 / 1 / 0 / 1) | 8.4 s, 0/48 alive |
| 5 | master | 343 | — | 47 (16 / 15 / 7 / 9) | 10.8 s |
| 5 | this branch | 362 | — | 44 (9 / 12 / 9 / 14) | 11.5 s |
| 3 | master | 604 | — | 79 (26 / 17 / 18 / 18) | 18.3 s |
| 3 | this branch | 634 | — | 72 (19 / 18 / 14 / 21) | 18.8 s |

The fixture is a level-60 swordsman standing still and pressing attack. At dial 8 it is dead
in eight seconds on every seed of both trees with the same handful of trash kills; master's
22 drops are the five elites (a guaranteed drop each) that happened to walk into its swing
before it died, and on the re-cut floor at depth 12 none did. Neither Avarice's element nor
its layouts alone restore the count, and at dials 5 and 3 — where the target lives long
enough to kill things — the two trees yield the same to within noise. So this is not a drop
regression; it is the "row pinned at 0/16 cannot move" instrument from CLAUDE.md, and it was
already there on master, passing by luck at exactly its bar.

Fixed in its own commit on this branch, scoped to the instrument: the hard side's dial is
5, with the measurement above in the comment. Nothing the section asserts needed the +3 item
power the old dial was chosen for — item level tracks the character since docket §23, and
the quantity and variant axes are read off the profile. If the PM would rather this land
separately, the commit is severable.

## 8. Left for the art side (session 56)

- `tiles.delve-lust`, `-avarice`, `-violence`, `-fraud` — §5 palettes are on the biomes.
- Limbo's torch/brazier versus "no fire at all" — owner's eye, not a structural fix.
- The Circle craftables in `docs/art-wave-2.md` §4c now have floors to belong to.
