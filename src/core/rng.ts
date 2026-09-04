/**
 * Small deterministic PRNG (mulberry32). Deterministic runs make bugs
 * reproducible and let a dungeon floor be rebuilt from a single seed.
 */
export class Rng {
  private s: number;

  constructor(seed: number = (Math.random() * 2 ** 32) >>> 0) {
    this.s = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  /** Integer in [lo, hi], inclusive on both ends. */
  int(lo: number, hi: number): number {
    return Math.floor(this.range(lo, hi + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Rng.pick on empty array");
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  /** Pick a key from a map of key -> non-negative weight. Zero-weight keys never win. */
  weighted<K extends string>(weights: Readonly<Record<K, number>>): K {
    const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    if (total <= 0) throw new Error("Rng.weighted with no positive weights");
    let roll = this.next() * total;
    for (const [key, w] of entries) {
      roll -= w;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1]![0];
  }

  /** Random point on the unit circle. */
  angle(): number {
    return this.next() * Math.PI * 2;
  }
}

/** Shared instance for cosmetic randomness (particles, flavor) — never for loot. */
export const fxRng = new Rng();
