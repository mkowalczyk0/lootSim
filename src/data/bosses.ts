/**
 * Raid bosses.
 *
 * A boss is not a fat monster. It is one enormous thing that does not care about your
 * knockback, cannot be beaten by standing on top of it, and runs a rotation of
 * telegraphed abilities that each ask a different question: get out, get in, get behind
 * something, kill the adds, stop attacking and move. Health is high enough that the
 * fight lasts — a minute or two — because a mechanic you only see once isn't a mechanic.
 *
 * Phases are the shape of the fight: as the health bar drops the boss picks up new
 * abilities, casts faster and starts summoning. The last phase should feel like the
 * room is closing in.
 *
 * Pure data. `game/boss.ts` executes this; nothing here knows what a canvas is.
 */

import type { Element } from "./elements";

export type BossAbilityId =
  | "slam" | "cleave" | "quake" | "ringOut" | "volley" | "summon" | "meteor" | "charge" | "beam"
  | "windmill" | "starLance" | "wall" | "backlash" | "corruption" | "enrage";

/** Shape of the danger zone the ability paints on the floor before it resolves. */
export type TelegraphShape = "circle" | "donut" | "cone" | "line" | "none";

export interface BossAbility {
  readonly id: BossAbilityId;
  /** Shown on the boss frame's cast bar. Say what it does, not what it's called. */
  readonly name: string;
  /** Telegraph time. This is the player's entire warning, so it's generous. */
  readonly cast: number;
  /** Recovery before this specific ability can come round again. */
  readonly cooldown: number;
  /** Multiple of the boss's damage. Mechanics are supposed to hurt. */
  readonly damage: number;
  readonly shape: TelegraphShape;
  /** Outer radius (circle/donut), cone reach, or line length. */
  readonly radius: number;
  /** Donut only: the safe hole in the middle. */
  readonly inner: number;
  /** Cone only: total arc in radians. */
  readonly arc: number;
  /** Line only: half-width. */
  readonly width: number;
  /** Projectiles fired, adds summoned, meteors dropped, or simultaneous telegraphs painted. */
  readonly count: number;
  /** Seconds of burning ground left where it landed. Zero means none. */
  readonly linger: number;
  /** The boss only picks this when the player is inside this band. */
  readonly minRange: number;
  readonly maxRange: number;
  /** Centered on the boss (true) or on where the player was standing (false). */
  readonly onSelf: boolean;
}

