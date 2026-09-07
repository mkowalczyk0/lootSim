/**
 * The class matrix — one derived row per class, for the in-game Codex screen.
 *
 * Everything here is *read* off a `PilotClass`; nothing new is authored. It collapses
 * the ten abilities and five paths into the seven columns the refactor spec asks the
 * matrix to show:
 *
 *   class → resource → role → damage identity → unique mechanic → unique ultimate →
 *   build paths → primary hybrid archetypes
 */

import type { EffectStep } from "../combat/ability";
import type { PilotClass } from "./class";

export interface ClassMatrixRow {
  classId: string;
  name: string;
  role: string;
  /** The class's own resource(s), ultimate meter excluded. */
  resource: string;
  /** The damage types the kit actually deals, most-used first; "—" for a pure-support kit. */
  damageIdentity: string;
  /** The single question the class answers (spec §2.2) — its unique mechanic in one line. */
  mechanic: string;
  ultimate: string;
  /** The five path names. */
  paths: string[];
  /** Hybrid names, and the Mythic Archetype(s) called out. */
  hybrids: string[];
  archetypes: string[];
}

function walk(steps: readonly EffectStep[], visit: (s: EffectStep) => void): void {
  for (const s of steps) {
    visit(s);
    if (s.kind === "delay" || s.kind === "reactive" || s.kind === "followUp") walk(s.effects, visit);
    if (s.kind === "random") for (const c of s.choices) walk(c.effects, visit);
    if (s.kind === "projectile" && s.projectile.onExpire) walk(s.projectile.onExpire, visit);
    if ((s.kind === "consumeStatus" || s.kind === "consumeSummons") && s.then) walk(s.then, visit);
  }
}

export function classMatrixRow(def: PilotClass): ClassMatrixRow {
  const counts = new Map<string, number>();
  for (const a of def.abilities) {
    walk(a.effects, (s) => {
      const t =
        s.kind === "damage" ? s.damage.type
        : s.kind === "projectile" ? s.projectile.damage.type
        : s.kind === "zone" && s.zone.damage ? s.zone.damage.type
        : undefined;
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    });
  }
  const damage = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

  const resources = def.resources
    .filter((r) => !r.isUltimateMeter)
    .map((r) => r.label);

  const ult = def.abilities.find((a) => a.isUltimate);

  return {
    classId: def.classId,
    name: def.name,
    role: def.role,
    resource: resources.join(" + ") || "—",
    damageIdentity: damage.length ? damage.join(" / ") : "—",
    mechanic: def.question,
    ultimate: ult?.name ?? "—",
    paths: def.progression.paths.map((p) => p.name),
    hybrids: def.unlocks.filter((u) => u.tier === "hybrid").map((u) => u.name),
    archetypes: def.unlocks.filter((u) => u.tier === "mythic").map((u) => u.name),
  };
}

/** Path names paired with their keystone (the last node of each path). */
export function pathKeystones(def: PilotClass): { path: string; keystone: string; blurb: string }[] {
  return def.progression.paths.map((p) => ({
    path: p.name,
    keystone: p.nodes[4].name,
    blurb: p.blurb,
  }));
}
