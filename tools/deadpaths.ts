/**
 * Dead-ability-path sweep — the `0a6e2d6` family of bug, across all 21 classes.
 *
 * Stage 11 (`0a6e2d6`, "fix abilities whose targeting mode never filled a target list")
 * found four abilities by hand and fixed them. Hand-finding does not scale to 231
 * abilities, and the Lancer's blocked-lane ultimate showed the family is wider than
 * targeting: an ability can resolve targets perfectly and still spend its cost for no
 * observable effect. This is the instrument for both halves.
 *
 * **Pass 1 is static** and reproduces the Stage 11 signature exactly. `selectActorIds`
 * in `combat/runtime.ts` resolves `to: "allTargets" | "target"` (and most steps'
 * *default* `to`) out of `ctx.targets.actorIds` — the list `resolveTargets` filled at
 * cast time. Five targeting modes never put an actor in that list at all (`point`,
 * `direction`, `corpse`, `zone`, `temporalAnchor`), so a step reading it under one of
 * those modes is dead on arrival, whatever the numbers on it say. Nesting is walked, so
 * a step buried in a `delay` / `reactive` / `random` branch is caught too.
 *
 * **Pass 2 is live.** Every unlocked ability of every class is cast once in a staged
 * arena built to be maximally favourable — a ring of monsters at five radii in eight
 * directions, every resource full, corpses on the floor, a real `castInputFor` aim — and
 * every observable the cast could move is diffed against a no-cast control run of the
 * same scenario on the same seed. An ability that pays a cost and moves *nothing* is
 * reported. The control run is what makes a zero trustworthy: without it, ambient
 * monster movement and hero regen read as effect.
 *
 * Reports; never fails the build. Run with `npm run deadpaths`.
 */

import type { Action, AvatarInput } from "../src/core/input";
import { Dungeon, type Hero } from "../src/game/dungeon";
import { circleHitsWall } from "../src/game/level";
import { GameState } from "../src/game/state";
import { CLASS_IDS, type ClassId } from "../src/data/classes";
import { delveConfig } from "../src/data/modes";
import { CLASS_BY_ID, installClass } from "../src/progression/index";
import type {
  Ability, CastInput, EffectStep, ResourceId, TargetingMode,
} from "../src/combat/index";

// --- pass 1: the static lint -------------------------------------------

/**
 * Targeting modes that leave `TargetResult.actorIds` empty by construction. `summon` is
 * deliberately absent — it fills from the caster's live summons, so empty is a state, not
 * a bug.
 */
const NEVER_FILLS_ACTORS: readonly TargetingMode[] = [
  "point", "direction", "corpse", "zone", "temporalAnchor",
];

/** Step kinds whose omitted `to` falls through to `"allTargets"` in `selectActorIds`. */
const DEFAULTS_TO_ALL_TARGETS = new Set([
  "damage", "status", "consumeStatus", "spreadStatus", "commandSummons",
  "threat", "knockback", "pull",
]);

/** Step kinds that read `selectActorIds` at all. */
const READS_ACTOR_LIST = new Set([
  ...DEFAULTS_TO_ALL_TARGETS,
  "cleanse", "heal", "shield", "redirect", "resource",
]);

interface Finding {
  classId: string;
  ability: string;
  where: string;
  what: string;
  /**
   * `blind` is the `0a6e2d6` signature itself — pure authoring, fixable in `progression/`
   * data alone, and so a hard failure: there is no reason for a new ability to ever ship
   * with one. `stub` findings are correctly-authored data blocked by an engine seam that
   * has not landed yet (`markOf`, `spawnTerrain`); those are reported every run and must
   * not fail the build, or the guard would be useless until the seams are written.
   */
  severity: "blind" | "stub";
}

const findings: Finding[] = [];

/** The `to` an effect step effectively resolves with, defaults folded in. */
function effectiveTo(step: EffectStep): string | undefined {
  const s = step as { kind: string; to?: string };
  if (!READS_ACTOR_LIST.has(s.kind)) return undefined;
  if (s.to) return s.to;
  return DEFAULTS_TO_ALL_TARGETS.has(s.kind) ? "allTargets" : undefined;
}

