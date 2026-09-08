/**
 * Keystone / hybrid / Mythic rule-engine acceptance test.
 *
 * `docs/rule-coverage.md` tracks which of the ~284 `ResolvedBuild.rules` ids the
 * dungeon actually interprets (`src/game/rules.ts`). This proves the wired ones do
 * something observable in a real `Dungeon` — the "does it do anything" pass the cutover
 * plan's §4 asks for, over and above `npm run roster` which only checks the data shape
 * and the unlock thresholds.
 *
 * Headless, deterministic (no combat RNG is touched — the hooks are driven directly).
 * Run with `npm run rules`.
 */

import { Dungeon } from "../src/game/dungeon";
import type { Enemy } from "../src/game/entities";
import {
  rulesOnCast, rulesOnDamageTaken, rulesOnHit, rulesOnKill, rulesTick,
} from "../src/game/rules";
import { GameState } from "../src/game/state";
import { delveConfig } from "../src/data/modes";
import { ARCHETYPES } from "../src/data/enemies";
import { CLASS_BY_ID, buildProgressionTree, installClass } from "../src/progression/index";
import type { ClassId } from "../src/data/classes";

/** `makeEnemy` is private; a headless test may reach it to stage a fixed encounter. */
function spawn(d: Dungeon, x: number, y: number): Enemy {
  const mk = (d as unknown as {
    makeEnemy(a: typeof ARCHETYPES.brute, x: number, y: number): Enemy;
  }).makeEnemy;
  const e = mk.call(d, ARCHETYPES.brute, x, y);
  e.state = "active";
  e.spawnTimer = 0;
  d.enemies.push(e);
  return e;
}

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string): void {
  console.log(`\n=== ${name} ===`);
}

/** A geared L60 hero of `classId` with every node in the named path(s) lit. */
function dungeonWith(classId: ClassId, pathNames: string[]): Dungeon {
  const def = CLASS_BY_ID[classId]!;
  const tree = buildProgressionTree(def.progression);
  installClass(def); // register the class's statuses (Withering, Flow, …) — idempotent
  const state = new GameState(1234);
  state.chooseClass(classId);
  state.player.level = 60;
  for (const name of pathNames) {
    const pIdx = def.progression.paths.findIndex((p) => p.name === name);
    if (pIdx < 0) throw new Error(`${classId}: no path "${name}"`);
    for (let row = 0; row < 5; row++) state.player.allocated.push(`${classId}.${pIdx}.${row}`);
  }
  state.player.refresh();
  state.player.fullHeal();
  const d = new Dungeon(state, delveConfig(8), 999);
  void tree;
  return d;
}

// --- the rules are actually collected --------------------------------

section("rules reach ResolvedBuild.rules");
{
  const d = dungeonWith("juggernaut", ["Fortress"]);
  check(
    "allocating the Fortress path lights juggernaut.ft.immovable",
    d.localHero.player.build.rules.has("juggernaut.ft.immovable"),
    [...d.localHero.player.build.rules].join(", "),
  );
}

// --- damage-taken rules -------------------------------------------------

section("damage-taken keystones change the number");
{
  const d = dungeonWith("juggernaut", ["Fortress"]);
  const hero = d.localHero;
  const fortify = hero.resources.get("fortify");
  if (fortify) fortify.value = fortify.max;
  const lethal = hero.player.health + 500;
  const out = rulesOnDamageTaken(d, hero, lethal);
  check("Immovable caps a lethal hit at health-1", out === Math.max(0, hero.player.health - 1), `${out} vs ${hero.player.health}`);
}
{
  const d = dungeonWith("reaper", ["Soul Warden"]);
  const hero = d.localHero;
  const souls = hero.resources.get("reaped_souls");
  if (souls) souls.value = 20;
  const out = rulesOnDamageTaken(d, hero, 100);
  check("Soul Skin reduces a hit above 10 Souls", out < 100 && out >= 70, `${out}`);
}
{
  const d = dungeonWith("reaper", ["Soul Warden"]);
  const hero = d.localHero;
  const souls = hero.resources.get("reaped_souls");
  if (souls) souls.value = 3;
  const out = rulesOnDamageTaken(d, hero, 100);
  check("Soul Skin does nothing below 10 Souls", out === 100, `${out}`);
}

