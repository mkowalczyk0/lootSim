/**
 * THE MAP-WIPE RULE (docket §30) — no skill reaches the whole floor by omission.
 *
 * The owner reported it twice, in two classes ("no skill in the game should have the
 * ability to wipe the entire map out — similar to archers ultimate we looked at, paladin
 * has something similar on his aegis rush"). The cause was one line in `selectActorIds`:
 * `to: "enemies"` bounded itself by `ability.shape.radius` and, when the ability had no
 * shape at all, fell through to *every hostile on the floor*. Unbounded was what you got
 * for not thinking about it, so every ability authored without a shape wiped the map and
 * so would every one written tomorrow.
 *
 * The fix inverts that default at the single site that resolves the selection, exactly as
 * docket §20 put the execute threshold at the single site that evaluates the rider — and
 * for the same reason, stated in `enemyReach`'s own comment: a required per-packet field
 * would be an uncommanded balance pass across classes nobody reported, and is satisfiable
 * with the number that spells the original bug.
 *
 * This tool is the scope half of the guard, and it exists because a gate whose scope can
 * silently empty is the fourth lesson in `CLAUDE.md`. It **prints every site it walked**,
 * so a sweep that stops finding anything is visible rather than green.
 *
 * Three assertions:
 *   1. Every `to: "enemies"` site resolves to a finite reach — as a *comparison* against
 *      the floor's own span, not a bound it picks itself.
 *   2. `to: "enemiesEverywhere"` appears only on the pinned roster below. A new one fails;
 *      so does silently removing one, the same way `tools/legends.ts` pins the boss-rule
 *      violations it knows about.
 *   3. The walk is non-empty and covers every class, so an emptied scope goes red.
 *
 * Run with `npm run mapwipe`; part of `npm test`.
 */

import { Dungeon, type Hero } from "../src/game/dungeon";
import { GameState } from "../src/game/state";
import { delveConfig } from "../src/data/modes";
import { installClass } from "../src/progression/index";
import type { Action, AvatarInput } from "../src/core/input";
import type { CastInput } from "../src/combat/index";
import { CLASS_IDS, type ClassId } from "../src/data/classes";
import { CLASS_BY_ID } from "../src/progression/index";
import { RELICS } from "../src/data/relics";
import { NAMED_ITEMS } from "../src/data/named";
import { DEFAULT_ENEMY_REACH, enemyReach } from "../src/combat/runtime";
import type { Ability, EffectStep } from "../src/combat/index";

/**
 * The deliberate opt-ins. Each is here because its own description says "the field", and
 * each was read before it was listed. Changing this list is a design decision, which is
 * the point of pinning it.
 */
const FIELD_WIDE: Readonly<Record<string, string>> = {
  "warlock.damnation": "ULT — \"Brand every enemy on the field.\"",
  "reaper.death_comes_due": "ULT — \"Time freezes for everything below a health threshold ... walks the field.\"",
  "alchemist.unstable_reaction": "\"Force every chemical zone on the field to react at once.\" (non-ultimate, 16s)",
  "engineer.remote_detonation": "\"Trigger every mine and expendable device on the field at once.\" (non-ultimate, 16s)",
};

/**
 * The widest a floor ever gets, from `level.ts`'s own constants: a room is at most
 * ROOM_BASE + ROOM_GROWTH_CAP = 640 units, and the macro grid is several rooms across.
 * A reach at or above this is a map-wipe whatever it calls itself. Fixed, and derived
 * from the level generator rather than from the abilities under test — the bound, the
 * scope and the subject each have to come from somewhere other than the thing being
 * measured (CLAUDE.md, the fourth lesson).
 */
const FLOOR_SPAN = 640 * 3;

interface Site {
  owner: string;
  abilityId: string;
  where: string;
  sel: "enemies" | "enemiesEverywhere";
  reach: number | "floor";
  via: string;
}

const sites: Site[] = [];
const failures: string[] = [];

