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
