# Art Style Guide — *Ashes of Purgatory*

> **This document is the single source of truth for the game's visual direction.**
> It is derived from [`game_story_worldbuilding.md`](game_story_worldbuilding.md) (aesthetic
> direction) and [`UAT_Notes_Post_Playtest_Update_Specification.md`](UAT_Notes_Post_Playtest_Update_Specification.md)
> (what is being built and in what order). Every sprite, tile, icon, effect and UI screen
> must be traceable to a rule in here. If a new piece of art needs a rule that doesn't
> exist yet, the rule gets **added here first**, then the art gets made. That ordering is
> the whole anti-drift mechanism.

---

## 0. How to use this guide

**Before making any art:**

1. Read §1 (pillars) and §2 (master palette).
2. Find the thing you're making in §4–§16 and read its visual language.
3. Pull exact hex from §2 / `src/data/art-palette.ts` (the machine-readable twin of §2).
4. Author at the resolution and layer order in §17.
5. Run the drift checklist in §19 before committing.

**When Claude is asked to make a boss / monster / weapon suite / area / UI screen / item
icon**, this is the document it reads first, every session. The generation tool
(PixelLab) is *prompted from the rules in here*; the assembly tool (aseprite-mcp) is used
to force the output onto this palette and these dimensions. Keep the guide current — a
stale guide drifts faster than no guide.

**Scope note.** The UAT spec adds a very large amount of art: a monster-variety overhaul
(~16 combat roles), a monster-affix system (each affix needs a visual indicator), elite
monsters, a second (Heaven-side) content axis, item icons for every item, ~20 Relics,
~30 Artifacts, named items, raid bosses, two new equipment slots. §18 sequences all of it
against the UAT implementation chunks — **art is produced chunk-by-chunk alongside the
systems, never all at once.**

---

## 1. Aesthetic pillars

The setting is **Purgatory**: the middle kingdom between Heaven and Hell, a realm *shaped
by memory* and *assembled from dead civilizations*.

### 1.1 Memory made physical
Nothing here was built on purpose. It **accreted**. Roman stonework against Gothic
cathedrals, Greek columns under medieval towers, saints beside pagan gods, ancient weapons
embedded in the walls. Every environment reads as *layered wreckage of many eras*, never
one coherent architecture. When in doubt, put two incompatible periods in the same frame.

### 1.2 The three forces have three visual logics
| Force | Principle | Visual logic |
| --- | --- | --- |
| **Heaven** | Order | Rigid symmetry, gold + bone-white, repeated geometry, seamless surfaces, *too perfect*. Frightening because nothing deviates. |
| **Hell** | Dominion | Asymmetric mass, iron + ember, spikes and chains, things built *on top of* other things by force. Structured but brutal. |
| **The Abyss** | Unmaking | Broken perspective, near-black + one wrong colour, shapes that don't close, geometry that overlaps itself. Not evil — *erased*. |
| **Purgatory** | Choice | Everything above, jammed together and half-remembered. Ash, stone, faded banners, weak light. The default palette of the game. |

### 1.3 Plain hero, and clarity over pixel-thrift — decided by the owner
The hero is **plain and calm**: small eyes, neutral face, no sharp brows, no slit pupils.
Pleasant to look at across a long session. That has not changed and is not up for
re-litigation — higher resolution buys clarity, never sharper brows on the hero.

What *did* change: an earlier pass over-corrected into "smaller and simpler always wins"
and a mandate to **downscale PixelLab output into ~20px grids**. On seeing that output
next to the same art left near its native size, the owner's call was blunt — the
downscaled versions "look messy," the larger ones are "much prettier... worth it in the
long run, especially with the talks about raids. The bosses are one of the main
attractions." So the pipeline now **authors at a higher resolution and draws it close to
1:1**, rather than crushing a generation into a tiny grid. See the memory
`lootsim-art-direction-and-cosmetics` and §17.1.

The world footprint of every sprite — collision radius, telegraph geometry, camera
framing — is fixed by the simulation and **does not move**. A pipeline sprite carries its
own world-units-per-art-pixel scale (`render/atlas/manifest.ts`) chosen to land it on
exactly the footprint its procedural predecessor had. More pixels, same size on the
ground.

Still true: richer art comes from better shapes, palette and silhouette first — resolution
is not a substitute for those, just no longer something to fight.

### 1.4 One hot accent — the rule that makes a monster read
Monster and boss palettes are **deliberately low and dirty** — desaturated, dark, muddy.
The **only** bright, saturated colour on a monster is *the part of it that is looking at
you*: the eye, the visor slit, the maw-glow. That single hot cluster is what makes an
18-pixel creature read as a threat. Never a second bright colour. The hero has no hot
accent at all.

**The rule is two-sided: exactly one. Not zero, not two.** Both failures ship a sprite that
doesn't read — two accents and nothing is the thing looking at you; zero and it's scenery.
The four raid bosses produced one of each on the first pass.

#### Count the accent. Do not trust your eyes on this.

Before committing any monster, boss or elite, **count saturated pixels**. If the saturated
non-accent pixels outnumber the accent pixels, §1.4 is broken *however it looks* at zoom.

The worked example, because the number is the part that makes this believable: the Queen of
the Seventh Circle was re-prompted with an explicit palette clamp, the result visibly
fixed the polished-gold problem, and it was judged acceptable by eye at 6×. Counted, it
carried **362 saturated red pixels against 55 ember ones** — a second hot colour six times
louder than the only one allowed, on a sprite that had already passed review. The Tyrant of
the First Heavens failed the other way in the same batch: **zero** lit pixels, a boss with
no accent at all.

Both were fixed by `art/bosses/finish.ts` (`muteRivalHue`, `hotAccent`), which is also where
the counting is easiest to re-run. A rough count is a handful of lines: take pixels with
saturation > 0.55 and max channel > 90, bucket them by hue, and compare the accent's bucket
against everything else.

> **Pipeline note — PixelLab fights this rule, so clamp it in the prompt.** The generator
> biases hard toward *clean heroic armour*, and the drift is reliable rather than unlucky:
> both armoured raid bosses (§2 of `docs/art-manifest.md`) came back on the first pass as
> bright polished gold-and-white — the Queen with a saturated red plume, the Tyrant as a
> clean paladin rather than a cast-out one. Neither read as a threat, because when the whole
> body is bright nothing is the part looking at you.
>
> So for **any armoured subject** (boss, elite, humanoid enemy, armoured named item),
> write the clamp into the prompt explicitly rather than hoping: *matte, blackened,
> soot-stained, heavily desaturated, no gold, no shine, no highlights, no white*, and then
> **name the accent as the only saturated value in the image** — "the only bright thing in
> the entire image is a thin \<element\> light in the helm slit".
>
> Expect to still finish by hand sometimes — and expect the count to disagree with your eyes
> even after a re-prompt that clearly worked. **This is a prompting rule, not a claim about
> what is committed** — check the PNGs for that.

> **Pipeline note — PixelLab fights this rule, so clamp it in the prompt.** The generator
> biases hard toward *clean heroic armour*, and the drift is reliable rather than unlucky:
> both armoured raid bosses (§2 of `docs/art-manifest.md`) came back on the first pass as
> bright polished gold-and-white — the Queen of the Seventh Circle with a saturated red
> plume, i.e. a **second** hot colour, and the Tyrant of the First Heavens as a clean
> paladin rather than a cast-out one. Neither read as a threat, because when the whole body
> is bright nothing is the part looking at you.
>
> So for **any armoured subject** (boss, elite, humanoid enemy, armoured named item),
> write the clamp into the prompt explicitly rather than hoping: *matte, blackened,
> soot-stained, heavily desaturated, no gold, no shine, no highlights, no white*, and then
> **name the accent as the only saturated value in the image** — "the only bright thing in
> the entire image is a thin \<element\> light in the helm slit".
>
> Expect to still finish by hand sometimes. A re-prompt fixed both palettes, but the Tyrant
> then came back with *no* lit region at all; its accent was painted in afterwards by
> `art/bosses/finish.ts`, which is the "aseprite adds the hot accent" step of §17.5 done as
> a reproducible script. **This is a prompting rule, not a claim about what is committed** —
> check the PNGs for that.

### 1.4b Value and saturation are different levers — reach for value

Twice in two days a fix on this project was found by separating **value** (how light a
colour is) from **saturation** (how colourful it is). They are not interchangeable, and
reaching for the wrong one produces a characteristic failure each time.

