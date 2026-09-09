# Augments — the chest overhaul, and the one thing you aim

**Status: the design record, and current.** Written before the code, then ruled on twice
while it was being built (§3, §5.3). One question is still open with the owner and is
written as a choice rather than a decision — §5.3, the rarity ceiling — but nothing in the
implementation waits on it. This is the design the implementation is measured against;
`tools/augments.ts` asserts the load-bearing half of it as comparisons. Read this before
tuning a number in `src/data/augments.ts`.

The owner's brief, close to verbatim:

> Overhaul chests — maybe we remove elemental chests / weapon-specific chests, replace
> with class/capstone chests. And create a farmable currency or some kind of modifier to
> the chests. Some kind of augment maybe? Maybe these should drop exclusively from Avarice
> Rifts and be part of the reward for Vigil/Convergence — "bow augment", "legendary rarity
> augment", "storm augment". You should be able to stack them to modify the output even
> better, so that combination would result in a Legendary Storm element Bow. These augments
> should be very rare. The Augment view itself should have its own tab in the chests, and
> the default should always start as a basic chest. Unspoken Augments would be like the
> holy grail of this game. We as players should be thinking "holy fucking shit I just got
> an unspoken augment, I'm going to combine this with my bow augment, void augment, and
> crit rate augment to guarantee an insane endgame bow."

**That last sentence is the design target.** The system succeeds if finding one is an
event and combining them feels like authoring a specific item. It fails if augments become
a currency you accumulate and spend routinely. Every decision below is measured against
those two sentences and nothing else.

---

## 1. What an augment is

### 1.1 The fiction

`docs/game_story_worldbuilding.md` — the tiebreaker — already wrote this, in the section
that names the exact place the owner wants them to drop:

> When lesser celestial and demonic forces battle, enormous quantities of material are left
> behind. Weapons. Gold. Soul fragments. Divine materials. Demonic artifacts. **Fragments of
> greater beings.** Creatures swarm toward these battlefields to consume and hoard
> everything left behind. The Keepers call these locations **Avarice Rifts**. *(L349–367)*

An augment is one of those fragments. Not a currency, not a rune, not a device: **a piece
of something that was already made, still holding the shape it was made in.** A chest is a
Keeper requisition — Purgatory told to produce matter to order, badly. Drop a fragment of a
bow into the requisition and Purgatory produces a bow, because it has been given something
to copy rather than something to invent.

> A fragment remembers what it used to be more clearly than Purgatory remembers anything.
> Requisition around one and you get back the shape it kept. The Keepers consider this
> unremarkable and file it under recovered materiel.

The register is the usual one: dry, procedural, the Keepers logging a miracle as inventory.
**The player-facing word stays "Augment"** — the owner reached for it four times and it is
the clearer word for what the thing does. The fiction is what it *is*.

This also settles why they come from Avarice Rifts and nowhere else: an Avarice Rift is
literally defined as the place where the leftovers of made things pile up. The Vigil and
the Convergence pay one out because a Keeper-scheduled operation gets first pick of what
was recovered.

### 1.2 The data

An augment constrains **one axis of a chest pull**. There are four axes and there will
never be a fifth without an owner ruling, because four is exactly the number of decisions
`rollItem` and its callers already make:

| Axis | What it decides | The knob it drives | Precedent |
| --- | --- | --- | --- |
| `rarity` | how good | the weight mask multiplied into `BASE_RARITY_WEIGHTS` | `CHESTS.Legendary.weights` |
| `form` | what it is | `ItemType` handed to `rollItem` | `ChestTierInfo.types` |
| `element` | what it does | `RollOptions.favorElement` | crafting essences |
| `affix` | what it carries | one reserved pick in `rollMods` | new, and the only new mechanism |

```ts
export type AugmentAxis = "rarity" | "form" | "element" | "affix";

export interface AugmentDef {
  readonly id: AugmentId;
  readonly name: string;
  readonly blurb: string;
  /**
   * The augment's own place on the eight-rarity ladder. ONE number, and it says three
   * things: what colour it draws, how it sorts, and how rare it is to find
   * (`AUGMENT_GRADE_WEIGHTS`). Adding an augment is one row, never a second table.
   */
  readonly grade: Rarity;
  readonly effect:
    | { readonly axis: "rarity"; readonly weights: Record<Rarity, number> }
    | { readonly axis: "form"; readonly type: ItemType }
    | { readonly axis: "element"; readonly element: Element }
    | { readonly axis: "affix"; readonly modId: string; readonly minRarity: Rarity };
  /** Read by `drops.ts`, same as a named item's or a relic's. No parallel drop system. */
  readonly sources: readonly DropSource[];
}
```

