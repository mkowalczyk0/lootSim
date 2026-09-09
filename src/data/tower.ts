/**
 * The Tower — the ascent toward Heaven (UAT §21).
 *
 * §21 asks for two directions: *delve downward to keep Hell at bay, ascend upward to
 * keep Heaven at bay*. The Delve has always been the first half. This file is the
 * second, and it is the one genuinely new place in §21/§23 — everything else in that
 * work was making the world that already existed legible.
 *
 * **It is the Delve's mirror, not a second game.** A tower floor is one floor at a time,
 * climb or extract after every clear, every fifth height a boss, no upper bound — and it
 * goes through the *same* difficulty curve: `towerConfig` hands `profileFor` an effective
 * depth equal to the height and a `danger` of exactly 1 (the Challenger dial aside). There
 * is no second curve, and there must not be: height 12 fights like depth 12 because that
 * is what "one curve, several ways of walking up it" means (`data/depth.ts`). What makes
 * the Tower a different *place* is everything below — where it is, what lives there, what
 * it is made of and what it pays — not a steeper number.
 *
 * **Heaven is Order, and it gets worse the higher you go.** That is the doc's whole point
 * (`docs/game_story_worldbuilding.md`, HEAVEN: "nothing is allowed to deviate") and the
 * art guide's (`docs/art-style-guide.md` §6: "Ascending the Tower should feel *worse*, not
 * better"). The three bands here are §6's three bands, in §6's own palette, and they sit
 * exactly on the `UP_LAYERS` edges in `data/layers.ts` — heights 1-5, 6-25, 26+ — so the
 * biome a floor is made of and the layer of the war it sits in change on the same step,
 * the same property the descent already had. `tools/world.ts` pins it.
 *
 * **The tilesets are named but not yet painted.** `tiles.tower-*` are the ids the art pass
 * will fill; until a PNG is committed for one, `atlasTileset` returns null and the floor
 * falls back to the flat `bakeFloor` fill in the palette below, exactly as the Abyssal
 * Rift did before its sheet landed. They are deliberately **not** in `TILESETS`: the smoke
 * test reads a committed sheet for every id in that record, and claiming art that doesn't
 * exist would be a lie the gate would rightly fail. So the Tower is playable and correctly
 * coloured, and it is unpainted. Say so out loud rather than letting somebody find it.
 *
 * Pure data. Nothing here imports from the simulation.
 */

import type { BiomeStyle } from "./biomes";
import { BOSSES, type BossSpec } from "./bosses";
import { challengerMultiplier } from "./challenger";
import type { EnemyKind } from "./enemies";
import { MODES, type RunConfig } from "./modes";

/**
 * The celestial orders, as the roster's own names.
 *
 * `docs/art-style-guide.md` §6 already assigned the ranks — "celestial hierarchy as enemy
 * tiers": Powers are the war-angels, Cherubim the watchers, Thrones living law, Dominions
 * the commanders, Virtues the miracle-workers. Every name below is one of those eight
 * orders (`docs/game_story_worldbuilding.md`, CELESTIAL HIERARCHY) doing the job that
 * order is described as doing, attached to the archetype that already fights that way.
 *
 * **No new archetypes and no new behaviour**: this is the same eleven kinds fighting the
 * same eleven ways, wearing Heaven's names — the identical trick a Reliquary sector plays
 * (`PlanetSpec.enemyNames`), and for the identical reason. A second monster pipeline is
 * not what §21 asked for.
 */
type Roster = Partial<Record<EnemyKind, string>>;

/** Heights 1-5. Bone-gold, warm light, a cathedral somebody has kept tidy. */
const LOWER_TOWER: BiomeStyle = {
  name: "The Lower Tower",
  tileset: "tiles.tower-lower",
  monsterSet: "tower",
  // Art guide §6: bone-gold `#d8cfa8` base, `#8a7d54` shadow, `#f4ecc9` highlight,
  // `#fde047` divine light. The floor is the shadow tone so the walls read as lit.
  tint: "#8a7d54", floorAlt: "#95875c", wall: "#d8cfa8", wallSide: "#6b6142",
  accent: "#fde047",
  props: ["torch", "rock"],
  layouts: ["open", "pillars", "chambers"],
  traps: ["regard", "spike", "turret"],
  element: "holy",
  enemyNames: {
    grunt: "Lesser Power", archer: "Gate Cherub", brute: "Gilded Bulwark",
    swarmer: "Winged Mote", caster: "Chorister of the Stair",
    charger: "Onrushing Virtue", bomber: "Censer-Bearer",
    shieldbearer: "Cherub of the Wall", summoner: "Lesser Dominion",
    sniper: "Watcher of the Stair", leech: "Mercy of the Virtues",
  } satisfies Roster,
};

/** Heights 6-25. The warmth goes out of it: repeating geometry, nowhere to stand in shadow. */
const MID_TOWER: BiomeStyle = {
  name: "The Seamless Halls",
  tileset: "tiles.tower-mid",
  monsterSet: "tower",
  // §6: bleaching toward white, gold hard-edged.
  tint: "#a89f7e", floorAlt: "#b4ab88", wall: "#f4ecc9", wallSide: "#8a7d54",
  accent: "#fde047",
  props: ["torch", "crystal"],
  layouts: ["pillars", "ring", "chambers", "gauntlet"],
  traps: ["regard", "turret", "flame", "saw"],
  element: "holy",
  enemyNames: {
    grunt: "Power-at-Arms", archer: "Virtue Lancer", brute: "Throne-Bearer",
    swarmer: "Halo Fragment", caster: "Dominion Herald",
    charger: "Principality's Charge", bomber: "Consecrated Vessel",
    shieldbearer: "Throne of the Wall", summoner: "Dominion Commander",
    sniper: "Cherub of the Long Sight", leech: "Virtue of Restoration",
  } satisfies Roster,
};

