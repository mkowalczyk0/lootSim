#!/usr/bin/env python3
"""
Re-fuse a hot accent the generator SPLIT into two adjacent shades.

    python3 art/anim/repair-split-accent.py <frame.png> 7dd3fc

## The failure this fixes, and why it is not the same as target-accent.py

`npm run chroma` measures the loudest colour covering **2+ pixels** — deliberately, so a
lone pixel reads as dithering rather than as a design decision. A two-pixel accent has no
redundancy, and the generator's favourite way of destroying one is not to dim it but to
**split** it: one pixel keeps the exact accent and its neighbour drifts one shade. Both
pixels still look right; neither covers two pixels; the accent is gone by the only measure
that can tell an accent from noise.

`art/anim/target-accent.py` prevents this on a *pinned endpoint*, where the pose is a file
we supply and its eye is at a known coordinate. It cannot help an INTERMEDIATE frame, which
is genuinely generated and whose eye is wherever the generator put it. This script is the
intermediate-frame version, and the whole difference is that it must **find** the eye
instead of being told where it is — a hardcoded coordinate is wrong the moment anything is
regenerated, which is the treadmill `docs/animation.md` warns about.

## What it refuses to do

It repairs a split (exactly one pixel of the accent, with a near-shade neighbour). It
**refuses** when the accent is absent entirely, because then there is nothing to locate and
painting would put two bright pixels somewhere in the middle of a robe. That case is a
dropped frame, not a repairable one — measured on the Ferryman's settle, one frame had the
eye split (repairable) and one had no blue pixel above the robe's own dark grey at all.

Being refused is the correct outcome there. Do not add a fallback coordinate.
"""

import sys
from pathlib import Path

from PIL import Image

NEIGHBOURS = ((1, 0), (-1, 0), (0, 1), (0, -1))
MIN_BLUENESS_RATIO = 0.6   # the neighbour must be most of the way to the accent's own


def blueness(c):
    """How far toward the accent's own hue direction a colour sits."""
    return c[2] - max(c[0], c[1])


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    path, hexcode = Path(sys.argv[1]), sys.argv[2].lstrip("#")
    accent = tuple(int(hexcode[i:i + 2], 16) for i in (0, 2, 4))

    im = Image.open(path).convert("RGBA")
    px = im.load()
    exact = [(x, y) for y in range(im.height) for x in range(im.width)
             if px[x, y][3] > 128 and px[x, y][:3] == accent]

    if len(exact) >= 2:
        print(f"{path.name}: {len(exact)} px already exactly #{hexcode} — nothing to repair")
        return
    if not exact:
        raise SystemExit(
            f"{path.name}: no pixel is #{hexcode}. The accent is not split, it is GONE, "
            f"and there is nothing here to locate. Drop this frame instead — see the "
            f"module docstring.")

    x0, y0 = exact[0]
    want = blueness(accent)
    best = None
    for dx, dy in NEIGHBOURS:
        x, y = x0 + dx, y0 + dy
        if not (0 <= x < im.width and 0 <= y < im.height) or px[x, y][3] <= 128:
            continue
        b = blueness(px[x, y][:3])
        if b >= want * MIN_BLUENESS_RATIO and (best is None or b > best[0]):
            best = (b, x, y, px[x, y][:3])
    if best is None:
        raise SystemExit(
            f"{path.name}: #{hexcode} at ({x0},{y0}) has no neighbour close enough to be "
            f"the other half of a split eye. This is a one-pixel accent, not a split one; "
            f"widening it is a change to shipped art and wants the owner.")

    _, x, y, was = best
    px[x, y] = (*accent, 255)
    im.save(path, format="PNG", optimize=True, compress_level=9)
    print(f"{path.name}: re-fused the split eye — ({x},{y}) "
          f"#{was[0]:02x}{was[1]:02x}{was[2]:02x} -> #{hexcode}, now 2 px")


if __name__ == "__main__":
    main()
