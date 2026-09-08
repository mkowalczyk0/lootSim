# The Universal Skill Tree — UAT §18

The working record for the account-wide tree: what was built, the decisions behind it,
what was deliberately left out, and what a fresh session needs to know to pick it up.

Proven by `npm run universal` (`tools/universal.ts`), wired into `npm test`.

## What it is

A second tree, shared by every class, alongside the class's own five-path behaviour tree.
The two answer different questions and the whole design depends on keeping that line
clean:

| | asks | deals in |
|---|---|---|
| class tree (`src/progression/<class>.ts`) | "how does my class/build work?" | behaviour — mutations, rules, resource patches |
| universal tree (`src/progression/universal.ts`) | "how does my character fundamentally improve?" | `Mods` only |

Six paths — **Vitality, Swiftness, Might, Attunement, Warding, Avarice** — each five
nodes deep, all hanging off one shared root (`Fundamentals`), ending in a two-point
keystone.

## The load-bearing decision: account-wide pool, per-class allocation

§18 doesn't say where the points come from, and the obvious reading ("it's universal, so
make it all account-wide") turns out to be wrong in one specific half. The split that
shipped:

- **The point pool is account-wide and *derived*** — `universalPointsFor(recordDepth)` in
  `src/progression/universal.ts`, off `GameState.stats.deepestDepth` (the lifetime
  best-of-all-classes record), surfaced as `GameState.universalPool`. One point per two
  depths, capped at `UNIVERSAL_POINT_CAP` (20). Derived rather than accumulated for the
  same reason `treePointsFor(level)` is: there is no counter to drift, and retuning the
  curve needs no migration.
- **The allocation is per-class** — `Player.universalAllocated`, its own list, resolved
  into its own `ResolvedBuild` by `Player.universalBuild` and folded into `Player.mods`
  alongside the class build.

Three reasons, in the order they mattered:

1. **The co-op wire settles it.** `playerToJSON` (`src/game/state.ts`) is *both* the save
   format and the payload `net/party.ts` sends for a character — the host rebuilds a
   remote hero with `playerFromJSON` from exactly that blob. On `Player`, a remote's
   universal nodes travel for free along the path a sheet already travels. On
   `GameState`, they wouldn't travel at all, and the host would compute a remote
   player's damage from a weaker character than the one on their own screen — a brand
   new desync vector, in the subsystem UAT §1 exists to de-desync.
2. **`Player.mods` stays self-contained.** `Player` imports nothing from `state.ts`, and
   `Player.mods` is the one place power is added up. An account-wide allocation would
   need `GameState` injected or mirrored in, and would be outright wrong in co-op where
   two heroes on one machine have different allocations.
3. **It's the better build design.** §18 asks for "meaningful paths and tradeoffs". A
   caster wants Attunement; a melee wants Might. One shared allocation across 21 classes
   forces a lowest-common-denominator spend. Respec is free, so per-class costs nothing
   but a visit.

The account-wide *feel* the "make it all account-wide" instinct is really after is
delivered by the pool: **a brand new alt starts with the full pool already spendable.**
It inherits the account's progress; it just decides for itself how to spend it.

## Why it's a DAG and not six ladders

`TreeNodeV2.requires` is a single node id, and every reader in `nodes.ts`
(`canAllocateV2`, `pruneAllocationV2`, `spentPointsV2`, `pathPointsV2`,
`collectNodeEffects`) treats it as an opaque id — so a shared root and cross-path
prerequisites needed **no changes to the allocation engine at all**. The only thing the
universal tree needs of its own is the *builder*: `buildProgressionTree` hard-wires row
N's prerequisite to row N−1 and takes a fixed five-node tuple, neither of which can
express a shared root or a cross-link.

Three cross-links (`CROSS_LINKS`) re-point one **deep** node's prerequisite into a
**shallow** node of a neighbouring path:

| node | needs | meaning |
|---|---|---|
| Warding · Bulwark | Vitality · Toughness | living through everything teaches you to shrug off an element |
| Attunement · Conduit | Swiftness · Reflexes | constant movement is what turns cooldowns into a rhythm |
| Avarice · Magnetism | Might · Force | you only get greedy once you can clear the room |

Deliberately never a path's *entrance* — all six stay enterable from the root, because
gating a whole path behind another would make the sixth path unreachable for most of the
game at this pool size. What it does gate is the bottom half, keystone included: **no
deep build is ever pure.** That sets the keystones (reward for depth) against the
cross-path unlocks (reward for breadth).

## Why every keystone hurts

A point pool makes choices *scarce*; it doesn't make them *pointed*. Each keystone pairs
its payoff with a negative mod in a **different** stat (`tools/universal.ts` asserts
both — a downside in the same stat as the payoff would be a fake tradeoff):

| keystone | payoff | cost |
|---|---|---|
| Immovable | health, defense | move speed |
| Windborne | move speed, dodge recovery, evasion | max health |
| Overwhelming Force | melee/projectile damage, crit damage | defense |
| Unbound | cooldown recovery, skill damage, area | melee/projectile damage |
| Adamant | every resist, ward | attack speed |
| Hoarder | coins, gems, pickup radius | max health |

And `UNIVERSAL_POINT_CAP` (20) is well under the tree's total cost (37), asserted, so
**the tree can never be finished** — the delve has no depth limit, and without the cap a
deep enough account would eventually buy every node, which is exactly the "simple list
of upgrades" §18 says not to build.

## The four new mod keys

§18's list needed knobs the sim didn't have. Each is percentage-based (rarity multiplies
gear stats by 2^n up to 128×, so a flat node is worthless by epic) and each cost one
small change at a single existing use site:

| key | reaches the sim at | notes |
|---|---|---|
| `dashRate` | `dungeon.ts` dash branch, via `Player.dashCooldownMult` | reciprocal like `cooldownMult`, floored at 0.25 so it can never reach a free dash |
| `pickupRadius` | `updatePickups`, via `Player.pickupRangeMult` | scales `MAGNET_RANGE` and `PICKUP_RANGE`, applied to the **claimant** — a wider magnet reaches further but still can't out-reach a hero standing closer, so the "whoever gets there first" loot rule is intact |
| `coinFind` | `collect`, via `Player.coinFindMult` | |
| `gemFind` | `collect`, via `Player.gemFindMult` | |

`coinFind`/`gemFind` land at **pickup**, not at drop, because that is the only place a
drop has an owner: `dropPickup` has none and the clear cache is dropped for the floor.
These are the first and only **player-sourced** loot multipliers in the game — every
other one (mode, depth, Challenger) is decided by *where you went*, not *who went*.

None of the four is in `MOD_POOL`, so no item rolls them; they have `MOD_SCORE` entries
anyway because the record is exhaustive and a wrong score would silently misrank an
affix if one were ever added.

## Deliberately left out of v1 (each has a technical reason, not just scope)

1. **Rarity-find.** Has to hook `depthWeights` at the drop site, and `dropClearCache`
   has *no per-hero context* (it reads the local hero only). That plus a direct hit on
   `BASE_RARITY_WEIGHTS` — the funnel every item source reads — makes it its own task.
   Coins and gems already answer §18's "loot-related bonuses".
2. **Dash charges / "+1 dodge".** `Avatar` has only `dashTimer`/`dashCooldown` scalars
   and the netcode owns a dash outright; it needs new avatar fields and a snapshot
   change. "Movement utility" is covered by move speed + dash cooldown instead.
3. **`ultimateRate`.** It is a **dead knob** — declared in `mods.ts` and rolled as an
   affix (`of Ascent`), but nothing in the sim reads it; meters fill purely from
   `ResourceSpec.generation`. A node granting it would be a lie. Logged in
   `docs/class-validation.md`'s backlog.
4. **Class-resource generation patches.** Only `mana` and `ultimate` are shared resource
   ids; everything else is class-specific and would silently no-op. Worse,
   `patchResourceSpec` **assigns** rather than adds, so a universal `regenPerSec` node
   would *overwrite* each class's tuned value. §18's "resource generation" is covered
   through the additive `Mods.manaRegen` path (Attunement · Clarity).
