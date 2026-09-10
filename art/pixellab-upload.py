#!/usr/bin/env python3
"""
Emit a committed sprite as base64 that actually survives an MCP tool call.

    python3 art/pixellab-upload.py src/render/atlas/bosses/boss.ferryman.png

## Why this exists

`animate_image` and the v3 `reference_image_base64` paths take a PNG inline. Sending a
committed sprite's bytes straight through fails, and the error message blames truncation,
which sent one session down the wrong path for three attempts. The real behaviour, measured:

  - RGBA original (6145 b64 chars): server received the RIGHT byte count and still could
    not decode. So it is not only length — the payload is being CORRUPTED in transit.
  - Indexed PNG with PIL's default 256-entry palette (5072 chars): failed. That file is
    full of long runs of identical base64 characters, because the unused palette entries
    are zeros.
  - Same image, palette trimmed to exactly the colours used (4292 chars, longest identical
    run 8): **succeeded.**

So the thing to avoid is a long run of repeated characters in the base64, and the fix is a
tight palette — which is free here because every sprite in this repo is pixel art with
binary alpha and well under 256 colours. Padding after IEND does NOT help; that was tried.

The conversion is pixel-exact and asserted to be: it fails loudly rather than quietly
shipping a recoloured sprite to the generator. Never downscale a sprite to make it fit —
the art direction is explicit that art is authored high and drawn near 1:1.
"""

import base64, io, re, sys
from PIL import Image


def tight_png(path: str) -> bytes:
    """The same image as an indexed PNG with no wasted palette entries."""
    im = Image.open(path).convert("RGBA")
    px = list(im.getdata())
    # Normalise RGB under FULL transparency to zero before anything else.
    #
    # `animate_image` can return frames whose transparent pixels carry stale non-zero RGB
    # (measured on the Warden idle: 2,323 of them; every generation before it came back
    # clean, which is why this went unnoticed). Those channels are invisible — alpha is 0
    # — but the round-trip assertion below compares whole RGBA tuples, so the script
    # refused perfectly good art and blamed itself for altering it.
    #
    # This is the same distinction docs/animation.md already draws in the other direction:
    # an assertion about pixel COLOUR is not an assertion about pixel PRESENCE. Here the
    # assertion was about colour where only presence and visible colour can matter. The
    # normalisation is a visible no-op by construction (it only touches alpha==0 pixels),
    # and doing it here rather than at the call site keeps the round-trip check STRICT
    # instead of loosening it to "close enough".
    px = [(0, 0, 0, 0) if p[3] == 0 else p for p in px]
    alphas = {p[3] for p in px}
    if not alphas <= {0, 255}:
        raise SystemExit(f"{path}: alpha is not binary ({sorted(alphas)[:8]}...) — "
                         "this converter would change it; handle that case deliberately.")
    opaque = sorted({p[:3] for p in px if p[3] == 255})
    if len(opaque) > 255:
        raise SystemExit(f"{path}: {len(opaque)} colours, too many for one transparent index.")

    lut = {c: i + 1 for i, c in enumerate(opaque)}          # index 0 is the transparent one
    out = Image.new("P", im.size)
    palette = [0, 0, 0]
    for c in opaque:
        palette += list(c)
    out.putpalette(palette)                                  # tight: no 256-entry zero fill
    out.putdata([0 if p[3] == 0 else lut[p[:3]] for p in px])

    buf = io.BytesIO()
    out.save(buf, format="PNG", transparency=0, optimize=True, compress_level=9)
    data = buf.getvalue()

    back = list(Image.open(io.BytesIO(data)).convert("RGBA").getdata())
    if back != px:
        raise SystemExit(f"{path}: round trip changed pixels — refusing to send altered art.")
    return data


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    path = sys.argv[1]
    data = tight_png(path)
    b64 = base64.b64encode(data).decode()
    run = max((len(m.group(0)) for m in re.finditer(r"(.)\1*", b64)), default=0)
    print(b64)
    print(f"\n# {path}: {len(data)}B, {len(b64)} b64 chars, longest identical run {run}",
          file=sys.stderr)
    if run > 16:
        print("# WARNING: long repeated run — this is what corrupts in transit.",
              file=sys.stderr)


if __name__ == "__main__":
    main()
