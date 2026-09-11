# The execute family — per-term attribution (docket §38)

> "Add to the docket to nerf rangers execution ultimate again."

The **third** report of the same ability. Two fixes had already shipped, both correctly
reasoned and both honestly measured:

- **§8 sized the number** — `executeMissingHealth` 0.4 → 0.2, plus `shape: { radius: 350 }`.
  Record: `docs/ranger-last-hunt-nerf.md`.
- **§20 fixed the shape** — `EXECUTE_THRESHOLD = 0.5` and a normalised ramp, so the rider
  contributes nothing at or above half health. Record: `docs/execute-threshold.md`.

The docket's instruction for the third pass was explicit and it is the reason this document
exists before any number moved: *"Do not start by changing a number. Start by measuring
which of the three dominates in a real fight."* It ranked three candidates — **cadence**,
**the direct packet**, **the rider's remaining contribution** — and said the missing
instrument was a per-term damage attribution.

This is that measurement. **It found a fourth term, and the fourth term is the answer.**

---

## The headline

**The coefficient the last two fixes moved is not the coefficient the game casts with.**

At the levels the owner plays at, The Last Hunt's execute rider resolves to **0.95** — not
the **0.2** written on its packet. That is **4.75× the authored number**, and it is the
number §8 halved and §20 left alone while believing it was the whole rider.

| | coefficient | source |
|---|---|---|
| authored on the packet | **0.20** | `src/progression/ranger.ts` — the number §8 set and §20 kept |
| `+ ranger.perfect_ambush` | +0.25 | hybrid unlock, `target: { withTag: "projectile" }` |
| `+ ranger.winter_execution` | +0.50 | hybrid unlock, `target: { withTag: "projectile" }` |
| **effective, measured in a live fight** | **0.95** | `npm run execute-attrib`, 37–44 readings, zero variance |

`RANGER_THE_LAST_HUNT` carries `tags: ["ultimate", "stealth", "execute", "projectile",
"ranged"]`. Both hybrid unlocks target the **`projectile` tag**, so both land on the
ultimate. **Neither adder's prose mentions the ultimate**: Perfect Ambush is *"A shot fired
from stealth or Deadeye that hits a trapped enemy always executes"* and Winter Execution is
*"A held Deadeye shot on a frozen target is a guaranteed one-shot on anything but an
elite."* Both are authored for the Ranger's **basic projectile play**, and both reach the
ultimate by tag collision rather than by intent.

### Why this is exactly why two fixes failed

§8 halved 0.4 → 0.2. If the tree was adding 0.75 on the build that reported it, the real
coefficient went from 0.95 + 0.4 − 0.4 … that is, from **1.15 to 0.95: a 17% cut, not the
50% cut the commit believed it was making.** §20 then left the coefficient alone entirely
and changed the shape. So the owner has reported this three times, and across all three
reports the *effective* coefficient has been reduced by 17% once. That is not a mystery
about player perception; it is arithmetic.

### It is reachable cheaply, and it was confirmed rather than reasoned

A hybrid needs 3 points in one path and 2 in another. Perfect Ambush is Deadeye 3 + Trapper
2; Winter Execution is Deadeye 3 + Cold Hunt 2. **A single build holding Deadeye 3, Trapper
2 and Cold Hunt 2 — seven points — carries both.**

That was not left as a reading of the `requires` arithmetic. `tools/bot.ts`'s `armTrees`
allocates greedily, and sweeping it by character level shows the second hybrid coming into
range on its own:

| character level | measured effective coefficient | readings |
|---|---|---|
| 30 | 0.45 (2.25×) | 254, zero variance |
| 40 | 0.45 (2.25×) | 53, zero variance |
| **50** | **0.95 (4.75×)** | 44, zero variance |
| **60** | **0.95 (4.75×)** | 37, zero variance |

**The owner was "pushing raids."** That is an endgame character, which is the 0.95 row, not
the 0.45 one. The measurement and the complaint are looking at the same build.

---

## The three candidates the docket named, measured

Ranger, 24 seeds, level 30, dodge 0.7. Boss floor is The Ferryman tier 1; trash floor is
delve depth 18. Level 30 was chosen by calibration — the shipped row clears **12/24**, so
every row is genuinely contested and can move in either direction.

### The ultimate is not a term in the class's damage. It is the class's damage.

