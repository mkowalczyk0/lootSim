import { combatHints, skillKeys } from "../core/input";
import { clamp, formatNumber } from "../core/math";
import { CHEST_TIERS } from "../data/chests";
import { ELEMENT_COLORS } from "../data/elements";
import { MATERIAL_NAMES } from "../data/materials";
import { EARLY_EXTRACT_KEEP } from "../data/modes";
import { RARITY_COLORS } from "../data/rarity";
import { RELIC_BY_ID, RELIC_TIER_INFO } from "../data/relics";
import { DEFAULT_KEYBINDS, keyLabel, type RebindableAction, type Settings } from "../data/settings";
import { getStatusSpec } from "../combat/status";
import type { ResourcePool } from "../combat/resources";
import { REVIVE_TIME, type Dungeon } from "../game/dungeon";
import type { Level } from "../game/level";

/**
 * The class's real casting resource — Momentum, Rage, Chi, whatever it calls itself —
 * never `Player.mana`. `canCast` (`game/dungeon.ts`) gates every ability off
 * `hero.resources`, not `Player.mana`, for every class; `mana`/`maxMana` are legacy,
 * kept alive only for potions and mana-on-kill (CLAUDE.md's own note). Showing a "mana"
 * bar on a class that never spends mana to cast is the bug — the HUD has to read the
 * pool the class actually declared, labelled the way that class names it.
 */
function primaryResource(d: Dungeon): ResourcePool | undefined {
  return d.localHero.resources.all().find((p) => p.spec.ui !== "hidden" && !p.spec.isUltimateMeter);
}

/** A status colour: its damage element when it has one, otherwise a plain readout tint. */
function statusColor(id: string): string {
  const t = getStatusSpec(id)?.damageType;
  return (t && (ELEMENT_COLORS as Record<string, string>)[t]) || "#cbd5e1";
}

/** Every prompt on screen reads the live binding, same rule as `combatHints`. */
function k(settings: Settings, action: RebindableAction): string {
  return keyLabel(settings.keybinds[action] ?? DEFAULT_KEYBINDS[action]);
}

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Pathing's own navigation grid (`game/level.ts`'s `GRID`) — world units per minimap
 *  cell. `Level.blocked`/`cols`/`rows` are already indexed on this pitch. */
const MAP_GRID = 16;

/** Screen-space overlay for a dive: vitals, floor progress, unbanked loot, prompts. */
export class Hud {
  /** Cached per floor — this doesn't change until the level does, and rebuilding a
   *  ~150x90 cell image from scratch every frame is wasted work a real-time HUD
   *  shouldn't pay for. Keyed on the `Level` object's own identity: a new floor is
   *  always a new object, so reference equality is a free, correct cache key. */
  private minimapBg: HTMLCanvasElement | null = null;
  private minimapBgLevel: Level | null = null;

  draw(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number, paused = false): void {
    ctx.save();
    ctx.textBaseline = "top";

    this.drawVitals(ctx, d);
    if (d.isParty) this.drawParty(ctx, d);
    // `drawFloorInfo` hands back the lowest y it actually drew to — a boss floor's
    // one-line info panel and a wave floor's four-line one (title, layer, mode tag,
    // kills/wave) end at very different heights, and the boss/elite frame below has to
    // start clear of whichever one is live rather than a constant tuned against the
    // shorter case. That constant is exactly what let elite bars overlap the floor
    // readout on any floor with a mode tag.
    const floorInfoBottom = this.drawFloorInfo(ctx, d, w);
    this.drawLoot(ctx, d, w);
    this.drawSkills(ctx, d, w, h);
    this.drawControls(ctx, h, d);
    if (d.settings.combatStats) this.drawCombatStats(ctx, d, h);
    if (d.boss) this.drawBossFrame(ctx, d, w, floorInfoBottom);
    else this.drawEliteBars(ctx, d, w, floorInfoBottom);
    this.drawMinimap(ctx, d, w, h);

    if (d.phase !== "dead" && d.localHero.downed) this.drawDownedPrompt(ctx, w, h);
    if (d.phase !== "dead") this.drawPortalPrompt(ctx, d, w, h);
    if (d.phase !== "dead" && !d.canDescend && !d.atPortal && !d.atCompletionPortal) {
      this.drawResourcePrompt(ctx, d, w, h);
    }
    if (d.phase === "dead") this.drawDeathPrompt(ctx, d, w, h);
    if (paused && d.phase !== "dead") this.drawPause(ctx, w, h, d);

    ctx.restore();
  }

