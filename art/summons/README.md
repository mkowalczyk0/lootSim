# Summon sprites (docket §36, art-wave 2) — the plan and the first pass

**State: 21 raw generations on disk, none finished, none wired.** Nothing here is in
`ATLAS` yet and the game still draws every summon as the element-tinted triangle.
This file exists so the plan survives the session that made it.

## What is being drawn, and what is not

The owner chose **bespoke bodies for every creature summon** over four shared families
(see `docs/art-wave-2.md` and the `lootsim-art-direction-and-cosmetics` memory). There
are 27 summon `unit` ids in the game (`SUMMON_UNITS`, f1's data walk, not committed at
time of writing — it lives in `~/Desktop/lootSim-worktrees/summon-sprites/src/data/summons.ts`).
Six are **player copies** and draw the summoning hero's own composed sprite, so they get no
art: `mirror_image`, `monk_afterimage`, `trickster_decoy`, `trickster_mirror`,
`trickster_mirror_self`, `trickster_lure`. `decoy_husk` is *not* in that set on purpose —
its text says "a decaying duplicate of yourself", but the owner chose bespoke bodies, so
it is drawn as a rotting husk in plain adventurer clothes.

The remaining **21** are here. Atlas id is `summon.<unit-id-hyphenated>`, PNG under
`src/render/atlas/summons/`, **one south pose**, mirrored by facing (f1's seam:
`render/minionart.ts` → `SUMMON_UNIT_ART` → `ATLAS`; triangle stays as the fallback rung).

## Three decisions already agreed with the seam owner (f1)

1. **Ownership.** This branch commits PNGs and `ATLAS` rows only. `SUMMON_UNIT_ART` (the
   unit→id table) is f1's and uncommitted; whichever branch lands second fills its nulls,
   one line per unit, in the same change as nothing else. Do not declare an id in `ATLAS`
   before its PNG is committed (the Tower-tileset rule — a row with no file fails smoke).
2. **No hot accent on a summon.** The hot accent is the monsters' "it sees you" signal and
   the hero carries none (`npm run chroma`). Every summon is authored low and mostly
   desaturated with **no accent**, so the renderer's 0.25–0.35 element tint is the only
   saturated thing on it — that is what keeps saying "mine, and my element", which the
   docket requires to survive. **Nothing enforces this mechanically today**: `chroma.ts`'s
   scope (`boss.*`, `tower.boss.*`, `/\.monster\./`) doesn't match `summon.*`. Whether to
   add a "summon has zero hot pixels after finishing" check is a scope decision for the PM,
   flagged, not taken.
3. **World heights** against the hero's 32 world units (every minion has collision radius
   7, `Dungeon.MINION_RADIUS`, and §37 confirmed it adds no per-unit radii or units):
   risen-dead bipeds 24–26; wraith/shade floaters 24 with `feet` up inside the hem like
   the cult caster; turrets/pods/generator 18–20; repair drone 14 (floating); siege engine
   30 (the one bulky exception, still under the hero); wolf ~18 tall; falcon/hawk 14
   (flying); healing spirit 12; healing bloom 16 (rooted). Density target: the roster's
   ~4x band on `npm run inworld` (`worldScale = targetWorldHeight / trimmed h`).

## Generator mode per family — and why (style guide §17.8)

`create_character` standard mode poses onto a fixed skeleton template. It renders an
upright biped or a template quadruped at rest well and **cannot pose or draw a non-skeletal
body** — this cost two rejections in §1a (Grave Piper and Rot Priest came back as hooded
caster clones). So:

| Family | Units | Mode | Reason |
| --- | --- | --- | --- |
| Risen dead, upright | skeleton_warrior, grave_guard, blood_servant, decoy_husk, ghost_deckhand | `create_character` standard, size 48 (guard 56) | rest-pose bipeds; 8 rotations come free, south is used |
| Risen dead, floating | reaped_wraith, limbo_shade, kept_name | `create_image_pixflux` south | no legs / dissolving hem — no skeleton to pose onto |
| Constructs | auto_turret, bone_turret, mortar_pod, shield_generator, repair_drone, siege_engine | `create_image_pixflux` south | non-skeletal |
| Beast | spirit_wolf | `create_character` `quadruped`/`dog`, size 48 | same route as the Gore-Hound |
| Spirits & birds | falcon, spirit_hawk, moon_guardian, elder_spirit, healing_spirit, healing_bloom | `create_image_pixflux` south (birds `high top-down`, wings spread) | flying / floating / rooted, no skeleton |

