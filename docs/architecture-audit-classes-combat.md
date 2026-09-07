# Architecture Audit — Class, Skill, Combat, Resource & Progression Systems

Pre-implementation audit for the 21-class refactor described in `classes_refactor.md`,
read alongside the pacing/endgame goals in `UAT_Notes_Post_Playtest_Update_Specification.md`.

**Canonical roster (21, fixed):** Lancer, Berserker, Swordsman, Magician, Shaman, Ranger,
Juggernaut, Duelist, Warlock, Monk, Necromancer, Corsair, Trickster, Reaper, Stormcaller,
Paladin, Bard, Alchemist, Engineer, Assassin, Warden. Oracle and Chronomancer are **removed** —
not implemented, not "planned", no replacements.

This document is analysis and a plan. **No implementation has been done** beyond committing the
existing tree to `master` and branching `refactor/classes-combat-progression`.

---

## Current Architecture

### 1. Where class identity lives

`src/data/classes.ts`. `CLASS_IDS` is a 15-entry `as const` tuple; `ClassId` is its union.
`CLASSES: Record<ClassId, HeroClass>` holds everything. A `HeroClass` is:

- `base: Partial<Mods>` + `growth: Partial<Mods>` — a stat block and per-level deltas.
- `affinity: WeaponFamily[]` + `affinityBonus: number` — which weapons hit harder.
- `skills: SkillId[]` — the pool this class can learn from (levelling reveals them in order).
- `ultimate: UltimateId` — one id.
- `charge: ChargeRules` — five scalars (`perKill`, `perHealthLost`, `perManaSpent`, `perCrit`,
  `perAilment`) measuring how the ultimate meter fills.
- `element: Element` — a fallback tint only.

That is the entire class model. A class is a stat block + a weapon list + a skill-id list +
one ultimate id + a charge formula. It carries **no behavior** — no code, no unique mechanic,
no resource beyond mana, no play-pattern. Classes overlap heavily by construction (see below).

### 2. Where skills live

`src/data/skills.ts`. `SKILL_IDS` is a 23-entry `as const` tuple. `SKILLS: Record<SkillId, Skill>`.
A `Skill` is a flat parameter bag: `shape` (one of 8: `bolt | nova | cone | chain | ward |
slam | buff | totem`), `element`, `manaCost`, `cooldown`, `unlockLevel`, `damage` (multiple of
`spellDamage`), `ailment` (chance), `radius`, `count`, `speed`, `pierce`, `duration`, `offset`,
`buffAttackSpeed`, `buffLifeOnHit`.

### 3. Are skills data-driven?

**Half.** The *parameters* are data. The *execution* is a hard-coded `switch (skill.shape)` in
`Dungeon.castSkill` (`src/game/dungeon.ts` ~L1799). Each of the 8 shapes is a bespoke code block.
A skill cannot do anything the 8 shapes don't already do. There is no composition — a skill is
exactly one shape, cannot chain a movement into a nova, cannot summon, cannot heal an ally,
cannot create terrain, cannot apply a non-elemental status.

Skills are **not** owned by a class in code (deliberately, to avoid an import cycle). Ownership
is expressed only by `HeroClass.skills` listing ids. This is why the same skill id appears in
many classes' pools.

### 4. How a skill executes

`castSkill(hero, slot)`:
1. Reads `hero.player.activeSkills[slot]` (3 chosen + 1 possibly gear-granted).
2. Checks `hero.skillCooldowns[slot]` and `player.mana >= manaCost`.
3. `player.spendMana(cost)`, then `gainCharge(hero, perManaSpent * cost/maxMana)`.
4. Sets `hero.skillCooldowns[slot] = cooldown * player.cooldownMult`.
5. `power = player.spellDamage * skill.damage`.
6. `switch (skill.shape)` → spawns projectiles / calls `novaAt` / `chainFrom` / `leapTo` /
   sets `hero.ward` / sets `avatar.buff*` / calls `plantTotem`.

Damage lands via `damageEnemy` (for AoE) or a `Projectile` that resolves through `playerHit`-like
paths. Cast is instantaneous — there is **no cast time, no recovery, no channel**. Cooldowns are
per-slot, not per-skill-id.

### 5. How damage is calculated

`src/game/player.ts` derives the numbers; `src/game/dungeon.ts` applies them.

- `player.damage` = `attack * (1 + power*0.006)`.
- `player.attackDamage` = `damage * weapon.damage * affinityMult * (1 + melee|projectileDamage)`.
- `player.spellDamage` = `(damage*0.85 + power*2.4) * (1 + skillDamage)`.
- A landed basic attack (`Dungeon.playerHit`): roll crit (`rng.chance(critChance)`),
  `rolled = amount * (crit ? critMultiplier : 1) * rng.range(0.92,1.08)`, then
  `damageEnemy(e, rolled, "physical")`, then **a separate `damageEnemy` call per element** in
  `player.elementalDamage` (each a fraction of `rolled`).
- `damageEnemy` (`~L1964`): `amplified = amount * amplifyFrom(statuses)` (shock);
  `mitigated = mitigateWithResists(amplified, element, e.resists)`; `dealt = round(max(1, …))`.

There is no damage-packet object. Damage is a bare `number` plus an `element` string plus an
options bag (`{crit?, ailment?, knock?, raw?, source?}`). There are **no damage channels** —
"DoT damage", "hit damage", "minion damage", "ultimate damage", "reflected damage" are
indistinguishable once they reach `damageEnemy`. Modifiers cannot target a channel.

### 6. How elemental types are represented

`src/data/elements.ts`. `ELEMENTS = ["physical","fire","cold","lightning","poison","void"]`
`as const`; `Element` is the union. Six only. `Mods` has a `<element>Damage` and `<element>Resist`
key per non-physical element (`DAMAGE_MOD_KEYS`, `RESIST_MOD_KEYS`). `ELEMENT_DAMAGE_KEY` /
`ELEMENT_RESIST_KEY` map element → mod key so loops stay data-driven.

No Holy, Arcane, or Nature (the spec asks for all three). Element is stored as a string on
projectiles, telegraphs, ground zones, totems, enemies, and swing events.

### 7. How DoTs are represented

`src/game/combat.ts` + `src/data/elements.ts`. **One unified system**, which is good.

