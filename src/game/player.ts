import { clamp } from "../core/math";
import {
  CLASSES, DEFAULT_CLASS, treePointsFor, type ClassId, type HeroClass,
} from "../data/classes";
import {
  ELEMENTS, resistFraction, zeroResists, type Element, type Resists,
} from "../data/elements";
import { EQUIP_SLOTS, type EquipSlot } from "../data/items";
import {
  ELEMENT_RESIST_KEY, addMods, elementalFractions, zeroMods, type Mods,
} from "../data/mods";
import { RUN_MODES, type RunModeId } from "../data/modes";
import { WEAPONS, type WeaponFamily, type WeaponSpec } from "../data/weapons";
import type { Ability } from "../combat/ability";
import { ResourceSet, type ResourceSpec } from "../combat/resources";
import {
  ABILITY_BY_ID, CLASS_BY_ID, applyBuild, foldEffects, installClass, patchResourceSpec,
  resolveClassBuild, type ClassRuntime, type PilotClass, type ResolvedBuild,
} from "../progression/index";
import {
  canAllocateV2, progNodeById, pruneAllocationV2, spentPointsV2, type NodeEffect, type TreeNodeV2,
} from "../progression/nodes";
import {
  UNIVERSAL_TREE, UNIVERSAL_TREE_ID, resolveUniversalBuild,
} from "../progression/universal";
import { itemMods, requiredLevel, zeroStats, type Item, type Stats } from "./item";
import { NAMED_BY_ID } from "../data/named";
import { RELIC_SLOTS, relicSocketBlocker, wornRelicEffects } from "../data/relics";

/** Fraction of max health a level-up restores. Not a full heal — that made deaths rare. */
const LEVEL_UP_HEAL = 0.6;
/** Critical chance before class, gear and tree. Everything is built on top of this. */
const BASE_CRIT = 0.08;
/** Critical multiplier before any `critDamage` modifier. */
const BASE_CRIT_MULT = 1.8;

/**
 * When each of a class's nine normal abilities unlocks, by index into
 * `PilotClass.abilities` (the ultimate is excluded and is always available once the
 * meter is full). Deliberately front-loaded — three at level 1 so a brand new character
 * has a real kit — and the last one comes in around the depth a rift opens.
 */
const ABILITY_UNLOCK_LEVELS: readonly number[] = [1, 1, 3, 5, 8, 11, 15, 20, 26];

export const SKILL_SLOTS = 3;

/**
 * `installClass` registers a class's statuses on the shared registry and flattens its
 * tree; doing it once per class and caching the result keeps `Player.build` cheap to
 * recompute on every gear or tree change. Module-level, shared by every `Player` of the
 * same class — the runtime is immutable data.
 */
const CLASS_RUNTIMES = new Map<string, ClassRuntime>();
export function classRuntime(id: string): ClassRuntime | undefined {
  const existing = CLASS_RUNTIMES.get(id);
  if (existing) return existing;
  const def = CLASS_BY_ID[id];
  if (!def) return undefined;
  const rt = installClass(def);
  CLASS_RUNTIMES.set(id, rt);
  return rt;
}

export type Equipment = Record<EquipSlot, Item | null>;

export function emptyEquipment(): Equipment {
  return { weapon: null, armor: null, shield: null, ring: null, gloves: null, necklace: null };
}

/**
 * Zeroed Challenger trophy shelf for the fixed activities — same shape as `state.ts`'s
 * `freshTiers()`, one entry per `RunModeId`. Only `delve`, `tower`, `abyss`, `hoard`,
 * `vigil`, `convergence` and `memory` are ever written; `planet` and `raid` sit unused
 * here for exactly the reason they sit unused in `riftTiers` — each of those two rosters
 * is its own open-ended list, tracked instead by id on `planetChallengerBadges` /
 * `raidChallengerBadges` below.
 */
