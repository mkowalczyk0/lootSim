# The Engineer's ultimate refilled its own meter — a grant, not the constructs

Status: **fixed**, docket §33, commit `fa77457`. Docket §27 is closed.

The smoke probe read `Engineer: THE ULTIMATE RULE — meter 2.0` where every other class read
`0.0`. This page was rewritten after the fix because **its original diagnosis was wrong in
three separate ways and the fix it recommended would have changed nothing**. That history is
at the bottom, and it is the more useful half of the page.

## What was happening

`src/game/abilities.ts` subscribes a tag-gated `grantEffect` to **both** `skillUse` and
`ultimateUse`:

```ts
} else if (grant.on.tag) {
  const opts = { requireTags: [grant.on.tag as SkillTag] };
  const onCast = (evt: CombatEvent) => { if (mine(evt)) fireGrant(grant, evt); };
  unsubs.push(bus.on("skillUse", onCast, opts));
  unsubs.push(bus.on("ultimateUse", onCast, opts));
}
```

The Engineer's **"Machine Shop"** foundation node (`src/progression/engineer.ts`) is:

```ts
{ kind: "grantEffect", on: { tag: "construct" },
  effects: [{ kind: "resource", resource: "ultimate", delta: 2, to: "self" }] }
```

and Siege Engine carries `tags: ["ultimate", "construct", "summon"]`. So **casting the
ultimate fires the class's own grant straight into the meter that cast it.**

THE ULTIMATE RULE never saw it. `src/combat/resources.ts` enforces the rule on *generation
rules* — `if (ult && !rule.allowFromUltimate) continue;` — and a `resource` effect step run
by a build grant does not go through that code at all. The guard was complete for the path
it guarded and there was a second path.

It needed an armed character only because "Machine Shop" is a tree node: before `armTrees`
landed, no harness in the repo allocated one.

## The fix

At the one site that adds to a pool, with no per-grant field to omit:

- `fireGrant` stamps `fromUltimate: true` on the effect context's `source` when the
  triggering event was an `ultimateUse`.
- `runEffect`'s `resource` step refuses to credit a pool with `isUltimateMeter` when
  `ctx.source.fromUltimate` is set.

A node written tomorrow is covered without its author knowing the rule exists — the same
shape as the execute threshold (§20), the map-wipe selector (§30) and the immunity duty
cycle (§32). **A rule that cannot be violated beats a check that notices when it was.**

Verified with smoke's own measurement (`geared(16)`, depth 8, seed 8100, meter read one tick
after the cast) across **all 21 classes**: every one reads below the 1.0 threshold. The
`ULTIMATE_RULE_PINNED` set in `tools/smoke.ts` is emptied in the same commit, because that
check fails both ways.

## Scope: exactly one grant of this shape exists

A sweep of every class's `progression` and `unlocks` for a tag-gated `grantEffect` whose
effects add to `resource: "ultimate"` finds **one**, and it is this one. So the fix closes a
class of bug that currently has a single member — which is the argument for putting it at
the runtime site rather than editing the node: the node was not wrong, the seam was.

## What this document said before, and why it was wrong

The original diagnosis was that the ultimate *summons constructs*, that a construct's damage
packets carry no `fromUltimate` stamp, that the `construct` tag then matches the meter's
gate, and that the fix was to propagate the stamp onto minions and zones. It was a careful
page — it swept all 21 classes, it corrected an earlier draft of itself in the text, and it
deliberately proposed no number so the owner could decide. It was believed for weeks, quoted
into a task brief, and an hour of implementation was nearly spent on the fix it recommended.

**Three errors, compounding:**

1. **A units error at the top.** `meter 2.0` was read as *"a full meter — the ultimate paid
   for itself, immediately, and could be cast again."* Every ultimate meter has `max: 100`
   and `probeUltimate` reads `.value`, not `.fraction`. It is a **2% gain**. That single
   misreading set the perceived severity 50× too high and made everything downstream urgent.
2. **A mechanism inferred, not traced.** Every link in the construct chain is individually
   true, and the chain is not what runs. Removing the zone step from Siege Engine changes
   nothing; removing the summon step changes nothing; a stack trace on the pool's own `add`
   puts the credit in `fireGrant`, *before the `ultimateUse` event has been emitted*.
3. **A scope claim never counted.** "Of the seven, only the Engineer's ultimate summons
   anything" — ten ultimates create a persistent thing (summon, zone or terrain). The number
   came from a reading rather than a walk.

**And the blast radius, when finally measured with a control, reversed.** An uncontrolled
pass suggested Juggernaut (~6.7%) and Trickster (~12%) also charged from their ultimates'
creations. Against a no-cast control on the same seed they charge **less** with the ultimate
— −3.44 and −6.70 over 30 seconds — because Citadel shields the Juggernaut out of its own
`damageTaken` generation and the Trickster's mirrors take the hits it would otherwise have
dodged. Thirty seconds of ordinary fighting fills those meters; the ultimate was being
credited for it.

The standing question the original page raised — *should* the `fromUltimate` stamp reach an
ultimate's creations? — is still open, and is now a design question with **no defect behind
it**. It should arrive attached to something real rather than because it is on a list.

See `docs/blind-instruments.md` §20 and §21 for what this cost as an instrument failure.
