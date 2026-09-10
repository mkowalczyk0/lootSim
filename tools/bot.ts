/**
 * The scripted bot, shared by every headless harness.
 *
 * `tools/smoke.ts` and `tools/curves.ts` both play real floors, and they have to play
 * them the *same* way or their numbers cannot be compared. This module exists because
 * that stopped being true once. `tools/curves.ts` began life with paraphrased copies of
 * the helpers below and dropped the `level` argument from `FlowField.direction(level, x,
 * y)` — called with two arguments it returns `null` for every query, so the bot never
 * pathfound at all. It spent an entire measurement pass unable to walk around a wall and
 * reported the resulting wandering as "floors that cannot be completed". The same
 * paraphrase had quietly lost the donut, line, cone and burning-ground cases from
 * `escapeAngle`, so it was not dodging what the real bot dodges either.
 *
 * There is one copy now, and both files import it. **Don't paraphrase this into a new
 * harness** — import it, and if it needs to do something new, extend it here so both
 * callers get the change.
 *
 * Nothing in this file asserts anything: it is the instrument, not a test.
 */

import { Input, type Action, type AvatarInput } from "../src/core/input";
import { Rng } from "../src/core/rng";
import { CHESTS, CHEST_TIERS, type ChestTier } from "../src/data/chests";
import type { ClassId } from "../src/data/classes";
import type { RunConfig } from "../src/data/modes";
import { Dungeon, inTelegraph, type Hero, type HeroSetup } from "../src/game/dungeon";
import { itemScore, rollItem } from "../src/game/item";
import { circleHitsWall, FlowField } from "../src/game/level";
import { UNIVERSAL_TREE } from "../src/progression/universal";
import { GameState, POTION_PRICE } from "../src/game/state";

export const DT = 1 / 60;

export class FakeInput {
  private down = new Set<Action>();
  private pressed = new Set<Action>();
  hold(a: Action, on: boolean) { on ? this.down.add(a) : this.down.delete(a); }
  press(a: Action) { this.pressed.add(a); }
  beginTick() { this.pressed.clear(); }
  isDown(a: Action) { return this.down.has(a); }
  wasPressed(a: Action) { return this.pressed.has(a); }
  /** `AvatarInput`: the bot plays the exclusive-keyboard scheme, so it never aims. */
  aimAngle() { return null; }
  wasPressedOrRepeated(a: Action) { return this.pressed.has(a); }
  moveVector() {
    let x = 0, y = 0;
    if (this.down.has("left")) x -= 1;
    if (this.down.has("right")) x += 1;
    if (this.down.has("up")) y -= 1;
    if (this.down.has("down")) y += 1;
    const l = Math.hypot(x, y);
    return l === 0 ? { x: 0, y: 0 } : { x: x / l, y: y / l };
  }
}

/** Anything with an `{x, y, radius}` — a solo bot's `d.avatar` and one hero's
 *  `Hero.avatar` in a party both satisfy this, which is what lets the steering/escape
 *  helpers below serve one bot or several without knowing which. */
interface Pos { x: number; y: number; radius: number }

/**
 * Steers along a direction without walking into a wall: it tries the straight line
 * first, then progressively wider angles. Crude, but it's what a player does
 * instinctively, and without it the bot pins itself on a pillar and dies there.
 */
export function steerAngleFor(d: Dungeon, a: Pos, base: number): { x: number; y: number } {
  for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3]) {
    const ang = base + off;
    const px = a.x + Math.cos(ang) * 34;
    const py = a.y + Math.sin(ang) * 34;
    if (px < 14 || py < 14 || px > d.width - 14 || py > d.height - 14) continue;
    if (circleHitsWall(d.level, px, py, a.radius + 3)) continue;
    return { x: Math.cos(ang), y: Math.sin(ang) };
  }
  return { x: Math.cos(base), y: Math.sin(base) };
}
export function steerAngle(d: Dungeon, base: number): { x: number; y: number } {
  return steerAngleFor(d, d.avatar, base);
}

export function steerFor(d: Dungeon, a: Pos, tx: number, ty: number, retreat: boolean): { x: number; y: number } {
  const sign = retreat ? -1 : 1;
  return steerAngleFor(d, a, Math.atan2((ty - a.y) * sign, (tx - a.x) * sign));
}
export function steer(d: Dungeon, tx: number, ty: number, retreat: boolean): { x: number; y: number } {
  return steerFor(d, d.avatar, tx, ty, retreat);
}

