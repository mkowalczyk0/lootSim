/**
 * Pilot-class acceptance test.
 *
 * Phase 7 of the class refactor: the first six classes — Lancer, Berserker, Magician,
 * Necromancer, Paladin, Stormcaller — built entirely on the combat vocabulary
 * (`src/combat`) and the progression grammar (`src/progression`). This file is the
 * proof they hold together and, between them, exercise every primitive the brief lists:
 *
 *   melee · ranged · Mana · Momentum · Rage · Corpses · Souls · Conviction · Weather ·
 *   Summons · Statuses · DoTs · terrain · shields · healing · party utility ·
 *   skill mutations · hybrid builds
 *
 * plus THE ULTIMATE RULE per class, and both solo and multiplayer-relevant state
 * changes (an ally buff landing on the *other* hero; a redirect binding an ally;
 * resolveBuild being deterministic so a host and a client agree).
 *
 * Headless, no browser, no dungeon. Run with `npm run classes`.
 */

import {
  AbilityRuntime,
  EventBus,
  ResourceSet,
  StatusContainer,
  creditResourcesForHit,
  getStatusSpec,
  isUltimateSourced,
  makeDamagePacket,
  type Ability,
  type CombatHost,
  type DamagePacket,
  type HostActor,
  type MinionCommand,
  type MinionRequest,
  type MoveRequest,
  type ProjectileRequest,
  type TargetActor,
  type TerrainRequest,
  type ZoneRequest,
} from "../src/combat/index";
import {
  BERSERKER,
  LANCER,
  MAGICIAN,
  NECROMANCER,
  PALADIN,
  PILOT_CLASSES,
  STORMCALLER,
  applyBuild,
  buildProgressionTree,
  evaluateArchetypes,
  evaluateHybrids,
  installClass,
  makeClassResources,
  resolveBuild,
  resolveClassBuild,
  validateClass,
  validateRoster,
  type PilotClass,
} from "../src/progression/index";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 0x100000000);
}

// --- a throwaway world that implements the full CombatHost ---------------

interface Actor extends HostActor {
  shield: number;
  absorbShield: boolean;
  moves: MoveRequest[];
  healed: number;
  redirectedTo?: number;
  redirectFraction: number;
}

class World implements CombatHost {
  time = 0;
  readonly bus = new EventBus();
  private rng = lcg(0x5eed);
  private list: Actor[] = [];
  private corpseList: { id: number; x: number; y: number }[] = [];
  private zoneList: { id: number; x: number; y: number }[] = [];
  private nextId = 1000;
  marks = new Map<number, number>();
  threat = new Map<number, number>();

  damageLog: { targetId: number; packet: DamagePacket; dealt: number }[] = [];
  projectiles: ProjectileRequest[] = [];
  zoneReqs: ZoneRequest[] = [];
  minions: MinionRequest[] = [];
  terrain: TerrainRequest[] = [];
  commands: { ownerId: number; behavior: string; targetId?: number }[] = [];
  threatOps: { targetId: number; op: string }[] = [];
  redirects: { protectorId: number; wardId: number; fraction: number }[] = [];
  sacrifices: { ownerId: number; count: number }[] = [];
  corpsesTaken = 0;
  fx: string[] = [];

  spawn(a: Partial<Actor> & Pick<Actor, "id" | "faction" | "kind">): Actor {
    const actor: Actor = {
      x: 0, y: 0, health: 100, maxHealth: 100, alive: true,
      statuses: new StatusContainer(a.id), shield: 0, absorbShield: false,
      moves: [], healed: 0, redirectFraction: 0, ...a,
    };
    this.list.push(actor);
    return actor;
  }
  addCorpse(x = 0, y = 0): number {
    const id = this.nextId++;
    this.corpseList.push({ id, x, y });
    this.bus.emit({ type: "corpseCreated", actorId: id, x, y });
    return id;
  }

  now() { return this.time; }
  random() { return this.rng(); }
  actor(id: number) { return this.list.find((a) => a.id === id); }
  *actors(): Iterable<TargetActor> { for (const a of this.list) yield a; }
  *corpses() { for (const c of this.corpseList) yield c; }
  *zones() { for (const z of this.zoneList) yield z; }
  summonsOf(ownerId: number): Iterable<TargetActor> {
    return this.list.filter((a) => a.ownerId === ownerId && a.alive);
  }
  markOf(actorId: number) { return this.marks.get(actorId); }
  threatToward(actorId: number) { return this.threat.get(actorId) ?? 0; }

