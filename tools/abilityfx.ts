/**
 * Ability FX acceptance test — the hitscan tracers (`docs/ability-fx.md`).
 *
 * The feature is presentation for 36 abilities that resolve damage across the room and,
 * until now, showed the player nothing at all. Two properties matter, and only one of them
 * is about what you can see:
 *
 *  1. **Coverage, over the table rather than by spot check.** Every ability that reaches
 *     past melee and resolves harm must author an `fx.travel`. Asserted by walking all 210
 *     abilities in `ALL_CLASSES` and classifying them, so the next ranged ability somebody
 *     adds fails this gate instead of silently shipping invisible.
 *
 *  2. **Byte-identical simulation.** `render/` and `ui/` read state and draw; they never
 *     mutate it. A tracer is emitted from inside `castAbility`, which is the simulation, so
 *     "it's only cosmetic" has to be *proved* rather than asserted: the same seeded floor
 *     with the same scripted bot must produce an identical outcome whether the abilities
 *     carry `fx` or not.
 *
 * **On the second check, an injected violation is the only thing that proves it works.**
 * This repo has learned that lesson twice now, and the trap is specific: a sabotage that
 * only reaches a cosmetic event, or that lands downstream of where the comparison reads,
 * leaves the check green while proving nothing. So the injection here is the exact failure
 * this feature could plausibly have — **`emitTracer` drawing from the dungeon's own rng** —
 * which reorders every subsequent draw in the run (spawns, drops, crits) and must turn the
 * comparison red. If it ever stops doing that, the comparison has gone blind and the fix is
 * a stronger injection, not a shrug.
 */

import { Dungeon } from "../src/game/dungeon";
import { ALL_CLASSES } from "../src/progression/index";
import { TRACER_STYLES } from "../src/render/fx";
import type { Ability, EffectStep } from "../src/combat/ability";
import { geared, playFloor } from "./bot";
import type { ClassId } from "../src/data/classes";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

// --- classifying the table -----------------------------------------------------------

/** Steps that put something on screen between the caster and whatever it hit. */
const VISUAL = new Set(["projectile", "zone", "terrain", "summon", "move"]);
/** Steps that resolve harm or a debuff on somebody else. */
const HARM = new Set(["damage", "status", "knockback", "pull", "interrupt"]);

/** Every step kind an ability runs, nested steps included. */
function stepKinds(steps: readonly EffectStep[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly EffectStep[]) => {
    for (const s of list) {
      out.push((s as { kind: string }).kind);
      for (const key of ["effects", "then", "steps", "onHit"] as const) {
        const nested = (s as unknown as Record<string, unknown>)[key];
        if (Array.isArray(nested)) walk(nested as EffectStep[]);
      }
      const random = (s as unknown as { random?: { effects?: EffectStep[] }[] }).random;
      if (Array.isArray(random)) for (const o of random) if (o.effects) walk(o.effects);
    }
  };
  walk(steps);
  return out;
}

/**
 * Melee reach. Anything at or under this is a swing the player can already see happening
 * on their own character, so it needs no line drawn to it; past it, the damage lands
 * somewhere the player is not looking.
 */
const MELEE_RANGE = 90;

/** Does this ability reach across the room and resolve harm with nothing of its own on screen? */
function needsTravelFx(a: Ability): boolean {
  if ((a.range ?? 0) <= MELEE_RANGE) return false;
  if (a.targeting === "self") return false;
  const kinds = stepKinds(a.effects);
  if (kinds.some((k) => VISUAL.has(k))) return false;
  return kinds.some((k) => HARM.has(k));
}

const ALL_ABILITIES: Ability[] = ALL_CLASSES.flatMap((c) => [...c.abilities]);

// --- 1. coverage ---------------------------------------------------------------------

section("coverage");

{
  const need = ALL_ABILITIES.filter(needsTravelFx);
  const missing = need.filter((a) => !a.fx?.travel);
  check(
    "every ranged ability that resolves harm authors an fx.travel",
    missing.length === 0,
    missing.length > 0
      ? `${missing.length} missing: ${missing.map((a) => `${a.id} (range ${a.range})`).join(", ")}`
        + `\n         Add fx: { travel: "beam" | "lance" | "bolt" } to each — see docs/ability-fx.md §4.`
        + `\n         If one of these is really a melee swing authored just past the ${MELEE_RANGE}-unit`
        + `\n         cutoff, the fix is to lower its range or make it self/melee-targeted explicitly.`
        + `\n         Do not raise the cutoff: it is what stops a swing drawing a line across a room`
        + `\n         it never reached.`
      : `${need.length} covered of ${ALL_ABILITIES.length} abilities`,
  );

  const bad = ALL_ABILITIES.filter((a) => a.fx?.travel && !(TRACER_STYLES as readonly string[]).includes(a.fx.travel));
  check("every authored travel names a real tracer style", bad.length === 0,
    bad.map((a) => `${a.id}=${a.fx?.travel}`).join(", "));

  // The inverse: a melee swing that quietly grew a tracer would draw a line across a room
  // it never reached. Coverage has to be a boundary, not a floor.
  const overreach = ALL_ABILITIES.filter((a) => a.fx?.travel && (a.range ?? 0) <= MELEE_RANGE);
  check("no melee-range ability draws a line it never crossed", overreach.length === 0,
    overreach.map((a) => a.id).join(", "));

  const styles = new Map<string, number>();
  for (const a of ALL_ABILITIES) if (a.fx?.travel) styles.set(a.fx.travel, (styles.get(a.fx.travel) ?? 0) + 1);
  check("all three styles are actually used", styles.size === TRACER_STYLES.length,
    [...styles].map(([k, v]) => `${k}:${v}`).join(" "));
}

