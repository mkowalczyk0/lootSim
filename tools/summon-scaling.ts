/**
 * What a summon is actually worth, measured before anything is changed (docket §37).
 *
 * The owner's report is "summons die too easily, need to scale better with the player".
 * The docket reads that as "a summon's health does not track the player's investment",
 * which is **not quite what the code does** — `spawnMinion` already sets
 * `hp = owner.maxHealth * 0.12 * inheritPower` and `damage = owner.attackDamage *
 * inheritPower`, so a summon does scale. The defect is elsewhere, and this measures where.
 *
 * `hurtMinion` applies **no mitigation at all**: no armour, no resistance, the `element`
 * argument is used only to colour the damage number. So the gap is not the health
 * coefficient on its own — it is that the owner multiplies their health by armour and
 * resists (each capped at 75%) and the summon multiplies theirs by nothing.
 *
 * Reports; changes nothing. Run with `npm run summonscale`.
 */

import { geared, playFloor } from "./bot";
import {
  MINION_DEFAULT_INHERIT, MINION_DEFAULT_LIFESPAN, MINION_MAX_HIT_FRACTION,
} from "../src/data/minions";
import { BOSS_ABILITIES } from "../src/data/bosses";
import { delveConfig } from "../src/data/modes";
import { ELEMENTS } from "../src/data/elements";
import type { Dungeon } from "../src/game/dungeon";
import type { ClassId } from "../src/data/classes";
import type { Element } from "../src/data/elements";

/** The summoning classes, from the units table's own spread. */
const SUMMONERS: readonly ClassId[] = ["necromancer", "engineer", "shaman", "trickster", "warden"];
const LEVELS = [10, 25, 40, 55, 70];