function freshChallengerBadges(): Record<RunModeId, number> {
  return Object.fromEntries(RUN_MODES.map((m) => [m, 0])) as Record<RunModeId, number>;
}

/**
 * XP to advance from `level` to the next one (not cumulative).
 *
 * The post-playtest rebalance (UAT §7) steepened this: the old `100 * 1.35^(n-1)` let a
 * fresh character reach level 6 — enough tree points to complete a whole path — inside the
 * first ~10 minutes, so a build was "done" before the game had really started. The base
 * and the exponent are both up a little now, which compounds: the first few levels still
 * come fast enough to unlock the early abilities, but the back half of the level range is
 * meaningfully slower, so deep content keeps its impact. The heavy lifting on "a build is
 * done too fast" is done by the roughly-halved `treePointsFor` below — this curve just
 * stops raw level (health, growth mods, ability unlocks) from outrunning the content.
 */
export function xpForLevel(level: number): number {
  return Math.floor(115 * Math.pow(1.38, level - 1));
}

/**
 * One class's persistent character sheet: a level, a behaviour tree, and six pieces of
 * gear. Everything the simulation asks it — how hard do I hit, how big is the area, does
 * this crit — resolves through one aggregated `Mods` record, so a class bonus, a
 * resolved-build contribution and an affix on a ring are all the same kind of thing by
 * the time combat sees them.
 *
 * The class's *verbs* — its ten abilities, its resource model, its hybrids — come from
 * the `PilotClass` in `src/progression/`; `Player` owns which of the nine normal
 * abilities are slotted and which tree nodes are lit, and resolves the two into a
 * `ResolvedBuild` the dungeon casts through.
 */
export class Player {
  readonly classId: ClassId;
  level = 1;
  xp = 0;
  equipment: Equipment = emptyEquipment();
  /** Allocated v2 behaviour-tree node ids (`<class>.<path>.<row>`), for the current class. */
  allocated: string[] = [];
  /**
   * Allocated *universal*-tree node ids (`universal.<path>.<key>`) — UAT §18.
   *
   * Kept in its own list, not merged into `allocated`: `normalizeTree` prunes that one
   * against the class tree and would eat every universal id on load. Per-`Player` rather
   * than account-wide on `GameState` for two reasons — `Player.mods` stays the one
   * self-contained answer to "how strong is this character" with no `GameState`
   * dependency, and `playerToJSON` is *also* the co-op wire payload, so a remote hero's
   * universal nodes reach the host along the path a character sheet already travels.
   * The point *pool* it spends is account-wide; see `GameState.universalPoints`.
   */
  universalAllocated: string[] = [];
  /**
   * The three relic / artifact slots (UAT §19), by definition id — `data/relics.ts`. Per
   * character, out of the account-wide collection on `GameState.relics`, and on the
   * co-op wire with the rest of the sheet so the host computes a remote hero's build
   * with the relics they're actually wearing. `null` is an empty slot.
   */
  relics: (string | null)[] = Array.from({ length: RELIC_SLOTS }, () => null);
  deepestDepth = 0;
  /**
   * How high this character has climbed the Tower (UAT §21), banked only.
   *
   * Deliberately **not** folded into `deepestDepth`. That field is where "any route to
   * depth 30 counts" lives — the Proving gate, and the rift ladders — and a height-30
   * climb must qualify for none of it. Two records, two ladders.
   */
  highestHeight = 0;
  /**
   * The furthest this character has got on either ladder — what a chest or the Forge
   * rolls an item level off (`GameState.openChests`, `craftItem`).
   *
   * Per-character, which is the rule that matters: CLAUDE.md's is that gear rolls off the
   * *active character's* record and never the account's, so a fresh alt can't buy gear at
   * the main's depth. Taking the better of two per-character records keeps that intact and
   * fixes the case it would otherwise miss — a character who only ever climbs would buy
   * level-1 gear forever.
   */
  get frontier(): number {
    return Math.max(this.deepestDepth, this.highestHeight);
  }
  /**
   * The Legend is Complete — this class beat its own Proving at the bottom of the Delve
   * (UAT §13/§14, `data/legends.ts`). Per-`Player` because class completion is exactly
   * the thing that must be earned once per class; the gold border on the class card is
   * this boolean.
   *
   * Read by the UI and by nothing in the simulation. It grants no stats and unlocks no
   * mechanics on purpose — prestige, not power.
   */
  legendComplete = false;
  /**
   * Challenger completion badges: the highest Challenger tier this class has *banked* a
   * clear at, per activity — a trophy, the same "banked, not died, not bailed out" rule
   * `recordDepth`/`GameState.completeLegend` already hold every other piece of progress
   * to. Fixed activities (delve, the Tower, both rifts, the Vigil, the Convergence, a
   * Memory) are keyed by `RunModeId`, the same split `GameState.riftTiers` uses; the
   * Reliquary's sectors and the raid roster are each their own open-ended list, so they
   * get their own id-keyed maps below, mirroring `planetProgress`/`raidProgress`.
   *
   * Per-`Player` because the badge is meant to read as *this character's* record, not the
   * account's — the same call `legendComplete` already made. Read only by the UI; nothing
   * in the simulation ever asks for it (see `tools/badges.ts`).
   */
  challengerBadges: Record<RunModeId, number> = freshChallengerBadges();
  /** Challenger badges for the Reliquary's sectors, by planet id. Sparse — an entry only
   *  exists once a tier of that sector has actually been banked. */
  planetChallengerBadges: Record<string, number> = {};
  /** Challenger badges for raids, by raid id. Same shape and reasoning as the sector map
   *  above. */
  raidChallengerBadges: Record<string, number> = {};
  /** Current HP persists across floors within a dive; a full heal happens in town. */
  health = 150;
  /** Legacy mana pool, kept for the HUD and potions. A class's real casting resource is
   *  its own pool in the in-run `ResourceSet`; this shadows it for display. */
  mana = 60;
  /** Chosen ability ids, one per key around the attack finger. Nulls are empty slots. */
  skills: (string | null)[] = [null, null, null];

