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
