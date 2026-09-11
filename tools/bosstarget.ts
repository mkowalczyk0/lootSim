/**
 * A boss's aim locks at cast-commit — the engine-level half of CLAUDE.md's boss rule
 * "every ability is telegraphed; if a hit landed, it was readable."
 *
 * `fix/boss-target-lock` closed three stacked layers that let a boss's facing (and any
 * `onSelf` cone/line telegraph following it) keep re-deriving itself from `nearestHero`
 * for the whole wind-up, so a party where "nearest" flips mid-cast could see the
 * telegraph — and the hit — reassign onto a different hero than the one it was painted
 * against. Every boss-rule audit this repo already has (`bossrules.ts`, `legends.ts`,
 * `bossvariety.ts`) checks the *encounters* against the rules; none of them checked that
 * the engine keeps the promise the encounters rely on. This is that check.
 *
 * The property is asserted directly rather than through a proxy: sample the boss's
 * facing the instant a target ability's wind-up begins, deliberately flip which hero
 * `nearestHero` returns partway through, and compare against the facing sampled the
 * instant the wind-up resolves. A real `Dungeon` plays a real boss floor — this reuses
 * `tools/bot.ts`'s construction, per that file's own "don't paraphrase this" rule — with
 * hero positions pinned by direct assignment rather than steered, since the property
 * under test is about the boss's aim, not about anybody's movement.
 *
 * Scope note: every `onSelf` ability whose shape is `cone` or `line` is subject to the
 * mechanism this fix closed (`updateTelegraphs` mirrors `owner.facing` onto exactly
 * those shapes) — `cleave`, `charge`, `beam`, `windmill`, `starLance`, `sunder`. That
 * list is fixed here as `TARGET_ABILITIES` rather than filtered live from
 * `BOSS_ABILITIES`, because deriving it from the data would make the check's scope
 * move with whatever the data currently says — the same failure `docs/blind-instruments.md`
 * names in its scope-derived-from-the-subject entries. If a seventh `onSelf` cone/line
 * ability is ever authored, it is not covered until it is added to this list by hand;
 * `walked N of 6 abilities` below is what makes that omission visible rather than silent.
 *
 * Not `hunt`/`mark` (a declared, visible `chaseId` pursuit — beaten by outrunning it, not
 * a broken promise) and not `blink` (its own resolve-time re-aim picks an escape
 * destination *after* the boss teleports; its telegraph is a circle on the boss's own
 * static position and never promised to hit a specific hero).
 */
import type { AvatarInput } from "../src/core/input";
import { FakeInput, geared } from "./bot";
import { BOSS_ABILITIES, type BossAbilityId } from "../src/data/bosses";
import { delveConfig } from "../src/data/modes";
import { RAID_BY_ID, raidConfig } from "../src/data/raids";
import { Dungeon, type Hero, type HeroSetup } from "../src/game/dungeon";
import type { GameState } from "../src/game/state";

const DT = 1 / 60;
const MAX_TICKS = 3600; // 60 simulated seconds — generous against the slowest cast/cooldown pair.

const TARGET_ABILITIES: readonly BossAbilityId[] =
  ["cleave", "charge", "beam", "windmill", "starLance", "sunder"];

function heroSetup(state: GameState, name: string, local: boolean): HeroSetup {
  return { netId: local ? "" : "p2", name, player: state.player, appearance: state.appearance, potions: state.potions, local };
}

function buildParty(config: ReturnType<typeof delveConfig>): { d: Dungeon; heroA: Hero; heroB: Hero } {
  const stateA = geared(60, 4001);
  const stateB = geared(60, 4002);
  const heroes = [heroSetup(stateA, "A", true), heroSetup(stateB, "B", false)];
  const d = new Dungeon(stateA, config, { seed: 777, role: "host", heroes });
  const heroA = d.heroes[0]!;
  const heroB = d.heroes[1]!;
  return { d, heroA, heroB };
}

/**
 * Plays one real boss floor, forces the boss to a given health fraction (to reach a
 * later phase without playing the fight down to it), and watches for `abilityId`'s
 * wind-up. The instant it begins, samples `boss.facing` and flips which hero is
 * nearest; the instant it resolves, samples `boss.facing` again. Returns null if the
 * ability was never observed within budget — a scheduling miss, not a lock failure —
 * so the caller can tell "the property held" from "the property was never tested."
 */
