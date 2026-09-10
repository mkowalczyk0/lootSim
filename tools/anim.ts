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
import {
  ATLAS, ATLAS_COSMETICS, CLASS_HEROES, MONSTER_SETS,
  SPRITE_OVERRIDES, cosmeticStageXY, heroStage, type AtlasSprite,
} from "../src/render/atlas/manifest";
import { CLASS_IDS } from "../src/data/classes";
import { chooseHeroArt, chooseSpriteArt } from "../src/render/spriteart";
import {
  CAST_TAG, FALLBACK_TAG, STATIC_FRAME, castFrame, frameAt, frameAtProgress, frameRect,
  fitsManifest, resolveTag, stripWidth, STRIKE_TAG, StrikeLatch,
} from "../src/render/anim";

let failures = 0;
function check(what: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${detail && !ok ? ` — ${detail}` : ""}`);
}

/** Mirrors the directory layout `render/atlas/index.ts` globs and smoke.ts walks. */
function dirFor(id: string): string {
  if (id.startsWith("boss.") || id.startsWith("tower.boss.")) return "bosses";
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

// The frames tile the strip exactly. `render/sprites.ts` cuts a frame out with this rect,
// so a rect that ran past the PNG would silently draw transparent pixels — a boss that
// vanishes for part of its own animation rather than an error anyone would notice.
for (const meta of animated) {
  const rects = Array.from({ length: meta.anim!.cols }, (_, i) =>
    frameRect(meta, { index: i, cols: meta.anim!.cols }));
  const tiles = rects.every((r, i) =>
    r.sx === i * meta.w && r.sy === 0 && r.sw === meta.w && r.sh === meta.h);
  const last = rects[rects.length - 1]!;
  check(`${meta.id}: the ${meta.anim!.cols} frame rects tile the strip exactly`,
    tiles && last.sx + last.sw === stripWidth(meta),
    `last rect ends at ${last.sx + last.sw}, strip is ${stripWidth(meta)}`);
}

// --- the loader accepts what the manifest describes ------------------------
//
// **This is the check whose absence shipped the bug, and it is not about animation — it
// is about the SIZE CONTRACT the loader enforces.** `atlas/index.ts` rejects a decoded
// image whose dimensions disagree with the manifest, which is right: a silent size drift
// puts every hitbox in that sprite's world footprint slightly wrong. But it measured the
// file against `spr.w`, and for an animated row `w` is ONE FRAME by design. So the first
// three animated bosses (375x107 and 490x108 against a manifest reading 75 and 98) were
// rejected on every boot, permanently, and fell back to their ~26px procedural bakes.
//
// Nothing was red. The block above checked the PNG against `stripWidth` and passed; the
// loader checked it against `spr.w` and failed; no check compared the loader to either.
// That is the blind-instrument rule in CLAUDE.md from the other side — the gate ran, and
// it was measuring a different thing from the one that breaks.
//
// So this runs over EVERY `ATLAS` row, animated or not, and asserts the committed PNG is
// exactly the size `loadAtlas` will accept. Both sides now read `stripWidth`, which is
// what makes this one contract rather than two that happen to agree today.
console.log("\nanimation — the size contract loadAtlas enforces\n");
{
  let checked = 0, worst = "";
  for (const meta of Object.values(ATLAS)) {
    let png: { width: number; height: number } | null = null;
    try { png = decodePng(readFileSync(`src/render/atlas/${dirFor(meta.id)}/${meta.id}.png`)); }
    catch { /* smoke.ts owns "is it committed at all"; this owns "is it the right size" */ }
    if (!png) continue;
    checked++;
    // `fitsManifest` — the literal call `loadAtlas` makes on the decoded image — rather
    // than a comparison of our own, so this cannot drift away from the loader again.
    if (!fitsManifest(meta, png.width, png.height)) {
      // Reported from the row rather than from `stripWidth`, so the message stays true
      // even when it is the contract itself that has been broken.
      worst = `loadAtlas refuses ${meta.id}: file is ${png.width}x${png.height}, `
        + `row is w=${meta.w} h=${meta.h} cols=${meta.anim?.cols ?? 1}`;
    }
  }
  check(`every committed ATLAS PNG (${checked}) is the size loadAtlas will accept`,
    worst === "", worst);
}

// --- a scale and a canvas are one decision ---------------------------------
//
// The second half of the same incident. `spriteAt` fell back to the procedural grid when
// a PNG was not loaded; `spriteWorldScale` read `ATLAS[id].worldScale` with no load check
// at all. `drawEnemy` took one from each, so a boss whose PNG had not landed drew a ~26px
// grid at a scale tuned for 75px art — about a third size, in the old low-detail style,
// with no frames. Fixing the loader hides that hazard again rather than removing it, and
// it would come back the next time a PNG grew, so `render/spriteart.ts` now makes the
// mismatch inexpressible: `worldScale` is non-null exactly when `atlasId` is.
//
// Asserted against a HOSTILE load predicate rather than against whatever is committed:
// "nothing loaded" is precisely the state the browser was in, and it is a state no
// headless run reaches by accident.
console.log("\nanimation — a scale and a canvas come from one decision\n");
{
  const names = [
    ...Object.keys(SPRITE_OVERRIDES),
    ...Object.values(MONSTER_SETS).flatMap((set) => Object.keys(set)),
  ];
  const sets = [undefined, ...Object.keys(MONSTER_SETS)];

  // The load state a caller can be in, including the two that actually bit: nothing
  // decoded yet, and every id declared but only some decoded.
  const worlds: [string, (id: string) => boolean][] = [
    ["nothing loaded", () => false],
    ["everything loaded", () => true],
    ["only non-boss art loaded", (id) => !id.startsWith("boss.") && !id.startsWith("tower.boss.")],
    ["only the sets' own art loaded", (id) => id.includes(".monster.")],
  ];

  let broken = "";
  let procedural = 0, atlas = 0;
  for (const [world, loaded] of worlds) {
    for (const name of names) {
      for (const set of sets) {
        const art = chooseSpriteArt(name, set, loaded);
        // The biconditional. Either every atlas-derived field is present, or none is.
        const all = art.atlasId !== null && art.meta !== undefined
          && art.worldScale !== null && art.feet !== null;
        const none = art.atlasId === null && art.meta === undefined
          && art.worldScale === null && art.feet === null;
        if (!(all || none)) broken ||= `${world}: ${name}/${set ?? "-"} is half-resolved`;
        // And it never names art the predicate says is not there — the failure that put a
        // procedural canvas under an atlas scale in the first place.
        if (art.atlasId !== null && !loaded(art.atlasId)) {
          broken ||= `${world}: ${name}/${set ?? "-"} named unloaded ${art.atlasId}`;
        }
        if (art.atlasId === null) procedural++; else atlas++;
      }
    }
  }
  check("a resolved sprite is all-atlas or all-procedural, never half of each", broken === "", broken);
  // Power, not a bound: a check that only ever saw loaded art would pass without
  // exercising the fallback that broke, so say out loud that both sides were reached.
  check(`both rungs were actually exercised (${atlas} atlas, ${procedural} procedural)`,
    atlas > 0 && procedural > 0, `${atlas}/${procedural}`);

  // The ladder itself: a realm's set wins over the game-wide default, and a set that is
  // named but undrawn falls through rather than blanking the monster.
  const drawn = (id: string) => !!ATLAS[id];
  // Every real set is drawn today (reliquary, delve and tower all shipped their five), so
  // there is no live "named but undrawn" example left to call `chooseSpriteArt` against —
  // asserting this against `MONSTER_SETS.tower` the way this check used to would now be
  // asserting a fact about the art backlog, and the day the backlog empties out this
  // silently stops testing the fallback branch at all. Simulate it instead: the real
  // `drawn` predicate for everything, except one specific id (still a real, declared
  // `tower` entry) pretended unloaded — the exact branch a genuinely undrawn set would
  // hit, as a property of the resolver rather than an accident of what's still unpainted.
  const towerGruntId = MONSTER_SETS.tower!.grunt!;
  const pretendTowerUndrawn = (id: string) => id !== towerGruntId && drawn(id);
  const towerGrunt = chooseSpriteArt("grunt", "tower", pretendTowerUndrawn);
  check("a named-but-undrawn set falls through to the game-wide default, not to nothing",
    towerGrunt.atlasId === SPRITE_OVERRIDES.grunt, `${towerGrunt.atlasId}`);
  // And a set entry that IS drawn is the one that resolves. Today every committed set
  // names the same ids as `SPRITE_OVERRIDES` (the Delve and the Reliquary share one
  // roster on purpose), so this coincides with the default rather than diverging from it
  // — it starts biting the day the Tower's PNGs land, which is exactly when it should.
  let wrongSet = "";
  for (const [setName, entries] of Object.entries(MONSTER_SETS)) {
    for (const [name, id] of Object.entries(entries)) {
      if (!ATLAS[id]) continue;
      const got = chooseSpriteArt(name, setName, drawn);
      if (got.atlasId !== id) wrongSet ||= `${setName}/${name} resolved ${got.atlasId}, not ${id}`;
    }
  }
  check("a drawn set entry is the one that resolves, ahead of the game-wide default",
    wrongSet === "", wrongSet);
}

// --- one hero per class, and the ladder under it ---------------------------
//
// The same fallback shape as `MONSTER_SETS`, for the same reason: 21 class heroes are
// coming and the roster has to be nameable before it is drawn. Checked here rather than
// in a tool of its own because it is the same `firstDrawn` ladder `chooseSpriteArt` walks.
console.log("\nheroes — a class's own sprite, then the base, then the bake\n");
{
  const base = SPRITE_OVERRIDES.hero!;
  const drawn = (id: string) => !!ATLAS[id];

  check(`every class has a CLASS_HEROES answer (${CLASS_IDS.length} classes)`,
    CLASS_IDS.every((id) => id in CLASS_HEROES),
    CLASS_IDS.filter((id) => !(id in CLASS_HEROES)).join(", "));

  // Undeclared and declared-but-undrawn are different states that must reach the same
  // place: the base. Neither may resolve to nothing, and neither may throw.
  let bad = "";
  for (const id of CLASS_IDS) {
    const got = chooseHeroArt(id, drawn);
    if (got.atlasId !== (CLASS_HEROES[id] && ATLAS[CLASS_HEROES[id]!] ? CLASS_HEROES[id] : base)) {
      bad ||= `${id} resolved ${got.atlasId}`;
    }
  }
  check("a class with no art of its own draws the base, never nothing", bad === "", bad);
  check("an unknown or missing class draws the base too",
    chooseHeroArt(undefined, drawn).atlasId === base);
  check("with nothing loaded at all, a class hero falls to the procedural bake",
    chooseHeroArt(CLASS_IDS[0], () => false).atlasId === null
      && chooseHeroArt(CLASS_IDS[0], () => false).worldScale === null);

  // The "a declared class hero wins" rung is NOT asserted here, deliberately: no class has
  // art yet, so any check of it would pass vacuously — and this repo has already paid for
  // a green check that proved nothing. It is covered where it can actually bite:
  // `chooseHeroArt` and `chooseSpriteArt` share one `firstDrawn`, and the monster-set
  // block above asserts precedence on that same function against real committed art.
  const declared = Object.entries(CLASS_HEROES).filter(([, v]) => v !== null);
  console.log(`  --    ${declared.length} of ${CLASS_IDS.length} classes declare their own hero id`
    + (declared.length === 0 ? " — none drawn yet, every class is on the base" : ""));

  // --- the stage places a hero of ANY height, and the anchors are a no-op for this one ---
  const heroMeta = ATLAS[base]!;
  const at = heroStage(heroMeta.w, heroMeta.h);
  check("the hero is centred on its stage and stands on the floor",
    at.dx === Math.round((at.w - heroMeta.w) / 2) && at.dy + heroMeta.h === at.h,
    `${at.dx},${at.dy} in ${at.w}x${at.h}`);

  // The stage now FOLLOWS the hero, so the four numbers that used to be hardcoded have to
  // come back out of the derivation unchanged for the sprite they were tuned against.
  // Asserted as an identity, not trusted: this is the whole claim that the rewrite moved
  // nothing that shipped.
  const v4 = heroStage(39, 57);
  check("the derivation reproduces the old fixed stage exactly for the 39x57 hero",
    v4.w === 79 && v4.h === 81 && v4.dx === 20 && v4.dy === 24,
    `${v4.w}x${v4.h} at ${v4.dx},${v4.dy} — want 79x81 at 20,24`);

  // What the anchors are FOR: a layer's offset from the landmark it hangs on must not
  // depend on how tall the hero is. This replaces a pin that replayed the v4-era absolute
  // positions against a 39x57 hero to prove the absolute->anchored rewrite was neutral.
  // That pin has outlived its subject twice over — the v4 hero is gone, and the layers
  // themselves have since been re-authored for the 16x41 hero — so it was asserting that
  // today's art lands where a dead body's art used to. This asserts the mechanism instead,
  // which is the part that can still regress.
  let drifted = "";
  for (const [k, c] of Object.entries(ATLAS_COSMETICS)) {
    for (const h of [24, 41, 57, 87]) {
      const stage = heroStage(16, h);
      const got = cosmeticStageXY(c, 16, h);
      // head: measured down from the top of the head. feet: measured up from the ground.
      const offset = c.anchor === "head" ? got.dy - stage.dy : got.dy - stage.h;
      if (offset !== c.dy) { drifted ||= `${k} at hero height ${h}: offset ${offset} != ${c.dy}`; break; }
    }
  }
  check("a layer's offset from its anchor is the same at every hero height",
    drifted === "", drifted);

  // And the anchors point at the right landmarks on the hero actually shipped: a hat sits
  // on the head rather than in the air above it, and a cape reaches the ground.
  let misplaced = "";
  for (const [k, c] of Object.entries(ATLAS_COSMETICS)) {
    const got = cosmeticStageXY(c, heroMeta.w, heroMeta.h);
    const headBottom = at.dy + Math.round(heroMeta.h * 0.35);   // generous head band
    // A head layer rests ON the head — unless it declares that it floats, which exactly one
    // does (a halo). A declared floater is still bounded to near the head, so a genuinely
    // misplaced layer cannot hide behind the flag.
    const FLOAT_LIMIT = Math.round(heroMeta.h * 0.35);
    if (c.anchor === "head" && got.dy + c.h < at.dy) {
      if (!c.floats) misplaced ||= `${k} floats entirely above the head`;
      else if (at.dy - (got.dy + c.h) > FLOAT_LIMIT)
        misplaced ||= `${k} declares floats but is ${at.dy - (got.dy + c.h)}px clear of the head, over ${FLOAT_LIMIT}`;
    }
    if (c.anchor === "head" && got.dy > headBottom)
      misplaced ||= `${k} hangs below the head band`;
    if (c.anchor === "feet" && got.dy + c.h < at.dy + Math.round(heroMeta.h * 0.5))
      misplaced ||= `${k} never reaches the lower half of the body`;
  }
  check("every layer lands on the landmark it claims to hang from", misplaced === "", misplaced);
  // Both loops above are filters over `ATLAS_COSMETICS`, so both would pass an empty
  // table. Say out loud how many layers they actually walked.
  check("the anchor checks had layers to walk", Object.keys(ATLAS_COSMETICS).length > 0,
    `${Object.keys(ATLAS_COSMETICS).length} migrated layers`);

  // And it degrades rather than breaking for a hero of a different height: head-anchored
  // layers follow the head, feet-anchored ones do not move, and nothing lands off-canvas
  // in a way that would clip a layer out of existence entirely.
  let vanished = "";
  for (const h of [16, 41, 43, 57, 80, 105, 155]) {
    const stage = heroStage(16, h);
    for (const [k, c] of Object.entries(ATLAS_COSMETICS)) {
      const got = cosmeticStageXY(c, 16, h);
      if (c.anchor === "head" && got.dy !== stage.dy + c.dy) vanished ||= `${k}@${h} did not follow the head`;
      if (c.anchor === "feet" && got.dy !== stage.h + c.dy) vanished ||= `${k}@${h} moved off the floor`;
      // Parked cosmetics still RENDER. A layer may sit wrong on a hero it was not authored
      // for; it may not fall off the canvas or be cropped out of existence.
      if (got.dy < 0 || got.dy + c.h > stage.h) vanished ||= `${k}@${h} is cropped vertically`;
      if (got.dx < 0 || got.dx + c.w > stage.w) vanished ||= `${k}@${h} is cropped horizontally`;
    }
  }
  check("no cosmetic is cropped off the stage, for hero heights 16..155", vanished === "", vanished);
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


// --- the strike latch: drawing the release after the sim has forgotten ---------------
//
// The wind-up is a reading of live simulation state; the strike cannot be, because
// `resolveAbility` clears `boss.ability` the instant the ability lands. So `render/` keeps
// its own memory of the cast-ended edge. These check the rules that memory has to follow —
// especially the first one, which is the only one that touches art already shipped.
{
  console.log("\nanimation — the strike latch\n");

  /** A boss that HAS a release: six frames of it at 0.1s, so 0.6s long. */
  const WITH_STRIKE: AtlasSprite = {
    ...ANIM_ROW,
    anim: {
      cols: 18,
      tags: {
        ...ANIM_ROW.anim!.tags,
        [STRIKE_TAG]: { from: 12, to: 17, seconds: 0.1, loop: false },
      },
    },
  };
  const casting = (id: string) => ({ ability: id, castTimer: 0.5, castTotal: 1 });
  const idleState = { ability: null, castTimer: 0, castTotal: 0 };

  // THE ONE THAT MATTERS FOR SHIPPED ART. Every boss in the game today has no `strike` tag,
  // and `resolveTag` falls through to `idle` — so a naive reader would play a boss's own
  // breathing as a flourish after every cast. It must return nothing instead, which is what
  // makes adding the strike a superset rather than a change to art nobody asked to change.
  {
    const l = new StrikeLatch(), e = {};
    l.read(e, ANIM_ROW, casting("volley"), true, 0);
    check("a boss with NO strike art plays nothing after a cast — shipped bosses are untouched",
      l.read(e, ANIM_ROW, idleState, true, 1) === null);
  }

  // Priority: cast > strike > idle. While the wind-up runs, the latch yields.
  {
    const l = new StrikeLatch(), e = {};
    check("nothing plays while the wind-up is still running — the telegraph owns the sprite",
      l.read(e, WITH_STRIKE, casting("volley"), true, 0) === null);
  }

  // The edge itself, and that it names the ability that just landed.
  {
    const l = new StrikeLatch(), e = {};
    l.read(e, WITH_STRIKE, casting("slam"), true, 0);
    const f = l.read(e, WITH_STRIKE, idleState, true, 1);
    check("a cast that ends on a live boss starts the release", !!f);
    check("the release names the ability that landed, then the generic tag",
      !!f && f.tag[0] === "slam" && f.tag[1] === STRIKE_TAG,
      f ? f.tag.join(",") : "null");
    check("the release starts at its first frame",
      !!f && frameAt(WITH_STRIKE, f.tag, f.elapsed).index === 12);
  }

  // A boss killed through its wind-up: the ability never resolved, so there is nothing to
  // follow through on. Same rule `castFrame` already follows for the same reason.
  {
    const l = new StrikeLatch(), e = {};
    l.read(e, WITH_STRIKE, casting("slam"), true, 0);
    check("a boss killed MID-CAST plays no release — the ability never happened",
      l.read(e, WITH_STRIKE, idleState, false, 1) === null);
  }

  // It ends. A latch that never expired would pin a boss in its follow-through forever.
  {
    const l = new StrikeLatch(), e = {};
    l.read(e, WITH_STRIKE, casting("slam"), true, 0);
    l.read(e, WITH_STRIKE, idleState, true, 1);
    check("the release is still playing part-way through", !!l.read(e, WITH_STRIKE, idleState, true, 1.3));
    check("the release ends after its own length and idle takes back over",
      l.read(e, WITH_STRIKE, idleState, true, 1.6) === null);
  }

  // The interruption rule, in the direction that matters: a boss hasted enough to start its
  // next wind-up mid-flourish abandons the flourish. Never a queue, never a delay.
  {
    const l = new StrikeLatch(), e = {};
    l.read(e, WITH_STRIKE, casting("slam"), true, 0);
    l.read(e, WITH_STRIKE, idleState, true, 1);
    check("a new wind-up interrupts the release outright",
      l.read(e, WITH_STRIKE, casting("volley"), true, 1.2) === null);
    const after = l.read(e, WITH_STRIKE, idleState, true, 1.4);
    check("and the release that follows belongs to the NEW ability, not the abandoned one",
      !!after && after.tag[0] === "volley", after ? after.tag[0]! : "null");
  }

  // Two bosses on one floor must not share a latch — and the WeakMap keys on the entity
  // object precisely so a second floor's boss cannot inherit this one's either.
  {
    const l = new StrikeLatch(), a = {}, b = {};
    l.read(a, WITH_STRIKE, casting("slam"), true, 0);
    l.read(b, WITH_STRIKE, idleState, true, 0);
    check("one boss's release is not another's", l.read(b, WITH_STRIKE, idleState, true, 1) === null);
    check("while its own still plays", !!l.read(a, WITH_STRIKE, idleState, true, 1));
  }

  // A boss that never cast at all — the ordinary case for every non-boss monster on screen.
  {
    const l = new StrikeLatch();
    check("an entity that has never cast plays no release", l.read({}, WITH_STRIKE, null, true, 5) === null);
  }
}

console.log(failures === 0 ? "\nanimation: all checks passed\n" : `\nanimation: ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
