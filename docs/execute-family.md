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

### The missing instrument: nothing anywhere ever printed the composed coefficient

This is the reusable half of the finding, and it is worth stating before the arithmetic.

**Three people in a row reasoned correctly about a number the game does not use.** The
packet says `executeMissingHealth: 0.2`. The ability sheet says 0.2. The design records say
0.2. `tools/execute.ts` pins the rider's properties *as a function of a coefficient* and is
right about every one of them. Nothing in the repo — not a tool, not a UI surface, not a
log line — ever printed what the coefficient **resolves to after the build is folded in**,
and so nothing ever contradicted the 0.2.

The rider is authored on 14 packets and *added* by 17 tree nodes, mutations and a relic;
`docs/execute-threshold.md` counted those thirty-one sites and drew exactly the right
conclusion from them — that the threshold belongs at the single runtime site, because there
is no per-packet field to omit. What it did not do, and what nobody did, was ask the
adjacent question: **if seventeen things can add to this number, what is the number?**

So the lesson generalises past executes: *when a value is composed from many sources, the
authored value is not the value, and an instrument that reports the authored one is
reporting a number no code path uses.* `npm run execute-attrib -- --roster` is that missing
instrument — it resolves every mutation against every ability through the game's own
`mutationMatches` and prints authored, added and effective side by side.

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

## Is the tag collision systemic? The roster sweep

`npm run execute-attrib -- --roster` resolves every mutation in the game against every
ability through `mutationMatches` — **the game's own matcher, not a reimplementation** — and
prints what each execute rider actually resolves to. 28 packets carry a rider by some route.
The ones that gain the most, and the column that matters is *how* the adder found them:

| ability | authored | added | effective | ratio | how the adders matched |
|---|---|---|---|---|---|
| **`ranger.the_last_hunt`** `[ULT]` | 0.20 | 0.75 | **0.95** | **4.75×** | **both by tag `projectile`** |
| `assassin.ambush` | 0.15 | 0.40 | 0.55 | 3.67× | by ability id |
| `swordsman.masterstroke` | 0.15 | 0.20 | 0.35 | 2.33× | by ability id |
| `trickster.backstab` | 0.25 | 0.30 | 0.55 | 2.20× | by ability id |
| `reaper.reaping_arc` | 0.20 | 0.10 | 0.30 | 1.50× | by tag `melee` |
| `assassin.contract_fulfilled` `[ULT]` | 0.40 | 0.15 | 0.55 | 1.38× | by tag `mark` |
| `reaper.death_comes_due` `[ULT]` | 1.00 | 0.20 | 1.20 | 1.20× | by ability id |
| `berserker.worldbreaker` `[ULT]` | **0.00** | 0.30 | 0.30 | new | two by tag, one by id |

Three things fall out of it:

- **The Ranger's ultimate is the worst case in the game by a wide margin**, and it is the
  only one of the top four whose adders are *all* tag-matched. Everything above it in
  absolute terms got there by a node that named it.
- **The other two family members' adders are deliberate.** The Reaper's targets its ultimate
  by id and is its Mythic; the Assassin's targets tag `mark` and its prose is *"every strike
  on a Contract carries an execute rider"* on an ultimate that applies the Contract. That is
  a precise reason the Ranger is the one reported three times, and a reason not to treat all
  three the same.
- **The two Ranger hybrids are not themselves wrong.** They also grant +0.75 to `splitshot`,
  `barbed_arrow` and `pinning_shot` — the Ranger's basic projectiles, which is exactly what
  their prose describes. The ultimate is collateral, and it is the only packet in the kit
  that is an AoE nuke at radius 350 rather than a single held shot.
- **One more sighting, unreported and much smaller**: `berserker.worldbreaker` is an ultimate
  with **no authored rider at all** that executes purely because two tag-matched tree nodes
  reach it. Same shape, a sixth the size. Flagged, not swept — a separate item.

---

## The fix: narrow the reach, edit no coefficient

**Owner ruling, via the option prompt: the whole execute family.** What actually shipped
under §38 is the **Ranger only** — the Berserker was added and then withdrawn (below), and
the Reaper and Assassin became docket §40 once the measurement showed their ultimates cannot
be cast at all.

