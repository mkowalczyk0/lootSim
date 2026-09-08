/**
 * Procedural floor generation. Every dive builds a fresh dungeon: a graph of connected
 * rooms, each with its own interior obstacles and a scatter of hazards and decoration —
 * seeded, so a floor can be rebuilt exactly from its seed.
 *
 * The floor is a *dungeon*, not one big rectangle with furniture scattered on it. A
 * macro grid of room slots is walked with a randomized spanning search (a handful of
 * extra edges are added afterward so it has loops and side rooms, not one corridor),
 * each visited slot becomes a real room with its own interior layout and doors only
 * where it actually connects to a neighbor, and the gaps between connected rooms become
 * corridors. Slots the walk never reaches are sealed off as solid rock rather than left
 * as an unexplained gap in the floor. A boss floor is the one exception: it stays a
 * single large arena, because the boss kit's ability radii are tuned against that shape
 * and fragmenting it into rooms would quietly break "every phase needs an ability that
 * reaches across the arena."
 *
 * Simulation only. Nothing here touches the DOM or the canvas; the renderer reads the
 * `Level` it produces and draws it.
 *
 * The generator's one hard promise is that the portal is always walkable from the
 * spawn point. It builds walls, checks connectivity on a coarse grid, and carves a
 * corridor if a layout ever manages to seal itself off — belt and braces on top of a
 * room graph that is connected by construction.
 */

import { clamp } from "../core/math";
import { Rng } from "../core/rng";
import {
  biomeFor, LAYOUT_LABELS,
  type BiomeStyle, type LayoutKind, type PropKind,
} from "../data/biomes";
import { trapCount, trapsFor, type TrapKind, type TrapSpec } from "../data/traps";

