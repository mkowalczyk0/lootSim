/**
 * The Universal Skill Tree — UAT §18.
 *
 * A second tree, shared by every class, sitting alongside the class's own five-path
 * behaviour tree. The two answer different questions, and keeping that line clean is the
 * whole design:
 *
 *   the class tree  — "how does my class/build work?"   (behaviour: mutations, rules, resources)
 *   the universal tree — "how does my character fundamentally improve?" (the basics)
 *
 * So this file deals exclusively in `Mods`. It grants no abilities, rewrites no skills
 * and flips no rules — a universal node must never be the reason a class plays
 * differently, or the line above stops meaning anything and the class tree's identity
 * starts leaking in here.
 *
 * Three deliberate structural choices:
 *
 * 1. **It is a DAG, not five independent columns.** Every path descends from one shared
 *    root, and four nodes deep in the tree cross-link to a *neighbouring* path's node
 *    instead of their own column — so committing to Vitality opens a door into Warding
 *    that a Swiftness player never sees. `TreeNodeV2.requires` is just a node id, so
 *    every reader in `nodes.ts` (`canAllocateV2`, `pruneAllocationV2`, `spentPointsV2`,
 *    `pathPointsV2`, `collectNodeEffects`) already handles this with no changes; only the
 *    *builder* differs from `buildProgressionTree`, which hard-wires each row to row−1.
 *
 * 2. **Every keystone has a real downside.** A keystone costs two points and carries a
 *    negative mod alongside its payoff. That is what makes this a set of tradeoffs rather
 *    than a shopping list (§18: "meaningful paths and tradeoffs rather than a simple list
 *    of upgrades") — the point pool alone only makes choices *scarce*, not *pointed*.
 *
 * 3. **Percentages, never flat stats.** Rarity multiplies gear stats by 2^n up to 128x
 *    (`data/rarity.ts`), so a flat +10 health node is worthless by epic while a +8%
 *    node keeps its meaning at every depth.
 *
 * Pure data. No DOM, no `Player`, no persistence.
 */

import type { Mods } from "../data/mods";
import { resolveBuild, type ResolvedBuild } from "./build";
import type { NodeCategory, TreeNodeV2 } from "./nodes";
import type { PathUnlockDef } from "./unlocks";

/** The tree's own namespace, standing where a `classId` stands on a class node. */
export const UNIVERSAL_TREE_ID = "universal";

/** A keystone costs two, same as the class trees' — it should be a real commitment. */
export const UNIVERSAL_KEYSTONE_COST = 2;

// --- the point pool -------------------------------------------------------

/**
 * The most universal points an account can ever hold, reached at record depth
 * `2 * UNIVERSAL_POINT_CAP`.
 *
 * It exists because the delve has no upper bound: without a cap, a deep enough account
 * would eventually afford *every* node in the tree, and a tree you can finish is a tree
 * that has stopped asking you anything — which is precisely the "simple list of upgrades"
 * §18 says not to build. The cap is deliberately well under the tree's total cost, and it
 * is asserted to stay that way by `tools/universal.ts`, so there is permanently more here
 * than anyone can buy.
 *
 * Capping a reward curve early rather than letting it run is the same call
 * `challengerRarityBias` and `challengerRewardMult` already make in `data/challenger.ts`.
 */
export const UNIVERSAL_POINT_CAP = 20;

/**
 * How many universal points the *account* has earned, derived from the deepest floor any
 * character has ever reached.
 *
 * Derived rather than accumulated, exactly like `treePointsFor(level)` — there is no
 * "points earned" counter to drift out of sync with the thing that granted them, and no
 * migration to write when the curve is retuned. One point per two depths, so the pool
 * grows at roughly half the rate of a single character's class points and stays the
 * smaller of the two influences on a build.
 *
 * The pool is **account-wide** while the *allocation* is per-class (`Player`), which is
 * the split that makes an alt feel like it inherited the account's progress while still
 * letting a caster and a melee spend the same pool differently.
 */
export function universalPointsFor(recordDepth: number): number {
  return Math.min(UNIVERSAL_POINT_CAP, Math.floor(Math.max(0, recordDepth) / 2));
}