export const BOSS_ABILITIES: Record<BossAbilityId, BossAbility> = {
  slam: {
    id: "slam", name: "Overhead Slam", cast: 1.15, cooldown: 5, damage: 2.6,
    shape: "circle", radius: 74, inner: 0, arc: 0, width: 0, count: 0, linger: 0,
    // It lands where you were standing, so distance is no defence. A boss whose whole
    // phase-one kit was melee-range could be beaten by walking backwards.
    minRange: 0, maxRange: 560, onSelf: false,
  },
  cleave: {
    // Fast and cheap. The tax for standing in front of it.
    id: "cleave", name: "Wide Cleave", cast: 0.7, cooldown: 3.6, damage: 1.4,
    shape: "cone", radius: 140, inner: 0, arc: 1.7, width: 0, count: 0, linger: 0,
    minRange: 0, maxRange: 145, onSelf: true,
  },
  quake: {
    // "Get out." Centered on the boss, so melee has to give ground.
    id: "quake", name: "Sundering Quake", cast: 1.75, cooldown: 9, damage: 3.2,
    shape: "circle", radius: 178, inner: 0, arc: 0, width: 0, count: 0, linger: 0,
    minRange: 0, maxRange: 999, onSelf: true,
  },
  ringOut: {
    // "Get in." The mirror of the quake, and the reason you can't just kite forever.
    id: "ringOut", name: "Expanding Ruin", cast: 1.95, cooldown: 11, damage: 3.3,
    shape: "donut", radius: 620, inner: 96, arc: 0, width: 0, count: 0, linger: 0,
    minRange: 0, maxRange: 999, onSelf: true,
  },
  volley: {
    id: "volley", name: "Radial Volley", cast: 0.95, cooldown: 7, damage: 0.9,
    shape: "none", radius: 0, inner: 0, arc: 0, width: 0, count: 16, linger: 0,
    minRange: 0, maxRange: 999, onSelf: true,
  },
  summon: {
    id: "summon", name: "Call the Chorus", cast: 1.3, cooldown: 16, damage: 0,
    shape: "none", radius: 0, inner: 0, arc: 0, width: 0, count: 4, linger: 0,
    minRange: 0, maxRange: 999, onSelf: true,
  },
  meteor: {
    // Scattered pools you have to keep moving out of for the rest of the fight.
    id: "meteor", name: "Rain of Cinders", cast: 1.35, cooldown: 12, damage: 2.1,
    shape: "circle", radius: 62, inner: 0, arc: 0, width: 0, count: 5, linger: 5,
    minRange: 0, maxRange: 999, onSelf: false,
  },
  charge: {
    id: "charge", name: "Gore Charge", cast: 0.85, cooldown: 8, damage: 3.2,
    shape: "line", radius: 460, inner: 0, arc: 0, width: 26, count: 0, linger: 0,
    minRange: 150, maxRange: 999, onSelf: true,
  },
  beam: {
    id: "beam", name: "Unmaking Beam", cast: 1.4, cooldown: 10, damage: 3.5,
    shape: "line", radius: 620, inner: 0, arc: 0, width: 20, count: 0, linger: 2.5,
    minRange: 0, maxRange: 999, onSelf: true,
  },
  windmill: {
    // A weapon held in both hands, thrown all the way around. Three overlapping arcs
    // leave three narrow slivers of floor that are actually safe.
    id: "windmill", name: "Guardian's Spin", cast: 1.3, cooldown: 10, damage: 1.6,
    shape: "cone", radius: 150, inner: 0, arc: 1.7, width: 0, count: 3, linger: 0,
    minRange: 0, maxRange: 200, onSelf: true,
  },
  starLance: {
    // Four lances at once, crossed through the middle of the room. The safe ground is
    // whichever quadrant you're not standing in.
    id: "starLance", name: "Fourfold Reckoning", cast: 1.6, cooldown: 13, damage: 1.9,
    shape: "line", radius: 480, inner: 0, arc: 0, width: 16, count: 4, linger: 0,
    minRange: 0, maxRange: 999, onSelf: true,
  },
  wall: {
    // A row of blasts across wherever you were standing, with exactly one gap in it —
    // the room-control cousin of a volley's ring, planted rather than thrown.
    id: "wall", name: "The Reckoning Line", cast: 1.5, cooldown: 12, damage: 1.7,
    shape: "circle", radius: 60, inner: 0, arc: 0, width: 0, count: 5, linger: 0,
    minRange: 0, maxRange: 999, onSelf: false,
  },
  backlash: {
    // Fast and short, and it only ever comes out when you're already standing in its
    // face. The tax on facetanking a boss that also has a room-wide kit.
    id: "backlash", name: "Close Reckoning", cast: 0.55, cooldown: 4.5, damage: 1.3,
    shape: "circle", radius: 95, inner: 0, arc: 0, width: 0, count: 0, linger: 0,
    minRange: 0, maxRange: 150, onSelf: true,
  },
  corruption: {
    // Weak on impact, but it leaves the ground bad for a long time. This is fought over
    // territory, not survived as a single hit.
    id: "corruption", name: "Fouled Ground", cast: 1.2, cooldown: 14, damage: 1.1,
    shape: "circle", radius: 130, inner: 0, arc: 0, width: 0, count: 0, linger: 7,
    minRange: 0, maxRange: 999, onSelf: false,
  },
  enrage: {
    // No shape and no damage of its own — it just means the next several seconds of
    // everything else hits harder and comes around faster. Nothing to dodge, because
    // nothing lands; the tell is that the rest of the fight suddenly speeds up.
    id: "enrage", name: "Ancient Resolve", cast: 0.6, cooldown: 20, damage: 0,
    shape: "none", radius: 0, inner: 0, arc: 0, width: 0, count: 0, linger: 0,
    minRange: 0, maxRange: 999, onSelf: true,
  },
};

