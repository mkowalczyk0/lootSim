# A boss death empties the telegraph list mid-walk

**Fixed in `24e4114`, merged as `99649bb`.** That commit's message carries an `UNVERIFIED`
marker, because it was landed deliberately before the fix had been falsified — the owner
was playing on master and a guard against a state we had a stack trace for was judged
worth shipping marked rather than holding. This document is the proof that arrived
afterwards. The marker cannot be rewritten now that the commit is merged, so the two
halves are linked from this side.

## The crash

```
TypeError: Cannot read properties of undefined (reading 'followId')
    at _Dungeon.updateTelegraphs (src/game/dungeon.ts:1748)   # line numbers here are 8a30050's tree
    at _Dungeon.update
    at playFloor
    at campaign
```

It surfaced in `npm test` on `fix/boss-xp-hole`, which **crashed out of the reckless
campaign rather than failing a check**: 4,145 lines of output, zero `FAIL` lines, process
exit 1. Every check after the campaign never ran. A red gate and a dead gate look
different and it is worth knowing which one you have — grepping for `FAIL` found nothing
here, and the only honest signal was the exit code and the stack trace.

## The mechanism, which is the reusable part

`updateTelegraphs` walks its array backwards and read each slot through a non-null
assertion:

```ts
for (let i = this.telegraphs.length - 1; i >= 0; i--) {
  const t = this.telegraphs[i]!;
  if (t.followId !== null) {
```

Walking backwards is the standard defence against mutating a list you are iterating, and
it is sound for the case it was written for: `resolveTelegraph` splices at `i`, and the
slots below `i` do not shift. But the loop body reaches much further than a splice at `i`.

`resolveTelegraph` damages every enemy caught in the shape. A caught trash monster can
die; `killEnemy` emits `{type: "kill"}` on the bus (`dungeon.ts:2995` on master); a build with an
on-kill effect fires; that effect can finish the boss. And `killEnemy` on a **boss** does

```ts
// Anything still winding up belonged to the encounter too.
this.telegraphs.length = 0;
```

which is correct behaviour and correct commentary — the boss's wind-ups should die with
it. The array is now empty while the loop still has indices to walk. The next read is
`undefined`, and the `!` converts that wrong assumption into a crash one line later.

So the generalisable defect is not "a splice inside a loop". It is **an index into an
array that a nested call, several frames down, can empty — plus a `!` that turns the
wrong assumption into a crash at the next property access rather than at the read.**
Backwards iteration protects against removal *at or below the cursor*; nothing protects
against truncation.

The fix skips a slot that is gone:

```ts
const t = this.telegraphs[i];
if (!t) continue;
```

`continue` rather than `break` on purpose. `break` would be correct for the boss-death
case and silently wrong for any other shape of mid-loop removal, where it would stop
updating telegraphs that are still live. A `break` here would have been a smaller crash
rather than no crash.

## Scope: this is the whole exposure, not the first instance found

A boss death mutates exactly two collections — it empties `telegraphs`, and it splices
summoned monsters out of `this.enemies`. `dungeon.ts` contains six backwards walks
(ground, totems, projectiles, pickups, the summoned-enemy sweep inside `killEnemy`
itself, and this one). None of the other five iterates a collection a boss death can empty
underneath it. That sweep is why the one-line change is a fix rather than a patch, and it
is recorded here and in the commit message so nobody has to redo it.

## Three conditions, and why it sat here unreached

The crash needs all three at once:

1. a boss floor,
2. two or more live telegraphs, so the loop still has indices to walk after the truncation,
3. a build that can kill a trash monster through a telegraph resolve *and* cascade into
   the boss.

The third is the one that changed. Until `fix/arm-the-trees` (merged as `9dcb18c`) taught
the acceptance harness to spend tree points, **nothing in the gate had a build with an
on-kill effect to fire.** A rig that never built a character could not have found this.
That is not an argument against the re-baseline; it is the strongest argument for it.

## The falsification

All three runs are the reckless campaign at seed **802199** — the single crasher out of
the 60 in `CAMPAIGN_SEEDS`.

| run | source tree | result |
| --- | --- | --- |
| A | `fix/boss-xp-hole` as committed (`8a30050`) | **CRASH** — `reading 'followId'` |
| B | the same tree with C′'s own change undone, nothing else | ok, deepest 20 |
| C | the same tree **plus** the one-line guard | ok, deepest 20 |

**B is the isolation and C is the proof.** B was produced with
`git checkout 8a30050^ -- src/data/depth.ts src/game/dungeon.ts`, reverting the branch's
own two files — deliberately *not* by checking out master's copies of them, which would
have dragged in every other merge master has taken since and confounded the comparison
with changes that had nothing to do with either question. A→C is one line of difference on
one identical seed, red to green.

The full sweep first: **1 crash in 60 seeds**, and 802199 alone. That rate is what makes
the single-seed runs decisive rather than lucky.

## This does not exonerate master, and the distinction matters

B passing says master does not reach the crash **on the gate's own 60 seeds**. We already
had that from `fix/arm-the-trees` passing 3,641 checks green on the same source; this is a
cheaper second confirmation, not news.

It does not say master was safe. The defect is unconditional, and it lives in code the
boss-XP branch never touches: that branch's two hunks in `dungeon.ts` are at lines ~140
and ~3048, and the crashing loop is at 1745 (all three in that branch's own tree). It
changes boss XP, which changes levels,
which changes builds, which reaches a cascade that was **always** reachable.

> **One seed in sixty is a rate, not a boundary — the gate's seeds are a sample, and a
> player is not sampling.**

That sentence is the whole argument for why this fix belonged on master immediately on its
own branch rather than riding the branch that surfaced it, and it is the same reasoning
that says a green gate never proved the crash absent. `fix/arm-the-trees` was green at
3,641 checks with this sitting one seed away.

## Reproducing

The probe is deliberately **not** in the tree and not in any gate — a scratch instrument
that isn't a check shouldn't sit in `tools/` looking like one. It is a dozen lines: import
`CAMPAIGN_SEEDS` and `campaign` from `tools/bot`, run `campaign(seed, 0, 20)` per seed
inside a `try`, print one line per seed.

Two notes from building it, both of which cost time:

- **Import `./bot`, not `./bot.ts`.** The rest of `tools/` uses the extensionless form; the
  extension fails module resolution in well under a second.
- **Never pipe a long run through a buffering filter.** The first attempt ended
  `2>&1 | tail -25`, which cannot emit anything until its stdin closes, so it swallowed the
  resolution error *and* the per-seed progress alike. The result was an empty output file
  that reads identically to "still running" — eight minutes were spent waiting on a process
  that had never started. `ps aux | awk '$3 > 15'` answered it in one second. Redirect raw
  and filter at read time. This is catalogued as the fourteenth entry in the
  blind-instrument family (`aead1de`), and it is the species that returns *nothing* rather
  than a plausible wrong number.
