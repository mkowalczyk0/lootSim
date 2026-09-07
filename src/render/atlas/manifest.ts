/**
 * The atlas manifest — one row per pipeline-authored sprite (Aseprite / PixelLab PNGs
 * under `src/render/atlas/`), describing how it sits in the world.
 *
 * This module is **pure** (no DOM), like `render/pixels.ts` next to it: the headless
 * tools and the smoke test can read a sprite's dimensions and world scale without
 * decoding a PNG. The actual pixel load — PNG → `HTMLCanvasElement` — lives in
 * `render/atlas/index.ts`, which needs a document.
 *
 * ## Why `worldScale` lives here and not in `draw.ts`
 *
 * The legacy procedural sprites are drawn through one global `SPRITE_SCALE` (1.2) and the
 * boss `spriteScale` table. Pipeline art is authored at a **much higher resolution** —
 * the owner's call after seeing PixelLab output downscaled into a ~20px grid vs. left
 * near its native size (see memory `lootsim-art-direction-and-cosmetics`). So each atlas
 * sprite carries its **own** world-units-per-art-pixel factor, chosen to land the sprite
 * on the exact same world footprint its procedural predecessor had — the simulation's
 * hitboxes, telegraph radii and camera framing do not move. Raising art resolution buys
 * clarity, nothing else.
 */

export interface AtlasSprite {
  /** File id: the PNG basename without extension, e.g. `boss.corrupted-saint`. */
  readonly id: string;
  /** Authored pixel size. Must match the PNG on disk — the smoke test checks the wiring. */
  readonly w: number;
  readonly h: number;
  /**
   * World units per authored pixel. Tuned so the drawn sprite occupies the same world
   * height its procedural predecessor did at `SPRITE_SCALE` / `spriteScale`.
   */
  readonly worldScale: number;
  /**
   * Fraction of the sprite's height that sits **below** the feet anchor (the shadow
   * line). Procedural grids bake this as ~0.22 of empty space; a tightly-trimmed PNG
   * stands on its own bottom row, so this is near zero — a hair of sink so it doesn't
   * read as hovering.
   */
  readonly feet: number;
}

/**
 * Every pipeline sprite. Keyed by file id. `w`/`h` are the trimmed PNG's real size; if
 * you re-export a sprite at a new size, update the row (and re-check `worldScale`).
 */
export const ATLAS: Record<string, AtlasSprite> = {
  // §5 Circle VI (Heresy) — the corrupted saint. Replaces the `bossChoir` silhouette.
  // choir was BOSS_CHOIR (26×26) at spriteScale 3.54 ≈ 92 world units tall; this stands
  // a touch taller — bosses are the headline act — at 54px × 1.85 ≈ 100.
  "boss.corrupted-saint": { id: "boss.corrupted-saint", w: 44, h: 54, worldScale: 1.85, feet: 0.04 },

  // §8.2 The Rotting Garden — the rot-scuttler. Replaces the `swarmer` (MOB_CRAWLER,
  // 17×13 at SPRITE_SCALE 1.2 ≈ 15.6 world units tall); 24px × 0.72 ≈ 17.3, slightly
  // bigger and far more legible.
  "reliquary.monster.rot-scuttler": { id: "reliquary.monster.rot-scuttler", w: 31, h: 24, worldScale: 0.72, feet: 0.06 },
};

/**
 * Which legacy `SpriteName` each atlas sprite stands in for. `render/sprites.ts` reads
 * this to override the procedural bake with the loaded PNG; everything downstream
 * (`tinted`, `silhouette`, elite/infusion recolour) keeps working because it all
 * operates on whatever canvas `sprite()` returns.
 *
 * Plain strings on the value side so this module stays free of `sprites.ts`.
 */
export const SPRITE_OVERRIDES: Record<string, string> = {
  bossChoir: "boss.corrupted-saint",
  swarmer: "reliquary.monster.rot-scuttler",
};
