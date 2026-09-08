# Rule coverage — wiring the keystone / hybrid / Mythic `rule` strings

`ResolvedBuild.rules` is a `Set<string>` of ids a tree node, cross-path hybrid or Mythic
Archetype adds when it flips "a rule of the build" — something that is neither a stat
(`mods`) nor an ability rewrite (`mutations`) nor a tag/event effect (`grants`). There
are **284** distinct rule ids across `src/progression/*.ts`.

Before this pass, `src/game/abilities.ts` reacted to exactly two (`living_projectile`,
`blood_god`, both cosmetic). Every other rule was collected and ignored — so ~146 fully
inert nodes (no companion `mutate` / `grant` / `resourceRule` in the same node) did
literally nothing, and the Task-2 axes "Keystone impact / Mythic impact / build
differentiation" could not be measured honestly.

`src/game/rules.ts` is the engine: a per-`Hero` `HeroRuleState` plus hooks the dungeon
calls at a cast, a landed hit, a kill, a hit taken, an avoided hit, and once per tick.
No hook branches on a class id — only on the rule id, which is data. `tools/rules.ts`
(`npm run rules`, in `npm test`) proves the wired ones do something observable in a real
`Dungeon`.

## Classification

| Class | Count | Meaning | Action |
|---|--:|---|---|
| **M** | ~73 | hybrid/Mythic that also carries `mutations` — the ability already changes | the `rule` is a label / FX hook; verify the mutation reads right, no engine work |
| **G** | ~47 | node/unlock also carries `grantEffect` — already fires via `runBuildGrants` | verify the grant does what the text says |
| **R** | ~13 | node/unlock also carries `resourceRule` — already folded by `patchResourceSpec` | verify numbers |
| **E** | ~55 | inert, but fits a **shared engine seam** (primed strike, cooldown refund, threshold defence, aura, every-Nth) | one seam covers many — `src/game/rules.ts` |
| **B** | ~55 | inert, needs a **bespoke handler** (tethers, spirit-forms, walking fortresses, permanent-state ultimates) | one guarded branch each, data-selected on the rule suffix |
| **D** | ~20 | inert, but the intent *is* a passive — convertible to `mods` / `whileAbove` threshold in the class file | data change in `src/progression/<class>.ts`, zero engine code |

## Shared seams (pattern E) — in `src/game/rules.ts`

1. **Primed strike** — `HeroRuleState.primed`: the next qualifying hit gets a damage
   multiplier and/or a forced crit, then it clears. Fed by: 3-distinct-casts
   (`swordsman.moa.discipline`, `magician.archmage.grand_arcanist`,
   `duelist.tp.perfect_rhythm`, `swordsman.hybrid.blade_dance`), a block
   (`lancer.sentinel.counterpoint`), a not-recently-used song (`bard.vt.improvise`).
   Consumed in `rulesOnHit`. Move-crit (`swordsman.db.sword_dance`,
   `duelist.tp.on_the_beat`), reach-crit (`duelist.fn.elegant_violence`), windup-crit +
   interrupt (`monk.ma.empty_mind`), every-6th (`corsair.gs.six_shooter`) resolve in the
   same hook.
2. **Cooldown refund** — `AbilityRuntime.reduceCooldowns(seconds, pred)`. On kill
   (`berserker.predator.carnage_engine`, `berserker.hybrid.butchers_rhythm`,
   `swordsman.ex.final_cut`), on block (`swordsman.cb.untouchable_form`,
   `swordsman.hybrid.parry_dance`).
3. **Threshold defence** — `rulesOnDamageTaken` returns a reduced (or zeroed) amount:
   `juggernaut.ft.immovable` (cap a lethal hit at 1 while Fortify is full),
   `reaper.sw.soul_skin` (flat cut above 10 Souls), `reaper.sw.soul_fortress` (spend
   Souls to survive, gated), `duelist.bd.one_opponent` (near-immune while a mark lives).
4. **Damage aura** — `rulesTick` + `HeroRuleState.auraTimers` (0.5 s):
   `berserker.mythic.blood_god`, `monk.hybrid.furnace`, `juggernaut.it.absolute_threat`,
   `berserker.marauder.world_eater`.
5. **On-kill payout** — `rulesOnKill`: `warlock.se.devour_soul`,
   `ranger.ch.winters_predator`, `alchemist.tx.biological_collapse`,
   `reaper.sh.endless_harvest`, `corsair.th.black_market`.

## Status

**Batch 1** — the 5 shared seams (§ above): ~28 rule ids. Wired and tested (`npm run rules`).

**Batch 2** — B-1 damage-link + B-3 stance/form + two free-cast rules: **+7 rule ids**.
- **Damage-link seam** (`rulesOnHit`, `LINK_RULES`): a hit on an anchor enemy bleeds a
  fraction onto every linked enemy in range, capped at `LINK_SPREAD_CAP` (6) per hit so a
  raid pack can't turn one swing into a wipe. `shaman.wd.shared_suffering` (cursed↔cursed,
  0.30 / r220), `shaman.wd.hexmaster` (Withering ≥ 5 ↔ same, 0.50 / r320),
  `shaman.hybrid.master_hex` (3+ debuffs anchors → any debuffed enemy, 0.35 / r320). Needs
  `ctx.amount` on `rulesOnHit` — threaded from `weaponStrike` and the `dealDamage` enemy branch.
- **Stance / form**: `monk.ib.adamant_form` (`rulesTick` — grants CC immunity for
  stun/root/freeze/silence/taunt while Flow ≥ 4, clears it the moment Flow drops);
  `reaper.wr.deathless_form` (`rulesOnDamageTaken` — a downing hit is negated for 8 Souls
  and 1 s of i-frames, gated 6 s; sits beside Soul Fortress).
- **Free-cast**: `monk.cm.infinite_sequence` (a non-repeated melee skill is taken off
  cooldown at 8 Flow), `duelist.tp.perfect_rhythm` (every third distinct cast also
  refunds the cooldown, folded into the existing 3-distinct prime block).

Remaining B-1 candidates that are **not** simple links and stay in the backlog:
`corsair.cm.harpooner` (needs the Hookshot tether to exist as movement state),
`duelist.bm.thousand_cuts` / `duelist.hybrid.red_contract` (DoT-tick rewrites — need a
status-tick hook), `warlock.co.total_corruption` (status-duration → permanent + detonation
double-count), `assassin.bh.death_spiral` (really a B-2 execute flip).
Remaining B-3: `shaman.ws.avatar_of_the_hunt`, `warden.be.primal_guardian`,
`warden.hybrid.elder_form` — all gated on an Aspect/Site ability that isn't a rule.

