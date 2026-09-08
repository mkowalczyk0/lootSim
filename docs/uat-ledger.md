# UAT Ledger — what's landed, what's open, who owns it

The tracker for `UAT_Notes_Post_Playtest_Update_Specification.md`. That document is the
spec and doesn't change; this one is the running status against it, kept by whichever
session is acting as PM. **Check here before starting a UAT item** — several of them look
open and aren't, and a couple that look done are only half done.

Status vocabulary: **done** (merged to master, tests green) · **partial** (real work
landed, spec not fully satisfied) · **open** (nothing built) · **assigned** (in flight in
a worktree, not yet merged).

Last audited: 2026-09-08, PM session `lootsim-70`. §13/§14 rows updated by the session that built them, on landing.

> **⚠ Every difficulty number below and elsewhere in this repo is currently PROVISIONAL.**
> A defect in the wave director (`dungeon.ts:1288` — the next wave starts only when
> `enemies.length === 0`, so one unreachable monster stalls a floor forever) was measured
> stalling 25% of floors at depth 5 rising to 67% at depth 30. Every measurement anyone
> has taken, including the sharp 11.8 / reckless 9.4 campaign figures and the boss-vs-trash
> finding, has been reading some amount of that as difficulty. The fix and a re-baseline
> are in progress; do not tune against any number here until that lands.

## Phase 12 chunk order

The spec's own recommended order is the priority order, and we've been following it.
Chunks 1–5 are effectively complete. The live front is Chunks 6–9.