  /**
   * Ally frames, under your own vitals. Small on purpose: health, whether they're down,
   * and how close the revive is. Anything more and it stops being a game about the
   * floor and starts being a game about the party's UI.
   */
  private drawParty(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    const x = 18;
    let y = 152;
    for (const hero of d.heroes) {
      if (hero.local) continue;
      const w = 180;
      panel(ctx, x - 8, y - 8, w + 16, 34);
      const pct = clamp(hero.player.health / Math.max(1, hero.player.maxHealth), 0, 1);
      ctx.fillStyle = "#1a1d26";
      ctx.fillRect(x, y + 12, w, 8);
      // Somebody whose browser left is greyed out, not red: there's nothing to go and do.
      ctx.fillStyle = hero.departed ? "#434c5e" : hero.downed ? "#ef4444" : pct > 0.35 ? "#4ade80" : "#fbbf24";
      ctx.fillRect(x, y + 12, w * (hero.departed ? 1 : hero.downed ? hero.reviveProgress / REVIVE_TIME : pct), 8);

      ctx.font = `bold 11px ${MONO}`;
      ctx.fillStyle = hero.departed ? "#5a6270" : hero.downed ? "#ef4444" : hero.player.heroClass.color;
      ctx.textAlign = "left";
      ctx.fillText(hero.name.toUpperCase(), x, y);
      ctx.font = `10px ${MONO}`;
      ctx.fillStyle = "#9aa4b2";
      ctx.textAlign = "right";
      ctx.fillText(
        hero.departed ? "left the room" : hero.downed ? "DOWN — go get them" : `${Math.round(hero.player.health)}`,
        x + w, y,
      );
      ctx.textAlign = "left";
      y += 42;
    }
  }

  /** You're out of health but the party isn't. Somebody has to come and get you. */
  private drawDownedPrompt(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = "rgba(40,6,10,0.35)";
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.font = `bold 30px ${MONO}`;
    ctx.fillStyle = "#ef4444";
    ctx.fillText("YOU ARE DOWN", w / 2, h / 2 - 40);
    ctx.font = `13px ${MONO}`;
    ctx.fillStyle = "#9aa4b2";
    ctx.fillText("An ally standing over you brings you back.", w / 2, h / 2 - 8);
    ctx.fillText("Clearing the floor picks everybody up.", w / 2, h / 2 + 14);
  }

