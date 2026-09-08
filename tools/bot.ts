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
import { Dungeon, inTelegraph } from "../src/game/dungeon";
import { itemScore, rollItem } from "../src/game/item";
import { circleHitsWall, FlowField } from "../src/game/level";
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

/**
 * Steers along a direction without walking into a wall: it tries the straight line
 * first, then progressively wider angles. Crude, but it's what a player does
 * instinctively, and without it the bot pins itself on a pillar and dies there.
 */
export function steerAngle(d: Dungeon, base: number): { x: number; y: number } {
  const a = d.avatar;
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

export function steer(d: Dungeon, tx: number, ty: number, retreat: boolean): { x: number; y: number } {
  const a = d.avatar;
  const sign = retreat ? -1 : 1;
  return steerAngle(d, Math.atan2((ty - a.y) * sign, (tx - a.x) * sign));
}

/**
 * A real dungeon has walls a straight line can't see past, so closing on something
 * across a room graph needs an actual route, not just "nudge around whatever's directly
 * in front of you." This is exactly the field monsters already chase the player with —
 * the bot gets the same eyes a human has (it can see the level), just no better.
 */
export function approachDir(d: Dungeon, flow: FlowField, tx: number, ty: number): { x: number; y: number } {
  return flow.direction(d.level, d.avatar.x, d.avatar.y) ?? steer(d, tx, ty, false);
}

/**
 * Where to run when something is about to go off underneath you. This is the whole
 * skill of a boss fight expressed as one function: get out of the circle, get into the
 * hole in the donut, step off the line.
 */
export function escapeAngle(d: Dungeon): number | null {
  const a = d.avatar;
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
    }
    peakEnemies = Math.max(peakEnemies, d.enemies.length);
    if (circleHitsWall(d.level, d.avatar.x, d.avatar.y, d.avatar.radius + 2)) pinnedTicks++;
    for (const e of d.enemies) peakAilments = Math.max(peakAilments, e.sc.list.length);
    // The "mana" the modern classes actually spend is their own primary resource — the
    // first non-ultimate pool the class declares (Rage, Momentum, Mana, Scrap, …).
    const primary = d.localHero.resources.all().find((pool) => !pool.spec.isUltimateMeter);
    if (primary) lowestMana = Math.min(lowestMana, primary.fraction * 100);
    t += DT;
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
export function campaign(seed: number, dodge: number, dives = 20, log = false) {
  const state = new GameState(seed);
  let target = 1;
  let deepest = 0;
  let deaths = 0;
  let failsHere = 0;
  let unfinished = 0;

  for (let dive = 0; dive < dives; dive++) {
    townVisit(state);
    const { d, seconds } = playFloor(state, target, 300, seed + dive * 37 + target, dodge);
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

// Twelve seeds each, not five — the same widening the depth-5 boss check and the elite
// telegraph check already got. A floor's own layout and its monster placements come off
// the same rng stream a campaign's dives share, so any change to level generation or to
// what a wave director rolls (an elite requirement, an archetype, an affix) reshuffles
// every dive from the point it first draws differently — five seeds routinely flipped
// the sharp/reckless ordering on changes that never touched difficulty at all (the
// tile-lattice rewrite moved sharp from 11.0 to 10.6 and reckless from 10.0 to 11.0,
// purely from the shared sequence landing differently, not from anything actually
// getting harder or easier). Twelve holds the ordering steady across that kind of
// change; the comparison below is what actually encodes the design promise, once the
// sample is wide enough for it to mean something.
export const CAMPAIGN_SEEDS = [4242, 991, 7777, 31337, 606, 5150, 20226, 88813, 41029, 63071, 17402, 94651];
