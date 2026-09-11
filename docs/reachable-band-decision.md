# The reachable band: the owner's ruling, recorded — and pending re-confirmation

**Status: recorded, pending re-confirmation.** Neither of the sessions writing this
document witnessed the owner make this call. What exists is a commit message on
`investigate/power-curve2` (`2bf2fe1`, an earlier session) stating that the owner was shown
four priced routes and chose one. That branch was never landed and sat untouched across at
least two PM handovers, which means the decision it records has been sitting nowhere a
future session could find it — **a design decision that lives only in an unlanded commit
is a decision that has not been made, as far as every session after the one that heard it
is concerned.** This document exists to fix that, and its status line stays "pending
re-confirmation" until the owner has actually seen it and said so again. Whoever gets that
confirmation should update this line, not add a second document.

## The ruling, as recorded

**The Delve has a soft ceiling around depth 13–19 for a character built by the ladder
itself, and it is the intended shape of the game rather than a defect in it.** Four
statements, together:

1. **Depth is a dial you push until it pushes back, not a track with a finish line.** The
   Delve advertises no upper bound and has none; what it has is a point where an
   ordinary same-level character stops keeping up, and finding that point is the content.
2. **Where your ceiling sits is decided by your gear, not your level.** One rarity step is
   worth about **4.87 depths**; a character level is worth about **a tenth of one**. An
   Elite-geared character crosses the demand line at roughly depth 16 on trash floors and
   10 on boss floors; a Legendary-geared one crosses at roughly 28 and 20. Pushing your
   ceiling down means finding better gear, which is what a loot game is for.
3. **The rifts, the Tower and the raids are where you go instead — not consolation
   prizes.** Same difficulty curve, walked a different way, paying in things the Delve
   doesn't, and none of them asks a character to out-grow an unbounded exponential just to
   participate.
4. **The bottom of the Delve stays reachable, and that is what makes the ruling hold.**
   Depth 30 — the Proving's gate for all 21 classes, and half the Memories' unlock —
   clears at **level 40 in a Legendary set**. It's a gear goal, not a wall. If it had been
   unreachable at any power, this ruling would not have been defensible; that is why the
   number was measured before the decision rather than after.

**What follows, for anyone tuning something later, per the same record:**

- A player who cannot descend further is not stuck, and nothing in the game — UI, advice
  numbers, mode copy — should read as though they are.
- `recommendedLevel` advising a level nowhere near sufficient past roughly depth 15 (docket
  §25, `docs/difficulty-curves.md` §2b) is now *more* load-bearing, not less: a soft
  ceiling a player can see coming is a design, one they walk into on the game's own advice
  is a trap.
- Do not "fix" the band by relocating content into it — already tried once (the Reliquary
  sectors), already failed, for the reason below: there is no depth at which the mismatch
  stops, so a shallower ladder that still starts past the band re-inherits it.
- Do not soften the curve piecemeal anywhere. Every mode reads the one difficulty curve
  (`profileFor`); a local fix to one system's difficulty is a global change in disguise.

## Why the ceiling exists at all

**Enemy power compounds geometrically in depth. Every axis of player power is either
polynomial, or geometric with a hard stop after eight rarity steps. A geometric curve and a
polynomial one cross exactly once and diverge forever after.** `enemyHealth` grows to
"stay ahead of the 2^n rarity ladder on gear," by its own design comment, and succeeds —
permanently, from around depth 19 onward, because nothing about "stay ahead" says when to
stop. The whole rarity ladder, common to unspoken, is priced at roughly **34 depths, once,
in the entire game** against the floor's own compounding.

## Falsified, not just diagnosed

The mechanism was put to a registered prediction before anyone spent a decision on it, not
left as a plausible-sounding diagnosis. `src/data/depth.ts`'s depth term was swapped for a
polynomial matched to the shipped curve at two points, behind measurement scaffolding that
was reverted before anything merged — nothing else moved, not enemy damage, not counts, not
the player side. The predicted trash-line trend was written down first: baseline demand
climbing 5→5→10→15→35→40→90 across depths 8 through 28 should flatten toward a constant
under a polynomial floor if the diagnosis is right.

It partly did, and the part it got wrong was the useful part:

```
  Elite x20, level required, the deep end     d20  d25  d28  d30
  baseline (shipped curve)                     65 none   90  105
  polynomial floor, one term changed           55   60   55   55   <- flattened
```

The deep end flattened, confirming the mechanism — but demand still climbed roughly
7.5%/depth rather than going flat, because `enemyDamage` (quadratic) still outruns player
effective health (linear in level) on its own. **The one-term fix would have been
necessary but not sufficient**, which is recorded here as evidence the mechanism was taken
seriously enough to try to break, not as a live proposal — nothing from this test shipped
to `src/`, and the ruling above didn't need it to hold.

## The tooling this was measured with is closed, not landed

`investigate/power-curve2` also carried `tools/powercurve.ts`, a `tools/bot.ts` change
(`armTrees()`, spending a character's tree points before measuring), and a `package.json`
script line. **None of that is landing, and it doesn't need to.**

`armTrees()` is already on master, byte-for-byte, via a completely separate later
investigation (`b70e603`, "arm both trees in geared() and campaign()") that found the same
defect — `geared()` was measuring an empty build — independently, and went further than
this branch had chosen to: `b70e603` folded arming directly into `geared()`/`campaign()`
unconditionally, where this branch had deliberately kept it opt-in to avoid moving every
other balance number in the gate. Rebasing `investigate/power-curve2` onto current master
would not be a clean merge; it would be two `export function armTrees` in one file, a
compile error rather than a silent duplicate. `tools/powercurve.ts` also reads a
`damageDealt` field this branch added to `FloorResult` that master's `tools/bot.ts` doesn't
carry, so it would not type-check without fresh work either.

None of that touches the finding above. This branch's own numbers were already computed
using its local `armTrees` fix, not the broken `geared()`, so the ruling doesn't rest on an
instrument that needs reviving. If `investigate/power-curve2` turns up again — by name, in
a stash, on someone's disk — its tooling is superseded by `b70e603` and its finding is
this document. Don't rebase it; read this instead.

## Attribution

Recorded here from `investigate/power-curve2`'s two commits (`630dfb8`, `2bf2fe1`),
written by an earlier session, neither of whom is the session writing this page. The
numbers above are quoted from that record rather than independently re-derived — this
document's job was to stop the ruling from being lost, not to re-run the measurement.
