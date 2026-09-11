# PM handoff — end of the 2026-09-10 (evening) run

You are the incoming PM. The owner's standing instructions define the job:

> "You are the PM here. You will dictate priority, delegate work, approve and sign off, and
> keep the ball rolling. Do not re-do or extensively check other agents'/sessions' work.
> Only ping me once you roll something out and need me to take a look. Be mindful of the
> session limit and token consumption — use compact and clear after every task."

Plus, always: **`docs/game_story_worldbuilding.md` is the creative tiebreaker.** Read the
relevant part of it before any task touching lore, naming, realm identity or the structure
of a system. Other `docs/*.md` files carry the design records.

Master is at the merge of `fix/keystone-symmetry`, **gate green (`npm test`, all stages)**.

---

## 1. THE ONE THING THAT MATTERS RIGHT NOW: multiplayer is near-unplayable

This is the owner's top priority and everything else is behind it.

**The report (today, their words):** they played co-op with another real person on a second
machine — the first time that has ever happened; every previous test was one process on
localhost. The other player found it *"very laggy, very choppy, near unplayable."*

**Owner-supplied facts, all confirmed by them directly. Do not re-ask:**

| Question | Answer |
| --- | --- |
| Who hosted | The owner |
| Did the host feel it | **No** — "perfectly fine on my end... very playable, very good," maybe marginally less smooth |
| Both ends | **Wifi** |
| Onset | **Bad immediately**, not degrading |
| Movement or attacks | **"Movement felt laggy as well"** |

Host-fine + client-bad rules out local frame budget and confirms the network path. Wifi +
immediate confirms jitter rather than a leak.

**Still unknown, worth getting if they offer it:** ping and jitter numbers between the two
machines, and whether it was same-LAN or over the internet. Do not block on these.

### The diagnosis (lootsim-26, found in code before measuring — verified by me)

**Cause 1 — the chop. The client's tolerance for a late packet is 10 milliseconds.**
`SNAPSHOT_HZ = 20` in `src/net/protocol.ts` (a snapshot every 50ms) against
`LERP_SPAN = 1.2 / SNAPSHOT_HZ` = 60ms at `src/net/sync.ts:48`. `advanceRemote` slides each
remote body toward its last known position over that window; when it expires the body
**freezes on its last known position** until the next packet lands, then jerks. 10ms of
slack is nothing over wifi. I verified both constants myself.

**This is why every check we have is green.** On loopback the inter-arrival gap never
exceeds 60ms, so the failure mode is *structurally unreachable* in every test the project
has ever run.

**Cause 2 — attacks are not predicted at all.** `predictLocal` covers movement, facing and
dash. Attacks, skills, ultimates and interacts are host-authoritative with no local echo, so
a client waits a full round trip to see its own swing.

**Cause 3 — unexplained, and this is the open one.** The owner says **movement felt laggy
too**, which contradicts the design: the client predicts its own movement and reconciles by
replaying unacknowledged inputs, so it should feel instant at any RTT. Either prediction
isn't working under real conditions, or the problem is on the **input path** rather than the
snapshot path — if inputs stall going up, the hero stops *on the host* and the next snapshot
pulls it back, which is rubber-banding. **Nobody has diagnosed this yet.**

### State of the work

`art/two-accents` carries `882ac04` *"fix(net): a de-jitter buffer on the client — the chop
was a 10ms tolerance."* **I asked 26 to confirm it is finished and gate-green before I
merged it, and the session was handed off before that answer landed. Check with 26 first —
do not merge an unfinished net change on your own judgement.**

Three questions I put to them that you should make sure get answered:

1. **Did they falsify the check?** `tools/smoke.ts` asserts *"a walking client is never
   tugged back by the host"* — at **constant RTT with zero jitter and zero loss**. It cannot
   see the reported bug. If it still passes under injected jitter and loss, that must be
   recorded as known-blind rather than read as coverage.
2. **Is the buffer's window a named constant with its assumption written beside it?** The
   old 60ms was right for loopback and wrong for wifi. That is the exact failure shape as
   docket §25 (below). Do not ship a second one.
3. **Does the commit claim to fix the whole report?** It addresses the chop. It does not
   obviously address laggy movement. Narrow the message if so.

### Scope the owner has already opened

They said: *optimize the current setup — **and if not, we look at something alternative.***
That is explicit permission to replace the transport or architecture.

