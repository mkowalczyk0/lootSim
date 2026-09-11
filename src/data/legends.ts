/**
 * The Proving — endgame class completion (UAT §13 + §14).
 *
 * Every class is a **Legend** (`docs/game_story_worldbuilding.md`, THE LEGENDS): a
 * legendary soul the Keepers summoned back into physical form. LEGEND MASTERY there says
 * a character begins as a *partial* manifestation of that Legend and spends the whole
 * game recovering the rest of it — memories, techniques, weapons, relics, fragments of
 * its own myth. CLASS COMPLETION says the ultimate goal is an endgame encounter proving
 * that recovery finished, after which *the Legend becomes Complete* and the class wears a
 * gold border.
 *
 * So this file answers one question: what is standing at the bottom? The doc's own
 * closing questions ask why *the Abyss seems to recognize the Legends*. The answer here:
 * the fragments you never recovered didn't go nowhere. The Abyss kept them, assembled
 * them, and they have had the whole war to practise. You cannot be a complete
 * manifestation of your Legend while part of your myth is down there wearing your face.
 *
 * ### Where it lives: the bottom of the Delve, not a new system
 *
 * §14 asks that this be tied into the Delve before anything separate gets built, and it
 * already fits: **depth 30 is where the authored world ends.** `biomeFor` runs out of
 * biomes at its last one ("The Veil") from depth 26, `bossFor` runs out of encounters
 * from depth 25, and the encounter it settles on is titled "You should not have come this
 * far." Past 30 the Delve is arithmetic. So the bottom needed a door, not a mode.
 *
 * The Delve's ladder is **not** capped — descending 30 → 31 works exactly as it always
 * did (three separate passages of `CLAUDE.md` promise no upper bound, and deleting
 * endless descent is not this feature's call to make). What changed is only that depth
 * 30 stops being a generic boss floor once you've earned the right to be measured there.
 *
 * ### The gate is per-class, and it needs no new gate state
 *
 * Depth 30 is the ordinary Nameless floor until *this class* has **cleared the bottom and
 * banked it** (`Player.deepestDepth >= DELVE_BOTTOM` — already persisted, already
 * per-class). From then on, depth 30 **is** that class's Proving, forever, repeatable.
 * Your first trip down is the descent; every trip after, the Abyss has your measure.
 *
 * "Cleared and banked" is the literal gate, not a paraphrase, because `recordDepth` is
 * only ever reached from `Dungeon.bank(true)`: **dying** at depth 30 banks nothing, and
 * **bailing out** through the entrance portal runs `bank(false)`, which forfeits the
 * floor's progression along with its loot (UAT §6). Touching the bottom therefore never
 * qualifies you — beating it once does. That is the better gate of the two and it is the
 * one that shipped, so this comment says so rather than something softer.
 *
 * That also closes the alt loophole for free. `GameState.maxUnlockedDepth` is
 * account-wide, so an alt *can* direct-dive to 30 — but it cannot qualify on the main's
 * record, and `requiredLevel` means it cannot borrow the main's gear either. Class
 * investment is the gate and difficulty enforces it.
 *
 * Reaching depth 30 by *any* route counts, rift effective depths included, because
 * `recordDepth` feeds one per-class number. Deliberate: the requirement is that this
 * character can stand at the bottom, not which door it walked through.
 *
 * ### Solo only, in v1
 *
 * Same call `data/daily.ts` made for the Vigil, for a sharper reason: completion credit
 * must not be duplicable or desyncable. In a party, depth 30 stays the ordinary Nameless
 * floor — `provingFloor` refuses anything but a solo run, so no split-roster credit
 * exists to get wrong and `configToWire` never has to learn a new field.
 *
 * ### The encounter
 *
 * Borrowed wholesale from an existing `BossSpec` and reskinned, exactly as
 * `planetBossSpec` already does — that is what keeps a 21st final boss from costing a
 * 21st content pipeline. What `legendBossSpec` overrides on top: identity, the class's
 * own element, a harder stat line, and a phase list rebuilt so it is *strictly*
 * cumulative with a final phase appended. See `provingPhases`.
 *
 * Pure data. Nothing here knows what a canvas or a `GameState` is.
 */

import { BOSSES, type BossAbilityId, type BossPhase, type BossSpec } from "./bosses";
import { CLASSES, type ClassId } from "./classes";
import type { RunConfig } from "./modes";

// --- the bottom ------------------------------------------------------------

