# Handoff — 2026-09-09

Written at the end of a multi-session run (PM session `lootsim-21`, with `lootsim-26`,
`lootsim-56`, `lootsim-76`, `lootsim-97`). All sessions have wrapped and all worktrees are
clean. This file is the state of play for whoever picks it up next.

---

## Addendum (lootsim-97, after this file's first commit): the axis is confirmed

Item #5 on the docket below — "the item-level axis" — is no longer an open question. The
owner, live in the `lootsim-97` session, was asked directly and confirmed: item level for
chests and crafting should track the active character's own **`level`**, not `frontier`.
This was a real, in-conversation confirmation, not an inference from the inline comment.

Confirmed explicitly for **two of the three sites**: `openAugmented`/`openChests`
(`state.ts:815`, the edit already in the tree) and `craftItem` (`state.ts:477`). The owner
was *not* separately asked about the third site, `craftNamed` (`state.ts:578`) — when told
it existed, they chose to stop and hand off rather than extend the confirmation to it
in-session, so treat it as still open.

**What is still genuinely left to do** (this session deliberately did not do it, on the
owner's own choice to stop rather than finish under time pressure — see "Working rules"
below on why a wrap-up is the wrong time to make a balance change):

1. Confirm (or extend by inference — it's the same axis) `craftNamed` at `state.ts:578`.
2. Change all confirmed sites from `this.player.frontier` to `this.player.level` together.
3. Rewrite the regression guard in `tools/smoke.ts` (the "fresh alt's chests" block) — it
   currently asserts the *old* rule (frontier-based) and will and should keep failing until
   it's rewritten to assert the *new* one. A fresh alt is no longer "ilvl 1 because its
   frontier is 0" — it's "ilvl equal to its own level," and the test's own alt gets bumped to
   level 30 by an earlier step in the same block (for an unrelated equip-catchup check)
   before the "fresh alt" assertion runs, so the test will need either a genuinely fresh
   second alt or a reordering, not just a changed expected value.
4. Re-measure the "reading the telegraphs actually gets you out of them" comparison with the
   change applied, widened across seeds and A/B'd against master in a throwaway worktree
   (see "Working rules" — never report a balance delta from one default run). The one
   sampled reading this session took was 78% eaten vs 40%, close to master's 77% vs 34%, but
   one reading proves nothing either way.
5. Update `CLAUDE.md`'s two references to this rule (the frontier/Tower section and the
   per-class-save section) to describe `level`, not `frontier` or `deepestDepth`.

Also: this file's own opening line ("all sessions have wrapped and all worktrees are
clean") stopped being true partway through its own commit — `lootsim-97` was still active
and picked this up afterward. Worth knowing if a future handoff assumes the file it's
reading is itself the last word.

---

## Read this first: there is an uncommitted owner edit in the working tree

`src/game/state.ts` has a one-line change that **is the owner's own**, made directly on the
dev server, with their comment on it:

```ts
const ilvl = Math.max(1, this.player.level); // owner override - this should be based on the
// active character's level, not the account's record. chests and crafting are bricked otherwise
```

**Do not discard it and do not casually commit it.** It is preserved as a tag in case the
working tree is ever cleaned:

```
git stash apply owner-wip/chest-ilvl
```

### What is actually going on, because it is more interesting than it looks

**The owner's complaint is real and the diagnosis is right.** `Player.frontier` is the
per-class maximum of that character's depth and height records. A character who has
*levelled* but has not *banked a deep run* therefore has a low frontier and rolls near-ilvl-1
items out of every chest — junk out of a Legendary key. That is a genuine defect, not a
preference.

**The edit as written covers one of three sites.** It changes `openChests`. Still on the old
value:

- `src/game/state.ts:477` — `craftItem`
- `src/game/state.ts:578` — `craftNamed`

So chests are fixed and **crafting is still bricked exactly as described**.

**But the axis change collides with the acceptance suite, and the collision is not a bug.**
With the edit in the tree, `npm test` fails two checks:

```
FAIL  a fresh alt's chests roll for its own (level 1) depth, not the main's
      — ilvls: 30,30,30,30,...
FAIL  reading the telegraphs actually gets you out of them — 78% eaten vs 40%
```

The first is a deliberate regression guard (`tools/smoke.ts`, near the "fresh alt" block)
protecting the rule in `CLAUDE.md`: *chests and the forge roll item level off the active
character's `deepestDepth`, not the account record*. That check builds an alt that is **level
30 but shallow**, so **any formula that reads `level` fails it by construction**. This was
verified: `Math.max(1, frontier, level)` applied at all three sites fails the two checks
identically. It is not a patch away from passing.

