/**
 * Combat-vocabulary acceptance test.
 *
 * Phase 1 of the class refactor builds primitives, not classes. This file is the
 * proof that the primitives actually compose: it stands up a throwaway world that
 * implements `CombatHost` against plain objects, then drives one melee attack, one
 * projectile, one DoT, one heal, one shield, one summon, one movement skill, one
 * terrain zone, one resource generator, one resource spender, one status application,
 * one conditional trigger and one ultimate through the exact same executor a real
 * class would use.
 *
 * It also pins THE ULTIMATE RULE: an ultimate's kills and crits must not refill the
 * ultimate meter, while an ordinary skill's kill must.
 *
 * Headless, no browser, no dungeon. Run with `npm run vocab`.
 */

import {
  AbilityRuntime,
  DAMAGE_CHANNELS,
  DAMAGE_TYPES,
  EventBus,
  ResourcePool,
  ResourceSet,
  StatusContainer,
  applyDamageModifiers,
  creditResourcesForHit,
  getStatusSpec,
  isUltimateSourced,
  makeDamagePacket,
  registerStatus,
  type Ability,
  type EffectStep,
  type CombatHost,
  type DamagePacket,
  type HostActor,
  type MinionCommand,
  type MinionRequest,
  type MoveRequest,
  type ProjectileRequest,
  type ResourceSpec,
  type TargetActor,
  type TerrainRequest,
  type ZoneRequest,
} from "../src/combat/index";
import { Player } from "../src/game/player";
import { zeroStats } from "../src/game/item";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

// --- a deterministic RNG so a chance roll is reproducible --------------------
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// --- the throwaway world ---------------------------------------------------

interface Actor extends HostActor {
  shield: number;
  moves: MoveRequest[];
  healedOverTime: number;
}

interface Corpse {
  id: number;
  x: number;
  y: number;
}

class MockWorld implements CombatHost {
  time = 0;
  readonly bus = new EventBus();
  private rng = lcg(0xc0ffee);
  private actorList: Actor[] = [];
  private corpseList: Corpse[] = [];
  private nextId = 100;
  marks = new Map<number, number>();
  threat = new Map<number, number>();

  // logs the test inspects
  damageLog: { targetId: number; packet: DamagePacket; dealt: number }[] = [];
  projectiles: ProjectileRequest[] = [];
  /**
   * Renamed from `zones` in Sept 2026. It used to collide with the `zones()` generator
   * below — a class field overwrites the prototype method, so the field won and
   * `host.zones()`, which `resolveTargets` calls to find existing zones, was not a
   * function at all. Nothing noticed because no check here used zone targeting.
   */
  zoneLog: { id: number; req: ZoneRequest }[] = [];
  minions: MinionRequest[] = [];
  terrain: TerrainRequest[] = [];
  fx: { ref: string; x: number; y: number }[] = [];
  commands: { ownerId: number; behavior: MinionCommand["behavior"]; targetId?: number }[] = [];
  redirects: { protectorId: number; wardId: number; fraction: number; duration: number }[] = [];
  shields: { targetId: number; amount: number }[] = [];
  heals: { targetId: number; amount: number; overTime?: number }[] = [];
  threatOps: { targetId: number; op: string }[] = [];
  interrupts: { x: number; y: number; radius: number }[] = [];

  spawn(a: Partial<Actor> & Pick<Actor, "id" | "faction" | "kind">): Actor {
    const actor: Actor = {
      x: 0,
      y: 0,
      health: 100,
      maxHealth: 100,
      alive: true,
      statuses: new StatusContainer(a.id),
      shield: 0,
      moves: [],
      healedOverTime: 0,
      ...a,
    };
    this.actorList.push(actor);
    return actor;
  }

  addCorpse(x: number, y: number): number {
    const id = this.nextId++;
    this.corpseList.push({ id, x, y });
    return id;
  }

  // --- CombatHost / TargetQueryHost ---
  now() {
    return this.time;
  }
  random() {
    return this.rng();
  }
  actor(id: number) {
    return this.actorList.find((a) => a.id === id);
  }
  *actors(): Iterable<TargetActor> {
    for (const a of this.actorList) yield a;
  }
  *corpses() {
    for (const c of this.corpseList) yield c;
  }
  *zones(): Iterable<{ id: number; x: number; y: number }> {
    for (const z of this.zoneLog) yield { id: z.id, x: z.req.x, y: z.req.y };
  }
  *summonsOf(ownerId: number): Iterable<TargetActor> {
    for (const a of this.actorList) if (a.ownerId === ownerId) yield a;
  }
  /**
   * The four below were added to `CombatHost` after this mock was written, and their
   * absence made `MockWorld` fail to satisfy the interface — invisibly, because nothing
   * typechecked `tools/` until Sept 2026. They are implemented rather than stubbed so a
   * check can be written against them, but NOTHING IN THIS FILE EXERCISES THEM YET: as
   * of this commit `consumeCorpses`, `commandSummons`, `sacrificeSummons` and
   * `redirectDamage` are reachable-but-untested, and so is zone targeting. That is a
   * coverage gap, not a solved problem.
   */
  consumeCorpses(count: number | "all"): number {
    const take = count === "all" ? this.corpseList.length : Math.min(count, this.corpseList.length);
    this.corpseList.splice(0, take);
    return take;
  }

