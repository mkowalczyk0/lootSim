// Multiplayer chop — docket §1, stage 2. Not gated, not in `npm test`: an open
// measurement, the same exclusion `mp-stutter.ts` and `reachability.ts` carry.
//
// ## Why a second instrument, when mp-stutter.ts exists
//
// `tools/mp-stutter.ts` measured bandwidth and host compute and cleared both. Its blind
// spot is stated in its own write-up: everything it does runs over a **perfect link**.
// `docs/mp-stuttering.md` closes by naming the one suspect it could not put a browser in
// front of — a real internet path, with real jitter and real loss — and a harness with no
// network in it **cannot fail in the way the bug fails**. That is this repo's own logged
// trap: an instrument that runs but is blind returns a plausible number instead of an
// error.
//
// So this one puts a simulated network between a real host `Dungeon` and a real client
// `Dungeon`, and measures the thing the player actually complains about.
//
// ## What it measures, and why THIS quantity
//
// A client never simulates: `Dungeon.advanceRemote` slides every remote body toward the
// position the last snapshot gave it, over `LERP_SPAN` seconds, and then — this is the
// whole mechanism —
//
//     if (target.t <= 0) { body.x = target.x; body.y = target.y; continue; }
//
// stops dead until the next snapshot arrives. `LERP_SPAN` is `1.2 / SNAPSHOT_HZ` = 60ms
// against a 50ms send interval, so a body has **10ms of slack** before it freezes. The
// metric here is therefore the fraction of client render ticks on which bodies are
// STARVED — out of interpolation target, holding still because nothing has arrived — plus
// the longest single freeze. That is chop, in the units the code actually produces it in.
//
// **The calibration that proves it is not blind: on a perfect link this number must be
// ~0.** If a run with 0 latency, 0 jitter and 0 loss reports starvation, the harness is
// measuring itself and nothing it says about a real link means anything. That check runs
// first, every time, and the tool refuses to print the rest if it fails.
//
// ## The two transports, on the same fight
//
// `tcp` reproduces what `tools/relay.ts` is: ordered, reliable delivery, so a packet is
// held until every packet before it has arrived and a loss costs a retransmit that delays
// **everything queued behind it** (head-of-line blocking). `udp` is unordered and
// unreliable — what a WebRTC DataChannel in its unreliable mode would give — where a lost
// packet is simply gone and the next one is not delayed by it. Running both over one
// identical fight is what makes the transport question answerable with a number instead of
// an argument.
import { Dungeon } from "../src/game/dungeon";
import { delveConfig } from "../src/data/modes";
import {
  InputLog, NetInput, applySnapshot, configFromWire, configToWire, encodeSnapshot, packInput,
} from "../src/net/sync";
import type { Snapshot } from "../src/net/protocol";
import { SNAPSHOT_HZ } from "../src/net/protocol";
import { geared, FakeInput } from "./bot";
import { FlowField } from "../src/game/level";
import type { AvatarInput } from "../src/core/input";

const DT = 1 / 60;
const SEND_EVERY = Math.round(60 / SNAPSHOT_HZ); // host ticks between snapshots
/** `net/sync.ts`'s own value: how long a body has to reach the last snapshot's position. */
const LERP_SPAN = 1.2 / SNAPSHOT_HZ;

/** A deterministic RNG, so a jitter profile is reproducible run to run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Link {
  /** Round-trip time in ms; one-way delay is half. */
  rtt: number;
  /** Peak +/- jitter in ms applied to each packet's one-way delay. */
  jitter: number;
  /** Packet loss probability, 0..1. */
  loss: number;
  /** `tcp` = ordered + retransmit (head-of-line); `udp` = unordered, drops stay dropped. */
  mode: "tcp" | "udp";
}

interface Packet<T> { snap: T; at: number; sentAt: number; }