/** Axis-aligned solid block. Blocks movement and projectiles, not melee arcs. */
export interface Wall {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type TrapState = "idle" | "warn" | "active";

export interface Trap {
  readonly spec: TrapSpec;
  readonly kind: TrapKind;
  x: number;
  y: number;
  readonly radius: number;
  /** Position within the hazard's cycle, in seconds. */
  timer: number;
  state: TrapState;
  /** True once the current activation has done its one-shot work (turret bolts). */
  fired: boolean;
  /** Saws patrol between (ax,ay) and (bx,by); `t` is 0..1 along that track. */
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  t: number;
  dir: number;
  /** Turret firing angle, and the spin used to draw a saw. */
  angle: number;
  spin: number;
}

export interface Prop {
  readonly kind: PropKind;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * Something to mine, planet floors only. It pays out once and then sits there dead —
 * scattered preferentially into dead-end rooms, so a detour off the critical path is
 * the thing that makes it worth taking.
 */
export interface ResourceNode {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  depleted: boolean;
}

export interface Level {
  readonly depth: number;
  readonly width: number;
  readonly height: number;
  readonly biome: BiomeStyle;
  readonly layout: LayoutKind;
  /** Player-facing name for this floor's shape, shown on the HUD. */
  readonly label: string;
  readonly seed: number;
  readonly walls: readonly Wall[];
  readonly traps: Trap[];
  readonly props: readonly Prop[];
  readonly resourceNodes: ResourceNode[];
  /** How many rooms this floor is built from. One for a boss arena. */
  readonly rooms: number;
  readonly start: { x: number; y: number };
  readonly portal: { x: number; y: number };
  readonly cols: number;
  readonly rows: number;
  /** 1 where a body of player size cannot stand. */
  readonly blocked: Uint8Array;
  /** 1 where a cell is open *and* walkable from the spawn point. */
  readonly open: Uint8Array;
  /** Indices into `open` that are walkable — the sampling pool for spawns. */
  readonly openCells: readonly number[];
}

/** Coarse navigation grid. Small enough to respect doorways, cheap enough to flood. */
const GRID = 16;
/** Half-width of the widest body that must fit through a gap. */
const BODY_PAD = 14;
/** Walls stay this far inside a room so its edges are always a walkable ring. */
const MARGIN = 54;
/** No walls within this radius of the spawn point or the portal. */
const CLEAR_RADIUS = 78;
/** World-unit gap between adjacent room slots — the corridor's length. */
const ROOM_GAP = 76;
/** Doorway and corridor width. Comfortably wider than anything that has to fit through. */
const DOOR = 100;
const WALL_T = 16;
/** A room's interior only gets the subdividing layouts (chambers/gauntlet/ring) once
 *  it's big enough for their internal doorway math to make sense; smaller rooms fall
 *  back to open/pillars/rubble, which have no such minimum. */
const SAFE_SUBDIV_MIN = 500;

export interface LevelOptions {
  /**
   * A boss floor. Raid abilities paint circles a hundred and eighty units across, so
   * the arena stays a single big room from one of the open layouts, sized up rather
   * than split into a graph — there is far less clutter to get pinned against while a
   * quake goes off, and every ability radius in `data/bosses.ts` is tuned against a
   * room shaped like this one.
   */
  readonly boss?: boolean;
  /** Planet expeditions bring their own visual identity instead of the depth-bucketed biome. */
  readonly biome?: BiomeStyle;
  /** A bigger room graph — planets are meant to feel like somewhere to actually explore. */
  readonly big?: boolean;
  /** Resource nodes to scatter (planet floors only; zero or omitted means none). */
  readonly nodeCount?: number;
}

const BOSS_LAYOUTS: readonly LayoutKind[] = ["open", "ring"];

export function generateLevel(depth: number, rng: Rng, opts: LevelOptions = {}): Level {
  const d = Math.max(1, Math.floor(depth));
  const biome = opts.biome ?? biomeFor(d);
  const seed = rng.int(0, 2 ** 30);
  const boss = opts.boss === true;

  if (boss) return generateBossFloor(d, biome, seed, rng);
  return generateDungeon(d, biome, seed, rng, opts);
}

// --- the boss arena: one big room, not a graph -----------------------------

function generateBossFloor(d: number, biome: BiomeStyle, seed: number, rng: Rng): Level {
  // Bigger than an ordinary floor and sized up again from what it used to be, but not
  // pushed as far as the room graph below — the ability radii in data/bosses.ts are
  // tuned against this arena shape, and quietly shrinking them relative to the room
  // would make "every phase needs an ability that reaches across the arena" stop
  // being true.
  const width = 1360 + Math.min(520, d * 13);
  const height = Math.round(width * 0.72);
  const start = { x: width / 2, y: height - 100 };
  const portal = { x: width / 2, y: 90 };
  const layout = rng.pick(BOSS_LAYOUTS);

  let walls = buildWalls(layout, width, height, rng)
    .filter((w) => !nearPoint(w, start.x, start.y, CLEAR_RADIUS))
    .filter((w) => !nearPoint(w, portal.x, portal.y, CLEAR_RADIUS));

  let grid = buildGrid(walls, width, height);
  if (!isConnected(grid, width, height, start, portal)) {
    walls = carveCorridor(walls, start, portal);
    grid = buildGrid(walls, width, height);
  }
  if (!isConnected(grid, width, height, start, portal)) {
    walls = [];
    grid = buildGrid(walls, width, height);
  }

  const { cols, rows, blocked } = grid;
  const open = floodFrom(grid, width, height, start);
  const openCells: number[] = [];
  for (let i = 0; i < open.length; i++) if (open[i]) openCells.push(i);

  const level: Level = {
    depth: d, width, height, biome, layout,
    label: LAYOUT_LABELS[layout], seed,
    walls, traps: [], props: [], resourceNodes: [], rooms: 1,
    start, portal, cols, rows, blocked, open, openCells,
  };

  const traps = placeTraps(level, rng, true);
  const props = placeProps(level, rng);
  return { ...level, traps, props };
}

// --- the dungeon: a graph of connected rooms --------------------------------

interface RoomSlot {
  readonly col: number;
  readonly row: number;
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  readonly cx: number;
  readonly cy: number;
}

function generateDungeon(
  d: number, biome: BiomeStyle, seed: number, rng: Rng, opts: LevelOptions,
): Level {
  // Depth one stays the tutorial floor: two empty rooms and nothing that can bite you,
  // just enough to introduce a doorway before the game asks anything of you.
  const tutorial = d === 1 && !opts.big;
  const { cols, rows } = tutorial ? { cols: 2, rows: 1 } : gridDims(d, opts.big === true);

  const roomSize = tutorial ? 340 : 360 + Math.min(170, d * 5);
  const roomH = Math.round(roomSize * 0.82);
  const outerMargin = 44;

  const graph = buildRoomGraph(cols, rows, rng);
  const slots = new Map<string, RoomSlot>();
  for (const key of graph.visited) {
    const [col, row] = parseKey(key);
    const x0 = outerMargin + col * (roomSize + ROOM_GAP);
    const y0 = outerMargin + row * (roomH + ROOM_GAP);
    slots.set(key, { col, row, x0, y0, w: roomSize, h: roomH, cx: x0 + roomSize / 2, cy: y0 + roomH / 2 });
  }

  const width = outerMargin * 2 + cols * roomSize + (cols - 1) * ROOM_GAP;
  const height = outerMargin * 2 + rows * roomH + (rows - 1) * ROOM_GAP;

  const startSlot = slots.get(graph.startKey)!;
  const endSlot = slots.get(graph.endKey)!;
  const start = { x: startSlot.cx, y: startSlot.cy };
  const portal = { x: endSlot.cx, y: endSlot.cy };

  const degree = new Map<string, number>();
  for (const key of graph.visited) degree.set(key, 0);
  for (const e of graph.edges) {
    const [a, b] = e.split("|");
    degree.set(a!, (degree.get(a!) ?? 0) + 1);
    degree.set(b!, (degree.get(b!) ?? 0) + 1);
  }

  let walls: Wall[] = [];
  const roomLayouts: LayoutKind[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = slotKey(col, row);
      const slot = slots.get(key);
      if (!slot) {
        // Never reached by the walk: sealed off as solid rock rather than an
        // unexplained gap in the floor.
        walls.push({ x: outerMargin + col * (roomSize + ROOM_GAP), y: outerMargin + row * (roomH + ROOM_GAP), w: roomSize, h: roomH });
        continue;
      }

      const up = neighborConnected(graph, col, row, 0, -1);
      const down = neighborConnected(graph, col, row, 0, 1);
      const left = neighborConnected(graph, col, row, -1, 0);
      const right = neighborConnected(graph, col, row, 1, 0);
      walls.push(...roomSide("h", slot.y0, slot.x0, slot.x0 + slot.w, slot.cx, up));
      walls.push(...roomSide("h", slot.y0 + slot.h, slot.x0, slot.x0 + slot.w, slot.cx, down));
      walls.push(...roomSide("v", slot.x0, slot.y0, slot.y0 + slot.h, slot.cy, left));
      walls.push(...roomSide("v", slot.x0 + slot.w, slot.y0, slot.y0 + slot.h, slot.cy, right));

      if (tutorial) { roomLayouts.push("open"); continue; }
      // A room now and then is left empty on purpose — a breather, and one fewer
      // chance for the obstacle scatter to read as clutter for its own sake.
      if (rng.chance(0.22)) { roomLayouts.push("open"); continue; }
      const roomSafe = slot.w >= SAFE_SUBDIV_MIN && slot.h >= SAFE_SUBDIV_MIN;
      const pool = roomSafe ? biome.layouts : biome.layouts.filter((k) => k !== "chambers" && k !== "gauntlet" && k !== "ring");
      const kind = pool.length > 0 ? rng.pick(pool) : "open";
      roomLayouts.push(kind);
      const interior = buildWalls(kind, slot.w, slot.h, rng);
      walls.push(...translateWalls(interior, slot.x0, slot.y0));
    }
  }

