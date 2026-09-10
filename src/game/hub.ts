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
 *
 * **The hall itself is authored on the tile lattice** (`game/deck.ts`), the same 32-unit
 * grid every dungeon floor is built on. This file no longer knows where anything is: it
 * asks the deck for a station's anchor tile and resolves movement against the deck's
 * walls with the dungeon's own `resolveCircle`. Moving the Forge is editing one character
 * in `deck.ts`, and there is no second collision model to keep in step with the first.
 */

import type { Input } from "../core/input";
import type { Appearance } from "../data/cosmetics";
import { MODES, type RunModeId } from "../data/modes";
import {
  DECK_HEIGHT, DECK_SPACE, DECK_SPAWN, DECK_WIDTH, deckAnchor, type HubStationKind,
} from "./deck";
import { resolveCircle } from "./level";

export type { HubStationKind };

export interface HubStation {
  readonly kind: HubStationKind;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * Which run mode a station is the door to, so the deck can say what the place *is* (UAT
 * §22) rather than only what it is called. The Reliquary Gate configures a sector run
 * and so speaks for the same mode its portal does; the Forge, the Quartermaster and the
 * Comms Relay are not doors to the war and say nothing.
 */
const STATION_MODE: Record<HubStationKind, RunModeId | null> = {
  dive: "delve", abyss: "abyss", hoard: "hoard", starmap: "planet", expedition: "planet",
  vigil: "vigil", convergence: "convergence", tower: "tower",
  warTable: "raid", raidPortal: "raid",
  altar: "memory", memoryPortal: "memory",
  training: "training",
  forge: null, quartermaster: null, comms: null, trophyHall: null,
};

/** The one line of lore a station's prompt carries, or null for the non-portal stations. */
export function stationLore(kind: HubStationKind): string | null {
  const mode = STATION_MODE[kind];
  return mode ? MODES[mode].lore : null;
}

/** Somebody else's ship, seen through the comms relay: where they are and whether
 *  they're standing in the party's portal yet. Drawn, never simulated. */
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

/** The hall's world size, straight off the deck grid — 30 x 15 tiles now that the
 *  build-tester room extends it east. */
export const HUB_WIDTH = DECK_WIDTH;
export const HUB_HEIGHT = DECK_HEIGHT;

const PLAYER_SPEED = 150;
export const HUB_PLAYER_RADIUS = 9;
/** How close counts as "at" a station — generous, since there's nothing to dodge here. */
const INTERACT_RANGE = 34;

/**
 * What each station is called, and how big its footprint is. The two tables are
 * exhaustive over `HubStationKind`, so a new station is a label, a radius and a glyph in
 * `deck.ts` — never a coordinate measured off a painting.
 *
 * Radius is the station's own presence on the floor: a portal you step into is wider than
 * a terminal you walk up to, and the Delve and the two rifts are the widest because they
 * are the permanent doors the hall was built around.
 */
export const STATION_LABEL: Record<HubStationKind, string> = {
  dive: "The Delve", abyss: "Abyssal Rift", hoard: "Avarice Rift",
  starmap: "Reliquary Gate", expedition: "Reliquary Portal",
  forge: "The Forge", quartermaster: "Quartermaster", comms: "Comms Relay",
  warTable: "The War Table", raidPortal: "Raid Portal",
  altar: "The Altar", memoryPortal: "Memory Portal",
  tower: "The Tower", vigil: "The Vigil", convergence: "The Convergence",
  training: "Training Dummy", trophyHall: "The Trophy Hall",
};

export const STATION_RADIUS: Record<HubStationKind, number> = {
  dive: 24, abyss: 24, hoard: 24,
  starmap: 20, expedition: 22,
  forge: 20, quartermaster: 20, comms: 20,
  warTable: 20, raidPortal: 22,
  altar: 20, memoryPortal: 22,
  tower: 22, vigil: 22, convergence: 22,
  training: 18, trophyHall: 20,
};

/** A station, placed on its anchor tile. */
function station(kind: HubStationKind): HubStation {
  const at = deckAnchor(kind);
  return { kind, label: STATION_LABEL[kind], x: at.x, y: at.y, radius: STATION_RADIUS[kind] };
}

/** The stations that are always on the deck. Everything else is conditional — see
 *  `Hub.stations`, which is the one place that decides what is open right now. */
const ALWAYS_OPEN: readonly HubStationKind[] = [
  "dive", "abyss", "hoard", "starmap", "forge", "quartermaster", "comms", "warTable",
  "training", "trophyHall",
];

/** How far past a portal's own radius still counts as standing in it for the party
 *  ready check — generous, since four people have to fit. */
const READY_PAD = 12;

export class Hub {
  x = DECK_SPAWN.x;
  y = DECK_SPAWN.y;
  facing = -Math.PI / 2;
  /** Set by the Reliquary Gate; walking into the portal this spawns launches the run. */
  expedition: { planetId: string; tier: number } | null = null;
  /** Set by the War Table (UAT §15); walking into the portal this spawns launches the raid.
   *  Same lifetime as `expedition` — it does not survive a reload, and picking costs nothing. */
  raid: { raidId: string; tier: number } | null = null;
  /** At least one raid is open for this account, which is what puts the War Table's portal
   *  on the deck. Set from the account *frontier* (§21), so a climber reaches them too. */
  raidOpen = false;
  /**
   * Set by the Altar; walking into the portal this spawns spends the Memory and launches
   * the run. Same lifetime as `expedition` — a plan, not a commitment, and it does not
   * survive a reload. That is deliberate: the Memory is spent when the run *begins*, so
   * a page refresh costs nothing (`docs/memories.md` §7.4).
   */
  memoryPlan: { memoryId: string } | null = null;
  /** The Altar is open for the character currently loaded — both ladders banked to 30
   *  (`memoryUnlocked`). Per class, not per account, so switching characters can close
   *  it again; that is the gate meaning what it says. */
  altarOpen = false;
  /** The Tower is unlocked (UAT §21), which is what puts its portal on the deck. Set from
   *  the account's *depth* record, never the frontier: you earn the second direction by
   *  holding the first one. */
  towerOpen = false;
  /** The daily Vigil is unlocked (UAT §17), which is what puts its portal on the deck. */
  vigilOpen = false;
  /** The weekly Convergence is unlocked (UAT §17), which is what puts its portal on the
   *  deck. */
  weeklyOpen = false;
  /** True while a party room is open — the deck shows the room's state. */
  partyOpen = false;
  /** Whether this browser is the room's host, i.e. the one who picks the portal. */
  partyHost = false;
  /**
   * The portal the host has picked for the party (UAT §1 D1): the Delve, a rift, or the
   * expedition portal. Standing in *that* station is the ready signal — there is no
   * separate party portal. Null until the host has walked into one and confirmed.
   */
  partyTarget: HubStationKind | null = null;
  /**
   * Whether the local player currently *counts* as ready — set by `Party.syncHub`, which
   * is what draws the ring and the "n/m in the portal" line. Not the same thing as
   * `inPartyPortal`: readiness is an edge, not a level. After a floor ends everybody is
   * still standing exactly where they dove from, and a run that restarted itself off that
   * stale geometry is how "extract" once meant "start the Delve again, forever". You have
   * to step out of the portal and walk back in for it to count again.
   */
  partyReady = false;
  /** Everyone else in the room, walking around their own copy of this same deck. */
  mates: HubMate[] = [];

