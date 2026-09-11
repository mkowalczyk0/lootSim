/**
 * The raid boss brain.
 *
 * A boss doesn't chase and swing like everything else on the floor. It stands there
 * being enormous and runs a rotation: pick an ability the phase allows, paint its shape
 * on the floor, hold still while the player reads it, then resolve. Health only decides
 * which phase it's in; the fight is made of the shapes.
 *
 * The rules the encounters follow:
 *  - Every ability is telegraphed. If a hit lands, it was readable.
 *  - Casting locks the boss in place, so the wind-up is also your window to hit it.
 *  - Phases add abilities rather than replacing them, so the floor gets busier.
 *  - The boss ignores knockback. You are not going to stagger it with a sword.
 *  - **No telegraph ever hits another enemy** (`hitsEnemies` is always `false` on every
 *    `addTelegraph` call below, direct hit and the lingering ground zone it leaves both).
 *    This used to be `true` at most sites — deliberately, per a comment that argued "a
 *    boss's own adds are not immune to the floor it sets on fire" — until an owner bug
 *    report (Sept 2026) called a boss's AoE killing its own summons out as unwanted, on
 *    playtest, and that reading wins over the earlier reasoning. `mark`'s add-chasing
 *    telegraph is untouched by this: that mechanic is about the shape riding the add so
 *    the player has to stand away from it, never about the add taking damage from it.
 *
 * Simulation only — it never draws anything. Everything the renderer needs shows up as
 * a telegraph, a ground zone or a run event.
 */

import { clamp, dist, TAU } from "../core/math";
import {
  BOSS_ABILITIES, BOSS_ACTION_GAP, BOSS_CADENCE, HUNT_SPEED, PATTERNS, isPattern,
  type BossAbility, type BossAbilityId, type PatternId,
} from "../data/bosses";
import { ELEMENT_COLORS } from "../data/elements";
import { raidThreatRate } from "../data/raids";
import { resolveCircle } from "./level";
import type { Dungeon } from "./dungeon";
import type { BossState, Enemy, PatternState } from "./entities";

/** Shortest wind-up a deep floor is allowed to squeeze an ability down to. */
const MIN_CAST = 0.45;
/** How fast a gore charge travels, and how long it lasts. */
const CHARGE_SPEED = 640;
const CHARGE_TIME = 0.5;
/** How long an enrage's damage-and-haste bonus lasts, and how much it grants. */
const ENRAGE_DURATION = 4;
const ENRAGE_DAMAGE_MULT = 1.4;
const ENRAGE_HASTE_MULT = 0.7;
/**
 * Abilities whose `count` means "telegraphs painted at once" rather than something
 * `resolveAbility` already gives its own meaning — meteor's staggered rain and volley's
 * bolt ring both reuse the same field for their own counts, so `paintTelegraph` has to
 * be told explicitly which abilities want the multi-instance treatment.
 */
const MULTI_INSTANCE: ReadonlySet<BossAbilityId> = new Set(["windmill", "starLance", "wall"]);

/**
 * What safe ground is drawn in. Not the boss's element, deliberately: every other
 * telegraph in the game is painted in the colour of the thing that is about to hurt you,
 * so a `sanctuary` disc has to read as the opposite of one at a glance.
 */
const SAFE_COLOR = "#dff3e0";

/** A `mark` sticks rather than pursues: it is beaten by separation, not by running. */
const MARK_CHASE_SPEED = 4000;
/** The gap between `judgment`'s two beats, and how much shorter the second tell is. */
const JUDGMENT_BEAT_GAP = 0.55;
const JUDGMENT_SECOND_CAST = 0.6;
/** How far a `drift` field travels per second once it is down. */
const DRIFT_SPEED = 46;
/**
 * A `crescendo` stack's haste and damage, and the most stacks that can ever land.
 *
 * The cap is the ability's own rule ("cannot be outlasted" still has to stop short of a
 * rotation that overlaps its own wind-ups) and it is deliberately low: at four stacks the
 * gap between casts is 0.82 of its base, which is pressure a good player can still read.
 */
const CRESCENDO_HASTE_PER = 0.952;
const CRESCENDO_DAMAGE_PER = 1.06;
const CRESCENDO_MAX = 4;
/**
 * How big a `sanctuary` disc is, and how far from the body the guaranteed near one may
 * land. Big enough for a party to share one; small enough that reaching it is a decision.
 */
export const SANCTUARY_DISC_RADIUS = 74;
export const SANCTUARY_NEAR_REACH = 120;
/**
 * The closest a *scattered* disc may land. Strictly greater than `SANCTUARY_NEAR_REACH`,
 * which is what makes "one disc is always near the body" a comparison rather than a hope
 * — `tools/bossvariety.ts` asserts the relationship, so nudging either number in the
 * wrong direction turns the ability back into a flat melee-uptime tax and goes red.
 */
export const SANCTUARY_FAR_MIN = 280;
/**
 * Ailment odds on a pattern bolt. Low on purpose: a field of forty bolts that each rolled
 * a full-odds burn would be a status engine rather than a movement test.
 */
