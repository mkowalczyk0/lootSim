import { GameLoop } from "./core/loop";
import { Input } from "./core/input";
import { formatNumber } from "./core/math";
import { RARITY_COLORS } from "./data/rarity";
import { Dungeon } from "./game/dungeon";
import { GameState } from "./game/state";
import { WorldRenderer } from "./render/draw";
import { Fx } from "./render/fx";
import { buildSprites } from "./render/sprites";
import { Hud } from "./ui/hud";
import { TownUI } from "./ui/town";

type Scene = "town" | "dive";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const townRoot = document.querySelector<HTMLElement>("#town")!;
const ctx = canvas.getContext("2d", { alpha: false })!;

buildSprites();

const state = GameState.load();
const input = new Input();
const fx = new Fx();
const world = new WorldRenderer();
const hud = new Hud();

let scene: Scene = "town";
let dungeon: Dungeon | null = null;
let paused = false;
/** Set when the floor is cleared and the player chose to descend, so the next floor
 *  starts with the loot already banked. */
let viewW = 0;
let viewH = 0;

const town = new TownUI(townRoot, state, (depth) => enterDungeon(depth));

function enterDungeon(depth: number): void {
  dungeon = new Dungeon(state, depth);
  scene = "dive";
  paused = false;
  town.hide();
  fx.clear();
  world.reset();
  canvas.hidden = false;
}

function returnToTown(): void {
  dungeon = null;
  scene = "town";
  canvas.hidden = true;
  state.player.fullHeal();
  state.save();
  town.show();
}

/** Resolution follows the window, with a devicePixelRatio backing store for crisp text. */
function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.floor(viewW * dpr);
  canvas.height = Math.floor(viewH * dpr);
  canvas.style.width = `${viewW}px`;
  canvas.style.height = `${viewH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

/** Turn simulation events into particles, numbers and shake. */
function consumeEvents(d: Dungeon): void {
  for (const ev of d.drainEvents()) {
    switch (ev.kind) {
      case "damage":
        fx.text(ev.x, ev.y, String(ev.amount),
          ev.onPlayer ? "#ff6b6b" : ev.crit ? "#ffd34d" : "#ffffff",
          ev.crit ? 16 : 12);
        if (!ev.onPlayer) fx.burst(ev.x, ev.y, ev.crit ? "#ffd34d" : "#ffe9c4", ev.crit ? 10 : 5, 120);
        break;
      case "death":
        fx.burst(ev.x, ev.y, ev.elite ? RARITY_COLORS[ev.elite] : "#ff6b6b", ev.elite ? 26 : 14, 190);
        fx.ring(ev.x, ev.y, ev.elite ? 46 : 28, ev.elite ? RARITY_COLORS[ev.elite] : "#ff6b6b", 2);
        break;
      case "pickup":
        fx.text(ev.x, ev.y, ev.label, ev.color, 11);
        break;
      case "levelUp":
        fx.text(d.avatar.x, d.avatar.y - 40, `LEVEL ${state.player.level}`, "#7dd3fc", 20);
        fx.ring(d.avatar.x, d.avatar.y, 90, "#7dd3fc", 4);
        fx.burst(d.avatar.x, d.avatar.y, "#7dd3fc", 30, 220);
        break;
      case "nova":
        fx.ring(ev.x, ev.y, ev.radius, "#ff1493", 6);
        fx.ring(ev.x, ev.y, ev.radius * 0.7, "#ffffff", 3);
        fx.burst(ev.x, ev.y, "#ff1493", 40, 320);
        break;
      case "shake":
        fx.addShake(ev.amount);
        break;
      case "trap": {
        // Hazards get their own colored puff so a hit reads as "the floor did that".
        const color = ev.trap === "flame" ? "#ff8a3c"
          : ev.trap === "turret" ? "#fca5a5"
          : ev.trap === "mire" ? "#4ade80"
          : "#e2e8f0";
        fx.burst(ev.x, ev.y, color, ev.trap === "flame" ? 18 : 10, ev.trap === "flame" ? 150 : 110);
        fx.ring(ev.x, ev.y, ev.radius, color, 2);
        break;
      }
      case "wave":
        fx.text(d.avatar.x, d.avatar.y - 56, `WAVE ${ev.wave}`, "#fbbf24", 16);
        break;
      case "cleared":
        fx.text(d.portal.x, d.portal.y - 40, "PORTAL OPEN", "#7dd3fc", 16);
        fx.ring(d.portal.x, d.portal.y, 120, "#7dd3fc", 3);
        break;
      case "playerDied":
        fx.addShake(20);
        fx.burst(d.avatar.x, d.avatar.y, "#ef4444", 40, 260);
        break;
    }
  }
}

/** Portal choices and the death screen are handled here, outside the simulation. */
function handleRunDecisions(d: Dungeon): void {
  if (d.atPortal) {
    if (d.canDescend && input.wasPressed("confirm")) {
      d.bankLoot();
      state.save();
      enterDungeon(d.profile.depth + 1);
      return;
    }
    if (input.wasPressed("cancel")) {
      const coins = d.loot.coins;
      const items = d.loot.items.length;
      d.bankLoot();
      state.save();
      returnToTown();
      flash(`Extracted with ${formatNumber(coins)} coins and ${items} items.`);
      return;
    }
  }
  if (d.phase === "dead" && input.wasPressed("confirm")) {
    // Loot is deliberately not banked — dying costs you the whole dive.
    state.save();
    returnToTown();
  }
}

function update(dt: number): void {
  input.beginTick();
  fx.update(dt);

  if (scene === "town") {
    town.update(input);
    return;
  }
  const d = dungeon;
  if (!d) return;

  if (input.wasPressed("pause") && d.phase !== "dead") paused = !paused;
  // The simulation is frozen while paused, but decisions still respond so the player
  // can read the control list and then act without an extra keypress to unpause.
  if (!paused) d.update(dt, input);
  consumeEvents(d);
  if (!paused) handleRunDecisions(d);
}

function render(alpha: number): void {
  if (scene !== "dive" || !dungeon) return;
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, viewW, viewH);
  world.render(ctx, dungeon, fx, alpha, viewW, viewH);
  hud.draw(ctx, dungeon, viewW, viewH, paused);
}

/** Brief banner over the town, for extract confirmations. */
function flash(text: string): void {
  const el = document.querySelector<HTMLElement>("#flash")!;
  el.textContent = text;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 3400);
}

// Typing in a field must never drive the character; nothing focusable exists today,
// but this keeps the door closed if a text input is ever added.
window.addEventListener("focusin", (e) => {
  const t = e.target as HTMLElement;
  input.setEnabled(!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement));
});

canvas.hidden = true;
town.show();
new GameLoop(update, render).start();

window.addEventListener("beforeunload", () => state.save());
