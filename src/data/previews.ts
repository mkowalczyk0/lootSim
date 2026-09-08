/**
 * Endgame drop previews — UAT §20.
 *
 * §20's ask is one sentence: *"I want X item, and this is where I get it."* Standing at a
 * portal or a station, before committing to a run, you should be able to see what that
 * activity can actually pay out. §17 asks for the same thing from the other side ("clear
 * rewards preview" for the daily and weekly), and §19 wants it for artifacts and relics
 * when they arrive.
 *
 * ### The one rule this file exists to obey
 *
 * **A preview never holds its own copy of a drop table.** A preview that can drift out of
 * sync with the real table is worse than no preview: it teaches the player something
 * false and then keeps teaching it. So everything here is a *read* of the tables the
 * simulation already rolls against —
 *
 * - which named items an event can pay: `namedForSource`, the same function
 *   `rollNamedDrops` filters with
 * - how much harder content lifts those odds: `namedDropChance`, the same call the roll
 *   site makes
 * - which boss a floor spawns: `bossSpecForRun`, the same function `Dungeon.spawnBoss`
 *   calls
 * - what a mode pays in coins, keys, gems and rarity: the `RunMode` itself
 * - what a sector pays in materials: the `PlanetSpec` itself
 *
 * There is no table in this file. If a preview is wrong, the game is wrong with it, which
 * is the only kind of wrong worth having.
 *
 * ### What an "activity" is
 *
 * A `RunConfig` — which every mode already produces (`delveConfig`, `riftConfig`,
 * `planetConfig`, `dailyConfig`). The preview expands it into the *events* that run
 * contains and asks the drop tables about each one: the boss that will be standing there,
 * the clear cache the quota opens, and the monsters in between. A rift or a sector is a
 * fixed sequence of floors, so all of them are walked; the Delve is one floor at a time
 * by design, so it previews the floor you're about to enter.
 *
 * Pure data. No DOM, no `GameState`, no dice.
 */

import { chestName, type ChestTier } from "./chests";
import type { ClassId } from "./classes";
import type { Element } from "./elements";
import { bossSpecForRun } from "./encounters";
import { MATERIAL_NAMES } from "./materials";
import { MODES, riftConfig, type RunConfig } from "./modes";
import {
  namedDropChance, namedForSource, namedMatchesFor, namedSourceLines,
  type NamedItemDef, type NamedSource,
} from "./named";
import { planetConfig } from "./planets";

/** One named item this activity can pay out, and how. */
export interface PreviewDrop {
  readonly def: NamedItemDef;
  /**
   * Best per-event chance among the sources this activity actually triggers, already
   * lifted by the run's `danger` exactly as the roll site lifts it. Per *event*, not per
   * run — a world drop's 0.2% is per kill, and saying so is more honest than compounding
   * it into a per-run number that assumes a kill count.
   */
  readonly chance: number;
  /** Where it comes from *here*, in words. One of `namedSourceLines`' lines. */
  readonly via: string;
  /** True when only this activity can pay it out — the "I still need THAT one" flag. */
  readonly exclusive: boolean;
}

export interface ActivityPreview {
  /** What the player is standing in front of. */
  readonly title: string;
  /** The encounters this run contains, in floor order. Usually one, or none. */
  readonly bosses: readonly string[];
  /** Named items, best odds first, exclusives ahead of shared ones at equal odds. */
  readonly named: readonly PreviewDrop[];
  /** Materials this activity pays, by element. Reliquary sectors only. */
  readonly materials: readonly Element[];
  /** Everything else it pays, as sentences: coins, keys, gems, the rarity lean. */
  readonly other: readonly string[];
}

/** How many distinct activities can pay a definition out, ignoring the forge. */
function dropSourceCount(def: NamedItemDef): number {
  return def.sources.filter((s) => s.kind !== "craft").length;
}

/** True when the only way to get this is the one source we matched. */
function isExclusive(def: NamedItemDef, matched: NamedSource): boolean {
  return dropSourceCount(def) === 1 && def.sources.includes(matched);
}

/**
 * Every floor of the run `config` belongs to, in order.
 *
 * A rift, a sector and the Vigil are fixed sequences, so the whole thing is previewable
 * before you enter it. The Delve is deliberately not — "descend or extract after every
 * clear" is the decision the mode exists to create, so previewing floor N+1 would be
 * previewing a choice the player hasn't made. One floor, the one you're entering.
 */
function floorsOf(config: RunConfig): RunConfig[] {
  const mode = config.mode;
  if (!mode.isRift || mode.floors <= 1) return [config];
  if (config.planet) {
    const { spec, tier } = config.planet;
    return Array.from({ length: spec.floors }, (_, i) =>
      planetConfig(spec, tier, i + 1, config.challengerTier));
  }
  return Array.from({ length: mode.floors }, (_, i) =>
    riftConfig(mode.id, config.tier, i + 1, config.challengerTier));
}

/**
 * Every drop event a floor contains, as `namedForSource` queries.
 *
 * Three kinds, and they are exactly the three the floor really rolls: the boss if it has
 * one, the clear cache the kill quota opens, and every wave monster on the way. Elites
 * are folded into the world-drop query as the generous case (`elite: true`) because a
 * floor that can produce an elite can pay the tripled odds, and a preview should say what
 * is reachable rather than the floor of what is likely.
 */
