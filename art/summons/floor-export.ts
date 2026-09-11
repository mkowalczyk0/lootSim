/**
 * Export one biome's graded all-floor tile as a PNG, so `wash-study.py` can stand the
 * summons on the floor the game actually draws rather than on a checkerboard — the
 * `tools/inworld.ts` argument ("a character is judged standing on a floor"), split out
 * because the study's composition and labelling are easier in Pillow than in a
 * hand-rolled PNG writer, and the one thing Pillow cannot do is run `gradeSheet`.
 *
 *   npx esbuild art/summons/floor-export.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/floor-export.mjs && node /tmp/floor-export.mjs "Training Grounds" out.png
 */

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { decodePng } from "../../tools/png";
import { FLOOR_GRADE, gradeSheet } from "../../src/render/grade";
import { BIOMES } from "../../src/data/biomes";

let CRC: number[] | null = null;
function crc32(b: Buffer): number {
  if (!CRC) {
    CRC = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC.push(c >>> 0); }
  }
  let c = 0xffffffff;
  for (const byte of b) c = CRC[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function writePng(path: string, w: number, h: number, rgba: Uint8Array): void {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.subarray(y * w * 4, (y + 1) * w * 4)).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]));
}

const biomeName = process.argv[2] ?? "Training Grounds";
const out = process.argv[3] ?? "floor-tile.png";
const biome = BIOMES.find((b) => b.name === biomeName);
if (!biome?.tileset) throw new Error(`no tileset for biome "${biomeName}"`);
const png = decodePng(readFileSync(`src/render/atlas/tilesets/${biome.tileset}.png`));
const meta = JSON.parse(readFileSync(`src/render/atlas/tilesets/${biome.tileset}.json`, "utf8")) as
  { tile: number; boxes: [number, number][] };
const data = new Uint8Array(png.data);
gradeSheet(data, png.width, png.height, meta.tile, meta.boxes, biome.tint, FLOOR_GRADE);
const [bx, by] = meta.boxes[0]!; // the all-floor corner mask
const t = meta.tile;
const tile = new Uint8Array(t * t * 4);
for (let y = 0; y < t; y++) for (let x = 0; x < t; x++) {
  const s = ((by + y) * png.width + (bx + x)) * 4;
  tile.set(data.subarray(s, s + 4), (y * t + x) * 4);
}
writePng(out, t, t, tile);
console.log(`wrote ${out}: ${biome.tileset} all-floor tile, ${t}x${t}, graded with tint ${biome.tint}`);
