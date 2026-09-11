# Docket §36 — the summon sprite seam

> "Sprites for each class summons, ie. Replace the triangle sprite"

This is the renderer seam, not the art. Session 56 owns generating the 21 bespoke bodies
the owner asked for; this document is what they land into, so a PNG committed one class at
a time appears in the game with nobody touching `render/draw.ts` again.

## The ladder

Every summoned minion resolves through `chooseMinionArt` (`src/render/minionart.ts`, pure,
no DOM — mirrors `render/itemart.ts`/`render/spriteart.ts`'s existing shape rather than
inventing a fourth one) and is executed by `minionSprite` (`src/render/sprites.ts`):

1. **Player-copy units** — `mirror_image`, `monk_afterimage`, `trickster_decoy`,
   `trickster_mirror`, `trickster_mirror_self`, `trickster_lure`. Draw the summoning hero's
   own composed sprite (`heroSprite(appearance, classId)`, the full back→body→hair→face→
   ears→hat stack, cosmetics included). Unconditional — this is the mechanic (a Trickster
   decoy that doesn't look like the Trickster is wrong), not a fallback for missing art.
2. **The unit's own authored sprite** — a `SUMMON_UNIT_ART` row whose PNG has loaded.
3. **Today's flat, element-tinted triangle** — unconditional, never removed. This is what
   makes it safe for 56 to land the 21 bodies one at a time rather than all at once.

`SUMMON_UNIT_ART: Record<string, string | null>` (`src/render/atlas/manifest.ts`, next to
`CLASS_HEROES`) is one row per unit, `null` until a PNG lands — same "declared but
undrawn" idiom `MONSTER_SETS`/`CLASS_HEROES` already use. **Never declare an id here before
its PNG is committed in the same change** — the Tower tileset rule: a manifest row with no
PNG fails `npm run smoke` and claims art the repo doesn't have.

## Where the unit list comes from

`src/data/summons.ts`'s `SUMMON_UNITS` is walked from every place a `{ kind: "summon" }`
step can originate — class abilities, tree-node mutations, hybrid/archetype unlocks,
relic effects, named-item effects — rather than typed by hand. **27 units today**, in four
families (per 56/26's derivation from the same data): 6 player copies, 8 risen dead, 6
constructs, 7 spirits/beasts. `tools/summonart.ts` (`npm run summonart`, in `npm test`)
prints the walked count and fails a unit with no `SUMMON_UNIT_ART` row (or player-copy
membership) — CLAUDE.md's rule that a check's scope must come from the data, not a
maintained list, applied here so a 28th summon can't silently miss the ladder.

**Two independent counts landed on 27.** 56/26 counted by reading the progression files by
eye; this walk counts by executing the data. That agreement is real evidence the number is
right — and the one place they disagreed is the more interesting result: `kept_name` and
`limbo_shade` were reported as "named items," but they're actually relic-sourced
(`src/data/relics.ts`'s `RelicDef.effects`, not `src/data/named.ts`). The *lead* was
correct — a summon can come from the worn-effect vocabulary, not only a class's ability
table — and only the specific file was off, which is exactly why the gate has to be scoped
over every source (abilities, mutations, unlocks, relics, named items) rather than the two
sources a report happened to name.

This same list is also the co-op wire's registry for a minion's unit id
(`SUMMON_UNITS.indexOf`/`SUMMON_UNITS[i]` in `net/sync.ts`, the identical shape
`RELICS`/`AUGMENTS` already use for a dropped item) — see "The co-op bug this almost
shipped" below.

## Facing: one authored direction, flip only

Every migrated monster and boss in this game already draws one authored pose and mirrors
it left/right (`drawEnemy`: `const flip = Math.cos(e.facing) < 0;` then
`drawSprite(ctx, canvas, x, y, flip, scale, feet)`); the hero works the same way. This is
not a cost-saving compromise adopted for §36 — it is the existing seam, unchanged. So the
owner's "21 bespoke bodies" ruling costs 21 drawings, not 21×N: one pose per unit.

56 confirmed the roster's actual authored orientation is **south, front-on** (not the +x
convention this doc first guessed) and asked whether directional units — `falcon`,
`spirit_hawk`, `spirit_wolf`, `siege_engine`, the turrets' barrels — should get an east
rotation instead, since the character pipeline can generate all eight for free. **Answer:
no, keep it uniform.** The renderer has no mechanism to pick between two authored
rotations per entity; every other multi-directional creature in the game (chargers,
archers, anything that logically aims or moves in four directions) already accepts
south-plus-flip with nobody treating it as a defect. Adding a second rotation for five
units would be a genuine new special case for a benefit nothing else in the roster gets.

## The element carrier: an outline accent, by owner ruling

**Ruled 2026-09-11, against the study below: the element rides on the summon's OUTLINE,
body wash zero.** `SUMMON_ELEMENT_OUTLINE = 0.65` in `render/sprites.ts`; the mechanism is
`render/grade.ts#accentEdges` (pure — only opaque pixels with a transparent 4-neighbour
move, interior and alpha never, pinned as a property in `npm run summonart` on a synthetic
sprite whose answer is known by construction) applied by `outlinedCanvas`. 0.65 is the
middle of the 0.6–0.7 band the study rendered; the three read the same at world scale, so
the middle was chosen and the choice is stated rather than implied. `SUMMON_ELEMENT_WASH`
is retired, not set to 0 — a wash of 0 would still describe the wrong mechanism.

**This is a deliberate, owner-approved exception to §17.2's ink-outline convention.** Every
other sprite in the game keeps an `ink` outline at runtime; a summon's is pulled toward its
owner's element. The cost was stated to the owner as the price of the carrier and accepted.
It is runtime-only: the committed PNGs are ink-outlined and accent-free, and `npm run
chroma` measures the files, so the §1.4 rule for the art is untouched. If you find a summon
outlined in colour, that is the ruling, not a bug.

The section below is the history — the placeholder, why it was a placeholder, and the study
that replaced it.

### The placeholder, as it was: tint pass, strength undecided

Item #3 of the brief: whatever replaces the triangle still has to say "this is mine, and
it is my element" — the tint is currently doing that job alone. Mechanism: a tint pass
over 56's authored art via the existing `tintedCanvas` (the same one rarity-washing and
elite recolors use), **not** an authored variant per element — one body per unit, not
five.

**The wash strength (`SUMMON_ELEMENT_WASH` in `render/sprites.ts`, currently `0.3`) is
explicitly not decided.** Two live tensions only an eye can resolve:

- The owner rejected the cheaper family-of-recolours option specifically to get 21
  *recognisable* bodies. A wash heavy enough to read as "this is fire" pushes back toward
  the flatter, more-recolour-than-body look they turned down.
- This repo has a named lesson about a tint/scale constant that was correct for one
  rendering rung becoming wrong on the next without anyone re-measuring (the biome tint
  that quietly became a 30% wash). `0.3` is a placeholder in the weapon-wash
  (`ATLAS_WEAPON_WASH = 0.26`) neighbourhood, chosen by analogy, not by measurement against
  real art — because there isn't any yet.

**Once 56's first PNG lands, render a contact sheet at a few candidate strengths and hand
the number to 56 and the owner's eye.** Also worth asking 56 directly whether a full-body
wash is the right carrier at all, or whether a smaller accent/aura in the owner's element
says "mine, and this element" better — the monsters' own rule is one hot accent per body,
not a full recolour, and the same instinct may apply here.

### The study (2026-09-11, `art/summon-wire`) — a picture, not a decision

All 21 PNGs are in. `art/summons/wash-study.py` (with `floor-export.ts` for the game's
own graded floor tile) stands eleven summons on the Training Grounds floor at true world
scale, between the hero and two monsters, and repeats the row per treatment: wash 0 /
0.15 / 0.30 / 0.45 (`tintedCanvas`'s exact arithmetic), an **outline accent** (only the
opaque cells touching transparency blended 70% toward the element, body untouched), and a
**ground ring** (the windup ring `drawMinions` already draws, made permanent). One image
per element under `art/summons/study/`; `wash-study-side-by-side.png` is fire and cold
together, the loud and the pale case.

What the pictures show, for the owner's eye to confirm or overrule:

- **A body wash at 0.30 is the elite treatment.** `drawEnemy` draws an elite monster as
  `spriteFrameTinted(..., RARITY_COLORS[e.elite], 0.35)` — a 0.35 body wash toward a
  colour. A summon at 0.30 toward its element is the same operation in a different hue,
  and on the sheet it reads that way: bone, iron and cloth all become one terracotta (fire)
  or one ice-blue (cold). That is precisely the "family of recolours" look the owner paid
  21 bespoke bodies to avoid, arriving through the renderer instead of the generator.
- **0.15 keeps the bodies and loses the element on fire.** Cold still reads (a faint
  blue on the skeleton); fire is a warm cast you would not name without the label.
  0.45 is a silhouette in the element's colour.
- **The outline accent keeps every body intact and still says both things.** The element
  is legible at a glance on every figure including the 12-unit healing spirit, and
  "mine" is carried by the same visual grammar ARPGs already use for an allied or
  selected unit — an edge, not a gaze. It does not collide with §1.4: the monsters'
  signal is a hot point that is looking at you; a rim is a different vocabulary. Its
  cost is that it breaks the `ink`-outline convention (§17.2) for this one family, at
  runtime rather than in the PNGs (`npm run chroma` measures the files, which stay
  accent-free either way).
- **The ground ring is the cleanest "mine" and the weakest "element".** It says
  ownership clearly and the colour is legible, but eight skeletons are eight rings on the
  floor, it fights the health bar and the windup ring for the same real estate, and a
  flying unit's ring has nowhere honest to sit.

**Recommendation put to the owner:** carry the element on the **outline at ~0.6-0.7**,
body wash **0**; second choice wash 0.15 if the ink-outline convention is held to be
non-negotiable. **Taken** — see the ruling at the top of this section. The study exists so
the number was chosen against real art rather than by analogy to the weapon wash, which is
how 0.3 got there; the decisive fact was not "0.3 looks like a lot" but what 0.3 already
meant elsewhere in the renderer.

## The co-op bug this almost shipped

The wire never carried `unit` before this branch. `net/sync.ts` encoded a minion as
`[id, owner, x, y, radius, facing, health, maxHealth, windup, hitFlash, element]` and the
client reconstructed it with `unit: "summon"` hardcoded — harmless while every minion drew
the same triangle regardless of unit, but it would have made every rung-2 authored sprite
invisible to anyone but the host the moment 56's first PNG landed. Fixed by sending
`SUMMON_UNITS.indexOf(m.unit)` and resolving it back through the same array on decode,
mirroring the registry-index pattern already used for a dropped relic/augment a few lines
below in the same encoder. Caught before it shipped because the wire was read line by line
against what the new renderer path actually needs, not assumed unchanged.

**Why the index is safe, stated rather than left implicit:** both ends of a co-op session
run the identical bundle, so both derive `SUMMON_UNITS` from the identical walk — but the
stronger reason is that the walk's result is `.sort()`ed before export, so the final array
is the same *regardless of the order the walk happened to visit units in*. An index means
the same string on either end by construction, not by an incidental ordering that a future
refactor to `collectSummonUnits` could quietly disturb. `tools/summonart.ts` asserts this
directly (`SUMMON_UNITS is sorted`) rather than leaving it as an unstated property of
today's implementation. An out-of-range index on decode (shouldn't happen, but the render
path's own rule is that an unrecognised unit draws the triangle rather than breaking)
resolves to a sentinel string that is never a real unit id, which `chooseMinionArt` falls
through to the triangle rung for exactly like any other unauthored unit.

## `npm run summonart`'s place in the test chain: free

No real ordering constraint — safe to union anywhere in the chain. Specifically:

- **Doesn't need the bundle.** Like every `run-tool.mjs` script, it bundles its own entry
  fresh with esbuild into a private `mkdtemp` directory each invocation (see
  `tools/run-tool.mjs`'s own header on why — concurrent runs must never share an
  `outfile`). It never reads `dist/`.
- **Imports from `src/` directly** — `data/summons` (`SUMMON_UNITS`, `summonUnitSources`),
  `render/minionart` (`PLAYER_COPY_UNITS`), `render/atlas/manifest`
  (`SUMMON_UNIT_ART`) — but all three are plain data/pure-function modules with no DOM.
  `manifest.ts` says so explicitly in its own header: the PNG-decoding half that needs a
  `document` lives in `render/atlas/index.ts`, which this tool never touches.
- **Needs no earlier step to have run.** It doesn't read any file another gate step writes,
  doesn't touch `node_modules/.cache` (nothing does anymore, per the same header), and its
  own inputs are just the source tree already on disk.
- The only real precondition is `npm install` having put esbuild in `node_modules/.bin` —
  the same baseline every other `run-tool.mjs` step in the chain already assumes, not a
  distinguishing constraint.

Same shape as d8's `summonUnitSources` example: reads only source, needs no prior build. It
currently sits right before `smoke` in this branch's own `test` line, which is placement of
convenience (grouped with the other art-ladder checks), not a requirement — it would pass
unioned in at any position.

## What worldScale/feet do and don't touch

`ATLAS[id].worldScale`/`.feet` (rung 2) and `heroSprite()`'s own `scale`/`feet` (rung 1)
govern **draw size only**, exactly like every other migrated sprite. `Minion.radius`
(the physics/collision value) is untouched by any of this, the same way an item's
`worldScale` never moves its pickup radius.
