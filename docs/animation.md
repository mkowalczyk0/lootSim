# Sprite animation

The design record for the animation subsystem. `src/render/anim.ts` is the whole of the
logic, `src/render/atlas/manifest.ts` holds the tables, and `npm run anim`
(`tools/anim.ts`, in the `npm test` chain) is the gate.

**The method below is proven end to end and three raid bosses are animated through it** —
`boss.ferryman`, `boss.war-queen` and `boss.exiled-tyrant` each carry an `idle`, a `cast`
wind-up and a `strike` release. Everything after the method is either the architecture it
runs on or the record of what each step cost to find; **the failures are kept because every
one of them is a generation the next person does not have to spend.**

**Only one of the three releases is a blow.** `boss.ferryman`'s is (see "The blow: where
the third pose has to be"); `boss.war-queen`'s and `boss.exiled-tyrant`'s are still rises,
and their manifest rows say so. Do not read the tag name as a promise on the other two.

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
intermittent (the same payload that failed once went through unchanged on a retry).
**Do not hand-roll a smaller encoding to dodge that** — "Step 2 is not advice" below is
what it cost: 26% of the sprite silently deleted, past an assertion written to catch it.

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
pinned runs (see "The penultimate frame backs off, systematically"). It prints the `ATLAS` row, and when the frame
height moves it prints `worldScale` **unchanged** plus a re-derived `feet`, with the
reasoning inline — the two traps in "Headroom is cheap" now live in the script rather
than in whoever remembers this document. It also bottom-anchors frames of differing
height, padding the short ones at the top, so a tag generated on a taller canvas can
share a strip with an idle that was not.

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

### An instrument can be right and still answer the wrong question

`npm run windup` reports the War Queen's `strike` as **the best-travelling animation in the
repo** — the only tag whose travel peaks on its last frame, where all three wind-ups peak on
the penultimate one and retreat. That is true. The tag is also **not a strike**: it is the
boss un-coiling and settling back to rest.

The metric measures whether a pose MOVES. It cannot tell "unwinds to rest" from "strikes and
recovers", because both travel monotonically from the apex to somewhere else. Nothing about
the instrument is broken — it is calibrated, it has a positive and a negative control, and
three of its rules were falsified by injection. It is answering a question nobody asked.

    strike f13 -> nearest wind-up frame is cast f12
    strike f14 -> cast f10
    strike f15 -> cast f5
    strike f16, f17, f18 -> cast f5

The nearest wind-up frame walks back DOWN the wind-up, and no release frame ever leaves the
wind-up's own path by more than 17% of its span. That measurement had to be *asked for*; the
travel number could not volunteer it.

**It was caught by rendering a contact sheet and looking at it.** That is the transferable
part. This document already carries a family of findings about instruments that report
plausible numbers while blind — a saturating pixel count, a straightness metric that ranked a
closed loop above a straight line, a check overruled by prose. This one is the sharpest
version: green numbers, correct method, wrong question. **Look at the art.**

The structural reason the art came out this way is worth keeping too, because it kills a
whole family of attempts: **interpolation between two endpoints can only produce poses
BETWEEN them.** A strike's defining pose is the extension PAST the apex, away from both ends,
so no two-point generation can ever contain it however the prompt is worded or how many
frames it is given. A real blow needs a third, authored pose: apex -> impact -> rest.

### Headroom is cheap: padding the canvas does not move the character

**Recorded because the opposite was asserted first, by me, and it nearly priced a design
decision out of reach.** The claim was that giving a boss room to swing into means a taller
frame, which means `worldScale` changes, which means every telegraph radius and camera frame
tuned against it moves too. That is wrong twice.

First, **nothing outside `render/` reads `worldScale` at all.** Every consumer is in
`draw.ts`, `spriteart.ts` or `hub.ts`. Telegraph radii and arena sizing are world-unit
numbers in `data/bosses.ts` and have no relationship to it.

Second, the draw is anchored bottom-centre — `drawImage(canvas, -w/2, -h + h*feet, w, h)` —
so padding the canvas at the TOP with `worldScale` left alone moves nothing. Measured on
`boss.war-queen`, +24px of top padding, `worldScale` kept at 1.0185 and `feet` re-derived:

    char_top     -106.6981  ->  -106.6981   (0.000000)
    char_bottom     3.2999  ->     3.2999   (0.000000)
    char_h        109.9980  ->   109.9980   (0.000000)
    char_w         99.8130  ->    99.8130   (0.000000)

Exactly unchanged. What grows is transparent headroom above the character — 21.1 world units
of room for a weapon to swing into. `npm run anim`, `npm run chroma` and `npm run smoke` all
pass on the padded strip.

Two things you MUST do, and the second is a live trap:

- **Re-derive `feet`** as `feet * h_old / h_new`. It is a fraction of `h`, so padding changes
  what it means; left at 0.03 the character sinks 0.73 world units into the floor.
- **Do NOT paste `strip.py`'s printed `worldScale`.** It computes `targetWorldHeight / h` on
  the assumption that the character fills the canvas. On a padded canvas that assumption is
  false and its number shrinks the character by 18%. Keep the existing `worldScale`.

So "the blow needs to reach" costs a re-export, a manifest `h` and a re-derived `feet`. It is
not the expensive change it was first described as.

### The padded release: what the headroom actually bought

`boss.war-queen` is the first sprite with a padded canvas — `h` 108 -> 131 against a
108px character — and the first with a release that goes somewhere instead of walking
back down the wind-up. Read this before padding a second boss, because most of it is
about what did NOT work.

