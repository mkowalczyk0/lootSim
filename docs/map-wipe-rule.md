# THE MAP-WIPE RULE — no skill reaches the whole floor by omission (docket §30)

> "No skill in the game should have the ability to wipe the entire map out — similar to
> archers ultimate we looked at, paladin has something similar on his aegis rush. Do a
> sweep of every skill."

This is the owner's **second** report of the same mechanism in two different classes. The
first (docket §8/§20, the Ranger's execute) was answered by bounding that one ability's
radius. That was correct and it did not generalise, because the defect was never in the
ability — it was in what an ability got for saying nothing.

## The diagnosis

One line, in `selectActorIds`, `src/combat/runtime.ts`:

```ts
const r = ctx.ability.shape?.radius;
const bounded = r === undefined ? hostiles : hostiles.filter(... <= r);
```

`to: "enemies"` bounded itself by the ability's `shape.radius` and, **when the ability had
no shape at all, fell through to every hostile on the floor.** `shape` is a property of the
*ability*, not of the effect step, so a 320-unit charge with a bounded `range` still hit the
entire map the moment one of its steps said `to: "enemies"`.

The existing comment defended this as deliberate — *"field-wide otherwise (a room-wide
ultimate like Death Comes Due or Damnation)"*. **That defence is the bug.** It makes
unbounded the default and bounded the opt-in, so every ability authored without thinking
about reach wipes the map, and so does every one written tomorrow. Two of the twenty-one
classes the owner happened to play are how this surfaced; it was never about those two.

## The scope, measured rather than grepped

A regex over `src/` reports 67 sites across 19 classes. Walking the *loaded* class data
instead — which is what `tools/mapwipe.ts` does, and the difference matters because a regex
counts mutation packets and string literals alongside abilities:

| | |
|---|---|
| abilities with a `to: "enemies"` step on their own effect list | **39** (63 steps) |
| of those, no `shape.radius` — field-wide before this change | **31**, across 16 classes |
| sites **added** by tree nodes, hybrids, archetypes, relics and named items | **64** |

That last row is the one that decides the shape of the fix, and it is why the honest number
is not "31 abilities": **the majority of `to: "enemies"` sites in this repo are not on an
ability's effect list at all.** They arrive from `addEffect` / `replaceEffects` / `trigger`
mutations attached to whatever ability a tree node lands on, where the reach is not knowable
until runtime.

## Why the fix is at the runtime site, and not a required field

This is the execute threshold's argument almost word for word (`docs/execute-threshold.md`),
and it settled the hard question already. A required per-packet `shape.radius` would mean:

- authoring ~95 numbers, the overwhelming majority on classes nobody reported — the
  uncommanded balance pass CLAUDE.md rules out; and
- being satisfiable with `99999`, which is the original bug spelled explicitly — exactly
  what `1.0` would have been for the execute threshold.

So the rule lives at the **one site that ever resolves the selection**. There is no
per-site field to omit, which is the project's stated preference: *a rule that cannot be
violated beats a check that notices when it was.*

## The shape

**1. Unbounded stops being something you get by omission and becomes something you say.**
`EffectTargetSel` gains `"enemiesEverywhere"`. `to: "enemies"` is now **always** bounded;
an ability that genuinely means the whole floor declares it. An ability written next month
that says `to: "enemies"` and authors no shape cannot wipe the floor, and its author need
do nothing to get that.

**2. The bound is derived from what the ability already says about itself** — `enemyReach`,
most specific rung first:

| rung | source | who it serves |
|---|---|---|
| 1 | `step.radius` | the three taunts that authored one (see below) |
| 2 | `ability.shape.radius` | unchanged from before §30 |
| 3 | `ability.shape.length` | a line or cone reaches its length |
| 4 | the largest `zone.radius` the ability makes | Eye of the Tempest: the status matches the storm |
| 5 | `ability.range` | traps, charges, thrown things |
| 6 | `DEFAULT_ENEMY_REACH` | self-targeted reprisals and auras, which say nothing at all |

