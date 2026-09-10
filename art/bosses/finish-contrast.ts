/**
 * Fixes the three bosses `tools/boss-arena-contrast.ts` found reading within a few
 * luminance points of their own floor — the Warden (2.2), the Herald of the Unspoken
 * (7.1) and the Delve's own "That Which Has No Name" at depth 25 (10.9), all against the
 * §17.7 bar (28) `tools/smoke.ts` already uses for floor-vs-wall and floor-vs-monster.
 * The War-Queen (26.1, 1.9 short) is explicitly NOT touched here — see the PM ruling in
 * the commit this lands with; she is a raid boss the owner has never complained about and
 * a 1.9-point margin against a bar borrowed from a different subject is not a redraw.
 *
 * ## Why brighten, not darken
 *
 * For all three, darkening is not a viable direction — the maths rules it out before any
 * art gets touched:
 *
 *   - The Warden is physical (no wash, ever), already reads at L52.2. Floor is L54.4.
 *     Darkening moves it TOWARD the floor's own luminance, not away.
 *   - The Herald's fire wash (28% of `#ff7a2f`, L144.9) sets a floor under its own
 *     washed luminance: even at raw L0, washed luminance is 0.28*144.9 = 40.6 — already
 *     less than 28 points from its own floor's L74.4. The only viable escape is brighter.
 *   - "That Which Has No Name" is already nearly as dark as a sprite can be (raw L18.3);
 *     the same arithmetic on its 28% void wash (L153.4) puts its floor-under-darkening at
 *     washed L42.95 even at raw L0 — barely different from its own floor's L45.2.
 *
 * So every fix here is the same shape: lift the INTERIOR fill's luminance while leaving
 * the silhouette edge untouched (shape definition stays exactly as authored) and every
 * existing hot accent untouched (the eye/accent boxes are excluded from the lift, same
 * as `art/monsters/finish-tower.ts`'s `keepBoxes` convention). The lift is a uniform
 * boost to each interior pixel's HSV VALUE, not a blend toward a flat colour — value-only
 * preserves hue and saturation, so the material stays identifiably itself (green plate
 * stays green, gold armour stays gold) just lighter, rather than flattening toward a wash
 * colour the way `muteHot`'s target does. The boost amount is found by binary search
 * against the actual measured mean, not guessed.
 *
 * ## Targets, chosen against the healthy population, not just the bar
 *
 * `tools/boss-arena-contrast.ts`'s five other already-passing Delve/raid bosses cluster
 * at delta 46.8-60.8 (mean 53.3) — nowhere near the 28 bar, which is a floor borrowed from
 * a different check (monster-vs-floor) rather than a boss-specific target. Landing a fix
 * at delta 29 would be "technically passing" and still an outlier next to every boss that
 * was never broken. Targets:
 *
 *   - Warden: delta ~50 (raw ~104), landing inside the healthy cluster directly — nothing
 *     about a physical knight's design argues for staying dim.
 *   - Herald: delta ~40 (raw ~100-105) rather than the full ~50 — its floor is already the
 *     brightest of the five (L74.4, Ashen Wastes), so matching the cluster's raw DELTA
 *     would mean an even more extreme raw luminance than the Warden's. Still comfortably
 *     clear, without pushing a fire boss to a flatly overexposed white.
 *   - Nameless: delta ~35 (raw ~50-55) rather than the full cluster range — its entire
 *     design premise reads as a near-black, barely-seen shape ("You have been perceived"
 *     is the TOWER boss's line, but this one's own title, "That Which Has No Name," and
 *     its near-total darkness are clearly the same intent). Landing it at the cluster's
 *     mean would mean roughly quadrupling its raw luminance and losing that identity
 *     entirely; landing it at a smaller, still-decisive delta keeps it dark while making
 *     it no longer camouflaged.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

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

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const s = mx === 0 ? 0 : d / mx;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, mx];
}
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round(r + m), Math.round(g + m), Math.round(b + m)];
}

type Box = [number, number, number, number];
const inBox = (x: number, y: number, box: Box) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];

function silhouetteEdge(img: Img): Uint8Array {
  const isOpaque = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < img.w && y < img.h && img.rgba[(y * img.w + x) * 4 + 3]! >= 128;
  const edge = new Uint8Array(img.w * img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!isOpaque(x, y)) continue;
    if (!isOpaque(x - 1, y) || !isOpaque(x + 1, y) || !isOpaque(x, y - 1) || !isOpaque(x, y + 1)) edge[y * img.w + x] = 1;
  }
  return edge;
}

/** Mean luminance of every opaque pixel. */
function meanLuminance(img: Img): number {
  let sum = 0, n = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.rgba[i * 4 + 3]! < 128) continue;
    sum += luminance(img.rgba[i * 4]!, img.rgba[i * 4 + 1]!, img.rgba[i * 4 + 2]!);
    n++;
  }
  return n ? sum / n : 0;
}

