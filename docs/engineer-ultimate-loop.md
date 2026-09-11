# The Engineer's ultimate refills its own meter — on a build nobody had ever tested

Status: **FIXED (docket §33, commit `fa77457`) — and the diagnosis below was wrong.**

> **Read this box before the rest of the page.** Everything under "The actual mechanism"
> is a careful, confident, *incorrect* account, and it survived weeks because it is
> plausible and nobody re-measured it. It is kept rather than deleted because the way it
> was wrong is the useful part, but **do not act on it.**
>
> **What the page gets wrong, in order:**
>
> 1. **`meter 2.0` is not "a full meter".** Every ultimate meter in the game has
>    `max: 100`, and `probeUltimate` reads `.value`, not `.fraction`. It is a **2% gain** —
>    a 50x units error, and the one that makes the whole entry read as an emergency.
> 2. **It is not the constructs, and the stamp is not the problem.** Removing the zone step
>    from Siege Engine changes nothing; removing the summon step changes nothing. A stack
>    trace on the pool's own `add` puts the credit in `fireGrant`, *before* the
>    `ultimateUse` event is even emitted.
> 3. **The recommended fix would not have worked.** "Propagate the stamp onto minions,
>    constructs and zones" addresses a path this bug never took.
>
> **The actual cause:** `abilities.ts` subscribes a tag-gated `grantEffect` to `skillUse`
> **and** `ultimateUse`. The Engineer's **"Machine Shop"** foundation node grants
> `{ resource: "ultimate", delta: 2 }` on the `construct` tag; Siege Engine carries
> `tags: ["ultimate", "construct", "summon"]`. The ultimate fires its own class's grant
> into the meter that cast it, never touching the generation-rule path `resources.ts`
> guards. A roster sweep found **exactly one** grant of that shape in the game.
>
> **The fix** is at the one site that adds to a pool: `fireGrant` stamps `fromUltimate` on
> the context when an `ultimateUse` triggered it, and `runEffect`'s `resource` step refuses
> to credit an ultimate meter from an ultimate-sourced context. No per-grant field, so a
> node written tomorrow is covered. All 21 classes verified below the threshold; the smoke
> pin is emptied.
>
> **And the blast radius was measured with a control, which reversed it.** An uncontrolled
> pass suggested Juggernaut (~6.7%) and Trickster (~12%) also charged from their ultimates'
> creations. Against a no-cast control on the same seed they charge **less** with the
> ultimate — -3.44 and -6.70 over 30s — because Citadel shields the Juggernaut out of its
> own `damageTaken` generation and the Trickster's mirrors take the hits it would have
> dodged. Nothing but the Engineer was ever affected.

## The measurement

`npm test`, the `classes` section of `tools/smoke.ts`. THE ULTIMATE RULE asserts that an
ultimate's own output does not refill the meter that fires it:

```
  before (unarmed character)    ok   Engineer: THE ULTIMATE RULE — meter 0.0
  after  (armed character)    FAIL   Engineer: THE ULTIMATE RULE — meter 2.0
```

`meter 2.0` is a full meter — the ultimate paid for itself, immediately, and could be cast
again. Every other class in the roster reads **0.0** on the same probe.

Nothing in `src/` changed between those two lines. The only difference is that the probe's
character now has its class tree and universal tree allocated
(`armTrees` in `tools/bot.ts`), which is what a real player's character has.

## Why it was invisible, and why that is the interesting part

`ENGINEER_ULTIMATE_METER` in `src/progression/engineer.ts` carries this comment:

> The `damageDealt` term is deliberately tiny and tag-gated: a construct's zone tick or
> shell carries the ability's `construct` tag, so it counts, but at a rate where even a
> fully built-out engineer needs the constructs to work for a while. Turret auto-attacks
> carry no ability tags and so never feed this — which is the point: an early draft ran
> this rule untagged at 0.2/damage and every turret hit (crediting the owner) fed the
> meter, so 8 turrets refilled it in under a second and the ultimate looped on its own
> damage. Tag-gated + 0.03 breaks that loop.

**This loop has been found and fixed once already.** The fix was tag-gating plus a rate
drop, and the comment makes a claim about *"even a fully built-out engineer"* — in a repo
where **nothing had ever built one out.** `geared()` spent no tree point and set no
frontier, so every harness that could have caught this was structurally incapable of
expressing the case the comment was reasoning about.

