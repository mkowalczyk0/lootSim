# PM handoff — end of the 2026-09-10 night run

You are the incoming PM for lootSim. Five peer Claude Code sessions do the work; you set
priority, delegate, approve, sign off, and keep the ball rolling. **Don't re-do or
extensively audit other sessions' work** — take their word, spot-check only when something
they claim contradicts something you can see. Ping the owner only when you roll something
out or genuinely need a decision.

## Standing rules from the owner — these override your instincts

1. **`docs/game_story_worldbuilding.md` is the creative tiebreaker.** Read it before any
   lore, naming or structural call.
2. **Every decision goes to the owner as a selectable-options prompt** (AskUserQuestion),
   framed as a professional game designer would pitch it — what the player experiences,
   what it costs, what rule it spends. Lead with your recommendation and say it is the
   recommendation. Never filter out the expensive option; this owner reliably trades
   effort for a better game.
3. **The owner is a live player of this build.** One dev server runs out of the shared
   checkout at `~/Desktop/lootSim`, usually with a second real person in co-op. Any commit
   that lands on `master` hot-reloads and interrupts their session. So: **every session
   works in its own git worktree**, finished gate-green branches **queue rather than
   land**, and you **batch the queue behind a single yes/no** to the owner before merging.
4. **Delegate by model — but check, don't inherit this list.** As of the handover:
   `lootsim-26` and `lootsim-d8` are Opus (longest and hardest work), `lootsim-97` is
   Sonnet, and `lootsim-56` is **Fable**, not Sonnet as an earlier version of this
   document said. The pool composition drifted mid-run without anyone's bookkeeping being
   wrong, so **ask each session its own model rather than trusting any written roster,
   including this one.**
5. **Be frugal.** `/compact` and `/clear` between tasks.

## Where things stand

`master` is at `548f218`. The night's headline work is in and playing:

- **Co-op loot is instanced.** Anyone may pick up any drop, and picking it up credits
  every party member with their own copy at their own character level. This went through
  two owner reversals — first-come-first-served → ownership → shared — and the *final*
  rule is shared. `docs/shared-loot.md` has the design and the two falsification
  injections that establish it.
- **Raids are live in co-op.** The solo gate is gone and the Raid Portal now appears for
  every party member, not just the host, including one whose own account has unlocked no
  raid. The settled design rule: **the party goes where the host goes**, matching the
  precedent the expedition portal already set. The owner asked for this explicitly and
  told us to ignore the earlier `partyScale` scaling discussion — they want to iterate in
  co-op and will report on scaling themselves. Do not reopen that.
- **Multiplayer chop is partly closed.** Movement is fine; the owner reports residual
  input lag on *attacking*. A de-jitter buffer was built, shipped, and then **reverted**
  after a clean real-link test made it worse — root cause written up: `netClock` is a
  simulation clock driving a wall-clock mechanism, `core/loop.ts`'s spiral guard discards
  leftover time, and queue overflow applies several snapshots in one tick. Rebuild
  requirements are recorded; don't rebuild it without reading them.
- **A live crash was fixed** — `updateTelegraphs` asserted non-null on an array a boss
  death empties mid-walk. Falsified properly (1 crash in 60 seeds, seed 802199, red→green
  on one line). `docs/telegraph-splice-crash.md`.
- **The acceptance gate no longer shares a bundle cache** between concurrent worktree
  runs; the chain is 34 steps and `tools/check-scripts.mjs` keeps `package.json` honest.

## The single most valuable thing to carry forward

`docs/blind-instruments.md` — fourteen catalogued cases in this repo of a check that could
not see its own subject. The rule CLAUDE.md now states, and which cost real regressions to
learn: **a check's bound, its scope and its subject must all come from somewhere other
than the thing under test**, and **a rule that cannot be violated beats a check that
notices when it was.** Hold every delegated verification to it. When a session reports a
green, the useful follow-up question is "what would have made it red?", not "are you sure?"

## Open items, in the order I would take them

### 1. Untested and cheap: the host-CPU-starvation hypothesis

The leading untested explanation for the remaining attack-input lag is simply that the
host's machine is loaded. **Host once with the machine quiet and once with cores busy, and
ask the client which felt worse.** This costs one evening of the owner's time and no code,
and it sits ahead of any netcode rebuild. Two separate incidents this session came from
assuming a machine was idle when a stray process had pinned a core for hours — **audit
load by CPU (`ps aux | awk '$3 > 15'`), never by expected command name.**

### 2. Branches that are green and still parked

- **`feat/gem-sinks-standards` @ `13771ec`** — Standards + wardrobe expansion, approved by
  the owner (they chose *both* options), gate-green, never landed. This is the oldest
  unpaid debt on the board. Land it in the next batch.
