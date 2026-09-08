# The Convergence — Weekly Dungeon v1 (UAT §17)

Design sketch first, ledger at the bottom. Branch `feature/weekly-dungeon`, worktree
`../lootSim-worktrees/weekly`. This is v1 of the *weekly* half of §17 — the Vigil's
harder sibling, built to the same template on purpose rather than as a second
architecture. See `docs/daily-dungeon.md` for the Vigil itself; this doc only calls out
where the Convergence differs from it.

## What it is

**Four floors a week, the same run for everyone, ending in a boss.** Where a Standard
Rift is "the aftermath of lesser supernatural conflicts" and the Vigil is the Keepers
watching one lesser breach a day, a Convergence is what happens when several of those
breaches tear open close enough together that they collapse into one — four floors of
wreckage from four different fights, fused, ending in whatever crawled out of the point
they met (`game_story_worldbuilding.md`, Standard Rifts / Rifts; "Breach" avoided for the
same reason the Vigil avoids it — *Infernal Breach* is already a named Reliquary
scenario). In game terms: a fixed run of four floors ending in a boss, kill quota as
usual on floors 1-3, the boss is the quota on floor 4. Only the boss floor's completion
portal ends the run; floors 1-3 chain straight into the next one on clear, exactly like
an Abyssal Rift.

Everything about the week's run derives from one integer, **the UTC week number**
(`weekNumber`, `Math.floor(dayNumber / 7)` — reuses the Vigil's own day-number calendar
rather than inventing a second one):

- **Base seed** = a mix of the week number (splitmix-style, with a different mixing
  constant than the Vigil's `daySeed` so a week and a day that happen to share an
  integer never share a seed). **Each of the four floors mixes this base seed with its
  own floor index** (`weeklyFloorSeed`) before handing it to `Dungeon`, so all four
  floors are individually deterministic and none of them repeat each other.
- **Depth** = a week-derived pick from a band (12-16) for floors 1-3, **escalating by a
  fixed step (1) per floor**. The whole band sits above the Vigil's 6-14, on purpose:
  this is the mode a Vigil-capable character grows into. **The boss floor (4) does not
  continue that escalation** — it draws its own depth from a separate, much shallower
  band (9-11). See "Depth band, retuned from a survivability finding" below for why.
- **Three modifiers** (the Vigil draws two) from their own pool, at most one
  reward-flavoured, same rule as the Vigil.
- **The week's key tier** = day-derived, but skewed to never be worse than Legendary —
  see Reward below.

Only `danger` is personal — the Challenger dial folds in exactly as it does everywhere
else, including the Vigil.

## Reusing the Vigil's idiom, not inventing a second one

- `RunConfig` gains `weekly?: WeeklyRun` alongside `daily`, read by `profileFor` and the
  `Dungeon` constructor the same way `daily` already is.
- Every modifier is still nothing but a multiplier on a `DepthProfile` field (or the
  elite quota) riding through `profileFor` — no new behaviour in the sim. The one
  genuinely new knob is `speed`, which multiplies `enemySpeed`; nothing else reads it,
  and the Vigil's modifiers don't touch it, which is the "more specialized mechanics"
  UAT §17 asks the weekly for.
- `weeklyConfig(week, floor, challengerTier)` is shaped exactly like `planetConfig` in
  `data/planets.ts` — a fixed run of floors ending in a boss — rather than going through
  `riftConfig`, for the same reason `dailyConfig`/`planetConfig` don't: a generic rebuild
  from `(mode, tier, floor)` alone would lose the week's seed, modifiers and key tier.
  `tier` stays fixed at 0, the same trick the Vigil uses to stop clearing it from
  quietly opening a rift tier (`GameState.recordDepth` never sees `tier + 1` exceed the
  default of 1).
- `nextFloorConfig` (in `data/planets.ts`, the one place a "descend one floor" rebuild
  already had to special-case a mode with its own state) gained a `config.weekly` branch
  right alongside its existing `config.planet` one.
