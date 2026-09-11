# Boss bullet hell: seven patterns, and the question each one asks

Design record for the owner's boss update (2026-09-11), verbatim: *"Every boss needs more
bullet hell attacks — think like some touhou shit, needs to really challenge the players
movement skills. Users still report repetition when fighting bosses. No need to stress test
time consuming statistical balancing methods here, we just need them to do more and
challenge players more."*

**Status: built on `feat/boss-bullet-hell`, cheap gates green (`check`, `bossvariety`,
`legends`), full gate pending a slot. Not merged.** The owner judges this by playing.

## 1. Where the repetition lives

`docs/boss-abilities.md` catalogues twenty-three abilities asking fourteen questions, and
every one of them has the same shape: **read one telegraph, make one movement decision,
resolve.** A circle, a donut, a line, a cone, three discs, two beats — different shapes,
one grammar. A player who has learned "look at the floor, step once" has learned every
boss, which is what "they all feel the same" means even after the variety pass gave every
encounter its own hand.

Bullet hell is a different grammar: **thread a moving field over time.** The danger is not
a shape that lands; it is a pattern crossing the floor for several seconds, and the answer
is a *path* rather than a step. Touhou's actual vocabulary — spirals, aimed versus fixed
spreads, rings with a walking gap, curtains, seeds that open late, sweeping rays, closing
rings — asks seven different questions of a player's movement, and none of them is "get
out of the circle".

## 2. The seven, and the question each one asks

| id | name | the question | comes from |
|---|---|---|---|
| `spiral` | Wheel Within Wheel | move *with* the turn — the lanes between the arms drift sideways at a walking pace | the body |
| `rings` | Each Door Elsewhere | follow the door — five rings, one gap each, and the gap walks a sixth of a turn per ring, starting on you | the body |
| `stream` | It Knows Where You Were | lead it — an aimed stream punishes reversing into your own trail, never standing still | the body, toward you |
| `curtain` | The Weather Here | weave — a four-second curtain of bolts crossing the arena, no aim, holes to read | behind the body |
| `bloom` | Late Flowering | read the second stage — slow seeds drift out and open into rings where they will be, not where they are | the body |
| `sweep` | The Lighthouse | stay ahead of it, or go through it — a ray of bolts swings a half-turn, starting a quarter-turn short of you | the body |
| `noose` | Room to Leave | leave through the gap, in time — a ring appears around *you* and closes, one opening, three times, the opening walking | around you |

Names follow the game's register ("The Slow Certainty", "No Further Turns"): a phrase with
a voice, deadpan, never a stat. Nothing here names Lucifer, a saint or a god.

## 3. How it is built, and how every boss gets it

**One emitter.** A pattern card is an ordinary `BossAbility` row with `shape: "none"` and a
`count`; `PATTERNS` in `data/bosses.ts` holds its tuning (duration, tick, bolt speed and
size, spin, gap, reach) and `game/boss.ts` runs one `advancePattern` for all seven — the
`pendingDrops` idea the meteor rain already used, generalised. Its bolts are
`spawnEnemyBolt`'s: they die on walls, cross the co-op wire as projectiles already do, and
hit through `hurtPlayer`.

