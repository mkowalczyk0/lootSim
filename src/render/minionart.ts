/**
 * Which picture a summoned minion gets — the *decision*, pulled out of the canvas the
 * same way `render/itemart.ts` (item art) and `render/spriteart.ts` (monster/hero art)
 * already are. Pure, no DOM, no atlas import — testable from Node, which is what lets
 * `tools/summonart.ts` assert the ladder's scope without a browser.
 *
 * Docket §36: every class's summon draws as a flat, element-tinted triangle today
 * (`drawMinions` in `render/draw.ts`). This is the seam that lets an authored sprite land
 * per unit, one at a time, without anyone touching the renderer again.
 */

import type { ArtAvailability } from "./itemart";

/**
 * The six units that are a copy of the summoning hero rather than a creature of their
 * own (a Trickster decoy, a Magician's mirror image, ...) — confirmed against
 * `src/progression/*.ts` rather than guessed, since "decoy" and "mirror" read like they
 * could be anything. These draw the owner's own composed sprite (`heroSprite`, the full
 * back→body→hair→face→ears→hat stack with their cosmetics) and never fall through to an
 * authored unit sprite or the triangle — it isn't a missing-art fallback, it's the
 * mechanic: a Trickster decoy that doesn't look like the Trickster is wrong.
 */
export const PLAYER_COPY_UNITS: ReadonlySet<string> = new Set([
  "mirror_image", "monk_afterimage",
  "trickster_decoy", "trickster_mirror", "trickster_mirror_self", "trickster_lure",
]);

/** What to draw for one minion. Every branch is a fallback for the one above it. */
export type MinionArtChoice =
  /** The summoning hero's own composed sprite — the player-copy family, unconditional. */
  | { readonly kind: "hero" }
  /** The unit's own authored sprite: a manifest row whose PNG is loaded. */
  | { readonly kind: "atlas"; readonly id: string }
  /** Today's flat, element-tinted arrowhead — always available, never removed. */
  | { readonly kind: "triangle" };

/**
 * The one decision. `unitArt` is `SUMMON_UNIT_ART[unit] ?? null` (passed in, not imported,
 * for the same DOM-free reason `chooseItemArt` takes `art` rather than reading `ATLAS`
 * itself) — a manifest lookup the caller already had to do to know whether to ask.
 */
export function chooseMinionArt(unit: string, unitArt: string | null, has: ArtAvailability): MinionArtChoice {
  if (PLAYER_COPY_UNITS.has(unit)) return { kind: "hero" };
  if (unitArt && has.hasAtlas(unitArt)) return { kind: "atlas", id: unitArt };
  return { kind: "triangle" };
}
