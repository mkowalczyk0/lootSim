The shipped `strike` frames for `boss.ferryman`, on the padded 75x131 canvas. This
directory REPLACES `../ferryman-release` as the strike source; that one is kept because
its f0-f5 are still the first six frames here, unchanged.

**This is the repo's first release that is a blow rather than a rise.** Read
`docs/animation.md` "The blow: where the third pose has to be" before regenerating any of
it.

f0-f5   the rise:    `../ferryman-release` f0-f5, BYTE-IDENTICAL. Approved art — the owner
                     said so explicitly after the second misread ("the wind ups look
                     really good"). Do not regenerate them.
f6-f7   the sweep:   the pole swings over the top. `ferryman-blow-sweep` (pinned
                     apex -> impact, seed 11) f2 and f4. Its f1, f3 and f5 are DROPPED:
                     f1 barely moves, and f3/f5 both fail the accent bar — see below.
f8      the IMPACT:  `../ferryman-slam-pad.png`, pinned, returned byte-identical.
f9-f10  the recover: `ferryman-blow-recover` (pinned impact -> rest, seed 13) f2 and f5.
                     Its f1 and f3 lost the accent entirely and f4 kept only a split, and
                     all three are dropped; the survivors are monotonic toward rest
                     (1988 -> 790 -> 0).
f11     the rest:    `../ferryman-rest-pad.png` itself, not the generated final frame, so
                     the hand-off back to the idle loop is byte-identical. The pinned run
                     finished 2 silhouette px away, so this costs nothing and is exact.

## Where the impact pose came from, and the trap it had to dodge

`../ferryman-slam-pad.png` is the peak frame of a free-form harvest from the RAISED pose
(seed 7, "drives the long pole straight down ... body drops into a deep crouch"), used as
a pose generator exactly as step 3a describes. It needed no accent repair: it came back
with 3 px of exact `#7dd3fc`, and `repair-split-accent.py` confirms there is nothing to
repair.

**The trap, and it is specific to this sprite: the Ferryman rests with his pole already
butt-down on the ground.** So the obvious impact pose — "slam the pole into the floor" —
terminates on a pose nearly identical to rest, and an animation from apex to a
rest-shaped pose is an unwind however it is prompted. That is the mechanical reason the
old release read as a settle, and no amount of reprompting a *downward* motion fixes it.

The impact pose therefore differentiates on **body**, not pole height: braced low stance,
pole swept diagonally across the body, mantle flared. Measured against the two endpoints
it is further from rest (2378 silhouette px) than the apex is (2306) — which is the
property that matters and the one to re-measure if this is ever regenerated. **A
candidate impact pose closer to rest than the apex is cannot read as a strike.**

## Two frames dropped on accent, and why one of them must stay dropped

- sweep f5: no blue pixel above the robe's own grey anywhere. Unrepairable, dropped, the
  same case `docs/animation.md` already records on the settle.
- sweep f3: **one pixel per eye**, both drifted to `#b3ebf8`.
  `repair-split-accent.py` refuses it and is **right** to — a one-pixel accent is not a
  split one, and the script says so in those words. It was the only frame in either
  generation sitting mid-downswing, so the temptation to force it in is real. Do not.
  Widening the accent is a change to shipped art and wants the owner, which is the same
  ruling `art/bosses/minotaur-accent.py` is parked under.

Both generations of the sweep (seeds 11 and 29, 6 and 4 frames) put nearly all the travel
in the LAST step regardless of prompt, so the downswing is genuinely fast rather than
under-sampled. The seed-29 run is not used: its mid frame drops the pole out of the
silhouette entirely, which reads as the weapon vanishing rather than as a smear.

## What the measurement could not tell you

Distance-to-target is **not** monotonic across the sweep (1856 -> 1804 -> 0), and that is
not a defect: silhouette XOR cannot see a rotation, so a pole swinging through an arc
reads as "wandering" to it. The motion that matters is monotonic in the thing the metric
cannot measure — the pole's angle, and its content top: 3 -> 4 -> 24 -> 35 px.

This is the same family as the caution in `docs/animation.md` about `npm run windup`
ranking a settle as the best-travelling animation in the repo. **Look at the frames.**
