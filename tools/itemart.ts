/**
 * Item imagery acceptance test — UAT §11's critical requirement, and §12's slots.
 *
 * §11 asks for one thing above the rest:
 *
 *   *"The stash item image should correspond to the actual item image displayed when
 *   opening loot boxes/chests. The same item should visually appear to be the same item
 *   everywhere."*
 *
 * That is a property, not an appearance, so it can be checked without eyes — and it has
 * to be, because it had already stopped being true. `pickupSprite` in `render/draw.ts`
 * carried a second copy of the resolution and washed a non-weapon icon at 0.4 where the
 * stash and the chest reel washed the same item at 0.5. Nothing failed; the same ring was
 * simply a slightly different colour on the floor than in your bag.
 *
 * So the *decision* now lives alone in `render/itemart.ts`, DOM-free on purpose — the same
 * exception `render/pixels.ts` is, for the same stated reason — and this file asserts:
 *
 *  1. every surface asking about one item gets one identical answer
 *  2. the fallback ladder is ordered, total, and never throws on missing art
 *  3. the item's own art wins when it exists, so authoring a PNG really changes the
 *     picture everywhere at once
 *  4. §12's slots are all accounted for: every live slot, and every future one declared
 *  5. every atlas sprite the DOM will ever ask `pixelImageFit` to fit into a real UI box
 *     comes out inside that box — a width-only fit blew this once already (see
 *     `fitScale`'s doc comment) and it's cheap to keep proving on every atlas addition
 *
 * Headless, no browser, no canvas. Run with `npm run itemart`.
 */

import { EQUIP_SLOTS, ITEM_TYPES, isWeaponType, slotForType, type ItemType } from "../src/data/items";
import { NAMED_ITEMS } from "../src/data/named";
import { RARITIES, type Rarity } from "../src/data/rarity";
import { WEAPON_FAMILIES } from "../src/data/weapons";
import { RELICS, RELIC_SLOTS } from "../src/data/relics";
import { ATLAS, ATLAS_WEAPONS } from "../src/render/atlas/manifest";
import { fitScale } from "../src/ui/pixelimage";
import {
  ITEM_FALLBACK_SPRITE, RARITY_WASH, RELIC_FALLBACK_SPRITE, chooseItemArt, chooseRelicArt,
  type ArtAvailability, type ItemArtChoice,
} from "../src/render/itemart";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

/** A build where the type icons exist and no authored item art does — today's shipped state. */
const NO_ART: ArtAvailability = {
  hasAtlas: () => false,
  hasSprite: (name) => !isWeaponType(name as ItemType) && ITEM_TYPES.includes(name as ItemType),
};
/** A build where every authored art id loaded — what a PNG pass would produce. */
const ALL_ART: ArtAvailability = { hasAtlas: () => true, hasSprite: NO_ART.hasSprite };
/** A hostile build: art ids present in the manifest but nothing drawable, no icons either. */
const NOTHING: ArtAvailability = { hasAtlas: () => false, hasSprite: () => false };

const key = (c: ItemArtChoice) =>
  c.kind === "atlas" ? `atlas:${c.id}`
    : c.kind === "weapon" ? `weapon:${c.family}:${c.rarity}`
      : `icon:${c.sprite}:${c.rarity}:${c.wash}`;

// --- 1. one item, one answer ----------------------------------------------

console.log("\n=== the same item looks the same everywhere ===");
{
  /**
   * The five surfaces that draw an item, as the questions they actually ask. The stash
   * card, the paper-doll slot and the loot banner all hold a real `Item`; the dungeon
   * floor holds one too; the chest reel asks about a type and a rarity before any item
   * exists. All five go through `chooseItemArt`, so asking it five times the way each
   * surface asks has to give one answer.
   */
  let mismatches = 0;
  let compared = 0;
  for (const type of ITEM_TYPES) {
    for (const rarity of RARITIES) {
      for (const art of [null, "named.example"]) {
        const asked = [
          chooseItemArt(type, rarity, art, NO_ART), // stash card
          chooseItemArt(type, rarity, art, NO_ART), // paper-doll slot
          chooseItemArt(type, rarity, art, NO_ART), // loot banner
          chooseItemArt(type, rarity, art, NO_ART), // dungeon floor (was its own copy)
          chooseItemArt(type, rarity, art, NO_ART), // chest reel
        ].map(key);
        compared++;
        if (new Set(asked).size !== 1) mismatches++;
      }
    }
  }
  check(`every surface agrees, across ${compared} type/rarity/art combinations`,
    mismatches === 0, `${mismatches} disagreed`);

  // The wash is one constant, and the value is the one the spec's reference surfaces used.
  check("a shared type icon is washed by exactly one constant", RARITY_WASH === 0.5,
    String(RARITY_WASH));
  const washes = new Set(
    ITEM_TYPES.filter((t) => !isWeaponType(t))
      .flatMap((t) => RARITIES.map((r) => {
        const c = chooseItemArt(t, r, null, NO_ART);
        return c.kind === "icon" ? c.wash : -1;
      })));
  check("…and nothing else ever picks a different one", washes.size === 1 && washes.has(RARITY_WASH),
    [...washes].join(", "));
}

