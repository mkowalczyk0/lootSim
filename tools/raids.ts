/**
 * Raid acceptance test — UAT §15 + §16.
 *
 * §15 and §16 are short and they are mostly promises about *structure*, so each one is
 * asserted here as a check rather than described in a doc:
 *
 *   1. the roster is well-formed, and every raid is a mythological event with its own
 *      arena, encounter, tier ladder and layer
 *   2. **a raid holds a layer's gate** (§23) — asserted from both ends, so a raid and a
 *      layer can never disagree about which of them the other means, and asserted *not*
 *      to gate either ladder
 *   3. the encounter obeys every boss rule in `CLAUDE.md` (the shared audit in
 *      `tools/bossrules.ts`, the same one the Provings are held to), is strictly
 *      cumulative phase to phase, and is harder than the ordinary floor at its own depth
 *   4. **one curve** — a raid floor and a Delve floor at the same effective depth and
 *      danger produce identical enemy numbers, so "balancing the raid" by nudging its own
 *      curve goes red immediately. There is no raid difficulty model
 *   5. §16 — a harder tier pays better on every axis the reward curve has, as a *direct
 *      comparison* rather than a one-sided bound, and the top of a raid's table does not
 *      exist below its `minTier`
 *   6. §15's exclusivity — a raid's items come from that raid and nowhere else, no raid
 *      can pay out another raid's table, and the §20 preview lists exactly what the roll
 *      really produces
 *   7. it works in a live dungeon: the encounter spawns, killing it pays the table, the
 *      cache pays it again, and a Delve boss on the same template pays none of it
 *   8. progression: the tier ladder opens only on a banked clear, survives a save
 *      round-trip, and the unlock only ever widens
 *
 * Headless, no browser. Run with `npm run raids`.
 */

import type { Action, AvatarInput } from "../src/core/input";
import { parseSaved, serializeSave } from "../src/core/save";
import { BOSSES } from "../src/data/bosses";
import { biomeForRun, profileFor } from "../src/data/depth";
import { dropsForSource } from "../src/data/drop-preview";
import { LIVE_SOURCE_KINDS, type DropSource, type FoundSource } from "../src/data/drops";
import { bossSpecForRun } from "../src/data/encounters";
import { LAYERS, layerFor } from "../src/data/layers";
import { MODES, RUN_MODES, delveConfig, riftConfig } from "../src/data/modes";
import { NAMED_ITEMS, rollNamedDrops } from "../src/data/named";
import { previewForRun } from "../src/data/previews";
import {
  RAIDS, RAID_BY_ID, RAID_DAMAGE, RAID_HEALTH, raidBossId, raidBossSpec, raidConfig,
  raidForLayer, raidLayer, raidOfBossId, raidProblems, raidTiersOpen, raidUnlocked,
} from "../src/data/raids";
import { RELICS, rollRelicDrops } from "../src/data/relics";
import { rewardCurve } from "../src/data/rewards";
import { Dungeon, type Hero } from "../src/game/dungeon";
import { GameState } from "../src/game/state";
import { auditSpec } from "./bossrules";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string) {
  console.log(`\n=== ${name} ===`);
}

/** The deepest authored encounter — what a raid's stat line is measured against. */
const REFERENCE = BOSSES[BOSSES.length - 1]!;
/** Every definition in either table that names a raid, with the raid source it names. */
type RaidSource = Extract<FoundSource, { kind: "raid" }>;
const RAID_SOURCED: { id: string; src: RaidSource }[] = [];
for (const def of [...NAMED_ITEMS, ...RELICS] as { id: string; sources: readonly DropSource[] }[]) {
  for (const src of def.sources) {
    if (src.kind === "raid") RAID_SOURCED.push({ id: def.id, src });
  }
}

