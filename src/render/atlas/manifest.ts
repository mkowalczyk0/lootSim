import type { ClassId } from "../../data/classes";

/**
 * The atlas manifest — one row per pipeline-authored sprite (Aseprite / PixelLab PNGs
 * under `src/render/atlas/`), describing how it sits in the world.
 *
 * This module is **pure** (no DOM), like `render/pixels.ts` next to it: the headless
 * tools and the smoke test can read a sprite's dimensions and world scale without
 * decoding a PNG. The actual pixel load — PNG → `HTMLCanvasElement` — lives in
 * `render/atlas/index.ts`, which needs a document.
 *
 * ## Why `worldScale` lives here and not in `draw.ts`
 *
 * The legacy procedural sprites are drawn through one global `SPRITE_SCALE` (1.2) and the
 * boss `spriteScale` table. Pipeline art is authored at a **much higher resolution** —
 * the owner's call after seeing PixelLab output downscaled into a ~20px grid vs. left
 * near its native size (see memory `lootsim-art-direction-and-cosmetics`). So each atlas
 * sprite carries its **own** world-units-per-art-pixel factor, chosen to land the sprite
 * on the exact same world footprint its procedural predecessor had — the simulation's
 * hitboxes, telegraph radii and camera framing do not move. Raising art resolution buys
 * clarity, nothing else.
 */

/**
 * One named span of frames inside a sprite's strip — a "tag", in the Aseprite sense.
 *
 * **Durations are in seconds, never in frames or ticks.** The sim runs at a fixed 60 Hz
 * but rendering does not, and two players on 60 Hz and 144 Hz monitors have to see the
 * same animation play at the same speed. A frame count would make animation speed a
 * property of the viewer's hardware.
 */
export interface AnimTag {
  /** First frame index of the span, inclusive. */
  readonly from: number;
  /** Last frame index of the span, inclusive. `from === to` is a legal one-frame tag. */
  readonly to: number;
  /** Seconds each frame is held. Must be > 0 — `npm run anim` refuses 0. */
  readonly seconds: number;
  /** Loop forever, or hold the last frame once the span has played through. */
  readonly loop: boolean;
}

/**
 * The animation table for a sprite whose PNG is a horizontal strip of frames.
 *
 * A sprite's `w`/`h` stay the size of **one frame**, so every existing consumer of a row
 * — world scale, feet, the portrait sizing, the density tools — keeps reading the same
 * numbers it always did. The strip's own width is `w * cols`, which is what `npm run anim`
 * checks the PNG against.
 */
export interface AtlasAnim {
  /** Frames across the strip. */
  readonly cols: number;
  /** Named spans. `idle` is the conventional fallback — see `render/anim.ts`. */
  readonly tags: Readonly<Record<string, AnimTag>>;
}

/**
 * One hot accent a sprite **declares** — the art style guide's §1.4 "the part of it that
 * is looking at you", named so a failure can say which one went out.
 *
 * ## Declared, never inferred
 *
 * `npm run chroma` derives a sprite's accent from its own pixels (the loudest colour
 * covering 2+ pixels) and that is right for the overwhelming majority of the cast: one
 * bright feature on one dirty body. **A sprite that declares nothing is a one-accent
 * sprite, full stop** — the gate's behaviour on it is exactly what it always was, and
 * there is deliberately no auto-detection of "how many accents does this sprite seem to
 * have". A derived classifier of that kind has silently under-covered three times in this
 * repo (CLAUDE.md's fourth lesson: the bound, the scope and the subject must all come
 * from outside the thing under test).
 *
 * Declaring is therefore an act of authorship, and it **buys strictness rather than
 * slack**: every declared accent must survive above the bar in every frame independently,
 * where the derived check can only ever track whichever one happens to be loudest. See
 * `tools/chroma.ts` §5 and docs/animation.md "A sprite with two accents".
 *
 * Nothing in the simulation or the renderer reads this — it is art metadata for the gate,
 * the same way `data/cosmetics.ts` is powerless.
 */
export interface SpriteAccent {
  /** What it is, for the gate's output: "gold halo", "violet eyes". */
  readonly name: string;
  /**
   * Hue in degrees, 0-360. The bar is hue and not a hex value on purpose: an accent is
   * allowed to pulse in brightness across a cycle (good art), and it is the *hue* jumping
   * that says it was replaced by an unrelated part of the sprite rather than dimmed.
   */
  readonly hue: number;
}

export interface AtlasSprite {
  /** File id: the PNG basename without extension, e.g. `boss.corrupted-saint`. */
  readonly id: string;
  /** Authored pixel size. Must match the PNG on disk — the smoke test checks the wiring. */
  readonly w: number;
  readonly h: number;
  /**
   * World units per authored pixel. Tuned so the drawn sprite occupies the same world
   * height its procedural predecessor did at `SPRITE_SCALE` / `spriteScale`.
   */
  readonly worldScale: number;
  /**
   * Fraction of the sprite's height that sits **below** the feet anchor (the shadow
   * line). Procedural grids bake this as ~0.22 of empty space; a tightly-trimmed PNG
   * stands on its own bottom row, so this is near zero — a hair of sink so it doesn't
   * read as hovering.
   */
  readonly feet: number;
  /**
   * Optional. Absent means this sprite is a single static frame and behaves exactly as it
   * did before animation existed — this field is a **superset, not a migration**, and a
   * row that never gains one is not a row that is behind.
   */
  readonly anim?: AtlasAnim;
  /**
   * Optional. Absent means **one** accent, derived from the sprite's own pixels exactly as
   * it always was. Present means this sprite carries more than one bright feature and
   * `npm run chroma` must hold **every** one of them above the bar in **every** frame —
   * see `SpriteAccent` above.
   */
  readonly accents?: readonly SpriteAccent[];
}

/**
 * Every pipeline sprite. Keyed by file id. `w`/`h` are the trimmed PNG's real size; if
 * you re-export a sprite at a new size, update the row (and re-check `worldScale`).
 */
