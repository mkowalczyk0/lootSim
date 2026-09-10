/**
 * Memories acceptance test — the custom-rift endgame. Design record: `docs/memories.md`.
 *
 * The checks here are the design's load-bearing claims restated as properties, and
 * wherever the claim is comparative ("harder pays better", "rarer is richer") it is
 * asserted **as a comparison** rather than as two independent bounds. That is the lesson
 * at the top of `CLAUDE.md`, learned the expensive way: in Sept 2026 the sharp-vs-reckless
 * campaign silently inverted while every check stayed green, because each side only
 * bounded its own number. A loose one-sided threshold does not prove a design promise.
 *
 *   1. **One curve.** A Memory hands `profileFor` an effective depth and a `danger` and
 *      nothing else. Asserted as an *equality* against the Delve at the same depth and
 *      danger, walked over the whole authored ladder — the shape `tools/world.ts` uses for
 *      the Tower, because it is the strongest form of "there is no second curve".
 *   2. **Neutral where it should be.** An unmodified Memory is byte-identical to a Delve
 *      floor, which is what makes adding this move no existing balance number.
 *   3. **No free positives.** `boons.length <= burdens.length` on everything the roller
 *      and every workbench op can produce, across thousands of seeds.
 *   4. **Rarer is richer** — as a comparison, over every payout axis at once.
 *   5. **The rarity ceiling, and the one bounded place it moves.** Memories are the
 *      game's single carve-out from "difficulty never lifts the rarity ceiling", taken at
 *      the owner's direction. Three checks keep it honest, all comparative: nothing below
 *      mythic exceeds a cap that sits *below* `MODES.abyss.rarityBias`; the overshoot is
 *      granted only in proportion to the square of the burden load, so it cannot be bought
 *      cheaply; and the very best Memory lands past the Abyss by no more than a stated
 *      margin, with unspoken's absolute odds asserted so "not by much" stays testable.
 *   6. **§16 pays, and the right things pay.** A Memory's own danger reaches
 *      `rewardCurve` (unlike the Vigil's, which is the day's weather) — asserted as a
 *      comparison against the same Memory without its Merciless roll, and against a Vigil.
 *   7. **Challenger reaches everything**, verified rather than assumed, as a monotonic
 *      comparison across tiers.
 *   8. **The gate is both ladders, per class**, and reads the two records separately —
 *      including that a height is never enough on its own and never written into a depth.
 *   9. **The pool is the whole game, minus what belongs to somewhere else** — every place
 *      and every encounter resolves, the Proving and raids are absent, and a Memory's
 *      encounter cannot pay another activity's exclusive table.
 *  10. **The economy** — three comparisons, in `tools/forge.ts`'s idiom.
 *  11. **The preview is the simulation**, as a property: what the Altar advertises equals
 *      what `profileFor` produces.
 *
 * Headless, no browser. Run with `npm run memories`.
 */

import { Rng } from "../src/core/rng";
import { BOSSES } from "../src/data/bosses";
import { challengerMultiplier } from "../src/data/challenger";
import { biomeForRun, profileFor } from "../src/data/depth";
import { bossSpecForRun } from "../src/data/encounters";
import { dailyConfig, dailyPlan, dayNumber } from "../src/data/daily";
import { legendBossSpec } from "../src/data/legends";
import {
  CRYSTALLISE_COMPONENTS, MEMORY_BOONS, MEMORY_BOON_IDS, MEMORY_BURDENS, MEMORY_BURDEN_IDS,
  MEMORY_CEILING_MARGIN, MEMORY_CEILING_OVERSHOOT, MEMORY_FLOORS, MEMORY_MAX_RARITY,
  MEMORY_OPS, MEMORY_RARITIES, MEMORY_RARITY_CAP, MEMORY_UNLOCK_DEPTH, MEMORY_UNLOCK_HEIGHT,
  burdenLoad, crystalliseMemory, deepenMemory, distortMemory, etchMemory, memoryBossSpec,
  memoryConfig, memoryEffects, memoryEncounters, memoryForgetAsh, memoryMaxGrade,
  memoryModMagnitude, memoryOpCost, memoryPairs, memoryPlace, memoryPlaces, memoryProblems,
  memoryRarityAllowance, memoryRecallCost, memoryUnlocked, pctMult, rollMemory,
  type MemoryInstance,
} from "../src/data/memories";
import { MODES, RUN_MODES, delveConfig } from "../src/data/modes";
import { RAIDS, raidBossSpec } from "../src/data/raids";
import { nextFloorConfig } from "../src/data/planets";
import { previewForRun } from "../src/data/previews";
import { BASE_RARITY_BIAS, RARITIES, depthWeights, rarityIndex, type Rarity } from "../src/data/rarity";
import type { Action, AvatarInput } from "../src/core/input";
import { Dungeon } from "../src/game/dungeon";
import { GameState } from "../src/game/state";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

/** How far the walks below go. Well past the authored world. */
const FAR = 60;

/** A Memory with exactly the modifiers asked for, and nothing else. */
function memoryOf(
  burdens: MemoryInstance["burdens"], boons: MemoryInstance["boons"],
  opts: { rarity?: Rarity; depth?: number } = {},
): MemoryInstance {
  return {
    id: "test",
    rarity: opts.rarity ?? "mythic",
    depth: opts.depth ?? 20,
    placeId: memoryPlaces()[0]!.name,
    bossId: BOSSES[0]!.id,
    burdens,
    boons,
  };
}

const PLAIN = memoryOf([], []);

// --- 1. one curve -----------------------------------------------------------
//
// The Memory system's whole compliance with `data/depth.ts` rests on this: a Memory is an
// effective depth plus a danger, and the one curve does the rest. Stated as an equality
// against the Delve rather than as a bound, because a bound would pass for a second curve
// that happened to sit inside it.