// =========================================================================
section("1. the roster is well-formed");
{
  check(`there is a roster: ${RAIDS.length} raids`, RAIDS.length >= 2);
  for (const spec of RAIDS) {
    const problems = raidProblems(spec);
    check(`${spec.id}: well-formed`, problems.length === 0, problems.join("; "));
  }
  const ids = RAIDS.map((r) => r.id);
  check("ids are unique", new Set(ids).size === ids.length);
  check("names are unique", new Set(RAIDS.map((r) => r.name)).size === RAIDS.length);
  check("deadpan titles are unique", new Set(RAIDS.map((r) => r.title)).size === RAIDS.length);
  check("every title is written as a sentence",
    RAIDS.every((r) => /[.!?]$/.test(r.title)),
    RAIDS.filter((r) => !/[.!?]$/.test(r.title)).map((r) => r.id).join(", "));
  // A raid is a place, not a reskinned floor: its arena belongs to it.
  check("every raid brings its own arena", new Set(RAIDS.map((r) => r.biome.name)).size === RAIDS.length,
    RAIDS.map((r) => r.biome.name).join(", "));
  check("…and the floor really is made of it",
    RAIDS.every((r) => biomeForRun(raidConfig(r, 1)).name === r.biome.name));
  // Reskinning is the point, but reskinning them all off one body is not.
  check("the encounters are spread across more than one template",
    new Set(RAIDS.map((r) => r.templateId)).size > 1,
    RAIDS.map((r) => r.templateId).join(", "));
  check("every raid says what it is and why it exists, in different words",
    RAIDS.every((r) => r.blurb !== r.lore && r.lore.length > 60));
}

// =========================================================================
section("2. a raid holds a layer's gate (UAT §23), and gates neither ladder");
{
  for (const spec of RAIDS) {
    const layer = raidLayer(spec);
    check(`${spec.id}: names a real layer`, !!layer, spec.layerId);
    check(`…and ${layer?.id ?? "it"} names the raid back`, layer?.raidId === spec.id, layer?.raidId ?? "null");
    check(`…and ${raidForLayer(layer!)?.id ?? "nothing"} is what that layer resolves to`,
      raidForLayer(layer!)?.id === spec.id);
    check(`…and it opens at or past where its layer begins`,
      spec.unlockFrontier >= (layer?.from ?? 1), `${spec.unlockFrontier} vs ${layer?.from}`);
  }
  const claimed = LAYERS.filter((l) => l.raidId !== null);
  check("every layer that claims a raid resolves to one",
    claimed.every((l) => RAID_BY_ID[l.raidId!] !== undefined),
    claimed.filter((l) => !RAID_BY_ID[l.raidId!]).map((l) => l.raidId).join(", "));
  check("no two layers claim the same raid",
    new Set(claimed.map((l) => l.raidId)).size === claimed.length);
  // The half that matters most: `raidId` is a reading, not a lock. Nothing in the
  // simulation reads a layer, and a raid standing at one must not change that — a check
  // that only proved the link existed would stay green if a raid ever started gating the
  // Delve, which is the failure this feature could actually cause.
  const beforeAndAfter = [15, 16, 25, 26, 30, 40].every((d) => {
    const p = profileFor(d, delveConfig(d));
    return p.enemyHealth > 0 && p.layer.from <= d && d <= p.layer.to;
  });
  check("a Delve floor at every layer edge still profiles normally with the raid there", beforeAndAfter);
  check("…and a raid's own layer is read off the raid, not off its depth",
    RAIDS.every((r) => layerFor(raidConfig(r, 1)).id === r.layerId));
  check("…even at a tier whose effective depth lands in a different band",
    layerFor(raidConfig(RAID_BY_ID["the-ferryman"]!, 9)).id === "threshold",
    `depth ${raidConfig(RAID_BY_ID["the-ferryman"]!, 9).depth}`);
}

