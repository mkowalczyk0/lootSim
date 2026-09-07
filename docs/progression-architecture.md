# Progression Architecture — Phase 2 of the class refactor

Where `docs/combat-vocabulary.md` built the verbs (`src/combat/`), this builds the
grammar: the skill tree that alters behaviour, the mutation framework that rewrites a
skill in place, and the cross-path hybrids and three-path Mythic Archetypes on top.

It lives in `src/combat/`'s sibling, **`src/progression/`**, is pure (no DOM, no
`Dungeon`, no `Player`, no persistence), and is proven by `npm run prog`
(`tools/progression.ts`), wired into `npm test`.

Per the task: **the class roster is not migrated.** Only the Lancer is reproduced, as
the smallest real thing the framework has to represent — the class the spec works every
example through.

## What's in `src/progression/`

| File | Responsibility |
|---|---|
| `mutations.ts` | `SkillMutation` + `applyMutations(ability, mutations)` — the in-place ability rewrite. A target predicate (by id, by tag, by all-tags, or global) plus an ordered `MutationOp[]`. Deep-clones; the base ability is never touched. |
| `nodes.ts` | `TreeNodeV2` + `NodeEffect` — the 5-path × 5-row tree with behaviour payloads. Node categories `foundation / behavior / resource / mutation / keystone`. Readers over an `allocated` string list: `canAllocateV2`, `spentPointsV2`, `pathPointsV2`, `pruneAllocationV2`, `collectNodeEffects`. |
| `unlocks.ts` | `PathUnlockDef` (one shape for both tiers) + `evaluateHybrids` / `evaluateArchetypes` — pure functions over the allocation, gated on per-path point totals. `validateUnlockDef` for data sanity. |
| `build.ts` | `resolveBuild(tree, allocated, unlockDefs)` → one `ResolvedBuild` (mods, mutations, grants, resource patches, rules, unlocked hybrids/archetypes). `applyBuild(build, ability)` is what the runtime should cast. `patchResourceSpec` folds resource-rule patches onto a class spec. |
| `lancer.ts` | Reference data, now a full pilot class (see below): 10 abilities, the five-path tree, six hybrids and the **Comet Vanguard** archetype. |
| `class.ts` | `PilotClass` (the whole bundle: resources, stances, statuses, 10 abilities, tree, unlocks), `installClass` / `makeClassResources` / `resolveClassBuild`, and `validateClass` / `validateRoster` (the "no skill shared between classes" rule). |
| `berserker.ts` · `magician.ts` · `necromancer.ts` · `paladin.ts` · `stormcaller.ts` | The other five pilot classes. |

## Pilot classes (Phase 7)

The six architecture-pilot classes — **Lancer, Berserker, Magician, Necromancer,
Paladin, Stormcaller** — are built entirely on this layer plus `src/combat/`. They are
data: `PILOT_CLASSES` in `src/progression/index.ts`. Nothing is wired into `game/` yet
(the deferrals below still stand); `resolveBuild` / `applyBuild` remain the seam.

Between them they exercise every primitive the brief lists — melee, ranged, Mana,
Momentum, Rage, Corpses, Souls, Conviction, Weather, Summons, statuses, DoTs, terrain,
shields, healing, party utility, skill mutations, hybrid builds — and each earns its
ultimate through a **charge rule that says something** (Berserker by being hit, Magician
by spending Mana, Paladin by preventing damage, Stormcaller by landing lightning, …), never
`perKill: 1`. The framework gaps they exposed were closed as generic seams, listed in
`docs/combat-vocabulary.md`. `tools/classes.ts` (`npm run classes`, wired into `npm test`)
proves all of it — validation, resolution, hybrid/archetype thresholds, THE ULTIMATE RULE
per class, and both solo and multiplayer-relevant state changes (an ally buff landing on
the *other* hero, a redirect binding an ally, `resolveBuild` being deterministic so a host
and client agree).

## Phase 8 — the full roster

All **21 canonical classes** are now built on this layer as data: `ALL_CLASSES` in
`src/progression/index.ts`, in the order `docs/classes_refactor.md` §1 lists them
(Oracle and Chronomancer are gone from the design). Each is a `PilotClass` — 10 unique
skills (9 + 1 ultimate), a class-owned resource identity, a five-path v2 tree in the
canonical `foundation → behavior → resource → mutation → keystone` order, six cross-path
hybrids and at least one three-path Mythic Archetype. `PILOT_CLASSES` stays as the
original six, only because `tools/classes.ts` drives them against the live combat
runtime.

- **`src/progression/audit.ts`** is the anti-overlap pass from `classes_refactor.md`
  §32 as code: duplicate skill concepts (name-level), shared ultimates, shared resource
  ids, single-element "reskin" kits, stat-only tree columns, and class-specific rule
  strings leaking un-namespaced into `ResolvedBuild.rules`. Errors fail the build;
  design-note warnings (a mono-element caster, a sanctioned concept overlap) are printed.
- **`src/progression/matrix.ts`** derives the one-row-per-class matrix the spec asks for
  (resource · role · damage identity · unique mechanic · ultimate · paths · hybrids).
- **`tools/roster.ts`** (`npm run roster`, wired into `npm test`) proves the whole
  roster: `validateClass` per class, `validateRoster` for cross-class uniqueness, the
  audit, and that every hybrid and archetype unlocks only at its point thresholds and
  resolves deterministically.
