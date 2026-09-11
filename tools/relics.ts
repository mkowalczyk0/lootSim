/**
 * Relic & artifact acceptance test — UAT §19.
 *
 * §19's five Shared Design Rules are the acceptance criteria in all but name, and each
 * one is asserted here as a check rather than promised in a doc:
 *
 *   1. permanent progression — a banked relic is on the account, survives a save
 *      round-trip and the co-op wire, and a worn one reaches the sheet and the build
 *   2. build identity — every reference (tag, status, event, rule) resolves against the
 *      live roster, and a worn relic actually rewrites an ability / fires in a dungeon
 *   3. no generic stat sticks — every relic-tier definition carries at least one effect
 *      beyond `mods`, and the honestly-flagged stat sticks are at most a fifth of the
 *      roster; also asserted as a direct comparison against cosmetics, which are powerless
 *   4. clear acquisition — every definition has a LIVE source, every source resolves,
 *      the preview read lists it for the query its source describes, the roll sites
 *      really ask the table, and a reserved (raid/tower) source can't carry a relic alone
 *   5. chase value — artifacts are at least 1.5× as common as relics per source, a relic
 *      the account owns never drops again for it, and both tiers have a roster
 *
 * Plus the slot rule (three slots, one relic-tier), and the two-tier split itself:
 * artifacts come out of the Abyssal Rift and out of raids (UAT §15), and nowhere else.
 *
 * Headless, no browser. Run with `npm run relics`.
 */

import { readFileSync } from "node:fs";
import { BOSSES } from "../src/data/bosses";
import { PLANETS } from "../src/data/planets";
import { TOWER_BOSSES } from "../src/data/tower";
import { levelAdvice } from "../src/data/depth";
import type { EffectStep } from "../src/combat/ability";
import { getStatusSpec } from "../src/combat/status";
import { SKILL_TAGS } from "../src/combat/tags";
import type { CombatEventType } from "../src/combat/triggers";
import type { Action, AvatarInput } from "../src/core/input";
import { Rng } from "../src/core/rng";
import { parseSaved, serializeSave } from "../src/core/save";
import { COSMETICS, COSMETIC_SLOTS } from "../src/data/cosmetics";
import { dropsForSource } from "../src/data/drop-preview";
import {
  LIVE_SOURCE_KINDS, dropChance, isLiveSource, sourceFloor, sourceLevel,
  type DropQuery, type FoundSource,
} from "../src/data/drops";
import { DELVE_BOTTOM } from "../src/data/legends";
import { MOD_KEYS, type ModKey } from "../src/data/mods";
import { MODES, delveConfig, riftConfig } from "../src/data/modes";
import { towerConfig } from "../src/data/tower";
import { NAMED_ITEMS } from "../src/data/named";
import { RAIDS, raidConfig, raidDropQueries } from "../src/data/raids";
import {
  MAX_RELICS_WORN, RELICS, RELIC_BY_ID, RELIC_ODDS, RELIC_RULE_PREFIX, RELIC_SLOTS, RELIC_TIER_INFO,
  normalizeRelicLoadout, relicMatchesFor, relicProblems, relicSocketBlocker, relicSourceLines, relicsForSource,
  relicsOfTier, relicRequiredLevel, rollRelicDrops, type RelicDef,
} from "../src/data/relics";
import { REACTIVE_EVENTS } from "../src/game/abilities";
import { Dungeon, type Hero } from "../src/game/dungeon";
import type { Enemy, Pickup } from "../src/game/entities";
import { GameState, playerFromJSON, playerToJSON } from "../src/game/state";
import { ALL_CLASSES, mutationMatches } from "../src/progression/index";
import { CLASS_IDS, CLASSES } from "../src/data/classes";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

/** Every effect step in a list, nested branches included. */
function* walk(steps: readonly EffectStep[]): Iterable<EffectStep> {
  for (const s of steps) {
    yield s;
    switch (s.kind) {
      case "projectile": if (s.projectile.onExpire) yield* walk(s.projectile.onExpire); break;
      case "delay": case "reactive": case "followUp": yield* walk(s.effects); break;
      case "consumeStatus": case "consumeSummons": if (s.then) yield* walk(s.then); break;
      case "random": for (const c of s.choices) yield* walk(c.effects); break;
      default: break;
    }
  }
}

/** The first damage template an ability carries — on a damage, projectile or zone step. */
function firstDamage(a: { effects: readonly EffectStep[] }): { base: number; type: string } | null {
  for (const s of walk(a.effects)) {
    if (s.kind === "damage") return s.damage;
    if (s.kind === "projectile") return s.projectile.damage;
    if (s.kind === "zone" && s.zone.damage) return s.zone.damage;
  }
  return null;
}

/** A query that the given source would match — the inverse of `sourceMatches`, for round-trips. */
function queryFor(src: FoundSource): DropQuery {
  switch (src.kind) {
    case "boss": return { kind: "boss", bossId: src.bossId, mode: src.mode ?? "delve", tier: src.minTier ?? 0, depth: src.minDepth ?? 1 };
    case "chest": return { kind: "chest", tier: src.tier };
    case "clearCache": return { kind: "clearCache", depth: src.minDepth, mode: src.mode ?? "delve", tier: src.minTier ?? 0, lastFloor: src.lastFloor ?? false };
    case "worldDrop": return { kind: "worldDrop", depth: src.minDepth, elite: false, mode: src.mode ?? "delve" };
    // The tier has to ride along or a `minTier`-gated source can never satisfy its own
    // query — the same reason the `boss` branch above carries `src.minTier ?? 0`.
    case "raid": return { kind: "raid", raidId: src.raidId, tier: src.minTier ?? 0 };
    case "tower": return { kind: "tower", floor: src.minFloor };
  }
}

const ALL_ABILITIES = ALL_CLASSES.flatMap((c) => c.abilities);
/** The events the simulation actually broadcasts on the bus, so a passive keyed on one can fire. */
const EMITTED_EVENTS = new Set<CombatEventType>([...REACTIVE_EVENTS, "enemyDeath"]);
const RULES_SOURCE = readFileSync("src/game/rules.ts", "utf8");

// =========================================================================
section("1. the registry is well-formed, and the two tiers are both real");
{
  const relics = relicsOfTier("relic");
  const artifacts = relicsOfTier("artifact");
  check(`there is a roster: ${relics.length} relics, ${artifacts.length} artifacts`, relics.length >= 10 && artifacts.length >= 15);
  const ids = RELICS.map((d) => d.id);
  check("every id is unique", new Set(ids).size === ids.length);
  const names = RELICS.map((d) => d.name);
  check("every display name is unique", new Set(names).size === names.length);
  for (const def of RELICS) {
    const problems = relicProblems(def);
    check(`${def.id}: well-formed as data`, problems.length === 0, problems.join("; "));
  }
  check("no relic shares an id with a named item", RELICS.every((d) => !NAMED_ITEMS.some((n) => n.id === d.id)));
  check("every definition presents as its tier's rarity", RELICS.every((d) => d.rarity === RELIC_TIER_INFO[d.tier].rarity));
}

// =========================================================================
section("2. rule 3 — no generic stat sticks");
{
  const pure = RELICS.filter((d) => d.effects.every((e) => e.kind === "mods"));
  check("every relic-tier definition does something beyond numbers",
    relicsOfTier("relic").every((d) => d.effects.some((e) => e.kind !== "mods")));
  check("every pure-stat definition is flagged as the exception it is", pure.every((d) => d.statStick === true));
  check(`pure stat sticks are at most a fifth of the roster (${pure.length} / ${RELICS.length})`,
    pure.length <= Math.floor(RELICS.length / 5));
  check("no relic-tier definition is a stat stick", relicsOfTier("relic").every((d) => !d.statStick));
  // Variety: the roster must not be one mechanic in thirty coats.
  const kinds = new Set(RELICS.flatMap((d) => d.effects.map((e) => e.kind)));
  check("mods, mutations, event passives and a rule flip are all represented",
    ["mods", "mutate", "grantEffect", "rule"].every((k) => kinds.has(k as never)), [...kinds].join(", "));
  const events = new Set(RELICS.flatMap((d) => d.effects.flatMap((e) => e.kind === "grantEffect" ? [e.on.event ?? `tag:${e.on.tag}`] : [])));
  check(`passives key on at least six different events or tags (${events.size})`, events.size >= 6, [...events].join(", "));
}