  commandSummons(ownerId: number, behavior: MinionCommand["behavior"], targetId?: number): void {
    this.commands.push({ ownerId, behavior, ...(targetId !== undefined ? { targetId } : {}) });
  }

  sacrificeSummons(ownerId: number, count: number): number {
    let died = 0;
    for (const a of this.actorList) {
      if (died >= count) break;
      if (a.ownerId === ownerId && a.alive) { a.alive = false; died++; }
    }
    return died;
  }

  redirectDamage(protectorId: number, wardId: number, fraction: number, duration: number): void {
    this.redirects.push({ protectorId, wardId, fraction, duration });
  }

  markOf(actorId: number) {
    return this.marks.get(actorId);
  }
  threatToward(actorId: number) {
    return this.threat.get(actorId) ?? 0;
  }

  dealDamage(targetId: number, packet: DamagePacket): number {
    const t = this.actor(targetId);
    if (!t || !t.alive) return 0;
    let amount = packet.amount;
    if (!packet.raw) amount *= t.statuses.incomingDamageMultiplier();
    amount = Math.max(0, Math.round(amount));
    // shield soaks first
    if (t.shield > 0) {
      const soak = Math.min(t.shield, amount);
      t.shield -= soak;
      amount -= soak;
    }
    t.health -= amount;
    packet.mitigated = amount;
    this.damageLog.push({ targetId, packet, dealt: amount });

    if (packet.inflict && packet.inflict.chance > 0) {
      t.statuses.apply(packet.inflict.status, {
        hitDamage: packet.amount,
        potency: packet.inflict.potency ?? 1,
        sourceActorId: packet.source.actorId,
        ...(packet.source.abilityId ? { sourceAbilityId: packet.source.abilityId } : {}),
        chance: packet.inflict.chance,
        roll: () => this.rng(),
      });
    }

    this.bus.emit({
      type: packet.crit ? "criticalHit" : "hit",
      actorId: packet.source.actorId,
      targetId,
      packet,
      ...(packet.source.tags ? { tags: packet.source.tags } : {}),
    });

    const killed = t.health <= 0 && t.alive;
    if (killed) {
      t.alive = false;
      this.bus.emit({ type: "enemyDeath", actorId: targetId, packet });
    }

    const attacker = this.actor(packet.source.actorId);
    if (attacker && attacker.faction !== t.faction) {
      creditResourcesForHit(attacker, packet, amount, {
        killed,
        ailmentInflicted: !!packet.inflict,
      });
    }
    return amount;
  }

