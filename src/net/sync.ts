/**
 * Turning a live dungeon into numbers and back.
 *
 * The host encodes its whole floor `SNAPSHOT_HZ` times a second; every client throws
 * away its own idea of the world and adopts that one. Clients simulate nothing at all,
 * which is what makes co-op honest: there is exactly one place where a hit lands or
 * doesn't, and it is the same place for everybody.
 *
 * Two things keep the bandwidth sane. The **level itself is never sent** — it's
 * generated from a seed, and `generateLevel` is deterministic, so every browser builds
 * the identical floor from the twelve numbers in `RunConfigWire`. And everything a
 * floor is *full* of (monsters, bolts, drops) is a flat array of numbers rather than
 * named fields, because at sixty monsters a tick the property names are most of the
 * message.
 */

import type { AvatarInput, Action } from "../core/input";
import { TAU } from "../core/math";
import { BOSSES, BOSS_ABILITIES, bossFor, type BossAbilityId } from "../data/bosses";
import { ARCHETYPES, type EnemyKind } from "../data/enemies";
import { CHEST_TIERS } from "../data/chests";
import { ELEMENTS, ELEMENT_COLORS, ELEMENT_PREFIX, STATUSES, type Element, type StatusKind } from "../data/elements";
import { MODES, delveConfig, riftConfig, type RunConfig, type RunModeId } from "../data/modes";
import { PLANETS_BY_ID, planetConfig } from "../data/planets";
import { RARITIES, type Rarity } from "../data/rarity";
import { StatusContainer } from "../combat/status";
import type { Dungeon, Hero } from "../game/dungeon";
import type { Enemy } from "../game/entities";
import {
  NET_ACTIONS, SNAPSHOT_HZ, actionBit,
  type HeroSnap, type PartyMessage, type RunConfigWire, type Snapshot, type NetAction,
} from "./protocol";

/** One client tick's worth of buttons, as it crosses the wire. */
export type InputPacket = Omit<Extract<PartyMessage, { k: "in" }>, "k">;

/**
 * How long a client gives a remote body to slide to where the latest snapshot put it.
 * A little over one snapshot interval, so ordinary jitter in arrival doesn't leave a
 * monster standing still waiting for the next one (UAT §1 B1).
 */
const LERP_SPAN = 1.2 / SNAPSHOT_HZ;
/** Host ticks without a packet before a remote player's stick is centred (UAT §1 B4). */
const STALE_TICKS = 12;
const TICK = 1 / 60;

const ENEMY_KINDS = Object.keys(ARCHETYPES) as EnemyKind[];
const STATUS_KINDS = Object.keys(STATUSES) as StatusKind[];
const SHAPES = ["circle", "donut", "cone", "line", "none"] as const;
const PICKUP_KINDS = ["coin", "key", "item", "potion", "xp", "gem", "material"] as const;

/** Two decimals is more precision than a 2.2x zoom can show. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- run configuration ------------------------------------------------------

export function configToWire(config: RunConfig): RunConfigWire {
  return {
    mode: config.mode.id,
    tier: config.tier,
    floor: config.floor,
    depth: config.depth,
    danger: config.danger,
    bossFloor: config.bossFloor,
    lastFloor: config.lastFloor,
    challengerTier: config.challengerTier,
    players: config.players ?? 1,
    ...(config.planet ? { planetId: config.planet.spec.id, planetTier: config.planet.tier } : {}),
  };
}

/**
 * Rebuilds the config a client needs to generate the identical floor. The mode's own
 * builders are used rather than trusting the wire numbers wholesale, so a client can
 * never be told to run a floor this build doesn't know how to make.
 */
export function configFromWire(wire: RunConfigWire): RunConfig {
  const planet = wire.planetId ? PLANETS_BY_ID[wire.planetId] : undefined;
  const base: RunConfig = planet
    ? planetConfig(planet, wire.planetTier ?? 1, wire.floor, wire.challengerTier)
    : MODES[wire.mode as RunModeId]?.isRift
      ? riftConfig(wire.mode as RunModeId, wire.tier, wire.floor, wire.challengerTier)
      : delveConfig(wire.depth, wire.challengerTier);
  return { ...base, players: wire.players };
}

// --- input ------------------------------------------------------------------