- The boss on floor 4 is picked the same depth-bucketed way any rift's boss is
  (`bossFor(profile.depth)`, purely a function of depth — no rng involved) — no
  `planetBossSpec`-style reskin for v1. A named Convergence boss is a reasonable follow-up,
  not required for the mode to work.
- The one place this deliberately does *not* mirror the Vigil's idiom: floor 4's depth is
  drawn from its own band instead of continuing floors 1-3's escalation. See the next
  section — this was forced by a real survivability finding, not a stylistic choice.

## Depth band, retuned from a survivability finding

The first pass shipped `WEEKLY_DEPTH_MIN/MAX` at 18-30 (unlock 16), reasoning "the Vigil
sits at the delve's frontier (6-14), so the weekly should sit a tier past it." PM review
caught that the reasoning had no numbers behind it — the delve's own measured frontier
(`tools/smoke.ts`'s sharp-bot campaign) averages depth 10.3 over 20 dives, best single
seed 16, so 18-30 was two to four times past what anyone had actually been measured
reaching, gated behind an unlock bar only the single best of twelve seeds had ever hit.

Retuning it exposed a second, more fundamental problem a `playFloor`-driven fight (the
`tools/smoke.ts` raid-boss section's own precedent, not the teleport-to-cleared plumbing
check) surfaced directly: **a raid boss at the same depth as an ordinary trash floor is
dramatically harder**, not incrementally harder. The same campaign-progressed sharp
characters that clear an escalated trash floor at depth 12-16 without much trouble go
0-for-4 against a boss at that same depth, and 0-for-4 at every depth from 12 to 21. Depth
9-11 raid bosses are winnable (50-95% depending on where the trash floors landed); depth
12+ ones currently are not, for anyone this build could produce. The delve's own boss
ladder confirms it isn't specific to the Convergence: the same sharp characters clear the
depth-5 boss most of the time but the depth-15 one essentially never — a second, larger
gap the PM has separately escalated to the owner as its own "is the endgame reachable at
all" item. `WEEKLY_BOSS_DEPTH_MIN`/`MAX` sidesteps inheriting that gap rather than trying
to close it (out of scope here — this mode doesn't touch `profileFor` or the delve curve):
floors 1-3 escalate through the harder, but *proven-survivable-for-trash* 12-16 band and
carry the entire "significantly harder than the Vigil" promise (plus the elite/kill
quota, three modifiers, and arriving at the boss with no full heal after three floors);
floor 4 draws its depth from 9-11 instead, the range the survivability pass actually
confirmed a geared, attentive character can fight.

Measured result (`tools/smoke.ts`, section 6b — real characters produced by the sharp
20-dive campaign, filtered to the ones that actually reached depth 12+, fighting five
different weeks' worth of floor 1 and floor 4 with `playFloor`, not the teleport-to-
cleared shortcut): floor 1 cleared 2/20 to 14/20 depending on which end of the band a
given week landed on (10-70%), the boss floor 14/20 to 19/20 (70-95%) — both strictly
above zero across the sample, unlike the original band's 0/20 nearly everywhere. A week
that draws both `onslaught` and `dire` (about one week in eight) still makes the boss a
real wall on top of this — an intentional worst case in a free-retry mode, not a bug.

**This produced two decisions that need a second pair of eyes**, flagged in the ledger
below: the exact final band (12-16/9-11) is this session's judgment call on where "hard
but not zero" sits, not a number PM specifically approved; and the boss/trash depth
split is a bigger structural change than a plain retune and is exactly the kind of
finding the PM's own escalated endgame-reachability item probably wants to know about.

## Modifiers

| id | player-facing | what it does | where |
| --- | --- | --- | --- |
| `onslaught` | Onslaught | `danger × 1.45` | `RunConfig.danger` |
| `legion` | Legion | `enemiesPerWave × 1.5`, `enemyHealth × 0.75` | profile |
| `purge` | Purge | `elitesRequired + 4` **and** `eliteCapForFloor + 4` | `Dungeon` ctor |
| `blitz` | Blitz | `telegraph × 0.78`, `aggression × 0.85` | profile |
| `feral` | Feral | `enemySpeed × 1.25` | profile (new knob) |
| `dire` | Dire | `enemyHealth × 1.35`, `danger × 1.1` | profile + `RunConfig.danger` |
| `hoarder` | Hoarder | `quantity × 1.8`, `coinMultiplier × 1.6` | profile |
| `rarefied` | Rarefied | `quantity × 0.5`, `rarityBias + 0.15` | profile |

Three per week, never more than one of `hoarder`/`rarefied` (the reward-flavoured pair).

## Reward — the two chests the Quartermaster otherwise only sells outright

The Vigil pays in ordinary keys; the Convergence pays in the two capstone chests
(`data/chests.ts`): **Adept's Trove** (3200 coins, class-adaptive, rare and up) and
**Collector's Hoard** (25,000 coins, legendary and up, "one rung past the real gamble").
Felling the warden on floor 4 drops one guaranteed key at `WEEKLY_KEY_ODDS` (Collector's
Hoard ~1/6, Adept's Trove ~1/2, the rest Legendary — never worse) plus one item forced to
at least Legendary rarity, on top of the ordinary depth-weighted loot. Floors 1-3 pay
only the ordinary loot; the signature reward can't be farmed piecemeal because the
guaranteed drop only fires `if (config.weekly && config.lastFloor)`.

Mode multipliers: `xpMult 1.6`, `gemMult 1.3` — a bit richer than the Vigil's `1.4`/`1`,
reflecting that this is meant to read as the bigger weekly event.

**Once per week.** Clearing sets `GameState.weekly = { clearedWeek }`; the station reads
"Closed for the week" until the next UTC week. Only a credited bank on the boss floor
closes it — `GameState.recordDepth`'s `config.weekly` branch returns early on floors 1-3
(`!config.lastFloor`), so banking an intermediate floor's loot can never accidentally
mark the week done. Deaths and bail-outs on any floor don't mark it either, so a failed
attempt costs the run's loot like any other floor but never costs the weekly shot.

Unlock: `deepestDepth >= 12` — past the Vigil's 6 and past the Abyssal Rift's own 8,
since the Convergence is meant to be the harder of the two, and inside a sharp
character's measured *reachable peak* rather than past it (see the depth-band section
above).

## Entry

A spawned portal on the deck, like the Vigil's: `HubStationKind` `"convergence"`, label
"The Convergence", at its own free spot on the flagstone (opposite the Vigil's, clear of
the Forge and the Reliquary Gate). Confirm opens a station screen (`Tab` `"Convergence"`,
in `STATION_TABS`, not the `[I]/[O]` cycle) showing: all four floors' depths, the three
modifiers with one-line explanations, the week's key tier, the countdown to reset,
cleared-or-not, and one Enter row — floors 2-4 aren't separately chosen, they follow
automatically as each one clears. Enter calls the existing `onDive` with
`weeklyConfig(week, 1, challengerTier)`.

**Solo in v1**, matching the Vigil's own call: the once-a-week bookkeeping is per account
and `RunConfigWire` doesn't carry a weekly plan. A room refuses the station exactly the
way it refuses the Vigil's.

A latent wart shared with the Vigil got fixed in passing: the generic solo
completion-portal flash (`"${mode.name} tier ${tier} closed. Tier N is open."`) doesn't
make sense for a mode with no tier ladder — both the Vigil and the Convergence now get a
plain "closed for the day/week" flash instead (`src/main.ts`, `handleRunDecisions`).

## Save

`GameState.weekly: { clearedWeek: number }` (0 = never), same shape as `daily`.
`SAVE_VERSION` 16 → 17; loader fills `{ clearedWeek: 0 }` for older saves.
`stats.convergencesCleared` counter, alongside `vigilsCleared`.

## Acceptance checks (`tools/smoke.ts`, new `=== the convergence ===` section)

- Same week → identical base seed, depth band pick, modifiers, key tier; adjacent weeks
  differ; a week number and a day number that happen to coincide don't share a seed.
- Two `Dungeon`s built from the same week's floor 1 produce identical level
  fingerprints; floor 2 of that same week is a different floor; floor 1 of next week is
  different again.
- Floors 1-3 escalate by exactly the per-floor step; floor 4's depth is its own draw,
  inside its own (shallower) band, distinct from where floors 1-3 landed; only floor 4
  is the boss floor; the run really is four floors long.
- **Compared directly against the Vigil**, not just bounded on its own: floor 1 of a
  Convergence hits harder (both `enemyDamage` and `enemyHealth`) than the Vigil's one
  floor at the same (zero) Challenger tier.
- Each modifier moves exactly the field(s) it claims and nothing else, `feral` included
  (proof the new `speed` knob actually reaches `enemySpeed` and nothing else).
- A full four-floor playthrough via the teleport-to-cleared shortcut (reward plumbing
  only, not a fight — see below): floors 1-3 bank without closing the week; the boss
  floor guarantees the week's key tier and a Legendary-or-better item, banking it closes
  the week and bumps the counter; a death or bail-out anywhere doesn't touch either; a
  second attempt after closing doesn't double-count; it never opens a rift tier by
  accident.
- **A real fight, separately**: the sharp campaign's own characters (dodge 0.55, 20
  dives), filtered to the ones that actually reached the unlock depth, playing floor 1
  and floor 4 of five different weeks with the same bot the raid-boss check uses (dodge
  0.85) — asserting at least one win at each, not zero, across the sample. This is the
  check that caught the original band being unwinnable and the boss-floor depth needing
  to be decoupled; see "Depth band, retuned from a survivability finding" above.
- Save round-trips `weekly` and a pre-Convergence save loads with `clearedWeek 0`.

## Decisions (v1, this build)

1. **Name: "The Convergence."** Chosen to fit the Rifts cosmology (several breaches
   colliding into one) without reusing any name already claimed (*Standard/Avarice/
   Abyssal Rift*, *Infernal Breach*). Flagged to the PM for confirmation the way the
   Vigil's name was approved before it shipped.
2. **Depth band 12-16 for floors 1-3 (unlock 12), boss floor 9-11, decoupled from the
   trash floors' escalation.** Not a guess — retuned from an original 18-30/unlock-16
   after `tools/smoke.ts`'s survivability pass (section 6b, a real `playFloor` fight,
   not the reward-plumbing check) showed that band unwinnable and, separately, that raid
   bosses past the very first one appear to be broadly unbalanced game-wide (0/4 at
   every boss depth from 12 to 21 for the same characters that clear escalated trash
   floors fine). **This is a bigger call than a plain retune** — decoupling the boss
   floor's depth from floors 1-3 is new structure, not just new numbers — and it
   surfaced a finding (deep raid bosses may be a wall for everyone, not just this mode)
   that overlaps the endgame-reachability item already escalated to the owner
   separately. Flagging both explicitly rather than presenting it as a routine tuning
   pass. `WEEKLY_DEPTH_MIN`/`MAX`/`WEEKLY_UNLOCK_DEPTH`/`WEEKLY_DEPTH_PER_FLOOR`/
   `WEEKLY_BOSS_DEPTH_MIN`/`MAX` in `src/data/weekly.ts` are the knobs.
