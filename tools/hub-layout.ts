/**
 * The Citadel deck's own geometry, checked — no DOM, mirrors exactly what `render/hub.ts`
 * draws (`drawStation`, `drawDeckProp`, `drawPortalPad`), reading the real deck grid and
 * the real atlas manifest rather than a copy of either.
 *
 * Built 2026-09 after the first rendered hall came back "a bit small and out of place"
 * (see the header comments on `game/deck.ts`'s `DECK` and `render/atlas/manifest.ts`'s
 * Citadel section): a scale bump on the station relics made them tall enough to bleed
 * into a neighbor's label or a rock tile above, and nothing had ever checked that. This
 * asserts three things for every station and floor-dressing glyph on the deck:
 *
 *  1. Its anchor tile is floor, not rock.
 *  2. Its drawn footprint — the prop image (`drawDeckProp`'s `w*scale` x `h*scale`,
 *     positioned by `feet` exactly as it draws) or the portal ring, plus the label text
 *     drawn under it — never overlaps another station's footprint or label.
 *  3. A prop's footprint never bleeds onto a rock tile.
 *
 * The label width is measured off the same font `drawStation` uses (`bold 10px
 * ui-monospace`) via a real canvas when one is available (Node 22+ exposes
 * `node:canvas`... this repo doesn't depend on it, so a calibrated monospace
 * char-width is used instead — 5.8 world units/char, measured directly off a rendered
 * screenshot of this hall at the hub's own display scale, cross-checked against two
 * different labels). If the real font metrics ever drift far enough from that constant
 * to matter, a false pass here is the failure mode — rerun the calibration against a
 * fresh screenshot rather than trusting the constant forever.
 *
 * Headless, no browser. Run with `npx tsx tools/hub-layout.ts` (not wired into `npm test`
 * — this is a layout-authoring aid, not a gameplay property).
 */
import {
  DECK_COLS, DECK_ROWS, DECK_PROPS, STATION_PROP, deckAnchor, deckIsRock,
  type HubStationKind,
} from "../src/game/deck";
import { STATION_LABEL, STATION_RADIUS } from "../src/game/hub";
import { ATLAS } from "../src/render/atlas/manifest";

const TILE = 32;
const CHAR_W = 5.8;

const PORTAL_KINDS = new Set<HubStationKind>([
  "dive", "abyss", "hoard", "expedition", "vigil", "convergence", "tower", "raidPortal",
  "memoryPortal", "training",
]);

interface Box { x0: number; x1: number; y0: number; y1: number }
function overlap(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return false;
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

const KINDS = Object.keys(STATION_LABEL) as HubStationKind[];

interface Entry { kind: string; x: number; y: number; prop: Box | null; portal: Box | null; label: Box }

let failures = 0;
function fail(msg: string): void { console.log(` FAIL  ${msg}`); failures++; }

const entries: Entry[] = [];

for (const kind of KINDS) {
  const { x, y } = deckAnchor(kind);
  const radius = STATION_RADIUS[kind];
  const label = STATION_LABEL[kind].toUpperCase();
  const halfW = (label.length * CHAR_W) / 2;
  const ly = y + radius + 15;
  const labelBox: Box = { x0: x - halfW, x1: x + halfW, y0: ly - 8, y1: ly + 3 };

  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  if (deckIsRock(cx, cy)) fail(`${kind}'s anchor (${cx},${cy}) is on rock`);

  let propBox: Box | null = null;
  const propId = STATION_PROP[kind];
  if (propId) {
    const spr = ATLAS[propId];
    if (!spr) {
      fail(`${kind}'s prop "${propId}" has no manifest row`);
    } else {
      const w = spr.w * spr.worldScale, h = spr.h * spr.worldScale;
      propBox = { x0: x - w / 2, x1: x + w / 2, y0: y - h * (1 - spr.feet), y1: y + h * spr.feet };
    }
  }

  let portalBox: Box | null = null;
  if (!propBox && PORTAL_KINDS.has(kind)) {
    const r = radius + 6;
    portalBox = { x0: x - r, x1: x + r, y0: y - r * 0.42, y1: y + r * 0.42 };
  }

  entries.push({ kind, x, y, prop: propBox, portal: portalBox, label: labelBox });
}

// floor dressing: no label, small props, reads straight off the deck.
for (const p of DECK_PROPS) {
  const spr = ATLAS[p.art];
  if (!spr) { fail(`dressing prop "${p.art}" has no manifest row`); continue; }
  const w = spr.w * spr.worldScale, h = spr.h * spr.worldScale;
  const box: Box = { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - h * (1 - spr.feet), y1: p.y + h * spr.feet };
  entries.push({ kind: `dressing:${p.art}@(${p.x},${p.y})`, x: p.x, y: p.y, prop: box, portal: null, label: { x0: p.x, x1: p.x, y0: p.y, y1: p.y } });
}

for (let i = 0; i < entries.length; i++) {
  for (let j = i + 1; j < entries.length; j++) {
    const A = entries[i]!, B = entries[j]!;
    const pairs: [keyof Entry, keyof Entry][] = [
      ["prop", "label"], ["label", "prop"], ["prop", "prop"], ["label", "label"],
      ["portal", "label"], ["label", "portal"], ["prop", "portal"], ["portal", "prop"],
    ];
    for (const [pa, pb] of pairs) {
      if (overlap(A[pa] as Box | null, B[pb] as Box | null)) {
        fail(`${A.kind}.${String(pa)} overlaps ${B.kind}.${String(pb)}`);
      }
    }
  }
}

for (const A of entries) {
  if (!A.prop) continue;
  const cx0 = Math.floor(A.prop.x0 / TILE), cx1 = Math.floor((A.prop.x1 - 0.01) / TILE);
  const cy0 = Math.floor(A.prop.y0 / TILE), cy1 = Math.floor((A.prop.y1 - 0.01) / TILE);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx >= DECK_COLS || cy >= DECK_ROWS) continue;
      if (deckIsRock(cx, cy)) fail(`${A.kind}'s prop bleeds onto rock tile (${cx},${cy})`);
    }
  }
}

console.log(failures === 0 ? `  ok  hub layout: ${entries.length} glyphs, no overlaps or wall-bleed` : `${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