console.log("\n=== a Memory walks the Delve's own curve ===");
{
  const FIELDS = ["enemyHealth", "enemyDamage", "enemySpeed", "aggression", "telegraph", "recommendedLevel"] as const;
  let same = true;
  let firstBreak = "";
  for (let d = 1; d <= FAR; d++) {
    for (const challenger of [0, 4, 11]) {
      const memory = memoryOf([], [], { depth: d });
      const mc = memoryConfig(memory, 1, challenger);
      const dc = delveConfig(d, challenger);
      const mp = profileFor(mc.depth, mc);
      const dp = profileFor(dc.depth, dc);
      for (const f of FIELDS) {
        if (mp[f] !== dp[f]) {
          same = false;
          if (!firstBreak) firstBreak = `depth ${d}, challenger ${challenger}: ${f} ${mp[f]} vs ${dp[f]}`;
        }
      }
    }
  }
  check("depth N in a Memory fights exactly like depth N in the Delve", same, firstBreak);

  // And the Memory's own general burden goes through `danger`, not through a curve of its
  // own: a Merciless Memory equals a *rift* at the same depth and the same danger.
  let viaDanger = true;
  let breakAt = "";
  for (let d = 5; d <= 40; d++) {
    for (const grade of [1, 2, 3] as const) {
      const memory = memoryOf([{ id: "merciless", grade }], [], { depth: d });
      const mc = memoryConfig(memory, 1, 0);
      const mp = profileFor(mc.depth, mc);
      // The same effective depth and the same danger, built by an unrelated mode.
      const rp = profileFor(d, { ...delveConfig(d, 0), danger: mc.danger });
      for (const f of FIELDS) {
        if (Math.abs(mp[f] - rp[f]) > 1e-9) {
          viaDanger = false;
          if (!breakAt) breakAt = `depth ${d} grade ${grade}: ${f} ${mp[f]} vs ${rp[f]}`;
        }
      }
    }
  }
  check("Merciless is a `danger` multiplier and nothing else", viaDanger, breakAt);

  check("`memoryConfig` folds the Challenger dial into danger the way every mode does",
    memoryConfig(PLAIN, 1, 7).danger === challengerMultiplier(7));
  check("a Memory is three floors and the last one is the encounter",
    MODES.memory.floors === MEMORY_FLOORS
    && memoryConfig(PLAIN, MEMORY_FLOORS, 0).bossFloor
    && memoryConfig(PLAIN, MEMORY_FLOORS, 0).lastFloor
    && !memoryConfig(PLAIN, 1, 0).bossFloor);
  check("each floor is one deeper than the last",
    memoryConfig(PLAIN, 2, 0).depth === PLAIN.depth + 1
    && memoryConfig(PLAIN, 3, 0).depth === PLAIN.depth + 2);

  // Advancing a floor must not lose the Memory. `nextFloorConfig`'s own doc comment is
  // about exactly this failure for planets and the Convergence: a generic `riftConfig`
  // rebuild would hand floor two a config with no Memory on it, silently dropping the
  // place, the encounter, both modifier lists and the danger. Walked all the way to the
  // encounter rather than checked one step, since one step is where that bug hides.
  {
    const rich = memoryOf(
      [{ id: "merciless", grade: 3 }, { id: "teeming", grade: 2 }],
      [{ id: "abundant", grade: 3 }, { id: "gilded", grade: 2 }],
      { depth: 28 },
    );
    let carried = true;
    let walked = memoryConfig(rich, 1, 6);
    for (let f = 2; f <= MEMORY_FLOORS; f++) {
      walked = nextFloorConfig(walked);
      if (walked.memory?.id !== rich.id) carried = false;
      if (walked.floor !== f || walked.depth !== rich.depth + f - 1) carried = false;
      if (walked.danger !== memoryConfig(rich, f, 6).danger) carried = false;
      if (walked.challengerTier !== 6) carried = false;
    }
    check("walking a Memory to its last floor keeps the Memory, the depth and the danger",
      carried && walked.bossFloor && walked.lastFloor,
      `floor ${walked.floor}, depth ${walked.depth}, memory ${walked.memory?.id ?? "LOST"}`);
    check("...and the encounter on that last floor is still the Memory's own",
      bossSpecForRun(walked).id === memoryBossSpec(rich.bossId).id);
  }
}

// --- 2. neutral where it should be -----------------------------------------
//
// `MODES.memory` carries no payout of its own, on purpose: every difference between two
// Memories lives on the instance. That is what makes check 1 an equality at all, and what
// guarantees adding this feature moved no existing balance number.

console.log("\n=== an unmodified Memory changes nothing ===");
{
  const m = MODES.memory;
  check("the mode is neutral on every axis it could have paid on",
    m.rarityBias === 0 && m.quantity === 1 && m.coinMult === 1 && m.keyMult === 1
    && m.gemMult === 1 && m.xpMult === 1 && m.dangerPerTier === 1,
    `${m.rarityBias} / ${m.quantity} / ${m.coinMult} / ${m.xpMult}`);

  const fx = memoryEffects(PLAIN);
  check("a Memory with no modifiers is neutral on every effect",
    fx.danger === 1 && fx.health === 1 && fx.count === 1 && fx.speed === 1
    && fx.telegraph === 1 && fx.aggression === 1 && fx.elites === 0
    && fx.quantity === 1 && fx.coins === 1 && fx.xp === 1 && fx.rarityBias === 0
    && fx.affixes.length === 0);
  check("no Memory at all is the same as a Memory with nothing on it",
    JSON.stringify(memoryEffects(null)) === JSON.stringify(fx));

  const mc = memoryConfig(memoryOf([], [], { depth: 17 }), 1, 0);
  const dc = delveConfig(17, 0);
  const mp = profileFor(mc.depth, mc), dp = profileFor(dc.depth, dc);
  check("and the whole payout half of the profile matches the Delve's too",
    mp.quantity === dp.quantity && mp.rarityBias === dp.rarityBias
    && mp.coinMultiplier === dp.coinMultiplier && mp.xpMultiplier === dp.xpMultiplier
    && mp.itemPower === dp.itemPower,
    `${mp.quantity}/${dp.quantity} · ${mp.rarityBias}/${dp.rarityBias}`);
}

// --- 3. no free positives ---------------------------------------------------

console.log("\n=== every boon was bought with a burden ===");
{
  let paired = true, wellFormed = true, overCap = false;
  let firstProblem = "";
  for (let seed = 0; seed < 3000; seed++) {
    const rng = new Rng(seed);
    const rarity = MEMORY_RARITIES[seed % MEMORY_RARITIES.length]!;
    const m = rollMemory(rarity, 30 + (seed % 20), rng, `m${seed}`);
    if (m.boons.length > m.burdens.length) paired = false;
    if (m.burdens.length > memoryPairs(rarity)) overCap = true;
    const problems = memoryProblems(m);
    if (problems.length > 0) {
      wellFormed = false;
      if (!firstProblem) firstProblem = `seed ${seed}: ${problems.join("; ")}`;
    }
  }
  check("3000 rolled Memories all carry at most as many boons as burdens", paired);
  check("…and none exceeds its rarity's pair count", !overCap);
  check("…and every one is structurally well-formed", wellFormed, firstProblem);

  // The invariant has to survive the workbench too, or the ops become the loophole.
  let opsPaired = true, opsWellFormed = true;
  let opBreak = "";
  for (let seed = 0; seed < 1500; seed++) {
    const rng = new Rng(seed ^ 0xbeef);
    let m = rollMemory(MEMORY_RARITIES[seed % MEMORY_RARITIES.length]!, 30, rng, `w${seed}`);
    for (let i = 0; i < 6; i++) {
      m = [distortMemory(m, rng), etchMemory(m, rng), deepenMemory(m), crystalliseMemory(m, rng) ?? m][i % 4]!;
      if (m.boons.length > m.burdens.length) opsPaired = false;
      const problems = memoryProblems(m);
      if (problems.length > 0) {
        opsWellFormed = false;
        if (!opBreak) opBreak = `seed ${seed} step ${i}: ${problems.join("; ")}`;
      }
    }
  }
  check("and it survives every workbench op, chained", opsPaired);
  check("…which never produces a malformed Memory either", opsWellFormed, opBreak);

  check("a Memory that is already full cannot be etched further", (() => {
    const rng = new Rng(7);
    const full = memoryOf(
      MEMORY_BURDEN_IDS.slice(0, memoryPairs("mythic")).map((id) => ({ id, grade: 1 as const })),
      MEMORY_BOON_IDS.slice(0, memoryPairs("mythic")).map((id) => ({ id, grade: 1 as const })),
    );
    const after = etchMemory(full, rng);
    return after.burdens.length === full.burdens.length && after.boons.length === full.boons.length;
  })());
}

