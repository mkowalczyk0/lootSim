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

import { Dungeon, type Hero } from "../src/game/dungeon";
import { circleHitsWall } from "../src/game/level";
import type { Element } from "../src/data/elements";
import type { Enemy } from "../src/game/entities";
import {
  rulesOnCast, rulesOnDamageTaken, rulesOnHit, rulesOnKill, rulesOnMinionDeath,
  rulesOnUltimate, rulesTick,
} from "../src/game/rules";
import { GameState } from "../src/game/state";
import { delveConfig } from "../src/data/modes";
import { ARCHETYPES } from "../src/data/enemies";
import { REACTIVE_EVENTS } from "../src/game/abilities";
import type { Ability, CastInput, EffectStep } from "../src/combat/index";
import { ALL_CLASSES, CLASS_BY_ID, buildProgressionTree, installClass } from "../src/progression/index";
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

/**
 * `castInputFor` is private; a headless test reaches it so a staged cast is aimed exactly
 * the way a real keypress aims one — `targeting: "currentTarget"` needs the
 * `currentTargetId` this computes, and hand-rolling it would be testing the wrong thing.
 */
function castInput(d: Dungeon, hero: Hero, ability?: Ability): CastInput {
  const fn = (d as unknown as {
    castInputFor(h: Hero, a?: Ability): CastInput;
  }).castInputFor;
  return fn.call(d, hero, ability);
}