  // Corridors: a straight hallway through the gap between every pair of connected
  // rooms, the same width as the doorways it lines up with on both ends.
  for (const e of graph.edges) {
    const [ak, bk] = e.split("|") as [string, string];
    const a = slots.get(ak)!;
    const b = slots.get(bk)!;
    if (a.row === b.row) {
      const left = a.col < b.col ? a : b;
      const gx = left.x0 + left.w;
      const midY = left.cy;
      pushLane(walls, gx, left.y0, ROOM_GAP, left.h, midY, true);
    } else {
      const top = a.row < b.row ? a : b;
      const gy = top.y0 + top.h;
      const midX = top.cx;
      pushLane(walls, top.x0, gy, top.w, ROOM_GAP, midX, false);
    }
  }

  walls = walls
    .filter((w) => !nearPoint(w, start.x, start.y, CLEAR_RADIUS))
    .filter((w) => !nearPoint(w, portal.x, portal.y, CLEAR_RADIUS));

  let grid = buildGrid(walls, width, height);
  if (!isConnected(grid, width, height, start, portal)) {
    walls = carveCorridor(walls, start, portal);
    grid = buildGrid(walls, width, height);
  }
  if (!isConnected(grid, width, height, start, portal)) {
    walls = [];
    grid = buildGrid(walls, width, height);
  }

  const { cols: gcols, rows: grows, blocked } = grid;
  const open = floodFrom(grid, width, height, start);
  const openCells: number[] = [];
  for (let i = 0; i < open.length; i++) if (open[i]) openCells.push(i);

  const roomCount = slots.size;
  const layout = roomLayouts.length > 0 ? rng.pick(roomLayouts) : "open";
  const level: Level = {
    depth: d, width, height, biome, layout,
    label: roomCountLabel(roomCount), seed,
    walls, traps: [], props: [], resourceNodes: [], rooms: roomCount,
    start, portal, cols: gcols, rows: grows, blocked, open, openCells,
  };

  const traps = placeTraps(level, rng, false);
  const props = placeProps(level, rng);
  const leaves = [...slots.entries()]
    .filter(([key]) => key !== graph.startKey && key !== graph.endKey && (degree.get(key) ?? 0) <= 1)
    .map(([, slot]) => slot);
  const others = [...slots.values()].filter((s) => !leaves.includes(s) && s !== startSlot && s !== endSlot);
  const resourceNodes = placeResourceNodes(level, leaves, others, rng, opts.nodeCount ?? 0);
  return { ...level, traps, props, resourceNodes };
}

function roomCountLabel(rooms: number): string {
  if (rooms <= 1) return "A Single Chamber";
  if (rooms <= 3) return "A Few Small Rooms";
  if (rooms <= 6) return "Connected Chambers";
  if (rooms <= 9) return "A Sprawling Warren";
  return "A Vast Complex";
}

/** Bigger and busier the deeper you go; a `big` (planet) floor gets a room more in both directions. */
function gridDims(depth: number, big: boolean): { cols: number; rows: number } {
  const step = clamp(Math.floor(depth / 7), 0, 2);
  const cols = clamp(2 + step + (big ? 1 : 0), 2, 5);
  const rows = clamp(2 + Math.max(0, step - 1) + (big ? 1 : 0), 2, 4);
  return { cols, rows };
}

function slotKey(col: number, row: number): string {
  return `${col},${row}`;
}

function parseKey(key: string): [number, number] {
  const [c, r] = key.split(",");
  return [Number(c), Number(r)];
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface RoomGraph {
  readonly visited: Set<string>;
  readonly edges: Set<string>;
  readonly startKey: string;
  readonly endKey: string;
}

/**
 * A randomized spanning walk over the macro grid (a recursive backtracker, same family
 * of algorithm as a classic maze generator, just one room per cell instead of one tile).
 * A handful of extra edges are added afterward between rooms the walk already reached,
 * so the result has loops and dead-end side rooms instead of reading as one corridor.
 */
function buildRoomGraph(cols: number, rows: number, rng: Rng): RoomGraph {
  const startCol = Math.floor(cols / 2);
  const startKey = slotKey(startCol, rows - 1);
  const visited = new Set<string>([startKey]);
  const edges = new Set<string>();
  const stack: [number, number][] = [[startCol, rows - 1]];
  // Small grids skip almost nothing — sealing off a whole quarter of a four-room floor
  // reads as cramped rather than as a dungeon with a locked wing.
  const totalCells = cols * rows;
  const minFraction = totalCells <= 6 ? 0.92 : 0.82;
  const targetRooms = Math.max(2, Math.round(totalCells * rng.range(minFraction, 0.98)));

  while (stack.length > 0 && visited.size < targetRooms) {
    const [c, r] = stack[stack.length - 1]!;
    const options = shuffledNeighbors(c, r, cols, rows, rng).filter(([nc, nr]) => !visited.has(slotKey(nc, nr)));
    if (options.length === 0) { stack.pop(); continue; }
    const [nc, nr] = options[0]!;
    const nk = slotKey(nc, nr);
    visited.add(nk);
    edges.add(edgeKey(slotKey(c, r), nk));
    stack.push([nc, nr]);
  }

  for (const key of visited) {
    const [c, r] = parseKey(key);
    for (const [nc, nr] of shuffledNeighbors(c, r, cols, rows, rng)) {
      const nk = slotKey(nc, nr);
      if (!visited.has(nk) || edges.has(edgeKey(key, nk))) continue;
      if (rng.chance(0.16)) edges.add(edgeKey(key, nk));
    }
  }

  // The portal lands as far from the start as the graph actually reaches, so there is
  // always a real dungeon to walk through rather than a coin-flip distance.
  const dist = bfsDistances(startKey, visited, edges);
  let endKey = startKey;
  let best = -1;
  for (const [key, dd] of dist) {
    if (dd > best) { best = dd; endKey = key; }
  }

  return { visited, edges, startKey, endKey };
}

function neighborConnected(graph: RoomGraph, col: number, row: number, dx: number, dy: number): boolean {
  const nk = slotKey(col + dx, row + dy);
  if (!graph.visited.has(nk)) return false;
  return graph.edges.has(edgeKey(slotKey(col, row), nk));
}

function shuffledNeighbors(c: number, r: number, cols: number, rows: number, rng: Rng): [number, number][] {
  const out: [number, number][] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nc = c + dx;
    const nr = r + dy;
    if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
    out.push([nc, nr]);
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function bfsDistances(start: string, visited: Set<string>, edges: Set<string>): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++]!;
    const dd = dist.get(cur)!;
    for (const other of visited) {
      if (dist.has(other) || !edges.has(edgeKey(cur, other))) continue;
      dist.set(other, dd + 1);
      queue.push(other);
    }
  }
  return dist;
}