- **In-game Codex.** `src/ui/town.ts` has a read-only **Codex** tab (in the
  Quartermaster's `[I]`/`[O]` cycle) that renders the matrix and a per-class drill-down
  (overview / 10 skills / hybrids + archetype) straight from `src/progression`. It is
  deliberately not wired to `state.player`: the live dungeon still runs the shipped
  `data/classes` + `data/tree` for the 15 legacy classes. The Codex is the design made
  visible ahead of the combat cutover.

## The mutation op vocabulary → spec §3.11 hooks

`MutationOp` kinds map one-to-one onto the `MutationKind` seams already declared in
`combat/ability.ts`:

| Spec hook | `MutationOp` kind |
|---|---|
| damage packet modifier | `damagePacket` (base, type, channel, execute rider, knockback, on-hit status) |
| targeting modifier | `targeting` (mode, range, arc/width/length/radius scale) |
| projectile modifier | `projectile` (count, pierce, speed, radius, life, behavior, on-expire) |
| movement modifier | `movement` (style, distance, i-frames, leave-anchor) |
| resource modifier | `resource` (scale/add/set/remove cost, add cost entry, add self-generation) |
| status modifier | `status` (chance/duration/potency scale, extra stacks, swap one status id for another) |
| zone modifier | `zone` (radius/duration/tick/damage scale, force merge/follow, set status) |
| summon modifier | `summon` (count, duration, command behaviour, inherited power) |
| trigger modifier | `trigger` (bolt a reactive window onto the ability) |
| follow-up modifier | `followUp` / `addEffect` |
| replace-effect modifier | `replaceEffects` — the **Corpse Bomb → Bone Structure** case |

Two conveniences the audit names explicitly: `cooldown` (P9) and `addTags` (so a
mutated skill starts being seen by tag-targeted nodes downstream).

## Requirement → implementation map

- **Preserve the five-path structure** → `ClassProgression.paths` is five `PathDef`s,
  each a fixed 5-tuple of nodes; `buildProgressionTree` flattens to the same
  `class.path.row` id scheme the shipped tree uses. Linear prerequisites and the
  two-point keystone are unchanged.
- **New node meanings** → `NodeCategory` = `foundation | behavior | resource |
  mutation | keystone`. `NodeEffect` keeps a `mods` case ("possible, but secondary")
  and adds `resourceRule`, `mutate`, `grantEffect`, `rule`.
- **Skill mutations without a separate skill id** → `applyMutations`. Proven by
  `Impaling Thrust → Through Flesh` (id-targeted, composes with the tag-targeted Long
  Point and keystone mutations) and by `Corpse Bomb → Bone Structure` (a
  `replaceEffects` op: same id, the corpse now summons instead of detonating).
- **Cross-path hybrids, data-driven** → `PathUnlockDef { requires: [{path, points}×2],
  effects: NodeEffect[], mutations: SkillMutation[], fx?, ui? }`. `evaluateHybrids` is
  a pure pass over `pathPointsByName`. Breakthrough = Momentum 3 + Vanguard 2 → a rule
  + a granted charge effect + a follow-up-window mutation. Not a percentage.
- **Three-path Mythic Archetypes** → the same `PathUnlockDef` with `tier: "mythic"`
  and three+ requirements. Comet Vanguard = Momentum 6 + Impaler 4 + Vanguard 4 →
  rewrites Meteor Lance (wider/longer lane, +25% impact, +Exposed, and a new persistent
  ally-trail zone step). The test asserts the ultimate's **effect list changes**, i.e.
  gameplay, not stats.
- **Free respec** → an allocation is a `string[]`. Clearing it is the whole operation;
  nothing persists in this layer. `pruneAllocationV2` mirrors the shipped
  `normalizeTree` discipline (drop unknown ids, then orphans).
- **No giant switch / no `if class === …`** → nothing in `src/progression/` branches on
  a class id. `resolveBuild` folds `NodeEffect`s through one `foldEffects`; a
  data-only "toy" class resolves through the identical functions (test §6).

## Deliberately deferred (and why)

Per `classes_refactor.md` rule 12 — surface the conflict rather than compromise:

1. **Not wired into `game/`.** `Player.allocated` still drives the shipped
   `src/data/tree.ts` for all 15 live classes. Swapping the live tree to v2 is a
   `SAVE_VERSION` bump + a "your tree was reset, N points refunded" surface (audit
   Phase 5.2) and belongs with the dungeon's ability-execution migration (Phase 2.2),
   not this phase. `resolveBuild` / `applyBuild` are the seam that migration will call.
2. **Rules are named, not interpreted.** `NodeEffect { kind: "rule" }` and the archetype
   rule flips land in `ResolvedBuild.rules` as a `Set<string>`; the executor/resource
   runtime that reads them (e.g. "Living Projectile: at max Momentum the charge is
   invulnerable") is the same wiring step as (1).
3. **`grantEffect` is collected, not fired.** The build exposes granted effects keyed by
   tag/event; hooking them onto the combat event bus at cast time is (1).
4. ~~Six pilot classes, not the roster.~~ **Done — Phase 8 above.** All 21 canonical
   classes are built as data (`ALL_CLASSES`), audited by `tools/roster.ts`.
5. **The live Path/Tree tabs still render the shipped v1 tree.** The read-only Codex tab
   surfaces the v2 design (matrix, paths, hybrids, archetypes) but does not let you
   *allocate* a v2 node — an editable v2 tree view with the live "you unlocked
   Breakthrough" moment is part of the combat cutover (1), since allocation has to feed
   a simulation that reads it.
6. **Ability schema unchanged.** `applyMutations` works against `Ability` exactly as
   `combat/ability.ts` defines it today — no new fields.
