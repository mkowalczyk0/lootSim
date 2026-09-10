#!/usr/bin/env python3
"""
Raw PixelLab animation frames -> the committed strip PNG the ATLAS row describes.

    python3 art/anim/strip.py boss.ferryman idle=art/anim/raw/ferryman-idle
    python3 art/anim/strip.py boss.ferryman idle=.../ferryman-idle \
                              cast=.../ferryman-windup:drop=7

Writes `src/render/atlas/<dir>/<id>.png` as a horizontal strip and prints the `anim`
table to paste into `render/atlas/manifest.ts`.

## Why a script rather than a hand-assembly

The same argument `art/bosses/finish.ts` makes and states as the pattern for every art
batch: **a treatment that lives in a script survives a re-roll; one applied by hand is lost
the first time anybody regenerates one animation.** Re-rolling a single tag should re-apply
the same treatment and re-derive the same manifest row rather than needing either retyped.

## Several tags share ONE strip, and that is what makes the trim load-bearing

`AtlasAnim` has one `cols` and each tag names a `from`/`to` range inside it, so a boss with
an idle AND a cast is one PNG, not two. That is why every tag must be passed in a single
invocation: **the bounding box is taken across every frame of every tag at once.**

Trimming per frame would re-centre each pose and the sprite would jitter against its own
feet anchor. Trimming per *tag* is the same bug one level up and is worse, because it is
invisible until the boss starts casting: the idle and the cast would sit on different crops
and the body would jump the instant a wind-up began. Assembling one tag at a time into the
same file cannot express this, which is why the old single-tag CLI is gone rather than kept
alongside.

**Tag order is the frame order, and the first tag owns frame 0.** `render/sprites.ts`
depends on frame 0 being the sprite that shipped before the animation existed, so pass
`idle` first.

## The two things this enforces, because the gate downstream will fail otherwise

1. **Every frame is the same size, and that size is the row's `w`/`h`.** `npm run anim`
   checks the strip PNG is exactly `w * cols` wide and `h` tall.
2. **The drawn character does not move.** `worldScale` is world units per PIXEL, so the
   invariant is that it stays put and `feet` — a FRACTION of `h` — is re-derived whenever
   the frame height changes. This script reads the current row and prints both, with the
   reasoning inline, rather than leaving the arithmetic to whoever pastes it.

   > This used to say `worldScale` is recomputed as `targetWorldHeight / h`, and that rule
   > is only correct while the character fills the canvas. On a padded canvas it is wrong
   > in the direction that looks like success: it silently shrinks the character (18% on
   > `boss.war-queen`) while every gate stays green. `boss.war-queen` is the first sprite
   > with transparent headroom, and it is why the rule changed.

## The trim reads ALPHA, not `Image.getbbox()`

`getbbox()` calls a pixel non-empty if ANY channel is non-zero, so one fully transparent
pixel carrying a stale RGB value makes the box the whole canvas and the trim silently
becomes a no-op — `w`/`h` then come out as the generator's canvas rather than the sprite.
Measured on the frames committed today it happens to make no difference (their transparent
pixels are all zero), so this is a latent hazard rather than a live bug; it is written this
way so a future generation that returns dirty transparency fails to trim *loudly* instead
of quietly resizing a boss.
"""

import re
import sys
from pathlib import Path

from PIL import Image

MANIFEST = Path("src/render/atlas/manifest.ts")


def dir_for(sprite_id: str) -> str:
    """Where each id's PNG lives, mirroring render/atlas/index.ts's glob."""
    if sprite_id.startswith("boss."):    return "bosses"
    if sprite_id.startswith("hero."):    return "characters"
    if sprite_id.startswith("prop."):    return "props"
    if ".monster." in sprite_id:         return "monsters"
    return "icons"


