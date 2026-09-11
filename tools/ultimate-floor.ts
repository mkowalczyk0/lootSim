/**
 * THE IMMUNITY DUTY CYCLE (docket §32) — an ultimate can never be up all the time.
 *
 * > "they need a MAX cooldown parameter... Or at least on the paladins, it can never
 * > exceed the time the invincibility lasts."
 *
 * The owner cleared a **Death March X delve, depth 46, ×20006.3 loot, four waves, without
 * dying**, by spamming the Paladin's ultimate. All 21 ultimates are authored `cooldown: 0`
 * and gated only by a charge meter, so a build that charges fast enough has no upper bound
 * on cast rate at all — and Last Light's `under_oath` makes every nearby ally unkillable
 * for its duration. A window that covers its own recharge is permanent invulnerability.
 *
 * The fix is at the **single site that admits a cast** (`AbilityRuntime.castAbility`), not
 * a `minCooldown` field on 21 packets: a required field can be satisfied with `0`, which is
 * this bug spelled explicitly, and an ultimate written next month would arrive unprotected.
 * Same shape as the execute threshold (§20) and the map-wipe selector (§30).
 *
 * Two passes, and the second is the one that proves anything.
 *
 * Run with `npm run ultfloor`; part of `npm test`.
 */

import { Dungeon, type Hero } from "../src/game/dungeon";
import { geared } from "./bot";
import { delveConfig } from "../src/data/modes";
import { CLASS_BY_ID, installClass } from "../src/progression/index";
import { applyMutations } from "../src/progression/mutations";
import {
  IMMUNITY_DUTY_CYCLE, ULTIMATE_COOLDOWN_FLOOR, guardedSpan, ultimateCooldownFloor,
} from "../src/combat/runtime";
import { circleHitsWall } from "../src/game/level";
import type { Action, AvatarInput } from "../src/core/input";
import { CLASS_IDS } from "../src/data/classes";