// --- authoring shape ------------------------------------------------------

interface UniversalNodeDef {
  /** Unique within its path; the full id is `universal.<path>.<key>`. */
  key: string;
  name: string;
  category: NodeCategory;
  mods: Partial<Mods>;
  blurb?: string;
  /**
   * What must be taken first, as a bare node key. A plain key means "in this path"; a
   * `path/key` pair means a node in another path, which is what makes the tree a DAG.
   * Omitted means it hangs off the root.
   */
  after?: string;
}

interface UniversalPathDef {
  key: string;
  name: string;
  blurb: string;
  nodes: readonly UniversalNodeDef[];
}

/**
 * The root. Every path's first node hangs off it, so the tree reads as one structure
 * rather than six unrelated ladders, and the first point a player ever spends is the
 * same one regardless of which direction they then go.
 */
const ROOT: UniversalNodeDef = {
  key: "core",
  name: "Fundamentals",
  category: "foundation",
  blurb: "Where every character starts.",
  mods: { healthPercent: 0.03, defensePercent: 0.03 },
};

/**
 * Six paths. Each is a *reason to keep walking*, not a stat category — the names are the
 * fantasy and the mods are the consequence.
 */
const PATHS: readonly UniversalPathDef[] = [
  {
    key: "vitality",
    name: "Vitality",
    blurb: "Live longer. The floor stops being able to delete you.",
    nodes: [
      { key: "hardy", name: "Hardy", category: "foundation", mods: { healthPercent: 0.06 } },
      { key: "toughness", name: "Toughness", category: "behavior", mods: { healthPercent: 0.06, defensePercent: 0.08 }, after: "hardy" },
      { key: "recovery", name: "Second Wind", category: "resource", mods: { lifeOnHit: 0.6 }, after: "toughness", blurb: "Every hit you land gives a little back." },
      { key: "resolve", name: "Resolve", category: "behavior", mods: { healthPercent: 0.09 }, after: "recovery" },
      {
        key: "immovable",
        name: "Immovable",
        category: "keystone",
        after: "resolve",
        blurb: "A wall does not need to be quick.",
        mods: { healthPercent: 0.18, defensePercent: 0.15, moveSpeed: -0.08 },
      },
    ],
  },
  {
    key: "swiftness",
    name: "Swiftness",
    blurb: "Move more, get hit less. Position is the defence.",
    nodes: [
      { key: "fleet", name: "Fleet Footed", category: "foundation", mods: { moveSpeed: 0.05 } },
      { key: "reflexes", name: "Reflexes", category: "behavior", mods: { evasion: 0.04, moveSpeed: 0.04 }, after: "fleet" },
      { key: "recover", name: "Quick Recovery", category: "resource", mods: { dashRate: 0.14 }, after: "reflexes", blurb: "The dodge comes back sooner." },
      { key: "momentum", name: "Momentum", category: "behavior", mods: { moveSpeed: 0.06, dashRate: 0.12 }, after: "recover" },
      {
        key: "windborne",
        name: "Windborne",
        category: "keystone",
        after: "momentum",
        blurb: "You are very hard to catch, and very easy to break.",
        mods: { moveSpeed: 0.14, dashRate: 0.3, evasion: 0.06, healthPercent: -0.12 },
      },
    ],
  },
  {
    key: "might",
    name: "Might",
    blurb: "Hit harder. The oldest answer there is.",
    nodes: [
      { key: "force", name: "Force", category: "foundation", mods: { meleeDamage: 0.05, projectileDamage: 0.05 } },
      { key: "precision", name: "Precision", category: "behavior", mods: { critChance: 0.03, critDamage: 0.1 }, after: "force" },
      { key: "tempo", name: "Tempo", category: "resource", mods: { attackSpeed: 0.07 }, after: "precision" },
      { key: "ferocity", name: "Ferocity", category: "behavior", mods: { meleeDamage: 0.07, projectileDamage: 0.07, critDamage: 0.15 }, after: "tempo" },
      {
        key: "overwhelming",
        name: "Overwhelming Force",
        category: "keystone",
        after: "ferocity",
        blurb: "Everything into the swing, nothing left for the shield.",
        mods: { meleeDamage: 0.16, projectileDamage: 0.16, critDamage: 0.25, defensePercent: -0.18 },
      },
    ],
  },
  {
    key: "attunement",
    name: "Attunement",
    blurb: "Cast more often. Your skills stop being emergencies.",
    nodes: [
      { key: "flow", name: "Flow", category: "foundation", mods: { cooldownRate: 0.05 } },
      { key: "clarity", name: "Clarity", category: "resource", mods: { manaRegen: 1.2, maxMana: 4 }, after: "flow", blurb: "The one resource every class still shares." },
      { key: "reach", name: "Reach", category: "behavior", mods: { areaSize: 0.06 }, after: "clarity" },
      { key: "conduit", name: "Conduit", category: "behavior", mods: { cooldownRate: 0.08, skillDamage: 0.06 }, after: "reach" },
      {
        key: "unbound",
        name: "Unbound",
        category: "keystone",
        after: "conduit",
        blurb: "The skills come constantly. The swing between them does not.",
        mods: { cooldownRate: 0.2, skillDamage: 0.12, areaSize: 0.08, meleeDamage: -0.15, projectileDamage: -0.15 },
      },
    ],
  },
  {
    key: "warding",
    name: "Warding",
    blurb: "Take the hit on purpose. Elements stop dictating where you go.",
    nodes: [
      { key: "insulation", name: "Insulation", category: "foundation", mods: { fireResist: 8, coldResist: 8, lightningResist: 8 } },
      { key: "grounding", name: "Grounding", category: "behavior", mods: { poisonResist: 8, voidResist: 8, holyResist: 8, arcaneResist: 8, natureResist: 8 }, after: "insulation" },
      { key: "barrier", name: "Barrier", category: "resource", mods: { wardPower: 0.12 }, after: "grounding" },
      { key: "bulwark", name: "Bulwark", category: "behavior", mods: { blockChance: 0.05, defensePercent: 0.08 }, after: "barrier" },
      {
        key: "adamant",
        name: "Adamant",
        category: "keystone",
        after: "bulwark",
        blurb: "Nothing gets through, and nothing you do lands quickly either.",
        mods: {
          fireResist: 12, coldResist: 12, lightningResist: 12, poisonResist: 12, voidResist: 12,
          holyResist: 12, arcaneResist: 12, natureResist: 12, wardPower: 0.2, attackSpeed: -0.12,
        },
      },
    ],
  },
  {
    key: "avarice",
    name: "Avarice",
    blurb: "The floor pays more. Nothing here helps you survive it.",
    nodes: [
      { key: "scavenger", name: "Scavenger", category: "foundation", mods: { pickupRadius: 0.25 } },
      { key: "greed", name: "Greed", category: "behavior", mods: { coinFind: 0.1 }, after: "scavenger" },
      { key: "prospector", name: "Prospector", category: "resource", mods: { gemFind: 0.12 }, after: "greed" },
      { key: "magnetism", name: "Magnetism", category: "behavior", mods: { pickupRadius: 0.4, coinFind: 0.1 }, after: "prospector" },
      {
        key: "hoarder",
        name: "Hoarder",
        category: "keystone",
        after: "magnetism",
        blurb: "You are here for the loot, and it shows.",
        mods: { coinFind: 0.25, gemFind: 0.25, pickupRadius: 0.5, healthPercent: -0.1 },
      },
    ],
  },
];

