/**
 * The Proving acceptance test, and the first structural audit of the boss rules — UAT
 * §13 + §14.
 *
 * Two jobs, because they answer the same question from opposite ends:
 *
 * **1. The legend roster.** All 21 classes have a Proving, every one resolves to a real
 * template encounter, and `legendBossSpec` really does reskin rather than reinvent.
 *
 * **2. The boss rules, asserted for the first time.** `CLAUDE.md`'s boss section lists
 * the rules "which any new ability must follow", and until now nothing checked them —
 * `tools/smoke.ts` verifies every boss has a sprite and stops there. So the 21 generated
 * specs are audited against those rules structurally, and the five hand-authored
 * encounters are audited too, against a **pinned** list of their existing violations.
 *
 * That pinning is deliberate. The authored encounters predate this audit and mostly but
 * not strictly follow the "phases add rather than replace" rule; re-tuning shipped
 * content is not this branch's business. So the pin fails loudly if a *new* violation
 * appears in a shipped boss, and equally loudly if a pinned one is fixed without
 * updating the list — a characterization test, not a suppression.
 *
 * Headless, no browser. Run with `npm run legends`.
 */

import { BOSSES, BOSS_ABILITIES, type BossAbilityId, type BossSpec } from "../src/data/bosses";
import { CLASSES, CLASS_IDS } from "../src/data/classes";
import {
  DELVE_BOTTOM, LEGENDS, PROVING_DAMAGE, PROVING_HEALTH, PROVING_LAST_PHASE_NAME,
  PROVING_SELF_RESIST, legendBossSpec, legendName, provingFloor, provingUnlocked,
} from "../src/data/legends";
import { MODES, RUN_MODES, delveConfig, riftConfig } from "../src/data/modes";
import { PLANETS, planetConfig } from "../src/data/planets";
import { dailyConfig } from "../src/data/daily";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

// --- the boss rules, as code ------------------------------------------------

/**
 * How far an ability has to be able to touch before it counts as reaching across the
 * arena. The rule it serves is "every phase needs at least one ability that reaches
 * across the arena, or the fight can be beaten by walking backwards", so the test is
 * whether the boss can *choose* the ability while you are far away and still hit you.
 */
const CROSS_ARENA_RANGE = 400;

/** Whether one ability can touch a player who is refusing to come closer. */
function reachesAcross(id: BossAbilityId): boolean {
  const a = BOSS_ABILITIES[id];
  // A pure buff reaches nobody; it is not an answer to a player walking backwards.
  if (a.damage <= 0 && a.count <= 0) return false;
  if (a.maxRange < CROSS_ARENA_RANGE) return false;
  // Centred on the boss and small enough to stand outside of: you can just leave.
  // Unless it throws something (projectiles, adds) that comes to find you.
  return !a.onSelf || a.radius >= 300 || a.count > 0;
}

interface Violation {
  readonly rule: string;
  readonly detail: string;
}

/**
 * Audits one encounter against the rules in `CLAUDE.md`'s boss section. Structural only:
 * "a dash always beats a mechanic" and "casting locks the boss in place" are runtime
 * promises of `game/boss.ts` and are covered in `tools/smoke.ts` instead — what is
 * checkable here is that every ability *has* a wind-up to be locked by.
 */
