/**
 * Renders the art the game draws *today* to a PNG contact sheet: every procedural grid in
 * `render/pixels.ts` that's still a live fallback, plus every pipeline prop, icon and
 * floor tileset, in the real palettes, from the same pure modules the renderer bakes
 * from and the same PNGs `resolveSprite`/`itemSprite` actually load. Run it after
 * touching a grid or committing a PNG and actually look at the result.
 *
 *   npm run art            # writes art-sheet.png
 *   npm run art -- out.png
 *
 * The bar is "what the game draws today," not a museum of everything ever authored — a
 * row whose real PNG has landed and superseded it is decoded and blitted for real instead
 * (or, for the five equipment icons, dropped in favour of the rarity-washed row below,
 * which already shows the same PNG). The composed-hero preview and the standalone
 * cosmetic-art strip are gated behind `SHOW_PARKED_COSMETICS` (off by default, 2026-09) —
 * see that constant's comment for why; flip it back to `true` for the one line it takes to
 * see them again.
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
  MOB_BRUTE, MOB_CASTER, MOB_IMP, MOB_RANGER, MOB_CRAWLER, PALETTES,
  bodyPalette, cosmeticPalette, hairPalette, type Grid, type Palette,
} from "../src/render/pixels";
import {
  COSMETICS_BY_ID, defaultAppearance, type Appearance,
} from "../src/data/cosmetics";
import { NAMED_ITEMS } from "../src/data/named";
import { RELICS } from "../src/data/relics";
import { RARITIES, RARITY_COLORS } from "../src/data/rarity";
import { ATLAS_WEAPON_WASH, RARITY_WASH } from "../src/render/itemart";
import {
  ATLAS, ATLAS_COSMETICS, ATLAS_WEAPONS, ATLAS_WEAPON_SKINS,
  COSMETIC_MARK_1, COSMETIC_MARK_2, COSMETIC_MARK_3,
  SPRITE_OVERRIDES, TILESETS, cosmeticStageXY, heroStage,
} from "../src/render/atlas/manifest";
import { BIOMES } from "../src/data/biomes";
import { TOWER_BIOMES } from "../src/data/tower";
import { PLANETS } from "../src/data/planets";
import { FLOOR_GRADE, gradeSheet } from "../src/render/grade";
import { decodePng, washPng, type DecodedPng } from "./pngdecode";

const W = 1180;
/**
 * Tall enough for everything, with the check that says so.
 *
 * `set()` clips silently, so a sheet that outgrows this number does not error — it just
 * stops drawing, and the newest rows (the ones somebody is looking at the sheet *for*)
 * are the ones that vanish. Three Tower tilesets pushed the last two rows off the bottom
 * exactly this way. Raised, and the cursor is asserted against it at the end rather than
 * trusted.
 */
const H = 6000;
const SCALE = 5;
const BG: readonly [number, number, number] = [22, 18, 30];

/**
 * 2026-09: the owner is parking cosmetics entirely until the 21 per-class hero sprites
 * are done ("get rid of the style stuff for now... remove all the old stuff from the art
 * sheet") — the composed-hero preview and the standalone cosmetic-art strip below are the
 * string-grid system that's least likely to survive the hero rework, and they were
 * crowding out the boss, prop and tileset art actually being iterated on. This is a sheet
 * decision only: nothing here touches `data/cosmetics.ts`, `render/pixels.ts` or the
 * composition stack, cosmetics still render in the live game exactly as before (the smoke
 * test still walks every grid for drawability), and flipping this one flag is the whole
 * way back once the hero art lands.
 */
const SHOW_PARKED_COSMETICS = false;

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
if (SHOW_PARKED_COSMETICS) {
  LOOKS.forEach((a, i) => {
    const x = 16 + i * (CHAR_W * SCALE + 10);
    frame(x - 3, y - 3, CHAR_W * SCALE + 6, CHAR_H * SCALE + 6);
    character(a, x, y, SCALE);
  });
  y += CHAR_H * SCALE + 26;
}

/**
 * Blits a decoded real PNG (not a procedural grid) with proper alpha compositing, since
 * an authored generation has anti-aliased edges a string-grid sprite never does. This is
 * what lets the sheet finally show what the game actually draws for a migrated sprite,
 * rather than the procedural predecessor it replaced (§17.5's documented gap).
 */
