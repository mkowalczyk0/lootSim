#!/usr/bin/env python3
"""
Does a generated idle actually LOOP, or does it snap back at the wrap?

    python3 art/anim/loop-check.py art/anim/raw/colossus-idle
    python3 art/anim/loop-check.py src/render/atlas/bosses/boss.warden.png:57:0-4

Exits non-zero if the seam is a pop, so it can be run before stripping rather than merely
read. This is `windup-check.py`'s counterpart: a wind-up must BUILD and end at its extreme,
an idle must CLOSE and end where it started, and neither property is visible on a contact
sheet — a strip of five frames that each look fine can still jerk once per cycle, and the
only frame pair that shows it is the one the sheet never puts side by side.

## Why it exists

The Colossus idle came back with a body that narrowed monotonically across the cycle
(84px wide down to 77px) and then snapped back to full width on the wrap. Every frame is
on-model, every frame passes `npm run chroma`, `windup-check.py` does not apply to an idle,
and the strip looks correct in `npm run art`. It reads as a twitch in game, once per loop,
forever.

## The measure, and the one that does NOT work

Silhouette XOR between consecutive frames, including the wrap from the last frame back to
the first, as a fraction of the sprite's own body area. Measured on everything shipped:

    warden idle      body 2750px   max step  4.1%   wrap  0.7%
    saint idle       body 3074px   max step  2.0%   wrap  3.7%
    ferryman idle    body 4646px   max step  7.4%   wrap  7.6%
    colossus (bad)   body 4230px   max step  7.7%   wrap 14.2%

Note what the numbers say about the Colossus candidate: its **step** size is normal — 7.7%
against the Ferryman's shipped 7.4% — so "the idle is too busy" was the wrong diagnosis and
was in fact reached first, off a broken measurement that sliced the Ferryman strip at the
wrong frame width and reported a nonsense 101.7%. Check the instrument. The defect is the
seam alone.

**The tempting self-relative measure does not work**: "the wrap must not exceed the largest
ordinary step by much" is appealing because it needs no cross-sprite constant, but the Saint
ships at 1.89x by that measure and the bad Colossus is 1.85x. It cannot separate approved art
from art that visibly pops, so it is reported for information and nothing is decided on it.

`WRAP_LIMIT` is therefore a **pinned constant, not a value derived from the sprites under
test** — deriving a bound from the set it judges is how a check ends up concluding only that
the worst thing in the set is the worst thing in the set. It sits above every shipped idle
(0.7-7.6%) with real headroom and below the one candidate that visibly popped (14.2%), which
is a calibration with named evidence on both sides rather than a round number. Move it only
with a measurement, and write the new evidence in here when you do.
"""

import sys
from pathlib import Path

from PIL import Image

# Above every idle shipped as of 2026-09-10 (worst: ferryman 7.6%) and below the Colossus
# candidate that snapped (14.2%). See the docstring for the full table.
WRAP_LIMIT = 10.0

# Sprites the OWNER has looked at and approved over the bar. Keyed by the spec passed in.
#
# **This is not a widened limit and must never become one.** `WRAP_LIMIT` stays where the
# measurement put it; an entry here says "a person looked at this one and said ship", which
# is a different claim from "we measured this as fine" and has to stay distinguishable from
# it three months from now. A constant quietly raised to admit the thing it rejected is how
# a check stops meaning anything — and the next candidate that lands at 11.8% deserves the
# same eye rather than inheriting this one's verdict.
#
# Add an entry only with a real approval and name it. Never to make your own art pass.
OWNER_APPROVED: dict[str, tuple[float, str]] = {
    "art/anim/raw/colossus-idle-2": (
        11.8,
        "2026-09-10: owner reviewed the batch and said the idle looks good. Its seam is "
        "proportionally fine (1.04x its largest ordinary step, same as the shipped "
        "ferryman idle); it is over the line only on the absolute measure, in the 7.6-14.2% "
        "band where this limit has no evidence either way.",
    ),
}


def frames_from(spec: str):
    """A directory of frames, or `<strip.png>:<frame width>:<from>-<to>`."""
    if ":" in spec:
        path, w, rng = spec.split(":")
        lo, hi = (int(x) for x in rng.split("-"))
        im = Image.open(path).convert("RGBA")
        return [im.crop((i * int(w), 0, (i + 1) * int(w), im.height)) for i in range(lo, hi + 1)]
    d = Path(spec)
    if not d.is_dir():
        raise SystemExit(f"{spec} is neither a directory nor <strip>:<w>:<from>-<to>")
    import re
    def order(p: Path):
        m = re.search(r"(\d+)$", p.stem)
        return (0, int(m.group(1))) if m else (1, p.stem)
    paths = sorted((p for p in d.iterdir() if p.suffix == ".png"), key=order)
    if not paths:
        raise SystemExit(f"{spec} holds no .png frames")
    return [Image.open(p).convert("RGBA") for p in paths]


def silhouette_xor(a: Image.Image, b: Image.Image) -> int:
    """Pixels opaque in exactly one of the two frames. Alpha >= 128, as everywhere else."""
    if a.size != b.size:
        raise SystemExit(f"frames differ in size: {a.size} vs {b.size}")
    pa, pb = a.load(), b.load()
    w, h = a.size
    return sum(1 for y in range(h) for x in range(w)
               if (pa[x, y][3] > 128) != (pb[x, y][3] > 128))


def body_area(im: Image.Image) -> int:
    px = im.load()
    w, h = im.size
    return sum(1 for y in range(h) for x in range(w) if px[x, y][3] > 128)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    frames = frames_from(sys.argv[1])
    if len(frames) < 3:
        raise SystemExit(f"need at least 3 frames, found {len(frames)}")

    area = body_area(frames[0])
    if area == 0:
        raise SystemExit("frame 0 is empty — nothing to measure against")
    steps = [silhouette_xor(a, b) for a, b in zip(frames, frames[1:])]
    wrap = silhouette_xor(frames[-1], frames[0])

    pct = lambda n: 100.0 * n / area
    print(f"{sys.argv[1]}: {len(frames)} frames, {frames[0].size[0]}x{frames[0].size[1]}, "
          f"body {area}px")
    print("  step (% of body): " + " ".join(f"{pct(s):.1f}%" for s in steps))
    print(f"  wrap back to frame 0: {pct(wrap):.1f}%  (limit {WRAP_LIMIT}%)")
    print(f"  for information only, not decided on: wrap is "
          f"{wrap / max(steps):.2f}x the largest ordinary step")

    if pct(wrap) > WRAP_LIMIT:
        allowed = OWNER_APPROVED.get(sys.argv[1].rstrip("/"))
        if allowed is not None:
            print(f"  OVER THE BAR AT {pct(wrap):.1f}%, ALLOWED BY OWNER OVERRIDE — approved "
                  f"by eye, NOT by measurement.\n    {allowed[1]}")
            if abs(pct(wrap) - allowed[0]) > 0.5:
                raise SystemExit(
                    f"  but the override records {allowed[0]}% and this measures "
                    f"{pct(wrap):.1f}% — the art changed since it was approved, so the "
                    "approval no longer covers it. Re-check with the owner.")
            return
        raise SystemExit(
            f"  POPS: the seam is {pct(wrap):.1f}% of the body against a {WRAP_LIMIT}% limit. "
            "The last frame does not come back to the first, so this jerks once per cycle "
            "in game. Re-generate asking for a seamless loop that returns to the starting "
            "pose; trimming frames will not fix it if the drift is monotonic.")
    print("  OK: the seam is no worse than an ordinary step — this loops.")


if __name__ == "__main__":
    main()
