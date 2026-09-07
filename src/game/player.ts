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
import { WEAPONS, type WeaponFamily, type WeaponSpec } from "../data/weapons";
import type { Ability } from "../combat/ability";
import { ResourceSet, type ResourceSpec } from "../combat/resources";
import {
  ABILITY_BY_ID, CLASS_BY_ID, applyBuild, installClass, patchResourceSpec, resolveClassBuild,
  type ClassRuntime, type PilotClass, type ResolvedBuild,
} from "../progression/index";
import {
  canAllocateV2, progNodeById, pruneAllocationV2, spentPointsV2, type TreeNodeV2,
} from "../progression/nodes";
import { itemMods, requiredLevel, zeroStats, type Item, type Stats } from "./item";

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

export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.35, level - 1));
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
  deepestDepth = 0;
  /** Current HP persists across floors within a dive; a full heal happens in town. */
  health = 150;
  /** Legacy mana pool, kept for the HUD and potions. A class's real casting resource is
   *  its own pool in the in-run `ResourceSet`; this shadows it for display. */
  mana = 60;
  /** Chosen ability ids, one per key around the attack finger. Nulls are empty slots. */
  skills: (string | null)[] = [null, null, null];

  private cachedMods: Mods | null = null;
  private cachedBuild: ResolvedBuild | null = null;

  constructor(classId: ClassId = DEFAULT_CLASS) {
    this.classId = classId;
    this.autoSlotNewAbilities();
    this.health = this.maxHealth;
    this.mana = this.maxMana;
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
  }

  /** The tree + hybrids + archetypes, folded into one readable result the dungeon casts through. */
  get build(): ResolvedBuild {
    if (this.cachedBuild) return this.cachedBuild;
    const rt = this.runtime;
    this.cachedBuild = rt
      ? resolveClassBuild(rt, this.allocated)
      : {
          classId: this.classId, allocated: [], mods: zeroMods(), mutations: [], grants: [],
          resourcePatches: [], rules: new Set<string>(), hybrids: [], archetypes: [], pathPoints: [],
        };
    return this.cachedBuild;
  }

  /**
   * Class base + per-level growth + every equipped item + the resolved build's stat
   * contribution. One record, and the only place power is ever added up.
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
