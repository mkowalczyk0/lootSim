/**
 * The body-luminance gate (art style guide §1.4, the other half): a monster's body stays
 * **low and dirty**, and only the part looking at you is allowed to be bright.
 *
 * ## Why this exists — `npm run chroma` is structurally blind to the failure it guards
 *
 * `tools/chroma.ts` measures a sprite's *accent* — the max chroma over any colour covering
 * 2+ pixels — and asserts the hero's stays below every monster's. That is a real property
 * and it is correctly asserted as a comparison. But it says nothing whatsoever about the
 * **body** the accent sits on, and so:
 *
 *     a monster whose body was brightened until it stopped reading as menacing
 *     passes `npm run chroma` green, every time.
 *
 * That is not hypothetical. Commit `a247a07` lifted three §1a bodies (`gore-hound`,
 * `rot-priest`, `aegis-thrall`) out of the floor's luminance band so they would read
 * against the sector tilesets. The lift was measured — `art/monsters/infusion-matrix.ts`
 * reports each sprite's contrast *against the floor it stands on* — but that instrument
 * only supplies a **lower** bound: it can tell you a body is too dark to see, never that
 * one has been brightened past the cast it belongs to. `chroma` stayed green across the
 * lift because the accents never moved. So the pass had a floor and no ceiling, and the
 * only thing standing between "legible" and "no longer menacing" was somebody looking at
 * a contact sheet.
 *
 * This file is the missing ceiling.
 *
 * ## The measurement: median luminance, not mean
 *
 * A sprite's body luminance is the **median** Rec. 709 luminance over its opaque pixels.
 * The median is the point of the choice, not an incidental detail: a hot accent is by
 * design a tiny minority of pixels (a pair of eyes, a lit gem), so the median is dominated
 * by the body and is structurally insensitive to the accent. A *mean* would be dragged by
 * exactly the pixels this check is supposed to ignore, and — worse — a brighten pass could
 * satisfy a mean-based bound by dimming the accent, which is the opposite of what §1.4
 * wants. No "is this pixel part of the accent?" threshold is needed anywhere here, which
 * is deliberate: a threshold is one more authored constant that can be tuned until the
 * check agrees with whatever it is handed.
 *
 * ## The bound comes from sprites this branch cannot move
 *
 * CLAUDE.md's rule, learned across four blind checks in one day: *a check's bound, its
 * scope, and its subject must all come from somewhere other than the thing under test.*
 * The cautionary case was `heroStage`, which derived its width from the widest cosmetic
 * and could therefore only ever conclude that the widest layer is the widest layer.
 *
 * So the band here is **not** "all committed monsters" — that set includes the six sprites
 * under test, and brightening all six would carry the band up with them. It is the
 * explicitly frozen `REFERENCE_CAST` below: the five Reliquary monsters that predate
 * art-wave 2 and that no commit on this branch touches. The subjects must land inside a
 * band their own pixels had no part in setting.
 *
 * The Tower roster is deliberately **excluded** from the reference. Heaven is bright by
 * design (§6's Lower Tower → Seamless Halls → Blinding Heights bands), so folding
 * `tower.monster.*` in would widen the ceiling until nothing could ever fail it — the
 * vacuous-scope failure mode, arrived at by being generous rather than by being wrong.
 * The six subjects are Reliquary monsters and the Reliquary cast is what they stand next
 * to on screen.
 *
 * ## Honest limits, stated rather than implied
 *
 * - **One-sided on purpose.** This asserts a ceiling only. The floor already has an
 *   instrument (`infusion-matrix.ts`, contrast against the sector floor), and a two-sided
 *   bound here would re-raise the exact red that `a247a07` was fixing. CLAUDE.md warns
 *   that a one-sided bound cannot prove a *design promise* — true, and this is not one.
 *   It is a guard against a known direction of drift whose opposite direction is already
 *   measured somewhere else.
 * - **A future pass that brightens the reference cast widens this band.** The reference is
 *   fixed against *this branch*, not against all time. If the five Reliquary originals are
 *   ever retuned, this ceiling moves with them and that is a deliberate choice — the
 *   property is "the new monsters belong to the cast", so the cast is allowed to change.
 *   What cannot happen is a subject moving its own bound.
 * - **It cannot see menace.** Luminance is a proxy. A body can sit inside the band and
 *   still be wrong, and the owner's eye remains final on art they approved on sight. This
 *   narrows what has to be caught by eye; it does not replace the eye.
 */
