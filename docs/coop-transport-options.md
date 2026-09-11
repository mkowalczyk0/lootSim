# Co-op transport: should the relay change? (decision memo, 2026-09-10)

**Short answer: no, not for the delay the owner reported — that delay is built into how
the client draws things, not into how the packets travel, and this branch fixes the two
worst cases of it structurally. Keep the dependency-free relay.** A hosted relay is a
reachability decision, not a latency one, and the memo below prices it honestly in case
reachability is what the owner actually wants.

The owner's words: *"Additionally we need to look into a different way to do multiplayer,
maybe the cloudflare gate? Attacks still have delays, very prevalent when you use
wards/AOE abilities that follow the player, horrendous delay."*

## What the relay is today

`tools/relay.ts`: dependency-free, speaks RFC 6455 itself, mounted on the same HTTP server
Vite is already running (`vite.config.ts`), so `npm run host` serves the game, the room
and the account save (`tools/accounts.ts`, `docs/accounts.md`) on one port, and a client's
relay address is simply the origin it loaded the page from. Rooms, codes, peers, bytes —
it never looks inside a message. The host's browser is the simulation; clients send
buttons and draw snapshots at 20 Hz.

Three project rules ride on that: **no runtime dependencies**, **the relay is dumb**, and
**the host's browser is the simulation**. Any option below says which of those it spends.

## What the delay actually is — by construction, not by stopwatch

No wall-clock latency number was taken for this memo, deliberately. Every co-op reading on
this machine tonight is confounded: `docs/docket.md` §1 records the load audit, and tonight
the host machine sat at load average 25 on 8 cores with up to eleven concurrent gate runs
while the owner was hosting on it. A number taken in that room would be a number about the
room. What follows is read off the source instead, which contention cannot move.

A client's action reaches its own screen on one of two paths:

| Path | What the client draws | When it shows |
| --- | --- | --- |
| **Predicted** | its own movement, its own dash (`predictStep`) | the same frame |
| **Host's word** | everything else | one-way latency up → the host's next sim tick (≤16 ms) → the next 20 Hz snapshot (≤50 ms) → one-way latency down → `LERP_SPAN` 60 ms of interpolation for bodies |

So a non-predicted thing shows **RTT + roughly 60–125 ms**, and a predicted thing shows
**immediately**. The 60–125 ms part is cadence and interpolation; **no transport touches
it**. A transport only moves the RTT term, and on a LAN — which is how `npm run host` is
played — that term is already about a millisecond.

The owner's sentence names the worst case exactly. Before this branch:

- **A ward / AOE that follows the player** crossed the wire as `[x, y, radius, element,
  remaining]` with no owner index, and the client rebuilt every ground zone from scratch
  on each snapshot with no interpolation. So a follow-the-player zone was drawn at the
  host's copy of the hero — a full round trip old — and teleported every 50 ms, **while the
  hero it should ride was predicted forward**. It was the one effect on screen guaranteed to
  trail its owner by the whole round trip, which is why it was the *prevalent* case. Fixed:
  the zone carries its owner index and drift velocity (`Snapshot.g`), the client anchors it
  to its own copy of that hero every tick after prediction (`Dungeon.carryZones`), and a
  drifting zone travels between snapshots like a projectile. Asserted in `npm run smoke`
  with the client's hero walked ahead of the wire and the zone required to be under the
  walked body, not the wire's.
- **Your own basic attack** was drawn on the host's word: `applyHero` adopted the host's
  swing timer for the local hero, so your own attack button was the most delayed thing on
  your screen. Fixed: one `Dungeon.startSwing` for both ends, the client calls it the tick
  the button goes down, the host's late copy no longer restarts the animation, and the
  host's forwarded crescent for a swing you already drew is dropped. Only the animation is
  predicted; every hit, number and knockback is still the host's. Asserted in the smoke: a
  host snapshot that has not seen the press cannot cancel the in-flight swing.
- **The HUD's resources and cooldown readiness** (a separate report, same family) read a
  client's own never-ticking pools and runtime. Fixed on the wire (`HeroSnap.rs`) and in
  `canCast`.

