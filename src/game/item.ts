import { Rng } from "../core/rng";
import { LOOT_ELEMENTS, type Element } from "../data/elements";
import type { HeroClass } from "../data/classes";
import {
  EQUIP_SLOTS, ITEM_NAMES, MOD_COUNTS, MOD_POOL, RESERVED_ELEMENTAL_MODS, TRIGGER_SHAPES, TYPE_STATS,
  grantChance, isWeaponType, modAllowed, modPoolFor, modValue, slotForType, triggerChance,
  type EquipSlot, type ItemType, type ModRoll, type TriggerSpec,
} from "../data/items";
import {
  MOD_LABELS, PERCENT_MODS, STAT_KEYS, STAT_LABELS, type ModKey, type Mods, type StatKey,
} from "../data/mods";
import type { Rarity } from "../data/rarity";
import { RARITY_MULTIPLIERS, RARITY_VALUE, rarityIndex } from "../data/rarity";
import { NAMED_BY_ID, type NamedItemDef } from "../data/named";
import { GRANTABLE_ABILITY_IDS } from "../progression/index";
import { WEAPON_FAMILIES, type WeaponFamily } from "../data/weapons";

export type Stats = Record<StatKey, number>;

export function zeroStats(): Stats {
  return { attack: 0, defense: 0, maxHealth: 0, power: 0, haste: 0, maxMana: 0 };
}

export function addStats(into: Stats, from: Partial<Stats>): Stats {
  for (const k of STAT_KEYS) into[k] += from[k] ?? 0;
  return into;
}

/** One rolled affix. `id` points back at the pool entry it came from. */
export interface ItemMod {
  readonly id: string;
  readonly key: ModKey;
  readonly value: number;
}

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly type: ItemType;
  readonly slot: EquipSlot;
  /** Which weapon family this is, or null for anything that isn't a weapon. */
  readonly family: WeaponFamily | null;
  /** Item level, from the depth it dropped at. Adds a slow linear scale on top of rarity. */
  readonly ilvl: number;
  /** The base stat block for the type, before affixes. */
  readonly stats: Stats;
  /** Rolled affixes. Rarity decides how many, and which are even possible. */
  readonly mods: readonly ItemMod[];
  /** An extra castable ability (its id), granted while this is equipped. Epic and up. */
  readonly grant: string | null;
  /** Something that goes off on its own. Legendary and up. */
  readonly trigger: TriggerSpec | null;
  /**
   * The `NamedItemDef` this was forged from (`data/named.ts`), or null for the ordinary
   * kind. Stats and affixes are already baked in above; this id is what the build
   * resolver reads to attach the definition's live behaviour, and what the UI reads for
   * the name, the flavour text and the art. See docs/named-items.md.
   */
  readonly named: string | null;
  readonly value: number;
}

let nextId = 1;
function makeId(): string {
  return `i${nextId++}`;
}

/** Restores the id counter after a load so freshly rolled items can't collide. */
export function primeItemIds(items: readonly Item[]): void {
  for (const it of items) {
    const n = Number(it.id.slice(1));
    if (Number.isFinite(n) && n >= nextId) nextId = n + 1;
  }
}

/**
 * Picks what kind of item drops. Slots are drawn evenly first and only then does a
 * weapon decide which family it is, so adding a seventh weapon family never quietly
 * halves everybody's chance of finding a necklace.
 *
 * `favor` biases the weapon roll toward a class's own families — most of the weapons
 * you find should be ones you can actually use. `forceFavor` makes that a certainty
 * instead of a bias, for the one chest that promises never to hand you a weapon your
 * class wasn't built for.
 */
export function randomItemType(
  rng: Rng, favor?: readonly WeaponFamily[], forceFavor = false,
): ItemType {
  const slot = rng.pick(EQUIP_SLOTS);
  if (slot !== "weapon") return slot;
  if (favor && favor.length > 0 && (forceFavor || rng.chance(0.45))) return rng.pick(favor);
  return rng.pick(WEAPON_FAMILIES);
}

