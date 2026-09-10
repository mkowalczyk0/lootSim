/**
 * Raw PixelLab generation -> committed atlas PNG, for the Tower's five monster sprites
 * (`MONSTER_SETS.tower` in `src/render/atlas/manifest.ts`). Run it to rebuild every one
 * from the `.raw.png` files next to this script:
 *
 *   npx esbuild art/monsters/finish-tower.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/finishtower.mjs && \
 *     node node_modules/.cache/finishtower.mjs
 *
 * It writes `src/render/atlas/monsters/tower.monster.*.png` and prints the `ATLAS` row
 * each one needs, plus a per-sprite hot-accent report (see below) — the same "a treatment
 * that lives in a script survives a reroll" argument `art/bosses/finish.ts` makes, applied
 * here instead of hand-editing a PNG.
 *
 * ## The hot accent (art-style-guide §1.4), measured rather than eyeballed
 *
 * PixelLab's "clean heroic armour" bias (documented in `art/bosses/finish.ts` and the style
 * guide's §1.4 pipeline note) hit two of these four differently than it hit the bosses:
 *
 * - **Power-at-Arms and Throne-Bearer generated with *zero* saturated pixels** — the exact
 *   Tyrant failure, a helm with dark hollow eyes and no accent at all. `paintAccent` lights
 *   the actual void pixels inside each eye socket (found by connected-component search over
 *   the raw PNG, see `art/monsters/finish-tower-coords.md` — no, there is no such file;
 *   the coordinates below were found once with a throwaway script and are pinned as
 *   constants) rather than a guessed rectangle.
 * - **Dominion Herald generated with the entire robe front as saturated gold** — 448 of
 *   1286 opaque pixels (34.8%) read hot, all one hue, against a shipped Reliquary roster
 *   that runs 0.4%-3.0%. `muteHot` desaturates every hot pixel outside a kept region toward
 *   the same worn bone-gold the rest of the palette uses; the halo above the head — already
 *   small, already thematically the accent — is the one region spared.
 * - **Virtue Lancer generated at 6.4%** (73px), roughly 2x the shipped ceiling, split across
 *   the lance tip (the intended accent) and five separate trim highlights (shoulder rings,
 *   belt, greaves). `muteHot` keeps only the lance-tip box and mutes the rest.
 *
 * Every op is measured before and after with the same detector §1.4 describes by hand:
 * opaque pixels with HSV saturation > 0.55 and a channel > 90, bucketed by hue. The
 * console output at the bottom of this file is that report — read it before trusting the
 * PNGs, the same rule `art/bosses/finish.ts` and the style guide both state explicitly.
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

/** Trim to the opaque bounding box — the atlas convention: a monster stands on its own row. */
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

/**
 * Pull every "hot" pixel (§1.4's own threshold) toward a low-saturation bone-gold, except
 * inside `keepBoxes` — the single accent this monster is allowed to keep. This is
 * `muteRivalHue` from `art/bosses/finish.ts` generalised: that function only chased a
 * specific rival hue (the Queen's second red); this one catches *any* second saturated
 * region, which is what a whole gold robe front needs.
 */
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

/**
 * Light the void: within `box`, every opaque pixel darker than `voidCeiling` (the eye
 * socket the model drew as a dark hollow, per §1.4's Tyrant failure — a helm with no
 * accent at all) becomes `color`. Unlike `hotAccent` in `art/bosses/finish.ts` (which
 * lifts pixels the model already drew bright), this paints an accent into a void that
 * never had one.
 */
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
  return `${hot}/${total} opaque px hot (${pct}%)` + (sorted.length
    ? `, hues: ${sorted.map(([h, n]) => `${h}°×${n}`).join(", ")}` : ", NO ACCENT");
}

// --- the five -----------------------------------------------------------------------------

const ACCENT = "#fde047"; // data/tower.ts's own BiomeStyle.accent for all three bands

interface Spec {
  id: string;
  raw: string;
  world: number; // target world height — see the Reliquary rows this matches (§ header)
  op: (img: Img) => void;
}

