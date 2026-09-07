import { combatHints, skillKeys } from "../core/input";
import { clamp, formatNumber } from "../core/math";
import { CHEST_TIERS } from "../data/chests";
import { ELEMENT_COLORS, STATUSES } from "../data/elements";
import { MATERIAL_NAMES } from "../data/materials";
import { RARITY_COLORS } from "../data/rarity";
import { DEFAULT_KEYBINDS, keyLabel, type RebindableAction, type Settings } from "../data/settings";
import { SKILLS } from "../data/skills";
import { REVIVE_TIME, type Dungeon } from "../game/dungeon";

/** Every prompt on screen reads the live binding, same rule as `combatHints`. */
function k(settings: Settings, action: RebindableAction): string {
  return keyLabel(settings.keybinds[action] ?? DEFAULT_KEYBINDS[action]);
}

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Screen-space overlay for a dive: vitals, floor progress, unbanked loot, prompts. */
export class Hud {
  draw(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number, paused = false): void {
    ctx.save();
    ctx.textBaseline = "top";

    this.drawVitals(ctx, d);
    if (d.isParty) this.drawParty(ctx, d);
    this.drawFloorInfo(ctx, d, w);
    this.drawLoot(ctx, d, w);
    this.drawSkills(ctx, d, w, h);
    this.drawControls(ctx, h, d);
    if (d.boss) this.drawBossFrame(ctx, d, w);

    if (d.phase !== "dead" && d.localHero.downed) this.drawDownedPrompt(ctx, w, h);
    if (d.phase !== "dead") this.drawPortalPrompt(ctx, d, w, h);
    if (d.phase !== "dead" && !d.canDescend && !d.atPortal) this.drawResourcePrompt(ctx, d, w, h);
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
      ctx.fillStyle = hero.downed ? "#ef4444" : pct > 0.35 ? "#4ade80" : "#fbbf24";
      ctx.fillRect(x, y + 12, w * (hero.downed ? hero.reviveProgress / REVIVE_TIME : pct), 8);

      ctx.font = `bold 11px ${MONO}`;
      ctx.fillStyle = hero.downed ? "#ef4444" : hero.player.heroClass.color;
      ctx.textAlign = "left";
      ctx.fillText(hero.name.toUpperCase(), x, y);
      ctx.font = `10px ${MONO}`;
      ctx.fillStyle = "#9aa4b2";
      ctx.textAlign = "right";
      ctx.fillText(hero.downed ? "DOWN — go get them" : `${Math.round(hero.player.health)}`, x + w, y);
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

    // Mana
    const manaPct = clamp(p.mana / Math.max(1, p.maxMana), 0, 1);
    ctx.fillStyle = "#1a1d26";
    ctx.fillRect(x, y + 22, w, 12);
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(x, y + 22, w * manaPct, 12);
    ctx.font = `bold 9px ${MONO}`;
    ctx.fillStyle = "#cfe0ff";
    ctx.fillText(`${Math.floor(p.mana)} / ${p.maxMana} mana`, x + w / 2, y + 24);

    // XP
    const xpPct = clamp(p.xp / p.xpNeeded, 0, 1);
    ctx.fillStyle = "#1a1d26";
    ctx.fillRect(x, y + 38, w, 7);
    ctx.fillStyle = "#7dd3fc";
    ctx.fillRect(x, y + 38, w * xpPct, 7);

    // Special charge
    ctx.fillStyle = "#1a1d26";
    ctx.fillRect(x, y + 49, w, 7);
    const charged = d.specialCharge >= 1;
    ctx.fillStyle = charged ? p.ultimate.color : "#a855f7";
    ctx.fillRect(x, y + 49, w * clamp(d.specialCharge, 0, 1), 7);

    ctx.textAlign = "left";
    ctx.font = `10px ${MONO}`;
    ctx.fillStyle = "#9aa4b2";
    ctx.fillText(`LV ${p.level} ${p.heroClass.name}`, x, y + 60);
    // The meter is named after the thing it fires, because every class fires a
    // different thing and the name is half the reason you picked it.
    const ult = p.ultimate;
    ctx.fillStyle = d.avatar.ultimate ? ult.color : charged ? "#ff1493" : "#9aa4b2";
    ctx.fillText(
      d.avatar.ultimate ? ult.name.toUpperCase() : charged ? `${ult.name.toUpperCase()}  [;]` : ult.name.toLowerCase(),
      x + 120, y + 60,
    );
    ctx.fillStyle = "#4ade80";
    ctx.fillText(`Potions ${"◆".repeat(Math.min(6, d.potionCount))} (${d.potionCount})  [L]`, x, y + 76);
    if (d.avatar.buffTimer > 0) {
      ctx.fillStyle = "#ff2d2d";
      ctx.fillText(`RAGE ${d.avatar.buffTimer.toFixed(1)}s`, x + 190, y + 76);
    }

    // Whatever is currently eating you.
    let bx = x;
    for (const s of d.playerStatuses) {
      const spec = STATUSES[s.kind];
      const label = `${spec.label}${s.stacks > 1 ? ` x${s.stacks}` : ""}`;
      ctx.font = `bold 9px ${MONO}`;
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(bx, y + 92, tw, 13);
      ctx.strokeStyle = ELEMENT_COLORS[spec.element];
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, y + 92.5, tw - 1, 12);
      ctx.fillStyle = ELEMENT_COLORS[spec.element];
      ctx.fillText(label, bx + 4, y + 95);
      bx += tw + 4;
    }
  }

  /**
   * The three equipped skills, on the keys around the attack finger. Cooldown darkens
   * the box from the bottom; unaffordable ones go grey. No mouse, ever.
   */
  private drawSkills(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number): void {
    // The fourth box only exists while a piece of gear is granting you a skill.
    const slots = d.player.activeSkills;
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
        const skill = SKILLS[id];
        const ready = d.canCast(i);
        const color = ELEMENT_COLORS[skill.element];

        if (cd > 0) {
          // Cooldown eats the box from the bottom up.
          const frac = clamp(cd / skill.cooldown, 0, 1);
          ctx.fillStyle = "rgba(0,0,0,0.62)";
          ctx.fillRect(x + 1, y + boxH - boxH * frac, boxW - 2, boxH * frac - 1);
        }

        ctx.textAlign = "left";
        ctx.font = `bold 10px ${MONO}`;
        ctx.fillStyle = ready ? color : "#5a6270";
        ctx.fillText(keys[i] ?? String(i + 1), x + 7, y + 6);

        ctx.font = `10px ${MONO}`;
        ctx.fillStyle = ready ? "#e8eef7" : "#6b7480";
        ctx.fillText(skill.name, x + 22, y + 6);

        ctx.font = `9px ${MONO}`;
        ctx.fillStyle = d.player.mana >= skill.manaCost ? "#60a5fa" : "#ef4444";
        ctx.fillText(`${skill.manaCost} mana`, x + 7, y + 22);

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
  private drawBossFrame(ctx: CanvasRenderingContext2D, d: Dungeon, w: number): void {
    const e = d.boss;
    if (!e || !e.boss) return;
    const spec = e.boss.spec;

    const bw = Math.min(620, w - 80);
    const bx = (w - bw) / 2;
    const by = 72;
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

  private drawFloorInfo(ctx: CanvasRenderingContext2D, d: Dungeon, w: number): void {
    ctx.textAlign = "center";
    const cx = w / 2;

    ctx.font = `bold 15px ${MONO}`;
    ctx.fillStyle = "#e8eef7";
    ctx.fillText(`DEPTH ${d.profile.depth} — ${d.profile.name}`, cx, 18);

    // The layout name is the only clue that the floor was generated, so it earns a line.
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = "#6b7480";
    ctx.fillText(d.level.label.toUpperCase(), cx, 38);

    // Which run you're in, if it isn't the plain delve.
    if (d.profile.tag) {
      ctx.font = `bold 11px ${MONO}`;
      ctx.fillStyle = d.config.mode.color;
      ctx.fillText(d.profile.tag.toUpperCase(), cx, 54);
    } else if (d.phase === "fighting" && !d.profile.isBoss) {
      ctx.fillStyle = "#9aa4b2";
      ctx.fillText(
        `Wave ${Math.min(d.wave, d.profile.waves)} / ${d.profile.waves}   •   ${d.enemiesRemaining} left`,
        cx, 56,
      );
    }
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

  private drawPortalPrompt(ctx: CanvasRenderingContext2D, d: Dungeon, w: number, h: number): void {
    const cleared = d.canDescend;
    const atPortal = d.atPortal;
    if (!cleared && !atPortal) return;

    const bw = 470;
    const bh = atPortal ? 108 : 74;
    const bx = (w - bw) / 2;
    const by = h - bh - 108;

    panel(ctx, bx, by, bw, bh);
    ctx.textAlign = "center";
    ctx.font = `bold 16px ${MONO}`;
    ctx.fillStyle = cleared ? "#7dd3fc" : "#4ade80";
    ctx.fillText(cleared ? "FLOOR CLEARED" : "PORTAL", w / 2, by + 14);

    ctx.font = `12px ${MONO}`;
    if (!atPortal) {
      ctx.fillStyle = "#9aa4b2";
      ctx.fillText("Step into the portal to descend or extract", w / 2, by + 44);
      return;
    }

    // In a rift the portal moves you along the run rather than one floor deeper, and
    // the last one banks the whole thing — the prompt has to say which.
    const rift = d.config.mode.isRift;
    let y = by + 44;
    if (d.role === "client") {
      ctx.fillStyle = "#9aa4b2";
      ctx.fillText("The host calls it — descend or extract is their shout", w / 2, y);
      return;
    }
    if (cleared && d.isParty && d.partyAtPortal < d.heroes.length) {
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`Waiting for the party — ${d.partyAtPortal}/${d.heroes.length} in the portal`, w / 2, y);
      y += 24;
      ctx.fillStyle = "#4ade80";
      ctx.fillText(`[${k(d.settings, "cancel")}] Extract now and bank everything`, w / 2, y);
      return;
    }
    if (cleared) {
      ctx.fillStyle = "#e8eef7";
      const confirmKey = k(d.settings, "confirm");
      const label = !rift
        ? `[${confirmKey}] Descend to depth ${d.profile.depth + 1}`
        : d.config.lastFloor
          ? `[${confirmKey}] Close the rift — banks everything`
          : `[${confirmKey}] Push on to floor ${d.config.floor + 1} of ${d.config.mode.floors}`;
      ctx.fillText(label, w / 2, y);
      y += 24;
    } else {
      ctx.fillStyle = "#6b7480";
      ctx.fillText(
        d.profile.isBoss ? "Kill it, then the portal opens" : "Clear every wave to unlock the descent",
        w / 2, y,
      );
      y += 24;
    }
    ctx.fillStyle = "#4ade80";
    ctx.fillText(`[${k(d.settings, "cancel")}] Extract and bank your loot`, w / 2, y);
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
