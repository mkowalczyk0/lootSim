# Classes & Progression Refactor Specification

## Purpose

This document is the design and refactor reference for the game's class system, skill system, skill trees, cross-path build interactions, and future raid-scale combat architecture.

It is intended to be read by Claude Code before touching class-related implementation. It is a **design specification and architectural direction**, not an instruction to blindly preserve the current implementation.

The game is expected to grow into 4-20 player dungeon and boss raids. Class identity must therefore be strong enough to support both solo play, large-group composition.

---

# 1. Current State and Refactor Intent

The current class implementation defines class identity through base stats, growth, weapon affinity, a list of reusable skill IDs, a single element, and an ultimate. The current class file shows substantial overlap between classes: for example, Lancer, Berserker, Swordsman, Shaman, Necromancer, and Stormcaller all borrow generic abilities from one another. The current trees are five branches deep and use four normal nodes plus a two-point keystone per branch.

The current tree architecture is structurally useful, but its gameplay output is too stat-centric. Many paths are effectively four numerical modifiers followed by a larger numerical modifier. The new direction is to preserve the understandable five-path structure while making nodes alter behaviors, resources, statuses, skill interactions, and build identity.

## Core refactor goals

1. Every class has a distinct combat fantasy.
2. Every class owns a completely unique suite of 10 skills: 9 normal skills + 1 ultimate.
3. No normal skill or ultimate should be shared across classes.
4. Each class has five distinct build paths.
5. Paths should create **play-patterns**, not merely stats.
6. Cross-path investment should unlock hybrid mechanics.
7. Deep investment in multiple paths may unlock Mythic Archetypes.
8. Skill-tree nodes may mutate existing skill behavior.
9. Resources are class-defining systems, not just shared Mana bars with different numbers.
10. Damage types, DoTs, crowd control, targeting, telegraphs, FX, and raid utility need to be first-class concepts in the combat model.
11. The class system must remain data-driven so additional classes and abilities can be authored without rewriting combat code.
12. Balance should primarily come from tunable data, not hard-coded one-off logic.


## Important roster note

The design work currently establishes **23 classes**:

1. Lancer
2. Berserker
3. Swordsman
4. Magician
5. Shaman
6. Ranger
7. Juggernaut
8. Duelist
9. Warlock
10. Monk
11. Necromancer
12. Corsair
13. Trickster
14. Reaper
15. Stormcaller
16. Paladin
18. Bard
19. Alchemist
20. Engineer
21. Assassin
22. Warden

Do not silently invent five additional classes to make the count reach 28. The next class-design pass can add them deliberately if desired.

---

# 2. Design Principles

## 2.1 A class is an interaction system

A class is not merely:

- weapon type
- element
- base stats
- ten buttons

It is a set of rules that explains how the player is expected to generate power, create openings, spend a unique resource, and interact with enemies and allies.

## 2.2 Each class should answer one unique question

- Lancer: **How do I control distance and momentum?**
- Berserker: **How much pain can I turn into power?**
- Swordsman: **How well can I chain different techniques?**
- Magician: **How much can I bend the rules of spellcasting?**
- Shaman: **How can I reshape the battlefield with rituals and spirits?**
- Ranger: **How well can I prepare the battlefield before the fight arrives?**
- Juggernaut: **How do I become the place the party can safely stand?**
- Duelist: **Can I make the enemy attack into a mistake?**
- Warlock: **How much can I turn enemy weakness into my resource?**
- Monk: **Can I maintain a perfect combat rhythm?**
- Necromancer: **How much value can I extract from every death?**
- Corsair: **How much can I control enemy positioning?**
- Trickster: **How badly can I confuse the battlefield?**
- Reaper: **How efficiently can I convert low health bars into more kills?**
- Stormcaller: **How can I weaponize weather and movement?**
- Paladin: **How much damage can I prevent from ever reaching my party?**
- Bard: **How much stronger can I make everyone else?**
- Alchemist: **How many useful reactions can I create from the same battlefield?**
- Engineer: **How much infrastructure can I build during combat?**
- Assassin: **How cleanly can I identify and eliminate the true priority target?**
- Warden: **How much of the arena can I turn into friendly terrain?**

## 2.3 Different is better than bigger

A node that changes what a skill does is generally more valuable from a design perspective than a node that gives the same skill 12% more damage.

Numerical scaling still matters, but it should support a behavior.

Bad:
> +10% damage to Fire skills

Better:
> Burning enemies killed by Fire skills leave behind a short-lived ignition zone.

Best:
> Burning enemies killed by Fire skills leave ignition zones; when two zones overlap they combine into a larger persistent zone.


---

# 3. Recommended Combat Architecture Before Adding New Classes

Do not begin by implementing class #16 or #24. Build the underlying combat vocabulary first.

## 3.1 Ability Definition System

Every skill should be represented as a data definition rather than bespoke class logic.

Recommended conceptual fields:

- id
- classId
- name
- description
- flavorText
- category
- tags
- resourceCost
- cooldown
- castTime
- recovery
- targetingMode
- range
- radius / width / length
- baseDamage
- damageType(s)
- statusApplications
- statusInteractions
- movementBehavior
- defensiveBehavior
- allyBehavior
- enemyBehavior
- projectileBehavior
- summonBehavior
- generatedResource
- consumedResource
- ultimateChargeBehavior
- skillMutationHooks
- FX profile
- audio profile
- animation profile
- tooltip text

The actual implementation can use a richer schema, but the principle is essential: **content should describe behavior through composable primitives rather than forcing each class to own unique code paths.**

## 3.2 Tags

Skills should have semantic tags that the tree system can target.

Examples:

- melee
- ranged
- projectile
- heavy
- dash
- movement
- charge
- slash
- thrust
- area
- zone
- trap
- summon
- spirit
- minion
- corpse
- curse
- bleed
- poison
- burn
- frost
- lightning
- void
- holy
- physical
- support
- heal
- barrier
- taunt
- crowdControl
- interrupt
- execute
- counter
- stealth
- illusion
- weather
- ritual
- construct
- time
- resourceGenerator
- resourceSpender
- ultimate

Tags are the bridge between class trees and skill behavior.

## 3.3 Damage Model

Separate **damage type** from **status effect**.

Suggested damage types:

- Physical
- Fire
- Cold
- Lightning
- Poison
- Void
- Holy
- Arcane
- Nature

A single skill may deal one damage type or intentionally contain multiple components.

Do not make “Burning” a damage type. Burning is a status / DoT caused by Fire damage or another explicit source.

Likewise, a Lightning skill may apply Shock, but Lightning and Shock must remain separate concepts.

## 3.4 Damage channels and modifiers

The game should distinguish at least:

- direct damage
- damage over time
- hit damage
- periodic damage
- reflected damage
- retaliation damage
- execute damage
- environmental damage
- summoned-minion damage
- pet damage
- ultimate damage

Modifiers should be able to target these channels independently.

Example:
> +15% damage to enemies suffering a DoT

must not automatically mean:
> +15% to the DoT itself

unless explicitly intended.

## 3.5 DoT system

DoTs should be unified instead of every class inventing a bespoke timer.

Recommended generic DoT model:

- sourceActor
- sourceAbility
- effectId
- damageType
- tickInterval
- duration
- intensity / stacks
- maxStacks
- refreshRule
- snapshotRule
- scaling source
- dispel behavior
- spread behavior
- detonation behavior
- expiration behavior

Primary DoTs in the current design language:

### Bleed
Physical DoT. Best suited to Berserker, Duelist, Assassin.

### Burn
Fire DoT. Best suited to Berserker / Magician / Alchemist.

### Poison
Poison / Nature-aligned DoT. Best suited to Shaman / Assassin / Reaper.

### Decay / Blight
A corruption-oriented DoT/debuff state. Best suited to Shaman / Warlock / Necromancer.

### Curse / Doom
Not necessarily damage every tick; can amplify future damage, change behavior, or culminate in an expiration event. Best suited to Warlock.

Do not proliferate dozens of nearly-identical DoTs. Prefer a small number of mechanically distinct families with class-specific interactions.

## 3.6 Status effect architecture

Status effects should be data-driven and support:

- stack count
- duration
- source
- immunity / resistance
- application chance
- refresh rules
- consume rules
- detonation rules
- conversion rules
- spread rules
- upgrade / mutation rules

Recommended baseline statuses:

- Bleed
- Burn
- Poison
- Chill
- Freeze
- Shock
- Corruption
- Curse
- Mark
- Vulnerable
- Weakened
- Rooted
- Stunned
- Silenced
- Blinded
- Taunted
- Stealthed / Hidden
- Exposed
- Bleak / Doomed if needed as a separate boss-grade state

## 3.7 Resource architecture

Mana should become one resource among many.

Every class should be able to define a resource model:

- resource type
- max
- generation rules
- decay rules
- spenders
- threshold effects
- overflow rules
- UI representation
- tree interactions

Recommended class resources:

- Lancer: Momentum
- Berserker: Rage
- Swordsman: Technique
- Magician: Mana + Overcharge
- Shaman: Spirit / Ritual state
- Ranger: Prepared Charges / Hunter's Advantage
- Juggernaut: Fortify
- Duelist: Precision / Riposte Windows
- Warlock: Corruption / Soul Debt
- Monk: Chi
- Necromancer: Corpses / Souls / Minion command state
- Corsair: Crew / Hook momentum / Bounty
- Trickster: Decoys / Deception
- Reaper: Souls
- Stormcaller: Storm Charge / Weather Phase
- Paladin: Conviction / Grace
- Bard: Rhythm / Crescendo
- Alchemist: Reagents
- Engineer: Scrap / Construction Charges
- Assassin: Contracts / Shadow
- Warden: Roots / Nature state

These resources can be implemented through a generic resource framework even if their UI and behavior differ.

## 3.8 FX architecture

FX should also be data-driven.

Every skill should be able to reference:

- cast FX
- travel FX
- impact FX
- persistent ground FX
- status FX
- projectile trail
- screen shake profile
- hit-stop profile
- camera emphasis
- sprite / animation event
- sound profile
- color / palette profile
- telegraph profile

Important: FX should communicate mechanics. A player should be able to read a dangerous raid mechanic before it lands.

## 3.9 Telegraph / boss mechanic system

Future raid combat will require reusable telegraph primitives:

- circle
- cone
- line
- beam
- ring
- expanding ring
- shrinking ring
- safe zone
- unsafe zone
- delayed impact marker
- tether
- proximity marker
- spread marker
- stack marker
- knockback indicator
- projectile route
- line-of-sight blocker

This is particularly important for Paladin, Warden, Lancer, Ranger, and raid encounter design.

## 3.10 Targeting system

Skills should not hard-code “find nearest enemy.” Support:

- self
- ally
- enemy
- point
- direction
- cone
- line
- radius
- current target
- marked target
- lowest-health ally
- highest-threat enemy
- corpse
- active summon
- active zone
- position history / temporal anchor

## 3.11 Skill mutation system

The tree must be able to change the behavior of an existing skill without creating dozens of separate copies.

Example:

> Skill: Corpse Bomb
>
> Mutation: Corpse Architect
>
> Result: instead of immediate explosion, corpse creates a bone structure that emits skeletons.

Conceptually, a skill should expose mutation hooks such as:

- damage packet modifier
- targeting modifier
- projectile modifier
- movement modifier
- resource modifier
- status modifier
- zone modifier
- summon modifier
- trigger modifier
- follow-up modifier
- replace-effect modifier

The exact implementation is up to the codebase, but this abstraction is important.

---

# 4. Skill Tree Architecture

## 4.1 Base structure

The current tree shape is five branches, each with four normal nodes followed by a two-point keystone. This shape is good and should remain the baseline unless the UI proves otherwise.

However, the meaning of the nodes changes.

### Node categories

1. **Foundation** — introduces or strengthens the path's core behavior.
2. **Interaction** — changes how one or more skills interact.
3. **Resource** — changes generation / spend / thresholds.
4. **Mutation** — modifies one or more existing abilities.
5. **Keystone** — changes the rules of the build.

Stats remain possible, but should be secondary.

## 4.2 Path philosophy

Each class has five paths:

- Core fantasy
- Skill transformation
- Resource / loop
- Party or utility alternative
- Wildcard / unusual playstyle

## 4.3 Prerequisites

The current linear path prerequisite system can remain, but later versions can support limited side connections.

Recommended future model:

- 1 point: foundation
- 1 point: behavior
- 1 point: interaction
- 1 point: mutation
- 2 points: keystone

## 4.4 Cross-path interactions

A cross-path interaction is unlocked when the player invests enough points in two separate paths.

Example:

> 3 Momentum + 2 Vanguard = Breakthrough

This is **not** another passive percentage modifier. It is a new rule.

Recommended representation:

- hybridId
- classId
- requiredPathA
- requiredPathAPoints
- requiredPathB
- requiredPathBPoints
- name
- description
- effects
- skillMutations
- optional visual marker

## 4.5 Three-path Mythic Archetypes

A smaller set of deep combinations can unlock a named archetype.

Example:

> Lancer: Momentum + Impaler + Vanguard = Comet Vanguard

Mythic archetypes should be rare and substantial. They are meant to produce a “holy shit, my build became a thing” moment.


                    CLASS
                      │
        ┌─────────────┼─────────────┐
        │             │             │
      PATH A        PATH B        PATH C
        │             │             │
        └──────┐ ┌────┘ └──────┐ ┌──┘
               │ │             │ │
               ▼ ▼             ▼ ▼
          HYBRID BUILD    HYBRID BUILD
               │               │
               └───────┬───────┘
                       ▼
                MYTHIC ARCHETYPE


That gives you a beautiful progression:

Level 1: “I'm a Monk.”

Level 10: “I'm building Flow.”

Level 20: “Oh, I'm mixing Flow and Combo Master.”

Level 30: “Holy shit, I unlocked Infinite Motion.”

Level 45: “My Monk is now a mobility combo character unlike the Iron Body Monk standing beside me.”

Level 60: “I'm a Flow / Combo / Master Monk running the Infinite Motion archetype.”



---

# 5. CLASS DESIGN MASTER LIST

Each class below is specified with:

- class fantasy
- dungeon / raid role
- unique resource
- 10 unique skills
- five build paths
- hybrid interactions

No skill name below should be reused by another class.

---

# 6. LANCER

