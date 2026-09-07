import { clamp, TAU } from "../core/math";
import { fxRng } from "../core/rng";
import type { AuraKind } from "../data/cosmetics";

/**
 * Purely cosmetic: particles, damage numbers, slashes, impact stars and screen shake.
 * Nothing here feeds back into the simulation, so it's safe to skip or scale down.
 *
 * The vocabulary is deliberately anime rather than "grey puff": a hit throws a
 * four-pointed star, a swing leaves a tapering crescent behind the blade, and the motes
 * come in petals, embers and snow so a cosmetic aura has something to be made of.
 */

/** How a mote is drawn. The shape is chosen at spawn and never changes. */
type Shape = "square" | "star" | "petal" | "bubble" | "snow" | "shard";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
  gravity: number; shape: Shape; rot: number; spin: number;
  /** Sideways drift, which is what makes a petal fall like a petal. */
  sway: number;
  drag: number;
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

/** A weapon arc. Drawn as a crescent that sweeps forward and thins as it dies. */
interface Slash {
  x: number; y: number; angle: number; arc: number;
  inner: number; outer: number;
  life: number; maxLife: number; color: string;
  /** A thrust is a lance rather than a crescent; the shape of the weapon decides. */
  thrust: boolean;
}

/** The four-pointed flash on a landed hit. Cheap, and it sells every impact. */
interface Star {
  x: number; y: number; size: number; rot: number;
  life: number; maxLife: number; color: string;
}

export class Fx {
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private rings: Ring[] = [];
  private slashes: Slash[] = [];
  private stars: Star[] = [];
  private shake = 0;
  /** Cosmetic switches from the settings menu. Both default on. */
  private shakeEnabled = true;
  private textEnabled = true;
  /** Hard cap so a huge wave death can't tank the framerate. */
  private static MAX_PARTICLES = 700;

  /**
   * Applied at the gate rather than at every call site, so a new effect can never
   * forget to honour the setting.
   */
  setOptions(opts: { screenShake: boolean; damageNumbers: boolean }): void {
    this.shakeEnabled = opts.screenShake;
    this.textEnabled = opts.damageNumbers;
    if (!this.shakeEnabled) this.shake = 0;
    if (!this.textEnabled) this.texts.length = 0;
  }

  private push(p: Particle): void {
    if (this.particles.length >= Fx.MAX_PARTICLES) return;
    this.particles.push(p);
  }

