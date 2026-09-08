/**
 * Depth is the difficulty dial for the delve. Everything the dungeon needs to know
 * about how hard a floor is comes from here, so tuning lives in one place.
 *
 * A rift floor goes through exactly the same function: the mode hands over an effective
 * depth plus a `danger` multiplier that compounds per tier, and the curve below does the
 * rest. That's the whole trick — one difficulty curve, two ways of walking up it.
 */

import { clamp } from "../core/math";
import { biomeFor } from "./biomes";
import { layerFor, type WorldLayer } from "./layers";
import { challengerName, challengerRarityBias, challengerRewardMult } from "./challenger";
import { DAILY_MODIFIERS, dailyEffects } from "./daily";
import type { Element } from "./elements";
import { delveConfig, partyScale, type RunConfig } from "./modes";
import { rewardCurve } from "./rewards";
import { WEEKLY_MODIFIERS, weeklyEffects } from "./weekly";

export interface DepthProfile {
  readonly depth: number;
  readonly name: string;
  readonly tint: string;
  /** The run this floor belongs to — mode, tier, position in the rift. */
  readonly run: RunConfig;
  /**
   * Where in the war this floor is (UAT §23) — the band of the Delve it falls in, or the
   * realm the rift tore into. Read here rather than re-derived per screen, the same
   * reason `data/encounters.ts` owns "which boss does this floor spawn". Nothing in the
   * simulation reads it; it is what the HUD and the commit screens say.
   */
  readonly layer: WorldLayer;
  /** Baseline enemy stats before the archetype multipliers. */
  readonly enemyHealth: number;
  readonly enemyDamage: number;
  readonly enemySpeed: number;
  readonly waves: number;
  readonly enemiesPerWave: number;
  readonly maxAlive: number;
  /** How much a rift tier's danger fattens a wave, independent of depth. Exposed so the
   *  wave director can scale burst size the same way it scales the headcount. */
  readonly crowd: number;
  readonly coinMultiplier: number;
  readonly xpMultiplier: number;
  /** Multiplies enemy attack cooldowns: deep floors swing more often. */
  readonly aggression: number;
  /** Multiplies the wind-up before a hit lands: deep floors telegraph less. */
  readonly telegraph: number;
  readonly isBoss: boolean;
  /** Extra bias handed to the rarity roll — the abyss's entire reason to exist. */
  readonly rarityBias: number;
  /** Multiplies how many separate things drop. */
  readonly quantity: number;
  /**
   * Added to the item level a drop rolls at — UAT §16's "potential item power", from
   * `rewardCurve`. Zero on any floor at ordinary danger.
   */
  readonly itemPower: number;
  /**
   * Odds a dropped item is infused with this floor's element — §16's "special variants",
   * from `rewardCurve`. Zero on a physical-element floor, since infusing with physical
   * would mean nothing, exactly as the monster infusion rule already has it.
   */
  readonly variantChance: number;
  /** The element a variant drop is infused with: this floor's own. */
  readonly variantElement: Element;
  /** Recommended character level; below it you take a visible beating. */
  readonly recommendedLevel: number;
  /** Short label for the HUD: "Abyssal Rift · T4 · Floor 2/4", or "" for a delve. */
  readonly tag: string;
}