- **"This is too bright" is a value problem.** Desaturating it instead is the trap. The
  natural fix for a hero whose face is too bright is to drain the colour out of the skin —
  and grey skin reads as **dead**. An entire costume pass came back as corpses and orcs
  from exactly that instruction, drifting straight into the monsters' design language,
  which is the one thing §1.3 forbids for the hero. **Lower the face's value and contrast;
  never its saturation.**
- **"This has a second hot accent" is a saturation problem** (§1.4). There, darkening
  doesn't help — a dark saturated red still competes. Desaturate it toward the neutral and
  leave its value roughly alone.

The quick diagnostic: if the offending region would still be wrong in greyscale, it is a
value problem. If it only looks wrong in colour, it is a saturation problem.

### 1.4c Measure the head, not just the sprite

A character's **head is a region, and it must not out-inform the rest of the body**. The
v4 hero was measured against the §1.4 checklist and passed — no hot accent, one dominant
mass — and still read as "too realistic" in the world. The numbers say why: the body means
**L40**, while the face ran **L185–203** with eye whites at **L233**, across **21 distinct
colours in a 200px region**. The brightest, most colour-dense thing on the sprite was a
rendered human portrait sitting on a body that is one flat dark mass.

That is invisible on a contact sheet and obvious in a frame where **every other head in the
game is a shape with an accent in it** — a hood, a helmet slit, a dark void. Nothing else
in the cast has a face to render, which is also why the two casters sit at nearly the
hero's pixel density without anyone ever complaining about them.

So: **count the head's colours and compare its mean value against the body's** before
shipping a character. The head should be the *least* detailed region on a character, not
the most. Two cautions from doing it:

- **Don't let the head become a void or a slit.** That is the monsters' vocabulary and
  makes the hero frightening — an earlier pass was rolled back wholesale for exactly that.
  Less information, not darker or more hostile information.
- **Rebuild the eye row; don't remap it.** Collapsing eye whites, iris and socket shadow
  into one dark shade leaves a hollow smear across the face, which is the corpse read
  arriving by a different route. Repaint the band as plain skin, then place the eyes as
  single dark pixels.

### 1.5 Silhouette carries the meaning
A player identifies a monster's *threat and role* from its black silhouette alone, before
any colour or detail. A sniper is not a recoloured grunt — it is a different shape. This
pillar does most of the work for the UAT monster-variety overhaul (§10.2).

---

## 2. Master palette

`src/data/art-palette.ts` mirrors this exactly and is what the bake step and any tint code
read. Change a value → change both.

### 2.1 Ink & neutrals (the Purgatory base)
| Name | Hex | Use |
| --- | --- | --- |
| `ink` | `#141019` | The one shared outline colour. Everything is outlined in this. |
| `ash-1` | `#2a2733` | Deepest environment shadow |
| `ash-2` | `#3d3a47` | Environment mid |
| `ash-3` | `#57545f` | Environment light |
| `bone` | `#c9c2b4` | Faded stone highlight, old banners, dead relics |
| `parchment` | `#e8dfce` | UI paper, the deadpan-retro text ground |

### 2.2 The six damage elements (verbatim from `src/data/elements.ts` — do not restyle)
| Element | Hex | Material identity (§14) |
| --- | --- | --- |
| physical | `#e2e8f0` | Wargrave steel — the neutral, everyone-needs-it one |
| fire | `#ff7a2f` | Hellfire Ember / Cinderheart |
| cold | `#7dd3fc` | Frostglass / Saint's Ice |
| lightning | `#fde047` | Divine Spark / Stormglass |
| poison | `#84cc16` | Blight Resin / Rotheart |
| void | `#c084fc` | Nullstone / Abyssal Glass — rarer, *wrong* |

### 2.3 The eight rarities (verbatim from `src/data/rarity.ts` — carried from the original)
| Rarity | Hex | | Rarity | Hex |
| --- | --- | --- | --- | --- |
| common | `#9aa0a6` | | legendary | `#ffa500` |
| uncommon | `#3ddc4a` | | mythic | `#ff2d2d` |
| rare | `#3b82f6` | | divine | `#ffb6c1` |
| epic | `#a855f7` | | unspoken | `#ff1493` |

A weapon is authored **once, in greys**, with a named stone slot; rarity colours the stone
and, from epic up, adds a bloom. Never author a per-rarity weapon. Item **icons** (§12)
carry a rarity frame in these colours.

### 2.4 The four forces (environment & faction palettes)
| Force | Core | Shadow | Light | Accent (sparingly) |
| --- | --- | --- | --- | --- |
| **Heaven** | `#d8cfa8` bone-gold | `#8a7d54` | `#f4ecc9` | `#fde047` divine light |
| **Hell** | `#4a2f28` iron-rust | `#241512` | `#7a4a38` | `#ff7a2f` ember |
| **Abyss** | `#0e0b14` null-black | `#000000` | `#241d33` | `#c084fc` the wrong colour |
| **Purgatory / Citadel** | `#3d3a47` ash | `#2a2733` | `#c9c2b4` bone | faded era-specific banner colours |

---

## 3. The realms and content axes at a glance

| Place | Role | Visual headline |
| --- | --- | --- |
| **The Citadel of the Threshold** | Home base / hub | Impossible city of stacked dead civilizations. Ash + bone + weak gold. |
| **Rifts** (standard) | Normal progression | Wounds in reality — torn edges, fragments of Heaven *and* Hell in one room. |
| **Avarice Rifts** *(was Hoard)* | Volume farming | Circle IV energy — hoarded gold, piled loot, swarms. Warm, cluttered, greedy. |
| **Abyssal Rifts** | High-end, Artifacts | Reality torn *beneath* Heaven and Hell. Broken geometry, null-black, the wrong colour. |
| **The Descent / Nine Circles** | Downward axis — "keep Hell at bay" | Less fire the deeper you go, more *idea*. Ends frozen, at Lucifer. |
| **The Tower / Heaven** | Upward axis — "keep Heaven at bay" | Ascending celestial tiers. Blinding order. Holy enemies. |
| **The Ashen Reliquary** | Crafting materials | Continent-sized supernatural graveyard. Harvest the corpses of dead gods. |
| **Daily / Weekly Dungeons** | Recurring activities | Reskin of a Circle or Reliquary sector with a rotating-modifier banner. |
| **Raids** | 4–20 player social endgame | One mythological event per raid. Named-drop bosses. |

---

## 4. The Citadel of the Threshold (the hub)

> "An impossible city assembled over thousands of years from civilizations that died…
> the accumulated history of humanity made physical."

- **Architecture is a collage.** In one screen: a Roman arch, a Gothic buttress, a Greek
  column, a slab of medieval wall — each in `bone`/`ash` stone, none matching. Ancient
  weapons embedded in masonry as texture.
- **Palette:** ash + bone base, `ink` outlines, weak `#fde047` gold only on the Threshold
  wards and Keeper sigils. Nothing else saturated — the Citadel is tired.
- **Light is low and directional** — permanent overcast dusk.
- **Stations read as repurposed relics, not machines:** the Forge is a captured infernal
  furnace; the Reliquary Gate is a cracked-open doorway with ash blowing out; portals are
  framed in mismatched salvaged stone; the Comms Relay is a bell-and-sigil shrine.
- **Statues of saints beside pagan gods** as prop silhouettes to sell "every era at once."
- The old sci-fi "ship / star map" framing is **retired**. The hub is a fortress-city
  interior; the expedition terminal opens onto the **Reliquary**, not a planet.

---

## 5. The Descent — the Nine Circles of Hell

Dante-inspired, adapted. **The deeper you go, the less it looks like fire and the more it
looks like an idea.** Each circle shifts off the Hell base (`#4a2f28` / `#241512` / ember).

