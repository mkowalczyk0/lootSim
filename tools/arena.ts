/**
 * Controlled combat arena — Stage 11's measurement harness (docs/combat-cutover-plan.md §4).
 *
 * `tools/smoke.ts` plays whole floors and answers "does the game hold together". This
 * answers a narrower question the smoke bot is too noisy for: given a class standing in a
 * fair fight, how fast does its ultimate meter fill, can it keep its primary resource fed,
 * and roughly what does its sustained single-target / burst / AoE output look like.
 *
 * It is deliberately not a real floor. The wave director is switched off after the first
 * wave and the surviving monsters are converted into neutral training dummies — no
 * resists, no damage, pinned in a ring around a stationary god-mode hero — and topped back
 * up as they die. That removes pathing, telegraph-dodging, retreating and gear-elemental
 * matchups from the measurement so what is left is the class kit itself. The dummies still
 * die on a real killing blow, so kill- and corpse-driven charge rules (Reaper, Necro) are
 * exercised the same way a fight exercises them.
 *
 * Twelve axes, per §4. Six are measured here (sustained ST, burst, AoE, meter-fill,
 * resource sustain, summon contribution — summons show up in the damage total because a
 * minion's hits are the hero's hits). The other six (effective HP, healing, mitigation,
 * mobility, control, support, utility, execution) are read statically off the resolved
 * kit — an arena of stationary dummies can't measure "did the escape save you" — and
 * printed as an effect-step census so the table has a number for every column.
 */
import type { Action, AvatarInput, Input } from "../src/core/input";
import { Dungeon } from "../src/game/dungeon";
import type { Enemy } from "../src/game/entities";
import { resolveCircle } from "../src/game/level";
import { itemScore, rollItem } from "../src/game/item";
import { GameState } from "../src/game/state";
import { CLASS_IDS, type ClassId } from "../src/data/classes";
import { zeroResists } from "../src/data/elements";
import { profileFor } from "../src/data/depth";
import { CLASS_BY_ID } from "../src/progression/index";
import type { Ability, EffectStep } from "../src/combat/ability";
import { StatusContainer } from "../src/combat/status";
import { Rng } from "../src/core/rng";

const DT = 1 / 60;
const ARENA_DEPTH = 8;

class ArenaInput {
  private down = new Set<Action>();
  private pressed = new Set<Action>();
  /** The point every attack, skill and ground-placed AoE aims at. */
  aim: { x: number; y: number } = { x: 0, y: 0 };
  hold(a: Action, on: boolean) { on ? this.down.add(a) : this.down.delete(a); }
  press(a: Action) { this.pressed.add(a); }
  beginTick() { this.pressed.clear(); }
  isDown(a: Action) { return this.down.has(a); }
  wasPressed(a: Action) { return this.pressed.has(a); }
  wasPressedOrRepeated(a: Action) { return this.pressed.has(a); }
  aimAngle(x: number, y: number) { return Math.atan2(this.aim.y - y, this.aim.x - x); }
  aimPoint() { return { x: this.aim.x, y: this.aim.y }; }
  moveVector() { return { x: 0, y: 0 }; }
}

/** Levels and dresses a character exactly the way `tools/smoke.ts` does. */
function geared(level: number, seed: number, keys: number, classId: ClassId): GameState {
  const state = new GameState(seed);
  state.chooseClass(classId);
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
  if (!state.player.hasAffinity) {
    const family = cls.affinity[0]!;
    state.player.equip(rollItem({ rarity: "rare", type: family, ilvl: level, rng: new Rng(seed ^ 0x51ed) }));
  }
  state.player.fullHeal();
  state.potions = 5;
  return state;
}

interface ArenaResult {
  dps: number;
  burst3: number;
  meterFullAt: number | null;
  meterEnd: number;
  primaryMin: number;
  primaryName: string;
  ultCasts: number;
  dmgTaken: number;
}

/**
 * One arena run. Dummies sit at `dummyHp`× a floor monster's health and hit back for
 * `dummyDamage`× a floor monster's damage (0 = a pure output measurement, >0 = a fair
 * fight that feeds damage-taken charge rules). `fireUlt` decides whether the hero holds
 * the meter (the meter-fill measurement) or dumps it on cooldown (so a sustained number
 * includes the ultimate's share). The hero never dies — health is floored, not pinned,
 * so it still registers hits.
 */
