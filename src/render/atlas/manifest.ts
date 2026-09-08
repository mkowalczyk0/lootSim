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
  // §9 The Legends — the plain, calm base adventurer. Replaces the composed procedural
  // character (30×26 grid at SPRITE_SCALE 1.2 ≈ 31 world units tall) while the player
  // isn't wearing a composited cosmetic layer (hat/ears/face/back) — those layers are
  // still procedural until their own art pass, so a decorated character keeps the old
  // look for now. v2 redraw (Sept 2026): higher detail to sit alongside the redrawn
  // bosses — the owner's call that the plain low-res hero "looked out of place in a
  // boss fight". World footprint unchanged: 68px × 0.471 ≈ 32, same as the v1 sprite.
  "hero.legend-base": { id: "hero.legend-base", w: 39, h: 68, worldScale: 0.471, feet: 0.04 },

  // --- monsters (§10) --- worldScale ≈ predecessor grid height × SPRITE_SCALE (1.2),
  // then ~1.13× for legibility (the rot-scuttler precedent). Legacy grids: imp/ranger
  // 22 tall, brute 24, crawler 13.
  "reliquary.monster.rot-imp":     { id: "reliquary.monster.rot-imp",     w: 16, h: 41, worldScale: 0.73, feet: 0.05 },
  "reliquary.monster.bone-archer": { id: "reliquary.monster.bone-archer", w: 26, h: 47, worldScale: 0.63, feet: 0.05 },
  "reliquary.monster.iron-brute":  { id: "reliquary.monster.iron-brute",  w: 34, h: 39, worldScale: 0.83, feet: 0.05 },
  "reliquary.monster.cult-caster": { id: "reliquary.monster.cult-caster", w: 22, h: 48, worldScale: 0.62, feet: 0.12 },
  // §8.2 The Rotting Garden — replaces `swarmer` (MOB_CRAWLER, 17×13 ≈ 15.6 world tall);
  // 24px × 0.72 ≈ 17.3, slightly bigger and far more legible.
  "reliquary.monster.rot-scuttler": { id: "reliquary.monster.rot-scuttler", w: 31, h: 24, worldScale: 0.72, feet: 0.06 },

  // --- bosses (§11) --- worldScale lands the art on the full old grid extent
  // (26 × spriteScale from data/bosses.ts): warden 100, choir 92, colossus 134,
  // herald 110, nameless 112. feet ≈ 0 — trimmed, standing on the bottom row.
  "boss.warden":              { id: "boss.warden",              w: 57, h: 89, worldScale: 1.12, feet: 0.03 },
  "boss.corrupted-saint":     { id: "boss.corrupted-saint",     w: 76, h: 92, worldScale: 1.09, feet: 0.03 },
  "boss.gravebound-colossus": { id: "boss.gravebound-colossus", w: 84, h: 87, worldScale: 1.54, feet: 0.03 },
  "boss.herald-unspoken":     { id: "boss.herald-unspoken",     w: 76, h: 94, worldScale: 1.17, feet: 0.02 },
  "boss.nameless":            { id: "boss.nameless",            w: 73, h: 87, worldScale: 1.29, feet: 0.03 },

  // --- props (§4, §8) --- drawn through drawProps at `worldScale × p.scale`. Legacy
  // grids ~6–16 wide at the old fixed 1.25; worldScale ≈ old world width / new art width,
  // nudged up ~1.1× for legibility. feet ≈ 0 (trimmed, on the ground).
  "prop.chest":    { id: "prop.chest",    w: 36, h: 29, worldScale: 0.61, feet: 0.05 },
  "prop.torch":    { id: "prop.torch",    w: 12, h: 39, worldScale: 0.58, feet: 0.03 },
  "prop.bones":    { id: "prop.bones",    w: 34, h: 22, worldScale: 0.47, feet: 0.06 },
  "prop.mushroom": { id: "prop.mushroom", w: 30, h: 28, worldScale: 0.44, feet: 0.06 },
  "prop.crystal":  { id: "prop.crystal",  w: 24, h: 36, worldScale: 0.44, feet: 0.05 },
  "prop.rock":     { id: "prop.rock",     w: 35, h: 26, worldScale: 0.46, feet: 0.06 },

  // --- item / drop icons (§12) --- drawn through pickupSprite at `worldScale` (fixed
  // 1.4 before). Legacy icon grids ~8–12 wide. In UI they flow through pixelImageFit,
  // which normalises by width, so worldScale here is only the in-world drop size.
  "icon.coin":     { id: "icon.coin",     w: 26, h: 26, worldScale: 0.50, feet: 0.15 },
  "icon.key":      { id: "icon.key",      w: 12, h: 28, worldScale: 0.55, feet: 0.15 },
  "icon.potion":   { id: "icon.potion",   w: 18, h: 23, worldScale: 0.66, feet: 0.12 },
  "icon.gem":      { id: "icon.gem",      w: 20, h: 19, worldScale: 0.60, feet: 0.15 },
  "icon.capsule":  { id: "icon.capsule",  w: 25, h: 22, worldScale: 0.66, feet: 0.15 },
  "icon.armor":    { id: "icon.armor",    w: 22, h: 28, worldScale: 0.72, feet: 0.12 },
  "icon.shield":   { id: "icon.shield",   w: 30, h: 30, worldScale: 0.48, feet: 0.12 },
  "icon.ring":     { id: "icon.ring",     w: 20, h: 20, worldScale: 0.55, feet: 0.15 },
  "icon.gloves":   { id: "icon.gloves",   w: 20, h: 26, worldScale: 0.66, feet: 0.12 },
  "icon.necklace": { id: "icon.necklace", w: 28, h: 29, worldScale: 0.50, feet: 0.12 },
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
  hero: "hero.legend-base",
  grunt: "reliquary.monster.rot-imp",
  archer: "reliquary.monster.bone-archer",
  brute: "reliquary.monster.iron-brute",
  caster: "reliquary.monster.cult-caster",
  swarmer: "reliquary.monster.rot-scuttler",
  boss: "boss.warden",
  bossChoir: "boss.corrupted-saint",
  bossColossus: "boss.gravebound-colossus",
  bossHerald: "boss.herald-unspoken",
  bossNameless: "boss.nameless",
  torch: "prop.torch",
  bones: "prop.bones",
  mushroom: "prop.mushroom",
  crystal: "prop.crystal",
  rock: "prop.rock",
  chest: "prop.chest",
  coin: "icon.coin",
  key: "icon.key",
  potion: "icon.potion",
  gem: "icon.gem",
  capsule: "icon.capsule",
  armor: "icon.armor",
  shield: "icon.shield",
  ring: "icon.ring",
  gloves: "icon.gloves",
  necklace: "icon.necklace",
};