Three things about that shape are load-bearing:

- **`grade` is the only scarcity number.** `AUGMENT_GRADE_WEIGHTS: Record<Rarity, number>`
  turns it into a drop weight in one place. There is no per-definition drop rate to drift.
- **`effect` is a discriminated union on the axis**, so the compiler already knows a form
  augment has no element and an element augment has no rarity mask. The one-per-axis rule
  in §2 is then enforced by the *shape of the loadout*, not by a validator.
- **A rarity augment is a weight mask, not a rarity.** It is multiplied into the chest's
  own weights exactly the way `CHESTS[tier].weights` already is. `BASE_RARITY_WEIGHTS`
  stays the single point every source of items reads through — this system multiplies into
  it and never forks it.

### 1.3 The roster

44 definitions, almost all of them generated from registries that already exist, the way
`WEAPON_CACHE_INFO` already generates fourteen chests from `WEAPON_FAMILIES`.

- **6 rarity augments** — Rare, Epic, Legendary, Mythic, Divine, Unspoken. Grade equals the
  rarity they name. The ladder, and the thing §5.3 is about.
- **19 form augments** — one per `ItemType`: the 14 weapon families plus armor, shield,
  ring, gloves, necklace. Grades: `rare` for weapon families, `uncommon` for the rest,
  because a specific ring is a smaller ask than a specific scythe.
  **These replace the 19 chests §3 deletes, one for one.** That symmetry is not a
  coincidence and it is the argument for the whole overhaul: the chest could promise you a
  bow *or* an element, and an augment can promise you both.
- **9 element augments** — one per `Element`. Grade `epic` for the five `LOOT_ELEMENTS`,
  `legendary` for holy, arcane and nature, which are deliberately kept out of every random
  roll and are reachable today only through a crafting essence. An augment is their second
  route and it stays a rare one.
- **10 affix augments** — a curated list of the affixes players actually chase (crit
  chance, crit damage, attack speed, cooldown, move speed, leech, projectiles, area,
  max health, and the extra-ultimate-bounce roll). Grades `epic` to `mythic` by how gated
  the underlying `ModRoll` already is. Curated, not generated: an augment for `+12 defense`
  is noise, and 40 augments make the tab unreadable.

The acceptance tool asserts every `form` names a real `ItemType`, every `element` a real
`Element`, and every `affix` a real `ModRoll` id — the same "every reference resolves" pass
`npm run named` and `npm run relics` already run.

---

## 2. The loadout: how stacking composes, and why conflict cannot happen

A pull is **one base chest plus up to four augments, at most one per axis.**

```ts
export interface AugmentLoadout {
  readonly base: ChestTier;         // defaults to "Basic", always
  readonly rarity: AugmentId | null;
  readonly form: AugmentId | null;
  readonly element: AugmentId | null;
  readonly affix: AugmentId | null;
}
```

**Conflict resolution is not a rule, it is the absence of a place to put the conflict.**
The loadout has one element slot; two element augments cannot both be in it. Slotting a
second one replaces the first and hands the first back — it is a swap, not an error, and
there is no message to write. This is the single most important structural decision in the
design: every "what if the player stacks two X" question answers itself, and the roll site
never has to arbitrate.

Composition is one pure function, and **it is the only place any of this is decided**:

```ts
export function augmentedPull(load: AugmentLoadout): {
  weights: Record<Rarity, number>;
  types: readonly ItemType[] | undefined;
  favorElement: Element | undefined;
  ensureMod: string | undefined;
};
```

- `weights` = `BASE_RARITY_WEIGHTS` × `CHESTS[base].weights` × the rarity augment's mask
  (or ones). Multiplication, so a Legendary chest under a Mythic Augment is still the
  Legendary chest's curve above the floor — the two compose instead of one overriding.
- `types` = the form augment's single type, else the base chest's `types`, else undefined.
- `favorElement` = the element augment's element, else the base chest's `favorElement`.
- `ensureMod` = the affix augment's `modId`, else undefined.

