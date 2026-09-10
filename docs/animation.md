# Sprite animation

The design record for the animation subsystem. `src/render/anim.ts` is the whole of the
logic, `src/render/atlas/manifest.ts` holds the tables, and `npm run anim`
(`tools/anim.ts`, in the `npm test` chain) is the gate.

**Phase 1 shipped the architecture and the gate with no art in them.** Zero rows in
`ATLAS` carry an `anim` table today and the game draws exactly what it drew before. That
is the intended state, not an unfinished one — the fallback ladder means art can arrive
one sprite at a time, and a sprite that never gains an animation is not a sprite that is
behind.

## The seam: the simulation never knows about animation

The clock lives in `render/`. It **reads** simulation state and writes none.

There is no `frame` field on an `Enemy`, no `animTimer` on a `Hero`, and there must never
be one. If making a sprite play requires adding a field to something in `game/`, the seam
has been taken in the wrong place — the thing to do then is find the state the simulation
already keeps for its own reasons and derive the animation from that.

Everything needed so far already existed:

| what plays | derived from | who owns it |
| --- | --- | --- |
| a boss wind-up | `BossState.ability`, `castTimer`, `castTotal` | `game/boss.ts`, unchanged |
| a walk cycle | wall-clock seconds + the entity's own id as a phase offset | nothing |
| a one-shot | wall-clock seconds since the event the renderer already saw | nothing |

The payoff is co-op, and it came for free: a client rebuilds boss cast state from the
snapshot — `net/sync.ts` already carries `ability`, `castTimer` and `castTotal`, and
`net/protocol.ts`'s `b` field already declares them — so the same animation resolves
identically on both ends **without one new wire field**. That is what the seam buys.
Had the frame index lived on the entity, it would have had to be sent.

## Draw code asks for a tag, never a frame index

A caller says "draw the boss casting", not "draw frame 6". Frame indices are the art's
business and they change every time a strip is re-exported; a tag name survives that.

**For bosses the tag *is* the `BossAbilityId`** — lowercase, no prefix, by agreement with
the boss-ability side. A new ability therefore costs the render side zero coordination: it
either has art or it falls down the ladder to the static frame, and the fight is exactly as
readable either way. `BOSS_ABILITIES` is `Record<BossAbilityId, BossAbility>`, so it is
already the exhaustive table to key off.

## Every rung is a fallback, never an error

The same idiom `chooseSpriteArt` already uses for `MONSTER_SETS`. The ladder takes a **chain**
of names, most specific first, then `idle`, then frame 0 — for a boss cast that chain is
`[<BossAbilityId>, "cast", "idle"]`.

**The chain is what makes the art affordable, and it is the reason this is a chain rather
than one name.** The four raid bosses draw their rotations from a shared pool of about
fifteen abilities (`cleave`, `slam`, `beam`, `quake`, `summon`, `windmill`, `corruption`,
`ringOut`, `enrage`, `volley`, `starLance`, `wall`, `meteor`, `charge`, `backlash`), and the
tag for a cast is the ability id. One animation per ability would be forty-odd generations
per boss for a fight the player sees for two minutes. Instead a boss ships **one** generic
`cast` wind-up that covers every ability it has, and a specific ability can be given its own
art later with nothing rewired — the more specific name simply starts resolving.

That also means art can land **in stages**: a boss with only an `idle` still resolves every
ability it will ever cast. The gate asserts all three of those (one `cast` covers all
fifteen; a per-ability override wins without rewiring; an idle-only boss still resolves
everything).

Requested tag → `idle` → frame 0. A sprite with no `anim` table, an unknown tag, a tag naming frames the strip
doesn't have, a NaN clock, no sprite at all — all resolve to a valid frame and none of them
throw. Missing art is never a broken screen; the worst case is the static single frame the
game drew before any of this existed.

The gate asserts this by crossing every row (including deliberately broken fixtures and
`undefined`) with every tag (including `""`, `"IDLE"`, `"../../etc"`) at every clock value
(including `-5`, `1e6` and `NaN`).

## Durations are in seconds, never frames or ticks

The sim runs at a fixed 60 Hz; rendering does not. A duration expressed in frames would
make animation speed a property of the viewer's monitor. The gate walks a clock forward in
30/60/144/240 Hz steps and asserts the frame at a given instant is identical in all four.

