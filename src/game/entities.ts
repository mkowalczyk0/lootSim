import type { BossAbilityId, BossSpec, TelegraphShape } from "../data/bosses";
import type { UltimateId } from "../data/ultimates";
import type { Element, Resists } from "../data/elements";
import type { EnemyArchetype } from "../data/enemies";
import type { Rarity } from "../data/rarity";
import type { StatusInstance } from "./combat";
import type { Item } from "./item";

/** Anything drawn with interpolation keeps its previous position for the render pass. */
export interface Body {
  x: number;
  y: number;
  px: number;
  py: number;
  radius: number;
}

export interface Avatar extends Body {
  vx: number;
  vy: number;
  /** Facing angle in radians; drives the attack arc and the sprite's direction. */
  facing: number;
  attackTimer: number;
  /** Counts down while the swing is live; the hitbox only exists above zero. */
  swingTimer: number;
  swingAngle: number;
  dashTimer: number;
  dashCooldown: number;
  invulnTimer: number;
  /**
   * Invulnerability that came from a dash specifically. Boss mechanics ignore the
   * ordinary window you get for being hit — a telegraph you watched for a second and a
   * half is supposed to land — but they never ignore this one, because dashing through
   * the shape is the skill the fight is asking for.
   */
  dashInvuln: number;
  hitFlash: number;
  /**
   * The class ultimate, while it is happening. This is the one piece of avatar state
   * that takes the controls away from you: a Comet Charge steers itself, a Bladestorm
   * sweeps on its own clock, and the fields below are how far through it we are.
   */
  ultimate: UltimateId | null;
  ultTimer: number;
  ultTotal: number;
  /** Countdown to the next sub-event: a whirlwind tick, a sweep, a meteor. */
  ultTick: number;
  /** Walls a charge has left to bounce off. */
  ultBounces: number;
  /** Direction a charge is travelling, or the angle a storm has swept to. */
  ultAngle: number;
  /** Bodies already hit by the current pass, so one charge can't hit twice. */
  ultHits: Set<number>;
  /** Sub-events still owed — meteors left to drop, sweeps left to make. */
  ultPending: number;
  /** Bursts a whirlwind has already thrown, so its slower clock stays honest. */
  ultEmits: number;
  /** Seconds left of a Blood Rage style buff, and what it's giving you. */
  buffTimer: number;
  buffAttackSpeed: number;
  buffLifeOnHit: number;
}

export type EnemyState = "spawning" | "active" | "windup";

/** Live state of a boss encounter, hung off the one enemy that is the boss. */
export interface BossState {
  readonly spec: BossSpec;
  /** Index into `spec.phases`. Only ever goes up. */
  phase: number;
  /** Seconds until the next ability is chosen. */
  actionTimer: number;
  /** The ability currently winding up, and how long is left of the wind-up. */
  ability: BossAbilityId | null;
  castTimer: number;
  castTotal: number;
  /** Per-ability recovery, keyed by ability id. */
  cooldowns: Partial<Record<BossAbilityId, number>>;
  /** Where the pending ability is aimed — snapshotted when the cast began. */
  aimX: number;
  aimY: number;
  /** Seconds left of a charge, and the velocity it's travelling at. */
  chargeTimer: number;
  chargeVx: number;
  chargeVy: number;
  /** Staggered meteors still to drop, and the gap until the next one. */
  pendingDrops: number;
  dropTimer: number;
  /**
   * Seconds left of an enrage-style self-buff, and what it's currently granting.
   * Both multipliers reset to 1 the instant the timer runs out.
   */
  buffTimer: number;
  buffDamageMult: number;
  buffHasteMult: number;
}

export interface Enemy extends Body {
  /** Stable identity, so a projectile can remember what it already hit. */
  readonly id: number;
  readonly archetype: EnemyArchetype;
  readonly name: string;
  health: number;
  maxHealth: number;
  damage: number;
  speed: number;
  attackTimer: number;
  /** Telegraph before a hit lands, so attacks are dodgeable rather than unfair. */
  windup: number;
  state: EnemyState;
  spawnTimer: number;
  hitFlash: number;
  knockX: number;
  knockY: number;
  /** Elites are tinted by a rarity and drop noticeably better loot. */
  elite: Rarity | null;
  facing: number;
  /** Immunity window after a hazard hits it, so one spike plate can't chain-kill. */
  trapCooldown: number;
  /** Rises while a wall is in the way; drives the sidestep that gets it unstuck. */
  stuckTimer: number;
  /** Which way this one sidesteps when blocked, so a crowd splits around a pillar. */
  dodgeDir: number;
  /** What its hits are made of. */
  element: Element;
  resists: Resists;
  statuses: StatusInstance[];
  /** Multiplies knockback taken. Bosses are near-immovable. */
  knockResist: number;
  /** Set for the one enemy that is a raid boss; null for everything else. */
  boss: BossState | null;
  /** True for anything a boss summoned, so adds can be cleaned up and counted. */
  summoned: boolean;
}

