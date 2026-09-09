/**
 * Universal Skill Tree acceptance test — UAT §18.
 *
 * §18 asks for a second tree every class shares, holding "basic character improvements",
 * built as a node structure with "meaningful paths and tradeoffs rather than a simple
 * list of upgrades". The claims worth pinning here are the ones that would break
 * silently:
 *
 *   1. the tree is a well-formed DAG — every prerequisite exists, nothing is orphaned,
 *      and the cross-links really do cross
 *   2. it is *tradeoffs*, not a shopping list — every keystone costs something real
 *   3. it stays in its lane — mods only, so it can never rewrite a class's abilities
 *   4. the pool is account-wide and the allocation is per-class, which is the whole
 *      design decision and the easiest thing to regress
 *   5. an empty allocation contributes exactly nothing, so it cannot move an existing
 *      balance baseline
 *   6. it survives a save round-trip, including the co-op wire payload
 *
 * Headless, no browser. Run with `npm run universal`.
 */

import {
  UNIVERSAL_PATH_COUNT,
  UNIVERSAL_PATH_DEPTH,
  UNIVERSAL_PATH_NAMES,
  UNIVERSAL_POINT_CAP,
  UNIVERSAL_ROOT_ID,
  UNIVERSAL_TREE,
  UNIVERSAL_UNLOCKS,
  isCrossLinked,
  pathPointsByName,
  pathPointsV2,
  pruneAllocationV2,
  resolveUniversalBuild,
  spentPointsV2,
  universalPointsFor,
  unlockMet,
  validateUnlockDef,
} from "../src/progression/index";
import { MOD_KEYS, zeroMods, type ModKey } from "../src/data/mods";
import { GameState, playerFromJSON, playerToJSON } from "../src/game/state";
import { Player } from "../src/game/player";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

const byId = new Map(UNIVERSAL_TREE.map((n) => [n.id, n]));
/** Every node of one path, shallowest first. */
function path(p: number) {
  return UNIVERSAL_TREE.filter((n) => n.path === p).sort((a, b) => a.row - b.row);
}
/** The ids needed to legally reach `node`, itself included, walking prerequisites up. */
function chainTo(id: string): string[] {
  const out: string[] = [];
  let cur = byId.get(id);
  while (cur) {
    out.unshift(cur.id);
    cur = cur.requires ? byId.get(cur.requires) : undefined;
  }
  return out;
}
// =========================================================================
console.log("\n=== 1. the tree is a well-formed DAG ===");
{
  check("one shared root, and it is the only node with no prerequisite",
    UNIVERSAL_TREE.filter((n) => n.requires === null).length === 1
    && byId.get(UNIVERSAL_ROOT_ID)?.requires === null);

  check("every prerequisite names a node that exists",
    UNIVERSAL_TREE.every((n) => n.requires === null || byId.has(n.requires)),
    UNIVERSAL_TREE.filter((n) => n.requires !== null && !byId.has(n.requires)).map((n) => n.id).join(", "));

  check("every node id is unique", byId.size === UNIVERSAL_TREE.length);

  // A cycle would make a node unreachable while still passing the "prereq exists" check.
  const acyclic = UNIVERSAL_TREE.every((n) => {
    const seen = new Set<string>();
    let cur = n.requires;
    while (cur) {
      if (seen.has(cur)) return false;
      seen.add(cur);
      cur = byId.get(cur)?.requires ?? null;
    }
    return true;
  });
  check("no prerequisite cycles — every node walks up to the root", acyclic);

  check(`${UNIVERSAL_PATH_COUNT} paths, each ${UNIVERSAL_PATH_DEPTH} deep`,
    UNIVERSAL_PATH_NAMES.length === UNIVERSAL_PATH_COUNT
    && Array.from({ length: UNIVERSAL_PATH_COUNT }, (_, p) => path(p).length)
      .every((n) => n === UNIVERSAL_PATH_DEPTH));

  check("every path's first node hangs off the root, so all six are enterable at once",
    Array.from({ length: UNIVERSAL_PATH_COUNT }, (_, p) => path(p)[0])
      .every((n) => n?.requires === UNIVERSAL_ROOT_ID));

  const crossed = UNIVERSAL_TREE.filter(isCrossLinked);
  check("the tree really is cross-linked, not six independent ladders", crossed.length >= 3,
    `${crossed.length} cross-links: ${crossed.map((n) => n.name).join(", ")}`);
  check("every cross-link's prerequisite is genuinely in another path",
    crossed.every((n) => byId.get(n.requires!)!.path !== n.path));
  check("a cross-linked node is never a path's entrance — that would lock the path",
    crossed.every((n) => n.row > 0));
}

