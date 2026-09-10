The shipped `strike` frames for `boss.ferryman`, on the padded 75x131 canvas.

f0-f5   the rise:   `../ferryman-rise-pinned` f1-f6. PINNED at both ends (apex ->
                    impact), because this sprite's accent is two pixels and a free-form
                    run dropped it entirely on two of eight frames. Its f0 is the apex
                    itself and is already the cast's last frame, so it is not repeated.
f6-f9   the settle: `../ferryman-settle-pinned` f1, f2, f4, f5 — pinned impact -> rest.
                    f3 is DROPPED: its eye is gone, not dimmed, and there is nothing to
                    locate (repair-split-accent.py refuses it, correctly). f5 IS included
                    and was repaired:
                        python3 art/anim/repair-split-accent.py <f5> 7dd3fc
                    which re-fused a split eye at (47,39).
f10     the rest:   `../ferryman-rest-pad.png` itself, not the generated final frame, so
                    the hand-off back to the idle loop is byte-identical rather than close.

The impact pose in between is `../ferryman-impact-pad.png`, the peak frame of
`../ferryman-rise-harvest`-equivalent free-form run (travel from apex peaked there at
41.8%). See docs/animation.md.
