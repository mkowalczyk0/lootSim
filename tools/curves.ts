/**
 * Difficulty-curve investigation — how boss floors and trash floors diverge, and why
 * depth 30 reads as a wall.
 *
 * **This is not a gate and must not be wired into `npm test`.** It is a measurement
 * harness for a one-off question, it changes no tuning number, and it is slow on purpose:
 * it plays hundreds of real floors so the answer comes from the game rather than from
 * arithmetic about the game.
 *
 * ### Why it exists
 *
 * Three separate pieces of work hit the same wall from three different angles and all
 * three worked *around* it:
 *
 *  - The Proving (§13/§14) found that at level 60 in Legendary gear, most sampled classes
 *    cannot beat depth 30 in *either* flavour — the endgame encounter or the ordinary
 *    floor it replaces.
 *  - The Convergence (§17) found that a raid boss at the same depth as an escalated trash
 *    floor is "dramatically harder, not incrementally harder", and gave its boss floor a
 *    separate, shallower depth band to sidestep it. That exception is load-bearing and has
 *    "this isn't specific to the Convergence" written next to it.
 *  - `tools/builds.ts` calibrated to depth 9 because "by depth 11 half the roster dies
 *    regardless of build" — at level 18 in Advanced gear.
 *
 * Three readings agreeing is suggestive, not conclusive, and all three came from people
 * who expected the same answer. So this measures the whole range rather than the points
 * we happened to land on, and it varies the two things none of them varied together.
 *
 * ### The hypothesis it is built to break
 *
 * "Boss floors are harder than the trash around them" and "boss floors are easier than the
 * trash around them" can *both* be true in different bands, with opposite fixes. Trash
 * pressure grows smoothly and without bound (`enemyHealth` geometric, `enemyDamage`
 * quadratic-plus, `enemiesPerWave` linear until it caps); a boss's health and damage are a
 * *staircase* of five authored multipliers that stops climbing at depth 25. Two curves of
 * that shape cross, possibly more than once.
 *
 * ### A warning about this harness
 *
 * The bot is **imported** from `tools/bot.ts`, the same module `tools/smoke.ts` uses, so a
 * number here is comparable with a number there by construction rather than by care. That
 * is not fastidiousness. The first draft of this
 * file paraphrased them and dropped the `level` argument from `FlowField.direction(level,
 * x, y)`, which silently returns `null` for every query when it is called with two
 * arguments. The bot therefore never pathfound at all: it fell back to straight-line
 * steering for an entire measurement pass, could not walk around a wall, and produced a
 * large crop of "unclearable floor" readings that were the harness failing rather than
 * the game. Every routability number in that pass was also wrong, in the direction of
 * making the game look broken.
 *
 * If you extend this file: extend `tools/bot.ts`, where both callers get the change. Do
 * not paraphrase a second bot into existence.
 *
 * Run with `npm run curves`. Env: `CURVES_SEEDS`, `CURVES_QUICK=1`, `CURVES_SECTION`.
 */

import type { Action, Input } from "../src/core/input";
import { Rng } from "../src/core/rng";
import { ARCHETYPES, type EnemyKind } from "../src/data/enemies";
import { BOSSES, bossFor } from "../src/data/bosses";
import { CLASS_IDS, type ClassId } from "../src/data/classes";
import { DELVE_BOTTOM } from "../src/data/legends";
import { delveConfig, type RunConfig } from "../src/data/modes";
import { profileFor } from "../src/data/depth";
import { UNIVERSAL_TREE } from "../src/progression/universal";
import { Dungeon, inTelegraph } from "../src/game/dungeon";
import {
  CAMPAIGN_SEEDS, DT, FakeInput, approachDir, campaign, escapeAngle, steer,
  steerAngle,
} from "./bot";
import type { Enemy } from "../src/game/entities";
import { itemScore, rollItem } from "../src/game/item";
import { FlowField, circleHitsWall } from "../src/game/level";
import { GameState } from "../src/game/state";
import type { ChestTier } from "../src/data/chests";

const QUICK = process.env.CURVES_QUICK === "1";
const SEEDS = Number(process.env.CURVES_SEEDS) || (QUICK ? 2 : 6);
const ONLY = process.env.CURVES_SECTION ?? "";
const section = (n: string) => !ONLY || ONLY === n;

/** Trash health per body, averaged over the archetypes a floor can actually field. */
const WAVE_HEALTH_MULT = 0.75; // mirrors `dungeon.ts`; this file only reads it
function trashArchetypeAverage(depth: number): { health: number; damage: number } {
  const kinds = (Object.keys(ARCHETYPES) as EnemyKind[])
    .filter((k) => ARCHETYPES[k].weight > 0 && ARCHETYPES[k].minDepth <= depth);
  let w = 0, h = 0, dmg = 0;
  for (const k of kinds) {
    const a = ARCHETYPES[k];
    w += a.weight; h += a.weight * a.health; dmg += a.weight * a.damage;
  }
  return { health: h / w, damage: dmg / w };
}

// ---------------------------------------------------------------------------
// The bot. Lifted from `tools/smoke.ts`'s `playFloor` deliberately unchanged in
// behaviour, so a number here is comparable with a number there. Trimmed to the metrics
// this investigation reads, and given a `dodge` knob that is the same knob.
// ---------------------------------------------------------------------------

interface Run {
  cleared: boolean;
  died: boolean;
  /**
   * Why the floor ended. Splitting this out changed the whole picture: "did not clear"
   * was hiding two opposite failures — the floor killing the character, and the
   * character being unable to chew through the floor inside any sane amount of time.
   * They are different problems with different fixes and they must never be totalled.
   */
  outcome: "cleared" | "died" | "stalled" | "slow";
  /** Seconds since the last kill when the floor ended — how a stall is recognised. */
  quietFor: number;
  /** Monsters killed per minute — how fast the floor can be consumed at all. */
  killRate: number;
  seconds: number;
  damageTaken: number;
  /** Damage per second of fight — the pressure, independent of how long the fight is. */
  dps: number;
  potions: number;
  peakEnemies: number;
  mechanicsEaten: number;
  mechanicsResolved: number;
  /** Fraction of the floor's objective actually completed before it ended. */
  progress: number;
  /**
   * Instrument health, not game data. The bot flees any telegraph covering it before it
   * does anything else, and at deep-floor monster density something covers it nearly
   * always — so it can spend a whole floor kiting and never swing. If this is near 1 the
   * measurement is saturated and says more about the bot than about the floor.
   */
  fleeingFraction: number;
  /** Fraction of ticks the bot actually pressed attack. */
  attackingFraction: number;
}