// =========================================================================
console.log("\n=== 2. tradeoffs, not a shopping list ===");
{
  const keystones = UNIVERSAL_TREE.filter((n) => n.category === "keystone");
  check("every path ends in a keystone", keystones.length === UNIVERSAL_PATH_COUNT);
  check("a keystone costs two points", keystones.every((n) => n.cost === 2));
  check("every other node costs one",
    UNIVERSAL_TREE.filter((n) => n.category !== "keystone").every((n) => n.cost === 1));

  // The §18 requirement that actually distinguishes this from a list of upgrades.
  const withDownside = keystones.filter((n) =>
    n.effects.some((e) => e.kind === "mods" && Object.values(e.mods).some((v) => (v ?? 0) < 0)));
  check("every keystone carries a real downside", withDownside.length === keystones.length,
    keystones.filter((n) => !withDownside.includes(n)).map((n) => n.name).join(", ") || "all six");

  // A keystone whose downside is smaller than its own upside in the same stat would be
  // a fake tradeoff, so check the negative lands on a *different* stat than the payoff.
  const honest = keystones.every((n) => {
    const mods = n.effects.flatMap((e) => (e.kind === "mods" ? Object.entries(e.mods) : []));
    const down = mods.filter(([, v]) => (v ?? 0) < 0).map(([k]) => k);
    const up = mods.filter(([, v]) => (v ?? 0) > 0).map(([k]) => k);
    return down.length > 0 && down.every((k) => !up.includes(k));
  });
  check("a keystone's downside is never in the same stat as its payoff", honest);

  // The invariant that keeps this a tree of choices forever: the delve has no depth
  // limit, so the *cap* — not the curve — is what has to be smaller than the tree.
  const wholeTree = UNIVERSAL_TREE.reduce((sum, n) => sum + n.cost, 0);
  check("the pool caps below the tree's total cost, so it can never all be bought",
    UNIVERSAL_POINT_CAP < wholeTree,
    `cap ${UNIVERSAL_POINT_CAP} vs ${wholeTree} points of tree`);
  check("the cap leaves a real decision, not a rounding error",
    UNIVERSAL_POINT_CAP < wholeTree * 0.7,
    `${Math.round((UNIVERSAL_POINT_CAP / wholeTree) * 100)}% of the tree is affordable`);
  check("the curve reaches the cap and then stops",
    universalPointsFor(2 * UNIVERSAL_POINT_CAP) === UNIVERSAL_POINT_CAP
    && universalPointsFor(10_000) === UNIVERSAL_POINT_CAP);
  check("a fresh account has nothing to spend", universalPointsFor(0) === 0);
  check("the curve is monotonic — going deeper never costs you a point",
    Array.from({ length: 200 }, (_, d) => universalPointsFor(d))
      .every((n, i, all) => i === 0 || n >= all[i - 1]!));
}

