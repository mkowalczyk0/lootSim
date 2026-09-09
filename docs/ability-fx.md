# Ability FX — the hitscan tracers

**Status: built and current.** `npm run abilityfx` (`tools/abilityfx.ts`, in `npm test`)
asserts the load-bearing half of this.

## 1. The docket said "missing projectile FX". That was the wrong diagnosis.

Worth recording, because the next person to hear it will go looking in the renderer and
find nothing wrong:

**Every `Projectile` in the simulation is drawn, unconditionally.** `drawProjectiles` in
`render/draw.ts` renders each one with a tapering tail, a coloured bolt and a white core,
and there are exactly four spawn sites in the whole game. There is no such thing as a
projectile with no FX.

The actual defect was **37 abilities that resolve damage across the room without ever
creating a projectile**. A skill fires, damage numbers appear on a monster forty units
away, and nothing crosses the gap. `necromancer.command_ravage` reaches 400 units,
`magician.prism_lance` and `paladin.judgement` 320, and `corsair.broadside` — an ultimate
described as *"spectral cannons run out along your flank and fire a synchronized barrage
across the battlefield"* — drew a ring at the caster's feet and nothing else.

That matters more than a cosmetic gap because this game asks the player to read what is
coming at them.

## 2. The fix is a tracer, and the reason is honesty

The obvious fix — give these abilities travelling objects — is wrong twice over.

**It would be a lie.** The damage has already resolved by the time anything could be drawn.
A visual that flies for a beat while the numbers landed a beat ago is something a player can
catch at 320 units, and the further the ability reaches the more obvious it gets.

**It would be a balance change.** A real `Projectile` has travel time, can miss, can be
dodged and is stopped by walls. Turning 37 instant abilities into travelling ones would
move every one of those numbers and break the determinism properties the smoke test holds.
That is its own pass and it is explicitly not this one.

So: **a 320-unit prism lance should not be a travelling orb in the first place. It should be
a tracer** — a beam, a lance, a jagged line that appears along its whole length in one frame
and fades. Hitscan. The damage is instant and the visual is instant, so the visual is telling
the truth, and there is nothing in flight for the player to notice.

Travelling, dodgeable, wall-stopped objects stay what they always were: the four real
`Projectile` spawn sites, which have travel time because the simulation gives them travel
time.

## 3. `Ability.fx` already existed, and was completely dead

This is what made the work cheap rather than expensive. `FxProfile` — `cast`, `travel`,
`impact`, `ground`, `trail`, `screenShake`, `hitStop`, `cameraEmphasis`, `palette` — was
declared on `Ability` from the start, and:

- **0 of 210 abilities authored one.**
- **Nothing anywhere read one.** The only other mention was a re-declaration in
  `progression/unlocks.ts`.

Somebody designed this feature, put `travel` and `impact` in its vocabulary, and never wired
it. So the fix is filling in a declared channel rather than bolting 37 `fx` effect steps onto
the ability list — and it leaves the door open for the 46 melee and self-targeted abilities to
get a `cast` flourish later through the same mechanism rather than a second one.

**`travel` is live. The rest of `FxProfile` is still declared and unread**, deliberately: an
unread field that is documented as unread is a seam, and an unread field nobody has written
down is the bug above repeating itself.

## 4. Three styles, and the difference is silhouette