/** Packs a local player's tick into the numbers that cross the wire. */
export function packInput(input: AvatarInput, x: number, y: number, seq: number): InputPacket {
  const move = input.moveVector();
  let press = 0;
  for (const action of NET_ACTIONS) {
    if (input.wasPressed(action)) press |= actionBit(action);
  }
  const aim = input.aimAngle(x, y);
  const point = input.aimPoint?.(x, y) ?? null;
  return {
    seq,
    move: [r2(move.x), r2(move.y)],
    aim: aim === null ? null : r2(aim),
    press,
    ...(point ? { ap: [Math.round(point.x), Math.round(point.y)] as [number, number] } : {}),
  };
}

/**
 * A remote player's controller, on the host. It is an `AvatarInput` like any other, so
 * `Dungeon.updateHero` cannot tell the difference between this and a keyboard.
 *
 * Packets are queued whole and consumed one per host tick, so each one moves the hero
 * for exactly the tick it was meant to — that is what lets the client replay its own
 * unacknowledged inputs and land on the host's answer (UAT §1 B2). When the two clocks
 * drift apart the choice is between dropping somebody's dash or firing it a frame late:
 * it fires late, and a dropped packet's buttons are folded into the next.
 */
export class NetInput implements AvatarInput {
  private move = { x: 0, y: 0 };
  private aim: number | null = null;
  private point: { x: number; y: number } | null = null;
  private pressed = 0;
  private queue: InputPacket[] = [];
  /** Host ticks since a packet was consumed. Past `STALE_TICKS` the stick is centred,
   *  so a lag spike never walks somebody into the hazard they'd stopped short of. */
  private starving = 0;
  /** Sequence number of the last packet consumed — echoed to the client in its snapshot. */
  lastSeq = 0;

  receive(packet: InputPacket): void {
    // A backed-up queue means the client is running ahead of us; keep it short rather
    // than replaying a fifth of a second of old movement at somebody.
    if (this.queue.length > 6) {
      const dropped = this.queue.shift()!;
      if (this.queue[0]) this.queue[0] = { ...this.queue[0], press: this.queue[0].press | dropped.press };
    }
    this.queue.push(packet);
  }

  /** Called once per host tick, before the hero is updated. */
  beginTick(): void {
    const next = this.queue.shift();
    if (!next) {
      this.pressed = 0;
      if (++this.starving > STALE_TICKS) this.move = { x: 0, y: 0 };
      return;
    }
    this.starving = 0;
    this.move = { x: next.move[0], y: next.move[1] };
    this.aim = next.aim;
    this.point = next.ap ? { x: next.ap[0], y: next.ap[1] } : null;
    this.pressed = next.press;
    this.lastSeq = next.seq;
  }

  moveVector(): { x: number; y: number } {
    return this.move;
  }

  wasPressed(action: Action): boolean {
    const i = (NET_ACTIONS as readonly string[]).indexOf(action);
    return i >= 0 && (this.pressed & (1 << i)) !== 0;
  }

  aimAngle(): number | null {
    return this.aim;
  }

  aimPoint(): { x: number; y: number } | null {
    return this.point;
  }
}

/** What a client remembers about one of its own ticks, for the reconciliation replay. */
export interface LoggedInput {
  readonly seq: number;
  readonly move: { x: number; y: number };
  readonly dash: boolean;
}

/**
 * A client's recent inputs, by sequence number (UAT §1 B2). `record` numbers the tick
 * being sent; `since` hands back everything the host hasn't acknowledged yet and forgets
 * what it has. A few seconds is far more than any round trip.
 */
export class InputLog {
  private seq = 0;
  private entries: LoggedInput[] = [];

  record(move: { x: number; y: number }, dash: boolean): number {
    this.seq++;
    this.entries.push({ seq: this.seq, move: { x: move.x, y: move.y }, dash });
    if (this.entries.length > 240) this.entries.shift();
    return this.seq;
  }

  since(ack: number): readonly LoggedInput[] {
    let drop = 0;
    while (drop < this.entries.length && this.entries[drop]!.seq <= ack) drop++;
    if (drop > 0) this.entries.splice(0, drop);
    return this.entries;
  }

  reset(): void {
    this.seq = 0;
    this.entries.length = 0;
  }
}

/** Every action that survives the trip, for anything that wants to enumerate them. */
export function isNetAction(action: Action): action is NetAction {
  return (NET_ACTIONS as readonly string[]).includes(action);
}

// --- snapshots --------------------------------------------------------------

