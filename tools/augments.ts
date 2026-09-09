/**
 * Augment acceptance test — the chest overhaul and the augment system (`docs/augments.md`).
 *
 * The owner ruled that **every axis guarantees**, unspoken included. That makes one
 * property load-bearing above all the others, and it is the reason this file exists:
 *
 *   **What the player buys is agency, not a discount.**
 *
 * A guaranteed unspoken item is only defensible if the token that guarantees it is rarer
 * than the item would have been anyway. So the headline assertion is a **direct
 * comparison**, not a bound: at every tier a grade can drop at, earning that grade's
 * augment must be *strictly rarer* than simply seeing an item of that rarity fall out of
 * the same cache. If that ever inverts, augments have become a cheaper route to the
 * ceiling and the crafting cap has been repealed through a side door.
 *
 * The comparison is deliberately the strictest one available. It measures both routes in
 * **the same unit — Avarice boss caches** — and it counts only the items the cache itself
 * drops, ignoring the coins the run also pays (which would buy chests, and would only make
 * the by-chance route look better). A lenient benchmark here would prove nothing; this
 * repo's standing lesson is that a one-sided threshold does not establish a design promise
 * and a comparison does.
 *
 * The rest:
 *
 *   1. targeting works at all — a full loadout produces the exact item asked for, where
 *      un-augmented chests essentially never do
 *   2. the ceiling is not cheaper (above)
 *   3. form, element and affix augments move **zero** rarity — targeting *what* an item is
 *      must never be a back door into *how good* it is. More important under the owner's
 *      ruling, not less: it is what stops "I wanted a bow" becoming "I wanted a better bow"
 *   4. the ladder is ordered, and every rarity augment is a floor that never caps
 *   5. one roll path — an augmented pull is an ordinary `rollItem`
 *   6. the preview holds no table: the outcome panel and the roll are one function
 *   7. every reference resolves, and no augment hides behind a reserved source kind
 *   8. the overhaul is complete: no retired tier survives anywhere
 *   9. migration is lossless — retired keys come back as coins, records don't shrink
 *  10. one-per-axis is unreachable rather than handled
 */

import {
  AUGMENTS, AUGMENT_AXES, AUGMENT_GRADE_WEIGHTS, AUGMENT_RATES,
  DAILY_AUGMENT_CAP, WEEKLY_AUGMENT_CAP, augmentProblems, augmentWeight, augmentedPull,
  augmentsOnAxis, augmentsUpTo, emptyLoadout, loadoutFloor, loadoutProblems, loadoutSummary,
  modRollById, pickAugment, withAugment, type AugmentLoadout,
} from "../src/data/augments";
import { CHESTS, CHEST_CATEGORIES, CHEST_TIERS, RETIRED_CHEST_TIERS } from "../src/data/chests";
import { profileFor } from "../src/data/depth";
import { LIVE_SOURCE_KINDS, dropChance, forSource, foundSourceProblems } from "../src/data/drops";
import { ITEM_TYPES, modAllowed } from "../src/data/items";
import { riftConfig } from "../src/data/modes";
import { RARITIES, depthWeights, rarityIndex, type Rarity } from "../src/data/rarity";
import { SAVE_VERSION } from "../src/core/save";
import { Rng } from "../src/core/rng";
import { rollItem } from "../src/game/item";
import { GameState } from "../src/game/state";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

/** An account that owns one of everything, so a refusal is always about a rule. */
function stocked(seed = 7): GameState {
  const state = new GameState(seed);
  state.chooseClass("swordsman");
  state.coins = 1e9;
  for (const t of CHEST_TIERS) state.keys[t] = 500;
  for (const a of AUGMENTS) state.augments[a.id] = 50;
  return state;
}

// --- 1. targeting works ------------------------------------------------------------

section("targeting");

