# The relic economy: a per-source chance is not what the player feels

**The complaint** (owner, 2026-09-10, after a co-op session):

> "Artifact/Relic drop rates are way too high, damn near guaranteed when doing raids"

**The finding**: no number in `RELIC_ODDS` was wrong. The *composition* was — and it was
never authored by anyone. A raid clear paid its artifact at **32.8%** at tier 1 while the
constant said `0.18`, because a raid floor pays twice and the table was rolled on both
halves. The fix makes the constant mean what its own comment says it means.

**The bigger finding, deliberately not fixed**: the Abyssal Rift pays a relic-tier item on
**92.1% of tier-1 clears and 99.2% of tier-8 clears**, which is far past anything the raids
were doing. The owner has not complained about it. It is live content people are playing
and moving it is a balance call, so it is measured and written up here rather than changed.
See "What this deliberately does not touch".

`npm run relicunion` is the measurement. `npm run relics` section 6b is the gate.

---

## 1. The quantity that matters is the union, and nothing stated it

`RELIC_ODDS` authors a **per-source, per-event** chance. What a player experiences is

> did *anything* relic-tier fall out of this run?

Those are different numbers, and three separate multipliers sit between them:

1. **Events per clear.** Each drop event rolls the table independently.
2. **Definitions per event.** `rollTable` rolls **every** matching definition separately,
   so the union grows with the size of the roster — adding a 19th artifact makes every
   existing Abyss run more generous without anyone touching a number.
3. **`dropChance(base, danger)`**, the §16 reward curve, which lifts every chance.

None of those three appear in the constant, and the constant's comment is written as though
they don't exist. That is the whole defect. It is the same shape as the entry in
`docs/blind-instruments.md` about a bound that comes from the thing under test: a number
that was correct for one composition stays in the file after the composition changes.

## 2. What was actually happening in a raid

A raid's one floor **is** its boss floor, so `Dungeon` asks every drop table twice — once
in `killEnemy` when the encounter dies, once in `dropClearCache` when the floor closes.
Before this change both asks were the *identical* query, so every raid definition got two
independent shots per clear. An authored `p` paid out at `1-(1-p)²`.

Measured, fresh account, P(at least one relic-tier item per clear):

| | t1 | t3 | t4 | t8 | t12 |
|---|---|---|---|---|---|
| **Before** | 32.8% | 37.8–49.2% | 51.5–53.1% | 60.0–63.2% | 67.3–71.7% |
| **After** | 18.0% | 20.9–28.7% | 30.3–31.5% | 36.7–39.4% | 42.8–46.8% |

