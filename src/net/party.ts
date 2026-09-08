/**
 * The party: everything between "four people in a room" and "four people on a floor".
 *
 * This owns the lobby (who's here, where they're standing on the ship, who has walked
 * into the portal), decides when a run starts, and during a run does the two jobs that
 * make host-authoritative co-op work — the host broadcasts what happened, and everybody
 * else sends the buttons they pressed.
 *
 * It is the only file that knows both about `NetClient` and about `Dungeon`. The
 * simulation has no idea it's being watched, and the relay has no idea it's a game.
 */

import type { AvatarInput } from "../core/input";
import { cleanPlayerName } from "../data/settings";
import { nextFloorConfig } from "../data/planets";
import type { RunConfig } from "../data/modes";
import type { Dungeon, HeroSetup, RunEvent } from "../game/dungeon";
import type { Hub, HubStationKind } from "../game/hub";
import type { GameState } from "../game/state";
import { playerFromJSON, playerToJSON } from "../game/state";
import { normalizeAppearance, type Appearance } from "../data/cosmetics";
import { isClassId, DEFAULT_CLASS } from "../data/classes";
import type { Item } from "../game/item";
import { NetClient } from "./client";
import {
  SNAPSHOT_HZ, normalizeRoomCode,
  type HeroWire, type PartyMessage, type Snapshot,
} from "./protocol";
import { InputLog, NetInput, applySnapshot, configFromWire, configToWire, encodeSnapshot, packInput } from "./sync";

/** How often a lobby broadcasts where you're standing on the ship. */
const HUB_SYNC_HZ = 12;

export interface PartyMember {
  readonly id: string;
  name: string;
  /** Their character, as of their last `hello`. Null until it arrives. */
  hero: HeroWire | null;
  x: number;
  y: number;
  facing: number;
  /** Standing in the party portal. When everybody is, the host starts the run. */
  ready: boolean;
}

export type RunEnd = "extract" | "descend" | "wipe";

/** What the host has picked for the party, and which portal on the deck it is. */
export interface PartyPlan {
  readonly config: RunConfig;
  readonly station: HubStationKind;
}
/** Why a floor ended for *this* browser: the wire's three, plus the host vanishing. */
export type RunEndReason = RunEnd | "hostLeft";

export class Party {
  readonly net = new NetClient();
  /** Everyone else in the room. You are never in here. */
  members: PartyMember[] = [];
  /**
   * The run the host has picked by walking into a portal and confirming it (UAT §1 D1):
   * a delve depth, a rift tier or a planet expedition. Null until they have. Its portal
   * is the ready spot for everybody.
   */
  plan: PartyPlan | null = null;
  /** True between a `start` and the `end` that follows it. */
  running = false;

  /** The host has committed to a floor: build it and switch scenes. */
  onStart: (config: RunConfig, seed: number, heroes: HeroSetup[]) => void = () => {};
  /**
   * The floor is over for everybody. `descend` is followed by another `onStart`. `early`
   * is the host's word that an extraction was the penalty kind (UAT §6), carried on the
   * wire rather than inferred from the last snapshot's phase. `hostLeft` never comes
   * over the wire — it's the room closing under a running floor (UAT §1 D2).
   */
  onEnd: (how: RunEndReason, early: boolean) => void = () => {};
  /** Something worth a line of text on screen. */
  onNotice: (text: string, color?: string) => void = () => {};
  /** The roster, the code or the plan changed — redraw whatever is showing it. */
  onChange: () => void = () => {};

  private dungeon: Dungeon | null = null;
  /**
   * Peer ids on the floor for this run, frozen when it starts (UAT §1 A2). Somebody who
   * joins the room mid-run waits on the ship until the *next run* rather than being
   * dropped into floor N+1 — and is never sent a `start` that doesn't have them in it,
   * which is what used to leave a hero-less client driving the host's character.
   */
  private runRoster: string[] = [];
  /** A client's view of the host: a floor is under way that we may not be part of. */
  hostRunning = false;
  /**
   * Readiness is an edge, not a level: standing in the party's portal only counts once
   * you've been seen *outside* it since the last floor started (or since a portal was
   * picked). Without this, a run that ended put everybody back on the deck exactly where
   * they dove from — still inside the portal, every `ready` flag still true from the last
   * lobby message — and the very next `syncHub` tick started the plan's first floor
   * again. Extracting from a co-op Delve meant restarting it, forever. The host's own
   * readiness goes through this latch too: it comes from the hub's geometry, not from a
   * `members` entry, so resetting the members alone would have left the host able to
   * trigger the loop by itself.
   */
  private armed = false;
  /** Remote controllers, by peer id, for as long as a run lasts. */
  private inputs = new Map<string, NetInput>();
  /** Hero index per peer id, fixed for the whole run. */
  private slots = new Map<string, number>();
  /** A client's own recent inputs, for reconciliation against the host (UAT §1 B2). */
  private readonly inputLog = new InputLog();
  private hubTimer = 0;
  private snapTimer = 0;
  /** Renderer events since the last snapshot. Batched to the same cadence so a busy
   *  fight doesn't turn into sixty tiny messages a second per player. */
  private fxBuffer: RunEvent[] = [];