/**
 * The first frame of an atlas row, cropped to the size the **manifest** declares.
 *
 * An animated row's PNG is a horizontal strip of frames, so the file's own width is the
 * whole animation — `boss.exiled-tyrant` is 1372px of 98px frames. Reading the file's
 * dimensions instead of the manifest's therefore draws all fourteen poses in a row, which
 * on this sheet looked exactly like the same boss stamped fourteen times. The manifest row
 * is the frame; the file is the strip. `render/anim.ts` resolves frame 0 the same way.
 */
function frameZero(id: string, path: string): DecodedPng {
  const png = decodePng(readFileSync(`src/render/atlas/${path}`));
  const meta = ATLAS[id];
  if (!meta || (png.width === meta.w && png.height === meta.h)) return png;
  const out = new Uint8Array(meta.w * meta.h * 4);
  for (let row = 0; row < meta.h; row++) {
    out.set(png.rgba.subarray(row * png.width * 4, (row * png.width + meta.w) * 4), row * meta.w * 4);
  }
  return { width: meta.w, height: meta.h, rgba: out };
}

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

// --- monsters and bosses: the real art ------------------------------------
//
// These were two strips of procedural grids, for the same reason the weapon rows below
// were and with the same consequence. `SPRITE_OVERRIDES` gives all five archetypes and all
// five floor bosses a committed PNG, and that is **rung 2** of `chooseSpriteArt` — the
// game-wide default, taken by every realm that has no set of its own. So the procedural
// bake is not "the live fallback whenever a realm's pipeline PNG isn't committed"; the
// only thing that reaches it is a PNG failing to decode.
//
// The boss row is the one that mattered most. Nine boss PNGs are committed — the five
// floor bosses and the four raid bosses — and **not one of them had ever appeared on this
// sheet**, on a project where the owner judges art by eye and has said the bosses are one
// of the main attractions.
{
  const monsterIds = [
    "grunt", "archer", "brute", "caster", "swarmer",
    "charger", "bomber", "shieldbearer", "summoner", "sniper", "leech",
  ].map((n) => SPRITE_OVERRIDES[n]!);
  stripPng(
    monsterIds.map((id) => decodePng(readFileSync(`src/render/atlas/monsters/${id}.png`))),
    3, true, 12,
  );
  const bossIds = Object.keys(ATLAS)
    .filter((id) => id.startsWith("boss.") || id.startsWith("tower.boss."))
    .sort();
  stripPng(bossIds.map((id) => frameZero(id, `bosses/${id}.png`)), 2, true, 14);

  // Docket §36 — the 21 summon bodies, shown as authored. The game pulls each one's edge
  // pixels toward its owner's element (`SUMMON_ELEMENT_OUTLINE` in `render/sprites.ts`,
  // owner ruling: outline accent, body wash zero) and there is no single element to show
  // here, so the sheet shows the ink-outlined art the accent sits on.
  const summonIds = Object.keys(ATLAS).filter((id) => id.startsWith("summon.")).sort();
  stripPng(summonIds.map((id) => decodePng(readFileSync(`src/render/atlas/summons/${id}.png`))), 3, true, 12);
}

// The procedural monster/boss grids stay reachable behind one flag rather than being
// deleted: they are still the decode-failure fallback, and `render/pixels.ts` still owns
// them, but showing them by default is what kept the real art off the sheet.
const SHOW_LEGACY_MOBS = false;
if (SHOW_LEGACY_MOBS) {
  strip([
    [MOB_CRAWLER, PALETTES.crawler], [MOB_IMP, PALETTES.imp], [MOB_RANGER, PALETTES.ranger],
    [MOB_BRUTE, PALETTES.brute], [MOB_CASTER, PALETTES.caster],
  ], true);
  strip([
    [BOSS_GRIDS.boss!, PALETTES.warden], [BOSS_GRIDS.bossChoir!, PALETTES.choir],
    [BOSS_GRIDS.bossColossus!, PALETTES.colossus], [BOSS_GRIDS.bossHerald!, PALETTES.herald],
    [BOSS_GRIDS.bossNameless!, PALETTES.nameless],
  ], true);
}

