/**
 * Source of record for the migrated cosmetic layers under
 * `src/render/atlas/cosmetics/` — run it to regenerate every one of them:
 *
 *   npx esbuild art/cosmetics/author.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/cosauthor.mjs && \
 *     node node_modules/.cache/cosauthor.mjs src/render/atlas/cosmetics
 *
 * It prints one `w/h/dx/dy` line per piece; those are the `ATLAS_COSMETICS` rows in
 * `render/atlas/manifest.ts`, and `tools/smoke.ts` fails if a PNG and its row disagree.
 *
 * ## Why these are drawn rather than generated
 *
 * They were PixelLab generations quantized to four colours until the v4 hero redraw. The
 * quantize was destroying them — an accessory 15-70px across has nothing left after being
 * crushed to `[ink, colors[0], colors[1], colors[2]]`, and the wings landed as one flat
 * slab, the ears as a blob. At this size an accessory is better drawn than generated. The
 * `.raw.png` / `.trim.png` files next to this script are those superseded generations,
 * kept as history; they are **not** what ships any more.
 *
 * ## Author against the HERO, never against a stage
 *
 * Every piece used to be drawn in absolute coordinates on a fixed 79x81 stage, with the
 * v4 hero's head hardcoded at rows 24+ and x31-47. When hero A (16x41) replaced v4
 * (39x57) the numbers stayed, and the whole wardrobe silently stayed sized for a body
 * that no longer existed — the witch hat ended up **2.44x the hero's width**, the angel
 * wings **4.31x**, and `npm test` stayed green throughout (see the stage-fit note in
 * `tools/smoke.ts`).
 *
 * So the geometry below is **measured off `hero.legend-base.png` at run time** — head
 * top, skull span, eye row, shoulder span, body length — and every piece is expressed in
 * those terms. Change the hero and re-run this script: the wardrobe follows him. Nothing
 * here may hardcode a stage dimension, because the stage is derived from these layers
 * and a number that flows both ways is how the last body-swap went unnoticed.
 *
 * The emitted `dx`/`dy` are **anchored, not absolute**: `dx` is an offset from the
 * hero's centre and `dy` is measured from the head top (`anchor: "head"`) or from the
 * ground under his feet (`anchor: "feet"`), matching `cosmeticStageXY` in the manifest.
 *
 * ## The three rules this pass had to learn the hard way
 *
 * 1. **Author relative to a measured landmark**, never to a canvas coordinate.
 * 2. **Measure the head.** The eye row is found by scanning the PNG, not estimated —
 *    estimating it put an earlier pass's glasses and visor on his forehead.
 * 3. **Read `data/cosmetics.ts` before drawing.** A piece can only show structure in
 *    colours its own `Cosmetic.colors` actually distinguish — see `backAngel` (three
 *    near-whites, so its feathers are separated in ink) and `earsCat` (near-black
 *    `colors[0]`, invisible against his hair, so the pink carries the shape).
 *
 * Rerun `npm test` after any edit: the hero-portrait block in `tools/smoke.ts` checks the
 * sizes, that every layer is proportionate to the hero, and that nothing is clipped.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decodePng } from "../../tools/png";
import { deflateSync } from "node:zlib";

type Key = "." | "O" | "1" | "2" | "3";

class Grid {
  readonly cells: Key[];
  constructor(readonly w: number, readonly h: number) { this.cells = new Array(w * h).fill("."); }
  get(x: number, y: number): Key {
    const px = Math.round(x), py = Math.round(y);
    return px < 0 || py < 0 || px >= this.w || py >= this.h ? "." : this.cells[py * this.w + px]!;
  }
  /**
   * Snaps to the pixel lattice. Builders express geometry in fractions of a measured
   * landmark, so vertices are routinely non-integer; without this the loops below step
   * 46.4, 47.4, ... and every write lands on a non-integer array index, which JavaScript
   * accepts silently and which draws nothing at all.
   */
  set(x: number, y: number, k: Key) {
    const px = Math.round(x), py = Math.round(y);
    if (px >= 0 && py >= 0 && px < this.w && py < this.h) this.cells[py * this.w + px] = k;
  }
  /** Set only if the cell isn't ink — interior detail never overwrites an outline. */
  detail(x: number, y: number, k: Key) { if (this.get(x, y) !== "O" && this.get(x, y) !== ".") this.set(x, y, k); }

  rect(x0: number, y0: number, x1: number, y1: number, k: Key) {
    for (let y = Math.round(y0); y <= Math.round(y1); y++)
      for (let x = Math.round(x0); x <= Math.round(x1); x++) this.set(x, y, k);
  }
  /** Filled triangle through three points. */
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, k: Key) {
    const minx = Math.floor(Math.min(ax, bx, cx)), maxx = Math.ceil(Math.max(ax, bx, cx));
    const miny = Math.floor(Math.min(ay, by, cy)), maxy = Math.ceil(Math.max(ay, by, cy));
    const s = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
      (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) this.set(x, y, k);
    }
  }
  /** Filled ellipse with centre (cx,cy) and radii (rx,ry). */
  ell(cx: number, cy: number, rx: number, ry: number, k: Key) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) this.set(x, y, k);
    }
  }
  /** Thick line from a to b. */
  line(ax: number, ay: number, bx: number, by: number, k: Key, t = 1) {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) || 1;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(ax + ((bx - ax) * i) / n), y = Math.round(ay + ((by - ay) * i) / n);
      for (let dy = 0; dy < t; dy++) for (let dx = 0; dx < t; dx++) this.set(x + dx, y + dy, k);
    }
  }
  /** Mirror the left half onto the right — keeps a symmetric piece exactly symmetric. */
  mirror() {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < Math.floor(this.w / 2); x++)
      this.set(this.w - 1 - x, y, this.get(x, y));
  }
  /** §17.2: every filled cell touching transparency becomes ink. Run last, before detail. */
  outline() {
    const snapshot = [...this.cells];
    const at = (x: number, y: number) => x < 0 || y < 0 || x >= this.w || y >= this.h ? "." : snapshot[y * this.w + x]!;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (at(x, y) === ".") continue;
      if (at(x-1,y) === "." || at(x+1,y) === "." || at(x,y-1) === "." || at(x,y+1) === ".") this.set(x, y, "O");
    }
  }
  /** Trim to the bounding box of non-transparent cells; returns the offset removed. */
  trimmed(): { grid: Grid; dx: number; dy: number } {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
      if (this.get(x, y) !== ".") { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const g = new Grid(x1 - x0 + 1, y1 - y0 + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.set(x - x0, y - y0, this.get(x, y));
    return { grid: g, dx: x0, dy: y0 };
  }
}

const INK = "#141019";
const MARKS: Record<string, string> = { O: INK, "1": "#ff00ff", "2": "#00ff00", "3": "#00ffff" };
function toRgba(g: Grid): Uint8Array {
  const out = new Uint8Array(g.w * g.h * 4);
  for (let i = 0; i < g.cells.length; i++) {
    const k = g.cells[i]!;
    if (k === ".") continue;
    const hex = MARKS[k]!, n = parseInt(hex.slice(1), 16);
    out[i*4] = (n >> 16) & 255; out[i*4+1] = (n >> 8) & 255; out[i*4+2] = n & 255; out[i*4+3] = 255;
  }
  return out;
}

/**
 * The hero, measured. Every landmark below is read off the shipped PNG rather than
 * written down, so a hero swap moves the whole wardrobe instead of stranding it.
 */
function measureHero() {
  const png = decodePng(readFileSync("src/render/atlas/characters/hero.legend-base.png"));
  const d = new Uint8Array(png.data);
  const opaque = (x: number, y: number) => d[(y * png.width + x) * 4 + 3]! > 8;
  const lum = (x: number, y: number) => {
    const i = (y * png.width + x) * 4;
    return 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
  };
  const bounds = (y: number) => {
    let l = -1, r = -1;
    for (let x = 0; x < png.width; x++) if (opaque(x, y)) { if (l < 0) l = x; r = x; }
    return { l, r, w: l < 0 ? 0 : r - l + 1 };
  };
  const rows = Array.from({ length: png.height }, (_, y) => bounds(y));

  // The neck is the narrowest row in the top third — the head sits above it.
  const upper = rows.slice(0, Math.floor(png.height / 3) + 2);
  let neckY = 0, neckW = Infinity;
  upper.forEach((r, y) => { if (y > 2 && r.w > 0 && r.w <= neckW) { neckW = r.w; neckY = y; } });

  // The eye row: within the head, the row whose skin band is most interrupted by dark
  // pixels. Scanning beats estimating — see rule 2.
  let eyeY = 0, best = -1;
  for (let y = 3; y < neckY; y++) {
    const { l, r } = rows[y]!;
    if (l < 0) continue;
    let dark = 0, lit = 0;
    for (let x = l + 1; x < r; x++) (lum(x, y) < 60 ? dark++ : lit++);
    const score = lit > 0 ? dark * lit : 0;
    if (score > best) { best = score; eyeY = y; }
  }

  const widestRow = Math.max(...rows.map((r) => r.w));
  const shoulderY = rows.findIndex((r, y) => y > neckY && r.w === widestRow);
  const headW = Math.max(...rows.slice(0, neckY + 1).map((r) => r.w));
  const skull = rows[Math.max(0, Math.floor(neckY / 2))]!;
  return {
    w: png.width, h: png.height,
    neckY, eyeY, shoulderY, headW, widestRow,
    skullL: skull.l, skullR: skull.r,
    eyeL: rows[eyeY]!.l, eyeR: rows[eyeY]!.r,
  };
}

const HERO = measureHero();

/**
 * The work canvas. Generous margin on every side; the hero is centred horizontally and
 * placed far enough down that a tall hat has room. Nothing is trimmed against these
 * numbers — they exist only so a piece can be drawn, and the trim decides the real size.
 */
const W = 96, H = 128;
/** Hero placement on the work canvas. */
const HX = Math.round(W / 2 - HERO.w / 2), HY = 44;
/** Landmarks, in work-canvas coordinates. */
const CX = HX + HERO.w / 2;                    // hero centre
const HEAD_TOP = HY;                           // top of the head
const SKULL_L = HX + HERO.skullL, SKULL_R = HX + HERO.skullR;
const EYE_Y = HY + HERO.eyeY;                  // the eye row
const SHOULDER_L = HX, SHOULDER_R = HX + HERO.w - 1;
const FEET = HY + HERO.h;                      // one row past his feet — the ground
const BODY_LEN = HERO.h - HERO.neckY;          // neck to feet
/** Half-widths the pieces are scaled against. */
const HEAD_HW = HERO.headW / 2;                // hats/ears/glasses read against the head
const BODY_HW = HERO.widestRow / 2;            // capes/wings read against the silhouette

const build: Record<string, () => Grid> = {
  // Gold crown: five points on a banded rim, one red stone. The rim overlaps the top of
  // the head so it sits *on* him rather than floating above. Scaled to the head.
  "cosmetic.hat-crown": () => {
    const g = new Grid(W, H);
    const rimW = Math.round(HEAD_HW * 0.92);       // sits on the skull, not past it
    const rimTop = HEAD_TOP + 1, rimBot = HEAD_TOP + 4;
    const rise = Math.round(HEAD_HW * 0.85);       // how far the centre point rises
    const pts: Array<[number, number]> = [
      [CX - rimW, rimTop - Math.round(rise * 0.45)],
      [CX - rimW * 0.5, rimTop - Math.round(rise * 0.72)],
      [CX, rimTop - rise],
      [CX + rimW * 0.5, rimTop - Math.round(rise * 0.72)],
      [CX + rimW, rimTop - Math.round(rise * 0.45)],
    ];
    for (const [x, tip] of pts) g.tri(x, tip, x - 2.2, rimTop + 1, x + 2.2, rimTop + 1, "1");
    g.rect(CX - rimW - 1, rimTop, CX + rimW + 1, rimBot, "1");
    g.outline();
    g.rect(CX - rimW, rimBot - 1, CX + rimW, rimBot - 1, "2");   // banded shadow
    g.ell(CX, rimTop + 2, 1.2, 1.2, "3");                        // the stone
    return g;
  },

  // Pointed witch hat: a floppy brim resting on the head and a cone leaning back-left.
  // The brim reads against the SILHOUETTE, not the head — a witch brim is meant to
  // overhang the shoulders, and scaling it off the head made it a flying saucer.
  "cosmetic.hat-witch": () => {
    const g = new Grid(W, H);
    const brimHW = Math.round(BODY_HW * 1.05);
    const brimY = HEAD_TOP + 2;
    const tip = HEAD_TOP - Math.round(HERO.h * 0.33);
    g.tri(CX - brimHW * 0.55, brimY, CX + brimHW * 0.55, brimY, CX - brimHW * 0.5, tip, "1");
    g.ell(CX, brimY, brimHW, Math.max(1.6, brimHW * 0.22), "1");
    g.outline();
    const bandY = HEAD_TOP - 1;
    g.rect(CX - brimHW * 0.5, bandY - 1, CX + brimHW * 0.42, bandY, "3");   // the band
    g.ell(CX, brimY + 1, brimHW - 1.5, 1.1, "2");                           // underside
    return g;
  },

  // Cat ears: broad triangles rooted into the hair. This cosmetic's colors[0] is
  // near-black (#1f2937) and the hero's hair is dark, so a dark-fill ear disappears and
  // only its pink inner reads — which looks like two pink shapes floating over his head.
  // So the **pink** (colors[1], which for this item equals colors[2]) carries the shape
  // and the dark is only a rim inside the ink outline.
  "cosmetic.ears-cat": () => {
    const g = new Grid(W, H);
    const rise = Math.round(HEAD_HW * 0.95);
    const base = HEAD_TOP + 3;
    const ear = (dir: number) => {
      const outer = CX + dir * HEAD_HW, inner = CX + dir * HEAD_HW * 0.22;
      g.tri(outer, base, inner, base, CX + dir * HEAD_HW * 0.68, base - rise, "1");
    };
    ear(-1); ear(1);
    g.outline();
    for (const dir of [-1, 1]) {
      const outer = CX + dir * (HEAD_HW - 1), inner = CX + dir * HEAD_HW * 0.45;
      g.tri(outer, base - 1, inner, base - 1, CX + dir * HEAD_HW * 0.68, base - rise + 1, "2");
    }
    return g;
  },

  // Small horns — small is the point (the item is literally "Small Horns"): thick at the
  // base and rooted a few rows into the hair so they read as growing out of the skull,
  // tapering as they curve up and out.
  "cosmetic.ears-horn": () => {
    const g = new Grid(W, H);
    const base = HEAD_TOP + 4, rise = Math.round(HEAD_HW * 0.8);
    const horn = (dir: number) => {
      const sx = CX + dir * HEAD_HW * 0.55;
      const steps: Array<[number, number, number]> = [
        [sx, base, 1.9], [sx + dir * 0.4, base - rise * 0.35, 1.6],
        [sx + dir * 1.1, base - rise * 0.65, 1.2], [sx + dir * 2.0, base - rise, 0.8],
      ];
      for (const [x, y, r] of steps) g.ell(x, y, r, r, "1");
    };
    horn(-1); horn(1);
    g.outline();
    for (const dir of [-1, 1]) {
      g.ell(CX + dir * HEAD_HW * 0.55, base - 1, 1, 1, "2");
      g.ell(CX + dir * (HEAD_HW * 0.55 + 2.0), base - rise, 0.6, 0.6, "3");
    }
    return g;
  },

  // Round spectacles centred on the measured eye row. The frame is colors[1] and wants
  // to be two cells thick or it vanishes against a dark head.
  "cosmetic.face-glasses": () => {
    const g = new Grid(W, H);
    // Sit the lenses on his actual eyes rather than on a guessed separation.
    const sep = Math.max(2, Math.round(HERO.headW * 0.19));
    const lx = CX - sep, rx = CX + sep, r = Math.max(1.4, sep * 0.9);
    g.ell(lx, EYE_Y, r, r * 0.85, "2"); g.ell(rx, EYE_Y, r, r * 0.85, "2");
    g.rect(lx + 1, EYE_Y, rx - 1, EYE_Y, "2");                    // the bridge
    g.rect(CX - HEAD_HW, EYE_Y - 1, lx - 1, EYE_Y - 1, "2");      // arms
    g.rect(rx + 1, EYE_Y - 1, CX + HEAD_HW, EYE_Y - 1, "2");
    g.outline();
    g.ell(lx, EYE_Y, r - 1.1, r * 0.85 - 0.9, "1");
    g.ell(rx, EYE_Y, r - 1.1, r * 0.85 - 0.9, "1");
    g.detail(lx - 1, EYE_Y - 1, "3"); g.detail(rx - 1, EYE_Y - 1, "3");
    return g;
  },

  // A visor band across the measured eye row: dark shell, one lit strip, one hard glint.
  "cosmetic.face-visor": () => {
    const g = new Grid(W, H);
    const hw = Math.round(HEAD_HW * 0.95);
    g.ell(CX, EYE_Y, hw, 1.6, "1");
    g.rect(CX - hw + 1, EYE_Y - 1, CX + hw - 1, EYE_Y + 1, "1");
    g.outline();
    g.rect(CX - hw + 2, EYE_Y, CX + hw - 2, EYE_Y, "1");
    g.rect(CX - hw + 2, EYE_Y + 1, CX + hw - 2, EYE_Y + 1, "2");
    g.line(CX - hw + 2, EYE_Y - 1, CX - hw + 4, EYE_Y - 1, "3");
    return g;
  },

  // Cape: it hangs *behind* the hero, so every row of it has to be wider than he is or
  // it simply is not there. A collar at the neck, then a steady flare past his widest
  // row. Vertical folds in colors[1] stop it reading as one flat sheet.
  "cosmetic.back-cape": () => {
    const g = new Grid(W, H);
    const top = HY + HERO.neckY;                    // hangs from the neck
    const hem = FEET - Math.round(BODY_LEN * 0.10); // stops just above the ground
    const shoulderHW = BODY_HW + 1.5, hemHW = BODY_HW * 1.55;
    g.tri(CX - shoulderHW, top, CX + shoulderHW, top, CX - hemHW, hem, "1");
    g.tri(CX + shoulderHW, top, CX + hemHW, hem, CX - hemHW, hem, "1");
    g.ell(CX, top + 1, shoulderHW * 0.75, 1.6, "1");   // the collar
    g.outline();
    for (const f of [-0.62, -0.24, 0.24, 0.62])
      g.line(CX + f * shoulderHW, top + 4, CX + f * hemHW * 1.12, hem - 1, "2");
    return g;
  },

  // Feathered wings: two solid sweeps rising from the shoulders, separated into feather
  // banks by **ink** lines — the one key `recoloredCosmetic` never swaps. That matters
  // here because all three of this cosmetic's colours are near-white (#f8fafc/#e0f2fe/
  // #ffffff), so any structure drawn in a marker colour would be invisible.
  "cosmetic.back-wings-angel": () => {
    const g = new Grid(W, H);
    const top = HY + HERO.neckY + 1;               // rise from the shoulders, not below them
    const span = BODY_HW * 1.32, drop = Math.round(BODY_LEN * 0.8);
    const wing = (dir: number) => {
      const bx = CX + dir * BODY_HW * 0.45;
      g.tri(bx, top, bx + dir * span, top - Math.round(drop * 0.28), bx + dir * span * 0.55, top + drop, "1");
      g.ell(bx + dir * span * 0.5, top + drop * 0.3, span * 0.52, drop * 0.42, "1");
    };
    wing(-1); wing(1);
    // Keep the hero's own spine clear so the wings read as being behind him — but only
    // the centre of it. Clearing his full shoulder span (v4 cleared ~38% of its hero's
    // width) cut both sweeps back to slivers.
    g.rect(CX - BODY_HW * 0.38, top, CX + BODY_HW * 0.38, FEET, ".");
    g.outline();
    for (const dir of [-1, 1]) {
      const bx = CX + dir * BODY_HW * 0.45;
      for (const [i, len] of [[0, 0.95], [1, 0.8], [2, 0.6], [3, 0.4]] as const)
        g.line(bx + dir * BODY_HW * 0.5, top + 2 + i * Math.round(drop * 0.2),
               bx + dir * span * len, top + 5 + i * Math.round(drop * 0.2), "O");
    }
    return g;
  },
};

// --- emit -------------------------------------------------------------------
let T: number[] | null = null;
function crc32(b: Buffer): number {
  if (!T) { T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T.push(c >>> 0); } }
  let c = 0xffffffff; for (const byte of b) c = T[(c ^ byte) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w: number, h: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y*(w*4+1)] = 0; Buffer.from(rgba.subarray(y*w*4, (y+1)*w*4)).copy(raw, y*(w*4+1)+1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Which landmark each piece hangs from, matching `AtlasCosmetic.anchor`. A hat, ears and
 * glasses follow the **head**; a cape and wings reach the ground, so they follow the
 * **feet**. `Record<...>` on the build keys, so a new piece cannot be added without
 * saying where it hangs.
 */
const ANCHOR: Record<keyof typeof build, "head" | "feet"> = {
  "cosmetic.hat-crown": "head",
  "cosmetic.hat-witch": "head",
  "cosmetic.ears-cat": "head",
  "cosmetic.ears-horn": "head",
  "cosmetic.face-glasses": "head",
  "cosmetic.face-visor": "head",
  "cosmetic.back-cape": "feet",
  "cosmetic.back-wings-angel": "feet",
};

const OUT = process.argv[2]!;
const rows: string[] = [];
console.log(
  `hero ${HERO.w}x${HERO.h} — head ${HERO.headW} wide over rows 0-${HERO.neckY}, ` +
  `eye row ${HERO.eyeY}, shoulders ${HERO.widestRow} wide from row ${HERO.shoulderY}, ` +
  `body length ${BODY_LEN}\n`);
for (const [id, make] of Object.entries(build)) {
  const { grid, dx, dy } = make().trimmed();
  writeFileSync(`${OUT}/${id}.png`, png(grid.w, grid.h, toRgba(grid)));
  const anchor = ANCHOR[id]!;
  // Anchored, not absolute — see the header. `dx` is measured from the hero's centre and
  // `dy` from the head top or from the ground, exactly as `cosmeticStageXY` reads them.
  const adx = dx - Math.round(W / 2 - grid.w / 2);
  const ady = anchor === "head" ? dy - HY : dy - FEET;
  rows.push(
    `  ${id.replace("cosmetic.", "").padEnd(17)} w: ${String(grid.w).padStart(2)}, ` +
    `h: ${String(grid.h).padStart(2)}, dx: ${adx}, dy: ${ady}, anchor: "${anchor}"` +
    `   (${(grid.w / HERO.w).toFixed(2)}x hero width)`);
}
console.log(rows.join("\n"));