function auditSpec(spec: BossSpec): Violation[] {
  const out: Violation[] = [];
  const phases = spec.phases;

  if (phases.length < 2) {
    out.push({ rule: "phases", detail: `only ${phases.length} phase(s)` });
  }
  if (phases[0]?.at !== 1) {
    out.push({ rule: "phases", detail: `first phase starts at ${phases[0]?.at}, not 1` });
  }

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i]!;
    const where = `${spec.id} phase ${i + 1} (${phase.name})`;

    if (phase.abilities.length === 0) {
      out.push({ rule: "phases", detail: `${where} has no abilities` });
      continue;
    }

    // Rule: every ability is telegraphed. If a hit landed, it was readable.
    for (const id of phase.abilities) {
      const a = BOSS_ABILITIES[id];
      if (!a) {
        out.push({ rule: "telegraphed", detail: `${where} names unknown ability ${id}` });
        continue;
      }
      // Rule: casting locks the boss in place — so there has to be a cast to lock it.
      if (a.cast <= 0) {
        out.push({ rule: "wind-up", detail: `${where}: ${id} has no wind-up` });
      }
      // No shape is only allowed when nothing lands unannounced: either the ability
      // deals no damage itself (a buff, a summon) or it resolves into visible
      // projectiles the player can see crossing the floor.
      if (a.shape === "none" && a.damage > 0 && a.count <= 0) {
        out.push({ rule: "telegraphed", detail: `${where}: ${id} deals damage with no telegraph` });
      }
    }

    // Rule: every phase needs at least one ability that reaches across the arena.
    if (!phase.abilities.some(reachesAcross)) {
      out.push({
        rule: "cross-arena",
        detail: `${where} can be beaten by walking backwards (${phase.abilities.join(", ")})`,
      });
    }

    // Rule: phases add abilities rather than replacing them.
    if (i > 0) {
      const before = new Set(phases[i - 1]!.abilities);
      const dropped = [...before].filter((id) => !phase.abilities.includes(id));
      if (dropped.length > 0) {
        out.push({ rule: "additive", detail: `${where} dropped ${dropped.join(", ")}` });
      }
      // Rule: the room gets busier as it dies.
      if (phase.haste > phases[i - 1]!.haste) {
        out.push({ rule: "additive", detail: `${where} casts slower than the phase before it` });
      }
    }
  }

  return out;
}

// --- 1. the legend roster --------------------------------------------------

console.log("\n=== every class has a Proving ===");
{
  check("one legend per class, and no extras",
    Object.keys(LEGENDS).length === CLASS_IDS.length
      && CLASS_IDS.every((id) => LEGENDS[id]?.classId === id),
    `${Object.keys(LEGENDS).length} legends for ${CLASS_IDS.length} classes`);

  const templates = new Set(BOSSES.map((b) => b.id));
  const unknown = CLASS_IDS.filter((id) => !templates.has(LEGENDS[id].template));
  check("every legend borrows a real encounter", unknown.length === 0, unknown.join(", "));

  // A title is the only authored line per legend; a copy-paste would be invisible in play
  // and is exactly the kind of thing that rots.
  const titles = new Set(CLASS_IDS.map((id) => LEGENDS[id].title));
  check("every deadpan title is its own line", titles.size === CLASS_IDS.length,
    `${titles.size} distinct of ${CLASS_IDS.length}`);
  const unpunctuated = CLASS_IDS.filter((id) => !/[.!?]$/.test(LEGENDS[id].title));
  check("…and each one is written as a sentence", unpunctuated.length === 0, unpunctuated.join(", "));

  const spread = new Map<string, number>();
  for (const id of CLASS_IDS) spread.set(LEGENDS[id].template, (spread.get(LEGENDS[id].template) ?? 0) + 1);
  check("the encounters are spread across every template, not all on one",
    spread.size === BOSSES.length,
    [...spread].map(([t, n]) => `${t}x${n}`).join(" "));
}

console.log("\n=== a Proving is a reskin, not a new content pipeline ===");
/** The deepest authored encounter — what this floor serves a character who hasn't
 *  qualified yet, and therefore the bar every Proving has to clear. */
const reference = BOSSES[BOSSES.length - 1]!;
for (const id of CLASS_IDS) {
  const legend = LEGENDS[id];
  const template = BOSSES.find((b) => b.id === legend.template)!;
  const spec = legendBossSpec(id);
  const ok = spec.id === `legend-${id}`
    && spec.name === legendName(id)
    && spec.title === legend.title
    // Its element is the class's own, so a Legend's missing half is made of the same
    // thing the Legend is.
    && spec.element === CLASSES[id].element
    && spec.sprite === template.sprite
    && spec.spriteScale === template.spriteScale
    && spec.selfResist === PROVING_SELF_RESIST
    // The stat line is measured against the deepest authored encounter rather than the
    // borrowed one, so which template a class wears can never decide how hard its own
    // final exam is. This is the check that would have caught the first version, where a
    // Warden-template Proving came out weaker than the floor it replaces.
    && Math.abs(spec.health - reference.health * PROVING_HEALTH) < 1e-9
    && Math.abs(spec.damage - reference.damage * PROVING_DAMAGE) < 1e-9
    && spec.health > reference.health && spec.damage > reference.damage;
  check(`${CLASSES[id].name}: ${spec.name}`, ok,
    `${legend.template} kit · ${CLASSES[id].element} · ${spec.health.toFixed(0)} hp ` +
    `(x${(spec.health / reference.health).toFixed(2)} the Nameless)`);
}