That is the same failure shape as a network fix validated by a model written in the same
commit as the fix: the verification could not reach the thing it was verifying. The
difference is that this one sat in the code with a confident comment on top of it.

**The lesson is not about the Engineer.** It is that "even a fully built-out X" is a claim
about a configuration, and a claim about a configuration is worth exactly as much as the
harness's ability to build that configuration.

## The actual mechanism: the stamp does not reach the ultimate's summons

**A first draft of this document had this wrong**, in the direction of alarm, and the
correction is the useful part. It reported that six of the seven damage-fed ultimate
meters were structurally exposed because each class's ultimate carries its own gating tag:

```
  berserker    gate ["heavy"]        ult tags [area, heavy, melee, nova, ultimate]
  lancer       gate ["charge"]       ult tags [charge, line, movement, ultimate]
  ranger       gate ["projectile"]   ult tags [execute, projectile, ranged, stealth, ultimate]
  reaper       gate ["execute"]      ult tags [crowdControl, execute, ultimate]
  stormcaller  gate ["lightning"]    ult tags [lightning, ultimate, weather, zone]
  engineer     gate ["construct"]    ult tags [construct, summon, ultimate]
  warlock      gate NONE             ult tags [curse, ultimate, void]
```

Every one of those overlaps. **And it does not matter**, because the tag gate is not what
enforces THE ULTIMATE RULE. `src/combat/resources.ts` does, at the runtime, ahead of any
tag test:

```ts
const ult = evt.packet ? isUltimateSourced(evt.packet) : evt.fromUltimate === true;
if (ult && !rule.allowFromUltimate) continue;   // THE ULTIMATE RULE
```

`abilityBlocksUltimateCharge()` stamps `fromUltimate` on every packet an ultimate emits,
and `isUltimateSourced()` refuses it. **An ultimate's own damage cannot charge its own
meter on any class, tag overlap or not.** The rule is structural and it works.

**So why does the Engineer fail?** Because its ultimate does not deal the damage — it
**summons constructs**, and a construct is a separate entity whose damage packets are built
from the construct, not from the ability that created it. They carry **no `fromUltimate`
stamp**, so `isUltimateSourced` returns false, the `construct` tag matches the gate, and
the meter fills.

**The stamp does not propagate to what the ultimate creates.** That is the defect in one
line, and it is a much narrower thing than "the tag gate doesn't gate."

It also predicts exactly who is exposed: **a class whose ultimate creates persistent damage
sources that carry its meter's gating tag.** Of the seven, only the Engineer's ultimate
summons anything. That is why only the Engineer fails, and it is a structural reason rather
than the rate accident a first reading suggests.

**`warlock.ts` stays flagged, not fixed.** Its rule is `{ on: "damageDealt", amount: 0.03 }`
with **no tag gate at all** — the exact shape the Engineer's had before its first fix. Its
own ultimate is blocked by the runtime like everyone else's, so it is not the Engineer's
bug; what the missing gate means is that *any* damage the Warlock deals charges the meter,
which may well be intended for a class whose identity is attrition. **It passes today.
Passing today is not the same as being gated**, and if the Warlock ever gains a summon or a
persistent zone, it inherits the Engineer's defect with no gate to narrow it.

## What a fix has to decide

Not decided here. The axes, so the owner has them:

- **Propagate the stamp** — carry `fromUltimate` onto the minions, constructs and zones an
  ultimate creates, so THE ULTIMATE RULE covers an ultimate's *consequences* and not just
  its packets. Structural, fixes the whole class of bug at once, and is the only option
  that would also protect a class that gains a summon later. It is also the widest blast
  radius: every summoning ultimate in the game stops charging anything it currently
  charges, which may be load-bearing somewhere else.
- **Drop the rate** — cheaper, and it is what was tried last time. It moved the loop out of
  reach of the harness that existed, not out of reach of a real character.
- **Do neither and accept it** — a self-refilling ultimate is a build, and the Engineer's
  identity is constructs doing the work. This would need UAT §10 amended rather than
  quietly contradicted.

The first option is the one this document would lean toward on the general principle that a
rule which cannot be violated beats a check that notices when it was — but the size and
feel of the Engineer's meter is a balance call and it is not this document's to make.

## Reproducing

`npm test` on `fix/arm-the-trees`, `classes` section; or `PC_CLASS=engineer` against any
harness that builds through `geared()` now that it arms. Before the arming landed, no
harness in the repo could produce the failing case.
