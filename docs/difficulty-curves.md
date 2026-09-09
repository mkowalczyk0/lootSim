# Difficulty curves: bosses, trash, and why depth 30 is a wall

> ## ⚠ SECTIONS 2, 3 AND 4 ARE SUSPENDED — THE CHARACTERS WERE WEARING NOTHING
>
> Found 2026-09-09 by the session that wrote this document, while building the same bug a
> second time and catching it. **Do not act on a number in §2, §3 or §4, and do not quote
> the 6/21 roster spread.** The corrected measurements are in flight; this banner is the
> interim so nothing is read straight in the meantime.
>
> **The mechanism, three silent failures deep.** `requiredLevel(item)` is `ilvl - 1` and
> `Player.canEquip` refuses anything above it, so a level-*L* character may wear nothing
> past ilvl *L+1*. `character()` in `tools/curves.ts` defaulted `recordDepth` to
> `round(level / 0.9)` — **the inverse of the very formula under investigation** — and
> chests roll ilvl from `recordDepth`, so above about level 10 every rolled item landed
> one to eleven levels above the cap and `equipFromInventory` silently refused all of it.
> The safety net (`if (!state.player.hasAffinity) equip(a weapon)`) never fired, because
> `weaponFamily` is `this.equipment.weapon?.family ?? "sword"` — **a character holding
> nothing reports as holding a sword**, so for a sword-affinity class the fallback saw
> affinity it did not have.
>
> Measured, not reasoned — §3's six power rungs as §3 actually builds them:
>
> ```
>    rung                  record  ilvl  reqLv  equippable  WORN  maxHP
>    lv15 Advanced x14         17    17     16        0/14     0    398
>    lv35 Elite x20            39    39     38        0/20     0    758
>    lv45 Legendary x20        50    50     49        0/20     0    938
>    lv60 Legendary x30        67    67     66        0/30     0   1208
>    lv90 Legendary x60       100   100     99        0/61     0   1748
> ```
>
> Zero items worn on every rung. **§3 is not a power sweep, it is a level sweep with no
> equipment**, and its maxHP column is pure level scaling at ~180 per ten levels. §2 is
> worse, because it has a cliff exactly where it reports a wall: the character goes from
> 504 maxHP at depth 12 (6 items worn) to 380 at depth 15 (0 worn) — it gets *weaker*
> where its kit stops being wearable. And it landed unevenly across the roster: at lv60
> Legendary x30, 19 of 21 classes went in holding one weapon and **two went in with
> nothing — swordsman and paladin**, the two sword-affinity classes. §2, §3 and §4 all use
> the swordsman, so the headline numbers came from the single worst-affected class.
>
> **What still stands:** `recommendedLevel` is wrong (§ short version item 2). Confirmed
> independently on the corrected harness — at depth 20 at the advised level, a character in
> Basic gear reaches 15% of the objective while one in Legendary clears 3/3. That was
> always the right headline and it survives.
>
> **What does not:** the bracket "depth 20 needs between lv35 Elite and lv45 Legendary";
> "every depth clears given enough power" as stated; "the wall is lethality rather than
> gearing"; and the 6/21 roster spread, which is a spread between 19 characters wearing one
> item and 2 wearing none — not evidence about class balance.
>
> **The harness is already fixed.** §J now rolls every rung at `ilvl = level + 1`, the most
> a character may legally wear, and every cell reports how many items its character has on,
> flagged `!n` when short of six — a check that names its own subject cannot rot into a
> tautology. With that in place the grid is monotone in rarity at every level, which it was
> not before.


A read-only investigation. **No tuning number was changed.** The harness is
`tools/curves.ts` (`npm run curves`), deliberately *not* wired into `npm test` — it plays
several hundred real floors and takes minutes, and it answers a question rather than
guarding a promise.

## Read this first: how the instrument was validated

Every number below the analytic section comes from a scripted bot, so the bot is the first
thing that has to be trusted, and on its first outing it did not deserve to be.