export function encodeSnapshot(d: Dungeon): Snapshot {
  const boss = d.boss?.boss ?? null;
  return {
    t: r2(d.elapsed),
    ph: d.phase === "fighting" ? 0 : d.phase === "cleared" ? 1 : 2,
    wv: d.wave,
    left: d.enemiesRemaining,
    kq: d.killsSoFar,
    ek: d.elitesKilled,
    ...(d.completionPortal
      ? { cp: [Math.round(d.completionPortal.x), Math.round(d.completionPortal.y)] as [number, number] }
      : {}),
    h: d.heroes.map(encodeHero),
    e: d.enemies.map(encodeEnemy),
    p: d.projectiles.map((p) => [
      Math.round(p.x), Math.round(p.y), p.radius, ELEMENTS.indexOf(p.element), p.friendly ? 1 : 0,
      Math.round(p.vx), Math.round(p.vy),
    ]),
    k: d.pickups.map((p) => [
      PICKUP_KINDS.indexOf(p.kind), Math.round(p.x), Math.round(p.y), p.value,
      p.rarity ? RARITIES.indexOf(p.rarity) : -1,
      p.element ? ELEMENTS.indexOf(p.element) : -1,
    ]),
    tg: d.telegraphs.map((t) => [
      SHAPES.indexOf(t.shape), Math.round(t.x), Math.round(t.y), r2(t.angle),
      Math.round(t.radius), Math.round(t.inner), r2(t.arc), Math.round(t.width),
      r2(t.remaining), r2(t.total), ELEMENTS.indexOf(t.element),
    ]),
    g: d.ground.map((g) => [
      Math.round(g.x), Math.round(g.y), Math.round(g.radius), ELEMENTS.indexOf(g.element), r2(g.remaining),
    ]),
    tm: d.totems.map((t) => [Math.round(t.x), Math.round(t.y), ELEMENTS.indexOf(t.element)]),
    tr: d.level.traps.map((t) => [t.state === "idle" ? 0 : t.state === "warn" ? 1 : 2, r2(t.t), r2(t.angle)]),
    nd: d.level.resourceNodes.reduce((bits, node, i) => bits | (node.depleted ? 1 << i : 0), 0),
    ...(boss && d.boss
      ? {
          b: {
            p: boss.phase,
            c: r2(boss.castTimer),
            ct: r2(boss.castTotal),
            ab: boss.ability ?? "",
            nm: d.boss.name,
            sp: boss.spec.id,
          },
        }
      : {}),
  };
}

function statusBitsOf(sc: StatusContainer): number {
  let bits = 0;
  for (const s of sc.list) {
    const i = STATUS_KINDS.indexOf(s.id as StatusKind);
    if (i >= 0) bits |= 1 << i;
  }
  return bits;
}

/** Client-side mirror of a status bitmask. Cosmetic durations — the host owns the real
 *  ones — but the kinds are right, which is what the renderer and prediction read. */
function mirrorStatuses(sc: StatusContainer, bits: number): void {
  sc.list.length = 0;
  STATUS_KINDS.forEach((kindName, i) => {
    if ((bits & (1 << i)) !== 0) sc.apply(kindName, { sourceActorId: -1, chance: 1, roll: () => 0 });
  });
}

function encodeHero(hero: Hero): HeroSnap {
  const a = hero.avatar;
  const p = hero.player;
  const st = statusBitsOf(hero.sc);
  return {
    i: hero.index,
    x: r2(a.x), y: r2(a.y), f: r2(a.facing),
    hp: Math.round(p.health), mp: Math.round(p.mana), wd: Math.round(hero.ward),
    ch: r2(hero.specialCharge),
    // `ul` / `ut` / `bt` are dead fields kept for wire compatibility — the ability
    // cutover made ultimates instant casts and buffs into statuses, and the whole
    // snapshot protocol is being replaced (see docs/combat-cutover-plan.md C3).
    ul: "",
    ut: 0,
    sw: r2(a.swingTimer), sa: r2(a.swingAngle),
    dt: r2(a.dashTimer), iv: r2(a.invulnTimer), hf: r2(a.hitFlash), bt: 0,
    dc: r2(a.dashCooldown), vx: r2(a.vx), vy: r2(a.vy),
    ack: hero.input instanceof NetInput ? hero.input.lastSeq : 0,
    ...(st !== 0 ? { st } : {}),
    cd: hero.skillCooldowns.map(r2),
    pot: hero.potions,
    down: hero.downed,
    ...(hero.departed ? { gn: true } : {}),
    rev: r2(hero.reviveProgress),
    lt: [
      hero.loot.coins, hero.loot.gems, hero.loot.xp, hero.loot.kills, hero.loot.items.length,
    ],
    ky: CHEST_TIERS.map((t) => hero.loot.keys[t]),
    mt: ELEMENTS.map((e) => hero.loot.materials[e]),
  };
}