const PATTERN_AILMENT = 0.12;
/** How far behind the body a `curtain` starts, and how far a `bloom` seed is drawn. */
const CURTAIN_SETBACK = 60;
const BLOOM_SEED_RADIUS = 8;
/** A marker's size when a pattern comes from the body itself. */
const PATTERN_MARKER_RADIUS = 70;

/**
 * Advances one boss. Returns true when the brain has taken over movement for this tick,
 * so the ordinary monster movement in `dungeon.ts` should leave it alone.
 */
export function updateBoss(d: Dungeon, e: Enemy, dt: number): boolean {
  const b = e.boss;
  if (!b || e.state === "spawning") return false;

  advancePhase(d, e);

  for (const key of Object.keys(b.cooldowns) as BossAbilityId[]) {
    b.cooldowns[key] = Math.max(0, (b.cooldowns[key] ?? 0) - dt);
  }
  if (b.buffTimer > 0) {
    b.buffTimer = Math.max(0, b.buffTimer - dt);
    if (b.buffTimer === 0) { b.buffDamageMult = 1; b.buffHasteMult = 1; }
  }

  // A pattern keeps firing while the boss does other things, exactly as the meteor rain
  // does — the wind-up was the lock; the emission is the field the player threads.
  advancePattern(d, e, dt);

  // Staggered drops (the meteor rain) keep landing while the boss does other things.
  if (b.pendingDrops > 0) {
    b.dropTimer -= dt;
    if (b.dropTimer <= 0) {
      b.dropTimer = 0.45;
      b.pendingDrops--;
      dropMeteor(d, e);
    }
  }

  if (b.chargeTimer > 0) {
    b.chargeTimer -= dt;
    e.x += b.chargeVx * dt;
    e.y += b.chargeVy * dt;
    return true;
  }

  if (b.castTimer > 0) {
    b.castTimer -= dt;
    // `e.facing` is not re-aimed here. It used to be, every tick, off a fresh
    // `aimAvatar` call — which meant a followId'd cone/line telegraph
    // (`updateTelegraphs` mirrors `owner.facing`) kept rotating for the whole wind-up,
    // and in a party could reassign onto a different hero than the one it was painted
    // against, an instant before it hit. `beginAbility` now locks `e.facing` once, at
    // commit, the same rule `dungeon.ts`'s charger already follows for its own wind-up.
    if (b.castTimer <= 0) resolveAbility(d, e);
    return true;
  }

  b.actionTimer -= dt;
  if (b.actionTimer <= 0) beginAbility(d, e);
  return false;
}

/** Health thresholds are one-way: a boss never goes back to being polite. */
function advancePhase(d: Dungeon, e: Enemy): void {
  const b = e.boss!;
  const phases = b.spec.phases;
  const frac = e.health / e.maxHealth;
  let next = b.phase;
  while (next + 1 < phases.length && frac <= phases[next + 1]!.at) next++;
  if (next === b.phase) return;

  b.phase = next;
  const phase = phases[next]!;
  e.speed = d.profile.enemySpeed * b.spec.speed * phase.speed;
  d.emit({ kind: "bossPhase", name: phase.name, phase: next + 1, total: phases.length });
  d.emit({ kind: "shake", amount: 16 });
  d.emit({ kind: "nova", x: e.x, y: e.y, radius: 150 });
  if (phase.addsOnEnter > 0) d.spawnAdds(phase.addsOnEnter, e.x, e.y);

  // Every phase change knocks the room back a step, so the transition is felt and not
  // just read off a health bar.
  d.addTelegraph({
    shape: "circle", x: e.x, y: e.y, angle: 0,
    radius: 150, inner: 0, arc: 0, width: 0,
    total: 0.8, damage: e.damage * 1.2, element: b.spec.element,
    color: ELEMENT_COLORS[b.spec.element],
    hitsPlayer: true, hitsEnemies: false, linger: 0, followId: e.id,
  });
}