// =========================================================================
section("3. every reference resolves against the live roster");
{
  for (const def of RELICS) {
    for (const eff of def.effects) {
      if (eff.kind === "mutate") {
        const t = eff.mutation.target;
        if (t.withTag) check(`${def.id}: tag "${t.withTag}" exists`, (SKILL_TAGS as readonly string[]).includes(t.withTag));
        const hits = ALL_ABILITIES.filter((a) => mutationMatches(eff.mutation, a)).length;
        check(`${def.id}: mutation matches at least one ability (${hits})`, hits > 0);
        for (const op of eff.mutation.ops) {
          if (op.kind === "damagePacket" && op.setInflict) check(`${def.id}: inflicts a real status "${op.setInflict.status}"`, !!getStatusSpec(op.setInflict.status));
          if (op.kind === "status" && op.swap) check(`${def.id}: swaps between real statuses`, !!getStatusSpec(op.swap.from) && !!getStatusSpec(op.swap.to));
          if (op.kind === "addEffect" || op.kind === "trigger" || op.kind === "followUp") {
            for (const s of walk(op.effects)) if (s.kind === "status") check(`${def.id}: added step applies a real status "${s.status}"`, !!getStatusSpec(s.status));
          }
        }
      }
      if (eff.kind === "grantEffect") {
        if (eff.on.event) check(`${def.id}: keys on an event the sim broadcasts ("${eff.on.event}")`, EMITTED_EVENTS.has(eff.on.event));
        if (eff.on.tag) {
          check(`${def.id}: tag "${eff.on.tag}" exists`, (SKILL_TAGS as readonly string[]).includes(eff.on.tag));
          check(`${def.id}: some ability carries the tag "${eff.on.tag}"`, ALL_ABILITIES.some((a) => a.tags.includes(eff.on.tag!)));
        }
        for (const s of walk(eff.effects)) {
          if (s.kind === "status") check(`${def.id}: applies a real status "${s.status}"`, !!getStatusSpec(s.status));
          if (s.kind === "consumeStatus" || s.kind === "spreadStatus") check(`${def.id}: reads a real status "${s.status}"`, !!getStatusSpec(s.status));
          if (s.kind === "damage" && s.damage.inflict) check(`${def.id}: inflicts a real status`, !!getStatusSpec(s.damage.inflict.status));
          if (s.kind === "zone" && s.zone.status) check(`${def.id}: zone applies a real status`, !!getStatusSpec(s.zone.status.id));
        }
      }
      if (eff.kind === "rule") {
        check(`${def.id}: rule "${eff.rule}" is handled somewhere in game/rules.ts`, RULES_SOURCE.includes(`"${eff.rule}"`));
      }
      if (eff.kind === "mods") {
        check(`${def.id}: every mod key is real`, Object.keys(eff.mods).every((k) => (MOD_KEYS as readonly string[]).includes(k)));
      }
    }
  }
}

// =========================================================================
section("4. rules and mutations stay in the relic namespace");
{
  const classPrefixes = CLASS_IDS.map((c) => `${c}.`);
  for (const def of RELICS) {
    for (const eff of def.effects) {
      const id = eff.kind === "rule" ? eff.rule : eff.kind === "mutate" ? eff.mutation.id : null;
      if (!id) continue;
      check(`${def.id}: "${id}" is namespaced relic.<id>.`, id.startsWith(`${RELIC_RULE_PREFIX}${def.id}.`));
      check(`${def.id}: "${id}" borrows no class's namespace`, !classPrefixes.some((p) => id.startsWith(p)));
    }
  }
}

