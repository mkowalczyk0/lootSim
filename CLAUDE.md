# lootSim — Ashes of Purgatory

A top-down ARPG loot grinder. Originally a Tkinter "click to open chests" gambling
simulator (`legacy/lootGame_1.2.0.py`); now a real, playable action game in the browser.

## Stack

- **TypeScript + Vite**, no runtime dependencies.
- **HTML5 Canvas 2D** for the dungeon (the action).
- **DOM/CSS** for the town (menus, inventory, equipment, chests). Menu-heavy UI is
  far cheaper and nicer in DOM than hand-rolled on canvas — don't rebuild it in canvas.
- **Sprites are procedural**: pixel grids defined as string arrays in
  `src/render/pixels.ts`, baked into offscreen canvases at boot by `src/render/sprites.ts`.
  There are **no binary art assets** and we want to keep it that way. To add art, add a
  grid + palette.

```
npm install
npm run dev       # http://localhost:5173
npm run host      # same, on 0.0.0.0 — how you play multiplayer with people nearby
npm run build     # typecheck + bundle to dist/
npm run check     # typecheck only (tsc --noEmit)
npm run test      # the full acceptance gate — see package.json for the exact chain;
                  # currently markers+check+vocab+prog+classes+roster+rules+universal+named+
                  # legends+forge+previews+world+itemart+relics+deadpaths+smoke
npm run smoke     # headless simulated play (tools/smoke.ts) — run after any balance change
npm run art       # render every sprite to a contact sheet (tools/artsheet.ts) — look
                  # at it after touching a grid; the smoke test only catches ragged rows
npm run roster    # full class-roster + anti-overlap audit (tools/roster.ts)
npm run universal # sanity + balance checks on the Universal Skill Tree (tools/universal.ts)
npm run legends   # the Proving (class completion) + the only structural audit of the
                  # boss rules in the repo (tools/legends.ts) — part of npm test
npm run forge     # the Forge workbench, Ash and multi-item recipes (tools/forge.ts) —
                  # asserts the crafting economy as comparisons; part of npm test
npm run named     # named-item definitions, acquisition table, save/wire, live passives
                  # (tools/named.ts) — part of npm test
npm run previews  # drop previews (tools/previews.ts) — proves a preview lists exactly
                  # what the real roll can produce; part of npm test
npm run itemart   # one item, one picture (tools/itemart.ts) — UAT §11's "same item
                  # everywhere" as a property; part of npm test
npm run world     # the world structure (tools/world.ts) — UAT §23's layers and §21's
                  # ascent as properties: the bands tile both ladders, every mode says
                  # where it happens, a layer edge is a boundary the Delve already had,
                  # the Reliquary's second unlock route only ever widens, the Tower walks
                  # the Delve's own curve height-for-depth, and a height is never written
                  # into a depth record; part of npm test
npm run relics    # relics and artifacts: the roster, rule 3 as a test, the drop table,
                  # slots, save/wire, live drop sites (tools/relics.ts) — part of npm test
npm run rewards   # the reward curve (tools/rewards.ts) — UAT §16's "harder pays better",
                  # including that it stays neutral at ordinary danger; part of npm test
npm run markers   # refuses to let a committed conflict marker survive (grep, no build) —
                  # runs first in npm test; added after two merges shipped live markers
npm run check:tools # typechecks tools/ against tsconfig.tools.json — the acceptance gate
                  # itself went unchecked for most of the project's life, because
                  # `include: ["src"]` is the vite default and esbuild strips types
                  # without checking them. `src` deliberately keeps `types: []` under its
                  # own config, so the game half still cannot see Node's globals
npm run deadpaths # sweeps every class for abilities whose targeting/effects never
                  # resolve (tools/deadpaths.ts) — part of npm test
npm run builds    # build-differentiation gate (tools/builds.ts) — deliberately
                  # excluded from npm test; currently red for a known set of classes
                  # pending owner tuning calls, so don't fold it in to "fix" the red
npm run relay     # the party relay alone, for serving a built dist/
```

`tools/smoke.ts` plays real dungeon floors with a scripted bot, headless — no browser,
because `game/` is DOM-free. **Run it after any balance change.** The bot dodges
telegraphs, casts what it has, and retreats when hurt, so it measures the game a real
player experiences rather than a synthetic average. It runs sharp-vs-reckless campaigns,
a raid boss with telegraph-reading on and off, a full Avarice Rift, and validates every
generated floor (reachable portal, hazard placement, and — since the tile-lattice pass —
that painted rock is exactly the collision volume, not an approximation of it). It also
plays co-op end to end with a real host and client in one process, walks every sprite
grid and cosmetic for drawability, and exercises planets, crafting and the Challenger
dial. The file itself is the current, authoritative list of what's covered — read it
before assuming a check exists or doesn't; this doc won't enumerate it and go stale
again.

**A lesson worth keeping**: in Sept 2026 the sharp-vs-reckless campaign silently
inverted (the reckless bot reaching deeper than the sharp one) while every check stayed
green, because each side only bounded its own number and neither was ever compared
against the other. A loose one-sided threshold doesn't prove a design promise; a
comparison does. If you write a new check for "X should beat Y", assert that directly.

## The game loop (this is the design; respect it)

Pick a class → the ship → walk to a portal or a terminal → **dive** → fight waves of
auto-spawning monsters → collect loot → **fill the floor's kill quota** → leave through
the **completion portal** it opens (banks everything), or **bail out** through the
entrance portal (keeps a sliver of the coin, forfeits the items), or **die** (lose all
unbanked loot, keep the XP) → back at the ship: open chests, equip upgrades, spend tree
points, pick skills, sell junk, craft, deck out the wardrobe → dive again.

Depth is the difficulty dial. Each depth scales enemy HP, damage, count and speed, tightens
their attack telegraphs, adds hazards, and shifts the loot rarity weights upward. Clearing a
floor offers **descend** (deeper, richer, more dangerous) or **extract** (bank it). Every 5th
depth is a raid boss floor.

Risk/reward is the point: unbanked loot is lost on death. Never make death free.

### The floor objective and the two portals

`src/game/dungeon.ts` (`killsRequired` / `killsSoFar` / `elitesRequired` / `elitesKilled`,
`floorQuotaMet`, `completionPortal`, `earlyExtractLoot`). A floor is finished by
**clearing it**, not by reaching an exit.

- **The objective is a kill quota**, shown in the HUD as `Monsters 34/92 · Elites 1/2`.
  `killsRequired` is every monster the wave director will spawn and `elitesRequired` is
  0–1 by default and more under Challenger, clamped to `eliteCapForFloor()` so it can
  never ask for elites the floor can't make. If the last wave is running out of bodies
  with elites still owed, the director **forces** them so the objective can't stall on a
  bad roll — `spawnBurst` decrements its remaining count per monster, not once per burst,
  specifically so that forcing logic sees the true count (a Sept 2026 bug: a frozen
  per-burst count let the debt outlive the burst that was supposed to pay it off). A boss
  floor's quota is its boss.
- **Only the wave director's own monsters count** (`Enemy.fromWave`). A summoner's chaff
  and a Splitting monster's shards can neither pad the objective nor hold it open.
- **Two portals.** The *entrance* portal is where you came in; it stays all floor, never
  descends, drawn dim amber. The *completion* portal spawns at a fresh spot the instant
  the quota is met and is the way onward; the clear cache drops around it, not the
  entrance.
- **Bailing out is expensive** (`EARLY_EXTRACT_KEEP` in `data/modes.ts`, 15%). Leaving
  through the entrance with the quota unmet forfeits every unbanked item, key and
  material, keeps a sliver of coins and gems, and never touches XP. **Don't soften
  this** — it's the whole risk/reward decision the floor exists to create.
- **Co-op stays host-authoritative and the wire barely moved**: the snapshot gained two
  counters (`kq`, `ek`) and the completion portal's position; both ends *derive*
  `killsRequired`/`elitesRequired` from the `RunConfig` they already share.

### The ship: portals instead of menus

`src/game/hub.ts` (simulation) and `src/render/hub.ts` (drawing) are the home base, and
they're a small explorable canvas scene, not a screen of menu rows. Every non-combat
system is reached by walking up to a **station** and pressing confirm, Diablo-portal
style: the Delve, the Abyssal Rift and the Avarice Rift each stand as their own permanent
portal; a **Star Map terminal** configures a planet expedition and spawns a portal for
it rather than diving immediately; **the Forge** is where materials get crafted into
gear; **the Quartermaster** is the door into everything that's still a DOM screen —
stash, equipment, skills, the tree, style, capsules, records, settings. A **Comms Relay**
terminal is where a co-op room is opened or joined; once in a room, whichever portal the
host walks into and confirms — the Delve, a rift, the Reliquary — becomes the party's
ready spot for as long as that plan stands. `Esc` backs out of any of those all the way
to the ship, the same key that pauses a dive.

