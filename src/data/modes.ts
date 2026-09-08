/**
 * Run modes — how a dive is configured before you ever set foot in it.
 *
 * The **Delve** is the original ladder: one floor at a time, descend or extract, no
 * upper bound. **Rifts** are the Diablo-shaped alternative: a fixed sequence of floors
 * ending in a boss, opened at a tier you choose, where the difficulty is exponential in
 * that tier rather than linear in depth. Clearing a rift unlocks the next tier of it.
 *
 * The two rift flavors are deliberately opposite. The **Abyssal Rift** is brutal and
 * pays in rarity — it bends the loot table upward and hands out very little else. The
 * **Avarice Rift** is a step easier and pays in volume: coins, keys and a pile of drops
 * you'll mostly sell. Which one you run is the interesting decision.
 *
 * Everything a mode changes lives here, so a new mode is a data entry rather than a
 * branch in the simulation.
 *
 * **The Avarice Rift's id is still `"hoard"`, and that is deliberate.** It was called the
 * Hoard Rift until `docs/game_story_worldbuilding.md` renamed it, tying the farming
 * content to the Hell / greed / Dante cosmology the rest of the world runs on. Only the
 * *display* name moved: `RunModeId` is the key type of two persisted records —
 * `GameState.riftTiers` and `RunStats.riftsCleared` — and both load through
 * `{ ...fresh, ...saved }`, so changing the id would leave every existing save's real
 * progress orphaned under a dead `hoard` key while the ladder it reads reset to tier 1.
 * A rename worth no player's rift progress. If it ever does change, it needs a
 * `SAVE_VERSION` bump that migrates both records, not a find-and-replace.
 *
 * The same rule protects `"planet"`: `data/planets.ts` already renamed every
 * player-facing string in the sector system to the Ashen Reliquary, and this mode's own
 * `name`/`short` (now "Reliquary Expedition" / "Reliquary") were the last loose thread —
 * but the id stays `planet` for exactly the reason `hoard` did.
 */

import { challengerMultiplier } from "./challenger";
import type { DailyRun } from "./daily";
import type { PlanetSpec } from "./planets";
import type { WeeklyRun } from "./weekly";

export const RUN_MODES = ["delve", "abyss", "hoard", "planet", "vigil", "convergence"] as const;
export type RunModeId = (typeof RUN_MODES)[number];

export interface RunMode {
  readonly id: RunModeId;
  readonly name: string;
  readonly short: string;
  readonly blurb: string;
  readonly color: string;
  /** Rifts are a fixed run of floors ending in a boss. The delve is open-ended. */
  readonly isRift: boolean;
  /** Floors in one rift, the last of which is the boss. Zero means endless. */
  readonly floors: number;
  /** Effective depth of tier 1, floor 1, and how fast that climbs per tier. */
  readonly baseDepth: number;
  readonly depthPerTier: number;
  /** Effective depth added by each floor within a single rift. */
  readonly depthPerFloor: number;
  /**
   * Multiplies enemy health, damage and count on top of depth, compounding per tier.
   * This is the exponential in "exponentially difficult" — depth alone is too gentle
   * to ever actually stop somebody.
   */
  readonly dangerPerTier: number;
  /** Added to the rarity roll's depth bias. Abyss pushes hard, Avarice barely at all. */
  readonly rarityBias: number;
  /** Multiplies how many things drop — the Avarice Rift's whole pitch. */
  readonly quantity: number;
  readonly coinMult: number;
  readonly keyMult: number;
  /**
   * Multiplies gem drops — the cosmetic currency. Avarice is where you farm a
   * wardrobe, the abyss barely pays in them at all: it is already paying in rarity.
   */
  readonly gemMult: number;
  readonly xpMult: number;
  /** Deepest delve floor you must have cleared before this appears in town. */
  readonly unlockDepth: number;
  /**
   * A floor tileset id (`render/atlas/manifest.ts` → `TILESETS`) that overrides the
   * depth-bucketed biome's own tileset for this mode — the Abyssal Rift reads as
   * *beneath* the Delve, not as a deep Delve floor. Optional; the delve, the Avarice
   * Rift and planets all take the biome tileset. Only the tileset is swapped, not
   * the biome's palette / props / hazards.
   */
  readonly tileset?: string;
}

