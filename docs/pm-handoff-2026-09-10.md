# PM handoff — 2026-09-10

For the session picking up the PM role from `lootsim-21`. Master is green at the time of
writing (`npm test`, ALL CHECKS PASSED, `SAVE_VERSION` 33).

Read `CLAUDE.md` first — this file assumes it. This is the *situation*, not the rules.

---

## 1. What the job is

The owner's standing appointment, in their words:

> "you are the PM here, you will dictate priority, delegate work, approve and sign off, and
> keep the ball rolling"

With these standing constraints, all of them load-bearing:

- **"Do not re-do or extensively check other agents/sessions work."** Review the thing you
  personally ruled on, confirm the version number, run the gate, merge. Do not re-audit a
  delegate's measurements.
- **"Only ping me once you roll something out and need me to take a look."**
- **Delegate the longest/hardest tasks to Opus sessions, generic tasks to Sonnet.**
- **"Please be mindful of the session limit and token consumption."**
- **"Always refer to the `game_story_worldbuilding.md` for creative direction."** It is the
  tiebreaker on any lore, naming or identity question. It is often the owner's live
  work-in-progress with uncommitted lines — **never commit it as a side effect.**
- Do not call the Agent tool, and do not use workflows or deep-research, unless the owner
  asks.

And the delegation note they left when they stepped away:

> "if you're blocked I'll defer to you to make the final judgement unless you deem it
> absolutely critical. Even artwork I'll defer to you - acceptable is okay I'll come back
> and let you iterate if needed but id rather just look at it in prod in a batch and send
> you feedback. Ping me if you run out of things to do."

**"Acceptable" is the bar for shipping, not "approved."** Land finished work; let them
iterate from the running game. Do not stream individual screenshots for verdicts.

---

## 2. The sessions and what they hold

Message them by name. Every one of them is mid-task; none is idle.

| Session | Holding | State |
|---|---|---|
| `lootsim-26` | **Docket §7 — boss attack animations.** Owner priority. | Just reassigned; War Queen inpaint parked behind it |
| `lootsim-f1` | **Docket §8 — nerf the Ranger's ultimate.** Owner priority. | Just assigned |
| `lootsim-d8` | Weapon skins, families #3 and #4, then the four named rows | 2 of 14 families done |
| `lootsim-56` | Trophy hall follow-ups | Hall merged; no case art, nothing renders in-world yet |
| `lootsim-97` | Idle — last task (universal-tree measurement) merged | Available |

**Everything that was in flight is merged.** There are no unmerged delegate branches
outstanding as of this handoff.

---

## 3. The docket

`docs/docket.md` is the durable list. Current state:

| # | Item | Status |
|---|---|---|
| 1 | Multiplayer stuttering | **Investigated, not fixed — blocked on the owner** |
| 2 | Rotating shop | **Landed** (`docs/rotating-shop.md`) |
| 3 | More gem sinks | **Trophy hall landed** (`docs/trophy-hall.md`); the rest of the candidate list is open |
| 4 | Global leaderboards | **Landed** (`docs/leaderboards.md`) |
| 5 | In-game UI cleanup | **Landed** |
| 6 | Map + last-monster indicator | **Landed** |
| 7 | **Boss attack animations** | **In flight — owner priority** |
| 8 | **Nerf the Ranger's "The Last Hunt"** | **In flight — owner priority** |

Items 7 and 8 came from the owner *playing the game* and outrank anything queued from a
planning conversation. That ordering is written into the docket file itself.

---

## 4. Decisions waiting on the owner — carry these to them

**Do not decide these yourself.** Each is priced, written up, and genuinely theirs.

1. **The reachable band** (`docs/reachable-band.md`). An attentive same-level character
   clears roughly depth 13–19 and stops. Found four separate times by four routes now.
   Three options priced, none recommended. Nearly every other open question is downstream
   of this one.

2. **The Universal Tree is funded for a player who does not exist**
   (`docs/universal-tree-reachability.md`). `UNIVERSAL_POINT_CAP` binds at frontier 40; a
   measured campaign average of 11.7 buys **5–6 points**, which affords exactly one
   keystone out of six with nothing left for a second or a hybrid. The gate's old headline
   ("54% of the tree is affordable") described the cap, not a player. Three options priced.
   **Sub-finding worth its own look:** the six keystones are not equally priced and not by
   intent — three sit behind a cross-link that *replaces* their in-path prerequisite rather
   than adding to it, so they cost 5–6 while the others cost 7. That asymmetry is the only
   reason any keystone is reachable, and it means a real player always reaches one of the
   same cheap three.

