import { clamp, lerp, TAU } from "../core/math";
import { RARITY_COLORS } from "../data/rarity";
import type { Dungeon } from "../game/dungeon";
import type { Body, Enemy, Pickup } from "../game/entities";
import { Fx } from "./fx";
import { silhouette, sprite, tinted, type SpriteName } from "./sprites";

/** World units per sprite pixel. Sprites are authored small and blown up. */
const SPRITE_SCALE = 1.9;
/**
 * Screen pixels per world unit. Tuned so sprites read as chunky pixel art while most
 * of the arena still fits on screen — enemies you can't see aren't fun to dodge.
 */
export const ZOOM = 2.2;

const ENEMY_SPRITES: Record<string, SpriteName> = {
  grunt: "grunt", archer: "archer", brute: "brute",
  swarmer: "swarmer", caster: "caster", boss: "boss",
};

/** Interpolated position, so motion is smooth between fixed simulation ticks. */
function lerpPos(b: Body, alpha: number): { x: number; y: number } {
  return { x: lerp(b.px, b.x, alpha), y: lerp(b.py, b.y, alpha) };
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number, y: number,
  flip: boolean,
  scale = SPRITE_SCALE,
): void {
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  // Anchored at the feet so taller sprites stand on the same ground line.
  ctx.drawImage(canvas, -w / 2, -h + h * 0.22, w, h);
  ctx.restore();
}

export class WorldRenderer {
  private camX = 0;
  private camY = 0;
  private initialized = false;

  /** Draws the whole dungeon. `alpha` is the fixed-timestep interpolation factor. */
  render(
    ctx: CanvasRenderingContext2D,
    dungeon: Dungeon,
    fx: Fx,
    alpha: number,
    viewW: number,
    viewH: number,
  ): void {
    const hero = lerpPos(dungeon.avatar, alpha);
    const halfW = viewW / (2 * ZOOM);
    const halfH = viewH / (2 * ZOOM);

    // Follow the player, but stop at the arena edge so we never show the void.
    const targetX = clamp(hero.x, Math.min(halfW, dungeon.width / 2), Math.max(dungeon.width - halfW, dungeon.width / 2));
    const targetY = clamp(hero.y, Math.min(halfH, dungeon.height / 2), Math.max(dungeon.height - halfH, dungeon.height / 2));
    if (!this.initialized) {
      this.camX = targetX;
      this.camY = targetY;
      this.initialized = true;
    } else {
      // Slight camera lag reads as weight without feeling sluggish.
      this.camX = lerp(this.camX, targetX, 0.16);
      this.camY = lerp(this.camY, targetY, 0.16);
    }

    const shake = fx.shakeOffset();

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-this.camX + shake.x, -this.camY + shake.y);

    this.drawFloor(ctx, dungeon);
    this.drawPortal(ctx, dungeon);
    this.drawPickups(ctx, dungeon, alpha);
    this.drawActors(ctx, dungeon, alpha);
    this.drawProjectiles(ctx, dungeon, alpha);
    fx.draw(ctx);

