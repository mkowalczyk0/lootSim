/**
 * Elemental damage and the ailments it leaves behind.
 *
 * Physical is the baseline: it does what the number says and nothing else. Every other
 * element trades a little raw damage for a rider — a burn that keeps ticking, a chill
 * that takes the legs off something, a shock that makes the next hit hurt more. That
 * rider is the point: it's what makes two weapons of the same rarity feel different,
 * and it's the vocabulary the bosses speak in too.
 *
 * Pure data. Resistance math lives here so the player and the monsters mitigate damage
 * with exactly the same formula.
 */

export const ELEMENTS = [
  "physical", "fire", "cold", "lightning", "poison", "void", "holy", "arcane", "nature",
] as const;
export type Element = (typeof ELEMENTS)[number];

/** Everything except physical. */
export const MAGIC_ELEMENTS = ELEMENTS.filter((e) => e !== "physical") as readonly Exclude<Element, "physical">[];

/**
 * The elements the *random* generators reach for — loot affixes, elite infusion, biome
 * affinity. `holy`, `arcane` and `nature` are full elements (they have a resist stat, a
 * material, an essence and an ailment) but are deliberately kept out of the random pool:
 * they're the caster/holy/wild identities that should come from a class's own kit or a
 * deliberate craft, not diluted across every dropped ring. Content or a later balance
 * pass can widen this back to `MAGIC_ELEMENTS`.
 */
export const LOOT_ELEMENTS = ["fire", "cold", "lightning", "poison", "void"] as const;
export type LootElement = (typeof LOOT_ELEMENTS)[number];

/**
 * The other half of the magic elements: authored in full, kept out of the random pool.
 *
 * Derived rather than listed, so it cannot drift if `LOOT_ELEMENTS` is ever widened —
 * "reserved" means exactly "a magic element the random generators don't reach for", and
 * that is one statement, not two lists to keep in agreement.
 *
 * **Reserved is not unauthored.** Each of these has a resist stat, a material, a Forge
 * essence, an ailment and an affix pair, and they are reachable through every path that
 * names an element on purpose: a crafted essence, an element cache, a floor whose own
 * element is one of them. Until Sept 2026 the affix pair was the exception — it was only
 * ever built from `LOOT_ELEMENTS`, so a holy essence took the material and changed
 * nothing. See `RESERVED_ELEMENTAL_MODS` in `data/items.ts`.
 */
export const RESERVED_ELEMENTS = MAGIC_ELEMENTS.filter(
  (e) => !(LOOT_ELEMENTS as readonly string[]).includes(e),
) as readonly Exclude<Element, "physical" | LootElement>[];

export const ELEMENT_LABELS: Record<Element, string> = {
  physical: "Physical",
  fire: "Fire",
  cold: "Cold",
  lightning: "Lightning",
  poison: "Poison",
  void: "Void",
  holy: "Holy",
  arcane: "Arcane",
  nature: "Nature",
};

export const ELEMENT_SHORT: Record<Element, string> = {
  physical: "PHY", fire: "FIR", cold: "CLD", lightning: "LTG", poison: "PSN", void: "VOD",
  holy: "HLY", arcane: "ARC", nature: "NAT",
};

export const ELEMENT_COLORS: Record<Element, string> = {
  physical: "#e2e8f0",
  fire: "#ff7a2f",
  cold: "#7dd3fc",
  lightning: "#fde047",
  poison: "#84cc16",
  void: "#c084fc",
  holy: "#fde68a",
  arcane: "#f0abfc",
  nature: "#34d399",
};

/** Adjective hung on an elementally infused monster. */
export const ELEMENT_PREFIX: Record<Element, string> = {
  physical: "Honed",
  fire: "Smoldering",
  cold: "Rimed",
  lightning: "Storm-Touched",
  poison: "Venomous",
  void: "Veiled",
  holy: "Hallowed",
  arcane: "Runed",
  nature: "Feral",
};

/** Suffix the item roller hangs on a piece of gear carrying an essence. */
export const ELEMENT_SUFFIX: Record<Element, string> = {
  physical: "of Force",
  fire: "of Embers",
  cold: "of Frost",
  lightning: "of Storms",
  poison: "of Rot",
  void: "of the Veil",
  holy: "of Radiance",
  arcane: "of Mysteries",
  nature: "of the Wild",
};

/** Suffix for gear that wards against an element rather than dealing it. */
export const ELEMENT_WARD_SUFFIX: Record<Element, string> = {
  physical: "of Bracing",
  fire: "of Ember Warding",
  cold: "of Frost Warding",
  lightning: "of Storm Warding",
  poison: "of Rot Warding",
  void: "of Veil Warding",
  holy: "of Light Warding",
  arcane: "of Rune Warding",
  nature: "of Wild Warding",
};

