/**
 * Renders every grid in `render/pixels.ts`, plus every pipeline prop and floor tileset,
 * to a PNG contact sheet.
 *
 * There are no binary art assets in this project — the art is string grids — which is
 * lovely right up until you want to *look* at it, at which point the only viewer is the
 * game itself. This writes a sheet you can open: every composed character, monster,
 * boss, weapon, icon, prop and cosmetic, in the real palettes, from the same pure module
 * the renderer bakes from. Run it after touching a grid and actually look at the result.
 *
 *   npm run art            # writes art-sheet.png
 *   npm run art -- out.png
 *
 * Props and tilesets (both pipeline PNGs, not procedural grids) were a gap here until
 * the Citadel art pass had to hand-compose a one-off sheet just to see its own work —
 * this file is the fix, not that mockup. The tileset rows are the reason: a floor tile
 * is meaningless alone, only the *seams* between floor and wall tell you whether a sheet
 * reads at game zoom, and seams only exist once tiles are stamped by corner mask. So the
 * tileset section runs the real dual-grid algorithm `render/tilemap.ts#paintTilemap`
 * uses — same mask math, same uniform-tile orientation flips — reimplemented here on a
 * raw pixel buffer instead of a canvas, because this tool has no DOM. A tiny fixed test
 * room (an outer ring plus one floating interior rock) exercises most of the 16 corner
 * masks without needing a real generated level.
 *
 * The PNG encoder is hand-rolled because pulling in an image library for a debug tool
 * would be the only runtime dependency in the entire project.
 */
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import {
  BODY, BODY_DX, BODY_DY, BOSS_GRIDS, CHAR_H, CHAR_W, COSMETIC_ART, HAIR,
  ICON_ARMOR, ICON_CAPSULE, ICON_COIN, ICON_GEM, ICON_GLOVES, ICON_KEY, ICON_NECKLACE,
  ICON_POTION, ICON_RING, ICON_SHIELD, MOB_BRUTE, MOB_CASTER, MOB_IMP, MOB_RANGER,
  MOB_CRAWLER, PALETTES, PROP_BONES, PROP_CHEST, PROP_CRYSTAL, PROP_MUSHROOM, PROP_ROCK,
  PROP_TORCH, WEAPON_ART, bodyPalette, cosmeticPalette, hairPalette,
  rarityWeaponPalette, weaponPalette, type Grid, type Palette,
} from "../src/render/pixels";
import {
  COSMETICS_BY_ID, defaultAppearance, type Appearance,
} from "../src/data/cosmetics";
import { NAMED_ITEMS } from "../src/data/named";
import { RELICS } from "../src/data/relics";
import { RARITIES, RARITY_COLORS } from "../src/data/rarity";
import { RARITY_WASH } from "../src/render/itemart";
import { ATLAS, TILESETS } from "../src/render/atlas/manifest";
import { BIOMES } from "../src/data/biomes";
import { PLANETS } from "../src/data/planets";
import { FLOOR_GRADE, gradeSheet } from "../src/render/grade";
import { decodePng, washPng, type DecodedPng } from "./pngdecode";

const W = 1180;
const H = 4200;
const SCALE = 5;
const BG: readonly [number, number, number] = [22, 18, 30];

const buf = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  buf[i * 3] = BG[0];
  buf[i * 3 + 1] = BG[1];
  buf[i * 3 + 2] = BG[2];
}

function px(x: number, y: number, hex: string): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const n = parseInt(hex.slice(1), 16);
  const i = (y * W + x) * 3;
  buf[i] = (n >> 16) & 255;
  buf[i + 1] = (n >> 8) & 255;
  buf[i + 2] = n & 255;
}

function blit(grid: Grid, pal: Palette, ox: number, oy: number, s: number): void {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === ".") continue;
      const color = pal[ch];
      if (!color) continue;
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) px(ox + x * s + dx, oy + y * s + dy, color);
      }
    }
  }
}

function frame(x: number, y: number, w: number, h: number): void {
  for (let i = 0; i < w; i++) { px(x + i, y, "#3a3550"); px(x + i, y + h - 1, "#3a3550"); }
  for (let i = 0; i < h; i++) { px(x, y + i, "#3a3550"); px(x + w - 1, y + i, "#3a3550"); }
}

