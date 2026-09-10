The shipped `strike` frames for `boss.exiled-tyrant`, on the padded 98x127 canvas.

f0-f3   the rise:   `../tyrant-rise-harvest` f1-f4, free-form. No pin needed: this
                    sprite's accent is many-pixel and held 71-76 chroma in every frame.
f4-f8   the settle: `../tyrant-settle-pinned` f1-f5, pinned impact -> rest.
f9      the rest:   `../tyrant-rest-pad.png` itself. The pinned run finished 76 silhouette
                    pixels from its target, so the committed file is used instead and the
                    hand-off to idle is byte-identical.

The impact pose is `../tyrant-impact-pad.png` (the rise's f4).

NOTE: the generator returned this run's frame 0 with 277 opaque pixels missing at the outer
wing tips — nothing gained, nothing recoloured, and the encoder round-tripped the input
losslessly, so this is thin-feature erosion by the generator rather than a bad upload. It is
why the cast->strike seam is 522 rather than nearer zero. Measured against this animation's
own consecutive-frame steps (256-1001) that seam is still smaller than ordinary motion.
See docs/animation.md.
