# The Trophy Hall — docket §3, a gem sink that is pure vanity by construction

> "more use cases for gems, be creative - i really want to prevent pay to win but the
> long term vision is to have gems be a paid currency along side like cosmetic packs and
> whatnot." — the owner, `docs/docket.md` §3

The Trophy Hall is a second room off the Citadel hall: display cases bought with gems,
each holding a snapshot of an item the account actually found. It is the payoff
`data/rarity.ts`'s "keep it absurd, the long tail is the hook" rule never had — unspoken
sits at roughly 1 in 250,000 and, until now, the only place that ever showed was a number
in a stash cell.

## The load-bearing rule: a case is furniture, not a container

Placing an item in a case **snapshots it** (`structuredClone`) rather than moving or
referencing it. The original stays in the stash, worn or unworn, untouched — you can
equip it, salvage it, sell it, or lose it on a death, and the case on the wall doesn't
know or care. This is the same "two lifetimes" move `forgeNamedItem` already makes for a
named item's baked copy, applied for the identical reason: nothing here should ever have
to ask a display case for permission before touching the real item.

That single decision is what makes the power question trivial rather than something to
audit case by case: **the simulation never reads `GameState.trophyItems`.** It is drawn
by the UI and nothing else, the same way `data/cosmetics.ts`'s wardrobe is powerless by
never being read outside `render/`. `tools/smoke.ts`'s cosmetics-powerless section grew a
sibling check: buy every case, put a rolled mythic in each one, and assert the character's
`mods` are byte-identical before and after — the same assertion cosmetics get, not a
weaker one.

## Gems buy choice, never quantity

The rule the rotating shop (docket §2) already established, checked here the same way:
buying a case costs escalating gems (`TROPHY_CASE_BASE_COST` + `TROPHY_CASE_COST_STEP`
per case, `data/trophies.ts`) and buys *space to display something*, never a stat, a
slot, a set bonus, or anything that reaches the character sheet. Assigning an item to an
owned case is free — you're choosing which of your own finds to show off, not paying
again for the privilege.

## What's built

- `data/trophies.ts` — `MAX_TROPHY_CASES` (6), the cost curve, pure data.
- `GameState.trophyCasesUnlocked` / `trophyItems` (`src/game/state.ts`), with
  `buyTrophyCase()`, `assignTrophy()`, `clearTrophy()`, `trophyItem()`. Account-wide, like
  the stash and the relic collection — a hall of what this account found, not what one
  character is wearing. `SAVE_VERSION` 31 (tentative — re-verify against master at merge,
  per the standing rule).
- `game/deck.ts` — the second "second room," the same seam the training-dummy room
  proved out: a doorway at row 11 only (rows 10 and 12 keep the old wall solid), a room
  at columns 23-28, one station (`trophyHall`, glyph `Y`). Exhaustive `Record<HubStationKind,
  ...>` types in `deck.ts`/`hub.ts`/`render/hub.ts` all had to be told what the new
  station is called, how big it is, what it opens, and what it stands on — the "a new
  station cannot exist without being given a place to stand" property held.
- `src/ui/town.ts` — a new station-only tab, `"Trophy"` (reached only by walking to the
  Trophy Hall, never by cycling — the same rule Dive/Rifts/StarMap/Craft already follow).
  One screen, two modes: the row of cases (locked/empty/filled), and — when a case is
  being assigned — the stash, sorted by `itemScore` like every other item list in the
  game, picking one item to snapshot in.
- `tools/smoke.ts` — the powerlessness assertion above, plus that a case refuses to buy
  without gems, refuses to accept a placement past what's bought, and that clearing a
  case never touches the stash it came from.

## What's not built

- **The room has no art yet.** `prop.citadel-trophy-case` is named in `STATION_PROP` but
  not committed to `ATLAS` — it falls back cleanly, the same state the War Table and the
  Altar shipped in before their relics existed. The room itself flat-bakes until the deck
  gets a tileset that covers it.
- **Nothing is drawn in the world yet.** The station opens the management screen; what's
  actually on display does not yet render as an item icon standing in the room the way
  the assignment above describes. This was cut for time in the same session that built
  it — the state, the economy and the powerlessness guarantee are real and tested; the
  "walk past and see it" payoff the owner's brief specifically asked for is the next
  piece, and it's a `render/hub.ts` change (draw `itemSprite` at a fixed offset per case,
  reading `GameState.trophyItem(i)`), not a data-model one.
- **Coordination with the leaderboards work (docket §4, item-score) didn't happen this
  session** — flagged to the PM to route, since `itemScore` (`game/item.ts`) is the one
  score this feature reads and it's also the definition §4 needs for "strongest item
  currently in the game." Nothing here invents a second one; the picker sorts by the
  existing function.

## Reproducing the powerlessness check

`npm run smoke` (part of `npm test`) — search for "cosmetics never touch your numbers"
and read the block right after it.