// =========================================================================
console.log("\n=== 3. it stays in its lane: mods only ===");
{
  check("no node does anything but grant mods",
    UNIVERSAL_TREE.every((n) => n.effects.every((e) => e.kind === "mods")),
    UNIVERSAL_TREE.flatMap((n) => n.effects.filter((e) => e.kind !== "mods").map(() => n.id)).join(", "));

  const build = resolveUniversalBuild(UNIVERSAL_TREE.map((n) => n.id));
  check("resolving the entire tree produces no ability mutations", build.mutations.length === 0);
  check("…no granted effects", build.grants.length === 0);
  check("…no resource patches, so no class's tuned resource is ever overwritten",
    build.resourcePatches.length === 0);
  check("…and no rule strings, so game/rules.ts needs no universal branch",
    build.rules.size === 0);

  check("every unlock is well-formed",
    UNIVERSAL_UNLOCKS.every((u) => validateUnlockDef(u).length === 0),
    UNIVERSAL_UNLOCKS.flatMap((u) => validateUnlockDef(u)).join("; "));
  check("every unlock requirement names a path that exists",
    UNIVERSAL_UNLOCKS.every((u) => u.requires.every((r) => UNIVERSAL_PATH_NAMES.includes(r.path))));
  check("every unlock is mods-only too",
    UNIVERSAL_UNLOCKS.every((u) => u.effects.every((e) => e.kind === "mods") && !u.mutations));
}

// =========================================================================
console.log("\n=== 4. the root belongs to no path ===");
{
  // The root sits at `path: -1`. If that ever started counting toward a path total it
  // would hand out hybrid progress for free, so pin it.
  const rootOnly = [UNIVERSAL_ROOT_ID];
  const points = pathPointsV2(UNIVERSAL_TREE, rootOnly);
  check("the root contributes to no path's point total",
    points.every((n) => n === 0), JSON.stringify(points));
  check("the root is still counted as spent", spentPointsV2(UNIVERSAL_TREE, rootOnly) === 1);
  const named = pathPointsByName(UNIVERSAL_TREE, rootOnly);
  check("no real path shows progress from the root alone",
    UNIVERSAL_PATH_NAMES.every((n) => (named[n] ?? 0) === 0));
}

// =========================================================================
console.log("\n=== 4b. the grid the tree tab renders is unambiguous ===");
{
  // Both input routes address a node by the same `(path, row)` pair: the keyboard walks
  // the cursor and branch, and a click carries `data-branch`/`data-index` that land in
  // exactly those two fields. So a duplicated or missing cell would misfire identically
  // for mouse and keyboard — worth pinning here, where it's pure data, rather than
  // discovering it by clicking.
  const cells = new Map<string, string[]>();
  for (const n of UNIVERSAL_TREE) {
    const key = `${n.path}:${n.row}`;
    cells.set(key, [...(cells.get(key) ?? []), n.id]);
  }
  const duplicated = [...cells.entries()].filter(([, ids]) => ids.length > 1);
  check("no two nodes share a grid cell", duplicated.length === 0,
    duplicated.map(([cell, ids]) => `${cell} → ${ids.join(" + ")}`).join("; "));

  check("the root is the only node outside the six columns",
    UNIVERSAL_TREE.filter((n) => n.path < 0).length === 1);

  // The tab renders rows 1..depth per column and maps them onto rows 0..depth-1, so a
  // gap would render a blank cell the cursor could still stop on.
  const contiguous = Array.from({ length: UNIVERSAL_PATH_COUNT }, (_, p) =>
    path(p).map((n) => n.row).join(",") === Array.from({ length: UNIVERSAL_PATH_DEPTH }, (_, i) => i).join(","));
  check("every column's rows are contiguous from 0, so no cell renders blank",
    contiguous.every(Boolean));
}

// =========================================================================
console.log("\n=== 5. an empty tree changes nothing ===");
{
  const build = resolveUniversalBuild([]);
  const zero = zeroMods();
  const untouched = MOD_KEYS.every((k: ModKey) => build.mods[k] === zero[k]);
  check("zero allocation contributes zero mods — no balance baseline can move", untouched);
  check("…and unlocks nothing", build.hybrids.length === 0 && build.archetypes.length === 0);

  const p = new Player("lancer");
  const before = { ...p.mods };
  check("a fresh Player's derived multipliers are all identity",
    p.dashCooldownMult === 1 && p.pickupRangeMult === 1
    && p.coinFindMult === 1 && p.gemFindMult === 1);
  p.universalAllocated = [];
  p.refresh();
  check("refreshing an empty universal tree leaves the character sheet identical",
    MOD_KEYS.every((k: ModKey) => p.mods[k] === before[k]));
}