// --- weapons: the real art, then the one case that is still procedural ---
//
// This used to be two rows of `WEAPON_ART` — the procedural grids — and **neither of them
// was what the game draws.** All fourteen families have had a committed pipeline PNG since
// `59d94d7`/`30f5cec`, and `weaponSprite` uses it for every weapon that is not wearing a
// cosmetic skin, so the sheet was showing a bare legendary sword that no player has seen in
// months. The earlier museum sweep (`3e74a31`) left weapons alone on the grounds that they
// are "still the live fallback whenever a realm's own pipeline PNG isn't committed", which
// is true of monsters and bosses and simply not true of weapons: every one of them is
// committed.
//
// So: the first row is the real thing, decoded and washed exactly as the game washes it
// (`ATLAS_WEAPON_WASH`, shared with `render/sprites.ts` rather than repeated here — a
// second copy of a wash constant is the item-art bug in this file's own §11 note).
{
  const weaponIds = Object.values(ATLAS_WEAPONS).map((w) => w.id);
  stripPng(
    weaponIds.map((id) => washPng(
      decodePng(readFileSync(`src/render/atlas/weapons/${id}.png`)),
      RARITY_COLORS.legendary, ATLAS_WEAPON_WASH,
    )),
    3, false, 14,
  );
}

// **There used to be a second row here: the procedural grid wearing the Starforged
// palette, justified as "exactly what a player with a skin equipped sees".** That stopped
// being true in `829d2a9`, which made an undrawn skin *inert* — `resolveWeaponDraw` no
// longer has the `aw && !skinId` condition the old comment quoted, so equipping one of the
// seven original palette skins now draws the ordinary authored weapon above rather than
// the bake. Nobody can see that row in the game any more, and this file's own policy two
// comments up is that a weapon museum piece does not belong on the sheet, because all
// fourteen families are committed.
//
// It is removed rather than relabelled on purpose. A picture on a sheet the owner reviews
// by eye is read as "this is in the game"; a picture that is merely *labelled* as dead
// still has to be looked at and dismissed every time. What the seven palette skins
// actually draw today is row one, and it is already there.

// Authored weapon skins (`ATLAS_WEAPON_SKINS`) — each one is its own weapon of a declared
// family rather than a recolour, so it gets its own row next to the families above. Empty
// until the first is drawn; wrapped like every other growing set.
{
  const skinIds = Object.values(ATLAS_WEAPON_SKINS).map((k) => k.id);
  if (skinIds.length > 0) {
    stripPng(
      skinIds.map((id) => decodePng(readFileSync(`src/render/atlas/weapons/${id}.png`))),
      3, false, 14,
    );
  }
}

// --- cosmetics: the migrated layers, composed on the hero as the game composes them ---
//
// The owner reversed the 2026-09 cosmetics park ("I cant get rid of cosmetics ever") and
// asked for the wardrobe back on this sheet, so it is here — but as the *real* thing.
// `SHOW_PARKED_COSMETICS` below still guards the procedural strip, which is genuinely live
// for the sixteen layers that have not migrated yet (`composePipelineHero` drops the whole
// character to the procedural stack if any worn slot is unmigrated, rather than mixing two
// art styles on one body). This row is the eight that have.
//
// Composed through `heroStage`/`cosmeticStageXY` rather than at hand-placed offsets, so
// what the sheet shows is what the composer produces — including the marker swap
// (`COSMETIC_MARK_*` -> the cosmetic's own `colors`), which is the step that turns the
// authored magenta/green/cyan into the item's real palette.
{
  const heroMeta = ATLAS[SPRITE_OVERRIDES.hero!]!;
  const heroPng = decodePng(readFileSync(`src/render/atlas/characters/${heroMeta.id}.png`));
  const stage = heroStage(heroMeta.w, heroMeta.h);
  const byArt = new Map(
    Object.values(COSMETICS_BY_ID).filter((c) => c.art).map((c) => [c.art!, c]),
  );
  const rgb = (h: string): [number, number, number] => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  /** `recoloredCosmetic`'s exact-match marker swap; the ink outline is never touched. */
  const recolored = (png: DecodedPng, colors: readonly string[]): DecodedPng => {
    const out = { width: png.width, height: png.height, rgba: new Uint8Array(png.rgba) };
    const map = [COSMETIC_MARK_1, COSMETIC_MARK_2, COSMETIC_MARK_3].map((m, i) =>
      [rgb(m), rgb(colors[Math.min(i, colors.length - 1)]!)] as const);
    for (let i = 0; i < out.rgba.length; i += 4) {
      if (out.rgba[i + 3]! === 0) continue;
      for (const [from, to] of map) {
        if (out.rgba[i] === from[0] && out.rgba[i + 1] === from[1] && out.rgba[i + 2] === from[2]) {
          out.rgba[i] = to[0]; out.rgba[i + 1] = to[1]; out.rgba[i + 2] = to[2];
          break;
        }
      }
    }
    return out;
  };

  const S = 3;
  const entries = Object.entries(ATLAS_COSMETICS);
  let x = 16;
  let tallest = 0;
  // The bare hero first, so every layer is read against the body it hangs on.
  for (const entry of [null, ...entries] as (readonly [string, typeof entries[number][1]] | null)[]) {
    const cellW = stage.w * S;
    if (x + cellW > W - 16) { x = 16; y += tallest + 12; tallest = 0; }
    frame(x - 3, y - 3, cellW + 6, stage.h * S + 6);
    const layer = entry
      ? { c: entry[1], png: recolored(
          decodePng(readFileSync(`src/render/atlas/cosmetics/${entry[1].id}.png`)),
          byArt.get(entry[0])!.colors) }
      : null;
    const at = layer ? cosmeticStageXY(layer.c, heroMeta.w, heroMeta.h) : null;
    // Back items go behind the hero; everything else in front — the composer's order.
    if (layer && at && layer.c.anchor === "feet") blitPng(layer.png, x + at.dx * S, y + at.dy * S, S);
    blitPng(heroPng, x + stage.dx * S, y + stage.dy * S, S);
    if (layer && at && layer.c.anchor === "head") blitPng(layer.png, x + at.dx * S, y + at.dy * S, S);
    x += cellW + 12;
    tallest = Math.max(tallest, stage.h * S);
  }
  y += tallest + 12 + 10;
}

