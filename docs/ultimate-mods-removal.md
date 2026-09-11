# Retiring `ultimateBounces` and `ultimateProjectiles`

**Status: implemented.** Branch `fix/ultimate-mod-retirement`, off master. The rule it leaves
behind is `npm run retiredmods` (`tools/retiredmods.ts`), folded into `npm test`.

Owner ruling, Sept 2026: *remove and re-author, same as `wardPower`.* This follows
`docs/wardpower-removal.md`'s method deliberately rather than re-deriving one, and the places
where it could **not** follow it are the substance of this document.

## What was wrong

Both keys were `ModKey`s in `src/data/mods.ts`, authored at nine sites, and **no file in
`src/combat/`, `src/game/` or `src/net/` ever read either one.** Verified before any edit:

- `ultimatePower` and `ultimateRate` *are* live (`src/game/player.ts`) and are untouched here.
  Only the two count-shaped keys were dead.
- The only `src/game/` hit was `MOD_SCORE` in `game/item.ts` — a vendor-pricing heuristic, not
  a simulation read. The same hiding place `wardPower` used.

So this is a cleanup, not a balance change. That was the one thing that could have invalidated
the whole job, and it was checked first rather than inherited from the brief.

## The inventory — 10 sites, not 9

The brief said nine sites across four files. **There were ten across five**, and the tenth was
not a dead stat — it was a crash.

| where | n | what |
| --- | --- | --- |
| `src/data/mods.ts` | 3 | `COMBAT_MOD_KEYS`, two `MOD_LABELS` rows |
| `src/progression/stormcaller.ts` | 3 | a resource threshold, the `Charged Air` foundation node, a hybrid `addThresholds` patch |
| `src/data/items.ts` | 2 | the `of the Manifold` and `of Rebounding` suffix rows |
| `src/game/item.ts` | 1 | the `MOD_SCORE` vendor-valuation entries |
| **`src/data/augments.ts`** | **1** | **`AFFIX_MOD_IDS` — the `affix-rebounding` Augment** |

`AFFIX_MOD_IDS` is a list of `MOD_POOL` ids, dereferenced with `modRollById(modId)!`. Deleting
the `rebounding` row turned that non-null assertion into a module-load `TypeError: Cannot read
properties of undefined (reading 'minTier')` — the game would not boot. It typechecks fine,
because the ids are plain strings.

**It was not found by reading. It was found by the round-trip check crashing on import**,
which is the argument for having written the check before believing the inventory. An
undercounted scope is this repo's signature failure and the brief undercounted by one.

The assertion is now a thrown error naming the actual cause, so the next affix retirement gets
a sentence instead of a stack trace.

## How power was held constant

**The three Stormcaller sites are pure removals — exactly zero change.** Each granted the dead
key *alongside* a live one (`lightningDamage` 0.15 / 0.14 / 0.25), so dropping the dead half
leaves a node that still does what it did yesterday. No magnitude was invented anywhere on the
class side.

This is a deliberate departure from `wardPower`, which folded two of its sites' dead halves
into their live halves. That was right there and wrong here: a dead key granted *nothing*, so
removing it changes nothing, and topping the live stat up would be an uncommanded buff to
Stormcaller that nobody asked for. `wardPower`'s own stated rule — *ask which direction the
correction pushes balance, and whether anyone asked for a change in that direction* — points
at pure removal.

**The two suffix rows are deleted outright.** `wardPower` kept its suffix and swapped the key,
which works when the row would otherwise be an empty shell; an affix row has no such problem,
since a deleted row simply stops rolling. Re-keying was considered and rejected: the live
neighbours in the same block are `of Skewering` (`pierce` 1, tier 3) and `of Splitting`
(`projectiles` 1, tier 4), so re-keying `of the Manifold` produces either a strictly-better or
an exactly-equal clone of a suffix that already exists.

**Accepted cost, stated so nobody later reads it as an accident:** the tier-4/5 weapon affix
pool is now two of six "whole-extra-thing" entries thinner at the top end. That is a real
thinning of the top-end pool and it is the consequence of the removal that was ruled on.

## The save, and why there is no `SAVE_VERSION` bump

`ItemMod` persists the rolled `key` and `normalizeItem` drops any mod whose key is not in
`MOD_KEYS`. Retiring naively would have **silently deleted the affix off every `of the
Manifold` and `of Rebounding` item already in a stash.** `RETIRED_MOD_KEYS` (in
`data/items.ts`) is rewritten in `normalizeItem` *ahead* of that filter, version-agnostic by
construction, which is why no version number was needed and none is claimed.

