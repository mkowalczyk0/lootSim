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

---

*Added 2026-09-10, later the same day, from the owner playing the game. These two are
**higher** priority than items 3-6 above: both are direct reports of something wrong in
front of them, which outranks anything queued from a planning conversation.*

## 7. Bosses have no attack animation — FERRYMAN LANDED, and the queue has been reordered

**2026-09-10, later: the §17 diagnosis reordered this item and the raids are no longer
first.** `npm run animcoverage` counted the whole set rather than the three sprites this
entry had been thinking about, and the shape nobody had measured is this:

> **3 of 35 encounters resolve to an animated sprite. The other 32 draw a single static
> frame, wind-up and release alike. All three animated ones are raids, reached only from
> the War Table.** Every boss on the Delve, the Tower and all 21 Provings is static.

So a player climbing either ladder the game is actually built around has never seen a boss
animation at all, which is almost certainly what the owner's item-17 report is: they said
*some* animations were missing, which is what fighting a raid boss and then a Delve boss
looks like.

**The order is now the Delve's own ladder, not the raid roster.** `bossFor` is
`floor(depth / 5) - 1`, capped, and boss floors are every fifth depth, so a player working
the reachable band (13–19, `docs/reachable-band.md`) fights `BOSSES[0]` — the Warden of the
First Seal — on **every single delve run**, then `BOSSES[1]` at depth 10 and `BOSSES[2]` at
15. That is the queue: Warden, then `BOSSES[1]`, then `BOSSES[2]`.

The Nameless was considered and rejected as the next target despite covering depth 25+ *and*
every Proving that borrows it: both sit past the reachable band, and CLAUDE.md's own
class-completion section records that at level 60 most sampled classes cannot beat depth 30
in either flavour. Animating the endgame while the entry ladder is static is the same
mistake one rung further down. **The Tyrant and the War Queen go to the back of the queue**
— they are the second and third encounters of the three that already work.

Cost note, so nobody mistakes the reorder for a free swap: the raid bosses already had
approved rises and casts, so a blow was an increment. The Warden has **nothing** — no cast,
no strike, one static frame. It is a materially bigger job and was chosen anyway on reach.
A staged delivery (the wind-up shipped on its own, the blow second) is pre-approved.

**A release's length must be checked against the depth table, not against
`BOSS_ACTION_GAP`.** `cast` beats `strike` by design, so a release only plays if the
post-cast gap outlasts it — and that gap is not a constant, because `aggression` falls
1.0 → 0.4 with depth while the manifest justifies strike lengths against 1.85s, which is the
depth-1 value. Fourth instance of CLAUDE.md's "a constant that was correct for one rung".
Measured coverage on the floors each raid actually runs on is 74–100%, so only a recovery
tail is trimmed today — but anything over ~0.5s needs the table. It is in `docs/animation.md`.

### The original entry follows.

## 7 (original). Bosses have no attack animation

**2026-09-10: `boss.ferryman` now has a real blow** — rise, the pole swings over the top,
impact, recover, rest. 25 frames, no canvas change (`w`/`h`/`worldScale`/`feet` all
untouched), `cast` and the rise frames byte-identical to what shipped. Method and the two
findings that decided it are in `docs/animation.md` "The blow: where the third pose has to
be"; the per-frame provenance is `art/anim/raw/ferryman-blow/README.md`.

**The finding worth carrying to the other two bosses**, because it is not what this entry
predicted: the impact pose has to be far from **rest**, not merely far from the apex. The
Ferryman rests with his pole already butt-down on the ground, so "slam it down" terminates
on a rest-shaped pose and reads as an unwind however it is prompted — which is the
mechanical reason the old release settled. Differentiate the impact on **body** (stance,
lean, trailing cloth), and check it as a comparison: impact-vs-rest must exceed
apex-vs-rest, or it cannot read as a strike. It measured 2378 vs 2306 here.

