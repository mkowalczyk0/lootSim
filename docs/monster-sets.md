# Monster sprite sets — which realm's monsters you are actually fighting

**Status: the seam is built; the art is not.** `npm run monstersets` (`tools/monstersets.ts`,
in `npm test`) holds it.

## 1. This fixes a live defect, not a future one

Until this existed, `SPRITE_OVERRIDES` in `render/atlas/manifest.ts` was the *only* answer to
"what does a grunt look like":

```
grunt → reliquary.monster.rot-imp
archer → reliquary.monster.bone-archer
brute → reliquary.monster.iron-brute
caster → reliquary.monster.cult-caster
swarmer → reliquary.monster.rot-scuttler
```

Full stop, game-wide, with no biome awareness anywhere in the path. **So every realm draws
the Reliquary's monsters — the Delve included.** Nobody noticed because those five sprites
were authored to look at home in exactly the Delve's palette, and because the place the
mismatch reads loudest is the Tower, which people had already written off as "needs art".

That is worth stating plainly because it changes what this work is: it is not wiring up art
that was never connected. It is that **one realm's roster had quietly become the whole
game's roster, and there was no way to say otherwise.**

## 2. The seam

`BiomeStyle.monsterSet` names a set; `MONSTER_SETS` maps a set's archetypes to atlas ids;
`monsterSprite(name, set)` resolves one. Three sets are named today:

| Set | Realm | State |
| --- | --- | --- |
| `reliquary` | the Ashen Reliquary's six sectors | **drawn** — the five committed PNGs |
| `delve` | the six Delve biomes | named, undrawn |
| `tower` | the three ascent bands | named, undrawn |

**Naming a set before drawing it is the point, not a compromise.** It is the `TILESETS`
precedent applied to monsters: the Tower's tilesets have been named-and-absent since §21
shipped, and the floors fall back rather than break. Declaring a realm's intent costs
nothing, breaks nothing, and makes the gap *sayable* — which it previously was not.

### The fallback ladder

Every rung is a fallback, never an error:

1. the named set's entry for this archetype, **if its PNG is actually loaded**
2. `SPRITE_OVERRIDES` — the game-wide default
3. the procedural bake in `render/pixels.ts`

A set that does not exist, does not list this archetype, or lists one whose PNG is not
committed all come out the same way. `monsterSetId` tests `atlasCanvas(id)` rather than
manifest membership, deliberately: **a manifest row is a statement of intent and a loaded
canvas is a fact.**

One sharp edge the acceptance test guards: an undrawn set must name ids that are **not** in
`ATLAS`. `loadAtlas` rejects on a missing PNG for an `ATLAS` row, so a half-declared sprite —
listed in `ATLAS`, no file behind it — is the single state that *breaks* rather than
degrades. Declared-and-absent is safe; declared-in-`ATLAS`-and-absent is a boot failure.

## 3. Pictures and nothing else

A monster's kind, stats, behaviour, names and hitbox are untouched. `monsterSet` is read
only in `render/`, and the draw call receives it as an argument rather than the renderer
holding per-floor state.

Bosses are excluded on purpose: a boss is an authored encounter with its own sprite, not an
archetype wearing a local face.

`tools/monstersets.ts` asserts this as a comparison rather than a promise — the same seeded
floor plays out byte-identically whether it draws `reliquary`, `tower`, `delve`, or a set
that does not exist. **And then it injects a violation**, because a comparison nobody has
seen fail may be comparing something neither side could move: it patches the spawn path to
take an rng draw *only when a set is named*, confirms the injection fired, requires the
comparison to go red, then restores and requires it green again. Same method as
`tools/abilityfx.ts`; the injection is foundational (an rng draw reorders every subsequent
draw) rather than conditional.

## 4. What is left

- **The art.** 5 sprites for the Tower, 5 for the Delve. The engine collapses 11 archetypes
  onto 5 silhouettes (`ENEMY_SPRITES`), which is what makes that number small.
- **The Tower's five bosses** reuse borrowed templates and are deliberately out of scope: a
  boss is one floor in five, and the trash is what you look at for the other four.
- **Why the Tower's must be bespoke rather than a palette swap of the Reliquary's:** the
  worldbuilding doc's Heaven is **Order** — *"just as frightening as Hell, but for very
  different reasons"* — and Order versus Dominion lives in **silhouette**: symmetry,
  repetition and geometry against asymmetry, spines and appetite. A tint moves colour and
  leaves silhouette alone, so a palette swap produces white demons. The art guide §6
  reached the same place independently: *"ascending the Tower should feel worse, not
  better."*
