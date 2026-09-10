# Memories — the custom-rift endgame

**Status: the design record, and current.** Written before the code, then revised twice by
owner ruling while it was being built — the rarity ceiling now moves (§5.2) and every
modifier is a percentage rather than a multiplier (§4.1). This is the design the
implementation is measured against; `tools/memories.ts` asserts the load-bearing half of it
as properties. Read this before tuning a number in `src/data/memories.ts`.

The owner's brief, in substance: *an endgame beside raids, in the spirit of Path of
Exile's maps. The player augments them. They have rarities — a legendary one might carry
5× monster spawns, 3× elites, 2× drop rate, 3× rarity, and against that 5× enemy health,
2× enemy speed, everything Armored. A terminal that behaves like a Forge but for these.
Unlocked after finishing the Heaven and the Hell floors for a class. Monsters and bosses
are not new — they are drawn from every piece of content in the game. Rewards scale with
Challenger, as always.*

---

## 1. What a Memory is

Not a map. Not a device. `docs/game_story_worldbuilding.md` — the tiebreaker — already
wrote this system's fiction three separate times, and the name the owner reached for is
the doc's own word:

> Purgatory is shaped by **memory**. *(L115, on why the Citadel is made of dead
> civilizations)*

> **Memories began appearing as physical locations.** *(L291, on the First Rift)*

> The Reliquary is filled with thousands of years of supernatural memories. Those memories
> bleed together… The geography is fundamentally unstable… **The Reliquary does not
> remember itself the same way twice.** *(L1228–1260)*

So: every floor in this game is already Purgatory remembering a place, badly, once. A
**Memory** is what happens when you stop letting it improvise.

> A Memory is a recollection the Keepers pinned down: one place, held still, forced to
> come back the same way twice. Purgatory does not enjoy being held still. What it gives
> back is exactly what you asked for and exactly as much of a fight as that cost.

That single sentence is the whole system, and it is why every mechanical decision below
falls out for free:

- **Why the monsters come from everywhere.** Memories bleed together. A Memory of a Hell
  cathedral with the Reliquary's wildlife in it is not a bug in the fiction, it is the
  fiction. Nothing new has to be authored — the same call the Reliquary sectors made
  deliberately.
- **Why it is an altar and not a machine.** You are not building a place. You are making
  Purgatory *remember* one, on purpose, and it is a devotional act with a price.
- **Why the negatives exist at all.** A Memory that is richer than the war was is a Memory
  that got something wrong, and what it got wrong is standing in the room with you.
- **Why it is consumed.** Once it has been remembered out loud, it is not a Memory any
  more. It happened.

**The register**: dry, Keeper-procedural, never mystical. The Keepers catalogue this the
way they catalogue everything else.

---

## 2. The shape of a run

A Memory is **rift-shaped**: three floors, the last one a boss, exactly like an Avarice
Rift. `MODES.memory` is a real `RunMode` and `memoryConfig(instance, floor, challenger)`
builds a `RunConfig` the same way `riftConfig` / `planetConfig` / `towerConfig` do.

`MODES.memory` is **neutral on every mode axis**: `rarityBias` 0, `quantity` 1,
`coinMult`/`keyMult`/`gemMult`/`xpMult` 1, `dangerPerTier` 1. That is deliberate and it is
asserted: *an unmodified Memory at depth N is a Delve floor at depth N.* Everything that
makes a Memory different lives on the instance, not on the mode — which is exactly what
lets the "one curve" property below be stated as an equality rather than a bound.

There is **no tier ladder**. A rift tier is the game handing you a difficulty dial with a
fixed shape; a Memory is the player building one. Depth and modifiers *are* the ladder.

---

## 3. The Memory itself

A `MemoryInstance` is a rolled, mutable, consumable thing that lives in the account's
**Vault** (`GameState.memories`). It carries:

| field | what it is |
| --- | --- |
| `id` | a local id, so the Altar can address one |
| `rarity` | `common` … `mythic`. See §3.1. |
| `depth` | the effective depth of floor 1. Floors 2 and 3 add +1 each. |
| `placeId` | which place this is a memory *of* — see §6 |
| `bossId` | what is waiting on floor 3 — see §6 |
| `burdens` | what the Memory got wrong, as `{ id, grade }` — see §4 |
| `boons` | what it kept, as `{ id, grade }` — see §4 |

