# Game UAT Notes — Post-Playtest Update Specification

## 0\. Overall Direction

The current build is fun and has a strong foundation, but the playtest exposed several problems with progression pacing, combat variety, difficulty scaling, extraction, and long-term progression.

The immediate goal is **not** to add every system at once. The game should be updated incrementally, with each major system implemented and tested independently.

### Highest-Level Problems Identified

1. Multiplayer is currently unreliable/broken.
2. Standard monsters become repetitive very quickly.
3. Players become overpowered too early.
4. Difficulty scaling does not keep pace with player power.
5. There is currently not enough distinction between normal monsters, elites, and bosses.
6. The current win/extraction condition is too simplistic.
7. Ultimate generation is currently exploitable/broken.
8. Item presentation in the UI needs a substantial visual/UX pass.
9. There is not enough long-term progression beyond the normal class progression loop.
10. The game needs a stronger endgame structure capable of supporting rare items, repeated farming, raids, dungeons, and build progression.
11. Crafting/forging needs to become a meaningful late-game system instead of a basic equipment interaction.
12. Named items need to be data-driven and easy to add without creating bespoke systems every time.

# PHASE 1 — Core Stability & Immediate UAT Fixes

These should be addressed before major new content is layered on top.

## 1\. Fix Multiplayer

### Problem

Multiplayer currently does not function reliably enough and should be treated as a high-priority blocker. Only the host experiences smooth gameplay – we'll need to explore different options to reliably enjoy a smooth experience as the nature of the game is very fast paced and challenging – one lag spike, one frame drop, and you die. Additionally, you cant use all the keys when typing in your name or the room code, and the intention of multiplayer was to just join the room – then the host uses the portals already in the room to decide what the party will fight. Ie. The following flow:

- 1. Host a room
  2. Player join the room
  3. Both player can freely navigate the ship
  4. Host enters portal of their choice, ie. Abyssal Rifts
  5. Host confirms the rift
  6. Player walks to the rift
  7. Both players begin the rift.

### Requirements

Audit the existing multiplayer implementation and identify:

- Connection issues
- Player synchronization issues
- Monster synchronization
- Damage/state synchronization
- Skill/projectile synchronization
- Loot synchronization
- Item pickup synchronization
- Portal/extraction synchronization
- Floor progression synchronization
- Boss state synchronization
- Player death/revive synchronization
- Host/client state mismatches
- Desync caused by procedural generation
- Players joining/leaving mid-run
- Disconnect/reconnect behavior

### Desired Outcome

Multiplayer should produce the same logical game state for every player.

The game should have a clear authoritative source for:

- Enemy state
- Player state
- Damage
- Loot
- Floor completion
- Elite/boss state
- Portal state
- Extraction state

### UAT Acceptance Criteria

A multiplayer run should be considered stable when:

- All players see the same enemies.
- All players see the same enemy deaths.
- Damage is synchronized correctly.
- Loot appears consistently for all appropriate players.
- Floor-clear state is synchronized.
- Portals appear consistently.
- Bosses behave consistently for all players.
- Players cannot exploit desync to duplicate items or rewards.
- A disconnected player cannot permanently break the run.
- A player leaving the game does not corrupt the remaining players' run.

# PHASE 2 — Combat & Monster Variety

## 2\. Monster Variety Overhaul

### Problem

Normal monsters currently become repetitive too quickly.

The solution should not simply be "more monster models." Monsters need to become mechanically distinct.

The player should encounter enemies that force different responses.

### Desired Monster Design Philosophy

Each monster type should have an identifiable combat purpose.

Examples:

- Swarm enemies
- Fast melee enemies
- Ranged enemies
- Snipers
- Tanks
- Shielded enemies
- Chargers
- Area denial enemies
- Summoners
- Support/healer enemies
- Exploding enemies
- Crowd-control enemies
- Anti-melee enemies
- Anti-ranged enemies
- Highly mobile enemies
- Monsters that manipulate the battlefield

The important part is that encountering different enemies should change how the player approaches the fight.

