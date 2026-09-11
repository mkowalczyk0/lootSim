# Relics and artifacts, unique to each class — options and prices

**The ask** (owner, 2026-09-10): *"Artifact/Relics should be unique to each class."*

**Nothing here is built.** This is a costed set of options; the owner picks one and it gets
built. Written after reading `docs/game_story_worldbuilding.md`, which is the tiebreaker,
and measuring the live roster rather than trusting the docket's figures.

---

## 0. Two corrections to the numbers everyone is quoting

The brief for this memo said **30 definitions (18 artifacts, 12 relics)**. That is stale —
raids and the Tower landed since. Live today:

| | count |
|---|---|
| relic-tier | **16** |
| artifact-tier | **23** |
| **total** | **39** |
| classes | 21 |

And the second correction matters more, because it changes what the ask even means:

**Proving relics are already bound to classes — by element, in groups.** Eight relics cover
all 21 classes:

| relic | classes | n |
|---|---|---|
| spark-of-the-unfinished-storm | lancer, duelist, corsair, stormcaller | 4 |
| cinder-of-the-unfinished-pyre | berserker, magician, monk, alchemist | 4 |
| venom-of-the-unfinished-garden | shaman, trickster, reaper, assassin, warden | 5 |
| measure-of-the-unfinished-duel | swordsman, juggernaut, engineer | 3 |
| hollow-of-the-unfinished-word | warlock, necromancer | 2 |
| rime-of-the-unfinished-vigil | ranger | 1 |
| hymn-of-the-unfinished-choir | paladin | 1 |
| sigil-of-the-unfinished-art | bard | 1 |

So the owner's complaint is not "relics aren't class-tied at all". It is almost certainly
**"my Stormcaller's Proving gave me the same relic my Lancer got."** Five classes already
have a relic to themselves and never see the problem; a Shaman shares with four others. That
asymmetry is the thing being reported, and it should shape which option we pick.

---

## 1. The fiction has already answered this, and it splits the two tiers

This is the strongest input available and it is the owner's own document.

**Relics are pieces of a Legend.** Under `LEGEND MASTERY`:

> At the beginning of a character's journey, they are only a partial manifestation of their
> Legend. As they progress, they recover: Memories, Techniques, Weapons, **Relics of their
> original life**, Pieces of their myth, Fragments of their identity.

A relic is *yours*. That is per-class by construction, and `src/data/relics.ts` already says
so in its own header: *"A relic recovered from a Proving is a piece of the Legend the Abyss
kept — the one thing the Unfinished had that you didn't."*

**Artifacts are Abyssal remnants, and are nobody's.**

> Artifacts should therefore be strongly associated with the Abyss. They are physical
> remnants of things touched by forces that should not exist.

> A demon does not simply disappear… Their weapons become artifacts.

> occasionally, something survives the Abyss without being destroyed. Those are Artifacts.

An artifact is the surviving remains of something that died. It has no relationship to your
Legend, and binding one to a class would be inventing a connection the fiction denies.

**The refinement neither the ask nor the brief names.** A relic is a fragment of *a* Legend —
not necessarily *yours*. The worldbuilding's own raid-reward list reads:

> Potential rewards: Named Sword — *Heaven's Severance*; Named Amulet — *Crown of the
> Exiled*; **Relic — *Spark of the Tyrant***

That is a relic which is a piece of the **Tyrant's** legend, and the game already ships it
verbatim. So "relics are per-class" is too strong a reading. The correct rule is:

> **A relic belongs to the Legend it came from. A Proving relic is yours, so it is
> class-bound. A raid relic is the boss's, so it is not.**

That distinction is free — it already matches the shipped roster — and it means the four raid
relics (`spark-of-the-tyrant`, `thread-of-the-labyrinth`, `the-ferrymans-toll`,
`the-seventh-crown`) stay shared under every option below.

---

## 2. What has to be true whatever we pick

- **Rule 3 is a test, not a promise** (`npm run relics`): every relic-tier definition must
  carry an effect beyond `mods`, no relic-tier definition may be a `statStick`, and honestly
  flagged stat sticks are at most a fifth of the *whole* roster. Today 2 of 39. A per-class
  roster that grows the denominator with behaviour-carrying definitions makes this easier to
  satisfy, not harder — the constraint bites the artifact tier, not the relic tier.
