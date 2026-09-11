# Boss cadence, and the bolts that make it land (docket §39)

The owner's words: *"decrease the time in between boss attacks."* Their ruling, taken
through the option prompt: **cadence and the parked bullet-hell bolt dial, in one measured
pass**, because the two compound and measuring them apart measures neither honestly.

What shipped: **`BOSS_CADENCE = 0.6`** in `src/data/bosses.ts`, and per-bolt pattern damage
raised from 0.4–0.6 to 0.6–0.9 of a boss hit. Both reach all 44 encounters.

**0.6 is an owner ruling, not the engineering recommendation.** 0.7 was recommended as the
conservative rung; the owner was shown both with the numbers below and chose the harder one,
explicitly declining a verification pass first. The argument that carried it was docket §38's
mirror image: that ability took three attempts because every fix was sized timidly, and a
difficulty *increase* fails the same way. Don't quietly walk this back toward 0.7.

---

## 1. Which number is the gap — and which one only looks like it

This is the part to read before touching anything, because two well-informed readings of
`src/game/boss.ts` got it wrong before the file was measured, and the second one was mine.

A boss spends its time in exactly three states: **winding up** a cast (rooted), **recovering**,
or charging. So the time between one attack and the next is

```
actionTimer  +  cast
```

- **`boss.ts:432` — `b.actionTimer = BOSS_ACTION_GAP * … `** is the recovery. *This is the
  gap the owner is asking about.*
- **`boss.ts:212` — `const cast = Math.max(MIN_CAST, ability.cast * …)`** is the wind-up.
  **It must not move.** It is the player's entire warning, and shortening it makes hits
  unreadable rather than making the boss aggressive — CLAUDE.md's first boss rule.
- **`boss.ts:223` — `b.cooldowns[id] = ability.cooldown * …`** is *neither*. It is the
  per-card re-pick gate: it decides what `beginAbility` is **allowed to pick**, not how
  often the boss acts.

### Why the dial has to reach two of those three

`beginAbility` can only pick a card that is off its own cooldown. When nothing is ready it
takes a 0.35s beat (`boss.ts:206`) and tries again. A phase-one kit is **two or three cards
with 3.6–8s cooldowns against a ~3s cycle** — already close to cooldown-bound. So cutting
the recovery *alone* does not make the boss cast more often; it makes it **stutter** in
stall beats while it waits for a card to come back. A boss stuttering is not a boss
pressing.

`BOSS_CADENCE` therefore multiplies the recovery **and** every per-card cooldown. The
measurement confirms this is the right shape rather than an assumption: stall beats per
fight go **down**, 13.6 → 8.2, while casts per fight go **up**, 33.5 → 43.9.

### The ceiling this dial can never pass

Roughly **1.0s of the 2.35s gap is telegraph**, and the telegraph is untouchable. So no
value of `BOSS_CADENCE` takes the gap below about a second, and the honest statement of
what the owner's request can buy is "up to about 60% off the gap, asymptotically" — not
"arbitrarily fast." At the shipped 0.6 the gap is 1.79s; at 0.4 it is 1.57s.

---

## 2. The coupling that had to be measured rather than assumed

**Casting locks the boss in place, so its wind-up is also the player's damage window.** A
tighter rotation means the boss spends a *larger* fraction of the fight rooted — more
danger and more free player damage at the same time. Measured: the rooted share goes
**42% → 53%**. Whether that nets out to a harder fight or merely a longer one is empirical,
and it is exactly the confound `docs/raid-party-scaling.md` is the write-up of.

So **no figure in this document divides by fight length.** Fight length is part of what
changed. Every number is a per-run total or a count: wins, potions, damage taken, mechanics
eaten. Seconds appear split by outcome and normalise nothing.

---

## 3. The instrument

`tools/boss-cadence.ts` (`npm run bosscadence`). Reports; never fails the build.

It patches the live timers through `playFloor`'s `onTick` hook rather than editing
constants between runs — `tools/raid-health-ab.ts`'s precedent — so one process sweeps
several values against a **same-binary** control. Every reset of `actionTimer` and of a
per-card cooldown is scaled as it happens (which is exactly equivalent to scaling the two
constants), and a pattern's per-bolt damage is scaled the instant the pattern begins, since
`PatternState.damage` is fixed once there.

**Rows are declared, not cross-produced.** The level that contests a floor is different for
a reader and for a careless player, so a floors × levels × dodge cross-product would spend
most of its runs on rows pinned at 0/N or N/N — which cannot move in either direction and
measure nothing. The six rows below were found with `--calibrate` and every one of them is
between 6/72 and 40/72 on master, *and still contested after the change*:

| row | pre-§39 | shipped (0.6) | per 48-run block |
|---|---|---|---|
| delve d25, lv60, dodge 0.9 | 30/72 | 18/72 | 8, 7, 3 |
| delve d25, lv70, dodge 0.9 | 40/72 | 21/72 | 6, 7, 8 |
| raid Ferryman t4, lv40, dodge 0.9 | 17/72 | 5/72 | 2, 2, 1 |
| delve d25, lv50, dodge 0.55 | 15/72 | 7/72 | 2, 1, 4 |
| delve d25, lv70, dodge 0.55 | 31/72 | 28/72 | 8, 10, 10 |
| raid Ferryman t4, lv60, dodge 0.55 | 37/72 | 24/72 | 12, 5, 7 |

**The contested check was re-run at 0.6 specifically**, because it had only been established
at 0.7, and the distinction is not a matter of taste: the owner owns *how hard* a fight is;
they do not own whether it is *completable*. A row at 0/n would not be a harder fight, it
would be a fact their ruling assumed away. None appeared — every row survives, no single
48-run block sits at zero, and the thinnest row (a tier-4 raid attempted at level 40) is
5/72.

Three readouts exist purely to prove the run reached the code under test, because a harness
that runs but is blind returns a plausible number rather than an error: **`casts`** (if it
does not rise as the dial tightens, nothing reached the boss), **`ph`** (a run that dies in
phase one never saw the haste the later phases carry) and **`pat`** (zero means the bolt
dial was never exercised whatever it was set to).

---

## 4. What it measured

432 runs per cell — six contested rows × 24 seeds × **three disjoint seed blocks**. Blocks,
not one long run: this repo's own campaign comparison reads anywhere from −0.33 to +6.08
across disjoint 12-seed blocks *with no code change at all*, so a delta is only worth
reporting if it holds sign across blocks.

| config | wins / 432 | gap | rooted | stalls | casts |
|---|---|---|---|---|---|
| **pre-§39** | 170 (39.4%) | 2.35s | 42% | 13.6 | 33.5 |
| **shipped — 0.6 + bolts** | **103 (23.8%)** | **1.79s** | **53%** | **8.2** | **43.9** |

The gap is 24% shorter, the boss casts 31% more often over a fight, and it stutters far less
while doing it.

The decomposition was measured at the 0.7 rung, over the same six rows and the same three
blocks, and is what established that the two dials compound:

| config | wins / 432 | gap | rooted | per-block wins |
|---|---|---|---|---|
| pre-§39 | 155 (35.9%) | 2.35s | 42% | 56, 49, 50 |
| bolts only | 145 (33.6%) | 2.36s | 42% | 56, 47, 42 |
| cadence only (0.7) | 140 (32.4%) | 1.94s | 50% | 55, 40, 45 |
| both (0.7) | 114 (26.4%) | 1.96s | 50% | 42, 33, 39 |

**Sign holds in all three blocks** for every candidate; the 0.7 pair is −14, −16, −11 wins
against its own block's baseline.

### The two dials compound, which is the owner's ruling vindicated

Bolts alone cost 2.3 points. Cadence alone costs 3.5. Together they cost **9.5** — more
than the sum. The mechanism is visible in the table: a tighter rotation deals *more
patterns* (4.3 → 4.8 per fight), and `docs/boss-bullet-hell.md` already measured that a
pattern lands five to ten times what a circle lands on a player who reads. Cadence buys
more cards; the bolt dial decides what the extra cards are worth.

Measuring them separately would have attributed ~6 points to two dials and lost the other
3.5 entirely.

### The magnitude was a choice, and the next rung is measured

The dial does **not** bottom out — across 144 runs per point the curve is smooth and
monotone below 0.9:

| `BOSS_CADENCE` | 1.00 | 0.90 | 0.80 | 0.70 | 0.60 | 0.50 | 0.40 |
|---|---|---|---|---|---|---|---|
| gap | 2.40s | 2.25s | 2.12s | 1.99s | 1.85s | 1.71s | 1.57s |
| win rate | 43.8% | 47.2% | 41.0% | 41.0% | 33.3% | 29.2% | 19.4% |
| stalls/fight | 15.5 | 13.9 | 14.4 | 12.6 | 11.7 | 11.3 | 10.8 |

