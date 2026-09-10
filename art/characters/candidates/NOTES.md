# Hero v7 — the boss-art direction, measured. Nothing committed.

The owner's direction changed: *"Give me an iteration not going off of the art-refs, go off
the existing boss art instead for style."* `docs/art_refs/` no longer governs the hero, and
the density-ratio metric derived from it does not either. Every number below comes from
`art/characters/candidates.ts` reading the generated PNGs.

## The finding that explains six rejected passes, and it is not about the prompt

**The hero and the bosses were generated in different modes, with opposite style settings.**
Read straight off the PixelLab records:

| | mode evidence | `style` on record |
| --- | --- | --- |
| every raid boss | 8 directions, 112px | `-, -, -` |
| hero v6 candidate A (shipped today) | 4 directions, 56px | `flat shading, single color black outline, low detail` |

Only `standard` mode honours `shading`/`detail`; `pro` and `v3` always produce 8 directions
and ignore them. So the bosses are `pro`/`v3` with nothing clamped, and **the hero was being
actively flattened and de-detailed while the bosses were not.** "Go off the boss art for
style" therefore has a concrete mechanical translation: *generate the hero the way the
bosses were generated* — same mode family, no flat/low clamps. That is what every candidate
here does.

## Negative phrasing summons the thing it forbids — three for three

Round 1 asked for "no wings", "no hood", "no helmet" and got:

- **B** — wings.
- **C** — a pole, because the Ferryman used as the style reference holds one.
- **D** (round 2, still carrying one negative) — a backpack, from "carrying nothing on his back".

Round 2 replaced every negative with a positive statement of what *is* there — "both hands
empty and open at his sides" — and **E came back clean**. This extends the style guide's
existing palette-clamp lesson (clamp with positives: *matte, blackened, soot-stained*) from
palette to **subject**, which it did not previously cover.

**Props are not a cosmetic complaint.** Two reasons a hero must be empty-handed:

1. `worldScale` is derived from the **trimmed** height, so a staff above the head sizes the
   *staff* to 32 world units and shrinks the character to fit underneath it.
2. The game already draws the held weapon as its own rotated sprite (`weaponSprite`), so a
   hero holding anything is drawn holding two things at once.

This matters far more for the 21 class heroes than for one hero: a "creative per class"
brief invites exactly the swords, staves and packs that break both rules.

## The second size constraint, which the portrait band does not catch

Shipping hero A established that a legal band height can still break the town screen.
`portraitScale` rounds to a **whole** factor and magnifies the entire hero *stage*, not the
figure on it: v4 (57 rows) hit its target at x3 -> 243px; hero A (41 rows) needs x4 ->
324px, and overflowed both pinned CSS boxes.

**The direction is counter-intuitive: a taller hero is safer.** Every candidate here needs a
smaller factor than the hero shipped today, and all of them clear the pins with room —
even though the stage itself has to grow to hold them. Numbers are in the tool's output.

## The mode split is not only about detail — it decides the palette

Round 2 produced two clean *subjects* (D, E, F all bare-headed and empty-handed) and they
split cleanly by mode on a rule that has nothing to do with subject:

| | mode | colours | hot accent | vs lowest monster (44.7) |
| --- | --- | --- | --- | --- |
| E | `pro` + Ferryman as style ref | **28** | 35 `#c38c6a` | passes |
| D | `v3` from scratch @ 64 | 48 | **46** `#c4704e` | **FAILS §1.4** |
| F | `v3` from scratch @ 96 | 50 | **52** `#a65f22` | **FAILS §1.4** |

**`v3` from scratch keeps drifting warm and saturated; `pro` with a boss as the style
reference inherits the low, dirty palette the game actually wants.** That is the single most
useful result here for the 21 class heroes, because it says which mode to use before anyone
spends 21 generations. Colour-counting alone could not see it — E has the *fewest* colours
and F the most, but both would have read as "muted brown" by eye.

## Status

**E is the only candidate that passes everything**, and its one blocker is size: art height
105 sits between the 78-87 and 155-160 bands. Two routes, both stated rather than chosen:
pad to 155 (legal, but the Hero/Style spread lands at 11.9% against a 12% limit — right on
the edge), or re-roll `pro` against a *smaller* style character so the content lands in
78-87. `pro` requires `size` >= the style character's content size, and the Ferryman's is
~107, which is why this family lands just above the band.

A, B, C and D are rejects for the reasons above; F is a reject on the accent.

Generated: rounds 1-2 in `v3` (2-3 generations) and `pro` with the Ferryman as
`style_character_id` (25 generations). **Unverified in a browser** — no session on this
machine can click through the game, so these are measured and rendered through a
reimplementation of the stamping path, not a screenshot.