function encodeEnemy(e: Enemy): number[] {
  const statusBits = statusBitsOf(e.sc);
  return [
    e.id,
    ENEMY_KINDS.indexOf(e.archetype.kind),
    Math.round(e.x), Math.round(e.y), r2(e.facing), Math.round(e.radius),
    Math.round(e.health), Math.round(e.maxHealth),
    e.elite ? RARITIES.indexOf(e.elite) : -1,
    e.state === "spawning" ? 0 : e.state === "active" ? 1 : 2,
    r2(e.spawnTimer), r2(e.windup), r2(e.hitFlash),
    ELEMENTS.indexOf(e.element),
    e.boss ? 1 : 0,
    statusBits,
  ];
}

/**
 * Adopts the host's world wholesale. Bodies are matched by id where they have one and
 * given the snapshot position as a *target* (`Dungeon.netLerp`) rather than teleported
 * to it — `Dungeon.advanceRemote` slides them there over the next few ticks, so the
 * 20 Hz stream draws as 60 Hz motion (UAT §1 B1). The local hero is reconciled against
 * `log` instead (see `applyHero`).
 */
export function applySnapshot(d: Dungeon, s: Snapshot, planetNames?: Record<string, string>, log?: InputLog): void {
  d.phase = s.ph === 0 ? "fighting" : s.ph === 1 ? "cleared" : "dead";
  d.wave = s.wv;
  d.remoteRemaining = s.left;
  // The clear objective and the completion portal are the host's to decide; a client
  // only mirrors them so its HUD can count the quota and its player can walk to the
  // exit. `killsRequired` / `elitesRequired` are already identical on both ends.
  d.killsSoFar = s.kq ?? 0;
  d.elitesKilled = s.ek ?? 0;
  d.completionPortal = s.cp ? { x: s.cp[0], y: s.cp[1] } : null;

  for (const h of s.h) {
    const hero = d.heroes[h.i];
    if (!hero) continue;
    applyHero(d, hero, h, log);
  }

  applyEnemies(d, s, planetNames);
  applySimpleBodies(d, s);

  for (let i = 0; i < d.level.traps.length; i++) {
    const wire = s.tr[i];
    const trap = d.level.traps[i];
    if (!wire || !trap) continue;
    trap.state = wire[0] === 0 ? "idle" : wire[0] === 1 ? "warn" : "active";
    trap.t = wire[1]!;
    trap.angle = wire[2]!;
  }
  d.level.resourceNodes.forEach((node, i) => {
    node.depleted = (s.nd & (1 << i)) !== 0;
  });
}

function applyHero(d: Dungeon, hero: Hero, h: HeroSnap, log?: InputLog): void {
  const a = hero.avatar;
  a.swingTimer = h.sw;
  a.swingAngle = h.sa;
  a.hitFlash = h.hf;
  // Statuses first: the replay below reads slows and roots off them.
  mirrorStatuses(hero.sc, h.st ?? 0);
  hero.downed = h.down;
  hero.departed = h.gn ?? false;

  if (hero.local) {
    // Reconciliation (UAT §1 B2). Adopt the host's position and dash state as of the
    // last input it consumed, then re-apply every input it hasn't seen yet through the
    // same movement step it will use. In the common case that lands exactly where the
    // client already predicted, so nothing visibly moves; a knockback or a slow the
    // client couldn't have known about arrives as one small correction rather than the
    // old steady backward tug. `px`/`py` are left alone so the renderer eases over it.
    a.x = h.x;
    a.y = h.y;
    a.vx = h.vx ?? 0;
    a.vy = h.vy ?? 0;
    a.dashTimer = h.dt;
    a.dashCooldown = h.dc ?? 0;
    a.invulnTimer = h.iv;
    if (log && !hero.downed && d.phase !== "dead") {
      for (const cmd of log.since(h.ack ?? 0)) d.predictStep(hero, cmd.move, cmd.dash, TICK);
    }
  } else {
    a.facing = h.f;
    a.dashTimer = h.dt;
    a.invulnTimer = h.iv;
    if (d.netLerp.has(a)) d.netLerp.set(a, { x: h.x, y: h.y, t: LERP_SPAN });
    else {
      a.x = h.x;
      a.y = h.y;
      a.px = h.x;
      a.py = h.y;
      d.netLerp.set(a, { x: h.x, y: h.y, t: 0 });
    }
  }

  hero.player.health = h.hp;
  hero.player.mana = h.mp;
  hero.ward = h.wd;
  hero.specialCharge = h.ch;
  hero.potions = h.pot;
  hero.reviveProgress = h.rev;
  for (let i = 0; i < hero.skillCooldowns.length; i++) hero.skillCooldowns[i] = h.cd[i] ?? 0;

  hero.loot.coins = h.lt[0];
  hero.loot.gems = h.lt[1];
  hero.loot.xp = h.lt[2];
  hero.loot.kills = h.lt[3];
  CHEST_TIERS.forEach((t, i) => { hero.loot.keys[t] = h.ky[i] ?? 0; });
  ELEMENTS.forEach((e, i) => { hero.loot.materials[e] = h.mt[i] ?? 0; });
  if (hero.local) d.state.potions = h.pot;
}

