import type { BossAbilityId, BossSpec, TelegraphShape } from "../data/bosses";
import type { DamagePacket } from "../combat/damage";
import type { Element, Resists } from "../data/elements";
import type { EnemyArchetype } from "../data/enemies";
import type { MonsterAffix } from "../data/monster-affixes";
import type { Rarity } from "../data/rarity";
import type { StatusContainer } from "../combat/status";
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
  /**
   * Time until the *next* charge comes back. Zero whenever the stock is full — it only
   * runs while something is owed, so a full stock never has a phantom timer.
   */
  dashCooldown: number;
  /**
   * Dashes ready right now. `Player.dashCharges` is the cap (1 for almost everyone); a
   * dash spends one, the cooldown returns one. Both ends of the co-op wire carry it, so
   * a client with two charges predicts its second dash exactly like its first.
   */
  dashStock: number;
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
   * Self-buff contribution the dungeon copies out of the hero's status container each
   * tick, so the legacy melee path can read a Frenzy or a Blessed without reaching into
   * `src/combat` — attack-speed and life-on-hit only; damage buffs ride `castInputFor`.
   */
  buffAttackSpeed: number;
  buffLifeOnHit: number;
  /**
   * Seconds this hero has been standing still, reset the moment they actually travel.
   * Read by the Tower's regard wards, which mark whoever has held still long enough.
   * Host-side only and off the wire: the ward is the host's decision and the client
   * learns the mark from the snapshot like any other telegraph.
   */
  stillTime: number;
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
  /** Enrage damage multiplier. */
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
  /** Seconds between attacks before the depth `aggression` factor — `archetype`'s value
   *  unless a Frenzied-style affix has shortened it. */
  attackCooldown: number;
  /** Telegraph before a hit lands, so attacks are dodgeable rather than unfair. */
  windup: number;
  state: EnemyState;
  spawnTimer: number;
  hitFlash: number;
  knockX: number;
  knockY: number;
  /** Elites are a mini-boss tier (UAT §4): rarer, much stronger, a guaranteed handful
   *  of affixes, a distinct health bar, a bigger body and one telegraphed slam. */
  elite: Rarity | null;
  /** Seconds until this elite's next telegraphed slam. 0 / unused on everything else. */
  eliteCast: number;
  facing: number;
  /** Immunity window after a hazard hits it, so one spike plate can't chain-kill. */
  trapCooldown: number;
  /** Rises while a wall is in the way; drives the sidestep that gets it unstuck. */
  stuckTimer: number;
  /** Which way this one sidesteps when blocked, so a crowd splits around a pillar. */
  dodgeDir: number;
  /** Cadence clock for an archetype's special behaviour (UAT §2) — a charger's next
   *  rush, a summoner's next call, a leech's next pulse. Unused by plain melee/ranged. */
  behaviorTimer: number;
  /** A charger's dash velocity while it is mid-rush; both zero at rest. */
  chargeVx: number;
  chargeVy: number;
  /** What its hits are made of. */
  element: Element;
  resists: Resists;
  /** Every timed effect on this monster — burn, chill, bleed, a stun, a curse — the
   *  unified container the ability executor and the ailment path both read and write. */
  sc: StatusContainer;
  /** Multiplies knockback taken. Bosses are near-immovable. */
  knockResist: number;
  /** Set for the one enemy that is a raid boss; null for everything else. */
  boss: BossState | null;
  /** True for anything a boss summoned, so adds can be cleaned up and counted. */
  summoned: boolean;
  /** True only for a wave-director spawn, which is what the floor-clear quota counts
   *  (UAT §5) — never a summon, a Splitting monster's shards, or a boss add. */
  fromWave: boolean;
  /** Modular traits riding on this monster (UAT §3) — empty for most. */
  affixes: MonsterAffix[];
  /** Runtime bookkeeping for the affixes: periodic-behaviour timers, the regen ward
   *  pool, and a guard so a Splitting spawn can't split again forever. */
  affixState: {
    timers: Record<string, number>;
    ward: number;
    noSplit: boolean;
  };
  /** Multiplies incoming damage — an Armored affix drops this below 1. Default 1. */
  damageTakenMult: number;
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

/**
 * A summoned combatant that fights for the hero who made it. Unlike a `Totem` it moves,
 * picks its own targets and can be killed. Necromancer skeletons, Engineer drones, a
 * Ranger's falcon, a Warden's bear — all one entity, told apart by their numbers and
 * the command they were given. Kill credit, XP and threat all route back to `owner`.
 */
