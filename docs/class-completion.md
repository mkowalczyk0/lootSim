# The Proving — endgame class completion

UAT §13 (Endgame Class Completion) and §14 (Final Boss / Delve Concept), v1.

> **The Legend becomes Complete.**
>
> — `docs/game_story_worldbuilding.md`, CLASS COMPLETION

Every class can be finished. Take a class to the bottom of the Delve, beat the thing
waiting there, and that class wears a **gold border** for good. It grants nothing.

---

## The fiction, which the worldbuilding doc had already written

`docs/game_story_worldbuilding.md` does most of this design's work, and this feature was
built to it rather than alongside it:

- **THE LEGENDS** — a class is a Legendary Archetype, a legendary soul the Keepers
  summoned back into physical form.
- **LEGEND MASTERY** — a character starts as a *partial* manifestation of that Legend and
  spends the game recovering the rest: memories, techniques, weapons, relics, fragments of
  its own myth. "Eventually they can face an endgame encounter designed to prove that they
  have fully realized their potential."
- **CLASS COMPLETION** — beating it means the Legend becomes Complete, and the gold border
  "is not merely an achievement indicator. It represents the character becoming a fully
  realized manifestation of their Legend."

What that leaves open is what you actually fight. The doc's own closing questions ask why
*"the Abyss seems to recognize the Legends"* — so: the fragments you never recovered
didn't go nowhere. The Abyss kept them, assembled them, and they have had the whole war to
practise. You cannot be a complete manifestation of your Legend while part of your myth is
down there wearing your face.

