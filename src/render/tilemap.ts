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
 * `Level.open` — the flood fill of everything walkable from the spawn — is the
 * floor mask. Everything else (wall interiors, the sealed-off slots the room
 * walk never reached, the dead band around the arena) reads as solid rock, which
 * is exactly the worldbuilding's "sealed off as solid rock rather than an
 * unexplained gap in the floor."
 */

import type { LoadedTileset } from "./atlas/index";
import type { Level } from "../game/level";

/**
 * Paints the whole floor — stone and rock both — into `ctx` (expected to be a
 * fresh canvas the size of the level). Returns false without drawing if the
 * tileset's tile size doesn't match the level's 16-unit grid, so the caller can
 * fall back to the flat bake.
 */
export function paintTilemap(ctx: CanvasRenderingContext2D, level: Level, ts: LoadedTileset): boolean {
  const T = ts.tile;
  // The generator's nav grid is 16 units; a tileset authored at any other tile
  // size can't line up with it cell-for-cell, so bail rather than draw it askew.
  if (T !== 16) return false;

  const { cols, rows, open } = level;
  const sheet = ts.canvas;

  // cell(cx, cy): 1 where solid rock, 0 where walkable floor. Out of range = rock.
  const solid = (cx: number, cy: number): number => {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return 1;
    return open[cy * cols + cx] === 1 ? 0 : 1;
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
        ctx.drawImage(sheet, box[0], box[1], T, T, -T / 2, -T / 2, T, T);
        ctx.restore();
      } else {
        ctx.drawImage(sheet, box[0], box[1], T, T, dx, dy, T, T);
      }
    }
  }
  return true;
}
