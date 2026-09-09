/**
 * Skill mutations — the reusable way a tree node, a hybrid, an archetype or an item
 * changes what an existing ability *does* without a second copy of that ability.
 *
 * The spec's canonical case (§3.11): `Corpse Bomb` and `Corpse Bomb → Bone Structure`
 * are one ability id. The first detonates a corpse; the second, with the Bone Structure
 * mutation applied, raises a bone turret from it instead. That is a `replaceEffects` op.
 * Less dramatic changes — a thrust that reaches further, a projectile that pierces one
 * more body, a dash that grants i-frames — are single-field ops on the matching
 * `EffectStep`s.
 *
 * A `SkillMutation` is pure data: a target predicate plus an ordered list of ops.
 * `applyMutations` deep-clones the ability and folds the ops in; the original is never
 * touched, so the same base ability can be re-resolved every time the build changes.
 *
 * The op kinds line up one-to-one with `MutationKind` in `combat/ability.ts`:
 *   damagePacket · targeting · projectile · movement · resource · status · zone ·
 *   summon · trigger · followUp/addEffect · replaceEffects
 * plus two conveniences the audit calls for by name (cooldown, tags).
 */

import type { Ability, EffectStep } from "../combat/ability";
import type { DamageChannel, DamageType } from "../combat/damage";
import type { ResourceId } from "../combat/resources";
import type { StatusId } from "../combat/status";
import type { SkillTag } from "../combat/tags";
import type { TargetingMode } from "../combat/targeting";
import type { CombatEventType } from "../combat/triggers";

type MoveStep = Extract<EffectStep, { kind: "move" }>;
type ProjectileStep = Extract<EffectStep, { kind: "projectile" }>;
type SummonStep = Extract<EffectStep, { kind: "summon" }>;

type Cost = { resource: ResourceId; amount: number };

/** One rewrite. Every field is optional past `kind`; an op applies only what it names. */
export type MutationOp =
  /** damage modification — hits the `damage` of every damage / projectile / zone step. */
  | {
      kind: "damagePacket";
      scaleBase?: number;
      addBase?: number;
      setType?: DamageType;
      setChannel?: DamageChannel;
      addExecuteMissingHealth?: number;
      setKnockback?: number;
      /** Give the hit an on-hit status rider it didn't have (or replace the one it did). */
      setInflict?: { status: StatusId; chance: number; potency?: number };
    }
  /** targeting modification — the ability's mode / range / shape. */
  | {
      kind: "targeting";
      setMode?: TargetingMode;
      addRange?: number;
      scaleRange?: number;
      scaleArc?: number;
      scaleWidth?: number;
      scaleLength?: number;
      scaleRadius?: number;
    }
  /** projectile modification — every projectile step. */
  | {
      kind: "projectile";
      addCount?: number;
      addPierce?: number;
      scaleSpeed?: number;
      scaleRadius?: number;
      scaleLife?: number;
      setBehavior?: NonNullable<ProjectileStep["projectile"]["behavior"]>;
      addOnExpire?: readonly EffectStep[];
    }
  /** movement modification — every move step. */
  | {
      kind: "movement";
      setStyle?: MoveStep["style"];
      scaleDistance?: number;
      addDistance?: number;
      addIframes?: number;
      forceLeaveAnchor?: boolean;
    }
  /** resource modification — the ability's costs / self-generation. */
  | {
      kind: "resource";
      scaleCost?: number;
      addCost?: number;
      setCost?: number;
      removeCost?: ResourceId;
      addCostEntry?: Cost;
      addGenerates?: Cost;
    }
  /** status modification — every status step, plus any on-hit rider and zone status. */
  | {
      kind: "status";
      scaleChance?: number;
      scaleDuration?: number;
      scalePotency?: number;
      addStacks?: number;
      /** Rewrite one status id to another wherever it appears in the ability. */
      swap?: { from: StatusId; to: StatusId };
    }
  /** zone modification — every zone step. */
  | {
      kind: "zone";
      scaleRadius?: number;
      scaleDuration?: number;
      scaleTickInterval?: number;
      scaleDamage?: number;
      forceMergeable?: boolean;
      forceFollows?: boolean;
      setStatus?: { id: StatusId; chance: number };
    }
  /** summon modification — every summon step. */
  | {
      kind: "summon";
      addCount?: number;
      scaleDuration?: number;
      setBehavior?: NonNullable<SummonStep["command"]>["behavior"];
      addInheritPower?: number;
    }
  /** trigger modification — bolt a reactive window onto the ability. */
  | { kind: "trigger"; event: CombatEventType; window: number; effects: readonly EffectStep[] }
  /** follow-up effects — append to (or create) the ability's recast window. */
  | { kind: "followUp"; window: number; effects: readonly EffectStep[] }
  /** extra steps, run before or after the ability's own. */
  | { kind: "addEffect"; at: "start" | "end"; effects: readonly EffectStep[] }
  /** effect replacement — the Corpse Bomb → Bone Structure case. */
  | { kind: "replaceEffects"; effects: readonly EffectStep[] }
  /** cooldown change (audit P9). */
  | { kind: "cooldown"; scale?: number; add?: number }
  /** extra tags, so downstream tag-targeted rules start seeing this ability. */
  | { kind: "addTags"; tags: readonly SkillTag[] };

