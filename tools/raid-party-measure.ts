/**
 * The measurement behind `docs/raid-party-scaling.md` — read that doc first; this is the
 * instrument, not a description of the finding. Not an acceptance test (no `check()`,
 * just numbers) and deliberately not wired into `npm run test` or `package.json`: there
 * is no agreed-correct answer to assert yet, only a documented finding that the obvious
 * answers (scale health, scale damage, scale both) are all wrong for a single-body
 * encounter. It earns a place in the gate once a design lands that has one.
 *
 * Uses `playFloorParty` (`tools/bot.ts`): a real host-authoritative `Dungeon` in `"host"`
 * role simulates the whole party exactly the combat code a co-op run would use. The wire
 * is not involved — it never changes how a fight resolves, only how a second screen
 * hears about it — so this is a faithful measurement without needing an actual client.
 *
 * On `master` this measures whatever `profileFor` currently does for a raid party — the
 * crowd-tuned `partyScale`, since the single-body attempt this doc writes up was never
 * merged. Run it from `investigate/raid-party-scaling` to reproduce that attempt's
 * numbers instead (`singleBodyPartyScale` in `data/modes.ts` there).
 *
 * Run with:
 *   npx esbuild tools/raid-party-measure.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/raid-party-measure.mjs && \
 *     node node_modules/.cache/raid-party-measure.mjs
 */
import { RAID_BY_ID, raidConfig } from "../src/data/raids";
import { profileFor } from "../src/data/depth";
import { playFloor, playFloorParty } from "./bot";
import { GameState } from "../src/game/state";
import { itemScore, rollItem } from "../src/game/item";
import { Rng } from "../src/core/rng";
import type { ClassId } from "../src/data/classes";
import { UNIVERSAL_TREE } from "../src/progression/universal";

function avg(xs: number[]) { return xs.reduce((a, b) => a + b, 0) / xs.length; }

/**
 * `geared()` from bot.ts never sets `deepestDepth`, so chests roll item level off depth
 * 0 — fine for the depth-5 boss test it was built for, badly wrong for a depth 12+ raid.
 * This mirrors `tools/smoke.ts`'s own `endgame()` helper: set the depth record *before*
 * opening chests (chests roll ilvl off it), open enough of a high tier to actually gear
 * up, and fill both trees, the way a player who actually reached this raid would be.
 */
function raidGeared(level: number, depth: number, seed: number, classId?: ClassId): GameState {
  const state = new GameState(seed);
  if (classId) state.chooseClass(classId);
  state.player.level = level;
  state.player.deepestDepth = depth;
  state.stats.deepestDepth = depth;
  state.player.refresh();
  state.player.autoSlotNewAbilities();
  state.keys.Legendary = 20;
  state.openChests("Legendary", 20);
  const cls = state.heroClass;
  for (const item of [...state.inventory].sort((a, b) => itemScore(b, cls) - itemScore(a, cls))) {
    const worn = state.player.equipment[item.slot];
    if (!worn || itemScore(item, cls) > itemScore(worn, cls)) state.equipFromInventory(item.id);
  }
  if (!state.player.hasAffinity) {
    state.player.equip(rollItem({
      rarity: "legendary", type: cls.affinity[0]!, ilvl: level, rng: new Rng(seed ^ 0x51ed),
    }));
  }
  const p = state.player;
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (const node of p.tree) {
      if (!p.allocated.includes(node.id) && p.allocate(node)) moved = true;
    }
    if (!moved) break;
  }
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (const node of UNIVERSAL_TREE) {
      const available = state.universalPoints - p.universalSpent;
      if (available <= 0) break;
      if (!p.universalAllocated.includes(node.id) && p.allocateUniversal(node, available)) moved = true;
    }
    if (!moved) break;
  }
  state.player.fullHeal();
  state.potions = 5;
  return state;
}

function measure(raidId: string, tier: number, players: number, seeds: number[], dodge = 0.85) {
  const spec = RAID_BY_ID[raidId]!;
  const config0 = raidConfig(spec, tier, 0, players);
  const level = profileFor(config0.depth, config0).recommendedLevel;

  const results = seeds.map((seed) => {
    const config = raidConfig(spec, tier, 0, players);
    if (players === 1) {
      const state = raidGeared(level, config.depth, 6000 + seed);
      const r = playFloor(state, config, 600, seed, dodge);
      return { cleared: r.d.phase === "cleared", seconds: r.seconds, damageTaken: r.damageTaken,
        potionsDrunk: r.potionsDrunk, downs: r.d.phase === "dead" ? 1 : 0, bossPhases: r.bossPhases };
    }
    const states = Array.from({ length: players }, (_, i) => raidGeared(level, config.depth, 6000 + seed + i * 131));
    const r = playFloorParty(states, config, 600, seed, dodge);
    return { cleared: r.cleared, seconds: r.seconds, damageTaken: r.damageTaken,
      potionsDrunk: r.potionsDrunk, downs: r.downs, bossPhases: r.bossPhases };
  });

  const cleared = results.filter((r) => r.cleared).length;
  const seconds = avg(results.map((r) => r.seconds));
  const dmg = avg(results.map((r) => r.damageTaken));
  const potions = avg(results.map((r) => r.potionsDrunk));
  const downs = avg(results.map((r) => r.downs));
  const phases = avg(results.map((r) => r.bossPhases));
  console.log(
    `  players=${players} tier=${tier} lvl=${level} depth=${config0.depth} ` +
    `cleared=${cleared}/${results.length} avgSec=${seconds.toFixed(0)} ` +
    `dmgBill=${dmg.toFixed(0)} dmgBill/player=${(dmg / players).toFixed(0)} ` +
    `potions=${potions.toFixed(1)} potions/player=${(potions / players).toFixed(2)} ` +
    `downs=${downs.toFixed(2)} phases=${phases.toFixed(1)}`,
  );
}

// Twelve seeds routinely flip a near-coin-flip fight's numbers by a wide margin (a raid
// boss's win rate is exactly that, at the gearing this measures); widened to 24 once the
// first pass showed a regression, to make sure it wasn't seed noise before reporting it.
// See `CAMPAIGN_SEEDS` in `tools/bot.ts` for the same convention on a different check.
const seeds = [
  11, 22, 33, 44, 55, 66, 77, 88, 99, 111, 122, 133,
  144, 155, 166, 177, 188, 199, 211, 222, 233, 244, 255, 266,
];

console.log("=== The Ferryman, tier 1 (baseDepth 12) ===");
measure("the-ferryman", 1, 1, seeds);
measure("the-ferryman", 1, 2, seeds);
measure("the-ferryman", 1, 3, seeds);
measure("the-ferryman", 1, 4, seeds);

console.log("\n=== Queen of the Seventh Circle, tier 1 (baseDepth 16) ===");
measure("queen-of-the-seventh-circle", 1, 1, seeds);
measure("queen-of-the-seventh-circle", 1, 2, seeds);
measure("queen-of-the-seventh-circle", 1, 3, seeds);
measure("queen-of-the-seventh-circle", 1, 4, seeds);

console.log("\n=== The Ferryman, tier 4 (danger compounding) ===");
measure("the-ferryman", 4, 1, seeds);
measure("the-ferryman", 4, 2, seeds);
measure("the-ferryman", 4, 4, seeds);

console.log("\n=== The Ferryman, tier 1, reckless (dodge=0) — is it a wall for a careless party? ===");
measure("the-ferryman", 1, 1, seeds, 0);
measure("the-ferryman", 1, 4, seeds, 0);