`src/ui/town.ts`'s `TownUI` still owns every one of those DOM screens exactly as before
— the original call that menu-heavy UI belongs in DOM, not canvas, hasn't changed. What
changed is *how you arrive*: `Dive`, `Rifts`, `StarMap` and `Craft` are opened only by
`TownUI.show(tab, riftMode?)` from a specific hub station and are pulled out of the
ordinary `[I]`/`[O]` tab cycle (`CYCLE_TABS` in `town.ts`) so they can't be browsed to
sideways; the rest of the tabs cycle exactly like they always did once you've walked up
to the Quartermaster.

### Run modes: the delve, the tower and the rifts

`src/data/modes.ts` owns how a run is configured, and every mode goes through the same
difficulty curve — a mode hands `profileFor` an effective depth plus a `danger`
multiplier and the curve does the rest. One curve, several ways of walking up it.

- **The Delve** — the original ladder. One floor at a time, no upper bound, descend or
  extract after every clear.
- **The Tower** — the same ladder pointed the other way. One floor at a time, no upper
  bound, climb or extract after every clear. See its own section below.
- **Abyssal Rift** — four floors and a boss, opened at a tier you choose. Brutal, and it
  pays in *rarity*: bends the loot table hard toward the top end, gives little else.
- **Avarice Rift** — three floors and a boss. A step easier, pays in *volume*: coins, keys
  and a pile of drops you'll mostly sell.

A rift's difficulty is **exponential in its tier** (`dangerPerTier ^ (tier - 1)`) rather
than linear in depth, which is what makes the ladder eventually stop you. Clearing a
rift's boss opens the next tier; extracting early keeps your loot and opens nothing.
That asymmetry is the whole tension of a rift — don't soften it.

**A rift is a consequence of the war, not a game mode with a portal on it** (UAT §22).
Every `RunMode` carries two lines: `blurb` is the mechanics, `lore` is why the place
exists — a wound where Heaven and Hell met, an Avarice Rift the scavengers got to first,
an Abyssal Rift that tore through Hell and kept going. The lore is lifted from
`docs/game_story_worldbuilding.md` (read-only, the tiebreaker) in the game's deadpan
register, never invented; `RIFT_LORE` is the one sentence said once about all of them. It
reaches the player on the Dive / Rifts / Reliquary / Vigil / Convergence asides and under
the deck's portal prompt (`stationLore` in `game/hub.ts`), and `npm run previews` checks
each line names the war rather than restating the payout. Don't put lore in a third place
with its own copy of the text — read `MODES[id].lore`.

**The world is layers, and there is one table of them** (UAT §23). `src/data/layers.ts`
reads the depth ladders that already exist as named bands of the war: the Delve descends
Surface → Deep Delve → Hell Layers → Hell Endgame, and the ascent §21 built climbs
Tower Base → Heaven Layers → Celestial Endgame; every rift and the Reliquary sit off both
in the Threshold. `layerFor(config)` is the one answer for any `RunConfig`, exposed on
`DepthProfile.layer` so the HUD and every commit screen read it rather than re-deriving
it. **Nothing in the simulation reads a layer** — `profileFor` still takes an effective
depth plus a `danger` and the one curve does the rest, and the band edges sit exactly on
the five-depth boundaries `biomeFor` already changes at, which is what makes this a
reading of the ladder rather than a second one. A layer's `lore` answers a different
question from a mode's: the mode says *what this place is*, the layer says *where in the
war it sits*, and `npm run world` fails a layer line that restates a mode line. A
Reliquary sector now opens by **either** the travel ladder **or** the account frontier
(`GameState.frontier`) reaching its `baseDepth` — widening only, so no save can lose
access. `WorldLayer.raidId` is a reserved, null seam for §15: a raid is the thing holding
a layer's gate, and the acceptance tool refuses a non-null id until a raid table exists.

**The Tower is the Delve's mirror, on the Delve's own curve** (UAT §21). Heaven descended
and is still ordering the wound one perfect floor at a time; climbing it passes Lower
Tower → Seamless Halls → Blinding Heights, the art guide's §6 bands sitting exactly on the
`UP_LAYERS` edges. `src/data/tower.ts` owns the whole ascent — three `BiomeStyle`s, a
renamed roster per band drawn from the Celestial Hierarchy, five bosses reskinned from
existing encounters per the `planetBossSpec` precedent, and `towerConfig(height)`, which
is `delveConfig` with the mode swapped: **effective depth = height, `danger` 1**. There is
no second difficulty curve and there must never be one — `npm run world` asserts that
height *N* and depth *N* produce identical `enemyHealth`, `enemyDamage`, `enemySpeed`,
`aggression`, `telegraph` and `recommendedLevel` across 1–60, so "balancing the Tower" by
nudging its own numbers goes red immediately. What makes the climb a different place is
*where* it is, not what the numbers say: its own biomes, its own encounters, holy as the
local element, and its own rewards.

**A height is not a depth.** The Tower keeps `stats.highestHeight` and
`Player.highestHeight` separate from the two `deepestDepth` records, written only by
`recordHeight` — which `recordDepth` dispatches to as its first statement, before any
depth write, so a banked tower floor can never open a rift tier or qualify a class for the
Proving. `GameState.frontier` and `Player.frontier` are the max of a side's two records:
the account frontier is what `universalPointsFor` reads (a climb pays for the basics), the
per-class one is what both item-level sites read (an alt still rolls off its own
progress). The Tower's *own* gate is the descent's — account `deepestDepth` 5 — so the
climb can't unlock itself, and `maxUnlockedHeight` is its ladder after that. The tower
tilesets are named on the biomes but deliberately absent from `TILESETS` until the sheets
exist; `atlasTileset` returns null and the floor falls back to `bakeFloor` in the §6
palette, because declaring an id whose PNG isn't committed would fail `npm run smoke` and
claim art the repo doesn't have.

**The Vigil** (UAT §17 v1) is a daily one-floor mode, unlocked at `deepestDepth` 6: the
seed, depth (band 6–14), two modifiers and the guaranteed key-tier reward all derive from
the UTC day number, so it's the literal same floor for everyone who plays it that day.
Clearing it (a credited bank, not a death or bail-out) marks the day closed on
`GameState.daily.clearedDay`; retries are free until then. Solo only for now. See
`src/data/daily.ts` and `docs/daily-dungeon.md`.

**The Convergence** (UAT §17 v1) is the Vigil's harder sibling: a weekly, four-floor run
ending in a boss, unlocked at `deepestDepth` 12. Same idiom, scaled up — the base seed,
the depth band floors 1-3 draw from and escalate through (12–16), three modifiers and
the guaranteed reward tier all derive from the UTC week number, and each floor mixes
that base seed with its own floor index so all four are distinct. **The boss floor (4)
deliberately does not continue that escalation**: it draws its own depth from a separate,
much shallower band (9–11), because a `tools/smoke.ts` survivability pass (a real fight,
not the reward-plumbing check) found that a raid boss at the same depth as an escalated
trash floor is dramatically harder, not incrementally harder, and that this isn't
specific to the Convergence — the delve's own depth-15 boss is close to unbeatable for
the same characters that clear a depth-15 trash floor without much trouble. That gap is
the same "far beyond the measured frontier" finding the Proving section below hit
independently; the Convergence sidesteps inheriting it rather than trying to close it. It
pays in the two chests the Quartermaster otherwise only sells outright (Adept's Trove,
Collector's Hoard), guaranteed on the boss floor only. Clearing it (a credited bank on
the boss floor, not a death or bail-out, and not an intermediate floor either) marks the
week closed on `GameState.weekly.clearedWeek`; retries are free until then. Solo only for
now. See `src/data/weekly.ts` and `docs/weekly-dungeon.md`.

### Raids: the war's set pieces, and the only place their loot exists