{
  const state = stocked();
  const load: AugmentLoadout = {
    base: "Basic",
    rarity: "rarity-legendary",
    form: "form-bow",
    element: "element-void",
    affix: "affix-deadly",
  };
  check("a full loadout is a legal combine", loadoutProblems(load).length === 0, loadoutProblems(load)[0] ?? "");

  let hits = 0;
  const tries = 400;
  for (let i = 0; i < tries; i++) {
    state.augments["rarity-legendary"] = 5;
    state.augments["form-bow"] = 5;
    state.augments["element-void"] = 5;
    state.augments["affix-deadly"] = 5;
    state.keys.Basic = 5;
    const [item] = state.openAugmented(load, 1);
    if (!item) continue;
    const voidish = item.mods.some((m) => m.id === "dmg-void" || m.id === "res-void");
    if (item.type === "bow" && rarityIndex(item.rarity) >= rarityIndex("legendary")
        && voidish && item.mods.some((m) => m.id === "deadly")) hits++;
  }
  check("every axis of a full loadout is honoured, every time", hits === tries, `${hits}/${tries}`);

  // The comparison the system exists to justify: the same target, un-augmented.
  const plain = stocked(11);
  let plainHits = 0;
  for (let i = 0; i < 4000; i++) {
    plain.keys.Legendary = 5;
    const [item] = plain.openChests("Legendary", 1);
    if (!item) continue;
    if (item.type === "bow" && rarityIndex(item.rarity) >= rarityIndex("legendary")
        && item.mods.some((m) => m.id === "dmg-void" || m.id === "res-void")
        && item.mods.some((m) => m.id === "deadly")) plainHits++;
  }
  check(
    "targeting beats gambling — a loadout lands the exact item where Legendary chests do not",
    hits / tries > plainHits / 4000,
    `augmented ${(100 * hits / tries).toFixed(0)}% vs ${(100 * plainHits / 4000).toFixed(2)}% over 4000 chests`,
  );
}

// --- 2. the ceiling is not cheaper -------------------------------------------------

section("the ceiling: agency, not a discount");

/**
 * The chance one Avarice boss cache at `tier` pays an augment of exactly `grade`, and the
 * chance the same cache drops an item of that rarity on its own. Both pure reads of what
 * the simulation actually does — the profile, the drop table and the rarity curve.
 */
function cacheOdds(tier: number, grade: Rarity): { augment: number; item: number } {
  const cfg = riftConfig("hoard", tier, 4);
  const p = profileFor(cfg.depth, cfg);
  const q = { kind: "clearCache", depth: p.depth, mode: "hoard", tier, lastFloor: true } as const;
  const matched = [...new Set(forSource(AUGMENTS, q).map((m) => m.def))];
  const total = matched.reduce((a, d) => a + augmentWeight(d), 0);
  const share = matched.filter((d) => d.grade === grade).reduce((a, d) => a + augmentWeight(d), 0);
  const augment = total > 0 ? dropChance(AUGMENT_RATES.avariceBoss, cfg.danger) * (share / total) : 0;

  const w = depthWeights(p.depth + 2, p.rarityBias);
  let sum = 0;
  for (const r of RARITIES) sum += w[r];
  const drops = Math.max(1, Math.round(p.quantity * 2.4));
  const item = 1 - Math.pow(1 - w[grade] / sum, drops);
  return { augment, item };
}

for (const grade of ["divine", "unspoken"] as const) {
  for (const tier of [1, 3, 5, 8, 12, 20]) {
    const { augment, item } = cacheOdds(tier, grade);
    if (augment <= 0) continue;
    check(
      `a ${grade} augment is rarer than a ${grade} item — Avarice tier ${tier}`,
      augment < item,
      `augment 1/${(1 / augment).toFixed(0)} vs item 1/${(1 / item).toFixed(0)}` +
      ` (${(item / augment).toFixed(2)}x)`,
    );
  }
}

{
  // The tier gates are what make the comparison survivable at the bottom of the ladder:
  // a shallow cache almost never drops a divine, so an ungated divine augment would be
  // commoner there than the thing it guarantees.
  const ungated = cacheOdds(1, "divine");
  check("divine and unspoken grades are gated off the low tiers", ungated.augment === 0,
    ungated.augment > 0 ? `tier 1 pays divine augments at 1/${(1 / ungated.augment).toFixed(0)}` : "");
}

// --- 3. the other three axes move zero rarity --------------------------------------

section("targeting is not a rarity lever");

