# Global leaderboards and multiplayer flavour

Docket item 4. Branch `feat/leaderboards`, worktree `../lootSim-worktrees/leaderboards`.

> "we need global leaderboards and random multiplayer flavor stuff. things like records
> in the abyssal/raids/memories, random records like 'strongest item currently in the
> game' 'highest recorded max damage' 'furthest depth/tower reached for each activity' -
> should be able to filter these by class."

The PM (lootsim-21) attached four explicit steers to this assignment, ahead of any
leaderboard-shape detail. Each is honoured below, and this section says where.

1. **The server must never learn the save format.** See "The seam", below. Records are a
   small, separately-versioned payload the client computes; the server stores scalars it
   understands and never opens a save.
2. **A record keys on the hardest thing actually done — never the bare activity.** See
   "What a board is", below. Every row carries the Challenger tier it was actually banked
   at, the same precedent `Player.delveChallengerBadges`/the badges ruling already set:
   a climb never shows up on a depth board, and a depth-24 clear at the dial off is a
   different accomplishment from a depth-24 clear at Death March V, stated as such rather
   than flattened into one number.
3. **"Strongest item" reuses the game's own `itemScore`.** See "Strongest item in the
   game", below — no second, parallel scoring function.
4. **`docs/reachable-band.md` was read before any depth board was designed.** See
   "The reachable band, and why this document doesn't fight it", below.

## The seam: a payload, not a save reader

`docs/accounts.md`'s load-bearing property is that `tools/accounts.ts` stores each save
as an opaque string and never looks inside it — proven, not merely claimed, by the
Rotating Shop's SAVE_VERSION 29→30 bump needing zero server changes. A leaderboard that
read fields out of the save string on the server would end that independence for good:
every future save-shape change would become a coordinated client+server migration
instead of a client-only one.

So a record never touches the `saves` table. `src/net/records.ts`'s `computeRecords`
reduces a `GameState` — already loaded, already in memory — to a short list of plain
scalars (`RecordEntry`: a board id, a class id, a Challenger tier, a value, and a small
optional display-only `meta`), and posts that list to its own endpoint
(`POST /api/records`), versioned on its own (`RECORDS_VERSION`, independent of
`SAVE_VERSION`). The server (`tools/accounts.ts`) validates shape — a known class id, a
known board id, numbers in sane ranges — exactly the way `register` already validates a
username, and stores the scalars in their own `records` table. Nothing here reads or
writes the `saves` table; nothing here can break by a save-shape change, and nothing in
the save format can break by a leaderboard change.

The class-id and board-id allowlists are duplicated in `tools/accounts.ts` as hardcoded
literals rather than imported from `src/`, the same call `data/shop.ts`'s `ShopRarity`
already made: a small, stated duplication rather than pulling the server's dependency
graph through the whole game's type system. `tools/leaderboards.ts` asserts the two class
lists actually agree, so the duplication can't silently drift.

## What a board is

A **board** is one ranking: an activity plus the axis that makes different clears of it
genuinely comparable. Every row is `{ username, classId, tier, value, meta }`, and `tier`
is never decorative — it's part of what the row claims. The Delve/Tower split
(`Player.deepestDepth` vs `Player.highestHeight`, never merged) is the precedent this
whole design leans on: **a height is not a depth**, and the same logic says a depth
reached at the Challenger dial off is not the same claim as one reached at Death March X.

| Board id | What it ranks | Source field |
| --- | --- | --- |
| `delve` | Deepest Delve floor ever banked | `Player.deepestDepth`, tier from `delveChallengerBadges` |
| `tower` | Highest Tower floor ever banked | `Player.highestHeight`, tier from `towerChallengerBadges` |
| `abyss` | Highest Challenger tier banked in the Abyssal Rift | `Player.challengerBadges.abyss` |
| `hoard` | Highest Challenger tier banked in the Avarice Rift | `Player.challengerBadges.hoard` |
| `vigil` | Highest Challenger tier banked in the Vigil | `Player.challengerBadges.vigil` |
| `convergence` | Highest Challenger tier banked in the Convergence | `Player.challengerBadges.convergence` |
| `memory` | Highest Challenger tier banked at the Altar | `Player.challengerBadges.memory` |
| `raid.<id>` (×4) | Highest Challenger tier banked on that raid | `Player.raidChallengerBadges[id]` |
| `item.score` | Strongest item currently equipped, any class | `itemScore(item, heroClass)` |
| `damage.max` | Largest single hit ever landed | `Player.lifetimeMaxHit` |

For the fixed-length activities (everything except `delve`/`tower`/`item.score`/
`damage.max`), the tier *is* the value — `Player.challengerBadges`' own doc comment
already explains why a single "highest tier banked" number is honest for a fixed run of
floors ending in a boss, the same reasoning `planetChallengerBadges`/
`raidChallengerBadges` rely on. Only `delve`/`tower` need the two-part (depth, tier)
shape, because they have no upper bound.

