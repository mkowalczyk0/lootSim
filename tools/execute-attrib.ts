/**
 * Per-term damage attribution for the execute family (docket §38) — a measurement
 * harness, not an acceptance check.
 *
 * ## Why this tool exists at all
 *
 * The owner has reported "The Last Hunt" three times. Two fixes shipped, both correctly
 * reasoned and both honestly measured, and both aimed at the **execute rider**: §8 halved
 * its coefficient (0.4 → 0.2) and §20 gave it a threshold and a ramp so it contributes
 * nothing at or above half health. The rider is now half its original size *and* cannot
 * fire on a healthy target, and the complaint came back anyway.
 *
 * That is evidence the rider is **no longer the dominant term**, and the docket says so in
 * as many words: *"Do not start by changing a number. Start by measuring which of the
 * three dominates in a real fight."* The three candidates it ranks are
 *
 *   1. **cadence** — how often the ultimate can be cast at all. Neither previous fix
 *      touched it. The Ranger's meter gains on `hitDealt` with a `projectile` tag and on
 *      `ailmentInflicted`, and the ultimate both crits and applies ailments, so it partly
 *      pays for its own next cast.
 *   2. **the direct packet** — `base: 3.4, scale: "attack"` to `enemies` at radius 350,
 *      which is a room clear on its own with the rider contributing nothing.
 *   3. **the rider's remaining contribution** — `0.2 x maxHealth` at 0 HP, inside the
 *      bottom half of the bar only.
 *
 * `tools/execute.ts` pins the rider's *properties*; `tools/execute-ab.ts` measures the
 * §20 threshold's effect on a fight. Neither of them can say which term is carrying the
 * damage. That is the missing instrument and it is this one.
 *
 * ## The two measurements, and why both are here
 *
 * **Accounting** (the probe). `Dungeon.prototype.dealDamage` is wrapped so every hit on
 * an enemy is recorded with its ability id, its channel, its pre-crit amount and the
 * victim's health fraction *before* the hit. That yields the share of a boss's whole
 * health bar delivered by each ability, and — for a single-packet ultimate — an exact
 * split of that ability into its direct half and its rider half. Accounting says where
 * the damage comes from.
 *
 * **Ablation** (the configs). Each term is removed on its own, on the same seeds, and the
 * fight is replayed. Whichever removal moves time-to-kill and win rate most is the term
 * the *outcome* depends on. Accounting can be misleading on its own — a term can carry a
 * large share of a bar that would have died anyway — so the ablation is the one that
 * answers "which term is the complaint about".
 *
 * The two are reported together deliberately. If they disagree, that disagreement is the
 * finding, and it is the sort of thing CLAUDE.md's "a correct instrument can answer a
 * question nobody asked" paragraph is about.
 *
 * ## The split, and why it needs no knowledge of the coefficient
 *
 * `packet.amount` at `dealDamage` is exactly `base * attack + executeBonus(...)` for these
 * abilities — crit and the keystone rule pass both multiply *after* this point, and none
 * of the three ultimates carries `casterMissingHealth`. THE EXECUTE RULE returns **zero**
 * at or above `EXECUTE_THRESHOLD`, so a hit landed on a healthy target is a direct reading
 * of `base * attack` with no rider in it at all.
 *
 * So the rider's size is recovered **empirically**: take the ability's mean amount over
 * hits above the threshold (pure base), and subtract it from each hit below. That is
 * robust to every route the rider arrives by — the fourteen authored packets, the
 * seventeen tree nodes and mutations, the relic — without this tool having to know which
 * of them applied. It is stated as a residual rather than an assumption, and the report
 * prints the sample count behind each so a thin one is visible rather than silent.
 *
 * Where an ability fires several damage packets in one cast (the Assassin's ultimate is
 * three blows and only the last carries a rider), the above-threshold sample is a mixture
 * of different bases and the residual is not meaningful. The report says so per ability
 * rather than printing a number it cannot stand behind, and the ablation covers that case.
 *
 *   npm run execute-attrib -- --seeds=24 --level=30 --classes=ranger
 *
 * Args: `--seeds=N --level=N --tier=N --raid=<id> --depth=N --classes=a,b --dodge=N --floor=boss|trash|both`
 */