/**
 * The network. `send` stamps a delivery time; `arrivals` returns what has landed by now.
 *
 * TCP is modelled as **in-order delivery**: a packet cannot be handed over before every
 * packet sent before it, so one delayed or retransmitted packet drags the whole tail with
 * it. That is the head-of-line behaviour the transport question turns on, and modelling it
 * is the entire reason this is not just `setTimeout`.
 */
class SimLink<T> {
  private queue: Packet<T>[] = [];
  private lastDelivery = 0;
  private readonly rand: () => number;
  lost = 0;
  sent = 0;

  constructor(private readonly link: Link, seed: number) { this.rand = rng(seed); }

  send(snap: T, now: number): void {
    this.sent++;
    const oneWay = this.link.rtt / 2;
    const jitter = (this.rand() * 2 - 1) * this.link.jitter;
    let at = now + (oneWay + jitter) / 1000;
    const dropped = this.rand() < this.link.loss;
    if (dropped) {
      this.lost++;
      if (this.link.mode === "udp") return;         // gone, and nothing waits for it
      at += this.link.rtt / 1000;                   // TCP: one retransmit round trip
    }
    if (this.link.mode === "tcp") {
      // Ordered: never before the packet in front of it.
      at = Math.max(at, this.lastDelivery + 1e-9);
      this.lastDelivery = at;
    }
    this.queue.push({ snap, at, sentAt: now });
  }

  arrivals(now: number): Packet<T>[] {
    if (this.queue.length === 0) return [];
    const ready = this.queue.filter((p) => p.at <= now);
    if (ready.length === 0) return [];
    this.queue = this.queue.filter((p) => p.at > now);
    // Unordered links can deliver out of order; the client should see them in send order
    // only because it applies whatever it gets. Sort by arrival to be faithful.
    ready.sort((a, b) => a.at - b.at);
    return ready;
  }
}

interface Result {
  starvedPct: number;
  avgLagMs: number;
  longestFreezeMs: number;
  meanGapMs: number;
  worstGapMs: number;
  lossPct: number;
}