Nothing else. In particular there is **no stored profile, no stored reward table and no
stored difficulty**: every number a Memory produces is computed from this by
`memoryEffects()` at the moment `profileFor` asks, so retuning the vocabulary retunes
every Memory already sitting in the Vault. (The same two-lifetimes reasoning as
`docs/named-items.md`, resolved the other way on purpose: a Memory is consumed within
minutes of being made, so there is no case for freezing its numbers.)

### 3.1 The rarity ladder of the Memory

`common → uncommon → rare → epic → legendary → mythic`. Six of the eight, using the
existing `RARITIES` vocabulary so the colours, labels and sort order are free.

**Divine and unspoken are deliberately not Memory rarities.** They are the item ladder's
long tail and nothing else — `data/rarity.ts`'s "keep it absurd" rule and
`data/crafting.ts`'s mythic wall would both read as decorative if a second system started
minting the top two tiers on demand. (A mythic Memory can make divine and unspoken *items*
a little likelier to drop — that is §5.2's carve-out — but no Memory is ever itself one.)

Rarity buys **more modifier pairs, and higher grades of them**:

| rarity | pairs | max grade |
| --- | --- | --- |
| common | 1 | I |
| uncommon | 2 | I |
| rare | 2 | II |
| epic | 3 | II |
| legendary | 3 | III |
| mythic | 4 | III |

The owner's "a legendary map could have 5× spawns, 3× elites, 2× drop rate, 3× rarity /
5× health, 2× speed, all Armored" is a legendary-or-mythic Memory with grade III rolls —
read as *"a meaningful increase of each of these kinds"* rather than as literal factors,
per §4.1. Mythic is where the ceiling carve-out lives, and only there.

---

## 4. The modifier vocabulary: burdens and boons

Two lists on one Memory, as the owner described them — but with one invariant that makes
the whole system self-balancing and is asserted as a property:

> **`boons.length ≤ burdens.length`, always.** A Memory has no free positives. Every boon
> was bought with a burden, at roll time and at every op that adds one.

Rarity buys pairs; a pair is *one burden and one boon*. You never roll a reward you did
not pay for, which is why a mythic Memory can be extravagant without being a strictly
better Delve floor.

### 4.1 Every modifier is a percentage

Not a multiplier. The brief's "5× monster spawns, 3× rarity, 2× enemy speed" was shorthand
for *a meaningful increase of this kind*; the owner's ruling on seeing it built literally
was explicit:

> "Obviously we wouldn't do, like, 'it's 3x more frequent'. **Every modifier should be a
> percent increase**, not a three times, two times, etcetera."

So a modifier family stores the **percentage itself** (`pct`), and `1 + pct / 100` is
derived at the point of use (`pctMult`, the one conversion site). The number the player
reads and the number a tuner edits are the same number. Two families are honest exceptions,
declared as such on a `magnitude` field so they can't be mistaken for backsliding: `hunted`
is a flat **count** (a "+250% elite" is not a thing a floor can spawn — `data/daily.ts`'s
Elite Hunt is a flat +2 for the identical reason), and `armored`/`spiteful` name **affix
ids**, which have no magnitude at all.

### 4.2 Boons — what the Memory kept

Every boon moves a field `DepthProfile` **already has**, composed in `profileFor` exactly
where a Vigil's or a Convergence's modifier composes:

| id | name | grade I / II / III | field |
| --- | --- | --- | --- |
| `abundant` | Abundant | +25% / +45% / +70% | `quantity` |
| `gilded` | Gilded | +30% / +55% / +85% | `coinMultiplier` |
| `storied` | Storied | +20% / +35% / +55% | `xpMultiplier` |
| `luminous` | Luminous | +80% / +180% / +320% of `BASE_RARITY_BIAS` | `rarityBias` |

Four families, four maximum pairs: a mythic Memory can carry one of each and no
duplicates. That is not a coincidence, it is the cap.

`luminous` is a percentage **of the game's own base rarity bias** (0.06, now exported from
`data/rarity.ts` as `BASE_RARITY_BIAS` rather than being a literal in two files), which is
what lets a rarity lean be expressed in the same unit as everything else. Its grade III
deliberately *asks* for more than the ordinary cap allows — see §5.2 for who is permitted
to receive the difference.