# 3\. Monster Affixes / Unique Traits

Introduce a system where monsters can receive modifiers/affixes that change their behavior.

Take inspiration from systems such as Risk of Rain 2 and Path of Exile 2

### Example Affixes

#### Defensive

- Increased armor
- Damage resistance
- Shield generation
- Temporary invulnerability
- Projectile resistance
- Crowd-control resistance

#### Offensive

- Increased damage
- Faster attack speed
- Increased movement speed
- Chain lightning
- Burning attacks
- Poison attacks
- Freeze attacks
- Bleed attacks

#### Behavioral

- Invisible
- Teleports
- Charges the player
- Runs away and summons reinforcements
- Creates hazards
- Splits into multiple monsters
- Summons minions
- Steals buffs
- Disables certain player mechanics

#### Anti-Player

- Anti-heal
- Dodge reduction
- Ability cooldown increase
- Reduced movement
- Resource drain
- Shield breaking
- Healing received reduction

#### Death Effects

- Explodes on death
- Leaves a damaging pool
- Spawns smaller enemies
- Fires projectiles
- Creates a temporary hazard
- Heals nearby enemies

### Design Goal

Affixes should create moments where the player recognizes:

"Oh shit, this monster has THAT modifier."

Not every enemy should have an affix.

Affixes should be relatively uncommon in normal gameplay and become progressively more common/dangerous at higher difficulty levels.

### Important

Affixes need to be implemented as a **modular system**.

Adding a new monster modifier should ideally involve defining:

- Modifier ID
- Name
- Description
- Visual indicator
- Gameplay behavior
- Difficulty weighting
- Spawn restrictions
- Synergy rules

rather than hard-coding each modifier into individual monsters.

# 4\. Elite Monsters

Introduce **Elite Monsters** as a new enemy tier.

### Purpose

Elites should serve as miniature boss encounters.

They should be:

- Rare
- Immediately recognizable
- Significantly stronger than normal enemies
- Mechanically distinct
- Worth killing
- Dangerous enough that players may need to change their strategy

### Elite Design

An Elite can have:

- Increased health
- Increased damage
- Unique abilities
- Multiple monster affixes
- Unique visual effects
- Larger model/sprite
- Distinct health bar
- Elite-specific attack patterns

### Difficulty

The goal is explicitly:

**Elites should be hard as fuck.**

A player who encounters an elite should not treat it as another normal mob.

### Elite Rewards

Elites should eventually contribute toward:

- Floor-clear progress
- Experience
- Currency
- Better loot
- Endgame progression
- Potential special drops

Elite rewards should scale with difficulty.

# PHASE 3 — Floor Completion & Extraction

# 5\. New Floor Win Condition

The current floor structure should be changed from simply reaching an endpoint to **actually clearing the floor**.

### New Objective

The floor is considered complete when the required enemies are defeated.

At minimum:

Kill all required monsters + kill the required number of elites (if any).

### Difficulty Scaling

Different difficulty levels should modify the completion requirement.

Example:

**Normal**

- Kill all monsters
- Kill 0–1 elites

**Challenger + Higher Difficulties**

- Kill all monsters
- Kill X elites
- Kill all monsters
- Kill progressively more elites
- Potentially introduce additional completion mechanics (cool shit like stopping a ritual)

# 6\. Portal / Extraction System

There should be two distinct portal concepts.

### Original Entrance Portal

The portal where the player entered the floor remains in its original location.

It exists throughout the run.

### Completion Portal

A new portal should spawn when the floor is cleared.

This can happen:

- When the final required monster dies

The completion portal should become the primary way to leave the floor after completing it.

## Early Extraction

Players should technically be able to leave early using the original entrance portal.

However, leaving early must carry a **HEFTY penalty**.

### Early Extraction Consequences

Leaving before clearing the floor should:

- Significantly reduce rewards
- Prevent extraction of items
- Potentially forfeit some/all progression earned during the floor
- Clearly communicate the penalty before confirmation

The important rule:

