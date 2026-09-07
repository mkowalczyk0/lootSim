/**
 * How the screen reacts to a rarity. One table, one widget, two places that use it —
 * the chest slot machine (`ui/chestroll.ts`) and a drop hitting the floor mid-dive
 * (`ui/lootbanner.ts`) — because a legendary should feel like a legendary wherever it
 * came from. If the ladder ever gets retuned, it gets retuned here and both move.
 *
 * The gradient is the reward. `data/rarity.ts` sets unspoken at roughly one in a quarter
 * of a million and says to keep it absurd; this is that number made visible. A common
 * barely tints the screen. An unspoken whites it out, shakes it, throws light behind it
 * and — in the dungeon — stops the game dead until you look at it.
 */

import { RARITIES, RARITY_COLORS, rarityIndex, rarityLabel, type Rarity } from "../data/rarity";

export interface Punch {
  /** Peak opacity of the colour wash over the screen. */
  readonly alpha: number;
  /** How long that wash takes to fade. */
  readonly ms: number;
  /** 0 nothing, 1 a knock, 2 the whole screen loses its footing. */
  readonly shake: 0 | 1 | 2;
  /** Rotating light rays behind whatever landed. */
  readonly rays: boolean;
  /** The rarity's name in enormous letters. */
  readonly banner: boolean;
  /** Extra milliseconds to sit on the result before moving on. */
  readonly hold: number;
}

export const PUNCH: Record<Rarity, Punch> = {
  common: { alpha: 0.10, ms: 220, shake: 0, rays: false, banner: false, hold: 0 },
  uncommon: { alpha: 0.16, ms: 260, shake: 0, rays: false, banner: false, hold: 0 },
  rare: { alpha: 0.26, ms: 330, shake: 0, rays: false, banner: false, hold: 140 },
  epic: { alpha: 0.40, ms: 430, shake: 1, rays: false, banner: true, hold: 340 },
  legendary: { alpha: 0.55, ms: 540, shake: 1, rays: true, banner: true, hold: 640 },
  mythic: { alpha: 0.70, ms: 640, shake: 2, rays: true, banner: true, hold: 920 },
  divine: { alpha: 0.85, ms: 740, shake: 2, rays: true, banner: true, hold: 1160 },
  unspoken: { alpha: 1.00, ms: 920, shake: 2, rays: true, banner: true, hold: 1500 },
};

/**
 * The floor at which a drop stops being a line of text and becomes an event. Below this
 * a dive says what you picked up and gets on with the fight; at or above it the screen
 * takes over for a second.
 */
export const CINEMATIC_FLOOR: Rarity = "legendary";

/**
 * The one rarity that stops the game rather than playing over it. Deliberately just the
 * one: freezing the world is only special while it stays a thing almost nobody has seen,
 * and the game is named after this rarity. Move it down a step (to "divine") if that ever
 * stops being true — everything else follows from the constant.
 */
export const HALT_FLOOR: Rarity = "unspoken";

export function atLeast(rarity: Rarity, floor: Rarity): boolean {
  return rarityIndex(rarity) >= rarityIndex(floor);
}

/** Every rarity's index as a class suffix, so CSS can hang per-tier rules off a cell. */
export const RARITY_CLASS: Record<Rarity, string> = Object.fromEntries(
  RARITIES.map((r) => [r, `r${rarityIndex(r)}`]),
) as Record<Rarity, string>;

/**
 * The wash, the rays, the shake and the big word, wired to whichever elements a screen
 * gave them. Both callers build their own layout and hand the pieces over — this owns
 * only the reaction, not the arrangement.
 */
export class RarityFx {
  constructor(
    /** Gets `rays-on` while rays are showing. */
    private readonly root: HTMLElement,
    private readonly wash: HTMLElement,
    private readonly rays: HTMLElement,
    private readonly banner: HTMLElement,
    /** Whatever should physically move — usually the content, not the backdrop. */
    private readonly shakeTarget: HTMLElement,
  ) {}

  /** Everything `PUNCH` says this rarity is worth, all at once. */
  fire(rarity: Rarity): void {
    const p = PUNCH[rarity];
    const color = RARITY_COLORS[rarity];

    this.wash.style.setProperty("--wash", color);
    this.wash.style.setProperty("--peak", String(p.alpha));
    restart(this.wash, "wash-hit", p.ms);

    if (p.shake > 0) {
      this.shakeTarget.classList.remove("shake-1", "shake-2");
      void this.shakeTarget.offsetWidth;
      this.shakeTarget.classList.add(`shake-${p.shake}`);
    }
    if (p.rays) {
      this.rays.style.setProperty("--r", color);
      this.root.classList.add("rays-on");
    }
    if (p.banner) {
      this.banner.textContent = rarityLabel(rarity).toUpperCase();
      this.banner.style.color = color;
      restart(this.banner, "banner-hit", 0);
    }
  }

  /** Back to nothing, for a screen that's being reused for the next thing. */
  reset(): void {
    this.root.classList.remove("rays-on");
    this.shakeTarget.classList.remove("shake-1", "shake-2");
    this.banner.classList.remove("banner-hit");
    this.banner.textContent = "";
    this.wash.classList.remove("wash-hit");
    this.wash.style.opacity = "0";
  }
}

/**
 * Re-runs a CSS animation that may already be running. Toggling the class alone does
 * nothing — the browser needs a layout read in between to notice it left and came back.
 */
export function restart(el: HTMLElement, cls: string, durationMs: number): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  if (durationMs > 0) el.style.setProperty("--dur", `${durationMs}ms`);
  el.classList.add(cls);
}