**Still open: `boss.war-queen` and `boss.exiled-tyrant`.** Both remain rises and their
manifest rows say so. The War Queen is the known-hard one — every generated attempt at
real overhead arms came back off-model (forearms as detached tubes), and her kit is things
that arrive from the sky rather than things she swings, so a commanding gesture may
genuinely be the right release for her. The Tyrant lifts a sword and is the better next
target. Ship them one at a time; the owner asked for a batch review in the running game
and said "acceptable is okay".

The original entry follows, and all of it still applies.

> "Not seeing attack animations on bosses - could you add that to the docket?"

**This is the third time the owner has raised this and the second time it has been
misread. Read this whole entry before touching anything.**

The history matters because it is the reason this is still open. The owner first said the
boss animations looked *"halfway done"*. Two sessions took that as a report that the
wind-up frames themselves were defective, built a measurement tool, calibrated it, went red
on all three shipped strips and designed a regeneration plan around it. Then the owner
clarified:

> "the windups last frame stops right before the attack. it looks good, my comment was that
> i was expecting an attack but it seems like that wasnt the intention here. the wind ups
> look really good. thats what i mean by 'halfway'"

So the wind-ups are **approved art**. What is missing is the blow that should follow them.
Do not re-measure the wind-ups. Do not regenerate them. See
`docs/anim-method.md` and the memory of that episode: a metric that fails art the owner
likes is not a defect.

**The repo already knows this and says so out loud.** `src/render/atlas/manifest.ts` carries
the comment, above the boss rows:

> **The art in `strike` is a RISE, not a blow — read this before assuming it is done.**

Three bosses have a `strike` tag wired, resolving through `STRIKE_TAG` and the
`[ability, "strike", "idle"]` chain in `src/render/anim.ts`, with `cast` beating `strike`
always. **The wiring is done and correct; the art in those frames is the wrong art.** The
Ferryman and Tyrant rises that landed 2026-09-10 are the *top* of the motion — the pole
raised, the sword overhead — which is what makes the absence of the downswing more
conspicuous, not less.

So the task is narrow and well-supported: **author the blow.** The frames that come after
the wind-up's last held frame and before the return to idle. Everything needed already
exists — the tag chain, the latch, the padded canvases with real headroom, the rest-file
substitution trick for a byte-identical hand-off back to idle, and the accent-preservation
scripts (`art/anim/target-accent.py`, `art/anim/repair-split-accent.py`).

Two traps recorded from the rises work, both of which nearly cost good animations:

- **Silhouette XOR over body area under-reports a thin feature.** The Tyrant's sword going
  from low to overhead is the most dramatic pose change of the three bosses and scores
  8-12%, *under* `windup-check`'s 25% fidget bar. A downswing is the same shape of motion
  and will read the same way to that instrument. Do not judge a blow by it.
- **Judge a seam against the animation's own steps, not against zero.** The cast→strike
  hand-off measures 458 and 522 and looks like a pop on a contact sheet; consecutive steps
  *inside* those same animations run 518-930 and 274-1801. There is no pop.

`npm run windup` is a printed diagnostic, deliberately not a gate, for exactly the reason
above. The owner's eye is the acceptance test.

## 8. Nerf the Ranger's ultimate, "The Last Hunt" — LANDED

**Shipped 2026-09-10**, design record `docs/ranger-last-hunt-nerf.md`. Both symptoms had
separate causes in `RANGER_THE_LAST_HUNT` and got separate, minimal fixes: `shape: {
radius: 350 }` bounds the mark/volley to a real radius instead of the whole floor, and
`executeMissingHealth` halved (0.4 → 0.2) so the execute term stops being able to burn 40%
of a boss's remaining health bar per hit. A/B'd in a throwaway worktree against master, 24
seeds each side: reach confirmed bounded at exactly the declared radius (master hit a target
1200u away; patched left it untouched), boss time-to-kill up 15% on a shallow calibrated
floor and 49% on a deeper, genuinely-contested one (more runs also survived to clear under
the patch). `npm run test` green. Elites-only targeting (the literal tooltip reading) was
considered and rejected — elites are capped to 0 on most early floors, so it would have zero'd
the ultimate's damage on most trash floors rather than sizing it down. The paragraphs below
are the original brief, kept for context.

