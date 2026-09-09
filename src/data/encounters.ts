/**
 * Which encounter a run's boss floor will actually spawn — the one answer, shared.
 *
 * There are five ways a boss gets picked and they take precedence over each other: the
 * Proving at the bottom of the Delve is the class (`legendBossSpec`), a raid is the raid
 * (`raidBossSpec`), a Reliquary sector is the sector (`planetBossSpec`), the Tower is the
 * height (`towerBossSpec`), and everything else works down the depth-bucketed ladder
 * (`bossFor`). That is a small conditional, and it used to live inline in
 * `Dungeon.spawnBoss` where it was the only thing that needed it.
 *
 * It lives here now because the drop preview (UAT §20) has to ask the same question, and
 * the whole point of a preview is that it cannot be wrong. A preview that re-derived
 * "which boss is down there" from its own copy of these rules would be a second source
 * of truth, and the first thing to go stale the next time a mode grows its own encounter
 * — which is precisely the failure the §20 constraint names: *a preview that can drift
 * out of sync with the real drop table is worse than no preview.* So `spawnBoss` and the
 * preview call this, and there is nothing to keep in sync.
 *
 * Its own module rather than a home in `bosses.ts`, `planets.ts` or `legends.ts` because
 * it needs all three and none of them owns the others. Pure data, no simulation state:
 * it takes the `RunConfig` and the answer `Dungeon.proving` already worked out, rather
 * than reaching for a `GameState` to work it out again.
 */

import { bossFor, type BossSpec } from "./bosses";
import type { ClassId } from "./classes";
import { legendBossSpec } from "./legends";
import { memoryBossSpec } from "./memories";
import type { RunConfig } from "./modes";
import { planetBossSpec } from "./planets";
import { raidBossSpec } from "./raids";
import { towerBossSpec } from "./tower";

/**
 * The encounter a boss floor under `config` will spawn.
 *
 * `proving` is the class whose Proving this floor is, or null — `Dungeon.proving`, which
 * is decided once at floor construction (see `legends.provingFloor` for why it must not
 * be re-derived later). Callers that only want to *describe* a floor rather than run one
 * can pass what `provingFloor` tells them.
 *
 * Says nothing about whether this floor *is* a boss floor; that's `config.bossFloor`.
 */
export function bossSpecForRun(config: RunConfig, proving: ClassId | null = null): BossSpec {
  if (proving) return legendBossSpec(proving);
  // A raid *is* its encounter (UAT §15) — one floor, one mythological event — so it wins
  // over every depth-derived answer below it. Ahead of the sector and the height for the
  // same reason the Proving is ahead of everything: the more specific answer is the one
  // the player was promised at the portal, and the §20 preview reads this same call.
  if (config.raid) return raidBossSpec(config.raid.spec);
  // A Memory brings its own encounter, drawn from every one the game owns and reskinned
  // with a `memory-` id so nothing it borrows leaks that encounter's own drop table
  // (`memoryBossSpec`). Same precedence and the same reason as the raid above it.
  if (config.memory) return memoryBossSpec(config.memory.bossId);
  if (config.planet) return planetBossSpec(config.planet.spec);
  // The ascent has its own five (UAT §21), borrowed and reskinned the same way a sector's
  // is, and picked by height rather than depth. Here rather than in `spawnBoss` for the
  // reason this module exists at all: the §20 preview asks the identical question.
  if (config.tower) return towerBossSpec(config.tower.height);
  return bossFor(config.depth);
}
