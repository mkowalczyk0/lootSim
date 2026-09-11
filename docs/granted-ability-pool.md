# The granted-ability pool: five classes that had quietly fallen out of it

**Branch:** `chore/gate-and-docket`. **Code:** `src/progression/index.ts`
(`AbilityId`, `GRANTABLE_ABILITY_IDS`).

## What was found

From epic upward, a weapon, ring or necklace can carry a **granted skill** — a whole extra
castable, for as long as you wear it, and one of the few things in the game that legitimately
crosses class lines. It rolls from `GRANTABLE_ABILITY_IDS`, described in its own comment as
"one flashy, self-contained ability per class, biased toward the ones that read well on someone
who isn't that class." Twelve classes were named in it.

Seven were rolling. Five had been renamed out from under the list at some earlier point:

| declared | resolved? |
| --- | --- |
| `ranger.arrow_volley` | dead |
| `shaman.flame_totem` | dead |
| `warlock.void_bolt` | dead |
| `berserker.leap_slam` | dead |
| `stormcaller.chain_lightning` | dead |

Nothing failed, because the list ended in this:

```ts
].filter((id) => id in ABILITY_BY_ID);
```

A stale id was silently discarded, and the pool players actually rolled from was seven entries
long. **A curated list has no length anyone remembers**, so there was no number to look wrong.
The only way to see it was to print the declared ids and the surviving ids side by side, which
is a thing nobody does to a list that has never given trouble.

Worth stating plainly, because it is the reason this is filed as a finding rather than a
tidy-up: this was not a latent shape waiting to bite. It had already bitten. Ranger, Shaman,
Warlock, Berserker and Stormcaller abilities had stopped appearing on granted-skill gear
entirely, for however long the renames have been in.

## The filter was the defect, not the safety net

It reads like defensive programming and it is the opposite. The filter cannot distinguish
"this id was retired on purpose" from "this id was misspelled" from "this ability was renamed
and nobody updated the pool" — it treats all three identically, by deleting authored content
and continuing. Its failure mode is strictly silent and strictly lossy.

It is gone, and the comment in its place says it must not come back.

## The fix is a compile error, and getting one cost 231 sites

`AFFIX_MOD_IDS` in `data/augments.ts` had the same shape and was fixed by typing it against
`ModPoolId`, a union derived from the authored affix table. The loud version of that bug was a
crash on boot; this is the quiet version, and the same cure applies — but the cost is not the
same, and anyone told "just do what `AFFIX_MOD_IDS` did" should know why before starting.

`MOD_POOL` is **one** authored array in **one** file, so `as const` on it was a one-line change.
Abilities are 210 `export const X: Ability = {…}` declarations across 21 class files, plus 21
tables that collect them. **An annotation widens `id` to `string` at the declaration**, and
nothing downstream can recover a literal that was discarded upstream — so every one of those
231 sites had to become an assertion instead:

```ts
export const RANGER_SPLITSHOT = { … } as const satisfies Ability;
export const RANGER_ABILITIES  = [ … ] as const satisfies readonly Ability[];
```

`satisfies` checks exactly the shape the annotation checked; `as const` is what keeps the
literal. The diff is mechanical and entirely in those two spellings. Compile time was
unaffected (2.3s wall for the full `tsc --noEmit`).

`AbilityId` is then `(typeof ABILITY_TABLES)[number][number]["id"]` — all 210 ids — and
`GRANTABLE_ABILITY_IDS: readonly AbilityId[]` makes a renamed ability a **TS2322 on the line
that names it**.

### Two instruments that were blind on the way here, both caught by falsifying

Recorded because both looked finished and neither was:

1. `function abilityTable<const T extends readonly Ability[]>(list: T): T` — a `const` type
   parameter, which preserves literals for values written inline. The abilities are not
   written inline; they are already-annotated consts, so it preserved nothing. It compiled,
   and a bogus id typechecked.
2. `satisfies Ability` **without** `as const`. `satisfies` supplies the contextual type during
   inference, so `id: "ranger.splitshot"` widens against the interface's `id: string` exactly
   as the annotation did. It compiled, and a bogus id typechecked.

Both were caught the same way: assign `"definitely.not.real"` to the derived type and demand a
red. The final form gives TS2322 naming the full union, for a bogus id **and** for the five
real stale ones.

`Item.grant` stays a plain `string` deliberately — a save written before a rename can hold a
grant id that no longer exists, and it must load and degrade quietly. `tools/forge.ts` tests
membership with `.some((id) => id === grant)` rather than casting the pool back to
`readonly string[]`, which would switch the typechecker off at the one list it was just turned
on for.

## The five replacements — two are obvious, three are a design call

The dead ids were replaced with ids that exist. Two are plainly the same ability renamed:

- `ranger.arrow_volley` → **`ranger.splitshot`** — "a heavy arrow that splits into a fan."
- `warlock.void_bolt` → **`warlock.black_bolt`** — "a bolt of nothing."

The other three have no surviving equivalent, so these are judgment, chosen against the list's
own stated criteria (flashy, self-contained, reads well on a non-member of the class) and
avoiding anything coupled to a class resource a wearer will not have:

- `shaman.flame_totem` → **`shaman.rootcaller`** — roots up through the floor in a line. The
  Shaman's nearer-looking options (`spirit_hawk`, `bone_talisman`) key off talisman marks and
  would be dead weight on anyone else.
- `berserker.leap_slam` → **`berserker.axequake`** — a fan of widening cracks. Self-contained
  and reaches; the leap half of the original has no survivor.
- `stormcaller.chain_lightning` → **`stormcaller.ball_lightning`**. The literal namesake,
  `tempest_chain`, scales with Static stacks and so reads as nothing on a non-Stormcaller.
  `thunderstep` was considered and rejected as too large a grant — a blink is a mobility
  upgrade, not a flashy extra button.

**These three are content, so they are the owner's to overrule**, and each is a one-line change
if they want a different ability. What is not a judgment call is that the pool should be twelve:
that is what the list has said since it was written.

## Not yet measured

The pool going 7 → 12 is a live change to what epic-and-better gear can roll. The cheap gate is
green (42 steps) and `npm run forge` passes, but `npm run smoke` has not been run against it —
it belongs to the integration gate, and it should be run there rather than assumed.
