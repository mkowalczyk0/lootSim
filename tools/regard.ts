/**
 * The regard ward's ranged-vs-melee tax (UAT §21).
 *
 * The Tower's own hazard punishes standing still: a ward marks the ground under anybody
 * who has held still for `REGARD_HOLD` and sears it `TRAPS.regard.warn` later. That is a
 * fine mechanic and a dangerous one, because **standing still is not evenly distributed
 * across the roster**. A sword build spends the fight closing, circling and repositioning;
 * a bow, a staff or a channelled build stops at range and fires. Ship the hold too short
 * and the Tower is a quiet, permanent nerf to half the classes in the game, delivered as
 * a level hazard where nobody would think to look for it.
 *
 * So the hold time is measured before it is settled, and this is the instrument. It is
 * deliberately **not** part of `npm test`: it reports a number for a design decision, it
 * doesn't assert one. What `npm run world` pins instead is the property the number is in
 * service of — that the regard's telegraph is the longest in the game and stays that way.
 *
 * **Why this isn't done with `tools/smoke.ts`'s bot.** That bot closes to under 26 units
 * of its target and swings, for every class, whatever it is holding — it plays a staff
 * exactly like an axe. Measuring the ranged tax with it would compare a melee bot against
 * a melee bot and report no gap at all: a perfectly green, perfectly meaningless null.
 * (That is this repo's own recurring lesson — a check that passes because the two things
 * it compares have quietly become the same thing.) So the two policies here differ in the
 * one dimension that actually drives the mechanic, and nothing else: identical class,
 * identical gear, identical floors, identical seeds. Only the standoff distance changes.
 *
 * **Two rates, and they answer different questions.** A *mark* is the ward noticing you;
 * a *sear* is the mark landing because you didn't walk out of it. Only the second one is a
 * nerf. A build that gets marked twice as often and walks out of both has been asked to
 * reposition, which is what the mechanic is for; a build that gets *hit* more has been
 * taxed. Both are printed, and both are normalised per minute *inside a ward's reach*,
 * because a policy that sweeps the floor meets more wards than one that parks and without
 * dividing that out this measures map traversal rather than the mechanic.
 *
 * **What the sweep found (Sept 2026, at the numbers in `data/traps.ts`).** The design
 * review's expected remedy — if ranged pays more, lengthen the hold — is contradicted by
 * measurement, and it is worth writing down why so nobody re-derives it. Melee stillness
 * is many short pauses (still ~40% of the time, but markable only ~13% at a 0.8s hold);
 * ranged stillness is one long park (still ~67%, markable ~50%). Lengthening the hold
 * filters out exactly the short pauses and leaves the long park untouched, so it
 * *concentrates* the tax on ranged instead of relieving it:
 *
 * ```
 *   hold    marks ratio   sears ratio     (worst ranged case / melee, in reach)
 *   0.55s      x1.49         x1.07
 *   0.80s      x1.29         x0.54   <- shipped
 *   1.10s      x2.71         x1.63
 *   1.40s      x2.67         x2.34
 * ```
 *
 * (Measured at the shipped 0.85s telegraph. An earlier sweep at a 0.7s telegraph found the
 * same shape and the same winner, so the conclusion isn't an artifact of one pairing; it
 * also ran out to 1.8s and 2.4s, where the event counts get too small to mean anything.)
 *
 * 0.80s is the minimum of both ratios in the shippable range and the only value tested
 * where a ranged build takes *less* from the ward than a melee one. Below ~0.55s the ward
 * stops being a hold-still mechanic and becomes ambient chip damage on anyone who pauses;
 * above ~1.1s both ratios run away. So the hold is not a fairness dial in the direction
 * anyone assumed, and the shippable window is narrow and centred where it is.
 *
 * Read the sear ratio with one caveat in mind: the melee policy holds its ground by
 * construction and therefore walks out of *none* of its marks, where the ranged policies
 * walk out of roughly 40%. That flatters ranged. The marks ratio is the robust number; the
 * sear ratio is directionally right and optimistic.
 *
 * Run with `npm run regard`. Deliberately not in `npm test`.
 */
