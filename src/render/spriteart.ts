/**
 * **Which rung of the art ladder a sprite is on — decided once, for everything.**
 *
 * Pure and DOM-free, like `render/pixels.ts`, `render/itemart.ts` and `render/anim.ts`
 * next to it, so `npm run anim` can check the rule below headlessly. `render/sprites.ts`
 * is the half that owns canvases and hands this the one fact it can't know: whether a
 * PNG has actually loaded.
 *
 * ## The rule, and why it is a module rather than a convention
 *
 * A sprite's **picture** and its **world scale** are two halves of one decision and must
 * never be taken separately. They used to be: `spriteAt` fell back to the procedural
 * grid when a PNG wasn't loaded, while `spriteWorldScale` read `ATLAS[id].worldScale`
 * with no load check at all. A caller that took one from each — `drawEnemy` did — drew a
 * ~26px procedural boss at a scale tuned for 75px art, about a third of the right size,
 * in the old low-detail style, with no frames.
 *
 * That was latent for as long as every boss PNG was ~4.6 KB. Animating three of them took
 * their strips to ~40 KB and a manifest-vs-loader size bug (see `atlas/index.ts`) stopped
 * them loading at all, at which point a hazard nobody could see became the first thing
 * the owner saw.
 *
 * So the fix is not a load check bolted onto the scale getter — it is that **there is no
 * scale getter**. {@link chooseSpriteArt} returns `atlasId`, `meta`, `worldScale` and
 * `feet` from one branch, and `worldScale` is non-null *exactly* when `atlasId` is, which
 * is *exactly* when the canvas will come from the atlas. Pairing an atlas scale with a
 * procedural canvas is no longer something a caller can express.
 *
 * `npm run anim` asserts that biconditional against a hostile load predicate, because a
 * property this quiet is the kind that comes back the next time a PNG grows.
 */

import { ATLAS, type AtlasSprite, MONSTER_SETS, SPRITE_OVERRIDES } from "./atlas/manifest";

/**
 * One resolved sprite: the atlas row backing it, or the procedural bake.
 *
 * The invariant, which is the whole point of the type: `atlasId`, `meta`, `worldScale`
 * and `feet` are either **all** present (a loaded PNG) or **all** absent (the procedural
 * grid, which rides the caller's own legacy constant). There is no middle state.
 */
export interface SpriteArt {
  /** The procedural bake this resolves to when no PNG backs it — the identity, always set. */
  readonly name: string;
  /** The loaded atlas id, or null when this sprite is drawing its procedural bake. */
  readonly atlasId: string | null;
  /** The manifest row — animation table included — or undefined when procedural. */
  readonly meta: AtlasSprite | undefined;
  /** World units per art pixel, or null when procedural (the caller's constant applies). */
  readonly worldScale: number | null;
  /** Fraction of the art's height below the feet anchor, or null when procedural. */
  readonly feet: number | null;
}

/**
 * The art a sprite draws right now, given what has actually loaded.
 *
 * The ladder, in order, and every rung is a *fallback* rather than an error — the idiom
 * `MONSTER_SETS`, `TILESETS` and `render/anim.ts` all already follow:
 *
 *  1. the realm's own set entry for this archetype (`BiomeStyle.monsterSet`),
 *  2. the game-wide `SPRITE_OVERRIDES` default,
 *  3. the procedural bake.
 *
 * A rung is only taken if the id is in `ATLAS` **and** `loaded` says its PNG is really
 * decoded — a manifest row is a statement of intent and a loaded canvas is a fact.
 *
 * Passing no `set` is the game-wide default, which is what a boss and every non-monster
 * sprite want: a boss is an authored encounter with its own sprite, not an archetype
 * wearing a local face.
 */
export function chooseSpriteArt(
  name: string, set: string | undefined, loaded: (id: string) => boolean,
): SpriteArt {
  const fromSet = set ? MONSTER_SETS[set]?.[name] : undefined;
  for (const id of [fromSet, SPRITE_OVERRIDES[name]]) {
    if (!id) continue;
    const meta = ATLAS[id];
    if (!meta || !loaded(id)) continue;
    return { name, atlasId: id, meta, worldScale: meta.worldScale, feet: meta.feet };
  }
  // The end of the ladder: no PNG, so no atlas scale and no atlas frames. The caller's
  // own legacy constant applies, which is exactly what it applied before any of this.
  return { name, atlasId: null, meta: undefined, worldScale: null, feet: null };
}