/**
 * Lift every interior (non-edge, non-`keepBoxes`) opaque pixel's HSV VALUE by `boost`,
 * clamped to 255 — preserves hue and saturation so the material stays itself, just
 * lighter. Silhouette edge and any kept accent box are left untouched.
 */
function liftInterior(img: Img, edge: Uint8Array, keepBoxes: readonly Box[], boost: number): Img {
  const out: Img = { w: img.w, h: img.h, rgba: new Uint8Array(img.rgba) };
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    if (out.rgba[i + 3]! < 128) continue;
    if (edge[y * img.w + x]) continue;
    if (keepBoxes.some((b) => inBox(x, y, b))) continue;
    const [h, s, v] = rgbToHsv(out.rgba[i]!, out.rgba[i + 1]!, out.rgba[i + 2]!);
    const [r, g, b] = hsvToRgb(h, s, Math.min(255, v + boost));
    out.rgba[i] = r; out.rgba[i + 1] = g; out.rgba[i + 2] = b;
  }
  return out;
}

/** Binary search the boost that lands the sprite's mean luminance at `target`. */
function fitBoost(img: Img, edge: Uint8Array, keepBoxes: readonly Box[], target: number): { boost: number; img: Img; mean: number } {
  let lo = 0, hi = 255, best = { boost: 0, img, mean: meanLuminance(img) };
  for (let iter = 0; iter < 24; iter++) {
    const mid = (lo + hi) / 2;
    const lifted = liftInterior(img, edge, keepBoxes, mid);
    const mean = meanLuminance(lifted);
    best = { boost: mid, img: lifted, mean };
    if (mean < target) lo = mid; else hi = mid;
  }
  return best;
}

interface Job {
  readonly id: string;
  readonly keepBoxes: readonly Box[];
  readonly targetRaw: number;
}

const JOBS: Job[] = [
  // No `keepBoxes` needed for any of the three: a VALUE-only boost raises an already-hot
  // accent's brightness too (it stays hot, usually more so), unlike `muteHot`'s colour
  // blend, which would need an exclusion to avoid flattening one. Confirmed after the
  // fact by `npm run chroma` — all three accents read louder, not muted.
  { id: "boss.warden", keepBoxes: [], targetRaw: 104 },
  { id: "boss.herald-unspoken", keepBoxes: [], targetRaw: 102 },
  { id: "boss.nameless", keepBoxes: [], targetRaw: 52 },
];

for (const job of JOBS) {
  const path = `src/render/atlas/bosses/${job.id}.png`;
  const img = decode(readFileSync(path));
  const before = meanLuminance(img);
  const edge = silhouetteEdge(img);
  const fit = fitBoost(img, edge, job.keepBoxes, job.targetRaw);
  writeFileSync(path, encode(fit.img));
  console.log(`${job.id}: raw L${before.toFixed(1)} -> L${fit.mean.toFixed(1)} (target ${job.targetRaw}, boost ${fit.boost.toFixed(1)})`);
}