**Boons deliberately do not touch the `rewardCurve` axes** (`dropChance`, `dropCount`,
`itemPower`, `variantChance`). Those are §16's, they are capped by `REWARD_CAPS`, and a
boon that added to one would be a second, uncapped route to a capped number. A Memory
climbs that curve the same way everything else does — by being genuinely more dangerous
(§5.3) — and never by declaring itself so.

### 4.3 Burdens — what it got wrong

| id | name | grade I / II / III | how |
| --- | --- | --- | --- |
| `merciless` | Merciless | +12% / +25% / +40% | `danger` |
| `obdurate` | Obdurate | +45% / +90% / +150% | enemy health |
| `teeming` | Teeming | +25% / +50% / +80% | bodies per wave, and max alive |
| `quickened` | Quickened | +10% / +20% / +32% | enemy speed |
| `unreadable` | Unreadable | −12% / −20% / −28% wind-up (and 60% of that off the swing gap) | reaction time |
| `hunted` | Hunted | +1 / +2 / +3 | elites the quota owes |
| `armored` | Armored | `stony` → +`vicious` → +`warded` | forced monster affixes |
| `spiteful` | Spiteful | `volatile` → +`miasmic` → +`vengeful` | forced monster affixes |

Eight families. Every one is a multiplier on a knob that already exists — the same rule
`data/daily.ts` states about itself: *nothing here adds behaviour to the simulation.*

`armored` and `spiteful` are the exception worth naming: they force ids from
`data/monster-affixes.ts` onto every wave monster, which needs one hook in
`Dungeon.makeEnemy` (the forced set is prepended to whatever `rollMonsterAffixes` produced,
de-duplicated). Bosses, boss-summoned chaff and split spawns are excluded exactly as they
already are. This is the only line of simulation code the whole feature adds, and the owner
asked for "all enemies Armored" by name.

`merciless` carries the gentlest percentages in the table on purpose: it is the only burden
that moves `danger`, so it compounds through enemy health, damage, speed, the crowd, the
elite budget and the reward curve all at once. At its worst it is still less danger than
four Abyssal Rift tiers, which is the band the curve is already calibrated for.

### 4.4 Why only `merciless` moves `danger`

Because `danger` multiplies enemy health *and* damage *and* crowd *and* the elite budget
*and* the reward curve, a burden that both multiplied its own field and raised `danger`
would be applying itself twice and calling it design. So: **`merciless` is the general
burden and it lives in `danger`; every other burden changes the floor's shape, not its
danger rating.** That is precisely the split `data/daily.ts` already shipped — Ferocious is
`danger`, Swarming and Hasty are shape — and it is why a Teeming Memory pays through the
Abundant it was rolled with rather than through §16.

---

## 5. How each hard constraint is satisfied

### 5.1 One difficulty curve

`memoryConfig` hands `profileFor` an effective depth and a `danger`, and that is all. There
is no memory curve. The property `tools/memories.ts` asserts is an **equality, not a
bound**:

> For every depth 1…60 and every Challenger tier, `profileFor(memoryConfig(...))` and
> `profileFor(delveConfig(...))` at the same effective depth agree on `enemyHealth`,
> `enemyDamage`, `enemySpeed`, `aggression`, `telegraph` and `recommendedLevel` — and a
> Merciless Memory agrees with *any* mode at the same depth and the same danger.

This is deliberately modelled on `npm run world`'s Tower check, which is the repo's
existing answer to "prove there is no second curve".

The shape burdens then multiply named `DepthProfile` fields, in the same expression as
`daily.*` and `weekly.*`. A Memory with no modifiers is **byte-identical** to a Delve floor
at its depth, which is the second asserted property and the one that guarantees adding this
moved no existing balance number.

### 5.2 The rarity ceiling — the one place in the game it moves

**Decision taken: (b), at the owner's direction, bounded and documented as an exception.**

The conservative reading — a Memory's rarity boon feeds the same capped sum and therefore
cannot lift the ceiling — was proposed, and the owner overturned it:

> "We do want the 3x rarity map modifier to lift the rarity ceiling. That's kind of the
> point. The real challenge when we do so is that the whole map gets ludicrously hard. So
> it's a high risk, high reward thing. You do at some point want the unspokens and stuff to
> be farmable. It's just a tradeoff. This is, like, endgame endgame content. It's not by
> much, but that little percent that it does raise the ceiling does make it worth it."

**This is a narrow carve-out, not a repeal.** `data/rewards.ts`'s rule stands everywhere
else: rarity is not an axis of `rewardCurve`, `challengerRarityBias` still caps by design,
and crafting still stops at mythic. The Delve, the Tower, every rift, the Challenger dial
and the whole forge are untouched. **Only Memories, only at mythic, only in proportion to
difficulty, and only slightly.**

The mechanism is unchanged from the conservative version — `luminous` adds into the same
composed `rarityBias` sum in `profileFor`:

```
rarityBias = BASE_RARITY_BIAS + mode.rarityBias + challengerRarityBias(tier)
           + daily.rarityBias + weekly.rarityBias + memory.rarityBias
```

It is not a multiplier, not a new `rewardCurve` axis, and not keyed on `danger`, so it is
structurally incapable of scaling the Challenger dial's own capped term. What changed is
the **ceiling on `memory.rarityBias`**, and three things keep it bounded:

1. **Ordinary Memories cannot reach it.** Everything below mythic is clamped to
   `MEMORY_RARITY_CAP` (0.12), which is *below* `MODES.abyss.rarityBias` (0.16). The mode
   that exists to pay in rarity is still the best ordinary place to farm it.
2. **The lift is paid for in difficulty.** Only a mythic Memory may overshoot, and only in
   proportion to the **square** of its burden load — a mythic carrying half its burdens
   receives a quarter of `MEMORY_CEILING_OVERSHOOT`. An unburdened mythic gets nothing at
   all. The ceiling is not for sale; the squaring is what stops the interesting half of the
   owner's trade being bought at a discount.
3. **The overshoot is small, and stated.** `MEMORY_RARITY_CAP + MEMORY_CEILING_OVERSHOOT`
   puts the very best Memory `MEMORY_CEILING_MARGIN` (0.02) past the Abyss — asserted as a
   comparison against `MODES.abyss.rarityBias` rather than as a bare number, so retuning
   the Abyss retunes this with it.

**What that is worth, measured.** At depth 45 with the Challenger rarity bias at its cap,
unspoken goes from roughly **1 in 48** on an Abyssal Rift floor to roughly **1 in 43** on
the best Memory anyone will ever roll — about **11% better odds**. An ordinary floor at the
same depth is 1 in 3,879. That is the owner's "not by much, but that little percent"
expressed as a number, and `tools/memories.ts` asserts all three of those claims: strictly
better than the Abyss, less than 1.5× better, and still rarer than 1 in 30 — so unspoken
stays an event rather than a shopping list.

### 5.3 §16, and why a Memory's danger *does* pay

`profileFor` divides the Vigil's and the Convergence's own modifier danger back out before
asking `rewardCurve`, because §17 says the day's weather must not be a second payer.

**A Memory's danger is not divided out**, and that distinction is the point:

> The Vigil's difficulty is the weather. A Memory's difficulty is a decision the player
> made at an altar and paid materials for. §16 is about paying for difficulty you *chose*
> — a rift tier, the Challenger dial, a sector tier — and a Memory is the most chosen
> difficulty in the game.

So a `merciless` Memory climbs `rewardCurve` for free, on all four of its axes, capped by
`REWARD_CAPS` like everything else. Asserted as a comparison: a Merciless-III Memory's
`quantity` and `itemPower` are strictly greater than the same Memory with no Merciless,
and a Vigil's Ferocious day's are not.

### 5.4 Challenger

Free, and **verified rather than assumed**: `memoryConfig` multiplies
`challengerMultiplier(tier)` into `danger` exactly as `riftConfig` does, so the dial reaches
enemy stats, the elite budget, `rewardCurve` and `challengerRewardMult`'s coin term. The
tool asserts every payout axis is strictly monotonic in the Challenger tier for a fixed
Memory — a comparison across tiers, not a bound on one.

### 5.5 Purity

