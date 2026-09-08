# Class validation & tuning pass (Task 2)

Per `docs/combat-cutover-plan.md` §4. This is the working ledger for the post-cutover
balance pass: one section per cluster, each carrying **the imbalance, the measured
evidence, the data change, and the re-measured result**. Tuning is data-only — numbers in
`src/progression/<class>.ts`, `src/data/`, `src/combat/` — never logic in the sim. The
goal is a legible 12-axis spread, **not** equal DPS: a tank deals less on purpose, a
support deals less on purpose, a glass cannon is supposed to top the chart.

Measurement tools:
- `npm run arena` — neutral pinned dummies, god-mode hero. Reads sustained ST / 3s burst /
  AoE (total + per-target) dps, ultimate meter-fill time, primary-resource low-water,
  incoming-damage tolerance, plus a static effect-step census. **It systematically
  over-fills every meter** (the driver cast-spams with infinite resources and never
  travels, kites or dies) so the meter column is a *floor*, not a real cadence.
- `npm run builds` — **real delve floors**, a real tree allocation, the build's own skills.
  Three cross-path hybrids plus the Mythic per class, reported as a behaviour fingerprint
  (engage range, movement, ultimate cadence, summon/zone uptime, ailment density, per-skill
  casts) and gated on spec §35. This is the instrument the arena is not: where the two
  disagree, **this one is closer to the game**. Not in `npm test` yet — six classes fail
  §35 legitimately (Cluster 7) and a red gate would be noise until those are decided.
  It also carries the **meter-generation ledger**: for any class no build of which ever
  fills its ultimate meter (or every class, under `BUILDS_GEN=1`) it prints each generation
  rule's offered points per floor, and why a rule offered none — a `requireTags` gate that
  never matched, with the tag sets it actually saw; THE ULTIMATE RULE refusing the credit;
  or an `on:` event the simulation never broadcasts, and — since Cluster 8 — whether a
  `requireTags` rule went unmatched because no ability carries the tag, because only the
  ultimate does, or merely because this build did not equip the ability that does. That is
  the instrument Cluster 5b needed, and it overturned 5b's first guess twice.

⚠ **The smoke campaign baseline moved, and not from this work.** It was 13.8 / 9.4 for most
of this document and is **11.0 / 10.0** from the `master` merge that brought in UAT §2
(six monster roles), §4 (elites as a mini-boss tier) and §5/§6 (the kill quota and two
portals). Verified by measuring the merged tree with the Cluster 8 changes stashed: the
depths were already 11.0 / 10.0 before them. Any table in this document quoting 13.8 / 9.4
predates that merge.
- `npm run roster` — data-shape + unlock-threshold + anti-overlap gates.
- `npm run rules` — the keystone/hybrid/Mythic rule engine does something observable.
- `npm run smoke` — whole floors; the bot plays **Swordsman**, so changes to any other
  class's numbers leave the campaign byte-identical (13.8 / 9.4).

> **Read the arena's numbers with the build harness beside them.** The arena is a
> class-level instrument: no tree, the first three abilities in unlock order, stationary
> dummies. That is fine for a controlled output comparison and actively misleading for
> anything whose value depends on the floor moving — summons, zones, packs, positioning,
> and above all the ultimate meter. Clusters 5–7 below are the corrections.

---

## 12-axis read — `npm run arena`, level 18, geared (keys 14–18), depth-8 dummies

Six axes measured live; the rest read off the static kit census (an arena of stationary
dummies cannot measure "did the escape save you").

| class | ST dps | burst3 | AoE dps | per-tgt | meter s | dmg.in | heal | shld | mit | mob | ctrl | sup | sum | exec |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| juggernaut | 229 | 1413 | 1559 | 260 | 24.8 | 6088 | 0 | 4 | 4 | 1 | 0 | 3 | 0 | 0 |
| paladin | 390 | 1485 | 1478 | 246 | 21.5 | 7800 | 4 | 3 | 1 | 1 | 0 | 5 | 0 | 0 |
| engineer | 431 ‡ | 1478 ‡ | 1471 ‡ | 245 ‡ | 6.7 | 328 ‡ | 0 | 2 | 0 | 0 | 0 | 0 | 5 | 0 |
| corsair | 539 ‡ | 2287 ‡ | 538 ‡ | 90 ‡ | none (90%) | 9581 ‡ | 0 | 0 | 0 | 2 | 1 | 2 | 1 | 0 |
| necromancer | 571 | 1668 | 2467 | 411 | 7.3 | 7276 | 3 | 0 | 1 | 1 | 0 | 0 | 5 | 0 |
| shaman | 596 | 1789 | 1386 | 231 | 41.8 † | 7169 | 1 | 0 | 0 | 0 | 0 | 1 | 4 | 0 |
| lancer | 602 | 2007 | 697 | 116 | none (0%) | 9715 | 0 | 1 | 0 | 6 | 2 | 2 | 0 | 0 |
| berserker | 661 | 2656 | 5436 | 906 | 6.4 | 8674 | 0 | 1 | 1 | 0 | 1 | 6 | 0 | 1 |
| swordsman | 662 | 2527 | 2273 | 379 | 12.5 | 8547 | 0 | 1 | 0 | 2 | 1 | 3 | 0 | 2 |
| duelist | 723 | 2313 | 716 | 119 | 71.2 | 8398 | 0 | 0 | 1 | 2 | 1 | 1 | 0 | 1 |
| monk | 765 | 2112 | 1863 | 311 | 6.5 † | 8118 | 2 | 0 | 0 | 3 | 0 | 8 | 1 | 0 |
| bard | 758 | 2362 | 3004 | 501 | 74.5 | 8840 | 2 | 0 | 0 | 0 | 1 | 9 | 0 | 0 |
| alchemist | 769 | 2570 | 2598 | 433 | 40.6 | 8840 | 2 | 1 | 0 | 0 | 1 | 3 | 0 | 0 |
| ranger | 966 | 1686 | 4667 | 778 | 6.3 | 9248 | 0 | 0 | 0 | 1 | 2 | 2 | 1 | 1 |
| stormcaller | 991 | 2876 | 4676 | 779 | 18.6 | 7076 | 0 | 1 | 0 | 1 | 2 | 0 | 0 | 0 |
| warlock | 1165 | 4719 | 2169 | 362 | **2.7** | 10258 | 1 | 0 | 0 | 0 | 2 | 1 | 0 | 0 |
| trickster | 1219 | 3069 | 1532 | 255 | 36.8 | 8680 | 0 | 0 | 0 | 7 | 0 | 3 | 5 | 1 |
| warden | 1338 | 4766 | 2873 | 479 | 39.0 | 4838 | 1 | 0 | 1 | 1 | 0 | 2 | 1 | 0 |
| assassin | 1433 | 3951 | 2016 | 336 | none (0%) | 8763 | 0 | 0 | 1 | 3 | 0 | 3 | 0 | 3 |
| reaper | 1499 | 3662 | 5814 | 969 | none (0%) | 8844 | 1 | 1 | 0 | 3 | 2 | 0 | 1 | 3 |
| magician | 2463 | 7137 | 4390 | 732 | 17.1 | 8844 | 1 | 0 | 0 | 1 | 2 | 2 | 1 | 1 |

`dmg.in` = total damage absorbed over the 120 s fair fight (lower = tankier / better
sustain). `meter s` = seconds to a full ultimate meter with it held. **†** = post-Cluster-1
value (monk / shaman meter rates retuned; monk's AoE/burst columns fell because the arena
no longer credits it with a near-constant free ultimate — see Cluster 1). **‡** =
post-Cluster-2 value (corsair / engineer damage-floor pass — see Cluster 2; engineer's
`dmg.in` 328 is a body-block artifact, its AoE is understated by the arena's 3-ability
loadout, and a real read of both waits on the build harness).

### What the table says (healthy)

- **ST span** is ~230 (juggernaut) … ~1500 (reaper) for non-casters, ~2500 for the top
  caster (magician). A ~6–10× spread with tanks and supports at the floor **on purpose**.
- **AoE identity reads**: berserker (5436 / 906 per-tgt — Whirlwind), reaper (5814 / 969),
  ranger (4667), stormcaller (4676) are the AoE classes; duelist (716) and corsair (455)
  are the single-target duelists. Correct.