3. **Seven weapon skins currently draw nothing at all** (`docs/art-manifest.md` §7.1).
   This is the sharpest one and I would put it in front of them first. All fourteen
   families now have authored art and `resolveWeaponDraw` prefers it over the procedural
   bake — but the seven original palette skins can only paint the bake. So you can buy
   Frostbound with gems, equip it, and your weapon is unchanged. Three options written up
   (author art for a subset / let a palette tint the authored weapon / retire with a gem
   refund). **Cosmetics are permanent in this game and must never be proposed as scope to
   cut**, which is exactly why this needs their ruling rather than a quiet retirement.
   Note the middle option is the colour-transform model they turned down for *new* skins —
   that does not obviously settle what to do with seven already sold.

4. **The War Queen's boss-floor contrast reads 26.1** against a 28 bar borrowed from a
   monster check. Left deliberately. Gates whether `npm run bossarena` joins `npm test`.

5. **Multiplayer stuttering needs two real machines.** Host compute and both ends' render
   load were measured clean under a real fight. Everything ran over localhost — no latency,
   no jitter, no loss — and the relay is a bare TCP pipe. This needs the owner and the
   original reporter, and nothing else will move it.

---

## 5. Conventions I established today — keep these

**The `SAVE_VERSION` claim list.** It lives directly above the constant in
`src/core/save.ts`. Two branches collided on 31 in one day because I reserved a number in a
private message and a reservation living in one session's inbox does not exist for anyone
else. Branches now claim a number in that list in the commit that starts the work, leave
the constant alone, and **the PM assigns the real number at merge.** It prevented a second
collision within hours. Keep it.

**Peer sessions do not edit `CLAUDE.md`.** They route corrections through the PM. This came
up three times today and was right each time.

**A finding lands on master even when the fix does not.** The measurement instrument and a
written design record are the deliverable when a fix turns out to be wrong, blocked, or the
owner's call. `docs/mp-stuttering.md` and `docs/universal-tree-reachability.md` are today's
examples.

**Comments that park a decision go stale hardest.** The weapon-skin precedence comment still
said *"Do not guess it here"* about a question the owner had already answered — and `d8`,
after a context clear, correctly stopped. A stale fact misleads; a stale "do not proceed"
halts. When you rule on something, go find the comment that parked it.

---

## 6. Rulings I made that a new PM should not silently reverse

These were mine, not the owner's, and they are load-bearing. Change them deliberately or
not at all.

- **Gems buy choice, never quantity.** Enforced structurally in `GameState.buyShopSlot`: a
  reroll can never move the purchase cap. This is the whole thing standing between the shop
  and pay-to-win once gems become real money.
- **The shop stops at mythic**, as a *type* (`ShopRarity`), not a filter.
- **The account server must never learn the save format.** It stores saves as opaque
  strings; leaderboard records travel as their own small independently-versioned payload.
  That property paid for itself three times today — the shop, the leaderboards and the
  trophy hall each bumped `SAVE_VERSION` at zero server cost.
- **Leaderboard titles are earned, never purchasable.** The gem sink is the *display*. A
  title banks as a dated snapshot and never re-validates against a live board.
- **Named weapon beats skin** — this one is the owner's ("named weapon wins"), now
  documented in both places that used to call it open.
- **Depth boards show real clustering, uncompressed.** Rescaling the axis to hide the
  13–19 band would answer the reachable-band question by omission.

---

## 7. What I would do first

1. **Put the seven dead weapon skins in front of the owner.** It is the only open item
   where a player can currently spend a currency and receive nothing, and the owner is
   actively playing.
2. **Watch for §7 and §8 landing** — both are owner-reported and both will want a batch
   note in `docs/player-visible-changes.md`.
3. **Keep `docs/player-visible-changes.md` current.** It is written in player terms and it
   is what the owner reads when they come back. It deliberately records what did *not* get
   fixed as well; a batch review that quietly omits the failures is worth less than none.
4. `lootsim-97` is free.
