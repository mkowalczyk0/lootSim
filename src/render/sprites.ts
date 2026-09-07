/**
 * Baking, compositing and caching. The pixels live next door in `pixels.ts`, which is
 * pure; this module is the half that needs a DOM, so it owns every canvas.
 *
 * Two things happen here that didn't used to:
 *
 * 1. **A character is composed, not drawn.** Back item, body, hair, face, ears and hat
 *    are separate grids stacked into one canvas and cached against the appearance that
 *    produced it. That's what makes a wardrobe possible without an artist: a witch hat
 *    is one grid, and it lands correctly on all five hairstyles and eight skin tones.
 * 2. **A weapon is its own sprite.** It's authored pointing right and rotated to the
 *    swing at draw time, and its palette comes from the item's rarity unless a cosmetic
 *    skin overrides it — so what's in your hand is visible, and reskinnable.
 */

import { CHESTS, type ChestTier } from "../data/chests";
import { atlasCanvas, loadAtlas } from "./atlas";
import { ATLAS, ATLAS_WEAPONS, SPRITE_OVERRIDES } from "./atlas/manifest";
import { type Appearance, type Cosmetic, COSMETICS_BY_ID } from "../data/cosmetics";
import { isWeaponType, type ItemType } from "../data/items";
import { RARITY_COLORS, type Rarity } from "../data/rarity";
import type { WeaponFamily } from "../data/weapons";
import {
  BODY, BODY_DX, BODY_DY, BOSS_GRIDS, CHAR_H, CHAR_W, COSMETIC_ART, HAIR,
  ICON_ARMOR, ICON_CAPSULE, ICON_COIN,
  ICON_GEM, ICON_GLOVES, ICON_KEY, ICON_NECKLACE, ICON_POTION, ICON_RING, ICON_SHIELD,
  MOB_BRUTE, MOB_CASTER, MOB_CRAWLER, MOB_IMP, MOB_RANGER, PALETTES as P, PROP_BONES,
  PROP_CHEST, PROP_CRYSTAL, PROP_MUSHROOM, PROP_ROCK, PROP_TORCH, WEAPON_ART,
  bodyPalette, cosmeticPalette, hairPalette, rarityWeaponPalette, weaponPalette,
  type Grid, type Palette,
} from "./pixels";

export type { Grid, Palette } from "./pixels";
export { CHAR_W, CHAR_H } from "./pixels";

function blank(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d")! };
}

