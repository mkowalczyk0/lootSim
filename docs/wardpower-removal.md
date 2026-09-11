# Retiring `wardPower` — a stat eleven nodes granted and nothing read

**Status: implemented.** Branch `fix/wardpower-riptout`. The rule it leaves behind is
`npm run modkeys` (`tools/modkeys.ts`), folded into `npm test`.

## What was wrong

`wardPower` was a `ModKey` in `src/data/mods.ts`, granted by twenty authoring sites, and
**no file in `src/combat/`, `src/game/` or `src/net/` ever read it.** The ward pool it
named is real — `hero.ward` absorbs damage before health does, `shieldHero`, `shieldActor`
and the `shield` ground-zone benefit all fill it — but every one of those writes a flat
amount. Nothing anywhere multiplied by `wardPower`. Eleven classes shipped a foundation
node that did nothing, for most of this project's life, with the whole acceptance chain
green, because nothing in the chain ever asked the question.

## The ruling, and why the content moved rather than the engine

Implementing it was the obvious repair and was recommended once. **The owner overruled
that.** The reasoning is now a standing project rule:

> *"the code never matched the prose" does not tell you which side moves.* Ask which
> direction the correction pushes balance, and whether anyone asked for a change in that
> direction.

Implementing `wardPower` would have handed eleven classes a new defensive layer nobody
requested. So the stat was removed and the content re-authored.

## The inventory — 24 code sites

The brief this branch was written from said "eleven foundation nodes, two threshold
bonuses, the affix and a relic." The sweep found more, which is recorded here because an
undercounted scope is this repo's signature failure:

| where | n | what |
| --- | --- | --- |
| `src/data/mods.ts` | 3 | `COMBAT_MOD_KEYS`, `PERCENT_MODS`, `MOD_LABELS` |
| `src/game/item.ts` | 1 | the `MOD_WEIGHTS` vendor-valuation entry |
| `src/data/items.ts` | 1 | the `of Warding` suffix |
| `src/data/relics.ts` | 2 | Shard of a Broken Throne — its `mods`, and its `description` |
| `src/progression/*.ts` | 10 | foundation nodes, across **9** classes (Necromancer has two) |
| `src/progression/universal.ts` | 2 | the `Barrier` node and the `Adamant` keystone |
| `src/progression/*.ts` | 5 | resource thresholds — 4 class + 1 hybrid `addThresholds` patch |

Ten foundation nodes, not eleven; **five** threshold sites, not two; and two universal-tree
sites the brief did not mention at all.

## How power was held constant

Three groups, and the third is the one with an honest cost.

**15 sites are pure removals — exactly zero change.** The site still grants a live effect
once the dead key is gone, so nothing needed replacing: all five thresholds, the `Adamant`
keystone, the relic, Reaper's *Bulwark of the Dead* and Stormcaller's *Still Point* (both
already carried live `defensePercent`), and the three plumbing sites.

**2 sites fold the dead half into the live half they already had.** Engineer *Spare Parts*
`cooldownRate` 0.05 → 0.08, Necromancer *Iron Bound* `defensePercent` 0.06 → 0.08.

**7 sites granted `wardPower` and nothing else**, so removing outright would leave an empty
node — a worse defect than the one being fixed. Each takes one live stat at the **bottom of
the peer foundation band**:

| class | node | path | now grants |
| --- | --- | --- | --- |
| Alchemist | Field Kit | Medic | `healthPercent 0.06` |
| Bard | Gentle Refrain | Minstrel | `cooldownRate 0.06` |
| Juggernaut | Cover Fire | Sentinel | `defensePercent 0.08` |
| Necromancer | Calcify | Bone Lord | `healthPercent 0.06` |
| Paladin | Hallowed | Sanctifier | `defensePercent 0.08` |
| Warden | Green Thumb | Verdant | `healthPercent 0.06` |
| *(universal)* | Barrier | Warding | `defensePercent 0.06` |

The band is **a fixed reference this change cannot move**: every other foundation node in
the game grants one live stat at 0.05–0.16, most commonly `skillDamage: 0.05` (7 nodes) and
`areaSize: 0.1` (5 nodes). These eleven were the only foundation nodes in the game granting
nothing at all.

**The honest cost.** Those nine sites do go from zero to a small live number, so the nine
classes touched gain slightly. There is no way to both keep a node non-empty and leave it
granting nothing; the alternative reading of "power constant" is deleting eleven nodes,
which is a larger uncommanded change than this one. The numbers are sized to minimise it,
and it is stated here rather than buried.

## The save, and why there is no `SAVE_VERSION` bump

`ItemMod` persists the rolled `key`, and `normalizeItem` already drops mods whose key is
not in `MOD_KEYS`. So retiring the key naively would have **silently deleted the affix off
every "of Warding" item already in a stash** — no crash, but quietly smaller gear.

Instead the suffix keeps its id, its label and its exact `base`/`perTier` and now rolls
`defensePercent`, and a version-agnostic `RETIRED_MOD_KEYS` rewrite in `normalizeItem` runs
*before* that filter. A saved item keeps its affix, its rolled number and its name, and
finally does something. This is the `normalizeAppearance` house style the save header
documents, and it sits directly above the legacy-essence rewrite that does the same job for
a different retirement. **No version number was needed and none was claimed.**

## What the branch leaves behind

`npm run modkeys` asserts the rule directly: **no mod key may be authored without a live
read in `src/combat/` or `src/game/`.**

A rule that cannot be violated beats a check that notices, and that was looked for first —
it is not available. `Mods` is consumed ad hoc at dozens of call sites rather than through
one exhaustive `Record`, so there is no `buildSprites()`-shaped seam where the compiler
could refuse a key with no consumer. Building one would mean rewriting every read site, a
far larger change than the defect.

So it is a check, built against the four failure modes CLAUDE.md names:

- **Its subject** is imported from `src/data/mods.ts`, so a key added tomorrow is walked
  for free and cannot be missed by forgetting a second list.
- **Its bound** is the simulation directories — a grant can never satisfy it by being a
  grant.
- **Its scope is printed**: `walked 53 mod keys against 32 simulation files`.
- **Known-dead keys are pinned, not filtered**, on the `tools/legends.ts` precedent.

It was **falsified in both directions before being trusted**, and both are reproducible:

```
# a grant-only key must go red
+  "thorns", "ultimateBounces", "ultimateProjectiles", "bogusTestKey",   # src/data/mods.ts
  FAIL  no mod key is granted without a live read … — dead: bogusTestKey

# silently fixing a pinned key must also go red
+  const _t = { ultimateBounces: 1 };                                    # src/game/player.ts
  FAIL  every pinned dead key is still dead … — now live, unpin it: ultimateBounces
```

## Two findings this branch did not act on

**`ultimateBounces` and `ultimateProjectiles` are in exactly `wardPower`'s position** —
authored on Stormcaller's threshold, foundation node and archetype patch, and on the
`of Rebounding` / `of the Manifold` suffixes, and never read. They are **pinned in
`tools/modkeys.ts`, not fixed.** Giving them the same treatment is an owner call on a
separate branch: *"+1 ultimate bounce doesn't exist below mythic"* is a named design pillar
in CLAUDE.md, so retiring it is not a decision to make as a side effect of this one.

**`docs/ultimate-uptime.md` and `tools/ultimate-uptime.ts` both reason about a feedback
loop that never existed** — "Conviction above 60 grants `wardPower +0.15`; a bigger ward
prevents more", used to argue about damping. That chain was inert at every link. The prose
is corrected on this branch; whether the tool's conclusions need revisiting is left to
whoever owns that instrument.
