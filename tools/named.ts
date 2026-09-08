/**
 * Named-item acceptance test — UAT §28 / §29.
 *
 * §28's own test for "done" is that a developer adds ONE data entry and the item shows
 * up everywhere, correctly, with its behaviour live. The claims worth pinning are the
 * ones a bad entry would break silently:
 *
 *   1. every definition is well-formed as data, and no two share an id
 *   2. every reference resolves against the live roster — grant ids, mutation targets,
 *      status ids, the events a passive keys on, the boss/chest/mode a source names
 *   3. rules stay in their namespace: a named item may not flip a class's keystone
 *   4. art either exists in the atlas (row + PNG) or is on the documented fallback
 *   5. a forged copy is an ordinary Item — its power reaches the sheet through the one
 *      `Mods` path everything else uses, and its behaviour reaches the build through the
 *      same fold a tree node uses; a copy with ranges is never identical twice
 *   6. it survives a save round-trip and the co-op wire, and a retired id degrades to
 *      ordinary gear rather than a crash
 *   7. acquisition is the table and nothing else — every source kind pays out when the
 *      dice say so, the danger hook is monotone and capped, a recipe spends exactly itself
 *   8. it works in the live sim: a passive fires, a mutation rewrites, a reforge keeps
 *      the item's identity
 *
 * Headless, no browser. Run with `npm run named`.
 */

import { existsSync } from "node:fs";
import type { EffectStep } from "../src/combat/ability";
import { getStatusSpec } from "../src/combat/status";
import { SKILL_TAGS } from "../src/combat/tags";
import type { CombatEventType } from "../src/combat/triggers";
import { Rng } from "../src/core/rng";
import { parseSaved, serializeSave } from "../src/core/save";
import { BOSSES } from "../src/data/bosses";
import { CHEST_TIERS } from "../src/data/chests";
import { MOD_KEYS, type ModKey } from "../src/data/mods";
import { delveConfig } from "../src/data/modes";
import {
  NAMED_BY_ID, NAMED_ITEMS, NAMED_RULE_PREFIX, craftRecipeFor, craftableNamed, namedDropChance,
  namedForSource, namedProblems, namedSourceLines, rollNamedDrops, type NamedDropQuery,
} from "../src/data/named";
import { CLASS_IDS } from "../src/data/classes";
import { legendBossSpec } from "../src/data/legends";
import { PLANETS } from "../src/data/planets";
import type { Action, AvatarInput } from "../src/core/input";
import { REACTIVE_EVENTS } from "../src/game/abilities";
import { Dungeon, type Hero } from "../src/game/dungeon";
import type { Enemy } from "../src/game/entities";
import { forgeNamedItem, itemMods, itemScore, reforgeAffixes, rollItem } from "../src/game/item";
import { GameState, playerFromJSON, playerToJSON, sellPrice } from "../src/game/state";
import { ABILITY_BY_ID, ALL_CLASSES, mutationMatches } from "../src/progression/index";
import { ATLAS } from "../src/render/atlas/manifest";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

/** The first damage template an ability carries — on a damage, projectile or zone step. */
function firstDamage(a: { effects: readonly EffectStep[] }): { base: number; type: string } | null {
  for (const s of walk(a.effects)) {
    if (s.kind === "damage") return s.damage;
    if (s.kind === "projectile") return s.projectile.damage;
    if (s.kind === "zone" && s.zone.damage) return s.zone.damage;
  }
  return null;
}

/** Every effect step in a list, nested branches included. */
function* walk(steps: readonly EffectStep[]): Iterable<EffectStep> {
  for (const s of steps) {
    yield s;
    switch (s.kind) {
      case "projectile": if (s.projectile.onExpire) yield* walk(s.projectile.onExpire); break;
      case "delay": case "reactive": case "followUp": yield* walk(s.effects); break;
      case "consumeStatus": case "consumeSummons": if (s.then) yield* walk(s.then); break;
      case "random": for (const c of s.choices) yield* walk(c.effects); break;
      default: break;
    }
  }
}