// --- on-cast: the primed-strike loop ---------------------------------

section("three distinct casts prime an empowered strike");
{
  const d = dungeonWith("swordsman", ["Master of Arms"]);
  const hero = d.localHero;
  const abilities = hero.player.pilotClass!.abilities.filter((a) => !a.isUltimate).slice(0, 3);
  for (const ab of abilities) rulesOnCast(d, hero, ab);
  check("primed after 3 distinct skills", hero.ruleState.primed !== null, JSON.stringify(hero.ruleState.primed));
  const enemy = { x: 0, y: 0, health: 1000, radius: 12, windup: 0, state: "active", sc: { has: () => false } } as never;
  const rr = rulesOnHit(d, hero, enemy, { isBasic: true, isCrit: false, movedRecently: false, outOfReach: false });
  check("the next hit consumes it for a damage bump", rr.damageMult > 1.4, `x${rr.damageMult}`);
  check("primed is cleared after one hit", hero.ruleState.primed === null);
}

// --- on-kill ---------------------------------------------------------

section("on-kill rules fire");
{
  const d = dungeonWith("warlock", ["Soul Eater"]);
  const hero = d.localHero;
  const manaBefore = hero.player.mana;
  hero.player.spendMana(hero.player.mana); // empty it
  const enemy = { x: hero.avatar.x, y: hero.avatar.y, health: 0, sc: { has: (s: string) => s === "curse" } } as never;
  rulesOnKill(d, hero, enemy);
  check("Devour Soul refunds mana on a cursed kill", hero.player.mana > 0, `${hero.player.mana} (was ${manaBefore})`);
}

// --- B-1: damage-link keystones spread a hit across linked enemies -----

section("damage-link keystones spread a hit");
{
  const d = dungeonWith("shaman", ["Witch Doctor"]);
  const hero = d.localHero;
  const anchor = spawn(d, 100, 100);
  const near = spawn(d, 140, 100);
  const far = spawn(d, 900, 900);
  for (const e of [anchor, near, far]) {
    e.sc.apply("withering", { stacks: 6, sourceActorId: hero.index, chance: 1, roll: () => 0 });
  }
  const nearBefore = near.health;
  const farBefore = far.health;
  rulesOnHit(d, hero, anchor, { isBasic: true, isCrit: false, movedRecently: false, outOfReach: false, amount: 200 });
  check("Hexmaster bleeds the hit onto a linked enemy in range", near.health < nearBefore, `${near.health} / ${nearBefore}`);
  check("Hexmaster does not reach a linked enemy out of range", far.health === farBefore, `${far.health}`);
}

// --- B-3: stance / form keystones ------------------------------------

section("stance / form keystones");
{
  const d = dungeonWith("monk", ["Iron Body"]);
  const hero = d.localHero;
  for (let i = 0; i < 5; i++) {
    hero.sc.apply("flow", { sourceActorId: hero.index, chance: 1, roll: () => 0 });
  }
  rulesTick(d, hero, 0.016);
  const landedHigh = hero.sc.apply("stunned", { sourceActorId: -1, chance: 1, roll: () => 0 });
  check("Adamant Form blocks CC while Flow is high", !landedHigh && !hero.sc.has("stunned"));
  while (hero.sc.has("flow")) hero.sc.list.splice(hero.sc.list.findIndex((s) => s.id === "flow"), 1);
  rulesTick(d, hero, 0.016);
  const landedLow = hero.sc.apply("stunned", { sourceActorId: -1, chance: 1, roll: () => 0 });
  check("Adamant Form lets CC through once Flow drops", landedLow && hero.sc.has("stunned"));
}
{
  const d = dungeonWith("reaper", ["Wraith"]);
  const hero = d.localHero;
  const souls = hero.resources.get("reaped_souls");
  if (souls) souls.value = 20;
  const out = rulesOnDamageTaken(d, hero, hero.player.health + 999);
  check("Deathless Form negates a downing hit and spends Souls", out === 0 && !!souls && souls.value <= 12, `out=${out} souls=${souls?.value}`);
}

console.log(failures === 0 ? "\nALL RULE CHECKS PASSED" : `\n${failures} RULE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
