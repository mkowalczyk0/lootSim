import type { EnemyArchetype } from "../data/enemies";
import type { Rarity } from "../data/rarity";
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
  hitFlash: number;
}

export type EnemyState = "spawning" | "active" | "windup";

export interface Enemy extends Body {
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
}

export interface Projectile extends Body {
  vx: number;
  vy: number;
  damage: number;
  friendly: boolean;
  life: number;
  color: string;
}

export type PickupKind = "coin" | "key" | "item" | "potion" | "xp";

export interface Pickup extends Body {
  readonly kind: PickupKind;
  /** Coin amount, or XP amount; unused for item/key/potion. */
  value: number;
  item: Item | null;
  keyTier: string | null;
  rarity: Rarity | null;
  /** Pop-out velocity so drops scatter instead of stacking on the corpse. */
  vx: number;
  vy: number;
  life: number;
  magnet: boolean;
}