| Circle | Theme | Palette shift | Signature motif |
| --- | --- | --- | --- |
| **I — Limbo** | Forgotten souls | Grey fog, colour drained toward `ash` | Ruined classical architecture, drifting spirits, *no fire at all* |
| **II — Lust** | Obsession, possession | Bruised violet `#6b3560`, low red | Grasping hands, luring lights, beckoning silhouettes |
| **III — Gluttony** | Consumption | Sickly `#5a4a1e` bile, wet sheen | Grotesque bulk, mouths, half-eaten terrain |
| **IV — Avarice** | Greed, hoarding | Tarnished gold `#7a5a2a` over grime | Coin drifts, piled weapons, treasure cages — **the Avarice Rift look** |
| **V — Wrath** | Rage | Hot `#8a2a1a`, ember rain | Weapons frozen mid-swing, everything scarred |
| **VI — Heresy** | False faith | **Most striking.** Inverted Heaven — black cathedrals, gold used *wrong*, upside-down halos | Corrupted saints, false angels, blasphemous geometry |
| **VII — Violence** | War | `#3a1c1c` blood-dark, iron | Eternal battlefield, siege engines, corpse terrain |
| **VIII — Fraud** | Deception | Palettes that don't quite match themselves | Mimics, false portals (real glyph, wrong colour), duplicated enemies |
| **IX — Treachery** | Betrayal | **Frozen, not fiery.** `#1a2430` blue-black, `#7dd3fc` ice, near-empty | A vast still lake, figures frozen mid-motion, Lucifer at the centre |

**Lucifer** is imprisoned in the ice. Draw the chains as *holding him in*, not chains he
broke. He is a recurring character, not a final boss.

---

## 6. The Tower — the ascent toward Heaven

> UAT §21–23: an upward content axis mirroring the Delve. **Down = keep Hell at bay.
> Up = keep Heaven at bay.** Both are halves of the same war.

Heaven is **not** "the good realm." Heaven is **Order**, and it is frightening because
nothing is permitted to deviate. Ascending the Tower should feel *worse*, not better, the
higher you go — the warmth drains out and the geometry gets more perfect and more hostile.

| Tier band | Palette | Feel |
| --- | --- | --- |
| **Lower Tower** | bone-gold `#d8cfa8`, warm light | A cathedral that's almost welcoming. Almost. |
| **Mid Tower** | `#f4ecc9` bleaching toward white, gold hard-edged | Repeating geometry, seamless floors, no shadow to hide in |
| **Upper Heaven** | near-white, `#fde047` as a blinding hazard not a highlight | Symmetry so total it's disorienting; enemies that punish deviation from a "correct" position |

- **Celestial hierarchy as enemy tiers** (composites, per §10): Powers (war-angels),
  Thrones (living law — area denial), Dominions (commanders — summoners), Virtues, and
  above them things the player can't properly perceive (drawn as *negative space* /
  outline-only forms even here, borrowing the Abyss trick for a different reason).
- **Light is a weapon.** Heaven's telegraphs are blinding white/gold, hard-edged, and
  often *punish standing still* — the inverse of a Hell AoE you dodge out of.
- Holy damage reuses the lightning/`#fde047` family visually; no new element.

---

## 7. The Abyss

> "Older than the current structure of creation… not evil. *Unmaking*."

- **Palette:** `#0e0b14` null-black, `#000000`, one wrong colour per scene (usually void
  `#c084fc`, sometimes a colour that belongs to something else entirely).
- **Broken rules:** outlines that don't close, contradictory perspective, overlapping
  rooms, a corridor longer leaving than entering.
- **Abyssal-touched creatures** = former angels/demons/monsters with pieces *missing or
  replaced* — an arm that's just outline, a face of the wrong species.
- **Artifacts** (UAT §19) live here: ordinary-looking relics with **one impossible
  property** — a sword whose shadow points wrong, an amulet with no inside. Their icons
  (§12.4) get a dedicated void-edged frame.
- The game's most restrained palette. Almost nothing is coloured. That's the point.

---

## 8. The Ashen Reliquary

> "Enter the supernatural graveyard of a war between Heaven and Hell, harvest the remains
> of dead gods and broken realms, and forge the weapons humanity needs to survive."

Replaces the planet system. Part battlefield, part graveyard, part archive, part wound.
Procedural generation is now *lore*: "the Reliquary does not remember itself the same way
twice."

### 8.1 General look
- Ash over everything — drifting, piled, ankle-deep. `#33241d` warm ash base.
- **Enormous corpses as terrain:** a rib cage you walk between, a hand the size of a room,
  a skull used as a building. Never a whole skeleton on screen.
- Fragments of Heaven fused to fragments of Hell in one structure.
- Old battlefields frozen mid-moment; weapons embedded everywhere; banners of civilizations
  the player has never heard of.

### 8.2 Sectors (element colour over warm-ash base)
| Sector | Element | Built from | Key image |
| --- | --- | --- | --- |
| **The Cinder Catacombs** | fire | Ruined structures under infernal ash | Stone still burning after millennia |
| **The Frozen Basilica** | cold | A cathedral frozen solid | "Statues" that are preserved celestial corpses |
| **The Storm Sepulcher** | lightning | A battlefield where two higher armies annihilated each other | Weapons embedded in ground, sky still crackling |
| **The Rotting Garden** | poison | A celestial garden corrupted by Hell | Flowers from corpses, bleeding trees |
| **The Black Archive** | void | Where the Reliquary touches the Abyss | Overlapping rooms, broken distance |
| **The Wargrave** | physical | Mortal + demonic + celestial armies, piled | Mountains of armour, buried siege engines, half-sunk giants |
| **The Gilded Ossuary** | holy | A reliquary in the oldest sense — saints gilded and put on display | The gold has kept growing since |
| **The Unbound Spire** | arcane | A mage-tower that outlived the war it was built to win | Its wards broke; rooms rewrite themselves while you stand in them |
| **The Hollow Orchard** | nature | An orchard planted over a civilisation's mass grave | Still growing, still fed |

The last three (added Sept 2026, `tiles.reliquary-ossuary`/`-spire`/`-orchard`) carry a
constraint the first six didn't need spelled out: `infusionChance` (data/enemies.ts) caps
at 65% around depth 22, and these three sectors' `baseDepth` (34/39/44) is already past
that cap on tier 1 floor 1 — so roughly two of every three monsters a player sees there
are washed in the sector's own element from the first step in. **The floor cannot be that
colour**, because the element is already spoken for by the things standing on it: gold is
the Ossuary's bodies and relics, not its ground; arcane light comes off the Unbound
Spire's stone, not out of it; the Hollow Orchard leads with the grave (turned earth, bone,
dead bark) and leaves green to what grew out of it. `tools/smoke.ts` now asserts this as a
gate ("an infused monster stays at least 28 luminance apart from its own sector's floor"),
not just a prompting note.

### 8.3 Resource nodes — "harvesting the corpse of a dead god"
**Never MMO ore veins.** Each element's node is a piece of a dead supernatural thing:
fire = burning infernal stone / a blade broken off in a wall radiating heat; cold = a
frozen celestial organ / a shattered ice halo; lightning = lightning trapped in an ancient
weapon; poison = condensed venom dripping from a dead god; void = black crystal growing
from a corpse, hard to look at; physical = a dead horse and a hero's blade half-buried
together. Nodes follow the **one hot accent** rule — the part still holding power glows.

### 8.4 Events (visual beats)
Fallen Angel (celestial corpse ringed by feeding monsters), Infernal Breach (torn-edge
Rift art tinted ember), War Remnant (a battle replaying as translucent echoes), Forgotten
God (huge, dim, one enormous slow eye), Abyssal Contamination (local palette drains to
null-black, monsters gain missing-piece silhouettes).

---

## 9. The Legends (player characters)

> "A class represents a Legendary Archetype rather than the literal identity of a
> character. Arthur Pendragon can manifest as the Swordsman."

- **Plain and calm** (§1.3). A *person*, summoned and incomplete — not a superhero.
  Neutral face, small eyes, heroic-but-human proportions. Nothing scary or flashy on the
  base character.
- **Level 1 = partial manifestation.** Legends recover memories, techniques, weapons and
  "pieces of their myth" as they grow (UAT §13 class completion). Early looks can lean
  plainer/ghostlier; the endgame **gold border** (`#ffa500`→`#fde047` portrait frame) is
  where the mythic weight lands. It *means* something: a fully realized Legend.
- **Manifestation, not portrait.** One class supports many Legends via cosmetic layers,
  weapon skins and dye. The base sprite stays generic; identity lives in the layers.
- **Element comes from gear, not class** — a fire Lancer and a lightning Lancer are the
  same base sprite, different weapon/aura colour.
- Class silhouettes: Lancer (long reach, light, forward stance), Berserker (heaviest mass,
  great axe, hunched), Swordsman (balanced, upright, knightly), Magician (robed, staff,
  least armour, tall hat-space), Shaman (talisman + totems, layered charms, asymmetric).