**Where this had to go beyond `wardPower`: the value is recomputed, not renamed.** `of
Warding` needed only a key swap, because its rolled 0.1–0.3 read sensibly as `defensePercent`.
Both keys here stored **flat counts** (2 ultimate projectiles, 1 ultimate bounce) and every
live target is a percentage — carrying `2` across would read as **+200% ultimate damage**. So
the map replaces the magnitude outright.

**The replacement target is `ultimatePower`, and the magnitude is derived rather than picked.**

- *Not* `projectiles`/`pierce`. Those are the game's named whole-extra-thing pillars ("+1
  projectile doesn't exist below epic"). Granting one to every existing holder of a retired
  affix is a real power injection across every stash in the game, uncommanded, landing on
  exactly the pillar being retired. The clone objection above is the tell: if re-keying makes
  a strictly-better `of Splitting`, the mapping is too strong.
- `ultimatePower` keeps both suffixes' own ultimate theme, preserves the item's affix count so
  nothing visibly shrinks, and is a percentage — so it can be sized to a peer rather than to a
  headline.
- The magnitude is read off **`cataclysmic`**, the game's surviving `ultimatePower` affix,
  evaluated at the item's own tier through the same `base * (1 + tier * perTier)` every linear
  roll uses. It is looked up by id from `MOD_POOL` rather than copied, so retuning that row
  moves the rewrite with it. A retired affix is worth exactly what the live affix for the same
  stat is worth on the same item. A legendary lands at 0.216.

**One magnitude could not be derived the way the brief asked.** The instruction was to land
inside the band of existing tier-4 and tier-5 *percentage* suffixes. **That band is empty** —
every tier-4/5 suffix in the game is flat, and in fact every percentage affix in the game,
prefix or suffix, is gated at tier 1 or 2. Extrapolating a "tier-5 norm" from rows that do not
exist would have been a number invented and then described as derived, which is the failure
this project keeps naming. Anchoring to the live same-key row instead is a reference that
actually exists.

## The augment that retired with the affix

An augment guarantees a specific affix, so `affix-rebounding` could not outlive `of
Rebounding`. `AFFIX_MOD_IDS` is nine entries rather than ten.

**Player-visible consequence, flagged rather than absorbed:** a saved `affix-rebounding` is
dropped by the `isAugmentId` filter in `state.ts` on load — the same graceful path a retired
cosmetic id takes, so nothing crashes, but **an owned copy is lost.** No refund path was built,
because inventing a compensation currency for a consumable is a design decision rather than a
mechanical follow-on. If that loss is not acceptable, the fix belongs in a separate change.

## What the branch leaves behind

`npm run retiredmods` holds the next retirement to this standard. Built against the four
failure modes `CLAUDE.md` names:

- **Its subject** is the live `MOD_KEYS` and `RETIRED_MOD_KEYS` exports, not a list restated in
  the tool, so a key that comes back tomorrow is walked for free.
- **Its bound** is the real loader: it constructs a save, pushes it through
  `GameState.fromSaved`, and asserts on what comes out — name, affix count, replacement key and
  magnitude. The original claim ("`decorate` bakes the name at roll time, so deleting a row
  orphans nothing") was a plausible reading of two functions, and `wardPower`'s whole save
  story is that the plausible reading about a save was wrong.
- **Its scope is printed**: `swept 133 source files`, `walked 2 retired key(s)`.
- **It is falsified in-run**: an unknown key pushed through the same path must still be
  dropped, which proves the filter the rewrite defends against is real rather than assumed.
  That check is what caught the harness itself being blind — the first version built its save
  object without the `data` wrapper, so the loader never saw the inventory and every round-trip
  assertion was passing on an empty result.

The source sweep strips comments before searching, deliberately: the tombstone notes left at
each removal site name the retired key on purpose, and a sweep that could not tell prose from
code would force exactly the documentation this change depends on to be deleted.

`npm run modkeys` — the broader "no mod key without a live simulation read" rule — lives on
`fix/wardpower-riptout` and **is not on master**, so it could not be used to prove the keys are
gone. `retiredmods` does not reimplement it; the two are complementary and should sit side by
side once that branch lands.

## Merge-ordering note

This branch and `fix/wardpower-riptout` both edit `src/data/mods.ts`, `src/game/item.ts` and
`src/progression/stormcaller.ts` (which has a `wardPower` node of its own), and both add a
`RETIRED_MOD_KEYS` mechanism. Whichever lands second will conflict textually in all three, and
the second one should adopt the first's table rather than adding a parallel one.

## CLAUDE.md

The item section states *"`+1 ultimate bounce` doesn't [exist below] **mythic**"*. `of
Rebounding` was the only thing that sentence described, so the line is fully dead rather than
imprecise. Per the standing rule this is **not** edited on a branch — it goes to
`docs/claude-md-pending.md` for one owner read.
