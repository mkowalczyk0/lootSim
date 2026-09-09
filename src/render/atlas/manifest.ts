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
  // v4 answers all three: one unified charcoal/ash mass, no bright note anywhere, and a
  // plain calm face with small dark eyes. The extra 9 rows of height are what make that
  // face drawable at all (§17.1's "author larger, for clarity").
  //
  // 57 is not the tallest the Hero/Style portrait-spread bound in `tools/smoke.ts` permits;
  // it is one of a set of legal heights. `portraitScale` rounds to a *whole* factor, so the
  // spread oscillates instead of growing with height — the bound is a set of windows, not a
  // maximum, and 59-77 is a dead zone. Don't copy the window list into a comment: `npm run
  // smoke` derives it and prints it next to the portrait sizes.
  //
  // Footprint unchanged: 57 * 0.5614 = 32, the same height as v1/v2/v3, so no hitbox /
  // telegraph / camera moves. `feet` stays 0.03 because the sliver it describes is
  // `feet * h * worldScale` = `feet * 32` — invariant under a height change. The hub
  // draws it larger through its own figure-height rule (render/hub.ts) — cosmetic and
  // local to the hub scene.
  "hero.legend-base": { id: "hero.legend-base", w: 39, h: 57, worldScale: 0.5614, feet: 0.03 },

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

  // --- bosses (§11) --- worldScale lands the art on the full old grid extent
  // (26 × spriteScale from data/bosses.ts): warden 100, choir 92, colossus 134,
  // herald 110, nameless 112. feet ≈ 0 — trimmed, standing on the bottom row.
  "boss.warden":              { id: "boss.warden",              w: 57, h: 89, worldScale: 1.12, feet: 0.03 },
  "boss.corrupted-saint":     { id: "boss.corrupted-saint",     w: 76, h: 92, worldScale: 1.09, feet: 0.03 },
  "boss.gravebound-colossus": { id: "boss.gravebound-colossus", w: 84, h: 87, worldScale: 1.54, feet: 0.03 },
  "boss.herald-unspoken":     { id: "boss.herald-unspoken",     w: 76, h: 94, worldScale: 1.17, feet: 0.02 },
  "boss.nameless":            { id: "boss.nameless",            w: 73, h: 87, worldScale: 1.29, feet: 0.03 },

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
  // `w * cols` = 375 wide. Frame 0 is pixel-identical to the sprite that shipped before
  // this, which is what makes the static fallback and the first frame the same picture.
  "boss.ferryman":            { id: "boss.ferryman",            w: 75,  h: 107, worldScale: 0.9318, feet: 0.03,
    anim: { cols: 5, tags: { idle: { from: 0, to: 4, seconds: 0.22, loop: true } } } },
  // Animated: `w`/`h` are ONE FRAME. Height unchanged, so `worldScale` is unchanged and the
  // encounter's world height (110.0) is exactly where it was tuned.
  "boss.war-queen":           { id: "boss.war-queen",           w: 98,  h: 108, worldScale: 1.0185, feet: 0.03,
    anim: { cols: 5, tags: { idle: { from: 0, to: 4, seconds: 0.24, loop: true } } } },
  // NOT animated, deliberately — see docs/animation.md "A sprite whose accent is too small
  // to survive generation". Its violet eyes are two pixels; two attempts, the second
  // starting from a much brighter accent, both came back with the eyes dimmed below the
  // hero's own skin in several frames, which `npm run chroma` fails. A static boss is
  // exactly today's behaviour, so this is a hold rather than a regression.
  "boss.labyrinth-minotaur":  { id: "boss.labyrinth-minotaur",  w: 102, h: 106, worldScale: 1.2642, feet: 0.03 },
  // Animated. The set-trim is two columns narrower than the still (100 -> 98); height is
  // unchanged, and `worldScale` is world units per PIXEL, so the encounter's world height
  // (100.3) does not move.
  "boss.exiled-tyrant":       { id: "boss.exiled-tyrant",       w: 98,  h: 103, worldScale: 0.9738, feet: 0.03,
    anim: { cols: 5, tags: { idle: { from: 0, to: 4, seconds: 0.25, loop: true } } } },

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
  "prop.citadel-forge":    { id: "prop.citadel-forge",    w: 68, h: 86, worldScale: 0.47, feet: 0.03 },
  "prop.citadel-rack":     { id: "prop.citadel-rack",     w: 57, h: 72, worldScale: 0.53, feet: 0.03 },
  "prop.citadel-shrine":   { id: "prop.citadel-shrine",   w: 48, h: 73, worldScale: 0.49, feet: 0.03 },
  "prop.citadel-starmap":  { id: "prop.citadel-starmap",  w: 44, h: 70, worldScale: 0.49, feet: 0.03 },
  "prop.citadel-wartable": { id: "prop.citadel-wartable", w: 78, h: 42, worldScale: 0.57, feet: 0.05 },
  "prop.citadel-altar":    { id: "prop.citadel-altar",    w: 55, h: 75, worldScale: 0.45, feet: 0.05 },
  "prop.citadel-dummy":    { id: "prop.citadel-dummy",    w: 27, h: 82, worldScale: 0.41, feet: 0.03 },
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
  boss: "boss.warden",
  bossChoir: "boss.corrupted-saint",
  bossColossus: "boss.gravebound-colossus",
  bossHerald: "boss.herald-unspoken",
  bossNameless: "boss.nameless",
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
  },

  /**
   * The Tower (§6) — **named, deliberately undrawn.** Heaven is Order, and Order lives in
   * silhouette: symmetry, repetition, geometry, against Hell's asymmetry and appetite. A
   * palette swap of the Reliquary's roster would be white demons, which is why these are
   * their own sprites rather than a tint. Until the PNGs land, every id below resolves to
   * nothing and the Tower draws today's art — no worse than before, and no pretending.
   */
  tower: {
    grunt: "tower.monster.power",
    archer: "tower.monster.virtue-lancer",
    brute: "tower.monster.throne-bearer",
    caster: "tower.monster.dominion-herald",
    swarmer: "tower.monster.halo-fragment",
  },
};

