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
import { ELEMENT_DAMAGE_KEY, ELEMENT_RESIST_KEY, type ModKey } from "../data/mods";
import { ELEMENTS, LOOT_ELEMENTS, type Element } from "../data/elements";
import {
  ITEM_NAMES, MOD_COUNTS, GRANT_MIN_TIER, TRIGGER_MIN_TIER, TRIGGER_SHAPES, modPoolFor,
  modValue, triggerLine, type ModRoll, type TriggerSpec,
} from "../data/items";
import type { MaterialBag } from "../data/materials";
import { NAMED_BY_ID } from "../data/named";
import { RARITY_MULTIPLIERS, rarityIndex, type Rarity } from "../data/rarity";
import { ALL_CLASSES, GRANTABLE_ABILITY_IDS } from "../progression/index";
import {
  MOD_ROLL_BY_ID, baseStats, computeValue, decorate, grantEligible, levelScaleFor, makeTrigger,
  modShort, type Item, type ItemMod,
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
  const def = item.named ? NAMED_BY_ID[item.named] : undefined;
  const spec = def?.mods.find((m) => mod.id === `named:${def.id}:${m.key}`);
  // A named affix authored as a single number is fixed by the definition: there is no
  // range to temper within, even though `namedSpecRange` will happily quote it as one
  // for the possibilities panel, where "what you'd get" is the question being asked.
  if (spec) return Array.isArray(spec.value) ? namedSpecRange(spec, item) : null;
  const roll = MOD_ROLL_BY_ID.get(mod.id);
  if (!roll || roll.scale === "flat") return null;
  return poolRange(roll, item);
}

/** What a pool affix would land between on this item — the roll's own 0.85–1.15 spread. */
function poolRange(roll: ModRoll, item: Item): readonly [number, number] {
  const levelScale = levelScaleFor(item.ilvl);
  return [modValue(roll, item.rarity, levelScale, 0.85), modValue(roll, item.rarity, levelScale, 1.15)];
}