5. **Universal `rule` strings.** `game/rules.ts` matches rule ids by exact string
   equality against hard-coded branches, so each would need a literal hook there. Staying
   mods-only means `rules.ts` and `abilities.ts` are untouched and no second
   grants-install path is needed.

## Save

`SAVE_VERSION` 14 → 15. One new persisted field (`Player.universalAllocated`); the pool
is derived, so there is no earned-points counter to persist. A v14 save loads with the
allocation empty and the pool its record depth already earned — an existing character
opens the screen with points waiting rather than having to re-earn them.
`normalizeUniversalTree(pool)` prunes on load and trims the deepest nodes first if the
pool ever shrinks below what's spent (which retuning the curve could do).

`playerFromJSON` passes `Infinity` as the pool **on purpose**: a remote player's pool
comes from *their* account record, which this machine can't know, and trimming against
the local pool would nerf anyone further along than the host. It trusts the sheet exactly
as much as the existing model already trusts its `level`, `allocated` and `equipment` —
the same hole, not a new one.

## UI

A new `Universal` tab in `CYCLE_TABS` (`src/ui/town.ts`), off the Quartermaster, next to
`Tree` and modelled on `renderTree` so the two screens are siblings. Its own
`universalBranch` cursor field; row 0 is the shared root, which is why
`rowCount()` returns `UNIVERSAL_PATH_DEPTH + 1` — walking up out of any path lands on
the root, exactly as the tree data says. Fixed accent (`#7dd3fc`) rather than the class
colour, since it belongs to no class. CSS: `.tree.universal` (six columns), `.tree-root`
(full-width cell) and `.tree-node.crosslink` (suppresses the vertical connector, which
would otherwise claim a prerequisite that isn't in that column) in `src/styles.css`.

## Verification

`npm run universal` — 70-odd checks in nine groups: DAG well-formedness (prereqs exist,
no cycles, cross-links genuinely cross and never gate an entrance), tradeoffs (every
keystone has a downside, in a different stat, and the cap stays under the tree's cost),
mods-only (resolving the *entire* tree yields no mutations, grants, resource patches or
rules), the root belonging to no path, zero-allocation-is-zero-mods, a real allocation
moving the numbers it claims (including a keystone's downside landing and health being
re-clamped), hybrid thresholds, the pool/allocation split (independent per class, alt
inherits the pool), and persistence including the co-op wire round-trip and junk-in-save
handling.

**The simulation is unchanged at zero allocation, and that was verified empirically, not
just argued:** `tools/smoke.ts` output was diffed against master (b1e1b42) and is
identical except for two probes that differ master-against-master too (the chest-odds
sample and tileset line ordering are unseeded). Campaign depths on both: **sharp 11.3 /
reckless 8.9.** Note those are the real current numbers — `docs/class-validation.md`
still quotes 11.0 / 10.0 in places, which was already stale before this branch.

## If you're picking this up cold

- The tree is **data**: to add or retune a node, edit `PATHS` / `CROSS_LINKS` /
  `UNIVERSAL_UNLOCKS` in `src/progression/universal.ts` and run `npm run universal`.
  Nothing in the allocation engine needs to know.
- Keep it **mods-only**. The test enforces it. A universal node that mutated an ability
  or flipped a rule would erase the line between the two trees, and the class tree's
  identity would start leaking into the shared one.
- Keep every keystone's downside **in a different stat** from its payoff, and keep the
  point cap under the tree's total cost. Both are asserted, both are the difference
  between a tree of tradeoffs and a shopping list.
- **Balance is reasoned, not measured.** The pool curve (1 per 2 depths), the cap (20),
  and every node's numbers were set by argument and checked only for "the sim doesn't
  move when nothing is allocated". Nobody has played a character with 20 universal points
  in it. That wants a real playtest, exactly like `partyScale` does.
