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

**The real fix is a type, not a message.** `readonly string[]` on a list of ids is a decision
to switch off the only mechanism that could have caught this. `MOD_POOL`'s authored rows are
now a `const` tuple with `ModPoolId` recovered off them, and `AFFIX_MOD_IDS: readonly
ModPoolId[]` makes a retired affix a **compile error at the id list**. Falsified by putting
`"rebounding"` back: `error TS2322: Type '"rebounding"' is not assignable to ...`. `MOD_POOL`
keeps its `readonly ModRoll[]` type so no consumer changed, and `ModPoolId` deliberately covers
the authored rows only — `ELEMENTAL_MODS` is generated and folding it in would widen the union
back to `string` and undo the guard silently. The thrown error is kept as the residual, since
`modRollById` is a `.find()` the compiler cannot prove exhaustive.

Measured rather than assumed: `: readonly string[] = [` appears twice in `src/`, so this is two
instances and not a class. The other, `GRANTABLE_ABILITY_IDS`, has the same shape but fails
quietly (a dead grant, not a crash) and is named in blind-instruments entry 30 rather than
fixed on this branch. See that entry for the full write-up.

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

**Post-merge, both semantics live in one table and it says which is which.** `RETIRED_MOD_KEYS`
carries a `kind` discriminant: a **rename** (`wardPower` → `defensePercent`) moves the rolled
number across untouched, a **rewrite** (both keys here) derives a fresh one from the item's
tier. The union was chosen over the two cheaper shapes deliberately — an optional `value`
callback, or a `value(tier, old)` signature a rename ignores — because both of those let the
*next* retirement be wrong by omission in whichever direction the author forgot, and each
direction silently damages gear already in somebody's stash: forget the callback and a flat
count becomes a percentage, forget the parameter and a player's rolled number is thrown away.
Neither mistake typechecks now. A rule that cannot be violated, rather than a check that
notices it was.

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

**Player-visible consequence, and it was ruled on rather than absorbed:** a saved
`affix-rebounding` is dropped by the `isAugmentId` filter in `state.ts` on load — the same
graceful path a retired cosmetic id takes (`normalizeAppearance` does exactly this), so
nothing crashes, but **an owned copy is lost.**

**No refund, by decision.** The augment guaranteed an affix that has never done anything, so
there is no value to refund; building a compensation path for a consumable whose payload was
always a no-op is a new mechanism for zero player benefit. The loss goes on the owner's
player-visible-changes list rather than being papered over, and if they want compensation when
they read it, that is its own change.

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
- **Its scope is printed**, and post-merge it is printed *per kind*: `swept 136 source files`,
  `walked 3 retired key(s) — 1 rename, 2 rewrite`. Each kind has its own assertion, so a table
  that silently collapsed to one of them would run green while proving nothing about the
  other; the breakdown in the output is what makes that visible.
- **It is falsified in-run**: an unknown key pushed through the same path must still be
  dropped, which proves the filter the rewrite defends against is real rather than assumed.
  That check is what caught the harness itself being blind — the first version built its save
  object without the `data` wrapper, so the loader never saw the inventory and every round-trip
  assertion was passing on an empty result.

The source sweep strips comments before searching, deliberately: the tombstone notes left at
each removal site name the retired key on purpose, and a sweep that could not tell prose from
code would force exactly the documentation this change depends on to be deleted.

`npm run modkeys` — the broader "no mod key without a live simulation read" rule — came in from
`fix/wardpower-riptout` and now sits beside this gate. Neither reimplements the other:
`modkeys` asks whether a key that exists is read, `retiredmods` asks what happens to a key that
has stopped existing. Together they now read **51 of 51 keys live, 0 pinned dead** — the first
time in the project's history that every key in the vocabulary has a simulation read.

## Merge note: what the union actually cost

The prediction below was written before the merge and was **half right**, which is the useful
part of keeping it:

> This branch and `fix/wardpower-riptout` both edit `src/data/mods.ts`, `src/game/item.ts` and
> `src/progression/stormcaller.ts` (which has a `wardPower` node of its own), and both add a
> `RETIRED_MOD_KEYS` mechanism. Whichever lands second will conflict textually in all three, and
> the second one should adopt the first's table rather than adding a parallel one.

Three textual conflicts landed exactly where predicted, and two were trivial (each branch had
removed its own keys and kept the other's; the union keeps `thorns` alone). **"Adopt the first's
table" turned out to be the wrong instruction**, and this is the thing worth carrying: neither
table could adopt the other, because the two branches had opposite *semantics*, not different
spellings of one. `wardPower`'s carried the rolled value and had to; the ultimate keys' had to
discard it. Adopting either naively would have silently shipped the precise defect the other
branch existed to prevent. The resolution was a third shape neither branch had — the `kind`
union — which is what "adopt the first's table" would have talked someone out of looking for.

**Two further collisions left no conflict markers at all**, the pattern
`docs/blind-instruments.md` records as its seventeenth instance:

- `tools/modkeys.ts` (from the `wardpower` branch) **pinned** `ultimateBounces` and
  `ultimateProjectiles` as known-dead keys awaiting an owner call. This branch is that call, and
  removed the keys — so the pin named two keys that no longer existed and the "still dead" check
  read them as "now live" and failed. The pin doing its job at the end of its life. Both entries
  are gone and the header says why.
- `src/data/affix-glossary.ts` (from `feat/affix-codex`, a third branch entirely) had written
  player-facing explanations for both retired keys. A new file against a deletion is not a
  textual conflict; `npm run check` caught it as a type error against `Partial<Record<ModKey, …>>`.

Neither was visible to a merge dry-run that tests each branch against master in isolation, and
neither involves the three files this note predicted. **A conflict probe that never builds the
accumulating union cannot see a collision between two branches** — only against the base.

## CLAUDE.md

The item section states *"`+1 ultimate bounce` doesn't [exist below] **mythic**"*. `of
Rebounding` was the only thing that sentence described, so the line is fully dead rather than
imprecise. Per the standing rule this is **not** edited on a branch — it goes to
`docs/claude-md-pending.md` for one owner read.