// --- 4. rarer is richer, as a comparison ------------------------------------
//
// Two independent bounds ("a mythic pays at least X", "a common pays at most Y") would
// pass for a table where the two had swapped. So: hold the seed and the depth, walk the
// ladder, and require every axis to be monotonic in the rarity.

console.log("\n=== a rarer Memory is richer than a commoner one, at the same seed ===");
{
  const axes = (m: MemoryInstance) => {
    const fx = memoryEffects(m);
    return { pairs: m.burdens.length, quantity: fx.quantity, coins: fx.coins };
  };
  // Averaged over many seeds per rarity, because one roll is a draw from a pool and the
  // claim is about the ladder rather than about any single Memory.
  const mean = (rarity: Rarity) => {
    let pairs = 0, quantity = 0, coins = 0;
    const N = 400;
    for (let seed = 0; seed < N; seed++) {
      const a = axes(rollMemory(rarity, 30, new Rng(seed), "m"));
      pairs += a.pairs; quantity += a.quantity; coins += a.coins;
    }
    return { pairs: pairs / N, quantity: quantity / N, coins: coins / N };
  };
  const rungs = MEMORY_RARITIES.map((r) => ({ r, ...mean(r) }));
  let monotonic = true;
  let where = "";
  for (let i = 1; i < rungs.length; i++) {
    const lo = rungs[i - 1]!, hi = rungs[i]!;
    // Every rung is at least as good as the one below it, and the ends are strictly apart.
    if (!(hi.pairs >= lo.pairs && hi.quantity >= lo.quantity && hi.coins >= lo.coins)) {
      monotonic = false;
      if (!where) where = `${lo.r} → ${hi.r}: pairs ${lo.pairs}→${hi.pairs}, quantity ${lo.quantity.toFixed(2)}→${hi.quantity.toFixed(2)}`;
    }
  }
  check("every rung of the ladder pays at least as well as the one below it", monotonic, where);
  const first = rungs[0]!, last = rungs[rungs.length - 1]!;
  check("and a mythic Memory pays strictly more than a common one",
    last.pairs > first.pairs && last.quantity > first.quantity && last.coins > first.coins,
    `common ${first.quantity.toFixed(2)}× drops vs mythic ${last.quantity.toFixed(2)}×`);

  // A rarer Memory is also *harder*, which is the half that stops the ladder being free.
  const burden = (rarity: Rarity) => {
    let sum = 0;
    for (let seed = 0; seed < 400; seed++) sum += rollMemory(rarity, 30, new Rng(seed), "m").burdens.length;
    return sum / 400;
  };
  check("a mythic Memory carries strictly more burdens than a common one",
    burden("mythic") > burden("common"),
    `${burden("common").toFixed(2)} vs ${burden("mythic").toFixed(2)}`);
}

// --- 5. the rarity ceiling, and the one bounded place it moves ---------------
//
// This is the feature's one deliberate exception to "difficulty never lifts the rarity
// ceiling", taken at the owner's direction: *"You do at some point want the unspokens and
// stuff to be farmable... It's not by much, but that little percent that it does raise the
// ceiling does make it worth it."* Every check below exists to keep "not by much" and
// "paid for in difficulty" true rather than aspirational.

