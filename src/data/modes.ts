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
 * **Every mode carries two lines, and they answer different questions.** `blurb` is the
 * mechanics — floors, what it pays, what it costs you. `lore` is *why the place exists*
 * (UAT §22): a Rift is not a game mode with a portal on it, it is a wound left where
 * something from Heaven and something from Hell met, and the Keepers send you in to
 * contain it. Both are lifted from `docs/game_story_worldbuilding.md` (The Rifts,
 * Standard / Avarice / Abyssal Rifts, the three-sided cosmology) — that document is the
 * tiebreaker and it is not short of material, so a new mode's `lore` is a quotation from
 * it in the game's own deadpan register, never invented cosmology. `RIFT_LORE` is the one
 * sentence the Rifts screen says once about all of them. `tools/previews.ts` checks each
 * line actually names the war rather than restating the payout.
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
import type { MemoryInstance } from "./memories";
import type { PlanetSpec } from "./planets";
import type { RaidSpec } from "./raids";
import type { WeeklyRun } from "./weekly";

export const RUN_MODES = [
  "delve", "abyss", "hoard", "planet", "vigil", "convergence", "tower", "raid", "memory",
  "training",
] as const;
export type RunModeId = (typeof RUN_MODES)[number];

export interface RunMode {
  readonly id: RunModeId;
  readonly name: string;
  readonly short: string;
  /** The mechanics in one line: floors, payout, what it will do to you. */
  readonly blurb: string;
  /** Why this place exists, in the world's own terms (UAT §22). See the file header. */
  readonly lore: string;
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

/**
 * What a Rift is, said once. Shown on the Rifts screen above whichever flavour is
 * selected; the per-mode `lore` says what makes *this* one different.
 */
export const RIFT_LORE =
  "A Rift is not a portal. It is a wound: something from Heaven and something from Hell "
  + "met over the mortal world, and reality lost. The Keepers go in to contain the damage "
  + "and bring back anything useful. That is you.";

export const MODES: Record<RunModeId, RunMode> = {
  delve: {
    id: "delve", name: "The Delve", short: "Delve",
    blurb: "One floor at a time, as deep as you dare. Descend or extract after every clear.",
    lore: "Purgatory is made of everything that fell between Heaven and Hell, and it goes "
      + "down. What the war leaves behind, sinks; the deeper you dig, the older and the "
      + "worse it gets. The Keepers stopped mapping it some way down.",
    color: "#7dd3fc",
    isRift: false, floors: 0,
    baseDepth: 1, depthPerTier: 0, depthPerFloor: 1,
    dangerPerTier: 1, rarityBias: 0, quantity: 1,
    coinMult: 1, keyMult: 1, gemMult: 1, xpMult: 1, unlockDepth: 0,
  },
  abyss: {
    id: "abyss", name: "Abyssal Rift", short: "Abyss",
    blurb: "Four floors and a warden at the bottom. It hits like a truck and pays in rarity.",
    lore: "A Rift that tore through Hell and kept going. Beneath the circles is the "
      + "Abyss, which has no rulers, no judgment and no interest in you. It unmakes. "
      + "What comes back up is very rare and no longer quite what it was.",
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
    lore: "When lesser angels and demons wipe each other out they leave everything "
      + "behind: weapons, gold, pieces of greater things. Everything in reach crawls "
      + "over to hoard it. The Keepers call that an Avarice Rift, and would like it "
      + "back.",
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
    lore: "The Ashen Reliquary is where Purgatory keeps its dead: a graveyard of gods and "
      + "broken realms the size of a continent, behind one gate in the Citadel. The "
      + "Keepers mine it for what the war is fought with. So do you.",
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
    lore: "A Standard Rift: the aftermath of a lesser fight between Heaven and Hell, "
      + "small enough to close in a day. The Keepers keep watch on it. Somebody still "
      + "has to go in.",
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
    lore: "Several Rifts torn open close enough together that they collapsed into one "
      + "wound: four floors of wreckage from four different fights between Heaven and "
      + "Hell, fused, and whatever crawled out of the point where they met.",
    color: "#dc2626",
    isRift: true, floors: 4,
    baseDepth: 18, depthPerTier: 0, depthPerFloor: 0,
    dangerPerTier: 1,
    rarityBias: 0, quantity: 1,
    coinMult: 1, keyMult: 1, gemMult: 1.3, xpMult: 1.6, unlockDepth: 0,
  },
  /**
   * The Tower — the ascent (UAT §21), and the Delve's mirror in every mechanical respect:
   * not a rift, one floor at a time, every fifth height an encounter, no upper bound. Its
   * curve is the Delve's curve — `towerConfig` in `data/tower.ts` hands `profileFor` an
   * effective depth equal to the height and a `danger` of 1 — because §21 asked for a
   * second *direction*, not a second difficulty model. What differs is the place: holy
   * biomes that infuse the wildlife as you climb, the celestial orders as the roster, five
   * reskinned encounters, and (UAT §16 stays neutral at ordinary danger) rewards that
   * differ in kind rather than in amount.
   *
   * `unlockDepth` 5 is the ruling: one axis teaches the game before the second appears,
   * and the Keepers send you up once you have shown you can hold the down.
   */
  tower: {
    id: "tower", name: "The Tower", short: "Tower",
    blurb: "One floor at a time, as high as you last. Climb or extract after every clear.",
    lore: "Heaven descended. Heaven does not leave a wound ragged: it ordered it, and it "
      + "is still ordering it, one perfect floor at a time. The Keepers' doctrine says "
      + "Heaven must not descend. Somebody has to go up and see how far it has.",
    color: "#d8cfa8",
    isRift: false, floors: 0,
    baseDepth: 1, depthPerTier: 0, depthPerFloor: 1,
    dangerPerTier: 1, rarityBias: 0, quantity: 1,
    coinMult: 1, keyMult: 1, gemMult: 1, xpMult: 1, unlockDepth: 5,
  },
  /**
   * A raid (UAT §15) — one floor, and that floor is a mythological event.
   *
   * Rift-shaped, because a raid is a fixed run ending in a boss and that is what
   * `isRift` means; one floor, because §15 asks for raid *bosses* and a gauntlet in front
   * of the encounter only taxes retrying it. Which raid, at which tier, and everything
   * that differs between the four rides on `RunConfig.raid` (`data/raids.ts`) exactly as
   * a sector rides on `RunConfig.planet` — `baseDepth`/`depthPerTier`/`dangerPerTier`
   * here are nominal and unused, since `raidConfig` sets the depth and the danger from
   * the raid's own spec.
   *
   * `unlockDepth` is 0 because a raid is not gated on this axis: each one opens at its
   * own `unlockFrontier` (`raidUnlocked`), which reads the account frontier so the ascent
   * counts as well as the descent. It pays in rarity and in item power — the loot is the
   * point — and barely at all in coins, which is what the Avarice Rift is for.
   */
  raid: {
    id: "raid", name: "Raid", short: "Raid",
    blurb: "One floor. One enormous thing standing on it. Its table is the only place its items come from.",
    lore: "Some of what the war shook loose is too large to be called a monster: a "
      + "celestial warlord Heaven threw out, a labyrinth wearing a body, whatever is "
      + "poling the river now. The Keepers do not contain these. They send enough people "
      + "and hope.",
    color: "#f472b6",
    isRift: true, floors: 1,
    baseDepth: 12, depthPerTier: 0, depthPerFloor: 0,
    dangerPerTier: 1,
    // The loot is the whole reason to be here, and it is the rarest table in the game.
    rarityBias: 0.14, quantity: 1.3,
    coinMult: 0.9, keyMult: 1.2, gemMult: 0.9, xpMult: 1.5, unlockDepth: 0,
  },
  /**
   * A Memory — the custom-rift endgame (`data/memories.ts`, `docs/memories.md`).
   *
   * Rift-shaped: three floors, the last one the encounter. Everything that makes one
   * Memory different from another rides on `RunConfig.memory` exactly as a sector rides
   * on `planet`, so `baseDepth`/`depthPerTier`/`depthPerFloor` here are nominal and
   * unused — `memoryConfig` sets the depth and the danger from the instance itself.
   *
   * **Every axis below is deliberately neutral**, and that is the load-bearing part: an
   * unmodified Memory at depth N is a Delve floor at depth N, which is what lets
   * `tools/memories.ts` state "there is no second curve" as an equality rather than as a
   * bound. A Memory's variation is its own burdens and boons, never the mode's.
   *
   * `unlockDepth` is 0 because the Altar is not gated on this axis: it opens when the
   * *character* has banked both ends of the war (`memoryUnlocked`), which is a pair of
   * per-class records rather than the account's deepest floor.
   */
  memory: {
    id: "memory", name: "A Memory", short: "Memory",
    blurb: "Three floors of somewhere that already happened, held exactly as you shaped it.",
    lore: "Purgatory is built out of what it remembers, and it never remembers the same "
      + "way twice. The Keepers learned to pin one down: a place the war went through, "
      + "made to come back whole. It comes back angry about being asked.",
    color: "#67e8f9",
    isRift: true, floors: 3,
    baseDepth: 1, depthPerTier: 0, depthPerFloor: 1,
    dangerPerTier: 1, rarityBias: 0, quantity: 1,
    coinMult: 1, keyMult: 1, gemMult: 1, xpMult: 1, unlockDepth: 0,
  },
  /**
   * The build-tester room (`data/training.ts`): one dummy, no encounter, no reward.
   *
   * One floor, `isRift: true` for the same reason a raid is — a fixed run ending in the
   * one thing on it — but every reward multiplier below is zero and `rarityBias`/
   * `quantity` are zero too, which is what makes "can't exist in a run" structural
   * rather than promised: nothing in `data/drops.ts` lists `training` as a source, so
   * there is no table for a future change to accidentally wire up, and the reward curve
   * (`data/rewards.ts`) has nothing to multiply even if one did. `baseDepth`/
   * `dangerPerTier` are nominal and fixed at the gentlest possible reading (depth 1,
   * danger 1) — a build-tester compares two builds against each other, not against a
   * scaled difficulty, so the target has to be the same target every time regardless of
   * how deep the account has gone. `unlockDepth: 0` because it is a tool, not a reward
   * for progress; nothing about clearing it opens anything either — see `recordDepth`.
   */
  training: {
    id: "training", name: "Training Dummy", short: "Training",
    blurb: "One dummy, no encounter, no reward. Hit it and read the numbers.",
    lore: "The Keepers keep one behind a door off the Citadel hall for every Legend who "
      + "shows up certain their new grip is faster than the last one. It has no opinion "
      + "about the war. It barely has an opinion about being hit.",
    color: "#94a3b8",
    isRift: true, floors: 1,
    baseDepth: 1, depthPerTier: 0, depthPerFloor: 0,
    dangerPerTier: 1, rarityBias: 0, quantity: 0,
    coinMult: 0, keyMult: 0, gemMult: 0, xpMult: 0, unlockDepth: 0,
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
  /**
   * Set only for a Tower climb (UAT §21) — how far up this floor is.
   *
   * Identical to `depth` at every call site, because the Tower walks the one difficulty
   * curve at the Delve's own rate. It is carried separately anyway because *height* is
   * what picks the band, the biome and the encounter, and a caller holding only a depth
   * would be handed the descent's answers for all three. An inline shape rather than an
   * import so `data/tower.ts` can depend on this file and not the other way round.
   */
  readonly tower?: { readonly height: number };
  /**
   * Set only for a raid (UAT §15) — which mythological event this is, and at what tier.
   *
   * The same shape and the same reasoning as `planet`: everything that differs between
   * the four raids (the arena, the encounter, the depth, the danger ladder, the layer it
   * stands at) lives on the spec rather than on `MODES.raid`, so a fifth raid is a data
   * entry. Built only by `raidConfig`.
   */
  readonly raid?: { readonly spec: RaidSpec; readonly tier: number };
  /**
   * Set only for a Memory (`data/memories.ts`) — the instance being spent on this run.
   *
   * The same shape and the same reasoning as `planet` and `tower`: everything that differs
   * between two Memories (the place, the encounter, the depth, and both modifier lists)
   * lives on the instance rather than on `MODES.memory`, which stays neutral. A type-only
   * import so `data/memories.ts` can depend on this file and not the other way round.
   */
  readonly memory?: MemoryInstance;
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

/**
 * The build-tester room. `danger` is pinned at exactly 1 regardless of the Challenger
 * dial — the dial exists to make content harder and pay better, and this floor does
 * neither (the dummy's stats are fixed in `game/dungeon.ts`'s `spawnDummy`, its
 * resistances are all zero, and every reward multiplier on the mode itself is zero), so
 * letting Challenger nudge `danger` here would only put a "Death March" label on a
 * floor that number does nothing to.
 */
export function trainingConfig(challengerTier = 0, players = 1): RunConfig {
  return {
    mode: MODES.training,
    tier: 0,
    floor: 1,
    depth: 1,
    danger: 1,
    bossFloor: true,
    lastFloor: true,
    challengerTier,
    players,
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
