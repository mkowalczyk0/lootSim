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

export const ELEMENTS = ["physical", "fire", "cold", "lightning", "poison", "void"] as const;
export type Element = (typeof ELEMENTS)[number];

/** Everything except physical. Used when rolling an element for gear or a monster. */
export const MAGIC_ELEMENTS = ELEMENTS.filter((e) => e !== "physical") as readonly Exclude<Element, "physical">[];

export const ELEMENT_LABELS: Record<Element, string> = {
  physical: "Physical",
  fire: "Fire",
  cold: "Cold",
  lightning: "Lightning",
  poison: "Poison",
  void: "Void",
};

export const ELEMENT_SHORT: Record<Element, string> = {
  physical: "PHY", fire: "FIR", cold: "CLD", lightning: "LTG", poison: "PSN", void: "VOD",
};

export const ELEMENT_COLORS: Record<Element, string> = {
  physical: "#e2e8f0",
  fire: "#ff7a2f",
  cold: "#7dd3fc",
  lightning: "#fde047",
  poison: "#84cc16",
  void: "#c084fc",
};

/** Adjective hung on an elementally infused monster. */
export const ELEMENT_PREFIX: Record<Element, string> = {
  physical: "Honed",
  fire: "Smoldering",
  cold: "Rimed",
  lightning: "Storm-Touched",
  poison: "Venomous",
  void: "Veiled",
};

/** Suffix the item roller hangs on a piece of gear carrying an essence. */
export const ELEMENT_SUFFIX: Record<Element, string> = {
  physical: "of Force",
  fire: "of Embers",
  cold: "of Frost",
  lightning: "of Storms",
  poison: "of Rot",
  void: "of the Veil",
};

/** Suffix for gear that wards against an element rather than dealing it. */
export const ELEMENT_WARD_SUFFIX: Record<Element, string> = {
  physical: "of Bracing",
  fire: "of Ember Warding",
  cold: "of Frost Warding",
  lightning: "of Storm Warding",
  poison: "of Rot Warding",
  void: "of Veil Warding",
};

// --- ailments -------------------------------------------------------------

export type StatusKind = "burn" | "chill" | "shock" | "venom" | "drain";

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
};

export const STATUS_FOR_ELEMENT: Record<Element, StatusKind | null> = {
  physical: null,
  fire: "burn",
  cold: "chill",
  lightning: "shock",
  poison: "venom",
  void: "drain",
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
  return { physical: 0, fire: 0, cold: 0, lightning: 0, poison: 0, void: 0 };
}

export function addResists(into: Resists, from: Partial<Resists>): Resists {
  for (const e of ELEMENTS) into[e] += from[e] ?? 0;
  return into;
}