/** Chooses an ability the current phase allows and starts winding it up. */
function beginAbility(d: Dungeon, e: Enemy): void {
  const b = e.boss!;
  const phase = b.spec.phases[b.phase]!;
  const focus = d.aimAvatar(e.x, e.y);
  const range = dist(e.x, e.y, focus.x, focus.y);

  const ready = phase.abilities.filter((id) => {
    const a = BOSS_ABILITIES[id];
    if ((b.cooldowns[id] ?? 0) > 0) return false;
    // One pattern at a time. Two fields at once is a screen, not a question; one field
    // under an ordinary circle is a busier room, which is what a later phase is for.
    if (isPattern(id) && b.pattern) return false;
    return range >= a.minRange && range <= a.maxRange;
  });
  if (ready.length === 0) {
    // Nothing fits — take a beat and try again rather than standing there forever.
    // The boss keeps walking in the meantime, which is what stops a player from simply
    // running in circles until the rotation runs out of things to do.
    b.actionTimer = 0.35;
    return;
  }

  const id = d.rng.pick(ready);
  const ability = BOSS_ABILITIES[id];
  const cast = Math.max(MIN_CAST, ability.cast * Math.max(0.7, d.profile.telegraph));

  b.ability = id;
  b.castTimer = cast;
  b.castTotal = cast;
  // The wind-up itself never shrinks below what `MIN_CAST` already guarantees — an
  // enrage buys a tighter rotation, not a shorter warning.
  // `BOSS_CADENCE` is here as well as on the recovery below, and it is load-bearing in
  // both places: this cooldown decides what `beginAbility` is allowed to *pick*, and a
  // tighter recovery with untouched cooldowns only buys more 0.35s stall beats. See the
  // constant's own doc in `data/bosses.ts`.
  b.cooldowns[id] = ability.cooldown * BOSS_CADENCE * phase.haste * b.buffHasteMult;
  const aimed = d.aimAvatar(e.x, e.y);
  b.aimX = ability.onSelf ? e.x : aimed.x;
  b.aimY = ability.onSelf ? e.y : aimed.y;
  // Committed for the whole wind-up: the wind-up is the player's window to read a fixed
  // threat, not one that can retarget them at the last instant. `paintTelegraph` reads
  // this same value rather than re-deriving it, and a followId'd cone/line telegraph
  // inherits it every tick from `owner.facing` (`updateTelegraphs`), so the painted
  // shape, the boss's own orientation and (for `charge`) the resolved hit direction are
  // all one read taken once, here.
  e.facing = Math.atan2(aimed.y - e.y, aimed.x - e.x);

  d.emit({ kind: "bossCast", name: ability.name, time: cast });
  paintTelegraph(d, e, ability, cast);
}

