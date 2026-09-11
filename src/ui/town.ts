import { combatHints, Input, skillKeys, townHints } from "../core/input";
import { clamp, formatNumber } from "../core/math";
import { challengerMultiplier, challengerName, MAX_CHALLENGER_TIER } from "../data/challenger";
import {
  BANNER_STYLES, bannerStyle, standardLabel, standardsFor, styleOwned, type StandardMark,
} from "../data/standards";
import { CHEST_CATEGORIES, CHESTS, CHEST_TIERS, chestName } from "../data/chests";
import { msUntilShopReset, SHOP_TIERS, SHOP_TIER_IDS, type ShopTierId } from "../data/shop";
import { RecordsClient, type LeaderboardRow, type RecentRow } from "../net/recordsClient";
import {
  AUGMENT_AXES, AUGMENT_BY_ID, augmentAxisLabel, augmentsOnAxis, emptyLoadout,
  loadoutProblems, loadoutSummary, withAugment, type AugmentAxis, type AugmentLoadout,
} from "../data/augments";
import {
  CAPSULES, CAPSULE_TIERS, COSMETICS, COSMETIC_SLOTS, COSMETIC_SLOT_LABELS,
  COSMETICS_BY_ID, EYE_COLORS, HAIR_COLORS, HAIR_STYLES, HAIR_STYLE_LABELS,
  OUTFIT_DYES, SKIN_TONES, wornInSlot, wornWeaponSkin, type CosmeticSlot,
} from "../data/cosmetics";
import {
  ASH_NAME, CRAFTABLE_RARITIES, CRAFT_CATEGORIES, CRAFT_CATEGORY_LABELS, FORGE_OPS, FORGE_OP_INFO,
  CRAFT_ESSENCES, craftBulkCost, craftEssenceCost, requirementLabel, type CraftCategory, type ForgeOp,
} from "../data/crafting";
import { affixRange, forgePossibilities, salvageYield } from "../game/forge";
import { itemMeetsRequirement } from "../data/crafting";
import { modShort } from "../game/item";
import { biomeFor } from "../data/biomes";
import {
  MEMORY_BOONS, MEMORY_BURDENS, MEMORY_OPS, MEMORY_OP_INFO, MEMORY_RARITIES,
  MEMORY_RARITY_CAP, MEMORY_UNLOCK_DEPTH, MEMORY_UNLOCK_HEIGHT, MEMORY_VAULT_CAP,
  memoryConfig, memoryForgetAsh, memoryRarityAllowance,
  memoryModLabel, memoryModMagnitude, memoryOpCost, memoryPairs, memoryRecallCost,
  type MemoryInstance, type MemoryOp,
} from "../data/memories";
import { profileFor } from "../data/depth";
import {
  ELEMENTS, ELEMENT_COLORS, ELEMENT_LABELS, resistFraction, type Element,
} from "../data/elements";
import { MATERIALS } from "../data/materials";
import {
  NAMED_ITEMS, craftRecipeFor, craftableNamed, NAMED_BY_ID, namedSourceLines, type NamedItemDef,
} from "../data/named";
import type { NodeEffect } from "../progression/nodes";
import {
  RELICS, RELIC_BY_ID, RELIC_SLOTS, RELIC_TIER_INFO, relicSourceLines, relicsOfTier, type RelicDef,
} from "../data/relics";
import {
  MODES, RIFT_LORE, RUN_MODES, delveConfig, describeRun, modeUnlocked, riftConfig, type RunConfig,
  type RunModeId,
} from "../data/modes";
import {
  RAIDS, raidConfig, raidLayer, raidTiersOpen, raidUnlocked, type RaidSpec,
} from "../data/raids";
import { towerBiomeFor, towerConfig } from "../data/tower";
import { layerFor, type WorldLayer } from "../data/layers";
import { PLANETS, planetConfig, planetUnlocked, type PlanetSpec } from "../data/planets";
import {
  DAILY_MODIFIERS, DAILY_NAME, DAILY_UNLOCK_DEPTH, dailyConfig, dailyPlan, dailyUnlocked, dayNumber, msUntilReset,
} from "../data/daily";
import {
  WEEKLY_GUARANTEED_RARITY, WEEKLY_MODIFIERS, WEEKLY_NAME, WEEKLY_UNLOCK_DEPTH, weeklyConfig, weeklyPlan,
  weeklyUnlocked, weekNumber, msUntilWeeklyReset,
} from "../data/weekly";
import { trapsFor } from "../data/traps";
import { EQUIP_SLOTS, STAT_KEYS, STAT_LABELS, triggerLine, type EquipSlot } from "../data/items";
import { CLASSES, CLASS_IDS, type ClassId } from "../data/classes";
import { DELVE_BOTTOM, legendName, provingFloor, provingUnlocked } from "../data/legends";
import { previewForRun, type ActivityPreview } from "../data/previews";
import { MOD_KEYS, MOD_LABELS, PERCENT_MODS, type ModKey } from "../data/mods";
import { WEAPONS, type WeaponFamily } from "../data/weapons";
import { RARITIES, RARITY_COLORS, rarityIndex, rarityLabel, type Rarity } from "../data/rarity";
import { MAX_TROPHY_CASES, trophyCaseCost } from "../data/trophies";
import {
  ACTION_LABELS, DEFAULT_KEYBINDS, keyLabel, MOUSE_SECONDARY_LABELS, MOUSE_SECONDARY_OPTIONS,
  REBINDABLE_ACTIONS, SETTING_SPECS, type RebindableAction, type Settings,
} from "../data/settings";
import { SKILL_SLOTS, type FixedChallengerModeId, type Player } from "../game/player";
import {
  ALL_CLASSES, CLASS_BY_ID, classMatrixRow,
  categoryGloss, describeEffects, describeNode, describeNodeLong, pathPointsByName,
  unlockProgress,
  UNIVERSAL_PATH_BLURBS, UNIVERSAL_PATH_COUNT, UNIVERSAL_PATH_DEPTH, UNIVERSAL_PATH_NAMES,
  UNIVERSAL_TREE, UNIVERSAL_UNLOCKS, isCrossLinked,
  type DescribeCtx, type PilotClass, type PathUnlockDef, type TreeNodeV2,
} from "../progression/index";
import type { Ability } from "../combat/ability";

/** Tree shape after the class refactor: five behaviour paths, five rows deep. */
const TREE_PATH_COUNT = 5;
const TREE_PATH_DEPTH = 5;
/**
 * The universal tree's accent. Every class tree is tinted with the class's own colour;
 * this one belongs to no class, so it gets one fixed colour of its own — which is also
 * the point being made on screen.
 */
const UNIVERSAL_ACCENT = "#7dd3fc";
import { cleanPlayerName } from "../data/settings";
import type { Party } from "../net/party";
import { MAX_PARTY, ROOM_CODE_LENGTH, isRoomCode, normalizeRoomCode } from "../net/protocol";
import { itemMods, itemScore, requiredLevel, statLine, type Item } from "../game/item";
import {
  POTION_CAP, POTION_PRICE, sellPrice, type CapsulePull, type GameState,
} from "../game/state";
import { augmentArt, chestIcon, cosmeticPreview, heroSprite, itemArt, itemArtKey, relicArt, relicArtKey, weaponSprite } from "../render/sprites";
import { ChestRoll } from "./chestroll";
import { pixelImage, pixelImageBody, pixelImageTag } from "./pixelimage";
import { HERO_PORTRAIT_BODY_PX, STYLE_PORTRAIT_BODY_PX } from "./portrait";

/**
 * Reached by walking to a station in the ship hub and never by cycling — the dive, each
 * rift and the star map are destinations, not menu rows. Everything in `CYCLE_TABS` is
 * the Quartermaster's screen, browsed the old way with [I]/[O].
 */
/**
 * The Augment view's rows: the base chest plus one slot per axis, in that order. **The
 * base comes first on purpose** — it is the thing that is always there, and putting it
 * first is what makes "the default is always a Basic chest" visible rather than implied.
 *
 * `null` is the base row; every other row is the axis it edits. One row per axis is the
 * whole of conflict resolution: two element augments cannot both be slotted because there
 * is one element row.
 */
const AUGMENT_SLOTS: readonly (AugmentAxis | null)[] = [null, ...AUGMENT_AXES];

/** One past the last real category: the Augment view. */
const AUGMENT_CATEGORY = CHEST_CATEGORIES.length;

const CYCLE_TABS = [
  "Chests", "Shop", "Stash", "Hero", "Skills", "Tree", "Universal", "Path", "Style",
  "Standards", "Capsules", "Codex", "Records", "Leaderboards", "Settings",
] as const;
const STATION_TABS = [
  "Dive", "Tower", "Rifts", "StarMap", "Raid", "Craft", "Altar", "Party", "Vigil",
  "Convergence", "Trophy",
] as const;
type StationTab = (typeof STATION_TABS)[number];
export type Tab = (typeof CYCLE_TABS)[number] | StationTab;

const STATION_LABELS: Record<StationTab, string> = {
  Dive: "THE DELVE", Rifts: "RIFT PORTAL", StarMap: "THE ASHEN RELIQUARY", Craft: "THE FORGE",
  Party: "COMMS RELAY", Vigil: "THE VIGIL", Convergence: "THE CONVERGENCE",
  Tower: "THE TOWER", Raid: "THE WAR TABLE",
  Altar: "THE ALTAR", Trophy: "THE TROPHY HALL",
};

/** The glyph an empty paper-doll slot shows in place of an item icon. */
const SLOT_GLYPH: Record<EquipSlot, string> = {
  weapon: "⚔", armor: "🛡", shield: "◈", ring: "◍", gloves: "✋", necklace: "❈",
};

/**
 * Slots UAT §12 names as coming later, shown on the paper-doll as real but locked so the
 * character sheet reads like a character sheet with room to grow rather than a short list
 * that will one day get longer.
 *
 * Declared here rather than spelled out inline at the call site so that turning one of
 * these on is deleting a row from this list and adding it to `EQUIP_SLOTS` — not editing
 * a render function. The three relic slots in particular are being built on their own
 * branch; when they arrive they should replace their rows here, and the layout question
 * (a ring around the portrait versus the current flanking columns) is a deliberate
 * coordination point rather than something to guess at.
 *
 * `glyph` matches the visual language of `SLOT_GLYPH` above: one flat, dim mark.
 */
const FUTURE_SLOTS: readonly { readonly label: string; readonly glyph: string }[] = [
  { label: "helmet", glyph: "⌂" },
  { label: "boots", glyph: "⊻" },
  { label: "off-hand", glyph: "◇" },
  // The three relic slots §12 also promised went live with UAT §19 (`relicSlot`).
];

/**
 * The style screen, top to bottom: the four things everybody gets for free, then one
 * row per cosmetic slot. Free choices first on purpose — a brand new character with an
 * empty wardrobe still has a screen worth visiting.
 */
/** One row of the Comms Relay screen. Out of a room it's the top three; in one, the rest. */
type PartyRow =
  | { readonly kind: "name" | "host" | "join" | "code" | "plan" | "leave" }
  | { readonly kind: "member"; readonly index: number };

type StyleRow =
  | { readonly kind: "hairStyle" }
  | { readonly kind: "hair" | "skin" | "eyes" | "dye" }
  | { readonly kind: "slot"; readonly slot: CosmeticSlot };

const STYLE_ROWS: readonly StyleRow[] = [
  { kind: "hairStyle" },
  { kind: "hair" },
  { kind: "skin" },
  { kind: "eyes" },
  { kind: "dye" },
  ...COSMETIC_SLOTS.map((slot) => ({ kind: "slot", slot }) as const),
];

/** A bound key's live label, for anywhere in the town screen that names one — never a
 *  hardcoded letter, since every one of these is rebindable now. */
