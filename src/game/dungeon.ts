import { angleDelta, approach, circlesOverlap, clamp, dist, normalize, TAU } from "../core/math";
import { Rng } from "../core/rng";
import { BOSS_ABILITIES, BOSS_KNOCK_RESIST, BOSS_ACTION_GAP } from "../data/bosses";
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
  affixCountFor, affixPrefix, foldAffixSpawn, rollMonsterAffixes,
} from "../data/monster-affixes";
import {
  BOLT_LIFE, BOLT_SPEED, TALISMAN_ARC_DAMAGE, TALISMAN_ARC_RANGE, type AttackPattern,
} from "../data/weapons";
import { weaponAbilityFor } from "../data/weapon-abilities";
import type { TriggerKind, TriggerSpec } from "../data/items";
import { coinDropFor, profileFor, xpDropFor, type DepthProfile } from "../data/depth";
import { EQUIP_SLOTS } from "../data/items";
import { emptyMaterials, MATERIAL_NAMES, type MaterialBag } from "../data/materials";
import { delveConfig, EARLY_EXTRACT_KEEP, type RunConfig } from "../data/modes";
import { dailyEffects } from "../data/daily";
import type { ClassId } from "../data/classes";
import { bossSpecForRun } from "../data/encounters";
import { provingFloor } from "../data/legends";
import { WEEKLY_GUARANTEED_RARITY, weeklyEffects, weeklyFloorSeed } from "../data/weekly";
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
import { applyRuleFx, runBuildGrants, runReactiveWindows, type BuildRuleContext } from "./abilities";
import {
  HeroRuleState, rulesOnAvoid, rulesOnCast, rulesOnDamageTaken, rulesOnHit, rulesOnKill,
  rulesOnMinionDeath, rulesOnUltimate, rulesTick, type MinionView, type RuleHost,
} from "./rules";

/** Fraction of a ward's pool that also counts as flat resistance while it holds — was
 *  `data/skills.ts` before the ability cutover. */
