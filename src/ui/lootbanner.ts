/**
 * What the screen does when something good hits the floor mid-dive.
 *
 * A drop used to be a line of white text floating off a corpse and a number in the
 * corner, which is a fine way to report a common shortbow and a terrible way to report
 * the item you have been grinding four hundred floors for. This is the same reaction
 * `ui/chestroll.ts` gives a chest pull, aimed at the dungeon instead — same `PUNCH`
 * table, same wash, same rays, same enormous word — so a legendary feels like a
 * legendary whether it came out of a chest or off a corpse.
 *
 * Two shapes, and the difference is the whole design:
 *
 * - **Cinematic** (legendary through divine). Plays *over* a live fight. No backdrop, no
 *   pointer events, sat above the middle of the screen so it never covers the character
 *   or what's about to hit them, and it clears itself. The floor is still dangerous; the
 *   game does not owe you a pause for a legendary.
 * - **Halt** (unspoken, and only unspoken). Stops the world. `halting` is what `main.ts`
 *   reads to skip the simulation entirely — no monsters move, no telegraph resolves, no
 *   damage lands — until a key is pressed. It is the rarest thing in a game named after
 *   it, and it is allowed to interrupt anything.
 *
 * This is `ui/`: it reads an item that has already been rolled, collected and banked into
 * the run's loot, and draws. Freezing the simulation is `main.ts`'s decision to make on
 * the strength of `halting`; nothing here touches the dungeon.
 */

import { RARITY_COLORS, type Rarity } from "../data/rarity";
import { RELIC_TIER_INFO, type RelicDef } from "../data/relics";
import { augmentAxisLabel, type AugmentDef } from "../data/augments";
import { statLine, type Item } from "../game/item";
import { augmentArt, itemArt, itemArtKey, relicArt, relicArtKey } from "../render/sprites";
import { pixelImageFit } from "./pixelimage";
import { atLeast, CINEMATIC_FLOOR, HALT_FLOOR, PUNCH, RARITY_CLASS, RarityFx } from "./rarityfx";

/** Floor on how long a cinematic stays up, before `Punch.hold` adds to it. */
const BASE_HOLD = 900;
/** The fade out. */
const FADE_MS = 300;
/**
 * A halt refuses to be dismissed for this long. Without it, a player mid-swing with the
 * attack button held would blink straight past the one drop the game is named after.
 */
const HALT_LOCKOUT = 700;

export class LootBanner {
  private readonly el: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly art: HTMLImageElement;
  private readonly name: HTMLDivElement;
  private readonly line: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly fx: RarityFx;

  private phase: "idle" | "show" | "halt" | "out" = "idle";
  private endAt = 0;
  private dismissableAt = 0;
  private frame = 0;

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "loot";
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="fx-rays"></div>
      <div class="fx-wash"></div>
      <div class="loot-stage">
        <div class="loot-card">
          <img class="loot-art" alt="">
          <div class="loot-text">
            <div class="fx-banner"></div>
            <div class="loot-name"></div>
            <div class="loot-line"></div>
          </div>
        </div>
        <div class="loot-hint"></div>
      </div>`;
    this.stage = this.el.querySelector(".loot-stage")!;
    this.art = this.el.querySelector(".loot-art")!;
    this.name = this.el.querySelector(".loot-name")!;
    this.line = this.el.querySelector(".loot-line")!;
    this.hint = this.el.querySelector(".loot-hint")!;
    this.fx = new RarityFx(
      this.el,
      this.el.querySelector(".fx-wash")!,
      this.el.querySelector(".fx-rays")!,
      this.el.querySelector(".fx-banner")!,
      this.stage,
    );
    // Only ever clickable in halt mode — the cinematic is `pointer-events: none` so it
    // can't swallow an attack click from a player who is still very much in a fight.
    this.el.addEventListener("click", () => this.dismiss());
    host.appendChild(this.el);
  }

  /** True while the world should be standing still. Read by `main.ts`, every frame. */
  get halting(): boolean {
    return this.phase === "halt";
  }

  /**
   * Whether a rarity is worth interrupting the dive for at all. Anything under the
   * cinematic floor gets the ordinary floating name and nothing else.
   */
  static wants(rarity: Rarity): boolean {
    return atLeast(rarity, CINEMATIC_FLOOR);
  }

  show(item: Item): void {
    this.showCard({
      rarity: item.rarity, color: RARITY_COLORS[item.rarity], name: item.name, line: statLine(item),
      art: pixelImageFit(itemArt(item), 120, 120, itemArtKey("loot", item)),
    });
  }

  /** A relic or artifact (UAT §19). Always the full ceremony — its tier presents as divine or unspoken. */
  showRelic(def: RelicDef): void {
    this.showCard({
      rarity: def.rarity, color: RELIC_TIER_INFO[def.tier].color, name: def.name,
      line: `${RELIC_TIER_INFO[def.tier].label} — ${def.description}`,
      art: pixelImageFit(relicArt(def), 120, 120, relicArtKey(def)),
    });
  }

  /**
   * An augment (`docs/augments.md`). Goes through the same card as an item and a relic
   * deliberately: an unspoken augment is the rarest object in the game and the moment the
   * whole system was designed around, so it must not be quieter than a legendary sword.
   * `grade` is a real `Rarity`, so the halt rule applies to it unchanged.
   */
  showAugment(def: AugmentDef): void {
    this.showCard({
      rarity: def.grade, color: RARITY_COLORS[def.grade], name: def.name,
      line: `${augmentAxisLabel(def.effect.axis)} Augment — ${def.blurb}`,
      art: pixelImageFit(augmentArt(def), 120, 120, `augment.${def.id}`),
    });
  }

  /**
   * The one card. Everything cinematic the game announces — an item, a relic, an augment —
   * comes through here so the halt rule, the fx and the dismiss hint can never disagree.
   */
  private showCard(card: { rarity: Rarity; color: string; name: string; line: string; art: string }): void {
    const halt = atLeast(card.rarity, HALT_FLOOR);

    this.el.className = `loot ${RARITY_CLASS[card.rarity]}${halt ? " halt" : ""}`;
    this.el.style.setProperty("--r", card.color);
    this.el.hidden = false;
    this.fx.reset();

    this.art.src = card.art;
    this.name.textContent = card.name;
    this.name.style.color = card.color;
    this.line.textContent = card.line;
    // Deliberately not a key name: `Input.anyPressed` really does mean *any* bound key,
    // and a click works too, so there's nothing here for a rebind to invalidate.
    this.hint.textContent = halt ? "any key to carry on" : "";

    this.fx.fire(card.rarity);

    const now = performance.now();
    if (halt) {
      this.phase = "halt";
      this.dismissableAt = now + HALT_LOCKOUT;
    } else {
      this.phase = "show";
      this.endAt = now + BASE_HOLD + PUNCH[card.rarity].hold;
    }
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.tick);
  }

  /** A press, or a click. Ignored during the lockout, and a no-op when nothing is up. */
  dismiss(): void {
    if (this.phase === "halt" && performance.now() >= this.dismissableAt) this.close();
  }

  /** Torn down without ceremony — leaving the floor, or dying on it. */
  clear(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.phase = "idle";
    this.el.hidden = true;
    this.fx.reset();
  }

  private close(): void {
    this.phase = "out";
    this.endAt = performance.now() + FADE_MS;
    this.el.classList.add("out");
  }

  private readonly tick = (): void => {
    const now = performance.now();
    if (this.phase === "show" && now >= this.endAt) {
      this.close();
    } else if (this.phase === "out" && now >= this.endAt) {
      this.clear();
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };
}
