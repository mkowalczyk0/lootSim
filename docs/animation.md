# Sprite animation

The design record for the animation subsystem. `src/render/anim.ts` is the whole of the
logic, `src/render/atlas/manifest.ts` holds the tables, and `npm run anim`
(`tools/anim.ts`, in the `npm test` chain) is the gate.

**The method below is proven end to end and three raid bosses are animated through it** —
`boss.ferryman`, `boss.war-queen` and `boss.exiled-tyrant` each carry an `idle` and a `cast`
wind-up. Everything after the method is either the architecture it runs on or the record of
what each step cost to find; **the failures are kept because every one of them is a
generation the next person does not have to spend.**

A sprite with no `anim` table is a static single frame and behaves exactly as it did before
any of this existed. That is a supported state, not a backlog item: the fallback ladder means
art arrives one sprite at a time, and a boss that never gains an animation is not behind.

## Picking this up: the method, in order

Everything below is a thing that cost a session to find. Doing them out of order wastes
generations rather than failing loudly, which is why the order is written down.

**1. Check the accent BEFORE you animate, and count PIXELS, not brightness.** `npm run
chroma` is the check. If the sprite is weak on §1.4's hot accent, fix it on the **source
sprite** and only then generate.

> **This step used to say "the generator dims accents by 39%, so start near 50". That
> explanation is retired — it is wrong, and reaching for a brighter colour because of it
> wastes generations.** The same generator call across four bosses:
>
>     boss.war-queen           91.8, many px         -> 90.6-91.8 in every frame
>     boss.exiled-tyrant       76.1, many px         -> 62.7-76.1 in every frame
>     boss.ferryman            49.8, 2 px            -> holds, once the TARGET is lit too
>     boss.labyrinth-minotaur  45.5, ONE px per eye  -> 22.4 in every frame
>
> The Minotaur is not the dimmest and is the only failure. **What survives generation is
> redundancy, not intensity** — an accent carried by one or two pixels has no margin, and a
> single shade of drift destroys it as far as any 2+-pixel measure is concerned. Starting
> brighter has been tried on that sprite twice, from `#a855f7` at 63.5, and did not help.

So: an accent on many pixels needs nothing. An accent on **two** pixels survives only if the
pinned target carries it too (step 3) — that is what `art/anim/target-accent.py` is for. An
accent on **one** pixel per feature does not survive at all, and widening it is a change to
shipped art that wants the owner rather than a session; `art/bosses/minotaur-accent.py` is
the worked example, measured and deliberately not applied.

Whatever you paint, paint it on the **source**, never on a finished strip. The feature moves
between frames as the body does (the Ferryman's eye sits on rows 15/16/18/19/17 through its
idle), so repairing a strip is per-frame coordinate work that invalidates the moment anything
is regenerated. `art/bosses/warden-accent.py` and `art/bosses/ferryman-accent.py` are the
other worked examples; every one of these asserts each target pixel's current value before
painting, so a redrawn sprite fails loudly instead of getting two bright pixels somewhere in
its robe.

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

For an **idle**, that is the whole step — a loop is what an idle wants, and a loop is what
this tool reliably makes.

For a **cast wind-up** it is three calls, because a wind-up must build and END at its extreme
and free-form generation cannot do that (the section below has the measurements). In order:

- **3a. Harvest a target pose.** Run `animate_image` free-form and keep the peak frame. You
  are using the loop generator as a *pose* generator — asking it for the one thing it does
  well instead of the thing it demonstrably cannot. A rejected generation already in
  `art/anim/raw/` may already hold a usable pose; the Ferryman's target is the peak frame of
  one of the three original rejections. Otherwise commission one, at two generations.
  **Prompt for AMPLITUDE, not for wind-up shape**, and on a full canvas amplitude means a
  **turn**: measured on three bosses, prompts that coil or fold in place gave 17% and 21% of
  silhouette change from rest — under `windup-check.py`'s 25% bar — while "pivots a quarter
  turn to present one shoulder" gave 32% and 40% on those same sprites. Nothing can extend
  past the frame (see "A wind-up may not extend the silhouette"), so reorienting the whole
  body is the only large change available.
