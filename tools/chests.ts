/**
 * Chest-count acceptance test — docket §21.
 *
 * The owner reported that opening a 10-pull returns *eleven* items whenever a named item
 * drops (and the same bug on a single pull). The cause: `GameState.openAugmented` used to
 * push the ordinary roll and then push any named drop *alongside* it, so a chest paid out
 * more than it promised. Fixed by having a named hit take the ordinary roll's slot instead
 * of riding along with it.
 *
 * The property that matters, stated directly rather than verified by inspection:
 *
 *   **A chest returns exactly the number of items it promised.**
 *
 * Checked with the named roll rigged to always hit — the `npm run previews` idiom of
 * forcing the dice, applied here through a `Proxy` over the private `Rng` field (the same
 * technique `tools/named.ts` already uses to prove a Legendary chest can pay its named
 * item) since `GameState.openAugmented` owns its own `Rng` instance rather than taking one.
 * Forcing every `chance()` roll to succeed doesn't just rig the named table — it also
 * forces every internal roll inside `rollItem` (grants, triggers, favored picks) to
 * succeed, which is fine: this test only ever asks how many items came back, never what
 * they look like.
 *
 * Walks every `ChestTier` — including `LegendsCache`, the one row with both
 * `classAdaptive` and `classElement` set, and `AdeptsTrove`/`CollectorsHoard`, so "every
 * chest output, including all this new stuff" actually means every row in the table, not
 * just the four original tiers — at both a single pull and a bulk (10x) pull, plus one
 * augmented pull per tier (an augmented pull is always 1x; the tab never offers bulk on
 * it). Only one named item in the registry currently sources from a chest at all (tier
 * "Legendary"), so that is the one tier this test can watch the replacement actually
 * happen on; every other tier's pass here would still be true if the named table were
 * empty for it, which is a real, correctly-scoped limit of what "always hit" can prove
 * against today's data, not a case this test papers over.
 *
 * Headless, no browser. Run with `npm run chests`.
 */

import type { AugmentLoadout } from "../src/data/augments";
import { emptyLoadout, withAugment } from "../src/data/augments";
import { CHEST_TIERS } from "../src/data/chests";
import type { Rng } from "../src/core/rng";
import { GameState } from "../src/game/state";
import type { Item } from "../src/game/item";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

/** A fresh, always-hit `GameState` — every `chance()` roll on its private `Rng` succeeds. */
function rigged(seed: number): GameState {
  const state = new GameState(seed);
  state.chooseClass("swordsman");
  const priv = state as unknown as { rng: Rng };
  const real = priv.rng;
  priv.rng = new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === "chance") return () => true;
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return state;
}

function main() {
  console.log("=== Chest count (docket §21: count-in equals count-out) ===\n");

  let sawNamedOnLegendary = false;
  let tiersWalked = 0;

  for (const tier of CHEST_TIERS) {
    tiersWalked++;
    const state = rigged(1000 + tiersWalked);
    state.keys[tier] = 50;
    state.augments["rarity-rare"] = 5;

    const single: Item[] = state.openChests(tier, 1);
    check(`${tier}: a single pull returns exactly 1 item`, single.length === 1, `got ${single.length}`);

    const bulk: Item[] = state.openChests(tier, 10);
    check(`${tier}: a 10-pull returns exactly 10 items`, bulk.length === 10, `got ${bulk.length}`);

    const loadout: AugmentLoadout = { ...withAugment(emptyLoadout(), "rarity-rare"), base: tier };
    const augmented: Item[] = state.openAugmented(loadout, 10);
    check(`${tier}: an augmented pull returns exactly 1 item (always 1x)`, augmented.length === 1, `got ${augmented.length}`);

    if (tier === "Legendary" && [...single, ...bulk, ...augmented].some((it) => it.named)) {
      sawNamedOnLegendary = true;
    }
  }

  check(`walked all ${CHEST_TIERS.length} chest tiers`, tiersWalked === CHEST_TIERS.length, `walked ${tiersWalked}`);

  // The rig has to actually be forcing a real replacement somewhere, or every check above
  // would pass just as well against the old, un-fixed code — the vacuous-check failure
  // mode this repo has been bitten by before.
  check("the rig actually forces a named replacement on the Legendary tier", sawNamedOnLegendary,
    sawNamedOnLegendary ? "" : "no named item ever appeared — the always-hit rig isn't reaching rollNamedDrops");

  console.log(`\n${failures === 0 ? "ALL CHEST-COUNT CHECKS PASSED" : `${failures} CHEST-COUNT CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
