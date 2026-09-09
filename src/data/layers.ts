/**
 * The layers of the war — where in the world a floor is (UAT §23).
 *
 * The Citadel of the Threshold stands in Purgatory between two wounds. **The Delve** is
 * where Hell rose, and descending it passes through the circles toward the Abyss. **The
 * Tower** is where Heaven descended, and climbing it passes through the celestial orders
 * toward things nobody has properly perceived. The Keepers' doctrine
 * (`docs/game_story_worldbuilding.md`, THE KEEPERS OF THE THRESHOLD) is one line about
 * each: *Heaven must not descend. Hell must not ascend.* Every rift, and the Ashen
 * Reliquary, sit off both ladders in the Threshold itself, made of what fell from either
 * side.
 *
 * §23 asked for that to be **legible** — "layers/unlocks" rather than "disconnected
 * content tiers" — so this file is a *reading* of the depth ladders that already exist,
 * not a new one. A layer is a named band of depths (or heights) on one axis, the realm it
 * belongs to, and one line of lore. Nothing in the simulation reads a layer: `profileFor`
 * still takes an effective depth plus a `danger` and the one curve does the rest. Layers
 * only change what the screen says — the Dive list groups its floors under layer headers,
 * the asides say what the layer is, and the HUD says where you are standing. Biome names,
 * tilesets and floor names are untouched, and the bands sit exactly on the five-depth
 * boundaries `biomeFor` already changes at (`tools/world.ts` pins that).
 *
 * **One answer for every run.** `layerFor(config)` maps *any* `RunConfig` to a layer — the
 * Delve by depth, each rift to the realm its own `RunMode.lore` already says it tore into
 * — for the same reason `data/encounters.ts` exists: a screen that worked out "where am
 * I" from its own copy of these rules would be a second source of truth and the first
 * thing to go stale.
 *
 * **The lore here answers a different question from `RunMode.lore`**, deliberately, so the
 * two read as a pair rather than as the same sentence twice. A mode's line says *what this
 * place is* (UAT §22); a layer's line says *where in the war it sits*. `tools/world.ts`
 * fails a layer line that duplicates a mode line. Every clause is quotation from
 * `docs/game_story_worldbuilding.md` (Purgatory, the Keepers, the Nine Circles, the Abyss,
 * Heaven, the Celestial Hierarchy, the rift taxonomy) or from the palette and feel already
 * authored in `docs/art-style-guide.md` §5–§6 — the doc is read-only and it is the
 * tiebreaker, so none of this is invented cosmology.
 *
 * **`raidId` names the raid holding a layer's gate (UAT §15)**, and as of the raid pass it
 * is filled in on four of them. A raid is not a boss floor and it is not a depth; it is
 * *the thing standing at a layer*, and this is the address it hangs from. The doc's four
 * example raids sorted cleanly by layer and that sorting is what shipped: the Queen of the
 * Seventh Circle into the Hell Layers, the Minotaur of the Ninth Labyrinth into the Hell
 * Endgame where the ground stops being Hell's, the Tyrant of the First Heavens into the
 * Celestial Endgame, the Ferryman into the Threshold.
 *
 * **It gates nothing on either ladder.** Nothing in the simulation reads a layer, and that
 * has not changed: `raidId` is a *reading* — this band has a thing in it — and the only
 * gate involved is the raid's own (`raidUnlocked` in `data/raids.ts`, keyed on the account
 * frontier). Descending or climbing past a layer never asks whether its raid is dead.
 * `tools/world.ts` and `tools/raids.ts` between them pin both halves: every id resolves to
 * a real raid, and every raid names a layer that names it back.
 *
 * Pure data. Nothing here imports from the simulation.
 */

import type { RunConfig } from "./modes";

/** Which ladder a layer sits on. `rift` is off both: the Threshold, and what fell into it. */
export type WorldAxis = "down" | "up" | "rift";
/** Whose ground it is. Four names, from THE THREE-SIDED COSMOLOGY plus the middle kingdom. */
export type Realm = "threshold" | "hell" | "abyss" | "heaven";