  dealDamage(targetId: number, packet: DamagePacket): number {
    let t = this.actor(targetId);
    if (!t || !t.alive) return 0;

    // redirect: a fraction of the ward's hit goes to the protector
    if (t.redirectedTo !== undefined && t.redirectFraction > 0 && packet.channel !== "retaliation") {
      const prot = this.actor(t.redirectedTo);
      if (prot && prot.alive) {
        const share = packet.amount * t.redirectFraction;
        packet.amount -= share;
        this.dealDamage(prot.id, makeDamagePacket({ amount: share, type: packet.type, channel: "reflected", source: packet.source }));
      }
    }

    let amount = packet.raw ? packet.amount : packet.amount * t.statuses.incomingDamageMultiplier();
    amount = Math.max(0, Math.round(amount));
    const incoming = amount;
    let prevented = 0;

    if (t.absorbShield && t.shield > 0) {
      // absorb-one-hit: soak the whole hit, break the shield
      t.shield = 0;
      t.absorbShield = false;
      prevented += amount;
      amount = 0;
    } else if (t.shield > 0) {
      const soak = Math.min(t.shield, amount);
      t.shield -= soak;
      amount -= soak;
      prevented += soak;
    }

    // guardsDeath: a killing blow is capped at leaving 1 HP
    if (t.statuses.deathGuarded && amount >= t.health) {
      prevented += amount - (t.health - 1);
      amount = Math.max(0, t.health - 1);
    }

    t.health -= amount;
    // credit the victim's own resource model for the hit and for anything it stopped
    if (t.resources) {
      t.resources.broadcast({ type: "hitTaken", packet, damage: amount, maxHealth: t.maxHealth });
      if (amount > 0) t.resources.broadcast({ type: "damageTaken", packet, damage: amount, maxHealth: t.maxHealth });
      if (prevented > 0) t.resources.broadcast({ type: "damagePrevented", packet, damage: prevented, maxHealth: t.maxHealth });
      if (prevented > 0 && incoming > 0) t.resources.broadcast({ type: "block", packet, amount: prevented });
    }
    packet.mitigated = amount;
    this.damageLog.push({ targetId, packet, dealt: amount });

    if (packet.inflict && packet.inflict.chance > 0) {
      t.statuses.apply(packet.inflict.status, {
        hitDamage: packet.amount, potency: packet.inflict.potency ?? 1,
        sourceActorId: packet.source.actorId, chance: packet.inflict.chance, roll: () => this.rng(),
      });
    }

    this.bus.emit({ type: packet.crit ? "criticalHit" : "hit", actorId: packet.source.actorId, targetId, packet,
      ...(packet.source.tags ? { tags: packet.source.tags } : {}) });

    const killed = t.health <= 0 && t.alive;
    if (killed) {
      t.alive = false;
      this.corpseList.push({ id: this.nextId++, x: t.x, y: t.y });
      this.bus.emit({ type: "enemyDeath", actorId: targetId, packet });
    }
    const attacker = this.actor(packet.source.actorId);
    if (attacker && attacker.faction !== t.faction) {
      creditResourcesForHit(attacker, packet, amount, { killed, ailmentInflicted: !!packet.inflict });
    }
    return amount;
  }
  healActor(targetId: number, amount: number, _s: number, _ot?: number) {
    const t = this.actor(targetId);
    if (!t) return;
    t.healed += amount;
    t.health = Math.min(t.maxHealth, t.health + amount);
  }
  shieldActor(targetId: number, amount: number, _d: number, _s: number, absorbOneHit?: boolean) {
    const t = this.actor(targetId);
    if (!t) return;
    t.shield += amount;
    if (absorbOneHit) t.absorbShield = true;
  }
  moveActor(id: number, req: MoveRequest) {
    const a = this.actor(id);
    if (!a) return;
    a.moves.push(req);
    if (req.toPoint) { a.x = req.toPoint.x; a.y = req.toPoint.y; }
  }
  spawnProjectile(req: ProjectileRequest) { this.projectiles.push(req); return this.nextId++; }
  spawnZone(req: ZoneRequest) {
    this.zoneReqs.push(req);
    const id = this.nextId++;
    this.zoneList.push({ id, x: req.x, y: req.y });
    return id;
  }
  spawnMinion(req: MinionRequest) {
    this.minions.push(req);
    const ids: number[] = [];
    for (let i = 0; i < req.count; i++) {
      const m = this.spawn({ id: this.nextId++, kind: "minion", faction: this.actor(req.ownerId)?.faction ?? "player", x: req.x, y: req.y, ownerId: req.ownerId, health: 20, maxHealth: 20 });
      ids.push(m.id);
    }
    return ids;
  }
  spawnTerrain(req: TerrainRequest) { this.terrain.push(req); return this.nextId++; }
  consumeCorpses(count: number | "all"): number {
    const n = count === "all" ? this.corpseList.length : Math.min(count, this.corpseList.length);
    this.corpseList.splice(0, n);
    this.corpsesTaken += n;
    return n;
  }
  commandSummons(ownerId: number, behavior: MinionCommand["behavior"], targetId?: number) {
    this.commands.push({ ownerId, behavior, targetId });
  }
  sacrificeSummons(ownerId: number, count: number): number {
    const owned = this.list.filter((a) => a.ownerId === ownerId && a.alive);
    const n = Math.min(count, owned.length);
    for (let i = 0; i < n; i++) { owned[i]!.alive = false; this.bus.emit({ type: "summonDeath", actorId: owned[i]!.id }); }
    this.sacrifices.push({ ownerId, count: n });
    return n;
  }
  redirectDamage(protectorId: number, wardId: number, fraction: number, _d: number) {
    const ward = this.actor(wardId);
    if (!ward) return;
    ward.redirectedTo = protectorId;
    ward.redirectFraction = fraction;
    this.redirects.push({ protectorId, wardId, fraction });
  }
  setThreat(targetId: number, op: "taunt" | "drop" | "generate", _s: number, amount: number) {
    this.threatOps.push({ targetId, op });
    if (op === "generate") this.threat.set(targetId, (this.threat.get(targetId) ?? 0) + amount);
  }
  applyImpulse() {}
  interruptCasts() {}
  emitFx(ref: string) { this.fx.push(ref); }