  private cachedMods: Mods | null = null;
  private cachedBuild: ResolvedBuild | null = null;
  private cachedUniversalBuild: ResolvedBuild | null = null;

  constructor(classId: ClassId = DEFAULT_CLASS) {
    this.classId = classId;
    this.autoSlotNewAbilities();
    this.health = this.maxHealth;
    this.mana = this.maxMana;
  }

  /**
   * Banks a Challenger badge for one of the fixed activities — never lowers a tier
   * already earned, exactly like `deepestDepth`/`highestHeight`. Called only from
   * `GameState.recordDepth`, itself only reachable from a credited `bank(true)`, so a
   * death or an early extraction can never plant a badge that wasn't actually cleared.
   */
  bankChallengerBadge(mode: RunModeId, tier: number): void {
    if (tier > this.challengerBadges[mode]) this.challengerBadges[mode] = tier;
  }

  /** Same rule as `bankChallengerBadge`, for a planet's own Challenger ladder. */
  bankPlanetChallengerBadge(planetId: string, tier: number): void {
    if (tier > (this.planetChallengerBadges[planetId] ?? 0)) {
      this.planetChallengerBadges[planetId] = tier;
    }
  }

  /** Same rule as `bankChallengerBadge`, for a raid's own Challenger ladder. */
  bankRaidChallengerBadge(raidId: string, tier: number): void {
    if (tier > (this.raidChallengerBadges[raidId] ?? 0)) {
      this.raidChallengerBadges[raidId] = tier;
    }
  }

  get heroClass(): HeroClass {
    return CLASSES[this.classId];
  }

  get pilotClass(): PilotClass | undefined {
    return CLASS_BY_ID[this.classId];
  }

  get runtime(): ClassRuntime | undefined {
    return classRuntime(this.classId);
  }

  get tree(): readonly TreeNodeV2[] {
    return this.runtime?.tree ?? [];
  }

