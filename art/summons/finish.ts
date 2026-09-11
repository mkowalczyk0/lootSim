/**
 * Raw PixelLab generation -> committed atlas PNG, for the 21 bespoke summon bodies of
 * docket §36 (`art/summons/README.md` is the generation plan; `docs/summon-sprite-seam.md`
 * is the renderer seam they land into). Run it to rebuild every one from the `.raw.png`
 * files next to this script:
 *
 *   npx esbuild art/summons/finish.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/finish-summons.mjs && node /tmp/finish-summons.mjs
 *
 * It writes `src/render/atlas/summons/summon.*.png` and prints the `ATLAS` row and the
 * `SUMMON_UNIT_ART` line each one needs — the same "a treatment that lives in a script
 * survives a reroll" argument `art/bosses/finish.ts` and `art/monsters/finish-tower.ts`
 * make, applied here instead of hand-editing a PNG.
 *
 * ## The one rule: a summon has NO hot accent
 *
 * Art style guide §1.4: the single saturated colour on a monster is the part of it that is
 * looking at you, and the hero is forbidden one outright (`npm run chroma`). A summon is
 * yours — it must read on the hero's side of that line, not the monsters'. So where the
 * monster finish scripts keep ONE box of hot pixels and mute the rest, this script keeps
 * nothing: every pixel §1.4's own detector calls hot (saturation > 0.55 and a channel
 * > 90), or that the chroma gate would rank above the monsters (see `isHot`), is
 * desaturated in place, and the script refuses to write a PNG that still carries one. That is the "cannot be violated" half; `npm run chroma` walking `summon.*` against
 * the monsters is the "notices when it was" half, kept as well because a hand-edited PNG
 * never passes through here.
 *
 * Desaturating toward each pixel's own luminance (rather than pulling toward a fixed
 * bone-gold the way `muteHot` does) is deliberate: a fixed target shifts VALUE as well as
 * saturation, so a dark saturated brown would come out lighter than the cloth around it
 * and read as a patch. Keeping luminance keeps the shading the generator drew; only the
 * colour goes quiet. What the renderer then adds — the owner's element on the edge
 * pixels only, `SUMMON_ELEMENT_OUTLINE` in `render/sprites.ts` — is the only saturated
 * thing left on the body, which is exactly what lets it say "mine, and my element"
 * (README decision 2).
 *
 * ## Shadows
 *
 * The game draws its own soft shadow ellipse under every body; a generation that baked
 * one in would ship two. `eraseFlat` removes a baked flat-colour ground plate from the
 * bottom rows of a sprite (the siege engine came back standing on one).
 *
 * ## World heights
 *
 * README decision 3, against the hero's 32 world units and the roster's own density band
 * (`npm run inworld`: every floor is 2.0 world units per art pixel; sprites sit ~3-4x
 * finer): risen-dead bipeds 24-26, floaters 24 with `feet` up inside the hem like the cult
 * caster, turrets/pods/generator 18-20, repair drone 14, siege engine 30 (the bulky
 * exception, still under the hero), wolf ~20, birds 14, healing spirit 12, bloom 16. A
 * flying or floating body gets `feet` near 0.5 — its anchor is its centre, so it hovers
 * about its position the way the triangle did — rather than standing on its bottom row.
 * `Minion.radius` (collision) is untouched by any of this.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { SUMMON_UNITS } from "../../src/data/summons";
import { PLAYER_COPY_UNITS } from "../../src/render/minionart";
import { chroma } from "../../src/render/grade";

// --- png (standalone, same as the other art/ scripts) ----------------------------------

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
  if (colorType !== 6 && colorType !== 2) throw new Error(`unsupported PNG colour type ${colorType} (need RGB/RGBA 8-bit)`);
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

/** Trim to the opaque bounding box — the atlas convention: a sprite stands on its own row. */
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

/**
 * Two detectors, because they disagree and the gate ranks by the second one. §1.4's own
 * hand rule is saturation-gated (s > 0.55 and a channel > 90); `npm run chroma` ranks
 * sprites by `render/grade.ts#chroma` = saturation × value, and compares a summon against
 * every monster's loudest colour. A bright, moderately saturated pixel splits them: the
 * auto-turret's cream-gold #f7cb76 is s = 0.52 (not "hot") but chroma 50.6, louder than
 * four committed monsters' own accents — it shipped past the first rule and failed the
 * gate. So a pixel is quieted if EITHER rule flags it. `SUMMON_CHROMA_CEILING` sits under
 * the weakest committed monster accent (45.5, the minotaur) with margin and above the
 * hero's own legitimate skin (35.3); it is this script's constant, and the gate — not this
 * number — is the authority, measured against the monsters themselves.
 */
const SUMMON_CHROMA_CEILING = 40;
function isHot(r: number, g: number, b: number): boolean {
  return (hsv(r, g, b).s > 0.55 && Math.max(r, g, b) > 90)
    || chroma((r << 16) | (g << 8) | b) >= SUMMON_CHROMA_CEILING;
}

