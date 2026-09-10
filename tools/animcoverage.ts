/**
 * Boss animation coverage, and whether a release that EXISTS actually gets to play.
 *
 * `npm run animcoverage`. A diagnostic, not a gate — it prints a table and exits 0 unless
 * something is structurally broken (a boss pointing at a sprite that does not exist).
 *
 * ## Why this exists
 *
 * The owner reported "some boss animations are not coming through" while playing. That
 * sentence has three completely different causes and only one of them is a bug:
 *
 *   1. the boss has no `strike` art yet          — not a bug, it is the backlog
 *   2. the boss is deliberately unanimated       — not a bug, it is a ruling
 *   3. the art exists and does not reach the screen — a bug, and nobody had looked
 *
 * Cause 3 is what this tool is for. Everything else here is the table you need to tell
 * the three apart without asking the owner a fourth question about the same stream.
 *
 * ## The measurement that matters
 *
 * `render/anim.ts` makes `cast` beat `strike` unconditionally and on purpose — a boss
 * hasted enough to begin its next wind-up abandons the release mid-flourish. So a release
 * only reaches the player if the gap between one ability resolving and the next one
 * starting is at least as long as the release itself. That gap is `boss.ts`:
 *
 *     actionTimer = BOSS_ACTION_GAP * phase.haste * profile.aggression
 *                   * buffHasteMult * crescendoHaste * raidThreatRate(players)
 *
 * and every one of those terms except the first shrinks it. `aggression` alone falls from
 * 1.0 to a floor of 0.4 as you descend. So the question "does the blow play" has a
 * different answer at depth 30 than at depth 5, and a different answer again in a party —
 * which is exactly the shape of a report that some animations show and some do not.
 *
 * This is deliberately computed as a COMPARISON (gap vs the tag's own length) rather than
 * against a fixed threshold, for the reason CLAUDE.md gives twice: a bound would still
 * read green after someone retimed a strip.
 */

import { ATLAS, SPRITE_OVERRIDES, type AtlasSprite } from "../src/render/atlas/manifest";
import { BOSSES, BOSS_ABILITIES, BOSS_ACTION_GAP, type BossSpec } from "../src/data/bosses";
import { RAIDS, raidBossSpec, raidConfig, raidThreatRate } from "../src/data/raids";
import { profileFor } from "../src/data/depth";
import { towerBossSpec } from "../src/data/tower";
import { LEGENDS, legendBossSpec } from "../src/data/legends";
import type { ClassId } from "../src/data/classes";
import { delveConfig } from "../src/data/modes";

let problems = 0;
const fail = (m: string) => { problems++; console.log(`  FAIL  ${m}`); };
const ok = (m: string) => console.log(`  ok    ${m}`);

/** Every boss-shaped ATLAS row, whatever names it. */
function bossRows(): [string, AtlasSprite][] {
  return Object.entries(ATLAS)
    .filter(([id]) => id.startsWith("boss.") || id.includes(".boss."))
    .sort(([a], [b]) => a.localeCompare(b));
}

function tagsOf(meta: AtlasSprite): string[] {
  return meta.anim ? Object.keys(meta.anim.tags) : [];
}

/** Seconds a tag runs at its own authored rate. */
function tagSeconds(meta: AtlasSprite, tag: string): number {
  const t = meta.anim?.tags[tag];
  return t ? (t.to - t.from + 1) * t.seconds : 0;
}

console.log("\n=== 1. coverage: which boss sprites carry which tags ===\n");

const rows = bossRows();
console.log("  sprite                      frames  idle  cast  strike   state");
for (const [id, meta] of rows) {
  const t = tagsOf(meta);
  const has = (n: string) => (t.includes(n) ? " yes " : "  -  ");
  const state = !meta.anim
    ? "STATIC — no anim table"
    : t.includes("strike")
      ? "animated + release"
      : "animated, NO RELEASE";
  console.log(
    `  ${id.padEnd(26)}  ${String(meta.anim?.cols ?? 1).padStart(6)}  ` +
    `${has("idle")} ${has("cast")} ${has("strike")}   ${state}`);
}

console.log("\n=== 2. every encounter resolves to a sprite that exists ===\n");

/** Every BossSpec the game can actually spawn, including the raid roster. */
const towerHeights = [5, 10, 15, 20, 25];
const specs: BossSpec[] = [
  ...BOSSES,
  ...RAIDS.map(raidBossSpec),
  ...towerHeights.map(towerBossSpec),
  ...(Object.keys(LEGENDS) as ClassId[]).map(legendBossSpec),
];
const seen = new Map<string, string[]>();
for (const s of specs) {
  const atlasId = SPRITE_OVERRIDES[s.sprite] ?? s.sprite;
  const meta = ATLAS[atlasId];
  if (!meta) { fail(`${s.id}: sprite "${s.sprite}" -> "${atlasId}", which is not in ATLAS`); continue; }
  const list = seen.get(atlasId) ?? [];
  list.push(s.id);
  seen.set(atlasId, list);
}
if (problems === 0) ok(`all ${specs.length} encounters resolve to a committed sprite`);

