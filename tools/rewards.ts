/**
 * The reward curve acceptance test — UAT §16, "harder content pays better".
 *
 * §16 lists five axes difficulty should move: drop rarity, drop chance, number of possible
 * drops, potential item power, and special variants. Three of those already worked, two
 * were not expressed at all, and none of them was stated in one place. `data/rewards.ts`
 * is that statement; this pins the four things about it that would be expensive to get
 * wrong:
 *
 *  1. **It is neutral at ordinary difficulty.** Every axis is exactly 1 (or 0) at
 *     `danger` 1, so no existing balance baseline moves — the campaign figures, the raid
 *     boss checks and the floor economy all run at danger 1.
 *  2. **Every axis is capped, and the caps cannot be routed around.** §9's decision that
 *     `challengerRarityBias` stops climbing around tier 11 is deliberate: the Death March
 *     tiers are about raw danger, not about paying more. A §16 that added a second rarity
 *     term keyed on `danger` would have quietly undone that, so the test asserts rarity is
 *     *unchanged* by this work.
 *  3. **The two new axes actually reach a drop**, measured through a real floor rather
 *     than by reading the profile back.
 *  4. **Item power stays wearable.** It lifts `ilvl`, and `ilvl` drives `requiredLevel`,
 *     so an over-generous version would pay a Challenger player in gear they cannot equip.
 *
 * Headless. Run with `npm run rewards`.
 */

import { Rng } from "../src/core/rng";
import { MAX_CHALLENGER_TIER, challengerRarityBias } from "../src/data/challenger";
import { biomeFor } from "../src/data/biomes";
import { profileFor } from "../src/data/depth";
import { dailyConfig, dailyEffects, dayNumber, type DailyModifierId } from "../src/data/daily";
import {
  WEEKLY_MODIFIERS, WEEKLY_MODIFIER_IDS, weeklyConfig, weeklyEffects, weekNumber,
  type WeeklyModifierId,
} from "../src/data/weekly";
import { LOOT_ELEMENTS, type Element } from "../src/data/elements";
import { MODES, delveConfig, riftConfig, type RunConfig } from "../src/data/modes";
import { namedDropChance } from "../src/data/named";
import { RARITIES } from "../src/data/rarity";
import { REWARD_CAPS, rewardCurve } from "../src/data/rewards";
import { PLANETS, planetConfig } from "../src/data/planets";
import { requiredLevel, rollItem } from "../src/game/item";
import { Dungeon } from "../src/game/dungeon";
import { GameState } from "../src/game/state";
import type { AvatarInput } from "../src/core/input";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

// --- 1. neutral where it has to be ----------------------------------------

console.log("\n=== ordinary difficulty is exactly unchanged ===");
{
  const plain = rewardCurve(1);
  check("every axis is neutral at danger 1",
    plain.dropChance === 1 && plain.dropCount === 1 && plain.itemPower === 0
      && plain.variantChance === 0,
    JSON.stringify(plain));
  // Below 1 as well: nothing in the game produces it, but a curve that inverted for a
  // hypothetical easier-than-ordinary floor would be a trap for whoever added one.
  const soft = rewardCurve(0.4);
  check("…and never pays *less* than ordinary, whatever it is handed",
    soft.dropChance === 1 && soft.dropCount === 1 && soft.itemPower === 0
      && soft.variantChance === 0,
    JSON.stringify(soft));

  // The floors every existing balance number was measured on: a plain Delve floor with
  // the dial off. If any of these moved, every campaign figure in `smoke` moved with it.
  const moved = [1, 5, 10, 20, 30].filter((d) => {
    const p = profileFor(d, delveConfig(d));
    return p.itemPower !== 0 || p.variantChance !== 0
      || Math.abs(p.quantity - MODES.delve.quantity) > 1e-9;
  });
  check("a plain Delve floor's drops are untouched at every depth", moved.length === 0,
    moved.map((d) => `depth ${d}`).join(", "));

  /**
   * Named-item odds, pinned as **values** rather than as an agreement.
   *
   * This check used to assert that `namedDropChance` returned the same number as
   * `Math.min(1, base * rewardCurve(d).dropChance)`, which was a real guard for exactly as
   * long as `named.ts` held its own copy of that formula. It doesn't any more: the relics
   * merge moved the odds into `drops.ts` as `dropChance`, that now delegates to the curve,
   * and `named.ts` re-exports it as a bare alias — so the old check compared a function to
   * itself and could not fail.
   *
   * The lesson generalises past this one line, which is why it's written down here:
   * **"these two things agree" stops meaning anything the moment they become one thing.**
   * An agreement check is only alive while there are two implementations, and
   * consolidation — the good outcome — is precisely what empties it out silently. When you
   * merge two copies of a rule into one, the test that compared them needs converting into
   * a test of what the survivor computes.
   *
   * So: the actual numbers, on the ladder a player walks. A `PER_DOUBLING.dropChance`
   * retune now has to come here and be deliberate about it.
   */
  const odds: readonly (readonly [number, number])[] = [
    [1, 0.1],      // ordinary difficulty: exactly the base, no lift at all
    [2, 0.135],    // one doubling  → +35%
    [4, 0.17],     // two           → +70%
    [8, 0.205],    // three         → +105%
    [16, 0.24],    // four          → +140%
    [64, 0.25],    // capped at 2.5x, and stays there however deep it goes
    [1e6, 0.25],
  ];
  const drift = odds.filter(([d, want]) => Math.abs(namedDropChance(0.1, d) - want) > 1e-12);
  check("a named item's odds are the pinned numbers at every rung", drift.length === 0,
    drift.map(([d, want]) => `danger ${d}: ${namedDropChance(0.1, d)} != ${want}`).join(", "));
  // A base that would exceed certainty is clamped, not multiplied past 1.
  check("…and odds never exceed certainty", namedDropChance(0.9, 1e6) === 1,
    String(namedDropChance(0.9, 1e6)));
}

