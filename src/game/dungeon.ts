import type { Input } from "../core/input";
import { angleDelta, approach, circlesOverlap, clamp, dist, normalize, TAU } from "../core/math";
import { Rng } from "../core/rng";
import { CHEST_TIERS, keyDropTier, type ChestTier } from "../data/chests";
import { ARCHETYPES, bossName, type EnemyArchetype, type EnemyKind } from "../data/enemies";
import { coinDropFor, profileFor, xpDropFor, type DepthProfile } from "../data/depth";
import { ITEM_TYPES, type ItemType } from "../data/items";
import { depthWeights, RARITIES, rarityIndex, type Rarity } from "../data/rarity";
import { MIRE_SLOW, TRAP_ENEMY_COOLDOWN, type TrapKind } from "../data/traps";
import type { Avatar, Enemy, Pickup, Projectile } from "./entities";
import { rollItem, type Item } from "./item";
import {
  circleHitsWall, FlowField, generateLevel, lineBlocked, randomOpenPoint, resolveCircle,
  type Level, type Trap,
} from "./level";
import type { GameState } from "./state";

// --- tuning ---------------------------------------------------------------

const PLAYER_SPEED = 155;
const PLAYER_RADIUS = 9;
const DASH_SPEED = 470;
const DASH_TIME = 0.14;
const DASH_COOLDOWN = 0.75;
const SWING_TIME = 0.13;
const SWING_ARC = Math.PI * 0.75;
const SWING_REACH = 46;
const HIT_INVULN = 0.65;
const MAGNET_RANGE = 78;
const PICKUP_RANGE = 16;
/** Keeps bodies far enough from the arena edge that sprites don't overlap the border. */
const WALL_PAD = 16;
const SPECIAL_RADIUS = 130;
/** Kills needed to fill the special. High enough that it's a decision, not a rotation. */
const SPECIAL_KILLS = 16;
/** Fraction of max health a potion restores. */
const POTION_HEAL = 0.45;

export type RunPhase = "fighting" | "cleared" | "dead";

/** Loot held by the current dive. Banked on extract, lost on death. */
export interface RunLoot {
  coins: number;
  xp: number;
  keys: Record<ChestTier, number>;
  items: Item[];
  kills: number;
}

export type RunEvent =
  | { kind: "damage"; x: number; y: number; amount: number; crit: boolean; onPlayer: boolean }
  | { kind: "death"; x: number; y: number; elite: Rarity | null }
  | { kind: "pickup"; x: number; y: number; label: string; color: string }
  | { kind: "levelUp"; levels: number }
  | { kind: "shake"; amount: number }
  | { kind: "nova"; x: number; y: number; radius: number }
  | { kind: "wave"; wave: number; total: number }
  | { kind: "trap"; x: number; y: number; trap: TrapKind; radius: number }
  | { kind: "cleared" }
  | { kind: "playerDied" };

function emptyKeys(): Record<ChestTier, number> {
  return Object.fromEntries(CHEST_TIERS.map((t) => [t, 0])) as Record<ChestTier, number>;
}

/**
 * One floor of the dungeon: an arena, a wave director, and the combat simulation.
 * Pure simulation — it never touches the DOM or the canvas. Anything the renderer
 * needs to react to is pushed onto `events` and drained once per frame.
 */
export class Dungeon {
  readonly profile: DepthProfile;
  /** The generated floor: walls, hazards, decoration, and where the exit is. */
  readonly level: Level;
  readonly width: number;
  readonly height: number;
  readonly avatar: Avatar;
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly pickups: Pickup[] = [];
  readonly events: RunEvent[] = [];
  readonly loot: RunLoot = { coins: 0, xp: 0, keys: emptyKeys(), items: [], kills: 0 };

  phase: RunPhase = "fighting";
  /** 0..1. Fills as you kill; spending it fires the nova. */
  specialCharge = 0;
  wave = 0;
  /** Enemies still owed by the current wave. */
  private queued = 0;
  private waveGap = 1.2;
  private spawnTimer = 0;
  private readonly rng: Rng;
  private readonly state: GameState;
  /** Routes monsters around walls when they can't see the player directly. */
  private readonly flow: FlowField;
  private flowTimer = 0;
  /** Position of the extraction portal. Live all floor; descent needs a clear. */
  readonly portal: { x: number; y: number };
  elapsed = 0;

