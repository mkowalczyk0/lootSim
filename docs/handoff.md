# Handoff — 2026-09-09 (evening)

Written at the end of a multi-session run: PM `lootsim-21`, with `lootsim-26`, `lootsim-56`,
`lootsim-76`, `lootsim-97`. **Master is green at `a0a80ef` (`npm test` GATE_EXIT=0, full
suite, verified after the last merge), the working tree is clean, and every branch this run
produced has been merged.** Fifteen merges landed.

This file replaces the previous handoff. Everything on that docket is closed.

---

## The previous docket, closed

| Item | Outcome |
|---|---|
| Chest augments WASD / click bug | **Fixed and merged** (98c4c57) |
| Bosses all fight the same | **Fixed and merged** (e015d27) — see below, the numbers are stark |
| Citadel/lobby looks wrong | **Fixed and merged** (068f6a4, 76d7ed0) |
| Delve drawing the Reliquary's monsters | **Was already resolved** — `SHARED_MONSTER_SETS` declares the overlap deliberately. No work needed. |
| Item-level axis (3 sites + guard + docs) | **Fixed and merged** (afcc198) |
| Rune Fragment / Heartwood Sap recipes | **Still open** — see below |
| Reliquary reachability (sectors 7–9) | **Still open** — see below |
| Raid party threat-rate direction | **Built, measured and merged** (e015d27) |
| Augment discount: divine or unspoken? | **PM ruling: stays on divine.** Closed. |
| Hero redraw | **Three candidates rendered, awaiting the owner's pick.** Nothing committed. |
| Animation + art overhaul | **Architecture, gate and three animated raid bosses merged.** Wind-ups blocked — see below. |

---

## The one thing blocking work: the hero pick

Three candidates were rendered on a real graded floor beside the unchanged monster cast and
sent to the owner. **Nothing is committed** — deliberately, so a rejected direction cannot be
mistaken for a starting point. The instrument (`art/characters/candidates.ts`) is committed
and re-derives every number from the PNGs.

|  | lever | px | colours | max chroma | head/body lum | world h | tiles | density |
|---|---|---|---|---|---|---|---|---|
| v4 shipped | — | 39×57 | 40 | 30 (skin) | 2.1× | 32 | 1.00 | 3.56× |
| A cut the ink | colour only | 16×41 | 27 | 35 (skin) | 1.17× | 32 | 1.00 | 2.56× |
| B coarse + tall | height only | 20×51 | 18 | **73 #dba820** | 1.6× | 58 | 1.81 | 1.76× |
| C both | both | 16×39 | 24 | 26 (skin) | 1.17× | 52 | 1.63 | 1.50× |

- **B carries a hot accent** (saturated gold buckle, chroma 73, plus lit blue eyes) — the
  §1.4 violation the hero is forbidden outright, and what v3 was rejected for. It is
  invisible to colour count, because one bright pixel pair costs exactly one colour. B also
  lands at h=51, inside a portrait dead zone (free to fix: pad to 52).
- **B and C do not subtly tower** — the monsters read as children beside them. Picking either
  commits to rescaling every monster's *drawn* size. Mechanically free (`worldScale` is
  decoupled from collision, so no hitbox, telegraph radius or camera geometry moves), but it
  reads as a more zoomed-in game.
- **The PM's read, offered and not decided:** the references put the *whole cast* at 2–3
  tiles and ours is at 1, so "too high in scale" may have always been a world-scale problem
  the hero merely made visible. The honest third option is "hero + cast rescale as one
  deliberate piece of work."

Findings that must not be re-derived a fourth time (all now in `NOTES.md` and the manifest):
- **Town portraits scale off art-pixel height (`heroMeta.h`), never `worldScale`** — so
  drawing the hero taller is free. Legal h band: **16–43, 46–50, 52–58, 78–87, 155–160**.
- `density = 2h / worldHeight`; the floor is fixed at 2.0 world units per art pixel, so both
  levers are one equation and a ratio can be targeted rather than guessed. `npm run inworld`.
- **PixelLab `standard` mode is the only mode that honours `shading: flat` and `detail: low`**
  — `pro` and `v3` silently ignore both. This plausibly explains several earlier passes
  coming back more rendered than asked for. In `docs/art-tooling-setup.md`.

---

## What landed, and what is load-bearing about it

### Bosses stopped being five fights in 44 costumes (e015d27)

Measured first (`npm run bossvariety`, in `npm test`). The owner's complaint was literally
true as data:

| | before | after |
|---|---|---|
| pairs that are the same fight | 74 of 946 | **0** |
| abilities in 100% of kits | quake, summon | **none** |
| full-kit overlap mean | 58.3% | 44.5% |
| Proving vs Proving mean / worst | 71.8% / **100%** | 50.5% / 88.2% |
| raid vs raid mean | 50.3% | **37.1%** |

- **14 encounters were byte-identical fights with a new name plate** — `planetBossSpec` and
  `towerBossSpec` spread the template and never touched `phases`. `variantPhases` gained a
  `drop` half; a variant that can only ADD ends up as the template plus more, which is
  exactly how quake and summon reached 100%.