| | share of all damage the class dealt |
|---|---|
| raid boss — `ranger.the_last_hunt` | **87.9%** |
| raid boss — basic attack | 12.1% |
| trash floor — `ranger.the_last_hunt` | **99.5%** |
| trash floor — basic attack | 0.5% |

Cast **10.67 times per boss fight** and **12.21 times per trash floor**. Before asking which
*term inside* the ultimate dominates, this is the number that frames the answer: on a trash
floor the Ranger's entire kit outside its ultimate accounts for one half of one percent of
its output.

### Which term dominates depends on the floor, and that is the finding

| | direct packet | execute rider |
|---|---|---|
| **raid boss** | 34.2% | **65.8%** |
| **trash floor** | **95.9%** | 4.1% |

Both normalised inside the runs the split could read (10 of 24 on the boss, 24 of 24 on
trash). The two floors give **opposite answers**, and both of the docket's candidates 2 and
3 are right — each on a different floor:

- Against a raid boss, the rider is the majority of the ultimate's damage. The boss has the
  largest health pool in the game, so a missing-health rider scales into it, and the fight
  lasts long enough for many casts to land below the threshold.
- Against trash, the rider is a rounding error and the **direct packet** — `base: 3.4,
  scale: "attack"` to `enemies` at radius 350 — does essentially all of it. Trash dies from
  full health, so the rider mostly never applies at all.

This is why a single coefficient change has never satisfied the complaint: **the two things
the player experiences as "this ultimate is too strong" are two different terms.**

### Cadence is a multiplier on whichever of them is doing the work

Halving ultimate-meter generation halves the casts (10.67 → 5.67 on the boss, 12.21 → 7.79
on trash). It is a real lever and neither previous fix touched it. It is not, however, where
the complaint's *size* comes from: the coefficient gap above is a 4.75× on the term the
player sees as the one-shot.

### The ablation table

Read **cleared** first. `secs` covers cleared runs only, deliberately — see the confound
note below.

| config | cleared | secs | dmg taken | casts | measured coeff |
|---|---|---|---|---|---|
| shipped | **12/24** | 58.4 | 3273 | 10.67 | 0.45 |
| rider removed (all) | 9/24 | 59.3 | 3511 | 11.33 | 0.00 |
| — authored only | 11/24 | 60.9 | 3312 | 10.67 | 0.25 |
| — tree-added only | 12/24 | 60.7 | 3349 | 10.79 | 0.20 |
| ult direct removed | 7/24 | 58.8 | 3647 | 11.00 | 0.45 |
| ultimate removed | 7/24 | 60.2 | 3660 | 11.13 | 0.25 |
| cadence halved | 9/24 | 57.1 | 3409 | 5.67 | 0.45 |

The **measured coeff** column is the instrument checking itself, and it is the reason the
ablations can be believed: removing the tree-added rider leaves exactly **0.20** (the
authored number) and removing the authored rider leaves exactly **0.25** (Perfect Ambush),
and `0.20 + 0.25 = 0.45` is the shipped row. An ablation that claimed to remove a term but
left this column where it was would be reporting a confident delta about code it never
reached — CLAUDE.md's standing rule that an instrument which runs but cannot see the change
returns a plausible number rather than an error.

---

## Two of the three classes could not be measured at all

The owner's ruling widened §38 to the whole family. The instrument's answer for the other
two is that **it has nothing to say about them**, and that is a finding rather than a gap to
paper over:

| class | ultimate casts across 24 boss fights | across 24 trash floors |
|---|---|---|
| ranger | 256 | 293 |
| **reaper** | **0** | **0** |
| **assassin** | **0** | **0** |

`docs/execute-threshold.md` already recorded the Reaper's meter reading 0.000 over a whole
raid fight, and attributed it to a raid floor having almost no other kills. **That
explanation is now falsified**: the meter also never fills on an ordinary depth-18 trash
floor, which is nothing but other kills. The Reaper's meter charges only from
`execute`-tagged hits and the Assassin's only from its own kit, and under bot play neither
fills on any floor this project can simulate.

Every ablation row for those two classes is therefore identical to its baseline to four
significant figures, because the term being ablated never fired. **Those rows measure
nothing and must not be quoted as evidence that the Reaper and Assassin are fine.**

What *can* be said about them without a fight, because it is arithmetic on the live data:

| class | authored | adders that reach the ultimate | effective |
|---|---|---|---|
| reaper `death_comes_due` | 1.00 | `the_final_harvest.dcd` +0.20, **by ability id** | 1.20 |
| assassin `contract_fulfilled` | 0.40 | `ex.weak_point` +0.15, by tag `"mark"` | 0.55 |

Both are **deliberate**: the Reaper's adder targets the ability by id and is its Mythic, and
the Assassin's is a node whose prose is *"every strike on a Contract carries an execute
rider"* on an ultimate that applies the Contract. **The Ranger is the only one of the three
whose ultimate collects adders authored for something else**, which is a precise reason the
Ranger is the one that got reported three times.

The Assassin's non-ultimate riders do show up: on trash, removing all riders costs it 7.8%
of its clear time with zero ultimate casts, which is `assassin.execution` (0.6) and the
rest of its kit, not `contract_fulfilled`.

---

## Two instrument bugs found and fixed while building this, both of the house family

Recorded because both are the shapes CLAUDE.md already warns about, and both produced
confident, plausible, wrong numbers before they were caught.

**A duration metric that lies when the change moves the clear rate.** The first draft
averaged seconds over *all* runs. A failed run ends when the bot dies, which is early, so a
configuration that lost more looked *faster* — the tool cheerfully reported the Ranger
clearing raid bosses **2.8% quicker with its ultimate deleted.** `secs` now covers cleared
runs only. This is `docs/raid-party-scaling.md`'s confound arriving from the other
direction, and the giveaway was a sign that made no sense rather than a magnitude that was
merely off.

**A bound so cautious it discarded a real signal.** The split's "is this one packet or
several" guard pooled hits across seeds. `geared()` rolls different gear per seed, so the
ability's base amount differs run to run, and a perfectly clean single-packet ability looked
like a mixture: the tool printed *"not separable"* on a 1-seed pilot where the base was
literally constant at 1,780. The split is now computed **per run** and pooled afterward, and
the report prints how many runs were separable so a thin sample is visible rather than
silent. The usual failure is a bound that grows to fit whatever it is handed; this is its
mirror, and it hides findings instead of manufacturing them.

---

## The instrument

`tools/execute-attrib.ts`, run as `npm run execute-attrib`. A **measurement harness, not an
acceptance check** — it is not in `npm test`, for the same reason `tools/execute-ab.ts`,
`tools/arena.ts` and `tools/builds.ts` are not.

- **Accounting.** `Dungeon.prototype.dealDamage` is *wrapped* — not edited — so every hit on
  an enemy records its ability id, channel, pre-crit amount and the victim's health fraction
  before the hit. `src/game/` must not know it is being watched.
- **The split needs no knowledge of the coefficient.** THE EXECUTE RULE returns zero at or
  above the threshold, so a hit on a healthy target is a direct reading of `base * attack`
  with no rider in it. The rider is then a residual, and the effective coefficient falls out
  as `(amount - base) / (maxHealth * (1 - frac/T))`. That is robust to every route the rider
  arrives by — fourteen authored packets, seventeen tree nodes and mutations, one relic —
  without the tool knowing which applied. It is why the number in the headline is measured
  rather than computed from the definitions.
- **Ablation.** Each term is removed on its own, on the same seeds, by patching the live
  class data and restoring it afterward. The rider is split into `executeMissingHealth`
  (authored) and `addExecuteMissingHealth` (tree-added) because the pilot showed they are
  not the same size and only one of them is what shipped twice.

Args: `--seeds=N --level=N --tier=N --raid=<id> --depth=N --classes=a,b --dodge=N
--floor=boss|trash|both`.

---

## What this does NOT yet decide

No number has been changed. Per the docket, the measurement came first and the fix is a
separate decision that should be taken against these numbers — in particular:

1. **Whether the tag collision is a bug or a balance number.** `withTag: "projectile"`
   reaching an ultimate that happens to be tagged `projectile` is a mechanism question, not
   a coefficient question, and the two available answers (narrow the adders' targeting, or
   accept the sum and size it deliberately) produce very different classes.
2. **That the boss floor and the trash floor want different terms moved**, which no single
   coefficient can express.
3. **That any Reaper or Assassin change ships unmeasured**, because no instrument in this
   repo can make their ultimates fire. The owner's scope ruling stands; this is the honest
   statement of what evidence will and will not exist behind it.
