/**
 * The chest opening, as a slot machine.
 *
 * A chest used to resolve instantly into a list of names in a side panel, which is an
 * honest way to show eight rarities and a completely dishonest way to show *gambling*.
 * This is the same roll — `GameState.openChests` has already decided everything before
 * a single pixel moves here — dressed as the thing it actually is: reels of item sprites
 * machine-gunning past at fifty-odd milliseconds a frame, snapping to a stop one after
 * another, and the screen taking a hit in the colour of whatever landed.
 *
 * Three rules the whole thing is built around:
 *
 * 1. **Fast.** A single pull is over in about a second and a quarter, a ten-pull in two
 *    and a half. A slot machine that makes you wait is a loading screen.
 * 2. **The reaction scales with the rarity, and only with the rarity.** `PUNCH` is the
 *    entire dial: a common barely tints the screen and adds no hold at all, an unspoken
 *    whites the screen out, shakes it, throws rays behind the reels and sits there for a
 *    second and a half. That gradient *is* the reward — see `data/rarity.ts`'s "keep it
 *    absurd, the long tail is the hook".
 * 3. **Always skippable.** Pressing the same key again cuts straight to the result, and
 *    pressing it once more closes it. Nobody grinding their four hundredth Basic chest
 *    should have to watch this.
 *
 * This is `ui/`, so it reads a finished roll and draws it. It never decides anything.
 */

import { ITEM_TYPES } from "../data/items";
import { RARITIES, RARITY_COLORS, rarityIndex, type Rarity } from "../data/rarity";
import type { Item } from "../game/item";
import { itemArt, itemArtKey, itemIcon } from "../render/sprites";
import { pixelImageFit } from "./pixelimage";
import { PUNCH, RARITY_CLASS, RarityFx } from "./rarityfx";

/** Milliseconds between two faces while a reel is spinning — the "bang bang bang". */
const TICK_MS = 52;
/** How long the first reel spins before it locks. */
const SPIN_MS = 780;
/** Each reel after the first locks this much later, left to right. */
const STAGGER_MS = 115;
/** The tail of a spin where the ticks stretch out, so a reel arrives rather than stops. */
const EASE_MS = 260;
/** Floor on how long the finished board stays up, before `Punch.hold` adds to it. */
const BASE_HOLD = 460;
/** The fade out. Also how long a skip-to-close takes. */
const FADE_MS = 220;
/** Sitting time after a skip cuts the spin short — long enough to read what you got. */
const SKIP_HOLD = 700;

interface Reel {
  readonly cell: HTMLElement;
  readonly face: HTMLImageElement;
  readonly label: HTMLElement;
  readonly item: Item;
  locked: boolean;
  nextTick: number;
}

/** Options for one opening. `skipHint` is passed in because the key is rebindable. */
export interface RollRequest {
  readonly items: readonly Item[];
  /** The chest's name, across the top. */
  readonly title: string;
  /** The chest's own colour, for that title. */
  readonly color: string;
  /** e.g. "E again to skip" — built by the caller from the live keybinds. */
  readonly skipHint: string;
}

export class ChestRoll {
  private readonly el: HTMLDivElement;
  private readonly rays: HTMLDivElement;
  private readonly wash: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly board: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly fx: RarityFx;