**Name the thing honestly: the shipped tag is a rise-and-open, not a blow.** She uncoils
upward, throws her arms out, the plume comes up, and she settles square. For a boss whose
whole kit is `crescendo`/`volley`/`starLance`/`meteor` — things that arrive from the sky
rather than things she swings — a commanding gesture is the right release. It is still not
the punch the word "strike" implies, and nobody should read the tag name as a promise.

**The canvas was never the limit.** Padding works: the generator does reach into
transparent headroom, up to 17 of 24px. What it spends the room on is set entirely by the
prompt, and the two outcomes are very different:

    prompt                                          pad used   result
    "torso leaning back, arms outward"                 11px    ON-MODEL, but the room went
                                                               to the PLUME standing up
    "both fists above the helmet, elbows straight"     17px    real overhead arms, and
                                                               OFF-MODEL: forearms read as
                                                               detached tubes, plume shrunk
                                                               to a nub, lion face flattened

So the limit is the sprite's detail budget, not the frame. A big limb extension on a
98x108 sprite this detailed comes back as tubes. **A real blow for this boss needs a
hand-authored pose**, and that is an art task rather than a generation.

**A pinned segment can overshoot BOTH its endpoints, and this document said it could
not.** The claim above — "interpolation between two endpoints can only produce poses
BETWEEN them" — is true of the *pose* and false of a *feature's scale*. The impact->rest
segment is pinned at both ends, lands on rest to 2 silhouette pixels, and descends
monotonically; and its middle frames grow the plume far taller than either endpoint,
right to the top of the canvas. That overshoot, not the pose, is why the trim came out at
`h` 131 instead of the ~116 the raised arms actually needed. Budget padding for what the
generator will do between your keyframes, not just for the keyframes.

Worth recording on its own: that segment had **no penultimate-frame retreat** — the first
pinned run in this repo that lands clean, against four of five before it. Distance to the
pinned ending ran 33.4 30.1 25.0 16.6 10.1 7.6 0.0. So the retreat is common, not
inevitable, and `:drop=` should be applied after measuring rather than by reflex.

### Step 2 is not advice: what going around `pixellab-upload.py` costs

**Four generations were spent animating a sprite with a quarter of its pixels missing,
and the assertion that was supposed to prevent exactly that passed.**

The upload payload for a padded frame is ~5,050 base64 chars and one call had been
rejected as truncated, so the encoding was hand-rolled smaller: quantize to 64 colours,
mark the transparent corner's palette index as the transparency index. It was checked —
every opaque pixel's RGB compared equal to the original, and the check passed.

It was blind. The sprite's outline, its black wings and its cape are near-black, they
quantized onto the *same palette index* as the transparent corner, and **1,490 of 5,732
opaque pixels — 26% — silently became transparent.** The assertion compared the colour of
pixels that were still opaque and never asked whether a pixel had *stopped* being one.

> **An assertion about pixel colour is not an assertion about pixel presence.** That is
> the transferable half, and it belongs with the saturating pixel count and the
> straightness metric in this document's collection of instruments that ran, passed, and
> measured the wrong quantity. Whenever a check compares two images, ask what it does when
> a pixel is *absent* from one of them, because that is usually the failure being checked
> for and it is usually the case the comparison skips.

`art/pixellab-upload.py` gets this right and is now verified in both directions — 0 opaque
pixels lost, 0 transparent pixels gained, 0 recoloured. Use it. The truncation it warns
about is intermittent: the same size that failed once went through on a retry.

**The free canary that would have caught it in one line.** `animate_image` returns index 0
as your input **byte-identical** — confirmed on three separate clean runs. So after any
run, `assert frames[0] == input`. On the damaged runs frame 0 came back with 8,696 pixels
and 1,328 silhouette pixels different, which is what a corrupted upload looks like from
the outside. That signal was initially misread here as "the generator re-renders its
input"; it does not, and a one-line check turns the whole failure mode into an immediate,
loud error instead of four wasted generations and a wrong conclusion about the tool.

### The 1-generation pose route, and why it still does not work here

This document names `create_character_state` as the paid alternative for a posed variant,
at 20-40 generations. There is a **1-generation** route it does not mention, and the
reason to write it down is that it is cheap enough to try and fails for a reason worth
knowing.

All four raid bosses exist as PixelLab characters (8dir, 112x112), and
`animate_character(template_animation_id=..., directions=["south"])` costs **1 generation
per direction**. The templates include real keyframed strikes — `cross-punch`,
`surprise-uppercut`, `throw-object`, `fireball` — which is exactly the "third authored
pose" a blow needs, and keyframes are not interpolation so they contain the extension past
the apex by construction.

The committed sprite really is that character: `boss.war-queen`'s idle is the south
rotation cropped to its content box (7,2,105,110) = 98x108, differing only by 47
silhouette pixels of finish pass.

**And the template output is still unusable, because it is a whole-character re-render.**
`throw-object` came back 83-90px wide against the idle's 98, with different wings, a
different cape and shifting feet — and its own frame 0 already differs from the rotation
it started from, which is the tell. Splicing one of those frames into the committed strip
would pop. Two generations, and the answer is no.

`pro` mode (20-40/direction) is not the fix either, and this is arithmetic rather than
taste: its stated advantage is *cross-direction reference*, and a single-direction job has
no completed sides to reference, so the mechanism that would make it better is inactive.
It would be another re-render at twenty times the price.

