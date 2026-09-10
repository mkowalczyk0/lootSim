/**
 * Raids — UAT §15 / §16.
 *
 * §15 asks for "large-scale raid encounters", and `docs/game_story_worldbuilding.md`
 * (RAID BOSSES) says what one *is*: not a large demon, but "an enormous mythological
 * event" — a fallen celestial being, an ancient god, a mythological monster given a body
 * by this war. MYTHOLOGICAL COMPOSITES says the game may reinterpret rather than
 * reproduce, and that "every reinterpretation should still feel like it belongs to the
 * game's cosmology". EXAMPLE RAID BOSSES then names four. Those four are the roster
 * below, in the doc's own words, and no fifth is invented here.
 *
 * ### A raid is one encounter, not a short rift
 *
 * `MODES.raid` is a rift-shaped `RunMode` with **one floor, and that floor is the boss**.
 * That is the whole shape, and it is deliberate:
 *
 * - §15 asks for *raid bosses*, and Chunk 10 asks for "raid boss mechanics". The thing
 *   the mode exists to deliver is the fight, and a trash floor in front of it is the
 *   Delve with a different name on the door.
 * - "Extremely difficult" only works if a wipe is cheap to retry. A gauntlet floor in
 *   front of the encounter taxes every attempt at the encounter, which teaches people to
 *   stop attempting it.
 * - The clear cache already pays a `lastFloor` run 2.4× (`Dungeon.dropClearCache`), so a
 *   one-floor raid still pays like a run rather than like a floor.
 *
 * ### One curve, again
 *
 * A raid tier compounds `danger` exponentially exactly as a rift tier does, and hands the
 * result to the same `profileFor`. There is no raid difficulty curve — `tools/raids.ts`
 * pins that by comparing a raid floor against a Delve floor at the same effective depth
 * and danger. What makes a raid the hardest thing in the game is the *encounter*: its
 * stat line is measured against the deepest authored one (see `REFERENCE`), never against
 * the template it borrowed, and its phases are rebuilt strictly cumulative with the
 * raid's own signature abilities folded in.
 *
 * ### §16 — what a harder raid is worth
 *
 * §16 ("Raid Drop Rarity") asks that a raid's difficulty tiers move drop rarity, drop
 * chance, drop count, item power and special variants. Four of those five *are*
 * `rewardCurve(danger)` (`data/rewards.ts`), which every tier climbs for free by moving
 * `danger`. The fifth — rarity — is deliberately not an axis of that curve
 * (`CLAUDE.md`: a second rarity term keyed on danger would route around the Challenger
 * cap), so a raid says it the honest way instead: **the rarest items in a raid's table are
 * gated behind a tier** (`minTier` on a `raid` source). Tier 8 does not roll a better
 * version of tier 1's drop; it can drop something tier 1 cannot. That is §15's own
 * sentence — "the hardest bosses should contain some of the most desirable equipment in
 * the game" — said as a drop table rather than as a second curve.
 *
 * ### A raid holds a layer's gate (UAT §23)
 *
 * `data/layers.ts` reserved `WorldLayer.raidId` for exactly this, and its comment had
 * already sorted the doc's four raids by layer. This file honours that sorting, and the
 * relationship is asserted from both ends by `tools/raids.ts`: every raid names a layer
 * that names it back. **It gates nothing on the ladders.** A layer is a reading of a depth
 * band and nothing in the simulation reads one; what a raid's layer actually decides is
 * when the *raid* opens — `unlockFrontier` is the account frontier at which that band is
 * genuinely yours, and the frontier is the further of the two ladders (§21), so a climber
 * and a delver both arrive.
 *
 * ### Solo, in v1
 *
 * §15's eventual ask is 4-20 players. This is one player, the same call `data/daily.ts`
 * made for the Vigil and `data/legends.ts` for the Proving, and for the same reason: the
 * party half of the game is host-authoritative and every new mode that crosses the wire
 * is a new way for two saves to disagree. The seam is left open rather than closed —
 * `RunConfigWire` carries `raidId`/`raidTier` and `configFromWire` rebuilds a raid
 * through this file's own builder, so a raid a host started is a raid every client
 * builds — but nothing offers one in a room. See `docs/raids.md`.
 *
 * Pure data. Nothing here imports from the simulation.
 */

