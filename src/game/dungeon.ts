import { angleDelta, approach, circlesOverlap, clamp, dist, normalize, TAU } from "../core/math";
import { Rng } from "../core/rng";
import { BOSS_ABILITIES, BOSS_KNOCK_RESIST, BOSS_ACTION_GAP, bossFor } from "../data/bosses";
import { challengerRewardMult } from "../data/challenger";
import {
  BLOCK_CHANCE_CAP, BLOCK_MITIGATION, EVASION_CAP, SKILL_POWER, ULTIMATE_POWER,
} from "../data/combat-tuning";
import { CHEST_TIERS, keyDropTier, type ChestTier } from "../data/chests";
import {
  AILMENT_CHANCE, ELEMENT_COLORS, ELEMENT_PREFIX, ELEMENTS, LOOT_ELEMENTS, STATUS_FOR_ELEMENT,
  zeroResists, type Element,
} from "../data/elements";
import { ARCHETYPES, infusionChance, type EnemyArchetype, type EnemyKind } from "../data/enemies";
import {
  BOLT_LIFE, BOLT_SPEED, TALISMAN_ARC_DAMAGE, TALISMAN_ARC_RANGE, type AttackPattern,
} from "../data/weapons";
import { weaponAbilityFor } from "../data/weapon-abilities";
import type { TriggerKind, TriggerSpec } from "../data/items";
import { coinDropFor, profileFor, xpDropFor, type DepthProfile } from "../data/depth";
import { EQUIP_SLOTS } from "../data/items";
import { emptyMaterials, MATERIAL_NAMES, type MaterialBag } from "../data/materials";
import { delveConfig, type RunConfig } from "../data/modes";
import { planetBossSpec } from "../data/planets";
import { depthWeights, RARITIES, rarityIndex, type Rarity } from "../data/rarity";
import { MIRE_SLOW, TRAP_ENEMY_COOLDOWN, type TrapKind } from "../data/traps";
import { updateBoss } from "./boss";
import { mitigateWithResists } from "./combat";
import {
  AbilityRuntime, EventBus, ResourceSet, StatusContainer, creditResourcesForHit,
  isUltimateSourced, makeDamagePacket,
  type Ability, type CastInput, type CombatHost, type DamagePacket, type HostActor,
  type MinionRequest, type MoveRequest, type ProjectileRequest, type StatusInstance, type TargetActor,
  type TerrainRequest, type ZoneRequest, type MinionCommand,
} from "../combat/index";
import { applyRuleFx, runBuildGrants, type BuildRuleContext } from "./abilities";
import {
  HeroRuleState, rulesOnAvoid, rulesOnCast, rulesOnDamageTaken, rulesOnHit, rulesOnKill, rulesTick,
  type RuleHost,
} from "./rules";

/** Fraction of a ward's pool that also counts as flat resistance while it holds — was
 *  `data/skills.ts` before the ability cutover. */
const WARD_RESIST = 60;
// Registers burn/chill/shock/venom/drain/sear/sunder on the unified status registry so
// `Hero.sc` / `Enemy.sc` mean the same thing the legacy ailment list does.
import "../combat/legacy-ailments";
import type { Avatar, Corpse, Enemy, GroundZone, Minion, Pickup, Projectile, Telegraph, Totem } from "./entities";
import {
  MINION_CAP_GLOBAL, MINION_CAP_PER_OWNER, MINION_DEFAULT_INHERIT, MINION_DEFAULT_LIFESPAN,
  MINION_GUARD_LEASH, MINION_LEASH, MINION_SEPARATION, MINION_WINDUP,
} from "../data/minions";
import type { Appearance } from "../data/cosmetics";
import type { AvatarInput } from "../core/input";
import type { Player } from "./player";
import { randomItemType, rollItem, type Item } from "./item";
import {
  circleHitsWall, FlowField, generateLevel, lineBlocked, randomOpenPoint, resolveCircle,
  type Level, type ResourceNode, type Trap,
} from "./level";
import type { GameState } from "./state";

// --- tuning ---------------------------------------------------------------

const PLAYER_SPEED = 155;
const PLAYER_RADIUS = 9;
const DASH_SPEED = 470;
const DASH_TIME = 0.14;
const DASH_COOLDOWN = 0.75;
const SWING_TIME = 0.13;
const HIT_INVULN = 0.65;
const MAGNET_RANGE = 78;
const PICKUP_RANGE = 16;
/** Keeps bodies far enough from the arena edge that sprites don't overlap the border. */
const WALL_PAD = 16;
/**
 * Wave-spawned trash is a bit softer than the raw depth curve says, because a wave now
 * throws 2-3x as many bodies at once. This keeps the total health pool per wave from
 * growing as fast as the headcount does — more enemies, but each one dies quicker, which
 * is the whole point of a horde. Elites, adds and the boss itself are untouched.
 */
const WAVE_HEALTH_MULT = 0.75;
/**
 * A wave now throws 2-3x the bodies it used to. If every one of them still paid full XP,
 * coin and drop chance, the whole meta-progression curve would race ahead of the depth
 * curve it's supposed to track — a bigger fight would quietly mean a much faster game.
 * Ordinary trash pays a reduced share per kill to keep total reward-per-wave close to
 * where it always was; elites and the boss are exempt; they're the real reward mixed
 * into the chaff, not the chaff itself.
 */
const TRASH_REWARD_MULT = 0.5;

/** How far from you a thorns retort reaches. */
const THORNS_RANGE = 64;
/** Fraction of max health a potion restores. */
const POTION_HEAL = 0.45;
/** Fraction of max mana a potion restores, and what a kill gives back. */
const POTION_MANA = 0.3;
const MANA_ON_KILL = 0.035;
/**
 * Co-op only. A downed ally is not out of the run: stand next to them for a moment and
 * they come back up on a sliver of health. Dying in a party costs the party its damage
 * and somebody's time, which is a real price without being "sit and watch for a floor".
 */
const REVIVE_RANGE = 46;
export const REVIVE_TIME = 2.6;
/** Fraction of max health a revived ally comes back with. */
const REVIVE_HEALTH = 0.4;

/** Seconds between damage ticks from a patch of burning ground. */
const GROUND_TICK = 0.5;
/** Palette for a friendly zone, by what it grants. Greens and golds read as "safe". */
const BENEFIT_COLORS: Record<"heal" | "shield" | "haste", string> = {
  heal: "#4ade80", shield: "#93c5fd", haste: "#fcd34d",
};
/** Per-tick payout of a benefit zone, as a fraction of the standing hero's max health. */
const BENEFIT_HEAL_FRACTION = 0.02;
const BENEFIT_SHIELD_FRACTION = 0.12;
/** Fraction of a mechanic's damage that its leftover ground deals per tick. */
const GROUND_DAMAGE = 0.28;

export type RunPhase = "fighting" | "cleared" | "dead";

/** Loot held by the current dive. Banked on extract, lost on death. */
export interface RunLoot {
  coins: number;
  /** Vanity currency. Banked and lost exactly like coins — cosmetics take the risk too. */
  gems: number;
  xp: number;
  keys: Record<ChestTier, number>;
  items: Item[];
  kills: number;
  /** Only ever fills on a planet expedition — kills and resource nodes both pay this. */
  materials: MaterialBag;
}

export type RunEvent =
  | { kind: "damage"; x: number; y: number; amount: number; crit: boolean; onPlayer: boolean; element: Element }
  | { kind: "death"; x: number; y: number; elite: Rarity | null }
  | { kind: "pickup"; x: number; y: number; label: string; color: string }
  /** An item specifically, rather than a generic pickup: the presentation layer needs the
   *  rarity to decide whether this is a line of text or an event.
   *
   *  `owner` is the hero index it belongs to. In a solo dive that is always you; in a
   *  party the host stamps it so a legendary banner only takes over the screen of the
   *  person who actually found the thing. */
  | { kind: "loot"; x: number; y: number; item: Item; owner: number }
  | { kind: "levelUp"; levels: number; owner: number }
  | { kind: "shake"; amount: number }
  | { kind: "nova"; x: number; y: number; radius: number }
  | { kind: "wave"; wave: number; total: number }
  | { kind: "trap"; x: number; y: number; trap: TrapKind; radius: number }
  | { kind: "boom"; x: number; y: number; radius: number; color: string }
  | { kind: "bolt"; x1: number; y1: number; x2: number; y2: number; color: string }
  | { kind: "cast"; x: number; y: number; label: string; color: string }
  /**
   * A weapon went through the air. Purely for the renderer — the hits have already been
   * resolved by the time this is pushed — but the shape of the swing is simulation data,
   * so the arc a crescent is drawn along is the arc that actually connected.
   */
  | {
      kind: "swing"; x: number; y: number; angle: number;
      arc: number; reach: number; pattern: AttackPattern; ultimate: boolean;
      /** Whose gear this swing is made of. Carried on the event rather than read off
       *  the local character, so an ally's crescent is their element and not yours. */
      element: Element;
    }
  | { kind: "bossSpawn"; name: string; title: string }
  | { kind: "bossPhase"; name: string; phase: number; total: number }
  | { kind: "bossCast"; name: string; time: number }
  | { kind: "bossDown"; x: number; y: number }
  | { kind: "ultimate"; id: string; name: string; color: string; x: number; y: number }
  | { kind: "trail"; x: number; y: number; color: string }
  | { kind: "totem"; x: number; y: number; color: string }
  | { kind: "cleared" }
  | { kind: "playerDied"; owner: number };

/** Everything needed to paint a danger zone on the floor. */
export interface TelegraphInit {
  shape: Telegraph["shape"];
  x: number;
  y: number;
  angle: number;
  /** Defaults to 0 — only a multi-instance ability needs to hold a fixed spacing. */
  angleOffset?: number;
  radius: number;
  inner: number;
  arc: number;
  width: number;
  total: number;
  damage: number;
  element: Element;
  color: string;
  hitsPlayer: boolean;
  hitsEnemies: boolean;
  linger: number;
  followId: number | null;
}

function emptyKeys(): Record<ChestTier, number> {
  return Object.fromEntries(CHEST_TIERS.map((t) => [t, 0])) as Record<ChestTier, number>;
}

/**
 * One participant on a floor: an avatar, a character sheet, and their own unbanked
 * loot. In a solo dive there is exactly one of these and every back-compat getter on
 * `Dungeon` points straight at it, which is why the rest of the game — the HUD, the
 * renderer, the boss brain, the smoke test — never had to learn what a party is.
 *
 * In a party the host owns a `Hero` for every player, including the ones being driven
 * from another laptop: their buttons arrive over the network as an `AvatarInput` and
 * feed exactly the same `updateHero` every local player goes through. There is no
 * second code path for a remote player, which is the only reason co-op is a few hundred
 * lines instead of a rewrite.
 */
export class Hero {
  /** Position in `Dungeon.heroes`. Stable for the whole run — snapshots index by it. */
  readonly index: number;
  /** Relay peer id, or "" for a solo run. */
  readonly netId: string;
  readonly name: string;
  readonly player: Player;
  readonly appearance: Appearance;
  readonly avatar: Avatar;
  /** Every timed effect on this hero — DoTs, CC, buffs — the unified container the
   *  ability executor reads and writes. */
  readonly sc: StatusContainer;
  /** This hero's class resources — Momentum, Rage, Mana, the ultimate meter, … —
   *  built from the progression `PilotClass` for the class they're playing. */
  readonly resources: ResourceSet;
  /** Per-hero ability cooldowns and deferred (delay / reactive / follow-up) effects. */
  readonly rt = new AbilityRuntime();
  /** One more than you equipped, for the slot a piece of gear can grant you. */
  readonly skillCooldowns = [0, 0, 0, 0];
  readonly loot: RunLoot = {
    coins: 0, gems: 0, xp: 0, keys: emptyKeys(), items: [], kills: 0, materials: emptyMaterials(),
  };
  /** Damage the Ward Veil will eat before health does, and how long it holds. */
  ward = 0;
  wardTimer = 0;
  /**
   * 0..1, for the HUD and the renderer. Backed by the class's `isUltimateMeter`
   * resource pool, which the class's own generation rules fill; `_specialCharge` is a
   * fallback for a class with no resolved pilot class.
   */
  private _specialCharge = 0;
  get specialCharge(): number {
    const meter = this.resources.ultimateMeter();
    return meter ? meter.fraction : this._specialCharge;
  }
  set specialCharge(value: number) {
    const v = value < 0 ? 0 : value > 1 ? 1 : value;
    const meter = this.resources.ultimateMeter();
    if (meter) meter.value = v * meter.max;
    else this._specialCharge = v;
  }
  /** Potions are per-character in a party, so nobody drinks out of your belt. */
  potions: number;
  /** True for the hero this browser is driving — the camera and the HUD follow it. */
  readonly local: boolean;
  /** Where a remote player's buttons arrive. Null for the one holding this keyboard. */
  input: AvatarInput | null = null;
  /** Out of health, waiting for an ally. In a solo run this is simply "dead". */
  downed = false;
  reviveProgress = 0;
  /** XP earned since the host last told this hero's own browser about it. */
  xpPending = 0;
  /** Items picked up since the host last told this hero's own browser about them. */
  readonly itemsPending: Item[] = [];
  /** Routes monsters to this hero when they can't see them directly. */
  flow: FlowField | null = null;
  /** Recent positions, newest first — for abilities that snap back to where you were. */
  readonly posHistory: { x: number; y: number }[] = [];
  /** Keystone / hybrid / archetype rule bookkeeping — primed strikes, aura timers, … */
  readonly ruleState = new HeroRuleState();
  /**
   * The world point this hero is aiming at this tick — the cursor, in mouse-aim mode.
   * Null when only a facing is known (keyboard scheme, a remote player), in which case a
   * ground-placed ability falls back to a fixed distance along `avatar.facing`.
   */
  aimPoint: { x: number; y: number } | null = null;

  constructor(setup: HeroSetup, index: number, avatar: Avatar) {
    this.index = index;
    this.netId = setup.netId;
    this.name = setup.name;
    this.player = setup.player;
    this.appearance = setup.appearance;
    this.potions = setup.potions;
    this.local = setup.local;
    this.avatar = avatar;
    this.sc = new StatusContainer(index);
    this.resources = setup.player.makeResources();
  }

  get alive(): boolean {
    return !this.downed;
  }
}

/** What `Dungeon` needs to build one `Hero`. */
export interface HeroSetup {
  readonly netId: string;
  readonly name: string;
  readonly player: Player;
  readonly appearance: Appearance;
  readonly potions: number;
  readonly local: boolean;
}

/**
 * How this floor is being run. `solo` is the whole original game. `host` simulates for
 * everybody; `client` simulates nothing at all and is driven by `net/sync.ts` from the
 * snapshots the host sends.
 */
export type NetRole = "solo" | "host" | "client";

export interface DungeonOptions {
  readonly seed?: number;
  readonly role?: NetRole;
  /** The whole party, host first. Omitted for a solo dive. */
  readonly heroes?: readonly HeroSetup[];
}

/**
 * One floor of the dungeon: an arena, a wave director, and the combat simulation.
 * Pure simulation — it never touches the DOM or the canvas. Anything the renderer
 * needs to react to is pushed onto `events` and drained once per frame.
 */
export class Dungeon implements CombatHost, RuleHost {
  /** How this floor was configured: mode, rift tier, position in the run. */
  readonly config: RunConfig;
  readonly profile: DepthProfile;
  /** The generated floor: walls, hazards, decoration, and where the exit is. */
  readonly level: Level;
  readonly width: number;
  readonly height: number;
  /** Everyone on this floor, host first. One entry in a solo dive. */
  readonly heroes: Hero[] = [];
  /** The hero this browser drives. Every legacy getter below points here. */
  readonly localHero: Hero;
  readonly role: NetRole;
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly pickups: Pickup[] = [];
  /** Danger zones mid-wind-up. The whole vocabulary of a boss fight. */
  readonly telegraphs: Telegraph[] = [];
  /** Fire, tar and worse, left behind by whatever just went off. */
  readonly ground: GroundZone[] = [];
  /** Totems you planted. They keep working after you've walked away. */
  readonly totems: Totem[] = [];
  /** Summoned combatants — skeletons, drones, a falcon. They move, fight and die. */
  readonly minions: Minion[] = [];
  /** Bodies of slain monsters, for the Necromancer's corpse economy. */
  readonly corpsePile: Corpse[] = [];
  readonly events: RunEvent[] = [];
  /** Deterministic randomness for the whole floor. The boss brain draws from it too. */
  readonly rng: Rng;
  /**
   * A separate deterministic stream for the hero evasion / block rolls, seeded off the
   * floor seed. Kept apart from `rng` on purpose: a class with no evasion never draws
   * from it, so adding the avoid-the-hit layer does not shift the main stream and the
   * rest of the sim (spawns, boss telegraphs, loot) stays byte-identical.
   */
  readonly defenseRng: Rng;
  /** The typed combat event bus the `src/combat` executor and resource rules ride on.
   *  Wired to `fireTriggers` so item triggers still see hits and kills. */
  readonly bus = new EventBus();
  /** Persistent `HostActor` adapters, keyed by host id, so a `StatusContainer` and a
   *  `ResourceSet` keep their identity across a cast. Rebuilt lazily. */
  private hostActors = new Map<number, HostActor>();