The first version of this harness kept its own paraphrased copies of `tools/smoke.ts`'s
steering helpers. One of them called `FlowField.direction(x, y)` where the signature is
`direction(level, x, y)`. Called with two arguments it returns `null` for every query, so
**the bot never pathfound at all** — it fell back to straight-line steering, could not walk
around a wall, wandered on multi-room floors, and failed to reach monsters it could
trivially have killed. That produced a crop of "floors that can never be completed" and an
apparent 25–67% floor-stall rate, all of it the harness failing rather than the game. The
same paraphrase had also quietly lost the donut, line, cone and burning-ground branches of
`escapeAngle`, so it was not dodging what the real bot dodges.

Two things came out of that, and they are the reason to believe anything here:

1. **There is one bot now.** `tools/bot.ts` holds it and both harnesses import it, so
   `curves.ts` and `smoke.ts` play the same game by construction rather than by care.
2. **This file runs the published control before it measures anything.** Section 0 runs the
   same twelve-seed campaign `smoke.ts` asserts on, through the same imported `campaign`:

```
   sharp    (dodges 55%): deepest 11.8  deaths 5.9  unfinished 0.00
   reckless (never dodges): deepest 9.4  deaths 7.6  unfinished 0.00
   margin 2.4 — smoke.ts publishes sharp 11.8 / reckless 9.4 / margin 2.4
```

Exact match on all three. If that ever stops matching, nothing further in this document
should be believed until it is explained.

That `unfinished 0.00` is also the retraction, stated in the harness's own output: across
240 dives on both bots, **zero** floors ended without either a clear or a death. The
campaign has always measured this and has always found almost none, which is the evidence
the earlier stall claim should have been checked against before it was reported.

### A gap this exposed, worth its own ticket

`tsconfig.json` has `"include": ["src"]`, so **`tools/` is never typechecked**. The
harnesses are bundled by esbuild, which strips types without checking them. A call with the
wrong number of arguments survived to run. Every acceptance test in this repo lives in
`tools/`, so the checking gate itself is unchecked.

## The short version

1. **The content is not tuned beyond what a character can do.** Given enough power, every
   depth measured (15 through 33) clears 4/4 on both flavours. This is a progression and
   economy finding, not an unbeatable-content finding.
2. **`recommendedLevel` is wrong, and that is the headline.** At exactly the level and gear
   the game advises, floors from depth 18 down kill the character in 6–19 seconds having
   done 0–3% of the objective. The number is shown to players.
3. **Boss floors are consistently harder than the trash at the same depth**, by roughly one
   power rung throughout the range, and they fail about six depths earlier at recommended
   gear. The Convergence's boss-band workaround is pointing at something real.
4. **`npm run builds` being red is a different problem.** Checked and ruled out.

---

## 1. The shape of the two curves, before any simulation

No bot involved: this is what the tuning says. A boss's health and damage are the floor's
own `enemyHealth`/`enemyDamage` times an authored `BossSpec`. Trash is the same floor
numbers times an archetype multiplier and `WAVE_HEALTH_MULT`, across
`waves * enemiesPerWave` bodies.

The two are structurally different shapes, which is the whole story:

- **Trash grows smoothly and without bound.** `enemyHealth` is geometric (`1.22^(d-1)`),
  `enemyDamage` is quadratic with a second quadratic term past depth 8, `enemiesPerWave`
  and `maxAlive` climb linearly to their own caps.
- **A boss is a five-step staircase that stops.** `bossFor` walks a list of five encounters
  and then stays on the last one forever.

```
    depth  5+  warden      health x 72  damage x2.4
    depth 10+  choir       health x 80  damage x2.5
    depth 15+  colossus    health x105  damage x2.6
    depth 20+  herald      health x 96  damage x2.7   ← a step DOWN
    depth 25+  nameless    health x145  damage x3.0   ← and then nothing, forever
```

Boss total health against a *trash floor at the same depth*, both in units of `enemyHealth`:

```
   depth  spec       bossHP  floorHP   work    bodies  alive  bossHit  swarmHit  press
     5    warden        72       32      2.24      39     20     2.44        20      8.2
    10    choir         80       66      1.20      80     31     2.54        30     12.2
    14    choir         80       82      0.98     100     37     2.50        37     14.8
    15    colossus     105       82      1.29     100     40     2.59        40     15.4
    20    herald        96      108      0.89     132     51     2.69        51     18.9
    24    herald        96      124      0.77     152     57     2.69        57     21.2
    25    nameless     145      124      1.17     152     59     2.99        59     19.7
    30    nameless     145      147      0.99     180     70     2.99        70     23.4
    35    nameless     145      163      0.89     200     79     2.99        79     26.4
    45    nameless     145      196      0.74     240     99     2.99        99     33.1
```

