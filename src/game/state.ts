import { clamp } from "../core/math";
import { Rng } from "../core/rng";
import { MemorySaveStore, serializeSave, type SavedGame, type SaveStore } from "../core/save";
import { MAX_CHALLENGER_TIER } from "../data/challenger";
import { CHESTS, CHEST_TIERS, type ChestTier } from "../data/chests";
import {
  BASE_COSMETIC_WEIGHTS, CAPSULES, COSMETICS, COSMETICS_BY_ID,
  DUPE_REFUND, defaultAppearance, normalizeAppearance, normalizeOwned,
  type Appearance, type CapsuleTier, type Cosmetic, type CosmeticSlot,
} from "../data/cosmetics";
import {
  CRAFTABLE_RARITIES, CRAFT_TYPES, craftBulkCost, craftEssenceCost, reforgeCoinCost,
  type CraftCategory,
} from "../data/crafting";
import { EQUIP_SLOTS, type EquipSlot } from "../data/items";
import { CLASSES, CLASS_IDS, DEFAULT_CLASS, isClassId, type ClassId } from "../data/classes";
import type { Element } from "../data/elements";
import { ELEMENT_DAMAGE_KEY, ELEMENT_RESIST_KEY } from "../data/mods";
import { isWeaponType, slotForType } from "../data/items";
import { emptyMaterials, type MaterialBag } from "../data/materials";
import {
  NAMED_BY_ID, craftRecipeFor, isNamedId, rollNamedDrops, type NamedItemDef,
} from "../data/named";
import {
  ASCEND_COMPONENTS, forgeOpCost, itemMeetsRequirement, type ForgeOp, type ItemRequirement,
} from "../data/crafting";
import {
  ascend, ascendComponents, augment, awaken, eraseGrant, eraseTrigger, forgeOpBlocker, inscribe, recast,
  salvageYield, temper,
} from "./forge";
import { RUN_MODES, type RunConfig, type RunModeId } from "../data/modes";
import { PLANETS } from "../data/planets";
import { BASE_RARITY_WEIGHTS, RARITIES, type Rarity } from "../data/rarity";
import { normalizeSettings, type Settings } from "../data/settings";
import { MOD_KEYS, type ModKey } from "../data/mods";
import { universalPointsFor } from "../progression/universal";
import {
  forgeNamedItem, primeItemIds, randomItemType, reforgeAffixes, rollItem, type Item, type ItemMod, type Stats,
} from "./item";
import { Player, emptyEquipment } from "./player";

export interface RunStats {
  coinsEarned: number;
  coinsSpent: number;
  chestsOpened: Record<ChestTier, number>;
  raritiesFound: Record<Rarity, number>;
  itemsSold: number;
  enemiesKilled: number;
  deepestDepth: number;
  runsCompleted: number;
  deaths: number;
  /** Rifts finished, per mode. The number people actually brag about. */
  riftsCleared: Record<RunModeId, number>;
  /** Daily Vigils closed (UAT §17). */
  vigilsCleared: number;
  /** Weekly Convergences closed (UAT §17). */
  convergencesCleared: number;
  bossesKilled: number;
  /** Vanity bookkeeping. Nobody needs it; everybody looks at it. */
  gemsEarned: number;
  capsulesOpened: number;
  /** Copies of each named item ever forged for this account, by definition id (UAT §28). */
  namedFound: Record<string, number>;
  /** Items broken down at the Forge, and the Ash they returned (UAT §24/§27). */
  itemsSalvaged: number;
  ashEarned: number;
}

function freshStats(): RunStats {
  return {
    coinsEarned: 0,
    coinsSpent: 0,
    chestsOpened: Object.fromEntries(CHEST_TIERS.map((t) => [t, 0])) as Record<ChestTier, number>,
    raritiesFound: Object.fromEntries(RARITIES.map((r) => [r, 0])) as Record<Rarity, number>,
    itemsSold: 0,
    enemiesKilled: 0,
    deepestDepth: 0,
    runsCompleted: 0,
    deaths: 0,
    riftsCleared: Object.fromEntries(RUN_MODES.map((m) => [m, 0])) as Record<RunModeId, number>,
    vigilsCleared: 0,
    convergencesCleared: 0,
    bossesKilled: 0,
    gemsEarned: 0,
    capsulesOpened: 0,
    namedFound: {},
    itemsSalvaged: 0,
    ashEarned: 0,
  };
}

function freshTiers(): Record<RunModeId, number> {
  return Object.fromEntries(RUN_MODES.map((m) => [m, 1])) as Record<RunModeId, number>;
}

/** Highest tier open per planet — same shape as `freshTiers`, keyed by planet id instead
 *  of `RunModeId` since the roster is its own open-ended list, not a fixed union. */
function freshPlanetProgress(): Record<string, number> {
  return Object.fromEntries(PLANETS.map((p) => [p.id, 1]));
}

/** One capsule opening: what came out, and what it was worth if you already had it. */
export interface CapsulePull {
  readonly cosmetic: Cosmetic;
  readonly dupe: boolean;
  readonly refund: number;
}

/**
 * What a vendor pays, as a fraction of an item's worth. Town is not a business: selling
 * junk should top up a chest key, not replace diving as a way to make money.
 */
export const SELL_RATE = 0.4;

/** What the apothecary charges, and how many potions you're allowed to hoard. */
export const POTION_PRICE = 75;
export const POTION_CAP = 9;

/** Coins paid out for an item at the vendor's rate. */
export function sellPrice(item: Item): number {
  return Math.max(1, Math.round(item.value * SELL_RATE));
}

