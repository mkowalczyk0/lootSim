/**
 * The composed drop read — UAT §20's one question, "what comes out of this?".
 *
 * Every table that answers `DropQuery` is combined here and ONLY here, so a preview
 * screen asks once and a third table later is one line. Each row carries the matched
 * source alongside the definition — the odds to quote and the wording to use come off
 * `src`, and a consumer never has to reach back into a table to recover either. A
 * `craft` source is not a drop and never appears: a preview of an activity must not list
 * things you buy at the Forge (`forSource` already excludes it; this file relies on that).
 */

import { forSource, type DropQuery, type FoundSource } from "./drops";
import { NAMED_ITEMS, type NamedItemDef } from "./named";
import { RELICS, relicMatchesFor, type RelicDef } from "./relics";

export type PreviewDrop =
  | { readonly kind: "named"; readonly def: NamedItemDef; readonly src: FoundSource }
  | { readonly kind: "relic"; readonly def: RelicDef; readonly src: FoundSource };

/** Everything this event can pay out, across every table, with the source each matched through. */
export function dropsForSource(q: DropQuery): PreviewDrop[] {
  return [
    ...forSource(NAMED_ITEMS, q).map((m): PreviewDrop => ({ kind: "named", def: m.def, src: m.src })),
    ...relicMatchesFor(q).map((m): PreviewDrop => ({ kind: "relic", def: m.def, src: m.src })),
  ];
}

/** Every definition in every table — for "how many are there to find" counts. */
export const ALL_DROP_TABLES = { named: NAMED_ITEMS, relic: RELICS } as const;