Parity is crossed at depths 14, 15, 20, 25 and 30 — each staircase step shoves the ratio
back above 1, and between steps the trash curve eats the lead back. **Past depth 25 there
are no more steps, so it only ever falls.**

`press` is the other axis and it does not oscillate at all: `maxAlive` bodies each hitting
for an archetype multiplier, against one boss hitting for its own. 8× at depth 5, 33× at
depth 45, monotonically.

**But total-work parity is arithmetic, not difficulty.** At depth 30 the two pools are
within 1% of each other (2251k vs 2224k) and the measured fights are nothing alike: a boss
is one target you hit continuously, a floor's pool is spread over `maxAlive`-capped waves
with travel between them. That is precisely why the rest of this document plays the floors
instead of computing them, and why the simulated sections disagree with the sign of this
table in places.

---

## 2. The same depth, both flavours, at the power the game recommends

**SUSPENDED — the characters below wore nothing from depth 15 on. See the banner at the top.**

The comparison nobody had run. The Delve only puts bosses on multiples of 5, and the
Convergence deliberately puts its boss *shallower* than its trash, so every earlier reading
compared the two flavours at different depths. Forcing both at one depth, with one
character and one seed, isolates the flavour.

Character built to exactly what the floor advises: `profileFor().recommendedLevel` and the
chest tier a player would plausibly be opening there. Six seeds per cell.
`C/D/S/X` = cleared / died / too slow / stalled.

```
   depth     BOSS: C/D/S/X    secs     dmg    dps  prog |   TRASH: C/D/S/X    secs     dmg    dps  prog
       5       5C 1D 0S 0X    50    1067     21   96% |        6C 0D 0S 0X    36     301      8  100%
       8       6C 0D 0S 0X    41    1256     31  100% |        6C 0D 0S 0X    57     707     12  100%
      10       1C 5D 0S 0X    41    2380     60   62% |        5C 1D 0S 0X    92    2118     24   98%
      12       1C 5D 0S 0X    40    3486     86   56% |        3C 3D 0S 0X    88    2648     33   81%
      15       3C 3D 0S 0X    63    4666     82   80% |        6C 0D 0S 0X   105    3155     30  100%
      18       0C 6D 0S 0X     9     928    144    0% |        0C 6D 0S 0X    19    1992    107    3%
      20       0C 6D 0S 0X     7    1276    196    0% |        0C 6D 0S 0X    17    1758    101    2%
      25       0C 6D 0S 0X     7    2122    304    0% |        0C 6D 0S 0X    17    3206    194    2%
      30       0C 6D 0S 0X     7    1224    175    0% |        0C 6D 0S 0X    13    2762    212    0%
      36       0C 6D 0S 0X     7    1953    383    0% |        0C 6D 0S 0X    11    2696    294    0%
```

### 2a. The boss curve fails first, by about five depths

Boss floors stop being reliably clearable at recommended power around **depth 10–12**;
trash floors hold to **depth 15–18**. In that band the flavours are not close: at depth 10
the boss kills 5 of 6 runs while the trash floor at the same depth loses 1 of 6.

This reproduces the Convergence's finding independently and gives it a number. Its
workaround — boss floor 4 drawing from depth 9–11 while trash floors 1–3 escalate through
12–16 — is pointing at a real asymmetry, not at a measurement artifact.

### 2b. Past depth 18, "difficulty" is the wrong word

From depth 18 down, at the recommended level, every run of both flavours ends in death
inside 7–19 seconds having completed 0–3% of the objective, with incoming damage of
100–380 per second against a health pool of a few thousand.

**This is the largest finding here and it is not about bosses at all.**
`recommendedLevel` is `depth * 0.9 * danger^0.35`; at depth 20 it advises level 18, and a
level-18 character in Elite gear is deleted by a depth-20 floor in seven seconds. That is
not slightly optimistic. The number appears in the UI, and following it is a trap.

