/**
 * The Forge's workbench — UAT §24 / §26 / §27.
 *
 * Every operation here takes an `Item` you already own and returns a new one, through
 * the same rolling code a drop uses: `rollMods` for a fresh affix, `modValue` for a
 * value, `makeTrigger` for a trigger, `GRANTABLE_ABILITY_IDS` for a skill. Nothing an op
 * can produce is a thing a chest couldn't have dropped; the bench only lets you choose
 * *which* of the possible items you end up holding. That is the difference between
 * "a path to gear" (diving) and "a path to a specific piece of gear" (this).
 *
 * The rarity gates are the drop's gates: a grant needs epic and an eligible slot, a
 * trigger needs legendary, an extra affix stops at `MOD_COUNTS`, and Ascend stops at
 * mythic because `data/crafting.ts` says divine and unspoken are chest-only. A named item
 * (`data/named.ts`) only accepts the ops that re-roll its own ranges — its affixes are its
 * identity, and identity isn't for sale.
 *
 * Pure: no `GameState`, no cost accounting. `GameState.applyForgeOp` pays and swaps.
 */

import type { Rng } from "../core/rng";
import {
  ASCEND_COMPONENTS, SALVAGE_ASH, SALVAGE_NAMED_MULT, ascendTarget, salvageEssence, type ForgeOp,
} from "../data/crafting";
import { ELEMENT_DAMAGE_KEY, ELEMENT_RESIST_KEY } from "../data/mods";
import { ELEMENTS, LOOT_ELEMENTS, type Element } from "../data/elements";
import {
  ITEM_NAMES, MOD_COUNTS, GRANT_MIN_TIER, TRIGGER_MIN_TIER, modAllowed, modValue, MOD_POOL,
  type ModRoll,
} from "../data/items";
import type { MaterialBag } from "../data/materials";
import { NAMED_BY_ID } from "../data/named";
import { RARITY_MULTIPLIERS, rarityIndex, type Rarity } from "../data/rarity";
import { GRANTABLE_ABILITY_IDS } from "../progression/index";
import {
  MOD_ROLL_BY_ID, baseStats, computeValue, decorate, grantEligible, levelScaleFor, makeTrigger,
  type Item, type ItemMod,
} from "./item";

/** Why an op can't run on this item, or null when it can. Shown verbatim in the UI. */
export function forgeOpBlocker(op: ForgeOp, item: Item, affix?: number): string | null {
  const tier = rarityIndex(item.rarity);
  const named = item.named ? NAMED_BY_ID[item.named] : undefined;
  const identity = "A named item's identity isn't for sale — reforge or temper it, or salvage it.";
  switch (op) {
    case "reforge":
    case "salvage":
      return null;
    case "temper": {
      if (affix === undefined || !item.mods[affix]) return item.mods.length ? "Pick an affix to temper." : "Nothing to temper.";
      return affixRange(item, affix) ? null : "That affix has no range to roll within.";
    }
    case "recast":
      if (named) return identity;
      if (affix === undefined || !item.mods[affix]) return item.mods.length ? "Pick an affix to recast." : "Nothing to recast.";
      return recastPool(item, affix).length ? null : "No other affix could take its place.";
    case "augment":
      if (named) return identity;
      return item.mods.length < MOD_COUNTS[item.rarity][1] ? null : `${item.rarity} carries at most ${MOD_COUNTS[item.rarity][1]} affixes.`;
    case "inscribe":
      if (named) return identity;
      if (!grantEligible(item.type)) return "Only weapons, rings and necklaces can carry a skill.";
      if (tier < GRANT_MIN_TIER) return "A granted skill needs epic or better.";
      return item.grant ? "It already grants a skill — rescribe or erase it." : null;
    case "rescribe":
      if (named) return identity;
      return item.grant ? null : "Nothing to rescribe — inscribe a skill first.";
    case "eraseGrant":
      if (named) return identity;
      return item.grant ? null : "It grants nothing.";
    case "awaken":
      if (named) return identity;
      return tier < TRIGGER_MIN_TIER ? "A trigger needs legendary or better." : null;
    case "eraseTrigger":
      if (named) return identity;
      return item.trigger ? null : "It has no trigger.";
    case "ascend":
      if (named) return identity;
      return ascendTarget(item.rarity) ? null : "Mythic is as far as the Forge goes. Divine and unspoken are found, never made.";
  }
}

// --- affixes -------------------------------------------------------------------

