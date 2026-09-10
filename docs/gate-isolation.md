# The gate can no longer test somebody else's code

**Landed 2026-09-10.** `tools/run-tool.mjs`, `tools/check-scripts.mjs`, and 43 rewritten
lines in `package.json`. Gate stage: `npm run harness`, second in the chain, right after
`npm run markers`.

## The fault

Every bundling script in the gate was, literally:

```
esbuild tools/X.ts --bundle --platform=node --format=esm \
  --outfile=node_modules/.cache/X.mjs --log-level=error && node node_modules/.cache/X.mjs
```

The output path is fixed and relative to `node_modules`. Any two runs sharing a
`node_modules` therefore write and execute **the same file**. That happens two ways, and
the second matters as much as the first:

1. **A worktree whose `node_modules` is a symlink** to the shared checkout's. Multiple
   sessions doing this all resolve `node_modules/.cache/smoke.mjs` to one path on disk.
2. **One worktree running the gate twice at once** — re-running a slow stage while the
   full chain is going, which is an ordinary thing to do.

The bad interleaving needs no bad luck: A's `esbuild` writes `smoke.mjs`, B's `esbuild`
overwrites it, A's `node` starts and runs **B's code**. Nothing errors. **A green gate then
certifies a tree that was never tested.**

Four concurrent runs were caught in this state on 2026-09-10. One of them was a session
verifying an unrelated fix — it wrote roughly twenty bundles into the shared cache between
15:26 and 15:27 while three other sessions were mid-gate, and only noticed because the fault
had just been described to it. That is the whole problem: the failure is silent on both
sides, and the session that causes it is not the session that gets the wrong answer.

This is the harness-level member of the family CLAUDE.md keeps returning to — *a harness
that runs but is blind returns a plausible number rather than an error*. It is the worst
member, because it can invalidate every other check in the same run.

## The fix, and why it is a runner rather than a longer command line

**`tools/run-tool.mjs <name>`** bundles `tools/<name>.ts` into a `mkdtemp` directory outside
the repo, runs it, and removes the directory on every exit path including a crash or a
Ctrl-C. The tool's exit code and death-by-signal are passed straight through, because a
wrapper that turns a red gate green would be a worse bug than the one it fixes.

The obvious alternative was to make each of the 43 script lines write somewhere unique — a
`$$` in the filename. That was rejected: it fixes the 43 lines that exist and does nothing
about the 44th. **A rule that cannot be violated beats a check that notices when it was**,
and with the path policy in one place a tool added tomorrow gets an unshared bundle for
free. There is no per-script field left for anyone to omit.

A worktree-keyed path was also considered and rejected for a sharper reason: it removes case
1 and leaves case 2 standing. Fixing the instance while leaving the class is not what this
change is for.

The rewrite was generated from the `scripts` block itself rather than a hand-listed set,
because a hand-listed set is a filter that silently stops covering things as the chain
grows — failure mode #2 in CLAUDE.md's four-part rule, and one this repo has already
shipped. Doing it that way immediately paid for itself: **three scripts do not name their
bundle after their tool** (`rotating-shop.ts` → `rotatingshop.mjs`, `monster-pathing.ts` →
`pathing.mjs`, `boss-arena-contrast.ts` → `bossarena.mjs`), and a rewrite that had assumed
the two agree would have silently pointed three gate stages at the wrong file.

## The check behind the rule

`npm run harness` (`tools/check-scripts.mjs`) fails if any npm script mentions
`node_modules/.cache`. The old shape is still all over this project's git history, which is
exactly where someone will copy it from.

It **prints what it walked** — `walked 52 npm scripts; 43 bundle via tools/run-tool.mjs` —
and fails outright if that second number is ever zero. A check whose scope can quietly empty
is the failure this repo shipped when two tools proved a fallback ladder against a monster
set that later got its art: a filter over an empty table passes forever. The count in the
output is what makes an emptied scope visible rather than inferred.

Both properties were falsified rather than assumed. Pasting the old `esbuild ... --outfile=
node_modules/.cache/vocab.mjs` line back into `package.json` takes the check from exit 0 to
exit 1. The runner was checked the same way: a tool that exits 3 propagates 3, a tool that
fails to compile is non-zero, a missing tool is non-zero, and a name that tries to climb out
of `tools/` is refused.

## Standing rules this leaves behind

