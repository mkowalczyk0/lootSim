/**
 * Turns a raw generated weapon-skin PNG into the committed sprite plus its
 * `ATLAS_WEAPON_SKINS` row:
 *
 *   npx esbuild art/weaponskins/author.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/skinauthor.mjs && \
 *     node node_modules/.cache/skinauthor.mjs <raw.png> <family> <skin.id> [outDir]
 *
 * ## The reach rule is enforced here rather than promised
 *
 * `data/cosmetics.ts` says a cosmetic may never change what the player believes a
 * simulation value is, and the first way a weapon skin could break that is by being drawn
 * longer or shorter than the weapon it stands in for. A weapon's `reach` and `arc` belong
 * to its **family**, and every family's `worldScale` was tuned so the drawn weapon spans
 * roughly the reach its hitbox has.
 *
 * So `worldScale` is not a judgement call here: it is **derived** so the skin spans exactly
 * the world length its family's own art spans.
 *
 *     worldScale = (family.w * family.worldScale) / trimmedWidth
 *
 * A skin authored twice as wide gets half the scale and occupies the same world span. The
 * picture can be anything; the reach it advertises cannot.
 *
 * **This is deliberately a rule that cannot be violated rather than a check that notices
 * when it was.** `worldScale` is not an input here, so there is no way to author a skin
 * that lies about reach — not a wrong one that a gate later catches, but no way to express
 * one at all. That distinction is worth naming because this codebase spent a day finding
 * checks that measured nothing: a stage that widened to fit whatever it was handed, a loop
 * that iterated over an empty set, a pin comparing new art against a deleted sprite. Every
 * one of those was a check that could pass while the thing it named was false. A derived
 * number has no such failure mode.
 *
 * ## Briefing one of these: give the contradictory qualities to different PARTS
 *
 * The Abyssal Scythe had to be two things the worldbuilding demands together and which
 * fight each other in one object: the Abyss is **unmaking** (`docs/game_story_worldbuilding.md`
 * — "It is unmaking. It erases distinctions"), so the weapon should look like it is being
 * erased; and a skin replaces the rarity wash, so it has to carry its own presence or an
 * authored skin reads as a downgrade from an ordinary weapon.
 *
 * Asking the whole object for both produced a clean split down the middle: the candidates
 * that read as unmaking were pale and thin, and the one with presence read as a purple
 * crystal rather than a scythe. Assigning them to different parts — **presence in the haft
 * and collar, absence only at the blade's cutting edge** — came back sixteen for sixteen.
 *
 * Expect a version of this for each of the other thirteen, and the answer is the same:
 * split the contradiction across the object instead of averaging it over the whole thing.
 *
 * ## The grip
 *
 * Carried over from the family as a *fraction* of the art, so a differently-proportioned
 * weapon still pivots at the equivalent point on its haft, and printed so it can be
 * corrected by eye — a scythe and a sword do not hold the same way, and this is a starting
 * point rather than an answer. `render/draw.ts` rotates the sprite about this pixel.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { decodePng } from "../../tools/png";
import { ATLAS_WEAPONS } from "../../src/render/atlas/manifest";

const [rawPath, family, skinId, outDir = "src/render/atlas/weapons"] = process.argv.slice(2);
if (!rawPath || !family || !skinId) {
  console.error("usage: <raw.png> <family> <skin.id> [outDir]");
  process.exit(1);
}
const fam = ATLAS_WEAPONS[family!];
if (!fam) { console.error(`unknown weapon family: ${family}`); process.exit(1); }

const src = decodePng(readFileSync(rawPath!));
const d = new Uint8Array(src.data);

// --- trim to the content box; the sprite is authored pointing +x ---
let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
  if (d[(y * src.width + x) * 4 + 3]! > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}
if (x1 < 0) { console.error("the raw png is entirely transparent"); process.exit(1); }
const w = x1 - x0 + 1, h = y1 - y0 + 1;
const out = new Uint8Array(w * h * 4);
for (let y = 0; y < h; y++) {
  out.set(d.subarray(((y + y0) * src.width + x0) * 4, ((y + y0) * src.width + x0 + w) * 4), y * w * 4);
}

// --- the derived scale: the same world span the family's own art has ---
const familySpan = fam.w * fam.worldScale;
const worldScale = Number((familySpan / w).toFixed(4));
// --- the grip, carried across as a fraction of the art ---
const gripX = Math.round((fam.gripX / fam.w) * w);
const gripY = Math.round((fam.gripY / fam.h) * h);

let T: number[] | null = null;
function crc32(b: Buffer): number {
  if (!T) { T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T.push(c >>> 0); } }
  let c = 0xffffffff; for (const b2 of b) c = T[(c ^ b2) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const raw = Buffer.alloc(h * (w * 4 + 1));
for (let y = 0; y < h; y++) {
  raw[y * (w * 4 + 1)] = 0;
  Buffer.from(out.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
// `skinAbyssalScythe` -> `weapon.skin.abyssal-scythe`. The family is not appended: a skin
// IS one family's weapon, so its own name already says which, and `weapon.skin.x-scythe`
// for a skin called AbyssalScythe read as `abyssscythe-scythe`.
const id = `weapon.skin.${skinId!.replace(/^skin/, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
writeFileSync(`${outDir}/${id}.png`,
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));

console.log(`wrote ${outDir}/${id}.png  (${src.width}x${src.height} raw -> ${w}x${h} trimmed)`);
console.log(`\n  ${skinId}: {`);
console.log(`    id: "${id}", w: ${w}, h: ${h}, worldScale: ${worldScale},`);
console.log(`    gripX: ${gripX}, gripY: ${gripY}, family: "${family}",`);
console.log(`  },`);
console.log(`\nreach check: family ${family} spans ${familySpan.toFixed(1)} world units ` +
  `(${fam.w}px x ${fam.worldScale}); this skin spans ${(w * worldScale).toFixed(1)} ` +
  `(${w}px x ${worldScale}).`);
console.log(`grip carried from the family as a fraction (${(fam.gripX / fam.w).toFixed(3)}, ` +
  `${(fam.gripY / fam.h).toFixed(3)}) — eyeball it in the game and adjust.`);