`src/data/raids.ts` (UAT §15), design record `docs/raids.md`. Four encounters, every one of
them lifted from the worldbuilding doc's own EXAMPLE RAID BOSSES rather than invented: **the
Ferryman** (Threshold, cold), **the Queen of the Seventh Circle** (Hell Layers, fire), **the
Minotaur of the Ninth Labyrinth** (Hell Endgame, void) and **the Tyrant of the First
Heavens** (Celestial Endgame, holy). Reached from a **War Table** terminal on the deck, which
picks a raid and a tier and spawns a Raid Portal — the Reliquary Gate's exact shape.

- **One floor, and that floor is the boss.** A gauntlet in front of the encounter only taxes
  retrying the thing that is meant to be extremely difficult. `lastFloor` already pays the
  cache 2.4×, so it still pays like a run.
- **No second difficulty curve.** A raid tier compounds `danger` and goes through the same
  `profileFor`. `tools/raids.ts` compares a raid floor against a Delve floor at the same
  depth and danger across six stats — the Tower's height-for-depth property from the other
  side, so "balancing a raid" by nudging its own numbers goes red immediately.
- **The encounter is borrowed and reskinned** per the `planetBossSpec` precedent, then
  rebuilt strictly cumulative per `legendBossSpec`, with its stat line measured against the
  **deepest authored encounter** rather than the borrowed template. No new `BossAbilityId`.
  All four pass the boss-rule audit with zero violations.
- **§16 two ways and only two.** Drop chance/count/item power/variants come from
  `rewardCurve(danger)`. Rarity is **not** a second curve keyed on danger — that would route
  around the Challenger cap — so the rarest half of each table is gated behind `minTier`:
  tier 8 drops what tier 1 *cannot*, rather than a better roll of it.
- **The `raid` drop kind is live**, its own kind rather than a `boss` source with a mode,
  because the Tyrant borrows the Choir's kit and its Crown must never fall off a Delve floor.
  8 named items and 8 relics/artifacts each carry a single `raid` source, which makes §15's
  "cannot be obtained through normal gameplay" structural rather than promised.
- **`WorldLayer.raidId` is filled in on four layers**, but it gates neither ladder — a layer
  is still a *reading* of the ladders. The only gate is the raid's own `unlockFrontier`, off
  the account frontier, so a climb counts.
- **Solo in v1**, the same call the Vigil and the Proving made, but the seam is *open*: the
  wire carries `raidId`/`raidTier` and `configFromWire` rebuilds through `raidConfig`, so one
  branch in `handleHubInteraction` is all that stops a party raid.
- **Weekly rotation is deliberately not built.** §15 calls raids weekly events, but the game
  already has a weekly (the Convergence), and a roster only open one week in four is four
  pieces of content nobody can test. Raids are always open. A featured-raid read is cheap if
  it's ever wanted — but it must not *pay* more without moving `danger`.
- `tools/bossrules.ts` extracts the boss-rule audit out of `tools/legends.ts` so raids and
  Provings are held to one copy of it.

### The Memories: an altar, and the one place the ceiling moves

`src/data/memories.ts`, design record `docs/memories.md`. The endgame next to raids: an
**Altar** in the Citadel where a Memory is recalled, augmented and consumed. Rift-shaped —
three floors, boss last — unlocked per class at **depth 30 and height 30**, with monsters and
places drawn from across all existing content.

The fiction is the worldbuilding doc's, not invented: *Purgatory is shaped by memory*, and
*the Reliquary does not remember itself the same way twice*. A Memory is a recollection the
Keepers pinned down — Purgatory forced to remember one place the same way twice. That is why
its monsters come from everywhere, why it is an altar, and why it is consumed.

- **Every modifier is a percentage, never a multiplier.** Each family carries a `magnitude`
  and stores the percentage itself; `pctMult` is the one conversion site. The two flat
  exceptions (`hunted`'s elite count, and `armored`/`spiteful` naming affix ids) are declared
  as exceptions. This is an owner ruling: a brief that says "3× rarity" means "a meaningful
  increase of this kind", not a literal factor.
- **Boons never outnumber burdens** (`boons.length <= burdens.length`). No free positives.
- **Only `merciless` moves `danger`**; every other burden changes the floor's *shape*, the
  same split `data/daily.ts` already shipped, so difficulty can't double-dip into rewards.
- **This is the one place the rarity ceiling lifts, and it is narrow.** Below mythic nothing
  exceeds the Abyssal Rift. A mythic Memory may overshoot by a margin granted in proportion
  to the **square** of its burden load, so the ceiling cannot be bought cheaply — an
  unburdened mythic gets none of it. Measured at depth 45, unspoken goes from 1 in 48 in the
  Abyss to 1 in 43 in the best Memory ever rolled, against 1 in 3,879 on a plain floor. The
  gate asserts all three of: strictly better than the Abyss, less than 1.5× better, and still
  rarer than 1 in 30. **Farmable unspoken at the very top end is intended**; a second route
  around the cap anywhere else is not.
- **A Memory's boss id is rewritten `memory-<templateId>`**, so a Memory rolling a sector's
  boss can't pay that sector's exclusive named items outside it. Raid encounters *and* raid
  arenas are excluded from the pool in v1: a raid fight without its table is the worst of
  both.

### The Proving: the bottom of the Delve, and finishing a class

`src/data/legends.ts` (UAT §13/§14). A class can be **completed**: take it to depth 30,
beat the thing waiting there, and that class wears a **gold border** for good.

Worldbuilding did most of this design — a class is a **Legend**, a character starts as a
*partial* manifestation of it and spends the game recovering the rest, and the endgame
encounter proves that recovery finished ("LEGEND MASTERY" / "CLASS COMPLETION"). What you
fight is the part you never recovered, kept and assembled by the Abyss: **The Unfinished
&lt;Class&gt;**. No mythological figures are named, deliberately — the doc names two and
keeps Merlin out of the roster on purpose.

- **Depth 30 is the bottom because that is where the authored world already ends** —
  `biomeFor` caps at its last biome from depth 26, `bossFor` at its last encounter from
  depth 25, and that encounter is titled "You should not have come this far." **The ladder
  is not capped**: descending 30 → 31 works exactly as before. Don't "finish" this by
  giving the Delve a terminus — three passages of this document promise no upper bound and
  `UNIVERSAL_POINT_CAP` is justified by it.
- **The gate is a banked clear, per class.** Depth 30 is the ordinary Nameless floor until
  that class has cleared it and banked it (`Player.deepestDepth >= DELVE_BOTTOM`). Dying
  or bailing out never qualifies you, because `recordDepth` is only reached from
  `bank(true)`. No new unlock state exists — and none should be added.
- **Scoped to the Delve positively** (`config.mode.id !== "delve"` → refuse), not by ruling
  out the modes that exist today: every other mode reaches depth 30 by some route and a new
  one can arrive with any flags. `tools/legends.ts` walks all of `RUN_MODES` to pin it.
- **Solo only in v1**, the same call the Vigil made, so completion credit can't be
  duplicated or desynced. In a party depth 30 stays the ordinary floor.
- **The encounter is borrowed and reskinned** per the `planetBossSpec` precedent, then its
  phases are rebuilt strictly cumulative with a final phase *appended* — the "phases add
  rather than replace" rule made structural instead of trusted. Its stat line is measured
  against the **deepest authored encounter**, never the borrowed template: scaling off the
  template made six classes' final exam easier than the floor it replaces.
- **The border is powerless.** `Player.legendComplete` is read by the UI and by nothing in
  the simulation, asserted the same way `data/cosmetics.ts` is.

`npm run legends` is also **the only structural audit of the boss rules in this repo** —
it checks all 21 generated specs against the rules in the boss section below, and audits
the five hand-authored encounters against a *pinned* list of their existing violations
(three of them drop abilities between phases). Pinned, not fixed: a new violation fails,
and so does silently fixing a pinned one. See `docs/class-completion.md`.

### Drop previews: the answer has to be the same answer

`src/data/previews.ts` (UAT §20). Standing in front of an activity, you can see what it
drops before committing: the Dive, Rifts, Star Map, Vigil and Path screens all render one
`previewForRun`.

**The rule that matters is that a preview holds no table of its own.** A preview that can
drift out of sync with the real drop table is worse than no preview, so everything there is
a read of what the simulation already rolls: `namedMatchesFor` (the same `sourceMatches`
`rollNamedDrops` uses), `namedDropChance` (the same call the roll site makes),
`bossSpecForRun` (the same function `spawnBoss` calls), and the `RunMode`/`PlanetSpec`
themselves for currencies and materials. Two things were extracted to keep that literal
rather than approximate — `data/encounters.ts` owns "which boss does this floor spawn"
for both the sim and the preview, and `namedMatchesFor` is exported so the matcher is
never reimplemented. **Don't add a lookup table to `previews.ts`**; if the preview is
wrong, the game should be wrong with it.

`npm run previews` pins that as a property rather than by inspection: for thirteen
activities it compares the preview against the simulation's own `rollNamedDrops` with the
dice rigged to always hit, and the sets have to match exactly.

The Delve previews only the floor you're entering, on purpose — "descend or extract" is the
decision the mode exists to create, and previewing the next floor previews a choice the
player hasn't made. Odds are quoted **per event** (a world drop's is per kill), never
compounded into a per-run number. See `docs/drop-previews.md`.