3. **Reward reaches into the coin-only capstone chests.** `data/chests.ts` says outright
   that Adept's Trove and Collector's Hoard are meant to be bought, not dropped
   ("monster drops only ever hand out the four original tiers"). The Convergence is a
   deliberate, narrow exception the same way the Vigil is already a deliberate exception
   to "keys are otherwise deliberately scarce" — flagging this explicitly as a design
   call rather than a quiet rule-bend, since it's the biggest lever in this build.
4. **No unique Convergence boss for v1.** The boss floor picks off the ordinary
   depth-bucketed ladder, same as any rift. A reskinned, named warden (the
   `planetBossSpec` pattern) is a natural v2, not required for the mode to close.
5. **A `.gitignore` fix landed alongside this**: the repo's `data/` ignore rule was
   unanchored and silently matched `src/data/` too, which is why `src/data/weekly.ts`
   didn't show up under `git add -A` on the first pass — only *new* files under
   `src/data/` were affected (already-tracked ones were untouched, which is why nobody
   had noticed). Scoped to `/data/` (the account-database directory `tools/accounts.ts`
   actually means) so this can't happen to the next new file in `src/data/` either.

## Where it lives

- `src/data/weekly.ts` — the calendar (`weekNumber`, `msUntilWeeklyReset`, `weeklySeed`,
  `weeklyFloorSeed`), the modifier pool, `weeklyPlan`/`weeklyConfig`, `weeklyUnlocked`,
  every tunable.