export interface MutationTarget {
  /** Match one ability by id. */
  abilityId?: string;
  /** Match any ability carrying this tag. */
  withTag?: SkillTag;
  /** Match any ability carrying *all* of these tags. */
  withAllTags?: readonly SkillTag[];
  /** Match every ability — a deliberate global rewrite. */
  all?: boolean;
}

export interface SkillMutation {
  id: string;
  /** Short label for a tooltip: "Impaling Thrust → Through Flesh". */
  label?: string;
  note?: string;
  target: MutationTarget;
  ops: readonly MutationOp[];
}

/** True when this mutation's target predicate selects `ability`. */
export function mutationMatches(mut: SkillMutation, ability: Ability): boolean {
  const t = mut.target;
  if (t.all) return true;
  if (t.abilityId !== undefined && t.abilityId === ability.id) return true;
  if (t.withTag !== undefined && ability.tags.includes(t.withTag)) return true;
  if (t.withAllTags && t.withAllTags.length > 0 && t.withAllTags.every((x) => ability.tags.includes(x))) {
    return true;
  }
  return false;
}

/**
 * Returns a new ability with every matching mutation's ops folded in, in order. When
 * nothing matches the input ability is returned as-is (no clone).
 */
export function applyMutations(ability: Ability, mutations: readonly SkillMutation[]): Ability {
  const applicable = mutations.filter((m) => mutationMatches(m, ability));
  if (applicable.length === 0) return ability;
  const draft = clone(ability);
  for (const mut of applicable) {
    for (const op of mut.ops) applyOp(draft, op);
  }
  return draft;
}

// --- internals ---------------------------------------------------------

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Visits every effect step, descending into the nested lists a step can carry. */
function walkSteps(steps: readonly EffectStep[], visit: (s: EffectStep) => void): void {
  for (const s of steps) {
    visit(s);
    switch (s.kind) {
      case "projectile":
        if (s.projectile.onExpire) walkSteps(s.projectile.onExpire, visit);
        break;
      case "delay":
        walkSteps(s.effects, visit);
        break;
      case "reactive":
        walkSteps(s.effects, visit);
        break;
      case "followUp":
        walkSteps(s.effects, visit);
        break;
      case "consumeStatus":
        if (s.then) walkSteps(s.then, visit);
        break;
      case "consumeSummons":
        if (s.then) walkSteps(s.then, visit);
        break;
      case "random":
        for (const c of s.choices) walkSteps(c.effects, visit);
        break;
      default:
        break;
    }
  }
}