export const ATLAS: Record<string, AtlasSprite> = {
  // §9 The Legends — the plain, calm base adventurer. Replaces the composed procedural
  // character (30×26 grid at SPRITE_SCALE 1.2 ≈ 31 world units tall). A worn cosmetic no
  // longer forces the whole character back to the procedural stack by itself — see
  // `ATLAS_COSMETICS` below and `composePipelineHero` in `render/sprites.ts` — only a
  // still-unmigrated cosmetic in the hat/ears/face/back slots does that now.
  //
  // v4 redraw (Sept 2026): playtest feedback on v3 was that the hero was "really hard to
  // look at and ugly, didn't really fit in with the game". Three defects, all in the art:
  // (1) he carried five competing hues — navy cloak, near-white chest plate, brown boots,
  // gold buckle, pink skin — with no dominant mass, so the silhouette broke into stripes
  // while every monster and boss is one low dirty colour; (2) that near-white plate was
  // the brightest thing in any frame, pulling the eye to his torso; (3) his eyes were two
  // flat saturated blue bars, i.e. a **hot accent on the hero**, which §1.4/§19 forbid
  // outright — it is the monsters' "this is looking at you" signal, worn by the one
  // character meant to be calm. At 28px wide the face was ~7px and could not hold
  // anything better.
  //
  // v4 answered all three: one unified charcoal/ash mass, no bright note anywhere, and a
  // plain calm face with small dark eyes. **It was still rejected** — "too realistic", and
  // it did not sit in the tilesets' visual language. The three defects above are the ones
  // that stay true whatever gets drawn next; the v4 sprite itself is history.
  //
  // **Shipped now: hero v6 candidate A ("cut the ink"), the owner's pick** — "the best of
  // the 3 — we'll probably revisit this again at some point — this is acceptable for now."
  // Lever: colour only. 40 colours down to 27, and the §1.4c head/body luminance gap closed
  // from 2.1x to 1.17x, so the head stops being the brightest, most colour-dense region.
  // Max accent chroma 35.3 (#e1a687, skin) — under every monster's, which `npm run chroma`
  // asserts one by one.
  //
  // **This is the BASE rung, not "the hero"** (see `CLASS_HEROES`): one hero per class is
  // coming, and this is what a class draws until it has its own. It is also explicitly
  // provisional — the owner has since asked for an iteration in the *boss art's* style.
  //
  // The world footprint does not move: `worldScale` is world units per authored pixel, so
  // 32/41 keeps the hero exactly 32 units tall as 39x57 at 0.5614 did. No hitbox, camera or
  // telegraph geometry is measured in art pixels, so none of them notice. `feet` stays 0.03
  // because the sliver it describes is `feet * h * worldScale` = `feet * 32` — invariant
  // under a height change.
  //
  // h is a *band*, not a maximum: the town portraits scale off the hero's ART-pixel height,
  // never off `worldScale`, and `portraitScale` rounds to a whole factor, so the Hero/Style
  // spread oscillates with height instead of growing. 41 is inside the lowest window. Don't
  // copy the window list into a comment — `npm run smoke` derives it and prints it next to
  // the portrait sizes, which is the copy that cannot go stale.
  "hero.legend-base": { id: "hero.legend-base", w: 16, h: 41, worldScale: 0.7805, feet: 0.03 },

  // --- monsters (§10) --- worldScale ≈ predecessor grid height × SPRITE_SCALE (1.2),
  // then ~1.13× for legibility (the rot-scuttler precedent). Legacy grids: imp/ranger
  // 22 tall, brute 24, crawler 13.
  "reliquary.monster.rot-imp":     { id: "reliquary.monster.rot-imp",     w: 16, h: 41, worldScale: 0.73, feet: 0.05 },
  "reliquary.monster.bone-archer": { id: "reliquary.monster.bone-archer", w: 26, h: 47, worldScale: 0.63, feet: 0.05 },
  "reliquary.monster.iron-brute":  { id: "reliquary.monster.iron-brute",  w: 34, h: 39, worldScale: 0.83, feet: 0.05 },
  "reliquary.monster.cult-caster": { id: "reliquary.monster.cult-caster", w: 22, h: 48, worldScale: 0.62, feet: 0.12 },
  // §8.2 The Rotting Garden — replaces `swarmer` (MOB_CRAWLER, 17×13 ≈ 15.6 world tall);
  // 24px × 0.72 ≈ 17.3, slightly bigger and far more legible.
  "reliquary.monster.rot-scuttler": { id: "reliquary.monster.rot-scuttler", w: 31, h: 24, worldScale: 0.72, feet: 0.06 },

  // The six UAT §2 roles that drew another role's silhouette until art-wave 2
  // (`docs/art-wave-2.md` §1a; `art/monsters/finish-delve.ts` prints these rows and the
  // per-sprite accent report). World heights are read off each role's `radius` in
  // `data/enemies.ts` against the five above — a charger at r10 is low-slung, a sniper at
  // r9 tall and still, a shieldbearer at r12 between grunt and brute. The rot priest floats,
  // so its `feet` sits up inside the hem like the cult caster's.
  //
  // The grave piper is OUT OF THE DENSITY BAND ON PURPOSE. `npm run inworld` reads it at
  // 5.4x the floor's 2.0 world units per art pixel against the roster's 3.9–4.5x; the
  // owner saw both this and a smaller in-band candidate
  // (`art/monsters/reliquary.monster.grave-piper.v5-candidate.raw.png`, 48x68) and ruled
  // to ship this one, because at the smaller size the egg-sac on its back disappears and
  // the sac is the whole reason it reads as a summoner rather than a generic skeleton.
  // Silhouette clarity beat the band. Do not "fix" the density here — regenerate a body
  // that keeps the sac at 64px if it ever bothers the owner's eye, and ask first.
  "reliquary.monster.gore-hound":   { id: "reliquary.monster.gore-hound",   w: 30, h: 54, worldScale: 0.4815, feet: 0.05 },
  "reliquary.monster.bloat-fiend":  { id: "reliquary.monster.bloat-fiend",  w: 38, h: 57, worldScale: 0.4912, feet: 0.05 },
  "reliquary.monster.aegis-thrall": { id: "reliquary.monster.aegis-thrall", w: 45, h: 70, worldScale: 0.4571, feet: 0.05 },
  "reliquary.monster.grave-piper":  { id: "reliquary.monster.grave-piper",  w: 43, h: 83, worldScale: 0.3735, feet: 0.05 }, // 5.4x — owner-approved, see above
  "reliquary.monster.deadeye":      { id: "reliquary.monster.deadeye",      w: 27, h: 66, worldScale: 0.5152, feet: 0.05 },
  "reliquary.monster.rot-priest":   { id: "reliquary.monster.rot-priest",   w: 36, h: 76, worldScale: 0.4474, feet: 0.12 },

  // The Tower (§6) — celestial silhouettes: symmetry, repetition, geometry, matched to the
  // Reliquary roster's own world heights rather than eyeballed (`art/monsters/finish-tower.ts`
  // prints these). Powers/Throne-Bearer generated with zero hot accent (a helm/mask of dark
  // hollow eyes, the exact Tyrant failure the style guide warns about) and got one painted
  // into the void; Virtue Lancer and Dominion Herald generated with 2-11x the shipped hot-
  // pixel ceiling (scattered trim, a whole gold robe front) and got muted down to it.
  // Halo Fragment shipped once, read as terrain (mean RGB next to `prop.rock`'s own) and was
  // rejected and regenerated — see the script header for that one and the measured
  // before/after on all five.
  "tower.monster.power":           { id: "tower.monster.power",           w: 27, h: 70, worldScale: 0.4286, feet: 0.05 },
  "tower.monster.virtue-lancer":   { id: "tower.monster.virtue-lancer",   w: 25, h: 69, worldScale: 0.4348, feet: 0.05 },
  "tower.monster.throne-bearer":   { id: "tower.monster.throne-bearer",   w: 46, h: 77, worldScale: 0.4156, feet: 0.05 },
  "tower.monster.dominion-herald": { id: "tower.monster.dominion-herald", w: 29, h: 70, worldScale: 0.4286, feet: 0.05 },
  "tower.monster.halo-fragment":   { id: "tower.monster.halo-fragment",   w: 25, h: 17, worldScale: 1,      feet: 0.05 },

  // --- bosses (§11) --- worldScale lands the art on the full old grid extent
  // (26 × spriteScale from data/bosses.ts): warden 100, choir 92, colossus 134,
  // herald 110, nameless 112. feet ≈ 0 — trimmed, standing on the bottom row.
  // Animated: `w`/`h` are ONE FRAME. The FIRST boss on either ladder to be animated —
  // every other animated sprite is a raid, so until this landed a player climbing the
  // Delve or the Tower had never seen a boss move (`npm run animcoverage`, and the
  // coverage section in docs/animation.md). The Warden is `BOSSES[0]`, the depth-5
  // encounter, so it is the first boss anybody fights and the one they fight most.
  //
  // `h` 124 against an 89px character and `worldScale` UNCHANGED — the padded-canvas
  // arrangement, see `boss.war-queen` before "fixing" it. The extra 35px are transparent
  // headroom the greatsword rises into. Measured unmoved to six decimals: top -96.689600
  // -> -96.689636, bottom 2.990400 -> 2.990364, left/right exactly 0.000000. `feet` is a
  // FRACTION of `h` and had to be re-derived (2.67px of ground offset over 124px, not 89).
  //
  // No STRIKE, and that is now a MEASURED conclusion rather than a staging decision.
  // The fallback ladder makes it a supported state: with no `strike`, `StrikeLatch` draws
  // nothing after a cast and the boss returns to idle exactly as it did before.
  //
  // Three generations, three prompt strategies, none usable — the generator will
  // interpolate and re-render this sprite but it will not POSE it, and every attempt that
  // achieved a strike's silhouette change did so by deforming the body. `boss.war-queen`
  // said a real blow "needs a hand-authored pose"; that now reproduces on a smaller,
  // simpler sprite, so it is a property of the tool rather than of that one boss. The
  // attempts are kept in art/anim/raw/warden-blow-attempts/ and the analysis is in
  // docs/animation.md "Stage B". **Do not spend a fourth generation re-prompting.**
  //
  // Two things for whoever authors it. The budget is unusually generous — the Warden's
  // fastest phase leaves 1.10-1.18s between casts at depths 5-9, against the Ferryman's
  // 0.60s release, so author to 1.10s and spend it on legibility. And check the impact
  // pose against rest as a VETO only: impact-vs-rest must exceed apex-vs-rest (1485 here)
  // or it reads as an unwind, but clearing that bar proves nothing — a deformed blob
  // scored 1735-1745 on it. Look at the frames.
  //
  // Its accent is FOUR pixels (`#33ffb8`, two 2-px eyes painted on by
  // art/bosses/warden-accent.py) — the same pixel count that makes
  // `boss.labyrinth-minotaur` a permanent hold. It survives generation anyway, at 80-90
  // chroma in every frame, and the reason is in docs/animation.md: thin accents fail when
  // they are also DIM, and this one has 2.3x headroom over the bar where the Minotaur had
  // 1.3x. It needed no `target-accent.py` rescue at all.
  "boss.warden":              { id: "boss.warden",              w: 57, h: 124, worldScale: 1.12, feet: 0.021532,
    anim: { cols: 10, tags: { idle: { from: 0, to: 4, seconds: 0.24, loop: true },
                              // Ends at its EXTREME, which took choosing rather than
                              // pinning: the pinned run overshot the target and settled
                              // back, so the tag is the run's own monotonic build
                              // (travel 279 -> 519 -> 861 -> 1342 -> 1485) and its
                              // drift frames are dropped. `seconds` is unread for a
                              // progress-keyed tag (see anim.ts#frameAtProgress).
                              cast: { from: 5, to: 9, seconds: 0.09, loop: false } } } },
  // Idle AND cast. Second-richest sprite in the borrow graph: 6 encounters, 5 of them
  // Provings (`npm run animcoverage`).
  //
  // **The Saint is the sprite that gave `accents` its reason to exist.** It carries TWO hot
  // accents — a gold halo (hue 40) and violet eyes (hue 277) — and they TRADE RANK: gold is
  // the loudest 2+px colour through the idle, violet through most of the wind-up as the
  // spell energy grows. The old one-accent gate read that swap as the accent having been
  // REPLACED (a ~125° jump against a 45° tolerance) and blocked the wind-up for a day, on
  // art where neither accent ever came close to going out. Both are declared below, and
  // both are now held above the bar independently in all twelve frames — measured
  // gold 63.9-74.9, violet 62.0-80.8, against the hero's 35.3. That is a STRICTER test than
  // the one it replaces, not a waiver: see `tools/chroma.ts` §5.
  //
  // The wind-up: the Saint raises both arms, the halo flares into a starburst and a violet
  // lance forms above it — a caster telegraph for a kit of volley/beam/starLance. Seed 7,
  // free-form from `art/anim/raw/saint-rest-pad.png`. As on the Warden, the open-ended run
  // peaked mid-sequence and drifted back (silhouette-vs-rest 11 24 30 30 61 70 65 60), so
  // the tag is the monotonic build and the two drift frames are dropped.
  //
  // `w`/`worldScale` are UNCHANGED and `h`/`feet` moved together: the wind-up was generated
  // on the 76x122 padded canvas, so the frame grew 92 -> 122px of transparent headroom.
  // `worldScale` is world units per PIXEL and stays put — recomputing it as
  // targetWorldHeight/h would silently shrink the Saint 25% — while `feet` is a FRACTION of
  // h and is re-derived (2.76px of ground offset, now over 122px) or he sinks into the
  // floor. `art/anim/strip.py` prints both; neither was typed by hand.
  //
  // One prompt lesson from the first idle attempt, which DID fail: asking the halo to
  // "pulse gently" dimmed it below the eyes on 3 of 5 frames. **On a sprite with more than
  // one bright feature, never ask the dominant accent to pulse, dim or fade** — the
  // animation does not need it and no gate can tell that kind of dimming from an accent
  // dying. One generation, wasted.
  "boss.corrupted-saint":     { id: "boss.corrupted-saint",     w: 76, h: 122, worldScale: 1.09, feet: 0.022623,
    accents: [{ name: "gold halo", hue: 40 }, { name: "violet eyes", hue: 277 }],
    anim: { cols: 12, tags: { idle: { from: 0, to: 4, seconds: 0.26, loop: true },
                              // `seconds` is unread for a progress-keyed tag (see
                              // anim.ts#frameAtProgress) — it is the cast's own duration
                              // that plays these seven frames.
                              cast: { from: 5, to: 11, seconds: 0.09, loop: false } } } },
  // Animated, idle AND cast. Third of the Delve's own ladder (depth 15, `BOSSES[2]`) and the
  // richest static sprite that was left: 5 encounters, 4 of them Provings.
  //
  // Frame 0 is the committed rest pose, substituted in by `strip.py`'s `first=` rather than
  // taken from the generator, whose own frame 0 was 8 opaque pixels short (the thin-feature
  // erosion recorded for the Tyrant's wing tips). Measured: the strip's frame 0 differs from
  // the sprite that shipped before any of this by **0 pixels**.
  //
  // **The idle is over `art/anim/loop-check.py`'s bar and ships on an OWNER OVERRIDE, not on
  // a measurement.** That check (new with this boss) measures the wrap from a loop's last
  // frame back to its first as a fraction of the body — every previously shipped idle passes
  // (warden 0.7%, saint 3.7%, ferryman 7.6%) and both Colossus candidates did not (14.2% and
  // 11.8%, limit 10%). The 11.8% one was put to the owner rather than resolved with a
  // constant an hour old, and they approved it by eye. **The limit was NOT widened to admit
  // it**; there is a named per-sprite allowance in `loop-check.py` instead, so "a person
  // looked at this and said ship" stays distinguishable from "we measured this as fine", and
  // the next candidate at 11.8% gets its own eye rather than inheriting this verdict. The
  // rejected 14.2% candidate still fails, and both raws are kept with their numbers.
  //
  // The wind-up: it hauls both fists overhead, chains taut, ready to bring them down — the
  // right read for a phase-one kit of `slam`/`charge`. **The `boss.war-queen` finding did not
  // reproduce**: overhead arms on that sprite came back as detached tubes, and the working
  // theory was that a big limb extension exceeds a detailed sprite's detail budget. This one
  // is 31 colours and chunky, and its arms came back on-model, which supports the theory
  // rather than contradicting it — expect the failure on dense sprites, not on all of them.
  // Same drift treatment as the other two: silhouette-vs-rest ran 13 24 35 61 63 61 59 53,
  // so the tag is the monotonic build and the three drift frames go via `:drop=`.
  //
  // `w`/`worldScale` UNCHANGED, `h` 87 -> 117 for the overhead headroom, `feet` re-derived
  // alongside it (2.61px of ground offset, now over 117px). The drawn Colossus does not move.
  "boss.gravebound-colossus": { id: "boss.gravebound-colossus", w: 84, h: 117, worldScale: 1.54, feet: 0.022308,
    anim: { cols: 12, tags: { idle: { from: 0, to: 4, seconds: 0.26, loop: true },
                              // `seconds` is unread for a progress-keyed tag (anim.ts#frameAtProgress).
                              cast: { from: 5, to: 11, seconds: 0.09, loop: false } } } },
  "boss.herald-unspoken":     { id: "boss.herald-unspoken",     w: 76, h: 94, worldScale: 1.17, feet: 0.02 },
  "boss.nameless":            { id: "boss.nameless",            w: 73, h: 87, worldScale: 1.29, feet: 0.03 },

  // --- Tower bosses (`art/bosses/finish-tower.ts`) --- five sprites of their own, where
  // `towerBossSpec` used to draw the borrowed Delve template unchanged. worldScale
  // preserves each template's own world height exactly (see the boss block above):
  // cherub 99.68 (warden), virtue 100.28 (choir), power 133.98 (colossus),
  // throne 109.98 (herald), nameless 112.23 (nameless).
  "tower.boss.cherub":   { id: "tower.boss.cherub",   w: 40, h: 96,  worldScale: 1.0383, feet: 0.03 },
  "tower.boss.virtue":   { id: "tower.boss.virtue",   w: 45, h: 125, worldScale: 0.8022, feet: 0.03 },
  "tower.boss.power":    { id: "tower.boss.power",    w: 45, h: 94,  worldScale: 1.4253, feet: 0.03 },
  "tower.boss.throne":   { id: "tower.boss.throne",   w: 41, h: 103, worldScale: 1.0678, feet: 0.03 },
  "tower.boss.nameless": { id: "tower.boss.nameless", w: 37, h: 97,  worldScale: 1.1570, feet: 0.03 },

  // --- raid bosses (docs/art-manifest.md §2.1) --- Raids shipped reusing a floor boss's
  // PNG wholesale, so the headline encounter of a whole layer was pixel-identical to an
  // ordinary depth-16 fight and only the name plate told you otherwise. `RaidSpec.sprite`
  // now carries the silhouette (the borrow was always meant to be cheap *kit* reuse — the
  // `planetBossSpec` precedent already overrides id/name/title/element for exactly this
  // reason, and silhouette was an omission from that list, not a design).
  //
  // Every `worldScale` below is `targetWorldHeight / h`, and the target is the world
  // height the encounter *already had* while it was borrowing. They look arbitrary because
  // they are preserving numbers tuned elsewhere: telegraph radii, arena sizing and camera
  // framing are all set against them, and none may move because a sprite got redrawn.
  // `art/bosses/finish.ts` recomputes these from the raw generations and prints these rows.
  // First animated row (docs/animation.md). `w`/`h` are ONE FRAME and are unchanged, so
  // `worldScale` is unchanged too and the encounter's world height, telegraph radii, arena
  // sizing and camera framing all stay exactly where they were tuned. The strip PNG is
  // `w * cols` = 975 wide (5 idle + 8 wind-up). Frame 0 is pixel-identical to the sprite that shipped before
  // this, which is what makes the static fallback and the first frame the same picture.
  // `h` 128 against a 107px character, `worldScale` unchanged — the same padded-canvas
  // arrangement as `boss.war-queen`; see its note and docs/animation.md before "fixing"
  // it. Measured, the drawn character does not move: top -96.711522, bottom 2.991078,
  // 99.702600 x 69.885000 world units, before and after. `feet` is a fraction of `h` and
  // had to be re-derived (3.21px of ground offset over 128px instead of 107px).
  "boss.ferryman":            { id: "boss.ferryman",            w: 75,  h: 128, worldScale: 0.9318, feet: 0.025078,
    anim: { cols: 25, tags: { idle:   { from: 0,  to: 4,  seconds: 0.22, loop: true },
                              // The generic wind-up: `cast` covers every ability the
                              // Ferryman has, and `seconds` is unread for a
                              // progress-keyed tag (see anim.ts#frameAtProgress).
                              cast:   { from: 5,  to: 12, seconds: 0.09, loop: false },
                              // The release, and this one IS a blow: rise (13-18, the
                              // shipped frames, unchanged) -> the pole swings over the
                              // top (19-20) -> IMPACT (21) -> recover (22-23) -> rest
                              // (24, the committed idle frame itself, so the hand-off
                              // back to the loop is byte-identical).
                              //
                              // The third pose is what makes it a blow rather than an
                              // unwind, exactly as boss.war-queen's note predicted. Note
                              // WHERE it had to be: this sprite rests with its pole
                              // already butt-down on the ground, so "slam it down" ends
                              // on a pose almost identical to rest — which is precisely
                              // why the old release read as a settle. The impact pose is
                              // therefore differentiated by BODY (braced low stance, pole
                              // swept diagonally across the body) rather than by pole
                              // height, and it measures further from rest (2378 silhouette
                              // px) than the apex does (2306). A pose closer to rest than
                              // the apex is cannot read as a strike, whatever it is called.
                              //
                              // Two sweep frames were dropped rather than shipped, both on
                              // accent: one lost the eye entirely (unrepairable) and one
                              // came back at one pixel per eye, which
                              // repair-split-accent.py refuses BY DESIGN — a one-pixel
                              // accent is not a split one. Do not widen it to force the
                              // frame in; that is a change to shipped art.
                              strike: { from: 13, to: 24, seconds: 0.05, loop: false } } } },
  // Animated: `w`/`h` are ONE FRAME.
  //
  // **The art in `strike` is a RISE, not a blow — read this before assuming it is done.**
  // She uncoils upward, throws her arms out and settles square. For a boss whose kit is
  // crescendo/volley/starLance/meteor — things that arrive from the sky rather than things
  // she swings — a commanding gesture is a defensible release. It is still not a punch.
  //
  // It was apex -> impact -> rest as two pinned segments. The impact pose in the middle is
  // what an earlier version of this comment said was missing: interpolation between two
  // endpoints can only produce poses BETWEEN them, so the first attempt (apex -> rest, one
  // segment) could only ever un-coil, and it did. A third pose fixes that; a hand-authored
  // one would be needed for an actual blow, because every generated attempt at real
  // overhead arms came back off-model. See docs/animation.md.
  //
  // A caution worth keeping: `npm run windup` reports this tag as the best-travelling
  // animation in the repo. It cannot tell "unwinds to rest" from "strikes and recovers" —
  // the metric measures whether a pose MOVES. Green numbers did not mean the art was right;
  // looking at it did.
  //
  // `seconds` is read here, unlike `cast`'s: a wind-up is progress-keyed because it IS the
  // telegraph, and a strike is consequence rather than warning, so it free-runs. 12 x 0.05
  // = 0.60s, inside `BOSS_ACTION_GAP` (1.85s) at ordinary aggression and happily cut short
  // by the next wind-up when it isn't — cast beats strike, always.
  // `h` is 131 against a 108px character, and `worldScale` did NOT move with it. That
  // pairing looks exactly like the bug that once drew three raid bosses at a third of
  // their size, so before "fixing" it read this: the extra 23px are TRANSPARENT
  // headroom the release swings into, not character. `worldScale` is world units per
  // PIXEL, so holding it fixed is what keeps her the same size — measured, the drawn
  // character is unchanged to six decimal places (top -105.679560, bottom 2.281440,
  // 107.961000 x 97.776000 world units, before and after). `feet` is a FRACTION of `h`,
  // so it HAD to move: 3.24px of ground offset over 131px instead of 108px. Left at
  // 0.03 she sinks 0.69px into the floor. `art/anim/strip.py` derives both and prints
  // them; do not paste its old `targetWorldHeight / h` value, which assumes the
  // character fills the canvas and here would shrink her by 18%.
  "boss.war-queen":           { id: "boss.war-queen",           w: 98,  h: 131, worldScale: 1.0185, feet: 0.024733,
    anim: { cols: 25, tags: { idle:   { from: 0,  to: 4,  seconds: 0.24, loop: true },
                              cast:   { from: 5,  to: 12, seconds: 0.09, loop: false },
                              strike: { from: 13, to: 24, seconds: 0.05, loop: false } } } },
  // NOT animated, deliberately — see docs/animation.md "A sprite whose accent is too small
  // to survive generation". Its violet eyes are two pixels; two attempts, the second
  // starting from a much brighter accent, both came back with the eyes dimmed below the
  // hero's own skin in several frames, which `npm run chroma` fails. A static boss is
  // exactly today's behaviour, so this is a hold rather than a regression.
  //
  // The obvious unblock was to redraw the eyes at 3+ pixels each so the accent survives
  // generation (measured: 1px/eye holds accent in 0 of 8 frames, 2px/eye in 4 of 8). Put
  // to the owner 2026-09-10, the answer was "Minotaurs eyes look fine" — so the SPRITE is
  // not being redrawn, and the hold above is now permanent rather than pending. If this
  // encounter is ever wanted animated, the accent has to survive some other way; it does
  // not get there by making the eyes bigger, because that question has been asked.
  "boss.labyrinth-minotaur":  { id: "boss.labyrinth-minotaur",  w: 102, h: 106, worldScale: 1.2642, feet: 0.03 },
  // Animated. The set-trim is two columns narrower than the still (100 -> 98); height is
  // unchanged, and `worldScale` is world units per PIXEL, so the encounter's world height
  // (100.3) does not move.
  // `h` 124 against a 103px character, `worldScale` unchanged — see `boss.war-queen`.
  // Measured unmoved: top -97.292358, bottom 3.009042, 100.301400 x 95.432400 world
  // units, before and after. `feet` re-derived: 3.09px of ground offset over 124px.
  "boss.exiled-tyrant":       { id: "boss.exiled-tyrant",       w: 98,  h: 124, worldScale: 0.9738, feet: 0.024919,
    anim: { cols: 24, tags: { idle:   { from: 0,  to: 4,  seconds: 0.25, loop: true },
                              cast:   { from: 5,  to: 13, seconds: 0.09, loop: false },
                              strike: { from: 14, to: 23, seconds: 0.05, loop: false } } } },

  // --- props (§4, §8) --- drawn through drawProps at `worldScale × p.scale`. Legacy
  // grids ~6–16 wide at the old fixed 1.25; worldScale ≈ old world width / new art width,
  // nudged up ~1.1× for legibility. feet ≈ 0 (trimmed, on the ground).
  "prop.chest":    { id: "prop.chest",    w: 36, h: 29, worldScale: 0.61, feet: 0.05 },
  "prop.torch":    { id: "prop.torch",    w: 12, h: 39, worldScale: 0.58, feet: 0.03 },
  "prop.bones":    { id: "prop.bones",    w: 34, h: 22, worldScale: 0.47, feet: 0.06 },
  "prop.mushroom": { id: "prop.mushroom", w: 30, h: 28, worldScale: 0.44, feet: 0.06 },
  "prop.crystal":  { id: "prop.crystal",  w: 24, h: 36, worldScale: 0.44, feet: 0.05 },
  "prop.rock":     { id: "prop.rock",     w: 35, h: 26, worldScale: 0.46, feet: 0.06 },

  // --- Delve dungeon dressing (§5) --- big set-piece props that sell the Nine
  // Circles: broken funerary statuary, wall braziers, bone altars, hung gibbets.
  // Authored near-monochrome grimdark; `drawProps` gives each a light per-circle
  // wall-colour wash so the same set reads limbo-grey or heresy-red in place.
  // worldScale lands each on a deliberate world height (statue taller than the
  // hero's ~32, altar a low wide slab); feet ≈ 0 — trimmed to the base.
  "prop.delve-statue":      { id: "prop.delve-statue",      w: 58, h: 93, worldScale: 0.40, feet: 0.03 },
  "prop.delve-brazier":     { id: "prop.delve-brazier",     w: 28, h: 48, worldScale: 0.55, feet: 0.03 },
  "prop.delve-altar":       { id: "prop.delve-altar",       w: 77, h: 74, worldScale: 0.42, feet: 0.05 },
  "prop.delve-gibbet":      { id: "prop.delve-gibbet",      w: 35, h: 87, worldScale: 0.42, feet: 0.03 },
  "prop.delve-sarcophagus": { id: "prop.delve-sarcophagus", w: 90, h: 66, worldScale: 0.40, feet: 0.06 },
  "prop.delve-skulls":      { id: "prop.delve-skulls",      w: 80, h: 50, worldScale: 0.42, feet: 0.06 },

  // --- Ashen Reliquary dressing (§8.2) --- the tomb-of-the-supernatural set:
  // a fallen higher being's hand out of the ash, war graves, funerary urns,
  // toppled winged pillars, chained reliquary caskets. Same wash treatment as
  // the Delve set (drawProps → biome.wallSide), themed per sector.
  "prop.reliquary-hand":     { id: "prop.reliquary-hand",     w: 90, h: 74, worldScale: 0.42, feet: 0.05 },
  "prop.reliquary-urn":      { id: "prop.reliquary-urn",      w: 56, h: 52, worldScale: 0.44, feet: 0.06 },
  "prop.reliquary-pillar":   { id: "prop.reliquary-pillar",   w: 88, h: 45, worldScale: 0.44, feet: 0.06 },
  "prop.reliquary-casket":   { id: "prop.reliquary-casket",   w: 77, h: 45, worldScale: 0.44, feet: 0.06 },
  "prop.reliquary-wargrave": { id: "prop.reliquary-wargrave", w: 46, h: 86, worldScale: 0.42, feet: 0.03 },

  // --- The Citadel of the Threshold (§4) --- the deck's tiled-rung relics. Every station
  // whose glyph is walkable rock on a stamped floor needs a real prop or the tiled Citadel
  // is six identical terminals with different words under them (`STATION_PROP` in
  // `game/deck.ts`, drawn by `drawDeckProp` in `render/hub.ts`). The two portrait-shaped
  // ones (forge, rack, shrine, starmap, altar, dummy, pillar, statue) worldScale to a
  // deliberate stand height per the same convention as the Delve/Reliquary set above; the
  // war table and the rubble pile are landscape footprints, scaled by their width instead.
  // Collage-of-eras per the worldbuilding doc's Citadel section: ash/bone stone, ancient
  // weapons and statuary from every civilization, one weak-gold accent at most (Threshold
  // wards and Keeper sigils only — the palette table's "nothing else saturated").
  //
  // 2026-09: the first cut here (worldScale ~0.41-0.57) was "the legacy grid's old width,
  // nudged ~1.1x for legibility" — a guess made before the hall had ever been rendered.
  // Seeing it, the owner's word was "a bit small and out of place": a station relic is a
  // landmark you navigate by, not set dressing, and it should read as furniture a person
  // could walk up to and use. These now target the hero's own drawn height on the deck
  // (`HUB_FIGURE_H` in `render/hub.ts`, 74 world units) rather than the old grid math —
  // roughly hero-height to a bit taller for five of the six standing relics. Two carry a
  // deliberately smaller exception, both forced by the room rather than by taste: the
  // training dummy's own annex only has two tiles of headroom over its anchor, and the
  // rack is the one relic still crowded enough at its own spot (between the spawn tile's
  // own interact-range exclusion and its row-mates) that nothing bigger than ~0.85x fits
  // without touching a neighbor — see `tools/hub-layout.ts`, the geometry check this
  // rearrangement was verified against and that brute-forced this one relic's legal cell
  // once hand-placement ran out of room.
  "prop.citadel-forge":    { id: "prop.citadel-forge",    w: 68, h: 86, worldScale: 1.02, feet: 0.03 },
  "prop.citadel-rack":     { id: "prop.citadel-rack",     w: 57, h: 72, worldScale: 0.85, feet: 0.03 },
  "prop.citadel-shrine":   { id: "prop.citadel-shrine",   w: 48, h: 73, worldScale: 1.15, feet: 0.03 },
  "prop.citadel-starmap":  { id: "prop.citadel-starmap",  w: 44, h: 70, worldScale: 1.17, feet: 0.03 },
  "prop.citadel-wartable": { id: "prop.citadel-wartable", w: 78, h: 42, worldScale: 1.18, feet: 0.05 },
  "prop.citadel-altar":    { id: "prop.citadel-altar",    w: 55, h: 75, worldScale: 1.12, feet: 0.05 },
  "prop.citadel-dummy":    { id: "prop.citadel-dummy",    w: 27, h: 82, worldScale: 0.55, feet: 0.03 },
  // Floor dressing (§17.7b) — same idiom as `DECK_DRESSING`'s brazier/rubble/statue/
  // pillar/banner glyphs: purely visual, placed blind on the text grid, wants an eye.
  "prop.citadel-brazier":  { id: "prop.citadel-brazier",  w: 22, h: 35, worldScale: 0.69, feet: 0.03 },
  "prop.citadel-rubble":   { id: "prop.citadel-rubble",   w: 52, h: 26, worldScale: 0.54, feet: 0.06 },
  "prop.citadel-statue":   { id: "prop.citadel-statue",   w: 50, h: 85, worldScale: 0.45, feet: 0.03 },
  "prop.citadel-pillar":   { id: "prop.citadel-pillar",   w: 25, h: 96, worldScale: 0.42, feet: 0.03 },
  "prop.citadel-banner":   { id: "prop.citadel-banner",   w: 34, h: 90, worldScale: 0.38, feet: 0.03 },

  // --- item / drop icons (§12) --- drawn through pickupSprite at `worldScale` (fixed
  // 1.4 before). Legacy icon grids ~8–12 wide. In UI they flow through pixelImageFit,
  // which normalises by width, so worldScale here is only the in-world drop size.
  "icon.coin":     { id: "icon.coin",     w: 26, h: 26, worldScale: 0.50, feet: 0.15 },
  "icon.key":      { id: "icon.key",      w: 12, h: 28, worldScale: 0.55, feet: 0.15 },
  "icon.potion":   { id: "icon.potion",   w: 18, h: 23, worldScale: 0.66, feet: 0.12 },
  "icon.gem":      { id: "icon.gem",      w: 20, h: 19, worldScale: 0.60, feet: 0.15 },
  "icon.capsule":  { id: "icon.capsule",  w: 25, h: 22, worldScale: 0.66, feet: 0.15 },
  "icon.armor":    { id: "icon.armor",    w: 22, h: 28, worldScale: 0.72, feet: 0.12 },
  "icon.shield":   { id: "icon.shield",   w: 30, h: 30, worldScale: 0.48, feet: 0.12 },
  "icon.ring":     { id: "icon.ring",     w: 20, h: 20, worldScale: 0.55, feet: 0.15 },
  "icon.gloves":   { id: "icon.gloves",   w: 20, h: 26, worldScale: 0.66, feet: 0.12 },
  "icon.necklace": { id: "icon.necklace", w: 28, h: 29, worldScale: 0.50, feet: 0.12 },

  // --- named items (UAT §28 step 3/4) --- one row per `NamedItemDef.art`, by convention
  // `named.<def id>`, PNG under `src/render/atlas/items/named/` (style guide §12.3). A
  // definition may name an id that has no row here yet: `itemIcon` / `pickupSprite` fall
  // back to the type icon tinted by rarity, so art can land after the item does. Sizes
  // follow the icon rows above — the UI normalises by width through pixelImageFit, so
  // `worldScale` is only the floor size. `feet` mirrors the sibling type icon's, since a
  // dropped named item sits on the ground the same way its ordinary counterpart does.
  //
  // All 11 named items are authored — the owner signed off on the three samples
  // ("looks right — author the rest") and this is the rest, at the same fidelity.
  "named.proof-of-the-whole": { id: "named.proof-of-the-whole", w: 26, h: 38, worldScale: 0.50, feet: 0.12 },
  "named.the-first-seal":     { id: "named.the-first-seal",     w: 40, h: 39, worldScale: 0.48, feet: 0.12 },
  "named.threshold-brand":    { id: "named.threshold-brand",    w: 44, h: 42, worldScale: 0.41, feet: 0.10 },
  "named.the-seal-unbroken":  { id: "named.the-seal-unbroken",  w: 44, h: 45, worldScale: 0.48, feet: 0.12 },
  "named.gravebound-mantle":  { id: "named.gravebound-mantle",  w: 26, h: 34, worldScale: 0.72, feet: 0.12 },
  "named.choristers-idol":    { id: "named.choristers-idol",    w: 29, h: 41, worldScale: 0.55, feet: 0.10 },
  "named.gluttons-grasp":     { id: "named.gluttons-grasp",     w: 21, h: 34, worldScale: 0.66, feet: 0.12 },
  "named.the-early-word":     { id: "named.the-early-word",     w: 8,  h: 46, worldScale: 0.33, feet: 0.10 },
  "named.a-name-withheld":    { id: "named.a-name-withheld",    w: 20, h: 23, worldScale: 0.55, feet: 0.15 },
  "named.limbos-lantern":     { id: "named.limbos-lantern",     w: 18, h: 30, worldScale: 0.50, feet: 0.12 },
  "named.keepers-ledger":     { id: "named.keepers-ledger",     w: 20, h: 26, worldScale: 0.55, feet: 0.15 },

  // --- relics and artifacts (UAT §19) --- one row per `RelicDef.art`, by convention
  // `relic.<def id>`, PNG under `src/render/atlas/relics/`. Same fallback contract as
  // named items: `relicArt` draws the gem glyph tinted by tier until a row lands here.
  // worldScale/feet copied from `icon.gem` — the sibling the fallback glyph itself uses —
  // since a relic has no item type of its own to draw a floor size from.
  //
  // The 8 Proving relics, one per element (docs/relics.md) — the first batch of the
  // larger relics/artifacts pass, prioritised ahead of the artifacts per the owner.
  "relic.spark-of-the-unfinished-storm":  { id: "relic.spark-of-the-unfinished-storm",  w: 25, h: 30, worldScale: 0.60, feet: 0.15 },
  "relic.cinder-of-the-unfinished-pyre":  { id: "relic.cinder-of-the-unfinished-pyre",  w: 30, h: 29, worldScale: 0.60, feet: 0.15 },
  "relic.rime-of-the-unfinished-vigil":   { id: "relic.rime-of-the-unfinished-vigil",   w: 18, h: 27, worldScale: 0.60, feet: 0.15 },
  "relic.hymn-of-the-unfinished-choir":   { id: "relic.hymn-of-the-unfinished-choir",   w: 24, h: 27, worldScale: 0.60, feet: 0.15 },
  "relic.venom-of-the-unfinished-garden": { id: "relic.venom-of-the-unfinished-garden", w: 20, h: 31, worldScale: 0.60, feet: 0.15 },
  "relic.hollow-of-the-unfinished-word":  { id: "relic.hollow-of-the-unfinished-word",  w: 18, h: 28, worldScale: 0.60, feet: 0.15 },
  "relic.sigil-of-the-unfinished-art":    { id: "relic.sigil-of-the-unfinished-art",    w: 26, h: 27, worldScale: 0.60, feet: 0.15 },
  "relic.measure-of-the-unfinished-duel": { id: "relic.measure-of-the-unfinished-duel", w: 30, h: 25, worldScale: 0.60, feet: 0.15 },

  // The remaining 4 relics — the two Nameless drops, the deepest Delve cache, and the
  // Abyss's own top tier. Completes all 12 relics; the artifacts follow in later batches.
  "relic.the-name-it-kept":            { id: "relic.the-name-it-kept",            w: 28, h: 14, worldScale: 0.60, feet: 0.15 },
  "relic.silence-between-sentences":   { id: "relic.silence-between-sentences",   w: 33, h: 29, worldScale: 0.60, feet: 0.15 },
  "relic.sandals-of-the-swift-messenger": { id: "relic.sandals-of-the-swift-messenger", w: 34, h: 21, worldScale: 0.60, feet: 0.15 },
  "relic.remnant-of-what-was-not":     { id: "relic.remnant-of-what-was-not",     w: 26, h: 32, worldScale: 0.60, feet: 0.15 },

  // The Nine Circles artifact set (docs/game_story_worldbuilding.md's "THE NINE CIRCLES
  // OF HELL" section) — one per circle, a shared worn-material family with one accent
  // colour each. First batch of the 19 artifacts; the Abyss/borrowed-encounter sets follow.
  "relic.coin-of-the-first-circle":    { id: "relic.coin-of-the-first-circle",    w: 29, h: 28, worldScale: 0.60, feet: 0.15 },
  "relic.hook-of-the-second-circle":   { id: "relic.hook-of-the-second-circle",   w: 23, h: 33, worldScale: 0.60, feet: 0.15 },
  "relic.tooth-of-the-third-circle":   { id: "relic.tooth-of-the-third-circle",   w: 17, h: 36, worldScale: 0.60, feet: 0.15 },
  "relic.weight-of-the-fourth-circle": { id: "relic.weight-of-the-fourth-circle", w: 28, h: 20, worldScale: 0.60, feet: 0.15 },
  "relic.tempo-of-the-fifth-circle":   { id: "relic.tempo-of-the-fifth-circle",   w: 21, h: 37, worldScale: 0.60, feet: 0.15 },
  "relic.candle-of-the-sixth-circle":  { id: "relic.candle-of-the-sixth-circle",  w: 18, h: 35, worldScale: 0.60, feet: 0.15 },
  "relic.drum-of-the-seventh-circle":  { id: "relic.drum-of-the-seventh-circle",  w: 27, h: 29, worldScale: 0.60, feet: 0.15 },
  "relic.mirror-of-the-eighth-circle": { id: "relic.mirror-of-the-eighth-circle", w: 24, h: 36, worldScale: 0.60, feet: 0.15 },
  "relic.frost-of-the-ninth-circle":   { id: "relic.frost-of-the-ninth-circle",   w: 30, h: 30, worldScale: 0.60, feet: 0.15 },

  // The last 10 artifacts, organised by where they came from rather than one family
  // palette: the Abyss itself (4, escalating in form — shard, echo, chain, whisper —
  // rather than by circle, muted matte-obsidian to stay artifact-weight against the
  // relics' brighter glow) and 6 trophies each themed to their source encounter.
  "relic.shard-of-the-nothing":        { id: "relic.shard-of-the-nothing",        w: 21, h: 28, worldScale: 0.60, feet: 0.15 },
  "relic.echo-of-the-unmade":          { id: "relic.echo-of-the-unmade",          w: 28, h: 28, worldScale: 0.60, feet: 0.15 },
  "relic.chain-of-the-unmade":         { id: "relic.chain-of-the-unmade",         w: 29, h: 26, worldScale: 0.60, feet: 0.15 },
  "relic.whisper-of-the-nameless":     { id: "relic.whisper-of-the-nameless",     w: 26, h: 31, worldScale: 0.60, feet: 0.15 },
  "relic.splinter-of-the-first-seal":  { id: "relic.splinter-of-the-first-seal",  w: 28, h: 31, worldScale: 0.60, feet: 0.15 },
  "relic.fragment-of-the-choir":       { id: "relic.fragment-of-the-choir",       w: 28, h: 35, worldScale: 0.60, feet: 0.15 },
  "relic.breath-of-the-herald":        { id: "relic.breath-of-the-herald",        w: 20, h: 24, worldScale: 0.60, feet: 0.15 },
  "relic.stitch-of-the-colossus":      { id: "relic.stitch-of-the-colossus",      w: 27, h: 31, worldScale: 0.60, feet: 0.15 },
  "relic.interval-of-the-keepers":     { id: "relic.interval-of-the-keepers",     w: 19, h: 33, worldScale: 0.60, feet: 0.15 },
  "relic.step-of-the-pilgrim":         { id: "relic.step-of-the-pilgrim",         w: 30, h: 27, worldScale: 0.60, feet: 0.15 },
};