import { EXECUTE_THRESHOLD } from "../src/combat/damage";
import type { ClassId } from "../src/data/classes";
import { delveConfig } from "../src/data/modes";
import { RAIDS, raidConfig } from "../src/data/raids";
import { ALL_CLASSES } from "../src/progression";
import { Dungeon } from "../src/game/dungeon";
import type { RunConfig } from "../src/data/modes";
import { geared, playFloor } from "./bot";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const SEEDS = Number(arg("seeds", "8"));
const LEVEL = Number(arg("level", "40"));
const TIER = Number(arg("tier", "1"));
const RAID_ID = arg("raid", "the-ferryman");
const DEPTH = Number(arg("depth", "18"));
const DODGE = Number(arg("dodge", "0.7"));
const FLOOR = arg("floor", "both");

/**
 * `Dungeon.ENEMY_ID_BASE` is private (src/game/dungeon.ts:4612), so the probe carries its
 * own copy to map a host id back to the enemy it belongs to. If that constant ever moves,
 * this tool reports zero enemy hits rather than wrong ones — which is why `hits` is
 * printed and a run with no hits is called out instead of averaged.
 */
const ENEMY_ID_BASE = 1_000_000;

const SUBJECTS: readonly { id: ClassId; ult: string; note: string }[] = [
  { id: "ranger", ult: "ranger.the_last_hunt", note: "The Last Hunt — the reported ability" },
  { id: "reaper", ult: "reaper.death_comes_due", note: "Death Comes Due — the largest coefficient" },
  { id: "assassin", ult: "assassin.contract_fulfilled", note: "Contract Fulfilled — three blows, one rider" },
];

// --- the probe ---------------------------------------------------------------

interface Hit {
  ability: string;
  channel: string;
  amount: number;
  /** The victim's health fraction BEFORE this hit — which side of the threshold it landed on. */
  frac: number;
  /** The victim's max health, so a rider residual can be turned back into a coefficient. */
  maxHealth: number;
  boss: boolean;
}

let RECORDING = false;
let HITS: Hit[] = [];

const originalDealDamage = Dungeon.prototype.dealDamage;
// The probe is a wrapper rather than an edit to `dealDamage` itself: `src/game/` must not
// know it is being watched, and an acceptance tool that mutates the simulation's own
// source to measure it is the "instrument that changed the thing under test" failure.
Dungeon.prototype.dealDamage = function (this: Dungeon, targetId: number, packet): number {
  if (RECORDING) {
    const enemy = this.enemies.find((e) => e.id === targetId - ENEMY_ID_BASE);
    if (enemy) {
      HITS.push({
        ability: packet.source.abilityId ?? "(basic attack)",
        channel: packet.channel,
        amount: packet.amount,
        frac: enemy.health / Math.max(1, enemy.maxHealth),
        maxHealth: Math.max(1, enemy.maxHealth),
        boss: this.boss !== null && enemy.id === this.boss.id,
      });
    }
  }
  return originalDealDamage.call(this, targetId, packet);
};

// --- the ablations -----------------------------------------------------------

/**
 * Each config removes exactly one candidate term and leaves the other two alone. They are
 * applied by walking the live class definitions and mutating them in place, then restored
 * from a deep snapshot — the progression data is plain objects behind `readonly` types, so
 * this is a data patch rather than a code path the game could ever take.
 */
type Config =
  | "shipped" | "no-rider" | "no-authored-rider" | "no-tree-rider"
  | "no-ult-direct" | "no-ult" | "half-cadence";

/**
 * The rider is split into its two halves because the pilot run showed they are not the
 * same size and only one of them is what the last two fixes moved. `executeMissingHealth`
 * is the number authored on the ability — the one §8 halved and §20 left alone.
 * `addExecuteMissingHealth` is the number a tree node, hybrid unlock or relic *adds* to
 * whatever packets its target matches, and a `withTag` target matches by tag rather than
 * by ability id. An ultimate that happens to carry a common tag collects every adder aimed
 * at that tag, whether or not the adder's prose ever mentions the ultimate.
 */
