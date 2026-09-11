# What is actually wrong with summons (docket §37) — measured before tuning

> "Buff Summons, die to easily, needs to scale better with player, summon support for
> affixes in the forge (summon damage %, +1-3 Max Summons, etc.) Make sure summons inherit
> elemental affixes and other player related buffs."

The docket reads ask #1 as *"a summon's health does not track the player's investment"*.
**It does.** `spawnMinion` sets `hp = owner.maxHealth * 0.12 * inheritPower` and
`damage = owner.attackDamage * inheritPower`, and inherits the owner's `attackElement`. The
defect is somewhere else, and tuning `0.12` would have kept its shape.

## The structural gap: mitigation, not health

`hurtMinion` applied **no mitigation at all** — no armour, no resistance; the `element`
argument only coloured the damage number. The owner multiplies their health by armour and
resists (each capped at 75%); the summon multiplied theirs by nothing.

So the *nominal* share is a flat 6% of the owner's health by construction, while the
**effective** share decays as the owner gears up (`npm run summonscale`, 18 chests, seed
4242):

| level | owner EHP | summon EHP | summon share |
|---|---|---|---|
| 10 | 1,005 | 29 | **2.83%** |
| 25 | 2,821 | 58 | 2.04% |
| 40 | 5,011 | 79 | 1.57% |
| 55 | 7,569 | 101 | 1.33% |
| 70 | 10,627 | 123 | **1.16%** |

(necromancer; the other four summoning classes are within 0.2pp at every row, and the
warden bottoms out at **0.99%**.)

**That decay is what "doesn't scale with the player" actually is.** Raising `0.12` moves
every row up and leaves the slope alone. Carrying the owner's mitigation makes the share
**gear-invariant at 6.00%** — algebraically flat, because both sides then divide by the
same mitigation term. That is the fix implemented here: the `Minion` carries
`damageReduction` and `resists` snapshotted at spawn, and `hurtMinion` applies the same
curve `Player.mitigate` does, armour at half weight against non-physical exactly as a hero
gets. Verified live: a level-40 necromancer's summon spawns with `damageReduction 0.731`,
matching its owner, and a 200-damage physical hit goes from **144% of its health to 39%**.

## And it does not fix the reported symptom, which is the more useful finding

An A/B on real floors — inheritance off vs on, 8 seeds, exact `despawnMinion(m, dead)` flag
rather than a proxy:

| row | death rate off → on | median life off → on |
|---|---|---|
| depth 10, lvl 15 | 86% → **86%** | 2.0s → **2.0s** |
| depth 22, lvl 40 | 20% → **20%** | 2.4s → **2.7s** |

Almost nothing. The reason is in the damage that reaches summons at all:

| depth | hits landed on summons (3 floors) | median raw hit | summon maxHealth |
|---|---|---|---|
| 10 | **21** | **508** | ~29 |
| 22 | 323 | 49 | ~139 |

**At depth 10 the median hit on a summon is seventeen times its health.** Mitigation takes
508 to ~254 — still an eight-fold overkill. Nothing in the plausible range of a health
buff survives that either: a 4× health increase still dies to one hit. And only 21 hits
landed across three floors, so summons are not being ground down; they are occasionally
deleted.

Note also that **no enemy melees a summon.** The only three paths into `hurtMinion` are
telegraphs, ground zones and ability packets. Summons die to area damage they do not dodge.

### What that means for ask #1

"Summons die too easily" is **not** a health-pool problem and cannot be fixed by one. The
levers that would actually change it are different in kind:

- **a per-hit cap** (a summon loses at most X% of its maximum health to any single hit),
  which converts one-shots into attrition and makes health and mitigation matter at all;
- **telegraph avoidance** — summons currently stand in everything;
- **accepting it** and treating summons as consumable, in which case the fix is lifespan
  and cadence rather than survivability.

The first is the one that makes the other three asks coherent, because `summonDamage` and
`maxSummons` are worth nothing on a body that gets deleted in one hit. **It is a real
design change and it is not mine to pick** — it is recorded here rather than chosen.

## Where the "other player buffs" line is drawn

Stated explicitly, per the brief.