export const MODES: Record<RunModeId, RunMode> = {
  delve: {
    id: "delve", name: "The Delve", short: "Delve",
    blurb: "One floor at a time, as deep as you dare. Descend or extract after every clear.",
    color: "#7dd3fc",
    isRift: false, floors: 0,
    baseDepth: 1, depthPerTier: 0, depthPerFloor: 1,
    dangerPerTier: 1, rarityBias: 0, quantity: 1,
    coinMult: 1, keyMult: 1, gemMult: 1, xpMult: 1, unlockDepth: 0,
  },
  abyss: {
    id: "abyss", name: "Abyssal Rift", short: "Abyss",
    blurb: "Four floors and a warden at the bottom. It hits like a truck and pays in rarity.",
    color: "#ff1493",
    isRift: true, floors: 4,
    baseDepth: 8, depthPerTier: 2.2, depthPerFloor: 1.4,
    dangerPerTier: 1.17,
    // Roughly triples the odds of the top end at the same depth as a delve floor.
    rarityBias: 0.16, quantity: 1,
    coinMult: 0.75, keyMult: 1, gemMult: 0.8, xpMult: 1.3,
    // Gated later than Avarice: its first tier already asks for a level 11 character,
    // so meeting it at depth 6 would just be a wall with a nice name on it.
    unlockDepth: 8,
    // §7 — null-black, one wrong colour, geometry that doesn't close. Overrides
    // whatever deep-Delve biome the effective depth would otherwise hand it.
    tileset: "tiles.abyss",
  },
  // Display name is the Avarice Rift; the id stays `hoard` because it's a save key. See
  // the file header.
  hoard: {
    id: "hoard", name: "Avarice Rift", short: "Avarice",
    blurb: "Three floors, a softer beating, and far more of everything. This is where you farm.",
    color: "#fbbf24",
    isRift: true, floors: 3,
    baseDepth: 5, depthPerTier: 1.7, depthPerFloor: 1.1,
    dangerPerTier: 1.1,
    rarityBias: 0.02, quantity: 2.1,
    coinMult: 2.8, keyMult: 2.4, gemMult: 1.9, xpMult: 0.9, unlockDepth: 3,
  },
  /**
   * The generic mechanical shell every Reliquary expedition shares — rift-shaped, and a
   * step easier than the abyss, because a sector pays in materials rather than rarity.
   * A specific sector's own depth curve, boss and material payout ride along on
   * `RunConfig.planet` instead of here; unlocking is per-sector (`planetUnlocked` in
   * `data/planets.ts`), not gated by this mode's `unlockDepth`.
   *
   * Display name is the Reliquary Expedition; the id stays `planet` because it's a save
   * key (`GameState.riftTiers`, `RunStats.riftsCleared`). See the file header.
   */
  planet: {
    id: "planet", name: "Reliquary Expedition", short: "Reliquary",
    blurb: "Fight and mine your way to the boss. This is where materials come from.",
    color: "#4ade80",
    isRift: true, floors: 3,
    baseDepth: 1, depthPerTier: 0, depthPerFloor: 0,
    dangerPerTier: 1,
    rarityBias: 0.03, quantity: 1.6,
    coinMult: 1.4, keyMult: 1.3, gemMult: 1.1, xpMult: 1, unlockDepth: 0,
  },
  /**
   * The Vigil — the daily dungeon (UAT §17). One floor, the same for everybody on a given
   * UTC day, with two rotating modifiers; `data/daily.ts` derives all of it from the day
   * number and hangs the specifics on `RunConfig.daily`. Rift-shaped with a single floor so
   * the run ends where every rift does. It pays in *keys*: the clear cache carries one
   * guaranteed key of the day's tier, and it can be cleared once a day — the way `gemMult`
   * makes the hoard the wardrobe mode, this is the one reliable source of the currency
   * that's scarce everywhere else. Unlock is `DAILY_UNLOCK_DEPTH` in `daily.ts`, not here.
   */
  vigil: {
    id: "vigil", name: "The Vigil", short: "Vigil",
    blurb: "Today's rift, the same for everyone. One floor, two twists, and a key for closing it.",
    color: "#c084fc",
    isRift: true, floors: 1,
    baseDepth: 6, depthPerTier: 0, depthPerFloor: 0,
    dangerPerTier: 1,
    rarityBias: 0, quantity: 1,
    coinMult: 1, keyMult: 1, gemMult: 1, xpMult: 1.4, unlockDepth: 0,
  },
  /**
   * The Convergence — the weekly dungeon (UAT §17), the Vigil's harder sibling. Four
   * floors and a boss, the same for everybody in a given UTC week, with three rotating
   * modifiers; `data/weekly.ts` derives all of it from the week number and hangs the
   * specifics on `RunConfig.weekly`. `baseDepth`/`depthPerTier`/`depthPerFloor` here are
   * nominal and unused — `weeklyConfig` sets `depth` directly per floor, the same way
   * `dailyConfig` does for the Vigil. It pays in the two chests the Quartermaster
   * otherwise only sells outright (Adept's Trove, Collector's Hoard): the clear cache on
   * the boss floor carries one guaranteed key at that tier or better, plus one item
   * forced to Legendary or above. Unlock is `WEEKLY_UNLOCK_DEPTH` in `weekly.ts`, not here.
   */
  convergence: {
    id: "convergence", name: "The Convergence", short: "Convergence",
    blurb: "This week's collision of Rifts, the same for everyone. Four floors, three twists, and a warden waiting past all of them.",
    color: "#dc2626",
    isRift: true, floors: 4,
    baseDepth: 18, depthPerTier: 0, depthPerFloor: 0,
    dangerPerTier: 1,
    rarityBias: 0, quantity: 1,
    coinMult: 1, keyMult: 1, gemMult: 1.3, xpMult: 1.6, unlockDepth: 0,
  },
};