/**
 * The cross-links that make this a DAG rather than six ladders.
 *
 * Each entry re-points **one deep node's** prerequisite into a *shallow* node of a
 * neighbouring path. Two consequences, both deliberate:
 *
 * - Every path's first node still hangs off the root, so all six are enterable
 *   immediately. Gating a whole path's *entrance* behind another path would be punishing
 *   at this pool size, and would make the sixth path unreachable for most of the game.
 * - But the bottom half of those paths — including the keystone behind it — costs a small
 *   down-payment in a neighbour. So no deep build is ever *pure*: every keystone carries
 *   a little of the path next to it.
 *
 * That sets the two payoffs against each other, which is the tension worth having:
 * keystones reward depth, the hybrids below reward breadth, and the cross-links mean
 * depth can never completely ignore breadth.
 *
 * Authored separately from the path tables so the columns stay readable and every link is
 * visible in one place when tuning them.
 */
const CROSS_LINKS: readonly { path: string; key: string; requires: string }[] = [
  // Living through everything is what teaches you to shrug off an element.
  { path: "warding", key: "bulwark", requires: "vitality/toughness" },
  // Constant movement is what turns a set of cooldowns into a rhythm.
  { path: "attunement", key: "conduit", requires: "swiftness/reflexes" },
  // You only get greedy once you can actually clear the room.
  { path: "avarice", key: "magnetism", requires: "might/force" },
];

