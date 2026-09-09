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
 * ## The three rules this pass had to learn the hard way
 *
 * 1. **Author in stage space.** Every piece is drawn onto the full
 *    `HERO_STAGE_W`x`HERO_STAGE_H` canvas where it belongs on the hero and only then
 *    trimmed, so the trim offset *is* `dx`/`dy`. Placement stops being a guess.
 * 2. **Measure the head.** The hero's eye band is his rows 9-11 => stage y 34. Estimating
 *    it put the first pass's glasses and visor on his forehead.
 * 3. **Read `data/cosmetics.ts` before drawing.** A piece can only show structure in
 *    colours its own `Cosmetic.colors` actually distinguish — see `backAngel` (three
 *    near-whites, so its feathers are separated in ink) and `earsCat` (near-black
 *    `colors[0]`, invisible against his hair, so the pink carries the shape).
 *
 * Rerun `npm test` after any edit: the hero-portrait block in `tools/smoke.ts` checks the
 * sizes, the stage fit and that nothing is clipped.
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

type Key = "." | "O" | "1" | "2" | "3";

class Grid {
  readonly cells: Key[];
  constructor(readonly w: number, readonly h: number) { this.cells = new Array(w * h).fill("."); }
  get(x: number, y: number): Key { return x < 0 || y < 0 || x >= this.w || y >= this.h ? "." : this.cells[y * this.w + x]!; }
  set(x: number, y: number, k: Key) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = k; }
  /** Set only if the cell isn't ink — interior detail never overwrites an outline. */
  detail(x: number, y: number, k: Key) { if (this.get(x, y) !== "O" && this.get(x, y) !== ".") this.set(x, y, k); }

  rect(x0: number, y0: number, x1: number, y1: number, k: Key) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, k);
  }
  /** Filled triangle through three points. */
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, k: Key) {
    const minx = Math.min(ax, bx, cx), maxx = Math.max(ax, bx, cx);
    const miny = Math.min(ay, by, cy), maxy = Math.max(ay, by, cy);
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
    for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) for (let x = Math.ceil(cx - rx); x <= cx + rx; x++) {
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

const W = 79, H = 81, CX = 39, HEAD_TOP = 24, HEAD_L = 31, HEAD_R = 47;

const build: Record<string, () => Grid> = {
  // Gold crown: five points on a banded rim, one red stone. Rim overlaps the top of the
  // head by four rows so it sits *on* him rather than floating above.
  "cosmetic.hat-crown": () => {
    const g = new Grid(W, H);
    const pts: Array<[number, number]> = [[31, 17], [35, 15], [39, 12], [43, 15], [47, 17]];
    for (const [x, tip] of pts) g.tri(x, tip, x - 4, 24, x + 4, 24, "1");
    g.rect(29, 21, 49, 27, "1");
    g.outline();
    g.rect(30, 25, 48, 26, "2");           // banded shadow under the rim
    for (const [x] of pts) g.detail(x, 20, "2");
    g.ell(CX, 23, 2.2, 2.2, "3");          // the stone
    return g;
  },

  // Pointed witch hat: floppy brim resting on the head, cone leaning back-left, gold band.
  "cosmetic.hat-witch": () => {
    const g = new Grid(W, H);
    g.tri(30, 25, 48, 25, 26, 2, "1");     // the cone, tip leaning left
    g.ell(CX, 25, 19, 4.2, "1");           // the brim
    g.outline();
    g.rect(31, 19, 47, 22, "3");           // the band
    g.ell(CX, 26, 17, 2.4, "2");           // brim underside shadow
    for (let y = 4; y < 19; y++) g.detail(Math.round(30 - (19 - y) * 0.28) + 3, y, "2");
    return g;
  },

  // Cat ears: broad triangles rooted into the hair. This cosmetic's colors[0] is
  // near-black (#1f2937) and the hero's hair is dark, so a dark-fill ear disappears and
  // only its pink inner reads — which looks like two pink shapes floating over his head.
  // So the **pink** (colors[1], which for this item equals colors[2]) carries the shape
  // and the dark is only a rim inside the ink outline.
  "cosmetic.ears-cat": () => {
    const g = new Grid(W, H);
    g.tri(31, 30, 40, 30, 34, 18, "1");
    g.tri(47, 30, 38, 30, 44, 18, "1");
    g.outline();
    g.tri(32, 29, 39, 29, 34, 19, "2");
    g.tri(46, 29, 39, 29, 44, 19, "2");
    return g;
  },

  // Small horns — small is the point (the item is literally "Small Horns"): thick at the
  // base and rooted several rows into the hair so they read as growing out of the skull,
  // tapering as they curve up and out.
  "cosmetic.ears-horn": () => {
    const g = new Grid(W, H);
    const horn = (sx: number, dir: number) => {
      const pts: Array<[number, number, number]> = [
        [sx, 33, 4], [sx, 30, 3.6], [sx + dir * 1, 28, 3],
        [sx + dir * 2.5, 26, 2.3], [sx + dir * 4, 24.5, 1.5],
      ];
      for (const [x, y, r] of pts) g.ell(x, y, r, r, "1");
    };
    horn(34, -1); horn(44, 1);
    g.outline();
    g.ell(34, 31, 2.2, 2.2, "2"); g.ell(44, 31, 2.2, 2.2, "2");
    g.ell(30, 24.5, 0.9, 0.9, "3"); g.ell(48, 24.5, 0.9, 0.9, "3");
    return g;
  },

  // Round spectacles centred on the eye band (hero rows 9-11 => stage y 34). The frame is
  // colors[1] and wants to be two cells thick or it vanishes against a dark head.
  "cosmetic.face-glasses": () => {
    const g = new Grid(W, H);
    g.ell(35, 34, 4.4, 3.8, "2"); g.ell(43, 34, 4.4, 3.8, "2");
    g.rect(38, 34, 40, 34, "2");
    g.rect(29, 33, 31, 34, "2"); g.rect(47, 33, 49, 34, "2");
    g.outline();
    g.ell(35, 34, 2, 1.6, "1"); g.ell(43, 34, 2, 1.6, "1");
    g.detail(34, 33, "3"); g.detail(42, 33, "3");
    return g;
  },

  // A visor band across the eye row: dark shell, one lit strip, one hard glint.
  "cosmetic.face-visor": () => {
    const g = new Grid(W, H);
    g.ell(CX, 34, 10, 3.4, "1");
    g.rect(30, 32, 48, 35, "1");
    g.outline();
    g.rect(31, 33, 47, 34, "1");
    g.rect(31, 35, 47, 35, "2");
    g.line(33, 33, 37, 33, "3");
    return g;
  },

  // Cape: it hangs *behind* the hero, so every row of it has to be wider than he is or
  // it simply is not there — he runs x22..56 at the shoulders and x20..58 at the hips.
  // A collar at the neck, then a steady flare past both. Vertical folds in colors[1] stop
  // it reading as one flat sheet.
  "cosmetic.back-cape": () => {
    const g = new Grid(W, H);
    g.tri(26, 37, 52, 37, 10, 75, "1");
    g.tri(52, 37, 68, 75, 10, 75, "1");
    g.rect(26, 37, 52, 42, "1");
    g.ell(CX, 38, 12, 3, "1");            // the collar
    g.outline();
    for (const [x0, x1] of [[-15, -23], [-7, -11], [7, 11], [15, 23]] as const)
      g.line(CX + x0, 46, CX + x1, 73, "2");
    return g;
  },

  // Feathered wings: two solid sweeps rising from the shoulders, separated into feather
  // banks by **ink** lines — the one key `recoloredCosmetic` never swaps. That matters
  // here because all three of this cosmetic's colours are near-white (#f8fafc/#e0f2fe/
  // #ffffff), so any structure drawn in a marker colour would be invisible.
  "cosmetic.back-wings-angel": () => {
    const g = new Grid(W, H);
    const wing = (dir: number) => {
      const bx = CX + dir * 4;
      g.tri(bx, 38, bx + dir * 30, 30, bx + dir * 13, 70, "1");
      g.ell(bx + dir * 14, 44, 14, 11, "1");
    };
    wing(-1); wing(1);
    g.rect(32, 36, 46, 56, ".");           // keep the hero's own back clear
    g.outline();
    for (const dir of [-1, 1]) {
      const bx = CX + dir * 4;
      for (const [i, len] of [[0, 24], [1, 21], [2, 17], [3, 13]] as const)
        g.line(bx + dir * 7, 40 + i * 6, bx + dir * len, 45 + i * 6, "O");
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

const OUT = process.argv[2]!;
const rows: string[] = [];
for (const [id, make] of Object.entries(build)) {
  const { grid, dx, dy } = make().trimmed();
  writeFileSync(`${OUT}/${id}.png`, png(grid.w, grid.h, toRgba(grid)));
  rows.push(`${id}: w ${grid.w}, h ${grid.h}, dx ${dx}, dy ${dy}`);
}
console.log(rows.join("\n"));