  get xpNeeded(): number {
    return xpForLevel(this.level);
  }

  /** Call after anything changes gear, level, tree or class. */
  refresh(): void {
    this.cachedMods = null;
    this.cachedBuild = null;
    this.cachedUniversalBuild = null;
  }

  /** The tree + hybrids + archetypes, folded into one readable result the dungeon casts through. */
  get build(): ResolvedBuild {
    if (this.cachedBuild) return this.cachedBuild;
    const rt = this.runtime;
    const build = rt
      ? resolveClassBuild(rt, this.allocated)
      : {
          classId: this.classId, allocated: [], mods: zeroMods(), mutations: [], grants: [],
          resourcePatches: [], rules: new Set<string>(), hybrids: [], archetypes: [], pathPoints: [],
        };
    // A worn named item is a tree node you wear (`data/named.ts`): its effects fold into
    // the same build, after the tree, so `applyBuild`, `runBuildGrants` and the rule
    // hooks see one list. Its *stats* are already in `item.mods` and never come this way.
    for (const slot of EQUIP_SLOTS) {
      const named = this.equipment[slot]?.named;
      const def = named ? NAMED_BY_ID[named] : undefined;
      if (def?.effects?.length) foldEffects(def.effects as readonly NodeEffect[], "gear", build);
    }
    // A worn relic is the same thing with no item under it (`data/relics.ts`): its whole
    // payload is effects, `mods` included, and it folds through the same door.
    foldEffects(wornRelicEffects(this.relics), "relic", build);
    this.cachedBuild = build;
    return this.cachedBuild;
  }

  /**
   * The universal tree's half of the build — UAT §18. Mods only, by design: the class
   * tree owns behaviour, this one owns the basics, and nothing here is allowed to
   * mutate an ability or flip a rule.
   */
  get universalBuild(): ResolvedBuild {
    if (!this.cachedUniversalBuild) {
      this.cachedUniversalBuild = resolveUniversalBuild(this.universalAllocated);
    }
    return this.cachedUniversalBuild;
  }

  /**
   * Class base + per-level growth + every equipped item + both resolved builds' stat
   * contributions. One record, and the only place power is ever added up.
   */
  get mods(): Mods {
    if (this.cachedMods) return this.cachedMods;
    const m = zeroMods();
    const cls = this.heroClass;
    addMods(m, cls.base);
    const lv = this.level - 1;
    if (lv > 0) {
      const grown: Partial<Mods> = {};
      for (const [key, value] of Object.entries(cls.growth) as [keyof Mods, number][]) {
        grown[key] = value * lv;
      }
      addMods(m, grown);
    }
    for (const slot of EQUIP_SLOTS) {
      const item = this.equipment[slot];
      if (item) addMods(m, itemMods(item));
    }
    addMods(m, this.build.mods);
    addMods(m, this.universalBuild.mods);
    this.cachedMods = m;
    return m;
  }

  /** The six numbers on the sheet, with the percentage modifiers already folded in. */
  get stats(): Stats {
    const m = this.mods;
    const s = zeroStats();
    s.attack = Math.round(m.attack);
    s.defense = Math.round(m.defense * (1 + m.defensePercent));
    s.maxHealth = Math.round(m.maxHealth * (1 + m.healthPercent));
    s.power = Math.round(m.power);
    s.haste = Math.round(m.haste);
    s.maxMana = Math.round(m.maxMana);
    return s;
  }

  get maxHealth(): number {
    return Math.max(1, this.stats.maxHealth);
  }

  get maxMana(): number {
    return Math.max(1, this.stats.maxMana);
  }

  /** Mana per second. Scales gently with the pool so a caster build stays castable. */
  get manaRegen(): number {
    return 4 + this.maxMana * 0.02 + this.mods.manaRegen;
  }

  // --- the in-run resource model ---------------------------------------

