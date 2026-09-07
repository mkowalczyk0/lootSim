/**
 * The browser half of the party connection: one WebSocket to the relay, a room code,
 * and a list of who else is in the room.
 *
 * It knows nothing about dungeons. Game messages go in and come out as `PartyMessage`
 * values; `net/party.ts` is what decides what any of them mean.
 *
 * The relay lives on the same origin the page was served from — that's what makes this
 * setup-free. Whoever runs `npm run host` is serving both the game and the relay from
 * one port, so a cousin who can load the page can always reach the room.
 */

import {
  NET_PATH, PROTOCOL_VERSION,
  type FromRelay, type PartyMessage, type PeerInfo, type ToRelay,
} from "./protocol";

export type NetStatus = "offline" | "connecting" | "connected" | "error";

/** Where the relay is: the page's own origin, with the scheme swapped for a socket. */
export function relayUrl(): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}${NET_PATH}`;
}

export class NetClient {
  status: NetStatus = "offline";
  /** Why the last attempt failed, for the lobby screen to print. */
  error = "";
  code = "";
  /** This peer's own id, as the relay named it. */
  id = "";
  isHost = false;
  /** Whose browser runs the simulation. Input is addressed there rather than broadcast. */
  hostId = "";
  /** Everybody else in the room. You are never in this list. */
  peers: PeerInfo[] = [];

  onMessage: (from: string, msg: PartyMessage) => void = () => {};
  /** The roster, the code or the status changed — redraw whatever is showing it. */
  onChange: () => void = () => {};
  /** The room ended under us: host left, socket died, relay said no. */
  onClosed: (reason: string) => void = () => {};

  private socket: WebSocket | null = null;
  /** Held until the socket opens, since a room is opened the instant you ask for it. */
  private pending: ToRelay | null = null;

  get inRoom(): boolean {
    return this.status === "connected" && this.code !== "";
  }

  /** Everyone in the room including you, host first, in a stable order. */
  roster(name: string): PeerInfo[] {
    const me: PeerInfo = { id: this.id, name };
    return this.isHost ? [me, ...this.peers] : [...this.peers, me];
  }

  host(name: string): void {
    this.open({ t: "host", v: PROTOCOL_VERSION, name });
  }

  join(code: string, name: string): void {
    this.open({ t: "join", v: PROTOCOL_VERSION, code, name });
  }

  /** Broadcasts to the room, or to one peer if `to` is given. */
  send(message: PartyMessage, to?: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const envelope: ToRelay = to ? { t: "msg", to, d: message } : { t: "msg", d: message };
    this.socket.send(JSON.stringify(envelope));
  }

  leave(): void {
    const socket = this.socket;
    this.socket = null;
    this.reset("offline");
    socket?.close();
    this.onChange();
  }

  private open(request: ToRelay): void {
    this.leave();
    this.status = "connecting";
    this.error = "";
    this.pending = request;
    this.onChange();

    let socket: WebSocket;
    try {
      socket = new WebSocket(relayUrl());
    } catch {
      this.fail("Couldn't reach the party relay. Is the game being served by npm run host?");
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      if (this.pending) socket.send(JSON.stringify(this.pending));
      this.pending = null;
    };
    socket.onmessage = (e) => this.receive(String(e.data));
    socket.onerror = () => {
      if (this.status !== "connected") {
        this.fail("Couldn't reach the party relay. Is the game being served by npm run host?");
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return; // superseded by a newer attempt
      const wasInRoom = this.inRoom;
      this.socket = null;
      this.reset(this.status === "error" ? "error" : "offline");
      this.onChange();
      if (wasInRoom) this.onClosed("The connection dropped.");
    };
  }

  private receive(raw: string): void {
    let msg: FromRelay;
    try {
      msg = JSON.parse(raw) as FromRelay;
    } catch {
      return;
    }
    switch (msg.t) {
      case "joined":
        this.status = "connected";
        this.code = msg.code;
        this.id = msg.id;
        this.isHost = msg.host;
        this.hostId = msg.hostId;
        this.peers = [...msg.peers];
        this.onChange();
        break;
      case "peer":
        if (!this.peers.some((p) => p.id === msg.id)) this.peers.push({ id: msg.id, name: msg.name });
        this.onChange();
        break;
      case "gone":
        this.peers = this.peers.filter((p) => p.id !== msg.id);
        this.onChange();
        break;
      case "msg":
        this.onMessage(msg.from, msg.d);
        break;
      case "closed":
        this.reset("offline");
        this.onChange();
        this.onClosed(msg.reason);
        break;
      case "error":
        this.fail(msg.reason);
        break;
    }
  }

  private fail(reason: string): void {
    this.error = reason;
    this.status = "error";
    this.code = "";
    this.peers = [];
    this.onChange();
  }

  private reset(status: NetStatus): void {
    this.status = status;
    this.code = "";
    this.id = "";
    this.isHost = false;
    this.hostId = "";
    this.peers = [];
    this.pending = null;
  }
}