// =========================================================================
section("5. rule 4 — every one answers 'where does this drop?'");
{
  for (const def of RELICS) {
    check(`${def.id}: has a live source`, def.sources.some((s) => (LIVE_SOURCE_KINDS as readonly string[]).includes(s.kind)));
    for (const src of def.sources) {
      const found = relicsForSource(queryFor(src));
      check(`${def.id}: the preview read lists it for its own ${src.kind} source`, found.includes(def));
    }
    const lines = relicSourceLines(def);
    check(`${def.id}: has at least one readable source line`, lines.length > 0 && lines.every((l) => l.length > 10), lines[0] ?? "");
  }

  // The two-tier split, as the spec's table has it.
  // The two-tier split, widened once by UAT §15: an artifact comes out of the Abyssal Rift
  // or out of a raid, and out of nothing else. Raids are the other end of the endgame and
  // §15 asks for "some of the most desirable equipment in the game" to live there; what
  // the check still refuses is an artifact leaking into a chest, a wave monster, an
  // ordinary Delve floor or the Tower.
  check("every artifact source is the Abyssal Rift or a raid, and nothing but",
    relicsOfTier("artifact").every((d) => d.sources.every((s) =>
      s.kind === "raid" || ((s.kind === "boss" || s.kind === "clearCache") && s.mode === "abyss"))));
  check("...and every raid pays out artifacts as well as relics",
    RAIDS.every((r) => relicsForSource({ kind: "raid", raidId: r.id, tier: 99 }).some((d) => d.tier === "artifact")));
  check("no relic comes out of a chest or a wave monster",
    relicsOfTier("relic").every((d) => d.sources.every((s) => s.kind !== "chest" && s.kind !== "worldDrop")));
  check("a relic from the Abyss needs its deep tiers",
    relicsOfTier("relic").every((d) => d.sources.every((s) => !("mode" in s && s.mode === "abyss") || ("minTier" in s && (s.minTier ?? 0) >= 8))));
  const provingRelics = relicsOfTier("relic").filter((d) => d.sources.some((s) => s.kind === "boss" && s.bossId.startsWith("legend-")));
  check(`relics are recovered from the Proving (${provingRelics.length} of them)`, provingRelics.length >= 6);
  const elementsCovered = new Set(CLASS_IDS.filter((c) => relicsForSource({ kind: "boss", bossId: `legend-${c}`, mode: "delve", tier: 0, depth: DELVE_BOTTOM }).length > 0).map((c) => CLASSES[c].element));
  check(`every class's Proving drops at least one relic (${elementsCovered.size} elements covered)`,
    CLASS_IDS.every((c) => relicsForSource({ kind: "boss", bossId: `legend-${c}`, mode: "delve", tier: 0, depth: DELVE_BOTTOM }).length > 0));

  // Mode and tier really narrow a source.
  check("an Abyss-only artifact does not drop from the same boss in the Delve",
    relicsForSource({ kind: "boss", bossId: "choir", mode: "delve", tier: 0, depth: 10 }).every((d) => d.tier !== "artifact"));
  check("a tier-8 Abyss relic does not drop at tier 7",
    relicsForSource({ kind: "boss", bossId: "nameless", mode: "abyss", tier: 7, depth: 25 }).every((d) => d.tier !== "relic")
    && relicsForSource({ kind: "boss", bossId: "nameless", mode: "abyss", tier: 8, depth: 25 }).some((d) => d.tier === "relic"));
  check("the Nameless relics need depth 25 in the Delve",
    relicsForSource({ kind: "boss", bossId: "nameless", mode: "delve", tier: 0, depth: 24 }).length === 0
    && relicsForSource({ kind: "boss", bossId: "nameless", mode: "delve", tier: 0, depth: 25 }).length === 2);
  check("the rift-closing cache is not every cache",
    relicsForSource({ kind: "clearCache", depth: 12, mode: "abyss", tier: 1, lastFloor: false }).every((d) => !d.sources.some((s) => s.kind === "clearCache" && s.lastFloor))
    && relicsForSource({ kind: "clearCache", depth: 12, mode: "abyss", tier: 1, lastFloor: true }).some((d) => d.sources.some((s) => s.kind === "clearCache" && s.lastFloor)));

  // `raid` left the reserved seam with UAT §15, so the pair that used to say "nothing
  // emits this" now says what it emits and what it refuses: a real raid pays out its own
  // relics, and an id nothing declares pays out nothing at all. There is no reserved kind
  // today; the next one is added by leaving it out of `LIVE_SOURCE_KINDS`, and the
  // validator check further down is what keeps that guard honest.
  check("a raid query pays out that raid's relics",
    relicsForSource({ kind: "raid", raidId: RAIDS[0]!.id, tier: 99 }).length >= 2);
  check("...and an id no raid declares pays out nothing",
    relicsForSource({ kind: "raid", raidId: "anything", tier: 99 }).length === 0);
  check("a raid's relic-tier item needs the raid's own deep tiers",
    RAIDS.every((r) => relicsForSource({ kind: "raid", raidId: r.id, tier: 1 }).every((d) => d.tier === "artifact")));

  // ...and the ascent's own kind is live, asserted as the pair rather than as a bound: a
  // height below the gate pays nothing and a height above it pays that exact relic. A
  // one-sided "the tower drops something" would pass just as happily if `minFloor` were
  // being ignored altogether.
  const towerLow = relicsForSource({ kind: "tower", floor: 14 }).map((d) => d.id);
  const towerMid = relicsForSource({ kind: "tower", floor: 15 }).map((d) => d.id);
  const towerTop = relicsForSource({ kind: "tower", floor: 30 }).map((d) => d.id);
  check("the Tower's cache pays nothing below its first gate", towerLow.length === 0);
  check("...the Sandals at height 15, and only the Sandals",
    towerMid.length === 1 && towerMid[0] === "sandals-of-the-swift-messenger", towerMid.join(", "));
  check("...and the holy relic joins it at height 30", towerTop.includes("hymn-of-the-unfinished-choir"), towerTop.join(", "));
  check("a height is not a depth: no relic reads the tower gate off a Delve floor",
    relicsForSource({ kind: "clearCache", depth: 99, mode: "tower", tier: 0, lastFloor: false })
      .every((d) => !d.sources.some((s) => s.kind === "tower")));
  // The guard that used to be demonstrated with a `raid` source. Every kind is live now,
  // so it is demonstrated against the mechanism itself: `isLiveSource` is what the
  // validator consults, and a kind absent from `LIVE_SOURCE_KINDS` is refused. Kept
  // because the next reserved kind is opted *out*, and a guard nobody exercises is a
  // guard that has already stopped working.
  check("every kind the union declares is live today", LIVE_SOURCE_KINDS.length === 6);
  const hidden = { ...RELICS[0]!, id: "hidden-behind-the-seam", sources: [{ kind: "notyet", raidId: "x", chance: 0.5 }] } as unknown as RelicDef;
  check("a definition whose only source is a kind no site emits is refused by the validator",
    relicProblems(hidden).some((p) => p.includes("reserved kind")));
  const raidOnly: RelicDef = { ...RELICS[0]!, id: "raid-only", sources: [{ kind: "raid", raidId: RAIDS[0]!.id, chance: 0.5 }] };
  check("...while a raid source is accepted now that a site emits it",
    !relicProblems(raidOnly).some((p) => p.includes("reserved kind")));
  const unknownRaid: RelicDef = { ...RELICS[0]!, id: "unknown-raid", sources: [{ kind: "raid", raidId: "no-such-raid", chance: 0.5 }] };
  check("...and a raid source naming no raid is still refused",
    relicProblems(unknownRaid).some((p) => p.includes("names no raid")));
  const forged: RelicDef = { ...RELICS[0]!, id: "forged-relic", sources: [{ kind: "craft", materials: {}, coins: 1 } as unknown as FoundSource] };
  check("a relic with a craft source is refused — a relic is found, never made", relicProblems(forged).some((p) => p.includes("never forged")));

  // The composed read (§20): one question, every table, the matched source on each row.
  const q: DropQuery = { kind: "boss", bossId: "warden", mode: "abyss", tier: 1, depth: 12 };
  const rows = dropsForSource(q);
  check("dropsForSource composes both tables for the Abyss Warden",
    rows.some((r) => r.kind === "named") && rows.some((r) => r.kind === "relic"),
    rows.map((r) => `${r.kind}:${r.def.id}`).join(", "));
  check("...every row carries the source it matched, with a chance to quote", rows.every((r) => r.src.chance > 0 && r.src.kind === "boss"));
  check("...and it agrees with the typed reads", rows.filter((r) => r.kind === "relic").length === relicMatchesFor(q).length);
  const everyQuery: DropQuery[] = RELICS.flatMap((d) => d.sources.map(queryFor)).concat(NAMED_ITEMS.flatMap((d) => d.sources.filter((s) => s.kind !== "craft").map((s) => queryFor(s as FoundSource))));
  check("a craft-only named item never appears in any activity preview",
    everyQuery.every((qq) => dropsForSource(qq).every((r) => r.def.id !== "threshold-brand" && r.def.id !== "the-seal-unbroken")));
}

// =========================================================================
section("6. rule 5 — chase value: odds, the dupe skip, the danger hook");
{
  const mean = (defs: readonly RelicDef[]) => {
    const chances = defs.flatMap((d) => d.sources.map((s) => s.chance));
    return chances.reduce((a, b) => a + b, 0) / chances.length;
  };
  const a = mean(relicsOfTier("artifact"));
  const r = mean(relicsOfTier("relic"));
  check(`artifacts are at least 1.5× as common as relics per source (${a.toFixed(3)} vs ${r.toFixed(3)})`, a >= r * 1.5);
  check("no single source hands out a relic more than one time in five", relicsOfTier("relic").every((d) => d.sources.every((s) => s.chance <= 0.2)));

  const yes = { chance: () => true };
  const q: DropQuery = { kind: "boss", bossId: "choir", mode: "abyss", tier: 1, depth: 12 };
  const all = rollRelicDrops(q, yes, 1);
  check("with the dice rigged, the Abyss Choir pays out every artifact it lists", all.length === relicsForSource(q).length && all.length >= 5, `${all.length}`);
  const owned = new Set(all.slice(0, 3).map((d) => d.id));
  const rest = rollRelicDrops(q, yes, 1, owned);
  check("...and never one the account already owns", rest.length === all.length - 3 && rest.every((d) => !owned.has(d.id)));
  check("with the dice against you, nothing drops", rollRelicDrops(q, { chance: () => false }, 1).length === 0);
  check("the danger hook is monotone and capped", dropChance(0.1, 1) === 0.1 && dropChance(0.1, 4) > dropChance(0.1, 2) && dropChance(0.5, 1e9) <= 1);
}

