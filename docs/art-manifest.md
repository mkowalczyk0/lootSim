# Art Manifest — the complete art backlog

This is the inventory for a dedicated art session to work through, one row at a time,
without re-reading the codebase or the worldbuilding doc first. Everything here was
**derived from the code that is live on `master` today** (446b44d, the raid merge) —
`src/data/*.ts` and `src/render/atlas/manifest.ts` say what needs art and what already
has it; `docs/game_story_worldbuilding.md` (the tiebreaker on any naming/identity
question) and `docs/art-style-guide.md` (the operational visual spec, derived from the
worldbuilding doc) say what each thing *is*. Where the two disagree, the worldbuilding
doc wins.

**This document does not generate art.** It is research and prioritisation only.

## 0. How to use this document

1. Work the queue in §1 top to bottom. Each row names the exact file(s) to open.
2. Before authoring anything, re-read `docs/art-style-guide.md` §1–§2 (pillars, palette)
   and §17 (resolution, naming, pipeline) — this manifest doesn't repeat those rules.
3. **Author at higher resolution, close to 1:1. Do not downscale into a tiny grid.**
   This reverses the old "smaller is better" rule (see the style guide §1.3 and the
   `lootsim-art-direction-and-cosmetics` memory) — the owner compared both and chose the
   larger, un-downscaled art. World footprint (collision, hitboxes, telegraph radii) is
   fixed by the simulation and must never move; every pipeline sprite carries its own
   `worldScale` in `render/atlas/manifest.ts` to land on the same footprint its
   procedural or borrowed predecessor had.
4. **One hot accent per monster/boss** — the only bright, saturated colour is the part
   looking at you. Everything else stays low and dirty. The hero is the opposite (plain,
   calm, no hot accent) and is being reworked in a **separate** track — don't scope hero
   art here beyond the pointer in §7.
5. When a row says "reskin", it means: borrow the kit/sprite/silhouette of the named
   template and only re-theme it (name, element, palette wash, title) — this is a
   deliberate, load-bearing pattern in this codebase (`planetBossSpec`, `legendBossSpec`,
   `raidBossSpec`, biome `enemyNames`), not a shortcut being invented here. Don't author
   a fresh silhouette where a reskin is what the design calls for.
6. After landing a batch, update the "status" column in the relevant table below and the
   commit message — this document is the durable record other sessions read next.

---

## 1. Priority queue

Ordered by the owner's stated priority (bosses/raids first, then enemies, then named
items) crossed with what actually has zero art today. **Section A is genuinely urgent**:
raids just merged to master and shipped with *no* art of their own anywhere — every
raid boss, every raid-exclusive named item, relic and artifact is currently invisible
or a reskin with no visual identity.

| # | What | Why it's here | Section |
|---|---|---|---|
| 1 | **Raid content art** — the 4 raid boss silhouettes are **done** (§2.1); still open: 8 raid named items + 8 raid relics/artifacts have no icon, 1 raid arena has no tileset | Just shipped (446b44d); "the bosses are one of the main attractions" and raids are the newest, highest-profile boss content in the game | §2 |
| 2 | **6 of 11 monster archetypes have no sprite of their own** — charger/bomber/shieldbearer/summoner/sniper/leech literally redraw an unrelated archetype's silhouette (`render/draw.ts` `ENEMY_SPRITES`) | Directly violates the style guide's own §1.5 rule ("a sniper is not a recoloured grunt — it is a different shape"); this is the single highest-leverage monster-art gap in the game | §3 |
| 3 | **The Tower's monsters are re-labelled Hell monsters** — a "Gate Cherub" draws the identical rot-imp/bone-archer/iron-brute sprite Hell uses, just renamed | Heaven is a distinct visual force (§1.2 of the style guide) with zero pixels of its own yet; an open decision, not a queued task — see §4 | §4 |
| 4 | **Named items and relics/artifacts (non-raid)** — fully authored, nothing to do | Already complete; listed for completeness only | §5 |
| 5 | **Affix glyphs** — 16 affixes render as Unicode text characters, not the 8×8 pixel icons the style guide specifies | Real but low-severity: it works today, just isn't bespoke pixel art | §6 |
| 6 | **Cosmetics** — 16 of 40 wardrobe items still procedural-grid-only | Powerless vanity content; lowest gameplay stakes | §7 |
| 7 | **Environments** — the Tower's 3 tilesets are **done**; the Avarice Rift still has no distinct visual identity | Floors are playable and correctly coloured without these; purely a "doesn't look distinct yet" gap | §8 |

