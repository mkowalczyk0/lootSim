// Raid arena contrast — a gap check the §17.7 gate never ran. `tools/smoke.ts`'s floor
// tileset contrast section walks BIOMES + PLANETS + TOWER_BIOMES only; the four raid
// biomes in `data/raids.ts` are not in that list, so their floor/wall separation (under
// their OWN tint, which a reused Delve tileset was never graded against) and their
// boss-vs-floor readability have never been measured. Not gated, not in npm test — same
// as reachability.ts, a one-off investigation script.
import { readFileSync, existsSync } from "fs";
import { decodePng } from "./png";
import { FLOOR_GRADE, gradeSheet, luminance, tileLuminance } from "../src/render/grade";
import { TILESETS, SPRITE_OVERRIDES, ATLAS } from "../src/render/atlas/manifest";
import { RAIDS, raidBossSpec } from "../src/data/raids";

function hexLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return luminance(r, g, b);
}

function bossMeanLuminance(atlasId: string): number | null {
  const dir = "src/render/atlas/bosses";
  const path = `${dir}/${atlasId}.png`;
  if (!existsSync(path)) return null;
  const png = decodePng(readFileSync(path));
  let sum = 0, n = 0;
  for (let i = 0; i < png.width * png.height; i++) {
    const s = i * 4;
    if (png.data[s + 3]! < 128) continue;
    sum += luminance(png.data[s]!, png.data[s + 1]!, png.data[s + 2]!);
    n++;
  }
  return n === 0 ? null : sum / n;
}

console.log("=== raid arena contrast — the gate §17.7 never applied to a raid biome ===\n");

for (const spec of RAIDS) {
  const biome = spec.biome;
  const tilesetId = biome.tileset;
  const overrideKey = raidBossSpec(spec).sprite;
  const atlasBossId = SPRITE_OVERRIDES[overrideKey] ?? overrideKey;
  const bossLum = bossMeanLuminance(atlasBossId);

  console.log(`--- ${spec.name} (${biome.name}, element ${spec.element}) ---`);
  console.log(`  boss sprite: ${atlasBossId} in ATLAS: ${!!ATLAS[atlasBossId]}  mean L: ${bossLum?.toFixed(1) ?? "MISSING"}`);

  if (!tilesetId) {
    const raw = hexLuminance(biome.tint);
    console.log(`  NO TILESET DECLARED — falls back to flat bakeFloor fill at raw tint L${raw.toFixed(1)} (over the L150 ceiling: ${raw > 150})`);
    if (bossLum !== null) console.log(`  boss vs raw floor separation: ${Math.abs(bossLum - raw).toFixed(1)}`);
    console.log();
    continue;
  }

  const spec2 = TILESETS[tilesetId];
  if (!spec2) {
    console.log(`  tileset id "${tilesetId}" named on the biome but NOT in TILESETS — would fail to load`);
    console.log();
    continue;
  }
  const dir = "src/render/atlas/tilesets";
  if (!existsSync(`${dir}/${tilesetId}.png`)) {
    console.log(`  tileset "${tilesetId}" declared in TILESETS but no PNG committed — falls back to flat bake`);
    console.log();
    continue;
  }
  const png = decodePng(readFileSync(`${dir}/${tilesetId}.png`));
  const layout = JSON.parse(readFileSync(`${dir}/${tilesetId}.json`, "utf8")) as { tile: number; boxes: [number, number][] };
  const data = new Uint8Array(png.data);
  // Graded under THIS raid's own tint, not whichever Delve biome originally owns the
  // sheet — the smoke gate only ever checked the latter.
  gradeSheet(data, png.width, png.height, layout.tile, layout.boxes, biome.tint, FLOOR_GRADE);
  const floor = tileLuminance(data, png.width, layout.tile, layout.boxes[0]!);
  const rock = tileLuminance(data, png.width, layout.tile, layout.boxes[15]!);
  const delta = Math.abs(floor.mean - rock.mean);
  console.log(`  tileset "${tilesetId}" (reused), graded under this raid's own tint ${biome.tint}:`);
  console.log(`    floor L${floor.mean.toFixed(1)}±${floor.spread.toFixed(1)}   wall L${rock.mean.toFixed(1)}±${rock.spread.toFixed(1)}   delta ${delta.toFixed(1)} (gate: >=28)`);
  console.log(`    brightest ${Math.max(floor.mean, rock.mean).toFixed(1)} (gate: <=150)`);
  if (bossLum !== null) {
    console.log(`    boss vs floor separation: ${Math.abs(bossLum - floor.mean).toFixed(1)}   boss vs wall separation: ${Math.abs(bossLum - rock.mean).toFixed(1)}`);
  }
  console.log();
}