  private drawVitals(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    const p = d.player;
    const x = 18;
    const y = 18;
    const w = 260;

    panel(ctx, x - 8, y - 8, w + 16, 118);

    // Health
    const pct = clamp(p.health / p.maxHealth, 0, 1);
    ctx.fillStyle = "#1a1d26";
    ctx.fillRect(x, y, w, 18);
    ctx.fillStyle = pct > 0.5 ? "#4ade80" : pct > 0.25 ? "#fbbf24" : "#ef4444";
    ctx.fillRect(x, y, w * pct, 18);
    // The ward sits on top of the health bar, because that is exactly what it does.
    if (d.ward > 0) {
      const wardPct = clamp(d.ward / p.maxHealth, 0, 1);
      ctx.fillStyle = "rgba(192,132,252,0.75)";
      ctx.fillRect(x, y, w * wardPct, 18);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 17);
    ctx.font = `bold 11px ${MONO}`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(
      d.ward > 0 ? `${Math.ceil(p.health)} / ${p.maxHealth}  (+${Math.round(d.ward)})`
                 : `${Math.ceil(p.health)} / ${p.maxHealth}`,
      x + w / 2, y + 4,
    );

    // The class's own resource — see `primaryResource`. Falls back to legacy mana only
    // if a hero somehow has no resolved resource pool at all (no live class today does).
    const resource = primaryResource(d);
    ctx.fillStyle = "#1a1d26";
    ctx.fillRect(x, y + 22, w, 12);
    if (resource) {
      ctx.fillStyle = p.heroClass.color;
      ctx.fillRect(x, y + 22, w * resource.fraction, 12);
      ctx.font = `bold 9px ${MONO}`;
      ctx.fillStyle = "#cfe0ff";
      ctx.fillText(
        `${Math.floor(resource.value)} / ${resource.max} ${resource.spec.label.toLowerCase()}`,
        x + w / 2, y + 24,
      );
    } else {
      const manaPct = clamp(p.mana / Math.max(1, p.maxMana), 0, 1);
      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(x, y + 22, w * manaPct, 12);
      ctx.font = `bold 9px ${MONO}`;
      ctx.fillStyle = "#cfe0ff";
      ctx.fillText(`${Math.floor(p.mana)} / ${p.maxMana} mana`, x + w / 2, y + 24);
    }

    // XP
    const xpPct = clamp(p.xp / p.xpNeeded, 0, 1);
    ctx.fillStyle = "#1a1d26";
    ctx.fillRect(x, y + 38, w, 7);
    ctx.fillStyle = "#7dd3fc";
    ctx.fillRect(x, y + 38, w * xpPct, 7);

    // Special charge
    const ultColor = p.heroClass.color;
    ctx.fillStyle = "#1a1d26";
    ctx.fillRect(x, y + 49, w, 7);
    const charged = d.specialCharge >= 1;
    ctx.fillStyle = charged ? ultColor : "#a855f7";
    ctx.fillRect(x, y + 49, w * clamp(d.specialCharge, 0, 1), 7);

    ctx.textAlign = "left";
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = "#9aa4b2";
    ctx.fillText(`LV ${p.level} ${p.heroClass.name}`, x, y + 60);
    // The meter is named after the thing it fires, because every class fires a
    // different thing and the name is half the reason you picked it.
    const ultName = p.ultimateAbility?.name ?? "Ultimate";
    ctx.fillStyle = charged ? "#ff1493" : "#9aa4b2";
    ctx.fillText(
      charged ? `${ultName.toUpperCase()}  [${k(d.settings, "special")}]` : ultName.toLowerCase(),
      x + 120, y + 60,
    );
    ctx.fillStyle = "#4ade80";
    ctx.fillText(
      `Potions ${"◆".repeat(Math.min(6, d.potionCount))} (${d.potionCount})  [${k(d.settings, "potion")}]`,
      x, y + 76,
    );

    // Whatever is currently on you — a burn, a chill, a buff.
    let bx = x;
    for (const s of d.playerStatuses) {
      const spec = getStatusSpec(s.id);
      const label = `${spec?.label ?? s.id}${s.stacks > 1 ? ` x${s.stacks}` : ""}`;
      const col = statusColor(s.id);
      ctx.font = `bold 9px ${MONO}`;
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(bx, y + 92, tw, 13);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, y + 92.5, tw - 1, 12);
      ctx.fillStyle = col;
      ctx.fillText(label, bx + 4, y + 95);
      bx += tw + 4;
    }
  }

  /**
   * The three equipped skills, on the keys around the attack finger. Cooldown darkens
   * the box from the bottom; unaffordable ones go grey. No mouse, ever.
   */
  private drawSkills(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number): void {
    // The fourth box only exists while a piece of gear is granting you an ability.
    const slots = d.player.activeAbilities;
    if (slots.every((s) => !s)) return;
    const keys = skillKeys(d.settings);

    const boxW = 104;
    const boxH = 42;
    const gap = 8;
    const total = slots.length * boxW + (slots.length - 1) * gap;
    let x = (w - total) / 2;
    const y = h - boxH - 44;

    for (let i = 0; i < slots.length; i++) {
      const id = slots[i];
      const cd = d.skillCooldowns[i] ?? 0;
      panel(ctx, x, y, boxW, boxH);

      if (id) {
        const ready = d.canCast(i);
        const color = d.player.heroClass.color;
        const cost = id.costs?.[0];

        if (cd > 0) {
          // Cooldown eats the box from the bottom up.
          const frac = clamp(cd / Math.max(0.01, id.cooldown * d.player.cooldownMult), 0, 1);
          ctx.fillStyle = "rgba(0,0,0,0.62)";
          ctx.fillRect(x + 1, y + boxH - boxH * frac, boxW - 2, boxH * frac - 1);
        }

        ctx.textAlign = "left";
        ctx.font = `bold 10px ${MONO}`;
        ctx.fillStyle = ready ? color : "#5a6270";
        ctx.fillText(keys[i] ?? String(i + 1), x + 7, y + 6);

        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = ready ? "#e8eef7" : "#6b7480";
        ctx.fillText(id.name, x + 22, y + 6);

        ctx.font = `9px ${MONO}`;
        if (cost) {
          const pool = d.localHero.resources.get(cost.resource);
          ctx.fillStyle = pool && pool.value >= cost.amount ? "#60a5fa" : "#ef4444";
          ctx.fillText(`${Math.round(cost.amount)} ${pool?.spec.label ?? cost.resource}`, x + 7, y + 22);
        }

        ctx.textAlign = "right";
        ctx.fillStyle = "#6b7480";
        ctx.fillText(cd > 0 ? `${cd.toFixed(1)}s` : "ready", x + boxW - 7, y + 22);
      } else {
        ctx.textAlign = "center";
        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = "#3f4653";
        ctx.fillText("— empty —", x + boxW / 2, y + boxH / 2 - 5);
      }
      x += boxW + gap;
    }
    ctx.textAlign = "left";
  }

  /**
   * The boss frame: name, flavor, one enormous health bar with a tick at every phase
   * boundary, and a cast bar naming what is about to happen. Everything a raid frame
   * needs and nothing it doesn't.
   */
  private drawBossFrame(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, minY: number): void {
    const e = d.boss;
    if (!e || !e.boss) return;
    const spec = e.boss.spec;

    const bw = Math.min(620, w - 80);
    const bx = (w - bw) / 2;
    const by = Math.max(72, minY + 8);
    const bh = 66;
    panel(ctx, bx, by, bw, bh);

    ctx.textAlign = "center";
    ctx.font = `bold 15px ${MONO}`;
    ctx.fillStyle = ELEMENT_COLORS[spec.element];
    ctx.fillText(spec.name.toUpperCase(), w / 2, by + 7);

    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = "#6b7480";
    ctx.fillText(spec.title, w / 2, by + 25);

    // Health
    const barX = bx + 14;
    const barW = bw - 28;
    const barY = by + 40;
    const pct = clamp(e.health / e.maxHealth, 0, 1);
    ctx.fillStyle = "#16121a";
    ctx.fillRect(barX, barY, barW, 14);
    ctx.fillStyle = pct > 0.5 ? "#b0304a" : pct > 0.2 ? "#e0533f" : "#ff2d2d";
    ctx.fillRect(barX, barY, barW * pct, 14);

    // A tick where each phase begins, so the fight has visible landmarks.
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 1;
    for (const phase of spec.phases.slice(1)) {
      const px = barX + barW * phase.at;
      ctx.beginPath();
      ctx.moveTo(px + 0.5, barY);
      ctx.lineTo(px + 0.5, barY + 14);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, 13);

    ctx.font = `bold 10px ${MONO}`;
    ctx.fillStyle = "#fff";
    const phase = spec.phases[e.boss.phase]!;
    ctx.fillText(
      `${phase.name}  ·  ${Math.ceil(pct * 100)}%  ·  phase ${e.boss.phase + 1}/${spec.phases.length}`,
      w / 2, barY + 2,
    );

    // Cast bar, only while something is winding up.
    const label = d.bossCastLabel;
    if (label && e.boss.castTotal > 0) {
      const cy = by + bh + 6;
      const done = clamp(1 - e.boss.castTimer / e.boss.castTotal, 0, 1);
      ctx.fillStyle = "rgba(12,14,20,0.86)";
      ctx.fillRect(barX, cy, barW, 16);
      ctx.fillStyle = ELEMENT_COLORS[spec.element];
      ctx.globalAlpha = 0.75;
      ctx.fillRect(barX, cy, barW * done, 16);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.strokeRect(barX + 0.5, cy + 0.5, barW - 1, 15);
      ctx.fillStyle = "#fff";
      ctx.font = `bold 11px ${MONO}`;
      ctx.fillText(label.toUpperCase(), w / 2, cy + 3);
    }
    ctx.textAlign = "left";
  }

  /**
   * Elite frames (UAT §4): a distinct, rarity-coloured health bar per active elite,
   * stacked below where the boss frame would sit. Up to three — a fourth on screen is
   * already a different kind of problem.
   */
  private drawEliteBars(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, minY: number): void {
    const elites = d.enemies
      .filter((e) => e.elite && !e.summoned && e.state !== "spawning")
      .slice(0, 3);
    if (elites.length === 0) return;

    const bw = Math.min(380, w - 80);
    const bx = (w - bw) / 2;
    let by = Math.max(74, minY + 8);
    for (const e of elites) {
      const col = RARITY_COLORS[e.elite!];
      const bh = 34;
      panel(ctx, bx, by, bw, bh);
      ctx.textAlign = "left";
      ctx.font = `bold 10px ${MONO}`;
      ctx.fillStyle = col;
      ctx.fillText(e.name.toUpperCase(), bx + 12, by + 6);
      ctx.textAlign = "right";
      ctx.fillStyle = "#6b7480";
      ctx.fillText("ELITE", bx + bw - 12, by + 6);

      const barX = bx + 12;
      const barW = bw - 24;
      const barY = by + 20;
      const pct = clamp(e.health / e.maxHealth, 0, 1);
      ctx.fillStyle = "#16121a";
      ctx.fillRect(barX, barY, barW, 8);
      ctx.fillStyle = col;
      ctx.fillRect(barX, barY, barW * pct, 8);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, 7);
      by += bh + 6;
    }
    ctx.textAlign = "left";
  }

  /** Returns the lowest y it actually drew to, so the boss/elite frame below knows
   * where it's safe to start — see the call site's own comment for why that matters. */
  private drawFloorInfo(ctx: CanvasRenderingContext2D, d: Dungeon, w: number): number {
    ctx.textAlign = "center";
    const cx = w / 2;

    ctx.font = `bold 15px ${MONO}`;
    ctx.fillStyle = "#e8eef7";
    ctx.fillText(`DEPTH ${d.profile.depth} — ${d.profile.name}`, cx, 18);

    // Where in the war you are (UAT §23), and the layout name — the only clue that the
    // floor was generated. They share a line so the layer costs no vertical space and
    // `profile.tag` keeps its meaning: the tag is *which run*, the layer is *where*.
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = "#6b7480";
    ctx.fillText(`${d.profile.layer.name} · ${d.level.label}`.toUpperCase(), cx, 38);

    // Which run you're in, if it isn't the plain delve.
    let y = 54;
    if (d.profile.tag) {
      ctx.font = `bold 11px ${MONO}`;
      ctx.fillStyle = d.config.mode.color;
      ctx.fillText(d.profile.tag.toUpperCase(), cx, y);
      y += 18;
    }

    // The objective (UAT §5). The floor ends when this reads full, not when you reach
    // an exit, so it's the most important number on the screen after your own health.
    if (d.phase === "cleared") {
      ctx.font = `bold 12px ${MONO}`;
      ctx.fillStyle = "#7dd3fc";
      ctx.fillText("FLOOR CLEARED — completion portal open", cx, y);
      return y + 18;
    }
    if (d.profile.isBoss) {
      if (!d.profile.tag) {
        ctx.font = `11px ${MONO}`;
        ctx.fillStyle = "#9aa4b2";
        ctx.fillText("Kill it. That's the floor.", cx, 56);
        return 56 + 15;
      }
      return y;
    }
    ctx.font = `bold 12px ${MONO}`;
    ctx.fillStyle = "#e2e8f0";
    const kills = `Monsters ${Math.min(d.killsSoFar, d.killsRequired)}/${d.killsRequired}`;
    const elites = d.elitesRequired > 0
      ? `  ·  Elites ${Math.min(d.elitesKilled, d.elitesRequired)}/${d.elitesRequired}`
      : "";
    ctx.fillText(kills + elites, cx, y);
    y += 16;
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = "#6b7480";
    ctx.fillText(`WAVE ${Math.min(d.wave, d.profile.waves)} / ${d.profile.waves}`, cx, y);
    return y + 14;
  }

  /**
   * A schematic of the walkable grid, rasterised once per floor into an offscreen
   * canvas — the same grid `FlowField`/`resolveCircle` navigate on
   * (`game/level.ts`'s `GRID`, `Level.blocked`), so what the minimap shows is exactly
   * what a monster can and can't stand on, not an approximation of it.
   */
  private buildMinimapBackground(level: Level): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = level.cols;
    canvas.height = level.rows;
    const bgCtx = canvas.getContext("2d")!;
    const img = bgCtx.createImageData(level.cols, level.rows);
    for (let i = 0; i < level.cols * level.rows; i++) {
      const o = i * 4;
      if (level.blocked[i]) continue; // leave wall cells transparent
      img.data[o] = 58; img.data[o + 1] = 62; img.data[o + 2] = 76; img.data[o + 3] = 255;
    }
    bgCtx.putImageData(img, 0, 0);
    return canvas;
  }

  /**
   * Docket item 6: wayfinding (where the completion portal spawned, once it has) and
   * the low-monster-count indicator (§6's "some indicators when there is like 10 more
   * monsters left" — a threshold, not a permanent readout, so it stays off entirely
   * outside that window). Every field this reads — `d.level`, `d.completionPortal`,
   * `d.enemies` — is already on the client in co-op: the level regenerates identically
   * from the shared seed on every browser (`net/sync.ts`'s own header), and the
   * completion portal's position and every monster on the floor are already part of the
   * snapshot the client draws every frame regardless of this feature. No wire change.
   */
  private drawMinimap(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number): void {
    const level = d.level;
    if (this.minimapBgLevel !== level) {
      this.minimapBg = this.buildMinimapBackground(level);
      this.minimapBgLevel = level;
    }

    const mapW = 168, mapH = 168;
    const x = w - mapW - 18;
    const y = h - mapH - 24;
    panel(ctx, x - 4, y - 4, mapW + 8, mapH + 8);

    const scale = Math.min(mapW / level.cols, mapH / level.rows);
    const drawW = level.cols * scale, drawH = level.rows * scale;
    const ox = x + (mapW - drawW) / 2, oy = y + (mapH - drawH) / 2;
    const toMap = (wx: number, wy: number) => ({ x: ox + (wx / MAP_GRID) * scale, y: oy + (wy / MAP_GRID) * scale });

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (this.minimapBg) ctx.drawImage(this.minimapBg, ox, oy, drawW, drawH);

    // The entrance: always on, dim — it's never the way onward once the floor clears,
    // but it's still the early-exit escape hatch the whole time before that.
    const entrance = toMap(d.portal.x, d.portal.y);
    ctx.fillStyle = "rgba(251,191,36,0.65)";
    ctx.beginPath(); ctx.arc(entrance.x, entrance.y, 3, 0, Math.PI * 2); ctx.fill();

    // The completion portal, once it exists — the actual wayfinding ask: it spawns at a
    // fresh spot the instant the quota is met, and the player may be nowhere near it.
    if (d.completionPortal) {
      const cp = toMap(d.completionPortal.x, d.completionPortal.y);
      ctx.fillStyle = "#7dd3fc";
      ctx.beginPath(); ctx.arc(cp.x, cp.y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(125,211,252,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cp.x, cp.y, 8, 0, Math.PI * 2); ctx.stroke();
    }

    // The low-monster-count indicator: a threshold, not a permanent readout. Only the
    // wave director's own monsters count toward the objective (chaff and shards can't
    // hold it open), so the same filter applies here — a blip that doesn't count toward
    // the number above it would be a lie on the map.
    if (!d.profile.isBoss) {
      const remaining = Math.max(0, d.killsRequired - d.killsSoFar);
      if (remaining > 0 && remaining <= 10) {
        const pulse = 0.55 + 0.45 * Math.sin(d.elapsed * 6);
        for (const e of d.enemies) {
          if (e.boss || e.summoned || e.state === "spawning") continue;
          const p = toMap(e.x, e.y);
          ctx.fillStyle = `rgba(248,113,113,${pulse.toFixed(2)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // The player, always the brightest thing on it.
    const you = toMap(d.avatar.x, d.avatar.y);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(you.x, you.y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(you.x, you.y, 6, 0, Math.PI * 2); ctx.stroke();

    ctx.restore();
  }

  private drawLoot(ctx: CanvasRenderingContext2D, d: Dungeon, w: number): void {
    const x = w - 18;
    let y = 18;
    ctx.textAlign = "right";
    ctx.font = `11px ${MONO}`;

    ctx.fillStyle = "#6b7480";
    ctx.fillText("UNBANKED — lost if you die", x, y);
    y += 16;

    ctx.font = `bold 13px ${MONO}`;
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(`${formatNumber(d.loot.coins)} coins`, x, y);
    y += 18;

    if (d.loot.gems > 0) {
      ctx.font = `bold 12px ${MONO}`;
      ctx.fillStyle = "#f0abfc";
      ctx.fillText(`${formatNumber(d.loot.gems)} gems`, x, y);
      y += 17;
    }

    ctx.font = `11px ${MONO}`;
    const keyTotal = CHEST_TIERS.reduce((n, t) => n + d.loot.keys[t], 0);
    if (keyTotal > 0) {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(`${keyTotal} keys`, x, y);
      y += 15;
    }

    // Relics first — there are never many, and each is the reason you're still alive.
    for (const id of d.loot.relics) {
      const def = RELIC_BY_ID[id];
      if (!def) continue;
      ctx.fillStyle = RELIC_TIER_INFO[def.tier].color;
      ctx.fillText(`✦ ${def.name}`, x, y);
      y += 14;
    }
    // Show the last few pickups so a good drop is impossible to miss.
    const recent = d.loot.items.slice(-6).reverse();
    for (const item of recent) {
      ctx.fillStyle = RARITY_COLORS[item.rarity];
      ctx.fillText(item.name, x, y);
      y += 14;
    }
    if (d.loot.items.length > 6) {
      ctx.fillStyle = "#6b7480";
      ctx.fillText(`+${d.loot.items.length - 6} more`, x, y);
    }
  }

  /**
   * The optional stats overlay (Settings → "Combat stats", off by default). A build-
   * testing instrument, so every figure here is a direct read of something the
   * simulation already computed honestly, never a second guess:
   *
   * - DPS (5s) / DPS (avg), total damage, largest hit, damage taken and healing done all
   *   come straight off `Hero.combatStats` — the same accumulator `game/dungeon.ts`
   *   updates at the one place each of those numbers is actually resolved (see
   *   `game/combatStats.ts`'s header). Nothing here holds its own tally.
   * - Attack speed and move speed are read off `Player.attackCooldown` /
   *   `Player.moveMult` directly — the exact numbers the sim itself swings and walks
   *   by — rather than timed from the outside, which would be an approximation of a
   *   number the game already has exactly.
   *
   * Local hero only, on purpose: a "party DPS" that silently omitted remote heroes
   * would be a wrong number wearing a right label, and the figures a build-tester
   * actually wants are about the character they're playing.
   */
  private drawCombatStats(ctx: CanvasRenderingContext2D, d: Dungeon, h: number): void {
    const stats = d.localHero.combatStats;
    const p = d.localHero.player;
    // `formatNumber`'s K/M rounding is right for a coin counter and wrong here: this
    // readout exists to catch a small delta a tree respec made, and "12K" hides exactly
    // the digits that would show it. Full precision, comma-grouped.
    const exact = (n: number) => Math.round(n).toLocaleString("en-US");
    const rows: [string, string][] = [
      ["DPS (5s)", exact(stats.rollingDps(d.elapsed))],
      ["DPS (avg)", exact(stats.averageDps(d.elapsed))],
      ["Dmg dealt", exact(stats.totalDamageDealt)],
      ["Largest hit", exact(stats.largestHit)],
      ["Dmg taken", exact(stats.totalDamageTaken)],
      ["Healing done", exact(stats.totalHealingDone)],
      ["Attack speed", `${(1 / p.attackCooldown).toFixed(2)}/s`],
      ["Move speed", `${p.moveMult >= 1 ? "+" : ""}${Math.round((p.moveMult - 1) * 100)}%`],
    ];

    const x = 18;
    const panelW = 176;
    const rowH = 15;
    const panelH = rows.length * rowH + 26;
    const y = h - 24 - 12 - panelH;
    panel(ctx, x, y, panelW, panelH);

    ctx.textAlign = "left";
    ctx.font = `bold 11px ${MONO}`;
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText("COMBAT STATS", x + 10, y + 8);

    let ry = y + 28;
    for (const [label, value] of rows) {
      ctx.textAlign = "left";
      ctx.font = `10px ${MONO}`;
      ctx.fillStyle = "#9aa4b2";
      ctx.fillText(label, x + 10, ry);
      ctx.textAlign = "right";
      ctx.font = `bold 11px ${MONO}`;
      ctx.fillStyle = "#e8eef7";
      ctx.fillText(value, x + panelW - 10, ry);
      ry += rowH;
    }
    ctx.textAlign = "left";
  }

  private drawControls(ctx: CanvasRenderingContext2D, h: number, d: Dungeon): void {
    ctx.textAlign = "left";
    ctx.font = `10px ${MONO}`;
    let x = 18;
    const y = h - 24;
    for (const hint of combatHints(d.settings).slice(0, 6)) {
      ctx.fillStyle = "#e8eef7";
      ctx.fillText(hint.keys, x, y);
      const kw = ctx.measureText(hint.keys).width;
      ctx.fillStyle = "#6b7480";
      ctx.fillText(` ${hint.label}`, x + kw, y);
      x += kw + ctx.measureText(` ${hint.label}`).width + 16;
    }
  }

  /**
   * Shown whenever the floor is cleared or the player is standing on the portal.
   * The portal is a live exit for the whole floor, so bailing out mid-wave is always
   * an option the player can see.
   */
  /** Planet floors only: standing close enough to an unspent node to mine it. */
  private drawResourcePrompt(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number): void {
    const node = d.activeResourceNode;
    if (!node) return;
    const planet = d.config.planet!.spec;

    const bw = 320;
    const bh = 44;
    const bx = (w - bw) / 2;
    const by = h - bh - 108;

    panel(ctx, bx, by, bw, bh);
    ctx.textAlign = "center";
    ctx.font = `bold 13px ${MONO}`;
    ctx.fillStyle = ELEMENT_COLORS[planet.element];
    ctx.fillText(`[${k(d.settings, "confirm")}] Mine`, w / 2, by + 12);
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = "#9aa4b2";
    ctx.fillText(`Pays out ${MATERIAL_NAMES[planet.element]}`, w / 2, by + 28);
  }

  /**
   * The floor has two exits (UAT §6) and this panel is where the difference has to be
   * unmistakable: the **completion portal** takes you on with everything intact, and
   * the **entrance portal** is an escape hatch that charges a hefty toll for using it
   * before the floor is finished. The penalty is always spelled out before it happens.
   */
  private drawPortalPrompt(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number): void {
    const cleared = d.canDescend;
    const atExit = d.atCompletionPortal;
    const atEntrance = d.atPortal;
    if (!cleared && !atEntrance) return;

    const lines: { text: string; color: string }[] = [];
    let title = "PORTAL";
    let titleColor = "#4ade80";
    const confirmKey = k(d.settings, "confirm");
    const cancelKey = k(d.settings, "cancel");

    if (d.role === "client") {
      title = cleared ? "FLOOR CLEARED" : "PORTAL";
      titleColor = cleared ? "#7dd3fc" : "#4ade80";
      lines.push({ text: "The host calls it — descend or extract is their shout", color: "#9aa4b2" });
    } else if (atExit) {
      title = "COMPLETION PORTAL";
      titleColor = "#7dd3fc";
      if (d.isParty && d.partyAtCompletionPortal < d.partySize) {
        lines.push({
          text: `Waiting for the party — ${d.partyAtCompletionPortal}/${d.partySize} in the portal`,
          color: "#fbbf24",
        });
      } else {
        // In a rift the portal moves you along the run rather than one floor deeper,
        // and the last one banks the whole thing — the prompt has to say which.
        const rift = d.config.mode.isRift;
        lines.push({
          text: !rift
            ? `[${confirmKey}] Descend to depth ${d.profile.depth + 1}`
            : d.config.lastFloor
              ? `[${confirmKey}] Close the rift — banks everything`
              : `[${confirmKey}] Push on to floor ${d.config.floor + 1} of ${d.config.mode.floors}`,
          color: "#e8eef7",
        });
      }
      lines.push({ text: `[${cancelKey}] Extract and bank your loot`, color: "#4ade80" });
    } else if (cleared && atEntrance) {
      // The floor's done — this exit banks fine, it just doesn't go deeper.
      title = "THE WAY YOU CAME IN";
      titleColor = "#9aa4b2";
      lines.push({ text: `[${cancelKey}] Extract and bank your loot`, color: "#4ade80" });
      lines.push({ text: "The new portal is the one that takes you deeper", color: "#6b7480" });
    } else if (atEntrance) {
      // Still fighting. This is the penalty exit and it says so.
      title = "EARLY EXIT";
      titleColor = "#f87171";
      const items = d.loot.items.length;
      lines.push({
        text: items > 0
          ? `Leaving abandons all ${items} unbanked item${items === 1 ? "" : "s"}`
          : "Leaving abandons every item you pick up on the way",
        color: "#f87171",
      });
      lines.push({
        text: `You keep ${Math.round(EARLY_EXTRACT_KEEP * 100)}% of your coins and gems, and all your XP`,
        color: "#9aa4b2",
      });
      lines.push({ text: `[${cancelKey}] twice — bail out anyway`, color: "#fbbf24" });
    } else {
      // Cleared, standing nowhere near either portal.
      title = "FLOOR CLEARED";
      titleColor = "#7dd3fc";
      lines.push({ text: "A new portal opened somewhere on the floor — find it", color: "#9aa4b2" });
    }

    const bw = 500;
    const bh = 40 + lines.length * 24;
    const bx = (w - bw) / 2;
    const by = h - bh - 108;

    panel(ctx, bx, by, bw, bh);
    ctx.textAlign = "center";
    ctx.font = `bold 16px ${MONO}`;
    ctx.fillStyle = titleColor;
    ctx.fillText(title, w / 2, by + 14);

    ctx.font = `12px ${MONO}`;
    let y = by + 44;
    for (const line of lines) {
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, w / 2, y);
      y += 24;
    }
  }

  private drawPause(ctx: CanvasRenderingContext2D, w: number, h: number, d: Dungeon): void {
    drawPauseImpl(ctx, w, h, d);
  }

  private drawDeathPrompt(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number): void {
    ctx.fillStyle = "rgba(10,6,10,0.78)";
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";
    ctx.font = `bold 34px ${MONO}`;
    ctx.fillStyle = "#ef4444";
    ctx.fillText(d.isParty ? "THE PARTY FELL" : "YOU DIED", w / 2, h / 2 - 72);

    ctx.font = `13px ${MONO}`;
    ctx.fillStyle = "#9aa4b2";
    ctx.fillText(`Depth ${d.profile.depth} — ${d.loot.kills} kills`, w / 2, h / 2 - 24);
    ctx.fillStyle = "#ef4444";
    ctx.fillText(
      `Lost ${formatNumber(d.loot.coins)} coins, ${formatNumber(d.loot.gems)} gems and ${d.loot.items.length} items`,
      w / 2, h / 2,
    );
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText(`Kept ${formatNumber(d.loot.xp)} XP — experience is never lost`, w / 2, h / 2 + 24);

    ctx.font = `bold 14px ${MONO}`;
    ctx.fillStyle = "#e8eef7";
    // A client doesn't get to end the run on its own — the host's floor is the floor.
    ctx.fillText(
      d.role === "client"
        ? "Waiting for the host…"
        : `[${k(d.settings, "confirm")}] Return to town`,
      w / 2, h / 2 + 68,
    );
  }
}

/** Full control reference, so nobody has to remember what they bound. */
function drawPauseImpl(ctx: CanvasRenderingContext2D, w: number, h: number, d: Dungeon): void {
  ctx.fillStyle = "rgba(7,8,12,0.86)";
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "center";
  ctx.font = `bold 26px ${MONO}`;
  ctx.fillStyle = "#e8eef7";
  ctx.fillText("PAUSED", w / 2, h / 2 - 130);

  const rows = combatHints(d.settings);
  let y = h / 2 - 80;
  for (const hint of rows) {
    ctx.textAlign = "right";
    ctx.font = `bold 13px ${MONO}`;
    ctx.fillStyle = "#7dd3fc";
    ctx.fillText(hint.keys, w / 2 - 14, y);
    ctx.textAlign = "left";
    ctx.font = `13px ${MONO}`;
    ctx.fillStyle = "#9aa4b2";
    ctx.fillText(hint.label, w / 2 + 14, y);
    y += 24;
  }
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = "rgba(12,14,20,0.82)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
