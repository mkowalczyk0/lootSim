import { COMBAT_HINTS } from "../core/input";
import { clamp, formatNumber } from "../core/math";
import { CHEST_TIERS } from "../data/chests";
import { RARITY_COLORS } from "../data/rarity";
import type { Dungeon } from "../game/dungeon";

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Screen-space overlay for a dive: vitals, floor progress, unbanked loot, prompts. */
export class Hud {
  draw(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number, paused = false): void {
    ctx.save();
    ctx.textBaseline = "top";

    this.drawVitals(ctx, d);
    this.drawFloorInfo(ctx, d, w);
    this.drawLoot(ctx, d, w);
    this.drawControls(ctx, h);

    if (d.phase !== "dead") this.drawPortalPrompt(ctx, d, w, h);
    if (d.phase === "dead") this.drawDeathPrompt(ctx, d, w, h);
    if (paused && d.phase !== "dead") this.drawPause(ctx, w, h);

    ctx.restore();
  }

  private drawVitals(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    const p = d.player;
    const x = 18;
    const y = 18;
    const w = 260;

    panel(ctx, x - 8, y - 8, w + 16, 92);

    // Health
    const pct = clamp(p.health / p.maxHealth, 0, 1);
    ctx.fillStyle = "#1a1d26";
    ctx.fillRect(x, y, w, 18);
    ctx.fillStyle = pct > 0.5 ? "#4ade80" : pct > 0.25 ? "#fbbf24" : "#ef4444";
    ctx.fillRect(x, y, w * pct, 18);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 17);
    ctx.font = `bold 11px ${MONO}`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.ceil(p.health)} / ${p.maxHealth}`, x + w / 2, y + 4);

    // XP
    const xpPct = clamp(p.xp / p.xpNeeded, 0, 1);
    ctx.fillStyle = "#1a1d26";
    ctx.fillRect(x, y + 22, w, 8);
    ctx.fillStyle = "#7dd3fc";
    ctx.fillRect(x, y + 22, w * xpPct, 8);

    // Special charge
    ctx.fillStyle = "#1a1d26";
    ctx.fillRect(x, y + 34, w, 8);
    const charged = d.specialCharge >= 1;
    ctx.fillStyle = charged ? "#ff1493" : "#a855f7";
    ctx.fillRect(x, y + 34, w * clamp(d.specialCharge, 0, 1), 8);

    ctx.textAlign = "left";
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = "#9aa4b2";
    ctx.fillText(`LV ${p.level}`, x, y + 46);
    ctx.fillText(charged ? "SPECIAL READY  [;]" : "special", x + 54, y + 46);
    ctx.fillStyle = "#4ade80";
    ctx.fillText(`Potions ${"◆".repeat(Math.min(6, d.potionCount))} (${d.potionCount})  [L]`, x, y + 62);
  }

  private drawFloorInfo(ctx: CanvasRenderingContext2D, d: Dungeon, w: number): void {
    ctx.textAlign = "center";
    const cx = w / 2;

    ctx.font = `bold 15px ${MONO}`;
    ctx.fillStyle = "#e8eef7";
    ctx.fillText(`DEPTH ${d.profile.depth} — ${d.profile.name}`, cx, 18);

    // The layout name is the only clue that the floor was generated, so it earns a line.
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = "#6b7480";
    ctx.fillText(d.level.label.toUpperCase(), cx, 38);

    if (d.phase === "fighting") {
      ctx.fillStyle = "#9aa4b2";
      ctx.fillText(
        `Wave ${Math.min(d.wave, d.profile.waves)} / ${d.profile.waves}   •   ${d.enemiesRemaining} left`,
        cx, 56,
      );
    }
  }

  private drawLoot(ctx: CanvasRenderingContext2D, d: Dungeon, w: number): void {
    const x = w - 18;
    let y = 18;
    ctx.textAlign = "right";
    ctx.font = `11px ${MONO}`;

    ctx.fillStyle = "#6b7480";
    ctx.fillText("UNBANKED — lost if you die", x, y);
    y += 16;

    ctx.font = `bold 13px ${MONO}`;
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`${formatNumber(d.loot.coins)} coins`, x, y);
    y += 18;

    ctx.font = `11px ${MONO}`;
    const keyTotal = CHEST_TIERS.reduce((n, t) => n + d.loot.keys[t], 0);
    if (keyTotal > 0) {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`${keyTotal} keys`, x, y);
      y += 15;
    }

    // Show the last few pickups so a good drop is impossible to miss.
    const recent = d.loot.items.slice(-6).reverse();
    for (const item of recent) {
      ctx.fillStyle = RARITY_COLORS[item.rarity];
      ctx.fillText(item.name, x, y);
      y += 14;
    }
    if (d.loot.items.length > 6) {
      ctx.fillStyle = "#6b7480";
      ctx.fillText(`+${d.loot.items.length - 6} more`, x, y);
    }
  }

  private drawControls(ctx: CanvasRenderingContext2D, h: number): void {
    ctx.textAlign = "left";
    ctx.font = `10px ${MONO}`;
    let x = 18;
    const y = h - 24;
    for (const hint of COMBAT_HINTS.slice(0, 5)) {
      ctx.fillStyle = "#e8eef7";
      ctx.fillText(hint.keys, x, y);
      const kw = ctx.measureText(hint.keys).width;
      ctx.fillStyle = "#6b7480";
      ctx.fillText(` ${hint.label}`, x + kw, y);
      x += kw + ctx.measureText(` ${hint.label}`).width + 16;
    }
  }

  /**
   * Shown whenever the floor is cleared or the player is standing on the portal.
   * The portal is a live exit for the whole floor, so bailing out mid-wave is always
   * an option the player can see.
   */
  private drawPortalPrompt(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number): void {
    const cleared = d.canDescend;
    const atPortal = d.atPortal;
    if (!cleared && !atPortal) return;

    const bw = 470;
    const bh = atPortal ? 108 : 74;
    const bx = (w - bw) / 2;
    const by = h - bh - 54;

    panel(ctx, bx, by, bw, bh);
    ctx.textAlign = "center";
    ctx.font = `bold 16px ${MONO}`;
    ctx.fillStyle = cleared ? "#7dd3fc" : "#4ade80";
    ctx.fillText(cleared ? "FLOOR CLEARED" : "PORTAL", w / 2, by + 14);

    ctx.font = `12px ${MONO}`;
    if (!atPortal) {
      ctx.fillStyle = "#9aa4b2";
      ctx.fillText("Step into the portal to descend or extract", w / 2, by + 44);
      return;
    }

    let y = by + 44;
    if (cleared) {
      ctx.fillStyle = "#e8eef7";
      ctx.fillText(`[E] Descend to depth ${d.profile.depth + 1}`, w / 2, y);
      y += 24;
    } else {
      ctx.fillStyle = "#6b7480";
      ctx.fillText("Clear every wave to unlock the descent", w / 2, y);
      y += 24;
    }
    ctx.fillStyle = "#4ade80";
    ctx.fillText("[Q] Extract and bank your loot", w / 2, y);
  }

  private drawPause(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    drawPauseImpl(ctx, w, h);
  }

  private drawDeathPrompt(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number): void {
    ctx.fillStyle = "rgba(10,6,10,0.78)";
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";
    ctx.font = `bold 34px ${MONO}`;
    ctx.fillStyle = "#ef4444";
    ctx.fillText("YOU DIED", w / 2, h / 2 - 72);

    ctx.font = `13px ${MONO}`;
    ctx.fillStyle = "#9aa4b2";
    ctx.fillText(`Depth ${d.profile.depth} — ${d.loot.kills} kills`, w / 2, h / 2 - 24);
    ctx.fillStyle = "#ef4444";
    ctx.fillText(
      `Lost ${formatNumber(d.loot.coins)} coins and ${d.loot.items.length} items`,
      w / 2, h / 2,
    );
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText(`Kept ${formatNumber(d.loot.xp)} XP — experience is never lost`, w / 2, h / 2 + 24);

    ctx.font = `bold 14px ${MONO}`;
    ctx.fillStyle = "#e8eef7";
    ctx.fillText("[E] Return to town", w / 2, h / 2 + 68);
  }
}

/** Full control reference, so a keyboard-only game never leaves you guessing. */
function drawPauseImpl(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = "rgba(7,8,12,0.86)";
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "center";
  ctx.font = `bold 26px ${MONO}`;
  ctx.fillStyle = "#e8eef7";
  ctx.fillText("PAUSED", w / 2, h / 2 - 130);

  const rows = COMBAT_HINTS;
  let y = h / 2 - 80;
  for (const hint of rows) {
    ctx.textAlign = "right";
    ctx.font = `bold 13px ${MONO}`;
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText(hint.keys, w / 2 - 14, y);
    ctx.textAlign = "left";
    ctx.font = `13px ${MONO}`;
    ctx.fillStyle = "#9aa4b2";
    ctx.fillText(hint.label, w / 2 + 14, y);
    y += 24;
  }
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "rgba(12,14,20,0.82)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
