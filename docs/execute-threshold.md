# THE EXECUTE RULE — an execute needs a threshold (docket §20)

> "I don't think that ultimate should execute at any HP. Like, it's just insta killing
> bosses, and I'm seeing it at, like, eighty percent health. Like, I'm pushing raids. I
> should not be pushing. So let's just rework that... come up with something else or
> completely remove that... just quadruple the archer's attack speed haste or whatever
> instead."

> "Yeah. Let's do it for reaper and assassin. Like, I just think this mechanic is a little
> broken at the moment. Maybe we'll come back to it. But for now, yeah, add it to the pass."

This is the owner's **second** report of the same ability. Docket §8 answered the first one
by halving `RANGER_THE_LAST_HUNT`'s coefficient (0.4 → 0.2) and bounding its radius. Both
of those were correct and the measurement behind them was honest. It came back anyway,
because **the shape was the bug and §8 sized the number.**

## The diagnosis

`DamageTemplate.executeMissingHealth` added `(maxHealth - health) * coeff` to a hit. That
term has **no threshold**, so it paid out at every health value. At 80% health it still
handed over 20% of the target's whole bar times the coefficient — and a raid boss is the
single largest health pool in the game, so "20% of the bar" is an enormous flat number.
Halving the coefficient made the rider weaker *everywhere*, including at the moment of the
kill where it was doing its job, and still let it fire at full health.

Nothing about the word *execute* applies at 80% health. The threshold is what makes
"wounded" mean anything, and it preserves the class identity better than a small
coefficient does — a coefficient version executes the healthy too, just less.

### This is not a nerf. It is implementing what the abilities have always claimed to do.

The Reaper's "Death Comes Due" has always described itself as freezing *"everything below a
health threshold"*, and its Mythic's mutation note has always claimed *"The Final Harvest
raises the threshold."* **Both were authored in the fiction and never in the code.** The
threshold is restored here, not invented — which is also the honest answer to "why did three
classes change": they did not change, they started doing what their own text says.

## Why the fix is in the vocabulary and not on three abilities

The brief named three abilities. There are **thirty-one sites**.

`executeMissingHealth` is authored on **14** damage packets across 8 classes (assassin ×4,
reaper ×3, swordsman ×3, duelist, magician, ranger, trickster), and on top of that **17
tree nodes, mutations and one relic** *add* the rider to packets that carry none, via
`addExecuteMissingHealth`, across 10 classes — Berserker, Paladin, Corsair, Trickster,
Duelist and `data/relics.ts:487` among them. The Ranger's own `winter_execution` node adds
0.5 to every projectile it has.

That kills the obvious implementation. **A required companion threshold field** would mean
authoring ~31 threshold numbers, 28 of them on classes nobody reported — the uncommanded
balance pass the docket explicitly rules out — and it would be weaker than it looks, because
a required field can be satisfied with `1.0`, which is today's bug spelled out.

So the rule lives at the **one site that ever evaluates the rider**: `executeBonus` and
`EXECUTE_THRESHOLD` in `src/combat/damage.ts`, called from `runEffect`'s `damage` step and
nowhere else. Every authored packet, every mutation, every tree node and the relic flow
through it. **There is no per-site field to omit**, so a rider added tomorrow by any route
is gated for free. This repo's own standing preference: a rule that cannot be violated
beats a check that notices when it was.

## The shape, and the one non-obvious part

```ts
export const EXECUTE_THRESHOLD = 0.5;

export function executeBonus(coeff: number, health: number, maxHealth: number): number {
  const frac = health / maxHealth;
  if (frac >= EXECUTE_THRESHOLD) return 0;
  return maxHealth * (1 - frac / EXECUTE_THRESHOLD) * coeff;
}
```

It is a **normalized ramp inside the band**, not the old term with a gate bolted on, and
the difference is load-bearing:

- at `health = 0` it returns `maxHealth * coeff` — **exactly what the un-thresholded term
  returned.** The finisher is undiminished at the moment it finishes, which is what the
  ability was for.
- at or above the threshold it returns **0** — precisely the reported complaint.
- in between it ramps, with no cliff at the boundary.

### The alternative, and the trade actually being made

The obvious cheaper version — keep `(maxHealth - health) * coeff` and simply skip it above
the threshold — deserves stating accurately, because the first draft of this record got it
wrong and a wrong justification in a design record acquires the same authority as a right
one.

That version is **identical to the old term everywhere below the threshold**, so it would
disturb the twenty-eight unreported riders *less* than the ramp does, not more. Its defect
is a single one: it steps from 0 to `(1 − T) · maxHealth · coeff` at the boundary — at the
Reaper's coefficient against a Ferryman, **~43,000 damage materialising the instant the boss
crosses half health**. That is the owner's "it just insta kills bosses" relocated to 50%
rather than fixed, and it is sufficient on its own to reject it.

So the trade is explicit: the ramp accepts a **bounded reduction inside the band on every
rider, including the twenty-eight nobody reported**, in exchange for a mechanic with no
cliff in it. What those riders keep is their coefficient and their payoff at the kill; what
they lose is some of the middle of the band and all of the contribution against healthy
targets. `tools/execute.ts` pins both halves of that trade rather than leaving it as a
reading of the formula.

## Measurement

`tools/execute-ab.ts`. §8 measured a **Delve** boss at a contested depth — a good instrument
aimed at the wrong floor. The owner was pushing **raids**, and a missing-health rider is
strongest against the largest health pool in the game, so the floor here is
`raidConfig(...)`. That is the only thing that changed about the method.

### The instrument could not see two of the three, and that is a finding

The fight-level A/B can only speak for a class whose ultimate the bot actually casts. Two
of the three cannot be exercised that way at all:

| class | max ultimate charge over a whole Ferryman fight |
|---|---|
| ranger | 1.000 (8 casts) |
| **reaper** | **0.000** |
| assassin | 0.103 |
| necromancer (control) | 0.137 |

~~The Reaper's meter charges only from `execute`-tagged hits and the Assassin's only from
its own kit, so on a raid floor — one enormous body, almost no other kills — they never fill
under bot play.~~ **The floor was not the reason. Struck by docket §38's measurement
(`docs/execute-family.md`), which reran this on an ordinary depth-18 trash floor — nothing
but other kills — and got zero casts there too.** What the conclusion below rests on is
unchanged: an A/B on those two classes would still have reported a confident delta about an
ability that never fired, which is exactly CLAUDE.md's "check that your instrument can see
the thing you changed", and it is why the primary evidence below is the seed-free table
rather than the fight. But the *cause* was diagnosed wrong here, and the corrected causes
are different for the two classes:

- **The Reaper** — `executioners_step` is the only non-ultimate ability in the class carrying
  the `execute` tag its meter feeds on, and `autoSlotNewAbilities` takes the first three
  unlocked abilities in declaration order, so the bot never equipped it. Force-slot it and
  the meter fills on a trash floor. On a raid boss it still only reaches 0.350 across a whole
  fight, because generation is `kill +8 / hitDealt +2` and a boss floor has one body and
  nothing to kill. So the raid-floor half of the original sentence was right for the Reaper —
  for the tag, not for the kill count — and the trash-floor half was wrong.
- **The Assassin** — not a bot artifact at all. Its feeder (`mark_for_death`) *is*
  auto-slotted, on a fully allocated tree with gear equipped, and the meter still caps at
  **12–28%** of the bar over an entire floor on either floor type. Its ultimate cannot be
  cast in normal play. That is a live defect rather than an instrument limitation, and it is
  docketed separately — nerfing an ultimate nobody can reach is the wrong item.

Both rows ran with **15 tree nodes allocated and 5 gear pieces equipped**, so this is not
`docs/engineer-ultimate-loop.md`'s empty-build failure; that was checked explicitly before
the conclusion was drawn.