console.log("\n=== a Memory leans the table, and only the very worst of them lifts the ceiling ===");
{
  /** The best `luminous` roll, with `n` grade-III burdens behind it. */
  const luminous = (rarity: Rarity, burdens: number): MemoryInstance => memoryOf(
    MEMORY_BURDEN_IDS.slice(0, burdens).map((id) => ({ id, grade: 3 as const })),
    [{ id: "luminous", grade: 3 }],
    { rarity },
  );

  // 1. Nothing below the top rarity gets anywhere near the exception.
  let belowCapped = true;
  let where = "";
  for (const r of MEMORY_RARITIES) {
    if (r === MEMORY_MAX_RARITY) continue;
    for (let n = 0; n <= memoryPairs(r); n++) {
      const bias = memoryEffects(luminous(r, n)).rarityBias;
      if (bias > MEMORY_RARITY_CAP + 1e-12) {
        belowCapped = false;
        if (!where) where = `${r} with ${n} burdens reached ${bias}`;
      }
    }
  }
  check("no Memory below mythic can exceed the ordinary cap, however burdened", belowCapped, where);
  check("...and that ordinary cap is below the Abyssal Rift's own bias, so it never out-farms it",
    MEMORY_RARITY_CAP < MODES.abyss.rarityBias,
    `Memory ${MEMORY_RARITY_CAP} vs Abyss ${MODES.abyss.rarityBias}`);

  // 2. The lift has to be bought with difficulty. A mythic carrying nothing gets nothing.
  const pairs = memoryPairs(MEMORY_MAX_RARITY);
  const bare = memoryEffects(luminous(MEMORY_MAX_RARITY, 0)).rarityBias;
  const half = memoryEffects(luminous(MEMORY_MAX_RARITY, Math.floor(pairs / 2))).rarityBias;
  const full = memoryEffects(luminous(MEMORY_MAX_RARITY, pairs)).rarityBias;
  check("an unburdened mythic Memory is capped like everything else - the ceiling is not for sale",
    Math.abs(bare - MEMORY_RARITY_CAP) < 1e-12, String(bare));
  check("a half-burdened one gets strictly less than a fully burdened one",
    half > bare && full > half, `${bare} -> ${half} -> ${full}`);
  // Squared, not linear: half the load buys a quarter of the allowance, not half of it.
  check("...and the allowance is squared in the burden load, so half the difficulty is a quarter of the prize",
    (half - MEMORY_RARITY_CAP) < (full - MEMORY_RARITY_CAP) * 0.4,
    `half bought ${(half - MEMORY_RARITY_CAP).toFixed(4)} of ${(full - MEMORY_RARITY_CAP).toFixed(4)}`);
  check("burden load runs 0 to 1, and only a full load of worst-grade burdens reaches 1",
    burdenLoad(luminous(MEMORY_MAX_RARITY, 0)) === 0
    && burdenLoad(luminous(MEMORY_MAX_RARITY, pairs)) === 1);
  check("`memoryRarityAllowance` is the one place the ceiling is decided",
    memoryRarityAllowance(luminous(MEMORY_MAX_RARITY, pairs)) === full
    && memoryRarityAllowance(luminous("legendary", 3)) === MEMORY_RARITY_CAP);

  // 3. And when it is bought, it is small - stated as a comparison against the Abyss.
  check("the very best Memory does exceed the Abyssal Rift - that is the whole carve-out",
    full > MODES.abyss.rarityBias,
    `${full.toFixed(3)} vs ${MODES.abyss.rarityBias}`);
  check("...by no more than the stated margin, so this is a lean and not a new tier of access",
    full - MODES.abyss.rarityBias <= MEMORY_CEILING_MARGIN + 1e-12,
    `over by ${(full - MODES.abyss.rarityBias).toFixed(3)}, allowed ${MEMORY_CEILING_MARGIN}`);
  check("the margin is exactly what the constants say, so the doc cannot drift from the code",
    Math.abs((MEMORY_RARITY_CAP + MEMORY_CEILING_OVERSHOOT - MODES.abyss.rarityBias) - MEMORY_CEILING_MARGIN) < 1e-12);

  // 4. The absolute odds, so "small" is testable rather than aspirational. Unspoken has to
  //    stay an event on the best Memory anybody will ever roll - and the honest comparison
  //    is against the Abyss at the same depth and the same dial, because depth and the
  //    Challenger dial lift rarity for every mode equally and neither is this exception.
  const unspokenOdds = (depth: number, bias: number) => {
    const w = depthWeights(depth, bias);
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    return w.unspoken / total;
  };
  const DEEP = 45;
  const CHALLENGER_CAP = 0.17;
  const bestMemory = unspokenOdds(DEEP, BASE_RARITY_BIAS + full + CHALLENGER_CAP);
  const bestAbyss = unspokenOdds(DEEP, BASE_RARITY_BIAS + MODES.abyss.rarityBias + CHALLENGER_CAP);
  const plainFloor = unspokenOdds(DEEP, BASE_RARITY_BIAS);
  check("unspoken is genuinely farmable on the best Memory - that is the point",
    bestMemory > bestAbyss,
    `1 in ${Math.round(1 / bestMemory)} vs the Abyss's 1 in ${Math.round(1 / bestAbyss)}`);
  check("...but only a little better than the Abyss, not a different game",
    bestMemory / bestAbyss < 1.5,
    `${((bestMemory / bestAbyss - 1) * 100).toFixed(0)}% better odds`);
  check(`...and it is still an event: rarer than one in thirty drops at depth ${DEEP}`,
    bestMemory < 1 / 30, `1 in ${Math.round(1 / bestMemory)}`);
  check("an ordinary floor at the same depth is far stingier, so the Memory earned it",
    plainFloor < bestMemory / 5,
    `plain 1 in ${Math.round(1 / plainFloor)} vs Memory 1 in ${Math.round(1 / bestMemory)}`);

  // 5. The mechanism is still an addition into the one composed sum, keyed on nothing.
  const stacked = luminous(MEMORY_MAX_RARITY, pairs);
  const mc = memoryConfig(stacked, 1, 20);
  const dc = delveConfig(mc.depth, 20);
  const mp = profileFor(mc.depth, mc), dp = profileFor(dc.depth, dc);
  check("a Memory's push adds into the one composed sum and nothing else",
    Math.abs(mp.rarityBias - (dp.rarityBias + full)) < 1e-12,
    `${mp.rarityBias} vs ${dp.rarityBias} + ${full}`);
  const lowC = memoryConfig(stacked, 1, 0);
  const low = profileFor(lowC.depth, lowC);
  const lowPlain = profileFor(delveConfig(lowC.depth, 0).depth, delveConfig(lowC.depth, 0));
  check("...identical at Challenger 0 and at Challenger 20, so it scales no capped term",
    Math.abs((mp.rarityBias - dp.rarityBias) - (low.rarityBias - lowPlain.rarityBias)) < 1e-12);

  // 6. The exception is narrow: everything else about the rarity ladder is untouched.
  check("no Memory rarity reaches divine or unspoken",
    !MEMORY_RARITIES.includes("divine") && !MEMORY_RARITIES.includes("unspoken")
    && MEMORY_RARITIES.length === rarityIndex("mythic") + 1);
  check("crystallising stops at mythic",
    crystalliseMemory(memoryOf([], [], { rarity: "mythic" }), new Rng(1)) === null
    && crystalliseMemory(memoryOf([], [], { rarity: "legendary" }), new Rng(1))?.rarity === "mythic");
  check("`memoryProblems` refuses a divine or unspoken Memory outright",
    RARITIES.slice(rarityIndex("divine")).every(
      (r) => memoryProblems(memoryOf([], [], { rarity: r })).length > 0));
  check("and a Memory still moves no `rewardCurve` axis of its own - section 16's caps are untouched",
    (() => {
      const on = memoryConfig(stacked, 1, 0);
      const off = memoryConfig(memoryOf(stacked.burdens, [], { rarity: MEMORY_MAX_RARITY }), 1, 0);
      // Same burdens, so the same danger: the boon may not have moved item power or
      // variant odds, which belong to `rewardCurve` and are capped there.
      return profileFor(on.depth, on).itemPower === profileFor(off.depth, off).itemPower
        && profileFor(on.depth, on).variantChance === profileFor(off.depth, off).variantChance;
    })());
}

// --- 6. §16: what a Memory's difficulty is worth ----------------------------
//
// The distinction `docs/memories.md` §5.3 draws: the Vigil's difficulty is the day's
// weather and is divided back out of `rewardCurve`; a Memory's is the most deliberately
// chosen difficulty in the game and is not. Both halves asserted, as comparisons.

