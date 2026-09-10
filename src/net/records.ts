/**
 * The leaderboards' client-side half: what a record *is*, and how one is computed from a
 * `GameState` the account already has loaded. Design record: `docs/leaderboards.md`.
 *
 * The one rule everything here answers to, stated in `docs/accounts.md` terms: **the
 * server must never learn the save format.** This module is the seam that keeps that
 * true — it reads a live `GameState` and reduces it to a short list of plain numbers
 * (`RecordEntry`), each stamped with its own board id, class and Challenger tier. That
 * list, not the save, is what crosses the wire (`RecordsClient` in `recordsClient.ts`),
 * over its own endpoint and its own version number (`RECORDS_VERSION`), independent of
 * `SAVE_VERSION`. A future board can be added here without the save ever changing shape,
 * and the save can keep changing shape (as it already does constantly) without this
 * payload's version ever having to move.
 *
 * Every board is keyed on the **hardest thing actually done**, never the bare activity —
 * the same rule the badges system (`Player.delveChallengerBadges` and siblings) already
 * holds, and the reason this file leans on those fields directly rather than inventing a
 * second accounting of progress. A height is not a depth, and a Delve clear at Death
 * March X is not the same accomplishment as one at the dial off, so every entry carries
 * both `value` and the `tier` it was actually banked at — a leaderboard row never reduces
 * to a bare number with its context thrown away.
 */

import type { ClassId } from "../data/classes";
import { CLASSES, CLASS_IDS } from "../data/classes";
import { RAIDS } from "../data/raids";
import type { GameState } from "../game/state";
import { itemScore, type Item } from "../game/item";
import type { FixedChallengerModeId } from "../game/player";

/** Bump when the *shape* of `RecordEntry`/`RecordSubmission` changes — never in lockstep
 *  with `SAVE_VERSION`, which is exactly the point (see the file header). The server
 *  rejects anything that doesn't match its own copy of this number rather than guessing
 *  at an unfamiliar shape. */
export const RECORDS_VERSION = 1;

/**
 * The fixed-length activities that already keep a single "highest tier banked" badge
 * (`Player.challengerBadges`) — see that field's own doc comment for why `planet`, `raid`
 * and `training` are excluded from it. Named here, not derived from `RUN_MODES`, because
 * the board list is a leaderboard-design decision (which activities get their own board),
 * not a mechanical one.
 */
const FIXED_MODE_BOARDS: readonly FixedChallengerModeId[] = ["abyss", "hoard", "vigil", "convergence", "memory"];

/** One row: an id (`docs/leaderboards.md`'s table says what each one means), the class
 *  it belongs to, the value it's ranked by, and the Challenger tier it was actually
 *  achieved at (0 where the dial doesn't apply, or was off). `meta` is small, optional,
 *  display-only context — an item's name and rarity, never anything the ranking itself
 *  depends on. */
export interface RecordEntry {
  readonly board: string;
  readonly classId: ClassId;
  readonly tier: number;
  readonly value: number;
  readonly meta?: Readonly<Record<string, string | number>>;
}

export interface RecordSubmission {
  readonly v: number;
  readonly entries: readonly RecordEntry[];
}

/** The highest Challenger tier at which `depth` was actually banked, or 0 if the only
 *  time it was reached was with the dial off. `badges[tier - 1]` can never exceed the
 *  account's real deepest depth at that tier, so an exact match (scanned from the top
 *  down) is the honest "hardest tier this depth was really cleared at" — not merely a
 *  tier whose own badge happens to be at least as deep. */
function bestTierForDepth(badges: readonly number[], depth: number): number {
  if (depth <= 0) return 0;
  for (let t = badges.length; t >= 1; t--) {
    if (badges[t - 1] === depth) return t;
  }
  return 0;
}

/** The strongest item this class currently has equipped, scored exactly the way the
 *  stash's own upgrade arrows and compare panel already do (`itemScore`, with the class
 *  passed so weapon affinity is priced in) — never a second, parallel notion of "best".
 *  Unequipped stash items are deliberately excluded: seeing what somebody's build is
 *  actually swinging is a more honest "strongest item in the game" than a duplicate
 *  sitting in a box, and it sidesteps the question of which class a stash item "belongs"
 *  to for the purposes of this filter. */
function bestEquippedItem(equipment: Record<string, Item | null>, classId: ClassId): { item: Item; score: number } | null {
  let best: { item: Item; score: number } | null = null;
  for (const item of Object.values(equipment)) {
    if (!item) continue;
    const score = itemScore(item, CLASSES[classId]);
    if (!best || score > best.score) best = { item, score };
  }
  return best;
}

/** Reduces a `GameState` to the leaderboard rows it's currently entitled to submit.
 *  Pure and read-only — never mutates the state it's handed, and never zero-pads rows for
 *  an activity a class hasn't touched, so a fresh character contributes nothing until
 *  there's actually something to rank. */
export function computeRecords(state: GameState): RecordSubmission {
  const entries: RecordEntry[] = [];
  for (const classId of CLASS_IDS) {
    const p = state.players[classId];
    if (p.deepestDepth > 0) {
      entries.push({
        board: "delve", classId, value: p.deepestDepth,
        tier: bestTierForDepth(p.delveChallengerBadges, p.deepestDepth),
      });
    }
    if (p.highestHeight > 0) {
      entries.push({
        board: "tower", classId, value: p.highestHeight,
        tier: bestTierForDepth(p.towerChallengerBadges, p.highestHeight),
      });
    }
    for (const mode of FIXED_MODE_BOARDS) {
      const tier = p.challengerBadges[mode] ?? 0;
      if (tier > 0) entries.push({ board: mode, classId, value: tier, tier });
    }
    for (const raid of RAIDS) {
      const tier = p.raidChallengerBadges[raid.id] ?? 0;
      if (tier > 0) entries.push({ board: `raid.${raid.id}`, classId, value: tier, tier });
    }
    const item = bestEquippedItem(p.equipment, classId);
    if (item) {
      entries.push({
        board: "item.score", classId, value: item.score, tier: 0,
        meta: { name: item.item.name, rarity: item.item.rarity },
      });
    }
    if (p.lifetimeMaxHit > 0) {
      entries.push({ board: "damage.max", classId, value: p.lifetimeMaxHit, tier: 0 });
    }
  }
  return { v: RECORDS_VERSION, entries };
}
