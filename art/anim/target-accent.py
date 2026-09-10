#!/usr/bin/env python3
"""
Give a pinned wind-up TARGET pose the same lit accent the shipped sprite carries.

    python3 art/anim/target-accent.py art/anim/raw/ferryman-cast/f6.png

## Why a pinned wind-up needs this and an idle does not

`animate_image` with `last_frame_base64` returns the pinned pose **byte-identical** —
measured on the Ferryman, all 8025 pixels of the final frame match the target exactly. That
is the whole reason this script is cheap and reliable: whatever the target carries, the
frame the player sees at the instant of the hit carries too. So the accent is fixed HERE,
on a raw target pose, rather than repaired afterwards on a finished strip — the treadmill
`docs/animation.md` warns about, where the feature moves between frames and every
regeneration invalidates the repair.

With a pinned ending there are **two** source sprites, not one, and the accent rule in
`docs/animation.md` step 1 applies to both. It was written when there was only ever one.

## The failure this exists to prevent, which is NOT the documented one

`docs/animation.md` records that the generator *dims* accents (39% on the Minotaur). The
Ferryman's wind-up failed `npm run chroma` a different way:

    shipped idle frame:  2 px #7dd3fc          -> loudest 2+px colour #7dd3fc @ 49.8
    generated target:    1 px #7dd3fc + 1 px #8cd4e7 -> loudest 2+px colour #866c3f @ 27.8

The eye is still *there* and still looks right. But `npm run chroma` measures the loudest
colour covering **2+ pixels**, deliberately, so a lone pixel reads as generator dithering
rather than a design decision — and the generator had split the two-pixel eye into two
adjacent shades. Neither shade covers two pixels, so the accent is gone by the only measure
that can tell an accent from dithering, and the loudest thing left is a dull olive on the
robe, below the hero's own skin.

**The root cause is that a two-pixel accent has no redundancy**: one shade of drift destroys
it. That is the same reason `boss.labyrinth-minotaur` cannot be animated at all, and it
makes the recorded fix for it — *enlarge the accent on the source, more pixels rather than
merely brighter* — the right one for a reason nobody had pinned down. This script is the
narrow version of that fix, available only because the pinned frame is reproduced exactly;
it does not help the intermediate frames, which are genuinely generated and still drift.
"""

import sys
from collections import Counter

from PIL import Image

COLD = (0x7d, 0xd3, 0xfc, 255)   # src/data/elements.ts, the cold element — lifted, not invented
SPLIT = (0x8c, 0xd4, 0xe7)       # the shade the generator split one of the eye pixels into
EYE = ((41, 18), (42, 18))       # the Ferryman's eye in this target pose


def chroma(c) -> float:
    mx, mn = max(c[:3]), min(c[:3])
    return 0.0 if mx == 0 else ((mx - mn) / mx) * (mx / 255) * 100


def loudest(im: Image.Image):
    """The gate's own statistic: the loudest colour covering 2+ opaque pixels."""
    c = Counter(p[:3] for p in im.getdata() if p[3] >= 128)
    return max((col for col, n in c.items() if n >= 2), key=chroma)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    path = sys.argv[1]
    im = Image.open(path).convert("RGBA")

    before = loudest(im)
    # Assert what is there before painting: if the target is ever regenerated the eye moves,
    # and painting blind would put two bright pixels somewhere in the middle of the robe.
    expected = {COLD[:3], SPLIT}
    for x, y in EYE:
        px = im.getpixel((x, y))[:3]
        if px not in expected:
            raise SystemExit(
                f"{path} ({x},{y}) is #{px[0]:02x}{px[1]:02x}{px[2]:02x}, which is neither "
                f"the cold accent nor the shade it splits into. The target has been "
                f"regenerated — re-find the eye rather than painting blind.")
    for x, y in EYE:
        im.putpixel((x, y), COLD)
    im.save(path, format="PNG", optimize=True, compress_level=9)

    after = loudest(im)
    print(f"{path}: eye set to 2 px #{COLD[0]:02x}{COLD[1]:02x}{COLD[2]:02x}")
    print(f"  loudest 2+px colour: #{before[0]:02x}{before[1]:02x}{before[2]:02x} "
          f"@ {chroma(before):.1f}  ->  #{after[0]:02x}{after[1]:02x}{after[2]:02x} "
          f"@ {chroma(after):.1f}")


if __name__ == "__main__":
    main()