/**
 * The depth the authored world ends at, and so the depth the Proving stands on.
 *
 * Lives here rather than in `data/modes.ts` for the same reason `DAILY_UNLOCK_DEPTH`
 * lives in `data/daily.ts`: it is a fact about the content that gives the number meaning,
 * not about how a run is configured. `delveConfig` is untouched by this feature — depth
 * 30 is already `bossFloor: true`, which is all the Delve itself has to know.
 */
export const DELVE_BOTTOM = 30;

/**
 * The encounter the Proving's *stat line* is measured against: the deepest authored one,
 * which is also the exact encounter a character who hasn't qualified yet meets on this
 * same floor.
 *
 * This is not the same thing as the template a legend borrows its *kit* from, and the
 * distinction is load-bearing. Scaling off the template was the first version, and it was
 * wrong: the authored encounters range from 72 health (the depth-5 Warden) to 145 (the
 * depth-30 Nameless), so a legend borrowing the Warden's kit came out at 97 — *below* the
 * ordinary depth-30 boss. Measured, before the fix: a Warden-template Proving left its
 * boss at 74% after 94 seconds while the ordinary Nameless floor killed the same
 * character in 18. The hardest fight in the game was quietly the easier of the two, and
 * which class you played decided it.
 *
 * So the kit varies by template and the stat line does not. Every Proving is the deepest
 * authored encounter plus a margin, whichever body it wears.
 */
const REFERENCE = BOSSES[BOSSES.length - 1]!;
/** Multiplies the reference encounter's health. Deliberately modest — see `provingPhases`. */
export const PROVING_HEALTH = 1.35;
/** Multiplies the reference encounter's damage. Also modest, for the same reason. */
export const PROVING_DAMAGE = 1.12;
/**
 * Resistance to its own element, which is *your* class's element.
 *
 * Below the Nameless's 220 on purpose. The one element a themed build is most likely to
 * have stacked is the one its class points at, so a Proving that resisted like the
 * deepest Delve boss would read as "your build is disqualified" rather than "your build
 * is taxed". Physical never gets a self-resist at all (`spawnBoss` skips it) — the rule
 * in `CLAUDE.md` that a floor must never resist the damage everyone always has applies
 * hardest to the floor you cannot skip.
 */
export const PROVING_SELF_RESIST = 150;
/**
 * The Abyss's own contribution to the fight, added to every Proving from its **second**
 * phase onward whatever kit it borrowed.
 *
 * The structural rule — "every phase needs at least one ability that reaches across the
 * arena, or the fight can be beaten by walking backwards" — was satisfied by the melee
 * templates on a technicality: the Warden's `slam` lands where you were standing, so it
 * reaches, and the audit passed. Playing it said otherwise. Measured on a level 70
 * character: a Warden-kit Proving cost 4,125 damage while the ordinary depth-30 Nameless
 * floor cost 12,266, because a kiting player is never in range of a cleave, a quake or a
 * windmill. Same stat line, a third of the pressure, decided entirely by which class you
 * picked.
 *
 * `ringOut` is the answer to kiting by design (the mirror of a quake: *get in*), and
 * `beam` is a line that crosses the room. Both are existing abilities, so this adds no
 * vocabulary — it just refuses to let a class's final exam be a melee brawl it can walk
 * away from. Phase one is left template-pure on purpose: the fight opens reading as your
 * class, and what the Abyss kept arrives as the room closes in.
 *
 * **It used to also carry `meteor` and `starLance`, and it no longer does.** Those two
 * were never part of the measured fix — the measurement was about *reach*, and the two
 * abilities named above are the reach. What the extra two bought was convergence: four
 * shared cards on top of five shared templates meant 21 classes resolved to five fights,
 * measured at 71.8% mean pairwise overlap and 100% at worst (`tools/bossvariety.ts`).
 * The Proving is the one encounter whose entire premise is that it is *your* Legend's
 * missing half, so that was the worst number in the report.
 *
 * They are replaced one-for-one by `LegendSpec.signature`, which is per class. The
 * anti-kite guarantee is untouched and the kit is the same size; what changed is that
 * two of the four cards are now yours.
 */
export const PROVING_CORE: readonly BossAbilityId[] = ["ringOut", "beam"];
/**
 * The tightest the gap between casts is ever allowed to get. `BOSS_ACTION_GAP *
 * BOSS_CADENCE` times this is that gap — §39 added the second factor, and the floor
 * scales with it on purpose, since a tighter rotation is the whole point of that change.
 * A rotation short enough to overlap its own wind-ups would break the one rule the whole
 * encounter rests on: if a hit landed, it was readable.
 */
