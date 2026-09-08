/**
 * Monster affixes — modular traits that ride on an ordinary monster and change how the
 * fight goes (UAT §3). The reference points are Risk of Rain 2's elite affixes and
 * Path of Exile's map mods: a handful of readable, stacking modifiers rather than a
 * bestiary of hand-built variants.
 *
 * Pure data. An affix is a record of fields, never a monster subclass — adding one is
 * filling in id / name / description / visual / behaviour tag / weighting / restrictions,
 * and only if it needs a behaviour the engine doesn't have yet does it also cost one
 * `case` in the matching hook (`tickAffixes` / `affixOnHitHero` / `affixOnDeath`) in
 * `game/dungeon.ts`.
 *
 * The design goal from the spec: most monsters have no affix at all, affixes get more
 * common and more dangerous as the floor does, and the `greater` tier is the one that
 * makes a player go "oh shit, it has THAT one".
 */

import type { Rng } from "../core/rng";

export type AffixBucket = "defensive" | "offensive" | "behavioural" | "antiPlayer" | "onDeath";

/** How common an affix is. `greater` affixes are rarer and nastier, and gated deeper. */
export type AffixTier = "lesser" | "greater";

/** Spawn-time stat deltas, applied as multipliers on the depth-scaled final numbers. */
export interface AffixStatMod {
  readonly healthMult?: number;
  readonly damageMult?: number;
  readonly speedMult?: number;
  /** Multiplies incoming damage. 0.7 is "takes 30% less". */
  readonly damageTakenMult?: number;
  /** Multiplies attack cooldown. 0.65 attacks ~55% more often. */
  readonly attackRateMult?: number;
  /** Flat radius bump, world units — a visibly bigger body. */
  readonly radius?: number;
  /** Flat resist-all bump. */
  readonly resist?: number;
}

export type PeriodicKind = "blink" | "regenWard" | "healAura" | "summon";
export type OnHitHeroKind = "leech" | "caustic" | "enfeeble" | "sap" | "arc";
export type OnDeathKind = "detonate" | "miasma" | "volley" | "revitalise" | "split";

export interface MonsterAffix {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly bucket: AffixBucket;
  readonly tier: AffixTier;
  /** Relative spawn weight within its tier. */
  readonly weight: number;
  /** Floor depth this affix starts appearing on. */
  readonly minDepth: number;
  /** Affix ids this one refuses to share a monster with. */
  readonly incompatibleWith?: readonly string[];
  /** Archetype kinds this affix never rolls on (`EnemyArchetype.kind`). */
  readonly forbidKinds?: readonly string[];
  /** Prepended to the monster's name — "Warded Vicious Marauder". */
  readonly prefix: string;
  /** Renderer hints: an outline tint and a small orbiting glyph. */
  readonly visual: { readonly tint: string; readonly glyph: string };
  readonly onSpawn?: AffixStatMod;
  readonly periodic?: { readonly kind: PeriodicKind; readonly every: number };
  readonly onHitHero?: OnHitHeroKind;
  readonly onDeath?: OnDeathKind;
}