/** Puts the ability's danger zone on the floor for the whole wind-up. */
function paintTelegraph(d: Dungeon, e: Enemy, ability: BossAbility, cast: number): void {
  // A pattern has no shape of its own to paint — its bolts are the shape — but its
  // wind-up still has to say where it will come from and which way it will go, or the
  // opening frames are a surprise rather than a tell. So it paints a *marker*: no
  // damage, never resolves against anybody, drawn in the element's colour.
  if (isPattern(ability.id)) {
    paintPatternMarker(d, e, ability.id, cast);
    return;
  }
  if (ability.shape === "none") return;
  const b = e.boss!;
  const element = b.spec.element;
  const victim = d.aimAvatar(e.x, e.y);
  // Same value `beginAbility` just locked into `e.facing` — read rather than re-derived,
  // so there is only one place this angle is ever computed for the whole cast.
  const toPlayer = e.facing;
  const damage = e.damage * ability.damage * b.buffDamageMult * crescendoDamage(b);
  const instances = Math.max(1, ability.count || 1);

  // --- the abilities that paint something the generic path cannot express ------

  // `sanctuary`: the room goes up apart from a few discs you have to reach. One sear
  // with holes cut in it, plus a marker per disc so the safe ground is *visible* — the
  // sear alone would be a mechanic whose answer the player cannot see.
  if (ability.id === "sanctuary") {
    const discs = sanctuaryDiscs(d, e, ability);
    for (const disc of discs) {
      d.addTelegraph({
        shape: "circle", x: disc.x, y: disc.y, angle: 0,
        radius: disc.r, inner: 0, arc: 0, width: 0,
        total: cast, damage: 0, element, color: SAFE_COLOR,
        // A marker, not a hit. It exists to be looked at.
        hitsPlayer: false, hitsEnemies: false, linger: 0, followId: null,
      });
    }
    d.addTelegraph({
      shape: "circle", x: e.x, y: e.y, angle: 0,
      radius: ability.radius, inner: 0, arc: 0, width: 0,
      total: cast, damage, element, color: ELEMENT_COLORS[element],
      hitsPlayer: true, hitsEnemies: false, linger: 0, followId: e.id,
      holes: discs,
    });
    return;
  }

  // `hunt`: one circle that walks toward the player for the whole wind-up. It starts on
  // them, so standing still is standing in it; it moves at a fraction of the slowest
  // class's speed, so walking away in any direction beats it.
  if (ability.id === "hunt") {
    d.addTelegraph({
      shape: "circle", x: victim.x, y: victim.y, angle: 0,
      radius: ability.radius, inner: 0, arc: 0, width: 0,
      total: cast, damage, element, color: ELEMENT_COLORS[element],
      hitsPlayer: true, hitsEnemies: false, linger: ability.linger, followId: null,
      chaseId: d.nearestHeroIndex(e.x, e.y),
      chaseSpeed: HUNT_SPEED,
    });
    return;
  }

  // `mark`: a sticky circle on every living hero, and on a few of the bodies nearest
  // them. They all land together, so standing where two overlap means taking both —
  // there is no special damage rule, just the ordinary resolve counting you twice.
  if (ability.id === "mark") {
    for (let i = 0; i < d.heroes.length; i++) {
      const hero = d.heroes[i]!;
      if (!hero.alive) continue;
      d.addTelegraph({
        shape: "circle", x: hero.avatar.x, y: hero.avatar.y, angle: 0,
        radius: ability.radius, inner: 0, arc: 0, width: 0,
        total: cast, damage, element, color: ELEMENT_COLORS[element],
        hitsPlayer: true, hitsEnemies: false, linger: 0, followId: null,
        chaseId: i, chaseSpeed: MARK_CHASE_SPEED,
      });
    }
    // The adds get marked too, which is what makes this a mechanic solo: a summoned body
    // becomes something to stand away from rather than only something to kill. That's
    // entirely about the shape riding the add (`followId: other.id`, below) so the
    // player has to give it a wide berth — `hitsEnemies: false` doesn't touch it: the
    // add was never meant to take the hit itself, only to carry the danger zone around.
    const nearby = d.enemies
      .filter((other) => !other.boss && other.state !== "spawning")
      .sort((a, b) => dist(a.x, a.y, victim.x, victim.y) - dist(b.x, b.y, victim.x, victim.y))
      .slice(0, Math.max(0, ability.count));
    for (const other of nearby) {
      d.addTelegraph({
        shape: "circle", x: other.x, y: other.y, angle: 0,
        radius: ability.radius, inner: 0, arc: 0, width: 0,
        total: cast, damage, element, color: ELEMENT_COLORS[element],
        hitsPlayer: true, hitsEnemies: false, linger: 0, followId: other.id,
      });
    }
    return;
  }

  // `drift`: the field lands on the player and then keeps going the way it was already
  // heading — outward from the boss, through where the player was standing. The heading
  // is decided here rather than at resolve time on purpose: the direction has to be
  // readable during the wind-up, or the ability is a surprise rather than a mechanic.
  if (ability.id === "drift") {
    const heading = toPlayer;
    d.addTelegraph({
      shape: "circle", x: b.aimX, y: b.aimY, angle: heading,
      radius: ability.radius, inner: 0, arc: 0, width: 0,
      total: cast, damage, element, color: ELEMENT_COLORS[element],
      hitsPlayer: true, hitsEnemies: false, linger: ability.linger, followId: null,
      driftVx: Math.cos(heading) * DRIFT_SPEED,
      driftVy: Math.sin(heading) * DRIFT_SPEED,
    });
    return;
  }

  // A fan of cones or a cross of lines, more instances than one telegraph can express.
  // Each carries a fixed offset from wherever the boss ends up facing, so the gaps
  // between blades hold their spacing instead of collapsing onto one shared angle.
  if (MULTI_INSTANCE.has(ability.id) && instances > 1 && (ability.shape === "cone" || ability.shape === "line")) {
    const spin = ability.onSelf ? d.rng.angle() : toPlayer;
    for (let i = 0; i < instances; i++) {
      const offset = (i / instances) * TAU;
      d.addTelegraph({
        shape: ability.shape, x: b.aimX, y: b.aimY,
        angle: spin + offset, angleOffset: offset,
        radius: ability.radius, inner: ability.inner, arc: ability.arc, width: ability.width,
        total: cast, damage, element, color: ELEMENT_COLORS[element],
        hitsPlayer: true,
        hitsEnemies: false,
        linger: ability.linger,
        followId: ability.onSelf ? e.id : null,
      });
    }
    return;
  }

  // A wall of circles with exactly one gap in it, planted across wherever the player
  // was standing when the cast began — the stationary, room-control cousin of a
  // volley's ring of bolts.
  if (MULTI_INSTANCE.has(ability.id) && instances > 1 && ability.shape === "circle" && !ability.onSelf) {
    const perp = toPlayer + Math.PI / 2;
    const gap = d.rng.int(0, instances - 1);
    const spacing = ability.radius * 1.8;
    for (let i = 0; i < instances; i++) {
      if (i === gap) continue;
      const offset = (i - (instances - 1) / 2) * spacing;
      d.addTelegraph({
        shape: "circle",
        x: clamp(b.aimX + Math.cos(perp) * offset, 40, d.width - 40),
        y: clamp(b.aimY + Math.sin(perp) * offset, 40, d.height - 40),
        angle: 0,
        radius: ability.radius, inner: 0, arc: 0, width: 0,
        total: cast, damage, element, color: ELEMENT_COLORS[element],
        hitsPlayer: true, hitsEnemies: false,
        linger: ability.linger, followId: null,
      });
    }
    return;
  }

  d.addTelegraph({
    shape: ability.shape,
    x: b.aimX, y: b.aimY,
    angle: toPlayer,
    radius: ability.radius,
    inner: ability.inner,
    arc: ability.arc,
    width: ability.width,
    total: cast,
    damage,
    element,
    color: ELEMENT_COLORS[element],
    hitsPlayer: true,
    // Used to be `ability.shape === "circle" || ability.shape === "line"`, on the
    // reasoning that "a boss's own adds are not immune to the floor it sets on fire."
    // That was flavour, not a mechanic, and it lost to an owner bug report (Sept 2026):
    // a boss killing its own summons with its own AoE reads as broken on playtest, not
    // as a bit of world texture. See the file header.
    hitsEnemies: false,
    linger: ability.linger,
    // Anything centered on the boss tracks it; anything aimed at the ground does not.
    followId: ability.onSelf ? e.id : null,
  });
}