const ALL_ABILITIES = ALL_CLASSES.flatMap((c) => c.abilities);
/** The events the simulation actually broadcasts on the bus, so a passive keyed on one can fire. */
const EMITTED_EVENTS = new Set<CombatEventType>([...REACTIVE_EVENTS, "enemyDeath"]);

// =========================================================================
section("1. the registry is well-formed");
{
  check(`there are named items to test`, NAMED_ITEMS.length >= 6, `${NAMED_ITEMS.length} definitions`);
  const ids = NAMED_ITEMS.map((d) => d.id);
  check("every id is unique", new Set(ids).size === ids.length);
  const names = NAMED_ITEMS.map((d) => d.name);
  check("every display name is unique", new Set(names).size === names.length);
  for (const def of NAMED_ITEMS) {
    const problems = namedProblems(def);
    check(`${def.id}: well-formed as data`, problems.length === 0, problems.join("; "));
  }
  const kinds = new Set(NAMED_ITEMS.flatMap((d) => d.sources.map((s) => s.kind)));
  check("every acquisition kind has at least one item proving it",
    ["boss", "chest", "clearCache", "worldDrop", "craft"].every((k) => kinds.has(k as never)),
    [...kinds].join(", "));
  const tiers = {
    stat: NAMED_ITEMS.filter((d) => !d.effects?.length && !d.grant && !d.trigger).length,
    grant: NAMED_ITEMS.filter((d) => d.grant).length,
    passive: NAMED_ITEMS.filter((d) => d.effects?.some((e) => e.kind === "grantEffect")).length,
    mutation: NAMED_ITEMS.filter((d) => d.effects?.some((e) => e.kind === "mutate")).length,
  };
  check("the §29 tiers are each represented — pure stat, granted skill, passive, skill mutation",
    tiers.stat > 0 && tiers.grant > 0 && tiers.passive > 0 && tiers.mutation > 0,
    JSON.stringify(tiers));
  check("every boss-exclusive rolls at least one random affix, so a second kill can roll a better copy (§15)",
    NAMED_ITEMS.filter((d) => d.sources.some((s) => s.kind === "boss")).every((d) => (d.randomMods ?? 0) >= 1));
}

// =========================================================================
section("2. every reference resolves against the live roster");
{
  for (const def of NAMED_ITEMS) {
    if (def.grant) check(`${def.id}: granted ability "${def.grant}" exists`, def.grant in ABILITY_BY_ID);
    for (const eff of def.effects ?? []) {
      if (eff.kind === "mutate") {
        const t = eff.mutation.target;
        if (t.abilityId) check(`${def.id}: mutation targets a real ability`, t.abilityId in ABILITY_BY_ID, t.abilityId);
        if (t.withTag) check(`${def.id}: mutation tag "${t.withTag}" is a registered tag`, (SKILL_TAGS as readonly string[]).includes(t.withTag));
        const hits = ALL_ABILITIES.filter((a) => mutationMatches(eff.mutation, a)).length;
        check(`${def.id}: mutation "${eff.mutation.id}" matches at least one ability in the roster`, hits > 0, `${hits} abilities`);
      }
      if (eff.kind === "grantEffect") {
        if (eff.on.event) {
          check(`${def.id}: passive keys on an event the sim emits ("${eff.on.event}")`, EMITTED_EVENTS.has(eff.on.event));
        }
        if (eff.on.tag) check(`${def.id}: passive tag "${eff.on.tag}" is registered`, (SKILL_TAGS as readonly string[]).includes(eff.on.tag));
        for (const step of walk(eff.effects)) {
          if (step.kind === "status") check(`${def.id}: status "${step.status}" exists`, !!getStatusSpec(step.status));
          if (step.kind === "zone" && step.zone.status) check(`${def.id}: zone status "${step.zone.status.id}" exists`, !!getStatusSpec(step.zone.status.id));
          if ((step.kind === "damage" || step.kind === "projectile") ) {
            const dmg = step.kind === "damage" ? step.damage : step.projectile.damage;
            if (dmg.inflict) check(`${def.id}: inflicted status "${dmg.inflict.status}" exists`, !!getStatusSpec(dmg.inflict.status));
          }
        }
      }
      if (eff.kind === "resourceRule") {
        const known = ALL_CLASSES.some((c) => c.resources.some((r) => r.id === eff.resource));
        check(`${def.id}: resource "${eff.resource}" belongs to some class`, known);
      }
    }
    for (const src of def.sources) {
      if (src.kind === "boss") {
        // Three kinds of encounter can carry an exclusive now: an authored one, a
        // Reliquary sector's reskin (`planet-<id>`), and a class's Proving
        // (`legend-<classId>`, generated per class by `data/legends.ts`).
        const real = BOSSES.some((b) => b.id === src.bossId)
          || PLANETS.some((p) => `planet-${p.id}` === src.bossId)
          || CLASS_IDS.some((id) => legendBossSpec(id).id === src.bossId);
        check(`${def.id}: boss source "${src.bossId}" is a real encounter`, real);
      }
      if (src.kind === "chest") check(`${def.id}: chest tier "${src.tier}" exists`, (CHEST_TIERS as readonly string[]).includes(src.tier));
    }
    for (const m of def.mods) check(`${def.id}: mod key "${m.key}" is a Mods key`, (MOD_KEYS as readonly string[]).includes(m.key));
  }
}

