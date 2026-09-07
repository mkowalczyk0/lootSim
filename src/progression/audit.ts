/**
 * Roster audit — the anti-overlap rules from `classes_refactor.md` §32, as code.
 *
 * `validateClass` / `validateRoster` in `class.ts` already enforce the *structural*
 * contract (10 skills, one ultimate, a 5×5 tree in the canonical category order, six
 * hybrids + an archetype, unique skill ids and names). This file is the *design smell*
 * pass on top of it — the things the spec says to audit for by name:
 *
 *   - duplicate skill concepts (two classes with the same verb under different names)
 *   - duplicate ultimates (a generic "big AoE" that doesn't express its class)
 *   - duplicate resource identities (two classes sharing one resource id)
 *   - excessive elemental reskins (a class whose whole kit is one element)
 *   - excessive stat-only trees (a path that is four `mods` nodes and a keystone)
 *   - class-specific logic leaking into generic systems
 *
 * Everything here is a pure function over `PilotClass[]`. It returns `AuditFinding[]`;
 * `severity: "error"` fails `npm run roster`, `severity: "warn"` is printed but allowed.
 */

import type { EffectStep } from "../combat/ability";
import type { PilotClass } from "./class";

export interface AuditFinding {
  severity: "error" | "warn";
  rule: string;
  classId?: string;
  message: string;
}

/** Resource ids every class is allowed to share — the genuinely universal ones. */
const SHARED_RESOURCE_IDS = new Set(["mana", "ultimate"]);

/**
 * Concept keywords. If two classes each own a skill whose name or description leans
 * hard on the same one of these, that is a duplicate-concept smell worth a look —
 * unless the pair is on the allow-list below (the spec explicitly wants several
 * classes to *dash*, for instance, as long as the dash means something different).
 */
/**
 * Distinctive skill *nouns* — matched as whole words against ability **names only**
 * (not descriptions, where "into the nearest wall" or "pull them in" are just prose).
 * Two classes owning a skill named around the same one of these is a
 * duplicate-concept smell unless the pair is explicitly sanctioned below.
 */
const CONCEPT_WORDS = [
  "turret", "totem", "decoy", "banner", "barricade",
  "hookshot", "grapple", "garrote",
  "backstab", "ambush", "execution", "riposte", "feint",
  "vanish", "afterimage", "mirror",
  "meteor", "broadside", "cataclysm",
];

/**
 * Concept overlaps the spec explicitly sanctions (§32 Rule 2: two classes may share an
 * effect if it *means* something different). Each entry is the exact set of classes
 * allowed to share the concept — a third class showing up still warns.
 */
const CONCEPT_ALLOW: readonly (readonly string[])[] = [
  ["trickster", "assassin"], // stealth / ambush vs deception vs priority kill
  ["magician", "trickster"], // "mirror": arcane clone-casting vs illusory decoy
  ["assassin", "reaper"], // "execution": a named priority-kill technique vs mass low-HP clear
];

function walk(steps: readonly EffectStep[], visit: (s: EffectStep) => void): void {
  for (const s of steps) {
    visit(s);
    if (s.kind === "delay" || s.kind === "reactive" || s.kind === "followUp") walk(s.effects, visit);
    if (s.kind === "random") for (const c of s.choices) walk(c.effects, visit);
    if (s.kind === "projectile" && s.projectile.onExpire) walk(s.projectile.onExpire, visit);
    if ((s.kind === "consumeStatus" || s.kind === "consumeSummons") && s.then) walk(s.then, visit);
  }
}

/** Every damage type the class's ten abilities actually deal. */
function damageTypesOf(def: PilotClass): Set<string> {
  const types = new Set<string>();
  for (const a of def.abilities) {
    walk(a.effects, (s) => {
      if (s.kind === "damage") types.add(s.damage.type);
      if (s.kind === "projectile") types.add(s.projectile.damage.type);
      if (s.kind === "zone" && s.zone.damage) types.add(s.zone.damage.type);
    });
  }
  return types;
}