/** What a named definition's own affix would land between on this copy of it. */
function namedSpecRange(
  spec: { readonly value: number | readonly [number, number]; readonly scale?: string }, item: Item,
): readonly [number, number] {
  const grow = spec.scale === "rarity" ? RARITY_MULTIPLIERS[item.rarity] * levelScaleFor(item.ilvl) : 1;
  const [lo, hi] = Array.isArray(spec.value)
    ? (spec.value as readonly [number, number])
    : [spec.value as number, spec.value as number];
  return [lo * grow, hi * grow];
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

/**
 * Pool affixes that could replace `item.mods[affix]` — allowed here, and not already on
 * the item. Exported because `forgePossibilities` shows this exact list: the panel and
 * the roll call one function, so they cannot drift (docket §10).
 */
export function recastPool(item: Item, affix: number): ModRoll[] {
  const tier = rarityIndex(item.rarity);
  const taken = new Set(item.mods.filter((_, i) => i !== affix).map((m) => m.key));
  const current = item.mods[affix]?.key;
  return modPoolFor(item.type, tier).filter((m) => !taken.has(m.key) && m.key !== current);
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

/**
 * Pool affixes an Augment could add — allowed here, and not one the item already
 * carries. Same reason `recastPool` is exported: the panel reads it, `augment` rolls
 * from it, and there is only one of it.
 */
export function augmentPool(item: Item): ModRoll[] {
  const tier = rarityIndex(item.rarity);
  const taken = new Set(item.mods.map((m) => m.key));
  return modPoolFor(item.type, tier).filter((m) => !taken.has(m.key));
}

/** Add one affix from the pool, while the rarity still has room. */
export function augment(item: Item, rng: Rng): Item {
  if (item.mods.length >= MOD_COUNTS[item.rarity][1]) return item;
  const pool = augmentPool(item);
  if (pool.length === 0) return item;
  const roll = rng.pick(pool);
  const raw = modValue(roll, item.rarity, levelScaleFor(item.ilvl), rng.range(0.85, 1.15));
  const value = roll.scale === "flat" ? raw : Math.round(raw * 1000) / 1000;
  return renamed(revalued({ ...item, mods: [...item.mods, { id: roll.id, key: roll.key, value }] }));
}

// --- the skill slot and the trigger --------------------------------------------------

/** The granted skills this item could end up carrying — never the one it already has. */
export function inscribePool(item: Item): readonly string[] {
  return GRANTABLE_ABILITY_IDS.filter((id) => id !== item.grant);
}

/** Inscribe a skill onto an item without one, or rescribe a different one onto an item that has one. */
export function inscribe(item: Item, rng: Rng): Item {
  const pool = inscribePool(item);
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


// --- the possibilities panel (docket §10) -------------------------------------------

/**
 * Which vocabulary an op draws from. The panel heads its list with this, and
 * `tools/forgepool.ts` keys its comparison on it — an op that draws affixes is checked
 * against the affixes the real op rolled, a grant against the grant, and so on.
 */
export type ForgeDraw = "affix" | "grant" | "trigger" | "value" | "certain";

/** One thing an op could land on, as the panel lists it. */
export interface ForgeOutcome {
  /** Stable identity: a `ModRoll.id`, an ability id, or a `TriggerSpec.id`. What the gate compares. */
  readonly id: string;
  readonly label: string;
  /** The affix key, so the caller formats the range with the same formatter it uses everywhere else. */
  readonly key: ModKey | null;
  /** Where the value would land on *this* item, when the outcome has a value at all. */
  readonly range: readonly [number, number] | null;
  /** The rarity tier this outcome unlocked at — 0 when it was always reachable. */
  readonly minTier: number;
}

export interface ForgePossibilities {
  readonly draw: ForgeDraw;
  /** What the list is, as a heading. */
  readonly heading: string;
  /** How many of them one run of the op lands on, and anything else that bounds it. */
  readonly note: string;
  readonly outcomes: readonly ForgeOutcome[];
}

/** A pool affix as the panel lists it, priced against this item. */
function affixOutcome(roll: ModRoll, item: Item): ForgeOutcome {
  return {
    id: roll.id,
    label: roll.label,
    key: roll.key,
    range: roll.scale === "flat" ? null : poolRange(roll, item),
    minTier: roll.minTier,
  };
}

/** A granted skill's display name, or its id when a class no longer defines it. */
function abilityName(id: string): string {
  for (const cls of ALL_CLASSES) {
    for (const a of cls.abilities) if (a.id === id) return a.name;
  }
  return id;
}

/**
 * What an op could produce on this item — the workbench's "possibilities" panel
 * (docket §10).
 *
 * **This function holds no table of its own, and that is the whole point.** It is the
 * §20 drop-preview rule applied to the bench: a preview that can disagree with the roll
 * is worse than no preview (`docs/drop-previews.md`), so every list below is read from
 * the function the op *actually rolls through* — `modPoolFor` for a reforge, `recastPool`
 * for a recast, `augmentPool` for an augment, `inscribePool` for a skill, `TRIGGER_SHAPES`
 * for a trigger, `affixRange` for a temper. Add an op and it draws from its own roll site
 * or it shows nothing; do not add a lookup table here.
 *
 * The ops divide into five draws rather than one, because their outcome spaces genuinely
 * differ: Reforge redraws the whole list, Recast swaps one, Augment adds one bounded by
 * `MOD_COUNTS`, Temper moves a value inside a range it cannot leave, and the erasures,
 * Ascend and Salvage do not roll at all. One flat "here are all the affixes" list would be
 * a wrong answer for four of the five.
 */
export function forgePossibilities(item: Item, op: ForgeOp, affix = 0): ForgePossibilities {
  const named = item.named ? NAMED_BY_ID[item.named] : undefined;
  const tier = rarityIndex(item.rarity);
  const identity: ForgePossibilities = {
    draw: "certain",
    heading: "Nothing to draw from",
    note: "A named item's affixes are its identity — this op refuses it, so there is no pool.",
    outcomes: [],
  };

  switch (op) {
    case "reforge": {
      if (named) {
        // A named reforge rerolls the *definition's* own ranges (`namedMods`), not the
        // pool — the same item, a different copy of it — plus `randomMods` extras that
        // do come from the pool. Showing the generic pool here would be a straight lie.
        const fixed: ForgeOutcome[] = named.mods.map((m) => ({
          id: `named:${named.id}:${m.key}`,
          label: named.name,
          key: m.key,
          range: namedSpecRange(m, item),
          minTier: 0,
        }));
        // `namedMods` draws its extras with `def.type`/`def.rarity` and drops any whose
        // key the definition already occupies — so those are unreachable and must not be
        // listed. Mirrored here rather than approximated: an outcome the panel shows and
        // the roll cannot produce is the same defect as one it hides.
        const taken = new Set(named.mods.map((m) => m.key));
        const extras = (named.randomMods ?? 0) > 0
          ? modPoolFor(named.type, rarityIndex(named.rarity))
            .filter((r) => !taken.has(r.key))
            .map((r) => affixOutcome(r, item))
          : [];
        return {
          draw: "affix",
          heading: "Every affix a reforge could give it",
          note: extras.length > 0
            ? `Rerolls all ${fixed.length} of the definition's own affixes inside their ranges, `
              + `plus ${named.randomMods} drawn from the ${extras.length} below.`
            : `Rerolls all ${fixed.length} of the definition's own affixes inside their ranges. Nothing else can appear.`,
          outcomes: [...fixed, ...extras],
        };
      }
      const pool = modPoolFor(item.type, tier);
      const [lo, hi] = MOD_COUNTS[item.rarity];
      return {
        draw: "affix",
        heading: "Every affix a reforge could give it",
        note: `Redraws the whole list: ${lo === hi ? lo : `${lo}–${hi}`} of these ${pool.length}, `
          + `never the same one twice. The base stats, the granted skill and the trigger are untouched.`,
        outcomes: pool.map((r) => affixOutcome(r, item)),
      };
    }
    case "recast": {
      if (named) return identity;
      const pool = recastPool(item, affix);
      const current = item.mods[affix];
      return {
        draw: "affix",
        heading: current ? `Every affix that could replace ${modShort(current)}` : "Every affix a recast could give it",
        note: `Exactly one of these ${pool.length}. The other ${Math.max(0, item.mods.length - 1)} `
          + `affix${item.mods.length - 1 === 1 ? "" : "es"} stay where they are, and what it already carries is out of the pool.`,
        outcomes: pool.map((r) => affixOutcome(r, item)),
      };
    }
    case "augment": {
      if (named) return identity;
      const pool = augmentPool(item);
      const cap = MOD_COUNTS[item.rarity][1];
      return {
        draw: "affix",
        heading: "Every affix an augment could add",
        note: `Exactly one of these ${pool.length}, added to the ${item.mods.length} it has. `
          + `${item.rarity} carries at most ${cap} — ${Math.max(0, cap - item.mods.length)} slot`
          + `${cap - item.mods.length === 1 ? "" : "s"} left.`,
        outcomes: pool.map((r) => affixOutcome(r, item)),
      };
    }
    case "temper": {
      const mod = item.mods[affix];
      const range = affixRange(item, affix);
      if (!mod || !range) {
        return {
          draw: "certain",
          heading: "Nothing to draw from",
          note: mod ? "That affix is a fixed number — there is no range to move it inside." : "Pick an affix first.",
          outcomes: [],
        };
      }
      return {
        draw: "value",
        heading: `Where ${modShort(mod)} could land`,
        note: "The key never changes and no other affix moves. This is the whole outcome space.",
        outcomes: [{ id: mod.id, label: MOD_ROLL_BY_ID.get(mod.id)?.label ?? "Tempered", key: mod.key, range, minTier: 0 }],
      };
    }
    case "inscribe":
    case "rescribe": {
      if (named) return identity;
      const pool = inscribePool(item);
      return {
        draw: "grant",
        heading: "Every skill it could be given",
        note: `Exactly one of these ${pool.length}, rolled, never chosen. A granted skill ignores class lines `
          + `entirely — that is what makes one worth wearing.`,
        outcomes: pool.map((id) => ({ id, label: abilityName(id), key: null, range: null, minTier: GRANT_MIN_TIER })),
      };
    }
    case "awaken": {
      if (named) return identity;
      return {
        draw: "trigger",
        heading: "Every trigger it could wake up with",
        note: `Exactly one of these ${TRIGGER_SHAPES.length}, in one of ${LOOT_ELEMENTS.length} elements `
          + `(${LOOT_ELEMENTS.join(", ")}), rolled together. Its power scales with the item's rarity.`,
        outcomes: TRIGGER_SHAPES.map((shape) => ({
          id: `${shape.kind}-${shape.effect}`,
          label: triggerLine(previewTrigger(shape, tier)),
          key: null,
          range: null,
          minTier: TRIGGER_MIN_TIER,
        })),
      };
    }
    case "ascend": {
      const to = ascendTarget(item.rarity);
      return {
        draw: "certain",
        heading: "Nothing to draw from",
        note: to
          ? `Certain, not rolled: ${item.rarity} becomes ${to}, every affix re-derived at the new tier with the `
            + `same luck it rolled with. Only the base stats and the name are redrawn.`
          : "Mythic is as far as the Forge goes. Divine and unspoken are found, never made.",
        outcomes: [],
      };
    }
    case "eraseGrant":
    case "eraseTrigger":
      return {
        draw: "certain",
        heading: "Nothing to draw from",
        note: "Certain, not rolled: it comes off, and nothing takes its place.",
        outcomes: [],
      };
    case "salvage": {
      const y = salvageYield(item);
      const mats = (Object.keys(y.materials) as Element[]).length;
      return {
        draw: "certain",
        heading: "Nothing to draw from",
        note: `Certain, not rolled: ${y.ash} Ash${mats > 0 ? ` and a pinch of ${mats} material${mats === 1 ? "" : "s"}` : ""}, `
          + `and the item is gone.`,
        outcomes: [],
      };
    }
  }
}

/**
 * A trigger of this shape at this tier, for the panel to describe. Built the way
 * `makeTrigger` builds one, minus the two dice — the element is the one thing the panel
 * quotes as a set rather than a value, because a trigger rolls its element too.
 */
function previewTrigger(shape: (typeof TRIGGER_SHAPES)[number], tier: number): TriggerSpec {
  return {
    id: `${shape.kind}-${shape.effect}`,
    kind: shape.kind,
    effect: shape.effect,
    element: LOOT_ELEMENTS[0]!,
    chance: shape.chance,
    power: Math.round(shape.power * (1 + (tier - 4) * 0.22) * 100) / 100,
    radius: shape.radius,
    count: shape.count,
  };
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