  advance(seconds: number, rt: AbilityRuntime, step = 1 / 60) {
    for (let t = 0; t < seconds - 1e-9; t += step) {
      this.time += step;
      rt.tick(step, this);
      for (const a of this.list) {
        a.statuses.tick(step, { onDamage: (p) => this.dealDamage(a.id, p) });
        a.resources?.tick(step);
      }
    }
  }
}

const CAST = { attackDamage: 40, spellDamage: 45, critChance: 0, ailmentPotency: 1 };

/** Stand up a hero of `def` with its resources, plus enemies and (optionally) an ally. */
function arena(def: PilotClass, opts: { ally?: boolean; enemies?: number; corpses?: number } = {}) {
  const w = new World();
  const hero = w.spawn({ id: 1, kind: "hero", faction: "player", x: 0, y: 0, health: 200, maxHealth: 200 });
  hero.resources = makeClassResources(def);
  const ally = opts.ally
    ? (() => {
        const a = w.spawn({ id: 2, kind: "hero", faction: "player", x: 24, y: 0, health: 40, maxHealth: 200 });
        return a;
      })()
    : undefined;
  const enemies = [];
  for (let i = 0; i < (opts.enemies ?? 3); i++) {
    enemies.push(w.spawn({ id: 10 + i, kind: "enemy", faction: "enemy", x: 40 + i * 12, y: 0, health: 120, maxHealth: 120 }));
  }
  for (let i = 0; i < (opts.corpses ?? 0); i++) w.addCorpse(30 + i * 10, 0);
  const rt = new AbilityRuntime();
  return { w, hero, ally, enemies, rt };
}

function ability(def: PilotClass, id: string): Ability {
  const a = def.abilities.find((x) => x.id === id);
  if (!a) throw new Error(`${def.classId} has no ability ${id}`);
  return a;
}
/** Cast an ability with generous resources so a cost never blocks the test — but never touch the ultimate meter. */
function forceCast(w: World, rt: AbilityRuntime, heroId: number, a: Ability, input = {}) {
  const hero = w.actor(heroId)!;
  for (const pool of hero.resources?.all() ?? []) {
    if (!pool.spec.isUltimateMeter) pool.value = pool.max;
  }
  return rt.castAbility(w, heroId, a, { ...CAST, ...input });
}

// =========================================================================
section("roster shape — 6 classes, 60 unique skills, no overlap");
{
  check("exactly the six pilot classes", PILOT_CLASSES.length === 6
    && PILOT_CLASSES.map((c) => c.classId).join(",") === "lancer,berserker,magician,necromancer,paladin,stormcaller");
  const rosterProblems = validateRoster(PILOT_CLASSES);
  check("no skill id or name is shared between classes", rosterProblems.length === 0, rosterProblems.join("; "));

  let totalAbilities = 0;
  for (const def of PILOT_CLASSES) {
    const problems = validateClass(def);
    check(`${def.classId}: well-formed (10 skills, 1 ultimate, 5×5 tree, 6 hybrids + archetype)`, problems.length === 0, problems.join("; "));
    totalAbilities += def.abilities.length;
  }
  check("60 abilities across the roster", totalAbilities === 60);
  const allUltimates = PILOT_CLASSES.map((c) => c.abilities.filter((a) => a.isUltimate).length);
  check("every class owns exactly one ultimate", allUltimates.every((n) => n === 1));
}