// --- 2. capped, and the §9 cap is not routed around -----------------------

console.log("\n=== every axis climbs, then stops ===");
{
  const dangers = [1, 1.5, 2, 3, 4, 6, 8, 16, 64, 1e6];
  console.log("  danger  chance  count  ilvl  variant");
  for (const d of dangers) {
    const c = rewardCurve(d);
    console.log(`  ${String(d).padStart(6)}  ${c.dropChance.toFixed(2).padStart(6)}` +
      `  ${c.dropCount.toFixed(2).padStart(5)}  ${String(c.itemPower).padStart(4)}` +
      `  ${(c.variantChance * 100).toFixed(0).padStart(6)}%`);
  }

  let monotone = true;
  for (let i = 1; i < dangers.length; i++) {
    const a = rewardCurve(dangers[i - 1]!);
    const b = rewardCurve(dangers[i]!);
    if (b.dropChance < a.dropChance || b.dropCount < a.dropCount
      || b.itemPower < a.itemPower || b.variantChance < a.variantChance) monotone = false;
  }
  check("harder never pays worse, on any axis", monotone);

  const absurd = rewardCurve(1e12);
  check("every axis is capped rather than open-ended",
    absurd.dropChance === REWARD_CAPS.dropChance
      && absurd.dropCount === REWARD_CAPS.dropCount
      && absurd.itemPower === REWARD_CAPS.itemPower
      && absurd.variantChance === REWARD_CAPS.variantChance,
    JSON.stringify(absurd));

  // The one axis this work deliberately does NOT own. §9 caps the Challenger rarity push
  // around tier 11 on purpose; §16 must not have grown a second rarity term to get past it.
  check("the Challenger rarity push still caps where §9 put it",
    challengerRarityBias(MAX_CHALLENGER_TIER) === challengerRarityBias(11)
      && challengerRarityBias(MAX_CHALLENGER_TIER) === 0.17,
    `tier 11 and tier 20 both ${challengerRarityBias(20)}`);
  const expected = (tier: number) => 0.06 + MODES.delve.rarityBias + challengerRarityBias(tier);
  const drifted = [0, 5, 11, 20].filter(
    (t) => Math.abs(profileFor(12, delveConfig(12, t)).rarityBias - expected(t)) > 1e-12);
  check("…and a floor's rarity bias is exactly the pre-§16 composition", drifted.length === 0,
    drifted.map((t) => `tier ${t}`).join(", "));
  // Stated as a property of the curve's own shape, so adding a rarity field to it fails here.
  check("the curve has no rarity axis of its own",
    !("rarityBias" in rewardCurve(8)) && !("rarity" in rewardCurve(8)),
    Object.keys(rewardCurve(8)).join(", "));

  // And the rarity ladder's ceiling is untouched: the weights a floor rolls against are a
  // function of depth and bias, never of danger.
  const rarityKeys = Object.keys(rewardCurve(64));
  check("nothing here can lift the rarity ceiling — divine and unspoken are not its business",
    !rarityKeys.some((k) => /rarity|divine|unspoken/i.test(k)), rarityKeys.join(", "));
}

