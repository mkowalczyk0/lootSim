/**
 * `npm run windup` — a printed instrument for how a boss wind-up is paced. **It asserts
 * nothing about the art, and that is deliberate. Do not turn it into a gate.**
 *
 * ## Read this before "fixing" the three sprites it reports on
 *
 * All three animated strips — `boss.ferryman`, `boss.war-queen`, `boss.exiled-tyrant` —
 * report as early-arriving: each one's travel curve peaks on its PENULTIMATE frame and
 * retreats slightly, and each does the large majority of its travel in its first half.
 * That measurement is correct and reproducible.
 *
 * **The owner has looked at these wind-ups and approved them.** Verbatim, 2026-09-10: "the
 * wind ups look really good." So the property this file measures is true, and the person
 * who decides does not hold it. There is nothing here to repair.
 *
 * This tool briefly WAS a gate, red on all three, on a misreading worth recording. The
 * owner's report was that the animations looked "halfway done", which was taken as a
 * complaint about the frames. It was not. It meant the animation stops at the wind-up and
 * no ATTACK follows — a MISSING animation, not a broken one: "the windups last frame stops
 * right before the attack... i was expecting an attack but it seems like that wasnt the
 * intention here." The fix is a `strike` tag, not better wind-ups.
 *
 * That is why this file no longer fails. A red check here would send some future session to
 * regenerate three sprites nobody thinks are broken, which is a more expensive mistake than
 * having no check at all — the measurement is real, the verdict was never the owner's.
 *
 * ## What it still earns its place for
 *
 * The pacing numbers are a genuine diagnostic for a NEW wind-up, where nobody has yet formed
 * a view: if a freshly generated strip arrives 40% in and coasts, this says so before it
 * ships. Use it as evidence in a judgement, never as a bar.
 *
 * The controls below DO assert, and they are about the instrument rather than the art: three
 * genuine single motions built by translating a real sprite's own frame 0 must be reported as
 * travelling, and one that arrives 40% in and holds must be reported as not travelling. If a
 * future edit breaks the measurement so it cannot tell those apart, this goes red and says
 * so. That is the one thing here worth failing over.
 *
 * ## Why it is a rank statistic, which cost a rewrite to learn
 *
 * The first instrument here was **straightness** — net displacement over path length, the
 * textbook "does this path go somewhere" number. It is worthless on sprites, and only
 * calibration found that. Scored against controls it put a boss's own IDLE LOOP — a closed
 * cycle that by construction returns to where it started and must score near zero — at
 * 0.725, above every real wind-up, while a synthetic pure translation scored 0.348.
 *
 * The reason generalises to anything anyone measures on these sprites: pixel difference is
 * not a metric space with usable triangle geometry. Once two frames stop overlapping much,
 * the distance saturates at "both silhouettes added together", so every path looks equally
 * straight. Any statistic that reasons about distances BETWEEN interior frames inherits
 * that. Only the ordering survives, so only the ordering is measured. See
 * docs/animation.md, "The obvious instrument is wrong".
 *
 * A thresholded changed-pixel count — the obvious first metric — fails differently: it
 * saturates outright, reading 99.9% of the Ferryman's opaque pixels "changed" by frame 10,
 * unable to measure travel past it at all. Hence the two metrics below, neither a count.
 */

