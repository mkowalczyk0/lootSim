/**
 * The **Ashen Reliquary** — the resource-farming layer, and the replacement for the old
 * science-fiction planet system (`game_story_worldbuilding.md` → "The old planet system
 * should be completely replaced"). It is not space; it is a continent-sized supernatural
 * graveyard inside Purgatory, entered through a permanent gate in the Citadel, where the
 * Legends harvest the remains of dead gods and broken realms for crafting material.
 *
 * `PlanetSpec` / `PLANETS` / `planet*` keep their names as the **internal** identifiers
 * (and `id` values are frozen for save compatibility — `GameState.planetProgress` is
 * keyed by them) but every player-facing string is a Reliquary **sector**: six regions,
 * one per damage element, from `game_story_worldbuilding.md` → "Reliquary Sectors" and
 * art-style-guide §8.2. `MODES.planet.name`/`.short` (`data/modes.ts`) carry the same
 * rename now — "Reliquary Expedition" / "Reliquary" — so a run into a sector reads
 * consistently everywhere the delve and the rifts already do.
 *
 * Mechanically a sector run is still shaped exactly like a rift — a fixed run of floors
 * ending in a boss, tiers that reopen the same sector harder. Each sector owns a full
 * biome (ash over dead-civilisation stone, pulled toward its element), a boss reskinned
 * wholesale from an existing encounter, and a material payout — the reason to come here
 * instead of the Delve. Travel is a ladder: the Wargrave is always open, and clearing a
 * sector's first tier opens the next.
 *
 * Pure data. `game/hub.ts` and `game/dungeon.ts` are what actually run one.
 */

import type { BiomeStyle } from "./biomes";
import { BOSSES, type BossSpec } from "./bosses";
import { challengerMultiplier } from "./challenger";
import type { Element } from "./elements";
import type { EnemyKind } from "./enemies";
import { MODES, delveConfig, riftConfig, type RunConfig } from "./modes";
import { weeklyConfig } from "./weekly";

