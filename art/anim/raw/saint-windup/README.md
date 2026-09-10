The wind-up for `boss.corrupted-saint` — SHIPPED. Seed 7, free-form from
`../saint-rest-pad.png`, travel builds 0 -> 2165 peaking at f6. The saint raises both arms,
the halo flares into a starburst and a violet lance forms above it: a strong caster
telegraph for a kit of volley/beam/starLance.

Nine frames were generated; **the strip carries f0-f6.** Like the Warden's, the open-ended
run peaks mid-sequence and drifts back toward rest — silhouette-vs-frame-0 reads
11 24 30 30 61 70 65 60 — and a progress-keyed wind-up shows its LAST frame at the moment
of release, so the two drift frames are dropped by `strip.py`'s `:drop=7,8` rather than by
hand. `windup-check.py` calls the raw run UNUSABLE and the trimmed one OK; that is the
tool working, not a defect in the art.

    python3 art/anim/strip.py boss.corrupted-saint \
            idle=art/anim/raw/saint-idle "cast=art/anim/raw/saint-windup:drop=7,8"

## The halo deflates for one beat, and dropping that frame is worse

Visible on the contact sheet and invisible to every number: **f4's halo drops back to a
plain disc** between the starburst of f2-f3 and the white-hot burst of f5-f6. Silhouette
change vs rest is flat across f3-f4 (30, 30), so `windup-check.py` sees a held beat rather
than a retreat, and the gold accent never dims below the bar (64.7 there) so `npm run
chroma` sees nothing either. It was found by rendering the frames and looking, which is the
only instrument that was ever going to find it.

**Dropping f4 was measured and rejected.** Consecutive-step sizes, silhouette and colour
travel, against what a normal step looks like in the two casts already shipped:

    warden cast (shipped)          silhouette [ 444,  864,  859,  609]
    saint f0-f6 (shipping)         silhouette [ 342,  399,  688, 1041, 1278,  399]
    saint minus f4                 silhouette [ 342,  399,  688, 2123,        399]

Every step of the shipped cut sits inside the band the Warden's own cast runs at. Cutting
f4 makes arms-spread-wide jump straight to arms-raised-high in one frame, at 2.5x the
largest step in any animation in the repo — trading a beat that reads oddly for one that
reads as a pop. Judge a seam against the animation's own steps, not against zero.

The deflate is also readable as intent — the flare collapsing inward as the Saint gathers,
before it detonates into the lance — which is a question for an eye and not for a number.
**Left alone deliberately.** If the owner dislikes it the fix is a re-generation with the
halo prompted to hold, never a frame drop.

## This directory was called `saint-windup-blocked` for a day, and why

The Saint carries TWO hot accents — gold halo (hue 40) and violet eyes (hue 277) — and
`npm run chroma` used to assume one, deriving it from the loudest 2+px colour in the strip.
The two accents **trade rank**: gold leads all five idle frames, violet leads most of this
wind-up as the spell energy grows, and the gate read that swap as the accent having been
REPLACED (a ~125 degree hue jump against a 45 degree tolerance). Neither accent ever went
anywhere — measured, gold holds 63.9-74.9 and violet 62.0-80.8 across every frame of both
tags, against the hero's 35.3 bar.

The gate now takes a **declaration** (`AtlasSprite.accents`) and holds every declared accent
above the bar in every frame independently, which is stricter than what it replaced rather
than looser — falsified with `art/anim/dim-accent.py`, not argued. See docs/animation.md,
"A sprite with two accents".

**The one thing that was never worth re-rolling is still not worth re-rolling.** The rank
swap is a property of the sprite's palette, not of the seed.