console.log("\n=== the final phase is appended, never substituted ===");
for (const id of CLASS_IDS) {
  const template = BOSSES.find((b) => b.id === LEGENDS[id].template)!;
  const spec = legendBossSpec(id);
  const last = spec.phases[spec.phases.length - 1]!;
  const penultimate = spec.phases[spec.phases.length - 2]!;
  const everything = new Set(template.phases.flatMap((p) => [...p.abilities]));
  const ok = spec.phases.length === template.phases.length + 1
    && last.name === PROVING_LAST_PHASE_NAME
    // Everything the template ever had, plus the enrage, and nothing invented.
    && [...everything].every((a) => last.abilities.includes(a))
    && last.abilities.includes("enrage")
    && last.haste <= penultimate.haste
    && last.addsOnEnter > penultimate.addsOnEnter;
  check(`${CLASSES[id].name} ends on ${spec.phases.length} phases`, ok,
    `${last.abilities.length} abilities, haste ${last.haste.toFixed(2)}, +${last.addsOnEnter} adds`);
}

// --- 2. the boss rules -----------------------------------------------------

console.log("\n=== the boss rules hold for all 21 Provings ===");
{
  let worst = "";
  let total = 0;
  for (const id of CLASS_IDS) {
    const v = auditSpec(legendBossSpec(id));
    total += v.length;
    if (v.length > 0 && !worst) worst = v.map((x) => `${x.rule}: ${x.detail}`).join(" | ");
  }
  check("no Proving violates a single boss rule", total === 0, worst);

  // Whichever body it borrows, a Proving is never gentler than the ordinary floor it
  // replaces. Asserted per class rather than once, because the failure mode it guards
  // against was per class: it depended entirely on which template the class wore.
  const soft = CLASS_IDS.filter((id) => {
    const spec = legendBossSpec(id);
    return spec.health <= reference.health || spec.damage <= reference.damage
      || spec.phases.length <= reference.phases.length - 1;
  });
  check("every Proving is harder than the depth-30 floor it replaces", soft.length === 0,
    soft.join(", "));

  // The union-and-append construction is what makes the additive rule true by
  // construction rather than by authoring discipline — assert that directly, since it is
  // the reason the check above can be expected to keep passing as classes are added.
  const nonAdditive = CLASS_IDS.filter((id) =>
    legendBossSpec(id).phases.some((p, i, all) =>
      i > 0 && all[i - 1]!.abilities.some((a) => !p.abilities.includes(a))));
  check("every Proving phase is a strict superset of the one before it",
    nonAdditive.length === 0, nonAdditive.join(", "));
}

/**
 * The shipped encounters, pinned. Each entry is `<boss id>|<rule>` for a violation that
 * already exists on master and is **not** this branch's to fix — reported to the PM as
 * its own list instead. New violations, and pinned ones that get fixed, both fail here.
 */
const KNOWN_AUTHORED_VIOLATIONS: readonly string[] = [
  // The Hollow Choir drops its slam entering Second Verse.
  "choir|additive",
  // The Herald drops its cleave entering Proclamation.
  "herald|additive",
  // That Which Has No Name drops slam, volley and windmill entering Interest, then
  // charge and corruption entering Displeasure.
  "nameless|additive",
];

console.log("\n=== the boss rules, measured against the shipped encounters ===");
{
  const found: string[] = [];
  for (const spec of BOSSES) {
    const v = auditSpec(spec);
    for (const x of v) {
      found.push(`${spec.id}|${x.rule}`);
      console.log(`       · ${spec.id}: ${x.rule} — ${x.detail}`);
    }
  }
  const unique = [...new Set(found)].sort();
  const pinned = [...new Set(KNOWN_AUTHORED_VIOLATIONS)].sort();
  check("the shipped encounters violate exactly the rules we already knew about",
    unique.join(",") === pinned.join(","),
    `found [${unique.join(", ")}] pinned [${pinned.join(", ")}]`);
}

