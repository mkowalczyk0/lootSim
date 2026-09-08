/**
 * The party relay: a WebSocket server with no opinions.
 *
 * It knows about rooms, room codes and who is in them. It never looks inside a game
 * message — the host's browser is the authority on everything that happens in a
 * dungeon, and this only ever forwards bytes between the people in one room.
 *
 * It is deliberately dependency-free. `ws` would be one npm install, but the project
 * has no runtime dependencies and this is a few hundred lines of well-specified frame
 * parsing (RFC 6455) that never has to change again. More importantly it means the
 * multiplayer server *is* the dev server: `npm run host` serves the game and the relay
 * on one port, so nobody has to install, configure or start a second thing.
 */

import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Duplex } from "node:stream";

import {
  MAX_PARTY, NET_PATH, PROTOCOL_VERSION, randomRoomCode,
  type FromRelay, type ToRelay,
} from "../src/net/protocol";
import { defaultDbPath, openAccounts } from "./accounts";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
/** Nothing the game sends comes close; anything bigger is a bug or an attack. */
const MAX_MESSAGE = 4 * 1024 * 1024;
/** A peer that hasn't answered a ping in this long is gone, tab closed or laptop shut. */
const HEARTBEAT_MS = 15_000;

interface Peer {
  readonly id: string;
  name: string;
  readonly socket: Duplex;
  room: Room | null;
  alive: boolean;
}

interface Room {
  readonly code: string;
  host: Peer;
  readonly peers: Map<string, Peer>;
}

const rooms = new Map<string, Room>();
let nextPeerId = 1;

// --- public API ------------------------------------------------------------

/** Hooks the relay onto an existing HTTP server — the Vite dev server, in practice. */
export function attachRelay(server: Server, log: (msg: string) => void = () => {}): void {
  server.on("upgrade", (req, socket, head) => {
    // Anything that isn't ours is left alone: Vite's own HMR socket shares this port.
    if (!isPartyRequest(req)) return;
    handshake(req, socket as Duplex, head, log);
  });
  setInterval(heartbeat, HEARTBEAT_MS).unref?.();
}

/** Standalone mode, for serving a built `dist/` without the dev server. Accounts and
 *  saves are answered here too (`docs/accounts.md`), so the API isn't dev-server-only. */
export function startRelay(port: number, log: (msg: string) => void = console.log): Server {
  const accounts = openAccounts({ dbPath: defaultDbPath(), log: (m) => log(`[accounts] ${m}`) });
  const server = createServer((req, res) => {
    accounts.handle(req, res).then((handled) => {
      if (handled) return;
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("lootSim party relay\n");
    }, (err: unknown) => {
      log(`accounts error: ${String(err)}`);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  attachRelay(server, log);
  server.on("close", () => accounts.close());
  server.listen(port, () => log(`party relay + accounts listening on :${port}${NET_PATH}`));
  return server;
}

function isPartyRequest(req: IncomingMessage): boolean {
  const url = req.url ?? "";
  return url === NET_PATH || url.startsWith(`${NET_PATH}?`);
}

// --- handshake -------------------------------------------------------------

function handshake(req: IncomingMessage, socket: Duplex, head: Buffer, log: (m: string) => void): void {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string") {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }
  const accept = createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n"
    + "Upgrade: websocket\r\n"
    + "Connection: Upgrade\r\n"
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.setNoDelay(true);

  const peer: Peer = { id: `p${nextPeerId++}`, name: "Adventurer", socket, room: null, alive: true };
  attachFraming(peer, head, log);
}

// --- frame parsing ---------------------------------------------------------

function attachFraming(peer: Peer, head: Buffer, log: (m: string) => void): void {
  const socket = peer.socket;
  let buffer = head.length > 0 ? Buffer.from(head) : Buffer.alloc(0);
  /** Reassembly for a message split across continuation frames. */
  let fragments: Buffer[] = [];
  let fragmentOp = 0;

  socket.on("data", (chunk: Buffer) => {
    buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);

    for (;;) {
      const frame = readFrame(buffer);
      if (!frame) break;
      buffer = buffer.subarray(frame.size);

      switch (frame.opcode) {
        case 0x0: // continuation
          fragments.push(frame.payload);
          if (frame.fin) {
            const joined = Buffer.concat(fragments);
            fragments = [];
            if (fragmentOp === 0x1) handleText(peer, joined.toString("utf8"), log);
          }
          break;
        case 0x1: // text
          if (!frame.fin) {
            fragmentOp = 0x1;
            fragments = [frame.payload];
          } else {
            handleText(peer, frame.payload.toString("utf8"), log);
          }
          break;
        case 0x8: // close
          dropPeer(peer, log);
          socket.end();
          return;
        case 0x9: // ping
          socket.write(encodeFrame(frame.payload, 0xa));
          break;
        case 0xa: // pong
          peer.alive = true;
          break;
        default:
          break; // binary and anything reserved: not something this game speaks
      }
    }

    if (buffer.length > MAX_MESSAGE) {
      dropPeer(peer, log);
      socket.destroy();
    }
  });

  socket.on("error", () => dropPeer(peer, log));
  socket.on("close", () => dropPeer(peer, log));
}

interface Frame {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  /** Total bytes consumed, header included. */
  size: number;
}

/** Returns null when the buffer doesn't hold a whole frame yet. */
function readFrame(buf: Buffer): Frame | null {
  if (buf.length < 2) return null;
  const first = buf[0]!;
  const second = buf[1]!;
  const fin = (first & 0x80) !== 0;
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let length = second & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buf.length < offset + 2) return null;
    length = buf.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buf.length < offset + 8) return null;
    const big = buf.readBigUInt64BE(offset);
    if (big > BigInt(MAX_MESSAGE)) return null;
    length = Number(big);
    offset += 8;
  }

  const maskLength = masked ? 4 : 0;
  if (buf.length < offset + maskLength + length) return null;

  let payload: Buffer;
  if (masked) {
    const mask = buf.subarray(offset, offset + 4);
    payload = Buffer.from(buf.subarray(offset + 4, offset + 4 + length));
    for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ mask[i % 4]!;
  } else {
    payload = Buffer.from(buf.subarray(offset, offset + length));
  }
  return { fin, opcode, payload, size: offset + maskLength + length };
}

