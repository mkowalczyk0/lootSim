/**
 * `npm run inworld` — draw the cast standing on real floors, at true world scale, and
 * print the pixel density of everything in the frame.
 *
 * ## Why this exists
 *
 * The v4 hero was reviewed as a sprite on a transparent background, approved, and then
 * rejected on sight the moment it was seen in the game: *"too realistic, I want the
 * character to fit into the world."* The cause was measurable and nobody had measured it —
 * he carried roughly 3.5x the pixel density of the ground he stood on. A contact sheet
 * cannot show that, because the thing he was failing against was not in the picture.
 *
 * So: **a character or monster is judged standing on a floor, not on a checkerboard.** The
 * same applies to §1.5 comparisons (a sniper that reads as a grunt is a comparison problem)
 * and to any future density call.
 *
 * ## What "density" means here, and why it is the number to watch
 *
 * `worldScale` is world units per art pixel, so it *is* the density figure — and lower
 * means finer. The floor is the anchor: `render/tilemap.ts` stamps a 16-texel sheet tile
 * across a 32-unit cell, so every floor in the game is exactly **2.0 world units per art
 * pixel**. A sprite far below that carries more detail per unit of world than the world
 * does, which is what reads as "doesn't belong".
 *
 * ## Fidelity
 *
 * This is the real stamping path, not an approximation: the sheet goes through
 * `gradeSheet`/`FLOOR_GRADE` with the biome's own tint exactly as `gradedTileset` does,
 * tiles are stamped at the 32-unit pitch, and every sprite is sampled nearest-neighbour at
 * its true fractional scale — uneven pixels included, because that is what the game draws.
 * It is still a reimplementation of the render path rather than a screenshot; it cannot
 * catch a bug that lives in `draw.ts` itself.
 */

import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { decodePng } from "./png";
import { ATLAS, SPRITE_OVERRIDES, TILESETS } from "../src/render/atlas/manifest";
import { FLOOR_GRADE, gradeSheet } from "../src/render/grade";
import { BIOMES } from "../src/data/biomes";

interface Img { readonly w: number; readonly h: number; readonly rgba: Uint8Array }

/** `render/tilemap.ts`'s STAMP: a sheet tile covers this many world units. */
const TILE_WORLD = 32;
/** Screen pixels per world unit. 5 makes a 32-unit tile 160px — big enough to judge. */
const ZOOM = 5;

// --- png out ---------------------------------------------------------------