console.log("\n=== a Memory's own danger climbs the reward curve; the day's weather does not ===");
{
  const soft = memoryOf([{ id: "obdurate", grade: 3 }], [], { depth: 25 });
  const hard = memoryOf([{ id: "merciless", grade: 3 }], [], { depth: 25 });
  const sc = memoryConfig(soft, 1, 0), hc = memoryConfig(hard, 1, 0);
  const sp = profileFor(sc.depth, sc), hp = profileFor(hc.depth, hc);
  check("a Merciless Memory is paid for it — strictly more drops than the same floor without it",
    hp.quantity > sp.quantity,
    `${sp.quantity.toFixed(3)} → ${hp.quantity.toFixed(3)}`);
  check("…and strictly more item power at the top of the ladder",
    profileFor(memoryConfig(memoryOf([{ id: "merciless", grade: 3 }], [], { depth: 25 }), 1, 12).depth,
      memoryConfig(memoryOf([{ id: "merciless", grade: 3 }], [], { depth: 25 }), 1, 12)).itemPower
    >= profileFor(memoryConfig(soft, 1, 12).depth, memoryConfig(soft, 1, 12)).itemPower);

  // The other half of the split: the Vigil's own Ferocious day still must not pay.
  const day = (() => {
    for (let d = dayNumber(); d < dayNumber() + 400; d++) {
      if (dailyPlan(d).modifiers.includes("ferocity")) return d;
    }
    return null;
  })();
  if (day === null) {
    check("a Ferocious Vigil exists to compare against", false, "none in the next 400 days");
  } else {
    const vc = dailyConfig(day, 0);
    const vp = profileFor(vc.depth, vc);
    const plainVigil = profileFor(vc.depth, { ...vc, danger: 1, daily: undefined });
    check("a Ferocious Vigil is still not paid for its own weather",
      Math.abs(vp.itemPower - plainVigil.itemPower) < 1e-12,
      `${vp.itemPower} vs ${plainVigil.itemPower}`);
  }

  // The shape burdens deliberately do *not* climb the curve — they are paid for by the
  // boon they were rolled with, not by §16. Stated so the split can't be quietly undone.
  check("a shape burden alone does not move the reward curve",
    sp.itemPower === profileFor(memoryConfig(memoryOf([], [], { depth: 25 }), 1, 0).depth,
      memoryConfig(memoryOf([], [], { depth: 25 }), 1, 0)).itemPower);

  // And a shape burden genuinely *does* change the fight, or it would be decoration.
  const plain = memoryConfig(memoryOf([], [], { depth: 25 }), 1, 0);
  const pp = profileFor(plain.depth, plain);
  check("…but it does make the floor harder, on the field it names",
    sp.enemyHealth > pp.enemyHealth,
    `${Math.round(pp.enemyHealth)} → ${Math.round(sp.enemyHealth)}`);
  const teem = memoryConfig(memoryOf([{ id: "teeming", grade: 3 }], [], { depth: 25 }), 1, 0);
  check("Teeming puts strictly more bodies on the floor",
    profileFor(teem.depth, teem).enemiesPerWave > pp.enemiesPerWave);
  const quick = memoryConfig(memoryOf([{ id: "quickened", grade: 3 }], [], { depth: 25 }), 1, 0);
  check("Quickened makes them strictly faster", profileFor(quick.depth, quick).enemySpeed > pp.enemySpeed);
  const unread = memoryConfig(memoryOf([{ id: "unreadable", grade: 3 }], [], { depth: 25 }), 1, 0);
  const up = profileFor(unread.depth, unread);
  check("Unreadable shortens the wind-up and the gap between swings",
    up.telegraph < pp.telegraph && up.aggression < pp.aggression);
  check("Hunted asks the quota for more elites", memoryEffects(memoryOf([{ id: "hunted", grade: 3 }], [])).elites === 3);
  check("Armored and Spiteful force affixes that exist",
    memoryEffects(memoryOf([{ id: "armored", grade: 3 }, { id: "spiteful", grade: 3 }], [])).affixes.length === 6);

  // Every boon reaches a real field, or it is a line of prose with a price on it.
  for (const id of MEMORY_BOON_IDS) {
    const on = memoryConfig(memoryOf([{ id: "merciless", grade: 1 }], [{ id, grade: 3 }], { depth: 25 }), 1, 0);
    const off = memoryConfig(memoryOf([{ id: "merciless", grade: 1 }], [], { depth: 25 }), 1, 0);
    const a = profileFor(on.depth, on), b = profileFor(off.depth, off);
    const moved = a.quantity > b.quantity || a.rarityBias > b.rarityBias
      || a.coinMultiplier > b.coinMultiplier || a.xpMultiplier > b.xpMultiplier;
    check(`${MEMORY_BOONS[id].name} moves a number the player can see`, moved);
  }
}

// --- 7. Challenger ----------------------------------------------------------

console.log("\n=== the Challenger dial reaches a Memory, verified rather than assumed ===");
{
  const m = memoryOf([{ id: "merciless", grade: 2 }], [{ id: "abundant", grade: 2 }], { depth: 25 });
  let dangerUp = true, quantityUp = true, coinsUp = true, rarityUp = true;
  let prev = null as null | ReturnType<typeof profileFor>;
  for (let tier = 0; tier <= 20; tier++) {
    const c = memoryConfig(m, 1, tier);
    const p = profileFor(c.depth, c);
    if (prev) {
      if (!(c.danger > memoryConfig(m, 1, tier - 1).danger)) dangerUp = false;
      if (p.quantity < prev.quantity) quantityUp = false;
      if (p.coinMultiplier < prev.coinMultiplier) coinsUp = false;
      if (p.rarityBias < prev.rarityBias) rarityUp = false;
    }
    prev = p;
  }
  check("danger climbs strictly with every Challenger tier", dangerUp);
  check("and no payout axis ever goes backwards", quantityUp && coinsUp && rarityUp);
  const off = memoryConfig(m, 1, 0), on = memoryConfig(m, 1, 10);
  check("Challenger 10 pays strictly better than the dial off, on the same Memory",
    profileFor(on.depth, on).quantity > profileFor(off.depth, off).quantity
    && profileFor(on.depth, on).coinMultiplier > profileFor(off.depth, off).coinMultiplier);
}

// --- 8. the gate ------------------------------------------------------------

console.log("\n=== the Altar asks for both ends of the war, on one character ===");
{
  check("neither ladder alone opens it",
    !memoryUnlocked(MEMORY_UNLOCK_DEPTH, 0)
    && !memoryUnlocked(0, MEMORY_UNLOCK_HEIGHT)
    && !memoryUnlocked(MEMORY_UNLOCK_DEPTH - 1, MEMORY_UNLOCK_HEIGHT)
    && !memoryUnlocked(MEMORY_UNLOCK_DEPTH, MEMORY_UNLOCK_HEIGHT - 1));
  check("both together do", memoryUnlocked(MEMORY_UNLOCK_DEPTH, MEMORY_UNLOCK_HEIGHT));
  // Widening only, like every other §23 unlock: more progress never closes it.
  let monotonic = true;
  for (let d = MEMORY_UNLOCK_DEPTH; d <= FAR; d++) {
    for (let h = MEMORY_UNLOCK_HEIGHT; h <= FAR; h++) {
      if (!memoryUnlocked(d, h)) monotonic = false;
    }
  }
  check("and more progress never shuts it again", monotonic);

  const state = new GameState(1);
  check("a fresh account's Altar is shut", !state.altarUnlocked);
  // A height is a height. Banking the whole Tower must never open a gate that asks for
  // the descent — the §21 rule, checked from this feature's side.
  state.recordDepth(40, { ...delveConfig(40), tower: { height: 40 }, mode: MODES.tower });
  check("banking height 40 leaves the depth record at zero",
    state.player.deepestDepth === 0 && state.stats.deepestDepth === 0,
    `depth ${state.player.deepestDepth}, height ${state.player.highestHeight}`);
  check("…so a pure climber's Altar is still shut", !state.altarUnlocked);
  state.recordDepth(MEMORY_UNLOCK_DEPTH, delveConfig(MEMORY_UNLOCK_DEPTH));
  check("…and it opens once the descent catches up", state.altarUnlocked);

  // Per class: the gate reads the character sheet, not the account.
  const altId = (Object.keys(state.players) as (keyof typeof state.players)[])
    .find((c) => c !== state.activeClassId);
  const other = altId ? state.players[altId] : undefined;
  check("an alt that has done neither does not inherit the Altar",
    other !== undefined && other.deepestDepth === 0 && other.highestHeight === 0
    && !memoryUnlocked(other.deepestDepth, other.highestHeight));
}

// --- 9. the pool ------------------------------------------------------------