/** Everything that persists between dives. */
export class GameState {
  /**
   * One character sheet per class — level, XP, tree, equipped skills and gear are each
   * class's own. Picking a class you haven't played yet starts that character at level
   * 1 with an empty tree and empty hands, exactly like a brand new save; the class you
   * were just playing is left exactly as you last had it, waiting for when you switch
   * back. The stash, coins, materials and everything else below are account-wide and
   * shared by every class — only the character sheet itself is split out.
   */
  players: Record<ClassId, Player> = Object.fromEntries(
    CLASS_IDS.map((id) => [id, new Player(id)]),
  ) as Record<ClassId, Player>;
  /** Which class's sheet is live right now. */
  activeClassId: ClassId = DEFAULT_CLASS;
  coins = 250;
  keys: Record<ChestTier, number> = Object.fromEntries(
    CHEST_TIERS.map((t) => [t, 0]),
  ) as Record<ChestTier, number>;
  inventory: Item[] = [];
  stats = freshStats();
  /** Deepest floor unlocked for a direct dive; you always earn the next one by clearing. */
  maxUnlockedDepth = 1;
  /** Highest rift tier opened per mode. Clearing a rift opens the next one. */
  riftTiers: Record<RunModeId, number> = freshTiers();
  /** Highest tier opened per planet. Clearing a planet's first tier opens the next planet. */
  planetProgress: Record<string, number> = freshPlanetProgress();
  /** The Vigil (UAT §17): the UTC day number it was last closed on, 0 for never. The
   *  portal stays shut for the rest of that day — one key a day is the whole design. */
  daily: { clearedDay: number } = { clearedDay: 0 };
  /** The Convergence (UAT §17): the UTC week number it was last closed on, 0 for never.
   *  The portal stays shut for the rest of that week — one closing a week is the design,
   *  same as the Vigil's one a day. */
  weekly: { clearedWeek: number } = { clearedWeek: 0 };
  /** One per element, spent at the forge. Dropped and mined on planets, nowhere else. */
  materials: MaterialBag = emptyMaterials();
  /**
   * Ash — the Forge's one currency (UAT §27), returned only by salvaging items
   * (`salvageItem`) and spent only at the workbench (`applyForgeOp`). Account-wide like
   * coins and materials.
   */
  ash = 0;
  /**
   * The player's own difficulty dial — zero is plain. Set at a portal or the star map
   * terminal and applies to whatever's entered next: the delve, a rift, or a planet.
   */
  challengerTier = 0;
  /** Potions carried into a dive. Refilled by picking them up in the dungeon. */
  potions = 3;
  /**
   * The vanity currency. Drops in the dungeon, banks like coins, and buys nothing but
   * cosmetic capsules — gems and coins deliberately never convert into each other.
   */
  gems = 0;
  /** Cosmetic ids pulled from capsules. Owning one is permanent. */
  cosmetics: string[] = [];
  /** What the character looks like. Read by the renderer and the wardrobe, nothing else. */
  appearance: Appearance = defaultAppearance();
  /**
   * False until the player has actually picked a class. Town opens on the Path tab
   * and won't let a dive start until they do — a class is the first real decision in
   * the game and it shouldn't be made for you by a default.
   */
  classChosen = false;
  /**
   * Tree points handed back by the v14 class-refactor migration, summed across every
   * class that had an old allocation. Non-zero exactly once, right after loading a
   * pre-v14 save; the town shows a notice and something clears it.
   */
  treePointsRefunded = 0;
  /**
   * Set the moment a class's Proving is banked, cleared by the town once it has said so
   * (UAT §13). Transient and deliberately not persisted — exactly like
   * `treePointsRefunded`, it exists to make the next trip back to the ship announce
   * something. The permanent record is `Player.legendComplete`.
   */
  legendJustCompleted: ClassId | null = null;
  /**
   * Cosmetic and control options. Never allowed to touch the simulation — see
   * `data/settings.ts`. Built through `normalizeSettings` rather than a plain spread of
   * `DEFAULT_SETTINGS` so a fresh character gets its own `keybinds` object instead of
   * sharing — and being able to mutate — the shared default.
   */
  settings: Settings = normalizeSettings(undefined);
  private readonly rng: Rng;
  /**
   * Set by `wipe`. A wiped state must never write itself back: the page is about to
   * reload into a fresh character, and the `beforeunload` save would otherwise put
   * the erased progress straight back into storage.
   */
  private wiped = false;

  /** The seed is only ever passed by tests, so a run of chest pulls is reproducible. */
  constructor(seed?: number) {
    this.rng = new Rng(seed);
  }

  static INVENTORY_CAP = 200;

  /** The character sheet actually in play. Every other method reads through this one
   *  getter, so nothing downstream needs to know classes have separate sheets at all. */
  get player(): Player {
    return this.players[this.activeClassId];
  }

  /**
   * The universal tree's point pool — UAT §18. **Account-wide**, unlike the class tree's,
   * and derived from the lifetime record depth across every character rather than from
   * any one character's level.
   *
   * That is the whole reason the tree feels different from a second class tree: the class
   * tree is what *this* character earned, and this is what the *account* earned. A brand
   * new alt starts with the full pool already spendable, which is the payoff — the
   * account's progress is inherited, while how to spend it stays a per-class decision
   * (`Player.universalAllocated`).
   */
  get universalPool(): number {
    return universalPointsFor(this.stats.deepestDepth);
  }

  /** What's left to spend on the active character's universal tree. */
  get universalPoints(): number {
    return this.universalPool - this.player.universalSpent;
  }

  addCoins(n: number): void {
    this.coins += n;
    this.stats.coinsEarned += n;
  }

