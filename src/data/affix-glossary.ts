/**
 * The affix and stat glossary — one source of prose, read by three surfaces (the Codex's
 * "Affixes & Stats" view, the Reforge workbench's possibilities panel, and a stat's entry
 * on the Hero screen).
 *
 * **The rule this file lives under is `data/previews.ts`'s, word for word: a preview that
 * can drift out of sync with the real drop table is worse than no preview.** So the only
 * thing authored here is the *sentence* — what a number actually changes in a fight, and
 * why the game is shaped the way it is. Every number, every gate and every "does this
 * exist on gear" answer is read off `mods.ts` / `items.ts` / `elements.ts` /
 * `combat-tuning.ts` at call time. If a rarity threshold or a range needs typing into this
 * file, that's the wrong turn — it belongs in the definition this file reads instead.
 */

import {
  BLOCK_CHANCE_CAP, BLOCK_MITIGATION, EVASION_CAP,
} from "./combat-tuning";
import {
  ELEMENTS, ELEMENT_LABELS, LOOT_ELEMENTS, STATUS_FOR_ELEMENT, STATUSES,
  type Element,
} from "./elements";
import {
  MOD_POOL, MOD_COUNTS, RESERVED_ELEMENTAL_MODS, type ModRoll,
} from "./items";
import {
  COMBAT_MOD_KEYS, DAMAGE_MOD_KEYS, ELEMENT_DAMAGE_KEY, ELEMENT_RESIST_KEY, MOD_LABELS,
  RESIST_MOD_KEYS, STAT_KEYS, type CombatModKey, type ModKey, type StatKey,
} from "./mods";
import { rarityLabel } from "./rarity";

/** One glossary entry: the sentence(s) a screen renders, nothing numeric baked in. */
export interface Explanation {
  /** What this number actually changes, in plain terms. Always present. */
  what: string;
  /** A second clause worth knowing — an interaction, a caveat, a formula in words. */
  detail?: string;
}

// --- the six sheet stats ----------------------------------------------------

/**
 * Written against `Player`'s own getters, not against what the stat is named — a name is
 * a guess at what a number does, and this file exists because the guesses were wrong
 * often enough to ask about.
 */
export const STAT_EXPLANATIONS: Record<StatKey, Explanation> = {
  attack: {
    what: "Your raw hit, before anything else touches it. Every basic attack and most "
      + "ability damage scales from this number.",
  },
  defense: {
    what: "Cuts incoming damage. The reduction is a curve, not a straight percentage: "
      + "roughly def ÷ (def + 120), so the first points buy a lot and each point after "
      + "that buys a little less, without a hard ceiling.",
    detail: "It only mitigates elemental hits at half strength — a fire hit gets half "
      + "the benefit a sword swing does. That's a different rule from resistance below, "
      + "which is capped and applies in full to the one element it covers.",
  },
  maxHealth: {
    what: "How much damage you can eat before you go down. Nothing subtle here.",
  },
  power: {
    what: "A second, smaller multiplier on top of attack — every point adds a slice of "
      + "extra damage on the same hit rather than a flat number of its own.",
  },
  haste: {
    what: "Speeds up your attacks, in small steps — each point shaves a sliver off the "
      + "time between swings.",
    detail: "It stacks with attack speed %, but it takes a lot of it to matter: haste is "
      + "worth a fraction of a percent of attack speed per point, where an attack speed "
      + "affix adds its percentage directly. Don't expect a handful of haste to feel like "
      + "an attack speed roll — it isn't one.",
  },
  maxMana: {
    what: "Your mana pool. Most classes don't cast from mana any more — they run on "
      + "whatever resource their own kit uses — so this mainly matters for potions and "
      + "for the handful of classes that still spend it.",
  },
};

// --- elements ----------------------------------------------------------------

/** Whether an element's damage/resist pair can roll on ordinary dropped gear. */
export function rollsOnGear(e: Element): boolean {
  return (LOOT_ELEMENTS as readonly Element[]).includes(e);
}