let CRC: number[] | null = null;
function crc32(b: Buffer): number {
  if (!CRC) {
    CRC = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC.push(c >>> 0);
    }
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
function writePng(path: string, img: Img): void {
  const raw = Buffer.alloc(img.h * (img.w * 4 + 1));
  for (let y = 0; y < img.h; y++) {
    raw[y * (img.w * 4 + 1)] = 0;
    Buffer.from(img.rgba.subarray(y * img.w * 4, (y + 1) * img.w * 4))
      .copy(raw, y * (img.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]));
}

// --- inputs ----------------------------------------------------------------

function atlasPng(id: string): Img {
  // The atlas is organised by category folder; the id's first segment names it well
  // enough to find, and the set of folders is small and stable.
  const dirs = ["characters", "monsters", "bosses", "props", "icons", "weapons"];
  for (const d of dirs) {
    try {
      const png = decodePng(readFileSync(`src/render/atlas/${d}/${id}.png`));
      return { w: png.width, h: png.height, rgba: new Uint8Array(png.data) };
    } catch { /* try the next folder */ }
  }
  throw new Error(`no committed PNG for ${id}`);
}

interface Sheet { readonly img: Img; readonly boxes: readonly (readonly [number, number])[]; readonly tile: number }

function gradedFloor(id: string, tint: string): Sheet {
  const png = decodePng(readFileSync(`src/render/atlas/tilesets/${id}.png`));
  const meta = JSON.parse(readFileSync(`src/render/atlas/tilesets/${id}.json`, "utf8")) as
    { tile: number; boxes: [number, number][] };
  const data = new Uint8Array(png.data);
  gradeSheet(data, png.width, png.height, meta.tile, meta.boxes, tint, FLOOR_GRADE);
  return { img: { w: png.width, h: png.height, rgba: data }, boxes: meta.boxes, tile: meta.tile };
}

interface Figure {
  readonly img: Img;
  /** World units per art pixel — the density number. */
  readonly worldScale: number;
  readonly feet: number;
  /** World x of the figure's centre. */
  readonly x: number;
}

// --- the scene -------------------------------------------------------------

function scene(sheet: Sheet, figures: readonly Figure[], worldW: number, worldH: number, groundY: number): Img {
  const W = Math.round(worldW * ZOOM), H = Math.round(worldH * ZOOM);
  const rgba = new Uint8Array(W * H * 4);
  const floor = sheet.boxes[0]!;               // the all-floor corner mask
  const texel = TILE_WORLD / sheet.tile;       // world units per sheet texel (= 2)

  for (let sy = 0; sy < H; sy++) for (let sx = 0; sx < W; sx++) {
    const wx = sx / ZOOM, wy = sy / ZOOM;
    const tx = Math.floor((((wx % TILE_WORLD) + TILE_WORLD) % TILE_WORLD) / texel);
    const ty = Math.floor((((wy % TILE_WORLD) + TILE_WORLD) % TILE_WORLD) / texel);
    const s = ((floor[1]! + ty) * sheet.img.w + (floor[0]! + tx)) * 4;
    const d = (sy * W + sx) * 4;
    rgba[d] = sheet.img.rgba[s]!; rgba[d + 1] = sheet.img.rgba[s + 1]!;
    rgba[d + 2] = sheet.img.rgba[s + 2]!; rgba[d + 3] = 255;
  }

  for (const f of figures) {
    const artW = f.img.w * f.worldScale, artH = f.img.h * f.worldScale;
    const left = f.x - artW / 2, top = groundY + f.feet * artH - artH;
    for (let sy = Math.max(0, Math.floor(top * ZOOM)); sy < Math.min(H, Math.ceil((top + artH) * ZOOM)); sy++) {
      for (let sx = Math.max(0, Math.floor(left * ZOOM)); sx < Math.min(W, Math.ceil((left + artW) * ZOOM)); sx++) {
        const ax = Math.floor(((sx + 0.5) / ZOOM - left) / f.worldScale);
        const ay = Math.floor(((sy + 0.5) / ZOOM - top) / f.worldScale);
        if (ax < 0 || ay < 0 || ax >= f.img.w || ay >= f.img.h) continue;
        const s = (ay * f.img.w + ax) * 4;
        const a = f.img.rgba[s + 3]! / 255;
        if (a <= 0) continue;
        const d = (sy * W + sx) * 4;
        for (let c = 0; c < 3; c++) {
          rgba[d + c] = Math.round(f.img.rgba[s + c]! * a + rgba[d + c]! * (1 - a));
        }
      }
    }
  }
  return { w: W, h: H, rgba };
}

/** Stack scenes vertically into one sheet. */
function stack(rows: readonly Img[]): Img {
  const w = Math.max(...rows.map((r) => r.w));
  const h = rows.reduce((a, r) => a + r.h, 0);
  const rgba = new Uint8Array(w * h * 4);
  let oy = 0;
  for (const r of rows) {
    for (let y = 0; y < r.h; y++) {
      rgba.set(r.rgba.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((oy + y) * w) * 4);
    }
    oy += r.h;
  }
  return { w, h, rgba };
}

// --- main ------------------------------------------------------------------

/** The cast, in the order they stand: the hero first, then the five monster roles. */
const CAST = ["hero", "grunt", "archer", "brute", "caster", "swarmer"] as const;

/** A few floors that span the palette range, by biome name. */
const FLOORS = ["Limbo", "Heresy", "The Veil"];

const figures: Figure[] = [];
console.log(`floor: ${TILE_WORLD / 16} world units per art pixel (16 texels across a ${TILE_WORLD}-unit cell)`);
console.log("\n  sprite                          px      worldScale  world h   density vs floor");
let x = 26;
for (const name of CAST) {
  const id = SPRITE_OVERRIDES[name];
  if (!id) { console.log(`  ${name.padEnd(30)} — still procedural, skipped`); continue; }
  const meta = ATLAS[id];
  if (!meta) continue;
  const img = atlasPng(id);
  figures.push({ img, worldScale: meta.worldScale, feet: meta.feet, x });
  const ratio = 2 / meta.worldScale;
  console.log(
    `  ${id.padEnd(30)} ${`${meta.w}x${meta.h}`.padEnd(8)} ${meta.worldScale.toFixed(4).padEnd(11)}`
    + ` ${(meta.h * meta.worldScale).toFixed(1).padEnd(9)} ${ratio.toFixed(1)}x finer`,
  );
  x += 38;
}
const worldW = x + 12;

const rows: Img[] = [];
for (const biomeName of FLOORS) {
  const biome = BIOMES.find((b) => b.name === biomeName);
  if (!biome?.tileset || !TILESETS[biome.tileset]) {
    console.log(`  (no tileset for ${biomeName}, skipped)`);
    continue;
  }
  rows.push(scene(gradedFloor(biome.tileset, biome.tint), figures, worldW, 74, 62));
}
if (!rows.length) throw new Error("no floors rendered");
const out = stack(rows);
writePng("inworld-sheet.png", out);
console.log(`\nwrote inworld-sheet.png (${out.w}x${out.h}) — ${rows.length} floors, ${figures.length} figures`);
console.log("A sprite far below the floor's 2.0 carries more detail per world unit than the");
console.log("world does. That is what reads as 'doesn't belong' — judge it here, not on a sheet.");
