/**
 * Forge workbench acceptance test — UAT §24 / §26 / §27.
 *
 * The bench is a set of promises about what it will and won't do to an item, and the
 * economy around it is a set of promises about what it can't buy. The ones a bad tuning
 * pass would break silently:
 *
 *   1. every op keeps its word — Temper keeps the key and stays in range, Recast changes
 *      exactly one affix, Augment stops at the rarity's ceiling, the slot ops obey the
 *      drop's own gates, Ascend keeps affixes and grants and stops at mythic
 *   2. a named item only accepts the ops that re-roll its own ranges
 *   3. costs are paid exactly once, scale aggressively with rarity, and nothing is spent
 *      on a refusal
 *   4. Ash has exactly one source — salvage — and salvage pays by the table
 *   5. multi-item recipes consume exactly what they list, from the stash only, never a
 *      named item as generic fodder, and never what you're wearing
 *   6. the economy: salvaging ten legendaries doesn't fund a rare→mythic ascension chain,
 *      and building a specific item at the bench is never cheaper than finding one —
 *      asserted as a direct comparison, not two one-sided bounds
 *   7. the mythic wall holds everywhere, and Ash survives a save round-trip
 *   8. every essence the Forge *sells* changes the roll — asserted as paid-vs-unpaid, for
 *      all eight, because three of them silently didn't until Sept 2026 — while holy,
 *      arcane and nature stay out of the random pool, which is the other half of the call
 *   9. the Stash's mass-salvage is `salvageItem` run once per id, summed — never a second
 *      economy of its own, asserted as sum-equals-sum against the one-at-a-time route
 *
 * Headless, no browser. Run with `npm run forge`.
 */

