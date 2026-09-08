const KEY = "lootsim.save.v2";

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
 */
export const SAVE_VERSION = 15;

export interface SavedGame {
  readonly version: number;
  readonly data: Record<string, unknown>;
}

export function loadRaw(): SavedGame | null {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const parsed = JSON.parse(text) as { version?: number } | null;
    if (!parsed || typeof parsed !== "object") return null;
    const version = Number(parsed.version ?? 1);
    // A save from the future is not something this build can be trusted to read.
    if (version > SAVE_VERSION) return null;
    return { version, data: parsed as Record<string, unknown> };
  } catch {
    // Corrupt or unavailable storage (private mode, quota) — start fresh rather than crash.
    return null;
  }
}

export function saveRaw(data: object): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    // Saving is best-effort; a full quota should never interrupt play.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