/**
 * Pull every hot pixel toward its own luminance, keeping `keep` of its RGB distance from
 * grey, and repeat until §1.4's detector finds nothing. No keep box — a summon has no
 * accent to spare. Iterating is not belt-and-braces: a single pass at 0.35 was expected to
 * land any pixel under the 0.55 saturation line and did not — the repair drone's dark red
 * eye (#e50f0b, luminance ~60) came out at #772c2b, still 0.64 saturated, because pulling
 * toward a LOW luminance shrinks the bright channel far more than the dark ones and HSV
 * saturation is a ratio of the two. The loop is bounded; the script still asserts the
 * result rather than trusting the arithmetic.
 */
function quietHot(img: Img, keep = 0.35): number {
  let total = 0;
  for (let pass = 0; pass < 8; pass++) {
    const n = quietHotPass(img, keep);
    total += n;
    if (n === 0) break;
  }
  return total;
}
function quietHotPass(img: Img, keep: number): number {
  let n = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    const s = i * 4;
    if (img.rgba[s + 3]! < 8) continue;
    const r = img.rgba[s]!, g = img.rgba[s + 1]!, b = img.rgba[s + 2]!;
    if (!isHot(r, g, b)) continue;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    img.rgba[s] = Math.round(lum + (r - lum) * keep);
    img.rgba[s + 1] = Math.round(lum + (g - lum) * keep);
    img.rgba[s + 2] = Math.round(lum + (b - lum) * keep);
    n++;
  }
  return n;
}

/**
 * Erase every pixel of exactly `rgb` from row `fromRow` down — a baked ground-shadow
 * plate the generator drew as one flat colour under the body. Exact match on purpose: a
 * body colour that happens to be close is not the plate.
 */
function eraseFlat(img: Img, rgb: readonly [number, number, number], fromRow: number): number {
  let n = 0;
  for (let y = fromRow; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const i = (y * img.w + x) * 4;
    if (img.rgba[i + 3]! < 8) continue;
    if (img.rgba[i] !== rgb[0] || img.rgba[i + 1] !== rgb[1] || img.rgba[i + 2] !== rgb[2]) continue;
    img.rgba[i + 3] = 0; n++;
  }
  return n;
}