/** Paints one grid into a context at an offset. Unknown palette keys are skipped. */
function stamp(ctx: CanvasRenderingContext2D, grid: Grid, palette: Palette, dx = 0, dy = 0): void {
  const w = grid[0]?.length ?? 0;
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]!;
    if (row.length !== w) throw new Error(`ragged sprite row ${y}: ${row.length} != ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = row[x]!;
      if (ch === ".") continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(dx + x, dy + y, 1, 1);
    }
  }
}

function bake(grid: Grid, palette: Palette): HTMLCanvasElement {
  const { canvas, ctx } = blank(grid[0]?.length ?? 0, grid.length);
  stamp(ctx, grid, palette);
  return canvas;
}

// --- the baked atlas ------------------------------------------------------

export type SpriteName =
  | "hero" | "grunt" | "archer" | "brute" | "swarmer" | "caster"
  | "boss" | "bossChoir" | "bossColossus" | "bossHerald" | "bossNameless"
  | "coin" | "key" | "potion" | "gem" | "capsule" | "chest"
  | "torch" | "bones" | "mushroom" | "crystal" | "rock"
  | "armor" | "shield" | "ring" | "gloves" | "necklace";

let atlas: Record<SpriteName, HTMLCanvasElement> | null = null;

/** Bakes every fixed sprite. Must run once after the DOM exists, before rendering. */
export function buildSprites(): void {
  atlas = {
    // A generic adventurer, for anything that needs a body without an appearance
    // behind it. The player is composed instead — see `heroSprite`.
    hero: composeCharacter(null),
    grunt: bake(MOB_IMP, P.imp),
    archer: bake(MOB_RANGER, P.ranger),
    brute: bake(MOB_BRUTE, P.brute),
    swarmer: bake(MOB_CRAWLER, P.crawler),
    caster: bake(MOB_CASTER, P.caster),
    boss: bake(BOSS_GRIDS.boss!, P.warden),
    bossChoir: bake(BOSS_GRIDS.bossChoir!, P.choir),
    bossColossus: bake(BOSS_GRIDS.bossColossus!, P.colossus),
    bossHerald: bake(BOSS_GRIDS.bossHerald!, P.herald),
    bossNameless: bake(BOSS_GRIDS.bossNameless!, P.nameless),
    coin: bake(ICON_COIN, P.coin),
    key: bake(ICON_KEY, P.key),
    potion: bake(ICON_POTION, P.potion),
    gem: bake(ICON_GEM, P.gem),
    capsule: bake(ICON_CAPSULE, P.capsule),
    chest: bake(PROP_CHEST, P.chest),
    torch: bake(PROP_TORCH, P.torch),
    bones: bake(PROP_BONES, P.bones),
    mushroom: bake(PROP_MUSHROOM, P.mushroom),
    crystal: bake(PROP_CRYSTAL, P.crystal),
    rock: bake(PROP_ROCK, P.rock),
    armor: bake(ICON_ARMOR, P.armor),
    shield: bake(ICON_SHIELD, P.shield),
    ring: bake(ICON_RING, P.ring),
    gloves: bake(ICON_GLOVES, P.gloves),
    necklace: bake(ICON_NECKLACE, P.necklace),
  };
}

/**
 * Loads the pipeline PNGs (`render/atlas/`). Call once after `buildSprites()` and before
 * the first frame. Sprites with a loaded PNG override the procedural bake; anything that
 * fails to load quietly stays procedural, so a missing asset degrades rather than crashes.
 */
export async function preloadArt(): Promise<void> {
  await loadAtlas();
}

export function sprite(name: SpriteName): HTMLCanvasElement {
  if (!atlas) throw new Error("buildSprites() must run before rendering");
  const overrideId = SPRITE_OVERRIDES[name];
  if (overrideId) {
    const png = atlasCanvas(overrideId);
    if (png) return png;
  }
  return atlas[name];
}

/**
 * World units per art pixel for a pipeline sprite, or null if `name` is still procedural.
 * `render/draw.ts` uses this in place of the global `SPRITE_SCALE` / boss `spriteScale`
 * so an atlas sprite keeps its predecessor's world footprint at a higher art resolution.
 */
export function spriteWorldScale(name: SpriteName): number | null {
  const id = SPRITE_OVERRIDES[name];
  return id ? ATLAS[id]?.worldScale ?? null : null;
}

/** Fraction of an atlas sprite's height that sits below the feet anchor, or null. */
export function spriteFeet(name: SpriteName): number | null {
  const id = SPRITE_OVERRIDES[name];
  return id ? ATLAS[id]?.feet ?? null : null;
}

// --- characters -----------------------------------------------------------

function worn(id: string | null): Cosmetic | null {
  if (!id) return null;
  return COSMETICS_BY_ID[id] ?? null;
}

/**
 * Stacks a character into one canvas: back item behind everything, then the body, hair,
 * face, ears and finally the hat. Order matters and is the whole trick — cat ears go on
 * top of the hair and under the witch hat, exactly as anyone would expect.
 */
function composeCharacter(appearance: Appearance | null): HTMLCanvasElement {
  const a = appearance ?? {
    skin: 1, hair: 0, hairStyle: "bob" as const, eyes: 0, dye: 0,
    hat: null, ears: null, face: null, back: null, aura: null, weapon: null,
  };
  const { canvas, ctx } = blank(CHAR_W, CHAR_H);

  const back = worn(a.back);
  if (back?.art) {
    const art = COSMETIC_ART[back.art];
    if (art) stamp(ctx, art.grid, cosmeticPalette(back), art.dx, art.dy);
  }

  stamp(ctx, BODY, bodyPalette(a), BODY_DX, BODY_DY);

  const hair = HAIR[a.hairStyle] ?? HAIR.bob!;
  stamp(ctx, hair, hairPalette(a), BODY_DX, BODY_DY);

  for (const id of [a.face, a.ears, a.hat]) {
    const c = worn(id);
    if (!c?.art) continue;
    const art = COSMETIC_ART[c.art];
    if (art) stamp(ctx, art.grid, cosmeticPalette(c), art.dx, art.dy);
  }

  return canvas;
}

/** Everything about an appearance that changes the pixels, as one cache key. */
function appearanceKey(a: Appearance): string {
  return [
    a.skin, a.hair, a.hairStyle, a.eyes, a.dye,
    a.hat ?? "-", a.ears ?? "-", a.face ?? "-", a.back ?? "-",
  ].join("|");
}

const heroCache = new Map<string, HTMLCanvasElement>();

/** How a hero body wants to be drawn: the canvas plus its world scale and feet offset. */
export interface HeroSprite {
  readonly canvas: HTMLCanvasElement;
  readonly scale: number;
  readonly feet: number;
}

/** The procedural composed character's draw params (matches `drawSprite`'s old defaults). */
const PROC_HERO: Omit<HeroSprite, "canvas"> = { scale: 1.2, feet: 0.22 };

/**
 * The player's body, composed and cached. An appearance only changes in town, so this
 * misses once per wardrobe edit and never during a dive.
 *
 * The pipeline base (`hero.legend-base`) stands in whenever the player isn't wearing a
 * composited cosmetic layer (hat / ears / face / back). Those layers are still procedural
 * until their own art pass, so a decorated character falls back to the old stacked look —
 * consistent with itself, just not yet the new art.
 */
export function heroSprite(appearance: Appearance): HeroSprite {
  const plain = !appearance.hat && !appearance.ears && !appearance.face && !appearance.back;
  if (plain) {
    const id = SPRITE_OVERRIDES.hero;
    const png = id ? atlasCanvas(id) : null;
    if (png) {
      const meta = id ? ATLAS[id] : undefined;
      return { canvas: png, scale: meta?.worldScale ?? PROC_HERO.scale, feet: meta?.feet ?? PROC_HERO.feet };
    }
  }
  const key = appearanceKey(appearance);
  let canvas = heroCache.get(key);
  if (!canvas) {
    canvas = composeCharacter(appearance);
    // A wardrobe session can produce a lot of one-off looks; keep the map from growing
    // without bound while still holding everything anyone is actually wearing.
    if (heroCache.size > 64) heroCache.clear();
    heroCache.set(key, canvas);
  }
  return { canvas, ...PROC_HERO };
}

/** Cache key for anything derived from an appearance, so tints can be cached too. */
export function heroKey(appearance: Appearance): string {
  return appearanceKey(appearance);
}

// --- weapons --------------------------------------------------------------

const weaponCache = new Map<string, HTMLCanvasElement>();

/** The weapon in your hand, skinned by cosmetic if you have one and by rarity if not. */
export function weaponSprite(
  family: WeaponFamily,
  skinId: string | null,
  rarity: Rarity | null,
): HTMLCanvasElement {
  const key = `${family}|${skinId ?? "-"}|${rarity ?? "-"}`;
  const hit = weaponCache.get(key);
  if (hit) return hit;

  // Pipeline weapon: the authored greyscale PNG, tinted toward the rarity colour so a
  // mythic axe still glows before anyone reads the word. A cosmetic weapon skin is a
  // palette over the procedural grid, so those fall through to the bake below for now.
  const aw = ATLAS_WEAPONS[family];
  if (aw && !skinId) {
    const png = atlasCanvas(aw.id);
    if (png) {
      const made = rarity
        ? tintedCanvas(png, `atlasWeapon:${family}`, RARITY_COLORS[rarity], 0.26)
        : png;
      weaponCache.set(key, made);
      return made;
    }
  }

  const art = WEAPON_ART[family] ?? WEAPON_ART.sword!;
  const skin = skinId ? COSMETICS_BY_ID[skinId]?.weapon ?? null : null;
  const made = bake(art.grid, weaponPalette(skin ?? rarityWeaponPalette(rarity)));
  if (weaponCache.size > 128) weaponCache.clear();
  weaponCache.set(key, made);
  return made;
}

/** Where the grip sits inside a weapon sprite, so it can be rotated around the hand. */
export function weaponGrip(family: WeaponFamily): { x: number; y: number } {
  const aw = ATLAS_WEAPONS[family];
  if (aw && atlasCanvas(aw.id)) return { x: aw.gripX, y: aw.gripY };
  const art = WEAPON_ART[family] ?? WEAPON_ART.sword!;
  return { x: art.ax, y: art.ay };
}

/**
 * World units per art pixel for a pipeline weapon, or null if `family` is still on the
 * procedural grid. `render/draw.ts` uses this in place of the global `WEAPON_SCALE`.
 */
export function weaponWorldScale(family: WeaponFamily): number | null {
  const aw = ATLAS_WEAPONS[family];
  return aw && atlasCanvas(aw.id) ? aw.worldScale : null;
}

/** The bloom colour around a weapon, if it has one. Null for ordinary metal. */
export function weaponGlow(skinId: string | null, rarity: Rarity | null): string | null {
  const skin = skinId ? COSMETICS_BY_ID[skinId]?.weapon ?? null : null;
  return (skin ?? rarityWeaponPalette(rarity)).glow;
}

// --- chests -----------------------------------------------------------

/**
 * A little icon for the chest shop. A cache with exactly one weapon family shows that
 * weapon for real; the two armor/trinket category caches show their slot's icon; a
 * cache open to a whole group (any weapon, or nothing narrower than a rarity floor)
 * falls back to the chest prop, tinted with the chest's own listed colour so the shop
 * still reads as one colour per chest even without a bespoke grid for each of the 28.
 */
export function chestIcon(tier: ChestTier): HTMLCanvasElement {
  const info = CHESTS[tier];
  const types = info.types;

  const only = types?.length === 1 ? types[0]! : null;
  if (only && isWeaponType(only)) {
    return weaponSprite(only, null, null);
  }
  if (types?.includes("armor")) {
    return tintedCanvas(sprite("armor"), "chestIcon:armor", info.color, 0.55);
  }
  if (types?.includes("ring")) {
    return tintedCanvas(sprite("ring"), "chestIcon:ring", info.color, 0.55);
  }
  if (types && types.length > 1 && types.every(isWeaponType)) {
    return tintedCanvas(
      weaponSprite("sword", null, null), "chestIcon:anyWeapon", info.color, 0.4,
    );
  }
  return tintedCanvas(sprite("chest"), "chestIcon:chest", info.color, 0.55);
}

// --- items ----------------------------------------------------------------

/**
 * One rolled item as an icon, for anywhere the loot itself has to be *seen* rather than
 * listed — the chest slot machine, mainly. A weapon is its real family sprite painted in
 * its rarity's palette (so a mythic axe already glows before anyone reads the word); the
 * five non-weapon slots share their existing atlas icon, tinted toward the rarity colour,
 * because a ring is a ring and the rarity is the only thing worth telling apart at 32px.
 */
export function itemIcon(type: ItemType, rarity: Rarity): HTMLCanvasElement {
  if (isWeaponType(type)) return weaponSprite(type, null, rarity);
  return tintedCanvas(sprite(type), `itemIcon:${type}`, RARITY_COLORS[rarity], 0.5);
}

// --- cosmetic previews ----------------------------------------------------

const previewCache = new Map<string, HTMLCanvasElement>();

/**
 * One cosmetic on its own, for the wardrobe list. Auras and weapon skins have no grid,
 * so they preview as a swatch of their colour instead of nothing at all.
 */
export function cosmeticPreview(id: string): HTMLCanvasElement {
  const hit = previewCache.get(id);
  if (hit) return hit;

  const c = COSMETICS_BY_ID[id];
  let made: HTMLCanvasElement;
  if (!c) {
    made = blank(1, 1).canvas;
  } else if (c.art && COSMETIC_ART[c.art]) {
    const art = COSMETIC_ART[c.art]!;
    made = bake(art.grid, cosmeticPalette(c));
  } else if (c.weapon) {
    made = bake(WEAPON_ART.sword!.grid, weaponPalette(c.weapon));
  } else {
    const { canvas, ctx } = blank(8, 8);
    ctx.fillStyle = c.colors[0] ?? "#ffffff";
    ctx.beginPath();
    ctx.arc(4, 4, 3.4, 0, Math.PI * 2);
    ctx.fill();
    made = canvas;
  }
  previewCache.set(id, made);
  return made;
}

// --- derived canvases -----------------------------------------------------

const tintCache = new Map<string, HTMLCanvasElement>();

/** A recoloured copy of any canvas. `key` must identify the source uniquely. */
export function tintedCanvas(
  src: HTMLCanvasElement, key: string, color: string, strength = 0.6,
): HTMLCanvasElement {
  const id = `${key}|${color}|${strength}`;
  const hit = tintCache.get(id);
  if (hit) return hit;

  const { canvas, ctx } = blank(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = strength;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (tintCache.size > 512) tintCache.clear();
  tintCache.set(id, canvas);
  return canvas;
}

const flashCache = new Map<string, HTMLCanvasElement>();

/** Solid-colour silhouette of any canvas — the white flash when something takes a hit. */
export function silhouetteCanvas(
  src: HTMLCanvasElement, key: string, color = "#ffffff",
): HTMLCanvasElement {
  const id = `${key}|${color}`;
  const hit = flashCache.get(id);
  if (hit) return hit;

  const { canvas, ctx } = blank(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (flashCache.size > 512) flashCache.clear();
  flashCache.set(id, canvas);
  return canvas;
}

/** Tinted copy of an atlas sprite, for rarity-tinted elites and infused monsters. */
export function tinted(name: SpriteName, color: string, strength = 0.6): HTMLCanvasElement {
  return tintedCanvas(sprite(name), name, color, strength);
}

/** Silhouette of an atlas sprite. */
export function silhouette(name: SpriteName, color = "#ffffff"): HTMLCanvasElement {
  return silhouetteCanvas(sprite(name), name, color);
}
