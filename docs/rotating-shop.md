# The Rotating Shop

`docs/docket.md` item 2. Design record, per the PM ruling (2026-09-10, lootsim-21) that
put three decisions in this document's hands rather than left them defaulted.

## The promise, in one line

**The same shop for everyone, every day/week/month — mythic prices that mean it — and a
reroll that can never buy more than what a period already allows.**

Three tiers, `src/data/shop.ts`:

| Tier | Slots | Purchases/period | Rarity range | Reroll (gems, escalating) |
| --- | --- | --- | --- | --- |
| Daily | 3 | 1 | common – legendary (1% chance) | 15 |
| Weekly | 4 | 2 | common – mythic (2% chance) | 40 |
| Monthly | 5 | 2 | uncommon – mythic (20% chance/slot) | 100 |

## Same idiom as the Vigil and the Convergence, a third time

Everything a period offers derives from one UTC integer — `dayNumber`/`weekNumber` reused
directly from `data/daily.ts`/`data/weekly.ts`, plus a new `monthNumber` (calendar months,
not a fixed 30-day window, so "monthly" means what a player expects) following the same
well-mixed-hash-with-its-own-constant idiom `daySeed`/`weeklySeed` already established.
Two players anywhere in the world looking at the Monthly Stock on the same UTC day see the
identical five items at the identical prices — the same reason the Vigil is the same
floor for everyone, restated for a shop instead of a dungeon.

## The hard constraint: gems buy choice, never quantity