export interface RollOptions {
  readonly rarity: Rarity;
  readonly type: ItemType;
  readonly ilvl: number;
  /**
   * Scales stats and affix magnitude off a different level than `ilvl` itself, without
   * moving `requiredLevel` (`ilvl` minus one level of grace) — the reward curve's item
   * power axis (UAT §16, docs/reward-curve.md) still has to make a drop hit harder, but
   * must not push its equip requirement past what the earner can meet. Defaults to
   * `ilvl`, so every caller that doesn't know about the split behaves exactly as before.
   */
  readonly powerIlvl?: number;
  readonly rng: Rng;
  /** Crafting only: weights the roll pool toward this element's damage/resist mod. */
  readonly favorElement?: Element;
  /**
   * Augments (`data/augments.ts`): each inner list is a group of `ModRoll` ids of which
   * **one** is reserved an affix slot — the first that this type and rarity can carry.
   * A group rather than a bare id because an element augment's guarantee is satisfied by
   * either of its two rolls (`dmg-fire` on a weapon, `res-fire` on armor), and which one
   * is decided by `modAllowed` rather than authored.
   *
   * The one place item rolling *forces* rather than weights, and deliberately so — nobody
   * spends the rarest object in the game to find out it probably worked. It stays honest
   * because the augment tab refuses the combine when a roll is unreachable, rather than
   * accepting it and quietly doing nothing here.
   */
  readonly ensureMods?: readonly (readonly string[])[];
}

/** Sell/reforge-cost basis: rarity and item level plus what the affix list carries. */
export function computeValue(
  rarity: Rarity, levelScale: number, modCount: number, grant: string | null, trigger: TriggerSpec | null,
  named = false,
): number {
  return Math.round(
    RARITY_VALUE[rarity] * levelScale
    * (1 + modCount * 0.09)
    * (grant ? 1.35 : 1)
    * (trigger ? 1.5 : 1)
    * (named ? 1.6 : 1),
  );
}

/** Item level adds up to +100% at ilvl 30, so a deep-run common still feels like a find. */
export function levelScaleFor(ilvl: number): number {
  return 1 + (ilvl - 1) * 0.033;
}

export function rollItem(
  { rarity, type, ilvl, powerIlvl = ilvl, rng, favorElement, ensureMods }: RollOptions,
): Item {
  const names = ITEM_NAMES[rarity][type];
  const baseName = rng.pick(names);
  const tier = rarityIndex(rarity);
  const mult = RARITY_MULTIPLIERS[rarity];
  const levelScale = levelScaleFor(powerIlvl);
  // +/-15% variance so two copies of the same item are never identical.
  const variance = rng.range(0.85, 1.15);

  const stats = baseStats(type, mult, levelScale, variance);
  const rolls = rollMods(type, rarity, tier, levelScale, rng, favorElement, ensureMods);
  const grant = rollGrant(type, tier, rng);
  const trigger = rollTrigger(tier, rng);
  const value = computeValue(rarity, levelScale, rolls.length, grant, trigger);

  return {
    id: makeId(),
    name: decorate(baseName, rolls.map((r) => r.roll)),
    rarity,
    type,
    slot: slotForType(type),
    family: isWeaponType(type) ? type : null,
    ilvl,
    stats,
    mods: rolls.map((r) => r.mod),
    grant,
    trigger,
    named: null,
    value,
  };
}

/** The type's base stat block at this rarity, level and variance — shared by both forges. */
export function baseStats(type: ItemType, mult: number, levelScale: number, variance: number): Stats {
  const base = TYPE_STATS[type];
  const stats = zeroStats();
  for (const k of STAT_KEYS) {
    const budget = base[k];
    if (budget) stats[k] = Math.max(1, Math.round(budget * mult * levelScale * variance));
  }
  return stats;
}

// --- named items ------------------------------------------------------------

