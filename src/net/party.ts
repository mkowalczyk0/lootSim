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
import { delveConfig, type RunConfig } from "../data/modes";
import type { Dungeon, HeroSetup, RunEvent } from "../game/dungeon";
import type { Hub } from "../game/hub";
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
import { NetInput, applySnapshot, configFromWire, configToWire, encodeSnapshot, packInput } from "./sync";

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

export class Party {
  readonly net = new NetClient();
  /** Everyone else in the room. You are never in here. */
  members: PartyMember[] = [];
  /** The delve depth the host has picked for the party. */
  depth = 1;
  /** True between a `start` and the `end` that follows it. */
  running = false;

  /** The host has committed to a floor: build it and switch scenes. */
  onStart: (config: RunConfig, seed: number, heroes: HeroSetup[]) => void = () => {};
  /** The floor is over for everybody. `descend` is followed by another `onStart`. */
  onEnd: (how: RunEnd) => void = () => {};
  /** Something worth a line of text on screen. */
  onNotice: (text: string, color?: string) => void = () => {};
  /** The roster, the code or the plan changed — redraw whatever is showing it. */
  onChange: () => void = () => {};

  private dungeon: Dungeon | null = null;
  /** Remote controllers, by peer id, for as long as a run lasts. */
  private inputs = new Map<string, NetInput>();
  /** Hero index per peer id, fixed for the whole run. */
  private slots = new Map<string, number>();
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
    this.dungeon = null;
    this.members = [];
    this.inputs.clear();
    this.slots.clear();
    this.net.leave();
  }

  setDepth(depth: number): void {
    this.depth = Math.max(1, Math.min(depth, this.state.maxUnlockedDepth));
    if (this.isHost) this.send({ k: "plan", depth: this.depth, players: this.size });
    this.onChange();
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
      return;
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

    this.hubTimer -= dt;
    if (this.hubTimer <= 0) {
      this.hubTimer = 1 / HUB_SYNC_HZ;
      this.send({ k: "hub", x: Math.round(hub.x), y: Math.round(hub.y), facing: Number(hub.facing.toFixed(2)), ready: hub.inPartyPortal });
    }

    if (!this.isHost || this.running) return;
    // Everybody in, and there has to be a somebody: a room of one dives through the
    // ordinary Delve portal, and walking over this one by accident shouldn't start a run.
    if (!hub.inPartyPortal || this.members.length === 0) return;
    if (!this.members.every((m) => m.ready && m.hero)) return;
    this.startFloor(delveConfig(this.depth, this.state.challengerTier, this.size));
  }

  // --- starting and ending a floor -----------------------------------------

  /** Host only. Commits the party to a floor and tells everybody how to build it. */
  startFloor(config: RunConfig): void {
    if (!this.isHost) return;
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const heroes: HeroWire[] = [this.localHeroWire()];
    for (const m of this.members) {
      if (m.hero) heroes.push({ ...m.hero, id: m.id, name: m.name });
    }
    this.running = true;
    this.send({ k: "start", seed, config: configToWire(config), heroes });
    this.onStart(config, seed, this.setupsFrom(heroes));
  }

  /** Host only. Ends the floor for everybody, banking or not as `how` says. */
  endRun(how: RunEnd): void {
    if (!this.isHost) return;
    this.send({ k: "end", how });
    if (how !== "descend") this.running = false;
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
      this.send({ k: "in", ...packInput(input, a.x, a.y) }, this.net.hostId);
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
      // level-up has no business taking over your screen.
      const mine = this.fxBuffer.filter((ev) => !("owner" in ev) || ev.owner === slot);
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
      case "plan":
        this.depth = msg.depth;
        this.onChange();
        return;
      case "start": {
        if (this.isHost) return;
        this.running = true;
        this.onStart(configFromWire(msg.config), msg.seed, this.setupsFrom(msg.heroes));
        return;
      }
      case "in": {
        this.inputs.get(from)?.receive(msg);
        return;
      }
      case "snap": {
        const d = this.dungeon;
        if (d && d.role === "client") applySnapshot(d, msg.s as Snapshot, this.planetNames());
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
        this.running = msg.how === "descend";
        this.onEnd(msg.how);
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
    this.onChange();
    this.onNotice(reason, "#ef4444");
    if (wasRunning) this.onEnd("wipe");
  }

  private member(id: string): PartyMember | undefined {
    return this.members.find((m) => m.id === id);
  }

  /** Keeps `members` in step with the relay's roster, preserving what we already know. */
  private syncRoster(): void {
    const previous = new Map(this.members.map((m) => [m.id, m]));
    this.members = this.net.peers.map((peer) => {
      const existing = previous.get(peer.id);
      if (existing) {
        existing.name = peer.name;
        return existing;
      }
      return { id: peer.id, name: peer.name, hero: null, x: 320, y: 420, facing: -Math.PI / 2, ready: false };
    });

    // Somebody's laptop closed mid-fight. Their character stays on the floor as a body
    // rather than vanishing — the party can still finish, they just can't be revived.
    const d = this.dungeon;
    if (d && d.role === "host") {
      for (const hero of d.heroes) {
        if (hero.local || hero.netId === "") continue;
        if (this.members.some((m) => m.id === hero.netId)) continue;
        if (!hero.downed) this.onNotice(`${hero.name} dropped out.`, "#fbbf24");
        hero.downed = true;
        hero.input = null;
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