The second failure is the more important one and it is a real consequence, not noise: moving
the item-level axis changes what the campaign bots are wearing, which moves combat balance
enough to break the sharp-vs-reckless telegraph comparison. Any change here is a live balance
change.

**This is therefore an owner decision, not a fix to apply.** The two designs are opposed:
"item level tracks how deep this character has actually gone" versus "item level tracks how
strong this character currently is." The owner has stated the second. Whoever takes this up
should confirm the axis with them, then change the rule in `CLAUDE.md`, the check in
`tools/smoke.ts`, and all three call sites **together** — and re-measure the telegraph
comparison rather than assuming it recovers.

`npm test` on committed `master` with the working tree clean is **green, exit 0**. The two
failures come from the working-tree edit alone.

---

## What landed this session

Merged and live on `master`:

- **Augments** (`docs/augments.md`) — `SAVE_VERSION` is **29**. Guaranteed-outcome tokens
  (unspoken augment guarantees unspoken, bow augment guarantees a bow), priced at the owner's
  literal 2× harder to drop from Avarice Rifts. **27 is a burned save version and must stay a
  hole** — see the comment in `src/core/save.ts`.
- **Challenger badges, reworked to per-depth.** Twenty-slot arrays indexed by tier holding the
  deepest depth banked at that tier, per activity per class. The earlier activity-keyed shape
  was rejected: Death March X on depth 1 and on depth 30 are not the same achievement.
- **Forge popups**, **combat-stats overlay** (`src/game/combatStats.ts`), **the training dummy
  room**, **ability FX tracers** (37 ranged abilities, instant tracers rather than travelling
  bolts — damage lands instantly, so a bolt arriving later is a visible lie).
- **Portrait height is a band, not a ceiling.** The legal bands are **24–43, 46–50, 52–58,
  78–87**, and **59–77 is a dead zone** — exactly the range you reach for when you want a
  slightly bigger hero, so it is the range that silently wastes a generation. The band is now
  *derived* in `tools/smoke.ts` and printed next to the portrait sizes. Deriving it caught that
  the hand-scanned numbers were wrong at both ends; the docs now point at the tool rather than
  quoting a list.
- **Monster sets** — `BiomeStyle.monsterSet` + `MONSTER_SETS` + `monsterSprite`, wired for all
  three realms (9 Reliquary sectors, 6 Delve biomes, 3 Tower bands). Plus Citadel station props
  and floor dressing on the text grid, and the `ATLAS` asymmetry check.
- **`docs/art_refs/`** — the owner's five reference images, now committed so every worktree can
  see them.
- **`docs/materials-coverage.md`** — on branch `investigate/materials-coverage` @ `5a30318`,
  **not yet merged**.

### A correction that reversed an earlier report

The Delve did **not** need five new monster sprites. The existing art already reads as Hell —
rot, bone, iron, a cult robe — and the `reliquary.` prefix is an accident of when it was
generated. `delve` and `reliquary` now point at the same five deliberately, declared in
`SHARED_MONSTER_SETS`, and undeclared overlap fails the gate. **The remaining art need is the
Reliquary's, not the Delve's**: its sectors are places (frozen basilica, rotting garden,
wargrave) and the Delve is where this art already looks at home.

---

## The hero: five rejected passes, and the measurement that explains why

Nothing is committed. The hood direction is dead, the generic-exposed-head pass has not been
generated, and **v4 is still what ships**. No branch exists on purpose — committing a rejected
direction only gives the next session something to mistake for a starting point.

The direction, which has now been stated across several sessions and is stable:

> "None of those are good, they are still too high in scale. We don't want a cloaked guy — that
> was just an art style reference. We still want a generic hero dude with a head exposed."

**Wizard of Legend is a STYLE reference, not a SUBJECT reference.** When the owner names a game
or supplies an image they mean its rendering style — pixel scale, palette discipline,
silhouette weight, shading flatness — not its costume or character design. `docs/art_refs/ref_3`
is the subject reference (small, exposed-head figures); `ref_5` is the scale reference.

### "Too high in scale" is one ratio, and it is measurable

Measured off the owner's own `ref_5.png`: their characters stand roughly **2–3 floor tiles
tall** and are drawn at approximately the **same pixel pitch as their floor — a density ratio
near 1.0**. Our hero stands **1.0 tile tall** at **3.56× the floor's pitch**. The same complaint
from both sides: too many art pixels for the world space he occupies.

**There are two levers and every pass so far has pulled only one.** You can cut the art-pixel
count, or you can let the sprite occupy more world. The reference leans hard on the second — its
characters are *large on screen* built from *coarse pixels*. Ours is the inverse: small on
screen, fine pixels.