import { readFileSync } from "node:fs";
import { decodePng } from "./png";
import { ATLAS, type AtlasSprite } from "../src/render/atlas/manifest";
import { fitsManifest } from "../src/render/anim";

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${detail && !ok ? ` — ${detail}` : ""}`);
}

/** Mirrors the directory layout `render/atlas/index.ts` globs — same rule as `tools/anim.ts`. */
function dirFor(id: string): string {
  if (id.startsWith("boss.")) return "bosses";
  if (id.startsWith("hero.")) return "characters";
  if (id.startsWith("prop.")) return "props";
  if (id.startsWith("named.")) return "items";
  if (id.startsWith("relic.")) return "relics";
  if (id.startsWith("hub.")) return "scenes";
  if (id.startsWith("summon.")) return "summons";
  if (id.includes(".monster.")) return "monsters";
  return "icons";
}

const animated = Object.values(ATLAS).filter((m) => m.anim);

console.log("\nwind-up pacing — diagnostic, not a gate\n");

type Frame = { readonly data: Uint8Array; readonly w: number; readonly h: number };

/** Cut a strip into its frames, on the same lattice `frameRect` hands the renderer. */
function cutFrames(meta: AtlasSprite, png: { width: number; data: Uint8Array }): Frame[] {
  const cols = meta.anim!.cols, out: Frame[] = [];
  for (let c = 0; c < cols; c++) {
    const d = new Uint8Array(meta.w * meta.h * 4);
    for (let y = 0; y < meta.h; y++) {
      for (let x = 0; x < meta.w; x++) {
        const s = ((y * png.width) + (c * meta.w + x)) * 4, t = ((y * meta.w) + x) * 4;
        d[t] = png.data[s]!; d[t + 1] = png.data[s + 1]!;
        d[t + 2] = png.data[s + 2]!; d[t + 3] = png.data[s + 3]!;
      }
    }
    out.push({ data: d, w: meta.w, h: meta.h });
  }
  return out;
}

const opaque = (f: Frame, i: number): boolean => f.data[i * 4 + 3]! >= 8;

/** Pose distance: silhouette disagreement. Immune to re-shading, which is what makes it
 *  a reading of the POSE rather than of the palette. */
function maskXor(a: Frame, b: Frame): number {
  let n = 0;
  for (let i = 0, px = a.w * a.h; i < px; i++) if (opaque(a, i) !== opaque(b, i)) n++;
  return n;
}

/** Appearance distance: alpha-weighted magnitude. Continuous, so unlike a thresholded
 *  changed-pixel count it does not saturate once the sprite is substantially redrawn —
 *  the count metric read 99.9% "changed" on the Ferryman by frame 10 and could not
 *  measure travel past it at all. */
function magDist(a: Frame, b: Frame): number {
  let s = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const aa = a.data[i + 3]! / 255, ba = b.data[i + 3]! / 255;
    for (let k = 0; k < 3; k++) s += Math.abs(a.data[i + k]! * aa - b.data[i + k]! * ba);
    s += Math.abs(a.data[i + 3]! - b.data[i + 3]!);
  }
  return s / 1000;
}

/** Translate a frame — the least ambiguous "one motion" there is, used as the control. */
function shifted(f: Frame, dy: number): Frame {
  const d = new Uint8Array(f.w * f.h * 4);
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const sy = y - dy, t = (y * f.w + x) * 4;
      if (sy < 0 || sy >= f.h) continue;
      const s = (sy * f.w + x) * 4;
      d[t] = f.data[s]!; d[t + 1] = f.data[s + 1]!;
      d[t + 2] = f.data[s + 2]!; d[t + 3] = f.data[s + 3]!;
    }
  }
  return { data: d, w: f.w, h: f.h };
}

type Metric = (a: Frame, b: Frame) => number;
const METRICS: ReadonlyArray<readonly [string, Metric]> = [["pose", maskXor], ["appearance", magDist]];

/** Where the travel curve peaks, and how much of the travel is already done by halfway. */
function travel(seq: readonly Frame[], fn: Metric): { argmax: number; finalOverMax: number; halfShare: number } {
  const d = seq.map((f) => fn(seq[0]!, f));
  const max = Math.max(...d), last = d[d.length - 1]!;
  return {
    argmax: d.indexOf(max),
    finalOverMax: max > 0 ? last / max : 1,
    halfShare: last > 0 ? d[Math.floor((d.length - 1) / 2)]! / last : 1,
  };
}

for (const meta of animated) {
  let png;
  try { png = decodePng(readFileSync(`src/render/atlas/${dirFor(meta.id)}/${meta.id}.png`)); }
  catch { continue; }
  if (!fitsManifest(meta, png.width, png.height)) continue;
  const cut = cutFrames(meta, png);

  for (const [name, tag] of Object.entries(meta.anim!.tags)) {
    if (tag.loop) continue;
    const seq = cut.slice(tag.from, tag.to + 1);
    if (seq.length < 3) continue;

    for (const [mName, fn] of METRICS) {
      const t = travel(seq, fn);
      const lands = t.argmax === seq.length - 1;
      console.log(`      ${meta.id} "${name}": ${mName} travel peaks at frame `
        + `${tag.from + t.argmax} of ${tag.from}..${tag.to}`
        + (lands ? " — its last frame, so it travels to its end"
                 : `, then retreats to ${(100 * t.finalOverMax).toFixed(1)}% of it`));
    }

    // Diagnostic, not asserted — see the note below the loop.
    const controls = [
      ["constant speed", (i: number, n: number) => 10 * (i / n)],
      ["ease-in",        (i: number, n: number) => 10 * (i / n) ** 2],
      ["ease-out",       (i: number, n: number) => 10 * Math.sqrt(i / n)],
    ] as const;
    const n = seq.length - 1;
    const line = controls.map(([cn, f]) =>
      `${cn} ${travel(Array.from({ length: seq.length }, (_, i) => shifted(seq[0]!, Math.round(f(i, n)))), maskXor).halfShare.toFixed(2)}`);
    console.log(`        ${meta.id} "${name}": pose travel done by halfway `
      + `${travel(seq, maskXor).halfShare.toFixed(2)} — same sprite as a single motion would read: ${line.join(", ")}`);
  }
}

// **Both controls, asserted rather than described.** A gate that is red whatever you feed
// it is worth exactly as little as one that is green whatever you feed it, and the failing
// rows above cannot tell the two apart on their own. So the same property is run against
// synthetic strips built by translating a real sprite's own first frame:
//
//   - three genuine single motions (constant speed, ease-in, ease-out) must PASS, which is
//     what proves the property is satisfiable at all; and
//   - one that reaches its pose 40% in and then holds must FAIL, which is what proves the
//     property discriminates rather than waving everything through.
//
// The negative control is the reason the check reads "peaks ONLY at the end" rather than
// the weaker "the last frame is the furthest". A strip that arrives early and coasts
// satisfies the weaker form — its final frame *is* tied for furthest — and a strip that
// arrives early and coasts is the owner's "halfway done" exactly. A deliberately held apex
// is still expressible: hold it with `seconds`, not by repeating the frame, which is what
// that field is for and which does not spend strip width the manifest has to account for.
{
  const src = animated.find((m) => {
    try {
      const p = decodePng(readFileSync(`src/render/atlas/${dirFor(m.id)}/${m.id}.png`));
      return fitsManifest(m, p.width, p.height);
    } catch { return false; }
  });
  if (!src) {
    console.log("        no animated strip on disk to build a control from — skipped");
  } else {
    const png = decodePng(readFileSync(`src/render/atlas/${dirFor(src.id)}/${src.id}.png`));
    const f0 = cutFrames(src, png)[0]!;
    const PACINGS: ReadonlyArray<readonly [string, (t: number) => number, boolean]> = [
      ["constant speed", (t) => t,                  true],
      ["ease-in",        (t) => t ** 2,             true],
      ["ease-out",       (t) => Math.sqrt(t),       true],
      ["stalls 40% in",  (t) => Math.min(1, t / 0.4), false],
    ];
    for (const [name, ease, shouldTravel] of PACINGS) {
      const seq = Array.from({ length: 8 }, (_, i) => shifted(f0, Math.round(10 * ease(i / 7))));
      for (const [mName, fn] of METRICS) {
        const travels = travel(seq, fn).argmax === seq.length - 1;
        check(shouldTravel
          ? `instrument: a single motion (${name}) is reported as travelling (${mName})`
          : `instrument: a motion that ${name} is reported as NOT travelling (${mName})`,
          travels === shouldTravel);
      }
    }
  }
}

// **Why `halfShare` is printed and not asserted.** It is the number that actually
// explains the owner's "halfway done": every one of these wind-ups does the large
// majority of its travel in its first half and then coasts, where a wind-up should be
// building INTO the strike (an ease-in reads ~0.28-0.39 on these very sprites). It also
// reverses the ranking a previous pass reported — measured this way the Exiled Tyrant is
// the *worst* of the three (0.95, nearly a full stall), not the best, because the
// apex-ratio statistic that ranked it first rewards exactly the plateau it is supposed to
// punish: a midpoint frame that already sits on the final pose makes "apex is far from
// the midpoint" fail to fire.
//
// It is not a check yet because its bar is metric-dependent in a way `argmax` is not: on
// the pose metric the War Queen reads 0.62 against a constant-speed control of 0.60, a
// margin of 0.03 that would flip on a redraw. CLAUDE.md has three separate essays about
// shipping a thin comparison and reading it as proof; this repo does not need a sixth
// check that passes vacuously. When the art is regenerated, re-measure the spread and
// assert it then, with the margin known rather than assumed.

console.log(failures === 0
  ? "\nwind-up pacing: instrument verified. Everything above about a shipped strip is a\n"
    + "DIAGNOSTIC, not a defect — the owner has approved these wind-ups. See the header.\n"
  : `\nwind-up pacing: ${failures} FAILED — the INSTRUMENT is broken, not the art. See the header.\n`);
process.exit(failures === 0 ? 0 : 1);