function applyEnemies(d: Dungeon, s: Snapshot, planetNames?: Record<string, string>): void {
  const seen = new Set<number>();
  const byId = new Map<number, Enemy>();
  for (const e of d.enemies) byId.set(e.id, e);

  for (const wire of s.e) {
    const [id, kindIndex, x, y, facing, radius, hp, maxHp, elite, state,
      spawnTimer, windup, hitFlash, elementIndex, isBoss, statusBits] = wire as number[];
    seen.add(id!);
    const kind = ENEMY_KINDS[kindIndex!] ?? "grunt";
    const archetype = ARCHETYPES[kind];
    const element = ELEMENTS[elementIndex!] ?? "physical";
    const eliteRarity: Rarity | null = elite! >= 0 ? RARITIES[elite!] ?? null : null;

    let e = byId.get(id!);
    if (!e) {
      e = {
        id: id!, x: x!, y: y!, px: x!, py: y!, radius: radius!,
        archetype,
        name: isBoss && s.b
          ? s.b.nm
          : enemyDisplayName(archetype.name, element, eliteRarity, planetNames?.[kind]),
        health: hp!, maxHealth: maxHp!, damage: 0, speed: 0,
        attackTimer: 0, windup: 0, state: "active", spawnTimer: 0, hitFlash: 0,
        knockX: 0, knockY: 0, elite: eliteRarity, facing: facing!,
        trapCooldown: 0, stuckTimer: 0, dodgeDir: 1,
        behaviorTimer: 0, chargeVx: 0, chargeVy: 0,
        element, resists: {} as Enemy["resists"],
        sc: new StatusContainer(1_000_000 + id!),
        knockResist: 1, boss: null, summoned: false, fromWave: false,
        // Affix and elite-slam mechanics are host-authoritative — the client mirrors the
        // resulting HP/damage numbers and never runs a behaviour itself, so these are inert.
        // `fromWave` likewise: the quota is counted on the host and arrives as a number.
        attackCooldown: archetype.attackCooldown,
        eliteCast: 0,
        affixes: [], affixState: { timers: {}, ward: 0, noSplit: false },
        damageTakenMult: 1,
      };
      d.enemies.push(e);
      d.netLerp.set(e, { x: x!, y: y!, t: 0 });
    } else {
      d.netLerp.set(e, { x: x!, y: y!, t: LERP_SPAN });
    }
    e.facing = facing!;
    e.health = hp!;
    e.maxHealth = maxHp!;
    e.radius = radius!;
    e.state = state === 0 ? "spawning" : state === 1 ? "active" : "windup";
    e.spawnTimer = spawnTimer!;
    e.windup = windup!;
    e.hitFlash = hitFlash!;
    // Client-side status pips are cosmetic — the host owns the real durations. Mirror
    // the bitmask onto `sc` so the renderer's badge row still lights up.
    mirrorStatuses(e.sc, statusBits!);

    if (isBoss && s.b) {
      const spec = BOSSES.find((b) => b.id === s.b!.sp) ?? bossFor(d.config.depth);
      e.boss = {
        spec, phase: s.b.p, actionTimer: 0,
        ability: s.b.ab === "" ? null : (s.b.ab as BossAbilityId),
        castTimer: s.b.c, castTotal: s.b.ct,
        cooldowns: {}, aimX: 0, aimY: 0,
        chargeTimer: 0, chargeVx: 0, chargeVy: 0,
        pendingDrops: 0, dropTimer: 0,
        buffTimer: 0, buffDamageMult: 1, buffHasteMult: 1,
      };
    }
  }

  for (let i = d.enemies.length - 1; i >= 0; i--) {
    if (seen.has(d.enemies[i]!.id)) continue;
    d.netLerp.delete(d.enemies[i]!);
    d.enemies.splice(i, 1);
  }
  d.boss = d.enemies.find((e) => e.boss) ?? null;
}

