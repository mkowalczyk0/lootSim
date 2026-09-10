/**
 * `npx esbuild art/characters/candidates.ts --bundle --platform=node --format=esm \
 *   --outfile=node_modules/.cache/cand.mjs && node node_modules/.cache/cand.mjs`
 *
 * The hero-candidate contact sheet: three exposed-head passes measured and drawn standing
 * on real floors next to the monsters they have to share a frame with.
 *
 * ## Why this file exists rather than a hand-scan
 *
 * Five hero passes have been rejected and the figures quoted for two of them were computed
 * by hand and were wrong both times. Every number on the sheet this writes is derived from
 * the committed PNG: trimmed size, whole-sprite colour count, head-region colour count and
 * the head/body mean-luminance comparison §1.4c asks for, and the density ratio against the
 * floor's fixed 2.0 world units per art pixel.
 *
 * ## The two axes, and which one has actually been predictive
 *
 * `density = 2 / worldScale = 2h / worldHeight`, so the two levers the direction names —
 * cut the art-pixel count, or let the sprite occupy more world — are one equation and a
 * candidate can be aimed at a ratio exactly instead of guessed toward one.
 *
 * But the ratio is a proxy and flat shading breaks it: a hooded candidate measured 4.19x
 * (worse) while reading better, because its whole-sprite colour count fell 40 -> 13. The
 * owner's rejections have tracked **information density — colour count per region** — not
 * pixels per world unit. So this prints colour count first and the ratio second, in that
 * order, on purpose.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { decodePng } from "../../tools/png";
import { ATLAS, SPRITE_OVERRIDES, TILESETS } from "../../src/render/atlas/manifest";
import { FLOOR_GRADE, gradeSheet } from "../../src/render/grade";
import { BIOMES } from "../../src/data/biomes";

interface Img { w: number; h: number; rgba: Uint8Array }

/** `render/tilemap.ts`'s STAMP: a sheet tile covers this many world units. */
const TILE_WORLD = 32;
/** The floor's own density: 16 texels across a 32-unit cell. The anchor everything is measured against. */
const FLOOR_DENSITY = TILE_WORLD / 16;
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
    Buffer.from(img.rgba.buffer, img.rgba.byteOffset + y * img.w * 4, img.w * 4)
      .copy(raw, y * (img.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]));
}

function loadPng(path: string): Img {
  const png = decodePng(readFileSync(path));
  return { w: png.width, h: png.height, rgba: new Uint8Array(png.data) };
}

// --- measurement -----------------------------------------------------------

/** Drop fully-transparent margins. The manifest's `w`/`h` are the trimmed size. */
function trim(img: Img): Img {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.rgba[(y * img.w + x) * 4 + 3]! > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return img;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    rgba.set(img.rgba.subarray(((y + y0) * img.w + x0) * 4, ((y + y0) * img.w + x0 + w) * 4), y * w * 4);
  }
  return { w, h, rgba };
}

/** Opaque pixels in a region, as packed RGB keys. Alpha < 128 is not a colour. */
function pixelsIn(img: Img, y0: number, y1: number): number[] {
  const out: number[] = [];
  for (let y = Math.max(0, y0); y < Math.min(img.h, y1); y++) for (let x = 0; x < img.w; x++) {
    const s = (y * img.w + x) * 4;
    if (img.rgba[s + 3]! < 128) continue;
    out.push((img.rgba[s]! << 16) | (img.rgba[s + 1]! << 8) | img.rgba[s + 2]!);
  }
  return out;
}

