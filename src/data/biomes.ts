/**
 * Biome styling and generation preferences. Every five depths moves you into a new
 * biome, which changes the palette, the props scattered around the floor, the layouts
 * the generator is allowed to pick, and which hazards can appear.
 *
 * Pure data — no DOM, no canvas, no simulation state.
 */

import type { Element } from "./elements";
import type { TrapKind } from "./traps";

export type PropKind = "torch" | "bones" | "mushroom" | "crystal" | "rock";

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
}

export const BIOMES: readonly BiomeStyle[] = [
  {
    name: "Training Grounds",
    tint: "#2c3040", floorAlt: "#333849", wall: "#4a5165", wallSide: "#272c39",
    accent: "#7dd3fc",
    props: ["torch", "rock"],
    layouts: ["open", "pillars"],
    traps: ["spike"],
    element: "physical",
  },
  {
    name: "Whispering Forest",
    tint: "#1e3326", floorAlt: "#24402d", wall: "#3c5a3f", wallSide: "#1a2c1e",
    accent: "#86efac",
    props: ["mushroom", "rock", "bones"],
    layouts: ["open", "rubble", "chambers"],
    traps: ["spike", "mire"],
    element: "poison",
  },
  {
    name: "Dark Cave",
    tint: "#241f2e", floorAlt: "#2c2637", wall: "#463c56", wallSide: "#1c1826",
    accent: "#c084fc",
    props: ["crystal", "rock", "bones"],
    layouts: ["rubble", "pillars", "gauntlet", "ring"],
    traps: ["spike", "saw", "mire"],
    element: "cold",
  },
  {
    name: "Ashen Wastes",
    tint: "#33241d", floorAlt: "#3d2b21", wall: "#5c4335", wallSide: "#251a14",
    accent: "#fb923c",
    props: ["bones", "rock", "torch"],
    layouts: ["gauntlet", "open", "chambers", "pillars"],
    traps: ["flame", "spike", "turret"],
    element: "fire",
  },
  {
    name: "Dragon's Lair",
    tint: "#3a1c1c", floorAlt: "#472222", wall: "#6b3535", wallSide: "#2a1212",
    accent: "#ef4444",
    props: ["bones", "torch", "crystal"],
    layouts: ["ring", "chambers", "gauntlet", "pillars"],
    traps: ["flame", "saw", "turret"],
    element: "lightning",
  },
  {
    name: "The Veil",
    tint: "#2a1836", floorAlt: "#331d42", wall: "#4e2f63", wallSide: "#1e1128",
    accent: "#ff1493",
    props: ["crystal", "bones", "torch"],
    layouts: ["ring", "gauntlet", "rubble", "chambers"],
    traps: ["turret", "saw", "flame", "mire"],
    element: "void",
  },
];

export function biomeFor(depth: number): BiomeStyle {
  const i = Math.min(BIOMES.length - 1, Math.floor((Math.max(1, depth) - 1) / 5));
  return BIOMES[i]!;
}