  /**
   * The class's resource specs, with any tree `resourcePatches` folded on. Builds the
   * `ResourceSet` a `Hero` carries for the run.
   */
  get resourceSpecs(): readonly ResourceSpec[] {
    const def = this.pilotClass;
    if (!def) return [];
    const build = this.build;
    return def.resources.map((spec) => patchResourceSpec(spec, build));
  }

  makeResources(): ResourceSet {
    const def = this.pilotClass;
    if (!def) return new ResourceSet();
    return new ResourceSet(this.resourceSpecs, def.stances ?? []);
  }

  // --- the weapon ---------------------------------------------------------

  get weaponFamily(): WeaponFamily {
    return this.equipment.weapon?.family ?? "sword";
  }

  get weapon(): WeaponSpec {
    return WEAPONS[this.weaponFamily];
  }

  /** True when the class was built for what you're holding. */
  get hasAffinity(): boolean {
    return this.heroClass.affinity.includes(this.weaponFamily);
  }

  /** Damage multiplier from holding — or not holding — the right kind of weapon. */
  get affinityMult(): number {
    if (!this.equipment.weapon) return 1;
    return this.hasAffinity ? 1 + this.heroClass.affinityBonus : 0.88;
  }

  /** Seconds between attacks, from the weapon, haste and every speed modifier. */
  get attackCooldown(): number {
    const speed = 1 + this.stats.haste * 0.004 + this.mods.attackSpeed;
    return clamp(this.weapon.cooldown / speed, 0.09, 1.2);
  }

  /** The raw hit, before the weapon decides what shape it takes. */
  get damage(): number {
    const s = this.stats;
    return s.attack * (1 + s.power * 0.006);
  }

  get attackDamage(): number {
    const w = this.weapon;
    const shapeBonus = w.pattern === "bolt"
      ? 1 + this.mods.projectileDamage
      : 1 + this.mods.meleeDamage;
    return this.damage * w.damage * this.affinityMult * shapeBonus;
  }

  get critChance(): number {
    return clamp(BASE_CRIT + this.weapon.crit + this.mods.critChance, 0, 0.95);
  }

  get critMultiplier(): number {
    return BASE_CRIT_MULT + this.mods.critDamage;
  }

  /** What a skill hits for, before its own multiplier. Power is the caster's stat. */
  get spellDamage(): number {
    const s = this.stats;
    return (this.damage * 0.85 + s.power * 2.4) * (1 + this.mods.skillDamage);
  }

  get areaMult(): number {
    return 1 + this.mods.areaSize;
  }

  get cooldownMult(): number {
    return 1 / (1 + this.mods.cooldownRate);
  }

  get moveMult(): number {
    return 1 + this.mods.moveSpeed;
  }

  /**
   * Dodge cooldown, as a multiplier on the base. Reciprocal like `cooldownMult`, so the
   * mod is asymptotic and stacking it can never reach a free dash. Floored anyway,
   * because a keystone is allowed to be negative and an i-frame with no cooldown at all
   * would make the dash the only defence anyone ever needed.
   */
  get dashCooldownMult(): number {
    return Math.max(0.25, 1 / (1 + this.mods.dashRate));
  }

  /**
   * How many dashes this character can hold at once — one, plus every whole
   * `dashCharges` its build carries. The dungeon keeps the live stock on the avatar
   * (`Avatar.dashStock`) and refills it one charge per cooldown; this is only the cap.
   */
  get dashCharges(): number {
    return 1 + Math.max(0, Math.floor(this.mods.dashCharges));
  }

  get pickupRangeMult(): number {
    return Math.max(0.25, 1 + this.mods.pickupRadius);
  }

  get coinFindMult(): number {
    return Math.max(0, 1 + this.mods.coinFind);
  }

  get gemFindMult(): number {
    return Math.max(0, 1 + this.mods.gemFind);
  }

  get damageReduction(): number {
    const def = this.stats.defense;
    return def / (def + 120);
  }

