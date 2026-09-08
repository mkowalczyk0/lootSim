/**
 * Turns a raw PixelLab top-down-tileset metadata dump into the trimmed JSON the
 * runtime autotiler reads.
 *
 * PixelLab's `create_topdown_tileset` returns a 16-tile corner Wang set: a 64x64
 * sheet (4x4 of 16px tiles) plus metadata that, for each tile, gives its four
 * corner terrains (`upper` = wall mass, `lower` = floor) and its `bounding_box`
 * in the sheet. The sheet order is arbitrary — you MUST place each tile by its
 * `bounding_box`, never by array index or the `wang_N` name (see the Wang-tileset
 * doc resource). This tool bakes that lookup down to one array indexed by the
 * 4-bit corner mask `NW<<3 | NE<<2 | SW<<1 | SE`, which is all `render/tilemap.ts`
 * needs at draw time.
 *
 *   npm run tileset -- art/tilesets/tiles.delve-limbo.raw.json
 *
 * Writes `src/render/atlas/tilesets/<id>.json` next to the committed `<id>.png`.
 * The `<id>` is the raw file's basename with `.raw` stripped.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

interface RawCorners { NW: string; NE: string; SW: string; SE: string; }
interface RawBox { x: number; y: number; width: number; height: number; }
interface RawTile { corners: RawCorners; bounding_box: RawBox; }
interface RawMeta {
  tile_size: { width: number; height: number };
  tileset_data: { tiles: RawTile[] };
}

const src = process.argv[2];
if (!src) {
  console.error("usage: npm run tileset -- art/tilesets/<id>.raw.json");
  process.exit(1);
}

const id = basename(src).replace(/\.raw\.json$/, "").replace(/\.json$/, "");
const meta = JSON.parse(readFileSync(src, "utf8")) as RawMeta;
const tile = meta.tile_size.width;
const tiles = meta.tileset_data.tiles;

if (tiles.length !== 16) {
  console.error(`expected 16 tiles, got ${tiles.length} — 25-tile transition sheets are not supported yet`);
  process.exit(1);
}

const bit = (v: string) => (v === "upper" ? 1 : 0);
const boxes: ([number, number] | null)[] = Array(16).fill(null);

for (const t of tiles) {
  const c = t.corners;
  const mask = bit(c.NW) * 8 + bit(c.NE) * 4 + bit(c.SW) * 2 + bit(c.SE);
  const b = t.bounding_box;
  if (b.width !== tile || b.height !== tile) {
    console.error(`tile ${mask} is ${b.width}x${b.height}, expected ${tile}px — sheet is not a clean grid`);
    process.exit(1);
  }
  boxes[mask] = [b.x, b.y];
}

const missing = boxes.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
if (missing.length > 0) {
  console.error(`missing corner masks: ${missing.join(", ")}`);
  process.exit(1);
}

const out = {
  id,
  tile,
  // One [x, y] per corner mask (NW<<3 | NE<<2 | SW<<1 | SE). 0 = all floor,
  // 15 = solid wall. Slice the sheet PNG at [x, y, tile, tile].
  boxes,
};

const dest = join("src/render/atlas/tilesets", `${id}.json`);
writeFileSync(dest, `${JSON.stringify(out, null, 0)}\n`);
console.log(`wrote ${dest}`);
console.log(`  ${tile}px tiles, 16 masks, all present`);