// =========================================================================
// The union — what a player actually experiences, as comparisons.
//
// A per-source `chance` is not the quantity the player feels. A clear fires several drop
// events, `rollTable` rolls every matching definition independently on each, and what the
// player notices is whether *anything* relic-tier fell out of the whole run. That union is
// the number the owner's 2026-09-10 complaint was about ("damn near guaranteed when doing
// raids") and no individual number in `RELIC_ODDS` had to look wrong for it to be true:
// a raid floor pays twice, so an authored 0.18 was a 33% per-clear artifact at tier 1.
//
// These are comparisons and equalities rather than thresholds on purpose. CLAUDE.md's
// standing lesson is that a one-sided bound doesn't prove a design promise — so the
// headline check below is an *equality* between what `RELIC_ODDS` says a raid pays and
// what a raid clear actually pays, which goes red if a source stops naming its event, if
// the floor gains a third payout, or if a raid's table gains a second artifact.
section("6b. the union: what a clear actually pays, not what one source says");
{
  /** P(at least one def of `tier` drops) across every event of one clear. Fresh account. */
  const unionOf = (events: readonly DropQuery[], danger: number, tier: string): number => {
    const miss = new Map<string, number>();
    for (const q of events) {
      for (const m of relicMatchesFor(q)) {
        if (m.def.tier !== tier) continue;
        miss.set(m.def.id, (miss.get(m.def.id) ?? 1) * (1 - dropChance(m.src.chance, danger)));
      }
    }
    let all = 1;
    for (const p of miss.values()) all *= p;
    return 1 - all;
  };
  const unionAny = (events: readonly DropQuery[], danger: number): number =>
    1 - (1 - unionOf(events, danger, "artifact")) * (1 - unionOf(events, danger, "relic"));

  // The event list comes from `data/raids.ts`, which is the same list `Dungeon` builds its
  // two queries from — not a copy written out here, which would keep reporting the old
  // composition after the real one changed.
  const clears = RAIDS.map((spec) => ({ spec, events: raidDropQueries(spec.id, 1) }));
  check(`the raid clear event list is the simulation's own, and there are ${clears[0].events.length} of them`,
    clears.every((c) => c.events.length === 2));

  // THE headline: the authored number is the experienced number. An artifact paid from
  // both halves of the floor would read 1-(1-p)^2 here and fail immediately.
  const authored = dropChance(RELIC_ODDS.raidArtifact, 1);
  const offenders = clears.filter((c) => Math.abs(unionOf(c.events, 1, "artifact") - authored) > 1e-9);
  check(
    `a raid clear pays its artifact at exactly the odds RELIC_ODDS states (${(authored * 100).toFixed(1)}%), not the doubled composition`,
    offenders.length === 0,
    offenders.length ? offenders.map((c) => `${c.spec.id} ${(unionOf(c.events, 1, "artifact") * 100).toFixed(1)}%`).join(", ") : `${clears.length} raids`,
  );

  // "A raid clear is not a guaranteed artifact", as a comparison rather than a bound:
  // more clears end with nothing relic-tier than end with something, at every tier a
  // player can reach. Checked out to tier 12, well past the tier-8 gate §16 talks about.
  const tiers = [1, 2, 3, 4, 6, 8, 10, 12];
  const guaranteed: string[] = [];
  for (const spec of RAIDS) {
    for (const t of tiers) {
      const cfg = raidConfig(spec, t);
      const u = unionAny(raidDropQueries(spec.id, t), cfg.danger);
      if (u >= 0.5) guaranteed.push(`${spec.id} t${t} ${(u * 100).toFixed(1)}%`);
    }
  }
  check(
    "a raid clear more often pays nothing relic-tier than pays something, at every tier to 12",
    guaranteed.length === 0,
    guaranteed.length ? guaranteed.join(", ") : `${RAIDS.length} raids x ${tiers.length} tiers`,
  );

  // Rule 5's ratio, restated on the quantity the player experiences rather than per source.
  const ratioFails: string[] = [];
  for (const spec of RAIDS) {
    const t = 8; // above every raid relic's `minTier`, so both tiers are actually in play
    const cfg = raidConfig(spec, t);
    const ev = raidDropQueries(spec.id, t);
    const a = unionOf(ev, cfg.danger, "artifact");
    const r = unionOf(ev, cfg.danger, "relic");
    if (!(r > 0 && a >= r * 1.5)) ratioFails.push(`${spec.id} a=${a.toFixed(3)} r=${r.toFixed(3)}`);
  }
  check(
    "per clear, not just per source, a raid's artifact stays at least 1.5x its relic",
    ratioFails.length === 0,
    ratioFails.length ? ratioFails.join(", ") : `${RAIDS.length} raids at t8`,
  );
}

// The Abyss artifact pool — the mechanism, asserted as equalities and comparisons.
//
// Before pools, fifteen artifacts matched one Abyss boss and each rolled independently, so
// the rift paid a relic-tier item on 92% of tier-1 clears and 99.2% of tier-8 clears. The
// number nobody authored was the union, and it climbed on its own every time an artifact
// was added. These checks pin the mechanism rather than tonight's arithmetic: a constant
// nudged today would pass a threshold and re-inflate on the next authored artifact.
section("6c. the Abyss artifact draw pays at the odds RELIC_ODDS states, whatever the roster");
{
  const abyssBossQ = (tier: number): DropQuery =>
    ({ kind: "boss", bossId: "nameless", mode: "abyss", tier, depth: 30 });

  /** P(the event pays any artifact), composed the way `rollTable` actually rolls it. */
  const artifactUnion = (q: DropQuery, danger: number): number => {
    const pooled = new Map<string, number>();
    let missIndependent = 1;
    for (const m of relicMatchesFor(q)) {
      if (m.def.tier !== "artifact") continue;
      const p = dropChance(m.src.chance, danger);
      const pool = "pool" in m.src ? m.src.pool : undefined;
      if (pool !== undefined) pooled.set(pool, Math.max(pooled.get(pool) ?? 0, p));
      else missIndependent *= 1 - p;
    }
    let miss = missIndependent;
    for (const p of pooled.values()) miss *= 1 - p;
    return 1 - miss;
  };

  // THE headline, the same shape as a raid's: the authored constant IS the experienced
  // number. Fifteen independent rolls would read 0.891 here against an authored 0.14.
  const q1 = abyssBossQ(1);
  const authored = dropChance(RELIC_ODDS.abyssBoss, 1);
  const got = artifactUnion(q1, 1);
  const matched = relicMatchesFor(q1).filter((m) => m.def.tier === "artifact").length;
  check(
    `an Abyss boss pays an artifact at exactly the odds RELIC_ODDS states (${(authored * 100).toFixed(1)}%), not once per definition`,
    Math.abs(got - authored) < 1e-9,
    `${(got * 100).toFixed(1)}% across ${matched} matching definitions`,
  );
  check("...and it really is many definitions competing, not one left in the table",
    matched >= 10, `${matched} artifacts match one Abyss boss`);

  // The structural property, and the reason this is a mechanism fix rather than a tuning
  // pass: the union must not move when the roster grows. Injected here rather than
  // reasoned about — a 24th artifact joining the pool changes nothing.
  const fake: FoundSource = {
    kind: "boss", bossId: "nameless", chance: RELIC_ODDS.abyssBoss, mode: "abyss",
    pool: "abyss-artifact",
  };
  const withExtra = (() => {
    const pooled = new Map<string, number>();
    let miss = 1;
    const all = [...relicMatchesFor(q1).filter((m) => m.def.tier === "artifact").map((m) => m.src), fake];
    for (const src of all) {
      const p = dropChance(src.chance, 1);
      const pool = "pool" in src ? src.pool : undefined;
      if (pool !== undefined) pooled.set(pool, Math.max(pooled.get(pool) ?? 0, p));
      else miss *= 1 - p;
    }
    for (const p of pooled.values()) miss *= 1 - p;
    return 1 - miss;
  })();
  check("a twenty-fourth artifact joining the pool does not raise the odds at all",
    Math.abs(withExtra - got) < 1e-9, `${(withExtra * 100).toFixed(1)}% vs ${(got * 100).toFixed(1)}%`);

  // A direct comparison against what the old composition would have paid, so the check
  // states the improvement rather than bounding the result.
  const independent = relicMatchesFor(q1)
    .filter((m) => m.def.tier === "artifact")
    .reduce((acc, m) => acc * (1 - dropChance(m.src.chance, 1)), 1);
  check("the pooled draw is strictly stingier than rolling every definition separately",
    got < 1 - independent, `${(got * 100).toFixed(1)}% vs ${((1 - independent) * 100).toFixed(1)}%`);

  // §16 still works: a tier that opens a better-odds member raises the pool's rate.
  const low = artifactUnion(abyssBossQ(1), 1);
  const high = artifactUnion(abyssBossQ(8), 1);
  check("a tier that opens a better member still raises the draw (UAT §16 survives pooling)",
    high > low, `t1 ${(low * 100).toFixed(1)}% vs t8 ${(high * 100).toFixed(1)}% at equal danger`);

  // Scope, stated positively: the systems this was NOT allowed to move.
  const untouched: [string, DropQuery][] = [
    ["the Nameless at depth 25", { kind: "boss", bossId: "nameless", mode: "delve", tier: 1, depth: 25 }],
    ["the deep Delve cache", { kind: "clearCache", depth: 30, mode: "delve", tier: 1, lastFloor: false }],
    ["the Tower cache", { kind: "tower", floor: 30 }],
  ];
  const leaked = untouched.filter(([, q]) =>
    relicMatchesFor(q).some((m) => "pool" in m.src && m.src.pool !== undefined));
  check("no pool reaches the Nameless, the deep Delve cache or the Tower — they roll as before",
    leaked.length === 0, leaked.map(([n]) => n).join(", ") || `${untouched.length} systems checked, none pooled`);
}