    ctx.restore();
  }

  private drawFloor(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    const { width, height, profile } = d;

    ctx.fillStyle = profile.tint;
    ctx.fillRect(0, 0, width, height);

    // A coarse grid gives the eye something to judge speed and distance against.
    const cell = 48;
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= width; x += cell) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += cell) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Vignette-ish inner border so the arena bounds are unmistakable.
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, width - 10, height - 10);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);
  }

  private drawPortal(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    // Bright once the floor is cleared, dim but visibly active while fighting —
    // it's always a usable exit, so it must never look sealed.
    const open = d.canDescend;
    const { x, y } = d.portal;
    const t = d.elapsed;

    ctx.save();
    ctx.globalAlpha = open ? 1 : 0.22;
    for (let i = 0; i < 3; i++) {
      const r = 20 + i * 7 + Math.sin(t * 2 + i) * 3;
      ctx.strokeStyle = open ? "#7dd3fc" : "#4a7f9a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, t * (0.7 + i * 0.3), t * (0.7 + i * 0.3) + Math.PI * 1.35);
      ctx.stroke();
    }
    ctx.globalAlpha = open ? 0.28 : 0.14;
    ctx.fillStyle = "#7dd3fc";
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  private drawPickups(ctx: CanvasRenderingContext2D, d: Dungeon, alpha: number): void {
    for (const p of d.pickups) {
      const { x, y } = lerpPos(p, alpha);
      // Gentle bob so drops read as loose objects rather than floor decals.
      const bob = Math.sin((d.elapsed + p.life) * 6) * 2;
      const canvas = pickupSprite(p);
      ctx.save();
      if (p.rarity) {
        ctx.shadowColor = RARITY_COLORS[p.rarity];
        ctx.shadowBlur = 12;
      }
      drawSprite(ctx, canvas, x, y + bob, false, 1.4);
      ctx.restore();
    }
  }

  private drawActors(ctx: CanvasRenderingContext2D, d: Dungeon, alpha: number): void {
    const hero = lerpPos(d.avatar, alpha);

    // Painter's algorithm on the Y axis so nearer things overlap farther ones.
    const drawables: { y: number; draw: () => void }[] = [];

    for (const e of d.enemies) {
      const pos = lerpPos(e, alpha);
      drawables.push({ y: pos.y, draw: () => this.drawEnemy(ctx, e, pos.x, pos.y, d.elapsed) });
    }
    drawables.push({ y: hero.y, draw: () => this.drawHero(ctx, d, hero.x, hero.y) });
    drawables.sort((a, b) => a.y - b.y);

    for (const item of drawables) {
      shadow(ctx, item.y);
      item.draw();
    }
  }

  private drawHero(ctx: CanvasRenderingContext2D, d: Dungeon, x: number, y: number): void {
    const a = d.avatar;
    blob(ctx, x, y, 9);

    // A ring at the feet plus a pip in the facing direction. In a crowd of a dozen
    // sprites you must be able to find yourself instantly and see where a swing will go.
    ctx.save();
    ctx.strokeStyle = "rgba(125,211,252,0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 12, 5, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "rgba(125,211,252,0.95)";
    ctx.beginPath();
    ctx.arc(x + Math.cos(a.facing) * 17, y + 2 + Math.sin(a.facing) * 7, 2.6, 0, TAU);
    ctx.fill();
    ctx.restore();

    // The swing arc is drawn before the body so the blade reads as coming from the hand.
    if (a.swingTimer > 0 && !d.player.usesStaff) {
      const t = 1 - a.swingTimer / 0.13;
      ctx.save();
      ctx.globalAlpha = 0.85 * (1 - t);
      ctx.strokeStyle = "#e8f4ff";
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      const spread = Math.PI * 0.75;
      const from = a.swingAngle - spread / 2 + spread * t * 0.4;
      ctx.arc(x, y - 8, 42, from, from + spread * 0.8);
      ctx.stroke();
      ctx.restore();
    }

    const flip = Math.cos(a.facing) < 0;
    // Blink during i-frames so it's obvious when you're safe.
    const blinking = a.invulnTimer > 0 && Math.floor(d.elapsed * 22) % 2 === 0;
    ctx.save();
    if (a.dashTimer > 0) ctx.globalAlpha = 0.65;
    if (a.hitFlash > 0) {
      drawSprite(ctx, silhouette("hero", "#ff6b6b"), x, y, flip);
    } else if (blinking) {
      ctx.globalAlpha *= 0.45;
      drawSprite(ctx, sprite("hero"), x, y, flip);
    } else {
      drawSprite(ctx, sprite("hero"), x, y, flip);
    }
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, x: number, y: number, time: number): void {
    const name = ENEMY_SPRITES[e.archetype.kind] ?? "grunt";
    blob(ctx, x, y, e.radius);

    if (e.state === "spawning") {
      // Telegraph the spawn point so nothing appears without warning.
      const t = 1 - e.spawnTimer / 0.45;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#ff5c5c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, e.radius * (2.4 - t * 1.4), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = t * 0.6;
      drawSprite(ctx, sprite(name), x, y, false);
      ctx.restore();
      return;
    }

    const flip = Math.cos(e.facing) < 0;

    // Elite aura, in the rarity color that also determines its loot.
    if (e.elite) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(time * 4) * 0.1;
      ctx.strokeStyle = RARITY_COLORS[e.elite];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - e.radius * 0.5, e.radius * 1.6, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (e.hitFlash > 0) {
      drawSprite(ctx, silhouette(name), x, y, flip);
    } else if (e.windup > 0) {
      // Flash red while winding up — this is the player's cue to dash.
      drawSprite(ctx, silhouette(name, "#ff8a5c"), x, y, flip);
    } else if (e.elite) {
      drawSprite(ctx, tinted(name, RARITY_COLORS[e.elite], 0.35), x, y, flip);
    } else {
      drawSprite(ctx, sprite(name), x, y, flip);
    }

    if (e.health < e.maxHealth) {
      healthBar(ctx, x, y - e.radius * 2.6, e.health / e.maxHealth, e.archetype.kind === "boss" ? 44 : 26);
    }
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, d: Dungeon, alpha: number): void {
    for (const p of d.projectiles) {
      const { x, y } = lerpPos(p, alpha);
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.radius, 0, TAU);
      ctx.fill();
      // A short tail sells the direction of travel.
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(x - p.vx * 0.02, y - p.vy * 0.02, p.radius * 0.7, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Reset between floors so the camera snaps to the new arena. */
  reset(): void {
    this.initialized = false;
  }
}

function pickupSprite(p: Pickup): HTMLCanvasElement {
  switch (p.kind) {
    case "coin": return sprite("coin");
    case "key": return sprite("key");
    case "potion": return sprite("potion");
    case "item": return tinted("gem", p.rarity ? RARITY_COLORS[p.rarity] : "#ffffff", 0.95);
    default: return sprite("coin");
  }
}

/** Soft contact shadow, so sprites don't look like they're floating. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, r * 1.05, r * 0.45, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** No-op hook kept so the draw list stays uniform; shadows are drawn per-actor. */
function shadow(_ctx: CanvasRenderingContext2D, _y: number): void {}

function healthBar(ctx: CanvasRenderingContext2D, x: number, y: number, pct: number, width: number): void {
  const h = 4;
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, h + 2);
  ctx.fillStyle = pct > 0.5 ? "#4ade80" : pct > 0.22 ? "#fbbf24" : "#ef4444";
  ctx.fillRect(x - width / 2, y, width * clamp(pct, 0, 1), h);
}
