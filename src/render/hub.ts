/**
 * Draws the Citadel of the Threshold — the hub deck. A small fixed space, so unlike the
 * dungeon it never scrolls: the whole hall is scaled to fit the viewport and drawn once.
 *
 * The hall is authored on the tile lattice (`game/deck.ts`) exactly like a dungeon floor,
 * and its floor is drawn the same three ways a floor is, in this order:
 *
 * 1. **Stamped** from a corner-Wang tileset by the dungeon's own `paintTilemap` —
 *    `tiles.citadel`, ash-black flagstone under pale bone-white collage masonry, on the
 *    same Tower-biome precedent (named, absent from `TILESETS`, then wired the moment the
 *    PNG lands with no other code change) the comment here used to describe as future work.
 * 2. **The painted scene** (`hub.citadel-deck`, §4), stretched over the hall. That image
 *    has the Forge furnace, the Reliquary Gate doorway, the Comms shrine and the
 *    Quartermaster's rack painted into it as relics, which is why those four don't draw a
 *    terminal while it's showing. It also paints the hall's outer wall, so only the walls
 *    authored *inside* the ring are drawn over it.
 * 3. **A flat bake** — ash floor, drawn wall blocks — for the frames before either loads.
 *
 * Either way the floor is baked once into an offscreen canvas and blitted; this module
 * only adds per-frame what has to move: a summoning ring over each portal, and the hero
 * and the co-op mates. A station is an `{x, y, radius}` sitting on its anchor tile.
 */

import type { Appearance } from "../data/cosmetics";
import { DEFAULT_KEYBINDS, keyLabel, type Settings } from "../data/settings";
import { drawPortalGlyph, drawSprite } from "./draw";
import {
  HUB_HEIGHT, HUB_WIDTH, stationLore, type Hub, type HubMate, type HubStation, type HubStationKind,
} from "../game/hub";
import { atlasCanvas, atlasTileset } from "./atlas/index";
import { ATLAS } from "./atlas/manifest";
import {
  DECK_INTERIOR_WALLS, DECK_PROPS, DECK_SPACE, DECK_WALLS, PAINTED_HALL_WIDTH, STATION_PROP,
} from "../game/deck";
import type { Wall } from "../game/level";
import { gradedTileset, paintTilemap } from "./tilemap";
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
  // Deliberately unassuming: every other colour on this deck means something about the
  // war. The dummy isn't part of it, and its ring shouldn't read as if it were.
  training: "#94a3b8",
};

/** The kinds you step *into* — a turning summoning ring is drawn over the deck for these.
 *  Everything else is a relic already painted into the deck image. */