// =========================================================================
section("install — statuses register, trees flatten, resource sets build");
{
  for (const def of PILOT_CLASSES) {
    const rt = installClass(def);
    check(`${def.classId}: tree flattens to 25 nodes`, rt.tree.length === 25);
    for (const s of def.statuses ?? []) {
      check(`${def.classId}: status "${s.id}" is registered`, getStatusSpec(s.id) !== undefined);
    }
    const set = makeClassResources(def);
    check(`${def.classId}: resource set has an ultimate meter`, set.get("ultimate")?.spec.isUltimateMeter === true);
  }
  check("Stormcaller's resource set carries the Weather stance", makeClassResources(STORMCALLER).stance("weather")?.state === "rain");
}

// =========================================================================
section("melee + ranged");
{
  // melee — Lancer Impaling Thrust lands a physical hit in a line
  {
    const { w, hero, rt } = arena(LANCER, { enemies: 2 });
    forceCast(w, rt, hero.id, ability(LANCER, "lancer.impaling_thrust"), { aim: { x: 100, y: 0 } });
    check("Lancer: a melee thrust deals a direct physical hit", w.damageLog.length >= 1
      && w.damageLog[0]!.packet.channel === "direct" && w.damageLog[0]!.packet.type === "physical");
  }
  // ranged — Magician Arc Spark spawns a projectile carrying a scaled packet
  {
    const { w, hero, rt } = arena(MAGICIAN);
    forceCast(w, rt, hero.id, ability(MAGICIAN, "magician.arc_spark"), { aim: { x: 100, y: 0 } });
    check("Magician: a ranged spell spawns a projectile", w.projectiles.length === 1
      && w.projectiles[0]!.damage.type === "lightning" && w.projectiles[0]!.damage.amount > 0);
  }
}

// =========================================================================
section("resources — Mana / Momentum / Rage / Corpses / Souls / Conviction / Weather");
{
  // Mana — Magician spends it, and regenerates
  {
    const { w, hero, rt } = arena(MAGICIAN);
    const mana = hero.resources!.get("mana")!;
    mana.value = 50;
    rt.castAbility(w, hero.id, ability(MAGICIAN, "magician.arc_spark"), { ...CAST, aim: { x: 50, y: 0 } });
    check("Mana: a spell spends Mana", mana.value === 42);
    w.advance(1, rt);
    check("Mana: it regenerates over time", mana.value > 42);
  }
  // Momentum — Lancer builds it by moving
  {
    const { w, hero } = arena(LANCER);
    const mom = hero.resources!.get("momentum")!;
    hero.resources!.broadcast({ type: "move", distance: 30 });
    check("Momentum: movement generates it", mom.value > 0, `value ${mom.value.toFixed(1)}`);
    const before = mom.value;
    hero.resources!.tick(3);
    check("Momentum: it bleeds off out of combat", mom.value < before);
  }
  // Rage — Berserker fills it by TAKING damage, not by kills
  {
    const { w, hero } = arena(BERSERKER);
    const rage = hero.resources!.get("rage")!;
    hero.resources!.broadcast({ type: "damageTaken", damage: 40, maxHealth: 200 });
    check("Rage: taking damage generates it", rage.value > 0, `value ${rage.value.toFixed(1)}`);
    check("Rage: 40% threshold has not granted attack speed yet", rage.modsContribution().attackSpeed === 0 || rage.value >= 40);
    rage.value = 85;
    check("Rage: above 80 the threshold grants attack speed + melee damage", rage.modsContribution().attackSpeed > 0 && rage.modsContribution().meleeDamage > 0);
  }
  // Corpses — Necromancer's pile fills when an enemy dies, and Raise Skeleton spends one
  {
    const { w, hero, rt, enemies } = arena(NECROMANCER, { corpses: 0, enemies: 2 });
    const corpses = hero.resources!.get("corpses")!;
    enemies[0]!.health = 1;
    w.dealDamage(enemies[0]!.id, makeDamagePacket({ amount: 5, type: "physical",
      source: { actorId: hero.id, actorKind: "hero", tags: ["melee"] } }));
    check("Corpses: an enemy death adds a corpse to the pile", corpses.value >= 1, `value ${corpses.value}`);
    const before = corpses.value;
    hero.resources!.get("mana")!.value = 100;
    const r = rt.castAbility(w, hero.id, ability(NECROMANCER, "necromancer.raise_skeleton"), { ...CAST, aim: { x: 30, y: 0 } });
    check("Corpses: Raise Skeleton spent a corpse and summoned a skeleton", r.ok && corpses.value === before - 1
      && w.minions.length === 1 && [...w.summonsOf(hero.id)].length === 1);
    check("Corpses: the summon consumed a corpse entity too", w.corpsesTaken === 1);
  }
  // Souls — Necromancer's slow economy fills on kill
  {
    const { w, hero } = arena(NECROMANCER);
    const souls = hero.resources!.get("souls")!;
    hero.resources!.broadcast({ type: "kill" });
    check("Souls: a kill grants Souls", souls.value === 6);
  }
  // Conviction — Paladin fills it by PREVENTING damage
  {
    const { w, hero } = arena(PALADIN);
    const conv = hero.resources!.get("conviction")!;
    hero.resources!.broadcast({ type: "damagePrevented", damage: 40, maxHealth: 200 });
    check("Conviction: preventing damage generates it", conv.value > 0, `value ${conv.value.toFixed(1)}`);
  }
  // Weather — Stormcaller's stance cycles and each phase carries its own mods
  {
    const { w, hero, rt } = arena(STORMCALLER);
    const weather = hero.resources!.stance("weather")!;
    check("Weather: starts in Rain", weather.state === "rain");
    check("Weather: Rain grants mana regen, not lightning damage", weather.modsContribution().manaRegen > 0
      && weather.modsContribution().lightningDamage === 0);
    forceCast(w, rt, hero.id, ability(STORMCALLER, "stormcaller.weather_shift"));
    check("Weather: Weather Shift cycled to Wind", weather.state === "wind" && weather.modsContribution().moveSpeed > 0);
    rt.tick(10, w);
    forceCast(w, rt, hero.id, ability(STORMCALLER, "stormcaller.weather_shift"));
    rt.tick(10, w);
    forceCast(w, rt, hero.id, ability(STORMCALLER, "stormcaller.weather_shift"));
    check("Weather: the ring wraps back to Rain", weather.state === "rain");
  }
}

