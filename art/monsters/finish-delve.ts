/**
 * Raw PixelLab generation -> committed atlas PNG, for the six UAT §2 roles that borrowed
 * another role's silhouette until art-wave 2 (`docs/art-wave-2.md` §1a): charger, bomber,
 * shieldbearer, summoner, sniper, leech. Run it to rebuild every one from the `.raw.png`
 * rotations next to this script:
 *
 *   npx esbuild art/monsters/finish-delve.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/finishdelve.mjs && \
 *     node node_modules/.cache/finishdelve.mjs
 *
 * It writes `src/render/atlas/monsters/reliquary.monster.*.png` and prints the `ATLAS` row
 * each one needs plus a per-sprite hot-accent report — the same "a treatment that lives in
 * a script survives a reroll" argument `art/bosses/finish.ts` and `finish-tower.ts` make.
 * The PNG helpers are duplicated from `finish-tower.ts` on purpose: each finishing script
 * is a self-contained record of one batch, runnable on its own years later.
 *
 * ## Generation
 *
 * `create_character`, standard mode (1 generation each), 8 directions, low top-down, basic
 * shading, single-colour black outline, medium detail — the identical recipe the Reliquary
 * five and the Tower five were made with, read back off the account with `get_character`.
 * Humanoids at size 80 (canvas 112), the hound as a `quadruped`/`dog` at size 64 (canvas
 * 92). Only the south rotation ships; all eight are archived under `rotations/`.
 *
 * Two of six needed a reroll on sight, and the reason is worth keeping: the summoner and
 * the leech both came back as **hooded robed figures with arms down and zero hot pixels** —
 * i.e. the cult caster again. Three robed casters is exactly the §1.5 failure this batch
 * exists to fix. The rerolls raised `text_guidance_scale` to 12 and rewrote the pose in
 * positives and capitals ("BOTH ARMS RAISED STRAIGHT UP", "TALL POINTED MITRE") — style guide
 * §1.4d: a negative summons what it forbids, and a soft positive gets averaged away.
 *
 * ## The hot accent (art-style-guide §1.4), measured rather than eyeballed
 *
 * §1.4 is two-sided — exactly one — and this batch produced both failures plus a new one:
 *
 * - **Gore-Hound** generated with a *second* saturated region louder than its eyes: a dull
 *   red ruff of 43 px at hue 0 against 6 px of ember eye. The ruff sits right at the
 *   detector's 0.55 saturation line, so by eye it reads as dried blood and by count it wins.
 *   `muteHot` outside the eye box pulls it under the line; the eyes are recoloured to the
 *   physical-charger's authored accent.
 * - **Bloat-Fiend** generated with **two accents of two kinds**: 8 px of saturated red eye,
 *   and a large pale-green belly (189 px) that is the *intended* accent — its own death
 *   showing through — but sits at saturation 0.38-0.53, under the line. So the count said
 *   "red eyes" and the eye said "green belly". The fix inverts both: the eyes go dark (a
 *   Bloatfiend's tell is its belly, not its gaze — the one monster whose accent is not the
 *   part looking at you, by design in §10.2), and the belly's own brightest vein pixels are
 *   lifted over the saturation line (`liftTop`, the same "push the material's highlight
 *   into the accent" idea `finish-tower.ts`'s `liftHighlight` introduced, bounded by a pixel
 *   *count* rather than a luminance cut so the share lands where the roster's does).
 * - **Aegis Thrall** generated with a 4 px visor slit plus 4 more slit pixels one shade
 *   under the line — a thin accent, the kind `docs/animation.md` says dies under generation
 *   unless it has redundancy. `recolorWhere` pulls the whole slit over the line so the idle
 *   pass has something to hold on to.
 * - **Deadeye** came back clean: 10 px of amber eye. Recoloured to the lightning accent so
 *   the element reads, nothing else touched.
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
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Pull every hot pixel outside `keepBoxes` 75% of the way toward `target` (finish-tower's op). */
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

