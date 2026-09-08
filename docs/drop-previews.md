# Endgame drop previews

UAT §20 (Endgame Drop Previews), with §17's "clear rewards preview" and §19's "where does
this drop?" answered by the same read.

> The purpose is to clearly communicate: **"I want X item, and this is where I get it."**
>
> — UAT §20

Stand in front of an activity — a portal, a rift tier, a sector, the Vigil, your class's
Proving — and see what it can actually pay out, before committing to it.

---

## The one rule

**A preview never holds its own copy of a drop table.**

A preview that can drift out of sync with the real table is worse than no preview: it
teaches the player something false, and then keeps teaching it. So `src/data/previews.ts`
contains no table at all. Every number and every name in it is a read of something the
simulation already rolls against:

| the preview needs | it reads | which is also used by |
| --- | --- | --- |
| which named items an event can pay | `namedMatchesFor` | `rollNamedDrops`, via the same `sourceMatches` |
| how much harder content lifts the odds | `namedDropChance` | the roll site itself |
| which boss a floor spawns | `bossSpecForRun` | `Dungeon.spawnBoss` |
| coins, keys, gems, rarity, drop volume | the `RunMode` | `profileFor` and the loot roll |
| materials | the `PlanetSpec` | the material payout |
| the daily's guaranteed key | `RunConfig.daily` | the clear cache |

If a preview is wrong, the game is wrong with it — which is the only kind of wrong worth
having.

Two things were extracted to make that true rather than approximately true:

- **`src/data/encounters.ts`** — `bossSpecForRun(config, proving)`. Which encounter a boss
  floor spawns is a three-way precedence (a class's Proving, a sector's reskin, the
  depth-bucketed ladder) that used to live inline in `Dungeon.spawnBoss`. The preview has
  to ask the identical question, so it moved to one place both call.
- **`namedMatchesFor` in `src/data/named.ts`** — `namedForSource` plus *which* source
  answered, since the preview needs the chance to quote and the wording to show. Exported
  so that `sourceMatches` stays the only thing in the game deciding whether a source
  answers an event.

---

## What an "activity" is

A `RunConfig` — which every mode already produces (`delveConfig`, `riftConfig`,
`planetConfig`, `dailyConfig`). `previewForRun` expands it into the *events* the run
contains and asks the drop tables about each:

- the **boss**, if the floor has one
- the **clear cache** the kill quota opens
- every **wave monster** on the way, at the elite-tripled odds, because a floor that can
  produce an elite can pay them

A rift, a sector and the Vigil are fixed sequences, so every floor is walked. **The Delve
previews only the floor you are entering**, deliberately: "descend or extract after every
clear" is the decision that mode exists to create, and previewing floor N+1 would be
previewing a choice the player hasn't made yet.

`previewForChest(tier)` is the same read at a station rather than a portal.

### Odds are quoted per event, and labelled that way

A world drop's 1.2% is *per kill*. Rolling that up into a per-run number would need a kill
count the screen has no business inventing, so it isn't. The number shown is the number the
roll site computes for that event, danger included — asserted to the exact float in
`tools/previews.ts`.

---

## Where it shows up

`TownUI.previewBlock` renders one `ActivityPreview`; every screen that can commit you to a
run calls it with its own selection.

| screen | previews |
| --- | --- |
| Dive | the delve floor under the cursor — and the Proving instead, once that class has earned it |
| Rifts | the selected tier of the selected rift, all floors |
| Star Map | the selected sector and tier, all floors |
| Vigil | today's floor |
| Path | the selected class's Proving, whether or not it's finished |

Exclusives — items only that one activity can pay — sort to the top and carry an **only
here** badge, because that is the "I still need THAT one" the spec is asking for.

Nobody has verified any of this by eye; there is no browser here. The layout is unverified,
the data behind it is not.

---

## The Proving's relic

`proof-of-the-whole` — **Proof of the Whole**, a mythic necklace, the reward for finishing
a class (UAT §13's "potentially unlocks additional cosmetic/status rewards", taken as loot
rather than cosmetics).