// --- 3. the axes reach a real drop ----------------------------------------

console.log("\n=== §16's two missing axes actually reach the loot ===");
{
  // Stands its ground and swings. Monsters charge, so a level-60 character holding the
  // attack button kills plenty without needing the smoke test's whole navigating bot —
  // and drops are what this section is measuring, not play quality.
  const swing: AvatarInput = {
    moveVector: () => ({ x: 0, y: 0 }),
    wasPressed: (action) => action === "attack",
    aimAngle: () => null,
  };

  /**
   * Plays a floor long enough to bank a pile of drops, and reports what they were.
   *
   * The character is geared as well as opened chests will make it, because per-kill gear
   * drops are deliberately thin (§'s "the economy is deliberately slow") — a bot that dies
   * in the first ten seconds harvests nothing and proves nothing. `dial` is kept modest
   * for the same reason: the point is to observe the axis reaching a real drop, not to
   * find the difficulty at which a standing target stops surviving.
   */
  const harvest = (challenger: number, depth: number, seeds: number[]) => {
    const items: { ilvl: number; elements: Element[] }[] = [];
    for (const seed of seeds) {
      const state = new GameState(seed);
      state.chooseClass("swordsman");
      state.player.level = 60;
      state.player.deepestDepth = depth;
      state.keys.Elite = 12;
      state.openChests("Elite", 12);
      for (const item of [...state.inventory]) {
        const worn = state.player.equipment[item.slot];
        if (!worn || item.value > worn.value) state.equipFromInventory(item.id);
      }
      state.player.refresh();
      state.player.fullHeal();
      state.potions = 9;
      const d = new Dungeon(state, delveConfig(depth, challenger), seed);
      let t = 0;
      while (t < 45 && d.phase === "fighting") {
        d.update(1 / 60, swing as never);
        d.drainEvents();
        t += 1 / 60;
      }
      // Read the *unbanked loot*, not the floor: a character standing among its kills
      // vacuums drops up through its pickup radius almost immediately, so `d.pickups` is
      // empty by the time anyone looks. This is where the items it collected actually are.
      for (const item of d.loot.items) {
        items.push({
          ilvl: item.ilvl,
          elements: LOOT_ELEMENTS.filter((e) => item.mods.some((m) => m.key.startsWith(e))),
        });
      }
    }
    return items;
  };

  const seeds = [4001, 4002, 4003, 4004, 4005, 4006, 4007, 4008, 4009, 4010, 4011, 4012];
  const depth = 12;
  /** Enough danger for the whole capped bonus (+3 ilvl), gentle enough to survive. */
  const dial = 8;
  const plainDrops = harvest(0, depth, seeds);
  const hardDrops = harvest(dial, depth, seeds);
  const profilePlain = profileFor(depth, delveConfig(depth, 0));
  const profileHard = profileFor(depth, delveConfig(depth, dial));
  console.log(`  challenger off: ${plainDrops.length} drops, ilvl ${plainDrops.map((i) => i.ilvl).join("/") || "-"}`);
  console.log(`  challenger ${dial}:   ${hardDrops.length} drops, ` +
    `ilvl ${hardDrops.map((i) => i.ilvl).join("/") || "-"}`);
  console.log(`  profile: quantity ${profilePlain.quantity.toFixed(2)} → ${profileHard.quantity.toFixed(2)}, ` +
    `itemPower +${profilePlain.itemPower} → +${profileHard.itemPower}, ` +
    `variants ${(profilePlain.variantChance * 100).toFixed(0)}% → ${(profileHard.variantChance * 100).toFixed(0)}%`);

  // Both sides have to have actually produced loot, or these pass by measuring nothing.
  check("the harvest collected drops on both sides", plainDrops.length >= 3 && hardDrops.length >= 3,
    `${plainDrops.length} plain, ${hardDrops.length} hard`);
  // Docket §23: item level now tracks the *receiving character's own level*
  // (`Math.max(1, level)`), never the floor — the same rule chests and crafting already
  // followed. This character is level 60 regardless of which side rolled the drop or how
  // deep the floor is (depth 12 here), so both harvests must land on exactly that ilvl.
  check("item level tracks the character, not the floor, on both sides",
    plainDrops.length > 0 && hardDrops.length > 0
      && plainDrops.every((i) => i.ilvl === 60) && hardDrops.every((i) => i.ilvl === 60),
    `plain ${[...new Set(plainDrops.map((i) => i.ilvl))].join("/")}, ` +
    `hard ${[...new Set(hardDrops.map((i) => i.ilvl))].join("/")} (level 60, depth ${depth})`);
  // The headline promise, stated directly: an item that drops for this character is one
  // this character can equip, on the harder floor exactly as much as the ordinary one.
  check("…so requiredLevel never exceeds the earner's own level, on either side",
    [...plainDrops, ...hardDrops].every((i) => requiredLevel(i) <= 60),
    `worst requiredLevel ${Math.max(...[...plainDrops, ...hardDrops].map((i) => requiredLevel(i)))} vs level 60`);
  check("the drop count axis is on the profile every roll site already reads",
    profileHard.quantity > profilePlain.quantity,
    `${profilePlain.quantity.toFixed(2)} → ${profileHard.quantity.toFixed(2)}`);

  // Variants: measured on the roll rather than the odds, since `favorElement` only
  // *weights* the element and a 50% chance of a lean is not a promise about one item.
  const biome = biomeFor(depth);
  check("the floor has an element to infuse with", biome.element !== "physical", biome.element);
  const leaning = (drops: typeof plainDrops) =>
    drops.filter((i) => i.elements.includes(biome.element)).length;
  console.log(`  drops carrying ${biome.element}: ${leaning(plainDrops)}/${plainDrops.length} plain, ` +
    `${leaning(hardDrops)}/${hardDrops.length} hard`);
  check("special variants exist as a real axis on the profile",
    profileHard.variantChance > 0 && profileHard.variantElement === biome.element
      && profilePlain.variantChance === 0,
    `${(profileHard.variantChance * 100).toFixed(0)}% ${profileHard.variantElement}`);
}

