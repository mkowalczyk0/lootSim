/**
 * Boss-versus-floor luminance contrast, for every boss in the game — the five Delve/Tower
 * floor bosses, the four raid encounters, and the five Tower bosses. §17.7 of the art
 * style guide gates floor-vs-wall contrast (`tools/smoke.ts`) and floor-vs-monster contrast
 * for the ordinary roster, but no instrument has ever compared a BOSS against the floor it
 * actually stands on — bosses are deliberately excluded from the `MONSTER_SETS`-based
 * checks, and nothing was ever built to cover them separately. That gap is why
 * `boss.warden` shipped reading at -2.2 luminance points from its own floor (functionally
 * invisible) for the whole life of the game without a single red check.
 *
 * This generalises `tools/raid-arena-contrast.ts` (lootsim-56, `investigate/raid-arena-
 * contrast`) rather than forking a fourth copy of the same job — this repo had already
 * forked "measure floor/subject luminance separation" three times before that one was
 * caught. Same `gradeSheet`/`tileLuminance` machinery `tools/smoke.ts` already uses, same
 * §17.7 delta bar. What's added: every boss instead of just the four raids, and the
 * elemental steady-state wash a non-physical boss actually wears most of a fight
 * (`spriteFrameTinted(art, frame, ELEMENT_COLORS[element], 0.28)`, `render/draw.ts`) — a
 * raw sprite-file luminance is the wrong number for any boss whose element isn't physical,
 * because the game never actually draws that raw sprite once combat starts. The wash blend
 * is linear per channel, so `luminance` (also linear) of the blended pixel is exactly
 * `strength * luminance(washColor) + (1 - strength) * luminance(origPixel)` — no need to
 * re-render, the same identity holds for the mean across every opaque pixel.
 *
 * Run: `npm run bossarena`.
 *
 * ## Not in `npm test` yet — the `tools/builds.ts` precedent, one named exit condition
 *
 * Of the fourteen bosses this walks, thirteen clear the bar (the Warden, the Herald of
 * the Unspoken and the Delve's own "That Which Has No Name" were fixed the same pass this
 * instrument was written, all three by the same PM ruling). The fourteenth, the Queen of
 * the Seventh Circle, reads at delta 26.1 — 1.9 short of 28. She is not being fixed on
 * that margin: 28 is borrowed wholesale from `tools/smoke.ts`'s floor-vs-wall and
 * floor-vs-infused-monster checks, a different subject with a different legibility
 * problem (a boss is enormous, carries its own health bar, and telegraphs; a monster does
 * none of those), and the five other passing Delve/raid bosses (excluding the Tower's
 * naturally-brighter cluster) sit at delta 46.8-60.8 — nowhere near 28, which argues 28 is
 * itself a floor rather than a boss-specific target, not that 26.1 is a near-miss of the
 * right number. A raid boss the owner has called a main attraction of the game does not
 * get redrawn to clear a threshold nobody has confirmed applies to bosses at all, on a
 * hypothesis ("the wash rescues her") this same instrument disproved.
 *
 * **Exit condition:** the owner's ruling on the Queen — fix her, or set a boss-specific
 * bar derived from the passing population above rather than the borrowed monster/wall
 * number. Whichever way that resolves, fold this into the `npm test` chain in the same
 * commit. Until then this is a diagnostic (`npm run bossarena`), not a gate — the
 * `tools/builds.ts` precedent CLAUDE.md already documents: red-and-excluded is honest,
 * green-by-lowering-the-bar-to-fit-today's-art is not.
 */
import { readFileSync, existsSync } from "node:fs";
import { decodePng } from "./png";
import { FLOOR_GRADE, gradeSheet, hexToRgb, luminance, tileLuminance } from "../src/render/grade";
import { TILESETS, SPRITE_OVERRIDES } from "../src/render/atlas/manifest";
import { RAIDS, raidBossSpec } from "../src/data/raids";
import { biomeFor, type BiomeStyle } from "../src/data/biomes";
import { bossFor, type BossSpec } from "../src/data/bosses";
import { towerBiomeFor, towerBossSpec } from "../src/data/tower";
import { ELEMENT_COLORS } from "../src/data/elements";

const WASH_STRENGTH = 0.28; // render/draw.ts's steady-state infusion wash

function hexLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return luminance(r, g, b);
}