/** One floor's worth of run configuration. Everything downstream reads this. */
export interface RunConfig {
  readonly mode: RunMode;
  /** Rift tier. Zero for the delve. */
  readonly tier: number;
  /** 1-based floor index within this run. For the delve it equals the depth. */
  readonly floor: number;
  /** Effective depth: what the difficulty curve, biome and loot table are told. */
  readonly depth: number;
  /** Compounding multiplier on enemy stats from the rift tier, challenger tier included. */
  readonly danger: number;
  readonly bossFloor: boolean;
  /** True on the floor that ends the run. Always false for the endless delve. */
  readonly lastFloor: boolean;
  /** The player's own difficulty dial, zero for plain. Already folded into `danger`. */
  readonly challengerTier: number;
  /**
   * How many people are on this floor. One for every solo run, which is why nothing
   * downstream had to change — `partyScale` in `data/depth.ts` is the only thing that
   * reads it, and at one player every multiplier it produces is exactly 1.
   */
  readonly players?: number;
  /** Set only for a planet expedition — its own visuals, boss and material payout. */
  readonly planet?: { readonly spec: PlanetSpec; readonly tier: number };
  /** Set only for the daily Vigil — the day, its seed, its modifiers and its key. */
  readonly daily?: DailyRun;
  /** Set only for the weekly Convergence — the week, its base seed, its modifiers and
   *  its key. */
  readonly weekly?: WeeklyRun;
}

/**
 * The fraction of unbanked coins and gems that survives an early extraction — leaving
 * through the entrance portal with the floor's kill quota unmet (UAT §6). Items, keys
 * and materials don't survive it at all, and XP is never touched.
 *
 * Deliberately brutal. The whole point of the two-portal floor is that you cannot dip
 * out of a dangerous floor still holding the valuable loot, so the choice at the exit
 * has to read as "risk finishing, or lose the drops" rather than "cash out at a small
 * discount".
 */
export const EARLY_EXTRACT_KEEP = 0.15;

export function delveConfig(depth: number, challengerTier = 0, players = 1): RunConfig {
  const d = Math.max(1, Math.floor(depth));
  return {
    mode: MODES.delve,
    tier: 0,
    floor: d,
    depth: d,
    danger: challengerMultiplier(challengerTier),
    bossFloor: d % 5 === 0,
    lastFloor: false,
    challengerTier,
    players,
  };
}

export function riftConfig(modeId: RunModeId, tier: number, floor: number, challengerTier = 0): RunConfig {
  const mode = MODES[modeId];
  if (!mode.isRift) return delveConfig(floor, challengerTier);
  const t = Math.max(1, Math.floor(tier));
  const f = Math.min(Math.max(1, Math.floor(floor)), mode.floors);
  const depth = Math.round(mode.baseDepth + mode.depthPerTier * (t - 1) + mode.depthPerFloor * (f - 1));
  return {
    mode,
    tier: t,
    floor: f,
    depth: Math.max(1, depth),
    danger: Math.pow(mode.dangerPerTier, t - 1) * challengerMultiplier(challengerTier),
    // Every rift ends on its boss. That's the contract: you don't get paid without one.
    bossFloor: f === mode.floors,
    lastFloor: f === mode.floors,
    challengerTier,
  };
}

export function modeUnlocked(mode: RunMode, deepestDepth: number): boolean {
  return deepestDepth >= mode.unlockDepth;
}

/**
 * What a party does to a floor.
 *
 * Two people bring roughly twice the damage and twice the health pool, so monsters get
 * fatter and there are more of them — but their *damage* barely moves. A party can't
 * dodge for each other: a hit that one-shots somebody is a wipe waiting to happen no
 * matter how many friends are watching. The pressure comes from volume, which is also
 * what makes a party fight look like a party fight.
 *
 * At one player every number here is 1, which is why a solo dive is untouched.
 */
export function partyScale(players: number): { health: number; count: number; damage: number } {
  const extra = Math.max(0, (players || 1) - 1);
  return {
    health: 1 + 0.65 * extra,
    count: 1 + 0.4 * extra,
    damage: 1 + 0.1 * extra,
  };
}
