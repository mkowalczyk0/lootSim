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

## 9. Two more ultimates with the same shape as item 8 — CLOSED, folded into §20

**Closed 2026-09-10 by the owner's own ruling**, recorded in §20's addendum: asked whether
the Reaper and Assassin should be swept, they said yes and called the *mechanic* broken
rather than the three numbers. Both abilities were fixed by §20's threshold, which lives
in the vocabulary rather than on the packets. **Read §20's closing paragraph before
citing this entry as precedent** — the standing rule against pre-emptively rebalancing
classes nobody has complained about survived this sweep intact; what made §20 different is
that the question was put to the owner rather than answered on their behalf. The original
entry follows.

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

## 11. WASD does not reach the shop, or the bottom row of the Hero tab — LANDED

**Shipped 2026-09-10**, merge `2b86f46`. Both dead spots, one cause: `TownUI.update`
sent all four movement keys through a real grid helper only for a hardcoded list of
tabs. Shop was not on it and fell through to a flat list whose left/right cycled the
shop tier; Hero *was* on it, but `navHero`'s layout did not know the relic row, so a
relic cursor silently defaulted to `weapon` and that row was clickable but neither
reachable nor escapable by keyboard. A/D now walk the relic row and picking a relic
opens a picker modelled on the Trophy Hall's, taking the movement keys off a secondary
browse axis. Socketing became a real two-step in the same pass — the old screen would
socket from a candidate row while merely hovering an empty slot. **Unverified in a
browser**, like every UI change in this run. The brief below is kept for context.

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

## 12. The Skills screen should be a grid you click, not a list you scroll through — LANDED

**Shipped 2026-09-10**, merge `6775a18`. The Skills screen took the Stash's shape: a slot
bar above a card grid of the class's whole learnable pool, locked abilities dimmed with
their unlock level, 2-D movement, and a click that sets a skill directly. A/D stopped
cycling a skill in place. `navSkills` mirrors `navStash` rather than inventing a pattern,
and every keyboard path is the literal function a click calls, so mouse support still
costs no second code path. **Unverified in a browser** — `ui/` has no test-harness
coverage and no session on this machine can drive one; the owner's eye is the acceptance
test. The brief below is kept for context.

> "Refactor the Skills UI to use WASD to navigate and view all available skills almost like
> the stash tab. We should be able to set them by clicking rather than awkwardly maneuvering
> using A/D"

The Stash is the shape to copy — a grid of cards, 2D movement, and a click sets the thing
directly. The current screen makes the player walk a cursor along an axis to change what is
in a slot, which is the "A/D spent on a secondary axis" pattern item 11 is also about.

Every keyboard method must stay the literal function a click calls (`src/ui/town.ts`'s
existing `data-index` / `data-action` delegate) — that is how this file has always kept the
two paths from disagreeing, and it is why mouse support never costs a second code path.

## 13. Salvage should be one button, like "sell all junk" — LANDED

**Shipped 2026-09-10**, merge `337ea11`. The marking step is gone; the two-press arm
stays, because salvage is one-way and that gate was never the complaint. "Junk" is
factored into `junkItems()` and read by **both** bulk actions, so "sell all junk" and
"salvage all junk" are the same rule by construction rather than two definitions that
happen to agree today — and worn items cannot be swept up because `junkItems()` filters
the stash, which never holds one. Salvage-all took its own binding rather than
overloading the key that already does one-press sell-all-junk; collapsing the two would
have meant replacing that action outright, which is more than the item asked for. The
brief below is kept for context.

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

## 16. The Trophy Hall prints its own markup — LANDED

**Shipped 2026-09-10**, merge `1ba7aab`. Fixed by adding `pixelImageTag()` and sweeping
**all 13** template call sites rather than only the 2 that were broken — a mistake made
once in a file with 13 chances to make it is a pattern.

**Deliberately not claimed as structural**, and this is the part worth carrying: the
entry below argues for a rule that cannot be violated, and a branded return type would
**not** have delivered one here, because `tsc` does not restrict what may appear inside a
template literal. Real enforcement means moving `town.ts` off string-templated HTML,
which is a much larger change than this bug justified. **Unverified in a browser.** The
brief below is kept for context.

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

