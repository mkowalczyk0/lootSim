import { clamp, lerp, TAU } from "../core/math";
import type { PropKind } from "../data/biomes";
import { RARITY_COLORS } from "../data/rarity";
import type { Dungeon } from "../game/dungeon";
import type { Body, Enemy, Pickup } from "../game/entities";
import type { Level, Trap } from "../game/level";
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

const PROP_SPRITES: Record<PropKind, SpriteName> = {
  torch: "torch", bones: "bones", mushroom: "mushroom", crystal: "crystal", rock: "rock",
};

export class WorldRenderer {
  private camX = 0;
  private camY = 0;
  private initialized = false;
  /** The floor is static for the life of a level, so it's painted once and blitted. */
  private floorCanvas: HTMLCanvasElement | null = null;
  private floorFor: Level | null = null;

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
    this.drawTraps(ctx, dungeon);
    this.drawWalls(ctx, dungeon.level);
    this.drawProps(ctx, dungeon.level);
    this.drawPortal(ctx, dungeon);
    this.drawPickups(ctx, dungeon, alpha);
    this.drawActors(ctx, dungeon, alpha);
    this.drawProjectiles(ctx, dungeon, alpha);
    fx.draw(ctx);

    ctx.restore();
  }

  private drawFloor(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    if (this.floorFor !== d.level || !this.floorCanvas) {
      this.floorCanvas = bakeFloor(d.level);
      this.floorFor = d.level;
    }
    const floor = this.floorCanvas;
    if (floor) ctx.drawImage(floor, 0, 0);
  }

  /** Solid blocks, drawn with a face and a shadow so they read as things you can't cross. */
  private drawWalls(ctx: CanvasRenderingContext2D, level: Level): void {
    const { wall, wallSide } = level.biome;
    for (const w of level.walls) {
      ctx.fillStyle = "rgba(0,0,0,0.38)";
      ctx.fillRect(w.x + 4, w.y + 6, w.w, w.h);
      ctx.fillStyle = wallSide;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = wall;
      ctx.fillRect(w.x, w.y, w.w, Math.max(4, w.h - 7));
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(w.x, w.y, w.w, 2);
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
    }
  }

  private drawProps(ctx: CanvasRenderingContext2D, level: Level): void {
    for (const p of level.props) {
      const name = PROP_SPRITES[p.kind];
      // Crystals and rubble take the biome's colors; the rest are authored as-is.
      const canvas =
        p.kind === "crystal" ? tinted(name, level.biome.accent, 0.5)
        : p.kind === "rock" ? tinted(name, level.biome.wall, 0.65)
        : sprite(name);
      ctx.save();
      ctx.globalAlpha = 0.9;
      if (p.kind === "torch") {
        ctx.shadowColor = "#ff8a3c";
        ctx.shadowBlur = 14;
      }
      drawSprite(ctx, canvas, p.x, p.y, false, 1.25 * p.scale);
      ctx.restore();
    }
  }

  private drawTraps(ctx: CanvasRenderingContext2D, d: Dungeon): void {
    for (const t of d.level.traps) drawTrap(ctx, t, d.elapsed);
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

/**
 * Paints the floor of a level once into an offscreen canvas: base color, a scatter of
 * darker tiles for texture, and the arena border. It never changes during a run, so
 * there's no reason to redraw a few hundred rectangles every frame.
 */
function bakeFloor(level: Level): HTMLCanvasElement {
  const { width, height, biome } = level;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = biome.tint;
  ctx.fillRect(0, 0, width, height);

  // Deterministic from the level seed, so a floor always looks like itself.
  let hash = level.seed >>> 0;
  const rand = () => {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return hash / 4294967296;
  };

  const cell = 24;
  ctx.fillStyle = biome.floorAlt;
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      if (rand() < 0.22) ctx.fillRect(x, y, cell, cell);
    }
  }

  // Scratches and grit, so the tiling doesn't read as a checkerboard.
  ctx.strokeStyle = "rgba(0,0,0,0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < Math.floor(width / 6); i++) {
    const x = rand() * width;
    const y = rand() * height;
    const len = 6 + rand() * 16;
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rand() - 0.5) * 4);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.beginPath();
  for (let x = 0; x <= width; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
  for (let y = 0; y <= height; y += 48) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
  ctx.stroke();

  // Border, so the arena bounds are unmistakable.
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, width - 10, height - 10);
  ctx.strokeStyle = biome.wall;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);
  return canvas;
}