const MAX_SECONDS = Number(process.env.CURVES_MAX) || 900;
/** Seconds with nothing dying before a floor is called stalled rather than merely slow. */
const STALL_QUIET = 120;

function play(state: GameState, run: RunConfig, seed: number, dodge = 0.55, maxSeconds = MAX_SECONDS): Run {
  const d = new Dungeon(state, run, seed);
  const input = new FakeInput();
  const flow = new FlowField(d.level);
  let flowTimer = 0, flowGoalX = d.avatar.x, flowGoalY = d.avatar.y;
  let t = 0, damageTaken = 0, peakEnemies = 0, mechanicsEaten = 0, mechanicsResolved = 0;
  const potionsAtStart = state.potions;
  let potionCooldown = 0;
  const reflexes = new Rng((seed ^ 0x5f3759df) >>> 0);
  let threatSeen = false, willDodge = false;
  let ticks = 0, fleeing = 0, attacking = 0;
  // A stalled floor and a slow floor are different failures. `updateSpawning` starts the
  // next wave only when `enemies.length === 0`, so one unreachable straggler freezes the
  // floor permanently — and that looks exactly like "too hard" in a clear/fail tally.
  // Nothing dying for two solid minutes is the signature.
  let lastKill = 0, seenKills = 0;

  while (t < maxSeconds && d.phase === "fighting") {
    ticks++;
    input.beginTick();
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);

    let target = null as (typeof d.enemies)[number] | null;
    let gap = Infinity;
    for (const e of d.enemies) {
      if (e.state === "spawning") continue;
      const dd = Math.hypot(e.x - d.avatar.x, e.y - d.avatar.y);
      if (dd < gap) { gap = dd; target = e; }
    }

    const goal = d.completionPortal ?? d.level.portal;
    const goalX = target ? target.x : goal.x;
    const goalY = target ? target.y : goal.y;
    flowTimer -= DT;
    if (flowTimer <= 0 || Math.hypot(goalX - flowGoalX, goalY - flowGoalY) > 50) {
      flow.update(d.level, goalX, goalY);
      flowGoalX = goalX; flowGoalY = goalY; flowTimer = 0.2;
    }

    const hurt = state.player.health < state.player.maxHealth * 0.4 && state.potions > 0 && gap < 70;
    const incoming = d.enemies.some(
      (e) => e.windup > 0 && Math.hypot(e.x - d.avatar.x, e.y - d.avatar.y) < e.archetype.attackRange + 24);
    if (incoming && !threatSeen) willDodge = reflexes.chance(dodge);
    threatSeen = incoming;
    const threat = incoming && willDodge;

    const escape = dodge > 0 ? escapeAngle(d) : null;
    if (escape !== null) fleeing++;
    if (escape !== null) {
      const dir = steerAngle(d, escape);
      if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
      if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
      input.press("dash");
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
          : closeRange ? gap < range * 0.9 + 60 : true;
        if (!useful) continue;
        input.press(slot === 0 ? "skill1" : slot === 1 ? "skill2" : "skill3");
        break;
      }
    }

    if (d.specialCharge >= 1) input.press("special");
    potionCooldown -= DT;
    if (state.player.health < state.player.maxHealth * 0.5 && potionCooldown <= 0) {
      input.press("potion");
      potionCooldown = 2;
    }

    for (const tg of d.telegraphs) {
      if (tg.remaining > DT || !tg.hitsPlayer) continue;
      mechanicsResolved++;
      if (inTelegraph(tg, d.avatar.x, d.avatar.y, d.avatar.radius)) mechanicsEaten++;
    }

    if (input.wasPressed("attack")) attacking++;
    d.update(DT, input as unknown as Input);
    for (const ev of d.drainEvents()) {
      if (ev.kind === "damage" && ev.onPlayer) damageTaken += ev.amount;
    }
    peakEnemies = Math.max(peakEnemies, d.enemies.length);
    if (d.loot.kills > seenKills) { seenKills = d.loot.kills; lastKill = t; }
    t += DT;
  }

  // How far it actually got. For a boss floor the objective *is* the boss, so read its
  // health bar; for a trash floor read the kill quota.
  const progress = run.bossFloor
    ? (d.boss ? 1 - d.boss.health / d.boss.maxHealth : (d.phase === "cleared" ? 1 : 0))
    : Math.min(1, d.killsSoFar / Math.max(1, d.killsRequired));

  return {
    cleared: d.phase === "cleared",
    died: d.phase === "dead",
    outcome: d.phase === "cleared" ? "cleared"
      : d.phase === "dead" ? "died"
        : (t - lastKill) > STALL_QUIET ? "stalled" : "slow",
    quietFor: t - lastKill,
    killRate: d.loot.kills / Math.max(1 / 60, t) * 60,
    seconds: t,
    damageTaken,
    dps: damageTaken / Math.max(1, t),
    potions: Math.max(0, potionsAtStart - state.potions),
    peakEnemies,
    mechanicsEaten,
    mechanicsResolved,
    progress,
    fleeingFraction: ticks ? fleeing / ticks : 0,
    attackingFraction: ticks ? attacking / ticks : 0,
  };
}

/**
 * A character at a chosen power level. Same construction as the smoke test's `endgame`
 * helper — level, gear rolled from chests at the character's own record depth, both trees
 * filled — with the knobs exposed so power can be swept as its own axis. That is the
 * dimension none of the three earlier measurements varied.
 */
function character(
  classId: ClassId, level: number, tier: ChestTier, keys: number, seed: number,
  recordDepth = Math.max(1, Math.round(level / 0.9)),
): GameState {
  const state = new GameState(seed);
  state.chooseClass(classId);
  state.player.level = level;
  state.player.deepestDepth = recordDepth;
  state.stats.deepestDepth = recordDepth;
  state.player.refresh();
  state.player.autoSlotNewAbilities();
  state.keys[tier] = keys;
  state.openChests(tier, keys);
  const cls = state.heroClass;
  for (const item of [...state.inventory].sort((a, b) => itemScore(b, cls) - itemScore(a, cls))) {
    const worn = state.player.equipment[item.slot];
    if (!worn || itemScore(item, cls) > itemScore(worn, cls)) state.equipFromInventory(item.id);
  }
  if (!state.player.hasAffinity) {
    state.player.equip(rollItem({
      rarity: tier === "Legendary" ? "legendary" : "rare",
      type: cls.affinity[0]!, ilvl: level, rng: new Rng(seed ^ 0x51ed),
    }));
  }
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
  state.player.fullHeal();
  state.potions = 9;
  return state;
}