  spendCoins(n: number): boolean {
    if (this.coins < n) return false;
    this.coins -= n;
    this.stats.coinsSpent += n;
    return true;
  }

  /** Potions are the other thing coins are for. Capped, so you can't buy immortality. */
  buyPotion(count = 1): boolean {
    const room = POTION_CAP - this.potions;
    const n = Math.min(count, room);
    if (n <= 0) return false;
    if (!this.spendCoins(POTION_PRICE * n)) return false;
    this.potions += n;
    return true;
  }

  addGems(n: number): void {
    this.gems += n;
    this.stats.gemsEarned += n;
  }

  addMaterials(element: Element, n: number): void {
    this.materials[element] += n;
  }

  setChallengerTier(tier: number): void {
    this.challengerTier = clamp(Math.round(tier), 0, MAX_CHALLENGER_TIER);
  }

  /** One button, one direction — wraps back to plain once it passes the top. */
  cycleChallengerTier(): void {
    this.challengerTier = (this.challengerTier + 1) % (MAX_CHALLENGER_TIER + 1);
  }

  /** True once the wardrobe has anything in it, so town can stop advertising an empty tab. */
  get ownsAnyCosmetic(): boolean {
    return this.cosmetics.length > 0;
  }

  owns(id: string): boolean {
    return this.cosmetics.includes(id);
  }

  /** Everything owned for one slot, in wardrobe order. */
  ownedInSlot(slot: CosmeticSlot): Cosmetic[] {
    return COSMETICS.filter((c) => c.slot === slot && this.cosmetics.includes(c.id));
  }

  /**
   * Wears a cosmetic, or takes the slot off with null. Refuses anything unowned so a
   * stale save can never dress you in something you never pulled.
   */
  wear(slot: CosmeticSlot, id: string | null): boolean {
    if (id !== null) {
      const c = COSMETICS_BY_ID[id];
      if (!c || c.slot !== slot || !this.owns(id)) return false;
    }
    this.appearance = { ...this.appearance, [slot]: id };
    return true;
  }

  /**
   * Opens `count` capsules of `tier`. A duplicate is refunded in gems rather than
   * silently vanishing — a run of dupes should still walk you toward the next pull.
   */
  openCapsules(tier: CapsuleTier, count = 1): CapsulePull[] {
    const info = CAPSULES[tier];
    const affordable = Math.min(count, Math.floor(this.gems / info.price));
    if (affordable <= 0) return [];
    this.gems -= info.price * affordable;
    this.stats.capsulesOpened += affordable;

    // Only rarities this capsule can roll *and* that something actually exists at.
    const weights = {} as Record<Rarity, number>;
    for (const r of RARITIES) {
      const any = COSMETICS.some((c) => c.rarity === r);
      weights[r] = any ? BASE_COSMETIC_WEIGHTS[r] * info.weights[r] : 0;
    }

    const pulls: CapsulePull[] = [];
    for (let i = 0; i < affordable; i++) {
      const rarity = this.rng.weighted(weights);
      const pool = COSMETICS.filter((c) => c.rarity === rarity);
      const cosmetic = this.rng.pick(pool);
      const dupe = this.owns(cosmetic.id);
      if (dupe) {
        const refund = DUPE_REFUND[cosmetic.rarity];
        this.gems += refund;
        pulls.push({ cosmetic, dupe: true, refund });
      } else {
        this.cosmetics.push(cosmetic.id);
        pulls.push({ cosmetic, dupe: false, refund: 0 });
      }
    }
    return pulls;
  }

  /**
   * The forge: the deterministic half of getting an item. A chest gambles on
   * everything at once; this spends materials for a chosen category at a chosen
   * rarity, optionally biased toward a chosen essence, up to mythic — divine and
   * unspoken stay chest-only, on purpose, so the long tail never becomes a shopping list.
   */
  craftItem(category: CraftCategory, rarity: Rarity, essence: Element | null): Item | null {
    if (!(CRAFTABLE_RARITIES as readonly Rarity[]).includes(rarity)) return null;
    const usedEssence = essence && essence !== "physical" ? essence : null;
    const bulk = craftBulkCost(rarity);
    const essenceCost = usedEssence ? craftEssenceCost(rarity) : 0;
    if (this.materials.physical < bulk) return null;
    if (usedEssence && this.materials[usedEssence] < essenceCost) return null;

    this.materials.physical -= bulk;
    if (usedEssence) this.materials[usedEssence] -= essenceCost;

    const pool = CRAFT_TYPES[category];
    const affinity = this.player.heroClass.affinity;
    const type = category === "weapon" && affinity.length > 0 && this.rng.chance(0.6)
      ? this.rng.pick(affinity)
      : this.rng.pick(pool);
    const ilvl = Math.max(1, this.player.deepestDepth);
    const item = rollItem({ rarity, type, ilvl, rng: this.rng, favorElement: usedEssence ?? undefined });
    this.stats.raritiesFound[rarity]++;
    this.addToInventory([item]);
    return item;
  }

  /**
   * Forges one copy of a named item and books it in the records. The one place a copy is
   * ever minted on this machine outside a dungeon, so `namedFound` stays honest.
   */
  forgeNamed(def: NamedItemDef, ilvl: number): Item {
    const item = forgeNamedItem(def, ilvl, this.rng);
    this.noteNamed(def.id);
    this.stats.raritiesFound[item.rarity]++;
    return item;
  }

  /** Records that a copy of `id` was minted. The dungeon calls this for the local hero's drops. */
  noteNamed(id: string): void {
    this.stats.namedFound[id] = (this.stats.namedFound[id] ?? 0) + 1;
  }

