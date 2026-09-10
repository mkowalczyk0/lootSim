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

const isBoss = (id: string): boolean => id.startsWith("boss.") || id.startsWith("tower.boss.");
const MONSTER_IDS = Object.keys(ATLAS).filter((id) => isBoss(id) || /\.monster\./.test(id));
const dirFor = (id: string): string => (isBoss(id) ? "bosses" : "monsters");

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
// case above.
//
// **But hue alone is not sufficient either, and real art proved that too.** The animated
// minotaur came back with its violet eyes *darkened* rather than replaced: #b577eb (45.5)
// in frame 0, #351057 (27.8) in the other four. Same hue family, so the hue test called it
// a pulse — but 27.8 is BELOW the hero's own skin at 30.2, i.e. the accent had dimmed until
// it was no longer an accent at all. An eye the player cannot pick out is vanished in every
// way that matters, whatever its hue.
//
// So the bar is BOTH, and each catches what the other cannot: the hue must stay near the
// strip's accent (the accent was not replaced) AND the chroma must stay above the hero's
// (it is still legible as an accent). Between those two the chroma is free to pulse.
//
// ## Sprites with more than one accent (2026-09-10)
//
// Everything above derives ONE accent from the strip and infers the rest from rank: the
// loudest 2+px colour in the whole strip is the accent, and every frame's loudest is
// expected to be that same thing. On a sprite with two bright features that is wrong, and
// `boss.corrupted-saint` is the case that proved it — a gold halo (hue 40) and violet eyes
// (hue 277), both deliberate, both shipped, neither ever vanishing, which nonetheless
// **trade rank**: gold leads the idle, violet leads the wind-up as the spell energy grows.
// The gate read that swap as a ~125° hue jump and called a perfectly good accent replaced.
//
// The fix is a MANIFEST DECLARATION (`AtlasSprite.accents`), and three things about it are
// deliberate:
//
//   1. **Declared, never inferred.** No auto-detection of how many accents a sprite "seems
//      to have" — that is a derived classifier of exactly the kind CLAUDE.md's fourth
//      lesson is about. A sprite that declares nothing is a one-accent sprite and takes the
//      derived path above, byte for byte unchanged.
//   2. **Declaring buys strictness, not slack.** The obvious shape — "each frame must keep
//      SOME declared accent above the bar" — was rejected for being weaker than what it
//      replaces. What runs instead is that **every** declared accent must clear the bar in
//      **every** frame, independently. On the Saint that is a strictly harder test than the
//      one it replaces: the derived check can only ever see whichever accent is loudest, so
//      gold could go out entirely while violet carried the strip.
//   3. **The replacement guard survives.** Giving up rank ordering must not give up the
//      thing rank ordering was catching ("the accent was replaced by a dull robe colour"),
//      so a declared sprite ALSO has to keep every frame's loudest colour near one of its
//      declared hues. With one declared accent that is identical to the derived check; with
//      two it is the same property generalised to a set.
//
// Falsified rather than argued, per this repo's scar about a correct check talked down by
// prose: `art/anim/dim-accent.py` dims ONE of the Saint's two accents below the bar while
// leaving the other bright and loudest, and the two verdicts on that same injection are
//
//     derived (the old check)    ok    the accent is not REPLACED / stays above the hero's
//     declared (this check)      FAIL  "violet eyes" is below the bar in frame 2
//
// which is the demonstration, not the paragraph above it.

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

/**
 * The loudest 2+px colour whose hue sits within `HUE_TOLERANCE` of `targetHue` — i.e. "how
 * bright is THIS accent here", as opposed to `maxAccentChroma`'s "what is the brightest
 * thing here". Returns 0 when the accent is absent from the frame entirely, which is the
 * reading that matters: an accent that is not in the frame cannot clear the bar.
 */
function accentNear(pixels: readonly number[], targetHue: number): { max: number; hex: string } {
  const counts = new Map<number, number>();
  for (const c of pixels) counts.set(c, (counts.get(c) ?? 0) + 1);
  let max = 0, hex = "absent";
  for (const [c, n] of counts) {
    if (n < 2) continue;
    if (hueGap(hue(c), targetHue) > HUE_TOLERANCE) continue;
    const s = chroma(c);
    if (s > max) { max = s; hex = `#${c.toString(16).padStart(6, "0")}`; }
  }
  return { max, hex };
}