  constructor(state: GameState, depth: number, seed?: number) {
    this.state = state;
    this.profile = profileFor(depth);
    this.rng = new Rng(seed);

    // Every floor is generated: layout, hazards and decoration all come from here.
    this.level = generateLevel(depth, this.rng);
    this.width = this.level.width;
    this.height = this.level.height;

    const { x, y } = this.level.start;
    this.avatar = {
      x, y, px: x, py: y,
      radius: PLAYER_RADIUS,
      vx: 0, vy: 0, facing: -Math.PI / 2,
      attackTimer: 0, swingTimer: 0, swingAngle: 0,
      dashTimer: 0, dashCooldown: 0, invulnTimer: 0, hitFlash: 0,
    };
    this.portal = this.level.portal;
    this.flow = new FlowField(this.level);
    this.flow.update(this.level, x, y);
    this.startNextWave();
  }

  get player() {
    return this.state.player;
  }

  /** Potions are stored on the save, but the HUD reads them through the run. */
  get potionCount(): number {
    return this.state.potions;
  }

  get enemiesRemaining(): number {
    return this.enemies.length + this.queued;
  }

  // --- wave director ------------------------------------------------------

  private startNextWave(): void {
    this.wave++;
    if (this.profile.isBoss && this.wave === this.profile.waves) {
      this.queued = 1;
    } else {
      this.queued = this.profile.enemiesPerWave;
    }
    this.spawnTimer = this.waveGap;
    this.events.push({ kind: "wave", wave: this.wave, total: this.profile.waves });
  }

  private spawnableKinds(): EnemyKind[] {
    return (Object.keys(ARCHETYPES) as EnemyKind[]).filter(
      (k) => ARCHETYPES[k].weight > 0 && ARCHETYPES[k].minDepth <= this.profile.depth,
    );
  }

  private spawnOne(): void {
    const isBossWave = this.profile.isBoss && this.wave === this.profile.waves;
    let archetype: EnemyArchetype;
    if (isBossWave) {
      archetype = ARCHETYPES.boss;
    } else {
      const kinds = this.spawnableKinds();
      const weights = Object.fromEntries(kinds.map((k) => [k, ARCHETYPES[k].weight])) as Record<EnemyKind, number>;
      archetype = ARCHETYPES[this.rng.weighted(weights)];
    }

    // Spawn on open floor, away from the player, and never inside a hazard.
    const hazards = this.level.traps.map((t) => ({ x: t.x, y: t.y, d: t.radius + 20 }));
    const spot =
      randomOpenPoint(this.level, this.rng, {
        clearance: archetype.radius > 16 ? 2 : 1,
        away: [{ x: this.avatar.x, y: this.avatar.y, d: 200 }, ...hazards],
        tries: 40,
      }) ??
      // A cramped floor may have nowhere far away; settle for anywhere walkable.
      randomOpenPoint(this.level, this.rng, {
        away: [{ x: this.avatar.x, y: this.avatar.y, d: 110 }],
        tries: 30,
      }) ??
      this.level.start;
    const x = spot.x;
    const y = spot.y;

    // Elites scale with depth: deeper floors roll higher tints and much fatter loot.
    let elite: Rarity | null = null;
    const eliteChance = isBossWave ? 1 : clamp(0.03 + this.profile.depth * 0.008, 0, 0.3);
    if (this.rng.chance(eliteChance)) {
      const maxTier = clamp(1 + Math.floor(this.profile.depth / 3), 1, RARITIES.length - 1);
      elite = RARITIES[this.rng.int(1, maxTier)]!;
    }
    const eliteMult = elite ? 1 + rarityIndex(elite) * 0.55 : 1;

    const health = this.profile.enemyHealth * archetype.health * eliteMult;
    this.enemies.push({
      x, y, px: x, py: y,
      radius: archetype.radius * (elite ? 1.18 : 1),
      archetype,
      name: isBossWave ? bossName(this.profile.depth) : elite ? `${cap(elite)} ${archetype.name}` : archetype.name,
      health, maxHealth: health,
      damage: this.profile.enemyDamage * archetype.damage * (elite ? 1 + rarityIndex(elite) * 0.12 : 1),
      speed: this.profile.enemySpeed * archetype.speed,
      attackTimer: this.rng.range(0, archetype.attackCooldown * this.profile.aggression),
      windup: 0,
      state: "spawning",
      spawnTimer: 0.45,
      hitFlash: 0,
      knockX: 0, knockY: 0,
      elite,
      facing: 0,
      trapCooldown: 0,
      stuckTimer: 0,
      dodgeDir: this.rng.chance(0.5) ? 1 : -1,
    });
  }

