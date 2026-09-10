/**
 * Raw PixelLab generation -> committed atlas PNG, for the Tower's five boss sprites. Until
 * this batch, `towerBossSpec` (src/data/tower.ts) never overrode `sprite`, so all five
 * "bosses" drew whichever Delve encounter they borrowed phases from — Heaven furnished by
 * Hell's own art, the same defect the Tower's monster roster had before
 * `art/monsters/finish-tower.ts`. Run this to rebuild every sprite from the `.raw.png`
 * files next to this script:
 *
 *   npx esbuild art/bosses/finish-tower.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/finishtowerbosses.mjs && \
 *     node node_modules/.cache/finishtowerbosses.mjs
 *
 * It writes `src/render/atlas/bosses/tower.boss.*.png` and prints the `ATLAS` row and
 * `worldScale` each one needs to land on its *preserved* target world height — the exact
 * footprint the template it used to borrow already had (Cherub 99.68, Virtue 100.28,
 * Power 133.98, Throne 109.98, Nameless 112.23), so telegraph radii and arena framing
 * tuned against those numbers don't move.
 *
 * ## Four of five: the same "clean heroic armour" bias, the same fix
 *
 * All four generated as a single saturated gold hue smeared across the *entire* garment —
 * 20.4% to 55.0% hot, against the shipped Reliquary roster's own 0.4%-3.0% band — exactly
 * the failure `art/monsters/finish-tower.ts` already documents and `muteHot` already fixes.
 * Two needed the accent painted somewhere it didn't exist (Cherub and Power generated with
 * plain dark eye-slit voids, same as the monsters' Power-at-Arms/Throne-Bearer); Virtue
 * already had a natural, small, thematically-correct accent (a chest emblem, 0.78% of the
 * sprite) to spare from the mute; Throne generated with a genuine accent already lit — but
 * in cyan (200°), the one boss out of five not reading Heaven's own gold. Four gold-eyed
 * bosses and one cyan-eyed one would read as an accident, not a design choice, so `recolor`
 * pushes Throne's eyes to the same `#fde047` the Tower's monster roster already uses.
 *
 * ## The fifth: PixelLab's character generator does not honour "mostly absent"
 *
 * "What Sits Above the Orders" was prompted for an outline-only figure, negative space,
 * "almost no fill" — Blinding Heights reads as near-white glare over unlit black, and a
 * design that depends on interior fill would be invisible there, which is why the prompt
 * asked for the opposite. The generator returned a fully solid, fully shaded, conventionally
 * rendered pale humanoid instead — 0% hot, no line-work halo, no wings, no empty face-gap,
 * every interior pixel opaque. This is worth recording as its own lesson, distinct from the
 * "clean heroic armour" bias above: **a soft-guidance style hint that asks the model to
 * OMIT rather than depict does not survive standard mode.** "Flat shading" or "lineless"
 * might nudge it, but the model is trained to render a creature, and "mostly isn't there" is
 * not a creature description — it's an editing instruction. Expect this again for any
 * ghost, wraith or Abyss-flavoured "barely there" design; don't re-spend a generation on it
 * without a reference image or a v3 image-to-image pass first.
 *
 * `hollowOut` gets there by post-processing the solid render instead: trace the silhouette
 * edge and recolour it pale bone-white/ivory (the outline inversion the design asked for),
 * crush interior alpha hard except the deepest shadow lines (the "dark ink only" clause),
 * punch the face gap the brief describes, and paint the gold-white eye cluster into the
 * chest as the one accent. Deterministic, reusable on a reroll, and it doesn't gamble a
 * second generation on an instruction class the model has already failed once.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

// --- png --------------------------------------------------------------------------------

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

// --- passes -----------------------------------------------------------------------------

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

function hsv(r: number, g: number, b: number): { h: number; s: number } {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const s = mx === 0 ? 0 : (mx - mn) / mx;
  let hDeg = 0;
  if (mx !== mn) {
    const d = mx - mn;
    if (mx === r) hDeg = ((g - b) / d) % 6;
    else if (mx === g) hDeg = (b - r) / d + 2;
    else hDeg = (r - g) / d + 4;
    hDeg *= 60;
    if (hDeg < 0) hDeg += 360;
  }
  return { h: hDeg, s };
}

/** §1.4's own detector: opaque, saturation > 0.55, brightest channel > 90. */
function isHot(r: number, g: number, b: number): boolean {
  return hsv(r, g, b).s > 0.55 && Math.max(r, g, b) > 90;
}

type Box = [number, number, number, number]; // x0 y0 x1 y1
const inBox = (x: number, y: number, box: Box) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];