const CONFIGS: readonly { id: Config; label: string; note: string }[] = [
  { id: "shipped", label: "shipped", note: "master — the baseline every row is read against" },
  { id: "no-rider", label: "rider removed (all)", note: "candidate 3: every execute rider zeroed, by every route" },
  { id: "no-authored-rider", label: "  - authored only", note: "the number on the ability, which is what §8 and §20 moved" },
  { id: "no-tree-rider", label: "  - tree-added only", note: "the number tree nodes and hybrids ADD, which neither fix touched" },
  { id: "no-ult-direct", label: "ult direct removed", note: "candidate 2: the ultimate's own base damage zeroed" },
  { id: "no-ult", label: "ultimate removed", note: "the ceiling: what the class does with no ultimate at all" },
  { id: "half-cadence", label: "cadence halved", note: "candidate 1: ultimate meter gain halved" },
];

/** Every object in the class data, so a patch can find a key wherever it was authored. */
function walk(node: unknown, visit: (o: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  visit(obj);
  for (const key of Object.keys(obj)) walk(obj[key], visit);
}

function snapshot(): string {
  return JSON.stringify(ALL_CLASSES);
}

function restore(saved: string): void {
  const fresh = JSON.parse(saved) as unknown[];
  // Restore field-by-field rather than replacing the exported array's entries, because
  // every other module holds direct references to the same ability objects.
  const apply = (live: unknown, orig: unknown): void => {
    if (Array.isArray(live) && Array.isArray(orig)) {
      for (let i = 0; i < live.length; i++) apply(live[i], orig[i]);
      return;
    }
    if (live === null || typeof live !== "object" || orig === null || typeof orig !== "object") return;
    const l = live as Record<string, unknown>;
    const o = orig as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      const ov = o[key];
      if (ov !== null && typeof ov === "object") apply(l[key], ov);
      else if (l[key] !== ov) l[key] = ov;
    }
  };
  apply(ALL_CLASSES, fresh);
}

function applyConfig(config: Config, subject: { id: ClassId; ult: string }): void {
  if (config === "shipped") return;

  if (config === "no-authored-rider") {
    walk(ALL_CLASSES, (o) => {
      if (typeof o.executeMissingHealth === "number") o.executeMissingHealth = 0;
    });
    return;
  }

  if (config === "no-tree-rider") {
    walk(ALL_CLASSES, (o) => {
      if (typeof o.addExecuteMissingHealth === "number") o.addExecuteMissingHealth = 0;
    });
    return;
  }

  if (config === "no-rider") {
    // Every route the rider arrives by: the authored packets AND the tree nodes,
    // mutations and relic ops that add it to packets carrying none. Zeroing only the
    // ultimate's own field would leave `winter_execution`'s +0.5 on every Ranger
    // projectile in play and the ablation would be measuring a term still half present.
    walk(ALL_CLASSES, (o) => {
      if (typeof o.executeMissingHealth === "number") o.executeMissingHealth = 0;
      if (typeof o.addExecuteMissingHealth === "number") o.addExecuteMissingHealth = 0;
    });
    return;
  }

  if (config === "half-cadence") {
    // The meter that gates the ultimate, for this class only. Halving generation is the
    // cleanest expression of "cast it half as often" that does not also change what a
    // cast does — which is exactly the term being isolated.
    const cls = ALL_CLASSES.find((c) => c.classId === subject.id);
    for (const spec of cls?.resources ?? []) {
      if (!spec.isUltimateMeter) continue;
      walk(spec.generation, (o) => {
        if (typeof o.amount === "number") o.amount = o.amount / 2;
      });
    }
    return;
  }

  // `no-ult-direct` and `no-ult` both reach into the one ultimate under test.
  const cls = ALL_CLASSES.find((c) => c.classId === subject.id);
  const ability = cls?.abilities.find((a) => a.id === subject.ult);
  if (!ability) throw new Error(`no ability ${subject.ult}`);
  walk(ability.effects, (o) => {
    const dmg = o.damage as Record<string, unknown> | undefined;
    if (!dmg || typeof dmg !== "object") return;
    if (typeof dmg.base === "number") dmg.base = 0;
    if (config === "no-ult" && typeof dmg.executeMissingHealth === "number") {
      dmg.executeMissingHealth = 0;
    }
  });
}

// --- running -----------------------------------------------------------------

interface Run {
  cleared: boolean;
  seconds: number;
  damageTaken: number;
  bossMax: number;
  hits: Hit[];
  ultCasts: number;
}