**One row per class per board**, not one row per (class, tier) pair. A class's `delve`
row is its single best depth, stamped with the hardest tier that depth was actually
banked at (`bestTierForDepth` in `records.ts`: scans `delveChallengerBadges` from the top
tier down for an exact match against `deepestDepth`, since a badge can never exceed the
account's real best). A per-tier board ("deepest at Death March III specifically") would
be strictly more information and is a natural follow-on — see "Not built", below — but it
multiplies the row count by up to 20 for two boards alone, and nothing in the brief asked
for it yet.

**A class that hasn't touched an activity contributes no row for it.** `computeRecords`
never zero-pads; a fresh alt's `deepestDepth` of 0 simply isn't submitted. This keeps
every board's row count meaning something (an empty board really means nobody's cleared
it) and keeps the payload small.

## Strongest item in the game

Reuses `itemScore` (`src/game/item.ts`) — the exact function driving the stash's upgrade
arrows and the compare panel — rather than a second, parallel notion of "best". Per steer
3: "the drop-previews rule in another costume," and it applies here the same way it
applies to `previewForRun`: a second scoring function that can drift from the real one is
worse than no board at all.

**Scope decision, stated rather than defaulted: only currently-*equipped* items are
scored, never the stash.** `computeRecords` walks each class's six equipment slots,
scores each with `itemScore(item, CLASSES[classId])` — the class argument matters,
because `itemScore` marks a weapon down outside a class's affinity, and an equipped item
is by definition the class's own choice — and submits the best, once per class. A stash
item is excluded for two reasons: "strongest item in the game" reads more honestly as
"what somebody is actually swinging" than a duplicate sitting in a box nobody equipped,
and equipping sidesteps an unanswerable question a stash item raises — which class does
an unequipped item's affinity score belong to? An item never equipped by anyone has no
honest owner for this board. If the owner wants stash items included later, the fix is a
second board (`item.score.unowned` or similar), not a change to this one's meaning.

## Highest recorded max damage

New field, `Player.lifetimeMaxHit` (SAVE_VERSION 31), written in `Dungeon.damageEnemy`
right alongside the existing per-dive `CombatStats.largestHit` it mirrors — the only
difference is this one never resets between floors or deaths. **Gated on `.local`**, the
same rule `killEnemy` already applies to `stats.enemiesKilled`: only the host runs
`damageEnemy`, and a remote co-op hero's `Player` there is an ephemeral rebuild from the
wire, not that player's own persistent character sheet — crediting a hit to it would
either vanish silently or (worse) bank onto the wrong account entirely. A remote
player's own max hit is only ever recorded when *their* browser is the one that computed
it, exactly like every other per-account stat in this codebase.

## The reachable band, and why this document doesn't fight it

`docs/reachable-band.md`, read before this document's own board table was drafted: an
attentive, same-level character reaches roughly depth 13-19 before the shared difficulty
curve stops being clearable at all, not gradually harder — a slope, not a cliff, but a
real wall six depths wide. A naive "furthest depth" board will show most of the
playerbase clustered inside that band, with the Proving's depth-30 gate and anything past
it read as a long, sparsely-populated tail.

**This document doesn't correct for that, on purpose.** `reachable-band.md`'s own
"options, priced" section explicitly separates "the band is a problem to fix" from "the
band is correct, and content past it is a deliberate long tail" — the owner's call, not
made anywhere in this project yet. A leaderboard that quietly compressed or renormalized
depth to hide the clustering would be *making* that call by omission, exactly the kind of
drift `reachable-band.md` warns the Convergence's boss-floor-from-a-shallower-band fix
already made once without naming it. So the `delve`/`tower` boards report the real
numbers, clustering and all. If anything, a leaderboard is the most honest instrument this
project has for *showing* the band rather than just measuring it in a tool nobody runs —
which is closer to `reachable-band.md`'s own "option 3" framing than to a bug.

## Trust: no anti-cheat, and this document isn't proposing one

Every number on every board is self-reported: the client computes it from its own save
and posts it. There is no anti-cheat anywhere else in this game — saves are a save-file
edit away from anything, and the game is played by the owner and people near him, not a
public audience with an incentive to cheat a stranger's leaderboard. Building server-side
replay verification, signed telemetry, or any other tamper-resistance for that trust
model would be real engineering spent defending against nobody. **A determined liar could
edit their own save to submit any number on any board, and nothing here stops that.**
That's the whole of the honest answer, and it's one paragraph, not a feature — the same
call this project's other systems (accounts, the save server itself) already made.

## Per-class filtering

`GameState.players: Record<ClassId, Player>` was already per-class, so the shape asked
for was already there. Every board's rows carry `classId`; the server's
`GET /api/leaderboard/<board>?class=<id>` narrows to one class, and the town screen's `;`
key cycles "All classes" plus the 21 (`LEADERBOARD_CLASS_FILTERS`). A/D switches which
board is showing, mirroring the Shop screen's tier switch exactly.

## The multiplayer-flavour half, decided and stated

