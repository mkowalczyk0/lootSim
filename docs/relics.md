# Relics and Artifacts — UAT §19

The working record for the relic system: what a relic is in this codebase, why it is
built on the tree's vocabulary rather than a new one, how the two tiers are kept
distinct, where every one of them drops, the slot rule, and what the acceptance gate
holds it to.

Proven by `npm run relics` (`tools/relics.ts`), wired into `npm test`. The named-item
pipeline (`docs/named-items.md`) is the sibling system; the two share a drop table.

## What a relic is

**A tree node you wear.** A `RelicDef` (`src/data/relics.ts`) is an id, a name, a tier,
two lines of prose, a list of `NodeEffect`s and a list of sources. `Player.build` folds a
worn relic's effects into the class's `ResolvedBuild` through `foldEffects` — the same
door a tree node, a hybrid, a Mythic Archetype and a worn named item all go through — and
the dungeon reads one build. `applyBuild`, `runBuildGrants` and the rule hooks never ask
"is this a relic". There is no `switch` on a relic id anywhere, and the gate would catch
one indirectly: a relic whose behaviour lived in bespoke code would have no effect that
resolves against the roster.

It is **not** an `Item`. No slot, no base block, no affixes, no rarity multiplier, no
sell price. That is the one place the design differs from a named item and the reason it
differs from `NamedEffect`:

| | named item | relic |
|---|---|---|
| what it is | a definition that forges an ordinary `Item` | a definition, full stop |
| its stats | the affix list (`mods` on the `Item`) | `{ kind: "mods" }` effects |
| its behaviour | `NamedEffect` = `NodeEffect` minus `mods` | the full `NodeEffect` |
| where it lives | a gear slot, the stash, the Forge | three relic slots, an account collection |
| how it drops | forged at the floor's item level | as itself |

A named item drops `mods` from its effect vocabulary because its stats already have a
home on the sheet. A relic has no such home, so `mods` comes back — and Hermes Boots'
"+10% move speed, gain an additional dodge" can be written as data. Rule 3 of the spec
("avoid generic stat sticks") is therefore enforced as a **test**, not a type:

- every relic-tier definition carries at least one effect that is not `mods`;
- a definition that is honestly only numbers is flagged `statStick: true`, and flagged
  definitions may be at most **a fifth** of the roster and never relic-tier;
- the roster must use `mods`, `mutate`, `grantEffect` *and* `rule`, and its passives must
  key on at least six different events or tags — one mechanic in thirty coats fails.

Today: 2 of 31 are stat sticks, both artifacts (Weight of the Fourth Circle, Step of the
Pilgrim).

## Two tiers, kept distinct

| | Artifact | Relic |
|---|---|---|
| count | 19 | 12 |
| presents as | divine | unspoken |
| source | the Abyssal Rift, and **only** the Abyssal Rift | the Proving, the Nameless at depth 25+, the depth-30 Delve cache, Abyss tier 8+ |
| power | "my build is better at what it does" | "this changes how my build works" |
| odds per source | mean ≈ 0.136 | mean ≈ 0.072 — asserted ≥ 1.5× apart, as a comparison |

The spec says artifacts are "rare Abyssal rewards" and relics come "primarily from raids
and high-end endgame content". Raids (§15) don't exist, so relics map onto what shipped:

- **The Proving** (`docs/class-completion.md`). Each element's relic drops from the
  Proving of any Legend of that element — a lightning Legend's Unfinished carries the
  Spark. LEGEND MASTERY in the worldbuilding says a Legend recovers "relics of their
  original life"; this is that, literally: the piece the Abyss kept. Eight relics, every
  class's Proving drops at least one (asserted).
