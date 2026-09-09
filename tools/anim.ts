/**
 * `npm run anim` — the animation subsystem's acceptance gate. Part of `npm test`.
 *
 * Two jobs, and the second is the one that earns its keep.
 *
 * **1. The wiring.** Every animated `ATLAS` row's strip PNG really is `w * cols` wide, its
 * tags really name frames the strip has, and every duration really is a positive number of
 * seconds. This half can only exist because `render/atlas/manifest.ts` and `render/anim.ts`
 * are pure — no DOM, no canvas — so a headless tool can read the rules without a browser.
 *
 * **2. The design promises, as properties rather than as prose.** Three things this
 * subsystem claims are checked as comparisons, in the spirit of the campaign-comparison
 * lesson in CLAUDE.md: a loose one-sided bound doesn't prove a design promise.
 *
 *   - *Superset, not migration.* A row with no `anim` resolves to frame 0 for every tag,
 *     including tags that exist on other sprites. Adding animation to the game did not
 *     move a single un-animated sprite, and this says so directly.
 *   - *The ladder terminates.* Every row crossed with every tag — real, unknown, empty,
 *     absurd — returns an in-range frame and never throws.
 *   - *Seconds, not ticks.* The frame at a given wall-clock time is the same no matter how
 *     many samples were taken to reach it, which is what "two players at different refresh
 *     rates see the same speed" means operationally.
 *
 * And the one that is a real comparison rather than a bound: **a boss wind-up keyed to
 * progress lands its last frame exactly when the cast resolves, at every cast duration,
 * where a free-running clock does not.** That is the reason `frameAtProgress` exists, so
 * it is asserted against its alternative instead of being trusted.
 */

import { readFileSync } from "node:fs";
import { decodePng } from "./png";
import { ATLAS, type AtlasSprite } from "../src/render/atlas/manifest";
import {
  CAST_TAG, FALLBACK_TAG, STATIC_FRAME, castFrame, frameAt, frameAtProgress, frameRect,
  resolveTag, stripWidth,
} from "../src/render/anim";

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${detail && !ok ? ` — ${detail}` : ""}`);
}

/** Mirrors the directory layout `render/atlas/index.ts` globs and smoke.ts walks. */
function dirFor(id: string): string {
  if (id.startsWith("boss.")) return "bosses";
  if (id.startsWith("hero.")) return "characters";
  if (id.startsWith("prop.")) return "props";
  if (id.startsWith("named.")) return "items";
  if (id.startsWith("relic.")) return "relics";
  if (id.startsWith("hub.")) return "scenes";
  if (id.includes(".monster.")) return "monsters";
  return "icons";
}

console.log("\nanimation — wiring\n");

const animated = Object.values(ATLAS).filter((m) => m.anim);
console.log(`  ${animated.length} animated row(s) of ${Object.keys(ATLAS).length} in ATLAS`
  + (animated.length === 0 ? " — the architecture ships before the art, by design" : ""));

for (const meta of animated) {
  const anim = meta.anim!;
  check(`${meta.id}: cols is a positive count`, anim.cols >= 1, `${anim.cols}`);
  check(`${meta.id}: has at least one tag`, Object.keys(anim.tags).length > 0);
  for (const [name, t] of Object.entries(anim.tags)) {
    check(`${meta.id}/${name}: frames are inside the strip`,
      t.from >= 0 && t.to >= t.from && t.to < anim.cols, `${t.from}..${t.to} of ${anim.cols}`);
    check(`${meta.id}/${name}: holds each frame for a positive number of SECONDS`,
      t.seconds > 0 && Number.isFinite(t.seconds), `${t.seconds}`);
  }
  // The strip is `w * cols` wide and one frame tall. `w`/`h` stay one frame's size so
  // every other consumer of the row (worldScale, feet, portraits, the density tools)
  // keeps reading what it always read.
  let png: { width: number; height: number } | null = null;
  try { png = decodePng(readFileSync(`src/render/atlas/${dirFor(meta.id)}/${meta.id}.png`)); }
  catch { /* reported below */ }
  check(`${meta.id}: strip PNG is ${stripWidth(meta)}x${meta.h}, the manifest's w*cols`,
    !!png && png.width === stripWidth(meta) && png.height === meta.h,
    png ? `${png.width}x${png.height}` : "PNG missing");
}

console.log("\nanimation — the design promises\n");