// =========================================================================
section("3. rules stay in the named namespace");
{
  const classRuleIds = new Set<string>();
  for (const c of ALL_CLASSES) {
    for (const path of c.progression.paths) for (const n of path.nodes) for (const e of n.effects) if (e.kind === "rule") classRuleIds.add(e.rule);
    for (const u of c.unlocks) for (const e of u.effects) if (e.kind === "rule") classRuleIds.add(e.rule);
  }
  let rules = 0;
  for (const def of NAMED_ITEMS) {
    for (const eff of def.effects ?? []) {
      if (eff.kind !== "rule") continue;
      rules++;
      check(`${def.id}: rule "${eff.rule}" is namespaced ${NAMED_RULE_PREFIX}${def.id}.*`,
        eff.rule.startsWith(`${NAMED_RULE_PREFIX}${def.id}.`));
      check(`${def.id}: rule "${eff.rule}" is not a class's keystone`, !classRuleIds.has(eff.rule));
    }
    for (const eff of def.effects ?? []) {
      if (eff.kind === "mutate") {
        check(`${def.id}: mutation id is namespaced`, eff.mutation.id.startsWith(`${NAMED_RULE_PREFIX}${def.id}.`), eff.mutation.id);
      }
    }
  }
  check("no named item flips any of the roster's class rules (v1 — cross-class keystone theft is deferred)",
    NAMED_ITEMS.every((d) => (d.effects ?? []).every((e) => e.kind !== "rule" || !classRuleIds.has(e.rule))),
    `${rules} named rule(s), ${classRuleIds.size} class rules guarded`);
}

// =========================================================================
section("4. art exists or falls back, never crashes");
{
  for (const def of NAMED_ITEMS) {
    if (!def.art) { check(`${def.id}: no art id — draws as its type`, true); continue; }
    const row = ATLAS[def.art];
    const png = existsSync(`src/render/atlas/items/named/${def.art}.png`);
    if (row) {
      check(`${def.id}: art "${def.art}" has a manifest row AND a PNG on disk`, png);
    } else {
      check(`${def.id}: art "${def.art}" has no manifest row — on the documented fallback (type icon tinted by rarity)`, !png,
        png ? "a PNG exists with no manifest row: add the row or it will never load" : "");
    }
    check(`${def.id}: art id follows the named.<id> convention`, def.art === `named.${def.id}`, def.art);
  }
}