// --- 2. the simulation cannot see it -------------------------------------------------

section("byte-identical simulation");

/**
 * The end-of-run state, exactly as `tools/smoke.ts` takes it for the combat-stats overlay:
 * everything the run decided, with item ids stripped because those come off a module-level
 * counter rather than off anything the floor did.
 */
function outcomeSnapshot(d: Dungeon): string {
  const hero = d.localHero;
  return JSON.stringify({
    phase: d.phase, elapsed: d.elapsed, wave: d.wave,
    killsSoFar: d.killsSoFar, elitesKilled: d.elitesKilled,
    health: hero.player.health, mana: hero.player.mana,
    xp: hero.player.xp, level: hero.player.level, downed: hero.downed,
    avatar: { x: hero.avatar.x, y: hero.avatar.y, facing: hero.avatar.facing },
    loot: { ...hero.loot, items: hero.loot.items.map(({ id: _id, ...rest }) => rest) },
    enemies: d.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, health: e.health, kind: e.archetype.kind })),
  });
}

/** Runs the same seeded floor, with every `fx` on the roster present or stripped. */
function playWithFx(present: boolean, classId: string): Dungeon {
  const saved = new Map<Ability, Ability["fx"]>();
  if (!present) {
    for (const a of ALL_ABILITIES) {
      if (a.fx) { saved.set(a, a.fx); delete (a as { fx?: unknown }).fx; }
    }
  }
  try {
    return playFloor(geared(14, 7711, 12, classId as ClassId), 9, 90, 4141, 0.6).d;
  } finally {
    for (const [a, fx] of saved) (a as { fx?: unknown }).fx = fx;
  }
}

// Two classes, because the bot only casts what the class it is playing has: a lancer
// exercises `lance` tracers, a warlock is the densest source of `bolt` ones.
for (const classId of ["lancer", "warlock"]) {
  const withFx = playWithFx(true, classId);
  const without = playWithFx(false, classId);
  check(
    `a ${classId} floor plays out identically with tracers and without`,
    outcomeSnapshot(withFx) === outcomeSnapshot(without),
    `${withFx.killsSoFar} kills, ${withFx.elapsed.toFixed(1)}s`,
  );
}

// --- 3. ...and the check above can actually fail --------------------------------------

section("the check has teeth");

{
  // The injection has to reach the rng stream, or a green result proves nothing. Drawing
  // from the dungeon's own generator inside `emitTracer` is the real failure this feature
  // could have, and it reorders every subsequent draw in the run.
  const proto = Dungeon.prototype as unknown as {
    emitTracer: (s: string, e: string, a: number, b: number, c: number, d: number) => void;
  };
  const real = proto.emitTracer;
  let fired = 0;
  proto.emitTracer = function sabotaged(this: Dungeon, ...args) {
    fired++;
    this.rng.next();
    return real.apply(this, args);
  };
  let injectedDiffers = false;
  try {
    const withFx = playWithFx(true, "lancer");
    const without = playWithFx(false, "lancer");
    injectedDiffers = outcomeSnapshot(withFx) !== outcomeSnapshot(without);
  } finally {
    proto.emitTracer = real;
  }
  check("the injection actually fired during the run", fired > 0, `${fired} tracers emitted`);
  check(
    "an emitTracer that touches the sim's rng is caught by the comparison",
    injectedDiffers,
    injectedDiffers ? "diverged, as it must" : "STILL IDENTICAL — the comparison is blind",
  );

  // ...and the un-sabotaged comparison is green again afterwards, so the restore worked
  // and the previous check wasn't passing because the harness stayed broken.
  check("the comparison is clean again once the injection is removed",
    outcomeSnapshot(playWithFx(true, "lancer")) === outcomeSnapshot(playWithFx(false, "lancer")));
}

// --- 4. the tracer is emitted where it should be --------------------------------------

section("tracers reach the floor");

{
  // Not a claim about the renderer — a claim that the simulation offered it something to
  // draw. Without this, every check above would pass on a feature that never fires once.
  // Counted by observing the seam rather than by adding a counter to `Dungeon`: a test
  // must not make the thing it is testing carry a field only the test reads.
  const proto = Dungeon.prototype as unknown as {
    emitTracer: (s: string, e: string, a: number, b: number, c: number, d: number) => void;
  };
  const real = proto.emitTracer;
  const styles = new Set<string>();
  let count = 0;
  proto.emitTracer = function counted(this: Dungeon, ...args) {
    count++;
    styles.add(args[0]);
    return real.apply(this, args);
  };
  try {
    playWithFx(true, "warlock");
    playWithFx(true, "lancer");
  } finally {
    proto.emitTracer = real;
  }
  check("a real floor emits tracers", count > 0, `${count} across two classes`);
  check("...and the abilities that fired chose more than one style", styles.size > 1, [...styles].join(", "));
}

console.log(`\n${failures === 0 ? "ability fx: all checks passed" : `ability fx: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
