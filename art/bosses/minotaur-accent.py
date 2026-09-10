#!/usr/bin/env python3
"""
Widen the Minotaur's eyes from one pixel each to two, so the accent survives generation.

    python3 art/bosses/minotaur-accent.py

## Why this is a technical repair rather than an art change

`boss.labyrinth-minotaur` is the one raid boss with no animation at all, across four
attempts (two idles historically, two wind-up harvests on 2026-09-09). Every one failed
`npm run chroma` the same way, and the reason is now measured rather than guessed.

`npm run chroma` scores the loudest colour covering **2+ opaque pixels** — deliberately, so
one stray pixel reads as generator dithering rather than as a design decision. The Minotaur's
accent is `#b577eb` on exactly **two pixels, one per eye**, at (55,28) and (44,29). They are
eleven pixels apart, so each eye is a *single* pixel, and a single pixel has no redundancy:
one shade of drift and that eye contributes nothing the gate can see.

The comparison that settles it — the same generator, the same call, three bosses:

    boss.war-queen           accent 91.8, many pixels   -> 90.6-91.8 in every frame
    boss.exiled-tyrant       accent 76.1, many pixels   -> 71.4-76.1 in every frame
    boss.labyrinth-minotaur  accent 45.5, ONE px/eye    -> 22.4 in every generated frame

So it is not brightness. The Minotaur has been started from `#a855f7` at 63.5 before and
still lost the eye; the Queen keeps a *dimmer-in-principle* accent perfectly because it is
carried by many pixels. **What fails is redundancy, not intensity.**

## What it does, and what it deliberately does not

Promotes **one** adjacent pixel per eye — the dark violet of the eye socket the art already
draws — to the accent colour. Two pixels painted, total accent 2 px -> 4 px, 2 per eye.

- **Same colour.** `#b577eb`, the value already on the sprite. Nothing is brightened.
- **Same position.** The eye does not move; it becomes one pixel wider on its own socket.
- **Minimum.** One pixel per eye is the least that can create redundancy at all, since the
  gate's threshold is two. No further widening, no restyling, no second accent.
- **Only violet is overwritten** — the pixels replaced are `#351057` and `#442d53`, both
  already part of the eye socket. No skin, horn or armour pixel is touched.

Every target pixel's current value is asserted before painting, as `warden-accent.py` and
`ferryman-accent.py` do, so a redrawn sprite fails loudly instead of putting bright violet
somewhere in the middle of the Minotaur's chest.
"""

from collections import Counter

from PIL import Image

SPRITE = "src/render/atlas/bosses/boss.labyrinth-minotaur.png"
SIZE = (102, 106)
ACCENT = (0xb5, 0x77, 0xeb, 255)

# (x, y) to paint -> the dark socket violet that must currently be there.
WIDEN = {
    (54, 28): (0x35, 0x10, 0x57),   # right eye, inward neighbour
    (43, 29): (0x44, 0x2d, 0x53),   # left eye, outward neighbour
}
# The eyes themselves, asserted so a moved eye fails rather than being widened into a face.
EYES = {(55, 28): ACCENT[:3], (44, 29): ACCENT[:3]}


def chroma(c) -> float:
    mx, mn = max(c[:3]), min(c[:3])
    return 0.0 if mx == 0 else ((mx - mn) / mx) * (mx / 255) * 100


def accent_pixels(im: Image.Image) -> int:
    return Counter(p[:3] for p in im.getdata() if p[3] >= 128)[ACCENT[:3]]


def main() -> None:
    im = Image.open(SPRITE).convert("RGBA")
    if im.size != SIZE:
        raise SystemExit(f"{SPRITE} is {im.size}, expected {SIZE} — re-find the eyes.")

    for (x, y), want in {**EYES, **WIDEN}.items():
        px = im.getpixel((x, y))
        if px[3] < 128:
            raise SystemExit(f"({x},{y}) is transparent — the sprite has been redrawn.")
        if px[:3] != want:
            raise SystemExit(
                f"({x},{y}) is #{px[0]:02x}{px[1]:02x}{px[2]:02x}, expected "
                f"#{want[0]:02x}{want[1]:02x}{want[2]:02x}. The sprite has been redrawn — "
                f"re-find the eyes rather than painting blind.")

    before = accent_pixels(im)
    for x, y in WIDEN:
        im.putpixel((x, y), ACCENT)
    im.save(SPRITE, format="PNG", optimize=True, compress_level=9)
    after = accent_pixels(im)
    print(f"widened both eyes: accent {before} px -> {after} px at chroma "
          f"{chroma(ACCENT):.1f} (#{ACCENT[0]:02x}{ACCENT[1]:02x}{ACCENT[2]:02x}, unchanged); "
          f"{len(WIDEN)} pixels painted, nothing else touched")


if __name__ == "__main__":
    main()
