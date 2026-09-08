# The Vigil — Daily Dungeon v1 (UAT §17)

Design sketch first, ledger at the bottom. Branch `feature/daily-dungeon`, worktree
`../lootSim-daily`. Scope is v1 of the *daily* half of §17 only: the floor, a way in, and
the reward. Weekly, leaderboards, completion tracking UI, unique mechanics and rewards
preview are later chunks by §17's own wording.

## What it is

**One floor a day, the same floor for everyone.** A Standard Rift in the lore's terms —
the Keepers keep a *vigil* over the day's breach and close it (`game_story_worldbuilding.md`
§ The Rifts / Standard Rifts; "Breach" is avoided because *Infernal Breach* is already a
named Reliquary scenario). In game terms: a single cleared floor, kill quota as usual,
completion portal → extract banks everything plus the day's reward. `lastFloor` is true,
so there is no descend; the entrance portal is the usual penalty exit.

Everything about the floor derives from one integer, **the UTC day number**
(`Math.floor(Date.now() / 86_400_000)`):

- **Seed** = a mix of the day number (splitmix-style, so consecutive days share nothing).
  Fed to `Dungeon` as its seed, exactly as a co-op `start` does today, so `generateLevel`
  builds the identical layout for everyone.
- **Depth** = a day-derived pick from a band (proposed 6–14). Fixed per day, shared by
  everybody, because layout depends on depth and "identical floor" has to be literal.
- **Two modifiers** = a day-derived pick from a small pool (below). Shared.
- **The day's key** = the guaranteed reward's tier, day-derived (below). Shared.

Only `danger` is personal — the Challenger dial folds in as it does everywhere else, so a
Death March player's Vigil is harder without being a different floor.

**UTC, not local midnight.** Two friends on a call in different time zones should be
talking about the same floor; a local reset would hand them different ones on the same
evening. UTC also gives the save a single unambiguous "cleared on day N" integer with no
DST edge. The screen shows the countdown to the reset so the choice is legible.

## Modifiers — nothing new, only knobs that already exist

`RunConfig` gains `daily?: { day: number; modifiers: readonly DailyModifierId[]; keyTier: ChestTier }`
alongside `planet`, and `profileFor` / the `Dungeon` constructor read it. Every modifier
is a multiplier on a `DepthProfile` field or an existing quota — no new behaviour in the
sim, same as how `partyScale` and `planet` already ride through `profileFor`.

| id | player-facing | what it does | where |
| --- | --- | --- | --- |
| `ferocity` | Ferocious | `danger × 1.3` | `RunConfig.danger` |
| `swarm` | Swarming | `enemiesPerWave × 1.35`, `enemyHealth × 0.8` | profile |
| `hunt` | Elite Hunt | `elitesRequired + 2` **and** `eliteCapForFloor + 2`, so the floor can actually make them | `Dungeon` ctor |
| `hasty` | Hasty | `telegraph × 0.85`, `aggression × 0.9` | profile |
| `bounty` | Bountiful | `quantity × 1.5`, `coinMult × 1.3` | profile |
| `frugal` | Sparse Ground | `quantity × 0.6` but `rarityBias + 0.08` | profile |

Two per day, never both `bounty` and `frugal`. Deliberately at most one "reward" modifier
so the day's payout stays predictable.

## Reward — "this mode pays in keys"