- **A worktree gets its own `npm install`. Never symlink `node_modules`.** The runner makes
  a shared `node_modules` safe *for bundle collisions specifically*; it does not make it
  supported, and it does nothing about anything else two checkouts would share. "It worked
  and it saved an `npm install`" is precisely why someone does it again, so the reason is
  written here rather than remembered — **and, since 2026-09-10, enforced**: `npm run
  harness` fails when `node_modules` does not resolve inside the checkout running it, and
  prints where it actually resolved to.

  That escalation from convention to check has a specific cause. The session that *found*
  the original fault reproduced it within the hour, in the worktree they were about to
  certify the multiplayer merge in, while holding their own write-up in working memory.
  They caught it before the gate ran. **A rule whose author breaks it the same day, with
  the reasoning fresh, will not survive a session that has never read this file.**

  It is deliberately resolved with `realpath` rather than `lstat`, so a symlinked parent
  or a bind mount is caught the same as a symlinked `node_modules`: what matters is where
  the bytes live, not how the link was spelled. This is also the "prove it ran clean"
  check — a session can point at the `node_modules is this checkout's own` line rather
  than at its intentions.
- **Any green `npm test` reported on 2026-09-10 from a symlinked worktree is suspect** and
  should be re-run isolated before it is believed.
- **Leave the shared checkout on `master`.** Unrelated to this fault, discovered the same
  afternoon, and the same shape of problem: shared state that several sessions read. A
  feature branch checked out there sends the next session's commit somewhere nobody is
  looking, and it is the thing people check before a merge. Docs-only work is not an
  exception — a docs branch sitting in the shared tree looks identical to a code branch to
  anyone glancing at it.

## The fix, observed rather than described

While this branch was waiting to land, two smoke runs happened to be alive on the machine
at once — same tool, two minutes apart, differing in exactly the variable this change
touches. lootsim-26 read them off `ps`:

```
PID 38477  98.5%   node node_modules/.cache/smoke.mjs                        started 16:32:02
PID 60556  99.9%   node /var/folders/81/…/T/lootsim-tool-pzRJnI/smoke.mjs    started 16:34:14
```

Before this change those two paths were **the same file**, and the second process would
have overwritten the bundle the first was two minutes into executing.

It is worth being precise about why this is admissible, on a night when several numbers
turned out to have come from instruments entangled with their own subject: **nothing
about it was produced by the thing under test.** It was read off the process table by a
session that did not write the fix. An accidental controlled comparison beats a designed
one that shares an author with what it validates.

## What this does and does not isolate

The obvious reading of the fault is "the cache path was shared", which invites the
obvious caveat: a worktree whose `node_modules` is a symlink to another checkout resolves
`node_modules/.cache/` to the shared cache regardless of which directory it runs from, so
it would land straight back on the collision path. That caveat is worth stating precisely
because it is **not** what happens here, and the reason is worth keeping:

- **The bundle path never touches `node_modules` at all.** `run-tool.mjs` builds into
  `mkdtempSync(join(tmpdir(), "lootsim-tool-"))` — the OS temp dir, unconditionally, with
  no path under the repo and nothing derived from `node_modules`. PID 60556 above is that
  path. So a symlinked `node_modules` **cannot** reintroduce a bundle collision: there is
  no configuration of links under which two runs pick the same output file. This is the
  "make the symlink irrelevant" version, not the "unique name inside the shared cache"
  version.
- **A symlinked `node_modules` is refused outright anyway**, by `nodeModulesHome()` in
  `tools/check-scripts.mjs`, which is step 2 of `npm test`. Demonstrated in both
  directions rather than read off the source: a scratch checkout with `node_modules`
  symlinked to the shared one exits **1** with `node_modules is not its own (elsewhere)`;
  a worktree that owns its install exits **0**. So this is a rule that stops you, not a
  caveat you have to remember.

The honest residual is narrower than "collisions can come back", and it is the one the
check's own message already states: **the bundle paths are safe unconditionally;
everything else two checkouts share through one `node_modules` is not** — an install
mutated mid-run, a differing dependency tree, a postinstall artifact. That is why the
rule is a real `npm install` per worktree rather than a tolerated shortcut.

### Landing this turns several worktrees' gates red, on purpose

Counted at the time of writing, **11 of the worktrees on this machine have `node_modules`
symlinked** to the shared checkout (one of them chained through a second worktree), and
four more have none at all. Every one of those fails `npm test` at step 2 the moment this
lands, with the `rm node_modules && npm install` message.

**That is the fix working, not the fix breaking them** — those worktrees could never have
produced a trustworthy green — but it will arrive looking like one change reddening a
dozen unrelated branches, so it is written down here to be pointed at. Any session whose
gate goes red at the `harness` step should run a real install and re-gate, and should
treat anything it certified green from that worktree earlier as unproven.
