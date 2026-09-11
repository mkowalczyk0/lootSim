/**
 * Biome styling and generation preferences. The Delve is the Nine Circles of Hell and
 * then the Veil (`DELVE_LADDER`), and crossing into a circle changes the palette, the
 * props scattered around the floor, the layouts
 * the generator is allowed to pick, and which hazards can appear.
 *
 * Pure data — no DOM, no canvas, no simulation state.
 */

import type { Element } from "./elements";
import type { EnemyKind } from "./enemies";
import type { TrapKind } from "./traps";

export type PropKind =
  | "torch" | "bones" | "mushroom" | "crystal" | "rock"
  // Heavy realm dressing — big grimdark set pieces laid on by `dressFloor` in
  // level.ts (a separate pass from the biome `props` scatter, on its own rng).
  // Atlas-only (render/atlas/props/prop.<realm>-*); any the renderer can't
  // resolve is skipped, so they degrade cleanly.
  | "brazier" | "statue" | "altar" | "sarcophagus" | "gibbet" | "skulls"
  | "handstone" | "urn" | "pillar" | "casket" | "wargrave";

/** The shapes the level generator knows how to build. */
export type LayoutKind = "open" | "pillars" | "chambers" | "gauntlet" | "rubble" | "ring";

export const LAYOUT_LABELS: Record<LayoutKind, string> = {
  open: "Open Hall",
  pillars: "Pillared Hall",
  chambers: "Broken Chambers",
  gauntlet: "The Gauntlet",
  rubble: "Collapsed Warren",
  ring: "Sealed Rotunda",
};

export interface BiomeStyle {
  readonly name: string;
  /**
   * A corner Wang tileset id (`render/atlas/manifest.ts` → `TILESETS`) for the
   * floor. When set and loaded, the renderer stamps the floor and walls from it
   * instead of the flat `bakeFloor` fill. Optional and degrading — an unset or
   * not-yet-loaded tileset just falls back to `tint` / `wall` below.
   */
  readonly tileset?: string;
  /**
   * A monster sprite set id (`render/atlas/manifest.ts` → `MONSTER_SETS`). Which pictures
   * this place's monsters draw — **and nothing else about them.** The archetypes, their
   * stats, their behaviour and their names are untouched: a `grunt` here is the same grunt
   * that fights the same way at the same numbers, wearing a different face.
   *
   * Optional and degrading, exactly like `tileset` above: an unset set, an unknown id, or
   * a set whose PNGs aren't committed all fall back to the game-wide default art rather
   * than breaking a screen. That is what lets a realm's sprite set be *named* here before
   * anybody has drawn it — the precedent the Tower's tilesets already set.
   */
  readonly monsterSet?: string;
  /** Floor base color. */
  readonly tint: string;
  /** Scattered tiles drawn over the base, for texture. */
  readonly floorAlt: string;
  /** Top face of a wall block, and the darker side face below it. */
  readonly wall: string;
  readonly wallSide: string;
  /** Trim, glows and props. */
  readonly accent: string;
  readonly props: readonly PropKind[];
  readonly layouts: readonly LayoutKind[];
  readonly traps: readonly TrapKind[];
  /**
   * What the local wildlife is made of. Monsters here are increasingly likely to be
   * infused with this element as you descend, which is what turns resistance on a
   * chestplate from a number into a decision about where you're going.
   */
  readonly element: Element;
  /**
   * Flavor names for the ordinary archetypes, so a place's roster reads as its own.
   *
   * Optional and additive: a biome that sets nothing (every Delve biome) leaves the
   * archetype's own name alone. A Reliquary sector says the same thing on `PlanetSpec`
   * and that one still wins — the sector is the more specific answer, and moving it
   * would rewrite six specs to say what they already say. The Tower sets it here because
   * the Tower has no spec of its own: its three bands *are* three places, and the
   * celestial orders belong to the band rather than to the run (`data/tower.ts`).
   *
   * Same eleven archetypes fighting the same eleven ways underneath. This is a name.
   */
  readonly enemyNames?: Partial<Record<EnemyKind, string>>;
}

/**
 * The painted circles, as named constants, because four unpainted circles borrow their
 * look below and a borrow has to name the thing it borrows.
 *
 * Every palette value on a painted circle is the one its sheet was graded and measured
 * against in `npm run smoke` (floor-vs-wall and floor-vs-infused-monster contrast) — the
 * tint is part of the measurement, which is why a borrower takes the whole look rather
 * than the sheet alone.
 */
const LIMBO: BiomeStyle = {
  name: "Limbo",
  tileset: "tiles.delve-limbo",
  monsterSet: "delve",
  tint: "#2c3040", floorAlt: "#333849", wall: "#4a5165", wallSide: "#272c39",
  accent: "#7dd3fc",
  props: ["torch", "rock"],
  layouts: ["open", "pillars"],
  traps: ["spike"],
  // Physical on purpose: nothing burning yet, nothing to infuse with. The first five
  // floors are where a new character learns the game, and a resistance decision on
  // floor two is a decision nobody is equipped to make.
  element: "physical",
};