- **Burst identity**: warlock 4719 and magician 7137 in 3 s are the nukes; monk's burst
  (2564) is *below* its sustained — it ramps, as designed.
- **Durability**: warden (4838) and engineer (4031) took the least; magician (11928) and
  warlock (10258) the most. Squishy casters, tanky bruisers — correct.
- **Census**: bard sup 9, monk sup 8, lancer mob 6, trickster mob 7 + sum 5, juggernaut
  shld 4 + mit 4, paladin heal 4 + shld 3, reaper/assassin exec 3. Every identity has a
  column that spikes for it.

### Meter-fill triage — **superseded by the real-play column; see Cluster 5**

The original triage read the arena's `meter s` alone, on the assumption it over-fills 2–3×
so that a 20–90 s arena reading is in band and a "none" is probably a harness artifact.
`npm run builds` now gives the real number, and **the assumption was wrong in both
directions.** The table is kept with the real-play column added because the *pattern* of
error is the useful part: the arena mis-reads exactly the rules whose trigger the floor
supplies and the dummies do not.

| class | arena | real (first full / per min) | verdict |
|---|--:|--:|---|
| lancer | none | **2 s / 48.9** | ⚠ **the arena was maximally wrong.** `on: "move", 0.6/unit` against `max: 100`, and real movement is 305–358 units/s → ~190 points/s. Fires every 1.2 s. Cluster 5. |
| engineer | 6.7 s | **2 s / 9.3** | ⚠ **real, and worse than the arena said.** Cluster 5. |
| warlock | 2.7 s | 9 s / 5.9 | fast but not alarming — the Cluster 1 *hold* was the right call. Cluster 5 watch-list. |
| necromancer | 7.3 s | 7 s / 4.5 | real, mildly fast. Cluster 5 watch-list. |
| shaman | 41.8 s † | 8 s / 3.4 | Cluster 1 read it as "now in band" off the arena; real play is 8 s. Re-open in Cluster 5. |
| monk | 6.5 s † | 11 s / 3.7 | Cluster 1's projection (≈15–20 s real) was close. Bottom of band, as intended. |
| ranger | 6.3 s | 11 s / 3.8 | the arena's `< 20 s` flag was roughly right. Fine. |
| berserker | 6.4 s | 20 s / 0.9 | **arena artifact confirmed** — real play is in band. No change. |
| swordsman / magician / juggernaut / alchemist | 12–41 s | 13–32 s | in band. |
| corsair | none (90%) | 47 s / 0.3 | fills, slowly. Consistent with Corsair being the weakest class in real play (Cluster 6). |
| reaper / assassin / trickster | none | **never** | the "harness artifact" verdict was **wrong** — these do not fill in real play either. Cluster 5. |
| duelist / bard / paladin / stormcaller / warden | none / 39–75 s | **never** | ⚠ five more classes whose ultimate never becomes available on a real floor. Cluster 5. |

---

## Cluster 1 — meter-fill outliers: monk (too fast) / shaman (too slow) — **APPLIED** (commit pending)

### monk — Heavenly Fist fills in 1.2 s (arena), ≈ 25–90 s wanted

**Imbalance.** `MONK_ULTIMATE_METER.generation` is
`[{ on: "hitDealt", amount: 3, requireTags: ["melee"] }, { on: "skillUse", amount: 4 }]`.
`hitDealt` fires on *every* landed melee hit — several per second, and Seven-Point Combo
lands multiples per press. At `amount: 3` and `max: 100` a monk needs ~34 connects, which
the arena reaches in just over a second. Every other per-hit charge on the roster is
gated to a *slow* attack (berserker `["heavy"]` 1.5) or a *projectile* (ranger
`["projectile"]` 4); monk is the only class charging a chunky flat amount on raw
`hitDealt`. Monk's own Chi pool charges the same event at `amount: 0.5` — the ultimate is
6× that on the identical trigger.

**Why the fantasy still allows per-hit charging.** The spec comment is explicit —
"earned by *not breaking rhythm* — an unbroken chain of connects, never a kill." So the
trigger is right; only the rate is wrong.

**Proposed change** (`src/progression/monk.ts`):
`hitDealt` amount `3 → 0.5` (matches the Chi rate on the same event), `skillUse`
`4 → 3`. Projected arena fill ~8–10 s → ~25–30 s real once the arena's 2–3× over-fill is
discounted, i.e. bottom of the 20–90 s band, which fits a class whose whole loop is
*keep hitting things without stopping*.

### shaman — Spirit World fills in 111.6 s (arena), ≈ 45–70 s wanted

**Imbalance.** `SHAMAN_ULTIMATE_METER.generation` is
`[{ on: "ailmentInflicted", amount: 4 }, { on: "statusApplied", amount: 2 }]`. The shaman
is the roster's designated ailment-spreader (withering, poison, curse, hex-links from the
Witch Doctor path) and *still* takes nearly two minutes in a target-rich fair fight —
worse than every support. The `statusApplied` wiring only started firing in Stage 11, so
this rule has never actually been paced.

**Why not a harness artifact.** Unlike lancer/reaper/assassin, the shaman's trigger
(`ailmentInflicted`) fires constantly in the arena — the number is real, just low.

**Proposed change** (`src/progression/shaman.ts`):
`ailmentInflicted` amount `4 → 10`, `statusApplied` `2 → 5`. ~2.5× the rate → ~45 s
arena, comfortably inside the band, and it leans the meter into the class's actual
identity (the more you spread, the sooner the totems come). Re-measure; if it lands under
~35 s arena, walk `ailmentInflicted` back toward 8.

### warlock — Damnation fills in 2.7 s (arena) — **monitor, propose only if it survives the build harness**

`ailmentInflicted: 3` is exactly the ranger/alchemist rate (6 s / 40 s in the arena); the
2.7 s is warlock spreading hex to four dummies at once every cast. Stage 11 already halved
its `damageDealt` loop (0.3 → 0.03). A fast Damnation is not obviously wrong for a glass
caster whose fantasy is inevitability. **Hold** until the build-differentiation harness
gives a single-target real-play number.

### Result (applied)

Two data edits, nothing else:

| file | field | before | after |
|---|---|--:|--:|
| `src/progression/monk.ts` `MONK_ULTIMATE_METER.generation` | `hitDealt` amount | 3 | **0.5** |
| | `skillUse` amount | 4 | **3** |
| `src/progression/shaman.ts` `SHAMAN_ULTIMATE_METER.generation` | `ailmentInflicted` amount | 4 | **10** |
| | `statusApplied` amount | 2 | **5** |

`npm run arena` `meter s` deltas:

| class | before | after | band (arena, discounted 2–3×) |
|---|--:|--:|---|
| monk | **1.2 s** | **6.5 s** | ≈ 15–20 s real — bottom of the 20–90 s band, as intended for a no-stop rhythm loop |
| shaman | **111.6 s** | **41.8 s** | comfortably inside; leans the meter into the spread-affliction identity |
| warlock | 2.7 s | 2.7 s | held — unchanged, revisit with the build harness |

No other class's `meter s` moved. Monk's arena AoE/burst columns dropped (3275→1863 AoE,
2564→2112 burst3) as a *side effect* — the arena is no longer crediting monk with a
near-constant free ultimate during the measurement window, so these numbers are now more
representative, not a regression. Monk sustained ST is unchanged (758→765).