import { existsSync, readFileSync } from "node:fs";
import { decodePng } from "./png";
import { ATLAS } from "../src/render/atlas/manifest";
import { luminance } from "../src/render/grade";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
function section(name: string): void {
  console.log(`\n=== ${name} ===`);
}

/**
 * The frozen reference cast: Reliquary monsters committed before art-wave 2, none of them
 * touched by this branch (`git ls-tree master -- src/render/atlas/monsters/` is where this
 * list came from, and `npm run bodylum`'s own scope check below re-proves the count).
 */
const REFERENCE_CAST: readonly string[] = [
  "reliquary.monster.rot-imp",
  "reliquary.monster.bone-archer",
  "reliquary.monster.iron-brute",
  "reliquary.monster.cult-caster",
  "reliquary.monster.rot-scuttler",
];

/**
 * Known, owner-approved failures of the rule below. Exact-match, the same discipline
 * `tools/chroma.ts` and `tools/legends.ts` use for their own pinned violations: a NEW
 * violation fails this gate, and so does silently *fixing* a pinned one without removing
 * its pin to acknowledge it.
 *
 * `reliquary.monster.bloat-fiend` — measured 86.0 against a 68.3 ceiling.
 *
 * The tempting explanation is wrong and was checked before this pin was written: the
 * Bloat-Fiend's accent does **not** drag the median. Only 3.5% of its opaque pixels
 * (50 of 1415) carry chroma >= 45, and excluding them outright still leaves the body at
 * 62.0. The belly is not a small hot spot; it is a *large pale* one — bright enough to
 * carry the median over the cast's ceiling while sitting below any sane accent threshold,
 * so on this instrument it counts as body, and honestly so.
 *
 * It is pinned rather than fixed because the belly is an **owner ruling**, not an
 * oversight: art-wave 2 §1a, Sept 2026, recorded in style guide §10.2 and at the ATLAS
 * row — the Exploder is the roster's one approved exception to "the accent is the part
 * looking at you", because a bomber's threat is its own death and the thing that glows is
 * the thing about to go off. The finishing pass darkened its eyes and kept the belly and
 * the owner was shown that result and chose it. A gate that reads approved art as a defect
 * and "corrects" it is the failure this repo already has a name for — see CLAUDE.md on the
 * Ferryman windup check, where a correct instrument was talked down by prose, and its
 * mirror image here, where an instrument would talk down a correct picture.
 */
const KNOWN_BAND_VIOLATIONS: readonly string[] = [
  "reliquary.monster.bloat-fiend",
];

/** The six UAT §2 roles added by art-wave 2 §1a — the sprites under test. */
const SUBJECTS: readonly string[] = [
  "reliquary.monster.gore-hound",
  "reliquary.monster.bloat-fiend",
  "reliquary.monster.aegis-thrall",
  "reliquary.monster.grave-piper",
  "reliquary.monster.deadeye",
  "reliquary.monster.rot-priest",
];

/** Median Rec. 709 luminance (0..255) over the opaque pixels of an RGBA buffer. */
function bodyLuminance(data: Uint8Array, width: number, height: number): number {
  const lums: number[] = [];
  for (let i = 0; i < width * height; i++) {
    const s = i * 4;
    if (data[s + 3]! < 128) continue;
    lums.push(luminance(data[s]!, data[s + 1]!, data[s + 2]!));
  }
  if (!lums.length) return NaN;
  lums.sort((a, b) => a - b);
  const mid = lums.length >> 1;
  return lums.length % 2 ? lums[mid]! : (lums[mid - 1]! + lums[mid]!) / 2;
}

