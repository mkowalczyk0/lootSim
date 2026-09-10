/**
 * The Trophy Hall — docs/docket.md §3, "more gem sinks... i really want to prevent
 * pay to win." A room in the Citadel with display cases bought with gems, each holding
 * a snapshot of an item the account actually found.
 *
 * The point is the payoff `data/rarity.ts`'s own "keep it absurd, the long tail is the
 * hook" rule never had: `BASE_RARITY_WEIGHTS` puts unspoken at roughly 1 in 250,000 and
 * the only place that ever showed was a number in a stash cell. A case in a room you walk
 * past is somewhere that find can be *seen* — by you, and (once §4's leaderboards exist)
 * by anyone who visits.
 *
 * **A case is furniture, not a container.** Placing an item snapshots it — the same "two
 * lifetimes" move `forgeNamedItem` already makes for a named item's baked copy — so
 * salvaging, selling or re-equipping the original later never has to reach into a display
 * case and never has to ask a case for permission first. The trophy is a picture with the
 * item's stats printed under it, not a second stash slot; nothing here reads from a
 * displayed item at runtime, which is what keeps §16.4's "gems buy choice, never quantity"
 * (and the cosmetics rule it's an extension of) true by construction rather than by
 * discipline. `tools/trophies.ts` asserts a fully-cased character's sheet is byte-identical
 * to an uncased one, the same way `data/cosmetics.ts`'s powerlessness is asserted.
 *
 * Pure data. Nothing here imports from the simulation.
 */

/** How many display cases the Trophy Hall has room for. A number to revisit once the
 *  room itself has art — the case count is a floor-space decision, not a design one. */
export const MAX_TROPHY_CASES = 6;

/** Gems the first case costs, and how much each one after it costs more. Escalating like
 *  the rotating shop's own reroll cost (`data/shop.ts`) — the same "each purchase costs
 *  more than the last" shape, for the same reason: no run-away farm of one cheap sink. */
export const TROPHY_CASE_BASE_COST = 150;
export const TROPHY_CASE_COST_STEP = 125;

/** What the `index`-th case (0-based) costs to unlock. Pure arithmetic, so a save never
 *  has to store a price it paid — only how many it has bought. */
export function trophyCaseCost(index: number): number {
  return TROPHY_CASE_BASE_COST + TROPHY_CASE_COST_STEP * Math.max(0, index);
}

/** Every case's price in order, for a shop-style "here's the whole ladder" listing. */
export const TROPHY_CASE_COSTS: readonly number[] =
  Array.from({ length: MAX_TROPHY_CASES }, (_, i) => trophyCaseCost(i));