(Ranges span the four raids, which differ in `dangerPerTier` and in their relic's `minTier`.)

### A premise that did not survive the measurement

The brief that commissioned this work proposed that the `Math.min(1, …)` clamp in
`dropChance` was the mechanism — that at a real raid tier the curve saturates against it.

**It cannot.** `rewardCurve.dropChance` is itself capped at `REWARD_CAPS.dropChance = 2.5`,
so the largest value `dropChance` can ever return for the raid artifact is
`0.18 × 2.5 = 0.45`. The `min(1, …)` never binds for any relic source in the game. Nothing
saturates, and the union is smooth in the authored numbers at every tier.

This matters for more than tidiness. The argument *against* simply lowering `raidArtifact`
was that the cap would re-saturate one tier higher — and that argument is void. Lowering the
constant would in fact have worked. It was still the wrong fix, for the reason in §3.

## 3. The fix: a source says which half of the clear pays it

`RaidDropEvent = "encounter" | "cache"`, optional on both the raid source and the raid
query. Omitted on a source means "both halves", which is what every source meant before the
field existed and what all eight raid **named items** still declare — they are untouched.

The eight raid **relic/artifact** sources now declare `event: "encounter"`. A raid's
artifact comes off the boss, which is also what §15 asks for in the first place: *"a reason
to repeatedly farm specific bosses."*

Omitted on a *query* means "any half", which is what a §20 preview asks — a preview wants
to know what the raid can pay at all, not which half just happened. That reading is what
keeps `npm run previews` honest through this change.

**Why this rather than lowering the number.** Lowering `raidArtifact` to ~0.10 would have
produced roughly the same per-clear odds today, and would have left the constant still
meaning something other than what it says — the next person to read `0.10` would still
believe it was the chance of a clear, and would still be wrong by a factor that changes
whenever the floor's payout structure does. Naming the event fixes the *statement*, and the
number goes back to being readable. The odds are now a consequence of one authored number
instead of a coincidence of two.

**One statement of the event list.** `raidDropQueries(raidId, tier)` in `data/raids.ts` is
the single place the two halves are written down, and `Dungeon` builds both of its queries
from it. Tools measuring "what does a raid clear pay" read the same list rather than a copy,
because a restated event list is exactly the instrument that keeps reporting the old
composition after the real one changed.

## 4. The checks, and what makes them red

`npm run relics` section 6b. Comparisons and equalities, not one-sided bounds — the
standing lesson in `CLAUDE.md` is that a loose threshold doesn't prove a design promise.

1. **`a raid clear pays its artifact at exactly the odds RELIC_ODDS states`** — an
   *equality* between the constant and the composed per-clear union. This is the headline.
2. **`a raid clear more often pays nothing relic-tier than pays something, at every tier to
   12`** — "not a guarantee" as a comparison against its own complement, over all four
   raids × eight tiers.
3. **`per clear, not just per source, a raid's artifact stays at least 1.5× its relic`** —
   rule 5's ratio restated on the quantity the player experiences.
4. A scope line printing how many raids and tiers were walked, so a check that has silently
   emptied is visible in the output.

Both were falsified by injection rather than trusted:

| Injection | Result |
|---|---|
| One artifact source loses `event: "encounter"` | `FAIL … — tyrant-of-the-first-heavens 32.8%` and `FAIL … t6 52.2%, t8 57.0%, t10 61.5%, t12 65.6%` |
| `raidDropQueries` gains a third payout event | All three red; all four raids at 32.8%, tiers 4–12 over 50% |

The injected numbers reproduce the pre-fix measurement exactly (32.8% / 63.2% / 71.7%),
which is independent confirmation that `tools/relicunion.ts` and the gate agree.

`tools/relicunion.ts` additionally checks its own analytic model against a 40,000-trial
Monte Carlo through the real `rollRelicDrops` on every row it prints, and flags any row
where the two disagree by more than 2 points. A closed-form model of a roll site is exactly
the kind of instrument that runs and reports a plausible number without ever touching the
code under test.

## 5. What this deliberately does not touch

**The Abyssal Rift, and it is the larger number by far.**

| Abyssal Rift | t1 | t4 | t8 | t12 |
|---|---|---|---|---|
| P(any relic-tier per clear) | 92.1% | 97.4% | 99.2% | 99.7% |

The mechanism is multiplier (2) rather than (1): the Abyss boss matches **14 artifact
definitions**, each rolled independently at ~21.8% at tier 8. `1 - 0.782¹⁴ ≈ 0.97` from the
boss alone, before the five per-floor `abyssCache` events. Nobody authored 99%; it is the
roster size times a per-source number, and it rises every time an artifact is added.

Three consequences worth stating plainly:

- **A raid was never the most generous artifact source, on any normalisation.** The comment
  on `RELIC_ODDS.raidArtifact` claims it is, and per *source chance* it is (0.18 > 0.14).
  Per clear the Abyss beat it 92% to 33% before this change. Per *floor* — normalising the
  Abyss's five floors — the Abyss was ≈39.8% against the raid's 32.8%, so the Abyss won
  there too. This is the cleanest available demonstration of why a per-source number is not
  a design statement.
- **This change widens that gap** (raids now 18% per clear). If the intent is that a raid is
  the artifact source, the answer is to bring the Abyss down, not to put raids back up.
- **The chase is self-limiting and the numbers above are the first-clear case.** The roll
  skips what the account already owns, so a player holding most of the roster sees a far
  lower rate, decaying to zero. "Damn near guaranteed" describes the early experience
  precisely, and the steady state not at all.

Changing any of this is a live balance change to content people are playing, so it is the
owner's call. Not touched here.

**Named items.** All eight raid named items still pay from both halves of the clear.
Narrowing them would be an uncommanded balance change to a different table.

**The Proving, the Nameless, the deep Delve cache, the Tower cache.** Untouched.

## 6. Co-op: what is true, and one thing that is not

The complaint came out of a co-op session. `Dungeon.collect` credits **every** non-departed
hero with their own copy of a collected drop — the owner's own 2026-09-10 ruling — so one
successful roll puts a relic into up to four accounts.

**What is true**: a *party's collective* relic acquisition scales with party size. Four
people farming together fill four collections at the rate one person fills one.

**What is NOT true, and was claimed here in an earlier draft**: that a party therefore sees
four relic banners per drop. It does not. Every event `credit()` raises is stamped with
`owner`, and the client pipeline filters on it in three places — `main.ts:449` drops any
owned event that isn't the local hero's, `main.ts:529` shows a relic banner only when
`ev.owner === d.localHero.index`, and `net/party.ts:426` forwards each owned event only to
the member it belongs to. **Each player sees exactly one banner, for their own copy.** This
was designed for precisely that failure when shared loot landed.

**What is unmeasured**: whether co-op raises an individual player's relic rate above the
solo numbers in this document. The roll fires once per drop *event* and everyone is
credited, so the per-player rate *per event* is unchanged; whether a party floor produces
more qualifying events (party scaling makes more monsters, but relic sources are bosses and
caches, which do not multiply) is a separate question nobody has measured. **Do not assert
a direction on it without measuring.**

The general caution still stands, and the error above is an example of it: the party's
experience and the per-player probability are different quantities, and only the second is
what `RELIC_ODDS` describes. A simulation-side fact ("every hero is credited") does not by
itself license a claim about what the player *sees* — that requires tracing the event
filter and the party publish path, which the earlier draft had not done.