`ranger.perfect_ambush` and `ranger.winter_execution` each became three mutations scoped by
ability id — `ranger.splitshot`, `ranger.barbed_arrow`, `ranger.pinning_shot` — instead of
one targeting `{ withTag: "projectile" }`. The precedent is `assassin.weak_point` one file
over, which targets `{ abilityId: "assassin.ambush" }` and is precisely scoped.

**No authored coefficient was edited.** The three basic shots keep the full +0.75 they have
always had; only the ultimate stops collecting it.

| | effective coefficient on `the_last_hunt` |
|---|---|
| before | **0.95** (4.75× the authored 0.20) |
| after | **0.20** (1.00× — exactly what the packet says) |

A **79% cut delivered without a fourth guess at a number**, which is the property that makes
it defensible after three attempts at sizing one.

### The A/B: 4 disjoint 24-seed blocks, branch vs master

Same seeds both sides, toggled with `git stash` so **only `ranger.ts` differs**. Disjoint
blocks because CLAUDE.md's campaign lesson is that a margin read once can be sitting on the
edge of the noise floor rather than its plateau, and only a second disjoint sweep at the same
size tells you which.

**Level 50, Ferryman tier 3** — the population that matters, because the owner was "pushing
raids" and the second hybrid only comes into allocation range around level 50. Tier 3 was
chosen by calibration: at tier 1 the bot clears 8/8 and at tier 5 it clears 0/8, and neither
can move.

| block | ult share of boss bar | cleared | kill secs |
|---|---|---|---|
| 4000 | **24.2% → 15.3%** | 10/24 → 7/24 | 81.6 → 79.2 |
| 9001 | **20.4% → 15.2%** | 6/24 → 6/24 | 82.7 → 88.7 |
| 14002 | **17.2% → 12.5%** | 5/24 → 3/24 | 105.0 → 109.6 |
| 19003 | **28.3% → 17.7%** | 9/24 → 8/24 | 95.5 → 102.2 |
| **total** | **22.5% → 15.2%** | **30/96 → 24/96** | |

**Read the share-of-bar column, not the clear rate.** It is the unconfounded one: it measures
how much of the boss the ultimate personally deleted, it does not divide by a fight length
that the change itself moved, and it does not compare two different populations of surviving
runs. It falls in **all four disjoint blocks**, by roughly a third, which is the fix doing
exactly and only what it claims. The clear rate moves the same way but is the weaker
instrument — 24 seeds resolves a 6-run difference poorly, and two of the four blocks are
within one or two runs.

The self-check that makes the rows admissible: the measured coefficient reads **0.95 on
master and 0.20 on the branch** at this level, zero variance on both sides. A row where that
column had not moved would be reporting a confident delta about code it never reached.

**Level 30 was measured first and understates the fix, on purpose to record why.** Four
disjoint blocks there showed ~3% slower kills and a flat clear rate — because at level 30
`armTrees` only allocates *one* of the two hybrids, so master is 0.45 rather than 0.95 and
the block measures a 56% cut instead of a 79% one. That is "confirm your instrument can see
the thing you changed" applied to one's own result, and it is why the level-50 set exists.

---

## The test this fix applies, and the one it does NOT

**The test is a mismatch between a node's prose and its reach — not the presence of tag
targeting.** This matters more than the fix, because §38 is otherwise very easy to
over-apply, and `withTag` is a legitimate and widely-used authoring idiom.

- **The Ranger fails the test.** "A shot fired from stealth or Deadeye"; "a held Deadeye
  shot." Neither describes an AoE volley at radius 350 that marks every elite in sight.
- **The Berserker passes it**, and was withdrawn from this pass because of it — see below.

Tag targeting is not a defect to hunt down. A node that says "every melee hit" and reaches
every melee hit is working.

### The Berserker: added to this pass, then withdrawn

`berserker.worldbreaker` was flagged by the roster sweep as the same shape — an ultimate with
**no authored rider at all** reaching 0.30 purely through adders — and was briefly added to
§38. It was withdrawn on reading the prose, and the reasoning is recorded because the
near-miss is instructive:

| | |
|---|---|
| `worldbreaker` tags | `["ultimate", "melee", "heavy", "area", "nova"]` |
| its own description | *"An escalating sequence of enormous axe strikes…"* |
| `predator.blood_scent` `withTag:"melee"` | *"hits punish the wounded"* — general by design, names no ability |
| `deathblow.heavy` `withAllTags:["melee","heavy"]` | *"**heavy attacks** consume a chunk of your remaining health for catastrophic damage"* |
| `blood_god.worldbreaker` `abilityId` | the Mythic, deliberate |

