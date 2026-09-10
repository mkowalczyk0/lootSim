# Reliquary materials coverage — a measurement

Status: **measured**. Three materials (Gilt Reliquary, Rune Fragment, Heartwood Sap) were
on the owner's docket as unobtainable. **They are not sourceless** — every one of the nine
materials has a working, live-confirmed source. Don't re-open the sourceless-material bug
on the strength of this doc; what's below is what's actually still open.

## The table

| Material | Element | Sector (order) | baseDepth | Live-confirmed payout | Consumption |
| --- | --- | --- | --- | --- | --- |
| Iron Scrap | physical | The Wargrave (1) | 4 | ✅ kill + node | bulk cost, every recipe |
| Blight Root | poison | The Rotting Garden (2) | 9 | ✅ kill + node | essence only |
| Cinder Dust | fire | The Cinder Catacombs (3) | 14 | ✅ kill + node | essence only |
| Rime Shard | cold | The Frozen Basilica (4) | 19 | ✅ kill + node | essence only |
| Storm Coil | lightning | The Storm Sepulcher (5) | 24 | ✅ kill + node | essence only |
| Void Husk | void | The Black Archive (6) | 29 | ✅ kill + node | essence only |
| **Gilt Reliquary** | holy | The Gilded Ossuary (7) | 34 | ✅ kill + node | **Threshold Brand (80), The Seal Unbroken (120)**, + essence |
| **Rune Fragment** | arcane | The Unbound Spire (8) | 39 | ✅ kill + node, + Memory (below) | **The Unbound Ward (550)**, + essence |
| **Heartwood Sap** | nature | The Hollow Orchard (9) | 44 | ✅ kill + node, + Memory (below) | **Rootbound Plate (550)**, + essence |

"Live-confirmed" is a real headless `Dungeon` run (`geared()` + a scripted bot), not a
reading of the code: each sector was unlocked, a resource node was mined, and a kill
payout was observed, for every one of the nine — payout rate climbs with `materialYield`
(1→9 across the nine sectors), so the three reserved elements actually pay *more* per
node/kill than the earlier six. The clear-cache path was **not** independently live-run —
it shares the identical `this.config.planet.spec.element` payout line the kill path
already confirmed, so there's no separate logic to doubt, but it wasn't watched fire.

## Where the original bug was, and that it's fixed

`tools/world.ts` §7 and `tools/forge.ts` §8 both carry comments naming a "Sept 2026
holy/arcane/nature bug" — no sector existed for the three reserved elements, and
separately the essence-crafting roll only ever weighted `LOOT_ELEMENTS`, so a
holy/arcane/nature essence charged its material and changed nothing. Both halves are
fixed and both are pinned in the acceptance gate (green as of this writing). This is the
exact shape of bug the owner's report described; it just already closed before this
investigation started.

## What's still actually open

- ~~Rune Fragment and Heartwood Sap have a source and no dedicated recipe sink~~ —
  **closed the same day this doc first shipped**: "The Unbound Ward" and "Rootbound
  Plate" (`src/data/named.ts`) are craft-only mythic recipes for exactly these two
  materials, the same shape Gilt Reliquary already had. This table above was left stale
  when that commit landed (the recipes existed; this file still said "no dedicated
  recipe") — fixed here, not a second finding.
- **Sectors 7-9's reachability was measured after this doc shipped, and it's worse than
  "unmeasured": `docs/reliquary-reachability.md` found sector 7 (and, on a second pass,
  sectors 4-6 before it) cannot be cleared by a scripted bot at any gearing tested, up to
  +116 character levels over the sector's own baseDepth.** That makes the two recipes
  above a second, sharper problem than a stale doc: the game shipped two fully-built
  mythic recipes whose one in-fiction material source nobody can reach. **Fixed**: the
  clear-cache material payout in `game/dungeon.ts` now also fires when a rolled Memory
  (`data/memories.ts`) recalls the Unbound Spire or the Hollow Orchard specifically —
  `data/planets.ts`'s `memoryMaterialSource` is the one place that list lives. This is a
  second, independent route to the material, not a discount on the sector's own: a
  Memory's own depth is drawn around the account's frontier (typically far below
  baseDepth 39/44) rather than pinned to the sector, and landing on either place at all is
  a roughly 1-in-20 roll (`memoryPlaces().length`) on top of the Altar's own
  depth-30-and-height-30 unlock. The sector itself, its ladder and its difficulty curve
  are all untouched — this doesn't make sectors 7-9 playable, only makes their two
  recipes reachable by a different door. Live-confirmed the same way the table above was:
  a headless `Dungeon` run with a `MemoryInstance` forced to each place, cleared, and
  banked (`arcane`/`nature` moved by the exact `(6 + depth·0.4) × materialYield × finale`
  formula the sector itself pays).

## Reproducing this

No permanent instrument landed for this one — the live-fire check above was a scratch
script (`geared()` + a scripted bot per sector, unlock forced via `planetProgress`, then
one mined node and a short combat window), not committed. Reproducing it is a same-shape
exercise to the mining check already in `tools/smoke.ts` (search for `resourceNodes`),
just walked across all nine `PLANETS` instead of one.