/** The §1.4 report: hot-pixel share and hue buckets, same method the style guide describes. */
function accentReport(img: Img): { text: string; hot: number } {
  let total = 0, hot = 0;
  const buckets = new Map<number, number>();
  for (let i = 0; i < img.w * img.h; i++) {
    const s = i * 4;
    if (img.rgba[s + 3]! < 128) continue;
    total++;
    const r = img.rgba[s]!, g = img.rgba[s + 1]!, b = img.rgba[s + 2]!;
    if (isHot(r, g, b)) {
      hot++;
      const bucket = Math.round(hsv(r, g, b).h / 20) * 20 % 360;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
  }
  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
  const pct = total ? (100 * hot / total).toFixed(1) : "0.0";
  return {
    hot,
    text: `${hot}/${total} opaque px hot (${pct}%)` + (sorted.length
      ? `, hues: ${sorted.map(([h, n]) => `${h}°×${n}`).join(", ")}` : ", none"),
  };
}

// --- the twenty-one ---------------------------------------------------------------------

interface Spec {
  /** `SUMMON_UNITS` id (`src/data/summons.ts`). */
  unit: string;
  /** Rigged bodies archive all eight rotations; south is the one that ships. */
  raw: "south" | "free";
  /** Target world height (README decision 3). */
  world: number;
  /** `AtlasSprite.feet` — see the header. */
  feet: number;
  /** Anything beyond the universal quiet-hot pass. Runs on the RAW canvas, before trim. */
  op?: (img: Img) => void;
}

const SPECS: readonly Spec[] = [
  // Risen dead, upright — rigged, south rotation.
  { unit: "skeleton_warrior", raw: "south", world: 25, feet: 0.05 }, // red blade -> rusted iron via quietHot
  { unit: "grave_guard",      raw: "south", world: 26, feet: 0.05 }, // saturated shield wood quietened
  { unit: "blood_servant",    raw: "south", world: 24, feet: 0.05 },
  { unit: "decoy_husk",       raw: "south", world: 24, feet: 0.05 }, // clothes generated as saturated brick red
  { unit: "ghost_deckhand",   raw: "south", world: 24, feet: 0.05 }, // gold trim on the whites quietened
  // Risen dead, floating — free-form, hem instead of feet.
  { unit: "reaped_wraith",    raw: "free",  world: 24, feet: 0.12 },
  { unit: "limbo_shade",      raw: "free",  world: 24, feet: 0.18 }, // dissolves into a smoke skirt
  { unit: "kept_name",        raw: "free",  world: 24, feet: 0.05 },
  // Constructs — free-form.
  { unit: "auto_turret",      raw: "free",  world: 19, feet: 0.05 },
  { unit: "bone_turret",      raw: "free",  world: 19, feet: 0.05 },
  { unit: "mortar_pod",       raw: "free",  world: 18, feet: 0.05 },
  { unit: "shield_generator", raw: "free",  world: 20, feet: 0.05 },
  { unit: "repair_drone",     raw: "free",  world: 14, feet: 0.45 }, // hovers about its position
  {
    unit: "siege_engine", raw: "free", world: 30, feet: 0.06,
    op: (img) => {
      // Generated standing on a flat lavender-grey shadow plate (#615d70): 140 of its
      // 146 pixels sit in the bottom 16 rows of the 64px canvas, the other six are
      // legitimate plate shading on the body. Erase the plate; the game draws its own.
      const n = eraseFlat(img, [97, 93, 112], 48);
      console.log(`  erased ${n}px of baked shadow plate`);
    },
  },
  // Beast — rigged quadruped, south.
  { unit: "spirit_wolf",      raw: "south", world: 20, feet: 0.05 },
  // Spirits & birds — free-form.
  { unit: "falcon",           raw: "free",  world: 14, feet: 0.5 },
  { unit: "spirit_hawk",      raw: "free",  world: 14, feet: 0.5 },
  { unit: "moon_guardian",    raw: "free",  world: 24, feet: 0.1 },
  { unit: "elder_spirit",     raw: "free",  world: 25, feet: 0.05 },
  { unit: "healing_spirit",   raw: "free",  world: 12, feet: 0.45 },
  { unit: "healing_bloom",    raw: "free",  world: 16, feet: 0.05 },
];

// --- scope: the roster comes from the data, not from the list above ---------------------
//
// The first pass of this art shipped with the README saying 21 raws and the disk holding
// 20 — the falcon's generation had completed but was never saved, and nothing would have
// noticed: a finish script over "whatever raws are here" writes 20 PNGs, the seam falls
// back to the triangle for the 21st, silently and forever. So the expected set is walked
// from `SUMMON_UNITS` (every unit the game can spawn) minus the player-copy family (drawn
// as the hero, never authored), and this script refuses to run over a list that disagrees
// with it in either direction.
const expected = SUMMON_UNITS.filter((u) => !PLAYER_COPY_UNITS.has(u));
const listed = new Set(SPECS.map((s) => s.unit));
const missing = expected.filter((u) => !listed.has(u));
const stale = SPECS.filter((s) => !expected.includes(s.unit)).map((s) => s.unit);
console.log(`walked ${SUMMON_UNITS.length} summon units: ${PLAYER_COPY_UNITS.size} player copies, `
  + `${expected.length} bodies to draw, ${SPECS.length} specs here`);
if (missing.length || stale.length) {
  console.log(`REFUSED: specs disagree with SUMMON_UNITS — missing [${missing.join(", ")}], stale [${stale.join(", ")}]`);
  process.exit(1);
}

const OUT_DIR = "src/render/atlas/summons";
mkdirSync(OUT_DIR, { recursive: true });

const atlasRows: string[] = [];
const unitRows: string[] = [];
let refused = 0;

for (const spec of SPECS) {
  const id = `summon.${spec.unit.replace(/_/g, "-")}`;
  const rawPath = spec.raw === "south"
    ? `art/summons/rotations/${id}.south.raw.png`
    : `art/summons/${id}.raw.png`;
  if (!existsSync(rawPath)) {
    console.log(`\n${id}: NO RAW at ${rawPath} — skipped, not written`);
    refused++;
    continue;
  }
  const raw = decode(readFileSync(rawPath));
  const before = accentReport(raw);
  console.log(`\n${id}: before  ${before.text}`);
  spec.op?.(raw);
  const quieted = quietHot(raw);
  const img = trim(raw);
  const after = accentReport(img);
  console.log(`${id}: after   ${after.text}${quieted ? `  (quieted ${quieted}px)` : ""}`);
  if (after.hot > 0) {
    // The rule, not a check: a summon PNG with a hot pixel does not get written.
    console.log(`${id}: REFUSED — still carries ${after.hot} hot pixel(s) after the pass`);
    refused++;
    continue;
  }
  writeFileSync(`${OUT_DIR}/${id}.png`, encode(img));
  const worldScale = Number((spec.world / img.h).toFixed(4));
  atlasRows.push(
    `  "${id}": { id: "${id}", w: ${img.w}, h: ${img.h}, worldScale: ${worldScale}, feet: ${spec.feet} },`
    + ` // ${img.h} * ${worldScale} = ${(img.h * worldScale).toFixed(1)}`,
  );
  unitRows.push(`  ${spec.unit}: "${id}",`);
}

console.log(`\n--- ATLAS rows (${atlasRows.length}) ---`);
for (const r of atlasRows) console.log(r);
console.log(`\n--- SUMMON_UNIT_ART rows (${unitRows.length}) ---`);
for (const r of unitRows) console.log(r);
console.log(`\nwrote ${atlasRows.length} of ${SPECS.length} summon PNGs to ${OUT_DIR}`
  + (refused ? ` — ${refused} REFUSED or missing, see above` : ""));
if (refused) process.exit(1);