Following how `gemMult` makes the Hoard Rift *the* wardrobe mode: the Vigil is the one
reliable source of **chest keys**, which are otherwise deliberately scarce ("the chests are
the slot machine, not the payout"). The clear cache on the Vigil drops **one guaranteed
key of the day's tier**: Advanced most days, Elite about one day in four, Legendary about
one day in twelve (day-derived, shown on the screen before you enter — a modest "rewards
preview" without building the later-chunk feature). Mode multipliers: `xpMult 1.4`
("reliable progression"), everything else 1 — the floor's ordinary loot is ordinary.

**Once per day.** Clearing sets `GameState.daily = { clearedDay }`; the portal reads
"Closed until the next Vigil" for the rest of that UTC day. Deaths and bail-outs don't
mark it cleared, so you can retry until you win. This is what keeps it from being a farm
and from replacing the delve: at most one key a day, and a depth-8-band floor is a
warm-up for a deep character and a real fight for a level-8 one.

Unlock: `deepestDepth >= 6` (the bottom of the depth band), mirroring rift unlocks.

## Entry

A spawned portal on the deck, like the Reliquary Portal: `HubStationKind` `"vigil"`,
label "The Vigil", at a free spot on the flagstone. Confirm opens a station screen
(`Tab` `"Vigil"`, in `STATION_TABS`, not the `[I]/[O]` cycle) showing: the day's depth
and biome, the two modifiers with one-line explanations, today's key tier, the countdown
to reset, cleared-or-not, and one Enter row. Enter calls the existing `onDive` with a
`dailyConfig(day, challengerTier)`; the day seed rides on `RunConfig.daily.seed` and
`Dungeon` uses it when nobody hands in another, so `main.ts` only gains the station.

**Solo in v1.** In a room the Vigil station behaves like the other run stations do for a
client ("the host picks the portal") *and* refuses to be picked by the host, because
`RunConfigWire` doesn't carry `daily` and the once-a-day bookkeeping is per account.
Co-op Vigil is a one-line `RunConfigWire` addition later if wanted.

## Save

`GameState.daily: { clearedDay: number }` (0 = never). `SAVE_VERSION` 15 → 16; loader
fills `{ clearedDay: 0 }` for older saves. `stats.vigilsCleared` counter for Records.

## Acceptance checks (`tools/smoke.ts`, new `=== the vigil ===` section)

- Same day → identical seed, depth, modifiers, key tier; adjacent days differ in seed;
  the depth band and the modifier pair rules hold over a year of days.
- Two `Dungeon`s built from the same day produce identical level fingerprints.
- Each modifier moves exactly the profile field it claims and nothing else.
- Clearing marks the day; a death doesn't; the day's key lands in the clear cache and
  only there; a second clear the same day is refused at the entry point.
- Save round-trips `daily` and an old save loads with `clearedDay 0`.

## Decisions (PM, 2026-09-08)

1. **Name: "The Vigil."** Approved — fits the Keepers' mandate, avoids *Infernal Breach*.
2. **Depth band 6–14, unlock at 6.** Approved as the v1 starting point. ⚠ **These are
   guesses that want a real playtest pass**, the same way `partyScale` does: nobody has
   measured how many days a level-8 character can't close, or how boring a depth-6 day is
   for a depth-40 one. `DAILY_DEPTH_MIN` / `DAILY_DEPTH_MAX` / `DAILY_UNLOCK_DEPTH` in
   `src/data/daily.ts` are the knobs; `dailyPlan` draws from a side stream so moving them
   never changes the layout a day already had.
3. **Key odds as proposed** (Advanced ~2/3, Elite ~1/4, Legendary ~1/12), no Elite cap.
   Showing the tier before you enter lines up with §20's drop-preview philosophy.

## Where it lives

- `src/data/daily.ts` — the calendar (`dayNumber`, `msUntilReset`, `daySeed`), the
  modifier pool, `dailyPlan` / `dailyConfig`, `dailyUnlocked`, and every tunable.
- `src/data/modes.ts` — `MODES.vigil` (rift-shaped, one floor, `xpMult 1.4`) and
  `RunConfig.daily`.
- `src/data/depth.ts` — `profileFor` folds `dailyEffects` into health / count /
  telegraph / aggression / quantity / coins / rarity bias; `buildTag` names the twists.
- `src/game/dungeon.ts` — the seed comes off `config.daily` when nobody hands one in;
  Elite Hunt raises both the quota *and* `eliteCapForFloor` (the first smoke run caught
  that the quota alone clamped straight back to a cap of 1); the clear cache drops the
  day's key.
- `src/game/state.ts` / `src/core/save.ts` — `GameState.daily.clearedDay`,
  `stats.vigilsCleared`, `recordDepth` marks the day; `SAVE_VERSION` 16 with a fill-in.
- `src/game/hub.ts` / `src/render/hub.ts` — the `vigil` portal at the bottom-left of the
  deck, on the deck once unlocked (`hub.vigilOpen`, set each hub tick in `main.ts`).
- `src/ui/town.ts` — the `Vigil` station screen: depth, twists, today's key, countdown,
  one Enter row; closed-for-today and sealed states.
- `src/main.ts` — station → screen; a room refuses it (solo in v1).
- `tools/smoke.ts` — `=== the vigil ===` plus two hub checks.

## Ledger

| Date | Item | Status |
| --- | --- | --- |
| 2026-09-08 | Design sketch | approved by PM as proposed (name, band, odds) |
| 2026-09-08 | v1 built | data + sim + save + hub + screen + smoke; see "Where it lives". Not browser-verified. Note for merge: `src/data/modes.ts` also changed on master (Avarice Rift display rename) — the `vigil` entry and the header will need a trivial merge. |