  /**
   * Named crafting (UAT §25): a definition with a `craft` source is forged on demand for
   * exactly the recipe it names. Unlike `craftItem` there is no rarity cap — the recipe
   * *is* the gate, and a mythic that costs eighty Gilt Reliquaries is not a shopping list.
   * Returns null when the id isn't craftable or the bill can't be paid; nothing is spent.
   */
  craftNamed(id: string): Item | null {
    const def = NAMED_BY_ID[id];
    const recipe = def ? craftRecipeFor(def) : null;
    if (!def || !recipe) return null;
    if (!this.canAffordNamed(id)) return null;
    const components = this.recipeComponents(recipe.items ?? []);
    if (!components) return null;
    for (const [e, n] of Object.entries(recipe.materials) as [Element, number][]) {
      if (n) this.materials[e] -= n;
    }
    if (recipe.coins > 0) this.spendCoins(recipe.coins);
    // The components go in whole (UAT §24): out of the stash, into the item.
    const eaten = new Set(components.flat().map((it) => it.id));
    this.inventory = this.inventory.filter((it) => !eaten.has(it.id));
    const item = this.forgeNamed(def, Math.max(1, this.player.deepestDepth));
    this.addToInventory([item]);
    return item;
  }

  /** True when every material, coin and stash component a named recipe asks for is in hand. */
  canAffordNamed(id: string): boolean {
    const def = NAMED_BY_ID[id];
    const recipe = def ? craftRecipeFor(def) : null;
    if (!recipe) return false;
    for (const [e, n] of Object.entries(recipe.materials) as [Element, number][]) {
      if (n && this.materials[e] < n) return false;
    }
    if (this.coins < recipe.coins) return false;
    return this.recipeComponents(recipe.items ?? []) !== null;
  }

  /**
   * Which stash items would pay a recipe's item lines — one list per line, cheapest
   * matching items first, an item never counted twice — or null when a line can't be
   * filled. Stash only: what you're wearing is never eaten by a recipe. The bench shows
   * exactly this list before anything is spent.
   */
  recipeComponents(reqs: readonly ItemRequirement[]): Item[][] | null {
    const taken = new Set<string>();
    const out: Item[][] = [];
    for (const req of reqs) {
      const picks = this.inventory
        .filter((it) => !taken.has(it.id) && itemMeetsRequirement(req, it))
        .sort((a, b) => a.value - b.value)
        .slice(0, req.count);
      if (picks.length < req.count) return null;
      for (const it of picks) taken.add(it.id);
      out.push(picks);
    }
    return out;
  }

  // --- the workbench (UAT §24 / §26 / §27) -------------------------------------------

  /**
   * Breaks an item down for Ash and a pinch of the materials it carried (`salvageYield`).
   * Stash or worn — salvaging what you're wearing is allowed, on purpose: the choice
   * "sell it, salvage it, or keep it" is the whole point of Ash having exactly one source.
   */
  salvageItem(itemId: string): { ash: number; materials: Partial<MaterialBag> } | null {
    const located = this.locateItem(itemId);
    if (!located) return null;
    const yieldOf = salvageYield(located.item);
    located.remove();
    this.ash += yieldOf.ash;
    this.stats.ashEarned += yieldOf.ash;
    this.stats.itemsSalvaged++;
    for (const [e, n] of Object.entries(yieldOf.materials) as [Element, number][]) {
      if (n) this.materials[e] += n;
    }
    this.player.refresh();
    return yieldOf;
  }

  /**
   * Everything an op would cost on this item right now, and why it can't run if it can't.
   * The bench renders this; `applyForgeOp` re-checks it, so the two can never disagree.
   */
  forgeQuote(itemId: string, op: ForgeOp, affix?: number): {
    item: Item; ash: number; coins: number; scrap: number; components: Item[]; blocker: string | null;
  } | null {
    const located = this.locateItem(itemId);
    if (!located) return null;
    const item = located.item;
    const cost = forgeOpCost(op, item.rarity);
    const components = op === "ascend" ? ascendComponents(item, this.inventory) : [];
    let blocker = forgeOpBlocker(op, item, affix);
    if (!blocker && op === "ascend" && components.length < ASCEND_COMPONENTS) {
      blocker = `Ascending needs ${ASCEND_COMPONENTS} other ${item.rarity} items in the stash to melt down.`;
    }
    if (!blocker) {
      if (this.ash < cost.ash) blocker = `Needs ${cost.ash} Ash — salvage something.`;
      else if (this.coins < cost.coins) blocker = `Needs ${cost.coins} coins.`;
      else if (this.materials.physical < cost.scrap) blocker = `Needs ${cost.scrap} Iron Scrap.`;
    }
    return { item, ...cost, components, blocker };
  }

  /**
   * Runs one workbench op on an item, stashed or worn, paying for it first. `reforge` and
   * `salvage` have their own methods (`reforgeItem`, `salvageItem`) and are routed there
   * so the old paths and their tests stay exactly as they were. Returns the new item, or
   * null when the quote had a blocker; nothing is spent on a refusal.
   */
  applyForgeOp(itemId: string, op: ForgeOp, affix?: number): Item | null {
    if (op === "reforge") return this.reforgeItem(itemId);
    // Salvage destroys the item, so there is nothing to hand back; the bench calls
    // `salvageItem` directly for the yield.
    if (op === "salvage") { this.salvageItem(itemId); return null; }
    const quote = this.forgeQuote(itemId, op, affix);
    if (!quote || quote.blocker) return null;
    const located = this.locateItem(itemId);
    if (!located) return null;
    const before = located.item;

    let after: Item;
    switch (op) {
      case "temper": after = temper(before, affix!, this.rng); break;
      case "recast": after = recast(before, affix!, this.rng); break;
      case "augment": after = augment(before, this.rng); break;
      case "inscribe":
      case "rescribe": after = inscribe(before, this.rng); break;
      case "eraseGrant": after = eraseGrant(before); break;
      case "awaken": after = awaken(before, this.rng); break;
      case "eraseTrigger": after = eraseTrigger(before); break;
      case "ascend": after = ascend(before, this.rng); break;
    }
    if (after === before) return null;

    this.ash -= quote.ash;
    if (quote.coins > 0) this.spendCoins(quote.coins);
    this.materials.physical -= quote.scrap;
    if (op === "ascend") {
      const eaten = new Set(quote.components.map((it) => it.id));
      this.inventory = this.inventory.filter((it) => !eaten.has(it.id));
      this.stats.raritiesFound[after.rarity]++;
    }
    located.replace(after);
    this.player.refresh();
    return after;
  }