function run(depth: number, players: number, seconds: number, link: Link, seed: number,
             buffer: number | "adaptive" = 0): Result {
  const heroStates = Array.from({ length: players }, (_, i) =>
    geared(Math.max(1, depth + 4), 9100 + i, 16, i % 2 === 0 ? "swordsman" : "magician"));
  const setups = heroStates.map((s, i) => ({
    netId: i === 0 ? "" : `p${i + 1}`, name: `P${i + 1}`, player: s.player,
    appearance: s.appearance, potions: 5, local: i === 0,
  }));
  const config = delveConfig(depth, 0, players);
  const host = new Dungeon(heroStates[0]!, config, { seed: 5150 + depth, role: "host", heroes: setups });
  const inputs = heroStates.map(() => new FakeInput());
  host.heroes.forEach((hero, i) => { if (i > 0) hero.input = inputs[i] as unknown as AvatarInput; });
  const routes = host.heroes.map(() => new FlowField(host.level));

  // A real client of the same floor, driving hero 1 — the shape smoke.ts already uses.
  const clientState = geared(Math.max(1, depth + 4), 8802, 16, "magician");
  const client = new Dungeon(clientState, configFromWire(configToWire(config)), {
    seed: 4242, role: "client",
    heroes: setups.map((s, i) => ({ ...s, local: i === 1 })),
  });
  const clientInput = new FakeInput();

  const net = new SimLink<Snapshot>(link, seed);
  let t = 0, tick = 0, routeTimer = 0;
  let starvedTicks = 0, totalTicks = 0;
  let freezeRun = 0, longestFreeze = 0;
  let lastArrival = 0;
  const gaps: number[] = [];
  const held: { snap: Snapshot; useAt: number; sentAt: number }[] = [];
  let lastNetArrival = 0;
  let playing = false, nextPlayout = 0, fillStart = 0;
  let lagSum = 0, lagSamples = 0, appliedSentAt = 0;
  const recent: number[] = [];
  // Adaptive window: the observed p95 inter-arrival gap above the nominal send
  // interval IS the jitter, and the buffer only has to cover that.
  const NOMINAL = 1000 / SNAPSHOT_HZ, MIN_MS = 20, MAX_MS = 180, SAFETY = 1.5;
  const windowMs = (): number => {
    if (buffer !== "adaptive") return buffer;
    if (recent.length < 8) return MIN_MS;
    const sorted = [...recent].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
    return Math.max(MIN_MS, Math.min(MAX_MS, (p95 - NOMINAL) * SAFETY));
  };

  while (t < seconds && host.phase === "fighting") {
    routeTimer -= DT;
    const repath = routeTimer <= 0;
    if (repath) routeTimer = 0.25;
    host.heroes.forEach((hero, i) => {
      const input = inputs[i]!;
      input.beginTick();
      const target = host.enemies.filter((e) => e.state !== "spawning")
        .sort((a, b) => Math.hypot(a.x - hero.avatar.x, a.y - hero.avatar.y)
          - Math.hypot(b.x - hero.avatar.x, b.y - hero.avatar.y))[0];
      const goal = target ?? host.completionPortal ?? host.level.portal;
      if (repath) routes[i]!.update(host.level, goal.x, goal.y);
      const step = routes[i]!.direction(host.level, hero.avatar.x, hero.avatar.y);
      const angle = step
        ? Math.atan2(step.y, step.x)
        : Math.atan2(goal.y - hero.avatar.y, goal.x - hero.avatar.x);
      input.hold("right", Math.cos(angle) > 0.3);
      input.hold("left", Math.cos(angle) < -0.3);
      input.hold("down", Math.sin(angle) > 0.3);
      input.hold("up", Math.sin(angle) < -0.3);
      input.hold("attack", true);
    });
    host.update(DT, inputs[0] as unknown as AvatarInput);

    if (tick % SEND_EVERY === 0) {
      net.send(JSON.parse(JSON.stringify(encodeSnapshot(host))) as Snapshot, t);
    }

    // A de-jitter buffer, and the distinction below is the whole reason it works.
    //
    // The FIRST version of this held each snapshot for a constant `bufferMs` and then
    // applied it, and it measured as a complete null — 13.4% starved became 12.9%. That
    // was an instrument bug that produced a convincing wrong answer: **a constant delay
    // shifts every arrival by the same amount and therefore preserves the gaps between
    // them exactly.** Jitter is variance in those gaps, so a constant delay cannot touch
    // it, and the harness faithfully reported that it didn't.
    //
    // A real de-jitter buffer RE-CLOCKS. Arrivals go into a queue; the queue is drained on
    // a steady cadence — one snapshot per send interval — so bunched arrivals are spread
    // back out and a late one is covered by the depth built up ahead of it. The buffer only
    // fails when it underruns, which is what makes its depth the thing worth tuning.
    for (const pkt of net.arrivals(t)) {
      if (lastNetArrival > 0) recent.push((t - lastNetArrival) * 1000);
      if (recent.length > 40) recent.shift();
      lastNetArrival = t;
      held.push({ snap: pkt.snap, useAt: 0, sentAt: pkt.sentAt });
    }
    const bufferMs = windowMs();
    if (bufferMs === 0) {
      while (held.length > 0) {
        const h = held.shift()!;
        applySnapshot(client, h.snap);
        appliedSentAt = h.sentAt;
        if (lastArrival > 0) gaps.push((t - lastArrival) * 1000);
        lastArrival = t;
      }
    } else {
      if (!playing && held.length > 0) {
        if (fillStart === 0) fillStart = t;
        if (t - fillStart >= bufferMs / 1000) { playing = true; nextPlayout = t; }
      }
      if (playing && t >= nextPlayout) {
        if (held.length > 0) {
          const h = held.shift()!;
          applySnapshot(client, h.snap);
          appliedSentAt = h.sentAt;
          if (lastArrival > 0) gaps.push((t - lastArrival) * 1000);
          lastArrival = t;
          nextPlayout += 1 / SNAPSHOT_HZ;
        } else {
          // Underrun: the queue ran dry. Re-fill before playing out again, otherwise the
          // buffer never recovers its depth and every later packet is late too.
          playing = false;
          fillStart = 0;
        }
      }
    }

    clientInput.beginTick();
    client.update(DT, clientInput as unknown as AvatarInput);

    // Starvation, measured as TIME SINCE THE LAST SNAPSHOT vs the interpolation window.
    //
    // The first version of this counted bodies whose `netLerp` target had `t <= 0`, which
    // looked like it was reading the exact field `advanceRemote` branches on. It was
    // wrong, and inflated every row: `applySnapshot` also sets `t: 0` deliberately for a
    // body that has just APPEARED (a fresh spawn is snapped into place, not slid), so a
    // wave spawning registered as the whole floor freezing. A perfect link scored 1.2%
    // and a 50ms "freeze" that was nothing of the sort.
    //
    // This is the mechanism itself with nothing in between: every body is fed by the same
    // snapshot, so the floor is starved exactly when the newest one is older than
    // LERP_SPAN. Zero on a perfect link BY CONSTRUCTION (50ms gaps under a 60ms window),
    // which is what makes the calibration meaningful rather than merely small.
    if (appliedSentAt > 0) { lagSum += (t - appliedSentAt) * 1000; lagSamples++; }
    if (lastArrival > 0) {
      totalTicks++;
      if (t - lastArrival > LERP_SPAN) {
        starvedTicks++;
        freezeRun += DT * 1000;
        longestFreeze = Math.max(longestFreeze, freezeRun);
      } else {
        freezeRun = 0;
      }
    }
    t += DT;
    tick++;
  }

  return {
    avgLagMs: lagSamples > 0 ? lagSum / lagSamples : 0,
    starvedPct: totalTicks > 0 ? (100 * starvedTicks) / totalTicks : 0,
    longestFreezeMs: longestFreeze,
    meanGapMs: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0,
    worstGapMs: gaps.length ? Math.max(...gaps) : 0,
    lossPct: net.sent > 0 ? (100 * net.lost) / net.sent : 0,
  };
}