  private reels: Reel[] = [];
  private phase: "idle" | "spin" | "hold" | "out" = "idle";
  private startedAt = 0;
  private endAt = 0;
  private frame = 0;
  private done: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "roll";
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="fx-rays"></div>
      <div class="fx-wash"></div>
      <div class="roll-stage">
        <div class="roll-title"></div>
        <div class="roll-board"></div>
        <div class="fx-banner"></div>
        <div class="roll-hint"></div>
      </div>`;
    this.rays = this.el.querySelector(".fx-rays")!;
    this.wash = this.el.querySelector(".fx-wash")!;
    this.stage = this.el.querySelector(".roll-stage")!;
    this.title = this.el.querySelector(".roll-title")!;
    this.board = this.el.querySelector(".roll-board")!;
    this.banner = this.el.querySelector(".fx-banner")!;
    this.hint = this.el.querySelector(".roll-hint")!;
    this.fx = new RarityFx(this.el, this.wash, this.rays, this.banner, this.stage);
    // Clicking anywhere skips, exactly like pressing the key again — every screen in the
    // game is mouse-drivable, and this one has precisely one thing you can do to it.
    this.el.addEventListener("click", () => this.skip());
    host.appendChild(this.el);
  }

  /** True while anything is on screen, so the caller knows to route input here instead. */
  get active(): boolean {
    return this.phase !== "idle";
  }

  play(req: RollRequest, onDone: () => void): void {
    if (req.items.length === 0) {
      onDone();
      return;
    }
    this.stop();
    this.done = onDone;

    this.title.textContent = req.title;
    this.title.style.color = req.color;
    this.hint.textContent = req.skipHint;
    this.el.classList.toggle("single", req.items.length === 1);
    this.el.classList.remove("out");
    this.fx.reset();

    this.board.innerHTML = "";
    this.reels = req.items.map((item) => {
      const cell = document.createElement("div");
      cell.className = "roll-cell spinning";
      const face = document.createElement("img");
      face.className = "roll-face";
      face.alt = "";
      const label = document.createElement("div");
      label.className = "roll-label";
      cell.append(face, label);
      this.board.appendChild(cell);
      return { cell, face, label, item, locked: false, nextTick: 0 };
    });
    for (const reel of this.reels) this.spinFace(reel);

    this.el.hidden = false;
    this.phase = "spin";
    this.startedAt = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  /**
   * The same key again. Mid-spin it lands every reel at once and pulses only the best of
   * them — ten stacked flashes would be a strobe, not a payoff. Once the board is already
   * standing it just closes.
   */
  skip(): void {
    if (this.phase === "spin") {
      for (const reel of this.reels) {
        if (!reel.locked) this.land(reel, false);
      }
      this.fx.fire(this.best());
      this.phase = "hold";
      this.endAt = performance.now() + SKIP_HOLD;
      return;
    }
    if (this.phase === "hold") this.close();
  }

  /** Tears the whole thing down without the fade — leaving town mid-roll, say. */
  cancel(): void {
    if (this.phase === "idle") return;
    const done = this.done;
    this.stop();
    done?.();
  }

  private stop(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.phase = "idle";
    this.done = null;
    this.el.hidden = true;
    this.el.classList.remove("out");
    this.fx.reset();
  }

  private readonly tick = (): void => {
    const now = performance.now();
    if (this.phase === "spin") {
      const t = now - this.startedAt;
      let allDown = true;
      this.reels.forEach((reel, i) => {
        if (reel.locked) return;
        const lockAt = SPIN_MS + i * STAGGER_MS;
        if (t >= lockAt) {
          this.land(reel, true);
          return;
        }
        allDown = false;
        if (now >= reel.nextTick) {
          this.spinFace(reel);
          // The last quarter-second of a spin stretches its ticks out, so a reel decides
          // where it's stopping instead of being switched off mid-blur.
          const left = lockAt - t;
          reel.nextTick = now + (left < EASE_MS ? TICK_MS + (EASE_MS - left) * 0.36 : TICK_MS);
        }
      });
      if (allDown) {
        this.phase = "hold";
        this.endAt = now + BASE_HOLD + PUNCH[this.best()].hold;
      }
    } else if (this.phase === "hold" && now >= this.endAt) {
      // Deliberately falls through to the frame request below — the fade still needs
      // driving, and returning here would leave the overlay up forever.
      this.close();
    } else if (this.phase === "out" && now >= this.endAt) {
      const done = this.done;
      this.stop();
      done?.();
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private close(): void {
    if (this.phase === "out") return;
    this.phase = "out";
    this.endAt = performance.now() + FADE_MS;
    this.el.classList.add("out");
  }

  /** The best rarity on the board — what the hold length and a skip's one flash use. */
  private best(): Rarity {
    return this.reels.reduce<Rarity>(
      (b, r) => (rarityIndex(r.item.rarity) > rarityIndex(b) ? r.item.rarity : b), "common");
  }

  /** One frame of the blur: a random item at a random rarity. Pure noise, on purpose. */
  private spinFace(reel: Reel): void {
    const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)]!;
    const rarity = RARITIES[Math.floor(Math.random() * RARITIES.length)]!;
    reel.face.src = pixelImageFit(itemIcon(type, rarity), 96, 96, `roll:${type}:${rarity}`);
  }

  /** A reel arriving on its real item. `react` is false when a skip lands ten at once. */
  private land(reel: Reel, react: boolean): void {
    const { item } = reel;
    reel.locked = true;
    reel.face.src = pixelImageFit(itemArt(item), 96, 96, itemArtKey("roll", item));
    reel.label.textContent = item.name;
    reel.label.style.color = RARITY_COLORS[item.rarity];
    reel.cell.style.setProperty("--r", RARITY_COLORS[item.rarity]);
    reel.cell.classList.remove("spinning");
    reel.cell.classList.add("locked", RARITY_CLASS[item.rarity]);
    if (react) this.fx.fire(item.rarity);
  }
}
