export type Action =
  | "up" | "down" | "left" | "right"
  | "attack" | "dash" | "potion" | "special"
  | "confirm" | "cancel" | "tabPrev" | "tabNext" | "pause";

/**
 * Keyboard-only by design. The left hand drives movement on WASD, the right hand
 * sits on the JKL home row for combat. The game must be fully playable — town menus
 * included — without ever touching a mouse.
 *
 * Arrow keys mirror WASD so either hand position works.
 */
const BINDINGS: Record<string, Action> = {
  // movement
  KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",

  // combat — right hand home row
  KeyJ: "attack", Space: "attack",
  KeyK: "dash",
  KeyL: "potion",
  Semicolon: "special", KeyU: "special",

  // menus / interaction
  KeyE: "confirm", Enter: "confirm",
  KeyQ: "cancel", Backspace: "cancel",
  KeyI: "tabPrev", BracketLeft: "tabPrev",
  KeyO: "tabNext", BracketRight: "tabNext",
  Escape: "pause",
};

/** Keys the browser would otherwise act on (scroll, back-navigation). */
const SWALLOW = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "Enter"]);

/**
 * Edge-triggered keyboard state. `isDown` is the live state; `wasPressed` is latched
 * per simulation tick so a tap between frames can never be dropped or read twice.
 */
export class Input {
  private held = new Set<Action>();
  private buffered = new Set<Action>();
  private pressedThisTick = new Set<Action>();
  private repeatable = new Set<Action>();
  private enabled = true;

  constructor(target: EventTarget = window) {
    target.addEventListener("keydown", (e) => this.onKey(e as KeyboardEvent, true));
    target.addEventListener("keyup", (e) => this.onKey(e as KeyboardEvent, false));
    // Alt-tabbing away must not leave a movement key stuck down.
    window.addEventListener("blur", () => this.held.clear());
  }

  /** Turned off while a text field has focus, so typing can't drive the character. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.held.clear();
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const action = BINDINGS[e.code];
    if (!action) return;
    if (SWALLOW.has(e.code)) e.preventDefault();
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
  }

  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  /** True only on the tick the key went down — never on OS auto-repeat. */
  wasPressed(action: Action): boolean {
    return this.pressedThisTick.has(action);
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
 * UI — if a binding moves, the legends have to move with it.
 */
export const COMBAT_HINTS: readonly ControlHint[] = [
  { keys: "WASD", label: "Move" },
  { keys: "J", label: "Attack" },
  { keys: "K", label: "Dash" },
  { keys: "L", label: "Potion" },
  { keys: ";", label: "Special" },
  { keys: "E", label: "Descend at portal" },
  { keys: "Q", label: "Extract at portal" },
  { keys: "Esc", label: "Resume" },
];

export const TOWN_HINTS: readonly ControlHint[] = [
  { keys: "W / S", label: "Select" },
  { keys: "A / D", label: "Adjust" },
  { keys: "I / O", label: "Switch tab" },
  { keys: "E", label: "Confirm" },
  { keys: "Q", label: "Back / secondary" },
];
