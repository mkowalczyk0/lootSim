/**
 * The hot-accent gate (art style guide §1.4/§19): the hero must never carry a hot
 * accent — that signal belongs to the monsters, "the part of it that is looking at you" —
 * and colour count alone cannot catch a violation of it, because one saturated pixel pair
 * costs exactly one colour, same as any other. Five hero passes were rejected before this
 * was made a permanent check; one of the rejected candidates had the LOWEST colour count
 * of its batch while carrying a saturated gold buckle and lit blue eyes, invisible to a
 * colour-count screen.
 *
 * lootsim-76 derived the fix while measuring hero candidates
 * (`art/characters/candidates.ts`, branch `art/hero-v6`): the max chroma over any colour
 * that covers 2+ pixels (a single stray pixel is generator dithering, not a design
 * decision). That formula now lives once, in `render/grade.ts#chroma`, imported here
 * rather than re-derived — this file is the permanent-gate half of that instrument, not a
 * second implementation of it.
 *
 * **Asserted as a comparison, not a bound.** §1.4 says the hot accent is the monsters'
 * signal; the honest way to state that is "the hero's max accent chroma is below every
 * committed monster/boss's own", not a constant like "hero chroma < 40" that only
 * approximates the relationship and drifts the moment a monster palette is retuned. There
 * is a legitimate floor this has to clear without tripping: skin tone on an exposed face
 * reads around chroma 26-35, and that is not a violation — the comparison handles this for
 * free, since every committed monster/boss's own hot accent reads well above it.
 */
import { existsSync, readFileSync } from "node:fs";
import { decodePng } from "./png";
import { ATLAS, SPRITE_OVERRIDES } from "../src/render/atlas/manifest";
import { chroma } from "../src/render/grade";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string): void {
  console.log(`\n=== ${name} ===`);
}

/** Opaque pixels (alpha >= 128, matching the candidates.ts threshold) as packed RGB ints. */
function opaquePixels(data: Uint8Array, width: number, height: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < width * height; i++) {
    const s = i * 4;
    if (data[s + 3]! < 128) continue;
    out.push((data[s]! << 16) | (data[s + 1]! << 8) | data[s + 2]!);
  }
  return out;
}

/** The hot-accent detector itself: max chroma among colours covering 2+ pixels. */
function maxAccentChroma(pixels: readonly number[]): { max: number; hex: string } {
  const counts = new Map<number, number>();
  for (const c of pixels) counts.set(c, (counts.get(c) ?? 0) + 1);
  let max = 0, hex = "—";
  for (const [c, n] of counts) {
    if (n < 2) continue;
    const s = chroma(c);
    if (s > max) { max = s; hex = `#${c.toString(16).padStart(6, "0")}`; }
  }
  return { max, hex };
}

function measureFile(path: string): { max: number; hex: string } {
  const png = decodePng(readFileSync(path));
  return maxAccentChroma(opaquePixels(png.data, png.width, png.height));
}

// --- 1. the detector itself is not vacuous ----------------------------------------------
//
// A comparison nobody has seen fail may be blind (the house rule this project learned the
// hard way — see CLAUDE.md's sharp-vs-reckless note). Prove the detector actually detects
// before trusting it on real art: a lone hot pixel is noise and must NOT register, two of
// the same hot pixel must, and a legitimate skin-tone chroma must read well below a real
// accent rather than being confused for one.

section("the detector itself");

{
  const pureRed = 0xff0000; // chroma 100
  const skinTone = 0xc98868; // a plausible exposed-skin tone, chroma ~30
  const onePixel = maxAccentChroma([pureRed]);
  check("a single stray hot pixel does not register (the 2-pixel floor)", onePixel.max === 0,
    `got ${onePixel.max.toFixed(1)}`);

  const twoPixels = maxAccentChroma([pureRed, pureRed]);
  check("the same colour twice registers as the accent", twoPixels.max > 90,
    `got ${twoPixels.max.toFixed(1)}`);

  const skin = maxAccentChroma([skinTone, skinTone, skinTone]);
  check("a plausible skin tone reads in the legitimate 26-35 band, not as a false accent",
    skin.max >= 20 && skin.max <= 40, `got ${skin.max.toFixed(1)}`);
  check("...and a real hot accent still reads well above that skin tone",
    twoPixels.max > skin.max + 30, `accent ${twoPixels.max.toFixed(1)} vs skin ${skin.max.toFixed(1)}`);
}