/**
 * A real dungeon has walls a straight line can't see past, so closing on something
 * across a room graph needs an actual route, not just "nudge around whatever's directly
 * in front of you." This is exactly the field monsters already chase the player with —
 * the bot gets the same eyes a human has (it can see the level), just no better.
 */
export function approachDirFor(d: Dungeon, flow: FlowField, a: Pos, tx: number, ty: number): { x: number; y: number } {
  return flow.direction(d.level, a.x, a.y) ?? steerFor(d, a, tx, ty, false);
}
export function approachDir(d: Dungeon, flow: FlowField, tx: number, ty: number): { x: number; y: number } {
  return approachDirFor(d, flow, d.avatar, tx, ty);
}

/**
 * Where to run when something is about to go off underneath you. This is the whole
 * skill of a boss fight expressed as one function: get out of the circle, get into the
 * hole in the donut, step off the line.
 */
export function escapeAngleFor(d: Dungeon, a: Pos): number | null {
  for (const t of d.telegraphs) {
    if (!t.hitsPlayer) continue;
    if (!inTelegraph(t, a.x, a.y, a.radius + 10)) continue;
    switch (t.shape) {
      case "donut":
        // The safe spot is the hole in the middle, so run at it.
        return Math.atan2(t.y - a.y, t.x - a.x);
      case "line":
      case "cone": {
        // Step off the side rather than trying to outrun its length.
        const perp = t.angle + Math.PI / 2;
        const dx = a.x - t.x;
        const dy = a.y - t.y;
        const side = -dx * Math.sin(t.angle) + dy * Math.cos(t.angle);
        return side >= 0 ? perp : perp + Math.PI;
      }
      default:
        return Math.atan2(a.y - t.y, a.x - t.x);
    }
  }
  // Burning ground is the same problem with a longer fuse.
  for (const g of d.ground) {
    if (Math.hypot(a.x - g.x, a.y - g.y) <= g.radius + a.radius) {
      return Math.atan2(a.y - g.y, a.x - g.x);
    }
  }
  return null;
}
export function escapeAngle(d: Dungeon): number | null {
  return escapeAngleFor(d, d.avatar);
}

export interface FloorResult {
  d: Dungeon;
  seconds: number;
  peakEnemies: number;
  /** Highest number of ailments seen on a single monster — did elements do anything? */
  peakAilments: number;
  lowestMana: number;
  skillCasts: number;
  bossPhases: number;
  /** Total damage the player ate. The clearest measure of whether they played well. */
  damageTaken: number;
  potionsDrunk: number;
  /** Boss mechanics that resolved with the player still standing in them. */
  mechanicsEaten: number;
  mechanicsResolved: number;
  /** Seconds the bot spent pinned against geometry — instrument health, not game data. */
  pinned: number;
  /** Non-boss enemies that died during the run (total "death" events minus "bossDown"
   *  ones) — the boss's own AoE killing its own adds is exactly what this catches, and
   *  it's a live measurement for the enemy-friendly-fire fix (Sept 2026). */
  enemyDeaths: number;
  /** Non-boss enemies alive, averaged over every tick of the fight — a continuous
   *  reading of "how many bodies are on the floor" that a peak count can't give: two
   *  fights can share the same `peakEnemies` while one of them spends the whole rest of
   *  the fight down to one or two adds and the other stays crowded. */
  avgEnemies: number;
  /** Casts of the boss's own `summon` ability ("Call the Chorus") seen this run — lets a
   *  caller confirm the fight actually reached its summon-heavy phases rather than dying
   *  or clearing before it got there (a instrument that never sees the code under test
   *  proves nothing, see CLAUDE.md's "check your instrument can see the thing you
   *  changed"). */
  summonCasts: number;
}

/**
 * Plays a floor with a bot that chases the nearest enemy and mashes attack.
 * `dodge` is the fraction of threats it reacts to, which is the single biggest
 * difference between one player and another — see the campaign section below.
 */