### The Ferryman and the Tyrant rise too — and what the second and third boss cost

Both shipped the same shape as `boss.war-queen`: a padded canvas, and a `strike` that is a
**rise, not a blow**. The Ferryman raises his pole to full height; the Tyrant lifts the
sword overhead and spreads its wings. Neither is a punch, and the manifest says so.

Worth stating plainly because this document said it could not be done: **"a pole raised
overhead has nowhere to go" is now false.** It was true of a canvas the character fills. It
is what the padding was for, and the Ferryman's pole is the clearest demonstration in the
repo — it rises 23px into 24px of headroom.

Costs: 2 generations per free-form harvest, 1-2 per pinned segment. The Ferryman needed two
pinned segments (see the accent note below); the Tyrant needed one free-form rise and one
pinned settle. Neither needed a re-roll.

#### Pinning both lit endpoints rescues a two-pixel accent — mostly

The Ferryman's accent is two pixels of `#7dd3fc`, and a **free-form** run destroys it: of
eight frames, two had *no cold pixel anywhere on the sprite*, not a dimmed one. So its rise
was regenerated as two **pinned** segments with both endpoints lit, which is what this
document already recommends. That fixed most of it and not all of it:

    free-form rise      2 of 8 frames lost the accent entirely
    pinned rise         0 of 6 lost it   (three drifted to a neighbouring cold shade,
                                          40.4-47.1 chroma — still well over the bar)
    pinned settle       1 of 6 split, 1 of 6 gone

**So pinning is a strong mitigation, not a guarantee.** Budget for losing a frame or two of
a small-accent animation even when you do everything right.

The bar is not a constant: `npm run chroma` requires each frame's loudest 2+px colour to
beat **the hero's own max accent chroma, 35.3**. A frame whose eye drifts to a neighbouring
cold shade passes; a frame whose loudest survivor is the robe's olive (25.1-27.8) does not.

#### `art/anim/repair-split-accent.py`, and the one frame it refuses

The two failing settle frames failed *differently*, and only one was repairable:

- One had the documented **split**: a single pixel of the exact accent plus a neighbour one
  shade off. Both look right; neither covers two pixels. Re-fusing the neighbour fixes it.
- One had **no blue pixel above the robe's own dark grey at all**. Nothing to locate.

`repair-split-accent.py` handles the first and **refuses** the second, loudly. It is the
intermediate-frame counterpart to `target-accent.py`: that script fixes a *pinned endpoint*,
whose eye is at a coordinate we chose, and this one must **find** the eye, because an
intermediate frame is genuinely generated and a hardcoded coordinate is wrong the moment
anything is re-rolled. The unrepairable frame was dropped from the strip. Do not give the
script a fallback coordinate — being refused is the correct outcome.

#### Two measurement traps, both of which nearly cost a good animation

**A thin feature's motion is under-reported by silhouette XOR over body area.** The Tyrant's
sword goes from held-low to raised overhead — the most dramatic pose change of the three
bosses — and scores **8-12%**, under `windup-check.py`'s 25% "this reads as a fidget" bar.
Nothing is wrong with the metric: a sword is a few hundred pixels against a large winged
body, so the ratio is small however far it travels. Applying that bar here would have
rejected the best rise of the set. The bar is calibrated for whole-body motion; a
long thin held object is outside what it can see. Look at the frames.

**Judge a seam against the animation's own steps, not against zero.** The `cast` -> `strike`
hand-off measured 458 (Ferryman) and 522 (Tyrant) silhouette pixels, which looked like a
visible pop, and by eye on a contact sheet it looked like one too. Measured against the
consecutive-frame steps *inside* those same animations — 518-930 in the wind-ups, 274-1801
in the releases — both seams are **smaller than ordinary motion**. There is no pop; there is
a boss moving. An absolute pixel count cannot tell those apart and a comparison can.

#### The last frame of a release should be the committed rest, exactly

A pinned settle lands *near* its target, not always on it: the Tyrant's finished 76
silhouette pixels away. Since the pin target was the idle frame in the first place, use the
committed file as the final strike frame instead of the generated approximation. It costs
nothing, and it makes the hand-off back to the idle loop **byte-identical** rather than
merely close — measured 0 differing pixels on both bosses. The generated near-miss frame is
just dropped.

#### The generator sometimes erodes thin features on the returned frame 0

The input-integrity canary (`frames[0] == input`) fired on the Tyrant, and it was **not** a
corrupted upload: the encoder round-tripped that exact file losslessly. The generator
returned frame 0 with 277 opaque pixels missing, all at the outer wing tips, **nothing
gained and nothing recoloured**.

