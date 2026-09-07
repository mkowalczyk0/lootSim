/**
 * Full-roster acceptance test — Phase 8 of the class refactor.
 *
 * `tools/classes.ts` proves the six architecture pilots hold together against the live
 * combat runtime. This proves the *whole* 21-class roster is well-formed as data:
 *
 *   - every class: 10 skills (9 + 1 ultimate), a unique resource identity, a 5×5 tree
 *     in the canonical category order, 6 cross-path hybrids + at least one Mythic
 *     Archetype, every path named by a hybrid
 *   - across the roster: no skill id or name shared between two classes, no ultimate
 *     shared, no resource id shared (bar `mana`)
 *   - the design-smell audit (`src/progression/audit.ts`): duplicate concepts,
 *     elemental reskins, stat-only trees, class logic leaking into generic systems
 *   - every hybrid and Mythic Archetype actually unlocks at its point thresholds and
 *     nowhere below them, and resolves through `resolveBuild` deterministically
 *   - the pilot set is a strict subset of the full roster
 *
 * Headless, no browser, no dungeon. Run with `npm run roster`.
 */

import {
  ALL_CLASSES,
  PILOT_CLASSES,
  auditRoster,
  reportAudit,
  buildProgressionTree,
  evaluateArchetypes,
  evaluateHybrids,
  installClass,
  makeClassResources,
  resolveBuild,
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

/** Spend `points` down a path (rows cost 1, the keystone 2), return the node-id list. */
function allocateDownPath(def: PilotClass, pathName: string, points: number): string[] {
  const pi = def.progression.paths.findIndex((p) => p.name === pathName);
  const out: string[] = [];
  let spent = 0;
  for (let row = 0; row < 5 && spent < points; row++) {
    out.push(`${def.classId}.${pi}.${row}`);
    spent += row === 4 ? 2 : 1;
  }
  return out;
}

// =========================================================================
section("roster shape — 21 canonical classes");
{
  const order = ALL_CLASSES.map((c) => c.classId).join(",");
  check(
    "the 21 classes are present in canonical order",
    ALL_CLASSES.length === 21 &&
      order ===
        "lancer,berserker,swordsman,magician,shaman,ranger,juggernaut,duelist,warlock,monk," +
          "necromancer,corsair,trickster,reaper,stormcaller,paladin,bard,alchemist,engineer,assassin,warden",
    order,
  );
  check("Oracle and Chronomancer are absent", !order.includes("oracle") && !order.includes("chronomancer"));
  check(
    "the pilot set is a subset of the full roster",
    PILOT_CLASSES.every((p) => ALL_CLASSES.includes(p)),
  );
}

// =========================================================================
section("per-class structure — validateClass");
{
  let totalAbilities = 0;
  let totalHybrids = 0;
  let totalArchetypes = 0;
  for (const def of ALL_CLASSES) {
    const problems = validateClass(def);
    check(`${def.classId}: well-formed (10 skills, 1 ultimate, 5×5 tree, 6 hybrids + archetype)`, problems.length === 0, problems.join("; "));
    totalAbilities += def.abilities.length;
    totalHybrids += def.unlocks.filter((u) => u.tier === "hybrid").length;
    totalArchetypes += def.unlocks.filter((u) => u.tier === "mythic").length;
  }
  check("210 abilities across the roster (21 × 10)", totalAbilities === 210, `${totalAbilities}`);
  check("126 cross-path hybrids (21 × 6)", totalHybrids === 126, `${totalHybrids}`);
  check("at least one Mythic Archetype per class", totalArchetypes >= 21, `${totalArchetypes}`);
}

// =========================================================================
section("cross-class uniqueness — validateRoster");
{
  const problems = validateRoster(ALL_CLASSES);
  check("no skill id or name shared between any two classes", problems.length === 0, problems.join("; "));

  // resource identities, explicitly (mana is the one shared pool)
  const resOwners = new Map<string, string[]>();
  for (const def of ALL_CLASSES) {
    for (const r of def.resources) {
      if (r.id === "mana" || r.id === "ultimate") continue;
      const list = resOwners.get(r.id) ?? [];
      list.push(def.classId);
      resOwners.set(r.id, list);
    }
  }
  const shared = [...resOwners.entries()].filter(([, v]) => v.length > 1);
  check("every non-mana resource id is owned by exactly one class", shared.length === 0, JSON.stringify(shared));

  // ultimates
  const ultNames = ALL_CLASSES.map((c) => c.abilities.find((a) => a.isUltimate)!.name);
  check("21 distinct ultimates", new Set(ultNames).size === 21);
}

// =========================================================================
section("design-smell audit — src/progression/audit.ts");
{
  const findings = auditRoster(ALL_CLASSES);
  const errors = reportAudit(findings);
  check("no audit errors (duplicate concepts, reskins, stat columns, rule leaks)", errors === 0, `${errors} error(s)`);
  const warns = findings.filter((f) => f.severity === "warn").length;
  console.log(`  (${warns} warning(s) — allowed, listed above)`);
}

// =========================================================================
section("install — statuses register, trees flatten, resources build");
{
  const statusOwners = new Map<string, string[]>();
  for (const def of ALL_CLASSES) {
    const rt = installClass(def);
    check(`${def.classId}: tree flattens to 25 nodes`, rt.tree.length === 25);
    check(`${def.classId}: exactly one ultimate ability`, rt.normalAbilities.length === 9 && !!rt.ultimate);
    const set = makeClassResources(def);
    check(`${def.classId}: resource set carries an ultimate meter`, set.get("ultimate")?.spec.isUltimateMeter === true);
    for (const s of def.statuses ?? []) {
      const list = statusOwners.get(s.id) ?? [];
      list.push(def.classId);
      statusOwners.set(s.id, list);
    }
  }
  // a class-introduced status id may only be claimed by one class (baseline ids excluded — they're not in `statuses`)
  const clash = [...statusOwners.entries()].filter(([, v]) => v.length > 1);
  check("no class-introduced status id is shared between classes", clash.length === 0, JSON.stringify(clash));
}

// =========================================================================
section("hybrids + archetypes unlock at their thresholds — every class");
{
  for (const def of ALL_CLASSES) {
    const tree = buildProgressionTree(def.progression);

    // every hybrid: locked at one point, open at threshold
    let allHybridsGate = true;
    for (const hybrid of def.unlocks.filter((u) => u.tier === "hybrid")) {
      const alloc: string[] = [];
      for (const req of hybrid.requires) alloc.push(...allocateDownPath(def, req.path, req.points));
      const openFull = evaluateHybrids(def.unlocks, tree, alloc).some((u) => u.id === hybrid.id);
      const openShort = evaluateHybrids(def.unlocks, tree, alloc.slice(0, 1)).some((u) => u.id === hybrid.id);
      if (!openFull || openShort) {
        allHybridsGate = false;
        console.log(`    - ${hybrid.id}: full=${openFull} short=${openShort}`);
      }
    }
    check(`${def.classId}: all 6 hybrids gate on their thresholds`, allHybridsGate);

    // the archetype: needs the full three-path investment
    for (const arch of def.unlocks.filter((u) => u.tier === "mythic")) {
      const alloc: string[] = [];
      for (const req of arch.requires) alloc.push(...allocateDownPath(def, req.path, req.points));
      const open = evaluateArchetypes(def.unlocks, tree, alloc).some((u) => u.id === arch.id);
      const openPartial = evaluateArchetypes(
        def.unlocks,
        tree,
        allocateDownPath(def, arch.requires[0]!.path, arch.requires[0]!.points),
      ).some((u) => u.id === arch.id);
      check(`${def.classId}: "${arch.name}" needs all three paths (open=${open}, one-path=${openPartial})`, open && !openPartial);

      // and it modifies gameplay — the resolved build's mutations touch the ultimate's effects or tags
      const rt = installClass(def);
      const build = resolveBuild(rt.tree, alloc, def.unlocks);
      const ult = rt.ultimate;
      const applied = build.mutations.some(
        (m) => m.target.abilityId === ult.id || (m.target.withTag && ult.tags.includes(m.target.withTag)),
      );
      check(`${def.classId}: "${arch.name}" actually rewrites the ultimate`, applied);
    }
  }
}

// =========================================================================
section("resolveBuild is deterministic — host and client must agree");
{
  for (const def of ALL_CLASSES) {
    const rt = installClass(def);
    const alloc = [
      ...allocateDownPath(def, def.progression.paths[0]!.name, 3),
      ...allocateDownPath(def, def.progression.paths[1]!.name, 3),
    ];
    const sig = (x: ReturnType<typeof resolveBuild>) =>
      JSON.stringify({
        mods: x.mods,
        rules: [...x.rules].sort(),
        muts: x.mutations.map((m) => m.id).sort(),
        grants: x.grants.length,
        patches: x.resourcePatches.map((p) => p.resource).sort(),
        hybrids: x.hybrids.map((h) => h.id).sort(),
      });
    const a = sig(resolveBuild(rt.tree, alloc, def.unlocks));
    const b = sig(resolveBuild(rt.tree, alloc, def.unlocks));
    check(`${def.classId}: resolveBuild is deterministic`, a === b);
  }
}

console.log(`\n${failures === 0 ? "ALL ROSTER CHECKS PASSED" : `${failures} ROSTER CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
