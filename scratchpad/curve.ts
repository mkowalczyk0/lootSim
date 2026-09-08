/**
 * Level-curve probe (Cluster 3). Prints attackDamage / spellDamage / maxHealth for every
 * class at L3, L18, L50 geared the same way the arena dresses a character, plus the
 * L50/L3 ratio of each. Used to size MINION_POWER_BLEND and re-tune inheritPower so a
 * summoner's minions ride the same curve the summoner's own skills do.
 *
 *   npx tsx scratchpad/curve.ts
 */
import { rollItem, itemScore } from "../src/game/item";
import { GameState } from "../src/game/state";
import { CLASS_IDS, type ClassId } from "../src/data/classes";
import { Rng } from "../src/core/rng";

function geared(level: number, seed: number, keys: number, classId: ClassId): GameState {
  const state = new GameState(seed);
  state.chooseClass(classId);
  state.player.level = level;
  state.player.refresh();
  state.player.autoSlotNewAbilities();
  state.keys.Advanced = keys;
  state.openChests("Advanced", keys);
  const cls = state.heroClass;
  for (const item of [...state.inventory].sort((a, b) => itemScore(b, cls) - itemScore(a, cls))) {
    const worn = state.player.equipment[item.slot];
    if (!worn || itemScore(item, cls) > itemScore(worn, cls)) state.equipFromInventory(item.id);
  }
  if (!state.player.hasAffinity) {
    const family = cls.affinity[0]!;
    state.player.equip(rollItem({ rarity: "rare", type: family, ilvl: level, rng: new Rng(seed ^ 0x51ed) }));
  }
  return state;
}

const SEED = 0xC0FFEE;
const rows: string[] = [];
rows.push(
  ["class", "atk L3", "atk L18", "atk L50", "spl L3", "spl L18", "spl L50", "atk 50/3", "spl 50/3", "spl/atk L18"]
    .map((s) => s.padStart(11)).join(""),
);
for (const id of CLASS_IDS as readonly ClassId[]) {
  const l3 = geared(3, SEED, 3, id).player;
  const l18 = geared(18, SEED, 14, id).player;
  const l50 = geared(50, SEED, 40, id).player;
  const f = (n: number) => n.toFixed(n < 10 ? 1 : 0).padStart(11);
  rows.push(
    id.padStart(11) +
      f(l3.attackDamage) + f(l18.attackDamage) + f(l50.attackDamage) +
      f(l3.spellDamage) + f(l18.spellDamage) + f(l50.spellDamage) +
      f(l50.attackDamage / l3.attackDamage) +
      f(l50.spellDamage / l3.spellDamage) +
      f(l18.spellDamage / l18.attackDamage),
  );
}
console.log(rows.join("\n"));
