/**
 * Planets: the Roguelands-shaped layer wrapped around the existing dive and rifts.
 * Mechanically a planet expedition is shaped exactly like a rift — a fixed run of
 * floors ending in a boss, tiers that reopen the same planet harder — because that
 * shape already does everything an expedition needs. What a planet adds on top is its
 * own visual identity (it owns a full biome rather than being bucketed by depth), its
 * own boss (reskinned from an existing encounter rather than a new one), and its own
 * material payout, which is the entire reason to go there instead of diving.
 *
 * Travel is gated in a ladder, like the biomes already are: Htrae is always open, and
 * clearing a planet's first tier is what opens the next planet's door. Every planet
 * still has its own tier ladder after that, exactly like a rift does.
 *
 * Pure data. `game/hub.ts` and `game/dungeon.ts` are what actually run one.
 */

import type { BiomeStyle } from "./biomes";
import { BOSSES, type BossSpec } from "./bosses";
import { challengerMultiplier } from "./challenger";
import type { Element } from "./elements";
import type { EnemyKind } from "./enemies";
import { MODES, delveConfig, riftConfig, type RunConfig } from "./modes";

export interface PlanetSpec {
  readonly id: string;
  readonly name: string;
  /** 1-based order in the travel ladder. Also what the terminal sorts by. */
  readonly order: number;
  readonly blurb: string;
  /** What the local wildlife, hazards and the planet's material payout are made of. */
  readonly element: Element;
  readonly biome: BiomeStyle;
  /** Floors before the boss. Shaped like a Hoard Rift: a step easier, pays in volume. */
  readonly floors: number;
  readonly baseDepth: number;
  readonly depthPerTier: number;
  readonly depthPerFloor: number;
  readonly dangerPerTier: number;
  /** An existing boss encounter to reskin — phases, health and kit are borrowed wholesale. */
  readonly bossTemplateId: string;
  readonly bossName: string;
  readonly bossTitle: string;
  /** Flavor names for the ordinary archetypes, so the roster reads as this planet's own. */
  readonly enemyNames: Partial<Record<EnemyKind, string>>;
  /** Multiplies material drops from kills and how much a resource node pays out. */
  readonly materialYield: number;
  /** Resource nodes scattered per floor, for mining outside of combat. */
  readonly nodeCount: number;
}

const enemyFlavor = (
  grunt: string, archer: string, brute: string, swarmer: string, caster: string,
): Partial<Record<EnemyKind, string>> => ({ grunt, archer, brute, swarmer, caster });