import type { BiomeStyle } from "./biomes";
import { BOSSES, type BossAbilityId, type BossPhase, type BossSpec } from "./bosses";
import { challengerMultiplier } from "./challenger";
import type { Element } from "./elements";
import { LAYER_BY_ID, type WorldLayer } from "./layers";
import { MODES, type RunConfig } from "./modes";

// --- the encounter's measuring stick ----------------------------------------

/**
 * What a raid's stat line is measured against: the deepest authored encounter.
 *
 * The same choice `data/legends.ts` makes, for the same measured reason. Scaling off the
 * *borrowed* template is the obvious thing to write and it is wrong — the authored
 * encounters range from 72 health to 145, so a raid that borrowed the shallow end would
 * come out weaker than the ordinary boss floor at its own depth. The body and the kit are
 * the template's; the numbers are the bottom of the world's.
 */
const REFERENCE = BOSSES[BOSSES.length - 1]!;

/**
 * Multiplies the reference encounter's health. Above the Proving's 1.35 because a raid is
 * the one fight in the game that is allowed to be a project, and below anything absurd
 * because v1 is solo: `partyScale` already multiplies health by the size of the group, so
 * this number is the *one-player* fight and the co-op pass tunes the multiplier, not this.
 */
export const RAID_HEALTH = 1.7;
/** Multiplies the reference encounter's damage. Modest — the pressure is in the rotation. */
export const RAID_DAMAGE = 1.15;
/**
 * Resistance to its own element. Below the Nameless's 220 for the reason the Proving's is:
 * a floor that disqualifies the build you brought reads as a wall, not as a tax. Physical
 * never gets one at all (`spawnBoss` skips it) — the rule that a floor must never resist
 * the damage everyone always has applies hardest to the fight you came here for.
 */
export const RAID_SELF_RESIST = 175;
/**
 * The tightest the gap between casts is allowed to get. `BOSS_ACTION_GAP` times this is
 * that gap, and a rotation short enough to overlap its own wind-ups breaks the one rule
 * every encounter rests on: if a hit landed, it was readable.
 */
export const RAID_HASTE_FLOOR = 0.42;
/** Health fraction the appended final phase begins at. */
export const RAID_LAST_PHASE_AT = 0.15;

// --- the schema -------------------------------------------------------------

export interface RaidSpec {
  /** Frozen internal id — `GameState.raidProgress` is keyed by it. Do not change. */
  readonly id: string;
  /** What the boss frame reads. */
  readonly name: string;
  /** The deadpan line under the name. One sentence, dry. */
  readonly title: string;
  /** The mechanics in one line, for the terminal — the `RunMode.blurb` of one raid. */
  readonly blurb: string;
  /** Why this thing exists, quoted from the worldbuilding doc's own account of it. */
  readonly lore: string;
  /** The `WorldLayer.id` this raid stands at the gate of. That layer names it back. */
  readonly layerId: string;
  /**
   * Account frontier (§21: the further of the depth and height records) at which the raid
   * opens. Always at or past its layer's first depth — the band has to be yours before the
   * thing holding it will see you. Widening only: nothing ever closes.
   */
  readonly unlockFrontier: number;
  /** The local element: what it fights with, and what it resists. */
  readonly element: Element;
  /** An existing `BossSpec.id` to borrow — kit and phase shape, wholesale. */
  readonly templateId: string;
  /**
   * Its own sprite. A raid borrows its template's *kit*, but not its body: until the art
   * pass (docs/art-manifest.md §2.1) every raid also drew the template's PNG, so the
   * headline encounter of a whole layer was pixel-identical to an ordinary floor boss and
   * a player could only tell them apart by the name plate. The silhouette is the first
   * thing read (art-style-guide §1.5), so it is the one thing a raid does not borrow.
   */
  readonly sprite: BossSpec["sprite"];
  /**
   * The abilities that make this raid *this* raid, folded on top of the borrowed kit: the
   * first from phase one so the fight reads as itself immediately, all of them from phase
   * two. Existing `BossAbilityId`s only — a raid adds no vocabulary, so nothing in `net/`,
   * `render/` or the telegraph pipeline learns anything.
   */
  readonly signature: readonly BossAbilityId[];
  /** The name of the appended final phase. */
  readonly finalPhase: string;
  /** Its own arena — a raid is a place, the way a Reliquary sector is (`PlanetSpec.biome`). */
  readonly biome: BiomeStyle;
  /** Effective depth at tier 1. */
  readonly baseDepth: number;
  /** Effective depth added per tier. */
  readonly depthPerTier: number;
  /** Compounds per tier: `dangerPerTier ^ (tier - 1)`. The exponential in "exponential". */
  readonly dangerPerTier: number;
}