console.log("\n=== an infused variant really leans toward its element ===");
{
  /**
   * The variant axis asserted on the mechanism rather than on live drops. Six seeds of
   * play produce a handful of items — nowhere near enough to say anything about a 45%
   * chance — so this rolls two thousand of each through `rollItem` directly, which is the
   * same call the drop site makes. `favorElement` only *weights* the roll, so the claim
   * being checked is "materially more often", not "always".
   */
  const roll = (favor: Element | undefined, n: number) => {
    const rng = new Rng(0xbeef);
    let carrying = 0;
    for (let i = 0; i < n; i++) {
      const item = rollItem({ rarity: "epic", type: "ring", ilvl: 20, rng, favorElement: favor });
      if (item.mods.some((m) => m.key.startsWith("cold"))) carrying++;
    }
    return carrying / n;
  };
  const n = 2000;
  const plain = roll(undefined, n);
  const infused = roll("cold", n);
  console.log(`  cold affixes on an epic ring: ${(plain * 100).toFixed(1)}% plain, ` +
    `${(infused * 100).toFixed(1)}% infused, over ${n} rolls each`);
  check("infusing a drop makes its element materially more likely",
    infused > plain * 1.5 && infused > plain,
    `${(plain * 100).toFixed(1)}% → ${(infused * 100).toFixed(1)}%`);
  check("…but never guarantees it — it is a variant, not a recipe", infused < 1);
  // And it stays a *variant*: same rarity, same affix count, same power band.
  const rngA = new Rng(77);
  const rngB = new Rng(77);
  const a = rollItem({ rarity: "epic", type: "ring", ilvl: 20, rng: rngA });
  const b = rollItem({ rarity: "epic", type: "ring", ilvl: 20, rng: rngB, favorElement: "cold" });
  check("an infused drop is the same rarity and affix count as a plain one",
    a.rarity === b.rarity && a.mods.length === b.mods.length && a.ilvl === b.ilvl,
    `${a.rarity} ${a.mods.length} affixes vs ${b.rarity} ${b.mods.length}`);
}

console.log("\n=== a physical floor has no variant to offer ===");
{
  // The same rule the monster infusion already follows: there is nothing to infuse with on
  // a plain-physical floor, so the axis is off rather than pretending.
  const shallow = profileFor(2, delveConfig(2, MAX_CHALLENGER_TIER));
  check("depth 2 (physical biome) offers no infused variants",
    biomeFor(2).element === "physical" && shallow.variantChance === 0,
    `${biomeFor(2).element} · ${shallow.variantChance}`);
}

// --- 4. item power has to stay wearable -----------------------------------