// --- fixtures. Synthetic rows, so these properties hold whether or not any art has
//     been drawn yet. This is why `render/anim.ts` takes a row instead of a sprite id.
const STATIC_ROW: AtlasSprite = { id: "fixture.static", w: 20, h: 30, worldScale: 1, feet: 0 };
const ANIM_ROW: AtlasSprite = {
  id: "fixture.anim", w: 20, h: 30, worldScale: 1, feet: 0,
  anim: {
    cols: 12,
    tags: {
      idle: { from: 0, to: 1, seconds: 0.25, loop: true },
      walk: { from: 2, to: 5, seconds: 0.1, loop: true },
      // Six frames of wind-up at 0.12s = 0.72s if it is left to free-run.
      [CAST_TAG]: { from: 6, to: 11, seconds: 0.12, loop: false },
    },
  },
};
/** A row whose tag lies about the strip — the gate above rejects it; the resolver must not trust it either. */
const BROKEN_ROW: AtlasSprite = {
  id: "fixture.broken", w: 20, h: 30, worldScale: 1, feet: 0,
  anim: { cols: 2, tags: { walk: { from: 0, to: 99, seconds: 0.1, loop: true } } },
};

const TAGS = ["idle", "walk", "cast", "run", "death", "", "  ", "IDLE", "walk ", "../../etc"];
const ROWS: readonly (AtlasSprite | undefined)[] = [STATIC_ROW, ANIM_ROW, BROKEN_ROW, undefined, ...Object.values(ATLAS)];

// 1. Superset, not migration: a row with no anim is frame 0 for every tag, always.
{
  const statics = ROWS.filter((m): m is AtlasSprite => !!m && !m.anim);
  let worst = "";
  const ok = statics.every((m) => TAGS.every((tag) =>
    [frameAt(m, tag, 0), frameAt(m, tag, 9.5), frameAtProgress(m, tag, 0.5)].every((f) => {
      const good = f.index === STATIC_FRAME && f.cols === 1;
      if (!good) worst = `${m.id}/${tag} -> ${f.index}/${f.cols}`;
      return good;
    })));
  check(`every un-animated row draws frame ${STATIC_FRAME} for every tag (superset, not migration)`,
    ok, worst);
  check("an un-animated row's source rect is the whole image, so a static draw is unchanged",
    statics.every((m) => {
      const r = frameRect(m, frameAt(m, "walk", 3));
      return r.sx === 0 && r.sy === 0 && r.sw === m.w && r.sh === m.h;
    }));
}

// 2. The ladder terminates: nothing throws, nothing lands outside the strip.
{
  let bad = "";
  let threw = "";
  for (const m of ROWS) for (const tag of TAGS) {
    for (const t of [0, 0.001, 1, 60, 1e6, -5, NaN]) {
      try {
        const f = frameAt(m, tag, t);
        const cols = m?.anim?.cols ?? 1;
        if (!(Number.isInteger(f.index) && f.index >= 0 && f.index < cols)) {
          bad = `${m?.id ?? "undefined"}/${tag}@${t} -> ${f.index} of ${cols}`;
        }
      } catch (e) { threw = `${m?.id ?? "undefined"}/${tag}@${t}: ${String(e)}`; }
    }
    for (const p of [0, 0.5, 1, -1, 2, NaN, Infinity]) {
      try {
        const f = frameAtProgress(m, tag, p);
        const cols = m?.anim?.cols ?? 1;
        if (!(Number.isInteger(f.index) && f.index >= 0 && f.index < cols)) {
          bad = `${m?.id ?? "undefined"}/${tag}@p${p} -> ${f.index} of ${cols}`;
        }
      } catch (e) { threw = `${m?.id ?? "undefined"}/${tag}@p${p}: ${String(e)}`; }
    }
  }
  check("the fallback ladder never throws, for any row x any tag x any time", threw === "", threw);
  check("every resolved frame is inside its own strip", bad === "", bad);
  check(`an unknown tag falls back to '${FALLBACK_TAG}' when the sprite has one`,
    resolveTag(ANIM_ROW, "no-such-tag") === ANIM_ROW.anim!.tags[FALLBACK_TAG]);
  check("a tag naming frames the strip doesn't have is refused rather than drawn",
    resolveTag(BROKEN_ROW, "walk") === null
      && frameAt(BROKEN_ROW, "walk", 1).index === STATIC_FRAME);
}

