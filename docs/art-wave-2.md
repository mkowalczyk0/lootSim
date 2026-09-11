# Art & content wave 2 — a menu, priced

**Status: proposal. Nothing here has been generated.** Written 2026-09-10 against master
`f421c38` for the owner to pick from. Every gap below was re-measured on that commit rather
than read from `docs/art-manifest.md`, because the manifest's ledger (§9) has gone stale in
three places — see §0. The creative rule throughout is the one the raids and the Tower
already followed: **mine `docs/game_story_worldbuilding.md` before inventing anything.**
Every monster, item and place proposed here is named in that doc or built directly from a
line in it; where a concept is mine rather than the doc's, it is marked *(extrapolated)*.

Prices are in two currencies. **Generations** are PixelLab's unit — the account has 1,280
left this cycle, resetting 2026-10-07, and the estimates below are ranges taken from what
the same kind of asset actually cost in this repo (the animation and raid-boss records keep
receipts). **Session time** is the real cost: a sprite's generation is minutes, and its
finishing — accent count, `worldScale`, manifest row, gate, contact sheet, *looking at it* —
is most of a session-hour. The ambitious options are priced honestly and are not filtered
out. My recommendation is at the end, and it is not the cheap one.

---

## 0. The gap table, corrected

The brief's table was drawn from the manifest's §9 ledger. Three rows are wrong on master:

| gap | brief said | master `f421c38` actually has |
|---|---|---|
| Tower tilesets | 0 of 3 | **3 of 3 painted and wired** (`tiles.tower-lower/-mid/-upper`), plus `tiles.first-heavens` for the Tyrant's arena. Manifest §8 records this; §9 was never updated. |
| Cosmetics | 8 of 24 grids | **24 of 24 PNGs committed** under `atlas/cosmetics/`, all 24 with `ATLAS_COSMETICS` rows. Not rendered by me — the owner should eyeball the wardrobe once, but it is not an art gap. |
| Named items | 27 exist, 11 of 19 drawn | **21 exist, 11 of 21 drawn.** The eight raid-exclusives have no icon; so do two craft-only items nobody listed (`unbound-ward`, `rootbound-plate`). |

Rows that are correct: **6 of 11 monster archetypes borrow another role's silhouette**;
8 raid relics/artifacts (of 39) have no icon; 0 of 16 affix glyphs are pixel art; 2 of 14
weapon families have an authored skin (the seven legacy skins draw through a tint rung).

Two gaps the table does not have and the fiction insists on, both found while checking it:

- **Fourteen bosses drop no named item at all.** Every named source points at the five
  Delve bosses, the Provings, the raids, or a chest/cache/recipe. The nine Reliquary sector
  bosses and the five Tower bosses — 14 of the game's 28 encounters — pay nothing named. The
  worldbuilding doc's whole Reliquary premise is *"every weapon forged from those materials
  exists because something had to die to create it"*; today nothing that dies there becomes
  anything in particular. This is where the owner's "a lot more craftable named items"
  belongs, and it is why §4 is shaped the way it is.
- **The Delve is still six legacy biomes, not nine circles.** `BIOMES` is Training Grounds /
  Whispering Forest / Dark Cave / Ashen Wastes / Dragon's Lair / The Veil. The tilesets
  under them are already named `delve-limbo`, `-gluttony`, `-wrath`, `-heresy`, so the
  rework the worldbuilding doc asks for is half-done: the *floors* know they are circles and
  the *names the player reads* do not. Lust, Avarice, Violence, Fraud and Treachery have no
  floor of their own. Priced in §5 as the ambitious environment option.

---

## 1. New monsters

### 1a. The six missing silhouettes — skins for behaviours that already exist

This is the single highest-leverage art gap in the game and has been since UAT §2 landed.
`ENEMY_SPRITES` in `render/draw.ts` says it out loud: charger draws as a grunt, bomber as a
swarmer, shieldbearer as a brute, summoner and leech as the caster, sniper as the archer.
Style guide §1.5 — *a sniper is not a recoloured grunt, it is a different shape* — is
violated on every floor from depth 8 down. A player cannot tell a Bloatfiend from a Crawler
until it detonates on them, which is the opposite of what a telegraphed game promises.

These are **skins, honestly**: no new behaviour, six new bodies. Silhouette language is
already specified (style guide §10.2, manifest §3.2); I'd add one thing per body that the
existing spec under-sells:

| role | one silhouette fact the body must carry |
|---|---|
| charger (Gorehound) | the *wind-up crouch* is the tell the player dodges, so author it low and forward-loaded — a shape that looks like it is about to go |
| bomber (Bloatfiend) | the hot accent shows *through cracked skin over the whole body*, not in an eye — the one monster whose accent is its death, not its gaze |
| shieldbearer (Aegis Thrall) | asymmetric; the shield is a slab of *Wargrave* salvage (a door, a coffin lid, a siege plate) — Purgatory's monsters carry the war's wreckage |
| summoner (Grave Piper) | a satchel / egg-sac silhouette and *raised arms*; must read "kill me first" at range |
| sniper (Deadeye) | tall, still, one oversized eye or barrel; the aim-line is `fx`, the body just has to support a held pose |
| leech (Rot Priest) | thin, floating, a censer or bell — support/healer language; the tether is `fx` |

**Price:** 6 sprites. Generation 4–8 each including rerolls (the Tower's five cost about that,
finished in one script, `art/monsters/finish-tower.ts`). **≈ 25–50 generations, 1 session.**
Wire: six `ATLAS` rows, six `SPRITE_OVERRIDES` entries, six procedural 18–24px fallback grids
(the `SpriteName` union is closed and `buildSprites` is exhaustive, so a grid is required —
that is a compile-time rule and the good kind). Gate: `npm run smoke`, `npm run chroma`,
`npm run art`, then a contact sheet, looked at.

### 1b. The Tower's six — the same roles in Heaven's silhouette

