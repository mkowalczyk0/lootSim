# PM handoff — 2026-09-11, morning

Written by the outgoing PM session (`lootsim-9f`) when the owner cleared all sessions for
token reasons. Everything a new PM needs is here; assume the reader has none of the
previous conversation.

---

## 1. Your role

You are the **project manager** for lootSim ("Ashes of Purgatory"). You do not write
feature code. You dictate priority, delegate to peer Claude Code sessions, approve and
sign off, and keep the ball rolling. The owner's standing brief:

> "You will dictate priority, delegate work, approve and sign off, and keep the ball
> rolling. Do not re-do or extensively check other agents' work. Only ping me once you
> roll something out and need me to take a look."

**Model allocation the owner asked for**: the longest and hardest task goes to the Fable
session; complex work to the Opus sessions; generic, less complex work to Sonnet.

**Every decision goes to the owner through the `AskUserQuestion` option prompt**, framed
as a professional game designer would pitch it — what the player experiences, what it
costs, what rule it spends. Lead with the recommended option and say it is recommended.
Never filter out the expensive option: the owner has now chosen authored-over-automatic
three times running (see `lootsim-art-direction-and-cosmetics` in memory).

**The owner plays this build live, often in co-op.** Anything landing on `master`
hot-reloads and interrupts them. Every session works in its own git worktree with a real
`npm install` (not a symlink — the test chain writes bundles to a fixed path under
`node_modules`). Finished, gate-green branches **queue**; the queue is batched and lands
only after a single yes/no to the owner.

`docs/game_story_worldbuilding.md` is the creative tiebreaker. `docs/docket.md` is the
running list of owner-reported items.

---

## 2. Master state

`cf33abe` — **batch three**, landed with the owner's approval this morning. Five branches:

| Branch | What the owner feels |
|---|---|
| `fix/ultimate-uptime` @ `752e079` | The Paladin immunity exploit is closed. Every ultimate has a 2s floor; an ultimate that guards its caster's death may be up at most half its own cycle. 53.3% measured uptime at maximum charge rate, against 100% before. |
| `feat/relic-level-gate` @ `379d062` | Relics and artifacts now require a level, derived from the cheapest drop source. `SAVE_VERSION` **35**. Outranking relics unsocket with a one-time town notice. |
| `fix/coop-bugs` | A client's follow zones and its own swing no longer wait a round trip. |
| `feat/boss-target-check` | The boss aim-lock rule gets a real check. |
| `fix/raid-health` | `RAID_HEALTH` 1.7 → 3.0. The two shallowest raids went from 21–30s to 44s and 64s. |

Three additive merge conflicts were resolved by union: two npm scripts, and two
`blind-instruments.md` entries that had both claimed the same ordinal.

**An integration gate was running on master when this was written** —
`/tmp/batch3-integration-gate.log`. At the handoff it was 4,258 lines, zero FAIL lines, no
terminator yet, process alive at ~58% CPU. **Read that log's terminator line and FAIL
count before assuming anything about it** — see §5 on gate signals. If the session that
started it was cleared, the run may have died with it; re-run rather than trusting a
partial log.

**`docs/claude-md-pending.md` is on master and unread by the owner.** It is the one-owner-read
channel for CLAUDE.md corrections — CLAUDE.md changes never land on a branch. It had
+55 lines at batch three, with more entries queued on unlanded branches. Put the whole
set to the owner in one read when batch four lands.

---

## 3. Branch board — everything unlanded

Worktrees are under `~/Desktop/lootSim-worktrees/<name>`.