export interface BossPhase {
  /** Entered when health drops to this fraction or below. The first is always 1. */
  readonly at: number;
  readonly name: string;
  readonly abilities: readonly BossAbilityId[];
  /** Multiplies the gap between casts. Below 1 means a faster, nastier rotation. */
  readonly haste: number;
  readonly speed: number;
  /** Adds thrown out the moment this phase begins. */
  readonly addsOnEnter: number;
}

export interface BossSpec {
  readonly id: string;
  readonly name: string;
  /** The line under the name on the boss frame. Deadpan, please. */
  readonly title: string;
  readonly element: Element;
  readonly sprite:
    | "boss" | "bossChoir" | "bossColossus" | "bossHerald" | "bossNameless"
    | "bossFerryman" | "bossWarQueen" | "bossLabyrinth" | "bossTyrant";
  /** Multiples of the floor's baseline enemy stats. */
  readonly health: number;
  readonly damage: number;
  readonly speed: number;
  readonly radius: number;
  /**
   * Draw scale for the sprite. Bosses are supposed to be absurd. The art is authored
   * on a 26x26 field, so these are tuned against that — redraw a boss bigger and this
   * has to come down or it will not fit in its own arena.
   */
  readonly spriteScale: number;
  /** Resistance to its own element, so you can't beat fire with fire. */
  readonly selfResist: number;
  readonly phases: readonly BossPhase[];
}

/**
 * Five encounters. They're picked by depth, so the fifth is only ever seen by people
 * who have earned it, and rifts reach it from the tier ladder instead.
 */
