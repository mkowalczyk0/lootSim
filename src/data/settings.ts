/**
 * Player options. Cosmetic and control settings only: nothing here changes the
 * simulation, so a setting can never be the reason a run went well or badly. Anything
 * that changes the simulation belongs in a run mode, not in a menu.
 */

/** "keyboard" plays the whole game — combat included — with no mouse at all, exactly
 *  like the game's original design. "mouse" aims and attacks with the mouse while WASD
 *  still moves; menus can be clicked in either scheme. */
export type ControlScheme = "keyboard" | "mouse";

/** Everything the right mouse button can be bound to in "mouse" scheme. */
export type MouseSecondaryAction = "skill1" | "skill2" | "skill3" | "dash" | "special";

export const MOUSE_SECONDARY_OPTIONS: readonly MouseSecondaryAction[] = [
  "skill1", "skill2", "skill3", "dash", "special",
];

export const MOUSE_SECONDARY_LABELS: Record<MouseSecondaryAction, string> = {
  skill1: "Skill 1", skill2: "Skill 2", skill3: "Skill 3", dash: "Dash", special: "Ultimate",
};

/** Every button in the game is rebindable — movement and menu navigation included.
 *  Nothing is reserved: menus are always mouse-clickable too (rows, tabs and the small
 *  action chips), so there's no way to rebind your way into a screen you can't get back
 *  out of, even if you clear every keyboard binding at once. */
export type RebindableAction =
  | "up" | "down" | "left" | "right"
  | "attack" | "dash" | "potion" | "special" | "skill1" | "skill2" | "skill3" | "skill4"
  | "confirm" | "cancel" | "tabPrev" | "tabNext" | "pause" | "mark";

export const REBINDABLE_ACTIONS: readonly RebindableAction[] = [
  "up", "down", "left", "right",
  "attack", "dash", "potion", "skill1", "skill2", "skill3", "skill4", "special",
  "confirm", "cancel", "tabPrev", "tabNext", "pause", "mark",
];

export const ACTION_LABELS: Record<RebindableAction, string> = {
  up: "Move up", down: "Move down", left: "Move left", right: "Move right",
  attack: "Attack", dash: "Dash", potion: "Potion", special: "Ultimate",
  skill1: "Skill 1", skill2: "Skill 2", skill3: "Skill 3", skill4: "Granted skill",
  confirm: "Confirm / interact", cancel: "Back / cancel",
  tabPrev: "Previous tab", tabNext: "Next tab", pause: "Pause / back to ship",
  mark: "Mark for a batch (Stash)",
};

export const DEFAULT_KEYBINDS: Record<RebindableAction, string> = {
  up: "KeyW",
  down: "KeyS",
  left: "KeyA",
  right: "KeyD",
  attack: "KeyJ",
  dash: "KeyK",
  potion: "KeyL",
  special: "Semicolon",
  skill1: "KeyU",
  skill2: "KeyH",
  skill3: "KeyN",
  skill4: "KeyM",
  confirm: "KeyE",
  cancel: "KeyQ",
  tabPrev: "KeyI",
  tabNext: "KeyO",
  pause: "Escape",
  mark: "KeyF",
};

export interface Settings {
  /** Camera kick on hits, deaths and boss slams. */
  screenShake: boolean;
  /** Floating damage numbers and pickup labels. */
  damageNumbers: boolean;
  /** "keyboard" for the original no-mouse game; "mouse" to aim and attack with it. */
  controlScheme: ControlScheme;
  /** What the right mouse button casts, in "mouse" scheme. */
  mouseSecondary: MouseSecondaryAction;
  /** Physical-key overrides for the rebindable actions, keyed by `KeyboardEvent.code`. */
  keybinds: Record<RebindableAction, string>;
  /** What the rest of the party sees over your head. Purely a label — a character is
   *  still whatever class and gear you're carrying. */
  playerName: string;
}

export const DEFAULT_SETTINGS: Settings = {
  screenShake: true,
  damageNumbers: true,
  controlScheme: "mouse",
  mouseSecondary: "skill1",
  keybinds: { ...DEFAULT_KEYBINDS },
  playerName: "",
};

/** Trims a typed-in name to something that fits over a sprite. Empty means "unnamed". */
export function cleanPlayerName(raw: string): string {
  return raw.replace(/[^\w \-']/g, "").trim().slice(0, 12);
}

export type SettingKey = "screenShake" | "damageNumbers";

export interface SettingSpec {
  readonly key: SettingKey;
  readonly label: string;
  readonly blurb: string;
}

/** Rendered in order as the top of the Settings tab. */
export const SETTING_SPECS: readonly SettingSpec[] = [
  {
    key: "screenShake",
    label: "Screen shake",
    blurb: "The camera kicks when something big lands. Turn it off if it makes you queasy.",
  },
  {
    key: "damageNumbers",
    label: "Damage numbers",
    blurb: "Numbers float off everything you hit. Off is quieter and tells you less.",
  },
];

/** A human name for a `KeyboardEvent.code`, for anywhere a bound key is shown. */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const NAMES: Record<string, string> = {
    Space: "Space", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
    BracketLeft: "[", BracketRight: "]", Backslash: "\\", Minus: "-", Equal: "=",
    Backquote: "`", Enter: "Enter", Backspace: "Backspace", Tab: "Tab",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    ShiftLeft: "Shift", ShiftRight: "Shift", ControlLeft: "Ctrl", ControlRight: "Ctrl",
    AltLeft: "Alt", AltRight: "Alt",
  };
  return NAMES[code] ?? code;
}

/** Reads a saved blob back, keeping the defaults for anything it doesn't mention. */
export function normalizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, keybinds: { ...DEFAULT_KEYBINDS } };
  if (!raw || typeof raw !== "object") return out;
  const rec = raw as Record<string, unknown>;
  for (const spec of SETTING_SPECS) {
    if (typeof rec[spec.key] === "boolean") out[spec.key] = rec[spec.key] as boolean;
  }
  if (rec.controlScheme === "keyboard" || rec.controlScheme === "mouse") {
    out.controlScheme = rec.controlScheme;
  }
  if (typeof rec.mouseSecondary === "string"
    && (MOUSE_SECONDARY_OPTIONS as readonly string[]).includes(rec.mouseSecondary)) {
    out.mouseSecondary = rec.mouseSecondary as MouseSecondaryAction;
  }
  if (typeof rec.playerName === "string") out.playerName = cleanPlayerName(rec.playerName);
  const binds = rec.keybinds;
  if (binds && typeof binds === "object") {
    const b = binds as Record<string, unknown>;
    for (const action of REBINDABLE_ACTIONS) {
      if (typeof b[action] === "string") out.keybinds[action] = b[action] as string;
    }
  }
  return out;
}