The fiction is `docs/game_story_worldbuilding.md`'s LEGEND MASTERY, where a character
recovers *"weapons, relics of their original life, pieces of their myth, fragments of their
identity"*. What you take back from the bottom is the piece of yourself that was down there.
So the item is deliberately an **amplifier rather than a source**: `elementalDamage`
multiplies the elements you already carry, so it makes a themed build more itself instead of
telling a Legend what it should have been.

Two things about how it's wired:

- **One source per class, generated from `CLASS_IDS`**, not typed out. A Proving boss's id
  is `legend-<classId>`, so a class added to the roster gets its own drop of this for free
  and none can be forgotten. `tools/previews.ts` asserts all 21 are present.
- **50% per kill** — the highest of any boss-exclusive, on purpose. This is the hardest
  encounter in the game and the only one gated behind finishing a class; it shouldn't also
  ask you to be lucky. Still not certain, because a certainty is a purchase.

Mythic, not divine — crafting caps at mythic and the top two rarities stay chest-only, the
rule carried over from the original game. `randomMods: 2` so a second Proving can roll a
better copy, which is what keeps the encounter worth repeating.

`bossDisplayName` now resolves `legend-*` ids, or every source line for this item would
have printed a raw id at the player.

---

## What the tests pin

`npm run previews` (`tools/previews.ts`), wired into `npm test`. The headline check is one
property, and it's the reason to trust the rest:

**What the preview lists is exactly what the real roll can produce.** For thirteen
activities — delve floors shallow and deep, the bottom qualified and unqualified, both
rifts at low and high tiers, sectors, the Vigil, a Challenger run — the test asks
`previewForRun` what can drop, then runs the simulation's own `rollNamedDrops` over the same
events with an rng rigged to always hit, and compares the sets. Not a reimplementation of
the drop rules: the actual roll function, forced to succeed. A preview that ever lists
something unobtainable, or misses something obtainable, fails here.

The floor *walk* is restated independently in the test rather than imported from
`previews.ts` — a test that borrowed the preview's own enumeration could only ever agree
with it.

Also pinned:

- Every entry in `RUN_MODES` produces a titled preview that says what else it pays, so a
  mode added later shows up here rather than being silently skipped.
- The quoted chance equals `namedDropChance`'s output to the float, danger and the
  elite-triple included, and a harder tier really does quote better odds.
- **The preview names the encounter that actually spawns** — compared against a real
  `Dungeon` ticked until its boss exists, for a delve boss, a sector boss, a Proving, and
  an unqualified character at the same depth as that Proving.
- Exclusivity is computed from the source count rather than labelled by hand, and
  exclusives sort first.
- Chest previews match the chest table, tier by tier.
- The relic: 21 sources with none missed, nothing but Provings, mythic, every name
  resolves, every class's Proving previews it, and a Proving kill really rolls it.

---

## Files

| | |
| --- | --- |
| `src/data/previews.ts` | the read: `previewForRun`, `previewForChest`, `ActivityPreview`. Pure, no tables. |
| `src/data/encounters.ts` | `bossSpecForRun` — which boss a floor spawns, in one place. |
| `src/data/named.ts` | `namedMatchesFor`, the Proving relic, `bossDisplayName` resolving Provings. |
| `src/ui/town.ts` | `previewBlock`, and its five call sites. |
| `tools/previews.ts` | the acceptance test. |

## Not built

- **No per-item art in the preview.** It lists names in rarity colour, matching the Records
  named list. The named-item art pipeline is on a documented fallback anyway.
- **The Delve previews one floor.** See above — that's a design call, not a gap.
- **Relics and artifacts (§19)** don't exist yet. When they do, they want to be readable
  through `previewForRun` the same way, which is why the shape is `ActivityPreview` rather
  than "named items and some strings".
- **No preview at the hub stations themselves** — you see it on the screen you commit from,
  not while walking past the portal. Adding it to the canvas hub would mean drawing menu
  text on canvas, which `CLAUDE.md` explicitly says not to do.