**Depth 30 is far beyond the measured frontier** — the campaign bots reach roughly a third
of it, and at level 60 most sampled classes can't beat depth 30 in *either* flavour. That's
a progression-curve and class-balance finding, not something to tune this encounter around.

### Planets: the star map, and where materials come from

`src/data/planets.ts`. A planet expedition is mechanically a third rift flavor —
`MODES.planet` is a real `RunMode`, `planetConfig` builds a `RunConfig` exactly like
`riftConfig` does, fixed floors ending in a boss, tier compounding the danger. What a
planet adds on top:

- **Its own visuals.** A `PlanetSpec` carries a full `BiomeStyle` rather than being
  bucketed by depth, so it's a distinct place rather than a reskinned floor.
- **Its own boss, borrowed wholesale.** `planetBossSpec` copies phases, health and kit
  from an existing `BossSpec` and only overrides `id`/`name`/`title`/`element` — the same
  mechanism elites and infused monsters already use, which is why it's cheap to add a
  seventh planet without authoring a seventh boss from scratch.
- **Materials.** One per element (`src/data/materials.ts`). Kills pay in the planet's own
  element; so do resource nodes (`Level.resourceNodes`, planets only, mined by pressing
  confirm on one). Higher-tier planets and a higher Challenger both pay more per kill and
  per node. The dive and the rifts never touch materials — that's configured entirely
  through `RunConfig.planet`.
- **Its own travel ladder.** Clearing planet *N*'s first tier opens planet *N+1*
  (`planetUnlocked`); each planet keeps its own tier ladder after that
  (`GameState.planetProgress`, keyed by planet id, deliberately separate from the
  fixed-`RunModeId` `riftTiers` map).

The star map doesn't dive you — picking a tier spawns a portal back at the ship
(`Hub.setExpedition`); walking into that portal is what launches the run.

### Multiplayer: one simulation, four people

`src/net/` plus the party half of `game/dungeon.ts`. Up to four players, joined by a
four-letter room code, with **nothing to install and nothing to configure**.

- **The dev server is the multiplayer server.** `vite.config.ts` hooks a WebSocket relay
  (`tools/relay.ts`, dependency-free — it speaks RFC 6455 itself) onto the same HTTP
  server Vite is already running, so `npm run host` serves the game and the room on one
  port and a client's relay address is simply the origin it loaded the page from.
- **The relay is dumb.** Rooms, codes, peers, bytes. It never looks inside a game
  message. Every rule lives on the host, and there's no host migration — the host
  leaving closes the room.
- **The host's browser is the simulation.** Clients send buttons pressed (plus an input
  sequence number and an aim point) and draw the snapshots that come back. A client
  reconciles its own position by replaying unacknowledged inputs against the host's last
  confirmed position rather than blending toward it, and predicts its own dash — the
  fix for a Sept 2026 finding that the old 25%-blend-with-no-reconciliation left a
  walking client permanently a quarter of an RTT behind the host, tugged back every
  snapshot. Everything that isn't the local hero (monsters, allies, summons, projectiles)
  interpolates every tick between snapshots rather than sitting still between them.
- **The level is never sent.** `generateLevel` is deterministic, so a `start` message
  carries a seed and a flattened `RunConfig` and every browser builds the identical
  floor. A snapshot is only what moves — heroes as objects (now including status
  ailments and a departed flag), minions, corpses and monster affixes, everything else as
  flat number arrays. A busy floor costs a bit over 40 kB/s per player.
- **A disconnected player can't wedge the run.** A departed hero is excluded from the
  portal count, the revive loop and the wipe check rather than sitting there as a
  targetable, unrevivable body; the run's roster freezes for the whole run the moment it
  starts, so someone joining the room mid-run waits for the next one instead of being
  yanked into a floor they never readied for, and a client that isn't on that roster
  refuses to substitute the host's hero for its own. The host leaving resolves the floor
  as an early extraction (`EARLY_EXTRACT_KEEP`) for whoever's left, not a full wipe.

The shape of the party inside the simulation is load-bearing:

- **`Hero` bundles everything that used to be "the player"** — avatar, `Player`,
  ailments, ward, cooldowns, charge, potions, unbanked loot. `Dungeon.heroes` holds them
  all and `Dungeon.localHero` is the one this browser drives; every old accessor
  (`d.avatar`, `d.player`, `d.loot`, ...) is a getter onto the local hero. **Keep that
  indirection** — it's what stops co-op leaking into every file.
- **A remote player is an `AvatarInput`.** `core/input.ts` defines the interface a
  keyboard implements; `net/sync.ts`'s `NetInput` implements the same thing from the
  network. One `updateHero`, not two.
- **Difficulty scales with the party** through `partyScale` in `data/modes.ts`: monsters
  get much fatter and more numerous, barely harder-hitting, because a party can't dodge
  for each other and a one-shot is a wipe waiting to happen. At one player every
  multiplier is exactly 1.
- **Loot is per-hero and physical; XP is shared in full.** Each player banks into their
  own save on their own machine.
- **Down, not dead.** An ally standing over a downed hero for a couple of seconds
  revives them; clearing the floor picks everybody up. Solo, "downed" and "dead" are the
  same tick.
- **The host calls it at the portal.** Descending needs the whole party in the
  completion portal; extracting and bailing out early are the host's call alone.

**The host can pick any portal, not just the Delve.** Walking into the Delve, a rift, or
the Reliquary Portal and confirming it there sets the party's plan (a `RunConfigWire`)
and turns that same station into everyone's ready spot — the Comms Relay itself no
longer picks a depth, it just opens and joins rooms. The Challenger dial still applies
uniformly; in co-op it's the host's tier.

### Accounts: the save lives on the server now

The save moved off `localStorage` and onto whichever machine is serving the game, so
progress survives across sessions and devices — `tools/accounts.ts` (SQLite via
`node:sqlite`, scrypt-hashed passwords via `node:crypto`, both built in, so this cost the
project no runtime dependencies) mounted on the same HTTP server as the party relay,
in both `npm run host`'s dev server and the standalone relay. **Login is required, no
guest mode** — a local/server split is exactly the "which save is real" bug class this
removes. Username + password only: no email, no 2FA, no password reset. The server never
looks inside a save — it stores and returns the exact string `GameState.save()` already
produced for `localStorage`, so `SAVE_VERSION` and the co-op wire format (`playerToJSON`'s
double duty as both the save format and the wire payload) are both untouched by any of
this. See `docs/accounts.md` for the schema, the API, and the session/cookie design.

### What difficulty is worth: one curve

