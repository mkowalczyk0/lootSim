import { clamp, TAU } from "../core/math";
import { fxRng } from "../core/rng";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
  gravity: number;
}

interface FloatingText {
  x: number; y: number; vy: number;
  life: number; maxLife: number;
  text: string; color: string; size: number;
}

interface Ring {
  x: number; y: number; radius: number; maxRadius: number;
  life: number; maxLife: number; color: string; width: number;
}

/**
 * Purely cosmetic: particles, damage numbers, expanding rings and screen shake.
 * Nothing here feeds back into the simulation, so it's safe to skip or scale down.
 */
export class Fx {
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private rings: Ring[] = [];
  private shake = 0;
  /** Hard cap so a huge wave death can't tank the framerate. */
  private static MAX_PARTICLES = 600;

  burst(x: number, y: number, color: string, count = 10, speed = 140): void {
    const room = Fx.MAX_PARTICLES - this.particles.length;
    const n = Math.min(count, Math.max(0, room));
    for (let i = 0; i < n; i++) {
      const a = fxRng.angle();
      const s = fxRng.range(speed * 0.3, speed);
      const life = fxRng.range(0.25, 0.6);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, maxLife: life,
        size: fxRng.range(1.5, 3.5),
        color, gravity: 0,
      });
    }
  }

  /** Slower, drifting motes — used for portals and ambient dust. */
  drift(x: number, y: number, color: string, count = 4): void {
    this.burst(x, y, color, count, 34);
  }

  text(x: number, y: number, text: string, color: string, size = 12): void {
    this.texts.push({
      x: x + fxRng.range(-5, 5), y,
      vy: -38, life: 0.85, maxLife: 0.85,
      text, color, size,
    });
  }

  ring(x: number, y: number, maxRadius: number, color: string, width = 3): void {
    this.rings.push({ x, y, radius: 4, maxRadius, life: 0.45, maxLife: 0.45, color, width });
  }

  addShake(amount: number): void {
    this.shake = Math.min(24, this.shake + amount);
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 42);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      // Drag, so bursts decelerate into a puff instead of flying off-screen.
      p.vx *= 1 - 3.2 * dt;
      p.vy *= 1 - 3.2 * dt;
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]!;
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.y += t.vy * dt;
      t.vy *= 1 - 2.4 * dt;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      const t = 1 - r.life / r.maxLife;
      r.radius = 4 + (r.maxRadius - 4) * easeOut(t);
    }
  }

  /** Camera offset from screen shake, in world units. */
  shakeOffset(): { x: number; y: number } {
    if (this.shake <= 0) return { x: 0, y: 0 };
    return {
      x: fxRng.range(-this.shake, this.shake),
      y: fxRng.range(-this.shake, this.shake),
    };
  }

  /** Draws world-space effects. Call with the camera transform already applied. */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const r of this.rings) {
      const alpha = clamp(r.life / r.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, TAU);
      ctx.stroke();
    }

    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of this.texts) {
      const life = clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = life;
      ctx.font = `bold ${t.size}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.particles.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.shake = 0;
  }
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