## Why a boss wind-up is keyed to *progress*, not to a clock

This is the one design decision here that is about gameplay rather than plumbing, and it is
the reason `frameAtProgress` exists alongside `frameAt`.

A casting boss is locked in place. Its wind-up **is** the player's warning and their window
to punish it. So the cast animation is part of the telegraph's readability, not decoration
on top of it — and the pose has to mean the same thing every time the player sees it.

A free-running clock cannot promise that, because a cast's length is not a constant.
`DepthProfile.telegraph` squeezes the wind-up shorter as you descend (down to `MIN_CAST`,
0.45s) and an enrage buys a tighter rotation, so the same animation would be leisurely on a
shallow floor and cut off on a deep one. Keyed to `1 - castTimer / castTotal` instead, the
sprite's pose *is* the countdown: the wind-up lands exactly when the shape on the floor
fills, at every depth.

The gate states this as a **comparison**, not a bound, per the campaign-comparison lesson in
`CLAUDE.md` — it samples the halfway point of the wind-up across a real range of cast
durations (0.45s–3.0s) and asserts progress-keying shows one pose at every duration while
free-running shows four different ones, including reaching the final "impact imminent" frame
while a 3s cast is only half done.

> An earlier draft of that check compared the frame at the *end* of the cast and passed both
> ways, because a non-looping tag clamps to its last frame and so "lands" trivially at any
> duration long enough. It proved nothing. Sampling **mid**-cast is what makes it a real
> comparison — the same vacuous-check trap `CLAUDE.md` describes, caught by the gate on its
> first run.

## Killing a boss mid-cast