export function playFloor(
  state: GameState,
  run: number | RunConfig,
  maxSeconds = 300,
  seed = 1000,
  dodge = 0.55,
  /** Fires once per simulated tick, after `d.update` — an observation hook for a
   *  caller that needs live per-tick state (monster positions, pathing, whatever)
   *  rather than just the end-of-run `FloorResult`. Optional and a no-op by default,
   *  so every existing call site is untouched. */
  onTick?: (d: Dungeon, t: number) => void,
): FloorResult {
  const d = new Dungeon(state, run, seed);
  const input = new FakeInput();
  const flow = new FlowField(d.level);
  let flowTimer = 0;
  let flowGoalX = d.avatar.x;
  let flowGoalY = d.avatar.y;
  let t = 0;
  let peakEnemies = 0;
  let peakAilments = 0;
  let lowestMana = 100;
  let skillCasts = 0;
  let bossPhases = 0;
  let damageTaken = 0;
  let mechanicsEaten = 0;
  let mechanicsResolved = 0;
  let pinnedTicks = 0;
  let deathEvents = 0;
  let bossDownEvents = 0;
  let summonCasts = 0;
  let nonBossEnemySum = 0;
  let enemyTicks = 0;
  const potionsAtStart = state.potions;
  // Input here is polled every tick, so an ungated press would chug the whole belt.
  let potionCooldown = 0;
  // Reaction rolls. A bot that dodges every telegraph perfectly walks the whole ladder
  // untouched, and a bot that never dodges dies on floor two; a real player is neither,
  // so each fresh telegraph gets a coin flip.
  const reflexes = new Rng((seed ^ 0x5f3759df) >>> 0);
  let threatSeen = false;
  let willDodge = false;

  while (t < maxSeconds && d.phase === "fighting") {
    input.beginTick();
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);

    // Nearest live enemy, which is what a player would actually be swinging at.
    let target = null as (typeof d.enemies)[number] | null;
    let gap = Infinity;
    for (const e of d.enemies) {
      if (e.state === "spawning") continue;
      const dd = Math.hypot(e.x - d.avatar.x, e.y - d.avatar.y);
      if (dd < gap) { gap = dd; target = e; }
    }

    // The route only has to be roughly current, same tradeoff the real monster AI
    // already makes — rebuilding a BFS field every tick over a big floor is wasted work.
    // With nothing to chase, head for the way *onward* — the floor's far end. That sweeps
    // the bot through the room graph and is how it finds the monsters it hasn't met yet.
    // This used to read `d.portal`, which was the same point back when the entrance
    // portal wrongly sat at the far end; now that the entrance is (correctly) the spawn,
    // aiming there would park the bot on its own arrival point and it would never explore.
    const goal = d.completionPortal ?? d.level.portal;
    const goalX = target ? target.x : goal.x;
    const goalY = target ? target.y : goal.y;
    flowTimer -= DT;
    if (flowTimer <= 0 || Math.hypot(goalX - flowGoalX, goalY - flowGoalY) > 50) {
      flow.update(d.level, goalX, goalY);
      flowGoalX = goalX;
      flowGoalY = goalY;
      flowTimer = 0.2;
    }

    // Back off when hurt, but only from something close enough to be the threat, and
    // only while there's a potion left to buy time with. Retreating with an empty belt
    // never resolves: the player outruns everything, so the floor would never end.
    const hurt = state.player.health < state.player.maxHealth * 0.4
      && state.potions > 0
      && gap < 70;
    // Dodging a telegraph is the skill the game is actually asking for, so the bot
    // has to do it: anything winding up within reach gets dashed away from.
    const incoming = d.enemies.some(
      (e) => e.windup > 0 && Math.hypot(e.x - d.avatar.x, e.y - d.avatar.y) < e.archetype.attackRange + 24,
    );
    if (incoming && !threatSeen) willDodge = reflexes.chance(dodge);
    threatSeen = incoming;
    const threat = incoming && willDodge;

    // Standing in a boss mechanic outranks everything else on the to-do list.
    const escape = dodge > 0 ? escapeAngle(d) : null;
    if (escape !== null) {
      const dir = steerAngle(d, escape);
      if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
      if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
      input.press("dash");
      // Still swing if something happens to be in reach on the way out.
      if (target && gap < 40) input.press("attack");
    } else if (target) {
      if (hurt || gap > 26) {
        const dir = hurt ? steer(d, target.x, target.y, true) : approachDir(d, flow, target.x, target.y);
        if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
        if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
      } else if (threat) {
        const away = steer(d, target.x, target.y, true);
        if (Math.abs(away.x) > 0.25) input.hold(away.x > 0 ? "right" : "left", true);
        if (Math.abs(away.y) > 0.25) input.hold(away.y > 0 ? "down" : "up", true);
      }
      input.press("attack");
      if (hurt || threat) input.press("dash");
    }

    // Abilities, when there is something to point them at and the resource to do it.
    if (target && gap < 340) {
      for (let slot = 0; slot < 3; slot++) {
        if (!d.canCast(slot)) continue;
        const ab = state.player.activeAbilities[slot];
        if (!ab) continue;
        const range = ab.range && ab.range > 0 ? ab.range : 110;
        const defensive = ab.category === "support" || ab.category === "utility";
        const closeRange = ab.targeting === "cone" || ab.targeting === "radius" || ab.category === "attack";
        const useful = defensive
          ? state.player.health < state.player.maxHealth * 0.75
          : closeRange
            ? gap < range * 0.9 + 60
            : true;
        if (!useful) continue;
        input.press(slot === 0 ? "skill1" : slot === 1 ? "skill2" : "skill3");
        skillCasts++;
        break;
      }
    }

    if (d.specialCharge >= 1) input.press("special");
    potionCooldown -= DT;
    if (state.player.health < state.player.maxHealth * 0.5 && potionCooldown <= 0) {
      input.press("potion");
      potionCooldown = 2;
    }

    // Anything about to resolve this tick: was the player still standing in it? This is
    // the direct measure of reading the floor, and it doesn't get muddied by chip damage
    // from adds the way a raw damage total does.
    for (const tg of d.telegraphs) {
      if (tg.remaining > DT || !tg.hitsPlayer) continue;
      mechanicsResolved++;
      if (inTelegraph(tg, d.avatar.x, d.avatar.y, d.avatar.radius)) mechanicsEaten++;
    }

    d.update(DT, input as unknown as Input);
    for (const ev of d.drainEvents()) {
      if (ev.kind === "bossPhase") bossPhases++;
      if (ev.kind === "damage" && ev.onPlayer) damageTaken += ev.amount;
      if (ev.kind === "death") deathEvents++;
      if (ev.kind === "bossDown") bossDownEvents++;
      if (ev.kind === "bossCast" && ev.name === "Call the Chorus") summonCasts++;
    }
    peakEnemies = Math.max(peakEnemies, d.enemies.length);
    nonBossEnemySum += d.enemies.reduce((n, e) => n + (e.boss ? 0 : 1), 0);
    enemyTicks++;
    if (circleHitsWall(d.level, d.avatar.x, d.avatar.y, d.avatar.radius + 2)) pinnedTicks++;
    for (const e of d.enemies) peakAilments = Math.max(peakAilments, e.sc.list.length);
    // The "mana" the modern classes actually spend is their own primary resource — the
    // first non-ultimate pool the class declares (Rage, Momentum, Mana, Scrap, …).
    const primary = d.localHero.resources.all().find((pool) => !pool.spec.isUltimateMeter);
    if (primary) lowestMana = Math.min(lowestMana, primary.fraction * 100);
    t += DT;
    onTick?.(d, t);
  }

  // Mopping up. A boss and a clear cache both drop everything at the instant the floor
  // ends, so a bot that stops the moment the last thing dies banks nothing — which is
  // not what a player does, and made every boss floor look worthless.
  let mop = 0;
  while (d.phase === "cleared" && d.pickups.length > 0 && mop < 20) {
    input.beginTick();
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);
    let near = d.pickups[0]!;
    for (const p of d.pickups) {
      if (Math.hypot(p.x - d.avatar.x, p.y - d.avatar.y) <
          Math.hypot(near.x - d.avatar.x, near.y - d.avatar.y)) near = p;
    }
    flow.update(d.level, near.x, near.y);
    const dir = approachDir(d, flow, near.x, near.y);
    if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
    if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
    d.update(DT, input as unknown as Input);
    d.drainEvents();
    mop += DT;
  }

  return {
    d, seconds: t, peakEnemies, peakAilments, lowestMana, skillCasts, bossPhases,
    damageTaken, potionsDrunk: Math.max(0, potionsAtStart - state.potions),
    mechanicsEaten, mechanicsResolved, pinned: pinnedTicks * DT,
    enemyDeaths: Math.max(0, deathEvents - bossDownEvents),
    avgEnemies: enemyTicks > 0 ? nonBossEnemySum / enemyTicks : 0,
    summonCasts,
  };
}

