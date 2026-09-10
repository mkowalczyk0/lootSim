# Named Items — UAT §28 / §29

The working record for the data-driven named-item architecture: what was built, the
decisions behind it, how to add one, what the effect vocabulary can and cannot say, and
the one tuning footgun that must not become folk knowledge.

Proven by `npm run named` (`tools/named.ts`), wired into `npm test`. The registry is
`src/data/named.ts`; nothing else in the game names an item.

## What it is, in one sentence

**A named item is a definition that forges an ordinary `Item`, and its behaviour is a
tree node you wear.**

That sentence is the whole architecture. Two consequences fall out of it and everything
else is detail:

1. **Stats are baked; the item is ordinary.** `forgeNamedItem` (`src/game/item.ts`)
   takes a `NamedItemDef` and produces the exact same `Item` shape every drop has — a base
   stat block from the type at that rarity, an affix list, an optional grant, an optional
   trigger. The definition's fixed affixes land in `item.mods` with ids like
   `named:the-first-seal:defense`. From there `itemMods`, `itemScore`, the compare table,
   the upgrade arrows, `sellPrice`, the save and the co-op wire all work with no new code
   path. The one thing the item remembers is `named: "<def id>"`.
2. **Behaviour is looked up live, by id.** `Player.build` folds each worn named item's
   `effects` into the class's `ResolvedBuild` through the same `foldEffects` a tree node
   uses (`src/progression/build.ts`), tagged `from: "gear"`. So `build.mutations`,
   `build.grants`, `build.rules` and `build.resourcePatches` carry it, and the dungeon's
   existing consumers — `applyBuild` for mutations, `runBuildGrants` for passives, the
   `rulesOn*` hooks — pick it up unchanged. **The simulation never asks "is this named".**

## The tuning footgun: two lifetimes

Because of the split above, the two halves of a definition have different lifetimes, and
the difference is deliberate:

| half of the definition | where it lives after a drop | a retune reaches… |
|---|---|---|
| `statScale`, `mods` (the fixed affixes), `randomMods` | **baked** into each copy's `stats` / `mods` at forge time | **only copies forged after the change** — every copy already in a stash or on a character keeps the numbers it dropped with |
| `effects`, `grant`, `trigger` | **looked up by `named` id** every time the build resolves | **every copy ever dropped**, instantly, including copies on remote heroes in a co-op room |

Why this way: baking the stats is what lets the item be ordinary everywhere (the compare
panel would otherwise need a parallel code path, the wire would need a second payload,
the score would lie). Looking up behaviour is what keeps the save light and lets a
passive be fixed without a save migration.

The footgun is the first row. If a named item's *numbers* turn out wrong, changing
`mods` in the registry fixes new drops and silently leaves the old ones alone. If that is
not acceptable for a particular change, the options are, in order of cost: bump the
values via `effects` instead (a `resourceRule` or a mutation is live), accept the drift
(most ARPGs do — a "legacy" copy is a known thing), or write a one-off `SAVE_VERSION`
migration that re-forges copies by `named` id (`normalizeItem` in `src/game/state.ts` is
where that would go). Do not assume the retune landed. Check a stashed copy.

## How to add one

The §28 acceptance story: one data entry, optionally one art file, and the item is live
in loot, chests, the stash, the Hero screen, tooltips, the Forge and the Records list.

### Worked example: Storm Tyrant → Tempest Reaver

The spec's own example (§15/§28). The Storm Tyrant is a raid boss that does not exist
yet — raids are Chunk 10 — so this is the walk-through for **when it does**, step by
step, against the five §28 steps. Nothing below needs a line of code outside the data
files.

**Step 1 — create the item definition.** Add one entry to `NAMED_ITEMS` in
`src/data/named.ts`:

```ts
{
  id: "tempest-reaver",
  name: "Tempest Reaver",
  flavor: "The storm did not agree to this.",
  description: "Every third swing calls the lightning down on whatever you hit.",
  rarity: "mythic", type: "axe", statScale: 1.15,
  mods: [
    { key: "attack", value: [3.5, 4.5], scale: "rarity" },   // a range: copies vary
    { key: "lightningDamage", value: [0.3, 0.45] },
    { key: "attackSpeed", value: 0.1 },
  ],
  randomMods: 2,                                            // boss-exclusive: farmable
  effects: [
    {
      kind: "grantEffect", on: { event: "hit" },
      note: "Landing a hit calls a chain of lightning through the target.",
      effects: [{
        kind: "damage", to: "target",
        damage: { base: 0.5, scale: "attack", type: "lightning",
                  inflict: { status: "shock", chance: 0.4 } },
      }],
    },
    {
      kind: "mutate",
      mutation: {
        id: "named.tempest-reaver.stormcall",
        label: "Lightning skills fire one more projectile",
        target: { withTag: "lightning" },
        ops: [{ kind: "projectile", addCount: 1 }],
      },
    },
  ],
  sources: [],                                              // step 2
  art: "named.tempest-reaver",                              // steps 3–4
  minIlvl: 30,
}
```