- Eight new mechanics: `hunt`, `drift`, `sunder`, `blink`, `sanctuary`, `judgment`, `mark`,
  `crescendo`. Design record `docs/boss-abilities.md`.
- **A true dash-reader was declined and stays declined.** "A dash always beats them" is
  load-bearing. `judgment` punishes the reflex dash, not the dash.
- **THE FINDING THAT OUTRANKS THE FIX: a kit's difficulty is cadence × mean threat per card,
  NOT card count.** Adding low-threat abilities to a fixed-cadence rotation makes a fight
  *easier*. In CLAUDE.md's boss section.
- **Raid party threat rate works.** Ferryman T1 went 58%→96% clear rate solo-to-four; now
  67%→75%. T4's "bloodier without being winnable" inverts. `docs/raid-threat-rate.md`.
  **Instrument caveat: `dmgBill/player` is confounded when fight length moves.**
- `blink` needed no wire field — the interpolator snaps any remote body that moved further
  than legitimate movement could in one snapshot. **That is the precedent for the next
  discontinuous ability: handle it by distance in the interpolator, don't teach the protocol.**

### The animation seam (7ee1bd0, a8d3277, 1bf7fdc, 6860dd3, a0a80ef)

`docs/animation.md` is the pick-up-and-go document. Read it before touching this.

- The sim never learns about animation. The clock lives in `render/`, reads `BossState`'s
  existing `ability`/`castTimer`/`castTotal`, writes nothing. The co-op wire already carried
  all three, so a cast animation resolves identically host and client with **no new field**.
- **A wind-up is keyed to PROGRESS, not a clock**, because `DepthProfile.telegraph` squeezes
  cast length with depth — a free-running animation drifts the "now" frame away from the hit
  as you descend, which is backwards from where it is most needed.
- **`sprite()` returns FRAME 0 of a strip, asserted pixel-identical to what shipped before.**
  Every un-migrated call site keeps drawing what it drew; a missed call site is a still
  picture, not a bug. `spriteAt`/`tintedAt`/`silhouetteAt` are the opt-in.
- Three of four raid bosses idle: Ferryman, War Queen, Exiled Tyrant.

### Two new art gates

- **`npm run chroma`** — the hot accent as a comparison: the hero's loudest colour must sit
  **below** the monsters'. Also per-frame, on **both hue and chroma** (see below). Found and
  fixed `boss.warden`, which had no lit accent at all.
- **A floor may not be its own sector's element** (in `tools/smoke.ts`) — washes each monster
  sprite toward its biome element at the real `tinted()` 0.28 and asserts 28+ luminance
  separation from the graded floor.

---

## Open items, in the order I would take them

1. **The hero pick** (owner). Everything else in the art queue is downstream of it.

2. **The wind-up pipeline** — the top open item on the animation stream, and a real piece of
   work rather than a re-roll. `animate_image` free-form produces a **loop**: across three
   attempts with explicit one-shot prompting, every sequence peaked mid-way and came back
   toward rest (ferryman `8 21 31 39 41 43 40 39`, queen `1 1 2 6 7 10 17 9`, minotaur
   `6 13 18 23 26 26 22 17`). Because a wind-up is keyed to progress, **the last frame is
   what the player sees at the instant of the hit**, so these do not merely fail to help —
   they actively mis-cue, and would read worse than the static sprite. Three generations were
   rejected and committed as evidence under `art/anim/raw/` with a README saying they are not
   art waiting to be wired. **The fix is `last_frame_base64`**, which pins the ending so the
   generator interpolates between two poses — that needs a target pose authored or generated
   per boss, which is a different pipeline. `art/anim/windup-check.py` rejects any candidate
   that does not build monotonically and end at its extreme. **Run it before stripping.**

3. **The Ashen Wastes still hides its own monsters, and is deliberately held.** The Cinder
   Catacombs and The Veil were fixed and unpinned (e7f9047); the Wastes was not. Its best
   candidate reached Δ27 against a bar of 28, and — more decisively — the before/after
   picture does not clearly favour it either: the shipped blue-grey floor separates red
   monsters reasonably well, while the candidate's dark ember floor sits *closer* to the
   dark red grunt. It is also the first floor of the game. Four attempts, all numbers, and
   where a fifth should start are in `docs/ashen-wastes-infusion-fix.md` — **start there, not
   from scratch**. The owner has the before/after sheet and it is their call whether to move
   it at all. **Do not unpin without them.**

   A rule from this that generalises past the one gate, now in `art-style-guide.md` §17.7:
   **which of floor and wall carries the light is a property of the biome family.** The PM
   issued "element on the wall, dark neutral floor" as if universal; it is not, and the first
   attempt applying it made all three floors *worse*. "Increase separation" is the
   instruction; darkening the floor is only how one family gets there.