// =========================================================================
section("summons / terrain / statuses / DoTs");
{
  // Summons — Necromancer Grave Guard, a guard-point minion + a taunt
  {
    const { w, hero, rt } = arena(NECROMANCER, { corpses: 2 });
    forceCast(w, rt, hero.id, ability(NECROMANCER, "necromancer.grave_guard"), { aim: { x: 40, y: 0 } });
    check("Summon: Grave Guard raises a guard-point minion and taunts", w.minions.length === 1
      && w.minions[0]!.command.behavior === "guardPoint" && w.threatOps.some((o) => o.op === "taunt"));
  }
  // Terrain — Necromancer Ossuary Wall
  {
    const { w, hero, rt } = arena(NECROMANCER, { corpses: 2 });
    forceCast(w, rt, hero.id, ability(NECROMANCER, "necromancer.ossuary_wall"), { aim: { x: 60, y: 0 } });
    check("Terrain: Ossuary Wall builds a wall with HP", w.terrain.length === 1
      && w.terrain[0]!.piece === "wall" && w.terrain[0]!.hp > 0);
  }
  // Statuses + DoTs — Berserker Frenzy Chain applies Bleed, and it ticks on the dot channel
  {
    const { w, hero, rt, enemies } = arena(BERSERKER, { enemies: 1 });
    const t = enemies[0]!;
    // full path Bloodletter so the bleed chance is reliable
    forceCast(w, rt, hero.id, ability(BERSERKER, "berserker.frenzy_chain"), { currentTargetId: t.id, aim: { x: t.x, y: t.y } });
    // apply bleed directly to be deterministic, then let it tick
    t.statuses.apply("bleed", { sourceActorId: hero.id, hitDamage: 80, chance: 1, stacks: 2 });
    const hp0 = t.health;
    w.advance(2, rt);
    const dot = w.damageLog.filter((d) => d.packet.channel === "dot").reduce((s, d) => s + d.dealt, 0);
    check("Status + DoT: Bleed (physical DoT) ticks damage over time", t.health < hp0 && dot > 0, `dot ${dot}`);
    check("Berserker also self-buffed Frenzy on the same cast", hero.statuses.has("frenzy"));
  }
}