**You cannot safely dip out of a dangerous floor and keep all of the valuable loot.**

This should create meaningful risk/reward decisions.

### Desired Player Behavior

Players should have moments like:

"We have insane loot, but there are three elites left. Do we risk finishing the floor or take the penalty and leave?"

This is a core part of the intended gameplay loop.

# PHASE 4 — Progression & Difficulty Rebalance

# 7\. Slow Down Player Power Growth

### Current Problem

Players become overpowered far too quickly.

Within approximately the first 10 minutes of playing a class, a player can often max out one complete branch/path of the skill tree.

This causes:

- Early builds to become too complete
- Less meaningful decision-making
- Less reason to continue progressing
- Difficulty to fall behind player power
- Later content to lose impact

### Required Change

Reduce the rate at which players:

- Gain XP
- Level up
- Unlock skill nodes
- Acquire extremely strong upgrades

The player should feel increasingly powerful, but the power curve should be much slower.

### Desired Progression Philosophy – see classes.md for coming changes to class system

Early run:

"I am building my character."

Mid run:

"My build is coming together."

Late run:

"Holy shit, this build is becoming ridiculous."

Current behavior is closer to:

"I'm basically done with my build."

within the first section of the game.

# 8\. Monster Difficulty Increase

Simply slowing player progression is not enough.

Monster power also needs to increase.

### Current Problem

Players frequently have to manually increase the Challenger setting very early because standard enemies stop presenting enough challenge.

Meanwhile, bosses on the higher difficulty setting feel substantially more challenging than normal floor enemies.

This creates a major difficulty curve mismatch.

### Desired Result

Normal floor combat should approach the difficulty level of bosses.

Bosses should still be harder, but standard combat should no longer feel trivial in comparison.

### Monster Scaling Should Increase

Potential scaling dimensions:

- Health
- Damage
- Movement speed
- Attack frequency
- Ability frequency
- Crowd-control resistance
- Number of monsters
- Affix frequency
- Elite frequency
- Monster composition

Do not solve this exclusively by inflating HP.

Monster behavior and composition should contribute heavily to difficulty.

# 9\. Rebalance the Challenger Setting

The Challenger setting currently becomes almost mandatory too early.

The goal should be for the default difficulty to remain interesting for a meaningful portion of the run.

Challenger should then represent a legitimate escalation rather than something players are expected to turn on immediately.

### Desired Difficulty Curve

Default difficulty:

- Challenging early
- Increasingly difficult throughout the floor
- Builds toward boss-level combat

Challenger:

- Significantly more dangerous
- More elites
- More affixes
- More dangerous monster compositions
- Better rewards

Higher difficulty:

- Endgame-level combat
- Extremely dangerous combinations
- Stronger rewards
- Additional mechanics where appropriate

# 10\. Ultimate Generation Fix

### Problem

Players can currently generate their Ultimate using the Ultimate itself.

This creates a feedback loop that allows Ultimate usage to become effectively self-sustaining.

That is currently too powerful / broken.

### Rule

**An Ultimate should not generate Ultimate charge.**

Ultimate activation itself should provide zero progress toward the next Ultimate unless explicitly modified by a future mechanic that has been intentionally designed around this rule.

### Important

This does NOT mean Ultimate spam should never be possible.

It should be possible for dedicated builds to eventually achieve extremely fast Ultimate generation.

That power should come from:

- Skill tree nodes
- Items
- Relics
- Named items
- Class-specific mechanics
- Other deliberate build investments

The distinction is:

**Bad:**  
Ultimate → generates Ultimate → Ultimate → generates Ultimate

**Good:**  
Build investment → dramatically faster Ultimate generation → frequent Ultimate usage

This creates an intentional build archetype instead of an accidental infinite loop.

# PHASE 5 — UI / UX Overhaul

# 11\. Stash UI Rework

The stash needs a substantial visual cleanup.

### Current Problem

The interface is too small / difficult to parse and does not sufficiently communicate what items actually are.

### Desired Changes