**3. The circle is centred where the ability happens.** A `targeting: "point"` ability that
**does not move its caster** — a trap, a mine, a painted mark — centres on the point it was
aimed at. Without this, bounding would have *killed* five traps rather than bounded them: a
snare placed 140 units away, measured from a player who then walked off, catches nothing.
Everything else centres on the caster's live position, exactly as before. (Deliberately not
used for `direction` mode either, where `targets.point` is a heading rather than a location.)

The "does not move its caster" half of that rule was **not** in the first version of this
change, and the smoke test is the only thing that found it. Heavenly Fist is
`targeting: "point"` with `shape.radius: 150`, so it was bounded before §30 and its reach
did not change at all — but it *vaults* to the aim point, and `leapTo` deliberately stops
short of the point (`dist - (radius + 10)`), with a wall stopping it shorter still.
Anchoring on the aim left a 150-unit circle sitting where the monk meant to land while the
monk stood somewhere else: `FAIL Monk: the ultimate does something — dealt 0`. When the
caster travels to the action, the caster is the anchor. **The static gate could not have
caught this** — every number in its table was correct — which is the argument for the live
pass being in the gate rather than being a thing that was run once by hand.

### The one invented number

`DEFAULT_ENEMY_REACH = 320`, and it is calibrated against the repo's own authored radii
rather than taste. Every non-ultimate that declares a radius sits at or below **160**
(Crimson Howl); the two ultimates that declare one sit at **350** and **400**. 320 is
therefore above anything a normal skill asks for — nothing is squeezed below its declared
peers — and below both ultimates that went to the trouble of saying how big they are, so
**omitting a shape can never buy more reach than declaring one.** A floor's rooms run
448–640 units across, so this is "the room you are standing in", not "the floor".

## Two live bugs found on the way, both fixed here

- **`threat.radius` was authored and read by nothing.** Three taunts declare one —
  Fortress Call (200), Citadel (260), Bear Aspect (150) — and `selectActorIds` never looked
  at it and neither did the `threat` step. Fortress Call's own description says *"nearby
  enemies must come at you"*; it taunted the whole floor. It is rung 1 of the ladder now,
  which is what it always looked like.
- **`projectile.onExpire` never reaches the host at all.** `ProjectileRequest` has no field
  for it, so `spawnProjectile` drops it. Three of the `to: "enemies"` sites in the sweep
  (Ember Orb, Powder Keg, Cyclone Blade) are inert today. **Not fixed here** — deliberately,
  because landing that seam *before* this change would have created three new map-wipes.
  It is safe to land now.

## What a player will actually notice

The full table is `npm run mapwipe`'s own output — it prints every site it walked, so a
scope that silently empties is visible rather than green. The reach changes worth naming:

| ability | was | now | via |
|---|---|---|---|
| `paladin.aegis_rush` | whole floor | 320 around the landing point | `range` |
| `juggernaut.fortress_call` | whole floor | 200 | its own `step.radius` |
| `juggernaut.citadel` (ULT) | whole floor | 260 | its own `step.radius` |
| `warden.bear_aspect` | whole floor | 150 | its own `step.radius` |
| `stormcaller.eye_of_the_tempest` (ULT) | whole floor | 240 | its own zone |
| `reaper.pale_hook`, `corsair.powder_keg` | whole floor | 260 | `range` |
| 5 traps/mines (snare, explosive, shock mine, mirror trap, painted target) | whole floor, centred on the player | 140–200, centred on the trap | `range` |
| 9 self-targeted reprisals and auras | whole floor | 320 | `DEFAULT` |

### Declared field-wide, and the two that are an open question

Four abilities keep the whole floor, because each one's own description says so. They are
pinned in `tools/mapwipe.ts`; adding a fifth fails the gate, and so does silently dropping
one.

