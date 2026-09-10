# The Forge — UAT §24 / §25 / §26 / §27

The working record for the Forge overhaul: what the bench does, the one currency it
runs on, the multi-item recipes, the economic promises the tests hold it to, and what
was deliberately left out.

Proven by `npm run forge` (`tools/forge.ts`), wired into `npm test`. The ordinary craft
(`GameState.craftItem`) and Reforge (`GameState.reforgeItem`) predate this and are
unchanged; their smoke sections still pass untouched.

## What the Forge is now

Three screens at one station (`I`/`O` or the pills cycle them):

| screen | what it does | since |
|---|---|---|
| **Craft** | pick a category, a rarity up to mythic, optionally an essence; spend materials; roll a fresh item through the exact `rollItem` a drop uses | before this chunk |
| **Reforge** — now the **workbench** | pick an item you own (worn or stashed) and do one of eleven things to it, priced, with the reason it can't when it can't | the full-reroll op is old; the other ten are new |
| **Named** | forge a named item for exactly its recipe: materials, coins and, now, stash items | recipes landed with §28; item components are new |

The spec's ask was that crafting become "a meaningful late-game system instead of a
basic equipment interaction". The reading that shipped: **the dungeon is the path to
gear; the Forge is the path to a specific piece of gear.** Everything below is built so
the second never becomes a faster version of the first.

## Ash — the one currency (§27)

§27 says in its own heading not to overcomplicate the currency initially. So there is one
new currency, **Ash**, and it has exactly one source: **salvaging** an item at the bench.

| currency | role | comes from | spent on |
|---|---|---|---|
| **Ash** | *shaping* what you already have | salvaging items — nothing else mints it | every workbench op except Reforge and Salvage |
| coins | *bulk* | the dungeon, selling | every op's coin line, recipes, the ordinary craft's reforge |
| the nine materials | *making* | Reliquary sectors only | the ordinary craft, essences, recipes, Augment's and Ascend's scrap |

Salvage returns Ash by rarity (`SALVAGE_ASH`: 1 · 2 · 5 · 12 · 30 · 75 · 200 · 600,
named ×2) and a pinch of each element the item's affixes carried (`salvageEssence`).
That is §24's promise made literal: an unwanted legendary is a component, and its fire
affix is Cinder Dust. Selling still exists and pays coins; the player picks which the
item becomes.

Why one and not three: the spec's own example lists "currency for rerolling stats /
modifying slots / high-tier crafting". Splitting Ash three ways would only make the
player carry three numbers that all come from the same act. If a second currency is ever
wanted, the seam is `forgeOpCost` — every op already returns a `{ ash, coins, scrap }`
triple and a fourth field would be one line.

## The workbench (§26)

`FORGE_OPS` in `src/data/crafting.ts`, implemented as pure functions over an `Item` in
`src/game/forge.ts`, paid for and swapped in by `GameState.applyForgeOp`. Every op rolls
through the same code a drop uses — `modValue`, `MOD_POOL`, `makeTrigger`,
`GRANTABLE_ABILITY_IDS` — so **nothing the bench can produce is an item a chest couldn't
have dropped.** The bench chooses *which* possible item you hold; it never invents one.

| op | does | gate | §26 line |
|---|---|---|---|
| Reforge | reroll every affix | — | "reroll stats" (pre-existing) |
| Temper | reroll ONE affix's value within its own range; key unchanged | the affix must have a range (a `flat` +1 projectile has none) | "improve/reduce stat values within defined ranges" |
| Recast | swap ONE affix for a different pool affix; the rest are locked | another legal affix must exist | "modify certain affixes" |
| Augment | add an affix | under the rarity's `MOD_COUNTS` ceiling; never past it | "modify certain affixes" |
| Inscribe / Rescribe / Erase skill | roll a granted skill onto the item / re-roll it / clear it | epic+, weapon/ring/necklace — the drop's own gate | "manipulate skill slots" |
| Awaken / Erase trigger | roll a trigger onto the item (or re-roll it) / clear it | legendary+ — the drop's own gate | "manipulate skill slots" |
| Ascend | raise the item ONE rarity, keeping every affix (rescaled), its grant and trigger; re-roll the base block at the new rarity; re-name from the new table | stops at **mythic**; consumes 2 same-rarity non-named stash items | the §24 "make what you have into what you want" |
| Salvage | destroy for Ash + materials | — | (§24, §27) |