/**
 * Which legacy `SpriteName` each atlas sprite stands in for. `render/sprites.ts` reads
 * this to override the procedural bake with the loaded PNG; everything downstream
 * (`tinted`, `silhouette`, elite/infusion recolour) keeps working because it all
 * operates on whatever canvas `sprite()` returns.
 *
 * Plain strings on the value side so this module stays free of `sprites.ts`.
 */
export const SPRITE_OVERRIDES: Record<string, string> = {
  hero: "hero.legend-base",
  grunt: "reliquary.monster.rot-imp",
  archer: "reliquary.monster.bone-archer",
  brute: "reliquary.monster.iron-brute",
  caster: "reliquary.monster.cult-caster",
  swarmer: "reliquary.monster.rot-scuttler",
  // The six UAT §2 roles, drawn in art-wave 2 (`docs/art-wave-2.md` §1a,
  // `art/monsters/finish-delve.ts`). Before this each drew another role's silhouette.
  charger: "reliquary.monster.gore-hound",
  bomber: "reliquary.monster.bloat-fiend",
  shieldbearer: "reliquary.monster.aegis-thrall",
  summoner: "reliquary.monster.grave-piper",
  sniper: "reliquary.monster.deadeye",
  leech: "reliquary.monster.rot-priest",
  boss: "boss.warden",
  bossChoir: "boss.corrupted-saint",
  bossColossus: "boss.gravebound-colossus",
  bossHerald: "boss.herald-unspoken",
  bossNameless: "boss.nameless",
  towerBossCherub: "tower.boss.cherub",
  towerBossVirtue: "tower.boss.virtue",
  towerBossPower: "tower.boss.power",
  towerBossThrone: "tower.boss.throne",
  towerBossNameless: "tower.boss.nameless",
  torch: "prop.torch",
  bones: "prop.bones",
  mushroom: "prop.mushroom",
  crystal: "prop.crystal",
  rock: "prop.rock",
  chest: "prop.chest",
  coin: "icon.coin",
  key: "icon.key",
  potion: "icon.potion",
  gem: "icon.gem",
  capsule: "icon.capsule",
  armor: "icon.armor",
  shield: "icon.shield",
  ring: "icon.ring",
  gloves: "icon.gloves",
  necklace: "icon.necklace",
  bossFerryman: "boss.ferryman",
  bossWarQueen: "boss.war-queen",
  bossLabyrinth: "boss.labyrinth-minotaur",
  bossTyrant: "boss.exiled-tyrant",
};

