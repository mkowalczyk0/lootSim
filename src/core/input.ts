import {
  DEFAULT_KEYBINDS, keyLabel, MOUSE_SECONDARY_LABELS, REBINDABLE_ACTIONS,
  type RebindableAction, type Settings,
} from "../data/settings";

export type Action =
  | "up" | "down" | "left" | "right"
  | "attack" | "dash" | "potion" | "special"
  | "skill1" | "skill2" | "skill3" | "skill4"
  | "confirm" | "cancel" | "tabPrev" | "tabNext" | "pause";

/**
 * Every action — movement and menu navigation included — comes from exactly one
 * physical key, whatever `settings.keybinds` says it is. Nothing is hardcoded or
 * permanently reserved: rebinding is safe even for WASD or the menu keys because every
 * menu is always mouse-clickable too (rows, tabs, the small action chips), so there's no
 * key combination that can lock a player out of their own settings screen.
 */
function buildBindings(keybinds: Record<RebindableAction, string>): Record<string, Action> {
  const map: Record<string, Action> = {};
  for (const action of REBINDABLE_ACTIONS) {
    const code = keybinds[action] ?? DEFAULT_KEYBINDS[action];
    map[code] = action;
  }
  return map;
}

/**
 * Everything the simulation needs from whoever is driving a character.
 *
 * `Input` below is the local implementation, reading a real keyboard and mouse. A
 * remote player in a co-op run arrives as a different implementation of exactly this
 * interface, filled in from the network — which is why `dungeon.ts` has one code path
 * for moving a character and not two.
 */
export interface AvatarInput {
  moveVector(): { x: number; y: number };
  wasPressed(action: Action): boolean;
  /**
   * Where this character is aiming, given where it is standing — or null to fall back
   * to facing whichever way it's walking, which is the exclusive-keyboard scheme.
   */
  aimAngle(x: number, y: number): number | null;
  /**
   * The exact world point this character is aiming at — the cursor position in mouse-aim
   * mode — or null when only a direction is known (keyboard scheme, a remote player).
   * A ground-placed AoE lands here rather than at a fixed distance along the facing.
   */
  aimPoint?(x: number, y: number): { x: number; y: number } | null;
}

/**
 * Edge-triggered input state, keyboard and mouse both. `isDown` is the live state;
 * `wasPressed` is latched per simulation tick so a tap between frames can never be
 * dropped or read twice. Mouse buttons feed the exact same action sets a key does, so
 * everything downstream of here — the dungeon, the boss brain — never has to know or
 * care which device pressed "attack".
 */
export class Input {
  private held = new Set<Action>();
  private buffered = new Set<Action>();
  private pressedThisTick = new Set<Action>();
  /** How many real key/button edges landed this tick — see `anyPressed`. */
  private edges = 0;
  private repeatable = new Set<Action>();
  private enabled = true;
  private bindings: Record<string, Action>;
  private captureCb: ((code: string) => void) | null = null;

  private mouseHeld = { left: false, right: false };
  private mouseWorld: { x: number; y: number } | null = null;

  constructor(private readonly settings: Settings, target: EventTarget = window) {
    this.bindings = buildBindings(settings.keybinds);
    target.addEventListener("keydown", (e) => this.onKey(e as KeyboardEvent, true));
    target.addEventListener("keyup", (e) => this.onKey(e as KeyboardEvent, false));
    // Alt-tabbing away must not leave a movement key — or a mouse button — stuck down.
    window.addEventListener("blur", () => {
      this.held.clear();
      this.mouseHeld.left = false;
      this.mouseHeld.right = false;
    });
  }

  /** Call after `settings.keybinds` changes so the live key→action map picks it up. */
  refreshBindings(): void {
    this.bindings = buildBindings(this.settings.keybinds);
  }

  /** Whether the mouse currently aims and fires. False is the original, exclusive-keyboard game. */
  get usesMouseAim(): boolean {
    return this.settings.controlScheme === "mouse";
  }