// 2026-09: this used to be one strip of the procedural coin/key/potion/gem/capsule,
// armor/shield/ring/gloves/necklace and chest/torch/bones/mushroom/crystal/rock grids —
// every one of them superseded by a committed pipeline PNG (`SPRITE_OVERRIDES` in
// `render/atlas/manifest.ts` points every one of those ids at a real, loaded art file, so
// `resolveSprite` never falls back to this procedural bake in normal play). The five
// equipment icons and the six dungeon-dressing props already get a real row below (the
// wash strip right after this comment, and the pipeline-props strip further down); the
// currency/consumable icons get their own real row here so nothing drops off the sheet.
{
  const CURRENCY_PNGS = ["coin", "key", "potion", "gem", "capsule"];
  stripPng(
    CURRENCY_PNGS.map((n) => decodePng(readFileSync(`src/render/atlas/icons/icon.${n}.png`))),
    3, true, 10,
  );
}

if (SHOW_PARKED_COSMETICS) {
  strip(
    Object.values(COSMETICS_BY_ID)
      .filter((c) => c.art)
      .map((c) => [COSMETIC_ART[c.art!]!.grid, cosmeticPalette(c)] as const),
    false, 10,
  );
}

// --- real pipeline icons, washed by every rarity (item-art prep pass) -----
//
// `npm run itemart` proves the *wash constant* can't fork again (RARITY_WASH, one number,
// one call site); it can't show you the wash, because it never touches a canvas. This is
// the "look at it" counterpart — one row per equipment icon, its real committed PNG
// decoded (not re-derived) and washed toward all eight rarities with the exact
// `tintedCanvas` math (`pngdecode.ts#washPng`), so a fork back to two different constants
// (the bug this file's own §11 note describes) would be visible here as two
// different-looking rows rather than just a passing number.
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
    // Every biome that owns a sheet, the Tower included — the contact sheet has to
    // stamp a floor under the tint the game actually grades it with, or it is showing
    // a room that never happens (the same blindness `tools/smoke.ts` had here).
    const biome = [...BIOMES, ...PLANETS.map((p) => p.biome), ...TOWER_BIOMES]
      .find((b) => b.tileset === id);
    return biome ? biome.tint : BIOMES[0]!.tint;
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
if (y > H) {
  console.error(`\nart-sheet overflowed: content ran to y=${y}, canvas is ${H}. Raise H — everything past the edge was silently clipped.`);
  process.exit(1);
}
console.log(`  content ends at y=${y}, ${H - y}px of headroom`);