  constructor(private readonly state: GameState) {
    this.net.onMessage = (from, msg) => this.receive(from, msg);
    this.net.onChange = () => {
      this.syncRoster();
      this.onChange();
    };
    this.net.onClosed = (reason) => this.closed(reason);
  }

  // --- lobby ----------------------------------------------------------------

  get inRoom(): boolean {
    return this.net.inRoom;
  }

  get code(): string {
    return this.net.code;
  }

  get isHost(): boolean {
    return this.net.isHost;
  }

  /** Everyone in the room, you included. */
  get size(): number {
    return this.inRoom ? this.members.length + 1 : 1;
  }

  get name(): string {
    return cleanPlayerName(this.state.settings.playerName) || "Adventurer";
  }

  hostRoom(): void {
    this.net.host(this.name);
  }

  joinRoom(code: string): void {
    this.net.join(normalizeRoomCode(code), this.name);
  }

  leave(): void {
    this.running = false;
    this.hostRunning = false;
    this.runRoster = [];
    this.plan = null;
    this.armed = false;
    this.dungeon = null;
    this.members = [];
    this.inputs.clear();
    this.slots.clear();
    this.net.leave();
  }

  /** Host only. The host walked into a portal and confirmed a run: that's the party's. */
  setPlan(config: RunConfig, station: HubStationKind): void {
    if (!this.isHost) return;
    this.plan = { config, station };
    // Picking is a deliberate act made from inside the portal — the host walked in and
    // confirmed — so it counts as their walk-in. Only a `setPlan` arms the host this way;
    // the plan re-broadcast that follows a floor ending does not.
    this.armed = true;
    this.broadcastPlan();
    this.onChange();
  }

  /** Nobody's last "I'm in the portal" survives a floor: it has to be said again. */
  private unreadyAll(): void {
    for (const m of this.members) m.ready = false;
  }

  /** Host only: the plan and whether a floor is under way, for one lobby or every lobby. */
  private broadcastPlan(to?: string): void {
    if (!this.isHost || !this.inRoom) return;
    this.send({
      k: "plan", players: this.size, running: this.running,
      ...(this.plan ? { run: configToWire(this.plan.config), station: this.plan.station } : {}),
    }, to);
  }

  /** Announce this character — sent on arrival and again whenever gear may have changed. */
  sendHello(): void {
    if (!this.inRoom) return;
    this.send({ k: "hello", hero: this.localHeroWire() });
  }

  private localHeroWire(): HeroWire {
    return {
      id: this.net.id,
      name: this.name,
      classId: this.state.activeClassId,
      player: playerToJSON(this.state.player) as unknown as Record<string, unknown>,
      appearance: this.state.appearance as unknown as Record<string, unknown>,
      potions: this.state.potions,
    };
  }

