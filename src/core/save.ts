/**
 * Bump when the persisted shape changes. Older saves are handed to the loader with
 * their version attached so it can fill in what's new, rather than wiping somebody's
 * progress because the game grew a mana bar.
 *
 * Version 4 added classes, the skill tree and the modifier system; items from a
 * version 3 save are translated in `normalizeItem` rather than dropped.
 *
 * Version 5 added the settings block; an older save simply loads the defaults.
 *
 * Version 6 added gems, the cosmetic wardrobe and a character appearance. A version 5
 * character loads with no gems, an empty wardrobe and the default look, which is
 * exactly what a brand new one gets — nothing is lost.
 *
 * Version 7 added planets, materials and the Challenger dial. An older save loads with
 * every planet's ladder reset to tier one, an empty materials bag and Challenger off —
 * again exactly what a new character starts with.
 *
 * Version 8 added the mouse control scheme, the right-click binding and rebindable
 * keys. An older save loads with mouse aim on (the new default) and every key at its
 * original default — `normalizeSettings` fills all of it in the same way a version 5
 * save gets the rest of the settings block for free.
 *
 * Version 9 made movement and menu navigation (WASD, confirm, cancel, tab switching,
 * pause) rebindable too — previously the one set of keys that could never be reassigned.
 * An older save's `keybinds` object simply doesn't mention them yet, and the same
 * generic per-action loop in `normalizeSettings` that already filled in a missing combat
 * binding fills these in at their original defaults exactly the same way.
 *
 * Version 10 gave every class its own level, XP, tree, equipped skills and gear instead
 * of one character shared across whichever class you happened to be playing. An older
 * save's single `player` object is folded into `players` keyed by whichever class it
 * belonged to; every other class starts at level 1 with an empty tree and empty hands,
 * exactly like a brand new character would.
 *
 * Version 11 gave each class its own `deepestDepth`, separate from the account-wide
 * record stat, because chests and the forge roll item level against it — without a
 * per-class value, a fresh alt's chest openings were rolling gear at the main's depth
 * and the new level lock correctly refused to let it wear any of it. A save from
 * version 10 has no such field per class; it's estimated from that class's own level
 * (`level - 1`, since item level and character level already track roughly 1:1) rather
 * than inherited from the shared record, which would reproduce the same bug on load.
 *
 * Version 12 added multiplayer, which needed exactly one new persisted field: the name
 * the rest of the party sees over your head. An older save loads with it empty and the
 * Multiplayer screen asks for one the first time you open a room.
 *
 * Version 13 promoted holy, arcane and nature from combat-only damage types into full
 * elements — each grew a damage and resist modifier key, a crafting material and an
 * essence. An older save has no holy/arcane/nature materials (the bag merges with a
 * fresh `emptyMaterials()`, so they load at zero) and no holy/arcane/nature resist
 * rolls on its gear (the modifier record fills missing keys with zero). Nothing is
 * lost; a version 12 character simply starts with none of the new materials, exactly
 * like a brand new one.
 *
 * Version 14 replaced the whole class layer — 15 hand-written `HeroClass`es with a fixed
 * `SkillId` pool and one `UltimateId` each — with the 21-class progression system
 * (`src/progression`): every class is a resource model, ten abilities, and a five-path
 * behaviour tree. A pre-v14 character keeps its per-class level, XP, deepest depth and
 * equipped gear, plus everything account-wide (stash, coins, materials, cosmetics,
 * stats, settings). What it loses is the build: the old tree `allocated` node ids and
 * the old equipped `skills` mean nothing in the new system, so both are cleared and the
 * class's first abilities are auto-slotted, exactly as for a fresh character. The town
 * shows a one-time "your build was reset — N points to spend" notice
 * (`GameState.treePointsRefunded`). An old `item.grant` (a legacy `SkillId`) is dropped
 * on load by `normalizeItem`, since the ability ids it named no longer exist.
 *
 * Version 15 added the Universal Skill Tree (UAT §18) — a second, account-wide tree every
 * class shares. It needed one new persisted field per character
 * (`Player.universalAllocated`), and nothing else: the point *pool* it spends from is
 * derived on the fly from the account record depth by `universalPointsFor`, so there is
 * no earned-points counter to persist or migrate. A version 14 save loads with the
 * allocation empty — exactly what a brand new character gets — and the pool it can then
 * spend is whatever its record depth already earned, so an existing character opens the
 * new screen with points waiting rather than having to go and re-earn them.
 *
 * Version 16 added the daily Vigil (UAT §17): one `daily.clearedDay` field. An older save
 * has simply never closed one.
 *
 * Version 17 added named items (UAT §28/§29): one new field per item, `named`, holding the
 * id of the `data/named.ts` definition a copy was forged from, or null for ordinary gear.
 * An item from an older save has no such field and loads as ordinary (`normalizeItem`
 * fills `null`); a copy whose definition has since been retired keeps every stat and
 * affix that was baked into it and merely stops being named — the same "drop the id,
 * keep the thing" rule `normalizeAppearance` applies to a removed cosmetic. Because
 * `equipment` already travels on the co-op snapshot via `playerToJSON`, the id crosses
 * the wire for free and a client renders a remote hero's named gear by name and art.
 *
 * Version 18 added endgame class completion — the Proving at the bottom of the Delve
 * (UAT §13/§14, `data/legends.ts`). One new persisted field per character,
 * `Player.legendComplete`, and nothing else: the *gate* is the per-class `deepestDepth`
 * this save already carried, so there is no unlock state to migrate. A version 17 save
 * loads with every class incomplete, which is the truth — the encounter did not exist
 * when it was written. A character that had already banked depth 30 finds its Proving
 * waiting at the bottom on the next dive rather than having to re-earn the trip down.
 *
 * Version 19 added the Forge workbench (UAT §24/§26/§27): one new account-wide field,
 * `ash`, the crafting currency salvaged items return. An older save loads with none, which
 * is what a new account has; nothing else about the shape moved.
 *
 * Version 20 added the weekly Convergence (UAT §17, the Vigil's harder sibling) — one
 * new persisted field, `GameState.weekly.clearedWeek` (0 for never), the same shape as
 * the Vigil's own `daily.clearedDay`. An older save has simply never closed one.
 */
