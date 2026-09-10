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
import { NAMED_BY_ID } from "../data/named";
import {
  ATLAS, ATLAS_COSMETICS, ATLAS_WEAPONS, ATLAS_WEAPON_SKINS,
  COSMETIC_MARK_1, COSMETIC_MARK_2, COSMETIC_MARK_3,
  cosmeticStageXY, heroStage,
} from "./atlas/manifest";
import { type Appearance, type Cosmetic, COSMETICS_BY_ID } from "../data/cosmetics";
import { isWeaponType, type ItemType } from "../data/items";
import { chooseItemArt, chooseRelicArt, type ArtAvailability, type ItemArtChoice, ATLAS_WEAPON_WASH } from "./itemart";
import { chooseHeroArt, chooseSpriteArt, type SpriteArt } from "./spriteart";
import type { ClassId } from "../data/classes";
import { RARITY_COLORS, type Rarity } from "../data/rarity";
import type { WeaponFamily } from "../data/weapons";
import {
  BODY, BODY_DX, BODY_DY, BODY_H, BOSS_GRIDS, CHAR_H, CHAR_W, COSMETIC_ART, HAIR,
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
  | "bossFerryman" | "bossWarQueen" | "bossLabyrinth" | "bossTyrant"
  | "towerBossCherub" | "towerBossVirtue" | "towerBossPower" | "towerBossThrone" | "towerBossNameless"
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
    bossFerryman: bake(BOSS_GRIDS.bossFerryman!, P.ferryman),
    bossWarQueen: bake(BOSS_GRIDS.bossWarQueen!, P.warQueen),
    bossLabyrinth: bake(BOSS_GRIDS.bossLabyrinth!, P.labyrinth),
    bossTyrant: bake(BOSS_GRIDS.bossTyrant!, P.tyrant),
    // Procedural fallbacks only — `towerBossSpec` always has its own atlas PNG committed
    // (`art/bosses/finish-tower.ts`), so these never actually draw. They exist because
    // `SpriteName` is closed and this Record must be fully populated; reusing the
    // borrowed template's own grid costs nothing and needs no new pixel art.
    towerBossCherub: bake(BOSS_GRIDS.boss!, P.warden),
    towerBossVirtue: bake(BOSS_GRIDS.bossChoir!, P.choir),
    towerBossPower: bake(BOSS_GRIDS.bossColossus!, P.colossus),
    towerBossThrone: bake(BOSS_GRIDS.bossHerald!, P.herald),
    towerBossNameless: bake(BOSS_GRIDS.bossNameless!, P.nameless),
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

/** Whether an atlas id's PNG is really decoded — the one fact `spriteart.ts` can't know. */
const isLoaded = (id: string): boolean => atlasCanvas(id) !== null;

/**
 * A sprite resolved to **one** rung of the art ladder: the sheet it draws from, the world
 * scale that sheet is measured in, its feet anchor and its animation table, all from the
 * same decision.
 *
 * Read {@link SpriteArt}'s doc in `render/spriteart.ts` for why this is a type rather than
 * a pair of getters. The short version: `worldScale` is non-null exactly when `sheet` is
 * an atlas PNG, so drawing a procedural grid at an atlas scale — which shipped three raid
 * bosses at a third of their size — is no longer expressible.
 *
 * Build one with {@link resolveSprite}. Never assemble one by hand.
 */
export interface DrawableSprite extends SpriteArt {
  /** The picture, or the whole strip for an animated sprite. Never null. */
  readonly sheet: HTMLCanvasElement;
}

/**
 * The art a sprite draws right now: the realm's set, then the game-wide default, then the
 * procedural bake — see `chooseSpriteArt`, which owns the ladder and is checked headlessly.
 *
 * `set` comes from `BiomeStyle.monsterSet`. Passing nothing is the game-wide default,
 * which every non-monster sprite and every boss want.
 */
export function resolveSprite(name: SpriteName, set?: string): DrawableSprite {
  if (!atlas) throw new Error("buildSprites() must run before rendering");
  const art = chooseSpriteArt(name, set, isLoaded);
  // `chooseSpriteArt` only ever names an id `isLoaded` agreed on, so the `??` is an
  // invariant rather than a branch — but a draw path never throws, so it degrades. Note
  // that it degrades to the procedural sheet *and* would need the procedural scale; that
  // pairing is why this lookup lives here, where both are still in hand, instead of at a
  // call site holding only one of them.
  const png = art.atlasId ? atlasCanvas(art.atlasId) : null;
  if (art.atlasId && !png) return { ...art, atlasId: null, meta: undefined, worldScale: null, feet: null, sheet: atlas[name] };
  return { ...art, sheet: png ?? atlas[name] };
}

/**
 * One frame cut out of an animated strip, cached. A sprite with no `anim` table has no
 * strip to cut, so it hands back the whole sheet and costs nothing.
 *
 * Cached against the sprite id and frame index rather than rebuilt per draw: a boss is
 * drawn every frame of every tick of a two-minute fight.
 */
const frameCache = new Map<string, HTMLCanvasElement>();

/** Which cell of the strip a frame index means, clamped into range. Never throws. */
function frameIndex(s: DrawableSprite, frame: number): number {
  const cols = s.meta?.anim?.cols ?? 1;
  return Math.min(Math.max(0, Math.floor(frame) || 0), cols - 1);
}

/** A resolved sprite's cache identity, which must include which rung it landed on. */
function artKey(s: DrawableSprite, frame: number): string {
  return `${s.atlasId ?? s.name}#${frameIndex(s, frame)}`;
}

/** A resolved sprite's picture at an animation frame. Out-of-range indices are clamped. */
export function spriteFrame(s: DrawableSprite, frame: number): HTMLCanvasElement {
  const meta = s.meta;
  if (!s.atlasId || !meta?.anim || meta.anim.cols <= 1) return s.sheet;
  const key = artKey(s, frame);
  const hit = frameCache.get(key);
  if (hit) return hit;
  const { canvas, ctx } = blank(meta.w, meta.h);
  ctx.drawImage(s.sheet, frameIndex(s, frame) * meta.w, 0, meta.w, meta.h, 0, 0, meta.w, meta.h);
  if (frameCache.size > 256) frameCache.clear();
  frameCache.set(key, canvas);
  return canvas;
}

/** Tinted copy of one animation frame. Keyed per frame so frames can't share an entry. */
export function spriteFrameTinted(
  s: DrawableSprite, frame: number, color: string, strength = 0.6,
): HTMLCanvasElement {
  return tintedCanvas(spriteFrame(s, frame), artKey(s, frame), color, strength);
}

/** Silhouette of one animation frame. */
export function spriteFrameSilhouette(
  s: DrawableSprite, frame: number, color = "#ffffff",
): HTMLCanvasElement {
  return silhouetteCanvas(spriteFrame(s, frame), artKey(s, frame), color);
}

/**
 * A sprite's picture, **always the first frame** for an animated one — for the UI surfaces
 * (the HUD, the town screens) that draw at their own pixel sizes and never ask for a world
 * scale, so the pairing this module is built around cannot come apart for them.
 *
 * Frame 0 being the default is deliberate and it is what makes animating a sprite safe:
 * `art/anim/strip.py` builds a strip whose frame 0 is the sprite that shipped before it,
 * so any call site that has not opted into animation keeps drawing pixel-identically to
 * what it drew before. A missed call site is not a bug, it is just a still picture.
 *
 * **Anything drawn in world units wants {@link resolveSprite} instead.**
 */
export function sprite(name: SpriteName): HTMLCanvasElement {
  return spriteFrame(resolveSprite(name), 0);
}

// --- pipeline cosmetic layers -----------------------------------------------

function hexToRgb(hex: string): readonly [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `COSMETIC_MARK_1/2/3` pre-parsed, in `Cosmetic.colors[0..2]` order. */
const COSMETIC_MARKERS: readonly (readonly [number, number, number])[] =
  [COSMETIC_MARK_1, COSMETIC_MARK_2, COSMETIC_MARK_3].map(hexToRgb);

const cosmeticRecolorCache = new Map<string, HTMLCanvasElement>();

/**
 * Recolours a marker-quantized `ATLAS_COSMETICS` PNG toward a cosmetic's actual
 * `colors` — the pipeline equivalent of `cosmeticPalette` for a procedural grid. Any
 * pixel that isn't one of the three reserved markers (the `ink` outline, chiefly) is
 * left exactly as authored, exactly like an unrecognised grid key in `stamp`.
 */
function recoloredCosmetic(
  png: HTMLCanvasElement, key: string, colors: readonly string[],
): HTMLCanvasElement {
  const cacheKey = `${key}|${colors.join(",")}`;
  const hit = cosmeticRecolorCache.get(cacheKey);
  if (hit) return hit;

  const { canvas, ctx } = blank(png.width, png.height);
  ctx.drawImage(png, 0, 0);
  const targets = colors.slice(0, 3).map(hexToRgb);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    for (let m = 0; m < COSMETIC_MARKERS.length; m++) {
      const marker = COSMETIC_MARKERS[m]!;
      if (data[i] === marker[0] && data[i + 1] === marker[1] && data[i + 2] === marker[2]) {
        const t = targets[m];
        if (t) { data[i] = t[0]; data[i + 1] = t[1]; data[i + 2] = t[2]; }
        break;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (cosmeticRecolorCache.size > 256) cosmeticRecolorCache.clear();
  cosmeticRecolorCache.set(cacheKey, canvas);
  return canvas;
}

/** A worn cosmetic resolved to its migrated pipeline layer, ready to stamp. */
interface ResolvedLayer {
  readonly cosmetic: Cosmetic;
  readonly dx: number;
  readonly dy: number;
  readonly png: HTMLCanvasElement;
}

/**
 * Resolves one equipped slot against `ATLAS_COSMETICS`.
 * - `undefined` — nothing worn in this slot (never blocks the pipeline path).
 * - `null` — something is worn but isn't migrated yet (blocks the pipeline path; the
 *   caller falls all the way back to the procedural composite, same as today).
 * - a `ResolvedLayer` — worn, migrated, ready to stamp.
 */
function resolvePipelineLayer(id: string | null): ResolvedLayer | null | undefined {
  if (!id) return undefined;
  const c = COSMETICS_BY_ID[id];
  if (!c?.art) return null;
  const meta = ATLAS_COSMETICS[c.art];
  const png = meta ? atlasCanvas(meta.id) : null;
  if (!meta || !png) return null;
  return { cosmetic: c, dx: meta.dx, dy: meta.dy, png };
}

/**
 * Composes the pipeline hero (`hero.legend-base`) with every equipped hat/ears/face/back
 * cosmetic that has migrated `ATLAS_COSMETICS` art, or returns null if the base itself
 * isn't loaded or if *any* worn cosmetic in those four slots hasn't migrated yet — an
 * all-or-nothing rule that matches the pre-migration behaviour (any unmigrated cosmetic
 * layer falls the whole character back to the procedural stack) so a half-migrated
 * wardrobe never mixes two art styles on one character.
 *
 * Layer order mirrors the procedural stack: back item behind everything (the hero's own
 * silhouette is narrower than the stage, so wings/a cape/a tail peek out at the
 * sides exactly as the procedural `CHAR_W` margin lets them), then the hero body itself,
 * then face, ears and hat on top. The hero body already carries its own baked hair, so
 * hair is not a separate layer here — see the note below.
 *
 * Hair colour/style customisation does not yet reach the pipeline hero: it's baked into
 * `hero.legend-base` as a single fixed look, not a separate recolourable layer. Giving it
 * one would mean redrawing that (already-shipped, style-guide-referenced) base without
 * its baked-in hair — a real scope question left for the owner rather than guessed at
 * here; see the migration report for detail.
 */
function composePipelineHero(
  appearance: Appearance, classId: ClassId | undefined,
): { canvas: HTMLCanvasElement; art: SpriteArt } | null {
  // The class's own hero, then the shared base — one decision, and it carries the scale
  // and feet that go with whichever rung it landed on.
  const art = chooseHeroArt(classId, isLoaded);
  const basePng = art.atlasId ? atlasCanvas(art.atlasId) : null;
  if (!basePng || !art.meta) return null;

  const back = resolvePipelineLayer(appearance.back);
  const face = resolvePipelineLayer(appearance.face);
  const ears = resolvePipelineLayer(appearance.ears);
  const hat = resolvePipelineLayer(appearance.hat);
  if (back === null || face === null || ears === null || hat === null) return null;

  const heroW = art.meta.w, heroH = art.meta.h;
  // The stage is sized to THIS hero, so a class hero of any height gets a canvas with its
  // own proportional headroom instead of floating inside one cut for a different sprite.
  const stage = heroStage(heroW, heroH);
  const { canvas, ctx } = blank(stage.w, stage.h);
  // Every layer is placed through `cosmeticStageXY`, which resolves its anchor against
  // THIS hero's size. A layer that lands partly or wholly off the stage is clipped by the
  // canvas — `drawImage` does not throw for that — so a hero whose body does not match
  // what a layer was authored against degrades to a badly-placed hat, never to a hole or
  // an exception. Placing it *well* on a hero of a different height is the cosmetic
  // rework the owner has parked; not crashing is this function's job and it does it.
  if (back) {
    const at = cosmeticStageXY(ATLAS_COSMETICS[back.cosmetic.art!]!, heroW, heroH);
    const recolored = recoloredCosmetic(back.png, `cosmetic:${appearance.back}`, back.cosmetic.colors);
    ctx.drawImage(recolored, at.dx, at.dy);
  }
  ctx.drawImage(basePng, stage.dx, stage.dy);
  for (const layer of [face, ears, hat]) {
    if (!layer) continue;
    const at = cosmeticStageXY(ATLAS_COSMETICS[layer.cosmetic.art!]!, heroW, heroH);
    const recolored = recoloredCosmetic(layer.png, `cosmetic:${layer.cosmetic.id}`, layer.cosmetic.colors);
    ctx.drawImage(recolored, at.dx, at.dy);
  }
  return { canvas, art };
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

/**
 * The fallback for the pipeline body's height, for the impossible case of the hero being
 * absent from the atlas manifest — normally it is `ATLAS["hero.legend-base"].h`.
 *
 * Both canvases `heroSprite` can return are bigger than the body they hold (the extra is
 * headroom a hat grows into) and they pad it by very different fractions — 4 rows of 26
 * procedurally against 20 of 68 in the stage — so canvas height is no use as a stand-in
 * for how big the character *looks*. Both do stand their body flush on their own bottom
 * row, though, which is what lets one bottom-aligned box hold either; the smoke test
 * measures the art to keep that true. See `src/ui/portrait.ts`.
 */
const PIPELINE_BODY_H = 48;

/** How a hero body wants to be drawn: the canvas plus its world scale and feet offset. */
export interface HeroSprite {
  readonly canvas: HTMLCanvasElement;
  readonly scale: number;
  readonly feet: number;
  /** The character's own height in authored pixels, not the canvas's — see `src/ui/portrait.ts`. */
  readonly bodyHeight: number;
}

/** The procedural composed character's draw params (matches `drawSprite`'s old defaults). */
const PROC_HERO: Omit<HeroSprite, "canvas"> = { scale: 1.2, feet: 0.22, bodyHeight: BODY_H };

const pipelineHeroCache = new Map<string, { canvas: HTMLCanvasElement; art: SpriteArt } | null>();

/**
 * The player's body, composed and cached. An appearance only changes in town, so this
 * misses once per wardrobe edit and never during a dive.
 *
 * The pipeline base (`hero.legend-base`) draws whenever every hat/ears/face/back cosmetic
 * currently worn (any, none, or all four) has migrated `ATLAS_COSMETICS` art — including
 * the plain case, which is just `composePipelineHero` with nothing worn. The moment one
 * worn slot isn't migrated yet, the whole character falls back to the old procedural
 * stack, consistent with itself rather than mixing two art styles on one body.
 */
export function heroSprite(appearance: Appearance, classId?: ClassId): HeroSprite {
  // The class is part of the identity: two classes wearing the same appearance are two
  // different pictures once either has its own art.
  const key = `${classId ?? "-"}|${appearanceKey(appearance)}`;
  let pipeline: { canvas: HTMLCanvasElement; art: SpriteArt } | null;
  if (pipelineHeroCache.has(key)) {
    pipeline = pipelineHeroCache.get(key)!;
  } else {
    pipeline = composePipelineHero(appearance, classId);
    if (pipelineHeroCache.size > 64) pipelineHeroCache.clear();
    pipelineHeroCache.set(key, pipeline);
  }
  if (pipeline) {
    // `pipeline.art`, not a second `ATLAS` lookup. The composite was built from a specific
    // rung of the hero ladder and its scale has to come off that same rung — asking
    // `SPRITE_OVERRIDES.hero` here would hand a class hero's canvas the *base* hero's
    // scale, which is the P0 bug this codebase has already paid for once.
    const meta = pipeline.art.meta;
    // `feet` is a fraction of the sprite's own canvas height; the stage canvas is taller
    // than the bare hero PNG (headroom for a hat, side margin for wings), so the same
    // absolute below-feet sliver is a smaller fraction of it. `worldScale` is unaffected
    // — it's world units per authored pixel, so padding the canvas costs nothing (see
    // `HERO_STAGE_*` in the manifest).
    const feet = meta ? (meta.feet * meta.h) / heroStage(meta.w, meta.h).h : PROC_HERO.feet;
    return {
      canvas: pipeline.canvas,
      scale: pipeline.art.worldScale ?? PROC_HERO.scale,
      feet,
      bodyHeight: meta?.h ?? PIPELINE_BODY_H,
    };
  }
  return { canvas: heroComposite(appearance), ...PROC_HERO };
}

/**
 * The procedurally composed character, always — every cosmetic layer stacked, cached
 * against the appearance.
 *
 * This used to be what the town's big portraits called, back when the pipeline base
 * carried only a plain body and routing them through `heroSprite` would have dropped
 * every hat. `composePipelineHero` layers the migrated cosmetics now, so that reason is
 * gone and both portraits go through `heroSprite` like the world and hub renderers do —
 * this stays exported for the fallback path inside `heroSprite` and for anything that
 * genuinely wants the procedural stack regardless of what has migrated.
 */
export function heroComposite(appearance: Appearance): HTMLCanvasElement {
  const key = appearanceKey(appearance);
  let canvas = heroCache.get(key);
  if (!canvas) {
    canvas = composeCharacter(appearance);
    // A wardrobe session can produce a lot of one-off looks; keep the map from growing
    // without bound while still holding everything anyone is actually wearing.
    if (heroCache.size > 64) heroCache.clear();
    heroCache.set(key, canvas);
  }
  return canvas;
}

/** Cache key for anything derived from an appearance, so tints can be cached too. */
export function heroKey(appearance: Appearance): string {
  return appearanceKey(appearance);
}

// --- weapons --------------------------------------------------------------

const weaponDrawCache = new Map<string, WeaponDraw>();

/** The weapon in your hand, skinned by cosmetic if you have one and by rarity if not. */
/** How a weapon wants to be drawn: the picture, its grip pixel and its world scale. */
export interface WeaponDraw {
  readonly canvas: HTMLCanvasElement;
  readonly gripX: number;
  readonly gripY: number;
  /** null = the procedural bake, where the caller's own `WEAPON_SCALE` applies. */
  readonly worldScale: number | null;
}

function resolveWeaponDraw(
  family: WeaponFamily, skinId: string | null, rarity: Rarity | null, namedId: string | null,
): WeaponDraw {
  // Pipeline weapon: the authored PNG, tinted toward the rarity colour so a mythic axe
  // still glows before anyone reads the word.
  //
  // **A skin overrides the rarity tint rather than composing with it, and that is a
  // ruling, not an oversight.** The owner was asked directly (Sept 2026) and chose it: a
  // skinned mythic reads as *starforged* in the hand, not as mythic, because cosmetics are
  // pure vanity and vanity is never overruled by power. Rarity stays legible everywhere it
  // is actually read — the stash card, the compare panel, the loot banner and the paper
  // doll all go through `itemSprite`, which is untouched by this.
  //
  // **Two owner rulings sit here and they look contradictory until you say why they are
  // not.** A skin beats the rarity wash, and a named weapon beats the skin. The order is
  // decoration < vanity < identity: a rarity wash is a *colour*, so the thing the player
  // chose to look at wins; a named weapon is an *object*, and this game already refuses to
  // let the workbench sell a named item's identity (Reforge, Temper and Salvage only — see
  // `docs/named-items.md`), so a cosmetic does not get to overwrite it either.
  //
  // The check is on the ITEM being named, never on what art happens to exist. A named
  // weapon of a family nobody has drawn yet still refuses the skin and draws its ordinary
  // weapon — the rule is about what you are holding, not about the state of the pipeline.
  const namedArt = namedId ? ATLAS_WEAPON_SKINS[namedId] : undefined;
  if (namedArt && namedArt.family === family) {
    const png = atlasCanvas(namedArt.id);
    if (png) return { canvas: png, gripX: namedArt.gripX, gripY: namedArt.gripY, worldScale: namedArt.worldScale };
  }

  // A skin draws only when it has authored art for the family actually being **held** (the
  // "may never lie" rule in `data/cosmetics.ts`). When it has none, the ordinary authored
  // weapon draws — not the procedural bake. That is what lets skins ship one weapon at a
  // time, and it ends a live defect: a skin used to force the bake, so equipping a mythic
  // cosmetic made your weapon look markedly *worse* than wearing none. An undrawn skin is
  // now inert rather than destructive.
  const skinArt = !namedId && skinId ? ATLAS_WEAPON_SKINS[skinId] : undefined;
  if (skinArt && skinArt.family === family) {
    const png = atlasCanvas(skinArt.id);
    if (png) return { canvas: png, gripX: skinArt.gripX, gripY: skinArt.gripY, worldScale: skinArt.worldScale };
  }

  const aw = ATLAS_WEAPONS[family];
  if (aw) {
    const png = atlasCanvas(aw.id);
    if (png) {
      const canvas = rarity
        ? tintedCanvas(png, `atlasWeapon:${family}`, RARITY_COLORS[rarity], ATLAS_WEAPON_WASH)
        : png;
      return { canvas, gripX: aw.gripX, gripY: aw.gripY, worldScale: aw.worldScale };
    }
  }

  // The procedural bake, and the only rung where a skin is still a palette rather than art.
  const art = WEAPON_ART[family] ?? WEAPON_ART.sword!;
  const skin = !namedId && skinId ? COSMETICS_BY_ID[skinId]?.weapon ?? null : null;
  return {
    canvas: bake(art.grid, weaponPalette(skin ?? rarityWeaponPalette(rarity))),
    gripX: art.ax, gripY: art.ay, worldScale: null,
  };
}

/**
 * Everything about how a weapon is drawn, resolved **once**.
 *
 * The canvas, the grip it rotates around and its world scale all belong to the same rung
 * of the ladder above, so they are returned together. They used to be three separate
 * lookups keyed on `family` alone (`weaponSprite` / `weaponGrip` / `weaponWorldScale`),
 * which meant only the first of them knew a skin was equipped — so the first authored skin
 * would have been drawn with its own picture at the *family's* size, pivoting around the
 * *family's* grip pixel. That is the same two-decision shape that drew three raid bosses at
 * a third of their size (`b1e3f2e`); one decision is the fix, in both places.
 */
export function weaponDraw(
  family: WeaponFamily, skinId: string | null, rarity: Rarity | null, namedId: string | null = null,
): WeaponDraw {
  const key = `${family}|${skinId ?? "-"}|${rarity ?? "-"}|${namedId ?? "-"}`;
  const hit = weaponDrawCache.get(key);
  if (hit) return hit;
  const made = resolveWeaponDraw(family, skinId, rarity, namedId);
  if (weaponDrawCache.size > 128) weaponDrawCache.clear();
  weaponDrawCache.set(key, made);
  return made;
}

/** Just the picture, for the surfaces that only need one (icons, the paper doll). */
export function weaponSprite(
  family: WeaponFamily, skinId: string | null, rarity: Rarity | null, namedId: string | null = null,
): HTMLCanvasElement {
  return weaponDraw(family, skinId, rarity, namedId).canvas;
}

/** Where the grip sits inside a weapon sprite, so it can be rotated around the hand. */
export function weaponGrip(family: WeaponFamily, skinId: string | null = null): { x: number; y: number } {
  const d = weaponDraw(family, skinId, null);
  return { x: d.gripX, y: d.gripY };
}

/**
 * World units per art pixel for a pipeline weapon, or null when it is still on the
 * procedural grid. `render/draw.ts` uses this in place of the global `WEAPON_SCALE`.
 */
export function weaponWorldScale(family: WeaponFamily, skinId: string | null = null): number | null {
  return weaponDraw(family, skinId, null).worldScale;
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
 *
 * `art` is a named item's own atlas id (`NamedItemDef.art`). When that sprite is in the
 * manifest *and* its PNG loaded, it is the icon; otherwise the item quietly draws as its
 * type — an unauthored or missing art id is never a broken screen, exactly as a removed
 * cosmetic id is dropped rather than crashing the character sheet.
 */
export function itemIcon(type: ItemType, rarity: Rarity, art: string | null = null): HTMLCanvasElement {
  return itemSpriteFor(type, rarity, art).canvas;
}

/** An item's picture and how big it is in the world. Both answers, from one decision. */
export interface ItemSprite {
  readonly canvas: HTMLCanvasElement;
  /** Draw scale for the dungeon floor. The DOM surfaces fit to a box and ignore it. */
  readonly worldScale: number;
}

/**
 * What an item looks like — **the** answer, for every surface that draws one.
 *
 * The stash card, the chest reel, the loot banner, the Hero paper-doll and the thing lying
 * on the dungeon floor all resolve through here, which is what makes UAT §11's critical
 * requirement true by construction rather than by everyone remembering. It returns the
 * world scale alongside the canvas because that is the only thing the floor needs and the
 * DOM doesn't: splitting it into a second function would have re-created the two-sources
 * problem in the exact shape it was just removed from.
 *
 * The resolution order, and every step is a fallback for the one before it:
 *
 *  1. the item's own authored art, if the manifest has a row *and* the PNG loaded
 *  2. a weapon's real family sprite in its rarity's palette — a mythic axe glows before
 *     anyone reads the word
 *  3. the type's shared icon, washed toward the rarity colour, because a ring is a ring
 *     and at 32px the rarity is the only thing worth telling apart
 *  4. a capsule, washed the same way, if even the type has no sprite
 *
 * Nothing here can throw on missing art. An unauthored id, a PNG that failed to load, a
 * type with no icon: each falls to the next line, the same way `normalizeAppearance` drops
 * a cosmetic id that no longer exists rather than crashing the character screen.
 */
export function itemSpriteFor(type: ItemType, rarity: Rarity, art: string | null = null): ItemSprite {
  // The *decision* is `chooseItemArt` in `render/itemart.ts`, which is pure so the §11
  // property can be asserted from Node. This function only executes it.
  const choice = chooseItemArt(type, rarity, art, ART_AVAILABLE);
  // `hasAtlas` already said an atlas choice was drawable; if it somehow isn't, fall to the
  // type rather than returning nothing.
  return executeArtChoice(choice) ?? itemSpriteFor(type, rarity, null);
}

/**
 * Turns an `ItemArtChoice` into pixels — the one executor for every item surface and for
 * relics. Null only when an atlas choice's image is missing after all; callers fall back.
 */
function executeArtChoice(choice: ItemArtChoice): ItemSprite | null {
  switch (choice.kind) {
    case "atlas": {
      const png = atlasCanvas(choice.id);
      return png ? { canvas: png, worldScale: ATLAS[choice.id]!.worldScale } : null;
    }
    case "weapon":
      return {
        canvas: weaponSprite(choice.family, null, choice.rarity),
        worldScale: weaponWorldScale(choice.family) ?? 1,
      };
    case "icon": {
      const name = choice.sprite as SpriteName;
      // One decision: the picture and the scale it is measured in come from the same
      // `resolveSprite`, so a procedural icon rides the legacy 1.4 and an atlas one rides
      // its own row. Taking these from two calls is the bug this module now prevents.
      const art = resolveSprite(name);
      return {
        canvas: tintedCanvas(art.sheet, `itemIcon:${name}`, RARITY_COLORS[choice.rarity], choice.wash),
        worldScale: art.worldScale ?? 1.4,
      };
    }
  }
}

/** What this build can actually draw, for `chooseItemArt` to fall back against. */
const ART_AVAILABLE: ArtAvailability = {
  hasAtlas: (id) => !!ATLAS[id] && !!atlasCanvas(id),
  hasSprite: (name) => !!atlas && name in atlas,
};

/** The art id a named item asks for, or null — so call sites never touch the registry. */
export function itemArtId(item: { named: string | null }): string | null {
  return item.named ? NAMED_BY_ID[item.named]?.art ?? null : null;
}

/** `itemSpriteFor` for an actual item, art included — the call site everything should use. */
export function itemSprite(item: { type: ItemType; rarity: Rarity; named: string | null }): ItemSprite {
  return itemSpriteFor(item.type, item.rarity, itemArtId(item));
}

/**
 * A relic or artifact's picture (`data/relics.ts`). The *decision* is `chooseRelicArt` in
 * `render/itemart.ts` — its atlas art when a `relic.<id>` row and PNG exist, otherwise the
 * gem glyph washed toward the rarity its tier presents as — and it is executed by the same
 * `executeArtChoice` every item surface uses, so a relic can never be a different colour
 * on the floor than in a slot. Every shipped relic is on the fallback until the art pass.
 */
export function relicSprite(def: { art?: string; rarity: Rarity }): ItemSprite {
  const choice = chooseRelicArt(def, ART_AVAILABLE);
  return executeArtChoice(choice) ?? executeArtChoice(chooseRelicArt({ rarity: def.rarity }, ART_AVAILABLE))!;
}

/** `relicSprite`'s canvas alone, for the DOM surfaces that fit it into a box. */
export function relicArt(def: { art?: string; rarity: Rarity }): HTMLCanvasElement {
  return relicSprite(def).canvas;
}

/**
 * An augment (`data/augments.ts`). Deliberately **not** a second art decision: an augment
 * has no authored art and its grade is an ordinary `Rarity`, so it runs the relic ladder
 * unchanged and comes out as the gem glyph washed toward its grade. Forking the executor
 * to draw an augment "specially" is the exact drift `npm run itemart` exists to catch, so
 * every surface that draws one calls this.
 */
export function augmentSprite(def: { grade: Rarity }): ItemSprite {
  return relicSprite({ rarity: def.grade });
}

export function augmentArt(def: { grade: Rarity }): HTMLCanvasElement {
  return augmentSprite(def).canvas;
}

/** Cache key for `pixelImageFit` over `relicArt` — the same inputs, so the same image. */
export function relicArtKey(def: { id: string; art?: string; rarity: Rarity }): string {
  return `relic:${def.id}:${def.rarity}:${def.art ?? "-"}`;
}

/** `itemSprite`'s canvas alone, for the DOM surfaces that fit it into a box. */
export function itemArt(item: { type: ItemType; rarity: Rarity; named: string | null }): HTMLCanvasElement {
  return itemSprite(item).canvas;
}

/** Cache key for `pixelImageFit` over `itemArt` — the same inputs, so the same image. */
export function itemArtKey(prefix: string, item: { type: ItemType; rarity: Rarity; named: string | null }): string {
  return `${prefix}:${item.type}:${item.rarity}:${itemArtId(item) ?? "-"}`;
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
  const migrated = c?.art ? ATLAS_COSMETICS[c.art] : undefined;
  const migratedPng = migrated ? atlasCanvas(migrated.id) : null;
  if (!c) {
    made = blank(1, 1).canvas;
  } else if (migrated && migratedPng) {
    // The Style tab and any other wardrobe list read this — a migrated cosmetic previews
    // as its real pipeline art (recoloured toward this cosmetic's own colours), not the
    // procedural grid, even while other cosmetics in the same slot are still procedural.
    made = recoloredCosmetic(migratedPng, `cosmetic:${id}`, c.colors);
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
