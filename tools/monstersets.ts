/**
 * Monster sprite sets — the biome→art seam (`docs/monster-sets.md`).
 *
 * The defect this fixes is live, not hypothetical: `SPRITE_OVERRIDES` was the only answer
 * to "what does a grunt look like", so **every realm in the game drew the Reliquary's
 * monsters** — the Delve included. Nobody noticed because those sprites were tuned to look
 * at home in exactly the Delve's palette. A `BiomeStyle` can now name a `monsterSet`, and
 * this holds the three things that makes true:
 *
 *  1. **It decides pictures and nothing else.** The same seeded floor plays out
 *     byte-identically whichever set it draws from — a monster's kind, stats, behaviour and
 *     hitbox are untouched. Asserted the way `tools/abilityfx.ts` asserts its own version,
 *     including an injected violation, because a comparison nobody has seen fail may be
 *     blind.
 *  2. **The fallback ladder holds.** A set may be *named before it is drawn*: an id whose
 *     PNG is not committed resolves to nothing and the archetype falls back to today's art.
 *     That is what lets the Tower and the Delve declare their rosters now and draw them
 *     later, and it is the `TILESETS` precedent applied to monsters.
 *  3. **Every reference resolves.** A biome naming a set that does not exist is a typo that
 *     silently does nothing, which is exactly the failure mode a fallback ladder hides.
 */

import { BIOMES } from "../src/data/biomes";
import { PLANETS } from "../src/data/planets";
import { TOWER_BIOMES } from "../src/data/tower";
import { Dungeon } from "../src/game/dungeon";
import { ATLAS, MONSTER_SETS, SHARED_MONSTER_SETS, SPRITE_OVERRIDES } from "../src/render/atlas/manifest";
import type { BiomeStyle } from "../src/data/biomes";
import { geared, playFloor } from "./bot";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

/** Every biome the game can put a player in, whatever it calls itself. */
const ALL_BIOMES: BiomeStyle[] = [
  ...BIOMES,
  ...TOWER_BIOMES,
  ...PLANETS.map((p) => p.biome),
];

// --- 1. every reference resolves ------------------------------------------------------

section("references");

{
  const named = [...new Set(ALL_BIOMES.map((b) => b.monsterSet).filter((s): s is string => !!s))];
  const unknown = named.filter((s) => !MONSTER_SETS[s]);
  check("every biome's monsterSet names a real set", unknown.length === 0, unknown.join(", "));

  check("every realm names one", ALL_BIOMES.every((b) => b.monsterSet !== undefined),
    ALL_BIOMES.filter((b) => !b.monsterSet).map((b) => b.name).join(", "));

  // A set has to cover the archetypes the renderer actually asks it for, or it is a
  // half-answer that falls back per-monster and reads as a mixed roster.
  const covered = Object.keys(SPRITE_OVERRIDES).filter((k) =>
    ["grunt", "archer", "brute", "caster", "swarmer"].includes(k));
  for (const [id, set] of Object.entries(MONSTER_SETS)) {
    const missing = covered.filter((k) => !set[k]);
    check(`the "${id}" set covers every trash archetype`, missing.length === 0, missing.join(", "));
  }
}

// --- 2. the fallback ladder ------------------------------------------------------------

section("the fallback ladder");

{
  // Drawn vs declared, measured off `ATLAS` rather than asserted: a manifest row is a
  // statement of intent, a loaded sprite is a fact. Node has no canvas, so `ATLAS`
  // membership is the closest honest proxy for "this will resolve".
  const drawn: string[] = [];
  const declared: string[] = [];
  for (const [id, set] of Object.entries(MONSTER_SETS)) {
    const ids = Object.values(set);
    (ids.every((a) => ATLAS[a]) ? drawn : declared).push(id);
  }
  check("at least one set is actually drawn", drawn.length > 0, drawn.join(", "));

  // Every real set is drawn today (reliquary, delve and tower all shipped their five), so
  // there is no live example left of a declared-but-undrawn set to demonstrate the fallback
  // ladder on. Asserting `declared.length > 0` here would be asserting a fact about the
  // repo's current art backlog rather than the resolver property this section exists to
  // hold — and once that backlog emptied out, the loop below would iterate zero times and
  // silently stop checking anything, the exact vacuous-check shape CLAUDE.md's
  // sharp-vs-reckless note warns about. A synthetic set — ids guaranteed absent from
  // `ATLAS` — proves the same property without depending on anything staying unpainted.
  const synthetic: Record<string, string> = Object.fromEntries(
    ["grunt", "archer", "brute", "caster", "swarmer"].map((k) => [k, `synthetic.undrawn.${k}`]),
  );
  check("a set may be named before it is drawn", Object.values(synthetic).every((a) => !ATLAS[a]),
    "synthetic set's ids are absent from ATLAS, as a declared-but-undrawn set's must be");

  // The load-bearing half: a declared-but-undrawn set must name ids that are NOT in the
  // atlas, so the resolver falls through. An id that is half-present — listed in `ATLAS`
  // with no PNG behind it — is the one state that breaks rather than degrades, because
  // `loadAtlas` rejects on a missing PNG for an `ATLAS` row. Runs over every real declared
  // set (today, none) plus the synthetic one, so it never again goes quiet just because the
  // backlog did.
  for (const [id, set] of [
    ...declared.map((id) => [id, MONSTER_SETS[id]!] as const),
    ["synthetic", synthetic] as const,
  ]) {
    const listed = Object.values(set).filter((a) => ATLAS[a]);
    check(`the undrawn "${id}" set claims no atlas row it cannot fill`, listed.length === 0,
      listed.join(", "));
  }

  // Two realms quietly resolving to one roster is the exact defect this seam exists to
  // surface, so sharing has to be declared rather than discovered. Undeclared overlap
  // fails; declared overlap is a design decision with a note attached.
  const declaredPairs = new Set(SHARED_MONSTER_SETS.map(([a, b]) => [a, b].sort().join("+")));
  const owner = new Map<string, string>();
  const undeclared: string[] = [];
  for (const [id, set] of Object.entries(MONSTER_SETS)) {
    for (const art of Object.values(set)) {
      const prev = owner.get(art);
      if (prev && prev !== id && !declaredPairs.has([prev, id].sort().join("+"))) {
        undeclared.push(`${art} in both ${prev} and ${id}`);
      }
      owner.set(art, id);
    }
  }
  check("no two sets share a sprite without declaring it", undeclared.length === 0,
    undeclared.slice(0, 3).join("; "));

  for (const [a, b] of SHARED_MONSTER_SETS) {
    const setA = MONSTER_SETS[a], setB = MONSTER_SETS[b];
    check(`the declared "${a}"/"${b}" sharing names two real sets`, !!setA && !!setB);
    // A declaration that no longer describes anything is stale, and a stale exemption is
    // how an accidental overlap gets waved through later.
    const overlap = setA && setB
      ? Object.values(setA).filter((art) => Object.values(setB).includes(art)).length
      : 0;
    check(`...and they actually still share art`, overlap > 0, `${overlap} sprites in common`);
  }
}

