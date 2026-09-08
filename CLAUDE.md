# lootSim — Depths of the Unspoken

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
npm run dev     # http://localhost:5173
npm run host    # the same, on 0.0.0.0 — how you play multiplayer with people nearby
npm run build   # typecheck + bundle to dist/
npm run check   # typecheck only (tsc --noEmit)
npm run smoke   # headless simulation test (tools/smoke.ts)
npm run vocab   # combat-vocabulary acceptance test (tools/vocab.ts)
npm run prog    # progression-architecture acceptance test (tools/progression.ts)
npm run classes # pilot-class acceptance test — 6 classes against the live combat runtime (tools/classes.ts)
npm run roster  # full 21-class roster + anti-overlap audit (tools/roster.ts)
npm run test    # check + vocab + prog + classes + smoke
npm run art     # render every sprite to art-sheet.png (tools/artsheet.ts)
npm run relay   # the party relay on its own, for serving a built dist/
```

`npm run art` exists because the art is source code. A grid is forty-odd strings of forty
characters, and reading them tells you almost nothing about whether the hat lands on the
head — so the tool bakes every character, monster, boss, weapon, icon and cosmetic into
one PNG using the real palettes and the same layer order the renderer uses. **Look at the
sheet after touching a grid.** The smoke test will catch a ragged row; only your eyes will
catch a fringe that covers the eyes, or a monster that came out looking friendly.

`tools/smoke.ts` plays real dungeon floors with a scripted bot and no browser, because
`game/` is DOM-free. **Run it after any balance change.** The bot plays the way the game
asks you to: it reads boss telegraphs and gets out of the shapes, it casts the skills it
has, and it retreats when it's hurt — a bot that can't do those things measures a game
nobody is playing. It runs two twenty-dive campaigns (a player who dodges telegraphs and
one who never does), a raid boss at the recommended level with telegraph-reading on and
off, and a full Hoard Rift, retrying a floor after a death and dropping back to farm after
two, which is what a real player does and what a forced 1..12 march does not. It also
validates every generated floor and prints the depth and rift curves and the chest odds.
It has caught a difficulty curve that outran the player, a crash on large stash writes,
monsters that stood behind walls forever, and a boss whose phase-one kit could be beaten
by walking backwards. It also walks every sprite grid — `render/pixels.ts` is pure, so a
miscounted row fails a test instead of throwing in somebody's browser — and checks that
every cosmetic is drawable, that every capsule can pay out, and that wearing the entire
wardrobe changes not one number on the character sheet. It also plays a planet floor end
to end (kills and a mined node both have to pay in the planet's own material, and a boss
floor has to spawn that planet's own reskinned encounter), crafts an item against a
stocked materials bag, checks the Challenger dial actually multiplies danger, and walks
the hub's station layout headlessly, since `game/hub.ts` is DOM-free exactly like the
rest of `game/`. Two seams exist purely for it — `Dungeon.spawnArchetypeAt` and
`Dungeon.sealWaves` — which stage a controlled encounter so each monster behaviour can be
walked in isolation; the wave director never calls either.

It also proves out the floor objective (UAT §5/§6): that the quota is derived rather than
hand-set, that an elite requirement is always completable, that clearing opens a
completion portal somewhere new *and walkable from the spawn*, and that bailing out early
really does forfeit the items while a clean extract keeps the lot.

Co-op is in there too, and for the same reason: a party floor is a normal floor with more
than one `Hero` on it, so the test plays one with two bots, checks XP is shared while loot
isn't, revives a downed ally, and then runs a **real host and a real client in one
process** — the client generates its floor from the seed alone and adopts an actual
encoded snapshot, which is what catches a field that was added to the simulation and
forgotten in `net/sync.ts`.

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
**clearing it**, not by reaching an exit — UAT §5/§6.

- **The objective is a kill quota**, shown in the HUD as `Monsters 34/92 · Elites 1/2`.
  `killsRequired` is every monster the wave director will spawn (`enemiesPerWave × waves`)
  and `elitesRequired` is 0–1 by default and more under Challenger, always clamped to
  `eliteCapForFloor()` so it can never ask for elites the floor can't make. If the last
  wave is running out of bodies with elites still owed, the director **forces** them, so
  the objective is never stuck behind a bad roll. A boss floor's quota is its boss.
- **Only the wave director's own monsters count** (`Enemy.fromWave`). A summoner's chaff
  and a Splitting monster's shards can neither pad the objective nor hold it open — which
  also means a floor can clear with stragglers still chasing you.
- **Two portals.** The *entrance* portal is where you came in; it stays all floor, it
  never descends, and it is drawn dim amber rather than blue. The *completion* portal
  spawns at a fresh spot the instant the quota is met (`pickCompletionSpot`, drawn from
  `affixRng` so it never shifts the spawn/loot sequence), and it is the way onward. The
  clear cache drops around it, not the entrance — the reward lands where finishing sends
  you.
- **Bailing out is expensive** (`EARLY_EXTRACT_KEEP` in `data/modes.ts`, 15%). Leaving
  through the entrance with the quota unmet forfeits **every** unbanked item, key and
  material, keeps a sliver of the coins and gems, and never touches XP. It asks twice and
  spells out the cost first. The point is that you can never dip out of a dangerous floor
  still holding the valuable loot — **don't soften this**; it's the whole risk/reward
  decision the floor exists to create.
- **Co-op stays host-authoritative and the wire barely moved.** The snapshot gained
  exactly two counters (`kq`, `ek`) and the completion portal's position (`cp`); both
  ends *derive* `killsRequired`/`elitesRequired` from the `RunConfig` they already share.
  An early extraction needed no new run-end reason either — a client already knows the
  phase, so `party.onEnd("extract")` with the floor unfinished is self-evidently the
  penalty kind.

### The ship: portals instead of menus

`src/game/hub.ts` (simulation) and `src/render/hub.ts` (drawing) are the home base, and
they're a small explorable canvas scene, not a screen of menu rows. Every non-combat
system is reached by walking up to a **station** and pressing confirm, Diablo-portal
style: the Delve, the Abyssal Rift and the Hoard Rift each stand as their own permanent
portal; a **Star Map terminal** configures a planet expedition and spawns a portal for
it rather than diving immediately; **the Forge** is where materials get crafted into
gear; **the Quartermaster** is the door into everything that's still a DOM screen —
stash, equipment, skills, the tree, style, capsules, records, settings. A **Comms Relay**
terminal is where a co-op room is opened or joined, and a **Party Portal** appears beside
it for as long as you're in one — walking into that portal is how you ready up. `Esc`
backs out of any of those all the way to the ship, the same key that pauses a dive.

`src/ui/town.ts`'s `TownUI` still owns every one of those DOM screens exactly as before
— CLAUDE.md's original call that menu-heavy UI belongs in DOM, not canvas, hasn't
changed. What changed is *how you arrive*: `Dive`, `Rifts`, `StarMap` and `Craft` are
opened only by `TownUI.show(tab, riftMode?)` from a specific hub station and are pulled
out of the ordinary `[I]`/`[O]` tab cycle (`CYCLE_TABS` in `town.ts`) so they can't be
browsed to sideways; the rest of the tabs cycle exactly like they always did once
you've walked up to the Quartermaster.

### Run modes: the delve and the rifts

`src/data/modes.ts` owns how a run is configured, and every mode goes through the same
difficulty curve — a mode hands `profileFor` an effective depth plus a `danger`
multiplier and the curve does the rest. One curve, several ways of walking up it.

- **The Delve** — the original ladder. One floor at a time, no upper bound, descend or
  extract after every clear.
- **Abyssal Rift** — four floors and a boss, opened at a tier you choose. Brutal, and it
  pays in *rarity*: it bends the loot table hard toward the top end and gives little else.
- **Hoard Rift** — three floors and a boss. A step easier, and it pays in *volume*: coins,
  keys and a pile of drops you'll mostly sell.

A rift's difficulty is **exponential in its tier** (`dangerPerTier ^ (tier - 1)`) rather
than linear in depth, which is what makes the ladder eventually stop you. Clearing a
rift's boss opens the next tier of that rift; extracting early keeps your loot and opens
nothing. That asymmetry is the whole tension of a rift — don't soften it.

### Planets: the star map, and where materials come from

`src/data/planets.ts`. A planet expedition is mechanically a third rift flavor —
`MODES.planet` is a real `RunMode`, `planetConfig` builds a `RunConfig` exactly like
`riftConfig` does, fixed floors ending in a boss, tier compounding the danger — because
that shape already does everything an expedition needs. What a planet adds on top:

- **Its own visuals.** A `PlanetSpec` carries a full `BiomeStyle` rather than being
  bucketed by depth, so it's a distinct place rather than a reskinned floor. `Dungeon`
  and `profileFor` read `RunConfig.planet.spec.biome` in place of the depth-bucketed
  biome whenever a planet is set.
- **Its own boss, borrowed wholesale.** `planetBossSpec` copies phases, health and kit
  from an existing `BossSpec` and only overrides `id`/`name`/`title`/`element` — no new
  sprite, just a different element tint on an existing silhouette (the same mechanism
  elites and infused monsters already use), which is also why it's cheap to add a
  seventh planet without authoring a seventh boss encounter from scratch.
- **Materials.** One per element (`src/data/materials.ts`, physical included — it's the
  neutral, everyone-needs-it one, same as physical damage is the neutral damage type
  everywhere else). Kills pay in the planet's own element; so do resource nodes
  (`Level.resourceNodes`, generated only for planets, mined by pressing confirm while
  standing on one — the same key that opens a portal, since the two never overlap).
  Higher-tier planets pay more per kill and per node (`PlanetSpec.materialYield`), and so
  does cranking Challenger — `challengerRewardMult` scales every material payout exactly
  like it scales coins, since a harder floor should pay more of both. The dive and the
  rifts never touch materials — that drop type is configured entirely through
  `RunConfig.planet`, not scattered through the simulation.
- **Its own travel ladder.** Htrae is always open; clearing planet *N*'s first tier is
  what opens planet *N+1* (`planetUnlocked`), and each planet still has its own
  independent tier ladder after that (`GameState.planetProgress`, keyed by planet id —
  deliberately not folded into the fixed-`RunModeId` `riftTiers` map, because two
  different planets' tiers must never share one counter).

The star map doesn't dive you — picking a tier there spawns a portal back at the ship
(`Hub.setExpedition`); walking into that portal is what actually launches the run.

### Multiplayer: one simulation, four people

`src/net/` plus the party half of `game/dungeon.ts`. Up to four players, joined by a
four-letter room code, with **nothing to install and nothing to configure** — that
constraint drove every decision here and is worth keeping.

- **The dev server is the multiplayer server.** `vite.config.ts` hooks a WebSocket relay
  (`tools/relay.ts`) onto the same HTTP server Vite is already running, so `npm run host`
  serves the game and the room on one port and a client's relay address is simply the
  origin it loaded the page from. There is no second process, no config file, no account
  and no third-party service. The relay is dependency-free — it speaks RFC 6455 itself in
  about two hundred lines — because the project has no runtime dependencies and this one
  never has to change again.
- **The relay is dumb.** It knows about rooms, codes and peers, and forwards bytes. It
  never looks inside a game message. Every rule lives on the host.
- **The host's browser is the simulation.** Clients send the buttons they pressed and draw
  the snapshots that come back; they simulate nothing except a little local prediction of
  their own position. There is exactly one place where a hit lands or doesn't. There is no
  host migration — half a dungeon cannot be handed over — so the host leaving closes the
  room.
- **The level is never sent.** `generateLevel` is deterministic, so a `start` message
  carries a seed and a flattened `RunConfig` and every browser builds the identical floor.
  A snapshot is only what moves: heroes as objects (there are at most four), and everything
  a floor is *full* of as flat number arrays. A busy floor costs about 40 kB/s per player.

The shape of the party inside the simulation is the load-bearing part:

- **`Hero` bundles everything that used to be "the player"** — avatar, `Player`, ailments,
  ward, cooldowns, charge, potions and unbanked loot. `Dungeon.heroes` holds them all and
  `Dungeon.localHero` is the one this browser drives. Every old accessor (`d.avatar`,
  `d.player`, `d.loot`, `d.ward`, `d.specialCharge`) is now a getter onto the local hero,
  which is why the HUD, the renderer, the boss brain and the smoke test needed almost no
  changes. **Keep that indirection** — it's what stops co-op leaking into every file.
- **A remote player is an `AvatarInput`.** `core/input.ts` defines the interface a keyboard
  implements; `net/sync.ts`'s `NetInput` implements the same thing from the network. There
  is one `updateHero`, not two.
- **Difficulty scales with the party** through `partyScale` in `data/modes.ts`, read only
  by `profileFor`: monsters get much fatter and more numerous, and barely harder-hitting.
  A party can't dodge for each other, so a one-shot is a wipe waiting to happen no matter
  how many friends are watching. At one player every multiplier is exactly 1, which is why
  a solo dive behaves exactly as it always did.
- **Loot is per-hero and physical.** Drops belong to whoever walks over them; XP is granted
  to everybody in full, because nobody should ever resent a friend for the last hit. Each
  player banks into their own save on their own machine — the host's copy of somebody
  else's character is never written anywhere.
- **Down, not dead.** Running out of health downs a hero; an ally standing over them for a
  couple of seconds revives them, and clearing the floor picks everybody up. The run only
  ends when the last one falls. Solo, "downed" and "dead" are the same tick, so nothing
  about a single-player death changed.
- **The host calls it at the portal.** Descending needs the whole party standing in the
  *completion* portal; extracting is the host's alone, since it's the safe option and it
  banks everyone. Bailing out early is the host's call too, and it charges every player
  the same penalty against their own save.

Multiplayer runs the **Delve** only, at a depth the host picks. Rifts, planets and the
Challenger dial are untouched by it and stay solo for now.

### Challenger: a difficulty dial the player owns

`src/data/challenger.ts`. A multiplier the player sets themselves (Settings tab, off by
default, twenty tiers: "Nightmare I" through "Nightmare X", then "Death March I" through
"Death March X" past it), layered on top of whatever a mode and depth already imply —
it's folded straight into the same `danger` number a rift tier compounds into, so every
formula in `profileFor` that already reacts to `danger` reacts to Challenger for free.
It applies uniformly to the delve, every rift and every planet, deliberately including
the shallowest floor in the game — tier 5 reads as "roughly five times harder" on
purpose, matching how the owner described it. The rarity-bias and reward-multiplier
bonuses the dial grants both cap out well before tier 20 by design (`challengerRarityBias`,
`challengerRewardMult`) — the Death March tiers are about raw danger via `challengerMultiplier`,
which keeps compounding uncapped, not about paying out more for the extra risk.

### Crafting: the forge

`src/data/crafting.ts` plus `GameState.craftItem`. The second way to get an item,
alongside chests, monsters and boss drops — and the deterministic one: choose a
category (weapon / armor / accessory, each mapped onto the existing `EquipSlot`s rather
than a new slot system), choose a rarity, optionally choose an essence element, and
spend materials. An essence doesn't force the roll, it **weights** it — `rollItem`
takes an optional `favorElement` that triples that element's odds in the affix pool,
so a crafted item still rolls through the exact same code every dropped item does.

Crafting is capped at **mythic**. Divine and unspoken staying chest-only is deliberate:
`src/data/rarity.ts`'s "keep it absurd, the long tail is the hook" rule would mean
nothing if enough grinding could simply buy the top of the ladder outright.

### Classes, ultimates and the tree

`src/data/classes.ts`. Five classes, and a class decides exactly four things: the numbers
you start and grow with, which weapons you're built for, which skills you can ever learn,
and the one **ultimate** that belongs to you alone.

| Class | Built for | Ultimate |
| --- | --- | --- |
| Lancer | Spear | **Comet Charge** — you become the spear: cross the room, run through everything in the lane, come off the wall and do it again |
| Berserker | Great Axe | **Whirlwind** — three seconds of spinning weapon that grinds everything in reach and throws off your element in every direction |
| Swordsman | Sword, Twin Daggers | **Bladestorm** — a blur of sweeps, then every blade leaves at once |
| Magician | Staff | **Cataclysm** — fourteen telegraphed impacts across the whole floor, leaving the ground burning |
| Shaman | Talisman, Staff | **Call the Ancestors** — three totems that keep hammering the room while you fight |

The quiet half of the design is **how each class charges its meter** (`ChargeRules`): a
Berserker fills it by being hit, a Magician by spending mana, a Swordsman by critting, a
Shaman by spreading ailments. The way you earn your ultimate is the way the class wants
you to fight — a new class needs a charge rule that says something, not `perKill: 1`.

Ultimates take their element from your *gear*, not from the class (`Player.attackElement`
picks the biggest elemental fraction you're carrying). That is the whole promise: a
lightning Lancer and a fire Lancer are different characters made of the same class.

`src/data/tree.ts` is four branches per class, five nodes deep, walked top to bottom, with
a two-point keystone at the end of each. Points are one a level plus one on every fifth.
The tree deals almost entirely in **percentages and whole extra behaviours**, never flat
stats — gear scales 2^n by rarity and would out-scale a flat node by epic. Respeccing is
free and always will be, and only ever touches the tree — it never changes what class
you're playing.

The class-refactor replacement for this lives in `src/progression/` (skill-mutation
framework, behaviour-driven nodes, cross-path hybrids, Mythic Archetypes) but is not
wired into combat yet — `src/data/tree.ts` is still the live tree for all 15 legacy
classes. **All 21 canonical classes** are now built on that framework as data —
resources, 10 skills each, five behaviour-driven paths, six hybrids and a Mythic
Archetype — in `src/progression/<class>.ts` (`ALL_CLASSES`; `PILOT_CLASSES` stays the
original six that `npm run classes` drives against the live combat runtime). The full
roster is proven by `npm run roster` (`tools/roster.ts`), which runs `validateClass`,
`validateRoster`, the anti-overlap audit (`src/progression/audit.ts`), and the
hybrid/archetype threshold checks. It is browsable in-game read-only via the
**Codex** tab (Quartermaster). See `docs/progression-architecture.md`.

### Every class has its own save

`GameState.players: Record<ClassId, Player>` — each class keeps a fully independent
character: its own level, XP, tree allocation, equipped skills and equipped gear.
`GameState.activeClassId` says which one is live, and `GameState.player` is a getter
onto `players[activeClassId]`, which is why almost nothing outside `state.ts` and the
Path tab had to change — combat, the HUD and every other town screen just read
`state.player` exactly as before. Picking a class you've never played starts that
character at level 1 with an empty tree and empty hands, same as a brand new save;
switching *back* to one you have played finds it exactly as you left it
(`GameState.chooseClass` only ever moves the `activeClassId` pointer — it never mutates
a `Player`). A `Player`'s `classId` is fixed for its whole life for exactly this reason.

The stash, coins, materials, cosmetics and everything else on `GameState` stay
account-wide and shared by every class — only the character sheet itself is split out.
That means gear you outgrow on one class is sitting right there for an alt, which is
also why an item needs a level requirement: `requiredLevel()` in `game/item.ts` reuses
`ilvl` (the depth it dropped at already tracks roughly 1:1 with the level a floor of
that depth expects), minus one level of grace, and `Player.canEquip`/
`GameState.equipFromInventory` refuse to pull a too-high-level item out of the shared
stash. A level 1 alt can look at a level 30 main's gear; it can't wear it until it
catches up. The one-level grace exists because a floor's XP lands as its monsters die,
so clearing depth *N* often dings a character to level *N* only partway through (or on
the very next floor) — without it, a character playing a single class start to finish,
no alt or shared stash involved, would still routinely find their own newest drops
locked for a floor or two.

Each `Player` also tracks its own `deepestDepth`, separate from the account-wide record
stat on `GameState.stats` (which stays a lifetime best-of-all-classes number, used for
rift unlocks and the Records tab). Chests and the forge roll item level off the *active
character's* `deepestDepth`, not the account record — the first version of this shipped
reading the shared record for both, so a fresh alt's first chest purchase rolled gear at
whatever depth the main had reached, which the level lock then correctly refused to let
it wear. Item level has to track whoever's actually opening the chest.

### Weapons decide what your attack button does

`src/data/weapons.ts`. Six families, six shapes of basic attack: `sword` (arc), `axe`
(slow, enormous cleave), `spear` (long narrow thrust that pierces a rank), `daggers` (two
fast hits a press, high crit), `staff` (your attack becomes a bolt), `talisman` (a circle
around you plus a spark at something else). All six live in the weapon slot. Holding a
family your class was built for is worth `affinityBonus`; anything else hits a little
softer, and the stash's upgrade arrows know it.

A staff bolt resolves through the same path a swing does, so a caster gets crits,
leech and triggered gear exactly like somebody holding an axe.

### Items are modifier lists, not stat blocks

`src/data/mods.ts` owns the one `Mods` record everything reduces to — class base, level
growth, every affix on every item, and every allocated tree node are all the same kind of
thing by the time combat sees them. The simulation never asks which item something came
from; it asks for a number.

An item rolls a **base stat block for its type plus a list of affixes**, with the count and
the *reachable pool* both driven by rarity (`MOD_COUNTS`, `ModRoll.minTier`). That gating
is the reason to keep opening chests once your slots are full:

- `+1 projectile` doesn't exist below **epic**; `+1 ultimate bounce` doesn't below **mythic**.
- From **epic**, a weapon, ring or necklace can carry a **granted skill** — a whole extra
  castable on the fourth skill key, for as long as you wear it.
- From **legendary**, an item can carry a **trigger**: a nova on kill, bolts when you dash,
  a chain when your ultimate fires. The item plays itself, and the build starts doing
  things you never pressed a key for.

Drops roll a slot first and only then decide which weapon family, so adding a seventh
family never quietly halves everyone's chance of finding a necklace — and weapon rolls are
biased toward the class you're playing.

### Elemental damage, ailments and resistance

`src/data/elements.ts`. Six damage types: physical, fire, cold, lightning, poison, void.
Physical does what the number says; every other element trades a little raw damage for a
rider — burn (a DoT), chill (a heavy slow), shock (amplifies everything else), venom (weak,
long, stacks five deep) and drain (a DoT that eats mana). Both sides of the fight use the
same code in `src/game/combat.ts`: anything the player can do to a boss, a boss can do back.

Gear carries elemental affixes: offensive slots convert a slice of your hit into an element
(which is how an ordinary swing starts setting things on fire), defensive slots grant flat
resistance instead. Resistance is asymptotic and capped at 75%, exactly like armor. A
generic `+% elemental damage` roll multiplies whatever elements you already carry, so the
second fire mod is worth more than the first — that's what makes a themed build a build.

Monsters resist their own element hard — **except physical**, deliberately. Physical is
the damage everyone always has, and a floor that resists your sword is a floor you simply
cannot fight. Biomes have an elemental affinity and infuse an increasing fraction of their
monsters with it as you descend, which is what turns resistance on a chestplate from a
number into a decision about where you're going.

### Mana and skills

Three skills are equipped at a time (`src/data/skills.ts`), plus a fourth slot whenever a
piece of gear is granting you one, cast from the keys clustered around the attack finger.
They cost mana, sit on cooldowns, and do things a swing can't: hit a whole room, hit
through a rank of bodies, freeze a pack, plant a totem, leap onto something, or put a
shield up before a slam lands. Mana regenerates slowly on purpose — a skill should be the
answer to a moment, not a rotation filler.

**Your class decides which skills you can learn at all**; a Berserker will never *learn*
Void Lance. Within that pool everything is unlocked by levelling, and nothing is bought.
The one exception is a granted skill: an epic-or-better item can hand you anything at all,
and breaking the class rule is exactly what makes that drop worth wearing. A skill itself
knows nothing about classes, which is what keeps `skills.ts` free of cycles.

### Bosses are raid encounters, not fat monsters

`src/data/bosses.ts` defines the encounters, `src/game/boss.ts` runs them. A boss is one
enormous body that ignores knockback, has enough health that the fight lasts a minute or
two, and runs a rotation of **telegraphed abilities** — each of which asks a different
question: get out of the circle, get into the hole in the donut, step off the line, kill
the adds, stop attacking and move.

The rules the encounters follow, and which any new ability must follow:

- Every ability is telegraphed. If a hit landed, it was readable.
- Casting locks the boss in place, so its wind-up is also your window to hit it.
- Phases *add* abilities rather than replacing them, so the room gets busier as it dies.
- Boss mechanics ignore the ordinary invulnerability you get from being hit — a shape you
  watched for a second and a half is supposed to land — but a **dash always beats them**.
  Dashing through the shape is the skill the fight is asking for.
- Every phase needs at least one ability that reaches across the arena, or the fight can
  be beaten by walking backwards.

A boss floor is one wave containing the boss; everything else on it was summoned by the
encounter, and the adds evaporate when it dies. Boss arenas are generated larger and only
from the open layouts, because a two-hundred-unit quake needs somewhere to run to.

### Every floor is a generated dungeon, not one room

`src/game/level.ts` builds each floor from a seed as a **graph of connected rooms**: a
randomized spanning walk over a macro grid of room slots (a recursive backtracker, the
same family of algorithm as a classic maze generator, one room per cell instead of one
tile), with a few extra edges added afterward so it has loops and dead-end side rooms
rather than reading as one corridor. Each visited slot becomes a real room with its own
interior layout — reusing the same six interior styles as before (open, pillars,
chambers, gauntlet, rubble, ring), picked per room and occasionally left empty on
purpose — and doors only where it actually connects to a neighbor; the gaps between
connected rooms become corridors. Slots the walk never reaches are sealed off as solid
rock rather than left as an unexplained gap in the floor. Resource nodes (planets only)
land preferentially in dead-end rooms, so a detour off the critical path is what makes
one worth taking. A **boss floor is the one exception**: it stays a single large arena
from the open layouts, sized up but not fragmented into rooms, because the ability radii
in `data/bosses.ts` are tuned against that shape and a maze would quietly break "every
phase needs an ability that reaches across the arena." Planets ask for a bigger room
graph (`big: true`) than the delve and the rifts do, on top of an already bigger floor —
they're meant to feel like somewhere to actually explore.

The generator's one hard promise is unchanged: **the portal is always walkable from the
spawn** — connected by construction, and it flood-fills to check and carves a corridor
as a last-resort fallback if a layout ever manages to seal itself off anyway. The smoke
test verifies this over hundreds of floors; don't add a layout without running it.

Walls block movement, projectiles and line of sight. Monsters that can see you charge; ones
that can't follow a breadth-first flow field rebuilt around the player four times a second
(`FlowField` in `level.ts`). Without that they stand behind pillars and the floor never ends.
The flow field is generic over whatever walls happen to exist, which is the whole reason the
room-graph rewrite only had to touch how walls get arranged, not the pathing, the spawning,
the renderer, or anything downstream of `Level`.

### Difficulty philosophy

Pressure, not sponginess. Enemy health is allowed to grow roughly with the gear curve, but
the things that actually make a deep floor frightening are damage (quadratic in depth),
speed, count, hazards, and `aggression`/`telegraph` in `DepthProfile` — deep monsters attack
more often and wind up faster. Reading a telegraph and dashing is the skill the game asks
for, and the smoke test measures exactly that: a bot that never dodges stalls out around
depth 12, one that dodges half the time reaches the high teens.

The class overhaul put roughly 70% more damage in the player's hands and the enemy health
base was raised to take it back. Any change to classes, weapons, the tree or the ultimates
moves that dial — run the smoke test and look at the two campaign depths and the boss
fight length before deciding you're done.

Boss floors are measured differently, because a raid boss that one-shots a careless player
is a wall rather than a fight. The test runs the same character on the same floor with
telegraph-reading on and off and asserts the *damage bill* diverges sharply and the potion
belt empties. If ignoring the shapes ever stops costing roughly half your health, the
mechanics have stopped being mechanics.

The economy is deliberately slow. Coins per kill, per-kill gear drops, key drops and the
vendor's `SELL_RATE` were all cut hard, and most of a floor's actual pay comes from the
**clear cache** dropped around the completion portal when the quota is met — a reward you
only get by finishing, still lose by dying on the way out, and can't carry through the
entrance portal either.

### The look: simple pixel art, menacing monsters, a plain hero

The art direction is small, clean pixel art — **the smaller and simpler the grid, the
better.** An earlier pass doubled the authoring resolution and pushed the hero toward
sharp, angled features; the owner's call on seeing it was blunt — it read as "scary and
odd" on the character you're supposed to like looking at, not the monsters. The fix was a
full resolution rollback, not a partial one: the character field is `CHAR_W` x `CHAR_H`
(**30x26**) with the 20x22 body at (`BODY_DX`, `BODY_DY`), monsters are 18–24 wide and
raid bosses are drawn on a **26x26** field. `SPRITE_SCALE` (1.2) and `WEAPON_SCALE` (1.5)
in `render/draw.ts` and `spriteScale` in `data/bosses.ts` scale back up to match, so
**nothing changed size in the world** — only how much detail is on screen. If you change
the authoring resolution again, change all three in the same commit, and don't assume
finer detail is an improvement — ask before doubling it again.

**The hero is plain and calm, not scary.** Small eyes, a simple neutral face, no angled
brows or slit pupils — the character is meant to be pleasant to look at across a long
session, not to look like a threat. Don't drift the hero's face back toward the monsters'
design language.

**The monsters and bosses are still the menacing half, just simpler.** Horns, plate,
spines, hoods and slit or glowing eyes still read as a problem, they're just drawn with
fewer pixels now. The only bright colour on a monster is the part of it that is looking at
you, which is what makes an eye read as a threat even at this size — every monster and
boss palette stays deliberately low and dirty apart from that one hot accent.

The important structural point is that **a character is not a sprite, it is a stack**.
`render/pixels.ts` holds a bare body with no hair, five hairstyles, and one grid per
cosmetic; `render/sprites.ts` composes back item → body → hair → face → ears → hat into a
single canvas and caches it against the appearance that produced it. That order is why a
pair of horns sits on top of the hair and under a witch hat without anyone writing a
special case. Every layer is authored in the same 40-wide body space and placed with an
offset, so a new hat is one grid and it fits every head automatically. The character field
is much wider than the character on purpose: wings that only peek out from behind the
shoulders are not wings.

Two conventions do most of the work and are worth keeping:

- **Silhouette first, outline last.** A shape is filled solid and then every cell of it
  that touches transparency becomes `OUTLINE`. Interior detail is stamped afterwards and
  never overwrites an outline pixel, which is why nothing has a ragged edge.
- **Hair shades where it meets the face rather than outlining.** A fringe casts a shadow
  on a forehead; a black bar across the brow line reads as a helmet.

**Weapons are their own sprites**, authored pointing along +x with a named grip pixel, and
rotated at draw time along the arc, thrust or spin the simulation actually resolved. A
weapon's palette comes from the item's rarity — steel blade, rarity-coloured stone in the
pommel, a bloom from epic upward — unless a cosmetic skin overrides it. They are drawn at
the size they hit at: an axe bit really is wider than a torso and a spear really does
out-reach a sword, because reach is the difference between the families and it should be
legible before the numbers are.

The two render modules split on purity, and the split is load-bearing: `pixels.ts` is
grids *and palettes* with no DOM, so the smoke test and the contact-sheet tool can both
ask for the real colours. `sprites.ts` is the half that owns canvases.

Effects follow the same brief. `render/fx.ts` speaks in crescents, four-pointed impact
stars, sparkles, embers and shards rather than grey puffs. The swing crescent is driven by
a `swing` event the simulation emits carrying the arc it actually hit along, so what you
see is the hitbox rather than an impression of it.

### Cosmetics: gems, capsules and the wardrobe

`src/data/cosmetics.ts` owns the vanity half of the game, and its first rule is that
**cosmetics are powerless**. Nothing in that file is ever read by the simulation, rolls a
stat or touches a modifier. The smoke test asserts it: it dresses a geared character in
every slot and checks the character sheet is byte-identical. That guarantee is what lets
the capsules be generous — a hat can never be the reason a floor went badly.

The economy is separate too. Cosmetics are bought with **gems**, which drop in the
dungeon, bank and are lost on death exactly like coins, and are spent on nothing else.
Coins never become gems and gems never become coins; `gemMult` on a `RunMode` is where a
mode says how much it pays in them, and the Hoard Rift is the one that funds a wardrobe.

- Six slots: **hat**, **ears**, **face**, **back**, **aura** and **weapon skin**. The
  first four are pixel layers, an aura is particles that follow you, and a weapon skin is
  a palette painted over whatever your hands are holding.
- Free on top of that: hairstyle, hair colour, skin tone, eye colour and an outfit dye
  that recolours whatever you're wearing. Nobody pays for those — deciding what you look
  like should not be a currency sink.
- Three **capsules** (Trinket / Boutique / Starlight) roll against the same eight rarities
  the loot uses, but on a much flatter curve: a wardrobe you can never finish is a chore.
  The one exception is the unspoken aura, which is as absurd as an unspoken item and is
  meant to be.
- Duplicates refund gems, so a bad pull still walks you toward the next one.

The **Style** and **Capsules** tabs in town cover all of it, navigable by keyboard or mouse
like everything else, with a live portrait rendered from the same composed sprite the
dungeon draws.

## Controls — keyboard drives everything, mouse is a first-class option

The original design was exclusive keyboard, no mouse anywhere. The project owner reversed
that call: the game now defaults to **mouse + keyboard** — WASD moves, the mouse aims and
attacks — with a **Settings → Controls** toggle back to the original **keyboard only**
scheme for anyone who prefers it. Whichever scheme is active, **every menu in the game is
always mouse-navigable** — rows, tabs and the small secondary-action chips all take a
click — independent of the combat control scheme. What changed is real, not cosmetic:
combat aim now genuinely depends on the mouse when that scheme is chosen, and it's a
choice the player owns, not a hard rule anyone should re-litigate without being asked.

- **Mouse + keyboard** (the default): WASD still moves, but facing — and so every attack
  and skill — points at the cursor regardless of which way you're walking, the way any
  twin-aim action game works. Left click (or hold) attacks; right click casts whatever
  `Settings` has it bound to (skill 1 by default, and reassignable to any skill, dash or
  the ultimate). `src/game/dungeon.ts`'s `updateAvatar` is where this branches: aim comes
  from `input.mouseWorldPosition` when `input.usesMouseAim` is true, and from the movement
  vector otherwise — the same code path both schemes share downstream, since a mouse click
  and a keypress both just set the same `Action` in `Input`.
- **Keyboard only**: the original game, unchanged — you face whichever way you're moving,
  and the mouse touches nothing in the dungeon at all.
- **Every action is rebindable — nothing is reserved, movement and menu navigation
  included.** The project owner pushed back a second time on the original "WASD and the
  menu keys are locked" design: being unable to move I/O off tab-switching, or reclaim
  Space, felt like an arbitrary restriction once the owner went looking for it. There is
  no reserved-key set any more. This is safe specifically *because* every menu is always
  mouse-clickable too — there's no keyboard state a player can get into, short of
  unplugging their mouse, that locks them out of their own Settings screen. Rebinding two
  actions to the same key swaps them rather than leaving them to silently fight over it.
  Each action is bound to exactly one physical key; there are no hidden always-on
  fallbacks any more either (there used to be one for Space and the number row) — what
  `Settings` shows for a row is the entire truth about what fires it.
- **Menus are always mouse-navigable, regardless of combat scheme.** `TownUI` wires a
  single click delegate in `src/ui/town.ts`'s constructor: `data-index` on a row selects
  and fires it, `data-tab` on the tab bar switches tabs, and `data-action="left" | "right"
  | "secondary" | "tertiary"` on the small `.chip` buttons sprinkled through each tab's
  aside mirror the adjust, cancel and ultimate keys exactly. None of it replaces the
  keyboard path — every keyboard-driven method (`adjust`, `primary`, `secondary`,
  `tertiary`) is the literal function a click calls.

| Key (default) | Action |
| --- | --- |
| `W` `A` `S` `D` | Move / navigate menus — each direction is its own rebindable action |
| Mouse | Aim (mouse + keyboard scheme only) |
| Left click, or `J` | Attack |
| Right click | Whatever `Settings` binds it to (skill 1 by default) |
| `K` | Dash (grants i-frames) |
| `L` | Drink potion (restores health and some mana) |
| `U` `H` `N` | Cast the three equipped skills |
| `M` | Cast the skill your gear grants you, if it grants one |
| `;` | Your class ultimate — costs a full charge meter |
| `E` | Confirm / interact |
| `Q` | Back / cancel |
| `I` / `O` | Previous / next tab (Quartermaster's screens only) |
| `Esc` | Pause a dive, or back out of a town screen to the ship |

Every row above is just the shipped default — `Settings` can rebind every single one of
them, this table included, so treat it as "what a fresh character starts with," not as a
list of fixed keys anywhere else in this document.

Bindings live in `src/core/input.ts` and `src/data/settings.ts` (the rebindable keymap
and the mouse scheme both persist in the save, `RebindableAction`/`REBINDABLE_ACTIONS`
list all seventeen of them); `combatHints()`, `skillKeys()` and `townHints()` in
`core/input.ts`, plus `tabHelp()` in `src/ui/town.ts`, are the single source of truth for
every on-screen legend, reading the *live* settings — don't hardcode a key name or
"click"/"press" wording anywhere in the UI, since a rebind or a scheme switch has to move
every legend that shows it in the same frame.

## Architecture

```
src/
  core/     rng, input, fixed-timestep loop, localStorage save, math helpers
  data/     rarities, item tables + affix pool, chest tiers, enemy archetypes, depth
            curves, biomes (palettes + which layouts and hazards they allow), trap specs,
            elements + ailments, modifiers, weapon families, classes, ultimates, skill
            trees, skills, run modes (delve/rifts/planet), planets, materials, crafting,
            the challenger dial, boss encounters, cosmetics
  game/     state, player, level generation + pathfinding, the dungeon run and the party
            of heroes in it, the ship hub (hub.ts), ailment bookkeeping (combat.ts),
            the boss brain (boss.ts)
  combat/   the class-refactor combat vocabulary (Phase 1): damage packets + channels,
            the status/DoT framework, the generic resource model, the event bus,
            targeting, the Ability/EffectStep schema and the generic runEffect executor.
            Pure, DOM-free, dungeon-free — see docs/combat-vocabulary.md. Not yet wired
            into game/dungeon.ts; that migration is a later phase.
  progression/ the class-refactor build layer (Phase 2): the skill-mutation framework
            (rewrite an ability in place, no second skill id), skill tree v2 (nodes that
            alter behaviour, not just stats), cross-path hybrids and three-path Mythic
            Archetypes. resolveBuild/applyBuild is the seam. Pure. All 21 canonical
            classes are built here as data (ALL_CLASSES; PILOT_CLASSES is the original
            six), plus audit.ts (anti-overlap checks) and matrix.ts (the class matrix).
            Not wired into combat yet; browsable via the Codex tab. See
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
tools/      headless simulation test, art contact sheet, the party relay (relay.ts,
            attached to the dev server by vite.config.ts)