`npm test` green. Smoke campaign **13.8 / 9.4 byte-identical** (bot plays Swordsman, so
monk/shaman edits can't move it — the check confirms nothing shared shifted).

---

## Cluster 3 — summon curve scaling — **INVESTIGATED, retracted; no change**

The original plan flagged "necromancer L50/L3 ratio ≈ 3.0× vs a 5–7× norm — minions
inherit a fixed fraction of owner attack and don't ride the gear curve." That number came
from a `scratchpad/curve.ts` that no longer exists; **it does not reproduce.**

Fresh measurement — `scratchpad/curve.ts` (rebuilt) plus the arena run at L3 and L50 via
the new `ARENA_LEVEL` / `ARENA_KEYS` env overrides on `tools/arena.ts`:

| class | ST L3 | ST L18 | ST L50 | **L50/L3** | AoE L50/L3 |
|---|--:|--:|--:|--:|--:|
| swordsman (no pets, baseline) | 309 | 662 | 1448 | 4.7 | 4.1 |
| magician | 879 | 2463 | 4354 | 5.0 | 5.6 |
| ranger | 575 | 966 | 2422 | 4.2 | 3.7 |
| trickster | 480 | 1219 | 1910 | 4.0 | 5.9 |
| reaper | 630 | 1499 | 2023 | 3.2 | 4.7 |
| **necromancer** | 233 | 571 | 1245 | **5.3** | **6.4** |
| **engineer** | 202 | 395 | 1115 | **5.5** | 5.6 |

`spawnMinion` sets `power = attackDamage * inherit`, and `attackDamage` itself scales
~6× L3→L50 for a caster (the probe: necro `attackDamage` 45 → 290, 6.4×). So minions **do**
ride the curve. Necromancer's ST ratio (5.3) and AoE ratio (6.4) are dead centre of the
roster. Engineer's (5.5) is fine too. The shallow-curve classes are actually **reaper**
(3.2) and **trickster** (4.0) — both front-loaded (high L3 base attack) and both
top-quartile at L18, i.e. working as designed, not broken.

**Conclusion:** there is no summon-scaling bug. The `attack + spell` blend is **not**
applied — it would have buffed every summoner (magician mirror images, monk afterimage,
reaper wraiths…) to fix a problem that isn't there. `MINION_DEFAULT_INHERIT` and the
per-ability `inheritPower` values stay as-is.

**Kept from this investigation:** `tools/arena.ts` now honours `ARENA_LEVEL` / `ARENA_KEYS`
(default 18 / 14–18 unchanged), and `scratchpad/curve.ts` is a reusable L3/L18/L50
attack-vs-spell probe. The real finding — **engineer is genuinely bottom on ST *and* AoE
at every level** (395 / 1384 at L18, last on both) with only `sum 5` to justify it —
folds into Cluster 2 below.

---

## Cluster 2 — bottom-quartile damage with no identity to pay for it: Corsair + Engineer — **APPLIED** (commit pending)

Both are last-or-near-last on ST *and* AoE at every level and neither has a defensive /
support / control census column that spikes to justify sitting there. This is the
"legible 12-axis spread" failing in the other direction — a tank at the damage floor is
correct; a skirmisher and a summoner at the damage floor with no compensating axis is not.

B-4 is now wired (Batch 6, `docs/rule-coverage.md`), so the keystones are no longer inert —
but `tools/arena.ts`'s `geared()` allocates **no tree**, so the 12-axis table measures the
bare class kit either way. The numbers below are the bare-kit floor the tuning has to lift;
the keystones then build on top of a kit that isn't starting underwater.

### Corsair — ST 458 (20th of 21), AoE 455 / 76 per-tgt (21st), burst3 1775 (19th)

**Imbalance.** Corsair is a single-target skirmisher — the same profile as Duelist
(ST 723 / burst 2313 / AoE 716). It sits ~35–40% below Duelist on every damage axis while
its identity census (`heal 0 / shld 0 / mit 0 / mob 2 / ctrl 1 / sup 2 / sum 1 / exec 0`)
is *also* thinner than Duelist's (which additionally has the `one_opponent` near-immunity
keystone). It is strictly dominated: a weaker duelist with a weaker toolkit.

Root causes, all data:
- Base block (`src/data/classes.ts` `corsair.base`) carries **no crit stat** —
  `attackSpeed: 0.06, moveSpeed: 0.07, lifeOnHit: 1`. Every other blade skirmisher
  (duelist, assassin, swordsman) starts with `critChance`/`critDamage`/`attackSpeed`.
- The two single-target damage skills roll low multipliers:
  `corsair.boarding_cut` `1.3` + `1.6`-on-hooked, `corsair.ricochet_shot` `1.1`.
- Four of the ten abilities (`hookshot`, `chain_drag`, `dirty_trick`, `plunder`) deal
  **zero** damage, so `autoSlotNewAbilities` fills the arena's four skill slots with a
  lower average damage-per-slot than a class whose kit is mostly attacks.

**Change applied** (data only — `src/data/classes.ts`, `src/progression/corsair.ts`):

| file · field | before | after | why |
|---|--:|--:|---|
| `classes.ts` `corsair.base.attackSpeed` | 0.06 | **0.09** | brings the basic-attack cadence to skirmisher tier |
| `classes.ts` `corsair.base` add `critChance` | — | **0.06** | a pistol-and-cutlass duelist should crit; matches the archetype |
| `classes.ts` `corsair.base` add `critDamage` | — | **0.12** | matches Duelist's base; the crit needs to be worth landing |
| `corsair.ts` `CORSAIR_BOARDING_CUT` base hit | 1.3 | **1.9** | the bread-and-butter melee, and it's gated behind a Hookshot setup |
| `corsair.ts` `CORSAIR_BOARDING_CUT` hooked bonus | 1.6 | **2.4** | rewards the hook→cut combo the class is built around |
| `corsair.ts` `CORSAIR_RICOCHET_SHOT` base | 1.1 | **1.5** | the ranged single-target option |
| `corsair.ts` `CORSAIR_GRAPPLE_SWING` damage | 1.4 | **1.8** | the mobility-attack |

**Left alone on purpose:** `corsair.powder_keg` (2.4) and the AoE column generally — a
low AoE number *is* the single-target-duelist identity, same call as Duelist (716) and the
reason not to touch either one's AoE.

**Projected:** ST 458 → ~640–680 (Duelist tier, correct for the shared profile), AoE
roughly flat (~500), burst3 → ~2200. Identity spread unchanged.

### Engineer — ST 395 (21st), AoE 1384 (21st), burst3 1330 (21st), per-tgt 231