export const MONSTER_AFFIXES: readonly MonsterAffix[] = [
  // --- defensive -------------------------------------------------------
  {
    id: "stony", name: "Armored", bucket: "defensive", tier: "lesser",
    description: "Takes far less damage, but lumbers.",
    weight: 1, minDepth: 1, prefix: "Armored",
    visual: { tint: "#9aa4b2", glyph: "▪" },
    onSpawn: { damageTakenMult: 0.72, speedMult: 0.88, resist: 12 },
  },
  {
    id: "warded", name: "Warded", bucket: "defensive", tier: "greater",
    description: "Rebuilds an absorb shield every few seconds — burst it down or wait it out.",
    weight: 1, minDepth: 4, prefix: "Warded", forbidKinds: ["swarmer"],
    incompatibleWith: ["stony"],
    visual: { tint: "#7dd3fc", glyph: "◇" },
    periodic: { kind: "regenWard", every: 3 },
  },
  // --- offensive ------------------------------------------------------
  {
    id: "vicious", name: "Vicious", bucket: "offensive", tier: "lesser",
    description: "Hits much harder than its kind should.",
    weight: 1.1, minDepth: 1, prefix: "Vicious",
    visual: { tint: "#ef4444", glyph: "✦" },
    onSpawn: { damageMult: 1.4 },
  },
  {
    id: "frenzied", name: "Frenzied", bucket: "offensive", tier: "lesser",
    description: "Moves and attacks in a blur.",
    weight: 1, minDepth: 2, prefix: "Frenzied",
    visual: { tint: "#fbbf24", glyph: "»" },
    onSpawn: { attackRateMult: 0.62, speedMult: 1.3 },
  },
  {
    id: "caustic", name: "Caustic", bucket: "offensive", tier: "greater",
    description: "Every hit lands its element's ailment, hard.",
    weight: 1, minDepth: 3, prefix: "Caustic",
    visual: { tint: "#a3e635", glyph: "☣" },
    onHitHero: "caustic",
  },
  {
    id: "arclight", name: "Arcing", bucket: "offensive", tier: "greater",
    description: "Its hits fork lightning to either side of you.",
    weight: 0.9, minDepth: 5, prefix: "Arcing",
    visual: { tint: "#a5b4fc", glyph: "⚡" },
    onHitHero: "arc",
  },
  // --- behavioural --------------------------------------------------
  {
    id: "blink", name: "Blinkbound", bucket: "behavioural", tier: "greater",
    description: "Teleports to close the gap — kiting doesn't work.",
    weight: 1, minDepth: 4, prefix: "Blinkbound", forbidKinds: ["boss"],
    visual: { tint: "#c084fc", glyph: "✧" },
    periodic: { kind: "blink", every: 3.4 },
  },
  {
    id: "splitting", name: "Splitting", bucket: "behavioural", tier: "greater",
    description: "Bursts into two smaller copies when it dies.",
    weight: 1, minDepth: 3, prefix: "Splitting",
    forbidKinds: ["swarmer", "brute", "boss"],
    visual: { tint: "#4ade80", glyph: "⋔" },
    onDeath: "split",
  },
  {
    id: "marshal", name: "Marshalling", bucket: "behavioural", tier: "greater",
    description: "Keeps its distance and calls in reinforcements.",
    weight: 0.8, minDepth: 6, prefix: "Marshalling",
    forbidKinds: ["boss", "swarmer"],
    visual: { tint: "#f0abfc", glyph: "⚑" },
    periodic: { kind: "summon", every: 6 },
  },
  // --- anti-player -------------------------------------------------
  {
    id: "enfeebling", name: "Enfeebling", bucket: "antiPlayer", tier: "lesser",
    description: "Its hits leave you Weakened.",
    weight: 1, minDepth: 4, prefix: "Enfeebling",
    visual: { tint: "#6b7280", glyph: "↓" },
    onHitHero: "enfeeble",
  },
  {
    id: "draining", name: "Draining", bucket: "antiPlayer", tier: "greater",
    description: "Every hit burns a chunk of your mana.",
    weight: 0.9, minDepth: 5, prefix: "Draining",
    visual: { tint: "#38bdf8", glyph: "✂" },
    onHitHero: "sap",
  },
  {
    id: "leeching", name: "Leeching", bucket: "antiPlayer", tier: "greater",
    description: "Heals itself for a slice of the damage it deals you.",
    weight: 1, minDepth: 4, prefix: "Leeching",
    visual: { tint: "#fb7185", glyph: "❥" },
    onHitHero: "leech",
  },
  // --- death effects ---------------------------------------------
  {
    id: "volatile", name: "Volatile", bucket: "onDeath", tier: "lesser",
    description: "Detonates when killed — don't be on top of it.",
    weight: 1.1, minDepth: 1, prefix: "Volatile",
    visual: { tint: "#fb923c", glyph: "✺" },
    onDeath: "detonate",
  },
  {
    id: "miasmic", name: "Miasmic", bucket: "onDeath", tier: "lesser",
    description: "Leaves a spreading pool of rot where it falls.",
    weight: 1, minDepth: 2, prefix: "Miasmic",
    visual: { tint: "#84cc16", glyph: "☁" },
    onDeath: "miasma",
  },
  {
    id: "vengeful", name: "Vengeful", bucket: "onDeath", tier: "greater",
    description: "Fires a ring of bolts with its last breath.",
    weight: 0.9, minDepth: 5, prefix: "Vengeful",
    visual: { tint: "#f87171", glyph: "✷" },
    onDeath: "volley",
  },
  {
    id: "revitalising", name: "Revitalising", bucket: "onDeath", tier: "greater",
    description: "Its death heals every monster near it — kill it last, or kill it fast.",
    weight: 0.8, minDepth: 4, prefix: "Revitalising",
    incompatibleWith: ["volatile"],
    visual: { tint: "#34d399", glyph: "✚" },
    onDeath: "revitalise",
  },
];

export const AFFIX_BY_ID: Readonly<Record<string, MonsterAffix>> = Object.fromEntries(
  MONSTER_AFFIXES.map((a) => [a.id, a]),
);

/**
 * How many affixes a fresh monster rolls. Most ordinary monsters get none; the odds and
 * the stack size climb with depth and — hardest — with `danger` (rift tier × Challenger),
 * so a plain delve floor stays mild while a Challenger run or a deep rift is where affixes
 * take over. An elite is guaranteed a small handful — that is most of what makes it an
 * elite (UAT §4).
 */
