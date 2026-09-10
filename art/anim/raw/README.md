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

## The 2026-09-09 batch: three more raid bosses

`<boss>-harvest*/` are free-form runs used **as pose generators**, not as animations. They
loop, as they always do; only their peak frame is wanted. `<boss>-target.png` is the frame
that was harvested and pinned to. `<boss>-windup*/` are the pinned runs; the trailing number
is a re-roll.

- `tyrant-harvest` (peak 17%) and `minotaur-harvest` (21%) are the **rejected** first
  attempts, kept because they are the evidence for the amplitude rule: prompts that coil in
  place fall under the 25% bar, and re-prompting for a quarter TURN put the same two bosses
  at 32% and 40%.
- `tyrant-windup` is a rejected pinned run that finished 3.5% short of its target; seed B
  (`tyrant-windup2`) landed and is what shipped. Kept as the evidence that pinning usually
  but does not always land.
- `minotaur-harvest2` vs `minotaur-harvest3` are the **controlled pair** behind the eye
  finding: same prompt, same seed, the only difference being two pixels widened on the source
  sprite. 0 of 8 frames held the accent at one pixel per eye; 4 of 8 held it at two.
  `minotaur-windup` is the pinned run that still failed 4 of 9. The Minotaur ships
  un-animated and its sprite is unchanged; see `docs/animation.md`.
