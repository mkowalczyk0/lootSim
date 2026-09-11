/**
 * Standards — docket §3, `docs/gem-sinks.md` §4A. A Standard is one thing a character
 * actually did, made visible: "Death March IV · Delve 22." Pure data and pure functions
 * only, per the `data/` rule — no `GameState` import, no simulation import.
 *
 * **The split is the whole design, and it is why this file is safe to build at all.**
 * The mark itself is free and earned: `standardsFor` is a pure read of badge fields a
 * `Player` already carries (`challengerBadges` and its four siblings), never stored
 * separately, so a flown mark can never claim something that stopped being true — there
 * is nothing to desync, because there is nothing cached. Gems buy only the *cloth* a mark
 * renders in (`BannerStyle`), which carries no information about what was done. Neither
 * a mark id nor a banner style is ever read by `game/`; `tools/smoke.ts` asserts both
 * halves the same way `data/cosmetics.ts` and the Trophy Hall are already asserted —
 * byte-identical sheet, dressed or not, flying or not.
 */

import { CLASSES, type ClassId } from "./classes";
import { challengerName } from "./challenger";
import { MODES, type RunModeId } from "./modes";
import { PLANETS } from "./planets";
import { RAIDS } from "./raids";

/** One earned, displayable achievement. `id` is stable and never renders on its own. */
export interface StandardMark {
  readonly id: string;
  readonly label: string;
}

/**
 * The badge fields `standardsFor` reads, named structurally rather than as `Player` —
 * `data/` may not import `game/`, and a `Player` satisfies this shape without either
 * side needing to know about the other. Every field here already exists on `Player` for
 * a different reason (the Path screen's trophy rows); this file adds no new bookkeeping,
 * only a reading of it.
 */
export interface StandardBadges {
  readonly legendComplete: boolean;
  readonly delveChallengerBadges: readonly number[];
  readonly towerChallengerBadges: readonly number[];
  readonly challengerBadges: Readonly<Record<string, number>>;
  readonly planetChallengerBadges: Readonly<Record<string, number>>;
  readonly raidChallengerBadges: Readonly<Record<string, number>>;
}

/** Fixed-length activities whose badge is a bare tier, not a (tier, depth) pair. */
const FIXED_MODE_IDS: readonly RunModeId[] = ["abyss", "hoard", "vigil", "convergence", "memory"];

/**
 * Every Standard a character has actually earned, derived fresh from its badge fields —
 * never stored, so what a player CAN fly and what they DID fly can never drift apart.
 * Order is deepest/hardest first within each family, which is also the order the picker
 * screen shows them in.
 */
export function standardsFor(badges: StandardBadges, classId: ClassId): StandardMark[] {
  const marks: StandardMark[] = [];

  if (badges.legendComplete) {
    marks.push({ id: "legend", label: `The Unfinished ${CLASSES[classId].name}, felled` });
  }

  for (let i = badges.delveChallengerBadges.length - 1; i >= 0; i--) {
    const depth = badges.delveChallengerBadges[i]!;
    if (depth > 0) marks.push({ id: `delve:${i + 1}`, label: `${challengerName(i + 1)} · Delve ${depth}` });
  }
  for (let i = badges.towerChallengerBadges.length - 1; i >= 0; i--) {
    const height = badges.towerChallengerBadges[i]!;
    if (height > 0) marks.push({ id: `tower:${i + 1}`, label: `${challengerName(i + 1)} · Tower ${height}` });
  }

  for (const mode of FIXED_MODE_IDS) {
    const tier = badges.challengerBadges[mode] ?? 0;
    if (tier > 0) marks.push({ id: `mode:${mode}`, label: `${MODES[mode].name} ${challengerName(tier)}` });
  }

  for (const [id, tier] of Object.entries(badges.planetChallengerBadges)) {
    const p = PLANETS.find((x) => x.id === id);
    if (p && tier > 0) marks.push({ id: `planet:${id}`, label: `${p.name}, Tier ${tier}` });
  }
  for (const [id, tier] of Object.entries(badges.raidChallengerBadges)) {
    const r = RAIDS.find((x) => x.id === id);
    if (r && tier > 0) marks.push({ id: `raid:${id}`, label: `${r.name}, Tier ${tier}` });
  }

  return marks;
}

/** The label for a flown mark id, or null if it isn't (or is no longer) earned. Every
 *  render site goes through this rather than trusting the id alone — the structural half
 *  of "never display a badge you didn't earn": a retired or unearned id simply renders
 *  nothing, the same way a retired cosmetic id drops silently on load. */
export function standardLabel(
  badges: StandardBadges, classId: ClassId, markId: string | null,
): string | null {
  if (!markId) return null;
  return standardsFor(badges, classId).find((m) => m.id === markId)?.label ?? null;
}

// --- the cloth ---------------------------------------------------------------

export interface BannerStyle {
  readonly id: string;
  readonly name: string;
  /** Gems. 0 is the free default every account starts flying marks in. */
  readonly price: number;
  readonly color: string;
  readonly border: string;
}

export const DEFAULT_BANNER_STYLE = "parchment";

/** `docs/gem-sinks.md` §4A: 250 gems, above a Boutique capsule's 160 — the shop's own
 *  "certainty costs more than a gamble" rule. The marginal cost of a new one is a
 *  data row: no art, since the cloth is colour and typography, never a sprite. */
export const BANNER_STYLES: readonly BannerStyle[] = [
  { id: "parchment", name: "Parchment", price: 0, color: "#c7cdd6", border: "#4b5563" },
  { id: "crimson", name: "Crimson Field", price: 250, color: "#ef4444", border: "#7f1d1d" },
  { id: "gilded", name: "Gilded", price: 250, color: "#fbbf24", border: "#92400e" },
  { id: "azure", name: "Azure Banner", price: 250, color: "#38bdf8", border: "#0c4a6e" },
  { id: "void-touched", name: "Void-Touched", price: 250, color: "#c084fc", border: "#4c1d95" },
  { id: "verdant", name: "Verdant", price: 250, color: "#4ade80", border: "#14532d" },
];

const BANNER_STYLES_BY_ID: Record<string, BannerStyle> = Object.fromEntries(
  BANNER_STYLES.map((b) => [b.id, b]),
);

export function bannerStyle(id: string): BannerStyle {
  return BANNER_STYLES_BY_ID[id] ?? BANNER_STYLES[0]!;
}

/** A style with `price` 0 is owned by construction; everything else needs to be in the
 *  account's purchased list. */
export function styleOwned(style: BannerStyle, ownedIds: readonly string[]): boolean {
  return style.price <= 0 || ownedIds.includes(style.id);
}

/** Only ids that still exist survive a load, the same rule `normalizeOwned` (cosmetics)
 *  and `normalizeAppearance` already follow — a retired style is dropped, not kept as a
 *  ghost. */
export function normalizeOwnedStyles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id === "string" && BANNER_STYLES_BY_ID[id]) seen.add(id);
  }
  return [...seen];
}

/** A flown banner style always resolves to something real — a retired or malformed id
 *  falls back to the free default rather than drawing nothing or crashing a render site. */
export function normalizeFlownStyle(raw: unknown): string {
  return typeof raw === "string" && BANNER_STYLES_BY_ID[raw] ? raw : DEFAULT_BANNER_STYLE;
}