function walkSteps(
  steps: readonly EffectStep[],
  path: string,
  visit: (step: EffectStep, path: string) => void,
): void {
  steps.forEach((step, i) => {
    const here = `${path}[${i}]:${step.kind}`;
    visit(step, here);
    switch (step.kind) {
      case "delay":
      case "reactive":
      case "followUp":
        walkSteps(step.effects, here, visit);
        break;
      case "consumeStatus":
        if (step.then) walkSteps(step.then, here, visit);
        break;
      case "consumeSummons":
        if (step.then) walkSteps(step.then, here, visit);
        break;
      case "random":
        step.choices.forEach((c, j) => walkSteps(c.effects, `${here}/choice${j}`, visit));
        break;
      case "projectile":
        if (step.projectile.onExpire) walkSteps(step.projectile.onExpire, `${here}/onExpire`, visit);
        break;
      default:
        break;
    }
  });
}

function lintAbility(classId: string, ability: Ability): void {
  const mode = ability.targeting;
  const blind = NEVER_FILLS_ACTORS.includes(mode);
  const all: { steps: readonly EffectStep[]; root: string }[] = [
    { steps: ability.effects, root: "effects" },
  ];
  if (ability.followUp) all.push({ steps: ability.followUp.effects, root: "followUp" });

  for (const { steps, root } of all) {
    walkSteps(steps, root, (step, where) => {
      const to = effectiveTo(step);
      if (!to) return;
      const fromList = to === "allTargets" || to === "target";
      if (blind && fromList) {
        findings.push({
          classId, ability: `${ability.name} (${ability.id})`, where,
          what: `to: "${to}" reads actorIds, but targeting: "${mode}" never fills it`,
          severity: "blind",
        });
      }
      // `markOf` is a stub: `Dungeon.markTargets` is read and never written, so every
      // mark-addressed selector resolves empty in the live game regardless of data.
      if (to === "marked") {
        findings.push({
          classId, ability: `${ability.name} (${ability.id})`, where,
          what: `to: "marked" — Dungeon.markOf() is a stub that always returns undefined`,
          severity: "stub",
        });
      }
      // targeting: "self" fills actorIds with the *caster*, so a damage step reading that
      // list points the ability at its own owner.
      if (mode === "self" && fromList && step.kind === "damage") {
        findings.push({
          classId, ability: `${ability.name} (${ability.id})`, where,
          what: `damage to: "${to}" under targeting: "self" — resolves to the caster`,
          severity: "blind",
        });
      }
    });
  }

  if (mode === "markedTarget") {
    findings.push({
      classId, ability: `${ability.name} (${ability.id})`, where: "targeting",
      what: `targeting: "markedTarget" — Dungeon.markOf() is a stub, so this always resolves empty`,
      severity: "stub",
    });
  }
}

// --- pass 2: the live cast probe ---------------------------------------

const DT = 1 / 60;
/** Long enough for a projectile to fly its life out and a zone to tick twice. */
const SETTLE_TICKS = 150;

class IdleInput implements AvatarInput {
  moveVector() { return { x: 0, y: 0 }; }
  wasPressed(_a: Action) { return false; }
  aimAngle() { return null; }
}
const IDLE = new IdleInput();

/** `castInputFor` is private; a probe reaches it so a staged cast is aimed exactly the
 *  way a real keypress aims one. */
function castInput(d: Dungeon, hero: Hero, ability: Ability): CastInput {
  const fn = (d as unknown as { castInputFor(h: Hero, a?: Ability): CastInput }).castInputFor;
  return fn.call(d, hero, ability);
}

/** A level-60 hero of `classId` with no tree allocated — the ability as authored. */
function freshDungeon(classId: ClassId): Dungeon {
  const def = CLASS_BY_ID[classId]!;
  installClass(def);
  const state = new GameState(0x5eed);
  state.chooseClass(classId);
  state.player.level = 60;
  state.player.refresh();
  state.player.fullHeal();
  return new Dungeon(state, delveConfig(8), 999);
}

/**
 * Ring the hero with monsters at five radii in eight directions, skipping any spot inside
 * a wall, and put two corpses underfoot. Returns how many monsters actually landed — a
 * probe on a cramped room is not evidence of anything and is skipped.
 */
