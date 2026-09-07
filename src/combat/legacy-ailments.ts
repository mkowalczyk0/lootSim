/**
 * The five (now seven) elemental ailments the live game has always had — burn, chill,
 * shock, venom, drain, and holy/arcane's sear and sunder — expressed as
 * `combat/status.ts` `StatusSpec`s so the unified `StatusContainer` carries them with
 * exactly the numbers `src/data/elements.ts` tuned.
 *
 * This is the bridge for the combat cutover: `game/combat.ts`'s bespoke
 * `StatusInstance[]` and this registry describe the same effects, so a skill can move
 * onto the `src/combat` executor without its burn changing feel. The legacy list and
 * `StatusContainer` run in parallel until every writer has moved (see `Enemy.sc`);
 * registering here is what makes `sc.apply("burn", …)` mean the same thing as
 * `applyStatus(list, "burn", …)`.
 *
 * Importing this module registers the specs. It is imported by `game/dungeon.ts`.
 */

import { STATUSES, type StatusKind } from "../data/elements";
import { registerStatus, type StatusCategory, type StatusSpec } from "./status";

const CATEGORY: Record<StatusKind, StatusCategory> = {
  burn: "dot",
  venom: "dot",
  drain: "dot",
  sear: "dot",
  chill: "cc",
  shock: "debuff",
  sunder: "debuff",
};

/** Translate one legacy `elements.ts` ailment into a `combat/status.ts` spec. */
function toStatusSpec(kind: StatusKind): StatusSpec {
  const s = STATUSES[kind];
  const spec: StatusSpec = {
    id: kind,
    label: s.label,
    glyph: s.glyph,
    category: CATEGORY[kind],
    baseDuration: s.duration,
    maxStacks: s.maxStacks,
    // Legacy re-application keeps the longer remaining time, adds a stack, and takes the
    // stronger per-tick damage — which is exactly the container's "refresh" rule.
    refreshRule: "refresh",
    slow: s.slow,
    amplify: s.amplify,
  };
  if (s.dps > 0) {
    spec.dps = s.dps;
    spec.tickInterval = 0.5; // STATUS_TICK in game/combat.ts
    spec.damageType = s.element;
    spec.damageChannel = "dot";
  }
  if (s.manaBurn > 0) spec.manaBurn = s.manaBurn;
  return spec;
}

let installed = false;

/** Registers every legacy elemental ailment. Idempotent. */
export function installLegacyAilments(): void {
  if (installed) return;
  installed = true;
  for (const kind of Object.keys(STATUSES) as StatusKind[]) {
    registerStatus(toStatusSpec(kind));
  }
}

installLegacyAilments();