- Increase item display size
- Improve spacing
- Improve readability
- Use item images/icons
- Reduce visual clutter
- Improve rarity identification
- Improve hover information
- Make equipment easier to compare
- Improve overall organization

### Critical Requirement

The stash item image should correspond to the **actual item image displayed when opening loot boxes/chests**.

The same item should visually appear to be the same item everywhere.

# 12\. Hero / Character UI Rework

The Hero page should display the player's character as the centerpiece.

### Desired Layout

Character in the center.

Equipment slots arranged around the character.

Example conceptual layout:

- Helmet
- Chest
- Gloves
- Boots (will be added in the future)
- Weapon
- Off-hand (will be added in the future)
- Rings
- Amulet
- 3 Artifact/Relic Slots (will be added in the future)

Each slot should display the actual item image.

### Requirements

The equipment shown on the Hero page should correspond directly to the items obtained through:

- Chests
- Loot
- Named drops
- Crafting
- Other acquisition systems

The UI should make the character feel like an actual RPG character rather than a collection of spreadsheet entries.

# PHASE 6 — Long-Term Endgame

# 13\. Endgame Class Completion

Introduce an ultimate completion condition for each class.

### Concept

A player can eventually achieve **100% completion of a class**.

This should require defeating an extremely difficult endgame encounter / final boss.

### Reward

After defeating the class's final boss:

- The class name receives a **gold border**
- The class is visually marked as completed
- Potentially unlocks additional cosmetic/status rewards

This gives players a clear:

"I mastered this class."

goal.

# 14\. Final Boss / Delve Concept

One possibility is for the final boss/endgame class completion to be tied directly into the Delve system.

This should be explored before implementing a completely separate system.

Potential structure:

**Normal Progression** → Floors  
→ Deeper Delve content  
→ Increasing difficulty  
→ Endgame boss

or:

**Class Completion** → Delve to the bottom  
→ Defeat the final boss  
→ Gold-border the class

The final structure should connect naturally to the game's world/lore.

# 15\. Raid Bosses

Introduce large-scale raid encounters designed for **4-20+ players**.

### Structure

Raid bosses should be:

- Weekly events
- Extremely difficult
- Designed for large groups
- Mechanically complex
- A significant community/social event

### Rewards

Raid bosses should drop unique named items.

These items should not simply be generic randomized loot.

Instead:

Boss X has a chance to drop Item Y and Item Z.

### Named Item Philosophy

A specific boss should be the exclusive source of a specific named item.

Example:

**Storm Tyrant**

- Item: Tempest Reaver
- Item: Eye of the Storm

Those items cannot be obtained through normal gameplay.

This gives players a reason to repeatedly farm specific bosses especially if the players are going for a specific build

# 16\. Raid Drop Rarity

Raid bosses should have tiers of difficulty.

Higher difficulty should affect:

- Drop rarity
- Drop chance
- Number of possible drops
- Potential item power
- Special variants

The hardest bosses should contain some of the most desirable equipment in the game.

# 17\. Daily & Weekly Dungeons

Add two recurring activity types.

### Daily Dungeon

- Resets daily
- Smaller-scale
- Reliable source of progression/resources
- Potentially has rotating modifiers

### Weekly Dungeon

- Resets weekly
- Significantly harder
- Better rewards
- More specialized mechanics
- Potentially tied into seasonal/endgame progression

Both should eventually have:

- Clear rewards preview
- Unique mechanics
- Difficulty modifiers
- Specific loot tables

# PHASE 7 — Universal Progression

# 18\. Universal Skill Tree

Add a second skill tree available to **every class**.

The existing class skill tree remains class-specific.

The new tree is universal.

### Purpose

This tree should primarily contain basic character improvements.

Examples:

- Move speed
- Dodge cooldown
- Health
- Resource generation
- Basic damage
- Defense
- Loot-related bonuses
- Pickup radius
- Cooldown reduction
- Movement utility

### Design Philosophy

This should not replace the class tree.

The class tree answers:

"How does my class/build work?"

