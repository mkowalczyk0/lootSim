# Combat Vocabulary — Phase 1 of the class refactor

This is the layer `classes_refactor.md` §3 and the architecture audit's Phase 1 call
for: **reusable combat primitives so future class content is mostly data**. It is not
classes, not the full skill roster, and not a UI change. It lives in `src/combat/`,
is pure (no DOM, no `Dungeon` import), and is proven by `npm run vocab`
(`tools/vocab.ts`), wired into `npm test`.

## What's in `src/combat/`

| File | Responsibility |
|---|---|
| `tags.ts` | `SKILL_TAGS` — the semantic labels a tree node / hybrid / item targets instead of a skill id. |
| `damage.ts` | `DamagePacket` (type + channel + source), the 9 damage types, the 10 channels, `applyDamageModifiers`, and **THE ULTIMATE RULE** (`isUltimateSourced`). |
| `status.ts` | One `StatusContainer` for DoTs, CC, debuffs **and buffs**. Generic tick — no bespoke timers. Baseline registry (bleed, burn, poison, chill, freeze, shock, curse, doom, mark, vulnerable, weakened, exposed, rooted, stunned, silenced, blinded, taunted, stealth, corruption); `registerStatus` to extend. |
| `resources.ts` | `ResourceSpec` + `ResourcePool` + `ResourceSet`. Generation rules, decay (with out-of-combat delay), thresholds (effects + `whileAbove` mods), overflow, temporary resources, health conversion. Mana is one instance; the ultimate meter is one instance with `isUltimateMeter`. |
| `triggers.ts` | `EventBus` — typed combat events, depth-guarded re-entrancy, tag/crit/chance filters, unsubscribe handles. The grown-up `fireTriggers`. |
| `targeting.ts` | `resolveTargets(mode, ctx, host)` for all 15 modes (self / ally / point / direction / line / cone / radius / current / marked / lowest-HP ally / highest-threat / corpse / summon / zone). |
| `ability.ts` | The `Ability` data schema and the `EffectStep` union — damage, status, cleanse, consume/detonate, spread, heal (+HoT), shield, projectile, move, summon, zone, terrain, threat, resource, knockback, pull, interrupt, delay, reactive, follow-up, fx. Plus `MutationHook` declarations, `FxProfile` / `AudioProfile` / `TelegraphProfile`. |
| `host.ts` | `CombatHost` — the seam. The executor asks the host to deal damage / spawn things / move bodies; the real dungeon and the test both implement it. |
| `runtime.ts` | `AbilityRuntime.castAbility` + the single generic `runEffect` dispatcher. Cooldowns keyed by **ability id**, not equip slot. |

## Requirement → implementation map

- **Resources** (current/max/generation/spending/regen/decay/thresholds/overflow/temporary/
  health-conversion/event-driven) → `ResourceSpec` + `ResourcePool`. Fundamentally
  different resources (Rage, Chi, Souls, Momentum, …) are the same spec with different
  numbers and a different `ui`. Mana is not privileged.
- **Damage types** → `DAMAGE_TYPES` = the six legacy elements + `holy`/`arcane`/`nature`,
  extensible via `EXTRA_DAMAGE_TYPES`. (See "Deliberately deferred" below.)
- **Damage channels** → `DAMAGE_CHANNELS`; modifiers target channels independently
  (`applyDamageModifiers`), and the spec's "+15% vs afflicted target" example is
  implemented to lift a hit but **not** the DoT.
- **Status effects** (duration/stacks/max/source/chance/resistance/immunity/refresh/
  cleanse/consume/spread/detonation/expiration/trigger callbacks) → `StatusSpec` +
  `StatusContainer`.
- **DoTs** → a status with `category: "dot"`, `dps`, `tickInterval`. `StatusContainer.tick`
  is the only timer. Snapshot-on-apply by default, `dynamic` opt-in.
- **Triggers** → `CombatEventType` covers on skill use / hit / crit / damage taken /
  dodge / kill / enemy death / status applied / status expired / resource change /
  ultimate use / enter+leave combat (+ corpse created, summon death).
- **Targeting** → `TargetingMode` covers the full list including corpse / summon / zone;
  `position history / temporal anchor` is left for the Magician's Paradox to add.