- **3b. Light the target** with `art/anim/target-accent.py` if the accent is small. With a
  pinned ending there are **two** source sprites and step 1 applies to both — this was the
  whole difference between the Ferryman's accent surviving and dying.
- **3c. Pin it**, passing the target as `last_frame_base64`. The final frame usually comes
  back byte-identical to what you pinned, so the pose the player reads at the instant of the
  hit is a file you chose rather than something the generator invented. *Usually* — one run
  in four finished 3.5% away, which is why step 4 is not optional.

**4. Run `art/anim/windup-check.py` on any cast candidate BEFORE stripping it.** It exits
non-zero on a sequence that does not build monotonically and end at its extreme. Pass the
target as a second argument for a pinned run and it asserts the stronger property instead —
that the approach to the target is monotonic and the last frame lands on it exactly. Idles
do not need this; loop-shaped motion is what an idle wants.

**5. Assemble with `art/anim/strip.py`,** passing **every tag in one invocation**
(`idle=<dir> cast=<dir>`), because the tags share one strip and therefore one trim — trimming
per tag is invisible until the boss starts casting, and then the body jumps. `:drop=<i>`
removes the penultimate-frame retreat — expect it, it reproduced on four of five
pinned runs (see "The penultimate frame backs off, systematically"). It prints the `ATLAS` row including
the `worldScale` that keeps the world footprint fixed.

**6. `npm test`.** The gate checks the strip is `w * cols` wide, the tags name frames that
exist, the frame rects tile the strip, and — for an animated monster or boss — that the hot
accent is present in **every** frame rather than only the strip as a whole.

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

## The strike: the release, and why it needs a memory

A wind-up used to end with the sprite snapping straight back to idle. The boss coiled, the
shape resolved, and nothing followed — no release, no follow-through, no moment where the
body did the thing it had spent a second and a half promising. That is what the owner meant
by "halfway" (see below), and the answer is a `strike` tag.

**The wind-up and the strike have different jobs, so they have different clocks.** A wind-up
is progress-keyed because it *is* the telegraph: its length carries information the player
has to read, `DepthProfile.telegraph` squeezes it as you descend, and the pose landing
exactly when the shape fills is the whole promise. A strike carries no information at all —
the hit has already landed, the decision is already made, the player has already dashed or
not. It is consequence, not warning. **So it must not track a clock**, and it runs for the
fixed `seconds` on its own tag like any other free-running animation. That it *also* cannot
get a clock on a client is a convenience, not the argument; the reason is that a strike is
not a telegraph.

**Priority is cast > strike > idle, always.** A boss hasted enough to begin its next wind-up
before the release has finished abandons the release mid-flourish. Never the reverse, never
a delay, never a queue: the readable thing must never be blocked by the decorative thing.
Getting this backwards is the one mistake here that could actually hurt a fight.

The tag chain is `[ability, "strike", "idle"]`, mirroring the cast chain for the same
reason — one release per boss covers every ability it has, and a per-ability release starts
resolving the day someone draws one.

The fallback ladder deliberately stops one rung short of `idle` for a strike, and that is
what makes this a superset rather than a change to shipped art: `resolveTag` falls through
to `idle`, which is right for a wind-up but wrong for a release, because a boss with no
strike art would otherwise play its own breathing as a flourish after every cast. Today
that is every boss in the game. `npm run anim` asserts it directly.

### `actionTimer` is not post-cast state

**If you go looking for "when did this boss's ability land", `actionTimer` is what you will
find, and it is wrong twice over.** It is written at `boss.ts:375` when an ability resolves
and counted down, which is exactly the shape wanted — but:

- **It has two writers.** `boss.ts:177` also sets it (to 0.35) as a retry gap when an
  ability cannot be used. "It is counting" does not mean "something just landed"; its
  meaning is supplied by whichever writer touched it last.
- **It is not on the wire.** `net/sync.ts` rebuilds client boss state with `actionTimer: 0`
  hardcoded. Anything reading it animates perfectly on the host and does nothing whatsoever
  on a client — a failure that is invisible in every test anyone would run solo.