## Fantasy
Master of distance, momentum, line control, and high-commitment charges.

## Role
Initiator / mobile frontliner / line damage / raid vanguard.

## Resource
Momentum.

## Skills

### 1. Impaling Thrust
A lightning-fast long-range forward stab. Stops on the first elite or champion but passes through normal enemies.

Flavor: “One target. One opening. One very long mistake.”

### 2. Vaulting Spear
Plant the spear and vault over enemies, landing behind them with a downward strike.

Flavor: “The safest road through a battlefield is sometimes over it.”

### 3. Dragoon Line
Sweep the spear forward and pull smaller enemies toward the spear tip.

Flavor: “Come closer. I insist.”

### 4. Phalanx Brace
Plant the spear and brace. Deflect projectiles and stagger melee attackers.

Flavor: “The spear becomes a wall when held correctly.”

### 5. Skewer Step
Dash through a target and leave a spectral spear at the starting point. Recast to return.

Flavor: “Forward is easy. Knowing when to come back is the trick.”

### 6. Crescent Sweep
Wide melee sweep that scales with current Momentum.

Flavor: “A spear is only a line until the hands become creative.”

### 7. Heavenfall
Leap and plunge downward, creating a shock ring that launches normal enemies.

Flavor: “For a moment, every enemy looks upward.”

### 8. Redline Charge
Sprint continuously in a straight line. Striking enemies extends the route; hitting terrain ends in a finishing thrust.

Flavor: “Do not ask where the Lancer is going. Ask what survives the route.”

### 9. Banner of the First Step
Throw a war banner that grants allies movement and bonus damage against enemies the Lancer recently pierced.

Flavor: “Follow me, and the path becomes yours.”

### Ultimate: Meteor Lance
Rocket across the battlefield as a spear-shaped projectile, piercing enemies and crashing into the final target with a radial explosion.

Flavor: “The difference between a charge and a meteor is mostly academic.”

## Paths

### Dragoon
1. Long Stride — distance traveled before attacking empowers the attack.
2. Vaultmaster — Vaulting Spear crosses larger enemies and grants Momentum on landing.
3. Pursuit — attacking shortly after moving deals bonus damage.
4. Relentless Charge — successful charge hits refund part of the cooldown.
5. Sky Lancer — movement abilities chain into empowered follow-up attacks.

### Impaler
1. Long Point — max-range attacks gain penetration.
2. Deep Wound — pierced enemies receive stacking Skewered wounds.
3. Through Flesh — damage carries onward through skewered targets.
4. Pinpoint — attacks against aligned enemy formations gain bonus damage.
5. Transfixion — fully charged thrusts pin targets and create spectral spear links.

### Sentinel
1. Braced Stance — standing still grants frontal mitigation.
2. Counterpoint — blocked attacks empower the next thrust.
3. Grounded — resistance to knockback and displacement while planted.
4. Punishing Reach — approaching enemies are automatically struck periodically.
5. Impalement Wall — Phalanx Brace becomes a persistent spear barrier.

### Momentum
1. Motionless No More — movement itself generates Momentum.
2. Overflow — excess Momentum temporarily increases movement speed.
3. Stored Violence — spend Momentum to empower the next skill.
4. Breakneck — max Momentum changes mobility skills.
5. Living Projectile — max Momentum can turn the next charge into an invulnerable piercing projectile.

### Vanguard
1. First In — recently pierced enemies become more vulnerable to allies.
2. Mark the Breach — charges create party damage windows.
3. Follow Me — allies move faster toward enemies recently struck by the Lancer.
4. Open Formation — attacked enemies become incentivized to target the Lancer.
5. Banner of Advance — banner follows the Lancer and periodically grants raid movement and damage.

## Hybrid interactions

- Dragoon + Impaler = **Thunder Lance** — long-range charge pierces an entire line.
- Dragoon + Vanguard = **Breakthrough** — completed elite charges buff nearby allies.
- Impaler + Sentinel = **Phalanx Spear** — planted attacks extend through approaching enemies.
- Momentum + Sentinel = **Countercharge** — stored Momentum releases as a counterattack when struck.
- Impaler + Vanguard = **Breach Master** — pierced enemies create a damage-amplifying Breach Line for allies.
- Momentum + Impaler = **Comet** — high Momentum converts the next thrust into a carried projectile.

---

# 7. BERSERKER

## Fantasy
The fighter who turns pain, missing health, Rage, Bleed, and raw brutality into damage.

## Role
Bruiser / melee DPS / aggressive sustain.

## Resource
Rage.

## Skills

1. Skullbreaker — huge overhead axe strike with elite stagger.
2. Blood Price — spend health for Rage and attack speed.
3. Frenzy Chain — repeated hits on the same target become faster.
4. Axequake — slam the ground, sending expanding cracks.
5. Savage Grip — grab and throw an enemy into another.
6. Crimson Howl — gain resistance and taunt nearby enemies.
7. Cleaver's Reprisal — heavy damage taken primes an automatic counter-swing.
8. Last Stand — cannot fall below 1 HP briefly, but cannot heal.
9. Butcher's Momentum — kills temporarily increase melee reach and attack size.
10. Worldbreaker (Ultimate) — escalating sequence of gigantic axe strikes ending in a low-health-scaled shockwave.

## Paths

### Bloodletter
Fresh Wound / Open Artery / Blood Frenzy / Paint the Room / **Crimson Avalanche**

Core: Bleed stacks generate Rage, spread, and explode on kills.

### Last Breath
Pain Tolerance / Danger Zone / Near Death / Refuse / **Deathwish**

Core: lower health means higher damage and greater interruption resistance.

### Marauder
Heavy Grip / Bone Breaker / Overkill / Giant Swing / **World-Eater**

Core: gigantic physical attacks and overkill shockwaves.

### Inferno
Burning Blood / Searing Weapon / Combustion / Wildfire / **Living Furnace**

Core: fire zones, explosions, and an aura powered by Rage.

### Predator
Blood Scent / Feast / Kill Rhythm / Continuous Violence / **Carnage Engine**

Core: kill chains improve attack speed and refund offensive cooldowns.

## Hybrid interactions

- Bloodletter + Last Breath = **Blood Frenzy** — Bleed and missing HP multiply Rage generation.
- Bloodletter + Inferno = **Hemorrhage** — Burning and Bleeding enemies explode on death, spreading both.
- Last Breath + Marauder = **Deathblow** — low-health heavy attacks consume health for catastrophic damage.
- Marauder + Predator = **Butcher's Rhythm** — kills refund heavy attack cooldowns.
- Inferno + Predator = **Wildfire** — Burning kills create escalating Inferno Rush.
- Last Breath + Inferno = **Hellborn** — low-health Berserker radiates fire.
- Bloodletter + Marauder = **Rupture** — heavy attacks consume Bleed stacks for a physical detonation.

---

# 8. SWORDSMAN

## Fantasy
The adaptable weapon master built around technique, chaining, stances, and intelligent switching.

## Role
Flexible DPS / wave clear / single-target specialist.

## Resource
Technique.

## Skills