### 9.1 Equipment slots (UAT §12 Hero screen)
The Hero screen puts the character in the centre with slots around it, each showing the
**actual item icon** (§12). Slots: **helmet, chest, gloves, boots** *(new)*, **weapon,
off-hand** *(new)*, **two rings, amulet**, and **three Relic/Artifact slots** *(new)*.
Boots and off-hand need world-visible treatment on the character sprite eventually; rings/
amulet/relics are icon-only.

**Built as of this pass:** the paper-doll (portrait centred, the six live slots flanking it,
each drawing the real item icon) and the six future slots as visible, locked furniture, so
the sheet reads like a character sheet with room to grow rather than a short list that will
one day get longer. The future slots are declared in one list (`FUTURE_SLOTS` in
`src/ui/town.ts`) — turning one on is moving a row out of that list and into `EQUIP_SLOTS`,
not editing a render function. Whether the three relic slots want the current flanking
columns or a genuine ring around the portrait is an open layout question, deliberately not
guessed at here.

### 9.2 One item, one picture (UAT §11's critical requirement)

> *The stash item image should correspond to the actual item image displayed when opening
> loot boxes/chests. The same item should visually appear to be the same item everywhere.*

Six surfaces draw an item: the **stash card**, the **chest reel**, the **loot banner**, the
**Hero paper-doll slot**, the **compare/equipped panels**, and the **thing lying on the
dungeon floor**. All six resolve through one decision.

- **`chooseItemArt` in `src/render/itemart.ts` is that decision**, and it is *pure* — no
  canvas, no atlas — for the same reason `render/pixels.ts` is: so the property can be
  asserted from Node. `render/sprites.ts` (`itemSprite`) executes it; nothing else may
  re-derive it.
- **The ladder, in order:** the item's own authored art (a manifest row whose PNG actually
  loaded) → a weapon's real family sprite in its rarity's palette → the type's shared icon
  washed toward the rarity colour → the capsule, washed the same way. Every step is a
  fallback for the one above, and none can throw: an unauthored id, a PNG that failed to
  load, or a type with no icon each fall to the next line, the way a removed cosmetic id is
  dropped rather than crashing the character screen.
- **`RARITY_WASH` is 0.5 and there is exactly one of it.** There used to be two: the dungeon
  floor washed a non-weapon icon at 0.4 while the stash and the chest reel washed the same
  item at 0.5, so a rare ring really was a different colour in your bag than on the ground.
  Nothing failed — that is why it survived. 0.5 is the survivor because the spec names the
  chest-opening image as the reference the stash must match, and both of those already used
  it.

**If you add a surface that draws an item, call `itemSprite`.** Don't reach for `ATLAS`, the
weapon sprite or a rarity tint directly; that is precisely how the second implementation got
there. `npm run itemart` fails if the wash constant ever forks again.

**No item PNGs exist yet.** All 11 named items declare an `art` id and every one of them is
currently on the type-icon fallback, which is the documented intended state until an art
pass. Because the ladder is shared, authoring one PNG changes that item's picture on all six
surfaces at once — which is the whole point of the arrangement.

---

## 10. Monsters

### 10.1 Base rules
- Palette low and dirty (§1.4), pulled toward the circle/sector/tier they inhabit.
- Exactly **one hot accent** — the part looking at you.
- Menacing via shape: horns, plate, spines, hoods, hunches, extra limbs, wrong
  proportions. Native size per §17.1 (~24–36 small/crawling, ~40–56 humanoid). Detail
  serves the silhouette — don't fill pixels just because they're there.
- Silhouette first, outline last; interior detail never crosses the outline (§17.2).
- Elites/infused/boss-reskins are palette-swaps of a base silhouette — author base once,
  indexed.

### 10.2 Monsters by combat role (UAT §2 — the variety overhaul)
Each role is a **distinct silhouette** readable in black (§1.5). The role is legible
*before* the player is in range to react. Suggested silhouette language:

| Role | Silhouette read |
| --- | --- |
| Swarm | Tiny, low, many, near-identical — a texture more than a creature |
| Fast melee | Lean, forward-pitched, trailing limbs, small |
| Ranged / sniper | Tall, still, one oversized arm/eye/barrel; sniper adds a visible aim-line |
| Tank | Wide, low, front-heavy plate, tiny head |
| Shielded | Asymmetric — a slab of cover on one side; the shield is its own recolourable sub-sprite |
| Charger | Horns/ram forward, braced back legs, wind-up crouch pose |
| Area-denial | Rooted, bulbous, emitter shapes; barely a face |
| Summoner | Robed, raised arms, a satchel/egg-sac; hangs back |
| Support / healer | Thin, floating, a tether visual to whatever it's buffing |
| Exploder | Round, swollen, cracked skin showing the hot accent *through* the body — telegraphs its own death |
| Crowd-control | Trailing tendrils/nets, low stance |
| Anti-melee | Spiked shell facing out, soft rear |
| Anti-ranged | Hunched behind a deflector, closes distance |
| Highly mobile | Minimal body, big legs/wings, blur-friendly pose |
| Battlefield manipulator | Carries terrain — a slab, a pillar, a chain to the floor |

### 10.3 Affix visual indicators (UAT §3 — modular affix system)
Every affix declares a **visual indicator**. Keep them a small, consistent vocabulary that
stacks legibly (a monster can have several):
- **Aura ring** at the feet, colour = affix family: defensive `#7dd3fc`, offensive
  `#ff2d2d`, behavioural `#c084fc`, anti-player `#84cc16`, death-effect `#ffa500`.
- **Corner glyph** over the health bar — one 8×8 icon per affix (shield, flame, wings,
  hourglass, skull-burst, chain, split, etc.).
- **Body treatment** for a few loud ones: invisible = outline-only shimmer; shielded =
  the shield sub-sprite; burning-attacks = ember drip from the hands.
The player should be able to say "oh shit, this one has *that*" from across the room.

### 10.4 Elites (UAT §4 — "hard as fuck", immediately recognizable)
- **Bigger** — roughly 1.4–1.6× the base sprite, but the *same* silhouette family as its
  base type so the player still reads its role.
- **A permanent elite frame:** a slow-rotating broken-halo/crown ring behind it (ash-bone
  with a rarity-style colour by elite tier), plus a **distinct, wider health bar** with
  the elite's name.
- **Its own hot accent is larger and brighter** — two eyes instead of one, or a full-face
  glow.
- **Unique-ability telegraphs** follow the boss telegraph rules (§11.1) — elites are
  miniature bosses.

---

## 11. Bosses

### 11.1 Shared rules
- One enormous body, native ~48–72 tall (§17.1), scaled to its world footprint by the
  `worldScale` in `render/atlas/manifest.ts` (legacy boss grids: 26×26 × `spriteScale` in
  `data/bosses.ts`). Ignores knockback; fight lasts a minute or two.
- **Telegraph readability is an art requirement.** Every ability is telegraphed; the
  warning shape reads *instantly* at speed — hard-edged bright ring / filled cone / line,
  in the ability's element colour at high saturation, then the impact.
- **Phases add, never replace** — the arena gets visually busier as the boss dies. Design
  the phase-3 silhouette to still read against a cluttered floor.
- **Composites over literal myth** — no reinterpretation copies one tradition's iconography
  wholesale; all of them still read as *this* cosmology.

### 11.2 Floor / mini bosses
Reskinned encounters (element tint + name) on a shared silhouette — the existing
`BOSS_WARDEN / CHOIR / COLOSSUS / HERALD / NAMELESS` grids are the current set and are
being redrawn under this guide: **keep the kit, replace the pixels.**

### 11.3 Class-completion bosses (UAT §13–14)
One per class, tied to the Delve floor. Each is *that Legend's myth made flesh* — the
thing the Legend failed against in life. Defeating it awards the class gold border.
Bespoke silhouette per class; highest art investment in the game.

### 11.4 Raid bosses (UAT §15–16)
Enormous mythological events for 4–20 players — *Tyrant of the First Heavens* (cast-out
celestial warlord, Heaven palette rusting), *Minotaur of the Ninth Labyrinth* (the arena
is its body), *The Ferryman* (corrupted Charon, three realms bleeding into one boat),
*Queen of the Seventh Circle* (a war goddess of overlapping legends). Each is the
**exclusive source of specific named items** (§12.3) and gets a **loot-preview panel**
(§15.3) showing those items' icons.

---

## 12. Items — world sprites vs. inventory icons

> UAT §11–12, §28: the same item must look like **the same item everywhere** — chest
> opening, stash, Hero screen, tooltip, drop preview, crafting UI. This is a hard rule.

