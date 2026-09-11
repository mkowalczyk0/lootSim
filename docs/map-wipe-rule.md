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
  It is safe to land now — but it should land on **its own branch with its own
  measurement**, not folded in here: three abilities gaining an effect they have never had
  is a balance event, not a cleanup.

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
| `alchemist.unstable_reaction` | whole floor | 320 | authored (see below) |
| `engineer.remote_detonation` | whole floor | 320 | authored (see below) |
| **`alchemist.unstable_reaction` with Mad Scientist allocated** | whole floor | **416** | a dead tree node waking up — see below |

### Declared field-wide — two, and both ultimates

Two abilities keep the whole floor. They are pinned in `tools/mapwipe.ts`; adding a third
fails the gate, and so does silently dropping one.

| ability | its own words |
|---|---|
| `warlock.damnation` (ULT) | "Brand **every enemy on the field**." |
| `reaper.death_comes_due` (ULT) | "Time freezes for everything below a health threshold. The Reaper **walks the field**." |

These are the two the pre-§30 comment in `runtime.ts` named as the reason the unbounded
default existed, so they are the documented intent and they stay.

### The two that were nearly a third and a fourth

`alchemist.unstable_reaction` and `engineer.remote_detonation` were briefly declared
field-wide, on the strength of their own descriptions saying "on the field". **They were
bounded instead, to 320, and their descriptions rewritten to match**, on the owner's own
sentence: *"No skill in the game should have the ability to wipe the entire map out."*

The reasoning is worth keeping, because the first instinct was to treat the prose as
intent. **An ability's authored text is not an exemption.** It is the cheapest thing in the
repo to change, and here it was describing the bug rather than a design: both are
*non-ultimates* on 16-second cooldowns dealing 2.6 and 2.4 scale damage to every enemy on
the floor. A 16-second cooldown does not buy the whole floor. If either genuinely needs the
floor to work, it declares `enemiesEverywhere` and becomes an ultimate-tier statement.

Both now carry an explicit `shape: { radius: 320 }` rather than falling through to the
default. That is deliberate: the Mad Scientist path's `{ kind: "targeting", scaleRadius: 1.3 }`
mutation on Unstable Reaction had nothing to scale — the ability had no shape — so the node
was a no-op. Authoring the radius makes that tree node live for the first time.

### A dead tree node woke up, and it is now the largest non-ultimate reach in the game

Giving Unstable Reaction an explicit `shape: { radius: 320 }` had a consequence worth
stating in the player-visible list rather than burying: the Mad Scientist path's
`ms.overpressure` carries `{ kind: "targeting", scaleRadius: 1.3 }`, which had **nothing to
scale** because the ability had no shape. **A player who has spent a point there gets
something tonight they have never had**, and 1.3 × 320 = **416** — larger than any authored
radius in the game, including both ultimates that declare one (350 and 400).

This is the same species as the `projectile.onExpire` seam held back above — an inert thing
becoming live, changing behaviour nobody requested — and it differs in degree rather than in
kind. It is recorded here on that basis, not defended as too small to mention.

**Does 416 undermine the property the 320 calibration was chosen for?** No, and the
distinction is worth being precise about. The property is *"omitting a shape can never buy
more reach than declaring one"*, and it governs the **authoring default**: `DEFAULT_ENEMY_REACH`
(320) sits below the largest declared radius (400), so an ability that says nothing never
out-reaches one that does. Unstable Reaction now *declares* 320; it is on the declaring side
of that line. What takes it to 416 is a **mutation**, and exceeding an authored base is what
mutations are for — the precedent is already live on master, where
`swordsman.sword_saint.eclipse` takes Sword Eclipse from 160 to 200.

So the property holds. What is *new*, and is a balance observation rather than a structural
one, is that **a non-ultimate on a 16-second cooldown now has a larger radius than any
ultimate in the game.** Whether that is acceptable is an owner call. The cheapest lever if it
is not: author 300 instead of 320 on this one ability, putting the mutated value at 390, just
under Astral Collapse's 400. That was deliberately *not* done here, because picking a number
to dodge a conversation is how the 320 calibration would stop meaning anything.

### Four of the six `scaleRadius` mutations in the game are dead

Found while checking the above, and reported by `npm run mapwipe` every run so it cannot
quietly change. `{ kind: "targeting", scaleRadius: n }` multiplies `shape.radius`; four of
the six mutations that use it target abilities that have no `shape.radius` at all —
`marauder.heavy_grip` (every `heavy` ability), `tr.cluster_charge` (Explosive Trap),
`sl.full_circle` (Reaping Arc), `sa.cluster_mine` (Shock Mine). Before §30 only one of the
six did anything; now two do.

**The §30 ladder does not fix this and is not trying to.** It *derives* a reach without
writing one, so an ability bounded by its `range` still has no `shape.radius` for a mutation
to scale. Those four nodes were dead before this change and are dead after it — not a
regression, but a real finding, and the obvious long-run answer (have the ladder write its
result back onto the ability so mutations have a field to act on) is a change to mutation
semantics that deserves its own branch.

### Open tuning questions, recorded rather than decided

- **`paladin.aegis_rush` sits at 320, which is its charge distance, not a designed pulse.**
  Its own text says it releases "a protective **pulse** where you land", and 320 is a
  640-unit circle — most of a room. Bounding it to the only number the ability supplies
  closes the reported bug without stacking a second balance change on top of a fix, which
  is the call made here deliberately. **If it still reads wrong in play, the recommended
  number is 140** — just above the largest trap radius (`trickster.mirror_trap`, 160 is
  the range not the blast) and in line with `monk.heavenly_fist`'s authored 150, which is
  the closest thing in the repo to "a big impact where you land".
- **`duelist.riposte` / `perfect_riposte` counter a 320 circle rather than the attacker.**
  A counter-attack arguably ought to hit whoever hit you. That is a targeting question, not
  a reach question, and it is left alone.

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