// --- flattening -----------------------------------------------------------

function nodeId(path: string, key: string): string {
  return `${UNIVERSAL_TREE_ID}.${path}.${key}`;
}

/** Resolves an `after` / cross-link reference (`key` or `path/key`) to a full node id. */
function resolveRef(ref: string, ownPath: string): string {
  const [a, b] = ref.split("/");
  return b === undefined ? nodeId(ownPath, a!) : nodeId(a!, b);
}

/**
 * Flattens the tables above into the same `TreeNodeV2[]` the class trees produce, so
 * every reader in `nodes.ts` and `resolveBuild` works on it unchanged.
 *
 * This is the one place the universal tree needs its own code rather than reusing
 * `buildProgressionTree`: that builder wires row N's prerequisite to row N−1 and takes a
 * fixed five-node tuple per path, neither of which can express a shared root or a
 * cross-path link.
 */
function buildUniversalTree(): TreeNodeV2[] {
  const out: TreeNodeV2[] = [];

  // The root sits at `path: -1` because it belongs to no path — it is what the six of
  // them hang off. `pathPointsV2` therefore never counts it toward any path's total,
  // which is what we want: the root should not help satisfy a hybrid requirement.
  // `tools/universal.ts` pins that behaviour so the negative index can't quietly rot.
  out.push({
    id: nodeId("root", ROOT.key),
    classId: UNIVERSAL_TREE_ID,
    path: -1,
    pathName: "Core",
    row: 0,
    name: ROOT.name,
    blurb: ROOT.blurb ?? "",
    category: ROOT.category,
    cost: 1,
    effects: [{ kind: "mods", mods: ROOT.mods }],
    requires: null,
  });

  PATHS.forEach((path, p) => {
    path.nodes.forEach((def, row) => {
      const link = CROSS_LINKS.find((c) => c.path === path.key && c.key === def.key);
      const ref = link?.requires ?? def.after;
      out.push({
        id: nodeId(path.key, def.key),
        classId: UNIVERSAL_TREE_ID,
        path: p,
        pathName: path.name,
        row,
        name: def.name,
        blurb: def.blurb ?? path.blurb,
        category: def.category,
        cost: def.category === "keystone" ? UNIVERSAL_KEYSTONE_COST : 1,
        effects: [{ kind: "mods", mods: def.mods }],
        requires: ref ? resolveRef(ref, path.key) : nodeId("root", ROOT.key),
      });
    });
  });

  return out;
}

/** The flattened tree. Immutable module data, shared by every `Player`. */
export const UNIVERSAL_TREE: readonly TreeNodeV2[] = buildUniversalTree();

/** Path display names, index-aligned with `TreeNodeV2.path`. `-1` is the shared root. */
export const UNIVERSAL_PATH_NAMES: readonly string[] = PATHS.map((p) => p.name);
export const UNIVERSAL_PATH_BLURBS: readonly string[] = PATHS.map((p) => p.blurb);
export const UNIVERSAL_ROOT_ID = nodeId("root", ROOT.key);
export const UNIVERSAL_PATH_COUNT = PATHS.length;
/** Deepest path, so the UI's row count is read off the data instead of duplicating it. */
export const UNIVERSAL_PATH_DEPTH = Math.max(...PATHS.map((p) => p.nodes.length));