/** Fires the parts of an ability a telegraph can't express. */
function resolveAbility(d: Dungeon, e: Enemy): void {
  const b = e.boss!;
  const id = b.ability;
  b.ability = null;
  const phase = b.spec.phases[b.phase]!;
  // An enrage buys a tighter rotation on top of whatever the phase already asks for.
  // A raid boss asks a party more questions rather than harder ones — the third lever in
  // `docs/raid-party-scaling.md`, scoped to raids and exactly 1 solo. The wind-up is
  // untouched; only the gap between casts shrinks.
  b.actionTimer = BOSS_ACTION_GAP * BOSS_CADENCE * phase.haste * d.profile.aggression
    * b.buffHasteMult
    * crescendoHaste(b)
    * (d.config.raid ? raidThreatRate(d.config.players ?? 1) : 1);
  if (!id) return;

  const ability = BOSS_ABILITIES[id];
  const element = b.spec.element;
  const damage = e.damage * ability.damage * b.buffDamageMult * crescendoDamage(b);

  if (isPattern(id)) {
    startPattern(d, e, id, damage);
    d.emit({ kind: "shake", amount: 7 });
    return;
  }

  switch (id) {
    case "volley": {
      // A ring of bolts with one deliberate gap in it: there is always a way out.
      const gap = d.rng.int(0, ability.count - 1);
      const spin = d.rng.angle();
      for (let i = 0; i < ability.count; i++) {
        if (i === gap) continue;
        const angle = spin + (i / ability.count) * TAU;
        d.spawnEnemyBolt(e.x, e.y, angle, 190, damage, element, 0.5);
      }
      d.emit({ kind: "shake", amount: 6 });
      break;
    }
    case "summon": {
      d.spawnAdds(ability.count, e.x, e.y);
      d.emit({ kind: "shake", amount: 8 });
      break;
    }
    case "meteor": {
      b.pendingDrops = ability.count;
      b.dropTimer = 0.15;
      break;
    }
    case "charge": {
      // The direction was committed when the wind-up began (`e.facing`, locked in
      // `beginAbility`) rather than re-read here — a fresh `aimAvatar` call at this
      // point is exactly how the charge used to launch somewhere the telegraphed line
      // never pointed, which is the bug this lock exists to close.
      const dir = { x: Math.cos(e.facing), y: Math.sin(e.facing) };
      b.chargeTimer = CHARGE_TIME;
      b.chargeVx = dir.x * CHARGE_SPEED;
      b.chargeVy = dir.y * CHARGE_SPEED;
      d.emit({ kind: "shake", amount: 10 });
      break;
    }
    case "blink": {
      // The body leaves, and the space it was standing in collapses behind it. The
      // telegraph was painted following the boss, so it has already tracked to wherever
      // the boss was at the end of the wind-up — it resolves there, and the boss is
      // somewhere else by the time it does.
      //
      // It lands across the arena from where the player is rather than at random: a
      // blink that rolled a spot next to you would sometimes be a free gap-closer and
      // sometimes nothing, which is not a mechanic either way.
      const away = d.aimAvatar(e.x, e.y);
      const angle = Math.atan2(e.y - away.y, e.x - away.x) + d.rng.range(-0.7, 0.7);
      const reach = d.rng.range(320, 520);
      const spot = resolveCircle(
        d.level,
        clamp(away.x + Math.cos(angle) * reach, 60, d.width - 60),
        clamp(away.y + Math.sin(angle) * reach, 60, d.height - 60),
        e.radius,
      );
      e.x = spot.x;
      e.y = spot.y;
      // A teleport is the one movement in the game that must not be interpolated. The
      // renderer lerps every body from `px`/`py` to `x`/`y` (`lerpBody` in
      // `render/draw.ts`), and `updateEnemies` captured `px` at the top of this tick —
      // so without this the boss is drawn sliding across the arena for a frame instead
      // of being gone. `net/sync.ts` has the same problem over a longer window and
      // `advanceRemote` handles it there.
      e.px = e.x;
      e.py = e.y;
      d.emit({ kind: "nova", x: e.x, y: e.y, radius: 120 });
      d.emit({ kind: "shake", amount: 10 });
      break;
    }
    case "drift": {
      // The telegraph left a lingering field behind it (`linger` on the ability), and
      // `resolveTelegraph` copies `driftVx`/`driftVy` into it — so the work here is
      // already done and this exists only to shake the screen. The velocity was decided
      // when the shape was painted, in `paintTelegraph`, because the direction has to be
      // readable during the wind-up rather than sprung at the end.
      d.emit({ kind: "shake", amount: 7 });
      break;
    }
    case "judgment": {
      // The second beat: same ground, a moment later, with a shorter tell. A dash still
      // beats it outright — spend one on the first beat and you are standing in the
      // second on an empty dodge, which is the entire point.
      const second = Math.max(MIN_CAST, JUDGMENT_SECOND_CAST * Math.max(0.7, d.profile.telegraph));
      d.addTelegraph({
        shape: "circle", x: b.aimX, y: b.aimY, angle: 0,
        radius: ability.radius, inner: 0, arc: 0, width: 0,
        total: second + JUDGMENT_BEAT_GAP,
        damage, element, color: ELEMENT_COLORS[element],
        hitsPlayer: true, hitsEnemies: false, linger: 0, followId: null,
      });
      d.emit({ kind: "shake", amount: 8 });
      break;
    }
    case "crescendo": {
      // A ratchet, not a window. Unlike `enrage` there is no timer on this and it never
      // comes back down; what stops it is the cap, because a rotation short enough to
      // overlap its own wind-ups would break the promise that a landed hit was readable.
      b.crescendo = Math.min(CRESCENDO_MAX, b.crescendo + 1);
      d.emit({ kind: "nova", x: e.x, y: e.y, radius: 160 });
      d.emit({ kind: "shake", amount: 12 });
      break;
    }
    case "enrage": {
      // Ancient Resolve: no hit of its own, just a harder and faster rotation for the
      // next few seconds. The tell is the fight itself speeding up.
      b.buffTimer = ENRAGE_DURATION;
      b.buffDamageMult = ENRAGE_DAMAGE_MULT;
      b.buffHasteMult = ENRAGE_HASTE_MULT;
      d.emit({ kind: "nova", x: e.x, y: e.y, radius: 140 });
      d.emit({ kind: "shake", amount: 14 });
      break;
    }
    default:
      // Everything else was entirely the telegraph's job.
      d.emit({
        kind: "shake",
        amount: id === "quake" || id === "ringOut" || id === "windmill" || id === "wall"
          || id === "starLance" || id === "sunder" || id === "sanctuary"
          ? 12 : 5,
      });
      break;
  }
}

