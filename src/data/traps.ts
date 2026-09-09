/**
 * Floor hazards. Traps are part of the difficulty budget, not decoration: they punish
 * standing still, and because most of them hurt monsters too, they double as a weapon
 * if you can bait something across one.
 *
 * Damage is expressed as a multiple of the floor's baseline enemy damage so hazards
 * scale with depth automatically and stay in the same league as the monsters.
 */

export type TrapKind = "spike" | "flame" | "saw" | "turret" | "mire" | "regard";

export interface TrapSpec {
  readonly kind: TrapKind;
  readonly label: string;
  /** Multiple of `DepthProfile.enemyDamage`. */
  readonly damage: number;
  /** Full cycle in seconds: idle, then `warn` of telegraph, then `active`. */
  readonly cycle: number;
  readonly warn: number;
  readonly active: number;
  /** Contact radius in world units. */
  readonly radius: number;
  /** Depth at which this hazard starts appearing. */
  readonly minDepth: number;
  readonly weight: number;
  /** Whether monsters can be killed by it — the reason baiting is worth doing. */
  readonly hitsEnemies: boolean;
}

export const TRAPS: Record<TrapKind, TrapSpec> = {
  spike: {
    kind: "spike", label: "Spike Plate",
    damage: 0.7, cycle: 2.6, warn: 0.55, active: 0.45, radius: 21,
    minDepth: 2, weight: 1.2, hitsEnemies: true,
  },
  mire: {
    kind: "mire", label: "Tar Pool",
    // Always on. Slows anything standing in it and chews on you the whole time.
    damage: 0.25, cycle: 0, warn: 0, active: 0, radius: 34,
    minDepth: 3, weight: 0.8, hitsEnemies: false,
  },
  flame: {
    kind: "flame", label: "Flame Vent",
    damage: 1.0, cycle: 3.4, warn: 0.7, active: 0.85, radius: 26,
    minDepth: 5, weight: 0.9, hitsEnemies: true,
  },
  saw: {
    kind: "saw", label: "Blade Runner",
    // Always live, and it patrols — the only hazard that comes to you.
    damage: 0.85, cycle: 0, warn: 0, active: 0, radius: 13,
    minDepth: 7, weight: 0.85, hitsEnemies: true,
  },
  turret: {
    kind: "turret", label: "Bone Turret",
    // Fires a bolt down a fixed lane on a timer. Predictable, so it's dodgeable.
    damage: 0.6, cycle: 2.3, warn: 0.45, active: 0.12, radius: 12,
    minDepth: 9, weight: 0.8, hitsEnemies: true,
  },
  regard: {
    kind: "regard", label: "Regard",
    // The Tower's own hazard, and the only one that is *aimed*. It has no cycle: it
    // watches, and when somebody inside its reach has held still for `REGARD_HOLD` it
    // marks the ground under them and sears that ground `warn` seconds later. Heaven is
    // Order, and standing still is how a thing gets looked at long enough to be corrected.
    //
    // `warn` is the whole design. It is the longest telegraph of any hazard in the game
    // (`tools/world.ts` asserts that, so it can never quietly become the shortest), because
    // this is the one you are asked to read while you are doing something else. Moving out
    // of the marked circle beats it outright; so does a dash, like everything else.
    damage: 1.1, cycle: 0, warn: 0.85, active: 0.3, radius: 26,
    minDepth: 1, weight: 1.0, hitsEnemies: true,
  },
};

/**
 * How long you have to hold still before a ward marks you, in seconds.
 *
 * **This number was measured, not chosen, and the measurement is the reason it is 0.8.** A
 * hazard that punishes standing still taxes a bow, a staff and every channelled build
 * harder than it taxes a sword, and a tower-only mechanic that quietly nerfs half the
 * roster would be a worse version of a problem the game already has. `npm run regard`
 * (`tools/regard.ts`) plays identical tower floors with a closing policy and a
 * hold-range policy and reports both rates that matter.
 *
 * **A longer hold is not the fix, and this is the counter-intuitive part.** Melee
 * stillness is many short pauses; ranged stillness is one long park. Lengthening the hold
 * filters out the short pauses and leaves the park, so it *concentrates* the tax on ranged
 * rather than relieving it — measured, monotonically, from 0.8s out to 1.4s. 0.8s is the
 * bottom of the sear-ratio curve across the whole sweep and the only value tested where a
 * ranged build takes less from the ward than a melee one. The full table is in
 * `tools/regard.ts`'s header. Re-run it before touching this, and read the table before
 * assuming which way to move.
 */
export const REGARD_HOLD = 0.8;
/** How far a ward can see. Beyond this it does not care that you have stopped. */
export const REGARD_WATCH = 170;
/** Under this many units per second you count as standing still. */
export const REGARD_STILL_SPEED = 6;
/** Seconds a ward is blind after it sears, so one ward can't pin one spot forever. */
export const REGARD_RECOVER = 1.7;

/** How slow you move inside a tar pool. */
export const MIRE_SLOW = 0.52;
/** Seconds a monster is immune after a hazard hits it, so one plate can't chain-kill. */
export const TRAP_ENEMY_COOLDOWN = 0.8;

/** Hazards this depth is allowed to place, from the biome's list. */
export function trapsFor(depth: number, allowed: readonly TrapKind[]): TrapSpec[] {
  return allowed.map((k) => TRAPS[k]).filter((t) => t.minDepth <= depth);
}

/** How many hazards a floor gets. Grows with depth, capped so a floor stays a fight. */
export function trapCount(depth: number): number {
  if (depth < 2) return 0;
  return Math.min(10, 1 + Math.floor(depth / 2));
}
