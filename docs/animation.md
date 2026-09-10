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

## Wind-ups: what does not work, and what to do instead

**`animate_image` free-form cannot produce a cast wind-up, and this is measured rather than
felt.** Three raid bosses were generated with prompts that named the requirement explicitly
("the final frame is the pose fully drawn back at maximum wind-up, about to release — do not
show the strike itself", plus feet-planted / no-wander wording). `art/anim/windup-check.py`
measures each frame's silhouette difference from frame 0:

    ferryman   8 21 31 39 41 43 40 39     peak at frame 6, falls back
    queen      1  1  2  6  7 10 17  9     barely moves at all, then halves
    minotaur   6 13 18 23 26 26 22 17     peak at frame 5-6, falls back

Every one **peaks in the middle and returns toward the start** — the signature of a loop,
which is what the tool is built for. The Queen additionally hallucinated a sword that is not
on the base sprite, appearing around frame 4 and gone again by frame 8.

The consequence is specific and worse than "no animation": a wind-up is keyed to progress,
so the **last** frame is what the player sees at the instant of the hit. A sequence that
peaks mid-way and falls back shows a near-resting pose at exactly the moment it exists to
cue. It would make the fight *less* readable, which is the opposite of why §15's telegraph
rules want this animation at all.

**The fix is `last_frame_base64` / `last_frame_url`** — pin the ending, and the generator
interpolates between two poses instead of animating open-endedly. That needs a target pose
authored or generated per boss, which is a real extra step; re-rolling the open-ended call is
not a fix, and no prompt wording moved it across three attempts. Run
`art/anim/windup-check.py` on any candidate before stripping it: it rejects a sequence that
does not build monotonically and end at its extreme.

Idles are unaffected — a loop-shaped motion is exactly what an idle wants, which is why
`boss.ferryman`'s shipped fine.

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

**4. Run `art/anim/windup-check.py` on any cast candidate BEFORE stripping it.** It rejects
a sequence that does not build monotonically and end at its extreme — see the section above
for why that shape is the whole requirement, and why three prompted attempts all failed it.
Idles do not need this; loop-shaped motion is what an idle wants.

**5. Assemble with `art/anim/strip.py`,** which trims the frames as a set and prints the
`ATLAS` row including the `worldScale` that keeps the world footprint fixed.

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

- **The top open item is the wind-up pipeline, and it needs a step nobody has built.** No
  boss has a `cast` animation. The fix for the failure documented above is
  `last_frame_base64` — pin the ending so the generator interpolates between two poses —
  which requires a **target pose authored or generated per boss**. That is a real piece of
  work and a different pipeline from the one here; re-rolling the open-ended call is not a
  fix and no prompt wording moved it across three attempts. `windup-check.py` and the three
  rejected generations are in the repo so the next attempt starts from a measurement rather
  than from an argument.
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