/** The same layer order `sprites.ts` composes in, so the sheet can't lie about it. */
function character(a: Appearance, ox: number, oy: number, s: number): void {
  const back = a.back ? COSMETICS_BY_ID[a.back] : null;
  if (back?.art) {
    const art = COSMETIC_ART[back.art]!;
    blit(art.grid, cosmeticPalette(back), ox + art.dx * s, oy + art.dy * s, s);
  }
  blit(BODY, bodyPalette(a), ox + BODY_DX * s, oy + BODY_DY * s, s);
  blit(HAIR[a.hairStyle]!, hairPalette(a), ox + BODY_DX * s, oy + BODY_DY * s, s);
  for (const id of [a.face, a.ears, a.hat]) {
    const c = id ? COSMETICS_BY_ID[id] : null;
    if (!c?.art) continue;
    const art = COSMETIC_ART[c.art]!;
    blit(art.grid, cosmeticPalette(c), ox + art.dx * s, oy + art.dy * s, s);
  }
}

const look = (o: Partial<Appearance>): Appearance => ({ ...defaultAppearance(), ...o });

/** A spread wide enough to catch a hat that collides with a hairstyle. */
const LOOKS: readonly Appearance[] = [
  look({}),
  look({ hairStyle: "twintails", hair: 5, hat: "hatWitch", dye: 2 }),
  look({ hairStyle: "long", hair: 9, ears: "earsCat", back: "backCape", dye: 9, skin: 0 }),
  look({ hairStyle: "bob", hair: 3, ears: "earsBunny", back: "backAngel", face: "faceBlush", dye: 5 }),
  look({ hairStyle: "short", hair: 0, hat: "hatTop", back: "backDemon", face: "faceEyepatch", dye: 3, skin: 3 }),
  look({ hairStyle: "pony", hair: 6, hat: "hatHalo", back: "backMoth", face: "faceGlasses", dye: 4 }),
  look({ hairStyle: "long", hair: 2, hat: "hatStraw", ears: "earsFox", back: "backTail", dye: 1, skin: 2 }),
  look({ hairStyle: "bob", hair: 8, hat: "hatChef", ears: "earsHorn", face: "faceFangs", dye: 6, skin: 6 }),
  look({ hairStyle: "twintails", hair: 7, hat: "hatCrown", ears: "earsAntenna", back: "backTome", face: "faceVisor", dye: 8 }),
  look({ hairStyle: "pony", hair: 9, hat: "hatUnspoken", ears: "earsCat", back: "backAngel", dye: 9, skin: 7, eyes: 6 }),
];

let y = 16;
LOOKS.forEach((a, i) => {
  const x = 16 + i * (CHAR_W * SCALE + 10);
  frame(x - 3, y - 3, CHAR_W * SCALE + 6, CHAR_H * SCALE + 6);
  character(a, x, y, SCALE);
});
y += CHAR_H * SCALE + 26;

/**
 * Blits a decoded real PNG (not a procedural grid) with proper alpha compositing, since
 * an authored generation has anti-aliased edges a string-grid sprite never does. This is
 * what lets the sheet finally show what the game actually draws for a migrated sprite,
 * rather than the procedural predecessor it replaced (§17.5's documented gap).
 */
function blitPng(png: DecodedPng, ox: number, oy: number, s: number): void {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const a = png.rgba[i + 3]! / 255;
      if (a === 0) continue;
      const r = png.rgba[i]!, g = png.rgba[i + 1]!, b = png.rgba[i + 2]!;
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          const px2 = ox + x * s + dx, py2 = oy + y * s + dy;
          if (px2 < 0 || py2 < 0 || px2 >= W || py2 >= H) continue;
          const bi = (py2 * W + px2) * 3;
          buf[bi] = Math.round(r * a + buf[bi]! * (1 - a));
          buf[bi + 1] = Math.round(g * a + buf[bi + 1]! * (1 - a));
          buf[bi + 2] = Math.round(b * a + buf[bi + 2]! * (1 - a));
        }
      }
    }
  }
}