// --- the arenas -------------------------------------------------------------
//
// Four places, one per raid. Tilesets are reused from committed sheets where the theme
// genuinely matches (`render/atlas/manifest.ts` → `TILESETS`); the First Heavens names
// none, because no Heaven sheet has been painted yet and claiming an id whose PNG is not
// committed is a lie `npm run smoke` would rightly fail. That arena falls back to the flat
// `bakeFloor` fill in the palette below — the same state the Tower ships in.

/** The Styx, running through all three realms at once and holding none of them. */
const THE_CROSSING: BiomeStyle = {
  name: "The Crossing",
  tileset: "tiles.delve-cave",
  tint: "#1b2733", floorAlt: "#213040", wall: "#37485c", wallSide: "#141d26",
  accent: "#7dd3fc",
  props: ["bones", "rock", "torch"],
  layouts: ["open", "pillars"],
  traps: ["mire", "spike"],
  element: "cold",
};

/** Circle VII, where the violent are kept. Black cathedral with the gold used wrong. */
const THE_SEVENTH_CIRCLE: BiomeStyle = {
  name: "The Seventh Circle",
  tileset: "tiles.delve-heresy",
  tint: "#3a1c1c", floorAlt: "#4a2320", wall: "#6b3535", wallSide: "#2a1212",
  accent: "#fb923c",
  props: ["brazier", "bones", "statue"],
  layouts: ["open", "ring"],
  traps: ["flame", "turret", "spike"],
  element: "fire",
};

/** Every labyrinth humanity ever built, folded into one and then unmade. */
const THE_NINTH_LABYRINTH: BiomeStyle = {
  name: "The Ninth Labyrinth",
  tileset: "tiles.delve-veil",
  tint: "#241a2e", floorAlt: "#2c2038", wall: "#4a3060", wallSide: "#181022",
  accent: "#ff1493",
  props: ["pillar", "bones", "handstone"],
  layouts: ["open", "pillars"],
  traps: ["saw", "turret", "spike"],
  element: "void",
};

/**
 * The lowest floor of Heaven, held by something Heaven threw out of it. Palette is
 * `docs/art-style-guide.md` §6's bone-gold band, hard-edged rather than warm — `wall`/
 * `wallSide`/`accent` already matched Mid Tower's (`tiles.tower-mid`) exactly, byte for
 * byte, which is how this arena was authored to look before it had a sheet of its own.
 *
 * `tint`/`floorAlt` did not get the same treatment and sat at the old bright bone-gold
 * value (`#a89f7e`, L158.5) that `tint` is only allowed to hold *before* a tileset exists
 * (art-style-guide §17.7: "before a tileset exists, tint IS the floor" — the flat
 * `bakeFloor` fill). The moment a sheet lands, `tint` stops being a colour and becomes the
 * 30% wash the graded floor is blended toward, and a bright one "collapses the very
 * separation both gates measure." Brought down to Mid Tower's own dark ground tone to
 * match the wall it was already sharing — this is the fix that section's own Tower
 * passage describes, not a new call: "when you paint a floor for a biome whose tint was
 * authored bright, the tint comes down with it."
 */