`openChests` calls it. The §20 preview in the augment tab calls it. **Nothing else computes
a pull**, which is what makes the preview incapable of drifting: it is not describing the
roll, it is running the roll's own composition and then not throwing dice.

### 2.1 The one new mechanism

`rollMods` today takes `favorElement` and *weights* the pool by stuffing extra copies into
it — the deliberate precedent that a craft's essence "shows up" without the item leaving the
path every dropped item takes. An affix augment needs something slightly stronger, because
"your crit augment probably worked" is not a promise anyone would spend the rarest object in
the game on.

So `rollMods` gains `ensureMod?: string`: **if the roll is allowed on this type at this
rarity tier, it is taken as the first pick, and the remaining slots fill normally.** That is
four lines and it changes nothing for any existing caller. It is a forcing, not a weighting,
and it is the one place this design chooses forcing — justified because the augment names
exactly one affix out of a list of many, and the item is still rolled by `rollItem` end to
end.

`AugmentDef.effect.minRarity` is what keeps this honest: the affix augment for
`+1 projectile` carries `minRarity: "epic"` because `ModRoll.minTier` says that roll does
not exist below epic. **The tab refuses the combine when the loadout's rarity floor cannot
carry the affix** — a refusal with a printed reason, at authoring time, rather than a
silent no-op at roll time. That is the same call §2 made about conflicts: make the bad state
unreachable rather than handled.

---

## 3. What the chests become

28 tiers → 10. `CHEST_TIERS` is a `const` tuple that `Record<ChestTier, …>` is keyed on in
four places, so this is a compiler-checked deletion, not a search.

**Removed (19).** The 14 single-weapon caches and the 5 elemental caches. They are removed
because an augment does their job strictly better and composably: a Storm Cache promises an
element, a Bow Cache promises a family, and neither can promise both. Nineteen chests
collapse into nineteen form and element augments that stack.

**Kept (9).**

- **Basic, Advanced, Elite, Legendary** — untouched, prices and per-rarity multipliers
  included. They are carried over verbatim from the Python original and CLAUDE.md says not
  to casually change them; nothing here needs to.
- **Weapon Cache, Armor Case, Trinket Box** — kept deliberately. They are the coin-only
  path, and **a player who owns no augments still has to have a shop.** The whole system
  above them is found, not bought; these three are the floor under it.
- **Adept's Trove, Collector's Hoard** — the capstones, unchanged. Also the Convergence's
  guaranteed payout, so removing them would break `data/weekly.ts`.

**Added (1) — the Legend's Cache**, the class chest the brief asks for. `classAdaptive`
like the Adept's Trove, but one step further: it rolls the active class's affinity family
*and* biases the affix roll toward that class's own element. Elite-grade odds, priced
between the Elite chest and the Trove.

**Ruled: one adaptive chest, not twenty-one.** The brief's "class/capstone chests" could
have meant one chest per class. It does not, and the reason is worth keeping: twenty-one
near-identical definitions differing only in which class they bias toward is content in the
sense of a spreadsheet, not in the sense of a decision. Nobody browsing a shop of
twenty-one rows is choosing; they are scrolling past twenty things. It is also how the rest
of the codebase already handles this shape — a `RunMode` does not get twenty-one copies
either — and an alt can use the adaptive one on the day it is created.

### 3.1 Migration — `SAVE_VERSION` 26

A v25 save holds keys and lifetime counts for nineteen tiers that will not exist. The rule
is **migrate, never crash, never lose value**:

- **Keys for a removed tier are refunded as coins at that tier's full purchase price.** Not
  converted at a ratio into a surviving tier — a ratio is arithmetic nobody can check and it
  loses value at the edges. Coins are exact, and the player re-buys whatever they want.
- **`stats.chestsOpened` for a removed tier is summed into the surviving tier that shared
  its odds grade** (every removed chest used `SPECIALIST_WEIGHTS`, so: into `Advanced`).
  Lifetime totals are a record; they must not silently shrink.
- **An unknown chest tier id in a save is dropped rather than throwing** — the rule
  `normalizeAppearance` already set for cosmetics, applied to `keys` and `chestsOpened`.