function run(
  classId: ClassId,
  opts: {
    level: number; keys: number; seed: number;
    dummies: number; dummyHp: number; dummyDamage: number;
    fireUlt: boolean; seconds: number;
  },
): ArenaResult {
  const state = geared(opts.level, opts.seed, opts.keys, classId);
  const d = new Dungeon(state, ARENA_DEPTH, opts.seed);
  const input = new ArenaInput();
  const hero = d.localHero;
  const cx = hero.avatar.x;
  const cy = hero.avatar.y;
  const profile = profileFor(ARENA_DEPTH);

  // Let the first wave spawn, then switch the director off for good.
  let settle = 0;
  while (settle < 4 && d.enemies.filter((e) => e.state !== "spawning").length < opts.dummies) {
    input.beginTick();
    d.update(DT, input as unknown as Input);
    d.drainEvents();
    settle += DT;
  }
  d.wave = 9999;

  const RING = 32;
  const slot = (i: number) => ({
    x: cx + Math.cos((i / opts.dummies) * Math.PI * 2) * RING,
    y: cy + Math.sin((i / opts.dummies) * Math.PI * 2) * RING,
  });
  const mine = new Set<number>();
  let nextId = 700_000;
  const template = d.enemies[0];

  const makeDummy = (i: number): Enemy | null => {
    if (!template) return null;
    const p = slot(i);
    const at = resolveCircle(d.level, p.x, p.y, template.radius);
    const id = nextId++;
    const dummy: Enemy = {
      ...template,
      id,
      x: at.x, y: at.y, px: at.x, py: at.y,
      health: profile.enemyHealth * opts.dummyHp,
      maxHealth: profile.enemyHealth * opts.dummyHp,
      damage: profile.enemyDamage * template.archetype.damage * opts.dummyDamage,
      element: "physical",
      resists: zeroResists(),
      state: "active",
      spawnTimer: 0,
      hitFlash: 0, knockX: 0, knockY: 0, windup: 0,
      attackTimer: opts.dummyDamage > 0 ? template.archetype.attackCooldown : 1e9,
      elite: null,
      boss: null,
      summoned: false,
      sc: new StatusContainer(Dungeon.ENEMY_ID_BASE + id),
    };
    mine.add(id);
    return dummy;
  };

  // Seed the ring from whatever the first wave left standing, converted in place.
  d.enemies.length = 0;
  for (let i = 0; i < opts.dummies; i++) {
    const dummy = makeDummy(i);
    if (dummy) d.enemies.push(dummy);
  }

  const primary = hero.resources.all().find((pool) => !pool.spec.isUltimateMeter);
  let total = 0;
  let burst3 = 0;
  let dmgTaken = 0;
  let meterFullAt: number | null = null;
  let primaryMin = 1;
  let ultCasts = 0;
  let t = 0;
  const LEASH = 130;

  while (t < opts.seconds) {
    input.beginTick();
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);

    // Top the ring back up; leash a dummy that has wandered or been flung too far
    // rather than hard-pinning it, so its own attack AI keeps running.
    for (let i = d.enemies.length - 1; i >= 0; i--) {
      const e = d.enemies[i]!;
      if (!mine.has(e.id) || e.health <= 0) d.enemies.splice(i, 1);
    }
    while (d.enemies.length < opts.dummies) {
      const dummy = makeDummy(d.enemies.length);
      if (!dummy) break;
      d.enemies.push(dummy);
    }
    for (let i = 0; i < d.enemies.length; i++) {
      const e = d.enemies[i]!;
      if (!mine.has(e.id)) continue;
      if (e.state === "spawning") { e.state = "active"; e.spawnTimer = 0; }
      if (Math.hypot(e.x - cx, e.y - cy) > LEASH) {
        const p = slot(i);
        const at = resolveCircle(d.level, p.x, p.y, e.radius);
        e.x = at.x; e.y = at.y; e.px = at.x; e.py = at.y;
        e.knockX = 0; e.knockY = 0;
      }
    }

    // Circle-strafe: nobody stands perfectly still, and movement-fed meters (Lancer,
    // Stormcaller's Static) would read as broken if the hero were a statue.
    const orbit = t * 1.4;
    const want = { x: cx + Math.cos(orbit) * 40, y: cy + Math.sin(orbit) * 40 };
    if (want.x > hero.avatar.x + 2) input.hold("right", true);
    else if (want.x < hero.avatar.x - 2) input.hold("left", true);
    if (want.y > hero.avatar.y + 2) input.hold("down", true);
    else if (want.y < hero.avatar.y - 2) input.hold("up", true);

    // Aim at the nearest dummy, hold the trigger, dump every skill the moment it is up.
    let near = d.enemies[0]!;
    for (const e of d.enemies) {
      if (Math.hypot(e.x - hero.avatar.x, e.y - hero.avatar.y) <
          Math.hypot(near.x - hero.avatar.x, near.y - hero.avatar.y)) near = e;
    }
    input.aim = { x: near.x, y: near.y };
    input.press("attack");
    input.hold("attack", true);
    const keys = ["skill1", "skill2", "skill3", "skill4"] as const;
    for (let s = 0; s < 4; s++) if (d.canCast(s)) input.press(keys[s]!);
    if (opts.fireUlt && hero.specialCharge >= 1) {
      input.press("special");
      ultCasts++;
    }

    // Floor the health so the hero never dies or has to kite, but still takes and
    // registers hits — damage-taken charge rules need real incoming damage to read.
    if (hero.player.health < hero.player.maxHealth * 0.35) {
      hero.player.health = hero.player.maxHealth * 0.75;
    }

    d.update(DT, input as unknown as Input);
    for (const ev of d.drainEvents()) {
      if (ev.kind === "damage" && !ev.onPlayer) {
        total += ev.amount;
        if (t < 3) burst3 += ev.amount;
      }
      if (ev.kind === "damage" && ev.onPlayer) dmgTaken += ev.amount;
    }
    if (meterFullAt === null && hero.specialCharge >= 1) meterFullAt = t;
    if (primary) primaryMin = Math.min(primaryMin, primary.fraction);
    t += DT;
  }

  return {
    dps: total / opts.seconds,
    burst3,
    meterFullAt,
    meterEnd: hero.specialCharge,
    primaryMin,
    primaryName: primary?.spec.label ?? "—",
    ultCasts,
    dmgTaken,
  };
}