Hence the encounter's name, constructed rather than authored: **The Unfinished
&lt;Class&gt;**, with a per-class deadpan title under it ("It has your reach. It has had
longer to practise.").

**No mythological figures are named.** The doc names exactly two (Arthur Pendragon as a
Swordsman, Cu Chulainn as a Lancer) and deliberately keeps Merlin *out* of the playable
roster to show that famous names can live in the world without being classes. Authoring 21
legendary identities would be inventing a second fiction beside the one that exists. A
class supports many manifestations by that doc's design; what is unfinished is the
archetype, whoever is currently wearing it.

---

## Where it lives: the bottom of the Delve

§14 asks that this be tied into the Delve before anything separate is built. It fits,
because **depth 30 is where the authored world already ends** — that was found, not
picked:

| | caps at |
| --- | --- |
| `biomeFor` | its last biome, The Veil, from depth 26 |
| `bossFor` | its last encounter from depth 25 |
| that encounter's title | *"You should not have come this far."* |

Past 30 the Delve is arithmetic. So the bottom needed a door, not a mode: no new
`RunMode`, no new hub station, no new portal, no new town tab, and no wire change.

**The ladder is not capped.** Descending 30 → 31 works exactly as it always did. `CLAUDE.md`
promises no upper bound in three separate places and `UNIVERSAL_POINT_CAP`'s entire
documented rationale is "the delve has no upper bound" — deleting endless descent is not a
call this feature gets to make. Depth 30 simply stops being a *generic* boss floor once
you have earned the right to be measured there.

---

## The gate

Depth 30 is the ordinary Nameless floor until **that class has cleared the bottom and
banked it**: `Player.deepestDepth >= DELVE_BOTTOM`, which is already persisted and already
per-class. From then on, depth 30 *is* that class's Proving, forever, repeatable. Your
first trip down is the descent; every trip after, the Abyss has your measure.

"Cleared and banked" is the literal gate, not a paraphrase. `recordDepth` is only ever
reached from `Dungeon.bank(true)`, so:

- **dying** at depth 30 banks nothing, and
- **bailing out** through the entrance portal runs `bank(false)`, which forfeits the
  floor's progression along with its loot (UAT §6).

Touching the bottom never qualifies you. Beating it once does.

This also closes the alt loophole for free. `GameState.maxUnlockedDepth` is *account-wide*,
so an alt can direct-dive to depth 30 — but it cannot qualify on the main's record, and
`requiredLevel` means it cannot borrow the main's gear either. Class investment is the
gate and difficulty enforces it.

Reaching depth 30 by any route counts, rift effective depths included, because
`recordDepth` feeds one per-class number. Deliberate: the requirement is that this
character can stand at the bottom, not which door it walked through.

### It is scoped to the Delve positively

`provingFloor` asks `config.mode.id !== "delve"` → refuse. Not "is it a rift, a planet, a
daily" — that formulation is scoped by *exclusion*, and a mode arriving later with
`isRift: false` (which the Delve itself has) would satisfy every clause and spawn somebody's
Proving inside their run. Every other mode reaches depth 30 by some route: an Abyssal Rift
tier 11 floor is effective depth 34. `tools/legends.ts` walks every entry in `RUN_MODES`
and asserts only the Delve's bottom is ever anybody's final exam, so a mode added later is
covered the moment it joins the roster.

---

## Solo only, in v1

The same call `data/daily.ts` made for the Vigil, for a sharper reason: completion credit
must not be duplicable or desyncable. In a party, depth 30 stays the ordinary Nameless
floor. `provingFloor` refuses anything but `players === 1`, so there is no split-roster
credit to get wrong and `configToWire` never has to learn a new field.

This is a documented reason, not an omission. Making it party-capable means deciding whose
Proving a mixed-qualification party is fighting, and that is a design question rather than
a plumbing one.

---

## The encounter

Borrowed wholesale from an existing `BossSpec` and reskinned, exactly as `planetBossSpec`
already does — that is what keeps a 21st final boss from costing a 21st content pipeline.
No new `BossAbilityId`, so nothing in `net/`, `render/` or the telegraph pipeline had to
learn anything.

`legendBossSpec(classId)` overrides four things on top of the borrowed template:

1. **Identity** — id, name, the class's deadpan title.
2. **Element** — the class's own, the one its ultimate falls back to. A Legend's missing
   half is made of the same thing the Legend is. `PROVING_SELF_RESIST` is 150, below the
   Nameless's 220: the element a themed build most likely stacked is the one its class
   points at, so this taxes such a build rather than disqualifying it. Physical never gets
   a self-resist at all.
3. **The stat line**, measured against `REFERENCE` — the deepest *authored* encounter,
   which is also exactly what this floor serves a character who hasn't qualified yet.
   **Not** the borrowed template. See the tuning note below; this distinction is
   load-bearing.
4. **The phases**, rebuilt by `provingPhases`.

### `provingPhases`, and the boss rules made structural

`CLAUDE.md` lists the rules any new boss ability must follow. Two of them are enforced by
construction here rather than by authoring discipline:

- **Every phase is the union of every phase before it.** The rule is "phases *add*
  abilities rather than replacing them". The hand-authored encounters mostly follow it but
  not strictly — the Choir drops its slam entering Second Verse, the Nameless drops three
  abilities entering Interest. Unioning makes it true for all 21 legends, so the room only
  ever gets busier.
- **A final phase is appended, never substituted**: everything the fight has plus
  `enrage`, faster, with a wave of adds on entry.

On top of that, `PROVING_CORE` (`ringOut`, `beam`, `meteor`, `starLance`) is added from the
**second** phase onward whatever kit the class borrowed. Phase one is left template-pure on
purpose: the fight opens reading as your class, and what the Abyss kept arrives as the room
closes in. The tuning note explains why this exists at all.

---

## Tuning: two things that were measured, and both were wrong first

**1. Scaling off the borrowed template made a class's final exam easier than the floor it
replaces.** The authored encounters range from 72 health (the depth-5 Warden) to 145 (the
depth-30 Nameless), so a legend borrowing the Warden's kit came out at 97 — *below* the
ordinary depth-30 boss. Measured before the fix: a Warden-template Proving left its boss at
74% after 94 seconds while the ordinary Nameless floor killed the same character in 18.
The hardest fight in the game was quietly the easier of the two, and which class you picked
decided it. Now the kit varies by template and the stat line does not.

**2. The cross-arena rule passed on a technicality.** The audit accepted the melee
templates because the Warden's `slam` lands where you were standing, so it technically
reaches across the arena. Playing it disagreed: on a level 70 character a Warden-kit
Proving cost 4,125 damage while the ordinary depth-30 Nameless floor cost 12,266, because a
kiting player is never in range of a cleave, a quake or a windmill. Same stat line, a third
of the pressure. `PROVING_CORE` is the fix — `ringOut` is the anti-kite ability by design
(the mirror of a quake: *get in*) and `beam` crosses the room.

Both were found by playing the encounter, not by reading it. Neither would have been caught
by a win-rate threshold.

---

## The reward

- The class name gets a **gold border** on the Path tab, plus a `complete` badge.
- The Path side panel says so, and tells an unfinished class what the bottom is currently
  offering it.
- Records carries `Legends complete: N / 21` and lists the finished ones.
- The town announces it once on the way back in (`GameState.legendJustCompleted`, transient
  and unpersisted, the same pattern the v14 tree-refund notice uses).

**And nothing else.** No item, no cosmetic grant, no stat. `Player.legendComplete` is read
by the UI and by nothing in the simulation — `tools/smoke.ts` asserts a completed class has
an identical character sheet to an unfinished one, the same promise `data/cosmetics.ts`
makes and the same way it is checked. Prestige, not power.

A Proving-exclusive **named item** is the obvious follow-up now that the named-item schema
has landed, and is deliberately not in v1 — it was left out to stay clear of that schema
while it was still in flight.

---

## What the tests pin

`npm run legends` (`tools/legends.ts`) — structural, and the **first audit of the boss
rules anywhere in this repo**; before it, `tools/smoke.ts` checked that every boss had a
sprite and stopped there.

- All 21 classes have a Proving, every template resolves, every title is its own sentence,
  and the encounters spread across all five templates.
- Every generated spec obeys every boss rule: telegraphed, a wind-up on every ability, a
  cross-arena answer in every phase, strictly additive phases, never slowing down.
- Every Proving is harder than the depth-30 floor it replaces — asserted per class,
  because the failure mode it guards was per class.
- The five hand-authored encounters are audited too, against a **pinned** list of their
  existing violations (`choir|additive`, `herald|additive`, `nameless|additive`). Pinned
  rather than fixed: re-tuning shipped content is not this feature's business. A *new*
  violation fails, and so does fixing a pinned one without updating the list — a
  characterization test, not a suppression.
- Which floors are and are not the Proving, including a walk over every `RUN_MODES` entry.

`npm run smoke` — behavioural, the half that can only be measured by playing:

- A plausible endgame character (level 60, trees filled, thirty Legendary chests worn,
  gear rolled at the bottom) beats it 6/6.
- Reading the telegraphs against standing in them, on the same character and seeds,
  compared **directly**: 2.8x the damage bill per second and 3.5x the potions. Not
  asserted as win-or-lose, because `CLAUDE.md` says a boss that one-shots a careless player
  is a wall rather than a fight — at this gearing both bots kill it, which is the correct
  behaviour of a tuned encounter.
- It is the longer fight of the two, against the ordinary depth-30 floor, same character
  and seeds.
- Banking a clear the bot actually won completes the Legend; bailing out and dying
  complete nothing; re-clearing neither un-completes nor re-announces.
- A completed class has an identical sheet to an unfinished one.
- It survives a save round-trip, and a pre-v18 blob (built by stripping the field, not by
  relabelling the version) loads with every class unfinished.

### An open finding, not fixed here

**Depth 30 is far beyond the measured frontier.** The smoke campaign's sharp bot averages
around depth 11–12 on a fresh character, so the bottom is roughly three times as deep as
anything the harness records. Worse, class power at depth 30 varies enormously: sampled
across eight classes at level 60 with legendary gear, only three could beat depth 30 *at
all* — and that is equally true of the **ordinary** depth-30 floor, so it is a statement
about the progression curve and about class balance (`npm run builds` is already documented
as red for a known set of classes) rather than about this encounter.

Deliberately not tuned around. The fiction and the data both put the bottom at 30, the gate
is a banked clear so the feature simply never fires for a character who cannot get there,
and moving an endgame boss to meet a bot's current reach would be tuning the destination to
fit the measuring stick.

---

## Files

| | |
| --- | --- |
| `src/data/legends.ts` | all of it: `DELVE_BOTTOM`, the 21 `LEGENDS`, `legendBossSpec`, `provingPhases`, `provingFloor`. Pure data. |
| `src/game/dungeon.ts` | `Dungeon.proving`, decided once in the constructor; the `spawnBoss` branch; the completion credit in `bank`. |
| `src/game/player.ts` | `legendComplete`. |
| `src/game/state.ts` | `completeLegend`, `legendsComplete`, `legendJustCompleted`, and the field in `playerToJSON`. |
| `src/ui/town.ts` | the border on the Path cards, the side panel, the Records rows, the announcement. |
| `tools/legends.ts` | the acceptance test and the boss-rules audit. |

### Why `Dungeon.proving` is decided in the constructor

Both the boss that spawns and the credit that banks read that one field, so they cannot
disagree. Re-deriving the predicate at banking time would be actively wrong rather than
merely redundant: `recordDepth` raises `Player.deepestDepth` to 30 as the first-ever clear
of depth 30 banks, so a predicate evaluated after that would hand a class its gold border
for the Nameless kill that had only just qualified it.