> "nerf the rangers ultimate ability 'the last hunt' - its a tad overpowerd and wipes the
> entire map and bosses way too quickly."

Note the owner named **two distinct symptoms**, and they have two distinct causes in
`src/progression/ranger.ts` (`RANGER_THE_LAST_HUNT`). Fixing one will not fix the other.

**"Wipes the entire map"** — the damage effect is `to: "enemies"`, unbounded. Every enemy on
the floor, no cap, no falloff, no line of sight. Note that the ability's own description
promises something much narrower: *"Mark every elite in sight as quarry, vanish, and loose
one precision shot at each in sequence."* **The implementation is more generous than the
text the player is shown** — it hits everything, not every elite, and not in sequence. That
gap is a strong hint at intended design: the honest fix is likely to make the ability do
what it already says it does, rather than to invent a new limit.

**"And bosses way too quickly"** — `executeMissingHealth: 0.4` on a `base: 3.4`
`scale: "attack"` packet with `canCrit: true` on the `ultimate` channel. An execute term
scales with the health already gone, which is precisely the term that deletes a single
enormous body; a boss is the one target in the game with enough health for 40% missing-health
to be a huge number. This is the boss half, and it is separate from the target count.

Constraints on whatever gets built:

- **"A tad overpowered" is a nerf, not a gutting.** The class's identity is marking quarry
  and executing the wounded, and the ultimate should still feel like the last thing a very
  large monster hears. Do not remove the execute; size it.
- **This is a live balance change to a shipped class.** A single default `npm run smoke` run
  cannot show the delta — the shared rng reshuffles every dive, so a one-run before/after is
  noise. Widen the seeds and A/B against master in a throwaway worktree.
- **Measure both symptoms separately**, because they have separate causes: trash-clear on an
  ordinary floor, and time-to-kill on a boss. A change that fixes the map-wipe and leaves
  the boss deletion intact has solved half the report.
- Check `RANGER_PROGRESSION` for tree nodes that scale it further before assuming the base
  numbers are the whole story — `the_last_hunt.packet` is a declared mutation hook, and
  Winter's Quarry adds a freeze plus a shattering nova chain on top.

## 9. Two more ultimates with the same shape as item 8 — NOT owner-reported

**Nobody has complained about these.** They are recorded because they were found while
fixing item 8 and would otherwise have to be rediscovered. Do not treat this as a request.