console.log("\n=== the monsters and bosses come from across the game, and nowhere they shouldn't ===");
{
  const places = memoryPlaces();
  const bosses = memoryEncounters();
  check("the pool draws places from all three of the Delve, the Tower and the Reliquary",
    places.length >= 15 && new Set(places.map((p) => p.name)).size === places.length,
    `${places.length} places`);
  check("every rolled place and encounter resolves", (() => {
    for (let seed = 0; seed < 2000; seed++) {
      const m = rollMemory("rare", 30, new Rng(seed), "m");
      if (!memoryPlace(m.placeId)) return false;
      if (!bosses.some((b) => b.id === m.bossId)) return false;
    }
    return true;
  })());
  check("the Proving is not in the pool",
    !bosses.some((b) => b.id.startsWith("legend-"))
    && !bosses.some((b) => b.id === legendBossSpec("lancer").id));
  // Raids landed (UAT §15) while this was being built, so the exclusion is pinned against
  // the real raid table rather than against a naming convention: neither a raid's encounter
  // nor a raid's arena may turn up in a Memory. A raid is an event you travel to, its table
  // is addressed by the raid rather than by its boss id, and a raid encounter standing in a
  // Memory would be the fight without the table.
  check("no raid encounter is in the pool",
    !bosses.some((b) => b.id.startsWith("raid-"))
    && RAIDS.every((r) => !bosses.some((b) => b.id === raidBossSpec(r).id)));
  check("no raid arena is in the pool either",
    RAIDS.every((r) => !places.some((p) => p.name === r.biome.name)),
    RAIDS.map((r) => r.biome.name).join(", "));

  // The exclusivity guard: a Memory's encounter is reskinned to a `memory-` id, so nothing
  // it borrows can satisfy that encounter's own `boss`-addressed drop sources.
  let rewritten = true;
  for (const b of bosses) {
    const spec = memoryBossSpec(b.id);
    if (spec.id !== `memory-${b.id}` || bosses.some((o) => o.id === spec.id)) rewritten = false;
  }
  check("a Memory's encounter carries a `memory-` id nothing else answers to", rewritten);
  check("…and `bossSpecForRun` returns it for a Memory floor", (() => {
    const m = memoryOf([], [], { depth: 25 });
    const c = memoryConfig({ ...m, bossId: BOSSES[2]!.id }, MEMORY_FLOORS, 0);
    return bossSpecForRun(c).id === `memory-${BOSSES[2]!.id}`;
  })());
  check("a Memory's floor is made of the place it remembers", (() => {
    for (const place of places) {
      const c = memoryConfig({ ...PLAIN, placeId: place.name }, 1, 0);
      if (biomeForRun(c).name !== place.name) return false;
    }
    return true;
  })());
}

// --- 10. the economy --------------------------------------------------------
//
// Comparisons, in `tools/forge.ts`'s idiom: an economy is a set of relationships between
// prices, and a bound on any single price proves none of them.

console.log("\n=== the Altar's economy holds as comparisons ===");
{
  let forgettingNeverFunds = true;
  for (const r of MEMORY_RARITIES) {
    if (memoryForgetAsh(r) >= memoryOpCost("distort", r).ash) forgettingNeverFunds = false;
  }
  check("forgetting a Memory never pays for distorting a peer of its rarity", forgettingNeverFunds);

  let ladderCostsMore = true;
  let where = "";
  for (const r of MEMORY_RARITIES) {
    const target = RARITIES[rarityIndex(r) + 1];
    if (!target || !MEMORY_RARITIES.includes(target)) continue;
    const up = memoryOpCost("crystallise", r);
    const fresh = memoryRecallCost(target);
    // Crystallising also melts two Memories of the current rarity, so it is strictly the
    // dearer route even before the components are counted — you pay to *keep* a roll.
    if (!(up.coins + up.scrap > fresh.coins + fresh.scrap)) {
      ladderCostsMore = false;
      if (!where) where = `${r} → ${target}: ${up.coins + up.scrap} vs ${fresh.coins + fresh.scrap}`;
    }
  }
  check("crystallising up costs strictly more than recalling fresh at that rarity — both paths stay alive",
    ladderCostsMore, where);
  check("…and it melts two Memories on top of that", CRYSTALLISE_COMPONENTS === 2);

  let priceClimbs = true;
  for (let i = 1; i < MEMORY_RARITIES.length; i++) {
    const lo = MEMORY_RARITIES[i - 1]!, hi = MEMORY_RARITIES[i]!;
    const a = memoryRecallCost(lo), b = memoryRecallCost(hi);
    if (!(b.coins > a.coins && b.scrap > a.scrap)) priceClimbs = false;
    for (const op of MEMORY_OPS) {
      if (op === "forget") continue;
      if (memoryOpCost(op, hi).ash <= memoryOpCost(op, lo).ash) priceClimbs = false;
    }
  }
  check("every rarity costs strictly more than the one below it, to make and to shape", priceClimbs);

  check("recalling costs materials and coins but never Ash — making is not shaping",
    MEMORY_RARITIES.every((r) => memoryRecallCost(r).ash === 0 && memoryRecallCost(r).scrap > 0));

  // The Vault is a real economy, end to end: it charges, it hands something back, and it
  // refuses when the price can't be met.
  const state = new GameState(11);
  state.recordDepth(MEMORY_UNLOCK_DEPTH, delveConfig(MEMORY_UNLOCK_DEPTH));
  state.recordDepth(MEMORY_UNLOCK_HEIGHT, { ...delveConfig(MEMORY_UNLOCK_HEIGHT), tower: { height: MEMORY_UNLOCK_HEIGHT }, mode: MODES.tower });
  check("a broke account cannot recall anything", state.recallMemory("common") === null);
  state.coins = 10_000_000;
  state.materials.physical = 100_000;
  state.ash = 100_000;
  const made = state.recallMemory("legendary");
  check("a solvent one can", made !== null && state.memories.length === 1);
  if (made) {
    const coinsBefore = state.coins;
    const distorted = state.applyMemoryOp(made.id, "distort");
    check("distorting charges and returns a Memory of the same rarity",
      distorted !== null && distorted.rarity === made.rarity && state.coins < coinsBefore);
    const spent = state.takeMemory(made.id);
    check("spending one empties the Vault and hands the Memory over",
      spent?.id === made.id && state.memories.length === 0);
    check("…and it does not come back", state.takeMemory(made.id) === null);
  }
  check("a locked Altar recalls nothing", (() => {
    const shut = new GameState(12);
    shut.coins = 10_000_000;
    shut.materials.physical = 100_000;
    return shut.recallMemory("common") === null;
  })());
}

// --- 11. the preview is the simulation --------------------------------------