// =========================================================================
section("5. a forged copy is an ordinary Item on the one Mods path");
{
  const rng = new Rng(0xbeef);
  for (const def of NAMED_ITEMS) {
    const item = forgeNamedItem(def, 10, rng);
    check(`${def.id}: forges as itself`, item.named === def.id && item.name === def.name && item.rarity === def.rarity && item.type === def.type);
    const fixed = new Set(def.mods.map((m) => m.key));
    check(`${def.id}: every fixed affix is on the item`, def.mods.every((m) => item.mods.some((im) => im.key === m.key)));
    check(`${def.id}: affix count is fixed + at most randomMods`,
      item.mods.length >= def.mods.length && item.mods.length <= def.mods.length + (def.randomMods ?? 0),
      `${item.mods.length} of ${def.mods.length}+${def.randomMods ?? 0}`);
    check(`${def.id}: a random affix never stacks onto a fixed key`,
      item.mods.filter((m) => fixed.has(m.key)).length === fixed.size);
    check(`${def.id}: item level respects minIlvl`, item.ilvl >= (def.minIlvl ?? 1));
    const mods = itemMods(item);
    check(`${def.id}: itemMods carries every fixed key through the Mods record`,
      def.mods.every((m) => (mods[m.key] ?? 0) !== 0));
    check(`${def.id}: grant and trigger come from the definition`,
      item.grant === (def.grant ?? null) && JSON.stringify(item.trigger) === JSON.stringify(def.trigger ?? null));
    check(`${def.id}: sells for something, scores above nothing`, sellPrice(item) > 0 && itemScore(item) > 0);

    // Variance: a definition with a range or random extras must not forge identical twins.
    const varies = def.mods.some((m) => Array.isArray(m.value)) || (def.randomMods ?? 0) > 0;
    if (varies) {
      const sigs = new Set<string>();
      for (let i = 0; i < 24; i++) sigs.add(JSON.stringify(forgeNamedItem(def, 10, rng).mods));
      check(`${def.id}: copies differ (${sigs.size} distinct of 24)`, sigs.size > 1);
    }
  }

  // The sheet: equipping adds exactly the item's mods and nothing else to Player.mods.
  const state = new GameState(1);
  state.chooseClass("swordsman");
  state.player.level = 30;
  state.player.refresh();
  const before = { ...state.player.mods };
  const seal = forgeNamedItem(NAMED_BY_ID["the-first-seal"]!, 30, rng);
  state.player.equip(seal);
  const after = state.player.mods;
  const expected = itemMods(seal);
  const exact = (MOD_KEYS as readonly ModKey[]).every((k) => Math.abs((after[k] - before[k]) - (expected[k] ?? 0)) < 1e-6);
  check("equipping a named item moves Player.mods by exactly itemMods(item) — no side channel", exact);

  // The build: behaviour arrives through the same fold a tree node uses.
  const grantsBefore = state.player.build.grants.length;
  check("its passive is in build.grants, marked as gear", state.player.build.grants.some((g) => g.from === "gear"));
  state.player.unequip("shield");
  check("...and leaves with the item", state.player.build.grants.length === grantsBefore - 1);

  const word = forgeNamedItem(NAMED_BY_ID["the-early-word"]!, 30, rng);
  state.player.equip(word);
  const fire = ALL_ABILITIES.find((a) => a.tags.includes("fire") && firstDamage(a))!;
  const base = firstDamage(fire)!;
  const mutated = firstDamage(state.player.resolvedAbility(fire))!;
  check("a mutation on the item rewrites a matching ability through applyBuild",
    Math.abs(mutated.base - base.base * 1.25) < 1e-6, `${fire.id}: ${base.base} -> ${mutated.base}`);
  check("the granted skill is on the bar", state.player.grantedAbilityId === "alchemist.volatile_flask"
    && state.player.activeAbilities.some((a) => a?.id === "alchemist.volatile_flask"));
  check("...and the mutation reaches the granted skill too",
    firstDamage(state.player.resolvedAbility(ABILITY_BY_ID["alchemist.volatile_flask"]!))!.base
      > firstDamage(ABILITY_BY_ID["alchemist.volatile_flask"]!)!.base);
  state.player.unequip("weapon");
  check("unequipping takes the mutation away again", firstDamage(state.player.resolvedAbility(fire))!.base === base.base);
}

