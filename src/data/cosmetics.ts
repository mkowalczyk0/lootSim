/**
 * Cosmetics — the vanity half of the game.
 *
 * Everything in here is **powerless on purpose**. A cosmetic never touches a modifier,
 * never rolls a stat and is never read by the simulation; it exists so that two people
 * running the same build don't have to be the same character. That separation is what
 * lets the capsules be generous: nothing you pull out of one can make a floor easier.
 *
 * ## And a cosmetic may never lie about a simulation quantity
 *
 * The rule above is about the character *sheet*, and `tools/smoke.ts` enforces it there —
 * a fully-dressed character has a byte-identical sheet to an undressed one. It does not by
 * itself forbid the more dangerous thing, which has no number in it at all:
 *
 * > **A cosmetic must never change what the player believes a simulation value is.**
 *
 * The live example, and the reason this is written down. A weapon skin looks like it could
 * be one object worn over any weapon — it is only a picture, and the draw path does not
 * check. But a weapon's `reach` (30 to 130) and `arc` (0.07pi to 2pi) belong to its
 * **family**, `render/draw.ts` rotates the sprite along the swing that actually resolved,
 * and each weapon's `worldScale` in the atlas manifest was tuned so the drawn weapon spans
 * roughly the reach its hitbox has. So a whip-shaped skin worn over claws would draw ~45
 * world units of weapon in front of a 34-unit hitbox, and a ring-shaped chakram thrust
 * along a whip's 0.08pi line would not be a stylish whip, it would be a broken picture.
 *
 * That is worse than a cosmetic granting a stat, not better. A stat is at least legible in
 * the compare panel; this is invisible, and it is wrong in the exact place the game asks
 * for skill — reading distance and dashing. Hence **a weapon skin is authored per weapon
 * family** (`ATLAS_WEAPON_SKINS` in `render/atlas/manifest.ts`), never worn across
 * families. The next person to look at this will reach for family-agnostic skins because
 * it looks like plumbing; it is not, it is this rule.
 *
 * The economy is deliberately its own thing too. Cosmetics are bought with **gems**,
 * which drop in the dungeon and are spent nowhere else — coins buy power, gems buy
 * personality, and the two never convert into each other. Duplicates come back as gems
 * so a bad pull is disappointing rather than worthless.
 *
 * `render/pixels.ts` owns the artwork; a cosmetic points at a grid by name and supplies
 * the colours. That way this file stays pure data and the renderer stays free of prices.
 *
 * Pure data.
 */

import { RARITIES, type Rarity } from "./rarity";

/**
 * Where a cosmetic goes. Five of these are pixels layered onto the character; `aura` is
 * particles that follow you around, and `weapon` is a skin for one weapon **family** —
 * see the "may never lie" rule in the file header for why it cannot be worn across
 * families, and `WeaponPalette` below for what it used to be.
 */
export const COSMETIC_SLOTS = ["hat", "ears", "face", "back", "aura", "weapon"] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

export const COSMETIC_SLOT_LABELS: Record<CosmeticSlot, string> = {
  hat: "Hat", ears: "Ears", face: "Face", back: "Back", aura: "Aura", weapon: "Weapon Skin",
};

/** How an aura's motes behave. The renderer switches on this and nothing else. */
export type AuraKind = "petal" | "ember" | "star" | "bubble" | "snow" | "void";

/** Colours painted over a weapon's blade, grip and jewel. */
export interface WeaponPalette {
  readonly edge: string;
  readonly shade: string;
  readonly grip: string;
  readonly jewel: string;
  /** Optional bloom around the weapon. Null means an ordinary lump of metal. */
  readonly glow: string | null;
}

export interface Cosmetic {
  readonly id: string;
  readonly name: string;
  readonly slot: CosmeticSlot;
  readonly rarity: Rarity;
  /** One deadpan line, shown in the wardrobe. */
  readonly blurb: string;
  /** Key into `COSMETIC_ART`. Null for auras and weapon skins, which have no grid. */
  readonly art: string | null;
  /** Fills palette keys 1, 2 and 3 of the grid, in order. */
  readonly colors: readonly string[];
  readonly aura: { readonly kind: AuraKind; readonly color: string } | null;
  readonly weapon: WeaponPalette | null;
}