That signature is worth learning, because it distinguishes the two failures the canary
catches:

    corrupted upload    large loss AND thousands of recoloured pixels  (my quantizer bug)
    thin-feature erosion  small loss, 0 gained, 0 recoloured           (the Tyrant's wings)

The first means stop and fix the encoding. The second is the generator trimming 1-2px off
an extremity, is consistent across that run's own frames, and shows up only at the one
frame boundary where generated art meets committed art. On the Tyrant it was judged
acceptable and shipped; it is the reason its seam is 522 rather than nearer zero.

### The blow: where the third pose has to be

`boss.ferryman` is the first release in this repo that is **a blow rather than a rise**
(2026-09-10), and it cost 7 generations. The structure this document predicted — apex ->
impact -> rest, with a third authored pose — is correct and is what shipped. What it did
*not* predict is the part that actually decided the animation, so that is what this
section is for.

**The owner raised this three times and it was misread twice.** The wind-ups are approved
art; the gap was never in them. Do not re-measure or regenerate a wind-up on the strength
of a "halfway" report — read the docket entry first.

#### The impact pose must be far from REST, not merely far from the apex

The obvious impact pose for a boss holding a pole is "slam it into the ground". On this
sprite that is a trap, and the reason generalises: **the Ferryman rests with his pole
already butt-down on the ground.** So the terminal pose of a ground slam is nearly the
rest pose, and an animation that ends on a rest-shaped pose is an unwind no matter how
the motion is prompted, how many frames it gets, or what the tag is called. That is the
mechanical reason the old release read as a settle — not a bad generation, a bad
*destination*.

So the pose was differentiated on **body** instead of on weapon height: braced low
stance, pole swept diagonally across the body, mantle flared. The check that this is a
strike at all is a comparison against a fixed reference the pose cannot move:

    apex   vs rest   2306 silhouette px
    impact vs rest   2378 silhouette px      <- further from rest than the apex is

**A candidate impact pose closer to rest than the apex is cannot read as a strike.** That
is one line of measurement, it is cheap, and it is the thing to re-run if any of this is
regenerated. Note it is a *comparison*, not a threshold — the same discipline the
CLAUDE.md campaign note argues for, and the reason it survives a re-roll that moves every
absolute number.

#### The generator will not give you a mid-downswing frame, and that is not a sampling error

Two independent pinned runs between the same endpoints (6 frames seed 11, 4 frames seed
29) both put nearly all the travel in the **last step**. The 4-frame run's single mid
frame drops the pole out of the silhouette altogether — which reads as the weapon
vanishing, not as a smear. So the downswing really is one fast step; do not spend
generations trying to sample it more finely, and do not read the hard cut at impact as a
defect. It is what sells the hit.

#### Silhouette XOR cannot see a rotation

The shipped sweep's distance-to-target runs **1856 -> 1804 -> 0** — not monotonic, and by
the numbers it looks like the animation wanders. It does not. A pole swinging through an
arc keeps a roughly constant silhouette area while its *angle* changes, and XOR has no
access to angle. The motion is monotonic in the two quantities that describe it — pole
angle, and content top: **3 -> 4 -> 24 -> 35 px**.

This is the same family as the caution above about `npm run windup` ranking a settle as
the best-travelling animation in the repo, and the same answer applies: the instrument is
fine and it is answering a question nobody asked. **Look at the frames.** Judging a
pinned *wind-up* by monotonic approach is right; judging a *swing* by it is not.

#### `repair-split-accent.py` refusing is the system working

Of the sweep's generated frames, two were dropped on accent and only one of them was ever
repairable:

    lost the eye entirely            unrepairable, dropped (already documented)
    ONE PIXEL PER EYE, both drifted  repair-split-accent.py REFUSES — and is right

The second is worth naming because it is the case most likely to be argued with: the eyes
are clearly located, one shade off, and painting them would have passed the gate. It was
also the only frame in either generation sitting mid-downswing, so the incentive to force
it in was maximal. The script's own words are the ruling — a one-pixel accent is not a
split one, and widening it is a change to shipped art that wants the owner, the same
ruling `art/bosses/minotaur-accent.py` is parked under. **A refusal that costs you
something is still a refusal; that is when it is load-bearing rather than decorative.**

#### What it cost, and what it did not

7 generations: 2 harvest (one usable, one rejected off-model), 1 rejected re-roll of the
sweep, 1 sweep, 1 recovery, plus the harvest's second seed. **No canvas change at all** —
`w`, `h`, `worldScale` and `feet` are all untouched, because the blow travels *down* into
a canvas that was already padded for the rise. The strip grew by one frame (24 -> 25
cols). The rise frames and the whole `cast` are byte-identical to what shipped.

### Coverage: which bosses are animated at all, and what "not coming through" meant

**Measured 2026-09-10**, tool `npm run animcoverage` (`tools/animcoverage.ts`, a printed
diagnostic and deliberately not a gate, for the same reason `npm run windup` is not one).

The owner reported *"some boss animations are not coming through"* while playing. That
sentence has three causes and **only one of them is a bug**, which is why this was
diagnosed before a single frame was generated:

1. the boss has no `strike` art yet — the backlog, not a bug
2. the boss is deliberately unanimated — a ruling, not a bug
3. the art exists and does not reach the screen — **the only bug, and nobody had looked**

**Cause 3 does not exist. The answer is cause 1, and the shape of it is the finding.**
As first measured, before `boss.warden` was animated:

    3 of 35 encounters resolve to an animated sprite.
    The other 32 draw a single static frame — wind-up and release alike.
    Every animated sprite belonged to a RAID, reached only from the War Table.
    Every boss on the Delve, the Tower and the Proving was static.

**Animating one sprite — `boss.warden` — moved that to 10 of 35**, because the Proving
borrows the Delve templates and six class Provings borrow this one. That leverage is the
whole argument for animating the shallow Delve bosses before anything else:

    Delve     1 of  5 animated
    Proving   6 of 21 animated
    Tower     0 of  5 animated   <- no animated boss on this ladder
    raid      3 of  4 animated

**Do not read those four lines as fixed.** They are printed by `npm run animcoverage`,
derived per run — see "the sentence that became a lie" below.

`boss.ferryman`, `boss.war-queen` and `boss.exiled-tyrant` are the three, and each is used
by exactly one raid encounter. The five hand-authored Delve bosses (Warden, Corrupted
Saint, Gravebound Colossus, Herald of the Unspoken, Nameless), all five Tower bosses and
the Minotaur are static — and the Proving borrows the Delve templates, so all 21 class
Provings are static too.

So a player climbing the two ladders the game is actually built around **has never seen a
boss animation**. That is the whole report, and it is not a defect in anything shipped.

**The prioritisation consequence is worth stating because it is counter-intuitive:** the
next blow authored has more reach on a *Delve* boss than on the second and third raid
bosses. Animating the Nameless alone covers depth 25+ on the Delve *and* every Proving
that borrows it. This is a call for the owner, not a session, but the numbers should be in
front of whoever makes it.

#### The one real defect found, and it is mild

`cast` beats `strike` unconditionally and on purpose, so a release only reaches the player
if the post-cast gap is at least as long as the release. That gap is not a constant:

    actionTimer = BOSS_ACTION_GAP * phase.haste * profile.aggression
                  * buffHasteMult * crescendoHaste * raidThreatRate(players)

`aggression` alone falls from 1.0 to a floor of 0.4 as you descend. Measured on the floors
raids **actually** run on, solo (raids are solo in v1):

    boss.ferryman        strike 0.60s   tier 1 full · tier 4 full · tier 8 cut at 93%
    boss.war-queen       strike 0.60s   tier 1 full · tier 4 100%  · tier 8 cut at 80%
    boss.exiled-tyrant   strike 0.50s   tier 1 full · tier 4 90%   · tier 8 cut at 74%

So the tail of the recovery is trimmed at high tiers and nothing else. Not worth a fix,
and **not** the owner's report. Recorded because the reasoning that shipped with it was
subtly wrong: the manifest says the strike is "inside `BOSS_ACTION_GAP` (1.85s) at ordinary
aggression", and 1.85s is the value at depth 1 only. That is the *"a constant that was
correct for one rung"* shape CLAUDE.md already names three times (the atlas scale, the
biome tint, the snapshot size); add the boss action gap to that list.