  phase: RunPhase = "fighting";
  wave = 0;
  /** The one enemy that is a raid boss, while it lives. */
  boss: Enemy | null = null;
  /** Enemies still owed by the current wave. */
  private queued = 0;
  private waveGap = 0.6;
  private spawnTimer = 0;
  private nextEnemyId = 1;
  private nextTotemId = 1;
  private nextMinionId = 1;
  private nextCorpseId = 1;
  /** Distance field toward the enemies, for minion pathing. Built only while minions exist. */
  private minionFlow: FlowField | null = null;
  /** Guards against a triggered effect setting off another triggered effect forever. */
  private inTrigger = false;
  /** The save this run belongs to. Public because the multiplayer layer banks a
   *  client's loot and potions straight back into it. */
  readonly state: GameState;
  /** One route map per hero: a monster follows the one belonging to whoever it wants. */
  private flowTimer = 0;
  /** Position of the extraction portal. Live all floor; descent needs a clear. */
  readonly portal: { x: number; y: number };
  elapsed = 0;

  /**
   * `depth` may be a plain delve depth or a full rift configuration. `opts` is only
   * ever passed by the multiplayer layer — a solo dive stays a two-argument call and
   * behaves exactly as it always has, with a party of one.
   */
  constructor(state: GameState, depth: number | RunConfig, opts: number | DungeonOptions = {}) {
    const options: DungeonOptions = typeof opts === "number" ? { seed: opts } : opts;
    const seed = options.seed ?? ((Math.random() * 2 ** 32) >>> 0);
    this.role = options.role ?? "solo";
    this.state = state;
    this.config = typeof depth === "number" ? delveConfig(depth) : depth;
    this.profile = profileFor(this.config.depth, this.config);
    this.rng = new Rng(seed);
    this.defenseRng = new Rng((seed ^ 0x9e3779b9) >>> 0);

    // Every floor is generated: layout, hazards and decoration all come from here. A
    // planet expedition brings its own biome, a bigger room graph, and resource nodes
    // to mine on top of whatever it's fighting.
    const planet = this.config.planet?.spec;
    this.level = generateLevel(this.config.depth, this.rng, {
      boss: this.profile.isBoss,
      biome: planet?.biome,
      big: planet !== undefined,
      nodeCount: planet && !this.profile.isBoss ? planet.nodeCount : undefined,
    });
    this.width = this.level.width;
    this.height = this.level.height;

    // A solo dive is a party of one, built from the save exactly like it always was.
    const setups: readonly HeroSetup[] = options.heroes ?? [{
      netId: "", name: "You", player: state.player, appearance: state.appearance,
      potions: state.potions, local: true,
    }];
    const { x, y } = this.level.start;
    for (let i = 0; i < setups.length; i++) {
      // Party members stand in a small ring around the entrance rather than inside each
      // other, so four people arriving on a floor don't spend the first second untangling.
      const angle = (TAU / Math.max(1, setups.length)) * i - Math.PI / 2;
      const spread = setups.length > 1 ? 22 : 0;
      const spot = resolveCircle(
        this.level,
        clamp(x + Math.cos(angle) * spread, PLAYER_RADIUS + WALL_PAD, this.level.width - PLAYER_RADIUS - WALL_PAD),
        clamp(y + Math.sin(angle) * spread, PLAYER_RADIUS + WALL_PAD, this.level.height - PLAYER_RADIUS - WALL_PAD),
        PLAYER_RADIUS,
      );
      const hero = new Hero(setups[i]!, i, makeAvatar(spot.x, spot.y));
      hero.flow = new FlowField(this.level);
      hero.flow.update(this.level, spot.x, spot.y);
      this.heroes.push(hero);
    }
    this.localHero = this.heroes.find((h) => h.local) ?? this.heroes[0]!;
    for (const hero of this.heroes) {
      runBuildGrants(
        this.bus, hero.player.build, this, hero.rt, hero.index,
        () => this.castInputFor(hero),
        () => hero.avatar.facing,
      );
    }
    this.portal = this.level.portal;
    this.startNextWave();
  }

  // --- the one hero this browser is driving -------------------------------
  //
  // Everything downstream of the simulation — the HUD, the renderer, the boss brain,
  // the smoke test — asks the dungeon about "the player" and gets the local one. That
  // is what kept the party rewrite from spilling out of this file.

  get avatar(): Avatar {
    return this.localHero.avatar;
  }

  get loot(): RunLoot {
    return this.localHero.loot;
  }

  get playerStatuses(): StatusInstance[] {
    return this.localHero.sc.list;
  }

  get skillCooldowns(): number[] {
    return this.localHero.skillCooldowns;
  }

  get ward(): number {
    return this.localHero.ward;
  }

  get specialCharge(): number {
    return this.localHero.specialCharge;
  }

  set specialCharge(value: number) {
    this.localHero.specialCharge = value;
  }

  /** True in a party run — the HUD grows ally frames and the portal waits for everyone. */
  get isParty(): boolean {
    return this.heroes.length > 1;
  }

  /** What the character looks like. The renderer's business, never the simulation's. */
  get appearance(): Appearance {
    return this.localHero.appearance;
  }

  get player(): Player {
    return this.localHero.player;
  }

  get settings() {
    return this.state.settings;
  }

  /** Potions belong to the character carrying them, not to the floor. */
  get potionCount(): number {
    return this.localHero.potions;
  }

  /** On a client the wave director isn't running here, so the host says what's left. */
  remoteRemaining = 0;

  get enemiesRemaining(): number {
    if (this.role === "client") return this.remoteRemaining;
    return this.enemies.length + this.queued;
  }

  /** Pushed by the boss brain and by anything else that wants the renderer's attention. */
  emit(ev: RunEvent): void {
    this.events.push(ev);
  }

  // --- wave director ------------------------------------------------------

  private startNextWave(): void {
    this.wave++;
    // A boss floor has exactly one wave, and it is the boss. Everything else that
    // shows up during the fight was summoned by it.
    this.queued = this.profile.isBoss ? 1 : this.profile.enemiesPerWave;
    this.spawnTimer = this.waveGap;
    this.events.push({ kind: "wave", wave: this.wave, total: this.profile.waves });
  }

  private spawnableKinds(): EnemyKind[] {
    return (Object.keys(ARCHETYPES) as EnemyKind[]).filter(
      (k) => ARCHETYPES[k].weight > 0 && ARCHETYPES[k].minDepth <= this.profile.depth,
    );
  }

  /** Picks an archetype, rolls elite, and drops one wave monster near (x, y). */
  private placeMonsterAt(spot: { x: number; y: number }): void {
    const kinds = this.spawnableKinds();
    const weights = Object.fromEntries(kinds.map((k) => [k, ARCHETYPES[k].weight])) as Record<EnemyKind, number>;
    const archetype = ARCHETYPES[this.rng.weighted(weights)];
    const at = resolveCircle(this.level, spot.x, spot.y, archetype.radius);
    // Elites scale with depth: deeper floors roll higher tints and much fatter loot.
    let elite: Rarity | null = null;
    const eliteChance = clamp(
      (0.03 + this.profile.depth * 0.008) * (1 + (this.config.danger - 1) * 0.6), 0, 0.35);
    if (this.rng.chance(eliteChance)) {
      const maxTier = clamp(1 + Math.floor(this.profile.depth / 3), 1, RARITIES.length - 1);
      elite = RARITIES[this.rng.int(1, maxTier)]!;
    }
    // The discount is for chaff only — an elite in the swarm is still the real threat.
    this.enemies.push(
      this.makeEnemy(archetype, at.x, at.y, { elite, healthMult: elite ? 1 : WAVE_HEALTH_MULT }),
    );
  }

  /**
   * A horde doesn't trickle in one at a time — it pours out of a single spot all at
   * once. Picks one open point and scatters a tight cluster of monsters around it,
   * which also happens to be exactly the shape a cleave or an arc wants to eat.
   */
  private spawnBurst(): void {
    if (this.profile.isBoss && !this.boss) {
      this.spawnBoss();
      this.queued = Math.max(0, this.queued - 1);
      return;
    }
    const room = Math.max(0, this.profile.maxAlive - this.enemies.length);
    const size = Math.min(this.burstSizeFor(), this.queued, room);
    if (size <= 0) return;
    const center = this.openSpot(20);
    for (let i = 0; i < size; i++) {
      const angle = this.rng.angle();
      const reach = this.rng.range(0, 60);
      this.placeMonsterAt({
        x: clamp(center.x + Math.cos(angle) * reach, 40, this.width - 40),
        y: clamp(center.y + Math.sin(angle) * reach, 40, this.height - 40),
      });
    }
    this.queued -= size;
  }

  /** Bigger, chunkier bursts the deeper — and the more dangerous — the floor gets. */
  private burstSizeFor(): number {
    return clamp(Math.round(2 + this.profile.depth * 0.1 + (this.profile.crowd - 1) * 3), 2, 6);
  }

  /** Time between bursts. Deep floors don't just field more monsters, they field them faster. */
  private burstGapFor(): number {
    return clamp(0.5 - this.profile.depth * 0.01, 0.2, 0.5);
  }

  /** Somewhere on open floor, away from the player, and never inside a hazard. */
  private openSpot(radius: number, awayFrom = 200): { x: number; y: number } {
    const hazards = this.level.traps.map((t) => ({ x: t.x, y: t.y, d: t.radius + 20 }));
    return (
      randomOpenPoint(this.level, this.rng, {
        clearance: radius > 16 ? 2 : 1,
        away: [{ x: this.avatar.x, y: this.avatar.y, d: awayFrom }, ...hazards],
        tries: 40,
      }) ??
      // A cramped floor may have nowhere far away; settle for anywhere walkable.
      randomOpenPoint(this.level, this.rng, {
        away: [{ x: this.avatar.x, y: this.avatar.y, d: 110 }],
        tries: 30,
      }) ??
      this.level.start
    );
  }

  /**
   * Builds a monster. Everything that isn't the boss comes through here, including the
   * adds a boss summons, so infusion and resistance rules are applied in exactly one
   * place.
   */
  private makeEnemy(
    archetype: EnemyArchetype,
    x: number,
    y: number,
    opts: { elite?: Rarity | null; summoned?: boolean; healthMult?: number } = {},
  ): Enemy {
    const elite = opts.elite ?? null;
    const eliteMult = elite ? 1 + rarityIndex(elite) * 0.55 : 1;
    const element = this.rollElement(archetype.element, elite !== null);
    const health = this.profile.enemyHealth * archetype.health * eliteMult * (opts.healthMult ?? 1);

    // Everything resists its own element hard, so a single-element build eventually
    // hits a wall and has to diversify. Physical is deliberately exempt: it's the
    // damage everyone always has, and a floor that resists your sword is a floor you
    // simply cannot fight.
    const resists = zeroResists();
    for (const e of Object.keys(resists) as Element[]) {
      resists[e] = archetype.resist + (elite ? rarityIndex(elite) * 8 : 0);
    }
    if (element !== "physical") resists[element] += 55 + this.profile.depth * 1.5;

    const prefix = element !== archetype.element ? `${ELEMENT_PREFIX[element]} ` : "";
    // A planet renames its ordinary archetypes so the roster reads as this planet's
    // own, even though it's the same five kinds fighting the same way underneath.
    const baseName = this.config.planet?.spec.enemyNames[archetype.kind] ?? archetype.name;
    return {
      id: this.nextEnemyId++,
      x, y, px: x, py: y,
      radius: archetype.radius * (elite ? 1.18 : 1),
      archetype,
      name: `${prefix}${elite ? `${cap(elite)} ` : ""}${baseName}`,
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
      element,
      resists,
      sc: new StatusContainer(Dungeon.ENEMY_ID_BASE + this.nextEnemyId - 1),
      knockResist: 1,
      boss: null,
      summoned: opts.summoned ?? false,
    };
  }

  /** Deep floors infuse their monsters with the local element; elites roll their own. */
  private rollElement(base: Element, elite: boolean): Element {
    if (elite && this.rng.chance(0.45)) return this.rng.pick(LOOT_ELEMENTS);
    const local = this.level.biome.element;
    if (local !== "physical" && this.rng.chance(infusionChance(this.profile.depth))) return local;
    return base;
  }

  /**
   * The encounter. One enormous body in the middle of the room with a rotation of
   * telegraphed abilities and enough health that you'll see all of them.
   */
  private spawnBoss(): void {
    // A planet's boss is borrowed wholesale from an existing encounter and reskinned —
    // see `planetBossSpec` — rather than picked off the depth-bucketed ladder.
    const spec = this.config.planet ? planetBossSpec(this.config.planet.spec) : bossFor(this.profile.depth);
    const archetype = ARCHETYPES.boss;
    const spot = this.openSpot(spec.radius, 260);
    const base = this.makeEnemy(archetype, spot.x, spot.y, {});

    const health = this.profile.enemyHealth * spec.health;
    const resists = zeroResists();
    for (const e of Object.keys(resists) as Element[]) resists[e] = archetype.resist;
    if (spec.element !== "physical") resists[spec.element] += spec.selfResist;

    const boss: Enemy = {
      ...base,
      name: spec.name,
      radius: spec.radius,
      health, maxHealth: health,
      damage: this.profile.enemyDamage * spec.damage,
      speed: this.profile.enemySpeed * spec.speed,
      element: spec.element,
      resists,
      knockResist: BOSS_KNOCK_RESIST,
      // It gets a moment to arrive before it starts casting at you.
      spawnTimer: 1.1,
      boss: {
        spec,
        phase: 0,
        actionTimer: BOSS_ACTION_GAP,
        ability: null,
        castTimer: 0,
        castTotal: 0,
        cooldowns: {},
        aimX: spot.x, aimY: spot.y,
        chargeTimer: 0, chargeVx: 0, chargeVy: 0,
        pendingDrops: 0, dropTimer: 0,
        buffTimer: 0, buffDamageMult: 1, buffHasteMult: 1,
      },
    };
    this.enemies.push(boss);
    this.boss = boss;
    this.events.push({ kind: "bossSpawn", name: spec.name, title: spec.title });
    this.events.push({ kind: "shake", amount: 14 });
  }

  /** Adds, thrown out by a boss ability. Chaff: weaker, and they evaporate with it. */
  spawnAdds(count: number, x: number, y: number): void {
    const kinds = this.spawnableKinds();
    const weights = Object.fromEntries(kinds.map((k) => [k, ARCHETYPES[k].weight])) as Record<EnemyKind, number>;
    for (let i = 0; i < count; i++) {
      const archetype = ARCHETYPES[this.rng.weighted(weights)];
      const angle = this.rng.angle();
      const reach = this.rng.range(70, 150);
      const spot = resolveCircle(
        this.level,
        clamp(x + Math.cos(angle) * reach, 40, this.width - 40),
        clamp(y + Math.sin(angle) * reach, 40, this.height - 40),
        archetype.radius,
      );
      this.enemies.push(this.makeEnemy(archetype, spot.x, spot.y, { summoned: true, healthMult: 0.62 }));
    }
  }

  // --- simulation ---------------------------------------------------------

