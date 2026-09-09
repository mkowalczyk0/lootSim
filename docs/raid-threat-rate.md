# Raid party threat rate — the third lever, measured

Status: **built, measured, and it partly works.** Raids remain solo-only in the game
(`docs/raids.md`); this is groundwork behind that flag, exactly as
`docs/raid-party-scaling.md` is. `raidThreatRate` is live in `data/raids.ts` and read by
`game/boss.ts`, and it is **exactly 1 at one player**, so nothing a player can currently
reach is affected by it.

Read `docs/raid-party-scaling.md` first. It measured the problem and rejected two fixes.

## The problem, restated

A raid boss is one body running one rotation, so it delivers a roughly fixed amount of
danger per second however many people are in the room — and that danger is then divided
among them. **A growing party dilutes threat.**

Two levers were tried there and neither closed it: health scaling (a longer fight is not a
harder one) and damage scaling (a caught telegraph becomes a one-shot without the fight
asking more of anybody).

## The third lever

`raidThreatRate(players)` multiplies the gap between casts:

```
1 / (1 + RAID_THREAT_PER_PLAYER * (players - 1)),  floored at RAID_THREAT_FLOOR
```

with `RAID_THREAT_PER_PLAYER = 0.42` — sub-linear on purpose, because a party genuinely
does bring revives and the ability to be in two places, so charging the full headcount
would make a party strictly worse than the sum of its players.

What it does **not** do: touch the wind-up (every telegraph is exactly as long and as
readable as it is solo), introduce a second difficulty curve (it multiplies the same
`BOSS_ACTION_GAP` the one rotation already uses), or pay more (`danger` is not involved, so
§16 never sees it). **Scoped to raids only** — the Delve's own boss floors are the same
shape and are shipped and played.

## Measurement

`tools/raid-party-measure.ts`, unchanged, 24 seeds, same gearing and methodology as the
original finding. Three arms so the lever is not confounded with this branch's kit changes:
**base** (branch point), **kit-only** (this branch, `RAID_THREAT_PER_PLAYER = 0`), and
**+threat** (shipped). The base arm reproduces the documented numbers exactly.

**The Ferryman, tier 1 — the flagship case.** Clear rate by party size:

| players | base | kit-only | +threat |
| --- | --- | --- | --- |
| 1 | 14/24 (58%) | 16/24 | 16/24 (67%) |
| 2 | 21/24 (88%) | 22/24 | 18/24 |
| 3 | 23/24 (96%) | 22/24 | 19/24 |
| 4 | 23/24 (96%) | 21/24 | 18/24 (75%) |

A party used to take this fight from a coin flip to a formality: **+38 points of clear
rate from solo to four.** With the lever it is **+8**. That is the failure the finding was
about, and it is essentially gone.

Damage per player, solo → four: base **−38.1%**, kit-only −43.5%, **+threat −17.2%**. The
dilution is more than halved.

**The Ferryman, tier 4** — the other documented failure, "bloodier without getting more
winnable" (per-player damage *climbing* with party size, `+53.3%` base). With the lever
that is `−21.8%`: the fight no longer punishes a bigger party harder per head.

**A careless party is punished again.** Reckless (dodge=0) four-player clears: base 14/24,
**+threat 9/24**, against 10/24 solo. Before the lever, four careless players cleared it
*more* often than one careful one.

## Where it does not work, stated plainly

**Queen of the Seventh Circle, tier 1.** Clear rate flattens the same way (base
0/4/10/6 → +threat 0/2/3/2), but damage per player from solo to four gets *worse*: base
−8.3%, +threat −16.5%.

The reason is an instrument problem worth recording: **`dmgBill/player` is not a clean
difficulty measure when fight length moves.** A harder fight that kills the party sooner
books *less* total damage, and the Queen's average phases reached drops from 2.1 to 1.4 —
the party is dying earlier, which reads as less damage taken. Clear rate is the honest
measure here and it says the lever worked. The two metrics disagree because one of them is
confounded, not because the result is ambiguous.

So: **the lever fixes clear-rate scaling with party size. It does not, on its own, hold
damage-per-player constant**, and on a fight already past a party's power it cannot,
because the fight ends before the damage accrues.

## The finding underneath it, which generalises past raids

This branch's solo A/B found the same mechanism from the other side. A boss casts on a
timer, so:

> a kit's difficulty is **cadence × mean threat per card**, not card count.

Adding low-threat abilities (territory denial, pursuit) to a fixed-cadence rotation makes a
fight *easier*, because every cast spent on them is a cast not spent on a big hit. The
Ferryman gained `drift` and `hunt` and got measurably easier while getting more varied.
That is why two Tower kits were re-authored during the variety pass, and it is the same
arithmetic the party dilution is an instance of: threat delivered per second is the
quantity that matters, and both party size and kit composition divide it.

## Open

- `RAID_THREAT_PER_PLAYER = 0.42` is set from one fight's clear-rate curve. It is not
  tuned against the Minotaur or the Tyrant, which were not measured here.
- The simultaneous-telegraph half of the brief's "cadence *and* simultaneous-telegraph
  count" is **not built.** Casts are sequential (one `castTimer`), so painting two at once
  is a real change to the boss brain rather than a knob, and cadence alone moved the
  headline number far enough to be worth reporting first.
- Nothing here is reachable in game. Raids are solo-only and one branch in
  `handleHubInteraction` is still what stops a party raid.