// --- scenes -------------------------------------------------------------

/**
 * A full baked backdrop — the hub deck, and (later) per-realm establishing art. Unlike
 * an {@link AtlasSprite} it has no world footprint: it is drawn stretched to fill a
 * fixed viewport (the hub) or as a scrolling parallax, so it carries only its size.
 */
export interface AtlasScene {
  readonly id: string;
  readonly w: number;
  readonly h: number;
}

export const SCENES: Record<string, AtlasScene> = {
  // §4 The Citadel of the Threshold — the hub deck. Drawn scaled to HUB_WIDTH×HUB_HEIGHT
  // (640×460, same 1.39 aspect) under the stations. Replaces the old black void + grid.
  "hub.citadel-deck": { id: "hub.citadel-deck", w: 384, h: 276 },
};

// --- weapons -------------------------------------------------------------

/**
 * A pipeline-authored world weapon sprite. Like {@link AtlasSprite} but carries the
 * **grip** (the authored pixel that sits in the character's hand — `render/draw.ts`
 * rotates the sprite about this point along the swing) instead of a feet offset.
 *
 * Legacy weapon grids ride the global `WEAPON_SCALE` (1.5) in `render/draw.ts`; an atlas
 * weapon is authored much larger, so `worldScale` here replaces that constant for it —
 * tuned so the drawn weapon spans the same world reach its predecessor grid did (an axe
 * bit wider than a torso, a spear out-reaching a sword — §13).
 */
export interface AtlasWeapon {
  readonly id: string;
  readonly w: number;
  readonly h: number;
  readonly worldScale: number;
  /** Grip pixel in authored (art) coordinates — sits in the hand. */
  readonly gripX: number;
  readonly gripY: number;
}

/**
 * Every pipeline weapon, keyed by `WeaponFamily` (`render/sprites.ts` reads this to
 * override the greyscale procedural grid). Authored pointing **+x**. Rarity colour and
 * cosmetic weapon skins are not baked in — `weaponSprite` tints the loaded PNG toward
 * the rarity colour at draw time, and a cosmetic skin still falls back to the procedural
 * grid until skins get their own pass.
 */
export const ATLAS_WEAPONS: Record<string, AtlasWeapon> = {
  // Target world reach ≈ predecessor grid width × WEAPON_SCALE (1.5):
  //   sword 19→28 · axe 16→24 · spear 24→36 · daggers 14→21 · staff 19→28 · talisman 13→20
  sword:    { id: "weapon.sword",    w: 69,  h: 15, worldScale: 0.41, gripX: 9,  gripY: 7 },
  axe:      { id: "weapon.axe",      w: 67,  h: 19, worldScale: 0.36, gripX: 9,  gripY: 13 },
  spear:    { id: "weapon.spear",    w: 118, h: 7,  worldScale: 0.31, gripX: 36, gripY: 3 },
  daggers:  { id: "weapon.daggers",  w: 44,  h: 11, worldScale: 0.47, gripX: 7,  gripY: 5 },
  staff:    { id: "weapon.staff",    w: 86,  h: 8,  worldScale: 0.33, gripX: 7,  gripY: 4 },
  talisman: { id: "weapon.talisman", w: 20,  h: 36, worldScale: 0.55, gripX: 10, gripY: 9 },

  // The other eight families (data/weapons.ts). Same methodology — target world reach
  // ≈ predecessor grid width × WEAPON_SCALE (1.5): hammer 26 · scythe 32 · rapier 36 ·
  // whip 44 · bow held (~22) · claws 29 · chakram 18 · fists 14. bow/chakram scale by
  // the axis that carries the shape (bow height, chakram width).
  hammer:   { id: "weapon.hammer",   w: 71,  h: 25, worldScale: 0.37, gripX: 5,  gripY: 12 },
  scythe:   { id: "weapon.scythe",   w: 73,  h: 38, worldScale: 0.44, gripX: 5,  gripY: 16 },
  rapier:   { id: "weapon.rapier",   w: 78,  h: 14, worldScale: 0.46, gripX: 5,  gripY: 7 },
  whip:     { id: "weapon.whip",     w: 124, h: 13, worldScale: 0.36, gripX: 4,  gripY: 6 },
  bow:      { id: "weapon.bow",      w: 14,  h: 61, worldScale: 0.36, gripX: 8,  gripY: 30 },
  claws:    { id: "weapon.claws",    w: 45,  h: 36, worldScale: 0.64, gripX: 7,  gripY: 28 },
  chakram:  { id: "weapon.chakram",  w: 40,  h: 42, worldScale: 0.45, gripX: 19, gripY: 20 },
  fists:    { id: "weapon.fists",    w: 33,  h: 38, worldScale: 0.42, gripX: 8,  gripY: 25 },
};
