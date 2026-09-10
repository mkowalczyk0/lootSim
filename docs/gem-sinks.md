# Gem sinks — the shortlist, docket §3

> "more use cases for gems, be creative - i really want to prevent pay to win but the long
> term vision is to have gems be a paid currency along side like cosmetic packs and
> whatnot." — the owner, `docs/docket.md` §3

A shortlist with prices and an owner call to make. Docket §3's first entry (the Trophy
Hall) has already landed; this is the design for what comes after it, written the way §3
asks — say what each sink is, what it costs, why it cannot become pay-to-win once gems
are bought with money, and what it costs to build.

**2026-09-10: the owner approved both A (Standards) and the wardrobe baseline — not
either/or.** Built on `feat/gem-sinks-standards`, `src/data/standards.ts`, SAVE_VERSION
34. §4A shipped close to as designed: the earned/free split, the three render sites
(lobby, in-run nameplate, Trophy Hall), and both structural safety proofs (`tools/smoke.ts`
— dressed sheet byte-identical, and buying every banner style gains zero displayable
marks, falsified both ways). One deliberate scope cut from the doc's price table: the
**8-slot escalating Trophy Hall "standard mount" ladder is not built** — the Hall shows
whichever Standard the class is flying (one, live, free) rather than an independent set of
purchasable permanent mounts. That is a real, clearly-scoped follow-on (it needs its own
`GameState` array the same shape `trophyItems` has), not an oversight; see the branch's
own commit for the reasoning. B (Titles) is still a strict subset of A and still not worth
building separately. The wardrobe got two new cosmetics on each of the cheapest slots
(a hat, an ears item, two auras — recolors of existing kinds, the same pattern `hatCrown`/
`hatUnspoken` already use) rather than a new weapon skin, which the owner's standing rule
still prices as its own authored weapon.

---

## 1. The test, so the "is this pay-to-win?" argument never has to be had

The existing rule is "cosmetics are powerless," and the reason it has held is not that
anybody has been careful. It is that **cosmetics are powerless by never being read by the
simulation**, and `tools/smoke.ts` asserts exactly that: dress a character in the entire
wardrobe and its `mods` are byte-identical to the undressed one. The Trophy Hall reused the
same proof — buy every case, fill every case, byte-identical sheet.

So the test for a new gem sink is not a judgement about how large an advantage is:

> **A gem sink is safe if, and only if, the thing it buys is never read by `game/`.**

That is mechanical, it is assertable in the acceptance gate, and it settles the cases §3
warns about without an argument:

| Tempting sink | Read by `game/`? | Verdict |
| --- | --- | --- |
| Extra stash tabs | `GameState.inventory` — `Player.canEquip`, `junkItems()`, the Forge's `ItemRequirement` components, `craftNamed` | **Out.** More stash is more high rolls kept, which is a better build. |
| Extra daily / weekly attempts | `GameState.daily.clearedDay`, `weekly.clearedWeek` | **Out.** A time-skip. |
| A fourth relic slot, a second loadout | `Player.relics` → `Player.build` | **Out.** Literally a stat purchase. |
| Ash, materials, keys, coins | everything | **Out**, and it breaks the never-convert rule too. |
| A marker pointing at the last monster | the dungeon, and the player's route through it | **Out, and worst of the list** — see §6 below. |

**The test is necessary, not sufficient.** A sink can pass it and still be wrong: charging
gems for appearance re-rolls passes (nothing reads a hairstyle) but CLAUDE.md states that
"deciding what you look like isn't a currency sink," so putting a price on something
currently free is a *takeaway*, not a sink. Two gates, then — never read by `game/`, and
never something the player already has.

---

## 2. What the economy can bear (measured, not guessed)

Gems have three drop sites (`game/dungeon.ts:3049`, `:3051`, `:3258`). Expected yield for
one **cleared** floor, before `gemFindMult` from the universal tree's Avarice path:

| | gems |
| --- | --- |
| Delve trash floor, depth 8 | ~27 |
| Delve trash floor, reachable band (13–19) | **~45–65** |
| Delve boss floor (10 / 15 / 20 / 25) | ~43 / 54 / 64 / 75 |
| Delve trash floor, depth 29 | ~110 |
| **Avarice Rift, full clear** (`gemMult` 1.9, boss cache ×2.4) | **~180 (t1) → ~400 (t8)** |

Reproduce with the arithmetic above against `profileFor`; the numbers are analytic
expectations from the three drop formulas, not a bot run, so treat them as the right order
of magnitude rather than to two significant figures.

