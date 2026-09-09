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

/**
 * Opaque pixels of ONE frame of a horizontal strip. `w` is a single frame's width, so
 * frame `i` occupies columns `i*w .. i*w+w` of a `w*cols`-wide PNG.
 */
function framePixels(
  data: Uint8Array, stripW: number, w: number, h: number, index: number,
): number[] {
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((y * stripW) + index * w + x) * 4;
      if (data[s + 3]! < 128) continue;
      out.push((data[s]! << 16) | (data[s + 1]! << 8) | data[s + 2]!);
    }
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
  // boss.warden was pinned here on this gate's first honest run: its loudest 2+-pixel
  // colour was #8e6142 (chroma 29.8), a skin/tan value across 72 pixels, weaker than the
  // hero's own legitimate exposed-skin chroma (30.2). §1.4's *other* failure mode — "zero
  // and it's scenery" — on one of the five original floor-template bosses, which predate
  // the accent discipline entirely.
  //
  // FIXED, and unpinned deliberately rather than silently (see the note above: fixing a
  // pin without removing it fails this gate too). `art/bosses/warden-accent.py` lights
  // four pixels — two two-pixel eyes in the shadow band under the helm rim — at #2ee6a6,
  // chroma 72.2. Nothing else on the sprite was touched; it was given the one signal it
  // was missing, not repainted. The Warden's element is `physical`, whose palette entry is
  // deliberately desaturated, so unlike the Tyrant in `finish.ts` there was no element
  // colour to lift to and a hue had to be chosen — teal-green, the Warden's own plate hue
  // at roughly five times its chroma, and unclaimed by any other encounter.
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

// --- 5. per-FRAME presence, for animated sprites -----------------------------------------
//
// A strip-level measurement cannot see an accent that blinks out. `boss.ferryman` passed
// section 4 at 36.9 while its cold eye was **absent** from two of its five frames — the
// animation generator had washed those two pixels to a blue-grey, and the three surviving
// frames carried the number for the whole strip.
//
// **This asserts PRESENCE, not CONSTANCY.** An accent that brightens and dims as a thing
// breathes is good art and must not be forbidden; an accent that *vanishes* for two frames
// of five is the part looking at you blinking out of existence, which is the defect.
//
// The bar is HUE, and that is not the obvious choice, so: the obvious bar — "every frame's
// max accent chroma stays above the hero's" — was written first and **falsified against the
// real broken art, which it passed.** With the eye gone, the loudest surviving colour in
// those frames was a dull olive on the robe at 31.4, a hair over the hero's 30.2. Chroma
// alone cannot tell "the eye dimmed" from "the eye is gone and a robe pixel is now the
// loudest thing", because it never asks *which* colour is the accent.
//
// Hue can. A pulse keeps its hue and varies its chroma; a vanish swaps the accent to an
// unrelated part of the sprite, and the hue jumps — 212° (cold blue) to 55° (olive) in the
// case above. So: every frame's accent must sit near the strip's own accent hue, and its
// chroma is left entirely free to pulse.

section("§1.4 per frame: an animated accent may pulse, but it may not vanish");

/** Hue in degrees, 0-360. Meaningless for a greyscale colour, which `HUE_TOLERANCE` guards. */
function hue(c: number): number {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/** Shortest angular distance between two hues, 0-180. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * How far an accent may drift in hue across a cycle. Generous — an eye catching light can
 * shift a little — but nowhere near the 157° jump that says the accent was replaced by an
 * unrelated colour rather than dimmed.
 */
const HUE_TOLERANCE = 45;

{
  const animated = Object.values(ATLAS).filter((m) => m.anim && m.anim.cols > 1
    && (m.id.startsWith("boss.") || /\.monster\./.test(m.id)));
  if (animated.length === 0) {
    console.log("  (no animated monster/boss sprites yet — nothing to measure per frame)");
  }
  for (const meta of animated) {
    const path = `src/render/atlas/${dirFor(meta.id)}/${meta.id}.png`;
    if (!existsSync(path)) continue;
    const png = decodePng(readFileSync(path));
    const cols = meta.anim!.cols;
    const strip = maxAccentChroma(opaquePixels(png.data, png.width, png.height));
    const stripHue = hue(parseInt(strip.hex.slice(1), 16));
    const perFrame = Array.from({ length: cols }, (_, i) =>
      maxAccentChroma(framePixels(png.data, png.width, meta.w, meta.h, i)));

    const drifted = perFrame
      .map((f, i) => ({ i, f, gap: hueGap(hue(parseInt(f.hex.slice(1), 16)), stripHue) }))
      .filter((e) => e.gap > HUE_TOLERANCE);

    console.log(`  ${meta.id}: accent ${strip.hex} (hue ${stripHue.toFixed(0)}°) — per frame `
      + perFrame.map((f) => `${f.max.toFixed(1)}${f.hex}`).join(" "));
    check(`${meta.id}: the accent is present in all ${cols} frames, not just some`,
      drifted.length === 0,
      drifted.map((e) => `frame ${e.i} is ${e.f.hex} (${e.gap.toFixed(0)}° away — the accent is gone, not dimmed)`).join("; "));

    const lo = Math.min(...perFrame.map((f) => f.max));
    const hi = Math.max(...perFrame.map((f) => f.max));
    if (hi - lo > 1) {
      console.log(`       · pulses ${lo.toFixed(1)}-${hi.toFixed(1)} across the cycle`
        + " — allowed on purpose; only vanishing is a defect");
    }
  }
}

console.log(`\n${failures === 0 ? "chroma gate: all checks passed" : `chroma gate: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