const MONSTERS: readonly Spec[] = [
  {
    id: "tower.monster.power", raw: "art/monsters/rotations/tower.monster.power.south.raw.png",
    world: 30, // matches reliquary.monster.rot-imp (41 * 0.73 = 29.9) — the grunt row
    op: (img) => {
      // Two dark helm-eye voids, found once via connected-component search over the raw
      // generation (centroids ~(42.9,27.7) and ~(48.2,27.8) on the 92x92 canvas).
      const l = paintAccent(img, [40, 25, 45, 30], ACCENT);
      const r = paintAccent(img, [46, 25, 51, 30], ACCENT);
      console.log(`  painted ${l + r}px into the helm's eye sockets (was 0% hot)`);
    },
  },
  {
    id: "tower.monster.virtue-lancer", raw: "art/monsters/rotations/tower.monster.virtue-lancer.south.raw.png",
    world: 30, // matches reliquary.monster.bone-archer (47 * 0.63 = 29.6) — the archer row
    op: (img) => {
      // Keep only the lance tip (bbox x[36,37] y[12,18]); mute five scattered trim
      // highlights (shoulder rings, belt, greaves) that pushed this to 6.4% hot, 2x the
      // shipped Reliquary ceiling of 3.0%.
      const n = muteHot(img, [[34, 10, 40, 20]], hex("#c9bd94"));
      console.log(`  muted ${n}px of scattered trim, kept the lance tip`);
    },
  },
  {
    id: "tower.monster.throne-bearer", raw: "art/monsters/rotations/tower.monster.throne-bearer.south.raw.png",
    world: 32, // matches reliquary.monster.iron-brute (39 * 0.83 = 32.4) — the brute row
    op: (img) => {
      // Two dark mask-eye voids (centroids ~(50.1,31.3) and ~(57.9,31.3) on the 108x108
      // canvas) — same zero-accent failure as Power-at-Arms.
      const l = paintAccent(img, [47, 28, 53, 35], ACCENT);
      const r = paintAccent(img, [55, 28, 61, 35], ACCENT);
      console.log(`  painted ${l + r}px into the mask's eye sockets (was 0% hot)`);
    },
  },
  {
    id: "tower.monster.dominion-herald", raw: "art/monsters/rotations/tower.monster.dominion-herald.south.raw.png",
    world: 30, // matches reliquary.monster.cult-caster (48 * 0.62 = 29.8) — the caster row
    op: (img) => {
      // Keep only the halo above the head (y[6,13], full width) — already small (~3% of
      // the sprite) and already the thematic accent. Mute the robe's front placket and
      // hem, which generated as one continuous saturated-gold panel: 448/1286 px (34.8%)
      // hot, more than eleven times the shipped ceiling.
      const n = muteHot(img, [[0, 6, img.w - 1, 13]], hex("#d8cfa8"));
      console.log(`  muted ${n}px of the robe's gold panel, kept the halo`);
    },
  },
  {
    id: "tower.monster.halo-fragment", raw: "art/monsters/tower.monster.halo-fragment.raw.png",
    world: 17, // matches reliquary.monster.rot-scuttler (24 * 0.72 = 17.3) — the swarmer row
    op: (img) => {
      // The chosen candidate (frame 13 of a 64-frame review batch) generated with a glow
      // along the WHOLE broken edge — 63/515 px (12.2%), 4x the shipped Reliquary ceiling
      // of 3.0%, because a full-length edge reads as trim rather than a single accent at
      // this size. Keep only the centre third of the diagonal (y 14-22) and mute the rest.
      const n = muteHot(img, [[0, 14, img.w - 1, 22]], hex("#a89a78"));
      console.log(`  muted ${n}px of the edge glow, kept the centre third`);
    },
  },
];

for (const spec of MONSTERS) {
  // Every box in `MONSTERS` above was measured on the RAW (untrimmed) generation, so every
  // op must run before `trim` — trimming first shifts the origin and silently misses.
  const raw = decode(readFileSync(spec.raw));
  console.log(`\n${spec.id}: before  ${accentReport(raw)}`);
  spec.op(raw);
  const img = trim(raw);
  console.log(`${spec.id}: after   ${accentReport(img)}`);
  writeFileSync(`src/render/atlas/monsters/${spec.id}.png`, encode(img));
  const worldScale = Number((spec.world / img.h).toFixed(4));
  console.log(
    `"${spec.id}": { id: "${spec.id}", w: ${img.w}, h: ${img.h}, worldScale: ${worldScale}, feet: 0.05 },`
    + ` // ${img.h} * ${worldScale} = ${(img.h * worldScale).toFixed(1)}`,
  );
}