def scrub_transparent(im: Image.Image) -> Image.Image:
    """Zero the RGB of fully transparent pixels.

    `animate_image` sometimes returns frames whose transparent pixels carry stale non-zero
    RGB — first seen on the Warden idle, 2,323 of them per frame, where every generation
    before it came back clean. It is invisible (alpha is 0), but it is a live instance of
    the hazard `alpha_box` below is written to survive, and leaving it in the committed
    strip means any future tool reaching for `getbbox()` gets the whole canvas instead of
    the sprite. Normalising here keeps the COMMITTED art canonical rather than relying on
    every reader to be as careful as `alpha_box` is.

    Visible no-op by construction: it only touches pixels with alpha 0.
    """
    px = list(im.getdata())
    if all(p[3] != 0 or p[:3] == (0, 0, 0) for p in px):
        return im
    out = Image.new("RGBA", im.size)
    out.putdata([(0, 0, 0, 0) if p[3] == 0 else p for p in px])
    return out


def alpha_box(im: Image.Image):
    """The sprite's own extent — see the note above on why `getbbox()` is the wrong call."""
    return im.getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox()


def union_box(frames):
    """One bounding box across every frame of every tag."""
    box = None
    for im in frames:
        b = alpha_box(im)
        if b is None:
            continue
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]),
                                     max(box[2], b[2]), max(box[3], b[3]))
    if box is None:
        raise SystemExit("every frame is empty")
    return box


def pad_to_tallest(frames, height=None):
    """Bottom-anchor frames of differing height, padding the short ones at the TOP.

    A pose that reaches — a raised arm, a flared wing — needs canvas above the character
    that the resting frames do not have, so a tag generated on a taller canvas arrives
    taller than the idle it shares a strip with. The old code refused the whole run.

    Padding at the top is the only correct anchor, and the reason is `drawSprite`:
    `drawImage(canvas, -w/2, -h + h*feet, w, h)` puts the canvas BOTTOM at a fixed
    offset below the entity's position, so the bottom edge is the ground and every
    frame must keep the same number of pixels between the character's feet and it.
    Pad at the bottom instead and the boss hovers; pad both and it does both by half.
    """
    tall = height or max(im.height for im in frames)
    out = []
    for im in frames:
        if im.height == tall:
            out.append(im)
            continue
        canvas = Image.new("RGBA", (im.width, tall), (0, 0, 0, 0))
        canvas.paste(im, (0, tall - im.height))
        out.append(canvas)
    return out


def frame_order(p: Path):
    """Sort `f2` before `f10`.

    Plain filename order is wrong the moment a generation has more than ten frames, and
    `animate_image` accepts up to 16 — `sorted()` would run f0, f1, f10, f11, ... f2 and
    scramble the animation with nothing to see in the output but a strip in the wrong
    order. Sort on the trailing integer when there is one.
    """
    m = re.search(r"(\d+)$", p.stem)
    return (0, int(m.group(1))) if m else (1, p.stem)


def load_tag(spec: str):
    """`tag=dir` or `tag=dir:drop=i,j` -> (tag, [frames]), in frame order.

    `drop=` removes generated frames by their index in the directory, and it exists for one
    measured reason. With a pinned ending, `animate_image` reliably backs off toward rest in
    the PENULTIMATE frame before landing on the target: two disjoint seeds on the Ferryman
    gave distance-from-target 43 41 36 30 26 19 **2 11 0** and 43 43 38 31 23 12 **4 9 0**,
    the same retreat at the same index. That is systematic rather than seed noise, and in a
    progress-keyed wind-up it reads as the boss committing, relaxing, then snapping — a
    false tell in the animation whose whole job is to be a true one. Dropping that frame is
    a treatment, so it lives here rather than in whoever-remembers-to-do-it.
    """
    if "=" not in spec:
        raise SystemExit(f"expected tag=dir, got {spec!r}\n{__doc__}")
    tag, _, where = spec.partition("=")
    drop = set()
    if ":drop=" in where:
        where, _, raw = where.partition(":drop=")
        drop = {int(x) for x in raw.split(",") if x != ""}
    d = Path(where)
    if not d.is_dir():
        raise SystemExit(f"{where} is not a directory")
    paths = sorted((p for p in d.iterdir() if p.suffix == ".png"), key=frame_order)
    if not paths:
        raise SystemExit(f"{where} holds no .png frames")
    if any(i >= len(paths) for i in drop):
        raise SystemExit(f"{where}: drop={sorted(drop)} names a frame past the "
                         f"{len(paths)} that exist.")
    paths = [p for i, p in enumerate(paths) if i not in drop]
    if not paths:
        raise SystemExit(f"{where}: every frame was dropped")
    return tag, [scrub_transparent(Image.open(p).convert("RGBA")) for p in paths]


