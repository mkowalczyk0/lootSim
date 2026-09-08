# Item art — inventory, pipeline proposal, and three samples

A **preparation pass** (UAT §11/§12, the last of the style guide's item-art backlog),
not an authoring one — per the owner's own rule ("don't assume finer detail is an
improvement — ask") nothing here ships to the full set until the owner has looked at
real output. This doc is the inventory, the pipeline proposal, and the record of the
three samples taken all the way through. See `docs/art-style-guide.md` §12 for the
underlying spec and `docs/art-tooling-setup.md` for how the two MCP servers are wired.

## 1. The inventory

The honest finding, first: **almost nothing is missing.** Every generic item type
already has real, committed pipeline art —

| What | Status |
| --- | --- |
| Hero, all 5 monster silhouettes, all 5 floor/raid bosses | Migrated PNGs |
| All 14 weapon families (world attack sprite) | Migrated PNGs |
| The 5 equipment-slot icons (armor, shield, ring, gloves, necklace) | Migrated PNGs |
| The 5 currency/pickup icons (coin, key, potion, gem, capsule) | Migrated PNGs |
| All 6 dungeon props, both dressing sets | Migrated PNGs |
| 9 of 25 cosmetic layers | Migrated PNGs (16 remain, a follow-up noted in the manifest) |

**The one real gap is named items.** All 11 declare an `art` id (`src/data/named.ts`)
and, until this pass, all 11 sat on the documented fallback — a named item looked
*exactly* like an ordinary item of its type and rarity, because `chooseItemArt`
(`src/render/itemart.ts`) had no manifest row to find. That is a correctness fallback,
not a bug (nothing crashes, nothing looks broken), but it means the game's most
narratively loaded items — three-tier boss-exclusives, the one relic the whole
class-completion system pays out — are currently invisible as items. This is exactly
UAT chunk 7's own backlog line, called out in `docs/art-style-guide.md` §18.

### 1.1 Every named item, what it falls back to today, and how visible it is

Ranked by how many players will actually see it, not by rarity alone — an item
everyone farms toward beats one that gates on a specific rare boss roll, and a type
with no generic distinction (shield, necklace, ring) loses more by staying generic than
a weapon does (a weapon at least gets its own family shape).

| Item | Rarity | Type | Source | Falls back to today | Visibility |
| --- | --- | --- | --- | --- | --- |
| **Proof of the Whole** | mythic | necklace | Every class's Proving (21 sources) | generic necklace icon, mythic-washed | **Highest** — the one universal "you finished a class" reward, referenced by name in CLAUDE.md |
| **Threshold Brand** | mythic | sword | Craft-only, a deliberate goal | the sword family sprite, mythic-tinted (already distinctive) | High — sword is the most commonly played weapon shape; craft-only means a player chose to make it |
| **The First Seal** | legendary | shield | Warden boss drop (12%) | generic shield icon, legendary-washed | High — the first boss's own signature drop, and the base a player later reforges into The Seal Unbroken |
| **The Seal Unbroken** | mythic | shield | 2-step craft, needs The First Seal | generic shield icon, mythic-washed — **identical to The First Seal's fallback bar the wash colour** | High — the sequel item; without art it can't visually read as "the same shield, reinforced" |
| **Gravebound Mantle** | legendary | armor | Colossus boss drop (12%) | generic armor icon, legendary-washed | Medium |
| **Chorister's Idol** | mythic | talisman | Choir boss drop (10%) | the talisman family sprite, mythic-tinted | Medium |
| **Glutton's Grasp** | legendary | gloves | World drop, depth 12+ | generic gloves icon, legendary-washed | Medium |
| **The Early Word** | mythic | staff | Herald boss drop (10%) | the staff family sprite, mythic-tinted | Medium |
| **A Name Withheld** | unspoken | ring | Nameless boss drop (8%) | generic ring icon, unspoken-washed | Low reach (rare boss, small silhouette) despite being the rarest tier in the game |
| **Limbo's Lantern** | epic | necklace | Clear cache, depth 6+ | generic necklace icon, epic-washed | Low stakes (epic, not a chase item) |
| **Keeper's Ledger** | epic | ring | Legendary chest (2%) | generic ring icon, epic-washed | Low stakes |

### 1.2 A wrinkle worth flagging before anyone authors the rest

A named **weapon**'s icon and its **in-hand swing sprite** are two different systems.
`itemSprite`/`itemSpriteFor` (`render/sprites.ts`) governs the stash card, the chest
reel, the loot banner, the paper-doll and the floor drop — an atlas row for
`named.threshold-brand` changes all five of those at once, which is the whole point of
the arrangement. But the blade actually swinging in combat is drawn by
`drawWeapon`/`weaponSprite` (`render/draw.ts`), keyed off `hero.player.weapon.id` (the
family) and `hero.appearance.weapon` (a cosmetic skin) — **never** the item's `named`
id. Authoring Threshold Brand's icon does not change what it looks like in your hand
mid-fight; it still swings as a plain rarity-tinted sword unless it also gets a genuine
weapon-skin override, which style guide §12.3 flags as optional ("when the fantasy
demands it") and is a materially bigger asset (a full greyscale +x sprite with a named
grip pixel, not a 32×32 icon). Worth a deliberate call from the owner when named
weapons come up for a real pass — v1 here doesn't attempt it.

## 2. The pipeline proposal

Follows the same PixelLab → Aseprite → committed-PNG route the cosmetics/props/icons
waves already used (`docs/art-tooling-setup.md`), with the parts specific to a named
item's icon:

1. **Generate** with `create_image_pixflux`: a small square canvas (36–48px per side —
   big enough that PixelLab has room to draw a recognizable object, small enough that
   the §17.1 "generate near the target size" rule holds), `no_background: true`,
   `view: "side"`, `outline: "single color outline"`, `shading: "medium shading"`. The
   prompt reads the item's own `flavor`/`description` fields in `data/named.ts` rather
   than inventing a new brief — Threshold Brand's holy/iron split blade and The First
   Seal's warded stone rim both came directly from their existing text.
2. **Trim** to the alpha bounding box (computed once against the raw PNG, then a single
   `crop_canvas` call in Aseprite) — the generation canvas always has transparent
   margin, and the committed PNG should be tight like every sibling icon (`icon.shield`
   is 30×30, not 40×40).
3. **No palette quantization pass.** Unlike the cosmetic layers, a named item's colour
   is fixed forever — it never needs the marker-swap-for-runtime-recolour mechanism
   `COSMETIC_MARK_*` exists for, so there is nothing to force onto three reserved
   colours. It gets the same light touch as the bosses/monsters/props: PixelLab's own
   limited palette, trimmed, committed as-is. (Checked against `icon.shield.png` before
   deciding this: 40 distinct colours in a 30×30 already-shipped icon — the existing
   pipeline was never doing hard quantization for static art either.)
4. **No rarity frame baked in.** §12.1 mentions "a rarity frame in these colours," but
   that frame is CSS chrome around the item cell (`--r: RARITY_COLORS[...]` throughout
   `ui/town.ts`), not part of the icon artwork — confirmed by reading the render path
   before assuming otherwise. An icon is just the object on transparent background.
5. **Wire**: one row in `ATLAS` (`src/render/atlas/manifest.ts`), keyed `named.<id>`
   exactly matching the definition's `art` field, with `w`/`h` from the trimmed PNG and
   a `worldScale` picked to roughly match the sibling type icon's in-world drop size
   (a named necklace shouldn't suddenly be a different size on the floor than an
   ordinary one). Commit the PNG at `src/render/atlas/items/named/named.<id>.png` per
   style guide §12.3 — the atlas loader globs recursively and keys purely by filename,
   so the exact subfolder doesn't affect loading, but the path should still say one
   thing consistently. (It didn't: the style guide said `items/named/`, the manifest's
   own comment and `tools/named.ts`'s existence check both said `named/` directly under
   `atlas/`. Fixed both to agree with the style guide, since a named item's art was
   about to actually start landing there.)
6. **Nothing else changes.** No new code path — `chooseItemArt`'s existing ladder
   (atlas → weapon → type icon) picks up a new row the moment it exists, which is the
   entire reason UAT §11 insists on one decision function. `npm run named` and
   `npm run itemart` both need zero new checks; they already assert "art exists or
   falls back, never crashes" and "authoring art changes the picture everywhere at
   once" generically. The only test-side change was correcting the `named/` vs.
   `items/named/` path drift above, and making the "no PNGs exist yet" console line in
   `tools/itemart.ts` say how many now do, instead of silently going stale.

## 3. The three samples

Taken all the way through — generated, trimmed, wired, and passing every existing
check — rather than mocked up:

- **`named.proof-of-the-whole`** (26×38) — a dark medallion holding a once-cracked,
  now-sealed core that glows with several colours fused together, for an item whose
  entire fiction is "the part of you that was down there, it fits" and whose mechanic
  amplifies whatever elements a build already carries.
- **`named.threshold-brand`** (44×42) — a longsword split lengthwise between pale
  consecrated gold and scorched dark iron, meeting at a small ring of holy light at the
  crossguard, for an item forged "from what came through the wound" whose melee hits
  turn holy.
- **`named.the-first-seal`** (40×39) — a weathered bronze-and-stone round shield with a
  warded rune glowing at its centre, for "a wall that answers every blow with a little
  more wall."

All three are wired into `ATLAS` and load through the real `chooseItemArt` ladder —
`npm run itemart` and `npm run named` both assert it, and `npm run art` now renders
them (see §4). The other 8 named items are deliberately untouched pending sign-off.

## 4. The contact sheet gap, and closing it

`npm run art` (`tools/artsheet.ts`) still only rendered the **procedural**
`render/pixels.ts` grids — for icons and props, that stopped being what the game
actually draws the moment those ids migrated to real PNGs, and the sheet had no PNG
decoder to show a committed atlas image at all (`docs/art-style-guide.md` §17.5 called
this out as unattempted future work). Concretely, this is the gap lootsim-26 flagged:
the `RARITY_WASH` constant is proven not to fork again (`npm run itemart`), but nobody
could *see* the wash, which is exactly the kind of thing that forked silently once
already (0.4 vs. 0.5, §11's own history).

Added:

- **`tools/pngdecode.ts`** — a small, hand-rolled PNG decoder (the encoder half already
  existed in this file for the same "no image library, no runtime dependency" reason).
  Supports exactly what every committed atlas PNG actually is: 8-bit depth, colour type
  2 (RGB) or 6 (RGBA), non-interlaced — verified byte-for-byte against Pillow on four
  real committed files (a small icon, a large multi-filter-row boss, an RGB-only scene,
  and one of the new named icons) before wiring it in anywhere. Also exports `washPng`,
  the exact per-pixel reimplementation of `tintedCanvas`'s `source-atop`/`globalAlpha`
  compositing math, so the sheet can show the *real* wash rather than re-deriving a
  different approximation of it.
- Two new sections in the sheet: every one of the 5 equipment icons (armor, shield,
  ring, gloves, necklace), decoded from its real committed PNG and washed toward all
  eight rarities — a row per type, common through unspoken, left to right — so a future
  wash-constant fork would show up as two different-looking rows, not just a failing
  number nobody looks at. Below that, the three named-item samples, unwashed (a named
  item's colour is fixed forever, so it never goes through the wash), for the owner to
  actually look at.
- Canvas grew from 1180×1000 to 1180×1720 to fit the new rows without clipping.

Everything else on the sheet (characters, monsters, bosses, weapons, cosmetics) is
untouched and stays procedural-grid-only for now — extending those to decode their real
PNGs too is future work, not attempted here, since it wasn't the gap that was flagged
and each uses its own recolour mechanism (indexed palette swap for weapons, marker swap
for cosmetics) that a simple wash function doesn't cover.

## 5. What's still open (for the owner)

- Look at `art-sheet.png`'s new bottom rows and the three named items specifically —
  this doc's whole purpose. If the direction is right, the remaining 8 named items
  follow the same recipe in §2.
- The named-weapon icon vs. in-hand-sprite split (§1.2) — decide whether v1 named
  weapons should stay "reskinned icon, ordinary sword in hand," or whether a named
  weapon should eventually also get its own world skin.
- `docs/art-tooling-setup.md`'s PixelLab section still describes the original 40-
  generation trial; the account is now on a paid tier (1770 of 2000 remaining this
  cycle, resets 2026-10-07) — worth a quick doc fix whenever someone's next in there,
  not urgent enough to hold this pass on.