function walk(steps: readonly EffectStep[], path: string, visit: (s: EffectStep, p: string) => void): void {
  steps.forEach((step, i) => {
    const here = `${path}[${i}]:${step.kind}`;
    visit(step, here);
    const s = step as EffectStep & {
      effects?: readonly EffectStep[];
      then?: readonly EffectStep[];
      choices?: readonly { effects: readonly EffectStep[] }[];
    };
    if (s.effects) walk(s.effects, here, visit);
    if (s.then) walk(s.then, here, visit);
    if (s.choices) s.choices.forEach((c, j) => walk(c.effects, `${here}/c${j}`, visit));
    if (step.kind === "projectile" && step.projectile.onExpire) {
      walk(step.projectile.onExpire, `${here}/onExpire`, visit);
    }
  });
}

/** Why `enemyReach` returned what it returned — so the table explains itself. */
function reachVia(ability: Ability, stepRadius: number | undefined): string {
  if (stepRadius !== undefined) return "step.radius";
  if (ability.shape?.radius !== undefined) return "shape.radius";
  if (ability.shape?.length !== undefined) return "shape.length";
  if (ability.range !== undefined && enemyReach(ability) === ability.range) return "range";
  if (enemyReach(ability) === DEFAULT_ENEMY_REACH) return "DEFAULT";
  return "zone.radius";
}

function scan(ability: Ability, owner: string, steps: readonly EffectStep[], root: string): void {
  walk(steps, root, (step, where) => {
    const sel = (step as { to?: string }).to;
    if (sel !== "enemies" && sel !== "enemiesEverywhere") return;
    if (sel === "enemiesEverywhere") {
      sites.push({ owner, abilityId: ability.id, where, sel, reach: "floor", via: "declared" });
      return;
    }
    const stepRadius = (step as { radius?: number }).radius;
    const reach = enemyReach(ability, stepRadius);
    sites.push({ owner, abilityId: ability.id, where, sel, reach, via: reachVia(ability, stepRadius) });
  });
}

const classesSeen = new Set<string>();
for (const classId of CLASS_IDS) {
  const def = CLASS_BY_ID[classId];
  if (!def) continue;
  classesSeen.add(classId);
  for (const a of def.abilities) {
    scan(a, classId, a.effects, "effects");
    if (a.followUp) scan(a, classId, a.followUp.effects, "followUp");
  }
}

/**
 * Mutation-, relic- and named-item-added steps. These are why the fix could not be a
 * per-packet field: the majority of `to: "enemies"` sites in the repo are *not* on an
 * ability's own effect list. They are reported by count rather than individually — a
 * mutation's reach is the reach of whichever ability it lands on, which is decided at
 * runtime, and the point here is that the count is not zero.
 */
let addedSites = 0;
function countAdded(obj: unknown): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) { for (const v of obj) countAdded(v); return; }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === "effects" && Array.isArray(v) && v.length > 0 && typeof (v[0] as { kind?: unknown })?.kind === "string") {
      walk(v as EffectStep[], "", (step) => {
        const sel = (step as { to?: string }).to;
        if (sel === "enemies" || sel === "enemiesEverywhere") addedSites += 1;
      });
    }
    countAdded(v);
  }
}
for (const classId of CLASS_IDS) {
  const def = CLASS_BY_ID[classId];
  if (!def) continue;
  countAdded(def.progression);
  countAdded(def.unlocks);
}
countAdded(RELICS);
countAdded(NAMED_ITEMS);

// --- assertions -------------------------------------------------------

// 3. scope: the walk has to have found something, across every class.
if (sites.length === 0) failures.push("the sweep found no to:\"enemies\" site at all — scope has emptied");
if (classesSeen.size !== CLASS_IDS.length) {
  failures.push(`walked ${classesSeen.size} classes, expected ${CLASS_IDS.length}`);
}
if (addedSites === 0) {
  failures.push("no mutation/relic/named site found — the scope that justified the runtime-site fix has emptied");
}

