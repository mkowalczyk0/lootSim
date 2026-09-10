/**
 * Weapon-skin acceptance test — the authored-skin stream.
 *
 * A weapon skin is **one family's weapon**, not a coat of paint that goes over any of
 * them. `data/cosmetics.ts`'s file header explains why that is a safety rule rather than
 * plumbing: a weapon's `reach` and `arc` belong to its family, so a whip-shaped skin worn
 * over claws would draw ~45 world units of weapon in front of a 34-unit hitbox and lie to
 * the player about distance in the exact place the game asks for skill.
 *
 * What is asserted here:
 *
 *   1. the two tables agree — game data says which family a skin *is*, the atlas says
 *      where its picture lives, and neither is allowed to drift from the other
 *   2. every atlas skin row belongs to something (a cosmetic or a named item), so the
 *      table cannot accumulate rows nothing can ever draw
 *   3. an authored skin is wearable on its own family and refused on all thirteen others,
 *      as a comparison across the whole roster rather than a spot check
 *   4. an original palette skin, which belongs to no family, still goes on every one —
 *      the seven that predate the authored stream keep exactly the reach they had
 *   5. the wardrobe is a map: one family's choice never disturbs another's
 *   6. the pre-v32 migration is lossless in the direction that matters — a palette is
 *      restored everywhere, an authored skin only where it can actually be seen
 *   7. every authored skin's picture exists, is the size its row promises, and spans the
 *      same world length its family's own art spans (the reach rule, from the other side:
 *      `art/weaponskins/author.ts` makes it underivable, this proves it landed)
 *
 * Headless, no browser. Run with `npm run weaponskins`.
 */

import { readFileSync } from "node:fs";
import { decodePng } from "./png";
import {
  COSMETICS, normalizeAppearance, wornWeaponSkin,
} from "../src/data/cosmetics";
import { NAMED_ITEMS } from "../src/data/named";
import { WEAPON_FAMILIES, WEAPONS } from "../src/data/weapons";
import { ATLAS_WEAPONS, ATLAS_WEAPON_SKINS } from "../src/render/atlas/manifest";
import { GameState } from "../src/game/state";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string): void {
  console.log(`\n=== ${name} ===`);
}

const authored = COSMETICS.filter((c) => c.slot === "weapon" && c.family !== null);
const palettes = COSMETICS.filter((c) => c.slot === "weapon" && c.family === null);

section("the roster");
// Printed, not just counted: a scope that has silently emptied is the failure mode a
// filter over an empty table hides, and this repo has shipped that bug twice.
console.log(`  ${authored.length} authored skin(s): ${authored.map((c) => `${c.name} (${c.family})`).join(", ") || "none"}`);
console.log(`  ${palettes.length} original palette(s): ${palettes.map((c) => c.name).join(", ") || "none"}`);
check("there is at least one authored skin to check", authored.length > 0);
check("every weapon family exists in the atlas",
  WEAPON_FAMILIES.every((f) => ATLAS_WEAPONS[f] !== undefined));

section("the two tables agree");
{
  const disagree = authored.filter((c) => ATLAS_WEAPON_SKINS[c.id]?.family !== c.family);
  check("every authored skin's family matches its atlas row", disagree.length === 0,
    disagree.map((c) => `${c.id}: data says ${c.family}, atlas says ${ATLAS_WEAPON_SKINS[c.id]?.family ?? "(no row)"}`).join("; "));

  // The same agreement walked from the OTHER table, and it is not redundant. The check
  // above starts from `authored`, which is `family !== null` — so a drawn skin whose
  // cosmetic quietly loses its family drops out of the set being checked and the check
  // goes green over a smaller world. That is the "a filter over an empty table passes"
  // failure this repo has shipped twice. `ATLAS_WEAPON_SKINS` is the fixed reference here:
  // editing game data cannot shrink it.
  const nullFamily = Object.entries(ATLAS_WEAPON_SKINS)
    .map(([id, row]) => ({ id, row, c: COSMETICS.find((x) => x.id === id) }))
    .filter(({ row, c }) => c !== undefined && c.family !== row.family);
  check("every drawn skin's cosmetic declares the family its art is for", nullFamily.length === 0,
    nullFamily.map(({ id, row, c }) => `${id}: art is a ${row.family}, cosmetic says ${c!.family ?? "no family (a palette)"}`).join("; "));

  const orphan = Object.keys(ATLAS_WEAPON_SKINS)
    .filter((id) => !COSMETICS.some((c) => c.id === id) && !NAMED_ITEMS.some((d) => d.id === id));
  check("every atlas skin row is a cosmetic or a named item", orphan.length === 0, orphan.join("; "));

  const badFamily = Object.entries(ATLAS_WEAPON_SKINS)
    .filter(([, k]) => !(WEAPON_FAMILIES as readonly string[]).includes(k.family));
  check("every atlas skin row names a real family", badFamily.length === 0,
    badFamily.map(([id, k]) => `${id}: ${k.family}`).join("; "));
}

