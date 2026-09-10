# Multiplayer stuttering — a reproduction attempt, and what it clears

Status: **measured, not fixed.** `docs/docket.md` item 1 — a real player report from a
real session ("stuttering and frame drops... after joining my lobby," the owner's own
machine hosting). Per that item's own instruction: reproduce before theorising. This
document is the reproduction attempt against all three named suspects, in the order the
docket gave them, and it clears two of the three rather than confirming one.

## Suspect 1: snapshot size and cadence — re-measured, and the stale number is real

CLAUDE.md's "a bit over 40 kB/s per player" comes from one measurement in
`tools/smoke.ts`'s co-op section, at `delveConfig(8, 0, 2)` — depth 8, two players,
whatever monster count a 120-second scripted fight happens to produce (docs/coop-audit.md:
"busiest smoke snapshot 2.2 kB / 26 monsters ≈ 45 kB/s per player"). Deep floors spawn far
more bodies (`enemiesPerWave`/`maxAlive` climb with depth in `data/depth.ts`), so this is
the same "a constant that was correct for one rung" shape this project keeps finding in
itself. `tools/mp-stutter.ts` re-measures it with the identical harness shape smoke.ts
already uses (a real host `Dungeon`, `encodeSnapshot`, bots that path to the nearest
enemy) across a real depth range, 90-second fights, 2 and 4 players:

| depth | players | busiest monsters | avg kB/s/player | peak kB/s/player |
| --- | --- | --- | --- | --- |
| 8 | 2 | 24 | 32 | **45** (matches the documented number) |
| 18 | 2 | 41 | 49 | **66** |
| 26 | 2 | 57 | 76 | **90** |
| 8 | 4 | 37 | 49 | 71 |
| 18 | 4 | 57 | 77 | **99** |
| 26 | 4 | 60 | 92 | **105** |

(Depth 15 rows are omitted here — both party sizes died in under 5 seconds on that seed,
too short a sample to mean anything; not the finding this table is about, and not worth
re-rolling for.)

**The documented number holds exactly at the depth it was measured at (45 kB/s at depth
8, 2 players — this re-run landed on the identical figure) and is 2-2.3x low by depth
18-26, worse at four players than two.** That's a real, quantified staleness, and it's
worth fixing the doc regardless of what the rest of this document finds — but read the
number in context: 105 kB/s is roughly 0.84 Mbps. That is not a bandwidth problem for
anyone on ordinary home broadband, upload included. If the reporter's connection is
metered, throttled, or genuinely thin, this could matter; for anything resembling typical
consumer internet, this number alone does not explain visible stutter.

## Suspect 3 (checked first, because it's cheap to rule out): the host's own compute cost

Before spending time on a live rig, the same harness times the host's own per-tick work —
`host.update()` (the whole simulation, paid every tick regardless of connected clients)
and `encodeSnapshot()` + `JSON.stringify` (paid once per relay tick, per client) — across
the same depth range:

| depth | players | avg sim ms | worst sim ms | avg encode ms | worst encode ms |
| --- | --- | --- | --- | --- | --- |
| 8 | 2 | 0.090 | 1.13 | 0.021 | 0.10 |
| 26 | 2 | 0.387 | 1.13 | 0.040 | 0.16 |
| 8 | 4 | 0.118 | 0.83 | 0.026 | 0.54 |
| 26 | 4 | 0.453 | 1.50 | 0.047 | 0.10 |

Sim cost does climb with monster count — roughly 5x from depth 8 to depth 26 — but the
absolute numbers stay tiny: worst case ~1.5ms against a 16.67ms frame budget, average
under half a millisecond even at 60 monsters and 4 players. **The simulation and
snapshot-encoding cost, measured in the same JS engine a browser uses, is not what's
eating the host's frame budget.** This doesn't clear rendering (canvas draw calls for
every monster, particle and effect — genuinely not exercised by a headless `Dungeon`),
which is why the next section tests real rendering rather than trusting this number to
generalize past the simulation layer.

## Suspects 2 and 3, together: real frame timing on a real floor, two real browser tabs

`tools/smoke.ts` already proves the protocol works end-to-end in one process; it cannot
tell you whether either end *feels* smooth, because nothing renders. This is the "get two
real browsers on this machine" half of the assignment: a throwaway dev server, two
throwaway accounts (one boosted via a direct save edit to a high Challenger tier, purely
to make a depth-1 floor as crowded as a deep one without grinding there first — the count
this buys is the same `crowd`/`enemiesPerWave` term a real depth 18-26 floor would hit),
a real room, a real host and a real client, `requestAnimationFrame` hooked on both pages
from load to record every render frame's interval, and both bots fighting for 20 real
seconds once the floor loaded.

