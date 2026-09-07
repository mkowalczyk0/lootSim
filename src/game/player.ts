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
import { SKILLS, SKILL_SLOTS, unlockedSkills, type SkillId } from "../data/skills";
import { ULTIMATES, type UltimateSpec } from "../data/ultimates";
import { WEAPONS, type WeaponFamily, type WeaponSpec } from "../data/weapons";
import { canAllocate, nodeById, pruneAllocation, spentPoints, treeMods, type TreeNode } from "../data/tree";
import { itemMods, requiredLevel, zeroStats, type Item, type Stats } from "./item";

/** Fraction of max health a level-up restores. Not a full heal — that made deaths rare. */
const LEVEL_UP_HEAL = 0.6;
/** Critical chance before class, gear and tree. Everything is built on top of this. */
const BASE_CRIT = 0.08;
/** Critical multiplier before any `critDamage` modifier. */
const BASE_CRIT_MULT = 1.8;

export type Equipment = Record<EquipSlot, Item | null>;

export function emptyEquipment(): Equipment {
  return { weapon: null, armor: null, shield: null, ring: null, gloves: null, necklace: null };
}

export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.35, level - 1));
}

/**
 * One class's persistent character sheet: a level, a tree, and six pieces of gear.
 * Everything the simulation asks it — how hard do I hit, how often, how big is the
 * area, does this crit — resolves through one aggregated `Mods` record, so a class
 * bonus, a tree keystone and an affix on a ring are all the same kind of thing by the
 * time combat sees them.
 *
 * Every class keeps its own `Player` (see `GameState.players`) — its class never
 * changes once created, because starting a fresh class means starting a fresh
 * character, not repainting this one.
 *
 * The in-run avatar (position, velocity, i-frames) lives in `dungeon.ts`.
 */
export class Player {
  readonly classId: ClassId;
  level = 1;
  xp = 0;
  equipment: Equipment = emptyEquipment();
  /** Allocated skill-tree node ids, for the current class. */
  allocated: string[] = [];
  /** This character's own deepest dive, separate from the account-wide record stat —
   *  it's what chests and the forge roll item level against, so a fresh alt buying a
   *  chest gets gear it can actually wear instead of whatever depth the main reached. */
  deepestDepth = 0;
  /** Current HP persists across floors within a dive; a full heal happens in town. */
  health = 150;
  /** Mana does too, and it is deliberately slow to come back. */
  mana = 60;
  /** Equipped skills, one per key around the attack finger. Nulls are empty slots. */
  skills: (SkillId | null)[] = [null, null, null];

  /** Aggregated modifiers, rebuilt whenever anything that feeds them changes. */
  private cachedMods: Mods | null = null;

  constructor(classId: ClassId = DEFAULT_CLASS) {
    this.classId = classId;
    this.autoSlotNewSkills();
    this.health = this.maxHealth;
    this.mana = this.maxMana;
  }

  get heroClass(): HeroClass {
    return CLASSES[this.classId];
  }

  get xpNeeded(): number {
    return xpForLevel(this.level);
  }

  /** Call after anything changes gear, level, tree or class. */
  refresh(): void {
    this.cachedMods = null;
  }

  /**
   * Class base + per-level growth + every equipped item + every allocated tree node.
   * One record, and the only place power is ever added up.
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
    addMods(m, treeMods(this.classId, this.allocated));
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

  // --- the weapon ---------------------------------------------------------

  get weaponFamily(): WeaponFamily {
    // An empty hand is a fist, and a fist is a very bad sword.
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
    // An unarmed hero gets neither the bonus nor the penalty; it's bad enough already.
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

  /**
   * Damage of one landed basic attack. The weapon multiplier, the class affinity and
   * whichever of the melee/projectile modifiers applies are all in here, which is why
   * a great axe on a Berserker reads completely differently to one on a Magician.
   */
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

  /** Multiplies every radius in the game that belongs to you. */
  get areaMult(): number {
    return 1 + this.mods.areaSize;
  }

  /** Multiplies every cooldown you own. Recovery is stored as a rate, not a reduction. */
  get cooldownMult(): number {
    return 1 / (1 + this.mods.cooldownRate);
  }

  get moveMult(): number {
    return 1 + this.mods.moveSpeed;
  }

  /** Fraction of incoming damage removed by defense — asymptotic, never reaches 100%. */
  get damageReduction(): number {
    const def = this.stats.defense;
    return def / (def + 120);
  }

  /** Flat resistance per element, summed from every modifier that grants any. */
  get resists(): Resists {
    const r = zeroResists();
    const m = this.mods;
    for (const e of ELEMENTS) {
      const key = ELEMENT_RESIST_KEY[e];
      if (key) r[e] = m[key];
    }
    return r;
  }

  /**
   * Extra elemental damage carried by gear, as a fraction of your hit per element.
   * A swing lands its physical damage and then each of these on top, which is how an
   * ordinary attack ends up setting things on fire.
   */
  get elementalDamage(): Partial<Record<Element, number>> {
    return elementalFractions(this.mods);
  }