  /**
   * Reforges an item in place — same rarity, type and base stats, a freshly rolled set
   * of affixes (`game/item.ts#reforgeAffixes`). Works on a stashed item or one the active
   * character has equipped, since a reforge is something you do to gear you're using, not
   * just to stash junk. Unlike `craftItem`, every rarity is eligible — reforging can only
   * reroll affixes on something you already found, never manufacture a divine or
   * unspoken from nothing, so `CRAFT_MAX_RARITY` doesn't apply here.
   */
  reforgeItem(itemId: string): Item | null {
    const located = this.locateItem(itemId);
    if (!located) return null;
    const coinCost = reforgeCoinCost(located.item.rarity);
    const materialCost = craftBulkCost(located.item.rarity);
    if (this.materials.physical < materialCost) return null;
    if (!this.spendCoins(coinCost)) return null;
    this.materials.physical -= materialCost;
    const reforged = reforgeAffixes(located.item, this.rng);
    located.replace(reforged);
    this.player.refresh();
    return reforged;
  }

  /** Finds an item by id wherever the active character keeps it, stashed or worn. */
  private locateItem(itemId: string): { item: Item; replace: (next: Item) => void; remove: () => void } | null {
    const invIdx = this.inventory.findIndex((it) => it.id === itemId);
    if (invIdx >= 0) {
      const item = this.inventory[invIdx]!;
      return {
        item,
        replace: (next) => { this.inventory[invIdx] = next; },
        remove: () => { this.inventory = this.inventory.filter((it) => it.id !== item.id); },
      };
    }
    const equipment = this.player.equipment;
    for (const slot of EQUIP_SLOTS) {
      const worn = equipment[slot];
      if (worn?.id === itemId) {
        return {
          item: worn,
          replace: (next) => { equipment[slot] = next; },
          remove: () => { equipment[slot] = null; },
        };
      }
    }
    return null;
  }

  buyKey(tier: ChestTier, count = 1): boolean {
    const cost = CHESTS[tier].price * count;
    if (!this.spendCoins(cost)) return false;
    this.keys[tier] += count;
    return true;
  }

  /**
   * Opens `count` chests of `tier`, returning what dropped. Rarity weights are the
   * chest's multipliers applied to the base odds; item level tracks the *active
   * character's* deepest run (not the account-wide record) so a chest always rolls
   * gear the class opening it can actually catch up to and equip.
   */
  openChests(tier: ChestTier, count = 1): Item[] {
    const available = Math.min(count, this.keys[tier]);
    if (available <= 0) return [];
    this.keys[tier] -= available;

    const info = CHESTS[tier];
    const weights = {} as Record<Rarity, number>;
    for (const r of RARITIES) weights[r] = BASE_RARITY_WEIGHTS[r] * info.weights[r];

    const ilvl = Math.max(1, this.player.deepestDepth);
    const affinity = this.player.heroClass.affinity;
    const found: Item[] = [];
    for (let i = 0; i < available; i++) {
      const rarity = this.rng.weighted(weights);
      const type = info.types && info.types.length > 0
        ? this.rng.pick(info.types)
        : randomItemType(this.rng, affinity, info.classAdaptive);
      const item = rollItem({ rarity, type, ilvl, rng: this.rng, favorElement: info.favorElement });
      found.push(item);
      this.stats.raritiesFound[rarity]++;
      // Named items (UAT §28) ride alongside the ordinary pull rather than replacing it, so
      // a chest never pays out *less* for having a table. `data/named.ts` owns the odds.
      for (const def of rollNamedDrops({ kind: "chest", tier }, this.rng)) found.push(this.forgeNamed(def, ilvl));
    }
    this.stats.chestsOpened[tier] += available;
    this.addToInventory(found);
    return found;
  }

  /** Adds items, dropping the lowest-value overflow if the stash is full. */
  addToInventory(items: readonly Item[]): void {
    // A loop rather than push(...items): spreading a large batch exceeds the
    // argument limit and throws, which a 10x open on a full stash can reach.
    for (const it of items) this.inventory.push(it);
    if (this.inventory.length > GameState.INVENTORY_CAP) {
      this.inventory.sort((a, b) => b.value - a.value);
      const dumped = this.inventory.splice(GameState.INVENTORY_CAP);
      // Auto-sell the overflow rather than silently vanishing it.
      for (const it of dumped) this.addCoins(sellPrice(it));
      this.stats.itemsSold += dumped.length;
    }
  }

  /**
   * Switches which class's character sheet is live. Nothing about the class you're
   * leaving changes — its level, tree, skills and gear are exactly where you left them
   * for whenever you come back to it.
   */
  chooseClass(id: ClassId): void {
    this.activeClassId = id;
    this.classChosen = true;
    this.player.fullHeal();
  }