A telegraph whose owner dies mid-cast is deleted and the ability never resolves
(`updateTelegraphs` in `game/dungeon.ts`: *"the owner died mid-cast: the ability dies with
it"*). But `ability` and `castTimer` are still sitting on the dead boss's state.

So `castFrame` takes an explicit `alive` flag, and **gone from the fight means the cast is
cancelled**. Without it, a corpse would freeze mid-wind-up in a pose for a hit that is never
coming. Killing a boss through its wind-up is a real and rewarded play, so this case
actually happens.

## The manifest tables

`AtlasSprite.anim` is **optional**, and that is the whole compatibility story: a row without
one is a static single frame and behaves exactly as it did before this existed. A superset,
not a migration.

```ts
"boss.example": {
  id: "boss.example", w: 76, h: 94, worldScale: 1.17, feet: 0.03,
  anim: {
    cols: 12,                                                  // frames across the strip
    tags: {
      idle: { from: 0, to: 3,  seconds: 0.18, loop: true  },
      sunder: { from: 4, to: 11, seconds: 0.09, loop: false }, // tag == BossAbilityId
    },
  },
},
```

`w`/`h` stay the size of **one frame**, so every other consumer of the row — `worldScale`,
`feet`, the portrait sizing in `src/ui/portrait.ts`, `npm run inworld` — keeps reading
exactly the numbers it always read. The strip PNG is `w * cols` wide and `h` tall, which is
what the gate checks it against.

> Note for whoever animates the hero: `tools/smoke.ts` separately asserts the hero PNG is
> `w x h`. That check needs to become `stripWidth(meta) x h` in the same commit that gives
> `hero.legend-base` an `anim` table, or the hero is the one sprite whose animation fails
> the gate next door.

## Making the art (Phase 2)

Two scripts sit next to the raws, following the pattern `art/bosses/finish.ts` states for
every art batch: **a treatment that lives in a script survives a re-roll; one applied by
hand is lost the first time anybody regenerates a single animation.**

- **`art/pixellab-upload.py`** turns a committed sprite into base64 that survives an MCP
  tool call. This is not busywork — sending a sprite's bytes straight through *fails*, and
  the error blames truncation, which is misleading. Measured on `boss.ferryman.png`: the
  RGBA original arrived at the **right byte count** and still would not decode, so it is
  corruption rather than length; an indexed PNG with PIL's default 256-entry palette also
  failed, because its unused entries are zeros and produce long runs of identical base64
  characters; the same image with the palette **trimmed to exactly the colours used**
  (longest identical run: 8) went through first time. Padding after `IEND` does not help —
  that was tried. The conversion is pixel-exact and asserts so, and it refuses rather than
  quietly shipping altered art to the generator. **Never downscale a sprite to make it
  fit**; the art direction is explicit that art is authored high and drawn near 1:1.
- **`art/anim/strip.py`** assembles the returned frames into the strip PNG the `ATLAS` row
  describes and prints the row. It trims the frames **as a set** — one bounding box across
  all of them, never per-frame — because trimming each independently re-centres each pose
  and the sprite jitters against its own feet anchor. It also recomputes `worldScale` as
  `targetWorldHeight / h` so animating a boss never changes how big it is in the arena.

`animate_image` is the right generator call here: it works on a loose sprite, where
`animate_character` / `animate_object` need an id of something PixelLab generated, and the
committed boss art is not that. Cost is about one generation per short animation at these
sizes. Pass `no_background: true` — the default follows the input, but passing `false`
flattens a transparent sprite onto **white**.

## Wind-ups: free-form does not work, a pinned ending does

**`animate_image` free-form cannot produce a cast wind-up, and this is measured rather than
felt.** Three raid bosses were generated with prompts that named the requirement explicitly
("the final frame is the pose fully drawn back at maximum wind-up, about to release — do not
show the strike itself", plus feet-planted / no-wander wording).
`art/anim/windup-check.py` measures each frame's silhouette difference from frame 0:

    ferryman   8 21 31 39 41 43 40 39     peak at frame 6, falls back
    queen      1  1  2  6  7 10 17  9     barely moves at all, then halves
    minotaur   6 13 18 23 26 26 22 17     peak at frame 5-6, falls back

Every one **peaks in the middle and returns toward the start** — the signature of a loop,
which is what the tool is built for. The Queen additionally hallucinated a sword that is not
on the base sprite. Because a wind-up is keyed to progress, the **last** frame is what the
player sees at the instant of the hit, so a sequence that falls back shows a near-resting
pose at exactly the moment it exists to cue. **Do not re-run the open-ended call.**

**`last_frame_base64` fixes it, and it does more than interpolate.** Measured on the
Ferryman: pinning the ending made the run converge on the pinned pose and land on it —

    distance from the pinned pose:  43 41 36 30 26 19 2 11 **0%**

— and the final frame came back **byte-identical to the target, all 8025 pixels**. So the
generator does not approximate the ending, it reproduces it. Three consequences, and the
third is the one that matters most:

1. The pinned regime has a statistic the open-ended one does not — the target is known, so
   "did it get there" can be asked directly instead of inferred from distance-from-rest.
   `windup-check.py` takes an optional target and asserts exactly that.

   > **The open-ended rule is deliberately conservative and WILL false-reject a good pinned
   > run — do not "fix" it.** Its test is `argmax(distance from rest) == last frame`, with no
   > tolerance, which is the only thing available when there is no target to measure against.
   > On the shipped Ferryman wind-up it reports UNUSABLE, because an intermediate frame sits
   > one point further from rest than the final one — while the final frame *is* the target,
   > to 0.0%. Passing the target is what tells the tool it may ask the stronger question. A
   > check that is too strict on a path we no longer use is the safe direction to be wrong in.
2. **The frame the player reads at the instant of the hit is fully under our control**,
   because it is a file we supply rather than something the generator invents.
3. **With a pinned ending there are TWO source sprites, and step 1 of the method below
   applies to both.** It was written when there was only ever one.

### The target pose is usually already in the repo

The target does not have to be authored or paid for. **A free-form generation rejected for
its *shape* can still contain a perfectly good single pose** — the shipped Ferryman wind-up
is pinned to `art/anim/raw/ferryman-cast/f6.png`, the peak frame of one of the three
rejections above. It is in-style, the right size, on the right canvas, and free.

`create_character_state` is the paid alternative — all four raid bosses exist as PixelLab
characters (112x112, 8 directions), so a posed variant can be generated properly. It costs
**20-40 generations** and returns the character on its own canvas, which then has to be
re-fitted to the sprite's; reach for it only when no rejected frame will do.

### A wind-up may not extend the silhouette

The boss sprites already fill their canvas edge to edge — measured, `boss.ferryman`'s alpha
bounding box is the full 75x107. So a pose that reaches beyond the envelope (a pole raised
overhead, arms flung wide) has nowhere to go.

It cannot be bought by enlarging the frame either, and this is the §1.4e staff hazard from
the other side: `worldScale` is `targetWorldHeight / h`, so adding headroom for a raised pole
grows `h`, shrinks `worldScale` to keep the world height fixed, and the *character* draws
smaller inside the taller frame — for the whole fight, idle included, not just the cast.

> Worth recording that this was checked rather than assumed: the first guess was that adding
> cast frames to an existing strip would grow the union trim and shrink the boss. That is
> **false** for the art as it stands, precisely because the canvas is already full. The
> constraint is real; the mechanism is the opposite of the one suspected.

So a wind-up re-arranges within the existing silhouette — a turn, a coil, a grip — rather
than extending it. That caps how loud a wind-up can be, and it is a constraint on the pose,
not a failure of the generation.

### The generator SPLITS a small accent, which is why the Minotaur cannot be animated

`docs/animation.md` has long recorded that the generator *dims* accents (39%, measured).
The Ferryman's wind-up failed `npm run chroma` a different and more interesting way:

    shipped idle frame:   2 px #7dd3fc              -> loudest 2+px colour #7dd3fc @ 49.8
    generated target:     1 px #7dd3fc + 1 px #8cd4e7 -> loudest 2+px colour #866c3f @ 27.8

The eye is still there and still looks right. But the gate measures the loudest colour
covering **2+ pixels** — deliberately, so a lone pixel reads as dithering rather than as a
design decision — and the generator had split the two-pixel eye into two adjacent shades.
Neither covers two pixels, so the accent is gone by the only measure that can tell an accent
from noise, and the loudest survivor is a dull olive *below the hero's own skin*.

**The root cause is that a two-pixel accent has no redundancy: one shade of drift destroys
it.** That is the real reason `boss.labyrinth-minotaur` has defeated every attempt at any
starting brightness, and it makes the fix already recorded for it — *enlarge the accent on
the source, more pixels rather than merely brighter* — right for a reason that had not been
identified. It is still a change to shipped art and still wants the owner.

`art/anim/target-accent.py` paints the **target pose's** accent to the shipped treatment
before generating. It was expected to rescue only the byte-exact final frame. **It rescued
every frame**, and that was measured as a controlled comparison — same seed, same prompt,
same first frame, the target's two eye pixels the only thing changed:

    unlit target:  49.8 49.8 42.7 42.7 49.8 35.7 49.8 35.7 **27.8**
    lit target:    49.8 49.8 49.8 49.8 49.8 49.8 49.8 49.8 **49.8**

So the drift in the first run was not the generator dimming an accent it was given — it was
the interpolation being dragged toward a target that had no accent to reach. **Pinning a lit
target stabilises the accent across the whole sequence.** Two lit endpoints, and the eye
survives between them.

That removes the 0.4-margin problem for the Ferryman entirely, without touching shipped art.
It does **not** rescue a sprite whose accent is too small on the *source* — the Minotaur has
no lit target to pin to and its two-pixel eye is the thing that fails — so the enlargement
fix above is still the answer there.

### The penultimate frame backs off, systematically

Two disjoint seeds of the same pinned call, distance from the target:

    seed A   43 41 36 30 26 19  2 11  0
    seed B   43 43 38 31 23 12  4  9  0

Both reach the pose, **retreat at the second-to-last frame**, then snap to it. Same index,
two independent samples — systematic, not seed noise. It reproduced again on the War Queen
and the Minotaur, on different prompts and seeds: **four of five pinned runs**. The fifth (the
Tyrant's second seed) was clean, so a re-roll can avoid it, but assume it and check.

The Tyrant also showed that **landing on the pinned pose is not guaranteed**: its first seed
finished 3.5% away, having reached 1% two frames earlier and drifted off. The Ferryman, the
Queen and the Minotaur all landed to 0.1% or exactly 0. So pinning is reliable enough to build
on and not so reliable that the check can be skipped — which is the whole reason the check
takes a target. In a progress-keyed wind-up that reads
as the boss committing, relaxing, and then snapping: a false tell inside the animation whose
entire job is to be a true one. `strip.py` takes `:drop=<i>` so the treatment lives in the
pipeline rather than in whoever remembers to do it.

Idles are unaffected by all of this — a loop-shaped motion is exactly what an idle wants,
which is why `boss.ferryman`'s shipped fine.

## Picking this up: the method, in order

Everything below is a thing that cost a session to find. Doing them out of order wastes
generations rather than failing loudly, which is why the order is written down.

**1. Measure the boss's accent BEFORE you animate it, and leave HEADROOM.** `npm run chroma`
is the check. If the sprite is missing or weak on §1.4's hot accent, fix it on the **source
sprite** and only then generate — the generator carries the accent through into every frame.

Headroom is the part that is easy to miss. **The generator does not preserve an accent's
intensity; it dims it.** Measured on the Minotaur: violet eyes at 45.5 on the still came
back at 27.8 across four of five frames — a 39% drop, and 27.8 is *below* the hero's own
skin at 30.2, so the accent had dimmed until it was no longer an accent. A still that merely
passes the gate can therefore produce a strip that fails it. Start near 50 or above, so a
39% drop still clears the hero's floor. Note the element palette entry is not always enough
on its own: void is `#c084fc`, a *light* violet that only reads 47.1, so the Minotaur uses
the saturated step of the same ramp (`#a855f7`, 63.5) instead. Repairing
a finished strip is a treadmill: the eye *moves between frames* because the head drifts
through the animation (rows 15/16/18/19/17 on the Ferryman), so it is per-frame coordinate
work, and it invalidates the moment anything is regenerated. `art/bosses/warden-accent.py`
and `art/bosses/ferryman-accent.py` are the worked examples; both assert every target pixel's
current value before painting, so a redrawn sprite fails loudly instead of getting two bright
pixels somewhere in its robe.

**2. Convert the sprite with `art/pixellab-upload.py`, never by hand.** Sending a committed
PNG's bytes inline fails, and the error blames truncation, which is misleading — the RGBA
original arrives at the *right byte count* and still will not decode. It is corruption, and
what corrupts is **long runs of identical base64 characters**. An indexed PNG with PIL's
default 256-entry palette fails for that reason (its unused entries are zeros); the same
image with the palette trimmed to the colours actually used goes through. Padding after
`IEND` does not help. The script does the conversion, asserts pixel-exactness, and refuses
rather than silently sending altered art. It is still occasionally rejected — retry, it is
intermittent.

**3. Generate with `animate_image`, `no_background: true`.** Passing `false` flattens a
transparent sprite onto **white**. `animate_character`/`animate_object` are not options here:
they need an id of something PixelLab generated, and the committed boss art is not that.

**4. Run `art/anim/windup-check.py` on any cast candidate BEFORE stripping it.** It exits
non-zero on a sequence that does not build monotonically and end at its extreme. Pass the
target as a second argument for a pinned run and it asserts the stronger property instead —
that the approach to the target is monotonic and the last frame lands on it exactly. Idles
do not need this; loop-shaped motion is what an idle wants.

**5. Assemble with `art/anim/strip.py`,** passing **every tag in one invocation**
(`idle=<dir> cast=<dir>`), because the tags share one strip and therefore one trim — trimming
per tag is invisible until the boss starts casting, and then the body jumps. `:drop=<i>`
removes the penultimate-frame retreat described above. It prints the `ATLAS` row including
the `worldScale` that keeps the world footprint fixed.

**6. `npm test`.** The gate checks the strip is `w * cols` wide, the tags name frames that
exist, the frame rects tile the strip, and — for an animated monster or boss — that the hot
accent is present in **every** frame rather than only the strip as a whole.

## A sprite whose accent is too small to survive generation

`boss.labyrinth-minotaur` is deliberately **not** animated, and the reason is worth knowing
before someone spends generations rediscovering it.

Its hot accent is two violet eye pixels. Two attempts at an idle both came back with those
eyes dimmed below the hero's own skin in several frames — 45.5 -> 27.8 on the first, and on
the second, starting from a much brighter `#a855f7` at 63.5, still 22.4 and 23.1 in two
frames of five, one of them a different hue entirely. Starting brighter did not help enough:
the generator is not scaling the accent down proportionally, it is losing a two-pixel
feature.

So the headroom rule above has a limit: **an accent carried by only a pixel or two may not
survive generation at any starting intensity.** The options, in order of preference, are to
enlarge the accent on the source sprite first (more pixels, not just brighter), to pin the
animation with a target frame, or to leave the boss static. Leaving it static is a hold, not
a regression — an un-animated boss is exactly what ships today, and the `chroma` gate
catching this is the gate doing its job rather than an obstacle to route around.

## The first animated strips did not load at all, and the gate stayed green

Worth reading before adding a frame to anything, because both halves of this will come
back the next time a PNG grows.

**What the owner saw:** raid bosses "turned tiny and super bad", and "the animations don't
work" — a small, low-detail Ferryman with a full-size boss shadow under it.

### Half one: the loader measured one frame against a whole strip

`atlas/index.ts` rejects a decoded image whose size disagrees with its manifest row, which
is right — a silent size drift puts every hitbox in that sprite's world footprint slightly
wrong. But it compared the file against `spr.w`, and **for an animated row `w` is one frame
by design**. So `boss.ferryman` (375x107 against a row reading 75) and both other strips
were rejected on **every boot, permanently**. This was never a slow-load race: there is no
size ceiling and nothing was merely late. Preloading harder would have fixed nothing.

`npm run anim` measured the same files against `stripWidth` and passed. Neither side was
wrong about its own number and **nothing compared the two** — the blind-instrument rule in
CLAUDE.md from the other direction: the instrument ran, and it was measuring a different
thing from the one that breaks. The fix is `fitsManifest` in `render/anim.ts`: one exported
test, called by the loader on the decoded image and by the gate on the committed file.
Keep it a call, not an inlined comparison, or the two drift apart again.

### Half two: a scale and a canvas were two decisions

The load failure should have shown the Ferryman's old sprite at its old size. Instead it
showed a third-size one, because `spriteAt` fell back to the procedural grid when a PNG
was not loaded while `spriteWorldScale` read `ATLAS[id].worldScale` with **no load check at
all** — and `drawEnemy` took its canvas from one and its scale from the other. A ~26px
procedural boss drawn at a scale tuned for 75px art is about a third of the right size, in
the old low-detail style, with no frames. All three symptoms, one cause.

That hazard predates animation and was invisible only because every boss PNG was ~4.6 KB
and always arrived. **Fixing the loader would have hidden it again rather than removed
it.** So `render/spriteart.ts` now owns the ladder as a pure function and returns
`atlasId`, `meta`, `worldScale` and `feet` from one branch, with `worldScale` non-null
*exactly* when `atlasId` is. `resolveSprite` in `sprites.ts` adds the canvas. There is no
longer a scale getter to pair with the wrong picture, and `npm run anim` asserts the
biconditional against a hostile load predicate ("nothing loaded" — the state the browser
was actually in, and one no headless run reaches by accident).

Two live bugs of that same family fell out while removing the API: a planet's resource
nodes were drawing `tinted("crystal")` — the atlas PNG once committed — at a hardcoded
`1.4`, the *procedural* grid's constant, so they have been roughly 3x oversized for as long
as `prop.crystal.png` has existed; and `itemIcon` paired an atlas canvas with `?? 1.4` the
same way. Both now take both halves from one `resolveSprite`. A third: the tint cache was keyed
`<name>#<frame>`, which does not say which rung the picture came from — so a monster tinted
during the pre-load window cached its *procedural* tint and kept serving it after the PNG
landed. `artKey` now keys on the resolved `atlasId`, so the two rungs cannot share an entry.

### What a frame actually costs

Measured, since the roadmap needs a budget rather than a guess:

| Sprite | Static | 5-frame strip | Per frame |
| --- | --- | --- | --- |
| `boss.ferryman` | 4,606 B | 39,389 B | 7,878 B |
| `boss.war-queen` | 5,637 B | 42,608 B | 8,521 B |
| `boss.exiled-tyrant` | 5,576 B | 37,253 B | 7,450 B |

A frame costs about **1.5-1.7x what the same sprite costs standing alone** — PNG's row
filters predict well down a single pose and poorly across a frame boundary, so the growth
is linear in frames with a constant penalty, not a cliff. **Nothing was "pushed over" a
limit**; the whole atlas is 0.4 MB across 136 files today. The only real ceiling is the
browser's max canvas dimension (~16,384 px on the tightest engine), which at a 98 px frame
is ~167 frames in one strip and at the hero's 39 px is ~420. An 8-tag hero is nowhere near
any of it. Plan frames against legibility and generation cost, not bytes.

## Known open ends

- **The wind-up pipeline works and `boss.ferryman` is the first boss with a `cast`.** It
  cost three generations, not the "different pipeline" this section used to predict: the
  target pose came out of one of the three rejected generations, which is the lesson worth
  carrying — **rejected art is a resource, not only a record.** Check a rejection's peak
  frame before paying 20-40 generations for `create_character_state`.
- **Three of the four raid bosses now have wind-ups** — the Ferryman, the War Queen and the
  Exiled Tyrant. The remaining one is the Minotaur, below.
- **A free-form generation is a POSE generator, and that is the cheap route to a target.**
  It reliably returns a loop, which is useless as an animation and perfectly good as eight
  poses. Prompt it for *amplitude* rather than for wind-up shape — it does the first well and
  cannot do the second — then harvest the peak frame. Two generations a boss, against the
  20-40 `create_character_state` costs.
- **On a full canvas the amplitude lever is a TURN.** Measured three times: prompts that
  coil or fold in place produced 17% and 21% from rest, below the 25% bar, while "pivots a
  quarter turn to present one shoulder" produced 32% and 40% on the same bosses. Turning
  side-on reorients the whole silhouette at once, which is the only large change available
  when nothing can extend past the frame.
- **`boss.labyrinth-minotaur` is still held, and the hold is now quantified.** Its accent is
  **one pixel per eye** — the two `#b577eb` pixels are eleven apart, so neither eye has any
  redundancy at all. Widening each eye to two pixels was built, measured and **reverted**,
  because it helps without being enough:

      1 px/eye   0 of 8 generated frames hold the accent   (22.4 in every one)
      2 px/eye   4 of 8 hold it                            (45.5 alternating with 23-29)

  Both numbers come from the same prompt and the same seed with only those two pixels
  changed, so the direction is proven and the size is not. The wind-up's *shape* is fine —
  40% from rest, lands on its pinned pose to 0.1% — so the accent is the only thing stopping
  it. **The next step is three or more pixels per eye**, which is past "the minimum the gate
  needs" and wants the owner rather than a session. `art/bosses/minotaur-accent.py` is
  committed and applies cleanly; the shipped sprite is deliberately unchanged until then.
- **The Minotaur has no idle** — see the section above. Enlarging its eyes on the source
  sprite (more pixels, not just brighter) is the cheapest thing to try next, but it is a
  change to shipped art and wants the owner's eye rather than a session's judgement.
- **A boss with an idle and no wind-up is safe, not half-finished.** The fallback ladder
  resolves an un-drawn `cast` to `idle`, so the boss keeps breathing through a wind-up
  exactly as a static sprite sits still today. No regression, and the floor telegraph is
  still the primary cue. That is only true because the fallback does nothing clever.
- Of the eight new boss ability tags, only `blink` and `sanctuary` were judged to want their
  own art; the rest resolve through the existing telegraph pipeline and need nothing from the
  render side to work.
- **`blink` moves the body discontinuously.** Nothing in this module assumes position
  continuity — it resolves a frame and nothing else — but any *interpolation* added later
  (the snapshot lerp in `net/sync.ts` already interpolates non-local entities every tick)
  needs to treat a blink as a teleport rather than smearing the boss across the arena.
- **`crescendo` and `enrage` have `shape: "none"`** and paint no telegraph. They lock the
  body and have a cast, so they want a tag, but there is no shape on the floor for the
  animation to agree with — for those two the animation carries the whole tell, which makes
  them the highest-value art in the set rather than the lowest.
- **Nothing is verified in a browser.** No session on this machine can click through the
  game. Every claim here is checked headlessly against pure modules; the first person with
  a browser should confirm a real animated sprite plays at the speed the table says.
