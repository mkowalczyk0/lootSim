# The reward curve — what difficulty is worth

UAT §16 (Raid Drop Rarity), v1.

> Higher difficulty should affect: drop rarity · drop chance · number of possible drops ·
> potential item power · special variants.
>
> The hardest bosses should contain some of the most desirable equipment in the game.

---

## What was already true, and what wasn't

Three of §16's five axes already worked, scattered:

| axis | before | now |
| --- | --- | --- |
| drop rarity | `challengerRarityBias` + `mode.rarityBias`, composed in `profileFor` | unchanged, deliberately — see below |
| drop chance | `namedDropChance(base, danger)`, its own formula | the same formula, living in `rewardCurve` |
| number of possible drops | **nothing** — `quantity` was `mode.quantity * daily.quantity` | `× rewardCurve.dropCount` |
| potential item power | depth only, so a rift tier lifted it and the Challenger dial never did | `+ rewardCurve.itemPower` |
| special variants | **nothing** | `rewardCurve.variantChance` → an infused drop |

What was missing more than any individual number was **a single place that states the
promise**, so that "is hard content actually worth it" is one function to read rather than
five call sites to find. That is `src/data/rewards.ts`.

## The one input is `danger`

Not depth, and not the Challenger tier. `RunConfig.danger` is already the number every
source of difficulty compounds into — a rift tier's `dangerPerTier ^ (tier - 1)`, the
dial's `challengerMultiplier`, a sector's tier — so a curve keyed on it covers every way
content gets harder, including ways added later.

Every axis is **logarithmic in danger and capped**. Logarithmic because danger is
exponential in a rift tier by design, so anything linear would run away. Capped because
§9's caps are deliberate and this must not become a way around them.

```
 danger  chance  count  ilvl  variant
      1    1.00   1.00     0       0%
      2    1.35   1.14     1      12%
      4    1.70   1.28     2      24%
      8    2.05   1.42     3      36%
     16    2.40   1.56     3      48%
     64    2.50   1.60     3      50%   ← every axis at its cap
```

For reference, on the ladders players actually walk: Abyssal Rift tier 10 is danger ×4.1,
tier 20 is ×19.8, Challenger 10 on a Delve floor is ×25, and tier 10 with Challenger 10 is
×103 — well past every cap, which is the point of having them.

---

## Three things that are load-bearing

### 1. It is neutral at ordinary difficulty

At `danger` 1 — a plain Delve floor with the dial off — every axis is exactly 1 or 0. That
is why adding this moved **no** existing balance number: the campaign figures, the raid
boss checks and the floor economy are all measured at danger 1. `tools/rewards.ts` asserts
it at every depth, and asserts the curve never pays *less* than ordinary even if handed a
danger below 1 (nothing produces one, but a curve that inverted would be a trap for
whoever added one).

Anything that should pay out at ordinary difficulty belongs in `MODES` or `profileFor`, not
here.

### 2. Rarity is deliberately not an axis

Drop rarity stays composed in `profileFor` as
`0.06 + mode.rarityBias + challengerRarityBias(tier) + daily.rarityBias`.

`challengerRarityBias` caps out around tier 11 **by design** (§9): the Death March tiers
are about raw, uncapped danger, not about paying out more. A §16 that added a second rarity
term keyed on `danger` would have quietly routed around that cap and undone the decision.
So rarity is named as §16's first axis and left exactly where it already works —
`tools/rewards.ts` pins that a floor's `rarityBias` is still the pre-§16 composition, and
that the curve has no rarity field at all.

**The mythic wall holds too.** Nothing here can make divine or unspoken more reachable;
this file moves counts, odds, item levels and elements, never the rarity ladder's ceiling.

### 3. Difficulty you chose pays. The weather doesn't.

`profileFor` divides the Vigil's **and** the Convergence's own modifiers back out before
asking the curve.

§17 splits the daily's twists into ones that change how the floor **fights** (Ferocious,
Swarming, Hasty) and ones that change what it **pays** (Bountiful, Sparse Ground), with at
most one payer a day so the daily's reward stays predictable. Routing Ferocious through the
reward curve would have made it a second payer.

**This was caught by the Vigil's own acceptance check**, not by review: "Ferocious is a
rift tier's worth of danger, nothing else" asserts the quantity ratio is exactly 1, and it
failed the moment `quantity` learned about danger. That is the check doing precisely the job
it was written for, and the fix sharpened the concept rather than patching the test — the
curve pays for difficulty a player *opted into*. The Challenger dial on either still pays,
because you chose it.