`src/data/memories.ts` is pure data and pure functions: no DOM, no `GameState`, no dice
beyond an `Rng` it is handed. The Vault lives on `GameState`; the Altar's screen is DOM in
`TownUI`; the station is a `Hub` station. The one simulation change is the forced-affix
hook in §4.2.

### 5.6 Previews

The Altar renders `previewForRun(memoryConfig(instance, 1))` like every other commit
screen, and **holds no table**. Two small reads are added to `data/previews.ts`:
`floorsOf` learns that a Memory is three floors of `memoryConfig` (so the preview walks
the run the player is actually buying), and `otherRewards` reads `memoryEffects(instance)`
— the *same function* `profileFor` folds in — to say what the Memory's own boons do. The
tool pins that as a property: the preview's stated multipliers equal
`profileFor(...).quantity` / `.coinMultiplier` / `.rarityBias` exactly.

---

## 6. Where the monsters and bosses come from

The owner: *"not unique but rather randomly from every piece of content available in the
game."* The fiction says the same thing — memories bleed together.

**The place** (`placeId`) is rolled from every `BiomeStyle` the game owns: the six Delve
biomes, the three Tower bands, and every Reliquary sector's biome. A place brings its
palette, its props, its layouts, its traps, its elemental affinity and its roster names —
so a Memory of the Seamless Halls has Thrones and Dominions in it, and one of a Delve
circle does not. `biomeForRun` gains one branch; nothing else changes, because renaming
the roster per place is a trick `PlanetSpec.enemyNames` and the Tower bands already do.

**The encounter** (`bossId`) is rolled from every authored encounter: the five `BOSSES`,
the six sector bosses, and the Tower's five. `bossSpecForRun` gains one branch.

Two exclusions, both deliberate:

- **The Proving is not in the pool.** `legend-<class>` is a specific character's final
  exam and its identity is the whole point (`docs/class-completion.md`).
- **Raids are not in the pool** (UAT §15, landing in parallel). A raid is an event you
  travel to, its table is addressed by the raid rather than by its boss id, and a raid
  encounter standing in a Memory would be the fight without the table — the worst of both.
  If the owner wants raid encounters in high-rarity Memories later, that is a table
  decision, not a spawn decision, and it should be made with the raid table in view.

**A Memory's boss id is rewritten to `memory-<templateId>`**, exactly as a raid rewrites
to `raid-<id>` and the Proving to `legend-<class>`. This is load-bearing: without it, a
Memory that rolled the Htrae sector's boss would pay out that sector's exclusive named
items outside the sector, and every `boss`-addressed source in `data/drops.ts` would
quietly leak. With it, a Memory pays what a deep floor pays — the generic `worldDrop` and
`clearCache` sources at its depth — and nothing that belongs to somewhere else.

---

## 7. The Altar

### 7.1 Where it is

The owner asked for "a terminal/altar in another room of the lobby". **The hub is a single
scene today** — `HUB_WIDTH`×`HUB_HEIGHT` of Citadel deck, with every station coordinate
tuned by hand against one painted PixelLab image (`render/atlas/scenes/hub.citadel-deck`).
A second room means a second painted scene plus scene-switching in `Hub`, `render/hub.ts`
and `main.ts`, and no art for it exists.

**The cheapest honest reading, and what ships:** the Altar is a station on the existing
deck, in the idiom every other system uses — a terminal that configures a run and spawns
its portal, precisely the Reliquary Gate's shape. Two station kinds, `altar` and
`memoryPortal`.

The "another room" reading stays available and is about to get cheaper: a **tile-based
refactor of the Citadel hub** is on the docket, bringing the deck onto the same 32-unit
lattice and stamped-tileset standard the dungeons and rifts already use and replacing
today's hand-tuned coordinates — explicitly because moving things around the lobby is
painful. Once that lands, a real second room is a follow-up that **moves this station**,
not a redesign of this system. Building scene-switching now, against art that does not
exist, would be the tail wagging the dog.

**Position is unverified by eye.** No session on this machine has a browser; the owner
must look at where the station lands.

### 7.2 The unlock

Per the owner: *"after completing all the heaven and hell floors for a class (or at least
at a fixed point, say floor 30 for each)."*

