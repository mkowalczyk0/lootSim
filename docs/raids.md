# Raids — the design record (UAT §15 / §16)

`src/data/raids.ts` owns the whole feature. This file is why it looks the way it does.
Where the two disagree, the code is right and this is stale — but the *reasons* here are
the ones the decisions were made for, so read them before overturning one.

## What a raid is

`docs/game_story_worldbuilding.md` (RAID BOSSES) says it plainly: not a large demon, but
"an enormous mythological event" — a fallen celestial being, an ancient god, a
mythological monster given a body by this war. MYTHOLOGICAL COMPOSITES says the game may
reinterpret rather than reproduce, and that "every reinterpretation should still feel like
it belongs to the game's cosmology". EXAMPLE RAID BOSSES then names four.

Those four are the roster, and no fifth was invented:

| Raid | Layer | Element | Borrows | Opens at frontier |
| --- | --- | --- | --- | --- |
| The Ferryman | The Threshold | cold | `warden` | 12 |
| Queen of the Seventh Circle | The Hell Layers | fire | `herald` | 16 |
| Minotaur of the Ninth Labyrinth | The Hell Endgame | void | `colossus` | 26 |
| Tyrant of the First Heavens | The Celestial Endgame | holy | `choir` | 26 |

The layer column is not a decoration. `data/layers.ts` reserved `WorldLayer.raidId` for
§15 and its comment had **already** sorted these four onto exactly these layers; this pass
honoured that sorting rather than re-deciding it.

## The five decisions worth arguing about

### 1. One floor, and that floor is the boss

`MODES.raid` is rift-shaped with `floors: 1`. Three reasons, in order of weight:

- §15 asks for raid **bosses**, and Chunk 10 for "raid boss mechanics". The thing the mode
  exists to deliver is the fight.
- "Extremely difficult" only works if a wipe is cheap to retry. A gauntlet floor in front
  of the encounter taxes every attempt at the encounter, which teaches people to stop
  attempting it.
- The clear cache already pays a `lastFloor` run 2.4× (`Dungeon.dropClearCache`), so a
  one-floor raid still pays like a run rather than like a floor.

If a raid ever grows a second floor, the tier-ladder check in `tools/raids.ts` §8 is
written against `lastFloor` rather than against the floor count, so it will keep meaning
what it means.

### 2. There is no raid difficulty curve

A raid tier compounds `danger` exponentially (`dangerPerTier ^ (tier - 1)`, per raid) and
hands the result to the same `profileFor` every other mode walks. `tools/raids.ts` §4
compares a raid floor against a Delve floor at the same effective depth and danger across
`enemyHealth`, `enemyDamage`, `enemySpeed`, `aggression`, `telegraph` and
`recommendedLevel`, at four tiers of every raid — the same property `tools/world.ts` pins
for the Tower's height-for-depth. **Balancing a raid by nudging its own numbers goes red
immediately.** What makes a raid the hardest thing in the game is the encounter and the
gate, not a steeper curve.

### 3. The encounter is borrowed, reskinned, and then rebuilt

`raidBossSpec` follows `planetBossSpec` (sprite, kit and phase shape wholesale from an
existing `BossSpec`, so a fifth raid never costs a fifth content pipeline) and then
`legendBossSpec` (the rebuild). What the rebuild does, all of it the `CLAUDE.md` boss rules
made structural rather than trusted:

- every phase is the union of every phase before it, so the room only ever gets busier;
- the raid's `signature` folds in — one ability from phase one so the fight reads as itself
  from the first cast, all of them from phase two;
- a final phase is **appended**, never substituted: everything it has plus `enrage`,
  faster, with a wave of adds;
- the haste and adds of every phase are floored at the deepest authored encounter's phase
  at the same index;
- the stat line comes off that **reference encounter**, never off the borrowed template.

That last one is the mistake `data/legends.ts` documents having made and measured its way
out of: the authored encounters range from 72 health to 145, so a raid scaled off a shallow
template would come out weaker than the ordinary boss floor at its own depth. `RAID_HEALTH`
1.7 and `RAID_DAMAGE` 1.15 are multiples of the depth-30 encounter.

**No new `BossAbilityId` was added.** Four distinct fights out of the existing vocabulary
is what makes them cost four data entries; if a raid ever genuinely needs a new shape, add
it to `data/bosses.ts` for everybody rather than special-casing a raid.

### 4. §16 is the reward curve plus a tier gate — and nothing else

§16 ("Raid Drop Rarity") asks that a raid's difficulty tiers move five things. Four of them
are `rewardCurve(danger)` (`data/rewards.ts`): drop chance, drop count, item power and
special variants. Every tier climbs all four for free by moving `danger`, and
`tools/raids.ts` §5 asserts it as a **direct comparison** (tier 9 beats tier 1 on each
axis) rather than as a one-sided bound — the lesson `CLAUDE.md` records from the
sharp-vs-reckless campaign inversion.

The fifth, **drop rarity**, is deliberately not an axis of that curve. `CLAUDE.md` is
explicit that a second rarity term keyed on `danger` would route around the Challenger
rarity cap. So a raid says it as a **drop table** instead: `minTier` on a `raid` source
means the rarest half of a raid's table does not exist below a tier. Tier 8 drops something
tier 1 *cannot*, rather than a better roll of the same thing. That is §15's own sentence —
"the hardest bosses should contain some of the most desirable equipment in the game" —
without a second curve.

`MODES.raid.rarityBias` (0.14) is the raid's rarity lean, and it is a constant per mode
like every other mode's. It does not move with the tier, and §5 of the acceptance tool
asserts that it doesn't.

### 5. A raid holds a layer's gate — and gates nothing