// =========================================================================
section("3. the encounter obeys the boss rules, and is harder than the floor it stands on");
{
  let total = 0;
  let worst = "";
  for (const spec of RAIDS) {
    const boss = raidBossSpec(spec);
    const violations = auditSpec(boss);
    total += violations.length;
    if (violations.length && !worst) worst = `${spec.id}: ${violations[0]!.rule} — ${violations[0]!.detail}`;
    check(`${spec.name}: ${boss.phases.length} phases, no boss-rule violation`,
      violations.length === 0, violations.map((v) => v.detail).join("; "));
  }
  check("no raid violates a single boss rule", total === 0, worst);

  for (const spec of RAIDS) {
    const boss = raidBossSpec(spec);
    const template = BOSSES.find((b) => b.id === spec.templateId)!;
    // Strictly cumulative, by construction rather than by trust — the same property the
    // Provings are held to, because both are built by the same kind of rebuild.
    let cumulative = true;
    for (let i = 1; i < boss.phases.length; i++) {
      const before = new Set(boss.phases[i - 1]!.abilities);
      if (![...before].every((id) => boss.phases[i]!.abilities.includes(id))) cumulative = false;
    }
    check(`${spec.id}: every phase is a strict superset of the one before it`, cumulative);
    check(`…a final phase was appended, not substituted`,
      boss.phases.length === template.phases.length + 1
      && boss.phases[boss.phases.length - 1]!.name === spec.finalPhase);
    check(`…it reads as itself from the first cast`,
      !!spec.signature[0] && boss.phases[0]!.abilities.includes(spec.signature[0]!),
      boss.phases[0]!.abilities.join(", "));
    check(`…and carries its whole signature from the second`,
      spec.signature.every((id) => boss.phases[1]!.abilities.includes(id)));
    // Measured against the deepest authored encounter, never against the borrowed body —
    // the mistake `data/legends.ts` documents having made and fixed.
    check(`…its stat line is the reference encounter's, not the template's`,
      boss.health === REFERENCE.health * RAID_HEALTH && boss.damage === REFERENCE.damage * RAID_DAMAGE);
    check(`…which is strictly harder than the depth-30 floor`,
      boss.health > REFERENCE.health && boss.damage > REFERENCE.damage,
      `${boss.health.toFixed(0)} hp vs ${REFERENCE.health}`);
    // And harder than the ordinary boss it would otherwise meet at its own depth.
    const ordinary = bossSpecForRun(delveConfig(raidConfig(spec, 1).depth));
    check(`…and than the ${ordinary.name} the same depth would otherwise serve`,
      boss.health > ordinary.health && boss.damage >= ordinary.damage,
      `${boss.health.toFixed(0)} vs ${ordinary.health}`);
    let denser = true;
    for (let i = 0; i < boss.phases.length - 1; i++) {
      const ref = REFERENCE.phases[Math.min(i, REFERENCE.phases.length - 1)]!;
      if (boss.phases[i]!.haste > ref.haste) denser = false;
      if (boss.phases[i]!.addsOnEnter < ref.addsOnEnter) denser = false;
    }
    check(`…and no gentler phase by phase, in casts or in adds`, denser);
  }
  // The boss the run really spawns is the raid's, at every tier.
  check("a raid floor's encounter is the raid's, at every tier",
    RAIDS.every((r) => [1, 3, 9].every((t) => bossSpecForRun(raidConfig(r, t)).id === raidBossId(r.id))));
  check("…and the boss id round-trips back to the raid",
    RAIDS.every((r) => raidOfBossId(raidBossId(r.id))?.id === r.id));
  check("…while an ordinary boss id belongs to no raid",
    BOSSES.every((b) => raidOfBossId(b.id) === null));
}