// =========================================================================
section("7. the slot rule: three slots, one relic");
{
  const relics = relicsOfTier("relic").map((d) => d.id);
  const artifacts = relicsOfTier("artifact").map((d) => d.id);
  check(`there are ${RELIC_SLOTS} slots and ${MAX_RELICS_WORN} may be a relic`, RELIC_SLOTS === 3 && MAX_RELICS_WORN === 1);
  const empty: (string | null)[] = [null, null, null];
  // Every check in this section is about the *slot* rule, so it is asked at a level no
  // definition can out-rank — derived from the roster rather than pinned at a round number,
  // so authoring a deeper relic tomorrow cannot quietly turn a slot-rule check into a level
  // -gate check that happens to be red for the other reason.
  const MAX_REQ = Math.max(...RELICS.map(relicRequiredLevel));
  const any = MAX_REQ;
  check("anything owned goes into an empty loadout", relicSocketBlocker(empty, 0, relics[0]!, any) === null && relicSocketBlocker(empty, 2, artifacts[0]!, any) === null);
  const one: (string | null)[] = [relics[0]!, null, null];
  check("a second relic is refused with a reason", typeof relicSocketBlocker(one, 1, relics[1]!, any) === "string");
  check("...but two artifacts beside it are fine", relicSocketBlocker(one, 1, artifacts[0]!, any) === null && relicSocketBlocker([relics[0]!, artifacts[0]!, null], 2, artifacts[1]!, any) === null);
  check("replacing the relic in its own slot is fine", relicSocketBlocker(one, 0, relics[1]!, any) === null);
  check("the same relic twice is refused", typeof relicSocketBlocker(one, 1, relics[0]!, any) === "string");
  check("an unknown id is refused", typeof relicSocketBlocker(empty, 0, "not-a-relic", any) === "string");
  const legal = normalizeRelicLoadout([relics[0], relics[1], artifacts[0], artifacts[1], "ghost"], any);
  check("a loadout that broke the rule loads back to legal — one relic, the artifact kept, the rest dropped",
    legal.worn.length === RELIC_SLOTS && legal.worn[0] === relics[0] && legal.worn[1] === null && legal.worn[2] === artifacts[0], JSON.stringify(legal.worn));
  check("...and nothing is reported unsocketed, because the level was never the reason",
    legal.unsocketed.length === 0, JSON.stringify(legal.unsocketed));
  check("garbage normalises to three empty slots", JSON.stringify(normalizeRelicLoadout("nope", any).worn) === JSON.stringify(empty));
}

// =========================================================================
section("7b. the level gate: a relic answers to the floor it fell on");
{
  // A level no definition can out-rank, derived from the roster rather than pinned — used
  // wherever a check needs the gate out of the way to look at something else.
  const MAX_REQ = Math.max(...RELICS.map(relicRequiredLevel));
  const relicIds = relicsOfTier("relic").map((d) => d.id);

  // --- it is DERIVED, not authored -------------------------------------------------
  //
  // The whole design is that `relicRequiredLevel` reads the drop table rather than a field
  // on the definition, so this asserts the identity against the independently-computed
  // answer rather than against a pinned list of numbers. A pinned list would be a second
  // authoring of exactly the thing that must not be authored twice, and would go green on
  // a definition whose sources moved underneath it.
  const derivedMismatch = RELICS.filter((d) => {
    const live = d.sources.filter(isLiveSource);
    const cheapest = Math.min(...live.map(sourceLevel));
    return relicRequiredLevel(d) !== Math.max(1, cheapest - 1);
  });
  check(`every one of ${RELICS.length} requirements is the cheapest source's own level, less the grace`,
    derivedMismatch.length === 0, derivedMismatch.map((d) => d.id).join(", ") || "no definition authors its own number");

  // A relic has no field to author one with — the positive half of the same statement, and
  // the reason a definition added tomorrow is gated for free.
  check("no RelicDef carries a level field for anyone to forget",
    RELICS.every((d) => !("requiredLevel" in d) && !("minLevel" in d)));

  // --- it tracks the SOURCE, both ways ----------------------------------------------
  //
  // Not a bound ("every relic needs at least level 5") — a bound is satisfied by a constant
  // and would say nothing about whether the number follows the floor. This compares two
  // definitions against each other: the one that drops deeper must ask for more.
  const shallow = RELICS.reduce((a, b) => relicRequiredLevel(a) <= relicRequiredLevel(b) ? a : b);
  const deep = RELICS.reduce((a, b) => relicRequiredLevel(a) >= relicRequiredLevel(b) ? a : b);
  const shallowFloor = Math.min(...shallow.sources.filter(isLiveSource).map((s) => sourceFloor(s).depth));
  const deepFloor = Math.min(...deep.sources.filter(isLiveSource).map((s) => sourceFloor(s).depth));
  check("the relic from the deepest floor asks for more than the one from the shallowest",
    relicRequiredLevel(deep) > relicRequiredLevel(shallow) && deepFloor > shallowFloor,
    `${deep.id} lv ${relicRequiredLevel(deep)} @ depth ${deepFloor} vs ${shallow.id} lv ${relicRequiredLevel(shallow)} @ depth ${shallowFloor}`);

  // Climbing a rift's tier ladder asks for more. True of the whole ladder — depth and danger
  // together, which is what a player actually walks up.
  const t1 = sourceLevel({ kind: "boss", bossId: BOSSES[1]!.id, chance: 1, mode: "abyss" });
  const t8 = sourceLevel({ kind: "boss", bossId: BOSSES[1]!.id, chance: 1, mode: "abyss", minTier: 8 });
  check("a tier-8 Abyss source asks for more than a tier-1 one", t8 > t1, `tier 8 → ${t8}, tier 1 → ${t1}`);

  // ...and **danger is a part of it on its own**, which the check above cannot show: a rift's
  // `depthPerTier` raises the depth as well, so tier 8 out-ranking tier 1 is carried by the
  // depth confound whether danger is read or not. (Measured: dividing danger back out of
  // `sourceLevel` left that comparison green, which is precisely the shape CLAUDE.md's
  // one-sided-bound lesson warns about — the check named danger and measured depth.)
  //
  // Isolating it needs the depth held still, so this asks the same formula about the same
  // depth at danger 1 — the control the confounded version was missing.
  const tiered: FoundSource = { kind: "boss", bossId: BOSSES[1]!.id, chance: 1, mode: "abyss", minTier: 8 };
  const tieredFloor = sourceFloor(tiered);
  check("...and danger carries part of that on its own: the same depth at danger 1 asks less",
    tieredFloor.danger > 1 && sourceLevel(tiered) > levelAdvice(tieredFloor.depth, 1),
    `depth ${tieredFloor.depth} at danger ${tieredFloor.danger.toFixed(2)} → ${sourceLevel(tiered)}, `
      + `the same depth at danger 1 → ${levelAdvice(tieredFloor.depth, 1)}`);

  // A rift's boss is `bossFor(effective depth)`, so *which* encounter a source names is a
  // real constraint on top of the mode and the tier — "the Colossus, in the Abyss" is a much
  // deeper ask than "the Herald, in the Abyss". Both sources below name the same rift at the
  // same minimum tier, so the mode and the tier are held still and the encounter is the only
  // thing that varies. (Measured: stubbing the tier search out to always answer its lowest
  // tier left every other check in this section green, so without this one the search would
  // have been untested code that silently flattened five artifacts' requirements.)
  const shallowEnc = sourceLevel({ kind: "boss", bossId: BOSSES[1]!.id, chance: 1, mode: "abyss" });
  const deepEnc = sourceLevel({ kind: "boss", bossId: BOSSES[BOSSES.length - 1]!.id, chance: 1, mode: "abyss" });
  check("in one rift at one tier floor, naming a deeper encounter asks for more",
    deepEnc > shallowEnc,
    `${BOSSES[BOSSES.length - 1]!.id} → ${deepEnc}, ${BOSSES[1]!.id} → ${shallowEnc}`);

  // --- an unrecognised boss id fails OPEN, so every id the game makes needs a watcher ---
  //
  // `sourceFloor` hands an id it cannot place the shallowest run in the game (depth 1), which
  // is the weakest possible gate. That is the right failure direction — an unwearable relic
  // is worse than a cheap one — but it means a boss id nobody taught it about goes quiet
  // rather than red. So every id the game can actually generate is walked here, and the
  // count is printed: a scope that silently empties is then visible in the output rather
  // than passing as a zero-iteration loop.
  const everyBossId = [
    ...BOSSES.map((b) => b.id),
    ...TOWER_BOSSES.map((b) => `tower-${b.templateId}`),
    ...PLANETS.map((pl) => `planet-${pl.id}`),
    ...RAIDS.map((r) => `raid-${r.id}`),
    ...CLASS_IDS.map((c) => `legend-${c}`),
  ];
  const unplaced = everyBossId.filter((id) => sourceFloor({ kind: "boss", bossId: id, chance: 1 }).depth <= 1);
  check(`all ${everyBossId.length} boss ids the game can generate place on a real floor`,
    everyBossId.length >= 28 && unplaced.length === 0, unplaced.join(", ") || "none falls back to depth 1");

  // ...and the fallback itself is still reachable, or the check above would be asserting a
  // property of `filter` rather than of `sourceFloor`.
  check("...while an id nothing emits does fall back", sourceFloor({ kind: "boss", bossId: "no-such-boss", chance: 1 }).depth === 1);

  // ...and the Challenger dial is NOT part of it. A player must not be able to raise their
  // own relics' requirements by turning their own difficulty up.
  check("the Challenger dial never reaches the gate — `sourceFloor` reads danger at dial zero",
    sourceFloor({ kind: "boss", bossId: BOSSES[1]!.id, chance: 1, mode: "abyss", minTier: 8 }).danger
      === Math.pow(MODES.abyss.dangerPerTier, 7));

  // --- both directions at the boundary, and the grace -------------------------------
  // The deepest relic in the roster rather than the first one over a threshold: a filter can
  // silently empty (and then this section asserts nothing, or crashes), while a reduce over
  // a non-empty roster always has a subject. `RELICS` being non-empty is section 1's job.
  const subject = RELICS.reduce((a, b) => relicRequiredLevel(a) >= relicRequiredLevel(b) ? a : b);
  const need = relicRequiredLevel(subject);
  check(`the boundary subject is a real gate to stand on — ${subject.name} asks for ${need}`, need > 1);
  const slots: (string | null)[] = [null, null, null];
  check(`a character one level short of ${subject.name} (${need}) is refused, with the level in the message`,
    (relicSocketBlocker(slots, 0, subject.id, need - 1) ?? "").includes(String(need)));
  check("...and at exactly that level it goes on", relicSocketBlocker(slots, 0, subject.id, need) === null);
  check("...and above it, obviously", relicSocketBlocker(slots, 0, subject.id, need + 5) === null);

  // The grace is one level and it is `requiredLevel`'s, for `requiredLevel`'s reason: the
  // run that earns a relic must be able to wear it. Asserted as the relationship, not as a
  // number — the cheapest source's advice is exactly one above what the gate asks.
  const graceWrong = RELICS.filter((d) => {
    const cheapest = Math.min(...d.sources.filter(isLiveSource).map(sourceLevel));
    return cheapest > 1 && relicRequiredLevel(d) !== cheapest - 1;
  });
  check("the grace is exactly one level, on every definition that has room for it",
    graceWrong.length === 0, graceWrong.map((d) => d.id).join(", ") || `${RELICS.length} definitions`);
  check("and it never lands below level 1", RELICS.every((d) => relicRequiredLevel(d) >= 1));

  // --- the migration says what it took ----------------------------------------------
  const heavy = RELICS.filter((d) => relicRequiredLevel(d) > 5);
  const worn = [heavy.find((d) => d.tier === "relic")!.id, heavy.find((d) => d.tier === "artifact")!.id, null];
  const low = normalizeRelicLoadout(worn, 1);
  check("a level-1 character loading that save wears neither, and is told about both",
    low.worn.every((w) => w === null) && low.unsocketed.length === 2, JSON.stringify(low));
  const high = normalizeRelicLoadout(worn, MAX_REQ);
  check("...the same save at level for both keeps them, and reports nothing",
    high.worn[0] === worn[0] && high.worn[1] === worn[1] && high.unsocketed.length === 0, JSON.stringify(high));
  // A cap violation is not a level removal. Two relic-tier ids at a level that clears both:
  // one comes out for the cap and must stay silent, or the town would tell a player to
  // level up for something levelling will never fix.
  const capped = normalizeRelicLoadout([relicIds[0], relicIds[1], null], MAX_REQ);
  check("a relic dropped for the slot cap is not reported as a level removal",
    capped.worn[1] === null && capped.unsocketed.length === 0, JSON.stringify(capped));
}