// =========================================================================
section("6. save, wire, and a retired id");
{
  const rng = new Rng(7);
  const state = new GameState(2);
  state.chooseClass("magician");
  state.player.level = 40;
  state.player.refresh();
  const idol = forgeNamedItem(NAMED_BY_ID["choristers-idol"]!, 25, rng);
  const ledger = forgeNamedItem(NAMED_BY_ID["keepers-ledger"]!, 25, rng);
  state.player.equip(idol);
  state.addToInventory([ledger]);
  state.noteNamed(idol.named!);
  state.noteNamed(ledger.named!);

  const saved = parseSaved(serializeSave(state.toJSON()));
  const back = GameState.fromSaved(saved);
  check("a worn named item survives a save round-trip", back.players.magician.equipment.weapon?.named === "choristers-idol");
  check("a stashed one does too", back.inventory.some((it) => it.named === "keepers-ledger"));
  check("its baked affixes came back byte-for-byte",
    JSON.stringify(back.players.magician.equipment.weapon?.mods) === JSON.stringify(idol.mods));
  check("the records remember it", back.stats.namedFound["choristers-idol"] === 1 && back.stats.namedFound["keepers-ledger"] === 1);
  check("the loaded character's build carries the passive", back.players.magician.build.grants.some((g) => g.from === "gear"));

  // The co-op wire is the same blob (`playerToJSON` does double duty).
  const remote = playerFromJSON("magician", JSON.parse(JSON.stringify(playerToJSON(state.player))));
  check("the def id crosses the co-op wire", remote.equipment.weapon?.named === "choristers-idol");
  check("...and the host rebuilds the same behaviour from it",
    remote.build.grants.filter((g) => g.from === "gear").length === state.player.build.grants.filter((g) => g.from === "gear").length);

  // A retired definition: the copy keeps its stats and stops being named.
  const retired = { ...ledger, id: "i-retired-copy", named: "an-item-that-no-longer-exists" };
  state.inventory.push(retired as typeof ledger);
  const back2 = GameState.fromSaved(parseSaved(serializeSave(state.toJSON())));
  const ghost = back2.inventory.find((it) => it.id === retired.id);
  check("a retired named id loads as ordinary gear rather than crashing", !!ghost && ghost.named === null);
  check("...with every baked stat and affix intact", !!ghost && JSON.stringify(ghost.mods) === JSON.stringify(ledger.mods)
    && JSON.stringify(ghost.stats) === JSON.stringify(ledger.stats));

  // Pre-v17 items never had the field at all.
  const old = rollItem({ rarity: "epic", type: "ring", ilvl: 5, rng });
  delete (old as { named?: unknown }).named;
  state.inventory.push(old);
  const back3 = GameState.fromSaved(parseSaved(serializeSave(state.toJSON())));
  check("an item from before named items existed loads with named: null", back3.inventory.find((it) => it.id === old.id)?.named === null);
}

