# Hero v6 — three candidates, measured. Nothing committed.

Five passes have been rejected. This round deliberately does not ship one: three candidates,
one contact sheet, the owner picks by eye. `hero-candidates.png` (row 1 = shipped v4 control,
then A, B, C) is the artefact; every number below is derived by `art/characters/candidates.ts`
from the committed PNGs, never hand-scanned.

## The two levers are one equation

`density = 2 / worldScale = 2h / worldHeight`. The floor is fixed at **2.0 world units per art
pixel** (16 texels stamped across a 32-unit cell), so a candidate can be aimed at a ratio
exactly rather than guessed toward one.

| | lever | px | **colours** | head col | hot accent | head/body lum | world h | tiles | density |
|---|---|---|---|---|---|---|---|---|---|
| v4 shipped | — | 39x57 | **40** | 25 | 30 (skin) | 89/42 = **2.1x** | 32 | 1.00 | 3.56x finer |
| A cut the ink | colour only | 16x41 | **27** | 20 | 35 (skin) | 55/47 = **1.17x** | 32 | 1.00 | 2.56x finer |
| B coarse+tall | height only | 20x51 | **18** | 15 | **73 `#dba820`** | 61/38 = 1.6x | 58 | 1.81 | 1.76x finer |
| C both | both | 16x39 | **24** | 14 | 26 (skin) | 77/66 = 1.17x | 52 | 1.63 | 1.50x finer |

Colour count is printed first on purpose. It is the axis that has actually tracked the owner's
rejections — a hooded candidate once measured 4.19x density (worse) while reading better,
because its colour count fell 40 -> 13. "Too realistic" was information density, not pixels per
world unit.

## Three findings the sheet exists to surface

**1. The town portraits do not constrain drawn size at all.** They scale off the hero's
*art-pixel* height (`heroMeta.h` -> `portraitScale`/`pixelImageBody`), never off `worldScale`.
So lever 2 is free of them. What they do constrain is `h`, and the legal band — derived from the
smoke bound's own functions, not remembered — is:

    h = 16-43, 46-50, 52-58, 78-87, 155-160

**Candidate B's natural trim of 51 lands in the 44-45 / 51 dead zone and would fail the gate.**
Fixable for nothing (pad one transparent row to 52; `worldScale` becomes 58/52 = 1.1154 and the
density barely moves) — but it has to be done deliberately, so it is stated here rather than
silently applied to a candidate the owner has not chosen yet.

**2. B carries a hot accent, which §1.4 forbids on the hero outright.** A saturated gold buckle
at `#dba820` (73) plus lit blue eyes. This is the same defect v3 was rejected for. Colour count
alone cannot catch it — one bright pixel pair costs exactly one colour, and B has the *lowest*
count of the three — so the tool now measures maximum chroma over any colour covering 2+ pixels.
A, C and v4 top out at skin tone (26-35), which is the expected floor for an exposed face.

**3. Lever 2 applied to the hero alone is a different picture, not a smaller one.** The cast is
unchanged and stands at roughly one tile:

    rot-imp 29.9 (0.94 tiles) · bone-archer 29.6 · iron-brute 32.4 (1.01) · cult-caster 29.8 · scuttler 17.3

B at 58 units and C at 52 make the hero **1.8x and 1.6x the height of the iron brute**. `ref_5`
has the *whole cast* at 2-3 tiles, not just the player. So:

> **Picking B or C is a commitment to rescaling the drawn size of every monster.**

That rescale is mechanically safe — `worldScale` is decoupled from collision, so no hitbox, no
telegraph radius and no camera geometry moves — but it will read as a more zoomed-in game. That
is a look-wide aesthetic decision and it belongs to the owner. **A is the only candidate that
does not carry it**: same 32-unit footprint as today, cast relationship untouched.

## What each candidate actually is

- **A — cut the ink.** Lever 1 only. Same drawn size as today, plain adventurer, exposed head,
  brown tunic. Colours 40 -> 27 and, more to the point, the §1.4c head/body luminance gap closes
  from 2.1x to 1.17x — the head stops being the brightest, most colour-dense region on the
  sprite, which is the specific thing §1.4c says to measure. Aimed squarely at the diagnosed
  root cause and carries no consequential decision with it.
- **B — coarse and tall.** Lever 2 only, palette left near generation. Lowest colour count, but
  it is the configuration that has been rejected before *plus* a forbidden hot accent *plus* the
  portrait dead zone *plus* the cast rescale. Kept in the round on purpose so the reasoning above
  can be falsified by eye rather than asserted.
- **C — both.** Coarse, no accent, head/body gap closed, density 1.50x — closest to the
  reference's ~1.0. Still carries the cast rescale.

## Process

Generated in PixelLab **standard** mode, 4 directions, 1 generation each. Standard is the only
mode that honours `shading: flat` and `detail: low` — pro and v3 ignore both, which is a likely
contributor to earlier passes coming back more rendered than asked for. Four directions because
the owner picks from a south view; the winner gets a full 8-direction v3 rotation afterwards
rather than paying for three.

**Unverified in a browser.** No session on this machine can click through the game. These are
measured and rendered through a reimplementation of the stamping path (`tools/inworld.ts`'s
approach: real graded tileset, true fractional scale, nearest-neighbour), not a screenshot, so
it cannot catch a bug living in `draw.ts` itself. The owner should eyeball the winner in game.
