/**
 * The damage packet — one object that carries a hit from wherever it started to
 * wherever it lands.
 *
 * The old simulation passed damage around as a bare `number` plus an element string
 * plus a loose options bag, which meant nothing downstream could tell a DoT tick from
 * a sword swing from an ultimate's explosion. A modifier that wanted to say "+15% to
 * enemies that are already bleeding" had no way to avoid also meaning "+15% to the
 * bleed itself".
 *
 * A `DamagePacket` fixes that. It knows its **type** (what element), its **channel**
 * (what kind of damage — a hit, a periodic tick, minion damage, ultimate damage), and
 * its **source** (who and which ability, and crucially whether that ability was an
 * ultimate). Every modifier in the game can now be written against a channel or a tag
 * without leaking into the others.
 *
 * Pure data + pure functions. No DOM, no simulation state.
 */

import { ELEMENTS, type Element } from "../data/elements";
import type { SkillTag } from "./tags";
import { hasAnyTag } from "./tags";

// --- damage types --------------------------------------------------------------

/**
 * `holy` / `arcane` / `nature` were once carried here as "extra" types outside
 * `ELEMENTS`. They were promoted into `ELEMENTS` proper (each grew a resist stat, a
 * material and an essence) in the elements-promotion stage of the combat cutover, so
 * this list is now empty — kept only so old imports keep compiling.
 */
export const EXTRA_DAMAGE_TYPES = [] as const;
export type ExtraDamageType = never;

/** Every damage type the combat model understands — now exactly the elements. */
export type DamageType = Element;

export const DAMAGE_TYPES: readonly DamageType[] = dedupe([...ELEMENTS]);

const DAMAGE_TYPE_SET = new Set<string>(DAMAGE_TYPES);

export function isDamageType(value: string): value is DamageType {
  return DAMAGE_TYPE_SET.has(value);
}

/** Kept for back-compat: every damage type is a full element now, so this is always false. */
export function isExtendedType(_type: DamageType): _type is ExtraDamageType {
  return false;
}

// --- damage channels ----------------------------------------------------------

/**
 * What *kind* of damage this is, independent of its element. Modifiers target these
 * independently — "+minion damage" must never touch your own swings, "+DoT damage"
 * must never touch the hit that applied the DoT.
 */
export const DAMAGE_CHANNELS = [
  "direct",       // a hit: a swing, a bolt, a nova — the default
  "dot",          // damage from a status ticking (bleed, burn, poison)
  "periodic",     // a repeating non-status pulse: a totem, a ground zone, a channel tick
  "reflected",    // damage bounced straight back (thorns, a reflect shield)
  "retaliation",  // an automatic counter-attack the build threw (Cleaver's Reprisal)
  "execute",      // damage from an execution effect, scaled off the target's missing health
  "environmental",// traps, hazards, falling ceilings — nobody's ability
  "minion",       // a summoned minion's attack
  "pet",          // a persistent companion's attack (distinct from disposable minions)
  "ultimate",     // damage that originated from an ultimate ability
] as const;
export type DamageChannel = (typeof DAMAGE_CHANNELS)[number];

// --- damage source ------------------------------------------------------------

export type ActorKind =
  | "hero" | "enemy" | "minion" | "pet" | "totem" | "zone" | "trap" | "environment";

/**
 * Where a packet came from. `abilityId` and `fromUltimate` are the load-bearing
 * fields: they are how a resource rule knows not to credit itself, and how a modifier
 * attributes "your bleed" separately from an ally's.
 */
export interface DamageSource {
  actorId: number;
  actorKind: ActorKind;
  /** The ability that produced this damage, if any. */
  abilityId?: string;
  /** Tags carried from that ability, for tag-targeted modifiers. */
  tags?: readonly SkillTag[];
  /**
   * True when this damage originated from an ultimate. THE ULTIMATE RULE: the
   * resource framework refuses to let a packet with this flag feed an ultimate
   * meter. Set by the ability runtime, cleared only by an explicit opt-in.
   */
  fromUltimate?: boolean;
}

// --- the packet --------------------------------------------------------------

