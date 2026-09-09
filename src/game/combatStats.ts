/**
 * Combat stats: a passive read of the damage and healing a hero has already resolved,
 * for the optional in-run HUD overlay (Settings → "Combat stats"). Its whole purpose is
 * to let a player tell whether a gear or tree change actually did something, which means
 * a subtly wrong number here is worse than no number at all.
 *
 * Every figure is written from the same choke points the simulation already resolves
 * every hit and heal through — `damageEnemy`, `applyPlayerDamage` and every `.heal()`
 * call in `game/dungeon.ts` — never a second accounting of damage that could drift from
 * the real one. This class holds no logic that could change that resolution: it is a
 * plain accumulator, read and reset by `Hero`/`Dungeon`, and nothing in `game/` or
 * `combat/` ever reads it back to make a decision. A run's outcome is identical whether
 * or not a hero's stats are ever looked at.
 */

/** How far back the rolling-window DPS looks. Long enough to smooth a single miss or a
 *  single crit, short enough to actually move when a fight's pace changes. */
export const DPS_WINDOW = 5;

interface DamageSample {
  t: number;
  amount: number;
}

export class CombatStats {
  totalDamageDealt = 0;
  totalDamageTaken = 0;
  totalHealingDone = 0;
  largestHit = 0;
  /** Damage dealt in the last `DPS_WINDOW` seconds, newest last. */
  private recent: DamageSample[] = [];

  /** `now` is `Dungeon.elapsed` — the same clock every caller already has to hand, so
   *  this never has to reach for `Date.now()` or otherwise notice real time. */
  recordDamageDealt(amount: number, now: number): void {
    if (amount <= 0) return;
    this.totalDamageDealt += amount;
    if (amount > this.largestHit) this.largestHit = amount;
    this.recent.push({ t: now, amount });
    this.prune(now);
  }

  recordDamageTaken(amount: number): void {
    if (amount > 0) this.totalDamageTaken += amount;
  }

  /** `amount` should already be the honest, clamped amount a heal actually restored
   *  (`Player.heal`'s return value) — never the amount requested, which overheals. */
  recordHealing(amount: number): void {
    if (amount > 0) this.totalHealingDone += amount;
  }

  private prune(now: number): void {
    while (this.recent.length && now - this.recent[0]!.t > DPS_WINDOW) this.recent.shift();
  }

  /**
   * Damage per second over the last `DPS_WINDOW` seconds — or over however much of the
   * floor has actually elapsed, if that's shorter, so it isn't a misleadingly low number
   * in a fight's first couple of seconds.
   */
  rollingDps(now: number): number {
    this.prune(now);
    if (this.recent.length === 0) return 0;
    const span = Math.min(DPS_WINDOW, now);
    return span > 0 ? this.recent.reduce((sum, s) => sum + s.amount, 0) / span : 0;
  }

  /** Damage per second averaged over the whole floor so far. */
  averageDps(now: number): number {
    return now > 0.001 ? this.totalDamageDealt / now : 0;
  }
}