  /** The class the player is currently playing, for anything that needs its data. */
  get heroClass() {
    return CLASSES[this.player.classId];
  }

  sell(ids: readonly string[]): number {
    const idSet = new Set(ids);
    let total = 0;
    this.inventory = this.inventory.filter((it) => {
      if (!idSet.has(it.id)) return true;
      total += sellPrice(it);
      return false;
    });
    if (total > 0) {
      this.addCoins(total);
      this.stats.itemsSold += idSet.size;
    }
    return total;
  }

  /** False either for a missing item or one this character isn't level enough to wear. */
  equipFromInventory(id: string): boolean {
    const idx = this.inventory.findIndex((it) => it.id === id);
    if (idx < 0) return false;
    const item = this.inventory[idx]!;
    if (!this.player.canEquip(item)) return false;
    this.inventory.splice(idx, 1);
    const displaced = this.player.equip(item);
    if (displaced) this.inventory.push(displaced);
    return true;
  }

  unequipToInventory(slot: EquipSlot): boolean {
    const item = this.player.unequip(slot);
    if (!item) return false;
    this.inventory.push(item);
    return true;
  }

  /**
   * Called when a floor's loot is banked. A delve floor unlocks the next depth; a rift
   * floor unlocks nothing until the boss at the bottom of it is dead, which is what
   * stops the tier ladder from being climbed by extracting on floor one.
   */
  recordDepth(depth: number, config?: RunConfig): void {
    if (depth > this.stats.deepestDepth) this.stats.deepestDepth = depth;
    if (depth > this.player.deepestDepth) this.player.deepestDepth = depth;
    // The Vigil is closed for the day. Only a credited bank gets here, so a death or a
    // bail-out leaves it open to try again.
    if (config?.daily) {
      this.daily.clearedDay = config.daily.day;
      this.stats.vigilsCleared++;
      return;
    }
    // The Convergence is closed for the week. Its four floors each call this (every
    // completion portal banks), so only the boss floor — `lastFloor` — actually closes
    // it; the first three just fall through to the depth-record update above.
    if (config?.weekly) {
      if (!config.lastFloor) return;
      this.weekly.clearedWeek = config.weekly.week;
      this.stats.convergencesCleared++;
      return;
    }
    // A planet is rift-shaped (`mode.isRift` is true for it too) but each one keeps its
    // own tier ladder, so it's tracked by planet id rather than the shared rift Records.
    if (config?.planet) {
      if (!config.lastFloor) return;
      const id = config.planet.spec.id;
      const next = config.planet.tier + 1;
      if (next > (this.planetProgress[id] ?? 1)) this.planetProgress[id] = next;
      return;
    }
    if (!config || !config.mode.isRift) {
      if (depth + 1 > this.maxUnlockedDepth) this.maxUnlockedDepth = depth + 1;
      return;
    }
    if (!config.lastFloor) return;
    this.stats.riftsCleared[config.mode.id]++;
    const next = config.tier + 1;
    if (next > this.riftTiers[config.mode.id]) this.riftTiers[config.mode.id] = next;
  }

  /**
   * The Legend is Complete (UAT §13) — called once, by `Dungeon`, when a class's Proving
   * at the bottom of the Delve is *banked*. Returns whether this was the first time, so
   * the caller can be loud about it exactly once.
   *
   * Idempotent on purpose. The Proving stays fightable forever, and re-clearing it must
   * neither un-complete a class nor re-announce it. `Dungeon` decides *whether* a floor
   * was the Proving (`legends.provingFloor`, evaluated once at floor construction); this
   * only records the answer.
   */
  completeLegend(classId: ClassId): boolean {
    const player = this.players[classId];
    if (player.legendComplete) return false;
    player.legendComplete = true;
    this.legendJustCompleted = classId;
    return true;
  }

  /** How many classes wear the gold border. Records reads this; nothing else does. */
  get legendsComplete(): number {
    return CLASS_IDS.filter((id) => this.players[id].legendComplete).length;
  }

  // --- persistence -------------------------------------------------------

  toJSON(): object {
    return {
      coins: this.coins,
      keys: this.keys,
      potions: this.potions,
      gems: this.gems,
      cosmetics: this.cosmetics,
      appearance: this.appearance,
      maxUnlockedDepth: this.maxUnlockedDepth,
      riftTiers: this.riftTiers,
      planetProgress: this.planetProgress,
      daily: this.daily,
      weekly: this.weekly,
      materials: this.materials,
      ash: this.ash,
      challengerTier: this.challengerTier,
      stats: this.stats,
      inventory: this.inventory,
      players: Object.fromEntries(
        CLASS_IDS.map((id) => [id, playerToJSON(this.players[id])]),
      ),
      activeClassId: this.activeClassId,
      classChosen: this.classChosen,
      settings: this.settings,
    };
  }

  /**
   * Where saves go. `main.ts` installs the server-backed store once the player is logged
   * in (`docs/accounts.md`); until then — and in every test and tool — the default just
   * remembers the last blob.
   */
  static saveStore: SaveStore = new MemorySaveStore();

  save(): void {
    if (this.wiped) return;
    GameState.saveStore.write(serializeSave(this.toJSON()));
  }

  /**
   * Erases the save. The live state is left alone because the caller is expected to
   * reload immediately — rebuilding a whole GameState in place would leave the town,
   * the renderer and the loop holding the old one.
   */
  wipe(): Promise<void> {
    this.wiped = true;
    return GameState.saveStore.clear();
  }