console.log("\n=== what the Altar advertises is what the floor rolls ===");
{
  let agrees = true;
  let where = "";
  for (let seed = 0; seed < 200; seed++) {
    const m = rollMemory(MEMORY_RARITIES[seed % MEMORY_RARITIES.length]!, 30, new Rng(seed), "m");
    const config = memoryConfig(m, 1, seed % 5);
    const preview = previewForRun(config);
    const fx = memoryEffects(m);
    const profile = profileFor(config.depth, config);
    // The preview quotes the Memory's own multipliers; the profile composes them. They
    // have to be the same numbers, because they come from the same call.
    const quantityLine = preview.other.find((o) => o.includes("the usual number of drops"));
    if (fx.quantity !== 1 && !quantityLine) {
      agrees = false;
      if (!where) where = `seed ${seed}: quantity ${fx.quantity} unmentioned`;
    }
    if (Math.abs(profile.quantity / fx.quantity - profileFor(config.depth, { ...config, memory: undefined }).quantity) > 1e-9) {
      agrees = false;
      if (!where) where = `seed ${seed}: the profile does not compose the Memory's own quantity`;
    }
    // Three floors previewed, and every one of them carries the Memory.
    if (preview.bosses.length !== 1) {
      agrees = false;
      if (!where) where = `seed ${seed}: ${preview.bosses.length} encounters previewed, expected 1`;
    }
  }
  check("the preview quotes the Memory's own numbers, and they are the profile's", agrees, where);
  check("the preview walks all three floors and finds exactly the one encounter",
    previewForRun(memoryConfig(PLAIN, 1, 0)).bosses.length === 1);
  check("the preview names the Memory's own encounter, not the depth's",
    previewForRun(memoryConfig({ ...PLAIN, bossId: BOSSES[1]!.id }, 1, 0)).bosses[0]
      === memoryBossSpec(BOSSES[1]!.id).name);
}

// --- 11b. every modifier is a percentage ------------------------------------
//
// The owner's ruling: "Every modifier should be a percent increase, not a three times, two
// times, etcetera." That is a claim about the *data*, so it is checked in the data rather
// than trusted to whoever writes the next modifier.

console.log("\n=== every modifier is a percentage, not a multiplier ===");
{
  const all = [...Object.values(MEMORY_BOONS), ...Object.values(MEMORY_BURDENS)];
  check("every family declares how it expresses its magnitude",
    all.every((d) => d.magnitude === "percent" || d.magnitude === "count" || d.magnitude === "affix"));
  const percents = all.filter((d) => d.magnitude === "percent");
  check("the percentage families are the great majority - the exceptions stay exceptions",
    percents.length > all.length / 2, `${percents.length} of ${all.length}`);
  check("every percentage climbs strictly with the grade",
    percents.every((d) => d.pct[0] < d.pct[1] && d.pct[1] < d.pct[2]));
  // The ruling itself: a percentage, not a factor. Nothing may be authored as "x3".
  check("no percentage is authored as a multiplier - every value reads as a percent",
    percents.every((d) => d.pct.every((v) => v >= 1 && v <= 400)),
    percents.map((d) => `${d.name} ${d.pct.join("/")}`).join(" - "));
  check("the two non-percentage families are the honest ones and nothing else",
    all.filter((d) => d.magnitude !== "percent").map((d) => d.id).sort().join(",")
      === "armored,hunted,spiteful");
  check("`pctMult` is the one conversion, and it is 1 + pct/100",
    pctMult(0) === 1 && pctMult(100) === 2 && Math.abs(pctMult(45) - 1.45) < 1e-12);
  // And the screen says it in that unit, so the player reads what the tuner edits.
  check("the Altar renders a percentage as a percentage",
    memoryModMagnitude({ id: "abundant", grade: 2 }) === `+${MEMORY_BOONS.abundant.pct[1]}%`
    && memoryModMagnitude({ id: "hunted", grade: 2 }).includes("elites")
    && memoryModMagnitude({ id: "armored", grade: 1 }).length > 0);
  check("the worst grade of every burden is a percentage the curve can absorb",
    Object.values(MEMORY_BURDENS).filter((d) => d.magnitude === "percent")
      .every((d) => d.pct[2] <= 200));
  // Merciless is the only burden that moves `danger`, so it compounds through enemy
  // health, damage, speed, the crowd, the elite budget and the reward curve all at once.
  // Two guards on that, both comparative — the percentages of the other families are not
  // commensurable with it (Unreadable's is a reduction of a different quantity), so the
  // comparison is against the ones that inflate a single stat and against the danger the
  // curve already handles.
  check("Merciless asks less on paper than the burdens that inflate one stat hardest",
    MEMORY_BURDENS.merciless.pct[2] < MEMORY_BURDENS.obdurate.pct[2]
    && MEMORY_BURDENS.merciless.pct[2] < MEMORY_BURDENS.teeming.pct[2],
    `Merciless ${MEMORY_BURDENS.merciless.pct[2]} vs Obdurate ${MEMORY_BURDENS.obdurate.pct[2]}`);
  check("...and at its worst it is still less danger than four Abyssal Rift tiers",
    pctMult(MEMORY_BURDENS.merciless.pct[2]) < Math.pow(MODES.abyss.dangerPerTier, 4),
    `${pctMult(MEMORY_BURDENS.merciless.pct[2]).toFixed(2)}x vs ${Math.pow(MODES.abyss.dangerPerTier, 4).toFixed(2)}x`);
  check("every grade is reachable at the top rarity", memoryMaxGrade(MEMORY_MAX_RARITY) === 3);
}

// --- 12. the mode is wired into the world -----------------------------------

console.log("\n=== the mode is a first-class citizen of the world tables ===");
{
  check("`memory` is in `RUN_MODES`", (RUN_MODES as readonly string[]).includes("memory"));
  check("the Memory tag says where you are standing", (() => {
    const c = memoryConfig(memoryOf([], [], { depth: 21, rarity: "epic" }), 2, 0);
    const tag = profileFor(c.depth, c).tag;
    return tag.includes("Epic Memory") && tag.includes("Floor 2/3");
  })());
  check("both the vocabulary tables are complete and distinct",
    MEMORY_BOON_IDS.length === Object.keys(MEMORY_BOONS).length
    && MEMORY_BURDEN_IDS.length === Object.keys(MEMORY_BURDENS).length
    && MEMORY_BOON_IDS.length >= memoryPairs("mythic")
    && MEMORY_BURDEN_IDS.length >= memoryPairs("mythic"));
  check("every modifier says something dry about itself, and none of them quotes a key",
    [...Object.values(MEMORY_BOONS), ...Object.values(MEMORY_BURDENS)].every(
      (d) => d.blurb.length > 0 && d.blurb.length <= 140 && !/\[[A-Z]\]|\bpress\b|\bclick\b/i.test(d.blurb)));
  // A rift ladder this mode does not have: clearing a Memory must open no tier.
  const state = new GameState(3);
  const before = state.riftTiers.memory;
  state.recordDepth(30, memoryConfig(memoryOf([], [], { depth: 30 }), MEMORY_FLOORS, 0));
  check("clearing a Memory books the Record and opens no tier ladder",
    state.riftTiers.memory === before && state.stats.riftsCleared.memory === 1);
}

// --- 13. live: the one line of simulation code this feature adds ------------
//
// `armored` and `spiteful` force monster affixes onto every wave monster, which is the
// only place Memories reach into `game/`. A data check would only prove the ids resolve;
// this builds a real floor and looks at what actually spawned.