export interface PlanetSpec {
  /** Frozen internal id — `GameState.planetProgress` is keyed by it. Do not change. */
  readonly id: string;
  /** The Reliquary sector's name, e.g. "The Cinder Catacombs". */
  readonly name: string;
  /** 1-based order in the travel ladder. Also what the terminal sorts by. */
  readonly order: number;
  readonly blurb: string;
  /** What the local wildlife, hazards and the sector's material payout are made of. */
  readonly element: Element;
  readonly biome: BiomeStyle;
  /** Floors before the boss. Shaped like an Avarice Rift: a step easier, pays in volume. */
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
    // §8.2 The Wargrave — mortal, demonic and celestial armies piled together. The
    // shallow end of the Reliquary and the sector every Legend is sent to first.
    id: "htrae", name: "The Wargrave", order: 1,
    blurb: "Armies of three worlds, piled where they fell. Buried swords, dead horses, mountains of armour.",
    element: "physical",
    biome: {
      name: "The Wargrave", tileset: "tiles.reliquary-wargrave",
      tint: "#2f2620", floorAlt: "#3a2f26", wall: "#574a3d", wallSide: "#231b15",
      accent: "#e2e8f0", props: ["rock", "bones", "torch"],
      layouts: ["open", "rubble", "pillars"], traps: ["spike"],
      element: "physical",
    },
    floors: 3, baseDepth: 4, depthPerTier: 1.6, depthPerFloor: 1.1, dangerPerTier: 1.08,
    bossTemplateId: "colossus", bossName: "The Grave-Standard", bossTitle: "It was raised over the dead. Now it fights for them.",
    enemyNames: enemyFlavor("Grave Revenant", "Buried Archer", "Siege Remnant", "Bone Scuttler", "War-Chaplain"),
    materialYield: 1, nodeCount: 4,
  },
  {
    // §8.2 The Rotting Garden — a celestial garden corrupted by Hell. Plants from
    // corpses, flowers that release poison, trees that bleed.
    id: "corvel", name: "The Rotting Garden", order: 2,
    blurb: "A garden of Heaven that Hell got into. The flowers grow out of the dead and breathe poison.",
    element: "poison",
    biome: {
      name: "The Rotting Garden", tileset: "tiles.reliquary-garden",
      tint: "#282b1b", floorAlt: "#313620", wall: "#49512f", wallSide: "#1b1e12",
      accent: "#84cc16", props: ["mushroom", "bones", "rock"],
      layouts: ["chambers", "rubble", "open"], traps: ["mire", "spike"],
      element: "poison",
    },
    floors: 3, baseDepth: 9, depthPerTier: 1.9, depthPerFloor: 1.2, dangerPerTier: 1.1,
    bossTemplateId: "herald", bossName: "The Gardener's Remains", bossTitle: "It still tends the beds. It is part of them now.",
    enemyNames: enemyFlavor("Corpse-Bloom", "Thorn Archer", "Bramble Hulk", "Spore Scuttler", "Blight Adept"),
    materialYield: 2, nodeCount: 4,
  },
  {
    // §8.2 The Cinder Catacombs — ruined structures under infernal ash, stone still
    // burning after millennia.
    id: "ignathis", name: "The Cinder Catacombs", order: 3,
    blurb: "Tombs under a ceiling of ash. The stone has been burning for a thousand years and has not gone out.",
    element: "fire",
    biome: {
      name: "The Cinder Catacombs", tileset: "tiles.reliquary-catacombs",
      tint: "#331f17", floorAlt: "#3f271c", wall: "#5d3b2c", wallSide: "#241310",
      accent: "#ff7a2f", props: ["rock", "torch", "bones"],
      layouts: ["gauntlet", "chambers", "pillars"], traps: ["flame", "turret"],
      element: "fire",
    },
    floors: 3, baseDepth: 14, depthPerTier: 2.1, depthPerFloor: 1.3, dangerPerTier: 1.12,
    bossTemplateId: "warden", bossName: "The Ember-Sealed", bossTitle: "Interred here to keep it burning. The seal held. Barely.",
    enemyNames: enemyFlavor("Cinder Revenant", "Ash Archer", "Slag Hulk", "Ember Scuttler", "Pyre Adept"),
    materialYield: 3, nodeCount: 5,
  },
  {
    // §8.2 The Frozen Basilica — a cathedral frozen solid. The statues are the preserved
    // remains of celestial beings.
    id: "rimehollow", name: "The Frozen Basilica", order: 4,
    blurb: "A cathedral frozen through. The statues in the nave were angels once, and the ice kept them.",
    element: "cold",
    biome: {
      name: "The Frozen Basilica", tileset: "tiles.reliquary-basilica",
      tint: "#232e37", floorAlt: "#2b3843", wall: "#43566a", wallSide: "#18212a",
      accent: "#7dd3fc", props: ["crystal", "rock", "bones"],
      layouts: ["ring", "pillars", "rubble"], traps: ["spike", "saw"],
      element: "cold",
    },
    floors: 3, baseDepth: 19, depthPerTier: 2.3, depthPerFloor: 1.35, dangerPerTier: 1.13,
    bossTemplateId: "choir", bossName: "The Choir Preserved", bossTitle: "Frozen mid-hymn. It never stopped singing.",
    enemyNames: enemyFlavor("Rime Revenant", "Icebound Archer", "Glacier Hulk", "Frost Scuttler", "Hoarfrost Adept"),
    materialYield: 4, nodeCount: 5,
  },
  {
    // §8.2 The Storm Sepulcher — a battlefield where two higher armies annihilated each
    // other. Weapons embedded everywhere, the sky still crackling.
    id: "stormreach", name: "The Storm Sepulcher", order: 5,
    blurb: "Where two armies of higher beings wiped each other out. Their weapons are still in the ground and the sky still hasn't settled.",
    element: "lightning",
    biome: {
      name: "The Storm Sepulcher", tileset: "tiles.reliquary-sepulcher",
      tint: "#2e2a1d", floorAlt: "#393324", wall: "#544a34", wallSide: "#211c13",
      accent: "#fde047", props: ["crystal", "torch", "rock"],
      layouts: ["ring", "gauntlet", "chambers"], traps: ["turret", "saw"],
      element: "lightning",
    },
    floors: 3, baseDepth: 24, depthPerTier: 2.5, depthPerFloor: 1.4, dangerPerTier: 1.14,
    bossTemplateId: "nameless", bossName: "The Last Standard-Bearer", bossTitle: "The battle ended. Nobody told it.",
    enemyNames: enemyFlavor("Charged Revenant", "Squall Archer", "Thunder Hulk", "Arc Scuttler", "Storm Adept"),
    materialYield: 5, nodeCount: 5,
  },
  {
    // §8.2 The Black Archive — where the Reliquary has begun touching the Abyss.
    // Overlapping rooms, distance that stops behaving. Void-heavy, most dangerous.
    id: "nullspire", name: "The Black Archive", order: 6,
    blurb: "Where the Reliquary has started touching the Abyss. The rooms overlap and the distance is wrong.",
    element: "void",
    biome: {
      name: "The Black Archive", tileset: "tiles.reliquary-archive",
      tint: "#100c17", floorAlt: "#17121f", wall: "#281f38", wallSide: "#0a0710",
      accent: "#c084fc", props: ["crystal", "bones", "torch"],
      layouts: ["ring", "gauntlet", "rubble", "chambers"], traps: ["turret", "flame", "saw", "mire"],
      element: "void",
    },
    floors: 3, baseDepth: 29, depthPerTier: 2.8, depthPerFloor: 1.5, dangerPerTier: 1.16,
    bossTemplateId: "colossus", bossName: "The Index", bossTitle: "It catalogues what the Archive takes. It has an entry for you.",
    enemyNames: enemyFlavor("Hollow Revenant", "Unwritten Archer", "Erased Hulk", "Margin Scuttler", "Redacted Adept"),
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
  // The Convergence (UAT §17) rebuilds itself from the week rather than `riftConfig`,
  // exactly why the planet branch above exists — a generic rebuild would lose the
  // week's seed, modifiers and key tier the same way it would lose a planet's spec.
  if (config.weekly) {
    return { ...weeklyConfig(config.weekly.week, config.floor + 1, config.challengerTier), players };
  }
  if (!config.mode.isRift) return delveConfig(config.depth + 1, config.challengerTier, players);
  return { ...riftConfig(config.mode.id, config.tier, config.floor + 1, config.challengerTier), players };
}