  // --- simulation ---------------------------------------------------------

  update(dt: number, input: Input): void {
    this.elapsed += dt;
    if (this.phase === "dead") return;

    this.updateAvatar(dt, input);
    this.updateFlow(dt);
    this.updateTraps(dt);
    this.updateSpawning(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);

    if (this.phase === "fighting" && this.enemiesRemaining === 0 && this.wave >= this.profile.waves) {
      this.phase = "cleared";
      this.dropClearCache();
      this.events.push({ kind: "cleared" });
    }
  }

  private updateSpawning(dt: number): void {
    if (this.queued <= 0) {
      // Wave is fully spawned; the next one starts once the floor is clear of stragglers.
      if (this.enemies.length === 0 && this.wave < this.profile.waves) this.startNextWave();
      return;
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    if (this.enemies.length >= this.profile.maxAlive) return;
    this.spawnOne();
    this.queued--;
    this.spawnTimer = 0.28;
  }

  /** The pathing field only needs to be roughly current, so it runs a few times a second. */
  private updateFlow(dt: number): void {
    this.flowTimer -= dt;
    if (this.flowTimer > 0) return;
    this.flowTimer = 0.25;
    this.flow.update(this.level, this.avatar.x, this.avatar.y);
  }

  // --- hazards ------------------------------------------------------------

  /**
   * Hazards run on their own clocks, independent of the wave director. Most cycle
   * idle -> telegraph -> live, which is what makes them dodgeable rather than a tax;
   * saws patrol a lane and tar pools are simply always there.
   *
   * Almost everything on the floor can be killed by them, which is the point: a spike
   * plate is a weapon if you can walk a Juggernaut over it at the right moment.
   */
  private updateTraps(dt: number): void {
    for (const t of this.level.traps) {
      switch (t.kind) {
        case "saw": {
          // Ping-pong along the track; the blade is live for its whole patrol.
          const len = Math.hypot(t.bx - t.ax, t.by - t.ay);
          const speed = len > 0 ? 92 / len : 0;
          t.t += t.dir * speed * dt;
          if (t.t > 1) { t.t = 1; t.dir = -1; }
          if (t.t < 0) { t.t = 0; t.dir = 1; }
          t.x = t.ax + (t.bx - t.ax) * t.t;
          t.y = t.ay + (t.by - t.ay) * t.t;
          t.spin += dt * 14;
          t.state = "active";
          this.applyTrapDamage(t);
          break;
        }
        case "mire": {
          t.state = "active";
          // The slow is applied during movement; this is the chip damage on top.
          t.timer += dt;
          if (t.timer >= 0.5) {
            t.timer = 0;
            this.applyTrapDamage(t);
          }
          break;
        }
        default: {
          const { cycle, warn, active } = t.spec;
          t.timer += dt;
          if (t.timer >= cycle) {
            t.timer -= cycle;
            t.fired = false;
          }
          const warnAt = cycle - warn - active;
          t.state = t.timer >= warnAt + warn ? "active" : t.timer >= warnAt ? "warn" : "idle";
          if (t.state === "active" && !t.fired) {
            t.fired = true;
            this.events.push({ kind: "trap", x: t.x, y: t.y, trap: t.kind, radius: t.radius });
            if (t.kind === "turret") this.fireTurret(t);
          }
          if (t.state === "active" && t.kind !== "turret") this.applyTrapDamage(t);
          break;
        }
      }
    }
  }

  /** Hits everything standing in a live hazard, the player included. */
  private applyTrapDamage(t: Trap): void {
    const damage = this.profile.enemyDamage * t.spec.damage;
    const a = this.avatar;
    if (dist(a.x, a.y, t.x, t.y) <= t.radius + a.radius) this.hurtPlayer(damage);

    if (!t.spec.hitsEnemies) return;
    // Snapshot: damageEnemy can splice the list while we're walking it.
    const caught = this.enemies.filter(
      (e) => e.state !== "spawning" && e.trapCooldown <= 0 && dist(e.x, e.y, t.x, t.y) <= t.radius + e.radius,
    );
    for (const e of caught) {
      e.trapCooldown = TRAP_ENEMY_COOLDOWN;
      this.damageEnemy(e, damage, Math.atan2(e.y - t.y, e.x - t.x));
    }
  }

  private fireTurret(t: Trap): void {
    const speed = 230;
    this.events.push({ kind: "trap", x: t.x, y: t.y, trap: t.kind, radius: t.radius });
    this.projectiles.push({
      x: t.x, y: t.y, px: t.x, py: t.y, radius: 5,
      vx: Math.cos(t.angle) * speed, vy: Math.sin(t.angle) * speed,
      damage: this.profile.enemyDamage * t.spec.damage,
      friendly: false, life: 4, color: "#fca5a5",
    });
  }

  /** Movement multiplier at a point — 1 on clean floor, much less in tar. */
  private mireSlowAt(x: number, y: number): number {
    for (const t of this.level.traps) {
      if (t.kind !== "mire") continue;
      if (dist(x, y, t.x, t.y) <= t.radius) return MIRE_SLOW;
    }
    return 1;
  }

  private updateAvatar(dt: number, input: Input): void {
    const a = this.avatar;
    a.px = a.x;
    a.py = a.y;

    a.attackTimer = Math.max(0, a.attackTimer - dt);
    a.swingTimer = Math.max(0, a.swingTimer - dt);
    a.dashCooldown = Math.max(0, a.dashCooldown - dt);
    a.invulnTimer = Math.max(0, a.invulnTimer - dt);
    a.hitFlash = Math.max(0, a.hitFlash - dt);

    const move = input.moveVector();
    if (move.x !== 0 || move.y !== 0) a.facing = Math.atan2(move.y, move.x);

    if (a.dashTimer > 0) {
      a.dashTimer -= dt;
    } else if (input.wasPressed("dash") && a.dashCooldown <= 0) {
      a.dashTimer = DASH_TIME;
      a.dashCooldown = DASH_COOLDOWN;
      // The dash grants i-frames — it's the main defensive tool, so it must feel reliable.
      a.invulnTimer = Math.max(a.invulnTimer, DASH_TIME + 0.08);
      const dir = move.x || move.y ? move : { x: Math.cos(a.facing), y: Math.sin(a.facing) };
      a.vx = dir.x * DASH_SPEED;
      a.vy = dir.y * DASH_SPEED;
    }

    if (a.dashTimer <= 0) {
      // Tar slows a walk to a crawl but never a dash — the dash stays the way out.
      const slow = this.mireSlowAt(a.x, a.y);
      a.vx = move.x * PLAYER_SPEED * slow;
      a.vy = move.y * PLAYER_SPEED * slow;
    }

    a.x = clamp(a.x + a.vx * dt, a.radius + WALL_PAD, this.width - a.radius - WALL_PAD);
    a.y = clamp(a.y + a.vy * dt, a.radius + WALL_PAD, this.height - a.radius - WALL_PAD);
    const fixed = resolveCircle(this.level, a.x, a.y, a.radius);
    a.x = fixed.x;
    a.y = fixed.y;

    if (input.wasPressed("attack") && a.attackTimer <= 0) this.attack();
    if (input.wasPressed("potion")) this.drinkPotion();
    if (input.wasPressed("special")) this.useSpecial();
  }

  private attack(): void {
    const a = this.avatar;
    a.attackTimer = this.player.attackCooldown;
    a.swingAngle = a.facing;

    if (this.player.usesStaff) {
      const speed = 340;
      this.projectiles.push({
        x: a.x, y: a.y, px: a.x, py: a.y, radius: 5,
        vx: Math.cos(a.facing) * speed, vy: Math.sin(a.facing) * speed,
        damage: this.player.damage * 1.15,
        friendly: true, life: 1.4, color: "#7dd3fc",
      });
      a.swingTimer = SWING_TIME * 0.6;
      return;
    }

    a.swingTimer = SWING_TIME;
    // The melee hitbox resolves immediately: every enemy inside the arc is hit once.
    for (const e of this.enemies) {
      if (e.state === "spawning") continue;
      const d = dist(a.x, a.y, e.x, e.y);
      if (d > SWING_REACH + e.radius) continue;
      const toEnemy = Math.atan2(e.y - a.y, e.x - a.x);
      if (Math.abs(angleDelta(a.facing, toEnemy)) > SWING_ARC / 2) continue;
      this.damageEnemy(e, this.player.damage, a.facing);
    }
  }

  /**
   * Nova: a full-circle burst centered on the player that hits everything nearby for
   * heavy damage. It's the panic button for when a wave has surrounded you, which is
   * why it also grants a moment of invulnerability.
   */
  private useSpecial(): void {
    if (this.specialCharge < 1) return;
    this.specialCharge = 0;
    const a = this.avatar;
    a.invulnTimer = Math.max(a.invulnTimer, 0.35);
    this.events.push({ kind: "nova", x: a.x, y: a.y, radius: SPECIAL_RADIUS });
    this.events.push({ kind: "shake", amount: 10 });

    // Snapshot first: damageEnemy can remove entries from this.enemies mid-iteration.
    const caught = this.enemies.filter(
      (e) => e.state !== "spawning" && dist(a.x, a.y, e.x, e.y) <= SPECIAL_RADIUS + e.radius,
    );
    for (const e of caught) {
      this.damageEnemy(e, this.player.damage * 2.6, Math.atan2(e.y - a.y, e.x - a.x));
    }
  }

  private drinkPotion(): void {
    if (this.state.potions <= 0 || this.player.health >= this.player.maxHealth) return;
    this.state.potions--;
    const healed = this.player.heal(this.player.maxHealth * POTION_HEAL);
    this.events.push({
      kind: "pickup", x: this.avatar.x, y: this.avatar.y,
      label: `+${Math.round(healed)} HP`, color: "#4ade80",
    });
  }

  private damageEnemy(e: Enemy, amount: number, knockAngle: number): void {
    // Crits give melee a rhythm and keep the damage numbers from feeling flat.
    const crit = this.rng.chance(0.15);
    const dealt = Math.max(1, Math.round(amount * (crit ? 1.8 : 1) * this.rng.range(0.92, 1.08)));
    e.health -= dealt;
    e.hitFlash = 0.12;
    const knock = crit ? 190 : 120;
    e.knockX += Math.cos(knockAngle) * knock;
    e.knockY += Math.sin(knockAngle) * knock;
    this.events.push({ kind: "damage", x: e.x, y: e.y - e.radius, amount: dealt, crit, onPlayer: false });
    if (e.health <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);

    this.loot.kills++;
    this.state.stats.enemiesKilled++;
    // Bosses and elites fill the bar faster so big fights aren't a charge drought.
    const chargeGain = (e.archetype.kind === "boss" ? 6 : e.elite ? 3 : 1) / SPECIAL_KILLS;
    this.specialCharge = Math.min(1, this.specialCharge + chargeGain);
    this.events.push({ kind: "death", x: e.x, y: e.y, elite: e.elite });
    if (e.archetype.kind === "boss") this.events.push({ kind: "shake", amount: 14 });

    const lootMult = e.archetype.lootWeight * (e.elite ? 1 + rarityIndex(e.elite) * 0.8 : 1);

    // XP is granted straight away — it's the one thing death doesn't take from you.
    const xp = Math.round(xpDropFor(this.profile.depth) * e.archetype.xp * this.rng.range(0.9, 1.1));
    this.loot.xp += xp;
    const levels = this.player.gainXp(xp);
    if (levels > 0) this.events.push({ kind: "levelUp", levels });

    const coins = Math.round(coinDropFor(this.profile.depth) * lootMult * this.rng.range(0.8, 1.25));
    this.dropPickup(e.x, e.y, { kind: "coin", value: coins });

    // Keys are the bridge back to the chest gambling. A dive should fund a couple of
    // pulls, not a spree — the chests are the slot machine, not the payout.
    if (this.rng.chance(clamp(0.075 + lootMult * 0.014, 0, 0.4))) {
      const tier = keyDropTier(this.profile.depth, this.rng.next());
      this.dropPickup(e.x, e.y, { kind: "key", keyTier: tier });
    }

    if (this.rng.chance(0.02 + lootMult * 0.004)) {
      this.dropPickup(e.x, e.y, { kind: "potion" });
    }

    // Direct gear drops. Elites and bosses roll several, weighted deeper by floor.
    const rolls = e.archetype.kind === "boss"
      ? 3
      : e.elite
        ? (this.rng.chance(0.3) ? 2 : 1)
        : this.rng.chance(clamp(0.07 + lootMult * 0.025, 0, 0.34)) ? 1 : 0;
    for (let i = 0; i < rolls; i++) {
      const rarity = this.rng.weighted(depthWeights(this.profile.depth + (e.elite ? rarityIndex(e.elite) * 2 : 0)));
      const item = rollItem({
        rarity,
        type: this.rng.pick(ITEM_TYPES) as ItemType,
        ilvl: this.profile.depth,
        rng: this.rng,
      });
      this.dropPickup(e.x, e.y, { kind: "item", item, rarity });
    }
  }

  /**
   * The reward for clearing, spilled around the portal. Per-kill drops are deliberately
   * thin, so this is where a floor actually pays: it can only be earned by finishing,
   * and it's still lost if you die on the way to the exit.
   */
  private dropClearCache(): void {
    const { x, y } = this.portal;
    const coins = Math.round(coinDropFor(this.profile.depth) * 9 * this.rng.range(0.9, 1.15));
    this.dropPickup(x, y, { kind: "coin", value: coins });

    const rarity = this.rng.weighted(depthWeights(this.profile.depth + 2));
    const item = rollItem({
      rarity,
      type: this.rng.pick(ITEM_TYPES) as ItemType,
      ilvl: this.profile.depth,
      rng: this.rng,
    });
    this.dropPickup(x, y, { kind: "item", item, rarity });

    if (this.rng.chance(0.7)) {
      this.dropPickup(x, y, { kind: "key", keyTier: keyDropTier(this.profile.depth, this.rng.next()) });
    }
    if (this.rng.chance(0.5)) this.dropPickup(x, y, { kind: "potion" });
  }

  private dropPickup(
    x: number, y: number,
    opts: { kind: Pickup["kind"]; value?: number; item?: Item; keyTier?: string; rarity?: Rarity },
  ): void {
    const angle = this.rng.angle();
    const speed = this.rng.range(40, 110);
    this.pickups.push({
      x, y, px: x, py: y, radius: 6,
      kind: opts.kind,
      value: opts.value ?? 0,
      item: opts.item ?? null,
      keyTier: opts.keyTier ?? null,
      rarity: opts.rarity ?? null,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      magnet: false,
    });
  }

  private updateEnemies(dt: number): void {
    const a = this.avatar;
    for (const e of this.enemies) {
      e.px = e.x;
      e.py = e.y;
      e.hitFlash = Math.max(0, e.hitFlash - dt);

      if (e.state === "spawning") {
        e.spawnTimer -= dt;
        if (e.spawnTimer <= 0) e.state = "active";
        continue;
      }

      const d = dist(e.x, e.y, a.x, a.y);
      const toPlayer = Math.atan2(a.y - e.y, a.x - e.x);
      e.facing = toPlayer;

      // With a wall in the way nothing holds its ground: ranged types reposition for a
      // shot and everything else takes the long way around, instead of standing there.
      const hasLos = !lineBlocked(this.level, e.x, e.y, a.x, a.y);

      // Ranged types hold a standoff distance; melee types close.
      let moveAngle = toPlayer;
      let move = true;
      if (e.archetype.ranged && hasLos) {
        if (d < e.archetype.standoff * 0.75) moveAngle = toPlayer + Math.PI;
        else if (d < e.archetype.standoff * 1.15) move = false;
      } else if (!e.archetype.ranged && d < e.radius + a.radius) {
        move = false;
      }

      if (e.windup > 0) {
        // Committed to an attack: hold still so the telegraph reads clearly.
        e.windup -= dt;
        if (e.windup <= 0) this.resolveEnemyAttack(e);
        move = false;
      }

      e.trapCooldown = Math.max(0, e.trapCooldown - dt);

      if (move) {
        const speed = e.speed * this.mireSlowAt(e.x, e.y);
        // With a clear line, charge straight in; otherwise follow the route around.
        let dir = normalize(Math.cos(moveAngle), Math.sin(moveAngle));
        if (!hasLos || e.stuckTimer > 0.18) {
          const routed = this.flow.direction(this.level, e.x, e.y);
          if (routed) dir = routed;
          else if (e.stuckTimer > 0.22) dir = normalize(Math.cos(moveAngle + e.dodgeDir * 1.05), Math.sin(moveAngle + e.dodgeDir * 1.05));
        }
        e.x += dir.x * speed * dt;
        e.y += dir.y * speed * dt;
      }

      // Knockback decays fast so it reads as a hit reaction, not a launch.
      e.x += e.knockX * dt;
      e.y += e.knockY * dt;
      e.knockX = approach(e.knockX, 0, 900 * dt);
      e.knockY = approach(e.knockY, 0, 900 * dt);

      e.x = clamp(e.x, e.radius + WALL_PAD, this.width - e.radius - WALL_PAD);
      e.y = clamp(e.y, e.radius + WALL_PAD, this.height - e.radius - WALL_PAD);
      const fixed = resolveCircle(this.level, e.x, e.y, e.radius);
      const shoved = Math.hypot(fixed.x - e.x, fixed.y - e.y) > 0.05;
      e.x = fixed.x;
      e.y = fixed.y;
      if (move && shoved) {
        e.stuckTimer += dt;
        // Flip the sidestep occasionally so nothing grinds forever on one corner.
        if (e.stuckTimer > 1.6) { e.stuckTimer = 0; e.dodgeDir *= -1; }
      } else {
        e.stuckTimer = Math.max(0, e.stuckTimer - dt * 2);
      }

      e.attackTimer -= dt;
      if (e.attackTimer <= 0 && e.windup <= 0 && d <= e.archetype.attackRange && hasLos) {
        e.windup = (e.archetype.ranged ? 0.35 : 0.28) * this.profile.telegraph;
        e.attackTimer = e.archetype.attackCooldown * this.profile.aggression;
      }
    }
    this.separateEnemies();
  }

  /** Cheap pairwise push-apart so crowds spread around the player instead of stacking. */
  private separateEnemies(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minDist * minDist || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (minDist - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }

  private resolveEnemyAttack(e: Enemy): void {
    const a = this.avatar;
    if (e.archetype.ranged) {
      const speed = 210;
      const angle = Math.atan2(a.y - e.y, a.x - e.x);
      this.projectiles.push({
        x: e.x, y: e.y, px: e.x, py: e.y, radius: 5,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        damage: e.damage, friendly: false, life: 3,
        color: e.archetype.kind === "caster" ? "#c084fc" : "#fbbf24",
      });
      return;
    }
    if (dist(e.x, e.y, a.x, a.y) <= e.archetype.attackRange) this.hurtPlayer(e.damage);
  }

  private hurtPlayer(amount: number): void {
    const a = this.avatar;
    if (a.invulnTimer > 0) return;
    const dealt = this.player.takeDamage(amount);
    a.invulnTimer = HIT_INVULN;
    a.hitFlash = 0.25;
    this.events.push({ kind: "damage", x: a.x, y: a.y - 14, amount: dealt, crit: false, onPlayer: true });
    this.events.push({ kind: "shake", amount: clamp(dealt / 8, 2, 12) });
    if (!this.player.isAlive) {
      this.phase = "dead";
      this.state.stats.deaths++;
      this.events.push({ kind: "playerDied" });
    }
  }

  private updateProjectiles(dt: number): void {
    const a = this.avatar;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      const outOfBounds = p.x < 0 || p.y < 0 || p.x > this.width || p.y > this.height;
      if (p.life <= 0 || outOfBounds || circleHitsWall(this.level, p.x, p.y, p.radius)) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.friendly) {
        for (const e of this.enemies) {
          if (e.state === "spawning") continue;
          if (!circlesOverlap(p.x, p.y, p.radius, e.x, e.y, e.radius)) continue;
          this.damageEnemy(e, p.damage, Math.atan2(p.vy, p.vx));
          this.projectiles.splice(i, 1);
          break;
        }
      } else if (circlesOverlap(p.x, p.y, p.radius, a.x, a.y, a.radius)) {
        this.hurtPlayer(p.damage);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updatePickups(dt: number): void {
    const a = this.avatar;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]!;
      p.px = p.x;
      p.py = p.y;
      p.life += dt;

      const d = dist(p.x, p.y, a.x, a.y);
      // A short delay before magnetism kicks in lets the drop pop out and be seen.
      if (p.life > 0.35 && d < MAGNET_RANGE) p.magnet = true;

      if (p.magnet) {
        const pull = clamp(520 - d * 2, 180, 520);
        const dir = normalize(a.x - p.x, a.y - p.y);
        p.vx = dir.x * pull;
        p.vy = dir.y * pull;
      } else {
        p.vx = approach(p.vx, 0, 260 * dt);
        p.vy = approach(p.vy, 0, 260 * dt);
      }

      p.x = clamp(p.x + p.vx * dt, 8, this.width - 8);
      p.y = clamp(p.y + p.vy * dt, 8, this.height - 8);
      // A drop that lands in a block would be unreachable, so shove it back out.
      const clear = resolveCircle(this.level, p.x, p.y, p.radius);
      p.x = clear.x;
      p.y = clear.y;

      if (p.life > 0.3 && d < PICKUP_RANGE) {
        this.collect(p);
        this.pickups.splice(i, 1);
      }
    }
  }

  private collect(p: Pickup): void {
    switch (p.kind) {
      case "coin":
        this.loot.coins += p.value;
        this.events.push({ kind: "pickup", x: p.x, y: p.y, label: `+${p.value}`, color: "#fbbf24" });
        break;
      case "key":
        if (p.keyTier) {
          this.loot.keys[p.keyTier as ChestTier]++;
          this.events.push({ kind: "pickup", x: p.x, y: p.y, label: `${p.keyTier} Key`, color: "#e2e8f0" });
        }
        break;
      case "potion":
        this.state.potions++;
        this.events.push({ kind: "pickup", x: p.x, y: p.y, label: "Potion", color: "#4ade80" });
        break;
      case "item":
        if (p.item) {
          this.loot.items.push(p.item);
          this.state.stats.raritiesFound[p.item.rarity]++;
          this.events.push({ kind: "pickup", x: p.x, y: p.y, label: p.item.name, color: "#fff" });
        }
        break;
      case "xp":
        break;
    }
  }

  // --- run outcomes -------------------------------------------------------

  /**
   * The portal is live for the whole floor, not just after a clear. Being able to run
   * for the exit mid-wave is what makes the "lose everything on death" rule fair: a
   * bad dive costs you the rest of the floor, not the entire run.
   */
  get atPortal(): boolean {
    return this.phase !== "dead" && dist(this.avatar.x, this.avatar.y, this.portal.x, this.portal.y) < 34;
  }

  /** Descending is the reward for clearing; you can't skip a floor by running past it. */
  get canDescend(): boolean {
    return this.phase === "cleared";
  }

  /** Moves this floor's loot into the persistent save. Called on extract or descend. */
  bankLoot(): void {
    this.state.addCoins(this.loot.coins);
    for (const t of CHEST_TIERS) this.state.keys[t] += this.loot.keys[t];
    this.state.addToInventory(this.loot.items);
    this.state.recordDepth(this.profile.depth);
    this.state.stats.runsCompleted++;
    this.loot.coins = 0;
    this.loot.items = [];
    this.loot.keys = emptyKeys();
  }

  drainEvents(): RunEvent[] {
    return this.events.splice(0, this.events.length);
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { TAU };
