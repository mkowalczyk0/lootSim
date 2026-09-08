/**
 * A baked sprite as a data URL, blown up by an integer factor with smoothing off. The
 * town is DOM, so this is how the pixel art gets into it without a second renderer.
 *
 * `toDataURL` is not free and the style screen redraws on every keypress, so anything
 * with a stable identity — a cosmetic icon, say — passes a `key` and is encoded once.
 * The character portrait deliberately doesn't: it changes with every press, which is
 * the point.
 */
import { portraitScale } from "./portrait";

const imageCache = new Map<string, string>();

/**
 * The integer scale {@link pixelImageFit} would use to fit a `srcWidth`x`srcHeight`
 * sprite inside a `targetWidth`x`targetHeight` box — pulled out as pure arithmetic (no
 * canvas, no DOM) so `tools/itemart.ts` can assert every atlas sprite fits its real UI
 * box without a browser.
 *
 * Fits **both** dimensions, not just width: a width-only fit (the original shape of this
 * function) sized purely off `srcWidth`, so a tall, narrow sprite — a staff icon, a bow
 * — blew up to the width's scale factor on both axes and came out far taller than its
 * box. The DOM then had to squash it back down by a second, non-integer factor to fit the
 * box's `max-height`, and `image-rendering: pixelated` nearest-neighbour-samples that
 * squash unevenly, so the sprite rendered as a mangled sliver rather than a smaller clean
 * copy of itself. Bounding on the *smaller* of the two ratios means the produced bitmap
 * never exceeds the box on either axis, so the DOM never has to downscale it at all.
 *
 * `targetHeight` defaults to `Infinity` (no vertical bound) for the one caller that fits
 * only a width — a weapon portrait with padding instead of a fixed box.
 */
export function fitScale(
  srcWidth: number, srcHeight: number, targetWidth: number, targetHeight = Infinity,
): number {
  return Math.max(1, Math.floor(Math.min(
    targetWidth / Math.max(1, srcWidth),
    targetHeight / Math.max(1, srcHeight),
  )));
}

/** Like {@link pixelImage} but scales to fit a target pixel box — see {@link fitScale}. */
export function pixelImageFit(
  src: HTMLCanvasElement, targetWidth: number, targetHeight = Infinity, key?: string,
): string {
  const scale = fitScale(src.width, src.height, targetWidth, targetHeight);
  const fitKey = Number.isFinite(targetHeight) ? `${targetWidth}x${targetHeight}` : `${targetWidth}`;
  return pixelImage(src, scale, key ? `${key}|fit${fitKey}` : undefined);
}

/**
 * Like {@link pixelImageFit} but sizes against the *subject* rather than the canvas — see
 * `./portrait` for why a hero has to be sized by its body and not by its canvas, and why
 * the boxes in `styles.css` pin a height instead of hugging the image.
 *
 * `bodyHeight` is in the canvas's own authored pixels — `HeroSprite.bodyHeight`.
 */
export function pixelImageBody(
  src: HTMLCanvasElement,
  bodyHeight: number,
  targetBodyPx: number,
  key?: string,
): string {
  const scale = portraitScale(bodyHeight, targetBodyPx);
  return pixelImage(src, scale, key ? `${key}|body${targetBodyPx}` : undefined);
}

export function pixelImage(src: HTMLCanvasElement, scale: number, key?: string): string {
  const id = key ? `${key}|${scale}` : null;
  if (id) {
    const hit = imageCache.get(id);
    if (hit) return hit;
  }
  const canvas = document.createElement("canvas");
  canvas.width = src.width * scale;
  canvas.height = src.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL();
  if (id) imageCache.set(id, url);
  return url;
}