// --- 3. when the Proving actually fires ------------------------------------

console.log("\n=== the Proving stands at the bottom of the Delve, and only there ===");
{
  const bottom = delveConfig(DELVE_BOTTOM);
  check(`depth ${DELVE_BOTTOM} is the bottom of the authored world, and a boss floor`,
    bottom.bossFloor && bottom.mode.id === "delve");
  check("the ladder is not capped — descending past the bottom still works",
    delveConfig(DELVE_BOTTOM + 1).depth === DELVE_BOTTOM + 1
      && MODES.delve.floors === 0 && !delveConfig(DELVE_BOTTOM).lastFloor);

  check("a qualified character finds their Proving there",
    provingFloor(bottom, DELVE_BOTTOM));
  check("…and an unqualified one finds the ordinary floor",
    !provingFloor(bottom, DELVE_BOTTOM - 1));
  check("touching the bottom is not enough — the gate is a banked clear",
    provingUnlocked(DELVE_BOTTOM) && !provingUnlocked(DELVE_BOTTOM - 1));

  check("no other Delve depth is ever the Proving",
    !provingFloor(delveConfig(DELVE_BOTTOM - 1), 99)
      && !provingFloor(delveConfig(DELVE_BOTTOM + 1), 99)
      && !provingFloor(delveConfig(DELVE_BOTTOM - 5), 99));

  // Solo only in v1: completion credit must not be duplicable or desyncable, and the
  // roster freezes at run start, so a party at the bottom fights the ordinary floor.
  check("a party at the bottom fights the ordinary floor, not somebody's Proving",
    !provingFloor(delveConfig(DELVE_BOTTOM, 0, 2), 99)
      && !provingFloor(delveConfig(DELVE_BOTTOM, 0, 4), 99));

  // Every other mode reaches these depths too — a rift tier or a Reliquary sector must
  // never quietly become somebody's final exam.
  const riftAtBottom = riftConfig("abyss", 11, MODES.abyss.floors);
  check("a rift floor at the same depth is never the Proving",
    !provingFloor(riftAtBottom, 99), `abyss T11 floor depth ${riftAtBottom.depth}`);
  check("a Reliquary expedition is never the Proving",
    !provingFloor(planetConfig(PLANETS[0]!, 1, 1, 0), 99)
      && !provingFloor({ ...planetConfig(PLANETS[0]!, 1, 1, 0), depth: DELVE_BOTTOM }, 99));
  check("the Vigil is never the Proving",
    !provingFloor(dailyConfig(20_000), 99)
      && !provingFloor({ ...dailyConfig(20_000), depth: DELVE_BOTTOM }, 99));

  // Mode-scoped, pinned across the whole mode roster rather than against the modes that
  // happen to exist today. Every other mode reaches depth 30 by some route, and a new one
  // arrives with whatever flags its author gives it — so this walks `RUN_MODES` and
  // asserts that only the Delve's bottom is ever anybody's final exam. A mode added later
  // is covered the moment it joins the roster, without anyone remembering to come back.
  const wrongMode = RUN_MODES.filter((id) => {
    if (id === "delve") return false;
    const forced = { ...delveConfig(DELVE_BOTTOM), mode: MODES[id] };
    return provingFloor(forced, 999);
  });
  check("only the Delve has a bottom — no other mode at depth 30 is ever the Proving",
    wrongMode.length === 0, wrongMode.length ? `leaked: ${wrongMode.join(", ")}` : `checked ${RUN_MODES.join(", ")}`);

  // The Challenger dial is the player's own difficulty knob and has nothing to say about
  // which floor this is.
  check("the Challenger dial does not move the bottom",
    provingFloor(delveConfig(DELVE_BOTTOM, 12), DELVE_BOTTOM)
      && !provingFloor(delveConfig(DELVE_BOTTOM - 1, 12), 99));
}

console.log(`\n${failures === 0 ? "ALL PROVING CHECKS PASSED" : `${failures} PROVING CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