// 1. every bounded site is genuinely bounded, compared against the floor's own span.
for (const s of sites) {
  if (s.sel !== "enemies") continue;
  if (typeof s.reach !== "number" || !Number.isFinite(s.reach)) {
    failures.push(`${s.owner}/${s.abilityId} ${s.where} — non-finite reach`);
  } else if (s.reach >= FLOOR_SPAN) {
    failures.push(`${s.owner}/${s.abilityId} ${s.where} — reach ${s.reach} >= a floor's span ${FLOOR_SPAN}`);
  }
}

// 2. the field-wide roster is exactly the pinned one.
const declared = new Set(sites.filter((s) => s.sel === "enemiesEverywhere").map((s) => s.abilityId));
for (const id of declared) {
  if (!(id in FIELD_WIDE)) {
    failures.push(`${id} declares to:"enemiesEverywhere" and is not on the pinned roster — a new map-wide skill is a design decision, not a merge`);
  }
}
for (const id of Object.keys(FIELD_WIDE)) {
  if (!declared.has(id)) {
    failures.push(`${id} is pinned as field-wide but no longer declares it — the pin is stale`);
  }
}

// --- report -----------------------------------------------------------

console.log("THE MAP-WIPE RULE (docket §30)\n");
console.log(`walked ${classesSeen.size}/${CLASS_IDS.length} classes, ${sites.length} to:"enemies"/"enemiesEverywhere" sites on ability effect lists`);
console.log(`plus ${addedSites} more added by tree nodes, hybrids, archetypes, relics and named items`);
console.log(`floor span used as the fixed reference: ${FLOOR_SPAN} units\n`);

const bounded = sites.filter((s) => s.sel === "enemies");
const byAbility = new Map<string, Site>();
for (const s of bounded) if (!byAbility.has(s.abilityId)) byAbility.set(s.abilityId, s);
console.log(`--- bounded (${byAbility.size} abilities, ${bounded.length} steps) ---`);
for (const s of [...byAbility.values()].sort((a, b) => (b.reach as number) - (a.reach as number))) {
  console.log(`  ${String(s.reach).padStart(5)}  via ${s.via.padEnd(12)} ${s.abilityId}`);
}

console.log(`\n--- declared field-wide (${declared.size}) ---`);
for (const id of Object.keys(FIELD_WIDE)) console.log(`  ${id.padEnd(30)} ${FIELD_WIDE[id]}`);

// --- pass 2: the bound actually bites, in a real dungeon ---------------

/**
 * The static table above is a reading of the data. This is the fight.
 *
 * Monsters are strung out along +x at distances well past any authored reach, the ability
 * is cast once for real, and the harness records which distances actually lost health.
 * It is here because a table that says "320" proves nothing about what `host.actors()`
 * hands back at fire time — and because the A/B that justified this change (master's
 * `selectActorIds` hit every one of these out to 1400 units; this one stops) is only
 * evidence if the instrument can still see a regression put back.
 *
 * The far ring is the assertion: **a bounded ability must leave the far monsters
 * untouched, and a declared field-wide one must hit them.** Both directions, so this
 * cannot pass by the arena quietly failing to spawn anything.
 */
class IdleInput implements AvatarInput {
  moveVector(): { x: number; y: number } { return { x: 0, y: 0 }; }
  wasPressed(_a: Action): boolean { return false; }
  aimAngle(): number | null { return null; }
}
const IDLE = new IdleInput();

const NEAR = 60;
const FAR = [700, 1000, 1400];

function castInput(d: Dungeon, hero: Hero, ability: Ability): CastInput {
  const fn = (d as unknown as { castInputFor(h: Hero, a?: Ability): CastInput }).castInputFor;
  return fn.call(d, hero, ability);
}

