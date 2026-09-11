/**
 * Augments — the one thing in the game you *aim*.
 *
 * Design record: `docs/augments.md`. Read it before tuning a number here.
 *
 * An augment constrains **one axis of a chest pull**, and a loadout holds **at most one
 * per axis**. That single decision does most of the work in this file: conflict
 * resolution is not a rule, it is the absence of a place to put the conflict. Two element
 * augments cannot both be applied because `AugmentLoadout` has one element slot — slotting
 * a second swaps out the first. Every "what if the player stacks two X" question answers
 * itself and `openChests` never has to arbitrate.
 *
 * There are four axes and there will not be a fifth without an owner ruling, because four
 * is exactly the number of decisions a chest pull already makes:
 *
 *   rarity  -> the weight mask multiplied into `BASE_RARITY_WEIGHTS`  (CHESTS[t].weights)
 *   form    -> the `ItemType` handed to `rollItem`                    (ChestTierInfo.types)
 *   element -> `RollOptions.favorElement`                             (crafting essences)
 *   affix   -> one reserved pick in `rollMods`                        (the one new knob)
 *
 * **`BASE_RARITY_WEIGHTS` is not forked.** A rarity augment is a mask *multiplied into* it,
 * exactly the way `CHESTS[tier].weights` already is, which is why an augmented pull rolls
 * through the same `rollItem` every dropped item does.
 *
 * Pure data + pure functions, like the rest of `data/`. No DOM, no `GameState`.
 */

import type { DropSource, FoundSource } from "./drops";
import { ELEMENTS, type Element } from "./elements";
import { CHESTS, type ChestTier } from "./chests";
import { ITEM_TYPES, MOD_POOL, isWeaponType, modAllowed, type ItemType, type ModRoll } from "./items";
import { BASE_RARITY_WEIGHTS, RARITIES, rarityIndex, rarityLabel, type Rarity } from "./rarity";
import { WEAPON_FAMILIES } from "./weapons";

// --- the axes -----------------------------------------------------------------

export const AUGMENT_AXES = ["rarity", "form", "element", "affix"] as const;
export type AugmentAxis = (typeof AUGMENT_AXES)[number];

/**
 * What an augment does. A discriminated union on the axis, so the compiler already knows
 * a form augment has no element and an element augment has no rarity mask — which is what
 * lets `AugmentLoadout` below enforce one-per-axis structurally instead of with a validator.
 */
export type AugmentEffect =
  /** Multiplied into the chest's own weights. Zero removes a rarity, exactly as a chest does. */
  | { readonly axis: "rarity"; readonly weights: Record<Rarity, number> }
  | { readonly axis: "form"; readonly type: ItemType }
  /**
   * Weights the affix pool toward the element **and** guarantees one of its two rolls is
   * present — the owner's "same for the bow augment would be a guaranteed bow, etc."
   * applied to this axis. Which of the two (`dmg-` on an offensive slot, `res-` on a
   * defensive one) is decided by `modAllowed`, not authored here.
   */
  | { readonly axis: "element"; readonly element: Element }
  /**
   * Reserves one affix slot for this `ModRoll` id. The rarity it needs and the item types
   * that can carry it are **read off `MOD_POOL`** rather than restated here, so an augment
   * can never disagree with the roll it names.
   */
  | { readonly axis: "affix"; readonly modId: string };

export interface AugmentDef {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /**
   * The augment's own place on the eight-rarity ladder. ONE number saying three things:
   * what colour it draws, how it sorts, and how rare it is to find
   * (`AUGMENT_GRADE_WEIGHTS`). Adding an augment is one row, never a second table.
   */
  readonly grade: Rarity;
  readonly effect: AugmentEffect;
  /** Read through `data/drops.ts`, the same shared table named items and relics use. */
  readonly sources: readonly DropSource[];
}

// --- the rarity ladder --------------------------------------------------------