/** Stage a ground zone the hero owns, the way a cast skill would. */
function zone(
  d: Dungeon, hero: Hero, x: number, y: number, radius: number,
  element: Element, benefit?: "heal",
): void {
  d.ground.push({
    x, y, px: x, py: y, radius, element,
    damage: 0, remaining: 999, tickTimer: 0.5,
    hitsPlayer: false, hitsEnemies: !benefit, color: "#ffffff",
    owner: hero.index,
    ...(benefit ? { benefit } : {}),
  });
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

// --- B-2: execute-threshold keystones finish a wounded target ---------

section("execute-threshold keystones");
{
  const d = dungeonWith("ranger", ["Cold Hunt"]);
  const hero = d.localHero;
  const low = spawn(d, 120, 120);
  low.health = low.maxHealth * 0.2;
  low.sc.apply("quarry", { sourceActorId: hero.index, chance: 1, roll: () => 0 });
  const rr = rulesOnHit(d, hero, low, { isBasic: true, isCrit: false, movedRecently: false, outOfReach: false, amount: 1 });
  check("Cull the Weak inflates a tiny hit into a kill on a quarried low target", rr.damageMult * 1 >= low.health, `x${rr.damageMult.toFixed(1)} vs ${low.health.toFixed(0)}`);
  check("Cull the Weak forces the crit", rr.forceCrit);
}
{
  const d = dungeonWith("ranger", ["Cold Hunt"]);
  const hero = d.localHero;
  const healthy = spawn(d, 120, 120);
  healthy.health = healthy.maxHealth * 0.8; // above the 30% window
  healthy.sc.apply("quarry", { sourceActorId: hero.index, chance: 1, roll: () => 0 });
  const rr = rulesOnHit(d, hero, healthy, { isBasic: true, isCrit: false, movedRecently: false, outOfReach: false, amount: 100 });
  check("Cull the Weak leaves a healthy quarry alone", rr.damageMult === 1 && !rr.forceCrit);
}

// --- B-6: Mythic Archetype "the ultimate becomes a state" ------------

section("Mythic persistent-state windows");
{
  const d = dungeonWith("juggernaut", ["Fortress", "Sentinel", "Iron Tyrant"]);
  const hero = d.localHero;
  check(
    "the three required paths unlock juggernaut.mythic.the_keep",
    hero.player.build.rules.has("juggernaut.mythic.the_keep"),
    [...hero.player.build.rules].filter((r) => r.includes("mythic")).join(", "),
  );
  check("no window before the ultimate", hero.ruleState.mythicUntil === 0);
  rulesOnUltimate(d, hero);
  check("casting the ultimate opens the window", hero.ruleState.mythicRule === "juggernaut.mythic.the_keep" && hero.ruleState.mythicUntil > d.now());
  const out = rulesOnDamageTaken(d, hero, hero.player.health + 999);
  check("The Keep holds you at 1 HP while the window is open", out === hero.player.health - 1, `${out}`);
}
{
  // A class with no wired Mythic never opens a window.
  const d = dungeonWith("swordsman", ["Master of Arms"]);
  const hero = d.localHero;
  rulesOnUltimate(d, hero);
  check("a class with no persistent-state Mythic opens no window", hero.ruleState.mythicUntil === 0);
}

// --- B-1 remainder: bleed cash-in + status permanence --------------------

section("B-1 remainder — Thousand Cuts / Red Contract / Total Corruption");
{
  const d = dungeonWith("duelist", ["Bleedmaster"]);
  const hero = d.localHero;
  const e = spawn(d, hero.avatar.x + 40, hero.avatar.y);
  for (let i = 0; i < 6; i++) {
    e.sc.apply("bleed", { stacks: 1, hitDamage: 40, sourceActorId: hero.index, chance: 1, roll: () => 0 });
  }
  const before = e.health;
  rulesOnHit(d, hero, e, { isBasic: true, isCrit: false, movedRecently: false, outOfReach: false, amount: 10 });
  check("Thousand Cuts cashes in a 5+ stack bleed as a burst", before - e.health > 40, `${(before - e.health).toFixed(0)}`);
  check("Thousand Cuts spends the bleed timer down", (e.sc.get("bleed")?.remaining ?? 9) <= 1.01, `${e.sc.get("bleed")?.remaining}`);
}
{
  const d = dungeonWith("duelist", ["Blood Duel", "Bleedmaster"]);
  const hero = d.localHero;
  const guarded = hero.player.build.rules.has("duelist.hybrid.red_contract");
  check("Blood Duel + Bleedmaster unlocks duelist.hybrid.red_contract", guarded);
  const e = spawn(d, hero.avatar.x + 60, hero.avatar.y);
  e.sc.apply("mark", { sourceActorId: hero.index, chance: 1, roll: () => 0 });
  e.sc.apply("bleed", { stacks: 2, hitDamage: 20, sourceActorId: hero.index, chance: 1, roll: () => 0 });
  const bleed = e.sc.get("bleed")!;
  bleed.remaining = 0.4;
  rulesTick(d, hero, 0.016);
  check("Red Contract keeps a marked target's bleed from expiring", bleed.remaining >= 4, `${bleed.remaining}`);
}
{
  const d = dungeonWith("warlock", ["Corruptor"]);
  const hero = d.localHero;
  const e = spawn(d, hero.avatar.x + 60, hero.avatar.y);
  e.sc.apply("hex", { stacks: 3, hitDamage: 20, sourceActorId: hero.index, chance: 1, roll: () => 0 });
  const hex = e.sc.get("hex")!;
  hex.remaining = 0.5;
  rulesTick(d, hero, 0.016);
  check("Total Corruption makes a 3-stack hex permanent", hex.remaining >= 9, `${hex.remaining}`);
}

// --- B-5: zone keystones read the hero's own ground zones ----------------

section("zone keystones");
{
  const d = dungeonWith("stormcaller", ["Eye"]);
  const hero = d.localHero;
  const e = spawn(d, hero.avatar.x + 300, hero.avatar.y);
  zone(d, hero, hero.avatar.x + 2000, hero.avatar.y, 100, "lightning");
  const outside = rulesOnHit(d, hero, e, { isBasic: true, isCrit: false, movedRecently: false, outOfReach: false, amount: 50 });
  check("Outer Bands empowers a hit made outside your eye zone", outside.damageMult > 1.2, `x${outside.damageMult}`);
  d.ground.length = 0;
  zone(d, hero, hero.avatar.x, hero.avatar.y, 200, "lightning");
  const inside = rulesOnHit(d, hero, e, { isBasic: true, isCrit: false, movedRecently: false, outOfReach: false, amount: 50 });
  check("Outer Bands gives nothing while you stand in the eye", inside.damageMult === 1, `x${inside.damageMult}`);
}
{
  const d = dungeonWith("shaman", ["Ritualist"]);
  const hero = d.localHero;
  const e = spawn(d, 400, 400);
  zone(d, hero, 400, 400, 120, "fire");
  const before = e.health;
  const ab = hero.player.pilotClass!.abilities.find((a) => !a.isUltimate)!;
  rulesOnCast(d, hero, ab);
  check("Great Ritual bursts a zone you own on every cast", e.health < before, `${e.health.toFixed(0)} / ${before.toFixed(0)}`);
}
{
  const d = dungeonWith("warden", ["Thornkeeper"]);
  const hero = d.localHero;
  const e = spawn(d, 400, 400);
  zone(d, hero, 400, 400, 100, "nature");
  const before = e.health;
  rulesTick(d, hero, 0.016);
  check("Briarheart pulses a thorn nova from a zone you own", e.health < before, `${e.health.toFixed(0)} / ${before.toFixed(0)}`);
}
{
  const d = dungeonWith("alchemist", ["Pyromancer"]);
  const hero = d.localHero;
  const e = spawn(d, 400, 400);
  zone(d, hero, 360, 400, 80, "fire");
  zone(d, hero, 440, 400, 80, "fire");
  const before = e.health;
  rulesTick(d, hero, 0.016);
  check("Conflagration detonates where two of your fire pools overlap", e.health < before, `${e.health.toFixed(0)} / ${before.toFixed(0)}`);
  d.ground.length = 0;
  zone(d, hero, 400, 400, 80, "fire");
  e.health = e.maxHealth;
  rulesTick(d, hero, 0.5);
  check("Conflagration needs two overlapping zones", e.health === e.maxHealth, `${e.health.toFixed(0)}`);
}
{
  const d = dungeonWith("warden", ["Verdant"]);
  const hero = d.localHero;
  hero.player.health = hero.player.maxHealth * 0.5;
  zone(d, hero, hero.avatar.x, hero.avatar.y, 150, "physical", "heal");
  zone(d, hero, hero.avatar.x + 5000, hero.avatar.y, 150, "physical", "heal");
  const before = hero.player.health;
  rulesTick(d, hero, 0.016);
  check("Worldroot heals you for the linked zones you are not standing in", hero.player.health > before, `${hero.player.health.toFixed(0)} / ${before.toFixed(0)}`);
}

// --- B-4: construct / summon keystones ----------------------------------

section("construct / summon keystones (B-4)");
{
  const d = dungeonWith("engineer", ["Mechanic"]);
  const hero = d.localHero;
  d.summonFor(hero, hero.avatar.x + 20, hero.avatar.y, 1);
  const m = d.minions[0]!;
  m.health = m.maxHealth * 0.4;
  m.remaining = 1;
  const hpBefore = m.health;
  rulesTick(d, hero, 0.6);
  check("Auto-Repair mends a nearby construct", m.health > hpBefore, `${m.health.toFixed(0)} / ${hpBefore.toFixed(0)}`);
  check("Auto-Repair keeps it from timing out", m.remaining >= 3, `${m.remaining.toFixed(1)}`);
}
{
  const d = dungeonWith("engineer", ["Saboteur"]);
  const hero = d.localHero;
  const e = spawn(d, 300, 300);
  const before = e.health;
  rulesOnMinionDeath(d, hero, 300, 300);
  check("Chain Detonation blasts enemies by a destroyed construct", e.health < before, `${e.health.toFixed(0)} / ${before.toFixed(0)}`);
}
{
  const d = dungeonWith("engineer", ["Gunner"]);
  const hero = d.localHero;
  const e = spawn(d, hero.avatar.x + 40, hero.avatar.y);
  d.summonFor(hero, hero.avatar.x + 30, hero.avatar.y, 1);
  const nBefore = d.minions.length;
  e.health = 0;
  rulesOnKill(d, hero, e);
  check("Automated Army drops a turret on a kill by one", d.minions.length > nBefore, `${d.minions.length} vs ${nBefore}`);
}
{
  const d = dungeonWith("engineer", ["Siege Engineer"]);
  const hero = d.localHero;
  hero.avatar.vx = 0;
  hero.avatar.vy = 0;
  d.summonFor(hero, hero.avatar.x + 20, hero.avatar.y, 2);
  const e = spawn(d, hero.avatar.x + 200, hero.avatar.y);
  const before = e.health;
  rulesTick(d, hero, 0.6);
  check("Artillery Platform focuses construct fire while you hold still", e.health < before, `${e.health.toFixed(0)} / ${before.toFixed(0)}`);
}
{
  const d = dungeonWith("engineer", ["Gunner", "Siege Engineer", "Mechanic"]);
  const hero = d.localHero;
  check("the three required paths unlock engineer.mythic.the_foundry", hero.player.build.rules.has("engineer.mythic.the_foundry"));
  rulesOnUltimate(d, hero);
  check("casting the ultimate latches the persistent state", hero.ruleState.persistentMythics.has("engineer.mythic.the_foundry"));
  const nBefore = d.minions.length;
  rulesTick(d, hero, 0.6);
  check("The Foundry assembles a construct on its own", d.minions.length > nBefore, `${d.minions.length} vs ${nBefore}`);
}
{
  const d = dungeonWith("ranger", ["Beastmaster"]);
  const hero = d.localHero;
  check("alpha_companion is lit", hero.player.build.rules.has("ranger.bm.alpha_companion"));
  rulesTick(d, hero, 0.6);
  check("Alpha Companion resummons a lost companion", d.minions.length === 1, `${d.minions.length}`);
  d.minions[0]!.remaining = 4;
  rulesTick(d, hero, 0.6);
  check("Alpha Companion holds the companion permanent", d.minions[0]!.remaining > 100, `${d.minions[0]?.remaining}`);
}
{
  const d = dungeonWith("corsair", ["Pirate King"]);
  const hero = d.localHero;
  const e = spawn(d, hero.avatar.x + 40, hero.avatar.y);
  e.health = 0;
  rulesOnKill(d, hero, e);
  check("Ghost Crew keeps two deckhands crewed", d.minions.filter((mn) => mn.owner === hero.index).length === 2, `${d.minions.length}`);
}
{
  const d = dungeonWith("corsair", ["Chainmaster", "Pirate King", "Treasure Hunter"]);
  const hero = d.localHero;
  check("dread_admiral is lit", hero.player.build.rules.has("corsair.mythic.dread_admiral"));
  rulesOnUltimate(d, hero);
  const e = spawn(d, hero.avatar.x + 200, hero.avatar.y);
  const nBefore = d.minions.length;
  e.health = 0;
  rulesOnKill(d, hero, e);
  check("Dread Admiral presses a slain enemy into the crew", d.minions.length > nBefore, `${d.minions.length} vs ${nBefore}`);
}

// --- deferred effects actually execute (Cluster 8) ---------------------
//
// `delay`, `reactive` and `followUp` are the three deferred kinds the executor knows.
// `delay` always worked; the other two were authored across the roster — 34 declarations
// between them — and executed *never*: `AbilityRuntime.notify` had no callers anywhere,
// and a `followUp` window was discarded on expiry with nothing able to spend it. These
// checks exist so that cannot come back quietly, because nothing else in the suite
// noticed: the data was valid, the shapes passed `npm run roster`, and the abilities
// simply did a fraction of what they said.

section("deferred effects execute (Cluster 8)");

/** Walk an effect tree, including the nested effects of the deferred kinds. */
function walkSteps(steps: readonly EffectStep[], visit: (s: EffectStep) => void): void {
  for (const s of steps) {
    visit(s);
    if (s.kind === "delay" || s.kind === "reactive" || s.kind === "followUp") walkSteps(s.effects, visit);
    if (s.kind === "random") for (const c of s.choices) walkSteps(c.effects, visit);
    if (s.kind === "projectile" && s.projectile.onExpire) walkSteps(s.projectile.onExpire, visit);
    if ((s.kind === "consumeStatus" || s.kind === "consumeSummons") && s.then) walkSteps(s.then, visit);
  }
}

{
  // Every event a `reactive` keys on has to be one the simulation actually delivers to
  // the runtime, or the window can never close and the effects are decoration.
  const delivered = new Set<string>(REACTIVE_EVENTS);
  const orphans = new Map<string, string[]>();
  let reactives = 0;
  for (const def of ALL_CLASSES) {
    for (const ability of def.abilities) {
      walkSteps(ability.effects, (s) => {
        if (s.kind !== "reactive") return;
        reactives++;
        if (delivered.has(s.event)) return;
        const list = orphans.get(s.event) ?? [];
        list.push(ability.id);
        orphans.set(s.event, list);
      });
    }
  }
  check(
    `every authored reactive event is one the bus delivers (${reactives} reactives)`,
    orphans.size === 0,
    [...orphans].map(([e, ids]) => `${e} ← ${ids.join(", ")}`).join("; "),
  );
}

{
  // A `reactive` fires when its event arrives. Riposte is the clearest case in the
  // roster: "Take a hit in the window and you answer it instantly."
  const d = dungeonWith("duelist", ["Riposte"]);
  const hero = d.localHero;
  const riposte = hero.player.unlockedAbilities.find((a) => a.id === "duelist.riposte");
  const e = spawn(d, hero.avatar.x + 40, hero.avatar.y);
  const before = e.health;

  if (!riposte) {
    check("Riposte is unlocked", false);
  } else {
    hero.rt.castAbility(d, hero.index, riposte, { attackDamage: 100, aim: { x: e.x, y: e.y } });
    check("casting Riposte opens a reactive window", hero.rt.pending.length > 0, `${hero.rt.pending.length}`);

    d.bus.emit({ type: "damageTaken", actorId: hero.index, amount: 10, x: hero.avatar.x, y: hero.avatar.y });
    check("taking a hit inside the window answers it", e.health < before, `${before} → ${e.health}`);
    check("the answered window is spent, not left open", hero.rt.pending.length === 0, `${hero.rt.pending.length}`);

    // …and it is the hero's *own* hit that answers. Another player's damage must not
    // fire this hero's counter, or a party would riposte for each other.
    const e2 = spawn(d, hero.avatar.x + 40, hero.avatar.y);
    hero.rt.castAbility(d, hero.index, riposte, { attackDamage: 100, aim: { x: e2.x, y: e2.y } });
    const held = e2.health;
    d.bus.emit({ type: "damageTaken", actorId: hero.index + 7, amount: 10 });
    check("another hero's hit does not fire this one's counter", e2.health === held, `${held} → ${e2.health}`);
  }
}

{
  // A native `Ability.followUp` is documented as "effects available for a short window
  // after the cast, on a second press" — so the first press arms it and the second
  // spends it, cooldown notwithstanding.
  const d = dungeonWith("lancer", ["Dragoon"]);
  const hero = d.localHero;
  const lance = hero.player.unlockedAbilities.find((a) => a.followUp);
  if (!lance) {
    check("the Lancer has an ability with a follow-up window", false);
  } else {
    const e = spawn(d, hero.avatar.x + 120, hero.avatar.y);
    const input = { attackDamage: 100, aim: { x: e.x, y: e.y } };
    const first = hero.rt.castAbility(d, hero.index, lance, input);
    check(`${lance.id} casts`, first.ok, first.failure ?? "");
    check("the first press arms the follow-up window", hero.rt.followUpOpen(lance.id, d));
    check("the ability is now on cooldown", !hero.rt.ready(lance));

    const second = hero.rt.castAbility(d, hero.index, lance, input);
    check("a second press inside the window is accepted despite the cooldown", second.ok, second.failure ?? "");
    check("…and it ran the follow-up, not a fresh cast", second.fromFollowUp === true);
    check("the window is spent by the press", !hero.rt.followUpOpen(lance.id, d));

    const third = hero.rt.castAbility(d, hero.index, lance, input);
    check("a third press is refused — the combo is over", !third.ok && third.failure === "on-cooldown", third.failure ?? "ok");
  }
}

{
  // A window nobody spends is dropped when it elapses, and dropping it must not leave
  // the pending list growing for the rest of the floor.
  const d = dungeonWith("lancer", ["Dragoon"]);
  const hero = d.localHero;
  const lance = hero.player.unlockedAbilities.find((a) => a.followUp)!;
  const e = spawn(d, hero.avatar.x + 120, hero.avatar.y);
  hero.rt.castAbility(d, hero.index, lance, { attackDamage: 100, aim: { x: e.x, y: e.y } });
  const window = lance.followUp!.window;
  for (let t = 0; t < window + 1; t += 0.5) {
    d.update(0.5);
  }
  check("a follow-up window nobody presses expires and is dropped", !hero.rt.followUpOpen(lance.id, d));
}

// --- ultimate-meter generation rules are reachable (Cluster 5b) ---------
//
// A `requireTags` generation rule is matched against the tags of the **ability**, so a
// rule can be perfectly valid data and still be unfeedable — because the event it keys
// on is never produced by anything carrying that tag. Two of the roster's meters were
// exactly that, and neither `npm run roster` nor the arena could see it: the shapes are
// legal, the tag is real, and the class just charges its ultimate off one rule instead
// of two. These two cast the ability and watch the bar move.

section("ultimate-meter generation rules are feedable (Cluster 5b)");
{
  // `on: "statusApplied" [mark]`. This was `on: "hitDealt"`, and the only mark-tagged
  // ability the Assassin has that deals damage is the ultimate — so the rule could only
  // ever be fed by the very thing it pays for, which THE ULTIMATE RULE refuses.
  const d = dungeonWith("assassin", ["Shadow"]);
  const hero = d.localHero;
  const meter = hero.resources.ultimateMeter()!;
  const mark = hero.player.unlockedAbilities.find((a) => a.id === "assassin.mark_for_death");
  spawn(d, hero.avatar.x + 40, hero.avatar.y);
  meter.value = 0;
  if (!mark) {
    check("Mark for Death is unlocked", false);
  } else {
    hero.rt.castAbility(d, hero.index, mark, castInput(d, hero, mark));
    check("taking a contract out charges the Contract meter", meter.value > 0, `${meter.value}`);
  }
}
{
  // `on: "skillUse" [support]`. This was `on: "statusApplied"`, which asked for the
  // intersection of two disjoint sets: that event fires only for a hostile status on an
  // enemy, and every support-tagged thing the Bard does buffs an ally.
  const d = dungeonWith("bard", ["Maestro"]);
  const hero = d.localHero;
  const meter = hero.resources.ultimateMeter()!;
  const song = hero.player.unlockedAbilities.find(
    (a) => !a.isUltimate && a.tags.includes("support"),
  );
  meter.value = 0;
  if (!song) {
    check("the Bard has a support-tagged song", false);
  } else {
    hero.rt.castAbility(d, hero.index, song, castInput(d, hero, song));
    // 5 from the untagged `skillUse` rule, plus 2 for the song being `support`.
    check(`playing ${song.id} charges Performance at the song rate`, meter.value >= 7, `${meter.value}`);
  }
}

// --- the Lancer's two live-play bugs (Cluster 10) --------------------

section("a lane charge that has nowhere to go costs nothing");
{
  // Walls are authored on a 32-unit lattice, so a hero parked hard against one with the
  // facing pointed into it has a provably blocked lane without needing a real level probe.
  const d = dungeonWith("lancer", ["Dragoon"]);
  const hero = d.localHero;
  const a = hero.avatar;
  const meter = hero.resources.ultimateMeter()!;
  // Face the top wall from just inside it: `leapScan` clamps to `radius + WALL_PAD`, so
  // there is no room at all to travel.
  a.x = d.width / 2;
  a.y = a.radius + 1;
  a.facing = -Math.PI / 2;
  meter.value = meter.max;
  const x0 = a.x;
  const y0 = a.y;
  d.useUltimate(hero);
  check(
    "the blocked charge keeps the full meter",
    meter.value === meter.max,
    `${meter.value}/${meter.max}`,
  );
  check(
    "and does not move the hero",
    Math.hypot(a.x - x0, a.y - y0) < 1,
    `${Math.hypot(a.x - x0, a.y - y0).toFixed(1)}u`,
  );
}
{
  const d = dungeonWith("lancer", ["Dragoon"]);
  const hero = d.localHero;
  const a = hero.avatar;
  const meter = hero.resources.ultimateMeter()!;
  // The other half of the gate, and the half that matters: "no room" must never become a
  // way to refuse a charge that had room. The lane is *verified* clear by walking it
  // first rather than assumed — an earlier version of this check aimed along a wall the
  // hero was already pressed against, which is blocked too, and failed the working fix.
  let lane = -1;
  for (let k = 0; k < 32 && lane < 0; k++) {
    const ang = (k / 32) * Math.PI * 2;
    let clear = true;
    for (let t = 20; t <= 200; t += 12) {
      if (circleHitsWall(d.level, a.x + Math.cos(ang) * t, a.y + Math.sin(ang) * t, a.radius)) {
        clear = false;
        break;
      }
    }
    if (clear) lane = ang;
  }
  if (lane < 0) {
    check("the spawn has a clear 200u lane to test", false);
  } else {
    a.facing = lane;
    meter.value = meter.max;
    const x0 = a.x;
    const y0 = a.y;
    d.useUltimate(hero);
    check("a clear lane still spends the meter", meter.value === 0, `${meter.value}`);
    check(
      "and still charges down the lane",
      Math.hypot(a.x - x0, a.y - y0) > 100,
      `${Math.hypot(a.x - x0, a.y - y0).toFixed(0)}u`,
    );
  }
}

section("a stationary Lancer can always still act");
{
  const d = dungeonWith("lancer", ["Dragoon"]);
  const hero = d.localHero;
  const mom = hero.resources.get("momentum")!;
  mom.value = mom.max;
  // Fifteen seconds of standing still. Momentum decays 12/s after a 1.5 s grace, so
  // without a floor this bottoms out at zero in 9.7 s and every skill the class has
  // becomes unpayable — which is what the owner reported as "the first press does nothing".
  for (let i = 0; i < 15 * 60; i++) mom.tick(1 / 60);
  const floor = mom.spec.decayFloor ?? 0;
  check("momentum decays to its floor, not to zero", mom.value >= floor && floor > 0, `${mom.value} (floor ${floor})`);
  const payable = hero.player.unlockedAbilities.filter((ab) =>
    (ab.costs ?? []).some((c) => c.resource === "momentum" && c.amount <= mom.value),
  );
  check("at least one momentum skill is still payable", payable.length >= 1, `${payable.length} of the class's momentum skills`);
  const spenders = hero.player.unlockedAbilities.filter((ab) =>
    (ab.costs ?? []).some((c) => c.resource === "momentum" && c.amount > mom.value),
  );
  check("but the big spenders still need you to move", spenders.length >= 1, `${spenders.length} priced above the floor`);
}

console.log(failures === 0 ? "\nALL RULE CHECKS PASSED" : `\n${failures} RULE CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