  /** A fresh state, or one rebuilt from a parsed save (`parseSaved` in `core/save.ts`). */
  static fromSaved(saved: SavedGame | null): GameState {
    const state = new GameState();
    if (!saved) return state;

    try {
      const d = saved.data;
      state.coins = Number(d.coins ?? state.coins);
      state.potions = Number(d.potions ?? state.potions);
      // Saves from before the wardrobe existed have none of these; the normalizers
      // hand back a fresh look and an empty collection rather than throwing.
      state.gems = Number(d.gems ?? 0);
      // Version 19 added Ash; an older save has simply never salvaged anything.
      state.ash = Math.max(0, Math.floor(Number(d.ash ?? 0)) || 0);
      state.cosmetics = normalizeOwned(d.cosmetics);
      state.appearance = normalizeAppearance(d.appearance);
      state.maxUnlockedDepth = Number(d.maxUnlockedDepth ?? 1);
      state.keys = { ...state.keys, ...(d.keys as Record<ChestTier, number>) };
      state.stats = { ...freshStats(), ...(d.stats as RunStats) };
      // Saves from before rifts existed have neither of these.
      state.stats.riftsCleared = { ...freshStats().riftsCleared, ...state.stats.riftsCleared };
      state.riftTiers = { ...freshTiers(), ...(d.riftTiers as Record<RunModeId, number> | undefined) };
      // Saves from before planets and the forge existed have none of these; a fresh
      // ladder and an empty materials bag is exactly what a brand new save gets too.
      state.planetProgress = { ...freshPlanetProgress(), ...(d.planetProgress as Record<string, number> | undefined) };
      state.materials = { ...emptyMaterials(), ...(d.materials as Partial<MaterialBag> | undefined) };
      // Version 16 added the daily Vigil; an older save has simply never closed one.
      const daily = d.daily as { clearedDay?: unknown } | undefined;
      state.daily = { clearedDay: Math.max(0, Math.floor(Number(daily?.clearedDay ?? 0)) || 0) };
      // Version 20 added the weekly Convergence; an older save has simply never closed one.
      const weekly = d.weekly as { clearedWeek?: unknown } | undefined;
      state.weekly = { clearedWeek: Math.max(0, Math.floor(Number(weekly?.clearedWeek ?? 0)) || 0) };
      state.setChallengerTier(Number(d.challengerTier ?? 0));
      state.inventory = ((d.inventory as Item[]) ?? []).map(normalizeItem);

      state.classChosen = d.classChosen === true;
      state.settings = normalizeSettings(d.settings);

      // Version 14 replaced the whole skill / ultimate / tree layer with the 21-class
      // progression system. A pre-v14 save's `allocated` holds v1 branch-node ids that
      // mean nothing in the v2 behaviour tree, and its `skills` hold v1 `SkillId`s —
      // both are dropped and rebuilt from the new class's own kit. Level, XP, gear,
      // deepest depth and everything account-wide survive untouched. `pruneAllocationV2`
      // in `applyPlayerJSON` already drops the dead node ids; this tallies the refund so
      // the town can tell the player once.
      const preProgression = saved.version < 14;

      // The universal pool is derived from the account record, which is already loaded
      // above — so every class's universal allocation can be validated against the pool
      // it was actually spent from.
      const universalPool = universalPointsFor(state.stats.deepestDepth);

      const playersRaw = d.players as Record<string, unknown> | undefined;
      if (playersRaw) {
        for (const id of CLASS_IDS) {
          state.treePointsRefunded += applyPlayerJSON(
            state.players[id], playersRaw[id] as Record<string, unknown> | undefined, preProgression,
            universalPool,
          );
        }
        state.activeClassId = isClassId(d.activeClassId) ? d.activeClassId : state.activeClassId;
      } else {
        // Pre-v10 save: one shared character. Fold it into whichever class it was
        // playing; every other class starts fresh, exactly like a brand new one does.
        const p = d.player as Record<string, unknown> | undefined;
        if (p) {
          const legacyClass: ClassId = isClassId(p.classId) ? p.classId : DEFAULT_CLASS;
          state.treePointsRefunded += applyPlayerJSON(
            state.players[legacyClass], p, preProgression, universalPool,
          );
          state.activeClassId = legacyClass;
        }
      }

      const allEquipped = CLASS_IDS.flatMap(
        (id) => Object.values(state.players[id].equipment).filter(Boolean) as Item[],
      );
      primeItemIds([...state.inventory, ...allEquipped]);
    } catch {
      // A save from a broken build shouldn't brick the game — fall back to a new one.
      return new GameState();
    }
    return state;
  }
}

/**
 * One class's character sheet, as it's actually persisted — and, unchanged, as it
 * crosses the network to a co-op host, which rebuilds a real `Player` from it with
 * `playerFromJSON`. A remote player's damage is then computed by exactly the same code
 * as everyone else's, because it is the same object.
 */
export function playerToJSON(p: Player) {
  return {
    level: p.level,
    xp: p.xp,
    deepestDepth: p.deepestDepth,
    health: p.health,
    mana: p.mana,
    skills: p.skills,
    allocated: p.allocated,
    // The universal tree (UAT §18) travels with the sheet for the same reason the class
    // allocation does: the host rebuilds a remote hero from exactly this blob, and a
    // universal node left behind here would mean the host computing that player's damage
    // from a weaker character than the one sitting on their own screen.
    universalAllocated: p.universalAllocated,
    // Class completion (UAT §13). It has to be here because this function *is* how a
    // character sheet persists — and since the same blob is the co-op wire payload, an
    // ally's completed Legend reaches the host too. Nothing on either side reads it in
    // v1: the Proving is solo, and the flag grants nothing a simulation could act on.
    legendComplete: p.legendComplete,
    equipment: p.equipment,
  };
}