// --- scenes -------------------------------------------------------------

/**
 * A full baked backdrop — the hub deck, and (later) per-realm establishing art. Unlike
 * an {@link AtlasSprite} it has no world footprint: it is drawn stretched to fill a
 * fixed viewport (the hub) or as a scrolling parallax, so it carries only its size.
 */
export interface AtlasScene {
  readonly id: string;
  readonly w: number;
  readonly h: number;
}

// --- tilesets ---------------------------------------------------------------

/**
 * A PixelLab top-down corner Wang tileset — 16 tiles on a 4x4 sheet describing
 * every way a floor terrain (`lower`) and a wall mass (`upper`) can meet at the
 * four corners of a cell. `render/tilemap.ts` stamps a level's wall grid with it
 * by dual-grid autotiling, so a procedurally generated floor gets real
 * hand-arted stone instead of the flat `bakeFloor` fill.
 *
 * The PNG (`<id>.png`) is committed under `atlas/tilesets/`; the sheet layout is
 * baked to `<id>.json` (one `[x, y]` per corner mask) by `npm run tileset`,
 * because PixelLab's sheet order is arbitrary and only the metadata says which
 * tile is which. A biome names its tileset by id in `data/biomes.ts` /
 * `data/planets.ts`; an unlisted or unloaded tileset falls back to `bakeFloor`.
 */