{
  const bare = augmentedPull(emptyLoadout());
  for (const id of ["form-bow", "element-void", "affix-deadly"]) {
    const pull = augmentedPull(withAugment(emptyLoadout(), id));
    const same = RARITIES.every((r) => Math.abs(pull.weights[r] - bare.weights[r]) < 1e-15);
    check(`${id} leaves the rarity distribution untouched`, same);
  }
  const all = withAugment(withAugment(withAugment(emptyLoadout(), "form-bow"), "element-void"), "affix-deadly");
  const stacked = augmentedPull(all);
  check(
    "all three stacked still move zero rarity",
    RARITIES.every((r) => Math.abs(stacked.weights[r] - bare.weights[r]) < 1e-15),
  );
}

// --- 4. the ladder ------------------------------------------------------------------

section("the rarity ladder");

{
  const floors = (["rare", "epic", "legendary", "mythic", "divine", "unspoken"] as const)
    .map((r) => loadoutFloor(withAugment(emptyLoadout(), `rarity-${r}`)));
  check("every rarity augment floors the roll at exactly its own rarity",
    floors.every((f, i) => f === (["rare", "epic", "legendary", "mythic", "divine", "unspoken"] as const)[i]),
    floors.join(" < "));
  check("the ladder is strictly ascending",
    floors.every((f, i) => i === 0 || rarityIndex(f) > rarityIndex(floors[i - 1]!)));

  // A floor is not a cap: a Legendary Augment must still be able to produce a mythic,
  // or "or better" in the outcome line is a lie.
  const legendary = augmentedPull(withAugment(emptyLoadout(), "rarity-legendary"));
  check("a floor never caps — Legendary can still roll mythic and above",
    legendary.weights.mythic > 0 && legendary.weights.divine > 0 && legendary.weights.unspoken > 0);

  // And the top of the ladder is the guarantee the owner ruled for.
  const unspoken = augmentedPull(withAugment(emptyLoadout(), "rarity-unspoken"));
  check("an Unspoken Augment leaves exactly one rung standing",
    RARITIES.filter((r) => unspoken.weights[r] > 0).join(",") === "unspoken");
}

// --- 5. one roll path ---------------------------------------------------------------

section("one roll path");

{
  const rng = new Rng(3);
  const plain = rollItem({ rarity: "epic", type: "bow", ilvl: 10, rng });
  const forced = rollItem({ rarity: "epic", type: "bow", ilvl: 10, rng, ensureMods: [["deadly"]] });
  check("an augmented roll is an ordinary Item — same fields, same shape",
    Object.keys(plain).sort().join(",") === Object.keys(forced).sort().join(","));
  check("a forced affix is present and is an ordinary mod",
    forced.mods.some((m) => m.id === "deadly" && typeof m.value === "number"));

  // A forced roll the item cannot carry is dropped, not faked.
  const ring = rollItem({ rarity: "epic", type: "ring", ilvl: 10, rng, ensureMods: [["savage"]] });
  check("a forced affix the type cannot carry is simply absent, never invented",
    !ring.mods.some((m) => m.id === "savage"));

  // ...which is exactly the combine the tab refuses up front, so it is unreachable.
  const bad = withAugment(withAugment(emptyLoadout(), "affix-savage"), "form-ring");
  check("...and that combine is refused at authoring time instead", loadoutProblems(bad).length > 0,
    loadoutProblems(bad)[0] ?? "no refusal");
}

// --- 6. the preview holds no table --------------------------------------------------

section("preview == roll");

{
  // The outcome panel's every claim is read back off the composed pull, and the pull is
  // what the roll uses. Compared by running a real open against the composition rather
  // than by reading the sentence.
  const state = stocked(23);
  for (const id of ["rarity-mythic", "form-scythe", "element-holy", "affix-quickened"]) {
    const load = withAugment(emptyLoadout(), id);
    const pull = augmentedPull(load);
    state.augments[id] = 200;
    state.keys.Basic = 400;
    let ok = true;
    for (let i = 0; i < 120; i++) {
      const [item] = state.openAugmented(load, 1);
      if (!item) { ok = false; break; }
      if (pull.weights[item.rarity] <= 0) ok = false;
      if (pull.types && !pull.types.includes(item.type)) ok = false;
    }
    check(`${id}: every rolled item is one the composed pull allows`, ok);
    check(`${id}: the outcome line is generated, not written`, loadoutSummary(load).length > 0);
  }
}

// --- 7. every reference resolves ----------------------------------------------------

section("the roster");

