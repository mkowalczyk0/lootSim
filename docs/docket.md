# The docket

Owner-requested work that is queued rather than in flight. Added 2026-09-10, explicitly
**lower priority** than the art, animation and contrast streams running at the time.

This file exists so the docket survives a session ending. Take items off it in order,
strike them when they land, and add the design record's path next to the entry.

---

## 1. Multiplayer stuttering — INVESTIGATED, NOT FIXED, BLOCKED ON THE OWNER

**Measured 2026-09-10**, finding in `docs/mp-stuttering.md`, harness `tools/mp-stutter.ts`.
Two of the three suspects below came back **clean** with real numbers:

- **Host compute** (sim + snapshot encode) peaks at ~1.5 ms against a 16.67 ms frame
  budget even at 60 monsters and 4 players. Cleared.
- **Client interpolation and render load** on both ends: a real two-browser rig, a real
  room, a real 20-second fight at Nightmare VI with 34 monsters and 3 elites, held a clean
  ~60 fps on host and client with zero frames over 33 ms. Cleared.
- **Snapshot size** is genuinely stale — 2–2.3x the documented figure at depth (see the
  CLAUDE.md correction) — but 105 kB/s is ~0.84 Mbps and is not by itself a stutter cause
  on ordinary broadband.

**What is left is the one thing no session on this machine can test: a real internet path.**
Everything above ran over localhost — 0 ms RTT, no jitter, no loss — and `tools/relay.ts` is
a bare TCP/WebSocket pipe, so head-of-line blocking on one delayed packet stalls everything
queued behind it. Also unmeasured: a multi-minute session (this was 20 s, too short for a
leak or a GC pattern), a genuinely deep dive rather than a Challenger-inflated shallow one,
and the reporter's own hardware.

**This needs the owner and the original reporter on two real machines.** It is not
actionable before then, and the next session to pick it up should start from the
docs rather than re-measuring the two cleared suspects.

> "user reported stuttering and frame drops on multiplayer after joining my lobby."

A real player report from a real session, which is rarer and more valuable than anything
measured headlessly. **Reproduce before theorising.** The relay, the snapshot encoding and
the client reconciliation are three separate suspects and the repo has measurements for
none of them under load.

Places the answer is likely to be, in the order worth checking:

- **Snapshot size and cadence.** A busy floor is documented at "a bit over 40 kB/s per
  player" — measured once, at an unstated depth, with an unstated monster count. Deep
  floors spawn far more bodies. Measure it at depth 5 and at depth 18 before assuming the
  number still holds; this is the same "a constant that was correct for one rung" shape
  the repo keeps hitting.
- **Client-side interpolation.** Everything that is not the local hero interpolates every
  tick between snapshots (`advanceRemote`). Stutter that scales with monster count points
  here; stutter that is constant regardless points at the relay or the host's own frame
  budget.
- **The host's frame budget.** The host runs the whole simulation AND renders. A host who
  is themself dropping frames delivers late snapshots to everyone. Worth separating "the
  client stutters" from "the host stutters and the client faithfully reproduces it" —
  those have completely different fixes and only one of them is a networking bug.

Note the reporter joined the owner's lobby, so the owner's own machine was the host.

## 2. The rotating shop — LANDED

**Shipped 2026-09-10**, design record `docs/rotating-shop.md`, gate `npm run shop`.
Three tiers on UTC day/week/month rotation, coins to buy, gems to reroll. The ruling
that governs it — **gems buy choice, never quantity** — is enforced structurally in
`GameState.buyShopSlot`: a reroll can never move `purchaseCap`. Mythic is the ceiling as
a *type* (`ShopRarity`), so a future tier cannot even express divine or unspoken.
The paragraphs below are the original brief, kept for context.

> "daily/weekly/monthly shop (price appropriately mythics should be in the millions) costs
> gems to refresh shops, gets more expensive after each refresh."

Three tiers of stock on daily / weekly / monthly rotation, priced in coins, with mythics in
the millions. Refreshing the stock costs **gems**, escalating per refresh within a period.

`data/daily.ts` and `data/weekly.ts` already derive everything from the UTC day and week
number, and a monthly tier is the same idiom again. **Derive the stock the same way** — the
shop should be the same shop for everyone on the same day, for the same reason the Vigil is
the same floor for everyone.

**The pay-to-win seam is in this item and it must be got right — see item 3.** A gem-paid
reroll buys more chances at a mythic unless purchases are capped independently of rerolls.
The line that has been proposed and not yet ruled on: **gems buy choice, never quantity.**
Cap the number of purchases per period; let gems change *what is on offer*, never *how much
a player may take*.

## 3. More gem sinks

> "more use cases for gems, be creative - i really want to prevent pay to win but the long
> term vision is to have gems be a paid currency along side like cosmetic packs and
> whatnot."

**Gems are becoming a real-money currency.** That retroactively raises the stakes on every
gem sink: anything gems buy is something cash buys. The existing "cosmetics are powerless"
rule was written when gems were purely a drop; it now has to be read as a rule about money.

The test for a new sink is not "is this a cosmetic" but **"would paying for this make a
player stronger, faster, or luckier than one who didn't?"** Watch especially for sinks that
look like convenience and function as power: extra stash tabs, extra loadouts, extra daily
attempts, faster travel. Each is an owner decision, not something to wave through because
it is not a hat.