The state that *is* shared is `ability`, `castTimer` and `castTotal`, which the snapshot
already carries. So a client sees the same `ability` non-null → null edge the host does, and
remembering that edge is all a release needs. `StrikeLatch` in `render/anim.ts` does exactly
that, and adds no field to anything in `game/` — the seam rule forbids a field on an
`Enemy`, not memory inside the clock.

### Key the latch on the Enemy, never on its id and never on its `boss`

Both wrong keys fail the same way: perfectly on the host, silently on a client or a second
floor.

- **Not the id.** `nextEnemyId` restarts at 1 on every floor and a descend builds a new
  `Dungeon`, so an id-keyed map hands the next floor's boss the last one's release. A reset
  hook would paper over it, and a reset hook is precisely the line that gets forgotten.
- **Not `e.boss`.** A client rebuilds that object from scratch on every snapshot, so the
  latch would evaporate twenty times a second on a client.
- **The `Enemy` itself is stable on both ends** — `net/sync.ts` reuses it via `byId` — and a
  `WeakMap` keyed on it cannot leak across floors by construction and needs no reset hook at
  all. `Dungeon.netLerp` is the existing precedent for object-keying this kind of state.

A release is also cancelled by death, for the reason `castFrame` already refuses to hold a
corpse in a cast pose: killing a boss through its wind-up is a real and rewarded play, and
the ability it was winding up never happened.

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

## The art scripts, and why each one exists

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

## Wind-ups: the evidence behind step 3

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

   > **CORRECTED 2026-09-10.** What stood here claimed the open-ended rule "WILL false-reject
   > a good pinned run", on the grounds that distance-to-target reaching zero is a *strictly
   > stronger* claim than
   > `argmax(distance from rest) == last frame`, so the latter could be waived whenever a
   > target was supplied. It is not stronger. It is **orthogonal**, and the difference is the
   > whole bug:
   >
   > - Distance-to-target measures whether the generator **reproduced the endpoint we handed
   >   it**. It is a statement about the generator's fidelity.
   > - Argmax-of-distance-from-rest measures whether the **sequence travels**. It is a
   >   statement about the animation.
   >
   > A run can land on its pinned pose byte-for-byte while the path to it plateaus early and
   > wobbles, and that is exactly what shipped. Read the pinned Ferryman's
   > distance-from-target sequence, recorded in this document as a success:
   > `43.0 40.7 35.7 29.8 25.6 19.5 2.1 10.8 0.0` — it effectively **arrives at frame 6**
   > (2.1% away), backs off to 10.8%, then snaps to 0.0%. Frames 7 and 8 are a wobble around
   > an endpoint already reached, not two more frames of a motion. The `2.1` is the tell.
   >
   > The "1-point gap is an intermediate frame wandering" reading is also wrong on its own
   > terms: `npm run windup` measures the same signature on **all three** animated strips, on
   > two independent metrics, always peaking on the penultimate frame. Systematic across
   > three sprites and two metrics is not wandering.
   >
   > **None of which means the art is bad — and this correction is not a licence to go
   > regenerate it.** The owner reviewed these wind-ups on 2026-09-10 and approved them
   > ("the wind ups look really good"). The measurement is true; the verdict is the owner's
   > and they do not hold it. `npm run windup` is a printed diagnostic for exactly this
   > reason and must not become a gate — see its header.
   >
   > Both questions have to be asked, and neither substitutes for the other. Pinning a target
   > buys control of the frame shown at the instant of the hit (consequence 2 below), which is
   > real and worth having — it just never bought the travel.
2. **The frame the player reads at the instant of the hit is fully under our control**,
   because it is a file we supply rather than something the generator invents.
3. **With a pinned ending there are TWO source sprites, and step 1 of the method below
   applies to both.** It was written when there was only ever one.

### The targets are not timid — the motion front-loads instead

