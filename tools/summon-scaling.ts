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

import { geared } from "./bot";
import { MINION_DEFAULT_INHERIT } from "../src/data/minions";
import { ELEMENTS } from "../src/data/elements";
import type { ClassId } from "../src/data/classes";
import type { Element } from "../src/data/elements";

/** The summoning classes, from the units table's own spread. */
const SUMMONERS: readonly ClassId[] = ["necromancer", "engineer", "shaman", "trickster", "warden"];
const LEVELS = [10, 25, 40, 55, 70];

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