Candidate sinks, best first:

- ~~A trophy hall in the Citadel.~~ **Landed** — `docs/trophy-hall.md`,
  `feat/trophy-hall`. Display cases bought with gems (escalating cost), each holding a
  `structuredClone` snapshot of a stash item — never the item itself, never read by the
  simulation, `tools/smoke.ts` asserts a fully-cased sheet is byte-identical to an
  uncased one. Second room off the Citadel hall, the second use of the seam the
  training-dummy room proved out. **Not finished**: the room has no art and nothing
  renders in the world yet (the management screen is real; the "walk past and see it"
  payoff is a follow-up `render/hub.ts` change). Coordination with item 4's leaderboards
  on `itemScore` (the score this screen already reads) is still open — route it.
- **The fourteen authored weapon skins** (in progress) and further skin sets.
- **Emotes, pings and a marker wheel for co-op** — social, useless in solo, zero power.
- **Titles earned from the leaderboards in item 4**, purchased frames/borders for them.
- **Dive and portal VFX, death and revive VFX, party banner.**
- **Custom room codes** for co-op.
- **Character rename**, and paid re-rolls of appearance choices that are currently free.

## 4. Global leaderboards and multiplayer flavour — LANDED

**Shipped 2026-09-10**, design record `docs/leaderboards.md`, gate `npm run leaderboards`.
Records travel over their own small, independently-versioned payload
(`src/net/records.ts`'s `computeRecords`, `POST /api/records`) — the save string is never
touched, the same load-bearing property `docs/accounts.md` already promised and the shop's
SAVE_VERSION bump already proved. Every board keys on activity + depth/tier + Challenger
tier, never a bare number, the same "a height is not a depth" rule the badges system
already holds. "Strongest item" reuses `itemScore`; the multiplayer-flavour half became a
"Recent records" ticker rather than a second feature. No anti-cheat — one stated paragraph
instead, since none exists anywhere else in this game either. The paragraphs below are the
original brief, kept for context.

> "records in the abyssal/raids/memories, random records like 'strongest item currently in
> the game' 'highest recorded max damage' 'furthest depth/tower reached for each activity'
> - should be able to filter these by class."

The account server already exists (`tools/accounts.ts`, SQLite on the same HTTP server as
the relay) and already stores each player's save as an opaque string. Leaderboards need it
to read *into* that string, or need a separate submission path — that is a real design
decision and `docs/accounts.md` is the place it belongs.

**Read `docs/reachable-band.md` before designing the depth boards.** An attentive character
clears roughly depth 13-19, so a "furthest depth" board will show every player in the game
clustered inside a six-depth range. That is either a reason to wait on the band decision, or
an argument that the board is itself the most honest instrument the project could ship for
it. Either way, know it before building.

Per-class filtering is asked for explicitly. `Player` is already per-class
(`GameState.players`), so the data shape is there.

## 5. In-game UI cleanup

> "clean up the in game UI like health and mana. i don't believe mana is used universally
> anymore. keybinds in the health bar ui don't update. elite enemy health bars overlap the
> floor information at the top. it's hard to tell when you clear a floor."

Four separate defects, all of them things the owner hit while playing:

- **Mana is legacy.** `Player.mana` is kept for the HUD and potions, but most classes cast
  against their own `ResourceSpec` — momentum, meter, whatever the class is. The HUD should
  show the resource the class actually uses, named as that class names it.
- **Keybind labels in the health-bar UI do not update.** `combatHints()`, `skillKeys()`,
  `townHints()` and `tabHelp()` are documented as the single source of truth for every
  on-screen legend, reading live settings. Something in the HUD is not going through them.
  Find it rather than patching the label.
- **Elite health bars overlap the floor information** at the top of the screen
  (`drawEliteBars` in `ui/hud.ts`).
- **Clearing a floor is not legible.** The quota is met, the completion portal spawns
  somewhere fresh and the clear cache drops around it — and the player may be nowhere near
  any of that. This overlaps item 6 and the two should probably be solved together.

Nothing here is verifiable headlessly. Stand the game up in a browser (Playwright with
cached Chromium works on this machine; see `docs/art-verification.md`) and look.

## 6. A map, and finding the last monster

> "in game UI needs a map and some indicators when there is like 10 more monsters left. the
> 'mapping/farming' aspect of the game feels slower than it should be because players spend
> some time in deeper depths looking for the portal and looking for one last monster that
> got lost because it got stuck behind a wall or something."

The biggest item on this list and the one most likely to change how the game feels.

Two distinct problems inside it:

- **Wayfinding.** Floors are a graph of rooms and got ~20% bigger; the completion portal
  spawns at a fresh spot when the quota is met. A minimap is the obvious answer and the
  level is already a tile lattice, so the data is there.
- **The last monster.** Note the owner's phrasing — "got stuck behind a wall or something."
  That is worth taking literally before designing around it. Monsters that cannot see the
  player follow a flow field rebuilt four times a second; if a monster can end up somewhere
  the field never reaches, the fix is a pathing bug rather than a UI feature. **Measure
  whether stuck monsters actually happen before building an indicator to help players find
  them.** A marker that leads a player to a monster that cannot be reached is worse than
  no marker.

The wave director already forces owed elites when a floor runs out of bodies, which is the
precedent for the simulation resolving its own stalls rather than asking the player to.