export const PROVING_HASTE_FLOOR = 0.42;
/** Health fraction the appended final phase begins at. */
export const PROVING_LAST_PHASE_AT = 0.15;
/** Name of that phase. What it has left is the part of you it kept. */
export const PROVING_LAST_PHASE_NAME = "The Last Fragment";

// --- the legends -----------------------------------------------------------

export interface LegendSpec {
  readonly classId: ClassId;
  /**
   * Which existing encounter's kit, sprite and phase shape this borrows — a `BossSpec.id`
   * from `data/bosses.ts`. Chosen so the fight *reads* as the class: the ranged classes
   * inherit the Choir's lances and beams, the heavy ones the Colossus's charge and quake.
   */
  readonly template: string;
  /** The deadpan line under the name on the boss frame. */
  readonly title: string;
  /**
   * The two abilities that make this Proving *this class's* Proving, added from phase two
   * alongside `PROVING_CORE`.
   *
   * Every entry is one of the eight abilities added in the boss-variety pass, and that is
   * deliberate rather than incidental: an ability drawn from the original fifteen is
   * already in some template, so half the roster would have "gained" a card it was
   * holding anyway and the Provings would have re-converged on the templates. Drawing
   * from the new eight guarantees the addition is real for every class whatever it
   * borrowed.
   *
   * Chosen to read as the class rather than to fill a slot — the thing you fight is the
   * part of your own Legend the Abyss kept, so it should fight like you. No two classes
   * carry the same pair.
   */
  readonly signature: readonly [BossAbilityId, BossAbilityId];
}

/**
 * One per class. The *name* is constructed rather than authored (`legendName`), and no
 * mythological figure is named here on purpose: the worldbuilding doc names exactly two
 * (Arthur Pendragon as a Swordsman, Cu Chulainn as a Lancer) and explicitly keeps Merlin
 * out of the playable roster, so authoring 21 legendary identities would be inventing a
 * parallel fiction alongside the one that already exists. A class supports *many*
 * manifestations by that doc's design; what is unfinished is the archetype, whoever is
 * currently wearing it.
 */