function bossRawMeanLuminance(atlasId: string): number | null {
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

/** The steady-state luminance the game actually draws most of a fight — washed if the
 * boss isn't physical, exactly the sprite file if it is. */
function bossSteadyLuminance(spec: BossSpec, raw: number): number {
  if (spec.element === "physical") return raw;
  const washLum = hexLuminance(ELEMENT_COLORS[spec.element]);
  return WASH_STRENGTH * washLum + (1 - WASH_STRENGTH) * raw;
}

function floorLuminance(biome: BiomeStyle): { mean: number; source: string } {
  const tilesetId = biome.tileset;
  if (!tilesetId || !TILESETS[tilesetId] || !existsSync(`src/render/atlas/tilesets/${tilesetId}.png`)) {
    return { mean: hexLuminance(biome.tint), source: tilesetId ? `${tilesetId} (declared, no PNG — flat fallback)` : "no tileset — flat fallback" };
  }
  const dir = "src/render/atlas/tilesets";
  const png = decodePng(readFileSync(`${dir}/${tilesetId}.png`));
  const layout = JSON.parse(readFileSync(`${dir}/${tilesetId}.json`, "utf8")) as { tile: number; boxes: [number, number][] };
  const data = new Uint8Array(png.data);
  gradeSheet(data, png.width, png.height, layout.tile, layout.boxes, biome.tint, FLOOR_GRADE);
  const floor = tileLuminance(data, png.width, layout.tile, layout.boxes[0]!);
  return { mean: floor.mean, source: `${tilesetId} @ ${biome.tint}` };
}

interface Row {
  readonly group: string;
  readonly label: string;
  readonly boss: BossSpec;
  readonly biome: BiomeStyle;
}

const rows: Row[] = [
  ...[5, 10, 15, 20, 25].map((depth) => ({
    group: "delve", label: `depth ${depth}`, boss: bossFor(depth), biome: biomeFor(depth),
  })),
  ...RAIDS.map((spec) => ({
    group: "raid", label: spec.name, boss: raidBossSpec(spec), biome: spec.biome,
  })),
  ...[5, 10, 15, 20, 25].map((height) => ({
    group: "tower", label: `height ${height}`, boss: towerBossSpec(height), biome: towerBiomeFor(height),
  })),
];

const MIN_DELTA = 28; // the same §17.7 bar tools/smoke.ts uses for floor vs. wall/monster

// The prefix-classifier failure mode `chroma`/`anim`/`artsheet` all had (silently
// excluding `tower.boss.*`) was invisible precisely because nothing printed how many
// sprites the walk actually saw. This walk is built from live functions (`bossFor`,
// `towerBossSpec`, `RAIDS`) rather than a derived id-prefix test, but the count is
// printed anyway — a silent skip anywhere in this list should be visible here, not
// discovered later the way the other three were.
console.log("=== boss vs. floor luminance — every boss in the game, measured the same way ===");
console.log(`walked ${rows.length} rows: 5 Delve floor bosses (depth 5/10/15/20/25) + `
  + `${RAIDS.length} raids + 5 Tower bosses (height 5/10/15/20/25)\n`);

interface Result { row: Row; atlasId: string; raw: number | null; steady: number; floor: number; floorSource: string; delta: number; }
const results: Result[] = [];

for (const row of rows) {
  const overrideKey = row.boss.sprite;
  const atlasId = (SPRITE_OVERRIDES as Record<string, string>)[overrideKey] ?? overrideKey;
  const raw = bossRawMeanLuminance(atlasId);
  const floor = floorLuminance(row.biome);
  if (raw === null) {
    console.log(`--- ${row.group}/${row.label}: ${row.boss.name} — sprite ${atlasId} MISSING ---`);
    continue;
  }
  const steady = bossSteadyLuminance(row.boss, raw);
  const delta = Math.abs(steady - floor.mean);
  results.push({ row, atlasId, raw, steady, floor: floor.mean, floorSource: floor.source, delta });
  const washNote = row.boss.element === "physical" ? "unwashed (physical)" : `washed ${WASH_STRENGTH * 100}% ${row.boss.element}`;
  const flag = delta < MIN_DELTA ? "  <-- BELOW BAR" : "";
  console.log(`--- ${row.group}/${row.label}: ${row.boss.name} (${atlasId}) ---`);
  console.log(`  boss raw L${raw.toFixed(1)} -> steady L${steady.toFixed(1)} (${washNote})`);
  console.log(`  floor L${floor.mean.toFixed(1)} [${floor.source}]`);
  console.log(`  delta ${delta.toFixed(1)} (bar >= ${MIN_DELTA})${flag}\n`);
}

const failing = results.filter((r) => r.delta < MIN_DELTA);
console.log(`\n${results.length} bosses measured, ${failing.length} below the ${MIN_DELTA} bar.`);
if (failing.length) {
  console.log("Failing:");
  for (const f of failing) console.log(`  ${f.row.group}/${f.row.label}: ${f.row.boss.name} — delta ${f.delta.toFixed(1)}`);
}