  /**
   * Called every tick while the ship is on screen: pushes where you're standing to the
   * room, mirrors everyone else into the hub for drawing, and — if you're the host —
   * starts the run the moment the last person walks into the portal.
   */
  syncHub(hub: Hub, dt: number): void {
    hub.partyOpen = this.inRoom;
    if (!this.inRoom) {
      hub.mates = [];
      hub.partyHost = false;
      hub.partyTarget = null;
      hub.partyReady = false;
      return;
    }
    hub.partyHost = this.isHost;
    hub.partyTarget = this.plan?.station ?? null;
    // A planet run dives from the expedition portal, which only exists once the Reliquary
    // Gate has spawned it — so while the party's plan is a planet, everybody's deck grows
    // that portal, and it goes again when the plan changes to something else.
    const planet = this.plan?.config.planet;
    if (planet) {
      if (hub.expedition?.planetId !== planet.spec.id || hub.expedition.tier !== planet.tier) {
        hub.setExpedition(planet.spec.id, planet.tier);
      }
    } else if (hub.expedition) {
      hub.clearExpedition();
    }

    hub.mates = this.members.map((m) => ({
      id: m.id,
      name: m.name,
      x: m.x,
      y: m.y,
      facing: m.facing,
      ready: m.ready,
      appearance: m.hero ? (m.hero.appearance as unknown as Appearance) : null,
    }));

    // Stepping out of the portal is what arms the next walk-in; being in it only counts
    // once armed. What goes on the wire is the latched value, so a host never has to
    // guess whether a mate's "ready" is a fresh walk-in or where they happened to be
    // standing when the last floor ended.
    if (!hub.inPartyPortal) this.armed = true;
    const ready = hub.inPartyPortal && this.armed;
    hub.partyReady = ready;

    this.hubTimer -= dt;
    if (this.hubTimer <= 0) {
      this.hubTimer = 1 / HUB_SYNC_HZ;
      this.send({ k: "hub", x: Math.round(hub.x), y: Math.round(hub.y), facing: Number(hub.facing.toFixed(2)), ready });
    }

    if (!this.isHost || this.running || !this.plan) return;
    // Everybody in, and there has to be a somebody: a room of one is just a person
    // standing next to a portal, and walking over it by accident shouldn't start a run.
    if (!ready || this.members.length === 0) return;
    if (!this.members.every((m) => m.ready && m.hero)) return;
    // The party comes with the run: the roster could have changed since the host picked.
    this.startFloor({ ...this.plan.config, players: this.size });
  }

  // --- starting and ending a floor -----------------------------------------

  /** Host only. Commits the party to a floor and tells everybody how to build it. */
  startFloor(config: RunConfig): void {
    if (!this.isHost) return;
    const seed = Math.floor(Math.random() * 0x7fffffff);
    // A fresh run takes everybody who's ready; the next floor of a running one takes
    // exactly who was on the last, minus anyone whose connection went. Nobody joins a
    // run in the middle, and the `start` goes only to the people who are in it.
    const ids = this.running
      ? this.runRoster.filter((id) => this.members.some((m) => m.id === id && m.hero))
      : this.members.filter((m) => m.hero).map((m) => m.id);
    this.runRoster = ids;
    const heroes: HeroWire[] = [this.localHeroWire()];
    for (const id of ids) {
      const m = this.member(id);
      if (m?.hero) heroes.push({ ...m.hero, id: m.id, name: m.name });
    }
    this.running = true;
    // The walk-in that started this floor is spent. Everybody, host included, has to
    // leave the portal and come back for the next one.
    this.armed = false;
    this.unreadyAll();
    const start: PartyMessage = { k: "start", seed, config: configToWire(config), heroes };
    for (const id of ids) this.send(start, id);
    this.broadcastPlan();
    this.onStart(config, seed, this.setupsFrom(heroes));
  }

  /** Host only. Ends the floor for everybody, banking or not as `how` and `early` say. */
  endRun(how: RunEnd, early = false): void {
    if (!this.isHost) return;
    this.send({ k: "end", how, early });
    if (how !== "descend") {
      this.running = false;
      this.runRoster = [];
      // Belt and braces with the reset in `startFloor`: the run is over and the deck is
      // about to be drawn again, and nobody on it has walked into anything yet.
      this.unreadyAll();
    }
    this.broadcastPlan();
  }

  /** Host only, after `endRun("descend")`: the next floor of the same run. */
  descend(config: RunConfig): void {
    this.startFloor(nextFloorConfig(config));
  }

  /** Hands the live floor over, and wires every remote player's buttons into it. */
  attach(dungeon: Dungeon): void {
    this.dungeon = dungeon;
    this.inputs.clear();
    this.slots.clear();
    this.fxBuffer.length = 0;
    this.inputLog.reset();
    for (const hero of dungeon.heroes) {
      if (hero.local || hero.netId === "") continue;
      const input = new NetInput();
      this.inputs.set(hero.netId, input);
      this.slots.set(hero.netId, hero.index);
      hero.input = input;
    }
    this.snapTimer = 0;
  }

  detach(): void {
    this.dungeon = null;
    this.inputs.clear();
    this.slots.clear();
    this.running = false;
    this.runRoster = [];
  }

  private setupsFrom(heroes: HeroWire[]): HeroSetup[] {
    return heroes.map((wire) => {
      const local = wire.id === this.net.id;
      const classId = isClassId(wire.classId) ? wire.classId : DEFAULT_CLASS;
      return {
        netId: wire.id,
        name: wire.name,
        // Your own character is the live one off your save, so levelling up mid-run and
        // banking afterwards work exactly like a solo dive. Everyone else is rebuilt
        // from the sheet they sent, which is the same object their own game is using.
        player: local ? this.state.player : playerFromJSON(classId, wire.player),
        appearance: local ? this.state.appearance : normalizeAppearance(wire.appearance),
        potions: local ? this.state.potions : wire.potions,
        local,
      };
    });
  }