export function profileFor(depth: number, config?: RunConfig): DepthProfile {
  const run = config ?? delveConfig(depth);
  const d = Math.max(1, Math.floor(depth));
  const isBoss = run.bossFloor;
  // A planet expedition brings its own visual identity instead of the depth-bucketed
  // biome — everything else about the curve below is unchanged either way.
  const biome = run.planet?.spec.biome ?? biomeFor(d);
  const mode = run.mode;
  const danger = run.danger;
  // The Vigil's modifiers (UAT §17): multipliers on the fields below, nothing more. On
  // any other run every one of these is exactly 1 (or 0 for the elite bump).
  const daily = dailyEffects(run.daily?.modifiers ?? []);
  // The Convergence's modifiers (UAT §17): the same idiom as the Vigil's, plus `speed`,
  // which nothing else reads. On any other run every one of these is exactly 1 (or 0
  // for the elite bump).
  const weekly = weeklyEffects(run.weekly?.modifiers ?? []);
  /**
   * What this floor's difficulty is worth (UAT §16) — keyed on the danger the player
   * **chose**, which is `danger` with the daily's and weekly's own twists divided back out.
   *
   * A rift tier, the Challenger dial and a sector tier are all opted into, and §16 is
   * about paying for that choice. A rotating activity's modifiers are the weather: §17
   * deliberately splits them into ones that change how the floor *fights* (Ferocious,
   * Swarming, Hasty) and ones that change what it *pays* (Bountiful, Sparse Ground), with
   * at most one payer at a time so the reward stays predictable. Letting a danger modifier
   * through the reward curve would quietly make it a second payer and undo that.
   *
   * So both weathers are divided out — each is 1 on any run that isn't its own activity,
   * and on one whose roll included no danger modifier. The dial still stacks on top of
   * either normally, because the dial is a choice.
   */
  const reward = rewardCurve(danger / (daily.danger * weekly.danger));
  // A co-op floor is scaled by how many people walked into it. One player leaves every
  // number below exactly where it was.
  const party = partyScale(run.players ?? 1);

  // Health grows geometrically to stay ahead of the 2^n rarity ladder on gear. Fights
  // are meant to be long enough to hurt: damage taken accumulates over a fight while
  // damage dealt does not, so length is most of the difficulty.
  //
  // The base was raised with the class overhaul. Classes, weapon families, the tree
  // and the ultimates together put roughly 70% more damage in the player's hands, and
  // the smoke test caught it immediately: a careless bot was walking to depth 17 and a
  // raid boss was dying in eighteen seconds. Enemies got the difference back.
  const enemyHealth = 48 * Math.pow(1.22, d - 1) * danger * party.health * daily.health * weekly.health;
  // Damage starts gentle and accelerates: the first few floors have to be learnable
  // with no gear at all, while depth 20 should genuinely frighten a geared character.
  // Rift danger is applied at a lower exponent so a high tier is a longer fight before
  // it's an instant death.
  //
  // The post-playtest pass (UAT §8): "difficulty scaling does not keep pace with player
  // power" past the early floors. The base curve (constant + linear + `0.32·(d-1)²`) is
  // untouched — a floor at or below depth 8 plays exactly as it did — and a second
  // quadratic term switches on only past depth 8 and only grows from there, so the deep
  // floors ramp toward boss-level pressure without touching a curve the smoke tests and
  // the early game are calibrated against. The rest of the gap is closed by composition
  // (the monster-affix and elite systems, UAT §3/§4), per §8's own "do not solve this
  // exclusively by inflating [stats]".
  const deep = Math.max(0, d - 8);
  const enemyDamage =
    (5 + 3.6 * (d - 1) + 0.32 * (d - 1) * (d - 1) + 0.06 * deep * deep) * Math.pow(danger, 0.8) * party.damage;
  const enemySpeed = (54 + Math.min(52, 2.4 * (d - 1))) * Math.min(1.25, Math.pow(danger, 0.15)) * weekly.speed;
  // More bodies at high tiers, but only slowly — a screen full of monsters stops being
  // a fight and starts being a wall.
  const crowd = Math.min(1.6, Math.pow(danger, 0.28));

  return {
    depth: d,
    name: floorName(biome.name, d, run),
    tint: biome.tint,
    run,
    // Asked with the *effective* depth this profile was built for, which is the number
    // every other field below is derived from. Identical to `run.depth` at every current
    // call site; stated explicitly so a caller that ever describes a floor at a depth its
    // config doesn't carry can't land in the wrong band.
    layer: layerFor(run.depth === d ? run : { ...run, depth: d }),
    enemyHealth,
    enemyDamage,
    enemySpeed,
    // A boss floor is the boss. Adds come from the encounter itself, not a wave director.
    waves: isBoss ? 1 : Math.min(4, 2 + Math.floor(d / 5)),
    // Hordes, not a trickle: a wave throws 2-3x the bodies the old drip-feed did. Individual
    // trash gets a bit softer to pay for it (see WAVE_HEALTH_MULT in dungeon.ts), so the
    // total work per wave grows more modestly than the headcount alone suggests.
    enemiesPerWave: Math.min(60, Math.round((3 + Math.floor(d * 0.5)) * crowd * 2.5 * party.count * daily.count * weekly.count)),
    maxAlive: Math.min(110, Math.round((5 + Math.floor(d * 0.9)) * crowd * 2.2 * party.count * daily.count * weekly.count)),
    crowd,
    coinMultiplier: Math.pow(1.22, d - 1) * mode.coinMult * challengerRewardMult(run.challengerTier) * daily.coins * weekly.coins,
    xpMultiplier: Math.pow(1.22, d - 1) * mode.xpMult,
    // Numbers alone can't threaten a player who dodges well, so the deeper floors
    // squeeze the thing skill actually spends: reaction time. The slopes are unchanged;
    // the post-playtest pass (UAT §8) only lowered the floors these clamp at, so the
    // deepest floors (roughly depth 30+) keep getting more aggressive and tighter-
    // telegraphed instead of plateauing. Nothing at or above those clamps in normal play
    // is affected.
    aggression: clamp(1 - (d - 1) * 0.016, 0.4, 1) * daily.aggression * weekly.aggression,
    telegraph: clamp(1 - (d - 1) * 0.014, 0.48, 1) * daily.telegraph * weekly.telegraph,
    isBoss,
    rarityBias: 0.06 + mode.rarityBias + challengerRarityBias(run.challengerTier) + daily.rarityBias + weekly.rarityBias,
    // §16's "number of possible drops": the mode's own volume, a rotating activity's
    // modifier, and now difficulty itself. Every roll site that already respected
    // `quantity` gets this for free.
    quantity: mode.quantity * daily.quantity * weekly.quantity * reward.dropCount,
    itemPower: reward.itemPower,
    // A floor whose local element is plain physical has no variant to offer — the same
    // reason `rollElement` skips infusing monsters on one.
    variantChance: biome.element === "physical" ? 0 : reward.variantChance,
    variantElement: biome.element,
    // Levelling now tracks depth closely, so the advice should too.
    recommendedLevel: Math.max(1, Math.round(d * 0.9 * Math.pow(danger, 0.35))),
    tag: buildTag(run),
  };
}