def current_row(sprite_id: str):
    """`(h, worldScale, feet)` off the committed row, so the draw can be preserved."""
    if not MANIFEST.exists():
        return None
    src = MANIFEST.read_text()
    row = re.search(rf'"{re.escape(sprite_id)}":\s*\{{(.*?)\}},?\s*(?:\n|$)', src, re.S)
    if not row:
        return None
    body = row.group(1)
    h = re.search(r"\bh:\s*([0-9.]+)", body)
    ws = re.search(r"\bworldScale:\s*([0-9.]+)", body)
    ft = re.search(r"\bfeet:\s*([0-9.]+)", body)
    if not (h and ws):
        return None
    return (float(h.group(1)), float(ws.group(1)),
            float(ft.group(1)) if ft else 0.0)


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    sprite_id, specs = sys.argv[1], sys.argv[2:]

    tags = [load_tag(s) for s in specs]
    names = [t for t, _ in tags]
    if len(set(names)) != len(names):
        raise SystemExit(f"duplicate tag in {names}")

    every = [im for _, frames in tags for im in frames]
    widths = {im.width for im in every}
    if len(widths) != 1:
        raise SystemExit(f"frames differ in WIDTH: {sorted(widths)} — the generator's "
                         "canvas moved sideways, and there is no anchor that fixes that.")
    every = pad_to_tallest(every)
    tags = [(name, pad_to_tallest(frames, max(im.height for im in every)))
            for name, frames in tags]
    every = [im for _, frames in tags for im in frames]

    box = union_box(every)
    every = [im.crop(box) for im in every]
    w, h = every[0].size
    cols = len(every)

    strip = Image.new("RGBA", (w * cols, h), (0, 0, 0, 0))
    for i, im in enumerate(every):
        strip.paste(im, (i * w, 0))

    out = Path(f"src/render/atlas/{dir_for(sprite_id)}/{sprite_id}.png")
    strip.save(out, format="PNG", optimize=True, compress_level=9)
    print(f"wrote {out} — {w*cols}x{h}, {cols} frames of {w}x{h}")

    ranges, at = [], 0
    for name, frames in tags:
        ranges.append((name, at, at + len(frames) - 1))
        at += len(frames)

    print(f"\n  // paste into ATLAS[\"{sprite_id}\"]:")
    print(f"  w: {w}, h: {h},   // one FRAME; the strip is w*cols = {w*cols}")
    body = ", ".join(
        f"{name}: {{ from: {a}, to: {b}, seconds: 0.12, "
        f"loop: {'true' if name == 'idle' else 'false'} }}"
        for name, a, b in ranges)
    print(f"  anim: {{ cols: {cols}, tags: {{ {body} }} }},")

    row = current_row(sprite_id)
    if row is None:
        print(f"\n  worldScale is world units per PIXEL — carry the existing one over "
              f"unchanged, and set feet to (ground offset in px) / {h}.")
    else:
        h_old, ws_old, feet_old = row
        print(f"\n  worldScale: {ws_old},   // UNCHANGED — see below")
        if h != h_old:
            feet_new = feet_old * h_old / h
            # 6dp, not 4: at these heights 4dp moves the ground line by ~0.004
            # world units, which is small but is not zero and is free to avoid.
            print(f"  feet: {feet_new:.6f},   // was {feet_old} of {h_old}px; "
                  f"{feet_old * h_old:.2f}px of ground offset, now over {h}px")
            print(f"\n  // The frame grew {h_old} -> {h}px and BOTH of those lines are\n"
                  f"  // load-bearing. `worldScale` is world units per pixel, so leaving it\n"
                  f"  // alone is what keeps the character the same size; the old\n"
                  f"  // `targetWorldHeight / h` rule assumed the character filled the\n"
                  f"  // canvas, and on a padded one it would shrink it by "
                  f"{(1 - h_old / h) * 100:.0f}%.\n"
                  f"  // `feet` is a FRACTION of h, so it has to be re-derived or the\n"
                  f"  // character sinks {feet_old * (h - h_old):.2f}px into the floor.")
        else:
            print(f"  feet: {feet_old},   // unchanged — the frame height did not move")


if __name__ == "__main__":
    main()
