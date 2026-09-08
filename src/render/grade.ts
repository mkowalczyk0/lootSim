/**
 * The floor grade: a colour pass that pulls a PixelLab corner-Wang tileset down
 * into the Citadel deck's register before it is stamped over a floor.
 *
 * Every sheet the pipeline produced was, on its own, a perfectly good 64px
 * tileset — and every one of them read as "too much" in the game: palettes far
 * louder and more saturated than the deck (`hub.citadel-deck`, the palette *and*
 * pixel-density reference), stark white-on-black contrast, and an internal
 * texture so busy that a big room turned into graph paper. The deck is calm,
 * muted, mid-grey stone with two or three flat shapes per tile; a dungeon floor
 * has to sit in that same register or the hero, monsters and props standing on
 * it never blend.
 *
 * Four operations, in order, all per pixel and all cheap enough to run once per
 * sheet at bake time:
 *
 * 1. **Flatten.** Each pixel is pulled toward the mean colour of the terrain it
 *    belongs to — the all-floor tile's mean or the all-rock tile's mean,
 *    whichever it is nearer — by `flatten`. This is what kills the busy internal
 *    texture: a crack, a pebble, a highlight all collapse toward their slab's
 *    colour while the *edge* between floor and wall, which is a jump between the
 *    two means, keeps its full contrast. Reducing detail without a blur, which
 *    pixel art can't survive.
 * 2. **Desaturate.** Mix each pixel toward its own luminance, keeping
 *    `saturation` of the chroma. Neon green and sky blue become dirty grey-green
 *    and slate.
 * 3. **Tint.** Alpha-blend the biome's own `tint` over everything at `tintAlpha`
 *    — the faint realm hue the guide asks for, and since every biome tint is
 *    dark it also drags a too-bright sheet down.
 * 4. **Shoulder.** Anything still brighter than `knee` is compressed above it by
 *    `shoulder` — a highlight roll-off, not a global contrast cut. A stark white
 *    wall comes down to the deck's pale flagstone; a dark floor under a mid-grey
 *    wall, which is already where we want it, keeps every bit of its separation.
 *    (An earlier version compressed contrast globally and quietly halved the
 *    floor↔wall delta of every *dark* set — the ones that needed it least.)
 *
 * Pure — operates on a raw RGBA byte array — so the smoke test can run the exact
 * same math over the committed sheets and fail a build whose floor and wall have
 * stopped being separable (§17.7 of the art style guide: contrast is a gameplay
 * requirement) instead of leaving that to a playtest.
 */

export interface GradeOptions {
  /** 0..1 — how far each pixel moves toward its terrain's mean colour. */
  readonly flatten: number;
  /** 0..1 — how much chroma survives (1 = untouched, 0 = greyscale). */
  readonly saturation: number;
  /** 0..1 — opacity of the biome tint blended over the sheet. */
  readonly tintAlpha: number;
  /** Channel value above which highlights start rolling off, 0..255. */
  readonly knee: number;
  /** 0..1 — slope above the knee (1 = no roll-off). */
  readonly shoulder: number;
}

/**
 * The one grade every floor tileset goes through. Tuned against the deck: a
 * sheet's floor and wall means land between roughly L 25 and L 140 afterwards,
 * with the busiest per-tile texture cut to a quarter of its spread.
 */
export const FLOOR_GRADE: GradeOptions = {
  flatten: 0.55,
  saturation: 0.5,
  tintAlpha: 0.3,
  knee: 100,
  shoulder: 0.55,
};

/** `#rrggbb` → [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rec. 709 relative luminance of an 8-bit RGB triple, 0..255. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mean RGB of one `tile`×`tile` box in an RGBA sheet `width` pixels wide. */
export function tileMean(
  data: Uint8ClampedArray | Uint8Array, width: number, tile: number, box: readonly [number, number],
): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = box[1]; y < box[1] + tile; y++) {
    for (let x = box[0]; x < box[0] + tile; x++) {
      const i = (y * width + x) * 4;
      r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n++;
    }
  }
  return [r / n, g / n, b / n];
}

/**
 * Mean luminance of one tile and the standard deviation of luminance inside it
 * — "how bright is this slab" and "how busy is it".
 */
export function tileLuminance(
  data: Uint8ClampedArray | Uint8Array, width: number, tile: number, box: readonly [number, number],
): { mean: number; spread: number } {
  const ls: number[] = [];
  for (let y = box[1]; y < box[1] + tile; y++) {
    for (let x = box[0]; x < box[0] + tile; x++) {
      const i = (y * width + x) * 4;
      ls.push(luminance(data[i]!, data[i + 1]!, data[i + 2]!));
    }
  }
  const mean = ls.reduce((a, v) => a + v, 0) / ls.length;
  const spread = Math.sqrt(ls.reduce((a, v) => a + (v - mean) * (v - mean), 0) / ls.length);
  return { mean, spread };
}

/**
 * Grades a corner-Wang sheet in place. `boxes` is the runtime's corner-mask →
 * sheet-position lookup (`boxes[0]` all floor, `boxes[15]` all rock), which is
 * how the flatten step knows what the two terrains look like. Alpha is left
 * alone.
 */
export function gradeSheet(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  tile: number,
  boxes: readonly (readonly [number, number])[],
  tintHex: string,
  opts: GradeOptions = FLOOR_GRADE,
): void {
  const floor = tileMean(data, width, tile, boxes[0]!);
  const rock = tileMean(data, width, tile, boxes[15]!);
  const [tr, tg, tb] = hexToRgb(tintHex);
  const { flatten, saturation, tintAlpha, knee, shoulder } = opts;

  for (let i = 0; i < width * height * 4; i += 4) {
    let r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;

    // 1. flatten toward the nearer terrain mean
    const df = (r - floor[0]) ** 2 + (g - floor[1]) ** 2 + (b - floor[2]) ** 2;
    const dr = (r - rock[0]) ** 2 + (g - rock[1]) ** 2 + (b - rock[2]) ** 2;
    const m = df < dr ? floor : rock;
    r += (m[0] - r) * flatten;
    g += (m[1] - g) * flatten;
    b += (m[2] - b) * flatten;

    // 2. desaturate toward luminance
    const l = luminance(r, g, b);
    r = l + (r - l) * saturation;
    g = l + (g - l) * saturation;
    b = l + (b - l) * saturation;

    // 3. biome tint
    r += (tr - r) * tintAlpha;
    g += (tg - g) * tintAlpha;
    b += (tb - b) * tintAlpha;

    // 4. highlight shoulder
    if (r > knee) r = knee + (r - knee) * shoulder;
    if (g > knee) g = knee + (g - knee) * shoulder;
    if (b > knee) b = knee + (b - knee) * shoulder;

    data[i] = r < 0 ? 0 : r > 255 ? 255 : Math.round(r);
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : Math.round(g);
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : Math.round(b);
  }
}