### 12.1 Two representations, one identity
| Representation | Where | Spec |
| --- | --- | --- |
| **World attack sprite** | In the dungeon, in your hands | §13 — authored +x, named grip, drawn along the swing |
| **Inventory icon** | Everywhere in the UI | 32×32 (see §17.1), 3/4 or profile view, centred, `ink` outline, transparent bg, rarity frame in §2.3 colour |

For generic dropped gear the icon is generated from the same greyscale weapon/armour base
+ rarity palette, so "the sword you see in the chest" and "the sword in your stash" are
literally the same asset tinted the same way.

### 12.2 The chest-open moment
Loot reveal is **loud, cinematic, scaled by rarity** (this is a standing owner
preference). The icon is what flies out — big, lit, rarity-coloured burst behind it,
screen-shake and colour intensity climbing with rarity, an unspoken drop stopping the
screen. Never a quiet line of text.

### 12.3 Named items (UAT §25, §28 — data-driven pipeline)
Workflow: *create data entry → define behavior → define acquisition → **add icon** → map
icon to item → done*, and the item then appears correctly in loot / chests / stash / Hero
UI / previews / crafting / tooltips automatically. Art's job in that pipeline is **one
icon file** at `src/render/atlas/items/named/<item-id>.png`, on palette, with the rarity
frame, matching the naming in §17.6. Named items may also override the world weapon skin
(one extra greyscale+palette sprite) when the fantasy demands it (a sword that "shoots
tornadoes" should not look stock).

### 12.4 Relics & Artifacts (UAT §19)
- **Artifacts** (~30, Abyssal): icon on a **void-edged frame**, muted, with one impossible
  detail. "Holy shit, I got one."
- **Relics** (~20, raid/endgame): icon on a **gold-and-broken-halo frame**, the most
  ornate frames in the game, each visually tied to its source boss/element. "HOLY SHIT."
- Both are icon-first (they live in the 3 new character slots and in previews); no world
  sprite required.

---

## 13. Weapons (world attack sprites)

Six families, six shapes of attack — **the shape reads before the numbers**:
`sword` (arc), `axe` (slow enormous cleave), `spear` (long narrow piercing thrust),
`daggers` (two fast hits), `staff` (attack becomes a bolt), `talisman` (a circle around
you + a spark elsewhere). All in the weapon slot.

- Authored pointing **+x** with a named grip pixel; drawn rotated along the arc/thrust/spin
  the sim resolved.
- Drawn at the size they hit at — an axe bit really is wider than a torso, a spear really
  out-reaches a sword.
- Palette from item rarity (§2.3): steel blade, rarity stone in the pommel, bloom from
  epic up — unless a cosmetic skin or named-item skin overrides it.
- A staff bolt resolves through the same path as a swing, so a caster gets crits/leech/
  triggers like anyone else — the bolt art is a *projectile*, authored in `fx`-space.

---

## 14. Materials & resource nodes

One material per element (§2.2), physical included (the neutral one). **Every material
looks like a physical piece of the mythology**, not a crafting placeholder — Hellfire
Ember looks like it came out of Hell; Nullstone is disturbing to look at. Material icons
use the §12.1 icon spec with an element-tinted frame instead of a rarity frame. Node
sprites are covered in §8.3.

---

## 15. UI / HUD / town

### 15.1 Voice
The game's UI copy is **dry, deadpan, retro** — lean into it, don't tone it down. Text
sits on `parchment` over the ash world. Menu-heavy screens stay DOM/CSS, not canvas.

### 15.2 Stash (UAT §11)
Bigger item cells, real icons (§12.1), clear rarity frames, generous spacing, strong hover
info, side-by-side equip comparison. The icon in the cell is byte-identical to the one
from the chest.

### 15.3 Hero screen & loot previews (UAT §12, §20)
Hero screen = character centre, slots around (§9.1), each slot the real icon. Loot-preview
panels (raid bosses, dungeons, named sources) list the obtainable items **by icon** with
their source — "I want X, this is where I get it."

### 15.4 HUD
Health/resource/ultimate-charge, potion belt, skill keys reading the *live* keybinds (a
rebind moves every legend the same frame). Elite and boss health bars per §10.4 / §11.1.
Affix glyphs per §10.3.

---

## 16. Effects & telegraphs

`render/fx.ts` speaks in **crescents, four-pointed impact stars, sparkles, embers and
shards** — never grey puffs. The swing crescent is driven by the actual arc the sim hit
along, so the player sees the hitbox, not an impression of it. Telegraphs: bright,
hard-edged, element-coloured, readable at speed (§11.1). Heaven telegraphs invert the
logic — blinding, and often punish *not* moving (§6).

---

## 17. Technical specification

### 17.1 Authoring resolution

Two regimes run side by side during the migration:

**Legacy procedural grids** (`render/pixels.ts`, still most of the game): unchanged —
character `CHAR_W`×`CHAR_H` = 30×26, body 20×22 at (5, 4); monster 18–24 wide; raid/floor
boss 26×26. These ride the global `SPRITE_SCALE` (1.2) / `WEAPON_SCALE` (1.5) in
`render/draw.ts` and the boss `spriteScale` table; change a grid's authoring resolution
and those move in the **same commit**.

**Pipeline sprites** (`render/atlas/`, PixelLab → Aseprite → PNG): authored **larger, for
clarity** (§1.3). Target native sizes:

| Thing | Native px | Notes |
| --- | --- | --- |
| Character / humanoid enemy | **~40–56 tall** | |
| Small / crawling monster | **~24–36** | |
| Elite | base × **1.4–1.6**, same silhouette family | |
| Raid / floor boss | **~48–72 tall** | a boss may run larger — it's the headline act |
| Weapon (world) | pointing **+x**, named grip pixel | small; expect hand-finishing |
| Inventory icon | **32×32** | transparent bg, `ink` outline, rarity/element frame |
| Affix glyph | **8×8** | one per affix |
| Tile | **16×16** | |

Each pipeline sprite has a row in `render/atlas/manifest.ts` carrying its real PNG size, a
`worldScale` (world units per art pixel, tuned to match the predecessor's world
footprint), and a `feet` offset. `render/draw.ts` reads those instead of the global
constants for any sprite that has an atlas entry. **Generate near the target size — do
not generate huge and downscale into a tiny grid** (that was the rejected approach). If a
sprite is re-exported at a new size, update its manifest row and re-check `worldScale`;
the smoke/boot check fails a PNG whose size disagrees with the manifest.

### 17.2 The two conventions that do most of the work
1. **Silhouette first, outline last.** Fill solid, then every cell touching transparency
   becomes `ink`. Interior detail stamped after, never over an outline pixel.
2. **Hair shades where it meets the face rather than outlining.** A fringe shadows the
   forehead; a black brow bar reads as a helmet.

### 17.3 The character is a stack, not a sprite
Compose back→front: **back item → body → hair → face → ears → hat**. Each layer in the
same 30×26 space, placed by offset; a horned helm lands on the head whichever hair is
under it. Composed canvas cached against the appearance. **Keep this** — it is the entire
cosmetics system, and it now also carries boots/off-hand (§9.1).

### 17.4 Palette-swap must survive the migration
Runtime-recoloured art — weapons (rarity), monsters (element infusion, elite, boss-reskin),
cosmetic dyes, material/rarity frames — is authored **indexed-mode** with a palette map,
or greyscale + a tint pass. Never author variants by hand.

### 17.5 Repo layout & pipeline *(see memory `lootsim-art-pipeline-aseprite-migration`)*
```
art/                          raw generations + (later) .aseprite sources — source of record
  bosses/ monsters/ ...       e.g. bosses/boss.corrupted-saint.raw.png
src/data/art-palette.ts       machine-readable §2 — DONE
src/render/atlas/             committed PNGs, loaded by Vite (import.meta.glob)
  manifest.ts                 pure: per-sprite w/h, worldScale, feet, SpriteName override
  index.ts                    browser: PNG -> canvas, size-checked against the manifest
  bosses/ monsters/ ...       the PNGs, named realm.category.name (§17.6)
  items/named/<item-id>.png   named-item icons (the §12.3 pipeline drop point)
tools/artsheet.ts             contact sheet — still procedural-only; extend to the atlas
```
**Migration status.** Structure is stood up; the two systems coexist and sprites move over
one at a time. `sprite(name)` / `heroSprite()` / `weaponSprite()` return the PNG when one
is mapped and loaded, and fall back to the procedural bake otherwise. Ported and live:
- **All five monster silhouettes** (`grunt`/`archer`/`brute`/`caster`/`swarmer` →
  `reliquary.monster.rot-imp` / `bone-archer` / `iron-brute` / `cult-caster` /
  `rot-scuttler`) and **all five floor/raid bosses** (`boss`/`bossChoir`/`bossColossus`/
  `bossHerald`/`bossNameless` → `boss.warden` / `corrupted-saint` / `gravebound-colossus`
  / `herald-unspoken` / `nameless`) — kit unchanged, pixels replaced (§11.2). `worldScale`
  lands each on its predecessor's world footprint; `data/bosses.ts` `spriteScale` stays
  as the fallback for the procedural grids the smoke test still walks. 8 rotations per
  monster archived under `art/monsters/rotations/`.
- `hero.legend-base` → the composed player. **v4 redraw (Sept 2026), 39×57.** Playtest
  feedback on the shipped hero was that he was *"really hard to look at and ugly, didn't
  really fit in with the game"* — a verdict on the execution, not on §1.3's plain-calm
  direction, which stands. Three defects, all in the art:
  1. **No dominant mass.** He carried five competing hues — navy cloak, near-white chest
     plate, brown boots, gold buckle, pink skin — so his silhouette broke into stripes
     while every monster and boss is one low dirty colour (§1.4).
  2. **The brightest thing on screen was his torso**, not anything meaningful: that
     near-white plate out-read the hot accent on every monster in the frame.
  3. **He had a hot accent** — two flat saturated-blue bars for eyes. §1.4 and the §19
     checklist both forbid that on the hero specifically, because it is the monsters'
     "the part that is looking at you" signal.

  v4 answers all three: one unified charcoal/ash mass, nothing bright anywhere, and a
  plain calm face with small dark eyes. The height went 48 → 57 because at 28px wide the
  face was ~7px and physically could not hold a calm expression — this is §17.1's "author
  larger, for clarity", not detail for its own sake. **57 is not a ceiling — it sits in a
  band.** `tools/smoke.ts` bounds the Hero/Style portrait spread at 12% and `portraitScale`
  rounds to a *whole* factor, so the spread oscillates rather than growing with height: the
  constraint is a set of windows, not a maximum. As of this writing the legal heights are
  **24–43, 46–50, 52–58 and 78–87**, but don't trust that list here — `npm run smoke` derives
  and prints it next to the portrait sizes, which is the copy that cannot go stale. The fact
  worth carrying in your head is the shape: **59–77 is a dead zone**, and it is exactly the
  range you reach for when you want a slightly bigger hero, so it is the range that silently
  wastes an art generation. (This paragraph previously read "57 is a ceiling … 59+ puts the
  Style tab over it". The 59 figure was right and the word *ceiling* was wrong — the prose
  read as monotonic and the bound is not. The first correction of it also hand-scanned a
  too-narrow range and got both ends wrong, which is why the numbers now come from the
  tool.) World footprint unchanged —
  `worldScale` 0.5614 lands the same 32-unit height every previous version had, so no
  hitbox, telegraph or camera geometry moves. 8 PixelLab rotations re-archived under
  `art/characters/` for the eventual animation runtime; only `south` is wired.

  *Correcting the record:* this bullet previously described a "v2 redraw … 39×68,
  `worldScale` 0.471". No such sprite was ever committed — the file on disk was 28×48 at
  `worldScale` 0.667 (a *lossless trim* of a 68px generation that simply did not fill its
  canvas, not a downscale). The 39×68 figure came from an earlier 92px generation that was
  documented and then replaced by a smaller one without the doc following. Both the sprite
  and this paragraph are now measured off the committed PNG.
- **Cosmetic layers (Sept 2026)** — the "a decorated hero still uses the old sprite"
  complaint this bullet used to document is now fixed for **9 of the 25** hat/ears/face/
  back cosmetic ids: `hatWitch`, `hatCrown` (shared with `hatUnspoken`), `earsCat`,
  `earsHorn`, `faceGlasses`, `faceVisor`, `backCape`, `backAngel`. `composePipelineHero`
  in `render/sprites.ts` composites `hero.legend-base` with any of those onto a padded
  `HERO_STAGE_W`x`HERO_STAGE_H` canvas (headroom for a hat, side margin for wings/a cape —
  the same reason the procedural `CHAR_W` is wider than its 20-wide body); a cosmetic worn
  in one of those four slots that *hasn't* migrated still falls the whole character back
  to the procedural stack, so a half-migrated wardrobe never mixes two art styles on one
  body. **This is the concrete §17.4 "indexed-mode PNG + palette map" mechanism**: each
  cosmetic PNG carries only `ink` plus three reserved marker RGBs (`COSMETIC_MARK_1/2/3`
  in `manifest.ts`) standing in for `colors[0..2]`; `recoloredCosmetic` in `sprites.ts`
  swaps those markers for a cosmetic's real colours at draw time via
  `getImageData`/`putImageData`, leaving the ink outline (never a marker) untouched. The
  Style tab's wardrobe list (`cosmeticPreview`) reads the same migrated art.

  **All nine were re-authored for the v4 hero (Sept 2026)** and the method changed with
  them. They were previously PixelLab generations quantized down to four colours, and the
  quantize was destroying them — the wings came out one flat slab, the ears an
  unrecognisable blob — because a generated image has nowhere near four colours' worth of
  structure left after being crushed to four. At 15–70px an accessory is better *drawn*
  than generated, so these are now authored as shapes: fill the silhouette, then §17.2's
  outline pass, then interior detail, in a small shape kit. Three things this pass
  learned, all of which cost a visible iteration:
  - **Author in stage space, not in the sprite's own box.** Each piece is drawn onto the
    full `HERO_STAGE_W`×`HERO_STAGE_H` canvas at the position it belongs, then trimmed —
    so the trim offset *is* the manifest's `dx`/`dy`. Placement stops being a guess.
  - **Measure the head, don't estimate it.** The eye band is hero rows 9–11, i.e. stage
    y 34. The first pass put the glasses and visor at y 30 and they sat on his forehead.
  - **A cosmetic's own `colors` decide what can carry structure.** `backAngel` is three
    near-whites, so its feather separation has to be drawn in **ink** — the one key that
    is never swapped — or it is invisible. `earsCat`'s `colors[0]` is near-black and
    vanished into his hair, so the pink `colors[1]` carries the ear shape and the dark is
    only a rim. Check the palette in `data/cosmetics.ts` *before* drawing.

  Left for a
  follow-up session, not a design call made here: the other 16 hat/ears/face/back ids
  (same recipe, just unrun); the 7 weapon skins (`WeaponPalette` has four regions, not
  three, and would mean re-processing the 14 already-shipped `ATLAS_WEAPONS` PNGs, a
  separate-sized job); and — a genuine open question rather than a backlog item — the 5
  `HAIR_STYLES`: `hero.legend-base` bakes in one fixed hairstyle as part of the same flat
  image, so a swappable hair *shape* would mean redrawing that already-shipped base
  without its baked-in hair, not just adding another cosmetic layer. `npm run art` still
  only contact-sheets the procedural grids — it has no PNG decoder, only the hand-rolled
  encoder — so it doesn't yet show these 9 either; extending it is noted as future work,
  not attempted here.
- **All fourteen weapon families** (`ATLAS_WEAPONS` in `manifest.ts`, PNGs under
  `atlas/weapons/`) — the original six plus hammer, bow, whip, claws, chakram, scythe,
  rapier and fists. Authored greyscale +x with a named grip; `weaponSprite` tints the
  loaded PNG toward the rarity colour at draw time. A cosmetic weapon **skin** still
  falls back to the procedural grid. whip / scythe / rapier want an Aseprite tidy-up
  pass (the extend-along-a-line families are the hardest for PixelLab to keep crisp).

- **The Citadel deck** (`SCENES["hub.citadel-deck"]`, `atlas/scenes/`) — a baked top-down
  backdrop stretched under the hub stations, replacing the old black-void + cyan-grid
  `drawDeck`. `SCENES` is a third manifest table (like `ATLAS` / `ATLAS_WEAPONS`) for
  full backdrops that have a size but no world footprint. Stations, terminals and the
  hub player still draw procedurally on top. Wants a reroll toward the §1.1 era-collage.
- **The six Reliquary sectors** are re-themed in `data/planets.ts` (names, blurbs, biome
  palettes — ash over dead-civilisation stone pulled toward the element, `#0e0b14` for
  the Black Archive). Still rendered by the procedural `bakeFloor` / `drawWalls`; bespoke
  sector backdrop art is the next environment pass. The **Delve** keeps its legacy biome
  palettes until its own Nine-Circles art pass.
- **All six dungeon props** (`torch`/`bones`/`mushroom`/`crystal`/`rock`/`chest`) and
  **all ten drop icons** (`coin`/`key`/`potion`/`gem`/`capsule` + the five gear-slot
  icons `armor`/`shield`/`ring`/`gloves`/`necklace`). Props draw through `drawProps` at
  `worldScale × p.scale`; icons through `pickupSprite` in-world and `pixelImageFit` in
  the UI (chest roll, loot banner, chest shop, class cards).

Animation runtime is **not** built yet (deliberate — a later pass, ~UAT Chunk 2); every
atlas sprite is a single still frame for now. Weapons and the hero still want a
hand-finishing pass in Aseprite (the axe reads a touch blunt, the spearhead is thin).
The whole procedural string-grid system (`render/pixels.ts`) is still present as the
fallback and is what `npm run art` / the smoke grid-walk still exercise.
- **Generation vs assembly:** PixelLab generates candidates from a §-derived prompt;
  aseprite-mcp forces them onto `art-palette.ts`, fixes dimensions, splits layers, adds
  the hot accent, assembles the atlas, exports. Claude writes the prompts, runs the
  view-and-adjust loop, wires the result into the data files, runs the tests.
- `npm run art` keeps working post-migration (one contact sheet, real palettes, real
  layer order). The grid-walk smoke check becomes: every atlas loads, every frame is the
  expected size, every id (monster/weapon/boss/cosmetic/affix/icon/relic/artifact) has art.

### 17.6 Naming
`realm.category.name[.variant]` — `hell6.monster.false-angel`, `reliquary.node.void`,
`boss.tyrant-first-heavens.phase2`, `weapon.sword.base`, `item.named.tempest-reaver`,
`affix.glyph.chain-lightning`, `tower.enemy.throne`. Lowercase, kebab within a segment.
Tilesets are `tiles.<place>` — `tiles.delve-limbo`, `tiles.reliquary-cinder`, `tiles.abyss`.

### 17.7 Environment tilesets (the floors)

Every floor in the game is a **procedurally generated room graph** (`game/level.ts`) —
that does not change and should not. What changed is how it's *painted*: instead of
`bakeFloor`'s flat tinted rectangle and `drawWalls`' grey boxes, a biome names a
**corner Wang tileset** and the renderer stamps the floor and its walls from real
hand-arted 16px stone.

- **Generate with PixelLab `create_topdown_tileset`** — a 16-tile corner set,
  `lower_description` = the floor, `upper_description` = the wall / rubble mass,
  `transition_description` = the crumbled edge between them. `view: "high top-down"`
  always (it must sit flat under a top-down camera). 16px tiles, `transition_size` 0
  (a 25-tile transition sheet is a *cliff* set — not supported by the runtime yet).
- **Bake the sheet layout** — `npm run tileset -- art/tilesets/<id>.raw.json` reads the
  PixelLab metadata and writes `src/render/atlas/tilesets/<id>.json` (one `[x,y]` per
  corner mask). PixelLab's sheet order is arbitrary; only the metadata says which tile
  is which, so never eyeball it. Commit the PNG **and** the JSON next to each other.
- **Wire it** — add a row to `TILESETS` in `render/atlas/manifest.ts`, then set
  `tileset: "tiles.<id>"` on the `BiomeStyle` in `data/biomes.ts` (Delve) or
  `data/planets.ts` (Reliquary sectors). It is opt-in and degrades: an unlisted or
  not-yet-loaded tileset just falls back to the flat bake, so nothing breaks half-done.
- **Contrast is a gameplay requirement.** Floor and wall must be instantly separable at
  speed — the player reads *walkable vs. not* from this before anything else. A moody
  low-contrast set that looks right in a 64px preview but turns to mush at game zoom is
  wrong. Push the wall mass light *or* dark, but push it clear of the floor. This is now
  **measured, not eyeballed**: `npm run smoke` decodes every committed sheet, runs it
  through the same grade the renderer does, and fails if the all-floor and all-rock
  tiles land closer than 28 luminance apart, if either is brighter than L150, or if a
  tile's internal spread is over ±14.
- **Author to the Citadel palette, in prompt and in pitch.** This used to read "author to
  the Citadel deck", naming `hub.citadel-deck` — the painted hub scene — as the reference
  for palette *and* pixel density. **That went circular the moment the Citadel itself
  became a tileset**, because the reference every other sheet cites is the thing
  `tiles.citadel` replaces. So the reference is now the *palette and recipe*, which is what
  was actually load-bearing, and it outlives the painting it came off: calm, muted,
  mid-grey stone, two or three flat shapes per tile, thin seams, no grain. The painted
  scene survives as the ladder's middle rung and is where those numbers were measured; it
  is no longer what a new sheet is held against. The prompt recipe that gets there —
  `detail: "low detail"`, `shading: "flat shading"`, `outline: "selective outline"`,
  `text_guidance_scale` 9–10, and terrain text along the lines of *"large flat square
  slabs, matte, only thin darker mortar seams, no cracks, no pebbles, no pattern, heavily
  desaturated, low contrast"* for the floor and *"plain blocks, two or three big shapes,
  flat, muted, no bright white, no highlights, low detail"* for the wall. PixelLab
  biases hard toward a light floor under a dark wall and will quietly ignore "dark
  floor"; **invert the roles** — make `upper` (the wall) the *lighter* terrain — to get
  a dark floor. Reroll anything that comes back with a repeating cobble bump, a speckled
  wall, or stray glyph-like marks on the uniform floor tile: the two uniform tiles are
  what a whole room is made of.
- **Describe value, not just hue — the gate measures luminance, and a prompt can satisfy
  your eye while failing it.** The Citadel tileset's first pass asked for "ash grey" floor
  vs. "pale bone-grey" wall — two colours that read as clearly different in the preview
  thumbnail (a warm tan floor, a cool blue-grey wall) — and failed §17.7's contrast gate
  outright: raw luminance delta 5.5, because ash and bone-grey are close in *lightness*
  even though they're different in *hue*, and the grade's 50% desaturation step throws
  chroma away and keeps only value. The fix was to describe darkness and brightness
  explicitly rather than trusting a colour name to imply one — "dark charcoal-grey ... in
  deep shadow, dim, matte" for the floor, "pale bone-white ... bright weathered stone" for
  the wall — which took the same sheet from raw delta 5.5 to 148 and a comfortable graded
  margin (76 against the 28 floor). Words like *dark/dim/shadowed* and *pale/bright/white*
  carry value; colour-family words like "ash grey" or "bone-grey" often don't carry enough
  of it on their own. If a sheet fails the gate, check whether the prompt asked for two
  different-looking colours or two different-*valued* ones before reaching for a reroll.
- **Every sheet goes through the floor grade** (`render/grade.ts`, applied by
  `gradedTileset` in `render/tilemap.ts` before stamping): each pixel is flattened toward
  its terrain's mean colour (55%), desaturated by half, blended 30% toward the biome's
  `tint`, and highlights above L100 rolled off to 55% slope (a shoulder, not a global
  contrast cut — a dark floor under a mid-grey wall keeps all of its separation; only
  a stark white wall comes down). The flatten step is what kills
  busy internal texture without a blur — a crack or a highlight collapses toward its
  slab's colour while the floor↔wall edge, a jump between the two means, keeps its
  contrast. The grade is why a set that comes back a shade loud still ships; it is
  *not* a licence to skip the prompt recipe above, because the grade cannot remove a
  pattern, only quieten it.
- **The pitch is fixed and it is not a convention.** Every sheet is
  `{ w: 64, h: 64, tile: 16 }` — all thirteen of them — because `render/tilemap.ts` stamps a
  16-texel tile across a 32-unit cell, which puts every floor in the game at exactly **2.0
  world units per art pixel**. That number is the anchor the whole density argument rests
  on and what `tools/inworld.ts` measures every sprite against, so a sheet at another pitch
  is not a style choice, it is a floor that does not belong to the same game.
- **Dressing lives in the props, never in the tiles.** `npm run smoke` fails a sheet whose
  tiles carry more than ±14 internal luminance spread, because a busy tile turns to mush at
  game zoom and stops reading as walkable-vs-not. That pulls directly against "a bare
  stamped floor isn't finished" — and the resolution is that the two are different jobs. A
  quiet floor with things standing on it reads as a place; a busy floor reads as noise. If
  a room needs character, it needs *set pieces*, and the gate is not the thing to soften.
- **Pitch and mask.** A 16-texel sheet tile is stamped across a **32-unit** cell — a
  clean 2× nearest-neighbour blow-up that puts the floor on the same on-screen pixel
  grid as the deck, the hero and the props (1:1 stamping read finer and "zoomed out"
  next to everything on it). **The level is authored on that same 32-unit lattice**
  (`TILE` in `game/level.ts`: every wall's edges on multiples of 32, one tile thick,
  rooms and doorways in whole tiles), so a tile cell is either wholly wall or wholly
  floor and the rock mask is simply "is this cell's centre inside a wall rect". Painted
  stone is then *exactly* the collision volume — the hero's 9-unit radius is the only
  gap between sprite and face. Two earlier masks were both wrong: raw-rect coverage of
  off-lattice 16-unit walls painted stone half a tile past the real face, and sampling
  the body-inflated `blocked` grid painted a whole extra tile on one side of every wall
  (a tile centre sits eight units off the nav cell it falls in). Both read as "I can
  walk through walls"; the smoke test now asserts the lattice and the paint/collision
  agreement on every floor it generates. Behind the stamp is the biome tint (not flat
  black) under a faint vignette, so a room reads as low-lit, not as a solid block someone
  carved a path through.
- **Palette** still comes from §2 / §2.4 — ash + bone + `ink` seams for the Delve's
  shallow circles, each circle shifting off the Hell base per §5; the six Reliquary
  sectors are warm-ash `#33241d` pulled toward their element per §8.2; the Abyss is
  `#0e0b14` null-black with one wrong colour per §7. The **one hot accent** rule does
  **not** apply to a tileset — a floor has no eye. Keep it all low and dirty.
- **Boss floors** inherit their depth's tileset automatically (a boss arena is still a
  `Level` with a `biome`), and that's fine — the single big room just gets stamped with
  the same stone.