### The direct instrument: what the rider adds, master → patched

The Ferryman at tier 1 has 105,443 max health. Damage the rider adds to **one hit**, with
each ability's **master coefficient held constant on both sides** — this isolates the rule
from the compensations, which are measured separately below. (Death Comes Due ships at 1.0,
not the 0.8 in this row; see the compensation section for why that is a consequence of the
rule rather than a top-up.)

| ability | 90% | 80% | 60% | 50% | 35% | 20% | 0% |
|---|---|---|---|---|---|---|---|
| reaper Death Comes Due 0.8 | 8435→0 | **16871→0** | 33742→0 | 42177→0 | 54830→25306 | 67483→50612 | **84354→84354** |
| reaper Pale Hook 0.5 | 5272→0 | 10544→0 | 21089→0 | 26361→0 | 34269→15816 | 42177→31633 | 52721→52721 |
| assassin Contract Fulfilled 0.4 | 4218→0 | 8435→0 | 16871→0 | 21089→0 | 27415→12653 | 33742→25306 | 42177→42177 |
| ranger The Last Hunt 0.2 | 2109→0 | 4218→0 | 8435→0 | 10544→0 | 13708→6327 | 16871→12653 | 21089→21089 |

The 80% column is the owner's sentence with a number on it: **one cast of Death Comes Due
was handing over 16,871 free damage — 16% of the boss's entire health bar — against a
healthy boss.** The 0% column is the answer to "don't gut it": unchanged, on every row.

### The fight: Ranger on the Ferryman, 24 seeds, level 60, dodge 0.7

Both sides genuinely contested — neither 0/24 nor 24/24 — so the rows can move in either
direction.

| | master | rule only | **rule + compensation (shipped)** |
|---|---|---|---|
| cleared | 19/24 | 13/24 | **17/24** |
| time to kill | 40.7s | 41.8s | 42.7s |
| **boss 100%→50%** | **25.9s** | 33.7s | **29.4s** |
| **boss 50%→0** | **17.1s** | 14.1s | **16.5s** |
| damage taken | 2976 | 3411 | 3102 |
| ultimate casts | 104 (65 above the threshold) | 125 (81) | 133 (82) |

Read the two halves of the fight against each other, because that is the property the
change claims. The **healthy half lengthened** (25.9s → 29.4s) and the **finishing half did
not** (17.1s → 16.5s). If both had moved together, something other than the threshold was
responsible and the number would not be measuring what it says.

`ult ... above` is the visibility check: 65 ultimate casts landed while the boss was still
at or above the threshold. Under master every one of them was paid a rider on a healthy
boss; under the patch every one is paid nothing. A run with zero casts above the threshold
would have exercised none of this.

**The control is byte-identical across all three configurations** — necromancer 2/24,
28.4s, 35.1s, 8.1s, 2 d.p. identical damage taken. A class carrying no execute rider
anywhere does not move, which is what makes the Ranger's movement attributable.

## The three compensations, one call each

The owner asked for the classes to be paid back, not just subtracted from. They are
different classes and they get different paybacks.

**Ranger — The Last Hunt: an 8-second haste on the caster.** This is the owner's own
suggestion ("just quadruple the archer's attack speed haste or whatever"), read as
**four times the baseline `hasted` window** (2s → 8s at +25% attack speed, +18% move
speed) rather than four times the attack speed itself, which would be a bigger number than
the thing being removed. Per the standing rule about multipliers in a brief, "quadruple"
is direction and magnitude-of-kind, not a literal factor. The trade is the point: the
ultimate stops being a burst that deletes a healthy boss and becomes the opening of a hunt
you then shoot your way through. **The coefficient stays at §8's 0.2.** §8's reason for
halving it is now handled by the rule instead, so restoring 0.4 was available — and
deliberately not taken, because the owner asked for an honest sustained payback rather than
"a resized version of the thing that was wrong."