// --- ailments -------------------------------------------------------------

export type StatusKind = "burn" | "chill" | "shock" | "venom" | "drain" | "sear" | "sunder";

export interface StatusSpec {
  readonly kind: StatusKind;
  readonly label: string;
  /** Single-letter badge for the HUD, because there are no art assets. */
  readonly glyph: string;
  readonly element: Element;
  readonly duration: number;
  /** Damage per second, as a fraction of the hit that applied it. */
  readonly dps: number;
  /** Movement multiplier while this is on you. 1 means no slow. */
  readonly slow: number;
  /** Multiplies damage the victim takes. 1 means no amplification. */
  readonly amplify: number;
  readonly maxStacks: number;
  /** Mana torn out per second — void only, and only meaningful on the player. */
  readonly manaBurn: number;
}

export const STATUSES: Record<StatusKind, StatusSpec> = {
  burn: {
    kind: "burn", label: "Burning", glyph: "B", element: "fire",
    duration: 3.2, dps: 0.3, slow: 1, amplify: 1, maxStacks: 3, manaBurn: 0,
  },
  chill: {
    // The defensive ailment: chilled things are much easier to walk away from.
    kind: "chill", label: "Chilled", glyph: "C", element: "cold",
    duration: 2.8, dps: 0.05, slow: 0.55, amplify: 1, maxStacks: 1, manaBurn: 0,
  },
  shock: {
    // No damage of its own — it makes everything else land harder.
    kind: "shock", label: "Shocked", glyph: "S", element: "lightning",
    duration: 3, dps: 0, slow: 1, amplify: 1.28, maxStacks: 1, manaBurn: 0,
  },
  venom: {
    // Weak per stack, long, and stacks high: poison rewards sustained pressure.
    kind: "venom", label: "Poisoned", glyph: "P", element: "poison",
    duration: 5.5, dps: 0.14, slow: 0.92, amplify: 1, maxStacks: 5, manaBurn: 0,
  },
  drain: {
    kind: "drain", label: "Drained", glyph: "V", element: "void",
    duration: 4, dps: 0.13, slow: 1, amplify: 1.12, maxStacks: 2, manaBurn: 6,
  },
  sear: {
    // Holy's rider: a radiant burn. Same bite per tick as fire's burn but it doesn't
    // stack — one clean judgement rather than a spreading fire, so it's the softer of
    // the two damage-over-time riders overall.
    kind: "sear", label: "Seared", glyph: "H", element: "holy",
    duration: 2.8, dps: 0.3, slow: 1, amplify: 1, maxStacks: 1, manaBurn: 0,
  },
  sunder: {
    // Arcane's rider: the target's defences come apart. No damage of its own; a milder
    // shock that also eats a little mana, the way raw arcane force does.
    kind: "sunder", label: "Sundered", glyph: "A", element: "arcane",
    duration: 3, dps: 0, slow: 1, amplify: 1.16, maxStacks: 1, manaBurn: 2,
  },
};

export const STATUS_FOR_ELEMENT: Record<Element, StatusKind | null> = {
  physical: null,
  fire: "burn",
  cold: "chill",
  lightning: "shock",
  poison: "venom",
  void: "drain",
  holy: "sear",
  arcane: "sunder",
  // Nature shares poison's venom rider — the same creeping rot, a different name.
  nature: "venom",
};

/** Chance an ordinary elemental hit inflicts its ailment. Skills and bosses override it. */
export const AILMENT_CHANCE = 0.4;

// --- resistance -----------------------------------------------------------

/**
 * Resistance is asymptotic, exactly like armor: a lot of it helps enormously and none
 * of it is ever total immunity. Hard-capped so a boss's signature element always bites.
 */
export const RESIST_CAP = 0.75;

export function resistFraction(resist: number): number {
  if (resist <= 0) return Math.max(-0.5, resist / 160);
  return Math.min(RESIST_CAP, resist / (resist + 170));
}

export type Resists = Record<Element, number>;

export function zeroResists(): Resists {
  return {
    physical: 0, fire: 0, cold: 0, lightning: 0, poison: 0, void: 0,
    holy: 0, arcane: 0, nature: 0,
  };
}

export function addResists(into: Resists, from: Partial<Resists>): Resists {
  for (const e of ELEMENTS) into[e] += from[e] ?? 0;
  return into;
}