The Convergence landed while this was in flight and uses the same idiom, so it gets the
same treatment — and the test walks its whole modifier roster rather than one example, so a
danger modifier added later is covered without anyone remembering to come back.

---

## The two new axes

### Number of possible drops

`rewardCurve.dropCount` folds into `DepthProfile.quantity` alongside the mode's own
multiplier, so **every roll site that already respected `quantity` respects this for
free** — per-kill gear, the clear cache, coins, keys, potions. Capped at 1.6, because
volume is the Avarice Rift's pitch and this shouldn't out-shout it.

### Potential item power

`rewardCurve.itemPower` adds whole item levels at the two drop sites, which now share one
private `Dungeon.rollDrop` so the axis can't apply to a monster's drop and not the clear
cache. Named drops get it too — a named item that ignored the axis would be the one piece
of loot in the game that got no stronger for the difficulty it came out of, and the
definition's own `minIlvl` still floors it from below.

**Capped hard at +3, and this is the interesting constraint:** item level feeds
`requiredLevel` (`ilvl` minus one level of grace), so every point here also raises the
level at which the drop can be *worn*. A generous version of this axis pays a Challenger
player in gear they cannot equip, which is a worse reward than a smaller number.
`tools/rewards.ts` measures the cost directly — the bonus is worth at most its own cap in
wearable levels, and nothing at ordinary difficulty.

*Noticed while writing that check:* a floor's drops used to need roughly one level more
than the floor recommended bringing, because `recommendedLevel` was `depth * 0.9` while
`requiredLevel` is `ilvl - 1`. `recommendedLevel` is now floored at `depth + itemPower - 1`
— exactly the floor's own `requiredLevel` — so the advice can always equip what the floor
pays out. The test still pins that §16's power bonus doesn't widen a drop's own
`requiredLevel` gap by more than the capped amount.

### Special variants

`rewardCurve.variantChance` is the odds a drop comes **infused** with the floor's own
element. The mechanism already existed and had simply never been wired to a drop:
`rollItem`'s `favorElement` triples one element's odds in the affix roll, which is how a
crafting essence works. A biome already infuses an increasing fraction of its *monsters*
with its element as you descend; this is the same idea reaching the loot, so a deep cold
floor starts paying out cold gear and a themed build has somewhere to farm.

It makes a **variant, not a better item**: same rarity, same affix count, same power band.
What changes is which element the roll leans toward — the thing a build cares about and the
thing the rarity ladder cannot express. Measured over 2,000 rolls of an epic ring: a cold
affix appears on 16.0% plain and 48.8% infused, and `tools/rewards.ts` asserts both that
the lean is real and that it never becomes a guarantee.

A floor whose local element is plain physical offers no variants at all — there is nothing
to infuse with, the same rule the monster infusion already follows.

---

## Where a player sees it

The §20 drop preview reads `rewardCurve` directly, so what a floor advertises and what it
rolls are the same numbers. An Abyssal Rift tier 14 preview says: *"named-item odds lifted
203% by the danger here · 141% as many drops for the danger · drops roll +2 item levels ·
35% of drops infused with the local element"*. A tier 1 rift, being ordinary danger, claims
none of it — and `tools/previews.ts` pins both halves of that.

## Files

| | |
| --- | --- |
| `src/data/rewards.ts` | the curve, the caps, and the reasoning. Pure data. |
| `src/data/depth.ts` | folds it into `DepthProfile` (`quantity`, `itemPower`, `variantChance`, `variantElement`) and divides both rotating activities' weather out. |
| `src/data/named.ts` | `namedDropChance` now reads the curve's `dropChance`. |
| `src/game/dungeon.ts` | `rollDrop`, shared by both drop sites; named drops take item power too. |
| `src/data/previews.ts` | the §20 preview reports the curve. |
| `tools/rewards.ts` | the acceptance test. |

## Not built

- **No raids.** §15's 4–20 player raid framework is a separate, larger call. §16 is the
  reward curve across the difficulty range that already exists, and every existing
  difficulty source climbs it.
- **No new rarities, and no route past the mythic wall.**
- **Variants are elemental only.** An infused drop leans toward the floor's element and
  nothing else. Other flavours of variant (an extra affix, an earlier grant or trigger)
  were considered and left alone: `augment` and `inscribe` on the Forge bench already own
  that space, and its stated invariant is that nothing an op produces is a thing a chest
  couldn't have dropped. Widening drops there wants coordinating with the Forge, not doing
  quietly from here.