function stage(d: Dungeon): number {
  d.sealWaves();
  d.enemies.length = 0;
  d.projectiles.length = 0;
  d.ground.length = 0;
  d.minions.length = 0;
  d.corpsePile.length = 0;
  const a = d.localHero.avatar;
  let placed = 0;
  for (const r of [45, 100, 165, 240, 320]) {
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const x = a.x + Math.cos(ang) * r;
      const y = a.y + Math.sin(ang) * r;
      if (x < 40 || y < 40 || x > d.width - 40 || y > d.height - 40) continue;
      if (circleHitsWall(d.level, x, y, 18)) continue;
      d.spawnArchetypeAt("brute", x, y);
      placed++;
    }
  }
  for (let i = 0; i < 2; i++) {
    d.corpsePile.push({ id: 9000 + i, x: a.x + 20 + i * 15, y: a.y + 10, remaining: 60 });
  }
  return placed;
}

/**
 * Point the hero at the nearest staged monster and set up the state the ability needs to
 * be *observable*, which is not the same as the state that makes it strongest:
 *
 * - Pools sit at half, not full, so a `resource` step that grants into them can be seen.
 *   Filling every pool was the first version of this and it hid four grants behind a cap.
 * - The pools the ability actually charges are topped up, so the cast is still affordable.
 * - The hero is hurt, unshielded and chilled, because a `heal` at full health, a `shield`
 *   over an existing ward and a `cleanse` with nothing to remove are all invisible.
 */
function prime(d: Dungeon, ability: Ability): void {
  const hero = d.localHero;
  const a = hero.avatar;
  let best: { x: number; y: number; d: number } | undefined;
  for (const e of d.enemies) {
    const dd = Math.hypot(e.x - a.x, e.y - a.y);
    if (!best || dd < best.d) best = { x: e.x, y: e.y, d: dd };
  }
  if (best) {
    a.facing = Math.atan2(best.y - a.y, best.x - a.x);
    hero.aimPoint = { x: best.x, y: best.y };
  }
  for (const pool of hero.resources.all()) pool.value = pool.max * 0.5;
  for (const c of ability.costs ?? []) {
    const pool = hero.resources.get(c.resource);
    if (pool) pool.value = pool.max;
  }
  hero.player.fullHeal();
  hero.player.health = Math.floor(hero.player.maxHealth * 0.4);
  hero.ward = 0;
  // `ApplyOptions` has `durationMult`, not `duration`: the option this used to pass was
  // silently dropped and the chill ran for the spec's own default, not the sweep's length.
  hero.sc.apply("chill", { durationMult: 30, potency: 1, sourceActorId: hero.index });
  hero.posHistory.length = 0;
  for (let i = 0; i < 30; i++) hero.posHistory.push({ x: a.x - i * 2, y: a.y });
}

/** The caster pools an ability's own data says it moves, net of what it charges. */
function movesPools(ability: Ability): Set<string> {
  const charged = new Set((ability.costs ?? []).map((c) => c.resource as string));
  const out = new Set<string>();
  for (const g of ability.generates ?? []) out.add(g.resource as string);
  walkSteps(ability.effects, "", (st) => {
    if (st.kind !== "resource") return;
    const to = st.to ?? "self";
    if (to === "self" || to === "caster") out.add(st.resource as string);
  });
  for (const c of charged) out.delete(c);
  return out;
}

/**
 * Every observable, sampled *continuously* rather than at the end. A 1.6-second ward and
 * a one-second self-buff are both long gone 150 ticks later, so an end-state-only diff
 * called Crossguard dead when it was working — peaks are what a player would actually
 * have seen.
 */
interface Acc {
  damage: number;
  enemyStatuses: number;
  heroStatuses: number;
  minions: number;
  totems: number;
  ground: number;
  projectiles: number;
  moved: number;
  healed: number;
  ward: number;
  corpsesUsed: number;
  resourceMoved: number;
  stanceChanged: boolean;
  taunts: number;
  targets: number;
  ok: boolean;
  failure?: string;
}

function zeroAcc(): Acc {
  return {
    damage: 0, enemyStatuses: 0, heroStatuses: 0, minions: 0, totems: 0, ground: 0,
    projectiles: 0, moved: 0, healed: 0, ward: 0, corpsesUsed: 0, resourceMoved: 0,
    stanceChanged: false, taunts: 0, targets: 0, ok: true,
  };
}

function taunts(d: Dungeon): number {
  return (d as unknown as { taunts: Map<number, number> }).taunts.size;
}

