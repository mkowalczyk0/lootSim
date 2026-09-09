/**
 * The **Ashen Reliquary** — the resource-farming layer, and the replacement for the old
 * science-fiction planet system (`game_story_worldbuilding.md` → "The old planet system
 * should be completely replaced"). It is not space; it is a continent-sized supernatural
 * graveyard inside Purgatory, entered through a permanent gate in the Citadel, where the
 * Legends harvest the remains of dead gods and broken realms for crafting material.
 *
 * `PlanetSpec` / `PLANETS` / `planet*` keep their names as the **internal** identifiers
 * (and `id` values are frozen for save compatibility — `GameState.planetProgress` is
 * keyed by them) but every player-facing string is a Reliquary **sector**: one region per
 * damage element. The first six are `game_story_worldbuilding.md` → "Reliquary Sectors"
 * and art-style-guide §8.2, verbatim — the doc lists them as examples ("For example:"),
 * not an exhaustive roster, and only covers `LOOT_ELEMENTS` plus physical. The last three
 * (holy, arcane, nature) were added Sept 2026 so the three *reserved* elements
 * (`RESERVED_ELEMENTS` in `data/elements.ts`) have somewhere that pays in them — until
 * then `Gilt Reliquary`/`Rune Fragment`/`Heartwood Sap` were craftable essences with no
 * material behind them, a dead end the Forge's per-element essence menu only exposed
 * rather than caused. They aren't in the worldbuilding doc's example list (nothing there
 * covers those three elements), so they're new places invented to match its own rule for
 * what a sector *is* — "areas within the same massive supernatural repository … its own
 * visual identity, enemy population, events, and material affinity" — rather than a quote
 * from it. `MODES.planet.name`/`.short` (`data/modes.ts`) carry the Reliquary rename now
 * — "Reliquary Expedition" / "Reliquary" — so a run into a sector reads consistently
 * everywhere the delve and the rifts already do.
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
import { memoryConfig } from "./memories";
import { MODES, delveConfig, riftConfig, type RunConfig } from "./modes";
import { towerConfig } from "./tower";
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
      monsterSet: "reliquary",
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
      monsterSet: "reliquary",
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
      monsterSet: "reliquary",
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
      monsterSet: "reliquary",
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
      monsterSet: "reliquary",
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
      monsterSet: "reliquary",
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
  {
    // Not in the worldbuilding doc's example list — invented to give the holy element
    // (kept out of LOOT_ELEMENTS on purpose, per elements.ts) somewhere to be harvested.
    // A literal reliquary: every saint interred here was gilded rather than buried, and
    // the doc's own "a reliquary is a container for the remains of something holy" line
    // is the closest thing this sector is quoting.
    id: "giltvault", name: "The Gilded Ossuary", order: 7,
    blurb: "A treasury of the dead, gilded instead of buried. Every relic here used to be a saint, and some of them still know it.",
    element: "holy",
    biome: {
      name: "The Gilded Ossuary", tileset: "tiles.reliquary-ossuary",
      monsterSet: "reliquary",
      tint: "#2f2717", floorAlt: "#3a3020", wall: "#5c4c2c", wallSide: "#231d10",
      accent: "#fde68a", props: ["rock", "bones", "torch"],
      layouts: ["chambers", "pillars", "rubble"], traps: ["spike", "flame"],
      element: "holy",
    },
    floors: 3, baseDepth: 34, depthPerTier: 3.0, depthPerFloor: 1.55, dangerPerTier: 1.17,
    bossTemplateId: "choir", bossName: "The Reliquary Saint", bossTitle: "It was interred whole. It did not stay that way.",
    enemyNames: enemyFlavor("Gilded Revenant", "Reliquary Archer", "Ossuary Hulk", "Relic Scuttler", "Anointed Adept"),
    materialYield: 7, nodeCount: 6,
  },
  {
    // Also invented for the same reason — arcane is the second reserved element with no
    // sector of its own. A mage-tower that outlived the war it was built for; nobody is
    // left to hold its wards shut, which is why the rooms don't stay put.
    id: "runespire", name: "The Unbound Spire", order: 8,
    blurb: "A mage-tower that outlived the war that built it. The wards that pinned it to one place broke first, and the books never stopped writing themselves.",
    element: "arcane",
    biome: {
      name: "The Unbound Spire", tileset: "tiles.reliquary-spire",
      monsterSet: "reliquary",
      tint: "#241a33", floorAlt: "#2e2140", wall: "#453262", wallSide: "#160f24",
      accent: "#f0abfc", props: ["crystal", "rock", "torch"],
      layouts: ["ring", "pillars", "gauntlet"], traps: ["turret", "saw"],
      element: "arcane",
    },
    floors: 3, baseDepth: 39, depthPerTier: 3.2, depthPerFloor: 1.6, dangerPerTier: 1.18,
    bossTemplateId: "nameless", bossName: "The Unbound Archivist", bossTitle: "It never finished cataloguing itself.",
    enemyNames: enemyFlavor("Unbound Revenant", "Marginal Archer", "Bound Hulk", "Errant Scuttler", "Unread Adept"),
    materialYield: 8, nodeCount: 7,
  },
  {
    // The third reserved element. An orchard grown directly over a civilisation's mass
    // grave, roots laced through the bones beneath it — still growing, the way its own
    // material's blurb (`Heartwood Sap`, "still growing, slowly") already said.
    id: "heartgrove", name: "The Hollow Orchard", order: 9,
    blurb: "An orchard grown over the graves of a whole civilisation, roots laced through the bones beneath it. It hasn't stopped growing since, and it isn't going to.",
    element: "nature",
    biome: {
      name: "The Hollow Orchard", tileset: "tiles.reliquary-orchard",
      monsterSet: "reliquary",
      tint: "#22271a", floorAlt: "#2b3320", wall: "#3f4a2c", wallSide: "#171c10",
      accent: "#34d399", props: ["mushroom", "rock", "bones"],
      layouts: ["chambers", "rubble", "open"], traps: ["mire", "spike"],
      element: "nature",
    },
    floors: 3, baseDepth: 44, depthPerTier: 3.4, depthPerFloor: 1.65, dangerPerTier: 1.2,
    bossTemplateId: "colossus", bossName: "The Orchard's Root", bossTitle: "It was planted a long time ago. It has not stopped growing.",
    enemyNames: enemyFlavor("Sapbound Revenant", "Orchard Archer", "Heartwood Hulk", "Root Scuttler", "Grove Adept"),
    materialYield: 9, nodeCount: 7,
  },
];

export const PLANETS_BY_ID: Record<string, PlanetSpec> = Object.fromEntries(
  PLANETS.map((p) => [p.id, p]),
);

/**
 * Whether a sector is open. The Wargrave always is; after that there are **two** routes,
 * and either one is enough.
 *
 * The original route is the travel ladder: clear the previous sector's first tier. That is
 * unchanged and still the intended path.
 *
 * The second route is UAT §23's — the account's **frontier**, the deepest point it has
 * reached on either ladder, against the sector's own `baseDepth`. A player who has fought
 * their way to the depth a sector is tuned for has already earned the right to stand in it,
 * and once the Tower exists a player who climbs rather than digs must still be able to reach
 * materials or the ascent is a dead-end axis that can never craft anything. The Forge's own
 * fiction says the Keepers arm the whole war effort out of the Reliquary; this is that
 * paying off.
 *
 * **Widening only, and that is load-bearing.** The frontier route can add access, never
 * remove it, so no existing save can lose a sector it had — a ladder-unlocked sector stays
 * unlocked at frontier 0. `tools/world.ts` asserts both halves, including monotonicity in
 * the frontier.
 */