  /** Turned off while a text field has focus, so typing can't drive the character. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.held.clear();
      this.mouseHeld.left = false;
      this.mouseHeld.right = false;
    }
  }

  // --- mouse ---------------------------------------------------------------

  /** World-space point the mouse is over, updated once a frame by the renderer's camera. */
  setMouseWorld(x: number, y: number): void {
    this.mouseWorld = { x, y };
  }

  get mouseWorldPosition(): { x: number; y: number } | null {
    return this.mouseWorld;
  }

  /** `AvatarInput`: the angle from a body to the cursor, or null in keyboard-only mode. */
  aimAngle(x: number, y: number): number | null {
    if (!this.usesMouseAim || !this.mouseWorld) return null;
    return Math.atan2(this.mouseWorld.y - y, this.mouseWorld.x - x);
  }

  /** `AvatarInput`: the cursor's world point, or null in keyboard-only mode. */
  aimPoint(_x: number, _y: number): { x: number; y: number } | null {
    if (!this.usesMouseAim || !this.mouseWorld) return null;
    return { x: this.mouseWorld.x, y: this.mouseWorld.y };
  }

  /** Left button always attacks; right fires whatever `settings.mouseSecondary` names. */
  handleMouseButton(button: "left" | "right", down: boolean): void {
    if (!this.enabled || this.captureCb) return;
    if (!this.usesMouseAim) return; // exclusive keyboard: the mouse does nothing at all
    const action: Action = button === "left" ? "attack" : this.settings.mouseSecondary;
    if (down) {
      if (!this.mouseHeld[button]) this.buffered.add(action);
      this.mouseHeld[button] = true;
    } else {
      this.mouseHeld[button] = false;
    }
  }

  // --- rebinding -------------------------------------------------------------

  /** The next physical keydown is handed to `cb` instead of being treated as an action. */
  captureNextKey(cb: (code: string) => void): void {
    this.captureCb = cb;
  }

  cancelCapture(): void {
    this.captureCb = null;
  }

  get capturing(): boolean {
    return this.captureCb !== null;
  }

  // --- keyboard --------------------------------------------------------------

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (down && this.captureCb) {
      e.preventDefault();
      const cb = this.captureCb;
      this.captureCb = null;
      cb(e.code);
      return;
    }
    const action = this.bindings[e.code];
    if (!action) return;
    // Any key bound to an action must not also scroll the page, submit a form, navigate
    // back, or otherwise do whatever the browser would do with it by default — and since
    // every key can be rebound to anything now, that has to hold for every key, not just
    // a fixed list of the ones that shipped with a default binding there.
    e.preventDefault();
    if (!this.enabled) return;

    if (down) {
      // Held-key auto-repeat drives menu scrolling but must never auto-fire attacks.
      if (e.repeat) {
        this.repeatable.add(action);
        return;
      }
      if (!this.held.has(action)) this.buffered.add(action);
      this.held.add(action);
    } else {
      this.held.delete(action);
    }
  }

  /** Call once at the top of each simulation tick. */
  beginTick(): void {
    this.pressedThisTick = this.buffered;
    this.buffered = new Set();
    this.repeatable.clear();
    // Counted before the held-mouse actions below are synthesised, so `anyPressed` means
    // "somebody just did something" and not "a mouse button is still resting down".
    this.edges = this.pressedThisTick.size;
    // A held mouse button keeps swinging or casting, the way holding a button does in
    // every other twin-aim action game — unlike a key, it was never edge-triggered.
    if (this.usesMouseAim) {
      if (this.mouseHeld.left) this.pressedThisTick.add("attack");
      if (this.mouseHeld.right) this.pressedThisTick.add(this.settings.mouseSecondary);
    }
  }

  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  /** True only on the tick the key went down — never on OS auto-repeat. */
  wasPressed(action: Action): boolean {
    return this.pressedThisTick.has(action);
  }

  /**
   * True on any tick a bound action was actually pressed, whichever one it was. For the
   * "press anything to carry on" moments — an unspoken drop stopping the world — where
   * asking the player to find a specific key would be absurd.
   */
  anyPressed(): boolean {
    return this.edges > 0;
  }

  /** Like `wasPressed`, but honors auto-repeat. For menu navigation only. */
  wasPressedOrRepeated(action: Action): boolean {
    return this.pressedThisTick.has(action) || this.repeatable.has(action);
  }

  /** Movement from the direction keys, normalized so diagonals aren't faster. */
  moveVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isDown("left")) x -= 1;
    if (this.isDown("right")) x += 1;
    if (this.isDown("up")) y -= 1;
    if (this.isDown("down")) y += 1;
    const len = Math.hypot(x, y);
    return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
  }
}