1. Threefold Cut — three rapid sword strikes; third strikes behind the target.
2. Crossguard — brief defensive guard; successful block empowers the next offensive skill.
3. Rising Edge — upward slash that launches light enemies and interrupts armored attacks.
4. Severing Arc — wide crescent slash that is stronger against wounded targets.
5. Twin Tempo — alternating fast and heavy attacks.
6. Swordflash — instant dash to a target and strike from the opposite side.
7. Iron Waltz — spinning attack that extends on successful hits.
8. King's Challenge — mark one elite; gain damage against it and gain sustain from nearby kills.
9. Masterstroke — precision heavy strike with conditional automatic critical hit.
10. Sword Eclipse (Ultimate) — high-speed blur of strikes ending in simultaneous multi-directional cuts.

## Paths

### Master of Arms
Versatility / Sword Discipline / Blade Knowledge / Weapon Rhythm / **Grandmaster**

### Dancing Blade
Footwork / Passing Cut / Through and Around / No Stationary Fight / **Sword Dance**

### Counterblade
Guard Training / Riposte / Deflection / Punishment / **Untouchable Form**

### Executioner
Expose / Sever / Finish / Ruthless / **Final Cut**

### Spellblade
Arcane Edge / Elemental Contact / Spellstrike / Arcane Momentum / **Battle Caster**

## Hybrids

- Master of Arms + Dancing Blade = **Blade Dance** — diverse moving attacks create a free finisher.
- Counterblade + Executioner = **Duel to the Death** — perfect counters permanently expose elite weak points.
- Master of Arms + Spellblade = **Arcane Mastery** — sword attacks inherit properties from recent spells.
- Dancing Blade + Executioner = **Passing Judgment** — executions reset Swordflash.
- Counterblade + Dancing Blade = **Parry Dance** — successful guards grant a movement charge.
- Executioner + Spellblade = **Spellblade Execution** — Masterstroke detonates active elemental effects.

---

# 9. MAGICIAN

## Fantasy
High-risk ranged arcane artillery using Mana, Overcharge, spell combinations, and reality manipulation.

## Role
Long-range burst / AoE / boss DPS.

## Resource
Mana and Overcharge.

## Skills

1. Arc Spark — fast bolt that chains on kills.
2. Ember Orb — slow explosive fire orb.
3. Prism Lance — piercing beam that changes element after passing through an enemy.
4. Gravity Well — pull zone.
5. Mirror Image — two weakened casting copies.
6. Arcane Roulette — random powerful spell outcome.
7. Mana Burn — convert Mana into a huge raw-magic cone.
8. Spellweave — each spell alters the next spell's behavior.
9. Aether Step — teleport and leave an unstable sigil.
10. Astral Collapse (Ultimate) — steer a large meteor/arcane bombardment from above.

## Paths

### Archmage
Spell variety and sequencing.
Keystone: **Grand Arcanist** — three different spells unlock a free enhanced fourth spell.

### Elementalist
Element combinations and reactions.
Keystone: **Prismatic Mastery** — three elemental states trigger a Prismatic reaction.

### Mana Tyrant
Aggressive Mana expenditure.
Keystone: **Arcane Overload** — low Mana turns remaining spells into stronger health-consuming casts.

### Reality Bender
Gravity, clones, teleportation, battlefield manipulation.
Keystone: **Paradox** — teleporting through enemies causes next spells to originate from both current and previous positions.

### Glass Cannon
Extreme risk / reward.
Keystone: **Mortal Genius** — high Mana + low health massively amplifies spell damage.

## Hybrids

- Archmage + Elementalist = **Prismatic Cascade** — three elements unlock a fourth hybrid effect.
- Archmage + Mana Tyrant = **Overcast** — Mana thresholds alter spell power and health usage.
- Elementalist + Reality Bender = **Elemental Rift** — Gravity Well inherits recent spell element.
- Mana Tyrant + Glass Cannon = **Forbidden Spell** — low Mana causes spells to spend HP for huge power.
- Reality Bender + Glass Cannon = **Schrodinger** — teleports create dangerous intangibility windows.
- Archmage + Reality Bender = **Spell Echo** — casts can originate from previous positions.

---

# 10. SHAMAN

## Fantasy
Battlefield ritualist using spirits, curses, plants, persistent zones, and support.

## Role
Support / DoT / area control.

## Resource
Spirit Sites / Ritual state.

## Skills

1. Bone Talisman — marks a target for spirits.
2. Briar Circle — persistent damaging/slow ritual zone.
3. Spirit Hawk — spectral companion that circles and attacks marked targets.
4. Hex of Withering — stacking defense-reducing curse.
5. Ancestral Drum — ally attack-speed and echo buff.
6. Rootcaller — roots enemies and deals nature damage.
7. Spirit Exchange — transfer health to an ally, then create healing spirits.
8. Totemic Migration — relocate active structures.
9. Ritual of the Hollow Moon — diseased deaths create protective spirits.
10. Spirit World (Ultimate) — overlays the battlefield with the spirit realm and doubles active Shaman structures.

## Paths

### Spirit Caller
Spirit companions and totem evolution.
Keystone: **Spirit Council** — multiple spirits merge into an elder spirit.

### Plague Doctor
Disease stacking and propagation.
Keystone: **Walking Plague** — diseased kills create lasting infection zones.

### Ritualist
Preparation and stacked ritual zones.
Keystone: **Great Ritual** — completed rituals let every Shaman ability interact with them.

### Witch Doctor
Curse-heavy support/debuff gameplay.
Keystone: **Hexmaster** — heavily cursed enemies become linked.

### Wild Shaman
Close-range feral caster.
Keystone: **Avatar of the Hunt** — entering a Spirit Site enables temporary spirit-form combat.

## Hybrids

- Spirit Caller + Plague Doctor = **Rot Spirits** — diseased kills release propagating hostile spirits.
- Spirit Caller + Ritualist = **Spirit Convergence** — nearby spirit sites merge into a stronger zone.
- Plague Doctor + Witch Doctor = **Master Hex** — three debuffs link enemies.
- Ritualist + Wild Shaman = **Battle Rite** — rituals empower melee attacks and can travel with the caster.
- Witch Doctor + Wild Shaman = **Hexbeast** — cursed enemies become prey that sustain the Shaman.
- Spirit Caller + Wild Shaman = **Spirit Avatar** — active spirits fuel a temporary hybrid form.

---

# 11. RANGER

## Fantasy
Prepared hunter who uses terrain, traps, marksmanship, companions, and movement.

## Role
Ranged DPS / traps / priority-target hunter.

## Resource
Prepared Charges / Hunt state.

## Skills

1. Splitshot — projectile splits after impact.
2. Barbed Arrow — enemies bleed when moving.
3. Snare Trap — hidden root trap.
4. Explosive Trap — delayed knockback explosion.
5. Falcon Dive — hawk strikes and blinds.
6. Pinning Shot — pins enemies to terrain.
7. Hunter's Cache — special ammunition pickup.
8. Deadeye — stationary precision stance.
9. Predator's Trail — marked path that amplifies projectile damage.
10. The Last Hunt (Ultimate) — mark elites, enter stealth, unleash precision sequence.

## Paths

- Deadeye: Steady Aim / Broadheads / Called Shot / Full Draw / **Perfect Shot**
- Trapper: trap density and chaining / **Killing Ground**
- Beastmaster: companion behavior and evolution / **Alpha Companion**
- Skirmisher: movement-shooting / **Run and Gun**
- Cold Hunt: chill, freeze, and quarry interactions / **Winter's Predator**