export function explainElement(e: Element): Explanation {
  if (e === "physical") {
    return {
      what: "The baseline. Physical does exactly what the number says and carries no "
        + "rider — every hero and every monster in the game always has some.",
      detail: "It's the one element nothing resists hard, on purpose: a floor that "
        + "shrugged off your sword would be a floor you simply couldn't fight.",
    };
  }
  const statusKind = STATUS_FOR_ELEMENT[e];
  const status = statusKind ? STATUSES[statusKind] : null;
  const rider = status
    ? `Landing a hit has a chance to inflict ${status.label.toLowerCase()}`
      + (status.dps > 0 ? `, which burns for damage over ${status.duration}s` : "")
      + (status.slow < 1 ? `${status.dps > 0 ? " and" : ","} slows the target` : "")
      + (status.amplify > 1 ? `${status.dps > 0 || status.slow < 1 ? " and" : ","} makes `
        + "the next hits against it land harder" : "")
      + (status.manaBurn > 0 ? ", and tears at its mana" : "")
      + "."
    : "";
  if (rollsOnGear(e)) {
    return {
      what: `${rider} This is one of the five elements ordinary gear can roll — its `
        + "damage and resistance affixes turn up on random drops like any other.",
    };
  }
  return {
    what: `${rider} This one is deliberately kept out of the random drop pool — it's a `
      + "class-kit or crafted identity rather than something diluted across every ring.",
    detail: "Its damage and resistance still exist as real numbers (a class ability can "
      + "grant them, and the Forge's matching essence works), they just never turn up as "
      + "an unrequested roll on a piece of loot.",
  };
}

// --- combat mod keys, everything that isn't a sheet stat or an element ------

const COMBAT_EXPLANATIONS: Partial<Record<CombatModKey, Explanation>> = {
  critChance: { what: "Chance a hit rolls as a critical strike." },
  critDamage: { what: "How much harder a critical strike hits, on top of a normal one." },
  attackSpeed: {
    what: "Adds directly to how fast you swing, as its own percentage — the affix "
      + "version of the effect haste gives you a sliver of.",
  },
  moveSpeed: { what: "How fast you walk. Doesn't touch dash distance or cooldown." },
  areaSize: { what: "Widens the hit box or blast radius on abilities that have one." },
  projectiles: {
    what: "One more shot fired per cast on anything that already fires a projectile — "
      + "a whole extra thing, not a bigger version of the one you have.",
  },
  pierce: {
    what: "A projectile keeps going through a body instead of stopping at the first one "
      + "it hits.",
  },
  ailmentChance: { what: "Raises the odds an elemental hit actually inflicts its rider." },
  ailmentPotency: { what: "Makes an inflicted rider (burn, chill, shock, ...) hit harder." },
  lifeOnHit: { what: "Heals you for a flat amount whenever you land a hit." },
  manaOnHit: { what: "Restores mana whenever you land a hit." },
  cooldownRate: { what: "Your skills recover faster. Does not touch your ultimate." },
  ultimateRate: { what: "Your ultimate's meter fills faster from whatever charges it." },
  ultimatePower: { what: "Your ultimate hits harder. Nothing else is affected." },
  skillDamage: { what: "A blanket increase to your three equipped skills' damage." },
  meleeDamage: { what: "A blanket increase to melee-shaped attacks specifically." },
  projectileDamage: { what: "A blanket increase to projectile-shaped attacks specifically." },
  elementalDamage: {
    what: "Multiplies every elemental damage percentage you already carry — it does "
      + "nothing on its own and needs at least one elemental damage roll to have anything "
      + "to multiply.",
    detail: "This is why a second fire affix is worth more than the first: this stat "
      + "scales every element you're carrying at once, so a themed build compounds.",
  },
  thorns: { what: "Whenever you're hit, everything close enough to you takes this much damage back." },
  ultimateBounces: { what: "Your ultimate, if it can chain or bounce, does it one more time." },
  ultimateProjectiles: { what: "Your ultimate, if it fires projectiles, fires more of them." },
  healthPercent: { what: "A percentage increase to your maximum health, on top of the flat number." },
  defensePercent: { what: "A percentage increase to your defense, on top of the flat number." },
  manaRegen: { what: "Extra mana restored every second, on top of the passive trickle everyone has." },
  evasion: {
    what: `Chance to avoid an ordinary hit entirely — no damage, capped at `
      + `${Math.round(EVASION_CAP * 100)}%.`,
    detail: "Only applies to the hits a hero can actually sidestep — a boss mechanic you "
      + "stood in, or a damage-over-time tick, always lands regardless.",
  },
  blockChance: {
    what: `Chance to block an ordinary hit, turning away ${Math.round(BLOCK_MITIGATION * 100)}% `
      + `of the damage. Capped at ${Math.round(BLOCK_CHANCE_CAP * 100)}%.`,
    detail: "Rolled after evasion, on the same kind of hit evasion applies to — a "
      + "boss mechanic or a damage-over-time tick can't be blocked either.",
  },
  dashRate: { what: "Your dash recovers faster. Does not add a dash charge." },
  pickupRadius: { what: "Widens how far loot is pulled toward you." },
  coinFind: { what: "More coins from everything that pays them." },
  gemFind: { what: "More gems from everything that pays them." },
  dashCharges: {
    what: "A whole extra dash charge, stacked on top of the one dash everyone starts with.",
    detail: "This is a second charge in the stock, not a faster-recovering single dash — "
      + "dash rate is the stat for that.",
  },
};