  /**
   * One simulation tick. `input` is the local player's; every other hero on the floor
   * carries its own `Hero.input`, filled in from the network, and goes through exactly
   * the same code.
   *
   * A `client` dungeon never runs any of this — `net/sync.ts` overwrites its world from
   * the host's snapshots instead, and the only thing it simulates is a little local
   * prediction so your own character answers the keyboard without a round trip.
   */
  update(dt: number, input: AvatarInput): void {
    this.elapsed += dt;
    if (this.role === "client") {
      this.predictLocal(dt, input);
      return;
    }
    if (this.phase === "dead") return;

    for (const hero of this.heroes) {
      const source = hero.local ? input : hero.input;
      if (!source) continue;
      if (hero.downed) continue;
      this.updateHero(hero, dt, source);
      this.updateResourceNodes(hero, source);
    }
    for (const hero of this.heroes) this.updateHeroStatuses(hero, dt);
    for (const hero of this.heroes) if (!hero.downed) rulesTick(this, hero, dt);
    this.updateRevives(dt);
    this.updateFlow(dt);
    this.updateTraps(dt);
    this.updateTelegraphs(dt);
    this.updateGround(dt);
    this.updateTotems(dt);
    this.updateSpawning(dt);
    this.updateEnemies(dt);
    this.updateMinions(dt);
    this.updateCorpses(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    // Potions live on the save in a solo dive, exactly as they always did.
    if (this.role === "solo") this.state.potions = this.localHero.potions;

    if (this.phase === "fighting" && this.enemiesRemaining === 0 && this.wave >= this.profile.waves) {
      this.phase = "cleared";
      // Clearing the floor picks everybody up. Nobody sits out the walk to the portal.
      for (const hero of this.heroes) {
        if (hero.downed) this.reviveHero(hero);
      }
      this.dropClearCache();
      this.events.push({ kind: "cleared" });
    }
  }

  /**
   * A client moves its own character immediately and lets the host's next snapshot
   * correct it (see `applyHero` in `net/sync.ts`). Nothing else is predicted — a swing
   * that hasn't happened yet must never draw a number, and on a home network the
   * correction arrives before you could notice one.
   */
  private predictLocal(dt: number, input: AvatarInput): void {
    const hero = this.localHero;
    if (hero.downed || this.phase === "dead") return;
    const a = hero.avatar;
    a.px = a.x;
    a.py = a.y;
    const aim = input.aimAngle(a.x, a.y);
    const move = input.moveVector();
    if (aim !== null) a.facing = aim;
    else if (move.x !== 0 || move.y !== 0) a.facing = Math.atan2(move.y, move.x);
    if (a.dashTimer > 0) return; // the host owns a dash outright; it lands in one snapshot
    const speed = PLAYER_SPEED * hero.player.moveMult * this.mireSlowAt(a.x, a.y);
    a.x = clamp(a.x + move.x * speed * dt, a.radius + WALL_PAD, this.width - a.radius - WALL_PAD);
    a.y = clamp(a.y + move.y * speed * dt, a.radius + WALL_PAD, this.height - a.radius - WALL_PAD);
    const fixed = resolveCircle(this.level, a.x, a.y, a.radius);
    a.x = fixed.x;
    a.y = fixed.y;
  }

  /**
   * Downed allies. Stand next to one and they come back; walk away and their progress
   * bleeds off. Skipped entirely in a solo dive, where being out of health is simply
   * the end of the run.
   */
  private updateRevives(dt: number): void {
    if (!this.isParty) return;
    for (const hero of this.heroes) {
      if (!hero.downed) continue;
      const helper = this.heroes.some(
        (other) => other.alive && dist(other.avatar.x, other.avatar.y, hero.avatar.x, hero.avatar.y) <= REVIVE_RANGE,
      );
      hero.reviveProgress = clamp(hero.reviveProgress + (helper ? dt : -dt * 0.5), 0, REVIVE_TIME);
      if (hero.reviveProgress >= REVIVE_TIME) this.reviveHero(hero);
    }
  }

  private reviveHero(hero: Hero): void {
    hero.downed = false;
    hero.reviveProgress = 0;
    hero.player.health = Math.max(1, Math.round(hero.player.maxHealth * REVIVE_HEALTH));
    hero.avatar.invulnTimer = Math.max(hero.avatar.invulnTimer, 1.2);
    hero.sc.list.length = 0;
    this.events.push({ kind: "nova", x: hero.avatar.x, y: hero.avatar.y, radius: 70 });
    this.events.push({
      kind: "pickup", x: hero.avatar.x, y: hero.avatar.y - 26,
      label: `${hero.name} is up`, color: "#4ade80",
    });
  }

  /** The living hero nearest a point: who a monster charges and what a boss aims at. */
  nearestHero(x: number, y: number): Hero {
    let best = this.localHero;
    let bestGap = Infinity;
    for (const hero of this.heroes) {
      if (!hero.alive) continue;
      const gap = dist(x, y, hero.avatar.x, hero.avatar.y);
      if (gap < bestGap) {
        best = hero;
        bestGap = gap;
      }
    }
    return best;
  }

  /** The avatar a monster or a boss should be pointing at from where it stands. */
  aimAvatar(x: number, y: number): Avatar {
    return this.nearestHero(x, y).avatar;
  }

  /** A living hero at random — meteor rain should fall on the whole party, not one head. */
  randomHeroAvatar(): Avatar {
    const alive = this.heroes.filter((h) => h.alive);
    return (alive.length > 0 ? this.rng.pick(alive) : this.localHero).avatar;
  }

  /** How many of the party are standing in the portal. The HUD counts them out loud. */
  get partyAtPortal(): number {
    return this.heroes.filter(
      (h) => dist(h.avatar.x, h.avatar.y, this.portal.x, this.portal.y) < 34).length;
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
    this.spawnBurst();
    this.spawnTimer = this.burstGapFor();
  }

  /** The pathing field only needs to be roughly current, so it runs a few times a second. */
  /**
   * One route map per hero, rebuilt four times a second. A monster that can't see
   * anybody follows the field belonging to whichever hero it's chasing — without this
   * they stand behind pillars and the floor never ends.
   */
  private updateFlow(dt: number): void {
    this.flowTimer -= dt;
    if (this.flowTimer > 0) return;
    this.flowTimer = 0.25;
    for (const hero of this.heroes) {
      if (!hero.alive) continue;
      hero.flow?.update(this.level, hero.avatar.x, hero.avatar.y);
    }
    // One shared field toward the fight, so a minion that can't see its target still
    // routes around walls to reach it. Only worth building when something follows it.
    if (this.minions.length > 0 && this.enemies.length > 0) {
      if (!this.minionFlow) this.minionFlow = new FlowField(this.level);
      this.minionFlow.updateMulti(this.level, this.enemies);
    }
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
    const element: Element = t.kind === "flame" ? "fire" : t.kind === "mire" ? "poison" : "physical";
    for (const hero of this.heroes) {
      if (!hero.alive) continue;
      const a = hero.avatar;
      if (dist(a.x, a.y, t.x, t.y) <= t.radius + a.radius) this.hurtPlayer(hero, damage, element);
    }

    if (!t.spec.hitsEnemies) return;
    // Snapshot: damageEnemy can splice the list while we're walking it.
    const caught = this.enemies.filter(
      (e) => e.state !== "spawning" && e.trapCooldown <= 0 && dist(e.x, e.y, t.x, t.y) <= t.radius + e.radius,
    );
    for (const e of caught) {
      e.trapCooldown = TRAP_ENEMY_COOLDOWN;
      this.damageEnemy(e, damage, Math.atan2(e.y - t.y, e.x - t.x), element);
    }
  }

  private fireTurret(t: Trap): void {
    this.events.push({ kind: "trap", x: t.x, y: t.y, trap: t.kind, radius: t.radius });
    this.spawnEnemyBolt(t.x, t.y, t.angle, 230, this.profile.enemyDamage * t.spec.damage, "physical", 0);
  }

  /** Movement multiplier at a point — 1 on clean floor, much less in tar. */
  private mireSlowAt(x: number, y: number): number {
    for (const t of this.level.traps) {
      if (t.kind !== "mire") continue;
      if (dist(x, y, t.x, t.y) <= t.radius) return MIRE_SLOW;
    }
    return 1;
  }

  // --- telegraphs and burning ground ---------------------------------------

  /** Paints a danger zone. Called by the boss brain, and by the floor for a big hit. */
  addTelegraph(init: TelegraphInit): Telegraph {
    const t: Telegraph = { ...init, angleOffset: init.angleOffset ?? 0, remaining: init.total };
    this.telegraphs.push(t);
    return t;
  }

  private updateTelegraphs(dt: number): void {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i]!;
      if (t.followId !== null) {
        const owner = this.enemies.find((e) => e.id === t.followId);
        // The owner died mid-cast: the ability dies with it. That's a real reward for
        // burning a boss down through a wind-up.
        if (!owner) { this.telegraphs.splice(i, 1); continue; }
        t.x = owner.x;
        t.y = owner.y;
        // The offset is what keeps several blades off one boss from collapsing onto
        // the same facing every time its rotation is refreshed.
        if (t.shape === "cone" || t.shape === "line") t.angle = owner.facing + t.angleOffset;
      }
      t.remaining -= dt;
      if (t.remaining > 0) continue;
      this.telegraphs.splice(i, 1);
      this.resolveTelegraph(t);
    }
  }

  private resolveTelegraph(t: Telegraph): void {
    this.events.push({
      kind: "boom", x: t.x, y: t.y,
      radius: t.shape === "donut" ? t.inner : t.radius,
      color: t.color,
    });

    if (t.hitsPlayer) {
      for (const hero of this.heroes) {
        if (!hero.alive) continue;
        const a = hero.avatar;
        if (inTelegraph(t, a.x, a.y, a.radius)) this.hurtPlayerMechanic(hero, t.damage, t.element, 0.7);
      }
      // A boss shape catches your summons too — a legion melts in an arena-wide slam.
      for (const m of [...this.minions]) {
        if (inTelegraph(t, m.x, m.y, m.radius)) this.hurtMinion(m, t.damage, t.element);
      }
    }
    if (t.hitsEnemies) {
      const caught = this.enemies.filter(
        (e) => !e.boss && e.id !== t.followId && e.state !== "spawning" && inTelegraph(t, e.x, e.y, e.radius),
      );
      for (const e of caught) {
        this.damageEnemy(e, t.damage, Math.atan2(e.y - t.y, e.x - t.x), t.element);
      }
    }

    if (t.linger > 0) {
      this.ground.push({
        x: t.x, y: t.y, px: t.x, py: t.y,
        radius: t.shape === "line" ? Math.max(40, t.width * 2) : Math.max(30, t.radius * 0.75),
        element: t.element,
        damage: t.damage * GROUND_DAMAGE,
        remaining: t.linger,
        tickTimer: GROUND_TICK,
        hitsPlayer: t.hitsPlayer,
        hitsEnemies: t.hitsEnemies,
        color: t.color,
      });
    }
  }

  /**
   * Burning ground. It ignores invulnerability frames on purpose — a dash is how you
   * cross it, not how you stand in it.
   */
  private updateGround(dt: number): void {
    for (let i = this.ground.length - 1; i >= 0; i--) {
      const g = this.ground[i]!;
      g.remaining -= dt;
      if (g.remaining <= 0) { this.ground.splice(i, 1); continue; }
      // A `follows` zone rides its owner (Bard's march, a Shaman totem's aura).
      if (g.follows !== undefined) {
        const owner = this.heroes[g.follows];
        if (owner) { g.x = owner.avatar.x; g.y = owner.avatar.y; }
      }
      g.tickTimer -= dt;
      if (g.tickTimer > 0) continue;
      g.tickTimer += GROUND_TICK;

      if (g.benefit) {
        for (const hero of this.heroes) {
          if (!hero.alive) continue;
          const a = hero.avatar;
          if (dist(a.x, a.y, g.x, g.y) <= g.radius + a.radius) this.applyZoneBenefit(hero, g);
        }
        continue;
      }

      if (g.hitsPlayer) {
        for (const hero of this.heroes) {
          if (!hero.alive) continue;
          const a = hero.avatar;
          if (dist(a.x, a.y, g.x, g.y) <= g.radius + a.radius) {
            this.hurtPlayerRaw(hero, g.damage, g.element, 0.35);
          }
        }
        for (const m of [...this.minions]) {
          if (dist(m.x, m.y, g.x, g.y) <= g.radius + m.radius) this.hurtMinion(m, g.damage, g.element);
        }
      }
      if (!g.hitsEnemies) continue;
      const caught = this.enemies.filter(
        (e) => !e.boss && e.state !== "spawning" && dist(e.x, e.y, g.x, g.y) <= g.radius + e.radius,
      );
      const zoneOwner = g.packet ? this.heroByHostId(g.packet.source.actorId) : undefined;
      for (const e of caught) {
        const ail = STATUS_FOR_ELEMENT[g.element];
        const hadAil = ail ? e.sc.has(ail) : false;
        const dealt = this.damageEnemy(e, g.damage, this.rng.angle(), g.element);
        this.creditIndirectHit(g.packet, e, dealt, !!ail && !hadAil && e.sc.has(ail));
        if (g.status && e.health > 0) {
          e.sc.apply(g.status, {
            hitDamage: g.damage, sourceActorId: zoneOwner ? zoneOwner.index : -1, chance: 1, roll: () => this.rng.next(),
          });
        }
      }
    }
  }

  // --- the player ---------------------------------------------------------

  private updateHero(hero: Hero, dt: number, input: AvatarInput): void {
    const a = hero.avatar;
    const player = hero.player;
    a.px = a.x;
    a.py = a.y;

    a.attackTimer = Math.max(0, a.attackTimer - dt);
    a.swingTimer = Math.max(0, a.swingTimer - dt);
    a.dashCooldown = Math.max(0, a.dashCooldown - dt);
    a.invulnTimer = Math.max(0, a.invulnTimer - dt);
    a.dashInvuln = Math.max(0, a.dashInvuln - dt);
    a.hitFlash = Math.max(0, a.hitFlash - dt);
    // Mirror the ability runtime's cooldowns into the flat array the HUD and the
    // snapshot read — cooldowns themselves live on `hero.rt`, keyed by ability id.
    const active = hero.player.activeAbilities;
    for (let i = 0; i < hero.skillCooldowns.length; i++) {
      const ab = active[i];
      hero.skillCooldowns[i] = ab ? hero.rt.cooldownRemaining(ab.id) : 0;
    }
    if (hero.wardTimer > 0) {
      hero.wardTimer = Math.max(0, hero.wardTimer - dt);
      if (hero.wardTimer === 0) hero.ward = 0;
    }
    // Mana comes back slowly enough that a skill is a decision, not a rotation filler.
    player.restoreMana(player.manaRegen * dt);

    // Self-buff statuses (Frenzy, Blessed, Inspired, …) feed the legacy attack path
    // through the same two fields the old buff skills used, plus a damage multiplier the
    // skill / ultimate casts pick up via `castInputFor`.
    const bm = hero.sc.modsContribution();
    a.buffAttackSpeed = bm.attackSpeed;
    a.buffLifeOnHit = bm.lifeOnHit;

    const move = input.moveVector();
    const disabled = hero.sc.disables();
    // In mouse-aim mode, facing (and so every attack and skill) points at the cursor
    // regardless of which way you're walking — movement and aim are separate axes,
    // same as any twin-aim action game. Exclusive keyboard keeps the original behavior:
    // you face whichever way you're moving, because there's nothing else to aim with.
    const aim = input.aimAngle(a.x, a.y);
    if (aim !== null) a.facing = aim;
    else if (move.x !== 0 || move.y !== 0) a.facing = Math.atan2(move.y, move.x);
    // Cursor world-point for ground-placed abilities — a heal circle or an acid pool
    // lands where the mouse is, not at a fixed reach along the facing.
    hero.aimPoint = input.aimPoint?.(a.x, a.y) ?? null;

    if (a.dashTimer > 0) {
      a.dashTimer -= dt;
    } else if (input.wasPressed("dash") && a.dashCooldown <= 0 && !disabled.move) {
      a.dashTimer = DASH_TIME;
      a.dashCooldown = DASH_COOLDOWN;
      // The dash grants i-frames — it's the main defensive tool, so it must feel reliable.
      a.invulnTimer = Math.max(a.invulnTimer, DASH_TIME + 0.08);
      a.dashInvuln = DASH_TIME + 0.08;
      const dir = move.x || move.y ? move : { x: Math.cos(a.facing), y: Math.sin(a.facing) };
      a.vx = dir.x * DASH_SPEED;
      a.vy = dir.y * DASH_SPEED;
      this.fireTriggers(hero, "onDash", a.x, a.y);
      hero.resources.broadcast({ type: "dashStart" });
    }

    if (a.dashTimer <= 0) {
      // Tar slows a walk to a crawl but never a dash — the dash stays the way out.
      const slow = disabled.move ? 0 : this.mireSlowAt(a.x, a.y) * hero.sc.slowMultiplier();
      const speed = PLAYER_SPEED * player.moveMult * (1 + bm.moveSpeed) * slow;
      a.vx = move.x * speed;
      a.vy = move.y * speed;
    }

    const beforeX = a.x;
    const beforeY = a.y;
    a.x = clamp(a.x + a.vx * dt, a.radius + WALL_PAD, this.width - a.radius - WALL_PAD);
    a.y = clamp(a.y + a.vy * dt, a.radius + WALL_PAD, this.height - a.radius - WALL_PAD);
    const fixed = resolveCircle(this.level, a.x, a.y, a.radius);
    a.x = fixed.x;
    a.y = fixed.y;
    const travelled = dist(beforeX, beforeY, a.x, a.y);
    if (travelled > 0.01) hero.resources.broadcast({ type: "move", distance: travelled });
    hero.posHistory.unshift({ x: a.x, y: a.y });
    if (hero.posHistory.length > 90) hero.posHistory.length = 90;

    if (input.wasPressed("attack") && a.attackTimer <= 0 && !disabled.attack) this.attack(hero);
    if (input.wasPressed("potion")) this.drinkPotion(hero);
    if (input.wasPressed("special")) this.useUltimate(hero);
    if (input.wasPressed("skill1")) this.castSkill(hero, 0);
    if (input.wasPressed("skill2")) this.castSkill(hero, 1);
    if (input.wasPressed("skill3")) this.castSkill(hero, 2);
    if (input.wasPressed("skill4")) this.castSkill(hero, 3);
  }

  /** Ailments on a hero tick here, along with the mana a void hit tears out. */
  private updateHeroStatuses(hero: Hero, dt: number): void {
    if (hero.downed) return;
    const burn = hero.sc.manaBurnPerSecond();
    if (burn > 0) hero.player.drainMana(burn * dt);
    hero.sc.tick(dt, { onDamage: (p) => this.dealDamage(hero.index, p) });
    hero.resources.tick(dt, {
      fireEffect: (id) => this.emitFx(id, hero.avatar.x, hero.avatar.y),
      spendHealth: (amount) => {
        const before = hero.player.health;
        this.applyPlayerDamage(hero, amount, "physical", 0);
        return before - hero.player.health;
      },
    });
    hero.rt.tick(dt, this);
  }

  /**
   * One press of the attack button, resolved the way the weapon in your hand says it
   * should be. Six families, six shapes: this is where "every weapon is the same swing
   * with a bigger number on it" finally stops being true.
   */
  private attack(hero: Hero): void {
    const a = hero.avatar;
    const p = hero.player;
    const w = p.weapon;
    // The basic attack is an ability now (`data/weapon-abilities.ts`): the dungeon still
    // owns the geometry below, but the hit it resolves — packet, element, tags,
    // knockback — is that ability's, and it lands through the same pipeline a spell's
    // hits do.
    const ability = weaponAbilityFor(p.weaponFamily);
    a.attackTimer = p.attackCooldown / (1 + a.buffAttackSpeed);
    a.swingAngle = a.facing;
    const damage = p.attackDamage;

    switch (w.pattern) {
      case "bolt": {
        // A staff turns your attack into a projectile, and every projectile modifier
        // on your gear applies to it.
        const count = 1 + Math.max(0, Math.round(p.mods.projectiles));
        const spread = 0.15;
        for (let i = 0; i < count; i++) {
          const offset = count === 1 ? 0 : (i / (count - 1) - 0.5) * spread * (count - 1);
          this.spawnPlayerBolt(hero, a.facing + offset, damage, w.pierce + Math.round(p.mods.pierce));
        }
        a.swingTimer = SWING_TIME * 0.6;
        break;
      }
      case "thrust": {
        // Reach and pierce. It runs down a lane and stops after so many bodies.
        const limit = 1 + w.pierce + Math.max(0, Math.round(p.mods.pierce));
        for (const e of this.meleeTargets(hero, a.facing, w.reach, w.arc).slice(0, limit)) {
          this.weaponStrike(hero, e, damage, a.facing, ability);
        }
        a.swingTimer = SWING_TIME;
        break;
      }
      case "dual": {
        // Two blades, two hits a press, offset so both numbers are readable.
        for (let i = 0; i < w.hits; i++) {
          const angle = a.facing + (i === 0 ? -0.18 : 0.18);
          for (const e of this.meleeTargets(hero, angle, w.reach, w.arc)) {
            this.weaponStrike(hero, e, damage, angle, ability);
          }
        }
        a.swingTimer = SWING_TIME * 0.8;
        break;
      }
      case "orb": {
        // A full circle around you, and then a spark at something outside it.
        for (const e of this.meleeTargets(hero, a.facing, w.reach, w.arc)) {
          this.weaponStrike(hero, e, damage, Math.atan2(e.y - a.y, e.x - a.x), ability);
        }
        this.talismanSpark(hero, damage);
        a.swingTimer = SWING_TIME;
        break;
      }
      default: {
        // arc and cleave: everything inside the sweep, hit once.
        for (const e of this.meleeTargets(hero, a.facing, w.reach, w.arc)) {
          this.weaponStrike(hero, e, damage, a.facing, ability);
        }
        a.swingTimer = SWING_TIME;
        break;
      }
    }

    this.events.push({
      kind: "swing", x: a.x, y: a.y - 8, angle: a.swingAngle,
      arc: w.arc, reach: w.reach, pattern: w.pattern, ultimate: false,
      element: p.attackElement,
    });
  }

  /** Live enemies inside a melee sweep, nearest first so pierce limits mean something. */
  private meleeTargets(hero: Hero, angle: number, reach: number, arc: number): Enemy[] {
    const a = hero.avatar;
    const found: { e: Enemy; d: number }[] = [];
    for (const e of this.enemies) {
      if (e.state === "spawning" || e.health <= 0) continue;
      const d = dist(a.x, a.y, e.x, e.y);
      if (d > reach + e.radius) continue;
      if (arc < TAU - 0.01) {
        const toEnemy = Math.atan2(e.y - a.y, e.x - a.x);
        if (Math.abs(angleDelta(angle, toEnemy)) > arc / 2) continue;
      }
      found.push({ e, d });
    }
    found.sort((l, r) => l.d - r.d);
    return found.map((f) => f.e);
  }

  /** The staff's basic attack. It routes back through `playerHit` when it lands. */
  private spawnPlayerBolt(hero: Hero, angle: number, damage: number, pierce: number): void {
    const a = hero.avatar;
    const color = ELEMENT_COLORS[hero.player.attackElement];
    this.projectiles.push({
      x: a.x, y: a.y, px: a.x, py: a.y, radius: 5,
      vx: Math.cos(angle) * BOLT_SPEED, vy: Math.sin(angle) * BOLT_SPEED,
      damage, friendly: true, life: BOLT_LIFE, color,
      element: "physical", pierce: Math.max(0, pierce), hits: new Set(),
      ailment: 0, basic: true, owner: hero.index,
    });
  }

  /** The talisman's second hit: an arc to something you weren't even facing. */
  private talismanSpark(hero: Hero, damage: number): void {
    const a = hero.avatar;
    const element = hero.player.attackElement;
    let best: Enemy | null = null;
    let bestGap = TALISMAN_ARC_RANGE;
    for (const e of this.enemies) {
      if (e.state === "spawning" || e.health <= 0) continue;
      const gap = dist(a.x, a.y, e.x, e.y);
      if (gap > bestGap) continue;
      if (lineBlocked(this.level, a.x, a.y, e.x, e.y)) continue;
      best = e;
      bestGap = gap;
    }
    if (!best) return;
    this.events.push({
      kind: "bolt", x1: a.x, y1: a.y, x2: best.x, y2: best.y, color: ELEMENT_COLORS[element],
    });
    this.damageEnemy(best, damage * TALISMAN_ARC_DAMAGE, this.rng.angle(), element, {
      ailment: this.ailmentChance(hero, 0.6), knock: 40, source: hero,
    });
  }

  /**
   * One landed basic-attack hit, from a weapon-family `Ability` (`data/weapon-abilities.ts`).
   * The physical hit, then a separate hit for every element the gear carries — splitting
   * it is what makes an elemental roll readable: you see the orange number come off next
   * to the white one, and the thing catches fire. Leech and the on-hit trigger are
   * counted once per swing here, not once per element. Shared by every melee pattern and
   * by the staff/bow bolt when it lands (`p.basic`).
   */
  private weaponStrike(
    hero: Hero, e: Enemy, amount: number, angle: number, ability: Ability, knockOverride?: number,
  ): void {
    const p = hero.player;
    const step = ability.effects[0];
    const knock = knockOverride ?? (step?.kind === "damage" ? step.damage.knockback : undefined);
    const rr = rulesOnHit(this, hero, e, {
      isBasic: true,
      isCrit: false,
      movedRecently: Math.hypot(hero.avatar.vx, hero.avatar.vy) > 24,
      outOfReach: dist(hero.avatar.x, hero.avatar.y, e.x, e.y) > 96,
      amount,
    });
    // Roll unconditionally so a rule-forced crit never shifts the RNG stream.
    const crit = this.rng.chance(p.critChance) || rr.forceCrit;
    const rolled = amount * rr.damageMult * (crit ? p.critMultiplier : 1) * this.rng.range(0.92, 1.08);
    let dealt = this.damageEnemy(e, rolled, angle, "physical", {
      crit,
      knock: knock === undefined ? undefined : knock * (crit ? 1.5 : 1),
      source: hero,
    });

    // What landing a hit gives back, counted once per swing rather than per element.
    const life = p.mods.lifeOnHit + hero.avatar.buffLifeOnHit;
    if (life > 0) p.heal(life);
    if (p.mods.manaOnHit > 0) p.restoreMana(p.mods.manaOnHit);

    let ailmentInflicted = false;
    if (e.health > 0) {
      for (const [element, fraction] of Object.entries(p.elementalDamage) as [Element, number][]) {
        if (!fraction) continue;
        dealt += this.damageEnemy(e, rolled * fraction, angle, element, {
          ailment: this.ailmentChance(hero, AILMENT_CHANCE), knock: 0, source: hero,
        });
        ailmentInflicted = true;
        if (e.health <= 0) break;
      }
    }

    // Fill this hero's own meter for a landed basic attack, counted once per swing (not
    // per element). The swing carries the weapon family's pattern tags (`melee` / `slash`
    // / `thrust` / `heavy` / `projectile` / …), so a class whose generation gates on one
    // of those — Berserker/Monk base rage/chi and ultimate meter (`requireTags: ["melee"]`
    // / `["heavy"]`), or a tree node that explicitly makes basic attacks feed a resource
    // (Duelist Blood Price, Juggernaut Momentum of Mass, Corsair Press-Gang, …) — is fed
    // by the swing exactly as its spec intends. Tags that a plain swing never carries
    // (`charge`, `holy`, `mark`, `execute`, an elemental rider) still gain nothing here.
    // See docs/combat-cutover-plan.md §6b.1b for the measured meter-economy write-up.
    creditResourcesForHit(
      this.heroHost(hero),
      makeDamagePacket({
        amount: dealt, type: "physical", crit,
        source: { actorId: hero.index, actorKind: "hero", tags: ability.tags },
      }),
      dealt,
      { killed: e.health <= 0, ailmentInflicted },
    );
    this.fireTriggers(hero, "onHit", e.x, e.y);
  }

  /** Ailment odds after every modifier that improves them. Never above certain. */
  private ailmentChance(hero: Hero, base: number): number {
    if (base <= 0) return 0;
    return Math.min(1, base * (1 + hero.player.mods.ailmentChance));
  }

  /** How hard an ailment a hero inflicts bites, as a multiplier on its damage. */
  private ailmentPotency(hero: Hero): number {
    return 1 + hero.player.mods.ailmentPotency;
  }

  // --- casting abilities -------------------------------------------------

  /**
   * What the ability executor needs to know about the caster for one cast: where it is
   * aimed, which enemy is the "current target", and the damage / crit / cooldown numbers
   * the hero's build produces. Self-buff statuses fold their offensive contribution in
   * here so a Frenzy or a Blessed actually shows up on the skill that follows it.
   */
  private castInputFor(hero: Hero, ability?: Ability): CastInput {
    const p = hero.player;
    const a = hero.avatar;
    const bm = hero.sc.modsContribution();
    const reach = ability?.range && ability.range > 0 ? ability.range : 140;
    // A ground-placed ability (heal circle, acid pool, meteor mark) lands at the cursor
    // when we have one, clamped to the ability's own range so it still can't reach across
    // the room. Without a cursor (keyboard scheme, a remote player) it lands a fixed
    // distance ahead along the facing, as before.
    let aim: { x: number; y: number };
    if (hero.aimPoint) {
      const dx = hero.aimPoint.x - a.x;
      const dy = hero.aimPoint.y - a.y;
      const d = Math.hypot(dx, dy);
      aim = d <= reach || d === 0
        ? { x: hero.aimPoint.x, y: hero.aimPoint.y }
        : { x: a.x + (dx / d) * reach, y: a.y + (dy / d) * reach };
    } else {
      aim = { x: a.x + Math.cos(a.facing) * reach, y: a.y + Math.sin(a.facing) * reach };
    }
    const target = this.nearestEnemyTo(a.x, a.y, Math.max(reach, 700));
    const dmgBuff = 1 + bm.meleeDamage + bm.skillDamage;
    const ultMult = ability?.isUltimate ? p.ultimateMult * ULTIMATE_POWER : 1;
    return {
      aim,
      currentTargetId: target ? Dungeon.ENEMY_ID_BASE + target.id : undefined,
      cooldownMult: p.cooldownMult,
      attackDamage: p.attackDamage * dmgBuff * ultMult * SKILL_POWER,
      spellDamage: p.spellDamage * (1 + bm.skillDamage) * ultMult * SKILL_POWER,
      ailmentPotency: 1 + p.mods.ailmentPotency,
      critChance: p.critChance,
      positionHistory: hero.posHistory,
    };
  }

  /** Cast one of the three chosen abilities (slot 0-2) or the gear-granted one (slot 3). */
  private castSkill(hero: Hero, slot: number): void {
    if (hero.sc.disables().cast) return;
    const base = hero.player.activeAbilities[slot];
    if (!base) return;
    const ability = hero.player.resolvedAbility(base);
    if (!hero.rt.ready(ability)) return;
    const a = hero.avatar;
    const res = hero.rt.castAbility(this, hero.index, ability, this.castInputFor(hero, ability));
    if (!res.ok) {
      if (res.failure === "cannot-afford") {
        this.events.push({ kind: "pickup", x: a.x, y: a.y - 20, label: "no resource", color: "#60a5fa" });
      }
      return;
    }
    this.events.push({
      kind: "cast", x: a.x, y: a.y - 34, label: ability.name, color: hero.player.heroClass.color,
    });
    applyRuleFx(this.ruleContext(hero), ability);
    rulesOnCast(this, hero, ability);
  }

  /**
   * Spends a full ultimate meter. The ultimate is a normal `Ability` (`isUltimate`) cast
   * through the same executor as any skill; THE ULTIMATE RULE is enforced inside the
   * executor and the resource layer, so nothing it does can refill the meter.
   */
  useUltimate(hero: Hero = this.localHero): void {
    const p = hero.player;
    const a = hero.avatar;
    const base = p.ultimateAbility;
    const meter = hero.resources.ultimateMeter();
    if (!base || !meter || meter.fraction < 1) return;
    const ability = p.resolvedAbility(base);
    if (!hero.rt.ready(ability)) return;

    meter.value = 0;
    const res = hero.rt.castAbility(this, hero.index, ability, this.castInputFor(hero, ability));
    if (!res.ok) {
      meter.value = meter.max; // couldn't fire — hand the meter back
      return;
    }
    this.events.push({
      kind: "ultimate", id: ability.id, name: ability.name, color: p.heroClass.color, x: a.x, y: a.y,
    });
    this.events.push({ kind: "shake", amount: 14 });
    applyRuleFx(this.ruleContext(hero), ability);
    this.fireTriggers(hero, "onUltimate", a.x, a.y);
  }

  /** Context handed to the keystone/hybrid/archetype rule interpreter. */
  private ruleContext(hero: Hero): BuildRuleContext {
    return {
      rules: hero.player.build.rules,
      hero,
      emit: (ev) => this.events.push(ev),
      shake: (amount) => this.events.push({ kind: "shake", amount }),
    };
  }

  // --- totems -------------------------------------------------------------

  /** Plants a totem. It doesn't move, and it keeps working after you've left. */
  plantTotem(
    hero: Hero, x: number, y: number,
    opts: {
      damage: number; duration: number; interval: number;
      range: number; targets: number; element: Element; ailment: number;
    },
  ): void {
    const spot = resolveCircle(
      this.level,
      clamp(x, 24, this.width - 24),
      clamp(y, 24, this.height - 24),
      10,
    );
    const color = ELEMENT_COLORS[opts.element];
    this.totems.push({
      id: this.nextTotemId++,
      owner: hero.index,
      x: spot.x, y: spot.y, px: spot.x, py: spot.y, radius: 10,
      remaining: opts.duration,
      pulseTimer: 0.35,
      interval: opts.interval,
      damage: opts.damage,
      element: opts.element,
      range: opts.range,
      targets: opts.targets,
      ailment: opts.ailment,
      color,
    });
    this.events.push({ kind: "totem", x: spot.x, y: spot.y, color });
  }

  private updateTotems(dt: number): void {
    for (let i = this.totems.length - 1; i >= 0; i--) {
      const t = this.totems[i]!;
      t.remaining -= dt;
      if (t.remaining <= 0) {
        this.totems.splice(i, 1);
        continue;
      }
      t.pulseTimer -= dt;
      if (t.pulseTimer > 0) continue;
      t.pulseTimer += t.interval;
      // A totem keeps working for whoever planted it, kill credit and charge included.
      this.chainFrom(this.heroes[t.owner] ?? null, t.x, t.y, t.targets, t.range, t.damage, t.element, t.ailment, t.color);
    }
  }

  // --- minions -----------------------------------------------------------
  //
  // A minion is a totem that walks: it picks the nearest enemy, routes to it around
  // walls, hits it on a short telegraph, and can be killed or simply time out. Every
  // hit it lands goes through `damageEnemy(..., { source: owner })`, so kill credit,
  // ultimate charge and on-kill triggers all flow back to the hero who summoned it,
  // exactly as if they had swung themselves.

  private static readonly MINION_RADIUS = 7;

  /** Nearest living, non-spawning enemy to a point, within `maxDist` if given. */
  private nearestEnemyTo(x: number, y: number, maxDist = Infinity): Enemy | null {
    let best: Enemy | null = null;
    let bestGap = maxDist;
    for (const e of this.enemies) {
      if (e.health <= 0 || e.state === "spawning") continue;
      const gap = dist(x, y, e.x, e.y);
      if (gap <= bestGap) { best = e; bestGap = gap; }
    }
    return best;
  }

  private minionsOf(ownerIndex: number): Minion[] {
    return this.minions.filter((m) => m.owner === ownerIndex);
  }

  /** What a minion should be walking toward and hitting this tick, or null to idle. */
  private minionTarget(m: Minion): Enemy | null {
    switch (m.behavior) {
      case "commandTarget": {
        if (m.commandTargetId !== null) {
          const t = this.enemies.find((e) => e.id === m.commandTargetId && e.health > 0);
          if (t) return t;
          m.commandTargetId = null;
        }
        return this.nearestEnemyTo(m.x, m.y);
      }
      case "guardPoint":
        return this.nearestEnemyTo(m.guardX, m.guardY, MINION_GUARD_LEASH);
      case "aggroNearest":
        return this.nearestEnemyTo(m.x, m.y);
      case "follow":
      default: {
        const owner = this.heroes[m.owner];
        const from = owner ? owner.avatar : m;
        return this.nearestEnemyTo(from.x, from.y, MINION_LEASH);
      }
    }
  }

  private updateMinions(dt: number): void {
    for (const m of [...this.minions]) {
      if (m.health <= 0) continue;
      m.px = m.x;
      m.py = m.y;
      m.hitFlash = Math.max(0, m.hitFlash - dt);

      m.sc.tick(dt, { onDamage: (p) => this.dealDamage(Dungeon.MINION_ID_BASE + m.id, p) });
      if (m.health <= 0) continue;

      m.remaining -= dt;
      if (m.remaining <= 0) { this.despawnMinion(m, false); continue; }

      const disables = m.sc.disables();
      const slow = m.sc.slowMultiplier();
      const target = this.minionTarget(m);

      let goalX: number;
      let goalY: number;
      if (target) {
        goalX = target.x;
        goalY = target.y;
        m.facing = Math.atan2(target.y - m.y, target.x - m.x);
      } else if (m.behavior === "guardPoint") {
        goalX = m.guardX;
        goalY = m.guardY;
      } else {
        const owner = this.heroes[m.owner];
        goalX = owner ? owner.avatar.x : m.x;
        goalY = owner ? owner.avatar.y : m.y;
      }

      const gap = dist(m.x, m.y, goalX, goalY);
      const inReach = target !== null && gap <= m.attackRange + target.radius;

      if (!disables.move && !inReach && gap > 2) {
        let dir = normalize(goalX - m.x, goalY - m.y);
        const blocked = lineBlocked(this.level, m.x, m.y, goalX, goalY);
        if ((blocked || m.stuckTimer > 0.18) && target && this.minionFlow) {
          const routed = this.minionFlow.direction(this.level, m.x, m.y);
          if (routed) dir = routed;
          else if (m.stuckTimer > 0.22) {
            dir = normalize(
              Math.cos(m.facing + m.dodgeDir * 1.05),
              Math.sin(m.facing + m.dodgeDir * 1.05),
            );
          }
        }
        const speed = m.speed * slow;
        m.x += dir.x * speed * dt;
        m.y += dir.y * speed * dt;
      }

      m.x += m.knockX * dt;
      m.y += m.knockY * dt;
      m.knockX = approach(m.knockX, 0, 900 * dt);
      m.knockY = approach(m.knockY, 0, 900 * dt);

      m.x = clamp(m.x, m.radius + WALL_PAD, this.width - m.radius - WALL_PAD);
      m.y = clamp(m.y, m.radius + WALL_PAD, this.height - m.radius - WALL_PAD);
      const fixed = resolveCircle(this.level, m.x, m.y, m.radius);
      const shoved = Math.hypot(fixed.x - m.x, fixed.y - m.y) > 0.05;
      m.x = fixed.x;
      m.y = fixed.y;
      if (shoved) {
        m.stuckTimer += dt;
        if (m.stuckTimer > 1.6) { m.stuckTimer = 0; m.dodgeDir *= -1; }
      } else {
        m.stuckTimer = Math.max(0, m.stuckTimer - dt * 2);
      }

      m.attackTimer = Math.max(0, m.attackTimer - dt);
      if (m.windup > 0) {
        m.windup -= dt;
        if (m.windup <= 0 && target) {
          const owner = this.heroes[m.owner] ?? null;
          const angle = Math.atan2(target.y - m.y, target.x - m.x);
          this.damageEnemy(target, m.damage, angle, m.element, { source: owner });
        }
      } else if (!disables.attack && inReach && m.attackTimer <= 0) {
        m.windup = MINION_WINDUP;
        m.attackTimer = m.attackCooldown;
      }
    }
    this.separateMinions();
  }

  private separateMinions(): void {
    const list = this.minions;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= MINION_SEPARATION * MINION_SEPARATION || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (MINION_SEPARATION - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }

  /** Damage onto a minion — no armour or resists, they are cheap bodies. Returns dealt. */
  private hurtMinion(m: Minion, amount: number, element: Element): number {
    if (m.health <= 0) return 0;
    const dealt = Math.max(1, Math.round(amount));
    m.health -= dealt;
    m.hitFlash = 0.12;
    this.events.push({
      kind: "damage", x: m.x, y: m.y - m.radius, amount: dealt,
      crit: false, onPlayer: false, element,
    });
    if (m.health <= 0) this.despawnMinion(m, true);
    return dealt;
  }

  private despawnMinion(m: Minion, dead: boolean): void {
    const i = this.minions.indexOf(m);
    if (i < 0) return;
    this.minions.splice(i, 1);
    this.hostActors.delete(Dungeon.MINION_ID_BASE + m.id);
    if (dead) this.events.push({ kind: "death", x: m.x, y: m.y, elite: null });
    else this.events.push({ kind: "nova", x: m.x, y: m.y, radius: 12 });
  }

  private updateCorpses(dt: number): void {
    for (let i = this.corpsePile.length - 1; i >= 0; i--) {
      const c = this.corpsePile[i]!;
      c.remaining -= dt;
      if (c.remaining <= 0) this.corpsePile.splice(i, 1);
    }
  }

  private addCorpse(x: number, y: number): void {
    if (this.corpsePile.length >= 16) this.corpsePile.shift();
    this.corpsePile.push({ id: this.nextCorpseId++, x, y, remaining: 10 });
  }

  /**
   * Lightning-style hop from body to body. Skills, totems and triggered effects all
   * use it, so a wall saves a monster from every one of them in exactly the same way.
   */
  private chainFrom(
    source: Hero | null,
    x: number, y: number, hops: number, range: number,
    damage: number, element: Element, ailment: number, color: string,
  ): void {
    let fromX = x;
    let fromY = y;
    const hit = new Set<number>();
    for (let i = 0; i < hops; i++) {
      let best: Enemy | null = null;
      let bestGap = range;
      for (const e of this.enemies) {
        if (e.state === "spawning" || hit.has(e.id) || e.health <= 0) continue;
        const gap = dist(fromX, fromY, e.x, e.y);
        if (gap > bestGap) continue;
        if (lineBlocked(this.level, fromX, fromY, e.x, e.y)) continue;
        best = e;
        bestGap = gap;
      }
      if (!best) break;
      hit.add(best.id);
      this.events.push({ kind: "bolt", x1: fromX, y1: fromY, x2: best.x, y2: best.y, color });
      fromX = best.x;
      fromY = best.y;
      this.damageEnemy(best, damage, this.rng.angle(), element, { ailment, knock: 30, source });
    }
  }

  // --- triggered gear -------------------------------------------------------

  /**
   * Everything equipped that goes off on this kind of event. This is the payoff for a
   * legendary drop: the item plays itself, and the build starts doing things you never
   * pressed a key for.
   */
  private fireTriggers(hero: Hero, kind: TriggerKind, x: number, y: number): void {
    // A triggered nova that kills something must not set off the on-kill trigger that
    // sets off the nova again.
    if (this.inTrigger) return;
    for (const slot of EQUIP_SLOTS) {
      const trigger = hero.player.equipment[slot]?.trigger;
      if (!trigger || trigger.kind !== kind) continue;
      if (trigger.chance < 1 && !this.rng.chance(trigger.chance)) continue;
      this.inTrigger = true;
      try {
        this.resolveTrigger(hero, trigger, x, y);
      } finally {
        this.inTrigger = false;
      }
    }
  }

  private resolveTrigger(hero: Hero, t: TriggerSpec, x: number, y: number): void {
    const p = hero.player;
    const power = p.spellDamage * t.power;
    const color = ELEMENT_COLORS[t.element];
    const ailment = this.ailmentChance(hero, 0.6);
    switch (t.effect) {
      case "nova": {
        const radius = t.radius * p.areaMult;
        this.events.push({ kind: "boom", x, y, radius, color });
        for (const e of [...this.enemies]) {
          if (e.state === "spawning" || e.health <= 0) continue;
          if (dist(x, y, e.x, e.y) > radius + e.radius) continue;
          this.damageEnemy(e, power, Math.atan2(e.y - y, e.x - x), t.element, { ailment, source: hero });
        }
        break;
      }
      case "bolt": {
        for (let i = 0; i < t.count; i++) {
          const angle = hero.avatar.facing + (i - (t.count - 1) / 2) * 0.32;
          this.projectiles.push({
            x, y, px: x, py: y, radius: t.radius,
            vx: Math.cos(angle) * 420, vy: Math.sin(angle) * 420,
            damage: power, friendly: true, life: 1.1, color, element: t.element,
            pierce: 1, hits: new Set(), ailment, basic: false, owner: hero.index,
          });
        }
        break;
      }
      case "chain":
        this.chainFrom(hero, x, y, t.count, t.radius * p.areaMult, power, t.element, ailment, color);
        break;
    }
  }

  // --- skills -------------------------------------------------------------

  /** True if the slot holds an ability that's off cooldown and affordable right now. */
  canCast(slot: number, hero: Hero = this.localHero): boolean {
    const base = hero.player.activeAbilities[slot];
    if (!base) return false;
    if (!hero.rt.ready(base)) return false;
    for (const c of base.costs ?? []) {
      const pool = hero.resources.get(c.resource);
      if (!pool || !pool.canAfford(c.amount)) return false;
    }
    return true;
  }

  /**
   * Moves the avatar up to `reach` along `angle`, stopping short of anything solid.
   * Stepping rather than teleporting is what keeps a leap from putting you inside a
   * wall on a floor full of pillars.
   */
  private leapTo(hero: Hero, angle: number, reach: number): { x: number; y: number } {
    const a = hero.avatar;
    const step = 12;
    let x = a.x;
    let y = a.y;
    for (let travelled = 0; travelled < reach; travelled += step) {
      const nx = clamp(x + Math.cos(angle) * step, a.radius + WALL_PAD, this.width - a.radius - WALL_PAD);
      const ny = clamp(y + Math.sin(angle) * step, a.radius + WALL_PAD, this.height - a.radius - WALL_PAD);
      if (circleHitsWall(this.level, nx, ny, a.radius)) break;
      x = nx;
      y = ny;
    }
    a.x = x;
    a.y = y;
    // A leap is a commitment, so it comes with the same window a dash does.
    a.invulnTimer = Math.max(a.invulnTimer, 0.2);
    return { x, y };
  }

  private drinkPotion(hero: Hero): void {
    const p = hero.player;
    if (hero.potions <= 0) return;
    if (p.health >= p.maxHealth && p.mana >= p.maxMana) return;
    hero.potions--;
    const healed = p.heal(p.maxHealth * POTION_HEAL);
    p.restoreMana(p.maxMana * POTION_MANA);
    this.events.push({
      kind: "pickup", x: hero.avatar.x, y: hero.avatar.y,
      label: `+${Math.round(healed)} HP`, color: "#4ade80",
    });
  }

  /**
   * Mining. Planet floors only: stand on an unspent node and press confirm to pay out
   * once, the same key that opens a portal — the two never overlap in practice, and
   * `wasPressed` is a per-tick latch, so both can read it without stealing it from
   * each other.
   */
  private updateResourceNodes(hero: Hero, input: AvatarInput): void {
    const planet = this.config.planet?.spec;
    if (!planet || !input.wasPressed("confirm")) return;
    const a = hero.avatar;
    for (const node of this.level.resourceNodes) {
      if (node.depleted) continue;
      if (dist(a.x, a.y, node.x, node.y) > node.radius + a.radius + 8) continue;
      node.depleted = true;
      const amount = Math.round(
        this.rng.range(3, 6) * planet.materialYield * challengerRewardMult(this.config.challengerTier));
      hero.loot.materials[planet.element] += amount;
      this.events.push({
        kind: "pickup", x: node.x, y: node.y,
        label: `+${amount} ${MATERIAL_NAMES[planet.element]}`, color: ELEMENT_COLORS[planet.element],
      });
      this.events.push({ kind: "nova", x: node.x, y: node.y, radius: 24 });
      break;
    }
  }

  // --- damage -------------------------------------------------------------

  /**
   * Every point of damage a monster takes goes through here. `raw` skips mitigation,
   * which is what ailment ticks use — they were already mitigated when they landed.
   */
  private damageEnemy(
    e: Enemy,
    amount: number,
    knockAngle: number,
    element: Element = "physical",
    opts: {
      crit?: boolean; ailment?: number; knock?: number; raw?: boolean;
      /** Who gets the kill, the charge and the on-kill triggers. */
      source?: Hero | null;
      /** The hit that caused this was ultimate-sourced — no meter credit for the kill. */
      fromUltimate?: boolean;
    } = {},
  ): number {
    if (e.health <= 0) return 0;
    const amplified = amount * e.sc.incomingDamageMultiplier();
    const mitigated = opts.raw ? amount : mitigateWithResists(amplified, element, e.resists);
    const dealt = Math.max(1, Math.round(mitigated));
    e.health -= dealt;
    e.hitFlash = 0.12;

    const knock = (opts.knock ?? (opts.crit ? 190 : 120)) * e.knockResist;
    e.knockX += Math.cos(knockAngle) * knock;
    e.knockY += Math.sin(knockAngle) * knock;
    this.events.push({
      kind: "damage", x: e.x, y: e.y - e.radius, amount: dealt,
      crit: opts.crit ?? false, onPlayer: false, element,
    });

    // Anything with no obvious author — a hazard, an ailment tick — is credited to
    // whoever is standing closest, which in a solo dive is always the only hero there.
    const source = opts.source ?? this.nearestHero(e.x, e.y);
    if (opts.source) {
      this.bus.emit({
        type: opts.crit ? "criticalHit" : "hit",
        actorId: source.index,
        targetId: Dungeon.ENEMY_ID_BASE + e.id,
        x: e.x, y: e.y,
      });
    }
    const ailment = STATUS_FOR_ELEMENT[element];
    if (ailment && opts.ailment && this.rng.chance(opts.ailment)) {
      e.sc.apply(ailment, {
        hitDamage: dealt, potency: this.ailmentPotency(source),
        sourceActorId: source.index, chance: 1, roll: () => this.rng.next(),
      });
    }
    if (e.health <= 0) this.killEnemy(e, source, opts.fromUltimate ?? false);
    return dealt;
  }

  /**
   * Feed an indirect hit — a skill projectile or a damage-zone tick — back into the
   * firing hero's resources. `damageEnemy` handles those hits but knows nothing about
   * `src/combat`, so this closes the loop: `packet.source` carries the ability's tags
   * (so `requireTags` generation fires) and its `fromUltimate` flag (so THE ULTIMATE
   * RULE holds, enforced inside `creditResourcesForHit`). `sawAilment` is whether this
   * hit newly landed the element's ailment, for `on: "ailmentInflicted"` rules.
   */
  private creditIndirectHit(packet: DamagePacket | undefined, e: Enemy, dealt: number, sawAilment: boolean): void {
    if (!packet || dealt <= 0) return;
    const hero = this.heroByHostId(packet.source.actorId);
    if (!hero) return;
    creditResourcesForHit(this.heroHost(hero), { ...packet, amount: dealt }, dealt, {
      killed: e.health <= 0,
      ailmentInflicted: sawAilment,
    });
  }

  private killEnemy(e: Enemy, source: Hero, fromUltimate = false): void {
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);

    if (e.boss) {
      this.boss = null;
      this.state.stats.bossesKilled++;
      this.events.push({ kind: "bossDown", x: e.x, y: e.y });
      this.events.push({ kind: "shake", amount: 22 });
      // The adds were the boss's, not the floor's. They leave with it.
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (this.enemies[i]!.summoned) this.enemies.splice(i, 1);
      }
      // Anything still winding up belonged to the encounter too.
      this.telegraphs.length = 0;
    }

    // A body for the corpse economy — Necromancer fuel. Bosses leave nothing to raise.
    if (!e.boss) this.addCorpse(e.x, e.y);

    source.loot.kills++;
    if (source.local) this.state.stats.enemiesKilled++;
    // Kill / death events for granted effects and gear triggers. The killing blow's own
    // contribution to the meter is credited by `creditResourcesForHit` at the hit that
    // landed it (so THE ULTIMATE RULE holds); this adds the "an elite is worth several
    // ordinary kills" bonus the legacy charge economy had — never from an ultimate kill.
    this.bus.emit({ type: "kill", actorId: source.index, x: e.x, y: e.y });
    this.bus.emit({ type: "enemyDeath", actorId: Dungeon.ENEMY_ID_BASE + e.id, x: e.x, y: e.y });
    if (!fromUltimate) {
      const bonus = e.boss ? 5 : e.elite ? 2 : 0;
      for (let n = 0; n < bonus; n++) {
        source.resources.broadcast({ type: "kill" });
        source.resources.broadcast({ type: "enemyDeath" });
      }
    }
    this.fireTriggers(source, "onKill", e.x, e.y);
    rulesOnKill(this, source, e);
    source.player.restoreMana(source.player.maxMana * MANA_ON_KILL * (e.boss ? 8 : e.elite ? 3 : 1));
    this.events.push({ kind: "death", x: e.x, y: e.y, elite: e.elite });

    // Summoned chaff exists to pressure you during a fight, not to pay for it.
    if (e.summoned) return;

    const quantity = this.profile.quantity;
    const lootMult = e.archetype.lootWeight * (e.elite ? 1 + rarityIndex(e.elite) * 0.8 : 1)
      * (e.boss ? 2.2 : 1);
    const trashMult = e.boss || e.elite ? 1 : TRASH_REWARD_MULT;

    // XP is granted straight away — it's the one thing death doesn't take from you —
    // and in a party everybody gets the full amount rather than a split. Nobody should
    // ever be annoyed that a friend got the last hit.
    const xp = Math.round(xpDropFor(this.profile) * e.archetype.xp * trashMult * this.rng.range(0.9, 1.1));
    for (const hero of this.heroes) {
      hero.loot.xp += xp;
      hero.xpPending += xp;
      const levels = hero.player.gainXp(xp);
      if (levels > 0) this.events.push({ kind: "levelUp", levels, owner: hero.index });
    }

    const coins = Math.round(coinDropFor(this.profile) * lootMult * quantity * trashMult * this.rng.range(0.8, 1.25));
    this.dropPickup(e.x, e.y, { kind: "coin", value: coins });

    // Keys are the bridge back to the chest gambling. A dive should fund a couple of
    // pulls, not a spree — the chests are the slot machine, not the payout.
    const keyChance = clamp((0.075 + lootMult * 0.014) * this.config.mode.keyMult * trashMult, 0, 0.5);
    if (e.boss || this.rng.chance(keyChance)) {
      const tier = keyDropTier(this.profile.depth, this.rng.next());
      this.dropPickup(e.x, e.y, { kind: "key", keyTier: tier });
    }

    // Gems. A thin, steady trickle on ordinary monsters and a real handful off a boss —
    // enough that a wardrobe fills over a few dozen floors without ever competing with
    // coins for the same drop slot.
    const gemChance = clamp((0.09 + lootMult * 0.02) * this.config.mode.gemMult * trashMult, 0, 0.45);
    if (e.boss) {
      this.dropPickup(e.x, e.y, { kind: "gem", value: Math.round((14 + this.profile.depth * 1.2) * this.config.mode.gemMult) });
    } else if (this.rng.chance(gemChance)) {
      this.dropPickup(e.x, e.y, { kind: "gem", value: this.rng.int(1, 2 + Math.floor(this.profile.depth / 5)) });
    }

    // Materials — a planet's whole reason to exist. Every kill has a shot at one, a
    // boss always pays out a real handful.
    if (this.config.planet) {
      const yieldMult = this.config.planet.spec.materialYield;
      const materialChance = clamp(0.15 + lootMult * 0.03, 0, 0.55) * trashMult;
      if (e.boss || this.rng.chance(materialChance)) {
        const amount = Math.round(
          this.rng.range(2, 5) * yieldMult * (e.boss ? 5 : 1) * challengerRewardMult(this.config.challengerTier));
        this.dropPickup(e.x, e.y, { kind: "material", value: amount, element: this.config.planet.spec.element });
      }
    }

    if (this.rng.chance((0.02 + lootMult * 0.004) * quantity * trashMult)) {
      this.dropPickup(e.x, e.y, { kind: "potion" });
    }

    // Direct gear drops. Elites and bosses roll several, weighted deeper by floor.
    const rolls = e.boss
      ? Math.round(4 * quantity)
      : e.elite
        ? (this.rng.chance(0.3 * quantity) ? 2 : 1)
        : this.rng.chance(clamp((0.07 + lootMult * 0.025) * quantity * trashMult, 0, 0.45)) ? 1 : 0;
    const bias = this.profile.rarityBias;
    for (let i = 0; i < rolls; i++) {
      const boost = (e.elite ? rarityIndex(e.elite) * 2 : 0) + (e.boss ? 5 : 0);
      const rarity = this.rng.weighted(depthWeights(this.profile.depth + boost, bias));
      const item = rollItem({
        rarity,
        type: randomItemType(this.rng, source.player.heroClass.affinity),
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
    const quantity = this.profile.quantity;
    // The last floor of a rift pays for the whole rift, which is what makes bailing
    // out of one at floor three hurt.
    const finale = this.config.lastFloor ? 2.4 : 1;

    const coins = Math.round(coinDropFor(this.profile) * 9 * quantity * finale * this.rng.range(0.9, 1.15));
    this.dropPickup(x, y, { kind: "coin", value: coins });

    const drops = Math.max(1, Math.round(quantity * finale));
    for (let i = 0; i < drops; i++) {
      const rarity = this.rng.weighted(depthWeights(this.profile.depth + 2, this.profile.rarityBias));
      const item = rollItem({
        rarity,
        type: randomItemType(this.rng, this.player.heroClass.affinity),
        ilvl: this.profile.depth,
        rng: this.rng,
      });
      this.dropPickup(x, y, { kind: "item", item, rarity });
    }

    const gems = Math.round((8 + this.profile.depth * 0.9) * this.config.mode.gemMult * finale);
    if (gems > 0) this.dropPickup(x, y, { kind: "gem", value: gems });

    if (this.config.planet) {
      const yieldMult = this.config.planet.spec.materialYield;
      const materials = Math.round(
        (6 + this.profile.depth * 0.4) * yieldMult * finale * challengerRewardMult(this.config.challengerTier));
      if (materials > 0) {
        this.dropPickup(x, y, { kind: "material", value: materials, element: this.config.planet.spec.element });
      }
    }

    const keys = Math.round(this.config.mode.keyMult * finale);
    for (let i = 0; i < keys; i++) {
      if (i > 0 || this.rng.chance(0.7)) {
        this.dropPickup(x, y, { kind: "key", keyTier: keyDropTier(this.profile.depth, this.rng.next()) });
      }
    }
    if (this.rng.chance(0.5)) this.dropPickup(x, y, { kind: "potion" });
  }

  private dropPickup(
    x: number, y: number,
    opts: {
      kind: Pickup["kind"]; value?: number; item?: Item; keyTier?: string; rarity?: Rarity;
      element?: Element;
    },
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
      element: opts.element ?? null,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      magnet: false,
    });
  }

  // --- monsters -----------------------------------------------------------

  private updateEnemies(dt: number): void {
    // Snapshot: an ailment tick can kill something mid-loop and splice the live list.
    for (const e of [...this.enemies]) {
      if (e.health <= 0) continue;
      e.px = e.x;
      e.py = e.y;
      e.hitFlash = Math.max(0, e.hitFlash - dt);

      e.sc.tick(dt, { onDamage: (p) => this.dealDamage(Dungeon.ENEMY_ID_BASE + e.id, p) });
      if (e.health <= 0) continue;
      if (e.sc.disables().move && e.sc.disables().attack) {
        // Frozen / stunned: it stands there and takes it until the CC runs out.
        e.px = e.x; e.py = e.y;
        continue;
      }

      if (e.state === "spawning") {
        e.spawnTimer -= dt;
        if (e.spawnTimer <= 0) e.state = "active";
        continue;
      }

      // Everything chases whoever is nearest to it, which is all the "aggro" a horde
      // shooter needs: bodies flow to the nearest player and the party gets split up
      // exactly as much as it deserves to be.
      const target = this.nearestHero(e.x, e.y);
      const a = target.avatar;
      const d = dist(e.x, e.y, a.x, a.y);
      const toPlayer = Math.atan2(a.y - e.y, a.x - e.x);
      e.facing = toPlayer;

      // The boss brain owns its own movement whenever it's casting or charging.
      const bossBusy = e.boss ? updateBoss(this, e, dt) : false;

      // With a wall in the way nothing holds its ground: ranged types reposition for a
      // shot and everything else takes the long way around, instead of standing there.
      const hasLos = !lineBlocked(this.level, e.x, e.y, a.x, a.y);

      // Ranged types hold a standoff distance; melee types close.
      let moveAngle = toPlayer;
      let move = !bossBusy;
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

      if (e.sc.disables().move) move = false;

      if (move) {
        const speed = e.speed * this.mireSlowAt(e.x, e.y) * e.sc.slowMultiplier();
        // With a clear line, charge straight in; otherwise follow the route around.
        let dir = normalize(Math.cos(moveAngle), Math.sin(moveAngle));
        if (!hasLos || e.stuckTimer > 0.18) {
          const routed = target.flow?.direction(this.level, e.x, e.y) ?? null;
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

      // A boss's auto-attack is the least of your problems, but standing in melee of
      // one should still cost something.
      e.attackTimer -= dt;
      if (!bossBusy && e.attackTimer <= 0 && e.windup <= 0 && d <= e.archetype.attackRange && hasLos) {
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
        // A boss doesn't get shoved around by its own adds.
        const push = (minDist - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        const aShare = a.boss ? 0 : b.boss ? 2 : 1;
        const bShare = b.boss ? 0 : a.boss ? 2 : 1;
        a.x -= nx * push * aShare; a.y -= ny * push * aShare;
        b.x += nx * push * bShare; b.y += ny * push * bShare;
      }
    }
  }

  private resolveEnemyAttack(e: Enemy): void {
    const target = this.nearestHero(e.x, e.y);
    const a = target.avatar;
    if (e.archetype.ranged) {
      const angle = Math.atan2(a.y - e.y, a.x - e.x);
      this.spawnEnemyBolt(e.x, e.y, angle, 210, e.damage, e.element, AILMENT_CHANCE);
      return;
    }
    if (dist(e.x, e.y, a.x, a.y) <= e.archetype.attackRange + e.radius * 0.5) {
      this.hurtPlayer(target, e.damage, e.element, AILMENT_CHANCE);
    }
  }

  /** A hostile projectile. Bosses and turrets both come through here. */
  spawnEnemyBolt(
    x: number, y: number, angle: number, speed: number,
    damage: number, element: Element, ailment = AILMENT_CHANCE,
  ): void {
    this.projectiles.push({
      x, y, px: x, py: y, radius: 5,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      damage, friendly: false, life: 4,
      color: ELEMENT_COLORS[element],
      element, pierce: 0, hits: new Set(), ailment, basic: false, owner: -1,
    });
  }

  // --- taking it ----------------------------------------------------------

  /** A dodgeable hit: respects invulnerability, and grants a window after it lands. */
  private hurtPlayer(hero: Hero, amount: number, element: Element = "physical", ailment = 0): void {
    const a = hero.avatar;
    if (a.invulnTimer > 0) return;
    a.invulnTimer = HIT_INVULN;
    const rolled = this.rollAvoidance(hero, amount);
    if (rolled === null) return; // evaded outright
    if (rolled < amount) ailment *= 0.5; // a blocked hit is less likely to land its rider
    // Keystone / hybrid damage-taken rules (Soul Skin, Immovable, One Opponent, …).
    const final = hero.player.build.rules.size > 0
      ? rulesOnDamageTaken(this, hero, rolled)
      : rolled;
    if (final <= 0) return;
    this.applyPlayerDamage(hero, final, element, ailment);
  }

  /**
   * The avoid-the-hit layer, rolled only on an ordinary dodgeable hit (`hurtPlayer`) —
   * never a boss mechanic and never a DoT tick. Evasion first: the hit is avoided
   * outright (returns `null`, fires `dodge`). Then block: the hit lands at
   * `BLOCK_MITIGATION` (returns the reduced amount, fires `block`). Chances are summed
   * from the class base, the resolved build, and any active guard status
   * (`sword_parry` carries `blockChance` in its `mods`), then clamped to the caps.
   * This is where Duelist's whole meter and the Counterblade / Sentinel `{ on: "block" }`
   * nodes actually get fed.
   */
  private rollAvoidance(hero: Hero, amount: number): number | null {
    const bm = hero.sc.modsContribution();
    const m = hero.player.mods;
    const a = hero.avatar;
    const evtBase = { maxHealth: hero.player.maxHealth };

    const evade = clamp(m.evasion + bm.evasion, 0, EVASION_CAP);
    if (evade > 0 && this.defenseRng.chance(evade)) {
      hero.resources.broadcast({ type: "dodge", ...evtBase });
      this.events.push({ kind: "pickup", x: a.x, y: a.y - 24, label: "dodge", color: "#c4b5fd" });
      rulesOnAvoid(this, hero, "dodge");
      return null;
    }

    const block = clamp(m.blockChance + bm.blockChance, 0, BLOCK_CHANCE_CAP);
    if (block > 0 && this.defenseRng.chance(block)) {
      const turned = amount * (1 - BLOCK_MITIGATION);
      hero.resources.broadcast({ type: "block", damage: turned, ...evtBase });
      this.events.push({ kind: "pickup", x: a.x, y: a.y - 24, label: "block", color: "#93c5fd" });
      rulesOnAvoid(this, hero, "block");
      return amount - turned;
    }

    return amount;
  }

  /**
   * A resolved boss mechanic. It goes through the invulnerability you get from being
   * hit — otherwise a clip from an add would eat a slam you stood in for a second and
   * a half — but a dash still beats it outright, and it leaves a short window so two
   * mechanics landing together don't simply delete you.
   */
  private hurtPlayerMechanic(hero: Hero, amount: number, element: Element, ailment: number): void {
    const a = hero.avatar;
    if (a.dashInvuln > 0) return;
    a.invulnTimer = Math.max(a.invulnTimer, HIT_INVULN * 0.5);
    this.applyPlayerDamage(hero, amount, element, ailment);
  }

  /**
   * Damage that ignores invulnerability frames: ailment ticks and burning ground.
   * A dash gets you out of the fire, it doesn't make the fire safe.
   */
  private hurtPlayerRaw(hero: Hero, amount: number, element: Element = "physical", ailment = 0): void {
    this.applyPlayerDamage(hero, amount, element, ailment);
  }

  private applyPlayerDamage(hero: Hero, amount: number, element: Element, ailment: number): number {
    if (hero.downed) return 0;
    const a = hero.avatar;
    const p = hero.player;

    // A Guardian's Oath / Fortress Call binding hands a slice of this hit to whoever
    // swore to soak it, before the ward hero's own mitigation runs on the rest.
    const bind = this.redirects.get(hero.index);
    if (bind && !this.inRedirect) {
      if (this.elapsed >= bind.until) {
        this.redirects.delete(hero.index);
      } else {
        const protector = this.heroes[bind.protector];
        if (protector && !protector.downed) {
          const moved = amount * bind.fraction;
          amount -= moved;
          this.inRedirect = true;
          try { this.applyPlayerDamage(protector, moved, element, 0); }
          finally { this.inRedirect = false; }
        }
      }
    }
    // The ward eats damage before health does, and counts as resistance while it holds.
    const extraResist = hero.ward > 0 ? WARD_RESIST : 0;
    let incoming = p.mitigate(amount, element, extraResist);

    if (hero.ward > 0) {
      const absorbed = Math.min(hero.ward, incoming);
      hero.ward -= absorbed;
      incoming -= absorbed;
      this.events.push({
        kind: "damage", x: a.x, y: a.y - 22, amount: Math.round(absorbed),
        crit: false, onPlayer: true, element: "void",
      });
      if (hero.ward <= 0) hero.wardTimer = 0;
    }

    const prevented = Math.round(amount) - Math.round(incoming);
    let dealt = Math.round(incoming);
    // A death-guard status (Berserker's Last Stand, Paladin's Last Light) holds the
    // bearer at 1 HP for as long as it is active — the window is the duration, not one
    // hit, so it is not consumed here. Raid note (§4): a 20-player raid wants a
    // single-source rule so a chain of Last Lights can't be permanent; at 4-player it's
    // a non-issue and left as-is.
    if (dealt >= p.health && hero.sc.deathGuarded) {
      dealt = Math.max(0, Math.round(p.health) - 1);
    }
    if (dealt > 0) {
      p.health = Math.max(0, p.health - dealt);
      a.hitFlash = 0.25;
      this.retaliate(hero);
      this.events.push({ kind: "damage", x: a.x, y: a.y - 14, amount: dealt, crit: false, onPlayer: true, element });
      this.events.push({ kind: "shake", amount: clamp(dealt / 8, 2, 12) });
    }

    // Getting hurt — and stopping a hit — is how several classes fill their meter
    // (Berserker's Rage, Paladin's Conviction, the Juggernaut).
    const evtBase = { maxHealth: p.maxHealth };
    hero.resources.broadcast({ type: "hitTaken", damage: dealt, ...evtBase });
    if (dealt > 0) hero.resources.broadcast({ type: "damageTaken", damage: dealt, ...evtBase });
    if (prevented > 0) hero.resources.broadcast({ type: "damagePrevented", damage: prevented, ...evtBase });

    const kind = STATUS_FOR_ELEMENT[element];
    if (kind && ailment > 0 && this.rng.chance(ailment)) {
      hero.sc.apply(kind, { hitDamage: Math.max(1, dealt), sourceActorId: -1, chance: 1, roll: () => this.rng.next() });
    }

    if (!p.isAlive) this.downHero(hero);
    return dealt;
  }

  /**
   * Out of health. Solo, that ends the run on the spot exactly as it always did. In a
   * party you're down rather than out until an ally reaches you — but if the last one
   * standing falls, the whole party loses the floor together, unbanked loot included.
   */
  private downHero(hero: Hero): void {
    if (hero.downed) return;
    hero.downed = true;
    hero.reviveProgress = 0;
    hero.avatar.vx = 0;
    hero.avatar.vy = 0;
    // Ailments are cleared when they get back up, not here — an ailment tick is often
    // the very thing that downed them, and it is still walking this list.
    if (hero.local) this.state.stats.deaths++;
    this.events.push({ kind: "playerDied", owner: hero.index });
    if (this.heroes.every((h) => h.downed)) this.phase = "dead";
  }

  /**
   * Spikes. Everything close enough to have plausibly been the thing that hit you
   * takes a piece of it back — we don't track who dealt the damage, and for a wall of
   * bodies pressed against you the answer is "all of them" anyway.
   */
  private retaliate(hero: Hero): void {
    const thorns = hero.player.mods.thorns;
    if (thorns <= 0) return;
    const a = hero.avatar;
    for (const e of [...this.enemies]) {
      if (e.state === "spawning" || e.health <= 0) continue;
      if (dist(a.x, a.y, e.x, e.y) > THORNS_RANGE + e.radius) continue;
      this.damageEnemy(e, thorns, Math.atan2(e.y - a.y, e.x - a.x), "physical", { knock: 20, source: hero });
    }
  }

  private updateProjectiles(dt: number): void {
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
        let spent = false;
        for (const e of [...this.enemies]) {
          if (e.state === "spawning" || e.health <= 0 || p.hits.has(e.id)) continue;
          if (!circlesOverlap(p.x, p.y, p.radius, e.x, e.y, e.radius)) continue;
          p.hits.add(e.id);
          const angle = Math.atan2(p.vy, p.vx);
          const owner = this.heroes[p.owner] ?? null;
          // A staff bolt *is* your attack, so it earns crits, leech and triggers.
          if (p.basic && owner) {
            this.weaponStrike(owner, e, p.damage, angle, weaponAbilityFor(owner.player.weaponFamily), 60);
          } else {
            const ail = STATUS_FOR_ELEMENT[p.element];
            const hadAil = ail ? e.sc.has(ail) : false;
            const dealt = this.damageEnemy(e, p.damage, angle, p.element, { ailment: p.ailment, source: owner });
            // A skill bolt feeds the caster's resources; a basic bolt already did, above.
            this.creditIndirectHit(p.packet, e, dealt, !!ail && !hadAil && e.sc.has(ail));
          }
          if (p.hits.size > p.pierce) { spent = true; break; }
        }
        if (spent) this.projectiles.splice(i, 1);
      } else {
        // A hostile bolt hits the first member of the party it runs into.
        const struck = this.heroes.find(
          (h) => h.alive && circlesOverlap(p.x, p.y, p.radius, h.avatar.x, h.avatar.y, h.avatar.radius));
        if (struck) {
          this.hurtPlayer(struck, p.damage, p.element, p.ailment);
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  private updatePickups(dt: number): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]!;
      p.px = p.x;
      p.py = p.y;
      p.life += dt;

      // Drops belong to whoever gets there first, which is the oldest and least
      // complicated loot rule there is. It pulls toward the nearest living hero.
      const claimant = this.nearestHero(p.x, p.y);
      const a = claimant.avatar;
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
        this.collect(claimant, p);
        this.pickups.splice(i, 1);
      }
    }
  }

  private collect(hero: Hero, p: Pickup): void {
    switch (p.kind) {
      case "coin":
        hero.loot.coins += p.value;
        this.events.push({ kind: "pickup", x: p.x, y: p.y, label: `+${p.value}`, color: "#fbbf24" });
        break;
      case "key":
        if (p.keyTier) {
          hero.loot.keys[p.keyTier as ChestTier]++;
          this.events.push({ kind: "pickup", x: p.x, y: p.y, label: `${p.keyTier} Key`, color: "#e2e8f0" });
        }
        break;
      case "gem":
        hero.loot.gems += p.value;
        this.events.push({ kind: "pickup", x: p.x, y: p.y, label: `+${p.value} gems`, color: "#f0abfc" });
        break;
      case "material":
        if (p.element) {
          hero.loot.materials[p.element] += p.value;
          this.events.push({
            kind: "pickup", x: p.x, y: p.y,
            label: `+${p.value} ${MATERIAL_NAMES[p.element]}`, color: ELEMENT_COLORS[p.element],
          });
        }
        break;
      case "potion":
        hero.potions++;
        this.events.push({ kind: "pickup", x: p.x, y: p.y, label: "Potion", color: "#4ade80" });
        break;
      case "item":
        if (p.item) {
          hero.loot.items.push(p.item);
          hero.itemsPending.push(p.item);
          if (hero.local) this.state.stats.raritiesFound[p.item.rarity]++;
          this.events.push({ kind: "loot", x: p.x, y: p.y, item: p.item, owner: hero.index });
        }
        break;
      case "xp":
        break;
    }
  }

  // --- run outcomes -------------------------------------------------------

  /** Name of the ability the boss is winding up, for the boss frame. Empty if none. */
  get bossCastLabel(): string {
    const b = this.boss?.boss;
    if (!b || !b.ability) return "";
    return BOSS_ABILITIES[b.ability].name;
  }

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

  /** The unspent resource node the player is close enough to mine, if any — HUD prompt only. */
  get activeResourceNode(): ResourceNode | null {
    if (!this.config.planet) return null;
    const a = this.avatar;
    for (const node of this.level.resourceNodes) {
      if (node.depleted) continue;
      if (dist(a.x, a.y, node.x, node.y) <= node.radius + a.radius + 8) return node;
    }
    return null;
  }

  /**
   * Moves this floor's loot into the persistent save. Called on extract or descend.
   *
   * It banks the *local* hero's share and nobody else's, which is exactly right in both
   * directions: in a party every player runs this on their own machine against their own
   * save, and the host's copy of a friend's character is never written anywhere.
   */
  bankLoot(): void {
    this.state.potions = this.localHero.potions;
    this.state.addCoins(this.loot.coins);
    this.state.addGems(this.loot.gems);
    for (const t of CHEST_TIERS) this.state.keys[t] += this.loot.keys[t];
    for (const e of ELEMENTS) {
      if (this.loot.materials[e] > 0) this.state.addMaterials(e, this.loot.materials[e]);
    }
    this.state.addToInventory(this.loot.items);
    this.state.recordDepth(this.profile.depth, this.config);
    this.state.stats.runsCompleted++;
    this.loot.coins = 0;
    this.loot.gems = 0;
    this.loot.items = [];
    this.loot.keys = emptyKeys();
    this.loot.materials = emptyMaterials();
  }

  drainEvents(): RunEvent[] {
    return this.events.splice(0, this.events.length);
  }

  // --- CombatHost: the seam the src/combat ability executor talks to ---------
  //
  // The executor (`AbilityRuntime.castAbility` + `runEffect`) never touches the
  // dungeon's arrays directly — it asks a `CombatHost` to deal a packet, spawn a
  // projectile, move a body. This block is that host, implemented against the same
  // entity arrays the legacy `castSkill` switch uses. Skills and ultimates move onto
  // it in a later cutover stage; for now it exists, compiles and is exercised by the
  // headless tests, but the live dungeon still runs the legacy paths.

  /** Host id space: heroes 0..3, enemies 1_000_000+id, minions 2_000_000+id. */
  private static readonly ENEMY_ID_BASE = 1_000_000;
  private static readonly MINION_ID_BASE = 2_000_000;

  now(): number {
    return this.elapsed;
  }

  random(): number {
    return this.rng.next();
  }

  private heroByHostId(id: number): Hero | undefined {
    return id >= 0 && id < Dungeon.ENEMY_ID_BASE ? this.heroes[id] : undefined;
  }

  private enemyByHostId(id: number): Enemy | undefined {
    if (id < Dungeon.ENEMY_ID_BASE || id >= Dungeon.MINION_ID_BASE) return undefined;
    const realId = id - Dungeon.ENEMY_ID_BASE;
    return this.enemies.find((e) => e.id === realId);
  }

  private minionByHostId(id: number): Minion | undefined {
    if (id < Dungeon.MINION_ID_BASE) return undefined;
    const realId = id - Dungeon.MINION_ID_BASE;
    return this.minions.find((m) => m.id === realId);
  }

  private heroHost(hero: Hero): HostActor {
    const existing = this.hostActors.get(hero.index);
    if (existing) return existing;
    const host: HostActor = {
      id: hero.index,
      kind: "hero",
      faction: "player",
      statuses: hero.sc,
      resources: hero.resources,
      get x() { return hero.avatar.x; },
      get y() { return hero.avatar.y; },
      get health() { return hero.player.health; },
      get maxHealth() { return hero.player.maxHealth; },
      get alive() { return !hero.downed; },
    };
    this.hostActors.set(hero.index, host);
    return host;
  }

  private enemyHost(e: Enemy): HostActor {
    const hostId = Dungeon.ENEMY_ID_BASE + e.id;
    const existing = this.hostActors.get(hostId);
    if (existing) return existing;
    const host: HostActor = {
      id: hostId,
      kind: e.summoned ? "minion" : "enemy",
      faction: "enemy",
      statuses: e.sc,
      get x() { return e.x; },
      get y() { return e.y; },
      get health() { return e.health; },
      get maxHealth() { return e.maxHealth; },
      get alive() { return e.health > 0; },
    };
    this.hostActors.set(hostId, host);
    return host;
  }

  private minionHost(m: Minion): HostActor {
    const hostId = Dungeon.MINION_ID_BASE + m.id;
    const existing = this.hostActors.get(hostId);
    if (existing) return existing;
    const host: HostActor = {
      id: hostId,
      kind: "minion",
      faction: "player",
      statuses: m.sc,
      ownerId: m.owner,
      get x() { return m.x; },
      get y() { return m.y; },
      get health() { return m.health; },
      get maxHealth() { return m.maxHealth; },
      get alive() { return m.health > 0; },
    };
    this.hostActors.set(hostId, host);
    return host;
  }

  actor(id: number): HostActor | undefined {
    const hero = this.heroByHostId(id);
    if (hero) return this.heroHost(hero);
    const enemy = this.enemyByHostId(id);
    if (enemy) return this.enemyHost(enemy);
    const minion = this.minionByHostId(id);
    if (minion) return this.minionHost(minion);
    return undefined;
  }

  *actors(): Iterable<TargetActor> {
    for (const hero of this.heroes) yield this.heroHost(hero);
    for (const e of this.enemies) if (e.health > 0) yield this.enemyHost(e);
    for (const m of this.minions) if (m.health > 0) yield this.minionHost(m);
  }

  *corpses(): Iterable<{ id: number; x: number; y: number }> {
    for (const c of this.corpsePile) yield { id: c.id, x: c.x, y: c.y };
  }

  *zones(): Iterable<{ id: number; x: number; y: number }> {
    for (let i = 0; i < this.ground.length; i++) {
      const g = this.ground[i]!;
      yield { id: i, x: g.x, y: g.y };
    }
  }

  *summonsOf(ownerId: number): Iterable<TargetActor> {
    const hero = this.heroByHostId(ownerId);
    if (!hero) return;
    for (const m of this.minions) {
      if (m.health > 0 && m.owner === hero.index) yield this.minionHost(m);
    }
  }

  markOf(actorId: number): number | undefined {
    // `mark` lives on the target's own container; the executor's "marked" selector uses
    // a per-caster mark instead. Not wired until abilities that mark land.
    void actorId;
    return this.markTargets.get(actorId);
  }

  private readonly markTargets = new Map<number, number>();

  threatToward(actorId: number): number {
    void actorId;
    return 0;
  }

  // --- RuleHost: the seam the keystone/hybrid/archetype rules talk to --------
  // (`emit` and `now` are already defined above for the renderer / CombatHost.)

  shake(amount: number): void {
    this.events.push({ kind: "shake", amount });
  }

  enemiesAround(x: number, y: number, radius: number): Enemy[] {
    return this.enemies
      .filter((e) => e.health > 0 && e.state !== "spawning" && dist(e.x, e.y, x, y) <= radius + e.radius)
      .sort((p, q) => dist(p.x, p.y, x, y) - dist(q.x, q.y, x, y));
  }

  hitEnemy(
    hero: Hero, e: Enemy, amount: number, element: Element = "physical",
    opts: { crit?: boolean; ailment?: number; knockAngle?: number; fromUltimate?: boolean } = {},
  ): number {
    const angle = opts.knockAngle ?? Math.atan2(e.y - hero.avatar.y, e.x - hero.avatar.x);
    return this.damageEnemy(e, amount, angle, element, {
      crit: opts.crit, ailment: opts.ailment, source: hero, fromUltimate: opts.fromUltimate ?? false,
    });
  }

  afflict(hero: Hero, e: Enemy, statusId: string, opts: { stacks?: number; duration?: number } = {}): void {
    e.sc.apply(statusId, {
      sourceActorId: hero.index, chance: 1, roll: () => this.rng.next(),
      stacks: opts.stacks, durationMult: opts.duration ? opts.duration / 4 : undefined,
      potency: this.ailmentPotency(hero),
    });
  }

  healHero(hero: Hero, amount: number): void {
    hero.player.heal(amount);
  }

  shieldHero(hero: Hero, amount: number): void {
    hero.ward = Math.max(hero.ward, amount);
    hero.wardTimer = Math.max(hero.wardTimer, 6);
  }

  alliesOf(hero: Hero): Hero[] {
    return this.heroes.filter((h) => h !== hero && !h.downed);
  }

  lowestAlly(hero: Hero): Hero {
    let best = hero;
    for (const h of this.heroes) {
      if (h.downed) continue;
      if (h.player.health / h.player.maxHealth < best.player.health / best.player.maxHealth) best = h;
    }
    return best;
  }

  // --- effects -----------------------------------------------------------

  dealDamage(targetId: number, packet: DamagePacket): number {
    const source = this.heroByHostId(packet.source.actorId) ?? null;
    const hero = this.heroByHostId(targetId);
    if (hero) {
      const dealt = this.applyPlayerDamage(hero, packet.amount, packet.type, 0);
      this.applyInflict(hero.sc, packet);
      return dealt;
    }
    const enemy = this.enemyByHostId(targetId);
    if (enemy) {
      const angle = source
        ? Math.atan2(enemy.y - source.avatar.y, enemy.x - source.avatar.x)
        : this.rng.angle();
      // Direct skill/ultimate hits (not DoT/periodic ticks) run through the same
      // keystone/hybrid rule pass basic attacks do — a primed strike, a forced crit.
      let amount = packet.amount;
      let crit = packet.crit;
      if (source && source.player.build.rules.size > 0
          && (packet.channel === "direct" || packet.channel === "ultimate")) {
        const rr = rulesOnHit(this, source, enemy, {
          isBasic: false,
          isCrit: !!packet.crit,
          movedRecently: Math.hypot(source.avatar.vx, source.avatar.vy) > 24,
          outOfReach: dist(source.avatar.x, source.avatar.y, enemy.x, enemy.y) > 96,
          amount: packet.amount,
        });
        amount *= rr.damageMult;
        crit = crit || rr.forceCrit;
      }
      const dealt = this.damageEnemy(enemy, amount, angle, packet.type, {
        crit,
        knock: packet.knockback,
        raw: packet.raw,
        source,
        fromUltimate: isUltimateSourced(packet),
      });
      this.applyInflict(enemy.sc, packet);
      if (source) {
        creditResourcesForHit(this.heroHost(source), packet, dealt, {
          killed: enemy.health <= 0,
          ailmentInflicted: !!packet.inflict,
        });
      }
      return dealt;
    }
    const minion = this.minionByHostId(targetId);
    if (minion) {
      const dealt = this.hurtMinion(minion, packet.amount, packet.type);
      if (minion.health > 0) this.applyInflict(minion.sc, packet);
      return dealt;
    }
    return 0;
  }

  private applyInflict(sc: StatusContainer, packet: DamagePacket): void {
    if (!packet.inflict || packet.inflict.chance <= 0) return;
    sc.apply(packet.inflict.status, {
      hitDamage: packet.amount,
      potency: packet.inflict.potency ?? 1,
      sourceActorId: packet.source.actorId,
      chance: packet.inflict.chance,
      roll: () => this.rng.next(),
    });
  }

  healActor(targetId: number, amount: number, _sourceId: number, _overTime?: number): void {
    const hero = this.heroByHostId(targetId);
    if (hero) { hero.player.heal(amount); return; }
    const enemy = this.enemyByHostId(targetId);
    if (enemy) enemy.health = Math.min(enemy.maxHealth, enemy.health + amount);
  }

  shieldActor(targetId: number, amount: number, duration: number, _sourceId: number, _absorbOneHit?: boolean): void {
    const hero = this.heroByHostId(targetId);
    if (!hero) return;
    // Reuse the Ward Veil pool — it is exactly "damage eaten before health".
    hero.ward = Math.max(hero.ward, amount);
    hero.wardTimer = Math.max(hero.wardTimer, duration);
  }

  moveActor(id: number, req: MoveRequest): void {
    const hero = this.heroByHostId(id);
    if (!hero) return;
    const a = hero.avatar;
    let toPoint = req.toPoint;
    if (!toPoint && req.toActorId !== undefined) {
      const t = this.enemyByHostId(req.toActorId) ?? this.minionByHostId(req.toActorId);
      if (t) toPoint = { x: t.x, y: t.y };
    }
    const angle = toPoint
      ? Math.atan2(toPoint.y - a.y, toPoint.x - a.x)
      : a.facing;
    const reach = toPoint
      ? Math.max(0, dist(a.x, a.y, toPoint.x, toPoint.y) - (a.radius + 10))
      : req.distance ?? 120;
    const landing = this.leapTo(hero, angle, reach);
    a.x = landing.x;
    a.y = landing.y;
    if (req.iframes) {
      a.invulnTimer = Math.max(a.invulnTimer, req.iframes);
      a.dashInvuln = Math.max(a.dashInvuln, req.iframes);
    }
  }

  spawnProjectile(req: ProjectileRequest): number {
    const owner = this.heroByHostId(req.ownerId);
    this.projectiles.push({
      x: req.x, y: req.y, px: req.x, py: req.y, radius: req.radius,
      vx: Math.cos(req.angle) * req.speed, vy: Math.sin(req.angle) * req.speed,
      damage: req.damage.amount, friendly: owner !== undefined, life: req.life,
      color: ELEMENT_COLORS[req.damage.type], element: req.damage.type,
      pierce: req.pierce, hits: new Set(), ailment: req.damage.inflict?.chance ?? 0,
      basic: false, owner: owner?.index ?? -1,
      // A skill bolt keeps its packet so its hits feed the caster's resources.
      ...(owner ? { packet: req.damage } : {}),
    });
    return this.projectiles.length - 1;
  }

  spawnZone(req: ZoneRequest): number {
    const benefit = req.benefit;
    const owner = this.heroByHostId(req.ownerId);
    this.ground.push({
      x: req.x, y: req.y, px: req.x, py: req.y, radius: req.radius,
      element: req.damage?.type ?? "physical",
      damage: req.damage ? req.damage.amount * (req.tickInterval || 0.5) : 0,
      remaining: req.duration, tickTimer: req.tickInterval || 0.5,
      hitsPlayer: false,
      // A benefit zone only ever helps; a damage / status zone catches enemies.
      hitsEnemies: !benefit,
      color: benefit ? BENEFIT_COLORS[benefit] : ELEMENT_COLORS[req.damage?.type ?? "physical"],
      ...(benefit ? { benefit } : {}),
      ...(req.follows && owner ? { follows: owner.index } : {}),
      ...(req.status ? { status: req.status.id } : {}),
      // A hero's damage zone keeps its packet so each tick feeds the caster's resources.
      ...(owner && req.damage ? { packet: req.damage } : {}),
    });
    return this.ground.length - 1;
  }

  /** One tick of a friendly zone on one hero standing in it. */
  private applyZoneBenefit(hero: Hero, g: GroundZone): void {
    const p = hero.player;
    switch (g.benefit) {
      case "heal":
        p.heal(p.maxHealth * BENEFIT_HEAL_FRACTION);
        break;
      case "shield":
        hero.ward = Math.max(hero.ward, p.maxHealth * BENEFIT_SHIELD_FRACTION);
        hero.wardTimer = Math.max(hero.wardTimer, GROUND_TICK * 3);
        break;
      case "haste":
        hero.sc.apply("hasted", {
          hitDamage: 0, sourceActorId: hero.index, chance: 1, roll: () => this.rng.next(),
        });
        break;
    }
  }

  spawnMinion(req: MinionRequest): number[] {
    const owner = this.heroByHostId(req.ownerId);
    if (!owner || req.count <= 0) return [];

    const inherit = req.command.inheritPower ?? MINION_DEFAULT_INHERIT;
    const lifespan = req.duration && req.duration > 0 ? req.duration : MINION_DEFAULT_LIFESPAN;

    // Caps: cull the owner's oldest to fit the per-owner limit, then clamp to whatever
    // global room is left — a raid must never bury a floor in pathing bodies.
    let want = Math.min(req.count, MINION_CAP_PER_OWNER);
    const owned = this.minionsOf(owner.index);
    for (let k = 0; k < owned.length + want - MINION_CAP_PER_OWNER; k++) {
      if (owned[k]) this.despawnMinion(owned[k]!, false);
    }
    want = Math.max(0, Math.min(want, MINION_CAP_GLOBAL - this.minions.length));
    if (want <= 0) return [];

    const power = Math.max(1, owner.player.attackDamage * inherit);
    const hp = Math.max(6, owner.player.maxHealth * 0.12 * inherit);
    const r = Dungeon.MINION_RADIUS;
    const ids: number[] = [];
    for (let i = 0; i < want; i++) {
      const angle = (TAU / want) * i + this.rng.next() * 0.6;
      const spot = resolveCircle(
        this.level,
        clamp(req.x + Math.cos(angle) * (18 + i * 2), r + WALL_PAD, this.width - r - WALL_PAD),
        clamp(req.y + Math.sin(angle) * (18 + i * 2), r + WALL_PAD, this.height - r - WALL_PAD),
        r,
      );
      const id = this.nextMinionId++;
      this.minions.push({
        id, owner: owner.index, unit: req.unit,
        x: spot.x, y: spot.y, px: spot.x, py: spot.y, radius: r,
        health: hp, maxHealth: hp, damage: power,
        attackCooldown: 1.1, attackTimer: 0.3 + i * 0.05, attackRange: 20, windup: 0,
        speed: PLAYER_SPEED * 0.9,
        element: owner.player.attackElement,
        facing: angle, hitFlash: 0, knockX: 0, knockY: 0,
        remaining: lifespan,
        behavior: req.command.behavior,
        commandTargetId: null,
        guardX: req.x, guardY: req.y,
        sc: new StatusContainer(Dungeon.MINION_ID_BASE + id),
        stuckTimer: 0, dodgeDir: this.rng.next() < 0.5 ? -1 : 1,
      });
      ids.push(Dungeon.MINION_ID_BASE + id);
    }
    this.events.push({ kind: "nova", x: req.x, y: req.y, radius: 20 });
    return ids;
  }

  spawnTerrain(_req: TerrainRequest): number {
    // No player-built terrain yet (Necromancer's Ossuary Wall, Juggernaut's Anchor
    // Rune). Lands with the ability cutover.
    return -1;
  }

  consumeCorpses(count: number | "all"): number {
    const take = count === "all" ? this.corpsePile.length : Math.min(count, this.corpsePile.length);
    this.corpsePile.splice(0, take);
    return take;
  }

  setThreat(targetId: number, op: "taunt" | "drop" | "generate", sourceId: number, _amount: number): void {
    if (op !== "taunt") return;
    const enemy = this.enemyByHostId(targetId);
    const hero = this.heroByHostId(sourceId);
    if (enemy && hero) this.taunts.set(enemy.id, hero.index);
  }

  /** Enemies forced to target a specific hero, by taunt. Read by the enemy brain. */
  private readonly taunts = new Map<number, number>();

  applyImpulse(targetId: number, fromX: number, fromY: number, force: number): void {
    const enemy = this.enemyByHostId(targetId);
    if (!enemy) return;
    const angle = Math.atan2(enemy.y - fromY, enemy.x - fromX);
    enemy.knockX += Math.cos(angle) * force * enemy.knockResist;
    enemy.knockY += Math.sin(angle) * force * enemy.knockResist;
  }

  interruptCasts(x: number, y: number, radius: number): void {
    for (const e of this.enemies) {
      if (e.state === "windup" && dist(e.x, e.y, x, y) <= radius + e.radius) {
        e.state = "active";
        e.windup = 0;
      }
    }
    const b = this.boss?.boss;
    if (b && b.ability && this.boss && dist(this.boss.x, this.boss.y, x, y) <= radius + this.boss.radius) {
      b.castTimer = 0;
    }
  }

  commandSummons(ownerId: number, behavior: MinionCommand["behavior"], targetId?: number): void {
    const hero = this.heroByHostId(ownerId);
    if (!hero) return;
    const enemy = targetId !== undefined ? this.enemyByHostId(targetId) : undefined;
    for (const m of this.minionsOf(hero.index)) {
      m.behavior = behavior;
      if (behavior === "commandTarget" && enemy) m.commandTargetId = enemy.id;
      if (behavior === "guardPoint") { m.guardX = hero.avatar.x; m.guardY = hero.avatar.y; }
    }
  }

  sacrificeSummons(ownerId: number, count: number): number {
    const hero = this.heroByHostId(ownerId);
    if (!hero) return 0;
    const owned = this.minionsOf(hero.index);
    const take = Math.min(count, owned.length);
    for (let i = 0; i < take; i++) this.despawnMinion(owned[i]!, true);
    return take;
  }

  /**
   * Damage redirection — Paladin's Guardian's Oath, Juggernaut's Fortress Call. Binds
   * one protector per ward; `applyPlayerDamage` reads the binding and passes a fraction
   * of the ward's incoming hit to the protector (through their own mitigation and ward).
   * Solo this is a no-op — there is no ally to bind — so it only ever matters in co-op.
   * The raid-scale caps (N protectors on one tank, an A→B→A cycle) are still on the
   * Stage 11 hazard list; this is the single-binding version.
   */
  redirectDamage(protectorId: number, wardId: number, fraction: number, duration: number): void {
    const protector = this.heroByHostId(protectorId);
    const ward = this.heroByHostId(wardId);
    if (!protector || !ward || protector.index === ward.index) return;
    this.redirects.set(ward.index, {
      protector: protector.index,
      fraction: clamp(fraction, 0, 0.9),
      until: this.elapsed + duration,
    });
  }

  /** ward hero index → who is soaking a slice of their damage, and until when. */
  private readonly redirects = new Map<number, { protector: number; fraction: number; until: number }>();
  /** Re-entrancy guard so a redirected hit can't bounce back down the same path. */
  private inRedirect = false;

  emitFx(ref: string, x: number, y: number): void {
    this.events.push({ kind: "cast", x, y: y - 20, label: ref, color: "#ffffff" });
  }
}