Everything not listed above (hero, all 5 floor bosses, all 5 core monster silhouettes,
all 14 weapons, 10 equipment/currency icons, 17 props, 12 Delve+Reliquary tilesets, the
hub scene, all 12 original relics + 19 original artifacts, all 11 original named items)
**already has committed, wired art**. Don't regenerate it. §9 is the full "already done"
ledger, for cross-reference only.

---

## 2. Section A — Raids (P0)

Source: `src/data/raids.ts`, `src/data/named.ts` (the 8 `raid`-sourced entries),
`src/data/relics.ts` (the 8 `raid`-sourced entries). All four raids merged in 446b44d
with **zero new art** — everything below reuses an existing sprite/icon or falls back to
a generic glyph.

### 2.1 Raid boss identity — **DONE** (branch `art/raid-bosses`)

**Resolved.** All four raid bosses now have bespoke art and their own silhouette.

The fix was not only art: `RaidSpec` gained a `sprite` field and `raidBossSpec` no longer
inherits the template's. The borrow was always meant to be cheap *kit* reuse — the
`planetBossSpec` precedent it copies already overrides `id`/`name`/`title`/`element` for
exactly this reason — so silhouette missing from that list was an omission, not a design.
New art alone would not have fixed it, because the borrow lived in the spec.

| Raid | Sprite (`SpriteName` -> atlas id) | Native px | `worldScale` | World height (unchanged) |
|---|---|---|---|---|
| The Ferryman | `bossFerryman` -> `boss.ferryman` | 75x107 | 0.9318 | 99.7 (was `boss.warden`) |
| Queen of the Seventh Circle | `bossWarQueen` -> `boss.war-queen` | 98x108 | 1.0185 | 110.0 (was `boss.herald-unspoken`) |
| Minotaur of the Ninth Labyrinth | `bossLabyrinth` -> `boss.labyrinth-minotaur` | 102x106 | 1.2642 | 134.0 (was `boss.gravebound-colossus`) |
| Tyrant of the First Heavens | `bossTyrant` -> `boss.exiled-tyrant` | 100x103 | 0.9738 | 100.3 (was `boss.corrupted-saint`) |

Each `worldScale` is `targetWorldHeight / h`, where the target is the world height the
encounter already had while borrowing — telegraph radii, arena sizing and camera framing
are tuned against those numbers, so none of them moved. `art/bosses/finish.ts` rebuilds
every PNG from its `.raw.png` and prints these rows.

**Also authored: four 26x26 procedural fallback grids** (`BOSS_FERRYMAN` /
`BOSS_WARQUEEN` / `BOSS_LABYRINTH` / `BOSS_TYRANT` in `render/pixels.ts`). These are not
optional: `BossSpec.sprite` is a closed union and `buildSprites` is an exhaustive Record,
so a new boss sprite needs a grid as well as a PNG — and the grid is what `npm run art`
contact-sheets and what the fallback ladder shows if a PNG ever fails to load.

**Two findings worth carrying forward** (the palette one is now also in the style guide
under §1.4, as a prompting rule):
- PixelLab biases hard toward clean heroic armour. Both armoured subjects came back bright
  and polished on the first pass, the Queen with a saturated red plume — a *second* hot
  colour, which §1.4 forbids. Clamp it explicitly in the prompt for any armoured subject.
- Measure the accent rather than eyeballing it. The Queen's rival red still outnumbered her
  ember 362px to 55 after a successful re-prompt; `muteRivalHue` in `finish.ts` pulled 293
  of those to dried blood. The Tyrant came back with no lit region at all and had its accent
  painted in by `hotAccent`.

*The original finding, for the record:*

Every raid boss (`raidBossSpec` in `raids.ts`) borrowed a template's sprite wholesale via
`SPRITE_OVERRIDES` — same PNG, same silhouette, only name/title/element and its ability
*rotation* changed. Concretely:

| Raid | Borrows sprite of | Element | Arena tileset |
|---|---|---|---|
| Tyrant of the First Heavens | `boss.corrupted-saint` (Choir) | holy | none — flat fill (no Heaven tileset exists yet) |
| Minotaur of the Ninth Labyrinth | `boss.gravebound-colossus` (Colossus) | void | `tiles.delve-veil` (The Veil, reused) |
| The Ferryman | `boss.warden` (Warden) | cold | `tiles.delve-cave` (Dark Cave, reused) |
| Queen of the Seventh Circle | `boss.herald-unspoken` (Herald) | fire | `tiles.delve-heresy` (Dragon's Lair, reused) |

**This is consistent with the codebase's own reskin pattern** (identical to how
`planetBossSpec` and `legendBossSpec` work) and is *not* automatically a bug — but it
means a player currently cannot tell "Queen of the Seventh Circle" apart from an
ordinary depth-16-20 Herald fight by silhouette alone, only by the name plate and the
signature abilities added to its rotation. Given the owner's own words ("the bosses are
one of the main attractions to the game") and that a raid is explicitly billed as "an
enormous mythological event" (worldbuilding doc, RAID BOSSES), **this is the single
highest-value item in the whole backlog**: four bespoke raid boss sprites, at the
"raid/floor boss" native size (~48–72 tall, style guide §17.1), each its own
`ATLAS`/`SPRITE_OVERRIDES` row keyed `raid-<id>` (see `raidBossId()` in `raids.ts`).

| Boss | Element / hot accent | One line of identity (from `raids.ts` lore) |
|---|---|---|
| Tyrant of the First Heavens | holy / `#fde047` | A cast-out celestial warlord and the armies that agreed with it — Heaven's own weaponry, serial numbers filed off. Composite per the doc: a fallen celestial general, not a copy of any one angel. |
| Minotaur of the Ninth Labyrinth | void / `#c084fc` | Every labyrinth humanity ever built, folded into one body, held together by the Abyss's unmaking logic (broken perspective, geometry that doesn't close). |
| The Ferryman | cold / `#7dd3fc` | A corrupted Charon poling a boat through three collapsing realms at once — should read as *drowned/ancient*, not demonic. |
| Queen of the Seventh Circle | fire / `#ff7a2f` | A war goddess assembled from overlapping mortal prayers (Ishtar/Sekhmet/Morrigan/Bellona/Athena per the doc) — a composite, not a costume of one figure. |

**Recommendation if the queue must be trimmed further: do this row and skip everything
else in §2 for now.** A raid boss with its own silhouette is worth more than eight small
icons nobody has farmed yet.

### 2.2 Raid-exclusive named items (8) — no icon, falls to type-icon fallback

Same pipeline as the original 11 named items (`docs/item-art-inventory.md` §2), same
size class (icons, 20–45px, transparent bg, rarity frame is CSS chrome — not baked in).
Add one `ATLAS` row each, `named.<id>`, PNG under `src/render/atlas/items/named/`.

| Item | Rarity | Type | Raid | Identity (from `named.ts` flavor/description) |
|---|---|---|---|---|
| Heaven's Severance | mythic | sword | Tyrant of the First Heavens | A holy sword that cuts through and hits what's behind — clean, bright, weaponised order |
| Crown of the Exiled | divine | necklace | Tyrant of the First Heavens (tier 6+) | Still a crown, ruling nothing — should read as broken/hollow regalia, not triumphant |
| The Ninefold Horn | mythic | talisman | Minotaur of the Ninth Labyrinth | Nine horns grown into one — void, corridors-that-shouldn't-connect motif |
| Hide of the Ninth Labyrinth | divine | armor | Minotaur of the Ninth Labyrinth (tier 6+) | Enormously heavy hide with corridors *in* it — unsettling, not just armor-shaped |
| The Last Fare | legendary | necklace | The Ferryman | Cold, cheap, patient — a coin/toll motif, Ferryman's fare |
| Pole of the Three Rivers | mythic | spear | The Ferryman (tier 4+) | A long pole that's touched the bottom of all three rivers — ice/cold-water reach |
| The War-Queen's Reach | mythic | whip | Queen of the Seventh Circle | Burns and keeps burning — a war-goddess's weapon, fire |
| Edict of the Seventh Circle | divine | gloves | Queen of the Seventh Circle (tier 5+) | Violence codified — gauntlets that reward aggression, fire accent |