**Imbalance.** Engineer is a summoner (`sum 5`, tied for the roster's highest) and is
*supposed* to deal little personally — that part is correct and stays. What is not
correct: it is last on **AoE**, where the other `sum 5` class (Necromancer) sits at 2467,
and last on burst and per-target too, with only `shld 2` besides `sum 5` to show for it.
A turret-and-mortar summoner filling a room should read as a mid-pack AoE class; right now
the constructs simply don't put enough on the floor. It also took the least damage of any
class (`dmg.in 4031`) — it hangs back correctly, but it's paying the squishy-caster
durability price of a glass cannon while dealing a tank's damage.

Root causes, all data (the L3→L50 *curve* is healthy at 5.5× — Cluster 3 — so this is an
absolute-level fix via per-ability numbers and the base block, **not** `MINION_DEFAULT_INHERIT`
or the attack+spell blend, both of which stay retracted):
- `engineer.auto_turret` summons **one** turret at `inheritPower 0.6`.
- `engineer.mortar_pod` zone `base 1.4`, `inheritPower 0.7`.
- `engineer.shock_mine` `base 1.0`; `engineer.remote_detonation` `2.4` + `2.0`-on-tagged.
- `classes.ts` `engineer.base.attack` **8** with `growth.attack` **1.9** — lowest base
  *and* lowest growth on the board, so both the Engineer and everything it builds (turrets
  inherit owner `attackDamage`) start from the lowest number in the game.

**Change applied** (data only — `src/data/classes.ts`, `src/progression/engineer.ts`).
`AUTO_TURRET` `count` was **held at 1** — a first pass to 2 turrets dropped engineer's
fair-fight `dmg.in` to ~260 because two construct bodies body-block the arena's stationary
dummies wholesale; the single stronger turret is the same idea without that artifact.

| file · field | before | after | why |
|---|--:|--:|---|
| `classes.ts` `engineer.base.attack` | 8 | **9** | lifts the Engineer and every construct at once; still bottom-3 |
| `classes.ts` `engineer.growth.attack` | 1.9 | **2.05** | the construct floor shouldn't fall further behind with level |
| `engineer.ts` `ENGINEER_AUTO_TURRET` `inheritPower` | 0.6 | **0.72** | turret bite (count held at 1) |
| `engineer.ts` `ENGINEER_MORTAR_POD` zone `base` | 1.4 | **2.4** | the sustained-AoE anchor |
| `engineer.ts` `ENGINEER_MORTAR_POD` zone `radius` | 100 | **120** | a pod that "lobs shells at an area" should own a real footprint |
| `engineer.ts` `ENGINEER_MORTAR_POD` `inheritPower` | 0.7 | **0.8** | — |
| `engineer.ts` `ENGINEER_SHOCK_MINE` damage `base` | 1.0 | **1.5** | the burst-AoE / CC option |
| `engineer.ts` `ENGINEER_REMOTE_DETONATION` base | 2.4 | **3.0** | the payoff button |
| `engineer.ts` `ENGINEER_REMOTE_DETONATION` tagged follow-up | 2.0 | **2.6** | rewards the Tagged setup |

**Left alone on purpose:** personal basic-attack multipliers and every non-construct
skill — the Engineer *should* stay near the ST floor (a summoner's ST identity).

### Result (applied)

`npm run arena` deltas (all other 20 class rows **byte-identical** to the 12-axis table —
every edit is class-file-local or a per-class `classes.ts` block):

| class | ST | burst3 | AoE | per-tgt | dmg.in | meter |
|---|--:|--:|--:|--:|--:|--:|
| corsair | 458 → **539** | 1775 → **2287** | 455 → **538** | 76 → **90** | 9447 → 9581 | none (90%) → none (90%) |
| engineer | 395 → **431** | 1330 → **1478** | 1384 → **1471** | 231 → **245** | 4031 → **328** † | 6.7 → 6.7 |

**Corsair — landed clean.** ST +18% (still below Duelist's 723, correct for a class that
also skirmishes and displaces), burst +29% off the base crit, AoE essentially flat. It is
off the absolute ST floor (was 20th, now mid-low) with its identity census unchanged. This
one is done.

**Engineer — smaller than projected, and the arena can't score the rest.** `tools/arena.ts`
slots only a class's **first three** abilities (`ABILITY_UNLOCK_LEVELS` order →
`autoSlotNewAbilities`), which for the Engineer is `auto_turret / mortar_pod / repair_drone`.
So of the buffs above, only `base.attack`, the turret and the mortar are in the measured
loadout — `shock_mine` and `remote_detonation` (both real AoE a levelling player equips)
never fire in the run. Measured ST is +9%; measured AoE moved almost not at all (+6%) and
was **insensitive to a 70% mortar-zone buff**, which means the AoE number is dominated by
the ultimate in that 30 s window, not the constructs. **†** `dmg.in` 4031 → 328 is a
body-block artifact: a stronger single turret now holds the four stationary fair-fight
dummies for the full 120 s. It is not a real durability change and it is exaggerated by
dummies that never reposition.

**Conclusion at the time:** the Corsair fix is complete and verified. The Engineer buffs
are directionally right and the ST gain is real, but whether they are *enough* cannot be
judged from the arena; a second Engineer pass is gated on the build-differentiation
harness.

### ⚠ Correction — the Engineer half was pointed the wrong way

`npm run builds` (the harness that gate named) now exists, and it reverses the Engineer
premise entirely. On real depth-9 floors:

| class | dps | dmg taken /s | floors cleared | ult / min |
|---|--:|--:|--:|--:|
| **engineer** (3 hybrids + Mythic) | **1473 – 1785** | **2 – 5** | **3/3** | 7.9 – 11.6 |
| necromancer (hybrids) | 2235 – 2545 | 10 – 13 | 3/3 | 4.4 – 5.6 |
| *median class* | ~600 | ~18 | 3/3 | ~2 |
| corsair | 240 – 336 | 35 – 36 | **0–1/3** | 0.3 – 0.5 |
| duelist | 143 – 206 | 29 – 45 | **0–1/3** | 0 |

The Engineer is not the weakest class on the board. It clears floors **twice as fast as
the median** while taking **a quarter of the damage of anything else**, and it does that
because its constructs work exactly as designed the moment there are real monsters walking
into them — which is the one thing an arena of pinned dummies cannot show. The arena's
"last on every damage axis" was an artifact of measuring a summoner with nothing to summon
against.

So the Cluster 2 Engineer change (`base.attack 8→9`, `growth 1.9→2.05`, turret/mortar/mine/
detonation numbers) **buffed a class that was already top-tier**. → **Reverted in full;
see Cluster 6a for the measured before/after and the refined verdict** (the Engineer's
outlier axis is durability, 3.2 taken/s against a roster median of 17.8, and that is the
class's stated identity rather than something to tune out).

The **Corsair** half stands, but "stands" now needs a caveat the arena could not give it:
it is still 20th of 21 in real play, dying on two floors in three and eating double the
median's incoming damage, *after* the buff the arena signed off as landing. Recorded as
Cluster 6b.

**What this says about the method, not just the numbers:** the arena's `sum 5` census column
told us the Engineer was a summoner, and its damage columns told us summoners are weak. The
first was data about the kit; the second was an artifact of the instrument. A census column
that spikes is *not* evidence that the identity is paying off — only a real floor is.

`npm test` green. `npm run smoke` campaign **13.8 / 9.4 byte-identical** (bot plays
Swordsman). `npm run roster` green.

---

## Cluster 5 — the ultimate meter is broken at both ends in real play — **PROPOSED**

Evidence: the `real (first full / per min)` column in the triage table above, from
`npm run builds` — three depth-9 floors per build, four builds per class, ultimates counted
by the meter actually draining rather than by the button being pressed.

Two failures, and they are not the ones the arena reported.

### 5a. Lancer fires an ultimate every 1.2 seconds

**Imbalance.** `LANCER_ULTIMATE_METER.generation` is
`[{ on: "move", amount: 0.6, perUnit: "distance" }, { on: "hitDealt", amount: 6, requireTags: ["charge"] }]`
against `max: 100`. The Lancer's measured real-play movement is **305–358 world units per
second** — it is the roster's mobility class (`mob 6`, the highest census) and it dashes
constantly. At 0.6 per unit that is **~190 meter points per second**: the bar refills
almost twice over every second, and the harness measures **43–54 ultimate casts per
minute** across all four builds.

**Why the arena missed it, in the exact opposite direction.** The arena reported `none (0%)`
and the original triage called it a harness artifact because "the driver only strafes a
40 px orbit." That diagnosis of the *cause* was right and the inference was backwards: a
40 px orbit accumulates almost no net distance, so the arena starved a rule that the real
game floods. Comet Charge is supposed to be the Lancer's identity moment; at one cast per
1.2 s it is the Lancer's basic attack.

**Proposed change** (`src/progression/lancer.ts`): `on: "move"` amount `0.6 → 0.03`
(≈20× down, giving ~9.6 points/s at measured movement → ~10 s of pure running, and less in
practice because a Lancer that is running is not hitting). Leave the `hitDealt`/`charge`
term at 6 — earning the meter by committing to a charge is the rule that says something
about the class, and it should become the dominant term rather than a rounding error next
to walking.

### 5b. Eight of twenty-one classes never fill their meter on a real floor — **Cause A APPLIED, Cause B still proposed**

**duelist, trickster, reaper, stormcaller, paladin, bard, assassin, warden** — none of them
reached a full meter in any of twelve floors each. Three of those (reaper, assassin,
trickster) were previously written off as arena artifacts on the grounds that they charge
on execute / mark / poison and the dummies were full-health and unmarked. **That was wrong**:
they do not fill in real play either.

The first draft of this entry guessed at a shared cause and said "do not tune these eight
blind; instrument first." That instrumentation now exists (`tools/builds.ts`, printed
automatically for any class no build of which ever fills, or for all 21 under
`BUILDS_GEN=1`). It wraps `ResourceSet.broadcast` for the watched hero and re-walks the
meter's own generation rules against every event using the same three primitives the pool
uses — `isUltimateSourced`, `hasAnyTag`, and a copy of `ruleAmount` — so the verdict cannot
drift from the real gate. Nothing in `src/` is touched: a measurement tool that needs a
debug hook inside the simulation would be a change to the thing it is measuring.

Points are reported **per floor** (the meter starts empty on every floor) and **as
offered**, before the pool clips at max — a rule offering zero is the finding.

The guess was wrong. It is not one systemic cause, it is **two, and they need opposite
fixes**:

**Cause A — four rules match nothing. ⚠ The first diagnosis of this was wrong, and it
was wrong in the direction that would have caused damage.**

That draft said: *"No ability in any of those four classes carries the tag its own meter
asks for"*, and proposed tagging the abilities. **That claim is false.** `barrier` is on
three Paladin abilities, `mark` on three Assassin ones, `terrain` on two Warden ones, and
`support` on nine of the Bard's ten. Adding tags would have been a real balance change
made to fix a bug that wasn't there.

What the four cases actually are, once the report can tell them apart, is **two real data
bugs and two harness artifacts**:

| class | rule | matches | actual cause |
|---|---|--:|---|
| bard | `on statusApplied 2 [support]` | 0 / 90 | **data bug** — disjoint sets |
| assassin | `on hitDealt 3 [mark]` | 0 / 1320 | **data bug** — only the ultimate could feed it |
| paladin | `on skillUse 2 [barrier]` | 0 / 162 | not a bug — `[barrier]` is on `guardians_oath`, `shield_of_faith`, and the harness equips neither |
| warden | `on skillUse 6 [terrain]` | 0 / 171 | not a bug — `[terrain]` is on `living_wall`, which the harness does not equip |

**The Bard's rule asked for the intersection of two disjoint sets.** `statusApplied` is
broadcast at exactly one place (`runtime.ts`, the `status` effect step) and only when
`victim.faction !== caster.faction` — a *hostile* status placed on an enemy, which the
comment there says outright. Every `support`-tagged thing the Bard does buffs an ally. No
amount of tagging could ever have made that fire.

**The Assassin's rule could only be fed by the thing it pays for.** `requireTags` matches
the *ability's* tags, and of its three `mark`-tagged abilities, Mark for Death and Expose
Weakness deal no damage at all — so the only one that ever produces a `hitDealt` is
`contract_fulfilled`, the ultimate, which THE ULTIMATE RULE refuses by design. The rule was
unfeedable in principle, not merely unfed.

**Applied, data only.** One field each, both re-keyed onto the event the class's own
abilities actually produce — and for the Assassin, onto the exact `on`/`requireTags` pair
the author already uses successfully elsewhere in the same file (the Saboteur path's
"Inside Job" node feeds the Shadow pool with `{ on: "statusApplied", requireTags: ["mark"] }`):

| class | before | after | measured |
|---|---|---|--:|
| bard | `on: "statusApplied"` | `on: "skillUse"` | 0 → **0.10 bars/floor** |
| assassin | `on: "hitDealt"` | `on: "statusApplied"` | 0 → **3 pts per Mark** ‡ |

‡ still 0 in the harness, because `equipForBuild` does not equip a mark either — so this
one is proven by a `npm run rules` check that casts Mark for Death and watches the Contract
meter move, rather than by the fingerprint table.

**Paladin and Warden get no change.** Their rules are correct data describing the class's
identity ("Conviction is earned by shielding", "the Grove is earned by claiming ground");
they read as dead only because the harness's skill picker ranks on damage output and so
never equips a pure-utility barrier or terrain skill. Changing a number to satisfy a
measurement artifact is exactly the mistake Cluster 6a had to revert, so the fix belongs in
the harness (Cluster 7), not in the data.

**The tool now cannot make this mistake again.** The generation ledger distinguishes the
three readings by checking the class's own ability list, and prints which it is:

```
paladin  on skillUse 2 [barrier]   0 pts  —  not in this loadout — [barrier] is on guardians_oath, shield_of_faith
assassin on statusApplied 3 [mark] 0 pts  —  not in this loadout — [mark] is on mark_for_death, expose_weakness
```

…versus `NO ABILITY CARRIES [x] — dead rule` and `only the ultimate carries [x] —
unfeedable under THE ULTIMATE RULE` for the two readings that are genuine bugs.

**Cause B — the rule fires exactly as designed and the amount is far too small.**
Per floor, in bars:

| class | working rule | offered | second rule | total |
|---|---|--:|---|--:|
| warden | `skillUse 4 [nature]` | 0.73 | `[terrain]` not equipped | **0.73** |
| stormcaller | `hitDealt 1.2 [lightning]` | 0.51 | `ailmentInflicted 2` 0.15 | **0.66** |
| reaper | `kill 8 [execute]` | 0.38 | `hitDealt 2 [execute]` 0.10 | **0.48** |
| bard | `skillUse 5` | 0.42 | `skillUse 2 [support]` 0.10 † | **0.52** |
| duelist | `dodge 8` | 0.27 | `block 10` 0.18 | **0.45** |
| trickster | `skillUse 6 [illusion]` | 0.26 | `dodge 6` 0.10 | **0.36** |
| paladin | `damagePrevented 40 ×maxHealthFraction` | 0.21 | `[barrier]` not equipped | **0.21** |
| assassin | `ailmentInflicted 2 [poison]` | 0.10 | `[mark]` not equipped | **0.10** |

Every one of the eight lands between **0.17 and 0.74 bars per floor** — i.e. all of them
are short by a factor of 1.4× to 6×, and none of them is short by 50×. That is a
consistent, small, tunable gap, and it says the generation *model* is right and the
amounts were sized against a longer fight than a floor actually is.

**The Duelist is the exception and needs a different answer.** Its meter is fed *only* by
`dodge` and `block`, which are passive procs off `evasion: 0.10` / `blockChance: 0.06` —
and the harness measures **3 dodges and 1 block per floor**. At 8 and 10 points, filling a
100-point bar needs eleven such events. No amount that respects the design note ("earned by
countering — an attack read and punished, never a kill") fixes a rule whose event fires four
times, unless the amounts go to roughly `dodge 22 / block 26`. That is the proposal; the
alternative (raising evasion/blockChance until the procs are common) would rewrite the
class's whole defensive profile to fix its meter, which is the wrong lever.

⚠ **Hold the Duelist amounts until the harness can play one.** Cluster 8 found that none
of the Duelist's three builds equips `riposte`, which is where all three of its reactives
live — so "3 dodges and 1 block per floor" is measured off a bot that never presses the
class's defining skill. A build that actually ripostes takes hits on purpose, and the
dodge/block rate the amounts should be sized against is not the rate measured here.

† Cause A applied. The rest of this table is **still proposed and not applied**: scale
each working rule so a floor's worth of play fills roughly one bar and a long floor fills
two. It should be re-measured before it is sized, for two reasons that both moved the
baseline after these numbers were taken — Cause A added generation to two of the eight, and
Cluster 8 made four of these classes clear a floor 5–8 seconds faster, which shortens the
window the amounts are being sized against.

Cluster 1's shaman fix should be re-opened in the same pass: it was declared "now in band"
on an arena reading of 41.8 s, and real play is 8 s.

---

## Cluster 6 — arena-vs-real-play rank inversions — **6a APPLIED, 6b/6c PROPOSED**

The arena's damage ranking and the real-floor ranking disagree badly enough that the
12-axis table cannot be used on its own to decide who needs help.

| class | arena ST rank | real-play dps | real-play verdict |
|---|--:|--:|---|
| engineer | 21st (last) | 1473–1785, 2–5 taken/s, 3/3 | **top tier** — see the Cluster 2 correction |
| necromancer | 15th | 2235–2545 | **top tier** |
| duelist | 7th (723) | **143–206**, 0–1/3 cleared | **bottom** — the arena flattered it enormously |
| corsair | 20th | **240–336**, 0–1/3 cleared | bottom, consistent |

### 6a. Revert the Engineer half of Cluster 2 — **APPLIED**

`base.attack 9 → 8`, `growth.attack 2.05 → 1.9`, and every ability number back to its
pre-Cluster-2 value: Auto-Turret `inheritPower 0.72 → 0.6`; Mortar Pod `inheritPower
0.8 → 0.7`, zone `base 2.4 → 1.4`, `radius 120 → 100`; Shock Mine `1.5 → 1.0`; Remote
Detonation `3.0 → 2.4` and its tagged follow-up `2.6 → 2.0`.

Measured effect — only the four Engineer rows moved, every other class's fingerprint
byte-identical:

| build | dps before → after | clear before → after | taken/s |
|---|--:|--:|--:|
| Killbox | 1514 → **1261** | 22 s → 22 s | 2 → 4 |
| Forward Base | 1473 → **945** | 20 s → 25 s | 5 → 2 |
| Autonomous Army | 1591 → **1247** | 21 s → 21 s | 2 → 5 |
| The Foundry ★ | 1785 → **1337** | 19 s → 22 s | 2 → 2 |

**And a refinement of the finding that prompted it.** After the revert the Engineer is
5th of 21 on damage (mean 1198 against a roster median of 730) and still clears in 22 s
against a median of 34 s — but the axis it is genuinely an outlier on is neither:

| | engineer | roster median | next-safest class |
|---|--:|--:|--:|
| damage taken / sec | **3.2** | 17.8 | stormcaller, 8.2 |

Taking a fifth of the median's damage is not an accident to be tuned out. "Does very
little personally. By the time the fight is a minute old there is a turret, a wall and a
mine doing it instead" is the class blurb, and a builder that stands behind its machines
belongs at the defensive extreme of the 12-axis spread by design — the standing rule is
not to balance toward identical anything. **Verdict: the revert corrects the Cluster 2
mistake and the Engineer needs nothing further.** Its remaining §35 failure
(Killbox / Autonomous Army) is a content problem, tracked in Cluster 7.

### 6b. Corsair — Cluster 2's other half also under-delivered — **evidence, no proposal yet**

Recorded for honesty. The Corsair half of Cluster 2 was signed off as "Done" on arena
evidence (ST 458 → 539, burst3 1775 → 2287). Real play, after that change:

| | corsair | duelist | roster median |
|---|--:|--:|--:|
| dps | 312 | 169 | 730 |
| floors cleared (of 3) | **0.8** | 0.2 | 3.0 |
| damage taken / sec | **35.2** | 35.8 | 17.8 |

20th of 21, dying on two floors in three, and taking double the median's damage. The arena
said the fix landed; the floor says the Corsair is still at the bottom. No second Corsair
proposal here — the point is that **an arena-only sign-off is not sufficient evidence that
a damage-floor fix worked**, and Cluster 2's "Done" should be read with that caveat.

### 6c. Duelist — the weakest class in the game on every axis at once — **PROPOSED**

The arena rated it 7th; on a real floor it is last on damage (169 dps, 23% of the median),
last on survival (35.8 taken/s), clears 0.2 floors of 3, and — per Cluster 5b — never
charges its ultimate. Base stats are the lowest defensive block on the roster
(`defense: 6`, `maxHealth: 124`) paired with the shortest engage range measured
(**52–56 units**), no summons, and no zones. It is built as a single-target duellist whose
mitigation is `evasion: 0.10` / `blockChance: 0.06`, and a real floor is packs: four
avoided hits a floor against eighty-nine landed ones.

**One caveat that must go in the write-up rather than be quietly ignored: the harness
cannot play a Duelist.** The bot's policy is close to 26 units, hold attack, dodge
telegraphs, retreat when hurt — the smoke bot's, deliberately (see the comment on
`MELEE_STAND`). "Bait the swing, punish the gap" is not in its vocabulary, and the
Duelist's whole kit is reactive. So 169 dps is a **floor** on the class, not its ceiling,
and the gap between a bot and a player is larger for this class than for any other. What
the measurement does establish beyond doubt is that the Duelist has no passive floor to
stand on when played imperfectly, which is a real problem for a class a new player might
pick.

⚠ **Cluster 8 sharpened that caveat into a blocker.** It is not only that the *bot* cannot
bait a swing — the Duelist's three builds never equip `riposte` at all, so all three of its
reactive counters are absent from the loadout the harness scored, on top of two of them
having been dead code until Cluster 8. The 143–206 dps band is therefore a floor beneath a
floor, and **this proposal should not be applied until the harness equips the class's
counter** (Cluster 7, cause 3). Buffing a Duelist to hit 400–500 dps while its counters are
un-equipped and untested would overshoot by an unknown margin.

**Proposed** — a Cluster-2-style pass in two parts, neither applied, and now gated on the
harness fix above:
1. the meter fix from 5b (`dodge 8 → 22`, `block 10 → 26`), so the ultimate exists at all;
2. a damage-floor pass on the base block and the three lowest-scaling abilities, sized to
   move it from 169 to roughly the 400–500 band the other bottom-quartile melee classes
   occupy — *not* to the median, since a duellist that needs the fight to go right is a
   legible identity and flattening it is exactly what the standing rule forbids.

### Intra-class spread — not yet a proposal

| class | weakest build | strongest build | ratio |
|---|--:|--:|--:|
| berserker | Blood Frenzy 750 | Hemorrhage 3015 | **4.0×** |
| magician | Elemental Rift 957 | Prismatic Cascade 2507 | 2.6× |
| stormcaller | Cyclonic Step 643 | Stormlord ★ 1740 | 2.7× |
| necromancer | **Soul Legion ★ 484** | Bone Forge 2545 | **5.3× — the Mythic is the worst build** |

The Soul Legion anomaly was investigated and is **not** a balance number. See Cluster 8.

---

## Cluster 7 — §35: six classes' builds are not behaviourally distinct — **evidence only**

`npm run builds` fails on **lancer, juggernaut, necromancer, stormcaller, bard, engineer**.
The gate is deliberately generous — a pair fails only if it equips the *same three skills*
and separates on **none** of seven behaviour axes (engage, movement, summons, zones,
ailments, ultimate cadence, damage taken).

| class | identical pair | note |
|---|---|---|
| bard | all three pairs | Battle Crescendo / Soloist / War Noise are one build |
| necromancer | Meat Grinder / Lich Bond / Bone Forge | all three near-identical (2235–2545 dps, same skills) |
| lancer | Thunder Lance / Phalanx Spear | — |
| juggernaut | Bastion / Champion's Challenge | byte-identical fingerprints |
| stormcaller | Supercell / Perfect Storm | — |
| engineer | Killbox / Autonomous Army | expected: `autonomous_army` is documented as having nothing to wire (`docs/rule-coverage.md`) |

Two distinct causes, and they need separating before anything is changed:

1. **The hybrid genuinely does nothing observable** — the Engineer's `autonomous_army`
   ("turrets reposition, no line-of-sight needed") was already documented as un-wireable
   because the minion pather does this anyway. That is a content problem: the unlock should
   do something else.
2. **The harness cannot see what it does** — a hybrid that changes a damage *type*, a
   status duration or a targeting shape may be a real difference the seven behaviour axes
   miss. `npm run rules` proves a rule fires; it does not prove a player would feel it.

3. **The harness does not equip the ability the build is about.** Found while applying
   Cluster 8, and it is now the largest of the three. `equipForBuild` ranks candidate
   skills by damage output, with one guarantee bolted on (at least one direct-damage
   ability). Nothing makes it equip the skill a build's *identity* runs through, so:
   the Duelist never equips `riposte` — all three of its reactives — and is scored as the
   roster's weakest class by a bot that never counters; the Paladin never equips a
   `barrier` skill and its meter rule reads as dead (see 5b); the Warden never equips
   `living_wall`, likewise. This is a measurement bug that has already produced one wrong
   diagnosis in this document and nearly produced a second, and it should be fixed before
   any more numbers are read off the table.

   The fix is not simply "equip the identity skill": that would move every fingerprint in
   the ledger at once and invalidate the comparisons this document is built on. It wants a
   **second loadout per build** — the damage-ranked one for continuity, plus an
   identity-weighted one — reported side by side.

Splitting those three is the work. It is also the natural home for the old Cluster 4
(detectable-impact sweep), which asked the same question from the other end.

---

## Cluster 8 — `followUp` and `reactive` never fire — **APPLIED**

This started as "investigate `necromancer.mythic.soul_legion`, which makes the class 5.3×
worse than its own hybrids". The Mythic turned out to be a symptom of something much
larger, and the balance question dissolved into an engine one.

**What Soul Legion declares.** Its one mutation rewrites Kingdom of Bones with
`{ kind: "summon", addCount: 6, addInheritPower: 0.2 }`, `{ kind: "addTags", tags: ["void"] }`,
and a `{ kind: "followUp", window: 6, effects: [consumeSummons all → damage + 40 souls] }` —
the "an army, or a cannon" choice the description promises.

**What it resolves to.** A probe of all seven Necromancer builds at L18 shows the Mythic's
aggregate mods, its ability cooldowns, its costs and its damage bases are *identical* to
its hybrids'. The only differences are three extra entries in `build.rules`
(`legion.endless_legion`, `hybrid.meat_grinder`, `hybrid.soul_general` — picked up because
its 14-point allocation covers those requirements too), none of which is wired in
`src/game/rules.ts`. **Soul Legion's mechanical payload does not reach the simulation at
all**, so its 484 dps is not the Mythic being bad; it is a 14-point build that spends its
points on nothing and plays worse than a 6-point one because of what those points did
*not* buy.

**The root cause is in `AbilityRuntime`.** There are three kinds of deferred effect
(`PendingEffect.kind`), and only one of them is ever executed:

- `delay` — fired by `AbilityRuntime.tick` when `now >= fireAt`. **Works.**
- `followUp` — scheduled by `castAbility` with an `expiresAt` and no `fireAt`. `tick`'s
  only other branch is `else if (p.expiresAt !== undefined && now >= p.expiresAt)`, which
  **splices it out without running it**. Every follow-up window in the game expires unused.
- `reactive` — fired only by `AbilityRuntime.notify(event, host)`, and **`notify` has no
  callers anywhere in `src/`**. (The only `notify` grep hits are `TownUI.notify`, which is
  the unrelated toast.)

**Scope: roughly two dozen authored behaviours never execute.** Eleven `followUp` mutation
ops (bard, corsair, assassin, lancer, magician, necromancer, swordsman, monk, paladin ×2,
stormcaller ×2), one ability-level `followUp` (`lancer.ts:199`), and twelve `reactive`
effect steps (duelist ×3, bard ×2, berserker ×2, juggernaut ×2, paladin, warden,
trickster).

**Independent confirmation, from the harness rather than from reading code.** The Corsair's
Mythic Archetype is **byte-identical to a hybrid across all twelve fingerprint columns**:

```
corsair / Plunder Crew      1/3  42  336  35  82  115  0.5  47s  0.0 0.0 0.2  boarding_cut:13 powder_keg:4 grapple_swing:5
corsair / Dread Admiral ★   1/3  42  336  35  82  115  0.5  47s  0.0 0.0 0.2  boarding_cut:13 powder_keg:4 grapple_swing:5
```

Dread Admiral's only mechanical addition over that hybrid is
`{ kind: "followUp", window: 3, effects: [damage 2.4 /ultimate] }`. A dead code path
predicts exactly this row, and this row is what the harness measured.

**This also reaches back into two other clusters.** It is a cause of the Cluster 7 §35
failures that is neither of the two the cluster names, and it lands hardest on the class
Cluster 6c is about: the **Duelist owns three of the twelve dead `reactive` steps**, more
than any other class, which is one concrete reason the roster's most reactive kit measures
as its weakest.

**Fixed.** The design question the first draft of this entry escalated turned out to be
answerable from the schema rather than from taste. `src/combat/ability.ts` documents the
field itself:

```ts
/** Effects available for a short window after the cast, on a second press. */
followUp?: { window: number; effects: readonly EffectStep[] };
```

"On a second press." That is a combo, not an expiry timer, and re-reading all ten
declarations against it, every one lands: Broadside's ghost crew "fire a second volley",
Infinite Motion "lets the Monk keep comboing on landing", the Symphony adds "a fourth
movement", Blade Dance's moving attacks "open a finisher", and the Lancer dashes out and
comes back. So no owner call was needed after all — only a closer read of the data.

**`reactive`.** `AbilityRuntime.notify` had no callers, and the fix is one subscription
seam rather than calls sprinkled through the dungeon: `runReactiveWindows`, sitting next to
the `runBuildGrants` that was already wiring build grants to the same bus. The bus already
carried `hit`, `criticalHit`, `kill`, `enemyDeath`, `skillUse` and `ultimateUse` with the
hero in `actorId`; `damageTaken` and `dodge` — between them 21 of the 30 authored reactives
— reached only the resource layer, so they now emit on the bus too. Events are filtered to
the hero they name, so one player's dodge cannot fire another player's counter, and
`enemyDeath` is about the dier so it goes to everybody.

**`followUp`.** A press inside the window spends it. It beats the cooldown gate — the
ability is *meant* to be cooling down then — and pays no cost, because the first press
already paid; an ultimate's follow-up spends the window rather than a second full meter.
Targeting is re-resolved, since a second press is a press and a 3–6 s window is long enough
for the first cast's target list to have gone stale, but the original `DamageSource` is
kept verbatim so THE ULTIMATE RULE's `fromUltimate` stamp cannot be laundered off an
ultimate by comboing out of it.

**Deliberately excluded**, because a bug fix should not smuggle in a balance change: a
follow-up broadcasts no `skillUse`/`ultimateUse` and re-fires no on-cast rule hooks. Either
would credit a combo as a second cast, changing every ultimate meter's fill rate and
doubling every "when you cast" keystone for free. The visible consequence is that Lancer's
`ult/m` fell 51.6 → 45.6 on Breakthrough, which matters not at all while Cluster 5a has
that meter at 25.7 bars per floor.

### Measured effect

Four builds moved, and **every one of them is a class that owns a `reactive`** — which is
the result a working retaliation should produce, and is a good deal more convincing than
the fix passing its own unit test:

| build | secs | dps | dmg taken/s | what it owns |
|---|--:|--:|--:|---|
| trickster / Loaded Contract | 40 → 34 | 350 → **448** (+28%) | 16 → 14 | `reactive damageTaken`, window 12 |
| trickster / False Assassin | 36 → 30 | 377 → **478** (+27%) | **21 → 10** | as above |
| monk / Counter Body | 39 → 31 | 354 → **430** (+21%) | 17 → 12 | the counter path |
| warden / World Tree | 42 → 37 | 497 → **591** (+19%) | 16 → 13 | Nature's Reprisal |
| trickster / Impossible Movement | 37 → 35 | 369 → **403** (+9%) | 21 → 17 | `reactive damageTaken` |
| lancer / Breakthrough | 27 → 32 | 1165 → 1164 | 12 → 14 | the one native `Ability.followUp` |

Damage dealt up and damage taken down together, on exactly the six builds whose kit is
about answering a hit. Every other fingerprint in the table is byte-identical.

**The Duelist did not move, and that is the finding.** Its three builds equip `disarm`,
`opening_cut` and `lunging_jab` — never `riposte`, which is where all three of its
reactives live. `equipForBuild` ranks candidate skills by damage output, so the class whose
entire identity is the counter is measured by a bot that never presses the counter. Cluster
6c's "143–206 dps" is therefore a floor under a floor, and the real defect is in the
harness's loadout picker, not the Duelist's numbers. That is now the largest open item in
Cluster 7 rather than a Duelist balance question.

### Guarded

Six new checks in `npm run rules`, because nothing in the suite noticed 34 dead
declarations: the data was valid, the shapes passed `npm run roster`, and the abilities
simply did a fraction of what they said.

- every authored `reactive` event is one the bus actually delivers (11 reactives, all reachable)
- Riposte answers a hit for **187 damage** where it previously did nothing at all
- another hero's hit does **not** fire this hero's counter
- a follow-up window is armed by the first press, spent by the second, refused on the third
- a window nobody presses expires and is dropped

### Still broken, and out of scope here

`Dungeon.moveActor` accepts `MoveRequest.leaveAnchor` and silently drops it. So
`lancer.meteor_lance`'s follow-up — `{ move teleport, leaveAnchor: false }`, i.e. "come back
to where you dashed from" — now runs, but teleports 120 units along the current facing
instead of returning to the anchor. That is a separate unimplemented `MoveRequest` field,
not a deferred-effect bug, and `temporalAnchor` targeting may want the same storage.

`summonDeath` is still broadcast nowhere, so the two grants keyed on it remain dead; it
joins `corpseCreated`, `enterCombat` and `leaveCombat` as event types declared in both
`ResourceEventType` and `triggers.ts` and emitted by nothing.

---

## Cluster 9 — the `0a6e2d6` family, swept across all 21 classes — **APPLIED**

`0a6e2d6` ("Stage 11: fix abilities whose targeting mode never filled a target list")
found four abilities by hand. Hand-finding does not scale to 210, and the Lancer's
blocked-lane ultimate showed the family is wider than targeting — an ability can resolve
its targets perfectly and still spend its cost for no observable effect. `npm run
deadpaths` (`tools/deadpaths.ts`) is the instrument for both halves, and it is now part of
`npm test` (6.7 s).

### Pass 1 — static: a step that reads a target list nothing filled

`selectActorIds` resolves `to: "allTargets" | "target"` — and most steps' *omitted* `to` —
out of `ctx.targets.actorIds`. Five targeting modes never put an actor in that list:
`point`, `direction`, `corpse`, `zone`, `temporalAnchor`. A step reading it under one of
those is dead whatever the numbers on it say. Nesting is walked, so a step buried in a
`delay` / `reactive` / `random` / `onExpire` branch is caught too.

One finding, and it is the same bug `0a6e2d6` fixed four times:

| Ability | Was | Now |
| --- | --- | --- |
| `magician.gravity_well` | `targeting: "point"`, `{ kind: "pull", to: "allTargets" }` — **0 targets, no haul** | `targeting: "radius"`, `shape: { radius: 100 }` — **6 targets, +12.1u hauled inward** |

The haul *is* the ability ("a pit of collapsing space that hauls everything toward its
centre"); the void puddle is the follow-through. Measured with monsters ringed 70u around a
well placed 200u away along a verified-clear lane: mean radial change went from **-1.4u**
(they walked *away*, toward the caster) to **+12.1u**. `force: 160` is untouched — this
restores authored intent, it does not retune anything.

`to: "enemies"` would have been the wrong fix and is worth recording as a trap: that
selector measures from the **caster**, not from the resolved point, so a well placed 260
units away would have hauled in whatever was standing next to the Magician.
`0a6e2d6`'s own commit message describes the Monk fix as landing "around the landing" —
`selectActorIds` centres it on the caster, so that ability is worth a second look.
`targeting: "radius"` is the mode that actually fills the list from around the aim point,
*and* still returns that point, so the zone lands exactly where it always did.

### Pass 2 — live: cast all 210 abilities and diff against a no-cast control

Every ability of every class, cast once in an arena built to be maximally favourable —
40 monsters at five radii in eight directions, corpses underfoot, a real `castInputFor`
aim — with every observable sampled *continuously* and diffed against a control run of the
same scenario on the same seed.

**Result: 0 dead, 9 inert-with-a-stated-reason.** Getting to a trustworthy zero took four
corrections to the instrument, each of which had produced a false accusation:

| The instrument said | Why it was wrong |
| --- | --- |
| 24 abilities dead | It never observed `resource`, `stance`, `taunt` or terrain deltas at all. |
| Crossguard dead | It sampled only after 150 ticks. A 1.6 s ward and a 1 s self-buff are long gone by then — peaks, not end state. |
| 4 `resource` grants dead | It primed every pool to **max**, so `pool.add(25)` was a no-op. Pools now sit at half, with only the charged pool topped up. |
| Reinforced Barricade *working* | Drift counted the ability's own **cost** as an effect. Drift is now attributed only to the pools the ability's own data says it moves. |

The last one cuts both ways and is the reason to keep the two passes separate: Gravity Well
reads "ok" in pass 2 all along, because its zone lands and ticks damage — only the static
pass could see that the pull addressed nobody.

### Not mine to fix — engine seams, flagged rather than guessed at

Every one of these is correctly-authored data blocked by a stub in `src/game/`. The tool
reports them every run and deliberately does **not** fail on them.

| Seam | Blocks | Reach |
| --- | --- | --- |
| `Dungeon.spawnTerrain()` returns -1 (documented: "lands with the ability cutover") | `necromancer.ossuary_wall` and `engineer.reinforced_barricade` do **nothing at all**; nine more abilities lose a component | 11 `terrain` steps across 8 classes |
| `Dungeon.markOf()` is a stub — `markTargets` is read and never written | `warlock.soul_detonation` is **entirely dead** (both its targeting *and* its spread read the mark); `duelist.countermark`'s reactive damage never lands | 3 abilities + 1 Duelist hybrid mutation |
| `setThreat()` early-returns on any op but `taunt` | `threat` ops `drop` / `generate` are silently dropped | assassin, juggernaut ×2 + a foundation node, lancer hybrid, warden |
| `moveActor` drops `MoveRequest.leaveAnchor` | "dash out and come back" dashes again | 6 abilities (already on the backlog) |
| `shieldActor` is `Math.max`, hero-only | a shield smaller than a standing ward does nothing; a shield aimed at an ally minion does nothing | every `shield` step |

`warlock.soul_detonation` wants a design call, not a guess: its description is "centred on
the **most-cursed** enemy", and there is no targeting mode for "most status stacks".
Re-pointing it at `highestThreatEnemy` would land it on an arbitrary enemy, because
`threatToward` is a stub too and returns 0 for everything.

### Guarded

`npm run deadpaths` exits non-zero on a blind target list or an inert ability with no
staged precondition to excuse it, and is wired into `npm test`. A new ability can no longer
ship with the `0a6e2d6` bug in it. Engine-stub findings stay advisory — failing on those
would make the guard useless until the seams are written.

---

## Backlog (evidence gathered, proposals pending)

- ~~**Instrument the generation events**~~ — **DONE**, and it changed the answer. The
  per-rule ledger in `tools/builds.ts` (auto-printed for any never-filling class,
  `BUILDS_GEN=1` for all 21) split Cluster 5b into a four-class tag bug and an eight-class
  amount problem, and ruled out the systemic cause the first draft guessed at. See 5b.
- ~~**Fix `followUp` / `reactive`**~~ (Cluster 8) — **DONE.** No owner call was needed in
  the end: `Ability.followUp`'s own doc comment says "on a second press", which settles the
  semantics the first draft escalated. Six assertions in `npm run rules` now guard it.
- **The harness's loadout picker is the largest open item** (Cluster 7, cause 3). It ranks
  skills by damage, so three classes are measured without the ability their identity runs
  through — including the Duelist, scored last on damage by a bot that never presses its
  counter. Everything still open in 5b Cause B and 6c is downstream of this, so it should
  go first.
- **Two `MoveRequest` fields the host ignores** — `leaveAnchor` is accepted and dropped by
  `Dungeon.moveActor`, so a "dash out and come back" follow-up dashes again instead of
  returning. `temporalAnchor` targeting probably wants the same stored position.
- **Four event types are declared and never broadcast** — `summonDeath`, `corpseCreated`,
  `enterCombat`, `leaveCombat`, in both `ResourceEventType` and `triggers.ts`. Two authored
  grants key on `summonDeath` and are dead because of it. The Cluster 8 assertion covers
  `reactive` steps only; grants are not yet checked the same way.
- **Cluster 4 — hybrid / keystone / Mythic detectable-impact sweep.** Folded into Cluster 7
  above; `npm run rules` now
  proves ~40 of the wired rules do something; extend it to assert every hybrid/keystone/
  archetype changes a number or an effect list the harness can see. Feeds `npm run
  roster`.
- ~~**Build-differentiation harness**~~ — **DONE**, `tools/builds.ts` / `npm run builds`.
  It produced Clusters 5–7 and the Cluster 2 correction. Still to do on the harness itself:
  the generation-event counters above, and folding it into `npm test` once §35 passes.
- **Five engine seams that dead-end authored data** (Cluster 9) — `spawnTerrain`,
  `markOf`, `setThreat`'s non-taunt ops, `leaveAnchor`, and `shieldActor`'s hero-only
  `Math.max`. Between them they fully kill three abilities and partially kill roughly
  twenty. All are `src/game/` work, so all are flagged rather than fixed; `npm run
  deadpaths` reports them on every run.
- **Raid-scale (10–20 p) hazard constraints** — consolidate the scattered §4 notes into
  one section: redirect `fraction` cap + total-redirect clamp per hit; party-wide
  `guardsDeath` single-source + decay; zone-merge total-radius cap (`mergeable` threaded
  but `spawnZone` ignores it); a real threat table (`setThreat`/`threatToward` are
  stubs); resource-share hybrid loop guard (Bard Rallying Chorus, Warlock Soul Gate).
  **Document only — no raid code; multiplayer stays delve-only / 4 p.**
