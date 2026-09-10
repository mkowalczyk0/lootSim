# Monster sprite sets — which realm's monsters you are actually fighting

**Status: the seam is built, and all three named sets are drawn.** `npm run monstersets`
(`tools/monstersets.ts`, in `npm test`) holds it. The Tower's five (`art/monsters/finish-tower.ts`)
shipped last — see §4.

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
`chooseSpriteArt(name, set, loaded)` resolves one — pure and DOM-free in
`render/spriteart.ts`, with `resolveSprite(name, set)` in `render/sprites.ts` as the
canvas-owning half. Three sets are named today:

| Set | Realm | State |
| --- | --- | --- |
| `reliquary` | the Ashen Reliquary's six sectors | **drawn** — the five committed PNGs |
| `delve` | the six Delve biomes | **drawn** — the same five, deliberately |
| `tower` | the three ascent bands | **drawn** — five bespoke celestial sprites |

### The Delve did not need new art, and finding that out was the point

A first pass pointed `delve` at five undrawn `delve.monster.*` ids, declaring a five-sprite
backlog. **That was wrong.** The existing sprites read as Hell — rot, bone, iron, a cult
robe — and the `reliquary.` prefix is an accident of *when* they were generated (during the
Reliquary sector pass), not a claim of ownership. `docs/art-manifest.md` calls them "the
identical Hell/Reliquary sprites" and lists them under *what has a bespoke sprite today*,
keyed by archetype rather than by realm. The Delve has the right art under a misleading name.

So `delve` and `reliquary` are identical today, and **that is the finding rather than a
mistake**: two realms are drawing one roster. The seam does not fix that on its own — it
makes it visible and deliberate instead of a global default nobody chose. The Reliquary is
the side that should eventually diverge, because its sectors are *places* (a frozen basilica,
a rotting garden, a wargrave) whereas the Delve is where this art already looks at home.

The sharing is declared in `SHARED_MONSTER_SETS` and the acceptance test **fails any
undeclared overlap** — two realms quietly resolving to one roster is the exact defect this
seam exists to surface, so it must never happen by accident again. It also fails a
declaration that has gone *stale*, because an exemption that no longer describes anything is
how a real accidental overlap gets waved through later.

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

## 4. What shipped, and what is still left

**The Tower's five landed** (`art/monsters/finish-tower.ts`, `tools/monstersets.ts` and
`tools/anim.ts` both green against them): Power-at-Arms (grunt), Virtue Lancer (archer),
Throne-Bearer (brute), Dominion Herald (caster), Halo Fragment (swarmer). Bespoke rather than
a palette swap, for the reason below, and matched to the Reliquary roster's own world heights
so a Tower brute doesn't tower over a Delve brute as an unintended balance signal.

Two generation defects came up and were fixed in the same script rather than by hand, so a
reroll doesn't lose the fix: Power-at-Arms and Throne-Bearer generated with a fully dark
helm/mask — zero saturated pixels, the same "no accent at all" failure the raid bosses hit —
and got one painted into the void eyes; Virtue Lancer and Dominion Herald generated with
2-11x the shipped hot-pixel ceiling (scattered trim, a whole gold robe front) and got muted
down to it. See the script's header for the measured before/after on all five.

Once real celestial art existed, the floor/monster contrast gate (`tools/smoke.ts`, "a floor
must not be its own sector's element") started actually measuring the Tower for the first
time — before, `MONSTER_SETS.tower` named ids with no PNGs behind them, so every role fell
back to the (undeclared-for-this-purpose) Hell roster and the gate measured nothing. It
passes clean: the Tower's tints were already kept dark for exactly this reason (see
`data/tower.ts`'s header), so a bright celestial roster reads with room to spare rather than
narrowing the window the way a naive fix would have predicted.

- **The Tower's five bosses** reuse borrowed templates and are deliberately out of scope: a
  boss is one floor in five, and the trash is what you look at for the other four.
- **Why the Tower's must be bespoke rather than a palette swap of the Reliquary's:** the
  worldbuilding doc's Heaven is **Order** — *"just as frightening as Hell, but for very
  different reasons"* — and Order versus Dominion lives in **silhouette**: symmetry,
  repetition and geometry against asymmetry, spines and appetite. A tint moves colour and
  leaves silhouette alone, so a palette swap produces white demons. The art guide §6
  reached the same place independently: *"ascending the Tower should feel worse, not
  better."*