const THE_FIRST_HEAVENS: BiomeStyle = {
  name: "The First Heavens",
  tint: "#2f2b1f", floorAlt: "#39352a", wall: "#f4ecc9", wallSide: "#8a7d54",
  accent: "#fde047",
  tileset: "tiles.first-heavens",
  props: ["pillar", "torch", "statue"],
  layouts: ["open", "ring"],
  traps: ["regard", "turret", "flame"],
  element: "holy",
};

// --- the roster -------------------------------------------------------------

/**
 * The four raids, in the order the worldbuilding doc lists them under EXAMPLE RAID
 * BOSSES, sorted onto the layers `data/layers.ts` had already sorted them onto.
 *
 * Every one of them is a mythological composite rather than a figure: the doc's rule is
 * that the game "does not have to reproduce mythology literally", and that a boss should
 * be "a new entity born from overlapping legends". None of the four is named after a
 * person, for the same reason `data/legends.ts` names no mythological figure — the one
 * document that is allowed to invent this world's cosmology has already been written, and
 * it is read-only.
 */
export const RAIDS: readonly RaidSpec[] = [
  {
    id: "tyrant-of-the-first-heavens",
    name: "Tyrant of the First Heavens",
    title: "It was told no. It is still arguing.",
    blurb: "A celestial warlord and its army, on the floor of Heaven it was thrown out of.",
    lore: "A celestial warlord cast out after trying to overthrow the divine hierarchy. "
      + "Heaven is Order, and Order does not forgive an argument — so it took the armies "
      + "that agreed with it and holds the first floor of the Tower to this day. The "
      + "Keepers' doctrine says Heaven must not descend. This is what Heaven leaves "
      + "behind when it does.",
    layerId: "celestial-endgame",
    unlockFrontier: 26,
    element: "holy",
    // The Choir's kit is already lances, beams and volleys crossing a room — celestial
    // weaponry with the serial numbers filed off. Nothing else in the roster reads as an
    // army firing on a position.
    templateId: "choir",
    sprite: "bossTyrant",
    // The doc's own list for this fight: angelic armies, giant celestial weapons, divine
    // judgment attacks, battlefield-wide celestial abilities. Read straight off it —
    // `summon` is the armies, `starLance` the celestial weapons, `sanctuary` the divine
    // judgment (the room is found wanting apart from the ground it spares), and
    // `judgment` the sentence pronounced twice on the same spot. It has been arguing
    // since it was thrown out; it does not say a thing only once.
    signature: ["sanctuary", "judgment", "starLance", "summon", "wall", "ringOut"],
    finalPhase: "The Argument, Concluded",
    biome: THE_FIRST_HEAVENS,
    baseDepth: 26, depthPerTier: 2.4, dangerPerTier: 1.19,
  },
  {
    id: "minotaur-of-the-ninth-labyrinth",
    name: "Minotaur of the Ninth Labyrinth",
    title: "There is a way out. It is also the Minotaur.",
    blurb: "Every maze ever built, wearing one body, in a room that keeps changing its mind.",
    lore: "A Minotaur the Abyss got hold of. It is no longer a monster in a labyrinth: it "
      + "is the physical manifestation of every labyrinth humanity has ever built, and it "
      + "brought them all with it. The Abyss unmakes what it keeps. This is what it made "
      + "on the way.",
    layerId: "hell-endgame",
    unlockFrontier: 26,
    element: "void",
    // The Colossus charges in a straight line down a corridor and quakes the room it is
    // standing in. A labyrinth is corridors.
    templateId: "colossus",
    sprite: "bossLabyrinth",
    // The doc asks for moving walls, multiple maze layouts, false exits, players becoming
    // separated, and the boss appearing in different parts of the maze. Four of those five
    // are now sayable: `sunder` cuts the room in half and leaves the cut standing, which
    // is a wall that was not there before; `blink` is the body appearing somewhere else
    // without crossing the floor between; `mark` is players being told apart and made to
    // stand away from each other. `charge` stays because a labyrinth is corridors.
    //
    // The fifth — the arena itself relaying between layouts mid-fight — is deliberately
    // not attempted: level geometry is the collision volume *and* the tile lattice *and*
    // what the flow field is rebuilt against, so a room that rearranges itself is a change
    // to `level.ts`'s hardest promise and not a boss ability. `sunder` is the honest
    // subset of it, and it is a real one.
    signature: ["sunder", "blink", "mark", "charge", "beam"],
    finalPhase: "No Further Turns",
    biome: THE_NINTH_LABYRINTH,
    baseDepth: 26, depthPerTier: 2.4, dangerPerTier: 1.19,
  },
  {
    id: "the-ferryman",
    name: "The Ferryman",
    title: "The fare is the same either way.",
    blurb: "Three realms' worth of souls, one boat, and whatever is steering it now.",
    lore: "The boundaries between Heaven, Hell and Purgatory are collapsing, so the river "
      + "runs through all three at once and the thing that poles it is trying to carry "
      + "every soul across every one of them simultaneously. It has not stopped. It has "
      + "not been paid, either.",
    layerId: "threshold",
    unlockFrontier: 12,
    element: "cold",
    // The Warden: one enormous body, a pole, and no interest in moving. The shallowest
    // raid borrows the shallowest kit; its signature is what makes it a river.
    templateId: "warden",
    sprite: "bossFerryman",
    // The Styx running through three realms at once, and a boat still being poled through
    // all of them. `drift` is the river: the one hazard in the game whose ground travels
    // after it lands, so safe footing is never a fact you can file away. `hunt` is the
    // fare being collected — slow, certain, and it does not care where you go, only that
    // you keep going. `corruption` is the water it leaves behind and `summon` the souls it
    // is still trying to carry.
    //
    // The shallowest raid, and the only one whose signature is built entirely out of
    // pressure rather than punishment: nothing here is a big hit. It is the fight that
    // never lets you stand anywhere.
    // `beam` is kept from the original signature deliberately, and the A/B is the reason:
    // dropping it for `drift` + `hunt` took the Ferryman from 9/16 wins to 15/16 across
    // sixteen seeds. Swapping a 3.5-damage line for two abilities that are mostly
    // *pressure* is card-count-neutral and threat-negative, which is a live difficulty
    // cut to a shipped raid wearing a variety commit's clothes. The pole is a line across
    // the water; it stays.
    signature: ["drift", "hunt", "beam", "corruption", "summon", "ringOut"],
    finalPhase: "Both Banks At Once",
    biome: THE_CROSSING,
    baseDepth: 12, depthPerTier: 2.0, dangerPerTier: 1.15,
  },
  {
    id: "queen-of-the-seventh-circle",
    name: "Queen of the Seventh Circle",
    title: "Every war anybody prayed about, answered at once.",
    blurb: "A war goddess assembled out of overlapping myths, holding the circle of violence.",
    lore: "Mortals built war gods out of every tradition they had, and Hell built one out "
      + "of the leftovers. She is not any of them and she is all of the prayers: a new "
      + "entity born from overlapping legends, holding the circle where the violent are "
      + "kept, entirely at home there.",
    layerId: "hell-layers",
    unlockFrontier: 16,
    element: "fire",
    // The Herald already opens with cinders and a volley and closes with the room on
    // fire. A war goddess is that, with more of it arriving at once.
    templateId: "herald",
    sprite: "bossWarQueen",
    // A war goddess assembled out of every tradition's leftovers, holding the circle where
    // the violent are kept. Her signature is *everything at once*, which is what "every war
    // anybody prayed about, answered simultaneously" has to mean mechanically: `crescendo`
    // is the only ability in the game that never comes back down, so the longer the prayer
    // goes on the louder it gets, and there is no waiting it out. `volley`, `starLance` and
    // `meteor` are the answers arriving, and `backlash` is what standing in front of her
    // costs while they do.
    signature: ["crescendo", "volley", "starLance", "meteor", "backlash"],
    finalPhase: "The Prayer Answered",
    biome: THE_SEVENTH_CIRCLE,
    baseDepth: 16, depthPerTier: 2.2, dangerPerTier: 1.17,
  },
];