// =========================================================================
section("8. a worn relic is a tree node you wear — and cosmetics still aren't");
{
  const state = new GameState(3);
  state.chooseClass("swordsman");
  state.player.level = 40;
  state.player.refresh();
  state.player.autoSlotNewAbilities();
  const before = { ...state.player.mods };
  const grantsBefore = state.player.build.grants.length;

  // The control: wear every cosmetic. Not one number moves.
  state.cosmetics = COSMETICS.map((c) => c.id);
  for (const slot of COSMETIC_SLOTS) {
    const first = state.ownedInSlot(slot)[0];
    if (first) state.wear(slot, first.id);
  }
  state.player.refresh();
  check("wearing every cosmetic moves nothing on the sheet", JSON.stringify(state.player.mods) === JSON.stringify(before));

  // The relic: the sheet moves by exactly its mods, the build gains exactly its behaviour.
  const spark = RELIC_BY_ID["spark-of-the-unfinished-storm"]!;
  state.relics.push(spark.id);
  const res = state.socketRelic(0, spark.id);
  check("an owned relic sockets", res.ok);
  const after = state.player.mods;
  const exact = (MOD_KEYS as readonly ModKey[]).every((k) => Math.abs((after[k] - before[k]) - (k === "lightningDamage" ? 0.5 : 0)) < 1e-6);
  check("socketing Spark moves Player.mods by exactly its mods and nothing else", exact);
  check("its mutation is in the build", state.player.build.mutations.some((m) => m.id === "relic.spark-of-the-unfinished-storm.all-lightning"));
  const physical = ALL_CLASSES.find((c) => c.classId === "swordsman")!.abilities.find((a) => firstDamage(a) && firstDamage(a)!.type === "physical")!;
  check("a physical skill now strikes as lightning through applyBuild",
    firstDamage(state.player.resolvedAbility(physical))?.type === "lightning", `${physical.id}: ${firstDamage(physical)!.type} → ${firstDamage(state.player.resolvedAbility(physical))?.type}`);
  check("...and the ultimate follows the gear element", state.player.attackElement === "lightning");
  check("not owning one is refused", !state.socketRelic(1, "sandals-of-the-swift-messenger").ok);

  // Artifacts beside it, then the whole thing comes off.
  const tempo = RELIC_BY_ID["tempo-of-the-fifth-circle"]!;
  const sandals = RELIC_BY_ID["sandals-of-the-swift-messenger"]!;
  state.relics.push(tempo.id, sandals.id);
  check("an artifact sockets beside the relic", state.socketRelic(1, tempo.id).ok);
  check("a second relic is refused by the state too", !state.socketRelic(2, sandals.id).ok);
  check("the artifact's passive is in build.grants, marked as a relic", state.player.build.grants.some((g) => g.from === "relic"));
  state.unsocketRelic(0);
  state.unsocketRelic(1);
  check("unsocketing restores the sheet and the build byte-for-byte",
    JSON.stringify(state.player.mods) === JSON.stringify(before) && state.player.build.grants.length === grantsBefore
    && firstDamage(state.player.resolvedAbility(physical))?.type === "physical");

  // The spec's own two examples, as written.
  check("Sandals: +10% move speed and a second dodge", (() => {
    state.socketRelic(0, sandals.id);
    const ok = Math.abs(state.player.mods.moveSpeed - before.moveSpeed - 0.1) < 1e-6 && state.player.dashCharges === 2;
    state.unsocketRelic(0);
    return ok;
  })());
  const sigil = RELIC_BY_ID["sigil-of-the-unfinished-art"]!;
  state.relics.push(sigil.id);
  state.socketRelic(0, sigil.id);
  const withCd = ALL_CLASSES.find((c) => c.classId === "swordsman")!.abilities.find((a) => a.cooldown > 0)!;
  const rewritten = state.player.resolvedAbility(withCd);
  check("Sigil: a cooldown is cut to 15%", Math.abs(rewritten.cooldown - withCd.cooldown * 0.15) < 1e-6, `${withCd.id}: ${withCd.cooldown} → ${rewritten.cooldown}`);
  state.unsocketRelic(0);
}