**The rules hold the same way they hold for `volley`:**
- *Telegraphed.* The wind-up (1.2–1.5s) paints a **marker** — no damage, never resolves —
  saying where the pattern comes from and which way it turns: a circle on the body, the
  stream's line, the sweep's starting ray on the side it starts from, the curtain's edge,
  the noose's ring around your feet. Then every bolt is visible for its whole flight at a
  speed a walk beats (110–250 u/s against a 155 u/s hero; the sweep's ray at 450, under
  the dash's 470). `tools/bossrules.ts` already permitted a shapeless ability only when it
  "resolves into visible projectiles"; every pattern has `count > 0`.
- *Casting locks the body.* The wind-up is the damage window; the field runs after it,
  while the boss goes on with its rotation — the same shape as the meteor rain.
- *A dash always beats them.* A bolt is a dodgeable hit: a dash's i-frames pass through
  it, and a landed bolt grants the ordinary `HIT_INVULN` window. **That window is
  deliberate**: it is what makes being *in* the field a cost rather than a death, and
  threading it a skill with a margin instead of a purity test. Fully eaten, a
  three-second pattern lands the invulnerability-capped maximum of four or five bolts —
  two to three slams' worth. Threaded, it lands nothing.
- *Phases add.* Every deal below is strictly cumulative; `npm run legends` still finds
  exactly the three pinned violations and no new one.
- *Reaches across.* `count > 0` and `maxRange` 999, so `reachesAcross` is true for all
  seven; no phase's cross-arena property leans on them, but none loses it either.
- *One pattern at a time.* While one runs, no other pattern card is offered; every
  non-pattern card still is. Two fields at once is a screen, not a question; one field
  under a circle is a busier room, which is what a later phase is for.

**Every boss, not thirty-one kits.** The five templates deal in two or three patterns
each, cumulatively, and no pattern is in every template:

| template | phase 1 | phase 2 | phase 3 | phase 4 |
|---|---|---|---|---|
| Warden | — | +sweep | +noose | |
| Choir | rings | +spiral | +bloom | |
| Colossus | — | +curtain | +noose | |
| Herald | stream | +sweep | +rings | |
| Nameless | spiral | +bloom | +curtain | +stream |

Every derived encounter — nine sectors, five Tower floors, four raids, twenty-one
Provings — inherits its template's patterns through `variantPhases` / `raidPhases` /
`provingPhases`, exactly the borrow-and-reskin route `planetBossSpec` set. The four raids
also take one pattern into their own signature (Ferryman `curtain`, Queen `spiral`,
Minotaur `rings`, Tyrant `noose`) so the set pieces read as themselves. `npm run
bossvariety` walks all 44 and asserts each deals at least one pattern by its last phase.

**Art.** The animation tag is the `BossAbilityId`; seven rows in the union declare seven
tags, and until art lands each falls down the render ladder to the boss's static frame.
Nothing here blocks on art.

## 4. Threat per card — the check the theory demanded, done cheaply

`docs/boss-abilities.md`'s finding governs this: a kit's difficulty is **cadence × mean
threat per card**, and adding low-threat cards *dilutes* a rotation because every cast
spent on one is a cast not spent on a slam. So the question was whether a pattern card
carries at least the threat of the circle it displaces. The owner waived sweeps; this is a
sanity play, six seeds a row, `tools/bot.ts`'s attentive (dodge 0.85) and reckless (0)
bots, gearing chosen so each row is contested, patterns on versus the same kits with every
pattern card unpickable:

| row | patterns off | patterns on |
|---|---|---|
| depth 10 (Choir), attentive, lv 22 | 5/6 alive · 41s · 1491 dmg | 6/6 alive · 41s · 1666 dmg |
| depth 10, reckless, lv 22 | 1/6 · 18s · 2740 | 2/6 · 20s · 2512 |
| depth 15 (Colossus), attentive, lv 28 | 0/6 · 85s · 4736 | 1/6 · 76s · 4240 |
| depth 20 (Herald), attentive, lv 34 | 0/6 · 24s · 3856 | 0/6 · 34s · 4732 |
| depth 20, reckless, lv 34 | 0/6 · 8s · 2479 | 0/6 · 10s · 2720 |

Per cast, damage landed, patterns on (bolts attributed by their unique ailment odds):

| card | reckless bot, per cast | attentive bot, per cast |
|---|---|---|
| a mechanic (all circles/lines/cones averaged) | ~200 | ~9 |
| `rings` | 89 | 51 |
| `spiral` | 213 | 8–22 |
| `bloom` | 17–161 | 52–62 |
| `stream` | 255 | 100 |
| `curtain` | — | 24 |
| `noose` | — | 64 |

**The honest read.** To a player who stands in things, a pattern lands roughly what a circle
lands — half to one-and-a-quarter of a mechanic per cast — so the mean threat per card for
a careless player is about flat, not diluted. To a player who *reads*, a pattern lands
**five to ten times** what a circle does, because a shape is dodged with one step and a
field is not: the attentive bot eats 9 per mechanic and 50–100 per pattern. That is the
design working — the cards test movement continuously where the old deck tested it once
— and it is the direction the owner asked for. Rotation cadence is untouched (cards were
added, not swapped; `BOSS_ACTION_GAP` governs), so the cost of the addition is that big
hits are a smaller share of the rotation: fights ran the same length or slightly longer,
wins moved by at most one seed in six either way, and damage rate rose 10–20% for a
reader. Not a nerf, not a sweep-grade claim; a sanity play that says the theory's failure
mode did not occur.

One lever is deliberately left where it is: per-bolt damage (0.4–0.6 of the boss's hit).
If the owner plays it and wants a field to *hurt* more when eaten, that number is the dial
and `HIT_INVULN` is the cap it works under.

## 5. Decided against

- **A dash-reader.** Declined by the PM before this brief; not reopened. Every bolt is a
  hit a dash beats outright.
- **A stillness-punisher.** `REGARD_HOLD` records why. The nearest thing here is `stream`,
  which punishes *reversing*, and `spiral`, which punishes not moving at the wheel's pace —
  both cost a parked bow and a parked sword the same few steps.
- **Bolts that ignore the hit-invulnerability window** (true Touhou one-touch density).
  Considered and rejected: with `HIT_INVULN` off, a dense field is a health-bar deletion in
  a second, and the only answer left is never to be in it — which turns every pattern back
  into "leave the shape", the grammar this is meant to escape. The window is what makes
  *threading* a real answer.
- **Two patterns at once.** Refused by the `ready` filter. A screen of two fields is not
  readable; a field plus a circle is.
- **Converging walls** (two rows of bolts closing from either side with a gap). Built on
  paper, dropped: it asks the same "be at the door in time" question `noose` asks, from
  two sides instead of all round, and the deck did not need the same question twice.
- **Homing bolts.** A bolt that turns toward you is `hunt` with a smaller circle, and
  `hunt` already asks "keep moving"; a homing swarm would ask it worse.
- **A rotating laser as a continuous telegraph.** The telegraph system resolves once at
  the end of its wind-up, so a sweeping beam would have needed a new resolve mode in
  `updateTelegraphs`. The sweep as a ray of fast bolts asks the same question for the cost
  of one `case`, and a dash through it works for free because bolts already respect
  i-frames.

## 6. The instrument

`tools/bot.ts` now steps off a hostile bolt's path when its reaction roll passes — the
attentive bot reads bolts the way it reads telegraphs; the reckless one still does not. It
is a small, honest change to what "reads the floor" means once the floor has bolts crossing
it, and without it the smoke test's telegraph A/B would have compared two bots that both
stand in every pattern.

**Published figures that predate the instrument change.** Twenty tools drive `tools/bot.ts`.
With the dodge scoped to a field (a boss on the floor and six or more hostile bolts in the
air), a reader that never plays a boss floor is byte-identical to before — `npm run
abilityfx`'s own identity comparison is one of them. Three harnesses outside the gate do
play boss floors and hold numbers in their write-ups: **`tools/execute-ab.ts`
(`docs/execute-threshold.md`), `tools/raid-party-measure.ts` (`docs/raid-party-scaling.md`)
and `tools/reachability.ts` (`docs/reliquary-reachability.md`)**. Their published figures
were measured with the bot as it stood before `feat/boss-bullet-hell` (the boundary is
commit `1a68b9d`, the first with the dodge) and **are not comparable against a run made
after it** — a bot that steps off a pattern's bolts takes a different bill on the same
floor. They are records of the bot that produced them, not baselines for the bot in the
tree; a session that re-runs one and gets a different number has found a different
instrument, not necessarily a regression. They were deliberately not re-run here.

`npm run bossvariety` gained four comparisons: every pattern's bolts are slower than a dash
(`DASH_SPEED`, now exported for it — the sweep's first draft at 520 went red and came down
to 450); a ring's door at the radius it is fired is wider than a hero; every one of the 44
encounters deals a pattern by its last phase; no pattern is in every template.