/**
 * Builds a character sheet from somebody else's `playerToJSON` blob.
 *
 * The universal pool is `Infinity` here, deliberately: a remote player's pool is derived
 * from *their* account record, which this machine has no way to know, and trimming their
 * tree against the local pool would nerf anyone whose account is further along than the
 * host's. Their allocation is still pruned for structure. This trusts the sheet exactly
 * as much as the existing model already trusts its `level`, `allocated` and `equipment`
 * — it is not a new hole, but it is the same one.
 */
export function playerFromJSON(classId: ClassId, raw: Record<string, unknown> | undefined): Player {
  const player = new Player(classId);
  applyPlayerJSON(player, raw, false, Infinity);
  return player;
}

/**
 * Applies one saved character sheet onto a fresh `Player` of the matching class. Used
 * once per class on a current save, and once for whichever class a pre-v10 save's
 * single shared character belonged to. `preProgression` is true for a save older than
 * v14, whose tree allocation and equipped skills predate the class refactor and are
 * dropped rather than migrated; the return value is how many tree points that class got
 * handed back, for a one-time town notice.
 */
function applyPlayerJSON(
  p: Player,
  raw: Record<string, unknown> | undefined,
  preProgression: boolean,
  universalPool: number,
): number {
  if (!raw) return 0;
  p.level = Number(raw.level ?? 1);
  // Saves from before per-character progress existed (or a class that predates this
  // field) have no `deepestDepth` of their own — estimate one from level rather than
  // falling back to the account-wide record, which is exactly the bug this fixed: a
  // fresh alt would otherwise inherit the main's depth and get gear it can't wear.
  p.deepestDepth = Number(raw.deepestDepth ?? Math.max(0, p.level - 1));
  const hadAllocation = Array.isArray(raw.allocated) && (raw.allocated as unknown[]).length > 0;
  p.allocated = preProgression || !Array.isArray(raw.allocated)
    ? []
    : (raw.allocated as unknown[]).filter((id): id is string => typeof id === "string");
  // A save from before v15 has no universal tree; an empty allocation is exactly what a
  // brand new character gets, so there is nothing to migrate and nothing to refund.
  p.universalAllocated = Array.isArray(raw.universalAllocated)
    ? (raw.universalAllocated as unknown[]).filter((id): id is string => typeof id === "string")
    : [];
  // A save from before v17 has no Proving, so no class can have completed one.
  p.legendComplete = raw.legendComplete === true;
  p.xp = Number(raw.xp ?? 0);
  const equipment = { ...emptyEquipment(), ...(raw.equipment as object) };
  for (const slot of Object.keys(equipment) as EquipSlot[]) {
    const item = equipment[slot];
    if (item) equipment[slot] = normalizeItem(item);
  }
  p.equipment = equipment;
  p.refresh();
  p.normalizeTree();
  p.normalizeUniversalTree(universalPool);
  p.health = Number(raw.health ?? p.maxHealth);
  p.mana = Number(raw.mana ?? p.maxMana);
  p.skills = preProgression ? [null, null, null] : readSkills(raw.skills);
  p.autoSlotNewAbilities();
  return preProgression && hadAllocation ? p.treePoints : 0;
}

/**
 * Brings an item from an older save up to the current shape. Saves from before the
 * class overhaul hold a single `affix` and a single `essence` and call every melee
 * weapon "weapon"; both are translated into the modifier list rather than thrown away,
 * because somebody's unspoken sword is not something to casually delete.
 */
function normalizeItem(raw: Item): Item {
  const legacy = raw as unknown as {
    affix?: { stat?: string; label?: string } | null;
    essence?: { element?: string; kind?: string; value?: number } | null;
  };

  const stats = {
    attack: 0, defense: 0, maxHealth: 0, power: 0, haste: 0, maxMana: 0,
    ...(raw.stats as Partial<Stats>),
  };

  // "weapon" used to mean any melee weapon, and staves were their own type.
  const type = ((raw.type as string) === "weapon" ? "sword" : raw.type) as Item["type"];
  const family = isWeaponType(type) ? type : null;

  const mods: ItemMod[] = Array.isArray(raw.mods)
    ? raw.mods.filter((m): m is ItemMod =>
        !!m && typeof m.value === "number" && (MOD_KEYS as readonly string[]).includes(m.key))
    : [];

  const essence = legacy.essence;
  if (mods.length === 0 && essence && typeof essence.value === "number") {
    const element = essence.element as keyof typeof ELEMENT_RESIST_KEY;
    const key = essence.kind === "resist"
      ? ELEMENT_RESIST_KEY[element]
      : ELEMENT_DAMAGE_KEY[element];
    if (key) mods.push({ id: `legacy-${key}`, key: key as ModKey, value: essence.value });
  }

  return {
    ...raw,
    type,
    slot: slotForType(type),
    family,
    stats,
    mods,
    // A v14+ grant is a namespaced ability id (`class.name`); a legacy one is a bare
    // `SkillId` that no longer exists, so it's dropped rather than kept as a dead grant.
    grant: typeof raw.grant === "string" && raw.grant.includes(".") ? raw.grant : null,
    trigger: raw.trigger ?? null,
    // A named item whose definition has since been retired keeps every baked stat and
    // affix and simply stops being named — the same "drop the id, keep the thing" rule a
    // removed cosmetic gets. A pre-v17 item never had the field and is ordinary gear.
    named: isNamedId(raw.named) ? raw.named : null,
  };
}

function readSkills(raw: unknown): (string | null)[] {
  if (!Array.isArray(raw)) return [null, null, null];
  return [0, 1, 2].map((i) => (typeof raw[i] === "string" ? (raw[i] as string) : null));
}