/** "5h 12m", for the Vigil's reset countdown. */
function formatCountdown(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function k(settings: Settings, action: RebindableAction): string {
  return keyLabel(settings.keybinds[action] ?? DEFAULT_KEYBINDS[action]);
}

/**
 * Per-tab footer legend. E is always the primary action (confirm), Q the secondary
 * (cancel), W/S select (up/down) and A/D adjust (left/right) — built from the live
 * bindings rather than hardcoded, since a rebind has to move this legend too, the same
 * rule `combatHints` follows for the dungeon HUD.
 */
/** The Forge's three screens: an ordinary craft, a reforge, and the named-item recipes (UAT §25). */
type ForgeMode = "craft" | "reforge" | "named";
/** The Altar's three screens, in the order [I]/[O] walk them. */
const ALTAR_MODES = ["vault", "recall", "workbench"] as const;
type AltarMode = (typeof ALTAR_MODES)[number];
const FORGE_MODES: readonly ForgeMode[] = ["craft", "reforge", "named"];

/**
 * The workbench's eleven ops read as a wall when they're one flat row — this is purely
 * presentational grouping (docs/forge.md's own table order, unchanged), so `FORGE_OPS`
 * stays the one list `tertiary()`'s cycle and every other lookup walks.
 */
const FORGE_OP_GROUPS: readonly { label: string; ops: readonly ForgeOp[] }[] = [
  { label: "Reroll", ops: ["reforge", "temper", "recast", "augment"] },
  { label: "Granted skill", ops: ["inscribe", "rescribe", "eraseGrant"] },
  { label: "Trigger", ops: ["awaken", "eraseTrigger"] },
  { label: "Rarity", ops: ["ascend"] },
  { label: "Destroy", ops: ["salvage"] },
];

function tabHelp(
  tab: Tab, s: Settings, forgeMode: ForgeMode = "craft", stashMarked = 0,
  altarMode: AltarMode = "vault", augmentView = false,
): string {
  const sel = `${k(s, "up")}/${k(s, "down")}`;
  const adj = `${k(s, "left")}/${k(s, "right")}`;
  const e = k(s, "confirm");
  const q = k(s, "cancel");
  const semi = k(s, "special"); // menus reuse the ultimate key as a "tertiary" action
  const mark = k(s, "mark");
  const salvageAll = k(s, "salvageAll");
  const forgeToggle = `${k(s, "tabPrev")}/${k(s, "tabNext")}`;
  const altarToggle = forgeToggle;
  switch (tab) {
    case "Dive": return `${sel} choose depth · ${e} dive · ${q} buy a potion · `
      + `walk down to Challenger, ${adj} to set it`;
    case "Tower": return `${sel} choose height · ${e} climb · ${q} buy a potion · `
      + `walk down to Challenger, ${adj} to set it`;
    case "Rifts": return `${sel} choose tier · ${adj} switch rift, or set Challenger from its row · ${e} open the rift`;
    case "StarMap": return `${sel} choose tier · ${adj} switch sector, or set Challenger from its row · `
      + `${e} open a portal for it`;
    case "Raid": return `${sel} choose tier · ${adj} switch raid, or set Challenger from its row · ${e} open a portal for it`;
    case "Vigil": return `${e} keep the Vigil · the same floor for everyone today · one key for closing it`;
    case "Convergence": return `${e} open the Convergence · the same four floors for everyone this week · a warden and a real prize at the end`;
    case "Altar": return altarMode === "recall"
      ? `${sel} choose a rarity · ${e} recall a Memory · ${altarToggle} switch screen`
      : altarMode === "workbench"
        ? `${sel} choose a Memory · ${semi} cycle the operation · ${e} do it · ${altarToggle} switch screen`
        : `${sel} choose a Memory · ${e} open its portal back at the Citadel · ${altarToggle} switch screen`;
    case "Craft": return forgeMode === "reforge"
      ? `${sel} / ${adj} choose an item, then walk down onto the workbench for its operations · `
        + `${semi} cycle the operation · ${q} cycle the affix · ${e} or the confirm button runs it `
        + `(clicking an item only picks it) · ${forgeToggle} switch to named recipes`
      : forgeMode === "named"
        ? `${sel} choose a named item · ${e} forge it for exactly what it says · ${forgeToggle} switch to crafting`
        : `${sel} choose rarity · ${adj} essence · ${semi} category · ${e} craft · ${q} clear essence · ${forgeToggle} switch to reforging`;
    case "Party": return `${sel} select · ${e} do it · then the host walks into a portal and picks, and everyone walks into that portal`;
    case "Trophy": return `${sel} choose a case · ${e} buy, place or clear it · ${q} back out of the stash picker`;
    case "Chests": return augmentView
      ? `${sel} pick a slot · ${adj} change what's in it · ${e} open · ${q} buy a key · ${semi} clear`
      : `${sel} switch category · ${adj} browse chests · ${e} open · ${q} buy key · ${semi} bulk 1↔10`;
    case "Shop": return `${sel} / ${adj} move · up onto the tabs to switch tier · ${e} buy · ${q} reroll this slot`;
    case "Stash": return `${sel} / ${adj} move · up onto the bar to filter by rarity · ${e} equip · ${q} sell one`
      + ` · ${mark} mark for a batch, or click a card's checkbox · `
      + (stashMarked > 0 ? `${semi} salvage ${stashMarked} marked` : `${semi} sell all junk · ${salvageAll} salvage all junk`);
    case "Hero": return `${sel} / ${adj} move — the relic row too · ${e} unequip, or open the relic picker on an empty one · ${q} back out of the picker`;
    case "Skills": return `${sel} / ${adj} move · up onto the bar to pick which slot, ${adj} to switch it · `
      + `${e} or click a card to set it there · ${q} clear the active slot`;
    case "Tree": return `${sel} walk a branch · ${adj} switch branch · ${e} spend a point · ${q} refund everything`;
    case "Universal": return `${sel} walk a path · ${adj} switch path · ${e} spend a point · ${q} refund it all — shared by every class`;
    case "Path": return `${sel} choose a class · ${e} commit to it`;
    case "Style": return `${sel} choose · ${adj} change · ${e} next · ${q} take it off`;
    case "Standards": return `${sel} choose a mark or a cloth · ${e} fly it, wear it or buy it`;
    case "Capsules": return `${sel} choose capsule · ${e} open · ${adj} bulk 1↔10`;
    case "Codex": return `${sel} browse the class roster · ${adj} switch view — the full 21-class design; play one from the Path tab`;
    case "Records": return "Nothing to do here — just numbers.";
    case "Leaderboards": return `${adj} switch board · ${semi} switch class filter · self-reported, no anti-cheat`;
    case "Settings": return `${sel} select · ${e} toggle/rebind · ${q} resets a key/backs out · reset progress asks twice`;
  }
}

// "planet" is rift-shaped internally (fixed floors, a boss, tier scaling) but it isn't
// a selectable rift flavor — it's the mechanical shell every Reliquary expedition borrows.
// The Rifts screen only ever shows the two the player actually picks between.
// The planet shell, the daily Vigil and the weekly Convergence are rift-*shaped* but
// have their own screens.
const RIFT_MODES = RUN_MODES.filter((m) => MODES[m].isRift && m !== "planet" && m !== "vigil" && m !== "convergence");

/**
 * The Leaderboards screen's board list (`docs/leaderboards.md`), in A/D cycling order.
 * Board ids match `tools/accounts.ts`'s allowlist exactly — a new one needs a line here,
 * a line there, and a line in `src/net/records.ts`'s `computeRecords`, the same three-way
 * duplication the shop's `ShopRarity` already accepted as the cost of not sharing runtime
 * code between the server and the client's pure math. Reliquary sectors are deliberately
 * not here yet — see the design doc's "not built" section. `"recent"` is not a real
 * server-side board: it's the flavour ticker, handled as its own case in
 * `renderLeaderboards`.
 */
const LEADERBOARD_BOARDS: readonly { readonly id: string; readonly label: string }[] = [
  { id: "delve", label: "The Delve — deepest floor" },
  { id: "tower", label: "The Tower — highest floor" },
  { id: "abyss", label: "Abyssal Rift — Challenger tier" },
  { id: "hoard", label: "Avarice Rift — Challenger tier" },
  { id: "vigil", label: "The Vigil — Challenger tier" },
  { id: "convergence", label: "The Convergence — Challenger tier" },
  { id: "memory", label: "A Memory — Challenger tier" },
  ...RAIDS.map((r) => ({ id: `raid.${r.id}`, label: `Raid — ${r.name}` })),
  { id: "item.score", label: "Strongest item in the game" },
  { id: "damage.max", label: "Highest recorded max hit" },
  { id: "recent", label: "Recent records" },
];

const LEADERBOARD_CLASS_FILTERS: readonly (ClassId | "all")[] = ["all", ...CLASS_IDS];

/** One leaderboard row's value, in the terms that board actually measures — never a bare
 *  number, per the "hardest thing actually done" rule every board here is built on. */
function formatLbValue(board: string, value: number, tier: number, meta: Readonly<Record<string, string | number>>): string {
  if (board === "delve" || board === "tower") {
    return tier > 0 ? `depth ${value} (Challenger ${challengerName(tier)})` : `depth ${value}`;
  }
  if (board === "item.score") {
    const rarity = String(meta.rarity ?? "");
    return `${String(meta.name ?? "an item")}${rarity ? ` (${rarity})` : ""} — score ${formatNumber(Math.round(value))}`;
  }
  if (board === "damage.max") return `${formatNumber(Math.round(value))} in one hit`;
  // Every other board's value already *is* the Challenger tier (a fixed-length activity's
  // one honest number — see `Player.challengerBadges`'s own doc comment).
  return value > 0 ? challengerName(value) : "Challenger off";
}

/**
 * The recommended-level figure every commit screen shows (docket §25) — one function, so
 * the two-number reading can never fork into a second copy of the comparison at a call
 * site that forgets it. Reads the same as before (`lv 18`) whenever the Challenger dial
 * hasn't moved anything; once it has, shows the floor's own advice alongside what the
 * dial actually asks of you right now (`lv 18 → 22`), so a player can tell how much of
 * the number in front of them is the depth and how much is a knob they turned themselves.
 */
function levelLabel(p: { recommendedLevel: number; baseRecommendedLevel: number }): string {
  return p.baseRecommendedLevel === p.recommendedLevel
    ? `lv ${p.recommendedLevel}`
    : `lv ${p.baseRecommendedLevel} → ${p.recommendedLevel}`;
}

function lbBoardLabel(board: string): string {
  return LEADERBOARD_BOARDS.find((b) => b.id === board)?.label ?? board;
}

/**
 * The town hub: dive selection, rift tiers, chest gambling, stash, equipment, skills
 * and lifetime stats. Rendered as DOM because it's menu-shaped, but driven entirely
 * from the keyboard — mouse clicks are a convenience mirror of the key actions, never
 * the only route.
 */
export class TownUI {
  private tab: Tab = "Dive";
  private cursor = 0;
  private bulk = false;
  /**
   * Which of `CHEST_CATEGORIES` the chest shop's carousel is showing — or
   * `AUGMENT_CATEGORY`, one past the end, which is the Augment view (`docs/augments.md`
   * §6). A category rather than a separate tab because the brief asked for it "in the
   * chests", and because a loadout without a chest under it is not a thing you can open.
   */
  private chestCategory = 0;
  /** Which `SHOP_TIER_IDS` entry the Shop screen is showing — left/right cycles it. */
  private shopTier: ShopTierId = "daily";
  /** Leaderboards screen state (`docs/leaderboards.md`). `lbBoardIdx` indexes
   *  `LEADERBOARD_BOARDS`, A/D cycles it; `lbClassFilter` is `;`'s cycle. `lbKey` is the
   *  (board, class) pair the currently-cached rows answer — `renderLeaderboards` compares
   *  it every render and kicks off a fresh fetch the moment either changes, so switching
   *  board or filter needs no separate wiring anywhere else. */
  private lbBoardIdx = 0;
  private lbClassFilter: ClassId | "all" = "all";
  private lbKey = "";
  private lbFetchToken = 0;
  private lbLoading = false;
  private lbError: string | null = null;
  private lbRows: LeaderboardRow[] | null = null;
  private lbRecent: RecentRow[] | null = null;
  /**
   * The augment loadout being assembled. **Reset to a Basic chest every time the view is
   * entered**, which is a rule and not a default (§5.2): augments never require an
   * expensive chest, or the moment this whole system was designed around arrives with a
   * shopping trip attached to it.
   */
  private loadout: AugmentLoadout = emptyLoadout();
  private rarityFilter: Rarity | "all" = "all";
  private riftMode: RunModeId = "hoard";
  /** Which Reliquary sector the gate screen is showing. */
  private starMapPlanet: PlanetSpec = PLANETS[0]!;
  /** Which of the four raids the War Table is showing (UAT §15). A/D switches it, the
   *  cursor picks a tier — the Reliquary Gate's shape exactly. */
  private warTableRaid: RaidSpec = RAIDS[0]!;
  /** The Trophy Hall (docket §3): which case is being assigned right now, or null when
   *  the screen is showing the row of cases rather than a stash picker for one of them. */
  private trophyPicking: number | null = null;
  private craftCategory: CraftCategory = "weapon";
  private craftEssence: Element | null = null;
  /** The Stash's mass-salvage: which ids the mouse has checked, and whether the "salvage
   *  them" chip has already been pressed once. `salvageArmed` below is the same idea for
   *  a single worn item on the workbench; this is its bulk, checkbox-driven twin. Cleared
   *  whenever the Stash tab is left, but *not* by ordinary cursor movement inside it —
   *  browsing more cards to add to the pile is the point. */
  private stashSelected = new Set<string>();
  private massSalvageArmed = false;
  /** The Forge is two screens sharing a station: craft something new, or reforge
   *  something already found. Toggled with tabPrev/tabNext, which are otherwise inert
   *  on a station tab. */
  private forgeMode: ForgeMode = "craft";
  /** Which of the Altar's three screens is showing, and which op the workbench is armed
   *  with. Mirrors `forgeMode`/`forgeOp` exactly — it is the same station idiom. */
  private altarMode: AltarMode = "vault";
  private altarOp: MemoryOp = "distort";
  /** The workbench: which op the Reforge screen will apply, and to which affix when it needs one. */
  private forgeOp: ForgeOp = "reforge";
  private forgeAffix = 0;
  /**
   * The workbench moved into its own bar under the item grid (UAT feedback: it was a
   * scrolling sidebar). W/A/S/D still drive one 2-D grid at a time, so this says which
   * one is currently under the cursor — the item cards, or the op bar below them.
   * `navReforge` flips it walking off the bottom row of the cards or the top row of the
   * bar; it's never true while there's no selected item for the bar to act on.
   */
  private workbenchFocus = false;
  /**
   * Salvaging what you're wearing is allowed on purpose (`GameState.salvageItem`'s own
   * comment: "sell it, salvage it, or keep it" is the point of Ash having one source) —
   * but doing it by *accident* to the thing you're wearing isn't. Holds the armed item's
   * id; a second confirm on the same id runs it. Any navigation, or changing the op or
   * affix, disarms it — same "you have to mean it right now" rule as `resetArmed`.
   */
  private salvageArmed: string | null = null;
  /**
   * The same gate for the Altar's `forget`, which destroys a Memory outright and returns
   * Ash — the one op on that bench with nothing to undo it. Holds the armed Memory's id;
   * a second confirm on the same id runs it.
   *
   * Docket §18 exists because a stray click destroyed something, so shipping the
   * select/execute split while leaving one button that consumes a Memory on a single
   * unconfirmed press answers the report halfway. **Red is a colour, not a confirmation.**
   */
  private forgetArmed: string | null = null;
  /**
   * Both arms at once. Salvaging what you're wearing and forgetting a Memory are the same
   * rule — "you have to mean it right now" — so every navigation site drops both rather
   * than each one remembering which gates happen to exist today.
   */
  private disarm(): void {
    this.salvageArmed = null;
    this.forgetArmed = null;
  }
  /** Codex tab: which slice of a class's design the side panel is showing. */
  private codexView: 0 | 1 | 2 = 0;
  /**
   * Skills (docket item 12): which of the three real slots a card click or `confirm`
   * fills. The grid itself (`cursor`, into `abilityPool`) and this are independent axes,
   * exactly like Stash's `rarityFilter` sits beside its own `cursor` — walking up from
   * the top card row (or a pill click) reaches the slot bar, `cursor < 0` means it has
   * focus, and left/right there change this instead of the grid position.
   */
  private skillSlot = 0;
  /**
   * Which relic slot (0-based) the Hero screen is filling from a picker, or `null` when
   * the doll is showing normally. Same shape as `trophyPicking` (docket #11 PM ruling,
   * 2026-09-10): confirming an empty relic slot opens a picker over the whole collection
   * instead of the old "step through candidates with A/D" browse, because A/D on a
   * visually horizontal row (`.doll-locked` is `flex-wrap`) has to move along that row,
   * not adjust something else — the exact complaint this docket item is about, one level
   * deeper. The picker also shows the whole collection at once rather than cycling
   * through it blind.
   */
  private relicPicking: number | null = null;
  /** Which column of the skill tree the cursor is walking down. */
  private treeBranch = 0;
  /** The same, for the universal tree's six paths. Its own field, since the two screens
   *  are browsed independently and switching tabs shouldn't move the other one. */
  private universalBranch = 0;
  private toast: { text: string; color: string; until: number } | null = null;
  /**
   * Wiping the save is the one irreversible thing in the game, so it takes two presses
   * of the same key. Any navigation disarms it — you have to mean it right now.
   */
  private resetArmed = false;
  private lastPulls: Item[] = [];
  /** The last capsule opening, for the Capsules side panel. */
  private lastCapsules: CapsulePull[] = [];
  /** Set every tick from `update()`, so a click handler can reach the same input the
   *  keyboard path uses — rebinding a key needs to intercept the next keydown. */
  private input: Input | null = null;
  /** Which rebindable action is waiting for its next key, while it waits. */
  private rebindPending: RebindableAction | null = null;
  /** The chest slot machine. It owns its own overlay outside `root`'s innerHTML, since
   *  this screen rebuilds itself wholesale on every keypress and an animation can't. */
  private readonly roll: ChestRoll;

  constructor(
    private readonly root: HTMLElement,
    private readonly state: GameState,
    private readonly onDive: (config: RunConfig) => void,
    /** The star map doesn't launch a run itself — it spawns a portal for one back in the hub. */
    private readonly onExpedition: (planet: PlanetSpec, tier: number) => void,
    /** Nor does the War Table (UAT §15) — same contract, one portal per chosen raid. */
    private readonly onRaid: (raid: RaidSpec, tier: number) => void,
    /** Nor does the Altar — picking a Memory spawns its portal back at the Citadel, and
     *  walking into that is what spends it (`docs/memories.md` §7.4). */
    private readonly onMemory: (memoryId: string) => void,
    /** The party, for the Comms Relay screen. It owns the connection; this only shows it. */
    private readonly party: Party,
    /** Settings' "Log out" row. `main.ts` owns what logging out actually does. */
    private readonly onLogout: () => void,
    /** The Leaderboards screen's reads (`docs/leaderboards.md`). Submission is a
     *  background concern owned by `GameState.recordsHook`/`RecordsSubmitter` in
     *  `main.ts` — this screen only ever reads. */
    private readonly records: RecordsClient,
    /** The logged-in account's own name, so the Leaderboards screen can highlight the
     *  viewer's own row — the single highest-value thing on any leaderboard. */
    private readonly username: string,
  ) {
    this.roll = new ChestRoll(this.root.parentElement ?? document.body);

    // The whole screen is clickable, not just a keyboard with a mouse-shaped cursor: a
    // row selects and fires its primary action, a tab switches, and the small
    // adjust/secondary/tertiary buttons sprinkled through the templates mirror A/D, Q
    // and ; exactly. None of it replaces the keyboard path — it's the same handlers.
    this.root.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const tabEl = target.closest<HTMLElement>("[data-tab]");
      if (tabEl) {
        this.tab = tabEl.dataset.tab as Tab;
        this.cursor = 0;
        this.resetArmed = false;
        this.disarm();
        this.workbenchFocus = false;
        this.stashSelected.clear();
        this.massSalvageArmed = false;
        this.rebindPending = null;
        this.render();
        return;
      }
      const catEl = target.closest<HTMLElement>("[data-category]");
      if (catEl) {
        // Through the same setter the keyboard uses, so entering the Augment view resets
        // the loadout by either path rather than only one of them.
        this.setChestCategory(Number(catEl.dataset.category));
        this.render();
        return;
      }
      const shopTierEl = target.closest<HTMLElement>("[data-shop-tier]");
      if (shopTierEl) {
        this.shopTier = shopTierEl.dataset.shopTier as ShopTierId;
        this.cursor = 0;
        this.render();
        return;
      }
      const shopActionEl = target.closest<HTMLElement>("[data-shop-action]");
      if (shopActionEl) {
        if (shopActionEl.dataset.shopAction === "buy") this.primary(); else this.secondary();
        this.render();
        return;
      }
      const lbBoardEl = target.closest<HTMLElement>("[data-lb-board]");
      if (lbBoardEl) {
        this.lbBoardIdx = Number(lbBoardEl.dataset.lbBoard);
        this.render();
        return;
      }
      const lbClassEl = target.closest<HTMLElement>("[data-lb-class]");
      if (lbClassEl) {
        this.lbClassFilter = lbClassEl.dataset.lbClass as ClassId | "all";
        this.render();
        return;
      }
      const augEl = target.closest<HTMLElement>("[data-augment]");
      if (augEl) {
        const id = augEl.dataset.augment!;
        // Clicking one you already have slotted takes it back out — the mouse mirror of
        // cycling the ring back to "empty".
        const axis = AUGMENT_BY_ID[id]?.effect.axis;
        this.loadout = axis && this.loadout[axis] === id
          ? { ...this.loadout, [axis]: null }
          : withAugment(this.loadout, id);
        this.render();
        return;
      }
      const altarModeEl = target.closest<HTMLElement>("[data-altar-mode]");
      if (altarModeEl) {
        this.altarMode = altarModeEl.dataset.altarMode as AltarMode;
        this.cursor = 0;
        this.disarm();
        this.render();
        return;
      }
      const altarOpEl = target.closest<HTMLElement>("[data-altar-op]");
      if (altarOpEl) {
        this.altarOp = altarOpEl.dataset.altarOp as MemoryOp;
        this.disarm();
        this.render();
        return;
      }
      const forgeModeEl = target.closest<HTMLElement>("[data-forge-mode]");
      if (forgeModeEl) {
        this.forgeMode = forgeModeEl.dataset.forgeMode as ForgeMode;
        this.cursor = 0;
        this.disarm();
        this.workbenchFocus = false;
        this.render();
        return;
      }
      const opEl = target.closest<HTMLElement>("[data-forge-op]");
      if (opEl) {
        this.forgeOp = opEl.dataset.forgeOp as ForgeOp;
        this.disarm();
        this.render();
        return;
      }
      // Docket §15: a Forge card selects and does nothing else. The generic `[data-index]`
      // handler at the bottom of this delegate both selects *and* fires `primary()`,
      // which is right for a chest tier or a stash item and catastrophic here — it spends
      // Ash on a one-way operation on a stray click. Executing is `[data-confirm-action]`
      // below, and nothing else on this screen does it.
      // Docket §18: the same split, on the two other screens that browse a list and act
      // on what you picked. Both only ever select; `[data-confirm-action]` executes.
      const altarItemEl = target.closest<HTMLElement>("[data-altar-item]");
      if (altarItemEl) {
        this.cursor = Number(altarItemEl.dataset.altarItem);
        // A different card cannot inherit the last one's armed forget.
        this.disarm();
        this.render();
        return;
      }
      const namedRecipeEl = target.closest<HTMLElement>("[data-named-recipe]");
      if (namedRecipeEl) {
        this.cursor = Number(namedRecipeEl.dataset.namedRecipe);
        this.render();
        return;
      }
      const forgeItemEl = target.closest<HTMLElement>("[data-forge-item]");
      if (forgeItemEl) {
        this.cursor = Number(forgeItemEl.dataset.forgeItem);
        // A different card cannot inherit the last one's armed salvage.
        this.disarm();
        this.workbenchFocus = false;
        this.render();
        return;
      }
      // The one execute path for every screen that separates picking from doing
      // (docket §15, then §18). It calls `primary()` — the same per-tab dispatch the
      // `confirm` key uses — so a screen adopting the action strip cannot invent a
      // second way to run its operation.
      const confirmEl = target.closest<HTMLElement>("[data-confirm-action]");
      if (confirmEl) {
        this.primary();
        this.render();
        return;
      }
      const affixEl = target.closest<HTMLElement>("[data-forge-affix]");
      if (affixEl) {
        this.forgeAffix = Number(affixEl.dataset.forgeAffix);
        this.render();
        return;
      }
      const relicEl = target.closest<HTMLElement>("[data-relic]");
      if (relicEl && this.tab === "Hero" && this.relicPicking !== null) {
        const slot = this.relicPicking;
        this.socketRelicInto(slot, relicEl.dataset.relic!);
        this.relicPicking = null;
        this.cursor = EQUIP_SLOTS.length + slot;
        this.render();
        return;
      }
      const filterEl = target.closest<HTMLElement>("[data-filter]");
      if (filterEl) {
        this.rarityFilter = filterEl.dataset.filter as Rarity | "all";
        this.cursor = 0;
        this.render();
        return;
      }
      // Which Skills slot a card click fills — a pill click just repoints that, the
      // same way a Stash filter pill above only narrows the grid. It never fires
      // `primary()` on its own; a card still has to be clicked (or confirmed) after.
      const skillSlotEl = target.closest<HTMLElement>("[data-skill-slot]");
      if (skillSlotEl) {
        this.skillSlot = Number(skillSlotEl.dataset.skillSlot);
        this.render();
        return;
      }
      const essenceEl = target.closest<HTMLElement>("[data-essence]");
      if (essenceEl) {
        const v = essenceEl.dataset.essence!;
        this.craftEssence = v === "none" ? null : (v as Element);
        this.render();
        return;
      }
      const selectEl = target.closest<HTMLElement>("[data-select]");
      if (selectEl) {
        this.toggleStashSelect(selectEl.dataset.select!);
        this.render();
        return;
      }
      const actionEl = target.closest<HTMLElement>("[data-action]");
      if (actionEl) {
        const action = actionEl.dataset.action!;
        const index = actionEl.dataset.index;
        if (index !== undefined) this.cursor = Number(index);
        switch (action) {
          case "left": this.adjust(-1); break;
          case "right": this.adjust(1); break;
          case "primary": this.primary(); break;
          case "secondary": this.secondary(); break;
          case "tertiary": this.tertiary(); break;
          case "salvageAll": this.salvageAllJunk(); break;
        }
        this.render();
        return;
      }
      // An Augment loadout slot is a thing to *select*, not a row to fire — picking the
      // base chest or an axis is a different action from opening the chest, and the two
      // must not collapse into one click the way the generic `[data-index]` fallback
      // below would (that fallback both selects and calls `primary()`, which is exactly
      // right for a chest card or a stash item but wrong here). Opening lives only in the
      // aside's explicit "confirm · open" chip, handled by the `data-action="primary"`
      // case just above.
      const augSlotEl = target.closest<HTMLElement>("[data-aug-slot]");
      if (augSlotEl) {
        this.cursor = Number(augSlotEl.dataset.augSlot);
        this.render();
        return;
      }
      // A skill-tree node is a grid cell, so a click has to place *both* axes before it
      // fires — the generic row handler below can only move the cursor, which would take
      // the click's row but keep whichever column the keyboard was last on. A screen's
      // second axis gets its own attribute here rather than being packed into a flat
      // index, the same way `data-forge-mode` above is its own attribute: the keyboard
      // path stays the plain `cursor` + branch pair it already was, and both routes end
      // up calling the identical `primary()`.
      const cell = target.closest<HTMLElement>("[data-branch]");
      if (cell) {
        const branch = Number(cell.dataset.branch);
        if (this.tab === "Tree") this.treeBranch = branch;
        else if (this.tab === "Universal") this.universalBranch = branch;
        this.cursor = Number(cell.dataset.index ?? 0);
        this.primary();
        this.render();
        return;
      }
      const row = target.closest<HTMLElement>("[data-index]");
      if (!row) return;
      this.cursor = Number(row.dataset.index);
      this.primary();
      this.render();
    });
  }

  /** Key labels for the skill slots, read live off the current bindings. */
  private get skillKeyLabels(): string[] {
    return skillKeys(this.state.settings);
  }

  /** Opened by walking up to a hub station — `tab` is which one, `riftMode` pins the
   *  rift portal you actually walked into rather than whichever was last selected. */
  show(tab?: Tab, riftMode?: RunModeId): void {
    this.root.hidden = false;
    // A pre-v14 save's tree was built on node ids that no longer exist, so the
    // class-refactor migration cleared every allocation and handed the points back.
    // Say so once, then clear the flag — respec is free, nothing is lost.
    if (this.state.treePointsRefunded > 0) {
      const n = this.state.treePointsRefunded;
      this.state.treePointsRefunded = 0;
      this.state.save();
      this.announce(
        `The class update rebuilt the skill tree. ${n} point${n === 1 ? "" : "s"} refunded — `
          + `spend them however you like, respec is still free.`,
        "#7dd3fc",
      );
    }
    // The Legend became Complete on the dive that just ended (UAT §13). Say it once, on
    // the way back in, then clear the flag — the permanent record is the gold border on
    // the Path tab, not this line.
    const finished = this.state.legendJustCompleted;
    if (finished) {
      this.state.legendJustCompleted = null;
      this.state.save();
      this.announce(
        `${legendName(finished)} is finished. ${CLASSES[finished].name}: the Legend is Complete.`,
        "#fbbf24",
      );
    }
    this.cursor = 0;
    this.resetArmed = false;
    this.disarm();
    this.workbenchFocus = false;
    this.stashSelected.clear();
    this.massSalvageArmed = false;
    // A class is the first real decision in the game, so a new character lands on it
    // no matter which station sent them here.
    this.tab = !this.state.classChosen ? "Path" : (tab ?? this.tab);
    if (riftMode) this.riftMode = riftMode;
    this.render();
  }

  hide(): void {
    // Escape out of town mid-spin and the reels go with it — but the pull still lands in
    // the stash and the side panel, because the chest was already opened when it started.
    this.roll.cancel();
    this.root.hidden = true;
  }

  /**
   * True while a text field in this screen has focus. The screen rebuilds its own
   * innerHTML on almost every event, which would throw away a half-typed room code, so
   * everything that redraws checks here first.
   */
  private get typing(): boolean {
    return document.activeElement instanceof HTMLInputElement && this.root.contains(document.activeElement);
  }

  /** Redraw from outside — the party roster changes on its own schedule, not on a keypress. */
  refresh(): void {
    // A room filling up or emptying changes how many rows this screen has underneath a
    // cursor that was pointing at one of them.
    // Stash, Skills and Shop allow cursor -1 (a bar above the grid, or the tier tabs,
    // has focus); every other tab floors at 0.
    const floor = this.tab === "Stash" || this.tab === "Skills" || this.tab === "Shop" ? -1 : 0;
    this.cursor = Math.max(floor, Math.min(this.cursor, this.rowCount() - 1));
    if (!this.root.hidden) this.render();
  }

  notify(text: string, color = "#e8eef7"): void {
    this.toast = { text, color, until: performance.now() + 3200 };
    if (!this.root.hidden) this.render();
  }

  /** A longer, louder toast for a milestone — a hybrid coming online, a migration notice. */
  announce(text: string, color = "#e8eef7"): void {
    this.toast = { text, color, until: performance.now() + 7000 };
    if (!this.root.hidden) this.render();
  }

  // --- input --------------------------------------------------------------

  update(input: Input): void {
    this.input = input;

    // While the reels are spinning the screen belongs to them and every key means the
    // same thing: skip. That's what makes "hit the button again" work without a second
    // binding — confirm opens the chest, confirm again cuts to the result, confirm once
    // more closes it and you're back on the card ready to open another.
    if (this.roll.active) {
      const nudged = (["confirm", "cancel", "special", "up", "down", "left", "right"] as const)
        .some((a) => input.wasPressed(a));
      if (nudged) this.roll.skip();
      return;
    }

    let dirty = false;

    // Only the Quartermaster's own tabs cycle with [I]/[O] — a station tab (Dive, a
    // rift, the star map, the forge) is a destination you walked to, not a row you
    // browse past, so these are otherwise inert while one of them is open. The Forge is
    // the one exception: it's two screens sharing a station, and [I]/[O] flip between
    // them since there's no CYCLE_TABS row to browse past there anyway.
    if (this.tab === "Craft" && (input.wasPressed("tabNext") || input.wasPressed("tabPrev"))) {
      const step = input.wasPressed("tabNext") ? 1 : -1;
      this.forgeMode = FORGE_MODES[(FORGE_MODES.indexOf(this.forgeMode) + step + FORGE_MODES.length) % FORGE_MODES.length]!;
      this.cursor = 0;
      this.resetArmed = false;
      this.disarm();
      this.workbenchFocus = false;
      dirty = true;
    }
    if (this.tab === "Altar" && (input.wasPressed("tabNext") || input.wasPressed("tabPrev"))) {
      const step = input.wasPressed("tabNext") ? 1 : -1;
      this.altarMode = ALTAR_MODES[(ALTAR_MODES.indexOf(this.altarMode) + step + ALTAR_MODES.length) % ALTAR_MODES.length]!;
      this.cursor = 0;
      this.disarm();
      dirty = true;
    }
    if (input.wasPressed("tabNext")) {
      const i = (CYCLE_TABS as readonly Tab[]).indexOf(this.tab);
      if (i >= 0) {
        this.tab = CYCLE_TABS[(i + 1) % CYCLE_TABS.length]!;
        this.cursor = 0;
        this.resetArmed = false;
        this.disarm();
        this.workbenchFocus = false;
        this.stashSelected.clear();
        this.massSalvageArmed = false;
        dirty = true;
      }
    }
    if (input.wasPressed("tabPrev")) {
      const i = (CYCLE_TABS as readonly Tab[]).indexOf(this.tab);
      if (i >= 0) {
        this.tab = CYCLE_TABS[(i - 1 + CYCLE_TABS.length) % CYCLE_TABS.length]!;
        this.cursor = 0;
        this.resetArmed = false;
        this.disarm();
        this.workbenchFocus = false;
        this.stashSelected.clear();
        this.massSalvageArmed = false;
        dirty = true;
      }
    }

    const count = this.rowCount();

    // Stash, Shop, Skills, the Hero doll and Reforge (Craft's other screen) are real 2-D
    // grids: W/A/S/D walk them in both axes and A/D are spent on nothing but movement.
    // Every other tab — including Hero while a relic picker is open, which is a flat
    // list over the whole collection, the same shape `trophyPicking` already uses —
    // keeps the flat-list model: up/down walk the cursor, left/right adjust whatever
    // that tab adjusts.
    const reforgeGrid = this.tab === "Craft" && this.forgeMode === "reforge";
    const heroDoll = this.tab === "Hero" && this.relicPicking === null;
    if (this.tab === "Stash" || this.tab === "Shop" || this.tab === "Skills" || heroDoll || reforgeGrid) {
      const walk = (dx: number, dy: number) => {
        const moved = this.tab === "Stash" ? this.navStash(dx, dy)
          : this.tab === "Shop" ? this.navShop(dx, dy)
          : this.tab === "Skills" ? this.navSkills(dx, dy)
          : reforgeGrid ? this.navReforge(dx, dy)
          : this.navHero(dx, dy);
        if (moved) { this.resetArmed = false; this.disarm(); dirty = true; }
      };
      if (input.wasPressedOrRepeated("up")) walk(0, -1);
      if (input.wasPressedOrRepeated("down")) walk(0, 1);
      if (input.wasPressedOrRepeated("left")) walk(-1, 0);
      if (input.wasPressedOrRepeated("right")) walk(1, 0);
    } else {
      // Chests is the one screen where up/down don't walk the row the cursor is on —
      // they flip between categories (General, Weapon Specific, ...), because the chests
      // themselves are a left/right carousel within whichever category is showing. The
      // Augment view breaks that shape: it's a stack of loadout slots, not a carousel, so
      // up/down walk *those* rows instead — a direction press must not silently carry you
      // out into the neighbouring category. But `chestCategory` is instance state that
      // outlives this screen (it survives an I/O tab switch and even a dive), so the view
      // still needs a keyboard way out or a keyboard-only player is parked here for good —
      // every key here is safe to rebind specifically because no keyboard state is allowed
      // to lock a player out of a screen. So it wraps at the edges, same as the ordinary
      // category carousel one level up: down on the last slot and up on the first slot
      // leave to the neighbouring category exactly like they would outside the Augment
      // view, everywhere else they walk the slot list. Leaving still isn't a side effect of
      // an arbitrary direction press — it's something you have to walk to the edge to do.
      if (input.wasPressedOrRepeated("down") && count > 0) {
        if (this.tab === "Chests" && !this.augmentView) {
          this.setChestCategory(this.chestCategory + 1);
        } else if (this.augmentView && this.cursor === count - 1) {
          this.setChestCategory(this.chestCategory + 1);
        } else {
          this.cursor = (this.cursor + 1) % count;
        }
        this.resetArmed = false;
        this.disarm();
        dirty = true;
      }
      if (input.wasPressedOrRepeated("up") && count > 0) {
        if (this.tab === "Chests" && !this.augmentView) {
          this.setChestCategory(this.chestCategory - 1);
        } else if (this.augmentView && this.cursor === 0) {
          this.setChestCategory(this.chestCategory - 1);
        } else {
          this.cursor = (this.cursor - 1 + count) % count;
        }
        this.resetArmed = false;
        this.disarm();
        dirty = true;
      }
      if (input.wasPressed("left")) dirty = this.adjust(-1) || dirty;
      if (input.wasPressed("right")) dirty = this.adjust(1) || dirty;
    }
    if (input.wasPressed("confirm")) { this.primary(); dirty = true; }
    if (input.wasPressed("cancel")) { this.secondary(); dirty = true; }
    if (input.wasPressed("special")) { this.tertiary(); dirty = true; }
    if (input.wasPressed("mark")) { this.markHighlighted(); dirty = true; }
    if (input.wasPressed("salvageAll")) { this.salvageAllJunk(); dirty = true; }

    if (this.toast && performance.now() > this.toast.until) {
      this.toast = null;
      dirty = true;
    }
    if (dirty) this.render();
  }

  // --- settings row layout -------------------------------------------------
  // The Settings list is long enough now (toggles, control scheme, right-click,
  // eight rebindable keys, Challenger, reset) that every other method indexes into
  // it the same way these do, rather than re-deriving the offsets each time.
  private get controlSchemeIndex(): number { return SETTING_SPECS.length; }
  private get mouseSecondaryIndex(): number { return SETTING_SPECS.length + 1; }
  private get keybindStartIndex(): number { return SETTING_SPECS.length + 2; }
  private get challengerIndex(): number { return this.keybindStartIndex + REBINDABLE_ACTIONS.length; }
  private get resetIndex(): number { return this.challengerIndex + 1; }
  private get logoutIndex(): number { return this.resetIndex + 1; }
  /** The rebindable action a Settings row indexes to, or null off that stretch. */
  private keybindRowAction(index: number): RebindableAction | null {
    const i = index - this.keybindStartIndex;
    return i >= 0 && i < REBINDABLE_ACTIONS.length ? REBINDABLE_ACTIONS[i]! : null;
  }

  private rowCount(): number {
    switch (this.tab) {
      // +1 on every commit ladder for the Challenger row appended after the last real
      // one — see `challengerRowIndex()`, the single place that index is defined.
      case "Dive": return this.state.maxUnlockedDepth + 1;
      case "Tower": return this.state.maxUnlockedHeight + 1;
      case "Rifts": return this.state.riftTiers[this.riftMode] + 1;
      case "StarMap": return (this.state.planetProgress[this.starMapPlanet.id] ?? 1) + 1;
      case "Raid": return raidTiersOpen(this.warTableRaid, this.state.raidProgress) + 1;
      case "Vigil": return 1;
      case "Convergence": return 1;
      case "Altar": return this.altarMode === "recall"
        ? MEMORY_RARITIES.length
        : this.state.memories.length;
      case "Craft": return this.forgeMode === "reforge"
        ? this.reforgeCandidates().length
        : this.forgeMode === "named" ? craftableNamed().length : CRAFTABLE_RARITIES.length;
      case "Party": return this.partyRows().length;
      case "Trophy": return this.trophyPicking !== null
        ? this.filteredStash().length
        : MAX_TROPHY_CASES;
      // Five loadout slots in the Augment view (the base chest plus one per axis), the
      // category's chests otherwise.
      case "Chests": return this.augmentView
        ? AUGMENT_SLOTS.length
        : CHEST_CATEGORIES[this.chestCategory]!.tiers.length;
      case "Shop": return SHOP_TIERS[this.shopTier].slots;
      case "Stash": return this.filteredStash().length;
      case "Hero": return this.relicPicking !== null
        ? this.relicCandidates().length
        : EQUIP_SLOTS.length + RELIC_SLOTS;
      // The whole learnable pool, not just the three equipped slots (docket item 12) —
      // `navSkills` walks this exact array as the card grid.
      case "Skills": return this.state.player.abilityPool.length;
      case "Tree": return TREE_PATH_DEPTH;
      // Row 0 is the shared root, which sits above the columns and is reachable by
      // walking up out of any of them — exactly what the tree's DAG says it is.
      case "Universal": return UNIVERSAL_PATH_DEPTH + 1;
      case "Path": return CLASS_IDS.length;
      case "Style": return STYLE_ROWS.length;
      case "Standards": return standardsFor(this.state.player, this.state.activeClassId).length + BANNER_STYLES.length;
      case "Capsules": return CAPSULE_TIERS.length;
      case "Codex": return ALL_CLASSES.length;
      case "Records": return 0;
      case "Leaderboards": return 0;
      case "Settings": return this.logoutIndex + 1;
    }
  }

  /**
   * The Delve, the Tower, a rift, the Reliquary and a raid all let you set Challenger
   * right on the commit screen — one more row after the ladder, reusing `rowCount()`
   * (which already carries the +1) so there is exactly one place this index is computed.
   * `null` on every other tab, including Vigil and Convergence: those two still send
   * you to Settings, same as before.
   */
  private challengerRowIndex(): number | null {
    if (this.tab !== "Dive" && this.tab !== "Tower" && this.tab !== "Rifts"
      && this.tab !== "StarMap" && this.tab !== "Raid") return null;
    return this.rowCount() - 1;
  }

  /**
   * The Challenger row itself — same shape as a Settings toggle row, dropped into the
   * bottom of a commit-screen ladder so the dial never needs a second stored value.
   * Clicking anywhere on the row (or landing the cursor on it and pressing confirm)
   * intentionally does *not* dive — `primary()` guards that index on every tab that
   * calls this — only the ◀ / ▶ chips (or the keys they name) change the tier.
   */
  private renderChallengerRow(index: number): string {
    const s = this.state.settings;
    const tier = this.state.challengerTier;
    const on = index === this.cursor;
    return `<div class="group">Challenger</div>
      <div class="row ${on ? "on" : ""}" data-index="${index}">
        <div class="row-main">
          <span class="name" style="color:${tier > 0 ? "#ff2d2d" : "#e8eef7"}">
            ${tier > 0 ? escapeHtml(challengerName(tier)) : "Off"}
          </span>
        </div>
        <div class="row-side" style="color:${tier > 0 ? "#ff2d2d" : "#5a6270"}">
          <span class="chip" data-action="left" data-index="${index}">◀ ${k(s, "left")}</span>
          ${tier}/${MAX_CHALLENGER_TIER}${tier > 0 ? ` · ×${challengerMultiplier(tier).toFixed(1)} danger` : ""}
          <span class="chip" data-action="right" data-index="${index}">${k(s, "right")} ▶</span>
        </div>
      </div>`;
  }

  private adjust(dir: number): boolean {
    const challengerRow = this.challengerRowIndex();
    if (challengerRow !== null && this.cursor === challengerRow) {
      this.state.setChallengerTier(this.state.challengerTier + dir);
      this.state.save();
      return true;
    }
    if (this.tab === "Capsules") {
      this.bulk = dir > 0;
      return true;
    }
    if (this.tab === "Chests") {
      // In the Augment view left/right cycles the focused slot's value rather than walking
      // a carousel: the slot IS the choice, and there is nothing else on the row to walk.
      if (this.augmentView) return this.cycleAugmentSlot(this.cursor, dir);
      const tiers = CHEST_CATEGORIES[this.chestCategory]!.tiers;
      this.cursor = (this.cursor + dir + tiers.length) % tiers.length;
      return true;
    }
    if (this.tab === "Leaderboards") {
      this.lbBoardIdx = (this.lbBoardIdx + dir + LEADERBOARD_BOARDS.length) % LEADERBOARD_BOARDS.length;
      return true;
    }
    if (this.tab === "Path") {
      this.cursor = (this.cursor + dir + CLASS_IDS.length) % CLASS_IDS.length;
      return true;
    }
    if (this.tab === "Codex") {
      this.codexView = (((this.codexView + dir) % 3) + 3) % 3 as 0 | 1 | 2;
      return true;
    }
    if (this.tab === "Style") return this.cycleStyle(this.cursor, dir);
    if (this.tab === "Rifts") {
      const i = RIFT_MODES.indexOf(this.riftMode);
      this.riftMode = RIFT_MODES[clamp(i + dir, 0, RIFT_MODES.length - 1)]!;
      this.cursor = 0;
      return true;
    }
    if (this.tab === "StarMap") {
      const i = PLANETS.indexOf(this.starMapPlanet);
      this.starMapPlanet = PLANETS[clamp(i + dir, 0, PLANETS.length - 1)]!;
      this.cursor = 0;
      return true;
    }
    if (this.tab === "Raid") {
      const i = RAIDS.indexOf(this.warTableRaid);
      this.warTableRaid = RAIDS[clamp(i + dir, 0, RAIDS.length - 1)]!;
      this.cursor = 0;
      return true;
    }
    if (this.tab === "Craft" && this.forgeMode === "craft") {
      // `CRAFT_ESSENCES`, not a list of our own: what the screen offers and what the
      // acceptance gate proves works have to be the same set. See `data/crafting.ts`.
      const options: (Element | null)[] = [null, ...CRAFT_ESSENCES];
      const i = options.indexOf(this.craftEssence);
      this.craftEssence = options[(i + dir + options.length) % options.length] ?? null;
      return true;
    }
    if (this.tab === "Tree") {
      this.treeBranch = clamp(this.treeBranch + dir, 0, TREE_PATH_COUNT - 1);
      return true;
    }
    if (this.tab === "Universal") {
      this.universalBranch = clamp(this.universalBranch + dir, 0, UNIVERSAL_PATH_COUNT - 1);
      return true;
    }
    if (this.tab === "Settings") {
      // The Challenger row has a direction; every other toggle just flips either way.
      if (this.cursor === this.challengerIndex) {
        this.state.setChallengerTier(this.state.challengerTier + dir);
        this.state.save();
        return true;
      }
      if (this.cursor === this.controlSchemeIndex) return this.toggleControlScheme();
      if (this.cursor === this.mouseSecondaryIndex) return this.cycleMouseSecondary(dir);
      if (this.keybindRowAction(this.cursor)) return false; // rebind is E; A/D do nothing here
      if (this.cursor < SETTING_SPECS.length) return this.toggleSetting(this.cursor);
      return false;
    }
    if (this.tab === "Stash") {
      // The ◀ ▶ chips in the aside still adjust the rarity filter for the mouse; the
      // keyboard reaches it by walking up onto the filter bar (see `navStash`).
      this.cycleFilter(dir);
      this.cursor = 0;
      return true;
    }
    return false;
  }

  /** Steps the Stash rarity filter through `all → common → … → unspoken`, clamped. */
  private cycleFilter(dir: number): boolean {
    const options: (Rarity | "all")[] = ["all", ...RARITIES];
    const i = options.indexOf(this.rarityFilter);
    const next = options[clamp(i + dir, 0, options.length - 1)]!;
    if (next === this.rarityFilter) return false;
    this.rarityFilter = next;
    return true;
  }

  /** How many columns the currently-shown card grid is actually laid out in right now
   *  (Stash's, Reforge's or Skills' — they share the `.stash-grid` class and only one is
   *  ever on screen at a time). The grid is `auto-fill`, so this is read back off the
   *  DOM rather than assumed. */
  private stashColumns(): number {
    const grid = this.root.querySelector<HTMLElement>(".stash-grid");
    if (grid) {
      const n = getComputedStyle(grid).gridTemplateColumns
        .split(/\s+/).filter((s) => s.endsWith("px") || s.endsWith("fr") || s.endsWith("%")).length;
      if (n > 0) return n;
    }
    return 5;
  }

  /**
   * 2-D movement across the Stash. `cursor < 0` means the rarity filter bar above the
   * grid has focus — walk up onto it from the top row, A/D there cycle the filter, S
   * drops back into the cards.
   */
  private navStash(dx: number, dy: number): boolean {
    const n = this.filteredStash().length;
    if (n === 0) { this.cursor = -1; return dx !== 0 && this.cycleFilter(dx); }
    if (this.cursor < 0) {
      if (dx !== 0) return this.cycleFilter(dx);
      if (dy > 0) { this.cursor = 0; return true; }
      return false;
    }
    const cols = this.stashColumns();
    let next = this.cursor;
    if (dx !== 0) next = clamp(this.cursor + dx, 0, n - 1);
    else if (dy < 0) next = this.cursor < cols ? -1 : this.cursor - cols;
    else if (dy > 0) next = Math.min(n - 1, this.cursor + cols);
    if (next === this.cursor) return false;
    this.cursor = next;
    return true;
  }

  /**
   * 2-D movement across the Skills grid (docket item 12) — the same shape as
   * `navStash` on purpose: `cursor < 0` means the slot bar above the cards has focus,
   * A/D there step `skillSlot` instead of the grid, S drops back into the cards.
   */
  private navSkills(dx: number, dy: number): boolean {
    const n = this.state.player.abilityPool.length;
    if (n === 0) return false;
    if (this.cursor < 0) {
      if (dx !== 0) {
        const next = clamp(this.skillSlot + dx, 0, SKILL_SLOTS - 1);
        if (next === this.skillSlot) return false;
        this.skillSlot = next;
        return true;
      }
      if (dy > 0) { this.cursor = 0; return true; }
      return false;
    }
    const cols = this.stashColumns();
    let next = this.cursor;
    if (dx !== 0) next = clamp(this.cursor + dx, 0, n - 1);
    else if (dy < 0) next = this.cursor < cols ? -1 : this.cursor - cols;
    else if (dy > 0) next = Math.min(n - 1, this.cursor + cols);
    if (next === this.cursor) return false;
    this.cursor = next;
    return true;
  }

  /**
   * 2-D movement across the Shop. Same shape as `navStash` — `cursor < 0` means the tier
   * tab strip has focus (A/D there cycle `shopTier`, the same tabs `data-shop-tier`
   * clicks hit) and S drops back into the listing grid, which shares `.stash-grid` with
   * the Stash and reads its column count off the same `stashColumns()`. Before this, the
   * Shop tab fell into the flat-list branch below: up/down walked the cursor one slot at
   * a time regardless of the grid's real column count, and A/D were spent entirely on
   * switching tier (`adjust()`'s old Shop case) — the grid itself never took A/D at all.
   */
  private navShop(dx: number, dy: number): boolean {
    const n = SHOP_TIERS[this.shopTier].slots;
    const cycleTier = (dir: number): boolean => {
      const i = SHOP_TIER_IDS.indexOf(this.shopTier);
      this.shopTier = SHOP_TIER_IDS[(i + dir + SHOP_TIER_IDS.length) % SHOP_TIER_IDS.length]!;
      this.cursor = 0;
      return true;
    };
    if (n === 0) { this.cursor = -1; return dx !== 0 && cycleTier(dx); }
    if (this.cursor < 0) {
      if (dx !== 0) return cycleTier(dx);
      if (dy > 0) { this.cursor = 0; return true; }
      return false;
    }
    const cols = this.stashColumns();
    let next = this.cursor;
    if (dx !== 0) next = clamp(this.cursor + dx, 0, n - 1);
    else if (dy < 0) next = this.cursor < cols ? -1 : this.cursor - cols;
    else if (dy > 0) next = Math.min(n - 1, this.cursor + cols);
    if (next === this.cursor) return false;
    this.cursor = next;
    return true;
  }

  /**
   * 2-D movement across the Reforge screen — the card grid, *and* the workbench bar
   * beneath it, as one continuous space rather than a grid plus a separate sidebar.
   * "Down" off the cards' last row drops onto the op bar; "up" off the bar's top row
   * comes back to the cards. Left/right inside the cards is the same column-stepping
   * Stash uses; inside the bar it's `navWorkbenchOps` below.
   */
  private navReforge(dx: number, dy: number): boolean {
    if (this.workbenchFocus) {
      if (dy < 0 && this.workbenchRow() === 0) {
        this.workbenchFocus = false;
        return true;
      }
      return this.navWorkbenchOps(dx, dy);
    }
    const n = this.reforgeCandidates().length;
    if (n === 0) return false;
    const cols = this.stashColumns();
    let next = this.cursor;
    if (dx !== 0) next = clamp(this.cursor + dx, 0, n - 1);
    else if (dy < 0 && this.cursor >= cols) next = this.cursor - cols;
    else if (dy > 0) {
      if (this.cursor + cols >= n) {
        this.workbenchFocus = true;
        return true;
      }
      next = this.cursor + cols;
    }
    if (next === this.cursor) return false;
    this.cursor = next;
    return true;
  }

  /** Which row of its own cluster the current op sits in — 0 is the cluster's top button. */
  private workbenchRow(): number {
    const col = FORGE_OP_GROUPS.findIndex((g) => g.ops.includes(this.forgeOp));
    return col < 0 ? 0 : Math.max(0, FORGE_OP_GROUPS[col]!.ops.indexOf(this.forgeOp));
  }

  /**
   * 2-D movement across the workbench bar's clusters (UAT feedback: it reads as a grid
   * of buttons, so it navigates like one). Columns are `FORGE_OP_GROUPS` in the order
   * they're drawn (Reroll / Granted skill / Trigger / Rarity / Destroy); left/right
   * jumps a cluster and clamps the row to whatever that cluster has, exactly the way
   * `navHero`'s paper-doll columns work. The selected op *is* the focused button — there
   * is no separate "highlighted but not armed" state, same as clicking one today.
   */
  private navWorkbenchOps(dx: number, dy: number): boolean {
    const groups = FORGE_OP_GROUPS;
    let col = groups.findIndex((g) => g.ops.includes(this.forgeOp));
    if (col < 0) col = 0;
    let row = Math.max(0, groups[col]!.ops.indexOf(this.forgeOp));
    if (dx !== 0) {
      col = clamp(col + dx, 0, groups.length - 1);
      row = clamp(row, 0, groups[col]!.ops.length - 1);
    }
    if (dy !== 0) row = clamp(row + dy, 0, groups[col]!.ops.length - 1);
    const next = groups[col]!.ops[row]!;
    if (next === this.forgeOp) return false;
    this.forgeOp = next;
    this.disarm();
    return true;
  }

  /** The Hero paper-doll's two real columns, top to bottom, as they're drawn — so W/S
   *  walk a column and A/D jump between them, instead of the flat slot-index order. */
  private static readonly DOLL_LAYOUT: readonly (readonly EquipSlot[])[] = [
    ["weapon", "armor", "shield"],
    ["gloves", "ring", "necklace"],
  ];

  /**
   * 2-D movement across the Hero paper-doll. The CSS grid (`.doll`'s
   * `grid-template-areas`) is two columns on top of one full-width row — "left centre
   * right" over "locked locked locked", and that bottom row is drawn `flex-wrap` (see
   * `.doll-locked` in styles.css) so the relic slots genuinely sit side by side. The
   * relic slots are the interactive tail of that row (`renderHero`'s
   * `EQUIP_SLOTS.length + i` indices). The old version only knew about the two top
   * columns: any cursor value past `EQUIP_SLOTS.length` fell through
   * `EQUIP_SLOTS[this.cursor] ?? "weapon"` and was silently treated as "weapon", so a
   * relic slot could be clicked into but never reached — or escaped — with the movement
   * keys. This is the same "drop down into a row below the grid" shape `navReforge`
   * already uses for the workbench bar, not a new pattern.
   *
   * A/D walk the relic row exactly like the doll's own columns — a visually horizontal
   * row moving on A/D is the literal thing docket #11 asks for, and an early version of
   * this fix put candidate-browsing on A/D instead (matching what `tabHelp()` used to
   * say); the PM ruling on 2026-09-10 was that A/D must stay on movement here too, and
   * browsing moved to `relicPicking`, a picker screen entered with confirm (mirroring
   * `trophyPicking`) rather than stepped through blind on the doll itself. W/S enter and
   * leave the row.
   */
  private navHero(dx: number, dy: number): boolean {
    const layout = TownUI.DOLL_LAYOUT;
    const relicIndex = this.cursor - EQUIP_SLOTS.length;

    if (relicIndex >= 0) {
      if (dx !== 0) {
        const next = clamp(relicIndex + dx, 0, RELIC_SLOTS - 1);
        if (next === relicIndex) return false;
        this.cursor = EQUIP_SLOTS.length + next;
        return true;
      }
      if (dy < 0) {
        // Back up onto whichever column sits roughly above this relic slot — there's no
        // stored "which column were you last in", so this is an honest nearest-column
        // guess rather than a remembered position, same as landing anywhere else on a
        // full-width row that spans both columns above it.
        const col = clamp(relicIndex, 0, layout.length - 1);
        const bottomRow = layout[col]!.length - 1;
        this.cursor = EQUIP_SLOTS.indexOf(layout[col]![bottomRow]!);
        return true;
      }
      return false; // dy > 0: the relic row is the bottom of the doll, nothing below it
    }

    const cur = EQUIP_SLOTS[this.cursor] ?? "weapon";
    let col = layout.findIndex((c) => c.includes(cur));
    if (col < 0) col = 0;
    let row = Math.max(0, layout[col]!.indexOf(cur));
    if (dx !== 0) col = clamp(col + dx, 0, layout.length - 1);
    if (dy > 0 && row === layout[col]!.length - 1) {
      this.cursor = EQUIP_SLOTS.length; // off the bottom of a column, into the relic row
      return true;
    }
    if (dy !== 0) row = row + dy;
    row = clamp(row, 0, layout[col]!.length - 1);
    const next = EQUIP_SLOTS.indexOf(layout[col]![row]!);
    if (next === this.cursor) return false;
    this.cursor = next;
    return true;
  }

  /**
   * The weapon family in your hand. The wardrobe's weapon-skin row reads and writes the
   * entry for this family and no other — a skin is a weapon, so the only one worth
   * choosing is the one for the weapon you are actually carrying.
   */
  private get skinFamily(): WeaponFamily {
    return this.state.player.weapon.id;
  }

  /**
   * Steps one row of the style screen. The free rows wrap through their palette; a
   * cosmetic slot wraps through everything you own plus "nothing", so taking a hat off
   * is the same gesture as changing it.
   */
  private cycleStyle(index: number, dir: number): boolean {
    const row = STYLE_ROWS[index];
    if (!row) return false;
    const a = this.state.appearance;

    if (row.kind === "slot") {
      const family = this.skinFamily;
      const owned = row.slot === "weapon"
        ? this.state.ownedWeaponSkins(family)
        : this.state.ownedInSlot(row.slot);
      if (owned.length === 0) {
        this.notify(
          row.slot === "weapon"
            ? `No skins for ${WEAPONS[family].name.toLowerCase()} in the wardrobe yet. Open a capsule.`
            : `No ${COSMETIC_SLOT_LABELS[row.slot].toLowerCase()} in the wardrobe yet. Open a capsule.`,
          "#9aa4b2",
        );
        return true;
      }
      const options: (string | null)[] = [null, ...owned.map((c) => c.id)];
      const i = options.indexOf(wornInSlot(a, row.slot, family));
      const next = options[(i + dir + options.length) % options.length] ?? null;
      this.state.wear(row.slot, next, family);
    } else if (row.kind === "hairStyle") {
      const i = HAIR_STYLES.indexOf(a.hairStyle);
      a.hairStyle = HAIR_STYLES[(i + dir + HAIR_STYLES.length) % HAIR_STYLES.length]!;
    } else {
      const len = row.kind === "hair" ? HAIR_COLORS.length
        : row.kind === "skin" ? SKIN_TONES.length
        : row.kind === "eyes" ? EYE_COLORS.length
        : OUTFIT_DYES.length;
      a[row.kind] = (a[row.kind] + dir + len) % len;
    }
    this.state.save();
    return true;
  }

  /** Flips one cosmetic option. Returns true so the caller can treat it as a redraw. */
  private toggleSetting(index: number): boolean {
    const spec = SETTING_SPECS[index];
    if (!spec) return false;
    const on = !this.state.settings[spec.key];
    this.state.settings[spec.key] = on;
    this.notify(`${spec.label}: ${on ? "on" : "off"}`, on ? "#4ade80" : "#9aa4b2");
    this.state.save();
    return true;
  }

  /** Between the original no-mouse game and aiming with the mouse. Either flips it. */
  private toggleControlScheme(): boolean {
    const s = this.state.settings;
    s.controlScheme = s.controlScheme === "mouse" ? "keyboard" : "mouse";
    this.notify(
      s.controlScheme === "mouse" ? "Mouse + keyboard — click or hold to attack, aim with the cursor."
        : "Keyboard only — the mouse does nothing in the dungeon.",
      "#4ade80",
    );
    this.state.save();
    return true;
  }

  private cycleMouseSecondary(dir: number): boolean {
    const options = MOUSE_SECONDARY_OPTIONS;
    const i = options.indexOf(this.state.settings.mouseSecondary);
    const next = options[(i + dir + options.length) % options.length]!;
    this.state.settings.mouseSecondary = next;
    this.notify(`Right click now casts ${MOUSE_SECONDARY_LABELS[next]}`, "#4ade80");
    this.state.save();
    return true;
  }

  /** Asks the input layer to hand back the next physical key instead of acting on it. */
  private beginRebind(action: RebindableAction): void {
    if (!this.input) return;
    this.rebindPending = action;
    this.notify(`Press a key for ${ACTION_LABELS[action]}… (Esc cancels)`, "#7dd3fc");
    this.render();
    this.input.captureNextKey((code) => {
      this.rebindPending = null;
      if (code === "Escape") {
        this.notify("Rebind cancelled.", "#9aa4b2");
        this.render();
        return;
      }
      const binds = this.state.settings.keybinds;
      // Stealing a key from another action swaps them, rather than leaving two actions
      // silently fighting over the same key.
      const clash = REBINDABLE_ACTIONS.find(
        (a) => a !== action && (binds[a] ?? DEFAULT_KEYBINDS[a]) === code);
      if (clash) binds[clash] = binds[action] ?? DEFAULT_KEYBINDS[action];
      binds[action] = code;
      this.input!.refreshBindings();
      this.notify(
        `${ACTION_LABELS[action]} bound to ${keyLabel(code)}`
        + (clash ? ` (swapped with ${ACTION_LABELS[clash]})` : ""),
        "#4ade80",
      );
      this.state.save();
      this.render();
    });
  }

  private resetKeybind(action: RebindableAction): void {
    this.state.settings.keybinds[action] = DEFAULT_KEYBINDS[action];
    this.input?.refreshBindings();
    this.notify(`${ACTION_LABELS[action]} reset to ${keyLabel(DEFAULT_KEYBINDS[action])}`, "#9aa4b2");
    this.state.save();
  }

  private primary(): void {
    // The Challenger row confirms nothing — it's there to be adjusted with ◀ / ▶, not
    // stepped into. Guarded once, here, rather than in each of the four cases below.
    const challengerRow = this.challengerRowIndex();
    if (challengerRow !== null && this.cursor === challengerRow) {
      this.notify(`${k(this.state.settings, "left")} / ${k(this.state.settings, "right")} sets Challenger.`, "#9aa4b2");
      return;
    }
    switch (this.tab) {
      case "Party": {
        this.partyAction(this.partyRows()[this.cursor]);
        break;
      }
      case "Trophy": {
        this.trophyAction();
        break;
      }
      case "Dive": {
        if (!this.requireClass()) break;
        const depth = this.cursor + 1;
        this.state.player.fullHeal();
        this.onDive(delveConfig(depth, this.state.challengerTier));
        break;
      }
      case "Tower": {
        if (!this.requireClass()) break;
        // The gate is the account's *depth* record, the same number the portal on the
        // deck reads — you earn the second direction by holding the first one.
        if (!modeUnlocked(MODES.tower, this.state.stats.deepestDepth)) {
          this.notify(`Reach depth ${MODES.tower.unlockDepth} in the delve first.`, "#ef4444");
          break;
        }
        this.state.player.fullHeal();
        this.onDive(towerConfig(this.cursor + 1, this.state.challengerTier));
        break;
      }
      case "Rifts": {
        if (!this.requireClass()) break;
        const mode = MODES[this.riftMode];
        if (!modeUnlocked(mode, this.state.stats.deepestDepth)) {
          this.notify(`Reach depth ${mode.unlockDepth} in the delve first.`, "#ef4444");
          break;
        }
        const tier = this.cursor + 1;
        this.state.player.fullHeal();
        this.onDive(riftConfig(this.riftMode, tier, 1, this.state.challengerTier));
        break;
      }
      case "Vigil": {
        if (!this.requireClass()) break;
        const day = dayNumber();
        if (!dailyUnlocked(this.state.stats.deepestDepth)) {
          this.notify(`Reach depth ${DAILY_UNLOCK_DEPTH} in the delve first.`, "#ef4444");
          break;
        }
        if (this.state.daily.clearedDay === day) {
          this.notify(`Closed. The next Vigil opens in ${formatCountdown(msUntilReset())}.`, "#9aa4b2");
          break;
        }
        this.state.player.fullHeal();
        this.onDive(dailyConfig(day, this.state.challengerTier));
        break;
      }
      case "Convergence": {
        if (!this.requireClass()) break;
        const week = weekNumber();
        if (!weeklyUnlocked(this.state.stats.deepestDepth)) {
          this.notify(`Reach depth ${WEEKLY_UNLOCK_DEPTH} in the delve first.`, "#ef4444");
          break;
        }
        if (this.state.weekly.clearedWeek === week) {
          this.notify(`Closed. The next Convergence opens in ${formatCountdown(msUntilWeeklyReset())}.`, "#9aa4b2");
          break;
        }
        this.state.player.fullHeal();
        this.onDive(weeklyConfig(week, 1, this.state.challengerTier));
        break;
      }
      case "Raid": {
        if (!this.requireClass()) break;
        const spec = this.warTableRaid;
        if (!raidUnlocked(spec, this.state.frontier)) {
          this.notify(
            `Sealed. Reach ${spec.unlockFrontier} on either ladder — ${escapeHtml(raidLayer(spec)?.name ?? "that layer")} `
            + "has to be yours before it will look at you.", "#ef4444");
          break;
        }
        const tier = Math.min(this.cursor + 1, raidTiersOpen(spec, this.state.raidProgress));
        this.onRaid(spec, tier);
        this.notify(`Portal opened for ${spec.name} T${tier} — find it back at the Citadel.`, "#f472b6");
        break;
      }
      case "StarMap": {
        if (!this.requireClass()) break;
        if (!planetUnlocked(this.starMapPlanet, this.state.planetProgress, this.state.frontier)) {
          this.notify(
            "Sealed. Clear the previous sector's first tier, or reach depth "
            + `${this.starMapPlanet.baseDepth} on either ladder.`, "#ef4444");
          break;
        }
        const tier = this.cursor + 1;
        this.onExpedition(this.starMapPlanet, tier);
        this.notify(`Portal opened for ${this.starMapPlanet.name} T${tier} — find it back at the Citadel.`, "#4ade80");
        break;
      }
      case "Altar": {
        if (!this.requireClass()) break;
        if (!this.state.altarUnlocked) {
          this.notify(
            `The Altar is shut. This character has to have banked depth ${MEMORY_UNLOCK_DEPTH} `
            + `and height ${MEMORY_UNLOCK_HEIGHT} — both ends of the war, on this character.`,
            "#ef4444");
          break;
        }
        if (this.altarMode === "recall") {
          const rarity = MEMORY_RARITIES[this.cursor];
          if (!rarity) break;
          const made = this.state.recallMemory(rarity);
          if (made) {
            this.notify(
              `Recalled: ${rarityLabel(made.rarity)} Memory of ${made.placeId}, depth ${made.depth}.`,
              RARITY_COLORS[made.rarity]);
            this.state.save();
          } else {
            this.notify(
              this.state.memories.length >= MEMORY_VAULT_CAP
                ? "The Vault is full. Spend one, or forget one."
                : "Not enough for that. Recalling costs materials and coins.",
              "#ef4444");
          }
          break;
        }
        const memory = this.state.memories[this.cursor];
        if (!memory) {
          this.notify("Nothing in the Vault. Recall one first.", "#9aa4b2");
          break;
        }
        if (this.altarMode === "workbench") {
          // Forgetting destroys the Memory outright, so the first press only arms it and
          // a second on the same one runs it — the gate salvaging what you're wearing
          // already has. Docket §18 was raised because a stray click destroyed something;
          // a single unconfirmed press on a red button answers that halfway.
          if (this.altarOp === "forget" && this.forgetArmed !== memory.id) {
            this.forgetArmed = memory.id;
            this.notify(
              `That destroys the ${rarityLabel(memory.rarity)} Memory of ${memory.placeId}. `
              + "Confirm again to forget it.", "#ef4444");
            break;
          }
          this.forgetArmed = null;
          const before = memory.rarity;
          const next = this.state.applyMemoryOp(memory.id, this.altarOp);
          if (!next) {
            this.notify("It won't take that. Check the price and what the rarity allows.", "#ef4444");
            break;
          }
          this.notify(
            this.altarOp === "forget"
              ? `Forgotten. ${formatNumber(memoryForgetAsh(before))} ${ASH_NAME} back.`
              : `${MEMORY_OP_INFO[this.altarOp].label}: ${rarityLabel(next.rarity)} Memory of ${next.placeId}.`,
            RARITY_COLORS[next.rarity]);
          this.cursor = clamp(this.cursor, 0, Math.max(0, this.state.memories.length - 1));
          this.state.save();
          break;
        }
        // The Vault: picking is a plan, not a commitment. The Memory is spent when its
        // portal is walked into, back at the Citadel.
        this.onMemory(memory.id);
        this.notify(`Portal opened for that Memory — find it back at the Citadel.`, "#67e8f9");
        break;
      }
      case "Craft": {
        if (this.forgeMode === "reforge") {
          this.workbenchConfirm();
          break;
        }
        if (this.forgeMode === "named") {
          const def = craftableNamed()[this.cursor];
          if (!def) break;
          const made = this.state.craftNamed(def.id);
          if (made) {
            this.notify(`Forged: ${made.name}`, RARITY_COLORS[made.rarity]);
            this.state.save();
          } else {
            this.notify("The recipe asks for more than you have.", "#ef4444");
          }
          break;
        }
        const rarity = CRAFTABLE_RARITIES[this.cursor]!;
        const item = this.state.craftItem(this.craftCategory, rarity, this.craftEssence);
        if (item) {
          this.notify(`${rarityLabel(item.rarity)}: ${item.name}`, RARITY_COLORS[item.rarity]);
        } else {
          this.notify("Not enough materials for that.", "#ef4444");
        }
        break;
      }
      case "Chests": {
        if (this.augmentView) { this.openLoadout(); break; }
        const tier = CHEST_CATEGORIES[this.chestCategory]!.tiers[this.cursor]!;
        const want = this.bulk ? 10 : 1;
        if (this.state.keys[tier] < want) {
          this.notify(
            `Not enough ${chestName(tier)} keys — press ${k(this.state.settings, "cancel")} to buy one.`,
            "#ef4444",
          );
          break;
        }
        // The roll is already resolved — `openChests` decided all of it before anything
        // moved. The reels are only how it gets told, so nothing reaches the side panel
        // or the toast until the animation has actually shown it.
        const found = this.state.openChests(tier, want);
        this.roll.play(
          {
            items: found,
            title: chestName(tier).toUpperCase(),
            color: CHESTS[tier].color,
            skipHint: `${k(this.state.settings, "confirm")} or click — skip`,
          },
          () => {
            this.lastPulls = found;
            const best = found.reduce<Item | null>(
              (b, it) => (!b || rarityIndex(it.rarity) > rarityIndex(b.rarity) ? it : b), null);
            if (best) {
              this.notify(`${rarityLabel(best.rarity)}: ${best.name}`, RARITY_COLORS[best.rarity]);
            }
            this.render();
          },
        );
        break;
      }
      case "Shop": {
        const listings = this.state.shopListings(this.shopTier);
        const listing = listings[this.cursor];
        if (!listing) break;
        if (this.state.shopPurchasesLeft(this.shopTier) <= 0) {
          this.notify(`No purchases left in ${SHOP_TIERS[this.shopTier].name} this period.`, "#ef4444");
          break;
        }
        if (this.state.coins < listing.price) {
          this.notify(`Need ${formatNumber(listing.price)} coins.`, "#ef4444");
          break;
        }
        const bought = this.state.buyShopSlot(this.shopTier, this.cursor);
        if (bought) {
          this.notify(`${rarityLabel(bought.rarity)}: ${bought.name}`, RARITY_COLORS[bought.rarity]);
          this.state.save();
        } else {
          this.notify("Already bought that slot this period.", "#ef4444");
        }
        break;
      }
      case "Stash": {
        const item = this.filteredStash()[this.cursor];
        if (!item) break;
        if (!this.state.equipFromInventory(item.id)) {
          this.notify(
            `Needs level ${requiredLevel(item)} — ${this.state.heroClass.name} is ${this.state.player.level}.`,
            "#ef4444",
          );
          break;
        }
        this.notify(`Equipped ${item.name}`, RARITY_COLORS[item.rarity]);
        this.cursor = clamp(this.cursor, 0, Math.max(0, this.filteredStash().length - 1));
        break;
      }
      case "Hero": {
        if (this.relicPicking !== null) {
          const pick = this.relicCandidates()[this.cursor];
          const slot = this.relicPicking;
          if (pick) this.socketRelicInto(slot, pick.id);
          this.relicPicking = null;
          this.cursor = EQUIP_SLOTS.length + slot;
          break;
        }
        const relicSlot = this.cursor - EQUIP_SLOTS.length;
        if (relicSlot >= 0) {
          const worn = this.state.player.relics[relicSlot];
          if (worn) {
            this.state.unsocketRelic(relicSlot);
            this.notify(`Took off ${RELIC_BY_ID[worn]?.name ?? worn}`);
          } else if (this.relicCandidates().length === 0) {
            this.notify("Nothing to socket yet. Relics are found, not made.", "#9aa4b2");
          } else {
            this.relicPicking = relicSlot;
            this.cursor = 0;
          }
          break;
        }
        const slot = EQUIP_SLOTS[this.cursor]!;
        if (this.state.unequipToInventory(slot)) this.notify(`Unequipped ${slot}`);
        break;
      }
      case "Skills": {
        const p = this.state.player;
        const ab = p.abilityPool[this.cursor];
        if (!ab) break;
        const lv = p.abilityUnlockLevel(ab);
        if (lv > p.level) {
          this.notify(`Not learned yet — unlocks at level ${lv}.`, "#9aa4b2");
          break;
        }
        p.setSkill(this.skillSlot, ab.id);
        this.state.save();
        this.notify(`${ab.name} set on [${this.skillKeyLabels[this.skillSlot] ?? this.skillSlot + 1}]`, this.state.heroClass.color);
        break;
      }
      case "Tree": {
        const p = this.state.player;
        const node = treeNodeAt(p.tree, this.treeBranch, this.cursor);
        if (!node) break;
        if (p.allocated.includes(node.id)) {
          this.notify("Already yours. Points don't come back one at a time.", "#9aa4b2");
        } else {
          const before = unlockIds(p.build);
          if (p.allocate(node)) {
            this.notify(`${node.name} taken`, this.state.heroClass.color);
            // Lighting this node may have crossed a path-pair threshold — a cross-path
            // hybrid, or a three-path Mythic Archetype. That is the real "you unlocked
            // something" moment in the tree, so it gets its own louder line.
            for (const u of p.build.archetypes) {
              if (!before.has(u.id)) {
                this.announce(`Mythic Archetype — ${u.name}. Your kit just changed shape.`, "#ff1493");
              }
            }
            for (const u of p.build.hybrids) {
              if (!before.has(u.id)) {
                this.announce(`Hybrid unlocked — ${u.name}.`, this.state.heroClass.color);
              }
            }
          } else if (p.treePoints < node.cost) {
            this.notify(`Needs ${node.cost} point${node.cost > 1 ? "s" : ""}. Go and earn them.`, "#ef4444");
          } else {
            this.notify("Take the node above it first.", "#ef4444");
          }
        }
        break;
      }
      case "Universal": {
        const p = this.state.player;
        const node = this.universalNodeAt(this.universalBranch, this.cursor);
        if (!node) break;
        if (p.universalAllocated.includes(node.id)) {
          this.notify("Already yours. Points don't come back one at a time.", "#9aa4b2");
          break;
        }
        const before = unlockIds(p.universalBuild);
        if (p.allocateUniversal(node, this.state.universalPoints)) {
          this.notify(`${node.name} taken`, UNIVERSAL_ACCENT);
          for (const u of p.universalBuild.hybrids) {
            if (!before.has(u.id)) this.announce(`${u.name} unlocked.`, UNIVERSAL_ACCENT);
          }
          for (const u of p.universalBuild.archetypes) {
            if (!before.has(u.id)) this.announce(`${u.name} — every basic improved at once.`, "#ff1493");
          }
        } else if (this.state.universalPoints < node.cost) {
          this.notify(
            `Needs ${node.cost} universal point${node.cost > 1 ? "s" : ""}. Go deeper to earn ${node.cost > 1 ? "them" : "one"}.`,
            "#ef4444",
          );
        } else {
          const need = node.requires
            ? UNIVERSAL_TREE.find((n) => n.id === node.requires)
            : undefined;
          this.notify(need ? `Take ${need.name} first.` : "Take the node above it first.", "#ef4444");
        }
        break;
      }
      case "Path": {
        const id = CLASS_IDS[this.cursor]!;
        const cls = CLASSES[id];
        if (this.state.classChosen && this.state.activeClassId === id) {
          this.notify(`You are already playing ${cls.name}.`, cls.color);
          break;
        }
        const wasPlayed = this.state.classChosen;
        const pc = this.state.players[id];
        const returning = pc.level > 1 || pc.xp > 0;
        this.state.chooseClass(id);
        this.notify(
          returning
            ? `${cls.name}, level ${pc.level}. Welcome back.`
            : wasPlayed
              ? `${cls.name}. ${cls.title}. A fresh level 1, gear and all.`
              : `${cls.name}. ${cls.title}.`,
          cls.color,
        );
        break;
      }
      case "Style": {
        this.cycleStyle(this.cursor, 1);
        break;
      }
      case "Standards": {
        this.standardsAction();
        break;
      }
      case "Capsules": {
        const tier = CAPSULE_TIERS[this.cursor]!;
        const want = this.bulk ? 10 : 1;
        const price = CAPSULES[tier].price;
        if (this.state.gems < price) {
          this.notify(`Need ${formatNumber(price)} gems. They drop down there.`, "#ef4444");
          break;
        }
        const pulls = this.state.openCapsules(tier, want);
        this.lastCapsules = pulls;
        const fresh = pulls.filter((p) => !p.dupe);
        if (fresh.length > 0) {
          const best = fresh.reduce((b, p) =>
            rarityIndex(p.cosmetic.rarity) > rarityIndex(b.cosmetic.rarity) ? p : b);
          this.notify(
            `${rarityLabel(best.cosmetic.rarity)}: ${best.cosmetic.name}`,
            RARITY_COLORS[best.cosmetic.rarity],
          );
        } else {
          const refund = pulls.reduce((n, p) => n + p.refund, 0);
          this.notify(`All duplicates. ${formatNumber(refund)} gems back.`, "#9aa4b2");
        }
        break;
      }
      case "Records":
        break;
      case "Settings": {
        if (this.cursor < SETTING_SPECS.length) {
          this.toggleSetting(this.cursor);
          break;
        }
        if (this.cursor === this.controlSchemeIndex) {
          this.toggleControlScheme();
          break;
        }
        if (this.cursor === this.mouseSecondaryIndex) {
          this.cycleMouseSecondary(1);
          break;
        }
        const rebindAction = this.keybindRowAction(this.cursor);
        if (rebindAction) {
          this.beginRebind(rebindAction);
          break;
        }
        if (this.cursor === this.challengerIndex) {
          this.notify(
            `${k(this.state.settings, "left")} / ${k(this.state.settings, "right")} raises or lowers it.`,
            "#9aa4b2",
          );
          break;
        }
        if (this.cursor === this.logoutIndex) {
          this.onLogout();
          break;
        }
        if (!this.resetArmed) {
          this.resetArmed = true;
          this.notify(
            `Press ${k(this.state.settings, "confirm")} again to erase everything. `
            + `${k(this.state.settings, "cancel")} if you'd rather not.`,
            "#ef4444",
          );
          break;
        }
        // `wipe` also gags the save, so the `beforeunload` handler can't put it back.
        // The erase is a server round trip now; reload once it has landed, or the
        // `pagehide` flush would put the old progress straight back.
        void this.state.wipe().finally(() => window.location.reload());
        break;
      }
    }
    this.state.save();
  }

  /** Nothing dives until a class is picked. */
  private requireClass(): boolean {
    if (this.state.classChosen) return true;
    this.tab = "Path";
    this.cursor = 0;
    this.notify("Pick a class first. It changes everything you do down there.", "#ef4444");
    return false;
  }

  private secondary(): void {
    switch (this.tab) {
      case "Trophy": {
        if (this.trophyPicking !== null) {
          this.trophyPicking = null;
          this.cursor = 0;
        }
        break;
      }
      case "Hero": {
        if (this.relicPicking !== null) {
          const slot = this.relicPicking;
          this.relicPicking = null;
          this.cursor = EQUIP_SLOTS.length + slot;
        }
        break;
      }
      // Both ladders sell you a potion on the way in — same belt, same price.
      case "Tower":
      case "Dive": {
        if (this.state.potions >= POTION_CAP) {
          this.notify("Your belt is full. Nine is plenty.", "#9aa4b2");
        } else if (this.state.buyPotion()) {
          this.notify(`Bought a potion — ${this.state.potions} in the belt`, "#4ade80");
        } else {
          this.notify(`Need ${POTION_PRICE} coins for a potion`, "#ef4444");
        }
        break;
      }
      case "Chests": {
        // In the Augment view this key buys a key for the *base* chest, so a loadout can
        // always be paid for without leaving the screen you assembled it on.
        const tier = this.augmentView
          ? this.loadout.base
          : CHEST_CATEGORIES[this.chestCategory]!.tiers[this.cursor]!;
        const count = this.augmentView || !this.bulk ? 1 : 10;
        const cost = CHESTS[tier].price * count;
        if (this.state.buyKey(tier, count)) {
          this.notify(`Bought ${count} ${chestName(tier)} key${count > 1 ? "s" : ""}`, CHESTS[tier].color);
        } else {
          this.notify(`Need ${formatNumber(cost)} coins`, "#ef4444");
        }
        break;
      }
      case "Shop": {
        const cost = this.state.shopNextRerollCost(this.shopTier);
        if (this.state.rerollShopSlot(this.shopTier, this.cursor)) {
          this.notify(`Rerolled for ${formatNumber(cost)} gems`, "#c084fc");
          this.state.save();
        } else {
          this.notify(`Need ${formatNumber(cost)} gems to reroll`, "#ef4444");
        }
        break;
      }
      case "Craft": {
        if (this.forgeMode === "reforge") {
          const item = this.reforgeCandidates()[this.cursor];
          const n = item?.mods.length ?? 0;
          if (n === 0 || !FORGE_OP_INFO[this.forgeOp].needsAffix) {
            this.notify("That operation doesn't pick an affix.", "#9aa4b2");
            break;
          }
          this.forgeAffix = (this.forgeAffix + 1) % n;
          break;
        }
        if (this.forgeMode !== "craft") break;
        if (this.craftEssence === null) {
          this.notify("No essence selected.", "#9aa4b2");
          break;
        }
        this.craftEssence = null;
        this.notify("Essence cleared — a plain craft, cheaper and unbiased.", "#9aa4b2");
        break;
      }
      case "Stash": {
        const item = this.filteredStash()[this.cursor];
        if (!item) break;
        const gained = this.state.sell([item.id]);
        this.notify(`Sold ${item.name} for ${formatNumber(gained)}`, "#fbbf24");
        this.cursor = clamp(this.cursor, 0, Math.max(0, this.filteredStash().length - 1));
        break;
      }
      case "Skills": {
        this.state.player.setSkill(this.skillSlot, null);
        this.notify("Slot cleared", "#9aa4b2");
        break;
      }
      case "Style": {
        const row = STYLE_ROWS[this.cursor];
        if (!row || row.kind !== "slot") {
          this.notify("That one is always on. Cycle it with A and D.", "#9aa4b2");
          break;
        }
        if (wornInSlot(this.state.appearance, row.slot, this.skinFamily) === null) {
          this.notify("Already wearing nothing there.", "#9aa4b2");
          break;
        }
        this.state.wear(row.slot, null, this.skinFamily);
        this.notify(`${COSMETIC_SLOT_LABELS[row.slot]} removed`, "#9aa4b2");
        break;
      }
      case "Settings": {
        const rebindAction = this.keybindRowAction(this.cursor);
        if (rebindAction) {
          this.resetKeybind(rebindAction);
          break;
        }
        if (this.resetArmed) {
          this.resetArmed = false;
          this.notify("Left everything exactly where it was.", "#9aa4b2");
        }
        break;
      }
      case "Tree": {
        const spent = this.state.player.allocated.length;
        if (spent === 0) {
          this.notify("Nothing to refund. The tree is exactly as empty as it looks.", "#9aa4b2");
          break;
        }
        this.state.player.respec();
        this.notify(`Refunded ${spent} nodes. Changing your mind is free.`, "#7dd3fc");
        break;
      }
      case "Universal": {
        const spent = this.state.player.universalAllocated.length;
        if (spent === 0) {
          this.notify("Nothing to refund — you haven't spent a universal point yet.", "#9aa4b2");
          break;
        }
        this.state.player.respecUniversal();
        this.notify(`Refunded ${spent} nodes. This class only — your others keep theirs.`, "#7dd3fc");
        break;
      }
      default:
        break;
    }
    this.state.save();
  }

  /**
   * The one key with a different job on every tab that uses it: bulk-sells junk on
   * Stash, cycles the craft category on Craft, toggles 1×/10× on Chests now that
   * left/right drive the carousel instead.
   */
  private tertiary(): void {
    if (this.tab === "Leaderboards") {
      const i = LEADERBOARD_CLASS_FILTERS.indexOf(this.lbClassFilter);
      this.lbClassFilter = LEADERBOARD_CLASS_FILTERS[(i + 1) % LEADERBOARD_CLASS_FILTERS.length]!;
      this.render();
      return;
    }
    if (this.tab === "Altar" && this.altarMode === "workbench") {
      const i = MEMORY_OPS.indexOf(this.altarOp);
      this.altarOp = MEMORY_OPS[(i + 1) % MEMORY_OPS.length]!;
      this.disarm();
      this.render();
      return;
    }
    if (this.tab === "Craft" && this.forgeMode === "reforge") {
      const i = FORGE_OPS.indexOf(this.forgeOp);
      this.forgeOp = FORGE_OPS[(i + 1) % FORGE_OPS.length]!;
      this.disarm();
      this.render();
      return;
    }
    if (this.tab === "Craft" && this.forgeMode === "craft") {
      const i = CRAFT_CATEGORIES.indexOf(this.craftCategory);
      this.craftCategory = CRAFT_CATEGORIES[(i + 1) % CRAFT_CATEGORIES.length]!;
      this.cursor = 0;
      this.render();
      return;
    }
    if (this.tab === "Chests") {
      // An augmented pull is always 1x and the view does not offer the button: ten
      // simultaneous augmented opens is exactly the "a currency you spend routinely"
      // failure mode the whole system is designed against, and the cheapest defence
      // against it is not offering it.
      if (this.augmentView) {
        this.loadout = emptyLoadout();
        this.notify("Loadout cleared. Back to a bare Basic chest.", "#9aa4b2");
        this.render();
        return;
      }
      this.bulk = !this.bulk;
      this.notify(`Bulk: ${this.bulk ? "10×" : "1×"}`, "#9aa4b2");
      this.render();
      return;
    }
    if (this.tab !== "Stash") return;
    // Marking anything at all repurposes this key: with a batch pending, "sell all
    // junk" would be a second, unrelated bulk action sitting behind the same button —
    // confusing exactly when the player is already mid-decision about a pile of items.
    if (this.stashSelected.size > 0) {
      this.massSalvage();
      return;
    }
    const junk = this.junkItems();
    if (junk.length === 0) {
      this.notify("No junk to sell — nothing is worse than what you're wearing.", "#9aa4b2");
      return;
    }
    const gained = this.state.sell(junk.map((i) => i.id));
    this.notify(`Sold ${junk.length} junk items for ${formatNumber(gained)}`, "#fbbf24");
    this.cursor = 0;
    this.state.save();
  }

  /**
   * "Junk": a non-named stash item scored worse than whatever's worn in its slot. The
   * one definition both "sell all junk" and the salvage-all shortcut below read, so the
   * two bulk actions can never quietly define "junk" two different ways (docket §13).
   * A slot with nothing worn in it contributes no junk — there's nothing to be worse
   * than — and a worn item itself can never appear here, because equipped gear never
   * sits in `state.inventory` to begin with; a bulk action built on this can't sweep up
   * something the player has on.
   */
  private junkItems(): Item[] {
    const equipped = this.state.player.equipment;
    const cls = this.state.heroClass;
    return this.state.inventory.filter((it) => {
      if (it.named) return false;
      const worn = equipped[it.slot];
      return worn ? itemScore(it, cls) < itemScore(worn, cls) : false;
    });
  }

  /**
   * The Stash's one-button salvage (docket §13): "all the stuff" is exactly
   * {@link junkItems} — the same set "sell all junk" already sells, just routed to
   * salvage instead of the vendor. This only removes the *marking* step; it feeds the
   * junk set into the existing mass-salvage batch (`stashSelected`) and calls
   * `massSalvage()` unchanged, so the two-press arm-then-confirm and the "can't be
   * undone" copy are exactly what a manually marked batch already gets. Pressing this
   * again with the junk pile unchanged confirms it, same as any other second press;
   * if the pile changed underneath it (an item sold, equipped, or salvaged elsewhere
   * between presses) it re-arms and re-previews instead of firing on stale state.
   */
  private salvageAllJunk(): void {
    if (this.tab !== "Stash") return;
    const junk = this.junkItems();
    if (junk.length === 0) {
      this.notify("Nothing to salvage — nothing is worse than what you're wearing.", "#9aa4b2");
      return;
    }
    const ids = new Set(junk.map((it) => it.id));
    const sameBatch = ids.size === this.stashSelected.size
      && [...ids].every((id) => this.stashSelected.has(id));
    if (!sameBatch) {
      this.stashSelected = ids;
      this.massSalvageArmed = false;
    }
    this.massSalvage();
  }

  /** Toggles one item's membership in the Stash's mass-salvage batch — the one method
   *  both the card's checkbox click and the `mark` key funnel through, so they can
   *  never disagree. Any change to the batch disarms a pending mass-salvage: the
   *  confirm you're about to press has to be for the pile you're looking at right now. */
  private toggleStashSelect(id: string): void {
    if (this.stashSelected.has(id)) this.stashSelected.delete(id);
    else this.stashSelected.add(id);
    this.massSalvageArmed = false;
  }

  /** The `mark` key's job on Stash: toggle whichever card the cursor is on. Silently a
   *  no-op anywhere else (Stash is the only screen with a batch to build). */
  private markHighlighted(): void {
    if (this.tab !== "Stash") return;
    const item = this.filteredStash()[this.cursor];
    if (!item) return;
    this.toggleStashSelect(item.id);
  }

  /**
   * The Stash's mass-salvage, gated the same way every other one-way action in this UI
   * is: the first press only previews the total and arms it, the second actually runs
   * it. Selected ids are always plain `state.inventory` items — the Stash grid never
   * lists what's equipped, so unlike the workbench's single-item Salvage this needs no
   * separate "you're wearing this" gate of its own.
   */
  private massSalvage(): void {
    const items = this.state.inventory.filter((it) => this.stashSelected.has(it.id));
    if (items.length === 0) {
      this.stashSelected.clear();
      this.massSalvageArmed = false;
      this.notify("Nothing marked.", "#9aa4b2");
      return;
    }
    if (!this.massSalvageArmed) {
      this.massSalvageArmed = true;
      const ash = items.reduce((sum, it) => sum + salvageYield(it).ash, 0);
      const namedCount = items.filter((it) => it.named).length;
      this.notify(
        `Salvage ${items.length} item${items.length === 1 ? "" : "s"} for ~${formatNumber(ash)} ${ASH_NAME}`
        + (namedCount ? ` (${namedCount} named)` : "") + `? `
        + `${k(this.state.settings, "special")} again to confirm — this can't be undone.`,
        "#ef4444",
      );
      return;
    }
    const y = this.state.salvageItems(items.map((it) => it.id));
    this.notify(`Salvaged ${items.length} items for ${formatNumber(y.ash)} ${ASH_NAME}`, "#fbbf24");
    this.stashSelected.clear();
    this.massSalvageArmed = false;
    this.cursor = clamp(this.cursor, 0, Math.max(0, this.filteredStash().length - 1));
    this.state.save();
  }

  private filteredStash(): Item[] {
    const list = this.rarityFilter === "all"
      ? [...this.state.inventory]
      : this.state.inventory.filter((it) => it.rarity === this.rarityFilter);
    const cls = this.state.heroClass;
    return list.sort((a, b) =>
      rarityIndex(b.rarity) - rarityIndex(a.rarity) || itemScore(b, cls) - itemScore(a, cls));
  }

  // --- rendering ----------------------------------------------------------

  private render(): void {
    if (this.typing) return;
    // Whenever this screen redraws and nothing is focused, the keyboard has to be live
    // — otherwise a field that lost focus (Enter, Escape, a click, or the room-join
    // redraw itself) can leave Escape and everything else dead until some other event
    // happens to re-enable it.
    this.input?.setEnabled(!this.typing);
    const s = this.state;
    this.root.innerHTML = `
      <div class="town">
        <header class="town-top">
          <div class="brand">ASHES OF <span>PURGATORY</span></div>
          <div class="purse">
            <span class="coin">${formatNumber(s.coins)}</span> coins
            <span class="sep">·</span>
            <span class="gemcount">${formatNumber(s.gems)}</span> gems
            <span class="sep">·</span>
            <span style="color:${s.classChosen ? s.heroClass.color : "#5a6270"}">
              ${s.classChosen ? escapeHtml(s.heroClass.name) : "no class"}</span>
            <span class="sep">·</span> LV ${s.player.level}
            <span class="sep">·</span> deepest ${s.stats.deepestDepth}${
              s.stats.highestHeight > 0 ? ` <span class="sep">·</span> highest ${s.stats.highestHeight}` : ""}
          </div>
        </header>
        <nav class="tabs">
          ${(STATION_TABS as readonly Tab[]).includes(this.tab)
            ? `<span class="tab on">${escapeHtml(STATION_LABELS[this.tab as StationTab])}</span>
               <span class="tabhint">a station, not a tab — [${k(this.state.settings, "pause")}] back to the Citadel</span>`
            : `${CYCLE_TABS.map((t) =>
                `<span class="tab ${t === this.tab ? "on" : ""}" data-tab="${t}">${t}</span>`).join("")}
               <span class="tabhint">[${k(this.state.settings, "tabPrev")}] / [${k(this.state.settings, "tabNext")}] switch, or click a tab</span>`}
        </nav>
        <section class="body">${this.renderTab()}</section>
        <footer class="town-foot">
          <span class="help">${tabHelp(this.tab, this.state.settings, this.forgeMode, this.stashSelected.size, this.altarMode, this.augmentView)}</span>
          ${this.toast ? `<span class="toast" style="color:${this.toast.color}">${escapeHtml(this.toast.text)}</span>` : ""}
        </footer>
      </div>`;

    // Keep the highlighted row on screen when the list is longer than the panel — Chests
    // scrolls horizontally instead, hence "nearest" on both axes.
    this.root.querySelector<HTMLElement>(".row.on, .item-card.on, .doll-slot.on")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (this.tab === "Party") this.bindPartyFields();
  }

  private renderTab(): string {
    switch (this.tab) {
      case "Dive": return this.renderDive();
      case "Tower": return this.renderTower();
      case "Party": return this.renderParty();
      case "Trophy": return this.renderTrophy();
      case "Rifts": return this.renderRifts();
      case "StarMap": return this.renderStarMap();
      case "Raid": return this.renderRaid();
      case "Vigil": return this.renderVigil();
      case "Convergence": return this.renderConvergence();
      case "Altar": return this.renderAltar();
      case "Craft": return this.renderCraft();
      case "Chests": return this.renderChests();
      case "Shop": return this.renderShop();
      case "Stash": return this.renderStash();
      case "Hero": return this.renderHero();
      case "Skills": return this.renderSkills();
      case "Tree": return this.renderTree();
      case "Universal": return this.renderUniversal();
      case "Path": return this.renderPath();
      case "Style": return this.renderStyle();
      case "Standards": return this.renderStandards();
      case "Capsules": return this.renderCapsules();
      case "Codex": return this.renderCodex();
      case "Records": return this.renderRecords();
      case "Leaderboards": return this.renderLeaderboards();
      case "Settings": return this.renderSettings();
    }
  }

  /**
   * The Comms Relay, top to bottom. Out of a room it's three rows: your name, host,
   * join. In one it's the code, the depth the host has picked, everybody who's here,
   * and the door out.
   */
  private partyRows(): PartyRow[] {
    if (!this.party.inRoom) {
      return [{ kind: "name" }, { kind: "host" }, { kind: "join" }];
    }
    const rows: PartyRow[] = [{ kind: "code" }, { kind: "plan" }];
    for (let i = 0; i < this.party.size; i++) rows.push({ kind: "member", index: i });
    rows.push({ kind: "leave" });
    return rows;
  }

  /**
   * The Trophy Hall (docket §3): a row of cases, each locked, empty or holding a
   * snapshot. Confirming a locked case buys it; confirming an empty one switches the
   * screen to a stash picker (`trophyPicking`); confirming a filled one clears it — one
   * screen, two modes, the same shape `craftMode`/`altarMode` already use elsewhere here.
   */
  private trophyAction(): void {
    if (this.trophyPicking !== null) {
      const item = this.filteredStash()[this.cursor];
      if (item) {
        this.state.assignTrophy(this.trophyPicking, item);
        this.notify(`${item.name} goes on display.`, RARITY_COLORS[item.rarity]);
      }
      this.trophyPicking = null;
      this.cursor = 0;
      return;
    }
    const index = this.cursor;
    if (index >= this.state.trophyCasesUnlocked) {
      const cost = trophyCaseCost(this.state.trophyCasesUnlocked);
      if (this.state.gems < cost) {
        this.notify(`Need ${cost} gems for the next case.`, "#ef4444");
        return;
      }
      this.state.buyTrophyCase();
      this.notify(`Case ${index + 1} is yours.`, "#f0abfc");
      return;
    }
    if (this.state.trophyItem(index)) {
      this.state.clearTrophy(index);
      this.notify("Case cleared.", "#9aa4b2");
      return;
    }
    if (this.filteredStash().length === 0) {
      this.notify("Nothing in the stash to put on display.", "#9aa4b2");
      return;
    }
    this.trophyPicking = index;
    this.cursor = 0;
  }

  private renderTrophy(): string {
    const cls = this.state.heroClass;
    if (this.trophyPicking !== null) {
      const items = this.filteredStash();
      const rows = items.map((it, i) => {
        const on = i === this.cursor ? "on" : "";
        const icon = pixelImageTag(itemArt(it), 48, 48, itemArtKey("item", it));
        return `
          <div class="row ${on}" data-index="${i}">
            <div class="row-main">${icon}
              <span class="name" style="color:${RARITY_COLORS[it.rarity]}">${escapeHtml(it.name)}</span>
            </div>
            <div class="row-side">${rarityLabel(it.rarity)} · score ${Math.round(itemScore(it, cls))}</div>
          </div>`;
      }).join("");
      return `
        <p class="muted">Case ${this.trophyPicking + 1} — pick something from the stash. It stays exactly
          where it is; this only puts a copy on the shelf.</p>
        <div class="stash-grid">${rows || '<div class="stash-none">The stash is empty.</div>'}</div>
        <aside class="side"><p class="muted">${k(this.state.settings, "confirm")} place it ·
          ${k(this.state.settings, "cancel")} back to the cases</p></aside>`;
    }
    const rows = Array.from({ length: MAX_TROPHY_CASES }, (_, i) => {
      const on = i === this.cursor ? "on" : "";
      const locked = i >= this.state.trophyCasesUnlocked;
      const item = this.state.trophyItem(i);
      const body = locked
        ? `<span class="name muted">Locked</span><div class="row-side">${trophyCaseCost(i)} gems</div>`
        : item
          ? `${pixelImageTag(itemArt(item), 48, 48, itemArtKey("item", item))}
             <span class="name" style="color:${RARITY_COLORS[item.rarity]}">${escapeHtml(item.name)}</span>
             <div class="row-side">${rarityLabel(item.rarity)} · ${k(this.state.settings, "confirm")} to clear</div>`
          : `<span class="name muted">Empty</span><div class="row-side">${k(this.state.settings, "confirm")} to place something</div>`;
      return `<div class="row ${on}" data-index="${i}"><div class="row-main">${body}</div></div>`;
    }).join("");
    const flownMark = standardLabel(this.state.player, this.state.activeClassId, this.state.player.flownStandard);
    const flownStyle = bannerStyle(this.state.player.flownBannerStyle);
    const standard = flownMark
      ? `<p class="muted" style="color:${flownStyle.color};border-left:3px solid ${flownStyle.border};padding-left:8px">
           Hanging here: ${escapeHtml(flownMark)}</p>`
      : `<p class="muted">Nothing flying yet — the Standards screen picks one.</p>`;
    return `
      <p class="muted">Display cases, bought with gems. What's in one is a copy — the real
        item never leaves the stash, and nothing here changes your sheet.</p>
      ${standard}
      <div class="stash-grid">${rows}</div>
      <aside class="side">
        <p class="muted">Gems: ${this.state.gems}</p>
        <p class="muted">${k(this.state.settings, "confirm")} buy, place or clear a case.</p>
      </aside>`;
  }

  /**
   * Standards (`docs/gem-sinks.md` §4A). Rows are marks first (earned, free — confirm
   * flies or lowers one), then banner styles (confirm wears an owned one or buys an
   * unowned one). One flat list rather than two screens, the same shape the Trophy Hall
   * already uses for "locked vs filled" in a single `data-index` grid.
   */
  private standardsAction(): void {
    const marks = standardsFor(this.state.player, this.state.activeClassId);
    if (this.cursor < marks.length) {
      const mark = marks[this.cursor]!;
      const flying = this.state.player.flownStandard === mark.id;
      this.state.setFlownStandard(flying ? null : mark.id);
      this.notify(flying ? "Standard lowered." : `Now flying: ${mark.label}`, "#f0abfc");
      return;
    }
    const style = BANNER_STYLES[this.cursor - marks.length];
    if (!style) return;
    if (styleOwned(style, this.state.ownedBannerStyles)) {
      this.state.setFlownBannerStyle(style.id);
      this.notify(`Cloth: ${style.name}`, style.color);
      return;
    }
    if (this.state.gems < style.price) {
      this.notify(`Need ${style.price} gems for ${style.name}.`, "#ef4444");
      return;
    }
    this.state.buyBannerStyle(style.id);
    this.state.setFlownBannerStyle(style.id);
    this.notify(`Bought and flying: ${style.name}`, style.color);
  }

  private renderStandards(): string {
    const marks = standardsFor(this.state.player, this.state.activeClassId);
    const currentStyle = bannerStyle(this.state.player.flownBannerStyle);
    const markRows = marks.map((m: StandardMark, i: number) => {
      const on = i === this.cursor ? "on" : "";
      const flying = this.state.player.flownStandard === m.id;
      return `
        <div class="row ${on}" data-index="${i}">
          <div class="row-main">
            <span class="name" style="color:${currentStyle.color}">${escapeHtml(m.label)}</span>
            ${flying ? '<span class="badge">FLYING</span>' : ""}
          </div>
          <div class="row-side">${flying
            ? `${k(this.state.settings, "confirm")} to lower`
            : `${k(this.state.settings, "confirm")} to fly`}</div>
        </div>`;
    }).join("");
    const styleRows = BANNER_STYLES.map((s, i) => {
      const idx = marks.length + i;
      const on = idx === this.cursor ? "on" : "";
      const owned = styleOwned(s, this.state.ownedBannerStyles);
      const worn = this.state.player.flownBannerStyle === s.id;
      const body = owned
        ? `<span class="name" style="color:${s.color}">${escapeHtml(s.name)}</span>
           <div class="row-side">${worn ? "worn" : `${k(this.state.settings, "confirm")} to wear`}</div>`
        : `<span class="name muted">${escapeHtml(s.name)}</span>
           <div class="row-side">${s.price} gems</div>`;
      return `<div class="row ${on}" data-index="${idx}"><div class="row-main">${body}</div></div>`;
    }).join("");
    return `
      <p class="muted">Every mark below is something this class actually did — flying one
        costs nothing. Gems buy only the cloth it flies in.</p>
      <div class="stash-grid">${markRows
        || '<div class="stash-none">Nothing earned yet. Bank a hard clear and come back.</div>'}</div>
      <p class="muted">Cloth</p>
      <div class="stash-grid">${styleRows}</div>
      <aside class="side">
        <p class="muted">Gems: ${this.state.gems}</p>
        <p class="muted">${k(this.state.settings, "confirm")} fly a mark, wear or buy a style.</p>
      </aside>`;
  }

  private partyAction(row: PartyRow | undefined): void {
    if (!row) return;
    switch (row.kind) {
      case "name":
      case "join":
        this.focusField(row.kind);
        break;
      case "host":
        if (!this.requireClass()) break;
        if (!this.state.settings.playerName) {
          this.notify("Put a name in first — the others need something to shout.", "#fbbf24");
          this.cursor = 0;
          this.focusField("name");
          break;
        }
        this.party.hostRoom();
        break;
      case "code":
        void navigator.clipboard?.writeText(this.party.code).then(
          () => this.notify(`Copied ${this.party.code}. Send it to them.`, "#4ade80"),
          () => this.notify(`The code is ${this.party.code}.`),
        );
        break;
      case "plan":
        this.notify(
          this.party.isHost
            ? "Back out to the Citadel, walk into any portal and confirm it — that picks the party's run."
            : "The host picks the run by walking into a portal. You'll see it here.",
          "#9aa4b2",
        );
        break;
      case "leave":
        this.party.leave();
        this.cursor = 0;
        break;
      case "member":
        break;
    }
  }

  /** Focuses one of the two text fields on this screen after the next repaint. */
  private focusField(which: "name" | "join"): void {
    this.render();
    const field = this.root.querySelector<HTMLInputElement>(`[data-field="${which}"]`);
    field?.focus();
    field?.select();
  }

  /** Wired once per render, since the screen rebuilds its own DOM on every keypress. */
  private bindPartyFields(): void {
    for (const which of ["name", "join"] as const) {
      const field = this.root.querySelector<HTMLInputElement>(`[data-field="${which}"]`);
      if (!field) continue;
      field.addEventListener("keydown", (e) => {
        // While a field has focus the game's keys are off (see `focusin` in main.ts),
        // so Enter and Escape are the whole interface here.
        if (e.key === "Enter") {
          e.preventDefault();
          const value = field.value;
          field.blur();
          if (which === "name") {
            this.state.settings.playerName = cleanPlayerName(value);
            this.state.save();
            this.notify(`You're ${this.state.settings.playerName || "nobody"} now.`, "#4ade80");
          } else if (isRoomCode(normalizeRoomCode(value))) {
            if (!this.requireClass()) return;
            this.party.joinRoom(value);
          } else {
            this.notify(`${ROOM_CODE_LENGTH} letters. Ask them to read it out again.`, "#ef4444");
          }
          this.render();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          field.blur();
          this.render();
        }
      });
      field.addEventListener("blur", () => this.render());
    }
  }

  private renderParty(): string {
    const p = this.party;
    const rows: string[] = [];
    const list = this.partyRows();
    const roster = p.inRoom ? p.net.roster(p.name) : [];

    list.forEach((row, i) => {
      const on = i === this.cursor ? "on" : "";
      switch (row.kind) {
        case "name":
          rows.push(`
            <div class="row ${on}" data-index="${i}">
              <div class="row-main"><span class="name">Your name</span></div>
              <div class="row-side">
                <input class="field" data-field="name" maxlength="12" placeholder="type a name"
                  value="${escapeHtml(this.state.settings.playerName)}" />
              </div>
            </div>`);
          break;
        case "host":
          rows.push(`
            <div class="row ${on}" data-index="${i}">
              <div class="row-main"><span class="name">Open a room</span></div>
              <div class="row-side">you host, everyone else joins with the code</div>
            </div>`);
          break;
        case "join":
          rows.push(`
            <div class="row ${on}" data-index="${i}">
              <div class="row-main"><span class="name">Join a room</span></div>
              <div class="row-side">
                <input class="field" data-field="join" maxlength="${ROOM_CODE_LENGTH}"
                  placeholder="CODE" />
              </div>
            </div>`);
          break;
        case "code":
          rows.push(`
            <div class="row ${on}" data-index="${i}">
              <div class="row-main">
                <span class="depth">${escapeHtml(p.code)}</span>
                <span class="name">Room code</span>
                ${p.isHost ? '<span class="badge boss">HOST</span>' : ""}
              </div>
              <div class="row-side ${p.hostRunning && !p.running ? "warn" : ""}">
                ${p.hostRunning && !p.running
                  ? "the party is on a floor right now — you'll dive with them on their next run"
                  : `${k(this.state.settings, "confirm")} copies it`}
              </div>
            </div>`);
          break;
        case "plan": {
          const plan = p.plan;
          if (!plan) {
            rows.push(`
              <div class="row ${on}" data-index="${i}">
                <div class="row-main"><span class="name">No portal picked yet</span></div>
                <div class="row-side warn">${p.isHost
                  ? "walk into the Delve, the Tower, a rift, the Reliquary Portal or a Raid Portal and confirm it"
                  : "the host picks by walking into a portal"}</div>
              </div>`);
            break;
          }
          const config = { ...plan.config, players: p.size };
          const profile = profileFor(config.depth, config);
          // The one naming the flashes use, so the lobby and the deck agree on what the
          // host picked — this used to be its own copy with a `Delve depth N` fallthrough.
          const title = describeRun(config);
          rows.push(`
            <div class="row ${on}" data-index="${i}">
              <div class="row-main">
                <span class="name">${escapeHtml(title)}</span>
                <span class="muted">${escapeHtml(profile.name)}</span>
                ${profile.isBoss ? '<span class="badge boss">BOSS</span>' : ""}
              </div>
              <div class="row-side">req. ${levelLabel(profile)} · everyone stands in that portal</div>
            </div>`);
          break;
        }
        case "member": {
          const member = roster[row.index];
          const remote = p.members.find((m) => m.id === member?.id);
          const ready = member?.id === p.net.id ? false : remote?.ready ?? false;
          const you = member?.id === p.net.id;
          // Only "you" can show a Standard here — the relay is deliberately dumb (id and
          // name only, see `net/protocol.ts`'s `PeerInfo`), so a party member's flown
          // mark isn't known to this client until a dive actually starts and the full
          // co-op wire (`HeroWire.player`) is syncing; the in-run nameplate covers that
          // case live. This reads the local account only.
          const mark = you ? standardLabel(this.state.player, this.state.activeClassId, this.state.player.flownStandard) : null;
          const style = you ? bannerStyle(this.state.player.flownBannerStyle) : null;
          rows.push(`
            <div class="row ${on}" data-index="${i}">
              <div class="row-main">
                <span class="name">${escapeHtml(member?.name ?? "…")}</span>
                ${you ? '<span class="badge">YOU</span>' : ""}
              </div>
              ${mark ? `<div class="row-side" style="color:${style!.color}">${escapeHtml(mark)}</div>` : ""}
              <div class="row-side ${you || !ready ? "warn" : ""}">
                ${you
                  ? "at the relay — you only count as ready while you're standing in the portal"
                  : ready ? "in the portal" : "at the Citadel"}
              </div>
            </div>`);
          break;
        }
        case "leave":
          rows.push(`
            <div class="row ${on}" data-index="${i}">
              <div class="row-main"><span class="name">Leave the room</span></div>
              <div class="row-side">${p.isHost ? "closes it for everybody" : "back to diving alone"}</div>
            </div>`);
          break;
      }
    });

    const status = p.net.status === "connecting" ? "Connecting…"
      : p.net.status === "error" ? p.net.error
      : p.inRoom ? `Room ${p.code} · ${p.size}/${MAX_PARTY}`
      : "Not connected.";

    return `<div class="list">${rows.join("")}</div>
      <aside class="side">
        <h3>Multiplayer</h3>
        <p class="${p.net.status === "error" ? "danger" : "muted"}">${escapeHtml(status)}</p>
        <p>One of you opens a room and reads out the four letters. Everybody else types
        them in. Then the <b>host walks into any portal</b> — the Delve, a rift, a sector
        from the Reliquary Gate — and confirms it; that portal becomes the party's. Everyone
        walks into it, and the run starts when the last person steps in, not before.
        Standing at this terminal doesn't count; back out to the Citadel first.</p>
        <h3>What a party does to a floor</h3>
        <p>Monsters get tougher and there are more of them the more of you there are.
        They do not hit meaningfully harder — you still can't dodge for each other.</p>
        <p>Everyone keeps their own loot, their own XP and their own stash. Drops belong
        to whoever picks them up.</p>
        <p class="danger">Go down and you're not dead, you're <b>down</b> — an ally
        standing over you brings you back. If the last one standing falls, the whole
        party loses the floor.</p>
        <h3>Getting them in</h3>
        <p class="muted">They need to be able to open this page. Same wifi: give them the
        <b>Network</b> address <code>npm run host</code> prints. The room lives on
        whoever is serving the game.</p>
      </aside>`;
  }

  /**
   * "I want X item, and this is where I get it" — the UAT §20 drop preview, rendered
   * wherever the player is standing in front of an activity and hasn't committed yet.
   *
   * One renderer for every mode, because the read behind it is one function
   * (`previewForRun`) over the tables the game really rolls. Nothing here knows what any
   * activity drops; it knows how to lay out an answer. Odds are quoted **per event** and
   * labelled as such — a world drop's fraction of a percent is per kill, and rolling it
   * up into a per-run number would need a kill count this screen has no business
   * inventing.
   */
  private previewBlock(preview: ActivityPreview): string {
    const pct = (c: number) => (c >= 0.01 ? `${Math.round(c * 100)}%` : `${Math.round(c * 1000) / 10}%`);
    const named = preview.named.length === 0
      ? `<p class="muted">Nothing named drops here. Ordinary loot only.</p>`
      : `<ul class="pulls">${preview.named.map((d) => `<li>
          <b style="color:${RARITY_COLORS[d.def.rarity]}">${escapeHtml(d.def.name)}</b>
          ${d.exclusive ? '<span class="badge gold">only here</span>' : ""}
          <span class="muted">${pct(d.chance)}</span>
          <em>${escapeHtml(d.via)}</em></li>`).join("")}</ul>`;
    const mats = preview.materials.length === 0
      ? ""
      : `<p>Materials: ${preview.materials
          .map((e) => `<b style="color:${MATERIALS[e].color}">${escapeHtml(MATERIALS[e].name)}</b>`)
          .join(", ")}</p>`;
    const bosses = preview.bosses.length === 0
      ? ""
      : `<p class="muted">Standing in it: ${preview.bosses.map((b) => escapeHtml(b)).join(" → ")}</p>`;
    return `
      <h3>Possible rewards</h3>
      ${bosses}
      ${named}
      ${mats}
      <p class="muted">${preview.other.map((o) => escapeHtml(o)).join(" · ")}</p>`;
  }

  private renderDive(): string {
    const challenger = this.state.challengerTier;
    const rows: string[] = [];
    // The floors group under the band of the war they fall in (UAT §23). A header is not
    // a `.row` and carries no `data-index`, so neither the click delegate nor the cursor
    // (which indexes depths, not list children) can land on one.
    let band: WorldLayer | null = null;
    for (let depth = 1; depth <= this.state.maxUnlockedDepth; depth++) {
      const p = profileFor(depth, delveConfig(depth, challenger));
      if (p.layer !== band) {
        band = p.layer;
        rows.push(`<div class="group">${escapeHtml(band.name)}</div>`);
      }
      const under = this.state.player.level < p.recommendedLevel;
      rows.push(`
        <div class="row ${depth - 1 === this.cursor ? "on" : ""}" data-index="${depth - 1}">
          <div class="row-main">
            <span class="depth">${String(depth).padStart(2, "0")}</span>
            <span class="name">${p.name}</span>
            ${p.isBoss ? '<span class="badge boss">BOSS</span>' : ""}
          </div>
          <div class="row-side ${under ? "warn" : ""}">
            req. ${levelLabel(p)} · ${p.waves} waves · ×${p.coinMultiplier.toFixed(1)} loot
          </div>
        </div>`);
    }
    rows.push(this.renderChallengerRow(this.state.maxUnlockedDepth));
    const depth = Math.min(this.cursor + 1, this.state.maxUnlockedDepth);
    const biome = biomeFor(depth);
    const layer = layerFor(delveConfig(depth, challenger));
    const hazards = trapsFor(depth, biome.traps).map((t) => t.label);
    return `<div class="list">${rows.join("")}</div>
      <aside class="side">
        <h3>The dive</h3>
        <p class="muted" style="font-style:italic">${escapeHtml(MODES.delve.lore)}</p>
        <p>Clear every wave, then step into the portal. <b>Descend</b> to push deeper for
        richer loot, or <b>extract</b> to bank what you're carrying. Every fifth floor is
        a raid boss, and it will take a while.</p>
        <p class="danger">Die and you lose every coin, key and item you picked up on the
        way down. XP is always kept.</p>
        ${this.challengerDepthBadgeLine(
          challenger, this.state.player.deepestDepth, this.state.player.delveChallengerBadges,
          "Challenger clears", "depth",
        )}
        <h3>${escapeHtml(layer.name)}</h3>
        <p class="muted" style="font-style:italic">${escapeHtml(layer.lore)}</p>
        <h3>${escapeHtml(biome.name)}</h3>
        <p class="muted">No two floors are laid out the same. Watch the ground.</p>
        <p>Hazards: ${hazards.length ? escapeHtml(hazards.join(", ")) : "none yet. Enjoy it."}</p>
        <p>Local element: <b style="color:${ELEMENT_COLORS[biome.element]}">${ELEMENT_LABELS[biome.element]}</b>
        <span class="muted">· the deeper you go, the more of the wildlife is made of it</span></p>
        ${this.previewBlock(previewForRun(
          delveConfig(depth, challenger),
          // The bottom of the Delve is this class's Proving once it has earned it, and
          // then the preview has to name the encounter it will actually meet.
          provingFloor(delveConfig(depth, challenger), this.state.player.deepestDepth)
            ? this.state.activeClassId : null,
        ))}
        <h3>Belt</h3>
        <p><b>${this.state.potions}</b> / ${POTION_CAP} potions
        <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · buy for ${POTION_PRICE}c</span></p>
      </aside>`;
  }

  /**
   * The climb (UAT §21) — the Dive screen's mirror, deliberately, down to the layout.
   *
   * The Tower is the Delve's opposite direction and not its harder sibling, so the screen
   * that sells it has to read the same: the same row shape, the same grouping under the
   * band of the war, the same preview. What differs is what the words say. If this ever
   * grows a second list format, the two ladders have stopped being two halves of one thing.
   */
  private renderTower(): string {
    const challenger = this.state.challengerTier;
    const rows: string[] = [];
    let band: WorldLayer | null = null;
    for (let height = 1; height <= this.state.maxUnlockedHeight; height++) {
      const p = profileFor(height, towerConfig(height, challenger));
      if (p.layer !== band) {
        band = p.layer;
        rows.push(`<div class="group">${escapeHtml(band.name)}</div>`);
      }
      const under = this.state.player.level < p.recommendedLevel;
      rows.push(`
        <div class="row ${height - 1 === this.cursor ? "on" : ""}" data-index="${height - 1}">
          <div class="row-main">
            <span class="depth">${String(height).padStart(2, "0")}</span>
            <span class="name">${p.name}</span>
            ${p.isBoss ? '<span class="badge boss">BOSS</span>' : ""}
          </div>
          <div class="row-side ${under ? "warn" : ""}">
            req. ${levelLabel(p)} · ${p.waves} waves · ×${p.coinMultiplier.toFixed(1)} loot
          </div>
        </div>`);
    }
    rows.push(this.renderChallengerRow(this.state.maxUnlockedHeight));
    const height = Math.min(this.cursor + 1, this.state.maxUnlockedHeight);
    const config = towerConfig(height, challenger);
    const biome = towerBiomeFor(height);
    const layer = layerFor(config);
    const hazards = trapsFor(height, biome.traps).map((t) => t.label);
    return `<div class="list">${rows.join("")}</div>
      <aside class="side">
        <h3>The climb</h3>
        <p class="muted" style="font-style:italic">${escapeHtml(MODES.tower.lore)}</p>
        <p>Clear every wave, then step into the portal. <b>Climb</b> to push higher, or
        <b>extract</b> to bank what you're carrying. Every fifth floor is a raid boss, and
        it will take a while.</p>
        <p class="danger">Die and you lose every coin, key and item you picked up on the
        way up. XP is always kept.</p>
        <p class="muted">A height is not a depth. Climbing opens nothing down there — no
        rift tier, and no Proving.</p>
        ${this.challengerDepthBadgeLine(
          challenger, this.state.player.highestHeight, this.state.player.towerChallengerBadges,
          "Challenger clears", "height",
        )}
        <h3>${escapeHtml(layer.name)}</h3>
        <p class="muted" style="font-style:italic">${escapeHtml(layer.lore)}</p>
        <h3>${escapeHtml(biome.name)}</h3>
        <p class="muted">Nothing here is permitted to deviate from its place. That includes the floor plan.</p>
        <p>Hazards: ${hazards.length ? escapeHtml(hazards.join(", ")) : "none yet. Enjoy it."}</p>
        <p>Local element: <b style="color:${ELEMENT_COLORS[biome.element]}">${ELEMENT_LABELS[biome.element]}</b>
        <span class="muted">· the higher you go, the more of the host is made of it</span></p>
        ${this.previewBlock(previewForRun(config))}
        <h3>Belt</h3>
        <p><b>${this.state.potions}</b> / ${POTION_CAP} potions
        <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · buy for ${POTION_PRICE}c</span></p>
      </aside>`;
  }

  /**
   * Rift tiers. The ladder is exponential rather than linear, so the interesting
   * information on a row is what it will do to you, not what floor it is.
   */
  private renderRifts(): string {
    const mode = MODES[this.riftMode];
    const unlocked = modeUnlocked(mode, this.state.stats.deepestDepth);
    const maxTier = this.state.riftTiers[this.riftMode];
    const challenger = this.state.challengerTier;

    const rows: string[] = [];
    for (let tier = 1; tier <= maxTier; tier++) {
      const config = riftConfig(this.riftMode, tier, mode.floors, challenger);
      const p = profileFor(config.depth, config);
      const under = this.state.player.level < p.recommendedLevel;
      const best = tier === maxTier && maxTier > 1;
      rows.push(`
        <div class="row ${tier - 1 === this.cursor ? "on" : ""}" data-index="${tier - 1}">
          <div class="row-main">
            <span class="depth">T${String(tier).padStart(2, "0")}</span>
            <span class="name">${escapeHtml(mode.name)}</span>
            ${best ? '<span class="badge boss">NEW</span>' : ""}
          </div>
          <div class="row-side ${under ? "warn" : ""}">
            req. ${levelLabel(p)} · depth ${config.depth} · danger ×${config.danger.toFixed(2)}
          </div>
        </div>`);
    }
    rows.push(this.renderChallengerRow(maxTier));

    const sel = riftConfig(this.riftMode, Math.min(this.cursor + 1, maxTier), mode.floors, challenger);
    const other = RIFT_MODES.map((m) =>
      `<span style="color:${m === this.riftMode ? MODES[m].color : "#5a6270"}">${MODES[m].short}</span>`,
    ).join(" / ");

    const riftLayer = layerFor(sel);
    return `<div class="list">${rows.join("")}</div>
      <aside class="side">
        <p class="muted" style="font-style:italic">${escapeHtml(RIFT_LORE)}</p>
        <h3 style="color:${mode.color}">${escapeHtml(mode.name)}</h3>
        <p class="muted">${other}
          <!-- data-index parks the cursor back on a tier row, not the Challenger row
               below it, so this chip always switches the rift flavor rather than
               occasionally being read as a Challenger adjustment. -->
          <span class="chip" data-action="left" data-index="0">◀ ${k(this.state.settings, "left")}</span>
          <span class="chip" data-action="right" data-index="0">${k(this.state.settings, "right")} ▶</span></p>
        <p class="muted" style="font-style:italic">${escapeHtml(mode.lore)}</p>
        <p class="muted"><b>${escapeHtml(riftLayer.name)}</b> · ${escapeHtml(riftLayer.lore)}</p>
        <p>${escapeHtml(mode.blurb)}</p>
        ${unlocked ? "" : `<p class="danger">Locked. Reach depth ${mode.unlockDepth} in the delve.</p>`}
        <table class="cmp">
          <tr><td>Floors</td><td>${mode.floors}, boss last</td></tr>
          <tr><td>Boss floor depth</td><td>${sel.depth}</td></tr>
          <tr><td>Danger</td><td>×${sel.danger.toFixed(2)}</td></tr>
          <tr><td>Rarity push</td><td>${mode.rarityBias > 0.1 ? "heavy" : mode.rarityBias > 0 ? "slight" : "none"}</td></tr>
          <tr><td>Drop volume</td><td>×${mode.quantity.toFixed(1)}</td></tr>
          <tr><td>Coins</td><td>×${mode.coinMult.toFixed(1)}</td></tr>
          <tr><td>Keys</td><td>×${mode.keyMult.toFixed(1)}</td></tr>
        </table>
        ${this.previewBlock(previewForRun(sel))}
        <p class="muted">Clearing the boss opens the next tier. Extracting early keeps
        what you're carrying and opens nothing.</p>
        <p>Rifts closed: <b>${this.state.stats.riftsCleared[this.riftMode] ?? 0}</b></p>
        <!-- RIFT_MODES is built from RunModeId but excludes delve/tower/planet/vigil/
             convergence by construction, so this.riftMode is always a FixedChallengerModeId
             in practice even though its field type stays the wider RunModeId. -->
        ${this.challengerBadgeLine(
          this.state.player.challengerBadges[this.riftMode as FixedChallengerModeId], "Challenger clears",
        )}
      </aside>`;
  }

  /**
   * The Ashen Reliquary: pick a sector and a tier, same shape as the rift screen — A/D
   * switches sector instead of rift flavor, and confirming doesn't dive, it opens a
   * portal by the Reliquary Gate for you to walk into.
   */
  private renderStarMap(): string {
    const planet = this.starMapPlanet;
    const unlocked = planetUnlocked(planet, this.state.planetProgress, this.state.frontier);
    const maxTier = this.state.planetProgress[planet.id] ?? 1;
    const challenger = this.state.challengerTier;

    const rows: string[] = [];
    for (let tier = 1; tier <= maxTier; tier++) {
      const config = planetConfig(planet, tier, planet.floors, challenger);
      const p = profileFor(config.depth, config);
      const under = this.state.player.level < p.recommendedLevel;
      const best = tier === maxTier && maxTier > 1;
      rows.push(`
        <div class="row ${tier - 1 === this.cursor ? "on" : ""}" data-index="${tier - 1}">
          <div class="row-main">
            <span class="depth">T${String(tier).padStart(2, "0")}</span>
            <span class="name">${escapeHtml(planet.name)}</span>
            ${best ? '<span class="badge boss">NEW</span>' : ""}
          </div>
          <div class="row-side ${under ? "warn" : ""}">
            req. ${levelLabel(p)} · ${planet.floors} floors · danger ×${config.danger.toFixed(2)}
          </div>
        </div>`);
    }
    rows.push(this.renderChallengerRow(maxTier));

    const sel = planetConfig(planet, Math.min(this.cursor + 1, maxTier), planet.floors, challenger);
    const sectorLayer = layerFor(sel);
    const other = PLANETS.map((p) =>
      `<span style="color:${p === planet ? ELEMENT_COLORS[p.element] : "#5a6270"}">${escapeHtml(p.name)}</span>`,
    ).join(" / ");

    return `<div class="list">${rows.join("")}</div>
      <aside class="side">
        <p class="muted" style="font-style:italic">${escapeHtml(MODES.planet.lore)}</p>
        <p class="muted"><b>${escapeHtml(sectorLayer.name)}</b> · ${escapeHtml(sectorLayer.lore)}</p>
        <h3 style="color:${ELEMENT_COLORS[planet.element]}">${escapeHtml(planet.name)}
          <span class="muted">· T${planet.order}</span></h3>
        <p class="muted">${other}
          <!-- Same reason as the Rifts screen's pair: park the cursor off the
               Challenger row so this always switches the sector. -->
          <span class="chip" data-action="left" data-index="0">◀ ${k(this.state.settings, "left")}</span>
          <span class="chip" data-action="right" data-index="0">${k(this.state.settings, "right")} ▶</span></p>
        <p>${escapeHtml(planet.blurb)}</p>
        ${unlocked ? "" : `<p class="danger">Sealed. Clear the previous sector's first tier,
          or reach depth ${planet.baseDepth} on either ladder.</p>`}
        <table class="cmp">
          <tr><td>Floors</td><td>${planet.floors}, boss last</td></tr>
          <tr><td>Boss floor depth</td><td>${sel.depth}</td></tr>
          <tr><td>Danger</td><td>×${sel.danger.toFixed(2)}</td></tr>
          <tr><td>Local element</td><td style="color:${ELEMENT_COLORS[planet.element]}">${ELEMENT_LABELS[planet.element]}</td></tr>
          <tr><td>Material</td><td style="color:${MATERIALS[planet.element].color}">${escapeHtml(MATERIALS[planet.element].name)}</td></tr>
        </table>
        ${this.previewBlock(previewForRun(sel))}
        <p class="muted">Fight and harvest your way to the boss. Beating it opens
        extraction and the next tier — the deeper the sector, the better it pays.</p>
        <p>Opening a portal doesn't dive — it spawns one by the Reliquary Gate. Walk into
        it when you're ready.</p>
        ${this.challengerBadgeLine(this.state.player.planetChallengerBadges[planet.id] ?? 0, "Challenger clears")}
      </aside>`;
  }

  /**
   * The War Table (UAT §15) — the Reliquary Gate's screen, pointed at the four things too
   * large for the Keepers to contain.
   *
   * Deliberately the same shape as `renderStarMap`: A/D picks which raid, the cursor picks
   * a tier, and confirming spawns a portal rather than diving. A raid is chosen exactly
   * the way a sector is, so the screen that sells it should not be a new idiom — what
   * differs is that there is one floor, the loot table is the reason to be here, and the
   * top of that table does not exist below a tier (§16).
   */
  private renderRaid(): string {
    const spec = this.warTableRaid;
    const unlocked = raidUnlocked(spec, this.state.frontier);
    const maxTier = raidTiersOpen(spec, this.state.raidProgress);
    const challenger = this.state.challengerTier;
    const layer = raidLayer(spec);

    const rows: string[] = [];
    for (let tier = 1; tier <= maxTier; tier++) {
      const config = raidConfig(spec, tier, challenger);
      const p = profileFor(config.depth, config);
      const under = this.state.player.level < p.recommendedLevel;
      const best = tier === maxTier && maxTier > 1;
      rows.push(`
        <div class="row ${tier - 1 === this.cursor ? "on" : ""}" data-index="${tier - 1}">
          <div class="row-main">
            <span class="depth">T${String(tier).padStart(2, "0")}</span>
            <span class="name">${escapeHtml(spec.name)}</span>
            ${best ? '<span class="badge boss">NEW</span>' : ""}
          </div>
          <div class="row-side ${under ? "warn" : ""}">
            req. ${levelLabel(p)} · depth ${config.depth} · danger ×${config.danger.toFixed(2)}
          </div>
        </div>`);
    }
    rows.push(this.renderChallengerRow(maxTier));

    const sel = raidConfig(spec, Math.min(this.cursor + 1, maxTier), challenger);
    const other = RAIDS.map((r) =>
      `<span style="color:${r === spec ? MODES.raid.color : "#5a6270"}">${escapeHtml(r.name)}</span>`,
    ).join(" / ");

    return `<div class="list">${rows.join("")}</div>
      <aside class="side">
        <p class="muted" style="font-style:italic">${escapeHtml(MODES.raid.lore)}</p>
        ${layer ? `<p class="muted"><b>${escapeHtml(layer.name)}</b> · ${escapeHtml(layer.lore)}</p>` : ""}
        <h3 style="color:${MODES.raid.color}">${escapeHtml(spec.name)}</h3>
        <p class="muted">${other}
          <!-- data-index parks the cursor back on a tier row, not the Challenger row
               below it, so this chip always switches the raid rather than
               occasionally being read as a Challenger adjustment. -->
          <span class="chip" data-action="left" data-index="0">◀ ${k(this.state.settings, "left")}</span>
          <span class="chip" data-action="right" data-index="0">${k(this.state.settings, "right")} ▶</span></p>
        <p class="muted" style="font-style:italic">${escapeHtml(spec.lore)}</p>
        <p>${escapeHtml(spec.blurb)}</p>
        ${unlocked ? "" : `<p class="danger">Sealed. Reach ${spec.unlockFrontier} on either
          ladder — the layer it stands at has to be yours before it will look at you.</p>`}
        <table class="cmp">
          <tr><td>Floors</td><td>1 — it is the boss</td></tr>
          <tr><td>Depth</td><td>${sel.depth}</td></tr>
          <tr><td>Danger</td><td>×${sel.danger.toFixed(2)}</td></tr>
          <tr><td>Local element</td><td style="color:${ELEMENT_COLORS[spec.element]}">${ELEMENT_LABELS[spec.element]}</td></tr>
        </table>
        ${this.previewBlock(previewForRun(sel))}
        <p class="muted">Its table is the only place its items come from, and the top of
        that table opens at a tier. Clearing it and banking opens the next one.</p>
        <p class="danger">Solo, for now. Die and you lose every coin, key and item you
        picked up in there.</p>
        <p>Opening a portal doesn't dive — it spawns one on the deck. Walk into it when
        you're ready.</p>
        ${this.challengerBadgeLine(this.state.player.raidChallengerBadges[spec.id] ?? 0, "Challenger clears")}
      </aside>`;
  }

  /** The switcher pill pair shared by both Forge screens — Craft and Reforge. */
  private renderForgeSwitcher(): string {
    return `<div class="chest-cats">
        <div class="chest-cat ${this.forgeMode === "craft" ? "on" : ""}" data-forge-mode="craft">Craft</div>
        <div class="chest-cat ${this.forgeMode === "reforge" ? "on" : ""}" data-forge-mode="reforge">Reforge</div>
        <div class="chest-cat ${this.forgeMode === "named" ? "on" : ""}" data-forge-mode="named">Named</div>
      </div>`;
  }

  /**
   * The Altar (`docs/memories.md`) — three screens sharing one station, the same idiom
   * the Forge uses, flipped with [I]/[O].
   *
   * A Memory is a recollection the Keepers pinned down: one place the war went through,
   * made to come back whole. The Vault lists what you hold, Recall makes a new one at a
   * rarity you pay for, and the workbench shapes one you already have — every op rolls,
   * none of them lets you pick a modifier, which is what keeps a Memory from becoming a
   * spreadsheet.
   */
  private renderAltar(): string {
    if (!this.state.altarUnlocked) {
      const p = this.state.player;
      return `<div class="list"></div>
        <aside class="side">
          <h3>Shut</h3>
          <p class="muted">Purgatory is built out of what it remembers, and it never
          remembers the same way twice. Pinning one down takes a character who has been to
          both ends of the war.</p>
          <table class="cmp">
            <tr><td>Depth banked</td><td class="${p.deepestDepth >= MEMORY_UNLOCK_DEPTH ? "" : "warn"}">${p.deepestDepth} / ${MEMORY_UNLOCK_DEPTH}</td></tr>
            <tr><td>Height banked</td><td class="${p.highestHeight >= MEMORY_UNLOCK_HEIGHT ? "" : "warn"}">${p.highestHeight} / ${MEMORY_UNLOCK_HEIGHT}</td></tr>
          </table>
          <p class="muted">Both, on this character. The record is per class on purpose —
          the Altar is what a finished character earns, not something an alt inherits.</p>
        </aside>`;
    }
    if (this.altarMode === "recall") return this.renderRecall();
    return this.renderVault();
  }

  private renderAltarSwitcher(): string {
    return `<div class="chest-cats">
        ${ALTAR_MODES.map((m) => `<div class="chest-cat ${this.altarMode === m ? "on" : ""}" data-altar-mode="${m}">${
          m === "vault" ? "Vault" : m === "recall" ? "Recall" : "Workbench"
        }</div>`).join("")}
      </div>`;
  }

  /**
   * One Memory as a list row — its rarity, the place it remembers and how deep it is.
   *
   * `data-altar-item`, not `data-index` (docket §18). A Memory card is precisely the thing
   * you click to read its boons and burdens, and the generic row handler both selects and
   * calls `primary()` — which on the workbench spends Ash, and on `forget` destroys the
   * Memory outright. Selecting is this; executing is the action strip below the list.
   *
   * The Recall screen deliberately keeps `data-index`: its rows are rarity tiers, where
   * click-to-fire *is* the intent and the row has no second meaning. That is the line
   * docket §18 draws, and it is the reason this is two screens rather than ten.
   */
  private memoryRows(): string {
    if (this.state.memories.length === 0) {
      return `<div class="row"><div class="row-main"><span class="name muted">The Vault is empty. Recall one.</span></div></div>`;
    }
    return this.state.memories.map((m, i) => `
        <div class="row ${i === this.cursor ? "on" : ""}" data-altar-item="${i}">
          <div class="row-main">
            <span class="dot" style="background:${RARITY_COLORS[m.rarity]}"></span>
            <span class="name" style="color:${RARITY_COLORS[m.rarity]}">${escapeHtml(m.placeId)}</span>
          </div>
          <div class="row-side">depth ${m.depth} · ${m.burdens.length}/${memoryPairs(m.rarity)} pairs</div>
        </div>`).join("");
  }

  /** The two lists, side by side — what it kept, and what it got wrong. */
  private memoryModBlock(memory: MemoryInstance): string {
    const boons = memory.boons.map((b) => `<li>
        <b style="color:#4ade80">${escapeHtml(memoryModLabel(MEMORY_BOONS[b.id].name, b.grade))}</b>
        <span class="muted">${escapeHtml(memoryModMagnitude(b))}</span>
        <em>${escapeHtml(MEMORY_BOONS[b.id].blurb)}</em></li>`).join("");
    const burdens = memory.burdens.map((b) => `<li>
        <b style="color:#ef4444">${escapeHtml(memoryModLabel(MEMORY_BURDENS[b.id].name, b.grade))}</b>
        <span class="muted">${escapeHtml(memoryModMagnitude(b))}</span>
        <em>${escapeHtml(MEMORY_BURDENS[b.id].blurb)}</em></li>`).join("");
    return `
      <h3>What it kept</h3>
      <ul class="pulls">${boons || '<li class="muted">Nothing.</li>'}</ul>
      <h3>What it got wrong</h3>
      <ul class="pulls">${burdens || '<li class="muted">Nothing.</li>'}</ul>`;
  }

  /** The Vault and the workbench share a list; only the aside differs. */
  private renderVault(): string {
    const memory = this.state.memories[this.cursor];
    const pane = `<div class="forge-pane">${this.renderAltarSwitcher()}<div class="list">${this.memoryRows()}</div></div>`;
    if (!memory) {
      return `${pane}
        <aside class="side">
          <h3>Nothing to remember</h3>
          <p class="muted">Recall a Memory first. The rarity is what you pay for; the
          place, the encounter and everything it carries are what you get.</p>
        </aside>`;
    }
    const config = memoryConfig(memory, 1, this.state.challengerTier);
    const profile = profileFor(config.depth, config);
    if (this.altarMode === "workbench") {
      const cost = memoryOpCost(this.altarOp, memory.rarity);
      const ops = MEMORY_OPS.map((op) =>
        `<span class="chip ${op === this.altarOp ? "on" : ""}" data-altar-op="${op}">${MEMORY_OP_INFO[op].label}</span>`,
      ).join(" ");
      return `${pane}
        <aside class="side">
          <h3>${rarityLabel(memory.rarity)} Memory of ${escapeHtml(memory.placeId)}</h3>
          <p class="muted">${ops}</p>
          <p>${escapeHtml(MEMORY_OP_INFO[this.altarOp].blurb)}</p>
          <table class="cmp">
            ${this.altarOp === "forget"
              ? `<tr><td>Returns</td><td>${formatNumber(memoryForgetAsh(memory.rarity))} ${ASH_NAME}</td></tr>`
              : `<tr><td>${ASH_NAME}</td><td class="${this.state.ash >= cost.ash ? "" : "warn"}">${formatNumber(cost.ash)}</td></tr>
                 <tr><td>Coins</td><td class="${this.state.coins >= cost.coins ? "" : "warn"}">${formatNumber(cost.coins)}</td></tr>
                 ${cost.scrap > 0 ? `<tr><td>${escapeHtml(MATERIALS.physical.name)}</td><td class="${this.state.materials.physical >= cost.scrap ? "" : "warn"}">${formatNumber(cost.scrap)}</td></tr>` : ""}`}
          </table>
          ${this.memoryModBlock(memory)}
          <p class="muted">Every operation rolls. None of them lets you choose — you push
          a Memory toward what you want, you do not write it.</p>
        </aside>
        ${this.renderAltarActions(memory)}`;
    }
    return `${pane}
      <aside class="side">
        <h3>${rarityLabel(memory.rarity)} Memory of ${escapeHtml(memory.placeId)}</h3>
        <p class="muted">${escapeHtml(MODES.memory.lore)}</p>
        <table class="cmp">
          <tr><td>Depth</td><td>${memory.depth} → ${memory.depth + MODES.memory.floors - 1}</td></tr>
          <tr><td>Floors</td><td>${MODES.memory.floors}, the last one the encounter</td></tr>
          <tr><td>Recommended</td><td>${levelLabel(profile)}</td></tr>
        </table>
        ${this.memoryModBlock(memory)}
        ${memoryRarityAllowance(memory) > MEMORY_RARITY_CAP
          ? `<p class="muted">This one is burdened enough to bend the table past anything
             else in the game — barely, and only because of what it is asking of you.</p>`
          : ""}
        ${this.previewBlock(previewForRun(config))}
        <p class="muted">Spent the moment you walk into its portal. Dying in it does not
        give it back.</p>
      </aside>
      ${this.renderAltarActions(memory)}`;
  }

  /**
   * The Altar's action strip (docket §18) — the same control the workbench uses, not a
   * third copy of the idea. Three screens with this architecture and three private confirm
   * paths is how the owner reports it a fourth time.
   *
   * The Vault and the workbench ask different questions of the same Memory, so the button
   * says which: in the Vault it opens a portal (a plan, spending nothing until you walk
   * into it), on the workbench it runs the selected op — and `forget`, which destroys the
   * Memory for Ash, is the one that turns the button red *and* takes two presses, the
   * same gate salvaging what you're wearing has. Red is a colour, not a confirmation.
   */
  private renderAltarActions(memory: MemoryInstance): string {
    if (this.altarMode !== "workbench") {
      return this.renderActionBar({
        label: "Open its portal",
        target: `<span style="color:${RARITY_COLORS[memory.rarity]}">${rarityLabel(memory.rarity)} Memory of ${
          escapeHtml(memory.placeId)}</span>`,
        title: "Spawns the portal back at the Citadel. The Memory is spent when you walk into it, not now.",
        standalone: true,
      });
    }
    const info = MEMORY_OP_INFO[this.altarOp];
    const armed = this.forgetArmed === memory.id;
    const arming = this.altarOp === "forget" && !armed;
    return this.renderActionBar({
      label: this.altarOp !== "forget" ? info.label
        : arming ? `${info.label} it — it does not come back?` : `${info.label} it anyway`,
      target: `<span style="color:${RARITY_COLORS[memory.rarity]}">${rarityLabel(memory.rarity)} Memory of ${
        escapeHtml(memory.placeId)}</span>`,
      // One copy of the refusal rules, on `GameState` beside the op that enforces them.
      blocker: this.state.memoryOpBlocker(memory.id, this.altarOp),
      danger: this.altarOp === "forget",
      title: info.blurb,
      standalone: true,
    });
  }

  /** Recall: buy the tier, roll the character. */
  private renderRecall(): string {
    const rows = MEMORY_RARITIES.map((rarity, i) => {
      const cost = memoryRecallCost(rarity);
      const afford = this.state.materials.physical >= cost.scrap && this.state.coins >= cost.coins;
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-index="${i}">
          <div class="row-main">
            <span class="dot" style="background:${RARITY_COLORS[rarity]}"></span>
            <span class="name" style="color:${RARITY_COLORS[rarity]}">${rarityLabel(rarity)}</span>
          </div>
          <div class="row-side ${afford ? "" : "warn"}">
            ${formatNumber(cost.scrap)} ${escapeHtml(MATERIALS.physical.name)} · ${formatNumber(cost.coins)} coins
          </div>
        </div>`;
    }).join("");
    const selected = MEMORY_RARITIES[this.cursor] ?? MEMORY_RARITIES[0]!;
    return `<div class="forge-pane">${this.renderAltarSwitcher()}<div class="list">${rows}</div></div>
      <aside class="side">
        <h3>Recall a ${rarityLabel(selected)} Memory</h3>
        <p class="muted">You pay for the tier. The place it remembers, what is standing in
        it, how deep it runs and everything it carries are Purgatory's to decide.</p>
        <table class="cmp">
          <tr><td>Pairs</td><td>${memoryPairs(selected)}</td></tr>
          <tr><td>Vault</td><td>${this.state.memories.length} / ${MEMORY_VAULT_CAP}</td></tr>
          <tr><td>${escapeHtml(MATERIALS.physical.name)}</td><td>${formatNumber(this.state.materials.physical)}</td></tr>
          <tr><td>${ASH_NAME}</td><td>${formatNumber(this.state.ash)}</td></tr>
        </table>
        <p class="muted">Every Memory carries as many boons as burdens and never more —
        nothing here is given away. Rarity buys more of both, and worse grades of both.</p>
        <p class="muted">Divine and unspoken are the item ladder's, not this one. A Memory
        stops at mythic.</p>
        ${this.challengerBadgeLine(this.state.player.challengerBadges.memory, "Challenger clears")}
      </aside>`;
  }

  /**
   * The forge: pick a rarity, a category and (optionally) an essence, and see the cost
   * before spending anything — a chest never shows you that in advance, which is the
   * whole difference between gambling and crafting. tabPrev/tabNext flip to Reforge,
   * the other half of this station.
   */
  private renderCraft(): string {
    if (this.forgeMode === "reforge") return this.renderReforge();
    if (this.forgeMode === "named") return this.renderNamedForge();

    const category = this.craftCategory;
    const essence = this.craftEssence;
    const rows = CRAFTABLE_RARITIES.map((rarity, i) => {
      const bulk = craftBulkCost(rarity);
      const essenceCost = essence ? craftEssenceCost(rarity) : 0;
      const afford = this.state.materials.physical >= bulk && (!essence || this.state.materials[essence] >= essenceCost);
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-index="${i}">
          <div class="row-main">
            <span class="dot" style="background:${RARITY_COLORS[rarity]}"></span>
            <span class="name" style="color:${RARITY_COLORS[rarity]}">${rarityLabel(rarity)}</span>
          </div>
          <div class="row-side ${afford ? "" : "warn"}">
            ${formatNumber(bulk)} ${escapeHtml(MATERIALS.physical.name)}${essence ? ` · ${formatNumber(essenceCost)} ${escapeHtml(MATERIALS[essence].name)}` : ""}
          </div>
        </div>`;
    }).join("");

    const bag = ELEMENTS.map((e) =>
      `<tr><td style="color:${MATERIALS[e].color}">${escapeHtml(MATERIALS[e].name)}</td><td>${formatNumber(this.state.materials[e])}</td></tr>`,
    ).join("");

    // Every essence at once, rather than cycling blind through eight with left/right —
    // the ◀▶ chips still work (a click here or a keypress land on the same field), this
    // is just also visible without touching either.
    const essenceOptions: (Element | null)[] = [null, ...CRAFT_ESSENCES];
    const essenceBar = `<div class="essence-bar">
        ${essenceOptions.map((e) => `<span class="sf-pill ${e === essence ? "sel" : ""}"
              data-essence="${e ?? "none"}"
              style="--r:${e ? ELEMENT_COLORS[e] : "var(--accent)"}">${e ? ELEMENT_LABELS[e] : "None"}</span>`).join("")}
      </div>`;

    return `<div class="forge-pane">${this.renderForgeSwitcher()}<div class="list">${rows}</div></div>
      <aside class="side">
        <h3>Craft: <b>${CRAFT_CATEGORY_LABELS[category]}</b>
          <span class="chip" data-action="tertiary">${k(this.state.settings, "special")} cycle</span></h3>
        <p class="muted">Divine and unspoken stay chest-only — everything from common to
        mythic is fair game here, at a price that climbs steeply with the rarity.</p>
        <h3>Essence: <b style="color:${essence ? ELEMENT_COLORS[essence] : "#9aa4b2"}">
          ${essence ? ELEMENT_LABELS[essence] : "None"}</b></h3>
        ${essenceBar}
        <p class="muted">Biases the roll toward that element's damage or resist affix,
        instead of only ever hoping for it.</p>
        <h3>Materials</h3>
        <table class="cmp">${bag}<tr><td>${ASH_NAME}</td><td>${formatNumber(this.state.ash)}</td></tr></table>
        <p class="muted">Dropped by monsters and mined from resource nodes — Reliquary
        sectors only. The dive and the rifts never pay in these. ${ASH_NAME} comes from
        salvaging at the Reforge bench.</p>
      </aside>`;
  }

  /**
   * Named recipes (UAT §25): the Forge's third screen. Every definition with a `craft`
   * source, the exact bill for each, and the item's own lore beside it — a chest never
   * tells you what you're paying for; this does.
   */
  private renderNamedForge(): string {
    const defs = craftableNamed();
    const rows = defs.map((def, i) => {
      const afford = this.state.canAffordNamed(def.id);
      // `data-named-recipe`, not `data-index` (docket §18). These rows have a full recipe
      // panel beside them, so clicking one is how you *read* it — and the generic row
      // handler would call `primary()`, which is `craftNamed`: it consumes stash item
      // components (§24), and a generic line can eat a legendary you meant to inspect.
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-named-recipe="${i}">
          <div class="row-main">
            <span class="dot" style="background:${RARITY_COLORS[def.rarity]}"></span>
            <span class="name" style="color:${RARITY_COLORS[def.rarity]}">${escapeHtml(def.name)}</span>
          </div>
          <div class="row-side ${afford ? "" : "warn"}">${escapeHtml(rarityLabel(def.rarity))} ${escapeHtml(def.type)}</div>
        </div>`;
    }).join("");
    const def = defs[this.cursor];
    const bag = ELEMENTS.map((e) =>
      `<tr><td style="color:${MATERIALS[e].color}">${escapeHtml(MATERIALS[e].name)}</td><td>${formatNumber(this.state.materials[e])}</td></tr>`,
    ).join("");
    return `<div class="forge-pane">${this.renderForgeSwitcher()}<div class="list">${rows
        || '<p class="muted">No named recipes yet.</p>'}</div></div>
      <aside class="side">
        ${def ? this.renderNamedRecipe(def) : '<p class="muted">Nothing on the anvil.</p>'}
        <h3>Materials</h3>
        <table class="cmp">${bag}</table>
        <p class="muted">A named recipe is exact — no rarity dial, no essence, no gamble.
        What it lists is what it costs, and what it makes is what it says.</p>
      </aside>
      ${def
        ? this.renderActionBar({
            label: "Forge it",
            target: `<span style="color:${RARITY_COLORS[def.rarity]}">${escapeHtml(def.name)}</span>`,
            // `canAffordNamed` is the same check `craftNamed` makes before it spends
            // anything, so the button and the recipe can't disagree about the bill.
            blocker: this.state.canAffordNamed(def.id) ? null : "The recipe asks for more than you have.",
            title: "Consumes exactly what the bill lists — materials, coins, and the stash items named on it.",
            standalone: true,
          })
        : ""}`;
  }

  /** One named recipe, priced line by line against what's in the bag. */
  private renderNamedRecipe(def: NamedItemDef): string {
    const recipe = craftRecipeFor(def);
    if (!recipe) return "";
    const dctx: DescribeCtx = {
      abilityName: (id) => ALL_CLASSES.flatMap((c) => c.abilities).find((a) => a.id === id)?.name,
    };
    const lines = describeEffects((def.effects ?? []) as readonly NodeEffect[], dctx)
      .map((l) => `<li>${escapeHtml(l)}</li>`).join("");
    const mods = def.mods.map((m) => {
      const v = Array.isArray(m.value) ? m.value[1] : (m.value as number);
      const lo = Array.isArray(m.value) ? m.value[0] : v;
      const range = lo !== v ? `${fmtMod(m.key, lo)}–${fmtMod(m.key, v)}` : fmtMod(m.key, v);
      return `<tr><td>${escapeHtml(shortLabel(m.key))}</td><td>${range}${m.scale === "rarity" ? " <span class=\"muted\">× rarity</span>" : ""}</td></tr>`;
    }).join("");
    const components = (recipe.items ?? []).map((req) => {
      const have = this.state.inventory.filter((it) => itemMeetsRequirement(req, it)).length;
      const label = requirementLabel(req, (id) => NAMED_BY_ID[id]?.name ?? id);
      return `<tr><td>${escapeHtml(label)}</td><td class="${have >= req.count ? "" : "warn"}">${have} <span class="muted">in the stash</span></td></tr>`;
    });
    const bill = components.concat((Object.entries(recipe.materials) as [Element, number][])
      .filter(([, n]) => n > 0)
      .map(([e, n]) => `<tr><td style="color:${MATERIALS[e].color}">${escapeHtml(MATERIALS[e].name)}</td>
        <td class="${this.state.materials[e] >= n ? "" : "warn"}">${formatNumber(n)} <span class="muted">/ ${formatNumber(this.state.materials[e])}</span></td></tr>`))
      .concat(recipe.coins > 0
        ? [`<tr><td>Coins</td><td class="${this.state.coins >= recipe.coins ? "" : "warn"}">${formatNumber(recipe.coins)} <span class="muted">/ ${formatNumber(this.state.coins)}</span></td></tr>`]
        : [])
      .join("");
    const grantName = def.grant ? dctx.abilityName?.(def.grant) : undefined;
    return `
      <h3 style="color:${RARITY_COLORS[def.rarity]}">${escapeHtml(def.name)}</h3>
      <p class="muted" style="font-style:italic">${escapeHtml(def.flavor)}</p>
      <p>${escapeHtml(def.description)}</p>
      <table class="cmp">${mods}</table>
      ${lines ? `<ul class="pulls">${lines}</ul>` : ""}
      ${grantName ? `<p style="color:#7dd3fc">Grants <b>${escapeHtml(grantName)}</b>.</p>` : ""}
      ${def.trigger ? `<p style="color:${ELEMENT_COLORS[def.trigger.element]}">${escapeHtml(triggerLine(def.trigger))}</p>` : ""}
      <h3>The bill</h3>
      <table class="cmp">${bill}</table>`;
  }

  /** Every item the active character could reforge: worn first, then the stash. */
  private reforgeCandidates(): Item[] {
    const equipment = this.state.player.equipment;
    const worn = EQUIP_SLOTS.map((slot) => equipment[slot]).filter((it): it is Item => it !== null);
    return [...worn, ...this.state.inventory];
  }

  /** Every item id currently worn on the active character — the one set both the
   *  Reforge grid's badge and the salvage-confirm gate read, so they can't disagree. */
  private wornItemIds(): Set<string> {
    return new Set(
      EQUIP_SLOTS.map((slot) => this.state.player.equipment[slot]?.id).filter((id): id is string => !!id),
    );
  }

  /**
   * The green-up / red-down arrow a card wears when it beats what's in its slot — the
   * Stash's comparison, and the *only* one (docket §14). `itemScore` already knows about
   * weapon affinity, so a second scoring path here would quietly disagree with the arrows
   * two screens over; there is one function and both grids call it.
   *
   * An item that *is* the thing it would be compared against gets no arrow: the Forge
   * grid lists worn gear alongside the stash, and "this item is exactly as good as
   * itself" is not a fact worth drawing.
   */
  private upgradeMark(it: Item): string {
    const worn = this.state.player.equipment[it.slot];
    if (!worn || worn.id === it.id) return "";
    const delta = itemScore(it, this.state.heroClass) - itemScore(worn, this.state.heroClass);
    if (delta > 0) return '<span class="ic-mark up" title="beats what you have in that slot">▲</span>';
    return delta < 0 ? '<span class="ic-mark down" title="worse than what you have in that slot">▼</span>' : "";
  }

  /**
   * Reforge: the other half of the Forge. Same card grid Stash uses, so a piece of gear
   * still reads the same way it does everywhere else — clicking (or confirming) a card
   * rerolls its affixes on the spot, at the cost already shown on it, exactly like
   * clicking a rarity row crafts one over in Craft mode.
   */
  private renderReforge(): string {
    const items = this.reforgeCandidates();
    if (items.length === 0) {
      return `<div class="forge-pane">${this.renderForgeSwitcher()}
          <div class="stash-grid empty"><div class="stash-none">Nothing to reforge yet — equip or find something first.</div></div>
        </div>
        <aside class="side"><p class="muted">Reforging rerolls an item's affixes for coins
        and Iron Scrap, climbing hard with rarity. It never touches the base stats, a
        granted skill or a trigger.</p></aside>`;
    }

    const wornIds = this.wornItemIds();
    const cards = items.map((it, i) => {
      // The lock badge answers "could the *current* op run on this one?" — same quote the
      // side panel prices from, so the grid and the panel can never disagree.
      const quote = this.state.forgeQuote(it.id, this.forgeOp, 0);
      const icon = pixelImageTag(itemArt(it), 64, 64, itemArtKey("item", it));
      const worn = wornIds.has(it.id);
      // `data-forge-item`, not `data-index`: the generic row handler both moves the
      // cursor AND fires `primary()`, which on this screen spends Ash on a one-way
      // operation. That is exactly the owner-reported bug in docket §15 — "you have to be
      // careful not to click the item itself" — so a card on this grid gets its own
      // attribute whose handler only ever selects. Executing lives in one place, the
      // confirm button in `.wb-actions`.
      return `
        <div class="item-card ${i === this.cursor ? "on" : ""}" data-forge-item="${i}"
             style="--r:${RARITY_COLORS[it.rarity]}" title="${escapeHtml(quote?.blocker ?? "")}">
          ${worn
            ? `<span class="ic-mark worn" title="equipped — the current character has this on">WORN</span>`
            : this.upgradeMark(it)}
          ${quote?.blocker ? `<span class="ic-lock">✕</span>` : ""}
          <div class="ic-art">${icon}</div>
          <span class="ic-name" style="color:${RARITY_COLORS[it.rarity]}">${escapeHtml(it.name)}</span>
          <span class="ic-slot">${it.slot}</span>
        </div>`;
    }).join("");

    const sel = items[this.cursor];
    return `<div class="forge-pane">${this.renderForgeSwitcher()}<div class="stash-grid">${cards}</div></div>
      <aside class="side">
        ${sel ? this.renderCompare(sel) : `<p class="muted">Pick something to work on.</p>`}
      </aside>
      ${sel ? this.renderWorkbench(sel) : ""}`;
  }

  /**
   * The workbench (UAT §24/§26/§27, redone per direct owner feedback on a screenshot: it
   * was "still messy, hard to read, I have to scroll to do anything"). Every operation
   * the Forge can do to the selected item now lives in its own bar under the card grid —
   * outside the reading sidebar entirely — laid out as real buttons in their five
   * clusters (the same grouping as before, just horizontal instead of a stacked column).
   * A button carries its own cost; what it *does* is a popup under that specific button
   * on hover, opening upward so it can never cover the strip below. The sidebar goes
   * back to only ever reading the item (`renderCompare`, called from `renderReforge`) —
   * nothing here writes to it.
   *
   * Owner feedback on a second screenshot: the selected op's blurb used to live in this
   * same hover popup, kept open by an `.on` rule so keyboard-only play could still read
   * it — which meant hovering a *different* op stacked a second popup on top of the
   * first, and both spilled over the cost strip below. The fix is to stop the selected
   * op's description from ever being a popup at all: it's the first line of `.op-detail`
   * now, a real static line, not a floating box. `.op-tip` is hover-only after that, so
   * at most one is ever on screen, and it can't cover the strip because it opens upward.
   */
  private renderWorkbench(item: Item): string {
    if (this.forgeAffix >= item.mods.length) this.forgeAffix = 0;
    const s = this.state.settings;
    const worn = this.wornItemIds().has(item.id);
    const salvagingWorn = this.forgeOp === "salvage" && worn;
    const armed = this.salvageArmed === item.id;

    const opButton = (op: ForgeOp) => {
      const q = this.state.forgeQuote(item.id, op, this.forgeAffix);
      const info = FORGE_OP_INFO[op];
      const on = op === this.forgeOp;
      const cost = q ? [
        q.ash ? `${formatNumber(q.ash)} ${ASH_NAME}` : "",
        q.coins ? `${formatNumber(q.coins)}c` : "",
        q.scrap ? `${formatNumber(q.scrap)} scrap` : "",
      ].filter(Boolean).join(" · ") : "";
      // The tooltip text still rides along as a native `title` too — a screen reader or
      // a slow hover gets it even before the CSS popup has rendered.
      return `<span class="chip op-btn ${on ? "on" : ""} ${q?.blocker ? "dim" : ""}" data-forge-op="${op}"
          title="${escapeHtml(info.blurb)}${q?.blocker ? `\n${escapeHtml(q.blocker)}` : ""}">
        <span class="op-btn-label">${escapeHtml(info.label)}</span>
        ${cost ? `<span class="op-btn-cost">${escapeHtml(cost)}</span>` : ""}
        <span class="op-tip"><b>${escapeHtml(info.label)}</b> ${escapeHtml(info.blurb)}${
          q?.blocker ? `<br><span class="danger">${escapeHtml(q.blocker)}</span>` : ""}</span>
      </span>`;
    };
    // Same five clusters `docs/forge.md`'s table already gives the eleven ops — Reroll /
    // Granted skill / Trigger / Rarity / Destroy — now arranged as columns in one row
    // instead of stacked rows in a column. `FORGE_OP_GROUPS` stays presentation only:
    // cycling with `special`, and `navWorkbenchOps`'s left/right, both still walk it as
    // the flat `FORGE_OPS` list / the column layout respectively, never a second source
    // of what ops exist.
    const cols = FORGE_OP_GROUPS.map((g) =>
      `<div class="op-col"><span class="op-col-label">${escapeHtml(g.label)}</span>
        <div class="op-col-btns">${g.ops.map(opButton).join("")}</div></div>`,
    ).join("");

    const info = FORGE_OP_INFO[this.forgeOp];
    const quote = this.state.forgeQuote(item.id, this.forgeOp, this.forgeAffix);
    // Everything below is specific to the *selected* op and can't be a per-button hover
    // popup: picking an affix, arming a salvage confirm and the cost breakdown are things
    // you do or read about the op that's actually about to run, not a preview of another
    // one. It's the compact "acting" strip the bar keeps outside the sidebar for.
    //
    // The blurb line is the one piece that *used* to be a hover popup — see the class
    // doc comment above `renderWorkbench`. It's a plain line here now, always visible,
    // so keyboard-only play still reads what the selected op does with nothing to hover.
    // No label prefix: the selected chip right above already names it in `.chip.on`.
    const blurb = `<p class="op-detail-blurb">${escapeHtml(info.blurb)}</p>`;
    const affixes = info.needsAffix && item.mods.length > 0
      ? `<div class="op-detail-row"><span class="op-detail-label">Affix</span>${item.mods.map((m, i) => {
          const range = affixRange(item, i);
          const span = range ? ` <span class="muted">(${fmtMod(m.key, range[0])}–${fmtMod(m.key, range[1])})</span>` : "";
          return `<span class="chip ${i === this.forgeAffix ? "on" : ""}" data-forge-affix="${i}">${escapeHtml(modShort(m))}${span}</span>`;
        }).join(" ")}</div>`
      : "";
    const components = this.forgeOp === "ascend" && quote && quote.components.length > 0
      ? `<p class="muted">Melts down: ${quote.components.map((c) => `<span style="color:${RARITY_COLORS[c.rarity]}">${escapeHtml(c.name)}</span>`).join(", ")}.</p>`
      : "";
    const salvage = this.forgeOp === "salvage"
      ? (() => {
          const y = salvageYield(item);
          const mats = (Object.entries(y.materials) as [Element, number][]).filter(([, n]) => n > 0)
            .map(([e, n]) => `${n} ${MATERIALS[e].name}`);
          const warning = salvagingWorn
            ? `<p class="danger">⚠ ${escapeHtml(item.name)} is currently equipped. Salvaging it unequips and destroys it — this can't be undone.</p>`
            : "";
          return `${warning}<p>Returns <b>${formatNumber(y.ash)} ${ASH_NAME}</b>${mats.length ? ` and ${escapeHtml(mats.join(", "))}` : ""}. The item is gone.</p>`;
        })()
      : "";
    const cost = quote && (quote.ash || quote.coins || quote.scrap)
      ? `<table class="cmp">
          ${quote.ash ? `<tr><td>${ASH_NAME}</td><td class="${this.state.ash >= quote.ash ? "" : "warn"}">${formatNumber(quote.ash)} <span class="muted">/ ${formatNumber(this.state.ash)}</span></td></tr>` : ""}
          ${quote.coins ? `<tr><td>Coins</td><td class="${this.state.coins >= quote.coins ? "" : "warn"}">${formatNumber(quote.coins)} <span class="muted">/ ${formatNumber(this.state.coins)}</span></td></tr>` : ""}
          ${quote.scrap ? `<tr><td>${escapeHtml(MATERIALS.physical.name)}</td><td class="${this.state.materials.physical >= quote.scrap ? "" : "warn"}">${formatNumber(quote.scrap)} <span class="muted">/ ${formatNumber(this.state.materials.physical)}</span></td></tr>` : ""}
        </table>`
      : "";
    return `
      <div class="workbench-bar">
        <div class="workbench-bar-head">
          <h3>Workbench <span class="muted">${formatNumber(this.state.ash)} ${ASH_NAME}</span></h3>
          <span class="chip" data-action="tertiary">${k(s, "special")} cycle</span>
        </div>
        <div class="op-cols">${cols}</div>
        <div class="op-detail">
          ${blurb}
          ${affixes}
          ${components}
          ${salvage}
          ${cost}
          ${quote?.blocker ? `<p class="danger">${escapeHtml(quote.blocker)}</p>`
            : salvagingWorn && armed
              ? `<p class="danger">Confirm again to permanently salvage the item you're wearing.</p>`
              : salvagingWorn
                ? `<p class="muted">Salvaging what you're wearing needs a second confirm.</p>`
                : `<p class="muted">${ASH_NAME} comes from one place: salvaging. Coins and Iron Scrap are the
                    same ones everything else costs.</p>`}
        </div>
        ${this.renderPossibilities(item)}
        ${this.renderWorkbenchActions(item, quote)}
      </div>`;
  }

  /**
   * The possibilities panel (docket §10): standing in front of an op, what could it
   * actually give you?
   *
   * **Every list here comes from `forgePossibilities`, and that function reads the roll
   * sites themselves** — `modPoolFor`, `recastPool`, `augmentPool`, `inscribePool`,
   * `TRIGGER_SHAPES`, `affixRange`. This method knows how to *draw* a pool and nothing
   * whatsoever about what is in one. That is the §20 rule (`docs/drop-previews.md`)
   * applied to the bench: a preview that can drift out of sync with the roll is worse
   * than no preview, so there is no table on this side of the wall to drift.
   *
   * The rarity gate is shown rather than merely obeyed — a pool affix carries the
   * `minTier` it unlocked at, so "+1 projectile, epic" reads as a reason to ascend the
   * item instead of as an affix that mysteriously never appears.
   */
  private renderPossibilities(item: Item): string {
    const poss = forgePossibilities(item, this.forgeOp, this.forgeAffix);
    const chips = poss.outcomes.map((o) => {
      const range = o.range
        ? `<span class="wb-pool-val">${o.range[0] === o.range[1]
            ? fmtMod(o.key ?? "attack", o.range[0])
            : `${fmtMod(o.key ?? "attack", o.range[0])}–${fmtMod(o.key ?? "attack", o.range[1])}`}${
            o.key ? ` ${escapeHtml(shortLabel(o.key))}` : ""}</span>`
        : "";
      // Above common, say which rarity let it in. A pool the item cannot reach yet is
      // the most useful thing on this panel: it is the argument for ascending.
      const gate = o.minTier > 0
        ? `<span class="wb-pool-gate" style="color:${RARITY_COLORS[RARITIES[o.minTier] ?? "common"]}">${
            escapeHtml(RARITIES[o.minTier] ?? "")}</span>`
        : "";
      return `<span class="wb-pool-item"><span class="wb-pool-name">${escapeHtml(o.label)}</span>${range}${gate}</span>`;
    }).join("");
    return `<div class="wb-pool">
        <div class="wb-pool-head">
          <span class="op-detail-label">${escapeHtml(poss.heading)}</span>
          <span class="wb-pool-note">${escapeHtml(poss.note)}</span>
        </div>
        ${chips ? `<div class="wb-pool-list">${chips}</div>` : ""}
      </div>`;
  }

  /**
   * **The** action strip — one control, shared by every screen where picking a row and
   * running the op are two different acts (docket §15, then §18).
   *
   * The direction behind it is settled after three owner reports: a control that spends
   * something lives in its own fixed region, outside the scrolling grid and outside the
   * reading panel. What §18 added is that there must be exactly *one* of it. The Forge,
   * the Altar and the named-recipe screen share an architecture — a list you browse, a
   * panel that describes what you picked, an operation that consumes something — and three
   * private confirm paths is how this comes back a fourth time.
   *
   * The button is `data-confirm-action`, handled once in the click delegate, and all it
   * does is call `primary()` — the same function the `confirm` key calls, dispatched per
   * tab exactly as it always was. So the mouse path and the keyboard path are not merely
   * consistent, they are the same code, and a screen adopting this strip does not get to
   * invent a second way to execute.
   */
  private renderActionBar(spec: {
    /** What the button says. Name the act, not the screen: "Reforge", "Forge it", "Recall". */
    label: string;
    /** The thing it would act on, already escaped/coloured by the caller. */
    target: string;
    /** Why it can't run, or null. A blocked strip disables the button and shows this. */
    blocker?: string | null;
    /** Red rather than accent — destructive, or an armed second press. */
    danger?: boolean;
    /** Hover text when nothing is blocking it. */
    title?: string;
    /** True when this strip is a direct child of `.body` rather than inside the workbench. */
    standalone?: boolean;
  }): string {
    const blocked = !!spec.blocker;
    return `<div class="wb-actions ${spec.standalone ? "standalone" : ""}">
        <button class="wb-confirm ${spec.danger ? "danger" : ""} ${blocked ? "dim" : ""}" data-confirm-action="1"
                ${blocked ? "disabled" : ""} title="${escapeHtml(spec.blocker ?? spec.title ?? spec.label)}">
          ${escapeHtml(spec.label)}
        </button>
        <span class="wb-actions-target">
          ${spec.target}
          ${blocked ? `<span class="danger">${escapeHtml(spec.blocker!)}</span>` : ""}
        </span>
        <span class="wb-actions-hint">${k(this.state.settings, "confirm")}</span>
      </div>`;
  }

  /**
   * The workbench's strip (docket §15). Salvaging what you're wearing keeps its two-press
   * gate — it runs through this button rather than a private path of its own, which is
   * what the docket asked for. The first press arms, the second destroys.
   */
  private renderWorkbenchActions(item: Item, quote: ReturnType<GameState["forgeQuote"]>): string {
    const info = FORGE_OP_INFO[this.forgeOp];
    const worn = this.wornItemIds().has(item.id);
    const armed = this.salvageArmed === item.id;
    const arming = this.forgeOp === "salvage" && worn && !armed;
    return this.renderActionBar({
      label: quote?.blocker
        ? info.label
        : arming
          ? `${info.label} — the one you're wearing?`
          : armed ? `${info.label} it anyway` : info.label,
      target: `<span style="color:${RARITY_COLORS[item.rarity]}">${escapeHtml(item.name)}</span>`,
      blocker: quote?.blocker ?? null,
      danger: this.forgeOp === "salvage" || armed,
      title: info.blurb,
    });
  }

  /** Confirm on the bench: run the selected op on the selected item and say what happened. */
  private workbenchConfirm(): void {
    const item = this.reforgeCandidates()[this.cursor];
    if (!item) return;
    const op = this.forgeOp;
    const quote = this.state.forgeQuote(item.id, op, this.forgeAffix);
    if (quote?.blocker) {
      this.notify(quote.blocker, "#ef4444");
      return;
    }
    if (op === "salvage") {
      // Salvaging what you're wearing is allowed on purpose — but the first press only
      // arms it. A second press on the same item is what actually runs it, so an
      // accidental confirm can't destroy the thing on your back.
      if (this.wornItemIds().has(item.id) && this.salvageArmed !== item.id) {
        this.salvageArmed = item.id;
        this.notify(`${item.name} is equipped. Confirm again to salvage it anyway.`, "#ef4444");
        return;
      }
      this.salvageArmed = null;
      const y = this.state.salvageItem(item.id);
      if (y) {
        this.notify(`Salvaged ${item.name} for ${formatNumber(y.ash)} ${ASH_NAME}`, "#fbbf24");
        this.cursor = Math.max(0, Math.min(this.cursor, this.reforgeCandidates().length - 1));
        this.state.save();
      }
      return;
    }
    const after = this.state.applyForgeOp(item.id, op, this.forgeAffix);
    if (after) {
      const verb = op === "reforge" ? "Reforged" : op === "ascend" ? `Ascended to ${rarityLabel(after.rarity)}` : FORGE_OP_INFO[op].label;
      this.notify(`${verb}: ${after.name}`, RARITY_COLORS[after.rarity]);
      this.state.save();
    } else {
      this.notify("The Forge declined. Nothing was spent.", "#ef4444");
    }
  }

  /** The current Challenger dial, shown wherever a run gets configured. Set in Settings. */
  /**
   * The Vigil (UAT §17): today's floor, laid out before you enter — depth, the two
   * modifiers, the key it pays, and the countdown to the reset. One row, because there
   * is one decision: keep the Vigil, or don't.
   */
  private renderVigil(): string {
    const day = dayNumber();
    const plan = dailyPlan(day);
    const config = dailyConfig(day, this.state.challengerTier);
    const profile = profileFor(config.depth, config);
    const unlocked = dailyUnlocked(this.state.stats.deepestDepth);
    const cleared = this.state.daily.clearedDay === day;
    const under = this.state.player.level < profile.recommendedLevel;
    const mode = MODES.vigil;
    const countdown = formatCountdown(msUntilReset());

    const row = `
      <div class="row on" data-index="0">
        <div class="row-main">
          <span class="depth">${String(config.depth).padStart(2, "0")}</span>
          <span class="name">${cleared ? "Closed for today" : unlocked ? "Keep the Vigil" : "Sealed"}</span>
          ${cleared ? '<span class="badge">DONE</span>' : ""}
        </div>
        <div class="row-side ${cleared || !unlocked ? "warn" : under ? "warn" : ""}">
          ${cleared
            ? `next Vigil in ${countdown}`
            : unlocked
              ? `req. ${levelLabel(profile)} · ${escapeHtml(profile.name)} · danger ×${config.danger.toFixed(2)}`
              : `reach depth ${DAILY_UNLOCK_DEPTH} in the delve`}
        </div>
      </div>`;

    const twists = plan.modifiers.map((id) => {
      const m = DAILY_MODIFIERS[id];
      return `<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.blurb)}</td></tr>`;
    }).join("");

    return `<div class="list">${row}</div>
      <aside class="side">
        <h3 style="color:${mode.color}">${escapeHtml(DAILY_NAME)}</h3>
        <p class="muted" style="font-style:italic">${escapeHtml(mode.lore)}</p>
        <p class="muted"><b>${escapeHtml(profile.layer.name)}</b> · ${escapeHtml(profile.layer.lore)}</p>
        <p>${escapeHtml(mode.blurb)}</p>
        <p class="muted">Today's floor is the same for everyone, everywhere — same layout, same
        twists, same key. It resets at midnight UTC, in <b>${countdown}</b>.</p>
        <h3>Today's twists</h3>
        <table class="cmp">${twists}</table>
        <h3>Today's key</h3>
        <p>Closing the floor drops one <b>${escapeHtml(plan.keyTier)}</b> key in the clear
        cache, on top of the ordinary loot. Once a day. Die or bail out and you can try
        again; leaving early forfeits the floor like anywhere else.</p>
        <table class="cmp">
          <tr><td>Depth</td><td>${config.depth} · ${escapeHtml(profile.name)}</td></tr>
          <tr><td>Danger</td><td>×${config.danger.toFixed(2)}</td></tr>
          <tr><td>XP</td><td>×${mode.xpMult.toFixed(1)}</td></tr>
        </table>
        ${this.previewBlock(previewForRun(config))}
        <p>Vigils kept: <b>${this.state.stats.vigilsCleared}</b></p>
        ${this.challengerBadgeLine(this.state.player.challengerBadges.vigil, "Challenger clears")}
        ${this.challengerNote()}
      </aside>`;
  }

  /**
   * The Convergence (UAT §17): this week's four floors, laid out before you enter — the
   * depth each one reads at, the three modifiers, the boss floor's key and its
   * guaranteed item, and the countdown to the reset. Still one row, because there is
   * still one decision: open it, or don't. Floors 2-4 aren't separately chosen — they
   * follow automatically as each one clears, the same way an Abyssal Rift's do.
   */
  private renderConvergence(): string {
    const week = weekNumber();
    const plan = weeklyPlan(week);
    const config = weeklyConfig(week, 1, this.state.challengerTier);
    const profile = profileFor(config.depth, config);
    const unlocked = weeklyUnlocked(this.state.stats.deepestDepth);
    const cleared = this.state.weekly.clearedWeek === week;
    const under = this.state.player.level < profile.recommendedLevel;
    const mode = MODES.convergence;
    const countdown = formatCountdown(msUntilWeeklyReset());

    const row = `
      <div class="row on" data-index="0">
        <div class="row-main">
          <span class="depth">${String(config.depth).padStart(2, "0")}</span>
          <span class="name">${cleared ? "Closed for the week" : unlocked ? "Open the Convergence" : "Sealed"}</span>
          ${cleared ? '<span class="badge">DONE</span>' : ""}
        </div>
        <div class="row-side ${cleared || !unlocked ? "warn" : under ? "warn" : ""}">
          ${cleared
            ? `next Convergence in ${countdown}`
            : unlocked
              ? `req. ${levelLabel(profile)} · ${escapeHtml(profile.name)} · danger ×${config.danger.toFixed(2)}`
              : `reach depth ${WEEKLY_UNLOCK_DEPTH} in the delve`}
        </div>
      </div>`;

    const twists = plan.modifiers.map((id) => {
      const m = WEEKLY_MODIFIERS[id];
      return `<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.blurb)}</td></tr>`;
    }).join("");

    const floors = Array.from({ length: mode.floors }, (_, i) => {
      const f = i + 1;
      const fc = weeklyConfig(week, f, this.state.challengerTier);
      return `<tr><td>${f === mode.floors ? `Floor ${f} — Warden` : `Floor ${f}`}</td><td>${fc.depth}</td></tr>`;
    }).join("");

    return `<div class="list">${row}</div>
      <aside class="side">
        <h3 style="color:${mode.color}">${escapeHtml(WEEKLY_NAME)}</h3>
        <p class="muted" style="font-style:italic">${escapeHtml(mode.lore)}</p>
        <p class="muted"><b>${escapeHtml(profile.layer.name)}</b> · ${escapeHtml(profile.layer.lore)}</p>
        <p>${escapeHtml(mode.blurb)}</p>
        <p class="muted">This week's four floors are the same for everyone, everywhere —
        same layouts, same twists, same warden waiting at the end. It resets at the
        next UTC week, in <b>${countdown}</b>.</p>
        <h3>This week's floors</h3>
        <table class="cmp">${floors}</table>
        <h3>This week's twists</h3>
        <table class="cmp">${twists}</table>
        <h3>The warden's prize</h3>
        <p>Felling the warden on floor ${mode.floors} drops one <b>${escapeHtml(plan.keyTier)}</b>
        key and an item of at least <b style="color:${RARITY_COLORS[WEEKLY_GUARANTEED_RARITY]}">${escapeHtml(rarityLabel(WEEKLY_GUARANTEED_RARITY))}</b>
        rarity in the clear cache, on top of the ordinary loot — once a week. Dying or bailing out anywhere along the way
        costs you the run like any other floor, but never closes it; you can walk back in
        and try again until you win.</p>
        <table class="cmp">
          <tr><td>Danger</td><td>×${config.danger.toFixed(2)}</td></tr>
          <tr><td>XP</td><td>×${mode.xpMult.toFixed(1)}</td></tr>
          <tr><td>Gems</td><td>×${mode.gemMult.toFixed(1)}</td></tr>
        </table>
        <p>Convergences closed: <b>${this.state.stats.convergencesCleared}</b></p>
        ${this.challengerBadgeLine(this.state.player.challengerBadges.convergence, "Challenger clears")}
        ${this.challengerNote()}
      </aside>`;
  }

  private challengerNote(): string {
    const tier = this.state.challengerTier;
    if (tier <= 0) return `<p class="muted">Challenger off — crank it up from Settings.</p>`;
    return `<p style="color:#ff2d2d">Challenger <b>${tier}</b> — ${escapeHtml(challengerName(tier))}.
      ×${challengerMultiplier(tier).toFixed(1)} danger on top of everything above.
      <span class="muted">Change it in Settings.</span></p>`;
  }

  /**
   * Twenty pips for one Challenger completion badge — Nightmare's ten purple, Death
   * March's ten red, filled up to whatever tier this activity has actually been *banked*
   * at (never a death, never a bail-out; see `GameState.recordDepth`). A trophy: read
   * only here and on the Path screen, nowhere the simulation looks (`tools/badges.ts`).
   */
  private challengerPips(tier: number): string {
    return Array.from({ length: MAX_CHALLENGER_TIER }, (_, i) => {
      const n = i + 1;
      const color = n <= 10 ? "#a78bfa" : "#ff2d2d";
      return `<span style="color:${n <= tier ? color : "#3a4150"}">●</span>`;
    }).join("");
  }

  /** A commit-screen badge line for a fixed-length activity: the pips, plus which tier
   *  they add up to. Rift, sector, raid, Vigil and Convergence screens only — the Delve
   *  and the Tower use `challengerDepthBadgeLine` below instead. */
  private challengerBadgeLine(tier: number, label: string): string {
    const best = tier > 0
      ? ` — best <b style="color:${tier > 10 ? "#ff2d2d" : "#a78bfa"}">${escapeHtml(challengerName(tier))}</b>`
      : " — none banked yet";
    return `<p class="muted">${escapeHtml(label)}
      <span style="letter-spacing:2px">${this.challengerPips(tier)}</span>${best}</p>`;
  }

  /**
   * The Dive/Tower screens' commit-screen line for the per-tier depth badges. Unlike a
   * fixed activity's pip row, "cleared at Death March X" says nothing on its own here —
   * that's the whole defect the rework fixed — so this reads against the *currently
   * selected* Challenger tier and says how far the badge at that specific tier actually
   * reaches, next to how far this character has gotten overall.
   *
   * `badges` is `Player.delveChallengerBadges` or `.towerChallengerBadges`; `unit` is
   * "depth" or "height" so the same line serves both screens without guessing which one
   * it's on.
   */
  private challengerDepthBadgeLine(
    challengerTier: number, currentBest: number, badges: readonly number[], label: string, unit: string,
  ): string {
    if (challengerTier <= 0) {
      return `<p class="muted">${escapeHtml(label)} — Challenger is off.
        Turn it on in Settings to start banking a tiered clear here.</p>`;
    }
    const banked = badges[challengerTier - 1] ?? 0;
    const color = challengerTier > 10 ? "#ff2d2d" : "#a78bfa";
    const name = `<b style="color:${color}">${escapeHtml(challengerName(challengerTier))}</b>`;
    const status = banked > 0
      ? `you have ${name} here at ${unit} <b>${banked}</b>`
      : `no ${name} clear banked here yet`;
    return `<p class="muted">${escapeHtml(label)} — ${status}, you're at ${unit} <b>${currentBest}</b>.</p>`;
  }

  /**
   * The Path screen's per-tier answer for the Delve/Tower: twenty cells, one per
   * Challenger tier, each the deepest depth (or height) actually banked there — a `·`
   * where nothing's been banked yet — rather than a lit/unlit pip. A pip could only ever
   * say "cleared" or not; this says how far, which is the entire point of keying credit
   * on depth instead of on the activity (`Player.delveChallengerBadges`).
   */
  private depthBadgeCells(badges: readonly number[]): string {
    return badges.map((depth, i) => {
      const tier = i + 1;
      const color = tier <= 10 ? "#a78bfa" : "#ff2d2d";
      return depth > 0
        ? `<span style="color:${color}" title="${escapeHtml(challengerName(tier))}">${depth}</span>`
        : `<span style="color:#3a4150">·</span>`;
    }).join(" ");
  }

  /**
   * The Path screen's full trophy shelf for one character: every activity, one row each.
   * Every value is a direct read off `Player` — nothing here is a second table that could
   * drift from what actually banked (`tools/badges.ts` pins that as a property).
   */
  private trophyRows(pc: Player): string {
    const modeRow = (id: FixedChallengerModeId, label: string) => `
        <tr><td>${escapeHtml(label)}</td><td>${this.challengerPips(pc.challengerBadges[id])}</td></tr>`;
    const depthRow = (label: string, badges: readonly number[]) => `
        <tr><td>${escapeHtml(label)}</td><td>${this.depthBadgeCells(badges)}</td></tr>`;
    const rows = [
      depthRow("The Delve", pc.delveChallengerBadges),
      depthRow("The Tower", pc.towerChallengerBadges),
      modeRow("abyss", "Abyssal Rift"),
      modeRow("hoard", "Avarice Rift"),
      modeRow("vigil", "The Vigil"),
      modeRow("convergence", "The Convergence"),
      modeRow("memory", "A Memory"),
      ...PLANETS.map((p) => `
        <tr><td>${escapeHtml(p.name)}</td><td>${this.challengerPips(pc.planetChallengerBadges[p.id] ?? 0)}</td></tr>`),
      ...RAIDS.map((r) => `
        <tr><td>${escapeHtml(r.name)}</td><td>${this.challengerPips(pc.raidChallengerBadges[r.id] ?? 0)}</td></tr>`),
    ];
    return rows.join("");
  }

  /**
   * The chest shop: one category at a time, each browsed as a big horizontal carousel of
   * chest cards rather than a single 28-row list — up/down flip the category pill, left/
   * right (or the arrow chips, or clicking a card) walk the carousel. Every card carries
   * its own little sprite (`chestIcon`): the real weapon for a single-family cache, a
   * slot icon for the three category caches, and a tinted chest prop otherwise. The full
   * blurb for whichever chest is selected lives in the aside, in real reading size,
   * rather than squeezed into the card itself.
   */
  /** True when the chest screen is showing the Augment view rather than a shop category. */
  private get augmentView(): boolean {
    return this.tab === "Chests" && this.chestCategory === AUGMENT_CATEGORY;
  }

  /**
   * Moves the chest carousel to a category, wrapping through the Augment view at the end.
   * Entering the Augment view **resets the loadout to a bare Basic chest** — §5.2's rule,
   * enforced at the one door into the screen rather than trusted to every exit out of it.
   */
  private setChestCategory(index: number): void {
    const count = CHEST_CATEGORIES.length + 1;
    const next = ((index % count) + count) % count;
    if (next === AUGMENT_CATEGORY && this.chestCategory !== AUGMENT_CATEGORY) {
      this.loadout = emptyLoadout();
    }
    this.chestCategory = next;
    this.cursor = 0;
  }

  /** Everything the account owns on one axis, in registry order. */
  private ownedOnAxis(axis: AugmentAxis): string[] {
    return augmentsOnAxis(axis).filter((a) => this.state.augmentCount(a.id) > 0).map((a) => a.id);
  }

  /**
   * Cycles one loadout row. For an axis the ring is `[empty, ...owned]`, so backing a slot
   * out is always one press away; for the base row it is the surviving chest tiers.
   */
  private cycleAugmentSlot(row: number, dir: number): boolean {
    const axis = AUGMENT_SLOTS[row];
    if (axis === undefined) return false;
    if (axis === null) {
      const i = CHEST_TIERS.indexOf(this.loadout.base);
      const next = (((i + dir) % CHEST_TIERS.length) + CHEST_TIERS.length) % CHEST_TIERS.length;
      this.loadout = { ...this.loadout, base: CHEST_TIERS[next]! };
      return true;
    }
    const ring: (string | null)[] = [null, ...this.ownedOnAxis(axis)];
    if (ring.length === 1) return false;
    const at = ring.indexOf(this.loadout[axis]);
    const next = (((at + dir) % ring.length) + ring.length) % ring.length;
    const id = ring[next]!;
    this.loadout = id === null ? { ...this.loadout, [axis]: null } : withAugment(this.loadout, id);
    return true;
  }

  /**
   * Opens the loadout. Refuses with a printed reason rather than spending anything — a
   * combine that cannot work is caught here, at authoring time, instead of being accepted
   * and silently doing nothing inside the roll.
   */
  private openLoadout(): void {
    const problems = loadoutProblems(this.loadout);
    if (problems.length > 0) {
      this.notify(problems[0]!, "#f87171");
      return;
    }
    if (this.state.keys[this.loadout.base] <= 0) {
      this.notify(`No ${chestName(this.loadout.base)} keys — ${k(this.state.settings, "cancel")} to buy one.`, "#fbbf24");
      return;
    }
    const spent = AUGMENT_AXES.map((a) => this.loadout[a]).filter((id): id is string => id !== null);
    const found = this.state.openAugmented(this.loadout, 1);
    if (found.length === 0) {
      this.notify("Nothing to open.", "#fbbf24");
      return;
    }
    // Augments are consumed whatever came out, so a slot whose augment is now gone is
    // cleared — leaving a spent id sitting in the loadout would read as "still armed".
    let next = this.loadout;
    for (const id of spent) {
      const axis = AUGMENT_BY_ID[id]?.effect.axis;
      if (axis && this.state.augmentCount(id) <= 0) next = { ...next, [axis]: null };
    }
    this.loadout = next;
    // The same reel every other chest opens through, so an augmented pull is announced
    // exactly as loudly as an ordinary one and there is one animation to keep working.
    this.roll.play(
      {
        items: found,
        title: `${chestName(this.loadout.base).toUpperCase()} · AUGMENTED`,
        color: CHESTS[this.loadout.base].color,
        skipHint: `${k(this.state.settings, "confirm")} or click — skip`,
      },
      () => {
        this.lastPulls = found;
        const best = found.reduce<Item | null>(
          (b, it) => (!b || rarityIndex(it.rarity) > rarityIndex(b.rarity) ? it : b), null);
        if (best) this.notify(`${rarityLabel(best.rarity)}: ${best.name}`, RARITY_COLORS[best.rarity]);
        this.render();
      },
    );
  }

  /**
   * The Augment view (`docs/augments.md` §6). Three regions, and the split is deliberate:
   * the loadout is what you are editing, the grid is what you own, and the actions sit in
   * their own fixed bar rather than being buried at the bottom of a scrolling panel that
   * also explains things.
   */
  private renderAugments(): string {
    const cats = this.chestCategoryStrip();
    const problems = loadoutProblems(this.loadout);
    const owned = this.state.ownedAugments().length;

    const slots = AUGMENT_SLOTS.map((axis, i) => {
      const on = i === this.cursor ? " on" : "";
      if (axis === null) {
        const info = CHESTS[this.loadout.base];
        return `<div class="aug-slot${on}" data-aug-slot="${i}" style="--r:${info.color}">
            <span class="aug-slot-axis">Base</span>
            <span class="aug-slot-name">${escapeHtml(chestName(this.loadout.base))}</span>
            <span class="badge">${this.state.keys[this.loadout.base]} keys</span>
          </div>`;
      }
      const id = this.loadout[axis];
      const def = id ? AUGMENT_BY_ID[id] : undefined;
      const have = this.ownedOnAxis(axis).length;
      const colour = def ? RARITY_COLORS[def.grade] : "#3a4152";
      const name = def ? def.name : have > 0 ? "— empty —" : "— none owned —";
      return `<div class="aug-slot${on}" data-aug-slot="${i}" style="--r:${colour}">
          <span class="aug-slot-axis">${escapeHtml(augmentAxisLabel(axis))}</span>
          <span class="aug-slot-name">${escapeHtml(name)}</span>
          <span class="badge">${have}</span>
        </div>`;
    }).join("");

    // The grid of what the account owns on the focused axis. Clicking one slots it; the
    // keyboard cycles the same ring with left/right, so neither path is the special one.
    const axis = AUGMENT_SLOTS[this.cursor] ?? null;
    const grid = axis === null
      ? `<p class="muted">The base chest the augments are requisitioned around.
           ${escapeHtml(k(this.state.settings, "left"))}/${escapeHtml(k(this.state.settings, "right"))} to change it —
           it always starts as a Basic chest, and it never needs to be more than one.</p>`
      : augmentsOnAxis(axis).filter((d) => this.state.augmentCount(d.id) > 0).map((d) => `
          <div class="aug-card ${this.loadout[axis] === d.id ? "sel" : ""}" data-augment="${escapeHtml(d.id)}"
               style="--r:${RARITY_COLORS[d.grade]}">
            ${pixelImageTag(augmentArt(d), 44, 44, `augment.${d.id}`)}
            <span class="aug-card-name">${escapeHtml(d.name)}</span>
            <span class="badge">×${this.state.augmentCount(d.id)}</span>
          </div>`).join("")
        || `<p class="muted">No ${escapeHtml(augmentAxisLabel(axis).toLowerCase())} augments yet.</p>`;

    const pulls = this.lastPulls.length
      ? this.lastPulls.map((it) => `<li style="color:${RARITY_COLORS[it.rarity]}">${escapeHtml(it.name)}
           <em>${escapeHtml(statLine(it))}</em></li>`).join("")
      : '<li class="muted">Nothing opened yet.</li>';

    return `<div class="chests-pane">
        <div class="chest-cats">${cats}</div>
        <div class="aug-loadout">${slots}</div>
        <div class="aug-grid">${grid}</div>
      </div>
      <aside class="side">
        <h3>Outcome</h3>
        <p class="chest-desc">${escapeHtml(loadoutSummary(this.loadout))}</p>
        ${problems.length > 0
          ? `<p class="warn">${escapeHtml(problems[0]!)}</p>`
          : `<p class="muted">Consumes 1 ${escapeHtml(chestName(this.loadout.base))} key${
              AUGMENT_AXES.filter((a) => this.loadout[a]).length > 0
                ? ` and ${AUGMENT_AXES.filter((a) => this.loadout[a]).length} augment(s)`
                : ""}.</p>`}
        <p>
          <span class="chip" data-action="primary">${k(this.state.settings, "confirm")} · open</span>
          <span class="chip" data-action="tertiary">${k(this.state.settings, "special")} · clear</span>
          <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · buy a key</span>
        </p>
        <h3>Last pull</h3>
        <ul class="pulls">${pulls}</ul>
        <p class="muted">${owned > 0
          ? "Augments are consumed whatever comes out. One per axis — a second of the same kind swaps the first out."
          : "Augments drop in Avarice Rifts, and once each from the Vigil and the Convergence. They are found, never bought."}</p>
      </aside>`;
  }

  /** The category strip, shared by both chest views so the Augment tab sits in the row. */
  private chestCategoryStrip(): string {
    const labels = [...CHEST_CATEGORIES.map((c) => c.label), "Augments"];
    return labels.map((label, i) => `
      <div class="chest-cat ${i === this.chestCategory ? "on" : ""}" data-category="${i}">${escapeHtml(label)}</div>
    `).join("");
  }

  /**
   * The Rotating Shop (`docs/rotating-shop.md`, docket item 2). Same three-part layout
   * the Forge's workbench uses, for the same reason (`docs/actions-vs-reading-panels`):
   * a grid of listings, a strictly read-only `<aside>` for the selected item's stats
   * (`renderCompare`, the exact panel every other item-inspecting screen uses — this
   * never gets its own copy), and every action — Buy, Reroll — in its own fixed bar
   * below both, never inside the scrolling sidebar. The bar states each button's cost
   * inline and needs no hover popup: there are only two actions here, not the Forge's
   * eleven, so a static line under the buttons is already the whole description.
   */
  private renderShop(): string {
    const spec = SHOP_TIERS[this.shopTier];
    const listings = this.state.shopListings(this.shopTier);
    const bought = new Set(this.state.shopPurchasedSlots(this.shopTier));
    const purchasesLeft = this.state.shopPurchasesLeft(this.shopTier);
    const resetMs = msUntilShopReset(this.shopTier);
    const resetH = Math.floor(resetMs / 3_600_000);
    const resetLabel = resetH >= 48 ? `${Math.floor(resetH / 24)}d` : resetH >= 1 ? `${resetH}h` : "<1h";

    const tabs = SHOP_TIER_IDS.map((id) => `
      <span class="chip ${id === this.shopTier ? "on" : ""}" data-shop-tier="${id}">${escapeHtml(SHOP_TIERS[id].name)}</span>
    `).join("");

    const cards = listings.map((listing, i) => {
      const sold = bought.has(i);
      const icon = pixelImageTag(itemArt(listing.item), 64, 64, itemArtKey("item", listing.item));
      const afford = this.state.coins >= listing.price;
      return `
        <div class="item-card ${i === this.cursor ? "on" : ""} ${sold ? "dim" : ""}" data-index="${i}"
             style="--r:${RARITY_COLORS[listing.item.rarity]}">
          ${sold ? `<span class="ic-mark worn" title="already bought this period">SOLD</span>` : ""}
          <div class="ic-art">${icon}</div>
          <span class="ic-name" style="color:${RARITY_COLORS[listing.item.rarity]}">${escapeHtml(listing.item.name)}</span>
          <span class="ic-slot ${afford ? "" : "warn"}">${formatNumber(listing.price)}c</span>
        </div>`;
    }).join("");

    const sel = listings[this.cursor];
    const buyCost = sel?.price ?? 0;
    const rerollCost = this.state.shopNextRerollCost(this.shopTier);
    const selSold = sel ? bought.has(this.cursor) : false;

    return `<div class="forge-pane">
        <div class="chest-cats">${tabs}
          <span class="muted" style="margin-left:auto">resets in ${resetLabel} · ${purchasesLeft}/${spec.purchaseCap} purchases left this ${spec.id === "daily" ? "day" : spec.id === "weekly" ? "week" : "month"}</span>
        </div>
        <p class="muted">${escapeHtml(spec.blurb)}</p>
        <div class="stash-grid">${cards}</div>
      </div>
      <aside class="side">
        ${sel ? this.renderCompare(sel.item) : `<p class="muted">Pick a listing.</p>`}
      </aside>
      <div class="workbench-bar">
        <div class="workbench-bar-head">
          <h3>${escapeHtml(spec.name)} <span class="muted">${formatNumber(this.state.coins)}c · ${formatNumber(this.state.gems)} gems</span></h3>
        </div>
        <div class="op-cols">
          <div class="op-col">
            <span class="op-col-label">Buy</span>
            <div class="op-col-btns">
              <span class="chip op-btn ${selSold || purchasesLeft <= 0 || !sel ? "dim" : ""}" data-shop-action="buy">
                <span class="op-btn-label">Buy this slot</span>
                <span class="op-btn-cost">${sel ? formatNumber(buyCost) + "c" : "—"}</span>
              </span>
            </div>
          </div>
          <div class="op-col">
            <span class="op-col-label">Reroll</span>
            <div class="op-col-btns">
              <span class="chip op-btn ${!sel ? "dim" : ""}" data-shop-action="reroll">
                <span class="op-btn-label">Reroll this slot</span>
                <span class="op-btn-cost">${formatNumber(rerollCost)} gems</span>
              </span>
            </div>
          </div>
        </div>
        <div class="op-detail">
          <p class="op-detail-blurb">${
            selSold
              ? "Already bought this slot this period — rerolling it still changes what it offers, but buying it again won't."
              : purchasesLeft <= 0
                ? `No purchases left in ${escapeHtml(spec.name)} this period. Rerolling still works — it just won't be for you until the reset.`
                : `${k(this.state.settings, "confirm")}, or click Buy, to buy this listing outright. ${
                    k(this.state.settings, "cancel")}, or click Reroll, to spend gems changing what this one slot offers — `
                  + `it never changes how many purchases you have left.`
          }</p>
        </div>
      </div>`;
  }

  private renderChests(): string {
    if (this.augmentView) return this.renderAugments();
    const n = this.bulk ? 10 : 1;
    const cat = CHEST_CATEGORIES[this.chestCategory]!;

    const cats = this.chestCategoryStrip();

    const cards = cat.tiers.map((tier, i) => {
      const info = CHESTS[tier];
      const icon = pixelImageTag(chestIcon(tier), 72, 72, tier);
      return `
        <div class="chest-card row ${i === this.cursor ? "on" : ""}" data-index="${i}" style="--chest-color:${info.color}">
          <div class="chest-card-art">${icon}</div>
          <span class="chest-card-name">${escapeHtml(chestName(tier))}</span>
          <span class="badge">${this.state.keys[tier]} keys</span>
          <span class="chest-card-price">${formatNumber(info.price * n)} for ${n}</span>
        </div>`;
    }).join("");

    const selTier = cat.tiers[this.cursor] ?? cat.tiers[0]!;
    const sel = CHESTS[selTier];

    const pulls = this.lastPulls.length
      ? this.lastPulls
          .map((it) => `<li style="color:${RARITY_COLORS[it.rarity]}">${escapeHtml(it.name)}
             <em>${escapeHtml(statLine(it))}</em></li>`)
          .join("")
      : '<li class="muted">Nothing opened yet.</li>';

    return `<div class="chests-pane">
        <div class="chest-cats">${cats}</div>
        <div class="carousel">
          <span class="chip carousel-arrow" data-action="left">◀</span>
          <div class="carousel-track">${cards}</div>
          <span class="chip carousel-arrow" data-action="right">▶</span>
        </div>
      </div>
      <aside class="side">
        <h3>${escapeHtml(cat.label)}</h3>
        <p class="muted">${escapeHtml(cat.blurb)}</p>
        <h3 style="color:${sel.color}">${escapeHtml(chestName(selTier))}</h3>
        <p class="chest-desc">${escapeHtml(sel.blurb)}</p>
        <table class="cmp">
          <tr><td>Price</td><td>${formatNumber(sel.price * n)} for ${n}</td></tr>
          <tr><td>Keys owned</td><td>${this.state.keys[selTier]}</td></tr>
        </table>
        <h3>Bulk: <b>${this.bulk ? "10×" : "1×"}</b>
          <span class="chip" data-action="tertiary">${k(this.state.settings, "special")} toggle</span></h3>
        <p><span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · buy a key</span></p>
        <h3>Last pull</h3>
        <ul class="pulls">${pulls}</ul>
        <p class="muted">Unspoken is roughly 1 in 20,000 from a Basic chest. Good luck.</p>
      </aside>`;
  }

  private renderStash(): string {
    const items = this.filteredStash();
    // A sticky bar of rarity pills across the top of the grid. `cursor < 0` = it has
    // keyboard focus (walked up onto from the first card row); a click on a pill jumps
    // straight to that rarity.
    const onBar = this.cursor < 0;
    const rarities: (Rarity | "all")[] = ["all", ...RARITIES];
    const filterBar = `
      <div class="stash-filter ${onBar ? "on" : ""}">
        ${rarities.map((r) => `<span class="sf-pill ${r === this.rarityFilter ? "sel" : ""}"
              data-filter="${r}"
              style="--r:${r === "all" ? "var(--accent)" : RARITY_COLORS[r]}">${r}</span>`).join("")}
      </div>`;

    if (items.length === 0) {
      return `<div class="stash-grid">${filterBar}
          <div class="stash-none">Nothing matches. Widen the filter — ◀ ▶ on the bar above.</div>
        </div>
        <aside class="side"><p class="muted">Kill things. Open chests.</p></aside>`;
    }

    const cards = items.slice(0, 300).map((it, i) => {
      const mark = this.upgradeMark(it);
      const dots = [
        it.named ? '<span class="dot" style="background:#fbbf24" title="named item"></span>' : "",
        it.grant ? '<span class="dot" style="background:#7dd3fc" title="grants a skill"></span>' : "",
        it.trigger ? '<span class="dot" style="background:#ff1493" title="triggered effect"></span>' : "",
      ].join("");
      const locked = !this.state.player.canEquip(it);
      const icon = pixelImageTag(itemArt(it), 64, 64, itemArtKey("item", it));
      const named = it.named ? NAMED_BY_ID[it.named] : undefined;
      const tip = `${it.name} — ${rarityLabel(it.rarity)} ${it.type} · ilvl ${it.ilvl}\n`
        + (named ? `${named.flavor}\n` : "")
        + `${statLine(it)}\nsells for ${formatNumber(sellPrice(it))}c`;
      const marked = this.stashSelected.has(it.id);
      return `
        <div class="item-card ${i === this.cursor ? "on" : ""} ${marked ? "marked" : ""}" data-index="${i}"
             style="--r:${RARITY_COLORS[it.rarity]}" title="${escapeHtml(tip)}">
          ${mark}
          ${locked ? `<span class="ic-lock">lv ${requiredLevel(it)}</span>` : ""}
          <span class="ic-select ${marked ? "on" : ""}" data-select="${it.id}"
                title="mark for a batch salvage">${marked ? "☑" : "☐"}</span>
          <div class="ic-art">${icon}</div>
          <span class="ic-name" style="color:${RARITY_COLORS[it.rarity]}">${escapeHtml(it.name)}</span>
          <span class="ic-slot">${it.slot}</span>
          ${dots ? `<div class="ic-dots">${dots}</div>` : ""}
        </div>`;
    }).join("");

    const sel = onBar ? undefined : items[this.cursor];
    const marked = this.stashSelected.size;
    return `<div class="stash-grid">${filterBar}${cards}</div>
      <aside class="side">
        ${sel
          ? this.renderCompare(sel)
          : `<p class="muted">${onBar
              ? "Filtering by rarity. Press down to step back into the cards."
              : "Pick a piece to compare it against what you're wearing."}</p>`}
        <p>
          <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · sell selected</span>
          <span class="chip" data-action="tertiary">${k(this.state.settings, "special")}
            · ${marked > 0 ? `salvage ${marked} marked` : "sell all junk"}</span>
          ${marked === 0
            ? `<span class="chip" data-action="salvageAll">${k(this.state.settings, "salvageAll")}
                · salvage all junk</span>`
            : ""}
        </p>
        ${marked > 0
          ? `<p class="muted">${k(this.state.settings, "mark")} or a card's checkbox toggles what's marked.
              ${this.massSalvageArmed
                ? `<b style="color:#ef4444">Press ${k(this.state.settings, "special")} again to salvage — this can't be undone.</b>`
                : `Salvage is one-way; the confirm asks once more before it runs.`}</p>`
          : `<p class="muted">${k(this.state.settings, "mark")}, or a card's checkbox, marks
              several items to salvage together at the Forge's Ash rate — or press
              ${k(this.state.settings, "salvageAll")} to salvage everything that qualifies as junk
              in one go, same two-press confirm.</p>`}
        <p class="muted">${this.state.inventory.length} / 200 slots used.</p>
      </aside>`;
  }

  /** Side-by-side against the equipped piece — the core "is this an upgrade" question. */
  private renderCompare(item: Item): string {
    const worn = this.state.player.equipment[item.slot];
    const mine = itemMods(item);
    const theirs = worn ? itemMods(worn) : {};
    const rows = MOD_KEYS.filter((k) => (mine[k] ?? 0) !== 0 || (theirs[k] ?? 0) !== 0)
      .map((k) => {
        const a = mine[k] ?? 0;
        const b = theirs[k] ?? 0;
        const d = a - b;
        const cls = d > 0 ? "up" : d < 0 ? "down" : "muted";
        return `<tr><td>${escapeHtml(shortLabel(k))}</td><td>${fmtMod(k, a)}</td>
          <td class="${cls}">${d > 0 ? "+" : ""}${fmtMod(k, d)}</td></tr>`;
      }).join("");

    const weapon = item.family ? WEAPONS[item.family] : null;
    const affine = item.family
      ? this.state.heroClass.affinity.includes(item.family)
      : false;
    const weaponLine = weapon
      ? `<p style="color:${affine ? this.state.heroClass.color : "#9aa4b2"}">
          <b>${escapeHtml(weapon.name)}</b> — ${escapeHtml(weapon.blurb)}
          ${affine ? `<br><em>Your class was built for this.</em>` : "<br><em>Not your class's weapon; it hits a little softer.</em>"}</p>`
      : "";

    const grantAbility = item.grant ? CLASS_BY_ID[item.grant.split(".")[0]!]?.abilities.find((a) => a.id === item.grant)
      ?? ALL_CLASSES.flatMap((c) => c.abilities).find((a) => a.id === item.grant) : undefined;
    const grant = grantAbility
      ? `<p style="color:#7dd3fc">Grants <b>${escapeHtml(grantAbility.name)}</b>
         — an extra ability on [${this.skillKeyLabels[SKILL_SLOTS] ?? "M"}] while this is equipped.</p>`
      : "";
    const trigger = item.trigger
      ? `<p style="color:${ELEMENT_COLORS[item.trigger.element]}">${escapeHtml(triggerLine(item.trigger))}</p>`
      : "";
    const locked = !this.state.player.canEquip(item);
    const reqLine = locked
      ? `<p class="danger">Needs level ${requiredLevel(item)} to equip —
         ${escapeHtml(this.state.heroClass.name)} is only ${this.state.player.level}.</p>`
      : "";

    const icon = pixelImageTag(itemArt(item), 96, 96, itemArtKey("item", item));
    const cmpHead = worn
      ? `<tr class="cmp-head"><td></td><td>this</td><td>vs equipped</td></tr>`
      : `<tr class="cmp-head"><td></td><td>this</td><td>gain</td></tr>`;
    return `
      <div class="cmp-hero" style="--r:${RARITY_COLORS[item.rarity]}">
        <div class="cmp-art">${icon}</div>
        <div>
          <h3 style="color:${RARITY_COLORS[item.rarity]};margin:0">${escapeHtml(item.name)}</h3>
          <p class="muted" style="margin:2px 0 0">${rarityLabel(item.rarity)} ${item.type} · ilvl ${item.ilvl}
            · vs ${worn ? escapeHtml(worn.name) : "nothing equipped"}</p>
        </div>
      </div>
      ${reqLine}
      ${this.renderNamedLore(item)}
      ${weaponLine}
      <table class="cmp wide">${cmpHead}${rows}</table>
      ${grant}${trigger}`;
  }

  /**
   * What makes a named item *this* item — the flavour line, what it does, the live effect
   * lines read straight off its definition, and where another copy comes from. Empty for
   * ordinary gear, so the compare and hero panels can drop it in unconditionally.
   */
  private renderNamedLore(item: Item): string {
    const def = item.named ? NAMED_BY_ID[item.named] : undefined;
    if (!def) return "";
    const dctx: DescribeCtx = {
      abilityName: (id) => ALL_CLASSES.flatMap((c) => c.abilities).find((a) => a.id === id)?.name,
    };
    const lines = describeEffects((def.effects ?? []) as readonly NodeEffect[], dctx)
      .map((l) => `<li>${escapeHtml(l)}</li>`).join("");
    const sources = namedSourceLines(def).map((l) => `<li class="muted">${escapeHtml(l)}</li>`).join("");
    return `
      <p class="muted" style="font-style:italic;margin:4px 0">${escapeHtml(def.flavor)}</p>
      <p style="color:#fbbf24;margin:0 0 4px"><b>Named.</b> ${escapeHtml(def.description)}</p>
      ${lines ? `<ul class="pulls">${lines}</ul>` : ""}
      <ul class="pulls">${sources}</ul>`;
  }

  /** The piece in a Hero slot, shown flat — no comparison, since it's what you're wearing. */
  private renderEquipped(item: Item): string {
    const mods = itemMods(item);
    const rows = MOD_KEYS.filter((key) => (mods[key] ?? 0) !== 0)
      .map((key) => `<tr><td>${escapeHtml(shortLabel(key))}</td><td>${fmtMod(key, mods[key] ?? 0)}</td></tr>`)
      .join("");
    const icon = pixelImageTag(itemArt(item), 96, 96, itemArtKey("item", item));
    const weapon = item.family ? WEAPONS[item.family] : null;
    const affine = item.family ? this.state.heroClass.affinity.includes(item.family) : false;
    const weaponLine = this.renderNamedLore(item) + (weapon
      ? `<p style="color:${affine ? this.state.heroClass.color : "#9aa4b2"}">
          <b>${escapeHtml(weapon.name)}</b> — ${escapeHtml(weapon.blurb)}
          ${affine ? "<br><em>Your class was built for this.</em>" : ""}</p>`
      : "");
    const grantAbility = item.grant
      ? CLASS_BY_ID[item.grant.split(".")[0]!]?.abilities.find((a) => a.id === item.grant)
        ?? ALL_CLASSES.flatMap((c) => c.abilities).find((a) => a.id === item.grant)
      : undefined;
    const grant = grantAbility
      ? `<p style="color:#7dd3fc">Grants <b>${escapeHtml(grantAbility.name)}</b>
         on [${this.skillKeyLabels[SKILL_SLOTS] ?? "M"}].</p>`
      : "";
    const trigger = item.trigger
      ? `<p style="color:${ELEMENT_COLORS[item.trigger.element]}">${escapeHtml(triggerLine(item.trigger))}</p>`
      : "";
    return `
      <div class="cmp-hero" style="--r:${RARITY_COLORS[item.rarity]}">
        <div class="cmp-art">${icon}</div>
        <div>
          <h3 style="color:${RARITY_COLORS[item.rarity]};margin:0">${escapeHtml(item.name)}</h3>
          <p class="muted" style="margin:2px 0 0">${rarityLabel(item.rarity)} ${item.type} · ilvl ${item.ilvl}</p>
        </div>
      </div>
      ${weaponLine}
      <table class="cmp wide">${rows}</table>
      ${grant}${trigger}
      <p class="muted">[${k(this.state.settings, "confirm")}] takes it off · pick a replacement in the Stash.</p>`;
  }

  /** One equipment slot on the paper-doll — the real, equippable kind. */
  private dollSlot(slot: EquipSlot): string {
    const p = this.state.player;
    const cls = p.heroClass;
    const i = EQUIP_SLOTS.indexOf(slot);
    const it = p.equipment[slot];
    const affine = it?.family ? cls.affinity.includes(it.family) : false;
    const art = it
      ? pixelImageTag(itemArt(it), 72, 72, itemArtKey("item", it))
      : `<span class="ds-empty">${SLOT_GLYPH[slot]}</span>`;
    const tip = it ? `${it.name} — ${rarityLabel(it.rarity)}\n${statLine(it)}` : `${slot} — empty`;
    return `
      <div class="doll-slot ${i === this.cursor ? "on" : ""} ${it ? "filled" : ""}" data-index="${i}"
           style="--r:${it ? RARITY_COLORS[it.rarity] : "var(--line)"}" title="${escapeHtml(tip)}">
        <span class="ds-label">${slot}${affine ? ' <em class="ds-aff">✦</em>' : ""}</span>
        <div class="ds-art">${art}</div>
        <span class="ds-name" style="color:${it ? RARITY_COLORS[it.rarity] : "#5a6270"}">${it ? escapeHtml(it.name) : "empty"}</span>
      </div>`;
  }

  /** A slot the layout shows but the game doesn't have yet (UAT §12). Inert — no data-index. */
  /** One §12 slot that doesn't exist yet: real furniture, visibly not yet fillable. */
  private lockedSlot(label: string, glyph: string): string {
    return `
      <div class="doll-slot locked" title="${escapeHtml(label)} — a future update">
        <span class="ds-label">${escapeHtml(label)}</span>
        <div class="ds-art"><span class="ds-empty">${glyph}</span></div>
        <span class="ds-name muted">soon</span>
      </div>`;
  }

  /** The relics this account owns, artifacts after relics, in registry order — the socket list. */
  private relicCandidates(): RelicDef[] {
    const owned = new Set(this.state.relics);
    return RELICS.filter((d) => owned.has(d.id));
  }

  private socketRelicInto(slot: number, id: string): void {
    const res = this.state.socketRelic(slot, id);
    const def = RELIC_BY_ID[id];
    if (res.ok) {
      this.notify(`Socketed ${def?.name ?? id}`, def ? RELIC_TIER_INFO[def.tier].color : undefined);
      this.state.save();
    } else {
      this.notify(res.reason, "#ef4444");
    }
  }

  /** One of the three relic slots on the paper-doll (UAT §19 / §12). */
  private relicSlot(i: number): string {
    const index = EQUIP_SLOTS.length + i;
    const id = this.state.player.relics[i] ?? null;
    const def = id ? RELIC_BY_ID[id] : undefined;
    const color = def ? RELIC_TIER_INFO[def.tier].color : "var(--line)";
    const art = def
      ? pixelImageTag(relicArt(def), 72, 72, relicArtKey(def))
      : `<span class="ds-empty">✦</span>`;
    const tip = def ? `${def.name} — ${RELIC_TIER_INFO[def.tier].label}\n${def.description}` : "relic slot — empty";
    return `
      <div class="doll-slot ${index === this.cursor ? "on" : ""} ${def ? "filled" : ""}" data-index="${index}"
           style="--r:${color}" title="${escapeHtml(tip)}">
        <span class="ds-label">${def ? RELIC_TIER_INFO[def.tier].label.toLowerCase() : "relic"}</span>
        <div class="ds-art">${art}</div>
        <span class="ds-name" style="color:${def ? color : "#5a6270"}">${def ? escapeHtml(def.name) : "empty"}</span>
      </div>`;
  }

  /** A relic's lore card: flavour, tier, what it does, where it comes from. */
  private renderRelicLore(def: RelicDef): string {
    const dctx: DescribeCtx = {
      abilityName: (id) => ALL_CLASSES.flatMap((c) => c.abilities).find((a) => a.id === id)?.name,
    };
    const lines = describeEffects(def.effects, dctx).map((l) => `<li>${escapeHtml(l)}</li>`).join("");
    const sources = relicSourceLines(def).map((l) => `<li class="muted">${escapeHtml(l)}</li>`).join("");
    const info = RELIC_TIER_INFO[def.tier];
    return `
      <div class="cmp-hero" style="--r:${info.color}">
        <div class="cmp-art">${pixelImageTag(relicArt(def), 96, 96, relicArtKey(def))}</div>
        <div>
          <h3 style="color:${info.color};margin:0">${escapeHtml(def.name)}</h3>
          <p class="muted" style="margin:2px 0 0">${info.label}</p>
        </div>
      </div>
      <p class="muted" style="font-style:italic;margin:4px 0">${escapeHtml(def.flavor)}</p>
      <p style="margin:0 0 4px">${escapeHtml(def.description)}</p>
      ${lines ? `<ul class="pulls">${lines}</ul>` : ""}
      <ul class="pulls">${sources}</ul>`;
  }

  /**
   * The side panel for a relic slot when the doll is showing normally (not picking):
   * what's in it, or a prompt to open the picker. `renderRelicPicker` is the picker
   * itself, opened separately by `primary()`.
   */
  private renderRelicSlotPanel(slot: number): string {
    const e = k(this.state.settings, "confirm");
    const id = this.state.player.relics[slot];
    const worn = id ? RELIC_BY_ID[id] : undefined;
    return worn
      ? `${this.renderRelicLore(worn)}<p class="muted">${e} takes it off.</p>`
      : `<h3>Relic slot ${slot + 1}</h3><p class="muted">Empty. ${e} to browse your collection.</p>`;
  }

  /**
   * The relic picker (docket #11, PM ruling 2026-09-10): a flat list over the whole
   * collection, replacing the doll entirely while it's open — the same shape
   * `trophyPicking`'s stash picker already uses for the Trophy Hall. Up/down walk it
   * (`rowCount()` reads `relicCandidates().length` while `relicPicking !== null`),
   * confirm sockets the highlighted one, clicking a row does the same thing through the
   * identical `socketRelicInto` call, and cancel backs out untouched. Replaces the old
   * always-visible "browse with A/D" list, which put movement keys on a second axis and
   * cycled the collection blind one name at a time instead of showing all of it.
   */
  private renderRelicPicker(slot: number): string {
    const p = this.state.player;
    const candidates = this.relicCandidates();
    const rows = candidates.map((d, i) => {
      const wornElsewhere = p.relics.indexOf(d.id);
      const blocker = wornElsewhere === slot ? "in this slot" : p.relicBlocker(slot, d.id);
      const info = RELIC_TIER_INFO[d.tier];
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-index="${i}" data-relic="${d.id}">
          <div class="row-main">
            <span class="name" style="color:${blocker && wornElsewhere !== slot ? "#5a6270" : info.color}">${escapeHtml(d.name)}</span>
          </div>
          <div class="row-side">${info.label.toLowerCase()}${blocker ? ` · ${escapeHtml(blocker)}` : ""}</div>
        </div>`;
    }).join("");
    const sel = candidates[this.cursor];
    return `
      <p class="muted">Relic slot ${slot + 1} — pick something from your collection
        (${this.state.relics.length} / ${RELICS.length} found).</p>
      <div class="stash-grid">${rows || `<div class="stash-none">You own none yet. Artifacts come out of the `
        + `Abyssal Rift; relics from a Legend's Proving, the bottom of the Delve, and the Abyss's deepest tiers.</div>`}</div>
      <aside class="side">
        ${sel ? this.renderRelicLore(sel) : `<p class="muted">Nothing to socket yet.</p>`}
        <p class="muted">${k(this.state.settings, "confirm")} socket it · ${k(this.state.settings, "cancel")} back to the doll</p>
      </aside>`;
  }

  private renderHero(): string {
    if (this.relicPicking !== null) return this.renderRelicPicker(this.relicPicking);
    const p = this.state.player;
    const cls = p.heroClass;
    const a = this.state.appearance;
    const hero = heroSprite(a, this.state.activeClassId);
    const portrait = pixelImageBody(hero.canvas, hero.bodyHeight, HERO_PORTRAIT_BODY_PX);
    const xpPct = p.xpNeeded > 0 ? Math.max(0, Math.min(100, (p.xp / p.xpNeeded) * 100)) : 0;

    const doll = `
      <div class="doll">
        <div class="doll-col">
          ${this.dollSlot("weapon")}
          ${this.dollSlot("armor")}
          ${this.dollSlot("shield")}
        </div>
        <div class="doll-centre">
          <div class="doll-portrait"><img src="${portrait}" alt="your character"></div>
          <h3 style="color:${cls.color};margin:0">${escapeHtml(cls.name)}</h3>
          <p class="muted" style="margin:2px 0 8px">level ${p.level}</p>
          <div class="xp-track" title="${p.xp} / ${p.xpNeeded} XP"><span style="width:${xpPct}%"></span></div>
          <p class="muted" style="margin:6px 0 0">${p.treePoints} unspent tree point${p.treePoints === 1 ? "" : "s"}</p>
        </div>
        <div class="doll-col">
          ${this.dollSlot("gloves")}
          ${this.dollSlot("ring")}
          ${this.dollSlot("necklace")}
        </div>
        <div class="doll-locked">
          ${FUTURE_SLOTS.map((f) => this.lockedSlot(f.label, f.glyph)).join("")}
          ${Array.from({ length: RELIC_SLOTS }, (_, i) => this.relicSlot(i)).join("")}
        </div>
      </div>`;

    const relicSlot = this.cursor - EQUIP_SLOTS.length;
    const selSlot = EQUIP_SLOTS[this.cursor];
    const selItem = selSlot ? p.equipment[selSlot] : undefined;
    const selPanel = relicSlot >= 0
      ? this.renderRelicSlotPanel(relicSlot)
      : selItem
        ? this.renderEquipped(selItem)
        : `<h3>${selSlot ?? "slot"}</h3><p class="muted">Nothing equipped here.
         Open the Stash to fill it — ${k(this.state.settings, "confirm")} on a slot takes the piece off.</p>`;

    const s = p.stats;
    const statRows = STAT_KEYS.map((k) => `<tr><td>${STAT_LABELS[k]}</td><td>${s[k]}</td></tr>`).join("");

    const resists = p.resists;
    const resistRows = ELEMENTS.filter((e) => e !== "physical").map((e) => {
      const flat = Math.round(resists[e]);
      const pct = (resistFraction(flat) * 100).toFixed(0);
      return `<tr><td style="color:${ELEMENT_COLORS[e]}">${ELEMENT_LABELS[e]}</td>
        <td>${flat}</td><td class="${flat > 0 ? "up" : "muted"}">${pct}%</td></tr>`;
    }).join("");

    const elemental = Object.entries(p.elementalDamage);
    const elementalLine = elemental.length
      ? elemental.map(([e, v]) =>
          `<span style="color:${ELEMENT_COLORS[e as keyof typeof ELEMENT_COLORS]}">+${Math.round(v * 100)}% ${e}</span>`)
        .join(" · ")
      : '<span class="muted">none — your hits are plain physical</span>';

    // Only the modifiers that are actually doing something, so the panel stays honest.
    const combatRows = MOD_KEYS.filter((k) => !isStatKey(k) && !isResistKey(k) && p.mods[k] !== 0)
      .map((k) => `<tr><td>${escapeHtml(shortLabel(k))}</td><td>${fmtMod(k, p.mods[k])}</td></tr>`)
      .join("");

    const weapon = p.weapon;
    const ult = p.ultimateAbility;
    const granted = p.grantedAbilityId ? p.abilityById(p.grantedAbilityId) : undefined;

    return `${doll}
      <aside class="side">
        ${selPanel}
        <h3 style="color:${cls.color}">Character sheet</h3>
        <table class="cmp">${statRows}</table>
        <p class="muted">Damage reduction ${(p.damageReduction * 100).toFixed(0)}% ·
        ${p.attackCooldown.toFixed(2)}s per swing · crit ${(p.critChance * 100).toFixed(0)}%
        at ×${p.critMultiplier.toFixed(2)} · spell damage ${Math.round(p.spellDamage)}</p>
        <h3>In your hands</h3>
        <p><b style="color:${p.hasAffinity ? cls.color : "#e8eef7"}">${escapeHtml(weapon.name)}</b>
        — ${escapeHtml(weapon.blurb)}</p>
        <p class="muted">${Math.round(p.attackDamage)} per hit${weapon.hits > 1 ? ` × ${weapon.hits}` : ""}
        ${p.hasAffinity ? ` · +${Math.round(cls.affinityBonus * 100)}% class affinity` : ""}</p>
        <h3>Ultimate</h3>
        <p style="color:${cls.color}"><b>${escapeHtml(ult?.name ?? "—")}</b>
          <span class="muted">[${keyLabel(this.state.settings.keybinds.special ?? DEFAULT_KEYBINDS.special)}]</span></p>
        <p class="muted">${escapeHtml(ult?.description ?? "")}</p>
        ${granted ? `<h3>Granted by your gear</h3>
          <p style="color:#7dd3fc">${escapeHtml(granted.name)}
          <span class="muted">on [${this.skillKeyLabels[SKILL_SLOTS] ?? "M"}]</span></p>` : ""}
        <h3>On your hits</h3>
        <p>${elementalLine}</p>
        ${combatRows ? `<h3>Modifiers</h3><table class="cmp">${combatRows}</table>` : ""}
        <h3>Resistances</h3>
        <table class="cmp">${resistRows}</table>
      </aside>`;
  }

  /**
   * Three slots on the keys around the attack finger. Everything is unlocked by
   * levelling, so this screen is about choosing, never about buying.
   */
  /**
   * The Skills screen (docket item 12): the Stash's own shape rather than a row you
   * walk A/D through. A slot bar sits above a grid of every ability the class can ever
   * know, exactly like Stash's rarity pills sit above its item cards — `cursor < 0`
   * means the bar has focus, `skillSlot` says which of the three real slots is armed,
   * and clicking (or confirming) a card sets that ability into it directly, through the
   * same `primary()` a keyboard confirm calls.
   */
  private renderSkills(): string {
    const p = this.state.player;
    const cls = p.heroClass;
    const byId = (id: string | null): Ability | undefined => (id ? p.abilityById(id) : undefined);
    const onBar = this.cursor < 0;

    const slotPills = Array.from({ length: SKILL_SLOTS }, (_, i) => {
      const ab = byId(p.skills[i] ?? null);
      return `<span class="sf-pill ${i === this.skillSlot ? "sel" : ""}" data-skill-slot="${i}"
            style="--r:${ab ? cls.color : "var(--line)"}">
            [${this.skillKeyLabels[i] ?? i + 1}] ${ab ? escapeHtml(ab.name) : "empty"}</span>`;
    }).join("");
    // The fourth slot isn't yours to choose — it's whatever your gear is handing you,
    // so it rides along on the bar for reference but takes no click of its own.
    const granted = byId(p.grantedAbilityId);
    const grantedPill = granted
      ? `<span class="sf-pill" style="--r:${cls.color}" title="granted by your gear, not chosen">
            [${this.skillKeyLabels[SKILL_SLOTS] ?? "M"}] ${escapeHtml(granted.name)}</span>`
      : "";
    const slotBar = `<div class="stash-filter ${onBar ? "on" : ""}">${slotPills}${grantedPill}</div>`;

    const pool = p.abilityPool;
    const cards = pool.map((a, i) => {
      const lv = p.abilityUnlockLevel(a);
      const have = lv <= p.level;
      const wornSlot = p.skills.indexOf(a.id);
      const tip = `${a.name} — ${a.category}\n${a.description}\n${abilityCostLine(a, p)}`
        + (have ? "" : `\nUnlocks at level ${lv}`);
      return `
        <div class="item-card ${i === this.cursor ? "on" : ""}" data-index="${i}"
             style="--r:${have ? cls.color : "#3a4150"}" title="${escapeHtml(tip)}">
          ${!have ? `<span class="ic-lock">lv ${lv}</span>` : ""}
          ${wornSlot >= 0 ? `<span class="ic-mark up">[${this.skillKeyLabels[wornSlot] ?? wornSlot + 1}]</span>` : ""}
          <span class="ic-name" style="color:${have ? cls.color : "#5a6270"}">${escapeHtml(a.name)}</span>
          <span class="ic-slot">${escapeHtml(a.category)}</span>
        </div>`;
    }).join("");

    const sel = onBar ? undefined : pool[this.cursor];
    const canTake = sel ? p.abilityUnlockLevel(sel) <= p.level : false;
    return `<div class="stash-grid">${slotBar}${cards}</div>
      <aside class="side">
        ${sel ? `
          <h3 style="color:${cls.color}">${escapeHtml(sel.name)}</h3>
          <p>${escapeHtml(sel.description)}</p>
          <table class="cmp">
            <tr><td>Type</td><td>${escapeHtml(sel.category)}</td></tr>
            <tr><td>Cost</td><td>${abilityCostLine(sel, p)}</td></tr>
            <tr><td>Cooldown</td><td>${(sel.cooldown * p.cooldownMult).toFixed(1)}s</td></tr>
          </table>
          <p class="${canTake ? "" : "muted"}">
            ${canTake
              ? `${k(this.state.settings, "confirm")}, or click, sets it on [${this.skillKeyLabels[this.skillSlot] ?? this.skillSlot + 1}].`
              : `Unlocks at level ${p.abilityUnlockLevel(sel)}.`}</p>`
        : `<h3>${escapeHtml(cls.name)} abilities</h3>
          <p class="muted">${onBar
            ? "Picking which slot a card fills. Press down to step back into the grid."
            : "Nine abilities, unlocked by levelling — pick a card to see what it does."}</p>`}
        <p>
          <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · clear the active slot</span>
        </p>
        <p class="muted">Pick three; the fourth is whatever your gear grants.</p>
      </aside>`;
  }

  /**
   * The skill tree: four branches, walked top to bottom. Keyboard only, like everything
   * else — W and S walk a branch, A and D move between them.
   */
  private renderTree(): string {
    const p = this.state.player;
    const cls = p.heroClass;
    const def = p.pilotClass;
    const tree = p.tree;
    const columns: string[] = [];

    const dctx: DescribeCtx = {
      abilityName: (id) => def?.abilities.find((a) => a.id === id)?.name,
      resourceLabel: (id) => def?.resources.find((r) => r.id === id)?.label,
    };

    for (let b = 0; b < TREE_PATH_COUNT; b++) {
      const pathName = def?.progression.paths[b]?.name ?? `Path ${b + 1}`;
      const nodes: string[] = [];
      for (let row = 0; row < TREE_PATH_DEPTH; row++) {
        const node = treeNodeAt(tree, b, row);
        if (!node) continue;
        const taken = p.allocated.includes(node.id);
        const open = p.canAllocate(node);
        const here = b === this.treeBranch && row === this.cursor;
        const state = taken ? "taken" : open ? "open" : "locked";
        nodes.push(`
          <div class="tree-node ${state} ${node.category === "keystone" ? "keystone" : ""} ${here ? "on" : ""}"
               data-branch="${b}" data-index="${row}"
               style="--accent:${cls.color}">
            <span class="tree-name">${escapeHtml(node.name)}</span>
            <span class="tree-mods">${escapeHtml(describeNode(node, dctx))}</span>
          </div>`);
      }
      columns.push(`
        <div class="tree-col ${b === this.treeBranch ? "on" : ""}">
          <h4>${escapeHtml(pathName)}</h4>
          ${nodes.join("")}
        </div>`);
    }

    const sel = treeNodeAt(tree, this.treeBranch, this.cursor);
    const selTaken = sel ? p.allocated.includes(sel.id) : false;
    const path = def?.progression.paths[this.treeBranch];

    // The whole hybrid / archetype ladder for this class, with live progress — what the
    // tree is building toward, not just what has already fired.
    const points = pathPointsByName(tree, p.allocated);
    const unlockRow = (u: PathUnlockDef): string => {
      const prog = unlockProgress(u, points);
      const mythic = u.tier === "mythic";
      const tint = mythic ? "#ff1493" : cls.color;
      const bits = prog.parts
        .map((pt) => `<span class="${pt.ok ? "up" : "muted"}">${escapeHtml(pt.path)} ${pt.have}/${pt.need}</span>`)
        .join(" · ");
      return `<li class="${prog.met ? "up" : ""}">
        <b style="color:${tint}">${escapeHtml(u.name)}</b>${prog.met ? " — unlocked" : ""}
        <em>${escapeHtml(u.description)}</em>
        <span class="muted">${bits}</span></li>`;
    };
    const hybridRows = (def?.unlocks ?? []).filter((u) => u.tier === "hybrid").map(unlockRow).join("");
    const archRows = (def?.unlocks ?? []).filter((u) => u.tier === "mythic").map(unlockRow).join("");

    const selLines = sel ? describeNodeLong(sel, dctx) : [];

    return `<div class="list"><div class="tree">${columns.join("")}</div></div>
      <aside class="side">
        <h3 style="color:${cls.color}">${escapeHtml(cls.name)} · ${p.treePoints} points</h3>
        <p class="muted">${p.allocated.length} nodes lit. One point a level, two on every fifth.
        The tree deals in behaviours, not stat sticks.</p>
        ${sel ? `
          <h3>${escapeHtml(sel.name)}</h3>
          <p class="muted">${escapeHtml(categoryGloss(sel.category))}${sel.cost > 1 ? " · costs 2 points" : ""}</p>
          ${selLines.length
            ? `<ul class="pulls">${selLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`
            : `<p class="muted">${escapeHtml(sel.blurb)}</p>`}
          <p class="${selTaken ? "up" : p.canAllocate(sel) ? "" : "muted"}">
            ${selTaken ? "Lit."
              : p.canAllocate(sel) ? `Press ${k(this.state.settings, "confirm")} to take it.`
              : sel.requires && !p.allocated.includes(sel.requires) ? "Take the one above it first."
              : `Needs ${sel.cost} point${sel.cost > 1 ? "s" : ""}. Go and earn ${sel.cost > 1 ? "them" : "one"}.`}</p>
        ` : ""}
        ${path ? `<h3>${escapeHtml(path.name)}</h3><p class="muted">${escapeHtml(path.blurb)}</p>` : ""}
        ${hybridRows ? `<h3>Cross-path hybrids</h3><ul class="pulls">${hybridRows}</ul>` : ""}
        ${archRows ? `<h3>Mythic Archetype${(def?.unlocks ?? []).filter((u) => u.tier === "mythic").length > 1 ? "s" : ""}</h3><ul class="pulls">${archRows}</ul>` : ""}
        <p class="muted">
          <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · refund the whole tree</span>
          free, any time. Nobody is going to charge you for changing your mind.</p>
      </aside>`;
  }

  /**
   * The node at a grid position on the universal screen. Row 0 is the shared root for
   * every column, so walking up out of any path lands on it — which is exactly the
   * prerequisite the tree data describes, rather than a UI convenience.
   */
  private universalNodeAt(branch: number, row: number): TreeNodeV2 | null {
    return row === 0
      ? treeNodeAt(UNIVERSAL_TREE, -1, 0)
      : treeNodeAt(UNIVERSAL_TREE, branch, row - 1);
  }

  /**
   * The universal tree — UAT §18. Six paths off one shared root, walked the same way the
   * class tree is, and deliberately looking like it: the two screens are siblings, and a
   * player who has learned one shouldn't have to learn the other.
   *
   * What it says differently is whose progress it is. The class tree's header counts the
   * points *this character* levelled into; this one counts the pool the **account**
   * earned, spent per class — so the copy has to make clear both that an alt inherits the
   * points and that the spending is this character's own.
   */
  private renderUniversal(): string {
    const p = this.state.player;
    const left = this.state.universalPoints;
    const columns: string[] = [];

    for (let b = 0; b < UNIVERSAL_PATH_COUNT; b++) {
      const nodes: string[] = [];
      for (let row = 1; row <= UNIVERSAL_PATH_DEPTH; row++) {
        const node = this.universalNodeAt(b, row);
        if (!node) continue;
        const taken = p.universalAllocated.includes(node.id);
        const open = p.canAllocateUniversal(node, left);
        const here = b === this.universalBranch && row === this.cursor;
        const state = taken ? "taken" : open ? "open" : "locked";
        nodes.push(`
          <div class="tree-node ${state} ${node.category === "keystone" ? "keystone" : ""} ${isCrossLinked(node) ? "crosslink" : ""} ${here ? "on" : ""}"
               data-branch="${b}" data-index="${row}"
               style="--accent:${UNIVERSAL_ACCENT}">
            <span class="tree-name">${escapeHtml(node.name)}</span>
            <span class="tree-mods">${escapeHtml(describeNode(node))}</span>
          </div>`);
      }
      columns.push(`
        <div class="tree-col ${b === this.universalBranch ? "on" : ""}">
          <h4>${escapeHtml(UNIVERSAL_PATH_NAMES[b] ?? "")}</h4>
          ${nodes.join("")}
        </div>`);
    }

    const root = this.universalNodeAt(0, 0);
    const rootTaken = root ? p.universalAllocated.includes(root.id) : false;
    const rootHere = this.cursor === 0;
    const rootCell = root
      ? `<div class="tree-root">
           <div class="tree-node ${rootTaken ? "taken" : p.canAllocateUniversal(root, left) ? "open" : "locked"} ${rootHere ? "on" : ""}"
                data-branch="${this.universalBranch}" data-index="0"
                style="--accent:${UNIVERSAL_ACCENT}">
             <span class="tree-name">${escapeHtml(root.name)}</span>
             <span class="tree-mods">${escapeHtml(describeNode(root))} · every path starts here</span>
           </div>
         </div>`
      : "";

    const sel = this.universalNodeAt(this.universalBranch, this.cursor);
    const selTaken = sel ? p.universalAllocated.includes(sel.id) : false;
    const selLines = sel ? describeNodeLong(sel) : [];
    const prereq = sel?.requires
      ? UNIVERSAL_TREE.find((n) => n.id === sel.requires)
      : undefined;
    const crossed = sel ? isCrossLinked(sel) : false;

    const points = pathPointsByName(UNIVERSAL_TREE, p.universalAllocated);
    const unlockRow = (u: PathUnlockDef): string => {
      const prog = unlockProgress(u, points);
      const tint = u.tier === "mythic" ? "#ff1493" : UNIVERSAL_ACCENT;
      const bits = prog.parts
        .map((pt) => `<span class="${pt.ok ? "up" : "muted"}">${escapeHtml(pt.path)} ${pt.have}/${pt.need}</span>`)
        .join(" · ");
      return `<li class="${prog.met ? "up" : ""}">
        <b style="color:${tint}">${escapeHtml(u.name)}</b>${prog.met ? " — unlocked" : ""}
        <em>${escapeHtml(u.description)}</em>
        <span class="muted">${bits}</span></li>`;
    };
    const hybridRows = UNIVERSAL_UNLOCKS.filter((u) => u.tier === "hybrid").map(unlockRow).join("");
    const archRows = UNIVERSAL_UNLOCKS.filter((u) => u.tier === "mythic").map(unlockRow).join("");
    const blurb = UNIVERSAL_PATH_BLURBS[this.universalBranch];

    return `<div class="list"><div class="tree universal">${rootCell}${columns.join("")}</div></div>
      <aside class="side">
        <h3 style="color:${UNIVERSAL_ACCENT}">Universal · ${left} of ${this.state.universalPool} points</h3>
        <p class="muted">Every class shares this tree. The points are the <b>account's</b> —
        earned by how deep anyone has ever been, so a brand new alt starts with all
        ${this.state.universalPool} of them — but how they're spent is
        ${escapeHtml(p.heroClass.name)}'s own choice, and refunding here leaves your other
        characters alone.</p>
        <p class="muted">Where the class tree asks how your build works, this one asks how
        your character improves. ${p.universalAllocated.length} nodes lit.</p>
        ${sel ? `
          <h3>${escapeHtml(sel.name)}</h3>
          <p class="muted">${escapeHtml(categoryGloss(sel.category))}${sel.cost > 1 ? " · costs 2 points" : ""}</p>
          ${selLines.length
            ? `<ul class="pulls">${selLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`
            : `<p class="muted">${escapeHtml(sel.blurb)}</p>`}
          ${crossed && prereq
            ? `<p class="muted">Reached from <b>${escapeHtml(prereq.name)}</b> in
               ${escapeHtml(prereq.pathName)} — this path's lower half is only open to
               someone who has been down the one next to it.</p>`
            : ""}
          <p class="${selTaken ? "up" : p.canAllocateUniversal(sel, left) ? "" : "muted"}">
            ${selTaken ? "Lit."
              : p.canAllocateUniversal(sel, left) ? `Press ${k(this.state.settings, "confirm")} to take it.`
              : prereq && !p.universalAllocated.includes(prereq.id) ? `Take ${escapeHtml(prereq.name)} first.`
              : `Needs ${sel.cost} point${sel.cost > 1 ? "s" : ""}. The pool grows as the account goes deeper.`}</p>
        ` : ""}
        ${blurb ? `<h3>${escapeHtml(UNIVERSAL_PATH_NAMES[this.universalBranch] ?? "")}</h3><p class="muted">${escapeHtml(blurb)}</p>` : ""}
        ${hybridRows ? `<h3>Cross-path payoffs</h3><ul class="pulls">${hybridRows}</ul>` : ""}
        ${archRows ? `<h3>Paragon</h3><ul class="pulls">${archRows}</ul>` : ""}
        <p class="muted">
          <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · refund this class's universal tree</span>
          free, any time — and every keystone here costs you something, so changing your
          mind is part of the design.</p>
      </aside>`;
  }

  /**
   * Class selection, as a carousel of cards rather than a list of rows — modeled on
   * the chest shop's `renderChests`, since "browse a handful of options and preview one
   * in detail" is the same screen either way. Each card is its own save slot: a level
   * (or "new" for a class you haven't touched yet) and, on the one you're actually
   * playing, a "playing" badge. Left/right (or the arrow chips, or clicking a card) walk
   * the carousel; up/down do too, since there's only one row of cards to browse, unlike
   * Chests where up/down flip between categories instead.
   */
  private renderPath(): string {
    const cards = CLASS_IDS.map((id, i) => {
      const cls = CLASSES[id];
      const pc = this.state.players[id];
      const playing = this.state.classChosen && this.state.activeClassId === id;
      const untouched = pc.level === 1 && pc.xp === 0 && pc.allocated.length === 0
        && (Object.values(pc.equipment) as (Item | null)[]).every((it) => it === null);
      const icon = pixelImageTag(weaponSprite(cls.affinity[0]!, null, null), 64, 64, `path-${id}`);
      // The gold border (UAT §13): this class beat its own Proving at the bottom of the
      // Delve, so its Legend is Complete. Read straight off the character sheet.
      const complete = pc.legendComplete;
      return `
        <div class="class-card row ${i === this.cursor ? "on" : ""} ${complete ? "complete" : ""}" data-index="${i}"
          style="--class-color:${cls.color}">
          <div class="class-card-art">${icon}</div>
          <span class="class-card-name" style="color:${complete ? "var(--gold)" : cls.color}">${escapeHtml(cls.name)}</span>
          <span class="badge">${untouched ? "new" : `lv ${pc.level}`}</span>
          ${complete ? '<span class="badge gold">complete</span>' : ""}
          ${playing ? '<span class="badge on">playing</span>' : ""}
        </div>`;
    }).join("");

    const selId = CLASS_IDS[this.cursor] ?? this.state.activeClassId;
    const sel = CLASSES[selId];
    const selChar = this.state.players[selId];
    const isCurrent = this.state.classChosen && selId === this.state.activeClassId;
    const def = CLASS_BY_ID[selId];
    const ult = def?.abilities.find((a) => a.isUltimate);
    const weapons = sel.affinity.map((f) => WEAPONS[f].name).join(", ");
    const skills = (def?.abilities.filter((a) => !a.isUltimate) ?? [])
      .map((a) => `<li style="color:${sel.color}">${escapeHtml(a.name)}
        <em>lv ${selChar.abilityUnlockLevel(a)}</em></li>`).join("");
    const charge = def ? meterFillSummary(def) : "fighting";
    const equippedCount = (Object.values(selChar.equipment) as (Item | null)[]).filter(Boolean).length;

    // What the bottom of the Delve is currently offering this character, and what it
    // already took (UAT §13/§14). Both read off the same per-class numbers the
    // simulation reads, so the screen can never claim a border that isn't there.
    const done = selChar.legendComplete;
    const qualified = provingUnlocked(selChar.deepestDepth);
    const legend = `
        <h3 style="color:${done ? "var(--gold)" : sel.color}">The Proving</h3>
        ${done
          ? `<p><b style="color:var(--gold)">The Legend is Complete.</b> ${escapeHtml(sel.name)} went
             to the bottom of the Delve and came back the whole of itself. The border stays.</p>
             <p class="muted">${escapeHtml(legendName(selId))} is still down there, and still
             fightable. It will not get any less finished than it already is.</p>
             ${this.previewBlock(previewForRun(delveConfig(DELVE_BOTTOM, this.state.challengerTier), selId))}`
          : qualified
            ? `<p>This one has stood at the bottom, so the bottom knows it now. Depth
               ${DELVE_BOTTOM} is no longer an ordinary floor for
               ${escapeHtml(sel.name)}: <b>${escapeHtml(legendName(selId))}</b> is waiting on it.</p>
               <p class="muted">Everything of this Legend you never recovered, assembled by
               something that kept it. Beat it and the class wears a gold border.</p>
               ${this.previewBlock(previewForRun(delveConfig(DELVE_BOTTOM, this.state.challengerTier), selId))}`
            : `<p class="muted">Clear depth ${DELVE_BOTTOM} — the bottom of the Delve — and bank
               it, on this class. Then come back and something will be waiting.</p>
               <p class="muted">Deepest banked on this one: <b>${selChar.deepestDepth}</b> of
               ${DELVE_BOTTOM}. Dying down there doesn't count, and neither does bailing out.</p>`}`;

    return `<div class="carousel">
        <span class="chip carousel-arrow" data-action="left">◀</span>
        <div class="carousel-track">${cards}</div>
        <span class="chip carousel-arrow" data-action="right">▶</span>
      </div>
      <aside class="side">
        <h3 style="color:${done ? "var(--gold)" : sel.color}">${escapeHtml(sel.name)}
          ${done ? '<span class="badge gold">complete</span>' : ""}</h3>
        <p class="muted">${escapeHtml(sel.title)}</p>
        <p>${escapeHtml(sel.blurb)}</p>
        <p class="muted">${escapeHtml(sel.playstyle)}</p>
        <table class="cmp">
          <tr><td>Level</td><td>${selChar.level}</td></tr>
          <tr><td>Tree points spent</td><td>${selChar.allocated.length}</td></tr>
          <tr><td>Gear equipped</td><td>${equippedCount} / ${EQUIP_SLOTS.length}</td></tr>
        </table>
        <h3 style="color:${sel.color}">${escapeHtml(ult?.name ?? "—")}</h3>
        <p>${escapeHtml(ult?.description ?? "")}</p>
        <p class="muted">Charges by ${escapeHtml(charge)}. ${escapeHtml(def?.question ?? "")}</p>
        ${legend}
        <h3>Built for</h3>
        <p>${escapeHtml(weapons)} <span class="muted">· +${Math.round(sel.affinityBonus * 100)}% damage,
        and anything else hits a little softer</span></p>
        <h3>Skills</h3>
        <ul class="pulls">${skills}</ul>
        <h3>Trophies</h3>
        <p class="muted">The highest Challenger tier this class has actually banked a
        clear at — never a death, never a bail-out — per activity.</p>
        <table class="cmp trophies">${this.trophyRows(selChar)}</table>
        ${isCurrent
          ? '<p class="danger">You are playing this one right now.</p>'
          : this.state.classChosen
            ? `<p class="danger">Switching plays this class instead. Your `
              + `${escapeHtml(this.state.heroClass.name)} is saved exactly as it is, `
              + `waiting for whenever you switch back — every class keeps its own `
              + `level, tree and gear.</p>`
            : '<p class="danger">Nothing dives until you pick one. You can change your mind later — every class keeps its own level and build.</p>'}
      </aside>`;
  }

  /**
   * Options and the reset button, plus the full key legend — the one place in the game
   * that lists every binding, read straight out of `core/input` so it can never drift.
   */
  private renderSettings(): string {
    const s = this.state.settings;
    const rows = SETTING_SPECS.map((spec, i) => {
      const on = s[spec.key];
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-index="${i}">
          <div class="row-main">
            <span class="name">${escapeHtml(spec.label)}</span>
          </div>
          <div class="row-side" style="color:${on ? "#4ade80" : "#5a6270"}">${on ? "ON" : "OFF"}</div>
        </div>`;
    });

    const mouseScheme = s.controlScheme === "mouse";
    rows.push(`
      <div class="row ${this.controlSchemeIndex === this.cursor ? "on" : ""}" data-index="${this.controlSchemeIndex}">
        <div class="row-main">
          <span class="name">Controls</span>
        </div>
        <div class="row-side" style="color:${mouseScheme ? "#7dd3fc" : "#4ade80"}">
          ${mouseScheme ? "MOUSE + KEYBOARD" : "KEYBOARD ONLY"}
        </div>
      </div>`);

    rows.push(`
      <div class="row ${!mouseScheme ? "disabled" : ""} ${this.mouseSecondaryIndex === this.cursor ? "on" : ""}"
           data-index="${this.mouseSecondaryIndex}">
        <div class="row-main">
          <span class="name">Right click casts</span>
        </div>
        <div class="row-side" style="color:${mouseScheme ? "#e8eef7" : "#5a6270"}">
          ${MOUSE_SECONDARY_LABELS[s.mouseSecondary]}${mouseScheme ? "" : " (mouse mode off)"}
        </div>
      </div>`);

    for (let i = 0; i < REBINDABLE_ACTIONS.length; i++) {
      const action = REBINDABLE_ACTIONS[i]!;
      const index = this.keybindStartIndex + i;
      const pending = this.rebindPending === action;
      const code = s.keybinds[action] ?? DEFAULT_KEYBINDS[action];
      rows.push(`
        <div class="row ${index === this.cursor ? "on" : ""}" data-index="${index}">
          <div class="row-main">
            <span class="name">${escapeHtml(ACTION_LABELS[action])}</span>
          </div>
          <div class="row-side" style="color:${pending ? "#7dd3fc" : "#e8eef7"}">
            ${pending ? "press a key…" : `[ ${escapeHtml(keyLabel(code))} ]
              <span class="chip" data-action="secondary" data-index="${index}">reset</span>`}
          </div>
        </div>`);
    }

    const challenger = this.state.challengerTier;
    rows.push(`
      <div class="row ${this.challengerIndex === this.cursor ? "on" : ""}" data-index="${this.challengerIndex}">
        <div class="row-main">
          <span class="name" style="color:${challenger > 0 ? "#ff2d2d" : "#e8eef7"}">Challenger</span>
        </div>
        <div class="row-side" style="color:${challenger > 0 ? "#ff2d2d" : "#5a6270"}">
          ${challenger > 0 ? `${challenger}/${MAX_CHALLENGER_TIER} — ${escapeHtml(challengerName(challenger))}` : `off (0/${MAX_CHALLENGER_TIER})`}
        </div>
      </div>`);

    rows.push(`
      <div class="row ${this.resetIndex === this.cursor ? "on" : ""}" data-index="${this.resetIndex}">
        <div class="row-main">
          <span class="name" style="color:#ef4444">Reset progress</span>
          ${this.resetArmed ? `<span class="badge boss">PRESS ${k(s, "confirm")} AGAIN</span>` : ""}
        </div>
        <div class="row-side warn">wipes the save</div>
      </div>`);

    rows.push(`
      <div class="row ${this.logoutIndex === this.cursor ? "on" : ""}" data-index="${this.logoutIndex}">
        <div class="row-main">
          <span class="name">Log out</span>
        </div>
        <div class="row-side muted">back to the login screen</div>
      </div>`);

    const selected = SETTING_SPECS[this.cursor];
    const rebindAction = this.keybindRowAction(this.cursor);
    const blurb = selected
      ? `<p>${escapeHtml(selected.blurb)}</p>`
      : this.cursor === this.controlSchemeIndex
        ? `<p>Mouse + keyboard aims and attacks with the cursor — left click (or hold) to
          swing, right click for whatever's chosen below, WASD still moves. Keyboard only
          is the original game: no mouse touches the dungeon at all, and you face
          whichever way you're moving.</p>`
        : this.cursor === this.mouseSecondaryIndex
          ? `<p>What the right mouse button casts, in Mouse + keyboard mode. Cycle it with
            ${k(s, "left")}/${k(s, "right")} or click to step through the options.</p>`
          : rebindAction
            ? `<p>Press ${escapeHtml(keyLabel(s.keybinds.confirm ?? DEFAULT_KEYBINDS.confirm))}, or
              click this row, then press any key to bind
              <b>${escapeHtml(ACTION_LABELS[rebindAction])}</b> to it.
              ${escapeHtml(keyLabel(s.keybinds.cancel ?? DEFAULT_KEYBINDS.cancel))} resets it to
              ${escapeHtml(keyLabel(DEFAULT_KEYBINDS[rebindAction]))}. Every action can be
              rebound, movement and menu navigation included — the mouse always works too,
              so there's no key you can pick that locks you out of this screen.</p>`
            : this.cursor === this.challengerIndex
              ? `<p>A difficulty multiplier you choose yourself, on top of whatever a mode
                and depth already imply. Applies to the delve, every rift and every
                Reliquary sector — even the gentlest floor in the game gets real teeth at a high
                tier. ${challenger > 0 ? `Currently ×${challengerMultiplier(challenger).toFixed(1)} danger.` : ""}</p>`
              : this.cursor === this.logoutIndex
                ? `<p>Signs you out of this account and back to the login screen. Your
                  progress lives on the server, not this browser, so it's exactly where you
                  left it next time you log in — here or anywhere else.</p>`
                : `<p class="danger">Erases your class, level, tree, gear, stash, coins, keys
                  and every record. There is no undo and no backup. The page reloads into a
                  brand new character.</p>`;

    const title = selected ? selected.label
      : this.cursor === this.controlSchemeIndex ? "Controls"
      : this.cursor === this.mouseSecondaryIndex ? "Right click casts"
      : this.cursor === this.logoutIndex ? "Log out"
      : rebindAction ? ACTION_LABELS[rebindAction]
      : this.cursor === this.challengerIndex ? "Challenger"
      : "Reset progress";

    return `<div class="list">${rows.join("")}</div>
      <aside class="side">
        <h3>${escapeHtml(title)}</h3>
        ${blurb}
        <h3>In the dungeon</h3>
        <table class="cmp">${hintRows(combatHints(s))}</table>
        <h3>In town</h3>
        <table class="cmp">${hintRows(townHints(s))}</table>
        <p class="muted">Every key above can be rebound, movement and menu navigation
        included — mouse click always works everywhere too, so there's no way to rebind
        yourself out of this screen.</p>
      </aside>`;
  }

  /** Row label, current value and a colour swatch, for one line of the style screen. */
  private styleRowInfo(row: StyleRow): {
    label: string; value: string; color: string; id: string | null; blurb: string;
  } {
    const a = this.state.appearance;
    switch (row.kind) {
      case "hairStyle": {
        const hair = HAIR_COLORS[a.hair]!;
        return {
          label: "Hair", value: HAIR_STYLE_LABELS[a.hairStyle], color: hair.hair, id: null,
          blurb: "Five of them. Nobody down there is going to comment either way.",
        };
      }
      case "hair": {
        const hair = HAIR_COLORS[a.hair]!;
        return { label: "Hair colour", value: hair.name, color: hair.hair, id: null,
          blurb: "Dyed in town. Holds up remarkably well against fire." };
      }
      case "skin": {
        const tone = SKIN_TONES[a.skin]!;
        return { label: "Skin", value: tone.name, color: tone.skin, id: null,
          blurb: "Two of these are not strictly human. No questions were asked." };
      }
      case "eyes": {
        const eye = EYE_COLORS[a.eyes]!;
        return { label: "Eyes", value: eye.name, color: eye.eye, id: null,
          blurb: "Large, on purpose. It is that kind of dungeon." };
      }
      case "dye": {
        const dye = OUTFIT_DYES[a.dye]!;
        return { label: "Outfit", value: dye.name, color: dye.cloth, id: null,
          blurb: "Recolours whatever you happen to be wearing. Armour included." };
      }
      case "slot": {
        const family = this.skinFamily;
        const weaponRow = row.slot === "weapon";
        const id = wornInSlot(a, row.slot, family);
        const c = id ? COSMETICS_BY_ID[id] : null;
        const held = WEAPONS[family].name.toLowerCase();
        const owned = weaponRow
          ? this.state.ownedWeaponSkins(family).length
          : this.state.ownedInSlot(row.slot).length;
        return {
          // The weapon row is choosing for the weapon actually in your hand, and says so
          // — otherwise picking a skin, swapping weapons and seeing nothing looks broken.
          label: weaponRow ? `${COSMETIC_SLOT_LABELS[row.slot]} · ${held}` : COSMETIC_SLOT_LABELS[row.slot],
          value: c ? c.name : owned > 0 ? "— nothing —" : "— none owned —",
          color: c ? RARITY_COLORS[c.rarity] : "#5a6270",
          id,
          blurb: c
            ? c.blurb
            : weaponRow
              ? `${owned} owned that fit ${held}. Each weapon remembers its own skin.`
              : `${owned} owned for this slot.`,
        };
      }
    }
  }

  /**
   * The character screen. Everything on it is free or already paid for, and none of it
   * does anything — which is why it gets a live portrait instead of a stat table.
   */
  private renderStyle(): string {
    const rows = STYLE_ROWS.map((row, i) => {
      const info = this.styleRowInfo(row);
      const icon = info.id
        ? `<img class="pip" src="${pixelImage(cosmeticPreview(info.id), 2, info.id)}" alt="">`
        : "";
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-index="${i}">
          <div class="row-main">
            <span class="dot" style="background:${info.color}"></span>
            <span class="name">${escapeHtml(info.label)}</span>
            ${icon}
          </div>
          <div class="row-side" style="color:${info.color}">${escapeHtml(info.value)}</div>
        </div>`;
    }).join("");

    const a = this.state.appearance;
    const held = this.state.player.equipment.weapon;
    const hero = heroSprite(a, this.state.activeClassId);
    const portrait = pixelImageBody(hero.canvas, hero.bodyHeight, STYLE_PORTRAIT_BODY_PX);
    const weapon = pixelImageTag(
      weaponSprite(this.state.player.weapon.id, wornWeaponSkin(a, this.skinFamily),
        held?.rarity ?? null, held?.named ?? null), 72, Infinity, undefined, "your weapon");
    const selected = STYLE_ROWS[this.cursor];
    const info = selected ? this.styleRowInfo(selected) : null;
    const owned = this.state.cosmetics.length;

    return `<div class="list">${rows}</div>
      <aside class="side">
        <h3>You</h3>
        <div class="portrait hero"><img src="${portrait}" alt="your character"></div>
        <div class="portrait weapon">${weapon}</div>
        ${info ? `<p><b style="color:${info.color}">${escapeHtml(info.value)}</b></p>
          <p class="muted">${escapeHtml(info.blurb)}</p>` : ""}
        <p>
          <span class="chip" data-action="left">◀ ${k(this.state.settings, "left")}</span>
          <span class="chip" data-action="right">${k(this.state.settings, "right")} ▶</span>
          <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · take off</span>
        </p>
        <h3>Wardrobe</h3>
        <p><b>${owned}</b> / ${COSMETICS.length} collected</p>
        <p class="muted">None of it does anything. That is the entire promise — a hat
        will never be the reason a floor went badly.</p>
      </aside>`;
  }

  /** The gem shop. Same gamble as the chests, with nothing at stake but your dignity. */
  private renderCapsules(): string {
    const n = this.bulk ? 10 : 1;
    const rows = CAPSULE_TIERS.map((tier, i) => {
      const info = CAPSULES[tier];
      const cost = info.price * n;
      const afford = this.state.gems >= info.price;
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-index="${i}">
          <div class="row-main">
            <span class="dot" style="background:${info.color}"></span>
            <span class="name">${tier}</span>
          </div>
          <div class="row-side ${afford ? "" : "warn"}">
            ${escapeHtml(info.blurb)} · ${formatNumber(cost)} gems for ${n}
          </div>
        </div>`;
    }).join("");

    const pulls = this.lastCapsules.length
      ? this.lastCapsules.map((p) => `
          <li style="color:${p.dupe ? "#6b7480" : RARITY_COLORS[p.cosmetic.rarity]}">
            <img class="pip" src="${pixelImage(cosmeticPreview(p.cosmetic.id), 2, p.cosmetic.id)}" alt="">
            ${escapeHtml(p.cosmetic.name)}
            <em>${p.dupe ? `duplicate · +${p.refund} gems` : COSMETIC_SLOT_LABELS[p.cosmetic.slot]}</em>
          </li>`).join("")
      : '<li class="muted">Nothing opened yet.</li>';

    const owned = this.state.cosmetics.length;
    return `<div class="list">${rows}</div>
      <aside class="side">
        <h3><span class="gemcount">${formatNumber(this.state.gems)}</span> gems</h3>
        <p class="muted">Gems drop in the dungeon and buy nothing else. Coins never
        become gems and gems never become coins.</p>
        <h3>Bulk: <b>${this.bulk ? "10×" : "1×"}</b>
          <span class="chip" data-action="left">1×</span>
          <span class="chip" data-action="right">10×</span></h3>
        <h3>Last pull</h3>
        <ul class="pulls">${pulls}</ul>
        <p class="muted">Duplicates come back as gems. <b>${owned}</b> / ${COSMETICS.length}
        collected.</p>
      </aside>`;
  }

  /**
   * The Codex — the class-refactor roster, in the game as a browsable reference.
   *
   * This reads entirely from `src/progression` — the same 21-class layer the live
   * dungeon now runs — as a browse-the-whole-roster reference, where the Path and Tree
   * tabs only ever show the class you're playing. It's the matrix the refactor spec
   * asks for — class → resource → role → damage → mechanic → ultimate → paths → hybrids
   * — plus a drill-down into each class's ten skills and its hybrid/archetype builds.
   */
  private renderCodex(): string {
    const VIEWS = ["Overview", "Skills", "Builds"] as const;
    const rows = ALL_CLASSES.map((def, i) => {
      const color = CLASSES[def.classId as ClassId]?.color ?? "#9aa4b2";
      const m = classMatrixRow(def);
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-index="${i}">
          <div class="row-main">
            <span class="name" style="color:${color}">${escapeHtml(def.name)}</span>
          </div>
          <div class="row-side" style="color:#8b93a2">${escapeHtml(m.resource)}</div>
        </div>`;
    }).join("");

    const def = ALL_CLASSES[this.cursor] ?? ALL_CLASSES[0]!;
    const color = CLASSES[def.classId as ClassId]?.color ?? "#9aa4b2";
    const m = classMatrixRow(def);
    const ult = def.abilities.find((a) => a.isUltimate)!;
    const tabs = VIEWS.map((v, i) =>
      `<span class="chip ${i === this.codexView ? "on" : ""}" data-action="${i === 0 ? "left" : "right"}">${v}</span>`,
    ).join(" ");

    let body: string;
    if (this.codexView === 0) {
      const dctx: DescribeCtx = {
        abilityName: (id) => def.abilities.find((a) => a.id === id)?.name,
        resourceLabel: (id) => def.resources.find((r) => r.id === id)?.label,
      };
      const paths = def.progression.paths.map((pathDef) => {
        const nodes = pathDef.nodes.map((n) => {
          const lines = describeEffects(n.effects, dctx);
          return `<li><b>${escapeHtml(n.name)}</b> <span class="muted">${escapeHtml(n.category)}</span>
            <em>${escapeHtml(lines.join(" · ") || categoryGloss(n.category))}</em></li>`;
        }).join("");
        return `<h4 style="color:${color}">${escapeHtml(pathDef.name)}</h4>
          <p class="muted">${escapeHtml(pathDef.blurb)}</p>
          <ul class="pulls">${nodes}</ul>`;
      }).join("");
      body = `
        <table class="cmp">
          <tr><td>Resource</td><td>${escapeHtml(m.resource)}</td></tr>
          <tr><td>Damage identity</td><td>${escapeHtml(m.damageIdentity)}</td></tr>
          <tr><td>Ultimate</td><td>${escapeHtml(m.ultimate)}</td></tr>
        </table>
        <h3>Unique mechanic</h3>
        <p>${escapeHtml(m.mechanic)}</p>
        <p class="muted">${escapeHtml(def.fantasy)}</p>
        <h3>Five paths <span class="muted">foundation → behaviour → resource → mutation → keystone</span></h3>
        ${paths}`;
    } else if (this.codexView === 1) {
      const skills = def.abilities.map((a) => {
        const tags = a.tags.slice(0, 4).join(" · ");
        return `<li${a.isUltimate ? ' style="color:' + color + '"' : ""}>
          ${escapeHtml(a.name)}${a.isUltimate ? " — ULTIMATE" : ""}
          <em>${escapeHtml(a.description)}${tags ? ` <span class="muted">[${escapeHtml(tags)}]</span>` : ""}</em></li>`;
      }).join("");
      body = `
        <p class="muted">Nine skills and one ultimate, unique to this class — no skill is shared
        with any other class in the roster.</p>
        <ul class="pulls">${skills}</ul>`;
    } else {
      const hybrids = def.unlocks.filter((u) => u.tier === "hybrid").map((u) =>
        `<li>${escapeHtml(u.name)} <em>${escapeHtml(u.requires.map((r) => `${r.path} ${r.points}`).join(" + "))} — ${escapeHtml(u.description)}</em></li>`).join("");
      const archs = def.unlocks.filter((u) => u.tier === "mythic").map((u) =>
        `<li style="color:${color}">${escapeHtml(u.name)} <em>${escapeHtml(u.requires.map((r) => `${r.path} ${r.points}`).join(" + "))} — ${escapeHtml(u.description)}</em></li>`).join("");
      body = `
        <h3>Cross-path hybrids</h3>
        <ul class="pulls">${hybrids}</ul>
        <h3>Mythic Archetype${def.unlocks.filter((u) => u.tier === "mythic").length > 1 ? "s" : ""}</h3>
        <ul class="pulls">${archs}</ul>`;
    }

    return `<div class="list">${rows}</div>
      <aside class="side">
        <h3 style="color:${color}">${escapeHtml(def.name)}</h3>
        <p class="muted">${escapeHtml(m.role)}</p>
        <p>${tabs}</p>
        ${body}
        <p class="muted">${escapeHtml(ult.flavor ?? "")}</p>
        <p class="muted">The live roster: <b>${ALL_CLASSES.length} classes</b>,
        ${ALL_CLASSES.length * 10} unique skills, ${ALL_CLASSES.length * 6} cross-path hybrids.
        Play one from the Path tab; spend its points on the Tree tab.</p>
      </aside>`;
  }

  private renderRecords(): string {
    const st = this.state.stats;
    const rarities = RARITIES.map(
      (r) => `<tr><td style="color:${RARITY_COLORS[r]}">${rarityLabel(r)}</td>
        <td>${formatNumber(st.raritiesFound[r])}</td></tr>`).join("");
    const chests = CHEST_TIERS.map(
      (t) => `<tr><td>${escapeHtml(chestName(t))}</td><td>${formatNumber(st.chestsOpened[t])}</td></tr>`).join("");
    const rifts = RIFT_MODES.map(
      (m) => `<tr><td style="color:${MODES[m].color}">${MODES[m].name}</td>
        <td>${formatNumber(st.riftsCleared[m] ?? 0)} cleared · tier ${this.state.riftTiers[m]}</td></tr>`).join("");
    // Every named item and where it comes from — the seed of the UAT §20 drop preview:
    // "I want X, and this is where I get it", whether or not you've seen X yet.
    const named = NAMED_ITEMS.map((def) => {
      const n = st.namedFound[def.id] ?? 0;
      return `<li><b style="color:${RARITY_COLORS[def.rarity]}">${escapeHtml(def.name)}</b>
        <span class="muted">${n > 0 ? `found ×${n}` : "not yet"}</span>
        <em>${escapeHtml(namedSourceLines(def).join(" · "))}</em></li>`;
    }).join("");
    // UAT §19 rule 4: every relic and artifact, owned or not, with where it drops — the
    // other half of the §20 seed. Owned ones read in their tier colour, the rest in grey.
    const relicRows = (tier: RelicDef["tier"]): string => relicsOfTier(tier).map((def) => {
      const owned = this.state.ownsRelic(def.id);
      const n = st.relicsFound[def.id] ?? 0;
      return `<li><b style="color:${owned ? RELIC_TIER_INFO[def.tier].color : "#5a6270"}">${escapeHtml(def.name)}</b>
        <span class="muted">${owned ? (n > 1 ? `found ×${n}` : "found") : "not yet"}</span>
        <em>${escapeHtml(relicSourceLines(def).join(" · "))}</em></li>`;
    }).join("");
    // UAT §13: which Legends are Complete. Only the finished ones are listed — a wall of
    // twenty-one "not yet" rows would say less than the count already does.
    const complete = CLASS_IDS.filter((id) => this.state.players[id].legendComplete);
    const legends = complete.length === 0
      ? `<p class="muted">None yet. Clear depth ${DELVE_BOTTOM} on a class, then go back down.</p>`
      : `<table class="cmp">${complete.map((id) => `<tr>
          <td style="color:var(--gold)">${escapeHtml(CLASSES[id].name)}</td>
          <td>${escapeHtml(legendName(id))}</td></tr>`).join("")}</table>`;

    return `
      <div class="list records">
        <table class="cmp wide">
          <tr><td>Coins earned</td><td>${formatNumber(st.coinsEarned)}</td></tr>
          <tr><td>Coins spent</td><td>${formatNumber(st.coinsSpent)}</td></tr>
          <tr><td>Items sold</td><td>${formatNumber(st.itemsSold)}</td></tr>
          <tr><td>Enemies killed</td><td>${formatNumber(st.enemiesKilled)}</td></tr>
          <tr><td>Bosses killed</td><td>${formatNumber(st.bossesKilled)}</td></tr>
          <tr><td>Runs extracted</td><td>${formatNumber(st.runsCompleted)}</td></tr>
          <tr><td>Deaths</td><td>${formatNumber(st.deaths)}</td></tr>
          <tr><td>Deepest depth</td><td>${st.deepestDepth}</td></tr>
          <tr><td>Highest floor of the Tower</td><td>${st.highestHeight}</td></tr>
          <tr><td>Gems earned</td><td>${formatNumber(st.gemsEarned)}</td></tr>
          <tr><td>Capsules opened</td><td>${formatNumber(st.capsulesOpened)}</td></tr>
          <tr><td>Wardrobe</td><td>${this.state.cosmetics.length} / ${COSMETICS.length}</td></tr>
          <tr><td>Legends complete</td><td style="color:${this.state.legendsComplete > 0 ? "var(--gold)" : "inherit"}">
            ${this.state.legendsComplete} / ${CLASS_IDS.length}</td></tr>
        </table>
      </div>
      <aside class="side">
        <h3>Rifts</h3>
        <table class="cmp">${rifts}</table>
        <h3>Named items <span class="muted">${Object.keys(st.namedFound).filter((id) => id in NAMED_BY_ID).length} / ${NAMED_ITEMS.length}</span></h3>
        <ul class="pulls">${named}</ul>
        <h3>Relics <span class="muted">${relicsOfTier("relic").filter((d) => this.state.ownsRelic(d.id)).length} / ${relicsOfTier("relic").length}</span></h3>
        <ul class="pulls">${relicRows("relic")}</ul>
        <h3>Artifacts <span class="muted">${relicsOfTier("artifact").filter((d) => this.state.ownsRelic(d.id)).length} / ${relicsOfTier("artifact").length}</span></h3>
        <ul class="pulls">${relicRows("artifact")}</ul>
        <h3>Legends</h3>
        ${legends}
        <h3>Rarities found</h3>
        <table class="cmp">${rarities}</table>
        <h3>Chests opened</h3>
        <table class="cmp">${chests}</table>
      </aside>`;
  }

  /**
   * Global leaderboards (`docs/leaderboards.md`, docket item 4). A pure reading screen —
   * no action bar, per `docs/actions-vs-reading-panels`, because there is nothing here to
   * act on: submission happens automatically in the background
   * (`GameState.recordsHook`/`RecordsSubmitter` in `main.ts`), and every board and class
   * filter here is navigation, not a mutation. `lbKey` is the (board, class) pair the
   * currently-held rows answer for; the moment A/D or `;` moves either one, this render
   * notices the mismatch and kicks off a fresh fetch — the same "recompute on render, the
   * cache key says whether to" idiom `buildMinimapBackground` uses for a different cache.
   */
  private renderLeaderboards(): string {
    const board = LEADERBOARD_BOARDS[this.lbBoardIdx]!;
    const key = `${board.id}:${this.lbClassFilter}`;
    if (key !== this.lbKey) {
      this.lbKey = key;
      this.lbError = null;
      // Drop the outgoing board's rows rather than leaving them on screen relabelled
      // under the new board's header while the fresh fetch is in flight — a stale
      // "Record" column read against the wrong board's `formatLbValue` case is worse
      // than the loading state it would otherwise show.
      if (board.id === "recent") this.lbRecent = null; else this.lbRows = null;
      this.fetchLeaderboard(board.id, this.lbClassFilter);
    }

    const boardChips = LEADERBOARD_BOARDS.map((b, i) => `
      <span class="chip ${i === this.lbBoardIdx ? "on" : ""}" data-lb-board="${i}">${escapeHtml(b.label)}</span>
    `).join("");
    const classChips = LEADERBOARD_CLASS_FILTERS.map((c) => `
      <span class="chip ${c === this.lbClassFilter ? "on" : ""}" data-lb-class="${c}">
        ${c === "all" ? "All classes" : escapeHtml(CLASSES[c].name)}</span>
    `).join("");

    let body: string;
    if (board.id === "recent") {
      const rows = this.lbRecent;
      body = this.lbLoading && !rows ? `<p class="muted">Loading…</p>`
        : this.lbError ? `<p class="muted">Couldn't reach the leaderboard server — ${escapeHtml(this.lbError)}</p>`
        : !rows || rows.length === 0 ? `<p class="muted">Nothing recorded yet — go do something first.</p>`
        : `<table class="cmp wide"><tr class="cmp-head"><td>Board</td><td>Who</td><td>Class</td><td></td></tr>${
          rows.map((r) => `<tr class="${r.username === this.username ? "you" : ""}">
            <td>${escapeHtml(lbBoardLabel(r.board))}</td><td>${escapeHtml(r.username)}</td>
            <td>${escapeHtml(CLASSES[r.classId as ClassId]?.name ?? r.classId)}</td>
            <td>${escapeHtml(formatLbValue(r.board, r.value, r.tier, r.meta))}</td></tr>`).join("")
        }</table>`;
    } else {
      const rows = this.lbRows;
      body = this.lbLoading && !rows ? `<p class="muted">Loading…</p>`
        : this.lbError ? `<p class="muted">Couldn't reach the leaderboard server — ${escapeHtml(this.lbError)}</p>`
        : !rows || rows.length === 0 ? `<p class="muted">Nobody's on this board yet.</p>`
        : `<table class="cmp wide"><tr class="cmp-head"><td>#</td><td>Who</td><td>Class</td><td>Record</td></tr>${
          rows.map((r, i) => `<tr class="${r.username === this.username ? "you" : ""}">
            <td>${i + 1}</td><td>${escapeHtml(r.username)}</td>
            <td>${escapeHtml(CLASSES[r.classId as ClassId]?.name ?? r.classId)}</td>
            <td>${escapeHtml(formatLbValue(board.id, r.value, r.tier, r.meta))}</td></tr>`).join("")
        }</table>`;
    }

    return `
      <div class="list records">
        <div class="chest-cats">${boardChips}</div>
        <div class="chest-cats">${classChips}</div>
        ${body}
      </div>
      <aside class="side">
        <h3>How this works</h3>
        <p class="muted">Records are submitted on their own, in the background, as you
        play — there's nothing to do on this screen but look. Everything here is
        self-reported: there's no anti-cheat anywhere in this game, so a wild number is
        worth exactly as much trust as a friend's fishing story.</p>
      </aside>`;
  }

  private fetchLeaderboard(board: string, classFilter: ClassId | "all"): void {
    this.lbLoading = true;
    const token = ++this.lbFetchToken;
    const onError = (err: unknown) => {
      if (token !== this.lbFetchToken) return;
      this.lbLoading = false;
      this.lbError = err instanceof Error ? err.message : String(err);
      this.refresh();
    };
    if (board === "recent") {
      this.records.fetchRecent().then((rows) => {
        if (token !== this.lbFetchToken) return;
        this.lbLoading = false;
        this.lbRecent = rows;
        this.refresh();
      }).catch(onError);
    } else {
      this.records.fetchBoard(board, classFilter === "all" ? undefined : classFilter).then((rows) => {
        if (token !== this.lbFetchToken) return;
        this.lbLoading = false;
        this.lbRows = rows;
        this.refresh();
      }).catch(onError);
    }
  }
}

/** One key legend as table rows. The hint lists are the single source of truth. */
function hintRows(hints: readonly { keys: string; label: string }[]): string {
  return hints
    .map((h) => `<tr><td>${escapeHtml(h.label)}</td><td>${escapeHtml(h.keys)}</td></tr>`)
    .join("");
}

/** Short label for a modifier, for tables where the full phrase is too wide. */
function shortLabel(key: ModKey): string {
  return MOD_LABELS[key];
}

/** A modifier value, formatted the way its key wants to be read. */
function fmtMod(key: ModKey, value: number): string {
  if (value === 0) return "0";
  return PERCENT_MODS.has(key) ? `${Math.round(value * 100)}%` : String(Math.round(value * 10) / 10);
}

function isStatKey(key: ModKey): boolean {
  return (STAT_KEYS as readonly string[]).includes(key);
}

function isResistKey(key: ModKey): boolean {
  return key.endsWith("Resist");
}

/** "12 Rage · 4s" style cost readout for an ability. */
function abilityCostLine(a: Ability, p: { cooldownMult: number }): string {
  const costs = (a.costs ?? []).map((c) => `${Math.round(c.amount)} ${c.resource}`);
  const cd = a.cooldown > 0 ? `${(a.cooldown * p.cooldownMult).toFixed(1)}s` : "no cd";
  return [...costs, cd].join(" · ");
}

/** The v2 node at a path/row, or null. */
function treeNodeAt(tree: readonly TreeNodeV2[], path: number, row: number): TreeNodeV2 | null {
  return tree.find((n) => n.path === path && n.row === row) ?? null;
}

/** Ids of every hybrid and Mythic Archetype a resolved build currently has active. */
function unlockIds(build: {
  hybrids: readonly { id: string }[];
  archetypes: readonly { id: string }[];
}): Set<string> {
  return new Set([...build.hybrids, ...build.archetypes].map((u) => u.id));
}

/** Plain English for how a class fills its ultimate meter, read off its generation rules. */
function meterFillSummary(def: PilotClass): string {
  const meter = def.resources.find((r) => r.isUltimateMeter);
  const on = new Set((meter?.generation ?? []).map((g) => g.on));
  const parts: string[] = [];
  if (on.has("kill") || on.has("enemyDeath")) parts.push("kills");
  if (on.has("damageTaken") || on.has("hitTaken")) parts.push("taking hits");
  if (on.has("damagePrevented") || on.has("block")) parts.push("preventing damage");
  if (on.has("crit")) parts.push("critical hits");
  if (on.has("ailmentInflicted")) parts.push("inflicting ailments");
  if (on.has("move") || on.has("dashStart")) parts.push("covering ground");
  if (on.has("hitDealt") || on.has("damageDealt")) parts.push("landing hits");
  if (on.has("skillUse")) parts.push("casting");
  if (on.has("resourceSpent") || on.has("manaSpent")) parts.push("spending your resource");
  if (on.has("corpseCreated")) parts.push("leaving corpses");
  return parts.length ? parts.join(" and ") : "fighting";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
