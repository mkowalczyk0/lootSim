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
  | "altar" | "memoryPortal"
  // The build-tester room: the first second room the deck has ever had. One station,
  // one dummy, no config screen — walking in and confirming is the whole interaction,
  // the same as `dive`.
  | "training"
  // The Trophy Hall (docs/docket.md §3): the second room to use the second-room seam
  // the training room's own comment promised. One station opens the case-management
  // screen; what's on display is drawn beside it in the world (`render/hub.ts`).
  | "trophyHall";

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
 * **Rearranged 2026-09 (owner review of the first render): the relics read "a bit small
 * and out of place."** That first pass kept the painted image's old coordinates verbatim
 * and had never been seen rendered — three station relics (the Avarice Rift portal, the
 * Quartermaster's rack, the Reliquary Gate) were stacked two and three tiles apart, so
 * the rack visually sat on top of "AVARICE RIFT" and "QUARTERMASTER"/"RELIQUARY GATE"
 * ran into each other as text. Bumping every relic's `worldScale` (see `manifest.ts`) to
 * read as furniture rather than set dressing made the packing worse, not better, so this
 * pass re-spaces every station and dressing glyph rather than nudging the three named
 * ones — `deckProblems()` and the smoke test still hold the grid to the same rules, and
 * nothing about the hall's own walls moved.
 *
 * The stations no longer keep the painted image's original coordinates verbatim — that
 * bake predates the relic art and was never checked against a render. The general
 * geography survives (Comms near the west wall, the Quartermaster/Reliquary Gate/Forge
 * toward the east and south, the Abyss in the north archway), just spaced far enough
 * apart that a relic's own footprint and its neighbor's label never touch: six relics
 * across two rows (row 6: Comms, the Altar, the Reliquary Gate; row 12: the War Table,
 * the Quartermaster, the Forge), with the portals and floor dressing filling the gaps
 * between and below. The Quartermaster's column (8, not directly between the War
 * Table's and the Forge's) is load-bearing for an unrelated reason: `tools/smoke.ts`
 * asserts the spawn tile is clear of every station's interact radius ("nothing is in
 * interact range at spawn," so arriving on the deck never opens a station's screen
 * unasked), and the rack's own footprint is the one relic prop still large enough that
 * no other column at row 12 clears both that radius and its row-mates — see
 * `tools/hub-layout.ts`, the geometry check this whole rearrangement was authored
 * against, which brute-forces a station's legal cells the same way when hand-placement
 * runs out of room.
 *
 * **The build-tester room is the first second room** — exactly the "a handful of rows"
 * the header above promised: a doorway punched through the hall's own east wall at row
 * 8 (where the Comms/Quartermaster band already sat, so nothing else moved), a short
 * corridor, and a small walled room holding the training dummy's own station (`P`). It
 * is drawn from the painted deck's interior wall list the way every station already is
 * (`DECK_INTERIOR_WALLS`) rather than needing a rendering special case.
 *
 * **The Trophy Hall is the second second room** — the same seam, exercised again: a
 * doorway at row 11 only (rows 10 and 12 keep the old wall solid, exactly the training
 * room's buffer-row shape), leading into a room at columns 23-28, holding the Trophy
 * Hall's one station (`Y`). Docket §3, `data/trophies.ts`, `docs/trophy-hall.md`.
 */
const DECK: readonly string[] = [
  "##############################",
  "##############################",
  "#########.A###################",
  "####T..........H##############",
  "###..............#############",
  "###M.............#############",
  "###...C..L...R..##############",
  "###..............######......#",
  "###.D..V...G...E..r.r.X......#",
  "###..............######..P...#",
  "###..............######......#",
  "###p...b.n.s...pb........Y...#",
  "####.W..Q....F..#######......#",
  "#########.@###################",
  "##############################",
];

const ROCK = "#";
const SPAWN = "@";

/**
 * Floor dressing: one lowercase letter per decorative relic, standing on the same grid the
 * stations do. **Adding a brazier is one character**, exactly as moving the Forge is.
 *
 * This exists because of a tension worth writing down. `npm run smoke` fails a tileset
 * whose tiles carry more than ±14 internal luminance spread — a deliberately quiet tile,
 * because a busy one turns to mush at game zoom and stops reading as walkable-vs-not. But
 * the Citadel is the Threshold and the owner's standing note is that a bare stamped floor
 * isn't finished. Those two pull opposite ways, and **the resolution is that the dressing
 * lives in the props, never in the tiles.** A quiet floor with things standing on it reads
 * as a place; a busy floor reads as noise. So this table is not a nicety — it is where the
 * room's character has to come from once the sheet lands.
 *
 * Purely visual and walkable, like a dungeon floor's props: the only thing that stops you
 * on this deck is `#`. An id here that has no committed PNG simply doesn't draw, the same
 * fallback every other named-before-drawn asset takes.
 */
export const DECK_DRESSING: Record<string, string> = {
  b: "prop.citadel-brazier",
  r: "prop.citadel-rubble",
  s: "prop.citadel-statue",
  p: "prop.citadel-pillar",
  n: "prop.citadel-banner",
};

/**
 * Which letter stands for which station. Exhaustive over `HubStationKind` by type, so a
 * new station cannot be added to the game without being given a place to stand — the
 * failure mode the old coordinate list had (the War Table and the Altar both arrived
 * after the deck was baked and had nowhere to be).
 */
/**
 * The relic each station stands on, as an atlas id — **the art bill the tileset rung pays.**
 *
 * The painted scene has its stations baked *into the image*, which is why the other two
 * rungs draw a generic terminal glyph instead. On a stamped floor there is nothing under
 * any of them, so every station needs a real prop or the Forge and the Quartermaster are
 * the same shape with different words under them.
 *
 * `Record<HubStationKind, ...>` on purpose, exactly like `STATION_GLYPH` below: a new station cannot
 * be added without deciding what it looks like, even if the decision is `null`.
 *
 * An id here is not automatically safe to add to `ATLAS` — `loadAtlas` *rejects* on a
 * missing PNG for an `ATLAS` row, so a half-declared prop is a boot failure where an
 * undeclared one is a clean fallback. Naming it here and listing it there are two
 * different promises — this one says "this is what it will be", that one says "this
 * exists" — and all seven now do (`src/render/atlas/props/prop.citadel-*.png`).
 */
export const STATION_PROP: Record<HubStationKind, string | null> = {
  forge: "prop.citadel-forge",
  quartermaster: "prop.citadel-rack",
  comms: "prop.citadel-shrine",
  starmap: "prop.citadel-starmap",
  warTable: "prop.citadel-wartable",
  altar: "prop.citadel-altar",
  training: "prop.citadel-dummy",
  trophyHall: "prop.citadel-trophy-case",
  // The portals are the shared summoning glyph turning over a ring cut into the floor, and
  // that is deliberate: a portal should read as the same promise wherever it stands, so it
  // is drawn rather than painted. `drawPortalPad` already grounds it in the flagstone.
  dive: null, abyss: null, hoard: null, expedition: null,
  vigil: null, convergence: null, tower: null,
  raidPortal: null, memoryPortal: null,
};

const STATION_GLYPH: Record<HubStationKind, string> = {
  dive: "D", abyss: "A", hoard: "H", starmap: "R", expedition: "E",
  forge: "F", quartermaster: "Q", comms: "C", warTable: "W", raidPortal: "X",
  tower: "T", vigil: "V", convergence: "G", altar: "L", memoryPortal: "M",
  training: "P", trophyHall: "Y",
};

export const DECK_COLS = DECK[0]!.length;
export const DECK_ROWS = DECK.length;
export const DECK_WIDTH = DECK_COLS * TILE;
export const DECK_HEIGHT = DECK_ROWS * TILE;

/**
 * How wide the deck was before the build-tester room extended it east — exactly the
 * width `hub.citadel-deck` (the painted scene, §4) was authored for. `render/hub.ts`
 * stretches that image to fill the painted look, and the image itself did not grow when
 * the grid did, so it draws at this width rather than `DECK_WIDTH` — stretching it over
 * the wider grid would squash every relic already painted into it. The room past this
 * line always draws flat, the same look the whole hall has before any art loads.
 */
export const PAINTED_HALL_WIDTH = 20 * TILE;

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

/** One dressing relic on the floor: where it stands and which prop it is. */
export interface DeckProp {
  readonly x: number;
  readonly y: number;
  readonly art: string;
}

/**
 * Every dressing glyph on the deck, in reading order — so two braziers are two `b`s and
 * nothing else has to change. Derived from the same grid the walls and stations are, which
 * is the whole point of authoring the hall as text.
 */
export const DECK_PROPS: readonly DeckProp[] = (() => {
  const out: DeckProp[] = [];
  for (let row = 0; row < DECK.length; row++) {
    const line = DECK[row]!;
    for (let col = 0; col < line.length; col++) {
      const art = DECK_DRESSING[line[col]!];
      if (art) out.push({ x: (col + 0.5) * TILE, y: (row + 0.5) * TILE, art });
    }
  }
  return out;
})();

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
  for (const glyph of Object.keys(DECK_DRESSING)) {
    if (glyph.length !== 1) problems.push(`the dressing glyph "${glyph}" is not one character`);
    if (glyph === ROCK || glyph === SPAWN || glyph === ".") {
      problems.push(`dressing claims the reserved glyph "${glyph}"`);
    }
  }
  for (const [kind, glyph] of Object.entries(STATION_GLYPH) as [HubStationKind, string][]) {
    if (glyph.length !== 1) problems.push(`${kind}'s glyph "${glyph}" is not one character`);
    if (glyph in DECK_DRESSING) problems.push(`${kind}'s glyph "${glyph}" is also a dressing glyph`);
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
      if (ch in DECK_DRESSING) continue;
      if (!seen.has(ch)) problems.push(`"${ch}" is on the deck but is neither a station nor dressing`);
    }
  }
  return problems;
}