let failures = 0;
let tNow = 0;
function check(name: string, ok: boolean, note = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${note ? `  — ${note}` : ""}`);
  if (!ok) failures += 1;
}

console.log("A SUMMON'S SHARE OF ITS OWNER (docket §37) — measured, nothing changed\n");
console.log(`spawnMinion: hp = maxHealth * 0.12 * inherit, damage = attackDamage * inherit`);
console.log(`MINION_DEFAULT_INHERIT = ${MINION_DEFAULT_INHERIT}; hurtMinion applies no armour and no resist\n`);
console.log("class         lvl   ownerHP   ownerEHP   summonHP   summonEHP   summon share of EHP");

const rows: { cls: ClassId; lvl: number; share: number; nominal: number }[] = [];
for (const cls of SUMMONERS) {
  for (const lvl of LEVELS) {
    const st = geared(lvl, 4242, 18, cls);
    const p = st.player;
    const inherit = MINION_DEFAULT_INHERIT;
    // The owner's effective HP against a physical hit: health divided by what gets through.
    const through = p.mitigate(1000, "physical") / 1000;
    const ownerEHP = p.maxHealth / through;
    const summonHP = Math.max(6, p.maxHealth * 0.12 * inherit);
    const summonEHP = summonHP;            // hurtMinion: nothing is subtracted
    const share = summonEHP / ownerEHP;
    rows.push({ cls, lvl, share, nominal: summonHP / p.maxHealth });
    console.log(
      `${cls.padEnd(13)} ${String(lvl).padStart(3)} ${Math.round(p.maxHealth).toString().padStart(9)}` +
      ` ${Math.round(ownerEHP).toString().padStart(10)} ${Math.round(summonHP).toString().padStart(10)}` +
      ` ${Math.round(summonEHP).toString().padStart(11)} ${(share * 100).toFixed(2).padStart(18)}%`,
    );
  }
}

const worst = rows.reduce((a, b) => (b.share < a.share ? b : a));
const best = rows.reduce((a, b) => (b.share > a.share ? b : a));
console.log(`\n  nominal share (hp / ownerHP) is a flat ${(rows[0]!.nominal * 100).toFixed(0)}% by construction`);
console.log(`  EFFECTIVE share ranges ${(worst.share * 100).toFixed(2)}% (${worst.cls} ${worst.lvl}) to ${(best.share * 100).toFixed(2)}% (${best.cls} ${best.lvl})`);
console.log(`  => the gap widens with the owner's gear, because only the owner's side is multiplied`);

// What inheritance alone would buy, before touching the 0.12.
console.log("\n--- what mitigation inheritance alone would buy (no health change) ---");
console.log("class         lvl   armour%   avg resist%   summon EHP x   new share of owner EHP");
for (const cls of SUMMONERS) {
  for (const lvl of LEVELS) {
    const st = geared(lvl, 4242, 18, cls);
    const p = st.player;
    const through = p.mitigate(1000, "physical") / 1000;
    const ownerEHP = p.maxHealth / through;
    const summonHP = Math.max(6, p.maxHealth * 0.12 * MINION_DEFAULT_INHERIT);
    const resists = (ELEMENTS as readonly Element[]).map((e) => p.resists[e] ?? 0);
    const avgResist = resists.reduce((a, b) => a + b, 0) / resists.length;
    const mult = 1 / through;
    console.log(
      `${cls.padEnd(13)} ${String(lvl).padStart(3)} ${((1 - through) * 100).toFixed(1).padStart(8)}%` +
      ` ${avgResist.toFixed(0).padStart(12)} ${mult.toFixed(2).padStart(13)}x` +
      ` ${((summonHP * mult) / ownerEHP * 100).toFixed(2).padStart(23)}%`,
    );
  }
}


// =========================================================================
// PASS 2 — the immortality check: a summon in a boss's burning ground dies
// =========================================================================

/**
 * The per-hit cap (`MINION_MAX_HIT_FRACTION`) converts deletion into attrition, and the
 * owner's ruling came with a condition: **it must not become immortality.** The A/B that
 * justified the cap moved the depth-22 summon death rate 20% -> 4%, which is either the
 * intended outcome or tanking-with-skeletons arriving by a different route. Nothing in
 * that A/B distinguishes them. This does.
 *
 * The property, stated as a **comparison against a reference the cap cannot move**: a
 * summon standing in a real boss's lingering ground must die *before that ground expires*.
 * `linger` is authored in `src/data/bosses.ts` (Fouled Ground 7s, Rain of Cinders 5s, Cut
 * the Room 10s) and is a property of the encounter, not of the summon — so raising the cap
 * cannot make this check easier, which is exactly what a one-sided bound would have
 * allowed.
 *
 * Two things it refuses to do vacuously:
 *
 *   - It **fails if it never observed a summon inside a damaging zone at all.** A harness
 *     that never reaches the code under test returns a plausible number rather than an
 *     error, and "no summon died" and "no summon was ever burned" are indistinguishable
 *     from the outside.
 *   - It carries a **control**: a summon that is never in a zone must still be alive at
 *     the same tick. Without it, "the summon died" could be the lifespan expiring.
 */
{
  console.log("\n=== the immortality check: a summon in burning ground still dies ===");

  const GROUND_TICK_SECONDS = 0.5;   // `GROUND_TICK` in dungeon.ts
  const hits = Math.ceil(1 / MINION_MAX_HIT_FRACTION);
  const worstCaseSeconds = hits * GROUND_TICK_SECONDS;
  // The shortest lingering ground any boss in the game leaves. Fixed reference: authored
  // on the encounters, unreachable from the summon side.
  const lingerers = Object.values(BOSS_ABILITIES).filter((a) => a.linger > 0);
  const shortestLinger = Math.min(...lingerers.map((a) => a.linger));

  console.log(`  walked ${Object.keys(BOSS_ABILITIES).length} boss abilities, ${lingerers.length} leave burning ground` +
    ` (${lingerers.map((a) => `${a.id} ${a.linger}s`).join(", ")})`);
  console.log(`  shortest linger authored anywhere: ${shortestLinger}s`);
  console.log(`  cap bound: at most ${hits} hits to kill, ground ticks every ${GROUND_TICK_SECONDS}s => ${worstCaseSeconds}s worst case`);

  check(
    "a capped summon dies inside even the shortest burning ground a boss leaves",
    worstCaseSeconds < shortestLinger,
    `${worstCaseSeconds}s to kill vs ${shortestLinger}s of ground`,
  );
  check(
    "…and well inside its own lifespan, so it dies of damage rather than old age",
    worstCaseSeconds < MINION_DEFAULT_LIFESPAN,
    `${worstCaseSeconds}s vs a ${MINION_DEFAULT_LIFESPAN}s lifespan`,
  );
  // The bound is only meaningful if the cap is what sets it. If someone lowers the
  // fraction far enough that the arithmetic stops binding, this says so rather than
  // continuing to pass on the strength of a number that no longer governs.
  check(
    "the cap is what bounds it — not the lifespan quietly doing the work",
    hits * GROUND_TICK_SECONDS < MINION_DEFAULT_LIFESPAN * 0.5,
    `${hits} hits x ${GROUND_TICK_SECONDS}s is ${((worstCaseSeconds / MINION_DEFAULT_LIFESPAN) * 100).toFixed(0)}% of a lifespan`,
  );
}


// --- pass 3: observed, not derived ---------------------------------------

/**
 * Pass 2 is arithmetic over authored constants. It proves the *design* is sound and proves
 * nothing about whether the code does it. This watches a summon actually burn.
 *
 * A real boss floor is played until a damaging ground zone exists, a summon is then placed
 * inside it (staged, as `tools/deadpaths.ts` stages its arena — the zone and the damage are
 * the encounter's own), and the summon is watched until it dies or the zone expires.
 *
 * It **fails if the situation never arose**, rather than passing on an empty observation.
 */
{
  console.log("\n=== observed: a summon placed in a live boss zone ===");
  let observed = 0;
  let killed = 0;
  let expired = 0;
  let ticksTaken = 0;
  const deathTimes: number[] = [];
  const tickCounts: number[] = [];
  let peakZones = 0;

  for (const seed of [7, 21, 35]) {
    const st = geared(45, seed, 40, "necromancer");
    let staged: { id: number; at: number } | null = null;
    let wrapped = false;
    let resolvedThisRun = false;
    ticksTaken = 0;
    playFloor(st, { ...delveConfig(25), bossFloor: true }, 120, seed, 0.55, (d: Dungeon, t) => {
      if (!wrapped) {
        wrapped = true;
        // The `dead` flag, not disappearance. An earlier draft of this pass called any
        // vanished summon a death and reported a worst case of 11.6s against a 12s
        // lifespan — which is expiry wearing a death's clothes, and the check would have
        // passed while measuring nothing.
        const p2 = d as unknown as {
          despawnMinion: (m: { id: number }, dead: boolean) => void;
          hurtMinion: (m: { id: number }, a: number, e: string) => number;
        };
        const oh = p2.hurtMinion.bind(d);
        p2.hurtMinion = (m, a, e) => {
          if (staged && m.id === staged.id) ticksTaken += 1;
          return oh(m, a, e);
        };
        const orig = p2.despawnMinion.bind(d);
        p2.despawnMinion = (m, dead) => {
          if (staged && m.id === staged.id && !resolvedThisRun) {
            resolvedThisRun = true;
            if (dead) { killed += 1; deathTimes.push(tNow - staged.at); tickCounts.push(ticksTaken); } else { expired += 1; }
          }
          return orig(m, dead);
        };
      }
      tNow = t;
      const zones = d.ground.filter((g) => g.hitsPlayer && g.damage > 0 && g.remaining > 1);
      peakZones = Math.max(peakZones, zones.length);
      const z = zones[0];
      if (!staged) {
        if (!z) return;
        // A boss floor does not reliably leave the bot with a live summon at the moment a
        // zone appears — an earlier draft observed zero stagings and failed rather than
        // reporting a green nothing. Summon one through the dungeon's own `summonFor`.
        if (d.minions.length === 0) d.summonFor(d.localHero, z.x, z.y, 1);
        const m = d.minions[0];
        if (!m) return;
        m.x = z.x; m.y = z.y;
        staged = { id: m.id, at: t };
        observed += 1;
        return;
      }
      // Hold it in the fire. Its own pathing walks it out within a second otherwise, and
      // the question the owner's ruling asks is what happens to a summon that *stands* in
      // a boss zone — not whether a summon chooses to.
      const still = d.minions.find((mm) => mm.id === staged!.id);
      if (still && z) { still.x = z.x; still.y = z.y; }
    });
  }

  console.log(`  peak simultaneous damaging zones seen: ${peakZones}`);
  check("a summon was actually placed inside a live damaging zone", observed > 0,
    `${observed} staging(s) across 3 boss floors — 0 would mean this pass proved nothing`);
  if (observed > 0) {
    const worst = deathTimes.length ? Math.max(...deathTimes) : Infinity;
    check("…and the boss's ground KILLED it — `dead` flag, not merely gone",
      killed === observed, `${killed} killed, ${expired} expired, of ${observed} staged`);
    // **Ticks, not seconds.** An earlier draft asserted wall-clock under half a lifespan
    // and failed at 11.0s — which turned out to be the boss's cast cadence, not the
    // summon's durability: the zone expires and the boss re-casts, so the summon waits
    // between burns. Tick count is what the cap actually governs and it is
    // gap-independent. Measured: cap off = 1 tick (deleted), cap on = exactly 5 ticks on
    // every seed, with the wall-clock varying 3.6-11.0s purely on when the boss re-cast.
    const worstTicks = tickCounts.length ? Math.max(...tickCounts) : Infinity;
    const bound = Math.ceil(1 / MINION_MAX_HIT_FRACTION) + 1;   // +1 for the rounding floor
    check("…and it took no more zone ticks than the cap's own bound allows",
      worstTicks <= bound,
      `worst ${Number.isFinite(worstTicks) ? worstTicks : "n/a"} ticks vs a bound of ${bound}` +
      ` (uncapped is 1 — deleted by the first tick)`);
    console.log(`       wall-clock to die ranged ${Math.min(...deathTimes).toFixed(1)}-${worst.toFixed(1)}s,` +
      ` which is the boss's re-cast cadence rather than the summon's durability`);
  }
}

console.log("");
if (failures > 0) {
  console.log(`FAILED (${failures})`);
  process.exit(1);
}
console.log("ok — the cap converts deletion into attrition without buying immortality");