export interface AtlasTileset {
  readonly id: string;
  /** Sheet size in px — 64x64 for a standard 16-tile set. */
  readonly w: number;
  readonly h: number;
  /** Edge length of one tile in px (and in world units — tiles draw 1:1). */
  readonly tile: number;
}

/**
 * **Which pictures a realm's monsters draw.**
 *
 * `SPRITE_OVERRIDES` below is the game-wide default, and until this existed it was the
 * *only* answer: `grunt` meant `reliquary.monster.rot-imp` everywhere, so the Delve, the
 * Tower and every rift all fought the Reliquary's roster. One realm's art had quietly
 * become the whole game's art, and there was no way to say otherwise.
 *
 * A `BiomeStyle` now names a set (`monsterSet`) and its archetypes resolve here first.
 * Three rules, all of them the `TILESETS` precedent applied to monsters:
 *
 *  1. **A set may be named before it is drawn.** An id listed here whose PNGs are not
 *     committed resolves to nothing and the archetype falls back to `SPRITE_OVERRIDES`,
 *     then to the procedural bake. Declaring a realm's intent costs nothing and breaks
 *     nothing — which is the whole reason the Tower's tilesets are already named.
 *  2. **A set may be partial.** An archetype a set doesn't list falls back the same way,
 *     so a realm can ship its grunt before its caster without looking half-finished in a
 *     way that crashes.
 *  3. **This decides pictures and nothing else.** No entry here may change a monster's
 *     kind, stats, behaviour, name or hitbox — those are `data/enemies.ts` and
 *     `data/biomes.ts`'s `enemyNames`. `tools/monstersets.ts` asserts it as a comparison:
 *     the same seeded floor plays out byte-identically whichever set it draws from.
 */
/**
 * Pairs of sets that knowingly draw the same art, and why.
 *
 * Sharing is legitimate but it must never be accidental: two realms quietly resolving to
 * one roster is the exact defect this whole seam exists to surface, so `tools/monstersets.ts`
 * fails any cross-set overlap that is not declared here.
 */
export const SHARED_MONSTER_SETS: readonly (readonly [string, string])[] = [
  // Permanent, not "until" — see the `delve` note below. The Reliquary sector question
  // was asked and closed (docs/art-manifest.md §3.3): a sector is a place, not a
  // population, and per-sector rosters are not coming.
  ["delve", "reliquary"],
  // TEMPORARY, and the gate below will say when it stops being true. The Tower borrows
  // the six art-wave-2 roles (charger/bomber/shieldbearer/summoner/sniper/leech) from the
  // Hell roster until its own celestial six are drawn (`docs/art-wave-2.md` §1b). Listing
  // the borrow in `MONSTER_SETS.tower` rather than leaving it to the fallback ladder is
  // what makes the gap *sayable*; declaring it here is what stops the overlap gate calling
  // it an accident. `tools/monstersets.ts` fails a declaration whose sets no longer share
  // any art, so landing §1b forces these lines out rather than letting them go stale.
  // Two lines because the gate declares sharing per pair and `delve` holds the same six.
  ["tower", "reliquary"],
  ["tower", "delve"],
];