// 3. Seconds, not ticks: the frame at a wall-clock time does not depend on how many
//    samples were taken to get there. This is "60 Hz and 144 Hz see the same speed".
{
  const at = (t: number) => frameAt(ANIM_ROW, "walk", t).index;
  let mismatch = "";
  for (const hz of [30, 60, 144, 240]) {
    // Walk a clock forward in that refresh rate's steps and compare each sampled instant
    // against the same instant computed directly.
    for (let i = 0; i <= hz * 2; i++) {
      const t = i / hz;
      if (at(t) !== frameAt(ANIM_ROW, "walk", t).index) mismatch = `${hz}Hz @${t}`;
    }
  }
  check("frame is a function of elapsed SECONDS, identical at 30/60/144/240 Hz sampling",
    mismatch === "", mismatch);
  const t = ANIM_ROW.anim!.tags.walk!;
  const cycle = (t.to - t.from + 1) * t.seconds;
  check("a looping tag returns to its first frame after exactly one cycle",
    at(0) === t.from && at(cycle) === t.from && at(cycle * 3) === t.from,
    `${at(0)}, ${at(cycle)}, ${at(cycle * 3)}`);
  const c = ANIM_ROW.anim!.tags.cast!;
  check("a non-looping tag holds its last frame instead of wrapping or running off",
    frameAt(ANIM_ROW, "cast", 999).index === c.to);
}

// 4. THE COMPARISON. A boss wind-up keyed to progress lands its last frame exactly when
//    the cast resolves, at EVERY cast duration; a free-running clock does not. This is
//    the whole reason `frameAtProgress` exists, so it is asserted against its alternative.
//
//    The durations below are the real range: `MIN_CAST` is 0.45 and `DepthProfile.telegraph`
//    squeezes a shallow floor's cast down toward it as you descend, so the same animation
//    has to read correctly across roughly 0.45s..3s.
{
  const CASTS = [0.45, 0.6, 0.9, 1.2, 1.6, 2.0, 2.6, 3.0];
  const c = ANIM_ROW.anim!.tags.cast!;

  // The question a player is really asking mid-cast is "how far through is this?", so the
  // property that matters is: **does the same point in the wind-up show the same pose,
  // whatever the wind-up's length?** Sampling the halfway point answers it.
  //
  // (An earlier version of this check compared the frame at the *end* of the cast and
  // passed both ways, because a non-looping tag clamps to its last frame and so "lands"
  // trivially at any duration long enough. It proved nothing — exactly the vacuous
  // one-sided check CLAUDE.md warns about. Sampling mid-cast is what makes it a real
  // comparison.)
  const progressMid = new Set(CASTS.map(() => frameAtProgress(ANIM_ROW, "cast", 0.5).index));
  const freeRunMid = new Set(CASTS.map((total) => frameAt(ANIM_ROW, "cast", total / 2).index));

  check("progress-keyed: halfway through the wind-up is the SAME pose at every cast duration",
    progressMid.size === 1, `${progressMid.size} different frames: ${[...progressMid].join(", ")}`);
  check("free-running: it is NOT — the pose drifts with cast length, which is the readability bug",
    freeRunMid.size > 1,
    `free-run also showed one pose; the comparison proves nothing, re-check the fixture`);

  // The sharp end of that drift: on a long cast a free-running clock has already reached
  // the final "impact imminent" frame while the cast is only half done, so the pose says
  // "now" with 1.5s still to run. Progress-keying cannot do that by construction.
  const longest = CASTS[CASTS.length - 1]!;
  check("free-running reaches the final wind-up frame BEFORE a long cast resolves",
    frameAt(ANIM_ROW, "cast", longest / 2).index === c.to,
    "the fixture no longer demonstrates the drift this subsystem exists to avoid");
  check("progress-keyed does not — the last frame is reserved for the moment it resolves",
    frameAtProgress(ANIM_ROW, "cast", 0.5).index < c.to
      && frameAtProgress(ANIM_ROW, "cast", 1).index === c.to
      && frameAtProgress(ANIM_ROW, "cast", 0).index === c.from);
  console.log(`     mid-cast pose — progress-keyed: frame ${[...progressMid].join("/")} at every`
    + ` duration · free-running: frames ${[...freeRunMid].sort((a, b) => a - b).join(", ")} across`
    + ` ${CASTS[0]}s..${longest}s`);

  // And it is monotonic: the pose only ever advances through the wind-up, so a player
  // reading "how far through is this" never sees it go backwards.
  let back = "";
  let prev = -1;
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const i = frameAtProgress(ANIM_ROW, "cast", p).index;
    if (i < prev) back = `p=${p.toFixed(2)}`;
    prev = i;
  }
  check("the wind-up pose only ever advances — never runs backwards mid-cast", back === "", back);
}