const PORTAL_KINDS = new Set<HubStationKind>([
  "dive", "abyss", "hoard", "expedition", "vigil", "convergence", "tower", "raidPortal",
  "memoryPortal", "training",
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
/** Note this only means anything while the *painted* scene is what's showing. A stamped
 *  floor has no relics in it at all, so on that ladder rung every terminal draws itself. */

/**
 * A committed prop, or null. Tests `atlasCanvas` rather than manifest membership, the same
 * rule `monsterSprite` follows: a manifest row is a statement of intent and a loaded canvas
 * is a fact.
 */
function deckArt(id: string | null): HTMLCanvasElement | null {
  return id ? atlasCanvas(id) : null;
}

/**
 * Draws one committed prop standing on the floor at `(x, y)`.
 *
 * A pipeline prop carries its own `worldScale` and `feet` in the manifest, exactly as the
 * dungeon's dressing does, so a relic keeps its authored footprint instead of being scaled
 * to whatever its PNG happens to be — the same reason `drawProps` reads them.
 */
function drawDeckProp(ctx: CanvasRenderingContext2D, id: string, x: number, y: number): boolean {
  const png = atlasCanvas(id);
  if (!png) return false;
  const scale = ATLAS[id]?.worldScale ?? 1;
  const feet = ATLAS[id]?.feet ?? 0.12;
  const w = png.width * scale;
  const h = png.height * scale;
  deckShadow(ctx, x, y, Math.max(6, w * 0.42));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(png, Math.round(x - w / 2), Math.round(y - h * (1 - feet)), Math.round(w), Math.round(h));
  return true;
}

/**
 * The hall's floor dressing (`DECK_DRESSING` in `game/deck.ts`) — braziers, rubble, the
 * standing relics that make the Threshold a place rather than a floor.
 *
 * This is where the room's character has to come from. `npm run smoke` holds a tileset's
 * tiles to ±14 internal luminance spread, because a busy floor stops reading as
 * walkable-vs-not at game zoom — so the dressing cannot live in the stone, and lives here.
 * Nothing here is committed yet, so today every one of these silently draws nothing.
 */
function drawDeckDressing(ctx: CanvasRenderingContext2D): void {
  for (const p of DECK_PROPS) drawDeckProp(ctx, p.art, p.x, p.y);
}
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

  const look = drawDeck(ctx);
  // Compared by *kind*, not by identity: `hub.stations` builds its list fresh on every
  // read, so the object `nearStation()` returned is never the same object this loop is
  // holding. It used to be for the eight permanent stations (they came out of a shared
  // constant array) and never for the conditional portals — which is why the Vigil, the
  // Tower and the rest have never lit up when you walked to them.
  // Dressing first: it is scenery, and a station or a person standing in front of a
  // brazier should occlude it rather than the other way round.
  drawDeckDressing(ctx);
  for (const s of hub.stations) drawStation(ctx, s, time, s.kind === near?.kind, look);
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
 * The Citadel's own corner-Wang floor sheet. Reserved, and deliberately **not** listed in
 * `TILESETS` until its PNG is committed: `npm run smoke` decodes every declared sheet off
 * disk, so naming art the repo doesn't have is a failing test rather than a TODO. The
 * Tower's biomes set the same precedent. `atlasTileset` returns null for it today and the
 * deck falls back — see the module header for the ladder.
 *
 * **The row to add, the day the PNG and its baked JSON land together:**
 *
 * ```ts
 * "tiles.citadel": { id: "tiles.citadel", w: 64, h: 64, tile: 16 },
 * ```
 *
 * Nothing else changes — `bakeDeck` promotes the hall to the tiled rung on its own the
 * first frame `atlasTileset` returns something. The pitch is not a choice: 16 texels across
 * a 32-unit cell is the 2.0 world-units-per-art-pixel anchor every other sheet in the game
 * shares (`docs/art-style-guide.md` §17.7).
 */
const DECK_TILESET = "tiles.citadel";

/** Purgatory/Citadel from the art guide's palette table (§2): ash floor, ink shadow, and
 *  a stone a shade above the floor so walkable and solid read apart before anything else. */
const DECK_TINT = "#3d3a47";
const DECK_FLOOR_ALT = "#443f52";
const DECK_WALL = "#4a4657";
const DECK_WALL_SIDE = "#2a2733";

/** Which of the three ways the floor came out — the stations need to know, because the
 *  painted scene is the only one with relics already in it. */
type DeckLook = "tiled" | "painted" | "flat";

let deckCanvas: HTMLCanvasElement | null = null;
let deckLook: DeckLook = "flat";
let deckKey = "";

/**
 * Bakes the hall once. The atlas loads asynchronously, so the bake is keyed on *what was
 * available* and redone the single time that changes — the first frames are the flat bake
 * and everything after is the real thing.
 */
function bakeDeck(): { canvas: HTMLCanvasElement; look: DeckLook } {
  const ts = atlasTileset(DECK_TILESET);
  const scene = atlasCanvas("hub.citadel-deck");
  const key = `${ts ? "t" : "-"}${scene ? "s" : "-"}`;
  if (deckCanvas && key === deckKey) return { canvas: deckCanvas, look: deckLook };

  const canvas = document.createElement("canvas");
  canvas.width = HUB_WIDTH;
  canvas.height = HUB_HEIGHT;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  // The floor tone behind everything, so a half-transparent tile edge reads as dim stone
  // rather than a hole to the void — the same reason `bakeFloor` does it.
  c.fillStyle = DECK_TINT;
  c.fillRect(0, 0, HUB_WIDTH, HUB_HEIGHT);

  let look: DeckLook = "flat";
  if (ts && paintTilemap(c, DECK_SPACE, gradedTileset(DECK_TILESET, ts, DECK_TINT))) {
    // Stamped from real stone, walls and all — nothing left to draw.
    look = "tiled";
  } else if (scene) {
    // The build-tester room sits past the width the painting was authored for — flat-
    // bake that strip first (the look the whole hall has before any art loads) and then
    // stretch the painting over only the width it actually covers, or the room's own
    // walls and floor would be squeezed into a relic that was never drawn for them.
    flatDeck(c);
    c.drawImage(scene, 0, 0, PAINTED_HALL_WIDTH, HUB_HEIGHT);
    // The painting already shows the hall's outer wall. Anything authored inside the ring
    // is not in it and has to be drawn, or it would be an invisible obstacle — and so is
    // every wall east of the painting, room included.
    drawDeckWalls(c, DECK_INTERIOR_WALLS);
    drawDeckWalls(c, DECK_WALLS.filter((w) => w.x >= PAINTED_HALL_WIDTH));
    look = "painted";
  } else {
    flatDeck(c);
    drawDeckWalls(c, DECK_WALLS);
  }

  deckCanvas = canvas;
  deckLook = look;
  deckKey = key;
  return { canvas, look };
}

/** Blits the baked hall and frames it. Returns how it was drawn. */
function drawDeck(ctx: CanvasRenderingContext2D): DeckLook {
  const { canvas, look } = bakeDeck();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0);

  // A thin dark vignette frame so the deck reads as an enclosed hall at any viewport size.
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 8;
  ctx.strokeRect(2, 2, HUB_WIDTH - 4, HUB_HEIGHT - 4);
  return look;
}

/** Ash flagstone with a scatter of darker tiles, for the frames before anything loads.
 *  Deterministic, so the hall doesn't shimmer if it is ever re-baked. */
function flatDeck(ctx: CanvasRenderingContext2D): void {
  let hash = DECK_SPACE.seed >>> 0;
  const rand = (): number => {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return hash / 4294967296;
  };
  ctx.fillStyle = DECK_FLOOR_ALT;
  for (let y = 0; y < HUB_HEIGHT; y += 24) {
    for (let x = 0; x < HUB_WIDTH; x += 24) {
      if (rand() < 0.22) ctx.fillRect(x, y, 24, 24);
    }
  }
}

/** Wall blocks, drawn the way the dungeon draws them (`drawWalls` in `render/draw.ts`) —
 *  a lit top face over a darker side, so a slab reads as having height. */
function drawDeckWalls(ctx: CanvasRenderingContext2D, walls: readonly Wall[]): void {
  for (const w of walls) {
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(w.x + 4, w.y + 6, w.w, w.h);
    ctx.fillStyle = DECK_WALL_SIDE;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = DECK_WALL;
    ctx.fillRect(w.x, w.y, w.w, Math.max(4, w.h - 7));
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fillRect(w.x, w.y, w.w, 2);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 1;
    ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
  }
}

function drawStation(
  ctx: CanvasRenderingContext2D, s: HubStation, time: number, active: boolean, look: DeckLook,
): void {
  const color = STATION_COLORS[s.kind];

  // A committed prop outranks everything: it is the actual relic, and it is what the
  // painted scene had baked in. Drawn on any rung — a real Forge on the painted floor is
  // still better than the painting's, and this is what stops the tiled rung being six
  // identical terminals with different words under them.
  const propId = STATION_PROP[s.kind];
  if (propId && deckArt(propId) && drawDeckProp(ctx, propId, s.x, s.y)) {
    // Drawn — nothing else to put under this station.
  } else if (PORTAL_KINDS.has(s.kind)) {
    drawPortalPad(ctx, s, color, time);
  } else if (look !== "painted" || UNPAINTED_KINDS.has(s.kind)) {
    // The relic only exists inside the painted scene. On a stamped or flat floor there is
    // nothing under any of these, so every one of them draws its own — otherwise the
    // station is a floating word with nothing beneath it.
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

/** A terminal, drawn for any station the floor underneath doesn't already show as a
 *  relic — every non-portal station on a stamped or flat floor, and the two the painted
 *  deck never had. Salvaged-stone plinth, one lit face. */
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