/**
 * Forges a copy of a named item (`data/named.ts`). The result is an ordinary `Item` in
 * every way the rest of the game can see: the definition's base block and fixed affixes
 * are baked into `stats` / `mods` the same way a drop's are, so `itemMods`, the compare
 * table, the sell price and the wire need no special case. What makes it *this* item is
 * `named`, which the build resolver and the UI read back against the registry.
 *
 * Numbers baked here are frozen into the copy. The definition's `effects`, `grant` and
 * `trigger` are looked up live by id — a deliberate split, documented in
 * docs/named-items.md, so a retune of behaviour reaches every copy and a retune of
 * stats reaches only new ones.
 *
 * `powerIlvl` is the same split `rollItem` carries: item power (UAT §16) still lifts a
 * named copy exactly as it lifts an ordinary drop, but only the magnitude, never
 * `requiredLevel` (`ilvl` minus one level of grace) — a named item is not exempt from
 * the "an item that drops for you is an item you can equip" promise. Defaults to `ilvl`.
 */
export function forgeNamedItem(def: NamedItemDef, ilvl: number, rng: Rng, powerIlvl: number = ilvl): Item {
  const level = Math.max(1, Math.max(ilvl, def.minIlvl ?? 1));
  const powerLevel = Math.max(1, Math.max(powerIlvl, def.minIlvl ?? 1));
  const mult = RARITY_MULTIPLIERS[def.rarity];
  const levelScale = levelScaleFor(powerLevel);
  const variance = rng.range(0.92, 1.08);

  const stats = baseStats(def.type, mult * (def.statScale ?? 1), levelScale, variance);
  const mods = namedMods(def, powerLevel, rng);
  const grant = def.grant ?? null;
  const trigger = def.trigger ?? null;

  return {
    id: makeId(),
    name: def.name,
    rarity: def.rarity,
    type: def.type,
    slot: slotForType(def.type),
    family: isWeaponType(def.type) ? def.type : null,
    ilvl: level,
    stats,
    mods,
    grant,
    trigger,
    named: def.id,
    value: computeValue(def.rarity, levelScale, mods.length, grant, trigger, true),
  };
}

/**
 * A named item's affix list: its fixed rolls (ranges resolved, `"rarity"`-scaled ones
 * grown like a pool affix would be), then any `randomMods` from the ordinary pool,
 * skipping keys the fixed list already holds so a random roll never stacks onto an
 * identity stat.
 */
function namedMods(def: NamedItemDef, ilvl: number, rng: Rng): ItemMod[] {
  const tier = rarityIndex(def.rarity);
  const levelScale = levelScaleFor(ilvl);
  const out: ItemMod[] = [];
  for (const spec of def.mods) {
    const raw = Array.isArray(spec.value)
      ? rng.range(spec.value[0], spec.value[1])
      : (spec.value as number);
    const grown = spec.scale === "rarity" ? raw * RARITY_MULTIPLIERS[def.rarity] * levelScale : raw;
    out.push({ id: `named:${def.id}:${spec.key}`, key: spec.key, value: Math.round(grown * 1000) / 1000 });
  }
  const want = def.randomMods ?? 0;
  if (want > 0) {
    const taken = new Set(out.map((m) => m.key));
    const extra = rollMods(def.type, def.rarity, tier, levelScale, rng)
      .filter((r) => !taken.has(r.mod.key))
      .slice(0, want);
    for (const r of extra) out.push(r.mod);
  }
  return out;
}

/**
 * The Forge's reforge: a fresh affix roll on an item you already own, through the exact
 * same `rollMods` a drop uses. Rarity, type, ilvl and the base stat block never move —
 * only `mods` (and the name, which is only ever decoration hung on those affixes) — so
 * the grant and trigger an item carries survive a reforge untouched. Cost lives in
 * `data/crafting.ts#reforgeCoinCost`; `GameState.reforgeItem` spends it.
 */
export function reforgeAffixes(item: Item, rng: Rng): Item {
  // A named item's affixes *are* its identity, so a reforge re-rolls the definition's
  // own ranges (and its random extras) rather than replacing them from the pool — the
  // same item, a different copy of it. The name never gains a prefix or suffix.
  const def = item.named ? NAMED_BY_ID[item.named] : undefined;
  if (def) {
    const mods = namedMods(def, item.ilvl, rng);
    return {
      ...item,
      mods,
      value: computeValue(item.rarity, levelScaleFor(item.ilvl), mods.length, item.grant, item.trigger, true),
    };
  }
  const tier = rarityIndex(item.rarity);
  const levelScale = levelScaleFor(item.ilvl);
  const rolls = rollMods(item.type, item.rarity, tier, levelScale, rng);
  const baseName = rng.pick(ITEM_NAMES[item.rarity][item.type]);
  return {
    ...item,
    name: decorate(baseName, rolls.map((r) => r.roll)),
    mods: rolls.map((r) => r.mod),
    value: computeValue(item.rarity, levelScale, rolls.length, item.grant, item.trigger),
  };
}