## 18. Two more screens can fire a destructive action on a single click — LANDED

**Shipped 2026-09-10**, design record `docs/forge.md` ("The confirm button") and
`docs/memories.md`. Both screens took the §15 shape: `data-altar-item` and
`data-named-recipe` only ever select, and executing is the action strip.

**The strip is now one control, not three copies** — `TownUI.renderActionBar`, whose
button carries a single `data-confirm-action` handled once in the click delegate, and
all it does is call `primary()`: the same per-tab dispatch the `confirm` key uses. A
screen adopting the strip therefore cannot invent a second way to execute, which was the
real risk in doing this a third time.

One thing was extracted rather than copied, on the §10 precedent: `GameState`
`memoryOpBlocker` (and `crystalliseComponents`), because a control that greys itself out
needs the refusal rules and a second copy of them in `ui/` is the drift §10 spent a
branch removing. `applyMemoryOp` calls it. `tools/memories.ts` asserts the two give the
same verdict both ways, and the section documents how to falsify it — the obvious
injection passes *because* the extraction made that direction impossible.

Recall keeps `data-index` deliberately: its rows are rarity tiers, where click-to-fire is
the intent. The brief below is kept for context.

**Follow-on, same day: `forget` got the two-press gate too.** It was flagged as a design
call rather than folded into the fix, and the ruling was yes. The reasoning is that this
item exists because a stray click destroyed something, so leaving one button that consumes
a Memory on a single unconfirmed press answers the report halfway — and now that the strip
is one control, it cost a field and a helper. `TownUI.disarm()` clears `forgetArmed` and
`salvageArmed` together, so a navigation site cannot drop one gate and forget the other.
Red is a colour, not a confirmation.

Found while fixing §15, and unlike §9 this one **is** actionable: it is the same defect the
owner already reported, in two screens they have not happened to click yet.

`src/ui/town.ts` wires one generic click fallback — `[data-index]` → set cursor →
`primary()` — and it is the house idiom, so mechanically every row-rendering tab is one
click from its primary action. **That framing is too wide to act on, and the PM's first
attempt at it ("any screen where `primary()` spends something") was the wrong filter.** For
a chest tier or a rarity row, click-to-fire *is* the intent; the row has no second meaning.

**The test that actually separates a bug from the idiom working: is the row also something
you would click to inspect or select, without meaning to act?** That is what made the Forge
a bug — its cards are a selection surface, you pick an item and then pick an op, so the
click carried two meanings and the destructive one won.

By that test, two screens have the same shape:

- **The Altar's Vault / workbench** (`renderVault`). Rank this first. A Memory card is
  exactly the thing you would click to read its boons and burdens, and `primary()` spends
  Ash on a workbench op or consumes the Memory. `altarMode`/`altarOp` mirror
  `forgeMode`/`forgeOp` exactly — it is the same screen architecture, which is both the tell
  and the reason it is the most likely source of an identical owner report.
- **Named recipes** (`renderNamedForge`). Rows with a full recipe panel beside them, where
  `primary()` calls `craftNamed` and consumes **stash item components**, materials and
  coins. Arguably worse than §15: it can eat a named item you meant to read about.

Judgement calls, deliberately **not** included: the Dive / Tower / Rifts screens (a click
commits you to a run, but spends nothing) and the Shop (a row buys). Both read as "click the
thing to do the thing" and are fine as they are.

Explicitly **not** hazards: the Stash (`primary` equips, and that is reversible), the class
and universal trees (respec is free), and the two places already carved out on purpose — the
Augment loadout slots and the tree cells, both carrying comments saying select-and-fire was
wrong there.

**That carve-out is the fix shape**, and §15 is now a worked example of it: give the row its
own attribute and a select-only handler, and move executing into an action strip of its own,
outside the scrolling grid and outside the reading panel.

## 19. The blow is ONE art problem with global leverage, not 35 boss problems

Split out of §7 on 2026-09-10 after Stage B of the Warden came back a negative result. §7 is
now "give bosses motion"; this is "give bosses the moment the motion is for."

