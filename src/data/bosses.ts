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
  // The original fifteen. Between them they ask six questions and no more: get out of
  // the circle, get into the donut, step off the line, get out of the cone, kill the
  // adds, stop attacking and move. Forty-four encounters drew on these fifteen, which is
  // why every boss read as the same fight in a different skin.
  | "slam" | "cleave" | "quake" | "ringOut" | "volley" | "summon" | "meteor" | "charge" | "beam"
  | "windmill" | "starLance" | "wall" | "backlash" | "corruption" | "enrage"
  // The eight added because those six questions were the whole game. Each earns its place
  // by asking something none of the fifteen do — see its entry in `BOSS_ABILITIES`, and
  // `tools/bossvariety.ts` for the measurement that said the roster needed them.
  //
  // The animation tag for a boss ability **is** its id here, by convention, so adding a
  // row to this union is the whole of declaring one (see docs/boss-abilities.md).
  | "hunt" | "drift" | "sunder" | "blink" | "sanctuary" | "judgment" | "mark" | "crescendo";

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
  /**
   * Projectiles fired, adds summoned, meteors dropped, or simultaneous telegraphs
   * painted — and, for the newer abilities, safe discs offered (`sanctuary`), beats
   * (`judgment`) or extra bodies marked (`mark`). It has always been the "how many"
   * field for whatever the ability counts; `game/boss.ts` decides what that is per
   * ability rather than the field meaning one thing.
   */
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

  // --- the eight new questions ---------------------------------------------
  //
  // Every one of these still obeys the four rules in `CLAUDE.md`: it is telegraphed, its
  // wind-up locks the body, a dash beats it outright, and nothing here can only be
  // answered from melee range. What is new is the *question*, not the numbers — a new
  // ability that asked "get out of the circle" again would be a fifteenth way to write
  // `slam`.

  hunt: {
    // **Keep moving.** A shape that does not land where you were: it walks toward you for
    // the whole wind-up and detonates wherever it has got to. Standing anywhere and
    // holding still loses; walking in any direction wins, and *which* direction is yours.
    //
    // This is deliberately not keyed on stillness. `data/traps.ts`'s `regard` ward already
    // is, and `REGARD_HOLD`'s comment records the measurement: a stillness-punisher taxes
    // bows, staves and every channelled build harder than it taxes a sword, and
    // lengthening the hold *concentrates* that tax rather than relieving it. A shape that
    // has to be outrun costs a parked ranged build and a melee build the same few steps,
    // so it is build-neutral by construction rather than by hope.
    //
    // Its speed is the whole balance of it and it is asserted as a comparison against the
    // slowest class's base move speed (`tools/bossvariety.ts`), never as a bounded
    // constant: a chasing shape that outruns the slowest unbuffed character is not a
    // mechanic, it is a damage tick, and a one-sided bound would let that ship green.
    id: "hunt", name: "The Slow Certainty", cast: 2.6, cooldown: 15, damage: 2.9,
    shape: "circle", radius: 82, inner: 0, arc: 0, width: 0, count: 0, linger: 0,
    minRange: 0, maxRange: 999, onSelf: false,
  },
  drift: {
    // **The safe ground moves.** Every other lingering hazard in the game is planted:
    // once `corruption` or a `beam` scar is down, the floor it took is the floor it keeps
    // and you can file it away and stop looking. This one travels after it lands, so
    // ground you cleared stops being a fact about the room. It is the only ability in the
    // vocabulary whose danger zone is not where you last saw it.
    id: "drift", name: "The Current", cast: 1.25, cooldown: 13, damage: 1.2,
    shape: "circle", radius: 92, inner: 0, arc: 0, width: 0, count: 0, linger: 7,
    minRange: 0, maxRange: 999, onSelf: false,
  },
  sunder: {
    // **Part of the room is gone now.** A cut straight across the arena that stays lit
    // for ten seconds — not a hit to dodge but a wall to route around, and it lands
    // through the boss, so it decides which side of the fight you are on. The kit had no
    // way to take *space* away: `corruption` denies a puddle, this denies a half.
    id: "sunder", name: "Cut the Room", cast: 1.9, cooldown: 19, damage: 1.8,
    shape: "line", radius: 900, inner: 0, arc: 0, width: 34, count: 0, linger: 10,
    minRange: 0, maxRange: 999, onSelf: true,
  },
  blink: {
    // **It is not where you left it.** The body leaves, and the space it was standing in
    // collapses behind it. Nothing else in the kit moves the boss except `charge`, which
    // travels in a straight line you can watch; this one closes or opens the gap without
    // crossing the ground between. It reaches nobody by itself and is not supposed to —
    // it is the setup, not the hit.
    id: "blink", name: "No Further Turns", cast: 1.0, cooldown: 16, damage: 2.3,
    shape: "circle", radius: 165, inner: 0, arc: 0, width: 0, count: 0, linger: 0,
    minRange: 0, maxRange: 999, onSelf: true,
  },
  sanctuary: {
    // **Get to specific ground, not just away from it.** The room goes up, apart from a
    // few small discs, and you have to reach one. The donut asks the same shape of
    // question with exactly one answer in a fixed place; this asks it with three answers
    // scattered, which turns dodging into choosing.
    //
    // The discs are placed by the ability, not found in the level, and that is the point
    // (see docs/boss-abilities.md): a mechanic that asked you to break line of sight
    // behind the arena's own geometry would have an answer only on a favourable
    // `layoutOpen` roll, since a boss arena is 1–3 scattered blocks in a room 1360+
    // units wide. An ability whose answer depends on a level seed the player never sees
    // is not readable, whatever its telegraph says. This one brings its answer with it.
    //
    // `count` is how many discs. At least one is always placed near the body, or this
    // becomes a uniform melee-uptime tax wearing a different coat — `game/boss.ts`
    // guarantees that and `tools/bossvariety.ts` asserts it.
    id: "sanctuary", name: "Divine Judgment", cast: 2.3, cooldown: 20, damage: 3.4,
    shape: "circle", radius: 1200, inner: 0, arc: 0, width: 0, count: 3, linger: 0,
    minRange: 0, maxRange: 999, onSelf: true,
  },
  judgment: {
    // **Twice, on the same ground.** One circle, two beats: the second lands on the spot
    // the first did, a beat later and with a shorter tell. A dash beats each beat
    // outright — the rule that a dash always wins is untouched — but a dash spent on the
    // first leaves you standing in the second on empty i-frames. Walk the first, dash
    // the second.
    //
    // This is deliberately as close to a dash-reading mechanic as the rules allow and no
    // closer. A true dash-reader was proposed and **declined**: "a dash always beats
    // them" is what makes the dash the one skill the game asks you to learn, and a
    // mechanic that inverts it makes the right answer conditional on first identifying
    // which mechanic you are looking at. Do not reopen that without the owner.
    id: "judgment", name: "Twice-Spoken", cast: 1.5, cooldown: 11, damage: 2.0,
    shape: "circle", radius: 108, inner: 0, arc: 0, width: 0, count: 2, linger: 0,
    minRange: 0, maxRange: 999, onSelf: false,
  },
  mark: {
    // **Be somewhere nobody else is.** A sticky circle rides each hero, and another rides
    // a few of the bodies nearest them; they all land at once. One mark is survivable and
    // a dash beats it. Standing where two overlap means standing in two of them, so you
    // take both — no special damage rule, just the ordinary resolve counting you twice.
    //
    // Solo this is "get clear of the adds", which is itself new: nothing else in the game
    // makes a summoned body dangerous to be *near* rather than to leave alive. In a party
    // it is the separation mechanic the doc asks the Minotaur for — "players becoming
    // separated" — and it needs no party-only code to become it.
    id: "mark", name: "Told Apart", cast: 2.0, cooldown: 17, damage: 1.9,
    shape: "circle", radius: 118, inner: 0, arc: 0, width: 0, count: 3, linger: 0,
    minRange: 0, maxRange: 999, onSelf: false,
  },
  crescendo: {
    // **The fight gets worse the longer you take.** `enrage` is a window: four seconds
    // harder and faster, then back to normal, and waiting it out is a legitimate answer.
    // This one never comes back down — each cast stacks permanently, so a fight that
    // drags is a fight that is still accelerating. It is the only pressure in the kit
    // that a player cannot outlast, only outrun.
    //
    // Capped in `game/boss.ts`, because "cannot be outlasted" has to stop somewhere short
    // of a rotation that overlaps its own wind-ups — the one rule everything else rests
    // on. No shape and no damage of its own; the tell is the rest of the fight.
    id: "crescendo", name: "It Is Getting Louder", cast: 0.7, cooldown: 22, damage: 0,
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

// --- reach, and rebuilding a template into a variant ------------------------

/**
 * How far an ability has to be able to touch before it counts as reaching across the
 * arena.
 *
 * The rule it serves is `CLAUDE.md`'s "every phase needs at least one ability that
 * reaches across the arena, or the fight can be beaten by walking backwards", so the test
 * is whether the boss can *choose* the ability while you are far away and still hit you.
 *
 * This lived in `tools/bossrules.ts` until the variant builder below needed it. A tool
 * cannot be imported from `src/`, and the alternative was a second copy of the predicate
 * living in the data layer — which is exactly the fork this codebase keeps paying for
 * elsewhere. So the predicate moved down here, where the vocabulary it reads already is,
 * and `tools/bossrules.ts` re-exports it so the audit is unchanged.
 */
export const CROSS_ARENA_RANGE = 400;

/** Whether one ability can touch a player who is refusing to come closer. */
export function reachesAcross(id: BossAbilityId): boolean {
  const a = BOSS_ABILITIES[id];
  // A pure buff reaches nobody; it is not an answer to a player walking backwards.
  if (a.damage <= 0 && a.count <= 0) return false;
  if (a.maxRange < CROSS_ARENA_RANGE) return false;
  // Centred on the boss and small enough to stand outside of: you can just leave.
  // Unless it throws something (projectiles, adds) that comes to find you.
  return !a.onSelf || a.radius >= 300 || a.count > 0;
}

/** How a borrowed encounter is bent into its own fight. */
export interface VariantKit {
  /**
   * Folded on top of the borrowed kit: the first from phase one so the fight reads as
   * itself immediately, all of them from phase two. The same rule `RaidSpec.signature`
   * already stated, generalised.
   */
  readonly signature?: readonly BossAbilityId[];
  /**
   * Taken out of the borrowed kit **everywhere**, in every phase at once.
   *
   * This is the half that did not exist before, and it is the half that actually
   * de-clones the roster. A variant that could only ever *add* ends up as the template
   * plus more, which is why `quake` and `summon` measured at 100% of all 44 kits
   * (`tools/bossvariety.ts`): every one of the five authored encounters has both, and
   * nothing derived from them could ever put one down. An ability in every single kit is
   * not a mechanic, it is a heartbeat.
   *
   * Dropped in every phase rather than in some of them, so the result is still strictly
   * cumulative phase-to-phase — "phases add rather than replace" is a statement about a
   * fight over time, not about which cards the fight was dealt.
   *
   * A drop is **refused** if it would leave a phase with no ability that reaches across
   * the arena, or with no abilities at all. Both are rules in `CLAUDE.md` and both are
   * cheaper to make impossible here than to catch in a gate afterwards.
   */
  readonly drop?: readonly BossAbilityId[];
}

/**
 * Rebuilds a template's phase list into a variant's: the one place a borrowed encounter
 * becomes its own fight.
 *
 * There were two near-copies of this before it existed — `raidPhases` and `provingPhases`
 * — and the Reliquary sectors and the Tower had *none*, which is why `planetBossSpec` and
 * `towerBossSpec` produced encounters that were byte-identical to the five authored ones
 * with a new name plate. Fourteen of the game's forty-four encounters were name plates.
 *
 * What this does and deliberately does not do:
 *
 * - **It swaps cards, it does not deal more of them.** `at`, `haste`, `speed` and
 *   `addsOnEnter` are the template's, untouched. A sector boss that gained abilities
 *   without losing any would be a live difficulty change to shipped, played content
 *   smuggled in under a variety commit. Authoring a variant with as many drops as
 *   signature entries keeps the kit the same size; `tools/bossvariety.ts` reports the
 *   sizes so a drift shows up.
 * - **It unions forward**, so every phase contains every phase before it. The authored
 *   encounters mostly but not strictly do this (three of them drop abilities between
 *   phases and those violations are pinned in `tools/legends.ts`); a variant built here
 *   is additive by construction.
 * - **It invents nothing.** A variant is authored out of the existing vocabulary.
 */
export function variantPhases(template: BossSpec, kit: VariantKit): readonly BossPhase[] {
  const signature = kit.signature ?? [];
  const drop = new Set(kit.drop ?? []);
  const seen = new Set<BossAbilityId>();

  return template.phases.map((phase, i) => {
    for (const id of phase.abilities) seen.add(id);
    if (i === 0) {
      const first = signature[0];
      if (first) seen.add(first);
    } else {
      for (const id of signature) seen.add(id);
    }

    let abilities = [...seen].filter((id) => !drop.has(id));
    // A drop that would break a rule is not applied. Refusing beats failing a gate the
    // author has to go and read: the worst case is a variant that is less distinct than
    // it asked to be, which is visible in the measurement, rather than a phase that can
    // be beaten by walking backwards, which is not visible at all.
    if (abilities.length === 0 || !abilities.some(reachesAcross)) abilities = [...seen];
    return { ...phase, abilities };
  });
}

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
/**
 * How fast a `hunt` shape walks toward its target, in units per second.
 *
 * **The number is here; the rule is a comparison in the gate.** A chasing shape that
 * outruns the slowest unbuffed character in the game is not a mechanic, it is a damage
 * tick with extra steps — so `tools/bossvariety.ts` asserts this against the roster's
 * own slowest base move speed rather than against a bound. A one-sided bound would let a
 * class rebalance quietly turn `hunt` into an unavoidable hit for whoever ended up
 * slowest, which is the exact failure mode `CLAUDE.md`'s campaign-comparison lesson is
 * about.
 */
export const HUNT_SPEED = 96;
/** Knockback a boss actually takes. It is not going to be staggered by a sword. */
export const BOSS_KNOCK_RESIST = 0.06;