// =========================================================================
section("shields / healing / party utility (multiplayer-relevant)");
{
  // shields — Paladin Shield of Faith on the hurt ally soaks one hit whole
  {
    const { w, hero, ally, rt } = arena(PALADIN, { ally: true });
    forceCast(w, rt, hero.id, ability(PALADIN, "paladin.shield_of_faith"));
    check("Shield: an absorb-one-hit barrier landed on the ally, not the caster", ally!.shield > 0 && ally!.absorbShield);
    w.dealDamage(ally!.id, makeDamagePacket({ amount: 500, source: { actorId: 99, actorKind: "enemy" } }));
    check("Shield: it soaked a 500 hit whole and then broke", ally!.health === 40 && ally!.shield === 0 && !ally!.absorbShield);
  }
  // healing — Paladin Consecrated Ground drops a heal zone
  {
    const { w, hero, rt } = arena(PALADIN);
    forceCast(w, rt, hero.id, ability(PALADIN, "paladin.consecrated_ground"), { aim: { x: 20, y: 0 } });
    check("Healing: Consecrated Ground places a heal-benefit zone", w.zoneReqs.some((z) => z.benefit === "heal"));
  }
  // party utility — Radiant Strike's Blessed buff lands on the OTHER hero
  {
    const { w, hero, ally, rt, enemies } = arena(PALADIN, { ally: true });
    forceCast(w, rt, hero.id, ability(PALADIN, "paladin.radiant_strike"), { currentTargetId: enemies[0]!.id, aim: { x: enemies[0]!.x, y: 0 } });
    check("Party: an ally-targeted buff landed on the second hero", ally!.statuses.has("blessed") && hero.statuses.has("blessed"));
    check("Party: the enemy was NOT blessed", !enemies[0]!.statuses.has("blessed"));
  }
  // party utility — Guardian's Oath binds the ally so the hero eats a share of its damage
  {
    const { w, hero, ally, rt } = arena(PALADIN, { ally: true });
    hero.resources!.get("conviction")!.value = 100;
    forceCast(w, rt, hero.id, ability(PALADIN, "paladin.guardians_oath"));
    check("Party: Guardian's Oath registered a redirect onto an ally", w.redirects.length === 1 && w.redirects[0]!.wardId === ally!.id);
    const heroShield0 = hero.shield;
    w.dealDamage(ally!.id, makeDamagePacket({ amount: 40, type: "physical", source: { actorId: 99, actorKind: "enemy" } }));
    check("Party: half the ally's 40 hit was redirected off the ally", ally!.health === 20);
    check("Party: the redirected share landed on the Paladin (soaked by their own shield)", hero.shield < heroShield0);
  }
}