**Inscribe and Awaken roll; they never let you choose.** The PM's call, and the right
one: if a player could pick any grantable ability, every character would converge on the
strongest grant and the thing CLAUDE.md says makes a grant worth wearing — "breaking the
class rule is exactly what makes that drop worth wearing" — would go from a discovery to
a shopping decision. Manipulating the slot (add, re-roll, clear) is §26 satisfied;
the outcome stays a roll, like every other property an item has. Deterministic choice is
a separate owner-level call if anyone wants it.

**Named items** accept Reforge, Temper and Salvage only. Their fixed affixes are their
identity (`docs/named-items.md`); Recast, Augment, Inscribe, Awaken and Ascend are
refused with the reason "A named item's identity isn't for sale". Temper works on a named
affix authored with a range and refuses one authored as a single number.

### Costs

`forgeOpCost(op, rarity)` → `{ ash, coins, scrap }`. Ash **doubles per rarity tier**
(§26 "scales aggressively"): a legendary Temper is sixteen times a common one. Coins ride
the existing `reforgeCoinCost` scale times a per-op multiplier. Ascend is priced at the
rarity being *reached*. The quote the side panel shows and the price `applyForgeOp`
charges come from one function, so they cannot disagree, and a refusal spends nothing.

### The UI (unverified by eye — nobody here has a browser)

The Reforge card grid is unchanged; its side panel gained the workbench: op chips with
their cost, the selected op's blurb, an affix picker with each affix's range when the
op needs a target, the melt-down list for Ascend, the yield for Salvage, the cost table
against your balances, and the blocker in red when there is one. Keys: `special` cycles
the op, `cancel` cycles the affix, `confirm` applies; every chip is also clickable
(`data-forge-op`, `data-forge-affix`). The card's lock badge now means "the current op
can't run on this one", with the reason in its tooltip.

**The eleven ops read as one flat row; the Sept 2026 pass clustered them by what they
act on** (`FORGE_OP_GROUPS` in `ui/town.ts`, presentation only — `special` still cycles
the underlying flat `FORGE_OPS` list, unaffected): Reroll (Reforge, Temper, Recast,
Augment), Granted skill (Inscribe, Rescribe, Erase skill), Trigger (Awaken, Erase
trigger), Rarity (Ascend), Destroy (Salvage). The selected op previously had no visual
state of its own beyond its tooltip — every chip in the row looked equally pickable
whether or not it was the one about to run — and a blocked op looked exactly as pickable
as a legal one; both now read at a glance (`.chip.on`, `.chip.dim`).

**Salvaging what you're wearing needs a second confirm** (§ the owner's own complaint:
"easy to make mistakes and salvage your Equipped gear"). The card grid already flags a
worn item with a `WORN` badge; picking Salvage on one no longer runs it — the first
confirm (`confirm`, or clicking the card) arms it with a red warning, and only an
identical second confirm on the same item actually destroys it. Any navigation, or
switching the op, disarms it — the confirm has to be for the exact item you're looking
at right now, same rule `resetArmed` already used for wiping a save. Selling can't reach
an equipped item at all: the Stash screen (where `sell` is called) only ever lists
`state.inventory`, which a worn item is never in — verified rather than re-gated, since
a confirm dialog that can never fire would just be more UI to read past.

**The Stash gained mass-salvage** (`GameState.salvageItems`, `tools/forge.ts` §9 — exactly
`salvageItem` run once per id and summed, so the batch can never pay a different rate
than doing it one at a time). Each card grew a checkbox; the new `mark` key (default `F`,
rebindable like everything else) toggles whichever card the cursor is on, so a
keyboard-only player doesn't need the mouse for it. Marked cards get a red outline, and
`special` (which sells all junk when nothing is marked) switches to a two-press
arm-then-confirm salvage of the marked pile the moment anything is marked — the same
"press again" idiom as everywhere else in this UI. Since the Stash grid never lists a
worn item, the batch can't touch equipped gear by construction; a named item can be
marked (single-salvage already allows it) and the arm step calls that out by count so it
isn't a surprise.

