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
  applySnapshot, configFromWire, configToWire, encodeSnapshot,
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

interface Packet { snap: Snapshot; at: number; sentAt: number; }

/**
 * The network. `send` stamps a delivery time; `arrivals` returns what has landed by now.
 *
 * TCP is modelled as **in-order delivery**: a packet cannot be handed over before every
 * packet sent before it, so one delayed or retransmitted packet drags the whole tail with
 * it. That is the head-of-line behaviour the transport question turns on, and modelling it
 * is the entire reason this is not just `setTimeout`.
 */
class SimLink {
  private queue: Packet[] = [];
  private lastDelivery = 0;
  private readonly rand: () => number;
  lost = 0;
  sent = 0;

  constructor(private readonly link: Link, seed: number) { this.rand = rng(seed); }

  send(snap: Snapshot, now: number): void {
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

  arrivals(now: number): Packet[] {
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

  const net = new SimLink(link, seed);
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