export function affixCountFor(depth: number, danger: number, isElite: boolean, rng: Rng): number {
  const d = Math.max(1, depth);
  if (isElite) {
    // Item E only gives an elite a modest edge — one trait always, a second on deeper or
    // higher-danger floors. Item F is what turns an elite into a real mini-boss (a
    // guaranteed 2-3, a distinct health bar, a telegraphed ability) and thins the elite
    // spawn rate to roughly one a floor so they stay an event rather than a tax.
    const second = rng.chance(clampNum(0.12 + d * 0.012 + (danger - 1) * 0.12, 0, 0.7));
    return 1 + (second ? 1 : 0);
  }
  const anyChance = clampNum(
    0.028 + d * 0.007 + (d > 12 ? (d - 12) * 0.006 : 0) + (danger - 1) * 0.14, 0, 0.6);
  if (!rng.chance(anyChance)) return 0;
  const secondChance = clampNum(d * 0.006 + (danger - 1) * 0.13, 0, 0.42);
  return rng.chance(secondChance) ? 2 : 1;
}

/**
 * Picks `count` distinct affixes for a monster of `kind` on a floor of `depth` / `danger`,
 * honouring every spawn restriction and synergy rule. `greater`-tier affixes only enter
 * the pool on genuinely deep or elevated-danger content (or on an elite), which keeps a
 * shallow calm floor's rare affix a mild one. Returns fewer than `count` — possibly zero —
 * if the filtered pool runs dry.
 */
export function rollMonsterAffixes(
  kind: string, depth: number, danger: number, count: number, rng: Rng,
  opts: { elite?: boolean } = {},
): MonsterAffix[] {
  if (count <= 0) return [];
  // `greater` affixes — the "oh shit" tier — are held back to genuinely deep or elevated-
  // danger content: deep delve floors, every rift, anything with Challenger on, and a
  // planet's second tier onward. An elite always qualifies. This keeps early delve floors
  // and a first planet expedition reading as ordinary (spec §3: uncommon in normal play).
  const greaterOk = opts.elite === true || (depth >= 11 && (danger > 1.05 || depth >= 16));
  const pool = MONSTER_AFFIXES.filter(
    (a) =>
      a.minDepth <= depth &&
      !(a.forbidKinds?.includes(kind) ?? false) &&
      (greaterOk || a.tier === "lesser"),
  );

  const chosen: MonsterAffix[] = [];
  const blocked = new Set<string>();
  const clash = (x: MonsterAffix, y: MonsterAffix): boolean =>
    (x.incompatibleWith?.includes(y.id) ?? false) || (y.incompatibleWith?.includes(x.id) ?? false);
  for (let i = 0; i < count; i++) {
    const options = pool.filter(
      (a) => !chosen.includes(a) && !blocked.has(a.id) && !chosen.some((c) => clash(a, c)),
    );
    if (options.length === 0) break;
    const weights = Object.fromEntries(options.map((a) => [a.id, a.weight]));
    const pick = AFFIX_BY_ID[rng.weighted(weights)]!;
    chosen.push(pick);
    for (const bad of pick.incompatibleWith ?? []) blocked.add(bad);
  }
  return chosen;
}

/** The fully-resolved spawn multipliers for a monster — every field present. */
export interface AffixSpawnTotals {
  healthMult: number;
  damageMult: number;
  speedMult: number;
  damageTakenMult: number;
  attackRateMult: number;
  radius: number;
  resist: number;
}

/** Folds a monster's affixes into one set of spawn multipliers. */
export function foldAffixSpawn(affixes: readonly MonsterAffix[]): AffixSpawnTotals {
  const out: AffixSpawnTotals = {
    healthMult: 1, damageMult: 1, speedMult: 1, damageTakenMult: 1,
    attackRateMult: 1, radius: 0, resist: 0,
  };
  for (const a of affixes) {
    const s = a.onSpawn;
    if (!s) continue;
    out.healthMult *= s.healthMult ?? 1;
    out.damageMult *= s.damageMult ?? 1;
    out.speedMult *= s.speedMult ?? 1;
    out.damageTakenMult *= s.damageTakenMult ?? 1;
    out.attackRateMult *= s.attackRateMult ?? 1;
    out.radius += s.radius ?? 0;
    out.resist += s.resist ?? 0;
  }
  return out;
}

/** "Warded Vicious " — the affix half of a monster's name, in bucket order. */
export function affixPrefix(affixes: readonly MonsterAffix[]): string {
  if (affixes.length === 0) return "";
  return affixes.map((a) => a.prefix).join(" ") + " ";
}

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