function measure(id: string): { lum: number; pixels: number } | null {
  const path = `src/render/atlas/monsters/${id}.png`;
  if (!existsSync(path)) return null;
  const png = decodePng(readFileSync(path));
  let pixels = 0;
  for (let i = 0; i < png.width * png.height; i++) if (png.data[i * 4 + 3]! >= 128) pixels++;
  return { lum: bodyLuminance(png.data, png.width, png.height), pixels };
}

// --- 1. the detector is not vacuous -------------------------------------------------------
//
// A bound nobody has seen reject anything may simply be unable to reject. Prove the
// measurement moves in the right direction, and by the right amount, on art we construct
// rather than on art we are judging.

section("the detector itself");

{
  // A 10x10 body: 96 dark pixels and a 4-pixel hot accent. The accent must not move the
  // number — that insensitivity is the whole reason this uses a median.
  const mk = (bodyValue: number): Uint8Array => {
    const d = new Uint8Array(10 * 10 * 4);
    for (let i = 0; i < 100; i++) {
      const hot = i < 4;
      d[i * 4] = hot ? 255 : bodyValue;
      d[i * 4 + 1] = hot ? 40 : bodyValue;
      d[i * 4 + 2] = hot ? 20 : bodyValue;
      d[i * 4 + 3] = 255;
    }
    return d;
  };

  const dark = bodyLuminance(mk(30), 10, 10);
  const bright = bodyLuminance(mk(150), 10, 10);
  check("a dark body reads dark", Math.abs(dark - 30) < 1, `got ${dark.toFixed(1)}`);
  check("brightening the body moves the number, and upward",
    bright > dark + 100, `${dark.toFixed(1)} -> ${bright.toFixed(1)}`);

  // The accent-insensitivity property, stated directly: the same body with twice the
  // accent must read identically. A mean would move here; a median must not.
  const moreAccent = (() => {
    const d = mk(30);
    for (let i = 4; i < 8; i++) { d[i * 4] = 255; d[i * 4 + 1] = 40; d[i * 4 + 2] = 20; }
    return bodyLuminance(d, 10, 10);
  })();
  check("doubling the hot accent does not move the body number (the median's whole point)",
    moreAccent === dark, `${dark.toFixed(1)} vs ${moreAccent.toFixed(1)}`);

  const transparent = (() => {
    const d = mk(30);
    for (let i = 0; i < 100; i++) d[i * 4 + 3] = 0;
    return bodyLuminance(d, 10, 10);
  })();
  check("fully transparent art measures nothing rather than reading as black",
    Number.isNaN(transparent), `got ${transparent}`);
}

// --- 2. the reference band, from sprites under nobody's control here -----------------------

section("the scope this gate claims");

// Both id lists above are hand-written, and a hand-written id that does not exist is the
// cheapest way for this gate's scope to quietly empty: `measure()` returns null for a
// missing file, so a typo would read as "not yet drawn" rather than as a mistake. Check
// them against the manifest first, where an id either exists or does not.
{
  const unknown = [...REFERENCE_CAST, ...SUBJECTS, ...KNOWN_BAND_VIOLATIONS]
    .filter((id) => !ATLAS[id]);
  check("every id this gate names is a real ATLAS row (no typo can empty the scope)",
    unknown.length === 0, unknown.length ? `unknown [${unknown.join(", ")}]` : "all resolve");
  const overlap = SUBJECTS.filter((id) => REFERENCE_CAST.includes(id));
  check("no sprite is both its own reference and its own subject",
    overlap.length === 0, overlap.length ? `overlap [${overlap.join(", ")}]` : "disjoint");
}

section("the reference cast (frozen: Reliquary monsters predating art-wave 2)");

const reference: { id: string; lum: number; pixels: number }[] = [];
const missingRef: string[] = [];
for (const id of REFERENCE_CAST) {
  const m = measure(id);
  if (!m) { missingRef.push(id); continue; }
  reference.push({ id, ...m });
  console.log(`  ${id.padEnd(34)} ${m.lum.toFixed(1).padStart(6)}   ${m.pixels} px`);
}