`STATUSES: Record<StatusKind, StatusSpec>` where `StatusKind = "burn"|"chill"|"shock"|"venom"|
"drain"` — exactly five, each hard-bound to one element via `STATUS_FOR_ELEMENT`. A `StatusSpec`
has `duration`, `dps` (fraction of the applying hit), `slow`, `amplify`, `maxStacks`, `manaBurn`.

`StatusInstance` (live) = `{kind, remaining, stacks, dps, tickTimer}`. `applyStatus` snapshots
`dps = hitDamage * spec.dps * potency` at application (**snapshot-on-apply is correct and
already implemented**); refresh takes `max` of remaining/dps and increments stacks to `maxStacks`.
`tickStatuses` advances on a `STATUS_TICK = 0.5s` clock and calls back with damage.

Player statuses live on `Hero.statuses`; enemy statuses on `Enemy.statuses`. Same code both ways.

**Missing vs. spec:** no `sourceActor`/`sourceAbility` on the instance (no "your bleed vs. their
bleed"), no `refreshRule` variants, no `spreadBehavior`, no `detonationBehavior`, no
`expirationEvent`, no non-damaging DoT (Curse/Doom), no `Decay/Blight`, no physical DoT (Bleed).
Statuses are element-locked, so "Bleed" (physical DoT) is structurally impossible today.

### 8. How buffs/debuffs are represented

There is **no buff system**. There is one hard-coded buff on `Avatar`:
`buffTimer`, `buffAttackSpeed`, `buffLifeOnHit` — set by the `buff` skill shape, read in two
places (`attackCooldown` divisor, `lifeOnHit` sum). A second `buff` skill overwrites the first.
Bosses have their own one-off: `BossState.buffTimer/buffDamageMult/buffHasteMult`.

Debuffs on enemies = ailments only. There is no `Vulnerable`, `Weakened`, `Exposed`, `Marked`,
`Rooted`, `Stunned`, `Silenced`, `Taunted`, `Blinded` — none of the spec's baseline statuses
beyond the 5 elemental ones. `chill` is the only movement debuff; there is no hard CC at all.

### 9. How Mana is handled

`Player.mana` / `Player.maxMana` (from `Mods.maxMana`), `manaRegen` getter
(`4 + maxMana*0.02 + mods.manaRegen`), `spendMana`, `restoreMana`, `drainMana`. Regen applied in
the run loop. `manaOnHit`, `manaBurn` (void ailment) interact with it. It is baked directly into
`Player` — not an instance of any general resource type.

### 10. Can the architecture support non-mana resources?

**Not without new infrastructure.** There is no resource abstraction. `ChargeRules` is the only
thing resembling a second resource, and it is single-purpose: it only ever feeds `specialCharge`
(the ultimate meter, `0..1` on `Hero`), is not spendable on anything else, has no max/decay/
threshold/overflow/UI beyond the meter bar. To add "Rage", "Momentum", "Chi", "Corpses",
"Conviction", "Reagents", etc., you would today have to add a field to `Player` (persisted) or
`Hero` (per-run) and thread it manually through `dungeon.ts`, `hud.ts`, and `net/*`.

### 11. How cooldowns are represented

`Hero.skillCooldowns = [0,0,0,0]` — four floats, **indexed by equip slot, not skill id**.
Decremented each tick. `canCast(slot)` checks `<= 0`. `cooldownMult = 1/(1 + mods.cooldownRate)`
scales the value when set. Dash has its own `avatar.dashCooldown`. Bosses key cooldowns by
`BossAbilityId`. There is no global CD reduction on cast, no charges/stacks, no per-skill CD
that survives re-slotting.

### 12. How Ultimate charge is generated

`Dungeon.gainCharge(hero, units)` → `hero.specialCharge += units / player.ultimateCost`
(`ultimateCost = ultimate.charge / (1 + mods.ultimateRate)`), clamped to 1. Call sites:

| Source | Location | Amount |
|---|---|---|
| Kill | `killEnemy` | `perKill * (boss?6 : elite?3 : 1)` |
| Crit (basic attack) | `playerHit` | `perCrit` |
| Ailment inflicted | `damageEnemy` | `perAilment` |
| Mana spent (skill cast) | `castSkill` | `perManaSpent * cost/maxMana` |
| Health lost | `hurtPlayer…` (`~L2382`) | `perHealthLost * dealt/maxHealth` |

### 13. Can the Ultimate accidentally generate itself?

**Yes — this is the exploit the UAT flags, and it is real in the current code.**
`useUltimate` sets `specialCharge = 0`, then the ultimate runs. During it:

- `spin` / `storm` ultimates call `Dungeon.playerHit` every tick → crits call
  `gainCharge(perCrit)`, kills route through `killEnemy` → `gainCharge(perKill …)`.
- `impact` (`dropMeteor`) and `storm` (`launchBlades`) / `spin` (`whirlBurst`) spawn
  `Projectile`s with `owner: hero.index` → their kills also credit `gainCharge`.
- `totem` ultimates plant `Totem`s owned by the hero → totem kills credit `gainCharge`.
- Ailments applied by ultimate hits call `gainCharge(perAilment)`.

A Reaper (`perKill: 1.6`, very wide ultimate) or an ailment-spreading Shaman can meaningfully
refund the meter from the ultimate's own damage. `useUltimate` also fires `onUltimate` gear
triggers, whose kills feed back in. There is **no "this damage originated from the ultimate"
flag** to gate charge on.

### 14. How projectiles are represented

One `Projectile` interface (`src/game/entities.ts`): `x,y,px,py,radius,vx,vy,damage,friendly,
owner,life,color,element,pierce,hits:Set<number>,ailment,basic`. Straight-line motion
(`x += vx*dt`), dies on `life <= 0` or after `pierce` bodies or on a wall. No homing, no
acceleration, no lob/arc, no boomerang/return, no spawn-child-on-death, no split, no orbit.
"Chain" (lightning hop) is a *separate* mechanism (`chainFrom`), not a projectile. `basic: true`
marks a staff bolt so it routes through the full attack path (crits/leech/triggers).

### 15. How AoEs and zones are represented

Three distinct things:

- **Instant burst:** `Dungeon.novaAt(x,y,radius,power,element,ailment)` — a one-frame circle
  check. Used by nova/slam skills, ultimate impacts, triggers.
- **Telegraph:** `Telegraph` interface — `shape: "circle"|"donut"|"cone"|"line"|"none"`, timed
  wind-up, `hitsPlayer`/`hitsEnemies`, `followId`, `linger`. **This is the richest primitive in
  the codebase.** `game/boss.ts::paintTelegraph` generates all shapes generically; only the
  parts a telegraph can't express get a `switch` in `resolveAbility`. Player skills do **not**
  use telegraphs at all (except `slam` shake).
- **Lingering ground:** `GroundZone` — a circle that ticks damage over a duration.

There is no persistent player-owned damaging zone with arbitrary shape, no zone that follows
the caster, no zone-merge ("two ignition zones combine"), no pull/knockback field, no
buff/heal zone.

### 16. How summons are represented

`Totem` interface only — stationary, timed, pulses damage to N nearest, owned by a hero index.
`Enemy.summoned: boolean` marks boss adds (cleaned up + not counted for loot when the boss dies).

There is **no mobile, AI-driven player minion**. No pet that walks, targets, and attacks; no
minion command state; no minion cap; no minion that can be sacrificed/detonated; no minion that
inherits the owner's stats. Necromancer's "Legion of the Dead" ultimate is implemented as
`kind: "totem"` — three stationary pylons, not a walking army. **Necromancer, Engineer, Shaman
(Spirit Hawk), Ranger (Falcon), Warden (Bear Aspect / plants) have no architecture today.**

### 17. How class progression nodes are represented

`src/data/tree.ts`. `TREE_DEFS: Record<ClassId, BranchDef[]>` — 5 branches/class, each 4 ordinary
nodes + 1 two-point keystone (`TREE_BRANCH_COUNT = 5`, `TREE_BRANCH_DEPTH = 5`). A `NodeDef` is
`{name, mods: Partial<Mods>}`. `buildTree` flattens each into `TreeNode`s with synthetic ids
(`${classId}.${branch}.${row}`) and a `requires` pointer to the node directly above.

### 18. How node effects are applied

`treeMods(classId, allocated)` sums every allocated node's `mods` into one `Mods` record.
`Player.mods` adds that to class base + growth + item mods. **That's it.** Nodes are pure numeric
modifiers. Every keystone is just a larger `Partial<Mods>` bundle — no keystone changes a rule.

### 19. Can nodes mutate skills?

**No.** Nothing in the tree, in items, or anywhere else can change what a skill *does*. `Mods`
has aggregate knobs (`projectiles +N`, `pierce +N`, `areaSize`, `cooldownRate`, `ultimateBounces`,
`ultimateProjectiles`) that `castSkill`/`useUltimate` read globally and apply to *every* skill at
once. There is no per-skill targeting, no "replace effect", no "add a rider", no mutation hook.

### 20. How save files store class/tree state

`src/core/save.ts` (`SAVE_VERSION = 12`, versioned with a fill-in-the-gaps loader) +
`src/game/state.ts`. `GameState.players: Record<ClassId, Player>` — **every class has its own
fully independent character** (level, xp, `deepestDepth`, `health`, `mana`, `skills[3]`,
`allocated: string[]`, `equipment`). `activeClassId` selects the live one; `GameState.player` is
a getter. `playerToJSON` persists `{level, xp, deepestDepth, health, mana, skills, allocated,
equipment}`. `allocated` is an array of node-id strings. `applyPlayerJSON` runs
`normalizeTree()` (drops nodes not belonging to the class, prunes orphans, refunds over-spend).

Stash, coins, materials, gems, cosmetics, challenger tier, rift/planet progress are **account-
wide**, shared by all classes.

Adding classes: `players` is `Object.fromEntries(CLASS_IDS.map(id => new Player(id)))`, and the
loader iterates `CLASS_IDS`, so **new classes auto-appear at level 1 with empty everything** —
migration for *adding* the 6 classes is nearly free. Migration *within* a class (tree reshape,
resource change, skill-id renames) is the hard part.

### 21. Systems coupled to `ClassId` / `SkillId` / `UltimateId`

- `CLASS_IDS`, `SKILL_IDS`, `ULTIMATE_IDS` — `as const` tuples; unions derived. Any addition
  edits these.
- `TREE_DEFS: Record<ClassId, …>` — **must** have an entry per class or `buildTree` throws.
- `CLASSES`, `SKILLS`, `ULTIMATES` — `Record<Id, Spec>`, exhaustive.
- `GameState.players: Record<ClassId, Player>`; save `players` object keyed by class id.
- `Player.classId` (immutable), `heroClass`, `skillPool`, `ultimate`, `charge`.
- `Avatar.ultimate: UltimateId | null`; `Hero.skillCooldowns` length assumes 3+1.
- `net/protocol.ts`: `HeroWire.classId: string`, `HeroSnap.ul: string` (ultimate id),
  `NET_ACTIONS` includes `skill1..skill4` + `special` (fixed count).
- `net/sync.ts`: `ULTIMATES` re-exported; `applyHero` casts `h.ul as UltimateId`.
- `ui/town.ts` (Path tab), `ui/hud.ts` (meter, skill icons), `render/*` (ultimate colors).
- `tools/smoke.ts` — scripts skills/ultimates by id, asserts class balance.

### 22. Systems coupled to specific class *names*

Very little logic branches on a specific class. Notable:
`GameState.craftItem` / `openChests` bias weapon rolls toward `heroClass.affinity`.
`Player.attackElement` falls back to `heroClass.element`. `DEFAULT_CLASS = "swordsman"`.
`enemies.ts` names an archetype "Juggernaut" and a boss "Warden" — **string collisions** with
new class names, cosmetic only but worth renaming to avoid confusion.
No `if (classId === "berserker")` anywhere — good.

### 23. Systems assuming every class has the same resources

- `Player` hard-codes `mana`/`maxMana`/`manaRegen`; `HeroSnap` sends `mp` for everyone.
- `hud.ts` draws one mana bar + one ultimate meter, unconditionally.
- `castSkill` assumes every skill costs `mana` and nothing else.
- `ChargeRules` assumes the meter fills from the same five events for every class.
- `net` snapshot has fixed `hp/mp/wd/ch` fields per hero.

### 24. Systems assuming a class is a stat block

- `Player.mods` is the universal funnel: class + growth + tree + items → one `Mods`. Combat
  "never asks which item"; by design it also never asks which *class*. A class contributes
  **only numbers** to this pipeline.
- `treeMods`, `itemMods`, `HeroClass.base/growth` are all `Partial<Mods>`.
- There is no hook for "run this class's per-tick logic", "this class modifies its own basic
  attack", "this class reacts to event X". Everything a class "does" beyond stats is its one
  `ultimate` (a `UltimateKind` switch) and its `charge` scalars.

### 25. Multiplayer / networking constraints

`src/net/` — `protocol.ts`, `sync.ts`, `party.ts`, `client.ts`; relay in `tools/relay.ts`.

- **Host-authoritative, single simulation.** Clients send `{move, aim, press bitfield}` and
  render `Snapshot`s at `SNAPSHOT_HZ = 20`. Clients simulate **nothing** (`applySnapshot`
  wipes and rebuilds projectiles/pickups/telegraphs/ground/totems every snapshot; enemies are
  matched by id for interpolation). `MAX_PARTY = 4`.
- **The wire format is hand-rolled and positional.** `HeroSnap` is a fixed-field object;
  everything else is `number[][]` with a documented column order and enum index tables
  (`ENEMY_KINDS`, `STATUS_KINDS`, `SHAPES`, `PICKUP_KINDS`, `RARITIES`, `ELEMENTS`). Every new
  stateful combat primitive (a minion, a real buff, a player zone, a class resource bar, a new
  status, a new element) needs: an encode path, a decode path, a column layout, and often a new
  index table — in `sync.ts` **and** `protocol.ts`.
- `HeroSnap` carries `ul` (ultimate id string), `ch` (meter), `cd[4]`, `mt[6]` (materials),
  `ky` (keys). A per-class resource means **+1 field on `HeroSnap` for everyone**, or a
  variable-length side-channel.
- `NET_ACTIONS` is 10 fixed actions (`skill1..4`, `special`, …). More than 4 skills, or a
  targeted/aimed skill needing more than one angle, doesn't fit without a protocol bump
  (`PROTOCOL_VERSION = 1`).
- **Determinism is load-bearing:** `generateLevel` and all RNG (`core/rng.ts`) must stay
  seed-deterministic; the level is never transmitted. Any new procedural content (minion
  spawn positions, decoy placement) that the client needs to see must either be seed-derived
  or go in the snapshot.
- Per the UAT, multiplayer is *currently unreliable* and is Phase-1 priority independent of
  this refactor. The refactor should **not deepen the snapshot** carelessly while that is
  being fixed.

---

## Reusable Systems

These are solid and should be **kept and built on**, not replaced:

1. **`Mods` aggregation pipeline** (`data/mods.ts` + `Player.mods`). One record, one funnel,
   cached, rebuilt on change. This is the right model for *numeric* modifiers. Keep it; the
   refactor adds a *behavioral* layer beside it, it does not remove this.

2. **The status/ailment engine** (`game/combat.ts`). Unified list, snapshot-on-apply, shared
   player/enemy tick, stack/refresh/expire. Needs extension (more kinds, non-damaging statuses,
   source tracking, hooks) but the shape is correct.

3. **The telegraph system** (`entities.ts::Telegraph` + `boss.ts::paintTelegraph`). Generic
   shape primitives (circle/donut/cone/line), timed resolution, `followId`, `linger`,
   `hitsPlayer`/`hitsEnemies`, `angleOffset` for multi-instance. **This is the template for
   how player skills should work.** Generalize it into a shared "effect emitter" both sides use.

4. **Per-class independent characters** (`GameState.players`). Adding classes is cheap because
   of this. Keep exactly as is.

5. **Versioned save with fill-in loader** (`save.ts` + `state.ts::load`). The `applyPlayerJSON`
   / `normalizeTree` / `normalizeItem` pattern (accept old shape, repair, never wipe) is the
   right migration discipline. Reuse it for the tree rewrite.

6. **Weapon-family → attack-shape** (`data/weapons.ts` + `attack()` switch). `AttackPattern`
   is a small closed set and that's fine — weapons are not being refactored. Affinity stays.

7. **Host-authoritative netcode model.** The *topology* (one sim, thin clients) is right for a
   fast game and should not change. Only the *serialization* needs to become extensible.

8. **`RunConfig` / `profileFor` difficulty funnel** (`data/modes.ts` + `data/depth.ts` +
   `data/challenger.ts`). One curve, `danger` multiplier compounding mode × tier × challenger.
   The UAT's "slow player power / raise monster power / rebalance Challenger" asks are all
   tuning inside this one function plus XP curve changes — the structure supports it.

9. **Trigger framework** (`fireTriggers` / `resolveTrigger` + `inTrigger` re-entrancy guard).
   Small but correct. `TriggerKind` (`onHit|onKill|onDash|onUltimate`) is the seed of the
   event bus the new design needs — extend it rather than invent a parallel one.

10. **Effect helpers** — `novaAt`, `chainFrom`, `leapTo`, `plantTotem`, `meleeTargets`,
    `spawnPlayerBolt`. These are the primitive verbs; the refactor re-packages them behind a
    data-driven composer rather than rewriting them.

---

## Problematic Coupling

What actively blocks `classes_refactor.md`:

| # | Blocker | Why it blocks the new design |
|---|---|---|
| P1 | **Skill execution is a `switch (shape)` over 8 fixed shapes.** | The spec needs skills that compose movement + damage + status + zone + summon + resource + trigger + follow-up. 210 unique skills across 21 classes cannot each be a bespoke `case`. |
| P2 | **No damage packet, no damage channels.** | "+15% to enemies with a DoT" must not mean "+15% to the DoT". "Minion damage", "ultimate damage", "execute damage", "retaliation" are all indistinguishable. |
| P3 | **Statuses are 5, element-locked, no Bleed, no CC, no non-damaging curse.** | Berserker/Duelist/Assassin need physical Bleed; nearly every class needs Vulnerable/Weakened/Mark/Root/Stun/Silence/Taunt; Warlock needs Curse/Doom (culminating event, not per-tick). |
| P4 | **No buff/debuff framework.** One hard-coded avatar buff. | Bard *is* a buff framework. Paladin, Monk (Chi stances), Shaman (Ancestral Drum), Alchemist (serums), Ranger (Hunter's Mark as a real mark) all need stacked, timed, source-tracked, ally-targetable buffs. |
| P5 | **No resource abstraction — mana is hard-coded into `Player`, `ChargeRules` only feeds the ultimate.** | 21 classes each define a resource (Rage, Momentum, Chi, Corpses, Conviction, Reagents, Scrap, Souls, Storm Charge, Crew, …) with generation/decay/thresholds/overflow/UI. |
| P6 | **Ultimate charge has no "source = ultimate" flag → self-feeding loop.** | UAT explicitly: an Ultimate must not generate Ultimate charge. Needs a damage-source tag threaded to `gainCharge`. |
| P7 | **No mobile summon / minion system.** Totems are stationary. | Necromancer, Engineer, Shaman spirits, Ranger companion, Warden beast/plants. Necromancer is a *pilot class* and has zero architecture. |
| P8 | **Skill tree is pure `Partial<Mods>`; keystones are just bigger bundles; no mutation hooks; linear prereqs only.** | The spec's node categories are Foundation/Interaction/Resource/Mutation/Keystone. 4 of 5 require behavior change, not stats. Plus cross-path hybrids and 3-path Mythic Archetypes — an entire evaluation layer that doesn't exist. |
| P9 | **Items cannot modify skills** (only `grant` a whole skill or fire a fixed `trigger`). | UAT §28-29 named items must "modify existing skill / add projectile / change projectile behavior / change cooldown / change resource cost". Same mutation hooks as P8. |
| P10 | **No player-side telegraphs / targeting modes.** Skills fire from `avatar.facing` only. | Spec targeting: self/ally/point/direction/cone/line/radius/current-target/marked/lowest-HP-ally/highest-threat/corpse/summon/zone. Raid mechanic classes (Lancer line, Ranger, Paladin ally-bind) need point & ally targeting. |
| P11 | **No threat/taunt, no healing-over-time, no ally-targeted heal/shield, no player-created terrain.** | Juggernaut (taunt, Anchor Rune), Paladin (Guardian's Oath redirect, Shield of Faith on ally, Consecrated Ground), Warden/Engineer/Necromancer (walls), Bard (Restorative Verse). |
| P12 | **Cooldowns indexed by slot, not skill id.** | Re-slotting resets CD; a granted 4th skill and a chosen skill can't share sensible CD semantics; "reduce cooldown of *bleed* skills" (tag-targeted) is impossible. |
| P13 | **The multiplayer snapshot is positional and exhaustive.** | Every new primitive (minion, buff, zone, resource) is a schema change in two files + an index table, while multiplayer is simultaneously being stabilized. |
| P14 | **Only 6 elements; no Holy/Arcane/Nature.** | Paladin (Holy), Magician/Warlock (Arcane), Shaman/Warden/Ranger (Nature). Adding elements touches `Mods` keys, resist caps, `STATUS_FOR_ELEMENT`, every enum index table in `net/sync.ts`, sprites/colors, item affix pool. |
| P15 | **`SKILL_SLOTS = 3` + 1 granted, hard-wired; `NET_ACTIONS` fixed.** | The spec's classes assume a 9-skill kit (with some subset equipped). Fine to keep "equip N of 9", but the granted-slot and net-action assumptions need review. |

---

## Proposed Architecture

The goal (spec §35): *the class defines the verbs, the tree changes the grammar, the hybrid
system creates the build.* Build the **combat vocabulary** first (spec §3, §33 Phase 1), then
classes.

### A. Damage packet

Replace the bare `(number, element, opts)` with a `DamagePacket`:

```
interface DamagePacket {
  amount: number;
  type: Element;              // extended set incl. holy/arcane/nature
  channel: DamageChannel;     // "hit" | "dot" | "periodic" | "minion" | "pet"
                              //  | "ultimate" | "reflect" | "retaliation"
                              //  | "execute" | "environment"
  source: DamageSource;       // { actorId, actorKind: "hero"|"enemy"|"minion"
                              //   |"totem"|"zone"|"trap", abilityId?, skillTags? }
  crit: boolean;
  tags: SkillTag[];           // carried from the ability, for modifier targeting
  canInflictAilment: number;  // chance, 0 if none
  knock: number;
}
```

`damageEnemy` / `hurtPlayer` take a packet. `gainCharge` reads `packet.source` and
**ignores anything whose `channel === "ultimate"` or `source.abilityId` is the active ultimate**
(fixes P6). Modifiers can now be written against `channel`/`tags` (fixes P2).

### B. Status/effect registry (extends `combat.ts`)

- `STATUSES` becomes an open registry: `Record<StatusId, StatusSpec>` where `StatusId` is a
  string, not a 5-member union. Ship families: `bleed` (physical DoT), `burn`, `poison`,
  `decay`, `chill`, `freeze` (hard CC), `shock`, `curse`/`doom` (non-damaging, expiration
  event), `vulnerable`, `weakened`, `exposed`, `mark`, `root`, `stun`, `silence`, `blind`,
  `taunt`, `stealth`.
- `StatusSpec` gains: `category: "dot"|"debuff"|"cc"|"buff"|"curse"`, `damaging: boolean`,
  `refreshRule`, `snapshotRule` (default = current behavior), optional `onExpire` effect
  (Doom), optional `spread`/`detonate` hooks referenced by id.
- `StatusInstance` gains `sourceActorId` and `sourceAbilityId` (for "your bleed", modifier
  attribution, and detonation ownership).
- **Buffs are statuses** with `category: "buff"` and a `mods: Partial<Mods>` payload folded
  into `Player.mods` at aggregation time (the cache already rebuilds on change — add "active
  buffs" as an input). This gives Bard/Paladin/Monk one system (fixes P4) and it's the same
  code on allies because `Hero.statuses` already exists per hero.

### C. Resource framework

```
interface ResourceSpec {
  id: ResourceId;                 // "mana" | "rage" | "momentum" | "chi" | ...
  max: number | ModExpr;          // may scale off a stat
  start: "empty" | "full" | number;
  regenPerSec?: number;           // mana
  decayPerSec?: number;           // rage/momentum bleed off out of combat
  generation: ResourceEvent[];    // { on: "kill"|"crit"|"hitTaken"|"ailment"
                                  //   |"manaSpent"|"dashStart"|..., amount }
  thresholds?: { at: number; effect: EffectRef }[];   // "at 100 Rage, ..."
  overflow?: "cap" | "spill" | EffectRef;
  ui: "bar" | "pips" | "charges" | "hidden";
}
```

`Player` holds `resources: Map<ResourceId, number>` (persisted) + a `ResourceRuntime` per run.
Mana becomes `RESOURCES.mana` — one entry among many. `ChargeRules` is deleted; the ultimate
meter becomes a resource `id: "ultimate"` whose `generation` list is the old 5 events **minus
any event whose packet source is the ultimate**. `HeroSnap` sends a compact `res: number[]`
in a class-declared order instead of a fixed `mp`/`ch` pair (one bounded change to the wire,
done once — fixes P5, mitigates P13).

### D. Ability definition + generic execution (spec §3.1)

An ability is data (roughly the spec's field list). The executor composes **effect primitives**
rather than switching on a shape:

```
interface Ability {
  id; classId; name; flavor;
  tags: SkillTag[];                         // spec §3.2 — the bridge to the tree
  cost: { resource: ResourceId; amount }[]; // usually mana, sometimes rage/chi/corpses
  generates?: { resource: ResourceId; amount }[];
  cooldown; castTime; recovery;             // real cast/recovery now
  targeting: TargetingMode;                 // self|ally|point|dir|cone|line|radius|marked|corpse|...
  range; shape?: { kind; radius?; width?; length?; arc? };
  telegraph?: TelegraphProfile;             // reuse the boss primitive for player skills
  effects: EffectStep[];                    // ORDERED, COMPOSABLE
  fx: FxProfile;                            // data-driven (spec §3.8)
  mutable: MutationHook[];                  // named points the tree/items can rewrite
}

type EffectStep =
  | { kind: "move"; style: "dash"|"blink"|"vault"|"charge"; ... }   // fixes P10 movement
  | { kind: "damage"; packet: DamageTemplate }
  | { kind: "status"; status: StatusId; to: "target"|"self"|"allies"; ... }
  | { kind: "zone"; ... }                    // persistent, shaped, optional follow, merge rule
  | { kind: "projectile"; behavior: "line"|"homing"|"lob"|"boomerang"|"orbit"; onExpire?: EffectStep[] }
  | { kind: "summon"; unitId; count; command? }   // fixes P7
  | { kind: "heal"; to: "self"|"ally"|"zone"; overTime? }           // fixes P11
  | { kind: "shield"; to: "self"|"ally"; pool; decays? }
  | { kind: "terrain"; piece: "wall"|"anchor"|"cover"; ... }        // fixes P11
  | { kind: "threat"; op: "taunt"|"drop"; radius }                  // fixes P11
  | { kind: "resource"; resource; delta }
  | { kind: "trigger"; event; effects: EffectStep[] }               // deferred / follow-up
  | { kind: "consume"; what: "corpse"|"status"|"summon"; then: EffectStep[] };
```

`castSkill` becomes: pay costs → start cast/recovery timers → on resolve, run `effects` in
order through one `runEffect(step, ctx)` dispatcher. Adding class #21's weird skill = new data
+ (rarely) one new `EffectStep` kind that many classes then reuse. **This is the spec's
non-negotiable (§34 rule 4, §33 Phase 2).**

### E. Minion/summon runtime (fixes P7)

A `Minion` entity (like `Enemy` but `faction: "friendly"`, an `ownerId`, an AI profile:
`follow|guard-point|aggro-nearest|command-target`, a lifetime or permanent-with-cap,
stat inheritance from owner `Mods`, and a `commandState` the Necromancer's "Command: Ravage"
sets). Reuses the existing `FlowField` pathing and `Enemy` movement/attack code where possible.
Snapshot: a new `m: number[][]` array (one schema change).

### F. Targeting service (fixes P10)

`resolveTargets(mode, ctx) -> { point?, actors?, corpse?, zone? }`. Centralizes
`meleeTargets` / `nearestHero` / marked-target / lowest-HP-ally / corpse lookup. Client sends
a target point/actor id alongside the press when a skill needs it (bounded `NET_ACTIONS` /
input extension — do once).

### G. Skill-tree v2 (fixes P8)

Keep the 5-branch × 5-deep shape and free respec. Change node payloads:

```
type NodeEffect =
  | { kind: "mods"; mods: Partial<Mods> }                    // still allowed, now secondary
  | { kind: "resourceRule"; patch: Partial<ResourceSpec> }   // change generation/threshold
  | { kind: "mutate"; abilityId; hook: MutationId; params }  // rewrite a skill (also used by items → fixes P9)
  | { kind: "grantEffect"; on: SkillTag | "event"; effects: EffectStep[] }
  | { kind: "rule"; id: KeystoneRuleId };                    // keystones = named rule flips
```

`treeMods` stays for the `mods` case; a new `treeBehaviors(classId, allocated)` returns the
non-numeric effects, consumed by the ability executor and resource runtime. `canAllocate`
unchanged for now; add a separate **`evaluateHybrids(allocated)`** pass (spec §4.4) that reads
per-branch point totals and unlocks `HybridEffect`s, and later `evaluateArchetypes` (§4.5) for
3-branch Mythic Archetypes. These are pure functions over `allocated` — cheap to add, easy to
test, and orthogonal to node allocation.

### H. Event bus

Promote `fireTriggers` into a small typed emitter: `onHit`, `onKill`, `onCrit`, `onDash`,
`onCast`, `onSkillTag`, `onDamageTaken`, `onAilmentInflicted`, `onResourceThreshold`,
`onSummonDeath`, `onCorpseCreated`, `onUltimate`. Items (`trigger`), tree (`grantEffect`),
resources (`generation`), and statuses (spread/detonate) all subscribe through it. Keep the
`inTrigger` re-entrancy guard (make it a depth counter).

### I. Elements (fixes P14)

Extend `ELEMENTS` to add `holy`, `arcane`, `nature`. This is a mechanical change touching
`Mods` keys, `resistFraction` usage, `STATUS_FOR_ELEMENT`, all `net/sync.ts` index tables,
`ELEMENT_COLORS`/sprites, and the item affix pool. Do it as **one dedicated commit** early,
with the smoke test's "wardrobe changes nothing" and "every capsule can pay out" style
exhaustiveness checks extended to the new elements.

### What stays literally unchanged

`Mods` aggregation, weapon families, `RunConfig`/`profileFor` structure, per-class save
independence, the host-authoritative net topology, cosmetics (must still touch zero numbers),
the render split (`pixels.ts` pure).

---

## Migration Risks

### Save compatibility

- **`SAVE_VERSION` bump to 13+.** `Player.allocated` holds node-id strings
  (`"lancer.2.3"`). The tree rewrite changes branch contents → **every allocated node id
  becomes invalid**. `normalizeTree` already drops unknown ids and refunds, so the
  fail-safe is "respec everyone". Acceptable because respec is free and always has been —
  but **surface it**: on load, if a class had allocation and it was reset, flag it so town
  can show "your <class> tree was reset by an update, <N> points refunded".
- `Player.skills` holds `SkillId`s. If skill ids are renamed/replaced per the "no shared
  skills" rule, saved loadouts break → `readSkills` already null-checks against `SKILL_IDS`,
  so they become empty slots and `autoSlotNewSkills` refills. Same "surface it" need.
- New `Player.resources` map: absent in old saves → initialize from `ResourceSpec.start`.
  `mana`/`health` currently persisted as raw fields — keep reading them, migrate into the map.
- `ChargeRules` removal: `specialCharge` (0..1) is persisted on nothing (it's per-run on
  `Hero`), so no migration needed there.
- The 6 new classes: **zero migration** (auto-created fresh). Do **not** reorder `CLASS_IDS`
  — `activeClassId` is stored by string, but any code doing index math on it would break.
  Append only.
- Items: `grant`/`trigger` already normalized with `?? null`. If `TriggerSpec` gains fields
  for skill-mutation, default them.

### Networking

- **Protocol bump (`PROTOCOL_VERSION = 2`).** New `HeroSnap.res[]`, new `m[][]` (minions),
  new `zn[][]` (player zones), extended status/element index tables, possibly a target field
  in the input packet. Old clients must be rejected cleanly (`party.ts` version check).
- **Do this on top of the Phase-1 multiplayer stabilization, not tangled with it.** The UAT
  makes multiplayer reliability a blocker; a widening snapshot during that work risks
  masking or causing desync. Sequence: fix MP → freeze wire → then extend wire for combat v2.
- Determinism: minion spawn positions, decoy placement, "random teleport" (Trickster) must
  be `dungeon.rng`-derived so the host stays the only authority; clients render from snapshot
  regardless, but any *host* logic that reads `Math.random()` is a desync-on-rejoin bug.
- Bandwidth: spec-heavy classes (Necromancer legion, Engineer turrets, Trickster 6 clones)
  can put 20-40 extra bodies on screen. `protocol.ts` already notes 38 kB/s per player at
  24 monsters; budget for minions explicitly, consider a lower snapshot rate for friendly
  bodies or delta-encoding before it becomes a problem.

### Gameplay regressions

- **`tools/smoke.ts` is the safety net and it will need substantial extension.** It currently
  scripts skills/ultimates by id and asserts two campaign depths, boss fight length, the
  telegraph-on/off damage divergence, chest odds, "cosmetics change nothing", "every capsule
  pays out", "every sprite grid parses". Add: resource generation/spend per class, cooldown
  interactions, status stacking/refresh/expire, skill mutation application, tree prereqs,
  hybrid unlock thresholds, "ultimate does not charge itself" (regression test for P6),
  minion pathing doesn't stall a floor, ally-targeted heal/shield/buff actually lands on the
  right hero in a party sim.
- **Balance dial moves.** CLAUDE.md: the class overhaul already put ~70% more damage in the
  player's hands and enemy health base was raised to match. Every resource/tree/ability change
  moves it again. Re-run both smoke campaigns + the raid-boss fight-length + potion-belt
  assertions after each class lands. The UAT *wants* player power to grow slower (XP curve,
  node acquisition rate) and monsters harder — treat that as part of this work, tuned in
  `depth.ts` / `challenger.ts` / `xpForLevel`, and validated by the "careless bot stalls ~12,
  careful bot high-teens" invariant.
- **Class fantasy vs. legacy numbers** (spec §34 rule 9): the current 15 classes share skills
  and reuse 5 ultimate kinds. Giving each its own 10-skill kit means the *feel* of every
  existing class changes. Expect the owner to react to each pilot by eye (per the art-direction
  precedent) — ship pilots playable, iterate.
- **Pure-support playability (Bard, partly Paladin).** A class whose power is "make allies
  better" must still solo the delve. Design each support ability with a self-benefit or
  summon-target fallback so the smoke bot (solo) can clear a floor with it.

### Scope / process risks

- **21 classes × 10 skills × 5 branches is ~210 abilities + ~525 nodes + ~126 hybrids.** The
  spec (§33) is explicit: **do not go class-by-class.** Build the vocabulary, prove it on a
  vertical slice, then migrate. Resist the pull to "just add the class".
- `TREE_DEFS` must have an entry per `ClassId` or `buildTree` throws at module load — the 6
  new classes need at least stub trees the moment their ids are added, or the game won't boot.
  Same for `CLASSES`, `SKILLS` pools, `ULTIMATES`.
- Doc drift already exists (`tree.ts` says "four branches" but ships five; `save.ts` v12 vs
  CLAUDE.md v11). Update CLAUDE.md as systems land.

---

## Recommended Implementation Order

Aligned with spec §33 and UAT §Chunk 1. Each step is independently shippable and smoke-tested.

**Phase 0 — Freeze & scaffold**
0.1 Freeze new class-skill content on `master`. All work on `refactor/classes-combat-progression`.
0.2 Add the 6 new `ClassId`s with **stub** class defs, stub 5-branch trees, a placeholder
    ultimate each, and a temporary shared skill pool — just enough that the game boots and
    `smoke` passes. No real content yet.
0.3 Extend `smoke.ts` scaffolding for the assertions listed under "Migration Risks".

**Phase 1 — Combat primitives (no class touches yet)**
1.1 `DamagePacket` + `DamageChannel` + `DamageSource`; thread through `damageEnemy`/`hurtPlayer`.
1.2 **Ultimate self-charge fix** (P6/UAT §10): gate `gainCharge` on packet source. Regression test.
1.3 Status registry v2: open `StatusId`, add `bleed` + CC + `curse`, `sourceActorId`,
    `category`, `onExpire`. Keep the 5 elemental ones behaving identically.
1.4 Buffs-as-statuses: `category:"buff"` with a `Mods` payload folded into `Player.mods`.
    Port the one hard-coded avatar buff onto it.
1.5 Elements +holy/arcane/nature (the one big enum-touch commit).
1.6 Event bus: generalize `fireTriggers`.
1.7 Targeting service: centralize existing target-finding, add ally/point/marked/corpse.

**Phase 2 — Generic ability execution**
2.1 `Ability` schema + `EffectStep` union + `runEffect` dispatcher.
2.2 Port the existing 23 skills and 15 ultimates onto it as data (behavior-identical). Delete
    the `switch (shape)` and the `UltimateKind` switch. This is the big refactor commit; the
    smoke test's job is to prove nothing changed.
2.3 Real `castTime` / `recovery`; per-skill-id cooldowns (fixes P12).
2.4 Movement `EffectStep` (dash/blink/vault/charge) — unblocks mobility classes.
2.5 Zone `EffectStep` (persistent, shaped, follow, merge) — reuse telegraph primitives.

**Phase 3 — Resource framework**
3.1 `ResourceSpec` + `Player.resources` map + `ResourceRuntime`. Mana becomes a resource.
    Ultimate meter becomes a resource. `ChargeRules` deleted.
3.2 `HeroSnap.res[]` wire change (coordinate with MP-stabilization freeze).
3.3 HUD renders resources from `ResourceSpec.ui`.

**Phase 4 — Summons & terrain**
4.1 `Minion` entity + AI profiles + owner-stat inheritance + snapshot `m[][]`.
4.2 Terrain `EffectStep` (wall/anchor/cover) + threat/taunt `EffectStep`.
4.3 Heal/shield `EffectStep` with ally targeting; heal-over-time.

**Phase 5 — Skill-tree v2**
5.1 `NodeEffect` union; `treeBehaviors()` alongside `treeMods()`; keystones = rule flips.
5.2 Save v13 bump; "your tree was reset" surfacing.
5.3 `MutationHook` system — consumed by both tree nodes and items (fixes P8 + P9 together).

**Phase 6 — Cross-path & archetypes**
6.1 `evaluateHybrids(allocated)` — pure function, 2-branch unlocks.
6.2 `evaluateArchetypes(allocated)` — 3-branch Mythic Archetypes.

**Phase 7 — Pilot classes** (see below). Build 6, fully, on the new vocabulary. Owner reviews
by feel. Iterate the primitives where a pilot exposes a gap.

**Phase 8 — Migrate remaining 15 classes**, one per commit, each smoke-tested, each reviewed.

**Phase 9 — Progression pacing pass** (UAT §7-9): XP curve, node acquisition rate, monster
scaling in `depth.ts`, Challenger rebalance. Do this *after* classes exist so it's tuned
against the real kit.

**Phase 10 — Named items / relics / raid hooks** (UAT Chunks 7-10) build on the mutation-hook
and event-bus layer from Phase 5 — sequence them after, not during.

> Interleave with the UAT's independent Phase-1 work (multiplayer fix, monster affix system,
> elite tier, floor-clear condition) as separate branches. The **multiplayer stabilization must
> land and the wire format must be frozen before Phase 3.2**.

---

## Pilot Classes

Six classes that, together, exercise every new primitive. **Do not implement these yet** —
they are the acceptance test for Phases 1-6.

| Class | Primary architectural stressor |
|---|---|
| **Lancer** | Movement `EffectStep` (charge/vault/dash variety), line & direction targeting, the **Momentum** resource with overflow → movement-speed threshold, ultimate-as-traversal, player telegraphs (Redline Charge route). Also the cleanest hybrid/archetype test (`Momentum + Impaler + Vanguard = Comet Vanguard`). |
| **Berserker** | **Rage** resource generated by *damage taken* (not kills), decay out of combat, threshold effects. **Bleed** = physical DoT (proves statuses are no longer element-locked). Health-as-a-resource (Blood Price, Last Stand). Status detonation (Bloodletter kills spread + explode Bleed). Cross-DoT hybrid (Bleed + Burn → Hemorrhage). |
| **Magician** | **Dual resource** (Mana + Overcharge) — proves the resource framework handles more than one per class. Skill-sequencing state (Spellweave: each cast alters the next → mutation hooks at runtime, not just from the tree). Low-resource threshold keystones (Arcane Overload spends HP). Teleport movement + originate-from-previous-position (Paradox). |
| **Necromancer** | **Mobile minion runtime** (the whole of §E). **Corpse** as a resource/entity (spawned on enemy death via the event bus, consumed by abilities). Minion command state (Command: Ravage). Minion sacrifice (Death Pact). Player terrain (Ossuary Wall). Summon-scaling off owner `Mods`. Snapshot pressure (a legion of bodies). |
| **Paladin** | **Ally-targeted** heal / shield / damage-redirect (Guardian's Oath), buff-as-status on other heroes in a party sim, heal-over-zone (Consecrated Ground), **threat/off-tank** mechanics, preventative "cannot drop below 1 HP" rule keystone (Last Light), **Conviction** resource generated by *preventing/absorbing* damage. The hardest multiplayer-interaction test. |
| **Bard** *(my pick for the 6th)* | The pure-support degenerate case: **near-zero self-damage identity**, power is entirely "modify allies". Forces a real stacked/timed/source-tracked **aura & buff framework**, ally + raid-wide targeting, the **Rhythm/Crescendo** resource with a build-up→spend loop and an `onSkillTag` "repeat last ability" mechanic (Encore). Also the acid test for **solo playability of a support class** (the smoke bot must clear a floor as a Bard). Alternate if Bard is deferred: **Engineer** — persistent guard-point constructs with independent AI + infrastructure/cover terrain + `Scrap` resource + remote-detonate event chains. |

Bard is chosen over the spec's Phase-8 suggestions of Trickster (illusions/RNG — a narrower
stressor: mostly decoy entities + position-swap) because Bard is the class the current
architecture can express *least* of, and because "a class is not a stat block" is stated as the
single most important principle (spec §2.1, §35). Trickster and Juggernaut should be early in
the Phase-8 migration instead, as the next-hardest cases (illusion entities; threat/immovable).

---

## Appendix — Doc drift noticed (fix opportunistically)

- `src/data/tree.ts` header says "four branches per class" — ships five (`TREE_BRANCH_COUNT = 5`).
- `src/core/save.ts` is `SAVE_VERSION = 12`; CLAUDE.md says 11.
- `classes_refactor.md` §1 lists "23 classes" and its numbering skips 17 and jumps 16→18 and
  22→23→24…27 — the authoritative roster is the **21** in this document's header and the task
  brief. Oracle/Chronomancer explicitly excluded.
- `src/data/enemies.ts` names an archetype `"Juggernaut"` and a boss `"Warden"` — string
  collisions with new class names; rename the monsters when convenient.
