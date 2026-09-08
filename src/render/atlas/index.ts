/**
 * Loads the pipeline PNGs described by `manifest.ts` into canvases. Browser-only — this
 * is the half that needs a `document`. The manifest next door is pure.
 *
 * Vite turns the `import.meta.glob` below into a map of hashed asset URLs at build time,
 * and serves them straight in dev, so nothing here changes between the two.
 */

import { ATLAS, ATLAS_WEAPONS, SCENES, TILESETS } from "./manifest";

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

function loadImage(id: string, w: number, h: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = urlById[id];
    if (!url) {
      reject(new Error(`atlas: no PNG for "${id}" under src/render/atlas/`));
      return;
    }
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth !== w || img.naturalHeight !== h) {
        reject(new Error(
          `atlas: "${id}" is ${img.naturalWidth}x${img.naturalHeight}, manifest says ${w}x${h}`,
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
  ];
  await Promise.all([
    ...sprites.map(async (spr) => {
      canvases.set(spr.id, await loadImage(spr.id, spr.w, spr.h));
    }),
    ...Object.values(TILESETS).map(async (ts) => {
      const layout = layoutById[ts.id];
      if (!layout) throw new Error(`atlas: no <id>.json for tileset "${ts.id}" — run npm run tileset`);
      if (layout.boxes.length !== 16) {
        throw new Error(`atlas: tileset "${ts.id}" has ${layout.boxes.length} tiles, expected 16`);
      }
      const canvas = await loadImage(ts.id, ts.w, ts.h);
      tilesets.set(ts.id, { canvas, tile: layout.tile, boxes: layout.boxes });
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