**THE RULE, for anyone authoring a release: check its length against the depth table
above, not against `BOSS_ACTION_GAP`.** The constant is 1.85s; the number that actually
governs whether your animation reaches the player is

    BOSS_ACTION_GAP * phase.haste * profile.aggression * buffHasteMult
      * crescendoHaste * raidThreatRate(players)

and on a deep floor that is a third of the constant. `npm run animcoverage` prints it per
encounter. Two consequences worth knowing before you start rather than after:

- **A shallow boss has far more room than a deep one.** `boss.warden` is the depth-5
  encounter and its fastest phase leaves **1.10-1.18s** between casts at depths 5-9 —
  nearly double the Ferryman's 0.60s release. A Delve boss near the top of the ladder can
  afford a longer, more legible blow than a raid boss can.
- **Measure it for the encounter you are animating.** The gap depends on that spec's
  fastest `phase.haste`, which ranges from 1.0 down to 0.5 across the roster, so two
  bosses at the same depth do not get the same budget.

#### A methodological note, because the first run of this tool was wrong

The first version measured raid bosses at Delve depths 5/15/30/45 and at 1 *and* 4 players,
and reported cuts down to **28%** — alarming, and an artifact. Raids set their own depth
(`baseDepth + depthPerTier * (tier - 1)`) and are solo in v1, so those rows described
floors that do not exist and a party that cannot be assembled. Measuring each encounter on
the floor it actually runs on moved the worst case from 28% to 74%.

**A proxy for the thing under test is not the thing under test**, and the failure mode is
the usual one: it ran, it produced confident numbers, and nothing was red. Same family as
the boss-floor A/B that never reached phase two.

#### And the question that turned out to have no bug in it

Section 4 of the tool checks whether a wind-up can be too short to play. It cannot, and
the reason is structural rather than lucky: `cast` is **progress-keyed**
(`frameAtProgress`), so the window's length changes the frame *rate* and never the
coverage. The shortest window available is `MIN_CAST` (0.45s), which is 50-56 ms/frame
across the three animated bosses. The section exists so that claim is measured rather than
asserted.

### The Warden, and what a 4-pixel accent actually needs

`boss.warden` is the **first boss on either ladder** to be animated (2026-09-10) — every
sprite animated before it was a raid. It shipped as **stage one of two**: `idle` + `cast`,
no `strike` yet, on the ruling that a boss which winds up beats a boss that does nothing
and that the fallback ladder makes "animated but no release" a supported state rather than
a backlog entry.

It cost **3 generations** (idle, harvest, pinned wind-up) and no re-rolls.

#### Redundancy is not the whole rule: headroom is the other half

This document said a thin accent dies under generation, and pointed at
`boss.labyrinth-minotaur` — 4 px, one per eye — as the permanent hold. The Warden's accent
is **also 4 px** (`#33ffb8`, two 2-px eyes, painted on by `art/bosses/warden-accent.py`),
so by pixel count alone it should have been the second permanent hold.

It survives generation completely: **80.0-90.2 chroma in every frame of every run**, and it
needed no `target-accent.py` rescue at all. The distinction is chroma headroom over the
hero's 35.3 bar:

    boss.labyrinth-minotaur   45.5  ->  1.3x headroom  ->  dies (27.8 in 4 of 5 frames)
    boss.warden               80.0  ->  2.3x headroom  ->  holds (80.0-90.2, every frame)