console.log("\n=== the power bonus never outruns the level that can wear it ===");
{
  /**
   * The hazard `rewardCurve.itemPower` documents: `ilvl` drives `requiredLevel`, so this
   * axis is paid for in wearability. What matters is how much *this* change costs, which
   * is why it is measured against the same drop without the bonus rather than against the
   * floor's recommended level.
   *
   * (Worth knowing separately, and not caused here: `recommendedLevel` no longer floors
   * at `depth + itemPower - 1` — docket §25 removed that term once docket §23 repealed
   * the premise it was defending, an *equip floor* from when loot rolled at
   * `ilvl = depth + itemPower`. A drop now rolls at the receiving hero's own level, so no
   * floor can pay out gear its earner cannot equip regardless of what `recommendedLevel`
   * advises. This test pins that §16's power bonus doesn't widen the gap between a
   * drop's `requiredLevel` and its no-bonus counterpart by more than the capped amount —
   * unrelated to `recommendedLevel`, which is why removing that term here changed
   * nothing this test checks.)
   */
  const cost: number[] = [];
  for (const depth of [1, 5, 10, 15, 20, 25, 30]) {
    for (const tier of [0, 5, 11, MAX_CHALLENGER_TIER]) {
      const p = profileFor(depth, delveConfig(depth, tier));
      const roll = (ilvl: number) => rollItem({
        rarity: "legendary", type: "sword", ilvl, rng: new Rng(depth * 31 + tier),
      });
      cost.push(requiredLevel(roll(depth + p.itemPower)) - requiredLevel(roll(depth)));
    }
  }
  const worst = Math.max(...cost);
  check("the power bonus costs at most its own cap in wearable levels",
    worst <= REWARD_CAPS.itemPower, `worst case +${worst} levels to equip`);
  check("…and costs nothing at all at ordinary difficulty",
    [1, 5, 10, 15, 20, 25, 30].every((d) => profileFor(d, delveConfig(d, 0)).itemPower === 0));

  /**
   * Docket §23 changed *how* `Dungeon` spends this axis: `rollDrop`/`forgeNamedItem` no
   * longer bump `ilvl` itself (that now tracks the receiving character's own level, never
   * the floor) — they bump `powerIlvl`, a second `rollItem` input that scales stats/mods
   * without moving `ilvl` or `requiredLevel` at all. The block above still tests the raw
   * `rollItem({ ilvl })` contract, which is unchanged and still worth pinning; this proves
   * the split those call sites actually rely on, same rng seed both sides so only
   * `powerIlvl` differs.
   */
  const sumStats = (stats: Record<string, number>) =>
    Object.values(stats).reduce((a, b) => a + b, 0);
  const base = rollItem({ rarity: "legendary", type: "sword", ilvl: 20, powerIlvl: 20, rng: new Rng(555) });
  const boosted = rollItem({ rarity: "legendary", type: "sword", ilvl: 20, powerIlvl: 23, rng: new Rng(555) });
  check("item power (`powerIlvl`) raises a drop's magnitude without moving its ilvl or requiredLevel",
    boosted.ilvl === base.ilvl && requiredLevel(boosted) === requiredLevel(base)
      && sumStats(boosted.stats) > sumStats(base.stats),
    `ilvl ${base.ilvl}→${boosted.ilvl}, requiredLevel ${requiredLevel(base)}→${requiredLevel(boosted)}, ` +
    `stat total ${sumStats(base.stats)}→${sumStats(boosted.stats)}`);
}