- `src/data/modes.ts` — `MODES.convergence` (rift-shaped, four floors, `xpMult 1.6`,
  `gemMult 1.3`) and `RunConfig.weekly`.
- `src/data/depth.ts` — `profileFor` folds `weeklyEffects` into health / count /
  telegraph / aggression / speed / quantity / coins / rarity bias, alongside `daily`'s
  own; `buildTag` names the week's twists.
- `src/data/planets.ts` — `nextFloorConfig` gained a `config.weekly` branch so floors 2-4
  carry the week's seed and modifiers forward instead of losing them to a generic rebuild.
- `src/game/dungeon.ts` — the seed mixes `config.weekly.seed` with the floor index when
  nobody hands one in; Purge raises both the quota and `eliteCapForFloor`; the boss
  floor's clear cache drops the guaranteed key and item.
- `src/game/state.ts` / `src/core/save.ts` — `GameState.weekly.clearedWeek`,
  `stats.convergencesCleared`, `recordDepth`'s `config.weekly` branch (returns early on
  floors 1-3); `SAVE_VERSION` 17 with a fill-in.
- `src/game/hub.ts` / `src/render/hub.ts` — the `convergence` portal at its own deck
  spot (`hub.weeklyOpen`, set each hub tick in `main.ts`).
- `src/ui/town.ts` — the `Convergence` station screen: all four floors' depths, twists,
  the week's key and prize, countdown, one Enter row; closed-for-the-week and sealed
  states.
