/**
 * Procedural pixel art. Every sprite is a grid of characters plus a palette, baked
 * into an offscreen canvas once at boot. There are no binary art assets in this
 * project on purpose — to add a sprite, add a grid here.
 *
 * Palette keys are shared across grids so the same silhouette can be recolored into
 * a different monster without duplicating the artwork.
 */

export type Palette = Record<string, string>;

/** '.' is always transparent. Every row in a grid must be the same length. */
export type Grid = readonly string[];

function bake(grid: Grid, palette: Palette): HTMLCanvasElement {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const row = grid[y]!;
    if (row.length !== w) throw new Error(`ragged sprite row ${y}: ${row.length} != ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = row[x]!;
      if (ch === ".") continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

// --- grids ----------------------------------------------------------------

/** Hooded adventurer, 12x14. Also the base silhouette for humanoid enemies. */
const HUMANOID: Grid = [
  "............",
  "....4444....",
  "...444444...",
  "...411114...",
  "...417714...",
  "...411114...",
  "..22222222..",
  ".2223223222.",
  ".2222222222.",
  "..22222222..",
  "..22222222..",
  "..11....11..",
  "..66....66..",
  "..66....66..",
];

/** Low, many-legged, 12x10. */
const CRAWLER: Grid = [
  "............",
  "..6......6..",
  "...6....6...",
  "....2222....",
  "...222222...",
  "..22722722..",
  "..22222222..",
  "...222222...",
  "..6......6..",
  "............",
];

/** Heavy armored bruiser, 16x16. */
const BRUTE: Grid = [
  "................",
  ".....444444.....",
  "....44444444....",
  "....47744774....",
  "....44444444....",
  "...4444444444...",
  "..222222222222..",
  ".22233222233222.",
  ".22222222222222.",
  ".22222222222222.",
  "..222222222222..",
  "..222222222222..",
  "..222......222..",
  "..111......111..",
  "..666......666..",
  "..666......666..",
];

/** Floating robed caster, 12x14 — no legs, hem frays into nothing. */
const CASTER: Grid = [
  "............",
  "....2222....",
  "...222222...",
  "...277772...",
  "...222222...",
  "..22222222..",
  ".2222222222.",
  ".2223223222.",
  ".2222222222.",
  "..22222222..",
  "..22222222..",
  "...222222...",
  "..2.2..2.2..",
  "............",
];

/** Boss: huge, horned, 20x20. */
const BOSS: Grid = [
  "....................",
  "..5..............5..",
  "..55..........55....",
  "...555......555.....",
  ".....44444444.......",
  "....4444444444......",
  "....4477444477......",
  "....4444444444......",
  "...444444444444.....",
  "..2222222222222.....",
  ".222222222222222....",
  ".223332222233322....",
  ".222222222222222....",
  ".222222222222222....",
  "..2222222222222.....",
  "..2222222222222.....",
  "..222.......222.....",
  "..111.......111.....",
  "..666.......666.....",
  "..666.......666.....",
];

const COIN: Grid = [
  "..####..",
  ".######.",
  "#####5##",
  "####55##",
  "###55###",
  "##55####",
  ".######.",
  "..####..",
];

const KEY: Grid = [
  "..###...",
  ".#...#..",
  ".#...#..",
  "..###...",
  "...#....",
  "...##...",
  "...#....",
  "...##...",
];

const POTION: Grid = [
  "..####..",
  "...##...",
  "...##...",
  "..####..",
  ".##77##.",
  "#777777#",
  "#7777777",
  ".######.",
];

/** Generic dropped-gear glyph; tinted by the item's rarity at draw time. */
const GEM: Grid = [
  "...##...",
  "..####..",
  ".##55##.",
  "########",
  ".######.",
  "..####..",
  "...##...",
  "........",
];

const CHEST: Grid = [
  "................",
  "..############..",
  ".##44444444444#.",
  ".#4444444444444.",
  ".##############.",
  ".#4444##44444444",
  ".#4444##44444444",
  ".##############.",
  "..############..",
  "................",
];

// --- palettes -------------------------------------------------------------

const P = {
  hero: { "1": "#e8b98a", "2": "#3f5f9e", "3": "#2c4272", "4": "#c9d3e0", "6": "#3a3a48", "7": "#7fe3ff" },
  grunt: { "1": "#8a6a52", "2": "#7a3b3b", "3": "#5a2a2a", "4": "#9a9a86", "6": "#2e2626", "7": "#ff8a5c" },
  swarmer: { "2": "#5c3f7a", "6": "#33244a", "7": "#ff5cf0" },
  archer: { "1": "#8a6a52", "2": "#2f6b4a", "3": "#1f4a33", "4": "#a8b08a", "6": "#28301f", "7": "#c8ff5c" },
  brute: { "1": "#6f5a44", "2": "#5a4a3a", "3": "#3d3227", "4": "#8f8f9c", "6": "#241e18", "7": "#ff5c3c" },
  caster: { "2": "#4b2f7a", "3": "#2f1c52", "7": "#d08cff" },
  boss: { "1": "#4a3a4a", "2": "#3a1230", "3": "#220a1c", "4": "#b0304a", "5": "#ffd34d", "6": "#160610", "7": "#ff2d2d" },
  coin: { "#": "#e0a020", "5": "#ffe9a8" },
  key: { "#": "#dde5ef" },
  potion: { "#": "#cfd8e3", "7": "#4ade80" },
  gem: { "#": "#ffffff", "5": "#ffffff" },
  chest: { "#": "#5a3b22", "4": "#c8912f" },
} satisfies Record<string, Palette>;

// --- baked atlas ----------------------------------------------------------

export type SpriteName =
  | "hero" | "grunt" | "archer" | "brute" | "swarmer" | "caster" | "boss"
  | "coin" | "key" | "potion" | "gem" | "chest";

let atlas: Record<SpriteName, HTMLCanvasElement> | null = null;

/** Bakes every sprite. Must be called once after the DOM exists, before rendering. */
export function buildSprites(): void {
  atlas = {
    hero: bake(HUMANOID, P.hero),
    grunt: bake(HUMANOID, P.grunt),
    archer: bake(HUMANOID, P.archer),
    brute: bake(BRUTE, P.brute),
    swarmer: bake(CRAWLER, P.swarmer),
    caster: bake(CASTER, P.caster),
    boss: bake(BOSS, P.boss),
    coin: bake(COIN, P.coin),
    key: bake(KEY, P.key),
    potion: bake(POTION, P.potion),
    gem: bake(GEM, P.gem),
    chest: bake(CHEST, P.chest),
  };
}

export function sprite(name: SpriteName): HTMLCanvasElement {
  if (!atlas) throw new Error("buildSprites() must run before rendering");
  return atlas[name];
}

/** Returns a recolored copy of a sprite, for rarity-tinted elites and gear drops. */
const tintCache = new Map<string, HTMLCanvasElement>();
export function tinted(name: SpriteName, color: string, strength = 0.6): HTMLCanvasElement {
  const key = `${name}|${color}|${strength}`;
  const hit = tintCache.get(key);
  if (hit) return hit;

  const src = sprite(name);
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = strength;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  tintCache.set(key, out);
  return out;
}

/** Solid-color silhouette, used for the white flash when something takes a hit. */
const flashCache = new Map<string, HTMLCanvasElement>();
export function silhouette(name: SpriteName, color = "#ffffff"): HTMLCanvasElement {
  const key = `${name}|${color}`;
  const hit = flashCache.get(key);
  if (hit) return hit;

  const src = sprite(name);
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  flashCache.set(key, out);
  return out;
}
