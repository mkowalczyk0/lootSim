/**
 * Raw PixelLab generation -> committed atlas PNG, for the four raid bosses. Run it to
 * rebuild every one of them from the `.raw.png` files next to this script:
 *
 *   npx esbuild art/bosses/finish.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/bossfinish.mjs && \
 *     node node_modules/.cache/bossfinish.mjs
 *
 * It writes `src/render/atlas/bosses/*.png` and prints the `ATLAS` row each one needs —
 * including the `worldScale` that lands it on its target world height, which is the one
 * number here that must not be eyeballed (see below).
 *
 * ## Why a script rather than a hand-edit — the pattern for every art batch
 *
 * **A treatment that lives in a script survives a reroll; a treatment applied by hand is
 * lost the first time anyone regenerates one sprite.** That is the whole argument, and it
 * is meant to generalise: any art batch that needs finishing should ship the finishing as
 * a runnable file next to the raws, not as an undocumented set of edits baked into a PNG.
 *
 * Two of these four needed a pass. Everything the committed PNG has that the generation
 * didn't is in this file, so re-rolling any single boss re-applies the same treatment and
 * the ATLAS rows are re-derived rather than re-typed.
 *
 * ## The hot accent (art-style-guide §1.4)
 *
 * A boss's palette is low and dirty and the *only* saturated colour is the part looking at
 * you. Three of the four came back with that already — the Ferryman's cold eye, the
 * Minotaur's violet eyes, the Queen's ember mask. The Tyrant came back with no lit region
 * at all: its visor band generated as dull brass trim (#f9df7d/#e1ba55/#cb9a46), which
 * reads as decoration rather than as something looking at you, and left the pale wings as
 * the brightest mass on the sprite. `hotAccent` lifts that band to the holy element colour
 * and dims the wing highlights a touch so the eye goes to the helm. This is the documented
 * "aseprite adds the hot accent" step of the pipeline, done deterministically.
 *
 * **A standing prompt lesson, recorded in the style guide too:** PixelLab biases hard
 * toward clean heroic armour. Both armoured subjects here (Queen, Tyrant) first came back
 * bright and polished — the Queen with a saturated red plume, a *second* hot colour, which
 * §1.4 forbids outright. Re-prompting with an explicit clamp fixed the palette; the Tyrant
 * still lost its accent, hence this pass.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

// --- png ------------------------------------------------------------------

interface Img { w: number; h: number; rgba: Uint8Array }

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decode(buf: Buffer): Img {
  let w = 0, h = 0, colorType = -1;
  const idat: Buffer[] = [];
  let o = 8;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]!; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8Array(w * h * 4);
  const stride = w * bpp;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp]! : 0, b = prev[i]!, c = i >= bpp ? prev[i - bpp]! : 0;
      const x = line[i]!;
      cur[i] = (filter === 0 ? x : filter === 1 ? x + a : filter === 2 ? x + b
        : filter === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c)) & 255;
    }
    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4;
      rgba[d] = cur[s]!; rgba[d + 1] = cur[s + 1]!; rgba[d + 2] = cur[s + 2]!;
      rgba[d + 3] = bpp === 4 ? cur[s + 3]! : 255;
    }
    prev = cur;
  }
  return { w, h, rgba };
}

let T: number[] | null = null;
function crc32(b: Buffer): number {
  if (!T) { T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T.push(c >>> 0); } }
  let c = 0xffffffff;
  for (const byte of b) c = T[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encode(img: Img): Buffer {
  const raw = Buffer.alloc(img.h * (img.w * 4 + 1));
  for (let y = 0; y < img.h; y++) {
    raw[y * (img.w * 4 + 1)] = 0;
    Buffer.from(img.rgba.subarray(y * img.w * 4, (y + 1) * img.w * 4)).copy(raw, y * (img.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- passes ---------------------------------------------------------------

/** Trim to the opaque bounding box — the atlas convention: a boss stands on its own row. */
function trim(img: Img): Img {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++)
    if (img.rgba[(y * img.w + x) * 4 + 3]! > 8) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((y + y0) * img.w + (x + x0)) * 4;
    out.set(img.rgba.subarray(s, s + 4), (y * w + x) * 4);
  }
  return { w, h, rgba: out };
}

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Lift an already-goldish band inside `box` to `color` — the §1.4 hot accent. Only pixels
 * the generation already drew as bright warm metal are touched, so the accent lands on the
 * visor the model actually drew rather than on a rectangle guessed from outside.
 */
function hotAccent(img: Img, box: [number, number, number, number], color: string): number {
  const [x0, y0, x1, y1] = box;
  const [r, g, b] = hex(color);
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * img.w + x) * 4;
    if (img.rgba[i + 3]! < 8) continue;
    const R = img.rgba[i]!, G = img.rgba[i + 1]!, B = img.rgba[i + 2]!;
    if (R > 190 && G > 140 && B < 150 && R > B + 60) {
      img.rgba[i] = r; img.rgba[i + 1] = g; img.rgba[i + 2] = b; n++;
    }
  }
  return n;
}

/**
 * Roll off highlights above `ceiling` toward `keep` of their excess. The Tyrant's wings
 * generated pale enough to out-read its own head; this pulls the brightest mass down so
 * the accent above is the brightest thing on the sprite, which is the entire point of it.
 */