The universal tree answers:

"How does my character fundamentally improve?"

### Structure

Use a node-based structure inspired by Path of Exile.

There should be meaningful paths and tradeoffs rather than a simple list of upgrades.

# PHASE 8 — Relics & Artifacts

# 19\. Relic & Artifact System

Introduce **Relics** and **Artifacts** as two tiers of extremely rare, permanent progression items.

Both are equipped to the character and provide effects that persist beyond an individual run.

They should sit above normal equipment in terms of rarity and importance, but they serve different purposes:

**Artifacts** = rare Abyssal rewards that provide meaningful but limited power.

**Relics** = exceptionally rare endgame rewards that can fundamentally alter a build.

## Relics

Relics are the highest tier of permanent progression outside of any potential future system above them.

### Core Concept

Relics are:

- **Extremely rare**
- Primarily obtained from raids and high-level endgame content
- Permanently meaningful
- Equipped to enhance a class or build
- Significantly more impactful than normal equipment
- Often build-defining rather than simply stat increases
- Intended to be long-term chase items

There should be approximately **20 Relics at launch**.

### Relic Power

Relics should represent major build investment.

A Relic should ideally make the player think:

**"This changes how my build works."**

They should not simply provide small statistical bonuses such as:

+5% damage

Instead, they should introduce powerful effects, new interactions, or entirely new build possibilities.

### Example Relics

#### Spark of \[Endgame Lightning Boss\]

Affix all equipped weapons with Lightning.

This could create an entirely new elemental build direction.

#### Hermes Boots

+10% Move Speed  
Gain an additional Dodge.

A strong mobility-focused Relic that meaningfully changes how the character moves and survives.

### Relic Acquisition

Relics should primarily be tied to high-end content.

Examples:

- Defeat a Lightning raid boss → Lightning-themed Relic
- Complete difficult Tower content → Mobility Relic
- Defeat a Hell-themed endgame boss → Fire/Infernal Relic
- Complete Heaven-themed endgame content → Holy/Light Relic

Relics should have identifiable sources so players can deliberately pursue the ones they want.

# Artifacts

Artifacts are a second tier below Relics.

They should still be **rare as hell**, but more obtainable than Relics and primarily associated with **Abyssal content**.

### Core Concept

Artifacts are:

- **Very rare**
- Approximately **half as rare as Relics**
- Primarily obtained through Abyssal content
- Permanently meaningful
- Equipped to enhance a class/build
- Significantly stronger than normal equipment
- Deliberately weaker than Relics
- Intended to provide meaningful build enhancement without completely defining the build

There should be approximately **30 Artifacts at launch**.

### Artifact Power

Artifacts should provide roughly **one-third of the gameplay impact of a Relic**.

This does not necessarily mean exactly one-third of a numerical stat value.

The distinction should primarily be felt in **how transformative the effect is**.

A Relic might completely change a build's core mechanic.

An Artifact might:

- Enhance that mechanic
- Provide a weaker version of the effect
- Improve a specific playstyle
- Provide useful utility
- Add a smaller secondary effect
- Act as a stepping stone toward stronger endgame progression

### Artifact Design Philosophy

Artifacts should feel like:

**"Holy shit, I actually got one."**

but Relics should feel like:

**"HOLY SHIT, I actually got one."**

Artifacts should be exciting enough that players actively pursue them, while still leaving substantial room for improvement through Relics.

### Artifact Acquisition

Artifacts should primarily come from **Abyssal content**.

Examples:

- Abyssal bosses
- Deep Abyssal floors
- Abyssal events
- Abyssal-specific challenges
- High-tier Abyssal activities

Artifacts should have identifiable sources where practical, allowing players to target specific items.

# Relic vs. Artifact Hierarchy