/**
 * One scenario, run twice: once with the cast and once without. Everything reported is
 * the difference, so nothing ambient — a monster walking into a hazard, health regen —
 * can be mistaken for the ability doing something.
 */
function run(classId: ClassId, ability: Ability, doCast: boolean): Acc | null {
  const d = freshDungeon(classId);
  if (stage(d) < 8) return null;
  prime(d, ability);
  const hero = d.localHero;

  const hp0 = new Map<number, number>();
  for (const e of d.enemies) hp0.set(e.id, e.health);
  // Resource drift is measured over exactly the pools this ability *claims* to move —
  // a `resource` step or a `generates` entry — minus the ones it merely charges. Two
  // earlier versions of this metric were wrong in opposite directions: counting every
  // pool made a terrain-only ability look alive off five units of ambient regen, and
  // counting the cost pool made paying the bill look like an effect.
  const res0 = new Map<string, number>();
  for (const id of movesPools(ability)) {
    const pool = hero.resources.get(id as ResourceId);
    if (pool) res0.set(pool.spec.id, pool.value);
  }
  const stance0 = hero.resources.allStances().map((st) => `${st.spec.id}=${st.state}`).join(",");
  const x0 = hero.avatar.x;
  const y0 = hero.avatar.y;
  const health0 = hero.player.health;
  const corpses0 = d.corpsePile.length;
  const enemyStatus0 = d.enemies.reduce((n, e) => n + e.sc.list.length, 0);
  const heroStatus0 = hero.sc.list.length;
  const taunts0 = taunts(d);

  const acc = zeroAcc();
  if (doCast) {
    const res = hero.rt.castAbility(d, hero.index, ability, castInput(d, hero, ability));
    acc.ok = res.ok;
    if (!res.ok) acc.failure = res.failure;
    // `CastResult.targets` is optional on the type even when `ok` is true (it wants to
    // be a discriminated union and isn't). Recording a silent 0 here would read as "this
    // ability reaches nothing" — a dead path that isn't one — so say so loudly instead.
    const hit = res.ok ? res.targets : undefined;
    if (res.ok && !hit) throw new Error(`${ability.id}: a successful cast returned no target list`);
    acc.targets = hit ? hit.actorIds.length : 0;
  }

  const sample = (): void => {
    let dealt = 0;
    let eStatus = 0;
    const live = new Set<number>();
    for (const e of d.enemies) {
      live.add(e.id);
      eStatus += e.sc.list.length;
      const was = hp0.get(e.id);
      if (was !== undefined) dealt += Math.max(0, was - e.health);
    }
    for (const [id, was] of hp0) if (!live.has(id)) dealt += was;
    acc.damage = Math.max(acc.damage, dealt);
    acc.enemyStatuses = Math.max(acc.enemyStatuses, eStatus - enemyStatus0);
    acc.heroStatuses = Math.max(acc.heroStatuses, hero.sc.list.length - heroStatus0);
    acc.minions = Math.max(acc.minions, d.minions.length);
    acc.totems = Math.max(acc.totems, d.totems.length);
    acc.ground = Math.max(acc.ground, d.ground.length);
    acc.projectiles = Math.max(acc.projectiles, d.projectiles.length);
    acc.moved = Math.max(acc.moved, Math.hypot(hero.avatar.x - x0, hero.avatar.y - y0));
    acc.healed = Math.max(acc.healed, hero.player.health - health0);
    acc.ward = Math.max(acc.ward, hero.ward);
    acc.corpsesUsed = Math.max(acc.corpsesUsed, corpses0 - d.corpsePile.length);
    let drift = 0;
    for (const pool of hero.resources.all()) {
      const was = res0.get(pool.spec.id);
      if (was !== undefined) drift += Math.abs(pool.value - was);
    }
    acc.resourceMoved = Math.max(acc.resourceMoved, drift);
    const stance = hero.resources.allStances().map((st) => `${st.spec.id}=${st.state}`).join(",");
    if (stance !== stance0) acc.stanceChanged = true;
    acc.taunts = Math.max(acc.taunts, taunts(d) - taunts0);
  };

  sample();
  for (let i = 0; i < SETTLE_TICKS; i++) {
    d.update(DT, IDLE);
    sample();
    if (d.phase !== "fighting") break;
  }
  return acc;
}