console.log("\n=== a forced affix really is on every monster on the floor ===");
{
  /** A hero that stands still: this section is about what spawns, not about a fight. */
  class IdleInput implements AvatarInput {
    moveVector() { return { x: 0, y: 0 }; }
    wasPressed(_a: Action) { return false; }
    aimAngle() { return null; }
  }
  const idle = new IdleInput();

  const state = new GameState(5);
  state.player.level = 40;
  state.player.deepestDepth = 30;
  state.player.refresh();
  state.player.fullHeal();

  const armored = memoryOf(
    [{ id: "armored", grade: 3 }, { id: "teeming", grade: 1 }],
    [{ id: "abundant", grade: 1 }, { id: "gilded", grade: 1 }],
    { depth: 12 },
  );
  const forced = memoryEffects(armored).affixes;
  const d = new Dungeon(state, memoryConfig(armored, 1, 0), 4242);
  // Run the wave director long enough to have a floor's worth of bodies to look at.
  for (let i = 0; i < 900 && d.enemies.length < 12; i++) d.update(1 / 60, idle);
  const wave = d.enemies.filter((e) => !e.boss);
  check("the floor spawned monsters to look at", wave.length > 0, `${wave.length} on the floor`);
  check("every one of them carries every forced affix",
    wave.length > 0 && wave.every((e) => forced.every((id) => e.affixes.some((a) => a.id === id))),
    `forced ${forced.join(", ")}`);
  check("...and none of them carries it twice",
    wave.every((e) => new Set(e.affixes.map((a) => a.id)).size === e.affixes.length));
  check("the forced affixes show up in the monster's name, so the player can see the burden",
    wave.length > 0 && wave.every((e) => e.name.length > 0));

  // And a floor with no Memory on it is untouched — the hook is inert everywhere else.
  const plainRun = new Dungeon(state, delveConfig(12), 4242);
  for (let i = 0; i < 900 && plainRun.enemies.length < 12; i++) plainRun.update(1 / 60, idle);
  const plainWave = plainRun.enemies.filter((e) => !e.boss);
  check("a Delve floor at the same depth forces nothing",
    plainWave.length > 0 && plainWave.some((e) => e.affixes.length === 0));

  // The quota reads the Memory's Hunted burden through the same clamp everything else uses.
  // Depth 22, not 20: every fifth Delve depth is a boss floor and a boss floor owes no
  // elites at all, so comparing against one would be comparing against zero and passing
  // for the wrong reason.
  const QUOTA_DEPTH = 22;
  const hunted = memoryOf([{ id: "hunted", grade: 3 }], [{ id: "abundant", grade: 1 }], { depth: QUOTA_DEPTH });
  const hd = new Dungeon(state, memoryConfig(hunted, 1, 0), 77);
  const plainQuota = new Dungeon(state, delveConfig(QUOTA_DEPTH), 77);
  check("the plain floor being compared against genuinely owes elites of its own",
    !plainQuota.profile.isBoss && plainQuota.elitesRequired > 0, `${plainQuota.elitesRequired}`);
  check("Hunted makes the floor ask for strictly more elites than the same depth would",
    hd.elitesRequired > plainQuota.elitesRequired,
    `${plainQuota.elitesRequired} → ${hd.elitesRequired}`);
}

// --- the confirm control and the op refuse for the same reasons ----------------

console.log("\n=== a greyed-out button and a refused op agree (docket §18) ===");
{
  // The Altar's action strip disables itself from `memoryOpBlocker`, and `applyMemoryOp`
  // enforces the same rules — because it *calls* it. That extraction is the whole point:
  // a second copy of the refusal rules living in `ui/town.ts` is exactly the drift docket
  // §10 spent a branch removing from the Forge's preview, and a button that looks live and
  // then says "it won't take that" is the visible half of the same defect.
  //
  // Asserted as an equivalence rather than one-sided containment: a blocker with no refusal
  // behind it greys out a button that would have worked, and a refusal with no blocker is
  // the dead button the owner would report. Both directions, at every rarity, for every op.
  //
  // **How to falsify this, because the obvious way doesn't work.** Tightening
  // `memoryOpBlocker` (say, `cost.ash + 1`) leaves this green, and that is not a gap — it
  // is the extraction doing its job: `applyMemoryOp` *calls* the blocker, so a stricter
  // blocker refuses in both places by construction, and that direction is impossible
  // rather than merely unobserved. A rule that cannot be violated beats a check that
  // notices when it was. What this check actually guards is the two things that can still
  // regress, and both were confirmed red before it was trusted: deleting the
  // `memoryOpBlocker` consult from `applyMemoryOp` (→ "blocker …, op ran"), and adding a
  // refusal inside `applyMemoryOp` that the blocker knows nothing about (→ "blocker none,
  // op refused"). Falsify it those two ways, not by moving a threshold.
  let agree = true;
  let disagreement = "";
  let blockedSeen = 0;
  let allowedSeen = 0;

  for (let seed = 0; seed < 60; seed++) {
    // Accounts across the whole solvency range, so both verdicts are actually exercised:
    // stone broke, exactly-ish affordable, and rich enough that only a structural rule
    // (the pair ceiling, the crystallise components) can refuse.
    const purse = [0, 400, 40_000, 100_000_000][seed % 4]!;
    const state = new GameState(500 + seed);
    state.recordDepth(MEMORY_UNLOCK_DEPTH, delveConfig(MEMORY_UNLOCK_DEPTH));
    state.coins = purse;
    state.ash = purse;
    state.materials.physical = purse;

    const rarity = MEMORY_RARITIES[seed % MEMORY_RARITIES.length]!;
    const memory = rollMemory(rarity, 30, new Rng(seed), `blk${seed}`);
    for (const op of MEMORY_OPS) {
      // A fresh account per (memory, op): applying one op mutates the Vault, and the
      // question is what the *button* and the *op* say about the same untouched state.
      const probe = new GameState(900 + seed);
      probe.recordDepth(MEMORY_UNLOCK_DEPTH, delveConfig(MEMORY_UNLOCK_DEPTH));
      probe.coins = purse;
      probe.ash = purse;
      probe.materials.physical = purse;
      probe.memories = [{ ...memory }];

      const blocker = probe.memoryOpBlocker(memory.id, op);
      const ran = probe.applyMemoryOp(memory.id, op) !== null;
      if (blocker) blockedSeen++; else allowedSeen++;
      if (!!blocker === ran) {
        agree = false;
        disagreement = `${rarity} ${op} at purse ${purse}: blocker ${
          blocker ? `"${blocker}"` : "none"}, op ${ran ? "ran" : "refused"}`;
      }
    }
  }

  check("the button's reason and the op's refusal are the same verdict, both directions",
    agree, agree ? `${blockedSeen} blocked, ${allowedSeen} allowed` : disagreement);
  // A comparison that only ever saw one verdict would pass while proving nothing — the
  // repo's standing lesson about checks whose scope has quietly emptied.
  check("…and both verdicts were actually exercised", blockedSeen > 0 && allowedSeen > 0,
    `${blockedSeen} blocked, ${allowedSeen} allowed`);
  check("a Memory that isn't in the Vault is refused with a reason, not a crash",
    new GameState(7).memoryOpBlocker("no-such-memory", "distort") !== null);
}

console.log(failures === 0
  ? "\nPurgatory remembered it exactly as asked.\n"
  : `\n${failures} problem(s).\n`);
process.exit(failures === 0 ? 0 : 1);