## Hybrids

- Deadeye + Trapper = **Perfect Ambush**
- Trapper + Beastmaster = **Hunting Party**
- Skirmisher + Deadeye = **Run & Aim**
- Cold Hunt + Trapper = **Frozen Ground**
- Beastmaster + Skirmisher = **Pack Hunter**
- Deadeye + Cold Hunt = **Winter Execution**

---

# 12. JUGGERNAUT

## Fantasy
Living fortress whose strength comes from refusing to move, protecting space, and absorbing punishment.

## Role
Main tank / protector / chokepoint control.

## Resource
Fortify.

## Skills

1. Hammerfall — huge stun attack.
2. Bastion Stance — frontal mitigation while stationary.
3. Iron March — slow unstoppable advance.
4. Shieldless Guard — damage reduction while unable to attack.
5. Tremor Blow — directional seismic strike.
6. Anchor Rune — prevents displacement in an area.
7. Retaliation Plate — stores blocked damage and releases it.
8. Fortress Call — taunt and protect allies behind you.
9. Mountain's Weight — CC immunity, extreme mitigation, severe slow.
10. Citadel (Ultimate) — become a stationary fortress that shelters allies.

## Paths

- Fortress — mitigation / **Immovable**
- Demolitionist — heavy siege attacks / **Living Catapult**
- Sentinel — ally protection / **Guardian Wall**
- Iron Tyrant — threat control / **Absolute Threat**
- Rolling Mountain — mobile tank / **Avalanche**

## Hybrids

- Fortress + Sentinel = **Bastion**
- Fortress + Demolitionist = **Siege Mode**
- Iron Tyrant + Sentinel = **Champion's Challenge**
- Demolitionist + Rolling Mountain = **Avalanche**
- Fortress + Iron Tyrant = **Absolute Threat**
- Sentinel + Rolling Mountain = **Mobile Bulwark**

---

# 13. DUELIST

## Fantasy
Precision counter-fighter who wins by baiting attacks and exploiting openings.

## Role
Single-target DPS / elite killer / counter specialist.

## Resource
Precision / Riposte Windows.

## Skills

1. Feint — false attack and brief untargetability.
2. Riposte — timed counter stance.
3. Footwork — sidestep and empower attack against bypassed enemy.
4. Disarm — disable a target's special ability briefly.
5. Opening Cut — precision weak-point attack.
6. Lunging Jab — max-range high-damage thrust.
7. Bloodless Victory — attacks against wounded enemies gain precision and crit damage.
8. Countermark — mark the next enemy attack; countering refreshes cooldowns.
9. Final Lesson — force a duel against one target.
10. Perfect Riposte (Ultimate) — time-slowed window that counters every incoming attack.

## Paths

- Riposte — perfect counters / **Perfect Counter**
- Fencer — distance and footwork / **Elegant Violence**
- Blood Duel — single-target fixation / **One Opponent**
- Bleedmaster — precision wounds / **Thousand Cuts**
- Tempo — combo timing / **Perfect Rhythm**

## Hybrids

- Riposte + Fencer = **Perfect Distance**
- Riposte + Blood Duel = **Duelist's Law**
- Fencer + Tempo = **Flowing Steel**
- Blood Duel + Bleedmaster = **Red Contract**
- Tempo + Bleedmaster = **Thousand Cuts**
- Riposte + Tempo = **Counter Rhythm**

---

# 14. WARLOCK

## Fantasy
Corruption caster who turns enemy debuffs, health, and resource debt into power.

## Role
Debuff DPS / attrition / boss specialist.

## Resource
Corruption / Soul Debt.

## Skills

1. Black Bolt — stronger against cursed targets.
2. Soul Tax — enemy healing becomes Warlock Mana.
3. Rupture Vein — detonate curses.
4. Dread Sigil — corruption-amplifying zone.
5. Life Leech — tethered drain.
6. Maledict — stacking curse that becomes a persistent wound.
7. Grasp Beyond — spectral hands root enemies.
8. Pact of Power — sacrifice max health for spell damage.
9. Soul Detonation — consume Corruption for area damage.
10. Damnation (Ultimate) — brand all enemies; damage propagates among branded enemies.

## Paths

- Corruptor — stack and spread Corruption / **Total Corruption**
- Soul Eater — steal and convert resources / **Devour Soul**
- Pactmaker — health-sacrifice power / **Forbidden Pact**
- Riftwalker — movement through void rifts / **Between Worlds**
- Doomsayer — timed curse expiration / **Inevitable End**

## Hybrids

- Corruptor + Soul Eater = **Devouring Curse**
- Corruptor + Pactmaker = **Blood Corruption**
- Soul Eater + Riftwalker = **Soul Gate**
- Doomsayer + Corruptor = **Inevitable Ruin**
- Pactmaker + Doomsayer = **Final Payment**
- Riftwalker + Pactmaker = **Void Bargain**

---

# 15. MONK

## Fantasy
High-skill martial artist centered on combo maintenance, Chi, movement, and disciplined timing.

## Role
Mobile melee DPS / sustain / disruption.

## Resource
Chi.

## Skills

1. Palm Strike — fast Chi generator.
2. Rising Palm — launching uppercut.
3. Crane Sweep — low spinning kick.
4. Breath Control — spend Chi to heal and cleanse.
5. Flying Knee — leap and stagger.
6. Seven-Point Combo — seven-hit escalating sequence.
7. Empty Hand — temporary armor-ignoring basic attacks.
8. Afterimage Step — dash through target and leave attack-repeating afterimage.
9. Inner Calm — meditation for Chi and health.
10. Heavenly Fist (Ultimate) — colossal airborne strike with delayed shockwave.

## Paths

- Combo Master — infinite chains / **Infinite Sequence**
- Iron Body — defensive Chi / **Adamant Form**
- Flow — mobility / **Water Step**
- Inner Flame — elemental martial arts / **Dragon Breath**
- Master — counter timing / **Empty Mind**

## Hybrids

- Combo Master + Flow = **Infinite Motion**
- Combo Master + Inner Flame = **Dragon Combo**
- Iron Body + Master = **Counter Body**
- Flow + Master = **Ghost Fist**
- Iron Body + Inner Flame = **Furnace**
- Combo Master + Iron Body = **Unbreakable Rhythm**

---

# 16. NECROMANCER

## Fantasy
Commander of the dead. Every corpse is a possible soldier, projectile, wall, bomb, or resource.

## Role
Summoner / attrition / battlefield commander.

## Resource
Corpses / Souls / Command state.

## Skills

1. Raise Skeleton — summon basic melee undead from corpses.
2. Bone Spear — corpse-derived piercing projectile.
3. Corpse Bomb — consume corpse for explosion.
4. Grave Guard — armored taunting skeleton.
5. Blood Servant — temporary healing undead.
6. Corpse Walk — teleport to corpse, leaving a decaying duplicate.
7. Command: Ravage — focus all undead on one target.
8. Ossuary Wall — bone wall blocks movement/projectiles.
9. Death Pact — sacrifice a minion for health and Mana.
10. Kingdom of Bones (Ultimate) — every battlefield corpse rises, empowers existing minions, and expands command capability.

