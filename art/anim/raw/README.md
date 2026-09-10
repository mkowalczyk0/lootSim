# Raw generations

`ferryman-idle/` is the generation behind the shipped `boss.ferryman` idle.
`ferryman-idle-committed/` is that idle read back **out of the committed strip**, so it
carries the eye repair `06eca70` applied after the strip was built — that, not the raws, is
what must be re-assembled when a second tag joins the strip.

`*-cast/` are the three **rejected** free-form wind-ups, kept as the evidence behind
`docs/animation.md` ("Wind-ups: what does not work").
`python3 art/anim/windup-check.py art/anim/raw/<dir>` reproduces the measurement that
rejected them. **Do not strip them into the atlas as animations.**

They are, however, a **source of target poses**. `ferryman-cast/f6.png` is the pose the
shipped wind-up is pinned to: in-style, correct size, correct canvas, and free. When a
free-form generation is rejected for its *shape*, its peak frame may still be a perfectly
good single pose — check before paying 20–40 generations for `create_character_state`.

`ferryman-windup-pinned/` and `ferryman-windup-seedB/` are two disjoint seeds of the same
pinned call, kept because together they show the penultimate-frame retreat is systematic
rather than seed noise. That is why `strip.py` takes a `drop=`.