**WebRTC DataChannel (unreliable/unordered) is the leading alternative** and costs no runtime
dependency, since it is built into browsers — the project's no-deps rule survives. We are on
WebSocket/TCP today, so one lost packet stalls every snapshot behind it: classic
head-of-line blocking, and a clean mechanism for laggy movement specifically.

**I told the owner the transport swap might not be needed, then walked that back when they
said movement was affected. Do not let my earlier "complements, not alternatives" framing
anchor the decision.** Price it on what the diagnosis actually finds.

Other unpriced avenues: no delta/dirty encoding, JSON rather than binary, float precision
nobody needs (int16 position quantization is nearly free), no view-culling. Bandwidth is
already known to be **66–105 kB/s at depth 18–26**, higher at four players
(`docs/mp-stuttering.md`, `tools/mp-stutter.ts`).

**Docket §1 is the entry point** and has been reopened in place rather than renumbered.

---

## 2. THE THEME OF THIS RUN, AND THE THING TO CARRY FORWARD

Four times in one day, a check or an instrument turned out to be **structurally incapable of
seeing the thing it was pointed at.** Not broken — blind.

- **Localhost cannot see multiplayer jitter.** Inter-arrival gaps never exceed the tolerance.
- **`tools/bot.ts` cannot measure "find the last monster."** Line 228 iterates *every* enemy
  on the floor with no line-of-sight filter and walks straight at the nearest. Its 1.1s
  average is an **omniscient** agent's walk time; the human problem is *search*. I nearly
  killed a docket item on that number before checking.
- **The "never tugged back" check** runs at fixed RTT with no jitter or loss.
- **`recommendedLevel`'s equip floor** (§25) kept a term whose justification had been deleted
  under it, and stayed green because the term only bites when the Challenger dial is up.

This is CLAUDE.md's own most-repeated lesson — *a check's bound, scope and subject must come
from somewhere other than the thing under test*, and *a harness that runs but is blind
returns a plausible number rather than an error*. **Ask of every green check and every
delegate's number: could this instrument have seen the failure?** It caught real problems
four times today and it is the highest-value question a PM can ask here.

---

## 3. Sessions and what they are holding

Names are addresses for `SendMessage`. Model matters — the owner wants the longest and
hardest work on Opus and generic work on Sonnet.

| Session | Model | Holding |
| --- | --- | --- |
| **lootsim-26** | **Opus** | Multiplayer latency (§1). De-jitter buffer built, merge-readiness unconfirmed. Also owns §19 (boss blow), parked on an owner decision. |
| **lootsim-d8** | **Opus** | The reachable band. Briefed to report a **diagnosis before changing any number**; had not reported when this session ended. |
| **lootsim-97** | Sonnet | Docket §6, the minimap. Building. |
| **lootsim-56** | Sonnet | **Free.** Just delivered the gem-sink shortlist and the docket hygiene pass. |
| **lootsim-f1** | Sonnet | **Free.** Just delivered weapon skins and the keystone fix, both merged. |

**Merge discipline, learned the hard way this run:** verify the main checkout is on `master`
before merging. Seven commits once landed on a leftover feature branch while master sat
still; a peer session caught it from the outside. Merge `--no-ff` with a real message, run
the full gate, then reply to the delegate.

**Browser verification IS available** — this was falsified today. `playwright-core` with the
cached Chromium, your own worktree's dev server on a throwaway port, a throwaway account
through the normal login flow. **Never use port 5173 — that is the owner's dev server.**
Revert any dev scaffolding before committing. The honest caveat is narrower than "unverified":
a screenshot proves a frame, not a session — it says nothing about feel over minutes of play.

---

## 4. Waiting on the owner — do not decide these yourself

**The boss blow (docket §19).** 26 closed every cheap route with evidence: free-form
generation, rigid transform and compositing are all eliminated. The reason is structural and
worth keeping — *an arms-down pose is near rest by definition, because rest IS arms-down*, so
on any boss that rests with hands low a downward blow terminates on a rest-shaped silhouette
and gets vetoed however well it is drawn. What remains is a commissioned hand-drawn impact
frame per **sprite** (not per fight — that is the leverage).

- **12 poses finishes the roster. 4 poses buy 23 of 35 encounters** (Warden 7, Saint 6,
  Colossus 5, Herald 5). A fifth reaches 26 of 35.
- **The cost of not doing it:** the cut from last wind-up frame back to idle moves 54–70% of
  the body, roughly twice the largest real motion inside the animation, on 3 of 6 animated
  sprites covering 18 of 35 fights.