Measured 2026-09-10, before spending any generation budget, to split the problem: if the
pinned target poses were themselves too close to rest, no amount of path control would help
and the answer would be authoring a more committed apex. They are not. In `windup-check.py`'s
own metric, against its own `MOVES_AT_LEAST = 0.25` bar for "this reads as a fidget":

    pinned target vs the committed idle frame 0
      ferryman   43.0%      war-queen  32.7%      tyrant  30.7%

All three clear the bar comfortably. **And the shipped strips reach that amplitude** — each
wind-up's last frame sits 43% / 33% / 32% from its own first frame, matching its target, and
lands on the pinned pose to 0.0%. So neither the target nor the endpoint is the problem.

What varies is the **distribution along the way**. The same strips, each frame's silhouette
change from the wind-up's first frame:

    ferryman   0% 11% 24% 34% 36% 40% 44% 43%
    war-queen  0%  3% 13% 20% 21% 25% 33% 33%
    tyrant     0%  6% 17% 28% 30% 31% 31% 32% 32%

The Tyrant is at 28 of its eventual 32 points by frame 3 of 8 and spends five more frames
gaining four.

> This was briefly read as the explanation for the owner's "halfway done" report. **It was
> not.** See "What 'halfway done' actually meant" below: the report was about a missing
> strike animation, not about these frames, and the owner has since approved the wind-ups
> as they stand. These numbers are a pacing diagnostic for *new* art, nothing more.

### The generator arrives two frames early, reliably

Distance to the pinned target, per frame, across every pinned run kept in `art/anim/raw/`:

    ferryman        43.0 40.6 35.7 29.8 25.5 19.2  2.0 10.5 0.0
    ferryman probe  43.0 40.7 35.7 29.8 25.6 19.5  2.1 10.8 0.0
    ferryman seedB  43.0 43.4 38.2 31.1 23.0 12.0  3.5  8.8 0.0
    war-queen       32.7 33.9 27.7 23.7 21.8 16.3  0.7  6.8 0.0
    minotaur        39.9 38.4 28.7 21.9 17.4 13.0  0.0  6.3 0.1
    tyrant seedB    31.6 27.7 18.6 10.0  5.6  5.1  3.5  3.8 0.1

Four of the five follow one signature exactly: gradual for five steps, then a single step
that closes 26–48% of the entire distance and lands **within 0–3.5% of the target at frame
6 of 8**, then a retreat of 6–9 points at frame 7, then frame 8 — which is our own pinned
file, so it is exact by construction. **The generated motion is over at frame 6.** Frames 7
and 8 are a wobble and a supplied endpoint.

Two consequences that are easy to get wrong:

- **`drop=` treats the symptom.** Dropping the retreating frame is right, but the retreat is
  not the disease — arriving early is. The Ferryman ships with its retreat dropped and still
  peaks on its penultimate frame, which is why `npm run windup` is red on it.
- **This does NOT argue for buying more frames.** The loiter-then-snap pattern is real, but
  the snap lands *at* the target with frames to spare, so more frames extend the loiter or
  the wobble, not the arc — unless the arrival point itself moves. The one natural experiment
  available went the wrong way: the Tyrant has the most cast frames and stalls hardest, and
  its own failure is a different one (it closes 82% of the distance by frame 4 and then
  crawls). Do not buy frames on this theory without a run that tests it directly.

> Do not blend these two tables. Distance-to-target and distance-from-rest are different
> measurements, and per the section below, silhouette distance has no usable triangle
> geometry — you cannot infer one from the other by arithmetic, and a number that looks
> derived that way is not.

### What "halfway done" actually meant — and the cost of assuming

The owner's first report on the shipped wind-ups was that they looked "incomplete... the
animation seems to be like halfway done". That was read as a complaint about the FRAMES, and
a good deal of measurement followed from it: the travel gate, the timidity test, the plan to
regenerate. All of the measurement is sound and is kept above. **The reading was wrong.**

The clarification, 2026-09-10:

> "the windups last frame stops right before the attack. it looks good, my comment was that
> i was expecting an attack but it seems like that wasnt the intention here. **the wind ups
> look really good.** thats what i mean by 'halfway'."