const WARD_RESIST = 60;
// Registers burn/chill/shock/venom/drain/sear/sunder on the unified status registry so
// `Hero.sc` / `Enemy.sc` mean the same thing the legacy ailment list does.
import "../combat/legacy-ailments";
import type { Avatar, Body, Corpse, Enemy, GroundZone, Minion, Pickup, Projectile, Telegraph, Totem } from "./entities";
import {
  MINION_CAP_GLOBAL, MINION_CAP_PER_OWNER, MINION_DEFAULT_INHERIT, MINION_DEFAULT_LIFESPAN,
  MINION_GUARD_LEASH, MINION_LEASH, MINION_SEPARATION, MINION_WINDUP,
} from "../data/minions";
import type { Appearance } from "../data/cosmetics";
import type { AvatarInput } from "../core/input";
import type { Player } from "./player";
import { forgeNamedItem, randomItemType, rollItem, type Item } from "./item";
import { rollNamedDrops, type NamedDropQuery } from "../data/named";
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
  /**
   * Their browser left the room mid-run (UAT §1 A1). The body stays on the floor so the
   * party keeps its bearings, but it is out of every count that could hold the run
   * hostage: it can't be revived, doesn't gate the descend, isn't targeted, and doesn't
   * keep a wipe from being a wipe. Nothing brings it back — there is no reconnect.
   */
  departed = false;
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
    // Start a floor with every dash you own ready, not just the one `makeAvatar` assumes.
    this.avatar.dashStock = setup.player.dashCharges;
    this.sc = new StatusContainer(index);
    this.resources = setup.player.makeResources();
    this.syncChargeRate();
  }

  get alive(): boolean {
    return !this.downed;
  }

  /**
   * Points the ultimate meter's fill rate at this character's `ultimateRate` modifier.
   *
   * Called at construction so it's right from the first frame, and again every tick
   * because `Player.mods` is live — a level-up mid-floor, or anything else that
   * invalidates the cached mods, has to be reflected without rebuilding the pool.
   * Cheap: one multiply and one assignment per hero per tick.
   */
  syncChargeRate(): void {
    const meter = this.resources.ultimateMeter();
    if (meter) meter.rateMultiplier = this.player.ultimateChargeMult;
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
  /**
   * A third deterministic stream, for monster-affix rolls (UAT §3) and the behaviours
   * they fire. Same reasoning as `defenseRng`: a floor with no affixed monsters never
   * draws from it, so bolting the affix system on keeps spawns, telegraphs and loot on
   * the main stream byte-identical and every calibrated test still lines up.
   */
  readonly affixRng: Rng;
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
  /** Elites spawned / killed on this floor — the mini-boss tier is rate-limited per floor
   *  (UAT §4) and the counts feed the floor-clear objective (UAT §5). */
  private elitesSpawned = 0;
  elitesKilled = 0;
  /** The floor-clear quota (UAT §5): kill this many wave-director monsters, and
   *  `elitesRequired` elites, and the floor is done. Boss floors: the boss is the quota.
   *  Both are deterministic from the profile, so a co-op client computes the same pair. */
  killsRequired: number;
  killsSoFar = 0;
  elitesRequired: number;
  /** Spawned at a fresh spot the instant the quota is met — the primary exit after a
   *  clear. `null` until then; the entrance `portal` stays put as the early-exit. */
  completionPortal: { x: number; y: number } | null = null;
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
  /**
   * The **entrance** portal: where the party came in, and the early-extract door. Live
   * all floor; descending needs a clear and the *completion* portal.
   *
   * It sits on `level.start`, which is literally where the heroes are placed — UAT §6
   * calls this "where you came in", so standing on your own arrival point has to be
   * enough to bail out. It used to be `level.portal` instead, which both generators
   * deliberately place as far from the spawn as the floor reaches (that was correct when
   * there was one portal and it was the exit you walked *to*, before §6 split the two);
   * the result was an entrance portal a median 600-900 units from the entrance, never
   * once within the 34-unit range you need to use it. `level.portal` is now the
   * completion portal's home instead — see `pickCompletionSpot`.
   */
  readonly portal: { x: number; y: number };
  elapsed = 0;

  /**
   * The class whose Proving this floor is, or null for every other floor in the game
   * (UAT §13/§14 — `data/legends.ts`).
   *
   * Decided **once, here in the constructor**, and never re-derived. Both the boss that
   * spawns and the completion credit that banks read this one field, so they cannot
   * disagree — and re-deriving it at banking time would be wrong rather than merely
   * redundant: `recordDepth` raises `Player.deepestDepth` to 30 as the first-ever clear
   * of depth 30 banks, so a predicate evaluated after that would hand a class its gold
   * border for the Nameless kill that had only just qualified it.
   */
  readonly proving: ClassId | null;

  /**
   * `depth` may be a plain delve depth or a full rift configuration. `opts` is only
   * ever passed by the multiplayer layer — a solo dive stays a two-argument call and
   * behaves exactly as it always has, with a party of one.
   */
  constructor(state: GameState, depth: number | RunConfig, opts: number | DungeonOptions = {}) {
    const options: DungeonOptions = typeof opts === "number" ? { seed: opts } : opts;
    this.role = options.role ?? "solo";
    this.state = state;
    this.config = typeof depth === "number" ? delveConfig(depth) : depth;
    // The Vigil carries its own seed (UAT §17): the same UTC day is the same floor for
    // everybody. The Convergence does the same per week, mixed with the floor index so
    // its four floors don't repeat each other. Anything handed an explicit seed — a
    // co-op `start`, a test — still wins.
    const seed = options.seed
      ?? this.config.daily?.seed
      ?? (this.config.weekly ? weeklyFloorSeed(this.config.weekly.seed, this.config.floor) : undefined)
      ?? ((Math.random() * 2 ** 32) >>> 0);
    // Is this the bottom, and has the character playing earned the right to be measured
    // there? Asked once, before a single monster exists.
    this.proving = provingFloor(this.config, state.player.deepestDepth) ? state.activeClassId : null;
    this.profile = profileFor(this.config.depth, this.config);
    // The floor-clear quota (UAT §5). A boss floor is its boss; everything else is
    // "every monster the director will spawn" plus a difficulty-scaled elite count,
    // clamped to what the floor can actually produce so it can never be unclearable.
    if (this.profile.isBoss) {
      this.killsRequired = 1;
      this.elitesRequired = 0;
    } else {
      this.killsRequired = Math.max(1, this.profile.enemiesPerWave * this.profile.waves);
      this.elitesRequired = clamp(
        (this.config.danger >= 1.6 ? 1 + Math.floor(this.config.danger - 1.6) : this.profile.depth >= 8 ? 1 : 0)
          // The Vigil's Elite Hunt and the Convergence's Purge ask for more (UAT §17);
          // still clamped to what the floor can make.
          + dailyEffects(this.config.daily?.modifiers ?? []).elites
          + weeklyEffects(this.config.weekly?.modifiers ?? []).elites,
        0,
        this.eliteCapForFloor(),
      );
    }
    this.rng = new Rng(seed);
    this.defenseRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.affixRng = new Rng((seed ^ 0x85ebca6b) >>> 0);

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
    // A party floor with no hero of our own in it is a bug upstream, never something to
    // paper over: falling back to `heroes[0]` would have this browser driving — and, as
    // a client, banking the mirrored loot of — the *host's* character (UAT §1 A2).
    const local = this.heroes.find((h) => h.local);
    if (!local && this.role !== "solo") {
      throw new Error("a party floor was built without the hero this browser drives");
    }
    this.localHero = local ?? this.heroes[0]!;
    for (const hero of this.heroes) {
      runBuildGrants(
        this.bus, hero.player.build, this, hero.rt, hero.index,
        () => this.castInputFor(hero),
        () => hero.avatar.facing,
      );
      runReactiveWindows(this.bus, this, hero.rt, hero.index);
    }
    this.portal = this.level.start;
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
  /**
   * Client only (UAT §1 B1): where the last snapshot put each remote body and how long
   * it has left to get there. `advanceRemote` slides bodies toward these every tick so a
   * 20 Hz snapshot stream draws as 60 Hz motion. Written by `net/sync.ts`.
   */
  readonly netLerp = new Map<Body, { x: number; y: number; t: number }>();

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

  /**
   * How many elites this whole floor is allowed — the mini-boss tier is deliberately
   * rate-limited (UAT §4: "Rare", "a player should not treat it as another normal mob").
   * Roughly one on an ordinary floor, a second deep or on a rift, more only under a hard
   * Challenger dial. Boss floors get none — the boss is the encounter.
   */
  private eliteCapForFloor(): number {
    if (this.profile.isBoss) return 0;
    const d = this.profile.depth;
    // The opening floors stay a straight fight — an elite is a mid-game escalation, not
    // something a fresh character meets on floor 2.
    if (d < 4 && this.config.danger < 1.4) return 0;
    return 1
      + (this.config.danger > 1.6 ? 1 : 0)
      + Math.floor(d / 18)
      + (this.config.danger > 3.5 ? 1 : 0)
      // The Vigil's Elite Hunt and the Convergence's Purge (UAT §17) raise what the floor
      // *makes* as well as what they ask for — otherwise the quota bump would clamp
      // straight back to the cap.
      + dailyEffects(this.config.daily?.modifiers ?? []).elites
      + weeklyEffects(this.config.weekly?.modifiers ?? []).elites;
  }

  /** Picks an archetype, rolls elite, and drops one wave monster near (x, y). */
  private placeMonsterAt(spot: { x: number; y: number }): void {
    const kinds = this.spawnableKinds();
    const weights = Object.fromEntries(kinds.map((k) => [k, ARCHETYPES[k].weight])) as Record<EnemyKind, number>;
    const archetype = ARCHETYPES[this.rng.weighted(weights)];
    const at = resolveCircle(this.level, spot.x, spot.y, archetype.radius);
    // An elite is a capped, per-floor event now — a moderate roll, but only until the
    // floor's budget is spent. Later waves are likelier to carry the elite, so it lands
    // as an escalation rather than in the opening trickle.
    let elite: Rarity | null = null;
    // The floor owes `elitesRequired` elites for its clear objective (UAT §5). Normally
    // they come off the same capped roll as before; if the last wave is running out of
    // bodies with elites still owed, the next spawns are forced to carry them so the
    // objective is always completable.
    const eliteDebt = this.elitesRequired - this.elitesSpawned;
    const forceElite = eliteDebt > 0 && this.wave >= this.profile.waves && this.queued <= eliteDebt;
    if (forceElite || this.elitesSpawned < this.eliteCapForFloor()) {
      const waveProgress = this.wave / Math.max(1, this.profile.waves);
      const chance = clamp(0.03 + waveProgress * 0.05 + (this.config.danger - 1) * 0.02, 0, 0.4);
      const rolled = this.rng.chance(chance);
      if (forceElite || rolled) {
        const maxTier = clamp(1 + Math.floor(this.profile.depth / 3), 1, RARITIES.length - 1);
        elite = RARITIES[this.rng.int(1, maxTier)]!;
        this.elitesSpawned++;
      }
    }
    // The discount is for chaff only — an elite in the swarm is still the real threat.
    this.enemies.push(
      this.makeEnemy(archetype, at.x, at.y, { elite, fromWave: true, healthMult: elite ? 1 : WAVE_HEALTH_MULT }),
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
      // Decremented per monster, not after the whole burst: `placeMonsterAt`'s forced-elite
      // check reads `this.queued` to see how many spawns are left to pay off an elite debt,
      // and a batched decrement left that number frozen at the burst's pre-spawn size for
      // every monster in it — so a debt bigger than the *last* burst (not the whole wave)
      // could run out of monsters to force before it was paid off (Nightmare-tier Challenger
      // raises the debt past what a small last burst can carry).
      this.queued--;
    }
  }

  /**
   * Bigger, chunkier bursts the deeper — and the more dangerous — the floor gets, and
   * bigger again on a floor's later waves (UAT §8): a floor should ramp toward its own
   * peak pressure by the last wave, not field the same trickle from start to finish.
   */
  private burstSizeFor(): number {
    const waveRamp = this.wave > 1 ? (this.wave - 1) / Math.max(1, this.profile.waves - 1) : 0;
    return clamp(
      Math.round(2 + this.profile.depth * 0.1 + (this.profile.crowd - 1) * 3 + waveRamp * 1.5),
      2, 7,
    );
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
    opts: {
      elite?: Rarity | null; summoned?: boolean; healthMult?: number;
      noAffixes?: boolean;
      /** Counts toward the floor-clear quota (UAT §5) — set only for wave-director
       *  spawns, never a summon, a split or a boss add. */
      fromWave?: boolean;
    } = {},
  ): Enemy {
    const elite = opts.elite ?? null;
    // A mini-boss, not a fat mob (UAT §4). The health lasts through a rotation of the
    // player's kit; the damage is high but every big hit is the telegraphed slam, which
    // is dodgeable — so it forces a change of approach without being a one-shot wall.
    const eliteMult = elite ? 1.9 + rarityIndex(elite) * 0.65 : 1;

    // Modular monster affixes (UAT §3). Boss bodies, boss-summoned chaff and the split
    // spawn of a Splitting monster never roll them; everything else on a wave can.
    const affixes = opts.noAffixes || opts.summoned || archetype.kind === "boss"
      ? []
      : rollMonsterAffixes(
          archetype.kind,
          this.profile.depth,
          this.config.danger,
          affixCountFor(this.profile.depth, this.config.danger, elite !== null, this.affixRng),
          this.affixRng,
          { elite: elite !== null },
        );
    const aff = foldAffixSpawn(affixes);

    const element = this.rollElement(archetype.element, elite !== null);
    const health =
      this.profile.enemyHealth * archetype.health * eliteMult * (opts.healthMult ?? 1) * aff.healthMult;

    // Everything resists its own element hard, so a single-element build eventually
    // hits a wall and has to diversify. Physical is deliberately exempt: it's the
    // damage everyone always has, and a floor that resists your sword is a floor you
    // simply cannot fight.
    const resists = zeroResists();
    for (const e of Object.keys(resists) as Element[]) {
      resists[e] = archetype.resist + (elite ? rarityIndex(elite) * 8 : 0) + aff.resist;
    }
    if (element !== "physical") resists[element] += 55 + this.profile.depth * 1.5;

    const prefix = element !== archetype.element ? `${ELEMENT_PREFIX[element]} ` : "";
    // A planet renames its ordinary archetypes so the roster reads as this planet's
    // own, even though it's the same five kinds fighting the same way underneath.
    const baseName = this.config.planet?.spec.enemyNames[archetype.kind] ?? archetype.name;
    const attackCooldown = archetype.attackCooldown * aff.attackRateMult;
    return {
      id: this.nextEnemyId++,
      x, y, px: x, py: y,
      radius: (archetype.radius + aff.radius) * (elite ? 1.5 : 1),
      archetype,
      name: `${affixPrefix(affixes)}${prefix}${elite ? `${cap(elite)} ` : ""}${baseName}`,
      health, maxHealth: health,
      damage:
        this.profile.enemyDamage * archetype.damage
        * (elite ? 1.28 + rarityIndex(elite) * 0.12 : 1) * aff.damageMult,
      speed: this.profile.enemySpeed * archetype.speed * aff.speedMult,
      attackTimer: this.rng.range(0, attackCooldown * this.profile.aggression),
      attackCooldown,
      eliteCast: elite ? this.affixRng.range(2.5, 4) : 0,
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
      // Off the affix stream so adding archetype behaviours doesn't shift the main
      // sequence, and only drawn for the roles that actually use it — a floor of plain
      // melee/ranged monsters stays byte-identical to before the archetype roster grew,
      // so it doesn't quietly reshuffle every affix roll on a shallow floor.
      behaviorTimer:
        archetype.behavior === "melee" || archetype.behavior === "ranged"
          ? 0
          : this.affixRng.range(1.5, 4),
      chargeVx: 0,
      chargeVy: 0,
      element,
      resists,
      sc: new StatusContainer(Dungeon.ENEMY_ID_BASE + this.nextEnemyId - 1),
      knockResist: elite ? 0.35 : 1,
      boss: null,
      summoned: opts.summoned ?? false,
      fromWave: opts.fromWave ?? false,
      affixes,
      affixState: { timers: {}, ward: 0, noSplit: opts.noAffixes === true },
      damageTakenMult: aff.damageTakenMult,
    };
  }

  /**
   * A test seam (headless smoke only): drop one monster of a named kind at a point and
   * return it, bypassing the wave director. Used to walk each archetype behaviour (UAT
   * §2) in isolation. Not part of normal gameplay — the wave director never calls this.
   */
  spawnArchetypeAt(
    kind: EnemyKind, x: number, y: number, opts?: { noAffixes?: boolean; elite?: Rarity | null },
  ): Enemy {
    const e = this.makeEnemy(ARCHETYPES[kind], x, y, {
      noAffixes: opts?.noAffixes ?? true,
      elite: opts?.elite ?? null,
      fromWave: true,
    });
    e.state = "active";
    e.spawnTimer = 0;
    this.enemies.push(e);
    // On a sealed floor the staged monsters *are* the clear objective, so each one
    // placed raises the quota by one and killing them all still ends the floor.
    this.killsRequired++;
    return e;
  }

  /**
   * A test seam (headless smoke only): stop the wave director and hand the floor's
   * clear objective over to whatever `spawnArchetypeAt` places next. No further waves
   * are queued, and the floor is treated as its last, so it clears the moment the
   * staged encounter is dead. See the Item D archetype walk in `tools/smoke.ts`.
   */
  sealWaves(): void {
    this.queued = 0;
    this.wave = this.profile.waves;
    this.spawnTimer = Number.POSITIVE_INFINITY;
    this.killsRequired = 0;
    this.killsSoFar = 0;
    this.elitesRequired = 0;
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
    // Which encounter a boss floor spawns — a sector's own, the class's Proving, or the
    // depth-bucketed ladder — is answered in one place (`data/encounters.ts`), because
    // the UAT §20 drop preview has to ask the identical question and must not be able to
    // answer it differently.
    const spec = bossSpecForRun({ ...this.config, depth: this.profile.depth }, this.proving);
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
      this.advanceRemote(dt);
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

    if (this.phase === "fighting" && this.floorQuotaMet()) {
      this.phase = "cleared";
      // The clear opens the portal at the far end of the floor — that's the way on from
      // here. The entrance portal stays on the spawn, now purely an early-exit.
      this.completionPortal = this.pickCompletionSpot();
      // Clearing the floor picks everybody up. Nobody sits out the walk to the portal.
      for (const hero of this.heroes) {
        if (hero.downed && !hero.departed) this.reviveHero(hero);
      }
      this.dropClearCache();
      this.events.push({ kind: "cleared" });
    }
  }

  /**
   * The floor's win condition (UAT §5): the kill quota met and the elite quota met.
   * Summoner chaff and Splitting shards left alive don't hold the floor hostage — only
   * the director's own roster counts (see `killsSoFar` in `killEnemy`).
   */
  floorQuotaMet(): boolean {
    return this.killsSoFar >= this.killsRequired
      && this.elitesKilled >= this.elitesRequired
      && this.wave >= this.profile.waves;
  }

  /**
   * Where the completion portal opens: `level.portal`, the far end of the floor.
   *
   * The generator already builds that point to be exactly what this needs, which is why
   * it's worth reusing rather than searching for a new one. It is the room at maximum
   * graph distance from the spawn ("as far from the start as the graph actually
   * reaches"), it is *guaranteed* walkable from the spawn — connected by construction,
   * flood-filled to check, and a corridor carved as a last resort if a layout ever seals
   * itself — it has `CLEAR_RADIUS` of wall-free space around it, and hazard placement
   * already keeps 110 units clear of it.
   *
   * This replaced a 50-try `randomOpenPoint` search off `affixRng`. That search wasn't
   * broken, but it was random by design and read as such: the owner's report was that the
   * completion portal lands "kind of random". It also had a fallback chain ending in
   * `this.portal`, so a floor where both searches failed opened its completion portal on
   * top of the entrance. Deterministic and legible beats random here — the way onward is
   * the far end of the dungeon you just fought through.
   *
   * Note this is *not* "where the last monster died": the walk to a new place is the
   * point (UAT §6 — the clear cache drops here, so the reward lands where finishing
   * sends you), and the old search deliberately pushed 150 units away from the player
   * for that reason.
   */
  private pickCompletionSpot(): { x: number; y: number } {
    return this.level.portal;
  }

  /**
   * A client moves its own character immediately (UAT §1 B2), dash included, and is
   * reconciled against the host by `applyHero` in `net/sync.ts`: the host echoes the
   * last input it consumed, and the client re-applies everything newer than that from
   * the host's position through `predictStep` — the very step the host used. Nothing
   * else is predicted: a swing that hasn't happened yet must never draw a number.
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
    this.predictStep(hero, move, input.wasPressed("dash"), dt);
  }

  /**
   * One tick of a client's own movement — the timers a dash depends on, then the shared
   * movement step. Used live by `predictLocal` and again, instantaneously, by the
   * reconciliation replay in `net/sync.ts`. Never touches `px`/`py`: a replay is not
   * motion the renderer should see.
   */
  predictStep(hero: Hero, move: { x: number; y: number }, dash: boolean, dt: number): void {
    const a = hero.avatar;
    this.tickDash(hero, dt);
    a.invulnTimer = Math.max(0, a.invulnTimer - dt);
    a.dashInvuln = Math.max(0, a.dashInvuln - dt);
    this.moveHero(hero, move, dash, dt, false);
  }

  /**
   * Between snapshots a client keeps the host's world moving on its own (UAT §1 B1):
   * bodies slide toward where the last snapshot put them over one snapshot interval,
   * projectiles fly on at the speed they arrived with, and the purely visual timers —
   * wind-ups, telegraph fills, hit flashes — keep counting down. Without this everything
   * but your own character stood still for two ticks out of three.
   */
  private advanceRemote(dt: number): void {
    for (const [body, target] of this.netLerp) {
      body.px = body.x;
      body.py = body.y;
      if (target.t <= 0) {
        body.x = target.x;
        body.y = target.y;
        continue;
      }
      const f = Math.min(1, dt / target.t);
      body.x += (target.x - body.x) * f;
      body.y += (target.y - body.y) * f;
      target.t -= dt;
    }
    for (const p of this.projectiles) {
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const e of this.enemies) {
      e.windup = Math.max(0, e.windup - dt);
      e.spawnTimer = Math.max(0, e.spawnTimer - dt);
      e.hitFlash = Math.max(0, e.hitFlash - dt);
    }
    for (const m of this.minions) {
      m.windup = Math.max(0, m.windup - dt);
      m.hitFlash = Math.max(0, m.hitFlash - dt);
    }
    for (const c of this.corpsePile) c.remaining = Math.max(0, c.remaining - dt);
    for (const t of this.telegraphs) t.remaining = Math.max(0, t.remaining - dt);
    for (const g of this.ground) g.remaining = Math.max(0, g.remaining - dt);
    for (const hero of this.heroes) {
      if (hero.local) continue;
      const a = hero.avatar;
      a.swingTimer = Math.max(0, a.swingTimer - dt);
      a.hitFlash = Math.max(0, a.hitFlash - dt);
      a.dashTimer = Math.max(0, a.dashTimer - dt);
      a.invulnTimer = Math.max(0, a.invulnTimer - dt);
    }
  }

  /**
   * Downed allies. Stand next to one and they come back; walk away and their progress
   * bleeds off. Skipped entirely in a solo dive, where being out of health is simply
   * the end of the run.
   */
  private updateRevives(dt: number): void {
    if (!this.isParty) return;
    for (const hero of this.heroes) {
      if (!hero.downed || hero.departed) continue;
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

  /** How many of the party are standing in the entrance portal. */
  get partyAtPortal(): number {
    return this.heroes.filter(
      (h) => !h.departed && dist(h.avatar.x, h.avatar.y, this.portal.x, this.portal.y) < 34).length;
  }

  /** How many of the party are standing in the completion portal — descending needs
   *  everybody still here (`partySize`), and the HUD counts them out loud. */
  get partyAtCompletionPortal(): number {
    const p = this.completionPortal;
    if (!p) return 0;
    return this.heroes.filter((h) => !h.departed && dist(h.avatar.x, h.avatar.y, p.x, p.y) < 34).length;
  }

  /** Heroes still in the run — everybody, minus anyone whose browser has left. This is
   *  the number a descend waits for, so a dropped connection can't hold the floor. */
  get partySize(): number {
    return this.heroes.filter((h) => !h.departed).length;
  }

  /**
   * A remote player's connection is gone for good (UAT §1 A1). Their body stays where it
   * fell, downed, but out of every count: no revive, no descend gate, no aggro. If that
   * leaves nobody standing, the floor is lost the same as if they'd died.
   */
  dropHero(hero: Hero): void {
    if (hero.departed) return;
    hero.departed = true;
    hero.downed = true;
    hero.reviveProgress = 0;
    hero.input = null;
    hero.avatar.vx = 0;
    hero.avatar.vy = 0;
    if (this.heroes.every((h) => h.downed)) this.phase = "dead";
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
    this.tickDash(hero, dt);
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

    this.moveHero(hero, move, input.wasPressed("dash"), dt, true);

    if (input.wasPressed("attack") && a.attackTimer <= 0 && !disabled.attack) this.attack(hero);
    if (input.wasPressed("potion")) this.drinkPotion(hero);
    if (input.wasPressed("special")) this.useUltimate(hero);
    if (input.wasPressed("skill1")) this.castSkill(hero, 0);
    if (input.wasPressed("skill2")) this.castSkill(hero, 1);
    if (input.wasPressed("skill3")) this.castSkill(hero, 2);
    if (input.wasPressed("skill4")) this.castSkill(hero, 3);
  }

  /**
   * Refills the dash stock, one charge per cooldown, up to the character's cap. Shared
   * by the live tick and the client's prediction step so both ends of the wire run the
   * identical timer — the same reason `moveHero` is shared. With the default cap of one
   * this is exactly the old single cooldown: spend it, wait, have it back.
   *
   * The cap is re-read every tick rather than cached because it comes off `Player.mods`,
   * and a stock above a cap that just shrank (a relic taken off between floors) is
   * clamped rather than left as a free dash.
   */
  private tickDash(hero: Hero, dt: number): void {
    const a = hero.avatar;
    const cap = hero.player.dashCharges;
    if (a.dashStock >= cap) {
      a.dashStock = cap;
      a.dashCooldown = 0;
      return;
    }
    a.dashCooldown -= dt;
    if (a.dashCooldown <= 0) {
      a.dashStock++;
      a.dashCooldown = a.dashStock < cap ? DASH_COOLDOWN * hero.player.dashCooldownMult : 0;
    }
  }

  /**
   * The movement half of a hero tick — dash start, dash travel or walking, wall
   * resolution. Shared by the host's real update and a client's prediction and replay
   * (UAT §1 B2), so both ends compute the identical position from the identical inputs;
   * that is what lets a reconciled client sit exactly where the host has it rather than
   * being tugged toward it. `live` is false while predicting: nothing fires, nothing is
   * broadcast, no position history.
   */
  moveHero(hero: Hero, move: { x: number; y: number }, dash: boolean, dt: number, live: boolean): void {
    const a = hero.avatar;
    const disabled = hero.sc.disables();
    if (a.dashTimer > 0) {
      a.dashTimer -= dt;
    } else if (dash && a.dashStock > 0 && !disabled.move) {
      a.dashTimer = DASH_TIME;
      // Spend a charge. The refill timer only starts if one isn't already running — a
      // second dash mid-cooldown doesn't push the first charge's return further out.
      a.dashStock--;
      if (a.dashCooldown <= 0) a.dashCooldown = DASH_COOLDOWN * hero.player.dashCooldownMult;
      // The dash grants i-frames — it's the main defensive tool, so it must feel reliable.
      a.invulnTimer = Math.max(a.invulnTimer, DASH_TIME + 0.08);
      a.dashInvuln = DASH_TIME + 0.08;
      const dir = move.x || move.y ? move : { x: Math.cos(a.facing), y: Math.sin(a.facing) };
      a.vx = dir.x * DASH_SPEED;
      a.vy = dir.y * DASH_SPEED;
      if (live) {
        this.fireTriggers(hero, "onDash", a.x, a.y);
        hero.resources.broadcast({ type: "dashStart" });
      }
    }

    if (a.dashTimer <= 0) {
      // Tar slows a walk to a crawl but never a dash — the dash stays the way out.
      const slow = disabled.move ? 0 : this.mireSlowAt(a.x, a.y) * hero.sc.slowMultiplier();
      const speed = PLAYER_SPEED * hero.player.moveMult * (1 + hero.sc.modsContribution().moveSpeed) * slow;
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
    if (!live) return;
    const travelled = dist(beforeX, beforeY, a.x, a.y);
    if (travelled > 0.01) hero.resources.broadcast({ type: "move", distance: travelled });
    hero.posHistory.unshift({ x: a.x, y: a.y });
    if (hero.posHistory.length > 90) hero.posHistory.length = 90;
  }

  /** Ailments on a hero tick here, along with the mana a void hit tears out. */
  private updateHeroStatuses(hero: Hero, dt: number): void {
    if (hero.downed) return;
    const burn = hero.sc.manaBurnPerSecond();
    if (burn > 0) hero.player.drainMana(burn * dt);
    hero.sc.tick(dt, { onDamage: (p) => this.dealDamage(hero.index, p) });
    hero.syncChargeRate();
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
    // `Ability.followUp` is spent by pressing the ability again inside its window, so the
    // press has to reach the executor even while the ability is cooling down.
    if (!hero.rt.ready(ability) && !hero.rt.followUpOpen(ability.id, this)) return;
    const a = hero.avatar;
    if (this.laneCharge(hero, ability).blocked) {
      this.events.push({ kind: "pickup", x: a.x, y: a.y - 20, label: "no room", color: "#fbbf24" });
      return;
    }
    const res = hero.rt.castAbility(this, hero.index, ability, this.castInputFor(hero, ability));
    if (!res.ok) {
      if (res.failure === "cannot-afford") {
        this.events.push({ kind: "pickup", x: a.x, y: a.y - 20, label: "no resource", color: "#60a5fa" });
      }
      return;
    }
    this.events.push({
      kind: "cast", x: a.x, y: a.y - 34,
      label: res.fromFollowUp ? `${ability.name}!` : ability.name,
      color: hero.player.heroClass.color,
    });
    applyRuleFx(this.ruleContext(hero), ability);
    // A combo is the tail of the first press; firing the on-cast rule hooks a second
    // time would double every "when you cast" keystone for free.
    if (!res.fromFollowUp) rulesOnCast(this, hero, ability);
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
    if (!base) return;
    const ability = p.resolvedAbility(base);
    const meter = hero.resources.ultimateMeter();

    // The second half of an ultimate is paid for by the first half: pressing it again
    // inside its follow-up window spends the window, not another full meter.
    const combo = hero.rt.followUpOpen(ability.id, this);
    // Checked before the meter is spent, not after: a blocked lane must cost nothing.
    if (this.laneCharge(hero, ability).blocked) {
      this.events.push({ kind: "pickup", x: a.x, y: a.y - 20, label: "no room to charge", color: "#fbbf24" });
      return;
    }
    if (!combo) {
      if (!meter || meter.fraction < 1) return;
      if (!hero.rt.ready(ability)) return;
      meter.value = 0;
    }
    const res = hero.rt.castAbility(this, hero.index, ability, this.castInputFor(hero, ability));
    if (!res.ok) {
      if (!combo && meter) meter.value = meter.max; // couldn't fire — hand the meter back
      return;
    }
    this.events.push({
      kind: "ultimate", id: ability.id, name: ability.name, color: p.heroClass.color, x: a.x, y: a.y,
    });
    this.events.push({ kind: "shake", amount: 14 });
    applyRuleFx(this.ruleContext(hero), ability);
    if (!res.fromFollowUp) {
      rulesOnUltimate(this, hero);
      this.fireTriggers(hero, "onUltimate", a.x, a.y);
    }
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
    if (dead) {
      this.events.push({ kind: "death", x: m.x, y: m.y, elite: null });
      const owner = this.heroes[m.owner];
      if (owner && owner.player.build.rules.size > 0) rulesOnMinionDeath(this, owner, m.x, m.y);
    } else {
      this.events.push({ kind: "nova", x: m.x, y: m.y, radius: 12 });
    }
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
  /**
   * How far along `angle` this hero could actually travel, and where they would land.
   * Walks the lane in short steps and stops at the first wall, so a partly-blocked lane
   * still gives you as much of the charge as it can. Pure — `leapTo` is what commits it,
   * and `laneCharge` uses it to answer "is there any room to charge?" *before* an
   * ultimate is paid for.
   */
  private leapScan(hero: Hero, angle: number, reach: number): { x: number; y: number; travelled: number } {
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
    return { x, y, travelled: dist(a.x, a.y, x, y) };
  }

  private leapTo(hero: Hero, angle: number, reach: number): { x: number; y: number } {
    const a = hero.avatar;
    const landing = this.leapScan(hero, angle, reach);
    a.x = landing.x;
    a.y = landing.y;
    // A leap is a commitment, so it comes with the same window a dash does.
    a.invulnTimer = Math.max(a.invulnTimer, 0.2);
    return { x: landing.x, y: landing.y };
  }

  /**
   * True when `ability` is a lane charge — it leads with a `style: "charge"` move along
   * the facing — and the wall in front leaves nowhere to charge to.
   *
   * A charge that lands you where you started is not a weaker charge, it is the ability
   * failing to happen: `lancer.meteor_lance` spent a full ultimate meter, dealt its
   * damage and moved the player nowhere on the 8.6% of (position, direction) pairs a
   * depth-9 floor has fully blocked. Refusing the cast up front is the only shape of fix
   * that is not exploitable — refunding the meter *after* the effects ran would let a
   * player stand against a wall and farm the damage for free.
   *
   * Partly-blocked lanes are deliberately untouched. `leapScan` already gives you as much
   * of the charge as fits, and "as far as the lane allows" is the intended behaviour; only
   * a lane that cannot clear the hero's own footprint counts as no room at all.
   */
  private laneCharge(hero: Hero, ability: Ability): { blocked: boolean } {
    const lead = ability.effects.find((e) => e.kind === "move");
    if (!lead || lead.kind !== "move") return { blocked: false };
    if (lead.style !== "charge" || lead.toTarget) return { blocked: false };
    const reach = lead.distance ?? 120;
    const room = this.leapScan(hero, hero.avatar.facing, reach).travelled;
    return { blocked: room < hero.avatar.radius * 2 };
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
    // An Armored affix (`damageTakenMult` < 1) is a flat cut on top of resists — the
    // spec's "damage resistance" affix, kept off the resist channel so physical is not
    // exempt from it the way it is from elemental resist.
    const amplified = amount * e.sc.incomingDamageMultiplier() * e.damageTakenMult;
    let mitigated = opts.raw
      ? amount * e.damageTakenMult
      : mitigateWithResists(amplified, element, e.resists);
    // A shieldbearer bounces most of a hit that lands on its front — you have to get
    // around it or break its guard (a stagger from heavy knockback), never trade with it.
    if (e.archetype.behavior === "shieldbearer" && !opts.raw && e.state === "active") {
      const fromAttacker = knockAngle + Math.PI;
      const diff = Math.abs(((fromAttacker - e.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < 1.15) mitigated *= 0.4;
    }
    let dealt = Math.max(1, Math.round(mitigated));
    // A Warded affix's regenerating shield is eaten before health.
    if (e.affixState.ward > 0) {
      const absorbed = Math.min(e.affixState.ward, dealt);
      e.affixState.ward -= absorbed;
      dealt -= absorbed;
    }
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
    // Floor-clear quota (UAT §5). Only the wave director's own roster counts, so a
    // summoner's chaff or a Splitting monster's shards can neither pad the objective
    // nor hold it open; a boss floor is satisfied outright by its boss.
    if (e.boss) this.killsSoFar = this.killsRequired;
    else if (e.fromWave) this.killsSoFar++;
    if (source.local) this.state.stats.enemiesKilled++;
    // Kill / death events for granted effects and gear triggers. The killing blow's own
    // contribution to the meter is credited by `creditResourcesForHit` at the hit that
    // landed it (so THE ULTIMATE RULE holds); this adds the "an elite is worth several
    // ordinary kills" bonus the legacy charge economy had — never from an ultimate kill.
    this.bus.emit({ type: "kill", actorId: source.index, x: e.x, y: e.y });
    this.bus.emit({ type: "enemyDeath", actorId: Dungeon.ENEMY_ID_BASE + e.id, x: e.x, y: e.y });
    if (e.elite && !e.summoned) {
      this.elitesKilled++;
      this.events.push({ kind: "shake", amount: 9 });
    }
    if (!fromUltimate) {
      const bonus = e.boss ? 5 : e.elite ? 3 : 0;
      for (let n = 0; n < bonus; n++) {
        source.resources.broadcast({ type: "kill" });
        source.resources.broadcast({ type: "enemyDeath" });
      }
    }
    this.fireTriggers(source, "onKill", e.x, e.y);
    rulesOnKill(this, source, e);
    if (e.affixes.length > 0) this.affixOnDeath(e, source);
    // A bomber goes off no matter how it dies (UAT §2) — the blast, and a pool where it fell.
    if (e.archetype.behavior === "bomber" && !e.summoned) {
      const el: Element = e.element === "physical" ? "fire" : e.element;
      this.affixBurst(e.x, e.y, 55, e.damage * 0.7, el);
      this.ground.push({
        x: e.x, y: e.y, px: e.x, py: e.y, radius: 40,
        element: el, damage: Math.max(2, e.damage * 0.15),
        remaining: 2.5, tickTimer: 0.5, hitsPlayer: true, hitsEnemies: false,
        color: ELEMENT_COLORS[el],
      });
      this.events.push({ kind: "shake", amount: 5 });
    }
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

    // Named items (UAT §28). A boss rolls its own table, a wave monster the world table;
    // `data/named.ts` owns who drops what and at what odds — this only asks.
    if (e.boss) this.dropNamed(e.x, e.y, { kind: "boss", bossId: e.boss.spec.id }, source);
    else if (e.fromWave) {
      this.dropNamed(e.x, e.y, { kind: "worldDrop", depth: this.profile.depth, elite: e.elite !== null }, source);
    }
  }

  /**
   * Rolls the named-item table for one event and drops whatever hit, forged at this
   * floor's depth. `danger` (rift tier × Challenger) lifts the odds — UAT §16's "harder
   * pays better" — through the one helper in `data/named.ts`. Recorded in the account's
   * records only for the local hero's drops, since every browser keeps its own save.
   */
  private dropNamed(x: number, y: number, q: NamedDropQuery, source: Hero): void {
    for (const def of rollNamedDrops(q, this.rng, this.config.danger)) {
      const item = forgeNamedItem(def, this.profile.depth, this.rng);
      if (source.local) this.state.noteNamed(def.id);
      this.dropPickup(x, y, { kind: "item", item, rarity: item.rarity });
    }
  }

  /**
   * The reward for clearing, spilled around the portal. Per-kill drops are deliberately
   * thin, so this is where a floor actually pays: it can only be earned by finishing,
   * and it's still lost if you die on the way to the exit.
   */
  private dropClearCache(): void {
    // Around the completion portal, not the entrance — the cache is the reward for
    // finishing, so it lands where finishing sends you.
    const { x, y } = this.completionPortal ?? this.portal;
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
    // The clear cache has its own named table (UAT §28): a reward that, like the rest of
    // the cache, only exists for finishing the floor.
    this.dropNamed(x, y, { kind: "clearCache", depth: this.profile.depth, mode: this.config.mode.id }, this.localHero);

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
    // The Vigil pays in keys (UAT §17): one of the day's tier, guaranteed, here and only
    // here — so it can't be had without closing the floor, and only once a day.
    if (this.config.daily) this.dropPickup(x, y, { kind: "key", keyTier: this.config.daily.keyTier });
    // The Convergence's signature reward lands only on the boss floor (UAT §17): one
    // guaranteed key at the week's tier — Adept's Trove or Collector's Hoard more often
    // than not, tiers the Quartermaster otherwise only sells outright — plus one item
    // forced to at least Legendary. Floors 1-3 pay the ordinary depth-weighted loot above
    // and nothing more, so the reward can't be farmed piecemeal.
    if (this.config.weekly && this.config.lastFloor) {
      this.dropPickup(x, y, { kind: "key", keyTier: this.config.weekly.keyTier });
      const item = rollItem({
        rarity: WEEKLY_GUARANTEED_RARITY,
        type: randomItemType(this.rng, this.player.heroClass.affinity),
        ilvl: this.profile.depth,
        rng: this.rng,
      });
      this.dropPickup(x, y, { kind: "item", item, rarity: WEEKLY_GUARANTEED_RARITY });
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

      // Periodic affix behaviours — blink, ward regen, a summoner's timer, a heal aura.
      if (e.affixes.length > 0) this.tickAffixes(e, dt);
      // An elite's signature move: a telegraphed ground slam it winds up on its own timer.
      if (e.elite) this.tickEliteSlam(e, dt);

      // Everything chases whoever is nearest to it, which is all the "aggro" a horde
      // shooter needs: bodies flow to the nearest player and the party gets split up
      // exactly as much as it deserves to be.
      const target = this.nearestHero(e.x, e.y);
      const a = target.avatar;
      const d = dist(e.x, e.y, a.x, a.y);
      const toPlayer = Math.atan2(a.y - e.y, a.x - e.x);
      // A charger locks its facing when it commits — the wind-up and the dash both go
      // where it was pointing, not where you dodged to.
      const facingLocked = e.archetype.behavior === "charger"
        && (e.windup > 0 || e.chargeVx !== 0 || e.chargeVy !== 0);
      if (!facingLocked) e.facing = toPlayer;

      // The boss brain owns its own movement whenever it's casting or charging.
      const bossBusy = e.boss ? updateBoss(this, e, dt) : false;

      // With a wall in the way nothing holds its ground: ranged types reposition for a
      // shot and everything else takes the long way around, instead of standing there.
      const hasLos = !lineBlocked(this.level, e.x, e.y, a.x, a.y);

      // Archetype behaviour (UAT §2): a summoner's call, a leech's pulse, a charger
      // lining up its rush. Returns true when it has taken over this enemy's turn.
      const behaviourBusy = this.tickArchetypeBehavior(e, dt, target, d, hasLos);

      // Ranged types hold a standoff distance; melee types close.
      let moveAngle = toPlayer;
      let move = !bossBusy && !behaviourBusy;
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

      // A charger mid-rush travels on its stored velocity, not the flow field — a
      // straight line you step out of, with a hard stop and a long recovery after.
      if (e.chargeVx !== 0 || e.chargeVy !== 0) {
        e.x += e.chargeVx * dt;
        e.y += e.chargeVy * dt;
        if (d <= e.radius + a.radius + 6) {
          this.hurtPlayer(target, e.damage * 1.0, e.element, AILMENT_CHANCE);
          e.chargeVx = 0; e.chargeVy = 0;
          e.behaviorTimer = this.affixRng.range(3, 4.5);
        }
        e.chargeVx = approach(e.chargeVx, 0, 620 * dt);
        e.chargeVy = approach(e.chargeVy, 0, 620 * dt);
        move = false;
      }

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
      // one should still cost something. A bomber has no ordinary attack — it detonates
      // (handled in its behaviour tick); a sniper's wind-up is long enough to run from.
      e.attackTimer -= dt;
      const canAutoAttack = !bossBusy && !behaviourBusy && e.chargeVx === 0 && e.chargeVy === 0
        && e.archetype.behavior !== "bomber";
      if (canAutoAttack && e.attackTimer <= 0 && e.windup <= 0 && d <= e.archetype.attackRange && hasLos) {
        const windBase = e.archetype.behavior === "sniper" ? 1.85 : e.archetype.ranged ? 0.35 : 0.28;
        e.windup = windBase * this.profile.telegraph;
        e.attackTimer = e.attackCooldown * this.profile.aggression;
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

    // A charger's wind-up ends in a dash along the direction it locked, not a swing.
    if (e.archetype.behavior === "charger") {
      const sp = 500;
      e.chargeVx = Math.cos(e.facing) * sp;
      e.chargeVy = Math.sin(e.facing) * sp;
      return;
    }
    // A bomber's wind-up ends in it going off. The blast itself lives in `killEnemy`
    // (a bomber "explodes on death" however it dies) — here we just kill it.
    if (e.archetype.behavior === "bomber") {
      if (e.health > 0) this.killEnemy(e, this.nearestHero(e.x, e.y));
      return;
    }

    if (e.archetype.ranged) {
      const angle = Math.atan2(a.y - e.y, a.x - e.x);
      const speed = e.archetype.behavior === "sniper" ? 360 : 210;
      this.spawnEnemyBolt(e.x, e.y, angle, speed, e.damage, e.element, AILMENT_CHANCE);
      if (e.affixes.length > 0) this.affixOnHitHero(e, target);
      return;
    }
    if (dist(e.x, e.y, a.x, a.y) <= e.archetype.attackRange + e.radius * 0.5) {
      this.hurtPlayer(target, e.damage, e.element, AILMENT_CHANCE);
      if (e.affixes.length > 0) this.affixOnHitHero(e, target);
    }
  }

  /**
   * An elite's signature attack (UAT §4): a telegraphed ground slam on its own timer,
   * separate from its ordinary swing. Big, readable, dodgeable — the shape the fight is
   * asking you to respect. Follows the elite while winding up, so burning it down through
   * the cast beats the hit outright, exactly like a boss telegraph.
   */
  private tickEliteSlam(e: Enemy, dt: number): void {
    if (e.state !== "active" || e.sc.disables().attack) return;
    e.eliteCast -= dt;
    if (e.eliteCast > 0) return;
    e.eliteCast = this.affixRng.range(4.5, 6.5);
    const rarity = e.elite ? rarityIndex(e.elite) : 1;
    this.addTelegraph({
      shape: "circle", x: e.x, y: e.y, angle: 0,
      radius: 94 + rarity * 6, inner: 0, arc: 0, width: 0,
      total: 1.05 * this.profile.telegraph,
      damage: e.damage * 2.3,
      element: e.element,
      color: ELEMENT_COLORS[e.element],
      hitsPlayer: true, hitsEnemies: false,
      linger: 0,
      followId: e.id,
    });
    this.events.push({ kind: "shake", amount: 5 });
  }

  /**
   * The per-archetype AI branch (UAT §2). Runs once a frame for the roles that do more
   * than walk-and-swing. Returns true when the behaviour has claimed this enemy's turn,
   * so the generic movement in `updateEnemies` stands down for the frame.
   */
  private tickArchetypeBehavior(e: Enemy, dt: number, target: Hero, d: number, hasLos: boolean): boolean {
    const a = target.avatar;
    switch (e.archetype.behavior) {
      case "charger": {
        if (e.chargeVx !== 0 || e.chargeVy !== 0) return true; // mid-rush, handled by movement
        if (e.windup > 0) return true;                          // winding up the rush
        e.behaviorTimer -= dt;
        if (e.behaviorTimer > 0) return false;
        if (!hasLos || d < 80 || d > 400) { e.behaviorTimer = 0.4; return false; }
        // Lock onto where the player is now and flash red — the tell is the still,
        // facing body, and the dash that follows goes exactly where it was pointing.
        e.facing = Math.atan2(a.y - e.y, a.x - e.x);
        e.windup = 0.62 * this.profile.telegraph;
        e.behaviorTimer = this.affixRng.range(4, 6);
        return true;
      }
      case "bomber": {
        if (e.windup > 0) return true;
        if (d <= e.radius + a.radius + 16 && hasLos) {
          e.facing = Math.atan2(a.y - e.y, a.x - e.x);
          e.windup = 0.7 * this.profile.telegraph;
          return true;
        }
        return false; // still rushing in
      }
      case "summoner": {
        e.behaviorTimer -= dt;
        if (e.behaviorTimer > 0) return false;
        e.behaviorTimer = this.affixRng.range(6, 9);
        if (this.enemies.length < this.profile.maxAlive + 4) {
          const ang = this.affixRng.angle();
          const spot = resolveCircle(
            this.level,
            clamp(e.x + Math.cos(ang) * 40, 40, this.width - 40),
            clamp(e.y + Math.sin(ang) * 40, 40, this.height - 40),
            ARCHETYPES.swarmer.radius,
          );
          this.enemies.push(
            this.makeEnemy(ARCHETYPES.swarmer, spot.x, spot.y, { summoned: true, healthMult: 0.6 }),
          );
          this.events.push({ kind: "death", x: e.x, y: e.y, elite: null });
        }
        return false; // it still kites and shoots
      }
      case "leech": {
        e.behaviorTimer -= dt;
        if (e.behaviorTimer > 0) return false;
        e.behaviorTimer = this.affixRng.range(4, 5.5);
        let healed = false;
        for (const other of this.enemies) {
          if (other === e || other.boss || other.health <= 0 || other.health >= other.maxHealth) continue;
          if (dist(e.x, e.y, other.x, other.y) > 150) continue;
          other.health = Math.min(other.maxHealth, other.health + other.maxHealth * 0.03);
          healed = true;
        }
        if (healed) this.events.push({ kind: "death", x: e.x, y: e.y, elite: null });
        return false;
      }
      default:
        // melee / ranged / shieldbearer / sniper — nothing timed; shieldbearer's block
        // is in `damageEnemy`, the sniper's long wind-up is in the attack trigger.
        return false;
    }
  }

  // --- monster affixes (UAT §3) ------------------------------------------
  // The data lives in `data/monster-affixes.ts`; these three hooks are the only place
  // an affix's behaviour tag turns into something happening. A new tag is one `case`.

  /** Periodic affix behaviour — runs once per frame for an active, affixed monster. */
  private tickAffixes(e: Enemy, dt: number): void {
    for (const affix of e.affixes) {
      const p = affix.periodic;
      if (!p) continue;
      const left = (e.affixState.timers[affix.id] ?? this.affixRng.range(0, p.every)) - dt;
      if (left > 0) { e.affixState.timers[affix.id] = left; continue; }
      e.affixState.timers[affix.id] = p.every;
      switch (p.kind) {
        case "regenWard": {
          const cap = e.maxHealth * 0.18 * (e.elite ? 1.6 : 1);
          e.affixState.ward = Math.min(cap, e.affixState.ward + cap);
          break;
        }
        case "blink": {
          const hero = this.nearestHero(e.x, e.y).avatar;
          const gap = dist(e.x, e.y, hero.x, hero.y);
          if (gap < e.radius + hero.radius + 40) break;
          const reach = Math.min(gap - (e.radius + hero.radius + 20), 240);
          const ang = Math.atan2(hero.y - e.y, hero.x - e.x);
          const to = resolveCircle(
            this.level,
            clamp(e.x + Math.cos(ang) * reach, 40, this.width - 40),
            clamp(e.y + Math.sin(ang) * reach, 40, this.height - 40),
            e.radius,
          );
          e.x = to.x; e.y = to.y;
          this.events.push({ kind: "death", x: e.x, y: e.y, elite: null });
          break;
        }
        case "healAura": {
          for (const other of this.enemies) {
            if (other === e || other.boss || other.health >= other.maxHealth) continue;
            if (dist(e.x, e.y, other.x, other.y) > 150) continue;
            other.health = Math.min(other.maxHealth, other.health + other.maxHealth * 0.04);
          }
          break;
        }
        case "summon": {
          const alive = this.enemies.length;
          if (alive >= this.profile.maxAlive + 4) break;
          const kind: EnemyKind = "swarmer";
          if (ARCHETYPES[kind].minDepth > this.profile.depth) break;
          const ang = this.affixRng.angle();
          const spot = resolveCircle(
            this.level,
            clamp(e.x + Math.cos(ang) * 44, 40, this.width - 40),
            clamp(e.y + Math.sin(ang) * 44, 40, this.height - 40),
            ARCHETYPES[kind].radius,
          );
          this.enemies.push(this.makeEnemy(ARCHETYPES[kind], spot.x, spot.y, { summoned: true, healthMult: 0.7 }));
          break;
        }
      }
    }
  }

  /** Fires when an affixed monster's attack connects with a hero. */
  private affixOnHitHero(e: Enemy, hero: Hero): void {
    for (const affix of e.affixes) {
      switch (affix.onHitHero) {
        case "leech":
          e.health = Math.min(e.maxHealth, e.health + e.damage * 0.6);
          break;
        case "caustic": {
          const kind = STATUS_FOR_ELEMENT[e.element === "physical" ? "poison" : e.element];
          if (kind) {
            hero.sc.apply(kind, {
              hitDamage: Math.max(1, Math.round(e.damage)), potency: 1.6,
              sourceActorId: -1, chance: 1, roll: () => this.affixRng.next(),
            });
          }
          break;
        }
        case "enfeeble":
          hero.sc.apply("weakened", {
            hitDamage: 0, sourceActorId: -1, chance: 1, roll: () => this.affixRng.next(),
          });
          break;
        case "sap":
          hero.player.drainMana(hero.player.maxMana * 0.14);
          break;
        case "arc": {
          const base = Math.atan2(hero.avatar.y - e.y, hero.avatar.x - e.x);
          for (const off of [-0.5, 0.5]) {
            this.spawnEnemyBolt(e.x, e.y, base + off, 240, e.damage * 0.5, "lightning", AILMENT_CHANCE);
          }
          break;
        }
      }
    }
  }

  /** Fires as an affixed monster dies — slotted next to `rulesOnKill`, `e` still valid. */
  private affixOnDeath(e: Enemy, source: Hero): void {
    for (const affix of e.affixes) {
      switch (affix.onDeath) {
        case "detonate":
          this.affixBurst(e.x, e.y, 74, e.damage * 1.8, e.element === "physical" ? "fire" : e.element);
          this.events.push({ kind: "shake", amount: 8 });
          break;
        case "miasma":
          this.ground.push({
            x: e.x, y: e.y, px: e.x, py: e.y, radius: 60,
            element: "poison", damage: Math.max(2, e.damage * 0.35),
            remaining: 6, tickTimer: 0.5, hitsPlayer: true, hitsEnemies: false,
            color: ELEMENT_COLORS.poison,
          });
          break;
        case "volley":
          for (let i = 0; i < 8; i++) {
            this.spawnEnemyBolt(e.x, e.y, (i / 8) * Math.PI * 2, 200, e.damage * 0.7, e.element, AILMENT_CHANCE);
          }
          break;
        case "revitalise":
          for (const other of this.enemies) {
            if (other === e || other.boss || other.health <= 0) continue;
            if (dist(e.x, e.y, other.x, other.y) > 165) continue;
            other.health = Math.min(other.maxHealth, other.health + other.maxHealth * 0.25);
          }
          break;
        case "split": {
          if (e.affixState.noSplit || e.summoned) break;
          for (let i = 0; i < 2; i++) {
            const ang = this.affixRng.angle();
            const spot = resolveCircle(
              this.level,
              clamp(e.x + Math.cos(ang) * 26, 40, this.width - 40),
              clamp(e.y + Math.sin(ang) * 26, 40, this.height - 40),
              e.archetype.radius * 0.7,
            );
            const spawn = this.makeEnemy(e.archetype, spot.x, spot.y, { healthMult: 0.34, noAffixes: true });
            spawn.radius = e.archetype.radius * 0.7;
            spawn.damage *= 0.6;
            spawn.state = "active";
            spawn.spawnTimer = 0;
            this.enemies.push(spawn);
          }
          break;
        }
      }
    }
    // Feed elite kills into the same "worth several kills" bonus the legacy economy had —
    // handled in killEnemy already; nothing extra needed here.
    void source;
  }

  /** A one-shot damaging ring — a Volatile monster's death, kept off the projectile path. */
  private affixBurst(x: number, y: number, radius: number, damage: number, element: Element): void {
    for (const hero of this.heroes) {
      if (!hero.alive) continue;
      if (dist(hero.avatar.x, hero.avatar.y, x, y) <= radius + hero.avatar.radius) {
        // Ailment left off on purpose: it would roll the main rng and shift the stream.
        this.hurtPlayer(hero, damage, element, 0);
      }
    }
    this.events.push({ kind: "death", x, y, elite: null });
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
      // Also on the typed bus: `dodge` is what closes a Duelist's or a Bard's `reactive`
      // window, and the resource layer is not something the executor listens to.
      this.bus.emit({ type: "dodge", actorId: hero.index, x: a.x, y: a.y });
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
    // And on the typed bus, which is what closes a `reactive` window. `damageTaken` is
    // the event eighteen of the roster's reactives key on — the Juggernaut's retaliation,
    // the Duelist's ripostes, the Warden's and the Trickster's counters.
    if (dealt > 0) this.bus.emit({ type: "damageTaken", actorId: hero.index, amount: dealt, x: a.x, y: a.y });
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
      // The universal tree's pickup-radius nodes (UAT §18) widen both ranges. Applied to
      // the *claimant* rather than to whoever has the biggest radius on the floor, which
      // keeps the loot rule above intact: a wider magnet reaches further, but it still
      // can't reach past a hero standing closer.
      const reach = claimant.player.pickupRangeMult;
      // A short delay before magnetism kicks in lets the drop pop out and be seen.
      if (p.life > 0.35 && d < MAGNET_RANGE * reach) p.magnet = true;

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

      if (p.life > 0.3 && d < PICKUP_RANGE * reach) {
        this.collect(claimant, p);
        this.pickups.splice(i, 1);
      }
    }
  }

  private collect(hero: Hero, p: Pickup): void {
    switch (p.kind) {
      // The universal tree's Avarice path (UAT §18) is the only *player-sourced* loot
      // multiplier in the game — everything else (mode, depth, Challenger) is decided by
      // where you went, not by who went there. It lands here, at the moment of pickup,
      // because this is the one place a drop has an owner: `dropPickup` doesn't, and the
      // clear cache is dropped for the floor rather than for a hero.
      case "coin": {
        const coins = Math.round(p.value * hero.player.coinFindMult);
        hero.loot.coins += coins;
        this.events.push({ kind: "pickup", x: p.x, y: p.y, label: `+${coins}`, color: "#fbbf24" });
        break;
      }
      case "key":
        if (p.keyTier) {
          hero.loot.keys[p.keyTier as ChestTier]++;
          this.events.push({ kind: "pickup", x: p.x, y: p.y, label: `${p.keyTier} Key`, color: "#e2e8f0" });
        }
        break;
      case "gem": {
        const gems = Math.round(p.value * hero.player.gemFindMult);
        hero.loot.gems += gems;
        this.events.push({ kind: "pickup", x: p.x, y: p.y, label: `+${gems} gems`, color: "#f0abfc" });
        break;
      }
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
   * The entrance portal is live for the whole floor, not just after a clear. Being able
   * to run for the exit mid-wave is what makes the "lose everything on death" rule
   * fair: a bad dive costs you the rest of the floor, not the entire run. Since UAT §6
   * it is *only* an exit — it charges a hefty toll before the clear (see
   * `earlyExtractLoot`) and it never descends.
   */
  get atPortal(): boolean {
    return this.phase !== "dead" && dist(this.avatar.x, this.avatar.y, this.portal.x, this.portal.y) < 34;
  }

  /** Standing in the completion portal, which only exists once the quota is met. */
  get atCompletionPortal(): boolean {
    const p = this.completionPortal;
    return p !== null && this.phase !== "dead" && dist(this.avatar.x, this.avatar.y, p.x, p.y) < 34;
  }

  /** Bailing out through the entrance before the floor is done — the penalty exit. */
  get canEarlyExtract(): boolean {
    return this.phase === "fighting" && this.atPortal;
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
    this.bank(true);
  }

  /** `credit` is whether the floor counts as *done* — the depth record, the next
   *  unlocked delve depth and the rift/planet tier all hang off it. An early
   *  extraction banks its scraps without it (UAT §6: leaving early forfeits the
   *  floor's progression as well as its loot), which is also what stops a player
   *  unlocking depth 30 by diving to 29 and immediately walking back out. */
  private bank(credit: boolean): void {
    this.state.potions = this.localHero.potions;
    this.state.addCoins(this.loot.coins);
    this.state.addGems(this.loot.gems);
    for (const t of CHEST_TIERS) this.state.keys[t] += this.loot.keys[t];
    for (const e of ELEMENTS) {
      if (this.loot.materials[e] > 0) this.state.addMaterials(e, this.loot.materials[e]);
    }
    this.state.addToInventory(this.loot.items);
    if (credit) {
      this.state.recordDepth(this.profile.depth, this.config);
      this.state.stats.runsCompleted++;
      // The Legend becomes Complete (UAT §13). Credited from the *banked* clear rather
      // than from the boss dying, so it costs exactly what every other floor reward
      // costs: dying on the way out loses it, the same as the loot.
      if (this.proving) this.state.completeLegend(this.proving);
    }
    this.loot.coins = 0;
    this.loot.gems = 0;
    this.loot.items = [];
    this.loot.keys = emptyKeys();
    this.loot.materials = emptyMaterials();
  }

  /**
   * The penalty exit (UAT §6): out through the entrance portal with the floor's quota
   * unmet. Nothing physical leaves with you — every unbanked item, key and unit of
   * material is forfeit — and only a thin slice of the coins and gems survives. XP is
   * untouched, since it was granted as it was earned and death doesn't take it either.
   *
   * The floor's *progression* is forfeit with it — no depth record, no newly unlocked
   * delve depth, no rift tier — because none of that was earned.
   *
   * The point is that you can never dip out of a dangerous floor still holding the
   * valuable loot: the decision has to be "risk finishing, or lose the drops".
   */
  earlyExtractLoot(): { coins: number; gems: number; itemsLost: number } {
    const itemsLost = this.loot.items.length;
    this.loot.items = [];
    this.loot.keys = emptyKeys();
    this.loot.materials = emptyMaterials();
    this.loot.coins = Math.floor(this.loot.coins * EARLY_EXTRACT_KEEP);
    this.loot.gems = Math.floor(this.loot.gems * EARLY_EXTRACT_KEEP);
    const kept = { coins: this.loot.coins, gems: this.loot.gems, itemsLost };
    this.bank(false);
    return kept;
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

  zonesOwnedBy(hero: Hero): { x: number; y: number; radius: number; element: Element; benefit: boolean }[] {
    const out: { x: number; y: number; radius: number; element: Element; benefit: boolean }[] = [];
    for (const g of this.ground) {
      if (g.owner !== hero.index) continue;
      out.push({ x: g.x, y: g.y, radius: g.radius, element: g.element, benefit: !!g.benefit });
    }
    return out;
  }

  // --- RuleHost: the summon layer, for the construct/summon keystones (B-4) ---

  minionsOwnedBy(hero: Hero): MinionView[] {
    const out: MinionView[] = [];
    for (const m of this.minions) {
      if (m.owner !== hero.index || m.health <= 0) continue;
      out.push({
        id: Dungeon.MINION_ID_BASE + m.id,
        x: m.x, y: m.y, health: m.health, maxHealth: m.maxHealth, unit: m.unit,
      });
    }
    return out;
  }

  summonFor(
    hero: Hero, x: number, y: number, count: number,
    opts: { lifespan?: number; inherit?: number; unit?: string } = {},
  ): number[] {
    return this.spawnMinion({
      ownerId: hero.index,
      unit: opts.unit ?? "construct",
      x, y, count,
      duration: opts.lifespan ?? 0,
      command: { behavior: "guardPoint", inheritPower: opts.inherit ?? MINION_DEFAULT_INHERIT },
    });
  }

  repairMinion(id: number, amount: number): void {
    const m = this.minionByHostId(id);
    if (m && m.health > 0) m.health = Math.min(m.maxHealth, m.health + amount);
  }

  sustainMinion(id: number, seconds: number): void {
    const m = this.minionByHostId(id);
    if (m && m.health > 0) m.remaining = Math.max(m.remaining, seconds);
  }

  focusSummons(hero: Hero, target: Enemy | null): void {
    for (const m of this.minions) {
      if (m.owner !== hero.index) continue;
      if (target) {
        m.behavior = "commandTarget";
        m.commandTargetId = target.id;
      } else {
        m.behavior = "aggroNearest";
        m.commandTargetId = null;
      }
    }
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
      ...(owner ? { owner: owner.index } : {}),
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
    dashTimer: 0, dashCooldown: 0, dashStock: 1, invulnTimer: 0, dashInvuln: 0, hitFlash: 0,
    buffAttackSpeed: 0, buffLifeOnHit: 0,
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export { TAU };
