/**
 * Which frame of a sprite to draw right now.
 *
 * Pure and DOM-free, like `render/pixels.ts` and `render/atlas/manifest.ts` next to it, so
 * `npm run anim` and `tools/smoke.ts` can check every rule in here headlessly.
 *
 * ## The seam: the simulation never knows about animation
 *
 * The clock lives here, in `render/`. It **reads** simulation state and writes none. There
 * is no `frame` field on an `Enemy`, no `animTimer` on a `Hero`, and there must never be
 * one: if making a sprite play requires adding a field to something in `game/`, the seam
 * has been taken in the wrong place. Everything an animation needs is already derivable
 * from state the simulation keeps for its own reasons — a boss's `castTimer`/`castTotal`,
 * an entity's id, wall-clock seconds — which is what makes this a reading of the sim
 * rather than a second copy of it.
 *
 * The practical payoff is co-op: a client rebuilds boss cast state from the snapshot
 * (`net/sync.ts` carries `ability`, `castTimer` and `castTotal` already), so the same
 * animation resolves identically on both ends without a single new wire field.
 *
 * Every function here takes a manifest **row**, not a sprite id. Call sites already hold
 * one (`const meta = ATLAS[id]` is the existing idiom at every atlas draw site), and it
 * keeps the module free of a global lookup — which is what lets `npm run anim` check the
 * rules against synthetic rows instead of only against whatever art happens to be
 * committed today.
 *
 * ## Draw code asks for a TAG, never a frame index
 *
 * A caller says "draw the boss casting", not "draw frame 6". Frame indices are the art's
 * business and they change every time a strip is re-exported; a tag name survives that.
 *
 * ## Every rung of the ladder is a fallback, never an error
 *
 * The same idiom `chooseSpriteArt` already uses for `MONSTER_SETS`: a sprite with no `anim`,
 * an unknown tag, or a tag naming frames the strip doesn't have all resolve to a valid
 * frame rather than throwing. Missing art is never a broken screen — the worst case is
 * the static single frame the game drew before any of this existed.
 */

import type { AnimTag, AtlasAnim, AtlasSprite } from "./atlas/manifest";

/** What a sprite with no animation table draws, and the end of every fallback ladder. */
export const STATIC_FRAME = 0;

/**
 * The tag every ladder falls back to before it falls back to {@link STATIC_FRAME}. A
 * sprite that defines `idle` gets a sensible picture for any tag nobody has drawn yet.
 */
export const FALLBACK_TAG = "idle";

/** A resolved frame: which cell of the strip, and how many cells the strip has. */
export interface Frame {
  readonly index: number;
  readonly cols: number;
}

/** The static, un-animated answer — one frame, one column. */
const STATIC: Frame = { index: STATIC_FRAME, cols: 1 };

/**
 * The tag a sprite will actually use for a request, walking the fallback ladder: each name
 * given, in order, then `idle`, then nothing.
 *
 * **A chain rather than a single name is what makes the art affordable.** The four raid
 * bosses draw their rotations from a shared pool of about fifteen abilities, and the tag
 * for a boss cast is the `BossAbilityId` — so one animation per ability would be forty-odd
 * generations per boss for a fight the player sees for two minutes. Asking for
 * `[ability, "cast", "idle"]` instead means a boss ships **one** wind-up that covers every
 * ability it has, and a specific ability can be given its own art later without anything
 * being rewired: the more specific name simply starts resolving.
 *
 * Exported because the gate asserts the ladder terminates, and because a caller
 * occasionally wants to know whether real art exists (to pick a different effect) rather
 * than silently drawing a stand-in.
 */
export function resolveTag(
  meta: AtlasSprite | undefined, tag: string | readonly string[],
): AnimTag | null {
  const anim = meta?.anim;
  if (!anim) return null;
  for (const name of typeof tag === "string" ? [tag] : tag) {
    const t = anim.tags[name];
    if (t && valid(t, anim.cols)) return t;
  }
  const fallback = anim.tags[FALLBACK_TAG];
  return fallback && valid(fallback, anim.cols) ? fallback : null;
}

/** A tag only counts if it names frames the strip actually has and holds them for real time. */
function valid(t: AnimTag, cols: number): boolean {
  return t.seconds > 0 && t.from >= 0 && t.to >= t.from && t.to < cols;
}

/** Frames in a span, always at least 1. */
const span = (t: AnimTag): number => t.to - t.from + 1;

/**
 * The frame of a free-running animation at `seconds` — a walk cycle, an idle breath, a
 * torch guttering. `seconds` is wall-clock time from the render loop; pass an entity's own
 * offset added in so a room full of the same monster doesn't march in lockstep.
 *
 * A non-looping tag holds its last frame once it has played through, which is what makes
 * a one-shot (a death, a spawn) safe to keep asking for after it has finished.
 */
export function frameAt(
  meta: AtlasSprite | undefined, tag: string | readonly string[], seconds: number,
): Frame {
  const t = resolveTag(meta, tag);
  if (!t || !meta?.anim) return STATIC;
  const n = span(t);
  // A non-finite clock is a caller bug, but the ladder's promise is that nothing it is
  // handed produces an invalid frame — so NaN resolves to the first frame, not to NaN.
  const elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const step = Math.floor(elapsed / t.seconds);
  const i = t.loop ? step % n : Math.min(step, n - 1);
  return { index: t.from + i, cols: meta.anim.cols };
}