  healActor(targetId: number, amount: number, _sourceId: number, overTime?: number) {
    const t = this.actor(targetId);
    if (!t) return;
    if (overTime) {
      t.healedOverTime += amount;
      this.heals.push({ targetId, amount, overTime });
      return;
    }
    t.health = Math.min(t.maxHealth, t.health + amount);
    this.heals.push({ targetId, amount });
  }
  shieldActor(targetId: number, amount: number, _duration: number, _sourceId: number) {
    const t = this.actor(targetId);
    if (!t) return;
    t.shield += amount;
    this.shields.push({ targetId, amount });
  }
  moveActor(id: number, req: MoveRequest) {
    const a = this.actor(id);
    if (!a) return;
    a.moves.push(req);
    if (req.toPoint) {
      a.x = req.toPoint.x;
      a.y = req.toPoint.y;
    } else if (req.toActorId !== undefined) {
      const t = this.actor(req.toActorId);
      if (t) {
        a.x = t.x;
        a.y = t.y;
      }
    }
  }
  spawnProjectile(req: ProjectileRequest) {
    this.projectiles.push(req);
    return this.nextId++;
  }
  spawnZone(req: ZoneRequest) {
    const id = this.nextId++;
    this.zoneLog.push({ id, req });
    return id;
  }
  spawnMinion(req: MinionRequest) {
    this.minions.push(req);
    const ids: number[] = [];
    for (let i = 0; i < req.count; i++) {
      const m = this.spawn({
        id: this.nextId++,
        kind: "minion",
        faction: this.actor(req.ownerId)?.faction ?? "player",
        x: req.x,
        y: req.y,
        ownerId: req.ownerId,
      });
      ids.push(m.id);
    }
    return ids;
  }
  spawnTerrain(req: TerrainRequest) {
    this.terrain.push(req);
    return this.nextId++;
  }
  setThreat(targetId: number, op: "taunt" | "drop" | "generate", _sourceId: number, amount: number) {
    this.threatOps.push({ targetId, op });
    if (op === "generate") this.threat.set(targetId, (this.threat.get(targetId) ?? 0) + amount);
  }
  applyImpulse() {
    /* recorded via nothing — position math is the dungeon's job */
  }
  interruptCasts(x: number, y: number, radius: number) {
    this.interrupts.push({ x, y, radius });
  }
  emitFx(ref: string, x: number, y: number) {
    this.fx.push({ ref, x, y });
  }
  readonly tracers: { style: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  emitTracer(style: string, _element: string, x0: number, y0: number, x1: number, y1: number) {
    this.tracers.push({ style, x0, y0, x1, y1 });
  }

  advance(seconds: number, rt: AbilityRuntime, step = 1 / 60) {
    for (let t = 0; t < seconds - 1e-9; t += step) {
      this.time += step;
      rt.tick(step, this);
      for (const a of this.actorList) {
        a.statuses.tick(step, { onDamage: (p) => this.dealDamage(a.id, p) });
        a.resources?.tick(step);
      }
    }
  }
}

// --- shared fixture ------------------------------------------------------

function world() {
  const w = new MockWorld();
  const hero = w.spawn({ id: 1, kind: "hero", faction: "player", x: 0, y: 0, health: 120, maxHealth: 120 });
  const ally = w.spawn({ id: 2, kind: "hero", faction: "player", x: 20, y: 0, health: 40, maxHealth: 120 });
  const a = w.spawn({ id: 10, kind: "enemy", faction: "enemy", x: 30, y: 0 });
  const b = w.spawn({ id: 11, kind: "enemy", faction: "enemy", x: 45, y: 8 });
  const c = w.spawn({ id: 12, kind: "enemy", faction: "enemy", x: 300, y: 0 });
  return { w, hero, ally, enemies: [a, b, c] };
}

const CAST = { attackDamage: 30, spellDamage: 40, critChance: 0, ailmentPotency: 1 };

// =========================================================================
console.log("\n=== registry sanity ===");
check("nine damage types incl. holy / arcane / nature", DAMAGE_TYPES.length === 9
  && ["holy", "arcane", "nature"].every((t) => (DAMAGE_TYPES as readonly string[]).includes(t)));
check("ten damage channels incl. minion / pet / ultimate", DAMAGE_CHANNELS.length === 10
  && (["minion", "pet", "ultimate", "reflected", "retaliation", "execute", "environmental"] as const)
    .every((c) => (DAMAGE_CHANNELS as readonly string[]).includes(c)));
check("baseline statuses cover bleed / stun / curse / vulnerable / taunted",
  ["bleed", "stunned", "curse", "vulnerable", "taunted", "weakened", "silenced", "blinded", "exposed", "rooted"]
    .every((id) => getStatusSpec(id) !== undefined));

// =========================================================================
console.log("\n=== 1. one melee attack ===");
{
  const { w, hero, enemies } = world();
  const swing: Ability = {
    id: "test.swing", name: "Swing", description: "", category: "attack",
    tags: ["melee", "slash", "physical"], cooldown: 0.4,
    targeting: "cone", range: 50, shape: { length: 50, arc: Math.PI * 0.9 },
    effects: [{ kind: "damage", damage: { base: 1, scale: "attack", type: "physical", canCrit: true } }],
  };
  const rt = new AbilityRuntime();
  const r = rt.castAbility(w, hero.id, swing, CAST);
  check("cone hit the two near enemies, not the far one", r.ok
    && w.damageLog.length === 2
    && w.damageLog.every((d) => d.targetId !== enemies[2]!.id));
  check("damage scaled off attack damage (~30)", w.damageLog[0]!.dealt === 30);
  check("packet is a direct physical hit", w.damageLog[0]!.packet.channel === "direct");
  check("re-cast refused while on cooldown", !rt.castAbility(w, hero.id, swing, CAST).ok);
}

// =========================================================================
console.log("\n=== 2. one projectile ===");
{
  const { w, hero } = world();
  const bolt: Ability = {
    id: "test.bolt", name: "Bolt", description: "", category: "spell",
    tags: ["projectile", "arcane"], cooldown: 0.5, targeting: "direction", range: 400,
    effects: [{
      kind: "projectile",
      projectile: {
        damage: { base: 2, scale: "spell", type: "arcane" },
        speed: 500, radius: 6, life: 1.2, pierce: 2, count: 3, spread: 0.3,
      },
    }],
  };
  const rt = new AbilityRuntime();
  rt.castAbility(w, hero.id, bolt, { ...CAST, aim: { x: 100, y: 0 } });
  check("three projectiles spawned", w.projectiles.length === 3);
  check("projectile carries a scaled arcane packet", w.projectiles[0]!.damage.type === "arcane"
    && w.projectiles[0]!.damage.amount === 80);
  check("projectile owned by the caster", w.projectiles.every((p) => p.ownerId === hero.id));
}

// =========================================================================
console.log("\n=== 3. one DoT (generic, no bespoke timer) ===");
{
  const { w, hero, enemies } = world();
  const target = enemies[0]!;
  const rip: Ability = {
    id: "test.rip", name: "Rip", description: "", category: "attack",
    tags: ["melee", "bleed"], cooldown: 1, targeting: "enemy", range: 60,
    effects: [
      { kind: "damage", damage: { base: 1, scale: "attack", type: "physical" } },
      { kind: "status", status: "bleed", chance: 1, hitDamage: 100, scale: "flat", stacks: 2 },
    ],
  };
  const rt = new AbilityRuntime();
  rt.castAbility(w, hero.id, rip, CAST);
  check("bleed applied with 3 stacks", target.statuses.stacksOf("bleed") === 3);
  const hpAfterHit = target.health;
  w.advance(2.1, rt); // let the bleed tick
  check("bleed ticked damage over time on the dot channel", target.health < hpAfterHit
    && w.damageLog.some((d) => d.packet.channel === "dot"));
  const dotTotal = w.damageLog.filter((d) => d.packet.channel === "dot").reduce((s, d) => s + d.dealt, 0);
  check("dot damage is meaningful and bounded", dotTotal > 30 && dotTotal < 400, `dealt ${dotTotal}`);

  // the spec's line: "+15% to afflicted target" must not touch the DoT itself
  const dotPacket = w.damageLog.find((d) => d.packet.channel === "dot")!.packet;
  const hitPacket = makeDamagePacket({ amount: 100, type: "physical", source: { actorId: 1, actorKind: "hero" } });
  const mods = { vsAfflictedTarget: 1.15 };
  check("modifier lifts a hit vs an afflicted target",
    Math.round(applyDamageModifiers(hitPacket, mods, { targetAfflicted: true })) === 115);
  check("same modifier does NOT lift the DoT tick", applyDamageModifiers(dotPacket, mods, { targetAfflicted: true }) === dotPacket.amount);
}

// =========================================================================
console.log("\n=== 4. one healing effect (incl. over time) ===");
{
  const { w, hero, ally } = world();
  const mend: Ability = {
    id: "test.mend", name: "Mend", description: "", category: "support",
    tags: ["support", "heal"], cooldown: 4, targeting: "lowestHealthAlly", range: 200,
    effects: [
      { kind: "heal", amount: 25, scale: "flat", to: "lowestHealthAlly" },
      { kind: "heal", amount: 30, scale: "flat", to: "lowestHealthAlly", overTime: { duration: 3 } },
    ],
  };
  const rt = new AbilityRuntime();
  rt.castAbility(w, hero.id, mend, CAST);
  check("instant heal landed on the hurt ally", ally.health === 65);
  check("heal-over-time was scheduled on the ally", w.heals.some((h) => h.targetId === ally.id && h.overTime === 3));
}

// =========================================================================
console.log("\n=== 5. one shield ===");
{
  const { w, hero } = world();
  const guard: Ability = {
    id: "test.guard", name: "Guard", description: "", category: "support",
    tags: ["support", "barrier", "shield"], cooldown: 10, targeting: "self",
    effects: [{ kind: "shield", amount: 50, scale: "flat", to: "self", duration: 6 }],
  };
  const rt = new AbilityRuntime();
  rt.castAbility(w, hero.id, guard, CAST);
  check("50-point shield applied", hero.shield === 50);
  const enemy = w.spawn({ id: 99, kind: "enemy", faction: "enemy", x: 0, y: 0 });
  w.dealDamage(hero.id, makeDamagePacket({ amount: 30, source: { actorId: enemy.id, actorKind: "enemy" } }));
  check("shield soaked the hit before health", hero.shield === 20 && hero.health === 120);
}

// =========================================================================
console.log("\n=== 6. one summon (inherits owner power) ===");
{
  const { w, hero } = world();
  const raise: Ability = {
    id: "test.raise", name: "Raise", description: "", category: "summon",
    tags: ["summon", "minion"], cooldown: 8, targeting: "point", range: 120,
    effects: [{ kind: "summon", unit: "skeleton", count: 3, duration: 20,
      command: { behavior: "aggroNearest", inheritPower: 0.6 } }],
  };
  const rt = new AbilityRuntime();
  rt.castAbility(w, hero.id, raise, { ...CAST, aim: { x: 50, y: 0 } });
  check("three minions requested", w.minions[0]!.count === 3 && [...w.summonsOf(hero.id)].length === 3);
  check("minion command carries the inherit-power fraction", w.minions[0]!.command.inheritPower === 0.6);
}

// =========================================================================
console.log("\n=== 7. one movement skill ===");
{
  const { w, hero, enemies } = world();
  const dash: Ability = {
    id: "test.dash", name: "Skewer Step", description: "", category: "movement",
    tags: ["dash", "movement"], cooldown: 3, targeting: "currentTarget", range: 300,
    effects: [
      { kind: "move", style: "dash", toTarget: true, leaveAnchor: true, iframes: 0.3 },
      { kind: "damage", damage: { base: 1.5, scale: "attack", type: "physical" }, to: "target" },
    ],
  };
  const rt = new AbilityRuntime();
  rt.castAbility(w, hero.id, dash, { ...CAST, currentTargetId: enemies[0]!.id });
  check("hero dashed to the target's position", hero.x === enemies[0]!.x && hero.moves[0]!.style === "dash");
  check("dash carried i-frames and left an anchor", hero.moves[0]!.iframes === 0.3 && hero.moves[0]!.leaveAnchor === true);
  check("the strike landed after the move", w.damageLog.some((d) => d.targetId === enemies[0]!.id));
}

// =========================================================================
console.log("\n=== 8. one terrain zone ===");
{
  const { w, hero } = world();
  const brier: Ability = {
    id: "test.brier", name: "Briar Circle", description: "", category: "terrain",
    tags: ["zone", "ritual", "nature"], cooldown: 12, targeting: "point", range: 150,
    effects: [
      { kind: "zone", zone: {
        damage: { base: 0.5, scale: "spell", type: "nature", channel: "periodic" },
        radius: 90, duration: 8, tickInterval: 0.5, mergeable: true,
        status: { id: "rooted", chance: 0.3 },
      } },
      { kind: "terrain", piece: "wall", length: 120, duration: 8, hp: 200 },
    ],
  };
  const rt = new AbilityRuntime();
  rt.castAbility(w, hero.id, brier, { ...CAST, aim: { x: 80, y: 0 } });
  check("a mergeable damaging zone was placed at the point", w.zoneLog.length === 1
    && w.zoneLog[0]!.req.mergeable && w.zoneLog[0]!.req.damage!.channel === "periodic");
  check("a wall was constructed", w.terrain.length === 1 && w.terrain[0]!.piece === "wall" && w.terrain[0]!.hp === 200);
}

// =========================================================================
console.log("\n=== 9. one resource generator (Rage-shaped) ===");
{
  const rageSpec: ResourceSpec = {
    id: "rage", label: "Rage", max: 100, start: "empty", ui: "bar",
    decayPerSec: 5, decayDelay: 3,
    generation: [
      { on: "damageTaken", amount: 40, perUnit: "maxHealthFraction" },
      { on: "kill", amount: 8 },
    ],
    thresholds: [{ at: 50, onCross: "rageRoar", whileAbove: { attackSpeed: 0.15 } }],
  };
  const set = new ResourceSet([rageSpec]);
  const rage = set.get("rage")!;
  let roared = false;
  const ctx = { fireEffect: () => { roared = true; } };

  set.broadcast({ type: "damageTaken", damage: 25, maxHealth: 100 }, ctx); // +10
  set.broadcast({ type: "kill" }, ctx); // +8
  check("rage generated from damage taken and a kill", Math.round(rage.value) === 18);
  check("below threshold: no roar, no bonus", !roared && rage.modsContribution().attackSpeed === 0);

  set.broadcast({ type: "damageTaken", damage: 90, maxHealth: 100 }, ctx); // +36 -> 54
  check("crossing 50 fired the threshold effect", roared);
  check("while above 50, the threshold grants attack speed", rage.modsContribution().attackSpeed === 0.15);

  // decay only after the delay
  set.tick(2, ctx);
  check("no decay inside the grace window", Math.round(rage.value) === 54);
  set.tick(4, ctx); // now past 3s since last gen: -5/s for the excess time
  check("rage decays out of combat", rage.value < 54);
}

// =========================================================================
console.log("\n=== 10. one resource spender (with health conversion) ===");
{
  const { w, hero } = world();
  hero.resources = new ResourceSet([
    { id: "rage", label: "Rage", max: 100, start: 10, ui: "bar", healthConversion: { ratio: 2 } },
  ]);
  const bloodPrice: Ability = {
    id: "test.bloodprice", name: "Blood Price", description: "", category: "utility",
    tags: ["resourceSpender"], cooldown: 6, targeting: "self",
    costs: [{ resource: "rage", amount: 30 }],
    effects: [{ kind: "status", status: "weakened", to: "self", chance: 1 }],
  };
  const rt = new AbilityRuntime();
  const hp0 = hero.health;
  const r = rt.castAbility(w, hero.id, bloodPrice, CAST);
  check("cast succeeded by paying the shortfall in health", r.ok);
  check("rage pool emptied", hero.resources.get("rage")!.value === 0);
  check("health paid the 20-point shortfall at the 2:1 ratio (~40)", hero.health <= hp0 - 39);

  // and a plain spender with enough in the pool doesn't touch health
  hero.resources.get("rage")!.add(50);
  const hp1 = hero.health;
  rt.tick(6, w); // clear cooldown
  rt.castAbility(w, hero.id, bloodPrice, CAST);
  check("a covered cost leaves health alone", hero.health === hp1 && hero.resources.get("rage")!.value === 20);
}

// =========================================================================
console.log("\n=== 11. one status application (chance / resist / immunity / cleanse / detonate / spread) ===");
{
  const { hero, enemies } = world();
  const [a, b] = enemies;
  const target = a!;

  // chance + resistance
  let landed = 0;
  for (let i = 0; i < 200; i++) {
    const c = new StatusContainer(999);
    if (c.apply("vulnerable", { sourceActorId: 1, chance: 0.5, resistance: 0.5, roll: lcg(i + 1) })) landed++;
  }
  check("chance × (1 − resistance) ≈ 25% application rate", landed > 30 && landed < 70, `${landed}/200`);

  // immunity
  target.statuses.grantImmunity("stunned");
  target.statuses.apply("stunned", { sourceActorId: hero.id, chance: 1 });
  check("an immune target cannot be stunned", !target.statuses.has("stunned"));

  // refresh + stacks + source tracking
  target.statuses.apply("bleed", { sourceActorId: hero.id, hitDamage: 50, chance: 1 });
  target.statuses.apply("bleed", { sourceActorId: hero.id, hitDamage: 50, chance: 1 });
  check("bleed stacked to 2 and remembers its source", target.statuses.stacksOf("bleed") === 2
    && target.statuses.get("bleed")!.sourceActorId === hero.id);

  // spread to a neighbour
  target.statuses.spreadTo([b!.statuses], { ids: ["bleed"] });
  check("bleed spread to the neighbouring enemy", b!.statuses.has("bleed"));

  // consume / detonate
  target.statuses.apply("curse", { sourceActorId: hero.id, chance: 1 });
  let detonated = false;
  registerStatus({ ...getStatusSpec("curse")!, onDetonate: "curseBoom" });
  target.statuses.apply("curse", { sourceActorId: hero.id, chance: 1 });
  const consumed = target.statuses.consume("curse", {
    onDamage: () => {},
    fireEffect: (id) => { detonated = id === "curseBoom"; },
  });
  check("a curse can be consumed and fires its detonation effect", !!consumed && detonated && !target.statuses.has("curse"));

  // cleanse
  target.statuses.apply("weakened", { sourceActorId: hero.id, chance: 1 });
  const removed = target.statuses.cleanse({ category: "debuff" });
  check("cleanse strips debuffs and reports what it took", removed.length >= 1 && !target.statuses.has("weakened"));

  // CC read-through
  a!.statuses.apply("stunned", { sourceActorId: hero.id, chance: 1 });
}

// =========================================================================
console.log("\n=== 12. one conditional trigger (+ re-entrancy guard) ===");
{
  const bus = new EventBus(3);
  let crits = 0;
  bus.on("criticalHit", () => { crits++; }, { requireCrit: true });
  bus.on("hit", () => { throw new Error("crit listener must not fire on a plain hit"); }, { requireTags: ["nonexistent" as never] });

  const critPacket = makeDamagePacket({ amount: 10, crit: true, source: { actorId: 1, actorKind: "hero" } });
  bus.emit({ type: "criticalHit", actorId: 1, packet: critPacket });
  bus.emit({ type: "hit", actorId: 1, packet: makeDamagePacket({ amount: 10, source: { actorId: 1, actorKind: "hero" } }) });
  check("trigger fired once, only on the crit", crits === 1);

  // a listener that re-emits its own event is bounded, not infinite
  let cascade = 0;
  bus.on("kill", () => { cascade++; bus.emit({ type: "kill", actorId: 1 }); });
  bus.emit({ type: "kill", actorId: 1 });
  check("a self-re-emitting trigger is depth-capped", cascade === 3, `depth ${cascade}`);
}

// =========================================================================
console.log("\n=== 13. one Ultimate — and THE ULTIMATE RULE ===");
{
  const ultimateMeter: ResourceSpec = {
    id: "ultimate", label: "Ultimate", max: 10, start: "empty", ui: "meter", isUltimateMeter: true,
    generation: [
      { on: "kill", amount: 1 },
      { on: "crit", amount: 0.3 },
      { on: "ailmentInflicted", amount: 0.2 },
    ],
  };

  // an ordinary skill's kill DOES charge the meter
  {
    const { w, hero, enemies } = world();
    hero.resources = new ResourceSet([ultimateMeter]);
    enemies[0]!.health = 5;
    const jab: Ability = {
      id: "test.jab", name: "Jab", description: "", category: "attack", tags: ["melee"],
      cooldown: 0.3, targeting: "enemy", range: 60,
      effects: [{ kind: "damage", damage: { base: 1, scale: "attack", type: "physical", inflict: { status: "bleed", chance: 1 } } }],
    };
    new AbilityRuntime().castAbility(w, hero.id, jab, CAST);
    check("an ordinary skill's kill + ailment charged the ultimate meter",
      hero.resources.get("ultimate")!.value >= 1.2, `meter ${hero.resources.get("ultimate")!.value}`);
  }

  // the ultimate's own kills / crits / ailments do NOT
  {
    const { w, hero, enemies } = world();
    hero.resources = new ResourceSet([ultimateMeter]);
    hero.resources.get("ultimate")!.value = 0;
    for (const e of enemies) e.health = 5;
    enemies[2]!.x = 50; // bring the far one into range
    const worldbreaker: Ability = {
      id: "test.worldbreaker", name: "Worldbreaker", description: "", category: "ultimate",
      tags: ["ultimate", "heavy", "area"], cooldown: 0, targeting: "radius", range: 120,
      shape: { radius: 120 }, isUltimate: true,
      effects: [{ kind: "damage", damage: { base: 5, scale: "attack", type: "physical", canCrit: true,
        inflict: { status: "bleed", chance: 1 } } }],
    };
    const r = new AbilityRuntime().castAbility(w, hero.id, worldbreaker, { ...CAST, critChance: 1, aim: { x: 30, y: 0 } });
    check("the ultimate fired and killed the pack", r.ok && enemies.every((e) => !e.alive));
    check("every ultimate packet is flagged fromUltimate", w.damageLog.every((d) => isUltimateSourced(d.packet)));
    check("THE ULTIMATE RULE: the meter did not refill from its own kills", hero.resources.get("ultimate")!.value === 0,
      `meter ${hero.resources.get("ultimate")!.value}`);
  }

  // a documented exception is still possible, explicitly
  {
    const { w, hero, enemies } = world();
    hero.resources = new ResourceSet([{
      ...ultimateMeter,
      generation: [{ on: "kill", amount: 1, allowFromUltimate: true }],
    }]);
    enemies[0]!.health = 5;
    const feedback: Ability = {
      id: "test.feedback", name: "Feedback Loop", description: "", category: "ultimate",
      tags: ["ultimate"], cooldown: 0, targeting: "enemy", range: 80, isUltimate: true,
      generatesUltimateCharge: true,
      effects: [{ kind: "damage", damage: { base: 5, scale: "attack", type: "physical" }, to: "target" }],
    };
    new AbilityRuntime().castAbility(w, hero.id, feedback, CAST);
    check("an explicit opt-in exception still works", hero.resources.get("ultimate")!.value === 1);
  }

  // --- rateMultiplier: what makes `Mods.ultimateRate` mean something ---
  // The modifier was declared, priced and rolled as a real epic-and-up affix while
  // nothing in the simulation read it, so "of Ascent" did nothing at all. These pin the
  // seam that fixed it, and pin that it cannot be used to dodge the rule above.
  {
    const pool = new ResourcePool({ ...ultimateMeter, generation: [{ on: "kill", amount: 1 }] });
    pool.handleEvent({ type: "kill" });
    const base = pool.value;

    const fast = new ResourcePool({ ...ultimateMeter, generation: [{ on: "kill", amount: 1 }] });
    fast.rateMultiplier = 1.5;
    const gained = fast.handleEvent({ type: "kill" });
    check("a rate multiplier scales what a generation rule grants",
      fast.value === base * 1.5, `${base} → ${fast.value}`);
    check("…and handleEvent reports the amount actually credited", gained === base * 1.5);

    const slow = new ResourcePool({ ...ultimateMeter, generation: [{ on: "kill", amount: 1 }] });
    slow.rateMultiplier = 0;
    slow.handleEvent({ type: "kill" });
    check("a zero rate multiplier grants nothing rather than going negative",
      slow.value === 0);

    const regen = new ResourcePool({ ...ultimateMeter, regenPerSec: 2, generation: [] });
    regen.rateMultiplier = 2;
    regen.tick(1);
    check("it scales per-second regen too", regen.value === 4, `${regen.value}`);

    // The important negative: a rate bonus must not talk an event past the rule.
    const ultSourced = new ResourcePool({ ...ultimateMeter, generation: [{ on: "kill", amount: 1 }] });
    ultSourced.rateMultiplier = 3;
    ultSourced.handleEvent({ type: "kill", fromUltimate: true });
    check("THE ULTIMATE RULE still refuses an ultimate-sourced event at any rate",
      ultSourced.value === 0, `meter ${ultSourced.value}`);

    const tagged = new ResourcePool({
      ...ultimateMeter,
      generation: [{ on: "kill", amount: 1, requireTags: ["melee"] }],
    });
    tagged.rateMultiplier = 3;
    // A real tag that is not "melee". This read `["spell"]`, which is not in the tag
    // union at all — so the gate was refusing something nothing could ever send it.
    tagged.handleEvent({ type: "kill", tags: ["ranged"] });
    check("a requireTags gate still refuses a non-matching event at any rate",
      tagged.value === 0);

    // And the live wiring: the mod has to reach the multiplier.
    const plain = new Player("berserker");
    check("a character with no ultimateRate charges at exactly 1x",
      plain.ultimateChargeMult === 1);
    check("ultimateChargeMult reads the modifier",
      new Player("berserker").ultimateChargeMult === 1
      && Math.abs(chargeMultWith(0.25) - 1.25) < 1e-9,
      `+25% → ${chargeMultWith(0.25)}`);
    check("a negative total can't invert charging into draining",
      chargeMultWith(-5) === 0);
  }
}

/** `Player.ultimateChargeMult` for a character carrying `value` of `ultimateRate`. */
function chargeMultWith(value: number): number {
  const p = new Player("berserker");
  p.equipment.ring = {
    id: "test-ring", name: "Test Ring", rarity: "epic", type: "ring", slot: "ring",
    family: null, ilvl: 1, stats: zeroStats(),
    mods: [{ id: "ascendant", key: "ultimateRate", value }],
    grant: null, trigger: null, named: null, value: 1,
  };
  p.refresh();
  return p.ultimateChargeMult;
}

// =========================================================================
console.log("\n=== reactive re-entrancy: a counter that causes the event it counters ===");
{
  // A live crash, found Sept 2026 by playing all 21 classes on one floor: the Duelist
  // ended the run outright with `Cannot read properties of undefined (reading 'kind')`
  // inside `AbilityRuntime.notify`. Reproduced deterministically on the depth-20 trash
  // floor at seed 72231, and in a browser it does not throw into a harness — it ends the
  // player's run and their unbanked loot with it.
  //
  // The mechanism: `notify` walked `this.pending` by index and spliced as it went, then
  // called `runEffect` *inside* that walk. A counter deals damage; damage makes the host
  // emit; the emit lands back in `notify`, which splices the same array. The outer walk's
  // index then points into an array that no longer has those entries. The Duelist opens
  // three `damageTaken` windows and is built entirely around countering, so it is the
  // class that reaches three-deep re-entrancy first — but nothing about this is Duelist-
  // specific, which is why the check below is the invariant rather than that one floor.
  //
  // Modelled here on `hit` rather than `damageTaken` only because `MockWorld.dealDamage`
  // emits `hit` — the wiring is otherwise the real thing: `REACTIVE_EVENTS` bridged to
  // `notify` exactly as `src/game/abilities.ts` bridges it.
  const { w, hero, enemies } = world();
  const rt = new AbilityRuntime();
  w.bus.on("hit", (evt) => {
    if (evt.actorId === hero.id) rt.notify("hit", w);
  });

  const counter = (window: number): EffectStep => ({
    kind: "reactive", event: "hit", window,
    effects: [{ kind: "damage", damage: { base: 0.5, scale: "attack", type: "physical" }, to: "enemies" }],
  });
  const aim = { ...CAST, aim: { x: enemies[0]!.x, y: enemies[0]!.y } };

  /** Arms `n` counter windows, throws one hit, and reports what came back. */
  const provoke = (n: number): { threw: string; packets: number; left: number } => {
    const stance: Ability = {
      id: "test.stance", name: "Counter Stance", description: "",
      tags: ["melee"], cooldown: 0, targeting: "self", range: 60, category: "attack",
      effects: Array.from({ length: n }, () => counter(4)),
    };
    rt.castAbility(w, hero.id, stance, aim);
    const before = w.damageLog.length;
    let threw = "";
    try {
      // The kick-off: one hit by the hero. Everything after this is the runtime
      // re-entering itself.
      w.bus.emit({ type: "hit", actorId: hero.id });
    } catch (e) {
      threw = String(e).split("\n")[0]!;
    }
    return { threw, packets: w.damageLog.length - before, left: rt.pending.length };
  };

  // One window is the control: it re-enters once, finds nothing owed, and stops. Whatever
  // one firing costs in damage packets, three firings must cost exactly three times — a
  // comparison rather than a pinned number, so a change to how many bodies a counter
  // reaches can't quietly turn this check into a tautology.
  const one = provoke(1);
  check("a single counter window fires and re-enters harmlessly",
    one.threw === "" && one.packets > 0 && one.left === 0, one.threw || `${one.packets} packets`);

  // Three is where it used to die: the outer walk removes the third, the re-entrant call
  // clears the other two, and the outer walk then reads an index that is no longer there.
  const three = provoke(3);
  check("a counter that causes its own event does not crash the runtime", three.threw === "", three.threw);
  check("every window that was owed still fired", three.packets === one.packets * 3,
    `${three.packets} vs ${one.packets} × 3`);
  check("…and none of them fired twice", three.left === 0, `${three.left} left pending`);
}

console.log(`\n${failures === 0 ? "ALL VOCAB CHECKS PASSED" : `${failures} VOCAB CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