- 26 refused to claim "most players won't notice," correctly: the only player data that
  exists is the owner, unprompted, calling it *"halfway."*

**Gem sinks (docket §3).** 56 recommends **Standards** — one thing you actually did, rendered
under your name in the lobby, on the in-run nameplate and in the hall ("Death March IV ·
Delve 22"). The mark is earned and free; gems buy only the cloth it renders in. Design only,
nothing built, `docs/gem-sinks.md`.

Two things from it worth keeping regardless of the decision:
- **A gem sink is safe iff what it buys is never read by `game/`.** That is *why* "cosmetics
  are powerless" has held — not care, but that nothing in the simulation can see them.
  Necessary but not sufficient: appearance re-rolls pass it and are still wrong, because
  pricing something currently free is a takeaway, not a sink.
- **Refused in writing:** a gem-bought ping that finds the last monster. It is convenience
  substituting for play, and it is docket §6 — *selling the repair for a reported bug* is the
  worst available shape for a real-money sink. **Gems are planned to become a real-money
  currency, so the no-pay-to-win rule binds every gem sink, not just cosmetic ones.**

**Docket §25 — `recommendedLevel`'s equip floor.** Small, and genuinely theirs to call: should
hard content advise a *higher level* than the same depth does? Nothing in `game/` reads
`recommendedLevel`, so no measurement can answer it and no check will go red either way.

**Docket §24 — the Reaper may not be able to charge its ultimate on a raid boss at all.**
Untouched, needs them.

**The Universal Tree point cap.** Deliberately deferred behind the band decision. Note the
keystone fix changed the honest number: the reachability doc's "a realistic frontier buys one
keystone" now reads **zero**. That is correct — the old answer was propped up by the bug —
and it sharpens the cap question rather than answering it.

---

## 5. Landed this run (all merged to master, gate green)

- **§22 — bodies and items no longer end up inside rock.** Both causes my brief predicted
  were **wrong**: 0 of 188 sampled boss spawns were embedded, and knockback stressed to 9,600
  (real values ~140) produced no penetration. It was `separateEnemies()`/`separateMinions()`
  shoving a body back into rock after that tick's own wall-resolve had cleared it. 43
  penetration episodes → 0 across ~323k ticks. The 2–3s unstick net is built as a backstop and
  **fires zero times**; the doc says plainly that a future nonzero count is a *regression
  signal*, not the net working.
- **§23 — item level tracks the receiving character's level everywhere.** Monster drops, clear
  caches and named tables, not just chests. Per-hero in co-op; the clear cache round-robins its
  one physical pile across the live party. §16's `itemPower` was **kept, not repealed** — a new
  `powerIlvl` still scales stats and affix magnitude without moving `requiredLevel`.
- **Seven dead weapon skins now draw.** They had no authored art and fell through to a plain
  tint, so gems had bought nothing visible. Scoped to the seven already sold; it does **not**
  reopen the owner's standing call that a *new* skin is its own authored weapon.
- **Universal Tree keystones all cost 7.** Three cost 5–6 because `CROSS_LINKS` pointed at the
  neighbour path's row-1 node instead of row-2. Cap and node costs untouched.
- **THE EXECUTE RULE** is in `CLAUDE.md`, on the owner's explicit approval.
- **The Colossus idle**, shipped on an owner override that is recorded *as* an override —
  `loop-check.py`'s bar was not moved, and the approval re-measures the value it was granted
  for, so regenerating that art re-reds the check.
- **Docket hygiene**: seven items were shipped but still reading as open. Keep it current —
  I nearly briefed a session onto finished work.

---

## 6. Standing rules worth not rediscovering

- **CLAUDE.md edits go to the owner directly, not through the PM.** I got this wrong and was
  corrected by a delegate mid-run.
- **Assert design promises as comparisons, not one-sided bounds — and give the comparison
  power.** A thin comparison fails as silently as a bound.
- **A rule that cannot be violated beats a check that notices when it was.**
- **Never report a balance delta from one default smoke run.** Widen the seeds and A/B against
  master in a throwaway worktree.
- **The owner reliably trades effort for a better-looking game.** Price both options honestly
  and never withhold the expensive one because it looks like too much work — but a measurement
  showing the cheap option is *adequate* is not an argument that it is *preferred*.
- **Cosmetics are a permanent pillar and never the scope to cut.**
- **Don't commit `docs/game_story_worldbuilding.md`** — it is usually the owner's live WIP.