// --- 3. it decides pictures and nothing else -------------------------------------------

section("pictures only");

function outcomeSnapshot(d: Dungeon): string {
  const hero = d.localHero;
  return JSON.stringify({
    phase: d.phase, elapsed: d.elapsed, wave: d.wave,
    killsSoFar: d.killsSoFar, elitesKilled: d.elitesKilled,
    health: hero.player.health, mana: hero.player.mana,
    xp: hero.player.xp, level: hero.player.level, downed: hero.downed,
    avatar: { x: hero.avatar.x, y: hero.avatar.y, facing: hero.avatar.facing },
    loot: { ...hero.loot, items: hero.loot.items.map(({ id: _id, ...rest }) => rest) },
    enemies: d.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, health: e.health, kind: e.archetype.kind })),
  });
}

/** The same seeded floor, with every biome's `monsterSet` set to `value`. */
function playWith(value: string | undefined): Dungeon {
  const saved = ALL_BIOMES.map((b) => [b, b.monsterSet] as const);
  try {
    for (const b of ALL_BIOMES) (b as { monsterSet?: string }).monsterSet = value;
    return playFloor(geared(14, 7711, 12, "lancer"), 9, 90, 4141, 0.6).d;
  } finally {
    for (const [b, prev] of saved) (b as { monsterSet?: string }).monsterSet = prev;
  }
}

{
  const asShipped = outcomeSnapshot(playWith(undefined));
  for (const set of ["reliquary", "tower", "delve"]) {
    check(`a floor drawing the "${set}" set plays out identically`,
      outcomeSnapshot(playWith(set)) === asShipped);
  }
  check("...and so does a floor naming a set that does not exist",
    outcomeSnapshot(playWith("not-a-real-set")) === asShipped);
}

// --- 4. ...and that comparison can fail ------------------------------------------------

section("the check has teeth");

{
  // Same method as `tools/abilityfx.ts`, and for the same reason: a comparison that has
  // never been seen to fail might be comparing something neither side could move. The
  // injection has to reach the rng stream, so it is a draw taken per monster spawn when a
  // set is named — foundational, and certain to fire on any floor with monsters on it.
  const proto = Dungeon.prototype as unknown as { spawnEnemy?: unknown };
  const key = Object.getOwnPropertyNames(Dungeon.prototype).find((n) => n === "spawnBurst") ?? "";
  check("found a spawn path to sabotage", key !== "", key);

  const real = (proto as Record<string, unknown>)[key] as (...a: unknown[]) => unknown;
  let fired = 0;
  (proto as Record<string, unknown>)[key] = function sabotaged(this: Dungeon, ...args: unknown[]) {
    // Only when a set is named — so the two runs genuinely differ, exactly as a real
    // set-dependent simulation bug would.
    if (this.level.biome.monsterSet) { fired++; this.rng.next(); }
    return real.apply(this, args);
  };
  let differs = false;
  try {
    differs = outcomeSnapshot(playWith("reliquary")) !== outcomeSnapshot(playWith(undefined));
  } finally {
    (proto as Record<string, unknown>)[key] = real;
  }
  check("the injection actually fired", fired > 0, `${fired} spawns`);
  check("a monsterSet that reaches the sim's rng is caught", differs,
    differs ? "diverged, as it must" : "STILL IDENTICAL — the comparison is blind");
  check("the comparison is clean again once the injection is removed",
    outcomeSnapshot(playWith("reliquary")) === outcomeSnapshot(playWith(undefined)));
}

console.log(`\n${failures === 0 ? "monster sets: all checks passed" : `monster sets: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