/** Every opaque pixel in `box` satisfying `pred` becomes `color`. The general form of the
 * one-off `paintAccent` / `liftHighlight` ops the earlier scripts each needed once. */
function recolorWhere(
  img: Img, box: Box, pred: (r: number, g: number, b: number) => boolean, color: string,
): number {
  const [r, g, b] = hex(color);
  let n = 0;
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const i = (y * img.w + x) * 4;
    if (img.rgba[i + 3]! < 128) continue;
    if (!pred(img.rgba[i]!, img.rgba[i + 1]!, img.rgba[i + 2]!)) continue;
    img.rgba[i] = r; img.rgba[i + 1] = g; img.rgba[i + 2] = b; n++;
  }
  return n;
}

/**
 * The `count` brightest opaque pixels inside `box` become `color`. Bounded by a count
 * rather than a luminance cut so the accent's *share* of the sprite is chosen directly —
 * the roster ships at 0.4-4% hot, and a whole belly lifted by threshold would be 13%.
 */
function liftTop(img: Img, box: Box, count: number, color: string): number {
  const [r, g, b] = hex(color);
  const cands: { i: number; l: number }[] = [];
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) {
    const i = (y * img.w + x) * 4;
    if (img.rgba[i + 3]! < 128) continue;
    cands.push({ i, l: lum(img.rgba[i]!, img.rgba[i + 1]!, img.rgba[i + 2]!) });
  }
  cands.sort((a, c) => c.l - a.l);
  for (const { i } of cands.slice(0, count)) { img.rgba[i] = r; img.rgba[i + 1] = g; img.rgba[i + 2] = b; }
  return Math.min(count, cands.length);
}

/**
 * Erase a painted ground shadow. Both free-form generations and one character generation
 * in this batch drew a flat ellipse under the feet in ONE exact opaque colour — the game
 * draws its own shadows, and a baked one stands on the floor as a grey disc (visible on
 * `npm run inworld`, not on a checkerboard). Exact-colour, bottom-rows-only, so a grey boot
 * or hem elsewhere is never touched; prints the count so a reroll that paints no shadow
 * shows 0 rather than silently doing nothing.
 */