Note that this is *not* the same claim as "depth 20 is too hard" — section 3 shows the same
floors clearing comfortably with more power. The floor is fine; the advice is wrong.

---

## 3. Does more power fix it? Yes — completely

**SUSPENDED — not a power sweep. Every rung below wore zero items. See the banner at the top.**

The dimension none of the three earlier readings varied. Sweeping character power at fixed
depth separates "this floor is tuned past what any character can do" from "characters
arrive here under-geared", and those have opposite fixes. Four seeds per cell.

```
  TRASH floors            d15         d20         d25         d28         d33
   lv15 Advanced x14      2C2D        0C4D        0C4D        0C4D        0C4D
   lv25 Elite x14         4C0D        0C4D        0C4D        0C4D        0C4D
   lv35 Elite x20         4C0D        3C1D        0C4D        0C4D        0C4D
   lv45 Legendary x20     4C0D        4C0D        4C0D        4C0D        0C4D
   lv60 Legendary x30     4C0D        4C0D        4C0D        4C0D        3C1D
   lv90 Legendary x60 (*) 4C0D        4C0D        4C0D        4C0D        4C0D

  BOSS floors             d15         d20         d25         d28         d33
   lv15 Advanced x14      0C4D        0C4D        0C4D        0C4D        0C4D
   lv25 Elite x14         1C3D        0C4D        0C4D        0C4D        0C4D
   lv35 Elite x20         4C0D        0C4D        0C4D        0C4D        0C4D
   lv45 Legendary x20     4C0D        4C0D        3C1D        1C3D        0C4D
   lv60 Legendary x30     4C0D        4C0D        4C0D        4C0D        2C2D
   lv90 Legendary x60 (*) 4C0D        4C0D        4C0D        4C0D        4C0D
```

(*) past anything a player can assemble; present only to answer this question.

Three things fall out, and this is the most useful table in the document:

1. **Nothing here is unbeatable.** Every depth measured clears 4/4 given enough power, on
   both flavours, with zero stalls and zero timeouts. **Depth 30 is not a wall in the
   content; it is a wall in the power curve leading to it.** That reframes the whole
   question from "retune the floors" to "why can't a character get strong enough".
2. **The frontier is monotonic in power**, cleanly, with no inversions — which is also a
   sanity check on the instrument.
3. **Boss floors cost about one power rung more than trash at the same depth**, consistently
   across the range: at depth 25 and 28, lv45 Legendary clears trash 4/4 but the boss 3/4
   and 1/4; at depth 33, lv60 clears trash 3/4 and the boss 2/4.

Point 3 is the direct answer to the question this investigation was set up to settle, and
it holds in the same direction at *both* ends of the range. **The boss curve is the harder
of the two, everywhere measured.** The apparent inversion at depth 30 reported earlier was
an artifact of the broken bot and does not survive.

---

## 4. Class spread — the finding hiding inside the depth finding

**SUSPENDED — 19 of these 21 classes wore one item and 2 wore none. Do not quote 6/21.**

Level 60, 30 Legendary chests, both trees filled; all 21 classes; three seeds each.

```
  depth 20 trash   21/21 classes cleared at least once   progress spans  82%–100%
  depth 30 BOSS     6/21 classes cleared at least once   progress spans   3%–100%
  depth 30 trash   12/21 classes cleared at least once   progress spans  14%–100%
```

At depth 20 the roster is uniform. By depth 30 it has fanned out completely: on the boss
floor, fifteen of twenty-one classes cannot finish at all at endgame gearing, and the
progress spread runs from 3% to 100% — a 33× range across characters at *identical* level,
gear and tree investment.

**"Depth 30 is too hard" and "most classes cannot do depth 30" are different statements,
and the second one is better supported.** A curve retune moves every class together and
would leave a 3%-to-100% spread intact — it would simply relocate it. Whatever is
separating the top of the roster from the bottom is worth more than the curve is.

This also confirms the trash/boss ordering from a third direction: at the same depth and
gearing, twice as many classes can finish the trash floor as the boss floor.

---

## 5. The stall defect: what it is, and what it is not