### The possibilities panel (docket §10) — and why it holds no table

> "New UI in the Forge under the workbench view to show 'possibilities' of the reforge. We
> as players need to see what the available pool of affix's are if we recast etc."

Standing in front of an op, the bench now shows what that op could actually give you:
`forgePossibilities` in `game/forge.ts`, drawn by `TownUI.renderPossibilities` into a
`.wb-pool` strip between the reading strip and the action bar.

**The rule that governs it is UAT §20's, and it is the reason this is a function in
`game/` rather than a list in the UI: the preview holds no table of its own.**
`docs/drop-previews.md` says why — a preview that can drift out of sync with the real roll
is worse than no preview. So every list here is read from the function the op *actually
rolls through*:

| Op | Draws from | Read by the panel from |
| --- | --- | --- |
| Reforge | the whole affix pool | `modPoolFor(type, tier)` |
| Reforge, **named** | the definition's own ranges + `randomMods` extras | `def.mods` + `modPoolFor`, minus the keys the definition occupies |
| Recast | the pool minus what it already carries | `recastPool(item, affix)` |
| Augment | the pool minus what it already carries, bounded by `MOD_COUNTS` | `augmentPool(item)` |
| Temper | one value inside one range | `affixRange(item, affix)` |
| Inscribe / Rescribe | the granted-skill shortlist | `inscribePool(item)` |
| Awaken | the trigger shapes × the loot elements | `TRIGGER_SHAPES` |
| Ascend, the erasures, Salvage | nothing — the outcome is certain | — |

Three of those functions were *extracted* rather than reimplemented, which is the whole
mechanism: `modPoolFor` now backs `rollMods` as well as the panel, `augmentPool` was
lifted out of `augment`, and `recastPool`/`inscribePool` were exported from the ops that
already used them. **The panel and the roll call one function each. If the pool is wrong,
the game is wrong in exactly the same way** — which is the condition §20 asks for, made
structural instead of promised.

**The ops are five different outcome spaces, not one.** A single "here are all the
affixes" list would be a wrong answer for four of the five: Recast swaps one and can never
return an affix the item already has, Augment adds one and stops at the rarity's ceiling,
Temper cannot leave a range, and Ascend/Salvage/the erasures do not roll at all — they say
"certain, not rolled" and show nothing, because an empty list under a pool's heading reads
as a bug.

**The rarity gate is shown, not merely obeyed.** Each outcome carries the `minTier` it
unlocked at, so an affix the item cannot reach yet reads as an argument for ascending it
rather than as one that mysteriously never turns up.

`tools/forge.ts` §10 (in `npm test`) pins this as a property rather than by inspection:
for every drawing op it compares the panel's set against what the real op rolls over a
deterministic sweep, and the sets must be **equal**. Both directions are asserted because
they fail differently — an outcome the roll produces and the panel omits is a player told
something was impossible when it wasn't; an outcome the panel lists and the roll never
produces is Ash spent chasing something that isn't there. Both were demonstrated red by
injection before the section was trusted (dropping one pool entry trips the first, adding
a fabricated one trips the second). Each case prints the size of the pool it walked,
because a filter over a pool that has silently emptied passes.

### The confirm button, and clicking an item no longer runs the op (docket §15)

> "There a weird bug where you have to be careful not to click the item itself with a
> mouse as it will just execute the action."

It was not really a bug so much as a missing distinction: the Reforge grid's cards carried
`data-index`, and this UI's generic row handler both moves the cursor **and** calls
`primary()`. That is exactly right for a chest tier or a stash row and wrong for a card
sitting in front of an Ash-spending, one-way operation.

Selecting and executing are two acts now. A card carries `data-forge-item`, whose handler
only ever selects (and disarms whatever the last card had armed). The one control that
spends anything is a `.wb-actions` strip at the bottom of the workbench — **its own fixed
region, outside the scrolling card grid and outside the reading panel**, which is the
settled direction after three owner reports in this family. It calls `workbenchConfirm`,
the same function the `confirm` key calls, so the mouse and keyboard paths cannot diverge.

**Salvage's two-press gate now runs through that button rather than a path of its own**,
which is what the docket asked for: on a worn item the button reads "Salvage — the one
you're wearing?", and only a second press on the same item destroys it. Blocked ops
disable the button and put the blocker beside it.