export const LEGENDS: Record<ClassId, LegendSpec> = {
  lancer: {
    classId: "lancer", template: "colossus",
    title: "It has your reach. It has had longer to practise.",
    // Reach and momentum: it closes the distance itself, then strikes the same ground twice.
    signature: ["hunt", "judgment"],
  },
  berserker: {
    classId: "berserker", template: "warden",
    title: "Same axe. None of the restraint.",
    // Rage as a resource, and the resource never spends down. It only comes at you faster.
    signature: ["crescendo", "hunt"],
  },
  swordsman: {
    classId: "swordsman", template: "warden",
    title: "Every duel you never finished, standing up.",
    // Edge and tempo — the second beat, and a duel it insists on having alone.
    signature: ["judgment", "mark"],
  },
  magician: {
    classId: "magician", template: "herald",
    title: "It remembers the spells you decided not to learn.",
    // Mana and consequence: it spares the ground it chooses to, and it is still casting.
    signature: ["crescendo", "sanctuary"],
  },
  shaman: {
    classId: "shaman", template: "colossus",
    title: "It has been patient. That was always the dangerous part.",
    // Rot and patience. What it puts down does not stay where you left it.
    signature: ["drift", "mark"],
  },
  ranger: {
    classId: "ranger", template: "choir",
    title: "It picked the range. You get to walk.",
    // It picked the range. Now it picks where you are allowed to stand.
    signature: ["hunt", "mark"],
  },
  juggernaut: {
    classId: "juggernaut", template: "colossus",
    title: "Immovable, and no longer on your side.",
    // Immovable, so the room moves: it cuts the floor in half and gets louder.
    signature: ["crescendo", "sunder"],
  },
  duelist: {
    classId: "duelist", template: "warden",
    title: "It knows the opening you keep leaving.",
    // Precision and tempo, without the walking.
    signature: ["blink", "judgment"],
  },
  warlock: {
    classId: "warlock", template: "nameless",
    title: "The debt, collected in person.",
    // Debt and the void: it takes the room apart and steps through the gap. Deliberately
    // not `crescendo` + `drift`, which the Queen of the Seventh Circle and the Ferryman
    // between them already own — a Warlock's Proving holding a whole raid's signature is
    // how the game's set piece stops being a set piece (`tools/bossvariety.ts` catches it).
    signature: ["blink", "sunder"],
  },
  monk: {
    classId: "monk", template: "warden",
    title: "The form, perfected without you.",
    // Flow and discipline: it decides which ground is correct, and who may stand on it.
    signature: ["mark", "sanctuary"],
  },
  necromancer: {
    classId: "necromancer", template: "choir",
    title: "It kept everything you ever raised.",
    // The kill is the point, and every body it leaves is somewhere you cannot stand.
    signature: ["crescendo", "mark"],
  },
  corsair: {
    classId: "corsair", template: "herald",
    title: "It never put the weapon down.",
    // Reach without the weight — it is never where the weight would have to be.
    signature: ["blink", "sanctuary"],
  },
  trickster: {
    classId: "trickster", template: "choir",
    title: "Already somewhere else. Still hitting you.",
    // Gone before it lands, and so is the floor.
    signature: ["blink", "drift"],
  },
  reaper: {
    classId: "reaper", template: "warden",
    title: "The swing goes all the way around. It always did.",
    // The widest swing in the game, left lying where it fell.
    signature: ["drift", "sunder"],
  },
  stormcaller: {
    classId: "stormcaller", template: "choir",
    title: "Never where you left it, either.",
    // Never where you left it. Always closer than it was.
    signature: ["blink", "hunt"],
  },
  paladin: {
    classId: "paladin", template: "warden",
    title: "The last stand, held by somebody else.",
    // The last stand, with the ground to make it on — and the sentence read twice.
    signature: ["judgment", "sanctuary"],
  },
  bard: {
    classId: "bard", template: "choir",
    title: "It finished the song.",
    // A battlefield conductor. It is keeping time, and the tempo only goes one way.
    signature: ["crescendo", "judgment"],
  },
  alchemist: {
    classId: "alchemist", template: "herald",
    title: "It stopped labelling them.",
    // An improviser: it throws something, then throws it again while the first is still spreading.
    signature: ["drift", "judgment"],
  },
  engineer: {
    classId: "engineer", template: "herald",
    title: "It had the whole Delve to build.",
    // A combat builder. It partitions the room and assigns you a piece of it.
    signature: ["mark", "sunder"],
  },
  assassin: {
    classId: "assassin", template: "nameless",
    title: "You are the priority target.",
    // Priority target killer. It names the target and then is already there.
    signature: ["blink", "mark"],
  },
  warden: {
    classId: "warden", template: "colossus",
    title: "It is still guarding. Not you.",
    // Guardian of the wild: the wild closes in and cuts off the way back. Not `drift` +
    // `hunt` — that pair is the Ferryman's whole fight and a Proving must not be one.
    signature: ["hunt", "sunder"],
  },
};

/** What the boss frame reads. Constructed from the class, so it can never drift from it. */
export function legendName(classId: ClassId): string {
  return `The Unfinished ${CLASSES[classId].name}`;
}

// --- the encounter ---------------------------------------------------------

/**
 * Rebuilds a template's phase list into a Proving's.
 *
 * Two things happen here, and both are the `CLAUDE.md` boss rules made structural rather
 * than trusted:
 *
 * 1. **Every phase is the union of every phase before it.** The rule is "phases *add*
 *    abilities rather than replacing them", and the authored encounters mostly follow it
 *    but not strictly — the Herald drops its cleave on entering phase two, the Nameless
 *    drops three abilities entering phase three. Unioning makes it true by construction
 *    for all 21 legends, so the room only ever gets busier. `tools/legends.ts` asserts it.
 * 2. **A final phase is appended**, never substituted: everything the fight has, plus
 *    `enrage`, faster, with a wave of adds on entry.
 *
 * The difficulty is deliberately in *this* — pressure, not sponginess. `PROVING_HEALTH`
 * is a modest 1.35 because a longer health bar is not a harder fight; a rotation with
 * every ability in it, arriving faster, is.
 */