export const MONSTER_SETS: Record<string, Record<string, string>> = {
  /**
   * The Ashen Reliquary (§8.2) — dead-civilisation stone, rot and bone. Committed and
   * loading; this is the set that has been standing in for every realm.
   */
  reliquary: {
    grunt: "reliquary.monster.rot-imp",
    archer: "reliquary.monster.bone-archer",
    brute: "reliquary.monster.iron-brute",
    caster: "reliquary.monster.cult-caster",
    swarmer: "reliquary.monster.rot-scuttler",
    charger: "reliquary.monster.gore-hound",
    bomber: "reliquary.monster.bloat-fiend",
    shieldbearer: "reliquary.monster.aegis-thrall",
    summoner: "reliquary.monster.grave-piper",
    sniper: "reliquary.monster.deadeye",
    leech: "reliquary.monster.rot-priest",
  },

  /**
   * The Delve (§5) — **the same five sprites, named deliberately.**
   *
   * These read as Hell: rot, bone, iron, a cult robe. The `reliquary.` prefix is an
   * accident of *when* they were generated (during the Reliquary sector pass), not a claim
   * of ownership — `docs/art-manifest.md` calls them "the identical Hell/Reliquary sprites"
   * and lists them under "what has a bespoke sprite today", keyed by archetype rather than
   * by realm. So the Delve does not have a five-sprite backlog; it has the right art under
   * a misleading name, and pointing at it here is the honest expression of that.
   *
   * **This set and `reliquary` are identical, and that is settled rather than pending.**
   * Two realms draw one roster, on purpose: declared in `SHARED_MONSTER_SETS` so it can't
   * happen by accident, and permanent rather than a placeholder waiting on the Reliquary's
   * sectors to get art of their own — they aren't going to.
   *
   * This comment used to say the opposite — that the Reliquary "should eventually
   * diverge" into its own sector rosters — and that was a real, asked, and closed
   * question (docs/art-manifest.md §3.3, the load-bearing rule this comment used to
   * contradict). The ruling: `docs/game_story_worldbuilding.md` describes each Reliquary
   * sector purely as a *place* — architecture, terrain, what's embedded in the walls —
   * and is silent on what walks around in it. Every sector gets exactly one labelled
   * differentiator ("Fire-heavy", "Cold-heavy", "Void-heavy", ...), which names the
   * elemental-infusion lever that already exists, not a monster roster that doesn't. A
   * sector reads as itself through its tileset, its props and dressing, its elemental
   * infusion, `enemyNames`, and — per the Black Archive's `blink`/`sunder` boss kit —
   * mechanics, same eleven silhouettes underneath throughout. See §3.3 for the rest.
   */
  delve: {
    grunt: "reliquary.monster.rot-imp",
    archer: "reliquary.monster.bone-archer",
    brute: "reliquary.monster.iron-brute",
    caster: "reliquary.monster.cult-caster",
    swarmer: "reliquary.monster.rot-scuttler",
    charger: "reliquary.monster.gore-hound",
    bomber: "reliquary.monster.bloat-fiend",
    shieldbearer: "reliquary.monster.aegis-thrall",
    summoner: "reliquary.monster.grave-piper",
    sniper: "reliquary.monster.deadeye",
    leech: "reliquary.monster.rot-priest",
  },

  /**
   * The Tower (§6) — **drawn.** Heaven is Order, and Order lives in silhouette: symmetry,
   * repetition, geometry, against Hell's asymmetry and appetite. A palette swap of the
   * Reliquary's roster would be white demons, which is why these are their own sprites
   * rather than a tint: a halo behind the helm, a wheel-within-wheel throne, a lance of
   * light, a robed herald with arms folded in ritual symmetry, a broken shard of a halo
   * ring. See `art/monsters/finish-tower.ts` for the generation and the hot-accent pass.
   */
  tower: {
    grunt: "tower.monster.power",
    archer: "tower.monster.virtue-lancer",
    brute: "tower.monster.throne-bearer",
    caster: "tower.monster.dominion-herald",
    swarmer: "tower.monster.halo-fragment",
    // Borrowed from Hell, on purpose and out loud, until §1b of `docs/art-wave-2.md`
    // draws the celestial six (a charging Power, a Throne that detonates into judgment, a
    // Cherub shieldbearer, a Dominion summoner, a Virtue sniper, a Principality leech —
    // every name the worldbuilding doc's own hierarchy). Declared in `SHARED_MONSTER_SETS`
    // so the overlap gate knows; replace these six ids and that declaration together.
    charger: "reliquary.monster.gore-hound",
    bomber: "reliquary.monster.bloat-fiend",
    shieldbearer: "reliquary.monster.aegis-thrall",
    summoner: "reliquary.monster.grave-piper",
    sniper: "reliquary.monster.deadeye",
    leech: "reliquary.monster.rot-priest",
  },
};

export const TILESETS: Record<string, AtlasTileset> = {
  // The Delve (§5) — the Nine Circles (`data/biomes.ts`). Six sheets for ten places:
  // Lust, Avarice, Violence and Fraud borrow one of these until their own lands
  // (`BORROWED_LOOKS`, declared and gated). Floor mid-tone, wall near-black, on the
  // ash/Hell palette.
  "tiles.delve-limbo":    { id: "tiles.delve-limbo",    w: 64, h: 64, tile: 16 }, // Limbo — Circle I, drained ash flagstone
  "tiles.delve-gluttony": { id: "tiles.delve-gluttony", w: 64, h: 64, tile: 16 }, // Gluttony — Circle III, bile-stained stone, wet rot
  "tiles.delve-cave":     { id: "tiles.delve-cave",     w: 64, h: 64, tile: 16 }, // Treachery — Circle IX, frozen cavern rock, ice rime (was the Dark Cave)
  "tiles.delve-wrath":    { id: "tiles.delve-wrath",    w: 64, h: 64, tile: 16 }, // Wrath — Circle V, scorched flagstone, dull embers
  "tiles.delve-heresy":   { id: "tiles.delve-heresy",   w: 64, h: 64, tile: 16 }, // Heresy — Circle VI, black cathedral, gold used wrong
  "tiles.delve-veil":     { id: "tiles.delve-veil",     w: 64, h: 64, tile: 16 }, // The Veil — past the last circle, Abyss-touched, warped violet-black stone

  // The Ashen Reliquary (§8.2) — one per sector, warm/element ash over
  // dead-civilisation stone.
  "tiles.reliquary-wargrave":  { id: "tiles.reliquary-wargrave",  w: 64, h: 64, tile: 16 }, // churned earth over buried armour
  "tiles.reliquary-garden":    { id: "tiles.reliquary-garden",    w: 64, h: 64, tile: 16 }, // corrupted celestial garden, poison bloom
  "tiles.reliquary-catacombs": { id: "tiles.reliquary-catacombs", w: 64, h: 64, tile: 16 }, // ash-buried catacombs still burning
  "tiles.reliquary-basilica":  { id: "tiles.reliquary-basilica",  w: 64, h: 64, tile: 16 }, // cathedral frozen solid
  "tiles.reliquary-sepulcher": { id: "tiles.reliquary-sepulcher", w: 64, h: 64, tile: 16 }, // battlefield of higher armies, embedded blades
  "tiles.reliquary-archive":   { id: "tiles.reliquary-archive",   w: 64, h: 64, tile: 16 }, // where the Reliquary touches the Abyss
  // The last three sectors (§3.3's closed question): monsters carry these three elements
  // at the infusion cap from tier 1 (see `SHARED_MONSTER_SETS`'s comment), so the ground
  // is deliberately NOT the sector's own colour — the element belongs to the gilding, the
  // arcane light and the growth, not the floor those things stand on.
  "tiles.reliquary-ossuary": { id: "tiles.reliquary-ossuary", w: 64, h: 64, tile: 16 }, // gilded saints on display, dark stone under growing gold
  "tiles.reliquary-spire":   { id: "tiles.reliquary-spire",   w: 64, h: 64, tile: 16 }, // mage-tower, rune-scarred ash under fractured arcane stone
  "tiles.reliquary-orchard": { id: "tiles.reliquary-orchard", w: 64, h: 64, tile: 16 }, // orchard over a mass grave, turned earth under root-grown walls

  // The Abyssal Rift (§7) — null-black, one wrong colour, geometry that doesn't close.
  "tiles.abyss": { id: "tiles.abyss", w: 64, h: 64, tile: 16 },

  // The Citadel of the Threshold (§4) — the deck's tiled rung (`DECK_TILESET` in
  // `render/hub.ts`). Ash-black flagstone under pale bone-white collage masonry —
  // §17.7's "author to the Citadel palette" recipe, at the same DECK_TINT (`#3d3a47`)
  // the painted scene and the flat bake both use, so all three rungs read as one hall.
  "tiles.citadel": { id: "tiles.citadel", w: 64, h: 64, tile: 16 },

  // The Tower (§6) — the ascent toward Heaven. **The wall is the lit surface here**, which
  // is a per-biome call §17.7 says to make deliberately: Heaven's light comes off the
  // architecture and is pointed at you, so the perfect repeating masonry glares and the
  // ground stays the dark thing you are a deviation moving across. It is also the only
  // direction that survives §4 of `docs/art-manifest.md` — a bespoke celestial roster
  // would be *brighter* than the borrowed Hell one it draws today, which narrows a bright
  // floor's window and never a dark one's. The bands escalate on the floor rather than the
  // wall: the glare barely moves, the ground goes out from under you.
  "tiles.tower-lower": { id: "tiles.tower-lower", w: 64, h: 64, tile: 16 }, // Lower Tower — warm gilded cathedral, dark warm slabs
  "tiles.tower-mid":   { id: "tiles.tower-mid",   w: 64, h: 64, tile: 16 }, // Seamless Halls — bleached repeating blocks, jointless cold ground
  "tiles.tower-upper": { id: "tiles.tower-upper", w: 64, h: 64, tile: 16 }, // Blinding Heights — near-white glare over unlit black

  // The Tyrant of the First Heavens' arena (data/raids.ts) — landed with this row, the
  // PNG and the biome's own tint fix in one commit, on purpose (docs/reachable-band.md's
  // sibling investigation: `tools/raid-arena-contrast.ts` found this arena had no sheet
  // at all, a gap that was documented but never a placeholder row like the Tower's three
  // were before their PNGs existed). Dark bronze-black floor under a bright bone-gold
  // wall — the wall/wallSide/accent were already authored to match Mid Tower's exactly;
  // this sheet and the tint fix complete that match rather than inventing a new palette.
  "tiles.first-heavens": { id: "tiles.first-heavens", w: 64, h: 64, tile: 16 }, // The First Heavens — dark bronze-black floor, bright bone-gold masonry
};

export const SCENES: Record<string, AtlasScene> = {
  // §4 The Citadel of the Threshold — the hub deck, drawn scaled to HUB_WIDTH x HUB_HEIGHT
  // (640x460, same 1.39 aspect). The whole hall *and its stations* are baked into this
  // one image: the Forge furnace, the Reliquary Gate doorway, the Comms shrine and the
  // Quartermaster's rack are painted in as relics at the deck's own pixel pitch, so
  // render/hub.ts composites nothing at runtime — it only adds the turning portal rings
  // and the moving characters. Replaces the old black void + grid.
  "hub.citadel-deck": { id: "hub.citadel-deck", w: 384, h: 276 },
};

// --- weapons -------------------------------------------------------------

/**
 * A pipeline-authored world weapon sprite. Like {@link AtlasSprite} but carries the
 * **grip** (the authored pixel that sits in the character's hand — `render/draw.ts`
 * rotates the sprite about this point along the swing) instead of a feet offset.
 *
 * Legacy weapon grids ride the global `WEAPON_SCALE` (1.5) in `render/draw.ts`; an atlas
 * weapon is authored much larger, so `worldScale` here replaces that constant for it —
 * tuned so the drawn weapon spans the same world reach its predecessor grid did (an axe
 * bit wider than a torso, a spear out-reaching a sword — §13).
 */
export interface AtlasWeapon {
  readonly id: string;
  readonly w: number;
  readonly h: number;
  readonly worldScale: number;
  /** Grip pixel in authored (art) coordinates — sits in the hand. */
  readonly gripX: number;
  readonly gripY: number;
}

/**
 * Every pipeline weapon, keyed by `WeaponFamily` (`render/sprites.ts` reads this to
 * override the greyscale procedural grid). Authored pointing **+x**. Rarity colour and
 * cosmetic weapon skins are not baked in — `weaponSprite` tints the loaded PNG toward
 * the rarity colour at draw time, and a cosmetic skin still falls back to the procedural
 * grid until skins get their own pass.
 */
