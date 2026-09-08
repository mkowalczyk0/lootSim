import { combatHints, Input, skillKeys, townHints } from "../core/input";
import { clamp, formatNumber } from "../core/math";
import { challengerMultiplier, challengerName, MAX_CHALLENGER_TIER } from "../data/challenger";
import { CHEST_CATEGORIES, CHESTS, CHEST_TIERS, chestName } from "../data/chests";
import {
  CAPSULES, CAPSULE_TIERS, COSMETICS, COSMETIC_SLOTS, COSMETIC_SLOT_LABELS,
  COSMETICS_BY_ID, EYE_COLORS, HAIR_COLORS, HAIR_STYLES, HAIR_STYLE_LABELS,
  OUTFIT_DYES, SKIN_TONES, type CosmeticSlot,
} from "../data/cosmetics";
import {
  CRAFTABLE_RARITIES, CRAFT_CATEGORIES, CRAFT_CATEGORY_LABELS, craftBulkCost, craftEssenceCost,
  reforgeCoinCost, type CraftCategory,
} from "../data/crafting";
import { biomeFor } from "../data/biomes";
import { profileFor } from "../data/depth";
import {
  ELEMENTS, ELEMENT_COLORS, ELEMENT_LABELS, MAGIC_ELEMENTS, resistFraction, type Element,
} from "../data/elements";
import { MATERIALS } from "../data/materials";
import {
  MODES, RUN_MODES, delveConfig, modeUnlocked, riftConfig, type RunConfig, type RunModeId,
} from "../data/modes";
import { PLANETS, planetConfig, planetUnlocked, type PlanetSpec } from "../data/planets";
import {
  DAILY_MODIFIERS, DAILY_NAME, DAILY_UNLOCK_DEPTH, dailyConfig, dailyPlan, dailyUnlocked, dayNumber, msUntilReset,
} from "../data/daily";
import { trapsFor } from "../data/traps";
import { EQUIP_SLOTS, STAT_KEYS, STAT_LABELS, triggerLine, type EquipSlot } from "../data/items";
import { CLASSES, CLASS_IDS, type ClassId } from "../data/classes";
import { MOD_KEYS, MOD_LABELS, PERCENT_MODS, type ModKey } from "../data/mods";
import { WEAPONS } from "../data/weapons";
import { RARITIES, RARITY_COLORS, rarityIndex, rarityLabel, type Rarity } from "../data/rarity";
import {
  ACTION_LABELS, DEFAULT_KEYBINDS, keyLabel, MOUSE_SECONDARY_LABELS, MOUSE_SECONDARY_OPTIONS,
  REBINDABLE_ACTIONS, SETTING_SPECS, type RebindableAction, type Settings,
} from "../data/settings";
import { SKILL_SLOTS } from "../game/player";
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
import { chestIcon, cosmeticPreview, heroComposite, itemIcon, weaponSprite } from "../render/sprites";
import { ChestRoll } from "./chestroll";
import { pixelImage, pixelImageFit } from "./pixelimage";

/**
 * Reached by walking to a station in the ship hub and never by cycling — the dive, each
 * rift and the star map are destinations, not menu rows. Everything in `CYCLE_TABS` is
 * the Quartermaster's screen, browsed the old way with [I]/[O].
 */
const CYCLE_TABS = [
  "Chests", "Stash", "Hero", "Skills", "Tree", "Universal", "Path", "Style", "Capsules", "Codex",
  "Records", "Settings",
] as const;
const STATION_TABS = ["Dive", "Rifts", "StarMap", "Craft", "Party", "Vigil"] as const;
type StationTab = (typeof STATION_TABS)[number];
export type Tab = (typeof CYCLE_TABS)[number] | StationTab;

const STATION_LABELS: Record<StationTab, string> = {
  Dive: "THE DELVE", Rifts: "RIFT PORTAL", StarMap: "THE ASHEN RELIQUARY", Craft: "THE FORGE",
  Party: "COMMS RELAY", Vigil: "THE VIGIL",
};

/** The glyph an empty paper-doll slot shows in place of an item icon. */
const SLOT_GLYPH: Record<EquipSlot, string> = {
  weapon: "⚔", armor: "🛡", shield: "◈", ring: "◍", gloves: "✋", necklace: "❈",
};

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
function tabHelp(tab: Tab, s: Settings, forgeMode: "craft" | "reforge" = "craft"): string {
  const sel = `${k(s, "up")}/${k(s, "down")}`;
  const adj = `${k(s, "left")}/${k(s, "right")}`;
  const e = k(s, "confirm");
  const q = k(s, "cancel");
  const semi = k(s, "special"); // menus reuse the ultimate key as a "tertiary" action
  const forgeToggle = `${k(s, "tabPrev")}/${k(s, "tabNext")}`;
  switch (tab) {
    case "Dive": return `${sel} choose depth · ${e} dive · ${q} buy a potion`;
    case "Rifts": return `${sel} choose tier · ${adj} switch rift · ${e} open the rift`;
    case "StarMap": return `${sel} choose tier · ${adj} switch sector · ${e} open a portal for it`;
    case "Vigil": return `${e} keep the Vigil · the same floor for everyone today · one key for closing it`;
    case "Craft": return forgeMode === "reforge"
      ? `${sel} choose an item · ${e} reforge its affixes · ${forgeToggle} switch to crafting`
      : `${sel} choose rarity · ${adj} essence · ${semi} category · ${e} craft · ${q} clear essence · ${forgeToggle} switch to reforging`;
    case "Party": return `${sel} select · ${e} do it · then the host walks into a portal and picks, and everyone walks into that portal`;
    case "Chests": return `${sel} switch category · ${adj} browse chests · ${e} open · ${q} buy key · ${semi} bulk 1↔10`;
    case "Stash": return `${sel} / ${adj} move · up onto the bar to filter by rarity · ${e} equip · ${q} sell · ${semi} sell all junk`;
    case "Hero": return `${sel} / ${adj} pick a slot · ${e} unequip`;
    case "Skills": return `${sel} choose a slot · ${adj} or ${e} cycle the skill · ${q} clear it`;
    case "Tree": return `${sel} walk a branch · ${adj} switch branch · ${e} spend a point · ${q} refund everything`;
    case "Universal": return `${sel} walk a path · ${adj} switch path · ${e} spend a point · ${q} refund it all — shared by every class`;
    case "Path": return `${sel} choose a class · ${e} commit to it`;
    case "Style": return `${sel} choose · ${adj} change · ${e} next · ${q} take it off`;
    case "Capsules": return `${sel} choose capsule · ${e} open · ${adj} bulk 1↔10`;
    case "Codex": return `${sel} browse the class roster · ${adj} switch view — the full 21-class design; play one from the Path tab`;
    case "Records": return "Nothing to do here — just numbers.";
    case "Settings": return `${sel} select · ${e} toggle/rebind · ${q} resets a key/backs out · reset progress asks twice`;
  }
}

