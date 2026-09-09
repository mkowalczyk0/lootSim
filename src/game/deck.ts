/**
 * The Citadel deck, authored on the tile lattice — the hub's answer to `game/level.ts`.
 *
 * The deck used to be a single painted image with every station's coordinate hand-tuned
 * against it (`{ kind: "forge", x: 508, y: 372 }`). That made moving anything a guessing
 * game: there was no grid to move it *on*, the number was only meaningful next to the
 * PNG, and every station added after the bake had to draw its own relic because the
 * painting didn't know it existed.
 *
 * So the deck is now authored the way a dungeon floor is: **on the 32-unit tile lattice**
 * (`TILE` in `./level.ts`), one character per tile. Rock is `#`, floor is `.`, `@` is
 * where you stand when you arrive, and every other letter is a station's anchor tile.
 * Rearranging the Citadel is editing this block of text; adding a station is a glyph and
 * a row in `STATION_GLYPH`. Walls come out of the same grid, on the same lattice the
 * dungeon's stamper expects, so the painted rock is exactly the volume that stops you.
 *
 * Pure data + pure functions, no DOM — `game/hub.ts` simulates against it and
 * `render/hub.ts` draws it, exactly the split `level.ts` has with `render/draw.ts`.
 *
 * **This is deliberately one open hall in v1.** A second room is a handful of rows here
 * and nothing else, which is the point of the refactor — but it is not this change.
 */

import { TILE, type Wall } from "./level";

export type HubStationKind =
  | "dive" | "abyss" | "hoard" | "starmap" | "expedition" | "forge" | "quartermaster"
  | "comms" | "vigil" | "convergence" | "tower"
  // The raid pair (UAT §15): a terminal that picks one, and the portal that picking spawns
  // — the Reliquary Gate's shape exactly, because a raid is chosen the same way a sector
  // is (which one, at which tier) and there are four of them to choose between.
  | "warTable" | "raidPortal"
  // The Memory pair (`data/memories.ts`, `docs/memories.md`): an altar that shapes and
  // picks one, and the portal that picking spawns. The Reliquary Gate's shape exactly,
  // because a Memory is chosen the same way a sector is — you configure it at a terminal
  // and then walk into what that opens.
  | "altar" | "memoryPortal";

/**
 * The hall. One character per 32-unit tile; `#` is stone you cannot cross.
 *
 * The shape is read off the Citadel deck painting (`hub.citadel-deck`, §4) rather than
 * invented, because that image is still what the floor is drawn from: a wall band three
 * tiles deep on every side, a shallow alcove in the north wall where the Abyss's archway
 * is painted, and the two-tile entrance the hall's own gate opens into at the bottom —
 * which is where you arrive. The old rectangular clamp let you stand a good tile *inside*
 * the painted masonry on every side; this is the first version of the deck where the
 * stone that stops you is the stone the picture shows.
 *
 * The stations keep the relative positions and the painted structures they had — the
 * Comms shrine on its plinth against the west wall, the Quartermaster's rack and the
 * Reliquary Gate along the east, the Forge on its furnace in the southeast corner, the
 * Abyss in the north archway — snapped onto the lattice. The three that were standing on
 * painted wall (the War Table, the Convergence and the Raid Portal, all added after the
 * deck was baked and placed by eye) moved onto floor.
 */
const DECK: readonly string[] = [
  "####################",
  "####################",
  "#########.A#########",
  "####T...........####",
  "###.....L....H...###",
  "###.W............###",
  "###..........Q..R###",
  "###C.............###",
  "###.....E........###",
  "###...D....M...G.###",
  "###..............###",
  "###.V...........F###",
  "####..X.........####",
  "#########.@#########",
  "####################",
];

const ROCK = "#";
const SPAWN = "@";

/**
 * Which letter stands for which station. Exhaustive over `HubStationKind` by type, so a
 * new station cannot be added to the game without being given a place to stand — the
 * failure mode the old coordinate list had (the War Table and the Altar both arrived
 * after the deck was baked and had nowhere to be).
 */
const STATION_GLYPH: Record<HubStationKind, string> = {
  dive: "D", abyss: "A", hoard: "H", starmap: "R", expedition: "E",
  forge: "F", quartermaster: "Q", comms: "C", warTable: "W", raidPortal: "X",
  tower: "T", vigil: "V", convergence: "G", altar: "L", memoryPortal: "M",
};

export const DECK_COLS = DECK[0]!.length;
export const DECK_ROWS = DECK.length;
export const DECK_WIDTH = DECK_COLS * TILE;
export const DECK_HEIGHT = DECK_ROWS * TILE;

/** The glyph at a cell, or `#` off the edge of the deck. */
export function deckGlyph(cx: number, cy: number): string {
  if (cx < 0 || cy < 0 || cx >= DECK_COLS || cy >= DECK_ROWS) return ROCK;
  return DECK[cy]![cx] ?? ROCK;
}

/** True where a body cannot stand. Off the deck counts as rock. */
export function deckIsRock(cx: number, cy: number): boolean {
  return deckGlyph(cx, cy) === ROCK;
}