// =========================================================================
section("7. acquisition is the table, and only the table");
{
  const always = { chance: () => true };
  const never = { chance: () => false };
  for (const def of NAMED_ITEMS) {
    for (const src of def.sources) {
      if (src.kind === "craft") continue;
      const q: NamedDropQuery = src.kind === "boss" ? { kind: "boss", bossId: src.bossId }
        : src.kind === "chest" ? { kind: "chest", tier: src.tier }
        : src.kind === "clearCache" ? { kind: "clearCache", depth: src.minDepth, mode: src.mode ?? "delve" }
        : { kind: "worldDrop", depth: src.minDepth, elite: false };
      check(`${def.id}: its ${src.kind} source pays out when the dice say so`, rollNamedDrops(q, always).includes(def));
      check(`${def.id}: ...and never when they don't`, !rollNamedDrops(q, never).includes(def));
      check(`${def.id}: namedForSource previews it for that source`, namedForSource(q).includes(def));
      if (src.kind === "clearCache" || src.kind === "worldDrop") {
        const shallow = { ...q, depth: src.minDepth - 1 } as NamedDropQuery;
        check(`${def.id}: not one floor shallower than minDepth`, !rollNamedDrops(shallow, always).includes(def));
      }
    }
  }
  check("a boss nobody authored an item for previews nothing",
    namedForSource({ kind: "boss", bossId: "no-such-boss" }).length === 0);
  check("the danger hook is monotone", namedDropChance(0.1, 1) < namedDropChance(0.1, 4) && namedDropChance(0.1, 4) < namedDropChance(0.1, 16));
  check("...starts at exactly the base at danger 1", namedDropChance(0.1, 1) === 0.1);
  check("...and is capped", namedDropChance(0.1, 1e9) <= 0.25 + 1e-9 && namedDropChance(0.9, 1e9) <= 1);
  check("every source line reads as a sentence", NAMED_ITEMS.every((d) => namedSourceLines(d).every((l) => l.length > 10)));

  // A recipe spends exactly itself.
  const state = new GameState(3);
  state.chooseClass("paladin");
  const brand = craftableNamed()[0]!;
  const recipe = craftRecipeFor(brand)!;
  check("crafting refuses when the bill can't be paid", state.craftNamed(brand.id) === null && !state.canAffordNamed(brand.id));
  for (const [e, n] of Object.entries(recipe.materials) as [keyof typeof state.materials, number][]) state.materials[e] = n + 5;
  state.coins = recipe.coins + 7;
  check("...nor when only the stash components are missing", state.craftNamed(brand.id) === null);
  // The recipe's item lines (UAT §24, docs/forge.md): fill each with the cheapest legal
  // item, plus one spare per line that must survive.
  const spares: string[] = [];
  for (const req of recipe.items ?? []) {
    for (let i = 0; i < req.count + 1; i++) {
      const rolled = req.named
        ? forgeNamedItem(NAMED_BY_ID[req.named]!, 10, new Rng(900 + i))
        : rollItem({ rarity: req.minRarity ?? "common", type: req.type ?? (req.slot === "weapon" ? "sword" : req.slot ?? "ring"), ilvl: 10, rng: new Rng(950 + i) });
      // The spare is priced out of reach: components are taken cheapest-first, so it must survive.
      const comp = i === req.count ? { ...rolled, value: 1_000_000_000 } : rolled;
      state.inventory.push(comp);
      if (i === req.count) spares.push(comp.id);
    }
  }
  const stashBefore = state.inventory.length;
  const made = state.craftNamed(brand.id);
  check("crafting a named recipe forges that item", made?.named === brand.id);
  check("...and spends exactly the recipe",
    state.coins === 7 && (Object.entries(recipe.materials) as [keyof typeof state.materials, number][]).every(([e]) => state.materials[e] === 5));
  const eaten = (recipe.items ?? []).reduce((n, r) => n + r.count, 0);
  check("...consuming exactly the listed components and leaving the spares",
    state.inventory.length === stashBefore - eaten + 1 && spares.every((id) => state.inventory.some((it) => it.id === id)), `${eaten} component(s)`);
  check("...into the stash", state.inventory.some((it) => it.id === made?.id));
  check("an id with no recipe is refused", state.craftNamed("the-first-seal") === null && state.craftNamed("nope") === null);
}