/** "Htrae · T2 · Floor 2/3 · Nightmare V" — whichever of those actually apply. */
function buildTag(run: RunConfig): string {
  const parts: string[] = [];
  if ((run.players ?? 1) > 1) parts.push(`${run.players} players`);
  if (run.planet) {
    parts.push(`${run.planet.spec.name} · T${run.planet.tier} · Floor ${run.floor}/${run.planet.spec.floors}`);
  } else if (run.daily) {
    parts.push(`${run.mode.name} · ${run.daily.modifiers.map((id) => DAILY_MODIFIERS[id].name).join(" · ")}`);
  } else if (run.weekly) {
    parts.push(`${run.mode.name} · Floor ${run.floor}/${run.mode.floors} · ${run.weekly.modifiers.map((id) => WEEKLY_MODIFIERS[id].name).join(" · ")}`);
  } else if (run.mode.isRift) {
    parts.push(`${run.mode.name} · T${run.tier} · Floor ${run.floor}/${run.mode.floors}`);
  }
  const challenger = challengerName(run.challengerTier);
  if (challenger) parts.push(challenger);
  return parts.join(" · ");
}

function floorName(biomeName: string, d: number, run: RunConfig): string {
  if (run.bossFloor) return `${biomeName} — Warden's Hall`;
  if (run.mode.isRift) return `${biomeName} — Rift Fracture`;
  return `${biomeName} ${romanize(((d - 1) % 5) + 1)}`;
}

const NUMERALS = ["I", "II", "III", "IV", "V"] as const;
function romanize(n: number): string {
  return NUMERALS[n - 1] ?? String(n);
}

/**
 * Coins dropped by one kill on this floor, before the archetype's loot weight.
 * Deliberately stingy: coins are the pressure that keeps you diving, and a player who
 * can buy a Legendary key after two floors has nothing left to want.
 */
export function coinDropFor(profile: DepthProfile): number {
  return 3.5 * profile.coinMultiplier;
}

/** XP granted by one kill on this floor, before the archetype's xp multiplier. */
export function xpDropFor(profile: DepthProfile): number {
  return 7 * profile.xpMultiplier;
}
