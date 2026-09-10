**Failed** blow harvest for `boss.gravebound-colossus`, kept because a recorded failure is a
generation the next person does not have to spend. Seed 11, free-form from the wind-up's own
apex frame (arms fully overhead), prompted for both fists smashing down into the ground with
the body dropping into a deep crouch behind them.

This was docket §19's decisive experiment, chosen deliberately: **the least detailed sprite in
the roster** (31 colours, chunky limbs), on the theory that "the generator cannot pose" might
really be "cannot pose a *detailed* sprite". Its own wind-up had just come back with on-model
overhead arms where `boss.war-queen`'s came back as detached tubes, so if a generated blow was
going to work anywhere, it was going to work here.

## The result splits §19's wall into two independent failures

**The detail failure did not reproduce.** Every frame is on-model — legs distinct, chains
intact, core lit, no merged limbs, no squat blob. That is a real and useful negative: the
war-queen/Warden deformation is a property of dense sprites, not of the generator.

**The pose failure reproduced completely, and it is the deeper one.** The arms come down —
and they come down *to the sides*, which is the rest pose. Measured against the veto
(impact-vs-rest must exceed apex-vs-rest, bar 2571):

    frame   f0    f1    f2    f3    f4    f5    f6    f7    f8
    vs-rest 2571  2571  2452  2294  1671  1577  1470  1424  1450
                                    ^^^^ the arms-down frames, all far UNDER the bar

Not one frame passes. The run does not arrive at an impact; it **returns to rest**, which is
what an unwind is. The eye says the same thing the number does — f4-f8 read as "arms lowered",
never as "fists landed".

> **An arms-down pose is near rest by definition, because rest IS arms-down.** So on any boss
> that rests with its weapon or its hands low — which is most of them — a downward blow
> terminates on a rest-shaped silhouette and is vetoed no matter how well it is drawn. The
> Ferryman hit exactly this and the fix was not a better prompt: it was differentiating the
> impact on **body** — stance, lean, trailing cloth — so that the pose is far from rest for a
> reason other than where the weapon is.

The generator has no way to give you that. It is a loop generator (see docs/animation.md, "a
free-form run is a LOOP"), and prompting for an ending does not override the prior — here the
prior *is* the failure, because the loop's natural return and the blow's wrong answer are the
same pose.

## So the one route left is the one §19 already named

Pin an **authored** impact frame. Everything else is now closed with evidence:

- generation, free-form — this directory, plus three attempts on the Warden
- rigid transform of existing pixels — `../warden-blow-attempts/authored/`, route 2
- compositing from other frames — same, route 3

And note the trap that makes the authored frame hard, because it applies to the Colossus too:
the parts a blow needs (a deep crouch, arms extended down-and-*forward* rather than down-at-
the-sides) exist in no frame of this sprite either, so there is nothing to composite them
from. It is drawing, and `../warden-blow-attempts/authored/README.md` measures how much:
roughly half the sprite.