/**
 * The value range an affix could roll on this item, or null when it has none: a `flat`
 * pool affix (+1 projectile) has nothing to temper, and so does a named fixed affix
 * authored as a single number.
 */
export function affixRange(item: Item, affix: number): readonly [number, number] | null {
  const mod = item.mods[affix];
  if (!mod) return null;
  const levelScale = levelScaleFor(item.ilvl);
  const def = item.named ? NAMED_BY_ID[item.named] : undefined;
  const spec = def?.mods.find((m) => mod.id === `named:${def.id}:${m.key}`);
  if (spec) {
    if (!Array.isArray(spec.value)) return null;
    const [lo, hi] = spec.value as readonly [number, number];
    const grow = spec.scale === "rarity" ? RARITY_MULTIPLIERS[item.rarity] * levelScale : 1;
    return [lo * grow, hi * grow];
  }
  const roll = MOD_ROLL_BY_ID.get(mod.id);
  if (!roll || roll.scale === "flat") return null;
  return [modValue(roll, item.rarity, levelScale, 0.85), modValue(roll, item.rarity, levelScale, 1.15)];
}

/** Reroll one affix's value inside its own range. The key never changes. */
export function temper(item: Item, affix: number, rng: Rng): Item {
  const range = affixRange(item, affix);
  const mod = item.mods[affix];
  if (!range || !mod) return item;
  const value = Math.round(rng.range(range[0], range[1]) * 1000) / 1000;
  const mods = item.mods.map((m, i) => (i === affix ? { ...m, value } : m));
  return { ...item, mods };
}

/** Pool affixes that could replace `item.mods[affix]` — allowed here, and not already on the item. */
function recastPool(item: Item, affix: number): ModRoll[] {
  const tier = rarityIndex(item.rarity);
  const taken = new Set(item.mods.filter((_, i) => i !== affix).map((m) => m.key));
  const current = item.mods[affix]?.key;
  return MOD_POOL.filter((m) => modAllowed(m, item.type, tier) && !taken.has(m.key) && m.key !== current);
}

/** Replace one affix with a different pool affix. Everything else stays where it is. */
export function recast(item: Item, affix: number, rng: Rng): Item {
  const pool = recastPool(item, affix);
  if (pool.length === 0 || !item.mods[affix]) return item;
  const roll = rng.pick(pool);
  const raw = modValue(roll, item.rarity, levelScaleFor(item.ilvl), rng.range(0.85, 1.15));
  const value = roll.scale === "flat" ? raw : Math.round(raw * 1000) / 1000;
  const mods = item.mods.map((m, i) => (i === affix ? { id: roll.id, key: roll.key, value } : m));
  return renamed({ ...item, mods });
}

/** Add one affix from the pool, while the rarity still has room. */
export function augment(item: Item, rng: Rng): Item {
  if (item.mods.length >= MOD_COUNTS[item.rarity][1]) return item;
  const tier = rarityIndex(item.rarity);
  const taken = new Set(item.mods.map((m) => m.key));
  const pool = MOD_POOL.filter((m) => modAllowed(m, item.type, tier) && !taken.has(m.key));
  if (pool.length === 0) return item;
  const roll = rng.pick(pool);
  const raw = modValue(roll, item.rarity, levelScaleFor(item.ilvl), rng.range(0.85, 1.15));
  const value = roll.scale === "flat" ? raw : Math.round(raw * 1000) / 1000;
  return renamed(revalued({ ...item, mods: [...item.mods, { id: roll.id, key: roll.key, value }] }));
}

// --- the skill slot and the trigger --------------------------------------------------

/** Inscribe a skill onto an item without one, or rescribe a different one onto an item that has one. */
export function inscribe(item: Item, rng: Rng): Item {
  const pool = (GRANTABLE_ABILITY_IDS as readonly string[]).filter((id) => id !== item.grant);
  if (pool.length === 0) return item;
  return revalued({ ...item, grant: rng.pick(pool) });
}

export function eraseGrant(item: Item): Item {
  return revalued({ ...item, grant: null });
}

/** A fresh trigger at this rarity — the same roll a legendary drop makes, minus the dice for whether. */
export function awaken(item: Item, rng: Rng): Item {
  return revalued({ ...item, trigger: makeTrigger(rarityIndex(item.rarity), rng) });
}

export function eraseTrigger(item: Item): Item {
  return revalued({ ...item, trigger: null });
}

// --- ascension --------------------------------------------------------------------