  get resists(): Resists {
    const r = zeroResists();
    const m = this.mods;
    for (const e of ELEMENTS) {
      const key = ELEMENT_RESIST_KEY[e];
      if (key) r[e] = m[key];
    }
    return r;
  }

  get elementalDamage(): Partial<Record<Element, number>> {
    return elementalFractions(this.mods);
  }

  /**
   * The element your build actually is — the biggest elemental fraction on your gear,
   * or your class's own if you're carrying none. Ultimates and weapon effects take
   * their colour and their ailment from this.
   */
  get attackElement(): Element {
    let best: Element = this.heroClass.element;
    let bestValue = 0;
    for (const [element, value] of Object.entries(this.elementalDamage) as [Element, number][]) {
      if (value > bestValue) {
        best = element;
        bestValue = value;
      }
    }
    return best;
  }

  // --- the ultimate -----------------------------------------------------

  /** The one ability that is entirely this class's. Cast when the meter is full. */
  get ultimateAbility(): Ability | undefined {
    return this.runtime?.ultimate;
  }

  get ultimateMult(): number {
    return 1 + this.mods.ultimatePower;
  }

  /**
   * How fast the ultimate meter fills, as a multiplier on whatever the class's own
   * charge rules grant. This is the *only* consumer of `Mods.ultimateRate`, and it
   * exists because for a long time there wasn't one: the modifier was declared, priced
   * and rolled as a real epic-and-up affix ("of Ascent") while nothing in the simulation
   * read it, so wearing it did nothing at all.
   *
   * It scales the grant, never the rule — see `ResourcePool.rateMultiplier`. Floored at
   * zero so a hypothetical large negative roll can't invert charging into draining.
   */
  get ultimateChargeMult(): number {
    return Math.max(0, 1 + this.mods.ultimateRate);
  }

  // --- damage and healing ----------------------------------------------

  mitigate(amount: number, element: Element = "physical", extraResist = 0): number {
    const armor = this.damageReduction * (element === "physical" ? 1 : 0.5);
    const resist = resistFraction(this.resists[element] + extraResist);
    return Math.max(1, amount * (1 - armor) * (1 - resist));
  }

  takeDamage(amount: number, element: Element = "physical", extraResist = 0): number {
    const dealt = Math.max(1, Math.round(this.mitigate(amount, element, extraResist)));
    this.health = Math.max(0, this.health - dealt);
    return dealt;
  }

  heal(amount: number): number {
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return this.health - before;
  }

  spendMana(amount: number): boolean {
    if (this.mana < amount) return false;
    this.mana -= amount;
    return true;
  }

  restoreMana(amount: number): number {
    const before = this.mana;
    this.mana = Math.min(this.maxMana, this.mana + amount);
    return this.mana - before;
  }

  drainMana(amount: number): void {
    this.mana = Math.max(0, this.mana - amount);
  }

  fullHeal(): void {
    this.health = this.maxHealth;
    this.mana = this.maxMana;
  }

  get isAlive(): boolean {
    return this.health > 0;
  }