> **The active character** must have banked **depth 30** and **height 30**:
> `player.deepestDepth >= 30 && player.highestHeight >= 30`.

- **Per class, not per account** — the brief says "for a class", and it makes the Altar the
  thing a *finished character* earns rather than something an alt inherits. This is the
  opposite call from the universal tree's account-wide pool, on purpose: the tree is what
  the account earned, and this is what this character did.
- **Both ladders, read from their own records.** `Player.deepestDepth` and
  `Player.highestHeight` are separate on purpose and `Player.frontier` is deliberately
  *not* used here — the frontier is a max, so a height-40 character with no descent would
  clear a frontier gate having never seen Hell. Reading both records separately is what
  makes "the Heaven and the Hell floors" mean what it says.
- **Nothing new is written.** No new unlock flag, no new record. `recordDepth`'s dispatch
  to `recordHeight` is untouched, and no height is ever written into a depth field.
- 30 is the same number `DELVE_BOTTOM` already uses, and the same number the Tower's
  authored bands end around. The constants are `MEMORY_UNLOCK_DEPTH` /
  `MEMORY_UNLOCK_HEIGHT` so the owner can overturn them in one place.

### 7.3 The screens

One station, three screens, cycled the way the Forge's three are:

**Vault** — every Memory you hold, newest first. For the selected one: its place, its
depth, its boss, its two lists, and the §20 drop preview for the run. Confirm sets it as
the Altar's plan and spawns the Memory Portal on the deck; walking into that portal is
what starts the run.

**Recall** — make a new one. Choose a **rarity** and pay for it; everything else is
rolled. That is the owner's "completely customize these (partially random)" read exactly
the way the Forge's Craft screen already reads it: you buy the tier, the dice buy the
character.

**Workbench** — five ops on a Memory you already hold. All of them **roll**; none of them
let you pick a modifier, which is the workbench rule §26 already established and the thing
that stops a Memory from becoming a spreadsheet:

| op | what it does | costs |
| --- | --- | --- |
| **Distort** | Reroll every burden and boon at the same rarity. | Ash, coins |
| **Etch** | Add one pair, up to what the rarity allows. Never past it. | Ash, coins, scrap |
| **Deepen** | +2 depth. The Memory gets older and less forgiving. | Ash, coins |
| **Crystallise** | One rarity up, keeping the modifiers. Stops at mythic. Consumes two Memories of the current rarity. | Ash, coins, scrap, 2 components |
| **Forget** | Destroy it for Ash. | — |

Costs reuse the Forge's own scales rather than inventing a curve: Ash doubles per rarity
tier off a per-op base, coins are a multiple of `reforgeCoinCost`, scrap is
`craftBulkCost`. Three asserted comparisons, in the idiom `tools/forge.ts` established:

1. Forgetting one Memory never pays for distorting a peer of the same rarity.
2. Crystallising up to a rarity costs strictly more, all in, than recalling one fresh at
   that rarity — you pay a premium to *keep* modifiers you like, so both paths stay alive.
3. A mythic Memory costs strictly more than a legendary one on every currency.

**Ash is still the one crafting currency** (§27). The Altar adds no currency: making costs
materials and coins, shaping costs Ash, exactly as the Forge does.

**Clicking a Memory card selects it; it does not run the op** (docket §18). The Vault's
rows carry `data-altar-item` rather than the generic `data-index`, whose handler both moves
the cursor and calls `primary()` — which on the workbench spends Ash, and on `forget`
destroys the Memory outright. A Memory card is precisely the thing you click to *read* its
boons and burdens, which is what makes this the same defect the owner already reported on
the Forge. Executing is the action strip below the list: `TownUI.renderActionBar`, the same
control the Forge uses, not a copy of it. The Recall screen deliberately keeps `data-index`
— its rows are rarity tiers, and there click-to-fire is the whole intent.

**`Forget` takes two presses**, the same gate salvaging what you're wearing already had.
Everything else on the bench rolls; `forget` destroys the Memory and hands back Ash, and
nothing undoes it. The first confirm arms it (`TownUI.forgetArmed`, holding the Memory's
id) and says what it would destroy; a second confirm on the same Memory runs it. Any
navigation drops the arm — changing screen, op or selection, walking the list, or leaving
the tab — through `TownUI.disarm()`, which clears this and `salvageArmed` together so a
site doesn't have to remember which gates exist. **Red is a colour, not a confirmation**:
docket §18 was raised because a stray click destroyed something, and shipping the
select/execute split while leaving one button that consumes a Memory on a single
unconfirmed press answers that report halfway. This is a design call the owner made, not
part of the original §18 fix.