Both drift by a similar *proportion*; only one of them has room to. So the rule is not
"thin accents fail" but **"thin accents fail when they are also dim"** — two variables, not
one, and the pixel count is the cheaper but weaker predictor.

This was treated as a hypothesis, not a rule: the idle was generated FIRST as a one-generation
probe of exactly this question, before spending anything on the wind-up. If it had come back
dim, the Warden would have joined the Minotaur for a stated reason instead of a guessed one.
**Do that probe before animating any sprite whose accent is under ~6 px** — it is one
generation against a whole boss's worth.

It does not rehabilitate the Minotaur, whose measured problem was never pixel count alone.

#### A pinned wind-up can overshoot its own target, and the fix is to choose, not re-roll

The pinned run (rest -> apex, 8 frames) landed its pin cleanly — 7 opaque pixels off, canary
0/0/0 — but the *motion* was wrong: distance-to-target ran 1022, 1003, 999, 651, 798, 941,
1002, 924, 7. The generator raised the sword ABOVE the pinned apex around f4-f5 and settled
back onto it. A wind-up that peaks in the middle and retreats is exactly what
`windup-check.py` exists to reject.

The cheap fix is not another generation. **The run's own f0-f5 is a clean monotonic build**
— travel 279, 519, 861, 1342, 1485 — and its f5 is the true extreme, higher than the pose
that was pinned. So the tag is that subsequence and the drift frames are dropped, and f5
becomes the apex the blow will start from in stage two.

Generalising: with a pinned run you get a *trajectory*, not just an endpoint. If the
trajectory overshoots, the extreme it reached is usually a better target than the one you
supplied — take it, rather than paying to generate the same motion again.

#### The generator returns dirty transparency, and it broke two tools quietly

The Warden's frames are the first in this repo to come back with **transparent pixels
carrying stale non-zero RGB** — 2,323 per frame. Invisible (alpha is 0), and every
generation before this one came back clean, which is why it had never been seen. It broke
two things in opposite directions:

- **`art/pixellab-upload.py` refused perfectly good art.** Its round-trip assertion compared
  whole RGBA tuples, and the tight-palette conversion necessarily zeroes RGB under
  transparency, so it reported "round trip changed pixels — refusing to send altered art"
  about a change that cannot be seen. Fixed by normalising alpha-0 pixels to `(0,0,0,0)`
  *before* the comparison, which keeps the assertion strict rather than loosening it.
- **The canary read as a catastrophic failure.** `frames[0] == input` came back with 2,323
  differing pixels, which by this document's own table looks like a corrupted upload. It was
  not: opaque **lost 0, gained 0, recoloured 0**. So the canary must compare *opaque* pixels,
  not raw tuples — the exact inverse of the lesson already recorded here, that an assertion
  about pixel colour is not an assertion about pixel presence. Both halves matter: presence,
  and colour *where it is visible*.

`art/anim/strip.py` was already correct — its `alpha_box` reads the alpha channel precisely
because `getbbox()` would be fooled — and this is that documented latent hazard going live
for the first time. It now also **scrubs** the RGB as it loads, so the committed strip is
canonical and a future reader reaching for `getbbox()` is not silently handed the whole
canvas.

#### The sentence that became a lie

`tools/animcoverage.ts` originally printed, as fixed prose, *"every animated one is a RAID …
every boss on the Delve, the Tower and the Proving is static."* True the hour it was written.
**Animating the Warden made it false, and the tool went on printing it**, green, in the same
run that proved it wrong.

That is CLAUDE.md's fourth lesson exactly — a claim whose scope came from the thing under
test — and it is worth recording because the tool was written *by* the session that had just
finished writing that lesson up. The fix is to derive the breakdown per ladder from the
roster on every run, so the output cannot outlive the fact. **A diagnostic's prose is as
capable of going stale as a check's bound.**

### Stage B: the Warden's blow needs a hand-authored pose, and here is the evidence

**Not built (2026-09-10), and this is a result rather than a gap.** `docs/animation.md`
already said a real blow for `boss.war-queen` "needs a hand-authored pose, and that is an
art task rather than a generation", and the natural reading was that it was about *that*
sprite — 98x108, dense, wings and a plume. It is not. It reproduces on `boss.warden`,
which is smaller, simpler, and animated cleanly through idle and a five-frame wind-up.

Three generations, three distinct strategies, all from the same on-model apex:

    "crashing straight down ... deep forward lunge"    -> loop returned to a rest pose
    "drops into a deep kneeling lunge ... never
     straightens up"                                   -> body deformed into a squat blob
    (a quantized-source variant of the first)          -> void, see below

Every attempt that achieves the silhouette change a strike needs achieves it by
**deforming the body** — legs merging, helmet sinking into the shoulders, proportions
collapsing — rather than by posing it. So the finding is now general enough to state as a
rule: **this generator will interpolate and it will re-render, but it will not pose.** A
strike's defining moment is a pose, so it must be authored.

#### The impact-vs-rest comparison is necessary but NOT sufficient

The Ferryman section above introduces a check: an impact pose must be further from rest
than the apex is, or it cannot read as a strike. That check is right and it did its job
here — it correctly rejected the first attempt, whose "impact" measured **1001** against
rest where the apex measures 1485.