export const BOSSES: readonly BossSpec[] = [
  {
    id: "warden", name: "Warden of the First Seal", title: "It has been standing here a while.",
    element: "physical", sprite: "boss",
    health: 72, damage: 2.4, speed: 0.62, radius: 44, spriteScale: 3.85, selfResist: 120,
    phases: [
      { at: 1.0, name: "Rousing", abilities: ["cleave", "slam"], haste: 1, speed: 1, addsOnEnter: 0 },
      { at: 0.66, name: "Awake", abilities: ["cleave", "slam", "quake", "summon", "windmill"], haste: 0.85, speed: 1.1, addsOnEnter: 3 },
      { at: 0.3, name: "Unsealed", abilities: ["slam", "quake", "ringOut", "cleave", "summon", "windmill", "enrage"], haste: 0.68, speed: 1.25, addsOnEnter: 4 },
    ],
  },
  {
    id: "choir", name: "The Hollow Choir", title: "Several voices, no mouths.",
    element: "void", sprite: "bossChoir",
    // `bossChoir` is now atlas-backed (the corrupted saint, art-style-guide §5 Heresy) —
    // its on-screen scale comes from `render/atlas/manifest.ts` (`boss.corrupted-saint`,
    // worldScale 1.85). `spriteScale` here is only the fallback if that PNG ever fails to
    // load; it still governs the procedural `BOSS_CHOIR` grid the smoke test walks.
    health: 80, damage: 2.5, speed: 0.8, radius: 40, spriteScale: 3.54, selfResist: 160,
    phases: [
      { at: 1.0, name: "First Verse", abilities: ["volley", "slam"], haste: 1, speed: 1, addsOnEnter: 0 },
      { at: 0.7, name: "Second Verse", abilities: ["volley", "ringOut", "summon", "beam", "starLance"], haste: 0.85, speed: 1.05, addsOnEnter: 4 },
      { at: 0.35, name: "Crescendo", abilities: ["volley", "beam", "ringOut", "quake", "summon", "starLance", "wall"], haste: 0.62, speed: 1.15, addsOnEnter: 5 },
    ],
  },
  {
    id: "colossus", name: "Gravebound Colossus", title: "Held together, mostly.",
    element: "poison", sprite: "bossColossus",
    health: 105, damage: 2.6, speed: 0.55, radius: 54, spriteScale: 5.15, selfResist: 150,
    phases: [
      { at: 1.0, name: "Lumbering", abilities: ["slam", "charge"], haste: 1, speed: 1, addsOnEnter: 0 },
      { at: 0.72, name: "Unearthed", abilities: ["slam", "charge", "quake", "meteor", "corruption"], haste: 0.88, speed: 1.15, addsOnEnter: 3 },
      { at: 0.32, name: "Collapsing", abilities: ["charge", "quake", "meteor", "slam", "summon", "corruption", "backlash"], haste: 0.7, speed: 1.35, addsOnEnter: 5 },
    ],
  },
  {
    id: "herald", name: "Herald of the Unspoken", title: "Arrived early. Waiting for the rest.",
    element: "fire", sprite: "bossHerald",
    health: 96, damage: 2.7, speed: 0.9, radius: 44, spriteScale: 4.23, selfResist: 170,
    phases: [
      { at: 1.0, name: "Announcement", abilities: ["meteor", "cleave", "volley"], haste: 1, speed: 1, addsOnEnter: 0 },
      { at: 0.7, name: "Proclamation", abilities: ["meteor", "volley", "beam", "ringOut", "wall"], haste: 0.82, speed: 1.1, addsOnEnter: 4 },
      { at: 0.33, name: "The Word Itself", abilities: ["meteor", "beam", "ringOut", "quake", "volley", "summon", "wall", "enrage"], haste: 0.6, speed: 1.25, addsOnEnter: 6 },
    ],
  },
  {
    id: "nameless", name: "That Which Has No Name", title: "You should not have come this far.",
    element: "void", sprite: "bossNameless",
    health: 145, damage: 3.0, speed: 0.85, radius: 52, spriteScale: 4.31, selfResist: 220,
    phases: [
      { at: 1.0, name: "Regard", abilities: ["slam", "volley", "beam"], haste: 0.95, speed: 1, addsOnEnter: 2 },
      { at: 0.75, name: "Attention", abilities: ["slam", "volley", "beam", "ringOut", "meteor", "windmill"], haste: 0.8, speed: 1.1, addsOnEnter: 5 },
      { at: 0.45, name: "Interest", abilities: ["beam", "ringOut", "quake", "meteor", "charge", "summon", "starLance", "corruption"], haste: 0.66, speed: 1.2, addsOnEnter: 6 },
      { at: 0.2, name: "Displeasure", abilities: ["quake", "ringOut", "beam", "volley", "meteor", "slam", "summon", "windmill", "starLance", "wall", "backlash", "enrage"], haste: 0.5, speed: 1.35, addsOnEnter: 8 },
    ],
  },
];

/** Which encounter a floor gets. Deeper floors work down the list and then stay there. */
export function bossFor(depth: number): BossSpec {
  const i = Math.floor(Math.max(1, depth) / 5) - 1;
  return BOSSES[Math.min(BOSSES.length - 1, Math.max(0, i))]!;
}

/**
 * Base seconds of recovery between casts, before the phase's haste and the floor's
 * aggression. Note that a cast's own wind-up sits on top of this, so lengthening a tell
 * to make it readable also lowers the boss's pressure — if you stretch a cast, shorten
 * this to match or the encounter quietly gets easier.
 */
export const BOSS_ACTION_GAP = 1.85;
/** Knockback a boss actually takes. It is not going to be staggered by a sword. */
export const BOSS_KNOCK_RESIST = 0.06;