Existing sinks, for the price band:

| | gems |
| --- | --- |
| Trinket / Boutique / Starlight capsule | 40 / 160 / 600 |
| Trophy case *n* (`data/trophies.ts`) | 150 + 125·*n* → 150…775, **2,775 for all six** |
| Shop reroll, daily / weekly / monthly | 15 / 40 / 100, escalating within the period |

So the band a new sink has to sit in is: **~150 for a casual purchase** (three delve
floors), **~600 for a considered one** (two Avarice rifts), **~3,000–6,000 for a whole
collection** (a long grind, which is what `data/cosmetics.ts` already says a wardrobe is).

---

## 3. The finding that shapes the recommendation

The Trophy Hall is the right *pattern* — gems buy the shelf, never the loot — but it is
mounted on the wrong *surface*, and this is worth saying plainly before extending it:

> **A display nobody else can see is a weak thing to charge real money for, and the Trophy
> Hall is a room only its owner can enter.**

There is no visiting, no profile page, and `docs/leaderboards.md` explicitly did not build
one. Every gem sink of this shape that gets built into that room inherits the same ceiling.
Meanwhile the game already has three surfaces other players actually look at — the Comms
Relay lobby, the in-run nameplate, and the leaderboard rows §4 shipped — and **the wire
already carries what would go on them**: `HeroWire` sends `appearance` and the full
`playerToJSON`, which already includes `challengerBadges`, `delveChallengerBadges`,
`towerChallengerBadges`, `planetChallengerBadges` and `raidChallengerBadges`.

So the badge dataset — per class, per activity, per Challenger tier, per depth — is
*already on the wire, already earned, and displayed nowhere*. That is the gap.

---

## 4. The shortlist

### A. Standards — **recommended**

**What it is.** A **Standard** is one thing you did, made visible: "Death March IV ·
Delve 22," "The Unfinished Warden, felled," "Abyssal Rift VIII." You pick which of your own
badges to fly. It shows under your name in the Comms Relay lobby, on your in-run nameplate,
on your leaderboard row, and hanging in your Trophy Hall.

**The split, which is the whole design.** The mark is **earned and free** — the set you may
fly is a pure function of `Player.challengerBadges` and friends, and gems never enter that
function. What gems buy is **the cloth**: the banner style the Standard is rendered in. A
paying player with no clears owns a beautiful banner with nothing on it.

**Prices.**

| | gems | why |
| --- | --- | --- |
| Flying a Standard you earned | **0** | you already paid for it, in floors |
| A banner style (direct purchase) | **250** | above a Boutique capsule's 160 random pull — the shop's own "certainty costs more than a gamble" rule (`docs/rotating-shop.md`) |
| Trophy Hall standard mount *n* (8 of them) | **150 + 150·*n*** → 150…1,200, **5,400 total** | the Trophy Hall's own escalating shape; roughly 2× the case wall, for 8 slots instead of 6 |

**Why it cannot become pay-to-win.** Nothing in `game/` reads a flown Standard, so it takes
the cosmetics proof unchanged. The one real hazard is *displaying a badge you did not
earn*, and it closes structurally rather than by discipline: the displayable set is derived
from the badge fields, gems are not an input to that derivation. The check that proves it
is a comparison rather than a bound — **buy every banner style in the game and assert the
displayable-marks set gains zero entries** — alongside the byte-identical-sheet assertion
the wardrobe and the cases already carry.

There is no matchmaking and rooms are four-letter codes among people who know each other,
so there is no gatekeeping surface for a Standard to become a social requirement on.

**Lore is free, not invented.** The worldbuilding has the Citadel as "the accumulated
history of humanity made physical" and the Legends as "anchors of humanity's collective
memory," whose weight in Purgatory comes from the imprint they left. A Standard is the
Keepers' record of what this manifestation has done. It is the same reading `docs/memories.md`
already took from the same passage.

**Build cost.** Small-to-medium, and mostly reuse. The room, the station, the second-room
seam, the station-only tab and the powerlessness assertion all exist. New: a `data/standards.ts`
(pure), account-wide owned styles + a per-class flown mark on `Player` (which puts it on the
co-op wire for free), one screen, three render sites, a `SAVE_VERSION` bump, and a gate.
Call it one session for the system plus one art asset per banner style — and **the per-style
marginal cost is one grid and one row**, which is what makes it evergreen rather than a sink
that caps out.

---

### B. Titles, and frames for them

