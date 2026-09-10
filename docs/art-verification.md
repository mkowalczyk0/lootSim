# Verifying art in the game, not on a checkerboard

A contact sheet or an isolated sprite render can look right and still fail the way the v4
hero did: approved on a transparent background, rejected on sight the moment it was seen in
the actual game. `npm run art` doesn't even draw committed monster/boss PNGs (only procedural
grids, weapons and icons), and `npm run inworld` only shows the game-wide default cast, not a
specific realm's set. Neither is a substitute for the real render path.

**So: before reporting any task that adds or changes committed art done, run the game and
look at it.** This machine can run the game in a browser — cached Chromium via
`playwright-core`, the worktree's own dev server on a throwaway port (never 5173, which is
the owner's), a throwaway account through the normal login (accounts are server-backed now,
no guest mode). A dev URL shortcut (`?dive=<depth>`, `?tower=<height>`, `?rift=<mode>&tier=`,
`?planet=<id>&tier=`) drops straight onto a floor without walking the hub. Screenshot it.

## Reading a screenshot's colours: the moving-sprite trap

If a colour reading from a screenshot is disputed, don't just re-crop and re-eyeball —
measure, and measure the right thing.

**A page screenshot can be contaminated by whatever else is drawn on top of the subject.**
Sampling a monster's colour while it stands inside its own aggro-range ring under-read it
badly: the ring's stroke is alpha-blended over the near-black Tower floor, fading from red to
background, and that fade produces a band of dim, near-neutral transitional pixels that a
naive "exclude anything reddish" filter lets straight through as if they were sprite fill.
The fix is to sample (or screenshot) an unaggroed instance of the subject, or crop tight
enough to exclude the ring stroke entirely.

**If the on-screen colour still looks wrong once that's ruled out, don't trust a means
comparison alone — diff pixel-for-pixel, and validate the diff with a zero-motion control
before trusting it.** Two capture methods worth comparing when a genuine screenshot-fidelity
question comes up: `page.screenshot()` (Playwright's own compositor) against
`page.evaluate(() => document.getElementById("game").toDataURL())` (the canvas's own
pixels, read in-page). A raw per-pixel diff between the two over a monster's on-screen
position can come back large and alarming — most pixels differing by double digits — purely
because the two captures aren't simultaneous and this game's render loop interpolates
world-space position every frame (`lerpPos`, the fixed-timestep note elsewhere in this repo's
docs): a "static" monster still sits a pixel or so off between two sequential async calls,
and every edge pixel flips. That is a **motion** artifact, not a colour artifact, and reading
it as the latter is exactly backwards.

The way to tell the two apart: run the same pixel diff over a **screen-space element that
cannot have moved** — HUD text, a fixed UI panel — between the same two captures. If that
diffs to zero, the capture pipeline is byte-exact and any diff elsewhere is explained by
motion, not by a colour-fidelity gap. (Measured once, 2026-09: 0 differing pixels across
20,800 in a static HUD region, against 1526/1925 differing by more than 3 in the adjacent
monster region — same two captures, same instant.) A means comparison alone ("the two
readings are close") is weaker evidence than it feels like, because it can't distinguish "no
real difference" from "two different kinds of noise that happen to average out close"; the
zero-motion control is what actually proves the pipeline rather than merely suggesting it.

## A Tower-specific legibility note, not a defect

Pale monsters read duller than their own sprite file while standing inside their own aggro
ring, for the same reason a screenshot sample of one can be misread (above): the ring's
stroke fades to near-black right across the sprite, and a pale monster has less contrast to
spare against that fade than a dark one would. The Tower is the only realm with a pale
roster on a near-black floor (`MONSTER_SETS.tower`, see `docs/monster-sets.md`), so it's the
one place this could plausibly matter to how a fight actually reads — worth having on record,
not worth chasing today. Nothing here is wrong: the sprites, the floor contrast, and every
screenshot taken of them all checked out under direct measurement.