|                 | Artifacts                    | Relics                                       |
| --------------- | ---------------------------- | -------------------------------------------- |
| Rarity          | Very Rare                    | Extremely Rare                               |
| Primary Source  | Abyssal                      | Raids / Endgame                              |
| Launch Quantity | ~30                          | ~20                                          |
| Power           | ~1/3 Relic                   | Highest Tier                                 |
| Build Impact    | Meaningful                   | Build-Defining                               |
| Acquisition     | Difficult                    | Extremely Difficult                          |
| Purpose         | Strong permanent progression | Major long-term chase / build transformation |

The intended progression is:

**Normal Equipment**  
↓  
**Abyssal Content**  
↓  
**Artifacts**  
↓  
**High-End Endgame Content**  
↓  
**Relics**

This creates a natural hierarchy where Artifacts are desirable long-term upgrades while Relics remain the truly aspirational chase.

# Shared Design Rules

Both systems should follow several core rules.

### 1\. Permanent Progression

Relics and Artifacts should remain equipped and meaningful outside of individual runs.

They are not temporary run buffs.

### 2\. Build Identity

The strongest effects should interact with specific playstyles, mechanics, skills, elements, or systems.

### 3\. Avoid Generic Stat Sticks

Whenever possible, an Artifact or Relic should do something interesting rather than simply providing:

- More damage
- More health
- More armor
- More crit

Pure stat bonuses can exist, but they should be the exception rather than the identity of the system.

### 4\. Clear Acquisition

Players should be able to determine:

**"Where does this drop?"**

for every Artifact and Relic.

This should eventually tie directly into the endgame loot preview system.

### 5\. Chase Value

Obtaining every Artifact and Relic should be a substantial long-term progression goal.

The game should intentionally support players having:

"I still need THAT one."

as a reason to continue playing specific endgame activities.

# 20\. Endgame Drop Previews

Whenever an endgame activity has specific obtainable rewards, players should be able to preview them.

This should apply to:

- Raid bosses
- Dungeons
- Endgame bosses
- Tower floors
- Delve content
- Special events
- Named-item sources

### UI Example

**Storm Tyrant — Loot**

Possible Rewards:

- Tempest Reaver
- Eye of the Storm
- Spark of the Storm Tyrant
- Other materials

The purpose is to clearly communicate:

"I want X item, and this is where I get it."

This is essential for a long-term farming game.

# PHASE 9 — World / Story / Tower Structure

# 21\. Titan Rush / Tower Climbing Inspiration

Add a tower-climbing/endless ascent system inspired by Titan Rush.

The player progressively climbs the tower and fights increasingly dangerous encounters.

### Story Integration

The tower should directly connect to the game's overarching story.

Potential premise:

Heaven and Hell are engaged in an enormous war.

The player exists within the conflict.

### Two Directions

**Delve downward**  
→ Keep Hell at bay.

**Ascend upward**  
→ Keep Heaven at bay.

This creates a thematic duality:

### Downward = Hell

- Increasing corruption
- Demonic enemies
- Dangerous environments
- Deeper/more hostile content

### Upward = Heaven

- Celestial environments
- Holy enemies
- Different mechanics
- Different rewards

# 22\. Rifts / War Concept

The existing Rift system should eventually be incorporated into this world structure.

Potential lore:

Rifts occur because the war between Heaven and Hell is tearing reality apart.

Instead of treating Rifts as a disconnected gameplay mechanic, they should be a consequence of the world's central conflict.

# 23\. Planets / Materials / Progression Layers

The current planets/material structure may need to be reconsidered.

Instead of having disconnected planets that simply represent different content tiers, investigate whether the world can instead be structured around **layers/unlocks**.

Potential progression:

**Surface** ↓  
**Deep Delve** ↓  
**Hell Layers** ↓  
**Hell Endgame**

and

**Tower Base** ↓  
**Heaven Layers** ↓  
**Celestial Endgame**

The exact world structure is still TBD.

The important goal is for the progression architecture to support both:

- Descending toward Hell
- Ascending toward Heaven

while making those systems feel like two halves of the same war.

# PHASE 10 — Forge & Crafting

# 24\. Forge Overhaul

The Forge should eventually become a major progression system.

The current forge/crafting system should be considered a foundation that needs significant expansion.