export interface PartyFloorResult {
  d: Dungeon;
  seconds: number;
  cleared: boolean;
  wiped: boolean;
  /** Summed across every hero — a party's total damage bill, the same measure
   *  `FloorResult.damageTaken` is for one. */
  damageTaken: number;
  /** Summed across every hero's own belt (potions are per-character in a party). */
  potionsDrunk: number;
  /** One reading per hero per resolving telegraph, same rate-not-count reasoning as
   *  the solo harness: more heroes means more *opportunities* to eat a mechanic, not a
   *  free pass on the ones that resolved while they were down. */
  mechanicsEaten: number;
  mechanicsResolved: number;
  /** Times any hero went from standing to downed. Solo, this is just death count. */
  downs: number;
  bossPhases: number;
}

/**
 * `playFloor`'s party sibling: N geared `GameState`s, each an independent attentive bot
 * — chases, dodges telegraphs at the same `dodge` reaction rate, drinks its own potions,
 * and walks to revive a downed ally before doing anything else. One `Dungeon` in `"host"`
 * role simulates the whole party exactly the way a real host does; there is no wire here
 * because the wire never changes what the simulation decides, only how a second screen
 * hears about it (see `net/sync.ts`'s own comment to that effect).
 *
 * Built for measuring raid-boss party scaling (`partyScale` in `data/modes.ts`) against
 * a *single enormous body*, which the solo-crowd assumptions it was tuned on were never
 * checked against. Reuses every steering/escape helper above through their `*For`
 * variants — see the file header for why a second copy of this logic is not the move.
 */
