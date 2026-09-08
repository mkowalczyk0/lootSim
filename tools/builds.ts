/**
 * Build-differentiation harness — spec §35 ("three builds per class play differently")
 * and the real-play instrument `tools/arena.ts` cannot be.
 *
 * The arena measures a *class*: one loadout, stationary dummies, no tree. That is the
 * right tool for "how fast does the meter fill" and the wrong tool for everything the
 * Cluster 2 pass ran into (`docs/class-validation.md`) — it slots only a class's first
 * three abilities in unlock order, its AoE window is dominated by the ultimate, and its
 * `dmg.in` flips wholesale the moment a summon is strong enough to body-block a dummy
 * that never repositions.
 *
 * This plays **real floors**: a generated room graph, pathing monsters, telegraphs to
 * dodge, the hero's whole equipped kit, and an actual tree allocation. Per class it runs
 * three genuinely different builds plus the Mythic Archetype, and reports a *behaviour
 * fingerprint* rather than a damage number — what the build did, not just how hard.
 *
 * Two things make it honest:
 *
 * - **The builds are the class's own data.** A build is one of the class's cross-path
 *   hybrids (or its Mythic), allocated to exactly the point requirement the unlock
 *   declares. Nothing is hand-authored per class, so all 21 stay in step as the trees
 *   change, and every build provably lights up a real hybrid/archetype rule.
 * - **Skills are chosen for the build, not by unlock order.** `autoSlotNewAbilities`
 *   fills the three slots with `abilityPool[0..2]`, which for the Corsair is
 *   hookshot / boarding_cut / chain_drag — two of them deal no damage — and for the
 *   Engineer is turret / mortar / repair_drone. A player picks differently. The harness
 *   scores each unlocked ability against the build (mutation targets first, then
 *   offence) and prints what it equipped, so the gap between the two is visible instead
 *   of silently skewing the measurement.
 *
 * Run with `npm run builds`. Reports, and hard-fails only on a class whose three builds
 * are behaviourally indistinguishable — that is the §35 gate.
 */
import type { Action, Input } from "../src/core/input";
import { Dungeon, inTelegraph } from "../src/game/dungeon";
import { circleHitsWall, FlowField } from "../src/game/level";
import { itemScore, rollItem } from "../src/game/item";
import { GameState } from "../src/game/state";
import { CLASS_IDS, treePointsFor, type ClassId } from "../src/data/classes";
import { delveConfig } from "../src/data/modes";
import { CLASS_BY_ID, buildProgressionTree, installClass } from "../src/progression/index";
import type { PathUnlockDef } from "../src/progression/unlocks";
import { KEYSTONE_COST_V2 } from "../src/progression/nodes";
import type { Ability, EffectStep } from "../src/combat/ability";
import { ResourceSet, type ResourceEvent, type ResourceGenRule } from "../src/combat/resources";
import { isUltimateSourced } from "../src/combat/damage";
import { hasAnyTag, type SkillTag } from "../src/combat/tags";
import { Rng } from "../src/core/rng";

const DT = 1 / 60;
/**
 * Depth 9 at the arena's own gear level, chosen by calibration rather than taste: it is
 * the deepest floor where the *median* class still clears all three runs, so a build that
 * fails is telling you something about the build. Floors at depth 8 fall over in twenty
 * seconds (too thin to fingerprint); by depth 11 half the roster dies regardless of build
 * and every fingerprint collapses into "it died", which measures the gear, not the tree.
 * `BUILDS_DEPTH` / `BUILDS_LEVEL` / `BUILDS_KEYS` override for a probe.
 */
const DEPTH = Number(process.env.BUILDS_DEPTH) || 9;
const LEVEL = Number(process.env.BUILDS_LEVEL) || 18;
const KEYS = Number(process.env.BUILDS_KEYS) || 14;
const SEED = 0xb1d5;
const MAX_SECONDS = 240;
/**
 * Floors per build. A single floor is one room graph and one wave sequence, so it reads
 * layout luck as build identity; three averages that out without tripling the wall clock
 * (a contested floor is ~40–60 s of sim, which runs in well under a second).
 */
const FLOORS = 3;

