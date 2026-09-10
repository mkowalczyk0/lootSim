# "Finding the last monster" — measured, and the feature it would have justified isn't needed

Status: **measured, closed, nothing to build.** Docket §6's second half, split from the
minimap (`docs/docket.md` line 176): the owner's report was "players spend some time in
deeper depths looking for the portal and looking for one last monster that got lost
because it got stuck behind a wall or something." The minimap (wayfinding to the portal)
already shipped separately (`bb2fab2`). This document is the other half — whether "stuck
behind a wall" is a real, reproducing mechanism, measured before anything was built
around it.

## The finding, stated once

**The last monster is not stuck and not unreachable. 13 null-route episodes across 300
real cleared floors, average 0.19s, max 0.53s — and none of the ten worst individual
last-kill gaps had a null-route streak at all.** A marker built to lead a player to an
"unreachable" monster would have been solving a problem that doesn't exist in today's
code; the fixes that landed earlier the same day (the morning's `FlowField.direction()`
null-route fix, and this session's own `fix/stuck-in-walls`) had already closed the two
most obvious mechanisms before this docket item was even filed. What remains is a
knowledge problem — the player doesn't know where the last monster is, not that they
can't get there — and that is already served by the minimap's existing low-monster-count
reveal (see below), not by a new feature.

## The measurement, and the mistake worth keeping visible

`tools/last-monster-check.ts` (new, standalone, not wired into `npm test`) plays real
floors with `campaign()` — 24 seeds × 20 dives, 300 cleared floors, depths 1-19 (where a
real campaign actually lives; a first attempt hand-geared a character straight onto deep
floors and died at 0/1 kills on every single one past depth 10, since depth 30 is "far
beyond the measured frontier" and that population doesn't exist). For every cleared
floor it records the gap between the second-to-last kill and the last one, and — in that
same window — whether `FlowField.direction()` ever returns null for a remaining
wave-director monster.

**The first pass of this measurement was wrong, and it's worth stating exactly how.**
Counting null-route *ticks* directly returned 241 "hits" in the last-kill window across
300 floors — a number that reads as "pathing fails constantly." Deduping those ticks into
*sustained streaks* (one enemy id, one continuous stretch of null routing, ended the
moment it resolves or the enemy dies) collapsed that to 13 total episodes, averaging
0.19s and topping out at 0.53s — a number that reads as "pathing is fine." **The same
measurement counted two ways gives opposite answers, and only one of them is the
phenomenon a player could ever notice.** `FlowField` rebuilds four times a second
(CLAUDE.md), so anything under ~0.25s is a gap between rebuilds resolving itself before
the next frame, not a stuck monster — 8 of the 13 streaks were under that line entirely.
The next person measuring a null-route question in this codebase should dedupe into
streaks the same way, not count ticks.

## Two caveats on the headline numbers, neither resolving the finding, both worth carrying forward

- **`tools/bot.ts`'s bot targets omniscient.** It iterates every enemy on the floor with
  no line-of-sight filter and walks the nearest one through the flow field. The 1.1s
  avg / 5.3s max last-kill gap this measurement reports is the time for an agent that
  already knows exactly where the last monster is to walk there — a lower bound on a
  human's *search* time, not a measurement of it. This instrument cannot answer "how long
  does a person spend looking," only "is the monster reachable once you know where it
  is" — which is the question this document actually needed answered, and the reason the
  reachability numbers above are trustworthy while the gap-in-seconds numbers are not
  read as a measure of player-felt time.
- **`campaign()` — not `geared()`, though the two share this — never allocates a class-
  tree or universal-tree point.** Every character this measurement fielded ran a fully
  empty build (found independently by d8 on `geared()`'s own code path the same day).
  The reachability numbers (null-route episode count and duration) are unlikely to be
  affected by this — whether a monster's position is inside the flow field's current
  reach is a property of level geometry and monster position, not of the hero's combat
  power or move speed. The depth range reached (1-19) and the gap-in-seconds figures
  carry the same "underpowered bot" caveat as every other number produced this way.

## What's already serving the knowledge problem

`bb2fab2`'s minimap (`src/ui/hud.ts`, `Hud.drawMinimap`) already reveals live blips for
the wave director's own remaining monsters once the count drops low enough — originally
gated on a flat `10` lifted from the owner's own quote, now (this branch) gated on
`Dungeon.burstSizeFor()`: once what's left can no longer hide a whole extra burst behind
it, there's no ambush left to spoil, only the tail end of a fight whose tension is
already spent. That is the answer to "I don't know where the last one is" this docket
item asked for; nothing further was built on top of it.

## What was proposed and explicitly not built

A fog-of-war minimap — reveal only rooms the player has actually walked, rather than the
full floor schematic from the first frame — was raised as a possible extension while
this was being scoped. **Not built.** It is a new feature, not a fix for the defect the
owner reported, and this docket item was opened by a report of something wrong in front
of them; starting new UI scope on the strength of a closed bug isn't this session's call.
Costed for the owner separately: it would trade the current "see the whole layout
immediately" orientation for "see only where you've been," which changes the floor's
feel from *oriented* to *exploratory* — a real design tradeoff, not a strict
improvement, and one the owner should decide with the tradeoff stated plainly rather than
have it default in through a bug-fix branch.

## Reproducing this

`npx tsx tools/last-monster-check.ts`. `tools/monster-pathing.ts` (already in `npm test`)
covers the specific "resting flush against a wall" null-route bug in isolation; this
document's instrument is the same underlying check aimed at the docket's actual
scenario (the tail end of a real floor) rather than a synthetic position.
