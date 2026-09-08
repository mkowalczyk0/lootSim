/**
 * The multiplayer wire format, and nothing else.
 *
 * Pure types and pure helpers — no DOM, no WebSocket, no simulation — so the relay
 * (which runs in Node) and the game (which runs in a browser) can agree on the shape of
 * every message without either of them importing the other's world.
 *
 * The architecture is deliberately the simplest one that is actually co-op:
 * **one authoritative simulation, running on the host**. Clients send the buttons they
 * pressed and draw the snapshots that come back. Nobody's browser has to agree with
 * anybody else's about where a monster is, because only one browser decides.
 *
 * The relay in `tools/relay.ts` never looks inside a `party` message. It knows about
 * rooms and peers and forwards bytes; every rule of the game lives on the host.
 */

/** WebSocket path the relay listens on, alongside the dev server on the same port. */
export const NET_PATH = "/party";

/** Bumped if the shape below changes in a way an older client would misread.
 *  2: UAT §1 — input sequencing and acks, hero statuses / departed flag, minions,
 *  corpses and affixes in the snapshot, `end.early`, `plan.running`. */
export const PROTOCOL_VERSION = 2;

/** Four players is where the difficulty scaling and the screen both stop being sane. */
export const MAX_PARTY = 4;

/** Snapshots per second the host broadcasts. The sim still runs at 60. */
export const SNAPSHOT_HZ = 20;

/** Room codes are Among Us shaped: four letters, said out loud over a call. */
export const ROOM_CODE_LENGTH = 4;
/** No I/O/S/Z — they get misheard and mistyped as 1/0/5/2 every single time. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXY";

export function randomRoomCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Uppercases and strips anything that can't be in a code, so paste-and-pray works. */
export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCode(raw: string): boolean {
  return raw.length === ROOM_CODE_LENGTH && [...raw].every((c) => CODE_ALPHABET.includes(c));
}

// --- relay envelope --------------------------------------------------------
// Everything below `party` is opaque to the relay.

export type ToRelay =
  | { t: "host"; v: number; name: string }
  | { t: "join"; v: number; code: string; name: string }
  | { t: "msg"; to?: string; d: PartyMessage };

export type FromRelay =
  /** You're in. `peers` is everyone already here, you excluded; `hostId` is whose
   *  browser is running the simulation, so input can be addressed rather than shouted. */
  | { t: "joined"; code: string; id: string; host: boolean; hostId: string; peers: PeerInfo[] }
  | { t: "peer"; id: string; name: string }
  | { t: "gone"; id: string }
  | { t: "msg"; from: string; d: PartyMessage }
  /** The host left, so the room is over. Everybody goes back to their own ship. */
  | { t: "closed"; reason: string }
  | { t: "error"; reason: string };

export interface PeerInfo {
  readonly id: string;
  readonly name: string;
}

// --- game messages ---------------------------------------------------------

/** Everything a peer needs to draw somebody else and to simulate them on the host. */
export interface HeroWire {
  readonly id: string;
  readonly name: string;
  readonly classId: string;
  /** `playerToJSON` output: level, tree, gear. The host rebuilds a real `Player`. */
  readonly player: Record<string, unknown>;
  readonly appearance: Record<string, unknown>;
  readonly potions: number;
}

/** A `RunConfig`, flattened. Rebuilt by `configFromWire` in `net/sync.ts`. */
export interface RunConfigWire {
  readonly mode: string;
  readonly tier: number;
  readonly floor: number;
  readonly depth: number;
  readonly danger: number;
  readonly bossFloor: boolean;
  readonly lastFloor: boolean;
  readonly challengerTier: number;
  readonly players: number;
  readonly planetId?: string;
  readonly planetTier?: number;
}

export type PartyMessage =
  /** Sent on arrival, and again whenever your gear or your look changes in town. */
  | { k: "hello"; hero: HeroWire }
  /** Where you are on the ship, and whether you're standing in the party portal. */
  | { k: "hub"; x: number; y: number; facing: number; ready: boolean }
  /** Host only: what the party is about to dive into, for everyone else's lobby. `run`
   *  is the floor the host picked by walking into a portal and `station` is which portal
   *  (UAT §1 D1) — absent until they have. `running` says a floor is under way, so
   *  somebody who joins mid-run waits on the ship for the next run (UAT §1 A2). */
  | { k: "plan"; players: number; running: boolean; run?: RunConfigWire; station?: string }
  /** Host only: everyone into the portal, here is the floor. */
  | { k: "start"; seed: number; config: RunConfigWire; heroes: HeroWire[] }
  /** Client → host, every tick. `seq` numbers the tick so the host can say which one it
   *  last consumed (`HeroSnap.ack`) and the client can replay the rest (UAT §1 B2). `ap`
   *  is the world point being aimed at, for ground-placed abilities in mouse scheme. */
  | { k: "in"; seq: number; move: [number, number]; aim: number | null; press: number; ap?: [number, number] }
  /** Host → all, `SNAPSHOT_HZ` times a second. */
  | { k: "snap"; s: Snapshot }
  /** Host → all (or one, when it's personal): renderer events. */
  | { k: "fx"; e: unknown[] }
  /** Host → one: an item you picked up, and XP you earned. Reliable, unlike a snapshot. */
  | { k: "got"; item?: unknown; xp?: number; relic?: string }
  /** Host → all: the floor is over. `descend` is always followed by a fresh `start`.
   *  `early` is the host's word that an extraction was the penalty kind (UAT §6) — a
   *  client banks or forfeits on this flag, never on what its last snapshot implied. */
  | { k: "end"; how: "extract" | "descend" | "wipe"; early: boolean };