function probe(
  config: ReturnType<typeof delveConfig>,
  abilityId: BossAbilityId,
  healthFraction: number,
  range: number,
): { observed: false } | { observed: true; locked: boolean; startFacing: number; endFacing: number } {
  const { d, heroA, heroB } = buildParty(config);
  const idleInput = new FakeInput() as unknown as AvatarInput;
  // The boss floor's wave director spawns the boss on its own timer, not synchronously
  // in the constructor — tick past that gap (heroes parked away from the eventual spawn
  // point) before looking for it.
  let boss = d.enemies.find((e) => e.boss);
  for (let warmup = 0; warmup < 600 && !boss; warmup++) {
    d.update(DT, idleInput);
    boss = d.enemies.find((e) => e.boss);
  }
  if (!boss) return { observed: false };
  boss.health = Math.max(1, Math.floor(boss.maxHealth * healthFraction));
  // Force the choice: every other ability goes on a long cooldown, so the boss's own
  // uniform-random `rng.pick(ready)` has exactly one option next cycle. The property
  // under test is what happens to a chosen ability's aim, not which ability gets
  // chosen — leaving selection to chance would make this check flaky for no reason.
  const bs = boss.boss!;
  for (const id of Object.keys(BOSS_ABILITIES) as BossAbilityId[]) {
    if (id !== abilityId) bs.cooldowns[id] = 999;
  }

  // Hero A starts nearest and in range; hero B starts far enough away that it is never
  // the nearest hero and never within any target ability's range.
  heroA.avatar.x = boss.x + range; heroA.avatar.y = boss.y;
  heroB.avatar.x = boss.x + 4000; heroB.avatar.y = boss.y + 4000;

  let startFacing: number | null = null;
  let flipped = false;
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    // Re-pin every tick: neither hero has a real `.input`, so nothing should move them,
    // but this makes the test's own guarantee independent of that staying true.
    if (startFacing === null) {
      heroA.avatar.x = boss.x + range; heroA.avatar.y = boss.y;
      heroB.avatar.x = boss.x + 4000; heroB.avatar.y = boss.y + 4000;
    } else if (!flipped) {
      // The instant the wind-up begins: swap who is nearest — and put B at a *different*
      // angle from the boss than A's, not just a different distance. A due-east swap to
      // "closer but still due east" would leave the boss's facing reading identical
      // whether it is genuinely locked onto A or has silently reassigned to B, which
      // proves nothing either way. Due north makes the two hypotheses read ~90 degrees
      // apart, so "locked" and "reassigned" cannot be confused for each other.
      heroB.avatar.x = boss.x; heroB.avatar.y = boss.y - 5;
      heroA.avatar.x = boss.x + 4000; heroA.avatar.y = boss.y + 4000;
      flipped = true;
    }

    d.update(DT, idleInput);
    const bs = boss.boss;
    if (!bs) return { observed: false }; // the boss died — shouldn't happen, but not this check's claim to make

    if (startFacing === null && bs.ability === abilityId) {
      startFacing = boss.facing;
      continue;
    }
    if (startFacing !== null && bs.ability !== abilityId) {
      const endFacing = boss.facing;
      const locked = angleClose(startFacing, endFacing);
      return { observed: true, locked, startFacing, endFacing };
    }
  }
  return { observed: false };
}

function angleClose(a: number, b: number): boolean {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d < 0.01;
}

function fmt(n: number): string { return n.toFixed(4); }

// --- the sources, and which target ability each is asked for at what health -----------
// Chosen by reading each spec's own phase table (src/data/bosses.ts, src/data/raids.ts)
// for the cheapest health fraction that already includes the ability, rather than
// playing the fight down to it.
// `range` is chosen inside each ability's own [minRange, maxRange] window
// (src/data/bosses.ts) — cleave and windmill cap low (145 / 200), the rest are
// effectively unbounded, so 120 and 180 are used only for those two.
const CASES: readonly { label: string; config: ReturnType<typeof delveConfig>; ability: BossAbilityId; healthFraction: number; range: number }[] = [
  { label: "warden (depth 5)", config: delveConfig(5), ability: "cleave", healthFraction: 1.0, range: 120 },
  { label: "colossus (depth 15)", config: delveConfig(15), ability: "charge", healthFraction: 1.0, range: 300 },
  { label: "nameless (depth 25)", config: delveConfig(25), ability: "beam", healthFraction: 1.0, range: 300 },
  { label: "nameless (depth 25)", config: delveConfig(25), ability: "windmill", healthFraction: 0.7, range: 180 },
  { label: "nameless (depth 25)", config: delveConfig(25), ability: "starLance", healthFraction: 0.4, range: 300 },
  {
    label: "minotaur-of-the-ninth-labyrinth (raid)",
    config: raidConfig(RAID_BY_ID["minotaur-of-the-ninth-labyrinth"]!, 1),
    ability: "sunder", healthFraction: 1.0, range: 300,
  },
];

function run(): void {
  console.log("=== every onSelf cone/line ability locks its telegraphed aim at cast-commit ===");
  let failures = 0;
  let observedCount = 0;
  const walkedAbilities = new Set<BossAbilityId>();

  for (const c of CASES) {
    walkedAbilities.add(c.ability);
    const result = probe(c.config, c.ability, c.healthFraction, c.range);
    if (!result.observed) {
      failures++;
      console.log(`  FAIL ${c.label}/${c.ability}: never observed a cast within ${MAX_TICKS} ticks — scheduling miss, rerun or widen the budget`);
      continue;
    }
    observedCount++;
    if (result.locked) {
      console.log(`  ok   ${c.label}/${c.ability}: facing locked through the flip — start ${fmt(result.startFacing)}, end ${fmt(result.endFacing)}`);
    } else {
      failures++;
      console.log(`  FAIL ${c.label}/${c.ability}: facing moved after the flip — start ${fmt(result.startFacing)}, end ${fmt(result.endFacing)} (the telegraph reassigned mid-wind-up)`);
    }
  }

  const missing = TARGET_ABILITIES.filter((a) => !walkedAbilities.has(a));
  console.log(`\n  walked ${walkedAbilities.size} of ${TARGET_ABILITIES.length} target abilities` + (missing.length ? ` — MISSING: ${missing.join(", ")}` : ""));
  if (missing.length > 0) failures++;

  if (failures === 0 && observedCount === CASES.length) {
    console.log("\nboss target lock: all checks passed");
  } else {
    console.log(`\nboss target lock: ${failures} failure(s)`);
    process.exit(1);
  }
}

run();