`TracerStyle` in `render/fx.ts`. Colour is already carrying the element (the ability's own
damage type, not the caster's gear — the line should say what is about to hurt you), so the
styles differ in shape instead:

| Style | Shape | Used by |
| --- | --- | --- |
| `beam` | a straight, even, unbroken line | holy light and declarations — the Paladin's four, `swordsman.kings_challenge`, `reaper.soul_brand` |
| `lance` | tapers from a wide base to a point, so it reads as thrown rather than shone | thrusts, hooks and swung reach — `impaling_thrust`, `prism_lance`, `pale_hook`, `corsair.broadside` |
| `bolt` | broken into jagged segments, so it flickers out rather than crawling | curses, hexes, void and arcane — all six Warlock abilities, the Shaman's hexes, the Assassin's marks |

Jag offsets are fixed at spawn so the line does not crawl while it fades, and they are drawn
from **`fxRng`, the renderer's own generator** — never the simulation's. Every tracer lasts
0.22s: long enough to register and read as a direction, short enough that two casts never
smear into one another.

## 5. The debug-string leak, fixed on the way past

The one `fx` effect step that did exist called `emitFx(ref, x, y)`, which pushed a `cast`
event **whose label was the raw ref id** — so `{ kind: "fx", fx: "corsair.cannons" }` printed
the literal words `corsair.cannons` on screen in floating text. A placeholder that shipped,
and went unnoticed only because so little authored one.

`emitFx` now pushes its own `abilityFx` event, which draws a ring and a spray of sparks and
no text at all. `cast` still exists and still prints its label, because that one is a
*named* cast and printing the name is the point.

## 6. What the acceptance test holds

`tools/abilityfx.ts`. Two properties, and only one of them is about what you can see.

**Coverage, over the table rather than by spot check.** Every ability that reaches past
melee (`range > 90`, not self-targeted) and resolves harm with no visual step of its own
must author an `fx.travel`. All 210 abilities are walked and classified, so the next ranged
ability somebody adds fails this gate rather than silently shipping invisible. It is a
*boundary*, not a floor: a melee ability that grows a tracer fails too, because it would
draw a line across a room it never reached.

**That check earned its place within a minute of existing, and how it did is the argument
for writing this kind of check at all: a check that enumerates the table finds what a person
who has already looked cannot.** `corsair.broadside` — an *ultimate*, range 400, firing a
spectral broadside across the battlefield and drawing a ring at the caster's feet — was
missing from a careful hand-built inventory of this exact defect. It was missed because the
hand inventory counted an `fx` step as a visual and the ultimate has one. The person doing
the counting had already decided what "has a visual" meant and then applied it consistently;
the gate walks all 210 and applies the stricter rule without getting tired.

The colour rule has the same shape of reasoning behind it and is worth preserving: the tracer
takes its colour from **the ability's own damage type, never the caster's gear element**.
Elemental attunement from gear is the player's business, but the line exists to tell you what
is about to hurt you — and in co-op it is somebody else's ability coming at you, so the
caster's gear is exactly the wrong source. Same instinct as the one-hot-accent rule in the
art guide: the bright thing is the thing you need to read.

**Byte-identical simulation.** `render/` and `ui/` read state and draw; they never mutate
it. A tracer is emitted from inside `castAbility`, which *is* the simulation, so "it's only
cosmetic" has to be proved rather than asserted: the same seeded floor with the same
scripted bot must produce an identical `outcomeSnapshot` whether the roster carries `fx` or
has it stripped. Run for two classes, because the bot only casts what its class has.

**And the third check, which is the one that makes the second mean anything.** A comparison
like that can pass because nothing was ever going to differ. So the tool *injects the
violation*: it patches `Dungeon.emitTracer` to draw from the dungeon's own rng, confirms the
injection actually fired, and requires the comparison to go **red**. Then it restores and
requires it to go green again.

The injection is deliberately the exact failure this feature could plausibly have, and it is
foundational rather than conditional — an rng draw reorders every subsequent draw in the run
(spawns, drops, crits), so it cannot fail to be visible. A sabotage that only reached a
cosmetic event, or that landed downstream of where the snapshot reads, would leave the check
green while proving nothing. **If that injection ever stops turning the comparison red, the
comparison has gone blind, and the fix is a stronger injection rather than a shrug.**

## 7. Known limits

- **A client does not see a remote player's tracers.** Dungeon events never cross the wire,
  so FX are local to whichever machine ran the cast. This is pre-existing and applies to
  every cast flourish in the game, not just tracers; fixing it means putting events on the
  snapshot, which is its own decision.
- **`cast`, `impact`, `ground`, `trail`, `screenShake`, `hitStop`, `cameraEmphasis` and
  `palette` are still unread.** Declared, documented as unread, and available.
- **The melee cutoff (`range > 90`) is a judgement constant.** It separates the swings and
  cleaves from the ranged set cleanly today, but an ability authored at range 95 that is
  really a swing will be asked for a tracer it does not need. That is a documented edge, and
  the gate's own failure message says so — the fix is to lower that ability's range or to
  declare it melee explicitly, never to weaken the gate.
- **The 46 melee and self-targeted abilities that resolve harm with no visual are out of
  scope** and deliberately excluded from the coverage rule. A swing happens on your own
  character where you are already looking. If they ever want a flourish, it is `fx.cast`.