export interface DamagePacket {
  amount: number;
  type: DamageType;
  channel: DamageChannel;
  source: DamageSource;
  crit: boolean;
  /** Optional status this hit tries to inflict. Chance is 0..1, rolled by the target. */
  inflict?: { status: string; chance: number; potency?: number };
  /** Knockback impulse to apply on hit. */
  knockback?: number;
  /** Skip the target's resistance / armor entirely (a "true damage" hit). */
  raw?: boolean;
  /** Filled in by the resolver once mitigation has run, for callbacks and telemetry. */
  mitigated?: number;
}

export interface DamagePacketInit {
  amount: number;
  type?: DamageType;
  channel?: DamageChannel;
  source: DamageSource;
  crit?: boolean;
  inflict?: DamagePacket["inflict"];
  knockback?: number;
  raw?: boolean;
}

/** Builds a packet with the sensible defaults filled in (physical, direct hit). */
export function makeDamagePacket(init: DamagePacketInit): DamagePacket {
  const channel: DamageChannel = init.channel ?? (init.source.fromUltimate ? "ultimate" : "direct");
  const packet: DamagePacket = {
    amount: init.amount,
    type: init.type ?? "physical",
    channel,
    source: init.source,
    crit: init.crit ?? false,
  };
  if (init.inflict) packet.inflict = init.inflict;
  if (init.knockback !== undefined) packet.knockback = init.knockback;
  if (init.raw) packet.raw = true;
  return packet;
}

// --- channel / tag modifiers ------------------------------------------------

/**
 * A bundle of multipliers a build has assembled — from the tree, from gear, from
 * active buffs. Every entry is a multiplier where 1 means "no change"; they are
 * multiplied together, never added, so a themed build compounds.
 */
export interface DamageModifiers {
  byChannel?: Partial<Record<DamageChannel, number>>;
  byType?: Partial<Record<DamageType, number>>;
  byTag?: Partial<Record<SkillTag, number>>;
  /**
   * The spec's canonical example: "+15% damage to enemies suffering a DoT". This
   * multiplies a *hit* against a DoT-afflicted target. It deliberately does NOT apply
   * to `dot` or `periodic` channels — buffing the hit is not buffing the tick.
   */
  vsAfflictedTarget?: number;
  /** Flat "more damage" multiplier applied to everything. */
  global?: number;
}

export interface DamageContext {
  /** True when the victim currently carries at least one damaging DoT. */
  targetAfflicted?: boolean;
}

/**
 * Runs a packet's amount through a modifier bundle and returns the new amount. This
 * is where "modifiers target channels independently" actually happens.
 */
export function applyDamageModifiers(
  packet: DamagePacket,
  mods: DamageModifiers,
  ctx: DamageContext = {},
): number {
  let amount = packet.amount;
  if (mods.global) amount *= mods.global;
  const chan = mods.byChannel?.[packet.channel];
  if (chan) amount *= chan;
  const typ = mods.byType?.[packet.type];
  if (typ) amount *= typ;
  if (mods.byTag && packet.source.tags) {
    for (const tag of packet.source.tags) {
      const m = mods.byTag[tag];
      if (m) amount *= m;
    }
  }
  // The line the spec is adamant about: only a hit benefits, never the DoT itself.
  if (
    mods.vsAfflictedTarget &&
    ctx.targetAfflicted &&
    packet.channel !== "dot" &&
    packet.channel !== "periodic"
  ) {
    amount *= mods.vsAfflictedTarget;
  }
  return amount;
}

/** Does a modifier bundle target a channel or tag this packet actually carries? */
export function modifiersTouch(packet: DamagePacket, mods: DamageModifiers): boolean {
  if (mods.byChannel?.[packet.channel]) return true;
  if (mods.byType?.[packet.type]) return true;
  if (mods.byTag && hasAnyTag(packet.source.tags, Object.keys(mods.byTag) as SkillTag[])) return true;
  return false;
}

// --- THE ULTIMATE RULE ------------------------------------------------------

/**
 * An ultimate does not generate ultimate charge. Full stop, enforced here rather than
 * remembered at every call site.
 *
 * A packet counts as ultimate-sourced if it is on the `ultimate` channel or its
 * source is flagged `fromUltimate`. Anything a resource rule wants to credit from an
 * ultimate has to pass `allowFromUltimate` explicitly — a future exception is a
 * deliberate line of data, never an accident of routing.
 */
export function isUltimateSourced(packet: DamagePacket): boolean {
  return packet.channel === "ultimate" || packet.source.fromUltimate === true;
}

// --- helpers ---------------------------------------------------------------

function dedupe<T>(list: readonly T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of list) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}