const GLUTTONY: BiomeStyle = {
  name: "Gluttony",
  tileset: "tiles.delve-gluttony",
  monsterSet: "delve",
  tint: "#1e3326", floorAlt: "#24402d", wall: "#3c5a3f", wallSide: "#1a2c1e",
  accent: "#86efac",
  props: ["mushroom", "rock", "bones"],
  layouts: ["open", "rubble", "chambers"],
  traps: ["spike", "mire"],
  element: "poison",
};

const WRATH: BiomeStyle = {
  name: "Wrath",
  tileset: "tiles.delve-wrath",
  monsterSet: "delve",
  tint: "#33241d", floorAlt: "#3d2b21", wall: "#5c4335", wallSide: "#251a14",
  accent: "#fb923c",
  props: ["bones", "rock", "torch"],
  layouts: ["gauntlet", "open", "chambers", "pillars"],
  traps: ["flame", "spike", "turret"],
  element: "fire",
};

const HERESY: BiomeStyle = {
  name: "Heresy",
  tileset: "tiles.delve-heresy",
  monsterSet: "delve",
  tint: "#3a1c1c", floorAlt: "#472222", wall: "#6b3535", wallSide: "#2a1212",
  accent: "#ef4444",
  props: ["bones", "torch", "crystal"],
  layouts: ["ring", "chambers", "gauntlet", "pillars"],
  traps: ["flame", "saw", "turret"],
  element: "lightning",
};

/**
 * The ninth circle is frozen — "unlike the stereotypical fiery Hell, this area should be
 * frozen; the deepest parts of Hell become silent, cold, and nearly empty"
 * (`docs/game_story_worldbuilding.md`, Circle IX). The sheet is the frozen cavern rock
 * that shipped as the Dark Cave; it was already ice, it just sat at the wrong depth.
 */
const TREACHERY: BiomeStyle = {
  name: "Treachery",
  tileset: "tiles.delve-cave",
  monsterSet: "delve",
  tint: "#241f2e", floorAlt: "#2c2637", wall: "#463c56", wallSide: "#1c1826",
  accent: "#c084fc",
  props: ["crystal", "rock", "bones"],
  layouts: ["rubble", "pillars", "gauntlet", "ring"],
  traps: ["spike", "saw", "mire"],
  element: "cold",
};

/** Past the last circle. Not Hell's ground any more (`data/layers.ts`, the Hell Endgame). */
const THE_VEIL: BiomeStyle = {
  name: "The Veil",
  tileset: "tiles.delve-veil",
  monsterSet: "delve",
  tint: "#2a1836", floorAlt: "#331d42", wall: "#4e2f63", wallSide: "#1e1128",
  accent: "#ff1493",
  props: ["crystal", "bones", "torch"],
  layouts: ["ring", "gauntlet", "rubble", "chambers"],
  traps: ["turret", "saw", "flame", "mire"],
  element: "void",
};

/**
 * The look of a painted circle — sheet and every palette value — for a circle whose own
 * sheet is not committed yet. See `BORROWED_LOOKS` below for why this is a whole look and
 * not just a tileset id.
 */
function lookOf(lender: BiomeStyle): Pick<BiomeStyle, "tileset" | "tint" | "floorAlt" | "wall" | "wallSide" | "accent"> {
  return {
    tileset: lender.tileset, tint: lender.tint, floorAlt: lender.floorAlt,
    wall: lender.wall, wallSide: lender.wallSide, accent: lender.accent,
  };
}

/**
 * The four circles without a sheet of their own yet. Each borrows a painted circle's
 * look, declared in `BORROWED_LOOKS`; their own palettes are authored in
 * `docs/art-style-guide.md` §5 and land with the sheet, in the same commit that removes
 * the borrow line.
 */
const LUST: BiomeStyle = {
  name: "Lust",
  ...lookOf(THE_VEIL), // §5: bruised violet #6b3560, low red — luring lights, grasping hands
  monsterSet: "delve",
  props: ["torch", "crystal", "bones"],
  layouts: ["chambers", "pillars", "ring"],
  traps: ["spike", "mire"],
  element: "void",
};

const AVARICE: BiomeStyle = {
  name: "Avarice",
  ...lookOf(HERESY), // §5: tarnished gold #7a5a2a over grime — coin drifts, treasure cages
  monsterSet: "delve",
  props: ["torch", "bones", "rock"],
  layouts: ["chambers", "rubble", "gauntlet", "pillars"],
  traps: ["spike", "saw", "mire"],
  element: "lightning",
};

const VIOLENCE: BiomeStyle = {
  name: "Violence",
  ...lookOf(THE_VEIL), // §5: blood-dark #3a1c1c, iron — an eternal battlefield, siege engines
  monsterSet: "delve",
  props: ["bones", "bones", "torch", "rock"],
  layouts: ["open", "gauntlet", "pillars", "chambers"],
  traps: ["flame", "spike", "turret", "saw"],
  element: "fire",
};