- **The Nameless** at depth 25+ in the Delve (two relics) and the **clear cache from depth
  30** (Sandals of the Swift Messenger — the spec's Hermes Boots).
- **The Abyss's top tiers** — one relic from the boss that closes a tier-8+ Abyssal Rift.

Artifacts come from every Abyssal Rift boss (which one you meet is `bossFor(effective
depth)`, so the sources list all five with `mode: "abyss"`), from every Abyss clear cache
at low odds, and two from the cache that *closes* a rift (`lastFloor`). Some need a tier
(Echo and Chain from tier 3, Whisper from tier 5). Nothing artifact-tier drops outside
the Abyss; `tools/relics.ts` asserts every artifact source is `abyss`.

## Acquisition is the table — `src/data/drops.ts`

Named items were the first system to say "where does this drop?" as data. Relics are the
second, and rather than a second matcher the table machinery moved out of `named.ts`
into `drops.ts`, which both read:

- `DropSource` — what a definition declares. `FoundSource` is `boss | chest | clearCache |
  worldDrop` plus the reserved `raid | tower`; `CraftSource` is the Forge recipe a named
  item may carry and a relic may not.
- `DropQuery` — what a roll site or a preview asks. A site passes everything it knows
  (boss id, mode, tier, depth, whether this cache closes a rift); a source ignores what it
  doesn't care about.
- `sourceMatches` — **the one matcher.** `forSource` is the no-dice read, `rollTable` the
  dice, `dropChance` the §16 danger hook. `namedForSource` / `rollNamedDrops` keep their
  signatures and are one-line wrappers.

What the extraction added, once, for both tables: optional `mode` / `minTier` /
`minDepth` on a boss source and `mode` / `minTier` / `lastFloor` on a clear-cache source.
An Abyss tier-6 Colossus and the depth-15 Delve Colossus share a boss id; before this
they were the same source.

**No `proving` kind.** A Proving kill already reaches the table as a `boss` query whose id
is `legend-<classId>`. A second kind describing the same kill would be two matchers that
have to agree — exactly the double-count-or-show-nothing failure the §20 preview exists
to avoid. `provingSources` / `provingSourcesOf(element)` are *sugar* that build ordinary
boss sources, and `foundSourceLines` collapses a run of them into "Recovered from the
Proving of any lightning Legend (Lancer, Duelist, Corsair, Stormcaller)".

**The reserved seam.** `raid` and `tower` are typed, matchable and empty: no site emits
their queries, `LIVE_SOURCE_KINDS` says so, and `relicProblems` refuses a definition whose
only sources are reserved — so §15 and §21 hang their drops off the table without a
schema change, and nothing can hide behind the seam meanwhile. The worldbuilding's "Relic
— Spark of the Tyrant" is the seam's first customer, when there is a Tyrant to drop it.

**The composed read** (`src/data/drop-preview.ts`): `dropsForSource(q)` returns
`{ kind: "named" | "relic"; def; src }[]` — every table, the matched source on each row
so a consumer quotes odds and wording off `src` without reaching into a table. It is the
only place the tables are combined; a third table is one line. A `craft` source is not a
drop and never appears in it.

### The roll sites

Three lines in `game/dungeon.ts`, all through `dropFromTables`: a boss kill (`bossId`,
`mode`, `tier`, `depth`), a wave monster's death (`depth`, `elite`, `mode`) and the clear
cache (`depth`, `mode`, `tier`, `lastFloor`). Chests roll the named table only; no relic
has a chest source and the gate asserts it.

A relic drops as a **physical pickup** (`PickupKind "relic"`, glowing its tier's
presenting rarity), goes into the run's unbanked loot and is **lost on death and on the
penalty exit** like every item — never make death free. Banking puts it in the
account-wide collection (`GameState.relics`). It always takes the loot banner.

**The dupe skip.** For the local hero the roll skips what the account owns or is carrying
unbanked, so the chase never hands you a copy. A co-op host rolls blind for a remote hero
(it can't see their collection); a duplicate that reaches their save bumps
`stats.relicsFound` and adds nothing. Ash's single-source promise is untouched.

## Slots

Three (`RELIC_SLOTS`), on `Player.relics`, per character out of the account-wide
collection. **At most one relic-tier item is worn at a time** (`MAX_RELICS_WORN`);
artifacts fill the rest. Reasons, in order of weight:

1. two guaranteed artifact slots keep artifacts from going dead the day you own three
   relics — the "stepping stone" the spec describes stays a stone you stand on;
2. the relic is the build's keystone, the parallel to one Mythic Archetype;
3. the relic choice becomes a per-build decision, which is where Rule 5's "I still need
   THAT one" actually lives.

It is one constant and the owner may loosen it. `normalizeRelicLoadout` brings a save
back to legal on load and on the wire, so a loosening that is later reverted costs
nobody a crash: the extra relic comes off.

## The level gate — a relic answers to the floor it fell on

**This reverses an earlier call.** The paragraph here used to read *"No level gate. Relics
are account progression an alt inherits, the same call the universal tree made."* The owner
overturned it: a brand-new alt walking out of the Citadel wearing the account's best relic is
the same objection they have raised about every account-wide system, and the universal tree
is not actually the precedent it looked like — the universal *pool* is account-wide but its
allocation is per-class and it grants no abilities and flips no rules. A relic does both.

The rule: **a relic may only be socketed by a character at the level of the shallowest floor
that can pay it out.** All three slots, both tiers, no carve-outs. A softer variant that let
an alt wear low-tier artifacts immediately was offered and declined.

### The requirement is derived, never authored

`relicRequiredLevel(def)` in `data/relics.ts` reads the **drop table**. An item answers this
question from its own `ilvl` (`requiredLevel` in `game/item.ts`), because a drop's item level
already tracks the floor that produced it. A relic has no `ilvl` — no base block, no affixes,
nothing that scales — so the same question is asked of the only thing it does carry:

```
relicRequiredLevel(def) = min over live sources of sourceLevel(src), less one level of grace
sourceLevel(src)        = levelAdvice(sourceFloor(src).depth, sourceFloor(src).danger)
```

`levelAdvice` is the *identical* function behind `DepthProfile.recommendedLevel` — not a
second formula that can drift from it. `sourceFloor` (`data/drops.ts`) walks a `FoundSource`
to the shallowest run that satisfies it, and it is a **reading** of the configuration rather
than a second model of the world:

- `riftConfig`, `raidConfig` and `towerConfig` are *called* for the depth and danger they
  actually produce. No rift arithmetic is restated here, so a retuned `baseDepth` or
  `dangerPerTier` moves the gate with it.
- `bossFor` answers which encounter a rift floor spawns. `riftBossSources` writes all five
  Delve encounters out per rift, so "the Nameless, in the Abyss" is a far deeper ask than
  "the Choir, in the Abyss" — 31 against 11. Assuming a rift boss is whatever its lowest tier
  meets would have flattened five artifacts' requirements silently, and did, until a
  falsification caught it (see below).
- Every constraint on a source composes as a **maximum**, because `sourceMatches` composes
  them as a conjunction.

**Why derived rather than a `requiredLevel` field on `RelicDef`.** The same argument
`requiredLevel` itself makes, and the same one that put the execute threshold at its single
evaluation site: a field is thirty numbers to keep in step with thirty drop tables, could be
satisfied with `1`, and would be forgotten by the thirty-first definition. Derived, a relic
authored tomorrow is gated for free with no number for anyone to omit. The gate asserts the
absence of such a field positively.

**Danger is part of it; the Challenger dial is not.** A rift tier, a raid tier and a sector
tier are part of *where the thing drops* — the Abyss at tier 8 is a different place from the
Abyss at tier 1, and its relics ask 37 against 11. The Challenger dial is the opposite: it is
weather the player turns up themselves, and letting it through would mean a player could
raise their own relics' requirements by choosing a harder floor. It is excluded **by
construction** rather than by a subtraction — every config call above passes `challengerTier`
0, so there is nothing to divide back out.

**The grace is one level, and it is `requiredLevel`'s grace for `requiredLevel`'s reason.** A
floor's XP lands as its monsters die, so a character clearing the floor that pays a relic is
often a level short of that floor's advice at the moment it drops. Without the grace, the run
that earns a relic routinely could not wear it.

### It gates the socket, not the drop

An above-level relic still drops, still banks, and waits in the account-wide collection. The
account owns it; the character grows into it. That is the shape the shared stash already has,
and it is what keeps this from becoming a second, invisible rarity ceiling.

### What the numbers come out as

Artifacts land at **6–23**, relics at **13–36**. The two extremes are the Abyss's tier-1 clear
cache (`coin-of-the-first-circle`, depth 8, level 6) and its tier-8 boss
(`remnant-of-what-was-not`, depth 28 at danger 3.0, level 36). The tiers **overlap heavily**
and that is correct: the gate tracks where a thing drops, not what tier it is, so a relic off
a shallow Tower cache (`sandals-of-the-swift-messenger`, 13) asks less than a deep artifact.

### The migration

`SAVE_VERSION` 35. The save's *shape* does not change — `Player.relics` is the same array of
ids — but a previously legal loadout can become illegal, which is the only reason this needs
a version at all. `normalizeRelicLoadout(raw, level)` now takes the character's level,
unsockets what outranks it, and **returns what it took** (`RelicLoadout.unsocketed`).
`GameState.relicsUnsocketed` carries that to a one-time town notice, exactly as
`treePointsRefunded` already does for the class refactor: a migration players cannot see is
how trust in a save format dies. Nothing is lost — the relics stay in the collection and go
back on at level.

Only a *level* removal is reported. A duplicate, an unknown id or a cap violation comes out
silently as it always has, and the distinction is made by asking the same blocker a second
question ("would this have fit at its own level?") rather than by a second rule that could
drift — otherwise the town would tell a player to level up for something levelling will never
fix.

### Falsification

Six injected violations, against the checks in `tools/relics.ts` §7b. Five went red
immediately; **two did not, and both were real holes in the checks rather than in the code**:

| injection | first verdict | what it exposed |
|---|---|---|
| flatten the gate to level 1 | red | — |
| off-by-one in the blocker (`level + 1 < need`) | red | — |
| reject at exactly the required level (`level <= need`) | red | — |
| widen the grace to three levels | red | — |
| report every removal as a level removal | red | — |
| **divide danger back out of `sourceLevel`** | **green** | the "tier 8 asks more than tier 1" check was confounded: `depthPerTier` raises the depth too, so the comparison was carried by depth whether danger was read or not. Fixed by holding the depth still and comparing against `levelAdvice(depth, 1)` — the control it was missing. |
| **stop asking `bossFor` in the rift tier search** | **green** | nothing tested the search at all, so it could silently flatten five artifacts' requirements. Fixed by comparing two sources that name different encounters in the *same* rift at the *same* minimum tier, so mode and tier are held still and the encounter is the only variable. |

Both are the same lesson this repo keeps relearning and it is worth stating in its own right:
**a comparison needs a control, not just two numbers that differ.** Each of those checks was
a real comparison, phrased as a comparison, and green for a reason that had nothing to do with
what it claimed to measure. The one-sided-bound rule in `CLAUDE.md` says assert a design
promise as a comparison; the refinement here is that the comparison must vary *only* the thing
being asserted.

## The wire

`Player.relics` rides `playerToJSON`, which is both the save format and the co-op
payload — the host rebuilds a remote hero's build with the relics they're wearing, or it
would simulate a weaker character than the one on their screen. A relic on the floor
crosses the snapshot as a registry index (both ends run the same build) and the id itself
arrives reliably in a `got` message, exactly like an item.

## The one vocabulary extension: `dashCharges`

The spec's own example asks for "an additional Dodge", and nothing in `Mods` could say it.
`dashCharges` (flat, floored) is a new mod key; the dash became a stock of charges on the
avatar (`Avatar.dashStock`), refilled one at a time on the ordinary cooldown, with
`Player.dashCharges` as the cap. With the default cap of one it is the old single cooldown
to the tick. It landed as **its own commit**, before any relic content, because it touches
`moveHero`, the client's prediction step and the hero snapshot at once — the three things
the Sept 2026 client-prediction fix depends on. `tools/smoke.ts` runs the host/client rig
with the client wearing +1 charge and asserts both dashes are predicted the tick they're
pressed, the host runs the same two, a third press with an empty stock dashes on neither
end, and reconciliation never has to move the client.

No affix rolls `dashCharges`. The tree, a named item and a relic can all carry it; the
item score prices it so a future affix can't be misranked.

## The one relic rule

Rime of the Unfinished Vigil executes a chilled or frozen enemy under a quarter health.
That is one line in `EXECUTE_RULES` in `game/rules.ts`, the same table a Ranger or
Reaper keystone sits in; the engine does not know it came off a relic. Rule ids are
namespaced `relic.<id>.<name>` and may not borrow a class's prefix (asserted) — the roster
audit only walks class definitions and would never see a relic flipping a keystone.

## UI (unverified by eye — nobody here has a browser)

- **Hero** — the three locked relic slots from §12 are live. Selecting one shows what's
  in it (lore card: flavour, tier, description, effect lines, source lines) and the
  collection beneath it; the adjust keys walk the collection, confirm sockets the
  highlighted one or takes the worn one off, and every candidate row is clickable. A
  refused socket says why ("One Relic at a time. Artifacts fill the other slots.").
- **Records** — Relics and Artifacts lists, owned in tier colour and unowned in grey,
  each with its source line: the other half of the §20 seed.
- **In the dungeon** — a relic pickup is a tinted gem glyph until art lands
  (`relicArt`, atlas row `relic.<id>`), the HUD lists unbanked relics above the items,
  and picking one up takes the screen for the hero who found it.

## What the gate asserts (`tools/relics.ts`)

Rule 1 — a banked relic is on the account, survives a save round-trip and the wire, and
a worn one moves the sheet and the build. Rule 2 — every tag, status, event, mod key and
rule resolves; a worn Spark makes a physical skill strike as lightning through
`applyBuild`; a worn Tempo hastes on damage taken in a live dungeon. Rule 3 — as above,
plus the direct comparison: wearing every cosmetic moves nothing, socketing a relic moves
exactly its mods. Rule 4 — every definition has a live source, the preview read lists it
for its own source's query, `dropsForSource` composes both tables with the source on each
row and never lists a craft-only item, and the drop sites really ask: an Abyss boss pays
out every artifact it lists and no relic at tier 1, the same boss in the Delve pays no
artifact, The Unfinished Stormcaller drops the Spark and not the Cinder, the depth-30
cache holds the Sandals and depth 29 doesn't, the rift-closing cache holds what a mid-rift
cache doesn't. Rule 5 — artifacts ≥ 1.5× relics per source, a second kill never drops
what the account owns, bailing out forfeits an unbanked relic.

## Tuning notes

`RELIC_ODDS` in `data/relics.ts` is the dial. The Proving relic sits at 8% per clear; the
Proving is repeatable, so a class that wants its element's relic gets it in a dozen
clears on average — deliberately not one, deliberately not a hundred. Artifacts at 14–16%
per Abyss boss mean a tier's boss hands out one roughly every seventh kill, spread over
up to eleven candidates; a full artifact collection is a long Abyss career. Neither has
been playtested; the §6 comparison in the gate says when a retune breaks the tier ratio.

A relic's *effects* are live — retuning one lands on every copy ever banked, because a
relic has nothing baked. That is simpler than a named item's two lifetimes and worth
saying once: there is no "old Spark" anywhere.

## Not built — deliberately

- **A `proving` source kind.** See above; sugar instead.
- **Raid- or tower-sourced relics.** Reserved kinds, no roll sites, nothing shipped
  behind them.
- **Relic crafting, upgrading, salvaging.** A relic is found, never made or unmade.
  `relicProblems` refuses a craft source.
- **Three relics at once.** One constant if the owner wants it.
- **A `resourceRule` relic.** Allowed by the type, refused by the validator: a class
  resource is one class's, and a relic is worn by twenty-one.

## Relic art

`relic.<id>` rows in the atlas manifest and PNGs under `src/render/atlas/relics/` are
the contract; `chooseRelicArt` falls back to the tinted glyph for anything without one.
The 8 Proving relics (one per element) are authored as of the item-art pass that
followed UAT §11/§12's named-item art; the artifacts and the 4 remaining relics
(the two Nameless relics, Sandals of the Swift Messenger, Remnant of What Was Not)
follow in later batches of the same pass — `npm run itemart`'s relic section reports
the live count. `tools/itemart.ts` never hardcodes the number for this exact reason.
- **A `resourceRule` relic.** Allowed by the type, refused by the validator: a class
  resource is one class's, and a relic is worn by twenty-one.

## Save

`SAVE_VERSION` 22 (20 was reserved and never shipped; the weekly took 21 first).
One account-wide list `relics`, one per-character list `relics` on each `Player`, one
`relicsFound` counter on the stats. An older save loads owning none and wearing none.

`SAVE_VERSION` 35 added the level gate. No field changed shape; what changed is that a
loadout can now load back *smaller* than it was saved, and say so. See "The level gate" above.