Once 1a exists, the Tower has the same six holes: `MONSTER_SETS.tower` names five roles and
the other six fall to the Hell sprites. `docs/monster-sets.md` §4 already made the ruling
that a palette swap is not enough (*Order vs Dominion lives in silhouette*), so these are six
more bespoke bodies, drawn from the Celestial Hierarchy the Tower's `enemyNames` already
uses: a charging **Power**, a **Throne** that is a rolling wheel of eyes (the bomber — a
Throne "detonating" into judgment fits the doc's *manifestations of divine law*), a
**Cherub** shieldbearer (guardians and watchers), a **Dominion** summoner (celestial
rulers and commanders — already the caster's name), a **Virtue** sniper (miracle-working —
a bolt from across the room), and a **Principality** leech (rulers over territory, keeping
their ground alive). All six names are the doc's own orders.

**Price:** same as 1a. **≈ 25–50 generations, 1 session.** No new code — the seam is built.

### 1c. New archetypes — new behaviour, honestly priced as engineering

The style guide's role list has 15 roles; the game has 11. The worldbuilding doc's Nine
Circles name three behaviours the game genuinely cannot express today, and each is a
behaviour, not a skin:

| archetype | circle | the question it asks | what it costs beyond art |
|---|---|---|---|
| **The Lure** | II — Lust: *"enemies that lure players into danger", "forced movement"* | it pulls you *toward* it — the inverse of every knockback in the game — and the danger is what it is standing in | a `pull` step already exists in `src/combat/`; new `EnemyBehavior`, telegraph, AI in `game/dungeon.ts`, smoke coverage |
| **The Mimic** | VIII — Fraud: *"mimics", "false portals", "fake floors"* | that pickup / that chest / that dim portal is a monster until you are close enough | a new spawn shape (it starts as a prop or a drop sprite), reveal telegraph, and a rule that it never counts toward the kill quota until revealed |
| **The Devourer** | III — Gluttony: *"enemies that consume other monsters"* | it eats a wounded ally to heal and grow, so the room's *other* bodies are its resource | AI (target an ally, not you), elite-style growth on eat, cap so it can't stall a quota |

Each of these is an `EnemyKind` (closed union, exhaustive tables everywhere — good) plus a
behaviour branch, plus a smoke scenario proving the floor still finishes (a Mimic that hides
forever or a Devourer that eats the last quota body would wedge the objective). **That is
2–4 sessions per archetype of simulation work before the sprite**, and a balance change
the campaign check has to see — so per `CLAUDE.md`, a widened A/B against master, not a
default smoke run. Art is the cheap part: 4–8 generations each.

*Recommendation inside this section:* build 1a and 1b as skins this wave. Build **one**
archetype — the Lure — because it is the cheapest (the pull step exists), it introduces a
question no other monster asks, and it gives Circle II an identity the rework in §5 needs.
Park the Mimic and Devourer as designed-not-built until the Nine Circles rename decides
whether Fraud and Gluttony get their own floors.

### 1d. The elite frame (small)

Style guide §10.4 specifies a slow-rotating **broken-halo ring** behind an elite in ash-bone;
today `draw.ts` strokes a plain rarity-coloured ring and a chevron. One authored ring sprite
(a cracked halo, 40–60px, greyscale so the rarity tints it) makes an elite read as *a broken
thing wearing a crown* rather than a target lock. **2–4 generations, half a session.**

---

## 2. Animation — what reads as static, and what moving would buy

The measured state (`npm run animcoverage`, and the manifest rows on master):

| animated | tags | reach |
|---|---|---|
| `boss.warden` | idle + cast | Delve depth 5 + 6 Provings |
| `boss.corrupted-saint` | idle + cast | Delve 10 + 5 Provings |
| `boss.gravebound-colossus` | idle + cast | Delve 15 + Provings |
| `boss.ferryman` | idle + cast + **a real blow** | 1 raid |
| `boss.war-queen`, `boss.exiled-tyrant` | idle + cast + a rise (not a blow) | 1 raid each |

Static: the Herald and the Nameless (Delve 20, 25+ and their Provings), the Minotaur (held —
a 1px-per-eye accent dies under generation; widening it is a change to shipped art the owner
has to okay), **all five Tower bosses** (an entire ladder with no animated boss), **all ten
monster sprites** (a code-side bob is the only motion on every floor's trash), and the hero.

**On the instrument, since the brief warned about it:** `npm run windup` ranks the War
Queen's `strike` as the best-travelling tag in the repo and it is a recovery, not a blow.
`docs/animation.md` has the whole family — silhouette XOR can't see rotation, distance-from-rest
is a veto that passes a deformed blob, a free-form run is a loop so its end frames are junk.
**Every animation in this wave is accepted by a rendered contact sheet and an eye**, with the
scripts used only as vetoes. Nothing below is accepted on a green number.

### 2a. Monster idles — the world moves (cheap, wide)

Trash is what a player looks at for four floors in five, and none of it moves. An idle is the
one thing the generator does reliably (a loop is what it makes), and the Warden's idle cost
one generation. Ten existing monster sprites + the twelve from §1a/1b = 22 idles.
**≈ 25–45 generations (1–2 each, rerolls on small-accent sprites), 1–2 sessions.** The accent
probe rule applies: any sprite with an accent under ~6px gets a one-generation idle probe
before anything else is spent on it — the Warden's 4px held at 2.3× headroom, the Minotaur's
didn't, and the docs say which variable decides.

### 2b. Finish the Delve ladder's wind-ups — Herald and Nameless

The Nameless covers depth 25+ *and* every Proving that borrows it; the Herald covers 20 and
its Provings. Both are static. The docket's §7 reorder deliberately put the Warden first on
reach and reachable-band grounds; with Warden/Saint/Colossus done, these two finish the
Delve. Idle + pinned wind-up each: **≈ 3–6 generations each, half a session each.**

### 2c. The Tower's five — a ladder with no animated boss

Idle + wind-up on all five Tower bosses. **≈ 15–30 generations, 1–2 sessions.** Reach is one
encounter each (nothing borrows a Tower boss), so per the borrow-graph rule this ranks below
2b — but "the whole ascent is static" is something a player notices as a *ladder* property.

### 2d. The blow — docket §19, and it is the owner's decision

Every cheap route to a strike is closed with evidence: free-form generation, rigid transform,
compositing. What is left is **one hand-authored impact pose per sprite**, differentiated on
body not weapon height (the Ferryman's lesson: an arms-down pose is near rest by definition).
Four poses buy 23 of 35 encounters (Warden 7, Saint 6, Colossus 5, Herald 5); twelve finish
the roster. This is pixel authoring in Aseprite, not generation — **half a session to a
session per pose, ≈ 0–3 generations each** (a pinned segment from the authored impact back
to rest). The docket already has the owner's own word for the current state — *"halfway"* —
so this is not something I'd leave off the menu, and it is not something a session decides.

### 2e. The hero — flagged, not proposed

The hero is closed. A walk cycle off the committed `hero.legend-base.png` is not a redraw,
but every animation route this repo has measured *re-renders* the input (frame 0 drift, thin
feature erosion), so it is not nothing either. **Not in this wave.** If the owner wants the
hero to walk, that is its own conversation with its own acceptance: the PNG at rest stays
byte-identical.

---

## 3. Icons — the ten named items and eight relics with no picture

Same pipeline that authored the other 11 + 31, proven and cheap: 20–45px icon, transparent,
rarity frame is CSS. Eighteen icons: the eight raid named items, `unbound-ward`,
`rootbound-plate`, the four raid relics and four raid artifacts (identities are already
written in manifest §2.2/§2.3). **≈ 30–55 generations (1–3 each), 1 session.** Every one
routes through `itemSprite` — one item, one picture — and `npm run itemart` holds it.

Add the **16 affix glyphs** (8×8, one per `MONSTER_AFFIXES` entry, replacing Unicode text)
as a half-session, near-zero-generation item: at 8×8 these are drawn, not generated, and
they need a small new atlas table since no 8×8 precedent exists.

---

## 4. Named items — concepts and art (d8 owns every recipe number)

I've written to d8 to split this: I concept and draw, they price and wire the economy. What
follows is the concept list; every material, coin, Ash and component figure is theirs and
deliberately absent here. Crafting stays capped at mythic on every path, as it is today.

### 4a. The Reliquary Nine — one craftable per sector, and a reason to kill its boss

The Reliquary is *the* crafting layer in the fiction and pays nothing named today. Each
sector has a material and a boss; each item below is crafted from **that sector's material**
plus a **component that sector's boss drops** — the exact two-step shape `the-seal-unbroken`
already ships (kill the Warden, bring the First Seal to the Forge). Two sectors already have a
craft-only item (`unbound-ward` for the Spire, `rootbound-plate` for the Orchard), so this is
**seven new items** completing a set of nine, and it turns 9 bosses that pay nothing into 9
bosses each worth farming for a specific thing. Fiction is lifted from each sector's own
paragraph and its boss's title in `data/planets.ts`.

| sector · boss | item | slot · rarity | what it does (prose; vocabulary exists) | the icon |
|---|---|---|---|---|
| Wargrave · The Grave-Standard *"raised over the dead, now it fights for them"* | **Haft of the Grave-Standard** | hammer · mythic | kills near you build a rally; your next skill after three kills hits harder and knocks back | a snapped standard pole, banner stiff with mud, iron cap |
| Rotting Garden · The Gardener's Remains *"it still tends the beds"* | **The Gardener's Shears** | daggers · mythic | hits inflict venom; a venomed enemy you kill leaves a poison bloom | rust-green shears, a flower grown through the hinge |
| Cinder Catacombs · The Ember-Sealed *"interred here to keep it burning"* | **Interment Plate** | armor · mythic | fire resist; taking a hit vents a burn nova; the seal glows brighter the lower your health | a blackened breastplate with one live seam of ember |
| Frozen Basilica · The Choir Preserved *"frozen mid-hymn"* | **Hymnal of the Preserved** | talisman · mythic | skill use chills nearby enemies; chilled enemies take more from you | an ice-cased hymnbook, pages frozen mid-turn |
| Storm Sepulcher · The Last Standard-Bearer *"the battle ended, nobody told it"* | **The Buried Bolt** | bow · mythic | shots pierce; a critical hit calls a second bolt down on the target | a stringless bow with a fixed line of lightning where the string was |
| Black Archive · The Index *"it has an entry for you"* | **The Index's Entry** | ring · mythic | on dodge, a void bolt at the nearest enemy; drain on hit | a ring of black glass carrying a line of text that is not there |
| Gilded Ossuary · The Reliquary Saint *"interred whole; it did not stay that way"* | **Saint's Finger** | necklace · mythic | heal on kill; every fifth kill a holy nova | a gilded finger bone in a cracked glass phial |

Two per-sector notes for d8: the Spire's and the Orchard's existing items could gain the same
boss-component step so the set is uniform (a data change, no new item); and the component
each boss drops can be the boss's *own* small named drop (a "remnant"), which also fixes the
"14 bosses drop nothing" finding in the same stroke.

### 4b. The Tower's Orders — five boss drops, not recipes

The Tower's five bosses each want one exclusive drop, in Heaven's idiom: symmetrical,
bone-gold, *too perfect*. Names are the doc's celestial orders; the last mirrors
`a-name-withheld` (the Nameless's unspoken ring) from the other ladder.

| boss | item | slot · rarity | prose | icon |
|---|---|---|---|---|
| Cherub of the Lower Gate | **The Gate's Regard** | necklace · legendary | crit chance; standing still briefly sharpens your next hit (the Tower's `regard` ward, worn) | a single closed eye in a ring of bone |
| Virtue of the Second Ascent | **Small Miracle** | ring · mythic | potions heal over time instead of at once, for more in total | a drop of gold suspended in a glass ring |
| Power of the Third Rampart | **Rampart of the Third** | shield · mythic | block; a blocked hit fires a holy bolt back along its path | a perfectly square shield with no scratch on it |
| Throne of the Fourth Judgment | **Sentence** | hammer · mythic | hits mark; a marked enemy that attacks you takes holy damage | a gavel-shaped hammer, symmetrical, no grain |
| What Sits Above the Orders | **A Rank Without a Name** | ring · divine | your ultimate lands as holy regardless of gear, and shields you | a ring with a setting and nothing set in it |

### 4c. The Circles — seven more craftables, for the rename in §5 *(extrapolated from the doc's themes)*

If the Nine Circles rework proceeds, each circle without a named item gets a **craftable**
one, built on its theme in the worldbuilding doc. Limbo and Gluttony already have drops
(`limbos-lantern`, `gluttons-grasp`), so seven. These recipes have no sector material to
anchor on; the component shape (N items of a slot, coins, Ash) is d8's to choose.

| circle | item | slot | prose |
|---|---|---|---|
| II Lust | **The Beckoning Hand** | gloves | your skills pull enemies a step toward you |
| IV Avarice | **The Miser's Weight** | necklace | coin and gem find; sells for nothing |
| V Wrath | **The Unswung** | axe | attack speed climbs while you keep swinging, resets when you stop |
| VI Heresy | **Halo, Inverted** | talisman | holy skills strike as void; void skills as holy |
| VII Violence | **Siege Argument** | bow | shots pierce and knock back; slower |
| VIII Fraud | **The Second Face** | necklace | dashing leaves a brief decoy that draws aggro *(needs the `summon` step to accept a decoy unit — check before promising)* |
| IX Treachery | **Oathfrost** | daggers | cold; hitting a chilled enemy from behind executes on the wounded (the execute rule's threshold applies for free) |

### 4d. Named weapons that swing as themselves

The owner ruled *"named weapon wins"* over a skin; the rung is live in `resolveWeaponDraw`
and has nothing to draw. Six named weapons exist today (Threshold Brand, Heaven's
Severance, Pole of the Three Rivers, The War-Queen's Reach, The Early Word, Chorister's
Idol — the last two are staff/talisman) plus the six weapons in §4a/4b/4c. Each is one
authored +x world sprite in `ATLAS_WEAPON_SKINS`, `worldScale` derived from the family so it
cannot lie about reach. **2–4 generations and a half-session each**; the six existing ones
first.

### 4e. Price of §4 as a whole

| slice | items | icons | world sprites | generations | sessions |
|---|---|---|---|---|---|
| 4a Reliquary Nine | 7 (+2 data changes) | 7 | 3 | 15–30 | 1 art + d8's recipe session |
| 4b Tower's Orders | 5 | 5 | 2 | 10–20 | 1 |
| 4c Circles | 7 | 7 | 3 | 15–30 | 1 + depends on §5 |
| 4d named weapon sprites (existing 6) | — | — | 6 | 12–24 | 1–2 |

Every item is one data entry; `npm run named` refuses an entry pointing at a boss that
doesn't exist or an effect the vocabulary can't say, and `npm run previews` proves the
preview lists exactly what the roll can pay. None of this is engine work.

---

## 5. Environments

### 5a. The Avarice Rift has no floor of its own (the one true whole-environment gap left)

`MODES.hoard` sets no `tileset`; the Avarice Rift shows whatever Delve biome its effective
depth would. It is the only standard mode borrowing someone else's floor, and its look is the
best-specified in the guide: *Circle IV — tarnished gold over grime, coin drifts, piled
weapons, treasure cages.* One tileset (`tiles.delve-avarice`, which the Circle IV rename in
5b would then reuse) plus two or three Avarice set-pieces (a coin drift, a treasure cage, a
weapon pile) for `dressFloor`. **≈ 10–20 generations (tilesets reroll; the value-not-hue and
substance-not-adjective rules in §17.7 cut that), 1 session.** Gates: the contrast and
±14-spread checks in `npm run smoke`.

### 5b. The Nine Circles — the ambitious option, and it is content, not only art

The worldbuilding doc's Delve is nine circles; the game's is six biomes with legacy names.
Doing it properly is: rename the six `BIOMES` to their circles (Training Grounds → Limbo,
Whispering Forest → Gluttony, Ashen Wastes → Wrath, Dragon's Lair → Heresy, The Veil stays
Abyss-touched; Dark Cave is *already* frozen cavern rock and reads as Treachery's ice, but
sits at the wrong depth), add tilesets for **Lust, Avarice, Violence, Fraud** (Avarice from
5a), and re-cut `biomeFor`'s bands so nine circles tile depths 1–30 with Treachery at the
bottom where Lucifer is. Then the Circle items in §4c have floors to belong to.

The honest cost is not the art — four tilesets is 40–80 generations and 2 sessions. It is
that `biomeFor`'s five-depth edges are load-bearing: `data/layers.ts` sits its bands on them,
`npm run world` pins that, `DRESSING` is keyed by `BiomeStyle.name`, and the raid arenas and
Convergence borrow specific delve tilesets by id. **Re-cutting the bands is a world-structure
change that needs the owner's say and `npm run world` re-baselined, ≈ 2 sessions of code and
checks on top of the art.** A rename *without* re-cutting (six circles' names on six bands,
three circles skipped) is cheap and cowardly; I'd rather price the real thing and let the
owner choose.

### 5c. Set pieces for the three newest sectors

Gilded Ossuary, Unbound Spire and Hollow Orchard dress from the generic Reliquary set. Two
pieces each (a gilded saint on display; a ward-circle that isn't closed; a tree grown through
a grave marker) so each reads as *itself*. **≈ 12–18 generations, 1 session.** This also
speaks to the manifest's recorded open finding that those three sectors show no escalation —
dressing can't fix a flat infusion curve, but it can stop the floor looking identical top to
bottom.

---

## 6. Two menus, and my recommendation

### Menu A — the focused wave (≈ 6–8 sessions, ≈ 180–300 generations)

1. **§1a** six Hell silhouettes — the gap that violates the style guide on every deep floor.
2. **§2a** idles for all monster sprites — the whole world starts moving for ~40 generations.
3. **§4a** the Reliquary Nine + **§3** the eighteen missing icons — exactly the owner's ask,
   and it converts nine bosses that pay nothing into nine reasons to run a sector.
4. **§2b** Herald and Nameless wind-ups — finishes the Delve ladder.
5. **§5a** the Avarice Rift's floor.

### Menu B — the ambitious wave (≈ 16–22 sessions, ≈ 400–600 generations, inside this cycle's budget)

Everything in A, plus **§1b** the Tower's six, **§1c** the Lure, **§2c** the Tower bosses,
**§4b** the Tower's Orders, **§4d** the six named weapon sprites, **§5b** the Nine Circles
(with the §4c Circle craftables riding it), **§5c** the sector set pieces, **§1d** the elite
frame and the affix glyphs. §2d, the blow, is listed separately because it is a pose-authoring
decision the docket already holds for the owner and no menu here should make it for them.

### Recommendation: B, with two things done first and one thing not done

This owner has taken the expensive option twice when told the price, and the reasons are the
same here: the cheap items in A are *necessary* — nobody should ship another wave with a
Bloatfiend drawn as a Crawler — but A on its own leaves the Tower a place where the trash is
Hell's, the bosses don't move and nothing drops, and it leaves the Delve named "Dragon's Lair"
under a worldbuilding doc that says Heresy. The generation budget is not the constraint
(B fits with margin); session time is, and the work parallelises cleanly across sessions by
section because the seams (`MONSTER_SETS`, `ATLAS`, `anim`, `NAMED_ITEMS`, `TILESETS`) are all
built and gated.

Do first, in either menu: **§1a and §2a**, because every other art item is judged by eye on
a floor, and a floor whose monsters are the right shape and moving is the frame everything
else gets looked at in. Do not do this wave: **anything to the hero**, and **any second
mythology** — every name above is already in the doc, and the moment a concept needs a new
god it is the wrong concept.

### What needs the owner before it starts

- **§1c** a new archetype is a balance change (widened A/B, not a smoke run).
- **§2d** the blow poses — docket §19, already theirs.
- **§5b** re-cutting the Delve's bands — a world-structure change.
- **§4b/4c** put named drops on the Tower and Circle craftables in the Forge — d8's recipe
  pass has to agree the economy holds (`npm run forge` asserts it as comparisons).
- The Minotaur's eyes: three-plus pixels per eye is a change to shipped art, and it is the only
  thing between that boss and an animation.