export const RAID_BY_ID: Readonly<Record<string, RaidSpec>> = Object.fromEntries(
  RAIDS.map((r) => [r.id, r]),
);

export function isRaidId(id: unknown): id is string {
  return typeof id === "string" && id in RAID_BY_ID;
}

/** The boss id a raid's encounter emits, and the id a `raid` drop source names. */
export function raidBossId(raidId: string): string {
  return `raid-${raidId}`;
}

/** The raid a boss id belongs to, or null for any other encounter. */
export function raidOfBossId(bossId: string): RaidSpec | null {
  if (!bossId.startsWith("raid-")) return null;
  return RAID_BY_ID[bossId.slice("raid-".length)] ?? null;
}

/** The layer this raid holds the gate of. Its `raidId` points back — `tools/raids.ts` pins it. */
export function raidLayer(spec: RaidSpec): WorldLayer | null {
  return LAYER_BY_ID[spec.layerId] ?? null;
}

/** The raid standing at a layer's gate, or null for the layers nothing holds. */
export function raidForLayer(layer: WorldLayer): RaidSpec | null {
  return layer.raidId ? RAID_BY_ID[layer.raidId] ?? null : null;
}

// --- when it opens ----------------------------------------------------------

/**
 * Whether the account has been far enough to be seen by this raid.
 *
 * Keyed on the **frontier** — the further of the depth record and the height record (§21)
 * — because two of these four stand on the ascent's side of the world and the other two
 * on the descent's, and a climber has earned the Tyrant exactly as a delver has earned the
 * Minotaur. Widening only, like every §23 unlock: no save can lose access to a raid it
 * could already open.
 */