/**
 * A rarity augment is a **floor**, not a value: it zeroes the rungs beneath it and leaves
 * the chest's own curve intact above. Mechanically identical to what
 * `CHESTS.Legendary.weights` has always done, which is the whole reason it composes.
 *
 * There is no Common or Uncommon Augment — a floor of common is what a Basic chest is.
 */
function floorMask(floor: Rarity): Record<Rarity, number> {
  const min = rarityIndex(floor);
  const out = {} as Record<Rarity, number>;
  for (const r of RARITIES) out[r] = rarityIndex(r) < min ? 0 : 1;
  return out;
}

/**
 * **The ceiling. Ruled by the owner: every axis guarantees, all the way to unspoken.**
 *
 * The design shipped conservatively first (a mythic floor with divine/unspoken as heavy
 * weights) and the owner overturned it:
 *
 * > "Yes the unspoken augment would be a guaranteed unspoken, same for the bow augment
 * > would be a guaranteed bow, etc. But they should be 2x harder to get dropped from the
 * > avarice rifts because they guarantee it. It adds this fun 'crafting' element."
 *
 * **What the player mostly buys is agency; the discount is small and bounded.** The
 * guarantee is paid for by halving `AUGMENT_GRADE_RATE` — the owner's literal price — and
 * what is left over is a modest discount they granted on purpose, consistent with their
 * standing position that unspokens should become farmable at the very top end, *"not by
 * much, but that little percent."* `MAX_CEILING_DISCOUNT` is what stops that percent from
 * growing. The main thing that changes is that the ceiling, when you reach it, arrives as
 * the bow you wanted rather than gloves for a class you do not play.
 *
 * This is **not** a repeal of the crafting cap. Crafting still stops at mythic on every
 * path. The guarantee lives only on a rare *dropped* object, and all four restrictions
 * below are load-bearing rather than incidental — an augment cannot be bought, forged,
 * salvaged or traded. Anything that gives one a price turns a chase into a purchase order.
 */

/**
 * The floors, in ladder order. Each is a pure floor: an Unspoken Augment leaves exactly one
 * rung standing, which is what "guaranteed" means expressed as a weight mask. A floor never
 * *caps* — a Legendary Augment can still produce a mythic, because the mask above the floor
 * is the chest's own curve.
 */
const RARITY_AUGMENT_MASKS: Record<string, Record<Rarity, number>> = Object.fromEntries(
  (["rare", "epic", "legendary", "mythic", "divine", "unspoken"] as const).map((r) => [r, floorMask(r)]),
);

export const RARITY_AUGMENT_GRADES: readonly Rarity[] = ["rare", "epic", "legendary", "mythic", "divine", "unspoken"];

// --- how rare an augment is to find -------------------------------------------

/**
 * The chance a dropped augment lands on each grade — the *only* scarcity number in the
 * system. Within a grade the pick is uniform across everything the event matched, so
 * adding a form augment never quietly makes the others rarer at their own grade.
 *
 * Tuned against the design target: an Unspoken Augment is roughly one in six hundred
 * top-tier Avarice boss caches. `tools/augments.ts` measures that rather than asserting
 * the arithmetic here, because a rate written in a comment is a rate that goes stale.
 */
/**
 * **The whole augment economy: one named rate per grade, per Avarice boss cache.**
 *
 * **This table is the whole augment economy. One edit per grade, and nothing else has to
 * move** — the definitions divide their grade's rate among themselves, `rollOne` reads the
 * numbers straight off the table, and `tools/augments.ts` measures the result rather than
 * restating it. Nobody tuning this should have to re-derive a share, a denominator or a
 * separate event rate; there is no longer any of those.
 *
 * The current numbers are the design's original baseline **halved**, which is the owner's
 * literal instruction and the price they set:
 *
 * > "they should be 2x harder to get dropped from the avarice rifts because they guarantee it"
 *
 * A factor is meant literally here, and that is not in tension with the standing rule that
 * a multiplier in a brief means a percentage: that rule governs gameplay modifiers on
 * content, where a literal 5x is unbalanceable. This is the rarity of an object, where a
 * factor is the correct unit and is checkable.
 *
 * **The owner deliberately bought a discount with that 2x, and it is not zero.** An earlier
 * draft was tuned to a derived rule — "the expected cost of reaching the ceiling must never
 * fall" — which drove these ~10x rarer than the owner's price. That rule was stronger than
 * anything the owner said, and when a derived constraint disagrees with an explicit
 * instruction the instruction wins. What is still guarded is the *size* of the discount:
 * `MAX_CEILING_DISCOUNT` below, asserted as a comparison, so augments can never become
 * common enough to trivialise the ceiling.
 */