**Nightmare VI (danger ≈6.9x), 2 players, a sustained fight with 3 elites and 34
monsters on the wave — both ends render at a clean, essentially identical 60fps:**

| | n frames | mean | p50 | p95 | p99 | max | frames > 33.3ms | frames > 50ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Host** (simulates + renders) | 1219 | 16.67ms | 16.70 | 16.70 | 16.80 | 16.80 | 0 | 0 |
| **Client** (renders only) | 1220 | 16.67ms | 16.70 | 16.70 | 16.80 | 16.80 | 0 | 0 |

Zero frames over 33ms (a dropped frame at 60fps) on either end, let alone anything a
player would call a stutter. A second pass at Death March II (danger ≈48x — the party died
in seconds, so this sample is thinner and partly a static "the party fell" screen rather
than live combat) showed the same clean distribution. **Under these conditions — localhost
relay, this machine's GPU, a script mashing attack rather than a person — neither the
host's render loop nor the client's degrade under load, at any density this rig could
reach.** That's evidence against suspect 2 (client interpolation cost scaling with monster
count) as well as the render half of suspect 3: if `advanceRemote` were getting expensive
as the monster count climbed, the client's frame times would show it, and they don't.

## What this does and doesn't clear

**Cleared, with real numbers behind it:**
- The simulation and encoding cost on the host (suspect 3's compute half).
- Client-side interpolation cost scaling with monster count (suspect 2).
- Render-loop degradation on either end under the heaviest load this rig could produce.

**Not cleared, and the most likely place left to look:** everything about this rig ran
over `localhost` — effectively 0ms, 0-jitter, 0-loss network. `tools/relay.ts` is a bare
WebSocket/TCP relay with no message inspection, and TCP's own head-of-line blocking means
one delayed or reordered packet stalls everything queued behind it on that connection.
**A real internet path between the owner's machine and the reporter's — real RTT, real
jitter, real packet loss — is the one suspect this document could not put a real browser
in front of, and it is now the leading remaining candidate precisely because the other
two came back clean.** Suspect 1's re-measured number matters here too: 45-105 kB/s is
nothing on a clean connection, but the same bytes over a lossy or congested one cost
retransmits and delay a plain byte count can't show.

**Also not measured:** a real multi-minute session (this ran 20 seconds — a slow leak or
a GC pause pattern that only shows up over longer play would not have appeared here), a
real deep-floor dive rather than Challenger-inflated depth 1 (the monster-count proxy is
the same term either way, but a real floor's room layout, wave timing and biome props are
not), and the owner's own actual hardware (this ran on the development machine, not the
host machine from the report).

## Reproducing this

`npx tsx tools/mp-stutter.ts` for suspects 1 and 3's compute half — not gated, not in
`npm test`, same exclusion as `reachability.ts` and `raid-arena-contrast.ts`. The two-tab
rig is not a committed script (it drove real UI navigation with hardcoded pixel-timed
`WASD` holds against one specific Citadel layout, which is exactly the kind of thing that
breaks the moment the deck is rearranged) — reproduce it by: a throwaway `LOOTSIM_DB` and
port, two registered accounts, one save edited to raise `challengerTier` (`GameState`,
default 0, `MAX_CHALLENGER_TIER` 20) for a crowded floor without grinding depth, a hosted
room joined by the second account, both walking into the Delve portal, and an
`addInitScript` wrapping `requestAnimationFrame` to log `t - lastT` into a global array
read back after the fight.

## Not fixed, on purpose

No relay code, no encoding format and no interpolation code changed. What this document
adds is where the search narrows to next: not the simulation, not the client's own render
loop, but the network path between two real machines that this investigation had no way
to put a browser on both ends of.

---

# Stage 2 (2026-09-10): the real two-machine report, the cause, and the fix

Stage 1 above ended by naming the one suspect it could not put a browser in front of — a
real internet path. **That input arrived**: the owner played co-op with a second person on
a separate machine, the first time this game has ever run off localhost.

> *"So I was hosting, felt perfectly fine on my end. maybe it wasn't as smooth, but very
> playable, very good. And, yeah, no. We were both on Wi-Fi, and it was bad immediately."*

Five facts, all confirmed: the owner hosted; **the host felt fine**; both ends on wifi; bad
immediately rather than degrading; and movement felt laggy as well as attacks.

Host-fine-client-bad rules out the frame budget on its own — the host waits for nothing.

## The cause: a 10ms jitter tolerance

A client never simulates. `Dungeon.advanceRemote` slides every remote body toward the
position the newest snapshot gave it over `LERP_SPAN` (`1.2 / SNAPSHOT_HZ` = **60ms**), then:

```ts
if (target.t <= 0) { body.x = target.x; body.y = target.y; continue; }   // stops dead
```

Snapshots are sent every **50ms**. **The slack before every monster, ally and minion freezes
in place is 60 − 50 = 10ms.** On wifi, ordinary jitter exceeds that constantly.

**Why nothing caught it, and this is the part worth generalising:** every check in this repo
runs over loopback, where the inter-arrival gap never exceeds 60ms — so the failure mode is
not merely untested, it is **structurally unreachable**. A harness with no network in it
cannot fail the way this bug fails. Stage 1's own two-browser rig, at a clean 60fps on both
ends, was measuring a machine talking to itself.

## The instrument: `tools/mp-jitter.ts` (`npm run mpjitter`)

A real host `Dungeon` and a real client `Dungeon` with a **modelled link** between them —
latency, jitter, loss, and TCP's in-order delivery (a retransmit delays everything queued
behind it). Its first act is a calibration that must read **exactly 0%** on a perfect link,
and it refuses to print anything else if that fails.

Chop, as % of client render ticks with no snapshot inside the interpolation window:

| profile | before | after (80ms buffer) |
| --- | --- | --- |
| LAN | 0.0% | 0.0% |
| same city | 0.0% | 0.0% |
| cross-country | 1.6% | 0.0% |
| **wifi, congested** | **13.4%** | **0.0%** |
| transatlantic | 10.0% | 0.6% |

## The fix, and the wrong version that measured convincingly

`Party.drainSnapshots` queues arriving snapshots and plays them out on a **steady cadence**.
`SNAPSHOT_BUFFER_MS = 80` is a measured knee; the sweep, the assumption it holds under
(one-way jitter to ~±40ms) and the cost live in the constant's own doc comment.

**The first implementation held each snapshot a fixed 80ms and applied it, and measured as a
total null — 13.4% chop became 12.9%.** The reason is worth carrying: *a constant delay
shifts every arrival equally and therefore preserves the gaps between them*, and jitter is
variance in those gaps. It was nearly reported as "a jitter buffer doesn't help". The smoke
check is written to fail that exact wrong version — it feeds four snapshots in one burst and
requires them to come out one interval apart.

**The cost, plainly:** the world a client draws goes from ~33ms stale to ~129ms, paid on
every link including the LAN players who had no problem. An adaptive window was built to
avoid that and **rejected** — worse than fixed 80ms on three of four profiles.

## The input path, and why the transport should NOT be swapped

`tools/smoke.ts`'s *"a walking client is never tugged back by the host"* runs at a constant
lag with zero jitter and zero loss. Re-measured with a real link, **it breaks its own bar**
(wifi worst 2.00px against a 1.5 bar; transatlantic p95 1.95px, worst 5.94px) and 26–50% of
host ticks arrive with no input at all. The check is annotated in place; a green there says
nothing about live conditions.

**And UDP is much worse than TCP for inputs:**

| profile | TCP median / worst | UDP median / worst |
| --- | --- | --- |
| wifi, congested | 0.02px / 2.00px | 1.99px / 11.12px |
| transatlantic | 0.02px / 5.94px | 1.97px / 8.40px |

> **A dropped snapshot is superseded by the next one; a dropped INPUT is a button press that
> never happened on the host.** The client predicted forward assuming it applied, the host
> never learned it, and the divergence is permanent until a correction yanks it back. TCP's
> retransmit — the thing head-of-line blocking is the price of — is what keeps prediction
> honest.

Snapshots measured TCP ≈ UDP for chop (11.7 vs 12.1, 28.0 vs 29.0, 24.9 vs 24.4). **So
neither channel favours a WebRTC swap**: it would have to run unreliable for snapshots and
reliable for inputs merely to break even, or carry redundant input history so drops
self-heal. Large job, measured upside currently zero.

## What is still open

Corrections of 2–6px are real but small — ~30ms of travel, a micro-jitter, not "near
unplayable". The likeliest reading of *"movement felt laggy"* is that **movement feels laggy
because everything around it is chopping**: when monsters freeze and jerk, your own motion
relative to them reads as lag even though your avatar responds instantly.

**That predicts the buffer fixes the perceived movement lag too, and testing it costs
nothing — it needs the owner to re-play, not another measurement.** If movement still feels
wrong afterwards, the remaining suspect is that **attacks are not predicted at all**
(`predictLocal` covers movement, facing and dash and nothing else), so a client waits a full
round trip to see its own swing. That is a real correctness risk to change and should not be
built on inference.

Still not known: the actual ping and jitter of the owner's link, and whether it was LAN or
internet.