export function raidUnlocked(spec: RaidSpec, frontier: number): boolean {
  return frontier >= spec.unlockFrontier;
}

/**
 * The highest tier open for a raid, out of `GameState.raidProgress`.
 *
 * Keyed by raid id rather than by `RunModeId`, exactly as `planetProgress` is and for the
 * identical reason: the roster is its own open-ended list, and `riftTiers` is a fixed map
 * over a union. Clearing a raid's boss and banking it opens the next tier; extracting
 * early opens nothing, which is the same asymmetry every rift has.
 */
export function raidTiersOpen(spec: RaidSpec, progress: Readonly<Record<string, number>>): number {
  return Math.max(1, Math.floor(progress[spec.id] ?? 1));
}

// --- the encounter ----------------------------------------------------------

/**
 * Rebuilds a template's phase list into a raid's.
 *
 * The `CLAUDE.md` boss rules, made structural rather than trusted — the same three moves
 * `provingPhases` makes, so a raid and a Proving cannot drift apart in what "a rebuilt
 * encounter" means:
 *
 * 1. **Every phase is the union of every phase before it**, so the room only ever gets
 *    busier. The authored encounters mostly but not strictly do this; unioning makes it
 *    true by construction.
 * 2. **The signature is folded in** — one ability from phase one, so the fight reads as
 *    this raid from the first cast, and all of them from phase two.
 * 3. **A final phase is appended**, never substituted: everything it has, plus `enrage`,
 *    faster, with a wave of adds on entry.
 *
 * Nowhere here invents an ability. A raid is authored out of the existing vocabulary,
 * which is what lets four of them cost four data entries.
 */
export function raidPhases(spec: RaidSpec, template: BossSpec): readonly BossPhase[] {
  const seen = new Set<BossAbilityId>();
  const phases: BossPhase[] = template.phases.map((phase, i) => {
    for (const id of phase.abilities) seen.add(id);
    if (i === 0) {
      const first = spec.signature[0];
      if (first) seen.add(first);
    } else {
      for (const id of spec.signature) seen.add(id);
    }
    // Never gentler, phase for phase, than the deepest authored encounter: a raid that
    // opened slower and with fewer adds than the depth-30 floor would be the hardest
    // thing in the game only on paper. The same floor `provingPhases` applies, and it is
    // there because the Proving was measured without it and came out easier.
    const ref = REFERENCE.phases[Math.min(i, REFERENCE.phases.length - 1)]!;
    return {
      ...phase,
      abilities: [...seen],
      haste: Math.min(phase.haste, ref.haste),
      addsOnEnter: Math.max(phase.addsOnEnter, ref.addsOnEnter),
    };
  });

  const last = phases[phases.length - 1]!;
  const refLast = REFERENCE.phases[REFERENCE.phases.length - 1]!;
  const finale = new Set(seen);
  finale.add("enrage");
  phases.push({
    at: RAID_LAST_PHASE_AT,
    name: spec.finalPhase,
    abilities: [...finale],
    haste: Math.max(RAID_HASTE_FLOOR, Math.min(last.haste * 0.85, refLast.haste)),
    speed: last.speed * 1.05,
    addsOnEnter: Math.max(last.addsOnEnter + 3, refLast.addsOnEnter + 1),
  });
  return phases;
}