section("a skin is one family's weapon");
{
  const state = new GameState(11);
  state.cosmetics = COSMETICS.map((c) => c.id);

  for (const c of authored) {
    const others = WEAPON_FAMILIES.filter((f) => f !== c.family);
    check(`${c.name} is wearable on ${c.family}`, state.wear("weapon", c.id, c.family!));
    // The comparison, not a spot check: it has to be refused by ALL of the other
    // thirteen, so a family added later cannot quietly become wearable.
    const wrongly = others.filter((f) => state.wear("weapon", c.id, f));
    check(`${c.name} is refused on all ${others.length} other families`, wrongly.length === 0,
      wrongly.join(", "));
    check(`${c.name} is offered only on ${c.family}`,
      state.ownedWeaponSkins(c.family!).some((x) => x.id === c.id)
      && !others.some((f) => state.ownedWeaponSkins(f).some((x) => x.id === c.id)));
  }

  for (const c of palettes) {
    const everywhere = WEAPON_FAMILIES.every((f) => state.wear("weapon", c.id, f));
    check(`${c.name} has no family and goes on every one`, everywhere);
  }

  check("an unowned skin is refused even on the right family", (() => {
    const bare = new GameState(12);
    const c = authored[0]!;
    return !bare.wear("weapon", c.id, c.family!);
  })());
}

section("the wardrobe is a map, not a slot");
{
  const state = new GameState(13);
  state.cosmetics = COSMETICS.map((c) => c.id);
  const a0 = authored[0]!;
  const p0 = palettes[0]!;
  for (const f of WEAPON_FAMILIES) state.wear("weapon", p0.id, f);
  state.wear("weapon", a0.id, a0.family!);
  check("one family's skin does not overwrite another's",
    wornWeaponSkin(state.appearance, a0.family!) === a0.id
    && WEAPON_FAMILIES.filter((f) => f !== a0.family)
      .every((f) => wornWeaponSkin(state.appearance, f) === p0.id));
  check("taking one family's skin off leaves the others dressed",
    state.wear("weapon", null, a0.family!)
    && wornWeaponSkin(state.appearance, a0.family!) === null
    && WEAPON_FAMILIES.filter((f) => f !== a0.family)
      .every((f) => wornWeaponSkin(state.appearance, f) === p0.id));
}

section("a save from before the map");
{
  const a0 = authored[0]!;
  const p0 = palettes[0]!;
  const others = WEAPON_FAMILIES.filter((f) => f !== a0.family);

  // A palette had reach over every weapon you could hold, so it keeps exactly that.
  const oldPalette = normalizeAppearance({ weapon: p0.id });
  check("a legacy palette skin migrates onto every family",
    WEAPON_FAMILIES.every((f) => wornWeaponSkin(oldPalette, f) === p0.id));

  // An authored skin only ever appeared on its own family, so restoring it anywhere else
  // would be the wardrobe claiming something the player will never see.
  const oldAuthored = normalizeAppearance({ weapon: a0.id });
  check("a legacy authored skin migrates onto its own family only",
    wornWeaponSkin(oldAuthored, a0.family!) === a0.id
    && others.every((f) => wornWeaponSkin(oldAuthored, f) === null));

  check("a save with no weapon skin at all comes back empty",
    WEAPON_FAMILIES.every((f) => wornWeaponSkin(normalizeAppearance({}), f) === null));

  check("a saved skin on the wrong family is dropped on load",
    wornWeaponSkin(normalizeAppearance({ weapons: { [others[0]!]: a0.id } }), others[0]!) === null);

  check("a retired skin id is dropped rather than crashing the screen",
    WEAPON_FAMILIES.every((f) =>
      wornWeaponSkin(normalizeAppearance({ weapons: { [f]: "skinThatNeverExisted" } }), f) === null));

  // The map survives a round trip through the save.
  const state = new GameState(14);
  state.cosmetics = COSMETICS.map((c) => c.id);
  state.wear("weapon", a0.id, a0.family!);
  const revived = normalizeAppearance(JSON.parse(JSON.stringify(state.appearance)));
  check("the map round-trips through a save",
    wornWeaponSkin(revived, a0.family!) === a0.id);
}

section("the picture, and the reach it advertises");
{
  for (const c of authored) {
    const row = ATLAS_WEAPON_SKINS[c.id];
    if (!row) { check(`${c.name} has an atlas row`, false); continue; }
    let png: { width: number; height: number } | null = null;
    try {
      png = decodePng(readFileSync(`src/render/atlas/weapons/${row.id}.png`));
    } catch {
      png = null;
    }
    check(`${c.name}'s picture exists`, png !== null, `src/render/atlas/weapons/${row.id}.png`);
    if (!png) continue;
    check(`${c.name} is the size its row promises`,
      png.width === row.w && png.height === row.h,
      `png ${png.width}x${png.height}, row ${row.w}x${row.h}`);

    // The reach rule from the other side. `art/weaponskins/author.ts` DERIVES worldScale
    // so a skin cannot be authored lying about reach; this proves the derived number is
    // what actually landed in the manifest, against the family's own art as the fixed
    // reference rather than against anything the skin can move.
    const fam = ATLAS_WEAPONS[row.family]!;
    const familySpan = fam.w * fam.worldScale;
    const skinSpan = row.w * row.worldScale;
    check(`${c.name} spans the same world length a ${row.family} does`,
      Math.abs(skinSpan - familySpan) < 0.5,
      `${WEAPONS[c.family!].name} ${familySpan.toFixed(2)} vs skin ${skinSpan.toFixed(2)}`);

    // A grip off the sprite would pivot the swing around empty air.
    check(`${c.name}'s grip is inside its own art`,
      row.gripX >= 0 && row.gripX < row.w && row.gripY >= 0 && row.gripY < row.h,
      `grip (${row.gripX}, ${row.gripY}) in ${row.w}x${row.h}`);
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