// =========================================================================
console.log("\n=== 6. a real allocation moves the numbers it claims ===");
{
  const p = new Player("lancer");
  const swiftness = UNIVERSAL_PATH_NAMES.indexOf("Swiftness");
  const chain = chainTo(path(swiftness)[2]!.id); // root → Fleet Footed → Reflexes → Quick Recovery
  const baseMove = p.moveMult;
  const baseDash = p.dashCooldownMult;

  let pool = 10;
  for (const id of chain) {
    const node = byId.get(id)!;
    const ok = p.allocateUniversal(node, pool);
    if (ok) pool -= node.cost;
    check(`allocate ${node.name}`, ok);
  }
  check("move speed actually went up", p.moveMult > baseMove, `${baseMove} → ${p.moveMult}`);
  check("the dodge really does come back sooner", p.dashCooldownMult < baseDash,
    `${baseDash} → ${p.dashCooldownMult.toFixed(3)}`);
  check("points spent matches the chain's cost", p.universalSpent === chain.length);

  // The keystone is the interesting case: it has to *cost* something observable.
  const q = new Player("lancer");
  const windborne = path(swiftness)[UNIVERSAL_PATH_DEPTH - 1]!;
  const full = chainTo(windborne.id);
  const baseHealth = q.maxHealth;
  let qp = 12;
  for (const id of full) {
    const node = byId.get(id)!;
    if (q.allocateUniversal(node, qp)) qp -= node.cost;
  }
  check("the whole Swiftness path allocates legally", q.universalAllocated.length === full.length);
  check("Windborne's downside really lands — max health drops", q.maxHealth < baseHealth,
    `${baseHealth} → ${q.maxHealth}`);
  check("current health is re-clamped, never left above the new maximum",
    q.health <= q.maxHealth);

  check("a node can't be taken twice", !q.allocateUniversal(windborne, 99));
  check("a node can't be taken without its prerequisite",
    !new Player("lancer").allocateUniversal(windborne, 99));
  check("a node can't be taken without the points",
    !new Player("lancer").allocateUniversal(byId.get(UNIVERSAL_ROOT_ID)!, 0));
  check("a class node is refused by the universal allocator",
    !new Player("lancer").allocateUniversal(
      { ...byId.get(UNIVERSAL_ROOT_ID)!, classId: "lancer" }, 99));
}

// =========================================================================
console.log("\n=== 7. hybrids unlock only at their thresholds ===");
{
  for (const u of UNIVERSAL_UNLOCKS) {
    // Allocate exactly one point short of every requirement, then top each one up.
    const short: string[] = [];
    for (const req of u.requires) {
      const p = UNIVERSAL_PATH_NAMES.indexOf(req.path);
      const nodes = path(p);
      let spent = 0;
      for (const n of nodes) {
        if (spent + n.cost > req.points - 1) break;
        short.push(n.id);
        spent += n.cost;
      }
    }
    const withRoot = [UNIVERSAL_ROOT_ID, ...short];
    check(`${u.name} is still locked one point short`,
      !unlockMet(u, pathPointsByName(UNIVERSAL_TREE, withRoot)));

    const met: string[] = [UNIVERSAL_ROOT_ID];
    for (const req of u.requires) {
      const p = UNIVERSAL_PATH_NAMES.indexOf(req.path);
      let spent = 0;
      for (const n of path(p)) {
        if (spent >= req.points) break;
        met.push(n.id);
        spent += n.cost;
      }
    }
    check(`${u.name} unlocks once every requirement is met`,
      unlockMet(u, pathPointsByName(UNIVERSAL_TREE, met)));
    const build = resolveUniversalBuild(met);
    const list = u.tier === "mythic" ? build.archetypes : build.hybrids;
    check(`${u.name} appears in the resolved build`, list.some((x) => x.id === u.id));
  }
}