**It also passed the deformed blob, enthusiastically:**

    apex   vs rest   1485        <- the bar
    blob   vs rest   1735-1745   <- clears it comfortably
    blob   vs apex   1786-1866   <- and is monotonic all the way

Green on every axis, accent intact at 76-84 chroma, and the art is a knight melted into a
crouching lump. **A deformation scores extremely well on a distance metric, because a
deformation IS a large distance.** The comparison rules out an *unwind*; nothing about it
rules out a *deformation*, and the two failure modes sit at opposite ends of the same
number.

This belongs with the rest of this document's collection of instruments that ran, passed,
and measured the wrong quantity — and it is the sharpest one yet, because the metric was
introduced *by this same work, one boss earlier, for a good reason, and is still correct*.
Use it as a **veto, never as an acceptance**: it can tell you a candidate is definitely
wrong; it cannot tell you one is right. Look at the frames.

#### A free-form run is a LOOP, so its last frames return to its first

Worth stating plainly because it silently wasted a generation. `animate_image` without a
pinned ending produces a *loop*, so the final frames curve back toward frame 0 by
construction. The first blow harvest's last three frames measured **closer to rest than the
apex was** for exactly that reason — they were the loop closing, not the motion arriving.

**Harvest from the middle of a free-form run, not the end.** The Ferryman's usable impact
pose was f6 of 8; both of the Warden's end frames were junk. Where the extreme actually
falls is a thing to measure per run, not assume.

#### The upload bug: re-pad the canvas, do NOT quantize

`art/pixellab-upload.py` produced a payload the server would not decode — five attempts,
three distinct byte streams (compress level 9, level 6, and via a `data:` URL), each one
reporting **the exact correct byte count received** and then "broken data stream". So it is
neither truncation nor the intermittent flake this document describes, and **the advice
"retry, it is intermittent" is wrong for this case** — it costs five retries before anyone
starts thinking.

Ruled out: size (`boss.ferryman.png` uploads at 77,816 b64 chars), chunk structure, `+`/`/`
density, and dimensions (`warden-rest-pad.png` at the same 57x125 went through fine).
Not root-caused; it is content-specific and deterministic per payload.

**The workaround is to change the byte stream without touching the art: add a few
transparent rows to the top of the canvas and re-encode.** Costs nothing (the padding is
trimmed by `strip.py` anyway) and preserves every pixel.

**What NOT to do, learned the expensive way: quantizing the source.** Reducing the palette
to 24 colours produced a payload that uploaded first time — and destroyed the sprite. The
4-pixel teal accent has no weight in a median-cut palette, so it was merged away entirely;
the returned frames' loudest colour was a skin tone, two frames sat *exactly* on the hero's
35.3 bar, and the armour banded visibly.

The quantization was *verified*, and that is the point: it asserted **0 opaque pixels lost,
0 gained** — the presence check this document demands, after the incident where a
hand-rolled encoder silently deleted 26% of a sprite. It passed, and it was still the wrong
assertion. Presence was never the thing at risk this time; **colour** was.

> So the pair is now complete, and both halves have cost a session:
> an assertion about pixel **colour** is not an assertion about pixel **presence** — and an
> assertion about pixel **presence** is not an assertion about pixel **colour**. Check both,
> and on a sprite with a small accent check the accent *by name*.

#### Reach is not one-per-sprite: check the borrow graph before choosing a target

Animating `boss.warden` moved coverage 3/35 -> **10/35**, because `legendBossSpec` borrows
Delve templates and six class Provings borrow this one. The Tyrant, by contrast, would have
moved it 3 -> 4.

**So the next animation target is chosen by the borrow graph, not by depth order.** Before
picking one, run `npm run animcoverage` and read the "encounters sharing each animated
sprite" table: a template that backs many Provings is worth several that back none. The
depth at which a player meets it still matters — that is why the Warden beat the Nameless,
which is the depth-25+ boss and past the reachable band — but reach and depth are two
separate questions and both need asking.

#### A diagnostic's prose is a check's bound

`tools/animcoverage.ts` printed a fixed sentence about a countable set, that sentence went
false the same day, and the tool went on printing it in the very run that disproved it.
That is written up under the Warden above. The generalisation belongs here:

**This repo now has two tools whose entire value is their printed claims — `npm run
animcoverage` and `npm run windup` — and NEITHER is in `npm test`.** Nothing will ever go
red when one of them starts lying. A gate at least fails loudly when its bound goes stale;
a diagnostic just keeps printing.

So: **any fixed sentence about a countable set is a candidate for the same defect.** If a
tool prints "every X is Y", "only N of these", "all of them except", derive it from the
data on every run instead of writing it down. Whoever hits the third instance of this: it
is the third, not the first.

### A sprite with two accents — RESOLVED, and the resolution is stricter than what it replaced

`boss.corrupted-saint` is the second-richest sprite in the borrow graph (6 encounters, 5 of
them Provings). Its idle shipped 2026-09-10 and its wind-up was **blocked for a day by the
chroma gate, on art nothing was wrong with**. Both now ship. The episode is worth keeping
because the fix is a case study in changing a gate without weakening it.

The Saint has **two** hot accents: a gold halo (hue 40) and violet eyes (hue 277). Both are
deliberate, both are far above the hero's 35.3 bar, and neither ever goes anywhere:

    gold    63.9 - 74.9 chroma, in every frame of both tags
    violet  62.0 - 80.8 chroma, in every frame of both tags

