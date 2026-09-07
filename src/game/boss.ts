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
 *
 * Simulation only — it never draws anything. Everything the renderer needs shows up as
 * a telegraph, a ground zone or a run event.
 */

import { clamp, dist, normalize, TAU } from "../core/math";
import {
  BOSS_ABILITIES, BOSS_ACTION_GAP, type BossAbility, type BossAbilityId,
} from "../data/bosses";
import { ELEMENT_COLORS } from "../data/elements";
import type { Dungeon } from "./dungeon";
import type { Enemy } from "./entities";

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
    // Face the player through the wind-up so a cone or a line still means something.
    const aim = d.aimAvatar(e.x, e.y);
    e.facing = Math.atan2(aim.y - e.y, aim.x - e.x);
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
  b.cooldowns[id] = ability.cooldown * phase.haste * b.buffHasteMult;
  const aimed = d.aimAvatar(e.x, e.y);
  b.aimX = ability.onSelf ? e.x : aimed.x;
  b.aimY = ability.onSelf ? e.y : aimed.y;

  d.emit({ kind: "bossCast", name: ability.name, time: cast });
  paintTelegraph(d, e, ability, cast);
}

/** Puts the ability's danger zone on the floor for the whole wind-up. */
function paintTelegraph(d: Dungeon, e: Enemy, ability: BossAbility, cast: number): void {
  if (ability.shape === "none") return;
  const b = e.boss!;
  const element = b.spec.element;
  const victim = d.aimAvatar(e.x, e.y);
  const toPlayer = Math.atan2(victim.y - e.y, victim.x - e.x);
  const damage = e.damage * ability.damage * b.buffDamageMult;
  const instances = Math.max(1, ability.count || 1);

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
        hitsEnemies: ability.shape === "line",
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
        hitsPlayer: true, hitsEnemies: true,
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
    // A boss's own adds are not immune to the floor it sets on fire.
    hitsEnemies: ability.shape === "circle" || ability.shape === "line",
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
  b.actionTimer = BOSS_ACTION_GAP * phase.haste * d.profile.aggression * b.buffHasteMult;
  if (!id) return;

  const ability = BOSS_ABILITIES[id];
  const element = b.spec.element;
  const damage = e.damage * ability.damage * b.buffDamageMult;

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
      const charging = d.aimAvatar(e.x, e.y);
      const dir = normalize(charging.x - e.x, charging.y - e.y);
      b.chargeTimer = CHARGE_TIME;
      b.chargeVx = dir.x * CHARGE_SPEED;
      b.chargeVy = dir.y * CHARGE_SPEED;
      d.emit({ kind: "shake", amount: 10 });
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
        amount: id === "quake" || id === "ringOut" || id === "windmill" || id === "wall" || id === "starLance"
          ? 12 : 5,
      });
      break;
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
    hitsPlayer: true, hitsEnemies: true,
    linger: ability.linger,
    followId: null,
  });
}
