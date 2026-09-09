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
 * **The rock mask is the wall list.** A 32-unit cell is rock exactly when its
 * centre lies inside one of the level's wall rects (or off the level). That is
 * only exact because the generator authors every wall *on this lattice* (`TILE`
 * in `game/level.ts`: edges on multiples of 32, one tile thick), so a cell is
 * never half wall — and it means the stone you see is precisely the volume that
 * stops you, with the hero's 9-unit radius the only gap between sprite and face.
 * Two earlier passes got this wrong in opposite directions: rasterising 16-unit
 * off-lattice walls painted rock up to half a tile past the real face, and
 * sampling the body-inflated `blocked` grid instead painted a whole extra tile
 * on one side of every wall (a tile centre sits eight units off the nav cell it
 * falls in, well inside the fourteen-unit inflation). Both read as "I can walk
 * through walls". The smoke test now asserts the lattice on every floor.
 */

import type { LoadedTileset } from "./atlas/index";
import type { TiledSpace } from "../game/level";
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

/** World units a single sheet tile is stamped across — 2× the 16-texel source, and
 *  the lattice every wall is authored on (`TILE` in `game/level.ts`). */
const STAMP = 32;

/**
 * Paints the whole floor — stone and rock both — into `ctx` (expected to be a
 * fresh canvas the size of the level). Returns false without drawing if the
 * tileset isn't the 16-texel corner-Wang sheet this stamper expects, so the
 * caller can fall back to the flat bake.
 */
export function paintTilemap(ctx: CanvasRenderingContext2D, level: TiledSpace, ts: LoadedTileset): boolean {
  const SRC = ts.tile;
  // The stamper reads a 16-texel sheet tile; anything else can't be a corner-Wang
  // sheet from the pipeline, so bail rather than draw it askew.
  if (SRC !== 16) return false;

  const T = STAMP;
  const { width, height, walls } = level;
  const cols = Math.ceil(width / T);
  const rows = Math.ceil(height / T);
  const sheet = ts.canvas;

  // A tile cell is rock when its centre is inside a wall. Walls are lattice-
  // aligned and a whole tile thick, so this is exact — see the header comment.
  const rock = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = cx * T + T / 2;
      const y = cy * T + T / 2;
      let s = 0;
      for (const w of walls) {
        if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) { s = 1; break; }
      }
      rock[cy * cols + cx] = s;
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