/**
 * Hazards are drawn procedurally rather than as sprites because their whole job is to
 * telegraph: the player has to be able to read "about to fire" at a glance, across a
 * crowded room, without learning an icon.
 */
function drawTrap(ctx: CanvasRenderingContext2D, t: Trap, time: number): void {
  const { x, y, radius } = t;
  ctx.save();
  switch (t.kind) {
    case "spike": {
      ctx.fillStyle = "rgba(10,10,14,0.55)";
      ctx.beginPath();
      ctx.ellipse(x, y, radius, radius * 0.62, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = t.state === "idle" ? "rgba(180,180,200,0.25)" : "#ff5c5c";
      ctx.lineWidth = t.state === "idle" ? 1 : 2;
      ctx.stroke();
      if (t.state === "warn") {
        // Pulse faster as the plate is about to fire.
        ctx.globalAlpha = 0.35 + Math.sin(time * 26) * 0.25;
        ctx.fillStyle = "#ff5c5c";
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (t.state === "active") {
        ctx.fillStyle = "#dde5ef";
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + 0.3;
          const px = x + Math.cos(a) * radius * 0.55;
          const py = y + Math.sin(a) * radius * 0.34;
          ctx.beginPath();
          ctx.moveTo(px - 3, py + 3);
          ctx.lineTo(px, py - 9);
          ctx.lineTo(px + 3, py + 3);
          ctx.closePath();
          ctx.fill();
        }
      }
      break;
    }
    case "flame": {
      ctx.fillStyle = "rgba(8,6,4,0.6)";
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 0.55, radius * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = t.state === "idle" ? "rgba(251,146,60,0.3)" : "#fb923c";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (t.state === "warn") {
        ctx.globalAlpha = 0.4 + Math.sin(time * 30) * 0.3;
        ctx.fillStyle = "#fb923c";
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.4, 0, TAU);
        ctx.fill();
      }
      if (t.state === "active") {
        for (let i = 3; i >= 1; i--) {
          ctx.globalAlpha = 0.28 * i;
          ctx.fillStyle = i === 1 ? "#fff3c4" : i === 2 ? "#ffb020" : "#ff5c1a";
          ctx.beginPath();
          ctx.arc(x, y, radius * (i / 3) * (0.9 + Math.sin(time * 18 + i) * 0.1), 0, TAU);
          ctx.fill();
        }
      }
      break;
    }
    case "saw": {
      // The track first, so it's obvious where the blade is going to be next.
      ctx.strokeStyle = "rgba(226,232,240,0.16)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t.ax, t.ay);
      ctx.lineTo(t.bx, t.by);
      ctx.stroke();

      ctx.translate(x, y);
      ctx.rotate(t.spin);
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const b = a + TAU / 16;
        ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
        ctx.lineTo(Math.cos(b) * radius * 0.62, Math.sin(b) * radius * 0.62);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#64748b";
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.3, 0, TAU);
      ctx.fill();
      break;
    }
    case "turret": {
      ctx.fillStyle = "#1f2430";
      ctx.fillRect(x - radius * 0.7, y - radius, radius * 1.4, radius * 1.8);
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - radius * 0.7, y - radius, radius * 1.4, radius * 1.8);
      const hot = t.state === "warn" ? 0.5 + Math.sin(time * 30) * 0.5 : t.state === "active" ? 1 : 0.25;
      ctx.globalAlpha = 0.35 + hot * 0.65;
      ctx.fillStyle = "#fca5a5";
      ctx.beginPath();
      ctx.arc(x + Math.cos(t.angle) * radius * 0.5, y + Math.sin(t.angle) * radius * 0.4, 3.4, 0, TAU);
      ctx.fill();
      break;
    }
    case "mire": {
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = "#141018";
      ctx.beginPath();
      ctx.ellipse(x, y, radius, radius * 0.66, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#4ade80";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Lazy bubbles, so a pool doesn't look like a hole in the floor.
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#4ade80";
      for (let i = 0; i < 3; i++) {
        const p = (time * 0.5 + i * 0.37) % 1;
        ctx.beginPath();
        ctx.arc(x + Math.sin(i * 2.1 + time * 0.6) * radius * 0.45, y + (0.4 - p) * radius * 0.5, 2 + p * 2, 0, TAU);
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
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