/**
 * One side of a room's perimeter: a solid wall, or a wall with a doorway centered on
 * `center` when this side actually connects to a neighbor. Reuses the same "wall with
 * one gap" builder a corridor lane does, just by aiming the gap off the near end of the
 * span when there's nothing to connect to — see `runH`/`runV` below.
 */
function roomSide(
  orientation: "h" | "v", fixed: number, start: number, end: number, center: number, connected: boolean,
): Wall[] {
  const gapAt = connected ? center - DOOR / 2 : start - DOOR * 4;
  return orientation === "h" ? runH(fixed, start, end, WALL_T, gapAt, DOOR) : runV(fixed, start, end, WALL_T, gapAt, DOOR);
}

/** The corridor lane between two connected rooms: two wall strips either side of a
 *  doorway-width gap, spanning the room-gap distance between them. */
function pushLane(
  walls: Wall[], gx: number, gy: number, gw: number, gh: number, mid: number, horizontal: boolean,
): void {
  if (horizontal) {
    const topH = mid - DOOR / 2 - gy;
    const botY = mid + DOOR / 2;
    const botH = gy + gh - botY;
    if (topH > 2) walls.push({ x: gx, y: gy, w: gw, h: topH });
    if (botH > 2) walls.push({ x: gx, y: botY, w: gw, h: botH });
  } else {
    const leftW = mid - DOOR / 2 - gx;
    const rightX = mid + DOOR / 2;
    const rightW = gx + gw - rightX;
    if (leftW > 2) walls.push({ x: gx, y: gy, w: leftW, h: gh });
    if (rightW > 2) walls.push({ x: rightX, y: gy, w: rightW, h: gh });
  }
}

function translateWalls(walls: readonly Wall[], dx: number, dy: number): Wall[] {
  return walls.map((w) => ({ x: w.x + dx, y: w.y + dy, w: w.w, h: w.h }));
}

// --- layouts (room interiors, and the whole arena on a boss floor) --------

function buildWalls(kind: LayoutKind, w: number, h: number, rng: Rng): Wall[] {
  switch (kind) {
    case "open": return layoutOpen(w, h, rng);
    case "pillars": return layoutPillars(w, h, rng);
    case "chambers": return layoutChambers(w, h, rng);
    case "gauntlet": return layoutGauntlet(w, h, rng);
    case "rubble": return layoutRubble(w, h, rng);
    case "ring": return layoutRing(w, h, rng);
  }
}

function layoutOpen(w: number, h: number, rng: Rng): Wall[] {
  return scatter(w, h, rng, rng.int(1, 3), 54, 104, 130);
}

function layoutPillars(w: number, h: number, rng: Rng): Wall[] {
  const cols = rng.int(3, 5);
  const rows = rng.int(2, 3);
  const out: Wall[] = [];
  const spanX = w - MARGIN * 2;
  const spanY = h - MARGIN * 2;
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const size = rng.range(40, 62);
      const px = MARGIN + spanX * ((cx + 1) / (cols + 1)) + rng.range(-14, 14);
      const py = MARGIN + spanY * ((cy + 1) / (rows + 1)) + rng.range(-14, 14);
      out.push({ x: px - size / 2, y: py - size / 2, w: size, h: size });
    }
  }
  return out;
}

function layoutChambers(w: number, h: number, rng: Rng): Wall[] {
  const t = 16;
  const gap = 100;
  const out: Wall[] = [];
  for (const fx of [0.34, 0.66]) {
    const x = w * fx - t / 2;
    const gapAt = rng.range(MARGIN + gap, h - MARGIN - gap * 2);
    out.push(...runV(x, MARGIN, h - MARGIN, t, gapAt, gap));
  }
  const y = h * rng.range(0.42, 0.58) - t / 2;
  const gapAt = rng.range(MARGIN + gap, w - MARGIN - gap * 2);
  out.push(...runH(y, MARGIN, w - MARGIN, t, gapAt, gap));
  return out;
}

function layoutGauntlet(w: number, h: number, rng: Rng): Wall[] {
  const rowCount = rng.int(3, 4);
  const t = 16;
  const gap = 96;
  const out: Wall[] = [];
  for (let i = 0; i < rowCount; i++) {
    const y = MARGIN + (h - MARGIN * 2) * ((i + 1) / (rowCount + 1)) - t / 2;
    // Alternating gaps force a serpentine path instead of a straight sprint.
    const left = i % 2 === 0;
    const gapAt = left ? MARGIN + rng.range(0, 60) : w - MARGIN - gap - rng.range(0, 60);
    out.push(...runH(y, MARGIN, w - MARGIN, t, gapAt, gap));
  }
  return out;
}