console.log("\n=== the day's weather doesn't pay; the dial does ===");
{
  /**
   * §17 splits the Vigil's twists into ones that change how the floor fights and ones that
   * change what it pays, with at most one payer a day so the daily's reward stays
   * predictable. §16 would have made Ferocious a second payer — the existing Vigil check
   * caught it, and `profileFor` now divides the day's own modifiers back out before asking
   * the curve. Pinned from this side too, so the reason survives next to the curve.
   */
  const today = dayNumber();
  const base = dailyConfig(today);
  const withMods = (mods: readonly DailyModifierId[]): RunConfig => ({
    ...base,
    danger: dailyEffects(mods).danger,
    daily: { ...base.daily!, modifiers: mods },
  });
  const quiet = profileFor(base.depth, withMods([]));
  const fierce = profileFor(base.depth, withMods(["ferocity"]));
  check("a Ferocious day fights harder without paying more",
    Math.abs(fierce.quantity - quiet.quantity) < 1e-9 && fierce.itemPower === quiet.itemPower
      && fierce.variantChance === quiet.variantChance
      && fierce.enemyHealth > quiet.enemyHealth,
    `quantity ${quiet.quantity.toFixed(2)} → ${fierce.quantity.toFixed(2)}, ` +
    `health ×${(fierce.enemyHealth / quiet.enemyHealth).toFixed(2)}`);
  // The Convergence (UAT §17's weekly) uses the same idiom and gets the same treatment —
  // asserted over its whole modifier roster rather than one example, so a danger modifier
  // added later is covered without anyone remembering to come back.
  const weeklyBase = weeklyConfig(weekNumber(), 1);
  const weeklyWith = (mods: readonly WeeklyModifierId[]): RunConfig => ({
    ...weeklyBase,
    danger: weeklyEffects(mods).danger,
    weekly: { ...weeklyBase.weekly!, modifiers: mods },
  });
  const weeklyQuiet = profileFor(weeklyBase.depth, weeklyWith([]));
  const payers = WEEKLY_MODIFIER_IDS.filter((id) => {
    const e = WEEKLY_MODIFIERS[id].effects;
    if (!e.danger || e.danger <= 1) return false;
    const p = profileFor(weeklyBase.depth, weeklyWith([id]));
    // Its own `quantity` effect is allowed to pay; what must not pay is its `danger`.
    const own = weeklyEffects([id]).quantity;
    return Math.abs(p.quantity - weeklyQuiet.quantity * own) > 1e-9
      || p.itemPower !== weeklyQuiet.itemPower;
  });
  check("no Convergence danger modifier pays through the reward curve either",
    payers.length === 0, payers.join(", "));

  // But the dial is a choice, so it still pays on a Vigil like anywhere else.
  const dialled = profileFor(base.depth, { ...withMods([]), danger: dailyConfig(today, 10).danger });
  check("…while the Challenger dial pays on a Vigil exactly as it does anywhere",
    dialled.quantity > quiet.quantity && dialled.itemPower > quiet.itemPower,
    `quantity ${quiet.quantity.toFixed(2)} → ${dialled.quantity.toFixed(2)}, +${dialled.itemPower} ilvl`);
}

console.log("\n=== every mode climbs the same curve ===");
{
  // One curve, keyed on `danger`, so a rift tier, the Challenger dial and a sector tier
  // all pay through it without any of them knowing about it.
  const rows: [string, number][] = [
    ["delve, dial off", delveConfig(10).danger],
    ["delve, Challenger 10", delveConfig(10, 10).danger],
    ["abyss T1", riftConfig("abyss", 1, MODES.abyss.floors).danger],
    ["abyss T10", riftConfig("abyss", 10, MODES.abyss.floors).danger],
    ["abyss T20", riftConfig("abyss", 20, MODES.abyss.floors).danger],
    ["sector T3", planetConfig(PLANETS[0]!, 3, 1, 0).danger],
    ["abyss T10 + Challenger 10", riftConfig("abyss", 10, MODES.abyss.floors, 10).danger],
  ];
  for (const [label, danger] of rows) {
    const c = rewardCurve(danger);
    console.log(`  ${label.padEnd(28)} danger ×${danger.toFixed(2).padStart(8)}` +
      ` → chance ×${c.dropChance.toFixed(2)} · count ×${c.dropCount.toFixed(2)}` +
      ` · +${c.itemPower} ilvl · ${(c.variantChance * 100).toFixed(0)}% variants`);
  }
  const abyss1 = rewardCurve(riftConfig("abyss", 1, MODES.abyss.floors).danger);
  const abyss20 = rewardCurve(riftConfig("abyss", 20, MODES.abyss.floors).danger);
  check("a deep rift tier pays more than its first tier on every axis",
    abyss20.dropChance > abyss1.dropChance && abyss20.dropCount > abyss1.dropCount
      && abyss20.itemPower > abyss1.itemPower && abyss20.variantChance > abyss1.variantChance);
  check("stacking the dial on top of a tier pays more than the tier alone",
    rewardCurve(riftConfig("abyss", 10, MODES.abyss.floors, 10).danger).dropCount
      > rewardCurve(riftConfig("abyss", 10, MODES.abyss.floors).danger).dropCount);
  // Every rarity still exists at every difficulty — the ladder is not being replaced.
  check("the rarity ladder is untouched", RARITIES.length === 8);
}

console.log(`\n${failures === 0 ? "ALL REWARD CURVE CHECKS PASSED" : `${failures} REWARD CURVE CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
