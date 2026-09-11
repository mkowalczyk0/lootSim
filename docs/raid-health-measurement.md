# What more raid-boss health actually buys, and what shipped (owner item B)

> "All of the raid bosses need a much much higher health pool"

This started as measurement-only, handed over mid-flight when the item was reassigned.
**The owner has since seen the finding below and asked to raise it anyway** — see "What
shipped" at the end. `npm run raidhealth`, `tools/raid-health-ab.ts`.

## First: the gate is *not* in conflict with this change

The concern was that `tools/raids.ts` exists to stop "balancing a raid by nudging its own
numbers", and would go red. **It does not.** Its health assertions are:

| assertion | effect of raising `RAID_HEALTH` |
|---|---|
| `boss.health === REFERENCE.health * RAID_HEALTH` | definitional — reads the same constant, stays green |
| `boss.health > REFERENCE.health` | one-sided — *more* true |
| `boss.health > ordinary.health` | one-sided — *more* true |

And §4's six-stat comparison ("a raid floor fights exactly like a Delve floor at the same
depth and danger") compares **`DepthProfile` fields** — `enemyHealth`, `enemyDamage`,
`enemySpeed`, `aggression`, `telegraph`, `recommendedLevel`. Those describe the *floor
curve*, i.e. ordinary monsters. `RAID_HEALTH` multiplies the **boss's own `BossSpec.health`**,
which §4 never reads. So raising it needs no gate exception and no stated carve-out. The
conflict that was anticipated isn't there.

Worth noting separately that the definitional check is nearly circular — it verifies
`raidBossSpec` uses `REFERENCE` rather than the borrowed template, which is real content, but
it cannot fail on the value of `RAID_HEALTH` because it reads `RAID_HEALTH`.

## The measurement

Tier 1, swordsman at level 70 with 120 Advanced chests, dodge 0.95, 8 seeds per row.
Factor 1.0 **is** master (`RAID_HEALTH` 1.7); the multiplier is applied to the spawned boss's
health, which is exactly what raising the constant does.