Fixing the Ranger's "The Last Hunt" turned up two abilities carrying the same two
ingredients that made it a problem — an unbounded `to: "enemies"` (field-wide by the
runtime's convention when no `shape.radius` is given) combined with a large
`executeMissingHealth` term:

- **Reaper — "Death Comes Due"**: `executeMissingHealth: 0.8`, unbounded. Twice the Ranger's
  original execute term, which was itself halved to 0.2.
- **Assassin** — an ultimate mutation with `executeMissingHealth: 0.4`, unbounded.

Deliberately untouched. The owner reported one ability, and quietly rebalancing two more
classes off the back of it is how "a tad overpowered" becomes a week of work and a save
migration. **The right move is to ask the owner whether they want these looked at, not to
pre-emptively nerf classes they have not complained about** — they may well be fine in
play, and the Ranger's numbers were only confirmed as a problem because a person hit them.

If it is picked up, `docs/ranger-last-hunt-nerf.md` has the method: measure the two symptoms
separately (trash-clear reach, and boss time-to-kill at a *contested* depth where neither
side is saturated), and A/B against master on widened seeds in a throwaway worktree.

---

*Added 2026-09-10, evening, from the owner playing the game. Items 10-17. **These are all
direct reports of something wrong in front of them**, so by the ordering this file already
establishes they outrank items 3-6 and item 9. Items 16 and 17 are outright bugs — a screen
printing its own markup and art that does not appear — and lead the group.*

## 10. The Forge workbench needs to show the *pool* — LANDED

**Shipped 2026-09-10**, design record `docs/forge.md` ("The possibilities panel"), gate
`tools/forge.ts` §10 (in `npm run forge`, in `npm test`). `forgePossibilities` in
`game/forge.ts` answers it per op, and holds no table of its own: `modPoolFor`,
`recastPool`, `augmentPool`, `inscribePool`, `TRIGGER_SHAPES` and `affixRange` are the
same functions the ops roll through — three of them extracted for exactly that reason.
The gate asserts the panel's set and the roll's set are **equal**, both directions,
and both directions were shown red by injection. The brief below is kept for context.

> "New UI in the Forge under the workbench view to show 'possibilities' of the reforge. We
> as players need to see what the available pool of affix's are if we recast etc."

Standing in front of Recast, Augment, Reforge or Awaken, the player is asked to spend Ash on
a roll whose outcome space is invisible. Show the pool.

**The rule that governs this is the §20 drop-preview rule and it is not optional: the
preview holds no table of its own.** `docs/drop-previews.md` and the `previews.ts` header
both say why — a preview that can drift out of sync with the real roll is worse than no
preview. The pool shown here must be read from the same `ModRoll` list, the same
`ModRoll.minTier` rarity gates and the same slot/category filters that `game/forge.ts`
actually rolls against. If the panel and the roll can ever disagree, the panel is wrong by
construction. No lookup table in the UI.

Each op has a genuinely different outcome space and the panel has to say which one it is
showing — Recast swaps *one* affix from the pool reachable at that item's rarity and slot,
Augment adds one and is bounded by `MOD_COUNTS`, Reforge rerolls the whole list, Temper
moves one value inside `affixRange`, and Inscribe/Awaken draw from the granted-skill and
trigger tables behind their own rarity gates. A single generic "here are all affixes" list
would be a wrong answer four times out of five.

## 11. WASD does not reach the shop, or the bottom row of the Hero tab

> "WASD in the shop and on the bottom row of equipment (artifacts/relics/helmet/boots/
> off-hand) in the hero tab doesn't work"

Two separate dead spots in keyboard navigation. The Hero tab's equipment is laid out as a
grid and the bottom row (artifacts / relics / helmet / boots / off-hand) cannot be reached;
the Shop screen does not take movement keys at all.

This is the third time a grid-shaped screen has turned out not to navigate like a grid.
**The owner's standing expectation is that anything that looks like a grid navigates like
one, in 2D, with the movement keys** — and that A/D are not spent on a secondary
adjust/filter axis. Fix the navigation, and prefer fixing whatever shared cursor helper
these screens go through over patching each screen's key handler; two dead spots in one
report is a hint about a common cause.

## 12. The Skills screen should be a grid you click, not a list you scroll through

> "Refactor the Skills UI to use WASD to navigate and view all available skills almost like
> the stash tab. We should be able to set them by clicking rather than awkwardly maneuvering
> using A/D"

The Stash is the shape to copy — a grid of cards, 2D movement, and a click sets the thing
directly. The current screen makes the player walk a cursor along an axis to change what is
in a slot, which is the "A/D spent on a secondary axis" pattern item 11 is also about.

Every keyboard method must stay the literal function a click calls (`src/ui/town.ts`'s
existing `data-index` / `data-action` delegate) — that is how this file has always kept the
two paths from disagreeing, and it is why mouse support never costs a second code path.

## 13. Salvage should be one button, like "sell all junk"

> "The salvage feature in the Stash UI needs to function like the 'sell all junk', press one
> button to salvage all the stuff."