**Step 2 — define acquisition.** Fill `sources`. For a boss the id is the `BossSpec.id`
the encounter will have — say the raid lands it as `"storm-tyrant"`:

```ts
sources: [{ kind: "boss", bossId: "storm-tyrant", chance: 0.06 }],
```

That is the whole of "StormTyrantSword → StormTyrantRaidBoss". The boss's code never
mentions the item: when any boss dies, `Dungeon.dropNamed` asks
`rollNamedDrops({ kind: "boss", bossId: e.boss.spec.id })` and forges whatever the table
pays. `namedDropChance` lifts the odds with `danger` (rift tier × Challenger), which is
the §16 "harder is better" hook — a raid tier system would feed the same number. The
same item may list several sources; each is an independent roll.

Until the boss exists, `npm run named` **fails** on this entry ("boss source
"storm-tyrant" is a real encounter"), which is the point — an item cannot ship pointing
at nothing.

**Step 3 — add the image.** Drop `src/render/atlas/named/named.tempest-reaver.png` in
the repo (the Aseprite/PixelLab pipeline, like every other atlas PNG). Any size; the UI
normalises by width.

**Step 4 — map the image to the item.** One row in `ATLAS` in
`src/render/atlas/manifest.ts`, in the `named items` block:

```ts
"named.tempest-reaver": { id: "named.tempest-reaver", w: 40, h: 40, worldScale: 0.5, feet: 0.15 },
```

`def.art` already names it (step 1). Order does not matter: an art id with no row yet
draws as the item's type icon tinted by its rarity, so the item can ship before the art
does. `npm run named` reports which items are on the fallback and fails if a PNG exists
with no row (it would never load).

**Step 5 — done.** Run `npm run named`. The entry is validated (§4 below), forged, saved,
sent over the wire, rolled from its source, and its passive is fired in a live `Dungeon`.
It now appears in:

| where | how it got there |
|---|---|
| a boss kill, a wave monster, the clear cache | `Dungeon.dropNamed` reading the table |
| a chest pull | `GameState.openChests` reading the table — the named copy rides *alongside* the ordinary pull, never replaces it |
| the Forge, "Named" screen | any def with a `craft` source; `GameState.craftNamed` spends exactly the recipe |
| the stash card, compare panel, Hero paper-doll | `itemArt` for the icon, `renderNamedLore` for flavour, description, live effect lines and where another copy comes from; a gold dot on the card |
| the loot banner and the chest reels | `itemArt(item)` |
| the Records tab | every definition, found ×n or "not yet", with its source line — the seed of the §20 drop preview |
| the HUD's recent-pickups list | by name, like everything else |

## The effect vocabulary (§29)

`NamedEffect` is `NodeEffect` (`src/progression/nodes.ts`) minus `mods`. Stats go
through the affix list so they show on the sheet; everything else is the tree's own
language, which is the whole reason this cost no new engine code:

| §29 asks for | write |
|---|---|
| **Basic** — damage, attack speed, crit, health, defense, move speed | `mods: [{ key, value }]`. Use `scale: "rarity"` for flat stats (attack, defense, maxHealth, thorns, lifeOnHit) so they grow with the `2^n` rarity multiplier like a pool affix; leave percentages flat. A negative value is a tradeoff and is allowed — see Gravebound Mantle. |
| **Basic** — resource modifications | `mods` on `maxMana` / `manaRegen` / `manaOnHit`, or `{ kind: "resourceRule", resource, patch }` to patch a class's own resource spec (max, regen, an extra generation rule). A patch for a resource the wearer's class lacks is a no-op. |
| **Skill effects** — modify a skill, add a projectile, change projectile behaviour, add a secondary effect, change cooldown or cost | `{ kind: "mutate", mutation }` — a `SkillMutation` (`src/progression/mutations.ts`) targeting one ability by id or every ability with a tag. Ops: `damagePacket`, `projectile` (`addCount`, `addPierce`, `setBehavior`, `addOnExpire`), `cooldown`, `resource`, `addEffect`, `followUp`, `trigger`, `status`, `zone`, `summon`, `movement`, `targeting`, `addTags`, `replaceEffects`. Mutations apply to a *granted* skill too, so an item can hand you a skill and improve it in the same breath (The Early Word). |
| **Passive effects** — on hit, on kill, on dodge, on damage taken, on ultimate, on skill use, on enemy death | `{ kind: "grantEffect", on: { event }, effects: EffectStep[] }`. Events the sim actually emits: `hit`, `criticalHit`, `kill`, `dodge`, `damageTaken`, `skillUse`, `ultimateUse`, `enemyDeath`. `on: { tag }` fires on every cast carrying that tag instead. The effect steps are the full `EffectStep` schema (`src/combat/ability.ts`): damage, status, heal, shield, projectile, zone, knockback, pull, resource, delay, random, … |
| a whole extra castable | `grant: "<ability id>"` — the epic+ granted-skill slot, made deterministic. Any ability in the roster, class rule be damned (CLAUDE.md endorses this). |
| an item that fires on its own | `trigger: TriggerSpec` — the legendary+ trigger slot (`nova` / `bolt` / `chain` on hit/kill/dash/ultimate), made deterministic. |

Where a passive lands: since the grant-bus fix that shipped ahead of this system, a
`grantEffect` fires only for the hero the event is about, `to: "target"` resolves to the
enemy that was hit (`evt.targetId`) however far away, and a `zone` lands at the event's
point (where the kill happened), falling back to the caster's position and the enemies
within 220 units when the event names nothing.

**Every effect should carry a `note`** (grants) or `label` (mutations). The tooltip
prints it; the auto-description in `progression/describe.ts` is a fallback that reads
like a fallback.

### Not supported in v1 — deliberately

- **New `EffectStep` kinds, new attack patterns, transformations, new summon units.**
  §29 says basic mechanics first, prove the pipeline, then author on top. Everything a
  named item does today is expressible in the vocabulary that already existed; the day
  one isn't, the fix is a new step kind in `src/combat/` that every class can then use —
  never a `switch` on an item id.
- **Flipping a class's keystone rule.** `{ kind: "rule", rule }` exists but the rule id
  must be namespaced `named.<def id>.<name>`, and `tools/named.ts` fails the build
  otherwise. `progression/audit.ts` guarantees every class rule id belongs to exactly one
  class and only walks class defs; a named item borrowing `berserker.foo` would bypass
  that guarantee invisibly. Cross-class keystone theft as a chase mechanic ("wear the
  ring, gain the Paladin's Holy Execution") is a real v2 idea — flagged for the owner,
  not built. A *granted skill* crossing class lines is fine and different: additive,
  visible on the bar.
- **Per-item code.** There is none, and `tools/named.ts` doesn't check for it because
  there's no seam to hang it on: the sim reads `Mods` and a `ResolvedBuild`, neither of
  which knows an item id.
- **Raid-tier drop variants, "number of possible drops", special variants (§16).**
  `namedDropChance(base, danger)` is the one hook; a raid system plugs its tier into
  `danger` and gets scaling odds for free. Anything richer is Chunk 10's.
- **The §20 drop preview UI.** (Since UAT §19 the table machinery lives in
  `src/data/drops.ts`, shared with relics, and `dropsForSource` in `data/drop-preview.ts`
  is the composed read every activity preview should ask.) `namedForSource(query)` is the pure read ("this boss can
  drop these"); the Records tab's list is the seed. The per-activity preview screens are
  still open.
- **Named-item art.** Every shipped item names `named.<id>` and is on the fallback until
  the art pass lands a PNG + manifest row. The path is proven end to end
  (`itemIcon(type, rarity, art)` → `ATLAS[art]` → `atlasCanvas`); only the files are
  missing.

## Acquisition

`NamedSource` in `src/data/named.ts`:

| kind | pays out when | read by |
|---|---|---|
| `boss` | that `BossSpec.id` (or `planet-<id>`) dies | `Dungeon.dropNamed` in the kill handler |
| `worldDrop` | any wave monster at ≥ `minDepth` dies; elites ×3 | same |
| `clearCache` | a floor at ≥ `minDepth` is cleared, optionally only in one `RunModeId` | `Dungeon.dropClearCache` |
| `chest` | a chest of that tier is opened, per pull | `GameState.openChests` |
| `craft` | the player pays exactly `materials` + `coins` (+ any `items` components from the stash, UAT §24 — see `docs/forge.md`) at the Forge's Named screen | `GameState.craftNamed` |

Every listed source is an independent roll. `chance` is per event, then
`namedDropChance` multiplies by `min(2.5, 1 + 0.35·log₂(danger))` — exactly base at
danger 1 (a plain delve), rising through rift tiers and Challenger, capped so a Death
March isn't a vending machine. The item level of a forged copy is the floor's depth,
lifted to `minIlvl`, so a boss-exclusive first met at depth 5 doesn't roll depth-5 stats
forever.

Two things the table deliberately does not do: a named chest drop never *replaces* the
ordinary pull (a chest with a table must never pay less than one without), and a
`worldDrop` never fires from a summon or a splitting shard — only the wave director's
own monsters, the same rule the kill quota uses.

## The other things that had to be true

- **Save.** `SAVE_VERSION` 17. `normalizeItem` fills `named: null` for pre-17 items and
  for any copy whose definition has been retired — the copy keeps every baked stat and
  affix and simply stops being named, the same "drop the id, keep the thing" rule a
  removed cosmetic gets. Never rename a shipped id; retire it and add a new one.
- **Co-op.** `playerToJSON` does double duty as the save format and the wire payload, and
  `equipment` was already on it, so `named` crosses the wire with nothing added. The host
  rebuilds a remote hero's build from the id and computes their passives from the same
  registry; a client draws the right name and art. `tools/named.ts` §6 pins both.
- **Reforge.** The Forge's reforge on a named item re-rolls the definition's own ranges
  and random extras rather than replacing them from the pool — the same item, another
  copy of it — and never decorates the name with a prefix or suffix.
- **Cosmetics.** A weapon skin never draws over a named weapon. Owner ruling, Sept 2026,
  and it is the same rule as the workbench one reaching a surface this doc had not
  considered: a named item's identity is not for sale, so a cosmetic cannot overwrite it
  any more than Recast or Augment can. Note this sits *against* the neighbouring ruling
  that a skin beats an item's rarity wash — the order is decoration < vanity < identity. A
  rarity wash is a colour, so what the player chose to look at wins; a named weapon is an
  object, so it wins over what they chose. The check in `weaponSprite` is on the **item**
  being named, never on which art exists, so a named weapon whose own sprite has not been
  drawn yet still refuses the skin and draws its ordinary family weapon.

  Their authored art, when it lands, goes in `ATLAS_WEAPON_SKINS` — the same table the
  wardrobe uses, because "an authored weapon of a declared family, with its own grip and
  world scale" is one mechanism and not two. That table is what closes
  `docs/art-manifest.md` §5's open item, where a named weapon "renders its icon correctly
  but swings in combat as an ordinary rarity-tinted family weapon."
- **Junk.** "Sell all junk" never sells a named item, whatever its score says.
- **Score.** `itemScore` prices each live effect like a grant so the upgrade arrows don't
  read a passive-heavy item as a stat stick.
- **Records.** `GameState.stats.namedFound[id]` counts copies minted for this account —
  the local hero's drops, chest pulls and crafts. Co-op drops for a remote hero are
  counted on *their* machine.

## Shipped content

Nine, one per source kind at least, spread across the §29 tiers. Lore per
`docs/game_story_worldbuilding.md`; no item hangs off a boss that doesn't exist yet
(Tyrant, Ferryman, Minotaur, Queen — the doc's raid examples — are for Chunk 10, see
the worked example above).

| item | slot · rarity | tier | source |
|---|---|---|---|
| The First Seal | shield · legendary | passive (ward on damage taken) + stats | Warden of the First Seal |
| Chorister's Idol | talisman · mythic | passive (two void bolts on skill use) | The Hollow Choir |
| Gravebound Mantle | armor · legendary | passive (rot pool on kill) + a **negative** move-speed tradeoff | Gravebound Colossus |
| The Early Word | staff · mythic | granted skill (Volatile Flask) + mutation (fire skills ×1.25) | Herald of the Unspoken |
| A Name Withheld | ring · unspoken | passive (Vulnerable on ultimate) + crit | That Which Has No Name |
| Keeper's Ledger | ring · epic | pure stat (coin/gem find, pickup radius) | Legendary chests |
| Limbo's Lantern | necklace · epic | pure stat | the clear cache, depth 6+ |
| Glutton's Grasp | gloves · legendary | passive (heal on kill) | world drop, depth 12+ |
| Threshold Brand | sword · mythic | mutation (melee skills strike holy) + trigger (holy bolts on dash) | crafted — 600 Iron Scrap, 80 Gilt Reliquary, 80 Void Husk, 40,000 coins |

Every boss-exclusive carries `randomMods` ≥ 1 so a second kill can roll a better copy;
that is §15's "reason to repeatedly farm specific bosses", and `tools/named.ts` asserts
it.