- **`GameState.augments: Record<AugmentId, number>`** is new, account-wide (like the stash,
  coins and relics — not per-class, because a fragment does not care who requisitions with
  it). Absent in an old save → empty.

**`SAVE_VERSION` will be 26 unless lootsim-56's badge work lands first — it is also queued
for 26.** Whoever merges second takes 27. Flagged to lootsim-21 rather than assumed.

---

## 4. Where they come from

Augments are a third registry carrying `sources: readonly DropSource[]`, read through
`src/data/drops.ts` exactly as named items and relics are. **No new `FoundSource` kind is
needed** — "the cache that closes an Avarice Rift at tier 5 or better" is already sayable as
`{ kind: "clearCache", mode: "hoard", lastFloor: true, minTier: 5 }`, and `sourceMatches`
already decides it. That is the whole point of the shared table.

### 4.1 One new roll helper, and why

`rollTable` rolls **every** matching definition independently — correct for named items and
relics, where each entry is its own distinct chase and two can drop at once. It is wrong
here: 19 form augments each rolling independently would drop four augments a clear.

So `drops.ts` gains `rollOne(defs, q, rng, danger, rate)`: **one roll for "did an augment
drop", then a weighted pick of which.** The distinction is real and worth naming in the
file — *a table whose entries are distinct chases rolls per entry; a table whose entries are
interchangeable rolls once and picks.* `forSource` is untouched, so the §20 preview reads
the same matcher it always did.

Grade weights (`AUGMENT_GRADE_WEIGHTS`) decide which grade the pick lands on; within a
grade the pick is uniform across everything the query matched.

### 4.2 The taps

Avarice Rifts, the Vigil and the Convergence. Nowhere else — the brief's "exclusively",
taken literally, and it hands the Avarice Rift the identity it has been missing. It is
currently the volume rift you farm for gems and sell-fodder; it becomes **the only place
the game's rarest objects come from**, which is exactly what the worldbuilding says an
Avarice Rift is.

| Source | Rate | Notes |
| --- | --- | --- |
| Avarice, floors 1–3 clear cache | low | keeps the run paying, mostly uncommon/rare grades |
| Avarice, boss cache (`lastFloor`) | the main tap | the reason to finish the rift rather than extract |
| Vigil, on a banked clear | **guaranteed, one** | grade rides the day's seed, capped at `epic` |
| Convergence, boss floor bank | **guaranteed, one** | capped at `legendary`, alongside the two chests |

Top grades are gated with `minTier`, the §16 idiom raids already use — **tier 8 drops what
tier 1 cannot, rather than a better roll of it**:

- `divine` grade: Avarice tier 5+
- `unspoken` grade: Avarice tier 8+

**Those gates are not flavour; they are what makes §7's comparison survivable.** A shallow
Avarice cache almost never drops a divine item, so an ungated divine augment would be
*commoner than the thing it guarantees* down there — the exact inversion the whole system
must not have. The gates put each grade's first appearance at a tier where the item it
guarantees is already plausible. The acceptance tool asserts the gates by measuring what
tier 1 pays, not by reading the constants.

**One dial.** `AUGMENT_GRADE_RATE` in `src/data/augments.ts` is a single named constant per
grade — the chance an Avarice boss cache pays an augment of that grade — and it is the whole
economy. A definition's own chance is its grade's rate split evenly among the definitions at
that grade, so growing the weapon roster splits the rare share instead of quietly making
every other rare augment rarer. `rollOne` reads those numbers straight off the table; there
is no parallel event rate, no share and no denominator to re-derive. **Retuning the economy
is one edit per grade and nothing else moves.**

The shipped numbers are the design's original baseline **halved** — the owner's literal
price, "2x harder to get dropped from the avarice rifts because they guarantee it".

**Measured** (`tools/augments.ts` computes these; recorded here for the argument, not
depended on):

| Grade | First tier | Augment / boss cache | The item it guarantees | At the first tier |
| --- | --- | --- | --- | --- |
| divine | 5 | 1 in 419 | 1 in 1,755 | **4.19× cheaper** |
| unspoken | 8 | 1 in 1,700 | 1 in 1,749 | **1.03× cheaper** |

