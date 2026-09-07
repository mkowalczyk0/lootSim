/**
 * The basic attack, as an ability.
 *
 * Every weapon family now has a real `Ability` sitting behind its swing — the same
 * schema a skill or an ultimate uses. The dungeon still owns the *geometry* (an arc
 * has to add the target's radius to its reach, a spear caps its pierce at a rank of
 * bodies, a talisman throws a spark at someone you weren't facing) because the generic
 * targeting modes don't reproduce those exactly and a swing is the one hit in the game
 * that has to land the same way it always has. But the *hit itself* — the damage
 * packet, its element, its tags, its knockback, the ailment it tries to inflict — is
 * described here and resolved through the same `CombatHost.dealDamage` + event bus path
 * a spell takes. A swing and a bolt are the same kind of thing now.
 *
 * Pure data. `damage.base` is `1` and `scale` is `"attack"`: the number is
 * `Player.attackDamage`, which already folds in the weapon's own `damage` multiplier,
 * affinity and the melee/projectile mod. The template is not double-counting the
 * weapon.
 */

import type { Ability } from "../combat/ability";
import type { SkillTag } from "../combat/tags";
import { WEAPONS, type AttackPattern, type WeaponFamily } from "./weapons";

/** Tags every family of a given pattern carries, on top of `melee`/`ranged`. */
const PATTERN_TAGS: Record<AttackPattern, readonly SkillTag[]> = {
  arc: ["melee", "slash", "physical"],
  cleave: ["melee", "slash", "heavy", "area", "physical"],
  thrust: ["melee", "thrust", "line", "physical"],
  dual: ["melee", "slash", "physical"],
  bolt: ["ranged", "projectile", "physical"],
  orb: ["melee", "area", "nova", "physical"],
};

function weaponAbility(family: WeaponFamily): Ability {
  const w = WEAPONS[family];
  return {
    id: `weapon:${family}`,
    name: w.name,
    description: w.blurb,
    category: "attack",
    tags: PATTERN_TAGS[w.pattern],
    // The dungeon gates the swing on `Player.attackCooldown`, not on this — a weapon's
    // cadence is a character stat (haste, attack speed), not an ability cooldown.
    cooldown: 0,
    targeting: w.pattern === "bolt" ? "direction" : w.pattern === "orb" ? "radius" : "cone",
    range: w.reach,
    effects: [
      {
        kind: "damage",
        damage: {
          base: 1,
          scale: "attack",
          type: "physical",
          canCrit: true,
          knockback: w.knock,
        },
      },
    ],
  };
}

export const WEAPON_ABILITIES: Record<WeaponFamily, Ability> = Object.fromEntries(
  (Object.keys(WEAPONS) as WeaponFamily[]).map((f) => [f, weaponAbility(f)]),
) as Record<WeaponFamily, Ability>;

export function weaponAbilityFor(family: WeaponFamily): Ability {
  return WEAPON_ABILITIES[family];
}