function eventsOn(floor: RunConfig, proving: ClassId | null) {
  const events: Parameters<typeof namedForSource>[0][] = [
    { kind: "clearCache", depth: floor.depth, mode: floor.mode.id },
    { kind: "worldDrop", depth: floor.depth, elite: true },
  ];
  if (floor.bossFloor) {
    events.unshift({ kind: "boss", bossId: bossSpecForRun(floor, proving).id });
  }
  return events;
}

/**
 * What this activity can drop. The §20 read.
 *
 * `proving` is the class whose Proving the floor is, or null — pass what
 * `legends.provingFloor` says, so the preview names the encounter the player will
 * actually meet rather than the one the depth would otherwise serve.
 */
export function previewForRun(config: RunConfig, proving: ClassId | null = null): ActivityPreview {
  const floors = floorsOf(config);
  const bosses: string[] = [];
  /** Best chance and matched source per definition, across every event in the run. */
  const best = new Map<string, { def: NamedItemDef; chance: number; src: NamedSource }>();

  for (const floor of floors) {
    if (floor.bossFloor) bosses.push(bossSpecForRun(floor, proving).name);
    for (const event of eventsOn(floor, proving)) {
      for (const { def, src } of namedMatchesFor(event)) {
        // The odds this event really rolls: an elite triples a world drop, and danger
        // lifts everything — both through the same calls `rollNamedDrops` makes.
        let base = src.kind === "craft" ? 0 : src.chance;
        if (event.kind === "worldDrop" && event.elite && src.kind === "worldDrop") base *= 3;
        const chance = namedDropChance(base, config.danger);
        const prior = best.get(def.id);
        if (!prior || chance > prior.chance) best.set(def.id, { def, chance, src });
      }
    }
  }

  const named: PreviewDrop[] = [...best.values()]
    .map(({ def, chance, src }) => ({
      def,
      chance,
      via: lineFor(def, src),
      exclusive: isExclusive(def, src),
    }))
    .sort((a, b) => (b.exclusive ? 1 : 0) - (a.exclusive ? 1 : 0) || b.chance - a.chance
      || a.def.name.localeCompare(b.def.name));

  return {
    title: titleFor(config, proving),
    bosses,
    named,
    materials: config.planet ? [config.planet.spec.element] : [],
    other: otherRewards(config),
  };
}

/** What a chest tier can pull, for the same read at a station rather than a portal. */
export function previewForChest(tier: ChestTier): ActivityPreview {
  const named: PreviewDrop[] = namedMatchesFor({ kind: "chest", tier })
    .map(({ def, src }) => ({
      def,
      chance: src.kind === "chest" ? src.chance : 0,
      via: lineFor(def, src),
      exclusive: isExclusive(def, src),
    }))
    .sort((a, b) => b.chance - a.chance || a.def.name.localeCompare(b.def.name));
  return {
    title: `${chestName(tier)} chest`,
    bosses: [],
    named,
    materials: [],
    other: [],
  };
}

/** The `namedSourceLines` entry for one source, so the wording lives in one place. */
function lineFor(def: NamedItemDef, src: NamedSource): string {
  const i = def.sources.indexOf(src);
  return namedSourceLines(def)[i] ?? "";
}

function titleFor(config: RunConfig, proving: ClassId | null): string {
  if (proving) return bossSpecForRun(config, proving).name;
  if (config.planet) return `${config.planet.spec.name} · tier ${config.planet.tier}`;
  if (config.daily) return MODES.vigil.name;
  if (config.mode.isRift) return `${config.mode.name} · tier ${config.tier}`;
  return `${config.mode.name} · depth ${config.depth}`;
}

/**
 * What the activity pays that isn't a named item — §20's "Other materials" line, spelled
 * out. Read off the `RunMode` and the run itself, never restated: if the Avarice Rift's
 * `coinMult` is retuned, this sentence retunes with it.
 */
function otherRewards(config: RunConfig): string[] {
  const mode = config.mode;
  const out: string[] = [];
  const pct = (m: number) => `${Math.round(m * 100)}%`;

  if (config.planet) {
    out.push(`${MATERIAL_NAMES[config.planet.spec.element]} from kills and from every node you mine`);
  }
  if (config.daily) {
    out.push(`one guaranteed ${chestName(config.daily.keyTier)} key in the clear cache, once a day`);
  }
  if (mode.quantity !== 1) out.push(`${pct(mode.quantity)} the usual number of drops`);
  if (mode.rarityBias > 0) {
    out.push(mode.rarityBias >= 0.1
      ? "the loot table bent hard toward the top end"
      : "the loot table nudged toward the top end");
  }
  if (mode.coinMult !== 1) out.push(`${pct(mode.coinMult)} coins`);
  if (mode.keyMult !== 1) out.push(`${pct(mode.keyMult)} chest keys`);
  if (mode.gemMult !== 1) out.push(`${pct(mode.gemMult)} gems`);
  if (mode.xpMult !== 1) out.push(`${pct(mode.xpMult)} XP`);
  if (config.danger > 1) {
    out.push(`named-item odds lifted ${pct(namedDropChance(1, config.danger))} by the danger here`);
  }
  if (out.length === 0) out.push("ordinary rates on everything — this is the baseline");
  return out;
}