export const AUGMENT_GRADE_RATE: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.088,
  rare: 0.098,
  epic: 0.043,
  legendary: 0.012,
  mythic: 0.0073,
  divine: 0.0020,
  unspoken: 0.00044,
};


/**
 * The most a grade's augment may be cheaper than simply finding an item of that rarity in
 * the same cache, measured at the lowest tier the grade can drop at.
 *
 * A real guard rather than a restatement of the tuning: the owner granted a discount, so
 * asserting "no discount" would be false by design, but an unbounded one would mean a later
 * rate bump could quietly make the top of the ladder farmable. Above this factor,
 * `tools/augments.ts` fails and the number has to be argued for rather than nudged.
 */
export const MAX_CEILING_DISCOUNT = 6;

/** Floors 1-3 of an Avarice Rift pay this share of the boss cache's rate. */
export const AVARICE_FLOOR_SHARE = 0.18;

/** Avarice tier a grade needs before it can drop at all — §16's "tier 8 drops what tier 1 cannot".
 *
 * These gates are load-bearing, not flavour. A shallow Avarice cache almost never drops a
 * divine item, so an *ungated* divine augment comes out commoner than the thing it
 * guarantees down there — the exact inversion the system exists to prevent. The gates put
 * each grade's first appearance at a tier where the item it guarantees is already plausible.
 */
const GRADE_MIN_TIER: Partial<Record<Rarity, number>> = { divine: 5, unspoken: 8 };

/** How many definitions sit at each grade — filled in below, once the roster is known. */
const GRADE_COUNT: Record<string, number> = {};

/**
 * Avarice Rifts, the Vigil and the Convergence. Nowhere else — the brief's "exclusively",
 * taken literally, and it hands the Avarice Rift the identity it has been missing: it is
 * the volume rift you farm for gems and sell-fodder, and it becomes the only place the
 * game's rarest objects come from. Which is exactly what the worldbuilding says an Avarice
 * Rift *is*: the place the leftovers of made things pile up.
 *
 * The Vigil and the Convergence pay theirs as a guaranteed drop wired at their own reward
 * sites (`game/dungeon.ts`), capped at a grade, rather than as a source here — a
 * guaranteed payout is not a chance and should not pretend to be one.
 */
function augmentSources(grade: Rarity, share: number): FoundSource[] {
  const minTier = GRADE_MIN_TIER[grade];
  const tier = minTier !== undefined ? { minTier } : {};
  // A definition's own chance is its grade's rate split evenly among the definitions at
  // that grade — so **adding a form augment splits the rare share rather than quietly
  // making every other rare augment rarer**, the drift a bare per-definition rate would
  // introduce the next time the weapon roster grows.
  const boss = AUGMENT_GRADE_RATE[grade] * share;
  return [
    { kind: "clearCache", mode: "hoard", minDepth: 1, chance: boss, lastFloor: true, ...tier },
    { kind: "clearCache", mode: "hoard", minDepth: 1, chance: boss * AVARICE_FLOOR_SHARE, ...tier },
  ];
}

/** The best grade the Vigil and the Convergence will ever hand out. */
export const DAILY_AUGMENT_CAP: Rarity = "epic";
export const WEEKLY_AUGMENT_CAP: Rarity = "legendary";