/**
 * The raid's encounter, as a `BossSpec` the existing boss brain runs unmodified.
 *
 * Borrowed and reskinned per the `planetBossSpec` precedent — same ability
 * vocabulary, same `game/boss.ts` — except the sprite, which is the raid's own (§1.5:
 * the silhouette is what a player reads first, so it is not a thing to borrow) — then rebuilt per `legendBossSpec`'s: the stat line
 * comes off the reference encounter rather than the template, and the phases are
 * cumulative with a finale appended.
 *
 * Independent of tier on purpose. A raid tier is `danger`, and `danger` already multiplies
 * every number in `profileFor` that this spec is a multiple of; a spec that also grew with
 * the tier would be applying the difficulty twice and calling it design.
 */
export function raidBossSpec(spec: RaidSpec): BossSpec {
  const template = BOSSES.find((b) => b.id === spec.templateId) ?? REFERENCE;
  return {
    ...template,
    id: raidBossId(spec.id),
    name: spec.name,
    title: spec.title,
    element: spec.element,
    sprite: spec.sprite,
    health: REFERENCE.health * RAID_HEALTH,
    damage: REFERENCE.damage * RAID_DAMAGE,
    selfResist: RAID_SELF_RESIST,
    phases: raidPhases(spec, template),
  };
}

// --- threat rate: the third lever -------------------------------------------

/**
 * How much faster a raid boss's rotation runs for a party of this size.
 *
 * `docs/raid-party-scaling.md` measured the problem and rejected two fixes for it. The
 * problem: **a growing party dilutes threat.** A raid boss is one body running one
 * rotation, so it delivers a roughly fixed amount of danger per second no matter how many
 * people are standing in the room — and that danger is then divided among them. Measured
 * on the shipped `partyScale`, damage taken *per player* nearly halves from solo to a full
 * party on the Ferryman at tier 1, while a fight already past the party's power just gets
 * bloodier without getting more winnable.
 *
 * Health scaling was tried and failed (a longer fight is not a harder one, it is the same
 * fight for longer). Damage scaling was tried and failed (it makes a caught telegraph a
 * one-shot without making the fight ask more of anybody). Both are in that document.
 *
 * This is the third lever and the one that actually names the measured problem: if the
 * complaint is *danger per second, divided*, then the answer is *more seconds' worth of
 * danger*. The rotation runs faster, so a party of four is asked more questions than a
 * solo player is, rather than the same questions with more people available to answer
 * each one.
 *
 * Three things it deliberately does not do:
 *
 * - **It does not touch the wind-up.** Only the gap *between* casts shrinks. Every
 *   telegraph is exactly as long and exactly as readable as it is solo, which is the one
 *   rule none of this may cost. A boss with a short gap stands and casts almost
 *   continuously, and since a cast locks the body, that is still the window to hit it.
 * - **It is not a second difficulty curve.** It multiplies the same `BOSS_ACTION_GAP` the
 *   one rotation already uses, and it is exactly 1 at one player — so nothing about a solo
 *   raid moves, and `tools/raids.ts`'s same-depth-same-danger comparison against a Delve
 *   floor is untouched (that check always runs at the default `players: 1`).
 * - **It does not pay more.** `danger` is not involved, so §16's reward curve never sees
 *   it. A party is asked more; it is not paid more for being a party.
 *
 * **Scoped to raids and only raids.** The Delve's own boss floors are the same *shape* of
 * encounter and are shipped and played; retuning their co-op difficulty is a live balance
 * change needing the owner's sign-off, and `docs/raid-party-scaling.md` already declined
 * to extend its finding there for the same reason.
 */
