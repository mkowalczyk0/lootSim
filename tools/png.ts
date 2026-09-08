/**
 * A minimal PNG decoder for the tools — enough to read the committed pipeline
 * sheets (8-bit RGB / RGBA, non-interlaced, the only shape PixelLab and the art
 * tools emit) into a flat RGBA byte array under Node with no dependency beyond
 * `node:zlib`. Exists so `tools/smoke.ts` can measure a tileset's real pixels
 * instead of trusting that a sheet which looked fine in a preview still reads at
 * game zoom.
 *
 * Deliberately not general: anything indexed, 16-bit or interlaced throws.
 */

import { inflateSync } from "node:zlib";

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  readonly data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(file: Uint8Array): DecodedPng {
  for (let i = 0; i < 8; i++) {
    if (file[i] !== SIGNATURE[i]) throw new Error("not a PNG");
  }
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let pos = 8;
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat: Uint8Array[] = [];
  while (pos < file.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(file[pos + 4]!, file[pos + 5]!, file[pos + 6]!, file[pos + 7]!);
    const body = file.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      depth = file[pos + 16]!;
      colorType = file[pos + 17]!;
      interlace = file[pos + 20]!;
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported colour type ${colorType} (need RGB or RGBA)`);
  if (interlace !== 0) throw new Error("interlaced PNGs are not supported");

  const bpp = colorType === 6 ? 4 : 3;
  const total = idat.reduce((n, c) => n + c.length, 0);
  const zipped = new Uint8Array(total);
  let off = 0;
  for (const c of idat) { zipped.set(c, off); off += c.length; }
  const raw = inflateSync(zipped);

  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++]!;
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++]!;
      const a = x >= bpp ? cur[x - bpp]! : 0;
      const b = prev[x]!;
      const c = x >= bpp ? prev[x - bpp]! : 0;
      let d: number;
      switch (filter) {
        case 0: d = v; break;
        case 1: d = v + a; break;
        case 2: d = v + b; break;
        case 3: d = v + ((a + b) >> 1); break;
        case 4: d = v + paeth(a, b, c); break;
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      cur[x] = d & 255;
    }
    for (let x = 0; x < width; x++) {
      const s = x * bpp, o = (y * width + x) * 4;
      out[o] = cur[s]!; out[o + 1] = cur[s + 1]!; out[o + 2] = cur[s + 2]!;
      out[o + 3] = bpp === 4 ? cur[s + 3]! : 255;
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}