A heavy melee attack is not collateral damage from a node about heavy melee attacks — it is
the paradigm case of what that node promises. **Narrowing it would have deleted an effect the
node's own text sells**, which is the inverse of the Ranger fix rather than the same shape.

One arithmetic note, because the withdrawal was nearly argued on a wrong premise: narrowing
the two tag adders would **not** have taken worldbreaker to zero. `blood_god.worldbreaker`
targets by ability id, so it would have gone 0.30 → 0.10. "This ability no longer executes"
and "this ability executes less" are different sentences and the record should carry the true
one.

---

## Docket §40: the Reaper and the Assassin cannot cast their ultimates

Split out of §38 once the measurement showed there was nothing here to nerf. Recorded here
because the docket cites the design record, not the other way round.

**Both were measured on a fully armed character** — 15 tree nodes allocated, 5 gear pieces
equipped, `geared()` calling `armTrees()` and opening 14 Advanced chests. This was checked
explicitly first, because `docs/engineer-ultimate-loop.md` records this project already
shipping a fix verified against a character structurally incapable of expressing the bug.

| config (level 30, seed 4000) | skills | max charge | casts |
|---|---|---|---|
| ranger, auto-slot | splitshot, barbed_arrow, snare_trap | 1.000 | 11 boss / 14 trash |
| reaper, auto-slot | reaping_arc, soul_brand, grave_sweep | **0.000** | 0 |
| reaper, + `executioners_step` forced | reaping_arc, soul_brand, executioners_step | 0.350 boss / **1.000** trash | 0 / 1 |
| assassin, auto-slot | garrote, ambush, **mark_for_death** | 0.120 boss / 0.150 trash | 0 |
| assassin, + `poison_needle` forced | garrote, ambush, poison_needle | 0.280 trash | 0 |

**The Reaper — a bot artifact over a real fragility.** Its meter feeds only on
`execute`-tagged events, and `executioners_step` is the **only** non-ultimate ability in the
class carrying that tag (the ultimate itself is refused by THE ULTIMATE RULE, which is what
makes this narrow). `autoSlotNewAbilities` takes the first three unlocked abilities in
declaration order, so the bot never equipped it. Forced in, the meter works on trash. On a
raid boss it still only reaches 0.350 across a whole fight, because generation is `kill +8 /
hitDealt +2` and a boss floor has one body and nothing to kill. **This confirms docket §24
and corrects its cause: the tag, not the floor.**

**The Assassin — a live defect.** Its feeder (`mark_for_death`) *is* auto-slotted; the
force-slot row is byte-identical, which is the control that rules out slotting as the
explanation. Full tree, full gear, correct ability equipped, and the meter caps at **12–28%**
of the bar over an entire floor on either floor type. Its ultimate cannot be cast in normal
play.

The detail that makes it undeniable: `ASSASSIN_ULTIMATE_METER` **already carries a comment
recording this exact bug being fixed once** — an `on: "hitDealt"` rule that "never fired once
in 1320 events". The fix moved the hook to `statusApplied` and never checked that the rates
(+3 per mark, +2 per poison) could reach 100. So it has now failed twice in the same place,
the second time with a comment in the source asserting it was fixed. **That is the same shape
as the Ranger's authored-versus-composed coefficient: a written claim standing in for a
measurement.**

Nerfing an ultimate nobody can cast is the wrong item entirely, which is why this left §38.

---

## A note on how the fourth and fifth terms were found

The docket named three candidates — cadence, the direct packet, the rider. That list was a
**scope inherited from the complaint**: it enumerated the parts of the ability the owner was
describing. The fourth term (the composed coefficient) was found by measuring the ability
rather than reading it, and the fifth (`berserker.worldbreaker`, and with it the whole
question of which adders are legitimate) was found only because
`npm run execute-attrib -- --roster` swept **all 28 rider-carrying packets** instead of the
three the docket named.

Keep the roster mode. A sweep that costs nothing and covers the whole roster is how a
candidate list inherited from a bug report gets checked against the game that actually exists.