// --- snapshot --------------------------------------------------------------
//
// Heroes are objects (there are at most four and their state is wide); everything the
// floor is full of is a flat number array, because at 20 Hz with sixty monsters on
// screen the difference between `{"x":123}` and `123` is the whole bandwidth budget.

export interface HeroSnap {
  /** Index into the party's hero list, which never changes during a run. */
  readonly i: number;
  readonly x: number;
  readonly y: number;
  readonly f: number;
  readonly hp: number;
  readonly mp: number;
  readonly wd: number;
  /** Ultimate meter, 0..1. */
  readonly ch: number;
  readonly sw: number;
  readonly sa: number;
  readonly dt: number;
  readonly iv: number;
  readonly hf: number;
  /** Dash cooldown and current velocity — what a client needs to replay its own
   *  unacknowledged inputs from this exact state (UAT §1 B2). */
  readonly dc: number;
  /** Dashes in hand (`Avatar.dashStock`). A client with two charges has to replay its
   *  second dash from the host's count, not from a guess. */
  readonly ds: number;
  readonly vx: number;
  readonly vy: number;
  /** Sequence number of the last `in` packet the host consumed for this hero. Only
   *  meaningful to the browser that sent it; 0 for the host's own hero. */
  readonly ack: number;
  /** Status bitmask in `STATUSES` order — what's on this hero (UAT §1 B3). */
  readonly st?: number;
  /** Skill cooldowns, four of them. */
  readonly cd: number[];
  readonly pot: number;
  /** Dead and waiting for a revive. */
  readonly down: boolean;
  /** Their browser left the room: drawn faded, never revived, out of every count. */
  readonly gn?: boolean;
  /** Seconds of revive progress somebody has put in, 0..REVIVE_TIME. */
  readonly rev: number;
  /** Unbanked loot: coins, gems, xp, kills, item count. */
  readonly lt: [number, number, number, number, number];
  /** Unbanked keys, in `CHEST_TIERS` order, and materials in `ELEMENTS` order. The
   *  snapshot is authoritative for both, so a client banks exactly what the host says
   *  it earned rather than keeping its own tally and hoping the two agree. */
  readonly ky: number[];
  readonly mt: number[];
}

export interface Snapshot {
  readonly t: number;
  /** 0 fighting, 1 cleared, 2 everybody down. */
  readonly ph: number;
  readonly wv: number;
  readonly left: number;
  /**
   * The floor-clear objective (UAT §5), host-authoritative: monsters killed toward the
   * quota, and elites killed. The *requirements* are not sent — they're derived from the
   * `RunConfig` every browser already has, so both ends compute the same pair. This and
   * `cp` are the only things the two-portal floor adds to the wire.
   */
  readonly kq: number;
  readonly ek: number;
  /** The completion portal's position once the floor is cleared: `[x, y]`. Absent while
   *  the floor is still being fought, because it doesn't exist yet. */
  readonly cp?: [number, number];
  readonly h: HeroSnap[];
  /** [id, kindIndex, x, y, facing, radius, hp, maxHp, eliteIndex, state, spawnTimer,
   *   windup, hitFlash, elementIndex, isBoss, statusBits, affixCount, ...affixIndexes]
   *  The affix tail indexes `MONSTER_AFFIXES` so a client draws the ring and glyphs and
   *  names the monster the way the host does (UAT §1 C2). */
  readonly e: number[][];
  /** Summoned combatants (UAT §1 C1): [id, owner, x, y, radius, facing, hp, maxHp,
   *   windup, hitFlash, elementIndex]. A Necromancer's army was invisible to everyone
   *  but the host without this. */
  readonly m: number[][];
  /** Corpses on the floor: [x, y, remaining]. Drawn, and the Necromancer's fuel gauge. */
  readonly c: number[][];
  /** [x, y, radius, elementIndex, friendly, vx, vy] — velocity so a client can fly a
   *  bolt on between snapshots rather than stepping it three ticks at a time. */
  readonly p: number[][];
  /** [kindIndex, x, y, value, rarityIndex, elementIndex] */
  readonly k: number[][];
  /** [shape, x, y, angle, radius, inner, arc, width, remaining, total, colorIndex] */
  readonly tg: number[][];
  /** [x, y, radius, colorIndex] */
  readonly g: number[][];
  /** [x, y, colorIndex] */
  readonly tm: number[][];
  /** [state, t, angle] per trap, in level order. */
  readonly tr: number[][];
  /** Bitmask of mined resource nodes. */
  readonly nd: number;
  /** The boss, if one is alive: [phase, castTimer, castTotal] plus its ability name. */
  readonly b?: { p: number; c: number; ct: number; ab: string; nm: string; sp: string };
}

// --- input bits ------------------------------------------------------------

/** The buttons that survive the trip. Movement and aim ride alongside as numbers. */
export const NET_ACTIONS = [
  "attack", "dash", "potion", "special",
  "skill1", "skill2", "skill3", "skill4",
  "confirm", "cancel",
] as const;

export type NetAction = (typeof NET_ACTIONS)[number];

export function actionBit(action: NetAction): number {
  return 1 << NET_ACTIONS.indexOf(action);
}
