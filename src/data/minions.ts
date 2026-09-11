/**
 * Summoned-combatant tuning.
 *
 * A minion is a mobile body that fights for the hero who made it: the Necromancer's
 * skeletons, the Engineer's drones, the Ranger's falcon, the Warden's bear. The
 * per-class flavour (how many, how hard, how long) lives on the abilities in
 * `src/progression/<class>.ts`; the numbers here are the floor-wide rules every summon
 * obeys no matter who cast it — above all the caps, because a raid of twenty
 * Necromancers must not put a thousand pathing bodies on one floor.
 */

/** Most minions one hero may have out at once. Older ones are culled to make room. */
export const MINION_CAP_PER_OWNER = 8;

/**
 * Most minions on the whole floor at once, across every hero. A hard clamp — a summon
 * that would cross this line simply makes fewer. Sized for a four-player party today
 * with headroom; the eventual raid layer will want its own, lower per-owner number.
 */
export const MINION_CAP_GLOBAL = 28;

/** Default lifespan when an ability doesn't name one. `Infinity` means "until it dies". */
export const MINION_DEFAULT_LIFESPAN = 12;

/** Fraction of the owner's attack damage a minion deals when the ability is silent. */
export const MINION_DEFAULT_INHERIT = 0.5;

/** Telegraph before a minion's hit lands — long enough to read, short enough to matter. */
export const MINION_WINDUP = 0.18;

/** How far a `follow` minion will stray from its owner to chase an enemy. */
export const MINION_LEASH = 260;

/** How far a `guardPoint` minion ranges from the point it was told to hold. */
export const MINION_GUARD_LEASH = 150;

/** Push-apart radius so a legion spreads into a line instead of stacking on one pixel. */
export const MINION_SEPARATION = 13;

/**
 * A summon loses at most this share of its **maximum** health to any one hit, applied
 * **after** mitigation (docket §37).
 *
 * The measured defect was not a small health pool. At depth 10 the median hit landing on a
 * summon is **508 against ~29 health — seventeen times its pool** — and only 21 hits land
 * across three whole floors. Summons were not being ground down; they were occasionally
 * deleted, and nothing in the plausible range of a health buff survives a 17x overkill.
 * Inheriting the owner's mitigation (also §37) halves that at best. A cap is the only lever
 * that converts deletion into attrition.
 *
 * **After mitigation, not before, and the difference is the whole design.** Capping the raw
 * hit first and mitigating afterwards would compound: at a level-40 owner's 0.73 damage
 * reduction a quarter-cap becomes 6.75% of the pool per hit — fifteen hits to kill, which is
 * the tanking-with-skeletons problem traded in for the one-shot problem. Capping last makes
 * the bound exact and gear-independent: **a summon always dies in at most `1 / this` hits,
 * whatever its owner is wearing.** Mitigation keeps doing all the work below the cap, where
 * the hits are ordinary — at depth 22 the median hit is 49 against 139 health and the cap
 * never binds — so the two rules divide cleanly: resists govern ordinary damage and scale
 * with gear, the cap governs deletion and does not.
 *
 * 0.25 is four hits. Chosen against the fixed reference above rather than by taste: at three
 * hits (0.34) a summon still evaporates inside one telegraph's dwell time, and at eight
 * (0.125) a skeleton outlives the boss ability that hit it. Four is the smallest number that
 * gives a player a resummon window and it is still short enough that a summon standing in a
 * raid boss's fire dies to it — `tools/summon-scaling.ts` asserts exactly that.
 */
export const MINION_MAX_HIT_FRACTION = 0.25;