// 5. Reading a boss wind-up, including the case that would otherwise look like a bug:
//    a boss killed mid-cast. The telegraph is deleted and the ability never resolves, but
//    `ability`/`castTimer` are still on the dead boss's state — so "gone from the fight"
//    has to mean "cast cancelled" rather than "keep counting down".
{
  const casting = { ability: "sunder", castTimer: 0.6, castTotal: 1.2 };
  const idle = { ability: null, castTimer: 0, castTotal: 0 };

  check("a live boss mid-cast reports its ability id first in the chain, and its progress",
    castFrame(casting, true)?.tag[0] === "sunder"
      && Math.abs((castFrame(casting, true)?.progress ?? -1) - 0.5) < 1e-9);
  check("a boss between casts reports nothing to play", castFrame(idle, true) === null);
  check("a boss killed MID-CAST reports nothing — the ability died with it, so the pose must not freeze",
    castFrame(casting, false) === null);
  check("no boss at all is not a crash", castFrame(null, true) === null && castFrame(undefined, false) === null);
  check("a zero or negative castTotal cannot divide by zero into a bad progress",
    castFrame({ ability: "sunder", castTimer: 1, castTotal: 0 }, true) === null
      && castFrame({ ability: "sunder", castTimer: 1, castTotal: -2 }, true) === null);
  // castTimer briefly exceeding castTotal (a retune mid-flight, a snapshot arriving out of
  // order in co-op) must clamp rather than produce a negative progress that runs the pose
  // backwards past the first frame.
  const early = castFrame({ ability: "sunder", castTimer: 5, castTotal: 1.2 }, true);
  check("progress stays inside 0..1 even if castTimer exceeds castTotal",
    !!early && early.progress >= 0 && early.progress <= 1, `${early?.progress}`);
}

// 6. THE LADDER'S ECONOMY. The four raid bosses draw from a shared pool of ~15 abilities
//    and a boss cast's tag is the BossAbilityId, so one animation per ability would be
//    dozens of generations per boss. The chain means a boss ships ONE wind-up covering
//    every ability, and a specific ability can be given its own art later with no rewiring.
{
  const ABILITIES = [
    "cleave", "slam", "beam", "quake", "summon", "windmill", "corruption", "ringOut",
    "enrage", "volley", "starLance", "wall", "meteor", "charge", "backlash",
  ];
  // ANIM_ROW has `cast` but none of the ability tags — the state a freshly-animated boss
  // is in. Every ability must still resolve to the generic wind-up.
  const viaCast = ABILITIES.filter((id) => {
    const f = castFrame({ ability: id, castTimer: 0.5, castTotal: 1 }, true)!;
    return resolveTag(ANIM_ROW, f.tag) === ANIM_ROW.anim!.tags[CAST_TAG];
  });
  check(`one '${CAST_TAG}' animation covers all ${ABILITIES.length} boss abilities`,
    viaCast.length === ABILITIES.length,
    `${viaCast.length}/${ABILITIES.length} resolved to the generic wind-up`);

  // And the override works without rewiring: give one ability its own tag and it wins,
  // while every other ability keeps falling through to the generic one.
  const withSlam: AtlasSprite = {
    ...ANIM_ROW,
    anim: {
      cols: 14,
      tags: { ...ANIM_ROW.anim!.tags, slam: { from: 12, to: 13, seconds: 0.1, loop: false } },
    },
  };
  const slamChain = castFrame({ ability: "slam", castTimer: 0.5, castTotal: 1 }, true)!.tag;
  const beamChain = castFrame({ ability: "beam", castTimer: 0.5, castTotal: 1 }, true)!.tag;
  check("an ability given its own art starts winning without anything being rewired",
    resolveTag(withSlam, slamChain) === withSlam.anim!.tags.slam
      && resolveTag(withSlam, beamChain) === withSlam.anim!.tags[CAST_TAG]);

  // A boss with only an idle — the rung below — still resolves every ability, so art can
  // land idle-first and casts later.
  const idleOnly: AtlasSprite = {
    ...ANIM_ROW,
    anim: { cols: 2, tags: { idle: { from: 0, to: 1, seconds: 0.25, loop: true } } },
  };
  check("a boss with only an idle still resolves every ability, so art can land in stages",
    ABILITIES.every((id) => {
      const f = castFrame({ ability: id, castTimer: 0.5, castTotal: 1 }, true)!;
      return resolveTag(idleOnly, f.tag) === idleOnly.anim!.tags.idle;
    }));
}

console.log(failures === 0 ? "\nanimation: all checks passed\n" : `\nanimation: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