export const ATLAS_WEAPONS: Record<string, AtlasWeapon> = {
  // Target world reach ≈ predecessor grid width × WEAPON_SCALE (1.5):
  //   sword 19→28 · axe 16→24 · spear 24→36 · daggers 14→21 · staff 19→28 · talisman 13→20
  sword:    { id: "weapon.sword",    w: 69,  h: 15, worldScale: 0.41, gripX: 9,  gripY: 7 },
  axe:      { id: "weapon.axe",      w: 67,  h: 19, worldScale: 0.36, gripX: 9,  gripY: 13 },
  spear:    { id: "weapon.spear",    w: 118, h: 7,  worldScale: 0.31, gripX: 36, gripY: 3 },
  daggers:  { id: "weapon.daggers",  w: 44,  h: 11, worldScale: 0.47, gripX: 7,  gripY: 5 },
  staff:    { id: "weapon.staff",    w: 86,  h: 8,  worldScale: 0.33, gripX: 7,  gripY: 4 },
  talisman: { id: "weapon.talisman", w: 20,  h: 36, worldScale: 0.55, gripX: 10, gripY: 9 },

  // The other eight families (data/weapons.ts). Same methodology — target world reach
  // ≈ predecessor grid width × WEAPON_SCALE (1.5): hammer 26 · scythe 32 · rapier 36 ·
  // whip 44 · bow held (~22) · claws 29 · chakram 18 · fists 14. bow/chakram scale by
  // the axis that carries the shape (bow height, chakram width).
  hammer:   { id: "weapon.hammer",   w: 71,  h: 25, worldScale: 0.37, gripX: 5,  gripY: 12 },
  scythe:   { id: "weapon.scythe",   w: 73,  h: 38, worldScale: 0.44, gripX: 5,  gripY: 16 },
  rapier:   { id: "weapon.rapier",   w: 78,  h: 14, worldScale: 0.46, gripX: 5,  gripY: 7 },
  whip:     { id: "weapon.whip",     w: 124, h: 13, worldScale: 0.36, gripX: 4,  gripY: 6 },
  bow:      { id: "weapon.bow",      w: 14,  h: 61, worldScale: 0.36, gripX: 8,  gripY: 30 },
  claws:    { id: "weapon.claws",    w: 45,  h: 36, worldScale: 0.64, gripX: 7,  gripY: 28 },
  chakram:  { id: "weapon.chakram",  w: 40,  h: 42, worldScale: 0.45, gripX: 19, gripY: 20 },
  fists:    { id: "weapon.fists",    w: 33,  h: 38, worldScale: 0.42, gripX: 8,  gripY: 25 },
};

/**
 * **Authored weapon skins — one row per SKIN, not per family.**
 *
 * A skin is its own weapon (owner ruling, Sept 2026): Starforged is a distinct object you
 * wield, not a gold coat of paint over the sword you happen to hold. So each skin names the
 * one `WeaponFamily` it *is*, and carries its own geometry for the same reason every entry
 * in `ATLAS_WEAPONS` does — a differently-shaped weapon sits in the hand differently, so
 * the grip pixel and the world scale belong to the art, not to the family it substitutes
 * for.
 *
 * Expect roughly twenty-eight rows across the two tables when this is finished, and that is
 * not a duplicate: fourteen are the ordinary weapon families, fourteen are the skins, one
 * per family. The count looks wrong until you know that.
 *
 * **Why per-family at all** is the "may never lie" rule in `data/cosmetics.ts` — reach and
 * swing arc belong to the family and the sprite is drawn along the swing that resolved, so
 * a skin worn across families would draw a weapon that disagrees with its own hitbox.
 *
 * Empty on purpose right now. `weaponSprite` already resolves through it, so a skin with no
 * row here draws the ordinary authored weapon for the family being held — the
 * `MONSTER_SETS` precedent, where a manifest row is a statement of intent and a loaded
 * canvas is a fact. That is what lets this ship one weapon at a time.
 *
 * **Named weapons want this table, not a second one.** `docs/art-manifest.md` §5 carries an
 * open item: a named weapon renders its icon correctly but *swings as an ordinary
 * rarity-tinted family weapon* — Threshold Brand looks right in your stash and wrong in
 * your hand. The fix it describes ("a weapon-skin sprite per named weapon") is exactly the
 * row below: an authored weapon of a declared family, with its own grip and world scale.
 * Whoever picks that up should add a second **source** feeding this resolution, not a
 * parallel table — this codebase has already paid twice for one job done in two places
 * (`RARITY_WASH` forking, and the item art that `itemSprite` now funnels).
 *
 * **Precedence is settled: a named weapon beats a skin.** This was an open owner call —
 * the rarity ruling says vanity is never overruled by power, which argued for the skin,
 * while a named item's identity is deliberately not for sale (it accepts only Reforge,
 * Temper and Salvage), which argued for the named weapon. The owner ruled for the named
 * weapon in Sept 2026, in those words: *"named weapon wins"*.
 *
 * It is already implemented — see the resolution order in `resolveWeaponDraw`
 * (`render/sprites.ts`), where `namedId` suppresses the skin lookup outright rather than
 * losing a comparison to it. Do not re-open this, and do not reason from the two arguments
 * above as though they were still live; they are recorded here only so the ruling is
 * legible rather than arbitrary.
 */
export interface AtlasWeaponSkin extends AtlasWeapon {
  /** The one family this skin is a weapon of. It draws only when that family is held. */
  readonly family: string;
}

/** Keyed by `Cosmetic.id` (e.g. `skinAbyssalScythe`), not by family. */
export const ATLAS_WEAPON_SKINS: Record<string, AtlasWeaponSkin> = {
  // `worldScale` is DERIVED, never chosen — `art/weaponskins/author.ts` computes it as
  // (family.w * family.worldScale) / trimmedWidth so the skin spans exactly the world
  // length its family's own art spans. Do not hand-edit it; re-run the tool.
  skinAbyssalScythe: {
    id: "weapon.skin.abyssal-scythe", w: 73, h: 38, worldScale: 0.44,
    gripX: 5, gripY: 16, family: "scythe",
  },
  skinSeamlessSword: {
    id: "weapon.skin.seamless-sword", w: 72, h: 13, worldScale: 0.3929,
    gripX: 9, gripY: 6, family: "sword",
  },
};

// --- cosmetic layers (§15/§17.3, the "v2 redraw" gap) ---------------------

/**
 * The pipeline hero (`hero.legend-base`, 39x57) is a single flattened image — unlike the
 * procedural stack it isn't split into body/hair layers, so a cosmetic layer composites
 * directly on top of (or, for `back`, behind) it rather than onto a bare body. That needs
 * a bit of headroom the bare 28x48 canvas doesn't have: room above the head for a hat,
 * and room either side of the shoulders for wings/a cape/a tail to spread into — exactly
 * why the procedural `CHAR_W`/`CHAR_H` field is wider than the 20x22 body it holds.
 *
 * `HERO_STAGE_*` is that same idea at the pipeline's resolution: a canvas the hero PNG is
 * pasted into at a fixed offset, sized so the existing weapon/monster/boss `worldScale`
 * convention still holds — `worldScale` is world units *per authored pixel*, so padding
 * the canvas with transparent margin costs nothing and moves no footprint; only the
 * `feet` fraction needs rescaling, because it is a fraction of *canvas* height and the
 * canvas just grew. See `composePipelineHero` in `render/sprites.ts`.
 *
 * Margins are proportional to the hero they hold: ~half his width either side and ~42%
 * of his height above him, the same ratios the 28x48 v3 stage used, so the v4 redraw
 * moved the numbers without changing the rule. The hero's own head sits flush against
 * his top row and his silhouette fills his full width, so hats/ears need headroom this
 * canvas doesn't have, and wings/a cape need side margin for the same reason the
 * procedural `CHAR_W` is wider than its 20-wide body.
 */
/**
 * **The stage is sized to the hero it holds, not the other way round.**
 *
 * It used to be a fixed 79x81 and every hero had to fit a magic height into it. That
 * coupled two unrelated things to the art: the town portrait boxes are pinned against
 * `stage height x portraitScale`, so a *shorter* hero forced a *bigger* box (a smaller
 * body needs a larger whole factor, and the whole stage is magnified with it); and the
 * figure filled less and less of its own portrait as it shrank — hero v6 fills 51% of a
 * canvas sized for a hero 16 rows taller.
 *
 * Both are height problems, so height is what follows the hero:
 *
 *  - **Height** = the hero, plus the larger of ~42% of his height and whatever the tallest
 *    head-anchored cosmetic rises above the head. The first term is the proportional
 *    headroom the fixed stage was built on; the second is a floor, so a short hero cannot
 *    have a witch hat cropped off the top of the canvas.
 *  - **Width** = the hero plus half his width either side, floored at the widest cosmetic
 *    layer. Width is deliberately generous rather than tight: it feeds neither the portrait
 *    box nor the fill ratio, and a narrow stage would clip a cape at the shoulders for
 *    nothing.
 *
 * For the 39x57 hero this returns exactly `79x81` at `(20, 24)` — the four numbers that
 * used to be hardcoded — so the rewrite moves nothing that shipped. `npm run anim` asserts
 * that as an identity rather than trusting it.
 *
 * **What this does NOT fix, and it is worth being exact about it:** the legal-portrait
 * *band* is a different mechanism entirely and is untouched. The band comes from
 * `portraitSpread`, which compares the PROCEDURAL composer's 22-row body against the
 * pipeline's, each scaled by its own whole factor — the stage never enters that
 * calculation. The band exists because the procedural fallback exists, not because the
 * stage is fixed.
 */
export interface HeroStage {
  readonly w: number;
  readonly h: number;
  /** Where the hero PNG is pasted: centred, standing on the stage floor. */
  /**
   * Horizontal offset from the stage's CENTRE, not from its left edge. Every shipped layer
   * is 0 — they are all centred on the hero — and storing it this way is what lets the
   * stage width follow the hero without dragging every hat off to one side.
   */
  readonly dx: number;
  readonly dy: number;
}

/** Proportional margins, from the fixed stage this replaces: half a width, ~42% of a height. */
const STAGE_SIDE_FRAC = 0.5;
const STAGE_HEAD_FRAC = 0.42;

/**
 * What the cosmetic layers demand of any stage that has to hold them: how far the tallest
 * head-anchored layer rises above the head, how far the tallest feet-anchored one rises
 * above the floor, and the widest layer of all.
 *
 * These are floors, not the design. A back item is authored at one body's LENGTH — the
 * cape is 41 rows for a 57-row hero — so it cannot be made to fit a much shorter hero by
 * anchoring, and `floorRise` is what stops it being cropped out of existence in the
 * meantime. Cosmetics are parked, not switched off: they still render, and a layer sitting
 * wrong on a hero it was not drawn for is the accepted cost. A layer sliced off the canvas
 * is not.
 */
function cosmeticExtent(): { rise: number; floorRise: number; width: number } {
  let rise = 0, floorRise = 0, width = 0;
  for (const c of Object.values(ATLAS_COSMETICS)) {
    if (c.anchor === "head") rise = Math.max(rise, -c.dy);
    else floorRise = Math.max(floorRise, -c.dy);
    width = Math.max(width, c.w);
  }
  return { rise, floorRise, width };
}

export function heroStage(heroW: number, heroH: number): HeroStage {
  const { rise, floorRise, width } = cosmeticExtent();
  const side = Math.round(heroW * STAGE_SIDE_FRAC);
  const w = Math.max(heroW + side * 2, width);
  const h = Math.max(heroH + Math.max(Math.round(heroH * STAGE_HEAD_FRAC), rise), floorRise);
  return { w, h, dx: Math.round((w - heroW) / 2), dy: h - heroH };
}

/**
 * **One hero sprite per class** — the id a class draws instead of the shared base, or
 * `null` where nobody has drawn one yet.
 *
 * `Record<ClassId, ...>`, so a new class cannot exist without an answer here, the same
 * reason `STATION_GLYPH` is keyed on `HubStationKind`. Two ways to say "not yet", and
 * both resolve to the base rather than to a hole: `null` is *undeclared*, and an id whose
 * PNG is not committed is *declared but undrawn* — the `MONSTER_SETS` precedent, where a
 * manifest row is a statement of intent and a loaded canvas is a fact.
 *
 * The ladder is `chooseHeroArt` in `render/spriteart.ts`: this table, then
 * `SPRITE_OVERRIDES.hero`, then the procedural composite. Every rung is a fallback and
 * none of them throws.
 */
export const CLASS_HEROES: Record<ClassId, string | null> = {
  lancer: null, berserker: null, swordsman: null, magician: null, shaman: null,
  ranger: null, juggernaut: null, duelist: null, warlock: null, monk: null,
  necromancer: null, corsair: null, trickster: null, reaper: null, stormcaller: null,
  paladin: null, bard: null, alchemist: null, engineer: null, assassin: null, warden: null,
};

