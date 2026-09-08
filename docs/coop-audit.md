# Co-op audit (UAT §1) — findings, priority order, ledger

The written half of the UAT §1 "Fix Multiplayer" item. Method: read every line of
`src/net/` (`protocol.ts`, `client.ts`, `sync.ts`, `party.ts`), `tools/relay.ts`, the
party half of `src/game/dungeon.ts` and `src/game/hub.ts`, the co-op callbacks in
`src/main.ts`, the Comms Relay screen in `src/ui/town.ts`, the co-op section of
`tools/smoke.ts`, and walked each item of §1's checklist against them. Line numbers are
as of `master` `b1e1b42`.

This document is also the **ledger** for the fix work — the last section records what
has landed so a fresh session can pick up cold. Branch: `coop/uat-1-audit`, worktree
`../lootSim-coop`.

## What is authoritative today (and this is right)

The architecture is sound and should not be replaced: **one simulation, on the host.**
Clients send buttons, draw snapshots, and predict only their own position. That answers
§1's "clear authoritative source" list outright:

| §1 item | Authority | Where |
| --- | --- | --- |
| Enemy state, damage, boss state | host sim | `Dungeon.update`, `encodeEnemy`, `Snapshot.b` |
| Player state (hp, mana, cooldowns, downed) | host sim | `encodeHero` / `applyHero` |
| Loot (coins, gems, keys, materials) | host sim, mirrored per hero | `HeroSnap.lt/ky/mt` |
| Items and XP | host sim, delivered reliably | `got` message, `itemsPending` / `xpPending` |
| Floor completion, completion portal | host sim | `Snapshot.kq/ek/cp`, `floorQuotaMet` |
| Extraction, descend, wipe | host's keyboard only | `handleRunDecisions` returns for clients; `end` message |
| The floor itself | seed + `RunConfigWire` → `generateLevel` | `configFromWire`; smoke checks wall count + portal |

Everything below is either a hole in that model, or the model being right but *feeling*
wrong on the client.

## Findings

Severity: **P0** breaks a run or an acceptance criterion · **P1** the "only the host is
smooth" complaint · **P2** things clients see wrong · **P3** flow / spec-intent, needs an
owner or PM call.

### P0 — run integrity