- **The effect vocabulary is mostly data.** Across all 39 definitions: `grantEffect` ×29,
  `mutate` ×13, `mods` ×12, `rule` ×**1**. Only `rule` needs new engine code in
  `src/game/rules.ts`; the rest is authoring against `src/combat/`'s existing vocabulary.
  **This is the single most important pricing fact in this memo** and it cuts against the
  brief's assumption that a full roster is "gated on extending `src/combat/`". It mostly is
  not. What it is gated on is *21 behaviours that feel distinct*, which is a design problem,
  not an engine one.
- **Namespacing.** Rules stay `named.<id>.*` / relic-namespaced; a relic may not flip a
  class keystone, because the roster anti-overlap audit only walks class definitions and
  would never see it.
- **Three slots, at most one relic-tier** (`RELIC_SLOTS = 3`, `MAX_RELICS_WORN = 1`). Every
  option below keeps that. It is why the relic tier is the identity slot and the artifact
  tier is the two build slots — the split the fiction already wants.

---

## 3. The options

### A. Restrict what exists — bind the 16 to classes

Split the eight Proving relics along class lines using the existing element grouping, and
leave everything else alone.

- **Player experience**: a Lancer and a Stormcaller stop getting the same Proving drop. But
  with 8 relics over 21 classes, 13 classes end up with *nothing of their own* unless the
  pool is subdivided — and subdividing means authoring anyway. Doing it without authoring
  means some classes simply lose access to a relic they can currently earn, which is a
  removal, not a feature.
- **Cost**: ~0 new content. A day, mostly save migration and check updates.
- **What it spends**: it does not deliver the ask. "Unique to each class" with 8 items and
  21 classes is a rename of the current grouping. It also risks reading as a nerf, because
  for 16 of 21 classes the *first* thing they notice is a relic they can no longer wear.
- **Verdict**: cheapest, and I don't recommend it. It is the option most likely to produce a
  second complaint.

### B. A full per-class roster — every class its own relic *and* its own artifact

- **Size**: 21 relics + 21 artifacts = **42 new definitions**, replacing/absorbing the 8
  Proving relics. Realistically a net +34 definitions, roughly doubling the registry.
- **Cost**: this is the big one. Per definition: an id, two lines of prose in the game's
  deadpan register, 1–3 `NodeEffect`s that must not overlap another class's identity, art
  (`relic.<id>` atlas row + PNG, with the existing type-icon fallback meanwhile), a drop
  source, and a row in the anti-overlap audit's expectations. The vocabulary is mostly there;
  the *design* is the cost — 42 behaviours that are distinct from each other **and** from the
  class trees they sit next to, without touching keystones.
- **What it spends**: **it spends the fiction.** Per-class artifacts directly contradict the
  worldbuilding — an artifact is the remnant of a dead god or demon, not a piece of you.
  Binding one to the Swordsman requires inventing a reason the Abyss's leftovers care which
  class picked them up. It also kills the artifact tier's actual job: "my build is better at
  what it does" is *build*-shaped, and a fire Lancer and a lightning Lancer are supposed to
  want different artifacts. Per-class artifacts would make that choice for them.
- **Verdict**: delivers the ask literally, and is the wrong shape for half of what it touches.

### C. Hybrid — per-class relics, shared artifacts *(recommended)*

Every class gets **its own relic**, recovered from its own Proving: the identity piece, the
fragment of its Legend, in the one relic-tier slot. The artifact tier stays shared and
build-shaped, exactly as it is.

- **Size**: 21 relics, absorbing the current 8 (several can be kept as-is and reassigned to
  their strongest current class). Net **+13 definitions**, plus rewriting 8. No artifact work.
- **Player experience**: finishing a class's Proving hands you a thing only that class can
  have — which is precisely what "LEGEND MASTERY" promises and what the gold border already
  celebrates. The artifact tier keeps doing its job, so build variety inside a class is
  untouched. Two of the three slots stay the same game they are today.
- **Cost**: roughly a third of option B, and the part it cuts is the part that was fighting
  the fiction. The 13 new relics are the genuinely creative work; the 8 rewrites are mostly
  re-targeting existing `mutate` effects from an element to a class.
- **What it spends**: nothing structural. Rule 3 gets easier (13 more behaviour-carrying
  relic-tier definitions, stat-stick ratio unchanged at 2/52). `MAX_RELICS_WORN = 1` becomes
  more meaningful, not less.