function strip(entries: readonly (readonly [Grid, Palette])[], boxed: boolean, gap = 16): void {
  let x = 16;
  let tallest = 0;
  for (const [grid, pal] of entries) {
    const w = grid[0]!.length * SCALE;
    if (x + w > W - 16) { x = 16; y += tallest + gap; tallest = 0; }
    if (boxed) frame(x - 3, y - 3, w + 6, grid.length * SCALE + 6);
    blit(grid, pal, x, y, SCALE);
    x += w + gap;
    tallest = Math.max(tallest, grid.length * SCALE);
  }
  y += tallest + gap + 10;
}

/** `strip`'s counterpart for decoded real PNGs — wraps exactly like `strip` does once a
 * row would run past W, so a growing set (relics, artifacts, named items) never clips. */
function stripPng(entries: readonly DecodedPng[], scale: number, boxed: boolean, gap = 12): void {
  let x = 16;
  let tallest = 0;
  for (const png of entries) {
    const w = png.width * scale;
    if (x + w > W - 16) { x = 16; y += tallest + gap; tallest = 0; }
    if (boxed) frame(x - 3, y - 3, w + 6, png.height * scale + 6);
    blitPng(png, x, y, scale);
    x += w + gap;
    tallest = Math.max(tallest, png.height * scale);
  }
  y += tallest + gap + 10;
}

strip([
  [MOB_CRAWLER, PALETTES.crawler], [MOB_IMP, PALETTES.imp], [MOB_RANGER, PALETTES.ranger],
  [MOB_BRUTE, PALETTES.brute], [MOB_CASTER, PALETTES.caster],
], true);

strip([
  [BOSS_GRIDS.boss!, PALETTES.warden], [BOSS_GRIDS.bossChoir!, PALETTES.choir],
  [BOSS_GRIDS.bossColossus!, PALETTES.colossus], [BOSS_GRIDS.bossHerald!, PALETTES.herald],
  [BOSS_GRIDS.bossNameless!, PALETTES.nameless],
], true);

// Every weapon twice: bare legendary steel, then wearing the Starforged skin.
const starforged = COSMETICS_BY_ID.skinStar!.weapon!;
const legendary = rarityWeaponPalette("legendary");
strip(Object.values(WEAPON_ART).map((a) => [a.grid, weaponPalette(legendary)] as const), false, 14);
strip(Object.values(WEAPON_ART).map((a) => [a.grid, weaponPalette(starforged)] as const), false, 14);

strip([
  [ICON_COIN, PALETTES.coin], [ICON_KEY, PALETTES.key], [ICON_POTION, PALETTES.potion],
  [ICON_GEM, PALETTES.gem], [ICON_CAPSULE, PALETTES.capsule], [ICON_ARMOR, PALETTES.armor],
  [ICON_SHIELD, PALETTES.shield], [ICON_RING, PALETTES.ring], [ICON_GLOVES, PALETTES.gloves],
  [ICON_NECKLACE, PALETTES.necklace], [PROP_CHEST, PALETTES.chest], [PROP_TORCH, PALETTES.torch],
  [PROP_BONES, PALETTES.bones], [PROP_MUSHROOM, PALETTES.mushroom],
  [PROP_CRYSTAL, PALETTES.crystal], [PROP_ROCK, PALETTES.rock],
], false, 12);

strip(
  Object.values(COSMETICS_BY_ID)
    .filter((c) => c.art)
    .map((c) => [COSMETIC_ART[c.art!]!.grid, cosmeticPalette(c)] as const),
  false, 10,
);

// --- real pipeline icons, washed by every rarity (item-art prep pass) -----
//
// Everything above this line is the procedural render/pixels.ts grids — what the game
// drew before the Aseprite/PixelLab migration, and for several of these ids (the five
// equipment icons below) not what it draws today. `npm run itemart` proves the *wash
// constant* can't fork again (RARITY_WASH, one number, one call site); it can't show you
// the wash, because it never touches a canvas. This is the "look at it" counterpart —
// one row per equipment icon, its real committed PNG decoded (not re-derived) and washed
// toward all eight rarities with the exact `tintedCanvas` math (`pngdecode.ts#washPng`),
// so a fork back to two different constants (the bug this file's own §11 note describes)
// would be visible here as two different-looking rows rather than just a passing number.
{
  const ICON_PNGS: Record<string, string> = {
    armor: "icons/icon.armor.png", shield: "icons/icon.shield.png", ring: "icons/icon.ring.png",
    gloves: "icons/icon.gloves.png", necklace: "icons/icon.necklace.png",
  };
  for (const path of Object.values(ICON_PNGS)) {
    const raw = decodePng(readFileSync(`src/render/atlas/${path}`));
    stripPng(RARITIES.map((r) => washPng(raw, RARITY_COLORS[r], RARITY_WASH)), 3, true, 10);
  }
}