## Paths

- Legion Commander — many weak minions / **Endless Legion**
- Death Knight — fewer powerful undead / **Champion of Death**
- Corpse Architect — convert corpses into structures/explosions / **Grave Industry**
- Bone Lord — Bone constructs / **Ossuary**
- Soul Tyrant — spend Souls on personal spell power / **Soulstorm**

## Hybrids

- Legion Commander + Corpse Architect = **Meat Grinder**
- Death Knight + Soul Tyrant = **Lich Bond**
- Corpse Architect + Bone Lord = **Bone Forge**
- Legion Commander + Soul Tyrant = **Soul General**
- Death Knight + Corpse Architect = **Death Knight's Harvest**
- Bone Lord + Soul Tyrant = **Ossuary Storm**

---

# 17. CORSAIR

## Fantasy
Swashbuckling battlefield manipulator using hooks, crew, pistols, mobility, and enemy displacement.

## Role
Mobility DPS / displacement / utility.

## Resource
Crew / Bounty.

## Skills

1. Hookshot — pull self toward target.
2. Boarding Cut — follow Hookshot with a melee strike.
3. Chain Drag — drag a small enemy while moving.
4. Powder Keg — rolling explosive barrel.
5. Grapple Swing — terrain swing attack.
6. Dirty Trick — blind nearby enemies.
7. Deckhand's Call — summon ghostly crewmate.
8. Ricochet Shot — pistol shot that bounces.
9. Plunder — tag elites for rewards and combat buffs.
10. Broadside (Ultimate) — spectral cannons fire synchronized barrage.

## Paths

- Boarding Captain — aggressive melee / **Deck Master**
- Gunslinger — ranged pistol / **Six Shooter**
- Chainmaster — enemy manipulation / **Harpooner**
- Pirate King — crew scaling / **Ghost Crew**
- Treasure Hunter — loot-driven power / **Black Market**

## Hybrids

- Boarding Captain + Chainmaster = **Boarding Hook**
- Gunslinger + Chainmaster = **Harpoon Gun**
- Boarding Captain + Pirate King = **Mutiny**
- Treasure Hunter + Pirate King = **Plunder Crew**
- Gunslinger + Treasure Hunter = **Golden Bullet**
- Chainmaster + Treasure Hunter = **Bounty Hunter**

---

# 18. TRICKSTER

## Fantasy
Illusion assassin using decoys, stealth, position swapping, randomness, and deception.

## Role
Assassin / evasion / chaos.

## Resource
Deception / active Decoys.

## Skills

1. False Step — dash and leave decoy.
2. Mirror Trap — illusion that explodes when attacked.
3. Backstab — teleport behind enemy for huge damage.
4. Sleight of Hand — swap positions with target or decoy.
5. Vanish — stealth and speed.
6. Painted Target — enemy-priority illusion.
7. Knife Rain — backward-moving knife spread.
8. Double Down — huge next attack, dangerous on miss.
9. Chaos Step — three random short teleports.
10. Hall of Mirrors (Ultimate) — six combat copies acting independently.

## Paths

- Illusionist — decoys / **Many Faces**
- Assassin — backstab / **Death From Nowhere**
- Gambler — risk/reward randomness / **Double or Nothing**
- Phantom — evasion / **Untouchable**
- Chaos — position manipulation / **Reality Thief**

## Hybrids

- Illusionist + Assassin = **False Assassin**
- Illusionist + Chaos = **Hall of Doors**
- Gambler + Assassin = **Loaded Contract**
- Phantom + Chaos = **Impossible Movement**
- Assassin + Phantom = **Ghost Killer**
- Gambler + Chaos = **Everything is a Gamble**

---

# 19. REAPER

## Fantasy
Mass executioner who turns kills into Souls, sustain, mobility, and further executions.

## Role
Wave clear / execution / sustain.

## Resource
Souls.

## Skills

1. Reaping Arc — enormous semicircular scythe attack.
2. Soul Brand — marked enemy creates a Soul on death.
3. Grave Sweep — moving scythe sweep.
4. Wraith Dash — incorporeal movement.
5. Harvest Life — consume Souls to heal.
6. Pale Hook — pull wounded enemies.
7. Executioner's Step — teleport to low-health targets for execute.
8. Soul Shield — spend Souls to absorb damage.
9. March of the Reaped — spectral copies repeat basic attacks.
10. Death Comes Due (Ultimate) — freeze low-health targets and execute them with a spectral scythe.

## Paths

- Soul Harvest — maximize Souls / **Endless Harvest**
- Executioner — execution thresholds / **Final Sentence**
- Wraith — mobility / **Deathless Form**
- Scythe Lord — maximum AoE / **World Reaper**
- Soul Warden — defensive Souls / **Soul Fortress**

## Hybrids

- Soul Harvest + Executioner = **Harvest of the Guilty**
- Soul Harvest + Wraith = **Soul Step**
- Executioner + Scythe Lord = **Grand Reaping**
- Wraith + Soul Warden = **Soulform**
- Scythe Lord + Soul Harvest = **Soulstorm**
- Executioner + Soul Warden = **Death's Protection**

---

# 20. STORMCALLER

## Fantasy
Living storm using chakrams, weather states, teleportation, wind, and lightning.

## Role
Mobile AoE DPS / elemental control / disruption.

## Resource
Storm Charge / Weather Phase.

## Skills

1. Static Disc — thrown chakram leaves electrical field.
2. Thunderstep — teleport and strike both origin/destination.
3. Gale Ring — rotating wind ring deflects projectiles.
4. Raincaller — moving storm cloud.
5. Tempest Chain — lightning bounce.
6. Cyclone Blade — chakram creates moving tornado.
7. Ball Lightning — homing electrical sphere.
8. Eye of the Storm — safe eye with stronger attacks outside it.
9. Weather Shift — cycle Rain / Wind / Thunder.
10. Eye of the Tempest (Ultimate) — mobile eye surrounded by a massive damaging storm.

## Paths

- Thunder God — lightning amplification / **Chain Reaction**
- Tempest — weather states / **Endless Storm**
- Stormblade — chakram combat / **Cyclone Warrior**
- Windrunner — mobility / **Living Wind**
- Eye — centered storm gameplay / **Eye of Eternity**

## Hybrids

- Thunder God + Tempest = **Supercell**
- Tempest + Windrunner = **Stormfront**
- Stormblade + Windrunner = **Cyclonic Step**
- Thunder God + Stormblade = **Thunder Disc**
- Eye + Tempest = **Perfect Storm**
- Eye + Windrunner = **Calm Before**

---

# 21. PALADIN

## Fantasy
Holy protector who prevents damage, redirects attacks, heals allies, and turns protection into Conviction.

## Role
Off-tank / protector / emergency healer.

## Resource
Conviction / Grace.

## Skills

1. Radiant Strike — holy melee mark that supports allied healing.
2. Guardian's Oath — bind to an ally and redirect damage.
3. Consecrated Ground — healing zone.
4. Judgement — ranged holy debuff that amplifies allied damage.
5. Shield of Faith — absorb the next major hit on an ally.
6. Aegis Rush — charge to ally/enemy and create a protective pulse.
7. Cleansing Flame — cleanse allies and turn removed curses into healing.
8. Vindicator's Call — marked enemies fuel Conviction.
9. Martyr's Grace — sacrifice self-health for group healing.
10. Last Light (Ultimate) — nearby allies cannot fall below 1 HP; prevented death converts into final healing.