function probe(classId: ClassId, ability: Ability): Acc | null {
  const cast = run(classId, ability, true);
  const control = run(classId, ability, false);
  if (!cast || !control) return null;
  return {
    damage: Math.max(0, cast.damage - control.damage),
    enemyStatuses: Math.max(0, cast.enemyStatuses - control.enemyStatuses),
    heroStatuses: Math.max(0, cast.heroStatuses - control.heroStatuses),
    minions: Math.max(0, cast.minions - control.minions),
    totems: Math.max(0, cast.totems - control.totems),
    ground: Math.max(0, cast.ground - control.ground),
    projectiles: Math.max(0, cast.projectiles - control.projectiles),
    moved: Math.max(0, cast.moved - control.moved),
    healed: cast.healed - control.healed,
    ward: cast.ward - control.ward,
    corpsesUsed: Math.max(0, cast.corpsesUsed - control.corpsesUsed),
    resourceMoved: Math.max(0, cast.resourceMoved - control.resourceMoved),
    stanceChanged: cast.stanceChanged && !control.stanceChanged,
    taunts: Math.max(0, cast.taunts - control.taunts),
    targets: cast.targets,
    ok: cast.ok,
    ...(cast.failure ? { failure: cast.failure } : {}),
  };
}

/** True when the cast moved literally nothing a player could see. */
function inert(p: Acc): boolean {
  return p.damage < 1 && p.enemyStatuses === 0 && p.heroStatuses === 0
    && p.minions === 0 && p.totems === 0 && p.ground === 0 && p.projectiles === 0
    && p.moved < 4 && p.healed <= 0 && p.ward <= 0 && p.corpsesUsed === 0
    && p.resourceMoved < 0.5 && !p.stanceChanged && p.taunts === 0;
}

/**
 * Why an inert cast might legitimately be inert — a precondition the staged arena does
 * not supply. An ability whose every step is excusable is *unproven*, not *broken*; only
 * one with no excuse left is a finding. This is the difference between a report worth
 * reading and a list of twenty-four support skills.
 */
function excuses(ability: Ability): string[] {
  const out = new Set<string>();
  const steps: EffectStep[] = [];
  walkSteps(ability.effects, "", (st) => steps.push(st));
  if (ability.followUp) out.add("followUp needs a second press");
  for (const st of steps) {
    switch (st.kind) {
      case "reactive": out.add("reactive — needs its trigger event"); break;
      case "followUp": out.add("followUp needs a second press"); break;
      case "consumeStatus": out.add(`consumes ${st.status}, which nothing staged applied`); break;
      case "consumeSummons": out.add("consumes summons the caster does not have"); break;
      case "commandSummons": out.add("commands summons the caster does not have"); break;
      case "cleanse": out.add("cleanse — nothing to remove"); break;
      case "terrain": out.add(`terrain "${st.piece}" — Dungeon.spawnTerrain() is a documented stub`); break;
      case "threat": if (st.op !== "taunt") out.add(`threat op "${st.op}" is dropped by setThreat()`); break;
      case "spreadStatus": out.add(`spreads ${st.status}, which nothing staged applied`); break;
      default: break;
    }
    const to = (st as { to?: string }).to;
    if (to === "allies" || to === "lowestHealthAlly") out.add("targets an ally — solo, that is the caster itself");
    if (to === "marked") out.add("marked — markOf() is a stub");
    if (to === "summons") out.add("targets summons the caster does not have");
  }
  if (ability.targeting === "ally" || ability.targeting === "lowestHealthAlly") {
    out.add("targeting an ally — solo, that is the caster itself");
  }
  const charged = new Set((ability.costs ?? []).map((c) => c.resource as string));
  for (const g of ability.generates ?? []) {
    if (charged.has(g.resource as string)) {
      out.add(`generates ${g.resource}, the same pool it charges — the grant is masked here`);
    }
  }
  if (ability.targeting === "summon") out.add('targeting: "summon" — the caster has none staged');
  if (ability.targeting === "markedTarget") out.add('targeting: "markedTarget" — markOf() is a stub');
  return [...out];
}