**The finding that creates this item:** three generations, three prompt strategies, from an
on-model apex, on a small simple sprite that had just animated cleanly through idle and cast.
Every attempt that achieved a strike's silhouette change achieved it by **deforming** the
body — legs merging, helmet sinking into shoulders — rather than by posing it.
`boss.war-queen`'s row had already said a real blow needs a hand-authored pose, and that was
read as a remark about one unusually dense sprite. It reproduces on the Warden. So:

> **The generator interpolates and re-renders. It does not pose. A strike's defining moment
> is a pose.**

That reframes the work. A blow is not a per-boss generation task that happens to keep
failing; it is **one hand-authoring problem, and solving it once unblocks every boss in the
game.** The Ferryman's blow is the existence proof that it can be done — but note *how* it
was done: differentiated on body rather than weapon height, and only after the third pose was
put somewhere the generator could reach. That route may not generalise.

**Do not let the roster quietly settle at "wind-up only".** The owner's original report on
§7 was that the wind-ups stop right before the attack and they expected an attack — the word
they used was *"halfway"*. Shipping wind-ups on ten more bosses without ever landing a blow
delivers ten more halves of the exact thing they already told us was incomplete. Wind-ups on
a boss that has **nothing** are a real gain and are the right per-generation value today;
wind-ups as a permanent destination are not.

**Before spending a long hand-authoring session, know what would prove it.** The metric built
for this job — impact-vs-rest exceeding apex-vs-rest — is a **veto, not an acceptance**, and
that is now documented in `docs/animation.md`: it correctly rejected a too-small pose at 1001
against a 1485 bar, and passed a deformed blob at 1735-1745 with the accent intact, because a
deformation *is* a large distance. Both failure modes live at opposite ends of one number, so
no threshold on it can separate them. **The acceptance test for a blow is an eye.**

---

*Added 2026-09-10, late, from the owner playing raids. **This is the highest-priority item on
the list**: it is a second report of an ability already "fixed" once, which means the first
fix answered the wrong question.*

## 20. The Ranger's execute must not fire at any HP — LANDED

**Shipped 2026-09-10**, design record `docs/execute-threshold.md`, harness
`tools/execute-ab.ts`. The threshold is **one constant and one function** in
`src/combat/damage.ts` (THE EXECUTE RULE), called from the single site in `runEffect` that
has ever evaluated the rider — so there is no per-ability field to omit and a rider added
tomorrow by any route is gated for free.

**The scope was thirty-one sites, not three.** `executeMissingHealth` is authored on 14
packets across 8 classes, and 17 tree nodes, mutations and one relic *add* it via
`addExecuteMissingHealth`. That is what ruled out a required companion field: it would have
meant authoring ~31 thresholds, 28 on classes nobody reported, and could be satisfied with
`1.0` anyway.

The rider is a **normalized ramp inside the band** rather than the old term with a gate
bolted on: unchanged at 0 HP, exactly zero at and above the threshold. That is what let the
other 28 riders be reached without being retuned — they keep their coefficients and their
payoff at the kill, and lose only their contribution against healthy targets.

Measured on a **raid** boss, per the brief. Two of the three could not be exercised in a
fight at all — the Reaper's ultimate meter reads 0.000 across a whole Ferryman fight under
bot play, because it charges only from `execute`-tagged hits — so the primary evidence is a
seed-free rider table and the fight A/B speaks for the Ranger. One cast of Death Comes Due
was handing over **16,871 free damage at 80% boss health**, 16% of the bar. Compensations:
Ranger an 8s haste (the owner's own suggestion), Reaper 0.8 → 1.0 (the coefficient's
*meaning* changed), Assassin +base on the finishing blow (bounded by the player's gear, so
it structurally cannot recreate the bug). The brief below is kept for context.

## 20 (brief). The Ranger's execute must not fire at any HP — rework the mechanic, not the number

> "I don't think that ultimate should execute at any HP. Like, it's just insta killing
> bosses, and I'm seeing it at, like, eighty percent health. Like, I'm pushing raids. I
> should not be pushing. So let's just rework that... come up with something else or
> completely remove that... just quadruple the archer's attack speed haste or whatever
> instead."