function runFloor(classId: ClassId, seed: number, config: RunConfig, isBoss: boolean): Run {
  const state = geared(LEVEL, seed, 14, classId);
  let bossMax = 0;
  let prevCharge = 0;
  let ultCasts = 0;
  const onTick = (d: Dungeon): void => {
    if (d.boss) bossMax = d.boss.maxHealth;
    // An ultimate is the meter emptying — nothing else empties it (THE ULTIMATE RULE:
    // an ultimate cannot recharge itself), so a full-to-empty transition is a cast.
    const charge = d.specialCharge;
    if (prevCharge >= 0.9 && charge < 0.3) ultCasts++;
    prevCharge = charge;
  };

  HITS = [];
  RECORDING = true;
  const r = playFloor(state, config, 300, seed, DODGE, onTick);
  RECORDING = false;

  const cleared = isBoss
    ? r.d.phase !== "fighting" && r.d.boss === null && bossMax > 0
    : r.d.phase !== "fighting";
  return { cleared, seconds: r.seconds, damageTaken: r.damageTaken, bossMax, hits: HITS, ultCasts };
}

interface Agg {
  runs: number;
  cleared: number;
  /**
   * Seconds to clear, over the runs that **cleared**. A failed run ends when the bot dies,
   * which is usually early, so pooling failures in makes a configuration that loses more
   * look *faster*. The first draft of this tool did exactly that and reported the Ranger
   * getting quicker when its ultimate was deleted. This is the confound
   * `docs/raid-party-scaling.md` warns about, arriving from the other direction: a duration
   * metric lies when the thing you changed also changes whether the run finishes at all.
   */
  seconds: number[];
  damageTaken: number[];
  ultCasts: number;
  /** Total pre-crit damage dealt, by ability id. */
  byAbility: Map<string, number>;
  /**
   * The ultimate's hits grouped **by run**, not pooled. `geared()` rolls different gear per
   * seed, so the caster's attack damage — and therefore the ability's base amount — differs
   * from run to run. Pooling them makes a clean single-packet ability look like several
   * packets and the split refuses a signal that is actually there, which is what the first
   * draft of this tool did.
   */
  ultHitsByRun: Hit[][];
  bossMax: number[];
  totalDealt: number;
}

function emptyAgg(): Agg {
  return {
    runs: 0, cleared: 0, seconds: [], damageTaken: [], ultCasts: 0,
    byAbility: new Map(), ultHitsByRun: [], bossMax: [], totalDealt: 0,
  };
}

function sweep(subject: { id: ClassId; ult: string }, config: Config, run: RunConfig, isBoss: boolean): Agg {
  const saved = snapshot();
  applyConfig(config, subject);
  const agg = emptyAgg();
  try {
    for (let i = 0; i < SEEDS; i++) {
      const r = runFloor(subject.id, 4000 + i * 131, run, isBoss);
      const ultThisRun: Hit[] = [];
      agg.runs++;
      if (r.cleared) agg.cleared++;
      if (r.cleared) agg.seconds.push(r.seconds);
      agg.damageTaken.push(r.damageTaken);
      agg.ultCasts += r.ultCasts;
      if (r.bossMax > 0) agg.bossMax.push(r.bossMax);
      for (const hit of r.hits) {
        if (isBoss && !hit.boss) continue;
        agg.byAbility.set(hit.ability, (agg.byAbility.get(hit.ability) ?? 0) + hit.amount);
        agg.totalDealt += hit.amount;
        if (hit.ability === subject.ult) ultThisRun.push(hit);
      }
      agg.ultHitsByRun.push(ultThisRun);
    }
  } finally {
    restore(saved);
  }
  return agg;
}

// --- reporting ---------------------------------------------------------------

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function fmt(x: number, dp = 1): string {
  return Number.isFinite(x) ? x.toFixed(dp) : "—";
}
function pct(x: number): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : "—";
}

/**
 * The empirical direct/rider split described in the header, plus the number the pilot run
 * made the point of this whole tool: the rider's **effective coefficient**, measured off
 * the fight rather than read off the ability.
 *
 * THE EXECUTE RULE is `maxHealth * (1 - frac/T) * coeff`, and a hit above the threshold
 * carries no rider at all, so `base` is directly observable. Every hit below the threshold
 * then yields its own reading of the coefficient:
 *
 *     coeff = (amount - base) / (maxHealth * (1 - frac/T))
 *
 * That is the number the ability is *actually* casting with, after every tree node, hybrid
 * unlock, mutation and relic that added to it. Comparing it against the number authored on
 * the packet is the whole finding: they are not the same, and two shipped fixes moved only
 * the authored one.
 *
 * Returns `null` when the ability fires more than one distinct base amount per cast (the
 * Assassin's ultimate is three blows and only the last carries a rider), because the
 * above-threshold sample is then a mixture and the residual would be a number this tool
 * cannot stand behind. The report says so per ability rather than printing it anyway.
 */
