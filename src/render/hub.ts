/**
 * Draws the Citadel of the Threshold — the hub deck. A small fixed space, so unlike the
 * dungeon it never scrolls: the whole hall is scaled to fit the viewport and drawn once.
 *
 * The hall and its stations are **one baked image** (`hub.citadel-deck`, §4): the Forge
 * furnace, the Reliquary Gate doorway, the Comms shrine and the Quartermaster's rack are
 * painted into it as relics from dead civilisations, at the deck's own pixel pitch, so
 * nothing is composited at runtime and nothing reads as pasted on. This module only adds
 * what has to move: an animated summoning ring over each portal point, and the hero and
 * co-op mates. A station is just an `{x, y, radius}` hotspot on that image.
 */

import type { Appearance } from "../data/cosmetics";
import { DEFAULT_KEYBINDS, keyLabel, type Settings } from "../data/settings";
import { drawPortalGlyph, drawSprite } from "./draw";
import {
  HUB_HEIGHT, HUB_WIDTH, stationLore, type Hub, type HubMate, type HubStation, type HubStationKind,
} from "../game/hub";
import { atlasCanvas } from "./atlas/index";
import { heroSprite } from "./sprites";

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const STATION_COLORS: Record<HubStationKind, string> = {
  dive: "#7dd3fc", abyss: "#ff1493", hoard: "#fbbf24", expedition: "#4ade80",
  starmap: "#a855f7", forge: "#fb923c", quartermaster: "#38bdf8",
  comms: "#22d3ee", vigil: "#c084fc", convergence: "#dc2626",
  // Bone-gold, the Heaven base tone from art-style-guide §6 — the one warm ring on the
  // deck, and the only one that reads as light rather than as a wound.
  tower: "#d8cfa8",
  // The raid pair (UAT §15) share `MODES.raid.color`: the terminal that picks one and the
  // portal it opens are the same door, and the deck should say so without a legend.
  warTable: "#f472b6", raidPortal: "#f472b6",
  // The Memory pair share theirs for the same reason. Cyan is the one colour on the deck
  // that is neither Heaven's gold nor a wound: a Memory is a place being held still
  // rather than a place being torn open.
  altar: "#67e8f9", memoryPortal: "#67e8f9",
};

/** The kinds you step *into* — a turning summoning ring is drawn over the deck for these.
 *  Everything else is a relic already painted into the deck image. */
const PORTAL_KINDS = new Set<HubStationKind>([
  "dive", "abyss", "hoard", "expedition", "vigil", "convergence", "tower", "raidPortal",
  "memoryPortal",
]);
/**
 * Terminals the Citadel deck art does *not* have painted into it, so they draw their own
 * relic on top of the deck rather than only when the image is missing.
 *
 * The four original stations (Comms, Quartermaster, Reliquary Gate, Forge) are baked into
 * `hub.citadel-deck` — see the coordinate note in `game/hub.ts`. The War Table (UAT §15)
 * and the Altar both arrived after that bake, so until an art pass paints them in they are
 * drawn terminals. That is the honest state, not a placeholder somebody forgot: the
 * alternative is a floating caption with nothing underneath it.
 */
const UNPAINTED_KINDS = new Set<HubStationKind>(["warTable", "altar"]);
const PARTY_COLOR = "#22d3ee";

/** A person's drawn height on the deck, in hub units — cosmetic and local to this scene.
 *  The dungeon sizes the same sprite by its manifest `worldScale` instead. */
const HUB_FIGURE_H = 74;

function figureScale(canvas: HTMLCanvasElement): number {
  return Math.min(2.4, HUB_FIGURE_H / canvas.height);
}

/** Longest a lore line under the prompt may run, as a fraction of the viewport. */
const LORE_WIDTH = 0.6;
const LORE_LINE_H = 14;

