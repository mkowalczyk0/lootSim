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