So the discount is real but small, and it is concentrated in *divine* rather than in
unspoken — which is close to parity at its first tier and becomes strictly dearer than
chance by tier 12. The discount also **shrinks as the ladder climbs** (by tier 20 an
unspoken augment is 3.5× dearer than just seeing an unspoken drop), because the cache's own
rarity bias rises faster than `dropChance` does. That is why the binding case is always a
grade's *first* tier, and why the acceptance tool checks it hardest there.

**An earlier draft was ten times rarer than this**, because it was tuned to a derived rule —
"the expected cost of reaching the ceiling must never fall at all" — rather than to the
price the owner set. That rule was stronger than anything the owner said. When a derived
constraint and an explicit instruction disagree, the instruction wins. What survives is a
bound on the *size* of the discount rather than a denial that there is one: see §7.

Augments drop as **physical pickups in the cache, lost on death and on bail-out**, exactly
like relics. They are the reward for finishing, and never make death free.

### 4.3 The wire

Augments are account-wide and never enter the simulation as anything but a pickup, so the
co-op wire gains **nothing but what a relic pickup already carries** — `HeroLoot.augments`
alongside `HeroLoot.relics`, banked per-hero into each player's own save on their own
machine, the same as every other physical drop. `playerToJSON` is untouched: augments live
on `GameState`, not `Player`.

---

## 5. The rarity ladder, and the ceiling

### 5.1 A rarity augment is a floor, not a value

"Legendary Augment" means **nothing below legendary comes out of this chest** — a weight
mask that zeroes the rungs beneath it, which is mechanically identical to what
`CHESTS.Legendary.weights` already does. It does not cap the top: a Legendary Augment can
still produce a mythic, because the mask above the floor is the chest's own curve.

This is why the ladder is six entries and not eight. There is no Common Augment and no
Uncommon Augment; a floor of common is what a Basic chest already is.

### 5.2 The default is a Basic chest, and that is a rule

The owner asked for it and it is load-bearing, so it is written down as a rule rather than a
default: **augments never require an expensive chest.** A Basic key (100 coins) plus an
Unspoken Augment is a fully intended, fully supported play, and the augment tab opens with
`base: "Basic"` every single time.

The reason is that the augments are the value. If the top loadout demanded a Legendary key
the system would quietly become a coin sink wearing a chase-item's clothes, and the moment
the brief is built around — *"holy fucking shit I just got an unspoken augment"* — would
arrive with a shopping trip attached to it.

### 5.3 What the Unspoken Augment does — **ruled: it guarantees**

This was escalated rather than decided, because it sets a precedent about the top of the
rarity ladder. The owner ruled:

> "Yes the unspoken augment would be a guaranteed unspoken, same for the bow augment would
> be a guaranteed bow, etc. But they should be 2x harder to get dropped from the avarice
> rifts because they guarantee it. It adds this fun 'crafting' element."

So **every axis guarantees**, and the drop rate pays for it. Three consequences, all built:

1. **The rarity ladder is six pure floors**, `rare` through `unspoken`. An Unspoken
   Augment leaves exactly one rung standing. A floor still never *caps*: a Legendary
   Augment can produce a mythic, because the mask above the floor is the chest's own curve.
2. **`AUGMENT_RATES` is literally halved.** The owner's reason was causal — *because they
   guarantee it* — and every augment guarantees its axis, so every augment pays, not just
   the top of the ladder. This is deliberately the one place the standing "a multiplier in
   a brief means a meaningful increase, never a literal factor" rule does **not** apply:
   that rule is about gameplay modifiers on content, where a literal 5× is unbalanceable.
   This is the drop rate of an object, where a factor is the right unit and is checkable.
3. **An element augment now guarantees too**, not just weights. `favorElement` still
   biases the rest of the affix roll, but one of the element's two rolls is reserved. Which
   of the two — `dmg-` on an offensive slot, `res-` on a defensive one — is decided by
   `modAllowed`, not authored.

**What the player mostly buys is agency; the discount is small and bounded.** That is the
justification, and the sentence meant to stop the next person widening this. The owner
granted a discount deliberately — it is consistent with their standing position that
unspokens should become farmable at the very top end, *"not by much, but that little
percent"* — and §7 bounds its size rather than pretending it is zero. The main thing that
changes is that the ceiling, when you reach it, arrives as the bow you wanted rather than
gloves for a class you do not play. That is the "fun crafting element" the brief named.

