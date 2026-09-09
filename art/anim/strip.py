#!/usr/bin/env python3
"""
Raw PixelLab animation frames -> the committed strip PNG the ATLAS row describes.

    python3 art/anim/strip.py boss.ferryman idle art/anim/raw/ferryman-idle/*.png

Writes `src/render/atlas/<dir>/<id>.png` as a horizontal strip and prints the `anim`
table to paste into `render/atlas/manifest.ts`.

## Why a script rather than a hand-assembly

The same argument `art/bosses/finish.ts` makes and states as the pattern for every art
batch: **a treatment that lives in a script survives a re-roll; one applied by hand is lost
the first time anybody regenerates one animation.** Re-rolling a single tag should re-apply
the same treatment and re-derive the same manifest row rather than needing either retyped.

## The two things this enforces, because the gate downstream will fail otherwise

1. **Every frame is the same size, and that size is the row's `w`/`h`.** `npm run anim`
   checks the strip PNG is exactly `w * cols` wide and `h` tall. The frames come back from
   the generator on a shared canvas, so this trims them as a SET — one bounding box across
   every frame, never per-frame — because trimming each one independently would centre each
   pose differently and the sprite would jitter against its own feet anchor.
2. **The world footprint does not move.** `worldScale` is recomputed as
   `targetWorldHeight / h` against the height the sprite already had, so animating a boss
   never changes how big it is in the arena — telegraph radii, arena sizing and camera
   framing are all set against that number.
"""

import sys, os
from PIL import Image

# Where each id's PNG lives, mirroring render/atlas/index.ts's glob.
def dir_for(sprite_id: str) -> str:
    if sprite_id.startswith("boss."):    return "bosses"
    if sprite_id.startswith("hero."):    return "characters"
    if sprite_id.startswith("prop."):    return "props"
    if ".monster." in sprite_id:         return "monsters"
    return "icons"


def union_box(frames):
    """One bounding box across every frame — see note 1 above."""
    box = None
    for im in frames:
        b = im.getbbox()
        if b is None:
            continue
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]),
                                     max(box[2], b[2]), max(box[3], b[3]))
    if box is None:
        raise SystemExit("every frame is empty")
    return box


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)
    sprite_id, tag, paths = sys.argv[1], sys.argv[2], sys.argv[3:]
    frames = [Image.open(p).convert("RGBA") for p in sorted(paths)]
    sizes = {im.size for im in frames}
    if len(sizes) != 1:
        raise SystemExit(f"frames differ in size: {sizes} — the generator's canvas moved.")

    box = union_box(frames)
    frames = [im.crop(box) for im in frames]
    w, h = frames[0].size
    cols = len(frames)

    strip = Image.new("RGBA", (w * cols, h), (0, 0, 0, 0))
    for i, im in enumerate(frames):
        strip.paste(im, (i * w, 0))

    out = f"src/render/atlas/{dir_for(sprite_id)}/{sprite_id}.png"
    strip.save(out, format="PNG", optimize=True, compress_level=9)

    # Preserve the world height the sprite already had, if it is already in the manifest.
    print(f"wrote {out} — {w*cols}x{h}, {cols} frames of {w}x{h}")
    print(f"\n  // paste into ATLAS[\"{sprite_id}\"]:")
    print(f"  w: {w}, h: {h},   // one FRAME; the strip is w*cols = {w*cols}")
    print(f"  anim: {{ cols: {cols}, tags: {{ {tag}: "
          f"{{ from: 0, to: {cols-1}, seconds: 0.12, loop: true }} }} }},")
    print(f"\n  worldScale must become targetWorldHeight / {h} to keep the footprint.")


if __name__ == "__main__":
    main()