**§8 sized this and left its shape intact, and the shape is what is wrong.**
`executeMissingHealth` scales with the health a target has *already lost*, with no
threshold, so it contributes at every health value — including 80%, where nothing about
"executing the wounded" applies. Halving the coefficient 0.4 → 0.2 made it weaker everywhere
and still let it fire at full health. That is why the same report came back.

**This supersedes §8's written instruction "Do not remove the execute; size it."** That was a
reasonable reading then; the owner has now overruled it in their own words and put removal on
the table explicitly.

Three things govern whatever gets built:

- **An execute needs a health threshold below which it does anything at all**, and nothing
  above it. A threshold is what makes "wounded" mean something — it preserves the class's
  identity (marking quarry, executing the wounded) *better* than a smaller coefficient does,
  because the coefficient version executes the healthy too.
- **Compensate the class, don't just subtract.** The owner offered attack speed and said "or
  whatever" — take that as direction, not as a literal 4×: they would rather the Ranger trade
  a broken burst mechanic for an honest sustained one than keep a resized version of the
  thing that was wrong. Removing the ultimate's punch without giving the class anything back
  is a gutting, and §8's own constraint against that still stands.
- **Measure it where the complaint happened: a RAID boss.** §8's A/B measured a Delve boss at
  a contested depth, which is a good instrument for the wrong floor — a missing-health
  execute is strongest against the single largest health pool in the game, and the owner was
  pushing raids. An A/B run only where the last one ran can come back green while the
  reported problem is untouched. `docs/ranger-last-hunt-nerf.md` has the method and the
  harness; the floor is what changes.