/**
 * Picks the affixes. Rarity decides how many and gates which are reachable at all,
 * which is the whole reason to keep opening chests once your slots are full: an extra
 * projectile does not exist below epic, and an extra ultimate bounce does not exist
 * below mythic.
 */
export function rollMods(
  type: ItemType, rarity: Rarity, tier: number, levelScale: number, rng: Rng, favorElement?: Element,
  ensureMods?: readonly (readonly string[])[],
): { mod: ItemMod; roll: ModRoll }[] {
  const [lo, hi] = MOD_COUNTS[rarity];
  const want = rng.int(lo, hi);
  if (want <= 0) return [];

  let pool: ModRoll[] = modPoolFor(type, tier);
  if (pool.length === 0) return [];
  if (favorElement) {
    // A craft's entire promise is that the essence you paid for actually shows up, so
    // its damage and resist rolls are weighted rather than forced — that keeps crafted
    // items rolling through the exact same code every dropped item does.
    const wanted = (m: ModRoll) => m.id === `dmg-${favorElement}` || m.id === `res-${favorElement}`;
    // Holy, arcane and nature are kept out of the random pool (`MOD_POOL` is built from
    // `LOOT_ELEMENTS`), so this is the one place their affixes become reachable — and
    // only for the element actually named, which is why the reserved list is filtered by
    // `wanted` rather than spliced in wholesale. Before Sept 2026 they were reachable
    // nowhere: `favored` came back empty, the tripling multiplied nothing, and a holy
    // essence charged its material for an unchanged roll. See `RESERVED_ELEMENTAL_MODS`.
    const reserved = RESERVED_ELEMENTAL_MODS.filter((m) => wanted(m) && modAllowed(m, type, tier));
    // One copy in the pool plus three favoured copies, exactly as a loot element gets,
    // so a reserved element is weighted the same and not quietly rarer.
    const favored = [...pool.filter(wanted), ...reserved];
    pool = [...pool, ...reserved, ...favored, ...favored, ...favored];
  }
  const out: { mod: ItemMod; roll: ModRoll }[] = [];
  const used = new Set<string>();
  // An affix augment's whole promise is that the roll it names is *there*, so it takes the
  // first slot rather than being weighted into the pool the way an essence is. If the roll
  // is not allowed on this type at this rarity the augment simply does not apply — which
  // `loadoutProblems` has already refused at authoring time, so it cannot be reached from
  // the chest screen; the guard is here for every other caller.
  for (const group of ensureMods ?? []) {
    const forced = group
      .map((id) => MOD_POOL.find((m) => m.id === id) ?? RESERVED_ELEMENTAL_MODS.find((m) => m.id === id))
      .find((m): m is ModRoll => m !== undefined && !used.has(m.key) && modAllowed(m, type, tier));
    if (!forced) continue;
    used.add(forced.key);
    const raw = modValue(forced, rarity, levelScale, rng.range(0.85, 1.15));
    out.push({
      mod: { id: forced.id, key: forced.key, value: forced.scale === "flat" ? raw : Math.round(raw * 1000) / 1000 },
      roll: forced,
    });
  }
  // Only so many attempts: a small pool with a high mod count shouldn't spin forever.
  for (let attempt = 0; attempt < want * 8 && out.length < want; attempt++) {
    const roll = rng.pick(pool);
    if (!roll || used.has(roll.key)) continue;
    used.add(roll.key);
    const raw = modValue(roll, rarity, levelScale, rng.range(0.85, 1.15));
    const value = roll.scale === "flat" ? raw : Math.round(raw * 1000) / 1000;
    out.push({ mod: { id: roll.id, key: roll.key, value }, roll });
  }
  return out;
}