An earlier draft of this document reported a 25–67% floor-stall rate and called it a
critical player-facing defect. **That was the broken bot, and it is retracted.** With the
validated instrument, across 20 seeds per depth:

```
   depth  bodies   cleared  died  slow  STALLED   rate
       5      39        12     0     0        0     0%
      10      80        12     0     0        0     0%
      15     100        12     0     0        0     0%
      20     132        12     0     0        0     0%
      25     152        12     0     0        0     0%
      30     180         5     6     1        0     0%
      35     200         1    10     0        1     8%
```

Zero through depth 30; one run in twelve at depth 35. And the campaign control reports
`unfinished 0.00` across 240 dives.

**What survives, on its own evidence:**

- `dungeon.ts:1288` starts the next wave only when `enemies.length === 0`. One body that
  cannot be reached therefore holds a floor open forever, and the only exit is the entrance
  portal at `EARLY_EXTRACT_KEEP` — 15%. The fragility is real even though it is rare.
- Monsters do sometimes spawn clipping a wall: **1.9% of spawns at depth 35**, near zero at
  depth 1. `spawnBurst` scatters each monster up to 60 units from an open centre, one wall
  is 32 units thick, and `resolveCircle` ejects per wall-rectangle over two passes — correct
  for a thin wall, unable to escape a sealed mass.
- Most wall-clipping monsters are still perfectly killable; clipping is not the same as
  unreachable, and the two must not be conflated (an earlier draft conflated them).

**Recommended shape:** a cheap guard, scheduled as ordinary hardening rather than ahead of
the curve work. The wave director should not be able to wait forever on a body it cannot
reach. Because `Enemy.fromWave` is what counts toward the quota, a cull has to credit the
quota rather than leaving it unreachable.

## 6. Two defects found on the way, neither in scope

**A re-entrancy crash in `AbilityRuntime.notify`** (`src/combat/runtime.ts:230`). It walks
`this.pending` backwards, splices matched entries, and calls `runEffect` — which can
re-enter `notify`. The inner call splices the same array, so the outer loop's index goes
past the end and `this.pending[i]!` is `undefined`:

```
TypeError: Cannot read properties of undefined (reading 'kind')
  at AbilityRuntime.notify (runtime.ts:233)
  at EventBus.emit → Dungeon.applyPlayerDamage → dealDamage → StatusContainer.tick
```

Reproduced with the duelist at depth 20 (seed 72231). The non-null assertion is what hides
it from the type system. In a browser this ends the run. Rare, but it is a crash, not a
balance issue.

**`tools/` is never typechecked.** `tsconfig.json` has `"include": ["src"]`, and the
harnesses are bundled by esbuild, which strips types without checking them. That is how a
call with the wrong arity survived to run and cost a measurement pass. Every acceptance
test in the repo lives in `tools/`.

## 7. What would have to change, if anything

Deliberately not a recommendation to retune the difficulty curve, because the measurements
do not support one:

- **The strongest candidate is `recommendedLevel`**, which is wrong by a wide margin past
  depth 15 and is displayed to players. Correcting the advice costs nothing and changes no
  balance.
- **The second is the power curve, not the floors.** Section 3 shows every depth clearing
  given enough power. The question worth answering next is why a character progressing
  normally arrives at depth 20 at level 18 when the floor needs roughly level 45 in
  Legendary gear — that is a levelling/economy question.
- **The third is the class spread**, which is larger than the depth effect at depth 30 and
  which no curve change addresses.
- **The boss staircase stopping at depth 25 is real but is not currently the binding
  constraint**, because bosses are already the harder flavour at every depth measured. If
  anything the staircase wants *more* steps rather than a rescaling of the trash curve.

## 8. Open questions this could not close

- **One class, one weapon.** Sections 1–3 all use the swordsman. Section 4 shows the roster
  spread is large, so the depth numbers should be read as "for this class" until repeated.
- **The depth-35 residual stall** (1 run in 12) was not diagnosed; it may be the wall-clip
  mechanism or something else.
- **`recommendedLevel`'s correct value is not derived here.** Section 3 brackets it
  (depth 20 needs somewhere between lv35 Elite and lv45 Legendary) but does not fit a curve.
- **Nothing here is browser-verified.** No one on this team can see the game running.