// =========================================================================
section("9. save, wire, and a retired id");
{
  const state = new GameState(5);
  state.chooseClass("magician");
  // This section is about the save and the wire, not the level gate, so the character is
  // taken past every requirement in the roster first — derived rather than pinned, so a
  // deeper relic authored later can't turn a save round-trip check red for the wrong reason.
  // The level itself round-trips (`applyPlayerJSON` reads it before the loadout), which is
  // what makes the loaded character's loadout comparable to the saved one at all.
  state.player.level = Math.max(...RELICS.map(relicRequiredLevel));
  state.player.refresh();
  const ids = ["spark-of-the-unfinished-storm", "tempo-of-the-fifth-circle", "shard-of-the-nothing", "weight-of-the-fourth-circle"];
  state.bankRelics(ids);
  check("banking puts every new relic in the collection once", ids.every((id) => state.ownsRelic(id)) && state.relics.length === 4);
  state.bankRelics(["tempo-of-the-fifth-circle"]);
  check("a duplicate bank is a counter, not a second copy", state.relics.length === 4 && state.stats.relicsFound["tempo-of-the-fifth-circle"] === 2);
  check("banking garbage adds nothing", state.bankRelics(["nope"]).length === 0 && state.relics.length === 4);
  state.socketRelic(0, ids[0]!);
  state.socketRelic(1, ids[1]!);
  state.socketRelic(2, ids[2]!);

  const saved = parseSaved(serializeSave(state.toJSON()));
  const back = GameState.fromSaved(saved);
  check("the collection survives a save round-trip", JSON.stringify(back.relics) === JSON.stringify(state.relics));
  check("the loadout survives it too", JSON.stringify(back.players.magician.relics) === JSON.stringify(state.players.magician.relics));
  check("the records remember every find", back.stats.relicsFound["tempo-of-the-fifth-circle"] === 2);
  check("the loaded character's build carries the relic", back.players.magician.build.mutations.some((m) => m.id.startsWith("relic.spark")));

  // The co-op wire is the same blob (`playerToJSON` does double duty).
  const remote = playerFromJSON("magician", JSON.parse(JSON.stringify(playerToJSON(state.player))));
  check("the loadout crosses the co-op wire", JSON.stringify(remote.relics) === JSON.stringify(state.player.relics));
  check("...and the host rebuilds the same behaviour from it",
    remote.build.grants.filter((g) => g.from === "relic").length === state.player.build.grants.filter((g) => g.from === "relic").length
    && remote.mods.lightningDamage === state.player.mods.lightningDamage);

  // A retired definition, in the collection and in a slot: dropped, nothing crashes.
  const raw = state.toJSON() as { relics: string[]; players: Record<string, { relics: (string | null)[] }> };
  raw.relics.push("a-relic-that-no-longer-exists");
  raw.players.magician.relics[2] = "a-relic-that-no-longer-exists";
  const back2 = GameState.fromSaved(parseSaved(serializeSave(raw)));
  check("a retired id is dropped from the collection", !back2.relics.includes("a-relic-that-no-longer-exists") && back2.relics.length === 4);
  check("...and from the slot it was in", back2.players.magician.relics[2] === null && back2.players.magician.relics[0] === ids[0]);

  // A save that broke the one-relic rule (a future loosening, reverted) loads legal.
  const raw3 = state.toJSON() as { players: Record<string, { relics: (string | null)[] }> };
  raw3.players.magician.relics = ["spark-of-the-unfinished-storm", "sandals-of-the-swift-messenger", null];
  const back3 = GameState.fromSaved(parseSaved(serializeSave(raw3)));
  check("a loadout with two relics loads wearing one", back3.players.magician.relics[0] === "spark-of-the-unfinished-storm" && back3.players.magician.relics[1] === null);

  // Pre-v20 saves have none of this.
  const old = state.toJSON() as Record<string, unknown>;
  delete old.relics;
  delete (old.players as Record<string, Record<string, unknown>>).magician.relics;
  const back4 = GameState.fromSaved(parseSaved(serializeSave(old)));
  check("a save from before relics loads owning none and wearing none", back4.relics.length === 0 && back4.players.magician.relics.every((r) => r === null));
}

// =========================================================================
section("10. live: passives fire, the dash is real, a rule is in the build");
{
  const state = new GameState(6);
  state.chooseClass("swordsman");
  state.player.level = 40;
  state.player.refresh();
  state.player.autoSlotNewAbilities();
  state.bankRelics(["rime-of-the-unfinished-vigil", "tempo-of-the-fifth-circle", "stitch-of-the-colossus", "sandals-of-the-swift-messenger"]);
  state.socketRelic(0, "rime-of-the-unfinished-vigil");
  state.socketRelic(1, "tempo-of-the-fifth-circle");
  state.socketRelic(2, "stitch-of-the-colossus");
  state.player.fullHeal();
  const d = new Dungeon(state, delveConfig(8), 78);
  const hero = d.localHero;

  check("the relic's rule is in the hero's live rule set", hero.player.build.rules.has("relic.rime-of-the-unfinished-vigil.shatter"));
  d.bus.emit({ type: "damageTaken", actorId: hero.index, amount: 10, x: hero.avatar.x, y: hero.avatar.y });
  check("Tempo: taking a hit hastes you", hero.sc.has("hasted"));
  hero.player.health = Math.round(hero.player.maxHealth / 2);
  const half = hero.player.health;
  d.bus.emit({ type: "ultimateUse", actorId: hero.index, x: hero.avatar.x, y: hero.avatar.y, fromUltimate: true });
  check("Stitch: your ultimate heals you", hero.player.health > half, `${half} → ${hero.player.health}`);
  const hp = hero.player.health;
  d.bus.emit({ type: "ultimateUse", actorId: hero.index + 7, x: hero.avatar.x, y: hero.avatar.y, fromUltimate: true });
  check("...and none of it fires for somebody else's event", hero.player.health === hp);

  // Sandals in a real dungeon: the avatar starts the floor holding two dashes. (It is
  // relic-tier, so Rime has to come off first — the one-relic rule, in passing.)
  check("Sandals beside Rime is refused: one relic at a time", !state.socketRelic(1, "sandals-of-the-swift-messenger").ok);
  state.unsocketRelic(0);
  check("...and sockets once Rime is off", state.socketRelic(0, "sandals-of-the-swift-messenger").ok);
  const d2 = new Dungeon(state, delveConfig(8), 79);
  check("Sandals: the floor starts with two dashes in hand", d2.localHero.avatar.dashStock === 2 && d2.localHero.player.dashCharges === 2);
}