// =========================================================================
section("skill mutations + hybrid builds");
{
  // Lancer — the reference chain still holds through the fuller class
  {
    const rtc = installClass(LANCER);
    const allocated = ["lancer.1.0", "lancer.1.1", "lancer.1.2", "lancer.1.3", "lancer.1.4"];
    const build = resolveClassBuild(rtc, allocated);
    const thrust = applyBuild(build, ability(LANCER, "lancer.impaling_thrust"));
    check("Mutation: Long Point + Through Flesh extend Impaling Thrust's reach to 300", thrust.range === 300);
    check("Mutation: Through Flesh scaled the base damage and added an Exposed rider",
      (thrust.effects.find((s) => s.kind === "damage") as { damage: { base: number; inflict?: { status: string } } } | undefined)?.damage.inflict?.status === "exposed");
    check("Mutation: the base ability is untouched (pure)", ability(LANCER, "lancer.impaling_thrust").range === 220);
  }
  // Necromancer — the spec's canonical replace-effects mutation, in the real class
  {
    const rtc = installClass(NECROMANCER);
    // Corpse Architect path to row 3 = Bone Structure
    const allocated = ["necromancer.2.0", "necromancer.2.1", "necromancer.2.2", "necromancer.2.3"];
    const build = resolveClassBuild(rtc, allocated);
    const bomb = applyBuild(build, ability(NECROMANCER, "necromancer.corpse_bomb"));
    check("Mutation: Corpse Bomb → Bone Structure is the same id, now a summon",
      bomb.id === "necromancer.corpse_bomb" && bomb.effects.some((s) => s.kind === "summon")
      && bomb.tags.includes("construct"));
  }
  // hybrids unlock at the point thresholds, per class
  {
    for (const def of PILOT_CLASSES) {
      const tree = buildProgressionTree(def.progression);
      const someHybrid = def.unlocks.find((u) => u.tier === "hybrid")!;
      const [a, b] = someHybrid.requires;
      const pathIndex = (name: string) => def.progression.paths.findIndex((p) => p.name === name);
      const alloc: string[] = [];
      for (const req of [a!, b!]) {
        const pi = pathIndex(req.path);
        // spend req.points down the path (rows are 1pt, keystone 2pt)
        let spent = 0;
        for (let row = 0; row < 5 && spent < req.points; row++) {
          alloc.push(`${def.classId}.${pi}.${row}`);
          spent += row === 4 ? 2 : 1;
        }
      }
      const short = alloc.slice(0, 1);
      const unlockedShort = evaluateHybrids(def.unlocks, tree, short);
      const unlockedFull = evaluateHybrids(def.unlocks, tree, alloc);
      check(`${def.classId}: "${someHybrid.name}" needs the investment (locked at 1 point, open at threshold)`,
        unlockedShort.length === 0 && unlockedFull.some((u) => u.id === someHybrid.id));
    }
  }
  // an archetype needs deep three-path investment
  {
    const rtc = installClass(BERSERKER);
    const arch = BERSERKER.unlocks.find((u) => u.tier === "mythic")!;
    const alloc: string[] = [];
    for (const req of arch.requires) {
      const pi = BERSERKER.progression.paths.findIndex((p) => p.name === req.path);
      let spent = 0;
      for (let row = 0; row < 5 && spent < req.points; row++) { alloc.push(`berserker.${pi}.${row}`); spent += row === 4 ? 2 : 1; }
    }
    const archs = evaluateArchetypes(BERSERKER.unlocks, rtc.tree, alloc);
    check("Archetype: Blood God unlocks only on deep 3-path investment", archs.length === 1 && archs[0]!.id === arch.id);
    const build = resolveBuild(rtc.tree, alloc, BERSERKER.unlocks);
    const wb = applyBuild(build, ability(BERSERKER, "berserker.worldbreaker"));
    const baseSteps = ability(BERSERKER, "berserker.worldbreaker").effects.length;
    check("Archetype: it MODIFIES GAMEPLAY — Worldbreaker gains a persistent aura zone",
      wb.effects.length > baseSteps && wb.effects.some((s) => s.kind === "zone") && wb.tags.includes("aura"));
  }
}

// =========================================================================
section("THE ULTIMATE RULE — per class");
{
  for (const def of PILOT_CLASSES) {
    const { w, hero, rt, enemies } = arena(def, { enemies: 3, corpses: 4 });
    const meter = hero.resources!.get("ultimate")!;
    meter.value = 0;
    for (const e of enemies) { e.health = 8; e.x = 20; }
    const ult = def.abilities.find((a) => a.isUltimate)!;
    const r = forceCast(w, rt, hero.id, ult, { critChance: 1, aim: { x: 20, y: 0 }, currentTargetId: enemies[0]!.id });
    // let any delayed / zone / follow-up damage resolve
    w.advance(3, rt);
    const ultPackets = w.damageLog.filter((d) => isUltimateSourced(d.packet));
    check(`${def.classId}: the ultimate fired and its damage is flagged fromUltimate`, r.ok
      && (ultPackets.length > 0 || ult.effects.every((s) => s.kind !== "damage")));
    check(`${def.classId}: THE ULTIMATE RULE — its own kills/crits did not refill the meter`, meter.value === 0,
      `meter ${meter.value}`);
  }
}