// =========================================================================
section("8. live: passives fire, mutations rewrite, reforge keeps identity");
{
  const rng = new Rng(11);
  const state = new GameState(4);
  state.chooseClass("swordsman");
  state.player.level = 40;
  state.player.refresh();
  state.player.autoSlotNewAbilities();
  state.player.equip(forgeNamedItem(NAMED_BY_ID["choristers-idol"]!, 30, rng));
  state.player.equip(forgeNamedItem(NAMED_BY_ID["gluttons-grasp"]!, 30, rng));
  state.player.equip(forgeNamedItem(NAMED_BY_ID["the-first-seal"]!, 30, rng));
  state.player.fullHeal();
  const d = new Dungeon(state, delveConfig(8), 77);
  const hero = d.localHero;

  const projectilesBefore = d.projectiles.length;
  d.bus.emit({ type: "skillUse", actorId: hero.index, x: hero.avatar.x, y: hero.avatar.y, tags: [] });
  check("Chorister's Idol: casting a skill fires two void bolts", d.projectiles.length === projectilesBefore + 2,
    `${projectilesBefore} -> ${d.projectiles.length}`);
  check("...owned by the hero, of the void", d.projectiles.slice(-2).every((p) => p.friendly && p.element === "void"));

  hero.player.health = Math.round(hero.player.maxHealth / 2);
  const half = hero.player.health;
  d.bus.emit({ type: "kill", actorId: hero.index, x: hero.avatar.x, y: hero.avatar.y });
  check("Glutton's Grasp: a kill heals", hero.player.health > half, `${half} -> ${hero.player.health}`);

  const wardBefore = hero.ward;
  d.bus.emit({ type: "damageTaken", actorId: hero.index, amount: 10, x: hero.avatar.x, y: hero.avatar.y });
  check("The First Seal: taking damage raises a ward", hero.ward > wardBefore, `${wardBefore} -> ${hero.ward}`);

  // A stranger's events fire nothing — the passive belongs to this hero.
  const hp = hero.player.health;
  d.bus.emit({ type: "kill", actorId: hero.index + 7, x: hero.avatar.x, y: hero.avatar.y });
  check("...and none of it fires for somebody else's event", hero.player.health === hp);

  // Threshold Brand turns melee skills holy, through applyBuild.
  state.player.equip(forgeNamedItem(NAMED_BY_ID["threshold-brand"]!, 30, rng));
  const melee = ALL_CLASSES.find((c) => c.classId === "swordsman")!.abilities
    .find((a) => a.tags.includes("melee") && firstDamage(a) && firstDamage(a)!.type !== "holy")!;
  const holy = firstDamage(state.player.resolvedAbility(melee));
  check("Threshold Brand: a melee skill strikes as holy", holy?.type === "holy", `${melee.id}: ${firstDamage(melee)!.type} -> ${holy?.type}`);

  // Reforge re-rolls the ranges and keeps the identity.
  const brand = state.player.equipment.weapon!;
  const again = reforgeAffixes(brand, rng);
  check("reforging a named item keeps its id, name and every fixed affix key",
    again.named === brand.named && again.name === brand.name
    && NAMED_BY_ID[brand.named!]!.mods.every((m) => again.mods.some((am) => am.key === m.key)));
  check("...never decorates the name with a prefix or suffix", again.name === NAMED_BY_ID[brand.named!]!.name);
  const withRanges = forgeNamedItem(NAMED_BY_ID["a-name-withheld"]!, 30, rng);
  let changed = false;
  for (let i = 0; i < 12 && !changed; i++) changed = JSON.stringify(reforgeAffixes(withRanges, rng).mods) !== JSON.stringify(withRanges.mods);
  check("...and actually re-rolls a copy that has ranges", changed);
}