export const TILESETS: Record<string, AtlasTileset> = {
  // The Delve (§5) — one per legacy biome, themed toward the Nine Circles it's
  // becoming. Floor mid-tone, wall near-black, on the ash/Hell palette.
  "tiles.delve-limbo":    { id: "tiles.delve-limbo",    w: 64, h: 64, tile: 16 }, // Training Grounds — Circle I, drained ash flagstone
  "tiles.delve-gluttony": { id: "tiles.delve-gluttony", w: 64, h: 64, tile: 16 }, // Whispering Forest — Circle III, bile-stained stone, wet rot
  "tiles.delve-cave":     { id: "tiles.delve-cave",     w: 64, h: 64, tile: 16 }, // Dark Cave — frozen cavern rock, ice rime
  "tiles.delve-wrath":    { id: "tiles.delve-wrath",    w: 64, h: 64, tile: 16 }, // Ashen Wastes — Circle V, scorched flagstone, dull embers
  "tiles.delve-heresy":   { id: "tiles.delve-heresy",   w: 64, h: 64, tile: 16 }, // Dragon's Lair — Circle VI, black cathedral, gold used wrong
  "tiles.delve-veil":     { id: "tiles.delve-veil",     w: 64, h: 64, tile: 16 }, // The Veil — Abyss-touched, warped violet-black stone

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
export const HERO_STAGE_W = 79;
export const HERO_STAGE_H = 81;
/** Where `hero.legend-base` itself is pasted into the stage. */
export const HERO_STAGE_DX = 20;
export const HERO_STAGE_DY = 24;

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
  readonly dy: number;
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
  hatWitch: { id: "cosmetic.hat-witch", w: 39, h: 28, dx: 20, dy: 2 },
  // Shared by hatCrown (legendary) and hatUnspoken (divine, same grid in pixels.ts too).
  hatCrown: { id: "cosmetic.hat-crown", w: 25, h: 16, dx: 27, dy: 12 },
  earsCat: { id: "cosmetic.ears-cat", w: 17, h: 13, dx: 31, dy: 18 },
  earsHorn: { id: "cosmetic.ears-horn", w: 21, h: 15, dx: 29, dy: 23 },
  faceGlasses: { id: "cosmetic.face-glasses", w: 21, h: 7, dx: 29, dy: 31 },
  faceVisor: { id: "cosmetic.face-visor", w: 21, h: 7, dx: 29, dy: 31 },
  // `Cosmetic.art` id for backCape.
  cape: { id: "cosmetic.back-cape", w: 59, h: 41, dx: 10, dy: 35 },
  // `Cosmetic.art` id for backAngel.
  wingsAngel: { id: "cosmetic.back-wings-angel", w: 69, h: 41, dx: 5, dy: 30 },
};