function describe(p: Acc): string {
  const bits: string[] = [];
  if (p.damage >= 1) bits.push(`dmg ${Math.round(p.damage)}`);
  if (p.enemyStatuses) bits.push(`enemyStatus +${p.enemyStatuses}`);
  if (p.heroStatuses) bits.push(`selfStatus +${p.heroStatuses}`);
  if (p.minions) bits.push(`minions +${p.minions}`);
  if (p.totems) bits.push(`totems +${p.totems}`);
  if (p.ground) bits.push(`zones +${p.ground}`);
  if (p.projectiles) bits.push(`proj +${p.projectiles}`);
  if (p.moved >= 4) bits.push(`moved ${Math.round(p.moved)}u`);
  if (p.healed > 0) bits.push(`healed ${Math.round(p.healed)}`);
  if (p.ward > 0) bits.push(`ward +${Math.round(p.ward)}`);
  if (p.corpsesUsed) bits.push(`corpses -${p.corpsesUsed}`);
  if (p.resourceMoved >= 0.5) bits.push(`resource ${Math.round(p.resourceMoved)}`);
  if (p.stanceChanged) bits.push("stance moved");
  if (p.taunts) bits.push(`taunts +${p.taunts}`);
  return bits.length ? bits.join(", ") : "nothing";
}

// --- run ---------------------------------------------------------------

console.log("=== pass 1: static — a step reading actorIds under a mode that never fills it ===\n");
for (const classId of CLASS_IDS) {
  const def = CLASS_BY_ID[classId];
  if (!def) continue;
  for (const ability of def.abilities) lintAbility(classId, ability);
}
if (findings.length === 0) {
  console.log("  (none)");
} else {
  let last = "";
  for (const f of findings) {
    if (f.classId !== last) { console.log(`\n  ${f.classId}`); last = f.classId; }
    console.log(`    ${f.ability}`);
    console.log(`      [${f.severity}] ${f.where} — ${f.what}`);
  }
}

console.log("\n\n=== pass 2: live — cast every ability in a favourable arena ===");
const dead: string[] = [];
const unproven: string[] = [];
const refused: string[] = [];
let probed = 0;
let skipped = 0;
for (const classId of CLASS_IDS) {
  const def = CLASS_BY_ID[classId];
  if (!def) continue;
  console.log(`\n  ${classId}`);
  for (const ability of def.abilities) {
    const p = probe(classId as ClassId, ability);
    if (!p) { skipped++; console.log(`    ${ability.name.padEnd(24)} — skipped (cramped room)`); continue; }
    probed++;
    const why = inert(p) ? excuses(ability) : [];
    const tag = !p.ok
      ? `REFUSED: ${p.failure}`
      : !inert(p) ? "ok" : why.length ? "unproven" : "DEAD";
    console.log(
      `    ${ability.name.padEnd(24)} ${String(p.targets).padStart(3)} tgt  ${tag.padEnd(22)} ${describe(p)}`,
    );
    if (!p.ok) refused.push(`${classId} / ${ability.name} — ${p.failure}`);
    else if (inert(p) && why.length === 0) {
      dead.push(`${classId} / ${ability.name} (${ability.id}) — targeting: "${ability.targeting}", steps: ${ability.effects.map((st) => st.kind).join("+")}`);
    } else if (inert(p)) {
      unproven.push(`${classId} / ${ability.name} — ${why.join("; ")}`);
    }
  }
}

console.log(`\n\n=== summary ===`);
console.log(`  ${probed} abilities probed, ${skipped} skipped`);
const blind = findings.filter((f) => f.severity === "blind");
const stubbed = findings.filter((f) => f.severity === "stub");
console.log(`  static findings: ${blind.length} blind (fatal), ${stubbed.length} blocked on an engine stub (reported)`);
console.log(`  refused the cast in a fully-primed arena: ${refused.length}`);
for (const r of refused) console.log(`    ${r}`);
console.log(`\n  DEAD — cast fine, moved nothing, and no precondition excuses it: ${dead.length}`);
for (const r of dead) console.log(`    ${r}`);
console.log(`\n  unproven — inert here, but the arena cannot supply what it needs: ${unproven.length}`);
for (const r of unproven) console.log(`    ${r}`);

// A blind target list or a step that no staged precondition can excuse is an authoring
// bug in `progression/` data, so this fails the build. Everything blocked on an engine
// seam that has not landed is reported and forgiven — see `docs/class-validation.md`.
const fatal = blind.length + dead.length;
if (fatal > 0) {
  console.log(`\nFAILED — ${blind.length} blind target list(s), ${dead.length} unexplained inert ability(ies)`);
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");