/** Returns the distances that lost health, or null when the arena could not be staged. */
function liveReach(classId: ClassId, abilityId: string): number[] | null {
  const def = CLASS_BY_ID[classId];
  const ability = def?.abilities.find((a) => a.id === abilityId);
  if (!def || !ability) return null;
  installClass(def);
  const state = new GameState(0x5eed);
  state.chooseClass(classId);
  state.player.level = 60;
  state.player.refresh();
  state.player.fullHeal();
  const d = new Dungeon(state, delveConfig(8), 999);
  d.sealWaves();
  d.enemies.length = 0;
  const a = d.localHero.avatar;
  a.x = 80;
  a.y = Math.min(d.height / 2, d.height - 80);
  const placed: { r: number; id: number }[] = [];
  for (const r of [NEAR, ...FAR]) {
    const x = a.x + r;
    if (x > d.width - 40) continue;
    d.spawnArchetypeAt("brute", x, a.y);
    placed.push({ r, id: d.enemies[d.enemies.length - 1]!.id });
  }
  if (placed.length !== 1 + FAR.length) return null;
  const hp0 = new Map(d.enemies.map((e) => [e.id, e.health]));
  const hero = d.localHero;
  a.facing = 0;
  hero.aimPoint = { x: a.x + (ability.range ?? 200), y: a.y };
  for (const pool of hero.resources.all()) pool.value = pool.max;
  hero.rt.castAbility(d as never, hero.index, ability, castInput(d, hero, ability));
  for (let i = 0; i < 90; i++) d.update(1 / 60, IDLE);
  const hit: number[] = [];
  for (const p of placed) {
    const e = d.enemies.find((x) => x.id === p.id);
    if ((hp0.get(p.id) ?? 0) - (e ? e.health : 0) > 0.01) hit.push(p.r);
  }
  return hit;
}

console.log("\n--- live: cast for real, who actually lost health ---");
let probed = 0;
const LIVE: readonly { cls: ClassId; id: string; fieldWide: boolean }[] = [
  { cls: "paladin", id: "paladin.aegis_rush", fieldWide: false },
  { cls: "warden", id: "warden.overgrowth", fieldWide: false },
  { cls: "warlock", id: "warlock.damnation", fieldWide: true },
  { cls: "alchemist", id: "alchemist.unstable_reaction", fieldWide: true },
];
for (const probe of LIVE) {
  const hit = liveReach(probe.cls, probe.id);
  if (hit === null) {
    failures.push(`${probe.id} — live arena could not be staged, so this proved nothing`);
    continue;
  }
  probed += 1;
  const far = hit.filter((r) => FAR.includes(r));
  console.log(`  ${probe.id.padEnd(30)} hit=[${hit.join(",")}]${probe.fieldWide ? "  (declared field-wide)" : ""}`);
  if (probe.fieldWide) {
    if (far.length !== FAR.length) {
      failures.push(`${probe.id} is declared field-wide but missed ${FAR.filter((r) => !far.includes(r)).join(",")}`);
    }
  } else if (far.length > 0) {
    failures.push(`${probe.id} reached ${far.join(",")} units — a bounded ability is still wiping the map`);
  }
  // Both directions. Without this a probe that silently stopped casting — a resource it
  // can no longer afford, a targeting mode that stopped resolving — would hit nothing,
  // miss the far ring, and be indistinguishable from a working bound. `duelist.riposte`
  // was in this list until exactly that happened: it is a `reactive`, it fires only on
  // damage the staged hero never took, and it sailed through green having cast nothing.
  if (!hit.includes(NEAR)) {
    failures.push(`${probe.id} hit nothing at ${NEAR} units — the probe never landed, so its far-ring result proves nothing`);
  }
}
if (probed !== LIVE.length) failures.push(`live pass probed ${probed}/${LIVE.length} abilities`);

if (failures.length > 0) {
  console.log(`\nFAIL (${failures.length}):`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log("\nok — nothing reaches the floor by omission");