/**
 * Picks one augment at or below `cap`, weighted by grade — how the Vigil and the
 * Convergence pay theirs.
 *
 * Deliberately *not* a `DropSource`: those two pay a **guaranteed** augment, and a
 * guarantee is not a chance and should not be written as one. A source with `chance: 1`
 * would be a lie the moment `dropChance` scaled it, and it would put the daily's payout
 * on the §16 danger curve, which is exactly the double-dip the Vigil's own modifier split
 * exists to prevent.
 */
export function augmentsUpTo(cap: Rarity): readonly AugmentDef[] {
  const max = rarityIndex(cap);
  return AUGMENTS.filter((a) => rarityIndex(a.grade) <= max);
}

/** Weighted pick over a pool, by grade. Shared by the guaranteed payouts and the tool. */
export function pickAugment(pool: readonly AugmentDef[], roll: number): AugmentDef | null {
  let total = 0;
  for (const a of pool) total += augmentRate(a);
  if (total <= 0) return null;
  let r = roll * total;
  for (const a of pool) {
    r -= augmentRate(a);
    if (r < 0) return a;
  }
  return pool[pool.length - 1] ?? null;
}

/** One definition's own drop chance from a boss cache — its grade's rate, split by count. */
export function augmentRate(def: AugmentDef): number {
  return AUGMENT_GRADE_RATE[def.grade] / (GRADE_COUNT[def.grade] ?? 1);
}

// --- the roster ---------------------------------------------------------------

/**
 * A definition minus its sources. The roster is built in two passes because a grade's rate
 * is split among the definitions at that grade, and that count is not known until every
 * family has been authored.
 */
type AugmentDraft = Omit<AugmentDef, "sources">;

function def(id: string, name: string, grade: Rarity, blurb: string, effect: AugmentEffect): AugmentDraft {
  return { id, name, grade, blurb, effect };
}

const RARITY_BLURBS: Partial<Record<Rarity, string>> = {
  rare: "Nothing common survived whatever this came off. Neither will anything you make with it.",
  epic: "Recovered whole from something that was already very good.",
  legendary: "Filed by the Keepers as materiel. It was somebody's life's work.",
  mythic: "It has not stopped being what it was. Requisition around it carefully.",
  divine: "A fragment of something that was made in Heaven and did not survive the fall.",
  unspoken: "The Keepers have no category for this and have stopped trying to make one.",
};

const RARITY_AUGMENTS: readonly AugmentDraft[] = RARITY_AUGMENT_GRADES.map((r) =>
  def(`rarity-${r}`, `${rarityLabel(r)} Augment`, r, RARITY_BLURBS[r]!, {
    axis: "rarity", weights: RARITY_AUGMENT_MASKS[r]!,
  }));

/**
 * One per `ItemType` — the fourteen weapon families plus the five other slots. **These
 * replace, one for one, the nineteen chests the overhaul deletes** (§3): a Bow Cache could
 * promise a family and a Storm Cache could promise an element, and neither could promise
 * both. That symmetry is the argument for the whole overhaul.
 */
const FORM_AUGMENTS: readonly AugmentDraft[] = ITEM_TYPES.map((type) => {
  const weapon = isWeaponType(type);
  return def(
    `form-${type}`,
    `${type.charAt(0).toUpperCase() + type.slice(1)} Augment`,
    // A specific ring is a smaller ask than a specific scythe, and priced like it.
    weapon ? "rare" : "uncommon",
    weapon
      ? `A shard of one. Whatever is requisitioned around it comes out a ${type}.`
      : `A shard of one. Whatever is requisitioned around it comes out ${type === "armor" ? "armor" : `a ${type}`}.`,
    { axis: "form", type },
  );
});

/**
 * One per element. Holy, arcane and nature sit a grade higher: they are deliberately kept
 * out of every random roll (`LOOT_ELEMENTS`) and are reachable today only through a
 * crafting essence. An augment is their second route and it stays a rare one.
 */