const lum = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
const mean = (v: readonly number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

interface Measured {
  readonly colours: number;
  readonly headColours: number;
  readonly headLum: number;
  readonly bodyLum: number;
  readonly headPx: number;
  /** The most saturated colour on the sprite, 0-100 — the hot-accent detector. */
  readonly accent: number;
  readonly accentHex: string;
}

/**
 * HSV saturation x value, 0-100. art-style-guide §1.4/§19: a monster's palette is low and
 * dirty and the ONE saturated colour is the part looking at you; the hero is the character
 * that rule forbids an accent on outright — v3 was rejected partly for exactly this (two
 * flat saturated blue eye bars). Counting colours does not catch it, because one bright
 * pixel pair costs one colour. Measuring it does.
 */
function chroma(c: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : ((mx - mn) / mx) * (mx / 255) * 100;
}

/**
 * §1.4c: the head is a region and must not out-inform the rest of the body. The head band
 * is the top 30% of the figure — a proportion, not a pixel count, so it means the same
 * thing on a 30px candidate and on the 57px sprite it is being compared against.
 */
function measure(img: Img): Measured {
  const headEnd = Math.max(1, Math.round(img.h * 0.3));
  const head = pixelsIn(img, 0, headEnd);
  const body = pixelsIn(img, headEnd, img.h);
  const all = pixelsIn(img, 0, img.h);
  // A colour has to cover at least two pixels to count as an accent — a single stray
  // pixel from the generator's dithering is noise, not a design decision.
  const counts = new Map<number, number>();
  for (const c of all) counts.set(c, (counts.get(c) ?? 0) + 1);
  let accent = 0, accentHex = "—";
  for (const [c, n] of counts) {
    if (n < 2) continue;
    const s = chroma(c);
    if (s > accent) { accent = s; accentHex = `#${c.toString(16).padStart(6, "0")}`; }
  }
  return {
    colours: new Set(all).size,
    headColours: new Set(head).size,
    headLum: mean(head.map(lum)),
    bodyLum: mean(body.map(lum)),
    headPx: head.length,
    accent,
    accentHex,
  };
}

// --- the scene (the real stamping path, as tools/inworld.ts does it) --------

interface Sheet { readonly img: Img; readonly boxes: readonly (readonly [number, number])[]; readonly tile: number }

function gradedFloor(id: string, tint: string): Sheet {
  const png = decodePng(readFileSync(`src/render/atlas/tilesets/${id}.png`));
  const meta = JSON.parse(readFileSync(`src/render/atlas/tilesets/${id}.json`, "utf8")) as
    { tile: number; boxes: [number, number][] };
  const data = new Uint8Array(png.data);
  gradeSheet(data, png.width, png.height, meta.tile, meta.boxes, tint, FLOOR_GRADE);
  return { img: { w: png.width, h: png.height, rgba: data }, boxes: meta.boxes, tile: meta.tile };
}

interface Figure { readonly img: Img; readonly worldScale: number; readonly feet: number; readonly x: number }

function scene(sheet: Sheet, figures: readonly Figure[], worldW: number, worldH: number, groundY: number): Img {
  const W = Math.round(worldW * ZOOM), H = Math.round(worldH * ZOOM);
  const rgba = new Uint8Array(W * H * 4);
  const floor = sheet.boxes[0]!;
  const texel = TILE_WORLD / sheet.tile;
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
        for (let c = 0; c < 3; c++) rgba[d + c] = Math.round(f.img.rgba[s + c]! * a + rgba[d + c]! * (1 - a));
      }
    }
  }
  return { w: W, h: H, rgba };
}

function stack(rows: readonly Img[]): Img {
  const w = Math.max(...rows.map((r) => r.w));
  const h = rows.reduce((a, r) => a + r.h, 0);
  const rgba = new Uint8Array(w * h * 4);
  let oy = 0;
  for (const r of rows) {
    for (let y = 0; y < r.h; y++) rgba.set(r.rgba.subarray(y * r.w * 4, (y + 1) * r.w * 4), ((oy + y) * w) * 4);
    oy += r.h;
  }
  return { w, h, rgba };
}

// --- the candidates --------------------------------------------------------

interface Candidate {
  readonly file: string;
  readonly label: string;
  /** Which lever(s) this candidate pulls, for the sheet. */
  readonly lever: string;
  /** Intended drawn height in world units. 32 is what ships today; a floor tile is 32. */
  readonly worldHeight: number;
}

