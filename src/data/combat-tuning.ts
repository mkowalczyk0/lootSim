/**
 * Global combat dials for the ability system.
 *
 * The class overhaul deliberately put most of a build's power into abilities and the
 * ultimate rather than the basic swing (CLAUDE.md: "roughly 70% more damage in the
 * player's hands"). These are the two knobs that scale that intent across the whole
 * 21-class roster at once, so a per-class number never has to carry it. Everything
 * per-class lives in `src/progression/<class>.ts`; everything shared lives here.
 *
 * `SKILL_POWER` multiplies the attack- and spell-damage figure the executor scales an
 * ability's `base` against (`CastInput.attackDamage` / `spellDamage`). `ULTIMATE_POWER`
 * multiplies it again for an `isUltimate` ability, on top of the player's own
 * `ultimatePower` mod. Tuned against `npm run smoke` — the two 20-dive campaigns and the
 * depth-5 raid boss are the acceptance gate.
 */
export const SKILL_POWER = 1.22;
export const ULTIMATE_POWER = 1.15;

/**
 * Evasion and block — the avoid-the-hit layer.
 *
 * A handful of classes are built around not being where the hit lands (Duelist,
 * Trickster) or turning it aside (Juggernaut, Paladin), and several tree nodes and
 * ultimate meters (`{ on: "dodge" }` / `{ on: "block" }`) only mean anything if that
 * actually happens. `Dungeon.hurtPlayer` rolls against these — evasion first (the hit is
 * avoided outright, 0 damage, fires `dodge`), then block (the hit lands at
 * `BLOCK_MITIGATION`, fires `block`). Both are chances summed from the class base
 * (`CLASSES[id].base`), the resolved build, and any active guard status
 * (`sword_parry` etc. carry `blockChance` in their `mods`), then clamped to the cap.
 *
 * Deliberately NOT on the boss-mechanic path (`hurtPlayerMechanic`) or the DoT path
 * (`hurtPlayerRaw`): a telegraph you stood in is meant to land, and you cannot sidestep
 * a burn. Gear affixes for evasion/block are a separate future itemization pass — for
 * now the layer is class identity only, so it stays small and predictable.
 */
export const EVASION_CAP = 0.4;
export const BLOCK_CHANCE_CAP = 0.5;
export const BLOCK_MITIGATION = 0.5;