import type { Action, AvatarInput } from "../src/core/input";
import { Dungeon } from "../src/game/dungeon";
import { FlowField } from "../src/game/level";
import { GameState } from "../src/game/state";
import { itemScore, rollItem } from "../src/game/item";
import { Rng } from "../src/core/rng";
import type { ClassId } from "../src/data/classes";
import { towerConfig } from "../src/data/tower";
import { REGARD_HOLD, REGARD_STILL_SPEED, REGARD_WATCH, TRAPS } from "../src/data/traps";

const DT = 1 / 60;

/** Minimal AvatarInput, the same shape tools/smoke.ts drives a floor with. */
class FakeInput {
  private down = new Set<Action>();
  private pressed = new Set<Action>();
  hold(a: Action, on: boolean) { on ? this.down.add(a) : this.down.delete(a); }
  press(a: Action) { this.pressed.add(a); }
  beginTick() { this.pressed.clear(); }
  isDown(a: Action) { return this.down.has(a); }
  wasPressed(a: Action) { return this.pressed.has(a); }
  wasPressedOrRepeated(a: Action) { return this.pressed.has(a); }
  /** The keyboard-only scheme, like the smoke bot: it faces where it walks and never aims. */
  aimAngle() { return null; }
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

function geared(level: number, seed: number, classId: ClassId): GameState {
  const state = new GameState(seed);
  state.chooseClass(classId);
  state.player.level = level;
  state.player.refresh();
  state.player.autoSlotNewAbilities();
  state.keys.Advanced = 14;
  state.openChests("Advanced", 14);
  const cls = state.heroClass;
  for (const item of [...state.inventory].sort((a, b) => itemScore(b, cls) - itemScore(a, cls))) {
    const worn = state.player.equipment[item.slot];
    if (!worn || itemScore(item, cls) > itemScore(worn, cls)) state.equipFromInventory(item.id);
  }
  if (!state.player.hasAffinity) {
    const family = cls.affinity[0]!;
    state.player.equip(rollItem({ rarity: "rare", type: family, ilvl: level, rng: new Rng(seed ^ 0x51ed) }));
  }
  state.player.fullHeal();
  state.potions = 5;
  return state;
}

interface Tally {
  seconds: number;
  /** Ticks the hero was inside the stillness threshold. */
  stillTicks: number;
  /** Ticks the hero had already held still long enough to be markable. */
  markableTicks: number;
  /** Times a ward marked this hero's ground. */
  marks: number;
  /** Times a mark actually landed on them — they failed to walk out of the telegraph. */
  seared: number;
  /**
   * Ticks spent inside some ward's reach. The control: a policy that walks more of the
   * floor meets more wards, and without dividing that out this measures how much ground
   * each policy covers rather than how hard the mechanic hits it.
   */
  exposedTicks: number;
}

/**
 * One tower floor, played to a fixed clock rather than to a clear, because the question is
 * a rate (marks per minute) and letting the two policies run for different lengths of time
 * would let the faster one look safer for free.
 *
 * `standoff` is the entire difference between the two policies: the distance the hero
 * tries to hold from whatever it is fighting. A melee policy closes inside its weapon's
 * reach and keeps circling; a ranged policy stops at `standoff` and fires from there,
 * which is what a bow or a staff actually does and what a regard ward is looking for.
 */
function playTower(state: GameState, height: number, seed: number, standoff: number, seconds: number): Tally {
  const d = new Dungeon(state, towerConfig(height), seed);
  const input = new FakeInput();
  const flow = new FlowField(d.level);
  let flowTimer = 0;
  const tally: Tally = { seconds: 0, stillTicks: 0, markableTicks: 0, marks: 0, seared: 0, exposedTicks: 0 };
  // What each ward was doing last tick, so one mark and one sear are counted once each
  // rather than once per tick they happen to be visible for.
  let warning = new Set<number>();
  let searing = new Set<number>();

  for (let t = 0; t < seconds && d.phase === "fighting"; t += DT) {
    input.beginTick();
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);

    const a = d.avatar;
    let target = null as (typeof d.enemies)[number] | null;
    let gap = Infinity;
    for (const e of d.enemies) {
      if (e.state === "spawning") continue;
      const dd = Math.hypot(e.x - a.x, e.y - a.y);
      if (dd < gap) { gap = dd; target = e; }
    }

    const goal = target ?? d.completionPortal ?? d.level.portal;
    flowTimer -= DT;
    if (flowTimer <= 0) { flow.update(d.level, goal.x, goal.y); flowTimer = 0.2; }

    // The policy. Close if further than the standoff, back off if much closer, otherwise
    // hold — which for a ranged standoff means standing still and shooting, exactly the
    // behaviour the ward exists to punish.
    if (target) {
      const want = gap > standoff * 1.15 ? 1 : gap < standoff * 0.7 ? -1 : 0;
      if (want !== 0) {
        const step = flow.direction(d.level, a.x, a.y);
        const dir = want > 0 && step
          ? step
          : { x: (a.x - target.x) / (gap || 1) * -want, y: (a.y - target.y) / (gap || 1) * -want };
        if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
        if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
      }
      input.press("attack");
      if (gap < standoff * 1.6) {
        for (const k of ["skill1", "skill2", "skill3"] as Action[]) input.press(k);
      }
    } else {
      const step = flow.direction(d.level, a.x, a.y);
      if (step) {
        if (Math.abs(step.x) > 0.25) input.hold(step.x > 0 ? "right" : "left", true);
        if (Math.abs(step.y) > 0.25) input.hold(step.y > 0 ? "down" : "up", true);
      }
    }
    if (state.player.health < state.player.maxHealth * 0.35) input.press("potion");

    const before = { x: a.x, y: a.y };
    d.update(DT, input as unknown as AvatarInput);
    d.drainEvents();
    tally.seconds += DT;

    if (Math.hypot(a.x - before.x, a.y - before.y) <= REGARD_STILL_SPEED * DT) tally.stillTicks++;
    if (a.stillTime >= REGARD_HOLD) tally.markableTicks++;

    const nowWarning = new Set<number>();
    const nowSearing = new Set<number>();
    let exposed = false;
    d.level.traps.forEach((trap, i) => {
      if (trap.kind !== "regard") return;
      if (Math.hypot(a.x - trap.ax, a.y - trap.ay) <= REGARD_WATCH) exposed = true;
      if (trap.state === "warn") {
        nowWarning.add(i);
        if (!warning.has(i)) tally.marks++;
      }
      if (trap.state === "active") {
        nowSearing.add(i);
        if (!searing.has(i) && Math.hypot(a.x - trap.x, a.y - trap.y) <= trap.radius + a.radius) {
          tally.seared++;
        }
      }
    });
    if (exposed) tally.exposedTicks++;
    warning = nowWarning;
    searing = nowSearing;
    if (state.player.health <= 0) break;
  }
  return tally;
}