/**
 * Docket §36 — one authored sprite id per summon `unit`, or `null` where nobody has drawn
 * one yet. Same shape and same reason as `CLASS_HEROES` right above: `Record<string, ...>`
 * over `src/data/summons.ts`'s `SUMMON_UNITS` (walked from the ability/mutation/relic/
 * named-item tables, not typed by hand here) means a summon unit cannot exist without an
 * answer, `tools/summonart.ts` fails one that's missing, and a `null` here is the
 * `MONSTER_SETS`/`CLASS_HEROES` precedent of "undeclared" rather than "declared but the
 * PNG failed to load" — the two collapse to the same fallback either way.
 *
 * Six of the 27 total (`mirror_image`, `monk_afterimage`, `trickster_decoy`,
 * `trickster_mirror`, `trickster_mirror_self`, `trickster_lure`) never get a row here at
 * all — they're the player-copy family (`PLAYER_COPY_UNITS` in `render/minionart.ts`) and
 * resolve unconditionally to the summoning hero's own composed sprite instead.
 *
 * `id` (once authored) is `summon.<unit-id-hyphenated>` by convention, PNGs under
 * `src/render/atlas/summons/` — same shape as `reliquary.monster.*` / `tower.monster.*`.
 * Don't declare the id here before its PNG is committed in the same change (the Tower
 * tileset rule: an ATLAS row with no PNG fails `npm run smoke` and claims art the repo
 * doesn't have) — leave it `null` until then.
 */
export const SUMMON_UNIT_ART: Record<string, string | null> = {
  auto_turret: null, blood_servant: null, bone_turret: null, decoy_husk: null,
  elder_spirit: null, falcon: null, ghost_deckhand: null, grave_guard: null,
  healing_bloom: null, healing_spirit: null, kept_name: null, limbo_shade: null,
  moon_guardian: null, mortar_pod: null, reaped_wraith: null, repair_drone: null,
  shield_generator: null, siege_engine: null, skeleton_warrior: null, spirit_hawk: null,
  spirit_wolf: null,
};

/**
 * The three reserved marker colours a cosmetic-layer PNG is quantized onto in place of
 * its three recolourable regions (`Cosmetic.colors[0..2]` — primary/secondary/accent,
 * the same convention `COSMETIC_ART`'s grid keys `1`/`2`/`3` use). Chosen as saturated
 * primaries no generated art or the shared `ink` outline would ever legitimately contain,
 * so an exact-match runtime swap (`recoloredCosmetic` in `sprites.ts`) can't misfire on
 * real art. This is the §15/§17.4 "indexed-mode PNG + palette map" mechanism applied to
 * a photographic PixelLab generation instead of a hand-authored grid: Aseprite quantizes
 * the generation onto `[ink, colors[0], colors[1], colors[2]]` (four colours, chosen to
 * be the cosmetic's own default look so the quantize step has a real target to snap
 * toward) and then `replace_color` swaps each of the three onto its marker, one exact
 * match at a time. The ink outline is left alone — it already IS the palette's ink entry
 * post-quantize, so it needs no marker and never gets recoloured, exactly like the
 * procedural grids' `O`.
 */
export const COSMETIC_MARK_1 = "#ff00ff";
export const COSMETIC_MARK_2 = "#00ff00";
export const COSMETIC_MARK_3 = "#00ffff";

/**
 * A pipeline cosmetic layer. Keyed by the same string `Cosmetic.art` already points at
 * (`COSMETIC_ART`'s keys in `render/pixels.ts`) — `hatWitch`, `cape`, and so on — so a
 * migrated cosmetic needs no change in `data/cosmetics.ts`; `composePipelineHero` just
 * finds an entry here before falling back to the procedural grid of the same name.
 * `dx`/`dy` are absolute `HERO_STAGE_*` coordinates, exactly like `COSMETIC_ART`'s `dx`/
 * `dy` are absolute `CHAR_W`/`CHAR_H` coordinates today.
 */
export interface AtlasCosmetic {
  readonly id: string;
  readonly w: number;
  readonly h: number;
  readonly dx: number;
  /**
   * Vertical offset **from `anchor`**, not from the top of the stage.
   *
   * It used to be an absolute stage row, which silently bound every layer to the exact
   * height of the one hero it was tuned against: move to a hero 16px shorter and a witch
   * hat floats in the air well above the head it belongs on. With one hero that was
   * invisible. With one hero per class it is the first thing that breaks.
   */
  readonly dy: number;
  /**
   * Which part of the hero this layer hangs from. A hat, ears and glasses follow the
   * **head**; a cape and wings hang off the body and reach the ground, so they follow the
   * **feet**, which is the stage floor for every hero.
   *
   * This is a re-expression of the numbers that already shipped, not a retune:
   * `cosmeticStageXY` reproduces the previous absolute pair exactly for the 39x57 hero,
   * and `npm run heroes` asserts that as a comparison rather than trusting it.
   */
  readonly anchor: "head" | "feet";
  /**
   * This layer is **meant** to hang clear of its landmark instead of resting on it.
   *
   * A halo is the case that forced this: it is head-anchored, because it must follow the
   * top of the head when the hero's height changes, but it sits entirely above the head by
   * design. `npm run anim` asserts that a head-anchored layer lands *on* the head — a rule
   * written to catch a hat floating in the air, which is a real placement bug — and a halo
   * trips it honestly.
   *
   * Declared here rather than by loosening that rule for all twenty-four layers, so the
   * one deliberate exception is visible in the data. A floating layer is still bounded: it
   * has to stay near the head, which is what keeps this from becoming a way to opt out of
   * the check.
   */
  readonly floats?: true;
}

/**
 * Where a cosmetic layer actually lands, for a hero of a given size.
 *
 * `feet`-anchored layers do not move at all (every hero stands on the stage floor);
 * `head`-anchored ones move with the top of the hero's head, which is where the hero's
 * own height enters the picture.
 */
export function cosmeticStageXY(
  c: AtlasCosmetic, heroW: number, heroH: number,
): { dx: number; dy: number } {
  const stage = heroStage(heroW, heroH);
  return {
    dx: Math.round(stage.w / 2 - c.w / 2) + c.dx,
    dy: c.anchor === "head" ? stage.dy + c.dy : stage.h + c.dy,
  };
}

/**
 * Migrated cosmetic-layer art. Every entry here is a genuine PixelLab generation (never a
 * hand-authored placeholder) quantized onto its cosmetic's own default colours and then
 * marker-swapped per `COSMETIC_MARK_*` above — see `art/cosmetics/*.raw.png` /
 * `*.trim.png` for the pre-quantize source. A `Cosmetic.art` id with no row here (most of
 * the wardrobe, still) keeps falling back to the procedural grid; nothing breaks either
 * way, exactly like every other half-migrated atlas table.
 *
 * Placement (`dx`/`dy`) was tuned against `HERO_STAGE_*` above: hats/ears sit on the
 * hero's own head (rows ~20-36 of the stage), face items centre on its eye row (~30-32),
 * and `back` items — drawn *behind* the hero, at shoulder height (~32-40) — rely on the
 * hero's silhouette being narrower than the stage to peek out at the sides without the
 * base needing its own separate back-item layer.
 */
export const ATLAS_COSMETICS: Record<string, AtlasCosmetic> = {
  // `dx` is an offset from the stage's CENTRE and `dy` from the layer's `anchor`. Every
  // number below is the shipped absolute pair minus the anchor it belongs to (centre 39.5,
  // head-top 24, stage floor 81 for the 39x57 hero) — arithmetic on what already shipped,
  // not a retune, and `npm run anim` asserts the old absolute pairs come back out.
  //
  // Every `dx` is 0 because every layer is centred on the hero. That is worth seeing: the
  // horizontal half of this was never carrying information, only a stage width.
  hatWitch: { id: "cosmetic.hat-witch", w: 17, h: 19, dx: 0, dy: -14, anchor: "head" },
  // Shared by hatCrown (legendary) and hatUnspoken (divine, same grid in pixels.ts too).
  hatCrown: { id: "cosmetic.hat-crown", w: 17, h: 10, dx: 0, dy: -5, anchor: "head" },
  earsCat: { id: "cosmetic.ears-cat", w: 15, h: 7, dx: 0, dy: -3, anchor: "head" },
  earsHorn: { id: "cosmetic.ears-horn", w: 13, h: 8, dx: 0, dy: -2, anchor: "head" },
  faceGlasses: { id: "cosmetic.face-glasses", w: 15, h: 5, dx: 0, dy: 7, anchor: "head" },
  faceVisor: { id: "cosmetic.face-visor", w: 15, h: 3, dx: 0, dy: 8, anchor: "head" },
  // Back items hang off the body and reach the ground, so they are anchored to the stage
  // floor: the hem stays on the ground for any hero. **This is the least-wrong of the two
  // anchors, not a fix** — a cape is authored at one body's LENGTH (41px for a 57px hero),
  // so on a materially shorter hero it will still read wrong however it is anchored, and
  // that wants the cosmetic rework the owner has parked rather than a number nudged here.
  cape: { id: "cosmetic.back-cape", w: 25, h: 26, dx: 0, dy: -28, anchor: "feet" },
  // `Cosmetic.art` id for backAngel.
  wingsAngel: { id: "cosmetic.back-wings-angel", w: 29, h: 26, dx: 0, dy: -32, anchor: "feet" },

  // The rest of the wardrobe, drawn against the same measured hero. Every row here is
  // emitted by `art/cosmetics/author.ts` — re-run it rather than hand-editing a number.
  hatStraw: { id: "cosmetic.hat-straw", w: 19, h: 8, dx: 0, dy: -3, anchor: "head" },
  hatBeanie: { id: "cosmetic.hat-beanie", w: 15, h: 11, dx: 0, dy: -3, anchor: "head" },
  hatChef: { id: "cosmetic.hat-chef", w: 11, h: 11, dx: 0, dy: -8, anchor: "head" },
  hatFlower: { id: "cosmetic.hat-flower", w: 13, h: 4, dx: 0, dy: -2, anchor: "head" },
  hatTop: { id: "cosmetic.hat-top", w: 17, h: 14, dx: 0, dy: -11, anchor: "head" },
  // The one declared floater — see `floats` on `AtlasCosmetic`.
  hatHalo: { id: "cosmetic.hat-halo", w: 13, h: 7, dx: 0, dy: -8, anchor: "head", floats: true },
  earsBunny: { id: "cosmetic.ears-bunny", w: 11, h: 12, dx: 0, dy: -9, anchor: "head" },
  earsFox: { id: "cosmetic.ears-fox", w: 15, h: 6, dx: 0, dy: -1, anchor: "head" },
  earsAntenna: { id: "cosmetic.ears-antenna", w: 19, h: 10, dx: 0, dy: -7, anchor: "head" },
  faceBlush: { id: "cosmetic.face-blush", w: 13, h: 3, dx: 0, dy: 10, anchor: "head" },
  faceEyepatch: { id: "cosmetic.face-eyepatch", w: 15, h: 5, dx: 0, dy: 7, anchor: "head" },
  faceFangs: { id: "cosmetic.face-fangs", w: 7, h: 2, dx: 0, dy: 12, anchor: "head" },
  // `dx` is nonzero for the two that hang off ONE side — a tail at a hip, a book at a
  // shoulder. Everything else is centred, which is why every other dx here is 0.
  tailCat: { id: "cosmetic.back-tail-cat", w: 8, h: 18, dx: 10, dy: -27, anchor: "feet" },
  wingsButterfly: { id: "cosmetic.back-wings-butterfly", w: 31, h: 21, dx: 0, dy: -30, anchor: "feet" },
  tome: { id: "cosmetic.back-tome", w: 11, h: 17, dx: 8, dy: -24, anchor: "feet" },
  wingsDemon: { id: "cosmetic.back-wings-demon", w: 27, h: 28, dx: 0, dy: -33, anchor: "feet" },
};