function layoutRubble(w: number, h: number, rng: Rng): Wall[] {
  return scatter(w, h, rng, rng.int(9, 15), 26, 50, 62);
}

function layoutRing(w: number, h: number, rng: Rng): Wall[] {
  const t = 16;
  const gap = 96;
  const x0 = w * 0.22;
  const x1 = w * 0.78;
  const y0 = h * 0.24;
  const y1 = h * 0.76;
  const out: Wall[] = [
    ...runH(y0 - t / 2, x0, x1, t, (x0 + x1) / 2 - gap / 2, gap),
    ...runH(y1 - t / 2, x0, x1, t, (x0 + x1) / 2 - gap / 2, gap),
    ...runV(x0 - t / 2, y0, y1, t, (y0 + y1) / 2 - gap / 2, gap),
    ...runV(x1 - t / 2, y0, y1, t, (y0 + y1) / 2 - gap / 2, gap),
  ];
  const size = rng.range(52, 76);
  out.push({ x: w / 2 - size / 2, y: h / 2 - size / 2, w: size, h: size });
  return out;
}

/** A horizontal wall with one doorway punched through it. */
function runH(y: number, x0: number, x1: number, t: number, gapAt: number, gap: number): Wall[] {
  const out: Wall[] = [];
  const a = clamp(gapAt, x0, x1);
  const b = clamp(gapAt + gap, x0, x1);
  if (a - x0 > 8) out.push({ x: x0, y, w: a - x0, h: t });
  if (x1 - b > 8) out.push({ x: b, y, w: x1 - b, h: t });
  return out;
}

function runV(x: number, y0: number, y1: number, t: number, gapAt: number, gap: number): Wall[] {
  const out: Wall[] = [];
  const a = clamp(gapAt, y0, y1);
  const b = clamp(gapAt + gap, y0, y1);
  if (a - y0 > 8) out.push({ x, y: y0, w: t, h: a - y0 });
  if (y1 - b > 8) out.push({ x, y: b, w: t, h: y1 - b });
  return out;
}

/** Rejection-sampled loose blocks that never crowd each other into a solid mass. */
function scatter(
  w: number, h: number, rng: Rng,
  count: number, minSize: number, maxSize: number, separation: number,
): Wall[] {
  const out: Wall[] = [];
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 24; tries++) {
      const bw = rng.range(minSize, maxSize);
      const bh = rng.range(minSize, maxSize);
      const x = rng.range(MARGIN, w - MARGIN - bw);
      const y = rng.range(MARGIN, h - MARGIN - bh);
      const cx = x + bw / 2;
      const cy = y + bh / 2;
      const clash = out.some((o) => Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) < separation);
      if (clash) continue;
      out.push({ x, y, w: bw, h: bh });
      break;
    }
  }
  return out;
}

function nearPoint(w: Wall, x: number, y: number, r: number): boolean {
  const nx = clamp(x, w.x, w.x + w.w);
  const ny = clamp(y, w.y, w.y + w.h);
  return Math.hypot(x - nx, y - ny) < r;
}

/** Last resort: bulldoze a straight lane between the spawn point and the portal. */
function carveCorridor(walls: readonly Wall[], a: { x: number; y: number }, b: { x: number; y: number }): Wall[] {
  const lane = {
    x: Math.min(a.x, b.x) - 30, y: Math.min(a.y, b.y) - 30,
    w: Math.abs(a.x - b.x) + 60, h: Math.abs(a.y - b.y) + 60,
  };
  return walls.filter((w) => !rectsOverlap(w, lane));
}

function rectsOverlap(a: Wall, b: Wall): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// --- navigation grid -------------------------------------------------------

interface Grid {
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

function buildGrid(walls: readonly Wall[], width: number, height: number): Grid {
  const cols = Math.ceil(width / GRID);
  const rows = Math.ceil(height / GRID);
  const blocked = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = cx * GRID + GRID / 2;
      const y = cy * GRID + GRID / 2;
      let solid = x < BODY_PAD || y < BODY_PAD || x > width - BODY_PAD || y > height - BODY_PAD;
      if (!solid) {
        for (const w of walls) {
          if (x > w.x - BODY_PAD && x < w.x + w.w + BODY_PAD &&
              y > w.y - BODY_PAD && y < w.y + w.h + BODY_PAD) { solid = true; break; }
        }
      }
      blocked[cy * cols + cx] = solid ? 1 : 0;
    }
  }
  return { cols, rows, blocked };
}

function cellIndex(g: Grid, x: number, y: number): number {
  const cx = clamp(Math.floor(x / GRID), 0, g.cols - 1);
  const cy = clamp(Math.floor(y / GRID), 0, g.rows - 1);
  return cy * g.cols + cx;
}

/** Flood fill of everything walkable from `from`. */
function floodFrom(g: Grid, _w: number, _h: number, from: { x: number; y: number }): Uint8Array {
  const seen = new Uint8Array(g.blocked.length);
  const startIdx = nearestOpen(g, cellIndex(g, from.x, from.y));
  if (startIdx < 0) return seen;
  const queue = [startIdx];
  seen[startIdx] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    const cx = i % g.cols;
    const cy = (i - cx) / g.cols;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
      const j = ny * g.cols + nx;
      if (seen[j] || g.blocked[j]) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return seen;
}