export interface ControlHint {
  readonly keys: string;
  readonly label: string;
}

/**
 * Single source of truth for every on-screen legend. Never hardcode a key name in the
 * UI — these read the live settings, so a rebind or a scheme switch moves every legend
 * that shows it in the same frame.
 */
export function combatHints(settings: Settings): ControlHint[] {
  const k = (a: RebindableAction) => keyLabel(settings.keybinds[a] ?? DEFAULT_KEYBINDS[a]);
  const move = `${k("up")}/${k("left")}/${k("down")}/${k("right")}`;
  const mouse = settings.controlScheme === "mouse";
  return [
    { keys: move, label: "Move" },
    mouse
      ? { keys: "Mouse", label: "Aim" }
      : { keys: move, label: "Aim (faces your movement)" },
    mouse ? { keys: "Left click", label: "Attack" } : { keys: k("attack"), label: "Attack" },
    mouse
      ? { keys: "Right click", label: MOUSE_SECONDARY_LABELS[settings.mouseSecondary] }
      : { keys: k("dash"), label: "Dash" },
    ...(mouse ? [{ keys: k("dash"), label: "Dash" }] : []),
    { keys: k("potion"), label: "Potion" },
    { keys: `${k("skill1")} ${k("skill2")} ${k("skill3")} ${k("skill4")}`, label: "Skills" },
    { keys: k("special"), label: "Ultimate" },
    { keys: k("confirm"), label: "Descend at portal" },
    { keys: k("cancel"), label: "Extract at portal" },
    { keys: k("pause"), label: "Resume" },
  ];
}

/** Key labels for the three skill slots, in slot order. The HUD reads these. */
export function skillKeys(settings: Settings): string[] {
  return [
    keyLabel(settings.keybinds.skill1 ?? DEFAULT_KEYBINDS.skill1),
    keyLabel(settings.keybinds.skill2 ?? DEFAULT_KEYBINDS.skill2),
    keyLabel(settings.keybinds.skill3 ?? DEFAULT_KEYBINDS.skill3),
    keyLabel(settings.keybinds.skill4 ?? DEFAULT_KEYBINDS.skill4),
  ];
}

/** Same "read the live settings, never hardcode a key" rule as `combatHints`, for the
 *  town's own quick-reference table — menu navigation is rebindable too. */
export function townHints(settings: Settings): ControlHint[] {
  const k = (a: RebindableAction) => keyLabel(settings.keybinds[a] ?? DEFAULT_KEYBINDS[a]);
  return [
    { keys: `${k("up")} / ${k("down")}`, label: "Select" },
    { keys: `${k("left")} / ${k("right")}`, label: "Adjust" },
    { keys: `${k("tabPrev")} / ${k("tabNext")}`, label: "Switch tab" },
    { keys: k("confirm"), label: "Confirm" },
    { keys: k("cancel"), label: "Back / secondary" },
    { keys: "Mouse", label: "Click anything — rows, tabs and buttons all work" },
  ];
}