**Reaper — Death Comes Due: `executeMissingHealth` 0.8 → 1.0.** This is a consequence of
the rule rather than a top-up. Under the un-thresholded term the coefficient meant
"fraction of missing health at *any* health", so it had to stay small — it was being paid
against healthy targets. Under the rule it means "fraction of max health at the moment of
death", and 1.0 is that scale's natural ceiling: at 0 HP the rider is exactly the target's
whole bar. For an ability named *Death Comes Due*, collecting the entire bill is the
definition rather than an escalation. It remains far weaker than master where it matters
(at 35% health: 54,830 → 31,633) and exactly zero above the threshold. **Unmeasured in a
fight**, for the meter reason above — flagged for playtest rather than dressed up with a
number the harness cannot produce.

**Assassin — Contract Fulfilled: finishing blow base 2.6 → 3.4, coefficient untouched.**
Deliberately *not* the Reaper's payback. The Assassin's ultimate is three precise blows on
one marked target, so what it lost comes back as **base** damage, and that distinction is a
safety property: base damage scales with the Assassin's own attack, so it is bounded by the
player's gear and cannot grow with the victim's health bar. A coefficient scales with the
target, which is exactly how a rider turns into "it deletes raid bosses". The Mythic's
`assassin.the_perfect_contract.ult` mutation keeps its 0.4 and gets nothing — raising an
AoE execute is how you walk back into "wipes the entire map".

## The other 28 riders: surfaced, not retuned

The rule reaches every one of them, which is the point; none of their coefficients was
touched, which is the constraint. Because of the ramp, what they lose is only their
contribution against healthy targets — their coefficients and their payoff at the kill are
identical to master. Docketed, not swept:

`assassin` ×3 more, `duelist` ×2, `magician`, `reaper` ×2 more, `swordsman` ×3,
`trickster` ×2, `berserker` ×3, `paladin` ×3, `corsair`, `ranger` ×2 more, and
`data/relics.ts:487`.

If any of them turns out to want its coefficient revisited now that the coefficient means
something different, that is a separate, reported balance item.

## What was deliberately not built

- **No per-ability threshold override.** The Reaper's Mythic note claims to raise the
  threshold and now could genuinely do so via an optional field plus a mutation op. That is
  a fourth thing, and "maybe we'll come back to it" was the owner leaving the door open on
  the mechanic's future, not an invitation to redesign it now. If the Reaper turns out to be
  gutted in play, this is the first thing to reach for.
- **No redesign of the execute concept.**
- **No sweep of unreported classes' numbers.** This pass was correct because it was asked
  for, and it does not set a precedent.

## What changed

- `src/combat/damage.ts` — `EXECUTE_THRESHOLD`, `executeBonus`, THE EXECUTE RULE.
- `src/combat/runtime.ts` — the one call site routes through it.
- `src/combat/ability.ts` — `executeMissingHealth`'s doc says where the threshold lives and
  why there is no field for it here.
- `src/progression/ranger.ts`, `reaper.ts`, `assassin.ts` — the three compensations.
- `tools/execute.ts` — the gate, wired into `npm test` after `npm run relics`. It asserts
  the properties as *comparisons against master's own expression* rather than as bounds on
  the new one: never stronger anywhere (104,052 points swept), exactly equal at 0 HP, zero
  above the threshold with master shown paying across that same range, continuous at the
  boundary, and monotone in health. Falsified before it was trusted — bending the ramp's
  numerator to 1.2 turns three of the nine red, and the "master paid across that range"
  check went red on its own first draft because at *exactly* full health master paid zero
  too, which is a point of agreement rather than of difference.
- `tools/execute-ab.ts` — the measurement harness. A measurement instrument, not an acceptance check:
  it is not in `npm test`, for the same reason `tools/arena.ts` and `tools/builds.ts` are
  not.
