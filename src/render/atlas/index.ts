/**
 * Loads the pipeline PNGs described by `manifest.ts` into canvases. Browser-only — this
 * is the half that needs a `document`. The manifest next door is pure.
 *
 * Vite turns the `import.meta.glob` below into a map of hashed asset URLs at build time,
 * and serves them straight in dev, so nothing here changes between the two.
 */

import { ATLAS, ATLAS_WEAPONS, SCENES } from "./manifest";

const pngUrls = import.meta.glob("./**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** PNG basename (no extension, no folder) → served URL. */
const urlById: Record<string, string> = {};
for (const [path, url] of Object.entries(pngUrls)) {
  const id = path.slice(path.lastIndexOf("/") + 1, -".png".length);
  urlById[id] = url;
}

const canvases = new Map<string, HTMLCanvasElement>();

function toCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/**
 * Decodes every atlas sprite into a canvas. Rejects loudly if a PNG is missing or its
 * real size disagrees with the manifest — a silent size drift would put every hitbox in
 * that sprite's world footprint slightly wrong.
 */
export async function loadAtlas(): Promise<void> {
  const entries = [
    ...Object.values(ATLAS), ...Object.values(ATLAS_WEAPONS), ...Object.values(SCENES),
  ];
  await Promise.all(
    entries.map(
      (spr) =>
        new Promise<void>((resolve, reject) => {
          const url = urlById[spr.id];
          if (!url) {
            reject(new Error(`atlas: no PNG for "${spr.id}" under src/render/atlas/`));
            return;
          }
          const img = new Image();
          img.onload = () => {
            if (img.naturalWidth !== spr.w || img.naturalHeight !== spr.h) {
              reject(new Error(
                `atlas: "${spr.id}" is ${img.naturalWidth}x${img.naturalHeight}, `
                + `manifest says ${spr.w}x${spr.h}`,
              ));
              return;
            }
            canvases.set(spr.id, toCanvas(img));
            resolve();
          };
          img.onerror = () => reject(new Error(`atlas: failed to load "${spr.id}"`));
          img.src = url;
        }),
    ),
  );
}

/** The loaded canvas for an atlas id, or null if it isn't loaded (yet, or at all). */
export function atlasCanvas(id: string): HTMLCanvasElement | null {
  return canvases.get(id) ?? null;
}