// The scope guard. CLAUDE.md's second failure mode is a filter over a table that has
// quietly emptied — "a zero-iteration loop and an always-null resolve the moment that art
// landed". An exact count, printed and asserted, is what makes that visible instead of
// inferred.
check("every frozen reference sprite is still committed and measurable",
  missingRef.length === 0 && reference.length === REFERENCE_CAST.length,
  `${reference.length}/${REFERENCE_CAST.length} measured` +
    (missingRef.length ? `, missing [${missingRef.join(", ")}]` : ""));

// A band with one sprite in it is not a band. This refuses to render a verdict off a
// reference that has collapsed to a point, rather than reporting a confident number.
check("the reference band rests on more than a single sprite",
  reference.length >= 3, `${reference.length} sprites`);

const ceiling = reference.length ? Math.max(...reference.map((r) => r.lum)) : NaN;
const brightestRef = reference.find((r) => r.lum === ceiling);
const refFloor = reference.length ? Math.min(...reference.map((r) => r.lum)) : NaN;
console.log(
  `  band ${refFloor.toFixed(1)} .. ${ceiling.toFixed(1)}` +
  `  (ceiling set by ${brightestRef?.id ?? "—"})`,
);

// --- 3. the rule: no art-wave 2 body is brighter than the cast it joins ---------------------
//
// Per-subject rather than "the brightest subject is under the ceiling", for the reason
// tools/chroma.ts gives for its own per-monster loop: a single aggregate hides which
// sprite is the offender the day one appears.

section("the rule: every art-wave 2 body sits inside the cast's own band");

const subjects: { id: string; lum: number; pixels: number }[] = [];
const missingSub: string[] = [];
for (const id of SUBJECTS) {
  const m = measure(id);
  if (!m) { missingSub.push(id); continue; }
  subjects.push({ id, ...m });
}

check("every art-wave 2 sprite this gate claims to walk is actually committed",
  missingSub.length === 0 && subjects.length === SUBJECTS.length,
  `${subjects.length}/${SUBJECTS.length} measured` +
    (missingSub.length ? `, missing [${missingSub.join(", ")}]` : ""));

for (const s of subjects) {
  const headroom = ceiling - s.lum;
  console.log(
    `  ${s.id.padEnd(34)} ${s.lum.toFixed(1).padStart(6)}   ` +
    `${headroom >= 0 ? "+" : ""}${headroom.toFixed(1)} headroom`,
  );
}

{
  const over = subjects.filter((s) => s.lum > ceiling).map((s) => s.id).sort();
  const pinned = [...KNOWN_BAND_VIOLATIONS].sort();
  check(
    "exactly the art-wave 2 bodies we already knew about sit above the cast's ceiling",
    over.join(",") === pinned.join(","),
    `over [${over.join(", ") || "none"}]  pinned [${pinned.join(", ") || "none"}]`,
  );
}

// Headroom, printed rather than asserted, because it is the honest limit of this gate.
// The ceiling is a *max* over the reference cast, so one bright original (rot-scuttler at
// 68.3, a 291-pixel sprite) sets it for everybody and leaves the darker subjects 20-35
// points of room. That is deliberate — inside the band, art is art and the owner's eye
// governs — but it means this catches a body that LEAVES the cast, not one that drifts
// within it. Anyone reading a green here as "the bodies did not change" is reading it
// wrong, which is exactly the mistake CLAUDE.md records against the campaign check.
{
  const inBand = subjects.filter((s) => s.lum <= ceiling);
  const tightest = inBand.reduce((a, b) => (ceiling - a.lum < ceiling - b.lum ? a : b));
  console.log(
    `\n  tightest in-band headroom: ${tightest.id} at ${(ceiling - tightest.lum).toFixed(1)}`,
  );
}

console.log(`  walked ${reference.length} reference sprite(s) and ${subjects.length} subject(s)`);

if (failures) {
  console.log(`\nbody-luminance gate: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nbody-luminance gate: all checks passed");
