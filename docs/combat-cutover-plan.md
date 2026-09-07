# Combat Cutover Plan — wiring the 21-class system into the live game

Status: **plan, not yet started.** This is the Phase-2.2 / Phase-9 migration that
`docs/combat-vocabulary.md` and `docs/progression-architecture.md` both defer. It turns
`src/combat/` + `src/progression/` from a proven-but-dark data layer into the engine the
dungeon actually runs.

The task has two halves:

1. **Cutover** — replace the hard-coded skill/ultimate switch in `src/game/dungeon.ts`
   with `AbilityRuntime.castAbility` over `ResolvedBuild`, swap `GameState.player` /
   class-select / Path·Tree·Skills onto `ALL_CLASSES` + v2 trees, bump `SAVE_VERSION`,
   keep `net/sync.ts` honest, keep `npm test` green.
2. **Validation pass** — once the roster is live, measure the 12 evaluation axes per
   class and tune (data-only) where identity or the power curve is broken.

---

## 1. Current seam, as it actually stands

| Concern | Legacy (live) | New (dark) |
|---|---|---|
| Class identity | `src/data/classes.ts` — 15 `HeroClass`, flat `Mods`, `ChargeRules`, `skills: SkillId[]` | `src/progression/<class>.ts` — 21 `PilotClass`, `ResourceSpec[]`, 10 `Ability`, 5×5 `ClassProgression`, 6 hybrids + ≥1 archetype |
| Skill execution | `Dungeon.castSkill` — `switch (skill.shape)` over `bolt/cone/nova/slam/chain/ward/buff/totem` | `AbilityRuntime.castAbility` → `runEffect` over ~25 `EffectStep` kinds, via `CombatHost` |
| Ultimate | `Dungeon.useUltimate/updateUltimate` — `switch (spec.kind)` over `charge/spin/storm/impact/totem`; one `specialCharge: number` on `Hero` | ultimate is a normal `Ability` (`isUltimate`), meter is a `ResourcePool` with `isUltimateMeter`, THE ULTIMATE RULE enforced in `resources.ts` + `runtime.ts` |
| Tree | `src/data/tree.ts` — `treeMods(classId, allocated)` folded into `Player.mods` | `resolveBuild(tree, allocated, unlocks)` → `mods` + `mutations` + `grants` + `resourcePatches` + `rules` |
| Resources | `Player.mana` only; `Hero.specialCharge` | `ResourceSet` (N pools + stances) per actor |
| Statuses | `game/combat.ts` — `StatusInstance[]`, bespoke tick; elements→ailments table | `combat/status.ts` — one `StatusContainer`, generic tick, `guardsDeath`, buffs included |
| Minions | **none.** Stationary `Totem` only | `EffectStep` `summon` → `CombatHost.spawnMinion` — **no entity, no AI, no sync** |
| Damage types | 6 `ELEMENTS` (physical/fire/cold/lightning/poison/void) | 9 `DamageType` — adds holy/arcane/nature, **not promoted to `ELEMENTS`** |
| Wire | `HeroSnap` carries `ch` (1 float), `ul`+`ut`, `cd[4]` | full `ResourceSet` + `AbilityRuntime` + `StatusContainer` per hero — **unencoded** |
| Boss brain | `game/boss.ts` — own telegraph/ability system, deals to heroes directly | unchanged; not in scope |

`Dungeon` already has the party indirection (`Hero`, `AvatarInput`, `localHero`) and the
fixed 60 Hz loop. Those stay exactly as they are.

---

## 2. Hard conflicts — OWNER DECISIONS RECORDED

Asked and answered 2026-09-07. These set the scope.

### C1. Minion runtime → **build the full subsystem now**
The new roster is summon-heavy (Necromancer legion, Engineer turrets/drones/mortar,
Ranger falcon, Shaman spirit hawk, Warden bear/vines, Corsair ghost crew, Reaper
spectral copies, Trickster decoys). Build a real mobile-minion entity: `FlowField`
pathing (reuse `level.ts`), independent targeting, its own health + death, owner
attribution for kill/XP credit, and a per-owner + global summon cap. Its own stage
(Stage 4). Net sync stays **lightweight** — host-authoritative, minion positions only
(see C3).

### C2. `holy` / `arcane` / `nature` → **promote to real `ELEMENTS` first**
Own commit, before the cutover (Stage 1). Grows `ELEMENTS` to 9, adds a damage + resist
`Mods` key per new element, a `STATUS_FOR_ELEMENT` rider each, a material per element
(`src/data/materials.ts`), a crafting essence, the town materials-bag UI, element
colours/prefixes, and the derived index tables in `net/sync.ts` (mostly auto from the
`ELEMENTS` array). `SAVE_VERSION` bump; the materials bag already merges with
`emptyMaterials()` so old saves are safe.

### C3. Wire format → **lightweight, host-authoritative; MP refactor is out of scope**
Per owner: multiplayer is "super buggy" and will be **completely refactored later**
(likely a real server / Tailscale host), per `docs/UAT_Notes_Post_Playtest_Update_Specification.md`
§1. Do **not** invest in the current snapshot protocol. Keep co-op working no worse than
today: encode only what the local client's own HUD/renderer needs (own resource values,
ultimate-meter ratio, per-ability cooldowns) plus minion positions for rendering; every
new mechanic stays host-authoritative and is approximated on clients exactly as enemy
statuses already are. Build the sim so the eventual MP rewrite can serialise whatever it
needs — i.e. keep per-hero combat state in clean, already-serialisable structures.