  // --- the run --------------------------------------------------------------

  /** Before the simulation ticks: hand every remote player the buttons they pressed. */
  beforeSim(): void {
    if (!this.running) return;
    for (const input of this.inputs.values()) input.beginTick();
  }

  /**
   * After the simulation ticks. The host publishes what just happened; a client sends
   * what it just did. Called before the renderer drains `events`, because the host has
   * to forward those to the people they belong to first.
   */
  afterSim(d: Dungeon, input: AvatarInput): void {
    if (!this.inRoom || !this.running) return;
    if (d.role === "host") this.publish(d);
    else if (d.role === "client") {
      // Straight to the host: nobody else has anything to do with your buttons, and at
      // sixty packets a second that's the difference between one stream and three.
      const a = d.avatar;
      const seq = this.inputLog.record(input.moveVector(), input.wasPressed("dash"));
      this.send({ k: "in", ...packInput(input, a.x, a.y, seq) }, this.net.hostId);
    }
  }

  private publish(d: Dungeon): void {
    if (d.events.length > 0) this.fxBuffer.push(...d.events);

    this.snapTimer -= 1 / 60;
    if (this.snapTimer > 0) return;
    this.snapTimer = 1 / SNAPSHOT_HZ;

    for (const member of this.members) {
      const slot = this.slots.get(member.id);
      if (slot === undefined) continue;
      // Most events are for everybody; a few belong to one person, and somebody else's
      // level-up has no business taking over your screen. A remote player's *own*
      // level-up isn't forwarded either — their browser raises it from the XP it's
      // handed below, and forwarding this copy too fired the fireworks twice (UAT §1 C3).
      const mine = this.fxBuffer.filter((ev) =>
        !("owner" in ev) || (ev.owner === slot && ev.kind !== "levelUp"));
      if (mine.length > 0) this.send({ k: "fx", e: mine as unknown[] }, member.id);

      // Items and XP go as their own messages rather than being sampled out of a
      // snapshot, because an unspoken drop is not a thing to lose to a dropped frame.
      const hero = d.heroes[slot];
      if (!hero) continue;
      for (const item of hero.itemsPending) this.send({ k: "got", item }, member.id);
      if (hero.xpPending > 0) this.send({ k: "got", xp: hero.xpPending }, member.id);
      hero.itemsPending.length = 0;
      hero.xpPending = 0;
    }
    this.fxBuffer.length = 0;
    // The host's own pending lists were applied as they happened — it *is* the simulation.
    d.localHero.itemsPending.length = 0;
    d.localHero.xpPending = 0;

    this.send({ k: "snap", s: encodeSnapshot(d) });
  }

  // --- incoming -------------------------------------------------------------