The mass-salvage batch already exists (`toggleMarked`, `salvageArmed`, `GameState.salvageItems`)
but it makes the player mark items one at a time first. "Sell all junk" is the interaction
the owner wants and it is already in this screen — mirror it.

**Keep the two-press arm.** Salvage is one-way and the arm gate is deliberate; the ask is to
remove the *marking*, not the confirmation. And "all the stuff" needs a defensible
definition — "sell all junk" already has one, so use the same one rather than inventing a
second notion of junk. Equipped items must not be swept up by a bulk action even though
salvaging a worn item is legal when chosen deliberately.

## 14. The Forge needs the green-up / red-down arrows the Stash has — LANDED

**Shipped 2026-09-10.** `TownUI.upgradeMark` is the Stash's own comparison, extracted so
both grids call one function; there is still exactly one scoring path (`itemScore`, which
already knows about weapon affinity). A worn card keeps its `WORN` badge in that corner.

> "In the Forge UI we need to add the 'better/worse' visual to all the items green up red
> down arrows."

The Stash's upgrade arrows already know how to compare an item against what is worn
(including the weapon-affinity term). The Forge's item lists do not show them, so the
player picking something to Reforge cannot see whether it is an upgrade. Reuse the Stash's
comparison — do not write a second scoring path.

## 15. The Forge needs a confirm button — LANDED

**Shipped 2026-09-10**, design record `docs/forge.md` ("The confirm button"). The cards
carried `data-index`, and this UI's generic row handler both selects and calls
`primary()`; they carry `data-forge-item` now, which only selects. Executing is one
control in a `.wb-actions` strip of its own — outside the scrolling grid and the reading
panel — calling the same `workbenchConfirm` the confirm key calls. Salvage's two-press
gate runs through that button rather than a private path.

> "In the forge UI we need to also add a 'confirm button' to execute the action. There a
> weird bug where you have to be careful not to click the item itself with a mouse as it
> will just execute the action. Essentially some people on mouse want to click the item
> without it executing the action in the reforging."

A destructive, Ash-spending operation is currently one stray click away. Selecting an item
and executing an op must become two distinct acts: clicking a card selects it, and a
separate confirm control spends the resources.

**This is the owner's third report in this family and the direction behind it is settled:
action controls belong in their own fixed region, not mixed into the scrolling list or the
reading panel that describes the item.** Put the confirm control in a compact action area
of its own. The existing `salvageArmed` two-press gate is the precedent for what "confirm"
means here; the salvage path should end up going through the same control rather than
keeping a private one.

## 16. The Trophy Hall prints its own markup — BUG, and it is two lines

> "trophy case only showing string literal file paths 'data:image/png;base64,iVBORw0KGgo...'"

`pixelImageFit` returns a **bare data URL**, not an `<img>` tag — every other call site in
`src/ui/town.ts` wraps it (`<img src="${...}" alt="">`). `renderTrophy` does not, in both of
its lists: the case grid and the stash picker. So the base64 string is interpolated straight
into the HTML and rendered as text.

Worth a moment's thought beyond the two-line fix: this is a function whose return type
(`string`) cannot distinguish "a URL" from "some markup", which is why a caller could get it
wrong silently and why `npm test` had nothing to say. A rule that cannot be violated beats a
check that notices — see the CLAUDE.md passage on `SpriteName` and `worldScale`.

## 17. Some boss animations are not coming through

> "Some boss animations are not coming through"

Reported from play, and it belongs with item 7 rather than replacing it. **Diagnose before
authoring anything.** "Not coming through" can mean at least three different things and they
have unrelated fixes: a boss whose `strike`/`cast` tag is absent from its manifest row and
so falls back down the `[ability, "strike", "idle"]` chain; a tag that exists but is never
*reached* at runtime because the encounter's cast window is shorter than the animation or
because `cast` beats `strike` in a case nobody intended; or art that simply was never
authored for that boss. Establish which bosses the owner is actually seeing this on, and
which of the three causes each one has, before generating a single frame.
