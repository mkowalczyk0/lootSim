# What more raid-boss health actually buys (owner item B — measurement only)

> "All of the raid bosses need a much much higher health pool"

**No change was made.** This is the measurement the owner should see before one is, and it
was handed over mid-flight when the item was reassigned. `npm run raidhealth`,
`tools/raid-health-ab.ts`.

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
- **Not run**: a win/loss split of the duration figure, which would remove the confound above
  for the two contested raids. Worth doing if the Tyrant row is to carry any weight.