/**
 * True when a node's prerequisite lives in a different path — a cross-link. The tree
 * view needs it because the vertical connector it draws between stacked nodes would
 * otherwise be claiming a prerequisite that isn't there.
 */
export function isCrossLinked(node: TreeNodeV2): boolean {
  if (!node.requires || node.requires === UNIVERSAL_ROOT_ID) return false;
  const parent = UNIVERSAL_TREE.find((n) => n.id === node.requires);
  return parent !== undefined && parent.path !== node.path;
}

/**
 * Cross-path payoffs, on the same `PathUnlockDef` machinery the class trees' hybrids and
 * Mythic Archetypes use — `resolveBuild` evaluates them with no special casing.
 *
 * These are the reward for *spreading*, where the keystones are the reward for
 * committing, so the two pull against each other.
 *
 * One deliberate departure to note, since it reads as a violation otherwise: `unlocks.ts`
 * says a hybrid should be "a new rule, *not* another passive percentage", and every one
 * of these is a passive percentage. That rule is about a *class* hybrid, where a flat
 * percentage would be a wasted opportunity to say something about the class. Here the
 * percentages are the entire point — the universal tree is the basics layer, and a
 * universal unlock that changed how a class played would be exactly the leak this file's
 * header exists to prevent.
 */
export const UNIVERSAL_UNLOCKS: readonly PathUnlockDef[] = [
  {
    id: "universal.hybrid.duelist_step",
    classId: UNIVERSAL_TREE_ID,
    tier: "hybrid",
    name: "Duelist's Step",
    description: "Fast and dangerous — speed you can actually convert.",
    requires: [{ path: "Swiftness", points: 3 }, { path: "Might", points: 3 }],
    effects: [{ kind: "mods", mods: { critChance: 0.04, moveSpeed: 0.05 } }],
  },
  {
    id: "universal.hybrid.stonewall",
    classId: UNIVERSAL_TREE_ID,
    tier: "hybrid",
    name: "Stonewall",
    description: "Health and resistance reinforcing each other.",
    requires: [{ path: "Vitality", points: 3 }, { path: "Warding", points: 3 }],
    effects: [{ kind: "mods", mods: { healthPercent: 0.08, defensePercent: 0.08 } }],
  },
  {
    id: "universal.hybrid.channeller",
    classId: UNIVERSAL_TREE_ID,
    tier: "hybrid",
    name: "Channeller",
    description: "The casts keep coming and you are still standing.",
    requires: [{ path: "Attunement", points: 3 }, { path: "Vitality", points: 2 }],
    effects: [{ kind: "mods", mods: { cooldownRate: 0.07, manaRegen: 1.5 } }],
  },
  {
    id: "universal.hybrid.treasure_hunter",
    classId: UNIVERSAL_TREE_ID,
    tier: "hybrid",
    name: "Treasure Hunter",
    description: "Get in, get it, get out.",
    requires: [{ path: "Avarice", points: 3 }, { path: "Swiftness", points: 2 }],
    effects: [{ kind: "mods", mods: { coinFind: 0.12, gemFind: 0.12, pickupRadius: 0.3 } }],
  },
  {
    id: "universal.mythic.paragon",
    classId: UNIVERSAL_TREE_ID,
    tier: "mythic",
    name: "Paragon",
    description: "Nothing specialised, everything solid — the generalist's reward.",
    requires: [
      { path: "Vitality", points: 3 },
      { path: "Might", points: 3 },
      { path: "Attunement", points: 3 },
    ],
    effects: [{
      kind: "mods",
      mods: { healthPercent: 0.06, meleeDamage: 0.06, projectileDamage: 0.06, cooldownRate: 0.06 },
    }],
  },
];

/** Resolve the universal half of a character's build from its own allocation list. */
export function resolveUniversalBuild(allocated: readonly string[]): ResolvedBuild {
  return resolveBuild(UNIVERSAL_TREE, allocated, UNIVERSAL_UNLOCKS);
}