**Batch 3** — B-2 execute-threshold keystones: **+8 rule ids** (`EXECUTE_RULES` in
`rules.ts`, resolved inside `rulesOnHit`). The sim has no instant-kill primitive
(`executeMissingHealth` only *adds* missing-health damage on abilities that carry it), so
"every shot executes the wounded" is expressed as a damage multiplier scaled up to carry
the target's remaining health through resists + mitigation (`(health+1) * 1.6`), plus a
forced crit. Each rule is `{frac, test}`: `ranger.ch.cull_the_weak` (chilled/quarried,
≤30%), `ranger.de.perfect_shot` (≤30%, the full-Deadeye gate dropped),
`reaper.ex.final_sentence` (branded, ≤40%), `assassin.bh.death_spiral` (bleed+poison+mark,
≤50%), `assassin.sb.critical_weakness` (exposed mark, ≤25%, throttled 25 s ≈ once per
encounter), `warden.hm.apex_predator` (entangled/rooted, ≤25%),
`corsair.hybrid.bounty_hunter` (bounty, ≤25%), `paladin.hybrid.holy_execution` (judged,
≤25%). Tested against a quarried low target vs a healthy one.

**Batch 4** — B-6 Mythic Archetype persistent-state: **+10 rule ids**. New
`rulesOnUltimate` hook (called from `useUltimate`) opens a per-rule window
(`MYTHIC_WINDOW`, 5–20 s) on `HeroRuleState.mythicRule` / `mythicUntil`; the other hooks
read `mythicOn(st, host, rule)`:
- **Free casts inside the window** (`rulesOnCast`): `monk.mythic.infinite_motion` (melee),
  `warden.mythic.the_wildwood` (nature).
- **Execute floor** (`rulesOnHit`): `reaper.mythic.the_final_harvest` (≤50%),
  `assassin.mythic.the_perfect_contract` (marked, ≤35%) — share the B-2 `inflateToKill`.
- **Cannot die** (`rulesOnDamageTaken`): `juggernaut.mythic.the_keep`,
  `paladin.mythic.saint_of_the_last_stand`.
- **Window upkeep**: `infinite_motion` re-armed by any landed hit; `the_final_harvest`
  and `the_perfect_contract` extended on kill (+ a Soul / a re-lock); `stormlord`
  re-armed while moving (`rulesTick`).