const NEIGHBORS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Spiral outward for a walkable cell, so a spawn point sitting in a wall still works. */
function nearestOpen(g: Grid, idx: number): number {
  if (!g.blocked[idx]) return idx;
  const cx = idx % g.cols;
  const cy = (idx - cx) / g.cols;
  for (let r = 1; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
        const j = ny * g.cols + nx;
        if (!g.blocked[j]) return j;
      }
    }
  }
  return -1;
}

function isConnected(g: Grid, w: number, h: number, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const seen = floodFrom(g, w, h, a);
  const target = nearestOpen(g, cellIndex(g, b.x, b.y));
  return target >= 0 && seen[target] === 1;
}

// --- placement -------------------------------------------------------------

export interface PointOptions {
  /** Cell radius that must also be walkable, for bodies bigger than the player. */
  clearance?: number;
  /** Points this sample must stay away from. */
  away?: readonly { x: number; y: number; d: number }[];
  tries?: number;
}

/** A random walkable point, or null if the constraints can't be met. */
export function randomOpenPoint(level: Level, rng: Rng, opts: PointOptions = {}): { x: number; y: number } | null {
  const { clearance = 0, away = [], tries = 60 } = opts;
  if (level.openCells.length === 0) return null;
  for (let i = 0; i < tries; i++) {
    const idx = level.openCells[rng.int(0, level.openCells.length - 1)]!;
    const cx = idx % level.cols;
    const cy = (idx - cx) / level.cols;
    if (!hasClearance(level, cx, cy, clearance)) continue;
    const x = cx * GRID + GRID / 2;
    const y = cy * GRID + GRID / 2;
    if (away.some((a) => Math.hypot(x - a.x, y - a.y) < a.d)) continue;
    return { x, y };
  }
  return null;
}

function hasClearance(level: Level, cx: number, cy: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= level.cols || ny >= level.rows) return false;
      if (level.blocked[ny * level.cols + nx]) return false;
    }
  }
  return true;
}

function placeTraps(level: Level, rng: Rng, boss = false): Trap[] {
  const specs = trapsFor(level.depth, level.biome.traps);
  const out: Trap[] = [];
  if (specs.length === 0) return out;

  // A boss floor gets a token scatter of hazards. The boss is the hazard.
  const want = boss ? Math.min(3, Math.floor(trapCount(level.depth) / 3)) : trapCount(level.depth);
  for (let i = 0; i < want; i++) {
    const spec = pickSpec(specs, rng);
    const away = [
      { x: level.start.x, y: level.start.y, d: 130 },
      { x: level.portal.x, y: level.portal.y, d: 110 },
      ...out.map((t) => ({ x: t.x, y: t.y, d: 92 })),
    ];
    const spot = randomOpenPoint(level, rng, { clearance: 2, away, tries: 40 });
    if (!spot) continue;

    // Saws patrol a lane; everything else sits still.
    let ax = spot.x, ay = spot.y, bx = spot.x, by = spot.y;
    if (spec.kind === "saw") {
      const horizontal = rng.chance(0.5);
      const reach = laneLength(level, spot.x, spot.y, horizontal, 150);
      if (reach < 60) continue;
      if (horizontal) { ax = spot.x - reach; bx = spot.x + reach; }
      else { ay = spot.y - reach; by = spot.y + reach; }
    }

    let angle = 0;
    if (spec.kind === "turret") {
      // Aim down whichever axis has room, so the bolt has a lane to travel.
      const horizontal = laneLength(level, spot.x, spot.y, true, 220) >
                         laneLength(level, spot.x, spot.y, false, 220);
      angle = horizontal ? (rng.chance(0.5) ? 0 : Math.PI) : (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2);
    }

    out.push({
      spec, kind: spec.kind, x: spot.x, y: spot.y, radius: spec.radius,
      // Stagger the cycles so a room full of plates doesn't pulse in unison.
      timer: rng.range(0, Math.max(0.01, spec.cycle)),
      state: "idle", fired: false,
      ax, ay, bx, by, t: rng.next(), dir: rng.chance(0.5) ? 1 : -1,
      angle, spin: rng.range(0, Math.PI),
    });
  }
  return out;
}

/** Weighted pick over hazard specs — `Rng.weighted` keys on strings, this on order. */
function pickSpec(specs: readonly TrapSpec[], rng: Rng): TrapSpec {
  const total = specs.reduce((sum, s) => sum + s.weight, 0);
  let roll = rng.next() * total;
  for (const s of specs) {
    roll -= s.weight;
    if (roll <= 0) return s;
  }
  return specs[specs.length - 1]!;
}

/** How far a clear straight lane extends from a point, up to `max`. */
function laneLength(level: Level, x: number, y: number, horizontal: boolean, max: number): number {
  let reach = 0;
  for (let step = 16; step <= max; step += 16) {
    const a = horizontal ? { x: x - step, y } : { x, y: y - step };
    const b = horizontal ? { x: x + step, y } : { x, y: y + step };
    if (pointBlocked(level, a.x, a.y) || pointBlocked(level, b.x, b.y)) break;
    reach = step;
  }
  return reach;
}

function pointBlocked(level: Level, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return true;
  const cx = Math.floor(x / GRID);
  const cy = Math.floor(y / GRID);
  return level.blocked[cy * level.cols + cx] === 1;
}

function placeProps(level: Level, rng: Rng): Prop[] {
  const out: Prop[] = [];
  const kinds = level.biome.props;
  const want = 16 + Math.floor(level.width / 90);
  for (let i = 0; i < want; i++) {
    const kind = rng.pick(kinds);
    // Torches want a wall to hang on; everything else litters the floor.
    const spot = kind === "torch" ? wallSidePoint(level, rng) : randomOpenPoint(level, rng, { tries: 12 });
    if (!spot) continue;
    if (Math.hypot(spot.x - level.start.x, spot.y - level.start.y) < 46) continue;
    if (out.some((p) => Math.hypot(p.x - spot.x, p.y - spot.y) < 34)) continue;
    out.push({ kind, x: spot.x, y: spot.y, scale: rng.range(0.85, 1.25) });
  }
  return [...out, ...dressFloor(level)];
}

