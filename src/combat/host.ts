/**
 * The seam between the combat vocabulary and whatever is running it.
 *
 * The ability executor and the status/resource runtimes never touch the dungeon
 * directly. They talk to a `CombatHost`: give me an actor, deal this packet, spawn
 * this projectile, move this body, tell the bus something happened. The real dungeon
 * implements this against its own entity arrays; the headless test implements it
 * against a handful of plain objects. Same executor, both.
 *
 * Pure interface. No implementation lives here.
 */

import type { DamagePacket } from "./damage";
import type { EventBus } from "./triggers";
import type { ResourceSet } from "./resources";
import type { StatusContainer } from "./status";
import type { TargetActor, TargetQueryHost } from "./targeting";
import type { MinionCommand } from "./ability";

export interface HostActor extends TargetActor {
  kind: "hero" | "enemy" | "minion" | "pet" | "totem";
  statuses: StatusContainer;
  resources?: ResourceSet;
  /** Owner index, for a minion/pet/totem. */
  ownerId?: number;
}

export interface MoveRequest {
  style: "dash" | "blink" | "vault" | "charge" | "teleport";
  toPoint?: { x: number; y: number };
  toActorId?: number;
  distance?: number;
  leaveAnchor?: boolean;
  iframes?: number;
}

export interface ProjectileRequest {
  ownerId: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  radius: number;
  life: number;
  pierce: number;
  damage: DamagePacket;
  behavior: "line" | "homing" | "lob" | "boomerang" | "orbit";
}

export interface ZoneRequest {
  ownerId: number;
  x: number;
  y: number;
  radius: number;
  duration: number;
  tickInterval: number;
  follows: boolean;
  mergeable: boolean;
  damage?: DamagePacket;
  benefit?: "heal" | "shield" | "haste";
  status?: { id: string; chance: number };
  /** `line` zone: the far end of the segment. `x`/`y` is the near end, `radius` its half-width. */
  x2?: number;
  y2?: number;
  /** Damage multiplier this zone confers on its owner's projectiles passing through it. */
  empowerProjectiles?: number;
}

export interface MinionRequest {
  ownerId: number;
  unit: string;
  x: number;
  y: number;
  count: number;
  duration: number;
  command: MinionCommand;
}

export interface TerrainRequest {
  ownerId: number;
  x: number;
  y: number;
  angle: number;
  piece: "wall" | "anchor" | "cover" | "barricade";
  length: number;
  duration: number;
  hp: number;
}

/**
 * Everything the runtime asks of the world. Extends `TargetQueryHost` so the same
 * object satisfies `resolveTargets`.
 */
export interface CombatHost extends TargetQueryHost {
  now(): number;
  random(): number;

  actor(id: number): HostActor | undefined;
  bus: EventBus;

  /** Applies mitigation, deals the packet, returns the damage actually dealt. */
  dealDamage(targetId: number, packet: DamagePacket): number;
  healActor(targetId: number, amount: number, sourceId: number, overTime?: number): void;
  shieldActor(targetId: number, amount: number, duration: number, sourceId: number, absorbOneHit?: boolean): void;
  moveActor(id: number, req: MoveRequest): void;

  spawnProjectile(req: ProjectileRequest): number;
  spawnZone(req: ZoneRequest): number;
  spawnMinion(req: MinionRequest): number[];
  spawnTerrain(req: TerrainRequest): number;
  /** Removes up to `count` corpses (or every one for "all"); returns how many were taken. */
  consumeCorpses(count: number | "all"): number;

  setThreat(targetId: number, op: "taunt" | "drop" | "generate", sourceId: number, amount: number): void;
  applyImpulse(targetId: number, fromX: number, fromY: number, force: number): void;
  interruptCasts(x: number, y: number, radius: number): void;

  /** Re-order the summons an owner controls (Command: Ravage). */
  commandSummons(ownerId: number, behavior: MinionCommand["behavior"], targetId?: number): void;
  /** Kill up to `count` of the owner's summons; returns how many actually died. */
  sacrificeSummons(ownerId: number, count: number): number;
  /**
   * Bind `wardId` to `protectorId`: a fraction of the ward's incoming damage is dealt
   * to the protector instead, for `duration` seconds.
   */
  redirectDamage(protectorId: number, wardId: number, fraction: number, duration: number): void;

  emitFx(ref: string, x: number, y: number): void;
  /**
   * A hitscan tracer from `(x0,y0)` to `(x1,y1)` — the visible half of an ability that
   * resolves damage instantly at range (`docs/ability-fx.md`).
   *
   * Purely an output. The implementation must not read or advance the simulation's rng,
   * and nothing in `combat/` or `game/` may read anything back from it; `tools/abilityfx.ts`
   * replays a seeded floor with tracers on and off and requires the outcomes to be
   * byte-identical.
   */
  emitTracer(style: string, element: string, x0: number, y0: number, x1: number, y1: number): void;
}
