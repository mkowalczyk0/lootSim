/**
 * The boss rules, as code — `CLAUDE.md`'s boss section made checkable.
 *
 * This was written inside `tools/legends.ts` (UAT §13/§14), which was the first thing in
 * the repo to audit an encounter structurally at all. Raids (UAT §15) generate encounters
 * the same way a Proving does and have to be held to the same rules, so the audit moved
 * here rather than being written a second time: two copies of "what a boss is allowed to
 * do" is exactly the fork this codebase keeps paying for elsewhere, and the second copy
 * would be the one that quietly got a rule wrong.
 *
 * Structural only. "A dash always beats a mechanic" and "casting locks the boss in place"
 * are runtime promises of `game/boss.ts` and are covered in `tools/smoke.ts`; what is
 * checkable from the data is that every ability *has* a wind-up to be locked by.
 *
 * No side effects — importing this runs nothing.
 */

import { BOSS_ABILITIES, CROSS_ARENA_RANGE, reachesAcross, type BossSpec } from "../src/data/bosses";

// `CROSS_ARENA_RANGE` and `reachesAcross` were written here, and moved into
// `src/data/bosses.ts` when `variantPhases` needed to refuse a drop that would leave a
// phase beatable by walking backwards. A tool cannot be imported from `src/`, and a
// second copy of the predicate in the data layer would have been the copy that got the
// rule wrong. They are re-exported so every existing importer of this module is
// unaffected, and so the audit still reads as one file.
export { CROSS_ARENA_RANGE, reachesAcross };

export interface Violation {
  readonly rule: string;
  readonly detail: string;
}

/** Audits one encounter against the rules in `CLAUDE.md`'s boss section. */
export function auditSpec(spec: BossSpec): Violation[] {
  const out: Violation[] = [];
  const phases = spec.phases;

  if (phases.length < 2) {
    out.push({ rule: "phases", detail: `only ${phases.length} phase(s)` });
  }
  if (phases[0]?.at !== 1) {
    out.push({ rule: "phases", detail: `first phase starts at ${phases[0]?.at}, not 1` });
  }

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]!;
    const where = `${spec.id} phase ${i + 1} (${phase.name})`;

    if (phase.abilities.length === 0) {
      out.push({ rule: "phases", detail: `${where} has no abilities` });
      continue;
    }

    // Rule: every ability is telegraphed. If a hit landed, it was readable.
    for (const id of phase.abilities) {
      const a = BOSS_ABILITIES[id];
      if (!a) {
        out.push({ rule: "telegraphed", detail: `${where} names unknown ability ${id}` });
        continue;
      }
      // Rule: casting locks the boss in place — so there has to be a cast to lock it.
      if (a.cast <= 0) {
        out.push({ rule: "wind-up", detail: `${where}: ${id} has no wind-up` });
      }
      // No shape is only allowed when nothing lands unannounced: either the ability
      // deals no damage itself (a buff, a summon) or it resolves into visible
      // projectiles the player can see crossing the floor.
      if (a.shape === "none" && a.damage > 0 && a.count <= 0) {
        out.push({ rule: "telegraphed", detail: `${where}: ${id} deals damage with no telegraph` });
      }
    }

    // Rule: every phase needs at least one ability that reaches across the arena.
    if (!phase.abilities.some(reachesAcross)) {
      out.push({
        rule: "cross-arena",
        detail: `${where} can be beaten by walking backwards (${phase.abilities.join(", ")})`,
      });
    }

    // Rule: phases add abilities rather than replacing them.
    if (i > 0) {
      const before = new Set(phases[i - 1]!.abilities);
      const dropped = [...before].filter((id) => !phase.abilities.includes(id));
      if (dropped.length > 0) {
        out.push({ rule: "additive", detail: `${where} dropped ${dropped.join(", ")}` });
      }
      // Rule: the room gets busier as it dies.
      if (phase.haste > phases[i - 1]!.haste) {
        out.push({ rule: "additive", detail: `${where} casts slower than the phase before it` });
      }
    }
  }

  return out;
}