  get stations(): readonly HubStation[] {
    const open = [...ALWAYS_OPEN];
    if (this.expedition) open.push("expedition");
    if (this.raid && this.raidOpen) open.push("raidPortal");
    if (this.altarOpen) open.push("altar");
    if (this.memoryPlan) open.push("memoryPortal");
    if (this.towerOpen) open.push("tower");
    if (this.vigilOpen) open.push("vigil");
    if (this.weeklyOpen) open.push("convergence");
    return open.map(station);
  }

  /** The station the party dives from, if the host has picked one and it's on the deck. */
  get partyStation(): HubStation | null {
    if (!this.partyOpen || !this.partyTarget) return null;
    return this.stations.find((s) => s.kind === this.partyTarget) ?? null;
  }

  /**
   * Whether the local player is standing in the party's portal. This is the whole "ready
   * up" mechanic: there is no ready button, you walk into the portal the host picked, and
   * the run starts when everybody has. Pressing confirm is never involved, so nobody can
   * start a run for a friend who wandered off to the stash.
   */
  get inPartyPortal(): boolean {
    const s = this.partyStation;
    if (!s) return false;
    return Math.hypot(this.x - s.x, this.y - s.y) <= s.radius + HUB_PLAYER_RADIUS + READY_PAD;
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
    // The hall stops you with its walls, not with a rectangle drawn around the art. Same
    // resolver the dungeon uses on the same lattice, so a wall added to `deck.ts` is solid
    // the moment it is typed — and the stone you see is the stone you hit.
    const next = resolveCircle(
      DECK_SPACE,
      this.x + move.x * PLAYER_SPEED * dt,
      this.y + move.y * PLAYER_SPEED * dt,
      HUB_PLAYER_RADIUS,
    );
    this.x = next.x;
    this.y = next.y;
  }

  setExpedition(planetId: string, tier: number): void {
    this.expedition = { planetId, tier };
  }

  clearExpedition(): void {
    this.expedition = null;
  }

  setRaid(raidId: string, tier: number): void {
    this.raid = { raidId, tier };
  }

  clearRaid(): void {
    this.raid = null;
  }

  setMemory(memoryId: string): void {
    this.memoryPlan = { memoryId };
  }

  clearMemory(): void {
    this.memoryPlan = null;
  }
}
