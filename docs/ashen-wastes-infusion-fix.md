# The Ashen Wastes floor/infusion collision — the attempt, not the fix

Design record, not a queued task. `tools/smoke.ts`'s "a floor must not be its own
sector's element" gate (added Sept 2026 alongside the Reliquary sector tileset pass)
found that `tiles.delve-wrath` (Ashen Wastes) puts a fire-infused monster within a few
luminance points of its own floor — the monster camouflages against the ground it's
standing on. The Cinder Catacombs and The Veil had the same defect and are fixed
(floor-only regenerations, wall pixel-anchored to the original generation via
`upper_base_tile_id`, verified against this exact gate). Ashen Wastes is not, on
purpose — this file is why, so the next attempt starts past this one instead of
repeating it.

## The numbers

Graded floor luminance vs. each archetype in the shared `reliquary` monster set, washed
toward `fire` at the real `tinted()` strength (0.28) — the same metric the gate uses.

| Attempt | Floor prompt direction | Graded floor L | vs. grunt (weakest, L70) |
|---|---|---|---|
| Shipped | (original) | 74 | Δ4 — fails |
| 1 | "near-black … deep shadow … very dark" | 79 | Δ9 — fails, moved the wrong way |
| 2 | "ash flagstone … glowing hot orange embers … bright" | 44 | Δ27 — one point short |
| 3 | "completely covered in intense blazing … overwhelming ember glow" | 59, spread ±27 | Δ11 — fails, and trips the ±14 busy-tile cap |

Attempt 2 is the best result found and is what's described below as "the direction that
worked." Attempt 3 pushed further in the same direction hoping to close the last point
and overshot: internal tile texture got busy enough to fail §17.7's separate spread
check, and (non-obviously) the collision delta got worse, not better. Reverted rather
than shipped.

## The inverted-convention finding (see art-style-guide.md's own correction)

The instinct going in — "increase separation" means "darken the floor" — is what fixed
Ossuary, Spire and Orchard, and it is what attempt 1 applied here. It made Ashen Wastes,
Cinder Catacombs and The Veil all worse. The reason: in the Citadel/Ossuary/Spire/Orchard
family the **floor** is the dark terrain and the **wall** is the light one, but in this
family — Ashen Wastes, Cinder Catacombs, The Veil — the wall is already near-black
(committed rock luminance 5–22) and the **floor** is the lighter terrain by design (an
ember-lit ash bed, a glowing catacomb floor, an unsettling pale-violet stone). Pushing an
already-lighter floor darker collapses the floor/wall contrast the sheet needs, and the
generator resists it unpredictably rather than complying. Brightening further in the
floor's own native direction (attempt 2) is what actually opened separation from the
infused monster. This is now written into `docs/art-style-guide.md` §17.7 as a rule to
check before choosing a direction, not just a fact about these three sheets.

## Why this stayed pinned instead of shipping at Δ27

The number alone is close — one luminance point on one of five archetypes, everything
else clears the bar. What decided it was the owner looking at the before/after contact
sheet: Ashen Wastes' BEFORE (a blue-grey floor) was judged to already separate the red
monsters reasonably, and the AFTER (a dark ember floor) reads as the dark-red grunt
sitting *closer* to the floor, not further — the picture didn't back the number the way
it did for the other two. Ashen Wastes is also the first floor of the game, the highest-
stakes surface in the repo to get wrong. Shipping art that doesn't clear its own gate, on
that floor, on a rounded-up number, was the one combination worth refusing outright.

## Where the next attempt should start

- The working direction is brighter, not darker — confirmed twice (attempt 2 succeeded,
  attempt 1 failed going the other way).
- There is headroom before the ±14 busy-tile cap between attempt 2 (safe) and attempt 3
  (±27, well over) — a smaller step in the same direction than attempt 3 took is
  the likely next move, not a bigger one.
- Closing one luminance point does not require abandoning the ember-floor concept that's
  already working for Catacombs; it needs a gentler nudge than "completely covered … 
  overwhelming," which is what tipped attempt 3 into busy.
- This is still a call for the owner's eye first — the metric is close, but the picture
  is what actually decided this file's ruling, and any future attempt should be judged
  the same way (a before/after contact sheet with real infused monsters composited on
  both, not the number alone).