The second lever is cheaper than it sounds: `PLAYER_RADIUS` is 9 world units while the hero
draws 32 tall, so **drawn height and collision are already separate numbers** and drawing him
taller moves no hitbox, telegraph or camera geometry. **Unverified: what this does to the two
town portraits. Check that first.**

### The justification that has to be retired

v4's height went 48 → 57 explicitly so the face would be big enough to hold a calm expression.
In `ref_3` and `ref_5` **a face is two or three pixels**. The hero got bigger in order to draw
the one thing the reference says not to draw. So the next pass should be **smaller *and* have a
smaller face, and those are the same decision** rather than competing ones.

### Metric note

The density ratio is a **proxy and flat shading breaks it**. A hooded candidate measured 4.19×
against v4's 3.56× — worse by the ratio — while being visibly better: whole-sprite colour count
40 → 13. "Too realistic" was **information density (colour count per region)**, not pixels per
world unit. Trust §1.4c "measure the head" in `docs/art-style-guide.md`.

### One more finding that survived the pivot

A hooded hero collides with the cult-caster's silhouette. That now argues *for* the exposed
head, so the pivot fixes a real legibility problem too.

---

## Left on the docket

**Art (blocked on the hero pitch decision above — the same ratio governs the Citadel sheet):**

1. **Hero redraw** — generic hero, exposed head, smaller scale, smaller face, from
   `docs/art_refs/`. Settle drawn-height-vs-pixel-pitch first; check the town portraits.
2. **`tiles.citadel` + station props** — **wiring is done, art is not started.** The three-rung
   ladder already promotes the sheet automatically and the exact `TILESETS` row is written into
   the `DECK_TILESET` comment. Twelve prop ids are named and safely absent from `ATLAS`. The
   eight dressing placements on the grid are a **starting arrangement nobody could see** — they
   want an eye.
3. **The Reliquary's sector monsters** (not the Delve's — see the correction above).
4. **More Tower monsters** — new silhouettes, not reskins. Then the Tower's three tilesets,
   **in that order**: a properly celestial floor with Hell's monsters standing on it is the
   worst configuration available.

**Design / balance:**

5. **The item-level axis** — the owner decision at the top of this file.
6. **Reliquary reachability is unmeasured, not proven.** Sectors 7–9 sit behind nine sequential
   clears that nothing in the suite exercises past `PLANETS[1]`. All nine materials *do* have
   working sources, live-confirmed — but "technically obtainable, practically nobody has got
   there" reads exactly like "no source" from the player's chair. A harness for this was
   attempted and produced **zero numbers**; there is nothing to build on.
7. **Rune Fragment and Heartwood Sap have a source and no dedicated recipe** — spendable only on
   general essences. A source with no sink.
8. **Raid party scaling is an open finding, not a fix.** `partyScale` does not transfer to a
   single enormous body; a growing party dilutes threat and health scaling cannot fix
   trivialisation. Raids stay solo-only. See `docs/raid-party-scaling.md`. Deliberately **not**
   extended to the Delve's own boss floors without the owner's sign-off.
9. **Whether the augment discount moves from divine onto unspoken** — awaiting the owner.

**Unverified in a browser** (no session on this machine can click through the UI): the augment
tab, the FX tracers, the combat-stats overlay density, the Path trophy table, the dummy room,
and the Citadel dressing composition. These want the owner's eye.

---

## Working rules that cost something to relearn

- **The main worktree `~/Desktop/lootSim` is the owner's dev server.** It must contain every
  merged change and must never sit on a feature branch or hold half-finished work.
- **Never stash, commit or discard another session's uncommitted work in a shared checkout.**
  Uncommitted work there means a session is live in it. This project has already had work
  swallowed that way once. To preserve something at risk without touching the tree:
  `git stash create` plus `git tag`.
- **Capture the real exit status.** `npm test 2>&1 | tail -3` swallows it and has caused a
  merge to be reported green twice when it had actually conflicted. Use
  `npm test > /tmp/gate.log 2>&1; echo "GATE_EXIT=$?"`.
- **When a check goes red, find out whether *you* turned it red** before touching anything.
  A throwaway worktree at the pre-change commit with `node_modules` symlinked answers it in
  one run and costs nothing.
- **Assert design promises as comparisons, not one-sided bounds.** A loose bound on each side
  separately lets an inversion ship green — this happened once already.
- **Derive numbers, don't hand-scan them.** Twice on the portrait task a hand-computed figure
  was wrong and the derived one was right.
- **`docs/game_story_worldbuilding.md` is the tiebreaker** on lore, naming and world structure.
  It is often the owner's live work-in-progress — do not commit it as a side effect.
- **A measurement ships even when the fix does not.** The instrument and the write-up land on
  `master`; the failed fix stays on its branch.