| ability | its own words |
|---|---|
| `warlock.damnation` (ULT) | "Brand **every enemy on the field**." |
| `reaper.death_comes_due` (ULT) | "Time freezes for everything below a health threshold. The Reaper **walks the field**." |
| `alchemist.unstable_reaction` | "Force **every chemical zone on the field** to react at once." |
| `engineer.remote_detonation` | "Trigger **every mine and expendable device on the field** at once." |

The first two are ultimates and are the two the original code comment named — they are the
documented intent and they stay.

**The last two are not ultimates.** Unstable Reaction and Remote Detonation are 16-second
cooldown skills dealing 2.6 and 2.4 scale damage to every enemy on the floor. Their text is
field-wide, so bounding them would be a balance change nobody asked for and they are left
exactly as they are — but under the owner's own sentence, *"no skill in the game should have
the ability to wipe the entire map out"*, these two are the closest surviving relatives of
the thing that was reported. **That is an owner call, not this change's to make**, and it is
recorded here rather than decided.

Two more worth the owner's eye, bounded here but on a number derived rather than designed:

- **`paladin.aegis_rush` at 320.** That is its *charge distance*, which is the only number
  the ability supplies. Its own text says it releases "a protective **pulse** where you
  land", and a pulse is not 640 units across. Bounding it to its charge distance closes the
  reported bug without inventing a nerf; if the owner wants it to read as a pulse, the
  number wants to be nearer 120–150.
- **`duelist.riposte` / `perfect_riposte` at 320 (DEFAULT).** A counter-attack arguably
  ought to hit *the attacker*, not a circle. That is a targeting question rather than a
  reach question, and it is left alone.

## Measurement

`npm run mapwipe`, in `npm test`. Two passes, and the second exists because the first is a
reading of the data rather than of the fight.

- **Static.** Every site's reach is compared against a **fixed reference the code under
  test cannot move** — `640 × 3`, from `level.ts`'s own room constants, not from the
  abilities being measured. It prints `walked 21/21 classes, 63 sites … plus 64 more`, so
  an emptied scope is visible, and it fails if the class count or either site count hits
  zero.
- **Live.** Monsters are strung along +x at 60, 700, 1000 and 1400 units and the ability is
  cast for real in a `delveConfig(8)` dungeon. A bounded ability must leave the far ring
  untouched **and hit the near one** — both directions, because a probe that silently stops
  casting hits nothing, misses the far ring, and is indistinguishable from a working bound.
  `duelist.riposte` was in this list until exactly that happened: it is a `reactive`, it
  fires only on damage the staged hero never takes, and it passed green having cast nothing.

### Falsified, in both halves

Against master's `selectActorIds`, the same live probe hit **every** monster out to 1400
units for both Aegis Rush and Overgrowth; after, both stop. Re-injecting the real regression
(`enemyReach` returning `Infinity` when nothing is authored) turns both passes red at once —
the static one with `non-finite reach` on 20 sites, the live one with `warden.overgrowth
reached 700,1000,1400 units`. Adding an undeclared `to: "enemiesEverywhere"` site fails the
pin. Removing a pinned one fails it too.

## Routes to the same outcome that were checked and are *not* open

The owner asked for a sweep of the outcome, not of the one selector.

- **`to: "allies"` is field-wide and unbounded** — the same omission, in the same function.
  Left alone deliberately: 35 sites, almost all Bard and Paladin party support, and nothing
  there is offensive. Summons share the caster's faction, so a Bard's heal does reach every
  skeleton on the floor; that is a buff-range question, not a map-wipe, and bounding it
  would be an uncommanded nerf to two support classes. **Named here so it is a decision
  rather than an oversight.**
- **Projectile pierce is not a route.** `pierce` is `pt.pierce ?? 0` at the spawn site, so
  an unauthored pierce stops at the first body. 19 projectiles author none; all 19 stop.
- **Projectile count is not a route.** No `count` scales without a literal.
- **No authored `shape.radius` is floor-sized.** The largest in the repo is 400
  (Astral Collapse), well inside a room.