**Inherited** — things that describe how a body survives or how a hit lands:
`damageReduction`, elemental `resists` (this change), and the already-inherited
`attackElement` and `attackDamage`.

**Not inherited, deliberately:** triggers and granted skills (an item's on-kill nova firing
from eight skeletons is a separate system, not a scaling knob); leech (a summon healing the
owner is a new mechanic, not inheritance); and anything describing the player's *own body* —
move speed, dash charges, pickup radius, coin and gem find. Crit and elemental damage
percentages are **deferred, not refused**: they belong with `summonDamage` in ask #3, where
there is a live read to attach them to.

## Not built here

`summonDamage` and `maxSummons` are **not** added. The `wardPower` ruling is explicit that a
mod key must not exist without a live read in the same branch, and the read they want is the
per-hit-cap decision above. Adding them now would be two more dead stats.

## Instruments

- `npm run summonscale` — the effective-share table. Reports; changes nothing.
- The A/B and the hit-size probe were scratch harnesses. The death/expiry split is taken
  from `despawnMinion`'s own `dead` flag, wrapped, rather than inferred from a health
  reading — an earlier draft guessed, and guessing is what this file's §22 is about.

---

# The per-hit cap — owner-chosen, IMPLEMENTED, NOT VERIFIED (handover state)

The owner picked lever 1 (per-hit cap) over telegraph avoidance and over accepting summons
as consumable. It is implemented and measured; **it has not been through a gate**, and one
of its three acceptance questions is still open. Session ended for token reasons mid-task.

## What is built

`MINION_MAX_HIT_FRACTION = 0.25` in `src/data/minions.ts`, applied in `hurtMinion`
(`src/game/dungeon.ts`) **after** mitigation:

```ts
const mitigated = amount * (1 - armor) * (1 - resist);
const cap = m.maxHealth * MINION_MAX_HIT_FRACTION;
const dealt = Math.max(1, Math.round(Math.min(mitigated, cap)));
```

### Answered: after mitigation, not before

Capping the raw hit first and mitigating afterwards **compounds**: at a level-40 owner's
0.73 damage reduction, a quarter-cap becomes 6.75% of the pool per hit — *fifteen* hits to
kill. That trades the one-shot problem for a tanking-with-skeletons problem. Capping last
makes the bound exact and gear-independent: **at most `1 / fraction` hits, whatever the
owner wears.** Mitigation still does all the work below the cap, where hits are ordinary,
so the two rules divide cleanly — resists govern ordinary damage and scale with gear, the
cap governs deletion and does not.

### Answered: the share is 0.25, measured against the reference already in this document

At depth 10 the median hit on a summon is **508 against ~29 health, seventeen times the
pool**. A/B, 8 seeds, exact `despawnMinion` flag:

| row | cap | died | median life | median hits-to-kill |
|---|---|---|---|---|
| depth 10, lvl 15 | off | **86%** | 2.0s | **1.0** |
| depth 10, lvl 15 | **on** | **19%** | 4.9s | **4.0** |
| depth 22, lvl 40 | off | 20% | 2.7s | 1.0 |
| depth 22, lvl 40 | **on** | **4%** | 4.9s | 7.0 |

Deletion does become attrition: hits-to-kill goes 1 → 4 at depth 10, which is the bound
working exactly. At depth 22 it reads 7 because mitigation keeps most hits *below* the cap
— the cap is a ceiling, not a floor, and that is the intended division of labour.

## RESOLVED: 4% is expiry, not immortality

**The owed check is built, green, and in the gate** (`npm run summonscale`). The cap stands;
`MINION_MAX_HIT_FRACTION = 0.25` is not up for revisiting.

Two passes, because the first proves the design and only the second proves the code.

**Arithmetic**, against a reference the cap cannot move: five boss abilities leave burning
ground and the shortest linger authored anywhere is **2.5s** (`beam`). The cap's bound is
4 hits x `GROUND_TICK` 0.5s = **2s worst case**, which fits inside even the shortest — and
at 17% of a lifespan the cap is what bounds it, rather than the lifespan quietly doing the
work. That last assertion exists so the check says something if someone lowers the fraction
until the arithmetic stops governing.

