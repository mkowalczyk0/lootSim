# UAT Ledger — what's landed, what's open, who owns it

The tracker for `UAT_Notes_Post_Playtest_Update_Specification.md`. That document is the
spec and doesn't change; this one is the running status against it, kept by whichever
session is acting as PM. **Check here before starting a UAT item** — several of them look
open and aren't, and a couple that look done are only half done.

Status vocabulary: **done** (merged to master, tests green) · **partial** (real work
landed, spec not fully satisfied) · **open** (nothing built) · **assigned** (in flight in
a worktree, not yet merged).

Last audited: 2026-09-08, PM session `lootsim-70`.

## Phase 12 chunk order

The spec's own recommended order is the priority order, and we've been following it.
Chunks 1–5 are effectively complete. The live front is Chunks 6–9.

| Chunk | Contents | Status |
| --- | --- | --- |
| 1 — Fix existing systems | MP, ultimate exploit, progression rebalance, monster scaling | done |
| 2 — Improve core combat | monster variety, affixes, elites, challenger rebalance | done |
| 3 — Floor completion loop | clear condition, elite quota, completion portal, extraction penalty | done |
| 4 — UI | stash, item images, hero screen | partial |
| 5 — Universal progression | universal skill tree | done |
| 6 — Endgame foundation | class-completion boss, gold border, daily, weekly, reward previews | in flight |
| 7 — Named item architecture | modular definitions, images, drop tables, previews | **done** |
| 8 — Crafting | forge overhaul, reforging, currency, recipes | in flight |
| 9 — Relics | relic system, ~20 relics, equip, acquisition | open |
| 10 — Raids | raid framework, 4–20 players, weekly scheduling, named loot | open (blocked) |
| 11 — World / tower / delve | tower climbing, heaven/hell split, lore integration | open |

## Section by section

| § | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Fix multiplayer | done | `coop/uat-1-audit`, all four clusters; ledger in `coop-audit.md`. Host-authoritative, client reconciles by replaying unacked inputs. Never browser-verified with 4 real people. |
| 2 | Monster variety | done | 11 archetypes in `data/enemies.ts`, each a distinct combat purpose (swarmer, sniper, shieldbearer, summoner, bomber, leech, charger…). |
| 3 | Monster affixes | done | `data/monster-affixes.ts`, 17 affixes across 5 buckets, `lesser`/`greater` tiers gated by depth. Adding one is data unless it needs a new behaviour hook. |
| 4 | Elite monsters | done | Per-floor elite budget (`eliteCapForFloor`), elites are a mid-game escalation and part of the clear objective. |
| 5 | New floor win condition | done | Kill quota + elite quota (`floorQuotaMet`). The one shape of objective the game has — this is where a second kind would hook in. |
| 6 | Portal / extraction | done | Two portals; entrance stays all floor, completion portal spawns fresh on quota. `EARLY_EXTRACT_KEEP` 15%, flat. |
| 7 | Slow player power growth | done | Folded into the progression rebalance. |
| 8 | Monster difficulty increase | done | Damage quadratic in depth; pressure not sponginess. |
| 9 | Rebalance Challenger | done | `data/challenger.ts`, 20 tiers. Rarity/reward bonuses cap early by design; Death March tiers are raw danger only. |
| 10 | Ultimate generation fix | done | `fix/ultimate-rate`, merged. |
| 11 | Stash UI rework | partial | Real 2-D grid with rarity filter and sell flow. **Open half: the §11 critical requirement** — the stash icon must be the same image the chest-open shows, consistently everywhere. Depends on the §28 art-id pipeline. |
| 12 | Hero / character UI | partial | Pipeline art in the Hero and Style portraits landed. Open: equipment slots arranged around the character with real per-item images. Depends on §28. |
| 13 | Endgame class completion | **assigned** | Opus 5, `feat/class-completion`. Per-`Player` completion state, gold border. |
| 14 | Final boss / delve concept | **assigned** | Same. Steer: tie it into the Delve rather than a separate system, per the spec. |
| 15 | Raid bosses (4–20p) | open | **Unblocked** — §28 landed, and boss-exclusive named drops now work (5 encounters already have one). The raid framework itself is untouched. |
| 16 | Raid drop rarity | open | Blocked on §15. `NamedSource` already scales drop chance with `danger`, which is the hook §16 asks for. |
| 17 | Daily & weekly dungeons | partial | Daily shipped as **The Vigil** (`data/daily.ts`, `daily-dungeon.md`). Weekly **assigned** to Sonnet 5, `feature/weekly-dungeon`. |
| 18 | Universal skill tree | done | `progression/universal.ts`, 6 paths, account-wide pool / per-class allocation. `universal-tree.md`. |
| 19 | Relics & artifacts | open | Nothing built. (Grep hits for "relic" are the *Reliquary Portal*, an unrelated rename.) Next major unclaimed item. |
| 20 | Endgame drop previews | partial | Seeded by §28: the Records "Named items" list shows each item's source, and `namedForSource()` is the pure read a real preview UI would use. The per-activity "here is what this can drop" screen is still open. |
| 21 | Titan rush / tower | open | Lore is written (`game_story_worldbuilding.md`), mechanics aren't. |
| 22 | Rifts / war concept | open | |
| 23 | Planets / materials layers | partial | Planets, materials and the star map all exist; the §23 restructuring doesn't. |
| 24 | Forge overhaul | **assigned** | Fable 5.1, `feat/forge-overhaul`. Today `data/crafting.ts` is 58 lines; Chunk 8 wants rerolling, skill-slot work, recipes, currency. |
| 25 | Named item crafting | **assigned** | Unblocked by §28; part of the Chunk 8 assignment. One craft-only mythic already ships as a proof. |
| 26 | Reforging | done | `feature/reforging` merged; Reforge is a real grid screen in the Craft station. |
| 27 | Crafting currency | **assigned** | Part of Chunk 8. Spec says explicitly: do not overcomplicate initially. |
| 28 | Data-driven named items | done | Merged 8c21eae. `src/data/named.ts` + `tools/named.ts` (238 checks). A def forges an ordinary `Item`: stats bake at drop, behaviour is looked up by id and folded through the class-tree build. 9 items shipped, art on the documented fallback until a PNG pass. See `docs/named-items.md`. |
| 29 | Named item requirements | done | Basic + skill-effect + passive tiers. Cross-class keystone theft (an item flipping another class's rule) deliberately deferred to v2 — it would bypass the anti-overlap audit. |

## Standing rules for anyone picking up an item here

- Work in a worktree under `~/Desktop/lootSim-worktrees/<name>`, never in the shared
  checkout, and `npm install` in it. The owner plays the dev server on :5173 out of the
  main checkout, so unmerged work sitting there reads as a broken game.
- `docs/game_story_worldbuilding.md` is the tiebreaker on anything lore- or
  naming-shaped, and it is read-only. Never stage it.
- `npm test` green before reporting done. New acceptance checks go in `tools/` and get
  wired into the chain in `package.json`.
- Report to the PM by SendMessage and let the PM merge. Flag balance and scope calls
  before building on them, not after.
- Nobody here has a browser. Say plainly when a DOM/UI change is unverified by eye.

## Open findings for the owner

Things the audit turned up that are nobody's assigned ticket and need a design call.

**The endgame sits far beyond the measured frontier.** Measured on master 2026-09-08:
a sharp bot (dodges 55%) averages **deepest depth 10.3** over 20 dives, best single seed
16; the reckless bot averages 9.1. The Delve's authored world ends at depth 30 —
`biomeFor` caps at its last biome, `bossFor` at its last encounter, and that encounter is
titled "You should not have come this far." So the first real endgame goal (§13/§14, the
Proving) sits at roughly three times anything the harness has ever reached.

That is not necessarily wrong — the smoke campaign plays 20 dives on a *fresh* character
and measures the early curve, not an account with a filled tree, universal allocation,
crafted gear and rift-farmed drops. The actual problem is that **nothing in the repo
measures account-level reach at all.** We don't know if depth 30 is a stretch goal or an
impossibility, and §7 ("players become overpowered too early") pushed the curve steeper
without anything checking the far end. Wants an owner call plus a measurement harness.

**The sharp-vs-reckless margin is thin.** The comparison assertion added after the Sept
2026 inversion requires `sharp >= reckless + 1`; the live margin is **1.2** (10.3 vs 9.1).
It passes, but there's almost no headroom, and this is the exact check that silently
inverted once before. Any class, weapon or tree change can flip it. Worth widening the
sample or raising the required margin deliberately rather than discovering it again.

**The build-grant fix moved the campaign, measurably.** `runBuildGrants` used to discard
the combat event payload: grants fired for every hero in co-op, and `to: "target"`
resolved to whatever stood nearest the caster rather than what was actually hit, so a hit
landing beyond 220 units (a bow shot, a staff bolt) could never be punished. Fixed in
2d04d45. Measured on identical seeds, master before vs after:

| | before | after |
| --- | --- | --- |
| sharp campaign | 10.3 | **11.8** |
| reckless campaign | 9.1 | 9.4 |
| skill margin | 1.2 | **2.4** |

Worth recording because it cuts two ways. It is a real buff to skilled play, which sits
awkwardly against §7 ("players become overpowered too early") — but it doubles the gap
between reading telegraphs and ignoring them, which is the promise the whole difficulty
design rests on, and it relieves the thin-margin finding above. Net: kept.