### Core Concept

Powerful items can become crafting materials themselves.

For example:

Boss Drop X  
\+ Material A  
\+ Material B  
\+ Material C  
\+ 10 Divine Items  
\= Hyper-Rare Named Sword

This gives otherwise-unused items value.

Instead of:

"I already have this legendary sword."

the player can think:

"I need this legendary sword because it is a component of something even stronger."

# 25\. Named Item Crafting

Certain named items should be:

- Direct drops
- Craft-only
- Boss-specific
- Quest-specific
- Endgame-specific

This creates different acquisition paths.

Some of the strongest items should require multi-step crafting processes.

# 26\. Reforging

Add a Reforge system.

Reforging should allow players to alter existing items.

### Reforge Capabilities

At minimum:

- Reroll stats
- Manipulate skill slots
- Potentially modify certain affixes
- Potentially improve/reduce stat values within defined ranges

### Cost

Reforging should require:

- Materials
- A large amount of coins

The cost should scale aggressively with rarity.

Example:

Common:

Cheap

Rare:

Moderate

Epic:

Expensive

Legendary:

Very expensive

Named/Endgame:

Extremely expensive

The purpose is to make high-end item optimization a meaningful resource sink.

# 27\. Crafting Currency

Consider introducing a dedicated crafting currency system inspired by Path of Exile.

However:

### Do NOT overcomplicate this initially

Start with a small, understandable system.

Potentially introduce only a few currencies initially, each with a very clear purpose.

For example:

- Currency for rerolling stats
- Currency for modifying slots
- Currency for high-tier crafting

The system can expand later.

# PHASE 11 — Modular Named Item Architecture

# 28\. Data-Driven Named Item Creation

Named items need to be easy to create and maintain.

The goal should be:

Create item → define behavior → define acquisition → add image → done.

Develop a modular system for this.

### Desired Workflow

A developer should be able to:

### Step 1 — Create Item Definition

Create a file/data entry containing:

- Item ID
- Name
- Description
- Rarity
- Base stats
- Custom stats
- Skill behavior
- Projectile behavior
- Passive effects
- Special logic
- Crafting requirements
- Drop source

### Step 2 — Define Acquisition

Specify:

- Boss drop
- Raid drop
- Dungeon drop
- Crafted
- Quest reward
- Event reward
- etc.

Example:

StormTyrantSword → StormTyrantRaidBoss

### Step 3 — Add Image

Place the corresponding image in the repository.

### Step 4 — Map Image to Item

The item definition references the image.

### Step 5 — Done

The item automatically appears correctly throughout the game:

- Loot
- Chests
- Stash
- Hero UI
- Drop previews
- Crafting UI
- Item tooltips

Essentially – I should be able to make a kickass sword that can shoot tornadoes and chain lightning every enemy in a room.

# 29\. Named Item System Requirements

Named items need to support custom behavior without requiring a unique code architecture every time.

The system should support:

### Basic

- Base damage
- Attack speed
- Crit
- Health
- Defense
- Movement speed
- Resource modifications

### Skill Effects

- Modifies existing skill
- Adds projectile
- Changes projectile behavior
- Adds secondary effect
- Changes cooldown
- Changes resource cost

### Passive Effects

- On hit
- On kill
- On dodge
- On damage taken
- On Ultimate
- On skill use
- On enemy death

### Advanced Effects

Eventually:

- New projectiles
- New attack patterns
- Unique interactions
- Area effects
- Summons
- Special transformations

The initial implementation should support **basic mechanics first**.

Do not attempt to solve every possible named-item behavior before the content pipeline is proven.

# PHASE 12 — Recommended Implementation Order

The above should NOT be implemented randomly.

The suggested order is:

## Chunk 1 — Fix Existing Systems

1. Multiplayer
2. Ultimate generation exploit
3. Basic progression rebalance
4. Monster difficulty scaling

### Goal

Get the existing core loop functioning correctly before adding more systems.

## Chunk 2 — Improve Core Combat