**§9 is no longer clearly a non-request, and needs the owner's word.** It records two
abilities with the identical shape — **Reaper's "Death Comes Due"** at `executeMissingHealth:
0.8` (four times the Ranger's current term, unbounded) and an **Assassin** ultimate at 0.4.
The previous ruling to leave them alone rested on "nobody has complained." The owner has now
complained about the *mechanic* rather than about one ability's tuning, and the Reaper's
version is strictly worse than the thing they are reporting. **Ask; do not pre-emptively
sweep.** But this is no longer a symmetrical judgement call — a player who takes the Reaper
into a raid produces this exact report a third time.

### §20 addendum — the owner extended it to all three, and that changes where the fix goes

Asked whether the Reaper and Assassin should be swept in the same pass or left until someone
hit them, the owner answered:

> "Yeah. Let's do it for reaper and assassin. Like, I just think this mechanic is a little
> broken at the moment. Maybe we'll come back to it. But for now, yeah, add it to the pass."

**So §9 is closed as a question and folded into §20.** All three abilities are in scope:
`RANGER_THE_LAST_HUNT`, the Reaper's **"Death Comes Due"** (`executeMissingHealth: 0.8`,
unbounded — four times the Ranger's current term) and the **Assassin**'s ultimate mutation
(0.4, unbounded).

**And note what the owner actually called broken: the mechanic, not the three numbers.** That
is a judgement about the vocabulary, so the fix belongs at the vocabulary level in
`src/combat/` — **an execute term that cannot be authored without a threshold** — rather than
three separate patches with the same bug sitting one keystroke away from a fourth ability.
This repo's own standing preference applies exactly: a rule that cannot be violated beats a
check that notices when it was. Three hand-patched abilities leave the hole open; a required
threshold closes it.

"Maybe we'll come back to it" is the owner leaving the door open on the mechanic's future,
**not** an invitation to redesign the execute concept now. Ship the threshold, pay the three
classes back, stop there.

**This sweep was correct because it was asked for. It does not set a precedent.** The
standing rule against pre-emptively rebalancing classes nobody has complained about is still
right and is still in §9's original entry — what made this different is that the owner's
complaint was explicitly about the mechanic rather than about one ability's tuning, and the
question was put to them rather than answered on their behalf.

## 21. A chest pays out 11 items on a 10-pull when a named item drops — LANDED

**Shipped 2026-09-10**, merge `791457d`, gate `npm run chests`. A named drop now fills
the **slot** of the ordinary roll rather than arriving on top of it, so a single pull
returns 1 and a ten-pull returns 10; the comment that called the old behaviour deliberate
was rewritten in the same commit, as the entry asked.

The count promise is **structural rather than data-dependent**: if more than one named
def ever hits the same pull — impossible with today's data, since only one item sources
from a chest — the first fills the slot and the rest are a miss for that pull. That cap
is named as a decision with its alternative in `2789940`, not left as an accident.

The gate walks all ten tiers at single, bulk and augmented pulls with the named roll
rigged to always hit (the `npm run previews` force-the-dice idiom the entry asked for),
and carries a guard that a replacement **actually occurred**, so it cannot pass
vacuously. The brief below is kept for context.

> "whenever you open chests and you get a named item, it returns eleven items versus ten. So
> let's take a look at that and make sure every chest output, including all this new stuff,
> is always outputting ten items. This is on the batch 10 pulls, but I'm assuming it's the
> same bug on single pulls."

**The owner's assumption is right, and this is not a slip — it is a documented decision they
are overturning.** `GameState.openAugmented` (`src/game/state.ts`, the one chest-opening path;
`openChests` is literally this function with an empty loadout) pushes the ordinary roll and
*then* pushes any named drop alongside it:

```ts
found.push(item);
// Named items (UAT §28) ride alongside the ordinary pull rather than replacing it, so
// a chest never pays out *less* for having a table.
for (const def of rollNamedDrops({ kind: "chest", tier }, this.rng)) found.push(this.forgeNamed(def, ilvl));
```

So a single pull returns 2 and a ten-pull returns 11. Deliberate, commented, and wrong by the
owner's ruling: **a chest returns exactly the number of items it promised.** A named item
takes the *slot* of an ordinary roll rather than arriving on top of one — which costs the
player nothing real, since a named item outvalues the ordinary roll it displaces.

**Change the comment in the same commit as the code.** It currently states the opposite
behaviour as intentional, and a stale justification is the exact failure this repo has been
bitten by before: a stale fact misleads, and a stale "this is deliberate" stops the next
person from fixing it.

Three things to get right:

- **The property is count-in equals count-out, and it should become a check**, not a fix
  verified by inspection. Assert it across every `ChestTier`, single and bulk, with the named
  roll rigged to always hit — the `npm run previews` idiom of forcing the dice is the
  precedent. "Including all this new stuff" is the owner asking for exactly this: a property
  that covers chest sources nobody has thought of yet, including augmented pulls and any
  chest row carrying `classElement` / `classAdaptive`.
- **Only chests promise a count.** `Dungeon.dropFromTables` rides named drops alongside
  monster and boss drops, and that is correct there — a kill advertises no fixed number.
  Don't "fix" it. `GameState.craftNamed` returns one item by construction and is also fine.
- **Check whether the §20 drop preview quotes a count** that this changes. The preview must
  keep saying what the roll actually does; if it advertises "10 items" it is about to become
  true rather than false, but confirm rather than assume.

## 22. Enemies and items end up inside walls — and an unstick net for when they do — LANDED

**Shipped 2026-09-10**, merge `1ea6328`. **Both causes this entry predicted were wrong,
and that is the finding worth keeping.** 0 of 188 sampled boss spawns were ever embedded,
and knockback stress-tested to 9,600 (real values top out near 140) produced no
measurable penetration — `resolveCircle` already ran after it.

The actual culprit was `separateEnemies()`/`separateMinions()`, the pairwise **crowd
push**, shoving a body back into rock immediately after that tick's own wall-resolve had
already cleared it, with nothing left in the tick to catch the shove. Fixing that took 43
penetration episodes to 9. A second, rarer contributor surfaced only once the first was
gone: seven spawn-scatter sites threw an offset from a validated anchor through
`resolveCircle` without checking the result actually cleared — `resolveOrFallback`
verifies and retries. Combined: **0 episodes across ~323k ticks**.

The 2–3s unstick net was built second, as the entry directed, and is wired host-only on
its own `embedTimer` (distinct from `stuckTimer`, which rises on ordinary wall-sliding and
is not a bug). It moves a body via a deterministic `nearestOpenPoint` and never touches
health or removal, so the wave quota is safe by construction. **It now activates zero
times in real play, and a future nonzero `unstickCount` is a regression signal rather than
the net doing its job** — a quiet net must not be read as nothing to worry about. The
brief below is kept for context.

> "could we look into enemies spawning in walls? And also, if you have enough knockback, I'm
> also noticing you can potentially knock them back into walls. Maybe we add something where
> if something is stuck in a wall, including items too, because if they die, items get stuck.
> Maybe we add something where if stuck for two to three seconds, it'll just clip into the
> nearest room."

**Do not confuse this with the pathing bug that was fixed this morning.** `docs/campaign-
pathing-bias.md` is resolved and is about a monster **losing its route** while resting flush
against a wall — `FlowField.direction()` returning null. The owner is reporting something
different: bodies and items **positioned inside the rock volume**. A monster with no route is
standing somewhere legal; a monster inside a wall is not. Read that doc so you don't
re-measure a solved problem, then look somewhere else.

**Three named causes, and they are probably not one bug:**

- **Spawning in walls.** The floor is authored on the 32-unit tile lattice and `tools/smoke.ts`
  already asserts that painted rock is exactly the collision volume. So either spawn placement
  isn't consulting the same mask the renderer and `resolveCircle` use, or it places a *centre*
  without accounting for the body's radius — a legal centre one pixel from rock puts a
  24-unit-wide monster half inside it. Check the radius question first; it fits "spawning in
  walls" better than a wholesale mask mismatch would, and a wholesale mismatch would have
  failed the smoke test already.
- **Knockback into walls.** If knockback displaces a body directly instead of resolving
  through `resolveCircle` the way ordinary movement does, that is the bug and it is a real
  one. **Check this before building any net** — a safety net over a knockback that ignores
  collision papers over a defect that will keep producing new symptoms.
- **Items stuck in walls.** Drops land at the corpse's position, so this is largely downstream
  of the first two. Fixing them removes most of it; it does not remove all of it, because a
  body legally overlapping rock at the moment it dies still drops there.

**On the owner's proposed fix — build the net, but build it second.** A 2–3 second unstick
that moves a stuck thing to the nearest walkable tile is a good backstop and the owner asked
for it explicitly, including for items. But a net is a *backstop*, not a diagnosis: land the
causes you can find first, then the net for what remains. **Say in the design record which
symptoms the net is still catching after the fixes** — if it fires often, something else is
still broken and the net is hiding it. Consider counting activations so that stays visible.

Two constraints:

- **The wave director's own monsters are the objective** (`Enemy.fromWave`), so an unstick
  must move a monster, never despawn one — teleporting a body is cosmetic, removing one can
  stall a floor's kill quota.
- **Co-op is host-authoritative.** The unstick belongs in the simulation, so it travels in
  the snapshot like everything else. Don't let a client decide something is stuck.

Any change to `level.ts` geometry or spawn sequencing perturbs the shared rng for every
floor. Run the full `npm run smoke`, not just a targeted check.

## 23. Item level follows the character everywhere — dropped items are still keyed on depth — LANDED

**Shipped 2026-09-10.** The three sites this entry named, plus a fourth found while fixing
them (`forgeNamedItem`'s call inside `Dungeon.dropFromTables` — named items forged from the
clear cache, the Tower's cache and a raid's cache were rolling at `depth + itemPower` too,
same bug), now all roll `ilvl` off `Math.max(1, hero.player.level)` — the receiving hero's
own level, never `profile.depth`. Co-op made "receiving hero" a real question: a kill's drop
rolls off whichever hero's hit killed it (`killEnemy`'s `source`), and the clear cache — one
physical pile the whole party can pick from — assigns each item it rolls to a different
party member round-robin (`dropClearCache`), so a level 20 and a level 50 each find
something wearable rather than everything keying off `localHero`.

§16's `itemPower` axis is kept, not deleted, via a new split: `rollItem` and
`forgeNamedItem` take an optional `powerIlvl`, separate from `ilvl` — `itemPower` feeds
`powerIlvl` alone, scaling a drop's stats/affix magnitude exactly as before, while `ilvl`
(and therefore `requiredLevel`) tracks only the earner's level. Harder content still pays
better; it just never again prices a drop above what the character who earned it can wear.
`docs/reward-curve.md` and the drop-preview copy (`src/data/previews.ts`, which used to
promise "drops roll +N item levels") are both updated to match — the preview must not
advertise an axis the roll no longer expresses.

Verified directly: forcing a level-30 character's clear cache at depth 45 rolled ilvl 45
(`requiredLevel` 44, unequippable) on master, ilvl 30 (`requiredLevel` 29, equippable) on
the fix. `npm run test` green. A/B'd against master in a throwaway worktree on the repo's
own widened 60-seed `CAMPAIGN_SEEDS` (`npm run smoke`, both sides): sharp campaign average
deepest depth unchanged (11.7 → 11.7), reckless nudged up slightly (9.6 → 9.8), the boss
telegraph read/ignore comparison byte-identical (76%/34% eaten, 32.9/14.4 dmg/s, 6.5/2.7
potions/min both sides). The shift is real but small and in the direction the owner asked
for — gear that used to be rolled-but-unequipped (blocked by `requiredLevel`) is now usable,
and a character farming a shallower floor than their own level now gets gear that matches
their level rather than the floor's, the same thing chests already did.

**Deliberately not touched:** `recommendedLevel`'s `depth + itemPower - 1` floor
(`data/depth.ts`) — it used to coincide with a floor's own drops' `requiredLevel`, and that
coincidence is gone now that `ilvl` tracks the character instead. `recommendedLevel` still
stands as reasonable survivability advice on its own terms; retuning player-facing level
advice is a separate balance call from the one this entry asked for, and is flagged, not
made. The paragraphs below are the original brief, kept for context.

> "I did change the logic for the item drops that come out of chests and monster drops
> etcetera, and crafting too... it's based off of the player level, not the depth... So could
> we change that so all item drops, crafting, chest drops etcetera are all based off of the
> player level. I just cleared some memories, and I'm still getting higher level drops because
> the depth was higher. So I'm being punished for doing more challenging stuff."

**Half of this is already done and the owner may not realise it.** `openAugmented`/`openChests`,
`craftItem` and `craftNamed` already read `Math.max(1, this.player.level)` — that was the
owner's own edit and it carries their comment. **What is still keyed on depth is dropped
loot**, in three sites in `src/game/dungeon.ts`:

```
3115   ilvl: this.profile.depth + this.profile.itemPower
3225   ilvl: this.profile.depth
3245   ilvl: this.profile.depth
```

That is the report exactly: clear a Memory at depth 45 as a level-30 character and the drops
roll at item level 45, whose `requiredLevel` (ilvl minus one level of grace) is far above what
the earner can equip. **Doing the harder thing produces gear you cannot wear.**

**The promise to implement: an item that drops for you is an item you can equip.** Gear whose
level requirement exceeds the character who earned it is a punishment for attempting harder
content, which is backwards.

Three things to get right:

- **In co-op, loot is per-hero and physical**, so the level must come from **the hero
  receiving the drop**, not from one notion of "the player". A level 20 and a level 50 in the
  same party should each get gear they can use. Do not reach for `localHero`.
- **This interacts with §16's reward curve and must not silently repeal it.**
  `DepthProfile.itemPower` exists precisely to add item levels for danger
  (`docs/reward-curve.md`), and `rewards.ts` already notes it is "small and hard-capped,
  because item level feeds `requiredLevel`". Harder content still has to pay better — but it
  must not pay in a level requirement the earner cannot meet. **State the rule you land on
  explicitly**, whether that is clamping the requirement, letting item power raise stats
  without raising the requirement, or something better. Do not just delete the term.
- **This is a live balance change to shipped content.** Item level feeds every stat roll, so
  it moves the campaign and telegraph comparisons. Widen the seeds and A/B against master in
  a throwaway worktree; one default `npm run smoke` proves nothing, as this repo has
  documented at length.

`CLAUDE.md`'s per-class-save section describes the chest/craft half of this rule and should be
extended to cover drops **in the same commit as the code**, not before it.

## 24. A Reaper may not be able to charge its ultimate on a raid boss at all

**Not owner-reported. Found while measuring §20, and deliberately not acted on** — recorded
so it doesn't have to be rediscovered, exactly like §9 was.

Measuring the execute threshold's effect at the fight level, the instrument could only see
one of the three classes it was aimed at:

- **Reaper's ultimate meter reads 0.000 across an entire Ferryman fight.** It charges only
  from `execute`-tagged hits.
- **Assassin's peaks at 0.103.**
- Only the Ranger's numbers actually measured anything, which is why §20's fight-level A/B
  speaks for the Ranger alone and the other two rest on the seed-free rider table.

That is real game behaviour rather than a broken detector, and it raises a design question
nobody has reported: **can a Reaper charge its ultimate on a raid boss at all?** A resource
model that only fills from a tag the encounter rarely produces is a class whose ultimate is
effectively absent from the content it was presumably meant for — and `CLAUDE.md` is explicit
that how a class charges its resource *is* the design, not an implementation detail.

**Do not fix this off the back of §20.** Nobody has complained, it is a live balance change
to a shipped class's resource model, and the standing rule against pre-emptively rebalancing
classes on our own initiative applies with full force — §9 is the worked precedent and the
owner's answer there was reached by *asking*. Put it to them.

Worth noting when it is raised: this is also the reason §20's Reaper compensation
(`executeMissingHealth` 0.8 → 1.0) is **reasoned rather than measured**, and that label
should survive into any future conversation about the Reaper's numbers.

## 25. `recommendedLevel`'s equip floor outlived the rule that justified it

**Found while merging §23.** Not a bug the owner reported — a term whose stated reason
was deleted by the change that landed under it, which is this repo's most-repeated
failure shape (`lootsim-numbers-outlive-their-assumption`: the atlas scale, the biome
tint, the mp-stutter figure, now this).

`profileFor` in `src/data/depth.ts` advises a level:

```ts
recommendedLevel: Math.max(
  1,
  d + reward.itemPower - 1,          // <- this term
  Math.round(d * 0.9 * Math.pow(danger, 0.35)),
),
```

That middle term was the **equip floor**, and its comment said so explicitly: loot rolled
at `ilvl = depth + itemPower`, `requiredLevel` is `ilvl - 1`, so advising anything lower
told the player to bring a character who could not wear what the floor paid out.

**§23 repealed the premise.** A drop now rolls at the receiving hero's own level and
`itemPower` feeds `powerIlvl` alone, so *no floor in the game can pay out gear its earner
cannot equip*. There is no equip floor left to defend. lootsim-56 correctly declined to
retune player-facing advice inside a loot commit and flagged it; the stale comment has
been corrected on master already, because a comment asserting a repealed rule is a trap
rather than a tuning question. **The term itself is still there and still untouched.**

### Why it is not obviously wrong, which is the trap

At `danger` 1, `rewardCurve.itemPower` is 0 and the term is just `d - 1` — so every plain
Delve floor advises exactly what it always did, and a green gate says nothing. It only
bites where **danger is up**: the Challenger dial, a deep rift tier, a burdened Memory.
There it inflates "req. lv" for a reason that has been deleted, and `danger^0.35` — the
line directly below it — is already the term that prices danger.

### The question for the owner

Should hard content advise a **higher level** than the same depth does?

- **Yes** → keep a danger term, but re-derive it from difficulty rather than from a dead
  equip rule, and say so in the comment. `danger^0.35` may already be it.
- **No** → drop the term; `recommendedLevel` becomes a pure statement about how hard the
  floor hits, which is what the "req. lv" chip and its `under` warning read as anyway.

**Do not answer this by measurement alone.** It is advice text, not a simulation input —
nothing in `game/` reads `recommendedLevel`; it is six "req. lv" chips in `ui/town.ts`
plus one smoke-test log column. So the smoke test cannot see a wrong answer here, and no
acceptance check will go red whichever way it goes. That is precisely why it needs a
decision rather than a tuning pass.

### Scope note

Whoever takes this: the fix is a handful of lines in one function. The *work* is the
write-up and the owner's call, not the edit. Do not let it grow into a `recommendedLevel`
overhaul — the `0.9 * d * danger^0.35` shape is not under review.
