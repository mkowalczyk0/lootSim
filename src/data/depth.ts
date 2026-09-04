/**
 * Depth is the single difficulty dial. Everything the dungeon needs to know about
 * how hard floor N is comes from here, so tuning lives in one place.
 */

import { clamp } from "../core/math";
import { biomeFor } from "./biomes";

export interface DepthProfile {
  readonly depth: number;
  readonly name: string;
  readonly tint: string;
  /** Baseline enemy stats before the archetype multipliers. */
  readonly enemyHealth: number;
  readonly enemyDamage: number;
  readonly enemySpeed: number;
  readonly waves: number;
  readonly enemiesPerWave: number;
  readonly maxAlive: number;
  readonly coinMultiplier: number;
  readonly xpMultiplier: number;
  /** Multiplies enemy attack cooldowns: deep floors swing more often. */
  readonly aggression: number;
  /** Multiplies the wind-up before a hit lands: deep floors telegraph less. */
  readonly telegraph: number;
  readonly isBoss: boolean;
  /** Recommended character level; below it you take a visible beating. */
  readonly recommendedLevel: number;
}

export function profileFor(depth: number): DepthProfile {
  const d = Math.max(1, Math.floor(depth));
  const isBoss = d % 5 === 0;
  const biome = biomeFor(d);

  // Health grows geometrically to stay ahead of the 2^n rarity ladder on gear. Fights
  // are meant to be long enough to hurt: damage taken accumulates over a fight while
  // damage dealt does not, so length is most of the difficulty.
  const enemyHealth = 28 * Math.pow(1.22, d - 1);
  // Damage starts gentle and accelerates: the first few floors have to be learnable
  // with no gear at all, while depth 20 should genuinely frighten a geared character.
  const enemyDamage = 5 + 2.8 * (d - 1) + 0.22 * (d - 1) * (d - 1);
  const enemySpeed = 54 + Math.min(52, 2.4 * (d - 1));

  return {
    depth: d,
    name: isBoss ? `${biome.name} — Warden's Hall` : `${biome.name} ${romanize(((d - 1) % 5) + 1)}`,
    tint: biome.tint,
    enemyHealth,
    enemyDamage,
    enemySpeed,
    waves: isBoss ? 2 : Math.min(4, 2 + Math.floor(d / 5)),
    enemiesPerWave: Math.min(10, 3 + Math.floor(d * 0.5)),
    maxAlive: Math.min(22, 5 + Math.floor(d * 0.9)),
    coinMultiplier: Math.pow(1.22, d - 1),
    xpMultiplier: Math.pow(1.22, d - 1),
    // Numbers alone can't threaten a player who dodges well, so the deeper floors
    // squeeze the thing skill actually spends: reaction time.
    aggression: clamp(1 - (d - 1) * 0.014, 0.55, 1),
    telegraph: clamp(1 - (d - 1) * 0.012, 0.58, 1),
    isBoss,
    // Levelling now tracks depth closely, so the advice should too.
    recommendedLevel: Math.max(1, Math.round(d * 0.9)),
  };
}

const NUMERALS = ["I", "II", "III", "IV", "V"] as const;
function romanize(n: number): string {
  return NUMERALS[n - 1] ?? String(n);
}

/**
 * Coins dropped by one kill at this depth, before the archetype's loot weight.
 * Deliberately stingy: coins are the pressure that keeps you diving, and a player who
 * can buy a Legendary key after two floors has nothing left to want.
 */
export function coinDropFor(depth: number): number {
  return 3.5 * profileFor(depth).coinMultiplier;
}

/** XP granted by one kill at this depth, before the archetype's xp multiplier. */
export function xpDropFor(depth: number): number {
  return 7 * profileFor(depth).xpMultiplier;
}