let failures = 0;
function check(name: string, ok: boolean, note = ""): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${note ? `  — ${note}` : ""}`);
  if (!ok) failures += 1;
}

// --- pass 1: the floor exists on every ultimate, and the table is printed ----

console.log(`THE IMMUNITY DUTY CYCLE (docket §32)\n`);
console.log(`ULTIMATE_COOLDOWN_FLOOR = ${ULTIMATE_COOLDOWN_FLOOR}s, IMMUNITY_DUTY_CYCLE = ${IMMUNITY_DUTY_CYCLE}\n`);
console.log("class         ultimate                  guard(s)   floor(s)");
let guardians = 0;
let walked = 0;
for (const id of CLASS_IDS) {
  const def = CLASS_BY_ID[id];
  if (!def) continue;
  installClass(def);
  const ult = def.abilities.find((a) => a.isUltimate);
  if (!ult) continue;
  walked += 1;
  const g = guardedSpan(ult);
  const f = ultimateCooldownFloor(ult);
  if (g > 0) guardians += 1;
  console.log(`  ${id.padEnd(13)} ${ult.name.padEnd(24)} ${g.toFixed(1).padStart(7)} ${f.toFixed(1).padStart(10)}`);
}
console.log("");
check(`walked all ${CLASS_IDS.length} ultimates`, walked === CLASS_IDS.length, `${walked}`);
check("exactly one ultimate in the roster grants a death guard", guardians === 1,
  `${guardians} — a second one inherits the same rule for free, but the owner should be told`);

for (const id of CLASS_IDS) {
  const def = CLASS_BY_ID[id];
  const ult = def?.abilities.find((a) => a.isUltimate);
  if (!ult) continue;
  const g = guardedSpan(ult);
  const f = ultimateCooldownFloor(ult);
  if (g > 0) {
    check(`${id}: its floor is at least its guard, so a gap always exists`, f >= g * IMMUNITY_DUTY_CYCLE,
      `floor ${f} vs guard ${g}`);
  }
  check(`${id}: never below the global floor`, f >= ULTIMATE_COOLDOWN_FLOOR, `${f}`);
}

// The Mythic is the build the exploit was reported on, and a floor authored against the
// base window would have been silently wrong for it.
{
  const def = CLASS_BY_ID["paladin"]!;
  const ult = def.abilities.find((a) => a.isUltimate)!;
  const muts: Parameters<typeof applyMutations>[1][number][] = [];
  const rec = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { for (const v of o) rec(v); return; }
    const r = o as Record<string, unknown>;
    if (r.id === "saint.last_light") muts.push(r as never);
    for (const v of Object.values(r)) rec(v);
  };
  rec(def.progression); rec(def.unlocks);
  check("the Paladin's Mythic mutation was found", muts.length === 1, `${muts.length}`);
  const mythic = applyMutations(ult, muts);
  check("…and the floor tracks the window it scales, rather than a number authored against the base",
    ultimateCooldownFloor(mythic) > ultimateCooldownFloor(ult),
    `base ${ultimateCooldownFloor(ult).toFixed(1)}s -> mythic ${ultimateCooldownFloor(mythic).toFixed(1)}s`);
}

// --- pass 2: live, with the meter refilled every tick -----------------------

/**
 * The static table says what the floor *is*. This says what a player experiences, and it
 * is the half that answers the owner's report: the meter is refilled to full **every
 * tick**, which is the limit of "a high enough ultimate charge rate", and the bot presses
 * the ultimate every tick. If a gap exists under that, it exists under anything.
 */
class SpamUltimate implements AvatarInput {
  moveVector(): { x: number; y: number } { return { x: 0, y: 0 }; }
  wasPressed(a: Action): boolean { return a === "special"; }
  aimAngle(): number | null { return null; }
}
const SPAM = new SpamUltimate();

console.log("\n--- live: infinite meter, ultimate pressed every tick ---");
{
  const def = CLASS_BY_ID["paladin"]!;
  installClass(def);
  const state = geared(60, 0x5eed, 30, "paladin");
  const d = new Dungeon(state, delveConfig(12), 4242);
  d.sealWaves();
  d.enemies.length = 0;
  const a = d.localHero.avatar;
  for (const r of [90, 160]) {
    for (let k = 0; k < 6; k++) {
      const x = a.x + Math.cos((k / 6) * Math.PI * 2) * r;
      const y = a.y + Math.sin((k / 6) * Math.PI * 2) * r;
      if (x < 40 || y < 40 || x > d.width - 40 || y > d.height - 40) continue;
      if (circleHitsWall(d.level, x, y, 18)) continue;
      d.spawnArchetypeAt("brute", x, y);
    }
  }
  const hero: Hero = d.localHero;
  const meter = hero.resources.ultimateMeter();
  let guardedTicks = 0;
  let casts = 0;
  let wasGuarded = false;
  const TICKS = 60 * 60; // one minute
  for (let i = 0; i < TICKS; i++) {
    if (meter) meter.value = meter.max;   // "a high enough ultimate charge rate"
    d.update(1 / 60, SPAM);
    const guarded = hero.sc.has("under_oath");
    if (guarded) guardedTicks += 1;
    if (guarded && !wasGuarded) casts += 1;
    wasGuarded = guarded;
  }
  const pct = (guardedTicks / TICKS) * 100;
  console.log(`  under_oath up for ${pct.toFixed(1)}% of a minute, across ${casts} applications`);
  check("the ultimate actually fired — the probe is not measuring an idle hero", casts > 0, `${casts} casts`);
  check("a Paladin with an infinite meter is NOT permanently unkillable", pct < 95, `${pct.toFixed(1)}% guarded`);
  check("…and the gap is roughly the duty cycle, not a rounding error", pct < 70, `${pct.toFixed(1)}% guarded`);
}

console.log("");
if (failures > 0) {
  console.log(`FAILED (${failures})`);
  process.exit(1);
}
console.log("ok — no ultimate can cover its own recharge");
