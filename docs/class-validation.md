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
- `npm run roster` — data-shape + unlock-threshold + anti-overlap gates.
- `npm run rules` — the keystone/hybrid/Mythic rule engine does something observable.
- `npm run smoke` — whole floors; the bot plays **Swordsman**, so changes to any other
  class's numbers leave the campaign byte-identical (13.8 / 9.4).

---

## 12-axis read — `npm run arena`, level 18, geared (keys 14–18), depth-8 dummies

Six axes measured live; the rest read off the static kit census (an arena of stationary
dummies cannot measure "did the escape save you").

| class | ST dps | burst3 | AoE dps | per-tgt | meter s | dmg.in | heal | shld | mit | mob | ctrl | sup | sum | exec |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| juggernaut | 229 | 1413 | 1559 | 260 | 24.8 | 6088 | 0 | 4 | 4 | 1 | 0 | 3 | 0 | 0 |
| paladin | 390 | 1485 | 1478 | 246 | 21.5 | 7800 | 4 | 3 | 1 | 1 | 0 | 5 | 0 | 0 |
| engineer | 395 | 1330 | 1384 | 231 | 6.7 | 4031 | 0 | 2 | 0 | 0 | 0 | 0 | 5 | 0 |
| corsair | 458 | 1775 | 455 | 76 | none (90%) | 9447 | 0 | 0 | 0 | 2 | 1 | 2 | 1 | 0 |
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
no longer credits it with a near-constant free ultimate — see Cluster 1).

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

### Meter-fill triage (the `meter s` column)

The arena over-fills 2–3×, so a 20–90 s arena reading is *in band* and a "none" can be a
harness artifact. Classified:

| class | arena | verdict |
|---|--:|---|
| lancer | none | **harness artifact** — `on: "move"`, the driver only strafes a 40 px orbit |
| reaper | none | **harness artifact** — charges on `execute` / kill-with-execute; dummies are full-HP |
| assassin | none | **harness artifact** — charges on `mark` / `ailmentInflicted ["poison"]`; dummies unmarked |
| corsair | none (90%) | **borderline artifact** — Crew-gated; nearly fills. Monitor. |
| monk | 1.2 → **6.5 s** | **fixed, Cluster 1.** ≈ 15–20 s real; bottom of band, as intended for a rhythm loop |
| warlock | **2.7 s** | **REAL — too fast**, though a fast Damnation is somewhat on-brand. Cluster 1 hold — revisit with the build harness. |
| ranger / berserker / necromancer / engineer | 6–7 s | flagged `< 20 s` but every one is a discrete-event driver the arena spams; **needs the real-play/build harness to judge** — do not tune blind. |
| swordsman | 12.5 s | just under; leave |
| magician / stormcaller / paladin / juggernaut | 17–25 s | in band |
| trickster / warden / alchemist | 37–41 s | in band |
| shaman | 111.6 → **41.8 s** | **fixed, Cluster 1.** now in band |
| duelist / bard | 71–75 s | in band (support-ish); leave |

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

## Cluster 2 — bottom-quartile damage with no identity to pay for it: Corsair + Engineer — **PROPOSED, awaiting go-ahead**

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

**Proposed change** (data only — `src/data/classes.ts`, `src/progression/corsair.ts`):

| file · field | before | after | why |
|---|--:|--:|---|
| `classes.ts` `corsair.base.attackSpeed` | 0.06 | **0.09** | brings the basic-attack cadence to skirmisher tier |
| `classes.ts` `corsair.base` add `critChance` | — | **0.06** | a pistol-and-cutlass duelist should crit; matches the archetype |
| `corsair.ts` `CORSAIR_BOARDING_CUT` base hit | 1.3 | **1.7** | the bread-and-butter melee, and it's gated behind a Hookshot setup |
| `corsair.ts` `CORSAIR_BOARDING_CUT` hooked bonus | 1.6 | **2.1** | rewards the hook→cut combo the class is built around |
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

**Proposed change** (data only — `src/data/classes.ts`, `src/progression/engineer.ts`):

| file · field | before | after | why |
|---|--:|--:|---|
| `classes.ts` `engineer.base.attack` | 8 | **9** | lifts the Engineer and every construct at once; still bottom-3 |
| `classes.ts` `engineer.growth.attack` | 1.9 | **2.05** | the construct floor shouldn't fall further behind with level |
| `engineer.ts` `ENGINEER_AUTO_TURRET` `count` | 1 | **2** | two turrets is the "there is infrastructure doing it instead" fantasy |
| `engineer.ts` `ENGINEER_AUTO_TURRET` `inheritPower` | 0.6 | **0.72** | per-turret bite |
| `engineer.ts` `ENGINEER_AUTO_TURRET` `cooldown` | 6 | **7** | pay for the extra body |
| `engineer.ts` `ENGINEER_MORTAR_POD` zone `base` | 1.4 | **1.9** | the sustained-AoE anchor |
| `engineer.ts` `ENGINEER_MORTAR_POD` `inheritPower` | 0.7 | **0.8** | — |
| `engineer.ts` `ENGINEER_SHOCK_MINE` damage `base` | 1.0 | **1.5** | the burst-AoE / CC option |
| `engineer.ts` `ENGINEER_REMOTE_DETONATION` base | 2.4 | **3.0** | the payoff button |
| `engineer.ts` `ENGINEER_REMOTE_DETONATION` tagged follow-up | 2.0 | **2.6** | rewards the Tagged setup |

**Left alone on purpose:** personal basic-attack multipliers and every non-construct
skill — the Engineer *should* stay near the ST floor (a summoner's ST identity). The bump
routes through the constructs, not the Engineer's own swing.

**Projected:** personal ST 395 → ~470–520 (still bottom-3, correct), AoE 1384 → ~2100–2400
(Necromancer tier), burst3 → ~1900. `dmg.in` unchanged (no defensive change).

### Verification plan (run after the owner approves, record deltas here)

- `npm run arena` — full 12-axis re-read. Assert: corsair ST lands 600–720 and AoE stays
  under ~650; engineer AoE lands 2000–2500 and personal ST stays under ~550; **no other
  class's row moves** (every edit is class-file-local or a per-class `classes.ts` block).
- `npm test` green (check + vocab + prog + classes + roster + rules + smoke).
- `npm run smoke` — campaign **13.8 / 9.4 byte-identical** (bot plays Swordsman).
- `npm run roster` — data-shape + anti-overlap gates still pass.

---

## Backlog (evidence gathered, proposals pending)

- **Cluster 4 — hybrid / keystone / Mythic detectable-impact sweep.** `npm run rules` now
  proves ~40 of the wired rules do something; extend it to assert every hybrid/keystone/
  archetype changes a number or an effect list the harness can see. Feeds `npm run
  roster`.
- **Build-differentiation harness** (`tools/builds.ts` or a smoke-bot mode). Allocate a
  named path/hybrid, report a behaviour fingerprint (skill mix, mean engage range, meter
  cadence, movement). Required for spec §35 ("3 builds/class play differently") and to
  give warlock/berserker/ranger/necro/engineer a real-play meter number.
- **Raid-scale (10–20 p) hazard constraints** — consolidate the scattered §4 notes into
  one section: redirect `fraction` cap + total-redirect clamp per hit; party-wide
  `guardsDeath` single-source + decay; zone-merge total-radius cap (`mergeable` threaded
  but `spawnZone` ignores it); a real threat table (`setThreat`/`threatToward` are
  stubs); resource-share hybrid loop guard (Bard Rallying Chorus, Warlock Soul Gate).
  **Document only — no raid code; multiplayer stays delve-only / 4 p.**