// "planet" is rift-shaped internally (fixed floors, a boss, tier scaling) but it isn't
// a selectable rift flavor — it's the mechanical shell every Reliquary expedition borrows.
// The Rifts screen only ever shows the two the player actually picks between.
// The planet shell and the daily Vigil are rift-*shaped* but have their own screens.
const RIFT_MODES = RUN_MODES.filter((m) => MODES[m].isRift && m !== "planet" && m !== "vigil");

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
  /** Which of `CHEST_CATEGORIES` the chest shop's carousel is showing. */
  private chestCategory = 0;
  private rarityFilter: Rarity | "all" = "all";
  private riftMode: RunModeId = "hoard";
  /** Which Reliquary sector the gate screen is showing. */
  private starMapPlanet: PlanetSpec = PLANETS[0]!;
  private craftCategory: CraftCategory = "weapon";
  private craftEssence: Element | null = null;
  /** The Forge is two screens sharing a station: craft something new, or reforge
   *  something already found. Toggled with tabPrev/tabNext, which are otherwise inert
   *  on a station tab. */
  private forgeMode: "craft" | "reforge" = "craft";
  /** Codex tab: which slice of a class's design the side panel is showing. */
  private codexView: 0 | 1 | 2 = 0;
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
    /** The party, for the Comms Relay screen. It owns the connection; this only shows it. */
    private readonly party: Party,
    /** Settings' "Log out" row. `main.ts` owns what logging out actually does. */
    private readonly onLogout: () => void,
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
        this.rebindPending = null;
        this.render();
        return;
      }
      const catEl = target.closest<HTMLElement>("[data-category]");
      if (catEl) {
        this.chestCategory = Number(catEl.dataset.category);
        this.cursor = 0;
        this.render();
        return;
      }
      const forgeModeEl = target.closest<HTMLElement>("[data-forge-mode]");
      if (forgeModeEl) {
        this.forgeMode = forgeModeEl.dataset.forgeMode as "craft" | "reforge";
        this.cursor = 0;
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
      const actionEl = target.closest<HTMLElement>("[data-action]");
      if (actionEl) {
        const action = actionEl.dataset.action!;
        const index = actionEl.dataset.index;
        if (index !== undefined) this.cursor = Number(index);
        switch (action) {
          case "left": this.adjust(-1); break;
          case "right": this.adjust(1); break;
          case "secondary": this.secondary(); break;
          case "tertiary": this.tertiary(); break;
        }
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
    this.cursor = 0;
    this.resetArmed = false;
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
    // Stash allows cursor -1 (the rarity-filter bar has focus); every other tab floors at 0.
    this.cursor = Math.max(this.tab === "Stash" ? -1 : 0, Math.min(this.cursor, this.rowCount() - 1));
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
      this.forgeMode = this.forgeMode === "craft" ? "reforge" : "craft";
      this.cursor = 0;
      this.resetArmed = false;
      dirty = true;
    }
    if (input.wasPressed("tabNext")) {
      const i = (CYCLE_TABS as readonly Tab[]).indexOf(this.tab);
      if (i >= 0) {
        this.tab = CYCLE_TABS[(i + 1) % CYCLE_TABS.length]!;
        this.cursor = 0;
        this.resetArmed = false;
        dirty = true;
      }
    }
    if (input.wasPressed("tabPrev")) {
      const i = (CYCLE_TABS as readonly Tab[]).indexOf(this.tab);
      if (i >= 0) {
        this.tab = CYCLE_TABS[(i - 1 + CYCLE_TABS.length) % CYCLE_TABS.length]!;
        this.cursor = 0;
        this.resetArmed = false;
        dirty = true;
      }
    }

    const count = this.rowCount();

    // Stash, Hero and Reforge (Craft's other screen) are real 2-D grids: W/A/S/D walk
    // them in both axes and A/D are spent on nothing but movement. Every other tab keeps
    // the flat-list model — up/down walk the cursor, left/right adjust whatever that tab
    // adjusts.
    const reforgeGrid = this.tab === "Craft" && this.forgeMode === "reforge";
    if (this.tab === "Stash" || this.tab === "Hero" || reforgeGrid) {
      const walk = (dx: number, dy: number) => {
        const moved = this.tab === "Stash" ? this.navStash(dx, dy)
          : reforgeGrid ? this.navReforge(dx, dy)
          : this.navHero(dx, dy);
        if (moved) { this.resetArmed = false; dirty = true; }
      };
      if (input.wasPressedOrRepeated("up")) walk(0, -1);
      if (input.wasPressedOrRepeated("down")) walk(0, 1);
      if (input.wasPressedOrRepeated("left")) walk(-1, 0);
      if (input.wasPressedOrRepeated("right")) walk(1, 0);
    } else {
      // Chests is the one screen where up/down don't walk the row the cursor is on —
      // they flip between categories (General, Weapon Specific, ...), because the chests
      // themselves are a left/right carousel within whichever category is showing.
      if (input.wasPressedOrRepeated("down") && count > 0) {
        if (this.tab === "Chests") {
          this.chestCategory = (this.chestCategory + 1) % CHEST_CATEGORIES.length;
          this.cursor = 0;
        } else {
          this.cursor = (this.cursor + 1) % count;
        }
        this.resetArmed = false;
        dirty = true;
      }
      if (input.wasPressedOrRepeated("up") && count > 0) {
        if (this.tab === "Chests") {
          this.chestCategory = (this.chestCategory - 1 + CHEST_CATEGORIES.length) % CHEST_CATEGORIES.length;
          this.cursor = 0;
        } else {
          this.cursor = (this.cursor - 1 + count) % count;
        }
        this.resetArmed = false;
        dirty = true;
      }
      if (input.wasPressed("left")) dirty = this.adjust(-1) || dirty;
      if (input.wasPressed("right")) dirty = this.adjust(1) || dirty;
    }
    if (input.wasPressed("confirm")) { this.primary(); dirty = true; }
    if (input.wasPressed("cancel")) { this.secondary(); dirty = true; }
    if (input.wasPressed("special")) { this.tertiary(); dirty = true; }

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
      case "Dive": return this.state.maxUnlockedDepth;
      case "Rifts": return this.state.riftTiers[this.riftMode];
      case "StarMap": return this.state.planetProgress[this.starMapPlanet.id] ?? 1;
      case "Vigil": return 1;
      case "Craft": return this.forgeMode === "reforge"
        ? this.reforgeCandidates().length : CRAFTABLE_RARITIES.length;
      case "Party": return this.partyRows().length;
      case "Chests": return CHEST_CATEGORIES[this.chestCategory]!.tiers.length;
      case "Stash": return this.filteredStash().length;
      case "Hero": return EQUIP_SLOTS.length;
      case "Skills": return SKILL_SLOTS;
      case "Tree": return TREE_PATH_DEPTH;
      // Row 0 is the shared root, which sits above the columns and is reachable by
      // walking up out of any of them — exactly what the tree's DAG says it is.
      case "Universal": return UNIVERSAL_PATH_DEPTH + 1;
      case "Path": return CLASS_IDS.length;
      case "Style": return STYLE_ROWS.length;
      case "Capsules": return CAPSULE_TIERS.length;
      case "Codex": return ALL_CLASSES.length;
      case "Records": return 0;
      case "Settings": return this.logoutIndex + 1;
    }
  }

  private adjust(dir: number): boolean {
    if (this.tab === "Capsules") {
      this.bulk = dir > 0;
      return true;
    }
    if (this.tab === "Chests") {
      const tiers = CHEST_CATEGORIES[this.chestCategory]!.tiers;
      this.cursor = (this.cursor + dir + tiers.length) % tiers.length;
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
    if (this.tab === "Craft" && this.forgeMode === "craft") {
      const options: (Element | null)[] = [null, ...MAGIC_ELEMENTS];
      const i = options.indexOf(this.craftEssence);
      this.craftEssence = options[(i + dir + options.length) % options.length] ?? null;
      return true;
    }
    if (this.tab === "Skills") {
      this.cycleSkill(this.cursor, dir);
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
   *  (Stash's or Reforge's — they share the `.stash-grid` class and only one is ever on
   *  screen at a time). The grid is `auto-fill`, so this is read back off the DOM rather
   *  than assumed. */
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
   * 2-D movement across the Reforge card grid — the same column-stepping Stash uses,
   * minus the rarity-filter bar Reforge doesn't have, so "up" from the top row simply
   * stays put instead of walking onto a bar that isn't there.
   */
  private navReforge(dx: number, dy: number): boolean {
    const n = this.reforgeCandidates().length;
    if (n === 0) return false;
    const cols = this.stashColumns();
    let next = this.cursor;
    if (dx !== 0) next = clamp(this.cursor + dx, 0, n - 1);
    else if (dy < 0 && this.cursor >= cols) next = this.cursor - cols;
    else if (dy > 0) next = Math.min(n - 1, this.cursor + cols);
    if (next === this.cursor) return false;
    this.cursor = next;
    return true;
  }

  /** The Hero paper-doll's two real columns, top to bottom, as they're drawn — so W/S
   *  walk a column and A/D jump between them, instead of the flat slot-index order. */
  private static readonly DOLL_LAYOUT: readonly (readonly EquipSlot[])[] = [
    ["weapon", "armor", "shield"],
    ["gloves", "ring", "necklace"],
  ];

  /** 2-D movement across the Hero equipment slots, following the drawn column layout. */
  private navHero(dx: number, dy: number): boolean {
    const layout = TownUI.DOLL_LAYOUT;
    const cur = EQUIP_SLOTS[this.cursor] ?? "weapon";
    let col = layout.findIndex((c) => c.includes(cur));
    if (col < 0) col = 0;
    let row = Math.max(0, layout[col]!.indexOf(cur));
    if (dx !== 0) col = clamp(col + dx, 0, layout.length - 1);
    if (dy !== 0) row = row + dy;
    row = clamp(row, 0, layout[col]!.length - 1);
    const next = EQUIP_SLOTS.indexOf(layout[col]![row]!);
    if (next === this.cursor) return false;
    this.cursor = next;
    return true;
  }

  /** Cycles the ability in a slot through everything unlocked, plus empty. */
  private cycleSkill(slot: number, dir: number): void {
    const options: (string | null)[] = [null, ...this.state.player.unlockedAbilities.map((a) => a.id)];
    const current = this.state.player.skills[slot] ?? null;
    const i = options.indexOf(current);
    const next = options[(i + dir + options.length) % options.length] ?? null;
    this.state.player.setSkill(slot, next);
    this.state.save();
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
      const owned = this.state.ownedInSlot(row.slot);
      if (owned.length === 0) {
        this.notify(
          `No ${COSMETIC_SLOT_LABELS[row.slot].toLowerCase()} in the wardrobe yet. Open a capsule.`,
          "#9aa4b2",
        );
        return true;
      }
      const options: (string | null)[] = [null, ...owned.map((c) => c.id)];
      const i = options.indexOf(a[row.slot]);
      const next = options[(i + dir + options.length) % options.length] ?? null;
      this.state.wear(row.slot, next);
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
    switch (this.tab) {
      case "Party": {
        this.partyAction(this.partyRows()[this.cursor]);
        break;
      }
      case "Dive": {
        if (!this.requireClass()) break;
        const depth = this.cursor + 1;
        this.state.player.fullHeal();
        this.onDive(delveConfig(depth, this.state.challengerTier));
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
      case "StarMap": {
        if (!this.requireClass()) break;
        if (!planetUnlocked(this.starMapPlanet, this.state.planetProgress)) {
          this.notify("Sealed. Clear the previous sector's first tier to open this one.", "#ef4444");
          break;
        }
        const tier = this.cursor + 1;
        this.onExpedition(this.starMapPlanet, tier);
        this.notify(`Portal opened for ${this.starMapPlanet.name} T${tier} — find it back at the ship.`, "#4ade80");
        break;
      }
      case "Craft": {
        if (this.forgeMode === "reforge") {
          const item = this.reforgeCandidates()[this.cursor];
          if (!item) break;
          const reforged = this.state.reforgeItem(item.id);
          if (reforged) {
            this.notify(`Reforged: ${reforged.name}`, RARITY_COLORS[reforged.rarity]);
          } else {
            this.notify("Not enough coins or materials for that.", "#ef4444");
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
        const slot = EQUIP_SLOTS[this.cursor]!;
        if (this.state.unequipToInventory(slot)) this.notify(`Unequipped ${slot}`);
        break;
      }
      case "Skills": {
        this.cycleSkill(this.cursor, 1);
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
        const tier = CHEST_CATEGORIES[this.chestCategory]!.tiers[this.cursor]!;
        const count = this.bulk ? 10 : 1;
        const cost = CHESTS[tier].price * count;
        if (this.state.buyKey(tier, count)) {
          this.notify(`Bought ${count} ${chestName(tier)} key${count > 1 ? "s" : ""}`, CHESTS[tier].color);
        } else {
          this.notify(`Need ${formatNumber(cost)} coins`, "#ef4444");
        }
        break;
      }
      case "Craft": {
        if (this.forgeMode === "reforge") break;
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
        this.state.player.setSkill(this.cursor, null);
        this.notify("Slot cleared", "#9aa4b2");
        break;
      }
      case "Style": {
        const row = STYLE_ROWS[this.cursor];
        if (!row || row.kind !== "slot") {
          this.notify("That one is always on. Cycle it with A and D.", "#9aa4b2");
          break;
        }
        if (this.state.appearance[row.slot] === null) {
          this.notify("Already wearing nothing there.", "#9aa4b2");
          break;
        }
        this.state.wear(row.slot, null);
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
    if (this.tab === "Craft" && this.forgeMode === "craft") {
      const i = CRAFT_CATEGORIES.indexOf(this.craftCategory);
      this.craftCategory = CRAFT_CATEGORIES[(i + 1) % CRAFT_CATEGORIES.length]!;
      this.cursor = 0;
      this.render();
      return;
    }
    if (this.tab === "Chests") {
      this.bulk = !this.bulk;
      this.notify(`Bulk: ${this.bulk ? "10×" : "1×"}`, "#9aa4b2");
      this.render();
      return;
    }
    if (this.tab !== "Stash") return;
    const equipped = this.state.player.equipment;
    const junk = this.state.inventory.filter((it) => {
      const worn = equipped[it.slot];
      const cls = this.state.heroClass;
      return worn ? itemScore(it, cls) < itemScore(worn, cls) : false;
    });
    if (junk.length === 0) {
      this.notify("No junk to sell — nothing is worse than what you're wearing.", "#9aa4b2");
      return;
    }
    const gained = this.state.sell(junk.map((i) => i.id));
    this.notify(`Sold ${junk.length} junk items for ${formatNumber(gained)}`, "#fbbf24");
    this.cursor = 0;
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
          <div class="brand">DEPTHS OF THE <span>UNSPOKEN</span></div>
          <div class="purse">
            <span class="coin">${formatNumber(s.coins)}</span> coins
            <span class="sep">·</span>
            <span class="gemcount">${formatNumber(s.gems)}</span> gems
            <span class="sep">·</span>
            <span style="color:${s.classChosen ? s.heroClass.color : "#5a6270"}">
              ${s.classChosen ? escapeHtml(s.heroClass.name) : "no class"}</span>
            <span class="sep">·</span> LV ${s.player.level}
            <span class="sep">·</span> deepest ${s.stats.deepestDepth}
          </div>
        </header>
        <nav class="tabs">
          ${(STATION_TABS as readonly Tab[]).includes(this.tab)
            ? `<span class="tab on">${escapeHtml(STATION_LABELS[this.tab as StationTab])}</span>
               <span class="tabhint">a station, not a tab — [${k(this.state.settings, "pause")}] back to the ship</span>`
            : `${CYCLE_TABS.map((t) =>
                `<span class="tab ${t === this.tab ? "on" : ""}" data-tab="${t}">${t}</span>`).join("")}
               <span class="tabhint">[${k(this.state.settings, "tabPrev")}] / [${k(this.state.settings, "tabNext")}] switch, or click a tab</span>`}
        </nav>
        <section class="body">${this.renderTab()}</section>
        <footer class="town-foot">
          <span class="help">${tabHelp(this.tab, this.state.settings, this.forgeMode)}</span>
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
      case "Party": return this.renderParty();
      case "Rifts": return this.renderRifts();
      case "StarMap": return this.renderStarMap();
      case "Vigil": return this.renderVigil();
      case "Craft": return this.renderCraft();
      case "Chests": return this.renderChests();
      case "Stash": return this.renderStash();
      case "Hero": return this.renderHero();
      case "Skills": return this.renderSkills();
      case "Tree": return this.renderTree();
      case "Universal": return this.renderUniversal();
      case "Path": return this.renderPath();
      case "Style": return this.renderStyle();
      case "Capsules": return this.renderCapsules();
      case "Codex": return this.renderCodex();
      case "Records": return this.renderRecords();
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
            ? "Back out to the ship, walk into any portal and confirm it — that picks the party's run."
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
                  ? "walk into the Delve, a rift or the Reliquary Portal and confirm it"
                  : "the host picks by walking into a portal"}</div>
              </div>`);
            break;
          }
          const config = { ...plan.config, players: p.size };
          const profile = profileFor(config.depth, config);
          const title = config.planet
            ? `${config.planet.spec.name} T${config.planet.tier}`
            : config.mode.isRift ? `${config.mode.name} tier ${config.tier}` : `Delve depth ${config.depth}`;
          rows.push(`
            <div class="row ${on}" data-index="${i}">
              <div class="row-main">
                <span class="name">${escapeHtml(title)}</span>
                <span class="muted">${escapeHtml(profile.name)}</span>
                ${profile.isBoss ? '<span class="badge boss">BOSS</span>' : ""}
              </div>
              <div class="row-side">req. lv ${profile.recommendedLevel} · everyone stands in that portal</div>
            </div>`);
          break;
        }
        case "member": {
          const member = roster[row.index];
          const remote = p.members.find((m) => m.id === member?.id);
          const ready = member?.id === p.net.id ? false : remote?.ready ?? false;
          const you = member?.id === p.net.id;
          rows.push(`
            <div class="row ${on}" data-index="${i}">
              <div class="row-main">
                <span class="name">${escapeHtml(member?.name ?? "…")}</span>
                ${you ? '<span class="badge">YOU</span>' : ""}
              </div>
              <div class="row-side ${you || !ready ? "warn" : ""}">
                ${you
                  ? "at the relay — you only count as ready while you're standing in the portal"
                  : ready ? "in the portal" : "on the ship"}
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
        Standing at this terminal doesn't count; back out to the ship first.</p>
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

  private renderDive(): string {
    const challenger = this.state.challengerTier;
    const rows: string[] = [];
    for (let depth = 1; depth <= this.state.maxUnlockedDepth; depth++) {
      const p = profileFor(depth, delveConfig(depth, challenger));
      const under = this.state.player.level < p.recommendedLevel;
      rows.push(`
        <div class="row ${depth - 1 === this.cursor ? "on" : ""}" data-index="${depth - 1}">
          <div class="row-main">
            <span class="depth">${String(depth).padStart(2, "0")}</span>
            <span class="name">${p.name}</span>
            ${p.isBoss ? '<span class="badge boss">BOSS</span>' : ""}
          </div>
          <div class="row-side ${under ? "warn" : ""}">
            req. lv ${p.recommendedLevel} · ${p.waves} waves · ×${p.coinMultiplier.toFixed(1)} loot
          </div>
        </div>`);
    }
    const depth = Math.min(this.cursor + 1, this.state.maxUnlockedDepth);
    const biome = biomeFor(depth);
    const hazards = trapsFor(depth, biome.traps).map((t) => t.label);
    return `<div class="list">${rows.join("")}</div>
      <aside class="side">
        <h3>The dive</h3>
        <p>Clear every wave, then step into the portal. <b>Descend</b> to push deeper for
        richer loot, or <b>extract</b> to bank what you're carrying. Every fifth floor is
        a raid boss, and it will take a while.</p>
        <p class="danger">Die and you lose every coin, key and item you picked up on the
        way down. XP is always kept.</p>
        <h3>${escapeHtml(biome.name)}</h3>
        <p class="muted">No two floors are laid out the same. Watch the ground.</p>
        <p>Hazards: ${hazards.length ? escapeHtml(hazards.join(", ")) : "none yet. Enjoy it."}</p>
        <p>Local element: <b style="color:${ELEMENT_COLORS[biome.element]}">${ELEMENT_LABELS[biome.element]}</b>
        <span class="muted">· the deeper you go, the more of the wildlife is made of it</span></p>
        <h3>Belt</h3>
        <p><b>${this.state.potions}</b> / ${POTION_CAP} potions
        <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · buy for ${POTION_PRICE}c</span></p>
        ${this.challengerNote()}
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
            req. lv ${p.recommendedLevel} · depth ${config.depth} · danger ×${config.danger.toFixed(2)}
          </div>
        </div>`);
    }

    const sel = riftConfig(this.riftMode, Math.min(this.cursor + 1, maxTier), mode.floors, challenger);
    const other = RIFT_MODES.map((m) =>
      `<span style="color:${m === this.riftMode ? MODES[m].color : "#5a6270"}">${MODES[m].short}</span>`,
    ).join(" / ");

    return `<div class="list">${rows.join("")}</div>
      <aside class="side">
        <h3 style="color:${mode.color}">${escapeHtml(mode.name)}</h3>
        <p class="muted">${other}
          <span class="chip" data-action="left">◀ ${k(this.state.settings, "left")}</span>
          <span class="chip" data-action="right">${k(this.state.settings, "right")} ▶</span></p>
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
        <p class="muted">Clearing the boss opens the next tier. Extracting early keeps
        what you're carrying and opens nothing.</p>
        <p>Rifts closed: <b>${this.state.stats.riftsCleared[this.riftMode] ?? 0}</b></p>
        ${this.challengerNote()}
      </aside>`;
  }

  /**
   * The Ashen Reliquary: pick a sector and a tier, same shape as the rift screen — A/D
   * switches sector instead of rift flavor, and confirming doesn't dive, it opens a
   * portal by the Reliquary Gate for you to walk into.
   */
  private renderStarMap(): string {
    const planet = this.starMapPlanet;
    const unlocked = planetUnlocked(planet, this.state.planetProgress);
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
            req. lv ${p.recommendedLevel} · ${planet.floors} floors · danger ×${config.danger.toFixed(2)}
          </div>
        </div>`);
    }

    const sel = planetConfig(planet, Math.min(this.cursor + 1, maxTier), planet.floors, challenger);
    const other = PLANETS.map((p) =>
      `<span style="color:${p === planet ? ELEMENT_COLORS[p.element] : "#5a6270"}">${escapeHtml(p.name)}</span>`,
    ).join(" / ");

    return `<div class="list">${rows.join("")}</div>
      <aside class="side">
        <h3 style="color:${ELEMENT_COLORS[planet.element]}">${escapeHtml(planet.name)}
          <span class="muted">· T${planet.order}</span></h3>
        <p class="muted">${other}
          <span class="chip" data-action="left">◀ ${k(this.state.settings, "left")}</span>
          <span class="chip" data-action="right">${k(this.state.settings, "right")} ▶</span></p>
        <p>${escapeHtml(planet.blurb)}</p>
        ${unlocked ? "" : "<p class=\"danger\">Sealed. Clear the previous sector's first tier.</p>"}
        <table class="cmp">
          <tr><td>Floors</td><td>${planet.floors}, boss last</td></tr>
          <tr><td>Boss floor depth</td><td>${sel.depth}</td></tr>
          <tr><td>Danger</td><td>×${sel.danger.toFixed(2)}</td></tr>
          <tr><td>Local element</td><td style="color:${ELEMENT_COLORS[planet.element]}">${ELEMENT_LABELS[planet.element]}</td></tr>
          <tr><td>Material</td><td style="color:${MATERIALS[planet.element].color}">${escapeHtml(MATERIALS[planet.element].name)}</td></tr>
        </table>
        <p class="muted">Fight and harvest your way to the boss. Beating it opens
        extraction and the next tier — the deeper the sector, the better it pays.</p>
        <p>Opening a portal doesn't dive — it spawns one by the Reliquary Gate. Walk into
        it when you're ready.</p>
        ${this.challengerNote()}
      </aside>`;
  }

  /** The switcher pill pair shared by both Forge screens — Craft and Reforge. */
  private renderForgeSwitcher(): string {
    return `<div class="chest-cats">
        <div class="chest-cat ${this.forgeMode === "craft" ? "on" : ""}" data-forge-mode="craft">Craft</div>
        <div class="chest-cat ${this.forgeMode === "reforge" ? "on" : ""}" data-forge-mode="reforge">Reforge</div>
      </div>`;
  }

  /**
   * The forge: pick a rarity, a category and (optionally) an essence, and see the cost
   * before spending anything — a chest never shows you that in advance, which is the
   * whole difference between gambling and crafting. tabPrev/tabNext flip to Reforge,
   * the other half of this station.
   */
  private renderCraft(): string {
    if (this.forgeMode === "reforge") return this.renderReforge();

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

    return `<div class="forge-pane">${this.renderForgeSwitcher()}<div class="list">${rows}</div></div>
      <aside class="side">
        <h3>Craft: <b>${CRAFT_CATEGORY_LABELS[category]}</b>
          <span class="chip" data-action="tertiary">${k(this.state.settings, "special")} cycle</span></h3>
        <p class="muted">Divine and unspoken stay chest-only — everything from common to
        mythic is fair game here, at a price that climbs steeply with the rarity.</p>
        <h3>Essence: <b style="color:${essence ? ELEMENT_COLORS[essence] : "#9aa4b2"}">
          ${essence ? ELEMENT_LABELS[essence] : "None"}</b>
          <span class="chip" data-action="left">◀</span>
          <span class="chip" data-action="right">▶</span>
          <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} clear</span></h3>
        <p class="muted">Biases the roll toward that element's damage or resist affix,
        instead of only ever hoping for it.</p>
        <h3>Materials</h3>
        <table class="cmp">${bag}</table>
        <p class="muted">Dropped by monsters and mined from resource nodes — planets
        only. The dive and the rifts never pay in these.</p>
      </aside>`;
  }

  /** Every item the active character could reforge: worn first, then the stash. */
  private reforgeCandidates(): Item[] {
    const equipment = this.state.player.equipment;
    const worn = EQUIP_SLOTS.map((slot) => equipment[slot]).filter((it): it is Item => it !== null);
    return [...worn, ...this.state.inventory];
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

    const wornIds = new Set(
      EQUIP_SLOTS.map((slot) => this.state.player.equipment[slot]?.id).filter((id): id is string => !!id),
    );
    const cards = items.map((it, i) => {
      const coinCost = reforgeCoinCost(it.rarity);
      const matCost = craftBulkCost(it.rarity);
      const afford = this.state.coins >= coinCost && this.state.materials.physical >= matCost;
      const icon = pixelImageFit(itemIcon(it.type, it.rarity), 64, `item:${it.type}:${it.rarity}`);
      return `
        <div class="item-card ${i === this.cursor ? "on" : ""}" data-index="${i}"
             style="--r:${RARITY_COLORS[it.rarity]}">
          ${wornIds.has(it.id) ? `<span class="ic-mark" title="equipped">E</span>` : ""}
          ${afford ? "" : `<span class="ic-lock">${formatNumber(coinCost)}c</span>`}
          <div class="ic-art"><img src="${icon}" alt=""></div>
          <span class="ic-name" style="color:${RARITY_COLORS[it.rarity]}">${escapeHtml(it.name)}</span>
          <span class="ic-slot">${it.slot}</span>
        </div>`;
    }).join("");

    const sel = items[this.cursor];
    const coinCost = sel ? reforgeCoinCost(sel.rarity) : 0;
    const matCost = sel ? craftBulkCost(sel.rarity) : 0;
    const afford = sel ? this.state.coins >= coinCost && this.state.materials.physical >= matCost : false;

    return `<div class="forge-pane">${this.renderForgeSwitcher()}<div class="stash-grid">${cards}</div></div>
      <aside class="side">
        ${sel ? this.renderCompare(sel) : `<p class="muted">Pick something to reforge.</p>`}
        ${sel ? `
          <h3>Cost</h3>
          <table class="cmp">
            <tr><td>Coins</td><td class="${this.state.coins >= coinCost ? "" : "warn"}">${formatNumber(coinCost)}</td></tr>
            <tr><td>${escapeHtml(MATERIALS.physical.name)}</td>
              <td class="${this.state.materials.physical >= matCost ? "" : "warn"}">${formatNumber(matCost)}</td></tr>
          </table>
          <p class="muted">${k(this.state.settings, "confirm")}, or click the card, to reforge —
          rerolls every affix, keeps the base stats, the grant and the trigger.</p>
          ${afford ? "" : `<p class="danger">Not enough coins or ${escapeHtml(MATERIALS.physical.name)}.</p>`}
        ` : ""}
      </aside>`;
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
              ? `req. lv ${profile.recommendedLevel} · ${escapeHtml(profile.name)} · danger ×${config.danger.toFixed(2)}`
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
        <p>Vigils kept: <b>${this.state.stats.vigilsCleared}</b></p>
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
   * The chest shop: one category at a time, each browsed as a big horizontal carousel of
   * chest cards rather than a single 28-row list — up/down flip the category pill, left/
   * right (or the arrow chips, or clicking a card) walk the carousel. Every card carries
   * its own little sprite (`chestIcon`): the real weapon for a single-family cache, a
   * slot icon for the three category caches, and a tinted chest prop otherwise. The full
   * blurb for whichever chest is selected lives in the aside, in real reading size,
   * rather than squeezed into the card itself.
   */
  private renderChests(): string {
    const n = this.bulk ? 10 : 1;
    const cat = CHEST_CATEGORIES[this.chestCategory]!;

    const cats = CHEST_CATEGORIES.map((c, i) => `
      <div class="chest-cat ${i === this.chestCategory ? "on" : ""}" data-category="${i}">${escapeHtml(c.label)}</div>
    `).join("");

    const cards = cat.tiers.map((tier, i) => {
      const info = CHESTS[tier];
      const icon = pixelImageFit(chestIcon(tier), 72, tier);
      return `
        <div class="chest-card row ${i === this.cursor ? "on" : ""}" data-index="${i}" style="--chest-color:${info.color}">
          <div class="chest-card-art"><img src="${icon}" alt=""></div>
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

    const cls = this.state.heroClass;
    const cards = items.slice(0, 300).map((it, i) => {
      const worn = this.state.player.equipment[it.slot];
      const delta = worn ? itemScore(it, cls) - itemScore(worn, cls) : itemScore(it, cls);
      const mark = worn && delta > 0
        ? '<span class="ic-mark up">▲</span>'
        : worn && delta < 0 ? '<span class="ic-mark down">▼</span>' : "";
      const dots = [
        it.grant ? '<span class="dot" style="background:#7dd3fc" title="grants a skill"></span>' : "",
        it.trigger ? '<span class="dot" style="background:#ff1493" title="triggered effect"></span>' : "",
      ].join("");
      const locked = !this.state.player.canEquip(it);
      const icon = pixelImageFit(itemIcon(it.type, it.rarity), 64, `item:${it.type}:${it.rarity}`);
      const tip = `${it.name} — ${rarityLabel(it.rarity)} ${it.type} · ilvl ${it.ilvl}\n`
        + `${statLine(it)}\nsells for ${formatNumber(sellPrice(it))}c`;
      return `
        <div class="item-card ${i === this.cursor ? "on" : ""}" data-index="${i}"
             style="--r:${RARITY_COLORS[it.rarity]}" title="${escapeHtml(tip)}">
          ${mark}
          ${locked ? `<span class="ic-lock">lv ${requiredLevel(it)}</span>` : ""}
          <div class="ic-art"><img src="${icon}" alt=""></div>
          <span class="ic-name" style="color:${RARITY_COLORS[it.rarity]}">${escapeHtml(it.name)}</span>
          <span class="ic-slot">${it.slot}</span>
          ${dots ? `<div class="ic-dots">${dots}</div>` : ""}
        </div>`;
    }).join("");

    const sel = onBar ? undefined : items[this.cursor];
    return `<div class="stash-grid">${filterBar}${cards}</div>
      <aside class="side">
        ${sel
          ? this.renderCompare(sel)
          : `<p class="muted">${onBar
              ? "Filtering by rarity. Press down to step back into the cards."
              : "Pick a piece to compare it against what you're wearing."}</p>`}
        <p>
          <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · sell selected</span>
          <span class="chip" data-action="tertiary">${k(this.state.settings, "special")} · sell all junk</span>
        </p>
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

    const icon = pixelImageFit(itemIcon(item.type, item.rarity), 96, `item:${item.type}:${item.rarity}`);
    const cmpHead = worn
      ? `<tr class="cmp-head"><td></td><td>this</td><td>vs equipped</td></tr>`
      : `<tr class="cmp-head"><td></td><td>this</td><td>gain</td></tr>`;
    return `
      <div class="cmp-hero" style="--r:${RARITY_COLORS[item.rarity]}">
        <div class="cmp-art"><img src="${icon}" alt=""></div>
        <div>
          <h3 style="color:${RARITY_COLORS[item.rarity]};margin:0">${escapeHtml(item.name)}</h3>
          <p class="muted" style="margin:2px 0 0">${rarityLabel(item.rarity)} ${item.type} · ilvl ${item.ilvl}
            · vs ${worn ? escapeHtml(worn.name) : "nothing equipped"}</p>
        </div>
      </div>
      ${reqLine}
      ${weaponLine}
      <table class="cmp wide">${cmpHead}${rows}</table>
      ${grant}${trigger}`;
  }

  /** The piece in a Hero slot, shown flat — no comparison, since it's what you're wearing. */
  private renderEquipped(item: Item): string {
    const mods = itemMods(item);
    const rows = MOD_KEYS.filter((key) => (mods[key] ?? 0) !== 0)
      .map((key) => `<tr><td>${escapeHtml(shortLabel(key))}</td><td>${fmtMod(key, mods[key] ?? 0)}</td></tr>`)
      .join("");
    const icon = pixelImageFit(itemIcon(item.type, item.rarity), 96, `item:${item.type}:${item.rarity}`);
    const weapon = item.family ? WEAPONS[item.family] : null;
    const affine = item.family ? this.state.heroClass.affinity.includes(item.family) : false;
    const weaponLine = weapon
      ? `<p style="color:${affine ? this.state.heroClass.color : "#9aa4b2"}">
          <b>${escapeHtml(weapon.name)}</b> — ${escapeHtml(weapon.blurb)}
          ${affine ? "<br><em>Your class was built for this.</em>" : ""}</p>`
      : "";
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
        <div class="cmp-art"><img src="${icon}" alt=""></div>
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
      ? `<img src="${pixelImageFit(itemIcon(it.type, it.rarity), 72, `item:${it.type}:${it.rarity}`)}" alt="">`
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
  private lockedSlot(label: string): string {
    return `
      <div class="doll-slot locked" title="${label} — a future update">
        <span class="ds-label">${label}</span>
        <div class="ds-art"><span class="ds-empty">+</span></div>
        <span class="ds-name muted">soon</span>
      </div>`;
  }

  private renderHero(): string {
    const p = this.state.player;
    const cls = p.heroClass;
    const a = this.state.appearance;
    const portrait = pixelImage(heroComposite(a), 8);
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
          ${this.lockedSlot("helmet")}
          ${this.lockedSlot("boots")}
          ${this.lockedSlot("off-hand")}
          ${this.lockedSlot("relic")}
          ${this.lockedSlot("relic")}
          ${this.lockedSlot("relic")}
        </div>
      </div>`;

    const selSlot = EQUIP_SLOTS[this.cursor];
    const selItem = selSlot ? p.equipment[selSlot] : undefined;
    const selPanel = selItem
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
  private renderSkills(): string {
    const p = this.state.player;
    const cls = p.heroClass;
    const byId = (id: string | null): Ability | undefined => (id ? p.abilityById(id) : undefined);
    const rows = Array.from({ length: SKILL_SLOTS }, (_, i) => {
      const ab = byId(p.skills[i] ?? null);
      return `
        <div class="row ${i === this.cursor ? "on" : ""}" data-index="${i}">
          <div class="row-main">
            <span class="slot">[${this.skillKeyLabels[i] ?? i + 1}]</span>
            <span class="name" style="color:${ab ? cls.color : "#5a6270"}">
              ${ab ? escapeHtml(ab.name) : "— empty —"}</span>
          </div>
          <div class="row-side">${ab ? abilityCostLine(ab, p) : "A / D to pick one"}</div>
        </div>`;
    }).join("");

    // The fourth slot isn't yours to choose — it's whatever your gear is handing you.
    const granted = byId(p.grantedAbilityId);
    const grantedRow = granted
      ? `<div class="row">
          <div class="row-main">
            <span class="slot">[${this.skillKeyLabels[SKILL_SLOTS] ?? "M"}]</span>
            <span class="name" style="color:${cls.color}">${escapeHtml(granted.name)}</span>
            <span class="badge">from your gear</span>
          </div>
          <div class="row-side">${abilityCostLine(granted, p)} · granted, not chosen</div>
        </div>`
      : "";

    const sel = byId(p.skills[this.cursor] ?? null);
    const known = p.abilityPool.map((a) => {
      const lv = p.abilityUnlockLevel(a);
      const have = lv <= p.level;
      const equipped = p.skills.includes(a.id);
      return `<li style="color:${have ? cls.color : "#4a515e"}">
        ${escapeHtml(a.name)} ${equipped ? "<em>equipped</em>" : have ? "" : `<em>lv ${lv}</em>`}</li>`;
    }).join("");

    return `<div class="list">${rows}${grantedRow}</div>
      <aside class="side">
        ${sel ? `
          <h3 style="color:${cls.color}">${escapeHtml(sel.name)}</h3>
          <p>${escapeHtml(sel.description)}</p>
          <table class="cmp">
            <tr><td>Type</td><td>${escapeHtml(sel.category)}</td></tr>
            <tr><td>Cost</td><td>${abilityCostLine(sel, p)}</td></tr>
            <tr><td>Cooldown</td><td>${(sel.cooldown * p.cooldownMult).toFixed(1)}s</td></tr>
          </table>`
        : `<h3>Empty slot</h3><p class="muted">Press ${k(this.state.settings, "left")} or
          ${k(this.state.settings, "right")} to put something in it.</p>`}
        <p>
          <span class="chip" data-action="left">◀ ${k(this.state.settings, "left")}</span>
          <span class="chip" data-action="right">${k(this.state.settings, "right")} ▶</span>
          <span class="chip" data-action="secondary">${k(this.state.settings, "cancel")} · clear slot</span>
        </p>
        <h3>${escapeHtml(cls.name)} abilities</h3>
        <ul class="pulls">${known}</ul>
        <p class="muted">Nine abilities, unlocked by levelling. Pick three; the fourth is
        whatever your gear grants.</p>
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
      const icon = pixelImageFit(weaponSprite(cls.affinity[0]!, null, null), 64, `path-${id}`);
      return `
        <div class="class-card row ${i === this.cursor ? "on" : ""}" data-index="${i}"
          style="--class-color:${cls.color}">
          <div class="class-card-art"><img src="${icon}" alt=""></div>
          <span class="class-card-name" style="color:${cls.color}">${escapeHtml(cls.name)}</span>
          <span class="badge">${untouched ? "new" : `lv ${pc.level}`}</span>
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

    return `<div class="carousel">
        <span class="chip carousel-arrow" data-action="left">◀</span>
        <div class="carousel-track">${cards}</div>
        <span class="chip carousel-arrow" data-action="right">▶</span>
      </div>
      <aside class="side">
        <h3 style="color:${sel.color}">${escapeHtml(sel.name)}</h3>
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
        <h3>Built for</h3>
        <p>${escapeHtml(weapons)} <span class="muted">· +${Math.round(sel.affinityBonus * 100)}% damage,
        and anything else hits a little softer</span></p>
        <h3>Skills</h3>
        <ul class="pulls">${skills}</ul>
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
        const id = a[row.slot];
        const c = id ? COSMETICS_BY_ID[id] : null;
        const owned = this.state.ownedInSlot(row.slot).length;
        return {
          label: COSMETIC_SLOT_LABELS[row.slot],
          value: c ? c.name : owned > 0 ? "— nothing —" : "— none owned —",
          color: c ? RARITY_COLORS[c.rarity] : "#5a6270",
          id,
          blurb: c ? c.blurb : `${owned} owned for this slot.`,
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
    const portrait = pixelImage(heroComposite(a), 7);
    const weapon = pixelImageFit(
      weaponSprite(this.state.player.weapon.id, a.weapon, held?.rarity ?? null), 72);
    const selected = STYLE_ROWS[this.cursor];
    const info = selected ? this.styleRowInfo(selected) : null;
    const owned = this.state.cosmetics.length;

    return `<div class="list">${rows}</div>
      <aside class="side">
        <h3>You</h3>
        <div class="portrait"><img src="${portrait}" alt="your character"></div>
        <div class="portrait weapon"><img src="${weapon}" alt="your weapon"></div>
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
          <tr><td>Gems earned</td><td>${formatNumber(st.gemsEarned)}</td></tr>
          <tr><td>Capsules opened</td><td>${formatNumber(st.capsulesOpened)}</td></tr>
          <tr><td>Wardrobe</td><td>${this.state.cosmetics.length} / ${COSMETICS.length}</td></tr>
        </table>
      </div>
      <aside class="side">
        <h3>Rifts</h3>
        <table class="cmp">${rifts}</table>
        <h3>Rarities found</h3>
        <table class="cmp">${rarities}</table>
        <h3>Chests opened</h3>
        <table class="cmp">${chests}</table>
      </aside>`;
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