interface Split {
  base: number;
  riderTotal: number;
  directTotal: number;
  /** One reading of the effective coefficient per below-threshold hit. */
  coeffs: number[];
  above: number;
  below: number;
}

/**
 * Runs `splitOne` over each run separately and pools the results. A run whose hits are not
 * separable is dropped rather than averaged in, and `runsUsed` reports how many survived so
 * a split resting on one lucky seed is visible instead of silent.
 */
function splitRuns(byRun: readonly (readonly Hit[])[]): (Split & { runsUsed: number }) | null {
  const parts = byRun.map(splitOne).filter((x): x is Split => x !== null);
  if (parts.length === 0) return null;
  return {
    base: mean(parts.map((p) => p.base)),
    riderTotal: parts.reduce((a, p) => a + p.riderTotal, 0),
    directTotal: parts.reduce((a, p) => a + p.directTotal, 0),
    coeffs: parts.flatMap((p) => p.coeffs),
    above: parts.reduce((a, p) => a + p.above, 0),
    below: parts.reduce((a, p) => a + p.below, 0),
    runsUsed: parts.length,
  };
}

function splitOne(hits: readonly Hit[]): Split | null {
  const above = hits.filter((h) => h.frac >= EXECUTE_THRESHOLD);
  const below = hits.filter((h) => h.frac < EXECUTE_THRESHOLD);
  // Two readings either side is the minimum that can show a spread at all. The pilot run
  // had ten hits above and three below and was refused by a stricter guard, which is the
  // "a scope that silently emptied" failure pointed the other way: a bound so cautious it
  // discards a clean signal. Both counts are printed so a thin sample is visible.
  if (above.length < 2 || below.length < 2) return null;
  const amounts = above.map((h) => h.amount);
  const lo = Math.min(...amounts);
  const hi = Math.max(...amounts);
  // A single-packet ability lands one amount per cast, up to whatever drift a buff causes
  // in the caster's attack damage over a fight. A real second packet is a different base
  // entirely, not a 10% wobble.
  if (hi > lo * 1.35) return null;
  const base = mean(amounts);
  const riderTotal = below.reduce((a, h) => a + Math.max(0, h.amount - base), 0);
  const directTotal = hits.reduce((a, h) => a + Math.min(h.amount, base), 0);
  const coeffs = below
    .map((h) => {
      const room = h.maxHealth * (1 - h.frac / EXECUTE_THRESHOLD);
      return room > 0 ? (h.amount - base) / room : NaN;
    })
    .filter((c) => Number.isFinite(c) && c > 0);
  return { base, riderTotal, directTotal, coeffs, above: above.length, below: below.length };
}

/**
 * What the ability *says* its rider is, and everything that silently adds to it. Read off
 * the live class data so it cannot drift from what the game casts, and reported next to the
 * measured coefficient as the explanation for any gap between the two.
 */
function authoredRider(subject: { id: ClassId; ult: string }): { authored: number; adders: { id: string; amount: number; via: string }[] } {
  const cls = ALL_CLASSES.find((c) => c.classId === subject.id);
  const ability = cls?.abilities.find((a) => a.id === subject.ult);
  let authored = 0;
  walk(ability?.effects, (o) => {
    if (typeof o.executeMissingHealth === "number") authored += o.executeMissingHealth;
  });
  const tags = new Set((ability?.tags ?? []) as string[]);
  const adders: { id: string; amount: number; via: string }[] = [];
  // A mutation reaches this ability if it targets it by id, or by a tag the ability carries.
  walk(cls, (o) => {
    const target = o.target as Record<string, unknown> | undefined;
    const ops = o.ops as unknown;
    if (!target || !Array.isArray(ops)) return;
    const byId = target.abilityId === subject.ult;
    const byTag = typeof target.withTag === "string" && tags.has(target.withTag);
    if (!byId && !byTag) return;
    for (const op of ops as Record<string, unknown>[]) {
      if (typeof op.addExecuteMissingHealth !== "number" || op.addExecuteMissingHealth === 0) continue;
      adders.push({
        id: String(o.id ?? "?"),
        amount: op.addExecuteMissingHealth,
        via: byId ? "by ability id" : `by tag "${String(target.withTag)}"`,
      });
    }
  });
  return { authored, adders };
}