export const SAVE_VERSION = 20;

/**
 * Where a save lives is no longer this file's business. The blob below used to go to
 * `localStorage`; since accounts arrived (`docs/accounts.md`) it goes to the server
 * through `net/savestore.ts`, and what this file owns is the *shape*: the version guard,
 * the serialisation, and the `SaveStore` seam `GameState` writes through. The default
 * store keeps the last blob in memory, which is what tests and tools want.
 */
export interface SavedGame {
  readonly version: number;
  readonly data: Record<string, unknown>;
}

/** Parses a stored blob, refusing one from a newer build than this. Null means "start fresh". */
export function parseSaved(text: string | null | undefined): SavedGame | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { version?: number } | null;
    if (!parsed || typeof parsed !== "object") return null;
    const version = Number(parsed.version ?? 1);
    // A save from the future is not something this build can be trusted to read.
    if (version > SAVE_VERSION) return null;
    return { version, data: parsed as Record<string, unknown> };
  } catch {
    // Corrupt — start fresh rather than crash.
    return null;
  }
}

/** The one string that ever leaves the game: the state's JSON with this build's version. */
export function serializeSave(data: object): string {
  return JSON.stringify({ ...data, version: SAVE_VERSION });
}

export interface SaveStore {
  /** Hand over the latest blob. Cheap to call often; the store decides when it lands. */
  write(json: string): void;
  /** Land whatever is pending. `final` is the tab-closing flavour. */
  flush(final?: boolean): Promise<void>;
  /** Erase the stored save. */
  clear(): Promise<void>;
}

/** Holds the last blob and nothing more — the default, and what the smoke test reads back. */
export class MemorySaveStore implements SaveStore {
  last: string | null = null;
  write(json: string): void {
    this.last = json;
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
  clear(): Promise<void> {
    this.last = null;
    return Promise.resolve();
  }
}
