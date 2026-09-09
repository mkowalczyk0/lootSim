# UAT Ledger — what's landed, what's open, who owns it

The tracker for `UAT_Notes_Post_Playtest_Update_Specification.md`. That document is the
spec and doesn't change; this one is the running status against it, kept by whichever
session is acting as PM. **Check here before starting a UAT item** — several of them look
open and aren't, and a couple that look done are only half done.

Status vocabulary: **done** (merged to master, tests green) · **partial** (real work
landed, spec not fully satisfied) · **open** (nothing built) · **assigned** (in flight in
a worktree, not yet merged).

Last audited: 2026-09-08, PM session `lootsim-70`. §13/§14 rows updated by the session that built them, on landing.

## Phase 12 chunk order

The spec's own recommended order is the priority order, and we've been following it.
Chunks 1–5 are effectively complete. The live front is Chunks 6–9.

| Chunk | Contents | Status |
| --- | --- | --- |
| 1 — Fix existing systems | MP, ultimate exploit, progression rebalance, monster scaling | done |
| 2 — Improve core combat | monster variety, affixes, elites, challenger rebalance | done |
| 3 — Floor completion loop | clear condition, elite quota, completion portal, extraction penalty | done |
| 4 — UI | stash, item images, hero screen | **done** — all 42 item/relic/artifact icons painted |
| 5 — Universal progression | universal skill tree | done |
| 6 — Endgame foundation | class-completion boss, gold border, daily, weekly, reward previews | **done** |
| 7 — Named item architecture | modular definitions, images, drop tables, previews | **done** |
| 8 — Crafting | forge overhaul, reforging, currency, recipes | **done** |
| 9 — Relics | relic system, ~20 relics, equip, acquisition | **done** |
| 10 — Raids | raid framework, 4–20 players, weekly scheduling, named loot | open — **owner call** |
| 11 — World / tower / delve | tower climbing, heaven/hell split, lore integration | **done** — §21 Tower, §22 lore, §23 layers all landed (Tower reward axis in flight) |

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
| 21 | Titan rush / tower | **done** (reward commit in flight) | `src/data/tower.ts`. Endless ascent through the **one** curve (`tools/world.ts` pins height N == depth N across 1–60). Holy roster, five borrowed encounters, bone-gold portal at deepest depth 5, height records structurally separate from depth. The **regard ward** is its unique mechanic: no cycle, marks ground under anyone still for 0.8s inside 170u, sears 0.85s later. Hold time measured (`npm run regard`), not assumed — see findings. Tilesets deliberately undeclared and **unassigned**; floors fall back to a flat fill in the §6 palette. The reserved `tower` drop kind went live in `db4652e` — the ascent's clear cache pays its own table keyed on height (Sandals at 15, Hymn at 30), with the §20 preview asking the same query and `npm run relics` guarding it as gate-below/gate-at pairs. |
| 22 | Rifts / war concept | **done** | One field, not a system: every `RunMode` carries `lore` beside `blurb` — mechanics stay in `blurb`, the world's reason lives in `lore`. Six lines, all quotation from `game_story_worldbuilding.md`. Reaches the player on every Dive/Rifts/StarMap/Vigil/Convergence aside and on each hub portal via `stationLore`. Checked in `tools/previews.ts`: lore must name the war, differ from the blurb, avoid payout words and hardcode no keys. |
| 23 | Planets / materials layers | **done** | `src/data/layers.ts` — four bands down (Surface / Deep Delve / Hell Layers / Hell Endgame), three up (Tower Base / Heaven Layers / Celestial Endgame), three off both ladders. Every run answers "where in the war am I" via `DepthProfile.layer`; nothing in the sim *reads* a layer, it is legibility not mechanics. Band edges sit on depths `biomeFor` already changes at. Also widens the Reliquary — a sector opens on its ladder OR the account frontier — with monotonicity in the frontier asserted, so no existing save can lose access. `tools/world.ts` in `npm test`. |
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

**RETRACTED 2026-09-09: the endgame ruling, and the 6/21 roster spread.** Both came from
`docs/difficulty-curves.md` §2/§3/§4, and **those characters were wearing nothing.**
`requiredLevel` is `ilvl - 1`, and `tools/curves.ts` rolled every rung's gear at an ilvl
above what the character could legally equip, so `equipFromInventory` silently refused all
of it; the affinity safety net never fired because `weaponFamily` reports an empty hand as
`"sword"`. §3 was a level sweep with no equipment. §2 has a *cliff* exactly where it
reported a wall — the character loses maxHP from depth 12 to depth 15 because that is
where its kit stopped being wearable. §4's 6/21 is a spread between 19 characters wearing
one item and 2 (swordsman and paladin, the sword-affinity classes) wearing none. **Do not
put 6/21 in front of the owner.** Found by the session that wrote the document, catching
itself building the same bug a second time. See the banner on `docs/difficulty-curves.md`.

