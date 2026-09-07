/**
 * Targeting — turning "who does this skill hit" into data.
 *
 * Skills must not hard-code "find nearest enemy". A Paladin's Shield of Faith wants
 * the lowest-health ally; a Juggernaut's Fortress Call wants everyone behind him; an
 * Assassin's Execution wants the marked target; a Necromancer's Corpse Walk wants a
 * corpse. `resolveTargets` takes a mode and a context and hands back points, actors,
 * a corpse or a zone — and the ability executor doesn't care which.
 *
 * Pure geometry over a small host interface. No simulation state of its own.
 */

export type TargetingMode =
  | "self"
  | "ally"
  | "enemy"
  | "point"
  | "direction"
  | "line"
  | "cone"
  | "radius"
  | "currentTarget"
  | "markedTarget"
  | "lowestHealthAlly"
  | "highestThreatEnemy"
  | "corpse"
  | "summon"
  | "zone"
  /** A position the caster occupied earlier — the Magician's Paradox / temporal anchor. */
  | "temporalAnchor";

export type Faction = "player" | "enemy" | "neutral";

export interface TargetActor {
  id: number;
  x: number;
  y: number;
  faction: Faction;
  health: number;
  maxHealth: number;
  alive: boolean;
}

export interface TargetPoint {
  x: number;
  y: number;
}

export interface TargetContext {
  casterId: number;
  casterFaction: Faction;
  origin: TargetPoint;
  facing: number;
  /** Aim point supplied by input, for point / direction / line / cone. */
  aim?: TargetPoint;
  currentTargetId?: number;
  range: number;
  shape?: { radius?: number; width?: number; length?: number; arc?: number };
  /**
   * Positions the caster occupied on earlier ticks, most-recent first. `temporalAnchor`
   * targeting reads the oldest one still inside `range`; a teleport skill records one
   * here so the next spell can originate from where the caster *was*.
   */
  positionHistory?: readonly TargetPoint[];
}

export interface TargetQueryHost {
  actors(): Iterable<TargetActor>;
  corpses(): Iterable<{ id: number; x: number; y: number }>;
  zones(): Iterable<{ id: number; x: number; y: number }>;
  summonsOf(actorId: number): Iterable<TargetActor>;
  markOf(actorId: number): number | undefined;
  threatToward(actorId: number): number;
}

export interface TargetResult {
  point?: TargetPoint;
  direction?: number;
  actorIds: number[];
  corpseId?: number;
  zoneId?: number;
}

/** True when `other` is on the caster's side. */
function isAlly(casterFaction: Faction, other: Faction): boolean {
  return casterFaction === other;
}

