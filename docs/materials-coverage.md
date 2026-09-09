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
| **Rune Fragment** | arcane | The Unbound Spire (8) | 39 | ✅ kill + node | essence only — **no dedicated recipe** |
| **Heartwood Sap** | nature | The Hollow Orchard (9) | 44 | ✅ kill + node | essence only — **no dedicated recipe** |

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

- **Rune Fragment and Heartwood Sap have a source and no dedicated recipe sink.** Right
  now they're only spendable through the general craft-essence mechanic (weighting a roll
  toward an arcane/nature affix, confirmed working). Gilt Reliquary has two hard-cost
  recipes; these two have none. Not a bug — nothing is broken — but a source with no sink
  is a real design gap worth the owner knowing about, not an oversight to quietly fix.
- **Sectors 7-9's reachability is unmeasured, not proven.** They unlock either by account
  frontier (baseDepth 34/39/44 — CLAUDE.md already notes depth 30 is "far beyond the
  measured frontier" for the campaign bots) or by clearing all six earlier sectors' first
  tier in sequence, which needs no Delve/Tower depth at all. The ladder route is the
  likely real path, but nothing in the test suite has ever played past `PLANETS[1]`
  (`tools/smoke.ts`'s own planet coverage), so whether a real campaign actually reaches
  sector 7, 8 or 9 — and how long that takes — has never been measured. A follow-up
  attempt to measure a full nine-sector sequential campaign was started and produced
  **zero numbers**: time ran out while reading `Dungeon.bankLoot()`'s floor-to-floor
  semantics, before any harness code was written. That's stated plainly rather than
  guessed at — "technically obtainable" and "reachable in practice" are still two
  different, unreconciled claims for these three sectors specifically.

## Reproducing this

No permanent instrument landed for this one — the live-fire check above was a scratch
script (`geared()` + a scripted bot per sector, unlock forced via `planetProgress`, then
one mined node and a short combat window), not committed. Reproducing it is a same-shape
exercise to the mining check already in `tools/smoke.ts` (search for `resourceNodes`),
just walked across all nine `PLANETS` instead of one.