function applyOp(draft: Ability, op: MutationOp): void {
  const steps = draft.effects as EffectStep[];

  switch (op.kind) {
    case "replaceEffects":
      draft.effects = clone(op.effects) as EffectStep[];
      return;

    case "addEffect": {
      const add = clone(op.effects) as EffectStep[];
      draft.effects = op.at === "start" ? [...add, ...steps] : [...steps, ...add];
      return;
    }

    case "addTags":
      draft.tags = [...new Set<SkillTag>([...draft.tags, ...op.tags])];
      return;

    case "cooldown":
      if (op.scale !== undefined) draft.cooldown *= op.scale;
      if (op.add !== undefined) draft.cooldown = Math.max(0, draft.cooldown + op.add);
      return;

    case "followUp": {
      const fresh = clone(op.effects) as EffectStep[];
      const prior = draft.followUp ? [...draft.followUp.effects] : [];
      draft.followUp = { window: op.window, effects: [...prior, ...fresh] };
      return;
    }

    case "trigger":
      draft.effects = [
        ...steps,
        { kind: "reactive", event: op.event, window: op.window, effects: clone(op.effects) as EffectStep[] },
      ];
      return;

    case "targeting": {
      if (op.setMode) draft.targeting = op.setMode;
      if (op.addRange !== undefined) draft.range = (draft.range ?? 0) + op.addRange;
      if (op.scaleRange !== undefined) draft.range = (draft.range ?? 0) * op.scaleRange;
      const sh = draft.shape;
      if (sh) {
        if (op.scaleArc !== undefined && sh.arc !== undefined) sh.arc *= op.scaleArc;
        if (op.scaleWidth !== undefined && sh.width !== undefined) sh.width *= op.scaleWidth;
        if (op.scaleLength !== undefined && sh.length !== undefined) sh.length *= op.scaleLength;
        if (op.scaleRadius !== undefined && sh.radius !== undefined) sh.radius *= op.scaleRadius;
      }
      return;
    }

    case "resource": {
      let costs: Cost[] = draft.costs ? draft.costs.map((c) => ({ ...c })) : [];
      if (op.removeCost) costs = costs.filter((c) => c.resource !== op.removeCost);
      for (const c of costs) {
        if (op.scaleCost !== undefined) c.amount *= op.scaleCost;
        if (op.addCost !== undefined) c.amount = Math.max(0, c.amount + op.addCost);
        if (op.setCost !== undefined) c.amount = op.setCost;
      }
      if (op.addCostEntry) costs.push({ ...op.addCostEntry });
      draft.costs = costs;
      if (op.addGenerates) {
        const gen: Cost[] = draft.generates ? draft.generates.map((g) => ({ ...g })) : [];
        gen.push({ ...op.addGenerates });
        draft.generates = gen;
      }
      return;
    }

    case "damagePacket":
      walkSteps(steps, (s) => {
        const dt =
          s.kind === "damage"
            ? s.damage
            : s.kind === "projectile"
              ? s.projectile.damage
              : s.kind === "zone"
                ? s.zone.damage
                : undefined;
        if (!dt) return;
        if (op.scaleBase !== undefined) dt.base *= op.scaleBase;
        if (op.addBase !== undefined) dt.base += op.addBase;
        if (op.setType) dt.type = op.setType;
        if (op.setChannel) dt.channel = op.setChannel;
        if (op.addExecuteMissingHealth !== undefined) {
          dt.executeMissingHealth = (dt.executeMissingHealth ?? 0) + op.addExecuteMissingHealth;
        }
        if (op.setKnockback !== undefined) dt.knockback = op.setKnockback;
        if (op.setInflict) dt.inflict = { ...op.setInflict };
      });
      return;

    case "status":
      walkSteps(steps, (s) => {
        if (s.kind === "status") {
          if (op.scaleChance !== undefined) s.chance = (s.chance ?? 1) * op.scaleChance;
          if (op.scaleDuration !== undefined) s.durationMult = (s.durationMult ?? 1) * op.scaleDuration;
          if (op.scalePotency !== undefined) s.potency = (s.potency ?? 1) * op.scalePotency;
          if (op.addStacks !== undefined) s.stacks = (s.stacks ?? 1) + op.addStacks;
          if (op.swap && s.status === op.swap.from) s.status = op.swap.to;
        }
        if (op.swap) {
          if ((s.kind === "damage" || s.kind === "projectile" || s.kind === "zone")) {
            const dt = s.kind === "damage" ? s.damage : s.kind === "projectile" ? s.projectile.damage : s.zone.damage;
            if (dt?.inflict && dt.inflict.status === op.swap.from) dt.inflict.status = op.swap.to;
          }
          if (s.kind === "zone" && s.zone.status && s.zone.status.id === op.swap.from) {
            s.zone.status.id = op.swap.to;
          }
        }
      });
      return;

    case "projectile":
      walkSteps(steps, (s) => {
        if (s.kind !== "projectile") return;
        const p = s.projectile;
        if (op.addCount !== undefined) p.count = (p.count ?? 1) + op.addCount;
        if (op.addPierce !== undefined) p.pierce = (p.pierce ?? 0) + op.addPierce;
        if (op.scaleSpeed !== undefined) p.speed *= op.scaleSpeed;
        if (op.scaleRadius !== undefined) p.radius *= op.scaleRadius;
        if (op.scaleLife !== undefined) p.life *= op.scaleLife;
        if (op.setBehavior) p.behavior = op.setBehavior;
        if (op.addOnExpire) p.onExpire = [...(p.onExpire ?? []), ...(clone(op.addOnExpire) as EffectStep[])];
      });
      return;

    case "movement":
      walkSteps(steps, (s) => {
        if (s.kind !== "move") return;
        if (op.setStyle) s.style = op.setStyle;
        if (op.scaleDistance !== undefined && s.distance !== undefined) s.distance *= op.scaleDistance;
        if (op.addDistance !== undefined) s.distance = (s.distance ?? 0) + op.addDistance;
        if (op.addIframes !== undefined) s.iframes = (s.iframes ?? 0) + op.addIframes;
        if (op.forceLeaveAnchor) s.leaveAnchor = true;
      });
      return;

    case "zone":
      walkSteps(steps, (s) => {
        // "heal-over-time effects last longer" (Bard's Sustained Note) targets `withTag:
        // "heal"` — that catches a bare heal step as well as a heal zone, and a HoT's
        // length lives on `overTime.duration`.
        if (s.kind === "heal" && s.overTime && op.scaleDuration !== undefined) {
          s.overTime.duration *= op.scaleDuration;
          return;
        }
        if (s.kind !== "zone") return;
        const z = s.zone;
        if (op.scaleRadius !== undefined) z.radius *= op.scaleRadius;
        if (op.scaleDuration !== undefined) z.duration *= op.scaleDuration;
        if (op.scaleTickInterval !== undefined) z.tickInterval *= op.scaleTickInterval;
        if (op.scaleDamage !== undefined && z.damage) z.damage.base *= op.scaleDamage;
        if (op.forceMergeable) z.mergeable = true;
        if (op.forceFollows) z.follows = true;
        if (op.setStatus) z.status = { ...op.setStatus };
      });
      return;

    case "summon":
      walkSteps(steps, (s) => {
        if (s.kind !== "summon") return;
        if (op.addCount !== undefined) s.count += op.addCount;
        if (op.scaleDuration !== undefined && s.duration !== undefined) s.duration *= op.scaleDuration;
        if (op.setBehavior || op.addInheritPower !== undefined) {
          const cmd = s.command ?? { behavior: "aggroNearest" as const };
          if (op.setBehavior) cmd.behavior = op.setBehavior;
          if (op.addInheritPower !== undefined) cmd.inheritPower = (cmd.inheritPower ?? 1) + op.addInheritPower;
          s.command = cmd;
        }
      });
      return;
  }
}