/** Server frames are never masked, which is the one asymmetry in the protocol. */
function encodeFrame(payload: Buffer, opcode = 0x1): Buffer {
  const length = payload.length;
  let header: Buffer;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

function send(peer: Peer, message: FromRelay): void {
  if (peer.socket.destroyed) return;
  peer.socket.write(encodeFrame(Buffer.from(JSON.stringify(message), "utf8")));
}

function heartbeat(): void {
  for (const room of rooms.values()) {
    for (const peer of room.peers.values()) {
      if (!peer.alive) {
        peer.socket.destroy();
        continue;
      }
      peer.alive = false;
      if (!peer.socket.destroyed) peer.socket.write(encodeFrame(Buffer.alloc(0), 0x9));
    }
  }
}

// --- rooms -----------------------------------------------------------------

function handleText(peer: Peer, text: string, log: (m: string) => void): void {
  let msg: ToRelay;
  try {
    msg = JSON.parse(text) as ToRelay;
  } catch {
    return;
  }
  switch (msg.t) {
    case "host": return hostRoom(peer, msg, log);
    case "join": return joinRoom(peer, msg, log);
    case "msg": return forward(peer, msg);
    default: return;
  }
}

function hostRoom(peer: Peer, msg: Extract<ToRelay, { t: "host" }>, log: (m: string) => void): void {
  if (msg.v !== PROTOCOL_VERSION) {
    send(peer, { t: "error", reason: "That build of the game speaks a different protocol." });
    return;
  }
  if (peer.room) dropPeer(peer, log);
  peer.name = cleanName(msg.name);

  let code = randomRoomCode();
  for (let tries = 0; rooms.has(code) && tries < 50; tries++) code = randomRoomCode();
  if (rooms.has(code)) {
    send(peer, { t: "error", reason: "Every room code is taken. Try again in a moment." });
    return;
  }

  const room: Room = { code, host: peer, peers: new Map([[peer.id, peer]]) };
  rooms.set(code, room);
  peer.room = room;
  send(peer, { t: "joined", code, id: peer.id, host: true, hostId: peer.id, peers: [] });
  log(`room ${code} opened by ${peer.name}`);
}

function joinRoom(peer: Peer, msg: Extract<ToRelay, { t: "join" }>, log: (m: string) => void): void {
  if (msg.v !== PROTOCOL_VERSION) {
    send(peer, { t: "error", reason: "That build of the game speaks a different protocol." });
    return;
  }
  const room = rooms.get(msg.code.toUpperCase());
  if (!room) {
    send(peer, { t: "error", reason: `No room called ${msg.code}. Check the letters.` });
    return;
  }
  if (room.peers.size >= MAX_PARTY) {
    send(peer, { t: "error", reason: "That room is full." });
    return;
  }
  if (peer.room) dropPeer(peer, log);
  peer.name = cleanName(msg.name);
  peer.room = room;

  const existing = [...room.peers.values()].map((p) => ({ id: p.id, name: p.name }));
  room.peers.set(peer.id, peer);
  send(peer, { t: "joined", code: room.code, id: peer.id, host: false, hostId: room.host.id, peers: existing });
  for (const other of room.peers.values()) {
    if (other !== peer) send(other, { t: "peer", id: peer.id, name: peer.name });
  }
  log(`${peer.name} joined ${room.code} (${room.peers.size} in the room)`);
}

function forward(peer: Peer, msg: Extract<ToRelay, { t: "msg" }>): void {
  const room = peer.room;
  if (!room) return;
  if (msg.to) {
    const target = room.peers.get(msg.to);
    if (target) send(target, { t: "msg", from: peer.id, d: msg.d });
    return;
  }
  for (const other of room.peers.values()) {
    if (other !== peer) send(other, { t: "msg", from: peer.id, d: msg.d });
  }
}

/**
 * A peer leaving takes the room with it if it was the host — there is no migration,
 * because the host *is* the simulation and half a dungeon can't be handed over.
 */
function dropPeer(peer: Peer, log: (m: string) => void): void {
  const room = peer.room;
  peer.room = null;
  if (!room) return;
  room.peers.delete(peer.id);

  if (room.host === peer) {
    rooms.delete(room.code);
    for (const other of room.peers.values()) {
      other.room = null;
      send(other, { t: "closed", reason: "The host left." });
    }
    log(`room ${room.code} closed`);
    return;
  }
  for (const other of room.peers.values()) send(other, { t: "gone", id: peer.id });
  if (room.peers.size === 0) rooms.delete(room.code);
}

function cleanName(raw: unknown): string {
  const text = String(raw ?? "").replace(/[^\w \-']/g, "").trim().slice(0, 16);
  return text.length > 0 ? text : "Adventurer";
}

// Standalone: `npm run relay`, for anyone serving a built dist/ instead of the dev server.
const entry = process.argv[1] ?? "";
if (entry.endsWith("relay.mjs") || entry.endsWith("relay.ts")) {
  startRelay(Number(process.env.PORT ?? 5174));
}
