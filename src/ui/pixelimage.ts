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
 * Like {@link pixelImage} but scales to a target pixel width rather than by a fixed
 * factor — so a 12px procedural icon and a 69px pipeline sprite come out the same size
 * in the same slot. Integer factor, never below 1.
 */
export function pixelImageFit(src: HTMLCanvasElement, targetWidth: number, key?: string): string {
  const scale = Math.max(1, Math.round(targetWidth / Math.max(1, src.width)));
  return pixelImage(src, scale, key ? `${key}|fit${targetWidth}` : undefined);
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