function look(
  id: string, name: string, slot: CosmeticSlot, rarity: Rarity,
  art: string, colors: readonly string[], blurb: string,
): Cosmetic {
  return { id, name, slot, rarity, blurb, art, colors, aura: null, weapon: null };
}

function aura(
  id: string, name: string, rarity: Rarity, kind: AuraKind, color: string, blurb: string,
): Cosmetic {
  return { id, name, slot: "aura", rarity, blurb, art: null, colors: [color], aura: { kind, color }, weapon: null };
}

function skin(
  id: string, name: string, rarity: Rarity, weapon: WeaponPalette, blurb: string,
): Cosmetic {
  return { id, name, slot: "weapon", rarity, blurb, art: null, colors: [weapon.edge], aura: null, weapon };
}

/**
 * The whole wardrobe. Order is display order, so keep a slot's entries together and
 * roughly ascending in rarity — the capsule roll doesn't care, but a person reading the
 * list does.
 */
export const COSMETICS: readonly Cosmetic[] = [
  // --- hats ---
  look("hatStraw", "Sun Hat, Underground", "hat", "common", "hatStraw",
    ["#fcd34d", "#d97706", "#a16207"], "There is no sun down here. Wear it anyway."),
  look("hatBeanie", "Warm Hat", "hat", "common", "hatBeanie",
    ["#ef4444", "#b91c1c", "#fca5a5"], "The dungeon is drafty and nobody talks about it."),
  look("hatChef", "Toque of the Dungeon Chef", "hat", "uncommon", "hatChef",
    ["#f8fafc", "#e2e8f0", "#cbd5e1"], "Nothing edible has been found on any floor so far."),
  look("hatWitch", "Pointed Hat of Mild Menace", "hat", "rare", "hatWitch",
    ["#4c1d95", "#312e81", "#fbbf24"], "Does not cast anything. Looks like it might."),
  look("hatFlower", "Circlet of Small Flowers", "hat", "rare", "hatFlower",
    ["#f9a8d4", "#84cc16", "#fbcfe8"], "Picked from a hazard. They grew back."),
  look("hatTop", "Very Tall Hat", "hat", "epic", "hatTop",
    ["#1f2937", "#111827", "#7c3aed"], "For the formal parts of a massacre."),
  look("hatCrown", "Crown of Nobody in Particular", "hat", "legendary", "hatCrown",
    ["#fbbf24", "#f59e0b", "#ef4444"], "It fits. That is the only claim being made."),
  look("hatHalo", "Slightly Crooked Halo", "hat", "mythic", "hatHalo",
    ["#fde68a", "#fbbf24", "#ffffff"], "Earned on a technicality."),
  look("hatUnspoken", "Crown of the Unspoken", "hat", "divine", "hatCrown",
    ["#ff1493", "#831843", "#ffffff"], "Everyone who has seen it agrees not to mention it."),

  // --- ears ---
  look("earsCat", "Cat Ears", "ears", "uncommon", "earsCat",
    ["#1f2937", "#f9a8d4", "#f9a8d4"], "Standard issue. Do not question them."),
  look("earsBunny", "Bunny Ears", "ears", "uncommon", "earsBunny",
    ["#f8fafc", "#fbcfe8", "#fbcfe8"], "Excellent hearing, entirely decorative."),
  look("earsFox", "Fox Ears", "ears", "rare", "earsFox",
    ["#f97316", "#fed7aa", "#fed7aa"], "Sharper than the cat ears, allegedly."),
  look("earsAntenna", "Bug Antennae", "ears", "rare", "earsAntenna",
    ["#84cc16", "#bef264", "#bef264"], "They twitch near hazards. Probably a coincidence."),
  look("earsHorn", "Small Horns", "ears", "epic", "earsHorn",
    ["#dc2626", "#7f1d1d", "#fca5a5"], "Grown, not bought. The vendor did not ask."),

  // --- face ---
  look("faceBlush", "Permanent Blush", "face", "common", "faceBlush",
    ["#fb7185", "#fb7185", "#fb7185"], "Unrelated to anything that happens down there."),
  look("faceGlasses", "Studious Spectacles", "face", "common", "faceGlasses",
    ["#67e8f9", "#1f2937", "#ffffff"], "Prescription: none. Vibe: considerable."),
  look("faceEyepatch", "Eyepatch (Cosmetic)", "face", "uncommon", "faceEyepatch",
    ["#1f2937", "#1f2937", "#1f2937"], "Both eyes are fine. It is a look."),
  look("faceFangs", "Tiny Fangs", "face", "rare", "faceFangs",
    ["#ffffff", "#ffffff", "#ffffff"], "They came with the ears. No refunds."),
  look("faceVisor", "Visor of the Deep Scan", "face", "epic", "faceVisor",
    ["#22d3ee", "#0e7490", "#ffffff"], "Displays nothing. Displays it beautifully."),

  // --- back ---
  look("backTail", "Cat Tail", "back", "uncommon", "tailCat",
    ["#1f2937", "#f9a8d4", "#f9a8d4"], "Moves on its own. Everyone has agreed this is fine."),
  look("backCape", "Dramatic Cape", "back", "rare", "cape",
    ["#dc2626", "#7f1d1d", "#7f1d1d"], "Catches on nothing, ever. Suspicious."),
  look("backMoth", "Moth Wings", "back", "epic", "wingsButterfly",
    ["#c084fc", "#f9a8d4", "#ffffff"], "Drawn to the torches. You will have to compensate."),
  look("backTome", "Floating Tome", "back", "epic", "tome",
    ["#7c3aed", "#fbbf24", "#ffffff"], "It follows you. It is not readable."),
  look("backAngel", "Feathered Wings", "back", "legendary", "wingsAngel",
    ["#f8fafc", "#e0f2fe", "#ffffff"], "Non-functional. Extremely load-bearing socially."),
  look("backDemon", "Leathery Wings", "back", "legendary", "wingsDemon",
    ["#7f1d1d", "#450a0a", "#450a0a"], "Also non-functional. Louder about it."),

  // --- auras ---
  aura("auraSakura", "Falling Petals", "rare", "petal", "#f9a8d4",
    "From a tree that does not exist on any floor."),
  aura("auraEmber", "Drifting Embers", "rare", "ember", "#fb923c",
    "Warm. Not warm enough to matter."),
  aura("auraBubble", "Bubbles", "epic", "bubble", "#67e8f9",
    "Silent. Which is worse, somehow."),
  aura("auraSnow", "Personal Winter", "epic", "snow", "#e0f2fe",
    "Follows you into the fire biome and keeps going."),
  aura("auraStar", "Starlight", "legendary", "star", "#fde68a",
    "There is no sky down here either. Same answer."),
  aura("auraQuiet", "The Quiet", "unspoken", "void", "#ff1493",
    "It arrived with you. It has not said why."),

  // --- weapon skins ---
  skin("skinBone", "Bonecarved", "rare",
    { edge: "#f5f5f4", shade: "#d6d3d1", grip: "#78716c", jewel: "#a8a29e", glow: null },
    "Carved from something that used to walk."),
  skin("skinCandy", "Confection", "rare",
    { edge: "#fbcfe8", shade: "#f9a8d4", grip: "#a7f3d0", jewel: "#fef08a", glow: null },
    "Non-edible. Several people have checked."),
  skin("skinFrost", "Frostbound", "epic",
    { edge: "#bae6fd", shade: "#38bdf8", grip: "#0c4a6e", jewel: "#e0f2fe", glow: "#7dd3fc" },
    "Cold to hold. Warm to use."),
  skin("skinNeon", "Neon Signal", "epic",
    { edge: "#f0abfc", shade: "#a21caf", grip: "#164e63", jewel: "#22d3ee", glow: "#e879f9" },
    "Visible from the far end of a gauntlet floor."),
  skin("skinSakura", "Petalfall", "legendary",
    { edge: "#fecdd3", shade: "#fb7185", grip: "#7f1d1d", jewel: "#fff1f2", glow: "#fda4af" },
    "Leaves a pink smear on everything it meets."),
  skin("skinAbyss", "Abyssal", "legendary",
    { edge: "#a78bfa", shade: "#5b21b6", grip: "#1e1b4b", jewel: "#c4b5fd", glow: "#8b5cf6" },
    "Drinks the torchlight. Gives nothing back."),
  // The first skin authored as its own weapon rather than a palette over yours (owner
  // ruling, Sept 2026). Its `WeaponPalette` is vestigial — nothing paints this any more,
  // the art is drawn — but the type still carries one and these are the colours it was
  // drawn from, so they stay as the record of where it came from.
  skin("skinAbyssalScythe", "Abyssal Scythe", "legendary",
    { edge: "#a78bfa", shade: "#5b21b6", grip: "#1e1b4b", jewel: "#c4b5fd", glow: "#8b5cf6" },
    "The edge is still leaving. It has been leaving for a while now."),
  skin("skinStar", "Starforged", "mythic",
    { edge: "#fef3c7", shade: "#fbbf24", grip: "#78350f", jewel: "#ffffff", glow: "#fde68a" },
    "Reportedly fell. Nobody saw it land."),
];

