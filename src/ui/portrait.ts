/**
 * How big the character stands in the town's two big portraits, and nothing about how it
 * gets drawn — pure and DOM-free so the smoke test can check the sizing policy without a
 * canvas. `pixelImageBody` is the half that owns pixels.
 *
 * The problem this exists to solve: `heroSprite` hands back one of two quite different
 * canvases depending on whether every cosmetic a character wears has migrated to the art
 * pipeline (all-or-nothing, so a wardrobe never mixes two art styles on one body). The
 * procedural stack is a 30x26 field holding a 22-row body; the pipeline is a 56x68 stage
 * holding a 48-row hero. Same character, 2.2x the resolution and a different aspect ratio.
 *
 * So scaling the *canvas* — by a flat factor, or fitted to a target width — makes a
 * character visibly change size the moment a hat flips it onto the other composer. Scaling
 * the *body* is what holds it still, and that's all this module does.
 */

/**
 * The body heights the two portraits aim for, in screen pixels. These are what the old
 * flat scales already produced (22 authored rows at x8 and x7), so a character still on
 * the procedural stack renders at exactly the size it always did — this change is only
 * ever allowed to move the *pipeline* case toward it, never the other way.
 */
export const HERO_PORTRAIT_BODY_PX = 176;
export const STYLE_PORTRAIT_BODY_PX = 154;

/**
 * The integer factor to draw a hero canvas at so its body lands as near `targetBodyPx` as
 * a whole number gets. Integer is deliberate and not a rounding convenience: the portrait
 * is drawn with smoothing off, so a fractional factor renders pixels of visibly uneven
 * size — the one thing pixel art cannot hide.
 *
 * The cost of that is a small mismatch between the two composers, since 176 and 154 are
 * not multiples of both 22 and 48. It comes out at +9% on the Hero tab and -6% on the
 * Style tab, which `portraitSpread` states and the smoke test bounds.
 */
export function portraitScale(bodyHeight: number, targetBodyPx: number): number {
  return Math.max(1, Math.round(targetBodyPx / Math.max(1, bodyHeight)));
}

/**
 * How far apart the two composers land, as a fraction, for a given target — the number
 * that says whether putting on a migrated hat is a size change anyone would notice.
 */
export function portraitSpread(bodyA: number, bodyB: number, targetBodyPx: number): number {
  const a = bodyA * portraitScale(bodyA, targetBodyPx);
  const b = bodyB * portraitScale(bodyB, targetBodyPx);
  return Math.abs(a - b) / Math.max(a, b);
}