const ELEMENT_AUGMENTS: readonly AugmentDraft[] = ELEMENTS.filter((e) => e !== "physical").map((element) => {
  const reserved = element === "holy" || element === "arcane" || element === "nature";
  return def(
    `element-${element}`,
    `${element.charAt(0).toUpperCase() + element.slice(1)} Augment`,
    reserved ? "legendary" : "epic",
    `Still carrying the charge it was made with. Whatever comes out carries ${element} with it.`,
    { axis: "element", element },
  );
});

/**
 * Curated, not generated. An augment for `+12 defense` is noise, and forty of them make
 * the tab unreadable — so this is the list of affixes players actually chase. The grade
 * is derived from the roll's own `minTier` (see `augmentGrade` below), never authored, so
 * an affix augment can never claim to be commoner than the roll it guarantees.
 */
const AFFIX_MOD_IDS: readonly string[] = [
  "deadly", "savage", "frenzied", "quickened", "fleet",
  "bloodthirsty", "titanic", "vast", "splitting",
  // "rebounding" stood here until `of Rebounding` was retired with the `ultimateBounces`
  // key it rolled (docs/ultimate-mods-removal.md). An augment that guarantees an affix
  // cannot outlive the affix, so it retired with it and this list is nine rather than ten.
  // `affix-rebounding` is dropped from a save by the `isAugmentId` filter in `state.ts`,
  // the same way a retired cosmetic id is — so an owned copy is lost rather than crashing.
];

export function modRollById(id: string): ModRoll | undefined {
  return MOD_POOL.find((m) => m.id === id);
}

/** The rarity a `ModRoll` first becomes reachable at — read off the pool, never restated. */
export function affixMinRarity(mod: ModRoll): Rarity {
  return RARITIES[Math.min(mod.minTier, RARITIES.length - 1)]!;
}

const AFFIX_AUGMENTS: readonly AugmentDraft[] = AFFIX_MOD_IDS.map((modId) => {
  const mod = modRollById(modId);
  // Non-null assertion removed deliberately: this list is ids into MOD_POOL, so retiring
  // an affix row used to take the whole module down at import with an unrelated-looking
  // `Cannot read properties of undefined`. Say what actually happened instead.
  if (!mod) {
    throw new Error(
      `augments: AFFIX_MOD_IDS names "${modId}", which is not in MOD_POOL. ` +
      "If an affix was retired, remove its id here too (see docs/ultimate-mods-removal.md).",
    );
  }
  // One rung above what the roll needs: guaranteeing an affix is worth more than
  // reaching the rarity that merely makes it possible.
  const grade = RARITIES[Math.min(rarityIndex(affixMinRarity(mod)) + 2, RARITIES.length - 1)]!;
  return def(
    `affix-${modId}`,
    `${mod.label.replace(/^of the |^of /, "")} Augment`,
    grade,
    `Whatever this was, it was ${mod.label.toLowerCase().replace(/^of the |^of /, "")}. It still is.`,
    { axis: "affix", modId },
  );
});

const DRAFTS: readonly AugmentDraft[] = [
  ...RARITY_AUGMENTS, ...FORM_AUGMENTS, ...ELEMENT_AUGMENTS, ...AFFIX_AUGMENTS,
];

for (const d of DRAFTS) GRADE_COUNT[d.grade] = (GRADE_COUNT[d.grade] ?? 0) + 1;

export const AUGMENTS: readonly AugmentDef[] = DRAFTS.map((d) => ({
  ...d,
  sources: augmentSources(d.grade, 1 / (GRADE_COUNT[d.grade] ?? 1)),
}));

export const AUGMENT_BY_ID: Record<string, AugmentDef> = Object.fromEntries(
  AUGMENTS.map((a) => [a.id, a]),
);

export function isAugmentId(id: unknown): id is string {
  return typeof id === "string" && id in AUGMENT_BY_ID;
}