**The rule that replaced the retired one: a rarity augment must be a pure floor — a suffix
of the ladder, all at weight 1.** The owner retired "nothing may guarantee past mythic", but
the thing it was really protecting still needs protecting, and it moved. The expensive
future mistake is no longer the guarantee; it is somebody writing `{ unspoken: 40 }` and
quietly creating the second rarity curve `src/data/rewards.ts` forbids everywhere in the
game. **A floor cannot become a curve**, which is why the mask is constrained to a shape
rather than to a ceiling. `augmentProblems` enforces it.

**This is not a repeal of the crafting cap.** Crafting still stops at mythic on every path.
The guarantee lives only on a rare *dropped* object, and four restrictions are load-bearing
rather than incidental: an augment cannot be **bought, forged, salvaged or traded**.
Anything that gives one a price turns a chase into a purchase order, which is the exact
failure the brief warned about. `tools/augments.ts` asserts no augment carries a `craft`
source; the others are structural (there is no vendor row and no recipe).

### 5.4 What augments must never do

Independent of §5.3, and asserted:

- **Form, element and affix augments move zero rarity.** A stacked bow+void+crit loadout on
  a Basic chest has *exactly* a Basic chest's rarity distribution. Targeting what an item is
  must never be a back door into how good it is.
- **Nothing here touches `challengerRarityBias`, `rewardCurve` or `profileFor`.** Augments
  are a chest-side system; the §16 curve has no augment term and never will. `dropChance`
  scaling on the augments' *own* drop rate is the only place `danger` enters, which is the
  same hook every other table uses.
- **Crafting still caps at mythic.** No augment is craftable, salvageable into Ash, or
  purchasable. There is no augment recipe at the Forge and no augment on the vendor.

---

## 6. The augment tab

Its own category in the Chests screen, per the brief. The layout follows two standing owner
preferences rather than inventing a shape: **action controls live in their own fixed region,
never mixed into a scrolling panel that also explains things**, and **a menu that looks like
a grid navigates like one, in 2D.**

```
┌─ LOADOUT ───────────────────┐  ┌─ AUGMENTS ─────────────────────────┐
│ Base    [Basic Chest    ]   │  │  [Rarity] [Form] [Element] [Affix] │
│ Rarity  [Legendary Augment] │  │                                    │
│ Form    [Bow Augment    ]   │  │   ▣ Rare      ▣ Epic     ▣ Legend  │
│ Element [Void Augment   ]   │  │   ▣ Mythic    ·          ·         │
│ Affix   [— empty —      ]   │  │                                    │
├─ OUTCOME ───────────────────┤  │   (2D grid, WASD walks rows+cols)  │
│ A Legendary or better Bow,  │  └────────────────────────────────────┘
│ void-weighted affixes.      │  ┌─ ACTIONS ──────────────────────────┐
│ Consumes: 1 Basic key,      │  │  [E] Open   [F] Clear   [Q] Back   │
│ 3 augments.                 │  └────────────────────────────────────┘
└─────────────────────────────┘
```

- **Base defaults to `Basic` on every entry to the tab.** §5.2.
- The five loadout rows are the four axes plus the base. Selecting a row filters the grid to
  that axis; picking from the grid fills the slot and **swaps out whatever was there**.
- **The OUTCOME panel is generated by `augmentedPull`** — the same function the roll calls.
  It is not a description of the pull, it is the pull minus the dice. §20's rule, in the
  literal form `tools/previews.ts` already pins for activities.
- **Opening is always 1×.** The `[;]` 1↔10 bulk toggle is disabled in this tab. Ten
  simultaneous augmented pulls is exactly the "routine currency" failure mode, and the
  cheapest possible defence against it is not offering the button.
- **Refusals print their reason** and happen before the key is spent: an affix augment the
  rarity floor cannot carry (§2.1), an empty loadout, no key of the base tier.
- Rows draw in their `grade`'s `RARITY_COLORS` entry, so an unspoken augment is
  `#ff1493` in a list of oranges and purples the first time you ever see it — the "loud,
  impossible to miss" rule that already governs drop feedback.

Owning zero augments shows the tab with an empty grid and one line about Avarice Rifts. It
is not hidden — the holy grail has to be visible before you have it.

---

## 7. The acceptance tool