"Halfway" meant the animation stops at the wind-up and **no attack follows** — a MISSING
animation, not a broken one. The boss coils, the shape resolves, and the sprite snaps
straight back to idle with no release and no follow-through. The wind-ups themselves are
approved.

Three things worth keeping from how this went wrong:

- **A measurement can be correct and its verdict still not be yours to make.** The strips
  genuinely do arrive early and retreat on the penultimate frame; two independent metrics and
  a set of controls say so. None of that entitles anyone to call the art defective. The gate
  built on it was demoted to a printed diagnostic the same day — see `tools/windup.ts`.
- **A vivid phrase from a report is not a specification.** "Halfway done" was concrete enough
  to feel like a diagnosis and vague enough to fit a theory that was already forming. The
  cheap move — ask what it referred to — was skipped because the numbers seemed to confirm it.
- **The generation budget was never spent**, because the plan was to check the seam and the
  approach before generating. That is the only reason this cost measurement rather than art.

The actual gap is a `strike` tag: the release the wind-up is promising.

### The obvious instrument is wrong: straightness does not work on sprites

Anyone measuring "does this animation go somewhere" reaches for **straightness** — net
displacement over path length. It is the textbook number, it reads beautifully on paper, and
on these sprites it is worthless. This is recorded because the failure generalises to
anything anyone measures on sprite frames in future, not just to wind-ups.

Calibrated against controls (2026-09-10), on the committed strips:

    boss.exiled-tyrant, silhouette metric
      its own IDLE LOOP        0.725     <- a closed cycle. Must score ~0. Scored highest.
      real wind-up             0.554
      synthetic pure translate 0.740
    boss.ferryman, appearance metric
      its own idle loop        0.306
      real wind-up             0.297
      synthetic pure translate 0.348     <- an unambiguous single motion, barely above a loop

A boss's own idle loop — a cycle that by construction returns to where it started — outscored
every real wind-up, while a synthetic pure translation, the least ambiguous "one motion"
there is, scored barely above noise. An instrument that ranks a closed loop above a straight
line is not measuring travel.

**The reason: pixel difference is not a metric space with usable triangle geometry.** Once
two frames stop overlapping much, their distance saturates at "both silhouettes added
together" regardless of how they are arranged, so every path looks equally straight. Any
statistic that reasons about distances *between interior frames* — straightness, apex ratios,
triangle inequalities — inherits that and reports plausible nonsense.

Two corollaries worth carrying:

- **Only the ordering survives**, which is why `npm run windup` asserts a rank statistic
  (`argmax == last`) and nothing else. A rank statistic also has no threshold in it, so it
  cannot be quietly softened to let art through.
- **An apex ratio inverts the ranking.** "Is the apex far from the midpoint" rewards exactly
  the pathology it is meant to catch: a strip that plateaus early has its midpoint frame
  already sitting on the final pose, which makes the ratio large. Measured that way the
  Exiled Tyrant ranked best of the three; measured by how much travel is left for the second
  half, it is the **worst** (0.95 of its travel done by halfway, against 0.62 for the War
  Queen). The Tyrant is also the one with nine wind-up frames instead of eight — so **more
  frames did not buy an arc**, and buying frames on that theory would have been wasted.

Also dead, for a simpler reason: a **thresholded changed-pixel count** saturates outright. It
read 99.9% of the Ferryman's opaque pixels "changed" by frame 10 and could not measure travel
past it at all. `npm run windup` uses two non-count metrics instead — silhouette XOR for pose,
alpha-weighted magnitude for appearance — and asserts on both.

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

## A sprite whose accent is too small to survive generation

`boss.labyrinth-minotaur` is deliberately **not** animated. Its accent is one `#b577eb` pixel
per eye and the two are eleven pixels apart, so neither eye has any redundancy at all; see
step 1 above for the measurement across four bosses, and "Known open ends" for the exact
number the owner has to approve. Leaving it static is a **hold, not a regression** — an
un-animated boss is what ships today, and `npm run chroma` catching this is the gate doing
its job rather than an obstacle to route around.

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