`src/data/rewards.ts` (UAT §16). "Harder content pays better" is one function,
`rewardCurve(danger)`, returning the four axes a number can express: **drop chance** (a
named item's odds), **drop count**, **item power** (added item levels) and **variant
chance** (a drop infused with the floor's own element, via the `favorElement` knob a
crafting essence already uses). Keyed on `danger`, so a rift tier, the Challenger dial and
a sector tier all climb it without any of them knowing it exists.

Three things about it are load-bearing:

- **It is neutral at `danger` 1.** Every axis is exactly 1 or 0 on a plain Delve floor with
  the dial off, which is why adding it moved no existing balance number. Keep it that way:
  anything that pays out at ordinary difficulty belongs in `MODES` or `profileFor`, not here.
- **Every axis is capped (`REWARD_CAPS`), and rarity is deliberately *not* an axis.**
  Drop rarity stays composed in `profileFor` from `challengerRarityBias`, which caps around
  tier 11 by §9's design — the Death March tiers are about raw danger, not about paying
  more. A second rarity term keyed on `danger` would route around that cap; don't add one.
  Nothing here can lift the rarity ceiling either: divine and unspoken don't become
  reachable because a floor got harder. **The Memories are the one deliberate exception**
  — see their section below. It is bounded to mythic Memories, scaled by the square of the
  burden load, capped a stated margin past the Abyssal Rift, and asserted as a comparison;
  it is a narrow carve-out by owner ruling, not a repeal. This rule still governs the Delve,
  the Tower, the rifts, the Challenger dial and every crafting path.
- **Difficulty you chose pays; the day's weather doesn't.** `profileFor` divides the Vigil's
  own modifiers back out before asking the curve, because §17 splits the daily's twists into
  ones that change how a floor fights and ones that change what it pays, with at most one
  payer a day. Letting Ferocious through would have made it a second payer — the Vigil's own
  acceptance check caught exactly that, which is the check doing its job.

The §20 drop preview reads the curve, so what a floor advertises and what it rolls are the
same numbers. See `docs/reward-curve.md`.

### Challenger: a difficulty dial the player owns

`src/data/challenger.ts`. A multiplier the player sets themselves (Settings tab, off by
default, twenty tiers: "Nightmare I"–"X", then "Death March I"–"X"), folded straight
into the same `danger` number a rift tier compounds into, so every formula that reacts
to `danger` reacts to Challenger for free. Applies uniformly to the delve, every rift
and every planet — tier 5 reads as "roughly five times harder" on purpose. The
rarity-bias and reward-multiplier bonuses (`challengerRarityBias`,
`challengerRewardMult`) cap out well before tier 20 by design; the Death March tiers are
about raw, uncapped danger (`challengerMultiplier`), not about paying out more.

### Crafting: the forge

`src/data/crafting.ts` plus `GameState.craftItem`, `GameState.applyForgeOp`,
`GameState.salvageItem` and `GameState.craftNamed`; the pure item operations live in
`src/game/forge.ts`. See `docs/forge.md`. Three screens at one station:

- **Craft** — the deterministic way to get an item, alongside chests, monsters and boss
  drops: choose a category (weapon / armor / accessory, mapped onto the existing
  `EquipSlot`s), a rarity, optionally an essence element, and spend materials. An essence
  doesn't force the roll, it **weights** it — `rollItem`'s `favorElement` triples that
  element's odds, so a crafted item still rolls through the exact same code every dropped
  item does.
- **The workbench** (the Reforge screen, UAT §26) — eleven ops on an item you already own,
  worn or stashed: Reforge, Temper (one affix's value within its range), Recast (swap one
  affix), Augment (add one, never past `MOD_COUNTS`), Inscribe/Rescribe/Erase a granted
  skill and Awaken/Erase a trigger (**rolled, never chosen**, behind the drop's own
  rarity gates), Ascend (one rarity up, keeping affixes, capped at mythic, melting two
  same-rarity stash items) and Salvage. Every op rolls through the same code a drop uses,
  so nothing the bench makes is an item a chest couldn't have dropped — **the dungeon is
  the path to gear; the bench is the path to a specific piece of gear.** Named items
  accept Reforge, Temper and Salvage only; identity isn't for sale.
- **Named** — a named item's recipe (`NamedSource.craft`): materials, coins and stash
  **item components** (`ItemRequirement`, UAT §24 — a boss drop plus N legendaries can be
  an ingredient). Components come from the stash only, cheapest first, and a generic line
  never eats a named item.

**Ash is the one crafting currency** (UAT §27, whose heading says not to overcomplicate
this). It has exactly one source — salvaging an item, which also returns a pinch of the
materials its affixes were made of — and pays for every workbench op; coins stay the bulk
cost and the nine materials stay the currency of making. `tools/forge.ts` (`npm run
forge`, in `npm test`) asserts the economy as comparisons, not bounds: salvaging ten
legendaries can't fund a rare→mythic ascension chain, making a specific item is never
cheaper in vendor value than finding one, and one salvage never pays for tempering a peer.

Crafting is capped at **mythic** on every path — Craft, Ascend, recipes. Divine and
unspoken staying chest-only is deliberate — `src/data/rarity.ts`'s "keep it absurd, the
long tail is the hook" rule would mean nothing if enough grinding could buy the top of
the ladder outright.

### Classes: an interaction system, not a stat block

`src/data/classes.ts` (`CLASS_IDS`, 21 total — `LEGACY_CLASS_IDS` is the fifteen that
predate the class refactor and kept their name and identity across it; Oracle and
Chronomancer did not survive) holds the numbers a class starts and grows with, its
weapon affinity, and the element its ultimate falls back to. `src/progression/<class>.ts`
(`PilotClass`) is where the real identity lives: a resource model, ten abilities, a
five-path behaviour tree, six hybrids and a Mythic Archetype. `PILOT_CLASSES` (the
original six — Lancer, Berserker, Magician, Necromancer, Paladin, Stormcaller) is the
set `npm run classes` drives against the live combat runtime; `npm run roster` proves
all 21 (`validateClass`, `validateRoster`, the anti-overlap audit in
`src/progression/audit.ts`, hybrid/archetype thresholds). Browsable in-game read-only
via the Codex tab. See `docs/progression-architecture.md` and `docs/classes_refactor.md`.

`Dungeon` casts through `hero.rt.castAbility` (`AbilityRuntime`/`runEffect` in
`src/combat/`), not a hard-coded skill switch. This system is mid-migration and some of
its own doc headers and code comments still disagree with each other about exactly
what's wired where — check `docs/combat-cutover-plan.md` and the source itself before
trusting any status claim, this one included.

**How a class charges its resource is the design**, not an implementation detail —
momentum from moving, mana from casting, meter from getting hit, whatever a class's
`ResourceSpec` says. `Player.mana` is legacy now (kept for the HUD and potions); most
classes' real casting resource is something else entirely. The charge rule is supposed
to say something about how the class wants you to fight.

Ultimates take their element from your *gear*, not the class (`Player.attackElement`
picks your biggest elemental fraction). A lightning Lancer and a fire Lancer are
different characters made of the same class.

### Every class has its own save

`GameState.players: Record<ClassId, Player>` — each class keeps a fully independent
character: level, XP, tree allocation, equipped skills, equipped gear.
`GameState.activeClassId` says which is live; `GameState.player` is a getter onto
`players[activeClassId]`, which is why almost nothing outside `state.ts` and the Path
tab has to know a second class exists. Picking a class you've never played starts it at
level 1 with an empty tree and empty hands; switching back to one you've played finds
it exactly as you left it — `chooseClass` only ever moves the pointer, never mutates a
`Player`.

The stash, coins, materials, cosmetics and everything else on `GameState` stay
account-wide — only the character sheet is split out. Gear you outgrow on one class
sits there for an alt, which is why an item needs a level requirement:
`requiredLevel()` in `game/item.ts` reuses `ilvl` minus one level of grace, and
`Player.canEquip` refuses to pull a too-high-level item out of the shared stash. The
one-level grace exists because a floor's XP lands as its monsters die, so clearing depth
*N* often dings a character to level *N* only partway through — without it, even a
single-class playthrough would routinely find its own newest drops locked for a floor.

Each `Player` also tracks its own `deepestDepth`, separate from the account-wide record
on `GameState.stats` (lifetime best-of-all-classes, used for rift unlocks and Records).
Chests and the forge roll item level off the *active character's* `deepestDepth`, not
the account record — a fresh alt's first chest purchase must not roll gear at whatever
depth the main reached.

### Weapons decide what your attack button does

`src/data/weapons.ts` — currently 14 families (sword, axe, spear, daggers, staff,
talisman, hammer, bow, whip, claws, chakram, scythe, rapier, fists), each its own shape
of basic attack. The file is the source of truth for what each one does; the roster
grows often enough that it isn't worth re-listing shapes here. All of them live in the
weapon slot. Holding a family your class was built for is worth `affinityBonus`;
anything else hits a little softer, and the stash's upgrade arrows know it.

A ranged basic attack (a staff bolt, a bow shot) resolves through the same path a melee
swing does, so a caster gets crits, leech and triggered gear exactly like an axe.

Drops roll a slot first and only then decide which weapon family, so adding a new
family never quietly halves everyone's chance of finding a necklace — and weapon rolls
are biased toward the class you're playing.

### Items are modifier lists, not stat blocks

`src/data/mods.ts` owns the one `Mods` record everything reduces to — class base, level
growth, every affix, every allocated tree node. The simulation never asks which item
something came from; it asks for a number.

An item rolls a **base stat block plus a list of affixes**, with the count and the
*reachable pool* both driven by rarity (`MOD_COUNTS`, `ModRoll.minTier`) — the reason to
keep opening chests once your slots are full:

- `+1 projectile` doesn't exist below **epic**; `+1 ultimate bounce` doesn't below
  **mythic**.
- From **epic**, a weapon, ring or necklace can carry a **granted skill** — a whole
  extra castable, for as long as you wear it.
- From **legendary**, an item can carry a **trigger**: a nova on kill, bolts when you
  dash, a chain when your ultimate fires. The item plays itself.

### Named items: a definition that forges an ordinary item

`src/data/named.ts` (UAT §28/§29). A named item is **a definition that forges an ordinary
`Item`**, and its behaviour is **a tree node you wear**: `forgeNamedItem` bakes the
definition's base block and fixed affixes into the same `stats`/`mods` every drop has (so
the compare table, score, sell price, save and wire need no special case), and the only
thing the item remembers is `named: <def id>`. `Player.build` folds a worn named item's
`effects` — `NodeEffect` minus `mods`: skill mutations, event-keyed passives, resource
patches — into the class `ResolvedBuild` through the same fold a tree node uses, so
`applyBuild`, `runBuildGrants` and the rule hooks see one build and **the simulation
never asks "is this named"**. If you find yourself writing a `switch` on an item id,
you've taken the wrong turn: extend the effect vocabulary in `src/combat/` instead.

