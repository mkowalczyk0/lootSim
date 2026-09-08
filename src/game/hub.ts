/**
 * The ship: a small explorable hub, not a menu. Every non-combat system in the game is
 * reached by walking up to something here and pressing confirm, Diablo-portal style —
 * the delve and each rift stand as permanent portals, the Reliquary Gate spawns a portal
 * for whichever Ashen Reliquary sector run you've configured, and the forge and the
 * quartermaster are their own stations. Everything else about managing a character
 * (stash, equipment, skills, the tree, style, capsules, records, settings) still lives
 * in the DOM town screen — CLAUDE.md's own rule that menu-heavy UI belongs there, not
 * on a canvas, hasn't changed; only how you *reach* it has.
 *
 * Pure simulation, same as `game/dungeon.ts` and `game/level.ts` — no DOM, so it can be
 * driven headlessly by the smoke test exactly like a dive can.
 */

import type { Input } from "../core/input";
import { clamp } from "../core/math";
import type { Appearance } from "../data/cosmetics";

export type HubStationKind =
  | "dive" | "abyss" | "hoard" | "starmap" | "expedition" | "forge" | "quartermaster"
  | "comms" | "party";

export interface HubStation {
  readonly kind: HubStationKind;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** Somebody else's ship, seen through the comms relay: where they are and whether
 *  they're standing in the party portal yet. Drawn, never simulated. */
export interface HubMate {
  readonly id: string;
  readonly name: string;
  x: number;
  y: number;
  facing: number;
  ready: boolean;
  /** Their character's look, so the party is four distinct people rather than four dots. */
  appearance: Appearance | null;
}

export const HUB_WIDTH = 640;
export const HUB_HEIGHT = 460;

const PLAYER_SPEED = 150;
export const HUB_PLAYER_RADIUS = 9;
/** How close counts as "at" a station — generous, since there's nothing to dodge here. */
const INTERACT_RANGE = 34;

// Positions are tuned against the Citadel deck art (render/atlas/scenes/hub.citadel-deck):
// the Delve and the two rifts are portal pads on the open flagstone, the Abyssal Rift
// sits in the deck's central archway, and the four relic stations tuck against the walls
// clear of the deck's own rubble. See render/hub.ts for how each is drawn.
const FIXED_STATIONS: readonly HubStation[] = [
  { kind: "dive", label: "The Delve", x: 120, y: 150, radius: 24 },
  { kind: "abyss", label: "Abyssal Rift", x: 320, y: 62, radius: 24 },
  { kind: "hoard", label: "Hoard Rift", x: 420, y: 150, radius: 24 },
  { kind: "starmap", label: "Reliquary Gate", x: 587, y: 200, radius: 20 },
  { kind: "forge", label: "The Forge", x: 580, y: 393, radius: 20 },
  { kind: "quartermaster", label: "Quartermaster", x: 425, y: 283, radius: 20 },
  { kind: "comms", label: "Comms Relay", x: 213, y: 200, radius: 20 },
];

/** Where a chosen sector's portal stands once the Reliquary Gate has picked one — open
 *  floor left of the central seal. */
const EXPEDITION_SPOT = { x: 270, y: 250 };
/** Where the party portal opens once you're in a room. Near the spawn on purpose —
 *  "everyone walk into the portal" should be a two second walk, not a hike. */
const PARTY_SPOT = { x: 185, y: 388 };
/** Standing this close to the party portal counts as being in it. */
const PARTY_PORTAL_RADIUS = 30;

export class Hub {
  x = HUB_WIDTH / 2;
  y = HUB_HEIGHT - 40;
  facing = -Math.PI / 2;
  /** Set by the Reliquary Gate; walking into the portal this spawns launches the run. */
  expedition: { planetId: string; tier: number } | null = null;
  /** True while a party room is open, which is what puts the party portal on the deck. */
  partyOpen = false;
  /** Everyone else in the room, walking around their own copy of this same deck. */
  mates: HubMate[] = [];

  get stations(): readonly HubStation[] {
    const stations = [...FIXED_STATIONS];
    if (this.expedition) {
      stations.push({
        kind: "expedition", label: "Reliquary Portal",
        x: EXPEDITION_SPOT.x, y: EXPEDITION_SPOT.y, radius: 22,
      });
    }
    if (this.partyOpen) {
      stations.push({
        kind: "party", label: "Party Portal",
        x: PARTY_SPOT.x, y: PARTY_SPOT.y, radius: 24,
      });
    }
    return stations;
  }

  /**
   * Whether the local player is standing in the party portal. This is the whole "ready
   * up" mechanic: there is no ready button, you walk into the portal, and the run starts
   * when everybody has. Pressing confirm is never involved, so nobody can start a run
   * for a friend who wandered off to the stash.
   */
  get inPartyPortal(): boolean {
    if (!this.partyOpen) return false;
    return Math.hypot(this.x - PARTY_SPOT.x, this.y - PARTY_SPOT.y) <= PARTY_PORTAL_RADIUS;
  }

  /** Where the party portal stands, for the renderer's benefit. */
  static get partySpot(): { x: number; y: number } {
    return PARTY_SPOT;
  }

  /** The station close enough to interact with right now, or null. */
  nearStation(): HubStation | null {
    for (const s of this.stations) {
      if (Math.hypot(this.x - s.x, this.y - s.y) <= s.radius + HUB_PLAYER_RADIUS + INTERACT_RANGE) return s;
    }
    return null;
  }

  update(dt: number, input: Input): void {
    const move = input.moveVector();
    if (move.x !== 0 || move.y !== 0) this.facing = Math.atan2(move.y, move.x);
    this.x = clamp(this.x + move.x * PLAYER_SPEED * dt, HUB_PLAYER_RADIUS + 20, HUB_WIDTH - HUB_PLAYER_RADIUS - 20);
    this.y = clamp(this.y + move.y * PLAYER_SPEED * dt, HUB_PLAYER_RADIUS + 20, HUB_HEIGHT - HUB_PLAYER_RADIUS - 20);
  }

  setExpedition(planetId: string, tier: number): void {
    this.expedition = { planetId, tier };
  }

  clearExpedition(): void {
    this.expedition = null;
  }
}