/** Weapons, rings and necklaces can carry a whole extra skill from epic upward. */
function rollGrant(type: ItemType, tier: number, rng: Rng): string | null {
  const eligible = isWeaponType(type) || type === "ring" || type === "necklace";
  if (!eligible) return null;
  if (!rng.chance(grantChance(tier))) return null;
  return rng.pick(GRANTABLE_ABILITY_IDS as readonly string[]);
}

/** From legendary upward an item can do something on its own, without a key press. */
function rollTrigger(tier: number, rng: Rng): TriggerSpec | null {
  if (!rng.chance(triggerChance(tier))) return null;
  return makeTrigger(tier, rng);
}

/**
 * Every affix by id, for the bench to find the roll an `ItemMod` came from.
 *
 * This is the *vocabulary*, not the random pool, so it covers the reserved elements too.
 * An item carrying a holy affix has to be temperable, salvageable and valuable like any
 * other; a lookup that missed it would silently make a crafted holy ring worth less at
 * the vendor than the cold one beside it.
 */
export const MOD_ROLL_BY_ID: ReadonlyMap<string, ModRoll> = new Map(
  [...MOD_POOL, ...RESERVED_ELEMENTAL_MODS].map((m) => [m.id, m]),
);

/** Whether an item's type may carry a granted skill at all — weapons, rings, necklaces. */
export function grantEligible(type: ItemType): boolean {
  return isWeaponType(type) || type === "ring" || type === "necklace";
}

/** One rolled trigger for an item of this rarity tier — the drop's roll and the bench's Awaken share it. */
export function makeTrigger(tier: number, rng: Rng): TriggerSpec {
  const shape = rng.pick(TRIGGER_SHAPES);
  const element: Element = rng.pick(LOOT_ELEMENTS);
  return {
    id: `${shape.kind}-${shape.effect}`,
    kind: shape.kind,
    effect: shape.effect,
    element,
    chance: shape.chance,
    power: Math.round(shape.power * (1 + (tier - 4) * 0.22) * 100) / 100,
    radius: shape.radius,
    count: shape.count,
  };
}

/** At most one prefix word and one suffix phrase, or names become unreadable. */
export function decorate(name: string, rolls: readonly ModRoll[]): string {
  const prefix = rolls.find((r) => r.kind === "prefix");
  const suffix = rolls.find((r) => r.kind === "suffix");
  return [prefix?.label, name, suffix?.label].filter(Boolean).join(" ");
}

// --- reading an item ------------------------------------------------------

/**
 * Character level needed to equip. Reuses `ilvl` rather than a separate field: the
 * depth an item dropped at already tracks roughly 1:1 with the level a floor of that
 * depth expects (`recommendedLevel` in `data/depth.ts`), which is what makes a shared
 * stash meaningful once more than one class can pull from it — a level-1 alt can't
 * wear gear a much deeper main brought home until it catches up.
 *
 * The one-level grace below `ilvl` is deliberate, not slack in the lock: a floor's own
 * drops shouldn't be locked to the character who just cleared it. XP for a floor lands
 * as its monsters die, so clearing depth *N* often dings you to level *N* only partway
 * through (or on the very next floor) rather than the instant the last kill lands —
 * without the grace, a character playing one class start-to-finish, never touching an
 * alt or a shared stash, would still routinely find their own newest drops locked for
 * a floor or two. A much-deeper main's gear is still nowhere near a level-1 alt's
 * reach either way.
 */
export function requiredLevel(item: Pick<Item, "ilvl">): number {
  return Math.max(1, item.ilvl - 1);
}

/** Everything the item contributes, base stats and affixes together. */
export function itemMods(item: Item): Partial<Mods> {
  const out: Partial<Mods> = {};
  for (const k of STAT_KEYS) {
    if (item.stats[k]) out[k] = (out[k] ?? 0) + item.stats[k];
  }
  for (const m of item.mods) out[m.key] = (out[m.key] ?? 0) + m.value;
  return out;
}

/**
 * What a point of each modifier is worth, for "is this an upgrade" arrows and for the
 * bulk-sell. It's a heuristic and it is allowed to be: it only ever has to be roughly
 * right, and the player has the full comparison in front of them anyway.
 */