// =========================================================================
section("4. one curve — a raid is not a second difficulty model");
{
  // Height-for-depth is what `tools/world.ts` pins for the Tower. This is the same
  // property from the other side: a raid floor is a floor, and the only thing its tier
  // does is move `danger`, which every mode moves. If somebody "balances the raid" by
  // giving it its own numbers, this goes red on the first run.
  let same = true;
  let firstDiff = "";
  for (const spec of RAIDS) {
    for (const tier of [1, 2, 5, 9]) {
      const raid = raidConfig(spec, tier);
      // The same effective depth, and the same danger, expressed as an ordinary rift.
      const rp = profileFor(raid.depth, raid);
      const dp = profileFor(raid.depth, { ...delveConfig(raid.depth), danger: raid.danger, bossFloor: true });
      const fields = ["enemyHealth", "enemyDamage", "enemySpeed", "aggression", "telegraph", "recommendedLevel"] as const;
      for (const f of fields) {
        if (rp[f] !== dp[f]) {
          same = false;
          if (!firstDiff) firstDiff = `${spec.id} T${tier} ${f}: ${rp[f]} vs ${dp[f]}`;
        }
      }
    }
  }
  check("a raid floor fights exactly like a Delve floor at the same depth and danger", same, firstDiff);
  check("tier 1 with the dial off is danger 1 — the ladder starts at the baseline",
    RAIDS.every((r) => raidConfig(r, 1).danger === 1));
  check("danger compounds exponentially in the tier, not linearly",
    RAIDS.every((r) => {
      const a = raidConfig(r, 2).danger - raidConfig(r, 1).danger;
      const b = raidConfig(r, 9).danger - raidConfig(r, 8).danger;
      return b > a * 2;
    }));
  check("every raid is one floor, and that floor is the boss",
    RAIDS.every((r) => {
      const c = raidConfig(r, 1);
      return c.bossFloor && c.lastFloor && c.floor === 1 && MODES.raid.floors === 1;
    }));
  check("the Challenger dial still applies on top",
    raidConfig(RAIDS[0]!, 1, 5).danger > raidConfig(RAIDS[0]!, 1, 0).danger);
}

// =========================================================================
section("5. §16 — a harder tier pays better, and the top of the table is gated");
{
  // A comparison, not a bound: the lesson `CLAUDE.md` records from the campaign inversion
  // is that a one-sided threshold proves nothing about a design promise.
  for (const spec of RAIDS) {
    const low = rewardCurve(raidConfig(spec, 1).danger);
    const high = rewardCurve(raidConfig(spec, 9).danger);
    check(`${spec.id}: tier 9 pays better than tier 1 on every reward axis`,
      high.dropChance > low.dropChance && high.dropCount > low.dropCount
      && high.itemPower > low.itemPower && high.variantChance > low.variantChance,
      `chance ${low.dropChance.toFixed(2)}→${high.dropChance.toFixed(2)}, `
      + `power +${low.itemPower}→+${high.itemPower}`);
  }
  // Drop rarity, §16's first bullet, said as the table rather than as a second curve.
  const gated = RAID_SOURCED.filter((r) => r.src.minTier !== undefined);
  check(`some of the raid table is gated behind a tier: ${gated.length} of ${RAID_SOURCED.length}`,
    gated.length > 0 && gated.length < RAID_SOURCED.length);
  for (const spec of RAIDS) {
    const mine = RAID_SOURCED.filter((r) => r.src.raidId === spec.id);
    const open = mine.filter((r) => r.src.minTier === undefined);
    const locked = mine.filter((r) => r.src.minTier !== undefined);
    check(`${spec.id}: has both an opening table and a gated one`,
      open.length > 0 && locked.length > 0, `${open.length} open, ${locked.length} gated`);
    const gate = Math.min(...locked.map((r) => r.src.minTier!));
    const below = new Set(dropsForSource({ kind: "raid", raidId: spec.id, tier: gate - 1 }).map((d) => d.def.id));
    const at = new Set(dropsForSource({ kind: "raid", raidId: spec.id, tier: gate }).map((d) => d.def.id));
    check(`…and tier ${gate} really drops what tier ${gate - 1} cannot`,
      at.size > below.size && [...below].every((id) => at.has(id)),
      `${below.size} → ${at.size}`);
  }
  // What §16 must NOT have done: routed around the rarity cap with a second rarity term.
  check("a raid's rarity lean is the mode's constant, not a second curve keyed on danger",
    profileFor(20, raidConfig(RAIDS[0]!, 1)).rarityBias
    === profileFor(20, raidConfig(RAIDS[0]!, 9)).rarityBias,
    "the tier moves danger; danger never moves rarity");
}