// =========================================================================
section("11. live: the drop sites really ask the table, and a bank lands it");
{
  class IdleInput implements AvatarInput {
    moveVector() { return { x: 0, y: 0 }; }
    wasPressed(_a: Action) { return false; }
    aimAngle() { return null; }
  }
  const IDLE = new IdleInput();
  type Priv = {
    rng: Rng;
    killEnemy(e: Enemy, source: Hero, fromUltimate?: boolean): void;
    dropClearCache(): void;
    // One argument since loot became shared: `collect` is not told who walked onto the
    // drop, because it pays every hero in the run (`docs/shared-loot.md`). This is a cast,
    // so the compiler cannot catch a stale arity here — the four red checks below are what
    // caught it.
    collect(p: Pickup): void;
  };
  const rig = (d: Dungeon) => {
    const priv = d as unknown as Priv;
    const real = priv.rng;
    priv.rng = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === "chance") return () => true;
        const v = Reflect.get(target, prop, receiver);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    return priv;
  };
  const relicsOnFloor = (d: Dungeon) => d.pickups.filter((p) => p.kind === "relic").map((p) => p.defId!);
  const spawnBoss = (d: Dungeon) => { for (let t = 0; t < 900 && !d.boss; t++) d.update(1 / 60, IDLE); return d.boss; };
  const fresh = (seed: number, classId: "swordsman" | "stormcaller" = "swordsman", level = 40, deepest = 0) => {
    const s = new GameState(seed);
    s.chooseClass(classId);
    s.player.level = level; s.player.deepestDepth = deepest; s.player.refresh(); s.player.fullHeal();
    return s;
  };

  // An Abyssal Rift boss pays out artifacts — at its own tier, in its own mode.
  const abyssState = fresh(31);
  const abyss = new Dungeon(abyssState, riftConfig("abyss", 1, 4), 601);
  const boss = spawnBoss(abyss);
  check("a tier-1 Abyss boss floor spawns its boss", !!boss, boss?.boss?.spec.id ?? "none");
  if (boss) {
    const spec = boss.boss!.spec.id;
    const q: DropQuery = { kind: "boss", bossId: spec, mode: "abyss", tier: 1, depth: abyss.config.depth };
    const wanted = relicsForSource(q).map((r) => r.id);
    const priv = rig(abyss);
    priv.killEnemy(boss, abyss.localHero);
    const dropped = relicsOnFloor(abyss);
    check(`killing the Abyss ${spec} drops every artifact it lists (${wanted.length})`,
      wanted.length >= 5 && wanted.every((id) => dropped.includes(id)), dropped.join(", ") || "nothing");
    check("...and no relic-tier item at tier 1", dropped.every((id) => RELIC_BY_ID[id]!.tier === "artifact"));
    check("...each glowing its tier's rarity", abyss.pickups.filter((p) => p.kind === "relic").every((p) => p.rarity === RELIC_BY_ID[p.defId!]!.rarity));

    // Pick one up, bank the floor, own it. Then a re-roll skips what you own.
    const first = abyss.pickups.find((p) => p.kind === "relic")!;
    priv.collect(first);
    check("picking one up puts it in the run's unbanked loot", abyss.loot.relics.includes(first.defId!));
    check("...and announces it as a relic event", abyss.drainEvents().some((ev) => ev.kind === "relic" && ev.id === first.defId));
    abyss.bankLoot();
    check("banking the floor puts it in the collection", abyssState.ownsRelic(first.defId!) && abyss.loot.relics.length === 0);
    abyss.pickups.length = 0;
    priv.killEnemy(boss, abyss.localHero);
    check("a second kill never drops what the account already owns", !relicsOnFloor(abyss).includes(first.defId!) && relicsOnFloor(abyss).length === wanted.length - 1);
  }

  // The same encounter in the Delve drops no artifact — they are Abyssal, full stop.
  const delveState = fresh(32);
  const delve = new Dungeon(delveState, delveConfig(10), 602);
  const delveBoss = spawnBoss(delve);
  check("a depth-10 Delve boss floor spawns its boss", !!delveBoss);
  if (delveBoss) {
    rig(delve).killEnemy(delveBoss, delve.localHero);
    check("the Delve's Choir drops no artifact", relicsOnFloor(delve).every((id) => RELIC_BY_ID[id]!.tier !== "artifact"));
  }

  // The Proving: a lightning Legend's Unfinished drops the lightning relic.
  const provingState = fresh(33, "stormcaller", 60, DELVE_BOTTOM);
  const proving = new Dungeon(provingState, delveConfig(DELVE_BOTTOM), 603);
  check("depth 30 with the class qualified is the Proving", proving.proving === "stormcaller");
  const legend = spawnBoss(proving);
  check("the Proving spawns The Unfinished Stormcaller", legend?.boss?.spec.id === "legend-stormcaller", legend?.boss?.spec.id ?? "none");
  if (legend) {
    rig(proving).killEnemy(legend, proving.localHero);
    const dropped = relicsOnFloor(proving);
    check("...and it drops the Spark of the Unfinished Storm", dropped.includes("spark-of-the-unfinished-storm"), dropped.join(", ") || "nothing");
    check("...and nothing meant for another element's Legend", !dropped.includes("cinder-of-the-unfinished-pyre"));
  }

  // The deepest Delve's clear cache, and the cache that closes an Abyss rift.
  const cacheState = fresh(34);
  const deep = new Dungeon(cacheState, delveConfig(DELVE_BOTTOM), 604);
  rig(deep).dropClearCache();
  check("the depth-30 Delve cache holds the Sandals", relicsOnFloor(deep).includes("sandals-of-the-swift-messenger"));
  const shallow = new Dungeon(cacheState, delveConfig(DELVE_BOTTOM - 1), 605);
  rig(shallow).dropClearCache();
  check("...and the depth-29 cache does not", !relicsOnFloor(shallow).includes("sandals-of-the-swift-messenger"));
  // The ascent's own cache (UAT §21), asserted as the same pair — and then as the
  // comparison that actually matters: a Delve cache at *any* depth never pays the
  // ascent's table, because a height is not a depth and the two ladders are addressed
  // separately on purpose. A one-sided "the tower pays out" check would stay green even
  // if `tower` had been implemented as a `clearCache` keyed on the effective depth, which
  // is precisely the leak §21 is built to prevent.
  const tower15 = new Dungeon(cacheState, towerConfig(15), 609);
  rig(tower15).dropClearCache();
  check("the height-15 Tower cache holds the Sandals", relicsOnFloor(tower15).includes("sandals-of-the-swift-messenger"));
  const tower14 = new Dungeon(cacheState, towerConfig(14), 610);
  rig(tower14).dropClearCache();
  check("...and the height-14 cache does not", !relicsOnFloor(tower14).includes("sandals-of-the-swift-messenger"));
  const tower30 = new Dungeon(cacheState, towerConfig(30), 611);
  rig(tower30).dropClearCache();
  check("the height-30 cache adds the holy relic", relicsOnFloor(tower30).includes("hymn-of-the-unfinished-choir"),
    relicsOnFloor(tower30).join(", ") || "nothing");
  const deepDelve = new Dungeon(cacheState, delveConfig(60), 612);
  rig(deepDelve).dropClearCache();
  check("...which a Delve cache never holds, at any depth — a height is not a depth",
    !relicsOnFloor(deepDelve).includes("hymn-of-the-unfinished-choir"));

  const closing = new Dungeon(cacheState, riftConfig("abyss", 2, 4), 606);
  rig(closing).dropClearCache();
  const midway = new Dungeon(cacheState, riftConfig("abyss", 2, 2), 607);
  rig(midway).dropClearCache();
  check("the cache that closes an Abyss rift holds the last-floor artifacts, a mid-rift cache does not",
    relicsOnFloor(closing).includes("step-of-the-pilgrim") && !relicsOnFloor(midway).includes("step-of-the-pilgrim")
    && relicsOnFloor(midway).includes("coin-of-the-first-circle"));

  // Death and the penalty exit both forfeit an unbanked relic.
  const lostState = fresh(35);
  const lost = new Dungeon(lostState, riftConfig("abyss", 1, 1), 608);
  lost.loot.relics.push("coin-of-the-first-circle");
  const kept = lost.earlyExtractLoot();
  check("bailing out through the entrance forfeits an unbanked relic", kept.itemsLost === 1 && !lostState.ownsRelic("coin-of-the-first-circle") && lost.loot.relics.length === 0);
}

console.log(`\n${failures === 0 ? "ALL RELIC CHECKS PASSED" : `${failures} RELIC CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