They only **trade rank**. Gold is loudest through the idle; violet is loudest through most
of the wind-up, because the spell energy grows. The old gate derived one accent from the
strip's loudest 2+px colour and expected every frame's loudest to be that same thing, so it
read the swap as the accent having been REPLACED — a ~125 degree hue jump against a 45
degree tolerance — and failed a strip on which its own intent was perfectly satisfied.

#### What was rejected, and why it matters more than what was built

The obvious fix, written down here the day before the ruling, was: *a sprite may declare
several accents, and each frame must keep **some** declared accent above the bar.* That is
the shape to reach for and **it is weaker than the check it replaces** — it cannot tell "the
halo went out while the eyes carried the frame" from "both are fine", which is precisely the
thing a per-frame accent check exists to catch.

What shipped instead inverts it. A sprite may **declare** its accents in
`AtlasSprite.accents`; a sprite that declares nothing is a one-accent sprite and takes the
derived path unchanged; and a sprite that declares two must keep **every** declared accent
above the bar in **every** frame, independently. Three properties, in the order they matter:

1. **Declared, never inferred.** No auto-detection of how many accents a sprite appears to
   have. A derived classifier is exactly the failure CLAUDE.md's fourth lesson catalogues,
   and it has silently under-covered three times in this repo already.
2. **Declaring buys strictness.** On the Saint the new check is strictly harder than the old
   one: the derived check can only ever see whichever accent is loudest, so gold could go
   out entirely while violet carried the strip and it would never know.
3. **The replacement guard survives.** Giving up rank ordering must not give up what rank
   ordering was catching, so a declared sprite also has to keep every frame's loudest colour
   near one of its declared hues. With one declared accent that is identical to the derived
   check; with two it is the same property over a set.

#### The falsification, which is the only part of this that is evidence

Everything above is an argument, and this document already records what happens when an
argument about a gate is trusted: `windup-check.py` implemented the right property, the
Ferryman failed it, and it shipped anyway because a docstring claimed a different
measurement was "strictly stronger". It wasn't. **A written argument is not evidence.**

So the claim was injected rather than asserted. `art/anim/dim-accent.py` dims one declared
accent of one frame below the bar — violet eyes, idle frame 2, desaturated to chroma 20 with
its hue and its brightest channel preserved, while the gold halo stays bright and stays the
loudest thing in the frame. The two gates on those same bytes:

    the old gate, on the art it was green on   ok    the accent is not REPLACED in any of the 5 frames
                                               ok    the accent stays above the hero's in all 5 frames
                                               chroma gate: all checks passed

    the new gate, same injection               ok    the declared accent "gold halo" stays above the hero's
                                               FAIL  the declared accent "violet eyes" ... frame 2 is 20.0
                                                     #9279ac vs hero 35.3 — this accent is gone or dimmed
                                                     out of legibility
                                               ok    no frame's loudest colour is an UNDECLARED hue

Not one number in the old gate's output even moves, because it never asks after the second
accent at all. That gap is the coverage the declaration buys, and it is why the change is
not a waiver. The script is committed so the next person to touch this can re-run it rather
than re-read this section.

> A note on running that comparison honestly: the old gate is *already* red on the shipped
> 12-frame strip, for the rank-trade reason this whole section is about. Injecting into that
> strip and watching it fail proves nothing — it was failing anyway. The comparison has to be
> made on art the old gate was green on, which is why the injection above goes into an idle
> frame of the 5-frame strip that actually shipped.

#### Never prompt the dominant accent to pulse

The first Saint idle failed the gate too, and that one was self-inflicted: the prompt asked
for *"the golden halo pulsing gently"*, and the pulse dimmed gold below the violet on three
of five frames. Re-rolled with *"the halo stays steady, bright and undimmed throughout"*,
gold led every frame and the gate passed.

One generation, and the rule is cheap to remember:

> **On a sprite with more than one bright feature, never ask the dominant accent to pulse,
> dim or fade.**

The animation does not need it, and no gate can tell that kind of dimming from an accent
dying — the declaration does not change this, it only makes the failure name which accent
went out.

#### An open question that is the owner's, not a gate's

§1.4 says the only bright colour on a monster is the part that is looking at you, and a
whole gold halo is not that. By the letter of the style guide the Saint should arguably have
one accent rather than two. **The art is not being touched on that reading**: it is shipped,
approved, and a metric saying approved art is defective is a hypothesis until the owner's eye
agrees. Repainting it to satisfy a rule nobody raised is the pre-emptive-fix pattern. The
question is with the owner as a note, not as a blocker.

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

There is also a **1-generation** template route, and a reason it does not work here —
see "The 1-generation pose route, and why it still does not work here".

`create_character_state` is the paid alternative — all four raid bosses exist as PixelLab
characters (112x112, 8 directions), so a posed variant can be generated properly. It costs
**20-40 generations** and returns the character on its own canvas, which then has to be
re-fitted to the sprite's; reach for it only when no rejected frame will do.

### A wind-up may not extend the silhouette

> **BOUNDED 2026-09-10, not repealed.** All of this holds for a canvas the character
> fills, which is every sprite here except `boss.war-queen`. Pad the canvas and the
> generator *will* use the room — 17 of 24px, measured. What it will not do is put a
> convincing limb there: see "The padded release: what the headroom actually bought".
> The paragraph below about `worldScale` shrinking the character is also wrong as
> written, and "Headroom is cheap" corrects it — you keep `worldScale` and re-derive
> `feet`.

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