export function planetUnlocked(
  planet: PlanetSpec,
  progress: Readonly<Record<string, number>>,
  frontier = 0,
): boolean {
  const i = PLANETS.findIndex((p) => p.id === planet.id);
  if (i <= 0) return true;
  if (frontier >= planet.baseDepth) return true;
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
  // A Memory rebuilds from the instance, for exactly the reason the two branches above
  // exist: a generic `riftConfig` rebuild would hand floor two a config with no Memory on
  // it, which would silently drop the place, the encounter, both modifier lists and the
  // danger — the same shape of bug this function was written to fix for planets.
  //
  // The import is a deliberate cycle (`memories.ts` reads the sector roster for its own
  // pool). It is safe because neither module touches the other during evaluation — only
  // inside functions — but do not add a *top-level* read of one from the other.
  if (config.memory) {
    return { ...memoryConfig(config.memory, config.floor + 1, config.challengerTier), players };
  }
  // The Convergence (UAT §17) rebuilds itself from the week rather than `riftConfig`,
  // exactly why the planet branch above exists — a generic rebuild would lose the
  // week's seed, modifiers and key tier the same way it would lose a planet's spec.
  if (config.weekly) {
    return { ...weeklyConfig(config.weekly.week, config.floor + 1, config.challengerTier), players };
  }
  // The Tower is the one other endless, non-rift mode (`isRift` false, same as the Delve)
  // — without this branch it falls straight into the delve fallback below and a climb
  // silently drops the player back onto the Delve's own ladder. `tower.height` is the one
  // durable ladder position here, the same role `depth` plays for the Delve.
  if (config.tower) {
    return towerConfig(config.tower.height + 1, config.challengerTier, players);
  }
  if (!config.mode.isRift) return delveConfig(config.depth + 1, config.challengerTier, players);
  return { ...riftConfig(config.mode.id, config.tier, config.floor + 1, config.challengerTier), players };
}