const CANDIDATES: readonly Candidate[] = [
  { file: "A-cutink",    label: "A  cut the ink",     lever: "colour only",        worldHeight: 32 },
  { file: "B-coarsetall", label: "B  coarse + tall",  lever: "world height only",  worldHeight: 58 },
  { file: "C-both",      label: "C  both levers",     lever: "colour + height",    worldHeight: 52 },
];

/** The portrait band, re-derived here so the sheet carries it (see src/ui/portrait.ts). */
const BODY_H = 22, HERO_PORTRAIT_BODY_PX = 176, STYLE_PORTRAIT_BODY_PX = 154, MAX_SPREAD = 0.12;
const pScale = (b: number, t: number) => Math.max(1, Math.round(t / Math.max(1, b)));
const pSpread = (a: number, b: number, t: number) => {
  const A = a * pScale(a, t), B = b * pScale(b, t);
  return Math.abs(A - B) / Math.max(A, B);
};
function legalBands(): string {
  const legal: number[] = [];
  for (let h = 16; h <= 160; h++) {
    if (pSpread(BODY_H, h, HERO_PORTRAIT_BODY_PX) <= MAX_SPREAD
      && pSpread(BODY_H, h, STYLE_PORTRAIT_BODY_PX) <= MAX_SPREAD) legal.push(h);
  }
  const bands: string[] = [];
  for (let i = 0; i < legal.length;) {
    let j = i;
    while (j + 1 < legal.length && legal[j + 1]! === legal[j]! + 1) j++;
    bands.push(legal[i] === legal[j] ? `${legal[i]}` : `${legal[i]}-${legal[j]}`);
    i = j + 1;
  }
  return bands.join(", ");
}

// --- main ------------------------------------------------------------------

const DIR = "art/characters/candidates";
// The candidate PNGs are deliberately NOT committed — they are three open options waiting
// on an owner's pick, and committing a direction nobody chose is what gives the next
// session something to mistake for a starting point. The instrument is committed without
// them, so on a clean checkout this still runs and still measures the shipped hero and the
// cast; it just has no candidates to compare them against. Drop PNGs in here to change that.
let available: Set<string>;
try {
  available = new Set(readdirSync(DIR).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)));
} catch {
  available = new Set();
}

/** The control: what ships today, measured by exactly the same code. */
const shippedId = SPRITE_OVERRIDES.hero!;
const shippedMeta = ATLAS[shippedId]!;
const shipped = trim(loadPng(`src/render/atlas/characters/${shippedId}.png`));
const shippedM = measure(shipped);

console.log(`\nfloor density: ${FLOOR_DENSITY} world units per art pixel — the anchor. Lower = finer than the world.`);
console.log("density = 2h / worldHeight, so both levers are one equation.\n");
console.log("  candidate            lever                px      COLOURS  head col  hot accent      head/body lum   worldScale  world h  tiles  density");
console.log("  " + "-".repeat(144));

function row(label: string, lever: string, img: Img, m: Measured, worldHeight: number): void {
  const worldScale = worldHeight / img.h;
  const density = FLOOR_DENSITY / worldScale;
  console.log(
    `  ${label.padEnd(20)} ${lever.padEnd(20)} ${`${img.w}x${img.h}`.padEnd(8)}`
    + ` ${String(m.colours).padEnd(8)} ${String(m.headColours).padEnd(9)}`
    + ` ${`${m.accent.toFixed(0)} ${m.accentHex}`.padEnd(15)}`
    + ` ${`${m.headLum.toFixed(0)}/${m.bodyLum.toFixed(0)}`.padEnd(15)}`
    + ` ${worldScale.toFixed(4).padEnd(11)} ${worldHeight.toFixed(0).padEnd(8)}`
    + ` ${(worldHeight / TILE_WORLD).toFixed(2).padEnd(6)} ${density.toFixed(2)}x finer`,
  );
}