const MELEE_STANDOFF = 24;
const RANGED_STANDOFF = 250;
const HEIGHTS = [7, 12, 18, 24];
const SEEDS = [4101, 4102, 4103, 4104, 4105, 4106];
const SECONDS = 90;
// Two real classes rather than one class holding two weapons, so the measurement includes
// the ability kit a build actually stands still to use.
const CASES: [string, ClassId, number][] = [
  ["melee  (swordsman, closes)", "swordsman", MELEE_STANDOFF],
  ["ranged (ranger, holds range)", "ranger", RANGED_STANDOFF],
  ["ranged (magician, holds range)", "magician", RANGED_STANDOFF],
];

console.log(`\n=== the regard ward's ranged-vs-melee tax ===`);
console.log(`hold ${REGARD_HOLD}s, telegraph ${TRAPS.regard.warn}s, ` +
  `${HEIGHTS.length} heights x ${SEEDS.length} seeds x ${SECONDS}s each\n`);

interface Row { label: string; markable: number; marks: number; seared: number; mins: number; exposedMins: number }
const rows: Row[] = [];
for (const [label, classId, standoff] of CASES) {
  let stillTicks = 0, markableTicks = 0, exposedTicks = 0, marks = 0, seared = 0, secs = 0;
  for (const height of HEIGHTS) {
    for (const seed of SEEDS) {
      const state = geared(24, seed ^ 0x9e37, classId);
      const r = playTower(state, height, seed, standoff, SECONDS);
      stillTicks += r.stillTicks;
      markableTicks += r.markableTicks;
      exposedTicks += r.exposedTicks;
      marks += r.marks;
      seared += r.seared;
      secs += r.seconds;
    }
  }
  const mins = secs / 60;
  const exposedMins = Math.max(1e-9, exposedTicks * DT / 60);
  rows.push({ label, markable: markableTicks * DT / secs, marks, seared, mins, exposedMins });
  console.log(
    `  ${label.padEnd(31)} still ${(stillTicks * DT / secs * 100).toFixed(1).padStart(5)}%` +
    `  markable ${(markableTicks * DT / secs * 100).toFixed(1).padStart(5)}%` +
    `  in reach ${(exposedTicks * DT / secs * 100).toFixed(1).padStart(5)}%` +
    `  marks ${(marks / exposedMins).toFixed(2).padStart(5)}/min in reach` +
    `  seared ${(seared / exposedMins).toFixed(2).padStart(5)}/min in reach`,
  );
}