| Chunk | Contents | Status |
| --- | --- | --- |
| 1 — Fix existing systems | MP, ultimate exploit, progression rebalance, monster scaling | done |
| 2 — Improve core combat | monster variety, affixes, elites, challenger rebalance | done |
| 3 — Floor completion loop | clear condition, elite quota, completion portal, extraction penalty | done |
| 4 — UI | stash, item images, hero screen | done (item PNG pass still outstanding) |
| 5 — Universal progression | universal skill tree | done |
| 6 — Endgame foundation | class-completion boss, gold border, daily, weekly, reward previews | **done** |
| 7 — Named item architecture | modular definitions, images, drop tables, previews | **done** |
| 8 — Crafting | forge overhaul, reforging, currency, recipes | **done** |
| 9 — Relics | relic system, ~20 relics, equip, acquisition | **done** |
| 10 — Raids | raid framework, 4–20 players, weekly scheduling, named loot | open — **owner call** |
| 11 — World / tower / delve | tower climbing, heaven/hell split, lore integration | §22 lore **done**; §21 tower and §23 layers open — **owner call** |

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
| 11 | Stash UI rework | **done** | Item-card grid with real icons, rarity colour, hover tooltip, level-requirement lock, feature dots. The critical requirement is now a *property*: `chooseItemArt` in `render/itemart.ts` is the single resolution path for all six surfaces, pinned by `npm run itemart`. Item PNGs are still unauthored — everything is on the type-icon fallback pending an art pass with a human looking at it. |
| 12 | Hero / character UI | **done** | Paper-doll: portrait centred, six live slots flanking it drawing real item images, six future slots as declared furniture (`FUTURE_SLOTS`). Whether it becomes a literal ring around the character is deferred to when the relic slots land, so the question is answered once against the final slot count. |
| 13 | Endgame class completion | **done** | `feat/class-completion`. The Proving: `src/data/legends.ts` + `tools/legends.ts` (wired into `npm test`). One new persisted field, `Player.legendComplete` (SAVE_VERSION 18); gold border on the Path cards, a side-panel state per class, Records rows, a one-time announcement. Powerless — asserted to leave the sheet byte-identical. Solo only in v1. See `docs/class-completion.md`. Now also pays a mythic exclusive, `proof-of-the-whole` (one generated source per class), added with §20. |
| 14 | Final boss / delve concept | **done** | Tied into the Delve, at depth 30, with **no** new mode, station, portal, tab or wire field. Depth 30 because that is where the authored world already ends (`biomeFor` caps from 26, `bossFor` from 25). The ladder is deliberately **not** capped. Gate is a per-class *banked* clear of the bottom, so no new unlock state. 21 encounters borrowed-and-reskinned per the `planetBossSpec` precedent. |
| 15 | Raid bosses (4–20p) | open | **Unblocked** — §28 landed, and boss-exclusive named drops now work (5 encounters already have one). The raid framework itself is untouched. |
| 16 | Raid drop rarity | **done** | `src/data/rewards.ts` — `rewardCurve(danger)` is the one statement of "harder pays better", covering drop chance, drop count, item power and elemental variants. Rarity is deliberately **not** an axis (§9's caps stay, and a structural check fails if it ever grows one). Pays only for difficulty the player *chose*: a rift tier and the Challenger dial climb it, a rotating activity's imposed modifiers are divided out. |
| 17 | Daily & weekly dungeons | **done** | Daily is **The Vigil** (`data/daily.ts`); weekly is **The Convergence** (`data/weekly.ts`) — four floors from the UTC week number, three modifiers, Capstone chests on the boss floor. Floor 4 draws a separate, shallower depth band (`WEEKLY_BOSS_DEPTH_MIN/MAX`) — a **labelled workaround** for the boss-vs-trash curve finding, with undo instructions in `docs/weekly-dungeon.md`. Solo v1. |
| 18 | Universal skill tree | done | `progression/universal.ts`, 6 paths, account-wide pool / per-class allocation. `universal-tree.md`. |
| 19 | Relics & artifacts | **done** | `src/data/relics.ts` + `tools/relics.ts` (~330 checks). A relic is a tree node you wear — same `NodeEffect` vocabulary, no third effect language. 3 slots, **at most 1 relic-tier worn** (`MAX_RELICS_WORN`, an owner-overturnable constant), artifacts fill the rest. 12 relics / 18 artifacts, 2 stat sticks. Artifacts 100% Abyssal per §19; relics from the Proving (by element), the Nameless, the depth-30 cache and Abyss tier 8+. `raid`/`tower` source kinds reserved and refused as an item's only source. Shared table in `src/data/drops.ts`. See `docs/relics.md`. |
| 20 | Endgame drop previews | **done** | `feat/drop-previews`. `src/data/previews.ts` + `tools/previews.ts`, wired into `npm test`. Every commit screen (Dive, Rifts, Star Map, Vigil, Path) renders one `previewForRun`. Holds **no** table of its own: reads `namedMatchesFor`, `namedDropChance`, `bossSpecForRun` and the `RunMode`. The gate proves the preview lists exactly what the sim's own `rollNamedDrops` can produce, dice rigged, across 13 activities. §17's "clear rewards preview" and §19's "where does this drop?" are the same read. See `docs/drop-previews.md`. |
| 21 | Titan rush / tower | open | Lore is written (`game_story_worldbuilding.md`), mechanics aren't. |
| 22 | Rifts / war concept | **done** | One field, not a system: every `RunMode` carries `lore` beside `blurb` — mechanics stay in `blurb`, the world's reason lives in `lore`. Six lines, all quotation from `game_story_worldbuilding.md`. Reaches the player on every Dive/Rifts/StarMap/Vigil/Convergence aside and on each hub portal via `stationLore`. Checked in `tools/previews.ts`: lore must name the war, differ from the blurb, avoid payout words and hardcode no keys. |
| 23 | Planets / materials layers | open | Re-audited: the *existing* systems (planets, materials, star map) are done, but §23 asks to reconsider whether they should be **layers** — Surface → Deep Delve → Hell Layers, and Tower Base → Heaven Layers — so that descending and ascending read as two halves of one war. None of that restructuring exists. Marked partial before, which flattered it. |
| 24 | Forge overhaul | **done** | The Reforge grid became a workbench: Temper, Recast, Augment, Inscribe, Awaken, Ascend, Salvage. `src/game/forge.ts` + `tools/forge.ts` in `npm test`. Inscribe *rolls* the grant from the pool rather than letting you pick it — a deterministic choice would collapse every character onto the strongest grant. See `docs/forge.md`. |
| 25 | Named item crafting | **done** | Multi-item recipes: `NamedSource.craft` takes an item list consumed from the stash, cheapest first, never equipped gear. The Seal Unbroken needs the Warden's own drop + 3 legendary shields + materials — §24's core example, literally. |
| 26 | Reforging | done | Extended by the Forge overhaul into the full workbench; `reforgeItem` and its smoke section untouched. |
| 27 | Crafting currency | **done** | One currency, **Ash**, minted *only* by salvaging found items (asserted: chests, crafts and dives mint zero). Coins stay bulk cost, the nine materials stay recipe currency. Deliberately simpler than §27's own three-currency example. |
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

**Boss encounters and trash floors are on different curves.** Three independent
measurements today, from three different directions, and together they are a finding
rather than an artifact:

- Only **3 of 8 classes** could beat depth 30 at level 60 in legendary gear — and that
  holds for the ordinary depth-30 floor exactly as much as for the new Proving, so it is
  not the new content. A level-34 Elite-geared character cannot clear depth 30 at all.
- Characters who clear **trash floors at depth 12–21** comfortably go **0/4 against a
  boss at any of those same depths**. Against the Delve's own ladder: depth-10 boss
  2/12, depth-15 boss 0/4, for characters who handle equivalent trash without trouble.
- The sharp campaign averages deepest depth **11.8** over 20 dives (reckless 9.4), so
  the frontier a real character reaches sits far below where the authored world ends.

So the question is not "is the endgame reachable." It is: **bosses and trash scale apart
across the whole depth range — is that intended, and what level and gear does the curve
mean for depth 30?** This rhymes with `npm run builds` being red for a known set of
classes pending owner tuning calls.

Nobody has been asked to tune around it and nobody should be until the owner sets the
target. One mode-local workaround exists and is deliberately labelled as one: the
Convergence draws its boss floor's depth from a separate, shallower band
(`WEEKLY_BOSS_DEPTH_MIN/MAX`) rather than inheriting a wall it cannot fix. If boss
difficulty is ever rebalanced globally, that split is the first thing that should
collapse back into a single band.

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

**Most classes cannot reach depth 30 at all.** The sharpest finding from the
class-completion build, and it reframes the reachability question above. Sampled across
eight classes at level 60 with legendary gear, only **three** could beat depth 30 — and
that holds for the ordinary depth-30 floor exactly as much as for the Proving, so it is
not an artifact of the new encounter. A level-34 Elite-geared character cannot clear
depth 30 in any flavour. This rhymes with `npm run builds` being red for a known set of
classes pending owner tuning calls.

So the open question is no longer "is the endgame reachable." It is: **what level and
gear does the curve intend for depth 30, and why can't most classes get there at 60?**
That is a class-balance and curve question, not an endgame-content one. Nobody has been
asked to tune around it and nobody should be, until the owner sets the target.

**Three shipped bosses break the additive-phase rule.** CLAUDE.md requires that phases
*add* abilities rather than replacing them. `tools/legends.ts` now audits every encounter
against the boss rules and pins the existing violations in `KNOWN_AUTHORED_VIOLATIONS`,
so a new one fails the gate and so does fixing a pinned one without updating the list:
`choir` drops `slam` entering Second Verse; `herald` drops `cleave` entering Proclamation;
`nameless` drops `slam`/`volley`/`windmill` entering Interest, then `charge`/`corruption`
entering Displeasure. No telegraph, wind-up or cross-arena violations anywhere. All 21
generated Proving specs are clean on every rule. Scheduled work, not folklore.

**§21, §22 and §23 are one decision, not three tickets.** The tower, the rift/war framing
and the planets-as-layers question are all Chunk 11 and all describe the same world
structure — descending toward Hell and ascending toward Heaven as two halves of one war.
The spec itself says "the exact world structure is still TBD". This is the one remaining
area where the owner has to decide the shape before anyone can usefully build, and it is
deliberately unassigned for that reason. §22 alone is nearly free (the lore is written;
the mode blurbs just don't carry it) and could ship ahead of the rest.

**You level into your own loot.** Noticed while measuring §16's item-power axis, and
pre-existing rather than caused by it: at ordinary difficulty a floor's own drops already
need roughly one level more than the floor recommends bringing. `requiredLevel()` grants
exactly one level of grace for this reason, so it looks deliberate — recording it as an
observation rather than a defect, because §16's item-power axis now adds up to +3 `ilvl`
at high danger and every point also raises the level that can wear the drop. If the grace
was ever meant to be more generous, that interaction is where it will show first.

**Variants stop at elements, deliberately.** §16's "special variants" is implemented as an
elemental lean (same rarity, same affix count, same power band) and not as extra affixes
or earlier grants, because those would tread on the Forge bench's `augment`/`inscribe` and
its stated invariant that nothing an op produces is something a chest couldn't have
dropped. Widening it is a coordinated design decision, not a reward-curve side effect.

**A single unreachable monster stalls a floor permanently.** `updateSpawning`
(`src/game/dungeon.ts:1288`) starts the next wave only when `enemies.length === 0`; its own
comment says "the next one starts once the floor is clear of stragglers", naming the
failure mode without guarding it. So one monster the player cannot reach — a Gorehound
600 units away, unroutable — holds the floor open forever at, in the observed case, 44/180
kills.

This is a **player-facing defect**, not only a measurement problem: a real person is left
on a floor that can never complete, quota short, no completion portal, whose only exit is
the entrance portal at `EARLY_EXTRACT_KEEP` 15%. The game confiscates 85% of a run and
appears to do it deliberately.

Measured at level 60 in Legendary gear, 12 seeds per depth: stall rate 25% at depth 5,
33% at 10, 58% at 15, 50% at 20 and 25, 67% at 30, 42% at 35. It is **not** depth-specific
— the per-floor probability simply rises with body count, which is exactly why it
*masquerades* as a difficulty curve and why it contaminated every measurement taken today.

Two things it calls into question beyond the numbers: the generator's flood-fill
reachability validation, if the mechanism turns out to be spawn placement putting a monster
behind rock; and `tools/smoke.ts`'s `unfinished` counter, which should have been screaming
at these rates and was not.

**`recommendedLevel` may be lying to players.** At exactly the level and gear the game
advises, every floor from depth 18 down killed the character in 6–22 seconds having
completed 0–3% of the objective. Held pending the straggler fix, since stalls may have
contaminated this measurement too — but if it survives re-measurement, a number shown in
the UI is actively misleading.
