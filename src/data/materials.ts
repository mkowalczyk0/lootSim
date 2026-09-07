/**
 * Crafting materials. There is one per element — physical included, doubling as the
 * neutral, everyone-needs-it material the way physical damage is the neutral damage
 * type everywhere else in the game. A planet's dominant element decides what it mostly
 * pays out, which is what makes travelling somewhere new a real decision: the Nullspire
 * pays in void dust, and void dust is the only thing that crafts a void-themed piece.
 *
 * Pure data.
 */

import { ELEMENTS, ELEMENT_COLORS, type Element } from "./elements";

export interface Material {
  readonly id: Element;
  readonly name: string;
  readonly blurb: string;
  readonly color: string;
}

export const MATERIAL_NAMES: Record<Element, string> = {
  physical: "Iron Scrap",
  fire: "Cinder Dust",
  cold: "Rime Shard",
  lightning: "Storm Coil",
  poison: "Blight Root",
  void: "Void Husk",
  holy: "Gilt Reliquary",
  arcane: "Rune Fragment",
  nature: "Heartwood Sap",
};

export const MATERIAL_BLURBS: Record<Element, string> = {
  physical: "Plain, sturdy, and needed by every recipe regardless of what it's for.",
  fire: "Still warm. Crafts a fiery essence into whatever it's added to.",
  cold: "Doesn't melt, even in your pocket. Crafts a cold essence.",
  lightning: "Twitches if you hold it too long. Crafts a lightning essence.",
  poison: "Best not to lick it. Crafts a poison essence.",
  void: "Looks back. Crafts a void essence.",
  holy: "Warm to the touch and faintly singing. Crafts a holy essence.",
  arcane: "The marks on it rearrange when unobserved. Crafts an arcane essence.",
  nature: "Still growing, slowly. Crafts a nature essence.",
};

export const MATERIALS: Record<Element, Material> = Object.fromEntries(
  ELEMENTS.map((e) => [e, {
    id: e, name: MATERIAL_NAMES[e], blurb: MATERIAL_BLURBS[e], color: ELEMENT_COLORS[e],
  }]),
) as Record<Element, Material>;

export type MaterialBag = Record<Element, number>;

export function emptyMaterials(): MaterialBag {
  return {
    physical: 0, fire: 0, cold: 0, lightning: 0, poison: 0, void: 0,
    holy: 0, arcane: 0, nature: 0,
  };
}
