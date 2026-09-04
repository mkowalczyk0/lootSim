export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Shortest signed angular distance from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** Squared distance — use in hot loops to avoid the sqrt. */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function circlesOverlap(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
): boolean {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

/** Normalize a vector, returning (0,0) unchanged rather than NaN. */
export function normalize(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}

/** Approach `current` toward `target` by at most `maxStep`. */
export function approach(current: number, target: number, maxStep: number): number {
  const d = target - current;
  return Math.abs(d) <= maxStep ? target : current + Math.sign(d) * maxStep;
}

export function formatNumber(n: number): string {
  const v = Math.floor(n);
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(2) + "B";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 100_000) return (v / 1000).toFixed(0) + "K";
  return v.toLocaleString("en-US");
}