**What survives: `recommendedLevel` is wrong.** Independently reconfirmed on the corrected
harness — at depth 20 at the advised level a character in Basic gear reaches 15% of the
objective while one in Legendary clears 3/3. That was always the headline and it holds.
The corrected power and roster sweeps are running; the ruling on a curve retune is
**reopened and unanswered** until they land, and "no curve retune" should not be quoted
as settled in the meantime.

*The lesson, sixth of the day:* the instrument produced a plausible monotone-looking grid,
and plausibility was doing the work verification should have. The fix is the standing one
— the corrected harness now prints how many items each character has on, flagged when
short of six. An assertion that names its own subject cannot rot into a tautology.

**RETRACTED earlier the same day: a "floors stall constantly" finding** (25–67% of floors).
It was an instrument fault — the measurement bot called `FlowField.direction(x, y)` against
a signature of `direction(level, x, y)`, getting `null` every time, so it never pathfound
and its own failures to reach monsters were logged as stalls. Caught by the investigating
session falsifying its own detector before publishing. Re-measured: 0% at every depth to 30.
Kept because the near-miss is the lesson, and because it has a root cause worth fixing —
see the typecheck gap below. What survives: `dungeon.ts:1288`'s wave gate is genuinely
fragile and worth a cheap guard (ordinary hardening, not critical path), and monsters do
spawn clipping a wall at ~1.9% at depth 35.

**`recommendedLevel` is lying to players — confirmed twice, on two instruments.** At the
level and gear the game advises, floors from depth 18 down killed the character in 6–22
seconds having completed 0–3% of the objective; the corrected harness reproduces the same
verdict from the other direction (depth 20, advised level: Basic gear 15% of the objective,
Legendary 3/3). A number shown in the UI is actively misleading. Fix in flight on
lootsim-26's branch — measurement first, then `src/data/depth.ts:182`.

**`tools/` has never been typechecked, and the gate was full of checks that measure
nothing.** `tsconfig.json` is `"include": ["src"]` — which is simply what `npm create vite`
gives you; nobody chose to exclude `tools/`, and an acceptance culture grew up beside it
without anyone noticing the gate itself was outside the gate. esbuild strips types without
checking them, so every acceptance test in this repo has only ever been type-stripped.

Typechecking it surfaced **69 errors across 14 files, of which eight are real**. Two are
checks in `npm test` that assert nothing:

- **The early-extract key forfeiture has never been tested.** `tools/smoke.ts` sets
  `d.loot.keys.basic = 4` against a `Record<ChestTier, number>` keyed
  `Basic`/`Advanced`/`Elite`/`Legendary`, so the run never held a key and the check compares
  `undefined === undefined`. CLAUDE.md says of that penalty: "**Don't soften this** — it's
  the whole risk/reward decision the floor exists to create." Whether keys actually survive
  a bail-out is now an open question.
- **A follow-up check ticks the floor but not the player.** `tools/rules.ts` calls
  `d.update(0.5)` with no input, so the local hero is skipped; the check is named "expires
  *and is dropped*" and only ever tested the clock half. Same arity class as the retracted
  stall finding, in the gate itself.

The rest: `MockWorld` shadows its own `zones()` generator with a field and is four methods
behind `CombatHost` (zone targeting and four host capabilities have zero coverage); a status
option that doesn't exist, so a "chilled" setup isn't chilled; `def.ultimate` always false,
so the arena kit census has never counted an ultimate; a `minDepth` read off a union that
includes the reserved raid/tower kinds; and a `requireTags` gate tested against a tag the
game can never emit.

**RESOLVED.** `npm run check` is now `tsc --noEmit && tsc --noEmit -p tsconfig.tools.json`,
so the gate is inside the gate, in the command everyone already runs. All eight fixed; none
of the repaired checks went red. In particular **the early-extract key forfeiture was always
correct in production code** (`earlyExtractLoot` does `this.loot.keys = emptyKeys()`) — only
its check was broken. It is now mutation-proved and prints its own counts
(`4 keys carried, 0 -> 0 banked`), because a check whose only possible output was `0 -> 0`
is precisely how it went quiet.

A second `tsconfig.tools.json` rather than widening the existing include, so `src` keeps
`"types": []` and the game half still cannot see Node's globals — one config would have
handed `process` to `src/data/`, the exact layering rule that directory lives under.

**Still open, and deliberately not counted as done:** five capabilities are
reachable-but-untested — `consumeCorpses`, `commandSummons`, `sacrificeSummons`,
`redirectDamage`, and zone targeting via `host.zones()`. Implemented so a check *can* be
written; writing them is unscoped work.

**Also logged, not done:** `CastResult` wants to be a discriminated union — `ok: true` should
carry `targets`. Until it does, every call site is one optional chain away from silently
reporting "reaches nothing" about an ability that reaches plenty.