- **Acquisition is the table** — `src/data/drops.ts`, shared with relics. A definition
  names its sources (`boss` by `BossSpec.id`, `chest` by tier, `clearCache`, `worldDrop`,
  `craft` with an exact recipe); the existing roll sites read it
  (`Dungeon.dropFromTables`, `GameState.openChests`, `GameState.craftNamed`) and no boss,
  chest or forge code ever names an item. `dropChance` scales odds gently with `danger` —
  the §16 hook. `namedForSource` / `namedMatchesFor` are the typed reads;
  `dropsForSource` in `data/drop-preview.ts` is the composed one the §20 previews ask.
- **Two lifetimes, on purpose — read docs/named-items.md before tuning one.** Baked
  stats are frozen into copies already dropped; `effects`/`grant`/`trigger` are looked up
  live by id and a retune reaches every copy ever forged.
- **Rules stay namespaced** `named.<id>.*` — a named item may not flip a class's keystone
  (the roster audit only walks class defs and would never see it). Granted skills crossing
  class lines are fine and different. `npm run named` (`tools/named.ts`, in `npm test`)
  asserts this plus: every reference resolves, art exists or falls back, forged copies
  are ordinary Items on the one `Mods` path, save/wire round-trips, every source pays out,
  passives fire in a live dungeon.
- **Art** is `def.art` → an `ATLAS` row `named.<id>` + PNG; missing art draws the type
  icon tinted by rarity, never a broken screen. Every shipped item is on the fallback
  until the art pass.

### Relics and artifacts: a tree node you wear, no item under it

`src/data/relics.ts` (UAT §19), design record `docs/relics.md`. A `RelicDef` is an id,
two lines of prose, a list of `NodeEffect`s — the class tree's **full** vocabulary, `mods`
included, because a relic has no affix list to carry a stat — and a list of sources.
`Player.build` folds a worn relic through the same `foldEffects` a tree node uses, and
**the simulation never asks "is this a relic"**. Two tiers, kept distinct on purpose:
**artifacts** (18, present as divine, Abyssal Rift and only the Abyssal Rift, "my build is
better at what it does") and **relics** (12, present as unspoken, the Proving by the
Legend's element / the Nameless at depth 25+ / the depth-30 Delve cache / Abyss tier 8+,
"this changes how my build works").

- **Rule 3 is a test, not a promise.** Every relic-tier definition must carry an effect
  beyond `mods`; the honestly-flagged `statStick` definitions may be at most a fifth of the
  roster. If a tenth relic is turning into a bigger number, the vocabulary in
  `src/combat/` is what to extend — once, for the tree and both tables.
- **Three slots, one relic.** `RELIC_SLOTS = 3` on `Player.relics` (per class, on the
  co-op wire via `playerToJSON`), out of the account-wide `GameState.relics`. At most
  `MAX_RELICS_WORN = 1` is relic-tier; artifacts fill the rest, so they never go dead. One
  constant, owner-overturnable. No level gate, like the universal tree.
- **Acquisition is the shared table** (`data/drops.ts`, see Named items). No `proving`
  kind: a Proving kill is a `boss` query with a `legend-<class>` id, and
  `provingSourcesOf(element)` is sugar that builds boss sources. `raid` / `tower` are
  reserved kinds no site emits yet — the §15/§21 seam — and `relicProblems` refuses a
  definition hiding behind one. Drops are physical pickups lost on death and bail-out;
  the local roll skips what the account owns; a co-op dupe is a counter, never power.
- **`dashCharges`** is the one vocabulary extension: a whole extra dodge as a mod key, the
  dash a charge stock on the avatar. It landed as its own commit with co-op prediction
  coverage in the smoke test; don't fold changes to `moveHero` / `predictStep` /
  `Avatar.dashStock` into an unrelated commit.
- `npm run relics` (`tools/relics.ts`, in `npm test`) asserts all five §19 rules, the slot
  rule, the two-tier split, and — as a direct comparison — that a worn relic moves the
  sheet while a worn cosmetic still doesn't.

### Elemental damage, ailments and resistance

`src/data/elements.ts` — nine elements (`ELEMENTS`): physical, fire, cold, lightning,
poison, void, holy, arcane, nature. Physical does what the number says; every other
element trades a little raw damage for a rider (burn, chill, shock, venom, drain, ...).
Only five of the nine (`LOOT_ELEMENTS`: fire, cold, lightning, poison, void) are in the
*random* pool that loot affixes, elite infusion and biome affinity draw from — holy,
arcane and nature are full elements (resist stat, material, essence, ailment) but
deliberately kept out of the random rolls, reserved for a class's own kit or a
deliberate craft rather than diluted across every dropped ring. Both sides of the fight
use the same code in `src/game/combat.ts`: anything the player can do to a boss, a boss
can do back.

Gear carries elemental affixes: offensive slots convert a slice of your hit into an
element, defensive slots grant flat resistance instead. Resistance is asymptotic and
capped at 75%, exactly like armor. A generic `+% elemental damage` roll multiplies
whatever elements you already carry, so the second fire mod is worth more than the
first — that's what makes a themed build a build.

Monsters resist their own element hard — **except physical**, deliberately. Physical is
the damage everyone always has, and a floor that resists your sword is a floor you
simply cannot fight. Biomes have an elemental affinity and infuse an increasing
fraction of their monsters with it as you descend.

### Skills and resources

Three skills equipped at a time (`src/data/skills.ts`), plus a fourth slot whenever a
piece of gear grants one, cast from the keys clustered around the attack finger. Each
class casts against its own `ResourceSpec`s (`src/combat/resources.ts`) — momentum,
mana, meter, whatever the class's identity calls for, not a universal currency.
Regeneration is slow on purpose in every case — a skill should be the answer to a
moment, not a rotation filler.

**Your class decides which skills you can learn at all**; within that pool everything
is unlocked by levelling, nothing is bought. The one exception is a granted skill: an
epic-or-better item can hand you anything, and breaking the class rule is exactly what
makes that drop worth wearing.

### The Universal Skill Tree: the basics, not the build

`src/progression/universal.ts`. A second tree every class shares alongside its own
five-path class tree — the class tree answers "how does my class/build work?"
(behaviour: mutations, rules, resources); this one answers "how does my character
fundamentally improve?" (health, defense, move speed, cooldown rate, pickup radius,
coin/gem find, and the like). It grants no abilities and flips no rules on purpose —
a universal node must never be the reason a class plays differently.

It's a DAG rooted at one shared node, not five independent columns: six paths (Vitality,
Swiftness, Might, Attunement, Warding, Avarice), a few of which cross-link into a
neighboring path partway down, and every keystone carries a real downside (a wall of
health that moves slower, a glass cannon that gives up defense) so the tree stays a set
of tradeoffs rather than a shopping list. The point *pool* is account-wide and derived
from the **account frontier** — the further of the depth record and the height record,
since §21 gave the world a second ladder (`universalPointsFor(GameState.frontier)`, capped
at `UNIVERSAL_POINT_CAP` so a deep enough account can never afford the whole tree) — but
the *allocation* is per-class
(`Player.universalAllocated`) — that split is what lets an alt feel like it inherited the
account's progress while still letting a caster and a melee spend the same pool
differently, and it's also why co-op didn't need a new wire field (a character's
allocation already travels with the rest of `Player` on the snapshot). See
`docs/universal-tree.md`.