The narrow half of A — text under your name, no cloth. §3 lists it and `docs/leaderboards.md`
built the data for it. Same earned/bought split: the title is earned, gems buy the frame at
**300**.

Cheap (half a session) and it lands on the highest-visibility surfaces. **It is a strict
subset of A**, so the two should not both be built — if A is approved, this is A's first
render site.

---

### C. The Long Hall — dressing the Citadel

Player-placed decoration on the deck: braziers, hanging colours, statuary, floor mosaics.
**300–900** each depending on footprint. The most evergreen sink on this list — each
decoration is one art asset and one data row forever — and the strongest lore fit, since
the Citadel is *literally* described as assembled from what came before.

**Two real problems**, which is why it is not the recommendation:

- **`game/deck.ts` is in `game/`, and the deck's glyphs produce `DECK_WALLS`.** A
  player-placed prop that enters the grid is read by the simulation and can block a station
  or move the walkable path. It is solvable — decorations live in a render-read-only list
  and never touch the lattice — but the safety is a thing to build rather than a thing to
  inherit.
- **The hall is already crowded.** The stations had to be re-spaced once because relic props
  ran into each other's labels, and `tools/smoke.ts` asserts the spawn tile is clear of every
  station's interact radius. Adding player-placed props to that hall invites the problem back.

Two-plus sessions and an ongoing art stream. Worth doing eventually; worth doing *after*
something proves the display-sink appetite.

---

### D. Dive, death and revive VFX

**400–800** each. Safe, no new systems, entirely inside `render/fx.ts`. One hazard worth
stating because it is not obvious: a flashy aura can **obscure a boss telegraph**, and this
game's whole difficulty philosophy is "if a hit landed, it was readable." That can only ever
make a paying player *worse* off, so it is not pay-to-win — but it is a reason to cap
opacity and keep effects off the ground plane where the shapes are drawn.

---

### E. Emotes — and explicitly **not** a marker wheel

**200** each. One new `PartyMessage` variant is the entire wire cost, and it is useless
solo, which is the cleanest possible P2W profile.

Two caveats. The hero has **no emote animation** and the art pipeline is committed to the
21 class heroes, so the real cost is art that does not exist. And §3's own candidate list
pairs emotes with "pings and a marker wheel" — **those two must be separated.** A ping that
marks the last monster is a fix for docket §6, a defect the owner reported and wants
solved; selling it would be charging for a repair. Emotes yes, pings never.

---

### F. More trophy cases

Raise `MAX_TROPHY_CASES` and let gems keep buying up the curve. Hours of work, provably
safe, and the least interesting thing on this list — it inherits §3's ceiling above without
addressing it. Worth doing as a two-line follow-on to A, not as its own item.

---

### The baseline: more cosmetic sets

Not a new sink — more supply for the one that exists — but it is what the owner named
themselves ("cosmetic packs"), it is a permanent pillar, and the Avarice Rift already exists
to fund it. Everything above is *in addition to* the wardrobe, never instead of it.

---

## 5. Recommendation

**Build A (Standards).** Three reasons, in order:

1. **It answers the finding in §3 above.** It is the Trophy Hall's pattern moved onto
   surfaces other players already look at, which is what a cosmetic bought with real money
   needs in order to be worth buying.
2. **The earned half already exists and is already on the wire.** Badges are per class, per
   activity, per tier, per depth, and today they are recorded and shown almost nowhere. The
   feature is mostly a display for data the game already keeps.
3. **Its safety is inherited, not argued.** It takes the wardrobe's byte-identical-sheet
   proof unchanged, and its one genuine hazard — flying a badge you did not earn — closes as
   a structural property with a non-vacuous comparison check behind it.

The sequencing that follows from it: **A first**, with B as A's first render site rather
than a separate feature; **F** as a two-line follow-on; **D** whenever the fx stream has
room; **C** once something has proven players will spend on display; **E** only when the
hero has animation to spare, and without the marker wheel.

## 6. The one to refuse outright

Of everything on §3's candidate list and everything considered here, exactly one should be
ruled out in writing rather than deferred: **a gem-bought marker, ping or tracker that finds
the last monster or the completion portal.**

It fails the structural test (the dungeon reads it), it is a convenience that substitutes
for play, and — most importantly — **it is docket §6.** The owner reported wayfinding and
the lost last monster as things that make the game feel slower than it should. Selling the
fix to a defect the owner has already asked to have fixed is the worst possible shape for a
real-money sink, and it would be very hard to un-ship.