  /**
   * The element your build actually is — the biggest elemental fraction on your gear,
   * or your class's own if you're carrying none. Ultimates and weapon effects take
   * their colour and their ailment from this, which is the whole "lightning Lancer"
   * promise: change the gear, change the character.
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

  // --- the ultimate -------------------------------------------------------

  get ultimate(): UltimateSpec {
    return ULTIMATES[this.heroClass.ultimate];
  }

  /** Kill-equivalents needed to fill the meter, after charge-rate modifiers. */
  get ultimateCost(): number {
    return Math.max(1, this.ultimate.charge / (1 + this.mods.ultimateRate));
  }

  get ultimateMult(): number {
    return 1 + this.mods.ultimatePower;
  }

  // --- damage and healing -------------------------------------------------

  /**
   * Mitigation, shared by every source of damage in the game. Armor answers physical
   * hits and only half-answers elemental ones; resistance answers the rest. Neither
   * ever reaches total immunity.
   */
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

  /** Grants XP and returns how many levels were gained, for the "LEVEL UP" banner. */
  gainXp(amount: number): number {
    this.xp += amount;
    let levels = 0;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.level++;
      levels++;
      this.refresh();
      // A level-up patches you up mid-fight, but it won't rescue a bad dive.
      this.health = Math.min(this.maxHealth, this.health + this.maxHealth * LEVEL_UP_HEAL);
      this.mana = this.maxMana;
    }
    if (levels > 0) this.autoSlotNewSkills();
    return levels;
  }

  // --- class and tree -----------------------------------------------------

  /** Points earned by levelling, minus what the tree already holds. */
  get treePoints(): number {
    return treePointsFor(this.level) - spentPoints(this.classId, this.allocated);
  }

  canAllocate(node: TreeNode): boolean {
    // A node from somebody else's tree is never yours, however many points you have.
    if (node.classId !== this.classId) return false;
    return canAllocate(this.allocated, node, this.treePoints);
  }

  allocate(node: TreeNode): boolean {
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

  /** Drops nodes that don't belong to the current class, after a load. */
  normalizeTree(): void {
    this.allocated = pruneAllocation(this.classId, this.allocated);
    // A save that predates a tree change could hold more points than the level allows.
    // Deepest first, so refunding never orphans something above it.
    while (this.treePoints < 0 && this.allocated.length > 0) {
      const deepest = [...this.allocated]
        .sort((a, b) => (nodeById(this.classId, b)?.row ?? 0) - (nodeById(this.classId, a)?.row ?? 0))[0]!;
      this.allocated = this.allocated.filter((id) => id !== deepest);
    }
    this.refresh();
  }

  // --- skills -------------------------------------------------------------

  /** Every skill this class can ever learn, in the order it learns them. */
  get skillPool(): readonly SkillId[] {
    return this.heroClass.skills;
  }

  get unlocked(): SkillId[] {
    return unlockedSkills(this.skillPool, this.level);
  }

  /**
   * A skill your gear hands you, on top of the three you chose. Epic and better items
   * can carry one; the weapon wins, because that's the piece you thought hardest about.
   */
  get grantedSkill(): SkillId | null {
    const weapon = this.equipment.weapon?.grant;
    if (weapon) return weapon;
    for (const slot of EQUIP_SLOTS) {
      const grant = this.equipment[slot]?.grant;
      if (grant) return grant;
    }
    return null;
  }

  /** The three chosen slots plus the granted one, in key order. */
  get activeSkills(): (SkillId | null)[] {
    const granted = this.grantedSkill;
    return granted ? [...this.skills, granted] : [...this.skills];
  }

  /** Puts a newly unlocked skill into an empty slot, so a level-up is never a no-op. */
  autoSlotNewSkills(): void {
    this.normalizeSkills();
    for (const id of this.unlocked) {
      if (this.skills.includes(id)) continue;
      const empty = this.skills.indexOf(null);
      if (empty < 0) break;
      this.skills[empty] = id;
    }
  }

  /** Equips `id` in `slot`, swapping it out of whatever other slot already held it. */
  setSkill(slot: number, id: SkillId | null): void {
    this.normalizeSkills();
    if (slot < 0 || slot >= SKILL_SLOTS) return;
    if (id && !this.unlocked.includes(id)) return;
    if (id) {
      const existing = this.skills.indexOf(id);
      if (existing >= 0) this.skills[existing] = this.skills[slot];
    }
    this.skills[slot] = id;
  }

  /** Mana cost of the skill in a slot, or null if the slot is empty. */
  skillCost(slot: number): number | null {
    const id = this.activeSkills[slot];
    return id ? SKILLS[id].manaCost : null;
  }

  private normalizeSkills(): void {
    const fixed: (SkillId | null)[] = [];
    for (let i = 0; i < SKILL_SLOTS; i++) {
      const id = this.skills[i] ?? null;
      fixed.push(id && this.unlocked.includes(id) ? id : null);
    }
    this.skills = fixed;
  }

  /**
   * Whether this character is a high enough level to wear `item`. The stash is shared
   * across every class, so a fresh level-1 alt can't reach into a level-20 main's gear
   * until it catches up — the item just sits in the stash waiting.
   */
  canEquip(item: Item): boolean {
    return this.level >= requiredLevel(item);
  }

  /** Equips `item`, returning whatever was displaced so the caller can re-stash it. */
  equip(item: Item): Item | null {
    const prev = this.equipment[item.slot];
    this.equipment[item.slot] = item;
    this.refresh();
    // Gear can raise max HP; keep current HP in range without free healing.
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