/** Greedy word wrap against the canvas's own measurement, so the line fits at any width. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderHub(
  ctx: CanvasRenderingContext2D, hub: Hub, appearance: Appearance, settings: Settings,
  viewW: number, viewH: number,
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

  const deckLoaded = drawDeck(ctx);
  for (const s of hub.stations) drawStation(ctx, s, time, s === near, deckLoaded);
  // The party's portal (UAT §1 D1): whichever one the host picked gets a wide pulsing
  // ring, so "everyone walk into it" has an obvious "it".
  const target = hub.partyStation;
  if (target) drawPartyRing(ctx, target, time, hub.partyReady);

  // Everyone else in the room is walking around their own copy of this deck; their
  // positions arrive over the relay a dozen times a second and are drawn here.
  for (const mate of hub.mates) {
    drawMate(ctx, mate);
  }

  const body = heroSprite(appearance);
  const bscale = figureScale(body.canvas);
  deckShadow(ctx, hub.x, hub.y, body.canvas.width * bscale * 0.5);
  drawSprite(ctx, body.canvas, hub.x, hub.y, Math.cos(hub.facing) < 0, bscale, body.feet);
  ctx.restore();

  if (near) {
    // The prompt reads the live confirm binding, the same rule `combatHints` follows —
    // it used to say "[E]" whatever the player had rebound it to.
    const confirm = keyLabel(settings.keybinds.confirm ?? DEFAULT_KEYBINDS.confirm);
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `bold 16px ${MONO}`;
    ctx.fillStyle = "#e8eef7";
    ctx.fillText(`[${confirm}] ${near.label}`, viewW / 2, viewH - 36);
    // What the place is, not just what it is called (UAT §22) — a portal's lore line,
    // dim, above the prompt. The non-portal stations have none and draw nothing.
    const lore = stationLore(near.kind);
    if (lore) {
      ctx.font = `11px ${MONO}`;
      ctx.fillStyle = "rgba(232,238,247,0.62)";
      const lines = wrapText(ctx, lore, viewW * LORE_WIDTH);
      const top = viewH - 58 - (lines.length - 1) * LORE_LINE_H;
      lines.forEach((l, i) => ctx.fillText(l, viewW / 2, top + i * LORE_LINE_H));
    }
    ctx.restore();
  }
  if (hub.partyOpen) {
    // What the room is waiting on, in one line: the host picking, or everybody walking.
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `bold 11px ${MONO}`;
    ctx.fillStyle = PARTY_COLOR;
    const ready = hub.mates.filter((m) => m.ready).length + (hub.partyReady ? 1 : 0);
    const text = !target
      ? hub.partyHost
        ? "PARTY — walk into a portal and confirm it to pick the party's run"
        : "PARTY — waiting for the host to pick a portal"
      : `PARTY — ${target.label}: ${ready}/${hub.mates.length + 1} in the portal`;
    ctx.fillText(text, viewW / 2, 26);
    ctx.restore();
  }
}

/** The chosen portal's halo: cyan, breathing, and a shade brighter once you're in it. */
function drawPartyRing(ctx: CanvasRenderingContext2D, s: HubStation, time: number, inIt: boolean): void {
  ctx.save();
  ctx.globalAlpha = (inIt ? 0.75 : 0.45) + Math.sin(time * 3) * 0.15;
  ctx.strokeStyle = PARTY_COLOR;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 5]);
  ctx.lineDashOffset = -time * 20;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.radius + 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Another player on the ship: their character, their name, and a tick once they've
 *  stepped into the party portal. */
function drawMate(ctx: CanvasRenderingContext2D, mate: HubMate): void {
  if (mate.appearance) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    const mb = heroSprite(mate.appearance);
    const ms = figureScale(mb.canvas);
    deckShadow(ctx, mate.x, mate.y, mb.canvas.width * ms * 0.5);
    drawSprite(ctx, mb.canvas, mate.x, mate.y, Math.cos(mate.facing) < 0, ms, mb.feet);
    ctx.restore();
  }
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `bold 9px ${MONO}`;
  ctx.fillStyle = mate.ready ? "#4ade80" : "#9aa4b2";
  ctx.fillText(`${mate.ready ? "✓ " : ""}${mate.name.toUpperCase()}`, mate.x, mate.y - 26);
  ctx.restore();
}

/**
 * The Citadel deck (§4) — the whole hall with its stations, baked. Stretched to fill the
 * fixed hub viewport. Returns whether the image was actually there; a plain ash fill
 * stands in for the first frames, and the stations draw a marker until it loads.
 */
function drawDeck(ctx: CanvasRenderingContext2D): boolean {
  const deck = atlasCanvas("hub.citadel-deck");
  if (deck) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(deck, 0, 0, HUB_WIDTH, HUB_HEIGHT);
  } else {
    ctx.fillStyle = "#2a2733";
    ctx.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);
  }

  // A thin dark vignette frame so the deck reads as an enclosed hall at any viewport size.
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 8;
  ctx.strokeRect(2, 2, HUB_WIDTH - 4, HUB_HEIGHT - 4);
  return !!deck;
}

function drawStation(
  ctx: CanvasRenderingContext2D, s: HubStation, time: number, active: boolean, deckLoaded: boolean,
): void {
  const color = STATION_COLORS[s.kind];

  if (PORTAL_KINDS.has(s.kind)) {
    drawPortalPad(ctx, s, color, time);
  } else if (!deckLoaded || UNPAINTED_KINDS.has(s.kind)) {
    // The relic lives in the deck image; if that hasn't loaded — or was never painted —
    // leave a marker so the station isn't just a floating word.
    deckShadow(ctx, s.x, s.y, s.radius * 1.1);
    drawTerminal(ctx, s.x, s.y, color, time);
  }

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `bold 10px ${MONO}`;
  ctx.fillStyle = active ? "#ffffff" : "rgba(232,238,247,0.82)";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 3;
  ctx.fillText(s.label.toUpperCase(), s.x, s.y + s.radius + 15);
  if (active) {
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.55 + Math.sin(time * 6) * 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.radius + 15, (s.radius + 15) * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A portal: a ring inscribed in the flagstone with the shared summoning glyph turning
 * above it. Grounded in the floor on purpose — a portal you can walk into should read as
 * part of the hall, not a decal floating over it.
 */
function drawPortalPad(
  ctx: CanvasRenderingContext2D, s: HubStation, color: string, time: number,
): void {
  const r = s.radius + 6;
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.38 + Math.sin(time * 2 + s.x) * 0.1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(s.x, s.y, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  portalBloom(ctx, s.x, s.y, color, 0.28);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.scale(0.62, 0.62);
  drawPortalGlyph(ctx, 0, 0, time, color, 1);
  ctx.restore();
}

/** Soft contact shadow so a person sits on the flagstone rather than over it. */
function deckShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number): void {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A bloom of a portal's colour rising off the ring — the light before the glyph. */
function portalBloom(
  ctx: CanvasRenderingContext2D, x: number, y: number, color: string, strength: number,
): void {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, 36);
  grad.addColorStop(0, color);
  grad.addColorStop(1, color + "00");
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Fallback marker for a relic station in the frames before the deck image loads. */
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
  ctx.restore();
}