### 17.7b Floor dressing (selling the theme)

A stamped floor is the surface, not the scene. Each realm gets **heavy set pieces**
scattered on top by `dressFloor` in `level.ts` — a second pass, separate from the small
`biome.props` litter, pulling from a per-realm mix in `DRESSING` (keyed by
`BiomeStyle.name`).

- **Generate with PixelLab `create_map_object`** (basic mode, `high top-down`,
  `single color outline`, `basic shading`, `medium detail`) — near-monochrome grimdark,
  authored 50–110px, one hot accent at most (a candle flame, dried blood). Process with
  the alpha-cut + despeckle + trim step, commit under `art/props/prop.<realm>-<name>.png`
  and `src/render/atlas/props/…`, add an `ATLAS` row (`worldScale` lands the piece on a
  deliberate world height — a statue taller than the hero's ~32, an altar a low slab).
- **Wire it** — add the `PropKind` in `data/biomes.ts`, map it to its atlas id in
  `PROP_ATLAS` (`render/draw.ts`), give it a `PROP_SPRITES` procedural stand-in for the
  frame before the PNG loads, and list it in `DRESSING` (`level.ts`). `drawProps` blits
  the PNG with a `tintedCanvas(…, biome.wallSide, ~0.42)` wash, so **one grimdark set
  themes itself per circle** and PixelLab's too-pale bone gets pulled down. Anything that
  doesn't resolve to a loaded PNG is silently skipped — the set can land incrementally.
- **Never touch the generator rng.** `dressFloor` draws from its own
  `new Rng(level.seed ^ constant)`. The dive rng is shared with combat — perturbing its
  draw count shifts every spawn and telegraph on the floor and fails the smoke test.
- Delve set: statue, brazier (wall), altar, gibbet, sarcophagus, skull heap. Reliquary
  set: fallen giant's hand, war grave, funerary urn, toppled winged pillar. A prop that
  reads as a **loot chest** at zoom (the reliquary "casket") stays out of rotation.

Backlog for the suite is §18 chunk 11, pulled forward: the 6 Delve circles first (start
`tiles.delve-limbo`), then `tiles.abyss`, then the 6 Reliquary sectors. `tiles.delve-limbo`
was reworked dark (black basalt floor, pale bone-rubble walls) after the first pass read
too bright — "dark is better" for the whole suite; the other circles are next.

---

## 18. Production backlog (mapped to the UAT implementation chunks)

Art is produced **with** the system it serves, in the UAT's order — not up front.

| UAT chunk | Systems | Art deliverables |
| --- | --- | --- |
| **1 — Fix existing** | Multiplayer, ultimate exploit, rebalance | None (bugfix). Good moment to stand up the `art/` + atlas pipeline and port a handful of existing sprites as the proof. |
| **2 — Core combat** | Monster variety, affixes, elites, Challenger | The big one: ~16 role silhouettes (§10.2), the affix glyph set + aura vocabulary (§10.3), the elite frame + big health bar (§10.4). Redraw the current common monsters first. |
| **3 — Floor loop** | Clear condition, completion portal, extraction penalty | **Two portal glyphs** (entrance vs completion), an early-extraction warning screen visual. |
| **4 — UI** | Stash redesign, item images, Hero screen | The 32×32 **icon system** (§12.1), rarity frames, the chest-open reveal art (§12.2), Hero-screen slot layout + boots/off-hand icons. |
| **5 — Universal tree** | Second PoE-style tree | Universal-tree node icons + the board background (distinct from the class tree). |
| **6 — Endgame foundation** | Class-completion boss, gold border, daily/weekly dungeons, previews | First **class-completion boss** (§11.3), the animated-or-not gold border (§9), daily/weekly dungeon banners + rotating-modifier icons, the loot-preview panel (§15.3). |
| **7 — Named items** | Modular named-item architecture | Named-item **icon pipeline** proven end-to-end (§12.3); first ~5 named icons + any skin overrides. |
| **8 — Crafting** | Forge overhaul, reforge, currencies | Crafting-currency icons (small set), Forge UI art, a "this item is now a component" treatment. |
| **9 — Relics** | ~20 Relics | 20 **Relic icons** + the gold/broken-halo frame (§12.4). |
| **10 — Raids** | Raid framework, raid bosses, named drops | Raid boss encounters (§11.4) — highest investment; each boss + its named-drop icons + preview panel. |
| **11 — World / Tower** | Tower climbing, Heaven/Hell split, Rift lore, Reliquary restructure | The **Tower / Heaven tier art** (§6), Descent circle art (§5), Reliquary sectors (§8.2), Rift torn-edge treatment. |

---

## 19. The drift checklist (run before committing art)

- [ ] Every colour is from §2 / `art-palette.ts`. No off-palette hex.
- [ ] Outlined in `ink` `#141019`, one shared outline, no ragged edges (§17.2).
- [ ] **Hero:** plain, calm, small eyes, no sharp brows/slit pupils, no hot accent.
- [ ] **Monster/boss:** low dirty palette, exactly **one** hot accent = the part looking
      at you.
- [ ] **Monster role reads from the black silhouette alone** (§1.5, §10.2).
- [ ] Authored at the §17.1 resolution. Authoring resolution not increased.
- [ ] Recoloured variants are palette-swaps, not hand-painted (§17.4).
- [ ] Character art respects the stack + compose order (§17.3).
- [ ] Environment reads as layered wreckage of many eras, not one architecture (§1.1).
- [ ] Item icon is byte-identical wherever it appears — chest, stash, Hero, preview,
      tooltip (§12).
- [ ] Boss/elite telegraph shapes read instantly at speed (§11.1).
- [ ] Traceable to a realm/section rule in §4–§16. If not, the rule was added here first.
- [ ] Ran `npm run art` and **looked at the contact sheet**.
- [ ] `npm run check` and `npm run smoke` pass.

---

## 20. Open decisions (resolve as they come up, record here)

- Final material names per element (§2.2 lists worldbuilding candidates).
- Does the gold-border completion frame animate (§9)?
- Do boots and off-hand get full world-sprite treatment on the character, or icon-only at
  first (§9.1)?
- Heaven/holy: confirmed reusing the `#fde047` lightning family, no new element (§6) — ok?
- Per-circle and per-Tower-tier monster rosters beyond the sketches in §10.
- Affix glyph final icon set (§10.3) — needs a pass once the affix list is locked.
- Raid boss count and which myths for launch (§11.4).