**Observed**, on real boss floors, against `despawnMinion`'s own `dead` flag: **3 of 3
staged summons killed, 0 expired**, and each took **exactly 5 zone ticks** — against **1
tick with the cap disabled**, on every seed. That comparison-with-a-control is the finding:
the cap turns one-shot deletion into five ticks of attrition and does not make a summon
unkillable.

### The wrong version of this check, kept because it looked exactly like the bug

The second draft asserted **wall-clock under half a lifespan and failed at 11.0 seconds.**
A summon standing in a raid boss's fire for eleven seconds is precisely what
tanking-with-skeletons would look like, and it was tempting to read it as the cap being too
generous and reach for 0.34.

It was not. Attributing it cap-off versus cap-on gives **1 tick versus exactly 5 ticks on
every seed**, while the wall-clock ranges **3.6-11.0s** — and the variance is entirely
**when the boss re-cast**. The zone expires, the summon stands in nothing, the boss casts
again. The draft was measuring the encounter's cooldown and calling it the summon's
durability: a correct instrument answering a question nobody asked.

**The assertion is on tick count now**, which is what the cap actually governs and is
independent of the gaps. Anyone who re-derives the 11-second number should stop here rather
than at the fraction — the number is real, it is just not about summons.

An earlier draft failed a different way and is worth the same sentence: it reported **zero
stagings**, because a boss floor does not reliably leave the bot holding a live summon at
the moment a zone appears. It **failed rather than passing on an empty observation**, which
is the only reason the third draft is believable. The staging now summons on demand through
the dungeon's own `summonFor`.

## SUPERSEDED — the open question as it stood before the check was built

The PM's third condition was: *the cap must not become immortality at the bottom end.*
**That check has not been run, and the depth-22 row is the reason to take it seriously.** A
4% death rate means 96% of summons now run out their 12-second lifespan rather than dying.
That may be correct — a summon that survives its lifespan is a summon that did its job —
or it may be the tanking-with-skeletons outcome arriving by a different route.

**The specific check still owed:** a summon standing in a raid boss's fire zone must still
die, and reasonably fast. The zone tick rate is what decides it — at 4 hits minimum and a
1.5s tick interval that is 6 seconds, which is probably fine; at a 0.3s tick it is 1.2
seconds, which is certainly fine. **Neither has been measured.** `tools/summon-scaling.ts`
does not yet assert it. Do this before trusting 0.25.

If 4% proves too low, the lever is the fraction, not the structure: 0.34 gives 3 hits, 0.5
gives 2. The structure (after mitigation, share of max health) should not change.

## Also not built

- **`summonDamage` and `maxSummons`.** The owner approved them and the cap now gives them
  a live read to attach to, which is what the `wardPower` ruling required. Neither is
  written. `summonDamage` reads in `spawnMinion`'s `power`; `maxSummons` reads in its
  `MINION_CAP_PER_OWNER` clamp. Both need a `Mods` key, a `MOD_POOL` row with a `minTier`
  (`maxSummons` is projectile-count-shaped and should be gated like one), and a Forge entry.
- **The Engineer-with-inheritance assertion.** Owed as a real check, not a one-off: with
  summon inheritance on, the Engineer must stay below the `meterRightAfter >= 1` threshold.
  The two rules live in the same seam — §33 stops a hero's creation crediting the ultimate
  meter, §37 makes hero stats flow *to* creations — and the second must not reopen the first.
- **No gate has been run on any of this.**

## The ruling on inheritance scope (not this branch's scope — the standing rule)

Recorded here so the next person adding a mod key has somewhere to look.

**Inherited:** `damageReduction`, elemental `resists`, and the already-inherited
`attackElement` and `attackDamage`.

**Not inherited, deliberately:** triggers and granted skills (an item's on-kill nova firing
from eight skeletons is a separate system, not a scaling knob); leech (a summon healing its
owner is a new mechanic, not inheritance); and anything describing the player's *own body* —
move speed, dash charges, pickup radius, coin and gem find.

**Deferred, not refused:** crit chance/damage and elemental damage percentages, which belong
alongside `summonDamage` where there is a live read to attach them to.