- **Skill definition** → `Ability` + `EffectStep[]`. Every bullet in the brief
  (damage / healing / shield / projectile / movement / teleport / summon / terrain /
  status / resource gen+spend / cooldown / targeting / charge / channel / delayed
  effect / follow-up / trigger behavior / FX / audio / animation) is a field or a step.
- **No giant switch statements** → `runEffect` switches on `EffectStep.kind` (a small
  closed vocabulary), never on class or skill id. A new class's odd skill is data plus,
  rarely, one new step kind everyone reuses.
- **THE ULTIMATE RULE** → enforced at the framework level in two places that agree:
  `runtime.castAbility` stamps `source.fromUltimate` on every packet an ultimate
  produces, and `ResourcePool.handleEvent` refuses any generation rule for an
  ultimate-sourced event unless the rule sets `allowFromUltimate: true`. `tools/vocab.ts`
  regression-tests both the block and the explicit exception.

## Extensions the six pilot classes drove (Phase 7)

Building Lancer / Berserker / Magician / Necromancer / Paladin / Stormcaller on this
layer exposed a handful of missing primitives. Per `classes_refactor.md` rule 4, each
was added as a **generic** seam every later class can reuse, never a class branch:

| Need (class) | Addition |
|---|---|
| "cannot fall below 1 HP briefly" (Berserker Last Stand, Paladin Last Light) | `StatusSpec.guardsDeath` + `StatusContainer.deathGuarded` — the host's damage resolver caps a killing blow at 1 |
| "hit harder the closer *you* are to death" (Berserker, Reaper-to-come) | `DamageTemplate.casterMissingHealth` — a rider distinct from the victim-reading `executeMissingHealth` |
| random spell outcome (Magician Arcane Roulette, Trickster-to-come) | `EffectStep` `random` — weighted branches, rolled through `host.random()` |
| re-task existing minions (Necromancer Command: Ravage) | `EffectStep` `commandSummons` + `CombatHost.commandSummons` |
| sacrifice your own minions (Necromancer Death Pact) | `EffectStep` `consumeSummons` + `CombatHost.sacrificeSummons` |
| raise/detonate corpses as a cost (Necromancer) | `summon.fromCorpses` + `CombatHost.consumeCorpses`; `ResourceEventType` gains `corpseCreated` / `summonDeath` |
| redirect an ally's incoming damage (Paladin Guardian's Oath, Juggernaut-to-come) | `EffectStep` `redirect` + `CombatHost.redirectDamage` |
| absorb one hit of any size (Paladin Shield of Faith) | `shield.absorbOneHit` |
| originate a spell from where you *were* (Magician Paradox) | targeting mode `temporalAnchor` + `TargetContext.positionHistory` / `CastInput.positionHistory` |
| a stance / phase resource (Stormcaller Weather Phase) | `StanceSpec` + `StancePool`, held alongside pools in `ResourceSet`; `EffectStep` `stance` cycles/sets it |

`tools/classes.ts` (`npm run classes`) drives all of them through the real executor.

## Deliberately deferred (and why)

Per `classes_refactor.md` rule 12 — surface an architectural conflict rather than
quietly compromise:

1. **`holy` / `arcane` / `nature` are combat-model types, not full `ELEMENTS` yet.**
   Promoting them into `src/data/elements.ts` grows `Mods` keys, resist caps, a
   material per element, the town bag UI, and every positional index table in
   `net/sync.ts`. The audit scopes that as its own dedicated commit (Phase 1.5). The
   new layer is written so that promotion is additive and `DAMAGE_TYPES` keeps working.
2. **The existing 23 skills / 15 ultimates are not ported onto `Ability` yet.** That is
   audit Phase 2.2 — a big behavior-identical refactor of `dungeon.ts::castSkill`
   whose whole job is proving nothing changed. This phase builds the target; it does
   not migrate onto it.
3. **`CombatHost` is not implemented by `Dungeon` yet.** Same reason.
4. **The mutation-hook engine is declared, not executed.** `Ability.mutationHooks` and
   the `MutationKind` list exist so abilities can be authored with the seams in place;
   the node/item side that rewrites through them is audit Phase 5.
5. **Minion AI is a spawn request, not a runtime.** `EffectStep` `summon` and the
   `MinionRequest` shape are here; the mobile-minion entity + flow-field pathing is
   audit Phase 4.
6. **The wire format is untouched.** No new `HeroSnap` fields. Multiplayer stabilisation
   and the wire freeze come before any of this reaches the snapshot (audit Phase 3.2).