row("v4  SHIPPED (control)", "—", shipped, shippedM, shippedMeta.h * shippedMeta.worldScale);

const figuresFor: { cand: Candidate; img: Img; m: Measured; worldScale: number }[] = [];
for (const c of CANDIDATES) {
  if (!available.has(c.file)) { console.log(`  ${c.label.padEnd(20)} — not generated yet, skipped`); continue; }
  const img = trim(loadPng(`${DIR}/${c.file}.png`));
  const m = measure(img);
  row(c.label, c.lever, img, m, c.worldHeight);
  const legalH = pSpread(BODY_H, img.h, HERO_PORTRAIT_BODY_PX) <= MAX_SPREAD
    && pSpread(BODY_H, img.h, STYLE_PORTRAIT_BODY_PX) <= MAX_SPREAD;
  if (!legalH) {
    console.log(`      ^ WARNING: art height ${img.h} is in a town-portrait DEAD ZONE.`
      + ` Pad to the nearest legal height before shipping this one (free — a transparent row).`);
  }
  figuresFor.push({ cand: c, img, m, worldScale: c.worldHeight / img.h });
}

// The monsters each candidate has to share a frame with — the comparison the sheet exists
// for. A candidate is judged standing next to these, never alone on a checkerboard.
const MONSTERS = ["grunt", "archer", "brute", "caster", "swarmer"] as const;
console.log("\n  the cast it has to stand next to (unchanged):");
for (const name of MONSTERS) {
  const id = SPRITE_OVERRIDES[name];
  const meta = id ? ATLAS[id] : undefined;
  if (!meta) continue;
  console.log(`    ${id!.padEnd(32)} world h ${(meta.h * meta.worldScale).toFixed(1).padEnd(6)}`
    + ` (${((meta.h * meta.worldScale) / TILE_WORLD).toFixed(2)} tiles)  ${(FLOOR_DENSITY / meta.worldScale).toFixed(2)}x finer`);
}

console.log(`\n  legal hero ART-pixel heights (both town portraits within ${MAX_SPREAD * 100}%): ${legalBands()}`);
console.log("  worldScale is NOT read by either portrait — drawn world height is free of them.");

// --- render ----------------------------------------------------------------

const biome = BIOMES.find((b) => b.name === "Training Grounds");
if (!biome?.tileset || !TILESETS[biome.tileset]) throw new Error("no floor tileset to stand on");
const sheet = gradedFloor(biome.tileset, biome.tint);

const monsterFigures = (x0: number): { figs: Figure[]; next: number } => {
  const figs: Figure[] = [];
  let x = x0;
  for (const name of MONSTERS) {
    const id = SPRITE_OVERRIDES[name];
    const meta = id ? ATLAS[id] : undefined;
    if (!meta || !id) continue;
    figs.push({ img: loadPng(`src/render/atlas/${meta.id.startsWith("boss") ? "bosses" : "monsters"}/${id}.png`), worldScale: meta.worldScale, feet: meta.feet, x });
    x += 40;
  }
  return { figs, next: x };
};

const rows: Img[] = [];
{ // control row: what ships today
  const { figs, next } = monsterFigures(70);
  rows.push(scene(sheet, [
    { img: shipped, worldScale: shippedMeta.worldScale, feet: shippedMeta.feet, x: 28 },
    ...figs,
  ], next + 12, 84, 72));
  var worldW = next + 12;
}
for (const f of figuresFor) {
  const { figs } = monsterFigures(70);
  rows.push(scene(sheet, [
    { img: f.img, worldScale: f.worldScale, feet: 0.03, x: 28 },
    ...figs,
  ], worldW, 84, 72));
}
writePng("hero-candidates.png", stack(rows));
console.log(`\nwrote hero-candidates.png — row 1 is the shipped v4 control, then ${figuresFor.length} candidate(s),`);
console.log("each standing on a real graded floor next to the unchanged monster cast.");
