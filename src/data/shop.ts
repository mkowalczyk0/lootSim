/**
 * The Rotating Shop — `docs/docket.md` item 2, design record `docs/rotating-shop.md`.
 *
 * Three tiers (daily, weekly, monthly) of curated, guaranteed items priced in coins —
 * mythics run into the millions — refreshed on the same idiom `data/daily.ts` and
 * `data/weekly.ts` already use: everything a period offers derives from one UTC integer,
 * so the shop is the same shop for everyone who looks at it that day/week/month, exactly
 * the reason the Vigil is the same floor for everyone.
 *
 * **Gems buy choice, never quantity.** A reroll (gems, escalating within a period) changes
 * *what* a slot offers. It can never change *how many* items an account may buy in that
 * period — `ShopState.purchases[period].length` is capped at `spec.purchaseCap`
 * independently of how many times any slot has been rerolled, checked before a purchase is
 * ever resolved. That cap is the entire thing standing between this feature and
 * pay-for-power once gems become a real-money currency, so it is structural rather than a
 * rule a call site has to remember to enforce — see `GameState.buyShopSlot`.
 *
 * **Mythic is the ceiling, structurally.** Rolling reuses `CRAFTABLE_RARITIES` — the exact
 * same list `craftItem` is capped to (`data/crafting.ts`) — not a second, independently
 * typed rarity range. Divine and unspoken are not weaker odds here; they are not
 * representable at all, the same guarantee the Forge already gives §16's mythic wall.
 */

import { Rng } from "../core/rng";
import { dayNumber, DAY_MS, daySeed } from "./daily";
import { weekNumber, weeklySeed } from "./weekly";
import { CRAFT_CATEGORIES, CRAFT_TYPES, type CraftCategory } from "./crafting";
import { rollItem, type Item } from "../game/item";
import type { Rarity } from "./rarity";

export type ShopTierId = "daily" | "weekly" | "monthly";
export const SHOP_TIER_IDS: readonly ShopTierId[] = ["daily", "weekly", "monthly"];

/**
 * Every rarity this shop can ever roll or price — a TYPE, not a runtime filter, so a
 * future tier's `weights` table that tried to include `"divine"` or `"unspoken"` would
 * fail to compile rather than fail a review. The same ceiling `CRAFT_MAX_RARITY`
 * ("mythic", `data/crafting.ts`) already draws for the Forge, restated as its own
 * exclusion here rather than imported, because `Exclude<Rarity, ...>` needs a literal
 * type and `CRAFT_MAX_RARITY` is a runtime value — see `docs/rotating-shop.md` for why
 * that one-line duplication was judged safer than deriving a type from a value just to
 * avoid it.
 */
export type ShopRarity = Exclude<Rarity, "divine" | "unspoken">;

/** Coin price by rarity — a guaranteed pick, not a chest gamble, so this sits well above
 *  what the equivalent rarity costs to gamble for at a chest tier (`data/chests.ts`'s
 *  Legendary chest is 10,000 coins for a *chance* at epic-and-up). Roughly 5x per rarity
 *  step, landing mythic solidly in the owner's own "millions" brief. */
export const SHOP_PRICE: Record<ShopRarity, number> = {
  common: 1_000,
  uncommon: 5_000,
  rare: 25_000,
  epic: 125_000,
  legendary: 600_000,
  mythic: 3_000_000,
};

export interface ShopTierSpec {
  readonly id: ShopTierId;
  readonly name: string;
  readonly blurb: string;
  readonly slots: number;
  /** Purchases allowed per account, per period — independent of reroll count. The
   *  structural anti-pay-to-win cap; see the file header. */
  readonly purchaseCap: number;
  /** Gems for the first reroll of a period; each further reroll (of any slot) in the
   *  same period costs one more multiple of this — see `shopRerollCost`. */
  readonly rerollBaseCost: number;
  /** See `ShopRarity` — divine and unspoken are structurally unreachable, not merely
   *  absent from this table. */
  readonly weights: Partial<Record<ShopRarity, number>>;
  readonly ilvl: number;
  readonly periodMs: number;
}

