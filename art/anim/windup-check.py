#!/usr/bin/env python3
"""
Does a generated wind-up actually build to a pose, or does it wander and come back?

    python3 art/anim/windup-check.py art/anim/raw/ferryman-cast

Prints each frame's silhouette difference from frame 0, as a fraction of the sprite's own
opaque area, and says whether the sequence is usable as a cast wind-up.

## Why this exists

A boss's cast animation is keyed to PROGRESS through a wind-up (see docs/animation.md), so
the last frame is the moment of release — the pose the player must learn to read as "now".
That imposes a shape on the motion that an idle does not have:

  **a wind-up must build monotonically and END at its extreme.**

Judging that by eye is unreliable at this size, and it is easy to look at a sheet of nine
frames, see plenty of movement, and not notice that the last frame has drifted back toward
the resting pose. The number makes it obvious.

## What it found

`animate_image` free-form, prompted explicitly for a wind-up ending at maximum, produced
this on all three raid bosses tried:

    ferryman  8 21 31 39 41 43 40 39     peak at frame 6, falls back
    queen     1  1  2  6  7 10 17  9     barely moves at all, then halves
    minotaur  6 13 18 23 26 26 22 17     peak at frame 5-6, falls back

Every one peaks in the middle and returns toward the start — the signature of a LOOP, not a
one-shot. That is what the tool is built for (idles, walk cycles), and no amount of prompt
wording moved it, including "the final frame is the pose fully drawn back at maximum" and
"do not show the strike itself".

The consequence is specific and bad: the frame that a progress-keyed wind-up shows at the
instant of the hit is the one most similar to the resting pose, so the animation actively
mis-cues the moment it exists to cue.

**The fix is `last_frame_base64`/`last_frame_url`** — pin the ending and the generator
interpolates between two poses instead of animating open-endedly. That needs a target pose
per boss, which is a real extra step, but it is the only way to get a shape this measurement
will pass. Re-rolling the open-ended call is not.
"""

import os
import sys
from PIL import Image


def silhouette(path):
    im = Image.open(path).convert("RGBA")
    return [p[3] > 128 for p in im.getdata()], im.size


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    d = sys.argv[1]
    frames = sorted(f for f in os.listdir(d) if f.endswith(".png"))
    if len(frames) < 3:
        raise SystemExit(f"{d}: need at least 3 frames, found {len(frames)}")

    base, size = silhouette(os.path.join(d, frames[0]))
    area = sum(base) or 1
    diffs = []
    for f in frames[1:]:
        cur, cur_size = silhouette(os.path.join(d, f))
        if cur_size != size:
            raise SystemExit(f"{f} is {cur_size}, expected {size} — the canvas moved.")
        diffs.append(sum(1 for a, b in zip(cur, base) if a != b) / area)

    print(f"{d}: {len(frames)} frames, {size[0]}x{size[1]}")
    print("  silhouette change vs frame 0: " + " ".join(f"{x*100:.0f}%" for x in diffs))

    peak = max(range(len(diffs)), key=lambda i: diffs[i])
    last, best = diffs[-1], diffs[peak]
    ends_at_extreme = peak == len(diffs) - 1
    builds = all(diffs[i] <= diffs[i + 1] + 0.02 for i in range(len(diffs) - 1))
    moves = best >= 0.25

    print(f"  peak {best*100:.0f}% at frame {peak+1}; last frame {last*100:.0f}%")
    if not moves:
        print("  UNUSABLE: the pose barely changes — this reads as a fidget, not a wind-up.")
    if not ends_at_extreme:
        print(f"  UNUSABLE: it peaks mid-sequence and falls back to {last*100:.0f}%. A "
              "progress-keyed wind-up shows the LAST frame at the moment of the hit, so this "
              "would cue the player with a near-resting pose. Pin the ending "
              "(last_frame_base64) instead of animating open-ended.")
    if moves and ends_at_extreme and builds:
        print("  OK: builds monotonically and ends at its extreme.")


if __name__ == "__main__":
    main()