`WorldLayer.raidId` is now filled in on four layers. **It is a reading, not a lock.**
Nothing in the simulation reads a layer and that has not changed: descending or climbing
past a band never asks whether its raid is dead. The only gate involved is the raid's own
`unlockFrontier`, read off `GameState.frontier` — the further of the depth record and the
height record (§21), so a climber earns the Tyrant exactly as a delver earns the Minotaur.
Widening only, like every §23 unlock.

The link is asserted from both ends (`tools/raids.ts` §2): every raid names a layer that
names it back, no two layers claim the same raid, and a Delve floor at every band edge
still profiles normally with the raid standing there.

## Acquisition

Eight named items (two per raid) and eight relics (one relic-tier and one artifact per
raid). Every one of them carries a **single** `raid` source and nothing else, so §15's
"those items cannot be obtained through normal gameplay" is structural rather than a
convention somebody has to remember.

`raid` is its own drop kind rather than a `boss` source with `mode: "raid"`. That matters
because the Tyrant borrows the Choir's kit: addressing the table by the *raid* is what
stops the Crown of the Exiled falling off a depth-10 Delve floor. `tools/raids.ts` §6
asserts exactly that, in the table and again in a live dungeon.

One of each pair is tier-gated (`minTier` 3–6), which is §16 above.

**Names are cosmology.** The Heaven-side relic and artifact are named after **Thrones**,
never Dominions: THE THREE-SIDED COSMOLOGY is explicit that Dominion is *Hell's* word
("Creation belongs to those strong enough to claim it") while the Thrones are Heaven's
living law. The Tyrant's relic is `Spark of the Tyrant`, which the worldbuilding doc names
outright; the rest are written to the roster's existing rule — an object the encounter
itself left behind, named out of the cosmology it belongs to.

## Solo, in v1

§15's eventual ask is 4-20 players. This ships as one player, the same call `data/daily.ts`
made for the Vigil and `data/legends.ts` for the Proving, and for the same reason: the
party half of the game is host-authoritative and every new mode that crosses the wire is a
new way for two saves to disagree.

The seam is **open rather than merely unclosed**. `RunConfigWire` carries
`raidId`/`raidTier` and `configFromWire` rebuilds a raid through `raidConfig`, so a raid
that ever does cross the wire is built by its own builder instead of collapsing into a
raid-shaped run with no raid in it. What stops one today is one branch in
`main.ts#handleHubInteraction` — one place to delete.

**A co-op attempt was built and measured, and then not shipped.** `RAID_HEALTH` is the
one-player fight; `partyScale` was assumed to be the multiplier a party pass would tune,
but measuring a real co-op fight (`tools/bot.ts`'s `playFloorParty`) found it doesn't
transfer to a single body at all — see `docs/raid-party-scaling.md` for the numbers and
why. The wiring (the branch above, plus the War Table and Raid Portal joining the party's
ready-spot flow) was built alongside a first attempt at a fix and reverted with it; it
survives, unmerged, on `investigate/raid-party-scaling` for whoever picks this back up.

**Loot is per-hero and physical**, which is already true of every other mode; a raid's
single-source exclusives have never been rolled for four people at once.

## Where it is reached

The **War Table**, a terminal on the Citadel deck (`game/hub.ts`), which picks a raid and a
tier and spawns a **Raid Portal** — the Reliquary Gate's shape exactly, because a raid is
chosen the same way a sector is and there are four to choose between. The screen is
`TownUI`'s `Raid` tab (`STATION_TABS`, so it cannot be browsed to sideways).

**Unverified by eye.** Nobody on this branch has a browser. The War Table's deck
coordinates and the Raid Portal's are reasoned about against the other stations, not
looked at, and the War Table is **not painted into `hub.citadel-deck`** — it draws its own
terminal (`UNPAINTED_KINDS` in `render/hub.ts`) until an art pass bakes it in, which is the
honest state rather than a caption floating over empty flagstone.

## What is deliberately not here

- **Weekly scheduling.** §15 calls raids "weekly events" and Chunk 10 lists weekly
  scheduling. The game already has a weekly (`data/weekly.ts`, the Convergence) and a
  daily, and a raid roster that is only open one week in four would be four pieces of
  content nobody can test. Raids are always open. If a rotation is wanted, `weekNumber()`
  is right there and a featured-raid read is about five pure lines — but it should not
  *pay* more without moving `danger`, or it becomes a second reward curve.
- **A fifth raid.** The doc names four. Adding one means writing cosmology, which is the
  one thing `docs/game_story_worldbuilding.md` is read-only in order to prevent.
- **New boss abilities, new archetypes, new monster pipeline.** See decision 3.
- **A raid-specific tileset.** Three of the four arenas reuse a committed sheet whose theme
  genuinely matches. The First Heavens names none, because no Heaven sheet has been painted
  — the same state the Tower ships in, and for the same reason: declaring an id whose PNG
  is not committed would fail `npm run smoke` and claim art the repo does not have.

## The gate

`npm run raids` (`tools/raids.ts`, in `npm test`). Eight sections, each an assertion of
something above rather than a description of it: the roster, the layer link from both ends,
the boss rules (via `tools/bossrules.ts`, the same audit the Provings are held to), one
curve, §16 as a comparison, §15's exclusivity plus the §20 preview property at both sides
of a raid's tier gate, a live dungeon that spawns and pays, and the save ladder.

`tools/bossrules.ts` is new: it is `tools/legends.ts`'s boss-rule audit, extracted
unchanged, so raids and Provings are held to **one** copy of the rules. Two copies of "what
a boss is allowed to do" is exactly the fork this codebase keeps paying for elsewhere, and
the second copy is always the one that quietly gets a rule wrong.
