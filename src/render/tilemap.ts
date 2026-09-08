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
 * The rock mask is built from the level's **raw wall rectangles** — the exact
 * footprint the old per-frame `drawWalls` pass painted — not the `blocked` nav
 * grid, which is inflated by a body radius so the player can't clip a corner. A
 * cell counts as rock when a wall rect *overlaps* it at all (a coverage test, not
 * a centre-point test): at a 32-unit cell a 16-thick interior wall would fall
 * between sample points and drop out of a centre test, so coverage is what keeps
 * the walls solid at this coarser pitch.
 */

import type { LoadedTileset } from "./atlas/index";
import type { Level } from "../game/level";

/** World units a single sheet tile is stamped across — 2× the 16-texel source. */
const STAMP = 32;

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
  const { width, height, walls } = level;
  const cols = Math.ceil(width / T);
  const rows = Math.ceil(height / T);
  const sheet = ts.canvas;

  // Rasterise the raw wall rects (and the level border) to the coarse tile grid.
  // Coverage test: a cell is rock if any wall rect intersects its 32-unit box, so
  // a thin interior wall reads as a solid band rather than a dashed one.
  const rock = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = cx * T;
      const y0 = cy * T;
      const x1 = x0 + T;
      const y1 = y0 + T;
      let s = x0 < 3 || y0 < 3 || x1 > width - 3 || y1 > height - 3;
      if (!s) {
        for (const w of walls) {
          if (x1 > w.x && x0 < w.x + w.w && y1 > w.y && y0 < w.y + w.h) { s = true; break; }
        }
      }
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