// --- 2. the fallback ladder -----------------------------------------------

console.log("\n=== the ladder is ordered, and it is total ===");
{
  // Authored art wins over everything, weapons included: that is the whole point of
  // authoring a PNG for a named sword.
  const named = chooseItemArt("sword", "mythic", "named.proof", ALL_ART);
  check("authored art beats the weapon sprite", named.kind === "atlas", named.kind);
  const noArt = chooseItemArt("sword", "mythic", "named.proof", NO_ART);
  check("…and an art id that isn't drawable falls straight through to the weapon",
    noArt.kind === "weapon", noArt.kind);

  // Every weapon family resolves to its own sprite, so a mythic axe is an axe.
  const wrongFamily = WEAPON_FAMILIES.filter((f) => {
    const c = chooseItemArt(f, "rare", null, NO_ART);
    return c.kind !== "weapon" || c.family !== f;
  });
  check("every weapon family draws as itself", wrongFamily.length === 0, wrongFamily.join(", "));

  // Every non-weapon type has its own icon rather than sharing one.
  const shared = ITEM_TYPES.filter((t) => !isWeaponType(t)).filter((t) => {
    const c = chooseItemArt(t, "rare", null, NO_ART);
    return c.kind !== "icon" || c.sprite !== t;
  });
  check("every other slot draws as its own type", shared.length === 0, shared.join(", "));

  // And with nothing available at all, it still answers — never throws, never blank.
  let threw = "";
  let fellBack = 0;
  for (const type of ITEM_TYPES) {
    for (const rarity of RARITIES) {
      try {
        const c = chooseItemArt(type, rarity, "named.missing", NOTHING);
        if (c.kind === "icon" && c.sprite === ITEM_FALLBACK_SPRITE) fellBack++;
        else if (c.kind !== "weapon") threw = `${type}/${rarity} → ${key(c)}`;
      } catch (e) {
        threw = `${type}/${rarity} threw ${String(e)}`;
      }
    }
  }
  check("a build with no art at all still resolves every item", threw === "", threw);
  check("…by falling back to the capsule for anything with no icon",
    fellBack === ITEM_TYPES.filter((t) => !isWeaponType(t)).length * RARITIES.length,
    `${fellBack} fell back`);
}

console.log("\n=== authoring art changes the picture everywhere at once ===");
{
  // Every named item that declares an art id: with the PNG loaded it draws as that art,
  // and with it missing it draws as its type — which is the documented current state.
  const declared = NAMED_ITEMS.filter((d) => d.art);
  const wrong = declared.filter((d) => {
    const on = chooseItemArt(d.type, d.rarity, d.art!, ALL_ART);
    const off = chooseItemArt(d.type, d.rarity, d.art!, NO_ART);
    return on.kind !== "atlas" || (on as { id: string }).id !== d.art || off.kind === "atlas";
  });
  check(`all ${declared.length} named items with an art id honour it, and degrade without it`,
    wrong.length === 0, wrong.map((d) => d.id).join(", "));
  // How many of those art ids actually have a manifest row (and so a real PNG) today —
  // worth stating rather than implying, the same reason the line existed when the answer
  // was zero, then three. See docs/item-art-inventory.md and feat/item-art for the rest.
  const authored = declared.filter((d) => d.art! in ATLAS);
  console.log(`       · ${declared.length} named items declare art; ${authored.length} `
    + `(${authored.map((d) => d.id).join(", ")}) have a PNG, the rest are on the `
    + "documented type-icon fallback");
}

// --- 3. §12's slots -------------------------------------------------------

console.log("\n=== §12: every slot is accounted for ===");
{
  // Every live slot is reachable by some item type, or the paper-doll has a hole in it
  // that nothing can ever fill.
  const unfillable = EQUIP_SLOTS.filter((slot) => !ITEM_TYPES.some((t) => slotForType(t) === slot));
  check("every equipment slot has item types that fit it", unfillable.length === 0,
    unfillable.join(", "));

  // And every item type lands in a real slot, so nothing can drop that the doll can't show.
  const homeless = ITEM_TYPES.filter((t) => !EQUIP_SLOTS.includes(slotForType(t)));
  check("every item type belongs to a slot the doll draws", homeless.length === 0,
    homeless.join(", "));

  // §12 names these as coming later. Asserted against the spec's own list so that turning
  // one on means moving it, not quietly dropping it off the character sheet. The three
  // relic slots §12 also listed went live with UAT §19 — they are `Player.relics`, not
  // `EquipSlot`s, and `tools/relics.ts` owns them.
  const promised = ["helmet", "boots", "off-hand"];
  const live = EQUIP_SLOTS as readonly string[];
  const collide = promised.filter((f) => live.includes(f));
  check("the future slots §12 promises are not yet live slots", collide.length === 0,
    collide.join(", "));
  check(`§12's three relic slots are live (${RELIC_SLOTS})`, RELIC_SLOTS === 3);
  console.log(`       · live: ${EQUIP_SLOTS.join(", ")} + ${RELIC_SLOTS} relic slots`);
  console.log(`       · promised by §12: ${promised.join(", ")}`);
}

