REJECTED idle candidate 1 for `boss.gravebound-colossus`. Seed 3, prompt asked for heavy
breathing with shoulders rising and settling and the chains swaying.

    wrap back to frame 0: 14.2% of the body   (art/anim/loop-check.py, limit 10%)

The body narrows monotonically across the cycle — 84px wide down to 77px — and then snaps
back to full width on the wrap. Every frame is on-model, the green core holds 70.2 chroma in
all five, `npm run chroma` is happy and the contact sheet looks correct. It reads as a twitch
once per loop, forever, and **no trim fixes it**: because the drift is monotonic the last
frame is always the one furthest from the first (measured at 2, 3, 4 and 5 frames).

A diagnosis that was reached first and was WRONG, kept because the correction is the lesson:
"the idle is too busy". Its step size is 7.7% of the body against the shipped Ferryman's
7.4% — completely normal. That wrong reading came from a measurement that sliced the
Ferryman strip at the wrong frame width and reported a nonsense 101.7%, which should have
been discarded as a broken instrument instead of used as a bar. Check the instrument.
