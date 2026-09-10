/**
 * Loads the pipeline PNGs described by `manifest.ts` into canvases. Browser-only — this
 * is the half that needs a `document`. The manifest next door is pure.
 *
 * Vite turns the `import.meta.glob` below into a map of hashed asset URLs at build time,
 * and serves them straight in dev, so nothing here changes between the two.
 */

import { ATLAS, ATLAS_COSMETICS, ATLAS_WEAPONS, SCENES, TILESETS, type AtlasAnim } from "./manifest";
import { fitsManifest, stripWidth } from "../anim";

const pngUrls = import.meta.glob("./**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** Tileset sheet layouts (`<id>.json` from `npm run tileset`), parsed at build time. */
const tilesetJson = import.meta.glob("./tilesets/*.json", {
  eager: true,
  import: "default",
}) as Record<string, { id: string; tile: number; boxes: [number, number][] }>;

/** PNG basename (no extension, no folder) → served URL. */
const urlById: Record<string, string> = {};
for (const [path, url] of Object.entries(pngUrls)) {
  const id = path.slice(path.lastIndexOf("/") + 1, -".png".length);
  urlById[id] = url;
}

const layoutById: Record<string, { tile: number; boxes: [number, number][] }> = {};
for (const entry of Object.values(tilesetJson)) {
  layoutById[entry.id] = { tile: entry.tile, boxes: entry.boxes };
}

const canvases = new Map<string, HTMLCanvasElement>();

/** A loaded tileset: the sheet canvas plus its corner-mask → sheet-position lookup. */
export interface LoadedTileset {
  readonly canvas: HTMLCanvasElement;
  readonly tile: number;
  /** `boxes[mask]` = `[x, y]` of that corner combination's tile in the sheet. */
  readonly boxes: readonly (readonly [number, number])[];
}

const tilesets = new Map<string, LoadedTileset>();

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
 * Decodes one manifest row's PNG, refusing anything that isn't the size the row describes.
 *
 * The size test is `fitsManifest` in `render/anim.ts` and **must stay** that call rather
 * than an inline comparison: the row's `w` is ONE FRAME for an animated sprite, so a
 * hand-rolled `naturalWidth !== w` here rejects every strip — which is exactly what it did,
 * silently dropping three raid bosses to their procedural stand-ins while `npm run anim`,
 * which measured the same files against the real contract, stayed green.
 */
function loadImage(
  meta: { readonly id: string; readonly w: number; readonly h: number; readonly anim?: AtlasAnim },
): Promise<HTMLCanvasElement> {
  const id = meta.id;
  return new Promise((resolve, reject) => {
    const url = urlById[id];
    if (!url) {
      reject(new Error(`atlas: no PNG for "${id}" under src/render/atlas/`));
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (!fitsManifest(meta, img.naturalWidth, img.naturalHeight)) {
        reject(new Error(
          `atlas: "${id}" is ${img.naturalWidth}x${img.naturalHeight}, `
          + `manifest says ${stripWidth(meta)}x${meta.h}`,
        ));
        return;
      }
      resolve(toCanvas(img));
    };
    img.onerror = () => reject(new Error(`atlas: failed to load "${id}"`));
    img.src = url;
  });
}

/**
 * Decodes every atlas sprite into a canvas. Rejects loudly if a PNG is missing or its
 * real size disagrees with the manifest — a silent size drift would put every hitbox in
 * that sprite's world footprint slightly wrong.
 */
export async function loadAtlas(): Promise<void> {
  const sprites = [
    ...Object.values(ATLAS), ...Object.values(ATLAS_WEAPONS), ...Object.values(SCENES),
    ...Object.values(ATLAS_COSMETICS),
  ];
  await Promise.all([
    ...sprites.map(async (spr) => {
      canvases.set(spr.id, await loadImage(spr));
    }),
    // Tilesets degrade rather than throw: a biome that names one we can't load
    // (PNG or `<id>.json` missing, or the sheet the wrong size) just falls back
    // to `bakeFloor`. A malformed committed sheet is still worth a console shout.
    ...Object.values(TILESETS).map(async (ts) => {
      try {
        const layout = layoutById[ts.id];
        if (!layout) throw new Error(`no <id>.json — run npm run tileset`);
        if (layout.boxes.length !== 16) throw new Error(`${layout.boxes.length} tiles, expected 16`);
        const canvas = await loadImage(ts);
        tilesets.set(ts.id, { canvas, tile: layout.tile, boxes: layout.boxes });
      } catch (err) {
        console.warn(`atlas: tileset "${ts.id}" not loaded — ${(err as Error).message}`);
      }
    }),
  ]);
}

/** The loaded canvas for an atlas id, or null if it isn't loaded (yet, or at all). */
export function atlasCanvas(id: string): HTMLCanvasElement | null {
  return canvases.get(id) ?? null;
}

/** The loaded tileset for an id, or null if it isn't listed or hasn't loaded. */
export function atlasTileset(id: string): LoadedTileset | null {
  return tilesets.get(id) ?? null;
}