| Branch | Tip | Worktree | State |
|---|---|---|---|
| `fix/ultimate-uptime` | `ec5ee37` | `ult-pass` | **Needs a full gate — none has ever been run on any of it.** Past batch three's cut: the Engineer grant-path fix with its pin emptied, doc rewrites, blind-instruments 22 & 23, the `meter X/100` units print, and the §37 summon work (mitigation inheritance and the per-hit cap). `npm run check` green. The two §37 commits are the only untested balance changes in it. |
| `feat/nine-circles` | `14dd607` | `nine-circles` | Built on `ebc61cb`, green through `deadpaths`, smoke was still running (PID 61086; log `/private/tmp/claude-501/-Users-martinkowalczyk-Desktop-lootSim/099ec789-4356-4a7b-89c5-dc8315649446/tasks/by47o7xws.output`, read for `CHAIN_EXIT=` and a ` FAIL ` count). `SAVE_VERSION` **36**. **Next: `git reset --hard 6a67250` to drop the duplicated rewards-dial commit, `git rebase cf33abe` (expect a conflict in `src/core/save.ts`'s version list — master has 35, keep 36), then a fresh gate.** |
| `feat/summon-sprite-seam` | `9e0925a` | `summon-sprites` | Complete, working tree clean. **Needs one full gate** — the only run it ever had started before the hardening existed. The hardening *is* committed, verified on disk: the total decode (`SUMMON_UNITS[i] ?? "__unknown_unit__"` in `src/net/sync.ts`, falling through to the triangle) and the sorted-table assertion in `tools/summonart.ts` are both folded into `ee75b9f`. The facing convention and the `SUMMON_ELEMENT_WASH = 0.3` placeholder are documented in `docs/summon-sprite-seam.md`. |
| `docs/blind-instruments-index` | `fb99597` | `relic-levelgate` (branch present, not checked out) | Index, `npm run blindindex`, `harness` duplicate- and undefined-step detection, and **`docs/batch-four-union.md`** — the union-order reasoning written for someone with no context. Never run inside a full chain. **Merge this first in batch four** — see §4. |
| `feat/relic-level-gate` | `bb01df2` | `relic-levelgate` | `379d062` landed. `b345480` + `af54435` + `bb01df2` remain: a `tools/relics.ts` check, a source comment, and the renumber to entry 24. Needs a gate. |
| `feat/affix-codex` | `3d84216` | `affix-codex` | Committed at handoff. Glossary, Codex "Affixes & Stats" view, Reforge possibilities panel, Hero screen cursor/hover, two `claude-md-pending.md` corrections, the `wardPower` blind-instruments entry. **Unverified in a browser** — said so in the commit message. Full gate was running: PID 31127, log `/tmp/affix-codex-test2.log`. |
| `fix/rewards-harvest-dial` | `3f50d6b` | `rewards-dial` | **Already split out — land this first.** `tools/rewards.ts` harvest dial 8 → 5 with the 48-seed measurement in the comment, plus blind-instruments entry 25. `npm run rewards` green (12 plain, 16 hard). Off `cf33abe`. |
| `art/wave-2` | `f2fbd80` | `art-wave2` | Six new Hell monsters finished, wired, and approved by the owner on sight. Smoke was in flight. Merge-ready once green. |

Older branches (`fix/boss-xp-hole`, `investigate/*`, `docs/*`) are parked and were not
part of tonight's work.

---

## 4. What to do next, in order

1. **Establish the truth about the master integration gate.** Read
   `/tmp/batch3-integration-gate.log` for `ALL CHECKS PASSED` and a zero FAIL count. If it
   is truncated, re-run `npm test` on master. Batch three is already live for the owner,
   so a red here is urgent.
2. **Find out what survived the clear.** Ask each session (or read each worktree) for its
   branch tip and whether anything was left uncommitted. `feat/affix-codex` is the known
   risk.
3. **Assemble batch four.** Provisional contents: the seven branches above. Union order:
   **`docs/blind-instruments-index` first**, so `harness`'s duplicate-step detection exists
   while you hand-union the rest; run `node tools/check-scripts.mjs` after each subsequent
   delta (a second, no install needed). Four branches add `npm test` steps.
   **Ask each author whether their step has a real ordering constraint or is free** — a
   duplicated step is now caught and an undefined one fails in a second, but a *mis-ordered*
   union passes silently, because nothing in the repo knows what a step depends on.
   **Two answers are already in**: `blindindex` is free (node builtins and one markdown file;
   preferred second because it is instant), and `ultfloor` is free with a soft preference for
   *after* `check` (a type error makes its failure unreadable) and *before* `smoke` (~20s
   against several minutes, same subsystem). Neither is a constraint. `summonart` is also **free** — it bundles fresh per run into its own
   temp dir, never touches `dist/`, imports only DOM-free `src/` modules, and reads no file
   another step writes. **Only the affix-codex branch was never asked.**
4. **Land `fix/rewards-harvest-dial` first — it is already split out.** It fixes a check
   that is blind on master *today*: the `rewards` harvest fixture runs at a difficulty dial
   where its level-60 subject dies in eight seconds on every seed, and passes only when
   about five elites in forty-eight seeds wander into its swing. **The Nine Circles rng
   perturbation revealed that defect; it did not cause it** — so **a red `npm run rewards`
   on `feat/nine-circles` before this lands is the fixture, not the re-cut.** That is
   written in three places in the branches (`docs/nine-circles.md` §7, the fixture's own
   comment, blind-instruments entry 25). `feat/nine-circles` carries a duplicate of this
   commit at `14dd607`; drop it when rebasing.
5. **Then the assigned work in §6.**

---

## 5. Process rules learned the hard way — these are not optional

- **Serialize gate runs.** At one point six `npm test` chains ran at once. No session
  starts a full gate without asking the PM for a slot.
- **Never `pkill` by pattern in this repo. Kill by exact PID, after verifying its cwd.**
  Three sessions' gates were killed tonight by one session's `pkill -f "npm test"`, which
  matches the top of *every* chain on the machine. It orphans `npm run smoke` and
  everything below it, which then reads to other sessions as somebody else's live work.
- **A `smoke.mjs` or `npm run smoke` with PPID 1 is an orphan of a killed chain.** A fresh
  `lootsim-tool-XXXX` temp dir proves nothing — `run-tool.mjs` mints one per invocation.
- **Read the log, not the exit code, in both directions.** Tonight produced a truncated log
  under an exit code claiming success *and* a complete clean run with no exit code at all.
  The signal is the terminator line plus a zero FAIL count, verified with an anchored grep
  (`^FAIL`), not `grep -i fail`. `EXIT=` alone is evidence of nothing.
- **"Alive" and "working" are different.** A wedged process and a healthy one in the
  campaign section produce identical silence. Check CPU%, not existence.
- **Never take an exit code from the end of a pipeline** — `cmd | tail -5; echo $?` reports
  `tail`'s status. This was committed tonight by the session indexing the very entry that
  describes it.
- **Blind-instruments entry numbers are assigned by the PM, not derived.** Sequential
  ordinals across parallel branches manufacture the exact silent-merge collision that
  entry 17 of that file is about. Master runs to **21**; **22 and 23** are the ultimate-uptime
  branch's, **24** is the relic branch's, **25** is the rewards-fixture branch's.
  `npm run blindindex` now catches duplicates and missing rows.
- **Commit early on a branch.** Hours of finished work sat in one working tree with an empty
  branch, and two sessions were sent to read a table that did not exist. The moment another
  session is told to read your work, it has to exist where they were sent.
- **A design record is not evidence.** `docs/engineer-ultimate-loop.md` named the wrong
  mechanism and recommended a fix that would have changed nothing; the PM approved that fix
  off the document without asking what measurement stood behind it. Reproduce the number a
  record is built on before building on it.
- **A comparison needs a control.** Four confident stories collapsed tonight the moment
  someone ran the same scenario with the change absent.

---

## 6. Work assigned but not finished

**Summons (docket §36 and §37)** — the owner's newest items, and the biggest open thread.

- **§36, sprites.** Every class's summon currently draws as an element-tinted triangle
  (`drawMinions` in `src/render/draw.ts`). **27 distinct units across 10 classes**,
  confirmed by three independent derivations; two come from relics, not classes. The owner
  ruled **bespoke art for all 27**, rejecting a cheaper four-family option, to run **after
  the six Hell monsters and before the monster idle animations**. **Carve-out made by the
  outgoing PM, owner informed and offered the reverse:** the six "player copy" summons
  (`mirror_image`, `monk_afterimage`, and the Trickster's four) draw the **summoning hero's
  own composed sprite**, ghosted — a decoy works by being mistaken for you, and only the
  real hero sprite carries the player's cosmetics. So 21 drawn bodies, 6 that are you.
  Facing is **south-facing, one pose, mirrored when moving left**, uniform across all 21,
  because the renderer has no per-entity rotation mechanism. The seam
  (`feat/summon-sprite-seam`) is built: ladder, wire index, `tools/summonart.ts` gate.
  **`SUMMON_ELEMENT_WASH = 0.3` is an unresolved placeholder** pending real art and the
  owner's eye — including whether a full-body wash is the right carrier at all versus an
  accent, given the monsters' one-hot-accent rule.
- **§37, scaling.** The docket's framing was wrong: summon health *does* track the owner's.
  The real defect was that `hurtMinion` applied **no mitigation** — the owner divides
  incoming damage by armour and resists, the summon divided by nothing, so the summon's
  effective share decayed from 2.83% of owner EHP at level 10 to 1.16% at 70. Inheritance
  (damage reduction + resists) makes it gear-invariant at 6.00%, and is built — **but it
  does not move the death rate at all** (86% → 86%, 20% → 20%, verified live). The reason:
  at depth 10 the median hit landing on a summon is **508 against ~29 health**, and
  **nothing melees a summon** — every point of damage comes from telegraphs and ground
  zones they never dodge. **The owner ruled: a per-hit damage cap**, a summon losing at most
  a share of its max health to any single hit, chosen over "cap plus teach them to dodge",
  over dodging alone, and over accepting summons as consumable. Open questions handed to
  the builder: **what share** (derive it from the 508-vs-29 measurement, don't pick it),
  **before or after mitigation**, and **a check that a summon standing in a raid boss's fire
  still dies** so a one-shot problem doesn't become a tanking-with-skeletons problem.
  **As built:** `MINION_MAX_HIT_FRACTION = 0.25`, applied *after* mitigation; both choices
  are argued from measurements in `docs/summon-scaling.md`, bottom section, which is the
  first thing to read before touching §37. **The immortality check is owed and unrun**, and
  the depth-22 A/B is the reason it matters: the death rate fell **20% → 4%**, meaning 96%
  of summons now expire on their lifespan rather than dying. That is either the intended
  outcome or tanking-with-skeletons arriving by another route, and nothing yet distinguishes
  them. **If 4% is wrong, the lever is the fraction (0.34 = three hits, 0.5 = two), never the
  structure.** `summonDamage` and `maxSummons` are approved but **unwritten** — they were
  deliberately withheld until the cap gave them a live read (see the `wardPower` rule below),
  and `docs/summon-scaling.md` names where each attaches. The inheritance line
  the owner's builder drew, accepted: **in** — damage reduction, resists, plus the
  already-inherited element and attack damage; **out** — triggers, granted skills, leech,
  and anything about the player's own body; **deferred** — crit and elemental damage %.

**Nine Circles band re-cut** — `feat/nine-circles`. The Hell biomes become the nine Circles
over depths 1–25, The Veil unchanged from 26. **Decided by the outgoing PM, not the owner:**
circles stop at 25 rather than 30, because stretching them would move the Hell Endgame layer
edge that the checks are measured against and would drag the Proving off the Abyss's ground.
Four circles have no painted tileset yet and **borrow a neighbour's whole look, declared as
temporary**, with a check that fails a borrow whose sides diverge — so the branch never shows
the owner a flat floor and 56's sheets land as pure addition later. The migration is the
headline risk: **a Memory's `placeId` is the biome name and the loader silently drops a
Memory whose place names nowhere**, so a rename without a map would delete owned endgame
content. It is instrumented — 27 Memories written across every old and new name, all 27 read
back, plus a separate assertion that a genuinely bogus place *is* dropped.

**Art wave 2** — `docs/art-wave-2.md` on `art/wave-2`. The owner chose **Menu B (ambitious)**,
a **full re-cut** of the Nine Circles environments, and **four poses** for the blow. §1a (six
Hell monsters) is done and approved. Next was §36 summons, then §2a monster idles. **14
generations spent, ~1,266 of 1,280 remaining, resets Oct 7** — budget is not the constraint,
session time is. Two owner rulings recorded in the repo: the Grave Piper ships deliberately
out of the density band (the in-band candidate loses the egg-sac that makes it read as a
summoner), and the Bloat-Fiend's accent comes through its belly rather than its eyes as an
approved exception to "the accent is the gaze". A pipeline finding worth knowing: **the
standard character generation mode poses onto a fixed skeleton template and cannot raise
arms** — a pose the template lacks needs a free-form generation with the accent painted in
the finish pass. Several summons (turrets, blooms, the siege engine) will hit this.

**Also outstanding**: the `wardPower` rip-out (never started — see below); the craftable
named-item economy page against `npm run forge`; the cross-branch "a raid is the best
artifact source per floor" assertion; and, still never raised with the owner, pushing ~394
commits to the GitHub origin, fog of war, and shared-loot affinity residue + relic dedup.

---

## 7. Owner rulings you must not re-litigate

- **`wardPower` gets removed, not implemented.** It is granted by eleven classes' foundation
  nodes, two threshold bonuses, the "of Warding" affix and a raid relic, and the simulation
  never reads it. The outgoing PM recommended implementing it; the owner overruled and chose
  to re-author the content. The general rule: **"the code never matched the prose" does not
  tell you which side moves** — ask which direction the correction pushes balance, and
  whether anyone asked for a change in that direction. **The derived rule now binding every
  branch: no new mod key may be authored without a live read in `src/combat/` or `src/game/`
  in the same branch.**
- **Bespoke art for all 27 summons**, not the cheaper family option.
- **A per-hit damage cap** for summon survivability, not a bigger health pool.
- **Relic level requirements derive from the drop source**, with tier overlap accepted — the
  outgoing PM declined to take tier-flooring to the owner because it would be a different
  rule wearing the same name.
- **Raid health 3.0**, from the owner's "all of the raid bosses need a much much higher
  health pool", sized against CLAUDE.md's own "lasts a minute or two" target.

---

## 8. The sessions

At handoff: two Opus sessions (one on the ultimate/Engineer/summons thread, one on relics and
the blind-instruments index), one Sonnet (the affix Codex), one Fable (art wave 2), and two
further sessions on the Nine Circles and the summon seam. All were told to commit everything
and stop. A previous PM session signed off earlier and should not be re-polled.