// --- 2. the hero, measured for real ------------------------------------------------------

section("the hero");

const heroId = SPRITE_OVERRIDES.hero!;
const heroMeta = ATLAS[heroId]!;
const hero = measureFile(`src/render/atlas/characters/${heroId}.png`);
console.log(`  ${heroId}: max accent chroma ${hero.max.toFixed(1)} (${hero.hex})`);
check("the shipped hero PNG exists and decodes", !!heroMeta);

// --- 3. every committed monster/boss, measured the same way ------------------------------

section("the cast it has to read next to");

const MONSTER_IDS = Object.keys(ATLAS).filter(
  (id) => id.startsWith("boss.") || /\.monster\./.test(id),
);
const dirFor = (id: string): string => (id.startsWith("boss.") ? "bosses" : "monsters");

const monsters: { id: string; max: number; hex: string }[] = [];
const undrawn: string[] = [];
for (const id of MONSTER_IDS) {
  const path = `src/render/atlas/${dirFor(id)}/${id}.png`;
  // A monster/boss id can be named (e.g. the Tower's roster) before its PNG is committed —
  // the same fallback-ladder shape every other art table in this repo uses. Skip rather
  // than fail; there is nothing to measure yet.
  if (!existsSync(path)) { undrawn.push(id); continue; }
  const m = measureFile(path);
  monsters.push({ id, ...m });
  console.log(`  ${id.padEnd(34)} ${m.max.toFixed(1).padStart(6)}  ${m.hex}`);
}
if (undrawn.length) console.log(`  (skipped, not yet drawn: ${undrawn.join(", ")})`);

check("at least one monster/boss sprite is committed to compare the hero against",
  monsters.length > 0, `${monsters.length} committed, ${undrawn.length} undrawn`);

// --- 4. the rule itself, as a comparison --------------------------------------------------
//
// Per-monster, not "below the single weakest" — a lone floor value hides which specific
// sprite is the offender when one shows up. Each comparison that fails is a real §1.4
// violation on *some* committed sprite, pinned the same way `tools/legends.ts` pins the
// boss-rule audit: a violation set that must match exactly, so a new one fails loudly and
// so does a pinned one getting fixed without the pin being removed to acknowledge it.

section("the rule (§1.4): the hero's accent stays below every monster's, one by one");

/**
 * Known, pre-existing failures of the rule above — each `<monster id>` is not this
 * branch's to fix, reported to the PM instead. Not this branch's fault: the accent-
 * counting discipline (`art/bosses/finish.ts`, the worked example in §1.4) was applied to
 * the four raid bosses; the five original floor-template bosses predate it.
 */
const KNOWN_ACCENT_VIOLATIONS: readonly string[] = [
  // boss.warden's 2+-pixel opaque palette has nothing that reads as a lit accent at all —
  // its own "loudest" colour is #8e6142 (chroma 29.8), a skin/tan value, weaker than the
  // hero's own legitimate exposed-skin chroma (30.2). Not a single-pixel edge case: that
  // colour covers 72 pixels. This is §1.4's *other* failure mode ("zero and it's
  // scenery"), just never counted before now.
  "boss.warden",
];

{
  const found = monsters.filter((m) => hero.max >= m.max).map((m) => m.id).sort();
  const pinned = [...KNOWN_ACCENT_VIOLATIONS].sort();
  for (const id of found) {
    const m = monsters.find((x) => x.id === id)!;
    console.log(`       · hero (${hero.max.toFixed(1)} ${hero.hex}) >= ${id} (${m.max.toFixed(1)} ${m.hex})`);
  }
  check("the hero's accent violates §1.4 against exactly the monsters we already knew about",
    found.join(",") === pinned.join(","),
    `found [${found.join(", ") || "none"}]  pinned [${pinned.join(", ") || "none"}]`);
}

console.log(`\n${failures === 0 ? "chroma gate: all checks passed" : `chroma gate: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