export function augmentsOnAxis(axis: AugmentAxis): readonly AugmentDef[] {
  return AUGMENTS.filter((a) => a.effect.axis === axis);
}

// --- the loadout --------------------------------------------------------------

/**
 * One base chest plus up to four augments, at most one per axis.
 *
 * The base **defaults to `Basic` and that is a rule, not a default** (§5.2): augments
 * never require an expensive chest. If the top loadout demanded a Legendary key the system
 * would quietly become a coin sink wearing a chase item's clothes, and the moment this
 * whole thing is built around would arrive with a shopping trip attached to it.
 */
export interface AugmentLoadout {
  readonly base: ChestTier;
  readonly rarity: string | null;
  readonly form: string | null;
  readonly element: string | null;
  readonly affix: string | null;
}

export const DEFAULT_BASE: ChestTier = "Basic";

export function emptyLoadout(): AugmentLoadout {
  return { base: DEFAULT_BASE, rarity: null, form: null, element: null, affix: null };
}

export function loadoutIds(load: AugmentLoadout): string[] {
  return AUGMENT_AXES.map((a) => load[a]).filter((id): id is string => id !== null);
}

/** Slots `id` on its own axis, swapping out whatever was there. Conflict resolution, entire. */
export function withAugment(load: AugmentLoadout, id: string): AugmentLoadout {
  const d = AUGMENT_BY_ID[id];
  if (!d) return load;
  return { ...load, [d.effect.axis]: id };
}

/** The composed pull. **The one place any of this is decided.** */
export interface AugmentedPull {
  readonly weights: Record<Rarity, number>;
  /** Undefined means "anything", exactly as `ChestTierInfo.types` does. */
  readonly types: readonly ItemType[] | undefined;
  readonly favorElement: Element | undefined;
  /** Groups of `ModRoll` ids, one reserved slot each. See `RollOptions.ensureMods`. */
  readonly ensureMods: readonly (readonly string[])[];
}

/**
 * Composes a loadout into the four parameters a chest pull already takes.
 *
 * `openChests` calls this. The augment tab's outcome panel calls this. **Nothing else
 * computes a pull**, which is what makes the preview incapable of drifting out of sync
 * with the roll (UAT §20): it is not describing the pull, it is running the pull's own
 * composition and then not throwing dice.
 */
export function augmentedPull(load: AugmentLoadout): AugmentedPull {
  const info = CHESTS[load.base];
  const mask = load.rarity ? (AUGMENT_BY_ID[load.rarity]?.effect as { weights: Record<Rarity, number> } | undefined) : undefined;

  const weights = {} as Record<Rarity, number>;
  for (const r of RARITIES) {
    // Base odds x the chest's own multipliers x the augment's mask. Multiplication, so a
    // Legendary chest under a Mythic Augment is still the Legendary chest's curve above
    // the floor — the two compose instead of one overriding the other.
    weights[r] = BASE_RARITY_WEIGHTS[r] * info.weights[r] * (mask?.weights[r] ?? 1);
  }

  const formDef = load.form ? AUGMENT_BY_ID[load.form] : undefined;
  const form = formDef?.effect.axis === "form" ? formDef.effect.type : undefined;
  const elementDef = load.element ? AUGMENT_BY_ID[load.element] : undefined;
  const element = elementDef?.effect.axis === "element" ? elementDef.effect.element : undefined;
  const affixDef = load.affix ? AUGMENT_BY_ID[load.affix] : undefined;
  const ensureMod = affixDef?.effect.axis === "affix" ? affixDef.effect.modId : undefined;

  // Every axis guarantees (the owner's ruling), so both the element and the affix augment
  // reserve a slot. An element's guarantee is satisfied by either of its two rolls; which
  // one depends on the slot, so both are offered and `rollMods` takes the allowed one.
  const ensureMods: string[][] = [];
  if (element) ensureMods.push([`dmg-${element}`, `res-${element}`]);
  if (ensureMod) ensureMods.push([ensureMod]);

  let types: readonly ItemType[] | undefined = form ? [form] : info.types;
  // An affix augment implies the form constraint it needs. `savage` is `where: "weapon"`,
  // so a Crit Damage Augment on a bare Basic chest narrows the pull to weapons rather than
  // rolling a necklace and silently doing nothing. A silent no-op is exactly what nobody
  // would spend one of these on; if the narrowing is empty, `loadoutProblems` refuses the
  // combine at authoring time instead.
  const mod = ensureMod ? modRollById(ensureMod) : undefined;
  if (mod) {
    const tier = rarityIndex(bestReachable(weights));
    const ok = (t: ItemType) => modAllowed(mod, t, tier);
    types = (types ?? ITEM_TYPES).filter(ok);
    if (types.length === 0) types = undefined;
  }

  return {
    weights,
    types,
    favorElement: element ?? info.favorElement,
    ensureMods,
  };
}