/**
 * One rarity up, keeping what made the item yours. Every affix is re-derived at the new
 * tier with the *same variance fraction* it rolled with — a lucky 1.15× roll stays a
 * lucky roll — so an affix grows exactly as far as the tier does and no further. The
 * base block is re-rolled at the new rarity like a fresh drop's; grant and trigger ride
 * along untouched; the name is re-picked from the new rarity's table and re-decorated
 * with the affixes it already had. Returns the item unchanged at the mythic wall.
 */
export function ascend(item: Item, rng: Rng): Item {
  const to = ascendTarget(item.rarity);
  if (!to || item.named) return item;
  const levelScale = levelScaleFor(item.ilvl);
  const mods: ItemMod[] = item.mods.map((m) => {
    const roll = MOD_ROLL_BY_ID.get(m.id);
    if (!roll || roll.scale === "flat") return m;
    const unit = modValue(roll, item.rarity, levelScale, 1);
    const variance = unit > 0 ? m.value / unit : 1;
    const raw = modValue(roll, to, levelScale, variance);
    return { ...m, value: Math.round(raw * 1000) / 1000 };
  });
  const rolls = mods.map((m) => MOD_ROLL_BY_ID.get(m.id)).filter((r): r is ModRoll => !!r);
  const next: Item = {
    ...item,
    rarity: to,
    stats: baseStats(item.type, RARITY_MULTIPLIERS[to], levelScale, rng.range(0.85, 1.15)),
    mods,
    name: decorate(rng.pick(ITEM_NAMES[to][item.type]), rolls),
  };
  return revalued(next);
}

/**
 * Which stash items an ascension would consume: `ASCEND_COMPONENTS` of the same rarity,
 * never named, never the item itself, cheapest first — so the bill is exactly what the
 * bench shows before you confirm.
 */
export function ascendComponents(item: Item, stash: readonly Item[]): Item[] {
  return stash
    .filter((it) => it.id !== item.id && !it.named && it.rarity === item.rarity)
    .sort((a, b) => a.value - b.value)
    .slice(0, ASCEND_COMPONENTS);
}

// --- salvage -------------------------------------------------------------------------

/** What breaking an item down returns: Ash by rarity, and a pinch of each element it carried. */
export function salvageYield(item: Item): { ash: number; materials: Partial<MaterialBag> } {
  const ash = SALVAGE_ASH[item.rarity] * (item.named ? SALVAGE_NAMED_MULT : 1);
  const materials: Partial<MaterialBag> = {};
  const pinch = salvageEssence(item.rarity);
  for (const e of ELEMENTS) {
    const dmg = ELEMENT_DAMAGE_KEY[e];
    const res = ELEMENT_RESIST_KEY[e];
    const carries = item.mods.some((m) => (dmg && m.key === dmg) || (res && m.key === res));
    if (carries) materials[e] = (materials[e] ?? 0) + pinch;
  }
  // A weapon-slot trigger's element counts too; it was made of something.
  if (item.trigger && (LOOT_ELEMENTS as readonly Element[]).includes(item.trigger.element)) {
    materials[item.trigger.element] = (materials[item.trigger.element] ?? 0) + pinch;
  }
  return { ash, materials };
}

// --- internals -------------------------------------------------------------------

/** Re-price after anything that changes what the item carries. */
function revalued(item: Item): Item {
  return {
    ...item,
    value: computeValue(
      item.rarity, levelScaleFor(item.ilvl), item.mods.length, item.grant, item.trigger, item.named !== null,
    ),
  };
}

/** Re-decorate an ordinary item's name from the affixes it now has. Named items keep their name. */
function renamed(item: Item): Item {
  if (item.named) return item;
  const rolls = item.mods.map((m) => MOD_ROLL_BY_ID.get(m.id)).filter((r): r is ModRoll => !!r);
  const base = stripDecoration(item);
  return revalued({ ...item, name: decorate(base, rolls) });
}

/**
 * The undecorated base name — the item's `name` minus any prefix/suffix label its affixes
 * hung on it. Falls back to a fresh pick from the rarity's table if the name no longer
 * parses (a legacy save, a renamed label).
 */
function stripDecoration(item: Item): string {
  const table = ITEM_NAMES[item.rarity][item.type];
  const found = table.find((n) => item.name === n || item.name.includes(` ${n}`) || item.name.startsWith(`${n} `));
  return found ?? table[0] ?? item.name;
}

export type { Rarity };
