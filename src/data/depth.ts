/**
 * Depth is the single difficulty dial. Everything the dungeon needs to know about
 * how hard floor N is comes from here, so tuning lives in one place.
 */

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
  readonly isBoss: boolean;
  /** Recommended character level; below it you take a visible beating. */
  readonly recommendedLevel: number;
}

const BIOMES = [
  { name: "Training Grounds", tint: "#2c3040" },
  { name: "Whispering Forest", tint: "#1e3326" },
  { name: "Dark Cave", tint: "#241f2e" },
  { name: "Ashen Wastes", tint: "#33241d" },
  { name: "Dragon's Lair", tint: "#3a1c1c" },
  { name: "The Veil", tint: "#2a1836" },
] as const;

export function biomeFor(depth: number): { name: string; tint: string } {
  const i = Math.min(BIOMES.length - 1, Math.floor((depth - 1) / 5));
  return BIOMES[i]!;
}

export function profileFor(depth: number): DepthProfile {
  const d = Math.max(1, Math.floor(depth));
  const isBoss = d % 5 === 0;
  const biome = biomeFor(d);

  // Health grows geometrically to stay ahead of the 2^n rarity ladder on gear, but
  // gently enough that fights stay short — a long fight is what actually kills you,
  // because damage taken accumulates while damage dealt does not.
  const enemyHealth = 26 * Math.pow(1.2, d - 1);
  // Damage stays linear so a deep floor is survivable with good play, not a one-shot.
  const enemyDamage = 5 + 2.6 * (d - 1);
  const enemySpeed = 52 + Math.min(26, 1.4 * (d - 1));

  return {
    depth: d,
    name: isBoss ? `${biome.name} — Warden's Hall` : `${biome.name} ${romanize(((d - 1) % 5) + 1)}`,
    tint: biome.tint,
    enemyHealth,
    enemyDamage,
    enemySpeed,
    waves: isBoss ? 2 : Math.min(5, 2 + Math.floor(d / 4)),
    enemiesPerWave: Math.min(12, 3 + Math.floor(d * 0.6)),
    maxAlive: Math.min(18, 5 + Math.floor(d * 0.7)),
    coinMultiplier: Math.pow(1.35, d - 1),
    xpMultiplier: Math.pow(1.3, d - 1),
    isBoss,
    recommendedLevel: 1 + Math.floor((d - 1) * 1.6),
  };
}

const NUMERALS = ["I", "II", "III", "IV", "V"] as const;
function romanize(n: number): string {
  return NUMERALS[n - 1] ?? String(n);
}

/** Coins dropped by one kill at this depth, before the archetype's loot weight. */
export function coinDropFor(depth: number): number {
  return 6 * profileFor(depth).coinMultiplier;
}

/** XP granted by one kill at this depth, before the archetype's xp multiplier. */
export function xpDropFor(depth: number): number {
  return 9 * profileFor(depth).xpMultiplier;
}