/**
 * The heavy realm dressing — the Delve's funerary statuary and braziers, the
 * Reliquary's war graves and toppled pillars — laid on top of the base scatter.
 * It draws from its own seed-derived stream and consumes **nothing** from the
 * generator's rng, so a floor's shape, difficulty and spawns can never shift
 * because the decoration did (the dive rng is shared with combat), and the
 * scatter still rebuilds exactly from `level.seed` for a co-op client.
 *
 * Any kind the renderer can't resolve to a loaded PNG is simply skipped, so this
 * degrades cleanly while the art for a realm is still being filled in.
 */
function dressFloor(level: Level): Prop[] {
  const set = DRESSING[level.biome.name];
  if (!set) return [];
  const rng = new Rng((level.seed ^ 0x50524f70) >>> 0);
  const out: Prop[] = [];
  const wall: ReadonlySet<PropKind> = new Set(["brazier", "statue", "gibbet", "sarcophagus"]);
  const bulky: ReadonlySet<PropKind> = new Set([
    "statue", "gibbet", "sarcophagus", "altar", "handstone", "pillar", "casket", "wargrave",
  ]);
  const want = 11 + Math.floor(level.width / 120);
  for (let i = 0; i < want; i++) {
    const kind = rng.pick(set);
    const spot = wall.has(kind) ? wallSidePoint(level, rng) : randomOpenPoint(level, rng, { tries: 12 });
    if (!spot) continue;
    const big = bulky.has(kind);
    if (Math.hypot(spot.x - level.start.x, spot.y - level.start.y) < (big ? 100 : 60)) continue;
    if (Math.hypot(spot.x - level.portal.x, spot.y - level.portal.y) < 60) continue;
    const clearance = big ? 56 : 38;
    if (out.some((p) => Math.hypot(p.x - spot.x, p.y - spot.y) < clearance)) continue;
    out.push({ kind, x: spot.x, y: spot.y, scale: big ? rng.range(0.9, 1.12) : rng.range(0.85, 1.2) });
  }
  return out;
}

/**
 * Per-realm mixes of the heavy dressing set, keyed by `BiomeStyle.name`
 * (repetition = frequency). A biome with no entry — the Abyss, for now — gets no
 * heavy dressing and `dressFloor` returns nothing.
 */
const DRESSING: Record<string, readonly PropKind[]> = {
  // The Delve — the Nine Circles' funerary dungeon.
  "Training Grounds": ["skulls", "skulls", "statue", "sarcophagus", "gibbet", "brazier", "altar"],
  "Whispering Forest": ["skulls", "skulls", "statue", "sarcophagus", "brazier"],
  "Dark Cave": ["skulls", "statue", "gibbet", "brazier", "brazier"],
  "Ashen Wastes": ["skulls", "brazier", "brazier", "statue", "gibbet", "altar"],
  "Dragon's Lair": ["brazier", "brazier", "statue", "altar", "gibbet", "sarcophagus"],
  "The Veil": ["skulls", "brazier", "statue", "gibbet", "altar"],
  // The Ashen Reliquary — the tomb of the supernatural, each sector its own dead war.
  // (`casket` is wired but kept out of rotation — it reads too much like a loot chest.)
  "The Wargrave": ["wargrave", "wargrave", "handstone", "urn", "pillar"],
  "The Rotting Garden": ["pillar", "pillar", "urn", "handstone", "wargrave"],
  "The Cinder Catacombs": ["urn", "urn", "wargrave", "handstone", "pillar"],
  "The Frozen Basilica": ["pillar", "pillar", "handstone", "urn", "wargrave"],
  "The Storm Sepulcher": ["wargrave", "wargrave", "handstone", "pillar", "urn"],
  "The Black Archive": ["pillar", "pillar", "handstone", "urn", "wargrave"],
};

/** A point just outside a random wall face, for torches and other wall dressing. */
function wallSidePoint(level: Level, rng: Rng): { x: number; y: number } | null {
  if (level.walls.length === 0) return null;
  const w = rng.pick(level.walls);
  const side = rng.int(0, 3);
  const off = 13;
  switch (side) {
    case 0: return { x: rng.range(w.x, w.x + w.w), y: w.y - off };
    case 1: return { x: rng.range(w.x, w.x + w.w), y: w.y + w.h + off };
    case 2: return { x: w.x - off, y: rng.range(w.y, w.y + w.h) };
    default: return { x: w.x + w.w + off, y: rng.range(w.y, w.y + w.h) };
  }
}

/**
 * Resource nodes prefer dead-end rooms — a detour off the critical path is what makes
 * one worth taking. Whatever doesn't fit in a dead end spills into ordinary rooms.
 */
function placeResourceNodes(
  level: Level, leafSlots: readonly RoomSlot[], otherSlots: readonly RoomSlot[], rng: Rng, count: number,
): ResourceNode[] {
  if (count <= 0) return [];
  const order = [...leafSlots, ...otherSlots];
  const out: ResourceNode[] = [];
  for (let i = 0; i < count && i < order.length; i++) {
    const slot = order[i]!;
    const jitterX = clamp(rng.range(-slot.w * 0.22, slot.w * 0.22), -slot.w / 2 + 30, slot.w / 2 - 30);
    const jitterY = clamp(rng.range(-slot.h * 0.22, slot.h * 0.22), -slot.h / 2 + 30, slot.h / 2 - 30);
    const spot = resolveCircle(level, slot.cx + jitterX, slot.cy + jitterY, 14);
    out.push({ x: spot.x, y: spot.y, radius: 14, depleted: false });
  }
  return out;
}

