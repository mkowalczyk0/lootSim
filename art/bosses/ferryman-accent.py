#!/usr/bin/env python3
"""
Make the Ferryman's cold eye survive its own idle animation.

    python3 art/bosses/ferryman-accent.py

## What this fixes

`npm run chroma` measures the loudest 2+-pixel colour per sprite, and `boss.ferryman`
passed at 36.9 (#87ade5) — above the hero's 30.2, so legal. Measuring it **per frame**
tells a different story:

    frame 0  #87ade5  36.9      frame 1  #928d42  31.4      frame 2  #87ade5  36.9
    frame 3  #928d42  31.4      frame 4  #87ade5  36.9

In frames 1 and 3 the cold eye is not dimmer, it is **gone** — the loudest thing left is a
dull olive on the robe, a hair above the hero's own skin. The animation generator washed
the two eye pixels out to a blue-grey (#90b1be, #a7b9be/#b4c8c9), which is not an accent at
all. So the one cue §1.4 exists to deliver blinks out of existence for two frames in five,
and a strip-level measurement cannot see it because the surviving frames carry the number.

## What it does

Sets the two eye pixels — always at x=46,47, on the row the eye occupies in that frame —
to the **cold element colour** `#7dd3fc` from `src/data/elements.ts`. Unlike the Warden,
whose element `physical` has a deliberately desaturated palette entry and so needed a hue
chosen for it, this is the element's own colour lifted rather than invented.

Ten pixels across five frames. Nothing else is touched: no repaint, no recolour of the
robe, no widening of the eye beyond the two pixels the art already draws.

`#7dd3fc` reads at chroma 49.8, which sits mid-pack rather than at the top of the cast —
the nameless (44.7) and the labyrinth minotaur (45.5) are lower. It is not the loudest eye
in the game and should not be: this is a drowned ferryman, not a furnace.
"""

from PIL import Image

SPRITE = "src/render/atlas/bosses/boss.ferryman.png"
FRAME_W, FRAME_H, COLS = 75, 107, 5
COLD = (0x7d, 0xd3, 0xfc, 255)

# The eye's row in each frame — it drifts as the head moves through the idle. x is always
# 46 and 47. Derived by locating #87ade5 in the frames that kept it and reading the
# washed-out blue-grey pair in the two that lost it.
EYE_ROW = {0: 15, 1: 16, 2: 18, 3: 19, 4: 17}
EYE_X = (46, 47)

# What each target pixel must currently be. If the strip is ever regenerated the eye moves,
# and painting blind would put two bright pixels somewhere in the middle of the robe.
EXPECTED = {
    0: [(0x87, 0xad, 0xe5), (0x87, 0xad, 0xe5)],
    1: [(0x90, 0xb1, 0xbe), (0x90, 0xb1, 0xbe)],
    2: [(0x87, 0xad, 0xe5), (0x87, 0xad, 0xe5)],
    3: [(0xa7, 0xb9, 0xbe), (0xb4, 0xc8, 0xc9)],
    4: [(0x87, 0xad, 0xe5), (0x87, 0xad, 0xe5)],
}


def chroma(c):
    mx, mn = max(c[:3]), min(c[:3])
    return 0.0 if mx == 0 else ((mx - mn) / mx) * (mx / 255) * 100


def main():
    im = Image.open(SPRITE).convert("RGBA")
    if im.size != (FRAME_W * COLS, FRAME_H):
        raise SystemExit(f"{SPRITE} is {im.size}, expected a {COLS}-frame "
                         f"{FRAME_W * COLS}x{FRAME_H} strip — re-find the eye rows.")
    painted = 0
    for frame, y in EYE_ROW.items():
        for i, x in enumerate(EYE_X):
            px = im.getpixel((frame * FRAME_W + x, y))
            want = EXPECTED[frame][i]
            if px[:3] != want:
                raise SystemExit(
                    f"frame {frame} ({x},{y}) is #{px[0]:02x}{px[1]:02x}{px[2]:02x}, expected "
                    f"#{want[0]:02x}{want[1]:02x}{want[2]:02x}. The strip has been "
                    f"regenerated — re-find the eye rows rather than painting blind.")
            im.putpixel((frame * FRAME_W + x, y), COLD)
            painted += 1
    im.save(SPRITE, format="PNG", optimize=True, compress_level=9)
    print(f"lit {painted} pixels across {COLS} frames at chroma {chroma(COLD):.1f} "
          f"(#{COLD[0]:02x}{COLD[1]:02x}{COLD[2]:02x}, the cold element) — nothing else touched")


if __name__ == "__main__":
    main()