export const PLANETS: readonly PlanetSpec[] = [
  {
    id: "htrae", name: "Htrae", order: 1,
    blurb: "The first stop out of the yard. Dust, ruin, and just enough of a welcome.",
    element: "physical",
    biome: {
      name: "Htrae", tint: "#3a3226", floorAlt: "#443a2b", wall: "#6b5a3f", wallSide: "#2c2418",
      accent: "#e8c07d", props: ["rock", "bones", "torch"],
      layouts: ["open", "rubble", "pillars"], traps: ["spike"],
      element: "physical",
    },
    floors: 3, baseDepth: 4, depthPerTier: 1.6, depthPerFloor: 1.1, dangerPerTier: 1.08,
    bossTemplateId: "colossus", bossName: "Warden of Htrae", bossTitle: "First to greet every ship that lands.",
    enemyNames: enemyFlavor("Dust Marauder", "Ridge Skirmisher", "Yard Juggernaut", "Sand Crawler", "Wastes Adept"),
    materialYield: 1, nodeCount: 4,
  },
  {
    id: "corvel", name: "Corvel Marsh", order: 2,
    blurb: "Everything here is either eating something or about to be eaten by it.",
    element: "poison",
    biome: {
      name: "Corvel Marsh", tint: "#1c2a1e", floorAlt: "#223324", wall: "#3a5a3d", wallSide: "#132018",
      accent: "#a3e635", props: ["mushroom", "bones", "rock"],
      layouts: ["chambers", "rubble", "open"], traps: ["mire", "spike"],
      element: "poison",
    },
    floors: 3, baseDepth: 9, depthPerTier: 1.9, depthPerFloor: 1.2, dangerPerTier: 1.1,
    bossTemplateId: "herald", bossName: "The Corvel Broodmother", bossTitle: "The marsh has been feeding it for a very long time.",
    enemyNames: enemyFlavor("Bog Marauder", "Reed Skirmisher", "Mire Juggernaut", "Spawn Crawler", "Rot Adept"),
    materialYield: 2, nodeCount: 4,
  },
  {
    id: "ignathis", name: "Ignathis", order: 3,
    blurb: "The ground is lava and the lava has opinions.",
    element: "fire",
    biome: {
      name: "Ignathis", tint: "#331c14", floorAlt: "#3d2318", wall: "#6b3d24", wallSide: "#241109",
      accent: "#ff8a3c", props: ["rock", "torch", "bones"],
      layouts: ["gauntlet", "chambers", "pillars"], traps: ["flame", "turret"],
      element: "fire",
    },
    floors: 3, baseDepth: 14, depthPerTier: 2.1, depthPerFloor: 1.3, dangerPerTier: 1.12,
    bossTemplateId: "warden", bossName: "Ignathis Unbound", bossTitle: "It was sealed here. It is not sealed anymore.",
    enemyNames: enemyFlavor("Cinder Marauder", "Ember Skirmisher", "Slag Juggernaut", "Spark Crawler", "Flame Adept"),
    materialYield: 3, nodeCount: 5,
  },
  {
    id: "rimehollow", name: "Rimehollow", order: 4,
    blurb: "Quiet, white, and it has been waiting long enough to be patient about it.",
    element: "cold",
    biome: {
      name: "Rimehollow", tint: "#1a2530", floorAlt: "#20303e", wall: "#3d5a70", wallSide: "#131c24",
      accent: "#a5e8ff", props: ["crystal", "rock", "bones"],
      layouts: ["ring", "pillars", "rubble"], traps: ["spike", "saw"],
      element: "cold",
    },
    floors: 3, baseDepth: 19, depthPerTier: 2.3, depthPerFloor: 1.35, dangerPerTier: 1.13,
    bossTemplateId: "choir", bossName: "The Rimehollow Sentinel", bossTitle: "Every one of its voices is the same voice.",
    enemyNames: enemyFlavor("Frost Marauder", "Glacier Skirmisher", "Rime Juggernaut", "Sleet Crawler", "Hoarfrost Adept"),
    materialYield: 4, nodeCount: 5,
  },
  {
    id: "stormreach", name: "Stormreach", order: 5,
    blurb: "Floating ruins in a storm that never once lets up.",
    element: "lightning",
    biome: {
      name: "Stormreach", tint: "#241c33", floorAlt: "#2b2140", wall: "#4a3a6b", wallSide: "#180f28",
      accent: "#fde047", props: ["crystal", "torch", "rock"],
      layouts: ["ring", "gauntlet", "chambers"], traps: ["turret", "saw"],
      element: "lightning",
    },
    floors: 3, baseDepth: 24, depthPerTier: 2.5, depthPerFloor: 1.4, dangerPerTier: 1.14,
    bossTemplateId: "nameless", bossName: "The Stormreach Warbringer", bossTitle: "It arrived on the lightning, not through it.",
    enemyNames: enemyFlavor("Charged Marauder", "Squall Skirmisher", "Thunder Juggernaut", "Static Crawler", "Storm Adept"),
    materialYield: 5, nodeCount: 5,
  },
  {
    id: "nullspire", name: "The Nullspire", order: 6,
    blurb: "It is not on any chart. It should not be on any chart.",
    element: "void",
    biome: {
      name: "The Nullspire", tint: "#170f22", floorAlt: "#1d1329", wall: "#3a2450", wallSide: "#0e081a",
      accent: "#ff1493", props: ["crystal", "bones", "torch"],
      layouts: ["ring", "gauntlet", "rubble", "chambers"], traps: ["turret", "flame", "saw", "mire"],
      element: "void",
    },
    floors: 3, baseDepth: 29, depthPerTier: 2.8, depthPerFloor: 1.5, dangerPerTier: 1.16,
    bossTemplateId: "colossus", bossName: "That Which Waits at Nullspire", bossTitle: "It has been waiting since before there was a ship to land.",
    enemyNames: enemyFlavor("Hollow Marauder", "Null Skirmisher", "Abyssal Juggernaut", "Static Crawler", "Veiled Adept"),
    materialYield: 6, nodeCount: 6,
  },
];

