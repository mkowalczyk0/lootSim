/**
 * Which picture an item gets — the *decision*, separated from the canvas that executes it.
 *
 * UAT §11's critical requirement is that **the same item should visually appear to be the
 * same item everywhere**: the stash card, the chest reel, the loot banner, the Hero
 * paper-doll and the thing lying on the dungeon floor. That was previously true by
 * everyone remembering to call the same helper, and it had already quietly stopped being
 * true — `pickupSprite` in `draw.ts` carried its own copy of the resolution and washed a
 * non-weapon icon at 0.4 where this side washed it at 0.5.
 *
 * So the choice lives here, alone, and `render/sprites.ts` is the only thing that turns it
 * into pixels. This file is the same exception `render/pixels.ts` is and for the same
 * stated reason: it is inside `render/` but has **no DOM in it**, because the art has to
 * be testable from Node. `tools/itemart.ts` asserts the property directly — every surface
 * asking about one item gets one answer — which is not something a canvas-owning module
 * could be asked in a headless test.
 *
 * Pure. No canvas, no atlas, no `GameState`.
 */

import type { ItemType } from "../data/items";
import { isWeaponType } from "../data/items";
import type { Rarity } from "../data/rarity";
import type { WeaponFamily } from "../data/weapons";

/**
 * How strongly a rarity colour is washed over a shared type icon. One number, because
 * there used to be two — see the file header. 0.5 is the survivor: the spec names the
 * chest-opening image as the reference the stash has to match, and both of those already
 * went through this value.
 */
export const RARITY_WASH = 0.5;

/** The sprite an item with no icon of its own falls back to. */
export const ITEM_FALLBACK_SPRITE = "capsule";

/** What to draw, once. Every branch is a fallback for the one above it. */
export type ItemArtChoice =
  /** The item's own authored art: a manifest row whose PNG is loaded. */
  | { readonly kind: "atlas"; readonly id: string }
  /** A weapon's real family sprite, in its rarity's palette. */
  | { readonly kind: "weapon"; readonly family: WeaponFamily; readonly rarity: Rarity }
  /** A shared type icon (or the capsule), washed toward the rarity colour. */
  | { readonly kind: "icon"; readonly sprite: string; readonly rarity: Rarity; readonly wash: number };

/**
 * What the renderer can actually supply right now.
 *
 * Passed in rather than imported so this stays DOM-free: `sprites.ts` answers both from
 * the live atlas, and a test answers them from whatever it wants to pretend exists. It is
 * also what makes the graceful-degradation rule checkable — "an unauthored art id, or one
 * whose PNG failed to load, must fall through rather than break a screen" is just
 * `hasAtlas` returning false.
 */
export interface ArtAvailability {
  /** True when this atlas id has a row *and* its image is loaded and drawable. */
  hasAtlas(id: string): boolean;
  /** True when the baked sprite atlas has something under this name. */
  hasSprite(name: string): boolean;
}

/**
 * The one decision. Given an item's type, rarity and (optional) authored art id, say what
 * to draw.
 *
 * Deliberately takes the three fields rather than an `Item`, so the chest reel — which
 * shows a type and a rarity before any specific item exists — asks the identical question
 * and cannot answer it differently.
 */
export function chooseItemArt(
  type: ItemType, rarity: Rarity, art: string | null, has: ArtAvailability,
): ItemArtChoice {
  if (art && has.hasAtlas(art)) return { kind: "atlas", id: art };
  if (isWeaponType(type)) return { kind: "weapon", family: type, rarity };
  const name = has.hasSprite(type) ? type : ITEM_FALLBACK_SPRITE;
  return { kind: "icon", sprite: name, rarity, wash: RARITY_WASH };
}