export interface WorldLayer {
  readonly id: string;
  /** What the screen calls it — §23's own words for the bands it named. */
  readonly name: string;
  readonly axis: WorldAxis;
  readonly realm: Realm;
  /** First depth (or height) in the band, 1-based, inclusive. Always 1 on a `rift` layer. */
  readonly from: number;
  /** Last depth in the band, inclusive. `Infinity` in the band a ladder ends in. */
  readonly to: number;
  /** Where in the war this sits. Not what the place is — that is `RunMode.lore`. */
  readonly lore: string;
  /**
   * The raid standing at this layer's gate (UAT §15) — a `RaidSpec.id` from
   * `data/raids.ts`, or null for a band nothing is holding. Read by the screens and by
   * `raidForLayer`; never by the simulation, which reads no layer at all.
   */
  readonly raidId: string | null;
}

/**
 * The descent, in §23's own four names. The bands follow `biomeFor`'s five-depth buckets:
 * Limbo is the Surface, the appetite circles are the Deep Delve, the idea circles are the
 * Hell Layers, and from depth 26 the ground stops being Hell's.
 *
 * Depth 30 — the Proving — falls inside the last band on purpose. The bottom of the Delve
 * is where the Abyss keeps the part of your Legend you never recovered (`data/legends.ts`),
 * so the layer holding it is the Abyss's, not Hell's.
 */
export const DOWN_LAYERS: readonly WorldLayer[] = [
  {
    id: "surface", name: "The Surface", axis: "down", realm: "threshold", from: 1, to: 5,
    lore: "Purgatory giving way to Limbo, the first circle: grey fog, ruined columns, "
      + "nothing burning yet. What walks here are forgotten souls, ancient spirits and "
      + "lost heroes — the ones no judgment ever got around to. Not damned. Just still here.",
    raidId: null,
  },
  {
    id: "deep-delve", name: "The Deep Delve", axis: "down", realm: "hell", from: 6, to: 15,
    lore: "Below Limbo, Hell has structure: circles, rulers, judgment. The upper ones are "
      + "the circles of appetite, and everything in them is still hungry. This is roughly "
      + "where the Keepers' maps stop agreeing with the ground.",
    raidId: null,
  },
  {
    id: "hell-layers", name: "The Hell Layers", axis: "down", realm: "hell", from: 16, to: 25,
    lore: "Deeper down Hell looks less like fire and more like an idea: rage, false faith, "
      + "a war that never finished. Black cathedrals with the gold used wrong. Not "
      + "everything here started as a demon. Some of it started as a saint.",
    raidId: "queen-of-the-seventh-circle",
  },
  {
    id: "hell-endgame", name: "The Hell Endgame", axis: "down", realm: "abyss", from: 26, to: Infinity,
    lore: "Past the last circle the ground stops being Hell's. Hell thins out and the "
      + "Abyss shows through, and the Abyss keeps nothing the way it found it. The Keepers "
      + "have no name for what stands at the bottom. Neither does it.",
    raidId: "minotaur-of-the-ninth-labyrinth",
  },
];

/**
 * The ascent, in §23's own three names, on the same idiom. Palette and feel per
 * `docs/art-style-guide.md` §6: almost welcoming at the base, bleaching toward total
 * symmetry at the top. Heaven is **Order**, and it gets worse the higher you go.
 *
 * Authored here in Part A alongside the descent, before the Tower mode exists to walk it,
 * because the whole §23 ask is that the two ladders be halves of one structure. A table
 * with only the down half would be the disconnected-tiers problem with a new name on it.
 */
export const UP_LAYERS: readonly WorldLayer[] = [
  {
    id: "tower-base", name: "The Tower Base", axis: "up", realm: "heaven", from: 1, to: 5,
    lore: "The lowest floors of Heaven's descent are almost welcoming: warm stone, clean "
      + "gold, a cathedral somebody has kept tidy. Almost. Nothing here is permitted to "
      + "deviate from its place, and shortly it will expect the same of you.",
    raidId: null,
  },
  {
    id: "heaven-layers", name: "The Heaven Layers", axis: "up", realm: "heaven", from: 6, to: 25,
    lore: "Higher up the warmth goes out of it: repeating geometry, seamless floors, no "
      + "shadow to stand in. The celestial orders hold these floors — Powers who fight, "
      + "Thrones who judge, Dominions who command. None of them are negotiating.",
    raidId: null,
  },
  {
    id: "celestial-endgame", name: "The Celestial Endgame", axis: "up", realm: "heaven", from: 26, to: Infinity,
    lore: "Near the top the light stops being light and starts being a weapon, and the "
      + "symmetry is total enough to lose your footing in. Above the orders are things "
      + "nobody has properly perceived. The Keepers would rather Heaven kept them.",
    raidId: "tyrant-of-the-first-heavens",
  },
];

