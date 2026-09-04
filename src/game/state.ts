import { Rng } from "../core/rng";
import { loadRaw, saveRaw } from "../core/save";
import { CHESTS, CHEST_TIERS, type ChestTier } from "../data/chests";
import { ITEM_TYPES, type ItemType, type EquipSlot } from "../data/items";
import { BASE_RARITY_WEIGHTS, RARITIES, type Rarity } from "../data/rarity";
import { primeItemIds, rollItem, type Item } from "./item";
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
  };
}

/** Everything that persists between dives. */
export class GameState {
  player = new Player();
  coins = 500;
  keys: Record<ChestTier, number> = Object.fromEntries(
    CHEST_TIERS.map((t) => [t, 0]),
  ) as Record<ChestTier, number>;
  inventory: Item[] = [];
  stats = freshStats();
  /** Deepest floor unlocked for a direct dive; you always earn the next one by clearing. */
  maxUnlockedDepth = 1;
  /** Potions carried into a dive. Refilled by picking them up in the dungeon. */
  potions = 3;
  private readonly rng = new Rng();

  static INVENTORY_CAP = 200;

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

  buyKey(tier: ChestTier, count = 1): boolean {
    const cost = CHESTS[tier].price * count;
    if (!this.spendCoins(cost)) return false;
    this.keys[tier] += count;
    return true;
  }

  /**
   * Opens `count` chests of `tier`, returning what dropped. Rarity weights are the
   * chest's multipliers applied to the base odds; item level tracks your deepest run
   * so chests stay relevant as you progress.
   */
  openChests(tier: ChestTier, count = 1): Item[] {
    const available = Math.min(count, this.keys[tier]);
    if (available <= 0) return [];
    this.keys[tier] -= available;

    const weights = {} as Record<Rarity, number>;
    for (const r of RARITIES) weights[r] = BASE_RARITY_WEIGHTS[r] * CHESTS[tier].weights[r];

    const ilvl = Math.max(1, this.stats.deepestDepth);
    const found: Item[] = [];
    for (let i = 0; i < available; i++) {
      const rarity = this.rng.weighted(weights);
      const type = this.rng.pick(ITEM_TYPES) as ItemType;
      const item = rollItem({ rarity, type, ilvl, rng: this.rng });
      found.push(item);
      this.stats.raritiesFound[rarity]++;
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
      for (const it of dumped) this.addCoins(it.value);
      this.stats.itemsSold += dumped.length;
    }
  }

  sell(ids: readonly string[]): number {
    const idSet = new Set(ids);
    let total = 0;
    this.inventory = this.inventory.filter((it) => {
      if (!idSet.has(it.id)) return true;
      total += it.value;
      return false;
    });
    if (total > 0) {
      this.addCoins(total);
      this.stats.itemsSold += idSet.size;
    }
    return total;
  }

  equipFromInventory(id: string): boolean {
    const idx = this.inventory.findIndex((it) => it.id === id);
    if (idx < 0) return false;
    const item = this.inventory[idx]!;
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

  recordDepth(depth: number): void {
    if (depth > this.stats.deepestDepth) this.stats.deepestDepth = depth;
    if (depth + 1 > this.maxUnlockedDepth) this.maxUnlockedDepth = depth + 1;
  }

  // --- persistence -------------------------------------------------------

  toJSON(): object {
    return {
      coins: this.coins,
      keys: this.keys,
      potions: this.potions,
      maxUnlockedDepth: this.maxUnlockedDepth,
      stats: this.stats,
      inventory: this.inventory,
      player: {
        level: this.player.level,
        xp: this.player.xp,
        health: this.player.health,
        equipment: this.player.equipment,
      },
    };
  }

  save(): void {
    saveRaw(this.toJSON());
  }

  static load(): GameState {
    const state = new GameState();
    const raw = loadRaw() as ReturnType<GameState["toJSON"]> | null;
    if (!raw) return state;

    try {
      const d = raw as Record<string, unknown>;
      state.coins = Number(d.coins ?? state.coins);
      state.potions = Number(d.potions ?? state.potions);
      state.maxUnlockedDepth = Number(d.maxUnlockedDepth ?? 1);
      state.keys = { ...state.keys, ...(d.keys as Record<ChestTier, number>) };
      state.stats = { ...freshStats(), ...(d.stats as RunStats) };
      state.inventory = (d.inventory as Item[]) ?? [];

      const p = d.player as Record<string, unknown> | undefined;
      if (p) {
        state.player.level = Number(p.level ?? 1);
        state.player.xp = Number(p.xp ?? 0);
        state.player.equipment = { ...emptyEquipment(), ...(p.equipment as object) };
        state.player.health = Number(p.health ?? state.player.maxHealth);
      }
      primeItemIds([...state.inventory, ...Object.values(state.player.equipment).filter(Boolean) as Item[]]);
    } catch {
      // A save from a broken build shouldn't brick the game — fall back to a new one.
      return new GameState();
    }
    return state;
  }
}
