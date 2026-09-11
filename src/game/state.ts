import { clamp } from "../core/math";
import { Rng } from "../core/rng";
import { MemorySaveStore, serializeSave, type SavedGame, type SaveStore } from "../core/save";
import { MAX_CHALLENGER_TIER } from "../data/challenger";
import { CHESTS, CHEST_TIERS, RETIRED_CHEST_TIERS, type ChestTier } from "../data/chests";
import {
  augmentedPull, emptyLoadout, isAugmentId, loadoutIds, loadoutProblems,
  type AugmentLoadout,
} from "../data/augments";
import {
  BASE_COSMETIC_WEIGHTS, CAPSULES, COSMETICS, COSMETICS_BY_ID,
  DUPE_REFUND, defaultAppearance, normalizeAppearance, normalizeOwned,
  type Appearance, type CapsuleTier, type Cosmetic, type CosmeticSlot,
} from "../data/cosmetics";
import type { WeaponFamily } from "../data/weapons";
import {
  bannerStyle, normalizeFlownStyle, normalizeOwnedStyles, standardsFor, styleOwned,
} from "../data/standards";
import {
  CRAFTABLE_RARITIES, CRAFT_TYPES, craftBulkCost, craftEssenceCost, reforgeCoinCost,
  type CraftCategory,
} from "../data/crafting";
import { EQUIP_SLOTS, type EquipSlot } from "../data/items";
import {
  CRYSTALLISE_COMPONENTS, MEMORY_RARITIES, MEMORY_VAULT_CAP, crystalliseMemory, deepenMemory,
  distortMemory, etchMemory, memoryForgetAsh, memoryOpCost, memoryPairs, memoryRecallCost,
  memoryProblems, memoryUnlocked, rollMemory, type MemoryInstance, type MemoryOp,
} from "../data/memories";
import { CLASSES, CLASS_IDS, DEFAULT_CLASS, isClassId, type ClassId } from "../data/classes";
import type { Element } from "../data/elements";
import { ELEMENT_DAMAGE_KEY, ELEMENT_RESIST_KEY } from "../data/mods";
import { isWeaponType, slotForType, RETIRED_MOD_KEYS } from "../data/items";
import { emptyMaterials, type MaterialBag } from "../data/materials";
import {
  NAMED_BY_ID, craftRecipeFor, isNamedId, rollNamedDrops, type NamedItemDef,
} from "../data/named";
import { isRelicId, normalizeRelicLoadout } from "../data/relics";
import {
  ASCEND_COMPONENTS, forgeOpCost, itemMeetsRequirement, type ForgeOp, type ItemRequirement,
} from "../data/crafting";
import {
  ascend, ascendComponents, augment, awaken, eraseGrant, eraseTrigger, forgeOpBlocker, inscribe, recast,
  salvageYield, temper,
} from "./forge";
import { RUN_MODES, type RunConfig, type RunModeId } from "../data/modes";
import { PLANETS } from "../data/planets";
import { RAIDS } from "../data/raids";
import {
  shopPeriod, shopRerollCost, shopStock, SHOP_TIERS, SHOP_TIER_IDS,
  type ShopListing, type ShopTierId,
} from "../data/shop";
import { RARITIES, rarityIndex, type Rarity } from "../data/rarity";
import { normalizeSettings, type Settings } from "../data/settings";
import { MAX_TROPHY_CASES, trophyCaseCost } from "../data/trophies";
import { MOD_KEYS, type ModKey } from "../data/mods";
import { universalPointsFor } from "../progression/universal";
import {
  forgeNamedItem, primeItemIds, randomItemType, reforgeAffixes, rollItem, type Item, type ItemMod, type Stats,
} from "./item";
import { Player, emptyEquipment, type FixedChallengerModeId } from "./player";