## Paths

- Guardian — **Bodyguard**
- Crusader — **Zeal**
- Sanctifier — **Sanctuary**
- Martyr — **Saint's Burden**
- Vindicator — **Holy War**

## Hybrids

- Guardian + Martyr = **Martyrdom**
- Guardian + Sanctuary = **Moving Sanctuary**
- Crusader + Vindicator = **Holy Execution**
- Sanctifier + Martyr = **Last Mercy**
- Crusader + Guardian = **Retributive Oath**
- Vindicator + Martyr = **Zealous Martyr**

---

# 23. BARD

## Fantasy
Battlefield conductor whose primary power is making the rest of the party better.

## Role
Pure support / raid buffs / enemy disruption.

## Resource
Rhythm / Crescendo.

## Skills

1. War March — movement and attack speed buff.
2. Battle Hymn — increased damage for nearby allies.
3. Restorative Verse — attacks by buffed allies heal them.
4. Dissonance — enemy attack/cast speed reduction.
5. Rallying Chorus — raid resource regeneration burst.
6. Crescendo — build Rhythm for an amplified next performance.
7. Encore — repeat last Bard ability.
8. Dirge of Silence — enemy casting suppression field.
9. Standing Ovation — reward high-skill ally actions with buffs.
10. Grand Performance (Ultimate) — multi-phase raid performance ending in a major burst window.

## Paths

- War Drummer — offensive buffs / **Battle Tempo**
- Minstrel — healing support / **Healing Chorus**
- Maestro — combo songs / **Grand Crescendo**
- Dissonant — enemy disruption / **Silence the World**
- Virtuoso — high-skill self-performance / **Encore**

## Hybrids

- War Drummer + Maestro = **Battle Crescendo**
- Minstrel + Maestro = **Healing Symphony**
- Dissonant + War Drummer = **War Noise**
- Minstrel + Virtuoso = **Soloist**
- Maestro + Virtuoso = **Encore**
- Dissonant + Minstrel = **Dirge**

---

# 24. ALCHEMIST

## Fantasy
Improviser who creates battlefield reactions by combining reagents.

## Role
Utility DPS / buffs / debuffs / area control.

## Resource
Reagents.

## Skills

1. Volatile Flask — explosive fire zone.
2. Frost Solution — freezing cloud.
3. Adrenal Compound — ally speed buff.
4. Corrosive Mixture — strip armor.
5. Transfusion Tonic — convert Mana to healing.
6. Reagent Toss — throw the active reagent.
7. Unstable Reaction — combine all active chemical zones.
8. Smoke Bomb — accuracy-reducing concealment field.
9. Experimental Serum — randomized ally enhancement.
10. Grand Experiment (Ultimate) — constantly mutating elemental/chemical battlefield.

## Paths

- Pyromancer — **Chain Reaction**
- Toxicologist — **Biological Collapse**
- Medic — **Miracle Cure**
- Mad Scientist — **Unstable Genius**
- Transmuter — **Philosopher's Stone**

## Hybrids

- Pyromancer + Toxicologist = **Napalm**
- Medic + Transmuter = **Miracle Cure**
- Mad Scientist + Pyromancer = **Unstable Combustion**
- Toxicologist + Transmuter = **Mutagen**
- Mad Scientist + Medic = **Experimental Medicine**
- Pyromancer + Mad Scientist = **Lab Accident**

---

# 25. ENGINEER

## Fantasy
Combat builder using turrets, mines, drones, walls, and battlefield infrastructure.

## Role
Ranged DPS / defensive utility / infrastructure.

## Resource
Scrap / Construction Charges.

## Skills

1. Auto-Turret — deploys attacking turret.
2. Mortar Pod — deploys targeted artillery.
3. Repair Drone — repairs ally defenses.
4. Shock Mine — disables enemies.
5. Reinforced Barricade — construct a wall.
6. Scrap Magnet — convert debris to temporary armor.
7. Overclock — increase construct fire rate.
8. Remote Detonation — detonate all deployed devices.
9. Emergency Assembly — rapidly construct defensive machine.
10. Siege Engine (Ultimate) — autonomous war machine with bombardment and cover.

## Paths

- Gunner — **Automated Army**
- Siege Engineer — **Artillery Platform**
- Mechanic — **Self-Repairing Workshop**
- Saboteur — **Chain Detonation**
- Quartermaster — **Mobile Armory**

## Hybrids

- Gunner + Saboteur = **Killbox**
- Siege Engineer + Quartermaster = **Forward Base**
- Mechanic + Gunner = **Autonomous Army**
- Saboteur + Mechanic = **Recursive Explosives**
- Siege Engineer + Saboteur = **Demolition Zone**
- Quartermaster + Mechanic = **Field Workshop**

---

# 26. ASSASSIN

## Fantasy
Pure priority-target killer focused on contracts, stealth, weak points, and clean executions.

## Role
Boss DPS / priority target elimination / execution.

## Resource
Contracts / Shadow.

## Skills

1. Garrote — stealth-oriented DoT.
2. Ambush — huge opener against unalerted targets.
3. Mark for Death — contract target.
4. Poison Needle — ranged stacking poison.
5. Vanishing Cut — dash through target and disappear.
6. Expose Weakness — raid vulnerability mark.
7. Blood Trail — movement/attack speed against wounded targets.
8. Silent Step — threat suppression and stealth utility.
9. Execution — normal enemies below threshold die; bosses take percentage damage.
10. Contract Fulfilled (Ultimate) — lock onto one target and escalate attack sequence.

## Paths

- Executioner — **Death Sentence**
- Venom — **Fatal Dose**
- Shadow — **Never Seen**
- Saboteur — **Critical Weakness**
- Blood Hunter — **Death Spiral**

## Hybrids

- Executioner + Venom = **Toxic Execution**
- Shadow + Blood Hunter = **Predator**
- Saboteur + Executioner = **Weak Point**
- Venom + Shadow = **Silent Poison**
- Blood Hunter + Executioner = **Death Chain**
- Shadow + Saboteur = **Perfect Crime**

---

# 27. WARDEN

## Fantasy
Guardian of the wild who turns terrain into living defensive and offensive infrastructure.

## Role
Off-tank / crowd control / zone defense.

## Resource
Roots / Nature state.

## Skills

1. Thornstrike — rooting projectile.
2. Living Wall — vine barrier.
3. Bear Aspect — tank form.
4. Vine Snare — group root.
5. Verdant Shelter — healing area.
6. Nature's Reprisal — retaliatory root/strike.
7. Wild Charge — animalistic knockback charge.
8. Regrowth — seed that grows into healing plant.
9. Overgrowth — expand all active natural structures.
10. Ancient Grove (Ultimate) — transform large battlefield into enchanted forest.

## Paths

- Beast — **Primal Guardian**
- Verdant — **Worldroot**
- Thornkeeper — **Briarheart**
- Huntmaster — **Apex Predator**
- Ancient — **Elder Grove**

## Hybrids