**A real crash in `AbilityRuntime.notify`** (`src/combat/runtime.ts`). It iterates
`this.pending` backwards, splices inside the loop, and calls `runEffect`, which re-enters
`notify` and splices again — so the outer index can end up past the end of a now-shorter
array and `this.pending[i]!` reads `undefined`. The `!` is what hid it from the type system.
Reproduced (duelist, depth 20, seed 72231); in a browser it ends the run. Being fixed.

**Two live bugs fixed 2026-09-09**, both found while doing something else:

- **A counter that caused the event it countered crashed the run.** `AbilityRuntime.notify`
  *and* `tick` both walked `this.pending` by index and spliced as they went, then called
  `runEffect` inside that walk — so a re-entrant emit spliced the same array and the outer
  index read `undefined`. In a browser this ended the run and every unbanked item in it.
  Fixed by claiming matching entries before any of them runs.
- **Co-op clients drew stationary saws.** A snapshot sends three numbers per hazard and
  deliberately omits a saw's position, since its track is deterministic from the seed and
  `t` along it is the whole story — but nothing on the client ever turned `t` back into a
  position. Found while mapping the trap wire for the Tower's regard ward, which needs the
  same derivation and would otherwise have shipped the bug twice.

**Three of the Forge's eight essences charged real material and did nothing.** Live defect,
not a missing feature. The Craft screen cycles all eight `MAGIC_ELEMENTS`; `craftItem`
charges `craftEssenceCost` in that element's material and passes `favorElement`; `rollMods`
favours by *filtering the pool for* `dmg-<e>`/`res-<e>` *and tripling what it finds* — and
`MOD_POOL`'s elemental block was built from `LOOT_ELEMENTS` only. So for holy, arcane and
nature the filter found nothing, the tripling multiplied nothing, and the roll was
bit-for-bit what spending no essence would give. A Gilt Reliquary is a farmed
planet/Reliquary drop. Same root cause made every Tower holy variant drop inert.

Fixed by authoring the reserved three through the same `elementalMods(e)` the loot elements
use — identical numbers by construction, so "kept out of the pool" cannot quietly also mean
"worse" — exported as `RESERVED_ELEMENTAL_MODS`, *not* in `MOD_POOL`, spliced in only when
`favorElement` names that element. Measured over 4000 epic rings: holy went 0.0% unfavoured
/ 0.0% favoured to 0.0% / 47.3%, against fire's 16.4% / 50.1%. Both halves matter — the
essence works, and an ordinary drop still never rolls holy.

**Shipped 2026-09-09 in `2b8e79b`, guarded.** `tools/forge.ts` section 8 asserts it as a
comparison over *all eight* essences — "every element the Forge sells changes the roll",
never "five of them do" — with the paired assertion that an ordinary drop still can't roll
a reserved element. The Forge's essence list is now one constant (`CRAFT_ESSENCES`) so the
seller and the test cannot disagree again, which is what let this hide.

**The regard ward's hold time: the measurement contradicted the approved remedy.** The
ranged tax is real (×1.29 marks per minute in reach) but *lengthening the hold makes it
monotonically worse* — ×1.49 at 0.55s, ×1.29 at 0.80s, ×2.71 at 1.10s, ×2.67 at 1.40s.
Melee stillness is many short pauses (still ~40% of the time, markable ~13%); ranged
stillness is one long park (still ~67%, markable ~50%), so a longer hold filters out exactly
the short melee pauses and leaves the long ranged park untouched. The hold is not a fairness
dial. 0.8s stands as the minimum of both ratios in the shippable window — the opposite of
the reason it was approved.

---

## Handoff, 2026-09-09

Master is green (`npm test`, 2532 checks) with `feat/world-structure` merged: the Forge
essence fix and the `tower` drop kind.

**One item is written down and unwritten:** a single relic-tier Heaven exclusive for the
height-25+ Tower cache — the third customer for that cache, so a destination whose deep
cache only pays out other places' relics stops being one. Flavour direction from the
owner's cosmology: Heaven's identity is *imposed order*, nothing is allowed to deviate, so
the relic should be about order applied to **you**, not to your enemies.

**Name it after the Thrones, not the Dominions.** "Dominion" is Hell's one-word identity in
the three-sided cosmology — *creation belongs to those strong enough to claim it* — so a
Heaven relic carrying it reads as the wrong side entirely. Thrones are the doc's
manifestations of divine law, which is the right register. (Caught by lootsim-97 on the way
out; `docs/game_story_worldbuilding.md` is the tiebreaker, as always.)

**Also open:** the three Tower tilesets (`tiles.tower-lower`/`-mid`/`-upper`), unassigned
since the Sonnet session exited; `recommendedLevel` (`src/data/depth.ts:182`), confirmed
wrong on two instruments, fix not landed; the corrected power and roster sweeps, which
have to run before the curve-retune ruling can be re-answered; and §15 raids, an owner call.