export function auditRoster(classes: readonly PilotClass[]): AuditFinding[] {
  const out: AuditFinding[] = [];
  const err = (rule: string, message: string, classId?: string) =>
    out.push({ severity: "error", rule, message, classId });
  const warn = (rule: string, message: string, classId?: string) =>
    out.push({ severity: "warn", rule, message, classId });

  // --- Rule 3: ultimates must express the class mechanic (no shared ultimate id/name) ---
  const ultOwner = new Map<string, string>();
  for (const def of classes) {
    const ult = def.abilities.find((a) => a.isUltimate);
    if (!ult) continue;
    for (const key of [`id:${ult.id}`, `name:${ult.name}`]) {
      const prev = ultOwner.get(key);
      if (prev) err("dup-ultimate", `ultimate "${ult.name}" shared by ${prev} and ${def.classId}`, def.classId);
      ultOwner.set(key, def.classId);
    }
  }

  // --- duplicate resource identities ---
  const resOwner = new Map<string, string>();
  for (const def of classes) {
    for (const r of def.resources) {
      if (SHARED_RESOURCE_IDS.has(r.id)) continue;
      const prev = resOwner.get(r.id);
      if (prev) err("dup-resource", `resource id "${r.id}" claimed by both ${prev} and ${def.classId}`, def.classId);
      resOwner.set(r.id, def.classId);
    }
    for (const s of def.stances ?? []) {
      const prev = resOwner.get(s.id);
      if (prev) err("dup-resource", `stance id "${s.id}" claimed by both ${prev} and ${def.classId}`, def.classId);
      resOwner.set(s.id, def.classId);
    }
  }

  // --- Rule 5: avoid element-first identity (an "excessive elemental reskin") ---
  for (const def of classes) {
    const types = damageTypesOf(def);
    // count how many of the ten abilities actually deal a damage number
    let damaging = 0;
    for (const a of def.abilities) {
      let hits = false;
      walk(a.effects, (s) => {
        if (s.kind === "damage" || s.kind === "projectile" || (s.kind === "zone" && s.zone.damage)) hits = true;
      });
      if (hits) damaging++;
    }
    // a reskin is a class whose whole kit deals damage, all of it one non-physical
    // element, with no physical anywhere — swap the tint and nothing identifies it.
    // A support class that only incidentally deals one element is not that.
    if (types.size === 1 && !types.has("physical") && damaging >= 7) {
      warn("element-reskin", `${damaging}/10 abilities deal damage and it is all ${[...types][0]}`, def.classId);
    }
  }

  // --- Rule 4 / 6: trees must alter behaviour, not be stat columns ---
  for (const def of classes) {
    for (const path of def.progression.paths) {
      const behaviouralNodes = path.nodes.filter((n) =>
        n.effects.some((e) => e.kind !== "mods"),
      ).length;
      // a path is allowed one pure-stat node; two or more and it's a stat column.
      if (behaviouralNodes < 4) {
        err(
          "stat-column",
          `path "${path.name}" has ${5 - behaviouralNodes} pure-stat node(s); ` +
            `at most one node may be stats-only (spec §2.3, §4.1)`,
          def.classId,
        );
      }
    }
    // and no whole class should be a "health / defense / sustain" column across a path
    const defenseWords = /\b(fortif|bulwark|armou?r|shield wall|iron body|stone|endure)\b/i;
    const defensivePaths = def.progression.paths.filter((p) => defenseWords.test(p.name + " " + p.blurb)).length;
    if (defensivePaths > 1) {
      warn("defense-column", `${defensivePaths} paths read as generic defense (spec §32 Rule 6)`, def.classId);
    }
  }

  // --- duplicate skill concepts across classes ---
  const conceptOwners = new Map<string, Set<string>>();
  for (const def of classes) {
    for (const a of def.abilities) {
      const name = a.name.toLowerCase();
      for (const word of CONCEPT_WORDS) {
        if (!new RegExp(`\\b${word}`).test(name)) continue;
        const set = conceptOwners.get(word) ?? new Set<string>();
        set.add(def.classId);
        conceptOwners.set(word, set);
      }
    }
  }
  for (const [word, owners] of conceptOwners) {
    if (owners.size < 2) continue;
    const list = [...owners].sort();
    const allowed = CONCEPT_ALLOW.some(
      (pair) => pair.every((c) => owners.has(c)) && owners.size === pair.length,
    );
    if (allowed) continue;
    warn("dup-concept", `the "${word}" concept appears in ${list.length} classes: ${list.join(", ")}`);
  }

  // --- generic filler: a skill with no effects, or a bare single-damage "attack" clone ---
  for (const def of classes) {
    for (const a of def.abilities) {
      if (a.effects.length === 0) err("filler", `ability "${a.name}" has no effects`, def.classId);
    }
    const plainAttacks = def.abilities.filter(
      (a) =>
        !a.isUltimate &&
        a.effects.length === 1 &&
        a.effects[0]!.kind === "damage" &&
        (!a.mutationHooks || a.mutationHooks.length === 0) &&
        !a.followUp,
    ).length;
    if (plainAttacks > 2) {
      warn("filler", `${plainAttacks} abilities are a single unmodified damage step (possible filler)`, def.classId);
    }
  }

  // --- class-specific logic leaking into generic systems ---
  // every keystone / archetype "rule" string must be namespaced to its class, so the
  // executor can't grow a `if (rule === "danger_zone")` that silently belongs to one class.
  for (const def of classes) {
    const ruleStrings: string[] = [];
    for (const path of def.progression.paths)
      for (const node of path.nodes)
        for (const e of node.effects) if (e.kind === "rule") ruleStrings.push(e.rule);
    for (const u of def.unlocks)
      for (const e of u.effects) if (e.kind === "rule") ruleStrings.push(e.rule);
    for (const r of ruleStrings) {
      if (!r.startsWith(`${def.classId}.`)) {
        err("rule-namespace", `rule "${r}" is not namespaced to ${def.classId}.`, def.classId);
      }
    }
  }

  return out;
}

/** Pretty-print for the CLI. Returns the error count. */
export function reportAudit(findings: readonly AuditFinding[]): number {
  let errors = 0;
  for (const f of findings) {
    if (f.severity === "error") errors++;
    const tag = f.severity === "error" ? "ERROR" : " warn";
    console.log(`  ${tag}  [${f.rule}] ${f.classId ? f.classId + ": " : ""}${f.message}`);
  }
  if (findings.length === 0) console.log("  clean — no findings");
  return errors;
}