// --- the bullet-hell patterns -------------------------------------------------
//
// One emitter for all seven. A pattern is a stream of ordinary hostile bolts fired over
// `PATTERNS[id].duration` seconds in steps of `tick`; what differs per pattern is where
// each step's bolts start and which way they go. The bolts are `spawnEnemyBolt`'s, so
// they die on walls, cross the co-op wire as every projectile does, and hit through
// `hurtPlayer` — a dodgeable hit, which a dash beats outright and which grants the
// ordinary invulnerability window afterwards. That window is deliberate: it is what turns
// "you are in the field" from a death sentence into a cost, and makes threading it a
// skill with a margin rather than a purity test.

/** The wind-up's tell for a pattern: where it comes from, and which way it turns. */
function paintPatternMarker(d: Dungeon, e: Enemy, id: PatternId, cast: number): void {
  const b = e.boss!;
  const element = b.spec.element;
  const color = ELEMENT_COLORS[element];
  const spec = PATTERNS[id];
  b.patternTurn = d.rng.chance(0.5) ? 1 : -1;
  const marker = {
    total: cast, damage: 0, element, color,
    hitsPlayer: false, hitsEnemies: false, linger: 0,
  };
  switch (id) {
    case "stream":
      // The line it will pour along, from the body toward you.
      d.addTelegraph({
        ...marker, shape: "line", x: e.x, y: e.y, angle: e.facing,
        radius: 520, inner: 0, arc: 0, width: 10, followId: e.id,
      });
      return;
    case "sweep":
      // The ray's starting position: a quarter-turn short of you, on the side it turns
      // from. Where it ends up is the other side of you, and that is the tell.
      d.addTelegraph({
        ...marker, shape: "line", x: e.x, y: e.y,
        angle: e.facing - b.patternTurn * Math.PI / 2,
        angleOffset: -b.patternTurn * Math.PI / 2,
        radius: 420, inner: 0, arc: 0, width: 8, followId: e.id,
      });
      return;
    case "noose":
      // The ring that is about to appear around where you are standing.
      d.addTelegraph({
        ...marker, shape: "donut", x: b.aimX, y: b.aimY, angle: 0,
        radius: spec.reach, inner: spec.reach - 18, arc: 0, width: 0, followId: null,
      });
      return;
    case "curtain": {
      // The edge the weather comes in from: a line across the arena behind the body.
      const back = e.facing + Math.PI;
      const bx = e.x + Math.cos(back) * CURTAIN_SETBACK;
      const by = e.y + Math.sin(back) * CURTAIN_SETBACK;
      for (const side of [1, -1]) {
        d.addTelegraph({
          ...marker, shape: "line", x: bx, y: by,
          angle: e.facing + side * Math.PI / 2,
          radius: spec.reach, inner: 0, arc: 0, width: 8, followId: null,
        });
      }
      return;
    }
    default:
      // `spiral`, `rings`, `bloom`: it comes out of the body, in every direction.
      d.addTelegraph({
        ...marker, shape: "circle", x: e.x, y: e.y, angle: 0,
        radius: PATTERN_MARKER_RADIUS, inner: 0, arc: 0, width: 0, followId: e.id,
      });
      return;
  }
}