- **`fix/boss-xp-hole` @ `6b3b7c3`** (d8, marked UNVERIFIED) — needs a rebase onto master,
  then a widened A/B **on an XP-axis metric, never `deepest`**, and **against the arming
  branch, not master**. The owner approved fixing this independently of the difficulty
  work.
- **`investigate/power-curve2` @ `2bf2fe1`** — unlanded measurement.

### 3. Owner decisions queued (put these up as option prompts)

- **The Engineer's self-refilling ultimate** (docket §27, pinned) — a live meter loop
  found when the trees were armed.
- **Shared-loot affinity residue** and **relic dedup** — both written up in
  `docs/shared-loot.md` and deliberately left unresolved. These are tuning calls on a
  feature the owner has now actually played, which is exactly when they are worth asking.
  Note on the first: the alternative doesn't trade off against the current behaviour, it
  collapses the design into independent rolls — so present it as a design choice, not a
  fix. On the second: dedup still follows the credited hero, which is the one place kill
  credit survived the instancing pass.
- **Fog of war.**
- **Whether to push ~394 commits to GitHub `origin`.** Nothing has been pushed all
  project; this is the owner's call and worth asking plainly.

### 4. CLAUDE.md edits awaiting one-line owner approval

Four drafts are written and none has landed. **CLAUDE.md is the owner's document — do not
land an edit to it on a peer session's say-so.** They are:

- 97's raids bullet (raids are no longer solo).
- 26's two co-op loot passages.
- 26's replacement for the campaign-check thinness paragraph. This one is now *backed by
  measurement rather than a gap*: two disjoint 60-seed blocks read margins of **2.55** and
  **2.50**, agreeing to 0.05, so the widened check sits on the noise floor's plateau. The
  paired analysis explains the whole history — per-seed margin sd ≈ 6.1, so at n=60 the
  bar of 1 sits 1.9 SE below the margin, while at n=12 it sat 0.9 SE away, which is a coin
  flip and is exactly why the check inverted on an arbitrary block with no code change.
  **Operationally: a red here is ~3% likely to be noise (about 1 run in 30), so the first
  move on a red is one disjoint block, not a regression hunt.** A 3-sigma bar would need
  ~150 seeds at 2.5× the cost — a real decision for the owner and the only part still
  unpaid.

That CLAUDE.md draft is now the *least* important home for those numbers, because they
also landed in `tools/campaignblock.ts`'s own header — which is what somebody actually
reads at the moment the check goes red, rather than a snapshot doc or a draft that may
never land. **If you read nothing else about that check: a red is ~3% likely to be noise,
so the first move is one disjoint block, not a regression hunt, and never nudge balance
numbers to make it green.**

26 also offered a one-line `"campaignblock"` entry in `package.json` to make that harness
discoverable; it was deliberately not added because `package.json` is a conflict magnet
while merges are being sequenced. Say the word when the queue is quiet.

### 5. Held work

**§19 — the four hand-drawn boss poses — is unowned.** This section originally said 26 was
holding it; **26's context was cleared during the handover and the hold went with it.** The
work is unassigned now, not held, and that distinction matters: an unowned item waits
forever while everyone assumes someone has it.

**The two conditions below survive the loss of their owner and are still the right gate.**
Neither is ceremony, and — this is the load-bearing part — **neither is satisfiable after
the poses are commissioned**, so they are pre-spend or they are nothing:

- Re-derive the 23-of-35 coverage figure from f1's own cause table, rather than inheriting
  it across three sweeps and a PM handover. The owner chose *four* poses partly on the
  leverage that number implied.
- Settle in writing, on pose one, that a measure taken **against idle** won't reject a pose
  that correctly resolves away from rest. The instrument that diagnoses the defect is
  shaped to flag the fix — the same family as everything in `docs/blind-instruments.md`.

Whoever picks this up starts by satisfying both, not by commissioning art.

**A general lesson from how this section went wrong:** a hold that lives only in one
session's context is not a hold, because a `/clear` erases it and the work silently
becomes unowned while the handoff still says it's covered. If something is genuinely
blocked, the block belongs in a file.

## Mistakes I made, so you don't repeat them

- **I briefed two sessions onto work that had already landed** because the docket wasn't
  marked. Verify with `git merge-base --is-ancestor` before briefing anything.
- **I released the merge queue while the owner was mid-session** and interrupted their
  co-op game. That's what rule 3 above exists for.
- **I read a branch tip as a status** and told the owner raids hadn't started when the
  session had it done but uncommitted. Ask the session; tips lie.
- **I relayed two peer claims as fact and had to retract both.** A peer's finding is a
  report, not a result. Say who found it.
- **I shipped a partial fix and nearly called it done.** My raid-portal fix mirrored
  `hub.raid` but never touched `hub.raidOpen`, so it worked only because both accounts
  happened to have a raid unlocked. It passed the case in front of me and would have
  shipped a latent bug. 97's version replaced it. **The case in front of you passing is
  not the property holding.**