  burst(x: number, y: number, color: string, count = 10, speed = 140, shape: Shape = "square"): void {
    const room = Fx.MAX_PARTICLES - this.particles.length;
    const n = Math.min(count, Math.max(0, room));
    for (let i = 0; i < n; i++) {
      const a = fxRng.angle();
      const s = fxRng.range(speed * 0.3, speed);
      const life = fxRng.range(0.25, 0.6);
      this.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, maxLife: life,
        size: fxRng.range(1.5, 3.5),
        color, gravity: 0, shape,
        rot: fxRng.angle(), spin: fxRng.range(-6, 6), sway: 0, drag: 3.2,
      });
    }
  }

  /** A burst of four-pointed sparkles. The "something good happened" effect. */
  sparkle(x: number, y: number, color: string, count = 8, speed = 110): void {
    const room = Fx.MAX_PARTICLES - this.particles.length;
    const n = Math.min(count, Math.max(0, room));
    for (let i = 0; i < n; i++) {
      const a = fxRng.angle();
      const s = fxRng.range(speed * 0.2, speed);
      const life = fxRng.range(0.35, 0.85);
      this.push({
        x: x + fxRng.range(-4, 4), y: y + fxRng.range(-4, 4),
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20,
        life, maxLife: life,
        size: fxRng.range(2.5, 5.5),
        color, gravity: 0, shape: "star",
        rot: fxRng.angle(), spin: fxRng.range(-3, 3), sway: 0, drag: 2.6,
      });
    }
  }

  /** Slower, drifting motes — used for portals and ambient dust. */
  drift(x: number, y: number, color: string, count = 4): void {
    this.burst(x, y, color, count, 34);
  }

  /**
   * One mote of a cosmetic aura. Called a few times a second while you walk around, so
   * it has to stay cheap; the whole effect is a slow fall plus a sway.
   */
  aura(x: number, y: number, kind: AuraKind, color: string): void {
    const spec: Record<AuraKind, { shape: Shape; vy: number; size: number; life: number; sway: number; gravity: number }> = {
      petal: { shape: "petal", vy: 26, size: 3.4, life: 1.9, sway: 34, gravity: 10 },
      ember: { shape: "star", vy: -34, size: 2.6, life: 1.1, sway: 18, gravity: -18 },
      star: { shape: "star", vy: -12, size: 4.0, life: 1.5, sway: 12, gravity: 0 },
      bubble: { shape: "bubble", vy: -30, size: 4.2, life: 1.8, sway: 22, gravity: -8 },
      snow: { shape: "snow", vy: 22, size: 2.4, life: 2.2, sway: 26, gravity: 6 },
      void: { shape: "shard", vy: -8, size: 3.6, life: 1.4, sway: 8, gravity: 0 },
    };
    const s = spec[kind];
    this.push({
      x: x + fxRng.range(-13, 13), y: y + fxRng.range(-22, 2),
      vx: fxRng.range(-10, 10), vy: s.vy,
      life: s.life, maxLife: s.life,
      size: s.size * fxRng.range(0.75, 1.25),
      color, gravity: s.gravity, shape: s.shape,
      rot: fxRng.angle(), spin: fxRng.range(-2.5, 2.5), sway: s.sway, drag: 0.4,
    });
  }

  text(x: number, y: number, text: string, color: string, size = 12): void {
    if (!this.textEnabled) return;
    this.texts.push({
      x: x + fxRng.range(-5, 5), y,
      vy: -38, life: 0.85, maxLife: 0.85,
      text, color, size,
    });
  }

  ring(x: number, y: number, maxRadius: number, color: string, width = 3): void {
    this.rings.push({ x, y, radius: 4, maxRadius, life: 0.45, maxLife: 0.45, color, width });
  }

  /**
   * The trail behind a weapon. `inner`/`outer` are the radii the crescent spans, which
   * is how a dagger flick and a great-axe cleave come out of the same call.
   */
  slash(
    x: number, y: number, angle: number, arc: number,
    inner: number, outer: number, color: string, thrust = false,
  ): void {
    this.slashes.push({
      x, y, angle, arc, inner, outer,
      life: 0.22, maxLife: 0.22, color, thrust,
    });
  }

  /** A four-pointed flash where something got hit. */
  star(x: number, y: number, size: number, color: string): void {
    this.stars.push({
      x, y, size, rot: fxRng.range(-0.4, 0.4),
      life: 0.18, maxLife: 0.18, color,
    });
  }

  addShake(amount: number): void {
    if (!this.shakeEnabled) return;
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
      p.rot += p.spin * dt;
      // Sway is applied as a position offset rather than a velocity so a petal keeps
      // falling at a steady rate while it wanders.
      if (p.sway !== 0) p.x += Math.sin(p.life * 3.4 + p.rot) * p.sway * dt;
      const drag = 1 - p.drag * dt;
      p.vx *= drag;
      p.vy *= drag;
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

    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i]!;
      s.life -= dt;
      if (s.life <= 0) this.slashes.splice(i, 1);
    }

    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i]!;
      s.life -= dt;
      if (s.life <= 0) this.stars.splice(i, 1);
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

    for (const s of this.slashes) drawSlash(ctx, s);
    for (const p of this.particles) drawParticle(ctx, p);
    for (const s of this.stars) drawStar(ctx, s);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of this.texts) {
      const life = clamp(t.life / t.maxLife, 0, 1);
      ctx.globalAlpha = life;
      // A brief overshoot on spawn, so a big number lands like a big number.
      const pop = 1 + 0.35 * Math.max(0, (life - 0.75) / 0.25);
      ctx.font = `bold ${Math.round(t.size * pop)}px ui-monospace, "SF Mono", Menlo, monospace`;
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
    this.slashes.length = 0;
    this.stars.length = 0;
    this.shake = 0;
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  const life = clamp(p.life / p.maxLife, 0, 1);
  ctx.globalAlpha = life;
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;

  switch (p.shape) {
    case "square":
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      break;
    case "star": {
      // Two tapering spokes crossed: the classic pixel sparkle, and it stays legible
      // at one or two pixels where a drawn star would turn to mush.
      const r = p.size * (0.4 + life * 0.6);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.moveTo(-r, 0); ctx.lineTo(0, -r * 0.34); ctx.lineTo(r, 0); ctx.lineTo(0, r * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.34, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.34, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case "petal": {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "bubble":
      ctx.globalAlpha = life * 0.7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = life * 0.25;
      ctx.fill();
      break;
    case "snow":
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.5, 0, TAU);
      ctx.fill();
      break;
    case "shard": {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.lineTo(p.size * 0.45, 0);
      ctx.lineTo(0, p.size);
      ctx.lineTo(-p.size * 0.45, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * A crescent that thins and fades as it dies, with a white core along the outer edge.
 * The core is what makes it read as a blade rather than a coloured smear.
 */
function drawSlash(ctx: CanvasRenderingContext2D, s: Slash): void {
  const t = 1 - s.life / s.maxLife;
  const alpha = (1 - t) * 0.9;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.angle);
  ctx.globalAlpha = alpha;

  if (s.thrust) {
    // A lance: widest at the hand, tapering to a point at full reach.
    const reach = s.inner + (s.outer - s.inner) * (0.55 + t * 0.45);
    const half = 5 * (1 - t * 0.6);
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.moveTo(s.inner, -half);
    ctx.lineTo(reach, 0);
    ctx.lineTo(s.inner, half);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s.inner, 0);
    ctx.lineTo(reach, 0);
    ctx.stroke();
  } else {
    // The arc sweeps forward through its own width as it fades, which is what gives a
    // swing a direction rather than just a shape.
    const spread = Math.min(s.arc, TAU - 0.01);
    const from = -spread / 2 + spread * t * 0.35;
    const to = from + spread * (0.85 - t * 0.2);
    const inner = s.inner + (s.outer - s.inner) * (0.15 + t * 0.35);
    const outer = s.outer * (0.9 + t * 0.14);

    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(0, 0, outer, from, to);
    ctx.arc(0, 0, inner, to, from, true);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 * (1 - t * 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, outer, from, to);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** The impact flash: a hard four-pointed star with a white centre. */
function drawStar(ctx: CanvasRenderingContext2D, s: Star): void {
  const t = 1 - s.life / s.maxLife;
  const r = s.size * (0.5 + t * 0.9);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  ctx.globalAlpha = 1 - t;
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.moveTo(-r, 0); ctx.lineTo(0, -r * 0.28); ctx.lineTo(r, 0); ctx.lineTo(0, r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(r * 0.28, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.28, 0);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = (1 - t) * 0.9;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