/**
 * `COMBAT_EXPLANATIONS` is deliberately `Partial` and this is deliberately the one
 * place that reads it, so a key this file hasn't caught up to yet (or one another branch
 * removed a mod for, landing in either order relative to this one) degrades to its plain
 * `MOD_LABELS` name rather than a blank row or a crash. `explainAffix` and
 * `allNamedAffixes` read `MOD_POOL`/`RESERVED_ELEMENTAL_MODS` live for the same reason: a
 * mod that stops existing there simply stops appearing, and one that starts existing
 * there appears with a name-only fallback until this file is given its own sentence.
 */
export function explainCombatKey(key: CombatModKey): Explanation {
  return COMBAT_EXPLANATIONS[key] ?? { what: MOD_LABELS[key] };
}

// --- one entry point covering every ModKey (for the Hero screen's live sheet) ----

export function explainModKey(key: ModKey): Explanation {
  if ((STAT_KEYS as readonly string[]).includes(key)) return STAT_EXPLANATIONS[key as StatKey];
  if ((DAMAGE_MOD_KEYS as readonly string[]).includes(key)) {
    const e = ELEMENTS.find((el) => ELEMENT_DAMAGE_KEY[el] === key)!;
    return { what: `Converts a slice of your hit into ${ELEMENT_LABELS[e].toLowerCase()} damage.`,
      detail: explainElement(e).what };
  }
  if ((RESIST_MOD_KEYS as readonly string[]).includes(key)) {
    const e = ELEMENTS.find((el) => ELEMENT_RESIST_KEY[el] === key)!;
    return { what: `Reduces ${ELEMENT_LABELS[e].toLowerCase()} damage taken. Asymptotic and `
      + "hard-capped, the same shape as every other resistance." };
  }
  return explainCombatKey(key as CombatModKey);
}

// --- named affixes (the prefix/suffix roster) -------------------------------

/** Every rollable affix, ordinary pool plus the reserved elemental pairs — one list,
 *  so a name index never has to remember to check two tables. */
export function allNamedAffixes(): readonly ModRoll[] {
  return [...MOD_POOL, ...RESERVED_ELEMENTAL_MODS];
}

/** English for `ModRoll.where` — which slots an affix is allowed to land on. */
function whereLine(mod: ModRoll): string {
  switch (mod.where) {
    case "any": return "any piece of gear";
    case "weapon": return "weapons only";
    case "offense": return "weapons, rings and gloves";
    case "defense": return "armor pieces";
  }
}

/** English for `ModRoll.scale` — how the affix's number grows with rarity. */
function scaleLine(mod: ModRoll): string {
  switch (mod.scale) {
    case "rarity": return "scales with the item's rarity, doubling roughly every step up";
    case "linear": return "grows gently with rarity rather than doubling";
    case "flat": return "is a fixed amount no matter how rare the item is — rarity only decides whether it can roll at all";
  }
}

/**
 * Everything the Codex, the Reforge panel and a tooltip need about one named affix — the
 * flavour name, what it actually does (via `explainModKey`), where it can land, how its
 * number grows, and the rarity that unlocks it. Every clause but the flavour sentence
 * itself is read off the definition, not typed here.
 */
export function explainAffix(mod: ModRoll): {
  name: string;
  kind: "prefix" | "suffix";
  key: ModKey;
  what: Explanation;
  where: string;
  scale: string;
  gate: string;
  reserved: boolean;
} {
  const reserved = RESERVED_ELEMENTAL_MODS.includes(mod);
  return {
    name: mod.label,
    kind: mod.kind,
    key: mod.key,
    what: explainModKey(mod.key),
    where: whereLine(mod),
    scale: scaleLine(mod),
    gate: mod.minTier > 0
      ? `doesn't roll below ${rarityLabel(rarityAt(mod.minTier))}`
      : "can roll at any rarity",
    reserved,
  };
}

function rarityAt(tierIndex: number) {
  // Local import avoided on purpose — `RARITIES` is re-exported by `rarity.ts`'s own
  // index function family; pulling the array in directly here keeps this file's imports
  // to what it actually iterates.
  return (["common", "uncommon", "rare", "epic", "legendary", "mythic", "divine", "unspoken"] as const)[tierIndex]!;
}

/** How many affixes an item of this rarity carries, read straight off `MOD_COUNTS`. */
export function affixCountLine(rarity: keyof typeof MOD_COUNTS): string {
  const [lo, hi] = MOD_COUNTS[rarity];
  if (lo === hi) return `always ${lo}`;
  return `${lo}–${hi}`;
}

export { COMBAT_MOD_KEYS };