  gainXp(amount: number): number {
    this.xp += amount;
    let levels = 0;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      levels++;
      this.refresh();
      this.health = Math.min(this.maxHealth, this.health + this.maxHealth * LEVEL_UP_HEAL);
      this.mana = this.maxMana;
    }
    if (levels > 0) this.autoSlotNewAbilities();
    return levels;
  }

  // --- class and tree ---------------------------------------------------

  /** Points earned by levelling, minus what the tree already holds. */
  get treePoints(): number {
    return treePointsFor(this.level) - spentPointsV2(this.tree, this.allocated);
  }

  canAllocate(node: TreeNodeV2): boolean {
    if (node.classId !== this.classId) return false;
    return canAllocateV2(this.allocated, node, this.treePoints);
  }

  allocate(node: TreeNodeV2): boolean {
    if (!this.canAllocate(node)) return false;
    this.allocated.push(node.id);
    this.refresh();
    this.health = Math.min(this.health, this.maxHealth);
    return true;
  }

  /** Free, and deliberately so. Changing your mind is the game, not a purchase. */
  respec(): void {
    this.allocated = [];
    this.refresh();
    this.health = Math.min(this.health, this.maxHealth);
    this.mana = Math.min(this.mana, this.maxMana);
  }

  /** Drops nodes that don't belong to the current tree or have lost their prereq. */
  normalizeTree(): void {
    this.allocated = pruneAllocationV2(this.tree, this.allocated);
    while (this.treePoints < 0 && this.allocated.length > 0) {
      const deepest = [...this.allocated]
        .sort((a, b) => (progNodeById(this.tree, b)?.row ?? 0) - (progNodeById(this.tree, a)?.row ?? 0))[0]!;
      this.allocated = this.allocated.filter((id) => id !== deepest);
    }
    this.refresh();
  }

  // --- the universal tree (UAT §18) -------------------------------------

  /** Points this character has committed to the universal tree. */
  get universalSpent(): number {
    return spentPointsV2(UNIVERSAL_TREE, this.universalAllocated);
  }

  /** `available` is the account-wide pool less what's spent — `GameState.universalPoints`. */
  canAllocateUniversal(node: TreeNodeV2, available: number): boolean {
    if (node.classId !== UNIVERSAL_TREE_ID) return false;
    return canAllocateV2(this.universalAllocated, node, available);
  }

  allocateUniversal(node: TreeNodeV2, available: number): boolean {
    if (!this.canAllocateUniversal(node, available)) return false;
    this.universalAllocated.push(node.id);
    this.refresh();
    // A keystone can *lower* max health, so the current pool has to be re-clamped —
    // otherwise Windborne leaves you standing there with more health than your maximum.
    this.health = Math.min(this.health, this.maxHealth);
    return true;
  }

  /** Free, exactly like the class respec, and independent of it. */
  respecUniversal(): void {
    this.universalAllocated = [];
    this.refresh();
    this.health = Math.min(this.health, this.maxHealth);
    this.mana = Math.min(this.mana, this.maxMana);
  }

  /**
   * The universal-tree twin of `normalizeTree`, called on load. Takes the pool rather
   * than reading it, since the pool is account-wide and `Player` deliberately knows
   * nothing about `GameState`. Trims the deepest nodes first if the pool ever shrinks
   * below what's already spent — which a retune of `universalPointsFor` could do.
   */
  normalizeUniversalTree(pool: number): void {
    this.universalAllocated = pruneAllocationV2(UNIVERSAL_TREE, this.universalAllocated);
    while (this.universalSpent > pool && this.universalAllocated.length > 0) {
      const deepest = [...this.universalAllocated]
        .sort((a, b) =>
          (progNodeById(UNIVERSAL_TREE, b)?.row ?? 0) - (progNodeById(UNIVERSAL_TREE, a)?.row ?? 0))[0]!;
      this.universalAllocated = this.universalAllocated.filter((id) => id !== deepest);
      // Pruning again matters: dropping a node can orphan a cross-path child of it.
      this.universalAllocated = pruneAllocationV2(UNIVERSAL_TREE, this.universalAllocated);
    }
    this.refresh();
  }

  // --- abilities ------------------------------------------------------

  /** Every normal ability this class owns, in unlock order (ultimate excluded). */
  get abilityPool(): readonly Ability[] {
    return this.runtime?.normalAbilities ?? [];
  }

  abilityUnlockLevel(ability: Ability): number {
    const i = this.abilityPool.indexOf(ability);
    return i < 0 ? 1 : ABILITY_UNLOCK_LEVELS[i] ?? 1;
  }

  /** The normal abilities the character's level has earned, in pool order. */
  get unlockedAbilities(): Ability[] {
    return this.abilityPool.filter((a) => this.abilityUnlockLevel(a) <= this.level);
  }

  abilityById(id: string): Ability | undefined {
    return this.runtime?.abilitiesById.get(id) ?? ABILITY_BY_ID[id];
  }

  /**
   * An ability your gear hands you, on top of the three you chose. Epic and better
   * items can carry one; the weapon wins.
   */
  get grantedAbilityId(): string | null {
    const weapon = this.equipment.weapon?.grant;
    if (weapon) return weapon;
    for (const slot of EQUIP_SLOTS) {
      const grant = this.equipment[slot]?.grant;
      if (grant) return grant;
    }
    return null;
  }

  /** The three chosen slots plus the granted one, resolved to abilities in key order. */
  get activeAbilities(): (Ability | null)[] {
    const out: (Ability | null)[] = this.skills.map((id) => (id ? this.abilityById(id) ?? null : null));
    const granted = this.grantedAbilityId;
    if (granted) out.push(this.abilityById(granted) ?? null);
    return out;
  }

  /** The resolved-build version of an active ability, ready for the runtime to cast. */
  resolvedAbility(ability: Ability): Ability {
    return applyBuild(this.build, ability);
  }

  autoSlotNewAbilities(): void {
    this.normalizeAbilities();
    for (const a of this.unlockedAbilities) {
      if (this.skills.includes(a.id)) continue;
      const empty = this.skills.indexOf(null);
      if (empty < 0) break;
      this.skills[empty] = a.id;
    }
  }

  setSkill(slot: number, id: string | null): void {
    this.normalizeAbilities();
    if (slot < 0 || slot >= SKILL_SLOTS) return;
    if (id && !this.unlockedAbilities.some((a) => a.id === id)) return;
    if (id) {
      const existing = this.skills.indexOf(id);
      if (existing >= 0) this.skills[existing] = this.skills[slot] ?? null;
    }
    this.skills[slot] = id;
  }

  private normalizeAbilities(): void {
    const ok = new Set(this.unlockedAbilities.map((a) => a.id));
    const fixed: (string | null)[] = [];
    for (let i = 0; i < SKILL_SLOTS; i++) {
      const id = this.skills[i] ?? null;
      fixed.push(id && ok.has(id) ? id : null);
    }
    this.skills = fixed;
  }

  // --- gear ----------------------------------------------------------

  canEquip(item: Item): boolean {
    return this.level >= requiredLevel(item);
  }

  equip(item: Item): Item | null {
    const prev = this.equipment[item.slot];
    this.equipment[item.slot] = item;
    this.refresh();
    this.health = Math.min(this.health, this.maxHealth);
    this.mana = Math.min(this.mana, this.maxMana);
    return prev;
  }

  /** Why `id` can't go in relic slot `slot`, or null when it can. The one rule, from `data/relics.ts`. */
  relicBlocker(slot: number, id: string): string | null {
    return relicSocketBlocker(this.relics, slot, id);
  }

  /** Puts a relic in a slot. Returns what was there. Refuses (returns undefined) when the rule says no. */
  socketRelic(slot: number, id: string): string | null | undefined {
    if (this.relicBlocker(slot, id) !== null) return undefined;
    const prev = this.relics[slot] ?? null;
    this.relics[slot] = id;
    this.refresh();
    this.health = Math.min(this.health, this.maxHealth);
    return prev;
  }

  unsocketRelic(slot: number): string | null {
    const prev = this.relics[slot] ?? null;
    if (slot >= 0 && slot < RELIC_SLOTS) this.relics[slot] = null;
    this.refresh();
    this.health = Math.min(this.health, this.maxHealth);
    return prev;
  }

  unequip(slot: EquipSlot): Item | null {
    const item = this.equipment[slot];
    this.equipment[slot] = null;
    this.refresh();
    this.health = Math.min(this.health, this.maxHealth);
    this.mana = Math.min(this.mana, this.maxMana);
    return item;
  }

  /** Every element, for UI that wants to list resistances in a stable order. */
  static readonly ELEMENTS = ELEMENTS;
}