  private receive(from: string, msg: PartyMessage): void {
    switch (msg.k) {
      case "hello": {
        const member = this.member(from);
        if (!member) return;
        member.hero = msg.hero;
        member.name = msg.hero.name;
        this.onChange();
        return;
      }
      case "hub": {
        const member = this.member(from);
        if (!member) return;
        member.x = msg.x;
        member.y = msg.y;
        member.facing = msg.facing;
        if (member.ready !== msg.ready) this.onChange();
        member.ready = msg.ready;
        return;
      }
      case "plan": {
        if (this.isHost) return;
        const previous = this.plan?.station ?? null;
        this.plan = msg.run
          ? { config: configFromWire(msg.run), station: (msg.station ?? "dive") as HubStationKind }
          : null;
        // A *new* portal being picked is a fresh event: somebody already standing in it
        // is in it on purpose. The re-broadcast that follows a floor ending carries the
        // same station and arms nobody — that's the whole point of the latch.
        if (this.plan && this.plan.station !== previous) this.armed = true;
        const running = msg.running ?? false;
        if (running && !this.hostRunning && !this.running) {
          this.onNotice("The party is mid-dive — you'll go with them on their next run.", "#fbbf24");
        }
        this.hostRunning = running;
        this.onChange();
        return;
      }
      case "start": {
        if (this.isHost) return;
        // Never adopt a floor we're not on (UAT §1 A2). The host only addresses `start`
        // to its roster, but this is the client's own guarantee: without a hero of ours
        // in the list, `Dungeon` would refuse to build — and before it did, it fell back
        // to driving the host's character and banking a mirror of the host's loot.
        if (!msg.heroes.some((h) => h.id === this.net.id)) return;
        this.running = true;
        this.hostRunning = true;
        this.armed = false;
        this.unreadyAll();
        this.onStart(configFromWire(msg.config), msg.seed, this.setupsFrom(msg.heroes));
        return;
      }
      case "in": {
        this.inputs.get(from)?.receive(msg);
        return;
      }
      case "snap": {
        const d = this.dungeon;
        if (d && d.role === "client") applySnapshot(d, msg.s as Snapshot, this.planetNames(), this.inputLog);
        return;
      }
      case "fx": {
        const d = this.dungeon;
        if (d) for (const ev of msg.e) d.events.push(ev as RunEvent);
        return;
      }
      case "got": {
        const d = this.dungeon;
        if (!d) return;
        if (msg.item) d.localHero.loot.items.push(msg.item as Item);
        // XP is applied to the real save as it's earned, the same as a solo dive — it's
        // the one thing dying doesn't take away, so it can't wait for a bank.
        if (msg.xp) {
          const levels = this.state.player.gainXp(msg.xp);
          if (levels > 0) d.events.push({ kind: "levelUp", levels, owner: d.localHero.index });
        }
        return;
      }
      case "end":
        // A floor we weren't on ending is none of our business.
        if (this.isHost || !this.running) return;
        this.running = msg.how === "descend";
        this.hostRunning = this.running;
        if (!this.running) this.unreadyAll();
        this.onEnd(msg.how, msg.early ?? false);
        return;
    }
  }

  /** A planet renames its whole roster, and a client has to rebuild those names too. */
  private planetNames(): Record<string, string> | undefined {
    return this.dungeon?.config.planet?.spec.enemyNames;
  }

  private closed(reason: string): void {
    const wasRunning = this.running;
    this.members = [];
    this.inputs.clear();
    this.slots.clear();
    this.running = false;
    this.hostRunning = false;
    this.runRoster = [];
    this.plan = null;
    this.armed = false;
    this.onChange();
    this.onNotice(reason, "#ef4444");
    // The host's browser *is* the floor, so the floor is gone with it. That's nobody's
    // death and nobody's choice, so it isn't a wipe: main.ts treats it as an early
    // extraction (UAT §1 D2) — the existing 15% sliver of coin, items forfeit — banks a
    // floor that was already cleared in full, and lets one already lost stay lost.
    if (wasRunning) this.onEnd("hostLeft", true);
  }

  private member(id: string): PartyMember | undefined {
    return this.members.find((m) => m.id === id);
  }

  /** Keeps `members` in step with the relay's roster, preserving what we already know. */
  private syncRoster(): void {
    const previous = new Map(this.members.map((m) => [m.id, m]));
    const arrived: PartyMember[] = [];
    this.members = this.net.peers.map((peer) => {
      const existing = previous.get(peer.id);
      if (existing) {
        existing.name = peer.name;
        return existing;
      }
      const member: PartyMember = {
        id: peer.id, name: peer.name, hero: null, x: 320, y: 420, facing: -Math.PI / 2, ready: false,
      };
      arrived.push(member);
      return member;
    });

    if (this.isHost) {
      // A new arrival needs the plan straight away — above all whether a floor is under
      // way, since in that case they're waiting on the ship for the next run (A2).
      for (const member of arrived) {
        this.broadcastPlan(member.id);
        if (this.running) this.onNotice(`${member.name} joined — they'll dive with you next run.`, "#fbbf24");
      }
    }

    // Somebody's laptop closed mid-fight. Their character stays on the floor as a body
    // rather than vanishing, but out of every count that could hold the run hostage
    // (UAT §1 A1): no revive, no descend gate, no aggro.
    const d = this.dungeon;
    if (d && d.role === "host") {
      for (const hero of d.heroes) {
        if (hero.local || hero.netId === "" || hero.departed) continue;
        if (this.members.some((m) => m.id === hero.netId)) continue;
        this.onNotice(`${hero.name} dropped out.`, "#fbbf24");
        d.dropHero(hero);
        this.inputs.delete(hero.netId);
      }
    }
    this.sendHelloIfNeeded();
  }

  /** New arrivals need to know who's already here, so everybody re-announces. */
  private sendHelloIfNeeded(): void {
    if (this.inRoom) this.sendHello();
  }

  private send(msg: PartyMessage, to?: string): void {
    this.net.send(msg, to);
  }
}