const MOD_SCORE: Record<ModKey, number> = {
  attack: 2.2, defense: 1.8, maxHealth: 0.5, power: 3, haste: 3, maxMana: 1.2,
  critChance: 260, critDamage: 90, attackSpeed: 240, moveSpeed: 120, areaSize: 90,
  projectiles: 300, pierce: 150, ailmentChance: 80, ailmentPotency: 70,
  lifeOnHit: 12, manaOnHit: 8, cooldownRate: 90, ultimateRate: 70, ultimatePower: 80,
  skillDamage: 140, meleeDamage: 150, projectileDamage: 120, elementalDamage: 130,
  thorns: 2,
  healthPercent: 200, defensePercent: 150, manaRegen: 20,
  evasion: 220, blockChance: 160,
  // The universal tree's own knobs (UAT §18). No entry in `MOD_POOL` rolls them, so
  // these only exist because the record is exhaustive — but if one is ever put on an
  // affix, a wrong score here would quietly misrank it, so they're priced properly.
  dashRate: 100, pickupRadius: 15, coinFind: 45, gemFind: 45,
  // A whole extra dodge is worth about what +1 projectile is: a new answer, not a bigger number.
  dashCharges: 320,
  fireDamage: 130, coldDamage: 130, lightningDamage: 130, poisonDamage: 130, voidDamage: 130,
  holyDamage: 130, arcaneDamage: 130, natureDamage: 130,
  fireResist: 1.1, coldResist: 1.1, lightningResist: 1.1, poisonResist: 1.1, voidResist: 1.1,
  holyResist: 1.1, arcaneResist: 1.1, natureResist: 1.1,
};

/**
 * A single number for "is this better than that". Pass the hero's class and a weapon
 * it wasn't built for is marked down, which is what stops the auto-sort handing a
 * Berserker a staff because the staff had more raw attack on it.
 */
export function itemScore(item: Item, heroClass?: HeroClass): number {
  let total = 0;
  const mods = itemMods(item);
  for (const [key, value] of Object.entries(mods) as [ModKey, number][]) {
    total += value * (MOD_SCORE[key] ?? 1);
  }
  if (item.grant) total += 140;
  if (item.trigger) total += item.trigger.power * 160;
  // A named item's live behaviour isn't in its affix list; price each effect like a grant
  // so the upgrade arrows and the junk filter don't mistake identity for a stat stick.
  if (item.named) total += (NAMED_BY_ID[item.named]?.effects?.length ?? 0) * 140;
  if (heroClass && item.family) {
    total *= heroClass.affinity.includes(item.family) ? 1 + heroClass.affinityBonus : 0.72;
  }
  return total;
}

/**
 * One line of "what does this do", for a list row. An unspoken item can carry seven
 * modifiers and a granted skill; the row shows the shape of it and the comparison panel
 * shows the rest, because a row that lists everything is a row nobody reads.
 */
const LINE_MODS = 3;

export function statLine(item: Item): string {
  const parts = STAT_KEYS.filter((k) => item.stats[k] > 0)
    .map((k) => `+${item.stats[k]} ${STAT_LABELS[k]}`);
  for (const m of item.mods.slice(0, LINE_MODS)) parts.push(modShort(m));
  const hidden = item.mods.length - LINE_MODS;
  if (hidden > 0) parts.push(`+${hidden} more`);
  if (item.grant) parts.push("grants a skill");
  if (item.trigger) parts.push("triggered");
  if (item.named) parts.push("named");
  return parts.join(", ");
}

/**
 * A rolled mod, formatted the way it reads on the item. Whether it's a percentage is a
 * property of the modifier itself, never of how it happens to scale with rarity —
 * resistance rolls grow linearly and are still flat numbers.
 */
export function modShort(m: ItemMod): string {
  return PERCENT_MODS.has(m.key)
    ? `+${Math.round(m.value * 100)}% ${labelFor(m.key)}`
    : `+${Math.round(m.value * 10) / 10} ${labelFor(m.key)}`;
}

function labelFor(key: ModKey): string {
  return MOD_LABELS[key];
}
