/**
 * The decoder half of `artsheet.ts`'s hand-rolled PNG encoder — for the same reason
 * the encoder is hand-rolled: pulling in an image library for a debug tool would be the
 * only runtime dependency in the project. Supports exactly what this repo's atlas PNGs
 * actually are (checked against every committed one): 8-bit depth, colour type 2 (RGB)
 * or 6 (RGBA), non-interlaced. That is not "a PNG decoder" in general — it throws on
 * anything else (16-bit, palette/grayscale, interlaced) rather than silently misreading it.
 */
import { inflateSync } from "node:zlib";

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** Straight (non-premultiplied) RGBA, row-major, 4 bytes per pixel. */
  readonly rgba: Uint8Array;
}

export function decodePng(buf: Buffer): DecodedPng {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG (bad signature)");

  let width = 0, height = 0, bitDepth = 0, colorType = -1;
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      if (bitDepth !== 8) throw new Error(`decodePng: unsupported bit depth ${bitDepth}`);
      if (colorType !== 2 && colorType !== 6) {
        throw new Error(`decodePng: unsupported color type ${colorType} (want RGB=2 or RGBA=6)`);
      }
      if (data[12] !== 0) throw new Error("decodePng: interlaced PNGs are not supported");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 8 + len + 4; // length + type + data + crc
  }
  if (colorType < 0) throw new Error("decodePng: no IHDR");

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let prevRow = new Uint8Array(stride);
  let rawOffset = 0;

  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset]!;
    rawOffset++;
    const row = raw.subarray(rawOffset, rawOffset + stride);
    rawOffset += stride;
    const curRow = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? curRow[x - channels]! : 0;
      const b = prevRow[x]!;
      const c = x >= channels ? prevRow[x - channels]! : 0;
      let value = row[x]!;
      switch (filterType) {
        case 0: break;
        case 1: value = (value + a) & 0xff; break;
        case 2: value = (value + b) & 0xff; break;
        case 3: value = (value + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          value = (value + pred) & 0xff;
          break;
        }
        default: throw new Error(`decodePng: unsupported filter type ${filterType}`);
      }
      curRow[x] = value;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      out[di] = curRow[si]!;
      out[di + 1] = curRow[si + 1]!;
      out[di + 2] = curRow[si + 2]!;
      out[di + 3] = channels === 4 ? curRow[si + 3]! : 255;
    }
    prevRow = curRow;
  }
  return { width, height, rgba: out };
}

/**
 * The exact per-pixel math `render/sprites.ts#tintedCanvas` produces on a canvas via
 * `globalCompositeOperation = "source-atop"` at `globalAlpha = strength`: every opaque
 * pixel's RGB moves toward `hex` by `strength`, alpha (and fully transparent pixels)
 * untouched. Reimplemented on a raw buffer so this tool can show the *real* rarity wash
 * — the thing that silently forked into two different constants once already (§11's
 * `RARITY_WASH` note) — without needing a DOM canvas.
 */
export function washPng(png: DecodedPng, hex: string, strength: number): DecodedPng {
  const n = parseInt(hex.slice(1), 16);
  const cr = (n >> 16) & 255, cg = (n >> 8) & 255, cb = n & 255;
  const rgba = new Uint8Array(png.rgba.length);
  for (let i = 0; i < png.rgba.length; i += 4) {
    const a = png.rgba[i + 3]!;
    if (a === 0) continue;
    rgba[i] = Math.round(cr * strength + png.rgba[i]! * (1 - strength));
    rgba[i + 1] = Math.round(cg * strength + png.rgba[i + 1]! * (1 - strength));
    rgba[i + 2] = Math.round(cb * strength + png.rgba[i + 2]! * (1 - strength));
    rgba[i + 3] = a;
  }
  return { width: png.width, height: png.height, rgba };
}