4. **The Minotaur will not hold its accent through animation, and it is a hold, not a bug.**
   Two attempts, the second starting from #a855f7 at 63.5 on the source per the headroom
   rule; still 22.4 and 23.1 in two frames of five. **The generator dims accents — measured
   39%** — and it is not scaling a two-pixel feature down, it is losing it. Next thing to try
   is *enlarging* its eyes on the source (more pixels, not merely brighter), which is a change
   to shipped art and wants the owner. Also: an element's palette entry is not always enough
   — void is `#c084fc`, a light violet reading only 47.1.

5. **The sharp-vs-reckless campaign check can still invert, on seeds alone.** Margin across
   five disjoint 12-seed blocks: **2.42** (master's own seeds), 2.92, 4.83, 6.08, **−0.33**.
   That last block is a live inversion with no code change. Master's seeds read comfortably
   because they are not a bad block, not because the promise holds. **Deliberately not
   fixed**: ~85s per 12-seed block, so a full power sweep costs hours, not minutes — a cost
   decision for the owner. **Do not read a green campaign check as proof the promise holds.**
   In CLAUDE.md.

6. **Rune Fragment and Heartwood Sap still have a source and no dedicated recipe.** A source
   with no sink. Untouched this run.

7. **Reliquary reachability is still unmeasured.** Sectors 7–9 sit behind nine sequential
   clears that nothing exercises past `PLANETS[1]`. A prior harness attempt produced zero
   numbers. Untouched this run.

8. **The three deepest Reliquary sectors have no visual escalation** — `infusionChance` caps
   at 65% around depth 22 and they start at baseDepth 34/39/44, so they are at the cap from
   floor one and look identical all the way down. Defensible (a sector is a place, not a
   ladder) but nobody chose it. **If escalation is ever wanted there, the lever is the cap,
   not the tilesets.** Recorded in `docs/art-manifest.md`.

**Unverified in a browser** — no session on this machine can click through the UI. Wants the
owner's eye: the augment tab, the Citadel hall (including the eight floor-dressing placements,
still the original blind arrangement — **do not rearrange them blind a second time**), the
three new Reliquary sector floors, and whether the boss idles read at 0.22s/frame. The
Ferryman's head shifts a pixel or two between frames and may read as a wobble rather than a
breath.

---

## The lesson this run kept re-learning

**A check that looks like it states a promise can prove nothing, and only running it against
the real failing input finds out.** Four instances in one day:

1. The animation gate's first version compared the frame at the **end** of a cast — which a
   non-looping tag clamps to, so it passed both ways. Two sides, and still vacuous.
2. A seed count derived from **one** sweep looked rigorous; a second, disjoint sweep dropped
   the candidate size from +0.10 to +0.05 margin. One sweep cannot tell plateau from edge.
3. The PM specified the per-frame accent check as "above the hero's floor in every frame."
   Built to spec, it **passed the real pre-fix art** — with the eye gone, a dull olive robe
   pixel was the loudest thing at 31.4 against the hero's 30.2. Max-chroma-per-frame never
   asks *which* colour is the accent. Replaced with a hue bar — and then the Minotaur showed
   the hue bar alone was also insufficient (eyes *darkened* within the same hue family to
   27.8, below the hero's skin). **The bar is now both, and each catches what the other
   cannot.**
4. Three wind-up generations looked like plenty of movement on a contact sheet. The defect
   existed only in the relationship between the last frame and the first.

Corollary worth keeping: **a delegate correcting a PM ruling with evidence is the process
working.** Three of the four above were caught that way.

---

## Working rules that still cost something to relearn

- **`~/Desktop/lootSim` is the owner's dev server.** It must contain every merged change and
  must never sit on a feature branch or hold half-finished work. 33 stale worktrees are still
  registered under `~/Desktop/lootSim-worktrees/`; they are harmless but somebody should prune.
- **Never stash, commit or discard another session's uncommitted work.** To preserve something
  at risk: `git stash create` plus `git tag`. The owner's chest-ilvl edit was preserved that
  way this run (`owner-wip/chest-ilvl-2026-09-09`) before being superseded on master.
- **Capture the real exit status**: `npm test > /tmp/gate.log 2>&1; echo "GATE_EXIT=$?"`.
  Never `| tail`.
- **Never merge a red gate.** If a check goes red, first find out whether *you* turned it red.
  If the check itself is at fault, fix the check on master **alone, first**, justified by
  master's own numbers — that ordering is the difference between fixing a check and rigging one.
- **Assert design promises as comparisons, not one-sided bounds — and give the comparison
  power.** A thin comparison fails the same silent way a bound does.
- **Derive numbers, don't hand-scan them.** Three times now a hand-computed figure was wrong
  and the derived one was right.
- **`docs/game_story_worldbuilding.md` is the tiebreaker** and it settled a real documented
  contradiction this run. Do not commit it as a side effect.
- **A measurement ships even when the fix does not.** Landed three times this run: the
  wind-up rejection, the campaign-check thinness, and the raid threat-rate instrument.
- **Both branches adding to the `npm test` chain conflict in `package.json` every time.**
  Expect it, keep both scripts.
