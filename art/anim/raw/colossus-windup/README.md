The wind-up for `boss.gravebound-colossus` — SHIPPED. Seed 7, free-form from
`../colossus-rest-pad.png` (the committed sprite with 30px of transparent headroom added at
the top, bottom-anchored). It hauls both fists overhead, chains taut, ready to bring them
down: the right read for a phase-one kit of `slam` / `charge` on a boss whose whole identity
is being slow and enormous.

Nine frames were generated; **the strip carries f0-f5**, and f0 is the committed rest file
rather than the generated one:

    python3 art/anim/strip.py boss.gravebound-colossus \
        "cast=art/anim/raw/colossus-windup:drop=7,8:first=art/anim/raw/colossus-rest-pad.png"

- **`:drop=7,8`** — the usual drift. Silhouette-vs-rest runs 13 24 35 61 63 61 59 53, so the
  run peaks at f5 and walks back; `windup-check.py` calls the raw run UNUSABLE and the
  trimmed one OK.
- **`:first=`** — this boss ships a cast with NO idle tag, so frame 0 is what
  `render/anim.ts` draws for the entire fight whenever it isn't winding up. The generator's
  returned frame 0 was 8 opaque pixels short of the input (thin-feature erosion, the
  signature recorded for the Tyrant's wing tips). With the substitution, the strip's frame 0
  differs from the sprite that shipped before this commit by **0 pixels**.

## The war-queen failure did NOT reproduce, and that is informative

`docs/animation.md` records that overhead arms on `boss.war-queen` came back off-model —
forearms as detached tubes, plume shrunk to a nub — and concluded the limit is the sprite's
detail budget rather than the canvas. This sprite is 31 colours and chunky, it was asked for
the same kind of big limb extension, and it came back **on-model**. That supports the detail-
budget theory rather than contradicting it: expect the failure on dense sprites, not on all
of them, and do not let the war-queen result talk you out of trying it on a simple one.

## No idle shipped, and it is not for want of trying

Two generations, both rejected by `art/anim/loop-check.py`, both kept next door in
`../colossus-idle/` and `../colossus-idle-2/` with their numbers. Read that before spending
a third.