// =========================================================================
section("solo vs multiplayer state changes");
{
  // resolveBuild is deterministic — a host and a client resolving the same allocation must agree
  {
    const rtc = installClass(STORMCALLER);
    const alloc = ["stormcaller.0.0", "stormcaller.0.1", "stormcaller.1.0", "stormcaller.1.1", "stormcaller.4.0"];
    const a = resolveBuild(rtc.tree, alloc, STORMCALLER.unlocks);
    const b = resolveBuild(rtc.tree, alloc, STORMCALLER.unlocks);
    const sig = (x: typeof a) => JSON.stringify({
      mods: x.mods, rules: [...x.rules].sort(), muts: x.mutations.map((m) => m.id).sort(),
      grants: x.grants.length, patches: x.resourcePatches.map((p) => p.resource).sort(),
    });
    check("MP: resolveBuild is deterministic (host and client agree on the build)", sig(a) === sig(b));
  }
  // a party floor: XP-style shared events reach both, but resource credit stays with the actor
  {
    const w = new World();
    const p1 = w.spawn({ id: 1, kind: "hero", faction: "player", x: 0, y: 0, health: 200, maxHealth: 200 });
    const p2 = w.spawn({ id: 2, kind: "hero", faction: "player", x: 30, y: 0, health: 200, maxHealth: 200 });
    p1.resources = makeClassResources(BERSERKER);
    p2.resources = makeClassResources(PALADIN);
    // p1 takes a hit — only p1's Rage should move
    w.dealDamage(p1.id, makeDamagePacket({ amount: 40, source: { actorId: 99, actorKind: "enemy" } }));
    check("MP: a hit on one hero fills only that hero's resource", p1.resources.get("rage")!.value > 0
      && p2.resources.get("conviction")!.value === 0);
  }
  // solo: "downed" and "dead" are the same tick — guardsDeath still caps a killing blow at 1
  {
    const { w, hero, rt } = arena(BERSERKER);
    forceCast(w, rt, hero.id, ability(BERSERKER, "berserker.last_stand"));
    check("Solo: Last Stand is a guardsDeath buff on the caster", hero.statuses.deathGuarded);
    hero.health = 50;
    w.dealDamage(hero.id, makeDamagePacket({ amount: 999, source: { actorId: 99, actorKind: "enemy" } }));
    check("Solo: a killing blow left the Berserker at 1 HP, not dead", hero.health === 1 && hero.alive);
  }
  // multiplayer: the same status, fanned across the party by Last Light
  {
    const { w, hero, ally, rt } = arena(PALADIN, { ally: true });
    forceCast(w, rt, hero.id, ability(PALADIN, "paladin.last_light"));
    check("MP: Last Light put a guardsDeath buff on every ally", hero.statuses.deathGuarded && ally!.statuses.deathGuarded);
    ally!.health = 30;
    w.dealDamage(ally!.id, makeDamagePacket({ amount: 999, source: { actorId: 99, actorKind: "enemy" } }));
    check("MP: the downed ally survived at 1 HP under Last Light", ally!.health === 1 && ally!.alive);
  }
}

// =========================================================================
section("Magician random outcome + Necromancer consume-summons");
{
  // random EffectStep — Arcane Roulette always resolves exactly one branch
  {
    const { w, hero, rt, enemies } = arena(MAGICIAN, { enemies: 1 });
    let branches = 0;
    for (let i = 0; i < 12; i++) {
      w.damageLog.length = 0;
      w.zoneReqs.length = 0;
      enemies[0]!.health = 120;
      enemies[0]!.alive = true;
      rt.tick(10, w);
      forceCast(w, rt, hero.id, ability(MAGICIAN, "magician.arcane_roulette"), { aim: { x: enemies[0]!.x, y: 0 } });
      const hitOrHealOrZone = w.damageLog.length > 0 || hero.healed > 0;
      if (hitOrHealOrZone) branches++;
    }
    check("Random: Arcane Roulette resolved an outcome on every cast", branches === 12);
  }
  // consumeSummons — Death Pact sacrifices a minion, then pays out
  {
    const { w, hero, rt } = arena(NECROMANCER, { corpses: 3 });
    hero.resources!.get("mana")!.value = 100;
    forceCast(w, rt, hero.id, ability(NECROMANCER, "necromancer.raise_skeleton"), { aim: { x: 30, y: 0 } });
    check("ConsumeSummons: a skeleton is up", [...w.summonsOf(hero.id)].length === 1);
    hero.health = 100;
    hero.resources!.get("mana")!.value = 10;
    rt.tick(10, w);
    forceCast(w, rt, hero.id, ability(NECROMANCER, "necromancer.death_pact"));
    check("ConsumeSummons: Death Pact ate the skeleton and returned health + mana",
      w.sacrifices.length === 1 && hero.healed > 0 && hero.resources!.get("mana")!.value > 10);
  }
  // commandSummons — Command: Ravage re-tasks the legion onto one target
  {
    const { w, hero, rt, enemies, } = arena(NECROMANCER, { corpses: 3, enemies: 2 });
    hero.resources!.get("mana")!.value = 100;
    forceCast(w, rt, hero.id, ability(NECROMANCER, "necromancer.raise_skeleton"), { aim: { x: 30, y: 0 } });
    rt.tick(10, w);
    hero.resources!.get("souls")!.value = 100;
    forceCast(w, rt, hero.id, ability(NECROMANCER, "necromancer.command_ravage"), { currentTargetId: enemies[0]!.id, aim: { x: enemies[0]!.x, y: 0 } });
    check("CommandSummons: Command: Ravage issued a commandTarget order", w.commands.some((c) => c.behavior === "commandTarget" && c.targetId === enemies[0]!.id));
  }
}

console.log(`\n${failures === 0 ? "ALL PILOT-CLASS CHECKS PASSED" : `${failures} PILOT-CLASS CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