export function playFloorParty(
  states: GameState[],
  run: number | RunConfig,
  maxSeconds = 300,
  seed = 1000,
  dodge = 0.85,
): PartyFloorResult {
  const heroSetups: HeroSetup[] = states.map((s, i) => ({
    netId: i === 0 ? "" : `p${i + 1}`,
    name: `Hero${i + 1}`,
    player: s.player,
    appearance: s.appearance,
    potions: s.potions,
    local: i === 0,
  }));
  const d = new Dungeon(states[0]!, run, { seed, role: "host", heroes: heroSetups });
  const inputs = d.heroes.map(() => new FakeInput());
  d.heroes.forEach((hero, i) => {
    if (i > 0) hero.input = inputs[i] as unknown as AvatarInput;
  });

  const flows = d.heroes.map(() => new FlowField(d.level));
  const flowTimer = d.heroes.map(() => 0);
  const reflexes = d.heroes.map((_, i) => new Rng(((seed + i * 7919) ^ 0x5f3759df) >>> 0));
  const threatSeen = d.heroes.map(() => false);
  const willDodge = d.heroes.map(() => false);
  const potionCooldown = d.heroes.map(() => 0);
  const wasDowned = d.heroes.map(() => false);

  const potionsAtStart = d.heroes.reduce((a, h) => a + h.potions, 0);
  let t = 0;
  let mechanicsEaten = 0;
  let mechanicsResolved = 0;
  let bossPhases = 0;
  let damageTaken = 0;
  let downs = 0;

  while (t < maxSeconds && d.phase === "fighting") {
    inputs.forEach((inp) => inp.beginTick());

    d.heroes.forEach((hero: Hero, i) => {
      const input = inputs[i]!;
      for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);
      if (hero.downed) return; // waiting on an ally, nothing to steer

      let target = null as (typeof d.enemies)[number] | null;
      let gap = Infinity;
      for (const e of d.enemies) {
        if (e.state === "spawning") continue;
        const dd = Math.hypot(e.x - hero.avatar.x, e.y - hero.avatar.y);
        if (dd < gap) { gap = dd; target = e; }
      }

      // A downed ally beats everything else on the to-do list, exactly like a real
      // player would — the whole reason a party doesn't just eat every down as a wipe.
      const downedAlly = d.heroes.find((h) => h !== hero && h.downed && !h.departed);

      const goal = d.completionPortal ?? d.level.portal;
      const followX = downedAlly ? downedAlly.avatar.x : target ? target.x : goal.x;
      const followY = downedAlly ? downedAlly.avatar.y : target ? target.y : goal.y;
      flowTimer[i]! -= DT;
      if (flowTimer[i]! <= 0) {
        flows[i]!.update(d.level, followX, followY);
        flowTimer[i] = 0.2;
      }

      const hurt = hero.player.health < hero.player.maxHealth * 0.4 && hero.potions > 0 && gap < 70;
      const incoming = d.enemies.some(
        (e) => e.windup > 0 && Math.hypot(e.x - hero.avatar.x, e.y - hero.avatar.y) < e.archetype.attackRange + 24,
      );
      if (incoming && !threatSeen[i]) willDodge[i] = reflexes[i]!.chance(dodge);
      threatSeen[i] = incoming;
      const threat = incoming && willDodge[i];

      // Safety outranks everything, including reviving — walking a rescue into a live
      // telegraph just makes two downs instead of one.
      const escape = dodge > 0 ? escapeAngleFor(d, hero.avatar) : null;
      if (escape !== null) {
        const dir = steerAngleFor(d, hero.avatar, escape);
        if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
        if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
        input.press("dash");
        if (target && gap < 40) input.press("attack");
      } else if (downedAlly) {
        const dir = approachDirFor(d, flows[i]!, hero.avatar, downedAlly.avatar.x, downedAlly.avatar.y);
        if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
        if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
        if (target && gap < 40) input.press("attack");
      } else if (target) {
        if (hurt || gap > 26) {
          const dir = hurt
            ? steerFor(d, hero.avatar, target.x, target.y, true)
            : approachDirFor(d, flows[i]!, hero.avatar, target.x, target.y);
          if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
          if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
        } else if (threat) {
          const away = steerFor(d, hero.avatar, target.x, target.y, true);
          if (Math.abs(away.x) > 0.25) input.hold(away.x > 0 ? "right" : "left", true);
          if (Math.abs(away.y) > 0.25) input.hold(away.y > 0 ? "down" : "up", true);
        }
        input.press("attack");
        if (hurt || threat) input.press("dash");
      }

      if (target && gap < 340 && !downedAlly) {
        for (let slot = 0; slot < 3; slot++) {
          if (!d.canCast(slot, hero)) continue;
          const ab = hero.player.activeAbilities[slot];
          if (!ab) continue;
          const range = ab.range && ab.range > 0 ? ab.range : 110;
          const defensive = ab.category === "support" || ab.category === "utility";
          const closeRange = ab.targeting === "cone" || ab.targeting === "radius" || ab.category === "attack";
          const useful = defensive
            ? hero.player.health < hero.player.maxHealth * 0.75
            : closeRange
              ? gap < range * 0.9 + 60
              : true;
          if (!useful) continue;
          input.press(slot === 0 ? "skill1" : slot === 1 ? "skill2" : "skill3");
          break;
        }
      }

      if (hero.specialCharge >= 1) input.press("special");
      potionCooldown[i]! -= DT;
      if (hero.player.health < hero.player.maxHealth * 0.5 && potionCooldown[i]! <= 0 && hero.potions > 0) {
        input.press("potion");
        potionCooldown[i] = 2;
      }
    });

    // Same "was this hero standing in it when it resolved" measure `playFloor` takes,
    // once per hero per resolution — a party of four gets four chances to eat a mechanic
    // a solo run only had one chance to eat, so the rate is what stays comparable.
    for (const tg of d.telegraphs) {
      if (tg.remaining > DT || !tg.hitsPlayer) continue;
      for (const hero of d.heroes) {
        if (hero.downed) continue;
        mechanicsResolved++;
        if (inTelegraph(tg, hero.avatar.x, hero.avatar.y, hero.avatar.radius)) mechanicsEaten++;
      }
    }

    d.update(DT, inputs[0] as unknown as Input);
    for (const ev of d.drainEvents()) {
      if (ev.kind === "bossPhase") bossPhases++;
      if (ev.kind === "damage" && ev.onPlayer) damageTaken += ev.amount;
    }
    d.heroes.forEach((hero, i) => {
      if (hero.downed && !wasDowned[i]) downs++;
      wasDowned[i] = hero.downed;
    });
    t += DT;
  }

  const potionsAtEnd = d.heroes.reduce((a, h) => a + h.potions, 0);
  return {
    d, seconds: t,
    cleared: d.phase === "cleared",
    wiped: d.phase === "dead",
    damageTaken,
    potionsDrunk: Math.max(0, potionsAtStart - potionsAtEnd),
    mechanicsEaten, mechanicsResolved, downs, bossPhases,
  };
}