1. Monster variety
2. Monster affix system
3. Elite monsters
4. Challenger difficulty rebalance

### Goal

Make a normal floor genuinely fun and dangerous.

## Chunk 3 — Floor Completion Loop

1. New floor-clear condition
2. Required elite kills
3. Completion portal
4. Early extraction penalties
5. Item extraction restrictions

### Goal

Create the fundamental risk/reward floor loop.

## Chunk 4 — UI

1. Stash redesign
2. Item images
3. Hero/equipment screen redesign
4. Consistent item visuals across all systems

### Goal

Make the RPG progression visually understandable.

## Chunk 5 — Universal Progression

1. Universal skill tree
2. Node-based structure
3. Basic stat progression

### Goal

Create progression that exists independently of class identity.

## Chunk 6 — Endgame Foundation

1. Endgame class-completion boss
2. Gold class border
3. Daily dungeon
4. Weekly dungeon
5. Endgame reward previews

### Goal

Create the first actual endgame loop.

## Chunk 7 — Named Item Architecture

1. Modular item definitions
2. Image attachment system
3. Named drop tables
4. Named item loot previews
5. Basic unique item behaviors

### Goal

Make adding new endgame content cheap and scalable.

## Chunk 8 — Crafting

1. Forge overhaul
2. Reforging
3. Stat rerolling
4. Skill-slot manipulation
5. Crafting materials
6. Basic crafting currency system
7. Multi-item crafting recipes

### Goal

Create long-term item optimization.

## Chunk 9 — Relics

1. Relic system
2. Initial ~20 relics
3. Relic equip system
4. Relic acquisition tables
5. Endgame-specific relics

### Goal

Create extremely rare build-defining progression.

## Chunk 10 — Raids

1. Raid framework
2. Large-group synchronization
3. Raid boss mechanics
4. Weekly scheduling
5. Raid-specific loot tables
6. Named boss-exclusive items
7. Raid relics

### Goal

Create the game's major social endgame.

## Chunk 11 — World / Tower / Delve

1. Tower climbing
2. Delve progression
3. Heaven/Hell thematic split
4. Rift lore integration
5. Endgame layer progression
6. Planet/material restructuring

### Goal

Unify the gameplay systems into a coherent endgame/world structure.

# Final Design Principles

These should guide all future implementation.

## 1\. Power should be earned

The player should become absurdly powerful eventually, but reaching that point should take meaningful progression.

## 2\. Difficulty should remain relevant

Players should not immediately outscale the environment.

## 3\. Monsters need mechanics, not just bigger numbers

An enemy with 10x HP is not inherently more interesting.

## 4\. Elites should create memorable encounters

Seeing an elite should immediately change player behavior.

## 5\. Endgame items should have identity

A named sword should be something players know, remember, and intentionally farm.

## 6\. Items should have clear acquisition paths

Players should be able to answer:

"Where do I get this?"

without guessing.

## 7\. Rare items should matter

Relics and high-end named items should materially change builds.

## 8\. Systems should be modular

New:

- Monsters
- Affixes
- Elites
- Named items
- Relics
- Bosses
- Dungeons

should be inexpensive to add.

## 9\. Avoid premature complexity

Especially for crafting and currency.

Start with a small, clear system and expand it once the foundation works.

## 10\. Everything should feed the core loop

The long-term loop should eventually feel like:

**Enter Content**  
→ **Fight Dangerous Monsters**  
→ **Build Character During Run**  
→ **Defeat Elites**  
→ **Clear Floor**  
→ **Risk Extraction**  
→ **Acquire Loot**  
→ **Upgrade Character**  
→ **Pursue Specific Named Items**  
→ **Craft/Reforge Gear**  
→ **Attempt Harder Content**  
→ **Defeat Endgame Bosses**  
→ **Acquire Relics / Rare Named Items**  
→ **Push Further**

The player should always have a meaningful reason to ask:

**"What am I trying to get stronger for?"**

The answer should eventually be:

**"The next thing that can absolutely fuck me up."**