- Beast + Huntmaster = **Apex**
- Verdant + Thornkeeper = **Briar Sanctuary**
- Ancient + Verdant = **Worldroot**
- Beast + Thornkeeper = **Predator's Retaliation**
- Huntmaster + Verdant = **Pack Growth**
- Ancient + Beast = **Elder Form**

---

# 29. Example Three-Path Mythic Archetypes

Three-path archetypes should be fewer than two-path hybrids and dramatically stronger in identity.

## Lancer: Comet Vanguard
Momentum + Impaler + Vanguard.

The Lancer's charge pierces an entire formation and leaves a damage-amplifying trail for allies.

## Necromancer: Soul Legion
Legion + Corpse Architect + Soul Tyrant.

Every death can become either more army strength or direct Soul ammunition, forcing a strategic choice.

## Trickster: Reality Killer
Illusionist + Assassin + Chaos.

Assassination effects can originate from any active illusion.

## Paladin: Saint of the Last Stand
Guardian + Martyr + Sanctifier.

Healing zones become stronger from damage absorbed; protected allies become temporarily unkillable while the Paladin has enough Conviction.


These examples establish the quality bar: Mythic Archetypes should feel like a new character archetype, not another modifier.

---

# 30. Raid Role Philosophy

The roster should not require every class to be mandatory. Instead, it should create multiple solutions to encounter problems.

## Core raid roles

### Main Tank
Juggernaut

### Off-Tank / Protector
Paladin, Warden, Lancer

### Pure Support
Bard

### Utility Support
Alchemist, Engineer, Shaman

### Ranged DPS
Ranger, Magician, Stormcaller, Warlock

### Melee DPS
Swordsman, Duelist, Monk, Berserker, Reaper, Lancer, Corsair

### Priority Target / Boss DPS
Assassin, Duelist, Warlock, Magician

### Summoner
Necromancer

### AoE / Add Control
Reaper, Stormcaller, Shaman, Berserker

### Enemy Manipulation
Corsair, Trickster, Warden

### Raid Mechanic Specialists
Trickster, Lancer, Ranger

The goal is **overlapping roles but non-overlapping identities**. Two classes may both protect the raid, but one does so through damage redirection while another does it through terrain control or future-state manipulation.

---

# 31. Balance Philosophy

Do not balance the roster solely by DPS-per-second.

Track at least:

- sustained single-target DPS
- burst DPS
- AoE throughput
- effective health
- mitigation
- healing throughput
- preventative healing / shielding
- movement utility
- crowd control
- target manipulation
- raid damage amplification
- resource sustain
- mechanic solving power
- execution power
- uptime requirements
- skill ceiling
- skill floor

A raid class that deals less damage but solves a mechanic should not automatically be treated as underpowered.

Likewise, a pure DPS class should not be given accidental support mechanics so strong that its raid utility eclipses support classes.

---

# 32. Anti-Overlap Rules

The following rules should govern all future class design.

## Rule 1: One skill = one owner

No generic skill should be reused by another class under a different name.

## Rule 2: Similar effects must feel different

Two classes can both have a dash, but:

- Lancer dash = momentum and line traversal
- Stormcaller dash = weather and teleportation
- Trickster dash = deception
- Assassin dash = assassination
- Monk dash = combo progression

## Rule 3: Ultimates must express the class mechanic

Do not create generic “big AoE ultimate” variants.

Examples:

- Lancer = traversal
- Juggernaut = fortress
- Necromancer = army
- Bard = performance

## Rule 4: Trees must alter behavior

A branch should make a player play differently even if gear is identical.

## Rule 5: Avoid element-first identity

Elements are tools, not class identities. A class should still make sense if an elemental visual is swapped.

## Rule 6: Avoid universal defense columns

Not every class needs a “health / defense / sustain” path. Defense should support class identity.

---

# 33. Suggested Refactor Order

Implement the refactor in phases rather than class-by-class.

## Phase 0: Freeze content churn

Do not add more class skills while the combat data model is being changed.

## Phase 1: Core combat primitives

Implement or formalize:

- Damage packets
- Damage types
- Status effects
- DoTs
- Tags
- Resource framework
- Cooldowns
- Targeting
- Zones
- Projectiles
- Dashes / movement skills
- Summons
- Threat / taunt
- Shields / barriers
- Healing
- Interrupts
- Executes
- Telegraphs
- FX references

## Phase 2: Generic skill execution framework

A generic skill should be able to compose:

- movement
- damage
- status
- zone
- projectile
- summon
- resource generation / consumption
- trigger
- follow-up

The engine should not need a bespoke branch for each class.

## Phase 3: Resource framework

Create class-owned resource definitions with a shared interface.

## Phase 4: Skill mutation framework

Allow tree nodes and hybrid effects to mutate skills without making duplicate skills.

## Phase 5: Skill tree rewrite

Replace stat-heavy branches with the new behavior-driven paths.

## Phase 6: Cross-path interaction layer

Implement hybrid unlock evaluation independently of the base tree node evaluation.

## Phase 7: Mythic archetype layer

Add three-path or deeper build identities after the two-path system is stable.

## Phase 8: First reference classes

Before refactoring all 23 classes, build a small vertical slice using very different archetypes:

1. Juggernaut
2. Magician
3. Necromancer
5. Trickster
6. Bard

These six stress-test tanks, casters, summons, raid mechanics, deception, and support.

## Phase 9: Migrate remaining classes

Migrate one class at a time while preserving the same generic skill framework.

## Phase 10: Raid testing

Create encounter test rooms specifically for:

- tank swaps
- telegraphs
- spread mechanics
- group stacking
- adds
- priority targets
- ranged positioning
- displacement
- movement checks
- defensive cooldown checks
- healing checks
- utility checks
- resurrection / recovery

---

# 34. Recommended Developer Rules for Claude Code

Before writing code for a new class or skill:

1. Read this document completely.
2. Inspect the current combat, skill, modifier, and class architecture.
3. Identify reusable primitives before adding class-specific logic.
4. Never solve a data problem by adding more hard-coded branches.
5. Treat skill tags and status interactions as reusable systems.
6. Prefer a generic trigger / modifier / mutation mechanism over duplicated skills.
7. Do not reintroduce cross-class skill overlap merely because an implementation already exists.
8. Do not rename an old generic skill and assign it to a new class; create behavior that belongs to the class.
9. Preserve class fantasy before preserving legacy numbers.
10. Add tests for resource generation, cooldown interactions, status stacking, skill mutation, tree prerequisites, hybrid unlocks, and edge cases.
11. Keep the game playable during migration where practical; use compatibility adapters if necessary instead of mixing old and new architectures in every new feature.
12. Treat this document as a design source of truth, but when implementation constraints conflict with it, surface the conflict explicitly before making a large architectural compromise.

---

# 35. Final Design Standard

The desired player experience is:

> “I chose the class.”
>
> “I chose the path.”
>
> “I discovered a hybrid.”
>
> “My skills changed because of my build.”
>
> “My ultimate expresses that build.”
>
> “My party knows what I bring to the raid.”
>
> “Another player on the same class can be doing something completely different.”

The roster should feel less like 21 fixed characters with interchangeable spells and more like **21 combat engines capable of producing dozens of meaningful builds each**.

The most important design principle is simple:

> **The class defines the verbs. The tree changes the grammar. The hybrid system creates the build.**