// --- navigation ------------------------------------------------------------

/**
 * Breadth-first distance field over the walkable grid, rebuilt a few times a second
 * around the player. Monsters that can see you charge straight at you; monsters that
 * can't follow this instead, which is the difference between a layout with corridors
 * being interesting and it being two rooms of enemies standing still.
 */
export class FlowField {
  private readonly dist: Int32Array;
  private readonly queue: Int32Array;

  constructor(level: Level) {
    this.dist = new Int32Array(level.cols * level.rows).fill(-1);
    this.queue = new Int32Array(level.cols * level.rows);
  }

  /** Rebuilds the field with (x, y) as the goal. */
  update(level: Level, x: number, y: number): void {
    this.dist.fill(-1);
    const cols = level.cols;
    const start = nearestOpen({ cols, rows: level.rows, blocked: level.blocked }, cellIndexAt(level, x, y));
    if (start < 0) return;

    const q = this.queue;
    let head = 0;
    let tail = 0;
    q[tail++] = start;
    this.dist[start] = 0;

    while (head < tail) {
      const i = q[head++]!;
      const cx = i % cols;
      const cy = (i - cx) / cols;
      const next = this.dist[i]! + 1;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= level.rows) continue;
        const j = ny * cols + nx;
        if (level.blocked[j] || this.dist[j]! >= 0) continue;
        this.dist[j] = next;
        q[tail++] = j;
      }
    }
  }

  /**
   * Rebuilds the field with many goals at once — a multi-source BFS. `direction` then
   * points toward whichever goal is nearest by walk distance. The minion pathing uses
   * this with every live enemy as a goal, so a skeleton in a corridor flows toward the
   * fight instead of grinding on the wall between it and the nearest monster.
   */
  updateMulti(level: Level, points: readonly { x: number; y: number }[]): void {
    this.dist.fill(-1);
    const cols = level.cols;
    const grid = { cols, rows: level.rows, blocked: level.blocked };
    const q = this.queue;
    let head = 0;
    let tail = 0;
    for (const p of points) {
      const start = nearestOpen(grid, cellIndexAt(level, p.x, p.y));
      if (start < 0 || this.dist[start]! >= 0) continue;
      this.dist[start] = 0;
      q[tail++] = start;
    }
    while (head < tail) {
      const i = q[head++]!;
      const cx = i % cols;
      const cy = (i - cx) / cols;
      const next = this.dist[i]! + 1;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= level.rows) continue;
        const j = ny * cols + nx;
        if (level.blocked[j] || this.dist[j]! >= 0) continue;
        this.dist[j] = next;
        q[tail++] = j;
      }
    }
  }

  /** Unit step toward the goal from (x, y), or null if there's no route from here. */
  direction(level: Level, x: number, y: number): { x: number; y: number } | null {
    const cols = level.cols;
    const idx = cellIndexAt(level, x, y);
    const here = this.dist[idx];
    if (here === undefined || here < 0) return null;

    const cx = idx % cols;
    const cy = (idx - cx) / cols;
    let best = here;
    let bestX = 0;
    let bestY = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= level.rows) continue;
        // Diagonals only count when both orthogonal neighbours are open, so nothing
        // tries to squeeze through the corner where two blocks touch.
        if (dx !== 0 && dy !== 0) {
          if (level.blocked[cy * cols + nx] || level.blocked[ny * cols + cx]) continue;
        }
        const d = this.dist[ny * cols + nx]!;
        if (d < 0 || d >= best) continue;
        best = d;
        bestX = dx;
        bestY = dy;
      }
    }
    if (bestX === 0 && bestY === 0) return null;
    const len = Math.hypot(bestX, bestY);
    return { x: bestX / len, y: bestY / len };
  }
}

function cellIndexAt(level: Level, x: number, y: number): number {
  const cx = clamp(Math.floor(x / GRID), 0, level.cols - 1);
  const cy = clamp(Math.floor(y / GRID), 0, level.rows - 1);
  return cy * level.cols + cx;
}

// --- queries used by the simulation ----------------------------------------

/**
 * Pushes a circle out of every wall it overlaps. Two passes, so a body wedged into a
 * corner resolves against both faces instead of popping through one of them.
 */
export function resolveCircle(
  level: Level, x: number, y: number, r: number,
): { x: number; y: number } {
  for (let pass = 0; pass < 2; pass++) {
    for (const w of level.walls) {
      const nx = clamp(x, w.x, w.x + w.w);
      const ny = clamp(y, w.y, w.y + w.h);
      const dx = x - nx;
      const dy = y - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
      } else {
        // Dead center inside the block: eject along the shallowest face.
        const left = x - w.x;
        const right = w.x + w.w - x;
        const top = y - w.y;
        const bottom = w.y + w.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = w.x - r;
        else if (m === right) x = w.x + w.w + r;
        else if (m === top) y = w.y - r;
        else y = w.y + w.h + r;
      }
    }
  }
  return { x, y };
}

/** True if a point is open floor that can actually be walked to from the spawn. */
export function isWalkable(level: Level, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  const cx = Math.floor(x / GRID);
  const cy = Math.floor(y / GRID);
  return level.open[cy * level.cols + cx] === 1;
}

/** True if a wall sits inside the circle — used to kill projectiles on impact. */
export function circleHitsWall(level: Level, x: number, y: number, r: number): boolean {
  for (const w of level.walls) {
    const nx = clamp(x, w.x, w.x + w.w);
    const ny = clamp(y, w.y, w.y + w.h);
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

/** Line of sight, sampled coarsely. Ranged monsters won't shoot through a pillar. */
export function lineBlocked(level: Level, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(d / 12));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (const w of level.walls) {
      if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
    }
  }
  return false;
}