import { Rng } from "../src/core/rng";
import { parseSaved, serializeSave } from "../src/core/save";
import {
  ASCEND_COMPONENTS, CRAFT_ESSENCES, CRAFT_MAX_RARITY, FORGE_OPS, SALVAGE_ASH, ascendTarget, craftBulkCost, forgeOpCost,
  itemMeetsRequirement, requirementLabel, type ForgeOp,
} from "../src/data/crafting";
import { GRANT_MIN_TIER, MOD_COUNTS, MOD_POOL, RESERVED_ELEMENTAL_MODS, TRIGGER_MIN_TIER } from "../src/data/items";
import { ELEMENT_LABELS, RESERVED_ELEMENTS, type Element } from "../src/data/elements";
import { NAMED_BY_ID, NAMED_ITEMS, craftRecipeFor, craftableNamed } from "../src/data/named";
import { RARITIES, RARITY_MULTIPLIERS, RARITY_VALUE, rarityIndex, type Rarity } from "../src/data/rarity";
import {
  affixRange, ascend, ascendComponents, augment, forgeOpBlocker, inscribe, recast, salvageYield, temper,
} from "../src/game/forge";
import { MOD_ROLL_BY_ID, forgeNamedItem, itemMods, rollItem, type Item } from "../src/game/item";
import { GameState } from "../src/game/state";
import { GRANTABLE_ABILITY_IDS } from "../src/progression/index";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string) {
  console.log(`\n=== ${name} ===`);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A rich account that can pay for anything, so a refusal is always about the rule. */
function rich(seed: number): GameState {
  const state = new GameState(seed);
  state.chooseClass("swordsman");
  state.player.level = 40;
  state.player.refresh();
  state.ash = 1_000_000;
  state.coins = 1_000_000_000;
  for (const e of Object.keys(state.materials) as (keyof typeof state.materials)[]) state.materials[e] = 1_000_000;
  return state;
}

// =========================================================================
section("1. every op keeps its word");
{
  const rng = new Rng(101);
  // A legendary sword with a full affix list minus one, so Augment has room and Temper has targets.
  let sword: Item | null = null;
  for (let i = 0; i < 200 && !sword; i++) {
    const it = rollItem({ rarity: "legendary", type: "sword", ilvl: 20, rng });
    if (it.mods.length === MOD_COUNTS.legendary[0] && it.mods.some((_, k) => affixRange(it, k))) sword = it;
  }
  check("staged a legendary sword with room for one more affix", !!sword);
  if (sword) {
    const idx = sword.mods.findIndex((_, k) => affixRange(sword!, k));
    const range = affixRange(sword, idx)!;
    let inRange = true;
    let moved = false;
    for (let i = 0; i < 40; i++) {
      const t = temper(sword, idx, rng);
      const v = t.mods[idx]!.value;
      if (v < range[0] - 1e-6 || v > range[1] + 1e-6) inRange = false;
      if (v !== sword.mods[idx]!.value) moved = true;
      if (t.mods[idx]!.key !== sword.mods[idx]!.key) inRange = false;
      if (!same(t.mods.filter((_, k) => k !== idx), sword.mods.filter((_, k) => k !== idx))) inRange = false;
    }
    check("Temper stays inside the affix's own range, keeps its key, touches nothing else", inRange && moved,
      `${range[0].toFixed(3)}–${range[1].toFixed(3)}`);
    check("Temper keeps the name", temper(sword, idx, rng).name === sword.name);

    const r = recast(sword, idx, rng);
    check("Recast changes exactly the chosen affix", r.mods.length === sword.mods.length
      && r.mods[idx]!.key !== sword.mods[idx]!.key
      && same(r.mods.filter((_, k) => k !== idx), sword.mods.filter((_, k) => k !== idx)));
    check("Recast never duplicates a key already on the item", new Set(r.mods.map((m) => m.key)).size === r.mods.length);
    check("Recast keeps base stats, grant and trigger", same(r.stats, sword.stats) && r.grant === sword.grant && same(r.trigger, sword.trigger));

    const a = augment(sword, rng);
    check("Augment adds exactly one affix", a.mods.length === sword.mods.length + 1 && same(a.mods.slice(0, -1), sword.mods));
    let full = a;
    for (let i = 0; i < 10; i++) full = augment(full, rng);
    check("Augment stops at the rarity's ceiling", full.mods.length === MOD_COUNTS.legendary[1], `${full.mods.length}`);
    check("...and the blocker says so", forgeOpBlocker("augment", full) !== null);
    check("an augmented item is worth more", a.value > sword.value);
  }

  // The slot gates are the drop's gates.
  const rareRing = rollItem({ rarity: "rare", type: "ring", ilvl: 10, rng });
  const epicArmor = rollItem({ rarity: "epic", type: "armor", ilvl: 10, rng });
  const epicRing = { ...rollItem({ rarity: "epic", type: "ring", ilvl: 10, rng }), grant: null, trigger: null };
  const legendaryAxe = { ...rollItem({ rarity: "legendary", type: "axe", ilvl: 10, rng }), grant: null, trigger: null };
  check(`Inscribe refuses below tier ${GRANT_MIN_TIER}`, forgeOpBlocker("inscribe", rareRing) !== null);
  check("Inscribe refuses an armor slot", forgeOpBlocker("inscribe", epicArmor) !== null);
  check("Inscribe accepts an epic ring", forgeOpBlocker("inscribe", epicRing) === null);
  const inscribed = inscribe(epicRing, rng);
  check("Inscribe rolls a grant from the grantable pool — never a chosen one",
    inscribed.grant !== null && GRANTABLE_ABILITY_IDS.includes(inscribed.grant));
  let rescribeDiffers = false;
  for (let i = 0; i < 30 && !rescribeDiffers; i++) rescribeDiffers = inscribe(inscribed, rng).grant !== inscribed.grant;
  check("Rescribe rolls a different grant", rescribeDiffers);
  check("Rescribe refuses an item with no grant", forgeOpBlocker("rescribe", epicRing) !== null);
  check(`Awaken refuses below tier ${TRIGGER_MIN_TIER}`, forgeOpBlocker("awaken", epicRing) !== null);
  check("Awaken accepts a legendary", forgeOpBlocker("awaken", legendaryAxe) === null);

  // Ascend.
  const rare = rollItem({ rarity: "rare", type: "sword", ilvl: 15, rng });
  const up = ascend(rare, rng);
  check("Ascend goes up exactly one rarity", up.rarity === "epic");
  check("Ascend keeps every affix key, in order", same(up.mods.map((m) => m.key), rare.mods.map((m) => m.key)));
  check("Ascend keeps grant, trigger, type, ilvl and id",
    up.grant === rare.grant && same(up.trigger, rare.trigger) && up.type === rare.type && up.ilvl === rare.ilvl && up.id === rare.id);
  const grew = rare.mods.every((m, i) => {
    const v = up.mods[i]!.value;
    return v >= m.value - 1e-6; // linear and rarity-scaled affixes grow; flat ones hold
  });
  check("Ascend never shrinks an affix", grew);
  const base = Object.values(up.stats).reduce((a, b) => a + b, 0);
  const baseBefore = Object.values(rare.stats).reduce((a, b) => a + b, 0);
  check("Ascend re-rolls the base block at the new rarity — roughly double", base > baseBefore * 1.5, `${baseBefore} -> ${base}`);
  check("Ascend re-names from the new rarity's table", up.name !== rare.name);
  let top = rare;
  for (let i = 0; i < 10; i++) top = ascend(top, rng);
  check(`Ascend walks up to ${CRAFT_MAX_RARITY} and no further`, top.rarity === CRAFT_MAX_RARITY);
  check("...and the blocker at the wall names the wall", (forgeOpBlocker("ascend", top) ?? "").includes("Mythic"));
  check("ascendTarget is null at mythic and above", ascendTarget("mythic") === null && ascendTarget("divine") === null && ascendTarget("unspoken") === null);
}

// =========================================================================
section("2. a named item's identity isn't for sale");
{
  const rng = new Rng(202);
  const seal = forgeNamedItem(NAMED_BY_ID["the-first-seal"]!, 20, rng);
  const allowed: ForgeOp[] = ["reforge", "temper", "salvage"];
  for (const op of FORGE_OPS) {
    const affix = seal.mods.findIndex((_, i) => affixRange(seal, i));
    const blocker = forgeOpBlocker(op, seal, affix >= 0 ? affix : 0);
    if (allowed.includes(op)) check(`${op} is allowed on a named item`, blocker === null, blocker ?? "");
    else check(`${op} is refused on a named item, for a reason`, blocker !== null && blocker.includes("identity"), blocker ?? "");
  }
  const rangedIdx = seal.mods.findIndex((_, i) => affixRange(seal, i));
  const fixedIdx = seal.mods.findIndex((m) => m.id.startsWith("named:") && !affixRange(seal, seal.mods.indexOf(m)));
  check("a named fixed affix authored with a range can be tempered within it", rangedIdx >= 0);
  if (fixedIdx >= 0) check("a named fixed affix authored as one number cannot", forgeOpBlocker("temper", seal, fixedIdx) !== null);
  check("ascend leaves a named item untouched even if called", same(ascend(seal, rng), seal));
}

// =========================================================================
section("3. costs are paid once, scale aggressively, and a refusal spends nothing");
{
  for (const op of FORGE_OPS) {
    const tiers = RARITIES.slice(0, rarityIndex("mythic") + 1);
    const ash = tiers.map((r) => forgeOpCost(op, r).ash);
    const doubles = ash.every((v, i) => i === 0 || v === 0 || v >= ash[i - 1]! * 2);
    if (ash.some((v) => v > 0)) check(`${op}: Ash at least doubles per rarity tier`, doubles, ash.join(" → "));
  }
  check("reforge and salvage take no Ash", forgeOpCost("reforge", "mythic").ash === 0 && forgeOpCost("salvage", "mythic").ash === 0);
  check("ascend is priced at the rarity being reached",
    forgeOpCost("ascend", "legendary").scrap === craftBulkCost("mythic") * 3);

  const state = rich(303);
  const rng = new Rng(304);
  const it = rollItem({ rarity: "epic", type: "ring", ilvl: 12, rng });
  state.inventory.push(it);
  const idx = it.mods.findIndex((_, i) => affixRange(it, i));
  const before = { ash: state.ash, coins: state.coins, scrap: state.materials.physical };
  const quote = state.forgeQuote(it.id, "temper", idx)!;
  const out = state.applyForgeOp(it.id, "temper", idx);
  check("an op runs and hands back the new item, in place", out !== null && state.inventory.some((x) => x.id === it.id && x !== it));
  check("...and charges exactly the quote", state.ash === before.ash - quote.ash && state.coins === before.coins - quote.coins
    && state.materials.physical === before.scrap - quote.scrap);

  const poor = new GameState(305);
  poor.chooseClass("swordsman");
  const ring = rollItem({ rarity: "epic", type: "ring", ilvl: 12, rng });
  poor.inventory.push(ring);
  poor.coins = 1_000_000;
  const q = poor.forgeQuote(ring.id, "recast", 0)!;
  check("with no Ash the quote says so", q.blocker !== null && q.blocker.includes("Ash"), q.blocker ?? "");
  check("...and the op refuses without spending", poor.applyForgeOp(ring.id, "recast", 0) === null && poor.coins === 1_000_000);
  check("an equipped item can be worked on where it sits", (() => {
    const s2 = rich(306);
    const worn = rollItem({ rarity: "legendary", type: "sword", ilvl: 20, rng });
    s2.player.equip(worn);
    const a = s2.applyForgeOp(worn.id, "awaken");
    return a !== null && s2.player.equipment.weapon?.id === worn.id && s2.player.equipment.weapon.trigger !== null && !s2.inventory.some((x) => x.id === worn.id);
  })());
}

// =========================================================================
section("4. Ash has one source, and salvage pays by the table");
{
  const rng = new Rng(404);
  for (const r of RARITIES) {
    const it = rollItem({ rarity: r, type: "armor", ilvl: 10, rng });
    check(`salvaging a ${r} returns ${SALVAGE_ASH[r]} Ash`, salvageYield(it).ash === SALVAGE_ASH[r]);
  }
  check("a named item salvages for double", salvageYield(forgeNamedItem(NAMED_BY_ID["keepers-ledger"]!, 10, rng)).ash === SALVAGE_ASH.epic * 2);
  const fiery = { ...rollItem({ rarity: "epic", type: "ring", ilvl: 10, rng }), mods: [{ id: "dmg-fire", key: "fireDamage" as const, value: 0.3 }] };
  check("an elemental affix returns a pinch of its material", (salvageYield(fiery).materials.fire ?? 0) > 0);
  check("a plain item returns no materials", Object.keys(salvageYield({ ...fiery, mods: [] }).materials).length === 0);

  const state = new GameState(405);
  state.chooseClass("swordsman");
  const it = rollItem({ rarity: "legendary", type: "sword", ilvl: 10, rng });
  state.inventory.push(it);
  const y = state.salvageItem(it.id)!;
  check("salvage removes the item and credits the Ash", !state.inventory.some((x) => x.id === it.id) && state.ash === y.ash && y.ash === SALVAGE_ASH.legendary);
  check("...and the records count it", state.stats.itemsSalvaged === 1 && state.stats.ashEarned === y.ash);
  check("salvaging an unknown id does nothing", state.salvageItem("nope") === null && state.ash === y.ash);
  const worn = rollItem({ rarity: "rare", type: "gloves", ilvl: 10, rng });
  state.player.equip(worn);
  state.salvageItem(worn.id);
  check("a worn item can be salvaged and the slot empties", state.player.equipment.gloves === null);

  // Nothing else mints Ash: a fresh account, a chest, a craft, a dive's bank all leave it at zero.
  const fresh = new GameState(406);
  fresh.chooseClass("swordsman");
  fresh.keys.Basic = 5;
  fresh.openChests("Basic", 5);
  fresh.materials.physical = 10_000;
  fresh.craftItem("weapon", "rare", null);
  check("chests and crafts never mint Ash", fresh.ash === 0);
}

// =========================================================================
section("5. multi-item recipes consume exactly what they list");
{
  const rng = new Rng(505);
  const unbroken = NAMED_BY_ID["the-seal-unbroken"]!;
  const recipe = craftRecipeFor(unbroken)!;
  check("The Seal Unbroken asks for The First Seal and three legendary shields", (recipe.items ?? []).length === 2
    && recipe.items!.some((r) => r.named === "the-first-seal") && recipe.items!.some((r) => r.slot === "shield" && r.minRarity === "legendary" && r.count === 3));
  check("every recipe item line reads as a sentence", (recipe.items ?? []).every((r) => requirementLabel(r, (id) => NAMED_BY_ID[id]!.name).length > 3));

  const state = rich(506);
  check("without the components the recipe can't be paid", !state.canAffordNamed(unbroken.id) && state.craftNamed(unbroken.id) === null);
  const seal = forgeNamedItem(NAMED_BY_ID["the-first-seal"]!, 20, rng);
  const shields = [0, 1, 2].map(() => rollItem({ rarity: "legendary", type: "shield", ilvl: 20, rng }));
  const decoy = rollItem({ rarity: "mythic", type: "shield", ilvl: 20, rng }); // pricier: never picked while cheaper ones exist
  const wornShield = rollItem({ rarity: "legendary", type: "shield", ilvl: 20, rng });
  const otherNamed = forgeNamedItem(NAMED_BY_ID["the-seal-unbroken"]!, 20, rng); // a named shield: never generic fodder
  state.inventory.push(seal, ...shields, decoy, otherNamed);
  state.player.equip(wornShield);
  check("with the components in the stash it can", state.canAffordNamed(unbroken.id));
  const ashBefore = state.ash;
  const made = state.craftNamed(unbroken.id);
  check("crafting produces the item", made?.named === "the-seal-unbroken");
  check("...consumes The First Seal", !state.inventory.some((x) => x.id === seal.id));
  check("...consumes the three cheapest legendary shields, not the mythic decoy",
    shields.every((sh) => !state.inventory.some((x) => x.id === sh.id)) && state.inventory.some((x) => x.id === decoy.id));
  check("...never eats a named shield as generic fodder", state.inventory.some((x) => x.id === otherNamed.id));
  check("...never eats what you're wearing", state.player.equipment.shield?.id === wornShield.id);
  check("...and takes no Ash — recipes are materials, coins and components", state.ash === ashBefore);
  check("a generic requirement never matches a named item", !itemMeetsRequirement({ count: 1, minRarity: "legendary", slot: "shield" }, otherNamed));
  check("Threshold Brand now also melts two legendary weapons",
    (craftRecipeFor(NAMED_BY_ID["threshold-brand"]!)?.items ?? []).some((r) => r.slot === "weapon" && r.minRarity === "legendary" && r.count === 2));

  // Ascend's components: same rarity, never named, never itself, cheapest first, from the stash only.
  const s2 = rich(507);
  const target = rollItem({ rarity: "epic", type: "sword", ilvl: 15, rng });
  const cheap = { ...rollItem({ rarity: "epic", type: "ring", ilvl: 15, rng }), value: 1 };
  const mid = { ...rollItem({ rarity: "epic", type: "ring", ilvl: 15, rng }), value: 2 };
  const dear = { ...rollItem({ rarity: "epic", type: "ring", ilvl: 15, rng }), value: 3 };
  const namedEpic = forgeNamedItem(NAMED_BY_ID["keepers-ledger"]!, 15, rng);
  const rareRing = rollItem({ rarity: "rare", type: "ring", ilvl: 15, rng });
  s2.inventory.push(target, dear, mid, cheap, namedEpic, rareRing);
  const comps = ascendComponents(target, s2.inventory);
  check(`Ascend melts the ${ASCEND_COMPONENTS} cheapest same-rarity non-named stash items, never itself`,
    comps.length === ASCEND_COMPONENTS && comps[0]!.id === cheap.id && comps[1]!.id === mid.id);
  const ascended = s2.applyForgeOp(target.id, "ascend");
  check("ascending consumes them", ascended?.rarity === "legendary" && !s2.inventory.some((x) => x.id === cheap.id || x.id === mid.id)
    && s2.inventory.some((x) => x.id === dear.id) && s2.inventory.some((x) => x.id === namedEpic.id));
  const lonely = rich(508);
  const solo = rollItem({ rarity: "epic", type: "sword", ilvl: 15, rng });
  lonely.inventory.push(solo);
  check("ascending with no components is refused and spends nothing",
    lonely.applyForgeOp(solo.id, "ascend") === null && lonely.ash === 1_000_000);
}

// =========================================================================
section("6. the economy: the bench is a path to a specific item, never a faster one");
{
  // (a) Ten legendaries' worth of Ash does not fund walking a rare up to mythic.
  const chainAsh = (["rare", "epic", "legendary"] as Rarity[]).reduce((sum, r) => sum + forgeOpCost("ascend", r).ash, 0);
  const tenLegendaries = SALVAGE_ASH.legendary * 10;
  check("salvaging ten legendaries doesn't fund a rare→mythic ascension chain", tenLegendaries < chainAsh,
    `${tenLegendaries} Ash from ten legendaries vs ${chainAsh} for the chain`);

  // (b) Making a specific item at the bench is never cheaper than finding one. Measured in
  // one unit — the vendor's coin value of what goes in versus what comes out — because the
  // sell price is the only exchange rate every input shares. Ascending an item consumes
  // two more of its rarity plus coins, so the inputs are worth more than the output at
  // every step; and a named recipe's components alone outweigh the item they make.
  for (const r of ["common", "uncommon", "rare", "epic", "legendary"] as Rarity[]) {
    const to = ascendTarget(r)!;
    const cost = forgeOpCost("ascend", r);
    // What goes in: the item itself, two same-rarity components, the coins.
    const inputs = RARITY_VALUE[r] * (1 + ASCEND_COMPONENTS) + cost.coins;
    const output = RARITY_VALUE[to];
    check(`ascending ${r} → ${to} puts in more than it gets out`, inputs > output, `${inputs} in vs ${output} out (vendor value)`);
  }
  for (const def of craftableNamed()) {
    const recipe = craftRecipeFor(def)!;
    const rng = new Rng(606);
    const output = forgeNamedItem(def, 30, rng).value;
    // Components at the *minimum* rarity that satisfies each line, priced at vendor value —
    // the cheapest legal way to pay the bill.
    const components = (recipe.items ?? []).reduce((sum, req) => {
      const unit = req.named ? forgeNamedItem(NAMED_BY_ID[req.named]!, 30, rng).value : RARITY_VALUE[req.minRarity ?? "common"];
      return sum + unit * req.count;
    }, 0);
    check(`${def.id}: what the recipe consumes is worth more than what it makes`, components + recipe.coins > output,
      `${components + recipe.coins} in vs ${output} out`);
  }

  // (c) The bench is a sink, not a loop: salvaging one item of a rarity never funds even the
  // cheapest shaping op on a peer of that rarity. You break two things to improve one.
  for (const r of RARITIES.slice(0, rarityIndex(CRAFT_MAX_RARITY) + 1)) {
    check(`salvaging one ${r} can't pay for tempering another`, forgeOpCost("temper", r).ash > SALVAGE_ASH[r],
      `${SALVAGE_ASH[r]} Ash back vs ${forgeOpCost("temper", r).ash} to temper`);
  }
  check("the erase ops are the only thing one salvage can fund", RARITIES.every((r) =>
    forgeOpCost("eraseGrant", r).ash <= SALVAGE_ASH[r] * 2 && forgeOpCost("eraseTrigger", r).ash <= SALVAGE_ASH[r] * 2));

  // (d) Every op keeps the item's total power on the sheet inside what a drop of that
  // rarity could carry: affix count never exceeds MOD_COUNTS, and no op reaches past mythic.
  const rng = new Rng(607);
  const state = rich(608);
  const it = rollItem({ rarity: "legendary", type: "sword", ilvl: 20, rng });
  state.inventory.push(it, ...[0, 1, 2, 3].map(() => rollItem({ rarity: "legendary", type: "ring", ilvl: 20, rng })));
  let cur: Item | null = it;
  for (let i = 0; i < 12 && cur; i++) cur = state.applyForgeOp(cur.id, "augment") ?? cur;
  const ascended = state.applyForgeOp(it.id, "ascend");
  check("augmenting to the ceiling then ascending stays within the new rarity's affix ceiling",
    !!ascended && ascended.mods.length <= MOD_COUNTS[ascended.rarity][1]);
  check("itemMods of a bench-built item still flows through the one Mods record",
    !!ascended && Object.keys(itemMods(ascended)).length > 0);
}

// =========================================================================
section("7. the mythic wall, and Ash survives the save");
{
  check("no craftable named item is above mythic", craftableNamed().every((d) => rarityIndex(d.rarity) <= rarityIndex(CRAFT_MAX_RARITY)));
  check("no named recipe requires an item above what the game can make or find", NAMED_ITEMS.every((d) =>
    d.sources.every((s) => s.kind !== "craft" || (s.items ?? []).every((r) => !r.minRarity || rarityIndex(r.minRarity) <= rarityIndex("unspoken")))));
  check("the rarity multiplier table the bench scales by is untouched", RARITY_MULTIPLIERS.unspoken === 128);

  const state = new GameState(707);
  state.chooseClass("swordsman");
  state.ash = 4242;
  state.stats.itemsSalvaged = 3;
  const back = GameState.fromSaved(parseSaved(serializeSave(state.toJSON())));
  check("Ash survives a save round-trip", back.ash === 4242);
  check("...so do the salvage records", back.stats.itemsSalvaged === 3);
  const old = GameState.fromSaved({ version: 17, data: { coins: 5 } });
  check("a pre-Ash save loads with zero Ash", old.ash === 0);
}

// =========================================================================
section("8. every essence the Forge sells actually changes the roll");
{
  // The bug this pins: `rollMods` weights an essence by filtering the affix pool for
  // `dmg-<e>`/`res-<e>` and tripling what it finds, and `MOD_POOL`'s elemental block was
  // built from `LOOT_ELEMENTS` alone. So for holy, arcane and nature the filter matched
  // nothing, the tripling multiplied nothing, and the Forge charged the material for a
  // roll it left completely untouched — three of the eight essences on the screen.
  //
  // It is asserted as a comparison, per this repo's standing lesson: not "a holy craft
  // sometimes rolls holy" (a threshold that a wide enough pool passes by accident) but
  // "paying for this essence lands it more often than not paying for it does", for every
  // element the screen sells, driven through the real `craftItem` a player presses.
  const CRAFTS = 400;
  const hasElement = (it: Item, e: Element) => it.mods.some((m) => m.id === `dmg-${e}` || m.id === `res-${e}`);

  function craftRate(essence: Element | null, looking: Element): number {
    const state = rich(801);
    let hits = 0;
    for (let i = 0; i < CRAFTS; i++) {
      const it = state.craftItem("accessory", "epic", essence);
      if (it && hasElement(it, looking)) hits++;
    }
    return hits / CRAFTS;
  }

  for (const e of CRAFT_ESSENCES) {
    const paid = craftRate(e, e);
    const unpaid = craftRate(null, e);
    check(`paying for the ${ELEMENT_LABELS[e].toLowerCase()} essence lands ${ELEMENT_LABELS[e].toLowerCase()} more often than not paying does`,
      paid > unpaid + 0.1, `${(paid * 100).toFixed(1)}% with, ${(unpaid * 100).toFixed(1)}% without`);
  }

  // The other half of the same design call, and the reason the fix does not simply add
  // these to `MOD_POOL`: holy, arcane and nature stay out of the *random* pool. If this
  // check ever goes green-by-widening — the pool quietly grew to all nine — the promise
  // in `data/elements.ts` has been reversed by accident.
  for (const e of RESERVED_ELEMENTS) {
    check(`...and an unpaid craft still never rolls ${ELEMENT_LABELS[e].toLowerCase()} — it is out of the random pool`,
      craftRate(null, e) === 0);
  }
  check("no reserved element's affix is in the random pool at all",
    !MOD_POOL.some((m) => RESERVED_ELEMENTS.some((e) => m.id === `dmg-${e}` || m.id === `res-${e}`)));
  // ...and not reachable from the bench either, driven rather than inspected: Recast and
  // Augment roll out of `MOD_POOL`, so a reserved element must never come back from one.
  // A bench op is not an element you chose and paid for.
  {
    const bench = new Rng(802);
    let benchReserved = 0;
    for (let i = 0; i < 300; i++) {
      const base = rollItem({ rarity: "legendary", type: "ring", ilvl: 20, rng: bench });
      const after = augment(recast(base, 0, bench), bench);
      if (after.mods.some((m) => RESERVED_ELEMENTS.some((e) => m.id === `dmg-${e}` || m.id === `res-${e}`))) benchReserved++;
    }
    check("...nor reachable from the bench, which recasts and augments out of that same pool",
      benchReserved === 0, "300 recast+augment rounds");
  }

  // Kept out of the pool must not also mean rolled weaker. The two lists are built by one
  // function in `data/items.ts`, and this is that being true rather than assumed.
  for (const e of RESERVED_ELEMENTS) {
    const reserved = RESERVED_ELEMENTAL_MODS.find((m) => m.id === `dmg-${e}`);
    const loot = MOD_POOL.find((m) => m.id === "dmg-fire");
    check(`the ${ELEMENT_LABELS[e].toLowerCase()} damage roll is worth exactly what a fire one is`,
      !!reserved && !!loot && reserved.base === loot.base && reserved.perTier === loot.perTier
        && reserved.scale === loot.scale && reserved.minTier === loot.minTier);
  }

  // And the bench has to be able to *find* the roll behind a holy affix, or a crafted
  // holy ring would be untemperable and would salvage for less than the cold one beside it.
  const state = rich(803);
  let holyRing: Item | null = null;
  for (let i = 0; i < 200 && !holyRing; i++) {
    const it = state.craftItem("accessory", "epic", "holy");
    if (it && hasElement(it, "holy")) holyRing = it;
  }
  check("a crafted holy item exists to test with", !!holyRing);
  const holyAt = holyRing?.mods.findIndex((m) => m.id === "dmg-holy" || m.id === "res-holy") ?? -1;
  check("...and the bench can look up the roll behind its holy affix",
    holyAt >= 0 && !!MOD_ROLL_BY_ID.get(holyRing!.mods[holyAt]!.id));
  const holyRange = holyRing && holyAt >= 0 ? affixRange(holyRing, holyAt) : null;
  check("...so tempering it has a real range to move inside, like any other affix",
    !!holyRange && holyRange[1] > holyRange[0],
    holyRange ? `${holyRange[0].toFixed(3)} – ${holyRange[1].toFixed(3)}` : "no range");
}

// =========================================================================
section("9. mass-salvage is the same op run N times, not a second economy");
{
  // The Stash's mass-salvage calls this in one shot instead of once per click. It must
  // never be allowed to drift from `salvageItem` — that's the whole reason it's asserted
  // as a sum-equals-sum comparison rather than by its own numbers.
  const rng = new Rng(901);
  const oneAtATime = new GameState(902);
  oneAtATime.chooseClass("swordsman");
  const batched = new GameState(902);
  batched.chooseClass("swordsman");

  const items = RARITIES.slice(0, 5).map((r) => rollItem({ rarity: r, type: "ring", ilvl: 12, rng }));
  const oneCopy = items.map((it) => ({ ...it }));
  const batchCopy = items.map((it) => ({ ...it }));
  oneAtATime.inventory.push(...oneCopy);
  batched.inventory.push(...batchCopy);

  let summedAsh = 0;
  const summedMaterials: Partial<Record<Element, number>> = {};
  for (const it of oneCopy) {
    const y = oneAtATime.salvageItem(it.id)!;
    summedAsh += y.ash;
    for (const [e, n] of Object.entries(y.materials) as [Element, number][]) {
      if (n) summedMaterials[e] = (summedMaterials[e] ?? 0) + n;
    }
  }
  const batch = batched.salvageItems(batchCopy.map((it) => it.id));

  check("mass-salvage pays exactly what salvaging one at a time pays",
    batch.ash === summedAsh, `batch ${batch.ash}, one-by-one ${summedAsh}`);
  check("...material for material too", same(batch.materials, summedMaterials));
  check("...and the Ash landed in the account the same way either route", batched.ash === oneAtATime.ash);
  check("...every item is gone from the stash, both ways",
    batchCopy.every((it) => !batched.inventory.some((x) => x.id === it.id))
    && oneCopy.every((it) => !oneAtATime.inventory.some((x) => x.id === it.id)));

  check("an id that doesn't exist is skipped, not a crash",
    batched.salvageItems(["not-a-real-id"]).ash === 0);
}

console.log(`\n${failures === 0 ? "ALL FORGE CHECKS PASSED" : `${failures} FORGE CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