export const COSMETICS_BY_ID: Record<string, Cosmetic> = Object.fromEntries(
  COSMETICS.map((c) => [c.id, c]),
);

export function cosmeticsInSlot(slot: CosmeticSlot): readonly Cosmetic[] {
  return COSMETICS.filter((c) => c.slot === slot);
}

// --- customization --------------------------------------------------------
// These aren't bought. Everyone gets every option from the first minute, because
// deciding what you look like should not be a currency sink.

export const HAIR_STYLES = ["bob", "long", "short", "twintails", "pony"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const HAIR_STYLE_LABELS: Record<HairStyle, string> = {
  bob: "Bob", long: "Long", short: "Cropped", twintails: "Twin Tails", pony: "Ponytail",
};

/** Skin, then its shade, which the renderer uses for the underside of the chin. */
export const SKIN_TONES: readonly { readonly name: string; readonly skin: string }[] = [
  { name: "Porcelain", skin: "#ffe0d0" },
  { name: "Peach", skin: "#f7c9a8" },
  { name: "Honey", skin: "#e0a878" },
  { name: "Amber", skin: "#c58a5a" },
  { name: "Umber", skin: "#8d5a3b" },
  { name: "Ash", skin: "#5f4636" },
  { name: "Moonlit", skin: "#dfd6f5" },
  { name: "Verdant", skin: "#a7d3a1" },
];

export const HAIR_COLORS: readonly { readonly name: string; readonly hair: string; readonly shade: string }[] = [
  { name: "Ink", hair: "#2b2b3a", shade: "#191922" },
  { name: "Chestnut", hair: "#7a4a2b", shade: "#4e2e1a" },
  { name: "Wheat", hair: "#e6c27a", shade: "#b3914f" },
  { name: "Ash Blonde", hair: "#f0e6d2", shade: "#c2b39a" },
  { name: "Ember", hair: "#e05a2b", shade: "#a13a17" },
  { name: "Rose", hair: "#f7a8c4", shade: "#c9738f" },
  { name: "Mint", hair: "#8ce0c0", shade: "#4fa88a" },
  { name: "Cornflower", hair: "#7db3f0", shade: "#4a7cb8" },
  { name: "Violet", hair: "#b98cf0", shade: "#8156b8" },
  { name: "Unspoken", hair: "#ff5cc0", shade: "#a3186f" },
];

export const EYE_COLORS: readonly { readonly name: string; readonly eye: string }[] = [
  { name: "Coal", eye: "#2b2b3a" },
  { name: "Cocoa", eye: "#6b3f22" },
  { name: "Sky", eye: "#3ba7e0" },
  { name: "Jade", eye: "#3bbf8a" },
  { name: "Amber", eye: "#e0a020" },
  { name: "Wine", eye: "#c0335a" },
  { name: "Amethyst", eye: "#9b5cf0" },
  { name: "Molten", eye: "#ff5c2b" },
];

/** Cloth plus its trim. Named for the mood, because "blue 3" helps nobody. */
export const OUTFIT_DYES: readonly {
  readonly name: string; readonly cloth: string; readonly trim: string; readonly belt: string;
}[] = [
  { name: "Guild Standard", cloth: "#3f5f9e", trim: "#c9d3e0", belt: "#4a3a2c" },
  { name: "Ashwood", cloth: "#5a4636", trim: "#c8a06a", belt: "#33261c" },
  { name: "Nightshade", cloth: "#3b2a5c", trim: "#b98cf0", belt: "#241a38" },
  { name: "Ember", cloth: "#8c2f22", trim: "#f0a05a", belt: "#4a1810" },
  { name: "Seafoam", cloth: "#2b6b6b", trim: "#8ce0c0", belt: "#1a4040" },
  { name: "Blossom", cloth: "#c46a90", trim: "#ffd9e8", belt: "#7a3a52" },
  { name: "Bone", cloth: "#d8d2c0", trim: "#8a8272", belt: "#5c5648" },
  { name: "Moss", cloth: "#4a6b2f", trim: "#bfe08a", belt: "#2c4019" },
  { name: "Royal", cloth: "#2f3f8c", trim: "#f0d060", belt: "#1c264f" },
  { name: "Void", cloth: "#1b1b28", trim: "#ff5cc0", belt: "#0e0e16" },
];

// --- capsules -------------------------------------------------------------

export const CAPSULE_TIERS = ["Trinket", "Boutique", "Starlight"] as const;
export type CapsuleTier = (typeof CAPSULE_TIERS)[number];

export interface CapsuleInfo {
  /** Price in gems. */
  readonly price: number;
  readonly color: string;
  readonly blurb: string;
  /** Multiplied into the base cosmetic weights. Zero removes a rarity entirely. */
  readonly weights: Record<Rarity, number>;
}

/**
 * Cosmetic rarity is much flatter than item rarity — a wardrobe you can never finish is
 * a chore, not a hook. The long tail lives in the loot game; this is the gentle one.
 */
export const BASE_COSMETIC_WEIGHTS: Record<Rarity, number> = {
  common: 0.30, uncommon: 0.26, rare: 0.22, epic: 0.13,
  legendary: 0.06, mythic: 0.02, divine: 0.008, unspoken: 0.002,
};

export const CAPSULES: Record<CapsuleTier, CapsuleInfo> = {
  Trinket: {
    price: 40, color: "#9aa0a6",
    blurb: "Everything's in here, mostly hats.",
    weights: {
      common: 1.0, uncommon: 1.0, rare: 0.8, epic: 0.4,
      legendary: 0.2, mythic: 0.08, divine: 0.02, unspoken: 0.01,
    },
  },
  Boutique: {
    price: 160, color: "#a855f7",
    blurb: "No commons. Slightly smug about it.",
    weights: {
      common: 0.0, uncommon: 1.0, rare: 1.4, epic: 1.1,
      legendary: 0.5, mythic: 0.2, divine: 0.06, unspoken: 0.02,
    },
  },
  Starlight: {
    price: 600, color: "#fbbf24",
    blurb: "Epic and up. The vain gamble.",
    weights: {
      common: 0.0, uncommon: 0.0, rare: 0.0, epic: 1.4,
      legendary: 1.2, mythic: 0.6, divine: 0.18, unspoken: 0.06,
    },
  },
};

/**
 * Gems handed back for a duplicate. Deliberately a decent fraction of a Trinket capsule
 * at the low end, so a run of dupes still walks you toward the thing you wanted.
 */
export const DUPE_REFUND: Record<Rarity, number> = {
  common: 8, uncommon: 14, rare: 30, epic: 70,
  legendary: 160, mythic: 420, divine: 1100, unspoken: 3000,
};

/** Which capsule a gem-rich floor coughs up, by depth. Same shape as `keyDropTier`. */
export function capsuleDropTier(depth: number, roll: number): CapsuleTier {
  if (depth >= 18 && roll < 0.06) return "Starlight";
  if (depth >= 9 && roll < 0.22) return "Boutique";
  return "Trinket";
}

/** What a character looks like. Persisted; read only by the renderer and the wardrobe. */
export interface Appearance {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  eyes: number;
  dye: number;
  hat: string | null;
  ears: string | null;
  face: string | null;
  back: string | null;
  aura: string | null;
  weapon: string | null;
}

export function defaultAppearance(): Appearance {
  return {
    skin: 1, hair: 0, hairStyle: "bob", eyes: 0, dye: 0,
    hat: null, ears: null, face: null, back: null, aura: null, weapon: null,
  };
}

function wrap(n: unknown, len: number, fallback: number): number {
  const i = Math.floor(Number(n));
  return Number.isFinite(i) && i >= 0 && i < len ? i : fallback;
}

function ownedOrNull(id: unknown, slot: CosmeticSlot): string | null {
  if (typeof id !== "string") return null;
  const c = COSMETICS_BY_ID[id];
  return c && c.slot === slot ? id : null;
}

/**
 * Brings a saved appearance up to the current shape, dropping anything that no longer
 * exists. A cosmetic that gets retired should leave you bare-headed, never crash the
 * character screen.
 */
export function normalizeAppearance(raw: unknown): Appearance {
  const d = defaultAppearance();
  if (!raw || typeof raw !== "object") return d;
  const a = raw as Record<string, unknown>;
  const style = typeof a.hairStyle === "string" && (HAIR_STYLES as readonly string[]).includes(a.hairStyle)
    ? (a.hairStyle as HairStyle)
    : d.hairStyle;
  return {
    skin: wrap(a.skin, SKIN_TONES.length, d.skin),
    hair: wrap(a.hair, HAIR_COLORS.length, d.hair),
    hairStyle: style,
    eyes: wrap(a.eyes, EYE_COLORS.length, d.eyes),
    dye: wrap(a.dye, OUTFIT_DYES.length, d.dye),
    hat: ownedOrNull(a.hat, "hat"),
    ears: ownedOrNull(a.ears, "ears"),
    face: ownedOrNull(a.face, "face"),
    back: ownedOrNull(a.back, "back"),
    aura: ownedOrNull(a.aura, "aura"),
    weapon: ownedOrNull(a.weapon, "weapon"),
  };
}

/** Only ids that still exist survive a load; everything else is quietly dropped. */
export function normalizeOwned(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id === "string" && COSMETICS_BY_ID[id]) seen.add(id);
  }
  return [...seen];
}

/** Sanity check used by the smoke test: every cosmetic must be drawable and priced. */
export function cosmeticProblems(artKeys: readonly string[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const c of COSMETICS) {
    if (ids.has(c.id)) problems.push(`duplicate cosmetic id ${c.id}`);
    ids.add(c.id);
    if (!(RARITIES as readonly string[]).includes(c.rarity)) {
      problems.push(`${c.id}: unknown rarity ${c.rarity}`);
    }
    if (c.slot === "aura") {
      if (!c.aura) problems.push(`${c.id}: aura slot with no aura`);
    } else if (c.slot === "weapon") {
      if (!c.weapon) problems.push(`${c.id}: weapon slot with no palette`);
    } else if (!c.art) {
      problems.push(`${c.id}: ${c.slot} slot with no art`);
    } else if (!artKeys.includes(c.art)) {
      problems.push(`${c.id}: art "${c.art}" does not exist`);
    }
  }
  // A capsule nobody can pull anything out of is a bug, not a rare tier.
  for (const tier of CAPSULE_TIERS) {
    const reachable = COSMETICS.some((c) => CAPSULES[tier].weights[c.rarity] > 0);
    if (!reachable) problems.push(`capsule ${tier} can never drop anything`);
  }
  return problems;
}