/** The wind-up has resolved: the field starts. */
function startPattern(d: Dungeon, e: Enemy, id: PatternId, damage: number): void {
  const b = e.boss!;
  const spec = PATTERNS[id];
  const turn = b.patternTurn;
  let angle: number;
  switch (id) {
    // The first door is where you are; the doors after it walk away from you.
    case "rings": angle = e.facing; break;
    // A quarter-turn short of you, so the ray crosses your spot midway.
    case "sweep": angle = e.facing - turn * Math.PI / 2; break;
    // The axis the weather travels along, locked with the facing at the wind-up.
    case "curtain": angle = e.facing; break;
    default: angle = d.rng.angle(); break;
  }
  b.pattern = {
    id, remaining: spec.duration, timer: 0, step: 0,
    angle, turn, damage, pending: [], elapsed: 0,
  };
}

/** Advances the pattern in flight, firing every step that has come due. */
function advancePattern(d: Dungeon, e: Enemy, dt: number): void {
  const b = e.boss!;
  const p = b.pattern;
  if (!p) return;
  const spec = PATTERNS[p.id];
  p.elapsed += dt;
  p.remaining -= dt;
  p.timer -= dt;
  // Emission stops when the duration is spent — `remaining` counts that down and nothing
  // may push it back up (an earlier draft let `bloom` extend it per seed, and a pattern
  // that extends its own window on every step never ends). The state itself outlives
  // emission only for `bloom`, until its last seed has opened.
  while (p.timer <= 0 && p.remaining > 0) {
    p.timer += spec.tick;
    emitStep(d, e, p);
    p.step++;
  }
  openSeeds(d, e, p);
  if (p.remaining <= 0 && p.pending.length === 0) b.pattern = null;
}

/** One emission step of one pattern. */
function emitStep(d: Dungeon, e: Enemy, p: PatternState): void {
  const spec = PATTERNS[p.id];
  const ability = BOSS_ABILITIES[p.id];
  const element = e.boss!.spec.element;
  const fire = (x: number, y: number, angle: number, speed = spec.bulletSpeed, opts?: { radius?: number; life?: number }) =>
    d.spawnEnemyBolt(x, y, angle, speed, p.damage, element, PATTERN_AILMENT,
      { radius: spec.bulletRadius, ...opts });

  switch (p.id) {
    case "spiral": {
      // `count` arms, wheeling at `spin`. Each step fires one bolt per arm.
      for (let i = 0; i < ability.count; i++) fire(e.x, e.y, p.angle + (i / ability.count) * TAU);
      p.angle += p.turn * spec.spin * spec.tick;
      return;
    }
    case "rings": {
      // One ring per step, `count` bolts around, a gap of `gap` of the turn centred on
      // `angle`; then the gap walks `spin` for the next ring.
      const n = ability.count;
      const gapBolts = Math.max(1, Math.round(n * spec.gap));
      for (let i = 0; i < n; i++) {
        if (i < gapBolts) continue;
        fire(e.x, e.y, p.angle + ((i - (gapBolts - 1) / 2) / n) * TAU);
      }
      p.angle += p.turn * spec.spin;
      return;
    }
    case "stream": {
      // Aimed fresh every step at where you are now — the bolts *are* the re-aim, and
      // every one of them is visible. Scatter of `gap` radians keeps it a stream.
      const at = d.aimAvatar(e.x, e.y);
      const aim = Math.atan2(at.y - e.y, at.x - e.x) + d.rng.range(-spec.gap, spec.gap);
      fire(e.x, e.y, aim);
      return;
    }
    case "curtain": {
      // `count` bolts per step, spawned anywhere along a line `reach` either side of the
      // axis behind the body, all travelling the same way down the axis.
      const back = p.angle + Math.PI;
      const bx = e.x + Math.cos(back) * CURTAIN_SETBACK;
      const by = e.y + Math.sin(back) * CURTAIN_SETBACK;
      const perp = p.angle + Math.PI / 2;
      for (let i = 0; i < ability.count; i++) {
        const off = d.rng.range(-spec.reach, spec.reach);
        fire(bx + Math.cos(perp) * off, by + Math.sin(perp) * off, p.angle);
      }
      return;
    }
    case "bloom": {
      // A slow seed toward you with some scatter, alive exactly until it opens; where it
      // will be when it does is booked now, so the ring lands where the seed was seen
      // going — not where a re-read would put it.
      const at = d.aimAvatar(e.x, e.y);
      const aim = Math.atan2(at.y - e.y, at.x - e.x) + d.rng.range(-0.9, 0.9);
      const seedSpeed = spec.reach;
      const open = spec.gap;
      fire(e.x, e.y, aim, seedSpeed, { radius: BLOOM_SEED_RADIUS, life: open });
      p.pending.push({
        x: e.x + Math.cos(aim) * seedSpeed * open,
        y: e.y + Math.sin(aim) * seedSpeed * open,
        at: p.elapsed + open,
      });
      return;
    }
    case "sweep": {
      // One fast bolt down the ray per step; the ray turns `spin` per second.
      fire(e.x, e.y, p.angle);
      p.angle += p.turn * spec.spin * spec.tick;
      return;
    }
    case "noose": {
      // A ring `reach` out from wherever you are *now*, closing inward, with a gap of
      // `gap` of the turn centred on `angle`; the next ring's gap is `spin` further on.
      const at = d.aimAvatar(e.x, e.y);
      const n = ability.count;
      const gapBolts = Math.max(1, Math.round(n * spec.gap));
      for (let i = 0; i < n; i++) {
        if (i < gapBolts) continue;
        const a = p.angle + ((i - (gapBolts - 1) / 2) / n) * TAU;
        fire(at.x + Math.cos(a) * spec.reach, at.y + Math.sin(a) * spec.reach, a + Math.PI);
      }
      p.angle += p.turn * spec.spin;
      return;
    }
  }
}