### The better/worse arrows (docket §14)

The Forge's card grid shows the Stash's green-up / red-down arrows, from
`TownUI.upgradeMark` — the Stash's own comparison, extracted so there is exactly one
scoring path. `itemScore` already knows about weapon affinity, so a second one here would
quietly disagree with the arrows two screens over. A worn card keeps its `WORN` badge in
that corner instead, and an item is never compared against itself.

## Multi-item recipes (§24 / §25)

`NamedSource.craft` gained `items?: ItemRequirement[]` — `{ count, minRarity?, slot?,
type?, named? }`. Components come from the **stash only** (what you're wearing is never
eaten), cheapest first, an item counted against at most one line, and **a line without
`named` never consumes a named item** — a boss-exclusive is never generic fodder. The
Named screen's bill lists each line with how many you have; `GameState.recipeComponents`
is the one function that picks them, so the preview and the spend agree.

Two recipes ship:

- **Threshold Brand** (mythic sword) now also melts **two legendary weapons** into its
  steel, alongside the materials and coins it already cost.
- **The Seal Unbroken** (mythic shield) — the §24 sentence made real, "Boss Drop X +
  Material A + B + N items = named": it needs **one The First Seal** (the Warden's own
  drop), three legendary shields, Gilt Reliquary, Iron Scrap and coins. A two-step chain:
  kill the Warden, bring the shield here. It lives entirely in the named-item table from
  §28 with no new code — which is what that pipeline was built for.

## The economic promises (asserted, not hoped)

`tools/forge.ts` §6 pins these as direct comparisons, per the repo's rule that a design
promise is a comparison, not two one-sided bounds:

1. **Salvaging ten legendaries does not fund a rare→mythic ascension chain.**
2. **Making a specific item is never cheaper than finding one.** In vendor value — the
   one exchange rate every input shares — an Ascend puts in more than it gets out at
   every rarity (the item, two components, the coins), and every named recipe's
   components alone outweigh the item they make.
3. **The bench is a sink, not a loop.** Salvaging one item of a rarity never pays for
   even the cheapest shaping op (Temper) on a peer of that rarity. You break two to
   improve one. Only the erase ops are cheap enough for one salvage to fund.
4. **Nothing else mints Ash.** Chests, crafts and dives leave it at zero.
5. **The mythic wall holds everywhere** — Ascend, recipes, the ordinary craft.

Tuning note: master's sharp-campaign depth moved from 10.3 to 11.8 with the grant-bus
fix that shipped with §28; Ash yields and costs were set against that. Ten legendaries
(a deep, lucky run's worth) buy roughly one legendary Temper and change. If that reads
too slow in play, `SALVAGE_ASH` and `ASH_BASE` in `data/crafting.ts` are the two dials;
the §6 comparisons will say when a change breaks a promise.

One thing to watch, per the PM: a named item salvages for double. If a boss-exclusive is
ever worth more as Ash than as an item, something is mispriced; today a legendary named
returns 60 Ash, about one legendary Temper, which is not a farming loop.

## Not built — deliberately

- **A PoE-style orb economy.** One currency, by the spec's own instruction.
- **Choosing a grant or trigger.** Rolled, see above. Owner-level call if wanted.
- **Crafting divine or unspoken.** The wall is mythic on every path (`CRAFT_MAX_RARITY`);
  `tools/forge.ts` and `namedProblems` both refuse a recipe that would make one.
- **Ascending or re-shaping a named item.** Identity isn't for sale.
- **Materials from the delve or the rifts.** Still Reliquary sectors only. Salvage returns
  a *pinch*, not a farm.
- **Recipes that consume equipped gear**, or that pick components for you by anything
  but "cheapest legal first". Both would make the bill a surprise.
- **Currency-for-currency exchange.** Coins never become Ash; Ash never becomes coins.

## Save

`SAVE_VERSION` 19 (provisional until merge — the rule is master's current version + 1 at
merge time; the PM assigns it). One new account-wide field, `ash`; an older save loads
with none. Two new `RunStats` counters, `itemsSalvaged` and `ashEarned`, merge from
`freshStats()` like every other counter.