export function resolveTargets(
  mode: TargetingMode,
  ctx: TargetContext,
  host: TargetQueryHost,
): TargetResult {
  const empty: TargetResult = { actorIds: [] };
  const aim = ctx.aim ?? {
    x: ctx.origin.x + Math.cos(ctx.facing) * ctx.range,
    y: ctx.origin.y + Math.sin(ctx.facing) * ctx.range,
  };
  const dir = Math.atan2(aim.y - ctx.origin.y, aim.x - ctx.origin.x);

  switch (mode) {
    case "self":
      return { actorIds: [ctx.casterId] };

    case "point":
      return { ...empty, point: clampToRange(ctx.origin, aim, ctx.range) };

    case "direction":
      return { ...empty, direction: dir, point: aim };

    case "currentTarget":
      return ctx.currentTargetId !== undefined
        ? { actorIds: [ctx.currentTargetId] }
        : empty;

    case "markedTarget": {
      const marked = host.markOf(ctx.casterId);
      return marked !== undefined ? { actorIds: [marked] } : empty;
    }

    case "corpse": {
      let best: { id: number; d: number } | undefined;
      for (const c of host.corpses()) {
        const d = dist2(c, aim);
        if (!best || d < best.d) best = { id: c.id, d };
      }
      return best ? { ...empty, corpseId: best.id } : empty;
    }

    case "zone": {
      let best: { id: number; d: number } | undefined;
      for (const z of host.zones()) {
        const d = dist2(z, aim);
        if (!best || d < best.d) best = { id: z.id, d };
      }
      return best ? { ...empty, zoneId: best.id } : empty;
    }

    case "summon":
      return { actorIds: [...host.summonsOf(ctx.casterId)].map((s) => s.id) };

    case "temporalAnchor": {
      const history = ctx.positionHistory ?? [];
      // the oldest recorded position still within reach — "where I was a moment ago"
      for (let i = history.length - 1; i >= 0; i--) {
        const p = history[i]!;
        if (withinRange(ctx.origin, p, ctx.range || Infinity)) {
          return { ...empty, point: { x: p.x, y: p.y } };
        }
      }
      return history.length ? { ...empty, point: { ...history[history.length - 1]! } } : empty;
    }

    case "ally": {
      const allies = liveActors(host).filter(
        (a) => isAlly(ctx.casterFaction, a.faction) && withinRange(ctx.origin, a, ctx.range),
      );
      return { actorIds: nearestFirst(allies, ctx.origin).map((a) => a.id) };
    }

    case "lowestHealthAlly": {
      const allies = liveActors(host).filter(
        (a) => isAlly(ctx.casterFaction, a.faction) && withinRange(ctx.origin, a, ctx.range),
      );
      allies.sort((a, b) => a.health / a.maxHealth - b.health / b.maxHealth);
      return { actorIds: allies.length ? [allies[0]!.id] : [] };
    }

    case "highestThreatEnemy": {
      const enemies = liveActors(host).filter(
        (a) => !isAlly(ctx.casterFaction, a.faction) && withinRange(ctx.origin, a, ctx.range),
      );
      enemies.sort((a, b) => host.threatToward(b.id) - host.threatToward(a.id));
      return { actorIds: enemies.length ? [enemies[0]!.id] : [] };
    }

    case "enemy": {
      const enemies = liveActors(host).filter(
        (a) => !isAlly(ctx.casterFaction, a.faction) && withinRange(ctx.origin, a, ctx.range),
      );
      return { actorIds: nearestFirst(enemies, ctx.origin).map((a) => a.id) };
    }

    case "radius": {
      const r = ctx.shape?.radius ?? ctx.range;
      const center = ctx.aim ?? ctx.origin;
      const hits = liveActors(host).filter(
        (a) => !isAlly(ctx.casterFaction, a.faction) && withinRange(center, a, r),
      );
      return { ...empty, point: center, actorIds: hits.map((a) => a.id) };
    }

    case "line": {
      const length = ctx.shape?.length ?? ctx.range;
      const halfWidth = (ctx.shape?.width ?? 20) / 2;
      const hits = liveActors(host).filter(
        (a) =>
          !isAlly(ctx.casterFaction, a.faction) &&
          pointInLine(ctx.origin, dir, length, halfWidth, a),
      );
      return { ...empty, direction: dir, actorIds: hits.map((a) => a.id) };
    }

    case "cone": {
      const length = ctx.shape?.length ?? ctx.range;
      const arc = ctx.shape?.arc ?? Math.PI / 2;
      const hits = liveActors(host).filter(
        (a) =>
          !isAlly(ctx.casterFaction, a.faction) &&
          pointInCone(ctx.origin, dir, length, arc, a),
      );
      return { ...empty, direction: dir, actorIds: hits.map((a) => a.id) };
    }

    default:
      return empty;
  }
}

// --- geometry ------------------------------------------------------------

function liveActors(host: TargetQueryHost): TargetActor[] {
  return [...host.actors()].filter((a) => a.alive);
}

function nearestFirst(actors: TargetActor[], origin: TargetPoint): TargetActor[] {
  return [...actors].sort((a, b) => dist2(a, origin) - dist2(b, origin));
}

function dist2(a: TargetPoint, b: TargetPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function withinRange(origin: TargetPoint, a: TargetPoint, range: number): boolean {
  return dist2(origin, a) <= range * range;
}

function clampToRange(origin: TargetPoint, aim: TargetPoint, range: number): TargetPoint {
  const dx = aim.x - origin.x;
  const dy = aim.y - origin.y;
  const d = Math.hypot(dx, dy);
  if (d <= range || d === 0) return { x: aim.x, y: aim.y };
  return { x: origin.x + (dx / d) * range, y: origin.y + (dy / d) * range };
}

function pointInLine(
  origin: TargetPoint,
  dir: number,
  length: number,
  halfWidth: number,
  p: TargetPoint,
): boolean {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const along = dx * Math.cos(dir) + dy * Math.sin(dir);
  if (along < 0 || along > length) return false;
  const perp = -dx * Math.sin(dir) + dy * Math.cos(dir);
  return Math.abs(perp) <= halfWidth;
}

function pointInCone(
  origin: TargetPoint,
  dir: number,
  length: number,
  arc: number,
  p: TargetPoint,
): boolean {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const d = Math.hypot(dx, dy);
  if (d > length || d === 0) return false;
  let delta = Math.atan2(dy, dx) - dir;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta) <= arc / 2;
}