/** `bloom`: every seed whose moment has come opens into a ring where it was going. */
function openSeeds(d: Dungeon, e: Enemy, p: PatternState): void {
  if (p.pending.length === 0) return;
  const spec = PATTERNS[p.id];
  const ability = BOSS_ABILITIES[p.id];
  const element = e.boss!.spec.element;
  for (let i = p.pending.length - 1; i >= 0; i--) {
    const seed = p.pending[i]!;
    if (seed.at > p.elapsed) continue;
    p.pending.splice(i, 1);
    const spin = d.rng.angle();
    for (let k = 0; k < ability.count; k++) {
      d.spawnEnemyBolt(seed.x, seed.y, spin + (k / ability.count) * TAU, spec.bulletSpeed,
        p.damage, element, PATTERN_AILMENT, { radius: spec.bulletRadius });
    }
    d.emit({ kind: "nova", x: seed.x, y: seed.y, radius: 40 });
  }
}

/** One meteor from the rain: a small circle near the player, leaving fire behind. */
function dropMeteor(d: Dungeon, e: Enemy): void {
  const ability = BOSS_ABILITIES.meteor;
  const b = e.boss!;
  const angle = d.rng.angle();
  const reach = d.rng.range(0, 210);
  // Falls around somebody, chosen fresh for each impact so a party gets rained on
  // rather than one unlucky person eating the whole ability.
  const near = d.randomHeroAvatar();
  const x = clamp(near.x + Math.cos(angle) * reach, 40, d.width - 40);
  const y = clamp(near.y + Math.sin(angle) * reach, 40, d.height - 40);
  d.addTelegraph({
    shape: "circle", x, y, angle: 0,
    radius: ability.radius, inner: 0, arc: 0, width: 0,
    total: 0.9,
    damage: e.damage * ability.damage * b.buffDamageMult,
    element: b.spec.element,
    color: ELEMENT_COLORS[b.spec.element],
    hitsPlayer: true, hitsEnemies: false,
    linger: ability.linger,
    followId: null,
  });
}


/**
 * Where a `sanctuary`'s safe discs go.
 *
 * **One is always placed near the body**, and that is not a nicety. Safe ground that is
 * always far from the boss is a uniform melee-uptime tax wearing the costume of a
 * mechanic — the same failure the `hunt` ability was designed around (see `REGARD_HOLD`
 * in `data/traps.ts` for the measured version of that mistake). Putting one disc in the
 * boss's lap means a melee player's answer is "stay roughly where you are" and a ranged
 * player's is "come in or run to the far one", which costs both of them something
 * different and neither of them everything.
 *
 * The rest are scattered across the arena, pushed out of walls so a disc is never drawn
 * inside rock the player cannot stand in.
 */
function sanctuaryDiscs(
  d: Dungeon, e: Enemy, ability: BossAbility,
): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  const r = SANCTUARY_DISC_RADIUS;
  const count = Math.max(1, ability.count);

  const near = resolveCircle(
    d.level,
    clamp(e.x + d.rng.range(-1, 1) * SANCTUARY_NEAR_REACH, 60, d.width - 60),
    clamp(e.y + d.rng.range(-1, 1) * SANCTUARY_NEAR_REACH, 60, d.height - 60),
    r,
  );
  out.push({ x: near.x, y: near.y, r });

  for (let i = 1; i < count; i++) {
    const angle = d.rng.angle();
    const reach = d.rng.range(SANCTUARY_FAR_MIN, 560);
    const spot = resolveCircle(
      d.level,
      clamp(e.x + Math.cos(angle) * reach, 60, d.width - 60),
      clamp(e.y + Math.sin(angle) * reach, 60, d.height - 60),
      r,
    );
    out.push({ x: spot.x, y: spot.y, r });
  }
  return out;
}

/** The permanent haste a crescendo has ratcheted on. Multiplies the gap between casts. */
function crescendoHaste(b: BossState): number {
  return Math.pow(CRESCENDO_HASTE_PER, b.crescendo);
}

/** The permanent damage a crescendo has ratcheted on. */
function crescendoDamage(b: BossState): number {
  return Math.pow(CRESCENDO_DAMAGE_PER, b.crescendo);
}