export interface Minion extends Body {
  readonly id: number;
  /** Hero index that summoned it. */
  readonly owner: number;
  /** Archetype tag from the ability that made it — "skeleton", "drone", "bear". */
  readonly unit: string;
  health: number;
  maxHealth: number;
  /** Damage per hit, already folded with whatever fraction of the owner it inherited. */
  damage: number;
  attackCooldown: number;
  attackTimer: number;
  /** Reach of its attack, centre to centre. */
  attackRange: number;
  /** Telegraph before its hit lands; 0 when it isn't winding up. */
  windup: number;
  speed: number;
  element: Element;
  facing: number;
  hitFlash: number;
  knockX: number;
  knockY: number;
  /** Seconds of life left. `Infinity` for a permanent summon. */
  remaining: number;
  /** How it decides what to do. Set at spawn, changed by Command abilities. */
  behavior: "follow" | "guardPoint" | "aggroNearest" | "commandTarget";
  /** For `commandTarget`: the enemy id it was told to focus. */
  commandTargetId: number | null;
  /** The point a `guardPoint` minion holds. */
  guardX: number;
  guardY: number;
  /** Slows, stuns and DoTs — the same container an enemy carries. */
  sc: StatusContainer;
  /** Sidestep bookkeeping when a wall is between it and its target. */
  stuckTimer: number;
  dodgeDir: number;
}

/**
 * What a slain monster leaves behind for a few seconds. Only the corpse economy reads
 * it — the Necromancer spends these to raise minions and to fuel some of its kit.
 */
export interface Corpse {
  readonly id: number;
  x: number;
  y: number;
  /** Seconds before it rots away on its own. */
  remaining: number;
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
  /**
   * The originating ability's damage packet, for a skill projectile. Carries the
   * `source` (tags, abilityId, `fromUltimate`) so a hit can be fed back into the
   * caster's resources — a Stormcaller's chakram builds Storm Charge, a Magician's
   * bolt feeds the meter — with THE ULTIMATE RULE intact. Absent on basic bolts
   * (they credit through `weaponStrike`) and on hostile projectiles.
   */
  packet?: DamagePacket;
  /**
   * Charged by flying through its owner's Predator's Trail — deals amplified damage on
   * its next hit and draws with a distinct tint so the charge is visible in flight.
   */
  empowered?: number;
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
  /** A friendly zone: it heals / shields / hastes allies standing in it and never damages. */
  benefit?: "heal" | "shield" | "haste";
  /** Hero index the zone tracks, for a `follows` benefit zone (Bard's march, Shaman's totem). */
  follows?: number;
  /** Hero index that cast the zone. Set for every hero-spawned zone (damage or benefit),
   *  so the zone keystones (Conflagration, Briarheart, Worldroot, Great Ritual) can find
   *  "the zones you own". Absent on boss lingers. */
  owner?: number;
  /** Status id a zone re-applies to whoever stands in it each tick (a pure status zone). */
  status?: string;
  /**
   * A `line` zone (Ranger's Predator's Trail): a lane from (`x`,`y`) to (`x2`,`y2`),
   * `radius` wide either side of the segment, rather than a circle. Absent on every
   * other zone.
   */
  x2?: number;
  y2?: number;
  /** Damage multiplier this zone gives its owner's projectiles travelling through it. */
  empowerProjectiles?: number;
  /**
   * The originating ability's damage packet, for a hero-cast damage zone. Its `source`
   * feeds each tick's hit back into the caster's resources (Shaman totems, Stormcaller
   * fields, Alchemist pools), with THE ULTIMATE RULE intact. Absent on boss lingers.
   */
  packet?: DamagePacket;
}

/**
 * `gem` is the vanity currency: it banks like coins but is only ever spent on
 * cosmetic capsules, so the power economy and the wardrobe never trade places.
 * `material` only ever drops on a planet expedition — kills and resource nodes both
 * pay in the planet's own element, which is the entire reason to travel there.
 */
export type PickupKind = "coin" | "key" | "item" | "potion" | "xp" | "gem" | "material" | "relic";

export interface Pickup extends Body {
  readonly kind: PickupKind;
  /** Coin amount, XP amount, or material amount; unused for item/key/potion. */
  value: number;
  item: Item | null;
  keyTier: string | null;
  rarity: Rarity | null;
  /** Which material this is, for a `material` pickup. Null for everything else. */
  element: Element | null;
  /** Which relic or artifact this is (`data/relics.ts`), for a `relic` pickup. Null for everything else. */
  relicId: string | null;
  /** Pop-out velocity so drops scatter instead of stacking on the corpse. */
  vx: number;
  vy: number;
  life: number;
  magnet: boolean;
}