/** Pull every "hot" pixel toward a low-saturation target, except inside `keepBoxes`. */
function muteHot(img: Img, keepBoxes: readonly Box[], target: [number, number, number]): number {
  let n = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (keepBoxes.some((b) => inBox(x, y, b))) continue;
    const i = (y * img.w + x) * 4;
    if (img.rgba[i + 3]! < 8) continue;
    const r = img.rgba[i]!, g = img.rgba[i + 1]!, b = img.rgba[i + 2]!;
    if (!isHot(r, g, b)) continue;
    img.rgba[i] = Math.round(r + (target[0] - r) * 0.75);
    img.rgba[i + 1] = Math.round(g + (target[1] - g) * 0.75);
    img.rgba[i + 2] = Math.round(b + (target[2] - b) * 0.75);
    n++;
  }
  return n;
}

/** Light the void: within `box`, every opaque pixel darker than `voidCeiling` becomes `color`. */
function paintAccent(img: Img, box: Box, color: string, voidCeiling = 45): number {
  const [r, g, b] = hex(color);
  let n = 0;
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const i = (y * img.w + x) * 4;
    if (img.rgba[i + 3]! < 128) continue;
    if (Math.max(img.rgba[i]!, img.rgba[i + 1]!, img.rgba[i + 2]!) >= voidCeiling) continue;
    img.rgba[i] = r; img.rgba[i + 1] = g; img.rgba[i + 2] = b; n++;
  }
  return n;
}

/** Hard-recolour every opaque pixel in a tight box, whatever its current hue — for
 * Throne's cyan eyes, already lit, just in the wrong colour family. */
function recolor(img: Img, box: Box, color: string): number {
  const [r, g, b] = hex(color);
  let n = 0;
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const i = (y * img.w + x) * 4;
    if (img.rgba[i + 3]! < 128) continue;
    img.rgba[i] = r; img.rgba[i + 1] = g; img.rgba[i + 2] = b; n++;
  }
  return n;
}

/**
 * Turn a solid render into an outline-and-void figure by post-processing rather than
 * trusting generation to omit fill (see the file header — it doesn't). `edgeColor` is
 * painted, fully opaque, onto every silhouette pixel (opaque with a transparent or
 * out-of-bounds 4-neighbour) — the outline inversion the design asked for.
 *
 * The interior split is NOT a luminance ceiling — a first attempt tried that and it kept
 * nearly the whole body, because this render's own "single color black outline" style
 * draws hard black contour lines around every body part (collarbone, chest, each limb),
 * and most of the figure sits *below* any luminance ceiling low enough to spare the true
 * fill. What actually separates the artist's linework from shading is *local contrast*:
 * a histogram of each interior pixel's max luminance jump to an opaque 4-neighbour on this
 * sprite is sharply bimodal — smooth shading sits under a 50-point jump, real line strokes
 * sit over 160. `lineContrast` (default comfortably between the two) is that test: a pixel
 * over the threshold keeps its own dark colour near-opaque ("dark ink … at the deepest
 * interior shadow lines"); everything else — the actual fill and gradient shading — gets
 * `interiorAlphaMult` crushed onto it ("otherwise almost no fill colour anywhere").
 * `faceGap` is then punched fully transparent — a literal gap in the outline, not a shaded
 * hollow. `accentBox` paints the one hot accent last, always fully opaque, so it isn't
 * touched by anything above.
 */