// --- named-item icons: authored art, no wash (item-art prep pass) ---------
//
// A named item's identity is baked once and worn forever, so unlike the generic icons
// above it never goes through `washPng` — this row is exactly the PNG the game loads.
// Only the three samples from docs/item-art-inventory.md have one; the rest of
// `NAMED_ITEMS` stay off this row until the owner has looked at these and signed off on
// authoring the remaining eight.
{
  const authored = NAMED_ITEMS.filter((d) => d.art && d.art in ATLAS);
  stripPng(
    authored.map((d) => decodePng(readFileSync(`src/render/atlas/items/named/${d.art}.png`))),
    3, true, 14,
  );
}

{
  // Relics and artifacts (UAT §19) — same unwashed treatment as named items: a relic's
  // colour is fixed forever, so it never goes through the rarity wash. Relics and
  // artifacts get their own row (well, wrapped rows) each, so the two tiers stay visually
  // separate even as both wrap.
  const authored = RELICS.filter((d) => d.art && d.art in ATLAS);
  const relicTier = authored.filter((d) => d.tier === "relic");
  const artifactTier = authored.filter((d) => d.tier === "artifact");
  stripPng(
    relicTier.map((d) => decodePng(readFileSync(`src/render/atlas/relics/${d.art}.png`))),
    3, true, 12,
  );
  stripPng(
    artifactTier.map((d) => decodePng(readFileSync(`src/render/atlas/relics/${d.art}.png`))),
    3, true, 12,
  );
}

// --- pipeline props (dungeon dressing, hub relics) -------------------------
//
// Every `prop.*` row in ATLAS, decoded and blitted for real — the same PNGs `drawProps`
// and `drawDeckProp` load, not a re-derivation of them. One row, wrapping like every
// other `stripPng` block; the set spans 22px (a brazier) to 105px (a pillar), so this
// reads a little denser than the icon rows above, on purpose — a prop earns its keep by
// standing next to its actual neighbors, not by being pre-sorted into tidy shelves.
{
  const propIds = Object.keys(ATLAS).filter((id) => id.startsWith("prop.")).sort();
  stripPng(
    propIds.map((id) => decodePng(readFileSync(`src/render/atlas/props/${id}.png`))),
    2, true, 10,
  );
}