export interface RunStats {
  coinsEarned: number;
  coinsSpent: number;
  chestsOpened: Record<ChestTier, number>;
  raritiesFound: Record<Rarity, number>;
  itemsSold: number;
  enemiesKilled: number;
  deepestDepth: number;
  /** Highest Tower floor ever banked, account-wide (UAT §21). Separate from the depth
   *  record on purpose — see `GameState.recordHeight`. */
  highestHeight: number;
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
  /** Times each relic or artifact was banked, by id (UAT §19). Above one means a co-op duplicate. */
  relicsFound: Record<string, number>;
  /** Lifetime augments found, by id (`data/augments.ts`). */
  augmentsFound: Record<string, number>;
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
    highestHeight: 0,
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
    relicsFound: {},
    augmentsFound: {},
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

/** Highest tier open per raid (UAT §15) — same shape and same reasoning as
 *  `freshPlanetProgress`, keyed by raid id. */
function freshRaidProgress(): Record<string, number> {
  return Object.fromEntries(RAIDS.map((r) => [r.id, 1]));
}

/** One shop tier's per-account bookkeeping for whichever period `period` names —
 *  `GameState.shopTierState` resets this the moment the live period has moved past it. */
export interface ShopTierState {
  readonly period: number;
  readonly purchasedSlots: readonly number[];
  readonly rerollCounts: readonly number[];
}
function freshShopState(): Record<ShopTierId, ShopTierState> {
  const empty: ShopTierState = { period: -1, purchasedSlots: [], rerollCounts: [] };
  return { daily: { ...empty }, weekly: { ...empty }, monthly: { ...empty } };
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
  /** Highest Tower floor unlocked for a direct climb (UAT §21) — the ascent's mirror of
   *  `maxUnlockedDepth`, and earned the same way, by clearing and banking. */
  maxUnlockedHeight = 1;
  /** Highest rift tier opened per mode. Clearing a rift opens the next one. */
  riftTiers: Record<RunModeId, number> = freshTiers();
  /** Highest tier opened per planet. Clearing a planet's first tier opens the next planet. */
  planetProgress: Record<string, number> = freshPlanetProgress();
  /**
   * Highest tier opened per raid (UAT §15). Killing a raid's boss and banking it opens the
   * next tier of *that* raid; bailing out opens nothing, the same asymmetry every rift has.
   *
   * Keyed by raid id rather than by `RunModeId` for exactly the reason `planetProgress` is:
   * `riftTiers` is a fixed map over a union and the raid roster is its own open-ended list,
   * so a fifth raid must not need a `RunModeId`. Which raids are *visible* is not stored at
   * all — that is `raidUnlocked(spec, frontier)`, derived, and widening only.
   */
  raidProgress: Record<string, number> = freshRaidProgress();
  /** The Vigil (UAT §17): the UTC day number it was last closed on, 0 for never. The
   *  portal stays shut for the rest of that day — one key a day is the whole design. */
  daily: { clearedDay: number } = { clearedDay: 0 };
  /** The Convergence (UAT §17): the UTC week number it was last closed on, 0 for never.
   *  The portal stays shut for the rest of that week — one closing a week is the design,
   *  same as the Vigil's one a day. */
  weekly: { clearedWeek: number } = { clearedWeek: 0 };
  /**
   * The Rotating Shop (`data/shop.ts`): per tier, the last period this bookkeeping is
   * valid for, which slots this account has bought this period, and how many times each
   * slot has been individually rerolled this period. Read through `shopTierState`, which
   * wipes a tier's own bookkeeping the moment its period has moved on — the stock itself
   * is never saved, only ever derived fresh from the period number, exactly like the
   * Vigil's floor never is.
   */
  shop: Record<ShopTierId, ShopTierState> = freshShopState();
  /** One per element, spent at the forge. Dropped and mined on planets, nowhere else. */
  materials: MaterialBag = emptyMaterials();
  /**
   * Ash — the Forge's one currency (UAT §27), returned only by salvaging items
   * (`salvageItem`) and spent only at the workbench (`applyForgeOp`). Account-wide like
   * coins and materials.
   */
  ash = 0;
  /**
   * Every relic and artifact this account has banked (UAT §19), by `data/relics.ts` id —
   * account-wide like the wardrobe, because a relic is progression the whole account
   * earned. Which three a character *wears* is `Player.relics`.
   */
  relics: string[] = [];
  /**
   * Every augment this account holds (`data/augments.ts`, `docs/augments.md`), by id and
   * count — account-wide like the stash and the relic collection, because a fragment does
   * not care which Legend requisitions with it. Not a currency: nothing sells one, nothing
   * crafts one, and the only thing that spends one is opening a chest around it.
   */
  augments: Record<string, number> = {};
  /**
   * The player's own difficulty dial — zero is plain. Set at a portal or the star map
   * terminal and applies to whatever's entered next: the delve, a rift, or a planet.
   */
  challengerTier = 0;
  /**
   * The Vault (`data/memories.ts`, `docs/memories.md`) — every Memory this account holds,
   * account-wide like the stash and the relic collection. Capped so a save can't grow
   * without bound. A Memory is spent the moment its run begins, so this is a short list
   * in practice.
   */
  memories: MemoryInstance[] = [];
  /** Hands out Vault ids. Persisted so an id is never reused after a reload. */
  private memorySeq = 0;
  /** Potions carried into a dive. Refilled by picking them up in the dungeon. */
  potions = 3;
  /**
   * The vanity currency. Drops in the dungeon, banks like coins, and buys nothing but
   * cosmetic capsules — gems and coins deliberately never convert into each other.
   */
  gems = 0;
  /** Cosmetic ids pulled from capsules. Owning one is permanent. */
  cosmetics: string[] = [];
  /**
   * The Trophy Hall (`data/trophies.ts`, docs/docket.md §3): how many display cases this
   * account has bought, 0-`MAX_TROPHY_CASES`, always the first N — a case is furniture at
   * a fixed spot in the room, not a slot you pick, so there is nothing to index by id.
   */
  trophyCasesUnlocked = 0;
  /**
   * What's on display, one snapshot per case, account-wide — a walk-past hall of what this
   * account has found, not what any one character is wearing. Read `trophies.ts`'s own
   * header for why this is a frozen copy rather than a live binding: nothing here is ever
   * read by the simulation, which is what keeps display power-free by construction.
   */
  trophyItems: (Item | null)[] = [];
  /**
   * Standards (`docs/gem-sinks.md` §4A): which banner styles this account has bought,
   * account-wide like `cosmetics` — the cloth is a look, not a character stat, so there is
   * no reason to lock it to one class. The free default (`DEFAULT_BANNER_STYLE`) is never
   * stored here; `styleOwned` treats a zero-price style as owned by construction.
   */
  ownedBannerStyles: string[] = [];
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
   * Relic ids the SAVE_VERSION 35 level gate had to unsocket on load, across every class.
   * Non-empty exactly once, right after loading a save whose worn relics outrank the
   * character wearing them; the town shows a notice and clears it. Transient and
   * deliberately not persisted, exactly like `treePointsRefunded` — nothing is lost, the
   * relics are still in the collection and go back on at level.
   */
  relicsUnsocketed: string[] = [];
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
   * How far into the war this account has got, on any ladder (UAT §23) — the one number
   * that answers "what has this player earned the right to stand in".
   *
   * Now that §21's Tower exists this is the further of the two ladders, which is what the
   * name was reserved for: one place to widen rather than a `Math.max` copied into every
   * caller. It only ever widens, so no save can lose access to anything it could reach.
   *
   * It is emphatically **not** a replacement for `stats.deepestDepth`. Anything that means
   * *specifically* how deep this account has dug — the rift unlock ladder, the Vigil's and
   * Convergence's thresholds, the Tower's own unlock — still reads that, because a climb
   * must not open the descent's doors. What reads the frontier is what means "how far into
   * the war has this account got": the Reliquary's second route in, and the universal
   * tree's point pool.
   */
  get frontier(): number {
    return Math.max(this.stats.deepestDepth, this.stats.highestHeight);
  }

  /**
   * The ascent's records, banked (UAT §21). Called by `recordDepth` — a tower floor never
   * reaches the depth bookkeeping at all.
   *
   * `stats.highestHeight` is the account record, `Player.highestHeight` this character's,
   * and `maxUnlockedHeight` the next floor you may climb straight to; all three mirror the
   * descent's exactly. A height is never written into any depth field, which is the whole
   * point of the split: `provingFloor` refuses a non-Delve config anyway, but the records
   * being separate is what stops a later "simplification" from making a height-30 climb
   * somebody's final exam. `tools/world.ts` pins it.
   */
  recordHeight(height: number): void {
    if (height > this.stats.highestHeight) this.stats.highestHeight = height;
    if (height > this.player.highestHeight) this.player.highestHeight = height;
    if (height + 1 > this.maxUnlockedHeight) this.maxUnlockedHeight = height + 1;
  }

  /**
   * The universal tree's point pool — UAT §18. **Account-wide**, unlike the class tree's,
   * and derived from the account's lifetime frontier across every character rather than
   * from any one character's level.
   *
   * It reads `frontier` rather than the depth record because §23 makes both ladders halves
   * of one war: an account that spent its time climbing has earned the same basics an
   * account that spent it digging has. `UNIVERSAL_POINT_CAP` still bounds it, so this
   * widens who reaches the cap rather than lifting it.
   *
   * That is the whole reason the tree feels different from a second class tree: the class
   * tree is what *this* character earned, and this is what the *account* earned. A brand
   * new alt starts with the full pool already spendable, which is the payoff — the
   * account's progress is inherited, while how to spend it stays a per-class decision
   * (`Player.universalAllocated`).
   */
  get universalPool(): number {
    return universalPointsFor(this.frontier);
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

  spendGems(n: number): boolean {
    if (this.gems < n) return false;
    this.gems -= n;
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
   * The weapon skins you own that can actually be worn on `family` — the ones drawn as a
   * weapon of it, plus the seven original palettes, which belong to no family. Offering
   * a scythe skin to someone holding a sword would be offering them nothing.
   */
  ownedWeaponSkins(family: WeaponFamily): Cosmetic[] {
    return this.ownedInSlot("weapon").filter((c) => c.family === null || c.family === family);
  }

  /**
   * Wears a cosmetic, or takes the slot off with null. Refuses anything unowned so a
   * stale save can never dress you in something you never pulled.
   *
   * The weapon slot needs a `family`, because it holds one choice per family rather than
   * one choice — see `Appearance.weapons`.
   */
  wear(slot: CosmeticSlot, id: string | null, family?: WeaponFamily): boolean {
    if (id !== null) {
      const c = COSMETICS_BY_ID[id];
      if (!c || c.slot !== slot || !this.owns(id)) return false;
      // A skin drawn as some other family's weapon would lie about reach if it drew here,
      // so it cannot be equipped here either.
      if (slot === "weapon" && c.family !== null && c.family !== family) return false;
    }
    if (slot === "weapon") {
      if (!family) return false;
      this.appearance = { ...this.appearance, weapons: { ...this.appearance.weapons, [family]: id } };
      return true;
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

  /** What's sitting in case `index`, or null — a case past what's unlocked reads as
   *  empty rather than throwing, the same "past the edge is nothing" rule every other
   *  fixed-slot read in this file follows. */
  trophyItem(index: number): Item | null {
    if (index < 0 || index >= this.trophyCasesUnlocked) return null;
    return this.trophyItems[index] ?? null;
  }

  /** Every case slot, in order, read through {@link trophyItem} — the one array the
   *  world renderer walks to draw what's on display (`render/hub.ts`). A fixed
   *  `MAX_TROPHY_CASES` long regardless of `trophyCasesUnlocked`, so a locked or empty
   *  slot is simply `null` rather than a length the renderer has to track separately. */
  get trophyDisplay(): readonly (Item | null)[] {
    return Array.from({ length: MAX_TROPHY_CASES }, (_, i) => this.trophyItem(i));
  }

  /** Buys the next locked case — always the first one not yet owned, since a case is a
   *  fixed spot in the room and there is nothing to choose between them. */
  buyTrophyCase(): boolean {
    if (this.trophyCasesUnlocked >= MAX_TROPHY_CASES) return false;
    const cost = trophyCaseCost(this.trophyCasesUnlocked);
    if (this.gems < cost) return false;
    this.gems -= cost;
    this.trophyCasesUnlocked++;
    return true;
  }

  /**
   * Puts a snapshot of a stash item on display. A deep copy, never the item itself —
   * `data/trophies.ts`'s own header says why: a case is furniture, not a container, and
   * nothing about salvaging, selling or re-equipping the real item should ever have to
   * ask a display case first. Refuses a case that isn't bought yet rather than silently
   * no-opping, so a UI bug here fails loud in `tools/trophies.ts` instead of quietly
   * losing a placement.
   */
  assignTrophy(index: number, item: Item): boolean {
    if (index < 0 || index >= this.trophyCasesUnlocked) return false;
    this.trophyItems[index] = structuredClone(item);
    return true;
  }

  /** Empties a case. The original item was never touched, so there is nothing to return
   *  to the stash — it was already there the whole time. */
  clearTrophy(index: number): void {
    if (index < 0 || index >= this.trophyCasesUnlocked) return;
    this.trophyItems[index] = null;
  }

  /**
   * Buys one banner style, account-wide, `docs/gem-sinks.md` §4A's 250 gems. Refuses the
   * free default (nothing to buy) and a style already owned, both silently — a UI that
   * only ever offers what's actually purchasable never has to check twice.
   */
  buyBannerStyle(id: string): boolean {
    const style = bannerStyle(id);
    if (style.price <= 0 || this.ownedBannerStyles.includes(style.id)) return false;
    if (this.gems < style.price) return false;
    this.gems -= style.price;
    this.ownedBannerStyles.push(style.id);
    return true;
  }

  /** Sets the active class's flown banner style. Refuses one that isn't owned rather
   *  than flying a style nobody paid for. */
  setFlownBannerStyle(id: string): boolean {
    const style = bannerStyle(id);
    if (!styleOwned(style, this.ownedBannerStyles)) return false;
    this.player.flownBannerStyle = style.id;
    return true;
  }

  /**
   * Sets (or clears, with `null`) the active class's flown Standard. Validated against
   * `standardsFor` on the way in, not just on load — the structural half of "never
   * display a badge you didn't earn": there is no code path that can set an id this
   * character hasn't actually earned, so nothing downstream needs to re-check it.
   */
  setFlownStandard(markId: string | null): boolean {
    if (markId !== null && !standardsFor(this.player, this.activeClassId).some((m) => m.id === markId)) {
      return false;
    }
    this.player.flownStandard = markId;
    return true;
  }

  /**
   * A tier's live bookkeeping, wiped the instant its period has moved past what was
   * saved — the slate wipes at every boundary (`docs/rotating-shop.md`), so last
   * period's purchases and rerolls never bleed into a new one. Every other shop method
   * reads through this rather than `this.shop[tier]` directly, so the wipe can never be
   * forgotten at a second call site.
   */
  private shopTierState(tier: ShopTierId): ShopTierState {
    const now = shopPeriod(tier);
    const live = this.shop[tier];
    if (live.period !== now) this.shop[tier] = { period: now, purchasedSlots: [], rerollCounts: [] };
    return this.shop[tier];
  }

  /** What a tier is currently offering, for this account, right now. */
  shopListings(tier: ShopTierId): ShopListing[] {
    const s = this.shopTierState(tier);
    return shopStock(tier, s.period, s.rerollCounts);
  }

  /** Which slots (by index) this account has already bought in a tier's current
   *  period — what a "SOLD" badge on a shop card reads off. */
  shopPurchasedSlots(tier: ShopTierId): readonly number[] {
    return this.shopTierState(tier).purchasedSlots;
  }

  /** Whether this account has any purchases left in a tier's current period —
   *  independent of how many times any slot in it has been rerolled. This is the
   *  structural half of "gems buy choice, never quantity": nothing that spends gems
   *  ever touches this number. */
  shopPurchasesLeft(tier: ShopTierId): number {
    const s = this.shopTierState(tier);
    return Math.max(0, SHOP_TIERS[tier].purchaseCap - s.purchasedSlots.length);
  }

  /** Gems the *next* reroll of any slot in this tier's current period would cost. */
  shopNextRerollCost(tier: ShopTierId): number {
    const s = this.shopTierState(tier);
    return shopRerollCost(tier, s.rerollCounts.reduce((a, b) => a + b, 0));
  }

  /** Rerolls one slot — changes what it offers, never how many purchases remain. */
  rerollShopSlot(tier: ShopTierId, slot: number): boolean {
    const s = this.shopTierState(tier);
    const cost = this.shopNextRerollCost(tier);
    if (!this.spendGems(cost)) return false;
    const rerollCounts = s.rerollCounts.slice();
    rerollCounts[slot] = (rerollCounts[slot] ?? 0) + 1;
    this.shop[tier] = { ...s, rerollCounts };
    return true;
  }

  /**
   * Buys one slot's current listing. Checked and booked in one place: the purchase cap
   * (`shopPurchasesLeft`) and "already bought this exact slot this period" both gate the
   * spend *before* any coins move or any item is minted, so there is no path to the item
   * without the cap having already allowed it.
   */
  buyShopSlot(tier: ShopTierId, slot: number): Item | null {
    const s = this.shopTierState(tier);
    if (s.purchasedSlots.includes(slot)) return null;
    if (this.shopPurchasesLeft(tier) <= 0) return null;
    const listings = shopStock(tier, s.period, s.rerollCounts);
    const listing = listings[slot];
    if (!listing) return null;
    if (!this.spendCoins(listing.price)) return null;
    this.shop[tier] = { ...s, purchasedSlots: [...s.purchasedSlots, slot] };
    this.stats.raritiesFound[listing.item.rarity]++;
    this.addToInventory([listing.item]);
    return listing.item;
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
    // Item level tracks the active character's own level, not the account's frontier — a
    // level-30 alt who has never banked a deep floor still needs its own gear, and the
    // frontier reads as 1 until they do (owner ruling, docs/handoff.md's addendum).
    const ilvl = Math.max(1, this.player.level);
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
  ownsRelic(id: string): boolean {
    return this.relics.includes(id);
  }

  /**
   * Banks relics found on a floor into the collection. Called from `Dungeon.bank`, so it
   * costs exactly what every other floor reward costs — dying on the way out loses it. A
   * duplicate (only possible from a co-op host rolling blind) bumps the counter and adds
   * nothing: the collection is a set. Returns the ids that were new.
   */
  bankRelics(ids: readonly string[]): string[] {
    const fresh: string[] = [];
    for (const id of ids) {
      if (!isRelicId(id)) continue;
      this.stats.relicsFound[id] = (this.stats.relicsFound[id] ?? 0) + 1;
      if (!this.relics.includes(id)) {
        this.relics.push(id);
        fresh.push(id);
      }
    }
    return fresh;
  }

  /**
   * Banks augments carried out of a run. Unlike a relic there is no "already owned" skip:
   * a second Bow Augment is a second Bow Augment, and stacking two on one axis is
   * impossible by the shape of `AugmentLoadout` rather than by making dupes worthless.
   */
  bankAugments(ids: readonly string[]): void {
    for (const id of ids) {
      if (!isAugmentId(id)) continue;
      this.augments[id] = (this.augments[id] ?? 0) + 1;
      this.stats.augmentsFound[id] = (this.stats.augmentsFound[id] ?? 0) + 1;
    }
  }

  augmentCount(id: string): number {
    return this.augments[id] ?? 0;
  }

  /** Ids the account currently holds at least one of, in registry order. */
  ownedAugments(): string[] {
    return Object.keys(this.augments).filter((id) => isAugmentId(id) && this.augments[id]! > 0);
  }

  /** Puts an owned relic in one of the active character's slots. False with the reason otherwise. */
  socketRelic(slot: number, id: string): { ok: true; replaced: string | null } | { ok: false; reason: string } {
    if (!this.ownsRelic(id)) return { ok: false, reason: "You don't have that one yet." };
    const blocker = this.player.relicBlocker(slot, id);
    if (blocker) return { ok: false, reason: blocker };
    const replaced = this.player.socketRelic(slot, id);
    return { ok: true, replaced: replaced ?? null };
  }

  unsocketRelic(slot: number): string | null {
    return this.player.unsocketRelic(slot);
  }

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
    // Same axis as craftItem/openChests — a named forge is still gear for the active
    // character, not a reward for the account's lifetime frontier.
    const item = this.forgeNamed(def, Math.max(1, this.player.level));
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
   * The Stash's mass-salvage: exactly `salvageItem` run once per id, summed — not a
   * second code path with its own idea of what salvage pays. A missing id (already
   * salvaged, already sold) is skipped rather than failing the whole batch.
   */
  salvageItems(ids: readonly string[]): { ash: number; materials: Partial<MaterialBag> } {
    let ash = 0;
    const materials: Partial<MaterialBag> = {};
    for (const id of ids) {
      const y = this.salvageItem(id);
      if (!y) continue;
      ash += y.ash;
      for (const [e, n] of Object.entries(y.materials) as [Element, number][]) {
        if (n) materials[e] = (materials[e] ?? 0) + n;
      }
    }
    return { ash, materials };
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
    return this.openAugmented({ ...emptyLoadout(), base: tier }, count);
  }

  /**
   * The one chest-opening path (`docs/augments.md`). An un-augmented pull is the empty
   * loadout, so there is no second code path to keep in agreement — `openChests` above is
   * literally this function with nothing slotted.
   *
   * Everything the loadout decides is decided by `augmentedPull`, which the augment tab's
   * outcome panel also calls. That is UAT §20 in its literal form: the preview is not
   * describing this roll, it is running this roll's own composition and not throwing dice.
   *
   * Augments are consumed whatever comes out. A rarity augment that "missed" still floored
   * the roll and still forced the form, element and affix it was stacked with.
   */
  openAugmented(load: AugmentLoadout, count = 1): Item[] {
    if (loadoutProblems(load).length > 0) return [];
    const ids = loadoutIds(load);
    // An augmented pull is always 1x, and the tab does not offer the bulk button — ten
    // simultaneous augmented opens is exactly the "routine currency" failure mode this
    // system is designed against.
    const want = ids.length > 0 ? 1 : count;
    for (const id of ids) if (this.augmentCount(id) <= 0) return [];

    const tier = load.base;
    const available = Math.min(want, this.keys[tier]);
    if (available <= 0) return [];
    this.keys[tier] -= available;
    for (const id of ids) this.augments[id] = this.augmentCount(id) - 1;

    const info = CHESTS[tier];
    const pull = augmentedPull(load);
    // owner override - this should be based on the active character's level, not the
    // account's record. chests and crafting are bricked otherwise
    const ilvl = Math.max(1, this.player.level);
    const affinity = this.player.heroClass.affinity;
    // Declared on the chest row rather than switched on its id, so the Legend's Cache is
    // data like every other chest (`ChestTierInfo.classElement`).
    const favorElement = pull.favorElement
      ?? (info.classElement ? this.heroClass.element : undefined);
    const found: Item[] = [];
    for (let i = 0; i < available; i++) {
      const rarity = this.rng.weighted(pull.weights);
      const type = pull.types && pull.types.length > 0
        ? this.rng.pick(pull.types)
        : randomItemType(this.rng, affinity, info.classAdaptive);
      const item = rollItem({
        rarity, type, ilvl, rng: this.rng, favorElement, ensureMods: pull.ensureMods,
      });
      // Named items (UAT §28) take this pull's slot rather than riding alongside it — a
      // chest returns exactly the number of items it promised (docket §21: a 10-pull was
      // paying out 11 whenever a named item hit). A named drop outvalues the roll it
      // displaces, so the player loses nothing real.
      //
      // **Only the first hit fills the slot and any others are discarded — that is a
      // deliberate v1 decision, not a fact about the data, and this is the fork to read
      // before changing it.** `rollTable` rolls every matching source independently, so
      // two definitions *can* hit one pull; today they cannot, because only one named item
      // (`keeper's-ledger`, Legendary) sources from a chest at all. Capping here keeps the
      // count promise unconditional rather than true-by-luck-of-the-table.
      //
      // The alternative, if a second chest-sourced named item is ever added and silently
      // dropping the rarer of two simultaneous hits starts to matter: accumulate hits
      // across the whole batch into a queue and fill slots from it first, bounded by
      // `available`. That preserves the count and discards nothing until the queue
      // genuinely overflows a single pull. It is real machinery for a case that does not
      // exist yet, which is why it is written down here instead of built.
      const namedHits = rollNamedDrops({ kind: "chest", tier }, this.rng);
      if (namedHits.length > 0) {
        found.push(this.forgeNamed(namedHits[0]!, ilvl));
      } else {
        found.push(item);
        this.stats.raritiesFound[rarity]++;
      }
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
   *
   * This is also the one hook Challenger completion badges bank through — every branch
   * below is already "this activity just counted as *done*", which is exactly what a
   * badge means, so a badge is banked beside whatever record that branch already writes,
   * against `config.challengerTier` (the dial this specific floor was actually run at).
   * Every `RunConfig` carries that field, and every real caller sets it, but the
   * function's own `config?` stays optional (a couple of tools call it bare), so a badge
   * only ever gets banked where a `config` actually exists.
   */
  recordDepth(depth: number, config?: RunConfig): void {
    // The ascent keeps its own books and touches none of the depth records (UAT §21).
    // First, before anything below runs: a height is not a depth, and writing one into
    // `deepestDepth` would hand a climber the Proving and the rift ladders for free.
    if (config?.tower) {
      this.recordHeight(config.tower.height);
      this.player.bankTowerChallengerBadge(config.challengerTier, config.tower.height);
      return;
    }
    if (depth > this.stats.deepestDepth) this.stats.deepestDepth = depth;
    if (depth > this.player.deepestDepth) this.player.deepestDepth = depth;
    // The Vigil is closed for the day. Only a credited bank gets here, so a death or a
    // bail-out leaves it open to try again.
    if (config?.daily) {
      this.daily.clearedDay = config.daily.day;
      this.stats.vigilsCleared++;
      this.player.bankChallengerBadge("vigil", config.challengerTier);
      return;
    }
    // The Convergence is closed for the week. Its four floors each call this (every
    // completion portal banks), so only the boss floor — `lastFloor` — actually closes
    // it; the first three just fall through to the depth-record update above.
    if (config?.weekly) {
      if (!config.lastFloor) return;
      this.weekly.clearedWeek = config.weekly.week;
      this.stats.convergencesCleared++;
      this.player.bankChallengerBadge("convergence", config.challengerTier);
      return;
    }
    // A raid is rift-shaped and keeps its own tier ladder per encounter (UAT §15), so it
    // is tracked by raid id for the reason a planet is — the roster is a list, not a union.
    // It falls through the depth-record update above on purpose: a raid's effective depth
    // is a real depth reached by a real character, exactly as a rift tier's is.
    if (config?.raid) {
      if (!config.lastFloor) return;
      const id = config.raid.spec.id;
      const next = config.raid.tier + 1;
      this.stats.riftsCleared[config.mode.id]++;
      if (next > (this.raidProgress[id] ?? 1)) this.raidProgress[id] = next;
      this.player.bankRaidChallengerBadge(id, config.challengerTier);
      return;
    }
    // A planet is rift-shaped (`mode.isRift` is true for it too) but each one keeps its
    // own tier ladder, so it's tracked by planet id rather than the shared rift Records.
    if (config?.planet) {
      if (!config.lastFloor) return;
      const id = config.planet.spec.id;
      const next = config.planet.tier + 1;
      if (next > (this.planetProgress[id] ?? 1)) this.planetProgress[id] = next;
      this.player.bankPlanetChallengerBadge(id, config.challengerTier);
      return;
    }
    // A Memory is rift-shaped but has no tier ladder — depth and modifiers *are* its
    // ladder (`docs/memories.md` §2), so clearing one books the Record and opens nothing.
    if (config?.memory) {
      if (!config.lastFloor) return;
      this.stats.riftsCleared.memory++;
      this.player.bankChallengerBadge("memory", config.challengerTier);
      return;
    }
    if (!config || !config.mode.isRift) {
      if (depth + 1 > this.maxUnlockedDepth) this.maxUnlockedDepth = depth + 1;
      // Reached for the plain delve only — the Tower's own `!isRift` floor already
      // returned above via its `config.tower` branch.
      if (config) this.player.bankDelveChallengerBadge(config.challengerTier, depth);
      return;
    }
    if (!config.lastFloor) return;
    this.stats.riftsCleared[config.mode.id]++;
    const next = config.tier + 1;
    if (next > this.riftTiers[config.mode.id]) this.riftTiers[config.mode.id] = next;
    // `raid`, `planet` and `memory` are rift-shaped too but each returned above through
    // its own branch, and `delve`/`tower` can't reach here (`isRift` is false for both,
    // and the Tower's own branch already returned) — every id still live at this point is
    // a `FixedChallengerModeId` (currently `abyss`/`hoard`).
    this.player.bankChallengerBadge(config.mode.id as FixedChallengerModeId, config.challengerTier);
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

  // --- the Altar (UAT: Memories — see `docs/memories.md`) ------------------

  /**
   * Whether the *active character* has earned the Altar: the bottom of the descent and
   * the top of the authored ascent, both banked.
   *
   * Per class rather than per account, because the brief asks for "all the heaven and hell
   * floors **for a class**" — the Altar is what a finished character earns, not something
   * an alt inherits. And read off the two records separately rather than off `frontier`,
   * which is a max: a climber who has never seen Hell would clear a frontier gate.
   */
  get altarUnlocked(): boolean {
    return memoryUnlocked(this.player.deepestDepth, this.player.highestHeight);
  }

  memoryById(id: string): MemoryInstance | null {
    return this.memories.find((m) => m.id === id) ?? null;
  }

  /**
   * Recalls a fresh Memory at a chosen rarity: the tier is bought, the character is
   * rolled (`rollMemory`). Materials and coins, no Ash — making costs materials, shaping
   * costs Ash, and the Altar introduces no fourth currency (§27).
   *
   * Returns null and spends nothing if the Altar is shut, the rarity isn't a Memory
   * rarity, the Vault is full, or the price can't be paid.
   */
  recallMemory(rarity: Rarity): MemoryInstance | null {
    if (!this.altarUnlocked) return null;
    if (!MEMORY_RARITIES.includes(rarity)) return null;
    if (this.memories.length >= MEMORY_VAULT_CAP) return null;
    const cost = memoryRecallCost(rarity);
    if (this.materials.physical < cost.scrap || this.coins < cost.coins) return null;
    this.materials.physical -= cost.scrap;
    this.spendCoins(cost.coins);
    const memory = rollMemory(rarity, Math.max(1, this.frontier), this.rng, `m${++this.memorySeq}`);
    this.memories.push(memory);
    return memory;
  }

  /**
   * One workbench op on a Memory in the Vault. Every one of them rolls; none of them lets
   * the player pick a modifier, which is the rule §26 already established for items and
   * the thing that keeps a Memory from becoming a spreadsheet.
   *
   * Returns the resulting Memory, or null having spent nothing.
   */
  /**
   * Which Memories a Crystallise would melt: same rarity, never this one, cheapest first
   * (fewest pairs), so the op never eats the good roll sitting next to the one being
   * raised. `ascendComponents` is the same idea for items.
   */
  crystalliseComponents(memory: MemoryInstance): MemoryInstance[] {
    return this.memories
      .filter((m) => m.id !== memory.id && m.rarity === memory.rarity)
      .sort((a, b) => a.burdens.length - b.burdens.length)
      .slice(0, CRYSTALLISE_COMPONENTS);
  }

  /**
   * Why an Altar op can't run on this Memory, or null when it can — shown verbatim on the
   * Altar's confirm control, the way `forgeOpBlocker` is shown on the bench's.
   *
   * **Extracted rather than copied into the UI**, and `applyMemoryOp` below is its only
   * other caller: a screen that disables a button needs to know the rules, and a second
   * copy of them in `ui/` is exactly the drift docket §10 spent a branch removing. If this
   * is wrong, the button and the op are wrong together.
   */
  memoryOpBlocker(id: string, op: MemoryOp): string | null {
    const memory = this.memoryById(id);
    if (!memory) return "That Memory is no longer in the Vault.";
    if (op === "forget") return null;
    if (op === "etch" && memory.burdens.length >= memoryPairs(memory.rarity)) {
      return `A ${memory.rarity} Memory carries at most ${memoryPairs(memory.rarity)} pairs.`;
    }
    if (op === "crystallise" && this.crystalliseComponents(memory).length < CRYSTALLISE_COMPONENTS) {
      return `Crystallising melts ${CRYSTALLISE_COMPONENTS} other ${memory.rarity} Memories from the Vault.`;
    }
    const cost = memoryOpCost(op, memory.rarity);
    if (this.ash < cost.ash) return `Needs ${cost.ash} Ash — salvage something.`;
    if (this.coins < cost.coins) return `Needs ${cost.coins} coins.`;
    if (this.materials.physical < cost.scrap) return `Needs ${cost.scrap} Iron Scrap.`;
    return null;
  }

  applyMemoryOp(id: string, op: MemoryOp): MemoryInstance | null {
    const memory = this.memoryById(id);
    if (!memory) return null;
    // One copy of the refusal rules, shared with the control that greys itself out.
    if (this.memoryOpBlocker(id, op)) return null;

    if (op === "forget") {
      this.memories = this.memories.filter((m) => m.id !== id);
      this.ash += memoryForgetAsh(memory.rarity);
      return memory;
    }

    const cost = memoryOpCost(op, memory.rarity);
    const components = op === "crystallise" ? this.crystalliseComponents(memory) : [];

    const next =
      op === "distort" ? distortMemory(memory, this.rng)
      : op === "etch" ? etchMemory(memory, this.rng)
      : op === "deepen" ? deepenMemory(memory)
      : crystalliseMemory(memory, this.rng);
    if (!next) return null;

    this.ash -= cost.ash;
    this.spendCoins(cost.coins);
    this.materials.physical -= cost.scrap;
    for (const c of components) this.memories = this.memories.filter((m) => m.id !== c.id);
    this.memories = this.memories.map((m) => (m.id === id ? next : m));
    return next;
  }

  /**
   * Spends a Memory — called when its run actually **begins**, never when it is picked at
   * the Altar. Picking is a plan (the Reliquary Gate's shape) and plans don't survive a
   * reload; losing a Memory to a page refresh would be a bad joke.
   *
   * Dying in it does not give it back, and neither does bailing out. The Memory *was* the
   * resource.
   */
  takeMemory(id: string): MemoryInstance | null {
    const memory = this.memoryById(id);
    if (!memory) return null;
    this.memories = this.memories.filter((m) => m.id !== id);
    return memory;
  }

  // --- persistence -------------------------------------------------------

  toJSON(): object {
    return {
      coins: this.coins,
      keys: this.keys,
      potions: this.potions,
      gems: this.gems,
      cosmetics: this.cosmetics,
      trophyCasesUnlocked: this.trophyCasesUnlocked,
      trophyItems: this.trophyItems,
      ownedBannerStyles: this.ownedBannerStyles,
      appearance: this.appearance,
      maxUnlockedDepth: this.maxUnlockedDepth,
      maxUnlockedHeight: this.maxUnlockedHeight,
      riftTiers: this.riftTiers,
      planetProgress: this.planetProgress,
      raidProgress: this.raidProgress,
      daily: this.daily,
      weekly: this.weekly,
      shop: this.shop,
      materials: this.materials,
      ash: this.ash,
      relics: this.relics,
      augments: this.augments,
      memories: this.memories,
      memorySeq: this.memorySeq,
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
  /**
   * The leaderboards' submission trigger (`docs/leaderboards.md`) — fires on the exact
   * same "something meaningful changed" signal `save()` already does, since a new record
   * can only follow a meaningful action. It is a *trigger* only: what actually gets sent
   * is `computeRecords(this)` in `src/net/records.ts`, a small, independently-versioned
   * payload built fresh from the live `GameState` fields, over its own endpoint — never
   * the save blob itself. `main.ts` installs this once logged in; every test and tool
   * leaves it null, same as `saveStore` defaults to a no-op.
   */
  static recordsHook: (() => void) | null = null;

  save(): void {
    if (this.wiped) return;
    GameState.saveStore.write(serializeSave(this.toJSON()));
    GameState.recordsHook?.();
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
      // Version 22 added relics; an older save owns none. A retired id is dropped rather
      // than kept as a ghost the Hero screen can't draw.
      state.relics = Array.isArray(d.relics)
        ? [...new Set((d.relics as unknown[]).filter(isRelicId))]
        : [];
      // Version 25 added the Vault (`docs/memories.md`); an older save holds no Memories.
      // Each entry is validated through `memoryProblems` rather than trusted, so a Memory
      // naming a place or an encounter that no longer exists is dropped on load instead of
      // crashing the Altar — the same rule `normalizeAppearance` follows for a retired
      // cosmetic id.
      state.memories = Array.isArray(d.memories)
        ? (d.memories as MemoryInstance[])
            .filter((m) => m && typeof m === "object" && memoryProblems(m).length === 0)
            .slice(0, MEMORY_VAULT_CAP)
        : [];
      state.memorySeq = Math.max(
        Number(d.memorySeq ?? 0) || 0,
        ...state.memories.map((m) => Number(String(m.id).replace(/^m/, "")) || 0),
      );
      state.cosmetics = normalizeOwned(d.cosmetics);
      state.appearance = normalizeAppearance(d.appearance);
      // Version 31 added the Trophy Hall (docs/docket.md §3); an older save owns no
      // cases. Clamped rather than trusted, the same as every other fixed-slot count in
      // this file — a hand-edited or corrupted save can't claim more cases than the room
      // has, and a malformed item snapshot is dropped to an empty case instead of
      // crashing the hall the way a retired cosmetic id is dropped rather than kept.
      state.trophyCasesUnlocked = Math.max(0, Math.min(MAX_TROPHY_CASES,
        Math.floor(Number(d.trophyCasesUnlocked ?? 0)) || 0));
      state.trophyItems = Array.isArray(d.trophyItems)
        ? (d.trophyItems as unknown[]).slice(0, MAX_TROPHY_CASES)
          .map((it) => (it && typeof it === "object" ? it as Item : null))
        : [];
      // Version 34 added Standards; an older save owns no banner style beyond the free
      // default, which needs no entry here at all.
      state.ownedBannerStyles = normalizeOwnedStyles(d.ownedBannerStyles);
      state.maxUnlockedDepth = Number(d.maxUnlockedDepth ?? 1);
      // A save from before the Tower has climbed nothing, which is the fresh value anyway.
      state.maxUnlockedHeight = Number(d.maxUnlockedHeight ?? 1);
      // Version 27 added augments (`docs/augments.md`); an older save holds none. A
      // retired id is dropped rather than kept as a ghost the chest screen can't draw —
      // the same rule `normalizeAppearance` follows for a retired cosmetic.
      state.augments = {};
      const savedAugments = d.augments as Record<string, unknown> | undefined;
      if (savedAugments && typeof savedAugments === "object") {
        for (const [id, n] of Object.entries(savedAugments)) {
          const count = Math.max(0, Math.floor(Number(n)) || 0);
          if (isAugmentId(id) && count > 0) state.augments[id] = count;
        }
      }
      // Version 27 also retired nineteen chest tiers (the weapon and elemental caches,
      // replaced one for one by form and element augments). Keys for a retired tier are
      // refunded as coins at **full purchase price** rather than converted at a ratio into
      // a surviving tier: a ratio is arithmetic nobody can check and it loses value at the
      // edges, and a migration players cannot verify is how trust in a save format dies.
      const savedKeys = (d.keys ?? {}) as Record<string, number>;
      let refund = 0;
      for (const [tier, retired] of Object.entries(RETIRED_CHEST_TIERS)) {
        const held = Math.max(0, Math.floor(Number(savedKeys[tier])) || 0);
        if (held > 0) refund += held * retired.price;
      }
      // Only tiers that still exist survive the merge, so an unknown id in an old save is
      // dropped rather than left in the record as an undrawable row.
      state.keys = { ...state.keys };
      for (const t of CHEST_TIERS) {
        state.keys[t] = Math.max(0, Math.floor(Number(savedKeys[t])) || 0);
      }
      if (refund > 0) state.coins += refund;
      state.stats = { ...freshStats(), ...(d.stats as RunStats) };
      state.stats.augmentsFound = { ...(state.stats.augmentsFound ?? {}) };
      // Lifetime opened-counts fold into the surviving tier that shared a retired chest's
      // odds grade, so a record does not silently shrink under the player.
      const savedOpened = (state.stats.chestsOpened ?? {}) as Record<string, number>;
      state.stats.chestsOpened = Object.fromEntries(
        CHEST_TIERS.map((t) => [t, Math.max(0, Math.floor(Number(savedOpened[t])) || 0)]),
      ) as Record<ChestTier, number>;
      for (const [tier, retired] of Object.entries(RETIRED_CHEST_TIERS)) {
        const opened = Math.max(0, Math.floor(Number(savedOpened[tier])) || 0);
        if (opened > 0) state.stats.chestsOpened[retired.openedInto] += opened;
      }
      // Saves from before rifts existed have neither of these.
      state.stats.riftsCleared = { ...freshStats().riftsCleared, ...state.stats.riftsCleared };
      state.riftTiers = { ...freshTiers(), ...(d.riftTiers as Record<RunModeId, number> | undefined) };
      // Saves from before planets and the forge existed have none of these; a fresh
      // ladder and an empty materials bag is exactly what a brand new save gets too.
      state.planetProgress = { ...freshPlanetProgress(), ...(d.planetProgress as Record<string, number> | undefined) };
      // Version 24 added raids (UAT §15); an older save has opened no tier of any of them,
      // which is what a fresh ladder already says. Merged the same way as every other
      // id-keyed record, so a raid removed from the roster leaves a dead key rather than
      // resetting the ones that remain.
      state.raidProgress = { ...freshRaidProgress(), ...(d.raidProgress as Record<string, number> | undefined) };
      state.materials = { ...emptyMaterials(), ...(d.materials as Partial<MaterialBag> | undefined) };
      // Version 16 added the daily Vigil; an older save has simply never closed one.
      const daily = d.daily as { clearedDay?: unknown } | undefined;
      state.daily = { clearedDay: Math.max(0, Math.floor(Number(daily?.clearedDay ?? 0)) || 0) };
      // Version 21 added the weekly Convergence; an older save has simply never closed one.
      const weekly = d.weekly as { clearedWeek?: unknown } | undefined;
      state.weekly = { clearedWeek: Math.max(0, Math.floor(Number(weekly?.clearedWeek ?? 0)) || 0) };
      // Version 30 added the Rotating Shop. An older save (or a malformed tier) falls
      // back to `freshShopState`'s empty bookkeeping for that tier specifically — the
      // stock itself is never saved, so this is only ever "how many purchases/rerolls
      // has this account already spent this period", and getting that wrong in either
      // direction is a real economy bug (too generous refunds a cap that already fired;
      // too strict locks an account out of a period it never touched), so every field is
      // validated rather than trusted.
      const savedShop = d.shop as Partial<Record<ShopTierId, Partial<ShopTierState>>> | undefined;
      const fresh = freshShopState();
      state.shop = Object.fromEntries(SHOP_TIER_IDS.map((tier) => {
        const raw = savedShop?.[tier];
        const period = Math.floor(Number(raw?.period ?? -1));
        const purchasedSlots = Array.isArray(raw?.purchasedSlots)
          ? raw!.purchasedSlots.filter((n): n is number => Number.isInteger(n) && n >= 0)
          : [];
        const rerollCounts = Array.isArray(raw?.rerollCounts)
          ? raw!.rerollCounts.map((n) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0))
          : [];
        return [tier, Number.isFinite(period) ? { period, purchasedSlots, rerollCounts } : fresh[tier]];
      })) as Record<ShopTierId, ShopTierState>;
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
      const universalPool = universalPointsFor(state.frontier);

      const playersRaw = d.players as Record<string, unknown> | undefined;
      if (playersRaw) {
        for (const id of CLASS_IDS) {
          const loaded = applyPlayerJSON(
            state.players[id], playersRaw[id] as Record<string, unknown> | undefined, preProgression,
            universalPool,
          );
          state.treePointsRefunded += loaded.treePointsRefunded;
          state.relicsUnsocketed.push(...loaded.relicsUnsocketed);
        }
        state.activeClassId = isClassId(d.activeClassId) ? d.activeClassId : state.activeClassId;
      } else {
        // Pre-v10 save: one shared character. Fold it into whichever class it was
        // playing; every other class starts fresh, exactly like a brand new one does.
        const p = d.player as Record<string, unknown> | undefined;
        if (p) {
          const legacyClass: ClassId = isClassId(p.classId) ? p.classId : DEFAULT_CLASS;
          const loaded = applyPlayerJSON(
            state.players[legacyClass], p, preProgression, universalPool,
          );
          state.treePointsRefunded += loaded.treePointsRefunded;
          state.relicsUnsocketed.push(...loaded.relicsUnsocketed);
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
    highestHeight: p.highestHeight,
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
    // The three relic slots (UAT §19). On the wire for the same reason the tree is: a
    // host rebuilds this hero's build from this blob, and a relic left behind here would
    // mean the host simulating a weaker character than the one on the player's screen.
    relics: p.relics,
    // Challenger completion badges. On the wire for the same reason `legendComplete` is:
    // this blob is the whole character sheet, and an ally's trophies reaching the host is
    // free once they're here — nothing reads them for anything but display, on either side.
    challengerBadges: p.challengerBadges,
    // The Delve/Tower rework (SAVE_VERSION 28): per-tier depth/height arrays rather than
    // one number in `challengerBadges`, for the reason documented on the field itself.
    delveChallengerBadges: p.delveChallengerBadges,
    towerChallengerBadges: p.towerChallengerBadges,
    planetChallengerBadges: p.planetChallengerBadges,
    raidChallengerBadges: p.raidChallengerBadges,
    // The leaderboards' "highest recorded max damage" board (`docs/leaderboards.md`)
    // reads this straight off the character sheet, same as every other record there.
    lifetimeMaxHit: p.lifetimeMaxHit,
    // Standards (`docs/gem-sinks.md` §4A). On the wire for the same reason every other
    // display-only field on this sheet is: an ally's flown mark reaching the host's
    // screen is free once it's here, and nothing on either side reads it for power.
    flownStandard: p.flownStandard,
    flownBannerStyle: p.flownBannerStyle,
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

/** What a load had to change about a character sheet, for the town to say once. */
interface LoadedSheet {
  /** Tree points handed back by the v14 class-refactor migration. */
  readonly treePointsRefunded: number;
  /** Relic ids unsocketed by the SAVE_VERSION 35 level gate. */
  readonly relicsUnsocketed: readonly string[];
}

/**
 * Applies one saved character sheet onto a fresh `Player` of the matching class. Used
 * once per class on a current save, and once for whichever class a pre-v10 save's
 * single shared character belonged to. `preProgression` is true for a save older than
 * v14, whose tree allocation and equipped skills predate the class refactor and are
 * dropped rather than migrated.
 *
 * The return value is the two things a load can silently take away from a player — refunded
 * tree points and unsocketed relics — so the town can announce both once rather than a
 * character quietly coming back different. A migration players cannot see is how trust in a
 * save format dies.
 */
function applyPlayerJSON(
  p: Player,
  raw: Record<string, unknown> | undefined,
  preProgression: boolean,
  universalPool: number,
): LoadedSheet {
  if (!raw) return { treePointsRefunded: 0, relicsUnsocketed: [] };
  p.level = Number(raw.level ?? 1);
  // Saves from before per-character progress existed (or a class that predates this
  // field) have no `deepestDepth` of their own — estimate one from level rather than
  // falling back to the account-wide record, which is exactly the bug this fixed: a
  // fresh alt would otherwise inherit the main's depth and get gear it can't wear.
  p.deepestDepth = Number(raw.deepestDepth ?? Math.max(0, p.level - 1));
  // No estimate for the ascent: a save from before the Tower has genuinely climbed zero,
  // and guessing one from level would hand it item levels it never earned.
  p.highestHeight = Number(raw.highestHeight ?? 0);
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
  // A save from before v22 wears no relics; anything else is brought back to legal — which
  // since SAVE_VERSION 35 includes the level gate, and so can take out a relic the player
  // legitimately earned and was wearing. `p.level` is set above, so this asks the gate at
  // the character's own level rather than the account's. What came out is returned for a
  // one-time town notice; see `normalizeRelicLoadout`.
  const loadout = normalizeRelicLoadout(raw.relics, p.level);
  p.relics = loadout.worn;
  // A save from before v26 has never banked a Challenger badge — every activity starts
  // unearned, which is true. Same `{ ...fresh, ...saved }` shape `riftTiers` already uses,
  // so a fixed-map entry a newer build hasn't seen yet (or one absent from an older save)
  // both fall back to the field's own zeroed default rather than crashing the load.
  //
  // A save from v26 or v27 still carries `delve`/`tower` keys inside this same object —
  // the shape those two replaced in the rework below. Dropped rather than migrated: an
  // old badge means "cleared this tier at *some* depth", and there is no honest depth to
  // credit that to, so inventing one would be exactly the unverifiable arithmetic the
  // augment key refund was rejected for. The player keeps the badge only in the sense
  // that `deepestDepth`/`highestHeight` (migrated separately, unaffected by this) already
  // recorded how far they'd actually gotten.
  const rawBadges = { ...(raw.challengerBadges as Record<string, number> | undefined) };
  delete rawBadges.delve;
  delete rawBadges.tower;
  p.challengerBadges = {
    ...p.challengerBadges,
    ...rawBadges,
  } as Record<FixedChallengerModeId, number>;
  // The Delve/Tower rework (SAVE_VERSION 28): a save older than that has neither array,
  // so every tier starts unbanked — true, for the reason above.
  p.delveChallengerBadges = normalizeDepthBadges(raw.delveChallengerBadges);
  p.towerChallengerBadges = normalizeDepthBadges(raw.towerChallengerBadges);
  p.planetChallengerBadges = { ...(raw.planetChallengerBadges as Record<string, number> | undefined) };
  p.raidChallengerBadges = { ...(raw.raidChallengerBadges as Record<string, number> | undefined) };
  // A save from before this field has never landed a recorded hit — true, same reasoning
  // as `challengerBadges` above.
  p.lifetimeMaxHit = Number(raw.lifetimeMaxHit ?? 0);
  // Standards (SAVE_VERSION 34). Re-validated against the badges just loaded above rather
  // than trusted — a hand-edited or stale save cannot fly a mark this character didn't
  // earn; it silently falls back to nothing flown, the same "drop rather than crash"
  // rule every other retired reference in this function follows.
  const flownId = typeof raw.flownStandard === "string" ? raw.flownStandard : null;
  p.flownStandard = flownId && standardsFor(p, p.classId).some((m) => m.id === flownId)
    ? flownId : null;
  p.flownBannerStyle = normalizeFlownStyle(raw.flownBannerStyle);
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
  return {
    treePointsRefunded: preProgression && hadAllocation ? p.treePoints : 0,
    relicsUnsocketed: loadout.unsocketed,
  };
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

  // Version-agnostic, the `normalizeAppearance` house style: a saved affix whose key has
  // since been retired is rewritten onto the live key that replaced it, *before* the
  // filter below drops unknown keys — which would otherwise delete it silently and leave
  // gear people already own quietly smaller. No `SAVE_VERSION` bump is needed for a key
  // retirement, the same way the legacy-essence rewrite below needs none.
  //
  // `RETIRED_MOD_KEYS` in data/items.ts says what each key becomes AND which of the two
  // retirements it is, and the difference decides the number: a `rename` carries the
  // rolled value across untouched because the live key means the same thing in the same
  // units (`wardPower` → `defensePercent`, the "of Warding" suffix keeping its exact
  // base/perTier), while a `rewrite` derives a fresh magnitude from the item's tier
  // because it doesn't (the two ultimate keys stored flat counts and land on a
  // percentage). Getting that backwards damages an item either way, which is why the
  // table makes it a stated, typechecked property rather than a convention.
  const tier = rarityIndex(raw.rarity);
  const rewritten: ItemMod[] = Array.isArray(raw.mods)
    ? raw.mods.map((m) => {
        if (!m || typeof m.value !== "number") return m;
        const retired = RETIRED_MOD_KEYS[m.key as string];
        if (!retired) return m;
        return {
          ...m,
          key: retired.to,
          value: retired.kind === "rename" ? m.value : retired.value(tier),
        };
      })
    : [];

  const mods: ItemMod[] = rewritten.filter((m): m is ItemMod =>
    !!m && typeof m.value === "number" && (MOD_KEYS as readonly string[]).includes(m.key));

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

/**
 * Validates a saved `delveChallengerBadges`/`towerChallengerBadges` array (see
 * `Player`): the right length, every slot a finite non-negative number, anything else —
 * missing, malformed, or from a save older than the rework — brought back to a fresh
 * zeroed shelf rather than crashing the load.
 */
function normalizeDepthBadges(raw: unknown): number[] {
  const fresh = new Array(MAX_CHALLENGER_TIER).fill(0);
  if (!Array.isArray(raw)) return fresh;
  for (let i = 0; i < MAX_CHALLENGER_TIER; i++) {
    const v = Number(raw[i]);
    if (Number.isFinite(v) && v > 0) fresh[i] = v;
  }
  return fresh;
}