- `src/main.ts` — station → screen; a room refuses it (solo in v1); the shared
  completion-portal flash no longer misreports a tier ladder for either the Vigil or the
  Convergence.
- `tools/smoke.ts` — `=== the convergence ===` plus two hub-gating checks; `sharpRuns` is
  lifted out of the sharp-campaign block so section 6b can fight real characters instead
  of a synthetic stand-in.

## Ledger

| Date | Item | Status |
| --- | --- | --- |
| 2026-09-08 | v1 built | data + sim + save + hub + screen + smoke; see "Where it lives". `npm test` green including a full four-floor playthrough. Not browser-verified — nobody on this build has a browser. Handed to the PM (`lootsim-70`) for review and merge. |
| 2026-09-08 | PM review: blocker | The smoke coverage teleported every floor to "cleared" — reward plumbing, not a fight — and the original 18-30/unlock-16 band was 2-4x past the delve's measured frontier. |
| 2026-09-08 | Retuned + real fight added | Band retuned to 12-16/unlock-12 for floors 1-3; boss floor decoupled to its own 9-11 band after the survivability pass showed deep raid bosses broadly unbeatable game-wide, not just in this mode. New `tools/smoke.ts` section 6b fights real sharp-campaign characters (not a synthetic stand-in) across five weeks; floor 1 clears 10-70% and the boss 70-95% depending on the week drawn, both strictly above the original band's ~0%. `npm test` green (1189 checks). Re-handed to the PM — the final band and the boss/trash depth split are this session's judgment call, not yet PM-approved numbers. |