// =========================================================================
section("9. live: the drop sites really read the table");
{
  // The table is proven above; this proves the three lines of wiring that call it. The
  // dungeon's own rng is swapped for one whose `chance` always says yes, so the check is
  // about *whether the site asks*, not about odds — and it is deterministic.
  class IdleInput implements AvatarInput {
    moveVector() { return { x: 0, y: 0 }; }
    wasPressed(_a: Action) { return false; }
    aimAngle() { return null; }
  }
  const IDLE = new IdleInput();
  type Priv = {
    rng: Rng;
    killEnemy(e: Enemy, source: Hero, fromUltimate?: boolean): void;
    dropClearCache(): void;
  };
  const rig = (d: Dungeon) => {
    const priv = d as unknown as Priv;
    const real = priv.rng;
    priv.rng = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === "chance") return () => true;
        const v = Reflect.get(target, prop, receiver);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    return priv;
  };
  const namedOnFloor = (d: Dungeon) => d.pickups.filter((p) => p.kind === "item" && p.item?.named).map((p) => p.item!.named!);

  // A boss kill asks the boss table with the encounter's own id.
  const bossState = new GameState(21);
  bossState.chooseClass("swordsman");
  bossState.player.level = 30; bossState.player.refresh(); bossState.player.fullHeal();
  const bossFloor = new Dungeon(bossState, delveConfig(5), 501);
  for (let t = 0; t < 900 && !bossFloor.boss; t++) bossFloor.update(1 / 60, IDLE);
  check("a depth-5 floor spawns its boss", !!bossFloor.boss, bossFloor.boss?.boss?.spec.id ?? "none");
  if (bossFloor.boss) {
    const spec = bossFloor.boss.boss!.spec.id;
    const wanted = namedForSource({ kind: "boss", bossId: spec }).map((d) => d.id);
    const priv = rig(bossFloor);
    priv.killEnemy(bossFloor.boss, bossFloor.localHero);
    const dropped = namedOnFloor(bossFloor);
    check(`killing ${spec} drops its named item(s) [${wanted.join(", ")}]`,
      wanted.length > 0 && wanted.every((id) => dropped.includes(id)), dropped.join(", ") || "nothing named");
    check("...and books it in the records for the local hero",
      wanted.every((id) => (bossState.stats.namedFound[id] ?? 0) >= 1));
    check("...at an item level no lower than the definition's floor",
      bossFloor.pickups.filter((p) => p.item?.named).every((p) => p.item!.ilvl >= (NAMED_BY_ID[p.item!.named!]?.minIlvl ?? 1)));
  }

  // A wave monster asks the world table at the floor's depth.
  const deepState = new GameState(22);
  deepState.chooseClass("swordsman");
  deepState.player.level = 40; deepState.player.refresh(); deepState.player.fullHeal();
  const deep = new Dungeon(deepState, delveConfig(12), 502);
  for (let t = 0; t < 600 && !deep.enemies.some((e) => e.fromWave && !e.summoned); t++) deep.update(1 / 60, IDLE);
  const grunt = deep.enemies.find((e) => e.fromWave && !e.summoned);
  check("a depth-12 floor spawns a wave monster", !!grunt);
  if (grunt) {
    const wanted = namedForSource({ kind: "worldDrop", depth: 12, elite: false }).map((d) => d.id);
    rig(deep).killEnemy(grunt, deep.localHero);
    const dropped = namedOnFloor(deep);
    check(`a wave kill at depth 12 drops the world-drop item(s) [${wanted.join(", ")}]`,
      wanted.length > 0 && wanted.every((id) => dropped.includes(id)), dropped.join(", ") || "nothing named");
  }
  // ...but a summon or a shard never does, exactly like the kill quota.
  const shallow = new Dungeon(deepState, delveConfig(12), 503);
  for (let t = 0; t < 600 && !shallow.enemies.some((e) => e.fromWave && !e.summoned); t++) shallow.update(1 / 60, IDLE);
  const pet = shallow.enemies.find((e) => e.fromWave && !e.summoned);
  if (pet) {
    (pet as { summoned: boolean }).summoned = true;
    rig(shallow).killEnemy(pet, shallow.localHero);
    check("a summoned monster's death never rolls the world table", namedOnFloor(shallow).length === 0);
  }

  // The clear cache asks the clear-cache table with the floor's depth and mode.
  const cacheState = new GameState(23);
  cacheState.chooseClass("swordsman");
  const cacheFloor = new Dungeon(cacheState, delveConfig(6), 504);
  const wantedCache = namedForSource({ kind: "clearCache", depth: 6, mode: "delve" }).map((d) => d.id);
  rig(cacheFloor).dropClearCache();
  const cached = namedOnFloor(cacheFloor);
  check(`the depth-6 clear cache holds its named item(s) [${wantedCache.join(", ")}]`,
    wantedCache.length > 0 && wantedCache.every((id) => cached.includes(id)), cached.join(", ") || "nothing named");
  const tooShallow = new Dungeon(cacheState, delveConfig(3), 505);
  rig(tooShallow).dropClearCache();
  check("...and a depth-3 cache holds none, per the table's minDepth", namedOnFloor(tooShallow).length === 0);

  // A chest pull asks the chest table alongside the ordinary roll, never instead of it.
  const chestState = new GameState(24);
  chestState.chooseClass("swordsman");
  const chestPriv = chestState as unknown as { rng: Rng };
  const realRng = chestPriv.rng;
  chestPriv.rng = new Proxy(realRng, {
    get(target, prop, receiver) {
      if (prop === "chance") return () => true;
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  chestState.keys.Legendary = 1;
  const found = chestState.openChests("Legendary", 1);
  check("a Legendary chest pull can pay out its named item", found.some((it) => it.named === "keepers-ledger"), found.map((it) => it.name).join(", "));
  check("...alongside the ordinary pull, never replacing it", found.length === 2 && found.some((it) => !it.named));
  chestState.keys.Basic = 1;
  check("a Basic chest, with no table entry, pays out nothing named", chestState.openChests("Basic", 1).every((it) => !it.named));
}

console.log(`\n${failures === 0 ? "ALL NAMED-ITEM CHECKS PASSED" : `${failures} NAMED-ITEM CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
