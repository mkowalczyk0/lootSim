#!/usr/bin/env python3
"""
Does a generated wind-up actually build to a pose, or does it wander and come back?

    python3 art/anim/windup-check.py art/anim/raw/ferryman-cast                  # open-ended
    python3 art/anim/windup-check.py art/anim/raw/ferryman-windup-pinned <t.png> # pinned

Exits non-zero if the sequence is not usable as a cast wind-up, so it can be run before
stripping rather than merely read.

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

## The two modes, and why the pinned one measures something different

**`last_frame_base64` works** — measured 2026-09-09 on the Ferryman. Pinning the ending
made the run converge on the pinned pose monotonically and land on it exactly:

    distance from the pinned pose: 43.0 40.7 35.7 29.8 25.6 19.5 2.1 10.8 **0.0%**

So the pinned regime has a statistic the open-ended one does not: the target pose is known,
and "did it get there" can be asked directly instead of inferred.

That distinction matters, because **the open-ended rule mis-reads a pinned run.** Its
"ends at its extreme" test is `argmax(distance from frame 0) == last frame`, which is a
proxy for "did not retreat toward rest" — the only thing available when there is no target.
On the run above it reports UNUSABLE, because frame 7 sits 44% from rest and the final frame
sits 43%. But frame 8 *is* the pinned pose, to 0.0%; the 1-point gap is an intermediate frame
wandering slightly further from rest, not the animation unwinding. An exact-argmax test has
no tolerance at all, while the monotonic-build test next to it already needed 2 points of it.

CORRECTED 2026-09-10. This used to read: "Distance-to-target reaching zero is a strictly
stronger claim than argmax-of-distance-from-rest, and it is asserted only when a target is
supplied." **That is wrong, and it is the reasoning that let a plateaued wind-up ship.**
The two are orthogonal, not ordered. Distance-to-target says the generator reproduced the
endpoint we handed it; argmax-of-distance-from-rest says the sequence travels. A run can do
the first perfectly while the second fails — which is what happened. Read the pinned run
above again: it reaches 2.1% from target at frame 6, backs off to 10.8%, then snaps to 0.0%.
It ARRIVES AT FRAME 6. Frames 7 and 8 are a wobble around an endpoint already reached.

The owner's report on the shipped art, independent of any of this: the wind-ups "look
incomplete... the animation seems to be like halfway done". `npm run windup` now measures
the same peaks-on-the-penultimate-frame signature on all three animated strips, on two
independent metrics. Systematic across three sprites and two metrics is not noise, so the
UNUSABLE verdict below was a TRUE reject that got explained away.

Ask both questions. Landing on the target is still worth having — it buys control of the
frame the player reads at the instant of the hit — it just never bought the travel. See
docs/animation.md, "The obvious instrument is wrong", for why any statistic built on
distances BETWEEN interior frames (apex ratios included) reports plausible nonsense here. Passing one of the three rejected free-form runs its own peak frame as a
pretend target still fails, by a wide margin — their last frames sit 19.5%, 12.0% and 10.4%
away from their own peaks, against a 1% bar.

**The open-ended rule is unchanged** and still governs any candidate generated without a
pinned ending.
"""

import os
import sys

from PIL import Image

MOVES_AT_LEAST = 0.25   # below this the pose reads as a fidget rather than a wind-up
BUILD_SLACK = 0.02      # a frame may sit 2 points below its predecessor and still "build"
LANDS_WITHIN = 0.01     # the last frame must BE the pinned pose, not merely near it


def silhouette(path):
    im = Image.open(path).convert("RGBA")
    return [p[3] > 128 for p in im.getdata()], im.size


def diff(a, b, area):
    return sum(1 for x, y in zip(a, b) if x != y) / area


def main():
    if len(sys.argv) not in (2, 3):
        raise SystemExit(__doc__)
    d = sys.argv[1]
    target_path = sys.argv[2] if len(sys.argv) == 3 else None

    frames = sorted(f for f in os.listdir(d) if f.endswith(".png"))
    if len(frames) < 3:
        raise SystemExit(f"{d}: need at least 3 frames, found {len(frames)}")

    base, size = silhouette(os.path.join(d, frames[0]))
    area = sum(base) or 1
    sils = [base]
    for f in frames[1:]:
        cur, cur_size = silhouette(os.path.join(d, f))
        if cur_size != size:
            raise SystemExit(f"{f} is {cur_size}, expected {size} — the canvas moved.")
        sils.append(cur)

    from_rest = [diff(s, base, area) for s in sils[1:]]
    print(f"{d}: {len(frames)} frames, {size[0]}x{size[1]}")
    print("  silhouette change vs frame 0: "
          + " ".join(f"{x*100:.0f}%" for x in from_rest))

    peak = max(range(len(from_rest)), key=lambda i: from_rest[i])
    best = from_rest[peak]
    moves = best >= MOVES_AT_LEAST
    bad = []
    if not moves:
        bad.append("the pose barely changes — this reads as a fidget, not a wind-up.")

    if target_path is None:
        # Open-ended: no target exists, so "did not retreat toward rest" is the best
        # available proxy and it is asserted exactly as it always was.
        last = from_rest[-1]
        print(f"  peak {best*100:.0f}% at frame {peak+1}; last frame {last*100:.0f}%")
        if peak != len(from_rest) - 1:
            bad.append(
                f"it peaks mid-sequence and falls back to {last*100:.0f}%. A progress-keyed "
                "wind-up shows the LAST frame at the moment of the hit, so this would cue "
                "the player with a near-resting pose. Pin the ending (last_frame_base64) "
                "instead of animating open-ended.")
    else:
        target, tsize = silhouette(target_path)
        if tsize != size:
            raise SystemExit(f"{target_path} is {tsize}, expected {size}.")
        to_target = [diff(s, target, area) for s in sils]
        print("  distance from the pinned pose:  "
              + " ".join(f"{x*100:.0f}%" for x in to_target))
        print(f"  peak {best*100:.0f}% from rest at frame {peak+1}; "
              f"last frame lands {to_target[-1]*100:.1f}% from the pinned pose")
        if to_target[-1] > LANDS_WITHIN:
            bad.append(
                f"the last frame sits {to_target[-1]*100:.1f}% from the pose it was pinned "
                f"to (bar: {LANDS_WITHIN*100:.0f}%). The generator did not land on the "
                "target, so the frame shown at the instant of the hit is not the pose that "
                "was authored as the cue.")
        drifts = [i for i in range(len(to_target) - 1)
                  if to_target[i + 1] > to_target[i] + BUILD_SLACK]
        if drifts:
            bad.append(
                "it moves AWAY from the pinned pose at frame(s) "
                + ", ".join(str(i + 1) for i in drifts)
                + " — the approach is not monotonic, so the wind-up backs off part way.")

    for b in bad:
        print(f"  UNUSABLE: {b}")
    if not bad:
        print("  OK: builds monotonically and ends at its extreme.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