legacy/     the original Tkinter game, kept for reference
```

Rules of thumb:
- `data/` is pure data + pure functions. No DOM, no canvas, no `GameState` imports.
- `game/` is simulation only. It must never touch the DOM or draw anything.
- `render/` and `ui/` read state and draw. They never mutate simulation state.
- `render/pixels.ts` is the exception that proves the rule: it is inside `render/` but has
  no DOM in it, because the art has to be testable and viewable from Node.
- The sim runs on a **fixed timestep** (60 Hz). Rendering interpolates. Don't put gameplay
  logic in the render path or it will break at other framerates.
- `net/` may import from `game/` and `data/`; nothing in `game/` or `data/` may import
  from `net/`. The simulation must never know it's being watched.

## Carried over from the Python original (do not casually change)

These are the identity of the game and were tuned by the owner:

- **Eight rarities**: common, uncommon, rare, epic, legendary, mythic, divine, unspoken —
  with their exact colors and `2^n` stat multipliers (1→128). See `src/data/rarity.ts`.
- **Chest tiers**: Basic / Advanced / Elite / Legendary, their prices, and their per-rarity
  weight multipliers (higher tiers zero out the low rarities).
- **Item name tables**: every original string is still in `ITEM_NAMES`, verbatim. The
  original `weapon` list held a sword, an axe and a mace at each rarity; those are split
  across the `sword` and `axe` families so nothing was lost, and spear, daggers and
  talisman names were written to match. All weapon families share the weapon slot.
- **Base rarity odds**: tightened past the original numbers on the owner's call — unspoken
  is now ~1 in 250,000 from a Basic chest, rarer than divine rather than tied with it, and
  everything from epic up got cut hard. `BASE_RARITY_WEIGHTS` in `src/data/rarity.ts` is
  the single point every source of items reads through (chests, monster/boss drops, the
  clear cache), so a change there nerfs or buffs all of them at once. Keep it absurd —
  the long tail is the hook.

Anything else — combat, adventures, stats, zones — was replaced and is fair game.

## Planned direction (not built yet — check before starting)

The rifts, the cosmetics, the ship hub, planets, the forge and co-op multiplayer are all
in now. What's still genuinely open:

- **The floor objective is one shape only.** It's "kill the quota, kill the elites";
  UAT §5 floats additional completion mechanics (stopping a ritual, and similar) for
  higher difficulties, and none of that exists. `floorQuotaMet()` is the single place
  a second kind of objective would hook in.
- **The early-extraction penalty is one flat number** (`EARLY_EXTRACT_KEEP`). It doesn't
  scale with how far through the floor you were, which would be a reasonable ask — bailing
  at 90/92 kills costs exactly as much as bailing on the first wave.
- **Multiplayer is delve-only, and deliberately basic.** Rifts, planets and Challenger
  are single-player; there's no chat, no host migration, no reconnect (a dropped player
  stays on the floor as a body until the run ends), and no way to join a run already in
  progress. Playing with somebody outside your network needs a tunnel to the host's
  machine. All of that is scope that was left out on purpose, not oversight — ask before
  building any of it.
- **Party balance is a guess, not a measurement.** `partyScale` was set by reasoning about
  where the pressure should come from (volume, not one-shots) and checked by the smoke
  test, never by four people actually playing. It wants real playtesting.

- **Planet floor pacing wants a real balance pass.** They're bigger and take longer to
  clear than an equivalent delve floor at the same nominal depth, which means more
  sustained exposure for an imperfect player — the smoke test needed noticeably more
  generous gearing to reliably clear one than an equivalent-depth delve floor does.
  Worth another look with real playtesting, not just guessed at again.
- **Planet content still leans on reskinning.** Every planet's roster is the same five
  archetypes under a planet-flavored name, and every planet boss is an existing
  encounter's kit under a new element and title. That was the deliberate, scoped choice
  to avoid a second content-authoring pipeline — genuinely bespoke monsters or a boss
  built from scratch for a specific planet is a reasonable future ask, not a mistake to
  fix reflexively.
- **The expedition portal doesn't persist.** Picking a planet at the star map spawns a
  portal in the hub for that session only; reloading the page loses it and you have to
  pick again. Low stakes since picking costs nothing, but worth a save-state field if
  it turns out to annoy anyone.
- **Weapon skins and cosmetics have no planet-specific flavor yet** — the wardrobe
  economy (gems, capsules) is untouched by any of this and could grow toward planets
  the same way it already leans on the Hoard Rift.

## Conventions

- Strict TypeScript. No `any` without a comment explaining why.
- Tuning numbers live in `src/data/`, not sprinkled through the sim.
- The save is versioned (`SAVE_VERSION`, currently 12); bump it and handle migration when
  the shape of the save changes, rather than silently corrupting people's progress.
  `loadRaw` hands the loader the old version rather than throwing the save away, and
  `GameState.load` fills in what's new — an existing character must survive the game
  growing a mana bar, or a wardrobe.
- A cosmetic id that no longer exists is dropped on load rather than crashing the
  character screen; see `normalizeAppearance` and `normalizeOwned`.