{
  // The walk is animated monster/boss sprites UNION everything that declares accents. The
  // union is the point: a declaration on a sprite the walk did not reach would be a check
  // that silently does nothing, which is CLAUDE.md's "the scope" failure exactly. A static
  // declared sprite is walked as a one-frame strip.
  const animated = Object.values(ATLAS).filter((m) => m.anim && m.anim.cols > 1
    && (isBoss(m.id) || /\.monster\./.test(m.id)));
  const declaredOnly = Object.values(ATLAS)
    .filter((m) => m.accents?.length && !animated.includes(m));
  const walk = [...animated, ...declaredOnly];
  if (walk.length === 0) {
    console.log("  (no animated monster/boss sprites yet — nothing to measure per frame)");
  }
  let walked = 0, declaredCount = 0, multiCount = 0;
  for (const meta of walk) {
    const path = `src/render/atlas/${dirFor(meta.id)}/${meta.id}.png`;
    if (!existsSync(path)) continue;
    const png = decodePng(readFileSync(path));
    const cols = meta.anim?.cols ?? 1;
    const frames = Array.from({ length: cols }, (_, i) =>
      framePixels(png.data, png.width, meta.w, meta.h, i));
    const perFrame = frames.map((f) => maxAccentChroma(f));
    walked++;

    const declared = meta.accents;
    if (!declared) {
      // --- the derived path: one accent, taken from the strip. UNCHANGED. --------------
      const strip = maxAccentChroma(opaquePixels(png.data, png.width, png.height));
      const stripHue = hue(parseInt(strip.hex.slice(1), 16));
      const drifted = perFrame
        .map((f, i) => ({ i, f, gap: hueGap(hue(parseInt(f.hex.slice(1), 16)), stripHue) }))
        .filter((e) => e.gap > HUE_TOLERANCE);
      const dimmed = perFrame
        .map((f, i) => ({ i, f }))
        .filter((e) => e.f.max <= hero.max);

      console.log(`  ${meta.id}: accent ${strip.hex} (hue ${stripHue.toFixed(0)}°) — per frame `
        + perFrame.map((f) => `${f.max.toFixed(1)}${f.hex}`).join(" "));
      check(`${meta.id}: the accent is not REPLACED in any of the ${cols} frames`,
        drifted.length === 0,
        drifted.map((e) => `frame ${e.i} is ${e.f.hex} (${e.gap.toFixed(0)}° away — the accent is gone, not dimmed)`).join("; "));
      check(`${meta.id}: the accent stays above the hero's in all ${cols} frames`,
        dimmed.length === 0,
        dimmed.map((e) => `frame ${e.i} is ${e.f.max.toFixed(1)} ${e.f.hex} vs hero ${hero.max.toFixed(1)}`
          + " — dimmed until it is no longer an accent").join("; "));

      const lo = Math.min(...perFrame.map((f) => f.max));
      const hi = Math.max(...perFrame.map((f) => f.max));
      if (hi - lo > 1) {
        console.log(`       · pulses ${lo.toFixed(1)}-${hi.toFixed(1)} across the cycle`
          + " — allowed on purpose; only vanishing is a defect");
      }
      continue;
    }

    // --- the declared path: EVERY accent, independently, in EVERY frame ----------------
    declaredCount++;
    if (declared.length > 1) multiCount++;
    console.log(`  ${meta.id}: ${declared.length} declared accent(s), ${cols} frames`);
    for (const accent of declared) {
      const values = frames.map((f) => accentNear(f, accent.hue));
      const gone = values.map((v, i) => ({ i, v })).filter((e) => e.v.max <= hero.max);
      const lo = Math.min(...values.map((v) => v.max));
      const hi = Math.max(...values.map((v) => v.max));
      console.log(`       · "${accent.name}" (hue ${accent.hue}°) ${lo.toFixed(1)}-${hi.toFixed(1)} — `
        + values.map((v) => `${v.max.toFixed(1)}${v.hex}`).join(" "));
      check(`${meta.id}: the declared accent "${accent.name}" stays above the hero's in all ${cols} frames`,
        gone.length === 0,
        gone.map((e) => `frame ${e.i} is ${e.v.max.toFixed(1)} ${e.v.hex} vs hero ${hero.max.toFixed(1)}`
          + " — this accent is gone or dimmed out of legibility").join("; "));
    }

    // The replacement guard, kept from the derived path rather than traded away with the
    // rank-ordering assumption: whatever is loudest in a frame must still BE one of the
    // declared accents. With one declared accent this is the derived check; with two it is
    // the same property over a set.
    const foreign = perFrame
      .map((f, i) => ({
        i, f,
        gap: Math.min(...declared.map((a) => hueGap(hue(parseInt(f.hex.slice(1), 16)), a.hue))),
      }))
      .filter((e) => e.gap > HUE_TOLERANCE);
    check(`${meta.id}: no frame's loudest colour is an UNDECLARED hue (the accent was not replaced)`,
      foreign.length === 0,
      foreign.map((e) => `frame ${e.i} is ${e.f.hex} at ${e.f.max.toFixed(1)}`
        + ` (${e.gap.toFixed(0)}° from the nearest declared accent)`).join("; "));
  }
  console.log(`\n  walked ${walked} sprite(s): ${animated.length} animated, `
    + `${declaredCount} declaring accents, ${multiCount} declaring more than one`);
}

console.log(`\n${failures === 0 ? "chroma gate: all checks passed" : `chroma gate: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