`GameState.memoryOpBlocker` says why an op can't run, and the strip greys itself out from
it. It was **extracted rather than reimplemented in the UI**: `applyMemoryOp` consults it as
its first act, so the button and the op refuse for identical reasons by construction.
`tools/memories.ts` asserts that equivalence in both directions and records how to falsify
it — note that tightening the blocker leaves the check green, because that direction is
impossible rather than untested; the two live injections are cutting the consult out of
`applyMemoryOp`, and adding a refusal inside it the blocker knows nothing about.

### 7.4 Acquisition, and consumption

Memories are **made, not found**. There is no `data/drops.ts` entry and no third registry
— acquisition lives entirely at the Altar, which is what "a terminal that behaves like a
Forge" means and what keeps the drop table one table.

A Memory is **consumed when the run actually begins** — when you walk into the Memory
Portal, not when you pick it at the Altar. (Picking is a plan, like the Reliquary Gate's;
plans do not survive a reload, and losing a Memory to a page refresh would be a bad joke.)

Dying in a Memory does not give it back. Bailing out early does not give it back. That is
the whole risk: the Memory *was* the resource, and you spent it.

### 7.5 Solo, in v1

Same call the Vigil, the Proving and raids all made, for the same reason: the party half
is host-authoritative, and every mode that crosses the wire is a new way for two saves to
disagree. A Memory lives in one account's Vault, so "whose Memory was spent" is a question
with no good answer yet. The seam is left open rather than closed — a Memory is a
`RunConfig` like any other — but nothing offers one in a room.

---

## 8. Save

`GameState.memories: MemoryInstance[]`, account-wide like the stash, the relics and the
wardrobe, capped at `MEMORY_VAULT_CAP` so a save can't grow without bound.
`SAVE_VERSION` bumps; loading an older save fills in an empty Vault. Nothing else about the
save's shape moves, and `playerToJSON` — which is both the character sheet and the co-op
wire payload — is **not** touched, because a Memory is account state, not a character
sheet.

---

## 9. What is deliberately not built

- **No second hub room** (§7.1) — the art doesn't exist.
- **No new monsters, bosses, biomes or abilities.** Reskinning and recomposition only, the
  same call the Reliquary sectors made deliberately to avoid a second content pipeline.
- **No raid or Proving encounters in the pool** (§6).
- **No co-op** (§7.5).
- **No Memory drops.** If the owner later wants Memories to drop as loot rather than only
  be made, that is a `data/drops.ts` entry and a `MemoryInstance` roll — the roll function
  is already written and pure, so it costs one source and one roll site.
- **The rarity ceiling stays where it is everywhere else.** §5.2 is the game's one
  exception and it is scoped, squared and bounded. `CLAUDE.md` and `src/data/rewards.ts`
  still state the general rule and still govern the Delve, the Tower, the rifts, the
  Challenger dial and the whole forge; they need one sentence added naming this carve-out
  so the two documents agree, and that edit belongs with whoever owns `CLAUDE.md`.
- **No Challenger row on the Altar's screens.** A Challenger picker landed on four of the
  commit ladders (Dive, Tower, Rifts, Star Map) while this was being built;
  `challengerRowIndex` deliberately excludes the Raid tab, with a note that giving it one
  is a change to `rowCount`, `challengerRowIndex` and `primary()` rather than a merge
  resolution. The Altar follows that precedent rather than inventing a fifth pattern. The
  dial still applies in full — `memoryConfig` folds `challengerMultiplier` into `danger`
  exactly as every other mode does, and `tools/memories.ts` asserts it reaches every
  payout axis — it is only set from Settings for now, the same as a raid, a Vigil or a
  Convergence.
- **No Memory-exclusive named items.** The obvious next step and a genuinely good one, but
  it is a drop-table decision that wants the owner's eye on which items become
  Altar-locked, so it is left as a clean seam rather than guessed at.