/** Projectiles, drops, telegraphs, ground and totems: rebuilt outright every snapshot. */
function applySimpleBodies(d: Dungeon, s: Snapshot): void {
  d.projectiles.length = 0;
  for (const [x, y, radius, elementIndex, friendly, vx, vy] of s.p) {
    const element = ELEMENTS[elementIndex!] ?? "physical";
    d.projectiles.push({
      x: x!, y: y!, px: x!, py: y!, radius: radius!,
      vx: vx ?? 0, vy: vy ?? 0, damage: 0, friendly: friendly === 1, owner: -1, life: 1,
      color: ELEMENT_COLORS[element], element, pierce: 0, hits: new Set(),
      ailment: 0, basic: false,
    });
  }

  d.pickups.length = 0;
  for (const [kindIndex, x, y, value, rarityIndex, elementIndex] of s.k) {
    d.pickups.push({
      kind: PICKUP_KINDS[kindIndex!] ?? "coin",
      x: x!, y: y!, px: x!, py: y!, radius: 6,
      value: value!, item: null, keyTier: null,
      rarity: rarityIndex! >= 0 ? RARITIES[rarityIndex!] ?? null : null,
      element: elementIndex! >= 0 ? ELEMENTS[elementIndex!] ?? null : null,
      vx: 0, vy: 0, life: 1, magnet: false,
    });
  }

  d.telegraphs.length = 0;
  for (const w of s.tg) {
    const element = ELEMENTS[w[10]!] ?? "physical";
    d.telegraphs.push({
      shape: SHAPES[w[0]!] ?? "circle",
      x: w[1]!, y: w[2]!, angle: w[3]!, angleOffset: 0,
      radius: w[4]!, inner: w[5]!, arc: w[6]!, width: w[7]!,
      remaining: w[8]!, total: w[9]!,
      damage: 0, element, color: ELEMENT_COLORS[element],
      hitsPlayer: true, hitsEnemies: false, linger: 0, followId: null,
    });
  }

  d.ground.length = 0;
  for (const [x, y, radius, elementIndex, remaining] of s.g) {
    const element = ELEMENTS[elementIndex!] ?? "physical";
    d.ground.push({
      x: x!, y: y!, px: x!, py: y!, radius: radius!,
      element, damage: 0, remaining: remaining!, tickTimer: 1,
      hitsPlayer: true, hitsEnemies: false, color: ELEMENT_COLORS[element],
    });
  }

  d.totems.length = 0;
  s.tm.forEach(([x, y, elementIndex], i) => {
    const element = ELEMENTS[elementIndex!] ?? "physical";
    d.totems.push({
      id: i, owner: 0, x: x!, y: y!, px: x!, py: y!, radius: 10,
      remaining: 1, pulseTimer: 1, interval: 1, damage: 0,
      element, range: 0, targets: 0, ailment: 0, color: ELEMENT_COLORS[element],
    });
  });
}

/**
 * The same name the host built, rebuilt from its parts rather than sent as a string for
 * every monster on the floor. A planet renames its roster, so it passes its own table.
 */
export function enemyDisplayName(
  base: string, element: Element, elite: Rarity | null, planetName?: string,
): string {
  const prefix = element !== "physical" ? `${ELEMENT_PREFIX[element]} ` : "";
  const eliteWord = elite ? `${elite.charAt(0).toUpperCase()}${elite.slice(1)} ` : "";
  return `${prefix}${eliteWord}${planetName ?? base}`;
}

/** Name of the ability a snapshot's boss is winding up, for the boss frame. */
export function bossAbilityName(id: string): string {
  return id === "" ? "" : BOSS_ABILITIES[id as BossAbilityId]?.name ?? "";
}

export { TAU };