/** What a player does between dives: restock, gamble the purse, wear the best of it. */
export function townVisit(state: GameState): void {
  state.player.fullHeal();
  state.player.autoSlotNewAbilities();
  while (state.potions < 5 && state.coins >= POTION_PRICE * 2) {
    if (!state.buyPotion()) break;
  }
  // Buy the best chest tier the purse can stand, keeping a little back for potions.
  for (const tier of ["Elite", "Advanced", "Basic"] as ChestTier[]) {
    while (state.coins > CHESTS[tier].price * 2) {
      if (!state.buyKey(tier)) break;
    }
  }
  for (const tier of CHEST_TIERS) {
    if (state.keys[tier] > 0) state.openChests(tier, state.keys[tier]);
  }
  // Wear the best of everything, then sell what's strictly worse than what's worn.
  const cls = state.heroClass;
  for (const item of [...state.inventory].sort((a, b) => itemScore(b, cls) - itemScore(a, cls))) {
    const worn = state.player.equipment[item.slot];
    if (!worn || itemScore(item, cls) > itemScore(worn, cls)) state.equipFromInventory(item.id);
  }
  const junk = state.inventory.filter((it) => {
    const worn = state.player.equipment[it.slot];
    return worn ? itemScore(it, cls) < itemScore(worn, cls) : false;
  });
  if (junk.length) state.sell(junk.map((i) => i.id));
}