Common settings: `low top-down`, `basic shading`, `single color black outline`,
`medium detail` (`low detail` for the 32px bodies), `no_background`, `direction: south`.
Every prompt says "no glow, no bright colours, muted desaturated palette" and gives the
eyes as "hollow / dark / no glow" — PixelLab defaults undead to glowing eyes, which would
be a hot accent.

## First pass — 21 generations, all on disk, unjudged at zoom

Rigged (`rotations/summon.<name>.<dir>.raw.png`, all 8 dirs archived; south is the one
that ships). Character ids on PixelLab, for reference or a `create_character_state`:

| unit | canvas | character id |
| --- | --- | --- |
| skeleton_warrior | 68 | ed4fc59e-6ba7-49c7-ac4f-c37f244291e6 |
| grave_guard | 80 | b88759fd-d794-430c-b1f9-3f527590a752 |
| blood_servant | 68 | a8ce6575-e40e-4c25-b884-6c5494b77d29 |
| decoy_husk | 68 | 5c68a5d7-e341-4888-8cbb-1dc5778c9760 |
| ghost_deckhand | 68 | 15b4eb2a-4579-4c9f-9a1b-3120f2a22c76 |
| spirit_wolf | 68 | 7d2bda1c-da2a-47f1-93e4-649970a4dcb1 |

Free-form (`summon.<name>.raw.png`, one south image each; job ids):

| unit | canvas | job id |
| --- | --- | --- |
| reaped_wraith | 48×56 | 65f74e00-9e89-45e7-aa31-a011a7d1b0db |
| limbo_shade | 40×56 | 1118718e-d648-4d9c-8da5-8db2b4265bbc |
| kept_name | 44×56 | 53f15b8e-d053-453e-a6f5-ac94b87c6a18 |
| auto_turret | 40×40 | 572e0b81-654b-413a-b5c4-78b320a98b09 |
| bone_turret | 40×40 | 3aad9658-72f0-4849-b3b1-0cbf535aa8f4 |
| mortar_pod | 44×40 | 8df290b7-109a-4d12-bf51-3f8376a89b3d |
| shield_generator | 44×44 | 39afe512-08ff-4851-a544-f13cfc62de25 |
| repair_drone | 32×32 | fc309da8-84fe-4c66-9c72-07560a8b5b70 |
| siege_engine | 64×64 | 8df16862-f4b7-471e-855f-3f9004ec218c |
| falcon | 40×32 | bd183d76-6add-49e3-8b56-1b01749a7ceb |
| spirit_hawk | 40×32 | 0310c3b1-f97d-42f1-b2c9-34213a1489f1 |
| moon_guardian | 44×56 | 288a8e09-9c1f-4f25-bb9a-2e409950ab79 |
| elder_spirit | 48×60 | e9aa7f5e-c2b0-4e7a-b8ac-32dd3aae6718 |
| healing_spirit | 32×32 | 7dd2aae3-2436-4110-96a2-9a3d953d29fd |
| healing_bloom | 40×40 | b2f5a7d1-f005-4e5e-b142-533b821994d3 |

Seen only at thumbnail so far: the wraith, shade, skeleton warrior, grave guard (helm,
tower shield), husk and wolf read as intended. The ghost deckhand came back with a bright
red-and-white striped shirt — that is a saturation problem to mute in the finishing pass,
not a reroll. The blood servant reads as a bandaged figure with a dark torso; check at zoom
that the wrappings read as linen and not armour.

## Next concrete step

1. Judge all 21 at zoom (`python3`/Pillow or Aseprite), reroll anything that is the wrong
   *shape*; fix colour in the finishing script, never by reroll.
2. Write `art/summons/finish.ts` on the `art/monsters/finish-delve.ts` pattern: raw → trim →
   `muteHot` everywhere (a summon has **no** keep-box) → `eraseShadow` on any baked ground
   ellipse → write PNG → print the `ATLAS` row. Standard-mode canvases (68/80) trim to
   roughly 50–60px bodies; check density with `npm run inworld` after adding the ids to its
   cast.
3. Commit PNGs + `ATLAS` rows; tell f1 to fill `SUMMON_UNIT_ART`; f1 renders a contact
   sheet against real PNGs before fixing the tint strength.
4. Take a gate slot from the PM before running `npm test` or `npm run smoke` — several
   concurrent smokes killed three chains on 2026-09-11.