### 2.3 Raid relics (4) and artifacts (4) — no icon, falls to tier glyph

Same pipeline as the original 12 relics/19 artifacts. Add `relic.<id>` rows, PNG under
`src/render/atlas/relics/`. `worldScale`/`feet` can copy the sibling `icon.gem` values
like every other relic row does.

| Item | Tier | Raid | Identity |
|---|---|---|---|
| Spark of the Tyrant | relic | Tyrant of the First Heavens (tier 4+) | What was left when Heaven took the rest back — a shard of celestial fire/lightning |
| Thread of the Labyrinth | relic | Minotaur of the Ninth Labyrinth (tier 4+) | A thread that leads out *and* in — void, maze-thread motif |
| The Ferryman's Toll | relic | The Ferryman (tier 3+) | A coin that pays the crossing — cold, toll/obol motif (distinct from Obol of the Three Rivers below — that one's an artifact, this is the relic) |
| The Seventh Crown | relic | Queen of the Seventh Circle (tier 4+) | Worn by a war nobody won — fire, a battered crown |
| Shard of a Broken Throne | artifact | Tyrant of the First Heavens | The part that came off a Throne (living law) sitting down — holy, geometric fragment |
| Bronze of the Ninth Gate | artifact | Minotaur of the Ninth Labyrinth | The last door of the maze, gone through rather than opened — void/bronze plating |
| Obol of the Three Rivers | artifact | The Ferryman | Small, cold, accepted everywhere — a coin, cold accent |
| Standard of the Seventh Circle | artifact | Queen of the Seventh Circle | A war banner for an army with no front left — fire, tattered standard |

### 2.4 Raid arena — the one missing tileset