`tools/augments.ts`, `npm run augments`, in the `npm test` chain. **Assertions are
comparisons, not bounds** — the lesson CLAUDE.md records from the sharp-vs-reckless campaign
inversion, and the shape `tools/forge.ts` already uses.

1. **Targeting works.** A full loadout on a Basic chest produces the exact named
   family+element+affix item every single time, where four thousand un-augmented Legendary
   chests produce it never. If this comparison ever fails the system has no reason to exist.
2. **The headline: the ceiling's discount stays inside a stated factor.** At every tier a
   grade can drop at, earning that grade's augment is never more than
   `MAX_CEILING_DISCOUNT` (6×) cheaper than simply seeing an item of that rarity fall out of
   the same cache. A named constant, compared directly. Both routes are measured in the same
   unit (Avarice boss caches), and the by-chance side counts *only* the items the cache
   itself drops — ignoring the coins the run also pays, which would buy chests and would
   only make the by-chance route look better. **Beyond that factor the top of the ladder has
   been made farmable, and the number has to be argued for rather than nudged.** A companion
   check asserts the discount *shrinks* as the Avarice ladder climbs rather than compounding,
   since deep Avarice is where an unbounded rate would do its damage.
3. **The other three axes move zero rarity.** A form+element+affix loadout on a Basic chest
   has a rarity distribution identical to a plain Basic chest's, to within floating point.
   This got *more* important under the owner's ruling, not less: it is what stops "I wanted
   a bow" from quietly becoming "I wanted a better bow".
4. **The ladder is ordered, and a rarity augment is a pure floor** — a suffix of the ladder,
   all at weight 1. Each floors at exactly its own rarity, the ladder ascends strictly, and a
   floor never caps. The ceiling may be reached deliberately but may not be *weighted*
   toward: a floor cannot become a curve. See §5.3 for why this is the rule that replaced the
   one the owner retired.
5. **One dial.** Each grade's definitions divide exactly that grade's rate, and the source
   the roll reads declares that same number — so a rate edit means what it says.
6. **One roll path.** An augmented pull and a plain pull produce structurally identical
   `Item`s, because both went through `rollItem`. A forced affix the type cannot carry is
   absent rather than invented — and that combine is refused at authoring time anyway.
7. **The preview holds no table.** `augmentedPull` drives both the outcome panel and
   `openChests`, verified by opening real chests and checking every result against the
   composed pull.
8. **Every reference resolves**, and no augment carries a `craft` source or hides behind a
   reserved kind.
9. **The overhaul is complete.** Nineteen tiers retired, none surviving anywhere, every
   remaining tier in exactly one category, the four originals untouched.
10. **Migration is lossless.** A synthetic v26 save holding retired keys loads into v27 with
   the coins refunded at full price, lifetime counts folded into the surviving tier, no
   `undefined` in either record, and an unknown augment id dropped rather than kept.
11. **One per axis is unreachable**, augments are consumed exactly once each, a loadout you
    cannot pay for spends nothing, and an augmented pull is always 1× however many are
    asked for — while an un-augmented one still bulks.

`npm run smoke` additionally walks the augment drop sites live — an Avarice Rift clear, a
Vigil bank, a Convergence boss bank — the way it already walks named items and relics, so
"every source pays out" is measured in a real run rather than promised in a table.

---

## 8. Deliberately not built

- **No augment crafting, salvaging or vending.** They are found. The moment they have a
  price they are a currency, and the brief's failure mode is exactly that.
- **No duplicate-augment stacking on one axis.** Two Bow Augments are two Bow Augments, not
  a stronger one. Every "what if I stack five" question is answered by the loadout having
  one slot.
- **No augments on the Delve, the Tower, raids, planets or the Memories.** Avarice, Vigil,
  Convergence. If the Avarice Rift turns out to be too narrow a tap after a real balance
  pass, widening it is one line per source — but it should be widened deliberately and once,
  not by every system that wants a reward to hand out.
- **No fifth axis.** Item level, granted skills and triggers are not augmentable. Item level
  already tracks the active character's frontier, and a granted-skill augment would be a
  whole extra castable made deterministic, which is the epic-item drop's entire reason to be
  exciting.
- **No party interaction.** Augments bank per-hero into per-machine saves like every other
  physical drop, and the tab is a town screen. There is nothing co-op needs to know.