- **Raid relics stay shared**, per §1 — they are the boss's Legend, not yours.

**I would ship C.** It is what the worldbuilding says, it is the option whose cost is
concentrated in content rather than in fighting the design, and it answers the actual
complaint (two classes, same Proving drop) completely.

### D. C, staged — the same thing, delivered in two passes *(worth considering)*

C's 13 definitions are a real content block. If it needs to reach the owner sooner: pass one
gives **the five largest sharing groups** their own relics (storm 4, pyre 4, garden 5, duel 3,
word 2 — 18 of 21 classes), pass two finishes the tail. The fallback ladder this codebase
uses everywhere (authored → generic) means a class without its own relic yet keeps the
element relic and nothing breaks. Same destination, first half lands in roughly a third of
the time.

---

## 3b. A side effect nobody asked for, and it may be an argument *for* doing this

Per-class relics **change the acquisition maths**, not just who can wear what — and the
change is large enough that the owner should see it priced rather than discover it.

`rollTable` rolls **every matching definition independently**, so the odds that an event pays
*anything* relic-tier scale with how many definitions it matches. That is the mechanism
behind the Abyss's 92–99.7% per clear (`docs/relic-economy.md` §5): its boss matches fourteen
artifact definitions at once.

The relic tier has the same shape, smaller. Today a Proving matches **one** relic — the one
for that class's element — so the per-class change leaves the Proving's odds untouched. But
any source that matches relics *broadly* is a different story:

| source | matches today | matches under option C |
|---|---|---|
| a Proving kill | 1 | 1 — unchanged |
| the Nameless at depth 25+ | 2 | 2 — unchanged (not class-scoped) |
| the depth-30 Delve cache | 1 | 1 |
| a raid encounter | 1 | 1 (raid relics stay shared, §1) |

**So option C is close to neutral on acquisition maths**, which is worth knowing and is
mildly surprising: the relic tier is already authored one-source-at-a-time, so growing it
from 8 to 21 definitions does *not* inflate anyone's drop odds. Only the *pool of things a
given class can find* changes, and it narrows rather than widens.

Two live consequences that follow, and they point in opposite directions:

- **Narrowing is a nerf to account-wide collection speed** if a relic you can't use stops
  dropping. That is exactly the question in §5, and this is the second reason to answer it
  "yes, it still drops".
- **Option B would inflate the artifact tier the way the Abyss already is inflated** — 21
  per-class artifacts replacing a shared pool means the number of definitions any one boss
  matches changes, and if per-class artifacts were added *alongside* the existing 23 rather
  than replacing them, every Abyss boss would match more definitions and the 99.2% would go
  up. That is a concrete, measurable cost of option B that option C does not carry.

**None of this is a reason to fix the Abyss here.** It is a reason to run `npm run relicunion`
before and after whichever option ships, and to treat a change in those numbers as a result
rather than a surprise.

---

## 4. Migration — and the owner's save is the one that breaks

State today:

- `GameState.relics` — account-wide list of owned ids. **Ownership is account-wide and stays
  that way under every option.**
- `Player.relics` — per class, 3 slots, ids or null (on the co-op wire via `playerToJSON`,
  which is both the save format and the wire payload — changing its shape touches saving and
  multiplayer at once).
- `GameState.stats.relicsFound` — per-id find counters.
- `normalizeRelicLoadout` already drops ids that break the rules on load, and
  `normalizeAppearance`/`normalizeOwned` set the precedent that an id which no longer exists
  is dropped rather than crashing the screen.

**The good news: no save can lose anything.** Restricting a relic to a class does not remove
it from `GameState.relics`; it makes it unwearable on other classes. The existing
`normalizeRelicLoadout` is the mechanism — it already exists to enforce
`MAX_RELICS_WORN`, and class-binding is one more predicate in the same function.

**The bad news, stated plainly**: on first load after this ships, **every character wearing a
relic that is no longer theirs silently loses that slot.** For the owner specifically — who
has played many classes and holds much of the roster — that is potentially a dozen characters
each losing their relic slot at once, with no in-game explanation. That is the real migration
cost and it is a UX problem, not a data one.

Three ways to handle it, cheapest first:

1. **Bump `SAVE_VERSION`, drop the illegal loadouts, say nothing.** Free, and it will read as
   a bug to the person it happens to.