// =========================================================================
section("6. §15's exclusivity — a raid's items are that raid's");
{
  check("every raid has something only it drops", RAIDS.every((spec) =>
    RAID_SOURCED.some((r) => r.src.raidId === spec.id)));
  for (const spec of RAIDS) {
    const named = NAMED_ITEMS.filter((d) => d.sources.some((s) => s.kind === "raid" && s.raidId === spec.id));
    const relics = RELICS.filter((d) => d.sources.some((s) => s.kind === "raid" && s.raidId === spec.id));
    check(`${spec.id}: ${named.length} named items and ${relics.length} relics/artifacts`,
      named.length >= 2 && relics.length >= 2);
    check(`…every one of them comes from this raid and nowhere else`,
      [...named, ...relics].every((d) => d.sources.length === 1 && d.sources[0]!.kind === "raid"),
      [...named, ...relics].filter((d) => d.sources.length !== 1).map((d) => d.id).join(", "));
    check(`…and one relic-tier and one artifact-tier among them`,
      relics.some((d) => d.tier === "relic") && relics.some((d) => d.tier === "artifact"));
  }
  // Cross-contamination is the failure mode a shared template invites: the Tyrant borrows
  // the Choir's kit, and its crown must never fall off the Choir.
  for (const spec of RAIDS) {
    const mine = new Set(dropsForSource({ kind: "raid", raidId: spec.id, tier: 99 }).map((d) => d.def.id));
    const others = RAIDS.filter((r) => r.id !== spec.id).flatMap((r) =>
      dropsForSource({ kind: "raid", raidId: r.id, tier: 99 }).map((d) => d.def.id));
    check(`${spec.id}: no other raid pays out any of its ${mine.size} items`,
      others.every((id) => !mine.has(id)));
    // A `boss` query with the raid's own boss id must not reach the table either — the
    // whole reason `raid` is its own kind rather than a boss source with a mode on it.
    check(`…and its own encounter's boss query pays out none of them either`,
      dropsForSource({ kind: "boss", bossId: raidBossId(spec.id), mode: "raid", tier: 99, depth: 99 })
        .every((d) => !mine.has(d.def.id)));
  }
  check("nothing drops for a raid id that does not exist",
    dropsForSource({ kind: "raid", raidId: "no-such-raid", tier: 99 }).length === 0);
  check("every source kind the union declares is live — the next reserved one is opt-out",
    LIVE_SOURCE_KINDS.includes("raid"));

  // The §20 property, stated here too because a raid is where it is most load-bearing:
  // the tier-gated half of the table is exactly what a stale preview would get wrong.
  const ALWAYS = { chance: () => true };
  for (const spec of RAIDS) {
    for (const tier of [1, 9]) {
      const config = raidConfig(spec, tier);
      const listed = new Set(previewForRun(config).named.map((d) => d.def.id));
      const real = new Set<string>();
      for (const q of [
        { kind: "boss" as const, bossId: raidBossId(spec.id) },
        { kind: "clearCache" as const, depth: config.depth, mode: "raid" as const },
        { kind: "worldDrop" as const, depth: config.depth, elite: true },
        { kind: "raid" as const, raidId: spec.id, tier },
      ]) {
        for (const def of rollNamedDrops(q, ALWAYS, config.danger)) real.add(def.id);
      }
      const missing = [...real].filter((id) => !listed.has(id));
      const invented = [...listed].filter((id) => !real.has(id));
      check(`${spec.id} T${tier}: the preview lists exactly what the roll produces`,
        missing.length === 0 && invented.length === 0,
        `missing [${missing.join(", ")}] invented [${invented.join(", ")}]`);
    }
  }
}