/** The world-space centre of a tile. */
function centre(cx: number, cy: number): { x: number; y: number } {
  return { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
}

/**
 * The deck's walls, merged along each row into as few rects as possible. Every edge lands
 * on a multiple of `TILE` and every rect is exactly one tile thick, which is the property
 * `render/tilemap.ts` needs to stamp the hall: a tile cell is then either wholly rock or
 * wholly floor, never half of each.
 */
function buildWalls(): Wall[] {
  const walls: Wall[] = [];
  for (let cy = 0; cy < DECK_ROWS; cy++) {
    let run = 0;
    for (let cx = 0; cx <= DECK_COLS; cx++) {
      if (cx < DECK_COLS && deckIsRock(cx, cy)) { run++; continue; }
      if (run > 0) {
        walls.push({ x: (cx - run) * TILE, y: cy * TILE, w: run * TILE, h: TILE });
        run = 0;
      }
    }
  }
  return walls;
}

export const DECK_WALLS: readonly Wall[] = buildWalls();

/**
 * The walls that are *not* part of the hall's outer ring.
 *
 * Only the interim renderer cares: while the deck is still drawn from the painted scene
 * (`hub.citadel-deck`), that painting already shows the outer wall, so redrawing it would
 * cover the archways with flat stone — but anything authored *inside* the ring is not in
 * the painting and has to be drawn or it would be an invisible obstacle. Once a deck
 * tileset exists the whole hall is stamped and this is unused.
 */
export const DECK_INTERIOR_WALLS: readonly Wall[] = DECK_WALLS.filter(
  (w) => w.y > 0 && w.y + w.h < DECK_HEIGHT && w.x > 0 && w.x + w.w < DECK_WIDTH,
);

/** Everything `render/tilemap.ts` needs to stamp the hall — a `Level` in miniature. */
export const DECK_SPACE = {
  width: DECK_WIDTH,
  height: DECK_HEIGHT,
  walls: DECK_WALLS,
  /** Fixed, so the Citadel always looks like itself; the stamper only uses it to pick
   *  which way up the two uniform tiles are flipped. */
  seed: 0x0c17ade1,
} as const;

function findGlyph(glyph: string): { x: number; y: number } | null {
  for (let cy = 0; cy < DECK_ROWS; cy++) {
    const cx = DECK[cy]!.indexOf(glyph);
    if (cx >= 0) return centre(cx, cy);
  }
  return null;
}

const DECK_CENTRE = { x: DECK_WIDTH / 2, y: DECK_HEIGHT / 2 };

const ANCHORS: Partial<Record<HubStationKind, { x: number; y: number }>> = {};
for (const [kind, glyph] of Object.entries(STATION_GLYPH) as [HubStationKind, string][]) {
  const at = findGlyph(glyph);
  if (at) ANCHORS[kind] = at;
}

/** Where a station stands. Falls back to the middle of the hall rather than throwing at
 *  import time; `deckProblems()` is what makes a missing glyph a failing test. */
export function deckAnchor(kind: HubStationKind): { x: number; y: number } {
  return ANCHORS[kind] ?? DECK_CENTRE;
}

/** Where you arrive, and where a run drops you back. */
export const DECK_SPAWN: { x: number; y: number } = findGlyph(SPAWN) ?? DECK_CENTRE;

/**
 * Everything wrong with the deck as authored, as sentences — the same shape
 * `relicProblems` uses, so the acceptance tool reads it rather than reimplementing the
 * rules. Empty means the hall is well-formed.
 */
export function deckProblems(): string[] {
  const problems: string[] = [];
  for (const row of DECK) {
    if (row.length !== DECK_COLS) problems.push(`a deck row is ${row.length} tiles, not ${DECK_COLS}`);
  }
  const seen = new Map<string, HubStationKind>();
  for (const [kind, glyph] of Object.entries(STATION_GLYPH) as [HubStationKind, string][]) {
    if (glyph.length !== 1) problems.push(`${kind}'s glyph "${glyph}" is not one character`);
    if (glyph === ROCK || glyph === SPAWN) problems.push(`${kind} claims the reserved glyph "${glyph}"`);
    const other = seen.get(glyph);
    if (other) problems.push(`${kind} and ${other} both use the glyph "${glyph}"`);
    seen.set(glyph, kind);
    let count = 0;
    for (const row of DECK) for (const ch of row) if (ch === glyph) count++;
    if (count !== 1) problems.push(`${kind}'s glyph "${glyph}" appears ${count} times on the deck, not once`);
  }
  let spawns = 0;
  for (const row of DECK) for (const ch of row) if (ch === SPAWN) spawns++;
  if (spawns !== 1) problems.push(`the deck has ${spawns} spawn points, not one`);
  for (const row of DECK) {
    for (const ch of row) {
      if (ch === ROCK || ch === "." || ch === SPAWN) continue;
      if (!seen.has(ch)) problems.push(`"${ch}" is on the deck but is nobody's station`);
    }
  }
  return problems;
}