0.7 was recommended as the rung where the gap moves enough to be *felt* (−17%) while every
contested row stays contested. The owner was shown that recommendation alongside 0.6 and
**took 0.6**, which the full-power run puts at 103/432 (23.8%) against a pre-§39 39.4%. The
recommendation is preserved here rather than deleted: it is the record of what was offered,
and a future reader should be able to see that the harder rung was a decision.

`0.90` reading *above* 1.00 is noise (n=144, ±4 points at one sd) and is left in the table
rather than smoothed, because pretending the curve is clean at that resolution is how a
false plateau gets believed — see `docs/blind-instruments.md` entry 32, which is about
exactly that happening on this branch.

---

## 5. What was deliberately not touched

- **The wind-up.** See §1. `MIN_CAST` and `ability.cast` are untouched, and the telegraph
  A/B in `tools/smoke.ts` is the guardrail that says so.
- **The threat of the cards themselves.** The owner explicitly did not choose re-authoring
  the low-threat cards in each kit. The `mean threat` half of `cadence × mean threat` stays
  as it is.
- **`dungeon.ts:1178`, the boss's opening `actionTimer`.** That is the one beat before the
  encounter's first cast, not the time between its attacks, so the dial has no business
  there — and leaving it alone is also what was measured, so the shipped fight is the fight
  this document describes.
- **A second difficulty curve.** There isn't one. `BOSS_CADENCE` is a scalar on an existing
  product; `RAID_HASTE_FLOOR` and `PROVING_HASTE_FLOOR` still bind, and now scale with it on
  purpose, since a tighter rotation is the whole point.

## 6. The gate

`npm run bossvariety` gained a fifth pattern comparison: **every pattern's bolt costs less
than the cheapest card that paints a shape** (max bolt 0.9 < `corruption` 1.1, over 19
shaped cards). The reference is read from the same table rather than written as a number, so
the *next* unparking pass cannot slip through — it is the `HUNT_SPEED`-vs-slowest-hero shape
one table over. Shapeless cards are excluded deliberately: `volley` is a ring of bolts at
0.9, the pattern family's own ancestor, and ranking a bolt against it compares the thing to
itself. Falsified by injection (`noose` at 1.2 → red, named in the message).

---

## 7. What the acceptance chain actually reads from disk

Landed here as a fact rather than left as a step in an argument, because the question comes
up every time a branch is rebased and it was got wrong twice in one evening — once by this
branch's author and once, independently, by the session integrating it.

**The question is not which folder a diff touched. It is whether the diff moves an artifact
a gate step *reads*.** "Docs are safe" is the wrong rule: `docs/blind-instruments.md` is
read by `tools/blind-index.mjs`, which is step 2 of the chain, so a docs-only diff can
absolutely turn the gate red.

**And grepping for a filename in source is not the same question as asking what the process
opens.** `grep -rl docket tools/` returns 22 hits; every one is a prose citation in a
comment, and not one of them is a read. Both wrong answers that evening came from that
method. The reliable move is to enumerate the call sites — `readFileSync`, `readdirSync`,
`createReadStream` — and see what they resolve to.

Doing that, the chain's non-asset reads are:

| what | read by | step |
|---|---|---|
| `docs/game_story_worldbuilding.md` | `tools/world.ts:308` | `npm run world` |
| `docs/blind-instruments.md` | `tools/blind-index.mjs:51` | `npm run blindindex` |
| `package.json` | `tools/check-scripts.mjs:24` | `npm run harness` |
| `src/game/rules.ts`, **as text** | `tools/relics.ts:112` | `npm run relics` |
| `src/styles.css`, **as text** | `tools/smoke.ts:3120` | `npm run smoke` |
| every `.ts` under the sim dirs, **as text** | `tools/modkeys.ts:91` | `npm run modkeys` |
| every `.ts` under `src/`, **comments stripped** | `tools/retiredmods.ts:79` | `npm run retiredmods` |

Everything else the chain opens is an art asset — `src/render/atlas/**` PNGs and their
JSON layouts.

Two consequences worth carrying:

- **`docs/docket.md` is read by nothing.** Its only appearance anywhere in `tools/` is a
  comment on line 1 of `mp-stutter.ts`, which is not in the chain. A rebase whose whole diff
  is the docket cannot invalidate a green — which is what let this branch's gate result
  carry across its rebase on evidence rather than on assumption.
- **Four steps read source as prose**, so "it only changes a comment" is not automatically
  safe either. `retiredmods` strips comments before matching, deliberately, so that a
  tombstone note may name the key it retired; `modkeys` does not.