const DEPTH = 18, PLAYERS = 2, SECONDS = 45;

console.log(`\nmp-jitter — client-side chop over a simulated link`);
console.log(`depth ${DEPTH}, ${PLAYERS} players, ${SECONDS}s, snapshots at ${SNAPSHOT_HZ}Hz `
  + `(one every ${(1000 / SNAPSHOT_HZ).toFixed(0)}ms)\n`);

// --- the calibration, first and non-negotiable -------------------------------------------
const perfect = run(DEPTH, PLAYERS, SECONDS, { rtt: 0, jitter: 0, loss: 0, mode: "tcp" }, 1);
console.log(`  calibration, perfect link:  starved ${perfect.starvedPct.toFixed(1)}% of ticks, `
  + `longest freeze ${perfect.longestFreezeMs.toFixed(0)}ms`);
if (perfect.starvedPct > 0.01) {
  console.log(`\n  REFUSING TO REPORT: a perfect link starves ${perfect.starvedPct.toFixed(1)}% `
    + `of ticks, so this harness is measuring itself. Every number below would be noise.`);
  process.exit(1);
}
console.log(`  (~0 as required — the instrument can tell a starved tick from a fed one)\n`);

const PROFILES: { name: string; link: Omit<Link, "mode"> }[] = [
  { name: "LAN            ", link: { rtt: 2, jitter: 1, loss: 0 } },
  { name: "same city      ", link: { rtt: 20, jitter: 5, loss: 0.001 } },
  { name: "cross-country  ", link: { rtt: 60, jitter: 15, loss: 0.005 } },
  { name: "wifi, congested", link: { rtt: 40, jitter: 40, loss: 0.02 } },
  { name: "transatlantic  ", link: { rtt: 120, jitter: 30, loss: 0.01 } },
];