// --- static kit census: the axes an arena of stationary dummies can't measure ----------

interface KitCensus {
  heal: number;
  shield: number;
  mitigation: number;
  mobility: number;
  control: number;
  support: number;
  summon: number;
  execution: number;
}

const CONTROL_STATUSES = new Set([
  "stun", "freeze", "root", "pinned", "chill", "slow", "silence", "fear", "knockdown", "web", "entangle",
]);

function censusSteps(steps: readonly EffectStep[], into: KitCensus, seenSelfBuff: boolean): void {
  for (const step of steps) {
    switch (step.kind) {
      case "heal": into.heal++; break;
      case "shield": into.shield++; break;
      case "redirect": into.mitigation++; break;
      case "move": into.mobility++; break;
      case "knockback": case "pull": into.control++; break;
      case "threat": into.mitigation++; break;
      case "cleanse": into.support++; break;
      case "summon": into.summon++; break;
      case "status": {
        const id = (step as Extract<EffectStep, { kind: "status" }>).status;
        if (CONTROL_STATUSES.has(id)) into.control++;
        else if ((step.to ?? "allTargets") === "self" || (step.to ?? "").toString().startsWith("all")) into.support++;
        break;
      }
      case "spreadStatus": into.control++; break;
      case "interrupt": into.control++; break;
      case "resource":
        if ((step as Extract<EffectStep, { kind: "resource" }>).to && (step as Extract<EffectStep, { kind: "resource" }>).to !== "self") into.support++;
        break;
      case "damage": {
        const dmg = (step as Extract<EffectStep, { kind: "damage" }>).damage;
        if (dmg.executeMissingHealth || dmg.casterMissingHealth) into.execution++;
        if (dmg.inflict && CONTROL_STATUSES.has(dmg.inflict.status)) into.control++;
        break;
      }
      case "projectile": {
        const dmg = (step as Extract<EffectStep, { kind: "projectile" }>).projectile.damage;
        if (dmg.executeMissingHealth || dmg.casterMissingHealth) into.execution++;
        if (dmg.inflict && CONTROL_STATUSES.has(dmg.inflict.status)) into.control++;
        break;
      }
      case "delay": censusSteps((step as Extract<EffectStep, { kind: "delay" }>).effects, into, seenSelfBuff); break;
      case "followUp": censusSteps((step as Extract<EffectStep, { kind: "followUp" }>).effects, into, seenSelfBuff); break;
      case "reactive": censusSteps((step as Extract<EffectStep, { kind: "reactive" }>).effects, into, seenSelfBuff); break;
      case "consumeStatus":
      case "consumeSummons": {
        const then = (step as { then?: EffectStep[] }).then;
        if (then) censusSteps(then, into, seenSelfBuff);
        break;
      }
      case "random":
        for (const c of (step as Extract<EffectStep, { kind: "random" }>).choices) censusSteps(c.effects, into, seenSelfBuff);
        break;
    }
  }
}

function kitCensus(classId: ClassId): KitCensus {
  const def = CLASS_BY_ID[classId]!;
  const into: KitCensus = { heal: 0, shield: 0, mitigation: 0, mobility: 0, control: 0, support: 0, summon: 0, execution: 0 };
  const abilities: Ability[] = [...def.abilities];
  if (def.ultimate) abilities.push(def.ultimate);
  for (const ab of abilities) {
    censusSteps(ab.effects ?? [], into, false);
    if (ab.followUp) censusSteps(ab.followUp.effects, into, false);
  }
  return into;
}

// --- driver ---------------------------------------------------------------------------