// =========================================================================
console.log("\n=== 8. the pool is account-wide, the allocation is per-class ===");
{
  const state = new GameState(1);
  state.stats.deepestDepth = 20;
  check("the pool is derived from the account record, not a character's level",
    state.universalPool === universalPointsFor(20) && state.universalPool === 10,
    `depth 20 → ${state.universalPool} points`);

  const lancer = state.players.lancer;
  const magician = state.players.magician;
  const root = byId.get(UNIVERSAL_ROOT_ID)!;
  state.activeClassId = "lancer";
  check("spending on one class leaves the pool intact for another",
    lancer.allocateUniversal(root, state.universalPoints) && magician.universalSpent === 0);
  check("…and the two allocations are genuinely independent",
    lancer.universalAllocated.length === 1 && magician.universalAllocated.length === 0);
  check("the active character's remaining points drop by what it spent",
    state.universalPoints === state.universalPool - 1);
  state.activeClassId = "magician";
  check("switching class shows that class's own unspent pool in full",
    state.universalPoints === state.universalPool);

  state.activeClassId = "lancer";
  lancer.respecUniversal();
  check("refunding one class's universal tree touches no other class",
    lancer.universalSpent === 0 && state.universalPoints === state.universalPool);

  // A brand new alt should inherit the account's progress — the whole point of the split.
  const fresh = new Player("warden");
  check("a level 1 alt can spend the full account pool immediately",
    fresh.canAllocateUniversal(root, state.universalPool) && state.universalPool > 0);
}

// =========================================================================
console.log("\n=== 9. it survives persistence and the co-op wire ===");
{
  const p = new Player("berserker");
  const vitality = UNIVERSAL_PATH_NAMES.indexOf("Vitality");
  let pool = 6;
  for (const id of chainTo(path(vitality)[1]!.id)) {
    const node = byId.get(id)!;
    if (p.allocateUniversal(node, pool)) pool -= node.cost;
  }
  const spent = p.universalSpent;
  check("something was allocated to round-trip", spent > 0);

  const wire = playerToJSON(p);
  check("the sheet carries the universal allocation",
    Array.isArray(wire.universalAllocated) && wire.universalAllocated.length === spent);

  // This is the co-op path: the host rebuilds a remote hero from exactly this blob.
  const remote = playerFromJSON("berserker", wire as unknown as Record<string, unknown>);
  check("a rebuilt remote hero keeps every universal node",
    remote.universalSpent === spent);
  check("…and therefore computes the same mods the owner sees",
    MOD_KEYS.every((k: ModKey) => remote.mods[k] === p.mods[k]));
  check("…which is the point: the host must not simulate a weaker character",
    remote.maxHealth === p.maxHealth);

  // A pool that shrinks (a retune of universalPointsFor) must trim rather than go negative.
  const trimmed = playerFromJSON("berserker", wire as unknown as Record<string, unknown>);
  trimmed.normalizeUniversalTree(1);
  check("a shrunken pool trims the deepest nodes instead of overspending",
    trimmed.universalSpent <= 1);
  check("…and never leaves an orphan standing without its prerequisite",
    trimmed.universalAllocated.length
      === pruneAllocationV2(UNIVERSAL_TREE, trimmed.universalAllocated).length);

  // Junk in the save must not crash or survive.
  const dirty = playerFromJSON("berserker", {
    ...(wire as unknown as Record<string, unknown>),
    universalAllocated: ["universal.nope.nope", 7, null, UNIVERSAL_ROOT_ID],
  });
  check("unknown and non-string node ids are dropped on load",
    dirty.universalAllocated.length === 1 && dirty.universalAllocated[0] === UNIVERSAL_ROOT_ID);

  const legacy = playerFromJSON("berserker", { level: 5, xp: 0 });
  check("a pre-v15 save loads with an empty universal tree rather than crashing",
    legacy.universalAllocated.length === 0);
}

console.log(`\n${failures === 0 ? "ALL UNIVERSAL TREE CHECKS PASSED" : `${failures} UNIVERSAL TREE CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