export function provingPhases(
  template: BossSpec, signature: readonly BossAbilityId[] = [],
): readonly BossPhase[] {
  const seen = new Set<BossAbilityId>();
  const phases: BossPhase[] = template.phases.map((phase, i) => {
    for (const id of phase.abilities) seen.add(id);
    // Phase one is the template's alone; from the second, the Abyss brings its own —
    // the shared reach that stops the fight being kiteable, and the two cards that are
    // this class's. Phase one stays template-pure for the reason it always did: the
    // fight opens reading as the kit you know, and what was kept arrives as it closes in.
    if (i > 0) {
      for (const id of PROVING_CORE) seen.add(id);
      for (const id of signature) seen.add(id);
    }
    // The borrowed body decides *what* it does; the bottom of the Delve decides how
    // relentlessly. Every phase is at least as dense as the reference encounter's phase
    // at the same index — never slower between casts, never fewer adds on entry.
    //
    // This is the third thing that had to be measured rather than reasoned about. With
    // the stat line and the anti-kite core both fixed, a level-60 character still won its
    // Warden-kit Proving 6/6 while the ordinary Nameless floor killed it 4 times in 6 —
    // twice as long a fight, and less than half as dangerous. Health was never the
    // difference; the Nameless opens at haste 0.95 with two adds already walking, and the
    // Warden opens at 1.0 with none. Flooring the pressure fixes that without touching a
    // single ability, so a class's Proving still *reads* as its own kit.
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
    at: PROVING_LAST_PHASE_AT,
    name: PROVING_LAST_PHASE_NAME,
    abilities: [...finale],
    // Tighter than the phase before it, never slower than the reference encounter's own
    // last phase, and floored so it can't outrun its own wind-ups —
    // `BOSS_ACTION_GAP * BOSS_CADENCE` times this is the gap between casts, and a gap
    // short enough to overlap the telegraphs would break the promise that a landed hit
    // was readable.
    haste: Math.max(PROVING_HASTE_FLOOR, Math.min(last.haste * 0.85, refLast.haste)),
    speed: last.speed * 1.05,
    addsOnEnter: Math.max(last.addsOnEnter + 3, refLast.addsOnEnter + 1),
  });
  return phases;
}

/**
 * The class's final encounter, as a `BossSpec` the existing boss brain runs unmodified.
 *
 * Borrowed and reskinned exactly like `planetBossSpec`: same sprite, same ability
 * vocabulary, same `game/boss.ts`. What is overridden is identity, element, the stat
 * line and the phase list — no new `BossAbilityId`, so nothing in `net/`, `render/` or
 * the telegraph pipeline has to learn anything.
 */
export function legendBossSpec(classId: ClassId): BossSpec {
  const legend = LEGENDS[classId];
  const template = BOSSES.find((b) => b.id === legend.template) ?? BOSSES[BOSSES.length - 1]!;
  return {
    ...template,
    id: `legend-${classId}`,
    name: legendName(classId),
    title: legend.title,
    // Its element is the class's own — the one your ultimate falls back to. A Legend's
    // missing half is made of the same thing the Legend is.
    element: CLASSES[classId].element,
    // Off the reference encounter, not the borrowed one — see `REFERENCE`. The body,
    // the sprite and the ability vocabulary are the template's; the stat line is the
    // bottom of the Delve's.
    health: REFERENCE.health * PROVING_HEALTH,
    damage: REFERENCE.damage * PROVING_DAMAGE,
    selfResist: PROVING_SELF_RESIST,
    phases: provingPhases(template, legend.signature),
  };
}

// --- when it happens -------------------------------------------------------

/** Whether a character has earned the right to be measured. */
export function provingUnlocked(classDeepestDepth: number): boolean {
  return classDeepestDepth >= DELVE_BOTTOM;
}

/**
 * Whether this floor is the Proving — the one predicate the simulation and the UI both
 * read, so the boss that spawns and the credit that lands can never disagree.
 *
 * `Dungeon` evaluates it **once, at construction**, and remembers the answer
 * (`Dungeon.proving`). That matters: `recordDepth` raises `Player.deepestDepth` to 30 as
 * the first-ever clear of depth 30 banks, so a predicate re-evaluated at banking time
 * would credit completion for the Nameless kill that only just qualified the character.
 */
export function provingFloor(config: RunConfig, classDeepestDepth: number): boolean {
  // Mode-scoped **positively**, not by ruling out the modes that exist today. Every other
  // mode reaches depth 30 by some route — an Abyssal Rift tier, a deep Reliquary sector —
  // and a new one can arrive with any combination of flags set, so "is this the Delve" is
  // the only formulation that stays correct without being revisited. `tools/legends.ts`
  // walks every entry in `RUN_MODES` to pin it.
  if (config.mode.id !== "delve") return false;
  if (config.planet || config.daily) return false;
  if (config.depth !== DELVE_BOTTOM) return false;
  // Solo only in v1 — see the file header.
  if ((config.players ?? 1) !== 1) return false;
  return provingUnlocked(classDeepestDepth);
}