function hollowOut(
  img: Img,
  edgeColor: string,
  interiorAlphaMult: number,
  lineContrast: number,
  faceGap: Box,
  accentBox: Box,
  accentColor: string,
): void {
  const [er, eg, eb] = hex(edgeColor);
  const isOpaque = (x: number, y: number) => x >= 0 && y >= 0 && x < img.w && y < img.h && img.rgba[(y * img.w + x) * 4 + 3]! >= 128;
  const lum = (x: number, y: number) => {
    const i = (y * img.w + x) * 4;
    return 0.2126 * img.rgba[i]! + 0.7152 * img.rgba[i + 1]! + 0.0722 * img.rgba[i + 2]!;
  };
  const edge = new Uint8Array(img.w * img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!isOpaque(x, y)) continue;
    if (!isOpaque(x - 1, y) || !isOpaque(x + 1, y) || !isOpaque(x, y - 1) || !isOpaque(x, y + 1)) edge[y * img.w + x] = 1;
  }
  const line = new Uint8Array(img.w * img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!isOpaque(x, y) || edge[y * img.w + x]) continue;
    let maxDiff = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (isOpaque(x + dx, y + dy)) maxDiff = Math.max(maxDiff, Math.abs(lum(x, y) - lum(x + dx, y + dy)));
    }
    if (maxDiff >= lineContrast) line[y * img.w + x] = 1;
  }
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    if (img.rgba[i + 3]! < 8) continue;
    if (edge[y * img.w + x]) {
      img.rgba[i] = er; img.rgba[i + 1] = eg; img.rgba[i + 2] = eb; img.rgba[i + 3] = 255;
    } else if (line[y * img.w + x]) {
      img.rgba[i + 3] = 220;
    } else {
      img.rgba[i + 3] = Math.round(img.rgba[i + 3]! * interiorAlphaMult);
    }
  }
  for (let y = faceGap[1]; y <= faceGap[3]; y++) for (let x = faceGap[0]; x <= faceGap[2]; x++) {
    if (edge[y * img.w + x]) continue; // keep the head's own outline closed
    img.rgba[(y * img.w + x) * 4 + 3] = 0;
  }
  const [ar, ag, ab] = hex(accentColor);
  for (let y = accentBox[1]; y <= accentBox[3]; y++) for (let x = accentBox[0]; x <= accentBox[2]; x++) {
    const i = (y * img.w + x) * 4;
    img.rgba[i] = ar; img.rgba[i + 1] = ag; img.rgba[i + 2] = ab; img.rgba[i + 3] = 255;
  }
}

/** The §1.4 report: hot-pixel share and hue buckets, same method the style guide describes. */
function accentReport(img: Img): string {
  let total = 0, hot = 0;
  const buckets = new Map<number, number>();
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    if (img.rgba[i + 3]! < 128) continue;
    total++;
    const r = img.rgba[i]!, g = img.rgba[i + 1]!, b = img.rgba[i + 2]!;
    if (isHot(r, g, b)) {
      hot++;
      const bucket = Math.round(hsv(r, g, b).h / 20) * 20 % 360;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
  }
  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  const pct = total ? (100 * hot / total).toFixed(1) : "0.0";
  return `${pct}% hot (${hot}/${total}), hues: ${sorted.map(([h, n]) => `${h}deg:${n}`).join(", ") || "none"}`;
}

// --- boss batch -------------------------------------------------------------------------

const ACCENT = "#fde047"; // data/tower.ts's own BiomeStyle.accent, same one the monsters use

interface BossJob {
  id: string;
  world: number; // preserved target world height, from the borrowed template's own w*worldScale
  op: (img: Img) => void;
}

const BOSSES: BossJob[] = [
  {
    id: "tower.boss.cherub",
    world: 99.68,
    op: (img) => {
      muteHot(img, [], hex("#b8a878"));
      paintAccent(img, [63, 37, 68, 42], ACCENT);
      paintAccent(img, [72, 37, 77, 42], ACCENT);
    },
  },
  {
    id: "tower.boss.virtue",
    world: 100.28,
    op: (img) => {
      muteHot(img, [[71, 67, 77, 76]], hex("#d8cfa8"));
    },
  },
  {
    id: "tower.boss.power",
    world: 133.98,
    op: (img) => {
      muteHot(img, [], hex("#b8a878"));
      paintAccent(img, [64, 38, 68, 41], ACCENT);
      paintAccent(img, [72, 38, 76, 41], ACCENT);
    },
  },
  {
    id: "tower.boss.throne",
    world: 109.98,
    op: (img) => {
      muteHot(img, [[70, 43, 71, 45], [80, 43, 81, 45]], hex("#b8a878"));
      recolor(img, [70, 43, 71, 45], ACCENT);
      recolor(img, [80, 43, 81, 45], ACCENT);
    },
  },
  {
    id: "tower.boss.nameless",
    world: 112.23,
    op: (img) => {
      hollowOut(img, "#f4ecd8", 0.12, 120, [54, 24, 86, 57], [66, 67, 74, 73], ACCENT);
    },
  },
];

for (const job of BOSSES) {
  const raw = readFileSync(`art/bosses/${job.id}.raw.png`);
  const img = decode(raw);
  console.log(`${job.id} raw: ${accentReport(img)}`);
  job.op(img);
  const trimmed = trim(img);
  console.log(`${job.id} finished: ${accentReport(trimmed)}, trimmed ${trimmed.w}x${trimmed.h}`);
  const worldScale = job.world / trimmed.h;
  console.log(
    `  "${job.id}": { id: "${job.id}", w: ${trimmed.w}, h: ${trimmed.h}, worldScale: ${worldScale.toFixed(4)}, feet: 0.03 },`,
  );
  writeFileSync(`src/render/atlas/bosses/${job.id}.png`, encode(trimmed));
}