function eraseShadow(img: Img, rgb: [number, number, number], fromRow: number): number {
  let n = 0;
  for (let y = fromRow; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    if (img.rgba[i + 3]! < 8) continue;
    if (img.rgba[i] === rgb[0] && img.rgba[i + 1] === rgb[1] && img.rgba[i + 2] === rgb[2]) { img.rgba[i + 3] = 0; n++; }
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

// --- the six ------------------------------------------------------------------------------

// Each role's accent is its element colour from `data/elements.ts` — the same hue the
// procedural fallback grid's `E` key carries in `render/pixels.ts`, so the two rungs agree.
//
// Except cold. `#7dd3fc` has HSV saturation 0.50, *under* §1.4's own 0.55 hot line, so a
// slit painted in the element colour counts as NO ACCENT to the very detector this script
// reports with (first run of this file: "recoloured 10px ... after 0/2196 hot"). The
// Ferryman's two-pixel eye is that colour and survives only because `npm run chroma`
// measures chroma against the hero's bar rather than saturation. A monster accent needs
// headroom on *both* instruments, so cold here is one step deeper and brighter — same hue,
// saturation 0.66. The fallback grid's `E` uses the same value.
//
// And void, for the same reason: `#c084fc` is saturation 0.48, and the piper's first finish
// pass painted 51 pixels of it and reported NO ACCENT. `#b45cff` (saturation 0.64) is what
// the procedural cult-caster palette already uses for exactly this, so the two rungs agree.
// Of the five element colours only fire, poison and lightning clear 0.55 as authored.
const FIRE = "#ff7a2f", POISON = "#84cc16", COLD = "#56c8ff", VOID = "#b45cff", LIGHTNING = "#fde047";

interface Spec {
  id: string;
  raw: string;
  /**
   * Target world height. Read off the role's `radius` in `data/enemies.ts` against the
   * shipped roster's own ratios (grunt r9 -> 30 tall, brute r14 -> 32, caster r9 -> 30,
   * swarmer r7 -> 17): a charger at r10 is low-slung, a sniper at r9 is tall and still, a
   * shieldbearer at r12 sits between grunt and brute.
   */
  world: number;
  feet: number;
  op: (img: Img) => void;
}

const MONSTERS: readonly Spec[] = [
  {
    id: "reliquary.monster.gore-hound", raw: "art/monsters/rotations/reliquary.monster.gore-hound.south.raw.png",
    world: 26, feet: 0.05,
    op: (img) => {
      // Eyes: the two ember clusters at x41-42/49-50, y35-36 on the 92x92 canvas. The
      // ruff (43 px at hue 0, saturation right on the 0.55 line) is the rival.
      const eyes: Box = [40, 34, 51, 37];
      const ruff = muteHot(img, [eyes], hex("#3a1f1a"));
      const lit = recolorWhere(img, eyes, isHot, FIRE);
      console.log(`  muted ${ruff}px of ruff toward dried blood, recoloured ${lit}px of eye to the fire accent`);
    },
  },
  {
    id: "reliquary.monster.bloat-fiend", raw: "art/monsters/rotations/reliquary.monster.bloat-fiend.south.raw.png",
    world: 28, feet: 0.05,
    op: (img) => {
      // Eyes go dark: this is the one role whose tell is not its gaze (§10.2 "telegraphs
      // its own death"). Then the belly's brightest 50 px — its vein highlights — become
      // the accent. 50 of ~1400 opaque is 3.5%, the top of the roster's shipped band
      // (Reliquary 0.4-3.0%, Tower up to 3.7%); a first run at 70 read 4.9%, louder than
      // anything committed.
      const eyes: Box = [40, 28, 51, 31];
      const dark = recolorWhere(img, eyes, isHot, "#1a0a0a");
      const belly: Box = [37, 44, 54, 63];
      const lit = liftTop(img, belly, 50, POISON);
      console.log(`  darkened ${dark}px of red eye, lifted ${lit}px of belly vein into the poison accent`);
    },
  },
  {
    id: "reliquary.monster.aegis-thrall", raw: "art/monsters/rotations/reliquary.monster.aegis-thrall.south.raw.png",
    world: 32, feet: 0.05,
    op: (img) => {
      // The visor slit: 4 px over the line and ~4 one shade under, all cold-blue (hue
      // 190-215). Pull the whole slit to the accent so it has redundancy.
      const slit: Box = [50, 31, 62, 36];
      const n = recolorWhere(img, slit, (r, g, b) => {
        const { h, s } = hsv(r, g, b); return s > 0.4 && h > 180 && h < 225 && Math.max(r, g, b) > 120;
      }, COLD);
      console.log(`  recoloured ${n}px of visor slit to the cold accent`);
    },
  },
  {
    // v2, regenerated at size 64 (canvas 92) after v1 at size 80 measured 5.4x the floor's
    // pixel density (`npm run inworld`), above anything shipped (the roster runs 2.4-4.7x).
    // v2 also improved the read: the bone barrel is held level like a rifle instead of
    // planted like a staff. Its "one huge single eye" arrived as an unlit bone-white disc
    // on the hood — bright, unsaturated, invisible to the detector — so it is lit here.
    id: "reliquary.monster.deadeye", raw: "art/monsters/rotations/reliquary.monster.deadeye.south.raw.png",
    world: 34, feet: 0.05,
    op: (img) => {
      const eye: Box = [39, 21, 52, 30];
      const n = recolorWhere(img, eye, (r, g, b) => lum(r, g, b) > 165, LIGHTNING);
      console.log(`  lit ${n}px of the hood's bone disc as the lightning eye (was 0% hot)`);
    },
  },
  {
    // v3. v2 (size 80, `rejected/…v2-size80-face…`) got the silhouette — a tall point, a
    // lit censer held low — and lost the rule that makes it a monster: it came back with a
    // *human face* under the hat, and measured 5.8x the floor's density besides. Wrapping
    // the face dark in the finish pass worked only as a patch (a first pass caught the
    // saturated skin and left a darker face; a second had to blank the whole head interior).
    // v3 asked for the head "wrapped entirely in stained bandages so there is no face" at
    // size 64 and got it: a dark wrapped head under the point, two small amber eyes, the
    // lantern lit. The eyes go dark — the censer is the one accent — and the lantern's own
    // green (hue ~100, saturation 0.35-0.5, lit but under the line) is pushed over.
    id: "reliquary.monster.rot-priest", raw: "art/monsters/rotations/reliquary.monster.rot-priest.south.raw.png",
    world: 34, feet: 0.12, // it floats, like the caster — the anchor sits up inside the hem
    op: (img) => {
      const shadow = eraseShadow(img, [126, 125, 133], 74);
      const eyes: Box = [40, 22, 52, 27];
      const dark = recolorWhere(img, eyes, isHot, "#26241f");
      const censer: Box = [39, 40, 52, 64];
      const lit = recolorWhere(img, censer, (r, g, b) => {
        const { h, s } = hsv(r, g, b); return s > 0.3 && h >= 70 && h <= 130 && Math.max(r, g, b) > 90;
      }, POISON);
      console.log(`  erased ${shadow}px of painted ground shadow, darkened ${dark}px of amber eye, lifted ${lit}px of censer glow into the poison accent`);
    },
  },
  {
    // The one non-character generation in the batch (`create_image_pixflux`, 56x88,
    // transparent, low top-down, facing south) — see the header. Two character-pipeline
    // attempts are under `rejected/`.
    id: "reliquary.monster.grave-piper", raw: "art/monsters/reliquary.monster.grave-piper.raw.png",
    world: 31, feet: 0.05,
    op: (img) => {
      // The body came back right — a bare skull, a sac the size of its torso at the hip —
      // and the accent came back in the wrong place: a magenta sash over the shoulder
      // (hue 300-340, ~45 px at s 0.35-0.6) against one violet pixel in the eyes and a
      // brown sac with no glow. Mute the sash toward the grave-cloth, paint the eye
      // sockets' voids violet, and lift the sac's own brightest 24 px into the accent so
      // the thing it is carrying is the thing that glows.
      const shadow = eraseShadow(img, [146, 150, 163], 78);
      const eyes: Box = [23, 6, 33, 12];
      const sac: Box = [30, 38, 50, 72];
      const sash = recolorWhere(img, [18, 26, 40, 66], (r, g, b) => {
        const { h, s } = hsv(r, g, b); return s > 0.3 && (h >= 290 || h <= 5) && Math.max(r, g, b) > 70;
      }, "#5a4a44");
      const sockets = recolorWhere(img, eyes, (r, g, b) => {
        const { h, s } = hsv(r, g, b); return Math.max(r, g, b) < 70 || (s > 0.3 && h >= 270 && h <= 340);
      }, VOID);
      const glow = liftTop(img, sac, 24, VOID);
      console.log(`  erased ${shadow}px of painted ground shadow, muted ${sash}px of sash, painted ${sockets}px of socket violet, lifted ${glow}px of sac into the void accent`);
    },
  },
];

for (const spec of MONSTERS) {
  // Every box above was measured on the RAW (untrimmed) canvas, so every op runs before
  // `trim` — trimming first shifts the origin and silently misses.
  const raw = decode(readFileSync(spec.raw));
  console.log(`\n${spec.id}: before  ${accentReport(raw)}`);
  spec.op(raw);
  const img = trim(raw);
  console.log(`${spec.id}: after   ${accentReport(img)}`);
  writeFileSync(`src/render/atlas/monsters/${spec.id}.png`, encode(img));
  const worldScale = Number((spec.world / img.h).toFixed(4));
  console.log(
    `"${spec.id}": { id: "${spec.id}", w: ${img.w}, h: ${img.h}, worldScale: ${worldScale}, feet: ${spec.feet} },`
    + ` // ${img.h} * ${worldScale} = ${(img.h * worldScale).toFixed(1)}`,
  );
}
