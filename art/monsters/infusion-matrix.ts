/**
 * The full matrix behind smoke's "an infused monster stays at least 28 luminance apart from
 * its own sector's floor" — every elemental sector × every role, not the one line per sector
 * the gate prints. Run from the repo root:
 *
 *   npx esbuild art/monsters/infusion-matrix.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/infusion-matrix.mjs && \
 *     node node_modules/.cache/infusion-matrix.mjs
 *
 * It exists because the first fix brief for art-wave 2's red said "darken the mid-tones" and
 * the sign was wrong: all nine collisions were sprites sitting ABOVE the floor, so darkening
 * would have widened the red. The delta is printed signed for exactly that reason — a
 * positive delta means "brighten to fix", a negative one means "darken". Every number here
 * is computed the way `tools/smoke.ts` computes it (the same grade, the same 0.28 element
 * wash, the same alpha ≥ 128 cut); if the two ever disagree, smoke is right and this is stale.
 *
 * The last block prints each sprite's raw (unwashed) mean luminance, which is the number a
 * finishing script can actually move — the roster's shipped band is the reference for where
 * a new body should land (see `finish-delve.ts`'s header).
 */
import { existsSync, readFileSync } from "node:fs";
import { FLOOR_GRADE, gradeSheet, hexToRgb, luminance, tileLuminance } from "../../src/render/grade";
import { SPRITE_OVERRIDES, TILESETS, MONSTER_SETS } from "../../src/render/atlas/manifest";
import { BIOMES, type BiomeStyle } from "../../src/data/biomes";
import { PLANETS } from "../../src/data/planets";
import { TOWER_BIOMES } from "../../src/data/tower";
import { RAIDS } from "../../src/data/raids";
import { ELEMENT_COLORS } from "../../src/data/elements";
import { decodePng } from "../../tools/png";

const MIN_DELTA = 28; // smoke's bar
const ALL_BIOMES: BiomeStyle[] = [
  ...BIOMES, ...PLANETS.map((p) => p.biome), ...TOWER_BIOMES, ...RAIDS.map((r) => r.biome),
];
const spriteRaw = new Map<string, number>();
let collisions = 0;
for (const id of Object.keys(TILESETS)) {
  const owners = ALL_BIOMES.filter((b) => b.tileset === id && b.element && b.element !== "physical");
  if (owners.length === 0) continue;
  const dir = "src/render/atlas/tilesets";
  const png = decodePng(readFileSync(`${dir}/${id}.png`));
  const layout = JSON.parse(readFileSync(`${dir}/${id}.json`, "utf8")) as { tile: number; boxes: [number, number][] };
  for (const biome of owners) {
    const floorData = new Uint8Array(png.data);
    gradeSheet(floorData, png.width, png.height, layout.tile, layout.boxes, biome.tint, FLOOR_GRADE);
    const floorLum = tileLuminance(floorData, png.width, layout.tile, layout.boxes[0]!).mean;
    const [er, eg, eb] = hexToRgb(ELEMENT_COLORS[biome.element]);
    const set = biome.monsterSet ? MONSTER_SETS[biome.monsterSet] : undefined;
    if (!set) continue;
    for (const role of Object.keys(set)) {
      const named = set[role];
      const spriteId = (named && existsSync(`src/render/atlas/${named.startsWith("boss.") ? "bosses" : "monsters"}/${named}.png`))
        ? named : SPRITE_OVERRIDES[role];
      if (!spriteId) continue;
      const dirFor = spriteId.startsWith("boss.") ? "bosses" : "monsters";
      let mpng;
      try { mpng = decodePng(readFileSync(`src/render/atlas/${dirFor}/${spriteId}.png`)); } catch { continue; }
      let sum = 0, rawSum = 0, n = 0;
      for (let i = 0; i < mpng.width * mpng.height; i++) {
        const s = i * 4;
        if (mpng.data[s + 3]! < 128) continue;
        const r = mpng.data[s]! * 0.72 + er * 0.28, g = mpng.data[s + 1]! * 0.72 + eg * 0.28, b = mpng.data[s + 2]! * 0.72 + eb * 0.28;
        sum += luminance(r, g, b);
        rawSum += luminance(mpng.data[s]!, mpng.data[s + 1]!, mpng.data[s + 2]!);
        n++;
      }
      if (n === 0) continue;
      const m = sum / n, delta = m - floorLum;
      spriteRaw.set(spriteId, rawSum / n);
      const collides = Math.abs(delta) < MIN_DELTA;
      if (collides) collisions++;
      console.log(
        `${id.padEnd(26)} ${biome.name.padEnd(21)} ${biome.element.padEnd(9)} floor L${floorLum.toFixed(1).padStart(5)}`
        + `  ${role.padEnd(12)} ${spriteId.padEnd(34)} L${m.toFixed(1).padStart(5)}  delta ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`
        + (collides ? "  <-- COLLIDES" : ""),
      );
    }
  }
}
console.log(`\n${collisions} collisions under the ${MIN_DELTA} bar (smoke pins Ashen Wastes by owner ruling; see tools/smoke.ts)`);
console.log("\nraw (unwashed) mean luminance per sprite — the number a finishing script moves:");
for (const [k, v] of [...spriteRaw.entries()].sort()) console.log(`  ${k.padEnd(34)} ${v.toFixed(1)}`);