function reportFloor(title: string, subject: { id: ClassId; ult: string; note: string }, run: RunConfig, isBoss: boolean): void {
  console.log(`\n${"=".repeat(96)}`);
  console.log(`${subject.id} — ${subject.note}`);
  console.log(`${title} · ${SEEDS} seeds · level ${LEVEL} · dodge ${DODGE}`);
  console.log("=".repeat(96));

  const base = sweep(subject, "shipped", run, isBoss);

  // --- accounting -------------------------------------------------------
  console.log("\n  ACCOUNTING — share of all damage dealt, shipped build\n");
  const ranked = [...base.byAbility.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [ability, amount] of ranked) {
    const mark = ability === subject.ult ? " <<< the ultimate" : "";
    console.log(`    ${ability.padEnd(34)} ${pct(amount / Math.max(1, base.totalDealt)).padStart(7)}${mark}`);
  }
  if (base.totalDealt === 0) console.log("    (no hits recorded — THE PROBE IS BLIND, do not read anything below)");

  const s = splitRuns(base.ultHitsByRun);
  const authored = authoredRider(subject);
  console.log("\n  THE ULTIMATE, SPLIT — direct packet vs execute rider\n");
  if (!s) {
    console.log(`    (not separable: ${base.ultHitsByRun.flat().length} hits, several distinct base amounts per`);
    console.log("     cast or too few either side of the threshold — read the ablation instead)");
  } else {
    // Normalised inside the separable runs, NOT against the ultimate's total across every
    // run: `s` only covers the runs the split could read, so dividing by an all-runs total
    // silently shrinks both halves and they stop summing to 100%.
    const ultTotal = s.directTotal + s.riderTotal;
    console.log(`    runs separable       ${String(s.runsUsed).padStart(5)} of ${base.runs}`);
    console.log(`    hits above threshold ${String(s.above).padStart(5)}   (pure base — the rider contributes nothing there)`);
    console.log(`    hits below threshold ${String(s.below).padStart(5)}`);
    console.log(`    direct packet        ${pct(s.directTotal / Math.max(1, ultTotal)).padStart(7)} of the ultimate's damage`);
    console.log(`    execute rider        ${pct(s.riderTotal / Math.max(1, ultTotal)).padStart(7)} of the ultimate's damage`);
    console.log(`      (both normalised inside those ${s.runsUsed} runs, so they sum to 100%)`);
  }

  // The headline: what the packet says its coefficient is, against what it casts with.
  console.log("\n  THE RIDER'S EFFECTIVE COEFFICIENT — authored vs measured\n");
  console.log(`    authored on the packet   ${fmt(authored.authored, 2).padStart(6)}`);
  for (const a of authored.adders) {
    console.log(`      + ${a.id.padEnd(34)} ${fmt(a.amount, 2).padStart(6)}   added ${a.via}`);
  }
  const reachable = authored.authored + authored.adders.reduce((t, a) => t + a.amount, 0);
  // "Reachable" rather than "expected": the adders above are every one that *can* reach this
  // ability, but a given character only carries the tree nodes and hybrid unlocks it actually
  // allocated. `armTrees` picks one spend for the bot, so the measured number below is the
  // coefficient on THAT build, and `reachable` is the ceiling a player who takes all of them
  // arrives at. Both matter and they are different numbers — the gap between them is the
  // range a balance decision has to cover, not an error bar.
  console.log(`    ${"= reachable ceiling".padEnd(24)} ${fmt(reachable, 2).padStart(6)}   (a build that allocates every adder above)`);
  if (s && s.coeffs.length > 0) {
    const lo = Math.min(...s.coeffs);
    const hi = Math.max(...s.coeffs);
    console.log(`    ${"MEASURED in the fight".padEnd(24)} ${fmt(mean(s.coeffs), 2).padStart(6)}   (${s.coeffs.length} readings, ${fmt(lo, 2)}..${fmt(hi, 2)})`);
    const ratio = mean(s.coeffs) / Math.max(0.0001, authored.authored);
    const ceiling = reachable / Math.max(0.0001, authored.authored);
    console.log(
      `\n    This build casts with ${fmt(ratio, 2)}x the coefficient written on the packet;`
      + ` the\n    reachable ceiling is ${fmt(ceiling, 2)}x.`,
    );
  } else {
    console.log(`    ${"MEASURED in the fight".padEnd(24)}      —   (not separable — see above)`);
  }

  if (isBoss && base.bossMax.length > 0) {
    const ultTotal = base.byAbility.get(subject.ult) ?? 0;
    const bars = ultTotal / Math.max(1, mean(base.bossMax) * base.runs);
    console.log(`\n    the ultimate delivers ${pct(bars)} of the boss's whole health bar`);
    console.log(`    casts per fight ${fmt(base.ultCasts / Math.max(1, base.runs), 2)}`);
  } else {
    console.log(`\n    casts per floor ${fmt(base.ultCasts / Math.max(1, base.runs), 2)}`);
  }

  // --- ablation ---------------------------------------------------------
  console.log("\n  ABLATION — one term removed at a time, same seeds\n");
  console.log(`    ${"config".padEnd(22)}${"cleared".padStart(9)}${"secs".padStart(8)}${"dmg taken".padStart(11)}${"casts".padStart(8)}${"coeff".padStart(8)}   effect on time-to-clear`);
  const baseSecs = mean(base.seconds);
  for (const cfg of CONFIGS) {
    const agg = cfg.id === "shipped" ? base : sweep(subject, cfg.id, run, isBoss);
    const secs = mean(agg.seconds);
    const delta = cfg.id === "shipped" ? "" : `${secs > baseSecs ? "+" : ""}${fmt(((secs / baseSecs) - 1) * 100)}%`;
    const contested = agg.cleared > 0 && agg.cleared < agg.runs;
    // The measured coefficient per row is the instrument checking itself: an ablation that
    // claims to remove a term but leaves this number where it was did not do what it says,
    // and a confident timing delta next to it would be measuring nothing. CLAUDE.md's rule
    // — confirm the run actually reaches the code under test.
    const rowSplit = splitRuns(agg.ultHitsByRun);
    const coeff = rowSplit && rowSplit.coeffs.length > 0 ? fmt(mean(rowSplit.coeffs), 2) : "—";
    console.log(
      `    ${cfg.label.padEnd(22)}${`${agg.cleared}/${agg.runs}`.padStart(9)}${fmt(secs).padStart(8)}`
      + `${fmt(mean(agg.damageTaken), 0).padStart(11)}${fmt(agg.ultCasts / Math.max(1, agg.runs), 2).padStart(8)}`
      + `${coeff.padStart(8)}   ${delta.padStart(8)}`
      + `${contested ? "" : "   << NOT CONTESTED"}`,
    );
  }
  console.log("\n    Read CLEARED first and `secs` second. A row pinned at 0/N or N/N cannot move in");
  console.log("    either direction and measures nothing. `secs` covers cleared runs only, so a row");
  console.log("    that clears far less often is comparing a different population and its timing");
  console.log("    delta is not a like-for-like reading.");
  console.log("    On a trash floor, time-to-clear is gated by the wave director's spawn cadence");
  console.log("    rather than by damage, so the ACCOUNTING above is the signal there, not `secs`.");
}

// --- main --------------------------------------------------------------------

const only = arg("classes", "");
const list = only ? SUBJECTS.filter((s) => only.split(",").includes(s.id)) : SUBJECTS;

const raid = RAIDS.find((r) => r.id === RAID_ID);
if (!raid) throw new Error(`no raid ${RAID_ID}`);

console.log(`\nEXECUTE FAMILY — per-term attribution (docket §38)`);
console.log(`threshold ${EXECUTE_THRESHOLD} · raid ${raid.name} tier ${TIER} · trash depth ${DEPTH}`);

for (const subject of list) {
  if (FLOOR === "boss" || FLOOR === "both") {
    reportFloor(`RAID BOSS — ${raid.name} tier ${TIER}`, subject, raidConfig(raid, TIER), true);
  }
  if (FLOOR === "trash" || FLOOR === "both") {
    reportFloor(`TRASH FLOOR — delve depth ${DEPTH}`, subject, delveConfig(DEPTH), false);
  }
}
console.log("");
