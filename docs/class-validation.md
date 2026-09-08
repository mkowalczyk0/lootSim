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
detonation numbers) **buffed a class that was already top-tier**. It should be reverted, and
the Engineer then re-examined as an *over*-performer — its real problems are the 2-second
ultimate meter (Cluster 5) and a durability profile that barely registers incoming damage.
That is a proposal, not something to apply unilaterally: written up in Cluster 6.

The **Corsair** half stands and is if anything under-done: it is still last in real play,
at ~40% of the median's damage while eating twice the median's incoming, and it is one of
only two classes that cannot reliably finish a depth-9 floor.

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

### 5b. Eight of twenty-one classes never fill their meter on a real floor

**duelist, trickster, reaper, stormcaller, paladin, bard, assassin, warden** — none of them
reached a full meter in any of twelve floors each. Three of those (reaper, assassin,
trickster) were previously written off as arena artifacts on the grounds that they charge
on execute / mark / poison and the dummies were full-health and unmarked. **That was wrong**:
they do not fill in real play either.

This is a systemic problem rather than eight independent ones, and it wants a shared
diagnosis before any numbers move: the likely cause is that these classes' generation rules
key off events that are *rare per floor* (an execute, a mark consumed, an ally buffed) at
amounts sized as though they were common. The right next step is a per-class read of which
generation event actually fired and how often — a small extension to the harness
(`generation` event counters per floor) rather than a guess. **Do not tune these eight
blind; instrument first.** Flagged as the immediate follow-up below.

Cluster 1's shaman fix should be re-opened in the same pass: it was declared "now in band"
on an arena reading of 41.8 s, and real play is 8 s.

---

## Cluster 6 — arena-vs-real-play rank inversions — **PROPOSED**

The arena's damage ranking and the real-floor ranking disagree badly enough that the
12-axis table cannot be used on its own to decide who needs help.

| class | arena ST rank | real-play dps | real-play verdict |
|---|--:|--:|---|
| engineer | 21st (last) | 1473–1785, 2–5 taken/s, 3/3 | **top tier** — see the Cluster 2 correction |
| necromancer | 15th | 2235–2545 | **top tier** |
| duelist | 7th (723) | **143–206**, 0–1/3 cleared | **bottom** — the arena flattered it enormously |
| corsair | 20th | **240–336**, 0–1/3 cleared | bottom, consistent |

**Duelist is the new finding.** The arena rated it mid-pack; on a real floor it is the
weakest class measured, at ~25% of the median's damage, and it cannot finish a depth-9
floor. The cause is legible in the fingerprint: engage range **52–56 units**, the shortest
on the roster, with no summons, no zones and an ultimate that never charges. It is built as
a single-target duellist with a near-immunity keystone (`one_opponent`) that only pays off
against one marked target — and a real floor is packs. Stationary dummies are precisely the
scenario it is designed for, which is why the arena liked it.

**Proposed:** treat Duelist as a Cluster-2-style damage-floor case with its own write-up
(imbalance → evidence → data change), and **revert the Engineer half of Cluster 2** as
described above. Both want the owner's go-ahead; neither is applied.

Also worth a look, not yet a proposal — **intra-class spread is very large for some
classes**, which may be a differentiation success or a balance failure depending on intent:

| class | weakest build | strongest build | ratio |
|---|--:|--:|--:|
| berserker | Blood Frenzy 750 | Hemorrhage 3015 | **4.0×** |
| magician | Elemental Rift 957 | Prismatic Cascade 2507 | 2.6× |
| stormcaller | Cyclonic Step 643 | Stormlord ★ 1740 | 2.7× |
| necromancer | **Soul Legion ★ 484** | Bone Forge 2545 | **5.3× — the Mythic is the worst build** |

`necromancer.mythic.soul_legion` making the class *five times worse* than its own hybrids
(raise_skeleton cast 35 times a floor versus 7–9) is the clearest single anomaly in the run
and should be read as a bug before a balance question.

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

Splitting those two is the work. It is also the natural home for the old Cluster 4
(detectable-impact sweep), which asked the same question from the other end.

---

## Backlog (evidence gathered, proposals pending)

- **Instrument the generation events** (immediate follow-up to Cluster 5b) — per-floor
  counters for which `ResourceSpec.generation` entry actually fired, and how often, so the
  eight never-fill classes can be fixed from data instead of guessed at. Small addition to
  `tools/builds.ts`.
- **Cluster 4 — hybrid / keystone / Mythic detectable-impact sweep.** Folded into Cluster 7
  above; `npm run rules` now
  proves ~40 of the wired rules do something; extend it to assert every hybrid/keystone/
  archetype changes a number or an effect list the harness can see. Feeds `npm run
  roster`.
- ~~**Build-differentiation harness**~~ — **DONE**, `tools/builds.ts` / `npm run builds`.
  It produced Clusters 5–7 and the Cluster 2 correction. Still to do on the harness itself:
  the generation-event counters above, and folding it into `npm test` once §35 passes.
- **Raid-scale (10–20 p) hazard constraints** — consolidate the scattered §4 notes into
  one section: redirect `fraction` cap + total-redirect clamp per hit; party-wide
  `guardsDeath` single-source + decay; zone-merge total-radius cap (`mergeable` threaded
  but `spawnZone` ignores it); a real threat table (`setThreat`/`threatToward` are
  stubs); resource-share hybrid loop guard (Bard Rallying Chorus, Warlock Soul Gate).
  **Document only — no raid code; multiplayer stays delve-only / 4 p.**