2. **Bump, drop, and show a one-time notice** naming what was unequipped and why. Half a day.
   This is what I would do.
3. **Grandfather**: a relic already worn stays wearable on that character forever. Cheap to
   write, permanently confusing — two characters of the same class with different legal
   loadouts, and a rule that can't be explained in a tooltip. Not recommended.

Option B additionally needs a story for artifacts already worn on 21 characters; option C
does not touch the artifact tier at all, which is another point in its favour.

---

## 5. The question that follows immediately, which nobody has asked yet

**If relics become class-bound, does a relic you can't use on your current class still drop?**

It has a real answer either way and the choice should be made deliberately, because the drop
roll already skips what the account owns (`rollRelicDrops`'s `owned` set), so whatever is
chosen here compounds with a chase that is already self-limiting.

- **Yes, it still drops (recommended).** Ownership is account-wide; finding the Warlock's
  relic on your Swordsman is a reason to go play the Warlock, and it is exactly how the
  stash already works for gear an alt will want (`requiredLevel`, `canEquip`). It fits the
  established pattern and it makes the account feel like it is progressing even when one
  character isn't.
- **No, only your class's relic drops.** Every drop is immediately usable, which feels
  better in the moment. But it makes each class's chase a private 1-item table, so the
  relic tier stops being a chase at all — you get your one relic and the tier is finished
  forever. It also removes any reason to run a Proving twice.

A third position worth naming: **yes, but only for classes you have unlocked/played**, which
avoids handing a level-1 account relics for 20 classes it has never touched. Slightly more
code, and it is the version I would actually build if "yes" is chosen.

**This is a real design decision, not an implementation detail**, and it should be settled
before anything is built — it changes the drop table, the previews (§20 reads the real
table), and the Records screen.

---

## 6. What I would do

1. Ship **option C**, staged as **D** if it needs to land sooner.
2. Keep artifacts shared and build-shaped — the fiction is unambiguous and the tier's job
   depends on it.
3. Keep the four raid relics shared: they are the boss's Legend, not the player's.
4. Migration route 2: bump `SAVE_VERSION`, normalise illegal loadouts, and tell the player
   once what changed.
5. Settle §5 before authoring anything.

The one thing I would push back on if the owner asks for literal option B: **per-class
artifacts are the only part of this ask that the worldbuilding actively contradicts.**
Everything else it either supports or already implies.

---

## 7. Two follow-ups that are NOT part of this decision

Deliberately separated so the owner can say yes to per-class relics and separately yes or no
to each of these. Neither depends on the other, and neither should be absorbed into the big
decision.

### 7a. The `RELIC_ODDS.raidArtifact` comment was false — **already corrected**

It claimed the raid artifact was "the most generous artifact source in the game on purpose".
That compared per-*source* chances (0.18 > `abyssBoss` 0.14); per clear the Abyss pays 92% to
a raid's 18%, and per floor ~40% to ~18%. The comment now states the authored fact (largest
single chance in the table) and records the measured one. **Cost: done, in this branch.** No
decision needed — a comment asserting a design intent the numbers contradict is the
"prose that outlived the decision it describes" problem, and prose is not evidence.

### 7b. Should the Abyssal Rift pay less? — **owner's call, not costed here**

| Abyssal Rift | t1 | t4 | t8 | t12 |
|---|---|---|---|---|
| P(any relic-tier per clear) | 92.1% | 97.4% | 99.2% | 99.7% |

Mechanism is definitions-per-event: fourteen artifact definitions rolled independently off
one boss. **It gets worse every time anyone adds an artifact to the game, with nobody
touching a number** — which is what makes it structural rather than a tuning miss.

Three things to weigh, and they do not all point the same way:

- The owner has **not** complained about it, and it is live content people are playing.
- These are **first-clear** numbers; the roll skips what the account owns, so the rate decays
  to zero as the collection fills. How much of the roster the owner currently holds changes
  what their complaint even meant.
- If the intent is "a raid is the artifact source", this is the number to move — **not**
  raids back up.

If it is taken on, the fix shape is the same lesson as item 1: the per-clear union is the
quantity to author, and fourteen independent rolls is a composition nobody wrote down. The
instrument already exists (`npm run relicunion`) and the check idiom already exists
(`npm run relics` §6b). **Not started, and not to be started as a side effect of §3.**