function dimHighlights(img: Img, ceiling: number, keep: number, skip: Set<number>): void {
  for (let i = 0; i < img.rgba.length; i += 4) {
    if (img.rgba[i + 3]! < 8 || skip.has(i)) continue;
    const L = 0.299 * img.rgba[i]! + 0.587 * img.rgba[i + 1]! + 0.114 * img.rgba[i + 2]!;
    if (L <= ceiling) continue;
    const f = (ceiling + (L - ceiling) * keep) / L;
    for (let c = 0; c < 3; c++) img.rgba[i + c] = Math.round(img.rgba[i + c]! * f);
  }
}

/**
 * Pull competing saturated colour down, everywhere except `keepBox` (the accent).
 *
 * §1.4 allows exactly one saturated colour per boss and the Queen came back with two: her
 * ember mask, and a saturated red running through the plume, tabard and trim. Measured off
 * the generation, the red outnumbered the accent 362 pixels to 55 — so the *second* colour
 * was six times louder than the one that is supposed to be the only one. This desaturates
 * and darkens those reds toward dried blood, which keeps the war-goddess reading without
 * letting anything compete with what is looking at you.
 */
function muteRivalHue(
  img: Img, keepBox: [number, number, number, number], drop: number, darken: number,
): number {
  const [kx0, ky0, kx1, ky1] = keepBox;
  let n = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (x >= kx0 && x <= kx1 && y >= ky0 && y <= ky1) continue;
    const i = (y * img.w + x) * 4;
    if (img.rgba[i + 3]! < 8) continue;
    const r = img.rgba[i]!, g = img.rgba[i + 1]!, b = img.rgba[i + 2]!;
    if (!(r > b + 60 && g < 110 && r > 90)) continue;
    const grey = 0.299 * r + 0.587 * g + 0.114 * b;
    img.rgba[i] = Math.round((r + (grey - r) * drop) * darken);
    img.rgba[i + 1] = Math.round((g + (grey - g) * drop) * darken);
    img.rgba[i + 2] = Math.round((b + (grey - b) * drop) * darken);
    n++;
  }
  return n;
}

// --- the four -------------------------------------------------------------

/**
 * `world` is the world height the encounter had *before* this art existed — every raid
 * drew the PNG of the floor boss it borrows, so these are that sprite's `h * worldScale`.
 * Preserving them is why the scales look arbitrary: telegraph radii, arena sizing and
 * camera framing are all tuned against these numbers elsewhere, and none of them may move
 * because a sprite got redrawn.
 *
 * **The `h * worldScale` arithmetic in each comment is HISTORY and does not recompute.**
 * Two of those borrowed rows have since been animated on padded canvases — `boss.warden`
 * is 124px tall now, not 89, and `boss.corrupted-saint` 122, not 92 — because a raised arm
 * needs headroom the resting pose does not. `worldScale` is world units per PIXEL and stays
 * put through that (see `art/anim/strip.py`), so the drawn character never moved and these
 * constants are still the right ones; but multiplying today's `h` by today's `worldScale`
 * will not reproduce them, and is not supposed to.
 */
const BOSSES: Array<{
  id: string; world: number; borrowed: string;
  accent?: string; accentBox?: [number, number, number, number];
  /** Box to protect while `muteRivalHue` quietens a second saturated colour elsewhere. */
  keepBox?: [number, number, number, number];
}> = [
  // was boss.warden (89 * 1.12)
  { id: "boss.ferryman", world: 99.7, borrowed: "boss.warden (Warden)" },
  // was boss.herald-unspoken (94 * 1.17)
  { id: "boss.war-queen", world: 110.0, borrowed: "boss.herald-unspoken (Herald)", keepBox: [40, 14, 58, 30] },
  // was boss.gravebound-colossus (87 * 1.54)
  { id: "boss.labyrinth-minotaur", world: 134.0, borrowed: "boss.gravebound-colossus (Colossus)" },
  // was boss.corrupted-saint (92 * 1.09). The one that needed an accent painted in.
  { id: "boss.exiled-tyrant", world: 100.3, borrowed: "boss.corrupted-saint (Choir)", accent: "#fde047", accentBox: [45, 13, 55, 21] },
];

for (const spec of BOSSES) {
  const img = trim(decode(readFileSync(`art/bosses/${spec.id}.raw.png`)));
  let note = "";
  if (spec.keepBox) {
    const n = muteRivalHue(img, spec.keepBox, 0.72, 0.78);
    note += `  (muted ${n}px of rival saturated red toward dried blood)`;
  }
  if (spec.accent && spec.accentBox) {
    const lit = new Set<number>();
    const [x0, y0, x1, y1] = spec.accentBox;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) lit.add((y * img.w + x) * 4);
    const n = hotAccent(img, spec.accentBox, spec.accent);
    dimHighlights(img, 150, 0.55, lit);
    note = `  (hot accent: ${n}px lifted to ${spec.accent}, highlights rolled off)`;
  }
  writeFileSync(`src/render/atlas/bosses/${spec.id}.png`, encode(img));
  const worldScale = Number((spec.world / img.h).toFixed(4));
  console.log(
    `"${spec.id}": { id: "${spec.id}", w: ${img.w}, h: ${img.h}, worldScale: ${worldScale}, feet: 0.03 },`
    + `\n    // ${img.h} * ${worldScale} = ${(img.h * worldScale).toFixed(1)} — the world height of ${spec.borrowed}${note}`,
  );
}