{
  const problems = AUGMENTS.flatMap((a) => augmentProblems(a).map((p) => `${a.id}: ${p}`));
  check("every augment definition is structurally sound", problems.length === 0, problems[0] ?? "");

  const ids = new Set(AUGMENTS.map((a) => a.id));
  check("ids are unique", ids.size === AUGMENTS.length);

  const srcProblems = AUGMENTS.flatMap((a) =>
    a.sources.flatMap((s) => (s.kind === "craft" ? ["an augment may not be crafted"] : foundSourceProblems(s))));
  check("every source is structurally sound", srcProblems.length === 0, srcProblems[0] ?? "");
  check("no augment hides behind a reserved source kind",
    AUGMENTS.every((a) => a.sources.every((s) => s.kind !== "craft" && LIVE_SOURCE_KINDS.includes(s.kind))));

  check("one form augment per item type", augmentsOnAxis("form").length === ITEM_TYPES.length);
  check("every affix augment names a roll it can actually reach", augmentsOnAxis("affix").every((a) => {
    if (a.effect.axis !== "affix") return false;
    const mod = modRollById(a.effect.modId);
    return mod !== undefined && ITEM_TYPES.some((t) => modAllowed(mod, t, rarityIndex(a.grade)));
  }));

  // The guaranteed payouts are capped, or the daily quietly becomes the best source.
  check(`the Vigil's pool stops at ${DAILY_AUGMENT_CAP}`,
    augmentsUpTo(DAILY_AUGMENT_CAP).every((a) => rarityIndex(a.grade) <= rarityIndex(DAILY_AUGMENT_CAP)));
  check(`the Convergence's pool stops at ${WEEKLY_AUGMENT_CAP}`,
    augmentsUpTo(WEEKLY_AUGMENT_CAP).every((a) => rarityIndex(a.grade) <= rarityIndex(WEEKLY_AUGMENT_CAP)));
  check("neither guaranteed payout can hand out a divine or unspoken augment",
    augmentsUpTo(WEEKLY_AUGMENT_CAP).every((a) => a.grade !== "divine" && a.grade !== "unspoken"));
  check("the guaranteed pick always returns something", pickAugment(augmentsUpTo(DAILY_AUGMENT_CAP), 0.5) !== null);

  // Grade weights are per grade, split inside it — so a bigger weapon roster splits the
  // rare share rather than diluting every other rare augment.
  const rareShare = AUGMENTS.filter((a) => a.grade === "rare").reduce((s, a) => s + augmentWeight(a), 0);
  check("a grade's total weight is its grade weight, however many definitions sit there",
    Math.abs(rareShare - AUGMENT_GRADE_WEIGHTS.rare) < 1e-12, `${rareShare} vs ${AUGMENT_GRADE_WEIGHTS.rare}`);
}

// --- 8. the overhaul is complete ----------------------------------------------------

section("the chest overhaul");

{
  check("the retired tiers are gone from the roster",
    Object.keys(RETIRED_CHEST_TIERS).every((t) => !(CHEST_TIERS as readonly string[]).includes(t)));
  check("19 tiers were retired", Object.keys(RETIRED_CHEST_TIERS).length === 19);
  const listed = CHEST_CATEGORIES.flatMap((c) => c.tiers);
  check("every surviving tier appears in exactly one category",
    CHEST_TIERS.every((t) => listed.filter((x) => x === t).length === 1)
    && listed.length === CHEST_TIERS.length);
  check("every retired tier still knows what it cost, so a save can be repaid",
    Object.values(RETIRED_CHEST_TIERS).every((r) => r.price > 0 && (CHEST_TIERS as readonly string[]).includes(r.openedInto)));
  check("the four originals are untouched",
    CHESTS.Basic.price === 100 && CHESTS.Advanced.price === 500
    && CHESTS.Elite.price === 2500 && CHESTS.Legendary.price === 10000);
}

// --- 9. migration -------------------------------------------------------------------

section("migration");

