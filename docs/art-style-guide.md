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
- `hero.legend-base` → the composed player, **while no cosmetic layer (hat/ears/face/back)
  is worn** — a decorated character still gets the procedural stack until the cosmetic
  layers get their own art pass. 8 PixelLab rotations are archived under
  `art/characters/` for the eventual animation runtime; only `south` is wired.
- All six weapon families (`ATLAS_WEAPONS` in `manifest.ts`, PNGs under `atlas/weapons/`).
  Authored greyscale +x; `weaponSprite` tints the loaded PNG toward the rarity colour at
  draw time. A cosmetic weapon **skin** still falls back to the procedural grid.

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