/**
 * Off both ladders: the Threshold, and the two circles a rift can tear a piece of loose.
 *
 * These say **where** a rift sits in the structure, which is the half `RunMode.lore` does
 * not cover — that one says what a rift *is*. The Rifts and Reliquary screens show the
 * pair, and `tools/world.ts` fails either line if it ever becomes a restatement of the other.
 */
export const RIFT_LAYERS: Record<"threshold" | "avarice" | "abyss", WorldLayer> = {
  threshold: {
    id: "threshold", name: "The Threshold", axis: "rift", realm: "threshold", from: 1, to: Infinity,
    lore: "The middle kingdom, and the only ground positioned between the two of them. "
      + "Everything that falls out of the war lands here, which is why the Rifts open here "
      + "and the Reliquary fills. The Keepers hold this line because there is no other line.",
    raidId: "the-ferryman",
  },
  avarice: {
    id: "avarice", name: "The Fourth Circle", axis: "rift", realm: "hell", from: 1, to: Infinity,
    lore: "Greed has a circle of its own down in Hell, and this is a piece of it torn loose "
      + "into the Threshold. The Keepers file it under Hell. Nothing living in it files it "
      + "under anything.",
    raidId: null,
  },
  abyss: {
    id: "abyss", name: "The Abyss", axis: "rift", realm: "abyss", from: 1, to: Infinity,
    lore: "Not a layer of anything. The Abyss is underneath Heaven and Hell both and older "
      + "than the pair of them: no circles, no rulers, no judgment. A rift that reaches it "
      + "went through the entire structure of creation on the way down.",
    raidId: null,
  },
};

/** Every layer on both ladders and off them, for the audits and the Records screen. */
export const LAYERS: readonly WorldLayer[] = [
  ...DOWN_LAYERS, ...UP_LAYERS, ...Object.values(RIFT_LAYERS),
];

/**
 * Layers by id. Exists so `data/raids.ts` can resolve the band a raid stands in without
 * this file having to import the raid table back — the two halves of the §15 link are
 * declared as ids on both sides and asserted to agree, rather than as a circular import.
 */
export const LAYER_BY_ID: Readonly<Record<string, WorldLayer>> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l]),
);

/** The band a depth (or height) on one ladder falls in. Anything below 1 reads as 1. */
export function layerAt(axis: "down" | "up", depth: number): WorldLayer {
  const d = Math.max(1, Math.floor(depth));
  const ladder = axis === "down" ? DOWN_LAYERS : UP_LAYERS;
  return ladder.find((l) => d >= l.from && d <= l.to) ?? ladder[ladder.length - 1]!;
}

/**
 * Where in the war a run is.
 *
 * The switch is exhaustive over `RunModeId` on purpose rather than defaulting: a new mode
 * has to state where in the world it happens, and `tools/world.ts` walks all of
 * `RUN_MODES` so that stays true. The Reliquary, the Vigil and the Convergence are all
 * Threshold — a sector is a graveyard *inside* Purgatory, and both rotating activities are
 * Standard Rifts, which is exactly what their own `lore` lines already say.
 */
export function layerFor(config: RunConfig): WorldLayer {
  switch (config.mode.id) {
    case "delve": return layerAt("down", config.depth);
    // Keyed on the *height*, not the depth: they are the same number today (the Tower
    // walks the one curve at the Delve's rate) but the height is what the band means, and
    // a config that ever carried one without the other must not read the descent's table.
    case "tower": return layerAt("up", config.tower?.height ?? config.depth);
    case "abyss": return RIFT_LAYERS.abyss;
    case "hoard": return RIFT_LAYERS.avarice;
    // A raid stands *at* a layer rather than in a band of one, so it carries the answer
    // on its own spec (UAT §15). Read out of the config rather than looked up in the raid
    // table, which is what keeps this file free of an import back from `data/raids.ts`.
    case "raid": return LAYER_BY_ID[config.raid?.spec.layerId ?? ""] ?? RIFT_LAYERS.threshold;
    // A Memory is a recollection pinned down in the Citadel (`data/memories.ts`), so it
    // sits where the Citadel does — in the Threshold, off both ladders — however deep the
    // place it remembers used to be. The place is the biome; the layer is where the
    // remembering happens.
    case "memory":
    case "planet":
    case "vigil":
    case "convergence":
      return RIFT_LAYERS.threshold;
  }
}