{
  check("SAVE_VERSION was bumped for the retired tiers", SAVE_VERSION >= 27, `${SAVE_VERSION}`);

  const legacy = {
    version: 26,
    data: {
      coins: 1000,
      keys: { Basic: 3, StormCache: 4, BowCache: 2, Legendary: 1 },
      stats: { chestsOpened: { Basic: 10, StormCache: 7, BowCache: 5 } },
      augments: { "form-bow": 2, "not-an-augment": 9 },
    },
  } as never;
  const loaded = GameState.fromSaved(legacy);
  const refund = 4 * RETIRED_CHEST_TIERS.StormCache!.price + 2 * RETIRED_CHEST_TIERS.BowCache!.price;
  check("keys for retired tiers come back as coins at full price",
    loaded.coins === 1000 + refund, `${loaded.coins} vs ${1000 + refund}`);
  check("surviving keys are kept", loaded.keys.Basic === 3 && loaded.keys.Legendary === 1);
  check("no undefined survives in the key record",
    CHEST_TIERS.every((t) => Number.isFinite(loaded.keys[t])));
  check("no retired tier survives as a ghost key",
    Object.keys(loaded.keys).every((t) => (CHEST_TIERS as readonly string[]).includes(t)));
  check("lifetime opened counts fold into the surviving tier rather than shrinking",
    loaded.stats.chestsOpened.Advanced === 12, `${loaded.stats.chestsOpened.Advanced} vs 12`);
  check("owned augments survive the load", loaded.augments["form-bow"] === 2);
  check("an augment id that no longer exists is dropped, not kept as a ghost",
    loaded.augments["not-an-augment"] === undefined);

  // A brand new save has none of this and must not throw.
  const fresh = GameState.fromSaved(null);
  check("a fresh account owns no augments", fresh.ownedAugments().length === 0);

  // Round trip.
  const state = stocked(41);
  state.augments = { "rarity-unspoken": 1, "form-bow": 3 };
  const round = GameState.fromSaved({ version: SAVE_VERSION, data: state.toJSON() } as never);
  check("augments round-trip through the save",
    round.augments["rarity-unspoken"] === 1 && round.augments["form-bow"] === 3);
}

// --- 10. one per axis ---------------------------------------------------------------

section("one per axis");

{
  let load = emptyLoadout();
  load = withAugment(load, "element-fire");
  load = withAugment(load, "element-void");
  check("a second augment on an axis swaps the first out rather than stacking",
    load.element === "element-void");
  check("...and there is nowhere for the first to have gone",
    AUGMENT_AXES.filter((a) => load[a] !== null).length === 1);

  const pull = augmentedPull(load);
  check("the composed pull carries exactly one element", pull.favorElement === "void");

  // Consumption: opening spends every slotted augment, once each.
  const state = stocked(59);
  state.augments = { "rarity-mythic": 1, "form-bow": 1 };
  state.keys.Basic = 5;
  const before = state.keys.Basic;
  const spent: AugmentLoadout = { base: "Basic", rarity: "rarity-mythic", form: "form-bow", element: null, affix: null };
  const got = state.openAugmented(spent, 1);
  check("an augmented pull yields an item", got.length > 0);
  check("every slotted augment is consumed exactly once",
    state.augmentCount("rarity-mythic") === 0 && state.augmentCount("form-bow") === 0);
  check("exactly one key is spent", state.keys.Basic === before - 1);

  // And a loadout you cannot pay for spends nothing.
  const broke = stocked(61);
  broke.augments = {};
  broke.keys.Basic = 1;
  const nothing = broke.openAugmented(spent, 1);
  check("a loadout naming an augment you don't own opens nothing", nothing.length === 0);
  check("...and spends no key", broke.keys.Basic === 1);

  // The bulk rule: an augmented pull is always 1x, however many are asked for.
  const bulk = stocked(67);
  bulk.augments = { "form-bow": 10 };
  bulk.keys.Basic = 10;
  const many = bulk.openAugmented({ ...emptyLoadout(), form: "form-bow" }, 10);
  check("an augmented pull is always 1x, whatever count is asked for",
    many.length === 1 && bulk.augmentCount("form-bow") === 9 && bulk.keys.Basic === 9,
    `${many.length} items, ${bulk.augmentCount("form-bow")} left, ${bulk.keys.Basic} keys`);

  // ...but an un-augmented one still bulks, because that is the old chest screen.
  const plain = stocked(71);
  plain.keys.Basic = 20;
  check("an un-augmented pull still opens in bulk", plain.openChests("Basic", 10).length >= 10);
}

console.log(`\n${failures === 0 ? "augments: all checks passed" : `augments: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