// =========================================================================
section("7. it pays out in a live dungeon");
{
  class IdleInput implements AvatarInput {
    moveVector() { return { x: 0, y: 0 }; }
    wasPressed(_a: Action) { return false; }
    aimAngle() { return null; }
  }
  const IDLE = new IdleInput();
  /** Reaches the private roll sites, with the dice rigged to always hit. */
  const rig = (d: Dungeon) => {
    const priv = d as unknown as {
      killEnemy(e: unknown, by: Hero): void;
      dropClearCache(): void;
      rng: { chance(p: number): boolean };
    };
    priv.rng = new Proxy(priv.rng, {
      get(target, prop, receiver) {
        if (prop === "chance") return () => true;
        const v = Reflect.get(target, prop, receiver);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    return priv;
  };
  const droppedIds = (d: Dungeon) => [
    ...d.pickups.filter((p) => p.kind === "relic").map((p) => p.defId!),
    ...d.pickups.filter((p) => p.kind === "item" && p.item?.named).map((p) => p.item!.named!),
  ];
  const spawnBoss = (d: Dungeon) => { for (let t = 0; t < 900 && !d.boss; t++) d.update(1 / 60, IDLE); return d.boss; };
  const fresh = (seed: number) => {
    const s = new GameState(seed);
    s.chooseClass("swordsman");
    s.player.level = 60; s.player.deepestDepth = 30; s.player.refresh(); s.player.fullHeal();
    return s;
  };

  const spec = RAID_BY_ID["the-ferryman"]!;
  const state = fresh(41);
  const d = new Dungeon(state, raidConfig(spec, 9), 901);
  const boss = spawnBoss(d);
  check("a raid floor spawns the raid's own encounter", boss?.boss?.spec.id === raidBossId(spec.id),
    boss?.boss?.spec.id ?? "none");
  if (boss) {
    const wanted = dropsForSource({ kind: "raid", raidId: spec.id, tier: 9 }).map((m) => m.def.id);
    rig(d).killEnemy(boss, d.localHero);
    const got = droppedIds(d);
    check(`killing it drops every item its table lists (${wanted.length})`,
      wanted.length >= 4 && wanted.every((id) => got.includes(id)), got.join(", ") || "nothing");
  }

  // The cache that closes the raid pays the same table — it is the same floor.
  const cacheState = fresh(42);
  const cache = new Dungeon(cacheState, raidConfig(spec, 9), 902);
  rig(cache).dropClearCache();
  check("the cache that closes the raid pays the raid's table too",
    dropsForSource({ kind: "raid", raidId: spec.id, tier: 9 })
      .every((m) => droppedIds(cache).includes(m.def.id)),
    droppedIds(cache).join(", ") || "nothing");

  // The gate, live: tier 1 must not pay out what tier 1 cannot reach.
  const lowState = fresh(43);
  const low = new Dungeon(lowState, raidConfig(spec, 1), 903);
  const lowBoss = spawnBoss(low);
  if (lowBoss) {
    rig(low).killEnemy(lowBoss, low.localHero);
    const gatedIds = RAID_SOURCED
      .filter((r) => r.src.raidId === spec.id && (r.src.minTier ?? 0) > 1).map((r) => r.id);
    check("a tier-1 kill never pays the gated half of the table",
      gatedIds.length > 0 && gatedIds.every((id) => !droppedIds(low).includes(id)),
      droppedIds(low).join(", ") || "nothing");
  }

  // The comparison that actually matters: the Delve encounter the raid borrowed its kit
  // from pays none of it. A one-sided "the raid pays out" check would stay green even if
  // the raid table had been hung off the shared template's boss id.
  const delveState = fresh(44);
  const delve = new Dungeon(delveState, delveConfig(5), 904);
  const delveBoss = spawnBoss(delve);
  check("the Delve floor that shares the Ferryman's template spawns the Warden",
    delveBoss?.boss?.spec.id === spec.templateId, delveBoss?.boss?.spec.id ?? "none");
  if (delveBoss) {
    rig(delve).killEnemy(delveBoss, delve.localHero);
    const raidIds = new Set(RAID_SOURCED.map((r) => r.id));
    check("…and it drops nothing from any raid's table",
      droppedIds(delve).every((id) => !raidIds.has(id)), droppedIds(delve).join(", "));
  }
  // And the Abyssal Rift, which is the other place artifacts come from, must not either.
  const abyssState = fresh(45);
  const abyss = new Dungeon(abyssState, riftConfig("abyss", 8, MODES.abyss.floors), 905);
  const abyssBoss = spawnBoss(abyss);
  if (abyssBoss) {
    rig(abyss).killEnemy(abyssBoss, abyss.localHero);
    const raidIds = new Set(RAID_SOURCED.map((r) => r.id));
    check("a deep Abyssal Rift boss drops no raid item either",
      droppedIds(abyss).every((id) => !raidIds.has(id)));
  }
  // Rolled directly, so the relic table is exercised as itself rather than through pickups.
  const defIds = rollRelicDrops({ kind: "raid", raidId: spec.id, tier: 9 }, { chance: () => true }, 1)
    .map((r) => r.id);
  check("the relic table answers a raid query on its own",
    defIds.length >= 2, defIds.join(", "));
}

// =========================================================================
section("8. progression — the ladder, the save, and the unlock");
{
  const state = new GameState(51);
  state.chooseClass("swordsman");
  const spec = RAIDS[0]!;
  check("a fresh account has tier 1 of every raid and no more",
    RAIDS.every((r) => raidTiersOpen(r, state.raidProgress) === 1));

  // Only a banked clear of the boss floor opens the next tier. A raid is one floor and
  // that floor is the boss, so there is no intermediate floor to bank — but the check is
  // written against `lastFloor` rather than against the floor count, so a raid that ever
  // grows a second floor cannot open its ladder from the first one.
  state.recordDepth(spec.baseDepth, { ...raidConfig(spec, 1), lastFloor: false });
  check("banking a non-final raid floor opens nothing", raidTiersOpen(spec, state.raidProgress) === 1);
  state.recordDepth(spec.baseDepth, raidConfig(spec, 1));
  check("clearing and banking tier 1 opens tier 2", raidTiersOpen(spec, state.raidProgress) === 2);
  check("…and opens nothing for any other raid",
    RAIDS.filter((r) => r.id !== spec.id).every((r) => raidTiersOpen(r, state.raidProgress) === 1));
  check("…and it counts on the account's own depth record, like every other mode",
    state.stats.deepestDepth >= spec.baseDepth);
  check("…and is counted in the Records", state.stats.riftsCleared.raid === 1);
  state.recordDepth(spec.baseDepth, raidConfig(spec, 1));
  check("re-clearing tier 1 never lowers the ladder", raidTiersOpen(spec, state.raidProgress) === 2);

  const back = GameState.fromSaved(parseSaved(serializeSave(state.toJSON())));
  check("the ladder survives a save round-trip",
    raidTiersOpen(spec, back.raidProgress) === 2
    && RAIDS.filter((r) => r.id !== spec.id).every((r) => raidTiersOpen(r, back.raidProgress) === 1));
  // A save from before raids existed: fresh ladder, nothing lost, nothing crashed.
  const old = state.toJSON() as Record<string, unknown>;
  delete old.raidProgress;
  const back2 = GameState.fromSaved(parseSaved(serializeSave(old)));
  check("a save from before raids loads with every raid at tier 1",
    RAIDS.every((r) => raidTiersOpen(r, back2.raidProgress) === 1));

  // The unlock is a frontier read, and it only ever widens.
  for (const r of RAIDS) {
    check(`${r.id}: sealed below frontier ${r.unlockFrontier}, open at it`,
      !raidUnlocked(r, r.unlockFrontier - 1) && raidUnlocked(r, r.unlockFrontier));
  }
  let widening = true;
  for (let f = 0; f < 60; f++) {
    const openNow = RAIDS.filter((r) => raidUnlocked(r, f)).length;
    const openNext = RAIDS.filter((r) => raidUnlocked(r, f + 1)).length;
    if (openNext < openNow) widening = false;
  }
  check("the roster of open raids only ever widens with the frontier", widening);
  check("every mode still answers where it happens, raids included",
    RUN_MODES.every((id) => MODES[id].lore.length > 0 && MODES[id].blurb.length > 0));
}

console.log(`\n${failures === 0 ? "ALL RAID CHECKS PASSED" : `${failures} RAID CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
