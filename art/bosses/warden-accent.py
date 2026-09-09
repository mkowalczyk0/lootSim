#!/usr/bin/env python3
"""
Give `boss.warden` the one thing §1.4 says every monster has: a hot accent.

    python3 art/bosses/warden-accent.py

## What this fixes

`npm run chroma` measures the loudest colour covering 2+ pixels on each sprite and asserts
the hero's stays below every monster's, because §1.4/§19 make the single bright saturated
colour the monsters' signal — *the part that is looking at you*. On its first honest run
the gate found `boss.warden` at chroma **29.8**, below the hero's own legitimate skin tone
at 30.2, across 72 pixels. It is one of the five original floor-template bosses and predates
the accent discipline entirely, so this is not a stray fleck: the cue that the whole palette
convention exists to deliver is simply missing from that fight.

## What it does, and what it deliberately does not

It lights **four pixels** — two two-pixel eyes in the band of outline-dark shadow under the
helm rim, directly above the skin tones of the face at y=12. Nothing else on the sprite is
touched. The Warden is not repainted, recoloured or redrawn; it is given the one signal it
was missing, which is what was asked for.

## The colour

The Warden's element is `physical`, whose palette entry (`#e2e8f0`) is deliberately
desaturated — so unlike the Tyrant in `finish.ts` there is no element colour to lift the
accent to, and one has to be chosen. Every other hue in the cast is spoken for: red is the
iron brute, cyan the cult caster, yellow-green the scuttler, amber the corrupted saint,
gold the herald, violet the nameless, orange the war queen, cold blue the ferryman.

`#2ee6a6` is a saturated teal-green — the same hue family as the Warden's own green plate
but at roughly five times its chroma. That is the classic pixel-art reading of "the armour
is lit from inside": nothing else on the body competes, and the eye goes to the helm
immediately. It is unclaimed by any other encounter.
"""

from PIL import Image

SPRITE = "src/render/atlas/bosses/boss.warden.png"
ACCENT = (0x2e, 0xe6, 0xa6, 255)
# Two eyes, in the shadow band under the helm rim, above the face's skin tones at y=12.
EYES = [(28, 11), (29, 11), (31, 11), (32, 11)]
# Every one of these must currently be the shared outline ink — if the art is ever redrawn
# and these land somewhere else, this must fail rather than paint over the new sprite.
EXPECTED = (0x14, 0x10, 0x19)


def chroma(c):
    mx, mn = max(c[:3]), min(c[:3])
    return 0.0 if mx == 0 else ((mx - mn) / mx) * (mx / 255) * 100


def main():
    im = Image.open(SPRITE).convert("RGBA")
    for (x, y) in EYES:
        px = im.getpixel((x, y))
        if px[:3] != EXPECTED:
            raise SystemExit(
                f"{SPRITE} ({x},{y}) is #{px[0]:02x}{px[1]:02x}{px[2]:02x}, expected the "
                f"outline ink #141019. The sprite has changed — re-find the eye line rather "
                f"than painting blind.")
        im.putpixel((x, y), ACCENT)
    im.save(SPRITE, format="PNG", optimize=True, compress_level=9)
    print(f"lit {len(EYES)} pixels at chroma {chroma(ACCENT):.1f} "
          f"(#{ACCENT[0]:02x}{ACCENT[1]:02x}{ACCENT[2]:02x}) — nothing else touched")


if __name__ == "__main__":
    main()