/** Levels a character up to `level` and dresses it, so a boss test isn't a naked one. */
/**
 * Spends every tree point the character is owed — class tree and universal tree — greedily.
 *
 * This exists because for most of this project's life the shared bot did not spend any.
 * `geared()` allocated nothing and never set a frontier (so `GameState.universalPoints`
 * was 0), and `campaign()` finished a 20-dive run holding 4-6 unspent class points and
 * 2-5 unspent universal points. Every campaign depth, balance threshold and difficulty
 * figure this repo has ever quoted described a character with an empty build, while
 * `docs/progression-architecture.md` says the class tree is most of what a class *is*.
 *
 * It surfaced as a disagreement about a game number, not as an obviously broken harness:
 * `tools/powercurve.ts` read depth 28 as needing level 90 in Legendary gear where
 * `docs/difficulty-curves.md` §3 measured a 4/4 clear at level 45. `tools/curves.ts`'s own
 * `character()` had always armed both trees; nothing built on `geared()` ever had, and the
 * two instruments had never been compared. Armed, the sweep reads 35 and they agree.
 *
 * The greedy order is `tools/curves.ts`'s, kept deliberately identical so the two builders
 * produce comparable characters. It is not an optimal build — it will take a keystone
 * whose downside a real player might refuse — so it is a floor on what a built character
 * has, not a ceiling.
 */
export function armTrees(state: GameState): GameState {
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (const node of state.player.tree) {
      if (!state.player.allocated.includes(node.id) && state.player.allocate(node)) moved = true;
    }
    if (!moved) break;
  }
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (const node of UNIVERSAL_TREE) {
      const available = state.universalPoints - state.player.universalSpent;
      if (available <= 0) break;
      if (!state.player.universalAllocated.includes(node.id)
          && state.player.allocateUniversal(node, available)) moved = true;
    }
    if (!moved) break;
  }
  state.player.refresh();
  return state;
}

export function geared(level: number, seed = 5150, keys = 14, classId?: ClassId): GameState {
  const state = new GameState(seed);
  // The class comes first: chest rolls favour the weapons it was built for.
  if (classId) state.chooseClass(classId);
  state.player.level = level;
  state.player.refresh();
  state.player.autoSlotNewAbilities();
  state.keys.Advanced = keys;
  state.openChests("Advanced", keys);
  const cls = state.heroClass;
  for (const item of [...state.inventory].sort((a, b) => itemScore(b, cls) - itemScore(a, cls))) {
    const worn = state.player.equipment[item.slot];
    if (!worn || itemScore(item, cls) > itemScore(worn, cls)) state.equipFromInventory(item.id);
  }
  // Whatever else it found, it goes down there holding something it can use.
  if (!state.player.hasAffinity) {
    const family = cls.affinity[0]!;
    const weapon = rollItem({ rarity: "rare", type: family, ilvl: level, rng: new Rng(seed ^ 0x51ed) });
    state.player.equip(weapon);
  }
  // A frontier, or `universalPoints` is 0 and the universal half of `armTrees` has nothing
  // to spend. `level + 1` is `tools/curves.ts`'s own default for the same reason, kept
  // identical so the two builders stay comparable. This is part of the arming, not a
  // separate change: the delta the owner approved (dps x4.50 vs x4.04, eHP x15.2 vs x8.9
  // over levels 5-60) was measured with it set.
  state.player.deepestDepth = Math.max(state.player.deepestDepth, level + 1);
  state.stats.deepestDepth = Math.max(state.stats.deepestDepth, level + 1);
  armTrees(state);
  state.player.fullHeal();
  state.potions = 5;
  return state;
}

/**
 * Twenty dives the way a player actually spends them: clear a floor and push one
 * deeper, die and try the same floor again, fail it twice and drop back to farm
 * something survivable. Marching 1..12 regardless of outcome — which is what this
 * test used to do — measures nothing, because a death costs the loot that would have
 * paid for the next floor and the run never recovers.
 */
