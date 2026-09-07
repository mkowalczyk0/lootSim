/**
 * Skill tags — the bridge between what a skill *is* and what the tree is allowed to
 * change about it.
 *
 * A tag is a promise. `bleed` on a skill means "the tree's Bloodletter path may reach
 * in here", `movement` means "Long Stride cares about this one", `summon` means
 * "minion nodes apply". Nodes, hybrids, items and triggers all target tags rather
 * than skill ids, so a class can grow a tenth skill without every node that should
 * touch it being re-listed.
 *
 * Pure data. Extend the list freely — a tag costs nothing until something keys off it.
 */

export const SKILL_TAGS = [
  // delivery
  "melee", "ranged", "projectile", "beam", "dash", "movement", "charge", "teleport",
  "channel", "aura",
  // shape / feel
  "slash", "thrust", "heavy", "area", "zone", "trap", "line", "cone", "nova",
  // schools
  "physical", "fire", "frost", "lightning", "poison", "void", "holy", "arcane", "nature",
  // status families
  "bleed", "burn", "curse", "corruption", "crowdControl", "interrupt", "mark", "vulnerable",
  // roles
  "summon", "spirit", "minion", "pet", "corpse", "construct", "terrain",
  "support", "heal", "barrier", "shield", "cleanse", "taunt", "threat",
  // identity
  "execute", "counter", "stealth", "illusion", "weather", "ritual", "time",
  // economy
  "resourceGenerator", "resourceSpender", "ultimate",
] as const;

export type SkillTag = (typeof SKILL_TAGS)[number];

const TAG_SET = new Set<string>(SKILL_TAGS);

/** True for a string that is a registered tag. Guards data loaded from a save. */
export function isSkillTag(value: string): value is SkillTag {
  return TAG_SET.has(value);
}

/** True when `tags` contains any of `wanted` — the common gate for tag-targeted rules. */
export function hasAnyTag(tags: readonly SkillTag[] | undefined, wanted: readonly SkillTag[]): boolean {
  if (!tags || wanted.length === 0) return false;
  for (const t of wanted) if (tags.includes(t)) return true;
  return false;
}