/** The best rarity a weight table can still produce — what an affix's `minTier` is judged against. */
function bestReachable(weights: Record<Rarity, number>): Rarity {
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    const r = RARITIES[i]!;
    if (weights[r] > 0) return r;
  }
  return "common";
}

/** The worst rarity a weight table can still produce — the loadout's actual floor. */
export function loadoutFloor(load: AugmentLoadout): Rarity {
  const { weights } = augmentedPull(load);
  for (const r of RARITIES) if (weights[r] > 0) return r;
  return "common";
}

/**
 * Everything wrong with a loadout, as sentences the tab prints before spending anything.
 *
 * The design rule here is that a bad state is made **unreachable rather than handled**:
 * one-per-axis is enforced by the shape of `AugmentLoadout`, and the two remaining ways to
 * ask for something impossible are both refused at authoring time with a reason, rather
 * than accepted and silently ignored at roll time.
 */
export function loadoutProblems(load: AugmentLoadout): string[] {
  const out: string[] = [];
  for (const id of loadoutIds(load)) {
    if (!AUGMENT_BY_ID[id]) out.push(`"${id}" is not an augment`);
  }
  const affixDef = load.affix ? AUGMENT_BY_ID[load.affix] : undefined;
  if (affixDef?.effect.axis === "affix") {
    const mod = modRollById(affixDef.effect.modId);
    if (!mod) {
      out.push(`${affixDef.name} names no affix`);
    } else {
      const floor = loadoutFloor(load);
      const need = affixMinRarity(mod);
      if (rarityIndex(bestReachable(augmentedPull({ ...load, affix: null }).weights)) < mod.minTier) {
        out.push(`${affixDef.name} needs ${rarityLabel(need)} or better; this chest cannot roll that high.`);
      } else if (rarityIndex(floor) < mod.minTier && load.rarity === null) {
        // Reachable but not guaranteed: not an error, and the tab says so in the outcome
        // panel rather than here. Only a genuine impossibility is a refusal.
      }
      const formDef = load.form ? AUGMENT_BY_ID[load.form] : undefined;
      if (formDef?.effect.axis === "form") {
        const tier = rarityIndex(bestReachable(augmentedPull(load).weights));
        if (!modAllowed(mod, formDef.effect.type, tier)) {
          out.push(`${affixDef.name} cannot roll on a ${formDef.effect.type}.`);
        }
      }
    }
  }
  return out;
}

/** One line describing what the loadout will produce. Reads `augmentedPull`, holds no table. */
export function loadoutSummary(load: AugmentLoadout): string {
  const pull = augmentedPull(load);
  const floor = loadoutFloor(load);
  const what = pull.types && pull.types.length === 1 ? pull.types[0]! : pull.types ? "piece of gear" : "anything";
  const rarity = load.rarity ? `${rarityLabel(floor)} or better` : "any rarity";
  const element = pull.favorElement ? `, ${pull.favorElement}-weighted affixes` : "";
  const affixDef = load.affix ? AUGMENT_BY_ID[load.affix] : undefined;
  const mod = affixDef?.effect.axis === "affix" ? modRollById(affixDef.effect.modId) : undefined;
  const affix = mod ? `, guaranteed ${mod.label.replace(/^of the |^of /, "").toLowerCase()}` : "";
  return `A ${rarity} ${what}${element}${affix}.`;
}