/** Heights 26+. Light as a weapon, symmetry total enough to lose your footing in. */
const UPPER_HEAVEN: BiomeStyle = {
  name: "The Blinding Heights",
  tileset: "tiles.tower-upper",
  monsterSet: "tower",
  // §6: near-white, `#fde047` as a blinding hazard rather than a highlight.
  tint: "#cfc9b0", floorAlt: "#d9d3ba", wall: "#f8f4e4", wallSide: "#a8a288",
  accent: "#fde047",
  props: ["crystal", "torch"],
  layouts: ["ring", "pillars", "gauntlet", "open"],
  traps: ["regard", "turret", "flame", "saw"],
  element: "holy",
  enemyNames: {
    grunt: "Perfected Form", archer: "Lance of Correction", brute: "Seamless Colossus",
    swarmer: "Splinter of Radiance", caster: "Voice of the Order",
    charger: "Seraph's Advance", bomber: "Vessel of the Word",
    shieldbearer: "Unyielding Throne", summoner: "Archangel's Adjutant",
    sniper: "Eye of the Seraphim", leech: "Correcting Virtue",
  } satisfies Roster,
};

/**
 * The three bands, in order. Their edges are the `UP_LAYERS` edges — see the file header.
 */
export const TOWER_BIOMES: readonly BiomeStyle[] = [LOWER_TOWER, MID_TOWER, UPPER_HEAVEN];

/**
 * What a tower floor is made of. The ascent's answer to `biomeFor`.
 *
 * Bucketed to §6's three bands rather than `biomeFor`'s flat five-depth buckets, because
 * §6 authored three and the Tower's layer table (`data/layers.ts`) already committed to
 * their edges. Anything above 25 keeps the top band for good, the same way `biomeFor`
 * keeps its last one past depth 26.
 */
export function towerBiomeFor(height: number): BiomeStyle {
  const h = Math.max(1, Math.floor(height));
  if (h <= 5) return LOWER_TOWER;
  if (h <= 25) return MID_TOWER;
  return UPPER_HEAVEN;
}

/**
 * The Tower's five encounters, borrowed and reskinned.
 *
 * Exactly the `planetBossSpec` mechanism (`data/planets.ts`) and for exactly its reason:
 * phases, health and kit come from an existing `BossSpec` wholesale and only the identity
 * moves, so a second content pipeline never opens. `tools/legends.ts` audits these against
 * the same boss rules every other spec is held to, because they *are* those specs.
 *
 * The rank ladder is the doc's (CELESTIAL HIERARCHY): a Cherub guards the lower gate, a
 * Virtue works miracles at you, a Power is built for the war, a Throne is the law standing
 * up — and above the orders, per the doc's own closing line on the hierarchy, "entities
 * that even the player cannot properly comprehend". The last one holds every height from
 * 25 up, which is the band `layers.ts` calls the Celestial Endgame.
 */
interface TowerBoss {
  /** The `BossSpec.id` whose fight this is. */
  readonly templateId: string;
  readonly name: string;
  readonly title: string;
}

const TOWER_BOSSES: readonly TowerBoss[] = [
  {
    templateId: "warden", name: "Cherub of the Lower Gate",
    title: "It has been watching this door since before the door.",
  },
  {
    templateId: "choir", name: "Virtue of the Second Ascent",
    title: "It is about to work a miracle. The miracle is aimed at you.",
  },
  {
    templateId: "colossus", name: "Power of the Third Rampart",
    title: "Built for the war. Nothing else was included.",
  },
  {
    templateId: "herald", name: "Throne of the Fourth Judgment",
    title: "The law, standing up.",
  },
  {
    templateId: "nameless", name: "What Sits Above the Orders",
    title: "You have been perceived. That was the mistake.",
  },
];

/**
 * The encounter waiting at this height. Deeper into the climb works down the list and
 * then stays there, the same shape as `bossFor`.
 *
 * The element is `holy` throughout — the Tower's own, and the thing that makes an
 * elemental build's trip up different from its trip down.
 */
export function towerBossSpec(height: number): BossSpec {
  const i = Math.floor(Math.max(1, height) / 5) - 1;
  const entry = TOWER_BOSSES[Math.min(TOWER_BOSSES.length - 1, Math.max(0, i))]!;
  const template = BOSSES.find((b) => b.id === entry.templateId) ?? BOSSES[0]!;
  return {
    ...template,
    id: `tower-${entry.templateId}`,
    name: entry.name,
    title: entry.title,
    element: "holy",
  };
}

/**
 * One floor of the climb — `delveConfig` with the mode swapped and the height carried.
 *
 * `depth` is the height, deliberately and literally: the Tower walks up the one difficulty
 * curve at the same rate the Delve walks down it. `tower.height` rides alongside because
 * the *height* is what picks the band, the biome and the encounter, and a caller that
 * described a tower floor by its depth alone would get the descent's answers.
 *
 * Nothing new crosses the co-op wire: `RunConfigWire` already carries `mode` and `floor`,
 * and `configFromWire` rebuilds a tower run by calling this (`net/sync.ts`).
 */
export function towerConfig(height: number, challengerTier = 0, players = 1): RunConfig {
  const h = Math.max(1, Math.floor(height));
  return {
    mode: MODES.tower,
    tier: 0,
    floor: h,
    depth: h,
    danger: challengerMultiplier(challengerTier),
    // Every fifth floor is an encounter, exactly as the Delve has always had it.
    bossFloor: h % 5 === 0,
    // The climb has no top. Same promise the Delve makes going the other way.
    lastFloor: false,
    challengerTier,
    players,
    tower: { height: h },
  };
}
