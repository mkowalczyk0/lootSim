/**
 * The reward curve — UAT §16, "harder content pays better", said once.
 *
 * §16 asks that higher difficulty affect five things: **drop rarity, drop chance, number
 * of possible drops, potential item power, and special variants.** Three of those already
 * happened somewhere; two didn't happen at all. What was missing more than any individual
 * number was a single place that states the promise, so that "is hard content actually
 * worth it" is one function to read rather than five call sites to find.
 *
 * ### The one input is `danger`
 *
 * Not depth, and not the Challenger tier. `RunConfig.danger` is already the number every
 * source of difficulty compounds into — a rift tier's `dangerPerTier ^ (tier - 1)`, the
 * Challenger dial's `challengerMultiplier`, a sector's tier — so a curve keyed on it
 * covers every way content gets harder, including ways added later, and cannot disagree
 * with the difficulty the player is actually facing. (One deliberate subtraction: the
 * Vigil's own modifiers are divided back out before this is called. See "the day's
 * weather" below.)
 *
 * Every axis is **logarithmic in danger and capped**. Logarithmic because danger is
 * exponential in a rift tier by design, so anything linear in it would run away; capped
 * because §9's caps are deliberate and this must not become a way around them.
 *
 * ### What this file does *not* touch, on purpose
 *
 * **Drop rarity.** It is composed in `profileFor` as
 * `0.06 + mode.rarityBias + challengerRarityBias(tier) + daily.rarityBias`, and it stays
 * there. `challengerRarityBias` caps out around tier 11 **by design** (§9): the Death
 * March tiers are about raw, uncapped danger, not about paying out more. Adding a second
 * rarity term here keyed on `danger` would quietly route around that cap and undo the
 * decision — so rarity is named as §16's first axis and left where it already works.
 *
 * **The day's weather.** `profileFor` feeds this the danger the player *chose* — the
 * Vigil's own modifiers are divided back out first. §17 splits the daily's twists into
 * ones that change how a floor fights and ones that change what it pays, with at most one
 * payer a day so the reward stays predictable; a Ferocious day arriving through this curve
 * as well would make it a second payer. Difficulty you opted into pays; the weather
 * doesn't. (The Challenger dial on a Vigil still pays, because you chose it.)
 *
 * **The mythic wall.** Nothing here can produce divine or unspoken. Those stay chest-only
 * however hard the content is (`data/crafting.ts` makes the same promise about the forge),
 * because `data/rarity.ts`'s "keep it absurd, the long tail is the hook" rule would mean
 * nothing if enough difficulty bought the top of the ladder outright. This file moves
 * *counts*, *odds*, *item level* and *element* — never the rarity ladder's ceiling.
 *
 * Pure data.
 */

/** What difficulty is worth, on every axis §16 names that a number can express. */
export interface RewardCurve {
  /**
   * Multiplies a named item's per-event chance. This is §16's "drop chance", and the
   * formula is unchanged from the one `namedDropChance` shipped with — it moved here so
   * there is one curve rather than one curve and one special case.
   */
  readonly dropChance: number;
  /**
   * Multiplies how many separate items drop — §16's "number of possible drops", which
   * nothing implemented before this. Folds into `DepthProfile.quantity` alongside the
   * mode's own multiplier, so every existing roll site that already respected `quantity`
   * respects this for free.
   */
  readonly dropCount: number;
  /**
   * Added to the item level a drop rolls at — §16's "potential item power".
   *
   * Small and hard-capped, because item level feeds `requiredLevel` (`ilvl` minus one
   * level of grace): every point here also raises the level at which the drop can be worn.
   * A generous version of this axis would hand a Challenger player gear they can't equip,
   * which is a worse reward than a smaller number. A rift tier already lifts item power
   * the honest way, by lifting effective depth; this exists so the *Challenger* dial —
   * which deliberately does not touch depth — isn't the one difficulty source that pays
   * nothing in power.
   */
  readonly itemPower: number;
  /**
   * Odds that a dropped item comes **infused** with the floor's own element — §16's
   * "special variants".
   *
   * The mechanism already existed and was simply never wired to a drop: `rollItem`'s
   * `favorElement` triples one element's odds in the affix roll, which is how a crafted
   * item's essence works. A biome already infuses an increasing fraction of its *monsters*
   * with its element as you descend; this is the same idea reaching the loot, so a deep
   * fire floor starts paying out fire gear and a themed build has somewhere to farm.
   *
   * It makes a *variant*, not a better item: same rarity, same affix count, same power.
   * What changes is which element the roll leans toward, which is exactly the thing a
   * build cares about and the thing the rarity ladder can't express.
   */
  readonly variantChance: number;
}

/** Caps, gathered so the ceilings are one thing to read and one thing to tune. */
export const REWARD_CAPS = {
  /** Named-item odds at most 2.5x. Unchanged from `namedDropChance`'s original cap. */
  dropChance: 2.5,
  /** At most 60% more things on the floor. Volume is the Avarice Rift's pitch, not this. */
  dropCount: 1.6,
  /** At most +3 item levels. See `RewardCurve.itemPower` for why this is small. */
  itemPower: 3,
  /** At most half of all drops infused. Half keeps it a variant rather than the norm. */
  variantChance: 0.5,
} as const;

/** How fast each axis climbs per doubling of danger. */
const PER_DOUBLING = {
  dropChance: 0.35,
  dropCount: 0.14,
  itemPower: 1,
  variantChance: 0.12,
} as const;

/** Doublings of danger above ordinary. Zero for every unmodified floor in the game. */
function doublings(danger: number): number {
  return Math.log2(Math.max(1, danger || 1));
}

/**
 * What this floor's difficulty is worth. At `danger` 1 — a plain Delve floor with the
 * Challenger dial off — every axis is exactly neutral (1, 1, 0, 0), which is what keeps
 * this from moving any existing balance baseline.
 */
export function rewardCurve(danger: number): RewardCurve {
  const n = doublings(danger);
  return {
    dropChance: Math.min(REWARD_CAPS.dropChance, 1 + n * PER_DOUBLING.dropChance),
    dropCount: Math.min(REWARD_CAPS.dropCount, 1 + n * PER_DOUBLING.dropCount),
    // Whole item levels only: a fractional ilvl is not a thing an item can have.
    itemPower: Math.min(REWARD_CAPS.itemPower, Math.floor(n * PER_DOUBLING.itemPower)),
    variantChance: Math.min(REWARD_CAPS.variantChance, n * PER_DOUBLING.variantChance),
  };
}