**What this does and does not cover.** It covers the follow-the-player case the owner
called prevalent, and your own basic-attack swing. It does **not** predict skill or
ultimate casts (their effects are too varied to fake safely tonight — a cast still shows
on the host's word), and it does not change the snapshot cadence, so a *skill's* effect
still arrives RTT + 60–125 ms after the press. If residual delay is reported after this
lands, that is the next thing to look at, and it is still prediction work, not transport.

**The one transport-adjacent thing the source does say:** the relay is a TCP/WebSocket
pipe, so one lost packet stalls everything queued behind it (head-of-line blocking). On a
LAN that never happens; on a lossy wifi link it can. That is the only argument for a
different *protocol* (option 3), and it needs a measurement on a real lossy link before it
is worth its cost.

**And the cheapest explanation is still untested.** `docs/docket.md` §1's hypothesis — the
host's own CPU starvation making snapshots late and uneven, which a client cannot tell from
network jitter — costs no code: the owner hosts once with the machine quiet and once with a
couple of cores loaded, and the client says which felt worse. Tonight's load audit is
direct evidence this host *does* get starved in ordinary use. No relay anywhere fixes a
pinned host.

## The options, priced

### 1. Keep the relay, fix prediction — the null option (recommended)

**What it buys:** the two structural fixes above land now; the remaining prediction work
(skill-cast animation, zone identity across snapshots so non-follow zones interpolate too)
is the same shape and can be asserted the same way. **What it costs:** developer time only.
No money, no deploy pipeline, no account with anyone. **Rules spent:** none.

This is the *measured* recommendation, not the conservative one: the prevalent symptom was
derived from the code and closed in the code, and no transport change could have touched it.

### 2. A hosted relay (Cloudflare Workers + Durable Objects, or any always-on WebSocket host)

**What it buys:** reachability. Today someone has to run `npm run host` on a machine the
others can reach; a hosted relay means a public room code works from anywhere with no
port-forwarding and no one's laptop being the server for the *room* (the host's browser is
still the simulation). **What it does to the delay: nothing good.** Every packet now goes
client → edge → host instead of client → host; on a LAN that turns ~1 ms into a trip to the
nearest point of presence and back for *both* directions of every snapshot. It cannot reduce
the 60–125 ms cadence term at all.

**Cost to build:** a Worker + Durable Object port of `relay.ts` (the protocol is small),
plus splitting the account save server (`tools/accounts.ts`, SQLite via `node:sqlite`) off
the relay — it is co-hosted today and would have to either move with it (a different
storage) or stay behind and be reached cross-origin (cookies, CORS). **Cost to run:** a
paid tier once Durable Objects are on; small, but real and recurring, with a deploy
pipeline and a Cloudflare account to keep alive. **Rules spent:** "no runtime dependency"
in spirit — the shipped bundle stays dependency-free, but the game gains an external
service it cannot be played without. "The relay is dumb" and "the host's browser is the
simulation" both survive.

Take this only if the goal is *playing with people who are not on your network*. It should
be framed to the owner as that decision, not as a lag fix.

### 3. WebRTC data channels, relay kept only for signalling

**What it buys:** the shortest possible path (host ↔ client direct, no relay hop) and,
more importantly, **unreliable/unordered delivery**, which removes head-of-line blocking —
a lost snapshot is simply superseded by the next one instead of stalling the queue. This is
the only option that changes something the source actually blames. **What it costs:**
ICE/STUN negotiation in the browser (native API, no npm dependency), a signalling protocol
over the existing relay, a TURN fallback for the NAT pairs that cannot connect directly —
which is a server again, and a paid one — and a second transport path in `net/client.ts`
to keep correct. Substantial. **Rules spent:** "the relay is dumb" holds (signalling is
still bytes); nothing else. **When it is worth it:** only after a measurement on a real,
lossy link shows loss-driven stalls. On a LAN it buys nothing.

### 4. A dedicated authoritative server (the simulation off the host's browser)

**What it buys:** the host's machine no longer matters — no host CPU starvation, no host
leaving ending the room, host migration for free, symmetric latency for everyone. `game/` is
DOM-free, so the simulation can run in Node today. **What it costs:** the largest change on
this list. Every player becomes a client that predicts (this branch's prediction work is
the down payment on that), the server has to run the sim at 60 Hz per room, and it is a
server to host, pay for and keep up. **Rules spent:** "the host's browser is the simulation"
outright. **When it is worth it:** if the docket §1 experiment shows host load dominates the
lag *and* the owner wants to keep hosting on a machine that is doing other things. Not
before that measurement.

## Recommendation

Ship option 1 (this branch), then run the no-code host-load experiment from `docs/docket.md`
§1 before spending anything on 2–4. If after both the owner still wants a hosted relay, it
is because they want to play across the internet, and option 2 is a fine way to get that —
priced as reachability, with the account server's move as part of the bill. Option 3 waits
for a loss measurement on a real link; option 4 waits for the host-load result.

What would change this recommendation: a measurement, on a quiet host, over a real link,
that shows delay still dominated by something the prediction work above does not cover. If
that reading exists, take it with the machine load recorded next to it, the way §1 asks.