- **Standing auras** (`rulesTick`, `fromUltimate: true` so they can't refill the meter):
  `the_keep`, `stormcaller.mythic.stormlord`, `magician.mythic.singularity`,
  `alchemist.mythic.the_reaction` (cycling element), `shaman.mythic.hollow_king`.

`berserker.mythic.blood_god` was already wired (health-gated aura, batch 1).

**Mutation-only Mythics — no engine work, verified against their `mutations`:**
`lancer.mythic.comet_vanguard`, `swordsman.mythic.sword_saint`,
`ranger.mythic.winters_quarry`, `duelist.mythic.the_last_word`, `bard.mythic.the_symphony`
— each ships a `mutate` that already does the mechanical change; the `rule` string is a
label. **Deferred to B-4** (need the summon layer): `corsair.mythic.dread_admiral`,
`engineer.mythic.the_foundry`, `trickster.mythic.reality_killer`,
`necromancer.mythic.soul_legion`, `warlock.mythic.the_reckoning` (mass-Doom detonation).

## Backlog (ordered)

- **B-4 construct/summon keystones** — `engineer.*` (5 keystones + 6 hybrids),
  `necromancer.*` keystones, `ranger.bm.alpha_companion`, `corsair.pk.ghost_crew`, plus
  the 5 summon/detonation Mythics above.
- **B-5 zone keystones** — `alchemist.py.conflagration`, `warden.tk.briarheart`,
  `warden.vd.worldroot`, `shaman.rt.great_ritual`, `stormcaller.eye.*`.
- **B-1 remainder** — `warlock.co.total_corruption` (status → permanent), the two Duelist
  bleed-tick rewrites, `corsair.cm.harpooner` (after Hookshot tether lands in B-4).
- **B-3 remainder** — `avatar_of_the_hunt`, `primal_guardian`, `elder_form` (form abilities).
- **B-4 construct/summon keystones** — `engineer.*` (5 keystones + 6 hybrids),
  `necromancer.*` keystones, `ranger.bm.alpha_companion`, `corsair.pk.ghost_crew`.
- **B-5 zone keystones** — `alchemist.py.conflagration`, `warden.tk.briarheart`,
  `warden.vd.worldroot`, `shaman.rt.great_ritual`, `stormcaller.eye.*`.
- **B-6 Mythic persistent-state** — all 21 archetypes' "stops being a cooldown, becomes
  a state" clause. Each: extend the ultimate's mutation with `follows`/`duration`, then a
  rule in `rulesTick` that re-arms it while its condition holds.
- **D** — the ~20 "pure passive" rules turned out to be mostly *conditional* passives
  (low-health flips, stand-still ramps, in-zone bonuses) rather than flat `mods`, so
  folding them in blind would move the arena numbers under the Part 3 tuning pass (and
  under the concurrent XP-curve / deep-difficulty work on `uat/combat-content`). Do the
  genuine flat conversions **as part of Part 3**, per cluster, with a measured before/after.
- **M/G/R verification sweep** — confirm the ~133 companion-backed rules read right.

## Full appendix — every rule id, its companion effects, its text

`companions:[none]` = fully inert before this pass. `[+Nmutations]` = the unlock also
rewrites N abilities.

### Lancer
- `lancer.dragoon.sky_lancer` [keystone] companions:[none] — Movement chains into an empowered follow-up.
- `lancer.impaler.transfixion` [keystone] companions:[mutate] — (no note)
- `lancer.sentinel.counterpoint` [behavior] companions:[none] — A blocked attack empowers the next thrust.
- `lancer.sentinel.impalement_wall` [keystone] companions:[none] — (no note)
- `lancer.momentum.stored_violence` [resource] companions:[resourceRule] — (no note)
- `lancer.momentum.living_projectile` [keystone] companions:[mutate] — (no note)
- `lancer.vanguard.mark_the_breach` [behavior] companions:[grantEffect] — (no note)
- `lancer.vanguard.banner_of_advance` [keystone] companions:[none] — (no note)
- `lancer.hybrid.breakthrough` [hybrid] companions:[grantEffect,+1mutations] — A completed charge tears a breach: enemies in the lane are exposed and allies who follow through are hasted.
- `lancer.hybrid.thunder_lance` [hybrid] companions:[+1mutations] — A committed charge stops for nothing — it pierces an entire rank and keeps its full damage the whole way.
- `lancer.hybrid.phalanx_spear` [hybrid] companions:[grantEffect] — While braced, the spear reaches out on its own and impales anything that closes the distance.
- `lancer.hybrid.countercharge` [hybrid] companions:[grantEffect,+1mutations] — Stored Momentum doesn't just empower the next skill — being struck releases it as an instant counter-charge.
- `lancer.hybrid.breach_master` [hybrid] companions:[grantEffect] — Pierced enemies leave a Breach Line: a lane of amplified damage the whole raid can shoot down.
- `lancer.hybrid.comet` [hybrid] companions:[+1mutations] — At high Momentum the next thrust is carried across the room as a projectile instead of a swing.
- `lancer.mythic.comet_vanguard` [mythic] companions:[+1mutations] — Meteor Lance pierces an entire formation and leaves a burning, damage-amplifying trail the raid can push into.

### Berserker
- `berserker.bloodletter.crimson_avalanche` [keystone] companions:[grantEffect] — (no note)
- `berserker.lastbreath.danger_zone` [behavior] companions:[none] — Low-health threshold flips a mobility/mitigation rule.
- `berserker.lastbreath.deathwish` [keystone] companions:[mutate] — (no note)
- `berserker.marauder.overkill` [resource] companions:[resourceRule] — (no note)
- `berserker.marauder.world_eater` [keystone] companions:[grantEffect] — (no note)
- `berserker.inferno.living_furnace` [keystone] companions:[resourceRule] — (no note)
- `berserker.predator.kill_rhythm` [resource] companions:[resourceRule] — (no note)
- `berserker.predator.carnage_engine` [keystone] companions:[none] — (no note)
- `berserker.hybrid.blood_frenzy` [hybrid] companions:[resourceRule] — Bleed stacks and missing health multiply each other's Rage generation instead of just adding.
- `berserker.hybrid.hemorrhage` [hybrid] companions:[grantEffect] — An enemy that is both burning and bleeding when it dies explodes, spreading both to everything nearby.
- `berserker.hybrid.deathblow` [hybrid] companions:[+1mutations] — Below a third health, heavy attacks consume a chunk of your remaining health for catastrophic damage.
- `berserker.hybrid.butchers_rhythm` [hybrid] companions:[mutate] — Kills refund heavy-attack cooldowns directly, not just the last-used skill.
- `berserker.hybrid.wildfire` [hybrid] companions:[grantEffect] — A burning kill escalates Inferno Rush: each one in a row makes the next fire zone bigger and hotter.
- `berserker.hybrid.rupture` [hybrid] companions:[+1mutations] — Heavy attacks consume every Bleed stack on the target for an immediate physical detonation.
- `berserker.mythic.blood_god` [mythic] companions:[+1mutations] — Worldbreaker's finale never ends: while you are below half health it becomes a standing aura that bleeds, burns and re-detonates everything around you, fed by your own missing health.

### Swordsman
- `swordsman.moa.discipline` [behavior] companions:[none] — Casting three distinct skills in a row opens a free empowered strike.
- `swordsman.moa.grandmaster` [keystone] companions:[grantEffect] — (no note)
- `swordsman.db.sword_dance` [keystone] companions:[none] — Attacking within a beat of moving is always a critical.
- `swordsman.cb.untouchable_form` [keystone] companions:[none] — A perfectly-timed block grants a second of full immunity and a free Masterstroke.
- `swordsman.ex.final_cut` [keystone] companions:[none] — Killing a marked or exposed target refunds Masterstroke and Swordflash.
- `swordsman.sb.battle_caster` [keystone] companions:[none] — Your sword attacks copy the element and rider of the last skill you cast.
- `swordsman.hybrid.blade_dance` [hybrid] companions:[+1mutations] — Three different moving attacks in a beat open a free, guaranteed-crit finisher.
- `swordsman.hybrid.duel_to_the_death` [hybrid] companions:[grantEffect] — A perfect counter permanently exposes an elite's weak point for the rest of the fight.
- `swordsman.hybrid.arcane_mastery` [hybrid] companions:[+1mutations] — Sword attacks inherit the properties of the last spell-tagged skill you cast, not just its element.
- `swordsman.hybrid.passing_judgment` [hybrid] companions:[grantEffect] — Executing a target with any skill resets Swordflash and refunds its Technique.
- `swordsman.hybrid.parry_dance` [hybrid] companions:[grantEffect] — A successful guard grants a movement charge — a dash you didn't have to earn.
- `swordsman.hybrid.spellblade_execution` [hybrid] companions:[+1mutations] — Masterstroke detonates every active elemental status on the target for a burst.
- `swordsman.mythic.sword_saint` [mythic] companions:[+1mutations] — Sword Eclipse gains a true finisher: after the ring of cuts, one perfect strike lands on every enemy still standing, always a critical, refunding a third of the Technique it cost.

### Magician
- `magician.archmage.grand_arcanist` [keystone] companions:[grantEffect] — Three different spells in a row unlock a free enhanced fourth.
- `magician.elementalist.prismatic_mastery` [keystone] companions:[grantEffect] — (no note)
- `magician.tyrant.arcane_overload` [keystone] companions:[mutate] — (no note)
- `magician.bender.recorded_position` [behavior] companions:[none] — Teleports leave a temporal anchor for a few seconds.
- `magician.bender.paradox` [keystone] companions:[mutate] — (no note)
- `magician.glass.adrenaline` [behavior] companions:[none] — Low health flips a cast-speed / regen rule.
- `magician.glass.mortal_genius` [keystone] companions:[resourceRule] — High Mana + low health massively amplifies spell damage.
- `magician.hybrid.prismatic_cascade` [hybrid] companions:[grantEffect] — Casting three different elements in quick succession triggers a fourth, hybrid detonation for free.
- `magician.hybrid.overcast` [hybrid] companions:[resourceRule] — Overcharge thresholds also govern how much health a spell will spend and how hard it hits.
- `magician.hybrid.elemental_rift` [hybrid] companions:[+1mutations] — Gravity Well inherits the element of the last spell you cast, dragging enemies into a themed pit.
- `magician.hybrid.forbidden_spell` [hybrid] companions:[+1mutations] — With the bar empty, your biggest spells cast off health for a huge power spike instead of failing.
- `magician.hybrid.schrodinger` [hybrid] companions:[grantEffect] — Teleporting through an enemy leaves you briefly intangible — untouchable, but unable to be healed.
- `magician.hybrid.spell_echo` [hybrid] companions:[+1mutations] — Spells can originate from a position you occupied moments ago, hitting from two angles at once.
- `magician.mythic.singularity` [mythic] companions:[+1mutations] — Astral Collapse ends by folding its impact site into a lasting singularity: a gravity well that drags, crushes, and cycles through every element while it stands.

### Shaman
- `shaman.sc.spirit_council` [keystone] companions:[none] — Three or more spirits merge into one elder spirit twice their combined strength.
- `shaman.pd.walking_plague` [keystone] companions:[none] — A diseased death leaves a lasting infection zone instead of a corpse.
- `shaman.rt.great_ritual` [keystone] companions:[none] — Once a ritual zone is down, every Shaman skill triggers a burst from it on use.
- `shaman.wd.shared_suffering` [behavior] companions:[none] — Curse damage on one cursed enemy bleeds a fraction onto every other cursed enemy nearby.
- `shaman.wd.hexmaster` [keystone] companions:[none] — Enemies at max Withering are linked: any of them taking a hit spreads it to all.
- `shaman.ws.avatar_of_the_hunt` [keystone] companions:[none] — Standing in a Spirit Site enables a temporary spirit-beast combat form.
- `shaman.hybrid.rot_spirits` [hybrid] companions:[grantEffect] — A diseased kill releases a hostile spirit that spreads blight as it moves.
- `shaman.hybrid.spirit_convergence` [hybrid] companions:[+1mutations] — Spirit sites and zones placed near each other merge into one stronger zone.
- `shaman.hybrid.master_hex` [hybrid] companions:[none] — Three separate debuffs on one enemy link every debuffed enemy in the room.
- `shaman.hybrid.battle_rite` [hybrid] companions:[+2mutations] — A completed ritual empowers your melee attacks and the ritual zone follows you.
- `shaman.hybrid.hexbeast` [hybrid] companions:[grantEffect] — Cursed enemies count as prey — killing one in spirit-form heals and extends the form.
- `shaman.hybrid.spirit_avatar` [hybrid] companions:[none] — Every active spirit adds power and duration to the Wild Shaman's beast form.
- `shaman.mythic.hollow_king` [mythic] companions:[+1mutations] — Spirit World stops being a cooldown. Within the arena the spirit realm stays open: every zone you own is permanently doubled, and blighted deaths raise spirits that answer only to you.

### Ranger
- `ranger.de.perfect_shot` [keystone] companions:[none] — A shot fired from full Deadeye stacks always crits and executes below 30%.
- `ranger.tr.tripwire` [behavior] companions:[none] — Traps arm instantly and can overlap.
- `ranger.tr.killing_ground` [keystone] companions:[none] — An enemy that triggers a trap while standing on another triggers both, and re-arms the first.
- `ranger.bm.alpha_companion` [keystone] companions:[none] — The companion becomes permanent and gains a leap-strike of its own.
- `ranger.sk.rolling_fire` [behavior] companions:[none] — No accuracy penalty while moving; a dash reloads instantly.
- `ranger.sk.run_and_gun` [keystone] companions:[none] — Predator's Trail follows you, and moving along your own trail refunds Prep.
- `ranger.ch.cull_the_weak` [behavior] companions:[none] — Chilled and quarried enemies take execute damage from every shot.
- `ranger.ch.winters_predator` [keystone] companions:[none] — Killing a frozen quarry drops a frost nova that quarries everything it chills.
- `ranger.hybrid.perfect_ambush` [hybrid] companions:[+1mutations] — A shot fired from stealth or Deadeye that hits a trapped enemy always executes.
- `ranger.hybrid.hunting_party` [hybrid] companions:[none] — Your traps also arm your companion — it drags trapped enemies back onto the field.
- `ranger.hybrid.run_and_aim` [hybrid] companions:[+1mutations] — Deadeye no longer roots you — you keep its bonuses at a walk.
- `ranger.hybrid.frozen_ground` [hybrid] companions:[+1mutations] — Trap zones freeze over — enemies inside are chilled, and a trigger shatters them.
- `ranger.hybrid.pack_hunter` [hybrid] companions:[grantEffect] — Dashing past an enemy sics the companion on it and refunds a Prep charge.
- `ranger.hybrid.winter_execution` [hybrid] companions:[+1mutations] — A held Deadeye shot on a frozen target is a guaranteed one-shot on anything but an elite.
- `ranger.mythic.winters_quarry` [mythic] companions:[+1mutations] — The Last Hunt opens with a freezing pulse: every quarry is frozen solid before the volley, and each shot that lands on a frozen target chains a shattering nova to the next quarry over.

### Juggernaut
- `juggernaut.ft.set_stance` [behavior] companions:[none] — Standing still one second grants a stacking damage floor.
- `juggernaut.ft.immovable` [keystone] companions:[none] — At full Fortify you cannot be moved, stunned, or dropped below 1 HP by a single hit.
- `juggernaut.dm.living_catapult` [keystone] companions:[none] — Fortify spent on an attack converts one-for-one into bonus heavy damage.
- `juggernaut.se.bodyblock` [behavior] companions:[none] — Projectiles that would pass through you to hit an ally stop on you instead.
- `juggernaut.se.guardian_wall` [keystone] companions:[none] — Bastion Stance projects a wall of cover behind you that allies shelter in.
- `juggernaut.it.absolute_threat` [keystone] companions:[none] — Enemies that attack anyone but you while you are alive take heavy retaliation.
- `juggernaut.rm.gather_speed` [behavior] companions:[none] — Moving in one direction ramps move speed and mitigation together.
- `juggernaut.rm.avalanche` [keystone] companions:[none] — Iron March gains no top speed cap and knocks down everything it touches.
- `juggernaut.hybrid.bastion` [hybrid] companions:[+1mutations] — Bastion Stance and Anchor Rune share one footprint — a zone that mitigates and can't be displaced.
- `juggernaut.hybrid.siege_mode` [hybrid] companions:[none] — While Fortify is high, heavy attacks spend it for a second hit that ignores armor entirely.
- `juggernaut.hybrid.champions_challenge` [hybrid] companions:[+1mutations] — Fortress Call can name a single elite: you eat 80% of its damage and deal double back.
- `juggernaut.hybrid.rockslide` [hybrid] companions:[+1mutations] — Iron March leaves a trail of rubble that keeps damaging and slowing enemies who follow.
- `juggernaut.hybrid.unbreakable_line` [hybrid] companions:[none] — Enemies you have taunted deal a fraction less to everyone, not just to you.
- `juggernaut.hybrid.mobile_bulwark` [hybrid] companions:[+1mutations] — The Sentinel's wall of cover follows you as you move.
- `juggernaut.mythic.the_keep` [mythic] companions:[+1mutations] — Citadel walks. The fortress follows you at a slow drift, its walls reflect a share of everything they stop back at the attacker, and allies inside it cannot fall below 1 HP while you hold Fortify.

### Duelist
- `duelist.rp.perfect_counter` [keystone] companions:[none] — A counter fired in the first half-second of the window costs nothing and refunds Riposte.
- `duelist.fn.elegant_violence` [keystone] companions:[none] — Attacking from outside an enemy's reach always crits and never generates threat.
- `duelist.bd.grudge` [behavior] companions:[none] — Damage to your current target ramps the longer you stay on it.
- `duelist.bd.one_opponent` [keystone] companions:[none] — While a Final Lesson target lives you take almost nothing from anyone else.
- `duelist.bm.thousand_cuts` [keystone] companions:[none] — Bleeds on an enemy at 5+ stacks tick for the whole stack at once.
- `duelist.tp.on_the_beat` [behavior] companions:[none] — Alternating between two different skills empowers both.
- `duelist.tp.perfect_rhythm` [keystone] companions:[none] — Never repeat a skill and Precision cannot decay; every third distinct skill is free.
- `duelist.hybrid.perfect_distance` [hybrid] companions:[none] — A counter fired from outside the attacker's reach costs no cooldown.
- `duelist.hybrid.duelists_law` [hybrid] companions:[+1mutations] — Countering your Final Lesson target permanently exposes its weak point for the fight.
- `duelist.hybrid.flowing_steel` [hybrid] companions:[none] — Dashing resets the cooldown of the last non-movement skill you used.
- `duelist.hybrid.red_contract` [hybrid] companions:[none] — Your duel target's bleeds cannot expire while it stays your current target.
- `duelist.hybrid.thousand_cuts` [hybrid] companions:[+1mutations] — Every counter also applies two bleed stacks to the attacker.
- `duelist.hybrid.counter_rhythm` [hybrid] companions:[grantEffect] — Landing a counter counts as a distinct skill for Tempo — a counter every beat keeps the rhythm alive.
- `duelist.mythic.the_last_word` [mythic] companions:[+1mutations] — Perfect Riposte's slowed time no longer just counters — every attack read during it is answered with a full execute, and each counter shaves a real slice off the ultimate's own cooldown.

### Warlock
- `warlock.co.total_corruption` [keystone] companions:[none] — A hex at 3 stacks becomes permanent, and permanent hexes count double for detonations.
- `warlock.se.devour_soul` [keystone] companions:[none] — Killing a cursed enemy refunds a full skill's worth of Mana and heals for the overkill.
- `warlock.pm.willing` [behavior] companions:[none] — Health spent on a pact is added to your spell damage for the fight.
- `warlock.pm.forbidden_pact` [keystone] companions:[none] — At low health every spell can pay its cost in health for triple effect.
- `warlock.rw.between_worlds` [keystone] companions:[none] — Teleporting leaves a void rift where you were that pulls and hexes enemies into it.
- `warlock.ds.inevitable_end` [keystone] companions:[none] — A Doom that expires on its own detonates for its whole accumulated damage and spreads.
- `warlock.hybrid.devouring_curse` [hybrid] companions:[grantEffect] — A curse ticking on a low-health enemy consumes it, converting the kill straight into Mana and Soul Debt.
- `warlock.hybrid.blood_corruption` [hybrid] companions:[+1mutations] — Health spent on a pact is distributed as hex stacks across every visible enemy.
- `warlock.hybrid.soul_gate` [hybrid] companions:[none] — Draining a tethered target opens a gate you can step through to its position.
- `warlock.hybrid.inevitable_ruin` [hybrid] companions:[+1mutations] — Detonating a curse also advances every Doom in the area toward its expiry.
- `warlock.hybrid.final_payment` [hybrid] companions:[none] — When a Doom expires you may pay its remaining timer in health to double its detonation.
- `warlock.hybrid.void_bargain` [hybrid] companions:[grantEffect] — Teleporting costs health instead of a cooldown, and each blink banks Soul Debt.
- `warlock.mythic.the_reckoning` [mythic] companions:[+1mutations] — Damnation's brand becomes a shared Doom: while it runs, every hex and curse in the room advances toward a single expiry, and when the timer ends every branded enemy detonates for the total debt they had accrued.

### Monk
- `monk.cm.infinite_sequence` [keystone] companions:[none] — At 8 Flow, melee skills cost no cooldown as long as you never repeat one.
- `monk.ib.roll_with_it` [behavior] companions:[none] — Spending Chi converts a fraction of the next hit into Flow instead of damage.
- `monk.ib.adamant_form` [keystone] companions:[none] — While Flow is above half, crowd control cannot land on you.
- `monk.fl.water_step` [keystone] companions:[none] — Every dash leaves an afterimage that repeats your last strike.
- `monk.if.dragon_breath` [keystone] companions:[none] — Seven-Point Combo's finisher exhales a cone of fire scaled by Flow.
- `monk.ma.empty_mind` [keystone] companions:[none] — A strike landed in the first 0.2s of an enemy's wind-up always crits and interrupts.
- `monk.hybrid.endless_chain` [hybrid] companions:[grantEffect] — A dash counts as a distinct strike for the combo, so movement never drops your Flow.
- `monk.hybrid.dragon_combo` [hybrid] companions:[+1mutations] — Each strike in a chain adds a stack of burn; the seventh detonates all of them.
- `monk.hybrid.counter_body` [hybrid] companions:[grantEffect] — Any hit that gets through your Iron Body mitigation triggers an automatic Palm Strike back.
- `monk.hybrid.ghost_fist` [hybrid] companions:[+1mutations] — Afterimages left by Water Step also mimic your counters.
- `monk.hybrid.furnace` [hybrid] companions:[none] — While Iron Body's Flow floor holds, you radiate a ring of fire that scales with Chi.
- `monk.hybrid.unbreakable_rhythm` [hybrid] companions:[none] — Taking a hit no longer drops your combo — only missing a beat does.
- `monk.mythic.infinite_motion` [mythic] companions:[+1mutations] — Heavenly Fist stops ending your combo. On landing, Flow is capped and locked for a few seconds, every melee skill is free, and dashing through an enemy refreshes the lock — a window where the Monk simply does not stop.

### Necromancer
- `necromancer.legion.endless_legion` [keystone] companions:[grantEffect] — (no note)
- `necromancer.deathknight.champion_of_death` [keystone] companions:[none] — (no note)
- `necromancer.architect.grave_industry` [keystone] companions:[grantEffect] — (no note)
- `necromancer.bonelord.ossuary` [keystone] companions:[none] — (no note)
- `necromancer.tyrant.soulstorm` [keystone] companions:[resourceRule] — (no note)
- `necromancer.hybrid.meat_grinder` [hybrid] companions:[grantEffect] — Skeletons that die feed the corpse pile directly, so the legion is self-sustaining as long as it is fighting.
- `necromancer.hybrid.lich_bond` [hybrid] companions:[resourceRule] — Bind one champion undead to your Souls: while it lives, your spell power and its power rise together.
- `necromancer.hybrid.bone_forge` [hybrid] companions:[+1mutations] — Ossuary Wall segments emit bone turrets; Bone Structure turrets can be walked into a wall.
- `necromancer.hybrid.soul_general` [hybrid] companions:[+1mutations] — Command: Ravage spends Souls to make the whole legion critically strike for its duration.
- `necromancer.hybrid.death_knights_harvest` [hybrid] companions:[grantEffect] — Your champion undead reap corpses as they kill, handing them straight back to you.
- `necromancer.hybrid.ossuary_storm` [hybrid] companions:[grantEffect] — At full Souls your bone constructs orbit you in a shredding cyclone instead of standing still.
- `necromancer.mythic.soul_legion` [mythic] companions:[+1mutations] — Kingdom of Bones stops being one choice: every death now becomes either army strength or direct Soul ammunition, and you decide in the moment which — the raise can be fired outward as a barrage of soul-shot.

### Corsair
- `corsair.bc.deck_master` [keystone] companions:[none] — Every hook you land reduces your melee cooldowns and refreshes Boarding Cut.
- `corsair.gs.six_shooter` [keystone] companions:[none] — Every sixth pistol shot is a free empowered round that always crits and reloads instantly.
- `corsair.cm.harpooner` [keystone] companions:[none] — Hooked enemies are tethered to each other — pulling one pulls all of them.
- `corsair.pk.ghost_crew` [keystone] companions:[none] — Your first two deckhands are permanent and revive on any of your kills.
- `corsair.th.black_market` [keystone] companions:[none] — Bounty payouts stack a permanent damage and coin bonus for the run.
- `corsair.hybrid.boarding_hook` [hybrid] companions:[+1mutations] — Hookshot chains straight into a free Boarding Cut on arrival.
- `corsair.hybrid.harpoon_gun` [hybrid] companions:[+1mutations] — Ricochet Shot hooks the first enemy it hits and reels it toward you.
- `corsair.hybrid.mutiny` [hybrid] companions:[grantEffect] — A Plundered elite that dies fights for you as a ghost until the wave ends.
- `corsair.hybrid.plunder_crew` [hybrid] companions:[none] — Each active crew member adds a percentage to your Bounty payouts.
- `corsair.hybrid.golden_bullet` [hybrid] companions:[none] — Your Six Shooter round is a Plunder tag — free, and it always pays out.
- `corsair.hybrid.bounty_hunter` [hybrid] companions:[+1mutations] — Hooked enemies count as Bounty targets — you deal execute damage to anything on a line.
- `corsair.mythic.dread_admiral` [mythic] companions:[+1mutations] — Broadside becomes a fleet action: the ghost crew mans the cannons, firing a second and third volley on their own, and every enemy the barrage kills is pressed into the crew for the rest of the run.

### Trickster
- `trickster.il.many_faces` [keystone] companions:[none] — Every dash leaves a decoy; up to three stand at once.
- `trickster.as.from_behind` [behavior] companions:[none] — Attacking a Misdirected enemy always hits its back.
- `trickster.as.death_from_nowhere` [keystone] companions:[none] — A strike from stealth or straight after a teleport is a guaranteed crit and refunds Backstab.
- `trickster.ga.press_your_luck` [behavior] companions:[none] — Chaos Step and Double Down roll a stronger outcome the higher your Deception.
- `trickster.ga.double_or_nothing` [keystone] companions:[none] — Landing a Double Down hit refunds every cooldown; missing locks skills for two seconds.
- `trickster.ph.untouchable` [keystone] companions:[none] — The first hit to reach you every few seconds is dodged automatically and swapped onto a decoy.
- `trickster.ch.reality_thief` [keystone] companions:[none] — Every teleport briefly swaps the last enemy that hit you into the spot you left.
- `trickster.hybrid.false_assassin` [hybrid] companions:[none] — Your decoys can perform Backstab — striking whatever they were watching when you cast it.
- `trickster.hybrid.hall_of_doors` [hybrid] companions:[none] — Each decoy is a teleport anchor — Sleight of Hand and Chaos Step can jump to any of them.
- `trickster.hybrid.loaded_contract` [hybrid] companions:[+1mutations] — A Double Down that lands as a Backstab cannot miss and cannot fail — the gamble is rigged.
- `trickster.hybrid.impossible_movement` [hybrid] companions:[grantEffect] — Dodging triggers a free short teleport in the direction you were already moving.
- `trickster.hybrid.ghost_killer` [hybrid] companions:[none] — Backstab from stealth doesn't break stealth — you can chain it until Deception runs out.
- `trickster.hybrid.everything_is_a_gamble` [hybrid] companions:[none] — Every skill gets a small chance to fire twice for free — and a small chance to swap you with a random enemy.
- `trickster.mythic.reality_killer` [mythic] companions:[+1mutations] — Assassination stops needing the Trickster. While Hall of Mirrors runs, every copy can perform Backstab and Chaos Step, and a kill by any of them resets all six — for a few seconds the fight is being attacked from six directions by things that might all be real.

### Reaper
- `reaper.sh.endless_harvest` [keystone] companions:[none] — A branded death brands the two nearest enemies, chaining the harvest through a pack.
- `reaper.ex.final_sentence` [keystone] companions:[none] — Execute effects fire at 40% health instead of 20%, and an executed elite still drops a Soul.
- `reaper.wr.deathless_form` [keystone] companions:[none] — A hit that would down you instead spends 8 Souls and phases you out for a second.
- `reaper.sl.world_reaper` [keystone] companions:[none] — Your scythe attacks leave a lingering blade-plane that keeps cutting for a second.
- `reaper.sw.soul_skin` [behavior] companions:[none] — Above 10 Souls, incoming damage is reduced by a flat fraction.
- `reaper.sw.soul_fortress` [keystone] companions:[none] — Souls are spent automatically to prevent a fatal hit, once per few seconds.
- `reaper.hybrid.harvest_of_the_guilty` [hybrid] companions:[grantEffect] — An execute on a branded target pays out three Souls instead of one.
- `reaper.hybrid.soul_step` [hybrid] companions:[none] — Wraith Dash can be aimed at a Soul on the ground — you blink to it and collect it.
- `reaper.hybrid.grand_reaping` [hybrid] companions:[+1mutations] — Executioner's Step becomes an area execute — it hits every low-health enemy near the target.
- `reaper.hybrid.soulform` [hybrid] companions:[none] — Deathless Form's phase-out leaves a scythe-wraith that keeps fighting while you are gone.
- `reaper.hybrid.reaping_storm` [hybrid] companions:[+1mutations] — Full Circle's blade-plane follows you, so moving through a pack keeps cutting all of them.
- `reaper.hybrid.deaths_protection` [hybrid] companions:[grantEffect] — Each execute you land shields the lowest-health ally for a slice of the damage dealt.
- `reaper.mythic.the_final_harvest` [mythic] companions:[+1mutations] — Death Comes Due stops being a moment and becomes a state. Its freeze threshold rises with every enemy it takes, each kill pays a Soul, and while it runs the Reaper's basic scythe swing executes anything under half health outright.

### Stormcaller
- `stormcaller.thundergod.chain_reaction` [keystone] companions:[grantEffect] — (no note)
- `stormcaller.tempest.front_line` [behavior] companions:[none] — Shifting weather leaves a burst of the phase you left.
- `stormcaller.tempest.endless_storm` [keystone] companions:[grantEffect] — (no note)
- `stormcaller.stormblade.cyclone_warrior` [keystone] companions:[none] — (no note)
- `stormcaller.windrunner.living_wind` [keystone] companions:[resourceRule] — (no note)
- `stormcaller.eye.outer_bands` [behavior] companions:[none] — Attacks made outside your own eye zone are empowered.
- `stormcaller.eye.eye_of_eternity` [keystone] companions:[grantEffect] — (no note)
- `stormcaller.hybrid.supercell` [hybrid] companions:[resourceRule] — Thunder phase doesn't just buff lightning — while it holds, every lightning hit builds toward a free Tempest Chain.
- `stormcaller.hybrid.stormfront` [hybrid] companions:[grantEffect] — Moving during a weather shift carries the old phase's effect along your path as a lingering trail.
- `stormcaller.hybrid.cyclonic_step` [hybrid] companions:[+1mutations] — Chakrams orbit you as you move and fling off toward enemies you dash past.
- `stormcaller.hybrid.thunder_disc` [hybrid] companions:[+1mutations] — Chakrams carry Static and chain lightning between every body they pass through.
- `stormcaller.hybrid.perfect_storm` [hybrid] companions:[grantEffect] — Your eye zone counts as its own weather: everything inside it benefits from all three phases at reduced strength.
- `stormcaller.hybrid.calm_before` [hybrid] companions:[grantEffect] — Leaving your eye zone releases the calm you stored as a burst of speed and a shockwave.
- `stormcaller.mythic.stormlord` [mythic] companions:[+1mutations] — Eye of the Tempest stops being a cooldown: it becomes a standing state while you keep moving, running Rain, Wind and Thunder through the storm wall at once and never dropping the eye.

### Paladin
- `paladin.guardian.interpose` [behavior] companions:[none] — A redirected hit that would have downed the ward is halved again.
- `paladin.guardian.bodyguard` [keystone] companions:[mutate] — (no note)
- `paladin.crusader.zeal` [keystone] companions:[resourceRule] — (no note)
- `paladin.sanctifier.sanctuary` [keystone] companions:[grantEffect] — (no note)
- `paladin.martyr.take_the_blow` [behavior] companions:[none] — Redirected damage below a threshold is fully negated.
- `paladin.martyr.saints_burden` [keystone] companions:[none] — (no note)
- `paladin.vindicator.holy_war` [keystone] companions:[grantEffect] — (no note)
- `paladin.hybrid.martyrdom` [hybrid] companions:[grantEffect] — Damage redirected onto you by Guardian's Oath heals the ward for the same amount instead of just sparing them.
- `paladin.hybrid.moving_sanctuary` [hybrid] companions:[+1mutations] — Consecrated Ground follows you, so the safe circle is wherever you choose to stand.
- `paladin.hybrid.holy_execution` [hybrid] companions:[+1mutations] — A Judged enemy that drops low enough is struck down instantly by Radiant Strike.
- `paladin.hybrid.last_mercy` [hybrid] companions:[grantEffect] — When Martyr's Grace drops you low, Consecrated Ground erupts under you as an emergency heal.
- `paladin.hybrid.retributive_oath` [hybrid] companions:[grantEffect] — While Guardian's Oath is active, damage redirected to you is thrown straight back at whoever dealt it.
- `paladin.hybrid.zealous_martyr` [hybrid] companions:[resourceRule] — Spending Conviction on a sacrifice refunds a burst of it if the heal saves an ally from a killing blow.
- `paladin.mythic.saint_of_the_last_stand` [mythic] companions:[+1mutations] — Healing zones grow stronger from every point of damage you absorb, and while your Conviction holds, allies under Last Light simply cannot die — the ultimate stops being a window and becomes a state.

### Bard
- `bard.wd.battle_tempo` [keystone] companions:[none] — Every buffed ally's attacks feed your Rhythm; at max Rhythm the whole party's damage is amplified.
- `bard.mn.healing_chorus` [keystone] companions:[none] — Inspired allies are healed for a fraction of all damage they deal.
- `bard.ma.counterpoint` [behavior] companions:[none] — Each distinct song running adds a stack of its own effect to the others.
- `bard.ma.grand_crescendo` [keystone] companions:[none] — At max Rhythm every song is permanently at Crescendo strength.
- `bard.ds.silence_the_world` [keystone] companions:[none] — Enemies at max Discord are permanently silenced and take amplified damage from your party.
- `bard.vt.improvise` [behavior] companions:[none] — Casting a song you have not used recently grants you a personal burst buff.
- `bard.vt.bravura` [keystone] companions:[none] — Your own attacks scale with your total Inspired stacks handed out this fight.
- `bard.hybrid.battle_crescendo` [hybrid] companions:[+1mutations] — A Crescendo'd War March or Battle Hymn grants its buff at maximum stacks instantly.
- `bard.hybrid.healing_symphony` [hybrid] companions:[none] — Every song running also ticks a small heal to the party.
- `bard.hybrid.war_noise` [hybrid] companions:[+1mutations] — Dissonance also grants your allies inside it a damage buff — the same wrong note helps and hurts.
- `bard.hybrid.soloist` [hybrid] companions:[none] — While no ally is in range, all of your buff power is redirected to yourself at double value.
- `bard.hybrid.reprise` [hybrid] companions:[none] — Encore can replay the Grand Performance's last completed movement.
- `bard.hybrid.dirge` [hybrid] companions:[+1mutations] — Dirge of Silence also heals allies standing in it, as much as it suppresses enemies.
- `bard.mythic.the_symphony` [mythic] companions:[+1mutations] — Grand Performance gains a fourth movement. On the burst window, every ally's cooldowns reset and their next skill costs nothing — for a few seconds the whole party plays twice.

### Alchemist
- `alchemist.py.conflagration` [keystone] companions:[none] — Any fire zone touching another instantly merges and detonates the overlap.
- `alchemist.tx.biological_collapse` [keystone] companions:[none] — An enemy at max Corroded that dies bursts, applying full Corroded to everything nearby.
- `alchemist.md.miracle_cure` [keystone] companions:[none] — A Transfusion Tonic on a downed ally revives them at half health.
- `alchemist.ms.wild_yield` [behavior] companions:[none] — Every thrown reagent rolls a second random rider on top of its own.
- `alchemist.ms.unstable_genius` [keystone] companions:[none] — Every skill has a chance to cast a second random Alchemist skill for free.
- `alchemist.tr.equivalent_exchange` [behavior] companions:[none] — Spending a reagent refunds a fraction of Mana, and vice versa.
- `alchemist.tr.philosophers_stone` [keystone] companions:[none] — Reagents and Mana share one pool; either skill can pay with either.
- `alchemist.hybrid.napalm` [hybrid] companions:[+1mutations] — Fire and acid zones that overlap become one sticky pool that burns and corrodes at once.
- `alchemist.hybrid.panacea` [hybrid] companions:[+1mutations] — Transfusion Tonic also cleanses every debuff and grants a Catalyzed buff.
- `alchemist.hybrid.unstable_combustion` [hybrid] companions:[none] — Unstable Reaction's yield always includes a fire detonation, scaled by reagents spent.
- `alchemist.hybrid.mutagen` [hybrid] companions:[+1mutations] — Corroded enemies spread the stack to anything that touches them.
- `alchemist.hybrid.experimental_medicine` [hybrid] companions:[none] — Experimental Serum can roll offensive outcomes too — and you keep whichever one lands.
- `alchemist.hybrid.lab_accident` [hybrid] companions:[none] — Every thrown reagent has a chance to over-yield: a much bigger blast, centred on you.
- `alchemist.mythic.the_reaction` [mythic] companions:[+1mutations] — Grand Experiment stops cycling and starts compounding: every phase's zone stays, they all react with each other continuously, and each reaction throws a random reagent for free at the nearest enemy.

### Engineer
- `engineer.gn.automated_army` [keystone] companions:[none] — Your turret cap doubles and killing an enemy near a turret drops a free one.
- `engineer.se.artillery_platform` [keystone] companions:[none] — A stationary Engineer directs every construct's fire onto one target for massive focused damage.
- `engineer.mc.auto_repair` [behavior] companions:[none] — Constructs slowly repair themselves and don't expire while you're near them.
- `engineer.mc.self_repairing_workshop` [keystone] companions:[none] — Repair Drone becomes permanent and rebuilds the last destroyed construct on a timer.
- `engineer.sa.chain_detonation` [keystone] companions:[none] — A construct destroyed by anything detonates like a Shock Mine, and the blast can trigger others.
- `engineer.qm.mobile_armory` [keystone] companions:[none] — You carry the cache — allies near you regenerate resources and reload faster.
- `engineer.hybrid.killbox` [hybrid] companions:[none] — Turrets prioritise Tagged enemies and their hits refresh the Tag — a marked target never leaves the crossfire.
- `engineer.hybrid.forward_base` [hybrid] companions:[+1mutations] — Reinforced Barricade also deploys a small turret on top of itself.
- `engineer.hybrid.autonomous_army` [hybrid] companions:[none] — Overclocked turrets pick their own repositions and don't need line of sight.
- `engineer.hybrid.recursive_explosives` [hybrid] companions:[none] — A construct that detonates rebuilds itself once from the Scrap the blast scattered.
- `engineer.hybrid.demolition_zone` [hybrid] companions:[+1mutations] — Mortar Pod shells also lay a Shock Mine wherever they land.
- `engineer.hybrid.field_workshop` [hybrid] companions:[none] — Repair Drone also repairs allies' gear-granted constructs and refunds their cooldowns.
- `engineer.mythic.the_foundry` [mythic] companions:[+1mutations] — Siege Engine stops being a summon and becomes a factory. It is permanent, it repairs itself, and every few seconds it builds a turret or a mine of its own — the Engineer's whole workshop, walking around the arena assembling more of itself.

### Assassin
- `assassin.ex.death_sentence` [keystone] companions:[none] — Killing a Contract target moves the Contract to the nearest enemy for free.
- `assassin.vn.fatal_dose` [keystone] companions:[none] — Poison at max stacks becomes lethal — it will kill the target on its own, and spreads on that death.
- `assassin.sh.never_seen` [keystone] companions:[none] — The first strike out of stealth always crits, and a kill from stealth doesn't break it.
- `assassin.sb.critical_weakness` [keystone] companions:[none] — Execution's boss slice doubles against an exposed Contract, once per encounter.
- `assassin.bh.death_spiral` [keystone] companions:[none] — Against a bleeding, poisoned, and marked target, every hit is an Execution.
- `assassin.hybrid.toxic_execution` [hybrid] companions:[+1mutations] — Execution consumes every poison stack on the target for a burst scaled by the stacks spent.
- `assassin.hybrid.predator` [hybrid] companions:[none] — While stealthed, you can see wounded and marked enemies through walls, and Blood Trail never expires.
- `assassin.hybrid.weak_point` [hybrid] companions:[+1mutations] — Ambush from stealth on an exposed target always executes.
- `assassin.hybrid.silent_poison` [hybrid] companions:[none] — Poison you apply while stealthed does not alert the target — it stacks freely until it's lethal.
- `assassin.hybrid.death_chain` [hybrid] companions:[grantEffect] — An Execution kill grants a free Ambush that resets Execution — a chain of kills across a pack.
- `assassin.hybrid.perfect_crime` [hybrid] companions:[none] — A kill while stealthed generates no threat and does not break stealth — the room never learns it happened.
- `assassin.mythic.the_perfect_contract` [mythic] companions:[+1mutations] — Contract Fulfilled stops being a single execution and becomes a rolling one. Each kill during it re-locks onto the next-highest-threat enemy and restarts the escalating sequence, and every poison and bleed on a Contract target ticks for its whole stack at once.

### Warden
- `warden.be.primal_guardian` [keystone] companions:[none] — Bear Aspect no longer expires and its swipe roots — you are the wall and the counterattack.
- `warden.vd.worldroot` [keystone] companions:[none] — All your healing zones are linked — standing in one is standing in all of them.
- `warden.tk.briarheart` [keystone] companions:[none] — Every terrain piece you own pulses a thorn nova on a timer, scaled by how many are up.
- `warden.hm.apex_predator` [keystone] companions:[none] — Wolves are permanent, and the Warden and pack all deal execute damage to entangled enemies.
- `warden.an.elder_grove` [keystone] companions:[none] — One terrain piece per fight is made permanent and immune to destruction.
- `warden.hybrid.apex` [hybrid] companions:[grantEffect] — In Bear Aspect, killing an entangled enemy heals you and refreshes the form.
- `warden.hybrid.briar_sanctuary` [hybrid] companions:[+1mutations] — Verdant Shelter's canopy also lashes enemies who step under it.
- `warden.hybrid.world_tree` [hybrid] companions:[none] — Ancient Grove can be seeded early — a small permanent grove that grows every time you cast a nature skill near it.
- `warden.hybrid.predators_retaliation` [hybrid] companions:[none] — Nature's Reprisal also triggers from your terrain — hitting a Living Wall gets the attacker struck back.
- `warden.hybrid.pack_growth` [hybrid] companions:[none] — Regrowth blooms also buff the pack's damage while they stand near one.
- `warden.hybrid.elder_form` [hybrid] companions:[+1mutations] — Bear Aspect becomes the treant — slower still, but its swipes are area attacks and it cannot be displaced at all.
- `warden.mythic.the_wildwood` [mythic] companions:[+1mutations] — Ancient Grove stops being a cooldown. Once cast, the forest stays for the rest of the floor, it drifts slowly to follow the party, and every nature skill cast inside it is doubled and free of Roots.
