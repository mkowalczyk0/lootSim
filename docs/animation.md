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

The same idiom `monsterSprite` already uses for `MONSTER_SETS`. The ladder takes a **chain**
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

## Known open ends

- **No art yet.** Phase 2 is the PixelLab pass, raid bosses first. Of the eight new boss
  ability tags, only `blink` and `sanctuary` were judged to want new art; the rest resolve
  through the existing telegraph pipeline and need nothing from the render side to work.
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