The brief's second half — "random multiplayer flavor stuff" — was deliberately left to
this document's own judgment. Decision: **a global leaderboard other real people's names
appear on already *is* the multiplayer flavour**, in a game with no chat, no friends
list, and no other persistent social surface. Rather than build a second feature next to
it, the Leaderboards screen adds one cheap, honest extra: a **"Recent records"** ticker
(`board: "recent"` in the town screen, backed by `GET /api/leaderboard-recent`) — the
most recently *improved* rows across every board and every account, newest first. It
costs nothing beyond a second read query against the same table (`ORDER BY updated_at
DESC`), and it's the closest thing to "watching other real people play" this project can
honestly offer without inventing presence, chat, or any state nobody asked for.

Explicitly **not built**: chat, friends lists, presence ("who's online"), profile pages,
or anything that needs the server to know more about an account than a username and a
password. None of it was asked for, and `docs/accounts.md`'s "deliberately small" list
(no email, no 2FA, no rate limiting) is the standing precedent for not growing this
surface past what was actually requested.

## Submission

`GameState.recordsHook` (a new static field, mirroring `saveStore`) fires at the end of
`save()` — the same "something meaningful changed" signal the save already uses, because
a new record can only follow a meaningful action. `RecordsSubmitter`
(`src/net/recordsClient.ts`) coalesces the same way `RemoteSaveStore` coalesces writes:
the latest `computeRecords(state)` wins, one request in flight at a time, a write within
4 seconds of the last one folds into it. Unlike the save, a failed submission is not
retried with growing urgency — missing one record push isn't lost progress, and the next
meaningful action tries again anyway.

The server never trusts a submission to already be a personal best: `POST /api/records`
upserts *only if the submitted value beats the stored one* (`findRecord` then a
conditional `upsertRecord`, per entry) — belt-and-braces on top of the client already
only ever computing bests, and directly asserted in `tools/leaderboards.ts` ("a submitted
record can only ever improve") rather than inferred from the two halves being correct
separately.

## Screen

A new **Leaderboards** tab (`CYCLE_TABS`, next to the existing personal-stats **Records**
tab — that one stays exactly what it was, an account's own numbers; this one is everyone
else's). Pure reading screen, no action bar: per `docs/actions-vs-reading-panels`/
`docs/ui-actions-out-of-scroll-panels`, actions belong in their own fixed region, and
there is nothing to act on here — submission is automatic and happens off-screen.
A/D switches board, `;` switches the class filter, W/S do nothing (same as the personal
Records tab: "nothing to do here — just numbers"). Every control mirrors as a click.

## Not built, on purpose

- **Per-Challenger-tier depth boards** ("deepest at Death March III specifically") — a
  natural follow-on to the single-row-per-class shape above, deferred because nothing in
  the brief asked for it and it multiplies row count by up to 20 for the two boards that
  would want it.
- **Reliquary sector boards.** Nine planets, each its own `planetChallengerBadges` entry,
  the exact same shape as the raid boards above — cheap to add, deliberately deferred
  because the brief named "abyssal/raids/memories" explicitly and didn't name planets.
- **A titles/cosmetic-frame reward for placing on a board** — docket item 3 already lists
  "titles earned from the leaderboards" as a gem-sink candidate. This document builds the
  data those titles would read; awarding them is a separate, unstarted feature.
- **Any anti-cheat.** See "Trust", above.
- **Chat, friends, presence, profiles.** See "The multiplayer-flavour half", above.

## Files

- `src/net/records.ts` — `RecordEntry`/`RecordSubmission` types, `computeRecords`.
- `src/net/recordsClient.ts` — `RecordsClient` (browser fetch calls), `RecordsSubmitter`
  (coalesced writes).
- `tools/accounts.ts` — `records` table, `POST /api/records`,
  `GET /api/leaderboard/<board>`, `GET /api/leaderboard-recent`.
- `src/game/player.ts` — `Player.lifetimeMaxHit`.
- `src/game/dungeon.ts` — `damageEnemy` writes `lifetimeMaxHit`.
- `src/game/state.ts` — `GameState.recordsHook`, `playerToJSON`/`applyPlayerJSON` carry
  the new field.
- `src/core/save.ts` — `SAVE_VERSION` 30 → 31.
- `src/main.ts` — wires `RecordsClient`/`RecordsSubmitter`, installs the hook.
- `src/ui/town.ts` — the Leaderboards tab (`LEADERBOARD_BOARDS`, `renderLeaderboards`).
- `tools/leaderboards.ts` — acceptance gate (`npm run leaderboards`, in `npm test`).

## Verification

`npm run leaderboards` (33 checks: `computeRecords`'s honesty, the never-regress upsert,
every validation rejection, ranking, the class filter, the recent feed — this run caught
a real bug, a `Number(null) === 0` mis-defaulting `limit` to 1 rather than the intended
25, before it shipped) plus the full `npm test` chain. Browser-verified with Playwright:
[fill in after the run — see the session's closing report].