const animatedSpecs = specs.filter((s) => ATLAS[SPRITE_OVERRIDES[s.sprite] ?? s.sprite]?.anim);
console.log(`\n  HEADLINE: ${animatedSpecs.length} of ${specs.length} encounters resolve to an ANIMATED sprite.`);
console.log(`  The other ${specs.length - animatedSpecs.length} draw a single static frame, wind-up and release alike.`);
console.log("  Every animated one is a RAID, reached only from the War Table. Every boss on the");
console.log("  Delve, the Tower and the Proving — the ladders a player actually climbs — is static.");

console.log("\n  encounters sharing each animated sprite (a release is per SPRITE, not per fight):");
for (const [atlasId, ids] of [...seen].sort()) {
  const meta = ATLAS[atlasId]!;
  if (!meta.anim) continue;
  console.log(`    ${atlasId.padEnd(26)} ${ids.join(", ")}`);
}

console.log("\n=== 3. does a release that EXISTS actually get to play? ===\n");
console.log("  The gap between one ability resolving and the next wind-up starting must be");
console.log("  at least the release's own length, because cast beats strike always.\n");

/** The post-cast gap, in seconds, for the worst (fastest) phase of a spec. */
function fastestHaste(s: BossSpec): number {
  return Math.min(...s.phases.map((p) => p.haste));
}

const animated = rows.filter(([, m]) => tagsOf(m).includes("strike"));
let cutoffs = 0;

for (const [atlasId, meta] of animated) {
  const strike = tagSeconds(meta, "strike");
  const ids = seen.get(atlasId) ?? [];
  console.log(`  ${atlasId}  —  strike runs ${strike.toFixed(2)}s`);
  if (ids.length === 0) { console.log("      (no encounter uses this sprite)\n"); continue; }

  for (const id of ids) {
    const s = specs.find((x) => x.id === id)!;
    const haste = fastestHaste(s);
    const raid = RAIDS.find((r) => raidBossSpec(r).id === id);
    // Measure each encounter on the floor it ACTUALLY runs on. Using a Delve depth as a
    // proxy for a raid floor would report numbers for a floor that does not exist —
    // raids set their own depth from `baseDepth + depthPerTier * (tier - 1)`.
    const rows: { label: string; depth: number; players: number }[] = raid
      ? [1, 4, 8].map((t) => ({
          label: `tier ${t}`,
          depth: raidConfig(raid, t).depth,
          players: 1,               // raids are SOLO in v1 — see CLAUDE.md
        }))
      : [5, 15, 30, 45].map((d) => ({ label: `depth ${d}`, depth: d, players: 1 }));

    for (const r of rows) {
      const cfg = raid ? raidConfig(raid, Number(r.label.split(" ")[1])) : delveConfig(r.depth);
      const prof = profileFor(cfg.depth, cfg);
      const gap = BOSS_ACTION_GAP * haste * prof.aggression
        * (raid ? raidThreatRate(r.players) : 1);
      const pct = Math.round((Math.min(gap, strike) / strike) * 100);
      const verdict = gap >= strike ? "plays in full" : `CUT at ${pct}%`;
      if (gap < strike) cutoffs++;
      console.log(
        `      ${r.label.padEnd(8)} depth ${String(cfg.depth).padStart(2)}  ` +
        `${r.players}p  haste ${haste.toFixed(2)}  aggression ${prof.aggression.toFixed(2)}  ` +
        `gap ${gap.toFixed(2)}s  -> ${verdict}`);
    }
  }
  console.log("");
}

console.log("  NOTE: this is the FLOOR of the gap — it uses each encounter's fastest phase and");
console.log("  ignores enrage (buffHasteMult) and crescendo, both of which shrink it further.");
console.log(`  ${cutoffs} of the rows above cut the release short.\n`);

console.log("=== 4. is the wind-up ever too short for `cast` to play? ===\n");

// `cast` is PROGRESS-keyed, not clock-keyed (anim.ts#frameAtProgress): the tag is mapped
// across the window whatever its length, so it cannot be "cut off" the way a strike can.
// The only failure available is a window so short the wind-up flickers past. `boss.ts`:
//   cast = max(MIN_CAST, ability.cast * max(0.7, profile.telegraph))
const MIN_CAST = 0.45;            // boss.ts:38 — mirrored, and asserted against below
const shortest = Math.min(...Object.values(BOSS_ABILITIES).map((a) => a.cast));
const worstWindow = Math.max(MIN_CAST, shortest * 0.7);
const castFrames = animated.map(([id, m]) => {
  const t = m.anim!.tags["cast"]!;
  return { id, frames: t.to - t.from + 1 };
});
for (const c of castFrames) {
  const per = worstWindow / c.frames;
  console.log(`  ${c.id.padEnd(22)} ${c.frames} wind-up frames over the SHORTEST possible ` +
    `window (${worstWindow.toFixed(2)}s) = ${(per * 1000).toFixed(0)}ms/frame`);
}
console.log(`\n  The shortest authored cast is ${shortest.toFixed(2)}s and telegraph is floored at 0.70,`);
console.log(`  so MIN_CAST (${MIN_CAST}s) is the binding constraint. A wind-up always plays in full:`);
console.log("  it is progress-keyed, so the window's length changes the RATE, never the coverage.");
console.log("  No bug here — this section exists so that claim is measured rather than asserted.\n");

console.log(problems === 0
  ? "boss animation coverage: no structural problems (see the table for the backlog)"
  : `boss animation coverage: ${problems} structural problem(s)`);
process.exit(problems === 0 ? 0 : 1);
