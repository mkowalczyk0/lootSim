/**
 * Draws the ship. A small fixed space, so unlike the dungeon it never scrolls — the
 * whole hub is scaled to fit the viewport and drawn once. Portals borrow the exact
 * glyph a dungeon's own exit uses; the two terminal-shaped stations get a simple
 * console prop instead, in the same "procedural, not a sprite" spirit as a trap.
 */

import type { Appearance } from "../data/cosmetics";
import { drawPortalGlyph, drawSprite } from "./draw";
import {
  HUB_HEIGHT, HUB_WIDTH, type Hub, type HubMate, type HubStation, type HubStationKind,
} from "../game/hub";
import { heroSprite } from "./sprites";

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const STATION_COLORS: Record<HubStationKind, string> = {
  dive: "#7dd3fc", abyss: "#ff1493", hoard: "#fbbf24", expedition: "#4ade80",
  starmap: "#a855f7", forge: "#fb923c", quartermaster: "#38bdf8",
  comms: "#22d3ee", party: "#22d3ee",
};

const PORTAL_KINDS = new Set<HubStationKind>(["dive", "abyss", "hoard", "expedition", "party"]);

export function renderHub(
  ctx: CanvasRenderingContext2D, hub: Hub, appearance: Appearance, viewW: number, viewH: number,
): void {
  const pad = 40;
  const scale = Math.max(0.3, Math.min((viewW - pad * 2) / HUB_WIDTH, (viewH - pad * 2) / HUB_HEIGHT));
  const offX = (viewW - HUB_WIDTH * scale) / 2;
  const offY = (viewH - HUB_HEIGHT * scale) / 2;
  const time = performance.now() / 1000;
  const near = hub.nearStation();

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;

  drawDeck(ctx);
  for (const s of hub.stations) drawStation(ctx, s, time, s === near);

  // Everyone else in the room is walking around their own copy of this deck; their
  // positions arrive over the relay a dozen times a second and are drawn here.
  for (const mate of hub.mates) {
    drawMate(ctx, mate);
  }

  const body = heroSprite(appearance);
  drawSprite(ctx, body, hub.x, hub.y, Math.cos(hub.facing) < 0, 1.2);
  ctx.restore();

  if (near) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `bold 16px ${MONO}`;
    ctx.fillStyle = "#e8eef7";
    ctx.fillText(`[E] ${near.label}`, viewW / 2, viewH - 36);
    ctx.restore();
  }
}

/** Another player on the ship: their character, their name, and a tick once they've
 *  stepped into the party portal. */
function drawMate(ctx: CanvasRenderingContext2D, mate: HubMate): void {
  if (mate.appearance) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    drawSprite(ctx, heroSprite(mate.appearance), mate.x, mate.y, Math.cos(mate.facing) < 0, 1.2);
    ctx.restore();
  }
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `bold 9px ${MONO}`;
  ctx.fillStyle = mate.ready ? "#4ade80" : "#9aa4b2";
  ctx.fillText(`${mate.ready ? "\u2713 " : ""}${mate.name.toUpperCase()}`, mate.x, mate.y - 26);
  ctx.restore();
}

function drawDeck(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#12141c";
  ctx.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);

  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= HUB_WIDTH; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, HUB_HEIGHT); }
  for (let y = 0; y <= HUB_HEIGHT; y += 40) { ctx.moveTo(0, y); ctx.lineTo(HUB_WIDTH, y); }
  ctx.stroke();

  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 12;
  ctx.strokeRect(3, 3, HUB_WIDTH - 6, HUB_HEIGHT - 6);
  ctx.strokeStyle = "rgba(125,211,252,0.3)";
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, HUB_WIDTH - 12, HUB_HEIGHT - 12);
}

function drawStation(ctx: CanvasRenderingContext2D, s: HubStation, time: number, active: boolean): void {
  const color = STATION_COLORS[s.kind];
  if (PORTAL_KINDS.has(s.kind)) {
    drawPortalGlyph(ctx, s.x, s.y, time, color, 1);
  } else {
    drawTerminal(ctx, s.x, s.y, color, time);
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `bold 10px ${MONO}`;
  ctx.fillStyle = active ? "#ffffff" : "#9aa4b2";
  ctx.fillText(s.label.toUpperCase(), s.x, s.y + s.radius + 22);
  if (active) {
    ctx.globalAlpha = 0.55 + Math.sin(time * 6) * 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius + 15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** A terminal: a dark console with a lit, flickering screen. Used for the star map,
 *  the forge and the quartermaster — the "walk up and interact with a menu" stations. */
function drawTerminal(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, time: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x, y + 20, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1c2029";
  ctx.fillRect(x - 15, y - 18, 30, 32);
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 15, y - 18, 30, 32);

  ctx.globalAlpha = 0.55 + Math.sin(time * 3) * 0.25;
  ctx.fillStyle = color;
  ctx.fillRect(x - 11, y - 14, 22, 15);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#0c0e14";
  ctx.fillRect(x - 10, y + 5, 20, 3);
  ctx.fillRect(x - 4, y + 8, 8, 9);
  ctx.fillRect(x - 12, y + 17, 24, 4);
  ctx.restore();
}
