# Shared loot: a drop is the party's, not its finder's

**Owner ruling, 2026-09-10**, from live co-op play, overturning the loot ownership that
shipped earlier the same afternoon:

> "Now it's only rewarding whoever's killing the things — if I board wipe, if I clear the
> map, only I get those items that dropped. That's not what we want. We want whoever kills
> anything, the items drop, and we will both get that item no matter who picks it up. So we
> can both pick up the items, whoever kills, it doesn't matter, and we both get it — so we
> can both collectively farm the same stuff."

The rule, in one line: **one physical object on the floor, anybody may pick it up, and
picking it up credits every hero still in the run with their own copy.** Kill credit decides
nothing about who gets paid.

## What this replaced, and why the plumbing survived

For the four months co-op existed, collection was first-come: `updatePickups` handed every
drop to `nearestHero`. Earlier on 2026-09-10 that was read as a bug (the owner could take a
teammate's loot) and fixed by making a drop *owned* — `Pickup.owner`, collectable only by
its owner. The owner then played it and rejected the premise: the problem was never that the
wrong person could take a drop, it was that only one person got paid for it.

So the ownership work was the right plumbing under the wrong rule, and almost all of it is
still here doing the opposite job: the drop tables already assigned per hero, the collect
path already knew how to pay a specific hero, and `net/party.ts` already delivered a remote
hero's item to their own browser. What changed is that the loop runs for everybody.

Three things from that version are **gone rather than left as dead intent**:

- **The clear cache's round-robin recipient cursor.** It existed to answer "which one of you
  is this item for", and nothing in the cache is for one person now.
- **`shareOut`, the integer currency split.** The cache used to divide a coin pile N ways into
  N owned piles. A shared pile pays each hero in full instead.
- **The faded draw for a teammate's drop** (`render/draw.ts`) and **the `owner` slot on the
  snapshot's pickup tuple.** There is no drop you cannot collect, so dimming one would be
  telling the player a lie, and a per-player slot on the wire would be a claim the simulation
  no longer makes.

## "We both get that item" means the same item, at each hero's own level

This was the one open design question, and the code answered it rather than taste.

An `Item` is fully baked: `stats` and every affix value are derived from `levelScale` at roll
time, and `ilvl` is what `requiredLevel` reads. So "the same item with the ilvl adjusted" is
not available as a cheap copy — handing a level 20 the level 50's baked magnitudes is a
straight buff, and re-deriving the magnitudes outside `rollMods` risks values its own ranges
forbid.

What *is* available, and is exact: **every rng draw inside `rollItem` is independent of the
level.** `rng.pick(names)`, the variance draw, `rollMods`' count and picks, `rollGrant`,
`rollTrigger` — none of them reads `ilvl` or `powerIlvl`, which reach the result only through
`levelScale`, a parameter. The same holds for `forgeNamedItem`/`namedMods`.

So one seed replayed per hero gives **the same item** — identical name, identical affix ids,
identical grant, identical trigger, identical variance — with the magnitudes and
`requiredLevel` derived at each hero's own level, every value inside its legal range by
construction, through `rollItem` unmodified. `rollDrop` therefore returns a *recipe*
(`(ilvl, powerIlvl) => Item`) rather than a finished item, and draws everything random once,
up front: rarity and type come in, the variant roll and the seed come off the floor's `rng`.

That keeps docket §23 ("a character earns gear they can equip") true for a level 20 standing
next to a level 50, while the loot banner still tells them both they found the same thing.
Each copy gets its own `Item.id`: they land in separate stashes.

## Two open questions, deliberately not settled here

Both are tuning questions on a feature nobody has played yet, held for the owner to answer
having felt it rather than in the abstract.

**1. One class's affinity biases the weapon family for everyone's copy.** A shared object is
one object, so a single affinity draw decides what the thing is — the credited kill's for a
kill drop, `localHero`'s for the cache. A Magician partied with a Berserker will see the
Berserker's families more often than they would solo.

This is a real choice rather than an oversight, because **the obvious alternative collapses
the whole design**. Letting each hero's own affinity pick their copy's type means a different
name table and a different mod pool per hero, so nothing about the item can be shared — it
becomes an independent roll each, and "we both get that item" is false on its face. The
options are therefore "one affinity decides for the party" or "it isn't the same item", not a
spectrum between them.

**2. The relic dedup still follows the credited hero.** `rollRelicDrops` skips what `source`
already owns, so whether a relic drops at all is still decided against one account's
collection while the drop itself pays everybody. Pre-existing and unchanged by the sharing
work; named here so it isn't discovered later as something this introduced. A duplicate that
reaches a save is a counter and never power (`GameState.bankRelics`), which is why it was
safe to leave.

## The enforcement is structural, in a new place

The ownership version's enforcement was that `dropPickup` required an `owner` — a drop site
written tomorrow couldn't fall back to first-come by forgetting a field, because it wouldn't
compile. That shape is kept, pointed at the new rule:

- **There is no single-item slot to fill.** A drop site hands `dropPickup` a `forge`, and
  `dropPickup` calls it once per hero on the roster. A site cannot give the party one roll
  that only one of them can use, because it never builds the pickup itself.
- **`forge` is handed the two levels and never a `Hero`.** The level a copy is rolled at comes
  from the hero receiving it, supplied by that loop, so the per-site `owner: someHero.index`
  argument that used to invite pinning a drop to one character has nowhere to live. §23 is
  unforgeable here, not merely checked.

## Consequences worth stating plainly

- **A party's total take scales with the party**, items and currency alike: two players
  clearing a floor bank roughly twice what one does, where earlier the same day they banked
  one floor's worth between them. **Settled by owner ruling**, put to them as a live balance
  change against the two alternatives (ship and measure the economy afterwards, or scale drop
  rates down per player to hold the total near a solo's) — they chose to ship it as it stands,
  knowing it makes co-op the efficient way to farm and that it undoes the same-day currency
  split. It is the literal reading of the ruling rather than an interpretation of it, so
  **don't hedge it and don't "fix" it**: `partyScale` has always fattened the floor without a
  loot term, so the work already went up with party size and the payout now follows.
- **Solo is structurally unchanged, not special-cased.** One hero on the roster means one
  entry in `copies`, one credit, one copy at that hero's own level, and the same events.
- **A departed player is credited nothing** — they are out of the run — and a shared drop
  cannot be stranded by anyone leaving, which is why the ownership version's "a departed owner
  releases their claim" case is gone with the gate it protected.
- **Each player reads their own numbers.** Every event `credit` raises is stamped with
  `owner`, which `main.ts` and `net/party.ts` already route per member, so the floating
  `+coins` a player sees is what their own find multipliers paid *them*, not the collector's.
  `RunEvent.pickup`'s `owner` is optional for exactly this reason: the sites that don't set it
  (a dodge, a block, "no resource", a revive) are the ones the whole room should read, and
  they behave as they always have.

## What the gate holds

`tools/smoke.ts` §3b, which is the ownership block inverted rather than rewritten — its
framing was the part worth keeping. Two instruments are asserted before anything reads them,
because both properties are unfalsifiable without them:

- **The hero who did not roll the drop is the one standing on it**, the other parked across
  the floor. So a rule that pays only the killer, or only an owner, goes red rather than
  merely being absent.
- **The party is a level 20 and a level 50.** The old block had two level-14 heroes, which
  would make "each at their own level" pass under every rule, correct or broken — identical
  levels produce identical copies.

Then: one physical object per drop, one copy per hero, the copies are the same item, each is
levelled for its own hero and wearable by them, the higher level's copy really is the bigger
numbers (so "same item" isn't passing by cloning), anybody can collect, collecting credits
both, each banks their own copy, each copy is queued for its own browser, currency pays
everybody in full, a departed player gets nothing, solo is unchanged, and the wire decodes
identically in either party slot.

**Falsified, not just passed** — see the commit message for which checks flip under which
injection. Two injections, because the drop-time half (the copies) and the collect-time half
(the crediting) are independent and one injection can only reach one of them.