const SEED = 0xa5e4;
console.log("\n=== arena: sustained single-target / burst / AoE / meter-fill ===");
console.log(
  "class".padEnd(12) +
  "ST dps".padStart(9) + "burst3".padStart(9) + "AoE dps".padStart(9) + "per-tgt".padStart(9) +
  "meter s".padStart(9) + "end%".padStart(6) + "res.min".padStart(9) + "dmg.in".padStart(9) + "  resource",
);

const rows: Record<string, ArenaResult & { aoe: number; aoePerTarget: number; census: KitCensus }> = {};

for (const classId of CLASS_IDS) {
  // Fair fight for the meter + resource read: geared kit online, dummies hitting back,
  // ultimate held so we can time it filling.
  const fair = run(classId, { level: 18, keys: 14, seed: SEED, dummies: 4, dummyHp: 4, dummyDamage: 1, fireUlt: false, seconds: 120 });
  // Geared single-target and AoE for the output read: ultimate dumped on cooldown, dummies inert.
  const st = run(classId, { level: 18, keys: 18, seed: SEED, dummies: 1, dummyHp: 120, dummyDamage: 0, fireUlt: true, seconds: 30 });
  const aoe = run(classId, { level: 18, keys: 18, seed: SEED, dummies: 6, dummyHp: 120, dummyDamage: 0, fireUlt: true, seconds: 30 });
  const census = kitCensus(classId);
  rows[classId] = {
    ...st,
    meterFullAt: fair.meterFullAt,
    meterEnd: fair.meterEnd,
    primaryMin: fair.primaryMin,
    primaryName: fair.primaryName,
    aoe: aoe.dps,
    aoePerTarget: aoe.dps / 6,
    census,
  };
  const r = rows[classId]!;
  console.log(
    classId.padEnd(12) +
    r.dps.toFixed(0).padStart(9) +
    r.burst3.toFixed(0).padStart(9) +
    r.aoe.toFixed(0).padStart(9) +
    r.aoePerTarget.toFixed(0).padStart(9) +
    (r.meterFullAt === null ? "none" : r.meterFullAt.toFixed(1)).padStart(9) +
    (r.meterEnd * 100).toFixed(0).padStart(6) +
    (r.primaryMin * 100).toFixed(0).padStart(8) + "%" +
    r.dmgTaken.toFixed(0).padStart(9) +
    "  " + r.primaryName,
  );
}

console.log("\n=== kit census: heal / shield / mitigation / mobility / control / support / summon / execution ===");
console.log("class".padEnd(12) + "heal".padStart(6) + "shld".padStart(6) + "mit".padStart(6) +
  "mob".padStart(6) + "ctrl".padStart(6) + "sup".padStart(6) + "sum".padStart(6) + "exec".padStart(6));
for (const classId of CLASS_IDS) {
  const c = rows[classId]!.census;
  console.log(
    classId.padEnd(12) +
    String(c.heal).padStart(6) + String(c.shield).padStart(6) + String(c.mitigation).padStart(6) +
    String(c.mobility).padStart(6) + String(c.control).padStart(6) + String(c.support).padStart(6) +
    String(c.summon).padStart(6) + String(c.execution).padStart(6),
  );
}

// --- observations -------------------------------------------------------------------
//
// This is a measurement tool, not an acceptance gate — `npm test` owns the gates. The
// only thing it hard-fails on is a class that could not deal single-target damage at
// all, which would be a genuine break. Everything else is printed for the tuning pass to
// read and is written up in docs/combat-cutover-plan.md §11.

console.log("\n=== observations ===");
let broken = 0;
for (const classId of CLASS_IDS) {
  const r = rows[classId]!;
  if (r.dps <= 0) {
    console.log(` BROKEN ${classId}: dealt no single-target damage in 30s`);
    broken++;
    continue;
  }
  const notes: string[] = [];
  if (r.meterFullAt === null) notes.push(`meter only ${(r.meterEnd * 100).toFixed(0)}% after 120s`);
  else if (r.meterFullAt < 12) notes.push(`meter full in ${r.meterFullAt.toFixed(1)}s (< 20s floor)`);
  else if (r.meterFullAt > 90) notes.push(`meter full in ${r.meterFullAt.toFixed(1)}s (> 90s ceiling)`);
  if (r.aoe < r.dps * 0.85) notes.push(`AoE (${r.aoe.toFixed(0)}) < ST (${r.dps.toFixed(0)})`);
  if (r.primaryMin > 0.85) notes.push(`primary never dipped below ${(r.primaryMin * 100).toFixed(0)}% — not a real loop`);
  if (notes.length) console.log(` note   ${classId}: ${notes.join("; ")}`);
}
console.log(broken === 0 ? "\narena: every class dealt damage" : `\narena: ${broken} class(es) dealt no damage`);
process.exit(broken > 0 ? 1 : 0);