/**
 * The frame at a fraction `p` (0..1) through a tag, rather than at a wall-clock time.
 *
 * **This is the one that matters for a boss wind-up, and it is not a convenience.** A
 * casting boss is locked in place and its wind-up *is* the player's warning and their
 * window to punish — so the cast animation is part of the telegraph's readability, not
 * decoration on top of it. Keyed to progress, the sprite's pose IS the countdown: the
 * wind-up pose lands exactly when the shape on the floor fills, every time, at any depth.
 *
 * A free-running clock cannot promise that. `DepthProfile.telegraph` squeezes a cast
 * shorter as you descend (down to `MIN_CAST`), and an enrage buys a tighter rotation, so
 * the same animation would finish early on one floor and get cut off on another — the
 * frame the player has learned to read as "now" would drift away from the hit.
 *
 * Callers get `p` from the simulation without it knowing why: `1 - castTimer / castTotal`.
 */
export function frameAtProgress(
  meta: AtlasSprite | undefined, tag: string | readonly string[], p: number,
): Frame {
  const t = resolveTag(meta, tag);
  if (!t || !meta?.anim) return STATIC;
  const n = span(t);
  // Clamped, and `p === 1` lands on the last frame rather than one past it.
  const clamped = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
  const i = Math.min(n - 1, Math.floor(clamped * n));
  return { index: t.from + i, cols: meta.anim.cols };
}

/**
 * Where a frame sits in the strip PNG, as a `drawImage` source rect.
 *
 * A static sprite returns the whole image, so a call site that switched to the 9-argument
 * `drawImage` draws exactly what the 5-argument one drew — which is what lets sites move
 * over one at a time instead of in one flag day.
 */
export function frameRect(
  meta: AtlasSprite | undefined, frame: Frame,
): { sx: number; sy: number; sw: number; sh: number } {
  const w = meta?.w ?? 0, h = meta?.h ?? 0;
  return { sx: frame.index * w, sy: 0, sw: w, sh: h };
}

/**
 * The strip PNG's width for an animated row, or the plain `w` for a static one — i.e. the
 * width the file on disk actually is, which is what `atlas/index.ts` measures a decoded
 * image against and what `npm run anim` measures the committed PNG against.
 *
 * Structural rather than `AtlasSprite`, so the loader can put every manifest row it loads
 * through one function: an `AtlasScene` has no `worldScale`, and a row that can never
 * carry an `anim` table is simply one whose strip is one frame wide.
 */
export function stripWidth(meta: { readonly w: number; readonly anim?: AtlasAnim }): number {
  return meta.w * (meta.anim?.cols ?? 1);
}

/**
 * **The one test of whether a decoded PNG is the file its manifest row describes.**
 *
 * `atlas/index.ts` calls this at boot on the decoded image and rejects the sprite if it
 * says no; `npm run anim` calls it on the committed file. That is the point — they must
 * be the *same* test, not two that agree today.
 *
 * They didn't. The loader compared the file against `spr.w`, which for an animated row is
 * one frame, so every strip was rejected — three raid bosses fell back to their ~26px
 * procedural bakes on every boot — while the gate compared the same file against
 * `stripWidth` and passed. Neither side was wrong about its own number and nothing
 * compared them, which is the blind-instrument rule in CLAUDE.md wearing a different hat.
 */
export function fitsManifest(
  meta: { readonly w: number; readonly h: number; readonly anim?: AtlasAnim },
  width: number, height: number,
): boolean {
  return width === stripWidth(meta) && height === meta.h;
}

// --- reading a boss wind-up ------------------------------------------------

/**
 * The shape of the boss state this module reads, structurally rather than by importing
 * `game/entities` — `render/` is allowed to read the simulation, but keeping the
 * dependency structural is what lets `npm run anim` exercise these rules without pulling
 * the whole dungeon into a headless tool.
 */
export interface CastReadout {
  readonly ability: string | null;
  readonly castTimer: number;
  readonly castTotal: number;
}

/** What to draw for a boss this instant: which tags to try, and how far through the cast. */
export interface CastFrame {
  /**
   * The fallback chain, most specific first: this ability's own animation, then the
   * boss's generic wind-up, then `idle`. Pass it straight to {@link frameAtProgress}.
   */
  readonly tag: readonly string[];
  readonly progress: number;
}

/** The generic wind-up every boss can share, sitting between an ability and `idle`. */
export const CAST_TAG = "cast";

/**
 * The tag and progress for a boss's current wind-up, or null if it isn't casting.
 *
 * **`alive` is not optional politeness.** A telegraph whose owner dies mid-cast is deleted
 * and the ability never resolves (`updateTelegraphs` in `game/dungeon.ts`: "the owner died
 * mid-cast: the ability dies with it") — but `ability` and `castTimer` are still sitting on
 * the dead boss's state. Killing a boss through its wind-up is a real and rewarded play, so
 * a clock that trusted `castTimer` to reach zero would leave a corpse frozen in a cast pose
 * that is never going to land. Gone from the fight means the cast is cancelled, full stop.
 *
 * By convention the most specific tag **is** the `BossAbilityId`, so a new ability needs no
 * coordination with the render side at all: it either has its own art, or it falls through
 * the boss's generic `cast` wind-up, or it falls all the way to the static frame — and the
 * fight is readable at every rung.
 */
export function castFrame(boss: CastReadout | null | undefined, alive: boolean): CastFrame | null {
  if (!alive || !boss || !boss.ability) return null;
  if (!(boss.castTotal > 0) || !(boss.castTimer > 0)) return null;
  const remaining = Math.min(boss.castTimer, boss.castTotal);
  return { tag: [boss.ability, CAST_TAG], progress: 1 - remaining / boss.castTotal };
}