// --- floor tilesets, stamped for real ---------------------------------------
//
// A single 16px tile tells you almost nothing — the whole point of a corner-Wang sheet
// is the seam between floor and wall, and a seam only exists once tiles are picked by
// corner mask and stamped edge to edge. This runs the exact algorithm
// `render/tilemap.ts#paintTilemap` uses (dual-grid node sampling, the same mask math,
// the same orientation flip on the two uniform tiles) on a raw pixel buffer instead of
// a canvas, against a tiny fixed test room rather than a real generated level — an outer
// ring plus one floating interior rock cell, which between them hit most of the 16
// corner masks (straight edges, all four outer-corner turns, and all four corners
// around the floating rock) without needing `game/level.ts`'s generator in a Node tool.
// Each sheet is graded with the same tint its real callsite uses — the Citadel's own
// `DECK_TINT` for `tiles.citadel` (duplicated here as a literal rather than imported,
// since `render/hub.ts` pulls in the browser-only atlas loader and this tool is Node-only
// — see the `tintFor` comment below), the owning biome's tint for everything else, falling
// back to the first Delve tint for a sheet nothing has claimed yet.
{
  const ROOM_COLS = 11, ROOM_ROWS = 8;
  const ROCK_X = 5, ROCK_Y = 3; // one floating interior rock cell

  const isRock = (cx: number, cy: number): boolean => {
    if (cx < 0 || cy < 0 || cx >= ROOM_COLS || cy >= ROOM_ROWS) return true;
    if (cx === 0 || cy === 0 || cx === ROOM_COLS - 1 || cy === ROOM_ROWS - 1) return true;
    if (cx === ROCK_X && cy === ROCK_Y) return true;
    return false;
  };

  const DECK_TINT = "#3d3a47"; // src/render/hub.ts's own DECK_TINT — see comment above
  const tintFor = (id: string): string => {
    if (id === "tiles.citadel") return DECK_TINT;
    const biome = BIOMES.find((b) => b.tileset === id);
    if (biome) return biome.tint;
    for (const p of PLANETS) if (p.biome.tileset === id) return p.biome.tint;
    return BIOMES[0]!.tint;
  };

  /** The dual-grid stamp, ported from `paintTilemap` onto a flat RGBA buffer. Returns a
   *  `DecodedPng`-shaped object so it can go straight through the existing `blitPng`. */
  function stampRoom(sheetId: string): DecodedPng {
    const sheet = decodePng(readFileSync(`src/render/atlas/tilesets/${sheetId}.png`));
    const layout = JSON.parse(
      readFileSync(`src/render/atlas/tilesets/${sheetId}.json`, "utf8"),
    ) as { tile: number; boxes: [number, number][] };
    const graded = new Uint8Array(sheet.rgba);
    gradeSheet(graded, sheet.width, sheet.height, layout.tile, layout.boxes, tintFor(sheetId), FLOOR_GRADE);

    const tile = layout.tile;
    const roomW = ROOM_COLS * tile, roomH = ROOM_ROWS * tile;
    const out = new Uint8Array(roomW * roomH * 4);
    const seed = 0xC17ADE1;
    const orient = (nx: number, ny: number): number => {
      let h = (seed ^ (nx * 374761393) ^ (ny * 668265263)) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
      return h & 3;
    };
    const blitTile = (box: readonly [number, number], dx: number, dy: number, flipX: boolean, flipY: boolean): void => {
      for (let y = 0; y < tile; y++) {
        for (let x = 0; x < tile; x++) {
          const sx = box[0] + (flipX ? tile - 1 - x : x);
          const sy = box[1] + (flipY ? tile - 1 - y : y);
          const si = (sy * sheet.width + sx) * 4;
          const dxx = dx + x, dyy = dy + y;
          if (dxx < 0 || dyy < 0 || dxx >= roomW || dyy >= roomH) continue;
          const di = (dyy * roomW + dxx) * 4;
          out[di] = graded[si]!; out[di + 1] = graded[si + 1]!;
          out[di + 2] = graded[si + 2]!; out[di + 3] = graded[si + 3]!;
        }
      }
    };
    for (let ny = 0; ny <= ROOM_ROWS; ny++) {
      for (let nx = 0; nx <= ROOM_COLS; nx++) {
        const nw = isRock(nx - 1, ny - 1) ? 1 : 0, ne = isRock(nx, ny - 1) ? 1 : 0;
        const sw = isRock(nx - 1, ny) ? 1 : 0, se = isRock(nx, ny) ? 1 : 0;
        const mask = (nw << 3) | (ne << 2) | (sw << 1) | se;
        const box = layout.boxes[mask];
        if (!box) continue;
        const dx = nx * tile - tile / 2, dy = ny * tile - tile / 2;
        if (mask === 0 || mask === 15) {
          const o = orient(nx, ny);
          blitTile(box, dx, dy, (o & 1) !== 0, (o & 2) !== 0);
        } else {
          blitTile(box, dx, dy, false, false);
        }
      }
    }
    return { width: roomW, height: roomH, rgba: out };
  }

  const ids = Object.keys(TILESETS).sort();
  stripPng(ids.map(stampRoom), 2, true, 14);
}

// --- PNG ------------------------------------------------------------------

function crc32(b: Buffer): number {
  let c = ~0;
  for (const byte of b) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const raw = Buffer.alloc(H * (W * 3 + 1));
for (let row = 0; row < H; row++) {
  raw[row * (W * 3 + 1)] = 0; // filter type 0: none
  buf.copy(raw, row * (W * 3 + 1) + 1, row * W * 3, (row + 1) * W * 3);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 2;  // truecolour
const out = process.argv[2] ?? "art-sheet.png";
writeFileSync(out, Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]));
console.log(`wrote ${out} (${W}x${H})`);