export function campaign(
  seed: number,
  dodge: number,
  dives = 20,
  log = false,
  /** Threaded straight through to every dive's `playFloor` — see that function's own
   *  doc for what it's for. Optional, no-op by default. */
  onTick?: (d: Dungeon, t: number) => void,
) {
  const state = new GameState(seed);
  let target = 1;
  let deepest = 0;
  let deaths = 0;
  let failsHere = 0;
  let unfinished = 0;

  for (let dive = 0; dive < dives; dive++) {
    townVisit(state);
    // Per dive, not once at the start: the character levels up as the campaign runs, so
    // points earned mid-run would otherwise sit unspent exactly as they used to. Called
    // here rather than inside `townVisit`, which is shared with
    // `tools/universal-reachability.ts` and is deliberately left alone.
    armTrees(state);
    const { d, seconds } = playFloor(state, target, 300, seed + dive * 37 + target, dodge, onTick);
    if (log) {
      console.log(
        `  dive ${String(dive + 1).padStart(2)} → depth ${String(target).padStart(2)} ` +
        `${d.phase.padEnd(8)} ${seconds.toFixed(0).padStart(3)}s ${d.level.layout.padEnd(9)} ` +
        `${d.profile.isBoss ? "BOSS " : "     "}lv${String(state.player.level).padStart(2)} ` +
        `kills=${String(d.loot.kills).padStart(3)} coins=${String(d.loot.coins).padStart(6)} ` +
        `atk=${String(state.player.stats.attack).padStart(4)}`,
      );
    }
    if (d.phase === "cleared") {
      d.bankLoot();
      deepest = Math.max(deepest, target);
      target++;
      failsHere = 0;
    } else {
      if (d.phase === "dead") deaths++;
      else unfinished++;
      failsHere++;
      if (failsHere >= 2 && target > 1) {
        target--;
        failsHere = 0;
      }
    }
  }
  return { state, deepest, deaths, unfinished };
}

// Sixty seeds, not twelve (2026-09-10, PM lootsim-21). A floor's own layout and its
// monster placements come off the same rng stream a campaign's dives share, so any
// change to level generation or to what a wave director rolls (an elite requirement, an
// archetype, an affix) reshuffles every dive from the point it first draws differently —
// twelve seeds routinely flipped the sharp/reckless ordering on changes that never
// touched difficulty at all (the tile-lattice rewrite moved sharp from 11.0 to 10.6 and
// reckless from 10.0 to 11.0, purely from the shared sequence landing differently). Then
// fixing a real pathing bug (`FlowField.direction()` losing a monster's route entirely
// when it rested flush against a wall — see `docs/campaign-pathing-bias.md`) moved the
// original twelve seeds' own reading from a clear pass (sharp 11.5 vs reckless 9.0) to a
// fail (10.8 vs 10.9), while the five 12-seed blocks measured investigating that shift
// read 1.17, 0.58, 2.33, 3.17, 3.00 — mean 2.05, four of five clearing the >=1 bar on
// their own. The original twelve had become an unlucky draw from a neighbourhood that
// reads comfortably, the same failure CLAUDE.md already names for this check's sibling
// (a boss-telegraph comparison that failed master on 5 seeds): a check that can flip on
// which seeds it happens to hold is not measuring the promise it claims to.
//
// **This is not a derived number and is not claimed to be the plateau.** It is every
// seed actually measured investigating that shift — 5x the previous sample, margin 2.05
// against a bar of 1. Nobody has run a second, disjoint sweep at this same width to find
// out whether 60 sits on a noise floor's plateau or its own edge, which is the exact
// two-pass discipline CLAUDE.md's own telegraph-check lesson asks for and this widening
// has not yet received. That is a named open question, not a settled one.
export const CAMPAIGN_SEEDS = [
  500000, 500733, 501466, 502199, 502932, 503665, 504398, 505131, 505864, 506597, 507330, 508063,
  600000, 600733, 601466, 602199, 602932, 603665, 604398, 605131, 605864, 606597, 607330, 608063,
  700000, 700733, 701466, 702199, 702932, 703665, 704398, 705131, 705864, 706597, 707330, 708063,
  800000, 800733, 801466, 802199, 802932, 803665, 804398, 805131, 805864, 806597, 807330, 808063,
  900000, 900733, 901466, 902199, 902932, 903665, 904398, 905131, 905864, 906597, 907330, 908063,
];