export function raidThreatRate(players: number): number {
  const n = Math.max(1, Math.floor(players));
  if (n <= 1) return 1;
  // Sub-linear on purpose. Fully linear (1/n) would hold damage-per-player exactly
  // constant on paper, but a party genuinely does bring something a solo player does not
  // — revives, and the ability to be in two places — so charging the full headcount would
  // make a party strictly worse than the sum of its players. `RAID_THREAT_PER_PLAYER` is
  // the share of a headcount actually charged, and the measurement is what set it.
  return Math.max(RAID_THREAT_FLOOR, 1 / (1 + RAID_THREAT_PER_PLAYER * (n - 1)));
}

/** How much of each extra player's headcount is charged back as rotation speed. */
export const RAID_THREAT_PER_PLAYER = 0.42;
/**
 * The tightest the threat-rate term alone may squeeze the gap between casts.
 *
 * Separate from `RAID_HASTE_FLOOR`, which floors the *phase*'s haste — this floors the
 * party term on top of it, so the two cannot multiply into a rotation with no gap at all.
 */
export const RAID_THREAT_FLOOR = 0.45;

// --- the run ----------------------------------------------------------------

/**
 * One raid, at one tier — `riftConfig` with the raid carried alongside, the way
 * `planetConfig` carries a sector.
 *
 * There is exactly one floor and it is the boss, so `bossFloor` and `lastFloor` are both
 * true and `nextFloorConfig` is never reached. `danger` compounds exponentially in the
 * tier and is then handed to the one difficulty curve; nothing here is a second curve.
 */
export function raidConfig(spec: RaidSpec, tier: number, challengerTier = 0, players = 1): RunConfig {
  const t = Math.max(1, Math.floor(tier));
  const depth = Math.round(spec.baseDepth + spec.depthPerTier * (t - 1));
  return {
    mode: MODES.raid,
    tier: t,
    floor: 1,
    depth: Math.max(1, depth),
    danger: Math.pow(spec.dangerPerTier, t - 1) * challengerMultiplier(challengerTier),
    bossFloor: true,
    lastFloor: true,
    challengerTier,
    players,
    raid: { spec, tier: t },
  };
}

// --- validation (the `npm run raids` gate reads this) -----------------------

/**
 * Everything structurally wrong with one raid definition, as sentences. Empty means it is
 * well-formed as data; `tools/raids.ts` adds the checks that need the boss rules, the
 * layer table, the drop tables and a live dungeon.
 */
export function raidProblems(spec: RaidSpec): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(spec.id)) out.push(`id "${spec.id}" is not kebab-case`);
  if (!spec.name.trim()) out.push("no name");
  if (!spec.title.trim()) out.push("no title line");
  if (!spec.blurb.trim()) out.push("no blurb");
  if (!spec.lore.trim()) out.push("no lore line");
  if (!BOSSES.some((b) => b.id === spec.templateId)) {
    out.push(`template "${spec.templateId}" names no encounter`);
  }
  const layer = raidLayer(spec);
  if (!layer) out.push(`layer "${spec.layerId}" names no world layer`);
  else {
    if (layer.raidId !== spec.id) out.push(`layer "${layer.id}" does not name this raid back (${layer.raidId ?? "null"})`);
    if (spec.unlockFrontier < layer.from) {
      out.push(`unlocks at frontier ${spec.unlockFrontier}, before its own layer begins at ${layer.from}`);
    }
  }
  if (spec.signature.length === 0) out.push("no signature abilities — it would be the template with a new name");
  if (!spec.finalPhase.trim()) out.push("no name for the appended final phase");
  if (!(spec.baseDepth >= 1)) out.push("baseDepth must be >= 1");
  if (!(spec.depthPerTier >= 0)) out.push("depthPerTier must be >= 0");
  if (!(spec.dangerPerTier > 1)) out.push("dangerPerTier must be > 1 — a tier ladder that isn't exponential doesn't stop anybody");
  if (!(spec.unlockFrontier >= 1)) out.push("unlockFrontier must be >= 1");
  return out;
}
