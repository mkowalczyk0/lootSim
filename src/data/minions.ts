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
