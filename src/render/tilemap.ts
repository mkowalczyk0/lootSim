/**
 * Stamps a level's walkable/solid grid with a PixelLab corner Wang tileset, using
 * the **dual-grid** trick: the tile drawn at a grid node samples the four cells
 * around that node as its corners, so a binary floor/rock grid resolves into
 * seamless hand-arted stone with rounded rubble edges and no authored map.
 *
 * Browser-only (it draws to a canvas). Pure function of the `Level` the seeded
 * generator produced, so it changes nothing about the simulation and stays in
 * sync across a co-op party for free.
 *
 * **Tile pitch.** A sheet tile is 16 texels, but it is stamped across a 32-unit
 * cell (`STAMP`), a clean 2× nearest-neighbour blow-up. The Citadel deck is
 * authored at roughly 1.7 hub-units per pixel and then viewport-scaled up, so at
 * the dungeon's 2.2× zoom its stone reads at ~5 screen-px per art-pixel. Stamping
 * the floor 1:1 put it at ~2.2 — half the pitch of everything standing on it,
 * which is what made the tiled floors look finer, busier and "zoomed out" next to
 * the hub. Doubling the cell brings the floor onto the same pixel grid as the
 * hero, the props and the deck.
 *
 * The rock mask is sampled from the level's **`blocked` grid** — the same
 * body-inflated collision volume the player is actually stopped by — at each
 * 32-unit cell's centre. An earlier pass rasterised the raw wall rects instead,
 * but at this coarser 32-unit pitch a raw-rect coverage test paints rock a good
 * half-tile out past the true wall, over floor the player can still stand on, so
 * you could walk visibly into a "wall". Sampling `blocked` keeps painted stone a
 * subset of where collision already forbids you — at the cost of walls reading
 * one body-radius thicker, which at this chunky pitch actually matches the deck.
 */

import type { LoadedTileset } from "./atlas/index";
import type { Level } from "../game/level";
import { gradeSheet } from "./grade";

const gradedCache = new Map<string, LoadedTileset>();

/**
 * The tileset as the floor actually stamps it: the committed sheet run through
 * the floor grade (`render/grade.ts`) with this biome's tint, so every set lands
 * in the Citadel deck's muted register whatever PixelLab handed back. Graded once
 * per (tileset, tint) and cached — the sheet is 64px, so this is nothing, but a
 * floor is re-baked every time a level starts.
 */
export function gradedTileset(id: string, ts: LoadedTileset, tint: string): LoadedTileset {
  const key = `${id}|${tint}`;
  const hit = gradedCache.get(key);
  if (hit) return hit;
  const { width, height } = ts.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ts.canvas, 0, 0);
  const img = ctx.getImageData(0, 0, width, height);
  gradeSheet(img.data, width, height, ts.tile, ts.boxes, tint);
  ctx.putImageData(img, 0, 0);
  const graded: LoadedTileset = { canvas, tile: ts.tile, boxes: ts.boxes };
  gradedCache.set(key, graded);
  return graded;
}

/** World units a single sheet tile is stamped across — 2× the 16-texel source. */
const STAMP = 32;
/** The generator's own nav/collision grid pitch (`GRID` in `game/level.ts`). */
const NAV = 16;

/**
 * Paints the whole floor — stone and rock both — into `ctx` (expected to be a
 * fresh canvas the size of the level). Returns false without drawing if the
 * tileset isn't the 16-texel corner-Wang sheet this stamper expects, so the
 * caller can fall back to the flat bake.
 */
export function paintTilemap(ctx: CanvasRenderingContext2D, level: Level, ts: LoadedTileset): boolean {
  const SRC = ts.tile;
  // The stamper reads a 16-texel sheet tile; anything else can't be a corner-Wang
  // sheet from the pipeline, so bail rather than draw it askew.
  if (SRC !== 16) return false;

  const T = STAMP;
  const { width, height, blocked, cols: navCols, rows: navRows } = level;
  const cols = Math.ceil(width / T);
  const rows = Math.ceil(height / T);
  const sheet = ts.canvas;

  // A coarse tile cell is rock when the player's collision grid forbids its
  // centre. `blocked` is the raw walls inflated by a body radius, so painted
  // stone can never claim a spot you're allowed to stand on. The border cells
  // fall outside `blocked` and read as rock via the range check below.
  const rock = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const nx = Math.floor((cx * T + T / 2) / NAV);
      const ny = Math.floor((cy * T + T / 2) / NAV);
      const s = nx < 0 || ny < 0 || nx >= navCols || ny >= navRows
        ? 1
        : blocked[ny * navCols + nx];
      rock[cy * cols + cx] = s ? 1 : 0;
    }
  }

  // cell(cx, cy): 1 where solid rock, 0 where floor. Out of range = rock.
  const solid = (cx: number, cy: number): number => {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return 1;
    return rock[cy * cols + cx];
  };

  ctx.imageSmoothingEnabled = false;

  // A PixelLab tile carries a fixed internal texture, so a big open room stamped
  // with the one all-floor tile reads as graph paper. Flip the two *uniform*
  // tiles (all floor, all rock) into one of four orientations, chosen from the
  // level seed so a floor still looks like itself — the transition tiles are left
  // alone, since flipping them would break which side the wall is on.
  const seed = level.seed >>> 0;
  const orient = (nx: number, ny: number): number => {
    let h = (seed ^ (nx * 374761393) ^ (ny * 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return h & 3;
  };

  // One tile per grid node, offset half a cell so its corners land on cell
  // centres — the dual grid. Nodes run one past the far edge to cap the border.
  for (let ny = 0; ny <= rows; ny++) {
    for (let nx = 0; nx <= cols; nx++) {
      const nw = solid(nx - 1, ny - 1);
      const ne = solid(nx, ny - 1);
      const sw = solid(nx - 1, ny);
      const se = solid(nx, ny);
      const mask = (nw << 3) | (ne << 2) | (sw << 1) | se;
      const box = ts.boxes[mask];
      if (!box) continue;
      const dx = nx * T - T / 2;
      const dy = ny * T - T / 2;
      if (mask === 0 || mask === 15) {
        const o = orient(nx, ny);
        ctx.save();
        ctx.translate(dx + T / 2, dy + T / 2);
        ctx.scale(o & 1 ? -1 : 1, o & 2 ? -1 : 1);
        ctx.drawImage(sheet, box[0], box[1], SRC, SRC, -T / 2, -T / 2, T, T);
        ctx.restore();
      } else {
        ctx.drawImage(sheet, box[0], box[1], SRC, SRC, dx, dy, T, T);
      }
    }
  }
  return true;
}