**Calibration first, because the obvious setup measured nothing.** A level 55 bot with
ordinary gearing loses **0/4** against a tier-1 raid boss and dies in 6–27 seconds — not
timing out, being killed. A row pinned at zero wins cannot move in either direction. That is
consistent with what `CLAUDE.md` already records ("at level 60 most sampled classes can't
beat depth 30 in either flavour"). Level 70 / 120 chests / near-perfect telegraph reading is
what produced rows that can move at all.

| raid | 1.0× wins | 3.0× wins | 1.0× fight | 3.0× fight | length change |
|---|---|---|---|---|---|
| **The Ferryman** | 8/8 | **8/8** | 20.7s | 43.7s | **2.11×** |
| **Queen of the Seventh Circle** | 8/8 | **7/8** | 29.6s | 64.1s | **2.17×** |
| Tyrant of the First Heavens | 2/8 | 0/8 | 58.6s | 69.4s | 1.18× |
| Minotaur of the Ninth Labyrinth | 0/8 | 0/8 | 88.0s | 113.7s | 1.29× |

## The reading, and one confound to respect

**On the two raids this character can actually beat, tripling boss health made the fight
roughly 2.1× longer and changed the win rate by 0 and 12 points.** That is `CLAUDE.md`'s
"Pressure, not sponginess" and `docs/raid-party-scaling.md`'s *"more health just costs more
time"* — confirmed on the solo axis, not just the co-op one. Potions drunk barely moved
(Ferryman 0.0 → 0.1; Queen 0.8 → 1.3), so the extra time is not extra danger.

**The confound**: average fight length mixes wins and losses, and a loss ends when the player
dies, which does not scale with the boss's health. That is why the two rows the character
*loses* show only 1.18× and 1.29×, while the two it wins show 2.1×. **The Ferryman and Queen
rows are the clean ones** — every run is a win, so their length figures are unconfounded, and
they are also the rows where the question "does this make it harder" has a meaningful answer.

The Tyrant's 2/8 → 0/8 is the only sign of increased difficulty anywhere in the table, and
two wins out of eight is too thin to carry it. The Minotaur is pinned at 0/8 and measures
nothing about win rate at all.

### The win/loss split (closes the confound above)

Duration summed separately by outcome — a win ends when the boss dies (scales with its
health), a loss ends when the player dies (mostly doesn't) — at 1.0x vs 3.0x:

| raid | win-only duration | loss-only duration |
|---|---|---|
| The Ferryman | 20.7s → 43.7s (**2.11x**) | n/a — no losses at either factor |
| Queen of the Seventh Circle | 29.6s → 59.7s (**2.02x**) | n/a — no losses at either factor |
| Tyrant of the First Heavens | n/a — no wins at 3.0x | 53.0s → 69.4s (**1.31x**) |
| Minotaur of the Ninth Labyrinth | n/a — no wins at either factor | 88.0s → 113.7s (**1.29x**) |

This is exactly the shape the confound predicted: on the two raids the character can win,
tripling health scales the fight almost linearly with it (2.0-2.1x on a 3x health increase —
consistent with a body that takes proportionally longer to whittle down while damage taken
per second is roughly flat). On the two it loses, duration barely moves, because the run
ends on the *player's* death timer, which the boss's health doesn't touch. **The Tyrant and
Minotaur rows say nothing about whether more health makes those fights harder** — they say
only that a losing fight against a bigger body takes slightly longer to lose, which is a
statement about how fast this character dies, not about the boss.

## What this suggests, for the owner rather than for us

More health delivers **a longer fight, not a harder one** — measured, on the two fights where
the measurement can speak. If the owner wants raids to feel like more of a project, health
does exactly that and the numbers above price it: 3× health ≈ 2× duration. If they want them
*harder*, `CLAUDE.md`'s own model says the levers are cadence and mean threat per card, and
`docs/boss-abilities.md` plus `docs/raid-threat-rate.md` already record that adding abilities
**dilutes** a kit rather than sharpening it.

Both are legitimate things to want. The owner asked for health specifically and that is their
call; this exists so they make it knowing what it buys.

## Instrument notes

- The A/B applies the factor once, at boss spawn, to `health`/`maxHealth`. `RAID_HEALTH` is
  read exactly once in the codebase (`raidBossSpec`), so this is equivalent and lets one
  process sweep several values.
- Not in `npm test`: it plays 128 raid fights.

## What shipped

**`RAID_HEALTH` raised from 1.7 to 3.0** (`src/data/raids.ts`). The owner's answer to the
finding above was to raise it anyway, knowing it buys duration rather than difficulty — and
there's a second, independent reason to land exactly this number rather than treat it as a
taste call: `CLAUDE.md`'s own design target for a raid boss is a fight that "lasts a minute
or two", and at 1.7 the two shallowest raids were resolving in 21-30 seconds, well under
that — a target the roster had apparently never met and nobody had measured until this A/B
existed. At 3.0, the Ferryman and Queen land at 44s/64s and the two deeper raids move from
roughly a minute to two-plus once the loss confound is accounted for. That is the design
doc's own spec, hit across the roster, not a number chosen by feel.

**What this change is not**: it does not touch `BossSpec.health` per encounter, damage,
cadence, ability count, or `partyScale`. It is `RAID_HEALTH` alone. Win rate on the two raids
this character can beat is essentially unchanged (100%→100%, 100%→88%) and potions drunk
barely moved — this is a longer fight, not a harder one, exactly as measured above.

**What to watch**: the two deeper raids (Tyrant, Minotaur) were already unwinnable for this
test character at 1.7x and stay unwinnable at 3.0x, just slower to lose (1.31x, 1.29x on the
loss-only duration, see the split above). Tripling their health moves them from
"unwinnable in ~60-90 seconds" to "unwinnable in up to ~114 seconds." That is not evidence
against shipping this — the owner asked for it, the shallow raids clearly needed it to hit
the doc's own target, and a raid outlasting a level-70 solo bot says more about the bot (and
about these two raids being tuned near/at the top of what's currently beatable — a known,
separately-documented finding, not new here) than about the boss. But it is worth naming
before someone reads "3x health, same win rate" as uniformly good news: for these two
raids, nobody has yet measured a build that wins, so "same win rate" there means "still 0%",
not "still fine."

**No gate exception was needed.** `tools/raids.ts` §4 never went red — its six-stat
comparison reads `DepthProfile` (ordinary monster scaling), never `BossSpec.health`, exactly
as established above.