export const SHOP_TIERS: Record<ShopTierId, ShopTierSpec> = {
  daily: {
    id: "daily", name: "Daily Stock",
    blurb: "Turns over every UTC day. Cheap, plentiful, rarely more than a rare.",
    slots: 3, purchaseCap: 1, rerollBaseCost: 15,
    weights: { common: 40, uncommon: 35, rare: 18, epic: 6, legendary: 1 },
    ilvl: 15, periodMs: DAY_MS,
  },
  weekly: {
    id: "weekly", name: "Weekly Stock",
    blurb: "Turns over every UTC week. The epic-to-legendary range, with a long-shot mythic.",
    slots: 4, purchaseCap: 2, rerollBaseCost: 40,
    weights: { common: 5, uncommon: 20, rare: 35, epic: 28, legendary: 10, mythic: 2 },
    ilvl: 25, periodMs: DAY_MS * 7,
  },
  monthly: {
    id: "monthly", name: "Monthly Stock",
    blurb: "Turns over every UTC month. Legendary is the floor here; mythic is a real chance on every slot.",
    slots: 5, purchaseCap: 2, rerollBaseCost: 100,
    weights: { uncommon: 2, rare: 10, epic: 28, legendary: 40, mythic: 20 },
    ilvl: 35, periodMs: DAY_MS * 30,
  },
};

// --- the calendar ------------------------------------------------------------

/** Whole UTC months since the epoch — calendar months, not a fixed 30-day period, so
 *  "monthly" means what a player expects it to. A different mixing constant than
 *  `daySeed`/`weeklySeed`'s own, so a month number that happens to coincide with a day or
 *  week number never produces the same seed. */
export function monthNumber(now: number = Date.now()): number {
  const d = new Date(now);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
export function monthSeed(month: number): number {
  let z = (month + 0x27d4eb2f) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}
/** Milliseconds until the next UTC month boundary, for the countdown. */
export function msUntilMonthlyReset(now: number = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return next - now;
}

/** The period number a tier is currently on — the one integer its whole stock derives
 *  from, and the key `ShopState` books purchases/rerolls against. */
export function shopPeriod(tier: ShopTierId, now: number = Date.now()): number {
  if (tier === "daily") return dayNumber(now);
  if (tier === "weekly") return weekNumber(now);
  return monthNumber(now);
}
function shopPeriodSeed(tier: ShopTierId, period: number): number {
  if (tier === "daily") return daySeed(period);
  if (tier === "weekly") return weeklySeed(period);
  return monthSeed(period);
}
export function msUntilShopReset(tier: ShopTierId, now: number = Date.now()): number {
  if (tier === "daily") return (dayNumber(now) + 1) * DAY_MS - now;
  if (tier === "weekly") return (weekNumber(now) + 1) * DAY_MS * 7 - now;
  return msUntilMonthlyReset(now);
}

// --- the stock ------------------------------------------------------------

/** One listing. `key` is stable across reads of the same period+slot+rerollCount, so a
 *  purchase can be checked against exactly the item the player saw, not re-rolled under
 *  them between the read and the buy. */
export interface ShopListing {
  readonly item: Item;
  readonly price: number;
}

/**
 * The `slots` items a tier is currently offering. Pure — the only inputs are the tier's
 * own period seed and, per slot, how many times that slot has been individually rerolled
 * this period (`rerollCounts[slotIndex] ?? 0`), so the same period + the same reroll
 * history always reproduces the same stock. A slot with no reroll yet reads its plain
 * period-derived item, which is what makes it "the same shop for everyone" the instant a
 * period turns over and nobody has spent a single gem yet.
 */
export function shopStock(tier: ShopTierId, period: number, rerollCounts: readonly number[] = []): ShopListing[] {
  const spec = SHOP_TIERS[tier];
  const base = shopPeriodSeed(tier, period);
  const out: ShopListing[] = [];
  for (let slot = 0; slot < spec.slots; slot++) {
    const rerolls = rerollCounts[slot] ?? 0;
    // Slot index and reroll count both fold into the seed, so rerolling slot 2 never
    // moves what slot 0 or 1 show, and a fresh reroll never repeats the listing before it.
    let z = (base ^ Math.imul(slot + 1, 0x9e3779b1) ^ Math.imul(rerolls + 1, 0x2545f491)) >>> 0;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    const slotSeed = (z ^ (z >>> 16)) >>> 0;
    const rng = new Rng(slotSeed);

    const rarity = rng.weighted(spec.weights as Record<ShopRarity, number>);
    const category = CRAFT_CATEGORIES[slot % CRAFT_CATEGORIES.length]! as CraftCategory;
    const pool = CRAFT_TYPES[category];
    const type = rng.pick(pool);
    const item = rollItem({ rarity, type, ilvl: spec.ilvl, rng });
    out.push({ item, price: SHOP_PRICE[rarity] });
  }
  return out;
}

/** Gems for the *next* reroll of any slot in this tier's current period — linear in how
 *  many rerolls the period has already spent, uncapped (a period is short enough that this
 *  self-limits: nobody rerolls a daily slate to infinity before the day resets). */
export function shopRerollCost(tier: ShopTierId, rerollsThisPeriod: number): number {
  return SHOP_TIERS[tier].rerollBaseCost * (rerollsThisPeriod + 1);
}
