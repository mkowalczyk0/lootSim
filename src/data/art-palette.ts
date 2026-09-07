/**
 * The machine-readable master palette — the mirror of `docs/art-style-guide.md` §2.
 *
 * Every piece of pipeline art (PixelLab prompt, Aseprite palette file, the tint code in
 * `render/sprites.ts`) reads through here so a colour is defined exactly once. Change a
 * value in the style guide and change it here in the same commit.
 *
 * Pure data. No DOM, no `GameState` — the headless art tools import this.
 */

/** §2.1 — ink & neutrals, the Purgatory base. */
export const INK = "#141019";
export const NEUTRALS = {
  ink: INK,
  ash1: "#2a2733",
  ash2: "#3d3a47",
  ash3: "#57545f",
  bone: "#c9c2b4",
  parchment: "#e8dfce",
} as const;

/**
 * §2.2 — the six damage elements. Verbatim from `src/data/elements.ts`; kept here too so
 * a prompt or a palette file can pull "the poison colour" without importing the sim's
 * `ELEMENT_COLORS`. If these ever drift apart, `elements.ts` wins.
 */
export const ELEMENT_ART = {
  physical: "#e2e8f0",
  fire: "#ff7a2f",
  cold: "#7dd3fc",
  lightning: "#fde047",
  poison: "#84cc16",
  void: "#c084fc",
} as const;

/** §2.4 — the four forces: environment and faction palettes. */
export const FORCES = {
  heaven: { core: "#d8cfa8", shadow: "#8a7d54", light: "#f4ecc9", accent: "#fde047" },
  hell: { core: "#4a2f28", shadow: "#241512", light: "#7a4a38", accent: "#ff7a2f" },
  abyss: { core: "#0e0b14", shadow: "#000000", light: "#241d33", accent: "#c084fc" },
  purgatory: { core: "#3d3a47", shadow: "#2a2733", light: "#c9c2b4", accent: "#c9c2b4" },
} as const;

/**
 * Per-zone authoring palettes — the exact swatch a sprite for that place is generated and
 * locked onto. A zone palette is deliberately short (8–12 entries): the low, dirty base
 * plus exactly one hot accent (§1.4). These are the palettes fed to PixelLab as the
 * forced `color_image`, and the ones the Aseprite quantise step snaps onto.
 */
export const ZONE_PALETTES: Record<string, readonly string[]> = {
  /** §5 Circle VI — Heresy. Inverted Heaven: black cathedrals, gold used wrong. */
  "hell6-heresy": [
    INK, "#3a2a3a", "#241512", "#4a2f28", NEUTRALS.bone, "#8a7d54",
    "#8a2a1a", ELEMENT_ART.lightning,
  ],
  /** §8.2 The Rotting Garden — a celestial garden corrupted by Hell. */
  "reliquary-rotting-garden": [
    INK, "#243020", "#3a4a2a", "#5a6b38", "#33241d", "#6b7268",
    NEUTRALS.bone, "#a3e635",
  ],
};