export const PLANETS_BY_ID: Record<string, PlanetSpec> = Object.fromEntries(
  PLANETS.map((p) => [p.id, p]),
);

/** Htrae is always open; every planet after it opens once the one before it is cleared. */
export function planetUnlocked(planet: PlanetSpec, progress: Readonly<Record<string, number>>): boolean {
  const i = PLANETS.findIndex((p) => p.id === planet.id);
  if (i <= 0) return true;
  const prev = PLANETS[i - 1]!;
  return (progress[prev.id] ?? 0) >= 1;
}

/** A boss encounter borrowed wholesale (phases, health, kit) and reskinned for this planet. */
export function planetBossSpec(planet: PlanetSpec): BossSpec {
  const template = BOSSES.find((b) => b.id === planet.bossTemplateId) ?? BOSSES[0]!;
  return {
    ...template,
    id: `planet-${planet.id}`,
    name: planet.bossName,
    title: planet.bossTitle,
    element: planet.element,
  };
}

/**
 * One floor of a planet expedition, shaped exactly like `riftConfig` in `data/modes.ts`
 * — a fixed run of floors ending in a boss, with tier compounding the danger — just
 * reading its curve off the planet instead of a `RunMode`.
 */
export function planetConfig(planet: PlanetSpec, tier: number, floor: number, challengerTier = 0): RunConfig {
  const t = Math.max(1, Math.floor(tier));
  const f = Math.min(Math.max(1, Math.floor(floor)), planet.floors);
  const depth = Math.round(planet.baseDepth + planet.depthPerTier * (t - 1) + planet.depthPerFloor * (f - 1));
  return {
    mode: MODES.planet,
    tier: t,
    floor: f,
    depth: Math.max(1, depth),
    danger: Math.pow(planet.dangerPerTier, t - 1) * challengerMultiplier(challengerTier),
    bossFloor: f === planet.floors,
    lastFloor: f === planet.floors,
    challengerTier,
    planet: { spec: planet, tier: t },
  };
}

/**
 * Advances a run one floor, carrying over everything the current floor was configured
 * with — the challenger tier the player set, the rift tier, and the planet itself.
 *
 * This exists because rebuilding the next floor from scratch is exactly where a run's
 * configuration used to leak: descending re-derived the config from the mode id and the
 * floor number alone, which silently dropped both the Challenger dial (so a Death March
 * delve went back to plain difficulty on floor two) and the whole `planet` field (so an
 * expedition's second floor came out as a generic depth-1 room that paid no materials).
 * A run's shape only ever changes by one floor, so derive it from the config you already
 * have rather than re-deriving it from parts.
 *
 * It lives in `planets.ts` rather than `modes.ts` because it has to be able to build a
 * planet floor, and `planets.ts` is the module that already depends on `modes.ts` — the
 * dependency only points one way.
 */
export function nextFloorConfig(config: RunConfig): RunConfig {
  // The party comes with you: descending must never quietly drop the run back to
  // solo-sized monsters halfway down.
  const players = config.players ?? 1;
  if (config.planet) {
    return {
      ...planetConfig(config.planet.spec, config.planet.tier, config.floor + 1, config.challengerTier),
      players,
    };
  }
  if (!config.mode.isRift) return delveConfig(config.depth + 1, config.challengerTier, players);
  return { ...riftConfig(config.mode.id, config.tier, config.floor + 1, config.challengerTier), players };
}