console.log("  profile          transport  starved%   longest freeze   snapshot gap mean/worst   loss");
for (const { name, link } of PROFILES) {
  for (const mode of ["tcp", "udp"] as const) {
    const r = run(DEPTH, PLAYERS, SECONDS, { ...link, mode }, 99);
    console.log(`  ${name}  ${mode === "tcp" ? "TCP (today)" : "UDP (WebRTC)"}  `
      + `${r.starvedPct.toFixed(1).padStart(6)}%   `
      + `${r.longestFreezeMs.toFixed(0).padStart(7)}ms   `
      + `${r.meanGapMs.toFixed(0).padStart(5)}ms / ${r.worstGapMs.toFixed(0).padStart(5)}ms   `
      + `${r.lossPct.toFixed(2)}%`);
  }
}
console.log(`\n  starved% = client render ticks with no snapshot newer than the ${(LERP_SPAN*1000).toFixed(0)}ms`);
console.log(`  interpolation window — every remote body holding still. That is chop.\n`);

console.log(`\n=== does a jitter buffer fix it, and what does it cost? ===\n`);
console.log(`  A render-delay buffer holds each snapshot before applying it, so a late packet`);
console.log(`  still arrives before it is needed. The cost is that everything remote is drawn`);
console.log(`  that many ms in the past — a real, permanent price paid on every link.\n`);
console.log("  profile          buffer     starved%   longest freeze   world drawn this stale");
for (const { name, link } of PROFILES) {
  for (const buf of [0, 40, 60, 80, 100, 140] as const) {
    const r = run(DEPTH, PLAYERS, SECONDS, { ...link, mode: "tcp" }, 99, buf);
    console.log(`  ${name}  ${String(typeof buf === "number" ? buf + "ms" : buf).padStart(8)}   `
      + `${r.starvedPct.toFixed(1).padStart(6)}%   `
      + `${r.longestFreezeMs.toFixed(0).padStart(7)}ms   `
      + `${r.avgLagMs.toFixed(0).padStart(10)}ms`);
  }
}
console.log("");

// =========================================================================================
// The INPUT path — a separate question from everything above, and a separate complaint.
//
// The owner reported "very laggy, very choppy". Chop is the snapshot path and the buffer
// above fixes it. **Lag is the input path, and the owner has since confirmed that MOVEMENT
// felt laggy too** — which is the branch that should NOT happen: `predictLocal` predicts
// the client's own movement, facing and dash locally, and `net/sync.ts` reconciles by
// replaying unacknowledged inputs. Local movement is supposed to feel instant at any RTT.
//
// `tools/smoke.ts` asserts exactly that and is green: *"a walking client is never tugged
// back by the host — median 0.022px, worst 0.04px over 90 snapshots at 8 ticks RTT."*
// **That check runs at a CONSTANT lag with zero jitter and zero loss**, so it is
// structurally incapable of seeing the reported failure, in precisely the way loopback was
// incapable of seeing the chop. This section is that check with a real link under it, and
// its job is to go RED where the green one cannot.
//
// The mechanism under suspicion: `NetInput` centres a remote player's stick after
// `STALE_TICKS` (12) host ticks with no packet. If inputs stall — a wifi burst, a TCP
// retransmit — the host stops moving that hero while the client keeps predicting forward,
// and the next snapshot yanks it back. That is rubber-banding, and no constant-lag harness
// can produce it.
interface InputResult { medianPx: number; p95Px: number; worstPx: number; stalledPct: number; }