/** Is a body inside a telegraph's danger zone? One test per shape, and that's the game. */
export function inTelegraph(t: Telegraph, x: number, y: number, r: number): boolean {
  switch (t.shape) {
    case "circle":
      return dist(t.x, t.y, x, y) <= t.radius + r;
    case "donut": {
      // Safe in the middle: the hole has to be entered, not merely touched.
      const d = dist(t.x, t.y, x, y);
      return d + r > t.inner && d <= t.radius + r;
    }
    case "cone": {
      const d = dist(t.x, t.y, x, y);
      if (d > t.radius + r) return false;
      const toBody = Math.atan2(y - t.y, x - t.x);
      return Math.abs(angleDelta(t.angle, toBody)) <= t.arc / 2;
    }
    case "line": {
      const dx = x - t.x;
      const dy = y - t.y;
      const along = dx * Math.cos(t.angle) + dy * Math.sin(t.angle);
      if (along < -r || along > t.radius + r) return false;
      const across = Math.abs(-dx * Math.sin(t.angle) + dy * Math.cos(t.angle));
      return across <= t.width + r;
    }
    case "none":
      return false;
  }
}

/** A fresh avatar at a spot on the floor. Every hero, local or remote, starts here. */
function makeAvatar(x: number, y: number): Avatar {
  return {
    x, y, px: x, py: y,
    radius: PLAYER_RADIUS,
    vx: 0, vy: 0, facing: -Math.PI / 2,
    attackTimer: 0, swingTimer: 0, swingAngle: 0,
    dashTimer: 0, dashCooldown: 0, invulnTimer: 0, dashInvuln: 0, hitFlash: 0,
    buffAttackSpeed: 0, buffLifeOnHit: 0,
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { TAU };