This is the entire thing standing between the shop and pay-to-win once gems become a
real-money currency (the owner's stated direction, `docs/docket.md` item 3), so it is
**structural**, not a rule a call site has to remember:

- `GameState.shopPurchasesLeft(tier)` is `purchaseCap - purchasedSlots.length`. Nothing
  that spends gems — `rerollShopSlot` — ever touches `purchasedSlots`. A reroll changes
  what a slot offers; it cannot change how many slots an account may still buy.
- `buyShopSlot` checks the cap **before** any coins move or any item is minted — there is
  no code path from "clicked buy" to "got an item" that doesn't pass through the cap
  first. Verified directly in `tools/rotating-shop.ts`: reroll a slot a hundred times,
  confirm `shopPurchasesLeft` never moves.
- Buying an already-bought slot (rerolled into something new since) is refused —
  `purchasedSlots` records *which slot*, not merely *how many times*, so a player can't
  buy the same slot twice by rerolling it between purchases and exploit an off-by-one in
  the count check.

## The mythic ceiling is a type, not a filter

`ShopRarity = Exclude<Rarity, "divine" | "unspoken">` — every tier's `weights` table, and
`SHOP_PRICE`, are typed over `ShopRarity`. Writing `divine: 5` into a tier's weights is a
**compile error**, not a runtime check that could be skipped or a review comment that
could be missed. This is restated rather than imported from `data/crafting.ts`'s
`CRAFT_MAX_RARITY` (`"mythic"`, the Forge's own identical ceiling) because
`Exclude<Rarity, ...>` needs a literal type and `CRAFT_MAX_RARITY` is a runtime value —
deriving a type from a value just to avoid a one-line duplication was judged not worth the
indirection. Both ceilings independently name mythic as the top; if they ever needed to
diverge, that would be a deliberate, visible two-line change, not a shared constant
quietly moving both at once.

`tools/rotating-shop.ts` also asserts it empirically — a few hundred period/slot draws
across every tier, zero divine or unspoken — as a belt-and-braces confirmation that the
type-level guarantee is doing what it says, the same "assert the structural guarantee
too" posture `art-style-guide.md`'s §1.4 checks take.

## Pricing: a guaranteed pick costs more than a chance at one

`SHOP_PRICE` (coins, by rarity): common 1,000 · uncommon 5,000 · rare 25,000 ·
epic 125,000 · legendary 600,000 · mythic 3,000,000 — roughly 5x per rarity step,
landing mythic solidly in the owner's own "millions" brief.

This sits well above what a chest asks for the same rarity, deliberately: a chest is a
**chance** (`data/chests.ts`'s Legendary tier is 10,000 coins for epic-and-up, not a
guarantee of epic-and-up), and the shop sells the exact item you can see, at the exact
rarity shown, with certainty. Certainty costs more than a gamble at the same odds — the
same logic the niche category chests already price by ("guaranteed slot/family/element,
priced for the certainty rather than the rarity curve underneath it").

## Three decisions, stated rather than defaulted

**Stock is global; purchases are per-account.** The catalog — which items, at which
prices — is identical for every account on the same UTC day/week/month, matching "the
same shop for everyone." But nothing here models cross-account contention (no server-side
economy exists elsewhere in this game to model it against), so buying a slot doesn't
remove it from anyone else's view — it only marks that slot bought *for the account that
bought it* and consumes one of that account's own purchase-cap slots. This is what
answers the PM's own tension directly: a player who's already spent their cap still sees
next month's mythic slot exist and matter, it just isn't theirs to buy again until the
period turns over — the tier still "does something for them" (they can see it, reroll
around it out of curiosity, plan for next period) without a fiction of "sold out
globally" that this game has no other economy to back up.

**Reroll is per-slot, not whole-tier.** Cheaper for the player, and more interesting —
"I like three of these four, reroll the fourth" is a real decision a whole-tier reroll
can't express. Cost escalates once per period regardless of *which* slot gets rerolled
(`shopRerollCost`, linear in total rerolls this period) rather than per-slot-independent
counters — simpler to balance and explain, and a period is short enough that unbounded
linear growth self-limits without a hard cap (nobody rerolls a daily slate to infinity
before the day resets in under 24 hours).

**The slate wipes at the period boundary.** No unsold-stock carryover. The stock is
*derived*, not stored — persisting "what didn't sell" would mean tracking extra state
that contradicts "the shop is a pure function of the period number," the same property
that makes it trivially the same shop for everyone. A new day/week/month is a fresh
independent roll, exactly like the Vigil never remembers yesterday's floor.

## Verified

`npm test` green, `tools/rotating-shop.ts` (`npm run shop`) in the chain: determinism,
the purchase-cap-survives-any-number-of-rerolls guarantee, the mythic ceiling (typed and
empirical), save/load round-tripping the bookkeeping, and period rollover wiping it.
Verified in a browser: a new "Shop" tab beside Chests in the Quartermaster (docket item
2 is a DOM screen, not a dungeon run — the Quartermaster is explicitly "the door into
everything that's still a DOM screen", the same reasoning that keeps it off a dedicated
hub station the way the Vigil/Convergence portals are, since those launch dungeon floors
and this doesn't). Buy and Reroll both live in their own fixed action bar below the
listing grid and the read-only stat panel, reusing the Forge workbench's own approved
layout (`docs/actions-vs-reading-panels`) rather than a third implementation of it.

## Files

| | |
| --- | --- |
| `src/data/shop.ts` | tiers, pricing, period derivation, the pure `shopStock` roll |
| `src/game/state.ts` | `GameState.shop` bookkeeping, `buyShopSlot`/`rerollShopSlot`/readers, save/load (SAVE_VERSION 30, confirm at merge) |
| `src/ui/town.ts` | the "Shop" tab — a grid, a read-only `renderCompare` panel, a fixed Buy/Reroll action bar |
| `tools/rotating-shop.ts` | the acceptance gate |

## Not built

- **No new gem sinks beyond the reroll.** `docs/docket.md` item 3 ("more gem sinks") is
  a separate item; scope stayed at what item 2 asked for.
- **No cross-account stock contention.** See "Stock is global; purchases are
  per-account" above — this game has no live server economy to model scarcity against,
  and inventing one for this feature alone would be a much bigger, unasked-for build.
- **No UI countdown ticking live** — the reset timer shown is computed once per render
  (accurate to the render cadence the whole Quartermaster screen already uses), not a
  separately-animated clock.