function runInputPath(link: Link, seed: number, ticks = 600): InputResult {
  const hostS = geared(18, 8813, 16, "swordsman");
  const cliS = geared(18, 8814, 16, "lancer");
  const pair = [
    { netId: "p1", name: "Host", player: hostS.player, appearance: hostS.appearance, potions: 5, local: true },
    { netId: "p2", name: "Cousin", player: cliS.player, appearance: cliS.appearance, potions: 5, local: false },
  ];
  const cfg = delveConfig(2, 0, 2);
  const h = new Dungeon(hostS, cfg, { seed: 777, role: "host", heroes: pair });
  const c = new Dungeon(cliS, configFromWire(configToWire(cfg)), {
    seed: 777, role: "client", heroes: pair.map((p, i) => ({ ...p, local: i === 1 })),
  });
  const remote = new NetInput();
  h.heroes[1]!.input = remote as unknown as AvatarInput;
  const log = new InputLog();
  const hostInput = new FakeInput();
  const cliInput = new FakeInput();
  const up = new SimLink<ReturnType<typeof packInput>>(link, seed);
  const down = new SimLink<Snapshot>(link, seed + 1);
  const corrections: number[] = [];
  const me = c.localHero.avatar;
  let stalled = 0, hostTicks = 0;
  cliInput.hold("right", true);
  cliInput.hold("down", true);

  let t = 0;
  for (let tick = 0; tick < ticks; tick++) {
    hostInput.beginTick();
    cliInput.beginTick();
    if (tick % 120 === 60) { cliInput.hold("down", false); cliInput.hold("up", true); }
    if (tick % 120 === 0 && tick > 0) { cliInput.hold("up", false); cliInput.hold("down", true); }

    c.update(DT, cliInput as unknown as AvatarInput);
    const seq = log.record(cliInput.moveVector(), cliInput.wasPressed("dash"));
    up.send(packInput(cliInput as unknown as AvatarInput, me.x, me.y, seq), t);

    const got = up.arrivals(t);
    for (const pkt of got) remote.receive(pkt.snap);
    hostTicks++;
    if (got.length === 0) stalled++;
    remote.beginTick();
    h.update(DT, hostInput as unknown as AvatarInput);
    h.enemies.length = 0;  // movement only, exactly as the smoke check isolates it
    h.drainEvents();
    if (tick % SEND_EVERY === 0) {
      down.send(JSON.parse(JSON.stringify(encodeSnapshot(h))) as Snapshot, t);
    }
    for (const pkt of down.arrivals(t)) {
      const wasX = me.x, wasY = me.y;
      applySnapshot(c, pkt.snap, undefined, log);
      if (tick > 60) corrections.push(Math.hypot(me.x - wasX, me.y - wasY));
    }
    t += DT;
  }
  corrections.sort((a, b) => a - b);
  const at = (q: number) => corrections[Math.min(corrections.length - 1, Math.floor(corrections.length * q))] ?? 0;
  return {
    medianPx: at(0.5), p95Px: at(0.95), worstPx: corrections[corrections.length - 1] ?? 0,
    stalledPct: hostTicks > 0 ? (100 * stalled) / hostTicks : 0,
  };
}

console.log(`\n=== the INPUT path: is the client's own movement corrected? ===\n`);
console.log(`  smoke.ts asserts median < 0.1px and worst < 1.5px, at a CONSTANT 8-tick lag.`);
console.log(`  Same rig, real links. A correction is how far the local hero is yanked when a`);
console.log(`  snapshot lands — i.e. how far prediction and the host had drifted apart.\n`);
console.log("  profile          transport   median      p95     worst   host ticks with no input");
for (const { name, link } of PROFILES) {
  for (const mode of ["tcp", "udp"] as const) {
    const r = runInputPath({ ...link, mode }, 4242);
    const verdict = r.medianPx < 0.1 && r.worstPx < 1.5 ? "" : "   <- smoke's bar BROKEN";
    console.log(`  ${name}  ${mode === "tcp" ? "TCP (today)" : "UDP (WebRTC)"}  `
      + `${r.medianPx.toFixed(2).padStart(7)}px ${r.p95Px.toFixed(2).padStart(7)}px `
      + `${r.worstPx.toFixed(2).padStart(7)}px   ${r.stalledPct.toFixed(0).padStart(3)}%${verdict}`);
  }
}
console.log("");
