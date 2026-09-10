#!/usr/bin/env python3
"""
Dim ONE declared accent of ONE frame below the gate's bar, so `npm run chroma` can be
falsified rather than argued with.

    python3 art/anim/dim-accent.py boss.corrupted-saint --hue 277 --frame 2 \
            --out /tmp/injected.png

## Why this is committed rather than a throwaway

`AtlasSprite.accents` was added on the argument that requiring EVERY declared accent to
clear the bar is *stricter* than the one-accent check it replaces, not looser. This repo
has a scar from exactly that shape of argument: `art/anim/windup-check.py` implemented the
right property, a boss failed it, and it shipped anyway because a docstring argued that a
different measurement was "strictly stronger" — and it wasn't. **A written argument is not
evidence; measure the thing the argument claims.**

So the claim gets an injection. Dim the Saint's violet eyes in one frame while the gold
halo stays bright and stays loudest, and the two gates disagree on the same bytes:

    derived (one accent, the old check)   ok    the accent is not REPLACED
                                          ok    the accent stays above the hero's
    declared (accents: [gold, violet])    FAIL  "violet eyes" is 20.0 vs hero 35.3

The old check passes because the frame's loudest colour is still gold, at its normal
chroma, at its normal hue — it never asks after the other accent at all. That is the
coverage the declaration buys, and it is the reason the change is not a waiver.

## The procedure

    python3 art/anim/dim-accent.py boss.corrupted-saint --hue 277 --frame 2 \
            --out /tmp/dimmed.png
    cp src/render/atlas/bosses/boss.corrupted-saint.png /tmp/real.png
    cp /tmp/dimmed.png src/render/atlas/bosses/boss.corrupted-saint.png
    npm run chroma           # must be RED, naming the accent and the frame
    cp /tmp/real.png src/render/atlas/bosses/boss.corrupted-saint.png
    npm run chroma           # green again

It refuses to write over a committed sprite: `--out` is required and may not land inside
`src/render/atlas/`. An injection that survives the session it was made in is a corrupted
sprite nobody remembers corrupting.

## What "dim" means here, precisely

Every 2+px colour within the gate's own 45 degree tolerance of the named hue is desaturated
toward its own brightest channel until its chroma reads `--to` (default 20, comfortably
below the hero's 35.3 bar and deliberately not zero). Hue and maximum channel are both
preserved exactly, so this is a *dimming* and not a repaint — the accent is still visibly
there and is simply no longer legible as an accent, which is the failure mode the gate
exists to catch. Deleting the pixels outright would be a weaker test: a colour that is
absent is easier to notice than one that is present and dull.
"""

import argparse
import re
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

MANIFEST = Path("src/render/atlas/manifest.ts")
HUE_TOLERANCE = 45  # must match tools/chroma.ts


def chroma(r: int, g: int, b: int) -> float:
    """`src/render/grade.ts#chroma`, in Python. Kept in step by the gate's own numbers."""
    mx, mn = max(r, g, b), min(r, g, b)
    return 0.0 if mx == 0 else ((mx - mn) / mx) * (mx / 255) * 100


def hue(r: int, g: int, b: int) -> float:
    r, g, b = r / 255, g / 255, b / 255
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if d == 0:
        return 0.0
    if mx == r:
        h = ((g - b) / d) % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return (h * 60) % 360


def hue_gap(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def frame_width(sprite_id: str) -> tuple[int, int]:
    """`(w, cols)` off the committed manifest row — never guessed from the PNG."""
    src = MANIFEST.read_text()
    row = re.search(rf'"{re.escape(sprite_id)}":\s*\{{(.*?)\}},?\s*(?:\n|$)', src, re.S)
    if not row:
        raise SystemExit(f"no ATLAS row for {sprite_id!r}")
    body = row.group(1)
    w = re.search(r"\bw:\s*([0-9]+)", body)
    cols = re.search(r"\bcols:\s*([0-9]+)", body)
    if not w:
        raise SystemExit(f"{sprite_id}: no w in the row")
    return int(w.group(1)), int(cols.group(1)) if cols else 1


def dir_for(sprite_id: str) -> str:
    if sprite_id.startswith("boss."):
        return "bosses"
    if sprite_id.startswith("hero."):
        return "characters"
    if ".monster." in sprite_id:
        return "monsters"
    return "icons"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sprite_id")
    ap.add_argument("--hue", type=float, required=True,
                    help="the declared accent to dim, in degrees")
    ap.add_argument("--frame", type=int, required=True, help="frame index in the strip")
    ap.add_argument("--to", type=float, default=20.0,
                    help="chroma to dim it to (default 20, below the hero's bar)")
    ap.add_argument("--out", type=Path, required=True, help="where to write the injection")
    args = ap.parse_args()

    if "src/render/atlas" in str(args.out.resolve()):
        raise SystemExit("refusing to write an injection into src/render/atlas/ — "
                         "--out must be a scratch path, see this script's docstring")

    src = Path(f"src/render/atlas/{dir_for(args.sprite_id)}/{args.sprite_id}.png")
    if not src.exists():
        raise SystemExit(f"{src} does not exist")
    w, cols = frame_width(args.sprite_id)
    if not 0 <= args.frame < cols:
        raise SystemExit(f"frame {args.frame} is outside the {cols}-frame strip")

    im = Image.open(src).convert("RGBA")
    px = im.load()
    x0, x1 = args.frame * w, args.frame * w + w

    # Only 2+px colours are the gate's business, so count first and dim only those. A lone
    # hot pixel is generator dithering to both this script and the gate.
    counts: Counter = Counter()
    for y in range(im.height):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a >= 128:
                counts[(r, g, b)] += 1

    remap: dict[tuple[int, int, int], tuple[int, int, int]] = {}
    for (r, g, b), n in counts.items():
        if n < 2:
            continue
        s = chroma(r, g, b)
        if s <= args.to or hue_gap(hue(r, g, b), args.hue) > HUE_TOLERANCE:
            continue
        # Desaturate toward the brightest channel: mx is fixed, so chroma scales linearly
        # with the distance of the other two channels from it, and hue is untouched.
        k = args.to / s
        mx = max(r, g, b)
        remap[(r, g, b)] = tuple(round(mx - (mx - c) * k) for c in (r, g, b))  # type: ignore[misc]

    if not remap:
        raise SystemExit(f"frame {args.frame} carries no 2+px colour within "
                         f"{HUE_TOLERANCE} degrees of hue {args.hue:.0f} above chroma "
                         f"{args.to} — nothing to dim, so this would prove nothing")

    changed = 0
    for y in range(im.height):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            to = remap.get((r, g, b))
            if to is not None:
                px[x, y] = (*to, a)
                changed += 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    im.save(args.out, format="PNG", optimize=True, compress_level=9)
    print(f"wrote {args.out} — frame {args.frame} of {args.sprite_id}, "
          f"{changed} pixels across {len(remap)} colours dimmed to chroma {args.to}")
    for before, after in sorted(remap.items()):
        print(f"    #{before[0]:02x}{before[1]:02x}{before[2]:02x} "
              f"({chroma(*before):5.1f}) -> #{after[0]:02x}{after[1]:02x}{after[2]:02x} "
              f"({chroma(*after):5.1f})")
    print("\nNow swap it in and run `npm run chroma` — see the procedure in the docstring.",
          file=sys.stderr)


if __name__ == "__main__":
    main()