### Bosses are raid encounters, not fat monsters

`src/data/bosses.ts` defines the encounters, `src/game/boss.ts` runs them. A boss is one
enormous body that ignores knockback, has enough health that the fight lasts a minute or
two, and runs a rotation of **telegraphed abilities** — each asking a different
question: get out of the circle, get into the hole in the donut, step off the line, kill
the adds, stop attacking and move.

The rules the encounters follow, and which any new ability must follow:

- Every ability is telegraphed. If a hit landed, it was readable.
- Casting locks the boss in place, so its wind-up is also your window to hit it.
- Phases *add* abilities rather than replacing them, so the room gets busier as it dies.
- Boss mechanics ignore ordinary hit-invulnerability — a shape you watched for a second
  and a half is supposed to land — but a **dash always beats them**. Dashing through the
  shape is the skill the fight is asking for.
- Every phase needs at least one ability that reaches across the arena, or the fight can
  be beaten by walking backwards.

A boss floor is one wave containing the boss; everything else on it was summoned by the
encounter and evaporates when it dies. Boss arenas are generated larger and only from
the open layouts, because a two-hundred-unit quake needs somewhere to run to.

### Every floor is a generated dungeon, not one room

`src/game/level.ts` builds each floor from a seed as a **graph of connected rooms**: a
randomized spanning walk over a macro grid of room slots (a recursive backtracker, one
room per cell instead of one tile), with a few extra edges added afterward for loops and
dead ends. Each visited slot becomes a real room with its own interior layout (open,
pillars, chambers, gauntlet, rubble, ring — picked per room, occasionally left empty on
purpose), doors only where it connects to a neighbor; unreached slots are sealed as
solid rock. Resource nodes (planets only) land preferentially in dead-end rooms. A
**boss floor is the exception**: a single large arena from the open layouts, because the
ability radii in `data/bosses.ts` are tuned against that shape and a maze would break
"every phase needs an ability that reaches across the arena." Planets ask for a bigger
room graph than the delve and rifts do, on top of an already bigger floor.

The generator's one hard promise: **the portal is always walkable from the spawn** —
connected by construction, flood-filled to check, with a corridor carved as a
last-resort fallback. The smoke test verifies this over hundreds of floors; don't add a
layout without running it.

**Every wall is authored on the 32-unit tile lattice** (`TILE` in `level.ts`): edges on
multiples of 32, one tile thick, rooms sized in double tiles so a centred doorway lands
on the grid. The floor is painted with 16-texel tiles stamped across 32 units, so this
is what makes the drawn rock *be* the collision volume rather than an approximation of
it — a new layout must snap through `snapDown`/`snapSize` like the existing six, and the
smoke test fails any wall that doesn't. Floor size (rooms, doorways, corridors) is a
handful of constants at the top of `level.ts`; changing them moves the rng-shared spawn
sequence for every floor, so run the smoke test.

Walls block movement, projectiles and line of sight. Monsters that can see you charge;
ones that can't follow a breadth-first flow field rebuilt around the player four times a
second (`FlowField`). The flow field is generic over whatever walls happen to exist,
which is why a change to wall layout never has to touch pathing, spawning or rendering.

### Difficulty philosophy

Pressure, not sponginess. Enemy health grows roughly with the gear curve, but the things
that actually make a deep floor frightening are damage (quadratic in depth), speed,
count, hazards, and `aggression`/`telegraph` in `DepthProfile`. Reading a telegraph and
dashing is the skill the game asks for; the smoke test's sharp-vs-reckless campaign
comparison measures exactly that — **run `npm run smoke` for the live numbers rather
than trusting a depth figure pinned in this doc**, since a class, weapon or tree change
moves the dial and a stale number here has already caused one real, silently-missed
regression (see the campaign-comparison note above).

Boss floors are measured differently, because a raid boss that one-shots a careless
player is a wall rather than a fight. The test runs the same character on the same
floor with telegraph-reading on and off and asserts the *damage bill* diverges sharply
and the potion belt empties.

The economy is deliberately slow. Coins per kill, per-kill gear drops, key drops and the
vendor's `SELL_RATE` were all cut hard, and most of a floor's actual pay comes from the
**clear cache** dropped around the completion portal when the quota is met — a reward
you only get by finishing, still lose by dying on the way out, and can't carry through
the entrance portal either.

### The look: simple pixel art, menacing monsters, a plain hero

Full detail (palettes, per-realm looks, monster/boss/item rules) lives in
`docs/art-style-guide.md` — this is the short list of things that must not casually
change:

- **The smaller and simpler the grid, the better.** The character field is `CHAR_W` x
  `CHAR_H` (**30x26**) with the 20x22 body at (`BODY_DX`, `BODY_DY`); monsters are
  18–24 wide; raid bosses are **26x26**. `SPRITE_SCALE` (1.2) and `WEAPON_SCALE` (1.5) in
  `render/draw.ts`, and `spriteScale` in `data/bosses.ts`, scale back up to match — if
  you change the authoring resolution, change all three in the same commit. An earlier
  pass doubled it and pushed the hero toward sharp, angled features; the owner's call
  was blunt ("scary and odd" on the character you're meant to like looking at) and it
  was rolled all the way back. **Don't assume finer detail is an improvement — ask.**
- **The hero is plain and calm, not scary.** Small eyes, simple neutral face, no angled
  brows or slit pupils. Don't drift it toward the monsters' design language.
- **Monsters and bosses stay the menacing half.** The only bright colour on one is the
  part that's looking at you — every palette stays deliberately low and dirty apart from
  that one hot accent.
- **A character is a stack, not a single sprite**: `render/pixels.ts` holds a bare body,
  five hairstyles, one grid per cosmetic; `render/sprites.ts` composes back item → body
  → hair → face → ears → hat and caches it against the appearance that produced it.
  Every layer is authored in the same 40-wide body space, which is why a new hat is one
  grid and fits every head automatically.
- **Silhouette first, outline last**: fill solid, then every cell touching transparency
  becomes `OUTLINE`; interior detail is stamped after and never overwrites an outline
  pixel. **Hair shades where it meets the face rather than outlining.**
- **Weapons are their own sprites**, authored pointing +x with a named grip pixel,
  rotated at draw time along the arc/thrust/spin actually resolved, drawn at the size
  they hit at (an axe really is wider than a torso).
- `pixels.ts` is grids *and palettes* with no DOM (testable/viewable from Node);
  `sprites.ts` is the half that owns canvases. Keep that split. `render/itemart.ts` is the
  same exception for the same reason: it holds the *decision* about what an item looks
  like, purely, so it can be checked from Node.
- **One item, one picture.** Six surfaces draw an item — stash card, chest reel, loot
  banner, paper-doll slot, compare panel, and the drop on the dungeon floor — and all six
  go through `itemSprite` (`render/sprites.ts`), which executes `chooseItemArt`
  (`render/itemart.ts`). That is UAT §11's critical requirement, and it is by construction
  rather than by discipline because it had already broken once: `pickupSprite` in `draw.ts`
  kept its own copy and washed a non-weapon icon at 0.4 where the stash washed it at 0.5.
  **If you add a surface that draws an item, call `itemSprite`** — never reach for `ATLAS`,
  a weapon sprite or a rarity tint directly. `npm run itemart` fails if the wash constant
  forks again. The fallback ladder (authored art → weapon family → type icon → capsule)
  never throws, so a missing PNG is never a broken screen.

### Cosmetics: gems, capsules and the wardrobe

`src/data/cosmetics.ts` owns the vanity half of the game, and its first rule is that
**cosmetics are powerless** — nothing in that file is ever read by the simulation. The
smoke test asserts it: a fully-geared, fully-dressed character has a byte-identical
sheet to the same character undressed.

The economy is separate too: cosmetics are bought with **gems**, which drop, bank and
are lost on death exactly like coins, spent on nothing else. Coins never become gems and
gems never become coins; `gemMult` on a `RunMode` is where a mode says how much it pays
in them, and the Avarice Rift is the one that funds a wardrobe.

- Six slots: hat, ears, face, back, aura, weapon skin. Hairstyle, hair colour, skin
  tone, eye colour and an outfit dye are free — deciding what you look like isn't a
  currency sink.
- Three capsules (Trinket / Boutique / Starlight) roll the same eight rarities loot
  uses, on a much flatter curve, so a wardrobe is a long grind, not an unfinishable one.
  Duplicates refund gems.

## Controls — keyboard drives everything, mouse is a first-class option

The game defaults to **mouse + keyboard** — WASD moves, the mouse aims and attacks —
with a **Settings → Controls** toggle back to **keyboard only** (face whichever way
you're moving, mouse touches nothing in the dungeon). **Every menu is always
mouse-navigable regardless of which scheme is active** — `TownUI` wires a single click
delegate in `src/ui/town.ts` (`data-index` selects a row, `data-tab` switches tabs,
`data-action` mirrors the chip buttons), and none of it replaces the keyboard path;
every keyboard method is the literal function a click calls.

**Every action is rebindable — nothing is reserved**, movement and menu navigation
included. This is safe specifically because every menu is always mouse-clickable too —
there's no keyboard state that locks a player out of their own Settings screen.
Rebinding two actions to the same key swaps them.

| Key (default) | Action |
| --- | --- |
| `W` `A` `S` `D` | Move / navigate menus |
| Mouse | Aim (mouse + keyboard scheme only) |
| Left click, or `J` | Attack |
| Right click | Whatever `Settings` binds it to (skill 1 by default) |
| `K` | Dash (grants i-frames) |
| `L` | Drink potion |
| `U` `H` `N` | Cast the three equipped skills |
| `M` | Cast the skill your gear grants you, if any |
| `;` | Your class ultimate |
| `E` | Confirm / interact |
| `Q` | Back / cancel |
| `I` / `O` | Previous / next tab (Quartermaster's screens only) |
| `F` | Mark an item for a batch action (Stash's mass-salvage) |
| `Esc` | Pause a dive, or back out of a town screen |

This table is just the shipped default — `Settings` can rebind every row, this table
included. Bindings live in `src/core/input.ts` and `src/data/settings.ts`
(`RebindableAction`/`REBINDABLE_ACTIONS`); `combatHints()`, `skillKeys()`, `townHints()`
and `tabHelp()` (`src/ui/town.ts`) are the single source of truth for every on-screen
legend, reading live settings — don't hardcode a key name or "click"/"press" wording
anywhere in the UI.

## Architecture

```
src/
  core/     rng, input, fixed-timestep loop, localStorage save, math helpers
  data/     rarities, item tables + affix pool, chest tiers, enemy archetypes, depth
            curves, biomes, trap specs, elements + ailments, modifiers, weapon families,
            classes, run modes (delve/rifts/planet), planets, materials, crafting, the
            challenger dial, the reward curve (rewards.ts), boss encounters, the
            Proving (legends.ts), which boss a
            floor spawns (encounters.ts), drop previews (previews.ts), cosmetics
  game/     state, player, level generation + pathfinding, the dungeon run and the party
            of heroes in it, the ship hub (hub.ts), ailment bookkeeping (combat.ts), the
            rule engine (rules.ts — behaviour-tree-authored keystone/hybrid/archetype
            effects reacting to hit/cast/kill/damage/ultimate events), the boss brain
            (boss.ts)
  combat/   damage packets + channels, the status/DoT framework, the generic resource
            model, the event bus, targeting, the Ability/EffectStep schema and the
            runEffect executor. Pure, DOM-free. Live in `Dungeon` via `hero.rt`
            (`AbilityRuntime`) — see docs/combat-vocabulary.md and
            docs/combat-cutover-plan.md for how this replaced the old switch-statement
            skill/ultimate execution.
  progression/ the build layer: the skill-mutation framework, a behaviour-driven tree,
            cross-path hybrids and three-path Mythic Archetypes. `resolveBuild`/
            `applyBuild` is the seam. All 21 canonical classes are data here
            (`ALL_CLASSES`; `PILOT_CLASSES` the original six), plus `audit.ts`
            (anti-overlap) and `matrix.ts`. Browsable via the Codex tab. See
            docs/progression-architecture.md.
  net/      protocol.ts — wire types and room codes, pure, no DOM and no simulation
            client.ts   — one WebSocket to the relay: rooms, peers, nothing about games
            sync.ts     — snapshot encode/apply, and a remote player as an AvatarInput
            party.ts    — the lobby, the ready check, and the host/client run loop
  render/   pixels.ts  — every grid and palette, pure, no DOM
            sprites.ts — baking, layer composition, caches
            draw.ts    — camera and the world (also the shared portal glyph)
            hub.ts     — draws the ship: portals, terminal props, the player
            fx.ts      — particles, slashes, impact stars, damage numbers
  ui/       town screen (DOM, reached from hub stations), in-run HUD (canvas)
tools/      acceptance tests (see npm run test / package.json scripts for the current
            list), the art contact sheet, the party relay (relay.ts, attached to the dev
            server by vite.config.ts), and one-off measurement harnesses (arena, builds)
legacy/     the original Tkinter game, kept for reference
```

Rules of thumb:
- `data/` is pure data + pure functions. No DOM, no canvas, no `GameState` imports.
- `game/` is simulation only. It must never touch the DOM or draw anything.
- `render/` and `ui/` read state and draw. They never mutate simulation state.
- `render/pixels.ts` is the exception that proves the rule: it is inside `render/` but
  has no DOM in it, because the art has to be testable and viewable from Node.
- The sim runs on a **fixed timestep** (60 Hz). Rendering interpolates. Don't put
  gameplay logic in the render path or it will break at other framerates.
- `net/` may import from `game/` and `data/`; nothing in `game/` or `data/` may import
  from `net/`. The simulation must never know it's being watched.

## Carried over from the Python original (do not casually change)

- **Eight rarities**: common, uncommon, rare, epic, legendary, mythic, divine, unspoken
  — with their exact colors and `2^n` stat multipliers (1→128). See `src/data/rarity.ts`.
- **Chest tiers**: Basic / Advanced / Elite / Legendary, their prices, and their
  per-rarity weight multipliers (higher tiers zero out the low rarities).
- **Item name tables**: every original string is still in `ITEM_NAMES`, verbatim. The
  original `weapon` list held a sword, an axe and a mace at each rarity; those were
  split across the `sword` and `axe` families (spear/daggers/talisman names written to
  match) — the weapon roster has since grown well past those five, see
  `src/data/weapons.ts`.
- **Base rarity odds**: tightened past the original numbers on the owner's call —
  unspoken is now ~1 in 250,000 from a Basic chest, rarer than divine, and everything
  from epic up got cut hard. `BASE_RARITY_WEIGHTS` in `src/data/rarity.ts` is the single
  point every source of items reads through. Keep it absurd — the long tail is the hook.

Anything else — combat, adventures, stats, zones — was replaced and is fair game.

## Planned direction (not built yet — check before starting)

The rifts, the cosmetics, the ship hub, planets, the forge and co-op multiplayer are all
in now. What's still genuinely open:

- **The floor objective is one shape only** — kill the quota, kill the elites.
  `floorQuotaMet()` is where a second kind of objective would hook in.
- **The early-extraction penalty is a flat number** (`EARLY_EXTRACT_KEEP`) — bailing at
  90/92 kills costs exactly as much as bailing on the first wave.
- **Multiplayer is still deliberately basic** — the delve/rift/planet flow all work now,
  but there's no chat, no host migration, no reconnect (a departed player is out for the
  rest of the run), and no joining a run already in progress. Scope left out on purpose —
  ask before building any of it.
- **Party balance is a guess, not a measurement.** `partyScale` was reasoned about and
  checked by the smoke test, never by four people actually playing.
- **Planet floor pacing wants a real balance pass** — bigger and slower than an
  equivalent-depth delve floor, needed noticeably more generous gearing in the smoke
  test to reliably clear.
- **Planet content leans on reskinning** — same five archetypes and existing boss kits
  under a new element/title, deliberately, to avoid a second content pipeline.
- **The expedition portal doesn't persist** across a reload; low stakes since picking
  costs nothing.
- **Weapon skins and cosmetics have no planet-specific flavor yet.**

## Conventions

- Strict TypeScript. No `any` without a comment explaining why.
- Tuning numbers live in `src/data/`, not sprinkled through the sim.
- The save is versioned (`SAVE_VERSION` in `src/core/save.ts`); bump it and handle
  migration when the shape of the save changes, rather than silently corrupting
  people's progress. `loadRaw` hands the loader the old version rather than throwing the
  save away, and `GameState.load` fills in what's new.
- A cosmetic id that no longer exists is dropped on load rather than crashing the
  character screen; see `normalizeAppearance` and `normalizeOwned`.