class BotInput {
  private down = new Set<Action>();
  private pressed = new Set<Action>();
  hold(a: Action, on: boolean) { on ? this.down.add(a) : this.down.delete(a); }
  press(a: Action) { this.pressed.add(a); }
  beginTick() { this.pressed.clear(); }
  isDown(a: Action) { return this.down.has(a); }
  wasPressed(a: Action) { return this.pressed.has(a); }
  wasPressedOrRepeated(a: Action) { return this.pressed.has(a); }
  /** Keyboard scheme — the bot faces where it walks and never aims. */
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

// --- steering (the smoke bot's, kept local like arena.ts keeps its own driver) ---------

function steerAngle(d: Dungeon, base: number): { x: number; y: number } {
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

function steer(d: Dungeon, tx: number, ty: number, retreat: boolean): { x: number; y: number } {
  const a = d.avatar;
  const sign = retreat ? -1 : 1;
  return steerAngle(d, Math.atan2((ty - a.y) * sign, (tx - a.x) * sign));
}

/**
 * Where to run when something is about to go off underneath you. Unlike the smoke bot's
 * version this only flees ground that actually *hurts* the player — a build harness whose
 * whole job is to measure zone classes must not have the Engineer sprinting out of its own
 * mortar pool or the Warden out of its own healing grove.
 */
function escapeAngle(d: Dungeon): number | null {
  const a = d.avatar;
  for (const t of d.telegraphs) {
    if (!t.hitsPlayer) continue;
    if (!inTelegraph(t, a.x, a.y, a.radius + 10)) continue;
    switch (t.shape) {
      case "donut":
        return Math.atan2(t.y - a.y, t.x - a.x);
      case "line":
      case "cone": {
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
  for (const g of d.ground) {
    if (!g.hitsPlayer) continue;
    if (Math.hypot(a.x - g.x, a.y - g.y) <= g.radius + a.radius) {
      return Math.atan2(a.y - g.y, a.x - g.x);
    }
  }
  return null;
}

// --- deriving builds from the class's own unlock data ---------------------------------

interface Build {
  classId: ClassId;
  id: string;
  name: string;
  tier: "hybrid" | "mythic";
  /** "Gunner 6 + Mechanic 4" */
  requires: string;
  /** Node ids to commit. */
  allocated: string[];
  points: number;
}

/**
 * The cheapest legal allocation that satisfies one path requirement. Rows cost a point
 * each except the keystone, which costs `KEYSTONE_COST_V2` — so four rows buy four points
 * and the fifth buys two more. Anything over four points therefore means "the whole path".
 */
function rowsForPoints(want: number, rowCount: number): number[] {
  const plain = rowCount - 1;
  const rows: number[] = [];
  for (let r = 0; r < Math.min(plain, want); r++) rows.push(r);
  if (want > plain) rows.push(rowCount - 1);
  return rows;
}

function allocationFor(classId: ClassId, def: PathUnlockDef): Build | null {
  const cls = CLASS_BY_ID[classId]!;
  const paths = cls.progression.paths;
  const allocated: string[] = [];
  let points = 0;
  const parts: string[] = [];
  for (const req of def.requires) {
    const p = paths.findIndex((path) => path.name === req.path);
    if (p < 0) return null;
    const rows = rowsForPoints(req.points, paths[p]!.nodes.length);
    for (const row of rows) {
      allocated.push(`${classId}.${p}.${row}`);
      points += row === paths[p]!.nodes.length - 1 ? KEYSTONE_COST_V2 : 1;
    }
    parts.push(`${req.path} ${req.points}`);
  }
  return {
    classId,
    id: def.id,
    name: def.name,
    tier: def.tier,
    requires: parts.join(" + "),
    allocated,
    points,
  };
}

/**
 * Three hybrids per class, chosen greedily for the widest spread of paths — two hybrids
 * that share a path are two flavours of one build, which is exactly what §35 is asking us
 * to rule out. The Mythic Archetype is added as a fourth row because "does the archetype
 * change how the class plays" is its own question.
 */
function buildsFor(classId: ClassId): Build[] {
  const cls = CLASS_BY_ID[classId]!;
  const unlocks = cls.unlocks ?? [];
  const hybrids = unlocks.filter((u) => u.tier === "hybrid");
  const mythics = unlocks.filter((u) => u.tier === "mythic");

  const picked: PathUnlockDef[] = [];
  const covered = new Set<string>();
  // Greedy: repeatedly take the hybrid adding the most paths we have not touched yet,
  // breaking ties by declaration order so the run stays deterministic.
  while (picked.length < 3 && picked.length < hybrids.length) {
    let best: PathUnlockDef | null = null;
    let bestNew = -1;
    for (const h of hybrids) {
      if (picked.includes(h)) continue;
      const fresh = h.requires.filter((r) => !covered.has(r.path)).length;
      if (fresh > bestNew) { bestNew = fresh; best = h; }
    }
    if (!best) break;
    picked.push(best);
    for (const r of best.requires) covered.add(r.path);
  }

  const out: Build[] = [];
  for (const def of [...picked, ...mythics.slice(0, 1)]) {
    const b = allocationFor(classId, def);
    if (b) out.push(b);
  }
  return out;
}

// --- picking the three skills a build would actually equip -----------------------------

/** Does this effect tree contain a step of any of `kinds`, at any depth? */
function hasStep(steps: readonly EffectStep[], kinds: ReadonlySet<string>): boolean {
  for (const step of steps) {
    if (kinds.has(step.kind)) return true;
    const nested =
      (step as { effects?: EffectStep[] }).effects ??
      (step as { then?: EffectStep[] }).then ??
      null;
    if (nested && hasStep(nested, kinds)) return true;
    if (step.kind === "random") {
      for (const c of (step as Extract<EffectStep, { kind: "random" }>).choices) {
        if (hasStep(c.effects, kinds)) return true;
      }
    }
  }
  return false;
}

const DIRECT_DAMAGE = new Set(["damage", "projectile"]);
const ANY_OFFENCE = new Set(["damage", "projectile", "zone", "summon", "terrain", "spreadStatus"]);

/**
 * Score an unlocked ability for this build. A build's own mutations name the abilities it
 * is *about*, so those come first; after that, something that actually removes health.
 */
function skillScore(ab: Ability, mutated: ReadonlySet<string>): number {
  let s = 0;
  if (mutated.has(ab.id)) s += 6;
  if (hasStep(ab.effects ?? [], DIRECT_DAMAGE)) s += 3;
  if (hasStep(ab.effects ?? [], ANY_OFFENCE)) s += 2;
  if (ab.category === "attack") s += 1;
  if (ab.category === "summon" || ab.category === "terrain") s += 1;
  return s;
}

/**
 * Equip three skills for the build. Guarantees at least one direct-damage ability, so a
 * utility-heavy kit can never be measured swinging nothing but hooks and debuffs.
 */
function equipForBuild(state: GameState, build: Build): string[] {
  const cls = CLASS_BY_ID[build.classId]!;
  const mutated = new Set<string>();
  for (const u of cls.unlocks ?? []) {
    if (u.id !== build.id) continue;
    for (const m of u.mutations ?? []) {
      const id = (m.target as { abilityId?: string }).abilityId;
      if (id) mutated.add(id);
    }
  }

  const pool = state.player.unlockedAbilities.filter((a) => !a.isUltimate);
  const ranked = [...pool].sort((a, b) => {
    const d = skillScore(b, mutated) - skillScore(a, mutated);
    return d !== 0 ? d : pool.indexOf(a) - pool.indexOf(b);
  });

  const chosen: Ability[] = ranked.slice(0, 3);
  if (!chosen.some((a) => hasStep(a.effects ?? [], DIRECT_DAMAGE))) {
    const hitter = ranked.find((a) => hasStep(a.effects ?? [], DIRECT_DAMAGE));
    if (hitter) chosen[chosen.length - 1] = hitter;
  }

  for (let i = 0; i < 3; i++) state.player.setSkill(i, chosen[i]?.id ?? null);
  return chosen.map((a) => a.id.split(".").pop() ?? a.id);
}

/** Levels and dresses a character the way smoke/arena do, then commits the build. */
function geared(build: Build): GameState {
  const cls = CLASS_BY_ID[build.classId]!;
  installClass(cls);
  const state = new GameState(SEED);
  state.chooseClass(build.classId);
  state.player.level = LEVEL;
  state.player.allocated.length = 0;
  state.player.allocated.push(...build.allocated);
  state.player.refresh();
  state.keys.Advanced = KEYS;
  state.openChests("Advanced", KEYS);
  const hc = state.heroClass;
  for (const item of [...state.inventory].sort((a, b) => itemScore(b, hc) - itemScore(a, hc))) {
    const worn = state.player.equipment[item.slot];
    if (!worn || itemScore(item, hc) > itemScore(worn, hc)) state.equipFromInventory(item.id);
  }
  if (!state.player.hasAffinity) {
    const family = hc.affinity[0]!;
    state.player.equip(rollItem({ rarity: "rare", type: family, ilvl: LEVEL, rng: new Rng(SEED ^ 0x51ed) }));
  }
  state.player.fullHeal();
  state.potions = 5;
  return state;
}

// --- the fingerprint -------------------------------------------------------------------

interface Fingerprint {
  /** Floors cleared out of `FLOORS` — a build that cannot survive the depth is signal. */
  cleared: number;
  seconds: number;
  /** Damage dealt per second — the axis the arena already covers, kept for reference. */
  dps: number;
  takenPerSec: number;
  /** Mean distance to the nearest monster while the attack button was held. */
  engage: number;
  /** World units travelled per second. */
  move: number;
  ultsPerMin: number;
  /** Seconds to the first full ultimate meter **in real play** — the honest cadence. */
  meterFirst: number | null;
  /** Mean summons owned, and mean ground zones owned. */
  minions: number;
  zones: number;
  /** Mean hostile statuses riding a living monster — the elemental/affliction axis. */
  ailments: number;
  /** Casts per equipped skill, slot order. */
  casts: [number, number, number];
  skills: string[];
}

/** One floor's raw tallies. `playBuild` averages `FLOORS` of these. */
interface Sample {
  cleared: boolean;
  seconds: number;
  dealt: number;
  taken: number;
  engageSum: number;
  engageTicks: number;
  moved: number;
  ults: number;
  meterFirst: number | null;
  minionSum: number;
  zoneSum: number;
  ailSum: number;
  samples: number;
  casts: [number, number, number];
}

// --- generation-event instrumentation -------------------------------------------------
//
// Eight classes never fill their ultimate meter on a real floor. "Add points to the rule"
// is the wrong first move, because a rule can read as inert for three unrelated reasons
// and only one of them is a numbers problem:
//
//   1. the rule's `on:` event is one the simulation never broadcasts at all,
//   2. it is broadcast, but the rule's `requireTags` never match what arrives,
//   3. it fires exactly as designed and the amount is simply too small.
//
// So measure first. This wraps `ResourceSet.broadcast` for the watched hero and re-walks
// the meter's own generation rules against every event, using the same three primitives
// the pool itself uses (`isUltimateSourced`, `hasAnyTag`, and a copy of `ruleAmount`) so
// the verdict can't drift from the real gate. Nothing in `src/` is touched — the harness
// is an observer, and a measurement tool that needs a debug hook in the simulation to
// work would be a change to the thing being measured.
//
// Points are reported as **offered**, i.e. before the pool clips at max: a rule offering
// zero is the finding, and a rule offering plenty into a full bar is not a bug.

interface MeterTrace {
  /** Every `ResourceEvent` the simulation broadcast at this hero, by type. */
  events: Map<string, number>;
  /** Meter points each generation rule offered, keyed by rule label. */
  offered: Map<string, number>;
  /** How many matching events each rule refused, keyed by `label ← reason`. */
  refused: Map<string, number>;
  /** Tag sets actually seen on events a `requireTags` rule turned down. */
  seenTags: Map<string, Set<string>>;
  seconds: number;
  /**
   * Floors pooled into this trace. The meter starts empty on every floor, so a rule's
   * offer has to be read **per floor** — pooling four builds × three floors and printing
   * "5.3 bars offered" next to "never fills" is a contradiction, not a diagnosis.
   */
  floors: number;
}

function newTrace(): MeterTrace {
  return {
    events: new Map(), offered: new Map(), refused: new Map(), seenTags: new Map(),
    seconds: 0, floors: 0,
  };
}

function bump(m: Map<string, number>, key: string, by = 1): void {
  m.set(key, (m.get(key) ?? 0) + by);
}

/** A rule's identity in the report — its `on`, its amount, its scaling and its tag gate. */
function ruleLabel(rule: ResourceGenRule): string {
  const per = rule.perUnit ? ` ×${rule.perUnit}` : "";
  const tags = rule.requireTags ? ` [${rule.requireTags.join("/")}]` : "";
  const ult = rule.allowFromUltimate ? " +ult" : "";
  return `on ${rule.on} ${rule.amount}${per}${tags}${ult}`;
}

/** A copy of `ResourcePool.ruleAmount`, which is private. Keep the two in step. */
function offeredBy(rule: ResourceGenRule, evt: ResourceEvent): number {
  switch (rule.perUnit) {
    case "damage":
      return rule.amount * (evt.damage ?? evt.packet?.amount ?? 0);
    case "maxHealthFraction":
      return rule.amount * ((evt.damage ?? 0) / Math.max(1, evt.maxHealth ?? 1));
    case "manaFraction":
      return rule.amount * ((evt.manaSpent ?? 0) / Math.max(1, evt.maxMana ?? 1));
    case "distance":
      return rule.amount * (evt.distance ?? 0);
    default:
      return rule.amount;
  }
}

let watched: ResourceSet | null = null;
let trace: MeterTrace | null = null;

const rawBroadcast = ResourceSet.prototype.broadcast;
ResourceSet.prototype.broadcast = function (this: ResourceSet, evt, ctx) {
  if (trace !== null && this === watched) observe(trace, this, evt);
  return rawBroadcast.call(this, evt, ctx);
};

function observe(tr: MeterTrace, set: ResourceSet, evt: ResourceEvent): void {
  bump(tr.events, evt.type);
  const rules = set.ultimateMeter()?.spec.generation;
  if (!rules) return;
  const ult = evt.packet ? isUltimateSourced(evt.packet) : evt.fromUltimate === true;
  for (const rule of rules) {
    if (rule.on !== evt.type) continue;
    const label = ruleLabel(rule);
    if (ult && !rule.allowFromUltimate) {
      bump(tr.refused, `${label} ← ultimate-sourced`);
      continue;
    }
    if (rule.requireTags) {
      const tags: readonly SkillTag[] | undefined = evt.packet?.source.tags ?? evt.tags;
      if (!hasAnyTag(tags, rule.requireTags)) {
        bump(tr.refused, `${label} ← tags`);
        let seen = tr.seenTags.get(label);
        if (!seen) tr.seenTags.set(label, (seen = new Set()));
        if (seen.size < 8) seen.add(tags && tags.length > 0 ? tags.join("/") : "(untagged)");
        continue;
      }
    }
    bump(tr.offered, label, offeredBy(rule, evt));
  }
}

/** Rules whose `on:` event never reached the hero at all — case 1 above. */
function silentRules(classId: ClassId, tr: MeterTrace): string[] {
  const rules = CLASS_BY_ID[classId]?.resources.find((r) => r.isUltimateMeter)?.generation ?? [];
  const out: string[] = [];
  for (const rule of rules) {
    if ((tr.events.get(rule.on) ?? 0) === 0) out.push(ruleLabel(rule));
  }
  return out;
}

/**
 * Why a `requireTags` rule matched nothing — and the distinction matters enormously,
 * because the two readings want opposite responses.
 *
 * A rule can go unmatched because **no ability in the class carries the tag at all** (a
 * data bug: the rule is dead and the class runs on its backup rule alone), or because
 * **the abilities that carry it are not the three this build equipped** (an artifact of
 * `equipForBuild`, which ranks on damage output and so never picks up a pure-utility
 * barrier or terrain skill).
 *
 * The first draft of this report could not tell those apart and printed "tags never
 * matched" for both, which is how four classes were written up as dead data when only
 * two of them were. It also names the ultimate specifically: a rule whose only tagged
 * ability is the class ultimate can never be fed, because THE ULTIMATE RULE refuses the
 * one thing that would feed it.
 */
function tagVerdict(classId: ClassId, rule: ResourceGenRule): string {
  const want = rule.requireTags;
  if (!want) return "tags never matched";
  const carriers = (CLASS_BY_ID[classId]?.abilities ?? []).filter((a) => hasAnyTag(a.tags, want));
  if (carriers.length === 0) return `NO ABILITY CARRIES [${want.join("/")}] — dead rule`;
  const usable = carriers.filter((a) => !a.isUltimate);
  if (usable.length === 0) {
    return `only the ultimate carries [${want.join("/")}] — unfeedable under THE ULTIMATE RULE`;
  }
  return `not in this loadout — [${want.join("/")}] is on ${usable.map((a) => a.id.split(".")[1]).join(", ")}`;
}

function playFloor(build: Build, floorSeed: number, tr: MeterTrace | null = null): Sample {
  const state = geared(build);
  equipForBuild(state, build);
  const d = new Dungeon(state, delveConfig(DEPTH), floorSeed);
  const input = new BotInput();
  const hero = d.localHero;
  watched = hero.resources;
  trace = tr;
  const flow = new FlowField(d.level);
  let flowTimer = 0;
  let flowGoalX = d.avatar.x;
  let flowGoalY = d.avatar.y;

  let t = 0;
  let dealt = 0;
  let taken = 0;
  let engageSum = 0;
  let engageTicks = 0;
  let moved = 0;
  let ults = 0;
  let meterFirst: number | null = null;
  let minionSum = 0;
  let zoneSum = 0;
  let ailSum = 0;
  let samples = 0;
  const casts: [number, number, number] = [0, 0, 0];
  let potionCooldown = 0;
  const reflexes = new Rng((SEED ^ 0x5f3759df) >>> 0);
  let threatSeen = false;
  let willDodge = false;

  while (t < MAX_SECONDS && d.phase === "fighting") {
    input.beginTick();
    for (const a of ["up", "down", "left", "right"] as Action[]) input.hold(a, false);
    const px = d.avatar.x;
    const py = d.avatar.y;

    let target = null as (typeof d.enemies)[number] | null;
    let gap = Infinity;
    for (const e of d.enemies) {
      if (e.state === "spawning") continue;
      const dd = Math.hypot(e.x - px, e.y - py);
      if (dd < gap) { gap = dd; target = e; }
    }

    const goalX = target ? target.x : d.portal.x;
    const goalY = target ? target.y : d.portal.y;
    flowTimer -= DT;
    if (flowTimer <= 0 || Math.hypot(goalX - flowGoalX, goalY - flowGoalY) > 50) {
      flow.update(d.level, goalX, goalY);
      flowGoalX = goalX;
      flowGoalY = goalY;
      flowTimer = 0.2;
    }

    const hurt = state.player.health < state.player.maxHealth * 0.4 && state.potions > 0 && gap < 70;
    const incoming = d.enemies.some(
      (e) => e.windup > 0 && Math.hypot(e.x - px, e.y - py) < e.archetype.attackRange + 24,
    );
    if (incoming && !threatSeen) willDodge = reflexes.chance(0.55);
    threatSeen = incoming;
    const threat = incoming && willDodge;

    const escape = escapeAngle(d);
    if (escape !== null) {
      const dir = steerAngle(d, escape);
      if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
      if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
      input.press("dash");
      if (target && gap < 40) input.press("attack");
    } else if (target) {
      if (hurt || gap > MELEE_STAND) {
        const dir = hurt ? steer(d, target.x, target.y, true) : flow.direction(d.level, px, py) ?? steer(d, target.x, target.y, false);
        if (Math.abs(dir.x) > 0.25) input.hold(dir.x > 0 ? "right" : "left", true);
        if (Math.abs(dir.y) > 0.25) input.hold(dir.y > 0 ? "down" : "up", true);
      } else if (threat) {
        const away = steer(d, target.x, target.y, true);
        if (Math.abs(away.x) > 0.25) input.hold(away.x > 0 ? "right" : "left", true);
        if (Math.abs(away.y) > 0.25) input.hold(away.y > 0 ? "down" : "up", true);
      }
      input.press("attack");
      engageSum += gap;
      engageTicks++;
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
        casts[slot]++;
        break;
      }
    }

    // Press when the meter is full, but only *count* a cast when the meter actually
    // drains. An earlier version counted the press, which meant a full meter the sim had
    // not yet spent was tallied once per tick — the Lancer read 49 ultimates a minute.
    const chargeBefore = hero.specialCharge;
    if (chargeBefore >= 1) input.press("special");
    potionCooldown -= DT;
    if (state.player.health < state.player.maxHealth * 0.5 && potionCooldown <= 0) {
      input.press("potion");
      potionCooldown = 2;
    }

    d.update(DT, input as unknown as Input);
    if (chargeBefore >= 1 && hero.specialCharge < 1) ults++;
    for (const ev of d.drainEvents()) {
      if (ev.kind !== "damage") continue;
      if (ev.onPlayer) taken += ev.amount;
      else dealt += ev.amount;
    }
    moved += Math.hypot(d.avatar.x - px, d.avatar.y - py);
    if (meterFirst === null && hero.specialCharge >= 1) meterFirst = t;
    minionSum += d.minions.filter((m) => m.owner === hero.index).length;
    zoneSum += d.ground.filter((g) => g.owner === hero.index).length;
    const live = d.enemies.filter((e) => e.health > 0 && e.state !== "spawning");
    if (live.length > 0) {
      ailSum += live.reduce((n, e) => n + e.sc.list.length, 0) / live.length;
    }
    samples++;
    t += DT;
  }

  if (tr) {
    tr.seconds += t;
    tr.floors++;
  }
  watched = null;
  trace = null;

  return {
    cleared: d.phase !== "fighting" && d.phase !== "dead",
    seconds: t,
    dealt, taken, engageSum, engageTicks, moved, ults, meterFirst,
    minionSum, zoneSum, ailSum, samples, casts,
  };
}

/**
 * `FLOORS` floors on different layouts, averaged. Each floor is a fresh character on the
 * same seeded gear roll, so the only thing that varies is the floor — no XP or loot drift
 * inside a measurement.
 */
function playBuild(build: Build, tr: MeterTrace | null = null): Fingerprint {
  const probe = geared(build);
  const skills = equipForBuild(probe, build);

  const acc: Sample = {
    cleared: false, seconds: 0, dealt: 0, taken: 0, engageSum: 0, engageTicks: 0,
    moved: 0, ults: 0, meterFirst: null, minionSum: 0, zoneSum: 0, ailSum: 0,
    samples: 0, casts: [0, 0, 0],
  };
  let clears = 0;
  const firsts: number[] = [];
  for (let f = 0; f < FLOORS; f++) {
    const s = playFloor(build, SEED + f * 7919, tr);
    if (s.cleared) clears++;
    if (s.meterFirst !== null) firsts.push(s.meterFirst);
    acc.seconds += s.seconds;
    acc.dealt += s.dealt;
    acc.taken += s.taken;
    acc.engageSum += s.engageSum;
    acc.engageTicks += s.engageTicks;
    acc.moved += s.moved;
    acc.ults += s.ults;
    acc.minionSum += s.minionSum;
    acc.zoneSum += s.zoneSum;
    acc.ailSum += s.ailSum;
    acc.samples += s.samples;
    for (let i = 0; i < 3; i++) acc.casts[i]! += s.casts[i]!;
  }

  const secs = Math.max(acc.seconds, 1);
  return {
    cleared: clears,
    seconds: acc.seconds / FLOORS,
    dps: acc.dealt / secs,
    takenPerSec: acc.taken / secs,
    engage: acc.engageTicks > 0 ? acc.engageSum / acc.engageTicks : 0,
    move: acc.moved / secs,
    ultsPerMin: (acc.ults / secs) * 60,
    // The median of the per-floor firsts, so one lucky opening wave can't claim "1 s".
    meterFirst: firsts.length === 0 ? null : firsts.sort((a, b) => a - b)[Math.floor(firsts.length / 2)]!,
    minions: acc.minionSum / Math.max(acc.samples, 1),
    zones: acc.zoneSum / Math.max(acc.samples, 1),
    ailments: acc.ailSum / Math.max(acc.samples, 1),
    casts: [acc.casts[0]! / FLOORS, acc.casts[1]! / FLOORS, acc.casts[2]! / FLOORS],
    skills,
  };
}

/**
 * The bot closes to melee, exactly like `tools/smoke.ts`. This is deliberate, and it took
 * three wrong turns to get here.
 *
 * The tempting idea is to have the bot hold whatever range a build "wants", so a caster
 * kites and a bruiser brawls. Every version of that inference turned the harness into a
 * measurement of its own footwork. Reading the equipped skills' ranges made one Magician
 * build kite at 390 units and clear every floor while its siblings walked into melee and
 * died. Taking the longest unlocked range instead made the *melee* classes stand off — a
 * Juggernaut backed away to 120 units on the strength of Iron March's listed reach and
 * spent three floors swinging a hammer at empty floor, reading 60 dps against the arena's
 * 229. Classifying "ranged" by what fraction of a class's damage abilities reach 200+
 * misfiled the Juggernaut the same way, because a shockwave's radius is a range too.
 *
 * So the driver is the smoke bot's, unchanged: close, swing, dodge telegraphs, retreat
 * when hurt. It is the policy the difficulty curve was actually tuned against (a 0.55-dodge
 * smoke bot averages depth 13.8), which makes it the only footwork here that isn't a
 * variable of its own. **Engage range is therefore an output of this harness, not an
 * input** — a build that kills things before they arrive reads a long engage range because
 * that is what happened, not because the bot was told to stand there.
 */
const MELEE_STAND = 26;

// --- differentiation: do the three builds actually play differently? -------------------

/**
 * The axes that describe *behaviour* rather than power. Two builds that differ only in
 * dps are the same build with a bigger number, which is the failure §35 names.
 */
const AXES = ["engage", "move", "minions", "zones", "ailments", "ultsPerMin", "takenPerSec"] as const;

function axisOf(f: Fingerprint, axis: (typeof AXES)[number]): number {
  return f[axis] ?? 0;
}

/** Relative gap between two numbers, treating a shared zero as "identical". */
function gap(a: number, b: number): number {
  const hi = Math.max(Math.abs(a), Math.abs(b));
  return hi < 1e-6 ? 0 : Math.abs(a - b) / hi;
}

/**
 * How many behaviour axes separate a pair of builds by more than 25%, plus whether the
 * skill mix differs at all. A pair that shares its skills and moves the same way at the
 * same range with the same summons is not two builds.
 */
function distinctAxes(a: Fingerprint, b: Fingerprint): { axes: number; sameSkills: boolean } {
  let axes = 0;
  for (const axis of AXES) if (gap(axisOf(a, axis), axisOf(b, axis)) > 0.25) axes++;
  const sameSkills = a.skills.join() === b.skills.join();
  return { axes, sameSkills };
}

// --- driver ----------------------------------------------------------------------------

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

const only = process.env.BUILDS_CLASS;
const classes = only ? CLASS_IDS.filter((c) => c === only) : CLASS_IDS;
if (only && classes.length === 0) {
  console.log(`no such class "${only}"`);
  process.exit(1);
}

console.log(`\n=== build fingerprints — real delve floors, L${LEVEL} geared, depth ${DEPTH} ===`);
console.log(
  "class / build".padEnd(34) +
  "clr".padStart(4) + "secs".padStart(6) + "dps".padStart(7) + "in/s".padStart(7) +
  "engage".padStart(8) + "move/s".padStart(8) + "ult/m".padStart(7) + "meter".padStart(7) +
  "minion".padStart(8) + "zones".padStart(7) + "ailm".padStart(6) + "  skills / casts",
);

const results = new Map<ClassId, { build: Build; fp: Fingerprint }[]>();
/** One trace per class, pooled over every build of it — see the instrumentation note. */
const traces = new Map<ClassId, MeterTrace>();

for (const classId of classes) {
  const builds = buildsFor(classId);
  const rows: { build: Build; fp: Fingerprint }[] = [];
  const budget = treePointsFor(LEVEL);
  const tr = newTrace();
  traces.set(classId, tr);
  for (const build of builds) {
    if (build.points > budget) {
      console.log(` skip   ${classId} / ${build.name}: needs ${build.points} points, L${LEVEL} has ${budget}`);
      continue;
    }
    const fp = playBuild(build, tr);
    rows.push({ build, fp });
    const tag = `${classId} / ${build.name}${build.tier === "mythic" ? " ★" : ""}`;
    console.log(
      tag.slice(0, 33).padEnd(34) +
      `${fp.cleared}/${FLOORS}`.padStart(4) +
      fp.seconds.toFixed(0).padStart(6) +
      fp.dps.toFixed(0).padStart(7) +
      fp.takenPerSec.toFixed(0).padStart(7) +
      fp.engage.toFixed(0).padStart(8) +
      fp.move.toFixed(0).padStart(8) +
      fp.ultsPerMin.toFixed(1).padStart(7) +
      (fp.meterFirst === null ? "none" : fp.meterFirst.toFixed(0) + "s").padStart(7) +
      fp.minions.toFixed(1).padStart(8) +
      fp.zones.toFixed(1).padStart(7) +
      fp.ailments.toFixed(1).padStart(6) +
      "  " + fp.skills.map((s, i) => `${s}:${(fp.casts[i] ?? 0).toFixed(0)}`).join(" "),
    );
  }
  results.set(classId, rows);
}

// --- §35: three builds per class play differently ---------------------------------------

console.log("\n=== §35 — do a class's three builds play differently? ===");
for (const classId of classes) {
  const rows = results.get(classId) ?? [];
  const hybrids = rows.filter((r) => r.build.tier === "hybrid");
  if (hybrids.length < 3) {
    check(`${classId}: three hybrid builds available`, false, `only ${hybrids.length} ran`);
    continue;
  }
  const pairs: { label: string; axes: number; sameSkills: boolean }[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      const r = distinctAxes(hybrids[i]!.fp, hybrids[j]!.fp);
      pairs.push({ label: `${hybrids[i]!.build.name} vs ${hybrids[j]!.build.name}`, ...r });
    }
  }
  // A pair is "the same build twice" only if it shares its skills AND separates on no
  // behaviour axis. Sharing skills while playing at a different range or with a different
  // summon count is a legitimately different build of the same kit.
  const flat = pairs.filter((p) => p.sameSkills && p.axes === 0);
  check(
    `${classId}: its three builds are behaviourally distinct`,
    flat.length === 0,
    flat.length === 0
      ? pairs.map((p) => `${p.axes} axes`).join(", ")
      : flat.map((p) => `${p.label} identical`).join("; "),
  );
}

// --- real-play meter cadence: the number the arena over-fills ---------------------------

console.log("\n=== ultimate cadence in real play (the arena over-fills 2–3×) ===");
console.log("class".padEnd(14) + "arena".padStart(8) + "real: first full / per minute".padStart(32));
for (const classId of classes) {
  const rows = results.get(classId) ?? [];
  if (rows.length === 0) continue;
  const firsts = rows.map((r) => r.fp.meterFirst).filter((v): v is number => v !== null);
  const perMin = rows.reduce((s, r) => s + r.fp.ultsPerMin, 0) / rows.length;
  const first = firsts.length > 0 ? `${Math.min(...firsts).toFixed(0)}s` : "never";
  console.log(
    classId.padEnd(14) +
    "—".padStart(8) +
    `${first} / ${perMin.toFixed(1)}`.padStart(32),
  );
}

// --- why a meter never fills: the generation-rule ledger --------------------------------
//
// Printed only for a class no build of which ever reached a full meter, so it stays a
// diagnosis of the open problem rather than 21 classes of noise. Set BUILDS_GEN=1 to see
// it for every class (useful when checking that a fix moved the right rule).

const genAll = process.env.BUILDS_GEN === "1";
const stuck = classes.filter((c) => {
  const rows = results.get(c) ?? [];
  return rows.length > 0 && rows.every((r) => r.fp.meterFirst === null);
});
const genFor = genAll ? classes : stuck;

if (genFor.length > 0) {
  console.log(
    genAll
      ? "\n=== meter generation ledger — every class ==="
      : `\n=== why the meter never fills — ${stuck.length} class(es) ===`,
  );
  for (const classId of genFor) {
    const tr = traces.get(classId);
    if (!tr || tr.seconds <= 0) continue;
    const meter = CLASS_BY_ID[classId]?.resources.find((r) => r.isUltimateMeter);
    if (!meter) continue;
    const need = meter.max;
    const floors = Math.max(tr.floors, 1);
    console.log(
      `\n${classId} — "${meter.label}", max ${need}, ` +
      `per floor over ${floors} floors averaging ${(tr.seconds / floors).toFixed(0)}s`,
    );
    const silent = new Set(silentRules(classId, tr));
    for (const rule of meter.generation ?? []) {
      const label = ruleLabel(rule);
      const got = (tr.offered.get(label) ?? 0) / floors;
      const perBar = got > 0 ? `${(got / need).toFixed(2)} bars` : "—";
      const refusedUlt = tr.refused.get(`${label} ← ultimate-sourced`) ?? 0;
      const refusedTags = tr.refused.get(`${label} ← tags`) ?? 0;
      const why = silent.has(label)
        ? `NO "${rule.on}" EVENT — the simulation never broadcasts it`
        : refusedTags > 0 && got === 0
          ? `${tagVerdict(classId, rule)} (${refusedTags} events, saw ${[...(tr.seenTags.get(label) ?? [])].join(", ")})`
          : refusedUlt > 0 && got === 0
            ? `every match was ultimate-sourced (${refusedUlt}) — THE ULTIMATE RULE`
            : refusedTags > 0
              ? `${refusedTags} more refused on tags`
              : "";
      console.log(
        `  ${label.padEnd(40)} ${got.toFixed(0).padStart(8)} pts  ${perBar.padStart(10)}` +
        (why ? `   ${why}` : ""),
      );
    }
    if (meter.regenPerSec) {
      const regen = (meter.regenPerSec * tr.seconds) / floors;
      console.log(`  ${"regenPerSec".padEnd(40)} ${regen.toFixed(0).padStart(8)} pts  ${(regen / need).toFixed(2).padStart(4)} bars`);
    }
    if (meter.decayPerSec) console.log(`  ${`decayPerSec ${meter.decayPerSec} after ${meter.decayDelay ?? 0}s`.padEnd(40)} — drains the bar back down`);
    const seen = [...tr.events.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}×${(v / floors).toFixed(0)}`);
    console.log(`  events per floor: ${seen.join(", ")}`);
  }
}

console.log(
  failures === 0
    ? "\nALL BUILD CHECKS PASSED"
    : `\n${failures} BUILD CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
