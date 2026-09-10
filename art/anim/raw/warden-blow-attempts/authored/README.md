Docket §19, attempted 2026-09-10: **can the Warden's blow be AUTHORED rather than generated?**

Answer: not by any route that reuses pixels. Two more routes are now closed, with mechanisms
and numbers, and the size of what is actually left is measured. Nobody should spend a fourth
generation, and nobody should spend a day on either of the routes below.

§19's premise was *"the generator interpolates and re-renders. It does not pose."* That is
true and it is not the whole constraint. **Neither does any transform of the pixels that
already exist.**

---

## Route 2 — rigid rotation of (arms + weapon) about the shoulder

`route2-rigid-rotation.png`: apex | body with the assembly removed | the assembly rotated
-90, -105, -120, -135 degrees about the shoulder at (29, 53).

The reasoning was good and the result is unusable. An overhead swing genuinely *is* a rotation
of a closed arms-plus-weapon loop about the chest, the sword separates cleanly from the body
by region, and a nearest-neighbour rotation invents no new colours. Every output is a jumble:
the arms come out as horizontal tubes and the blade points sideways rather than down.

> **The mechanism, and it generalises to every sprite in this game: a front-facing sprite's
> limbs are not rigid bodies.** Their pixels encode foreshortening, shading and occlusion for
> the one position they were drawn in. An arm drawn reaching *up* is not an arm drawn
> reaching *down* rotated by 180 degrees — it is a different drawing. Affine transforms move
> pixels; they cannot re-render what those pixels depict.

This is the same wall the generator hits, reached from the opposite side, which is why it is
worth writing down rather than filing as "my script didn't work".

## Route 3 — compositing the pose out of parts of OTHER frames

`route3-composite.png`: apex | three composites at 8x.

Better premise: stop transforming, and take the arms-down anatomy the artist already drew —
the **rest** frame — then move the sword to centre-front and compress the body into a crouch.
Nothing is rotated, nothing is invented, every pixel is the artist's.

At thumbnail size these look like the Warden. At authoring zoom they fall apart: the left arm
is missing (the sword mask carries the gauntlet, the upper arm stays behind), no hand
convincingly meets the grip at the new angle, and the "crouch" is a vertical shear that
doubles the tassets rather than a pose.

**And then the numbers say the same thing the eye does, which is the part worth keeping.**
docs/animation.md's veto is that impact-vs-rest must exceed apex-vs-rest:

    apex vs rest          1485
    best composite        754      VETOED, 0.51x

It is *nearer rest than the wind-up is* — the exact signature of an unwind, and a worse score
than the rejected seed-37 generation (1001-1044). That is not bad luck in my choice of
offsets. It is structural:

> **A composite blow is biased toward rest by construction.** The only frame in the sprite
> that contains arms-down, weapon-down anatomy IS the rest frame, so any pose assembled from
> it inherits rest's silhouette — and the veto measures distance from rest. Compositing can
> only ever build the pose it is least allowed to build.

## What is actually left, with a number

Measured against `boss.ferryman`, the repo's one existence proof of a real blow:

    ferryman impact frame vs the 19 frames that existed before it was authored:
        nearest existing frame differs by 43.1% of the body
    my best Warden composite vs the 10 frames that exist:
        nearest existing frame differs by 30.6%

So a blow is roughly **half the sprite drawn new**. Rearranging existing parts reached 30.6%
and it was the wrong 30.6% — silhouette change spent on moving a sword rather than on the
lean, the lunge and the extended arms that are what a blow is made of.

**The remaining work is drawing, and it is specific**: a torso pitched forward, one leg
lunging and one trailing, and two arms extended down-and-forward onto a grip. None of those
three exist in any frame of this sprite, so there is nothing to copy them from, and that is
the whole reason this item is hand-authoring rather than tooling.

## Two things that would otherwise get re-litigated

- **A different release is NOT available for this boss.** The war-queen's blow became a
  rise-and-open because her kit is things that arrive from the sky. The Warden's is
  `cleave` / `slam` / `quake` / `windmill` / `ringOut` — swings, every one. The blow is the
  thing.
- **The impact effect does not need to be in the sprite.** `render/fx.ts` already draws
  impact stars and particles, so the ground-crack at the blade tip is the engine's job. The
  sprite only owes the pose.