const melee = rows[0]!;
const ranged = rows.slice(1);
// Rates are per minute *inside a ward's reach*, not per minute of play. A policy that
// sweeps the floor meets more wards than one that parks; dividing that out is what turns
// this from a measurement of map traversal into a measurement of the mechanic.
const worst = ranged.reduce((a, b) => (b.marks / b.exposedMins > a.marks / a.exposedMins ? b : a));
const meleeRate = melee.marks / melee.exposedMins;
const worstRate = worst.marks / worst.exposedMins;
const ratio = meleeRate > 0 ? worstRate / meleeRate : Infinity;
const meleeSear = melee.seared / melee.exposedMins;
const worstSearRow = ranged.reduce((a, b) => (b.seared / b.exposedMins > a.seared / a.exposedMins ? b : a));
const worstSear = worstSearRow.seared / worstSearRow.exposedMins;
console.log(`\n  worst ranged case is ${worst.label.trim()}`);
console.log(`  marks per minute in reach:  melee ${meleeRate.toFixed(2)}  vs ranged ${worstRate.toFixed(2)}` +
  `  — ratio ${Number.isFinite(ratio) ? `x${ratio.toFixed(2)}` : "unbounded (melee never marked)"}`);
console.log(`  sears per minute in reach:  melee ${meleeSear.toFixed(2)}  vs ranged ${worstSear.toFixed(2)}` +
  `  — ratio ${meleeSear > 0 ? `x${(worstSear / meleeSear).toFixed(2)}` : "unbounded (melee never seared)"}`);
console.log(
  `\n  The sears ratio is the one that measures a nerf: a mark you walk out of cost you a\n` +
  `  reposition, which is the mechanic working. A ratio near or below 1 there means\n` +
  `  ${REGARD_HOLD}s taxes both halves of the roster the same.\n\n` +
  `  Do NOT reach for a longer hold if these come back high — the sweep in this file's\n` +
  `  header shows lengthening makes both ratios worse, because it filters out melee's\n` +
  `  short pauses and leaves ranged's long park. And never shorten the telegraph to\n` +
  `  compensate: that trades a fair tax for an unreadable one.\n`,
);