### C4. Cut depth → **skills + ultimates + basic attacks, all onto `Ability`**
The six weapon families become `Ability` definitions (one per family, `targeting` +
`EffectStep`s matching today's arc/thrust/dual/bolt/orb/talisman shapes). `playerAttack`
resolves them through `AbilityRuntime`. Leech / thorns / crit / triggers / elemental
conversion all move onto the `CombatHost` + `EventBus` path so a swing and a spell share
one pipeline. Boss brain (`game/boss.ts`) stays as-is but deals through
`CombatHost.dealDamage` so hero resources still react.

### C5. Granted skills on existing gear
Epic+ items carry `grant: SkillId` (legacy id). Map the ~15 legacy skill ids to the
closest new generic ability where one exists, else drop the grant with a one-time
"this item's granted skill changed with the class update" note. Handled in Stage 7.

---

## 3. Staged implementation

Every stage ends with `npm run check` clean and the game launchable. `npm test` stays
green throughout (the roster/vocab/prog/classes suites already pass and must keep
passing; smoke migrates in Stage 8).

### Stage 1 — elements promotion (C2) — ✅ DONE (green: check/vocab/prog/classes/roster/smoke)
Landed: `ELEMENTS` → 9; `holy`→`sear`, `arcane`→`sunder`, `nature`→`venom` riders;
damage/resist `Mods` keys, materials, essences, prefixes/suffixes per new element;
`DamageType` collapsed to `Element`; new `LOOT_ELEMENTS` (original 5) gates random
generation so the new elements don't dilute itemization/difficulty yet; `SAVE_VERSION`
12→13. Original notes:

- `src/data/elements.ts`: `ELEMENTS` → `physical, fire, cold, lightning, poison, void,
  holy, arcane, nature`. Add `ELEMENT_COLORS`, `ELEMENT_PREFIX`, `MAGIC_ELEMENTS`
  entries. `STATUS_FOR_ELEMENT`: holy → `sear` (a new smite/mark-ish DoT) or reuse
  `burn`; arcane → `disrupt`/`shock`-like; nature → `poison`. Decide riders with the
  combat/status baseline in mind (register new statuses in `combat/status.ts` if a
  genuinely new rider is wanted).
- `src/data/mods.ts`: `ELEMENT_DAMAGE_KEY` / `ELEMENT_RESIST_KEY` + `MOD_KEYS` for the
  three new elements; `elementalFractions` picks them up for free.
- `src/data/materials.ts`: a material per new element (physical stays the neutral one).
- `src/data/crafting.ts`: essence options include the new elements.
- `src/data/rarity.ts` / affix pool: elemental affix rolls include the new elements.
- `src/ui/town.ts`: materials-bag display iterates `ELEMENTS`, so mostly free — check
  layout for 9 rows.
- `src/net/sync.ts`: index tables derive from `ELEMENTS`; verify nothing hard-codes 6.
- `combat/damage.ts`: `holy`/`arcane`/`nature` move from `EXTRA_DAMAGE_TYPES` into the
  main list aligned with `ELEMENTS`; keep `DAMAGE_TYPES` order == `ELEMENTS` order so the
  executor↔dungeon mapping is index-free.
- `SAVE_VERSION` 12 → 13. Old saves: `emptyMaterials()` merge covers the bag; resist
  mods default 0.
- Tests: `npm run check`; smoke's element loops still pass.

> **Revised stage list after the owner decisions** (the numbered sections below are the
> original draft; read them in this order and with these additions):
> 1. Elements promotion (above) — ✅
> 2. `Dungeon implements CombatHost` (below, "Stage 1") — ✅
> 3. Per-actor resources & status container (below, "Stage 3") — ✅ safe slice;
>    `sc`-authority + resource-generation wiring resequenced into Stage 6
> 4. **Minion subsystem** — ✅ DONE (green: full npm test). `Minion` + `Corpse` entities
>    in `entities.ts`; `data/minions.ts` caps/tuning; `FlowField.updateMulti` multi-source
>    BFS toward the enemies; `updateMinions` AI (target by command, route straight then
>    flow then sidestep, telegraphed hit through `damageEnemy(..,{source:owner})` so kill
>    credit flows to the owner); `updateCorpses` + corpse drop in `killEnemy`; boss
>    telegraph/ground AoE now also hits minions; `spawnMinion`/`commandSummons`/
>    `sacrificeSummons`/`consumeCorpses` real; `minionHost`/`actor`/`actors`/`summonsOf`/
>    `dealDamage` handle minions; `drawMinions`/`drawCorpses` (canvas primitives, no
>    sprites — no `npm run art`); `tools/smoke.ts` "minion subsystem" section.
>    **Deferred to Stage 9:** minion/corpse positions in the snapshot (host-authoritative,
>    nothing spawns a minion until Stage 6, co-op with minions can't happen before then).
>    **Noted for Stage 11 / raid:** enemies do not yet retarget onto minions in melee —
>    that is threat-system work, already on the raid-hazard list.
> 5. `Player` resolves a v2 build — ✅ DONE
> 6. Skill + ultimate execution onto `Ability` + interpret rules/grants + sc-authoritative
>    ailments + resource generation → EventBus — ✅ DONE. **Basic attacks stayed on the
>    legacy `attack()`/`playerHit` path** (crit/leech/triggers/elemental-split unchanged)
>    — routing them through the executor + weapon-family Abilities is **Stage 6b**, a
>    focused follow-up, since that path is where balance drift hides. Also deferred to 6b:
>    `redirectDamage` binding (Paladin Oath / Jugg Fortress — stub), benefit zones
>    (heal/shield/haste `spawnZone` support).
> 6b. Basic attacks → one pipeline with spells. **In progress.** Owner decision (asked
>    2026-09-07): **geometry-preserving hybrid** — the six/fourteen weapon families are
>    real `Ability` data (`src/data/weapon-abilities.ts`: tags per pattern, a
>    `DamageTemplate`, element, knockback), but `Dungeon.attack()` keeps `meleeTargets` /
>    the bolt / the talisman spark as the target-selection step (zero targeting drift —
>    reach-plus-radius, spear/whip pierce caps, dual's two offset sub-swings, the
>    circle-plus-spark all stay bespoke). Every landed hit resolves through the shared
>    `weaponStrike` choke point and the `dealDamage` + event-bus path a spell takes.
>    - **6b.1a — ✅ DONE (green: full `npm test` + roster, smoke byte-identical to
>      cb4170f).** `weapon-abilities.ts` added; `playerHit` → `weaponStrike(hero, e,
>      amount, angle, ability, knockOverride?)`, one choke point for every melee pattern
>      and the staff/bow bolt. Pure refactor: RNG order, once-per-swing leech + on-hit
>      trigger, and **tagless** once-per-swing resource credit all preserved exactly.
>    - **6b.1b — ✅ DONE (green: full `npm test` + roster; smoke campaign + boss
>      byte-identical to cb4170f).** `weaponStrike` now stamps the weapon family's
>      pattern tags (`melee` / `slash` / `thrust` / `heavy` / `projectile` / …) onto the
>      once-per-swing resource-credit packet's `source.tags`, so tag-gated generation
>      fires from basic attacks exactly as each spec intends.
>      - **Smoke delta: zero.** The live default class (Swordsman) and every class the
>        campaign / boss sections exercise charge via `crit` / `skillUse` / `damageTaken`
>        — none tag-gated — so the two 20-dive campaigns (13.8 / 9.4) and the raid-boss
>        bill (863 dmg / 54 s vs 1004 / 25 s) are unchanged to the digit.
>      - **What it actually fixes (isolated probe, depth-16 god-mode, basic attacks only,
>        seconds-of-fighting → meter):** *Monk* — Chi and Heavenly Fist were **dead**
>        (0 % at 60 s; the whole economy is `hitDealt·melee` + `dodge` / `skillUse`),
>        now fill to 100 % by ~15 s. *Berserker* — no observable change (Rage + meter
>        already reachable via `damageTaken·60 %`; the `hitDealt·heavy +1.5` term is
>        additive insurance). *Swordsman / Juggernaut / Duelist / Corsair* — unchanged in
>        the probe: Swordsman/Jugg gate on `crit` / non-basic tags, and the Duelist /
>        Corsair / Warden / Shaman / Reaper / Lancer tagged rules are **opt-in tree
>        nodes** whose stated purpose is "basic attacks feed this resource" — now live
>        when chosen, as designed.
>      - This is a dead-rule fix, not a rebalance. Monk's ~15 s (god-mode, constant
>        target stream) is a touch under the §4 20 s floor; real-play travel/spawn gaps
>        put it ~25–35 s. Flagged for the Stage 11 meter-fill-window axis — not tuned
>        reflexively.
>      - **Known gap (Stage 11):** the credit packet is `type: "physical"` regardless of
>        gear elemental conversion, so a lightning-converted staff bolt still does not
>        feed Stormcaller `hitDealt·lightning`. Per-element basic-attack credit is a
>        separate, larger question — noted, not in 6b.
>    - **6b.2 — ✅ DONE (green: full `npm test` + classes + roster, smoke byte-identical).**
>      `CombatHost.redirectDamage` is real: a `redirects` map (ward index → protector,
>      fraction ≤ 0.9, expiry), read at the top of `applyPlayerDamage` behind an
>      `inRedirect` re-entrancy guard; the protector takes the slice through their own
>      mitigation + ward. Solo it is a no-op (no ally to bind). `spawnZone` now honours
>      `benefit` (heal → `maxHealth * 0.02`/tick, shield → refresh ward to
>      `maxHealth * 0.12`, haste → a new baseline `hasted` buff status), `follows` (the
>      zone rides its owner), and `status` (re-applied to enemies each tick). Benefit
>      zones never damage. `tools/classes.ts` already had the acceptance tests for both
>      and they pass. Raid-scale redirect/zone-merge caps stay on the §4 hazard list.
>    - **6b.3 — TODO (optional):** move gear triggers + leech off the inline
>      `fireTriggers`/`p.heal` calls onto bus listeners so a skill hit fires `onHit` gear
>      triggers too (another measured change).
> 7. Town: class select, Path, Tree (v2 editable, hybrid/archetype badges), Skills —
>    ✅ DONE, including the two follow-ups: allocating a node that crosses a path-pair
>    threshold now fires a louder `announce()` toast ("Hybrid unlocked — …" / "Mythic
>    Archetype — …"), and `TownUI.show()` surfaces `GameState.treePointsRefunded` once on
>    the first town visit after a pre-v14 save loads, then clears the flag and saves.
> 8. Save migration `SAVE_VERSION` 13 → 14 — ✅ DONE (per-class allocated + skills reset,
>    account-wide + level/xp/gear/depth kept, legacy `item.grant` dropped).
> 9. `net/sync.ts` lightweight pass — ✅ DONE per C3 (dead `ul`/`ut`/`bt` fields kept for
>    wire compat; enemy status bitmask ↔ `sc`). Minion/corpse snapshot still deferred.
> 10. Tests — ✅ `npm test` GREEN (check + vocab + prog + classes + roster + smoke).
>     `tools/smoke.ts` bot + `probeUltimate` rewritten shape-agnostic; planet + boss
>     probes re-geared (CLAUDE.md sanctions this for planets). `src/data/combat-tuning.ts`
>     — new global `SKILL_POWER` (1.22) / `ULTIMATE_POWER` (1.15) dials.
> 11. Validation & tuning pass (§4) — **IN PROGRESS.**
>     - **Per-class ultimate sanity — first pass done.** Found and fixed a cluster of
>       executor / ability-data bugs where an ultimate (or skill) resolved to no victims:
>       - `selectActorIds` treated `to: "enemies"` as an alias for `to: "allTargets"`
>         (the pre-resolved aim list), which for a self-targeted ability is just the
>         caster — so a self-cast shout / delayed ultimate / reactive with `to: "enemies"`
>         hit nobody, or dealt its damage to the caster. `"enemies"` now scans hostiles
>         around the caster, `shape.radius`-bounded when present, field-wide otherwise.
>         **This was the Reaper `death_comes_due` 0-damage bug** (0 → ~7500 probe); also
>         silently fixed Magician Astral Collapse, Ranger's Last Hunt, Warlock Damnation.
>       - Monk Heavenly Fist / Corsair Broadside / Lancer Vaulting Spear / Ranger Pinning
>         Shot used a point/direction targeting mode with `to: "allTargets"` (an empty
>         list) — retargeted onto the shape / projectile. Monk 0→~140, Corsair 0→~1200.
>       - Necromancer Kingdom of Bones raised 0 on a fresh floor (`fromCorpses: "all"`
>         == corpse count); `"all"` now still raises at least `count`.
>       - The **Warlock probe fragility** was the probe, not the class: `probeUltimate`
>         discarded the cast tick's own damage events, so an all-instant ultimate
>         (Damnation) measured 0. Fixed in `tools/smoke.ts`.
>       - Still low direct damage in the probe (by design — §31 support/reactive):
>         Juggernaut Citadel, Paladin Last Light, Bard Grand Performance (support),
>         Duelist Perfect Riposte (reactive — needs to be hit to pay out). Not bugs.
>     - **AoE-at-cursor** (separate ask): ground-placed abilities landed at a fixed reach
>       along the facing, not the mouse. `castInputFor` now uses the cursor world point
>       (clamped to the ability's range) via a new optional `AvatarInput.aimPoint`.
>     - **Measurement harness — `tools/arena.ts` (`npm run arena`), committed.** Neutral
>       pinned dummies around a god-mode hero; measures sustained ST / 3s burst / AoE
>       (total + per-target) dps, ultimate meter-fill time, primary-resource low-water,
>       plus a static effect-step census (heal/shield/mitigation/mobility/control/
>       support/summon/execution). First run (level 18, depth-8 dummies):
>       - **ST dps span** ~230 (juggernaut) … ~2200 (magician), with **engineer a hard
>         outlier: 7.3k ST / 100k AoE (16.7k per-target)** — turret/summon stacking with
>         perfect uptime on a stationary target. Flag for the summon-cap / raid work.
>       - Burst leaders: warlock/magician ~7.1–7.3k in 3s. Monk's burst (2.6k) is *below*
>         its sustained — it ramps, as intended.
>
>     - **HEADLINE FINDING — skill projectiles and zones are severed from the resource
>       economy.** Isolated probe (`scratchpad/credit.ts`, 4 s of skills only, no basic
>       attacks): Stormcaller deals 1775 skill damage and gains **0** Storm Charge / **0**
>       Tempest; Magician spends 74 Mana and gains **0** Overcharge / **0** Astral;
>       Swordsman (melee `damage` steps) correctly gains 52 Technique / 31 Eclipse.
>       - `runEffect`'s **`damage` step** → `host.dealDamage(packet)` → `creditResourcesForHit`
>         with `packet.source.tags = ability.tags`. Credited. ✅
>       - `runEffect`'s **`projectile` / `zone` steps** → `host.spawnProjectile` /
>         `spawnZone`, which store only `{amount, type}` — no `source`, no `tags`, no
>         packet. Their eventual hits run through `Dungeon.damageEnemy`, which **never
>         calls `creditResourcesForHit`**. Zero primary-resource and zero ultimate-meter
>         generation from any damage that arrives as a projectile or a zone tick.
>       - Consequently the ultimate meter never fills in 120 s of a fair fight for:
>         **magician, shaman, stormcaller, assassin, reaper** (projectile/zone kits), and
>         **duelist / juggernaut** (see next). lancer is also move-gated (`on: "move"`)
>         and a stationary probe won't charge it — expected, not a bug.
>       - **Two smaller wiring gaps in the same area:**
>         - `manaSpent` resource event is **never broadcast** — the runtime emits
>           `resourceSpent` (flat `amount`) on cost payment. Magician's meter *and*
>           primary use `{ on: "manaSpent", perUnit: "manaFraction" }`, which reads
>           `evt.manaSpent`/`evt.maxMana` — both undefined on a `resourceSpent` event.
>           Dead.
>         - `dodge`, `block`, `statusApplied` resource events are **never broadcast**
>           anywhere. Kills Duelist's whole meter (`dodge`/`block`), Juggernaut's `block`
>           nodes, Shaman's `{ on: "statusApplied" }` meter rule, and assorted path nodes.
>           (`hitTaken`/`damageTaken`/`damagePrevented` *are* broadcast, so Juggernaut's
>           meter is only half-dead.)
>       - **Classes whose meter DOES fill** (berserker, swordsman, ranger, warlock, monk,
>         necromancer, trickster, paladin, bard, alchemist, engineer, warden, corsair)
>         either use `damage` steps, or charge on `skillUse` / `crit` / `kill` /
>         `damageTaken` / `dashStart` / `move` — none of which touch the broken path.
>       - **FIXED** (commit "Stage 11: skill projectiles and zones feed the caster's
>         resources"). `ProjectileRequest.damage` / `ZoneRequest.damage` are already
>         `DamagePacket`s; the dungeon now keeps the packet on a hero-owned projectile /
>         ground zone, and `Dungeon.creditIndirectHit` feeds each projectile hit and zone
>         tick back through `creditResourcesForHit` (THE ULTIMATE RULE rides the packet's
>         own `source.fromUltimate`). `manaSpent` is now broadcast with the fraction
>         fields on mana payment. Zone `status` re-application is attributed to the owner.
>         After: Stormcaller 0→55 Storm Charge / 31 Tempest in 4s; Magician 0→66
>         Overcharge / 44 Astral; arena meter-fill magician 17s / stormcaller 19s / ranger
>         6s (all previously "never"). Smoke campaign + raid boss **byte-identical** (the
>         bot plays Swordsman — melee `damage` steps — which never used the broken path),
>         full `npm test` green.
>       - **Still dead after the wiring fix — resolutions recorded in the entries below
>         this list (`dodge`/`block` → evasion layer; `statusApplied` → broadcast added):**
>         - `dodge` / `block` events have no site to fire from — there is no evasion or
>           parry mechanic in the hero damage path, only the ward absorb (which already
>           fires `damagePrevented`). Duelist's entire meter (`dodge`+`block`) and
>           Juggernaut's `block` nodes are stranded until such a mechanic exists.
>         - `statusApplied` is never broadcast anywhere — Shaman's `{ on: "statusApplied" }`
>           meter rule and Assassin's `Inside Job` node. Needs a broadcast at each
>           hero-sourced `sc.apply` site.
>         - Reaper (`kill`/`hitDealt` `requireTags: ["execute"]`) and Assassin
>           (`hitDealt` `["mark"]`, `ailmentInflicted` `["poison"]`) still read 0 in the
>           arena — the probe's targets are full-health and unmarked, so this may be
>           working as designed (you charge by executing / by marking). Confirm against
>           the class fantasy before touching.
>         - Lancer reads 0 because the arena hero only strafes a 40px orbit; `on: "move"`
>           wants real traversal. Harness limitation, not a bug.
>
>     - **`dodge` / `block` — RESOLVED (owner picked option a).** A real evasion/block
>       layer: two `Mods` keys (`evasion`, `blockChance`), rolled in `Dungeon.hurtPlayer`
>       on a separate `defenseRng` (seeded off the floor seed) so a class with no evasion
>       never draws from it and the main RNG stream stays byte-identical — smoke campaign
>       13.8/9.4 and boss 863·54s/1004·25s unchanged. Evasion → 0 damage + `dodge`;
>       block → half damage + `block`. Never on `hurtPlayerMechanic` (a telegraph is meant
>       to land) or `hurtPlayerRaw` (no dodging a burn). Class-intrinsic amounts only for
>       the identity classes: duelist ev.10/bl.06, trickster ev.12, monk ev.05/bl.04,
>       juggernaut bl.14, paladin bl.08, assassin ev.06. Caps `EVASION_CAP` 0.4 /
>       `BLOCK_CHANCE_CAP` 0.5, block lands at `BLOCK_MITIGATION` 0.5, all in
>       `combat-tuning.ts`. Gear affixes for evasion/block are a deliberate later
>       itemization pass. Probe: Juggernaut Fortify + Paladin Conviction now fill from
>       real hits (~25s / ~21s in the arena fair fight); Duelist's dodge/block meter
>       charges but the *rate* wants a better incoming-hit harness to tune — flagged.
>
>     - **`statusApplied` — FIXED.** `runEffect`'s `status` step applied the status but
>       never told the caster's resources. Now a hero-side caster landing a `status` step
>       on a hostile actor broadcasts `{ type: "statusApplied", tags, fromUltimate? }`.
>       Elemental ailments keep their own `ailmentInflicted` event and never route through
>       the step, so no double-count. Shaman Hex of Withering now adds +2 Spirit World per
>       cast; Assassin's Contract feeds Inside Job once the node is allocated.
>
>     - **Two ultimate-meter generation loops found and cut** (both `{ on: "damageDealt",
>       perUnit: "damage" }`, untagged, huge coefficient — after the projectile/zone-credit
>       fix every construct/zone tick credits the owner's `damageDealt`):
>       - **Engineer** `0.2/damage` → the 100-point Siege Engine meter filled in <1s from
>         8 turrets + stacked zones; the ultimate (siege minion + follow-zone) fired every
>         ~1.4s, each cast stacking another long-lived zone that fed the meter — a closed
>         loop. The "7.3k ST / 100k AoE" arena outlier was almost entirely stacked
>         ultimate zones. **Fixed:** tag-gated `requireTags: ["construct"]` + `0.2 → 0.03`.
>         Turret auto-attacks carry no ability tags so they no longer feed it; a
>         construct's own shells/zone ticks still do, slowly. Arena after: 395 ST / 1384
>         AoE — the loop is gone (that is now *low*; exact rate wants a real-play pass).
>       - **Warlock** `0.3/damage` → Damnation up on cooldown (arena "meter full 0.0s";
>         ~half its measured sustained ST was the ultimate firing repeatedly). THE
>         ULTIMATE RULE blocks a true self-loop but the rate was far under the 20s floor.
>         **Fixed:** `0.3 → 0.03`; `ailmentInflicted +3` stays the primary driver.
>       - Audited the rest of the roster (`grep "perUnit: \"damage\""`): only these two.
>         The `damageTaken · maxHealthFraction` tank-charge rules (Berserker, Juggernaut,
>         Paladin, Warlock Soul Debt, Magician tree) are bounded by "you only have so much
>         health to lose" and are the intended pattern — left alone.
>
>     - **12-axis read (`npm run arena`, level 18, geared; + static kit census).** The
>       arena measures output and incoming-damage tolerance well; it systematically
>       *over-fills* every meter because the driver cast-spams with infinite resources and
>       never travels, kites or dies, so the meter-fill column is a floor, not a real
>       cadence. Do **not** flatten these — a support/mechanic class deals less by design
>       (spec §31).
>
>       | class | ST dps | burst3 | AoE dps | per-tgt | census (heal/shld/mit/mob/ctrl/sup/sum/exec) | notes |
>       |---|--:|--:|--:|--:|---|---|
>       | juggernaut | 229 | 1413 | 1559 | 260 | 0/4/4/1/0/3/0/0 | tank — lowest damage by design; shield+mitigation kit |
>       | paladin | 390 | 1485 | 1478 | 246 | 4/3/1/1/0/5/0/0 | support/guardian — low damage by design |
>       | corsair | 458 | 1775 | 455 | 76 | 0/0/0/2/1/2/1/0 | **flag: lowest AoE + low ST, skirmisher archetype — not an obvious low-damage role** |
>       | shaman | 596 | 1789 | 1386 | 231 | 1/0/0/0/0/1/4/0 | ailment/totem — damage is the DoTs + totems, arena under-reads it |
>       | swordsman | 662 | 2527 | 2273 | 379 | 0/1/0/2/1/3/0/2 | baseline bruiser |
>       | berserker | 661 | 2656 | 5436 | 906 | 0/1/1/0/1/6/0/1 | strong AoE (Whirlwind), by design |
>       | lancer | 602 | 2007 | 697 | 116 | 0/1/0/6/2/2/0/0 | most mobile kit (mob 6); single-lane damage |
>       | bard | 758 | 2362 | 3004 | 501 | 2/0/0/0/1/9/0/0 | support (sup 9) — deals more than expected, fine |
>       | monk | 758 | 2564 | 3275 | 546 | 2/0/0/3/0/8/0/0 | ramps — burst < sustained, intended |
>       | alchemist | 769 | 2570 | 2598 | 433 | 2/1/0/0/1/3/0/0 | zone-layering generalist |
>       | ranger | 966 | 1686 | 4667 | 778 | 0/0/0/1/2/2/1/0 | AoE >> burst — Arrow Storm; kiter |
>       | stormcaller | 991 | 2876 | 4676 | 779 | 0/1/0/1/2/0/0/0 | mobile caster, good AoE |
>       | trickster | 1219 | 3069 | 1532 | 255 | 0/0/0/7/0/3/5/1 | mob 7 + sum 5 (decoys) — evasion/chaos |
>       | warden | 1338 | 4766 | 2873 | 479 | 1/0/1/1/0/2/1/0 | bruiser/terrain — healthy numbers |
>       | assassin | 1433 | 3951 | 2016 | 336 | 0/0/1/3/0/3/0/3 | exec 3 — priority-target killer, high ST |
>       | reaper | 1499 | 3662 | 5814 | 969 | 1/1/0/3/2/0/1/3 | widest AoE + execution — on identity |
>       | necromancer | 571 | 1668 | 2467 | 411 | 3/0/1/1/0/0/5/0 | **flag: weak late scaling (see curve) — summon inheritance doesn't keep up with gear** |
>       | warlock | 1165 | 4719 | 2169 | 362 | 1/0/0/0/2/1/0/0 | glass caster (post loop-fix) |
>       | magician | 2463 | 7137 | 4390 | 732 | 1/0/0/1/2/2/1/1 | top DPS glass cannon, by design |
>       | engineer | 395 | 1330 | 1384 | 231 | 0/2/0/0/0/0/5/0 | post loop-fix — now low; wants a real-play meter-rate + turret-power pass |
>
>       - **ST span (non-caster):** ~230 (juggernaut) … ~1500 (reaper). Casters
>         2200–2500. That is a healthy ~6× spread with the tanks/supports at the bottom
>         *on purpose*.
>       - **Census gaps worth a look:** nobody has a `heal` + `mit` + `shield` all-zero
>         *and* bottom-quartile damage (that would be a class with no answer to anything).
>         Corsair is closest (0/0/0/2/1/2/1/0, 458 ST) — its identity is reach + mobility,
>         but the numbers don't yet say "skirmisher", they say "underpowered". Flagged.
>
>     - **Early vs late curve (`scratchpad/curve.ts`: ST arena at L3/keys2 vs L50/keys40).**
>       L3 dps span 141–849, L50 span 973–5114 — the spread stays ~5–6× at both ends and
>       **no class inverts or falls off a cliff.** Scaling ratio (L50/L3) is 3.0–7.6×;
>       **necromancer is the low outlier at 3.0×** (and 2nd-lowest L50 at 1196) — minion
>       damage inherits a *fraction* of the owner and doesn't ride the gear curve the way a
>       direct hit does. The opposite failure mode from Engineer's (summons too weak late
>       vs summons+zones too strong). Both point at the same lever: summon power scaling.
>       Nobody is unplayable at L3.
>
>     - **Still TODO (needs dedicated tooling, not arena-only):**
>       - **Build differentiation** — 3 allocations/class through the smoke bot, must play
>         differently (spec §35). Needs a smoke-bot mode that allocates a named path and
>         reports a behaviour fingerprint (skill mix, positioning, meter cadence).
>       - **Hybrid / keystone / Mythic detectable-impact sweep** — each must change a
>         number or a behaviour the bot can see; archetypes must change an ability's
>         effect list. `npm run roster` already gates thresholds/ids; this is the
>         *does-it-do-anything* pass.
>       - **Raid-scale (10–20)** — redirect/taunt stacking cap + cycle guard; party-wide
>         `guardsDeath` diminishing returns / single-source rule; summon caps are in
>         (`MINION_CAP_PER_OWNER` 8, `MINION_CAP_GLOBAL` 28) but the raid layer wants its
>         own lower per-owner number; zone-merge total-radius cap; a real threat system
>         (`setThreat` is only an aggro override today); resource-share hybrids (Bard
>         Rallying Chorus, Warlock Soul Gate) checked for generation loops — the two
>         `damageDealt` loops above are the pattern to watch for.
>       - **Necromancer / Engineer summon power scaling** — the two ends of the same lever.
>       - **Corsair** — bottom-quartile ST *and* AoE without a defensive/support identity
>         to justify it; wants a numbers pass or a clearer role.
>       - **Planet-floor pacing** — bigger floors, longer exposure; the smoke test already
>         needs more generous gearing to clear a planet than an equal-depth delve. Wants a
>         density/curve pass with real playtesting.

### Stage 1 — `Dungeon` implements `CombatHost` — ✅ DONE (green: full npm test)
Landed additively (commit "Dungeon implements CombatHost; attach combat primitives to
entities"): `Hero`/`Enemy` get a `StatusContainer` (`sc`), `Hero` gets a `ResourceSet`
+ `AbilityRuntime`, all ticked in the loop; host-id space + lazy `HostActor` adapters;
the ~30 executor methods mapped (minion/terrain/corpse/redirect/threat are minimal
stubs pending Stage 4); a typed `EventBus` on the Dungeon. Nothing casts through the
executor yet. Original notes:
- Implement the ~30 `CombatHost` methods against the existing entity arrays:
  `dealDamage` → `damageEnemy` / hero mitigation; `spawnProjectile` → `this.projectiles`;
  `spawnZone` → `this.ground` (+ a benefit variant); `moveActor` → dash/blink/charge on
  `Avatar`; `spawnTerrain` → a new short-lived wall body; `applyImpulse` → knockback;
  `interruptCasts` → boss/enemy windup cancel; `setThreat` → enemy aggro override.
- `spawnMinion` per C1 decision.
- `HostActor` adapters for `Hero` and `Enemy` (wrap `statuses`, `resources`, position).
- Wire the `EventBus` to the existing `fireTriggers` so item triggers still fire.
- Tests: a `tools/` harness that casts one Lancer ability through `DungeonHost` headless.

### Stage 3 — per-actor resources & status container — ✅ DONE (green: full npm test)
Landed the safe slice (commit "Stage 3: ultimate meter is a resource pool; legacy
ailments on the unified registry"):
- `Hero.specialCharge` (0..1) is now a getter/setter over the class's `isUltimateMeter`
  `ResourcePool` (`ResourceSet.ultimateMeter()`), with a `_specialCharge` fallback for a
  hero with no resolved pilot class. Legacy `ChargeRules` / `gainCharge` still drive it
  through the setter; the meter pool's own `generation` rules are dormant (nothing calls
  `resources.broadcast()` yet), so there is zero charge-rate change. The meter is now one
  object both the eventual executor path and the legacy path move.
- `src/combat/legacy-ailments.ts` registers `burn/chill/shock/venom/drain/sear/sunder`
  on the `combat/status.ts` registry with the exact `src/data/elements.ts` numbers, so
  `sc.apply("burn", …)` == `applyStatus(list, "burn", …)`. Imported for its side effect
  by `dungeon.ts`. Additive — no reader yet.

**Resequenced (rationale):** swapping `sc` to be *authoritative* for ailments — moving
`applyStatus`/`tickStatuses`/`slowFrom`/`amplifyFrom`/`manaBurnFrom` and the HUD/draw/
sync readers onto `sc`, deleting `StatusInstance[]` — and wiring resource `generation`
to the `EventBus` both change the DoT damage path (mitigation / amplify / on-tick events
/ charge gain) in ways that must be reasoned about together with the ability executor to
avoid a Stage-1-style seeded-RNG / balance drift. Both move into **Stage 6**, where that
path is being rebuilt anyway. `patchResourceSpec` folding `resourcePatches` moves to
**Stage 5** (build resolve). Original Stage 3 intent below:
- `Hero.statuses` becomes a `combat/status.ts` `StatusContainer` (bridge `game/combat.ts`
  writers so legacy weapon ailments still land — one model, two writers).
- `Enemy` likewise; `game/combat.ts` `tickStatuses` delegates.
- Resource pools tick in the fixed-step loop; generation rules subscribe to the bus.
- Tests: Rage fills on hit, Momentum bleeds out of combat, Conviction on prevented
  damage — in a real `Dungeon`, not the `tools/classes.ts` `World`.

### Stage 3 — `Player` resolves a v2 build
- `Player` gains `pilotClass` (from `CLASS_BY_ID`), `build: ResolvedBuild` (cached,
  recomputed on `refresh()`), and folds `build.mods` in place of `treeMods(...)`.
- `Player.allocated` now indexes v2 node ids (`class.path.row` — same scheme, different
  data). `normalizeTree` → `pruneAllocationV2`.
- `Player.skills` / `activeSkills` / `unlocked` read the pilot class's 9 normal abilities
  (unlock by level via a per-class order); ultimate is fixed.
- Keep `data/classes.ts` + `data/tree.ts` compiling (Codex etc. may still reference) but
  nothing in `game/` reads them after this stage.

### Stage 4 — skill & ultimate execution
- `castSkill(hero, slot)` → resolve `ability = applyBuild(hero.player.build, base)`,
  then `hero.abilityRuntime.castAbility(this.host, hero.index, ability, castInput)`.
  `castInput` carries `attackDamage`, `spellDamage`, `critChance`, `ailmentPotency`,
  `cooldownMult`, `aim`, `positionHistory`.
- `useUltimate(hero)` → same path with the ultimate ability; the meter pool is the cost.
- `Dungeon.tick` also ticks each hero's `AbilityRuntime` (cooldowns, pending
  delay/reactive/followUp) and drains `rt.pending`.
- **Interpret `ResolvedBuild.rules`** (C: not just collect): a small registry in the
  dungeon/host keyed by rule string — e.g. `lancer:living-projectile` makes the next
  charge invulnerable+piercing; `berserker:blood-god` etc. Each rule is one guarded
  branch, data-selected, never `if (classId === …)`.
- **Fire `ResolvedBuild.grants`**: subscribe each `GrantedEffect` to the bus (by tag or
  event) at build-resolve time; `runEffect` its steps when it fires.
- FX: `host.emitFx` + the executor's implicit events (swing/nova/trail) push the existing
  `RunEvent`s so the renderer and `render/fx.ts` keep working; add ref→fx mappings for
  the new ability FX profiles as needed. `npm run art` only if a grid is touched (it
  should not be).

### Stage 5 — town: class select, Path, Tree, Skills
- Path tab → `ALL_CLASSES` (21), grouped/scrollable; `chooseClass` accepts the new ids.
- Tree tab → editable v2 tree: 5 paths × 5 rows, node category shown
  (foundation/behavior/resource/mutation/keystone), hybrid & archetype badges when a
  path-pair threshold is met, and the **"you unlocked X"** moment on allocation. Respec
  stays free (`Player.respec` clears the list).
- Skills tab → pick 3 of the class's 9 unlocked abilities; 4th slot still gear-granted.
- Codex tab: keep, or fold into the now-live Tree/Path views. Recommend keep as the
  read-only matrix overview.

### Stage 6 — save migration (`SAVE_VERSION` 12 → 13)
- Keep per-class `level / xp / deepestDepth / gear`, account `stash / coins / materials /
  cosmetics / stats / settings`.
- **Reset every `allocated`** (v1 node ids are meaningless in v2); surface
  "N tree points refunded — your build was reset by the class update" once per class with
  spent points, on the Tree tab or a town toast.
- Map legacy `classId`s: all 15 survive by name (`lancer`…`stormcaller`). Confirm which
  2 ids need dropping (Oracle / Chronomancer per progression-architecture.md — verify
  none exist in a real save; if they do, fold that character's account-wide contribution
  and drop the sheet).
- Legacy `player.skills` (legacy `SkillId`s) → drop; auto-slot the new class's first 3
  unlocked abilities. Legacy `item.grant` per C5.
- `core/save.ts` gets a v13 paragraph.

### Stage 7 — `net/sync.ts`
- Per C3 Option B: `HeroSnap` gains `res` (own resource values, small array), keeps `ch`
  as `ultimate` pool ratio, `cd` widens to the new per-ability cooldown set the HUD
  shows, add a `mn` minion array to `Snapshot` (id, x, y, kind) if C1 ≠ Option C.
- `configFromWire` unchanged (delve only for MP).
- The host/client run loop in `net/party.ts`: client `resolveBuild` from its own save is
  already deterministic (`tools/classes.ts` asserts it) — nothing to add there.
- Retest with the two-bot + real-host/real-client path in `tools/smoke.ts`.

### Stage 8 — tests
- `tools/smoke.ts`: the bot must cast the new abilities (read `ability.targeting` /
  `range` / `costs` instead of `skill.shape`), fire the new ultimate path, and the
  per-class ultimate probe (`probeUltimate`) must drive `castAbility`. Keep the two
  20-dive campaigns, the raid probe, the Hoard Rift, the planet floor, the co-op floor.
- `tools/classes.ts`: switch the six pilots from the `World` stub to `DungeonHost` where
  practical, or keep `World` for unit-level and add a dungeon-level pass.
- `npm test` = check + vocab + prog + classes + roster + smoke, all green.

### Stage 9 — validation & tuning pass (task 2)
See §4.

---

## 4. Validation pass (task 2)

Once live, per class, measure and record (a table in this doc):

- **Identity** — does it answer its §2.2 question in actual play?
- **Skill uniqueness** — `validateRoster` already gates ids/names; also check no two
  classes' kits *play* the same after mutation.
- **Resource loop** — can the class keep its resource fed at its intended cadence, and
  does starving it actually change how it plays?
- **Rotation** — is there a real sequence, or is it one button?
- **Build differentiation** — two allocations of the same class must play differently
  (spec §35). Sample 3 builds/class through the smoke bot.
- **Hybrid usefulness / Keystone impact / Mythic impact** — each must change a number
  *or* a behaviour the bot can detect; archetypes must change an ability's effect list.
- **Ultimate generation** — meter fills in a target window (not <20 s, not >90 s of
  fighting) and THE ULTIMATE RULE holds.
- **Early vs late power curve** — level 1–10 and level 40–60 sample dives; nobody is
  unplayable early or trivialising late.

Evaluate (do **not** flatten to equal DPS): sustained ST, burst, AoE, effective HP,
healing, mitigation, mobility, control, support, utility, execution, summon contribution.
A support/mechanic class deals less and that is fine (spec §31).

**Before any balance edit**: write the imbalance, the measured evidence, and why the
proposed data change fixes it. Numbers live in `src/progression/<class>.ts`,
`src/data/`, `src/combat/` — never in the sim.

### Raid-scale (10–20 player) hazards to flag now
- **Redirect / taunt stacking** — Paladin Guardian's Oath, Juggernaut Fortress Call,
  Bard, Warden. `CombatHost.redirectDamage` currently binds one protector per ward;
  20 Paladins on one tank, or a redirect cycle (A→B→A), needs a cap + cycle guard.
- **Party-wide `guardsDeath`** — Paladin Last Light, Berserker Last Stand fanned by an
  archetype. 4 Last Lights = permanent raid immortality; needs a per-target single-source
  rule or diminishing returns.
- **Summon caps** — global vs per-owner; a 20-Necromancer raid at 8 skeletons each is
  160 pathing entities. Hard global cap + owner fairness.
- **Zone-merge blowups** — `mergeable` zones (spec's ignition example) across 20 casters
  could merge into one arena-sized zone. Cap merge count / total radius.
- **Threat math** — there is no real threat system yet (`setThreat` is an aggro
  override). A raid needs one; scope it explicitly before Juggernaut/Paladin tank
  identity depends on it.
- **Resource-share hybrids** — any hybrid that moves resource between players (Bard
  Rallying Chorus, Warlock Soul Gate) must not create a generation loop.

---

## 5. Risks / open questions for the owner

1. **C1 minions** — A (full), B (adapter, recommended), or C (defer summoners)?
2. **C3 wire** — bump protocol, or MP-delve-only host-authoritative (recommended)?
3. **C4 cut depth** — skills+ultimates only (recommended), or also basic attacks?
4. **Big-bang vs flag** — land all 21 on the new engine at once behind Stage 6, or land
   a `useNewCombat` per-class adapter so legacy and new classes run side by side during
   migration? (Recommended: all-at-once at Stage 6; the adapter doubles the surface.)
5. **`data/classes.ts` + `data/tree.ts` + `data/skills.ts` + `data/ultimates.ts`** —
   delete after cutover, or keep as dead code for one release? (Recommend delete once
   Codex is repointed; less to confuse the next reader.)