const FRAUD: BiomeStyle = {
  name: "Fraud",
  ...lookOf(TREACHERY), // §5: palettes that don't quite match themselves — mimics, false portals
  monsterSet: "delve",
  props: ["crystal", "torch", "bones"],
  layouts: ["ring", "chambers", "rubble", "gauntlet"],
  traps: ["turret", "saw", "mire", "spike"],
  element: "poison",
};

/**
 * A circle drawing another circle's sheet, declared so it can never be accidental — the
 * same rule `SHARED_MONSTER_SETS` (render/atlas/manifest.ts) applies to a roster, and for
 * the same reason: two places quietly resolving to one picture is the defect the seam
 * exists to surface. `npm run world` fails an undeclared share, fails a declared one whose
 * two sides no longer match (so landing the real sheet *forces* the line out rather than
 * leaving a stale claim), and prints every borrow so a reader sees four temporary lines
 * rather than nothing.
 *
 * **Every borrow here is temporary**, waiting on a `tiles.delve-<circle>` sheet from the
 * art side (`docs/art-wave-2.md` §5b). The lender was chosen by measurement, not
 * adjacency: the smoke test's contrast gates measure a sheet under a tint against a
 * monster infused with the floor's element, and a borrow that put a new (sheet, element)
 * pair in front of that gate had to clear the bar before it was written down — fire on
 * the Heresy sheet does not (25 against a bar of 28), on the Wrath sheet it is the
 * owner-pinned collision, and on the Veil it clears by twice the margin of anything else.
 * That is why Violence is on the Veil rather than on the circle next to it.
 */
export const BORROWED_LOOKS: readonly { readonly borrower: string; readonly lender: string }[] = [
  { borrower: "Lust", lender: "The Veil" },
  { borrower: "Avarice", lender: "Heresy" },
  { borrower: "Violence", lender: "The Veil" },
  { borrower: "Fraud", lender: "Treachery" },
];

/**
 * The Delve's ladder: the Nine Circles in the worldbuilding doc's order, then the Veil.
 *
 * A rung is the first depth of a circle. The edges are not arithmetic: the layer table
 * (`data/layers.ts`, untouched by the re-cut) fixes 1–5 as Limbo, 6–15 as the circles of
 * appetite and 16–25 as the circles that are ideas, and 26 as where the ground stops
 * being Hell's. Three circles in ten floors and five in ten is what those bands hold, and
 * the extra floor in the appetite band goes to Avarice, the widest appetite. Boss floors
 * are every fifth depth regardless (`bossFor` is not this table's business): 15 closes
 * Avarice, 20 opens Violence, 25 closes Treachery.
 *
 * The alternative — nine circles over 1–30, the Veil from 31 — would buy a third floor
 * per idea circle by moving the Hell Endgame edge, which would move the Proving at depth
 * 30 off the Abyss's ground and re-baseline the very reference `npm run world` measures
 * this table against. Two-floor circles at 16–25 are the price of not doing that
 * (`docs/nine-circles.md`).
 */
export const DELVE_LADDER: readonly { readonly from: number; readonly biome: BiomeStyle }[] = [
  { from: 1, biome: LIMBO },
  { from: 6, biome: LUST },
  { from: 9, biome: GLUTTONY },
  { from: 12, biome: AVARICE },
  { from: 16, biome: WRATH },
  { from: 18, biome: HERESY },
  { from: 20, biome: VIOLENCE },
  { from: 22, biome: FRAUD },
  { from: 24, biome: TREACHERY },
  { from: 26, biome: THE_VEIL },
];

/** Every Delve biome in ladder order — the nine circles, then the Veil. */
export const BIOMES: readonly BiomeStyle[] = DELVE_LADDER.map((r) => r.biome);

/** The rung a depth stands on. Anything below 1 reads as 1; past the last rung stays there. */
function rungFor(depth: number): number {
  const d = Math.max(1, Math.floor(depth));
  let i = 0;
  while (i + 1 < DELVE_LADDER.length && DELVE_LADDER[i + 1]!.from <= d) i++;
  return i;
}

export function biomeFor(depth: number): BiomeStyle {
  return DELVE_LADDER[rungFor(depth)]!.biome;
}

/**
 * The band of depths a depth's circle covers, inclusive; `to` is `Infinity` on the last
 * rung. What a floor's numeral counts from (`floorName` in data/depth.ts) — "Gluttony I"
 * is depth 9, not depth 6 with a five-floor cycle bolted on.
 */
export function delveBandFor(depth: number): { readonly from: number; readonly to: number } {
  const i = rungFor(depth);
  const next = DELVE_LADDER[i + 1];
  return { from: DELVE_LADDER[i]!.from, to: next ? next.from - 1 : Infinity };
}