**A1. A disconnected client permanently blocks descend.** `Party.syncRoster`
(`party.ts:408-418`) marks a departed player's hero `downed` and nulls its input, and
that's all. Consequences: `partyAtCompletionPortal < heroes.length` (`main.ts:441`,
`dungeon.ts:1098-1103`) can never be satisfied, so the host can only ever extract, never
descend — "a disconnected player cannot permanently break the run" is violated for the
whole run. Worse, `updateRevives` happily revives the body if somebody stands over it: it
comes back up with `input === null`, is skipped by `updateHero`, stands there soaking
aggro and being targeted by `nearestHero`, and until it's downed again `heroes.every(
downed)` can't fire so the party can't even wipe cleanly. Fix: a `Hero.departed` flag set
by the party layer; departed heroes are excluded from the portal count, the revive loop,
the wipe check and targeting, and the snapshot carries it so clients draw them faded and
labelled. The relay's 15 s heartbeat means this state is reached ~30 s after a laptop lid
closes, so it is not exotic.

**A2. The run's roster is never frozen, and a client can end up driving the host.**
`startFloor` (`party.ts:188-198`) builds the hero list from *whoever is in `members` with a
`hello` right now*, and `descend` calls it again for every floor. Two failure modes:

- Somebody joins the room mid-run (the relay allows it; nothing tells them a run is on).
  When the host descends they are yanked off the ship into floor N+1 without ever readying
  up — `onStart` → `enterDungeon` fires on their end regardless of scene.
- A member whose `hero` is still `null` (the window between `peer` and their `hello`) is
  *excluded* from the `start` but still *receives* it. `setupsFrom` finds no local hero,
  `Dungeon` falls back to `localHero = heroes[0]` — **the host's hero** — and that browser
  now runs as a client whose "own" character is the host's: `predictLocal` moves it,
  `applyHero` writes the host's potions into their save (`sync.ts:321`), the host's coins/
  gems/keys/materials mirror into their `localHero.loot` (`sync.ts:315-320`), and on
  `end` they `bankLoot()` all of it (`main.ts:92`). That is a duplication path — of
  currency, not items, since items travel by `got` — and §1 names duplication explicitly.

Fix: freeze a `runRoster` (peer ids) at `startFloor` and reuse it for every `descend`,
minus departed ids; a client ignores a `start` that doesn't list its own id and shows
"run in progress — you'll dive with them next time"; `Dungeon` refuses a `client` role
with no local hero rather than falling back.

**A3. Typing in the name / room-code fields — FIXED in this branch.** `Input.onKey`
(`core/input.ts:158-186`) called `e.preventDefault()` on every bound key *before* checking
`enabled`, so with a field focused the game correctly stopped driving the character but
still swallowed the keystroke. W/A/S/D, E, Q, J, K, L, M, N, U, H, I, O and `;` couldn't be
typed, and since A, D, E, H, J, K, L, M, N, Q, U, W are all in the room-code alphabet most
codes were untypeable. Now: keys whose event target is an editable element are ignored
outright (`isEditableTarget`, duck-typed so it runs in Node), and a disabled `Input` no
longer prevents defaults. `main.ts`'s focusin/focusout handlers use the same predicate.
Pinned by a new `=== controls ===` section in `tools/smoke.ts` that feeds `Input` synthetic
events: every room-code letter and every default binding must reach an `INPUT`.

### P1 — why only the host feels smooth

**B1. Everything that isn't you moves at 20 Hz on a client.** `applySnapshot` sets
`px = x; x = wire.x` once per snapshot (`sync.ts:364-367`, `applySimpleBodies` rebuilds
the rest). The renderer lerps `px → x` by the fixed-step alpha (`draw.ts:52`), which
spans one 60 Hz tick — so a monster slides for one tick and then *sits still for two*
until the next snapshot. Sixty monsters stuttering at 20 Hz is the whole "not smooth"
impression, and it has nothing to do with lag. Fix: on the client, each sim tick moves
every id-bearing body (enemies, heroes, minions) linearly toward its latest snapshot
position over one snapshot interval (`1 / SNAPSHOT_HZ`), so the renderer's alpha lerp
always has fresh `px/x`. Projectiles have no id but do have velocity: send `vx, vy` and
extrapolate per tick. Pickups and telegraphs can stay rebuilt (mostly static).

**B2. Your own character rubber-bands.** `applyHero` (`sync.ts:283-294`) blends the local
hero 25 % toward the host's position every snapshot, snapping past 48 px. There is no
input reconciliation, so while you walk the host's view of you is always RTT×speed behind
your prediction and every snapshot yanks you back a quarter of that gap — a steady
backwards tug at 20 Hz. The dash isn't predicted at all (`predictLocal` bails while
`dashTimer > 0`, `dungeon.ts:1025`), so the one move the game is built around lands one
snapshot late and then teleports. Fix (standard): sequence-number the `in` packet, have
the host record the last `seq` it consumed per hero and echo it in `HeroSnap`; the client
keeps its recent inputs, and on each snapshot sets its position to the host's and replays
every input newer than the ack through the same movement step. Movement on both ends is
already the same code (`PLAYER_SPEED * moveMult * mireSlow`, `resolveCircle`), so a
correctly reconciled client shows zero error in the common case. Predict the dash locally
with the same `DASH_*` constants.

**B3. Hero statuses never cross the wire.** `HeroSnap` has no status bits, so a client's
`hero.sc` is always empty: the HUD's ailment row is blank, chilled/rooted heroes render
clean, and B2's prediction uses full speed while the host has you at half — more
correction, more tug. Fix: `st` bitmask per hero exactly like `encodeEnemy`'s
`statusBits`; prediction reads `slowMultiplier()` / `disables()` off it.

**B4. A lag spike keeps you walking.** `NetInput.receive` overwrites `move` per packet and
never expires it, so if packets stop for 300 ms the host keeps applying the last vector —
straight into the hazard you were about to stop in front of. Fix: zero `move` after ~200 ms
without a packet (`beginTick` knows the tick count).

**B5. A client's ground-targeted abilities ignore the mouse.** `NetInput` has no
`aimPoint`, so `hero.aimPoint` is null for every remote hero (`dungeon.ts:1410`) and a heal
circle or acid pool lands at fixed reach along the facing, unlike the same class solo in
mouse scheme. Fix: two more numbers on the `in` packet.

### P2 — what clients see wrong

**C1. Minions and corpses aren't in the snapshot.** `encodeSnapshot` has no minions array;
`draw.ts:418` draws `d.minions`, which on a client is always empty. A Necromancer's whole
army — and every summoner class's pets — is invisible to everyone but the host; corpses
(necro fuel, drawn) likewise. Fix: `m: [id, owner, x, y, facing, hp, maxHp, windup,
elementIndex, unitIndex]` and `c: [x, y]`, both small.

**C2. Enemy affixes aren't on the wire.** The client rebuilds enemies with `affixes: []`
(`sync.ts:355-359`), so the affix ring and orbiting pips (`draw.ts:698-714`) never draw
and the name lacks its affix prefix (`dungeon.ts:764`) — a client fights a "Grunt" the host
sees as "Hasted Vampiric Grunt". Fix: affix bitmask per enemy (index into
`MONSTER_AFFIXES`), rebuilt into `affixes` for drawing only.

**C3. Level-up fireworks fire twice on a client.** The host forwards an owner-tagged
`levelUp` for the remote hero's copy (`dungeon.ts:2431` via `publish`), and the client
emits its own from `got xp` (`party.ts:361-364`). Fix: don't forward `levelUp` for
non-local heroes.

**C4. `end` doesn't say whether the extraction was early.** The client infers it from the
phase in its last snapshot (`main.ts:90`). Ordering over one TCP stream makes this safe in
practice, but the message that decides whether a player keeps their items should carry the
decision. Fix: `early: boolean` on `end`.

**C5. Gear swapped in the Quartermaster while in a room isn't re-announced.** `sendHello`
is only called on arrival, roster change and `returnToTown` (`main.ts:157`). A client that
joins, then re-gears in the stash, is built on the host from stale gear for the whole run.
Fix: `sendHello` in `enterHub()` whenever in a room (every town screen exits through it).

**C6. Determinism is only spot-checked.** The smoke test compares wall count and portal
position (`smoke.ts:2208-2212`). Fix: full structural equality (walls, rooms, traps,
nodes, decoration) across a `configToWire`/`configFromWire` round trip, for a delve, a rift
and a planet config. Cheap insurance for "desync from procedural generation".

**C7. Dead wire fields.** `ul/ut/bt` on `HeroSnap` are kept for compatibility
(`sync.ts:202-208`). Any of the above changes the wire, so bump `PROTOCOL_VERSION` once and
drop them in the same commit.

**C8. Minor host-side bookkeeping.** `stats.bossesKilled++` (`dungeon.ts:2359`) is
unconditional on the host; remote heroes' own `stats` are never credited for kills/deaths.
Cosmetic to the Records tab. Leave unless cheap.

### P3 — flow and spec intent (owner / PM decisions)

**D1. The spec's intended flow isn't the built one.** §1 spells it out: host opens a room,
players join, everybody walks the ship freely, *the host walks into the portal of their
choice (e.g. the Abyssal Rift) and confirms it, the others walk to that same portal, and
the party begins.* Today: co-op is delve-only, the depth is picked in the Comms Relay
screen, a separate Party Portal is the ready spot, and every other station is blocked
while a room is open (`main.ts:169`). The wire already carries rifts and planets
(`RunConfigWire`, `configFromWire`) and `partyScale` flows through `profileFor` for every
mode, so this is mostly `party.ts` / `hub.ts` / `main.ts`: the host's station choice
becomes the party plan (`plan` carries a `RunConfigWire`), that station becomes the ready
spot, and the Comms Relay loses its depth row. Per-player rift-tier unlocks and planet
materials already bank on each player's own save. CLAUDE.md says delve-only and to ask
first — **recommend yes, as its own cluster after P0/P1**, because the owner wrote this
flow down as the intent.

**D2. Host leaving = wipe for everyone.** No migration is by design (documented), but the
clients lose every unbanked item for something that wasn't their death. Options: keep
(status quo, simplest, "never make death free"), or treat host-loss as an early extraction
(15 % of coins, items lost). Balance call.

**D3. Reconnect / rejoin.** Explicitly out of scope in CLAUDE.md. The smallest real
version is a 30–60 s grace window where a departed hero stays `departed` but re-attachable
by peer name + hero id. Not recommended for this pass; noting it because §1 lists it.

**D4. A newcomer mid-run gets no feedback** — they sit on the ship and the Party Portal does
nothing. A2's fix gives them a notice; they dive with the next *run*, not the next floor.

**D5. Hub mates jitter at 12 Hz** (`HUB_SYNC_HZ`, drawn raw). Same per-tick interpolation
helper as B1 if it falls out cheaply.

**D6. Escape does nothing in a party dive** (`main.ts:559`) and says nothing. One flash line.

**D7. CLAUDE.md says Challenger stays solo, but the host's tier is applied** (`syncHub` →
`delveConfig(depth, state.challengerTier, size)`) and clients see it via the wire. Either
is fine; the doc and the code should agree.

## Proposed order

1. **MP-1 run integrity** — A1, A2, C4, C5 (+ C6 determinism check). Small, all correctness,
   all directly against §1's acceptance criteria.
2. **MP-2 client feel** — B1, B2, B3, B4, B5. The actual owner complaint. Biggest change;
   touches `protocol.ts`, `sync.ts`, `party.ts`, `dungeon.ts` (`predictLocal`), with the
   smoke harness extended to run host and client tick-for-tick through a delay queue and
   assert convergence rather than eyeballing it.
3. **MP-3 what clients see** — C1, C2, C3, C7 (one `PROTOCOL_VERSION` bump for all of it).
4. **MP-4 host picks the portal** — D1, if approved.
5. D2–D7 as decided.

## Test plan (all in `tools/smoke.ts`, extending the `=== multiplayer ===` section)

- Departed hero: mark one departed; assert descend count excludes it, it can't be revived,
  the wipe check ignores it, monsters don't target it.
- Frozen roster: drive `Party.receive` directly (the constructor doesn't open a socket);
  assert a `start` without our id is ignored and a descend reuses the original roster.
- Interpolation: two snapshots, N client ticks, assert bodies move monotonically to the
  target and arrive after one snapshot interval; projectiles extrapolate.
- Reconciliation: host and client in one process with an N-tick input delay queue; assert
  the client's predicted position converges on the host's within a pixel after the ack
  and does not oscillate; assert a predicted dash matches the host's landing spot.
- Hero status bits, minion and affix arrays round-trip through `JSON.parse(JSON.stringify)`.
- Stale input zeroes after the timeout.
- Full level structural equality across the wire round trip for delve / rift / planet.

## Ledger

| Date | Item | Status |
| --- | --- | --- |
| 2026-09-08 | Audit written; findings A1–D7 | this document |
| 2026-09-08 | A3 text-field keys swallowed | **fixed** — `core/input.ts` `isEditableTarget` + enabled check before `preventDefault`; `main.ts` uses the same predicate; `=== controls ===` smoke section added |
| 2026-09-08 | PM rulings | order approved; D2 = early extraction (reuse `EARLY_EXTRACT_KEEP`); D7 = keep code, PM patches CLAUDE.md; D3 skipped; **D1 approved by the owner — scheduled as MP-4** |
| 2026-09-08 | **MP-1 landed** — A1, A2, C4, C5, C6, D2 | A1: `Hero.departed`, `Dungeon.dropHero`/`partySize`; portal count, revive, clear-revive and wipe check all respect it; `HeroSnap.gn`; renderer/HUD draw departed heroes grey. A2: `Party.runRoster` frozen at `startFloor`, `start` addressed only to the roster, descend reuses it minus the departed; client ignores a `start` without its id and ignores `end` when not running; `plan.running` tells a mid-run arrival to wait (notice + Comms Relay code row); `Dungeon` throws for a party role with no local hero. C4: `end.early` on the wire, `Party.endRun(how, early)`, `onEnd(how, early)`; main.ts decides bank-vs-forfeit on the flag. C5: `enterHub()` re-hellos. C6: full level fingerprint (walls, traps, props, nodes, blocked hash, quota) equal across the wire round trip for delve / boss / rift / planet. D2: `closed()` → `onEnd("hostLeft", true)`; main.ts banks a cleared floor in full, forfeits a lost one, early-extracts otherwise. Smoke: sections 6–8 of `=== multiplayer ===`. No `PROTOCOL_VERSION` bump yet — all new fields optional; one bump at the end of MP-3. |