The First Heavens (Tyrant's arena) has no `tileset` set on its `BiomeStyle`
(`THE_FIRST_HEAVENS` in `raids.ts`) because no Heaven-palette tileset has been painted
yet — it falls back to the flat `bakeFloor` fill, same documented state as the Tower.
Painting `tiles.tower-lower`-style bone-gold stone (see §4/§8) would fix this arena too,
since both want the same Heaven palette (§6 of the style guide: `#d8cfa8` bone-gold,
`#8a7d54` shadow, `#f4ecc9` highlight, `#fde047` divine accent).

---

## 3. Section B — Monster archetypes (P0/P1)

Source: `src/data/enemies.ts` (`ARCHETYPES`, the 11 non-boss `EnemyKind`s) and
`src/render/draw.ts` (`ENEMY_SPRITES`, the current sprite mapping — read this file, the
mapping comment says it out loud: *"reuse the closest existing silhouette until the art
pipeline lands bespoke ones — mapped by combat shape, not by name"*).

### 3.1 What has a bespoke sprite today (5 of 11)

| Archetype | Sprite | Status |
|---|---|---|
| grunt | `reliquary.monster.rot-imp` | done |
| archer | `reliquary.monster.bone-archer` | done |
| brute | `reliquary.monster.iron-brute` | done |
| caster | `reliquary.monster.cult-caster` | done |
| swarmer | `reliquary.monster.rot-scuttler` | done |

### 3.2 What borrows another archetype's silhouette today (6 of 11) — the gap

| Archetype | Currently draws as | Behaviour (from `enemies.ts`) | Element / hot accent | Silhouette language wanted (style guide §10.2) |
|---|---|---|---|---|
| **charger** (Gorehound) | grunt (rot-imp) | winds up, dashes a line, long punishable recovery | physical / neutral | Horns/ram forward, braced back legs, a visible wind-up crouch pose |
| **bomber** (Bloatfiend) | swarmer (rot-scuttler) | rushes in, detonates, leaves a pool | poison / `#84cc16` | Round, swollen, cracked skin showing the hot accent glowing *through* the body — it should telegraph its own death before it happens |
| **shieldbearer** (Aegis Thrall) | brute (iron-brute) | shrugs off frontal hits, must be flanked | physical / neutral | Asymmetric — a slab of cover on one side; the shield should be its own recolourable sub-sprite (matters for elite/infusion palette-swaps later) |
| **summoner** (Grave Piper) | caster (cult-caster) | hangs back, feeds the floor bodies, priority kill | void / `#c084fc` | Robed, raised arms, a satchel/egg-sac silhouette; hangs back — should read as "kill this first" at a glance |
| **sniper** (Deadeye) | archer (bone-archer) | very long telegraph and reach, forces cover | lightning / `#fde047` | Tall, still, one oversized arm/eye/barrel; a visible aim-line is part of its own kit, so the sprite should support a held aiming pose |
| **leech** (Rot Priest) | caster (cult-caster) | heals wounded allies on a timer | poison / `#84cc16` | Thin, floating; support/healer language — a tether visual to whatever it's buffing is a `fx.ts` concern, but the body itself should read as "not a threat, a priority" |

**Sizing**: match the existing 5 (native ~24–48 tall depending on role — sniper/summoner
taller and stiller, bomber/charger squat and low, per style guide §17.1's small/crawling
vs. humanoid split). `minDepth` in `enemies.ts` tells you how deep a role first appears
(charger 9, bomber 10, shieldbearer 8, summoner 10, sniper 13, leech 10) — none of these
are Surface-band monsters, so author them with the Deep Delve's grimier palette in mind
rather than the Training Grounds' cleaner one.

### 3.3 Reskins are not new authoring — this is the whole count

Once these 6 bespoke silhouettes exist, **that is the entire monster-art backlog for the
Delve, the Reliquary and the Tower.** `biomeFor` gives each Delve circle and each
Reliquary sector its own `enemyNames` flavor text (a "Gorehound" reads as something else
per biome) but the same 11 silhouettes fight the same 11 ways everywhere — this is
explicit, load-bearing design (`data/biomes.ts` header: *"Same eleven archetypes
fighting the same eleven ways underneath. This is a name."*). **Do not author a second
set of monster sprites per biome or per sector.** The only exception under discussion is
the Tower — see §4.

Elites and elemental infusions are palette-swaps of these same 11 base silhouettes
(`tinted()` in `render/sprites.ts`), already working end-to-end. Nothing new to author
there either.

**The Reliquary question was asked and closed (Sept 2026).** `manifest.ts`'s own
`SHARED_MONSTER_SETS` comment used to say the opposite of this section — that the
Reliquary "should eventually diverge" into per-sector monster rosters — which was a real
contradiction sitting in the repo, caught when an art session was asked to scope exactly
that and stopped rather than pick a side. The ruling stands with this section, and the
citation is the worldbuilding doc itself: every one of the nine Reliquary sectors in
`docs/game_story_worldbuilding.md` is described purely as a *place* (architecture,
terrain, what's embedded in the walls) and is silent on what walks around in it. Each
sector's one labelled differentiator — "Fire-heavy", "Cold-heavy", "Void-heavy", ... —
names the elemental-infusion lever this section already declares sufficient, not a
monster population. `manifest.ts`'s comment has been corrected to match. **Do not reopen
this a third time** without a new source — a production-cost argument alone doesn't
clear the bar this section and the worldbuilding doc both already set.

**Open finding, recorded rather than fixed: the three newest sectors have no visual
escalation at all.** Gilded Ossuary, Unbound Spire and Hollow Orchard (§8.2 of the style
guide) sit at `infusionChance`'s 65% cap from `baseDepth` — tier 1, floor 1 — because
their base depths (34/39/44) are already past the depth-22 point the cap saturates at.
Every other lever a sector has to read as itself (tileset, props, `enemyNames`) is static
per sector too, so descending one of these three all the way down looks identical the
whole way — no deepening, no ramp, unlike the Delve's own depth curve a player has
already learned to expect. Correct under this section's own ruling (a sector is a place,
not a ladder) and not something this pass changed on purpose or by accident — but nobody
has decided it on purpose either, and it reads as a bug to a player who's played the
Delve first. Worth an owner call at some point; not blocking anything today.

---

## 4. Section C — the Tower's monster identity (open decision, not a queued task)

The Tower (`src/data/tower.ts`) renames the same 11 archetypes to celestial-hierarchy
names per band (`enemyNames` on `LOWER_TOWER`/`MID_TOWER`/`UPPER_HEAVEN` — e.g. `archer`
→ "Gate Cherub" → "Virtue Lancer" → "Lance of Correction" as you climb) but **draws them
with the identical Hell/Reliquary sprites** (`rot-imp`, `bone-archer`, `iron-brute`,
`cult-caster`, `rot-scuttler`) — there is no separate `SPRITE_OVERRIDES` entry keyed by
realm, only by `EnemyKind`. A "Gate Cherub" is pixel-for-pixel the same rotten imp a
Hell floor spawns.

This is a real visual identity gap — Heaven and Hell are supposed to be opposite visual
logics (style guide §1.2: Hell is "asymmetric mass, iron + ember, spikes"; Heaven is
"rigid symmetry, gold + bone-white, repeated geometry") — but **resolving it is an
authoring-scale decision the art agent should raise with the owner before starting**,
not something to solve unilaterally, because it has two very different costs:

- **Cheapest**: a single palette-swap pass — recolour the 11 existing silhouettes toward
  bone-gold/holy per `towerBiomeFor`'s tint, the same `tinted()` mechanism elemental
  infusion already uses. Keeps "same 11 shapes" literally true, costs ~zero new
  authoring, but a recoloured demon silhouette may still not read as "celestial."
- **Full treatment**: 11 bespoke Heaven-silhouette archetypes (armoured, geometric,
  winged where appropriate) mirroring §3's Hell backlog exactly. Doubles the total
  monster-art backlog, but is the only way "Powers/Thrones/Dominions" actually look like
  the celestial hierarchy rather than reskinned Hell monsters.

Do not start either without a decision. If forced to guess, the palette-swap path is
consistent with how the rest of the reuse pattern in this codebase works, but the raid
boss question in §2.1 sets a precedent the other way (bespoke pixels for a headline
Heaven encounter) — flag the tension rather than resolving it.

---

## 5. Section D — named items, relics & artifacts outside raids

**Nothing to do.** All 11 non-raid named items and all 12 non-raid relics + 19 non-raid
artifacts are fully authored, committed, and wired (verified against
`src/render/atlas/manifest.ts` and the PNGs actually on disk under
`src/render/atlas/items/named/` and `src/render/atlas/relics/`). See §9.1/§9.2 for the
full ledger. `docs/item-art-inventory.md`'s "only 3 samples done" note is **stale** — the
remaining 8 were completed after that doc was written; this manifest supersedes it for
inventory purposes (the doc's pipeline *recipe* in its §2 is still the right process to
follow for §2.2's raid items).

One open question carried over from that doc, still unresolved: **named weapons render
their icon correctly but swing in combat as an ordinary rarity-tinted family weapon** —
`Threshold Brand` looks right in your stash and wrong in your hand mid-fight. Fixing
this means a full greyscale +x weapon-skin sprite per named weapon (a materially bigger
asset than an icon), which `docs/item-art-inventory.md` §5 already flagged as needing an
explicit owner call. Threshold Brand (sword) and, after §2.2, Heaven's Severance
(sword), Pole of the Three Rivers (spear) and The War-Queen's Reach (whip) would all
want this if the owner says yes.

---

## 6. Section E — affix glyphs (16, currently text characters)

Source: `src/data/monster-affixes.ts`. Every affix has a `visual.tint` (a real hex, used
today) and a `visual.glyph` that is a bare Unicode character (`▪ ◇ ✦ » ☣ ⚡ ✧ ⋔ ✑ ↓ ✂ ❥ ✺
☁ ✷ ✚`), not the 8×8 pixel icon the style guide specifies (§17.1 table, §10.3). This
works today — it's readable, it isn't broken — so it's real but genuinely low-severity.

| Affix | Bucket | Tier | Current glyph | Tint |
|---|---|---|---|---|
| stony (Armored) | defensive | lesser | ▪ | `#9aa4b2` |
| warded (Warded) | defensive | greater | ◇ | `#7dd3fc` |
| *(13 more — read `MONSTER_AFFIXES` in `monster-affixes.ts` for the full list, ids and descriptions)* | | | | |

Author 16 flat 8×8 icons matching each glyph's current silhouette intent (a shield for
defensive, a burst for offensive, etc. — the existing Unicode choices already encode the
intended shape, e.g. `☣` for a caustic/poison affix, `⚡` for the arc/shock one) and wire
them as a small new atlas table (no precedent table exists yet for 8×8 glyphs — this is
the first one, so it needs its own `AffixGlyph`-shaped entry, not a reuse of
`AtlasSprite`). Low priority relative to §2/§3.

---

## 7. Section F — cosmetics (16 of 40 wardrobe items remain procedural)

Source: `src/data/cosmetics.ts` (`COSMETICS`) and `src/render/atlas/manifest.ts`
(`ATLAS_COSMETICS`). Powerless vanity content — lowest gameplay stakes in this whole
manifest, and the hero base itself is out of scope here (separate rework track).

**Migrated (8 unique grids, done):** `hatWitch`, `hatCrown` (shared by `hatUnspoken`),
`earsCat`, `earsHorn`, `faceGlasses`, `faceVisor`, `cape` (backCape), `wingsAngel`
(backAngel).

**Not migrated (16 unique grids remain), by slot:**

| Slot | Remaining ids |
|---|---|
| hat (6) | hatStraw, hatBeanie, hatChef, hatFlower, hatTop, hatHalo |
| ears (3) | earsBunny, earsFox, earsAntenna |
| face (3) | faceBlush, faceEyepatch, faceFangs |
| back (4) | backTail (tailCat), backMoth (wingsButterfly), backTome (tome), backDemon (wingsDemon) |

Follow the exact recipe already proven on the 8 migrated ones (style guide §17.5): a
PixelLab generation quantized onto `[ink, colors[0], colors[1], colors[2]]`, then
`replace_color`'d onto the three reserved marker RGBs (`COSMETIC_MARK_1/2/3`), composited
onto `HERO_STAGE_W`×`HERO_STAGE_H` at a placement tuned the same way the existing 8 were.
Each `Cosmetic` entry in `cosmetics.ts` already gives you the id, slot, rarity and
default `colors` to prompt from.

**Two items explicitly out of scope for this pass** (per the style guide, not this
document's call): the 6 aura types (`auraSakura`/`auraEmber`/etc.) are particle behaviour
in `render/fx.ts`, not sprites — nothing to author here. The 7 weapon skins
(`skinBone`…`skinStar`) need an engineering change first (`WeaponPalette` has 4 colour
regions vs. the cosmetic system's 3-marker convention) before art can land — flag to the
owner, don't start authoring. The 5 hairstyles are an open question, not a backlog item:
`hero.legend-base` bakes its one hairstyle into a single flat image, so a swappable hair
*shape* means redrawing the hero base without baked-in hair — bundle this with the
separate hero-rework track (see `lootsim-art-direction-and-cosmetics` memory), not here.

---

## 8. Section G — environments (Tower unpainted; Avarice Rift undifferentiated)

Source: `src/data/tower.ts`, `src/render/atlas/manifest.ts` (`TILESETS`), `src/data/modes.ts`.

- **The Tower's 3 tilesets are painted — DONE** (branch `art/tower-tilesets`).
  `tiles.tower-lower`, `tiles.tower-mid` and `tiles.tower-upper` are committed and wired
  into `TILESETS`. **The wall is Heaven's lit surface, not the floor** — the reasoning is
  in the style guide §17.7 and the `data/tower.ts` header, and it is the opposite of the
  "Heaven = white and gold ground" instinct: holy-infused monsters measure L94-108, so a
  floor clears §17.7's 28-luminance bar either under L66 or over L136, and the upper
  window is 14 points wide under the L150 ceiling against the lower one's 66. A bespoke
  celestial roster (§4 below, still open) can only be *brighter* than the borrowed Hell
  sprites, which narrows the bright window further and never the dark one — so the dark
  floor is the direction that survives §4 whichever way it goes.

  | Band | graded floor | graded wall | floor↔wall | wall chroma |
  |---|---|---|---|---|
  | The Lower Tower | L39 | L120 | 80 | 18 (gold) |
  | The Seamless Halls | L33 | L143 | 110 | 4 (ivory) |
  | The Blinding Heights | L29 | L143 | 114 | 1 (cold white) |

  All four axes move one way as you climb: the ground darkens, the glare brightens, the
  gap widens, the warmth drains. The top two bands' walls are the same luminance because
  §17.7's L150 ceiling is right above them — up there the bands separate by hue and by
  floor, not by wall brightness. **The three band tints moved as part of this** (`#8a7d54`
  / `#a89f7e` / `#cfc9b0` → `#42310f` / `#2f2b1f` / `#232630`): a `tint` authored as the
  flat-bake fill becomes a 30% wash once a sheet exists, and at L200 the old Blinding
  Heights tint alone graded a pure black floor to L60 — inside the collision band before
  any art existed. §6's bone-gold and near-white stayed on `wall` / `wallSide` / `accent`.

  Painting `tiles.tower-lower` also gives the First Heavens raid arena (§2.4) a floor,
  since both want the same Heaven-base palette.

  **What this does not fix, and it will be the first thing anyone notices:** the Tower's
  monsters are still §4's re-labelled Hell sprites. A properly celestial floor with Hell's
  monsters standing on it is a *known* intermediate state, ordered this way deliberately
  because the owner has seen the untextured floors and §4 is still theirs to answer.
- **The Avarice Rift has no tileset override** (`hoard` in `modes.ts` sets no
  `tileset`, unlike the Abyssal Rift's `tiles.abyss`), so it currently just shows
  whatever ordinary Delve biome its effective depth would anyway — it doesn't yet read
  as "Circle IV: hoarded gold, piled loot, swarms" (style guide §5, §3). Lower priority
  than the Tower (the Abyssal Rift shipped its own look; the Avarice Rift is the one
  standard-progression mode still borrowing someone else's floor).
- **The Citadel's tiled rung is now painted** — `tiles.citadel` (ash-black flagstone
  under pale bone-white collage masonry, §4/§17.7) is wired into `TILESETS`, so the hub
  promotes off the flat bake and off the frozen `hub.citadel-deck` painting the moment it
  loads. The seven station relics and five dressing pieces `STATION_PROP`/
  `DECK_DRESSING` (`game/deck.ts`) name are all committed too
  (`prop.citadel-*` — see the ledger below), so the tiled rung no longer draws six
  identical terminals with different words under them. The eight dressing placements on
  the deck's text grid are still a blind first arrangement — nobody has looked at them
  rendered yet.

---

## 9. Appendix — the complete "already done" ledger

For cross-reference only; verified against both `src/render/atlas/manifest.ts` and the
actual committed PNGs under `src/render/atlas/` at 446b44d.

| Category | Count | Notes |
|---|---|---|
| Hero | 1 | `hero.legend-base` — v3 redraw, separate rework track in progress |
| Core monster silhouettes | 5 of 11 | grunt/archer/brute/caster/swarmer — see §3 for the missing 6 |
| Floor/raid-template bosses | 5 of 5 | warden/choir/colossus/herald/nameless — raids/Proving/Tower all reskin these; see §2.1/§4 |
| Weapon families | 14 of 14 | all done, greyscale +x, rarity-tinted at draw time |
| Equipment/currency icons | 10 of 10 | armor/shield/ring/gloves/necklace + coin/key/potion/gem/capsule |
| Named items | 11 of 19 | the 8 raid-exclusives are the gap — §2.2 |
| Relics | 12 of 16 | the 4 raid relics are the gap — §2.3 |
| Artifacts | 19 of 23 | the 4 raid artifacts are the gap — §2.3 |
| Props (dungeon dressing) | 17 of 17 | 6 generic + 6 Delve set-pieces + 5 Reliquary set-pieces |
| Delve tilesets | 6 of 6 | one per circle band |
| Reliquary tilesets | 6 of 6 | one per sector |
| Abyssal Rift tileset | 1 of 1 | `tiles.abyss` |
| Tower tilesets | 0 of 3 | unpainted — §8 |
| Citadel tileset | 1 of 1 | `tiles.citadel` — tiled rung, §8 |
| Citadel props (station relics + dressing) | 12 of 12 | `prop.citadel-*` — the tiled rung's own relics, §8 |
| Cosmetics (hat/ears/face/back) | 8 of 24 unique grids | §7 |
| Affix glyphs | 0 of 16 as pixel art (16 as Unicode text) | §6 |
| Hub scene | 1 of 1 | `hub.citadel-deck`, stations baked in |

---

## 10. Keeping this document current

Update it in the same commit as any art landing, not as a follow-up:

- Move a completed row out of its backlog table and into §9, or mark it "done" in place.
- If a new content pass adds monsters/bosses/items (a new raid, a new class, a new
  relic wave), add its rows here before or alongside the code — this is meant to stay
  ahead of an art agent's need, not trail it.
- If §2.1 or §4's open decisions get resolved by the owner, record the decision and the
  reasoning here so the next session doesn't re-ask.