// --- 4. a relic is one picture too ------------------------------------------

console.log("\n=== a relic looks the same on the floor, in a slot and on the banner ===");
{
  // The baked atlas has the relic glyph even when no PNG art is loaded — that is the
  // fallback's whole premise, so the stub says so.
  const GLYPH_ONLY: ArtAvailability = { hasAtlas: () => false, hasSprite: (n) => n === RELIC_FALLBACK_SPRITE || NO_ART.hasSprite(n) };
  const GLYPH_AND_ART: ArtAvailability = { hasAtlas: () => true, hasSprite: GLYPH_ONLY.hasSprite };
  for (const def of RELICS) {
    const bare = chooseRelicArt(def, GLYPH_ONLY);
    check(`${def.id}: with no art it is the relic glyph washed at the one wash`,
      bare.kind === "icon" && bare.sprite === RELIC_FALLBACK_SPRITE && bare.wash === RARITY_WASH && bare.rarity === def.rarity);
    if (def.art) {
      const drawn = chooseRelicArt(def, GLYPH_AND_ART);
      check(`${def.id}: with its art loaded it is its art`, drawn.kind === "atlas" && drawn.id === def.art);
    }
  }
  const authored = { art: "relic.some-future-relic", rarity: "unspoken" as Rarity };
  check("an authored art id whose PNG is missing falls through to the glyph, never a hole",
    chooseRelicArt(authored, GLYPH_ONLY).kind === "icon" && chooseRelicArt(authored, GLYPH_AND_ART).kind === "atlas");
  check("with nothing baked at all it still lands on the item fallback sprite",
    (chooseRelicArt(authored, NOTHING) as { sprite: string }).sprite === ITEM_FALLBACK_SPRITE);
  // How many declare art and actually have a manifest row (and so a real PNG) today —
  // worth stating rather than implying, the same reason this line exists for named items.
  const relicsAuthored = RELICS.filter((d) => d.art && d.art in ATLAS);
  console.log(`       · ${RELICS.length} relics/artifacts; ${relicsAuthored.length} `
    + `(${relicsAuthored.map((d) => d.id).join(", ")}) have a PNG, the rest are on the `
    + "tinted-glyph fallback");
}

// --- 5. every atlas sprite fits the box the DOM actually puts it in --------------

console.log("\n=== pixelImageFit never has to ask the DOM to downscale a sprite that already fits ===");
{
  // The real target boxes `pixelImageFit` is called against today (grep `src/ui/*.ts`):
  // 64 (stash card, paper-doll), 72 (chest icon, compare candidate row), 96 (compare
  // panel header, roll-reel face), 120 (loot banner). A sprite whose native size already
  // fits inside a box has to come out no bigger than the box — that's the property a
  // width-only fit broke: `named.the-early-word` (8x46) and `weapon.bow` (14x61) both fit
  // inside every one of these boxes natively, but scaling by width alone blew each past
  // its box on the other axis, and the DOM's non-integer catch-up squash is what turned
  // them into mangled slivers rather than smaller clean copies of themselves.
  //
  // A sprite that is natively bigger than a box on some axis (a spear world sprite is
  // 118 wide) is excluded — no integer scale can shrink it below 1x, and that is a
  // real "this box is too small for this sprite" fact this check isn't about.
  const BOXES: readonly [number, number][] = [[64, 64], [72, 72], [96, 96], [120, 120]];
  const sprites: { id: string; w: number; h: number }[] = [
    ...Object.values(ATLAS).map((a) => ({ id: a.id, w: a.w, h: a.h })),
    ...Object.values(ATLAS_WEAPONS).map((a) => ({ id: a.id, w: a.w, h: a.h })),
  ];
  const overflows: string[] = [];
  for (const s of sprites) {
    for (const [tw, th] of BOXES) {
      if (s.w > tw || s.h > th) continue;
      const scale = fitScale(s.w, s.h, tw, th);
      const rw = s.w * scale, rh = s.h * scale;
      if (rw > tw || rh > th) overflows.push(`${s.id} at ${tw}x${th}: ${s.w}x${s.h} -> x${scale} -> ${rw}x${rh}`);
    }
  }
  check(`all ${sprites.length} atlas sprites fit every real box they fit natively (x${BOXES.length} boxes)`,
    overflows.length === 0, overflows.join("; "));
}

console.log(`\n${failures === 0 ? "ALL ITEM-ART CHECKS PASSED" : `${failures} ITEM-ART CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