// --- reading a definition ---------------------------------------------------------

export function augmentAxisLabel(axis: AugmentAxis): string {
  return axis === "affix" ? "Affix" : axis.charAt(0).toUpperCase() + axis.slice(1);
}

/** Everything structurally wrong with one definition. `tools/augments.ts` walks the roster. */
export function augmentProblems(a: AugmentDef): string[] {
  const out: string[] = [];
  if (!a.id.trim()) out.push("augment needs an id");
  if (!a.name.trim()) out.push(`${a.id} needs a name`);
  if (!a.blurb.trim()) out.push(`${a.id} needs a blurb`);
  if (!(RARITIES as readonly string[]).includes(a.grade)) out.push(`${a.id} grade "${a.grade}" is not a rarity`);
  if (a.grade === "common") out.push(`${a.id} is common-grade; augments start at uncommon`);
  if (a.sources.length === 0) out.push(`${a.id} has no sources`);
  switch (a.effect.axis) {
    case "rarity": {
      const mask = a.effect.weights;
      if (RARITIES.every((r) => mask[r] === 1)) out.push(`${a.id} is a rarity augment that changes nothing`);
      /**
       * A rarity augment must be a **pure floor**: the rungs it keeps are a suffix of the
       * ladder and they all carry weight 1. That is what makes it compose as a mask over
       * the chest's own curve instead of becoming a second rarity distribution — the one
       * thing `data/rewards.ts` forbids anywhere in the game.
       *
       * This replaced the old "nothing may guarantee past mythic" guard when the owner
       * ruled that every axis guarantees. Note what survived the ruling: the ceiling may
       * now be reached deliberately, but it still may not be *weighted* toward. The
       * expensive thing to get wrong here is no longer the guarantee, it is somebody
       * later writing `{ unspoken: 40 }` and quietly creating a second curve.
       */
      const kept = RARITIES.filter((r) => mask[r] > 0);
      const first = kept.length > 0 ? rarityIndex(kept[0]!) : 0;
      const contiguous = kept.every((r, i) => rarityIndex(r) === first + i)
        && rarityIndex(kept[kept.length - 1]!) === RARITIES.length - 1;
      if (!contiguous) out.push(`${a.id} is not a floor — a rarity mask must keep a suffix of the ladder`);
      if (!kept.every((r) => mask[r] === 1)) {
        out.push(`${a.id} weights rarities instead of flooring them; a second rarity curve is not allowed`);
      }
      break;
    }
    case "form":
      if (!(ITEM_TYPES as readonly string[]).includes(a.effect.type)) out.push(`${a.id} names no item type`);
      break;
    case "element":
      if (!(ELEMENTS as readonly string[]).includes(a.effect.element)) out.push(`${a.id} names no element`);
      if (a.effect.element === "physical") out.push(`${a.id} favors physical, which is not an elemental roll`);
      break;
    case "affix": {
      const mod = modRollById(a.effect.modId);
      if (!mod) out.push(`${a.id} names no mod roll "${a.effect.modId}"`);
      else if (rarityIndex(a.grade) < mod.minTier) {
        out.push(`${a.id} is ${a.grade}-grade but guarantees a roll needing ${affixMinRarity(mod)}`);
      }
      break;
    }
  }
  return out;
}

/** Sanity: the weapon roster and the form augments must stay in step. */
export const FORM_AUGMENT_COUNT = ITEM_TYPES.length;
export const WEAPON_FORM_COUNT = WEAPON_FAMILIES.length;