/** A Delve floor at `depth`, forced to be trash or boss regardless of the 5s rule. */
function floorAt(depth: number, boss: boolean): RunConfig {
  return { ...delveConfig(depth), bossFloor: boss };
}

function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(0)}%`;

// ===========================================================================
// 0. Calibration — proof this harness is measuring the game and not itself
// ===========================================================================
//
// Every number below this line comes from a bot, so the bot is the first thing that has
// to be trusted. It earned no trust on its first outing: a paraphrased copy of the
// steering helpers called `FlowField.direction` with two arguments instead of three,
// which returns `null` every time, and a whole measurement pass was spent reporting a
// bot that could not walk around a wall as a game that could not be finished.
//
// So this section runs the *published* control: the same twelve-seed campaign
// `tools/smoke.ts` asserts on, through the same imported `campaign`, and prints what it
// gets. `smoke.ts` claims sharp 11.8 and reckless 9.4 with a margin of 2.4. If the two
// numbers below do not match those, nothing further in this file should be believed —
// and that discrepancy is itself the first finding.

if (section("0")) {
  console.log("\n=== 0. calibration against the published campaign ===");
  const run = (dodge: number) => {
    const runs = CAMPAIGN_SEEDS.map((seed) => campaign(seed, dodge));
    return {
      deepest: mean(runs.map((r) => r.deepest)),
      deaths: mean(runs.map((r) => r.deaths)),
      unfinished: mean(runs.map((r) => r.unfinished)),
    };
  };
  const sharp = run(0.55);
  const reckless = run(0);
  const margin = sharp.deepest - reckless.deepest;
  console.log(`   sharp    (dodges 55%): deepest ${sharp.deepest.toFixed(1)}`
    + `  deaths ${sharp.deaths.toFixed(1)}  unfinished ${sharp.unfinished.toFixed(2)}`);
  console.log(`   reckless (never dodges): deepest ${reckless.deepest.toFixed(1)}`
    + `  deaths ${reckless.deaths.toFixed(1)}  unfinished ${reckless.unfinished.toFixed(2)}`);
  console.log(`   margin ${margin.toFixed(1)} — smoke.ts publishes sharp 11.8 / reckless 9.4 / margin 2.4`);
  const ok = Math.abs(sharp.deepest - 11.8) < 0.05 && Math.abs(reckless.deepest - 9.4) < 0.05;
  console.log(ok
    ? "   MATCHES the published control: this harness plays the same game smoke.ts does."
    : "   *** DOES NOT MATCH — treat everything below as suspect and find out why first.");
  console.log(`   campaign 'unfinished' floors per 20 dives: sharp ${sharp.unfinished.toFixed(2)},`
    + ` reckless ${reckless.unfinished.toFixed(2)} (smoke tolerates <= 2)`);
  console.log("   That last line is the one that should have stopped an earlier version of");
  console.log("   this file claiming a 25-67% stall rate: the campaign has always measured");
  console.log("   unfinished floors, and has always found almost none.");
}

// ===========================================================================
// A. The shape of the two curves, from the data alone
// ===========================================================================
//
// No simulation: just what the tuning says. This is the cheap half and it already
// answers "do the curves cross", because the two are structurally different shapes —
// one smooth and unbounded, one a five-step staircase that stops.

if (section("A")) {
  console.log("\n=== A. the two curves, from the tuning alone ===\n");
  console.log("  A boss's health and damage are `profile.enemyHealth/enemyDamage` times an");
  console.log("  authored `BossSpec` multiplier. Trash is the same profile times an archetype");
  console.log("  multiplier times WAVE_HEALTH_MULT, across `waves * enemiesPerWave` bodies.");
  console.log("  So the comparable quantities are *total work* and *incoming pressure*.\n");

  console.log("  depth  spec       bossHP  floorHP   work    bodies  alive  bossHit  swarmHit  press   aggr");
  console.log("          mult      /enemyHP /enemyHP  boss:floor              /trashHit  (alive)  floor:boss");
  for (let depth = 5; depth <= 45; depth++) {
    if (depth > 32 && depth % 5 !== 0) continue;
    // Both flavours asked for at the SAME depth. This matters: `profileFor` sets
    // `waves: 1` on a boss floor, so reading the boss depth's own profile for the trash
    // column compares a boss against the handful of adds on its own floor rather than
    // against the trash floor it replaced.
    const trash = profileFor(depth, floorAt(depth, false));
    const spec = bossFor(depth);
    const arch = trashArchetypeAverage(depth);
    const bodies = trash.waves * trash.enemiesPerWave;
    const bossHP = spec.health;                        // in units of enemyHealth
    const floorHP = bodies * arch.health * WAVE_HEALTH_MULT;
    const work = bossHP / floorHP;
    const hitRatio = spec.damage / arch.damage;
    // Pressure, not total work: how much damage can be in the air at once. A boss is one
    // body; a trash floor is `maxAlive` of them, and that is the axis a player feels.
    const swarm = trash.maxAlive * arch.damage;
    const press = swarm / spec.damage;
    const mark = depth % 5 === 0 ? "*" : " ";
    console.log(
      `  ${String(depth).padStart(4)}${mark} ${spec.id.padEnd(10)}` +
      `${bossHP.toFixed(0).padStart(6)}  ${floorHP.toFixed(0).padStart(7)}  ` +
      `${work.toFixed(2).padStart(8)}  ${String(bodies).padStart(6)}  ` +
      `${String(trash.maxAlive).padStart(5)}  ${hitRatio.toFixed(2).padStart(7)}  ` +
      `${swarm.toFixed(0).padStart(8)}  ${press.toFixed(1).padStart(7)}  ` +
      `${trash.aggression.toFixed(2)}`);
  }
  console.log("\n  (* = a depth that is really a boss floor in the Delve. The others are the");
  console.log("   counterfactual: what a boss at that depth WOULD be, which is exactly what");
  console.log("   the Convergence's own boss floor is.)\n");

  // Where does the total-work ratio cross parity?
  const crossings: string[] = [];
  let prev: number | null = null;
  for (let depth = 5; depth <= 60; depth++) {
    const trash = profileFor(depth, floorAt(depth, false));
    const arch = trashArchetypeAverage(depth);
    const r = bossFor(depth).health
      / (trash.waves * trash.enemiesPerWave * arch.health * WAVE_HEALTH_MULT);
    if (prev !== null && ((prev > 1 && r <= 1) || (prev < 1 && r >= 1))) {
      crossings.push(`depth ${depth} (${prev.toFixed(2)} -> ${r.toFixed(2)})`);
    }
    prev = r;
  }
  console.log(`  total-work parity crossings: ${crossings.join(", ") || "none in 5..60"}`);
  console.log("  (each staircase step shoves the ratio back above parity; between steps the");
  console.log("   trash curve eats the lead back. Past the last step it only ever falls.)");

  console.log("\n  the boss staircase, and where it stops:");
  for (const b of BOSSES) {
    const at = (BOSSES.indexOf(b) + 1) * 5;
    console.log(`    depth ${String(at).padStart(2)}+  ${b.id.padEnd(11)} health x${String(b.health).padStart(3)}` +
      `  damage x${b.damage.toFixed(1)}  phases ${b.phases.length}`);
  }
  console.log(`    depth ${(BOSSES.length) * 5}+  the last row above, forever. `
    + "The staircase stops; the trash curve does not.");

  // The one place the two curves are *forced* to be compared by shipped code.
  console.log("\n  the Convergence's exception, in numbers:");
  {
    const trashBand = [12, 16];
    const bossBand = [9, 11];
    for (const d of [...trashBand, ...bossBand].sort((a, b) => a - b)) {
      const p = profileFor(d, floorAt(d, false));
      const arch = trashArchetypeAverage(d);
      const which = d >= 12 ? "trash floors 1-3 draw here" : "boss floor 4 draws here";
      console.log(`    depth ${String(d).padStart(2)}  enemyHP ${p.enemyHealth.toFixed(0).padStart(5)}` +
        `  enemyDmg ${p.enemyDamage.toFixed(0).padStart(4)}  bossHP ${(p.enemyHealth * bossFor(d).health / 1000).toFixed(0).padStart(4)}k` +
        `  trashFloorHP ${(p.enemyHealth * p.waves * p.enemiesPerWave * arch.health * WAVE_HEALTH_MULT / 1000).toFixed(0).padStart(4)}k  - ${which}`);
    }
  }
}

// ===========================================================================
// B. Boss vs trash at the SAME depth, played
// ===========================================================================
//
// The comparison nobody has run. Every earlier measurement compared a boss floor to a
// trash floor at a *different* depth (the Delve puts bosses on multiples of 5; the
// Convergence deliberately puts its boss shallower than its trash). Forcing both
// flavours at one depth, with one character and one seed pair, isolates the flavour.

/** Gear a character would plausibly have when they first arrive at `depth`. */
function tierForDepth(depth: number): { tier: ChestTier; keys: number } {
  if (depth < 8) return { tier: "Basic", keys: 12 };
  if (depth < 15) return { tier: "Advanced", keys: 14 };
  if (depth < 24) return { tier: "Elite", keys: 18 };
  return { tier: "Legendary", keys: 26 };
}

/** The level the game itself recommends for a floor: `profileFor().recommendedLevel`. */
function levelForDepth(depth: number): number {
  return profileFor(depth, floorAt(depth, false)).recommendedLevel;
}

interface Cmp { depth: number; boss: Run[]; trash: Run[] }

function compareFlavours(
  depths: readonly number[], make: (depth: number, seed: number) => GameState, dodge = 0.55,
): Cmp[] {
  const out: Cmp[] = [];
  for (const depth of depths) {
    const boss: Run[] = [];
    const trash: Run[] = [];
    for (let i = 0; i < SEEDS; i++) {
      const seed = 70_000 + i * 137 + depth;
      // Same character construction, same seed, both flavours: only `bossFloor` differs.
      boss.push(play(make(depth, seed), floorAt(depth, true), seed, dodge));
      trash.push(play(make(depth, seed), floorAt(depth, false), seed, dodge));
    }
    out.push({ depth, boss, trash });
  }
  return out;
}

function reportCmp(label: string, rows: readonly Cmp[]): void {
  console.log(`\n  ${label}`);
  console.log("   depth     BOSS: C/D/S/X    secs     dmg    dps  prog |   TRASH: C/D/S/X    secs     dmg    dps  prog"
    + " | dps ratio");
  for (const r of rows) {
    const f = (rs: Run[]) => {
      const c = rs.filter((x) => x.outcome === "cleared").length;
      const dd = rs.filter((x) => x.outcome === "died").length;
      const to = rs.filter((x) => x.outcome === "slow").length;
      const st = rs.filter((x) => x.outcome === "stalled").length;
      return `${c}C ${dd}D ${to}S ${st}X  `
        + `${mean(rs.map((x) => x.seconds)).toFixed(0).padStart(4)}  `
        + `${mean(rs.map((x) => x.damageTaken)).toFixed(0).padStart(6)}  `
        + `${mean(rs.map((x) => x.dps)).toFixed(0).padStart(5)}  `
        + `${(mean(rs.map((x) => x.progress)) * 100).toFixed(0).padStart(3)}%`;
    };
    const bd = mean(r.boss.map((x) => x.dps));
    const td = mean(r.trash.map((x) => x.dps));
    const ratio = td > 0 ? bd / td : 0;
    console.log(`   ${String(r.depth).padStart(5)}       ${f(r.boss)} |        ${f(r.trash)}`
      + ` |  ${ratio.toFixed(2).padStart(6)}`);
  }
  for (const r of rows) {
    const proj = (rs: Run[]) => {
      const p = mean(rs.map((x) => x.progress));
      return p > 0.02 ? mean(rs.map((x) => x.seconds)) / p : Infinity;
    };
    const b = proj(r.boss), t = proj(r.trash);
    const fmt = (x: number) => Number.isFinite(x) ? `${(x / 60).toFixed(1)}m` : "never";
    console.log(`     depth ${String(r.depth).padStart(2)} projected time to actually finish:`
      + ` boss ${fmt(b).padStart(6)}   trash ${fmt(t).padStart(6)}`);
  }
  console.log("   (C=cleared D=died S=too slow X=stalled outright (nothing died for 2 min). dps = damage taken per second of");
  console.log(`    fight: pressure with fight length divided out. prog = fraction of the objective`);
  console.log(`    reached. The clock is ${MAX_SECONDS}s, which is fifteen minutes on one floor.)`);
}

if (section("B")) {
  console.log("\n=== B. the same depth, both flavours, one character ===");

  // B1 — a character at the power the floor itself recommends. This is the honest read
  // of "is this floor a wall", because it is the gearing a player arriving there has.
  const levelled = compareFlavours(
    QUICK ? [10, 20, 30] : [5, 8, 10, 12, 15, 18, 20, 22, 25, 28, 30, 33, 36],
    (depth, seed) => {
      const { tier, keys } = tierForDepth(depth);
      return character("swordsman", levelForDepth(depth), tier, keys, seed, depth);
    });
  reportCmp("B1 — at the level and gear the floor recommends (swordsman)", levelled);

  const kind = (rs: Run[]) => {
    const n = (o: Run["outcome"]) => rs.filter((x) => x.outcome === o).length;
    const best = (["died", "slow", "stalled"] as const)
      .map((o) => [o, n(o)] as const).sort((a, b) => b[1] - a[1])[0]!;
    return best[0] === "died" ? "lethal" : best[0] === "slow" ? "too long" : "stalled (defect)";
  };
  const walls = (pick: (c: Cmp) => Run[]) => levelled
    .filter((r) => pick(r).every((x) => !x.cleared))
    .map((r) => `${r.depth} (${kind(pick(r))})`).join(", ") || "none";
  console.log(`\n   boss floors nobody cleared:  ${walls((r) => r.boss)}`);
  console.log(`   trash floors nobody cleared: ${walls((r) => r.trash)}`);
  console.log("   A 'lethal' wall and a 'too long' wall are opposite problems: the first wants");
  console.log("   the damage curve moved, the second wants the quota or the health curve moved.");

  // B2 — the same sweep with the best gearing a player can plausibly assemble, which is
  // what the Proving measurement used. If the wall moves, it is a gearing wall; if it
  // stays put, it is a curve wall.
  const endgame = compareFlavours(
    QUICK ? [25, 30] : [20, 25, 28, 30, 33, 36, 40],
    (_depth, seed) => character("swordsman", 60, "Legendary", 30, seed, DELVE_BOTTOM));
  reportCmp("B2 — level 60, 30 Legendary chests, both trees filled (swordsman)", endgame);
}

// ===========================================================================
// C. The power axis — the dimension none of the three earlier readings varied
// ===========================================================================
//
// Every previous measurement swept depth at fixed power. That cannot distinguish
// "this floor is tuned past what any character can do" from "characters arrive at this
// floor under-geared", and those want completely different fixes. So: sweep power at
// fixed depth, including a rung deliberately *past* anything a player can assemble. If
// the top rung still fails, the floor is the problem. If it succeeds, the economy is.

interface Rung { readonly name: string; readonly level: number; readonly tier: ChestTier; readonly keys: number }

const POWER: readonly Rung[] = [
  { name: "lv15 Advanced x14", level: 15, tier: "Advanced", keys: 14 },
  { name: "lv25 Elite x14", level: 25, tier: "Elite", keys: 14 },
  { name: "lv35 Elite x20", level: 35, tier: "Elite", keys: 20 },
  { name: "lv45 Legendary x20", level: 45, tier: "Legendary", keys: 20 },
  { name: "lv60 Legendary x30", level: 60, tier: "Legendary", keys: 30 },
  // Deliberately beyond reach: max level is not this, and forty Legendary keys is not a
  // thing a player has. This rung exists only to answer "would more power fix it".
  { name: "lv90 Legendary x60 (*)", level: 90, tier: "Legendary", keys: 60 },
];

if (section("C")) {
  console.log("\n=== C. does more power fix it? sweeping character power at fixed depth ===");
  const depths = QUICK ? [20, 30] : [15, 20, 25, 28, 33];
  for (const flavour of ["trash", "boss"] as const) {
    console.log(`\n  ${flavour.toUpperCase()} floors — cleared / died / timed out, ${SEEDS} seeds each`);
    console.log("   power                    " + depths.map((d) => `d${String(d).padEnd(11)}`).join(""));
    for (const rung of POWER) {
      const cells = depths.map((depth) => {
        const runs: Run[] = [];
        for (let i = 0; i < SEEDS; i++) {
          const seed = 71_000 + i * 137 + depth;
          runs.push(play(
            character("swordsman", rung.level, rung.tier, rung.keys, seed, Math.max(depth, rung.level)),
            floorAt(depth, flavour === "boss"), seed));
        }
        const c = runs.filter((r) => r.outcome === "cleared").length;
        const dd = runs.filter((r) => r.outcome === "died").length;
        const to = runs.filter((r) => r.outcome === "slow").length;
        const st = runs.filter((r) => r.outcome === "stalled").length;
        return `${c}C${dd}D${to}S${st}X`.padEnd(12);
      });
      console.log(`   ${rung.name.padEnd(24)} ${cells.join("")}`);
    }
  }
  console.log("\n   (*) the last rung is past anything a player can assemble. It is here to");
  console.log("   separate 'the floor is tuned beyond any character' from 'characters arrive");
  console.log("   under-geared' — the two readings have opposite fixes.");
}

// ===========================================================================
// D. The class spread — is this a depth finding or a roster finding?
// ===========================================================================
//
// "Only 3 of 8 sampled classes can beat depth 30" is a *spread* statement wearing a
// *curve* statement's clothes. If the spread between the best and worst class is wider
// than the spread between two depths five apart, then the roster is the headline and the
// curve is the sideshow. That is measurable, so measure it.

if (section("D")) {
  console.log("\n=== D. the same floor, all 21 classes ===");
  const seeds = QUICK ? 1 : Math.min(3, SEEDS);
  for (const [depth, boss] of (QUICK ? [[30, true]] : [[20, false], [30, true], [30, false]]) as [number, boolean][]) {
    const rows: { id: ClassId; c: number; died: number; to: number; prog: number; secs: number }[] = [];
    const crashed: string[] = [];
    for (const id of CLASS_IDS) {
      const runs: Run[] = [];
      for (let i = 0; i < seeds; i++) {
        const seed = 72_000 + i * 211 + depth;
        // A class can crash the simulation outright — `AbilityRuntime.notify` splices
        // `this.pending` while iterating it, and `runEffect` can re-enter `notify`, so a
        // reactive effect that causes the event it is reacting to invalidates the outer
        // loop's index. Recorded rather than swallowed: a class that cannot be measured
        // is a finding, not a gap.
        try {
          runs.push(play(character(id, 60, "Legendary", 30, seed, DELVE_BOTTOM),
            floorAt(depth, boss), seed));
        } catch (e) {
          crashed.push(`${id} (seed ${seed}): ${String(e).split("\n")[0]}`);
        }
      }
      if (runs.length === 0) continue;
      rows.push({
        id, c: runs.filter((r) => r.outcome === "cleared").length,
        died: runs.filter((r) => r.outcome === "died").length,
        to: runs.filter((r) => r.outcome !== "cleared" && r.outcome !== "died").length,
        prog: mean(runs.map((r) => r.progress)), secs: mean(runs.map((r) => r.seconds)),
      });
    }
    rows.sort((a, b) => b.prog - a.prog || a.secs - b.secs);
    console.log(`\n  depth ${depth} ${boss ? "BOSS" : "trash"} floor, level 60 / 30 Legendary / trees filled,`
      + ` ${seeds} seed(s) each`);
    for (const r of rows) {
      console.log(`   ${r.id.padEnd(14)} ${r.c}C ${r.died}D ${r.to}T   `
        + `progress ${(r.prog * 100).toFixed(0).padStart(3)}%   ${r.secs.toFixed(0).padStart(3)}s`);
    }
    if (crashed.length) {
      console.log(`   *** ${crashed.length} run(s) CRASHED the simulation:`);
      for (const c of crashed.slice(0, 8)) console.log(`       ${c}`);
    }
    const cleared = rows.filter((r) => r.c > 0).length;
    console.log(`   → ${cleared}/${rows.length} classes cleared it at least once;`
      + ` progress spans ${(Math.min(...rows.map((r) => r.prog)) * 100).toFixed(0)}%`
      + `–${(Math.max(...rows.map((r) => r.prog)) * 100).toFixed(0)}%`);
  }
}

// ===========================================================================
// E. Contradiction hunt — why does a trash floor time out?
// ===========================================================================
//
// Section C produced a result that breaks the obvious story: a character deliberately
// built past anything a player could assemble (level 90, sixty Legendary chests) still
// fails a depth-30 trash floor, and fails it on the clock rather than by dying, while
// clearing the *boss* floor at the same depth every time. "More power" does not fix it,
// which means it is not a damage-throughput problem in the way it looks.
//
// Before any of that can be reported, it has to be explained. A floor that times out at
// 99% of its quota is a wave-director bug; one that times out at 50% is a throughput
// wall; one that times out having killed everything it could reach is a pathing artifact
// of the bot and not a finding about the game at all.

if (section("E")) {
  console.log("\n=== E. why does a trash floor run out of clock? ===");
  for (const [label, rung] of [
    ["lv60 Legendary x30", { level: 60, tier: "Legendary" as ChestTier, keys: 30 }],
    ["lv90 Legendary x60", { level: 90, tier: "Legendary" as ChestTier, keys: 60 }],
  ] as const) {
    for (const depth of QUICK ? [30] : [20, 30]) {
      console.log(`\n  ${label} on a depth-${depth} trash floor, run by run:`);
      for (let i = 0; i < Math.min(4, SEEDS); i++) {
        const seed = 73_000 + i * 137 + depth;
        const state = character("swordsman", rung.level, rung.tier, rung.keys, seed,
          Math.max(depth, rung.level));
        const hp = state.player.maxHealth;
        const hit = state.player.attackDamage;
        const d = new Dungeon(state, floorAt(depth, false), seed);
        const r = play(state, floorAt(depth, false), seed);
        // Re-run the same seed to read the dungeon's own counters at the end. `play`
        // consumes its state, so this second Dungeon is only used for its static plan.
        console.log(
          `    seed ${seed}  ${r.outcome.padEnd(7)} ${r.seconds.toFixed(0).padStart(3)}s  `
          + `quota ${d.killsRequired} + ${d.elitesRequired} elite  `
          + `progress ${(r.progress * 100).toFixed(0).padStart(3)}%  `
          + `kills/min ${r.killRate.toFixed(1).padStart(5)}  `
          + `dmg taken ${r.damageTaken.toFixed(0).padStart(6)} of ${hp.toFixed(0)} hp  `
          + `hit ${hit.toFixed(0)}`);
      }
    }
  }
  console.log("\n  The arithmetic that decides it: a floor's whole monster pool is");
  console.log("  `killsRequired` bodies of `enemyHealth * archetype * 0.75` each.");
  for (const depth of [15, 20, 25, 30, 35]) {
    const p = profileFor(depth, floorAt(depth, false));
    const arch = trashArchetypeAverage(depth);
    const bodies = p.waves * p.enemiesPerWave;
    const poolHP = bodies * p.enemyHealth * arch.health * WAVE_HEALTH_MULT;
    const bossHP = p.enemyHealth * bossFor(depth).health;
    console.log(`    depth ${String(depth).padStart(2)}  ${String(bodies).padStart(3)} bodies`
      + `  pool ${(poolHP / 1000).toFixed(0).padStart(5)}k hp   boss ${(bossHP / 1000).toFixed(0).padStart(5)}k hp`
      + `   pool/boss ${(poolHP / bossHP).toFixed(2)}`);
  }
  console.log("  A boss's health bar is one target you hit continuously. A floor's pool is");
  console.log("  spread over `maxAlive`-capped waves with travel time between them, so equal");
  console.log("  total health is nowhere near equal clear time — which is why total-work");
  console.log("  parity in section A is not the same claim as equal difficulty.");
}

// ===========================================================================
// F. Is the instrument saturated? (the check that decides whether B-E mean anything)
// ===========================================================================
//
// The stall in section E is not the game. `updateSpawning` only starts the next wave
// once `enemies.length === 0`, and the bot flees *before* it fights: `escapeAngle`
// outranks attacking, so any telegraph covering the hero cancels that tick's swing. At
// deep-floor density something is nearly always covering the hero, so the bot degenerates
// into permanent kiting — and a *tankier* character kites longer instead of dying, which
// is why level 90 scored worse than level 60.
//
// That is a property of `playFloor`, which `tools/smoke.ts` also uses, so it bounds what
// every bot measurement in this repo can say about deep floors. It has to be quantified
// before any of the above is reported as a finding about the game.

if (section("F")) {
  console.log("\n=== F. how much of the bot's time is spent unable to fight? ===");
  console.log("   depth  flavour   fleeing  attacking  outcome        note");
  for (const depth of QUICK ? [10, 30] : [5, 10, 15, 20, 25, 30, 35]) {
    for (const boss of [false, true]) {
      const runs: Run[] = [];
      for (let i = 0; i < Math.min(3, SEEDS); i++) {
        const seed = 74_000 + i * 137 + depth;
        runs.push(play(character("swordsman", 60, "Legendary", 30, seed, DELVE_BOTTOM),
          floorAt(depth, boss), seed));
      }
      const flee = mean(runs.map((r) => r.fleeingFraction));
      const atk = mean(runs.map((r) => r.attackingFraction));
      const out = `${runs.filter((r) => r.outcome === "cleared").length}C `
        + `${runs.filter((r) => r.outcome === "died").length}D `
        + `${runs.filter((r) => r.outcome === "slow").length}S `
        + `${runs.filter((r) => r.outcome === "stalled").length}X`;
      const note = flee > 0.5 ? "SATURATED — measures the bot" : flee > 0.25 ? "degraded" : "ok";
      console.log(`   ${String(depth).padStart(5)}  ${(boss ? "boss" : "trash").padEnd(8)}`
        + `${(flee * 100).toFixed(0).padStart(6)}%  ${(atk * 100).toFixed(0).padStart(8)}%  `
        + `${out.padEnd(12)}   ${note}`);
    }
  }
  console.log("\n   `escapeAngle` outranks attacking in `playFloor` (and so in `tools/smoke.ts`).");
  console.log("   Where 'fleeing' is high the bot is not measuring floor difficulty, it is");
  console.log("   measuring its own priority order. Any trash-floor number above that line is");
  console.log("   a lower bound on what a player could do, not an estimate of it.");
}

// ===========================================================================
// G. What is actually left alive when a floor stalls
// ===========================================================================
//
// Section F disproved the saturation hypothesis: on a trash floor the bot presses attack
// on ~98% of ticks, so it is fighting, not kiting. But the stalled runs freeze at
// progress values just *under* a wave boundary (43/180, 88/180 — waves are 45 each),
// which points at `updateSpawning`'s gate instead: the next wave starts only when
// `enemies.length === 0`, so anything alive and unkillable holds the whole floor open
// forever. This names the survivors.

if (section("G")) {
  console.log("\n=== G. the stall: what is still standing ===");
  let stalls = 0, examined = 0;
  for (const depth of QUICK ? [30] : [20, 25, 30, 35]) {
    for (let i = 0; i < Math.min(4, SEEDS); i++) {
      const seed = 75_000 + i * 137 + depth;
      const state = character("swordsman", 60, "Legendary", 30, seed, DELVE_BOTTOM);
      // Re-implemented inline rather than through `play`, because the question is about
      // the dungeon's end state and `play` only returns a summary.
      const d = new Dungeon(state, floorAt(depth, false), seed);
      const input = new FakeInput();
      const flow = new FlowField(d.level);
      let t = 0, flowTimer = 0;
      const reflexes = new Rng((seed ^ 0x5f3759df) >>> 0);
      let threatSeen = false, willDodge = false, potionCooldown = 0;
      while (t < MAX_SECONDS && d.phase === "fighting") {
        input.beginTick();
        for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);
        let target = null as (typeof d.enemies)[number] | null;
        let gap = Infinity;
        for (const e of d.enemies) {
          if (e.state === "spawning") continue;
          const dd = Math.hypot(e.x - d.avatar.x, e.y - d.avatar.y);
          if (dd < gap) { gap = dd; target = e; }
        }
        const goal = d.completionPortal ?? d.level.portal;
        flowTimer -= DT;
        if (flowTimer <= 0) {
          flow.update(d.level, target ? target.x : goal.x, target ? target.y : goal.y);
          flowTimer = 0.2;
        }
        const hurt = state.player.health < state.player.maxHealth * 0.4 && state.potions > 0 && gap < 70;
        const incoming = d.enemies.some(
          (e) => e.windup > 0 && Math.hypot(e.x - d.avatar.x, e.y - d.avatar.y) < e.archetype.attackRange + 24);
        if (incoming && !threatSeen) willDodge = reflexes.chance(0.55);
        threatSeen = incoming;
        const escape = escapeAngle(d);
        if (escape !== null) {
          const dir = steerAngle(d, escape);
          if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
          if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
          input.press("dash");
          if (target && gap < 40) input.press("attack");
        } else if (target) {
          if (hurt || gap > 26) {
            const dir = hurt ? steer(d, target.x, target.y, true) : approachDir(d, flow, target.x, target.y);
            if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
            if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
          }
          input.press("attack");
          if (hurt || (incoming && willDodge)) input.press("dash");
        }
        if (target && gap < 340) {
          for (let slot = 0; slot < 3; slot++) {
            if (!d.canCast(slot)) continue;
            if (!state.player.activeAbilities[slot]) continue;
            input.press(slot === 0 ? "skill1" : slot === 1 ? "skill2" : "skill3");
            break;
          }
        }
        if (d.specialCharge >= 1) input.press("special");
        potionCooldown -= DT;
        if (state.player.health < state.player.maxHealth * 0.5 && potionCooldown <= 0) {
          input.press("potion"); potionCooldown = 2;
        }
        d.update(DT, input as unknown as Input);
        d.drainEvents();
        t += DT;
      }
      examined++;
      if (d.phase !== "fighting") {
        console.log(`  depth ${depth} seed ${seed}: ${d.phase} at ${t.toFixed(0)}s,`
          + ` ${d.killsSoFar}/${d.killsRequired} kills, wave ${d.wave}/${d.profile.waves}`);
        continue;
      }
      stalls++;
      flow.update(d.level, d.avatar.x, d.avatar.y);
      const fromWave = d.enemies.filter((e) => e.fromWave).length;
      console.log(`\n  depth ${depth} seed ${seed}: STALLED at ${t.toFixed(0)}s —`
        + ` ${d.killsSoFar}/${d.killsRequired} kills, wave ${d.wave}/${d.profile.waves},`
        + ` ${d.enemies.length} alive (${fromWave} count toward the quota,`
        + ` ${d.enemies.length - fromWave} do not)`);
      const byKind = new Map<string, number>();
      for (const e of d.enemies) {
        const k = `${e.archetype.name}${e.fromWave ? "" : " (summoned, uncounted)"}`;
        byKind.set(k, (byKind.get(k) ?? 0) + 1);
      }
      for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
        console.log(`      ${String(n).padStart(3)} x ${k}`);
      }
      const stuck = d.enemies.filter((e) => !flow.direction(d.level, e.x, e.y)).length;
      const far = d.enemies.filter(
        (e) => Math.hypot(e.x - d.avatar.x, e.y - d.avatar.y) > 600).length;
      // The decisive question: is the survivor *inside rock*? If so the defect is spawn
      // placement (`spawnBurst` scatters up to 60u from an open centre, and one wall is
      // 32u thick, so the scatter can cross one), not pathfinding.
      const inWall = d.enemies.filter(
        (e) => circleHitsWall(d.level, e.x, e.y, e.radius)).length;
      console.log(`      ${stuck} standing where the flow field cannot route,`
        + ` ${far} more than 600u away, ${inWall} embedded in rock`);
      for (const e of d.enemies.slice(0, 4)) {
        console.log(`      · ${e.archetype.name} r=${e.radius} at (${e.x.toFixed(0)},${e.y.toFixed(0)})`
          + ` inRock=${circleHitsWall(d.level, e.x, e.y, e.radius)}`
          + ` routable=${!!flow.direction(d.level, e.x, e.y)}`
          + ` hp=${e.health.toFixed(0)}/${e.maxHealth.toFixed(0)}`
          + ` dist=${Math.hypot(e.x - d.avatar.x, e.y - d.avatar.y).toFixed(0)}`);
      }
    }
  }
  console.log(`\n  ${stalls} of ${examined} runs stalled outright.`);
  if (stalls > 0) {
    console.log("  A stall is not a difficulty reading. `updateSpawning` gates the next wave on");
    console.log("  `enemies.length === 0`, and a summoner's chaff counts toward that length while");
    console.log("  counting toward no quota — so an endless summoner holds the floor open forever.");
    console.log("  This is a separate defect from the difficulty curve and must be reported as one.");
  }
}

// ===========================================================================
// H. How often does a floor stall, by depth?
// ===========================================================================
//
// This is the number that decides how much of the "deep floors are a wall" story is the
// difficulty curve at all. A stall needs one unreachable body, and a floor's body count
// grows with depth (`waves * enemiesPerWave`, 39 at depth 5 and 180 at depth 30), so the
// per-floor stall probability grows with depth even if the per-monster probability is
// flat. That produces a depth trend with nothing to do with difficulty — and every
// earlier measurement would have read it as difficulty.
//
// A short clock is enough here: a stall is 120 seconds of nothing dying, so 300 seconds
// distinguishes it from a slow floor without paying for the full timeout.

if (section("H")) {
  console.log("\n=== H. stall rate by depth (level 60, Legendary, 300s clock) ===");
  console.log("   depth  bodies   cleared  died  slow  STALLED   stall rate");
  const seeds = QUICK ? 4 : 12;
  for (const depth of QUICK ? [10, 30] : [5, 10, 15, 20, 25, 30, 35]) {
    const runs: Run[] = [];
    for (let i = 0; i < seeds; i++) {
      const seed = 76_000 + i * 613 + depth;
      runs.push(play(character("swordsman", 60, "Legendary", 30, seed, DELVE_BOTTOM),
        floorAt(depth, false), seed, 0.55, 300));
    }
    const n = (o: Run["outcome"]) => runs.filter((r) => r.outcome === o).length;
    const p = profileFor(depth, floorAt(depth, false));
    const bodies = p.waves * p.enemiesPerWave;
    console.log(`   ${String(depth).padStart(5)}  ${String(bodies).padStart(6)}   `
      + `${String(n("cleared")).padStart(7)}  ${String(n("died")).padStart(4)}  `
      + `${String(n("slow")).padStart(4)}  ${String(n("stalled")).padStart(7)}   `
      + `${pct(n("stalled"), runs.length).padStart(5)}`);
  }
  console.log("\n   If this rate climbs with depth, part of every earlier 'deep floors are a wall'");
  console.log("   reading is this defect rather than the curve — and the fix is a straggler");
  console.log("   timeout in the wave director, not a tuning change.");
}

// ===========================================================================
// I. Spawn placement audit — the mechanism, measured without a bot at all
// ===========================================================================
//
// Sections G and H depend on a bot, a clock and a stall heuristic, so they are the wrong
// instrument for establishing a *mechanism*. This one has no bot: it generates floors,
// lets the wave director spawn into them, and asks one question — is this monster inside
// rock? A body that is embedded is unroutable by construction, and one unroutable body
// with `fromWave` set freezes the floor forever, because `updateSpawning` will not start
// the next wave until `enemies.length === 0`.
//
// Why it happens: `spawnBurst` picks an open centre and scatters each monster up to 60
// units from it. One wall is 32 units thick (the lattice rule), so a scatter routinely
// crosses one. `resolveCircle` is then asked to push the monster back out — and it ejects
// from each wall rectangle in two passes, which is right for a single thin wall and wrong
// for a *sealed region*, where ejecting from one block lands inside the next one. The
// monster ends up embedded, and nothing ever checks.

if (section("I")) {
  console.log("\n=== I. how often does a monster spawn inside rock? ===");
  // Two predicates, deliberately. "Clips a wall" is cheap but overcounts: a monster
  // half-inside a wall is still standing in the open and still killable. The predicate
  // that actually matters is "the flow field cannot route to it", because that is what
  // makes it both unreachable by the player and unable to walk to the player — and so
  // what makes the floor uncompletable.
  console.log("   depth  floors  spawned   clipping   UNROUTABLE   floors with an");
  console.log("                             a wall     (the bug)   unroutable body");
  const floors = QUICK ? 6 : 30;
  let totalEmbedded = 0, totalSpawned = 0;
  for (const depth of QUICK ? [5, 30] : [1, 3, 5, 10, 15, 20, 25, 30, 35]) {
    let spawned = 0, embedded = 0, clipping = 0, badFloors = 0, worst = 0;
    for (let i = 0; i < floors; i++) {
      const seed = 78_000 + i * 977 + depth;
      const state = character("swordsman", 60, "Legendary", 8, seed, DELVE_BOTTOM);
      const d = new Dungeon(state, floorAt(depth, false), seed);
      const idle = new FakeInput();
      // Stand still and let the director fill the floor. No fighting, so nothing dies and
      // the whole first wave is observable at once.
      const seen = new Set<Enemy>();
      for (let t = 0; t < 60; t += DT) {
        d.update(DT, idle as unknown as Input);
        d.drainEvents();
        for (const e of d.enemies) seen.add(e);
      }
      const flow = new FlowField(d.level);
      flow.update(d.level, d.avatar.x, d.avatar.y);
      let here = 0;
      for (const e of seen) {
        spawned++;
        if (circleHitsWall(d.level, e.x, e.y, e.radius)) clipping++;
        if (!flow.direction(d.level, e.x, e.y)) { embedded++; here++; }
      }
      if (here > 0) badFloors++;
      worst = Math.max(worst, here);
    }
    totalEmbedded += embedded; totalSpawned += spawned;
    console.log(`   ${String(depth).padStart(5)}  ${String(floors).padStart(6)}  `
      + `${String(spawned).padStart(7)}  ${String(clipping).padStart(9)}  `
      + `${String(embedded).padStart(10)}   ${`${badFloors}/${floors}`.padStart(15)}`
      + `   worst ${worst}`);
  }
  console.log(`\n   overall: ${totalEmbedded} of ${totalSpawned} spawns unroutable `
    + `(${((totalEmbedded / Math.max(1, totalSpawned)) * 100).toFixed(2)}%)`);
  console.log("   A floor needs exactly one of these, carrying `fromWave`, to become");
  console.log("   permanently uncompletable. The per-monster rate is small; the per-floor");
  console.log("   rate is what a player experiences, and it rises with the body count.");
}