/**
 * A planted totem. It belongs to you, it doesn't move, and it keeps hitting things
 * after you've walked away — which is the entire point of the Shaman.
 */
export interface Totem extends Body {
  readonly id: number;
  /** Index of the hero who planted it — kill credit and charge go back to them. */
  readonly owner: number;
  remaining: number;
  pulseTimer: number;
  /** Seconds between pulses. */
  interval: number;
  damage: number;
  element: Element;
  /** How far a pulse reaches, and how many bodies it picks. */
  range: number;
  targets: number;
  ailment: number;
  color: string;
}

export interface Projectile extends Body {
  vx: number;
  vy: number;
  damage: number;
  friendly: boolean;
  /** Hero index that fired it, or -1 for anything hostile. A friendly bolt is somebody's
   *  basic attack, so it has to know whose crit chance and whose triggers it carries. */
  readonly owner: number;
  life: number;
  color: string;
  element: Element;
  /** Bodies it passes through before dying. Zero means it stops at the first. */
  pierce: number;
  /** Enemy ids already hit, so a piercing bolt can't hit the same body twice. */
  hits: Set<number>;
  /** Chance the hit inflicts its element's ailment. */
  ailment: number;
  /**
   * True for a projectile that *is* your basic attack — a staff bolt. It resolves
   * through the same path a swing does, so elemental gear, crits, life on hit and
   * triggers all apply to a caster exactly as they do to somebody with an axe.
   */
  basic: boolean;
}

/**
 * A danger zone painted on the floor before it goes off. Telegraphs are the entire
 * language of a boss fight: the shape tells you where not to be, and the timer tells
 * you how long you have to not be there.
 */
export interface Telegraph {
  readonly shape: TelegraphShape;
  x: number;
  y: number;
  /** Facing, for cones and lines. */
  angle: number;
  /**
   * Fixed offset from whatever `angle` a followed telegraph is reset to each tick.
   * Lets several cones or lines off the same boss hold their relative spacing —
   * a windmill's three blades, say — instead of collapsing onto one shared facing.
   */
  angleOffset: number;
  radius: number;
  /** Donut only: the safe hole in the middle. */
  inner: number;
  /** Cone only: total arc in radians. */
  arc: number;
  /** Line only: half-width. */
  width: number;
  /** Seconds left before it resolves, and the full wind-up it started with. */
  remaining: number;
  total: number;
  damage: number;
  element: Element;
  color: string;
  hitsPlayer: boolean;
  hitsEnemies: boolean;
  /** Seconds of burning ground left behind where it lands. */
  linger: number;
  /** Follows this enemy while winding up — used for anything centered on the boss. */
  followId: number | null;
}

/** Lingering floor left by a mechanic. Standing in it is your own fault. */
export interface GroundZone extends Body {
  element: Element;
  /** Damage per tick. Ticks are half a second apart. */
  damage: number;
  remaining: number;
  tickTimer: number;
  hitsPlayer: boolean;
  hitsEnemies: boolean;
  color: string;
}

/**
 * `gem` is the vanity currency: it banks like coins but is only ever spent on
 * cosmetic capsules, so the power economy and the wardrobe never trade places.
 * `material` only ever drops on a planet expedition — kills and resource nodes both
 * pay in the planet's own element, which is the entire reason to travel there.
 */
export type PickupKind = "coin" | "key" | "item" | "potion" | "xp" | "gem" | "material";

export interface Pickup extends Body {
  readonly kind: PickupKind;
  /** Coin amount, XP amount, or material amount; unused for item/key/potion. */
  value: number;
  item: Item | null;
  keyTier: string | null;
  rarity: Rarity | null;
  /** Which material this is, for a `material` pickup. Null for everything else. */
  element: Element | null;
  /** Pop-out velocity so drops scatter instead of stacking on the corpse. */
  vx: number;
  vy: number;
  life: number;
  magnet: boolean;
}
